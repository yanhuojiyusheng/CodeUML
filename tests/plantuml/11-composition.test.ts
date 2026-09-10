/**
 * 关系判断难点 - 组合与聚合
 */

import { parseCode } from '../../src/core/parser';

describe('关系判断难点 - 组合与聚合', () => {

  describe('组合 vs 聚合细致规则', () => {
    
    test('private b = new B() → 组合', () => {
      const code = `
        class B { value: number; }
        class A {
          private b = new B();
        }
      `;
      const result = parseCode(code);
      
      const r = result.relations.find(r => r.from === 'A' && r.to === 'B');
      expect(r?.type).toBe('composition');
    });

    test('private b: B = new B() → 组合', () => {
      const code = `
        class B { value: number; }
        class A {
          private b: B = new B();
        }
      `;
      const result = parseCode(code);
      
      const r = result.relations.find(r => r.from === 'A' && r.to === 'B');
      expect(r?.type).toBe('composition');
    });

    test('private b!: B → 关联（延迟初始化）', () => {
      const code = `
        class B { value: number; }
        class A {
          private b!: B;
        }
      `;
      const result = parseCode(code);
      
      const r = result.relations.find(r => r.from === 'A' && r.to === 'B');
      // 断言初始化标记不应被视为组合
      expect(r?.type).not.toBe('composition');
    });

    test('private b?: B → 关联（可选）', () => {
      const code = `
        class B { value: number; }
        class A {
          private b?: B;
        }
      `;
      const result = parseCode(code);
      
      const r = result.relations.find(r => r.from === 'A' && r.to === 'B');
      expect(r).toBeDefined();
      expect(r?.toMultiplicity).toBe('0..1');
    });

    test('private b: B | null = null → 关联', () => {
      const code = `
        class B { value: number; }
        class A {
          private b: B | null = null;
        }
      `;
      const result = parseCode(code);
      
      const r = result.relations.find(r => r.from === 'A' && r.to === 'B');
      expect(r).toBeDefined();
    });

    test('构造函数参数赋值 → 聚合（外部传入）', () => {
      const code = `
        class D { id: number; }
        class C {
          private d: D;
          constructor(d: D) {
            this.d = d;
          }
        }
      `;
      const result = parseCode(code);
      
      const r = result.relations.find(r => r.from === 'C' && r.to === 'D');
      // 没有 new 创建，应该是关联或聚合
      expect(r).toBeDefined();
      expect(r?.type).not.toBe('composition');
    });
  });

  describe('构造函数参数属性', () => {
    
    test('private 参数 → 关联', () => {
      const code = `
        class Service { }
        class Controller {
          constructor(private service: Service) {}
        }
      `;
      const result = parseCode(code);
      
      const r = result.relations.find(r => r.from === 'Controller' && r.to === 'Service');
      expect(r).toBeDefined();
      expect(r?.type).not.toBe('dependency');
    });

    test('public 参数 → 关联', () => {
      const code = `
        class Config { }
        class App {
          constructor(public config: Config) {}
        }
      `;
      const result = parseCode(code);
      
      const r = result.relations.find(r => r.from === 'App' && r.to === 'Config');
      expect(r).toBeDefined();
      expect(r?.type).not.toBe('dependency');
    });

    test('protected 参数 → 关联', () => {
      const code = `
        class Base { }
        class Child {
          constructor(protected base: Base) {}
        }
      `;
      const result = parseCode(code);
      
      const r = result.relations.find(r => r.from === 'Child' && r.to === 'Base');
      expect(r).toBeDefined();
    });

    test('readonly 参数 → 关联', () => {
      const code = `
        class Dep { }
        class A {
          constructor(readonly dep: Dep) {}
        }
      `;
      const result = parseCode(code);
      
      const r = result.relations.find(r => r.from === 'A' && r.to === 'Dep');
      expect(r).toBeDefined();
    });

    test('普通参数（无修饰符）→ 依赖', () => {
      const code = `
        class Config { }
        class App {
          constructor(config: Config) {}
        }
      `;
      const result = parseCode(code);
      
      const r = result.relations.find(r => r.from === 'App' && r.to === 'Config');
      expect(r?.type).toBe('dependency');
    });

    test('混合参数 → 正确区分', () => {
      const code = `
        class Service { }
        class Config { }
        class Controller {
          constructor(
            private service: Service,
            config: Config
          ) {}
        }
      `;
      const result = parseCode(code);
      
      const serviceR = result.relations.find(r => r.from === 'Controller' && r.to === 'Service');
      const configR = result.relations.find(r => r.from === 'Controller' && r.to === 'Config');
      
      // service 是字段（关联），config 是参数（依赖）
      expect(serviceR?.type).not.toBe('dependency');
      expect(configR?.type).toBe('dependency');
    });
  });
});
