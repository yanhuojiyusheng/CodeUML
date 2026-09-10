/**
 * PlantUML 语法合规性 - 成员
 */

import { parseCode } from '../../src/core/parser';
import { formatParsed } from '../../src/core/plantuml';

describe('PlantUML 语法合规性 - 成员', () => {

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
});
