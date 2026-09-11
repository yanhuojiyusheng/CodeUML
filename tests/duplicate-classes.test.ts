/**
 * 跨文件同名类：不再丢弃，而是按包区分身份 + 精确解析引用
 *
 * 解析优先级：语义解析（import / 同文件 / 全局唯一）
 *           -> 本包 -> 全局唯一 -> 全部候选 + 警告
 */

import { parseFilesWithCrossFileTypes, mergeParsedData, ParseReport } from '../src/core/merge';
import { layoutDiagram } from '../src/core/layout';
import { formatMergedPlantUML } from '../src/core/plantuml';
import { generateDrawioXML } from '../src/core/drawio';

const emptyReport = (): ParseReport => ({ failures: [], duplicates: [], ambiguous: [] });

const build = (files: { name: string; content: string }[], report?: ParseReport) => {
  const parsed = parseFilesWithCrossFileTypes(files, report);
  const { merged, classPackageMap } = mergeParsedData(parsed);
  return { parsed, merged, classPackageMap };
};

const pkgOf = (merged: ReturnType<typeof build>['merged'], name: string) =>
  merged.classes.find(c => c.name === name || c.displayName === name)?.packageName;

describe('同名类不再被丢弃', () => {
  const files = [
    { name: 'src/a.ts', content: 'export class Config { a: number; }' },
    { name: 'src/b.ts', content: 'export class Config { b: string; }' },
  ];

  test('两个包里的同名类都保留，成员各自独立', () => {
    const { merged } = build(files);
    const configs = merged.classes.filter(c => (c.displayName || c.name).startsWith('Config'));
    expect(configs).toHaveLength(2);
    expect(configs.map(c => c.members.map(m => m.name).join('')).sort()).toEqual(['a', 'b']);
  });

  test('重名类带包名后缀以便区分，且身份互不相同', () => {
    const { merged } = build(files);
    const configs = merged.classes.filter(c => (c.displayName || c.name).startsWith('Config'));
    const displays = configs.map(c => c.displayName).sort();
    expect(displays).toEqual(['Config (src/a.ts)', 'Config (src/b.ts)']);
    expect(new Set(configs.map(c => c.name)).size).toBe(2);
  });

  test('重名类上报到 report.duplicates', () => {
    const report = emptyReport();
    build(files, report);
    expect(report.duplicates).toEqual([{ name: 'Config', packages: ['src/a.ts', 'src/b.ts'] }]);
  });

  test('无重名时 duplicates 为空', () => {
    const report = emptyReport();
    build([
      { name: 'a.ts', content: 'class A {}' },
      { name: 'b.ts', content: 'class B {}' },
    ], report);
    expect(report.duplicates).toEqual([]);
  });
});

describe('引用解析：语义优先', () => {
  test('有 import 时精确指向被导入的那个包', () => {
    const { merged } = build([
      { name: 'src/a.ts', content: 'export class Config { a: number; }' },
      { name: 'src/b.ts', content: 'export class Config { b: string; }' },
      { name: 'src/app.ts', content: "import { Config } from './a';\nexport class App { c: Config; }" },
    ]);
    const rels = merged.relations.filter(r => r.from === 'App');
    expect(rels).toHaveLength(1);
    expect(pkgOf(merged, rels[0].to)).toBe('src/a.ts');
  });

  test('import 指向 b.ts 时就连到 b.ts', () => {
    const { merged } = build([
      { name: 'src/a.ts', content: 'export class Config { a: number; }' },
      { name: 'src/b.ts', content: 'export class Config { b: string; }' },
      { name: 'src/app.ts', content: "import { Config } from './b';\nexport class App { c: Config; }" },
    ]);
    const rels = merged.relations.filter(r => r.from === 'App');
    expect(pkgOf(merged, rels[0].to)).toBe('src/b.ts');
  });

  test('import 重命名（as）也能解析', () => {
    const { merged } = build([
      { name: 'src/a.ts', content: 'export class Config { a: number; }' },
      { name: 'src/b.ts', content: 'export class Config { b: string; }' },
      { name: 'src/app.ts', content: "import { Config as Cfg } from './b';\nexport class App { c: Cfg; }" },
    ]);
    const rels = merged.relations.filter(r => r.from === 'App');
    expect(rels).toHaveLength(1);
    expect(pkgOf(merged, rels[0].to)).toBe('src/b.ts');
  });

  test('同包内同名时优先本包', () => {
    const { merged } = build([
      { name: 'src/a.ts', content: 'export class Config { a: number; }' },
      { name: 'src/b.ts', content: 'export class Config { b: string; }\nexport class App { c: Config; }' },
    ]);
    const rels = merged.relations.filter(r => r.from === 'App');
    expect(rels).toHaveLength(1);
    expect(pkgOf(merged, rels[0].to)).toBe('src/b.ts');
  });

  test('无 import 但全局唯一时仍能连上', () => {
    const { merged } = build([
      { name: 'a.ts', content: 'class Only {}' },
      { name: 'b.ts', content: 'class B { x: Only; }' },
    ]);
    expect(merged.relations.find(r => r.from === 'B' && r.to === 'Only')).toBeDefined();
  });
});

describe('引用解析：无 import 的歧义回退', () => {
  test('连到全部候选，并写入 report.ambiguous', () => {
    const report = emptyReport();
    const { merged } = build([
      { name: 'src/a.ts', content: 'export class Config { a: number; }' },
      { name: 'src/b.ts', content: 'export class Config { b: string; }' },
      { name: 'src/app.ts', content: 'export class App { c: Config; }' },
    ], report);

    const rels = merged.relations.filter(r => r.from === 'App' && r.type === 'association');
    expect(rels).toHaveLength(2);
    expect(rels.map(r => pkgOf(merged, r.to)).sort()).toEqual(['src/a.ts', 'src/b.ts']);

    expect(report.ambiguous).toHaveLength(1);
    expect(report.ambiguous[0].file).toBe('src/app.ts');
    expect(report.ambiguous[0].from).toBe('App');
    expect(report.ambiguous[0].to).toBe('Config');
    expect([...report.ambiguous[0].candidates].sort()).toEqual(['src/a.ts', 'src/b.ts']);
  });

  test('非歧义引用不写入 report.ambiguous', () => {
    const report = emptyReport();
    build([
      { name: 'a.ts', content: 'class Only {}' },
      { name: 'b.ts', content: 'class B { x: Only; }' },
    ], report);
    expect(report.ambiguous).toEqual([]);
  });
});

describe('渲染层：同名类都要画出来', () => {
  const files = [
    { name: 'src/a.ts', content: 'export class Config { a: number; }' },
    { name: 'src/b.ts', content: 'export class Config { b: string; }' },
  ];

  test('布局包含两个 Config 框，标题带包名', () => {
    const { merged } = build(files);
    const diagram = layoutDiagram(merged);
    const boxes = diagram.boxes.filter(b => (b.displayName || b.name).startsWith('Config'));
    expect(boxes).toHaveLength(2);
    expect(boxes.map(b => b.displayName).sort()).toEqual(['Config (src/a.ts)', 'Config (src/b.ts)']);
  });

  test('Draw.io 导出两个节点', () => {
    const { merged } = build(files);
    const xml = generateDrawioXML(layoutDiagram(merged));
    expect((xml.match(/vertex="1"/g) || [])).toHaveLength(2);
    expect(xml).toContain('Config (src/a.ts)');
    expect(xml).toContain('Config (src/b.ts)');
  });

  test('PlantUML：同名类都输出，别名唯一，标题保留原名', () => {
    const { parsed, classPackageMap } = build(files);
    const puml = formatMergedPlantUML(parsed, classPackageMap);
    expect((puml.match(/class "Config/g) || [])).toHaveLength(2);
    const aliases = [...puml.matchAll(/\bas ([A-Za-z0-9_]+)/g)].map(m => m[1]);
    expect(aliases).toHaveLength(2);
    expect(new Set(aliases).size).toBe(2);
  });

  test('PlantUML：歧义回退时两条关系都输出', () => {
    const { parsed, classPackageMap } = build([
      { name: 'src/a.ts', content: 'export class Config { a: number; }' },
      { name: 'src/b.ts', content: 'export class Config { b: string; }' },
      { name: 'src/app.ts', content: 'export class App { c: Config; }' },
    ]);
    const puml = formatMergedPlantUML(parsed, classPackageMap);
    const lines = puml.split('\n').filter(l => l.startsWith('App -->'));
    expect(lines).toHaveLength(2);
  });
});
