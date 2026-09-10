/**
 * 关系判断难点 - 循环依赖
 */

import { parseCode } from '../../src/core/parser';

describe('关系判断难点 - 循环依赖', () => {

  describe('循环依赖', () => {
    
    test('A 关联 B，B 关联 A → 两条关系', () => {
      const code = `
        class A { b: B; }
        class B { a: A; }
      `;
      const result = parseCode(code);
      
      const aToB = result.relations.find(r => r.from === 'A' && r.to === 'B');
      const bToA = result.relations.find(r => r.from === 'B' && r.to === 'A');
      expect(aToB).toBeDefined();
      expect(bToA).toBeDefined();
    });

    test('循环继承不应产生（语法错误）', () => {
      // TypeScript 不允许循环继承，这里测试解析器不会崩溃
      expect(() => parseCode(`class A extends B {} class B extends A {}`)).not.toThrow();
    });
  });
});
