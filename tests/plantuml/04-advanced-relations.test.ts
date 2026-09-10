/**
 * PlantUML 语法合规性 - 高级关系
 */

import { parseCode } from '../../src/core/parser';

describe('PlantUML 语法合规性 - 高级关系', () => {

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
});
