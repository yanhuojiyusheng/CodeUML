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

import { SourceFile, ConfigFile } from './merge';

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

/** package.json 里声明的入口（按优先级） */
function packageEntryCandidates(json: any): string[] {
  const out: string[] = [];
  const push = (v: unknown) => {
    if (typeof v === 'string' && v) out.push(v.replace(/^\.?\//, ''));
  };
  push(json?.types);
  push(json?.typings);

  const exp = json?.exports;
  if (typeof exp === 'string') {
    push(exp);
  } else if (exp && typeof exp === 'object') {
    // exports 可能直接是条件对象，也可能挂在 '.' 下
    const dot = (exp as any)['.'] ?? exp;
    if (typeof dot === 'string') push(dot);
    else if (dot && typeof dot === 'object') {
      push(dot.types);
      push(dot.import);
      push(dot.require);
      push(dot.default);
    }
  }

  push(json?.module);
  if (typeof json?.main === 'string') push(json.main.replace(/\.([cm])?js$/, '.ts'));
  return out;
}

/**
 * 从拖入的 package.json 建出 TS 的 `paths`：workspace 包名 -> 包入口。
 * 地址是权威的（包名唯一），因此不像 tsconfig 那样会互相冲突。
 * 入口按优先级列出多个候选，TS 会依次尝试，取第一个真实存在的。
 */
function buildPackagePaths(configs: ConfigFile[]): Record<string, string[]> {
  const paths: Record<string, string[]> = {};
  for (const cfg of configs) {
    if (!/(^|\/)package\.json$/i.test(cfg.name)) continue;
    let json: any;
    try {
      json = JSON.parse(cfg.content);
    } catch {
      continue; // 非合法 JSON，忽略
    }
    const name = json?.name;
    if (typeof name !== 'string' || !name) continue;

    const dir = cfg.name.replace(/\/[^/]*$/, '');
    const prefix = dir ? `${dir}/` : '';
    const candidates = [
      ...packageEntryCandidates(json),
      // package.json 常指向构建产物（dist/）而那里不在文件集里，所以再补源码入口兜底
      'src/index.ts', 'src/index.tsx', 'index.ts', 'index.tsx',
    ];
    paths[name] = [...new Set(candidates.map(e => toVirtualPath(`${prefix}${e}`)))];
    // 子路径 import（@scope/pkg/xxx）
    paths[`${name}/*`] = [toVirtualPath(`${prefix}*`)];
  }
  return paths;
}

/** 符号的声明名：default 导出要取声明本身的名字（`export default class Foo` -> Foo） */
function declaredNameOf(sym: any, decl: any): string {
  const nameNode = decl && decl.name;
  if (nameNode && typeof nameNode.getText === 'function') return nameNode.getText();
  return sym.getName();
}

/** 目录名（包名统一用 /） */
function dirname(p: string): string {
  const i = p.lastIndexOf('/');
  return i < 0 ? '' : p.slice(0, i);
}

/** 拼接并归一化路径（处理 . 与 ..） */
function joinPath(a: string, b: string): string {
  const out: string[] = [];
  for (const seg of [...(a ? a.split('/') : []), ...b.split('/')]) {
    if (!seg || seg === '.') continue;
    if (seg === '..') out.pop();
    else out.push(seg);
  }
  return out.join('/');
}

interface ResolvedTsconfig {
  dir: string;                              // tsconfig 所在目录
  paths: Record<string, string[]> | null;   // 值已归一成虚拟绝对路径
}

/** `extends` 的引用路径（仅支持相对路径） */
function resolveConfigRef(fromName: string, ref: string): string | null {
  if (!ref.startsWith('.')) return null; // 包名形式的 extends 不支持
  const base = joinPath(dirname(fromName), ref);
  return base.toLowerCase().endsWith('.json') ? base : `${base}.json`;
}

/**
 * 解析所有 tsconfig（含 extends 继承），把 paths 归一成虚拟绝对路径。
 * baseUrl/paths 是相对于「声明它的那份 tsconfig」解析的，extends 也是这个语义。
 */
function loadTsconfigs(configs: ConfigFile[]): ResolvedTsconfig[] {
  const contents = new Map(configs.map(c => [c.name, c.content]));
  const cache = new Map<string, ResolvedTsconfig | null>();

  const load = (name: string, seen: Set<string>): ResolvedTsconfig | null => {
    if (cache.has(name)) return cache.get(name)!;
    if (seen.has(name)) return null; // extends 成环
    seen.add(name);
    const content = contents.get(name);
    if (content === undefined) return null;
    let json: any;
    try {
      json = JSON.parse(content);
    } catch {
      return null;
    }

    let inherited: ResolvedTsconfig | null = null;
    if (typeof json?.extends === 'string') {
      const ref = resolveConfigRef(name, json.extends);
      if (ref) inherited = load(ref, seen);
    }

    const dir = dirname(name);
    // 统一成虚拟绝对目录（带前导 /），才能和 containingFile 做前缀匹配；根目录用空串
    const vdir = dir ? toVirtualPath(dir) : '';
    const co = json?.compilerOptions ?? {};
    let paths = inherited?.paths ?? null;
    if (co.paths && typeof co.paths === 'object') {
      const base = typeof co.baseUrl === 'string' ? joinPath(vdir, co.baseUrl) : vdir;
      paths = {};
      for (const [pattern, targets] of Object.entries(co.paths as Record<string, unknown>)) {
        if (!Array.isArray(targets)) continue;
        paths[pattern] = targets
          .filter((t): t is string => typeof t === 'string')
          .map(t => toVirtualPath(joinPath(base, t)));
      }
    }

    const resolved: ResolvedTsconfig = { dir: vdir, paths };
    cache.set(name, resolved);
    return resolved;
  };

  const out: ResolvedTsconfig[] = [];
  for (const cfg of configs) {
    if (!/(^|\/)tsconfig(\.[^/]*)?\.json$/i.test(cfg.name)) continue;
    const resolved = load(cfg.name, new Set());
    if (resolved?.paths) out.push(resolved);
  }
  // 目录深的优先，便于「就近匹配」；根目录（''）排最后
  return out.sort((a, b) => b.dir.length - a.dir.length);
}

function scriptKindFor(fileName: string) {
  const n = fileName.toLowerCase();
  if (n.endsWith('.tsx')) return ts.ScriptKind.TSX;
  if (n.endsWith('.jsx')) return ts.ScriptKind.JSX;
  if (n.endsWith('.js') || n.endsWith('.mjs') || n.endsWith('.cjs')) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

/** 用内存文件构建 Program，得到「文件 -> 类型名 -> 所在包」的映射；失败则返回空映射 */
export function resolveTypes(files: SourceFile[], configs: ConfigFile[] = []): TypeResolution {
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
    // paths：把 workspace 包名（@scope/pkg）映射到实际文件，否则裸包名无法解析
    const packagePaths = buildPackagePaths(configs);
    const tsconfigs = loadTsconfigs(configs);
    const options = {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.NodeJs,
      jsx: ts.JsxEmit.Preserve,
      noLib: true,
      skipLibCheck: true,
      allowJs: true,
      checkJs: false,
      ...(Object.keys(packagePaths).length > 0 ? { baseUrl: '/', paths: packagePaths } : {}),
    };

    /** 对某个文件应用「就近的 tsconfig paths」（值已经是绝对虚拟路径） */
    const pathsFor = (containingFile: string) => {
      const dir = dirname(containingFile);
      const hit = tsconfigs.find(c => c.dir === '' || dir === c.dir || dir.startsWith(c.dir + '/'));
      if (!hit?.paths) return null;
      return { baseUrl: '/', paths: { ...packagePaths, ...hit.paths } };
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
      // 让每个文件用它自己就近的 tsconfig paths，而不是全局一套
      resolveModuleNames: (moduleNames: string[], containingFile: string) => {
        const per = pathsFor(containingFile);
        const opts = per ? { ...options, ...per } : options;
        return moduleNames.map(n => ts.resolveModuleName(n, containingFile, opts, host).resolvedModule);
      },
    };

    const program = ts.createProgram(roots, options, host);
    const checker = program.getTypeChecker();
    const byFile = new Map<string, Map<string, ResolvedType>>();

    for (const f of files) {
      const sf = program.getSourceFile(toVirtualPath(f.name));
      if (!sf) continue; // 解析失败的 root
      const map = new Map<string, ResolvedType>();

    /** 把一个导入绑定名解析成「真正的声明」；isNamespace 表示 `import * as NS`，name 记为空字符串 */
      const record = (nameNode: any, isNamespace = false) => {
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
          const resolved: ResolvedType = isNamespace
            ? { pkg: target, name: '' } // 命名空间本身不是类型，仅用作限定名前缀
            : { pkg: target, name: declaredNameOf(sym, decl) };
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
        if (bindings && ts.isNamespaceImport(bindings)) {
          // import * as NS from '...' -> 只用于 NS.Type 限定引用
          record(bindings.name, true);
        } else if (bindings && ts.isNamedImports(bindings)) {
          // import { A, B as C, type D } from '...' -> 本地名是 el.name
          for (const el of bindings.elements) record(el.name);
        }
      }

      byFile.set(f.name, map);
    }

    return { byFile };
  } catch {
    return EMPTY;
  }
}
