/** 多文件合并解析（跨文件类型感知 + 语义解析） */

import { collectTypeInfo, extractTypeNames, parseCodeWithKnownTypes } from './parser';
import { resolveTypes } from './resolver';
import { ParsedData, ClassInfo, Relation } from './types';

export interface SourceFile {
  name: string;   // 包名（通常为文件名去扩展名）
  content: string;
}

/** 仅用于模块解析的配置文件（如 package.json）：不进入图表，只用来解析 workspace 包名 */
export interface ConfigFile {
  name: string;
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

interface Target { pkg: string; name: string; }

/** 一次引用解析的结果：确定的 targets + 真正的「歧义候选」（仅当无法判定时非空） */
interface Resolution {
  targets: Target[];
  ambiguous: string[];
}

/** 别名链的循环保护 */
const MAX_ALIAS_DEPTH = 8;

function dedupeTargets(targets: Target[]): Target[] {
  const seen = new Set<string>();
  return targets.filter(t => {
    const key = `${t.pkg}\u0000${t.name}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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
  configs: ConfigFile[] = [],
): ParsedFiles {
  const fail = (name: string, message: string) => {
    if (!report || report.failures.some(f => f.name === name)) return;
    report.failures.push({ name, message });
  };

  // 语义解析（best-effort，失败时返回空映射，后面会回退）
  const resolution = resolveTypes(files, configs);

  // 第一步：收集所有文件的类型名称、类型别名、import 绑定名
  const allTypeNames = new Set<string>();
  const aliasesByPackage = new Map<string, Map<string, string>>();
  files.forEach(f => {
    try {
      const info = collectTypeInfo(f.content, f.name);
      info.types.forEach(t => allTypeNames.add(t));
      // 重命名导入（import { A as B }）的本地名也要算作“已知类型”，
      // 否则语法解析阶段会直接把它当外部类型丢掉，轮不到语义解析
      info.imports.forEach(n => allTypeNames.add(n));
      // 类型别名的名字也算“已知类型”：这样引用它的地方会先产出该目标，
      // 再由 resolve 在「别名定义所在包」的作用域里展开
      info.aliases.forEach((_text, name) => allTypeNames.add(name));
      if (info.aliases.size > 0) aliasesByPackage.set(f.name, info.aliases);
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
      const parsed = parseCodeWithKnownTypes(f.content, allTypeNames, f.name);
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

  // 类型别名的全局归属（用于“无 import 但全局唯一”时的兜底）
  const aliasOwners = new Map<string, string[]>();
  aliasesByPackage.forEach((table, pkg) => {
    table.forEach((_text, name) => {
      const list = aliasOwners.get(name);
      if (list) {
        if (!list.includes(pkg)) list.push(pkg);
      } else {
        aliasOwners.set(name, [pkg]);
      }
    });
  });

  // 第四步：给重名类分配唯一身份 + 把关系端点解析到确切的包
  //
  // 解析一个名字（scopePkg = 在哪里看到这个名字）的优先级：
  //   A. 本包的类型别名 -> 在别名所在包的作用域里展开
  //   B. import 绑定（语义）-> 指向类型别名则在其定义处展开，否则命中该类
  //   C. 本包声明的类
  //   D. 全局唯一的类
  //   E. 类型别名（全局唯一或多候选）-> 在各自定义处展开
  //   F. 类的多候选 -> 真正的歧义，返回全部候选并由调用方上报
  //
  // 关键点：别名展开后的名字必须回到「别名定义所在包」的作用域解析，
  // 否则它们会在引用文件里找不到声明，被误判为歧义。
  const combine = (parts: Resolution[]): Resolution => {
    const targets = dedupeTargets(parts.flatMap(p => p.targets));
    const ambiguous = [...new Set(parts.flatMap(p => p.ambiguous))];
    return { targets, ambiguous };
  };

  const resolve = (scopePkg: string, name: string, depth = 0): Resolution => {
    const canExpand = depth < MAX_ALIAS_DEPTH;
    /** 在 aliasPkg 的作用域里展开一段别名右值 */
    const expandIn = (aliasPkg: string, text: string): Resolution =>
      combine(extractTypeNames(text).map(member => resolve(aliasPkg, member, depth + 1)));

    const localAlias = aliasesByPackage.get(scopePkg)?.get(name);
    if (localAlias !== undefined && canExpand) return expandIn(scopePkg, localAlias);

    const sem = resolution.byFile.get(scopePkg)?.get(name);
    if (sem && sem.pkg) {
      const aliasText = aliasesByPackage.get(sem.pkg)?.get(sem.name);
      if (aliasText !== undefined && canExpand) return expandIn(sem.pkg, aliasText);
      if (namesInPackage.get(sem.pkg)?.has(sem.name)) {
        return { targets: [{ pkg: sem.pkg, name: sem.name }], ambiguous: [] };
      }
    }

    if (namesInPackage.get(scopePkg)?.has(name)) {
      return { targets: [{ pkg: scopePkg, name }], ambiguous: [] };
    }

    const classPkgs = packagesByName.get(name) || [];
    if (classPkgs.length === 1) return { targets: [{ pkg: classPkgs[0], name }], ambiguous: [] };

    if (classPkgs.length === 0) {
      const owners = aliasOwners.get(name) || [];
      if (owners.length > 0 && canExpand) {
        return combine(owners.map(owner => expandIn(owner, aliasesByPackage.get(owner)!.get(name)!)));
      }
      return { targets: [], ambiguous: [] };
    }

    return { targets: classPkgs.map(p => ({ pkg: p, name })), ambiguous: classPkgs };
  };

  // 第五步：套用解析结果
  results.forEach((parsed, pkg) => {
    parsed.classes.forEach(c => {
      if (duplicatedNames.has(c.name)) {
        c.displayName = `${c.name} (${pkg})`;
        c.name = identityOf(pkg, c.name, duplicatedNames);
      }
    });

    const resolvedRelations: Relation[] = [];
    parsed.relations.forEach(r => {
      const res = resolve(pkg, r.to);
      if (res.targets.length === 0) return; // 悬空引用，保持现状（不产生关系）
      const from = identityOf(pkg, r.from, duplicatedNames);
      res.targets.forEach(t => {
        resolvedRelations.push({ ...r, from, to: identityOf(t.pkg, t.name, duplicatedNames) });
      });
      // 只有“真的无法判定”才上报；别名展开出多个成员不算歧义
      if (res.ambiguous.length > 0) {
        report?.ambiguous.push({ file: pkg, from: r.from, to: r.to, candidates: res.ambiguous });
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
