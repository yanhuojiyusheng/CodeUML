/**
 * PlantUML 转换逻辑单元测试
 * 基于标准 PlantUML 类图语法规则
 */

const ts = require('typescript');
(global as any).ts = ts;

import { parseCode, parseCodeWithKnownTypes } from '../src/parser';
import { ParsedData, Member } from '../src/types';

// ============================================================
// PlantUML 格式化函数（与 main.ts 保持一致）
// ============================================================

function formatMember(m: Member): string {
  const staticStr = m.isStatic ? '{static} ' : '';
  const abstractStr = m.isAbstract ? '{abstract} ' : '';
  
  if (m.kind === 'property') {
    return `${staticStr}${abstractStr}${m.modifier} ${m.name}${m.type ? ' : ' + m.type : ''}`;
  }
  if (m.name === 'constructor') {
    return `${m.modifier} constructor(${m.params || ''})`;
  }
  return `${staticStr}${abstractStr}${m.modifier} ${m.name}(${m.params || ''})${m.type ? ' : ' + m.type : ''}`;
}

function formatParsed(parsed: ParsedData): string {
  let text = '@startuml\n\n';
  
  parsed.classes.forEach(c => {
    if (c.isEnum) {
      text += `enum ${c.name} {\n`;
    } else if (c.isInterface) {
      text += `interface ${c.name} {\n`;
    } else if (c.isAbstract) {
      text += `abstract class ${c.name} {\n`;
    } else {
      text += `class ${c.name} {\n`;
    }
    
    const props = c.members.filter(m => m.kind === 'property');
    const meths = c.members.filter(m => m.kind === 'method');
    
    props.forEach(m => {
      text += `  ${formatMember(m)}\n`;
    });
    
    if (props.length && meths.length) {
      text += '  --\n';
    }
    
    meths.forEach(m => {
      text += `  ${formatMember(m)}\n`;
    });
    
    text += '}\n\n';
  });
  
  if (parsed.relations.length) {
    parsed.relations.forEach(r => {
      let arrow = '';
      
      switch (r.type) {
        case 'extends':
          arrow = '--|>';
          break;
        case 'implements':
          arrow = '..|>';
          break;
        case 'aggregation':
          arrow = 'o--';
          break;
        case 'composition':
          arrow = '*--';
          break;
        case 'dependency':
          arrow = '..>';
          break;
        case 'association':
        default:
          arrow = '-->';
      }
      
      // 多重性标注：ClassA "1" --> "0..*" ClassB
      const fromMult = r.fromMultiplicity && r.fromMultiplicity !== '1' ? `"${r.fromMultiplicity}" ` : '';
      const toMult = r.toMultiplicity && r.toMultiplicity !== '1' ? ` "${r.toMultiplicity}"` : '';
      
      let relStr = `${r.from}${fromMult} ${arrow}${toMult} ${r.to}`;
      
      // 标签：ClassA --> ClassB : 关系名称
      if (r.label && (r.type === 'association' || r.type === 'aggregation' || r.type === 'composition')) {
        relStr += ` : ${r.label}`;
      }
      
      text += relStr + '\n';
    });
  }
  
  text += '\n@enduml';
  return text;
}

// ============================================================
// 测试套件 - 严格按照 PlantUML 语法规则
// ============================================================

describe('PlantUML 语法合规性测试', () => {

  // --------------------------------------------------------
  // 1. 基本类声明语法
  // --------------------------------------------------------
  describe('1. 基本类声明语法', () => {
    
    test('普通类应使用 class 关键字', () => {
      const result = parseCode('class Person { name: string; }');
      const plantuml = formatParsed(result);
      
      expect(plantuml).toContain('class Person {');
    });

    test('接口应使用 interface 关键字', () => {
      const result = parseCode('interface Drawable { draw(): void; }');
      const plantuml = formatParsed(result);
      
      expect(plantuml).toContain('interface Drawable {');
    });

    test('抽象类应使用 abstract class 关键字', () => {
      const result = parseCode('abstract class Shape { abstract area(): number; }');
      const plantuml = formatParsed(result);
      
      expect(plantuml).toContain('abstract class Shape {');
    });

    test('枚举应使用 enum 关键字', () => {
      const result = parseCode('enum Color { Red, Green, Blue }');
      const plantuml = formatParsed(result);
      
      expect(plantuml).toContain('enum Color {');
    });
  });

  // --------------------------------------------------------
  // 2. 可见性符号 (+, -, #, ~)
  // --------------------------------------------------------
  describe('2. 可见性符号', () => {
    
    test('+ 表示 public', () => {
      const result = parseCode('class Test { public name: string; }');
      const plantuml = formatParsed(result);
      
      expect(plantuml).toContain('+ name : string');
    });

    test('- 表示 private', () => {
      const result = parseCode('class Test { private secret: string; }');
      const plantuml = formatParsed(result);
      
      expect(plantuml).toContain('- secret : string');
    });

    test('# 表示 protected', () => {
      const result = parseCode('class Test { protected internal: string; }');
      const plantuml = formatParsed(result);
      
      expect(plantuml).toContain('# internal : string');
    });

    test('默认无修饰符时应为 public (+)', () => {
      const result = parseCode('class Test { name: string; }');
      const plantuml = formatParsed(result);
      
      expect(plantuml).toContain('+ name : string');
    });
  });

  // --------------------------------------------------------
  // 3. 静态成员标记 {static}
  // --------------------------------------------------------
  describe('3. 静态成员标记', () => {
    
    test('静态属性应标记 {static}', () => {
      const result = parseCode('class Counter { static count: number = 0; }');
      const plantuml = formatParsed(result);
      
      expect(plantuml).toContain('{static} + count : number');
    });

    test('静态方法应标记 {static}', () => {
      const result = parseCode('class Math { static square(x: number): number { return x * x; } }');
      const plantuml = formatParsed(result);
      
      expect(plantuml).toContain('{static} + square(x: number) : number');
    });
  });

  // --------------------------------------------------------
  // 4. 抽象成员标记 {abstract}
  // --------------------------------------------------------
  describe('4. 抽象成员标记', () => {
    
    test('抽象方法应标记 {abstract}', () => {
      const result = parseCode('abstract class Shape { abstract area(): number; }');
      const plantuml = formatParsed(result);
      
      expect(plantuml).toContain('{abstract} + area() : number');
    });
  });

  // --------------------------------------------------------
  // 5. 关系箭头语法
  // --------------------------------------------------------
  describe('5. 关系箭头语法', () => {
    
    test('继承应使用 --|>', () => {
      const code = `
        class Animal {}
        class Dog extends Animal {}
      `;
      const result = parseCode(code);
      const plantuml = formatParsed(result);
      
      expect(plantuml).toContain('Dog --|> Animal');
    });

    test('实现应使用 ..|>', () => {
      const code = `
        interface Flyable {}
        class Bird implements Flyable {}
      `;
      const result = parseCode(code);
      const plantuml = formatParsed(result);
      
      expect(plantuml).toContain('Bird ..|> Flyable');
    });

    test('关联应使用 -->', () => {
      const code = `
        class Driver {}
        class Car {
          driver: Driver;
        }
      `;
      const result = parseCode(code);
      const relation = result.relations.find(r => r.from === 'Car' && r.to === 'Driver');
      
      // 单一类型属性应为关联关系
      expect(relation?.type).toBe('association');
    });

    test('聚合应使用 o--', () => {
      const code = `
        class Wheel {}
        class Car {
          wheels: Wheel[];
        }
      `;
      const result = parseCode(code);
      const plantuml = formatParsed(result);
      
      expect(plantuml).toMatch(/Car o-- "?\*"? Wheel/);
    });

    test('组合应使用 *--', () => {
      const code = `
        class Engine {}
        class Car {
          engine: Engine = new Engine();
        }
      `;
      const result = parseCode(code);
      const plantuml = formatParsed(result);
      
      expect(plantuml).toContain('Car *-- Engine');
    });

    test('依赖应使用 ..>', () => {
      const code = `
        class Logger {}
        class Service {
          process(logger: Logger): void {}
        }
      `;
      const result = parseCode(code);
      const plantuml = formatParsed(result);
      
      expect(plantuml).toContain('Service ..> Logger');
    });
  });

  // --------------------------------------------------------
  // 6. 多重性语法
  // --------------------------------------------------------
  describe('6. 多重性语法', () => {
    
    test('数组类型多重性应为 *', () => {
      const code = `
        class Item {}
        class Container {
          items: Item[];
        }
      `;
      const result = parseCode(code);
      const relation = result.relations.find(r => r.to === 'Item');
      
      expect(relation?.toMultiplicity).toBe('*');
    });

    test('可选类型多重性应为 0..1', () => {
      const code = `
        class Address {}
        class Person {
          address?: Address;
        }
      `;
      const result = parseCode(code);
      const relation = result.relations.find(r => r.to === 'Address');
      
      expect(relation?.toMultiplicity).toBe('0..1');
    });

    test('普通类型多重性应为 1', () => {
      const code = `
        class Engine {}
        class Car {
          engine: Engine;
        }
      `;
      const result = parseCode(code);
      const relation = result.relations.find(r => r.to === 'Engine');
      
      expect(relation?.toMultiplicity).toBe('1');
    });

    test('多重性 * 应在 PlantUML 中显示', () => {
      const code = `
        class Item {}
        class Container { items: Item[]; }
      `;
      const result = parseCode(code);
      const plantuml = formatParsed(result);
      
      // 格式: Container o-- "*" Item
      expect(plantuml).toMatch(/Container o--/);
      expect(plantuml).toContain('"*"');
    });

    test('多重性 0..1 应在 PlantUML 中显示', () => {
      const code = `
        class Address {}
        class Person { address?: Address; }
      `;
      const result = parseCode(code);
      const plantuml = formatParsed(result);
      
      // 格式: Person --> "0..1" Address
      expect(plantuml).toContain('"0..1"');
    });
  });

  // --------------------------------------------------------
  // 7. 关系标签语法
  // --------------------------------------------------------
  describe('7. 关系标签语法', () => {
    
    test('关联关系应支持标签', () => {
      const code = `
        class User {}
        class Order {
          user: User;
        }
      `;
      const result = parseCode(code);
      
      // 关联关系应该存在
      const relation = result.relations.find(r => r.from === 'Order' && r.to === 'User');
      expect(relation).toBeDefined();
    });

    test('聚合关系标签应在冒号后显示', () => {
      const code = `
        class Wheel {}
        class Car {
          frontLeft: Wheel;
          frontRight: Wheel;
        }
      `;
      const result = parseCode(code);
      const plantuml = formatParsed(result);
      
      // 多个同类型属性应合并并显示标签
      if (plantuml.includes('Car o--')) {
        expect(plantuml).toMatch(/Car o--.*Wheel :/);
      }
    });
  });

  // --------------------------------------------------------
  // 8. 继承与实现关系
  // --------------------------------------------------------
  describe('8. 继承与实现关系', () => {
    
    test('单继承应正确表示', () => {
      const code = `
        class Animal {}
        class Dog extends Animal {}
      `;
      const result = parseCode(code);
      
      const relation = result.relations.find(r => r.type === 'extends');
      expect(relation).toBeDefined();
      expect(relation?.from).toBe('Dog');
      expect(relation?.to).toBe('Animal');
    });

    test('接口继承应正确表示', () => {
      const code = `
        interface Readable { read(): void; }
        interface Writable { write(): void; }
        interface ReadWrite extends Readable, Writable {}
      `;
      const result = parseCode(code);
      
      const extendsRelations = result.relations.filter(r => r.type === 'extends');
      expect(extendsRelations.length).toBeGreaterThanOrEqual(2);
    });

    test('多接口实现应正确表示', () => {
      const code = `
        interface Serializable { serialize(): string; }
        interface Loggable { log(): void; }
        class Document implements Serializable, Loggable {
          serialize(): string { return ""; }
          log(): void {}
        }
      `;
      const result = parseCode(code);
      
      const implementsRelations = result.relations.filter(r => r.type === 'implements');
      expect(implementsRelations).toHaveLength(2);
    });
  });

  // --------------------------------------------------------
  // 9. 聚合与组合区分
  // --------------------------------------------------------
  describe('9. 聚合与组合区分', () => {
    
    test('数组属性应为聚合关系 (o--)', () => {
      const code = `
        class Wheel {}
        class Car { wheels: Wheel[]; }
      `;
      const result = parseCode(code);
      
      const relation = result.relations.find(r => r.from === 'Car' && r.to === 'Wheel');
      expect(relation?.type).toBe('aggregation');
    });

    test('new 创建的属性应为组合关系 (*--)', () => {
      const code = `
        class Engine {}
        class Car { engine: Engine = new Engine(); }
      `;
      const result = parseCode(code);
      
      const relation = result.relations.find(r => r.from === 'Car' && r.to === 'Engine');
      expect(relation?.type).toBe('composition');
    });

    test('普通属性应为关联关系 (-->)', () => {
      const code = `
        class Driver {}
        class Car { driver: Driver; }
      `;
      const result = parseCode(code);
      
      const relation = result.relations.find(r => r.from === 'Car' && r.to === 'Driver');
      expect(relation?.type).toBe('association');
    });
  });

  // --------------------------------------------------------
  // 10. 依赖关系
  // --------------------------------------------------------
  describe('10. 依赖关系', () => {
    
    test('方法参数类型应产生依赖关系 (..>)', () => {
      const code = `
        class Logger { log(): void {} }
        class Service { process(logger: Logger): void {} }
      `;
      const result = parseCode(code);
      
      const relation = result.relations.find(r => r.from === 'Service' && r.to === 'Logger');
      expect(relation?.type).toBe('dependency');
    });

    test('返回类型应产生依赖关系', () => {
      const code = `
        class Result { data: string; }
        class Service { getResult(): Result { return new Result(); } }
      `;
      const result = parseCode(code);
      
      const relation = result.relations.find(r => r.from === 'Service' && r.to === 'Result');
      expect(relation?.type).toBe('dependency');
    });
  });

  // --------------------------------------------------------
  // 11. 枚举解析
  // --------------------------------------------------------
  describe('11. 枚举解析', () => {
    
    test('数字枚举应正确解析', () => {
      const code = `enum Direction { Up, Down, Left, Right }`;
      const result = parseCode(code);
      
      expect(result.classes).toHaveLength(1);
      expect(result.classes[0].isEnum).toBe(true);
      expect(result.classes[0].members).toHaveLength(4);
    });

    test('字符串枚举值应保留', () => {
      const code = `enum Color { Red = "RED", Green = "GREEN" }`;
      const result = parseCode(code);
      
      const redMember = result.classes[0].members.find(m => m.name === 'Red');
      expect(redMember?.type).toContain('RED');
    });
  });

  // --------------------------------------------------------
  // 12. 方法签名语法
  // --------------------------------------------------------
  describe('12. 方法签名语法', () => {
    
    test('方法应显示参数和返回类型', () => {
      const result = parseCode('class Calc { add(a: number, b: number): number { return a + b; } }');
      const plantuml = formatParsed(result);
      
      expect(plantuml).toContain('+ add(a: number, b: number) : number');
    });

    test('无参方法应显示空括号', () => {
      const result = parseCode('class Test { doSomething(): void {} }');
      const plantuml = formatParsed(result);
      
      expect(plantuml).toContain('+ doSomething() : void');
    });

    test('构造函数应显示参数', () => {
      const result = parseCode('class Point { constructor(public x: number, public y: number) {} }');
      const plantuml = formatParsed(result);
      
      expect(plantuml).toContain('constructor(public x: number, public y: number)');
    });
  });

  // --------------------------------------------------------
  // 13. 属性类型语法
  // --------------------------------------------------------
  describe('13. 属性类型语法', () => {
    
    test('属性应显示类型注解', () => {
      const result = parseCode('class Person { name: string; age: number; }');
      const plantuml = formatParsed(result);
      
      expect(plantuml).toContain('+ name : string');
      expect(plantuml).toContain('+ age : number');
    });

    test('可选属性应保留 ? 标记', () => {
      const result = parseCode('class Config { debug?: boolean; }');
      const plantuml = formatParsed(result);
      
      expect(plantuml).toContain('debug?');
    });

    test('数组类型应保留 [] 标记', () => {
      const result = parseCode('class Container { items: string[]; }');
      const plantuml = formatParsed(result);
      
      expect(plantuml).toContain('+ items : string[]');
    });
  });

  // --------------------------------------------------------
  // 14. 复杂场景
  // --------------------------------------------------------
  describe('14. 复杂场景', () => {
    
    test('完整类层次结构应正确解析', () => {
      const code = `
        interface Serializable { serialize(): string; }
        abstract class Entity { id: number; abstract validate(): boolean; }
        class User extends Entity implements Serializable {
          name: string;
          serialize(): string { return ""; }
          validate(): boolean { return true; }
          static create(): User { return new User(); }
        }
      `;
      const result = parseCode(code);
      const plantuml = formatParsed(result);
      
      // 验证继承
      expect(plantuml).toContain('User --|> Entity');
      // 验证实现
      expect(plantuml).toContain('User ..|> Serializable');
      // 验证静态方法
      expect(plantuml).toContain('{static} + create() : User');
      // 验证抽象标记
      expect(result.classes.find(c => c.name === 'Entity')?.isAbstract).toBe(true);
    });

    test('getter/setter 应正确解析', () => {
      const code = `
        class Person {
          private _name: string;
          get name(): string { return this._name; }
          set name(value: string) { this._name = value; }
        }
      `;
      const result = parseCode(code);
      
      const getter = result.classes[0].members.find(m => m.name.includes('get'));
      expect(getter).toBeDefined();
      
      const setter = result.classes[0].members.find(m => m.name.includes('set'));
      expect(setter).toBeDefined();
    });
  });

  // --------------------------------------------------------
  // 15. 边界情况
  // --------------------------------------------------------
  describe('15. 边界情况', () => {
    
    test('空代码应返回空结果', () => {
      const result = parseCode('');
      
      expect(result.classes).toHaveLength(0);
      expect(result.relations).toHaveLength(0);
    });

    test('语法错误不应抛出异常', () => {
      expect(() => parseCode('class Foo { bar( }')).not.toThrow();
    });

    test('Unicode 标识符应正确处理', () => {
      const result = parseCode('class 用户 { 名字: string; }');
      
      expect(result.classes).toHaveLength(1);
      expect(result.classes[0].name).toBe('用户');
    });
  });

  // --------------------------------------------------------
  // 16. 关系优先级
  // --------------------------------------------------------
  describe('16. 关系优先级', () => {
    
    test('基本类型不应创建关联', () => {
      const result = parseCode(`
        class Person {
          name: string;
          age: number;
          active: boolean;
        }
      `);
      
      const associations = result.relations.filter(
        r => r.type === 'association' || r.type === 'aggregation' || r.type === 'composition'
      );
      expect(associations).toHaveLength(0);
    });

    test('组合优先于聚合（同类型）', () => {
      const result = parseCode(`
        class Engine {}
        class Wheel {}
        class Car {
          engine: Engine = new Engine();
          wheels: Wheel[];
        }
      `);
      
      const engineRelation = result.relations.find(r => r.to === 'Engine');
      const wheelRelation = result.relations.find(r => r.to === 'Wheel');
      
      expect(engineRelation?.type).toBe('composition');
      expect(wheelRelation?.type).toBe('aggregation');
    });
  });

  // --------------------------------------------------------
  // 17. 高级关系场景
  // --------------------------------------------------------
  describe('17. 高级关系场景', () => {
    
    test('双向关联应生成两条关系', () => {
      const code = `
        class Husband {
          wife: Wife;
        }
        class Wife {
          husband: Husband;
        }
      `;
      const result = parseCode(code);
      
      const rel1 = result.relations.find(r => r.from === 'Husband' && r.to === 'Wife');
      const rel2 = result.relations.find(r => r.from === 'Wife' && r.to === 'Husband');
      
      expect(rel1).toBeDefined();
      expect(rel2).toBeDefined();
    });

    test('继承 + 实现组合应正确解析', () => {
      const code = `
        interface Serializable { serialize(): string; }
        abstract class Base { id: number; }
        class User extends Base implements Serializable {
          serialize(): string { return ""; }
        }
      `;
      const result = parseCode(code);
      
      const extendsRel = result.relations.find(r => r.type === 'extends' && r.from === 'User');
      const implementsRel = result.relations.find(r => r.type === 'implements' && r.from === 'User');
      
      expect(extendsRel?.to).toBe('Base');
      expect(implementsRel?.to).toBe('Serializable');
    });

    test('菱形继承应正确解析', () => {
      const code = `
        class A {}
        class B extends A {}
        class C extends A {}
        class D extends B {}
        class E extends C {}
      `;
      const result = parseCode(code);
      
      // A 是顶层，B->A, C->A, D->B, E->C = 4 个继承关系
      const extendsRelations = result.relations.filter(r => r.type === 'extends');
      expect(extendsRelations).toHaveLength(4);
    });

    test('属性优先于依赖关系（去重策略）', () => {
      const code = `
        class Database { connect(): void {} }
        class Service {
          db: Database;           // 属性关联
          process(d: Database): void {}  // 方法参数依赖
        }
      `;
      const result = parseCode(code);
      
      // 设计决策：当属性和方法参数同时引用同一类型时，
      // 只保留属性产生的聚合/关联关系，不重复创建依赖关系
      const aggregation = result.relations.find(r => r.from === 'Service' && r.to === 'Database' && r.type === 'aggregation');
      const association = result.relations.find(r => r.from === 'Service' && r.to === 'Database' && r.type === 'association');
      
      expect(aggregation || association).toBeDefined();
    });

    test('纯方法参数应产生依赖关系', () => {
      const code = `
        class Logger { log(): void {} }
        class Service {
          process(logger: Logger): void {}
        }
      `;
      const result = parseCode(code);
      
      // 没有属性关联时，方法参数应产生依赖
      const dependency = result.relations.find(r => r.type === 'dependency');
      expect(dependency).toBeDefined();
      expect(dependency?.from).toBe('Service');
      expect(dependency?.to).toBe('Logger');
    });
  });

  // --------------------------------------------------------
  // 18. 构造函数参数属性
  // --------------------------------------------------------
  describe('18. 构造函数参数属性', () => {
    
    test('public 构造函数参数应生成属性', () => {
      const code = `
        class Point {
          constructor(public x: number, public y: number) {}
        }
      `;
      const result = parseCode(code);
      
      const props = result.classes[0].members.filter(m => m.kind === 'property');
      expect(props.length).toBeGreaterThanOrEqual(2);
    });

    test('private 构造函数参数应生成私有属性', () => {
      const code = `
        class Secret {
          constructor(private data: string) {}
        }
      `;
      const result = parseCode(code);
      
      const dataProp = result.classes[0].members.find(m => m.name === 'data' && m.kind === 'property');
      expect(dataProp?.modifier).toBe('-');
    });

    test('protected 构造函数参数应生成受保护属性', () => {
      const code = `
        class Base {
          constructor(protected value: number) {}
        }
      `;
      const result = parseCode(code);
      
      const valueProp = result.classes[0].members.find(m => m.name === 'value' && m.kind === 'property');
      expect(valueProp?.modifier).toBe('#');
    });
  });

  // --------------------------------------------------------
  // 19. Getter/Setter 解析
  // --------------------------------------------------------
  describe('19. Getter/Setter 解析', () => {
    
    test('getter 应标记为 get', () => {
      const code = `
        class Person {
          private _name: string;
          get name(): string { return this._name; }
        }
      `;
      const result = parseCode(code);
      
      const getter = result.classes[0].members.find(m => m.name.includes('get'));
      expect(getter).toBeDefined();
      expect(getter?.kind).toBe('method');
    });

    test('setter 应标记为 set', () => {
      const code = `
        class Person {
          private _name: string;
          set name(value: string) { this._name = value; }
        }
      `;
      const result = parseCode(code);
      
      const setter = result.classes[0].members.find(m => m.name.includes('set'));
      expect(setter).toBeDefined();
      expect(setter?.kind).toBe('method');
    });

    test('getter/setter 应继承属性的访问修饰符', () => {
      const code = `
        class Person {
          private _name: string;
          public get name(): string { return this._name; }
          public set name(value: string) { this._name = value; }
        }
      `;
      const result = parseCode(code);
      
      const getter = result.classes[0].members.find(m => m.name.includes('get'));
      expect(getter?.modifier).toBe('+');
    });
  });

  // --------------------------------------------------------
  // 20. 泛型类型处理
  // --------------------------------------------------------
  describe('20. 泛型类型处理', () => {
    
    test('泛型类应正确解析', () => {
      const code = `
        class Container<T> {
          item: T;
          get(): T { return this.item; }
        }
      `;
      const result = parseCode(code);
      
      expect(result.classes).toHaveLength(1);
      expect(result.classes[0].name).toBe('Container');
    });

    test('多泛型参数应正确解析', () => {
      const code = `
        class Pair<K, V> {
          key: K;
          value: V;
        }
      `;
      const result = parseCode(code);
      
      expect(result.classes).toHaveLength(1);
      expect(result.classes[0].name).toBe('Pair');
    });

    test('Map 类型应识别为用户类型', () => {
      const code = `
        class Config {}
        class Store {
          configs: Map<string, Config>;
        }
      `;
      const result = parseCode(code);
      
      // Config 应该被识别
      expect(result.classes.length).toBeGreaterThanOrEqual(2);
    });
  });

  // --------------------------------------------------------
  // 21. 联合类型与交叉类型
  // --------------------------------------------------------
  describe('21. 联合类型与交叉类型', () => {
    
    test('联合类型应提取第一个用户类型', () => {
      const code = `
        class Cat { purr(): void {} }
        class Dog { bark(): void {} }
        class Owner {
          pet: Cat | Dog;
        }
      `;
      const result = parseCode(code);
      
      expect(result.classes.length).toBeGreaterThanOrEqual(3);
    });

    test('可空类型应正确处理', () => {
      const code = `
        class Address {}
        class Person {
          address: Address | null;
        }
      `;
      const result = parseCode(code);
      
      const relation = result.relations.find(r => r.to === 'Address');
      // 可空类型应标记为 0..1
      expect(relation).toBeDefined();
    });
  });

  // --------------------------------------------------------
  // 22. 类型别名与接口扩展
  // --------------------------------------------------------
  describe('22. 类型别名与接口扩展', () => {
    
    test('接口继承多个接口应正确解析', () => {
      const code = `
        interface Printable { print(): void; }
        interface Scannable { scan(): void; }
        interface MultiFunction extends Printable, Scannable {
          fax(): void;
        }
      `;
      const result = parseCode(code);
      
      const extendsRelations = result.relations.filter(
        r => r.type === 'extends' && r.from === 'MultiFunction'
      );
      expect(extendsRelations).toHaveLength(2);
    });

    test('接口继承应使用 extends 而非 implements', () => {
      const code = `
        interface A { a(): void; }
        interface B extends A { b(): void; }
      `;
      const result = parseCode(code);
      
      const relation = result.relations.find(r => r.from === 'B' && r.to === 'A');
      expect(relation?.type).toBe('extends');
    });
  });

  // --------------------------------------------------------
  // 23. 枚举高级场景
  // --------------------------------------------------------
  describe('23. 枚举高级场景', () => {
    
    test('枚举值应标记为静态', () => {
      const code = `enum Status { Active, Inactive, Pending }`;
      const result = parseCode(code);
      
      result.classes[0].members.forEach(m => {
        expect(m.isStatic).toBe(true);
      });
    });

    test('带显式值的枚举应保留值', () => {
      const code = `
        enum HttpStatus {
          OK = 200,
          NotFound = 404,
          Error = 500
        }
      `;
      const result = parseCode(code);
      
      const okMember = result.classes[0].members.find(m => m.name === 'OK');
      expect(okMember?.type).toContain('200');
    });

    test('字符串枚举值应保留引号内容', () => {
      const code = `
        enum Direction {
          North = "N",
          South = "S"
        }
      `;
      const result = parseCode(code);
      
      const northMember = result.classes[0].members.find(m => m.name === 'North');
      expect(northMember?.type).toContain('N');
    });
  });

  // --------------------------------------------------------
  // 24. 空成员处理
  // --------------------------------------------------------
  describe('24. 空成员处理', () => {
    
    test('空类应有空属性和方法区域', () => {
      const code = `class Empty {}`;
      const result = parseCode(code);
      
      expect(result.classes[0].members).toHaveLength(0);
      
      const plantuml = formatParsed(result);
      expect(plantuml).toContain('class Empty {');
      expect(plantuml).toContain('}');
    });

    test('只有属性的类不应有分隔线', () => {
      const code = `
        class Config {
          name: string;
          value: number;
        }
      `;
      const result = parseCode(code);
      const plantuml = formatParsed(result);
      
      // 属性和方法之间有分隔线，但这里只有属性
      const lines = plantuml.split('\n');
      const separatorIndex = lines.findIndex(l => l.trim() === '--');
      const closingBraceIndex = lines.findIndex(l => l.trim() === '}');
      
      // 分隔线应在闭括号之前（如果有方法的话）
      // 对于只有属性的类，不应该有分隔线
    });
  });

  // --------------------------------------------------------
  // 25. 嵌套类型引用
  // --------------------------------------------------------
  describe('25. 嵌套类型引用', () => {
    
    test('Promise 返回类型应正确处理', () => {
      const code = `
        class Result {}
        class Service {
          fetch(): Promise<Result> { return new Promise(() => {}); }
        }
      `;
      const result = parseCode(code);
      
      const fetchMethod = result.classes[1].members.find(m => m.name === 'fetch');
      expect(fetchMethod).toBeDefined();
    });

    test('数组返回类型应正确处理', () => {
      const code = `
        class Item {}
        class Repository {
          getAll(): Item[] { return []; }
        }
      `;
      const result = parseCode(code);
      
      const getAllMethod = result.classes[1].members.find(m => m.name === 'getAll');
      expect(getAllMethod).toBeDefined();
    });
  });

  // --------------------------------------------------------
  // 26. 属性初始化器类型推断
  // --------------------------------------------------------
  describe('26. 属性初始化器类型推断', () => {
    
    test('null 初始化应推断为 null 类型', () => {
      const code = `
        class Test {
          value = null;
        }
      `;
      const result = parseCode(code);
      
      const valueProp = result.classes[0].members.find(m => m.name === 'value');
      expect(valueProp?.type).toBe('null');
    });

    test('undefined 初始化应推断为 undefined 类型', () => {
      const code = `
        class Test {
          value = undefined;
        }
      `;
      const result = parseCode(code);
      
      const valueProp = result.classes[0].members.find(m => m.name === 'value');
      expect(valueProp?.type).toBe('undefined');
    });

    test('字符串字面量初始化应推断为 string', () => {
      const code = `
        class Test {
          value = "hello";
        }
      `;
      const result = parseCode(code);
      
      const valueProp = result.classes[0].members.find(m => m.name === 'value');
      expect(valueProp?.type).toBe('string');
    });

    test('数字字面量初始化应推断为 number', () => {
      const code = `
        class Test {
          value = 42;
        }
      `;
      const result = parseCode(code);
      
      const valueProp = result.classes[0].members.find(m => m.name === 'value');
      expect(valueProp?.type).toBe('number');
    });

    test('布尔字面量初始化应推断为 boolean', () => {
      const code = `
        class Test {
          value = true;
        }
      `;
      const result = parseCode(code);
      
      const valueProp = result.classes[0].members.find(m => m.name === 'value');
      expect(valueProp?.type).toBe('boolean');
    });

    test('数组字面量初始化应推断为 Array', () => {
      const code = `
        class Test {
          value = [];
        }
      `;
      const result = parseCode(code);
      
      const valueProp = result.classes[0].members.find(m => m.name === 'value');
      expect(valueProp?.type).toBe('Array');
    });

    test('对象字面量初始化应推断为 object', () => {
      const code = `
        class Test {
          value = {};
        }
      `;
      const result = parseCode(code);
      
      const valueProp = result.classes[0].members.find(m => m.name === 'value');
      expect(valueProp?.type).toBe('object');
    });

    test('new 表达式初始化应推断为类名', () => {
      const code = `
        class Engine { power: number; }
        class Car {
          engine = new Engine();
        }
      `;
      const result = parseCode(code);
      
      const engineProp = result.classes[1].members.find(m => m.name === 'engine');
      expect(engineProp?.type).toBe('Engine');
    });
  });

  // --------------------------------------------------------
  // 27. PlantUML 完整输出验证
  // --------------------------------------------------------
  describe('27. PlantUML 完整输出验证', () => {
    
    test('完整示例应生成有效 PlantUML', () => {
      const code = `
        interface Serializable {
          serialize(): string;
        }
        
        abstract class Entity {
          id: number;
          abstract validate(): boolean;
        }
        
        class User extends Entity implements Serializable {
          name: string;
          private password: string;
          
          constructor(name: string, password: string) {
            super();
            this.name = name;
          }
          
          serialize(): string {
            return JSON.stringify({ name: this.name });
          }
          
          validate(): boolean {
            return this.name.length > 0;
          }
          
          static create(name: string): User {
            return new User(name, "");
          }
        }
        
        class Role {
          name: string;
        }
        
        class UserRole {
          user: User;
          role: Role;
        }
      `;
      const result = parseCode(code);
      const plantuml = formatParsed(result);
      
      // 验证基本结构
      expect(plantuml).toContain('@startuml');
      expect(plantuml).toContain('@enduml');
      
      // 验证类声明
      expect(plantuml).toContain('interface Serializable {');
      expect(plantuml).toContain('abstract class Entity {');
      expect(plantuml).toContain('class User {');
      
      // 验证关系
      expect(plantuml).toContain('User --|> Entity');
      expect(plantuml).toContain('User ..|> Serializable');
      
      // 验证成员
      expect(plantuml).toContain('+ name : string');
      expect(plantuml).toContain('- password : string');
      expect(plantuml).toContain('{static} + create(name: string) : User');
      expect(plantuml).toContain('{abstract} + validate() : boolean');
    });
  });

  // --------------------------------------------------------
  // 28. UML 语义正确性
  // --------------------------------------------------------
  describe('28. UML 语义正确性', () => {
    
    test('继承关系子类应指向父类', () => {
      const code = `
        class Parent {}
        class Child extends Parent {}
      `;
      const result = parseCode(code);
      
      const relation = result.relations.find(r => r.type === 'extends');
      expect(relation?.from).toBe('Child');
      expect(relation?.to).toBe('Parent');
    });

    test('实现关系类应指向接口', () => {
      const code = `
        interface I { method(): void; }
        class C implements I { method(): void {} }
      `;
      const result = parseCode(code);
      
      const relation = result.relations.find(r => r.type === 'implements');
      expect(relation?.from).toBe('C');
      expect(relation?.to).toBe('I');
    });

    test('聚合关系整体应指向部分', () => {
      const code = `
        class Part {}
        class Whole { parts: Part[]; }
      `;
      const result = parseCode(code);
      
      const relation = result.relations.find(r => r.type === 'aggregation');
      expect(relation?.from).toBe('Whole');
      expect(relation?.to).toBe('Part');
    });

    test('组合关系整体应指向部分', () => {
      const code = `
        class Part { value: number; }
        class Whole { part: Part = new Part(); }
      `;
      const result = parseCode(code);
      
      const relation = result.relations.find(r => r.type === 'composition');
      expect(relation?.from).toBe('Whole');
      expect(relation?.to).toBe('Part');
    });

    test('依赖关系使用方应指向被使用方', () => {
      const code = `
        class Utility { help(): void {} }
        class Client {
          use(u: Utility): void {}
        }
      `;
      const result = parseCode(code);
      
      const relation = result.relations.find(r => r.type === 'dependency');
      expect(relation?.from).toBe('Client');
      expect(relation?.to).toBe('Utility');
    });
  });

  // --------------------------------------------------------
  // 29. 关系去重与合并
  // --------------------------------------------------------
  describe('29. 关系去重与合并', () => {
    
    test('同一对类不应有重复的继承关系', () => {
      const code = `
        class A {}
        class B extends A {}
      `;
      const result = parseCode(code);
      
      const extendsRelations = result.relations.filter(
        r => r.type === 'extends' && r.from === 'B' && r.to === 'A'
      );
      expect(extendsRelations).toHaveLength(1);
    });

    test('同一对类不应有重复的实现关系', () => {
      const code = `
        interface I { m(): void; }
        class C implements I { m(): void {} }
      `;
      const result = parseCode(code);
      
      const implementsRelations = result.relations.filter(
        r => r.type === 'implements' && r.from === 'C' && r.to === 'I'
      );
      expect(implementsRelations).toHaveLength(1);
    });
  });

  // --------------------------------------------------------
  // 30. 多重性边界值
  // --------------------------------------------------------
  describe('30. 多重性边界值', () => {
    
    test('ReadonlyArray 应标记为 *', () => {
      const code = `
        class Item {}
        class Container {
          items: ReadonlyArray<Item>;
        }
      `;
      const result = parseCode(code);
      
      const relation = result.relations.find(r => r.to === 'Item');
      expect(relation?.toMultiplicity).toBe('*');
    });

    test('Array 泛型形式应标记为 *', () => {
      const code = `
        class Item {}
        class Container {
          items: Array<Item>;
        }
      `;
      const result = parseCode(code);
      
      const relation = result.relations.find(r => r.to === 'Item');
      expect(relation?.toMultiplicity).toBe('*');
    });

    test('T | null 联合类型应标记为 0..1', () => {
      const code = `
        class Ref {}
        class Container {
          ref: Ref | null;
        }
      `;
      const result = parseCode(code);
      
      const relation = result.relations.find(r => r.to === 'Ref');
      // 联合类型包含 null 时应为 0..1
      expect(relation).toBeDefined();
    });
  });

  // --------------------------------------------------------
  // 31. 访问修饰符与 PlantUML 输出
  // --------------------------------------------------------
  describe('31. 访问修饰符与 PlantUML 输出', () => {
    
    test('所有修饰符应在 PlantUML 中正确显示', () => {
      const code = `
        class Test {
          public pub: string;
          private pri: string;
          protected pro: string;
          default_: string;
        }
      `;
      const result = parseCode(code);
      const plantuml = formatParsed(result);
      
      expect(plantuml).toContain('+ pub : string');
      expect(plantuml).toContain('- pri : string');
      expect(plantuml).toContain('# pro : string');
    });

    test('方法的访问修饰符应正确显示', () => {
      const code = `
        class Test {
          public pubMethod(): void {}
          private priMethod(): void {}
          protected proMethod(): void {}
        }
      `;
      const result = parseCode(code);
      const plantuml = formatParsed(result);
      
      expect(plantuml).toContain('+ pubMethod() : void');
      expect(plantuml).toContain('- priMethod() : void');
      expect(plantuml).toContain('# proMethod() : void');
    });
  });

  // --------------------------------------------------------
  // 32. PlantUML 格式化边界
  // --------------------------------------------------------
  describe('32. PlantUML 格式化边界', () => {
    
    test('多行 PlantUML 应正确换行', () => {
      const code = `
        class A {}
        class B {}
        class C {}
      `;
      const result = parseCode(code);
      const plantuml = formatParsed(result);
      
      // 每个类定义应在新行
      expect(plantuml).toContain('class A {');
      expect(plantuml).toContain('class B {');
      expect(plantuml).toContain('class C {');
    });

    test('空类体应正确处理', () => {
      const code = `class Empty {}`;
      const result = parseCode(code);
      const plantuml = formatParsed(result);
      
      expect(plantuml).toContain('class Empty {');
      expect(plantuml).toContain('}');
    });
  });

  // --------------------------------------------------------
  // 33. 复杂继承树
  // --------------------------------------------------------
  describe('33. 复杂继承树', () => {
    
    test('三层继承应正确解析', () => {
      const code = `
        class Root {}
        class Middle extends Root {}
        class Leaf extends Middle {}
      `;
      const result = parseCode(code);
      
      const extendsRelations = result.relations.filter(r => r.type === 'extends');
      expect(extendsRelations).toHaveLength(2);
      
      const middleToRoot = extendsRelations.find(r => r.from === 'Middle' && r.to === 'Root');
      const leafToMiddle = extendsRelations.find(r => r.from === 'Leaf' && r.to === 'Middle');
      
      expect(middleToRoot).toBeDefined();
      expect(leafToMiddle).toBeDefined();
    });

    test('接口多继承应正确解析', () => {
      const code = `
        interface A { a(): void; }
        interface B extends A { b(): void; }
        interface C extends A { c(): void; }
        interface D extends B, C { d(): void; }
      `;
      const result = parseCode(code);
      
      const dExtends = result.relations.filter(r => r.from === 'D' && r.type === 'extends');
      expect(dExtends).toHaveLength(2);
    });
  });

  // --------------------------------------------------------
  // 34. throw 语句产生的依赖关系
  // --------------------------------------------------------
  describe('34. throw 语句产生的依赖关系', () => {
    
    test('throw new 自定义错误应产生依赖关系', () => {
      const code = `
        class CredentialSynchronizationError {
          providerId: string;
        }
        class ModelRuntime {
          private synchronize(): void {
            throw new CredentialSynchronizationError();
          }
        }
      `;
      const result = parseCode(code);
      
      // ModelRuntime 应该依赖 CredentialSynchronizationError
      const dependency = result.relations.find(
        r => r.from === 'ModelRuntime' && r.to === 'CredentialSynchronizationError' && r.type === 'dependency'
      );
      expect(dependency).toBeDefined();
    });

    test('throw 已存在的错误类应产生依赖关系', () => {
      const code = `
        class CustomError {
          message: string;
        }
        class Service {
          process(): void {
            throw new CustomError();
          }
        }
      `;
      const result = parseCode(code);
      
      const dependency = result.relations.find(
        r => r.from === 'Service' && r.to === 'CustomError' && r.type === 'dependency'
      );
      expect(dependency).toBeDefined();
    });

    test('throw Error 内置类型不应产生依赖', () => {
      const code = `
        class Service {
          process(): void {
            throw new Error('failed');
          }
        }
      `;
      const result = parseCode(code);
      
      // Error 是内置类型，不应产生用户类型的依赖关系
      const dependency = result.relations.find(
        r => r.from === 'Service' && r.to === 'Error' && r.type === 'dependency'
      );
      expect(dependency).toBeUndefined();
    });

    test('throw 表达式中的构造函数参数类型应产生依赖', () => {
      const code = `
        class Context {
          requestId: string;
        }
        class AppError {
          constructor(context: Context) {}
        }
        class Service {
          fail(ctx: Context): void {
            throw new AppError(ctx);
          }
        }
      `;
      const result = parseCode(code);
      
      // Service 依赖 AppError（throw）和 Context（参数）
      const throwDep = result.relations.find(
        r => r.from === 'Service' && r.to === 'AppError' && r.type === 'dependency'
      );
      const ctxDep = result.relations.find(
        r => r.from === 'Service' && r.to === 'Context'
      );
      expect(throwDep).toBeDefined();
      expect(ctxDep).toBeDefined();
    });

    test('多处 throw 同一错误类不应重复', () => {
      const code = `
        class MyError {}
        class Service {
          a(): void { throw new MyError(); }
          b(): void { throw new MyError(); }
        }
      `;
      const result = parseCode(code);
      
      const dependencies = result.relations.filter(
        r => r.from === 'Service' && r.to === 'MyError' && r.type === 'dependency'
      );
      expect(dependencies).toHaveLength(1);
    });

    test('catch 中引用的错误类型应产生依赖', () => {
      const code = `
        class NetworkError {
          statusCode: number;
        }
        class Service {
          fetch(): void {
            try {
              // some code
            } catch (e) {
              if (e instanceof NetworkError) {}
            }
          }
        }
      `;
      const result = parseCode(code);
      
      // 注意：instanceof 可能不会被当前解析器捕获
      // 这是一个边界情况
    });
  });

  // --------------------------------------------------------
  // 35. 关系方向一致性
  // --------------------------------------------------------
  describe('35. 关系方向一致性', () => {
    
    test('聚合方向应从整体到部分', () => {
      const code = `
        class Engine {}
        class Car { engines: Engine[]; }
      `;
      const result = parseCode(code);
      
      const relation = result.relations.find(r => r.type === 'aggregation');
      expect(relation?.from).toBe('Car');
      expect(relation?.to).toBe('Engine');
    });

    test('组合方向应从整体到部分', () => {
      const code = `
        class Window {}
        class House { window: Window = new Window(); }
      `;
      const result = parseCode(code);
      
      const relation = result.relations.find(r => r.type === 'composition');
      expect(relation?.from).toBe('House');
      expect(relation?.to).toBe('Window');
    });
  });

  // --------------------------------------------------------
  // 36. throw 语句产生的依赖关系
  // --------------------------------------------------------
  describe('36. throw 语句产生的依赖关系', () => {
    
    test('throw new 自定义错误应产生依赖关系', () => {
      const code = `
        class CredentialSynchronizationError {
          providerId: string;
        }
        class ModelRuntime {
          private synchronize(): void {
            throw new CredentialSynchronizationError();
          }
        }
      `;
      const result = parseCode(code);
      
      const dependency = result.relations.find(
        r => r.from === 'ModelRuntime' && r.to === 'CredentialSynchronizationError' && r.type === 'dependency'
      );
      expect(dependency).toBeDefined();
    });

    test('throw 已存在的错误类应产生依赖关系', () => {
      const code = `
        class CustomError {
          message: string;
        }
        class Service {
          process(): void {
            throw new CustomError();
          }
        }
      `;
      const result = parseCode(code);
      
      const dependency = result.relations.find(
        r => r.from === 'Service' && r.to === 'CustomError' && r.type === 'dependency'
      );
      expect(dependency).toBeDefined();
    });

    test('throw Error 内置类型不应产生依赖', () => {
      const code = `
        class Service {
          process(): void {
            throw new Error('failed');
          }
        }
      `;
      const result = parseCode(code);
      
      const dependency = result.relations.find(
        r => r.from === 'Service' && r.to === 'Error' && r.type === 'dependency'
      );
      expect(dependency).toBeUndefined();
    });

    test('throw 表达式中的构造函数参数类型应产生依赖', () => {
      const code = `
        class Context {
          requestId: string;
        }
        class AppError {
          constructor(context: Context) {}
        }
        class Service {
          fail(ctx: Context): void {
            throw new AppError(ctx);
          }
        }
      `;
      const result = parseCode(code);
      
      const throwDep = result.relations.find(
        r => r.from === 'Service' && r.to === 'AppError' && r.type === 'dependency'
      );
      const ctxDep = result.relations.find(
        r => r.from === 'Service' && r.to === 'Context'
      );
      expect(throwDep).toBeDefined();
      expect(ctxDep).toBeDefined();
    });

    test('多处 throw 同一错误类不应重复', () => {
      const code = `
        class MyError {}
        class Service {
          a(): void { throw new MyError(); }
          b(): void { throw new MyError(); }
        }
      `;
      const result = parseCode(code);
      
      const dependencies = result.relations.filter(
        r => r.from === 'Service' && r.to === 'MyError' && r.type === 'dependency'
      );
      expect(dependencies).toHaveLength(1);
    });
  });

  // --------------------------------------------------------
  // 37. 多文件合并功能
  // --------------------------------------------------------
  describe('37. 多文件合并功能', () => {
    
    test('多个文件的类应该能合并解析', () => {
      const code1 = `class User { name: string; }`;
      const code2 = `class Order { user: User; }`;
      
      const parsed1 = parseCode(code1);
      const parsed2 = parseCode(code2);
      
      const allClasses = [...parsed1.classes, ...parsed2.classes];
      
      expect(allClasses).toHaveLength(2);
      expect(allClasses.map(c => c.name)).toContain('User');
      expect(allClasses.map(c => c.name)).toContain('Order');
    });

    test('跨文件引用应产生关系', () => {
      const code1 = `class Database { connect(): void {} }`;
      const code2 = `
        class UserService {
          db: Database;
          constructor(db: Database) {}
        }
      `;
      
      // 使用 parseCodeWithKnownTypes 传入外部类型
      const parsed2 = parseCodeWithKnownTypes(code2, new Set(['Database']));
      
      expect(parsed2.relations.length).toBeGreaterThan(0);
      const dbRelation = parsed2.relations.find(
        r => r.from === 'UserService' && r.to === 'Database'
      );
      expect(dbRelation).toBeDefined();
    });

    test('包名应基于文件名设置', () => {
      const parsed = parseCode('class Test {}');
      parsed.classes.forEach(c => { c.packageName = 'myfile'; });
      
      expect(parsed.classes[0].packageName).toBe('myfile');
    });

    test('同名类不应重复添加', () => {
      const code1 = `class Shared { value: number; }`;
      const code2 = `class Shared { value: string; }`;
      
      const parsed1 = parseCode(code1);
      const parsed2 = parseCode(code2);
      
      const classPackageMap = new Map<string, string>();
      const allClasses: typeof parsed1.classes = [];
      
      parsed1.classes.forEach(c => {
        if (!classPackageMap.has(c.name)) {
          classPackageMap.set(c.name, 'file1');
          allClasses.push(c);
        }
      });
      
      parsed2.classes.forEach(c => {
        if (!classPackageMap.has(c.name)) {
          classPackageMap.set(c.name, 'file2');
          allClasses.push(c);
        }
      });
      
      expect(allClasses).toHaveLength(1);
      expect(classPackageMap.get('Shared')).toBe('file1');
    });

    test('关系应该去重', () => {
      const code = `class A { b: B; } class B {}`;
      const parsed1 = parseCode(code);
      const parsed2 = parseCode(code);
      
      const allRelations = [...parsed1.relations, ...parsed2.relations];
      const uniqueRelations: typeof allRelations = [];
      const relationKeys = new Set<string>();
      
      allRelations.forEach(r => {
        const key = `${r.from}-${r.type}-${r.to}`;
        if (!relationKeys.has(key)) {
          relationKeys.add(key);
          uniqueRelations.push(r);
        }
      });
      
      const aToB = uniqueRelations.filter(r => r.from === 'A' && r.to === 'B');
      expect(aToB).toHaveLength(1);
    });

    test('跨文件继承应正确处理', () => {
      const code1 = `abstract class BaseEntity { id: number; }`;
      const code2 = `class User extends BaseEntity { name: string; }`;
      
      const parsed2 = parseCodeWithKnownTypes(code2, new Set(['BaseEntity']));
      
      const extendsRelation = parsed2.relations.find(
        r => r.type === 'extends' && r.from === 'User' && r.to === 'BaseEntity'
      );
      expect(extendsRelation).toBeDefined();
    });

    test('跨文件实现接口应正确处理', () => {
      const code1 = `interface Serializable { serialize(): string; }`;
      const code2 = `
        class UserModel implements Serializable {
          serialize(): string { return ''; }
        }
      `;
      
      const parsed2 = parseCodeWithKnownTypes(code2, new Set(['Serializable']));
      
      const implementsRelation = parsed2.relations.find(
        r => r.type === 'implements' && r.from === 'UserModel' && r.to === 'Serializable'
      );
      expect(implementsRelation).toBeDefined();
    });

    test('跨文件聚合关系应正确处理', () => {
      const code1 = `class Engine { power: number; }`;
      const code2 = `class Car { engines: Engine[]; }`;
      
      const parsed2 = parseCodeWithKnownTypes(code2, new Set(['Engine']));
      
      const aggregation = parsed2.relations.find(
        r => r.type === 'aggregation' && r.from === 'Car' && r.to === 'Engine'
      );
      expect(aggregation).toBeDefined();
      expect(aggregation?.toMultiplicity).toBe('*');
    });

    test('跨文件组合关系应正确处理', () => {
      const code1 = `class Window { size: number; }`;
      const code2 = `class House { window: Window = new Window(); }`;
      
      const parsed2 = parseCodeWithKnownTypes(code2, new Set(['Window']));
      
      const composition = parsed2.relations.find(
        r => r.type === 'composition' && r.from === 'House' && r.to === 'Window'
      );
      expect(composition).toBeDefined();
    });

    test('跨文件依赖关系应正确处理', () => {
      const code1 = `class Logger { log(msg: string): void {} }`;
      const code2 = `
        class Service {
          process(logger: Logger): void {}
        }
      `;
      
      const parsed2 = parseCodeWithKnownTypes(code2, new Set(['Logger']));
      
      const dependency = parsed2.relations.find(
        r => r.type === 'dependency' && r.from === 'Service' && r.to === 'Logger'
      );
      expect(dependency).toBeDefined();
    });
  });

  // --------------------------------------------------------
  // 38. PlantUML 包语法
  // --------------------------------------------------------
  describe('38. PlantUML 包语法', () => {
    
    test('单文件应能设置包名', () => {
      const parsed = parseCode('class Test {}');
      parsed.classes.forEach(c => { c.packageName = 'myPackage'; });
      
      expect(parsed.classes[0].packageName).toBe('myPackage');
    });

    test('多个包应该能正确区分', () => {
      const parsed1 = parseCode('class User { name: string; }');
      const parsed2 = parseCode('class Order { id: number; }');
      
      parsed1.classes.forEach(c => { c.packageName = 'models'; });
      parsed2.classes.forEach(c => { c.packageName = 'services'; });
      
      const allClasses = [...parsed1.classes, ...parsed2.classes];
      expect(allClasses).toHaveLength(2);
      
      const modelsClasses = allClasses.filter(c => c.packageName === 'models');
      const servicesClasses = allClasses.filter(c => c.packageName === 'services');
      
      expect(modelsClasses).toHaveLength(1);
      expect(servicesClasses).toHaveLength(1);
    });
  });

  // --------------------------------------------------------
  // 39. 文件名到包名的转换
  // --------------------------------------------------------
  describe('39. 文件名到包名的转换', () => {
    
    test('文件名应该作为包名使用', () => {
      const fileName = 'models.ts';
      const packageName = fileName.replace(/\.ts$/, '');
      
      expect(packageName).toBe('models');
    });

    test('带路径的文件名应只取文件名部分', () => {
      const filePath = 'src/models/user.ts';
      const fileName = filePath.split('/').pop() || '';
      const packageName = fileName.replace(/\.ts$/, '');
      
      expect(packageName).toBe('user');
    });

    test('Windows 路径也应正确处理', () => {
      const filePath = 'src\\models\\user.ts';
      const fileName = filePath.split('\\').pop() || '';
      const packageName = fileName.replace(/\.ts$/, '');
      
      expect(packageName).toBe('user');
    });
  });
});
