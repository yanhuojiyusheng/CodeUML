/**
 * 泛型类名在标题里显示 <T>
 *
 * 身份仍是裸名（别名/关系都用它），只有「标题」带类型参数，
 * 因此 SVG / Draw.io / PlantUML 三处一致。
 */

import { parseCode } from '../src/core/parser';
import { layoutDiagram } from '../src/core/layout';
import { generateDrawioXML } from '../src/core/drawio';
import { formatParsed, formatMergedPlantUML } from '../src/core/plantuml';
import { parseFilesWithCrossFileTypes, mergeParsedData } from '../src/core/merge';

const titleOf = (code: string, name: string): string => {
  const diagram = layoutDiagram(parseCode(code));
  const box = diagram.boxes.find(b => b.name === name)!;
  return box.lines.find(l => l.cls === 'title')!.text;
};

describe('泛型类名', () => {
  test('类：标题带 <T>', () => {
    expect(titleOf('class Repo<T> { items: T[] = []; }', 'Repo')).toBe('Repo<T>');
  });

  test('多参数：按声明顺序逗号分隔', () => {
    expect(titleOf('class Pair<K, V> {}', 'Pair')).toBe('Pair<K, V>');
  });

  test('接口与抽象类同样适用', () => {
    expect(titleOf('interface Holder<T> { item: T; }', 'Holder')).toBe('Holder<T>');
    expect(titleOf('abstract class Base<T> {}', 'Base')).toBe('Base<T>');
  });

  test('只显示参数名，不带约束', () => {
    expect(titleOf('class Box<T extends object> {}', 'Box')).toBe('Box<T>');
  });

  test('非泛型类标题不变', () => {
    expect(titleOf('class Plain {}', 'Plain')).toBe('Plain');
  });

  test('身份仍是裸名（关系与别名不受影响）', () => {
    const parsed = parseCode('class Item {} class Repo<T> { items: Item[] = []; }');
    const puml = formatParsed(parsed);
    expect(puml).toContain('class "Repo<T>" as Repo');
    expect(puml).toContain('Repo o-- "*" Item');
  });

  test('跨包重名 + 泛型：标题既有包名又有类型参数，别名唯一', () => {
    const parsed = parseFilesWithCrossFileTypes([
      { name: 'a.ts', content: 'export class Repo<T> {}' },
      { name: 'b.ts', content: 'export class Repo<T> {}' },
    ]);
    const { classPackageMap } = mergeParsedData(parsed);
    const puml = formatMergedPlantUML(parsed, classPackageMap);
    expect(puml).toContain('"Repo<T> (a.ts)"');
    expect(puml).toContain('"Repo<T> (b.ts)"');
    const aliases = [...puml.matchAll(/\bas ([A-Za-z0-9_]+)/g)].map(m => m[1]);
    expect(new Set(aliases).size).toBe(aliases.length);
  });

  test('Draw.io 标题也带 <T>', () => {
    const xml = generateDrawioXML(layoutDiagram(parseCode('class Repo<T> {}')));
    // 框标签先做 HTML 转义（<T> -> &lt;T&gt;），写入 mxCell 属性时再整体转义一次
    expect(xml).toContain('Repo&amp;lt;T&amp;gt;');
  });
});
