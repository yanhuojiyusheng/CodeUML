/** TypeScript 代码解析器 */

import { Member, ClassInfo, Relation, ParsedData } from './types';

// 兼容浏览器和 Node.js 环境
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

// 清理类型文本，提取用户类型名列表
function cleanTypeName(typeText: string): string {
  if (!typeText) return '';
  let name = typeText.trim();
  
  // 处理数组形式：Foo[] 或 Array<Foo>
  if (name.endsWith('[]')) {
    return cleanTypeName(name.slice(0, -2));
  }
  if (name.startsWith('Array<') && name.endsWith('>')) {
    return cleanTypeName(name.slice(6, -1));
  }
  if (name.startsWith('ReadonlyArray<') && name.endsWith('>')) {
    return cleanTypeName(name.slice(14, -1));
  }
  
  // 处理 Promise<T>
  if (name.startsWith('Promise<') && name.endsWith('>')) {
    return cleanTypeName(name.slice(8, -1));
  }
  
  // 处理 Record<K, V> -> 返回 V（值类型）
  if (name.startsWith('Record<') && name.endsWith('>')) {
    const inner = name.slice(7, -1);
    const commaIdx = inner.lastIndexOf(',');
    if (commaIdx >= 0) {
      return cleanTypeName(inner.slice(commaIdx + 1));
    }
    return cleanTypeName(inner);
  }
  
  // 处理 Set<T>
  if (name.startsWith('Set<') && name.endsWith('>')) {
    return cleanTypeName(name.slice(4, -1));
  }
  if (name.startsWith('WeakSet<') && name.endsWith('>')) {
    return cleanTypeName(name.slice(8, -1));
  }
  
  // 处理 Map<K, V> -> 返回 K 和 V（用逗号分隔）
  if (name.startsWith('Map<') && name.endsWith('>')) {
    const inner = name.slice(4, -1);
    const parts = splitGenericParams(inner);
    return parts.map(p => cleanTypeName(p)).filter(Boolean).join(', ');
  }
  
  // 处理工具类型：Partial<T>, Required<T>, Readonly<T>, Pick<T, K>, Omit<T, K> 等
  const utilityTypes = ['Partial', 'Required', 'Readonly', 'Pick', 'Omit', 'Exclude', 'Extract', 'NonNullable'];
  for (const util of utilityTypes) {
    if (name.startsWith(util + '<') && name.endsWith('>')) {
      const inner = name.slice(util.length + 1, -1);
      const firstParam = splitGenericParams(inner)[0];
      return cleanTypeName(firstParam);
    }
  }
  
  // 处理联合类型：拆分并返回所有用户类型
  if (name.includes('|')) {
    const parts = name.split('|').map((s: string) => s.trim());
    const userTypes: string[] = [];
    for (const part of parts) {
      const cleaned = cleanTypeName(part);
      if (cleaned && !BASIC_TYPES.has(cleaned)) {
        userTypes.push(cleaned);
      }
    }
    return userTypes.join(', ');
  }
  
  // 处理泛型类型：提取基础类型
  if (name.includes('<')) {
    name = name.split('<')[0].trim();
  }
  
  return name;
}

/** 拆分泛型参数（处理嵌套泛型） */
function splitGenericParams(params: string): string[] {
  const result: string[] = [];
  let depth = 0;
  let current = '';
  
  for (const char of params) {
    if (char === '<') depth++;
    if (char === '>') depth--;
    if (char === ',' && depth === 0) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  if (current.trim()) result.push(current.trim());
  
  return result;
}

// 判断类型是否是数组
function isArrayType(typeText: string): boolean {
  return typeText.includes('[]') || 
         (typeText.startsWith('Array<') && typeText.endsWith('>')) ||
         (typeText.startsWith('ReadonlyArray<') && typeText.endsWith('>'));
}

// 判断类型是否是可选的
function isOptionalType(typeText: string): boolean {
  return typeText.includes('null') || typeText.includes('undefined');
}

// 计算多重性
function getMultiplicity(typeText: string): string {
  if (isArrayType(typeText)) return '*';
  if (isOptionalType(typeText)) return '0..1';
  return '1';
}

// 基本类型列表（扩充）
const BASIC_TYPES = new Set([
  'string', 'number', 'boolean', 'any', 'void', 'never', 'unknown', 'object',
  'null', 'undefined',
  'String', 'Number', 'Boolean',  // 包装类型
  'BigInt', 'bigint',
  'Symbol', 'symbol',
  'Date', 'RegExp', 'Error', 'Promise', 'Array',
  'Function', 'Class', 'Object',
  'Map', 'Set', 'WeakMap', 'WeakSet',
  'ReadonlyArray', 'ReadonlyMap', 'ReadonlySet',
  'Record', 'Partial', 'Required', 'Readonly', 'Pick', 'Omit', 'Exclude', 'Extract',
  'NonNullable', 'ReturnType', 'InstanceType', 'Parameters', 'ConstructorParameters',
  'ArrayBuffer', 'DataView', 'Int8Array', 'Uint8Array', 'Float32Array',
  'Text', 'TextDecoder', 'TextEncoder',
  'Buffer', 'NodeJS',
]);

// 判断是否是用户定义的类型（类/接口/枚举）
function isUserType(typeName: string, knownTypes: Set<string>): boolean {
  if (!typeName) return false;
  if (BASIC_TYPES.has(typeName)) return false;
  if (typeName.startsWith('typeof ') || typeName.startsWith('keyof ') || typeName.startsWith('import(')) return false;
  if (typeName.startsWith('{') || typeName.startsWith('[')) return false; // 元组和对象字面量
  return knownTypes.has(typeName);
}

// 从类型文本中提取所有用户定义的类型（用于关系生成，支持联合类型拆分）
function extractUserTypes(typeText: string, knownTypes: Set<string>): string[] {
  if (!typeText) return [];
  const cleaned = cleanTypeName(typeText);
  if (!cleaned) return [];
  
  // cleanTypeName 可能返回逗号分隔的多个类型（联合类型、Map 等）
  const parts = cleaned.split(',').map((s: string) => s.trim()).filter(Boolean);
  const result: string[] = [];
  for (const part of parts) {
    if (isUserType(part, knownTypes)) {
      result.push(part);
    }
  }
  return [...new Set(result)];
}

// 从参数中提取所有用户类型
function extractTypesFromParams(params: string, knownTypes: Set<string>): Set<string> {
  const types = new Set<string>();
  if (!params) return types;
  
  // 简单的参数类型提取
  const paramParts = params.split(',');
  for (const part of paramParts) {
    const typeMatch = part.match(/:\s*([^=]+)/);
    if (typeMatch) {
      const typeStr = typeMatch[1].trim();
      const typeName = cleanTypeName(typeStr);
      if (typeName && isUserType(typeName, knownTypes)) {
        types.add(typeName);
      }
    }
  }
  return types;
}

export function parseCode(code: string): ParsedData {
  return parseCodeWithKnownTypes(code, new Set());
}

/** 带预设类型的解析（用于跨文件） */
export function parseCodeWithKnownTypes(code: string, externalTypes: Set<string>): ParsedData {
  const sf = ts.createSourceFile('input.ts', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const classes: ClassInfo[] = [];
  const relations: Relation[] = [];
  const knownTypes = new Set<string>(externalTypes); // 包含外部类型

  // 第一遍：收集本文件类型名称
  ts.forEachChild(sf, (node: any) => {
    if (ts.isInterfaceDeclaration(node) || ts.isClassDeclaration(node) || 
        ts.isEnumDeclaration(node)) {
      if (node.name) knownTypes.add(node.name.text);
    }
  });

  // 第二遍：解析所有类/接口/枚举（不处理关系）
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

      classes.push({
        name: node.name.text,
        isInterface: true,
        isAbstract: false,
        isEnum: false,
        members
      });
    }
    else if (ts.isClassDeclaration(node) && node.name) {
      const members: Member[] = [];
      const isAbstract = !!(ts.getCombinedModifierFlags(node) & ts.ModifierFlags.Abstract);

      node.members.forEach((m: any) => {
        const mod = getModifier(m);
        const isStatic = !!(ts.getCombinedModifierFlags(m) & ts.ModifierFlags.Static);
        const isAbstractMember = !!(ts.getCombinedModifierFlags(m) & ts.ModifierFlags.Abstract);
        
        if (ts.isPropertyDeclaration(m)) {
          const opt = m.questionToken ? '?' : '';
          
          let typeStr = m.type?.getText(sf) || '';
          if (!typeStr && m.initializer) {
            const initText = m.initializer.getText(sf);
            if (initText.startsWith('new ')) {
              typeStr = initText.replace(/^new\s+/, '').replace(/\([^)]*\)$/, '');
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
            name: m.name.getText(sf) + opt,
            type: typeStr,
            isStatic,
            isAbstract: isAbstractMember
          });
        } else if (ts.isConstructorDeclaration(m)) {
          const params: string[] = [];
          m.parameters.forEach((p: any) => {
            const paramText = p.getText(sf);
            params.push(paramText);
            
            // 处理构造函数参数属性
            // TypeScript 允许 constructor(public x: number, private y: number)
            // 这些参数会自动成为类的属性
            const hasPublicKeyword = p.modifiers?.some((mod: any) => mod.kind === ts.SyntaxKind.PublicKeyword);
            const hasPrivateKeyword = p.modifiers?.some((mod: any) => mod.kind === ts.SyntaxKind.PrivateKeyword);
            const hasProtectedKeyword = p.modifiers?.some((mod: any) => mod.kind === ts.SyntaxKind.ProtectedKeyword);
            const hasReadonlyKeyword = p.modifiers?.some((mod: any) => mod.kind === ts.SyntaxKind.ReadonlyKeyword);
            
            if (hasPublicKeyword || hasPrivateKeyword || hasProtectedKeyword || hasReadonlyKeyword) {
              let pMod: '+' | '-' | '#' = '+';
              if (hasPrivateKeyword) pMod = '-';
              else if (hasProtectedKeyword) pMod = '#';
              
              const pType = p.type?.getText(sf) || 'any';
              members.push({
                kind: 'property',
                modifier: pMod,
                name: p.name.getText(sf),
                type: pType,
                isStatic: false
              });
            }
          });
          members.push({
            kind: 'method',
            modifier: '+',
            name: 'constructor',
            type: '',
            params: params.join(', '),
            isStatic: false
          });
        } else if (ts.isMethodDeclaration(m)) {
          const params = m.parameters.map((p: any) => p.getText(sf)).join(', ');
          members.push({
            kind: 'method',
            modifier: mod,
            name: m.name.getText(sf),
            type: getReturnType(m, sf),
            params,
            isStatic,
            isAbstract: isAbstractMember
          });
        } else if (ts.isGetAccessorDeclaration(m) || ts.isSetAccessorDeclaration(m)) {
          members.push({
            kind: 'method',
            modifier: mod,
            name: (ts.isGetAccessorDeclaration(m) ? 'get ' : 'set ') + m.name.getText(sf),
            type: getReturnType(m, sf),
            params: '',
            isStatic
          });
        }
      });

      classes.push({
        name: node.name.text,
        isInterface: false,
        isAbstract,
        isEnum: false,
        members
      });
    }
    else if (ts.isEnumDeclaration(node) && node.name) {
      const members: Member[] = [];
      node.members.forEach((m: any) => {
        const value = m.initializer?.getText(sf) || '';
        members.push({
          kind: 'property',
          modifier: '+',
          name: m.name.getText(sf),
          type: value ? `= ${value}` : '',
          isStatic: true // 枚举值视为静态
        });
      });
      
      classes.push({
        name: node.name.text,
        isInterface: false,
        isAbstract: false,
        isEnum: true,
        members
      });
    }
  });

  // 第三遍：统一处理关系（此时所有类都已收集完成）
  ts.forEachChild(sf, (node: any) => {
    if (ts.isInterfaceDeclaration(node)) {
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

      // 接口属性关联
      const associationMap = new Map<string, string[]>();
      node.members.forEach((m: any) => {
        if (ts.isPropertySignature(m)) {
          const typeText = m.type?.getText(sf) || '';
          const typeName = cleanTypeName(typeText);
          if (typeName && isUserType(typeName, knownTypes) && typeName !== node.name.text) {
            const fields = associationMap.get(typeName) || [];
            fields.push(m.name.getText(sf));
            associationMap.set(typeName, fields);
          }
        }
      });
      
      associationMap.forEach((fields, typeName) => {
        relations.push({
          from: node.name.text,
          to: typeName,
          type: 'association',
          toMultiplicity: '1',
          label: fields.length > 1 ? fields.join(', ') : undefined
        });
      });
    }
    else if (ts.isClassDeclaration(node) && node.name) {
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

      // 收集属性类型和构造函数参数
      const propertyTypes = new Set<string>();
      const constructorParamNames = new Set<string>(); // 带修饰符的参数（属性）
      // 属性条目：统一生成组合/聚合/关联关系（含字段和构造函数参数属性）
      const propertyEntries: { fieldName: string; typeText: string; isOptional: boolean; isNew: boolean }[] = [];
      
      node.members.forEach((m: any) => {
        if (ts.isPropertyDeclaration(m)) {
          let typeText = m.type?.getText(sf) || '';
          let isNew = false;
          
          // 检查是否通过 new 创建（使用 AST）
          if (m.initializer && ts.isNewExpression(m.initializer)) {
            isNew = true;
            // 没有类型注解时，从 new 表达式推断类型（例如：private b = new B()）
            if (!typeText) {
              const expr = m.initializer.expression;
              if (expr && ts.isIdentifier(expr)) {
                typeText = expr.text;
              }
            }
          }
          
          const types = extractUserTypes(typeText, knownTypes);
          types.forEach(t => propertyTypes.add(t));
          propertyEntries.push({
            fieldName: m.name.getText(sf),
            typeText,
            isOptional: !!m.questionToken,
            isNew
          });
        } else if (ts.isConstructorDeclaration(m)) {
          m.parameters.forEach((p: any) => {
            const pType = p.type?.getText(sf) || 'any';
            
            // 检查是否有修饰符（public/private/protected/readonly）
            const hasModifier = p.modifiers?.some((mod: any) => 
              mod.kind === ts.SyntaxKind.PublicKeyword ||
              mod.kind === ts.SyntaxKind.PrivateKeyword ||
              mod.kind === ts.SyntaxKind.ProtectedKeyword ||
              mod.kind === ts.SyntaxKind.ReadonlyKeyword
            );
            
            if (hasModifier) {
              // 有修饰符 -> 参数属性，视为字段（关联），不是依赖
              constructorParamNames.add(p.name.getText(sf));
              const types = extractUserTypes(pType, knownTypes);
              types.forEach(t => propertyTypes.add(t));
              propertyEntries.push({
                fieldName: p.name.getText(sf),
                typeText: pType,
                isOptional: false,
                isNew: false
              });
            }
          });
        }
      });

      // 组合/聚合关系（属性类型，含构造函数参数属性）
      const relationMap = new Map<string, { type: 'association' | 'aggregation' | 'composition', fields: string[], multiplicity: string }>();
      
      for (const entry of propertyEntries) {
        const typeNames = extractUserTypes(entry.typeText, knownTypes);
        for (const typeName of typeNames) {
          if (typeName === node.name.text) continue;
          
          const fieldName = entry.fieldName;
          const isArray = isArrayType(entry.typeText);
          const isOptional = entry.isOptional || isOptionalType(entry.typeText);
          const isNew = entry.isNew;
          
          let relType: 'association' | 'aggregation' | 'composition';
          let multiplicity: string;
          
          if (isNew) {
            // new 创建 -> 组合
            relType = 'composition';
            multiplicity = '1';
          } else if (isArray) {
            // 数组/集合类型 -> 聚合
            relType = 'aggregation';
            multiplicity = '*';
          } else {
            // 普通类型引用 -> 关联
            relType = 'association';
            multiplicity = isOptional ? '0..1' : '1';
          }
          
          const existing = relationMap.get(typeName);
          if (existing) {
            existing.fields.push(fieldName);
            // 关系类型优先级：组合 > 聚合 > 关联
            if (relType === 'composition') existing.type = 'composition';
            else if (relType === 'aggregation' && existing.type === 'association') existing.type = 'aggregation';
            // 多重性优先级：* > 0..1 > 1
            if (multiplicity === '*') existing.multiplicity = '*';
            else if (multiplicity === '0..1' && existing.multiplicity === '1') existing.multiplicity = '0..1';
          } else {
            relationMap.set(typeName, { type: relType, fields: [fieldName], multiplicity });
          }
        }
      }
      
      // BUG-3 修复：生成关系（带标签）
      relationMap.forEach((info, typeName) => {
        relations.push({
          from: node.name.text,
          to: typeName,
          type: info.type,
          toMultiplicity: info.multiplicity,
          label: info.fields.join(', ') // 始终生成标签
        });
      });

      // 依赖关系（仅函数参数中的类型）
      const dependencyTypes = new Set<string>();
      
      node.members.forEach((m: any) => {
        if (ts.isMethodDeclaration(m) || ts.isConstructorDeclaration(m)) {
          m.parameters.forEach((p: any) => {
            const paramName = p.name.getText(sf);
            
            // 跳过构造函数参数属性（带修饰符的）
            if (constructorParamNames.has(paramName)) return;
            
            const paramType = p.type?.getText(sf) || '';
            for (const typeName of extractUserTypes(paramType, knownTypes)) {
              if (typeName !== node.name.text && !propertyTypes.has(typeName)) {
                dependencyTypes.add(typeName);
              }
            }
          });
        }
        
        // 返回值类型也可能产生依赖
        if (ts.isMethodDeclaration(m) && m.type) {
          for (const returnType of extractUserTypes(m.type.getText(sf), knownTypes)) {
            if (returnType !== node.name.text && !propertyTypes.has(returnType)) {
              dependencyTypes.add(returnType);
            }
          }
        }
        
        // 遍历方法体中的 new 表达式
        if (ts.isMethodDeclaration(m) || ts.isConstructorDeclaration(m)) {
          const visitNode = (node: any) => {
            // 处理 new 表达式
            if (ts.isNewExpression(node)) {
              const expr = node.expression;
              if (expr && ts.isIdentifier(expr)) {
                const typeName = expr.text;
                if (typeName && isUserType(typeName, knownTypes) && 
                    typeName !== node.name?.text && !propertyTypes.has(typeName)) {
                  dependencyTypes.add(typeName);
                }
              }
            }
            // 处理 throw new
            if (ts.isThrowStatement(node) && node.expression) {
              if (ts.isNewExpression(node.expression)) {
                const expr = node.expression.expression;
                if (expr && ts.isIdentifier(expr)) {
                  const typeName = expr.text;
                  if (typeName && isUserType(typeName, knownTypes) && 
                      typeName !== node.name?.text && !propertyTypes.has(typeName)) {
                    dependencyTypes.add(typeName);
                  }
                }
              }
            }
            ts.forEachChild(node, visitNode);
          };
          ts.forEachChild(m, visitNode);
        }
      });
      
      dependencyTypes.forEach(typeName => {
        const existingRel = relations.find(r => r.from === node.name.text && r.to === typeName);
        if (!existingRel) {
          relations.push({
            from: node.name.text,
            to: typeName,
            type: 'dependency'
          });
        }
      });
    }
  });

  return { classes, relations };
}
