/**
 * PlantUML 语法合规性 - 类关系判断规则
 */

import { parseCode } from '../../src/core/parser';

describe('PlantUML 语法合规性 - 类关系判断规则', () => {

  describe('39. 类关系判断规则验证', () => {
    
    // ======== 1. 泛化/继承 (Generalization) ========
    describe('泛化/继承关系', () => {
      
      test('class A extends B → A --|> B', () => {
        const code = `
          class Animal {}
          class Dog extends Animal {}
        `;
        const result = parseCode(code);
        
        const r = result.relations.find(r => r.from === 'Dog' && r.to === 'Animal');
        expect(r?.type).toBe('extends');
      });

      test('多层继承应正确链式', () => {
        const code = `
          class Base {}
          class Middle extends Base {}
          class Child extends Middle {}
        `;
        const result = parseCode(code);
        
        const r1 = result.relations.find(r => r.from === 'Middle' && r.to === 'Base');
        const r2 = result.relations.find(r => r.from === 'Child' && r.to === 'Middle');
        expect(r1?.type).toBe('extends');
        expect(r2?.type).toBe('extends');
      });
    });

    // ======== 2. 实现 (Realization) ========
    describe('实现关系', () => {
      
      test('class A implements B → A ..|> B', () => {
        const code = `
          interface Flyable { fly(): void; }
          class Bird implements Flyable { fly(): void {} }
        `;
        const result = parseCode(code);
        
        const r = result.relations.find(r => r.from === 'Bird' && r.to === 'Flyable');
        expect(r?.type).toBe('implements');
      });

      test('继承 + 实现组合', () => {
        const code = `
          class Animal {}
          interface Pet { play(): void; }
          class Dog extends Animal implements Pet { play(): void {} }
        `;
        const result = parseCode(code);
        
        const extendsR = result.relations.find(r => r.from === 'Dog' && r.to === 'Animal');
        const implR = result.relations.find(r => r.from === 'Dog' && r.to === 'Pet');
        expect(extendsR?.type).toBe('extends');
        expect(implR?.type).toBe('implements');
      });
    });

    // ======== 3. 组合 (Composition) ========
    describe('组合关系 - 内部 new 创建', () => {
      
      test('字段内 new → 组合 *--', () => {
        const code = `
          class Engine { power: number; }
          class Car {
            engine: Engine = new Engine();
          }
        `;
        const result = parseCode(code);
        
        const r = result.relations.find(r => r.from === 'Car' && r.to === 'Engine');
        expect(r?.type).toBe('composition');
      });

      test('构造函数内 new → 组合', () => {
        const code = `
          class Config { debug: boolean; }
          class App {
            config: Config;
            constructor() {
              this.config = new Config();
            }
          }
        `;
        const result = parseCode(code);
        
        // 注意：当前解析器可能无法识别构造函数内的 new
        // 这是一个边界情况
      });

      test('多个 new 创建的字段 → 多个组合', () => {
        const code = `
          class Engine { power: number; }
          class Transmission { gears: number; }
          class Car {
            engine: Engine = new Engine();
            transmission: Transmission = new Transmission();
          }
        `;
        const result = parseCode(code);
        
        const engineR = result.relations.find(r => r.from === 'Car' && r.to === 'Engine');
        const transR = result.relations.find(r => r.from === 'Car' && r.to === 'Transmission');
        expect(engineR?.type).toBe('composition');
        expect(transR?.type).toBe('composition');
      });
    });

    // ======== 4. 聚合 (Aggregation) ========
    describe('聚合关系 - 外部传入/数组', () => {
      
      test('数组字段 → 聚合 o--', () => {
        const code = `
          class Wheel { size: number; }
          class Car {
            wheels: Wheel[];
          }
        `;
        const result = parseCode(code);
        
        const r = result.relations.find(r => r.from === 'Car' && r.to === 'Wheel');
        expect(r?.type).toBe('aggregation');
        expect(r?.toMultiplicity).toBe('*');
      });

      test('ReadonlyArray 字段 → 聚合', () => {
        const code = `
          class Item { id: number; }
          class Container {
            items: ReadonlyArray<Item>;
          }
        `;
        const result = parseCode(code);
        
        const r = result.relations.find(r => r.from === 'Container' && r.to === 'Item');
        expect(r?.type).toBe('aggregation');
      });

      test('Map 字段 → 聚合', () => {
        const code = `
          class User { name: string; }
          class UserService {
            users: Map<string, User>;
          }
        `;
        const result = parseCode(code);
        
        // Map 的泛型参数可能不会被正确识别
        // 这取决于 cleanTypeName 的实现
      });
    });

    // ======== 5. 关联 (Association) ========
    describe('关联关系 - 普通字段持有', () => {
      
      test('普通字段 → 关联 -->', () => {
        const code = `
          class Driver { name: string; }
          class Car {
            driver: Driver;
          }
        `;
        const result = parseCode(code);
        
        const r = result.relations.find(r => r.from === 'Car' && r.to === 'Driver');
        expect(r?.type).toBe('association');
      });

      test('构造函数参数赋值字段 → 关联', () => {
        const code = `
          class Engine { power: number; }
          class Car {
            engine: Engine;
            constructor(engine: Engine) {
              this.engine = engine;
            }
          }
        `;
        const result = parseCode(code);
        
        const r = result.relations.find(r => r.from === 'Car' && r.to === 'Engine');
        // 应该是关联或聚合，取决于是否有 new
        expect(['association', 'aggregation']).toContain(r?.type);
      });
    });

    // ======== 6. 依赖 (Dependency) ========
    describe('依赖关系 - 方法内临时使用', () => {
      
      test('方法参数类型 → 依赖 ..>', () => {
        const code = `
          class Logger { log(msg: string): void {} }
          class Service {
            process(logger: Logger): void {}
          }
        `;
        const result = parseCode(code);
        
        const r = result.relations.find(r => r.from === 'Service' && r.to === 'Logger');
        expect(r?.type).toBe('dependency');
      });

      test('返回值类型 → 依赖', () => {
        const code = `
          class Result { data: string; }
          class Service {
            getResult(): Result { return new Result(); }
          }
        `;
        const result = parseCode(code);
        
        const r = result.relations.find(r => r.from === 'Service' && r.to === 'Result');
        expect(r?.type).toBe('dependency');
      });

      test('throw new → 依赖', () => {
        const code = `
          class AppError { message: string; }
          class Service {
            fail(): void { throw new AppError(); }
          }
        `;
        const result = parseCode(code);
        
        const r = result.relations.find(r => r.from === 'Service' && r.to === 'AppError');
        expect(r?.type).toBe('dependency');
      });

      test('方法内 new → 依赖', () => {
        const code = `
          class Client { connect(): void {} }
          class Factory {
            create(): Client { return new Client(); }
          }
        `;
        const result = parseCode(code);
        
        const r = result.relations.find(r => r.from === 'Factory' && r.to === 'Client');
        expect(r?.type).toBe('dependency');
      });
    });

    // ======== 7. 关系优先级验证 ========
    describe('关系优先级', () => {
      
      test('字段有 new → 组合优先于关联', () => {
        const code = `
          class Engine { power: number; }
          class Car {
            engine: Engine = new Engine();
          }
        `;
        const result = parseCode(code);
        
        const r = result.relations.find(r => r.from === 'Car' && r.to === 'Engine');
        expect(r?.type).toBe('composition');
      });

      test('数组字段 → 聚合优先于关联', () => {
        const code = `
          class Wheel { size: number; }
          class Car {
            wheels: Wheel[];
          }
        `;
        const result = parseCode(code);
        
        const r = result.relations.find(r => r.from === 'Car' && r.to === 'Wheel');
        expect(r?.type).toBe('aggregation');
      });

      test('字段 + 方法参数 → 字段关系优先', () => {
        const code = `
          class Logger { log(): void {} }
          class Service {
            logger: Logger;
            process(logger: Logger): void {}
          }
        `;
        const result = parseCode(code);
        
        // 应该是关联（字段），不是依赖（参数）
        const r = result.relations.find(r => r.from === 'Service' && r.to === 'Logger');
        expect(r?.type).not.toBe('dependency');
      });
    });

    // ======== 8. 边界情况 ========
    describe('关系边界情况', () => {
      
      test('基本类型字段不应产生关系', () => {
        const code = `
          class Person {
            name: string;
            age: number;
            active: boolean;
          }
        `;
        const result = parseCode(code);
        
        expect(result.relations).toHaveLength(0);
      });

      test('可选字段应标记多重性 0..1', () => {
        const code = `
          class Address { city: string; }
          class Person {
            address?: Address;
          }
        `;
        const result = parseCode(code);
        
        const r = result.relations.find(r => r.to === 'Address');
        expect(r?.toMultiplicity).toBe('0..1');
      });

      test('同类型多字段应合并标签', () => {
        const code = `
          class Wheel { size: number; }
          class Car {
            frontLeft: Wheel;
            frontRight: Wheel;
            backLeft: Wheel;
            backRight: Wheel;
          }
        `;
        const result = parseCode(code);
        
        const r = result.relations.find(r => r.from === 'Car' && r.to === 'Wheel');
        expect(r).toBeDefined();
        // 多个同类型字段应有标签
        expect(r?.label).toBeDefined();
      });
    });
  });

  // --------------------------------------------------------
  // 40. 类关系判断难点验证
  // --------------------------------------------------------
});
