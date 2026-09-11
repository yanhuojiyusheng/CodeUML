/**
 * 语义解析：判断「某个文件里的某个名字」实际指向哪个包的哪个声明。
 *
 * 这里不产出类 / 关系的结构（那是语法解析 parser.ts 的职责），
 * 只回答一个问题：`src/app.ts` 里的 `Config` 到底是 `src/a.ts` 的还是 `src/b.ts` 的。
 *
 * 做法：把内存文件喂给 TypeScript 的 Program + Checker，然后**只分析 import 声明**，
 * 得到「本地名 -> 真正的声明」。这是文件里「名字指向哪里」的权威来源，
 * 与名字在哪儿被使用（类型注解 / new / 装饰器 / 将来任何新用法）完全无关，
 * 因此不会因为 parser 新增了某种关系来源就漏解析。
 * 重命名导入、`type` 修饰符、barrel 再导出、default 导出都由编译器处理。
 *
 * 没写 import 的名字不在映射里，由调用方按「本包 -> 全局唯一 -> 全部候选」兜底。
 * 任何异常都退化为空映射。
 */

import { SourceFile } from './merge';

// 兼容浏览器和 Node.js 环境
declare const ts: any;

/** 一个被解析到的类型：它在某个包里、以什么名字声明（重命名导入时与本地名不同） */
export interface ResolvedType {
  pkg: string;
  name: string;
}

export interface TypeResolution {
  /** 虚拟文件名 -> (文件里用到的类型名 -> 实际声明) */
  byFile: Map<string, Map<string, ResolvedType>>;
}

const EMPTY: TypeResolution = { byFile: new Map() };

/** 包名（src/a.ts）-> 虚拟绝对路径（/src/a.ts），Program 需要统一的前缀 */
export function toVirtualPath(pkg: string): string {
  const p = pkg.replace(/\\/g, '/');
  return p.startsWith('/') ? p : '/' + p;
}

/**
 * 一个包在 Program 里对应哪些虚拟路径。
 * 包名带扩展名时就是它自己；不带扩展名时（旧数据 / 手工新建的标签）
 * 额外注册常见扩展名的别名，这样 `import './args'` 与 `'./args.ts'` 都能命中。
 */
function virtualPathsFor(pkg: string): string[] {
  const primary = toVirtualPath(pkg);
  if (/\.[cm]?[jt]sx?$/i.test(primary)) return [primary];
  return [primary, `${primary}.ts`, `${primary}.tsx`, `${primary}.js`, `${primary}.jsx`];
}

/** 符号的声明名：default 导出要取声明本身的名字（`export default class Foo` -> Foo） */
function declaredNameOf(sym: any, decl: any): string {
  const nameNode = decl && decl.name;
  if (nameNode && typeof nameNode.getText === 'function') return nameNode.getText();
  return sym.getName();
}

function scriptKindFor(fileName: string) {
  const n = fileName.toLowerCase();
  if (n.endsWith('.tsx')) return ts.ScriptKind.TSX;
  if (n.endsWith('.jsx')) return ts.ScriptKind.JSX;
  if (n.endsWith('.js') || n.endsWith('.mjs') || n.endsWith('.cjs')) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

/** 用内存文件构建 Program，得到「文件 -> 类型名 -> 所在包」的映射；失败则返回空映射 */
export function resolveTypes(files: SourceFile[]): TypeResolution {
  try {
    const pathToPackage = new Map<string, string>();
    const contents = new Map<string, string>();
    const roots: string[] = [];
    for (const f of files) {
      const paths = virtualPathsFor(f.name);
      roots.push(paths[0]);
      for (const p of paths) {
        // 别名只用于让模块解析命中，真正的 root 是 paths[0]
        if (contents.has(p)) continue;
        pathToPackage.set(p, f.name);
        contents.set(p, f.content);
      }
    }
    if (contents.size === 0) return EMPTY;

    // 只需要解析用户自己的类型，不需要 lib（noLib），也不必做类型检查
    const options = {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.NodeJs,
      jsx: ts.JsxEmit.Preserve,
      noLib: true,
      skipLibCheck: true,
      allowJs: true,
      checkJs: false,
    };

    const host = {
      getSourceFile: (fileName: string) => {
        const text = contents.get(fileName);
        if (text === undefined) return undefined;
        return ts.createSourceFile(fileName, text, options.target, true, scriptKindFor(fileName));
      },
      getDefaultLibFileName: () => 'lib.d.ts',
      writeFile: () => {},
      getCurrentDirectory: () => '/',
      getCanonicalFileName: (f: string) => f,
      useCaseSensitiveFileNames: () => true,
      getNewLine: () => '\n',
      fileExists: (f: string) => contents.has(f),
      readFile: (f: string) => contents.get(f),
    };

    const program = ts.createProgram(roots, options, host);
    const checker = program.getTypeChecker();
    const byFile = new Map<string, Map<string, ResolvedType>>();

    for (const f of files) {
      const sf = program.getSourceFile(toVirtualPath(f.name));
      if (!sf) continue; // 解析失败的 root
      const map = new Map<string, ResolvedType>();

      /** 把一个导入绑定名解析成「真正的声明」 */
      const record = (nameNode: any) => {
        if (!nameNode || !ts.isIdentifier(nameNode)) return;
        const localName: string = nameNode.text;
        if (!localName) return;
        try {
          let sym = checker.getSymbolAtLocation(nameNode);
          if (!sym) return;
          if (sym.flags & ts.SymbolFlags.Alias) sym = checker.getAliasedSymbol(sym);
          const decl = sym.declarations?.[0];
          const declFile = decl?.getSourceFile()?.fileName;
          const target = declFile ? pathToPackage.get(declFile) : undefined;
          if (target === undefined) return; // 内置类型 / 不在文件集里的外部包
          const resolved: ResolvedType = { pkg: target, name: declaredNameOf(sym, decl) };
          const existing = map.get(localName);
          // 同一本地名指向不同声明 -> 标记为不可用，交给调用方兜底
          if (existing !== undefined && (existing.pkg !== resolved.pkg || existing.name !== resolved.name)) {
            map.set(localName, { pkg: '', name: '' });
          } else {
            map.set(localName, resolved);
          }
        } catch {
          // 单个符号解析失败不影响其它
        }
      };

      // 只分析 import 声明（不扫使用位置），因此与名字如何被使用无关
      for (const stmt of sf.statements || []) {
        if (!ts.isImportDeclaration(stmt) || !stmt.importClause) continue;
        const clause = stmt.importClause;
        if (clause.name) record(clause.name); // import X from '...'
        const bindings = clause.namedBindings;
        if (bindings && ts.isNamedImports(bindings)) {
          // import { A, B as C, type D } from '...' -> 本地名是 el.name
          for (const el of bindings.elements) record(el.name);
        }
        // import * as NS from '...' 只能作为限定名的前缀，不能单独作为类型参与关系，跳过
      }

      byFile.set(f.name, map);
    }

    return { byFile };
  } catch {
    return EMPTY;
  }
}
