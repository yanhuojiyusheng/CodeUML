/**
 * PlantUML 语法合规性 - 类声明
 */

import { parseCode } from '../../src/core/parser';
import { formatParsed } from '../../src/core/plantuml';

describe('PlantUML 语法合规性 - 类声明', () => {

  describe('1. 基本类声明语法', () => {
    
    test('普通类应使用 class 关键字', () => {
      const result = parseCode('class Person { name: string; }');
      const plantuml = formatParsed(result);
      
      expect(plantuml).toContain('class "Person" as Person {');
    });

    test('接口应使用 interface 关键字', () => {
      const result = parseCode('interface Drawable { draw(): void; }');
      const plantuml = formatParsed(result);
      
      expect(plantuml).toContain('interface "Drawable" as Drawable {');
    });

    test('抽象类应使用 abstract class 关键字', () => {
      const result = parseCode('abstract class Shape { abstract area(): number; }');
      const plantuml = formatParsed(result);
      
      expect(plantuml).toContain('abstract class "Shape" as Shape {');
    });

    test('枚举应使用 enum 关键字', () => {
      const result = parseCode('enum Color { Red, Green, Blue }');
      const plantuml = formatParsed(result);
      
      expect(plantuml).toContain('enum "Color" as Color {');
    });
  });

  // --------------------------------------------------------
  // 2. 可见性符号 (+, -, #, ~)
  // --------------------------------------------------------

  describe('2. 可见性符号', () => {
    
    test('+ 表示 public', () => {
      const result = parseCode('class Test { public name: string; }');
      const plantuml = formatParsed(result);
      
      expect(plantuml).toContain('+ name : string');
    });

    test('- 表示 private', () => {
      const result = parseCode('class Test { private secret: string; }');
      const plantuml = formatParsed(result);
      
      expect(plantuml).toContain('- secret : string');
    });

    test('# 表示 protected', () => {
      const result = parseCode('class Test { protected internal: string; }');
      const plantuml = formatParsed(result);
      
      expect(plantuml).toContain('# internal : string');
    });

    test('默认无修饰符时应为 public (+)', () => {
      const result = parseCode('class Test { name: string; }');
      const plantuml = formatParsed(result);
      
      expect(plantuml).toContain('+ name : string');
    });
  });

  // --------------------------------------------------------
  // 3. 静态成员标记 {static}
  // --------------------------------------------------------

  describe('3. 静态成员标记', () => {
    
    test('静态属性应标记 {static}', () => {
      const result = parseCode('class Counter { static count: number = 0; }');
      const plantuml = formatParsed(result);
      
      expect(plantuml).toContain('{static} + count : number');
    });

    test('静态方法应标记 {static}', () => {
      const result = parseCode('class Math { static square(x: number): number { return x * x; } }');
      const plantuml = formatParsed(result);
      
      expect(plantuml).toContain('{static} + square(x: number) : number');
    });
  });

  // --------------------------------------------------------
  // 4. 抽象成员标记 {abstract}
  // --------------------------------------------------------

  describe('4. 抽象成员标记', () => {
    
    test('抽象方法应标记 {abstract}', () => {
      const result = parseCode('abstract class Shape { abstract area(): number; }');
      const plantuml = formatParsed(result);
      
      expect(plantuml).toContain('{abstract} + area() : number');
    });
  });

  // --------------------------------------------------------
  // 5. 关系箭头语法
  // --------------------------------------------------------
});
