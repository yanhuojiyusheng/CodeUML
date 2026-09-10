/**
 * 关系判断难点 - 泛型与内置类型
 */

import { parseCode } from '../../src/core/parser';

describe('关系判断难点 - 泛型与内置类型', () => {

  describe('泛型参数', () => {
    
    test('泛型参数 T 不应建立关系', () => {
      const code = `
        class Container<T> {
          item: T;
        }
      `;
      const result = parseCode(code);
      
      // T 是泛型参数，不应有依赖关系
      expect(result.relations).toHaveLength(0);
    });

    test('泛型类继承 → 泛化', () => {
      const code = `
        class Base<T> { }
        class Derived extends Base<string> { }
      `;
      const result = parseCode(code);
      
      const r = result.relations.find(r => r.type === 'extends');
      expect(r).toBeDefined();
      expect(r?.from).toBe('Derived');
      expect(r?.to).toBe('Base');
    });
  });

  describe('内置类型 vs 用户类型', () => {
    
    test('Error 内置类型不应产生关系', () => {
      const code = `
        class Service {
          fail(): void {
            throw new Error('failed');
          }
        }
      `;
      const result = parseCode(code);
      
      const r = result.relations.find(r => r.to === 'Error');
      expect(r).toBeUndefined();
    });

    test('Date 内置类型不应产生关系', () => {
      const code = `
        class Event {
          startDate: Date;
        }
      `;
      const result = parseCode(code);
      
      const r = result.relations.find(r => r.to === 'Date');
      expect(r).toBeUndefined();
    });

    test('Promise<T> 剥壳后关联 T', () => {
      const code = `
        class Result { data: string; }
        class Service {
          fetch(): Promise<Result> { return new Promise(() => {}); }
        }
      `;
      const result = parseCode(code);
      
      const r = result.relations.find(r => r.from === 'Service' && r.to === 'Result');
      expect(r).toBeDefined();
    });

    test('用户定义的 MyError 应产生关系', () => {
      const code = `
        class AppError { message: string; }
        class Service {
          fail(): void {
            throw new AppError();
          }
        }
      `;
      const result = parseCode(code);
      
      const r = result.relations.find(r => r.from === 'Service' && r.to === 'AppError');
      expect(r).toBeDefined();
    });
  });

  describe('工具类型剥壳', () => {
    
    test('Partial<User> → 关联 User', () => {
      const code = `
        class User { name: string; }
        class UserService {
          update(id: string, data: Partial<User>): void {}
        }
      `;
      const result = parseCode(code);
      
      const r = result.relations.find(r => r.from === 'UserService' && r.to === 'User');
      expect(r).toBeDefined();
    });

    test('Required<User> → 关联 User', () => {
      const code = `
        class Config { debug?: boolean; }
        class App {
          config: Required<Config>;
        }
      `;
      const result = parseCode(code);
      
      const r = result.relations.find(r => r.from === 'App' && r.to === 'Config');
      expect(r).toBeDefined();
    });
  });
});
