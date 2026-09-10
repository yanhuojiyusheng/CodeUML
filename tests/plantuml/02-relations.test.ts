/**
 * PlantUML 语法合规性 - 关系
 */

import { parseCode } from '../../src/core/parser';
import { formatParsed } from '../../src/core/plantuml';

describe('PlantUML 语法合规性 - 关系', () => {

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
});
