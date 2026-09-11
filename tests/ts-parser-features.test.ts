/**
 * TS 解析能力补齐
 *
 * 覆盖四类现有缺口（详见提交说明）：
 *   1. .tsx / .jsx 未按扩展名选择 ScriptKind，同行 JSX 会让后续声明整块丢失
 *   2. namespace / module 内的声明没有递归进入
 *   3. 方法/构造函数/接口方法的重载签名被重复列为多条成员
 *   4. type 别名不参与类型解析，导致属性关系断裂
 */

import { parseCode } from '../src/core/parser';
import { parseFilesWithCrossFileTypes, mergeParsedData, ParseReport } from '../src/core/merge';

const mergeFiles = (files: { name: string; content: string }[]) =>
  mergeParsedData(parseFilesWithCrossFileTypes(files)).merged;

describe('.tsx / .jsx 按扩展名选择 ScriptKind', () => {
  test('同行 JSX 之后的声明不应丢失（.tsx）', () => {
    const parsed = parseFilesWithCrossFileTypes([
      { name: 'src/widget.tsx', content: 'const el = <Foo bar={1}>hi</Foo>; class Widget { id: string; }' },
    ]);
    expect(parsed.get('src/widget.tsx')?.classes.map(c => c.name)).toContain('Widget');
  });

  test('.tsx 中声明的类型可被其他文件引用', () => {
    const merged = mergeFiles([
      { name: 'src/widget.tsx', content: 'const el = <Foo bar={1}>hi</Foo>; export class Widget { id: string; }' },
      { name: 'src/model.ts', content: 'class Model { w: Widget; }' },
    ]);
    expect(merged.classes.map(c => c.name)).toEqual(expect.arrayContaining(['Widget', 'Model']));
    expect(merged.relations.find(r => r.from === 'Model' && r.to === 'Widget')).toBeDefined();
  });

  test('普通 .ts 不受影响', () => {
    const merged = mergeFiles([
      { name: 'src/plain.ts', content: 'class Plain { x: number; }' },
    ]);
    expect(merged.classes.map(c => c.name)).toEqual(['Plain']);
  });
});

describe('namespace / module 内的声明', () => {
  test('顶层 namespace 内的类应被解析', () => {
    expect(parseCode(`namespace Geometry { export class Point { x: number; } }`).classes.map(c => c.name))
      .toContain('Point');
  });

  test('嵌套 namespace 内的类应被解析', () => {
    expect(parseCode(`namespace A { namespace B { export class Deep {} } }`).classes.map(c => c.name))
      .toContain('Deep');
  });

  test('namespace 内的类仍能建立关系', () => {
    const r = parseCode(`
      class Base {}
      namespace NS { export class Impl extends Base {} }
    `);
    expect(r.relations.find(x => x.from === 'Impl' && x.to === 'Base' && x.type === 'extends')).toBeDefined();
  });

  test('跨文件的 namespace 类型也应被收集', () => {
    const merged = mergeFiles([
      { name: 'dom.ts', content: `namespace UI { export class Button {} }` },
      { name: 'page.ts', content: `class Page { b: UI.Button; }` },
    ]);
    expect(merged.classes.map(c => c.name)).toContain('Button');
  });
});

describe('方法重载', () => {
  test('类方法重载只保留一条成员', () => {
    const r = parseCode(`class A { m(x: string): void; m(x: number): void; m(x: any): void {} }`);
    expect(r.classes[0].members.filter(m => m.name === 'm')).toHaveLength(1);
  });

  test('构造函数重载只保留一条成员', () => {
    const r = parseCode(`class A { constructor(x: string); constructor(x: any) {} }`);
    expect(r.classes[0].members.filter(m => m.name === 'constructor')).toHaveLength(1);
  });

  test('接口方法重载只保留一条成员', () => {
    const r = parseCode(`interface I { m(x: string): void; m(x: number): void; }`);
    expect(r.classes[0].members.filter(m => m.name === 'm')).toHaveLength(1);
  });

  test('没有重载时成员不受影响', () => {
    const r = parseCode(`class A { a(): void {} b(): number { return 1; } }`);
    expect(r.classes[0].members.filter(m => m.kind === 'method')).toHaveLength(2);
  });
});

describe('type 别名', () => {
  test('同文件内别名作为属性类型时解析到目标类型', () => {
    const r = parseCode(`class User {} type UserRef = User; class App { u: UserRef; }`);
    expect(r.relations.find(x => x.from === 'App' && x.to === 'User')).toBeDefined();
  });

  test('跨文件别名同样生效', () => {
    const merged = mergeFiles([
      { name: 'model.ts', content: 'export class User { id: string; }' },
      { name: 'types.ts', content: 'export type UserRef = User;' },
      { name: 'app.ts', content: `class App { u: UserRef; }` },
    ]);
    expect(merged.relations.find(x => x.from === 'App' && x.to === 'User')).toBeDefined();
  });

  test('别名指向基础类型时不产生关系', () => {
    const r = parseCode(`type Id = string; class A { id: Id; }`);
    expect(r.relations).toHaveLength(0);
  });

  test('别名为集合类型时保留多重性', () => {
    const r = parseCode(`class User {} type Users = User[]; class App { us: Users; }`);
    const rel = r.relations.find(x => x.from === 'App' && x.to === 'User');
    expect(rel).toBeDefined();
    expect(rel?.toMultiplicity).toBe('*');
  });

  test('别名可嵌套（A -> B -> User）', () => {
    const r = parseCode(`class User {} type B = User; type A = B; class App { u: A; }`);
    expect(r.relations.find(x => x.from === 'App' && x.to === 'User')).toBeDefined();
  });

  test('别名出现在泛型实参里也能解析', () => {
    const r = parseCode(`class User {} type UserRef = User; class App { m(): Promise<UserRef> { return null as any; } }`);
    expect(r.relations.find(x => x.from === 'App' && x.to === 'User')).toBeDefined();
  });
});

describe('泛型实参一致性（用户泛型 vs 内建泛型）', () => {
  test('用户泛型的类型实参应建立关系', () => {
    const r = parseCode(`class Foo {} class Repo<T> {} class A { r: Repo<Foo>; }`);
    expect(r.relations.find(x => x.from === 'A' && x.to === 'Repo')).toBeDefined();
    expect(r.relations.find(x => x.from === 'A' && x.to === 'Foo')).toBeDefined();
  });

  test('继承泛型实参产生依赖', () => {
    const r = parseCode(`class Foo {} class Base<T> {} class A extends Base<Foo> {}`);
    expect(r.relations.find(x => x.from === 'A' && x.to === 'Base')?.type).toBe('extends');
    expect(r.relations.find(x => x.from === 'A' && x.to === 'Foo')?.type).toBe('dependency');
  });

  test('接口继承泛型实参产生依赖', () => {
    const r = parseCode(`class Foo {} interface Base<T> {} interface Sub extends Base<Foo> {}`);
    expect(r.relations.find(x => x.from === 'Sub' && x.to === 'Base')?.type).toBe('extends');
    expect(r.relations.find(x => x.from === 'Sub' && x.to === 'Foo')?.type).toBe('dependency');
  });

  test('泛型参数本身仍被排除', () => {
    const r = parseCode(`class A<U> { u: U; list: U[] = []; }`);
    expect(r.relations).toHaveLength(0);
  });

  test('内建泛型与用户泛型行为一致（同一目标只产生一条关系）', () => {
    const r = parseCode(`class Foo {} class Repo<T> {} class A { p: Promise<Foo>; r: Repo<Foo>; }`);
    expect(r.relations.filter(x => x.from === 'A' && x.to === 'Foo')).toHaveLength(1);
  });

  test('嵌套泛型实参也能解析', () => {
    const r = parseCode(`class Foo {} class Bar {} class A { x: Map<string, Repo<Foo>>; }
      class Repo<T> {}`);
    expect(r.relations.find(x => x.from === 'A' && x.to === 'Foo')).toBeDefined();
  });
});

describe('集合容器统一为聚合', () => {
  const cases: [string, string][] = [
    ['Array', 'Tag[]'],
    ['Set', 'Set<Tag>'],
    ['ReadonlySet', 'ReadonlySet<Tag>'],
    ['WeakSet', 'WeakSet<Tag>'],
    ['Map', 'Map<string, Tag>'],
    ['ReadonlyMap', 'ReadonlyMap<string, Tag>'],
  ];
  for (const [label, type] of cases) {
    test(`${label} -> 聚合 *`, () => {
      const r = parseCode(`class Tag {} class A { x: ${type}; }`);
      const rel = r.relations.find(x => x.from === 'A' && x.to === 'Tag');
      expect(rel?.type).toBe('aggregation');
      expect(rel?.toMultiplicity).toBe('*');
    });
  }

  test('Record 维持关联（映射类型，不是集合容器）', () => {
    const r = parseCode(`class Tag {} class A { x: Record<string, Tag>; }`);
    expect(r.relations.find(x => x.from === 'A' && x.to === 'Tag')?.type).toBe('association');
  });
});

describe('跨文件同名类上报', () => {
  test('同一名字出现在多个包时都会保留并上报', () => {
    const report: ParseReport = { failures: [], duplicates: [], ambiguous: [] };
    const parsed = parseFilesWithCrossFileTypes([
      { name: 'src/a.ts', content: 'export class Config { a: number; }' },
      { name: 'src/b.ts', content: 'export class Config { b: number; }' },
    ], report);
    const { merged } = mergeParsedData(parsed);
    // 重名类不再被丢弃，而是按包区分
    expect(merged.classes.filter(c => (c.displayName || c.name).startsWith('Config'))).toHaveLength(2);
    // 同时显式上报
    expect(report.duplicates).toEqual([{ name: 'Config', packages: ['src/a.ts', 'src/b.ts'] }]);
  });

  test('无重名时 duplicates 为空', () => {
    const report: ParseReport = { failures: [], duplicates: [], ambiguous: [] };
    parseFilesWithCrossFileTypes([
      { name: 'a.ts', content: 'class A {}' },
      { name: 'b.ts', content: 'class B {}' },
    ], report);
    expect(report.duplicates).toEqual([]);
  });
});

describe('解析失败上报', () => {
  test('语法错误的文件被记录到 report', () => {
    const report: ParseReport = { failures: [], duplicates: [], ambiguous: [] };
    parseFilesWithCrossFileTypes([
      { name: 'ok.ts', content: 'class Ok {}' },
      { name: 'broken.ts', content: 'class Foo { bar( }' },
    ], report);
    expect(report.failures.map(f => f.name)).toEqual(['broken.ts']);
    expect(report.failures[0].message).toBeTruthy();
  });

  test('全部合法时 report 为空', () => {
    const report: ParseReport = { failures: [], duplicates: [], ambiguous: [] };
    parseFilesWithCrossFileTypes([
      { name: 'a.ts', content: 'class A { x: number; }' },
      { name: 'b.tsx', content: 'const el = <Foo bar={1}>hi</Foo>; class B {}' },
    ], report);
    expect(report.failures).toEqual([]);
  });

  test('同一文件的多个错误只记录一条', () => {
    const report: ParseReport = { failures: [], duplicates: [], ambiguous: [] };
    parseFilesWithCrossFileTypes([
      { name: 'bad.ts', content: 'class A { x: ;;; } class B { y( }' },
    ], report);
    expect(report.failures.filter(f => f.name === 'bad.ts')).toHaveLength(1);
  });

  test('不传 report 时行为不变（向后兼容）', () => {
    const parsed = parseFilesWithCrossFileTypes([
      { name: 'ok.ts', content: 'class Ok {}' },
    ]);
    expect(parsed.get('ok.ts')?.classes.map(c => c.name)).toEqual(['Ok']);
  });
});

describe('索引签名与调用签名', () => {
  test('接口索引签名成为一条成员', () => {
    const r = parseCode('interface Dict { [key: string]: number; read(): void; }');
    const m = r.classes[0].members.find(x => x.name.includes('[key'));
    expect(m).toBeDefined();
    expect(m!.type).toBe('number');
  });

  test('索引签名的值类型是用户类型时产生关系', () => {
    const r = parseCode('class Foo {} interface Dict { [k: string]: Foo; }');
    expect(r.relations.find(x => x.from === 'Dict' && x.to === 'Foo' && x.type === 'association')).toBeDefined();
  });

  test('调用签名成为一条成员', () => {
    const r = parseCode('interface Fn { (x: string): number; }');
    const m = r.classes[0].members.find(x => x.kind === 'method');
    expect(m).toBeDefined();
    expect(m!.params).toContain('x: string');
    expect(m!.type).toBe('number');
  });

  test('构造签名也成为一条成员', () => {
    const r = parseCode('interface Ctor { new (x: string): Object; }');
    const m = r.classes[0].members.find(x => x.kind === 'method');
    expect(m).toBeDefined();
    expect(m!.params).toContain('x: string');
  });

  test('普通接口方法不受影响', () => {
    const r = parseCode('interface Svc { run(a: string): void; }');
    expect(r.classes[0].members.filter(x => x.kind === 'method')).toHaveLength(1);
    expect(r.classes[0].members[0].name).toBe('run');
  });
});
