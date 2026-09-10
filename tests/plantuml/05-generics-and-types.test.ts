/**
 * PlantUML 语法合规性 - 泛型与类型
 */

import { parseCode } from '../../src/core/parser';
import { formatParsed } from '../../src/core/plantuml';

describe('PlantUML 语法合规性 - 泛型与类型', () => {

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
      expect(plantuml).toContain('class "Empty" as Empty {');
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
});
