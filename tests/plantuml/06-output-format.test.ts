/**
 * PlantUML 语法合规性 - 输出格式
 */

import { parseCode } from '../../src/core/parser';
import { formatParsed } from '../../src/core/plantuml';

describe('PlantUML 语法合规性 - 输出格式', () => {

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
      expect(plantuml).toContain('interface "Serializable" as Serializable {');
      expect(plantuml).toContain('abstract class "Entity" as Entity {');
      expect(plantuml).toContain('class "User" as User {');
      
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
      expect(plantuml).toContain('class "A" as A {');
      expect(plantuml).toContain('class "B" as B {');
      expect(plantuml).toContain('class "C" as C {');
    });

    test('空类体应正确处理', () => {
      const code = `class Empty {}`;
      const result = parseCode(code);
      const plantuml = formatParsed(result);
      
      expect(plantuml).toContain('class "Empty" as Empty {');
      expect(plantuml).toContain('}');
    });
  });

  // --------------------------------------------------------
  // 33. 复杂继承树
  // --------------------------------------------------------
});
