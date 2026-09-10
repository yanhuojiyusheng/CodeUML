/** 多文件合并解析（跨文件类型感知） */

import { parseCode, parseCodeWithKnownTypes } from './parser';
import { ParsedData, ClassInfo, Relation } from './types';

export interface SourceFile {
  name: string;   // 包名（通常为文件名去扩展名）
  content: string;
}

/**
 * 跨文件类型感知解析：
 * 1) 先收集所有文件中声明的类型名；
 * 2) 再用完整的类型集合重新解析每个文件，使跨文件引用能产生关系。
 * 同名文件会被合并到同一个包（类按名称去重，关系追加），避免后者覆盖前者。
 */
export function parseFilesWithCrossFileTypes(files: SourceFile[]): Map<string, ParsedData> {
  // 第一步：收集所有文件的类型名称
  const allTypeNames = new Set<string>();
  files.forEach(f => {
    try {
      parseCode(f.content).classes.forEach(c => allTypeNames.add(c.name));
    } catch (e) {
      // 忽略解析错误，继续收集
    }
  });

  // 第二步：使用合并的类型集合重新解析每个文件
  const results = new Map<string, ParsedData>();
  files.forEach(f => {
    try {
      const parsed = parseCodeWithKnownTypes(f.content, allTypeNames);
      parsed.classes.forEach(c => {
        c.packageName = f.name;
      });

      const existing = results.get(f.name);
      if (existing) {
        // 同名文件（同名包）：合并类（同名去重）与关系
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
    }
  });

  return results;
}

/**
 * 合并多个包的解析结果。
 * 类去重：同名类以首次出现的包为准（PlantUML 中 as 别名必须全局唯一）；
 * 关系去重：按 from-type-to 去重，保留首次出现的标签。
 */
export function mergeParsedData(allParsed: Map<string, ParsedData>): {
  merged: ParsedData;
  classPackageMap: Map<string, string>;
} {
  const allClasses: ClassInfo[] = [];
  const allRelations: Relation[] = [];
  const classPackageMap = new Map<string, string>();

  allParsed.forEach((parsed, packageName) => {
    parsed.classes.forEach(c => {
      if (!classPackageMap.has(c.name)) {
        classPackageMap.set(c.name, packageName);
        allClasses.push(c);
      }
    });
    allRelations.push(...parsed.relations);
  });

  const uniqueRelations: Relation[] = [];
  const relationKeys = new Set<string>();
  allRelations.forEach(r => {
    const key = `${r.from}-${r.type}-${r.to}`;
    if (!relationKeys.has(key)) {
      relationKeys.add(key);
      uniqueRelations.push(r);
    }
  });

  return { merged: { classes: allClasses, relations: uniqueRelations }, classPackageMap };
}
