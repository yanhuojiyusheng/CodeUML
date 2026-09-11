/**
 * PlantUML 输出格式化测试 —— 针对生产代码路径（src/plantuml.ts）
 *
 * 背景：此前的测试（plantuml.test.ts）中有一份 formatParsed 的“复制品”，
 * 与生产代码（原 main.ts / 现 plantuml.ts）已经产生漂移（例如生产代码使用
 * `class "Name" as Name` 引号别名形式，测试复制品没有），生产代码本身零覆盖。
 * 本文件直接测试生产代码的 PlantUML 文本输出。
 */

import { parseCode } from '../src/core/parser';
import { parseFilesWithCrossFileTypes, mergeParsedData } from '../src/core/merge';
import { formatParsed, formatMergedPlantUML, formatRelation, formatMember } from '../src/core/plantuml';
import { Relation, Member } from '../src/core/types';
import { validatePlantUML } from './helpers/plantuml-validator';

// ============================================================
// 工具函数
// ============================================================

/** 解析单文件并生成 PlantUML */
function toPlantUML(code: string, packageName?: string): string {
  return formatParsed(parseCode(code), packageName);
}

/** 走生产代码的多文件合并流程（src/merge.ts + src/plantuml.ts） */
function mergeLikeMain(files: { name: string; content: string }[]): string {
  const allParsed = parseFilesWithCrossFileTypes(files);
  const { classPackageMap } = mergeParsedData(allParsed);
  return formatMergedPlantUML(allParsed, classPackageMap);
}

// ============================================================
// 测试套件 1：生产代码的 PlantUML 输出结构
// ============================================================

describe('PlantUML 输出格式化（生产代码路径）', () => {

  describe('1. @startuml / @enduml 框架', () => {
    test('输出应以 @startuml 开头', () => {
      const puml = toPlantUML('class Person {}');
      expect(puml.split('\n')[0]).toBe('@startuml');
    });

    test('输出应以 @enduml 结尾（无多余空行）', () => {
      const puml = toPlantUML('class Person {}');
      const lines = puml.split('\n');
      expect(lines[lines.length - 1]).toBe('@enduml');
    });

    test('应包含 skinparam 配置行', () => {
      const puml = toPlantUML('class Person {}');
      expect(puml).toContain('skinparam classAttributeIconSize 0');
      expect(puml).toContain('skinparam shadowing false');
    });

    test('空输入也应生成完整合法的 PlantUML 框架', () => {
      const puml = toPlantUML('');
      expect(validatePlantUML(puml)).toEqual([]);
    });
  });

  describe('2. 类声明的引号别名语法', () => {
    test('类名应使用引号 + as 别名形式', () => {
      const puml = toPlantUML('class Person { name: string; }');
      expect(puml).toContain('class "Person" as Person {');
    });

    test('接口/抽象类/枚举应使用对应关键字并带别名', () => {
      const puml = toPlantUML(`
        interface Drawable { draw(): void; }
        abstract class Shape { abstract area(): number; }
        enum Color { RED, GREEN }
      `);
      expect(puml).toContain('interface "Drawable" as Drawable {');
      expect(puml).toContain('abstract class "Shape" as Shape {');
      expect(puml).toContain('enum "Color" as Color {');
    });

    test('与 PlantUML 关键字冲突的类名应加引号输出（显示名不受影响）', () => {
      // Note/Package/Title/End/Legend/Skinparam 都是合法 TS 类名，
      // 但同时也是 PlantUML 关键字（不区分大小写）
      const puml = toPlantUML(`
        class Note { text: string; }
        class Package { name: string; }
        class Title { value: string; }
        class End { reason: string; }
        class Legend { items: string[]; }
        class Skinparam { key: string; }
        class NoteService { note: Note; }
      `);
      expect(puml).toContain('class "Note" as Note {');
      expect(puml).toContain('class "Package" as Package {');
      expect(puml).toContain('class "Title" as Title {');
      expect(puml).toContain('class "End" as End {');
      expect(puml).toContain('class "Legend" as Legend {');
      expect(puml).toContain('class "Skinparam" as Skinparam {');
      // 关系也应引用原始类名
      expect(puml).toContain('NoteService --> Note');
      expect(validatePlantUML(puml)).toEqual([]);
    });
  });

  describe('3. 成员行的 PlantUML 语法', () => {
    test('可见性符号 + - # 应符合 PlantUML 约定', () => {
      const puml = toPlantUML(`
        class A {
          pub: string;
          private priv: number;
          protected prot: boolean;
        }
      `);
      expect(puml).toContain('+ pub : string');
      expect(puml).toContain('- priv : number');
      expect(puml).toContain('# prot : boolean');
    });

    test('{static} 与 {abstract} 应出现在可见性符号之前', () => {
      const puml = toPlantUML(`
        abstract class A {
          static count: number;
          abstract run(): void;
          protected abstract step(): void;
        }
      `);
      // PlantUML 要求的顺序：{static} {abstract} 可见性 名称
      expect(puml).toContain('{static} + count : number');
      expect(puml).toContain('{abstract} + run() : void');
      expect(puml).toContain('{abstract} # step() : void');
    });

    test('属性/方法之间的 -- 分隔符仅在两段都存在时输出', () => {
      const onlyProps = toPlantUML('class A { x: number; }');
      expect(onlyProps).not.toContain('  --\n');

      const onlyMeths = toPlantUML('class A { run(): void {} }');
      expect(onlyMeths).not.toContain('  --\n');

      const both = toPlantUML('class A { x: number; run(): void {} }');
      expect(both).toContain('  --\n');
    });

    test('构造函数应输出为 + constructor(...) 形式', () => {
      const puml = toPlantUML('class A { constructor(x: number, y: string) {} }');
      expect(puml).toContain('+ constructor(x: number, y: string)');
    });

    test('getter/setter 应作为方法输出', () => {
      const puml = toPlantUML(`
        class A {
          private _age: number;
          get age(): number { return this._age; }
          set age(v: number) { this._age = v; }
        }
      `);
      expect(puml).toContain('+ get age() : number');
      expect(puml).toContain('+ set age()');
    });

    test('枚举成员应输出为 {static} 属性并保留值', () => {
      const puml = toPlantUML(`enum Status { ACTIVE = "active", PENDING = 1 }`);
      expect(puml).toContain('{static} + ACTIVE = "active"');
      expect(puml).toContain('{static} + PENDING = 1');
    });
  });

  describe('4. 关系行的 PlantUML 语法', () => {
    test.each([
      ['extends', '--|>'],
      ['implements', '..|>'],
      ['association', '-->'],
      ['aggregation', 'o--'],
      ['composition', '*--'],
      ['dependency', '..>'],
    ])('%s 应使用 %s 箭头', (type, arrow) => {
      const rel = formatRelation({ from: 'A', to: 'B', type: type as Relation['type'] });
      expect(rel).toBe(`A ${arrow} B`);
    });

    test('多重性应使用引号语法且不为 1 时输出', () => {
      expect(formatRelation({ from: 'A', to: 'B', type: 'aggregation', toMultiplicity: '*' }))
        .toBe('A o-- "*" B');
      expect(formatRelation({ from: 'A', to: 'B', type: 'association', toMultiplicity: '0..1' }))
        .toBe('A --> "0..1" B');
      // 多重性为 1 时省略（PlantUML 默认）
      expect(formatRelation({ from: 'A', to: 'B', type: 'association', toMultiplicity: '1' }))
        .toBe('A --> B');
    });

    test('源端与目标端多重性应同时支持', () => {
      const rel = formatRelation({
        from: 'A', to: 'B', type: 'aggregation',
        fromMultiplicity: '0..1', toMultiplicity: '*'
      });
      expect(rel).toBe('A "0..1" o-- "*" B');
    });

    test('关联/聚合/组合应带冒号标签，继承/实现/依赖不带（当前约定）', () => {
      expect(formatRelation({ from: 'A', to: 'B', type: 'association', label: 'field' }))
        .toBe('A --> B : field');
      expect(formatRelation({ from: 'A', to: 'B', type: 'extends', label: 'x' }))
        .toBe('A --|> B');
      expect(formatRelation({ from: 'A', to: 'B', type: 'implements', label: 'x' }))
        .toBe('A ..|> B');
      expect(formatRelation({ from: 'A', to: 'B', type: 'dependency', label: 'x' }))
        .toBe('A ..> B');
    });
  });

  describe('5. 包（package）语法', () => {
    test('单文件带包名时应生成 package 块并正确缩进', () => {
      const puml = toPlantUML('class Person { name: string; }', 'models');
      expect(puml).toContain('package "models" {');
      expect(puml).toContain('  class "Person" as Person {');
      expect(puml).toContain('    + name : string');
      // 类块的闭括号带缩进，包块的闭括号顶格
      expect(puml.match(/^}/gm)).toHaveLength(1);
      expect(puml).toContain('  }');
      expect(validatePlantUML(puml)).toEqual([]);
    });

    test('合并输出应包含 skinparam packageStyle rectangle 并按包分组', () => {
      const puml = mergeLikeMain([
        { name: 'models', content: 'class Person { name: string; }' },
        { name: 'services', content: 'class UserService { find(): void {} }' },
      ]);
      expect(puml).toContain('skinparam packageStyle rectangle');
      const modelsIdx = puml.indexOf('package "models"');
      const servicesIdx = puml.indexOf('package "services"');
      const relIdx = puml.indexOf("' 关系");
      expect(modelsIdx).toBeGreaterThan(-1);
      expect(servicesIdx).toBeGreaterThan(-1);
      expect(relIdx).toBeGreaterThan(modelsIdx);
      expect(relIdx).toBeGreaterThan(servicesIdx);
      expect(validatePlantUML(puml)).toEqual([]);
    });

    test('跨包同名类应只输出一次（PlantUML 别名必须全局唯一）', () => {
      const puml = mergeLikeMain([
        { name: 'a', content: 'class User { name: string; }' },
        { name: 'b', content: 'class User { id: number; }' },
      ]);
      // 两个类都输出，标题带包名区分
      expect(puml).toContain('class "User (a)"');
      expect(puml).toContain('class "User (b)"');
      // 别名必须全局唯一
      const aliases = [...puml.matchAll(/\bas ([A-Za-z0-9_]+)/g)].map(m => m[1]);
      expect(aliases).toHaveLength(2);
      expect(new Set(aliases).size).toBe(2);
      expect(validatePlantUML(puml)).toEqual([]);
    });

    test('空包应输出空的 package 块', () => {
      const puml = mergeLikeMain([
        { name: 'empty', content: '// 没有类\n' },
        { name: 'models', content: 'class Person { name: string; }' },
      ]);
      expect(puml).toContain('package "empty" {\n}');
      expect(validatePlantUML(puml)).toEqual([]);
    });
  });

  describe('6. 合并输出', () => {
    test('跨文件关系应输出在包块之后', () => {
      const puml = mergeLikeMain([
        { name: 'a', content: 'class User { name: string; }' },
        { name: 'b', content: 'class Service { private user: User; }' },
      ]);
      expect(puml).toContain('Service --> User : user');
      expect(puml.indexOf('Service --> User')).toBeGreaterThan(puml.indexOf('package "b"'));
    });

    test('相同关系应去重', () => {
      const puml = mergeLikeMain([
        { name: 'a', content: 'class User { name: string; }' },
        { name: 'b', content: 'class S1 { private u: User; }\nclass S2 { private u: User; }' },
      ]);
      const matches = puml.match(/--> User/g) || [];
      // S1 --> User 和 S2 --> User 是两条不同关系，各自只出现一次
      expect(puml.match(/S1 --> User/g) || []).toHaveLength(1);
      expect(puml.match(/S2 --> User/g) || []).toHaveLength(1);
      expect(matches.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('7. 生产代码与解析结果的端到端一致性', () => {
    test('完整示例代码应通过 PlantUML 语法自检', () => {
      const code = `
        enum Gender { MALE, FEMALE, UNKNOWN }
        interface Pet { name: string; play(): void; }
        abstract class Animal {
          private id: string;
          public name: string;
          protected age: number;
          private gender: Gender;
          constructor(name: string, age: number, gender: Gender) {}
          abstract makeSound(): void;
        }
        class Dog extends Animal implements Pet {
          private breed: string;
          public owner: Person;
          makeSound(): void {}
          play(): void {}
        }
        class Person {
          public name: string;
          private pets: Pet[];
          adopt(pet: Pet): void {}
        }
      `;
      const puml = toPlantUML(code);
      expect(validatePlantUML(puml)).toEqual([]);
    });
  });
});

// ============================================================
// 测试套件 2：语法自检器跑语料库（fuzz 性质）
// ============================================================

describe('PlantUML 语法自检语料库', () => {
  const corpus: { name: string; code: string; check?: (puml: string) => void }[] = [
    {
      name: '泛型与嵌套泛型',
      code: `
        class Repo<T> { items: T[]; get(id: string): Promise<T | null> { return null as any; } }
        class Box { map: Map<string, Repo<User[]>>; }
        class User { id: string; }
      `,
    },
    {
      name: '联合类型与可选属性',
      code: `
        class Handler { target: Element | null; opts?: Options; cb?: () => void; }
        interface Options { timeout: number | undefined; }
        class Element { id: string; }
      `,
    },
    {
      name: '构造函数参数属性',
      code: `
        class Service {
          constructor(private db: Database, protected logger: Logger, public config: Config, readonly name: string) {}
          run(input: Data): Result { return new Result(); }
        }
        class Database {} class Logger {} class Config {} class Data {} class Result {}
      `,
    },
    {
      name: 'Unicode 类名与成员',
      code: `
        class 用户 { 姓名: string; 打招呼(): void {} }
        class 服务 { private 用户列表: 用户[]; }
      `,
    },
    {
      name: '工具类型剥壳',
      code: `
        class Store {
          users: Partial<User>;
          required: Required<User>;
          picked: Pick<User, "id">;
          map: Record<string, User>;
          list: ReadonlyArray<User>;
        }
        class User { id: string; name: string; }
      `,
    },
    {
      name: '字符串枚举与计算成员',
      code: `
        enum Color { RED = "red", BLUE = "blue", MASK = 1 << 2 }
        class Painter { color: Color; }
      `,
    },
    {
      name: '依赖与组合混合',
      code: `
        class Engine { start(): void {} }
        class Wheel { roll(): void {} }
        class Car {
          private engine = new Engine();
          private wheels: Wheel[];
          constructor(wheels: Wheel[]) { this.wheels = wheels; }
          drive(cb: () => void): void {}
        }
      `,
    },
    {
      name: '循环关联与深继承',
      code: `
        class Node { parent: Node | null; children: Node[]; }
        class A {} class B extends A {} class C extends B {} class D extends C {}
      `,
    },
    {
      name: '与 PlantUML 关键字冲突的类名',
      code: `
        class Note { text: string; }
        class Package { name: string; }
        class Title { value: string; }
        class End { reason: string; }
        class Widget { note: Note; }
      `,
    },
    {
      name: '空类 / 空接口 / 空枚举成员类',
      code: `
        class Empty {}
        interface Marker {}
        class OnlyMethods { a(): void {} b(): number { return 1; } }
        class OnlyProps { a: string; b: number; }
      `,
    },
  ];

  corpus.forEach(({ name, code, check }) => {
    test(`${name} 生成的 PlantUML 应通过语法自检`, () => {
      const puml = toPlantUML(code);
      expect(validatePlantUML(puml)).toEqual([]);
      check?.(puml);
    });
  });

  test('多文件合并语料应通过语法自检', () => {
    const puml = mergeLikeMain([
      {
        name: 'models',
        content: `
          enum Gender { MALE, FEMALE }
          interface Pet { name: string; }
          abstract class Animal {
            private gender: Gender;
            abstract makeSound(): void;
          }
          class Dog extends Animal implements Pet { makeSound(): void {} }
          class Person { private pets: Pet[]; adopt(pet: Pet): void {} }
        `,
      },
      {
        name: 'services',
        content: `
          class UserService {
            private database: Database;
            constructor(db: Database) { this.database = db; }
            findUser(id: string): User | null { return null; }
          }
          class Database { query(sql: string): any[] { return []; } }
          interface User { id: string; name: string; }
        `,
      },
    ]);
    expect(validatePlantUML(puml)).toEqual([]);
    // 关键关系存在
    expect(puml).toContain('Dog --|> Animal');
    expect(puml).toContain('Dog ..|> Pet');
    expect(puml).toContain('Person o-- "*" Pet');
    expect(puml).toContain('UserService --> Database');
  });
});

// ============================================================
// 测试套件 3：formatMember / formatRelation 单元级补充
// ============================================================

describe('formatMember / formatRelation 单元补充', () => {
  test('无类型属性不应输出冒号', () => {
    const m: Member = { kind: 'property', modifier: '+', name: 'id', type: '' };
    expect(formatMember(m)).toBe('+ id');
  });

  test('可选属性应保留 ? 标记', () => {
    const m: Member = { kind: 'property', modifier: '+', name: 'nick?', type: 'string' };
    expect(formatMember(m)).toBe('+ nick? : string');
  });

  test('静态抽象方法组合应保持 PlantUML 修饰符顺序', () => {
    const m: Member = {
      kind: 'method', modifier: '+', name: 'run', params: '', type: 'void',
      isStatic: true, isAbstract: true,
    };
    expect(formatMember(m)).toBe('{static} {abstract} + run() : void');
  });

  test('formatRelation 不应输出空的冒号标签', () => {
    const r: Relation = { from: 'A', to: 'B', type: 'association', label: '' };
    expect(formatRelation(r)).toBe('A --> B');
  });
});
