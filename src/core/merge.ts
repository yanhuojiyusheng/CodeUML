/** 多文件合并解析（跨文件类型感知 + 语义解析） */

import { collectTypeInfo, parseCodeWithKnownTypes } from './parser';
import { resolveTypes } from './resolver';
import { ParsedData, ClassInfo, Relation } from './types';

export interface SourceFile {
  name: string;   // 包名（通常为文件名去扩展名）
  content: string;
}

/** 解析过程的上报信息（传入对象才会被写入，不传则完全不影响原有行为） */
export interface ParseReport {
  /** 解析失败的文件：语法错误 + 解析异常（每文件至多一条） */
  failures: { name: string; message: string }[];
  /** 跨包同名类（已按包区分身份，这里只是告知用户） */
  duplicates: { name: string; packages: string[] }[];
  /** 无法确定目标的引用（没提供 import），已连接到全部候选。file 是出现该引用的文件 */
  ambiguous: { file: string; from: string; to: string; candidates: string[] }[];
}

/** 解析结果：每个包的类与关系（类名在重名时已加包限定，全局唯一） */
export type ParsedFiles = Map<string, ParsedData>;

/** 重名时用「包名#类名」作为唯一身份 */
function identityOf(pkg: string, name: string, duplicated: ReadonlySet<string>): string {
  return duplicated.has(name) ? `${pkg}#${name}` : name;
}

/**
 * 解析引用目标。优先级：
 *   1) 语义解析（import / 同文件 / 全局唯一）—— 最准确，且能处理重命名导入
 *   2) 本包内同名声明
 *   3) 全局唯一
 *   4) 仍歧义 -> 返回全部候选（由调用方叠加关系并上报）
 */
function resolveTargets(
  pkg: string,
  name: string,
  namesInPackage: ReadonlyMap<string, ReadonlySet<string>>,
  packagesByName: ReadonlyMap<string, string[]>,
  semantic: ReadonlyMap<string, { pkg: string; name: string }> | undefined,
): { pkg: string; name: string }[] {
  const sem = semantic?.get(name);
  if (sem && sem.pkg && namesInPackage.get(sem.pkg)?.has(sem.name)) return [sem];
  if (namesInPackage.get(pkg)?.has(name)) return [{ pkg, name }];
  const all = packagesByName.get(name) || [];
  if (all.length === 0) return [];
  if (all.length === 1) return [{ pkg: all[0], name }];
  return all.map(p => ({ pkg: p, name }));
}

/**
 * 跨文件类型感知解析：
 * 1) 先收集所有文件中声明的类型名与类型别名；
 * 2) 用完整的类型集合重新解析每个文件，使跨文件引用能产生关系；
 * 3) 用 TypeScript 的语义分析把关系端点解析到确切的包，重名类按包区分身份。
 * report：可选，用来收集解析失败 / 重名 / 歧义引用（供界面提示）。
 */
export function parseFilesWithCrossFileTypes(
  files: SourceFile[],
  report?: ParseReport,
): ParsedFiles {
  const fail = (name: string, message: string) => {
    if (!report || report.failures.some(f => f.name === name)) return;
    report.failures.push({ name, message });
  };

  // 语义解析（best-effort，失败时返回空映射，后面会回退）
  const resolution = resolveTypes(files);

  // 第一步：收集所有文件的类型名称与类型别名
  const allTypeNames = new Set<string>();
  const allAliases = new Map<string, string>();
  files.forEach(f => {
    try {
      const info = collectTypeInfo(f.content, f.name);
      info.types.forEach(t => allTypeNames.add(t));
      // 重命名导入（import { A as B }）的本地名也要算作“已知类型”，
      // 否则语法解析阶段会直接把它当外部类型丢掉，轮不到语义解析
      info.imports.forEach(n => allTypeNames.add(n));
      info.aliases.forEach((target, name) => allAliases.set(name, target));
      if (info.errors.length > 0) {
        const hint = info.errors.length > 1 ? `${info.errors[0]}（共 ${info.errors.length} 处语法错误）` : info.errors[0];
        fail(f.name, hint);
      }
    } catch (e) {
      // 单个文件解析失败不影响其它文件，但要让用户知道
      fail(f.name, e instanceof Error ? e.message : String(e));
    }
  });

  // 第二步：使用合并的类型集合重新解析每个文件
  const results: ParsedFiles = new Map();
  files.forEach(f => {
    try {
      const parsed = parseCodeWithKnownTypes(f.content, allTypeNames, f.name, allAliases);
      parsed.classes.forEach(c => {
        c.packageName = f.name;
      });

      const existing = results.get(f.name);
      if (existing) {
        // 同一包名出现多次（同名文件）：合并类（同名去重）与关系
        const known = new Set(existing.classes.map(c => c.name));
        parsed.classes.forEach(c => {
          if (!known.has(c.name)) {
            known.add(c.name);
            existing.classes.push(c);
          }
        });
        existing.relations.push(...parsed.relations);
      } else {
        results.set(f.name, parsed);
      }
    } catch (e) {
      console.error(`Error parsing ${f.name}:`, e);
      fail(f.name, e instanceof Error ? e.message : String(e));
    }
  });

  // 第三步：统计重名 + 建立「包 -> 本包类名」索引
  const packagesByName = new Map<string, string[]>();
  const namesInPackage = new Map<string, Set<string>>();
  results.forEach((parsed, pkg) => {
    const local = new Set<string>();
    parsed.classes.forEach(c => {
      local.add(c.name);
      const list = packagesByName.get(c.name);
      if (list) {
        if (!list.includes(pkg)) list.push(pkg);
      } else {
        packagesByName.set(c.name, [pkg]);
      }
    });
    namesInPackage.set(pkg, local);
  });

  const duplicatedNames = new Set<string>();
  packagesByName.forEach((packages, name) => {
    if (packages.length > 1) {
      duplicatedNames.add(name);
      report?.duplicates.push({ name, packages: [...packages] });
    }
  });

  // 第四步：给重名类分配唯一身份 + 把关系端点解析到确切的包
  results.forEach((parsed, pkg) => {
    parsed.classes.forEach(c => {
      if (duplicatedNames.has(c.name)) {
        c.displayName = `${c.name} (${pkg})`;
        c.name = identityOf(pkg, c.name, duplicatedNames);
      }
    });

    const semantic = resolution.byFile.get(pkg);
    const resolvedRelations: Relation[] = [];

    parsed.relations.forEach(r => {
      const targets = resolveTargets(pkg, r.to, namesInPackage, packagesByName, semantic);
      if (targets.length === 0) return; // 悬空引用，保持现状（不产生关系）
      const from = identityOf(pkg, r.from, duplicatedNames);
      targets.forEach(t => {
        resolvedRelations.push({ ...r, from, to: identityOf(t.pkg, t.name, duplicatedNames) });
      });
      if (targets.length > 1) {
        report?.ambiguous.push({ file: pkg, from: r.from, to: r.to, candidates: targets.map(t => t.pkg) });
      }
    });

    parsed.relations = resolvedRelations;
  });

  return results;
}

/**
 * 合并多个包的解析结果。
 * 类：身份已在 parseFilesWithCrossFileTypes 里唯一化，这里直接汇总；
 * 关系：按 from-type-to 去重（分隔符用 NUL，避免包名里的 '-' 造成误合并）。
 */
export function mergeParsedData(allParsed: ParsedFiles): {
  merged: ParsedData;
  classPackageMap: Map<string, string>;
} {
  const allClasses: ClassInfo[] = [];
  const allRelations: Relation[] = [];
  const classPackageMap = new Map<string, string>();

  allParsed.forEach((parsed, packageName) => {
    parsed.classes.forEach(c => {
      classPackageMap.set(c.name, packageName);
      allClasses.push(c);
    });
    allRelations.push(...parsed.relations);
  });

  const uniqueRelations: Relation[] = [];
  const relationKeys = new Set<string>();
  allRelations.forEach(r => {
    const key = `${r.from}\u0000${r.type}\u0000${r.to}`;
    if (!relationKeys.has(key)) {
      relationKeys.add(key);
      uniqueRelations.push(r);
    }
  });

  return { merged: { classes: allClasses, relations: uniqueRelations }, classPackageMap };
}
