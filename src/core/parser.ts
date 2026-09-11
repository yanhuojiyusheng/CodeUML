/** TypeScript 代码解析器 */

import { Member, ClassInfo, Relation, ParsedData } from './types';

// 兼容浏览器和 Node.js 环境
declare const ts: any;

/** 按扩展名选择解析模式：.tsx/.jsx 必须启用 JSX，否则同行 JSX 会让后续声明整块丢失 */
function scriptKindFor(fileName?: string) {
  const name = (fileName || '').toLowerCase();
  if (name.endsWith('.tsx')) return ts.ScriptKind.TSX;
  if (name.endsWith('.jsx')) return ts.ScriptKind.JSX;
  if (name.endsWith('.js') || name.endsWith('.mjs') || name.endsWith('.cjs')) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

/** 文件名参与解析，以便根据扩展名选择 ScriptKind */
function createSourceFile(code: string, fileName?: string) {
  return ts.createSourceFile(
    fileName || 'input.ts',
    code,
    ts.ScriptTarget.Latest,
    true,
    scriptKindFor(fileName),
  );
}

/** 展平顶层声明：递归进入 namespace / module（含嵌套与点号命名空间） */
function flattenStatements(sf: any): any[] {
  const out: any[] = [];
  const collect = (node: any) => {
    for (const child of node.statements || []) {
      if (ts.isModuleDeclaration(child) && child.body) {
        // 点号命名空间（namespace A.B）的 body 仍是 ModuleDeclaration，需要一路剥到底
        let body = child.body;
        while (ts.isModuleDeclaration(body) && body.body) body = body.body;
        collect(body);
        continue;
      }
      out.push(child);
    }
  };
  collect(sf);
  return out;
}

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
// aliases：类型别名展开表（如 UserRef -> User）；depth 仅用于别名链的循环保护
function cleanTypeName(typeText: string, aliases?: ReadonlyMap<string, string>, depth = 0): string {
  if (!typeText) return '';
  let name = typeText.trim();

  // 整段命中别名则展开（支持 A -> B -> User 链式，带循环保护）
  if (aliases && depth < 8) {
    const target = aliases.get(name);
    if (target !== undefined && target.trim() !== name) {
      return cleanTypeName(target, aliases, depth + 1);
    }
  }

  const self = (t: string) => cleanTypeName(t, aliases, depth);

  // 处理数组形式：Foo[] 或 Array<Foo>
  if (name.endsWith('[]')) {
    return self(name.slice(0, -2));
  }
  // 去掉整体括号：(A | B) -> A | B
  if (name.startsWith('(') && name.endsWith(')')) {
    return self(name.slice(1, -1));
  }
  if (name.startsWith('Array<') && name.endsWith('>')) {
    return self(name.slice(6, -1));
  }
  if (name.startsWith('ReadonlyArray<') && name.endsWith('>')) {
    return self(name.slice(14, -1));
  }

  // 处理 Promise<T>
  if (name.startsWith('Promise<') && name.endsWith('>')) {
    return self(name.slice(8, -1));
  }

  // 处理 Record<K, V> -> 返回 V（值类型）
  if (name.startsWith('Record<') && name.endsWith('>')) {
    const inner = name.slice(7, -1);
    const commaIdx = inner.lastIndexOf(',');
    if (commaIdx >= 0) {
      return self(inner.slice(commaIdx + 1));
    }
    return self(inner);
  }

  // 处理 Set<T>
  if (name.startsWith('Set<') && name.endsWith('>')) {
    return self(name.slice(4, -1));
  }
  if (name.startsWith('WeakSet<') && name.endsWith('>')) {
    return self(name.slice(8, -1));
  }

  // 处理 Map<K, V> -> 返回 K 和 V（用逗号分隔）
  if (name.startsWith('Map<') && name.endsWith('>')) {
    const inner = name.slice(4, -1);
    const parts = splitGenericParams(inner);
    return parts.map(p => self(p)).filter(Boolean).join(', ');
  }

  // 处理工具类型：Partial<T>, Required<T>, Readonly<T>, Pick<T, K>, Omit<T, K> 等
  const utilityTypes = ['Partial', 'Required', 'Readonly', 'Pick', 'Omit', 'Exclude', 'Extract', 'NonNullable'];
  for (const util of utilityTypes) {
    if (name.startsWith(util + '<') && name.endsWith('>')) {
      const inner = name.slice(util.length + 1, -1);
      const firstParam = splitGenericParams(inner)[0];
      return self(firstParam);
    }
  }

  // 处理联合类型：按顶层 | 切分（避免拆开 Repo<A | B>），返回所有用户类型
  const unionParts = splitTopLevel(name, '|');
  if (unionParts.length > 1) {
    const userTypes: string[] = [];
    for (const part of unionParts) {
      const cleaned = self(part.trim());
      if (cleaned && !BASIC_TYPES.has(cleaned)) {
        userTypes.push(cleaned);
      }
    }
    return userTypes.join(', ');
  }

  // 用户泛型：保留基类型并递归收集类型实参（与 Promise/Map 等内建泛型行为一致）
  if (name.includes('<')) {
    const base = name.split('<')[0].trim();
    const inner = name.slice(name.indexOf('<') + 1, name.lastIndexOf('>'));
    const args = splitGenericParams(inner).map(p => self(p)).filter(Boolean);
    return [base, ...args].filter(Boolean).join(', ');
  }

  return name;
}

/** 展开整段类型文本的别名（用于数组/可选等分类判断），带循环保护 */
function expandAlias(typeText: string, aliases?: ReadonlyMap<string, string>, depth = 0): string {
  if (!typeText || !aliases || depth > 8) return typeText;
  const target = aliases.get(typeText.trim());
  if (target === undefined || target.trim() === typeText.trim()) return typeText;
  return expandAlias(target, aliases, depth + 1);
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

/** 按顶层分隔符切分（忽略 <> () [] 内部的同名符号），用于联合类型 */
function splitTopLevel(text: string, sep: string): string[] {
  const result: string[] = [];
  let depth = 0;
  let current = '';
  for (const char of text) {
    if (char === '<' || char === '(' || char === '[') depth++;
    else if (char === '>' || char === ')' || char === ']') depth--;
    if (char === sep && depth === 0) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

// 判断类型是否是集合容器（数组 / Set / Map 等），用于聚合关系
const COLLECTION_PREFIX = /^(Array|ReadonlyArray|Set|ReadonlySet|WeakSet|Map|ReadonlyMap|WeakMap)</;
function isCollectionType(typeText: string): boolean {
  const t = typeText.trim();
  return t.includes('[]') || COLLECTION_PREFIX.test(t);
}

// 判断类型是否是可选的
function isOptionalType(typeText: string): boolean {
  return typeText.includes('null') || typeText.includes('undefined');
}

interface PropertyEntry {
  fieldName: string;
  typeText: string;
  isOptional: boolean;
  isNew: boolean;
}

/**
 * 把属性（含构造参数属性）归类成 组合 / 聚合 / 关联 关系。
 * **类与接口共用**，避免两边规则不一致（历史上接口一律 association[1]）。
 * 同一目标：关系取最强（组合 > 聚合 > 关联），多重性取最大（* > 0..1 > 1），字段名合并成标签。
 */
function propertyEntriesToRelations(
  ownerName: string,
  entries: PropertyEntry[],
  knownTypes: Set<string>,
  excluded: Set<string>,
  aliases: ReadonlyMap<string, string>,
): { relations: Relation[]; types: Set<string> } {
  const types = new Set<string>();
  const map = new Map<string, {
    type: 'association' | 'aggregation' | 'composition';
    fields: string[];
    multiplicity: string;
  }>();

  for (const entry of entries) {
    const effectiveType = expandAlias(entry.typeText, aliases);
    const isCollection = isCollectionType(effectiveType);
    const isOptional = entry.isOptional || isOptionalType(effectiveType);

    for (const typeName of extractUserTypes(entry.typeText, knownTypes, excluded, aliases)) {
      types.add(typeName);
      if (typeName === ownerName) continue;

      const relType = entry.isNew ? 'composition' : isCollection ? 'aggregation' : 'association';
      const multiplicity = entry.isNew ? '1' : isCollection ? '*' : isOptional ? '0..1' : '1';

      const existing = map.get(typeName);
      if (existing) {
        existing.fields.push(entry.fieldName);
        if (relType === 'composition') existing.type = 'composition';
        else if (relType === 'aggregation' && existing.type === 'association') existing.type = 'aggregation';
        if (multiplicity === '*') existing.multiplicity = '*';
        else if (multiplicity === '0..1' && existing.multiplicity === '1') existing.multiplicity = '0..1';
      } else {
        map.set(typeName, { type: relType, fields: [entry.fieldName], multiplicity });
      }
    }
  }

  const relations: Relation[] = [];
  map.forEach((info, typeName) => {
    relations.push({
      from: ownerName,
      to: typeName,
      type: info.type,
      toMultiplicity: info.multiplicity,
      label: info.fields.join(', '),
    });
  });
  return { relations, types };
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

// 判断是否是用户定义的类型（类/接口/枚举，或已知命名空间的限定名 NS.Type）
function isUserType(typeName: string, knownTypes: Set<string>): boolean {
  if (!typeName) return false;
  if (BASIC_TYPES.has(typeName)) return false;
  if (typeName.startsWith('typeof ') || typeName.startsWith('keyof ') || typeName.startsWith('import(')) return false;
  if (typeName.startsWith('{') || typeName.startsWith('[')) return false; // 元组和对象字面量
  // 命名空间限定名：NS.Type（NS 必须是已知的导入名）
  const dot = typeName.indexOf('.');
  if (dot > 0) return knownTypes.has(typeName.slice(0, dot));
  return knownTypes.has(typeName);
}

// 从类型文本中提取所有用户定义的类型（用于关系生成，支持联合类型拆分）
// excluded：当前作用域内的泛型参数名（它们遮蔽同名类，不应产生关系）
// aliases：类型别名展开表
function extractUserTypes(
  typeText: string,
  knownTypes: Set<string>,
  excluded?: Set<string>,
  aliases?: ReadonlyMap<string, string>,
): string[] {
  if (!typeText) return [];
  const cleaned = cleanTypeName(typeText, aliases);
  if (!cleaned) return [];
  
  // cleanTypeName 可能返回逗号分隔的多个类型（联合类型、Map 等）
  const parts = cleaned.split(',').map((s: string) => s.trim()).filter(Boolean);
  const result: string[] = [];
  for (const part of parts) {
    if (isUserType(part, knownTypes) && !excluded?.has(part)) {
      result.push(part);
    }
  }
  return [...new Set(result)];
}

/** 重载签名去重：同名方法只保留一条，优先带方法体的实现签名 */
function createMethodCollector(members: Member[]) {
  const indexByName = new Map<string, number>();
  return (member: Member, hasBody: boolean) => {
    const idx = indexByName.get(member.name);
    if (idx === undefined) {
      indexByName.set(member.name, members.length);
      members.push(member);
    } else if (hasBody) {
      members[idx] = member;
    }
  };
}

export interface TypeInfo {
  types: Set<string>;
  aliases: Map<string, string>;
  /** 本文件引入的本地名字（import 绑定名，含 `as` 重命名）；用于识别重命名引用 */
  imports: Set<string>;
  /** 语法错误信息（类型错误不算，只关心解析不了的代码） */
  errors: string[];
}

/** 扫一个源文件的声明：类型名 + 类型别名表 + import 绑定名 + 语法错误 */
function collectFromSourceFile(sf: any): TypeInfo {
  const types = new Set<string>();
  const aliases = new Map<string, string>();
  const imports = new Set<string>();
  for (const node of flattenStatements(sf)) {
    if (ts.isClassDeclaration(node) || ts.isInterfaceDeclaration(node) || ts.isEnumDeclaration(node)) {
      if (node.name) types.add(node.name.text);
    } else if (ts.isTypeAliasDeclaration(node) && node.name && node.type) {
      aliases.set(node.name.text, node.type.getText(sf));
    } else if (ts.isImportDeclaration(node) && node.importClause) {
      const clause = node.importClause;
      if (clause.name) imports.add(clause.name.text); // import X from '...'
      const bindings = clause.namedBindings;
      if (bindings) {
        if (ts.isNamespaceImport(bindings)) {
          imports.add(bindings.name.text); // import * as NS from '...'
        } else if (ts.isNamedImports(bindings)) {
          // import { A, B as C } from '...'  -> 本地名是 el.name.text
          bindings.elements.forEach((el: any) => { if (el.name) imports.add(el.name.text); });
        }
      }
    }
  }
  const errors: string[] = [];
  for (const d of sf.parseDiagnostics || []) {
    errors.push(ts.flattenDiagnosticMessageText(d.messageText, ' '));
  }
  return { types, aliases, imports, errors };
}

/** 供多文件合并的第一趟使用：先收集全部类型名与别名，再做第二趟解析 */
export function collectTypeInfo(code: string, fileName?: string): TypeInfo {
  return collectFromSourceFile(createSourceFile(code, fileName));
}

/**
 * 从类型文本里提取类型名（单层，**不做别名展开**）。
 * 供跨文件解析使用：别名在它定义的那个文件的作用域里展开时，需要先拿到右值里的名字。
 */
export function extractTypeNames(typeText: string): string[] {
  const cleaned = cleanTypeName(typeText);
  if (!cleaned) return [];
  return [...new Set(cleaned.split(',').map(s => s.trim()).filter(Boolean))];
}

export function parseCode(code: string, fileName?: string): ParsedData {
  return parseCodeWithKnownTypes(code, new Set(), fileName);
}

/**
 * 带预设类型的解析（用于跨文件）。
 * 类型别名只展开**本文件内声明的**；跨文件的别名由 merge 在别名定义处的作用域里展开。
 */
export function parseCodeWithKnownTypes(
  code: string,
  externalTypes: Set<string>,
  fileName?: string,
): ParsedData {
  const sf = createSourceFile(code, fileName);
  const classes: ClassInfo[] = [];
  const relations: Relation[] = [];
  const local = collectFromSourceFile(sf);
  const knownTypes = new Set<string>(externalTypes); // 包含外部类型
  local.types.forEach(t => knownTypes.add(t));
  const aliases = new Map<string, string>(local.aliases);
  const statements = flattenStatements(sf);

  // 第二遍：解析所有类/接口/枚举（不处理关系）
  statements.forEach((node: any) => {
    if (ts.isInterfaceDeclaration(node)) {
      const members: Member[] = [];
      const addMethod = createMethodCollector(members);
      
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
          addMethod({
            kind: 'method',
            modifier: '+',
            name: m.name.getText(sf),
            type: getReturnType(m, sf),
            params
          }, false);
        } else if (ts.isIndexSignatureDeclaration(m)) {
          // [key: string]: V -> 一条属性成员
          const key = m.parameters[0];
          members.push({
            kind: 'property',
            modifier: '+',
            name: `[${key ? key.getText(sf) : 'key: string'}]`,
            type: m.type?.getText(sf) || ''
          });
        } else if (ts.isCallSignatureDeclaration(m) || ts.isConstructSignatureDeclaration(m)) {
          // (x: T): R  /  new (x: T): R
          const params = m.parameters.map((p: any) => p.getText(sf)).join(', ');
          addMethod({
            kind: 'method',
            modifier: '+',
            name: ts.isConstructSignatureDeclaration(m) ? '(new)' : '(call)',
            type: getReturnType(m, sf),
            params
          }, false);
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
      const addMethod = createMethodCollector(members);
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
          addMethod({
            kind: 'method',
            modifier: '+',
            name: 'constructor',
            type: '',
            params: params.join(', '),
            isStatic: false
          }, !!m.body);
        } else if (ts.isMethodDeclaration(m)) {
          const params = m.parameters.map((p: any) => p.getText(sf)).join(', ');
          addMethod({
            kind: 'method',
            modifier: mod,
            name: m.name.getText(sf),
            type: getReturnType(m, sf),
            params,
            isStatic,
            isAbstract: isAbstractMember
          }, !!m.body);
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
  statements.forEach((node: any) => {
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

      // 接口属性：与类共用同一套组合/聚合/关联分类（排除接口泛型参数，支持联合类型）
      const typeParams = new Set<string>(node.typeParameters?.map((tp: any) => tp.name.text) || []);
      const propertyEntries: PropertyEntry[] = [];
      node.members.forEach((m: any) => {
        if (ts.isPropertySignature(m)) {
          propertyEntries.push({
            fieldName: m.name.getText(sf),
            typeText: m.type?.getText(sf) || '',
            isOptional: !!m.questionToken,
            isNew: false,
          });
        } else if (ts.isIndexSignatureDeclaration(m)) {
          // 索引签名的值类型也算引用（如 [k: string]: Foo）
          const key = m.parameters[0];
          propertyEntries.push({
            fieldName: `[${key ? key.getText(sf) : 'key: string'}]`,
            typeText: m.type?.getText(sf) || '',
            isOptional: false,
            isNew: false,
          });
        }
      });
      const { relations: propertyRelations } = propertyEntriesToRelations(
        node.name.text, propertyEntries, knownTypes, typeParams, aliases,
      );
      relations.push(...propertyRelations);

      // 继承泛型的类型实参 -> 依赖
      if (node.heritageClauses) {
        node.heritageClauses.forEach((h: any) => {
          h.types.forEach((t: any) => {
            for (const arg of t.typeArguments || []) {
              for (const argType of extractUserTypes(arg.getText(sf), knownTypes, typeParams, aliases)) {
                if (argType === node.name.text) continue;
                if (!relations.find(r => r.from === node.name.text && r.to === argType)) {
                  relations.push({ from: node.name.text, to: argType, type: 'dependency' });
                }
              }
            }
          });
        });
      }
    }
    else if (ts.isClassDeclaration(node) && node.name) {
      // 类级泛型参数：这些名称遮蔽同名类，不应产生关系
      const classTypeParams = new Set<string>(
        node.typeParameters?.map((tp: any) => tp.name.text) || []
      );
      /** 合并类级与成员级（方法/构造函数）泛型参数 */
      const excludeParamsOf = (m: any): Set<string> => {
        if (!m?.typeParameters?.length) return classTypeParams;
        const merged = new Set(classTypeParams);
        m.typeParameters.forEach((tp: any) => merged.add(tp.name.text));
        return merged;
      };

      // 继承/实现
      const heritageTypeArgs = new Set<string>();
      if (node.heritageClauses) {
        node.heritageClauses.forEach((h: any) => {
          const type = h.token === ts.SyntaxKind.ExtendsKeyword ? 'extends' : 'implements';
          h.types.forEach((t: any) => {
            const targetName = t.expression.text;
            if (targetName && knownTypes.has(targetName)) {
              relations.push({ from: node.name.text, to: targetName, type });
            }
            // Base<Foo> / Repository<User> 的类型实参 -> 依赖
            for (const arg of t.typeArguments || []) {
              for (const argType of extractUserTypes(arg.getText(sf), knownTypes, classTypeParams, aliases)) {
                heritageTypeArgs.add(argType);
              }
            }
          });
        });
      }

      // 收集属性类型和构造函数参数
      const constructorParamNames = new Set<string>(); // 带修饰符的参数（属性）
      // 属性条目：统一生成组合/聚合/关联关系（含字段和构造函数参数属性）
      const propertyEntries: PropertyEntry[] = [];
      
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

      // 组合/聚合/关联：类与接口共用同一套分类规则（含构造函数参数属性）
      const { relations: propertyRelations, types: propertyTypes } = propertyEntriesToRelations(
        node.name.text, propertyEntries, knownTypes, classTypeParams, aliases,
      );
      relations.push(...propertyRelations);

      // 依赖关系（仅函数参数中的类型）
      const dependencyTypes = new Set<string>();
      
      node.members.forEach((m: any) => {
        if (ts.isMethodDeclaration(m) || ts.isConstructorDeclaration(m)) {
          m.parameters.forEach((p: any) => {
            const paramName = p.name.getText(sf);
            
            // 跳过构造函数参数属性（带修饰符的）
            if (constructorParamNames.has(paramName)) return;
            
            const paramType = p.type?.getText(sf) || '';
            for (const typeName of extractUserTypes(paramType, knownTypes, excludeParamsOf(m), aliases)) {
              if (typeName !== node.name.text && !propertyTypes.has(typeName)) {
                dependencyTypes.add(typeName);
              }
            }
          });
        }
        
        // 返回值类型也可能产生依赖
        if (ts.isMethodDeclaration(m) && m.type) {
          for (const returnType of extractUserTypes(m.type.getText(sf), knownTypes, excludeParamsOf(m), aliases)) {
            if (returnType !== node.name.text && !propertyTypes.has(returnType)) {
              dependencyTypes.add(returnType);
            }
          }
        }
        
        // 遍历方法体中的 new 表达式
        if (ts.isMethodDeclaration(m) || ts.isConstructorDeclaration(m)) {
          const memberTypeParams = excludeParamsOf(m);
          const visitNode = (node: any) => {
            // 处理 new 表达式
            if (ts.isNewExpression(node)) {
              const expr = node.expression;
              if (expr && ts.isIdentifier(expr)) {
                const typeName = expr.text;
                if (typeName && isUserType(typeName, knownTypes) && !memberTypeParams.has(typeName) &&
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
                  if (typeName && isUserType(typeName, knownTypes) && !memberTypeParams.has(typeName) &&
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
      
      // 继承泛型的类型实参 -> 依赖
      heritageTypeArgs.forEach(typeName => {
        if (typeName !== node.name.text) dependencyTypes.add(typeName);
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
