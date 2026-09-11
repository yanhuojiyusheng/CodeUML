/**
 * 解析缓存的正确性守卫
 *
 * 为了性能会缓存「每个文件的语法解析结果」，但缓存绝不能污染结果：
 *   1. 同一份输入重复解析，结果必须完全一致（重名类不能被二次加限定）
 *   2. 新增/删除声明后缓存必须失效（跨文件类型感知不能丢关系）
 *   3. 只改成员（声明集合不变）时，其它文件的结果仍要正确
 */

import { parseFilesWithCrossFileTypes, mergeParsedData, ParseReport } from '../src/core/merge';

const emptyReport = (): ParseReport => ({ failures: [], duplicates: [], ambiguous: [] });

const merged = (files: { name: string; content: string }[]) =>
  mergeParsedData(parseFilesWithCrossFileTypes(files, emptyReport())).merged;

describe('解析缓存：重复解析结果一致', () => {
  const files = [
    { name: 'src/a.ts', content: 'export class Config { a: number; }' },
    { name: 'src/b.ts', content: 'export class Config { b: string; }' },
    { name: 'src/app.ts', content: 'import { Config } from "./a.ts";\nexport class App { c: Config; }' },
  ];

  test('类名与 displayName 不会被二次加限定', () => {
    const first = merged(files);
    const second = merged(files);
    expect(second.classes.map(c => c.name).sort()).toEqual(first.classes.map(c => c.name).sort());
    expect(second.classes.map(c => c.displayName).sort()).toEqual(first.classes.map(c => c.displayName).sort());
    // 不能出现 "Config (src/b.ts) (src/b.ts)" 这种叠加
    expect(second.classes.every(c => (c.displayName || c.name).split('(').length <= 2)).toBe(true);
  });

  test('关系数量与端点一致', () => {
    const first = merged(files);
    const second = merged(files);
    const key = (r: { from: string; to: string; type: string }) => `${r.from}|${r.type}|${r.to}`;
    expect(second.relations.map(key).sort()).toEqual(first.relations.map(key).sort());
  });

  test('重复解析不会重复上报重名', () => {
    const r1 = emptyReport();
    parseFilesWithCrossFileTypes(files, r1);
    const r2 = emptyReport();
    parseFilesWithCrossFileTypes(files, r2);
    expect(r2.duplicates).toEqual(r1.duplicates);
  });
});

describe('解析缓存：声明集合变化时必须失效', () => {
  const base = [{ name: 'src/a.ts', content: 'export class A { u: User; }' }];

  test('新增文件声明了别人引用的类型后，关系必须出现', () => {
    expect(merged(base).relations).toHaveLength(0);
    const after = merged([...base, { name: 'src/user.ts', content: 'export class User {}' }]);
    expect(after.relations.find(r => r.from === 'A' && r.to === 'User')).toBeDefined();
  });

  test('删除声明后关系必须消失', () => {
    const withUser = [...base, { name: 'src/user.ts', content: 'export class User {}' }];
    expect(merged(withUser).relations.find(r => r.to === 'User')).toBeDefined();
    expect(merged(base).relations).toHaveLength(0);
  });

  test('只改成员（声明集合不变）时其它文件结果仍正确', () => {
    const files = [
      { name: 'src/a.ts', content: 'export class A { x: number; }' },
      { name: 'src/b.ts', content: 'import { A } from "./a.ts";\nexport class B { a: A; }' },
    ];
    expect(merged(files).relations.find(r => r.from === 'B' && r.to === 'A')).toBeDefined();

    const edited = [{ ...files[0], content: 'export class A { x: number; y: string; }' }, files[1]];
    const second = merged(edited);
    expect(second.relations.find(r => r.from === 'B' && r.to === 'A')).toBeDefined();
    expect(second.classes.find(c => c.name === 'A')!.members.map(m => m.name).sort()).toEqual(['x', 'y']);
    // 未改动的文件成员不受影响
    expect(second.classes.find(c => c.name === 'B')!.members.map(m => m.name)).toContain('a');
  });
});
