/** TypeScript 代码解析器 */

import { Member, ClassInfo, Relation, ParsedData } from './types';

declare const ts: any;

function getModifier(node: any): '+' | '-' | '#' {
  const flags = ts.getCombinedModifierFlags(node);
  if (flags & ts.ModifierFlags.Private) return '-';
  if (flags & ts.ModifierFlags.Protected) return '#';
  return '+';
}

function getReturnType(sig: any, sf: any): string {
  if (!sig.type) return '';
  return sig.type.getText(sf);
}

function cleanTypeName(typeText: string): string {
  if (!typeText) return '';
  let name = typeText.replace(/<[^>]+>/g, '').trim();
  name = name.replace(/\[\]$/, '').trim();
  if (name.includes('|')) {
    const parts = name.split('|').map((s: string) => s.trim());
    const nonNull = parts.filter((p: string) => p !== 'null' && p !== 'undefined' && p !== 'void');
    if (nonNull.length === 1) name = nonNull[0];
  }
  return name;
}

function isArrayType(typeText: string): boolean {
  return typeText.includes('[]');
}

function isOptionalType(typeText: string): boolean {
  return typeText.includes('?') || typeText.includes('null') || typeText.includes('undefined');
}

function getMultiplicity(typeText: string): string {
  if (isArrayType(typeText)) return '*';
  if (isOptionalType(typeText)) return '0..1';
  return '1';
}

const BASIC_TYPES = new Set([
  'string', 'number', 'boolean', 'any', 'void', 'never', 'unknown', 'object',
  'Symbol', 'BigInt', 'Date', 'RegExp', 'Error', 'Promise', 'Array',
  'Map', 'Set', 'WeakMap', 'WeakSet', 'ReadonlyArray', 'ReadonlyMap', 'ReadonlySet',
  'Record', 'Partial', 'Required', 'Readonly', 'Pick', 'Omit', 'Exclude', 'Extract',
  'NonNullable', 'ReturnType', 'InstanceType', 'Parameters', 'ConstructorParameters'
]);

function isUserType(typeName: string, knownTypes: Set<string>): boolean {
  if (!typeName) return false;
  if (BASIC_TYPES.has(typeName)) return false;
  if (typeName.startsWith('typeof ') || typeName.startsWith('keyof ') || typeName.startsWith('import(')) return false;
  return knownTypes.has(typeName);
}

export function parseCode(code: string): ParsedData {
  const sf = ts.createSourceFile('input.ts', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const classes: ClassInfo[] = [];
  const relations: Relation[] = [];
  const knownTypes = new Set<string>();

  // 第一遍：收集所有类型名称（排除类型别名）
  ts.forEachChild(sf, (node: any) => {
    if (ts.isInterfaceDeclaration(node) || ts.isClassDeclaration(node) || ts.isEnumDeclaration(node)) {
      if (node.name) knownTypes.add(node.name.text);
    }
  });

  // 第二遍：解析类/接口和关系
  ts.forEachChild(sf, (node: any) => {
    if (ts.isInterfaceDeclaration(node)) {
      const members: Member[] = [];
      
      node.members.forEach((m: any) => {
        if (ts.isPropertySignature(m)) {
          const opt = m.questionToken ? '?' : '';
          members.push({
            kind: 'property',
            modifier: '+',
            name: m.name.getText(sf) + opt,
            type: m.type?.getText(sf) || ''
          });
        } else if (ts.isMethodSignature(m)) {
          const params = m.parameters.map((p: any) => p.getText(sf)).join(', ');
          members.push({
            kind: 'method',
            modifier: '+',
            name: m.name.getText(sf),
            type: getReturnType(m, sf),
            params
          });
        }
      });

      // 接口继承
      if (node.heritageClauses) {
        node.heritageClauses.forEach((h: any) => {
          if (h.token === ts.SyntaxKind.ExtendsKeyword) {
            h.types.forEach((t: any) => {
              const parentName = t.expression.text;
              if (parentName && knownTypes.has(parentName)) {
                relations.push({ from: node.name.text, to: parentName, type: 'extends' });
              }
            });
          }
        });
      }

      // 检测接口属性的关联关系
      members.forEach(m => {
        if (m.kind === 'property') {
          const typeName = cleanTypeName(m.type);
          if (typeName && isUserType(typeName, knownTypes) && typeName !== node.name.text) {
            // 检查这个类型是否已存在于类/接口列表中
            const targetExists = classes.some(c => c.name === typeName);
            if (targetExists) {
              relations.push({
                from: node.name.text,
                to: typeName,
                type: 'association',
                toMultiplicity: getMultiplicity(m.type)
              });
            }
          }
        }
      });

      classes.push({
        name: node.name.text,
        isInterface: true,
        isAbstract: false,
        members
      });
    }
    else if (ts.isClassDeclaration(node) && node.name) {
      const members: Member[] = [];
      const isAbstract = !!(ts.getCombinedModifierFlags(node) & ts.ModifierFlags.Abstract);
      
      // 收集构造函数参数名
      const constructorParamNames = new Set<string>();
      // 收集在构造函数中通过 this.xxx = new YYY() 创建的属性
      const composedTypes = new Map<string, string>(); // propertyName -> typeName

      node.members.forEach((m: any) => {
        const mod = getModifier(m);
        
        if (ts.isPropertyDeclaration(m)) {
          const opt = m.questionToken ? '?' : '';
          const isStatic = !!(ts.getCombinedModifierFlags(m) & ts.ModifierFlags.Static);
          const prefix = isStatic ? '{static} ' : '';
          
          let typeStr = m.type?.getText(sf) || '';
          if (!typeStr && m.initializer) {
            const initText = m.initializer.getText(sf);
            if (initText.startsWith('new ')) {
              // new Set<keyof Settings>() -> Set<keyof Settings>
              typeStr = initText.replace(/^new\s+/, '').replace(/\([^)]*\)$/, '');
              // 记录这是组合关系
              composedTypes.set(m.name.getText(sf), cleanTypeName(typeStr));
            } else if (initText === 'null') {
              typeStr = 'null';
            } else if (initText === 'undefined') {
              typeStr = 'undefined';
            } else if (initText.match(/^['"`]/)) {
              typeStr = 'string';
            } else if (initText.match(/^\d/)) {
              typeStr = 'number';
            } else if (initText === 'true' || initText === 'false') {
              typeStr = 'boolean';
            } else if (initText.startsWith('[')) {
              typeStr = 'Array';
            } else if (initText.startsWith('{')) {
              typeStr = 'object';
            }
          }
          
          members.push({
            kind: 'property',
            modifier: mod,
            name: prefix + m.name.getText(sf) + opt,
            type: typeStr
          });
        } else if (ts.isConstructorDeclaration(m)) {
          const params = m.parameters.map((p: any) => {
            const paramName = p.name.getText(sf);
            constructorParamNames.add(paramName);
            return p.getText(sf);
          }).join(', ');
          members.push({
            kind: 'method',
            modifier: '+',
            name: 'constructor',
            type: '',
            params
          });
        } else if (ts.isMethodDeclaration(m)) {
          const params = m.parameters.map((p: any) => p.getText(sf)).join(', ');
          const isStatic = !!(ts.getCombinedModifierFlags(m) & ts.ModifierFlags.Static);
          const prefix = isStatic ? '{static} ' : '';
          members.push({
            kind: 'method',
            modifier: mod,
            name: prefix + m.name.getText(sf),
            type: getReturnType(m, sf),
            params
          });
        } else if (ts.isGetAccessorDeclaration(m) || ts.isSetAccessorDeclaration(m)) {
          members.push({
            kind: 'method',
            modifier: mod,
            name: (ts.isGetAccessorDeclaration(m) ? 'get ' : 'set ') + m.name.getText(sf),
            type: getReturnType(m, sf),
            params: ''
          });
        }
      });

      // 继承/实现
      if (node.heritageClauses) {
        node.heritageClauses.forEach((h: any) => {
          const type = h.token === ts.SyntaxKind.ExtendsKeyword ? 'extends' : 'implements';
          h.types.forEach((t: any) => {
            const targetName = t.expression.text;
            if (targetName && knownTypes.has(targetName)) {
              relations.push({ from: node.name.text, to: targetName, type });
            }
          });
        });
      }

      // 检测组合/聚合关系 - 合并重复的目标类型
      const aggregationMap = new Map<string, { type: 'composition' | 'aggregation', fields: string[], multiplicity: string }>();
      
      members.forEach(m => {
        if (m.kind === 'property') {
          if (m.name.startsWith('{static}')) return;
          
          const typeName = cleanTypeName(m.type);
          if (!typeName || !isUserType(typeName, knownTypes) || typeName === node.name.text) return;
          
          // 跳过类型别名
          if (typeName === 'SettingsPaths') return;
          
          // 判断是组合还是聚合
          let relType: 'composition' | 'aggregation' = 'aggregation';
          
          if (composedTypes.has(m.name.replace(/[?].*$/, ''))) {
            relType = 'composition';
          } else {
            const targetInfo = classes.find(c => c.name === typeName);
            if (targetInfo && !targetInfo.isInterface) {
              relType = 'aggregation';
            }
          }
          
          // 合并相同目标类型的关系
          const baseFieldName = m.name.replace(/[?].*$/, '').replace('{static} ', '');
          if (aggregationMap.has(typeName)) {
            const existing = aggregationMap.get(typeName)!;
            existing.fields.push(baseFieldName);
            if (m.type?.includes('[]')) {
              existing.multiplicity = '*';
            }
          } else {
            aggregationMap.set(typeName, {
              type: relType,
              fields: [baseFieldName],
              multiplicity: getMultiplicity(m.type)
            });
          }
        }
      });
      
      // 生成合并后的关系
      aggregationMap.forEach((info, typeName) => {
        relations.push({
          from: node.name.text,
          to: typeName,
          type: info.type,
          toMultiplicity: info.multiplicity,
          label: info.fields.length > 1 ? info.fields.join(', ') : undefined
        });
      });

      // 检测依赖关系 - 仅存在于函数参数中的类型
      const propertyTypes = new Set<string>();
      members.forEach(m => {
        if (m.kind === 'property') {
          const typeName = cleanTypeName(m.type);
          if (typeName && isUserType(typeName, knownTypes)) {
            propertyTypes.add(typeName);
          }
        }
      });

      const dependencyTypes = new Set<string>();
      node.members.forEach((m: any) => {
        if (ts.isMethodDeclaration(m) || ts.isConstructorDeclaration(m)) {
          m.parameters.forEach((p: any) => {
            const paramType = p.type?.getText(sf) || '';
            const typeName = cleanTypeName(paramType);
            if (typeName && isUserType(typeName, knownTypes) && typeName !== node.name.text && !propertyTypes.has(typeName)) {
              dependencyTypes.add(typeName);
            }
          });
        }
      });

      dependencyTypes.forEach(typeName => {
        // 检查是否已经有相同目标的关系
        const existingRel = relations.find(r => r.from === node.name.text && r.to === typeName);
        if (!existingRel) {
          relations.push({
            from: node.name.text,
            to: typeName,
            type: 'dependency'
          });
        }
      });

      classes.push({
        name: node.name.text,
        isInterface: false,
        isAbstract,
        members
      });
    }
  });

  return { classes, relations };
}