/**
 * 关系判断难点 - 关联与依赖
 */

import { parseCode } from '../../src/core/parser';

describe('关系判断难点 - 关联与依赖', () => {

  describe('关联 vs 依赖', () => {
    
    test('字段声明 → 关联', () => {
      const code = `
        class B { }
        class A {
          private b: B;
        }
      `;
      const result = parseCode(code);
      
      const r = result.relations.find(r => r.from === 'A' && r.to === 'B');
      expect(r?.type).not.toBe('dependency');
    });

    test('方法参数 → 依赖', () => {
      const code = `
        class C { }
        class A {
          method(c: C): void {}
        }
      `;
      const result = parseCode(code);
      
      const r = result.relations.find(r => r.from === 'A' && r.to === 'C');
      expect(r?.type).toBe('dependency');
    });

    test('返回值类型 → 依赖', () => {
      const code = `
        class D { }
        class A {
          method(): D { return new D(); }
        }
      `;
      const result = parseCode(code);
      
      const r = result.relations.find(r => r.from === 'A' && r.to === 'D');
      expect(r?.type).toBe('dependency');
    });

    test('方法体 new → 依赖', () => {
      const code = `
        class E { }
        class A {
          method(): void {
            const e = new E();
          }
        }
      `;
      const result = parseCode(code);
      
      const r = result.relations.find(r => r.from === 'A' && r.to === 'E');
      expect(r?.type).toBe('dependency');
    });

    test('throw new → 依赖', () => {
      const code = `
        class F { }
        class A {
          method(): void {
            throw new F();
          }
        }
      `;
      const result = parseCode(code);
      
      const r = result.relations.find(r => r.from === 'A' && r.to === 'F');
      expect(r?.type).toBe('dependency');
    });

    test('构造函数参数属性带修饰符 → 关联（不是依赖）', () => {
      const code = `
        class Service { }
        class A {
          constructor(private service: Service) {}
        }
      `;
      const result = parseCode(code);
      
      const r = result.relations.find(r => r.from === 'A' && r.to === 'Service');
      expect(r).toBeDefined();
      // 应该是关联/聚合，不是依赖
      expect(r?.type).not.toBe('dependency');
    });

    test('构造函数普通参数（无修饰符）→ 依赖', () => {
      const code = `
        class Config { }
        class A {
          constructor(config: Config) {}
        }
      `;
      const result = parseCode(code);
      
      const r = result.relations.find(r => r.from === 'A' && r.to === 'Config');
      expect(r?.type).toBe('dependency');
    });
  });
});
