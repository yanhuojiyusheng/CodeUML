/**
 * 多包（多文件）合并测试 —— 复杂场景与特殊情况
 *
 * 走生产代码路径：src/merge.ts（跨文件解析 + 合并去重）
 *                + src/plantuml.ts（PlantUML 文本输出）
 *                + src/layout.ts（包分组布局）
 *
 * 场景组织：
 * 1. 跨包关系拓扑（钻石继承、循环、泛型、工具类型、联合类型……）
 * 2. 跨包同名类去重策略
 * 3. 包名特殊情况（特殊字符、关键字、重名、空包……）
 * 4. 解析器特殊情况（泛型参数遮蔽、泛型实参、依赖来源……）
 * 5. 布局集成（包框、包内排序）
 */

import { parseFilesWithCrossFileTypes, mergeParsedData, SourceFile } from '../src/core/merge';
import { formatMergedPlantUML } from '../src/core/plantuml';
import { layoutDiagram } from '../src/core/layout';
import { ParsedData, Relation } from '../src/core/types';
import { validatePlantUML } from './helpers/plantuml-validator';

// ============================================================
// 工具函数
// ============================================================

interface BuildResult {
  allParsed: Map<string, ParsedData>;
  merged: ParsedData;
  classPackageMap: Map<string, string>;
  puml: string;
}

/** 走生产合并流程：解析多文件 → 合并 → 生成 PlantUML */
function build(files: SourceFile[]): BuildResult {
  const allParsed = parseFilesWithCrossFileTypes(files);
  const { merged, classPackageMap } = mergeParsedData(allParsed);
  const puml = formatMergedPlantUML(allParsed, classPackageMap);
  return { allParsed, merged, classPackageMap, puml };
}

/** 关系列表（可读形式，用于失败信息与整体断言） */
function relKeys(parsed: ParsedData): string[] {
  return parsed.relations.map(r => `${r.from} ${r.type} ${r.to}`);
}

function getRelation(
  parsed: ParsedData, from: string, to: string, type?: Relation['type']
): Relation | undefined {
  return parsed.relations.find(r => r.from === from && r.to === to && (!type || r.type === type));
}

/** 断言存在指定关系，返回该关系（便于进一步断言标签/多重性） */
function expectRelation(
  parsed: ParsedData, from: string, to: string, type: Relation['type']
): Relation {
  const r = getRelation(parsed, from, to, type);
  if (!r) {
    throw new Error(
      `缺少关系 [${from} ${type} ${to}]。实际关系：\n  ${relKeys(parsed).join('\n  ') || '(无)'}`
    );
  }
  return r;
}

// ============================================================
// 1. 跨包关系拓扑
// ============================================================

describe('多包合并 - 跨包关系拓扑', () => {

  test('四个包的钻石继承：接口多继承跨包展开', () => {
    const { merged, puml } = build([
      { name: 'core', content: 'interface Base { id: string; }' },
      { name: 'left', content: 'interface Left extends Base { l(): void; }' },
      { name: 'right', content: 'interface Right extends Base { r(): void; }' },
      { name: 'leaf', content: 'interface Leaf extends Left, Right { v(): void; }' },
    ]);

    expectRelation(merged, 'Left', 'Base', 'extends');
    expectRelation(merged, 'Right', 'Base', 'extends');
    expectRelation(merged, 'Leaf', 'Left', 'extends');
    expectRelation(merged, 'Leaf', 'Right', 'extends');
    expect(merged.relations).toHaveLength(4);

    // 四个包块都在，关系行在包块之后
    ['core', 'left', 'right', 'leaf'].forEach(pkg => {
      expect(puml).toContain(`package "${pkg}" {`);
    });
    expect(puml.indexOf('Leaf --|> Left')).toBeGreaterThan(puml.indexOf('package "leaf"'));
    expect(validatePlantUML(puml)).toEqual([]);
  });

  test('抽象类跨包继承链：abstract 关键字与箭头都正确', () => {
    const { merged, puml } = build([
      { name: 'base', content: 'abstract class Entity { abstract id(): string; }' },
      { name: 'mid', content: 'abstract class Timestamped extends Entity { abstract created(): Date; }' },
      { name: 'impl', content: 'class User extends Timestamped { id(): string { return ""; } created(): Date { return new Date(); } }' },
    ]);

    expectRelation(merged, 'Timestamped', 'Entity', 'extends');
    expectRelation(merged, 'User', 'Timestamped', 'extends');

    expect(puml).toContain('abstract class "Entity" as Entity {');
    expect(puml).toContain('abstract class "Timestamped" as Timestamped {');
    expect(puml).toContain('Timestamped --|> Entity');
    expect(puml).toContain('User --|> Timestamped');
    expect(validatePlantUML(puml)).toEqual([]);
  });

  test('跨包循环引用：双向关联 + 双向聚合', () => {
    const { merged, puml } = build([
      { name: 'order', content: 'class Order { private customer: Customer; }' },
      { name: 'customer', content: 'class Customer { private orders: Order[]; }' },
    ]);

    expectRelation(merged, 'Order', 'Customer', 'association');
    const agg = expectRelation(merged, 'Customer', 'Order', 'aggregation');
    expect(agg.toMultiplicity).toBe('*');

    expect(puml).toContain('Order --> Customer : customer');
    expect(puml).toContain('Customer o-- "*" Order : orders');
    expect(validatePlantUML(puml)).toEqual([]);
  });

  test('三包三跳环：组合 / 聚合 / 关联三种关系闭环', () => {
    const { merged } = build([
      { name: 'engine', content: 'class Engine { private fuel = new Fuel(); }' },
      { name: 'fuel', content: 'class Fuel { private tanks: Tank[]; }' },
      { name: 'tank', content: 'class Tank { private owner: Engine; }' },
    ]);

    expectRelation(merged, 'Engine', 'Fuel', 'composition');
    expectRelation(merged, 'Fuel', 'Tank', 'aggregation');
    expectRelation(merged, 'Tank', 'Engine', 'association');
    expect(merged.relations).toHaveLength(3);
  });

  test('同一个类被多个包引用：类只输出一次，关系全部保留', () => {
    const { merged, puml } = build([
      { name: 'core', content: 'class Core {}' },
      { name: 'a', content: 'class A { private c: Core; }' },
      { name: 'b', content: 'class B { private c: Core; }' },
      { name: 'c', content: 'class C { private c: Core; }' },
    ]);

    expect(merged.classes.filter(c => c.name === 'Core')).toHaveLength(1);
    expect((puml.match(/class "Core" as Core/g) || [])).toHaveLength(1);
    ['A', 'B', 'C'].forEach(src => expectRelation(merged, src, 'Core', 'association'));
    expect(validatePlantUML(puml)).toEqual([]);
  });

  test('六种关系同图（4 包 kitchen sink）', () => {
    const { merged, puml } = build([
      {
        name: 'core',
        content: `
          enum Gender { MALE, FEMALE }
          interface Serializable { serialize(): string; }
          abstract class Animal implements Serializable {
            private heart = new Heart();
            private gender: Gender;
            abstract makeSound(): void;
            serialize(): string { return ""; }
          }
          class Heart {}
        `,
      },
      {
        name: 'domain',
        content: `
          class Dog extends Animal {
            public owner: Owner;
            private toys: Toy[] = [];
            fetch(toy: Toy): Toy { return toy; }
            validate(rule: Rule): boolean { return true; }
          }
        `,
      },
      { name: 'player', content: 'class Owner { private dogs: Dog[]; }' },
      { name: 'stuff', content: 'class Toy { public name: string; } class Rule { check(): boolean { return true; } }' },
    ]);

    const expected = [
      'Animal implements Serializable',
      'Animal composition Heart',
      'Animal association Gender',
      'Dog extends Animal',
      'Dog association Owner',
      'Dog aggregation Toy',
      'Dog dependency Rule',
      'Owner aggregation Dog',
    ].sort();
    expect(relKeys(merged).sort()).toEqual(expected);

    // 六种箭头全部出现且语法合法
    ['--|>', '..|>', '*--', 'o--', '-->', '..>'].forEach(arrow => {
      expect(puml).toContain(` ${arrow} `);
    });
    expect(puml).toContain('Dog o-- "*" Toy : toys');
    expect(puml).toContain('Animal *-- Heart : heart');
    expect(validatePlantUML(puml)).toEqual([]);
  });

  test('跨包泛型实例化：泛型类本身与类型实参都建立关系', () => {
    const { merged, puml } = build([
      { name: 'model', content: 'class User { id: string; }' },
      { name: 'repo', content: 'class Repository<T> { private items: T[] = []; }' },
      { name: 'service', content: 'class UserService { private repo: Repository<User>; }' },
    ]);

    expectRelation(merged, 'UserService', 'Repository', 'association');
    expectRelation(merged, 'UserService', 'User', 'association');
    expect(merged.relations.filter(r => r.from === 'UserService')).toHaveLength(2);
    // 泛型参数 T 没有对应类型时不应产生关系
    expect(merged.relations.filter(r => r.from === 'Repository')).toHaveLength(0);
    expect(validatePlantUML(puml)).toEqual([]);
  });

  test('跨包工具类型剥壳：Partial/Required/Record/Set/ReadonlyArray/Map', () => {
    const { merged, puml } = build([
      { name: 'model', content: 'class User { id: string; } class Role { name: string; }' },
      {
        name: 'store',
        content: `
          class UserStore {
            private a: Partial<User>;
            private b: Required<User>;
            private c: Record<string, User>;
            private d: Set<User>;
            private e: ReadonlyArray<User>;
          }
          class Pair { private kv: Map<Role, User>; }
        `,
      },
    ]);

    // 五个字段指向同一类型 -> 合并为一条聚合（Set / ReadonlyArray 均为聚合 *）
    const toUser = expectRelation(merged, 'UserStore', 'User', 'aggregation');
    expect(toUser.toMultiplicity).toBe('*');
    expect(toUser.label).toBe('a, b, c, d, e');

    // Map<Role, User> -> 键与值都聚合
    const pairRole = expectRelation(merged, 'Pair', 'Role', 'aggregation');
    const pairUser = expectRelation(merged, 'Pair', 'User', 'aggregation');
    expect(pairRole.toMultiplicity).toBe('*');
    expect(pairUser.toMultiplicity).toBe('*');
    expect(validatePlantUML(puml)).toEqual([]);
  });

  test('跨包联合类型：多个目标各自生成关系并带 0..1 多重性', () => {
    const { merged, puml } = build([
      { name: 'model', content: 'class A {} class B {}' },
      { name: 'consumer', content: 'class C { private x: A | B | null; }' },
    ]);

    const ra = expectRelation(merged, 'C', 'A', 'association');
    const rb = expectRelation(merged, 'C', 'B', 'association');
    expect(ra.toMultiplicity).toBe('0..1');
    expect(rb.toMultiplicity).toBe('0..1');
    expect(puml).toContain('C --> "0..1" A : x');
    expect(puml).toContain('C --> "0..1" B : x');
    expect(validatePlantUML(puml)).toEqual([]);
  });

  test('前向引用：引用后续文件才定义的类也能建立关系', () => {
    const { merged, puml } = build([
      { name: 'z-first', content: 'class Consumer { private dep: Later; }' },
      { name: 'a-last', content: 'class Later {}' },
    ]);

    expectRelation(merged, 'Consumer', 'Later', 'association');
    expect(puml).toContain('Consumer --> Later : dep');
  });

  test('未在任何文件中定义的类型不产生悬空关系', () => {
    const { merged, puml } = build([
      { name: 'a', content: 'class A { private e: ExternalLib; private f: unknown; }' },
      { name: 'b', content: 'class B {}' },
    ]);

    expect(merged.relations).toHaveLength(0);
    // 类体中可以显示外部类型文本，但不应出现关系行
    expect(puml).toContain('- e : ExternalLib');
    expect(validatePlantUML(puml)).toEqual([]);
  });
});

// ============================================================
// 2. 跨包同名类去重
// ============================================================

describe('多包合并 - 同名类按包区分', () => {

  test('同名类在两个包里都保留，成员各自独立；无 import 的引用连到全部候选', () => {
    const { merged, puml } = build([
      { name: 'v1', content: 'class User { name: string; }' },
      { name: 'v2', content: 'class User { id: number; }' },
      { name: 'app', content: 'class App { private u: User; }' },
    ]);

    expect(merged.classes.filter(c => (c.displayName || c.name).startsWith('User'))).toHaveLength(2);
    expect((puml.match(/class "User \(/g) || [])).toHaveLength(2);
    expect(puml).toContain('+ name : string');
    expect(puml).toContain('id : number');
    // app 没 import，User 有两个候选 -> 两条关联
    expect(merged.relations.filter(r => r.from === 'App')).toHaveLength(2);
    expect(validatePlantUML(puml)).toEqual([]);
  });

  test('两个同名类各自的关系与标签都保留', () => {
    const { merged, puml } = build([
      { name: 'p1', content: 'class A { x: string; private u: U; }' },
      { name: 'p2', content: 'class A { private other: U; }' },
      { name: 'p3', content: 'class U {}' },
    ]);

    expect(merged.classes.filter(c => (c.displayName || c.name).startsWith('A'))).toHaveLength(2);
    // U 全局唯一 -> 两个 A 各自关联到它，标签不同
    const relLines = puml.split('\n').filter(l => /--> U\b/.test(l));
    expect(relLines).toHaveLength(2);
    expect(relLines.some(l => l.includes('u'))).toBe(true);
    expect(relLines.some(l => l.includes('other'))).toBe(true);
    expect(validatePlantUML(puml)).toEqual([]);
  });

  test('同名接口与类并存（按包区分，不再互相覆盖）', () => {
    const { merged, puml } = build([
      { name: 'contract', content: 'interface Service { run(): void; }' },
      { name: 'impl', content: 'class Service { private x: number; }' },
      { name: 'client', content: 'class Client { private s: Service; }' },
    ]);

    expect(puml).toContain('interface "Service (contract)"');
    expect(puml).toContain('class "Service (impl)"');
    // client 没 import -> 两个候选都连
    expect(merged.relations.filter(r => r.from === 'Client')).toHaveLength(2);
    expect(validatePlantUML(puml)).toEqual([]);
  });

  test('同名枚举与类并存', () => {
    const { puml } = build([
      { name: 'a', content: 'enum Status { OK, FAIL }' },
      { name: 'b', content: 'class Status { reason: string; }' },
    ]);

    expect(puml).toContain('enum "Status (a)"');
    expect(puml).toContain('class "Status (b)"');
    expect(validatePlantUML(puml)).toEqual([]);
  });
});

// ============================================================
// 3. 包名特殊情况
// ============================================================

describe('多包合并 - 包名特殊情况', () => {

  test('特殊字符包名（连字符 / 点 / 空格 / Unicode）应保持合法 PlantUML', () => {
    const { puml } = build([
      { name: 'my-service.v2', content: 'class A {}' },
      { name: '用户 服务', content: 'class B {}' },
      { name: '@scope/pkg', content: 'class C {}' },
    ]);

    expect(puml).toContain('package "my-service.v2" {');
    expect(puml).toContain('package "用户 服务" {');
    expect(puml).toContain('package "@scope/pkg" {');
    expect(validatePlantUML(puml)).toEqual([]);
  });

  test('包名与 PlantUML 关键字冲突时应保持引号包裹', () => {
    const { puml } = build([
      { name: 'package', content: 'class A {}' },
      { name: 'class', content: 'class B {}' },
      { name: 'note', content: 'class C {}' },
      { name: 'title', content: 'class D {}' },
    ]);

    ['package', 'class', 'note', 'title'].forEach(pkg => {
      expect(puml).toContain(`package "${pkg}" {`);
    });
    expect(validatePlantUML(puml)).toEqual([]);
  });

  test('同名文件视为同一个包：类合并而不是互相覆盖', () => {
    const { merged, puml } = build([
      { name: 'models', content: 'class A { a: string; } class B { b1: string; }' },
      { name: 'models', content: 'class B { b2: number; } class C { c: string; }' },
    ]);

    expect(merged.classes.map(c => c.name).sort()).toEqual(['A', 'B', 'C']);
    expect((puml.match(/package "models" \{/g) || [])).toHaveLength(1);
    expect((puml.match(/class "B" as B/g) || [])).toHaveLength(1);
    expect(puml).toContain('+ b1 : string');
    expect(puml).not.toContain('b2');
    expect(validatePlantUML(puml)).toEqual([]);
  });

  test('空文件 / 仅注释 / 仅 import：不崩溃并输出空包块', () => {
    const { merged, puml } = build([
      { name: 'empty1', content: '// 只有注释\n' },
      { name: 'empty2', content: "import { X } from './x';\n" },
      { name: 'real', content: 'class A {}' },
    ]);

    expect(merged.classes).toHaveLength(1);
    expect(puml).toContain('package "empty1" {\n}');
    expect(puml).toContain('package "empty2" {\n}');
    expect(validatePlantUML(puml)).toEqual([]);
  });

  test('包名包含双引号时不应破坏 PlantUML 语法', () => {
    // Linux/macOS 文件名可以包含 "，这里模拟拖入 he"llo.ts
    const { puml } = build([
      { name: 'he"llo', content: 'class A {}' },
    ]);

    expect(puml).toContain('package "he\'llo" {');
    expect(puml).not.toContain('package "he"llo"');
    expect(validatePlantUML(puml)).toEqual([]);
  });

  test('类名与包名相同：包块与类别名可共存', () => {
    const { merged, puml } = build([
      { name: 'User', content: 'class User { name: string; }' },
      { name: 'app', content: 'class Svc { private u: User; }' },
    ]);

    expectRelation(merged, 'Svc', 'User', 'association');
    expect(puml).toContain('package "User" {');
    expect(puml).toContain('class "User" as User {');
    expect(validatePlantUML(puml)).toEqual([]);
  });

  test('包输出顺序与文件顺序一致，关系统一排在所有包块之后', () => {
    const { puml } = build([
      { name: 'p1', content: 'class A { private b: B; }' },
      { name: 'p2', content: 'class B {}' },
      { name: 'p3', content: 'class C {}' },
    ]);

    expect(puml.indexOf('package "p1"')).toBeLessThan(puml.indexOf('package "p2"'));
    expect(puml.indexOf('package "p2"')).toBeLessThan(puml.indexOf('package "p3"'));
    const firstRel = puml.indexOf('A --> B');
    expect(firstRel).toBeGreaterThan(puml.indexOf('package "p3"'));
  });
});

// ============================================================
// 4. 解析器特殊情况（多包语境）
// ============================================================

describe('多包合并 - 解析器特殊情况', () => {

  test('类泛型参数遮蔽同名类时不应产生关系', () => {
    const { merged } = build([
      { name: 'generic', content: 'class Box<T> { private value: T; private items: T[] = []; }' },
      { name: 'concrete', content: 'class T { name: string; }' },
    ]);

    // Box<T> 中的 T 是类型参数，不是 concrete 包中的类 T
    expect(merged.relations.filter(r => r.from === 'Box')).toHaveLength(0);
  });

  test('接口泛型参数遮蔽同名类时不应产生关系', () => {
    const { merged } = build([
      { name: 'generic', content: 'interface Holder<T> { item: T; items: T[]; }' },
      { name: 'concrete', content: 'class T { name: string; }' },
    ]);

    expect(merged.relations.filter(r => r.from === 'Holder')).toHaveLength(0);
  });

  test('方法泛型参数遮蔽同名类时不应产生关系', () => {
    const { merged } = build([
      { name: 'generic', content: 'class Mapper { map<U>(input: U): U { return input; } }' },
      { name: 'concrete', content: 'class U { name: string; }' },
    ]);

    expect(merged.relations.filter(r => r.from === 'Mapper')).toHaveLength(0);
  });

  test('类泛型参数与具体类型同名时，仅具体类型字段产生关系', () => {
    const { merged } = build([
      { name: 'generic', content: 'class Wrapper<T> { private value: T; private real: Concrete; }' },
      { name: 'concrete', content: 'class T {} class Concrete {}' },
    ]);

    expectRelation(merged, 'Wrapper', 'Concrete', 'association');
    expect(merged.relations.filter(r => r.to === 'T')).toHaveLength(0);
  });

  test('implements 泛型实参：接口是 implements，类型实参是 dependency', () => {
    const { merged } = build([
      { name: 'iface', content: 'interface Repository<T> { get(): T; }' },
      { name: 'impl', content: 'class UserRepo implements Repository<User> { get(): User | null { return null; } }' },
      { name: 'model', content: 'class User {}' },
    ]);

    expectRelation(merged, 'UserRepo', 'Repository', 'implements');
    expect(getRelation(merged, 'UserRepo', 'User', 'implements')).toBeUndefined();
    expect(getRelation(merged, 'UserRepo', 'User', 'extends')).toBeUndefined();
    // 返回值 User | null 产生依赖
    expectRelation(merged, 'UserRepo', 'User', 'dependency');
  });

  test('跨包枚举作为关联、接口作为依赖', () => {
    const { merged } = build([
      { name: 'types', content: 'enum Color { RED, GREEN } interface Shape { area(): number; }' },
      { name: 'draw', content: 'class Painter { private c: Color; constructor(s: Shape) {} }' },
    ]);

    expectRelation(merged, 'Painter', 'Color', 'association');
    expectRelation(merged, 'Painter', 'Shape', 'dependency');
  });

  test('跨包依赖的三种来源：参数 / 返回值 / throw new', () => {
    const { merged } = build([
      { name: 'svc', content: 'class Svc { run(rule: Rule): Result { throw new DomainError(); } }' },
      { name: 'rules', content: 'class Rule {} class Result {}' },
      { name: 'errors', content: 'class DomainError extends Error {}' },
    ]);

    expectRelation(merged, 'Svc', 'Rule', 'dependency');
    expectRelation(merged, 'Svc', 'Result', 'dependency');
    expectRelation(merged, 'Svc', 'DomainError', 'dependency');
    // DomainError extends Error（内置类型）不产生关系
    expect(getRelation(merged, 'DomainError', 'Error', 'extends')).toBeUndefined();
  });

  test('已有字段关系时，方法参数不重复产生依赖', () => {
    const { merged } = build([
      { name: 'a', content: 'class User {}' },
      { name: 'b', content: 'class S { private u: User; use(u: User): void {} }' },
    ]);

    expect(merged.relations.filter(r => r.from === 'S' && r.to === 'User')).toHaveLength(1);
    expectRelation(merged, 'S', 'User', 'association');
  });

  test('接口属性为联合类型时应关联全部用户类型（跨包）', () => {
    const { merged } = build([
      { name: 'model', content: 'class A {} class B {}' },
      { name: 'iface', content: 'interface Slot { value: A | B | null; }' },
    ]);

    expectRelation(merged, 'Slot', 'A', 'association');
    expectRelation(merged, 'Slot', 'B', 'association');
  });
});

// ============================================================
// 5. 布局集成（包框）
// ============================================================

describe('多包合并 - 布局集成', () => {

  test('每个包生成独立包框，类框位于其包框内部', () => {
    const { merged } = build([
      { name: 'core', content: 'class Core { id: string; }' },
      { name: 'svc', content: 'class Svc { private c: Core; } run(): void {}' },
      { name: 'ui', content: 'class Button { label: string; }' },
    ]);

    const diagram = layoutDiagram(merged);
    expect(diagram.packages.map(p => p.name).sort()).toEqual(['core', 'svc', 'ui']);

    diagram.packages.forEach(pkg => {
      expect(pkg.boxes.length).toBeGreaterThan(0);
      pkg.boxes.forEach(b => {
        expect(b.x).toBeGreaterThanOrEqual(pkg.x);
        expect(b.y).toBeGreaterThanOrEqual(pkg.y);
        expect(b.x + b.w).toBeLessThanOrEqual(pkg.x + pkg.w + 0.001);
        expect(b.y + b.h).toBeLessThanOrEqual(pkg.y + pkg.h + 0.001);
      });
    });
  });

  test('包内类按继承顺序排序：父类在子类之前', () => {
    const { merged } = build([
      { name: 'pkg', content: 'class Child extends Parent {} class Parent {}' },
    ]);

    const diagram = layoutDiagram(merged);
    expect(diagram.packages).toHaveLength(1);
    expect(diagram.packages[0].boxes.map(b => b.name)).toEqual(['Parent', 'Child']);
  });

  test('空文件不产生图形包框（与 PlantUML 空包块行为不同）', () => {
    const { merged, puml } = build([
      { name: 'empty', content: '// 无类\n' },
      { name: 'real', content: 'class A {}' },
    ]);

    expect(puml).toContain('package "empty" {');
    const diagram = layoutDiagram(merged);
    expect(diagram.packages.map(p => p.name)).toEqual(['real']);
  });

  test('包多时整体形状接近正方形，不会退化成细长条', () => {
    const files: SourceFile[] = [];
    for (let p = 0; p < 40; p++) {
      let content = '';
      for (let c = 0; c < 4; c++) {
        content += `class P${p}C${c} { a: string; b: number; m(x: number): void {} }\n`;
      }
      files.push({ name: 'pkg' + p, content });
    }
    const { merged } = build(files);
    const d = layoutDiagram(merged);
    const aspect = d.width / d.height;
    expect(aspect).toBeGreaterThan(0.5);
    expect(aspect).toBeLessThan(2);
  });

  test('同名类在布局里都产生自己的图形单元', () => {
    const { merged } = build([
      { name: 'v1', content: 'class User { name: string; }' },
      { name: 'v2', content: 'class User { id: number; }' },
      { name: 'app', content: 'class App { private u: User; }' },
    ]);

    const diagram = layoutDiagram(merged);
    // 3 个类框（App + 两个 User），2 条边（App 连到两个候选）
    expect(diagram.boxes).toHaveLength(3);
    expect(diagram.lines).toHaveLength(2);
  });
});
