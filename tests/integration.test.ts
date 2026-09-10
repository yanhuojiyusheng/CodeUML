/**
 * 集成测试 - 验证整体代码正确性
 */

const ts = require('typescript');
(global as any).ts = ts;

import { parseCode } from '../src/parser';
import { layoutDiagram } from '../src/layout';
import { renderSVG } from '../src/renderer';
import { generateDrawioXML } from '../src/exporter';
import { ParsedData, Diagram } from '../src/types';

// 完整的处理流程
function processCode(code: string): { parsed: ParsedData; diagram: Diagram; svg: string; xml: string } {
  const parsed = parseCode(code);
  const diagram = layoutDiagram(parsed);
  const svg = renderSVG(diagram);
  const xml = generateDrawioXML(diagram);
  return { parsed, diagram, svg, xml };
}

describe('集成测试 - 完整流程', () => {

  // --------------------------------------------------------
  // 1. 完整处理流程
  // --------------------------------------------------------
  describe('1. 完整处理流程', () => {
    
    test('简单类应该通过完整流程', () => {
      const code = `class Person { name: string; }`;
      
      expect(() => processCode(code)).not.toThrow();
      
      const { parsed, diagram, svg, xml } = processCode(code);
      
      expect(parsed.classes).toHaveLength(1);
      expect(diagram.boxes).toHaveLength(1);
      expect(svg).toContain('<svg');
      expect(xml).toContain('<mxfile>');
    });

    test('空代码应该通过完整流程', () => {
      const code = '';
      
      expect(() => processCode(code)).not.toThrow();
      
      const { parsed, diagram } = processCode(code);
      
      expect(parsed.classes).toHaveLength(0);
      expect(diagram.boxes).toHaveLength(0);
    });
  });

  // --------------------------------------------------------
  // 2. 布局引擎
  // --------------------------------------------------------
  describe('2. 布局引擎', () => {
    
    test('多个类应该有正确的布局位置', () => {
      const code = `
        class A {}
        class B extends A {}
        class C {}
      `;
      const { diagram } = processCode(code);
      
      expect(diagram.boxes).toHaveLength(3);
      expect(diagram.width).toBeGreaterThan(0);
      expect(diagram.height).toBeGreaterThan(0);
    });

    test('继承关系应该影响垂直布局', () => {
      const code = `
        class Parent {}
        class Child extends Parent {}
      `;
      const { diagram } = processCode(code);
      
      const parentBox = diagram.boxes.find(b => b.name === 'Parent');
      const childBox = diagram.boxes.find(b => b.name === 'Child');
      
      expect(parentBox).toBeDefined();
      expect(childBox).toBeDefined();
      
      // 子类应该在父类下方
      expect(childBox!.y).toBeGreaterThan(parentBox!.y);
    });

    test('类框尺寸应该适应内容', () => {
      const code = `
        class Short {}
        class LongClassNameWithVeryLongName {}
      `;
      const { diagram } = processCode(code);
      
      const shortBox = diagram.boxes.find(b => b.name === 'Short');
      const longBox = diagram.boxes.find(b => b.name === 'LongClassNameWithVeryLongName');
      
      expect(longBox!.w).toBeGreaterThan(shortBox!.w);
    });
  });

  // --------------------------------------------------------
  // 3. SVG 渲染器
  // --------------------------------------------------------
  describe('3. SVG 渲染器', () => {
    
    test('应该生成有效的 SVG 结构', () => {
      const code = `
        class Person {
          name: string;
          greet(): void {}
        }
      `;
      const { svg } = processCode(code);
      
      expect(svg).toContain('<svg');
      expect(svg).toContain('viewBox');
      expect(svg).toContain('</svg>');
    });

    test('类框应该包含类名', () => {
      const code = `class Person {}`;
      const { svg } = processCode(code);
      
      expect(svg).toContain('Person');
    });

    test('属性应该在 SVG 中显示', () => {
      const code = `class Person { name: string; }`;
      const { svg } = processCode(code);
      
      expect(svg).toContain('name');
      expect(svg).toContain('string');
    });

    test('方法应该在 SVG 中显示', () => {
      const code = `class Person { greet(): void {} }`;
      const { svg } = processCode(code);
      
      expect(svg).toContain('greet');
    });

    test('继承关系应该有连线', () => {
      const code = `
        class Parent {}
        class Child extends Parent {}
      `;
      const { diagram } = processCode(code);
      
      const extendsLine = diagram.lines.find(l => l.type === 'extends');
      expect(extendsLine).toBeDefined();
    });

    test('空类应该显示提示文本', () => {
      const { svg } = processCode('');
      
      expect(svg).toContain('无有效类/接口定义');
    });
  });

  // --------------------------------------------------------
  // 4. Draw.io XML 导出
  // --------------------------------------------------------
  describe('4. Draw.io XML 导出', () => {
    
    test('应该生成有效的 XML 结构', () => {
      const code = `class Person {}`;
      const { xml } = processCode(code);
      
      expect(xml).toContain('<?xml version="1.0"');
      expect(xml).toContain('<mxfile>');
      expect(xml).toContain('</mxfile>');
      expect(xml).toContain('<mxGraphModel>');
    });

    test('类应该导出为 swimlane 单元格', () => {
      const code = `class Person {}`;
      const { xml } = processCode(code);
      
      expect(xml).toContain('swimlane');
      expect(xml).toContain('Person');
    });

    test('继承关系应该导出为边', () => {
      const code = `
        class Parent {}
        class Child extends Parent {}
      `;
      const { xml } = processCode(code);
      
      expect(xml).toContain('edge="1"');
      expect(xml).toContain('endArrow=block');
      expect(xml).toContain('endFill=0');
    });

    test('实现关系应该导出为虚线边', () => {
      const code = `
        interface I { m(): void; }
        class C implements I { m(): void {} }
      `;
      const { xml } = processCode(code);
      
      expect(xml).toContain('dashed=1');
    });

    test('多重性应该在 XML 中显示', () => {
      const code = `
        class Item {}
        class Container { items: Item[]; }
      `;
      const { xml } = processCode(code);
      
      expect(xml).toContain('*');
    });
  });

  // --------------------------------------------------------
  // 5. 错误处理
  // --------------------------------------------------------
  describe('5. 错误处理', () => {
    
    test('语法错误不应该导致崩溃', () => {
      const code = `
        class Foo {
          bar(  // 语法错误
        }
      `;
      
      expect(() => processCode(code)).not.toThrow();
    });

    test('复杂代码应该正常处理', () => {
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
      
      expect(() => processCode(code)).not.toThrow();
      
      const { parsed, diagram, svg, xml } = processCode(code);
      
      expect(parsed.classes.length).toBeGreaterThanOrEqual(5);
      expect(diagram.boxes.length).toBeGreaterThanOrEqual(5);
      expect(svg).toContain('<svg');
      expect(xml).toContain('<mxfile>');
    });
  });

  // --------------------------------------------------------
  // 6. 边界情况
  // --------------------------------------------------------
  describe('6. 边界情况', () => {
    
    test('Unicode 类名应该正常处理', () => {
      const code = `class 用户 { 名字: string; }`;
      
      expect(() => processCode(code)).not.toThrow();
      
      const { parsed, svg } = processCode(code);
      
      expect(parsed.classes[0].name).toBe('用户');
      expect(svg).toContain('用户');
    });

    test('大量类应该正常处理', () => {
      let code = '';
      for (let i = 0; i < 20; i++) {
        code += `class Class${i} { prop${i}: string; }\n`;
      }
      
      expect(() => processCode(code)).not.toThrow();
      
      const { parsed } = processCode(code);
      expect(parsed.classes).toHaveLength(20);
    });

    test('深层继承应该正常处理', () => {
      const code = `
        class A {}
        class B extends A {}
        class C extends B {}
        class D extends C {}
        class E extends D {}
      `;
      
      expect(() => processCode(code)).not.toThrow();
      
      const { parsed } = processCode(code);
      expect(parsed.classes).toHaveLength(5);
    });
  });

  // --------------------------------------------------------
  // 7. 常量配置
  // --------------------------------------------------------
  describe('7. 常量配置', () => {
    
    test('LAYOUT 常量应该正确导出', async () => {
      const { LAYOUT } = await import('../src/utils');
      
      expect(LAYOUT.PAD_X).toBe(140);
      expect(LAYOUT.PAD_Y).toBe(180);
      expect(LAYOUT.LINE_H).toBe(18);
      expect(LAYOUT.CHAR_W).toBe(7.2);
    });

    test('textWidth 函数应该正常工作', async () => {
      const { textWidth } = await import('../src/utils');
      
      const width = textWidth('test');
      expect(width).toBeGreaterThan(0);
    });
  });
});
