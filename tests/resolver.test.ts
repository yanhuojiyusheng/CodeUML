/**
 * 语义解析的 import 形式覆盖
 *
 * 关键回归：拖入文件夹时文件名保留扩展名后，
 * `import … from "./args"` 与 `"./args.ts"` 都必须精确命中同一个包。
 */

import { parseFilesWithCrossFileTypes, mergeParsedData, ParseReport } from '../src/core/merge';

const emptyReport = (): ParseReport => ({ failures: [], duplicates: [], ambiguous: [] });

const build = (files: { name: string; content: string }[], report?: ParseReport) => {
  const parsed = parseFilesWithCrossFileTypes(files, report);
  return mergeParsedData(parsed).merged;
};

const buildWithConfigs = (
  files: { name: string; content: string }[],
  report: ParseReport,
  configs: { name: string; content: string }[],
) => mergeParsedData(parseFilesWithCrossFileTypes(files, report, configs)).merged;

const targetsOf = (merged: ReturnType<typeof build>, from: string) =>
  merged.relations.filter(r => r.from === from).map(r => merged.classes.find(c => c.name === r.to)?.packageName).sort();

const caseFiles = (importLine: string, name: string) => [
  { name: 'src/cli/args.ts', content: 'export interface Args { a: string; }' },
  { name: 'src/other/args.ts', content: 'export interface Args { b: number; }' },
  { name: 'src/cli/initial-message.ts', content: `${importLine}\nexport interface M { parsed: Args; }` },
];

describe('语义解析：import 形式', () => {
  test('import … from "./args"（无扩展名）', () => {
    const merged = build(caseFiles(`import type { Args } from "./args";`, 'M'));
    expect(targetsOf(merged, 'M')).toEqual(['src/cli/args.ts']);
  });

  test('import … from "./args.ts"（带扩展名，用户实际遇到的写法）', () => {
    const merged = build(caseFiles(`import type { Args } from "./args.ts";`, 'M'));
    expect(targetsOf(merged, 'M')).toEqual(['src/cli/args.ts']);
  });

  test('同时存在无法解析的外部包 import 时，不影响本文件的其它解析', () => {
    const files = caseFiles(`import type { ImageContent } from "@earendil-works/pi-ai";\nimport type { Args } from "./args.ts";`, 'M');
    files[2].content = `import type { ImageContent } from "@earendil-works/pi-ai";\nimport type { Args } from "./args.ts";\nexport interface M { parsed: Args; fileImages?: ImageContent[]; }`;
    const merged = build(files);
    expect(targetsOf(merged, 'M')).toEqual(['src/cli/args.ts']);
  });
});

describe('语义解析：包名没有扩展名时的兜底', () => {
  test('扩展名被去掉过（旧数据 / 手工新建）也能解析 import', () => {
    const merged = build([
      { name: 'src/cli/args', content: 'export interface Args { a: string; }' },
      { name: 'src/other/args', content: 'export interface Args { b: number; }' },
      { name: 'src/cli/initial-message.ts', content: 'import type { Args } from "./args";\nexport interface M { parsed: Args; }' },
    ]);
    expect(targetsOf(merged, 'M')).toEqual(['src/cli/args']);
  });

  test('带扩展名 import 指向无扩展名包也能解析', () => {
    const merged = build([
      { name: 'src/cli/args', content: 'export interface Args { a: string; }' },
      { name: 'src/other/args', content: 'export interface Args { b: number; }' },
      { name: 'src/cli/initial-message.ts', content: 'import type { Args } from "./args.ts";\nexport interface M { parsed: Args; }' },
    ]);
    expect(targetsOf(merged, 'M')).toEqual(['src/cli/args']);
  });
});

describe('语义解析：值位置的引用（new X()）', () => {
  const files = (body: string) => [
    { name: 'packages/client/src/errors.ts', content: 'export class ServerError extends Error {}' },
    { name: 'packages/server/src/errors.ts', content: 'export class ServerError extends Error {}' },
    {
      name: 'packages/client/src/client.ts',
      content: `import { ServerError } from "./errors.ts";\n${body}`,
    },
  ];

  test('throw new X() 也按 import 精确解析，且不报歧义', () => {
    const report = emptyReport();
    const merged = build(files(`export class Client { fail() { throw new ServerError('x'); } }`), report);
    const rels = merged.relations.filter(r => r.from === 'Client');
    expect(rels).toHaveLength(1);
    expect(merged.classes.find(c => c.name === rels[0].to)?.packageName).toBe('packages/client/src/errors.ts');
    expect(report.ambiguous).toEqual([]);
  });

  test('方法体内的 new X() 同理', () => {
    const report = emptyReport();
    const merged = build(files(`export class Client { fail() { const e = new ServerError('x'); return e; } }`), report);
    const rels = merged.relations.filter(r => r.from === 'Client');
    expect(rels).toHaveLength(1);
    expect(merged.classes.find(c => c.name === rels[0].to)?.packageName).toBe('packages/client/src/errors.ts');
    expect(report.ambiguous).toEqual([]);
  });

  test('属性初始化 new X()（组合）也能精确解析', () => {
    const report = emptyReport();
    const merged = build(files(`export class Client { private e = new ServerError(); }`), report);
    const rels = merged.relations.filter(r => r.from === 'Client');
    expect(rels).toHaveLength(1);
    expect(rels[0].type).toBe('composition');
    expect(merged.classes.find(c => c.name === rels[0].to)?.packageName).toBe('packages/client/src/errors.ts');
    expect(report.ambiguous).toEqual([]);
  });

  test('值位置与类型位置混用时也精确', () => {
    const report = emptyReport();
    const merged = build(files(`export class Client { private e?: ServerError; fail() { throw new ServerError('x'); } }`), report);
    const rels = merged.relations.filter(r => r.from === 'Client');
    expect(rels).toHaveLength(1);
    expect(merged.classes.find(c => c.name === rels[0].to)?.packageName).toBe('packages/client/src/errors.ts');
    expect(report.ambiguous).toEqual([]);
  });
});

describe('语义解析：以 import 声明为唯一依据（与使用位置无关）', () => {
  test('default import：本地名与声明名不同也能指向正确文件', () => {
    const report = emptyReport();
    const merged = build([
      { name: 'src/foo.ts', content: 'export default class Widget { x = 1; }' },
      { name: 'src/other.ts', content: 'export class Widget { y = 1; }' },
      { name: 'src/use.ts', content: 'import W from "./foo.ts";\nexport class Use { w: W; }' },
    ], report);
    const rel = merged.relations.find(r => r.from === 'Use');
    expect(rel).toBeDefined();
    expect(merged.classes.find(c => c.name === rel!.to)?.packageName).toBe('src/foo.ts');
    expect(report.ambiguous).toEqual([]);
  });

  test('经过 barrel 再导出，仍指向真正的声明处', () => {
    const report = emptyReport();
    const merged = build([
      { name: 'src/impl.ts', content: 'export class Thing { a = 1; }' },
      { name: 'src/other.ts', content: 'export class Thing { b = 1; }' },
      { name: 'src/barrel.ts', content: 'export * from "./impl.ts";' },
      { name: 'src/use.ts', content: 'import { Thing } from "./barrel.ts";\nexport class Use { t: Thing; }' },
    ], report);
    const rel = merged.relations.find(r => r.from === 'Use');
    expect(rel).toBeDefined();
    expect(merged.classes.find(c => c.name === rel!.to)?.packageName).toBe('src/impl.ts');
    expect(report.ambiguous).toEqual([]);
  });

  test('inline type 修饰符（import { type X }）', () => {
    const report = emptyReport();
    const merged = build([
      { name: 'src/args.ts', content: 'export interface Args { a: string; }' },
      { name: 'src/other.ts', content: 'export interface Args { b: string; }' },
      { name: 'src/use.ts', content: 'import { type Args } from "./args.ts";\nexport class Use { a: Args; }' },
    ], report);
    expect(merged.relations.find(r => r.from === 'Use')).toBeDefined();
    expect(report.ambiguous).toEqual([]);
  });

  test('import 了但没用到：不产生多余关系', () => {
    const report = emptyReport();
    const merged = build([
      { name: 'src/args.ts', content: 'export interface Args { a: string; }' },
      { name: 'src/use.ts', content: 'import { Args } from "./args.ts";\nexport class Use { x = 1; }' },
    ], report);
    expect(merged.relations.filter(r => r.from === 'Use')).toEqual([]);
    expect(report.ambiguous).toEqual([]);
  });
});

describe('跨文件类型别名：在别名定义处的作用域里解析', () => {
  const entryTypes = `
    export interface MessageEntry { id: string; }
    export interface CompactionEntry { summary: string; }
    export interface BranchSummaryEntry { branch: string; }
    export interface CustomEntry { data: string; }
    export type Entry = MessageEntry | CompactionEntry | BranchSummaryEntry | CustomEntry;
  `;
  const otherPackage = `
    export interface CompactionEntry { other: number; }
    export interface BranchSummaryEntry { other: number; }
    export interface CustomEntry { other: number; }
  `;

  test('别名展开成联合成员时，在别名所在文件里解析（不再误报歧义）', () => {
    const report = emptyReport();
    const merged = build([
      { name: 'packages/agent/src/harness/session/types.ts', content: entryTypes },
      { name: 'packages/coding-agent/src/core/session-manager.ts', content: otherPackage },
      {
        name: 'packages/agent/src/harness/agent-harness.ts',
        content: 'import type { Entry } from "./session/types.ts";\nexport interface LaneSnapshot { lane: string; transcript: Entry[]; }',
      },
    ], report);

    const targets = merged.relations.filter(r => r.from === 'LaneSnapshot');
    const pkgs = targets.map(r => merged.classes.find(c => c.name === r.to)?.packageName);
    // 四个成员都在 types.ts，且都带聚合多重性
    expect(targets).toHaveLength(4);
    expect(new Set(pkgs)).toEqual(new Set(['packages/agent/src/harness/session/types.ts']));
    expect(targets.every(r => r.type === 'aggregation' && r.toMultiplicity === '*')).toBe(true);
    expect(report.ambiguous).toEqual([]);
  });

  test('别名 RHS 引用的是别名所在文件 import 进来的类型', () => {
    const report = emptyReport();
    const merged = build([
      { name: 'p/x/types.ts', content: 'export interface Inner { a: string; }' },
      { name: 'p/y/types.ts', content: 'export interface Inner { b: string; }' },
      { name: 'p/shared.ts', content: 'import type { Inner } from "./x/types.ts";\nexport type Alias = Inner;' },
      { name: 'p/use.ts', content: 'import type { Alias } from "./shared.ts";\nexport interface Use { v: Alias; }' },
    ], report);
    const rel = merged.relations.find(r => r.from === 'Use');
    expect(rel).toBeDefined();
    expect(merged.classes.find(c => c.name === rel!.to)?.packageName).toBe('p/x/types.ts');
    expect(report.ambiguous).toEqual([]);
  });

  test('无 import 时全局唯一的别名仍能展开（保留兜底）', () => {
    const merged = build([
      { name: 'model.ts', content: 'export class User { id = 1; }' },
      { name: 'types.ts', content: 'export type UserRef = User;' },
      { name: 'app.ts', content: 'export class App { u: UserRef; }' },
    ]);
    expect(merged.relations.find(r => r.from === 'App' && r.to === 'User')).toBeDefined();
  });

  test('同文件内的别名展开不受影响', () => {
    const merged = build([
      { name: 'a.ts', content: 'export interface A {} export type Ref = A; export class Use { r: Ref; }' },
    ]);
    expect(merged.relations.find(r => r.from === 'Use' && r.to === 'A')).toBeDefined();
  });
});

describe('workspace 包名（package.json）的解析', () => {
  const files = [
    { name: 'packages/chord/src/types.ts', content: 'export interface Context { chord: string; }' },
    { name: 'packages/chord/src/index.ts', content: 'export * from "./types.ts";' },
    { name: 'packages/ai/src/types.ts', content: 'export interface Context { ai: string; }' },
    {
      name: 'packages/agent/src/harness/env/nodejs.ts',
      content: 'import type { Context } from "@earendil-works/chord";\nexport interface NodeTextLineReader { ctx: Context; }',
    },
  ];
  const pkg = (dir: string, json: Record<string, unknown>) => ({
    name: `${dir}/package.json`,
    content: JSON.stringify(json),
  });

  test('通过包名 import，经包入口再穿透 barrel，精确命中', () => {
    const report = emptyReport();
    const merged = buildWithConfigs(files, report, [
      pkg('packages/chord', { name: '@earendil-works/chord', types: 'src/index.ts' }),
    ]);
    const rel = merged.relations.find(r => r.from === 'NodeTextLineReader');
    expect(rel).toBeDefined();
    expect(merged.classes.find(c => c.name === rel!.to)?.packageName).toBe('packages/chord/src/types.ts');
    expect(report.ambiguous).toEqual([]);
  });

  test('package.json 没写 types 时回退到 src/index.ts', () => {
    const report = emptyReport();
    const merged = buildWithConfigs(files, report, [
      pkg('packages/chord', { name: '@earendil-works/chord' }),
    ]);
    const rel = merged.relations.find(r => r.from === 'NodeTextLineReader');
    expect(merged.classes.find(c => c.name === rel!.to)?.packageName).toBe('packages/chord/src/types.ts');
    expect(report.ambiguous).toEqual([]);
  });

  test('exports 字段里的 types 也能识别', () => {
    const report = emptyReport();
    const merged = buildWithConfigs(files, report, [
      pkg('packages/chord', { name: '@earendil-works/chord', exports: { '.': { types: './src/index.ts' } } }),
    ]);
    const rel = merged.relations.find(r => r.from === 'NodeTextLineReader');
    expect(merged.classes.find(c => c.name === rel!.to)?.packageName).toBe('packages/chord/src/types.ts');
    expect(report.ambiguous).toEqual([]);
  });

  test('子路径 import：@scope/pkg/src/types.ts', () => {
    const report = emptyReport();
    const merged = buildWithConfigs([
      files[0],
      { name: 'packages/agent/src/a.ts', content: 'import type { Context } from "@earendil-works/chord/src/types.ts";\nexport interface Use { c: Context; }' },
    ], report, [pkg('packages/chord', { name: '@earendil-works/chord' })]);
    const rel = merged.relations.find(r => r.from === 'Use');
    expect(merged.classes.find(c => c.name === rel!.to)?.packageName).toBe('packages/chord/src/types.ts');
    expect(report.ambiguous).toEqual([]);
  });

  test('没有 package.json 时无法解析，仍报歧义（保持原行为）', () => {
    const report = emptyReport();
    buildWithConfigs(files, report, []);
    expect(report.ambiguous.length).toBeGreaterThan(0);
  });
});

describe('命名空间限定引用 NS.Type', () => {
  test('import * as NS 后 NS.Type 能精确解析（不再静默丢关系）', () => {
    const report = emptyReport();
    const merged = build([
      { name: 'p/types.ts', content: 'export interface Context { a: string; }' },
      { name: 'p/other.ts', content: 'export interface Context { b: string; }' },
      { name: 'p/use.ts', content: 'import * as T from "./types.ts";\nexport interface Use { ctx: T.Context; }' },
    ], report);
    const rel = merged.relations.find(r => r.from === 'Use');
    expect(rel).toBeDefined();
    expect(merged.classes.find(c => c.name === rel!.to)?.packageName).toBe('p/types.ts');
    expect(report.ambiguous).toEqual([]);
  });

  test('命名空间下不存在的名字不产生关系', () => {
    const merged = build([
      { name: 'p/types.ts', content: 'export interface Context { a: string; }' },
      { name: 'p/use.ts', content: 'import * as T from "./types.ts";\nexport interface Use { nope: T.Missing; }' },
    ]);
    expect(merged.relations.filter(r => r.from === 'Use')).toEqual([]);
  });

  test('外部包的命名空间限定名不会误连到同名本地类', () => {
    const merged = build([
      { name: 'p/types.ts', content: 'export interface Thing { a: string; }' },
      { name: 'p/use.ts', content: 'import * as NodeJS from "node:types";\nexport interface Use { t: NodeJS.Thing; }' },
    ]);
    expect(merged.relations.filter(r => r.from === 'Use')).toEqual([]);
  });
});

describe('tsconfig paths（按引用方就近匹配）', () => {
  const files = [
    { name: 'packages/a/src/types.ts', content: 'export interface Context { a: string; }' },
    { name: 'packages/b/src/types.ts', content: 'export interface Context { b: string; }' },
    { name: 'packages/a/src/use.ts', content: 'import type { Context } from "@/types.ts";\nexport interface UseA { c: Context; }' },
    { name: 'packages/b/src/use.ts', content: 'import type { Context } from "@/types.ts";\nexport interface UseB { c: Context; }' },
  ];
  const tsconfig = (dir: string, json: Record<string, unknown>) => ({
    name: `${dir}/tsconfig.json`,
    content: JSON.stringify(json),
  });

  test('两个包各自的 @/* 就近解析到本包的 src', () => {
    const report = emptyReport();
    const merged = buildWithConfigs(files, report, [
      tsconfig('packages/a', { compilerOptions: { baseUrl: '.', paths: { '@/*': ['src/*'] } } }),
      tsconfig('packages/b', { compilerOptions: { baseUrl: '.', paths: { '@/*': ['src/*'] } } }),
    ]);
    const a = merged.relations.find(r => r.from === 'UseA');
    const b = merged.relations.find(r => r.from === 'UseB');
    expect(merged.classes.find(c => c.name === a!.to)?.packageName).toBe('packages/a/src/types.ts');
    expect(merged.classes.find(c => c.name === b!.to)?.packageName).toBe('packages/b/src/types.ts');
    expect(report.ambiguous).toEqual([]);
  });

  test('extends 基础 tsconfig 时也能继承 paths（相对声明处解析）', () => {
    const report = emptyReport();
    const merged = buildWithConfigs([
      { name: 'packages/shared/src/types.ts', content: 'export interface Shared { a: string; }' },
      { name: 'packages/a/src/use.ts', content: 'import type { Shared } from "@shared/types.ts";\nexport interface UseA { s: Shared; }' },
    ], report, [
      { name: 'tsconfig.base.json', content: JSON.stringify({ compilerOptions: { baseUrl: '.', paths: { '@shared/*': ['packages/shared/src/*'] } } }) },
      tsconfig('packages/a', { extends: '../../tsconfig.base.json' }),
    ]);
    const rel = merged.relations.find(r => r.from === 'UseA');
    expect(rel).toBeDefined();
    expect(merged.classes.find(c => c.name === rel!.to)?.packageName).toBe('packages/shared/src/types.ts');
    expect(report.ambiguous).toEqual([]);
  });

  test('没有 tsconfig 时路径别名无法解析（保持原行为）', () => {
    const report = emptyReport();
    buildWithConfigs(files, report, []);
    expect(report.ambiguous.length).toBeGreaterThan(0);
  });
});
