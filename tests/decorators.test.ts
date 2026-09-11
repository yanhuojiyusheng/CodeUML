/**
 * 装饰器 -> stereotype
 *
 * 类上的装饰器映射成 UML stereotype：SVG 显示为独立的一行 «X»，
 * PlantUML 输出 `class "Foo" as Foo <<X>>`。
 */

import { parseCode } from '../src/core/parser';
import { layoutDiagram } from '../src/core/layout';
import { formatParsed } from '../src/core/plantuml';
import { validatePlantUML } from './helpers/plantuml-validator';

const stereotypesOf = (code: string, name: string): string[] => {
  const box = layoutDiagram(parseCode(code)).boxes.find(b => b.name === name)!;
  return box.lines.filter(l => l.cls === 'stereotype').map(l => l.text);
};

describe('装饰器 -> stereotype', () => {
  test('简单装饰器', () => {
    expect(stereotypesOf('@Component class Foo {}', 'Foo')).toEqual(['«Component»']);
  });

  test('带参数与换行的装饰器只取名字', () => {
    expect(stereotypesOf('@Injectable({ providedIn: "root" }) class Svc {}', 'Svc')).toEqual(['«Injectable»']);
  });

  test('命名空间装饰器取最后一段', () => {
    expect(stereotypesOf('@core.Log() class A {}', 'A')).toEqual(['«Log»']);
  });

  test('多个装饰器按出现顺序', () => {
    expect(stereotypesOf('@A @B() class C {}', 'C')).toEqual(['«A»', '«B»']);
  });

  test('抽象类同时有 abstract 与装饰器，abstract 在前', () => {
    expect(stereotypesOf('@Component abstract class Base {}', 'Base')).toEqual(['«abstract»', '«Component»']);
  });

  test('没有装饰器时不产生 stereotype 行', () => {
    expect(stereotypesOf('class Plain {}', 'Plain')).toEqual([]);
  });

  test('成员上的装饰器不进入类 stereotype', () => {
    expect(stereotypesOf('class A { @Input() x: string = ""; }', 'A')).toEqual([]);
  });
});

describe('装饰器的 PlantUML 输出', () => {
  test('单个装饰器', () => {
    const puml = formatParsed(parseCode('@Component class Foo {}'));
    expect(puml).toContain('class "Foo" as Foo <<Component>>');
    expect(validatePlantUML(puml)).toEqual([]);
  });

  test('多个装饰器合并成一个 tag', () => {
    const puml = formatParsed(parseCode('@A @B class Foo {}'));
    expect(puml).toContain('class "Foo" as Foo <<A, B>>');
    expect(validatePlantUML(puml)).toEqual([]);
  });

  test('抽象类', () => {
    const puml = formatParsed(parseCode('@Component abstract class Base {}'));
    expect(puml).toContain('abstract class "Base" as Base <<Component>>');
    expect(validatePlantUML(puml)).toEqual([]);
  });

  test('无装饰器时输出不变', () => {
    expect(formatParsed(parseCode('class Plain {}'))).toContain('class "Plain" as Plain {');
  });
});
