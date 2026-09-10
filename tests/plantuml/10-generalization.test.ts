/**
 * 关系判断难点 - 泛化与继承
 */

import { parseCode } from '../../src/core/parser';

describe('关系判断难点 - 泛化与继承', () => {

  describe('泛化 vs 实现', () => {
    
    test('interface extends interface → 泛化 (extends)', () => {
      const code = `
        interface Readable { read(): void; }
        interface ReadWrite extends Readable { write(): void; }
      `;
      const result = parseCode(code);
      
      const r = result.relations.find(r => r.from === 'ReadWrite' && r.to === 'Readable');
      expect(r?.type).toBe('extends');
    });

    test('class extends class → 泛化 (extends)', () => {
      const code = `
        class Animal {}
        class Dog extends Animal {}
      `;
      const result = parseCode(code);
      
      const r = result.relations.find(r => r.from === 'Dog' && r.to === 'Animal');
      expect(r?.type).toBe('extends');
    });

    test('class implements interface → 实现 (implements)', () => {
      const code = `
        interface Printable { print(): void; }
        class Document implements Printable { print(): void {} }
      `;
      const result = parseCode(code);
      
      const r = result.relations.find(r => r.from === 'Document' && r.to === 'Printable');
      expect(r?.type).toBe('implements');
    });

    test('多接口继承 → 多条泛化', () => {
      const code = `
        interface A { a(): void; }
        interface B { b(): void; }
        interface C extends A, B { c(): void; }
      `;
      const result = parseCode(code);
      
      const extendsR = result.relations.filter(r => r.from === 'C' && r.type === 'extends');
      expect(extendsR).toHaveLength(2);
    });

    test('类实现多接口 → 多条实现', () => {
      const code = `
        interface Serializable { serialize(): string; }
        interface Loggable { log(): void; }
        class Model implements Serializable, Loggable {
          serialize(): string { return ''; }
          log(): void {}
        }
      `;
      const result = parseCode(code);
      
      const implR = result.relations.filter(r => r.from === 'Model' && r.type === 'implements');
      expect(implR).toHaveLength(2);
    });
  });

  describe('继承链上的关系', () => {
    
    test('子类不重复父类的关联', () => {
      const code = `
        class Logger { log(): void {} }
        class Base {
          protected logger: Logger;
        }
        class Derived extends Base {
          // 没有声明 logger，继承自 Base
        }
      `;
      const result = parseCode(code);
      
      // Base 有对 Logger 的关联
      const baseToLogger = result.relations.find(r => r.from === 'Base' && r.to === 'Logger');
      expect(baseToLogger).toBeDefined();
      
      // Derived 不应重复声明对 Logger 的关联
      const derivedToLogger = result.relations.find(r => r.from === 'Derived' && r.to === 'Logger');
      expect(derivedToLogger).toBeUndefined();
    });

    test('子类自己的字段应建立关系', () => {
      const code = `
        class Logger { log(): void {} }
        class Base { }
        class Derived extends Base {
          private logger: Logger;
        }
      `;
      const result = parseCode(code);
      
      const derivedToLogger = result.relations.find(r => r.from === 'Derived' && r.to === 'Logger');
      expect(derivedToLogger).toBeDefined();
    });
  });
});
