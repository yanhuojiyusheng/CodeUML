/**
 * 语义解析：判断「某个文件里出现的类型名」实际指向哪个包。
 *
 * 这里不产出类 / 关系的结构（那是语法解析 parser.ts 的职责），
 * 只回答一个问题：`src/app.ts` 里的 `Config` 到底是 `src/a.ts` 的还是 `src/b.ts` 的。
 *
 * 做法是把内存里的文件喂给 TypeScript 的 Program + Checker，
 * 于是 import 路径、重命名导入、barrel 再导出、路径别名等都由编译器正确处理。
 * 任何异常都退化为空映射，调用方回退到基于名字的兜底规则。
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
    for (const f of files) {
      const p = toVirtualPath(f.name);
      pathToPackage.set(p, f.name);
      contents.set(p, f.content);
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

    const program = ts.createProgram([...contents.keys()], options, host);
    const checker = program.getTypeChecker();
    const byFile = new Map<string, Map<string, ResolvedType>>();

    for (const sf of program.getSourceFiles()) {
      const pkg = pathToPackage.get(sf.fileName);
      if (pkg === undefined) continue; // 编译器生成的、或不在文件集里的

      const map = new Map<string, ResolvedType>();
      const record = (nameNode: any) => {
        if (!nameNode || !ts.isIdentifier(nameNode)) return; // 只处理简单标识符，跳过 A.B
        const localName: string = nameNode.text;
        if (!localName) return;
        try {
          let sym = checker.getSymbolAtLocation(nameNode);
          if (!sym) return;
          if (sym.flags & ts.SymbolFlags.Alias) sym = checker.getAliasedSymbol(sym);
          const declFile = sym.declarations?.[0]?.getSourceFile()?.fileName;
          const target = declFile ? pathToPackage.get(declFile) : undefined;
          if (target === undefined) return; // 内置类型 / 未知来源
          const declaredName: string = sym.getName();
          const existing = map.get(localName);
          // 同一文件里同名解析到不同声明（局部遮蔽）-> 标记为不可用
          if (existing !== undefined && (existing.pkg !== target || existing.name !== declaredName)) {
            map.set(localName, { pkg: '', name: '' });
          } else {
            map.set(localName, { pkg: target, name: declaredName });
          }
        } catch {
          // 单个符号解析失败不影响其它
        }
      };

      const visit = (node: any) => {
        if (ts.isTypeReferenceNode(node)) record(node.typeName);
        else if (ts.isExpressionWithTypeArguments(node)) record(node.expression);
        else if (ts.isTypeQueryNode(node)) record(node.exprName);
        ts.forEachChild(node, visit);
      };
      ts.forEachChild(sf, visit);

      byFile.set(pkg, map);
    }

    return { byFile };
  } catch {
    return EMPTY;
  }
}
