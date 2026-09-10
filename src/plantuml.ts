/** PlantUML 文本格式化（从 main.ts 提取，便于单元测试） */

import { Member, Relation, ParsedData } from './types';

/** 格式化成员 */
export function formatMember(m: Member): string {
  const staticStr = m.isStatic ? '{static} ' : '';
  const abstractStr = m.isAbstract ? '{abstract} ' : '';

  if (m.kind === 'property') {
    // 枚举值：type 为 "= 值" 形式（PlantUML 枚举成员语法：NAME = 值）
    if (m.type.startsWith('= ')) {
      return `${staticStr}${abstractStr}${m.modifier} ${m.name} ${m.type}`;
    }
    return `${staticStr}${abstractStr}${m.modifier} ${m.name}${m.type ? ' : ' + m.type : ''}`;
  }
  if (m.name === 'constructor') {
    return `${m.modifier} constructor(${m.params || ''})`;
  }
  return `${staticStr}${abstractStr}${m.modifier} ${m.name}(${m.params || ''})${m.type ? ' : ' + m.type : ''}`;
}

/** 格式化关系 */
export function formatRelation(r: Relation): string {
  let arrow = '';
  switch (r.type) {
    case 'extends': arrow = '--|>'; break;
    case 'implements': arrow = '..|>'; break;
    case 'aggregation': arrow = 'o--'; break;
    case 'composition': arrow = '*--'; break;
    case 'dependency': arrow = '..>'; break;
    case 'association':
    default: arrow = '-->';
  }

  const fromMult = r.fromMultiplicity && r.fromMultiplicity !== '1' ? ` "${r.fromMultiplicity}"` : '';
  const toMult = r.toMultiplicity && r.toMultiplicity !== '1' ? ` "${r.toMultiplicity}"` : '';

  let relStr = `${r.from}${fromMult} ${arrow}${toMult} ${r.to}`;
  if (r.label && ['association', 'aggregation', 'composition'].includes(r.type)) {
    relStr += ` : ${r.label}`;
  }
  return relStr;
}

/** 格式化单个文件的 PlantUML */
export function formatParsed(parsed: ParsedData, packageName?: string): string {
  let text = '@startuml\n\n';
  text += 'skinparam classAttributeIconSize 0\n';
  text += 'skinparam shadowing false\n\n';

  if (packageName) {
    text += `package "${packageName}" {\n`;
  }

  parsed.classes.forEach(c => {
    const indent = packageName ? '  ' : '';
    if (c.isEnum) {
      text += `${indent}enum "${c.name}" as ${c.name} {\n`;
    } else if (c.isInterface) {
      text += `${indent}interface "${c.name}" as ${c.name} {\n`;
    } else if (c.isAbstract) {
      text += `${indent}abstract class "${c.name}" as ${c.name} {\n`;
    } else {
      text += `${indent}class "${c.name}" as ${c.name} {\n`;
    }

    const props = c.members.filter(m => m.kind === 'property');
    const meths = c.members.filter(m => m.kind === 'method');

    props.forEach(m => { text += `${indent}  ${formatMember(m)}\n`; });
    if (props.length && meths.length) { text += `${indent}  --\n`; }
    meths.forEach(m => { text += `${indent}  ${formatMember(m)}\n`; });

    text += `${indent}}\n\n`;
  });

  if (packageName) {
    text += '}\n\n';
  }

  parsed.relations.forEach(r => {
    text += formatRelation(r) + '\n';
  });

  return text + '\n@enduml';
}

/** 格式化合并的 PlantUML（按包分组） */
export function formatMergedPlantUML(allParsed: Map<string, ParsedData>, classPackageMap: Map<string, string>): string {
  let text = '@startuml\n\n';
  text += 'skinparam classAttributeIconSize 0\n';
  text += 'skinparam shadowing false\n';
  text += 'skinparam packageStyle rectangle\n\n';

  // 收集所有关系
  const allRelations: Relation[] = [];
  allParsed.forEach(parsed => {
    allRelations.push(...parsed.relations);
  });

  // 去重关系
  const uniqueRelations: Relation[] = [];
  const relationKeys = new Set<string>();
  allRelations.forEach(r => {
    const key = `${r.from}-${r.type}-${r.to}`;
    if (!relationKeys.has(key)) {
      relationKeys.add(key);
      uniqueRelations.push(r);
    }
  });

  // 按包输出类
  allParsed.forEach((parsed, packageName) => {
    text += `package "${packageName}" {\n`;

    parsed.classes.forEach(c => {
      // 跨文件同名类只输出一次：PlantUML 中 as 别名必须全局唯一，
      // 否则会出现重复声明导致渲染歧义
      if (classPackageMap.size > 0 && classPackageMap.get(c.name) !== packageName) {
        return;
      }

      if (c.isEnum) {
        text += `  enum "${c.name}" as ${c.name} {\n`;
      } else if (c.isInterface) {
        text += `  interface "${c.name}" as ${c.name} {\n`;
      } else if (c.isAbstract) {
        text += `  abstract class "${c.name}" as ${c.name} {\n`;
      } else {
        text += `  class "${c.name}" as ${c.name} {\n`;
      }

      const props = c.members.filter(m => m.kind === 'property');
      const meths = c.members.filter(m => m.kind === 'method');

      props.forEach(m => { text += `    ${formatMember(m)}\n`; });
      if (props.length && meths.length) { text += '    --\n'; }
      meths.forEach(m => { text += `    ${formatMember(m)}\n`; });

      text += '  }\n';
    });

    text += '}\n\n';
  });

  // 输出所有关系
  text += "' 关系\n";
  uniqueRelations.forEach(r => {
    text += formatRelation(r) + '\n';
  });

  return text + '\n@enduml';
}
