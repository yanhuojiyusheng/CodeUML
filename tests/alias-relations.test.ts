/**
 * 别名与关系的语义
 *
 * 别名不是图上的节点，所以：
 *   - 别名指向联合类型（展开出多个目标）-> 这些边只是“用到”，降级为依赖 ..>
 *   - 别名指向单一类型              -> 保持原本的关联 / 聚合语义
 *   - 别名指向集合类型              -> 保持聚合 *
 */

import { parseCode } from '../src/core/parser';
import { parseFilesWithCrossFileTypes, mergeParsedData, ParseReport } from '../src/core/merge';

const emptyReport = (): ParseReport => ({ failures: [], duplicates: [], ambiguous: [] });

const merged = (files: { name: string; content: string }[]) =>
  mergeParsedData(parseFilesWithCrossFileTypes(files, emptyReport())).merged;

const relOf = (m: ReturnType<typeof merged>, from: string, toName: string) =>
  m.relations.find(r => r.from === from && (r.to === toName || r.to.endsWith('#' + toName)));

describe('本地别名', () => {
  test('联合类型别名 -> 依赖，且没有多重性', () => {
    const m = merged([
      { name: 'a.ts', content: 'export class A {} export class B {} export type Either = A | B;\nexport class S { e: Either; }' },
    ]);
    const ra = relOf(m, 'S', 'A');
    const rb = relOf(m, 'S', 'B');
    expect(ra?.type).toBe('dependency');
    expect(rb?.type).toBe('dependency');
    expect(ra?.toMultiplicity).toBeUndefined();
  });

  test('单一类型别名保持关联', () => {
    const m = merged([
      { name: 'a.ts', content: 'export class User {} export type UserRef = User;\nexport class S { u: UserRef; }' },
    ]);
    const rel = relOf(m, 'S', 'User');
    expect(rel?.type).toBe('association');
    expect(rel?.toMultiplicity).toBe('1');
  });

  test('集合类型别名保持聚合 *', () => {
    const m = merged([
      { name: 'a.ts', content: 'export class User {} export type Users = User[];\nexport class S { us: Users; }' },
    ]);
    const rel = relOf(m, 'S', 'User');
    expect(rel?.type).toBe('aggregation');
    expect(rel?.toMultiplicity).toBe('*');
  });

  test('直接引用不受影响（对照）', () => {
    const m = merged([
      { name: 'a.ts', content: 'export class A {} export class S { a: A; list: A[] = []; }' },
    ]);
    expect(relOf(m, 'S', 'A')?.type).toBe('aggregation');
    expect(relOf(m, 'S', 'A')?.toMultiplicity).toBe('*');
  });
});

describe('跨文件别名', () => {
  test('联合类型别名 -> 依赖', () => {
    const m = merged([
      { name: 'p/types.ts', content: 'export class A {} export class B {} export type Either = A | B;' },
      { name: 'p/use.ts', content: 'import type { Either } from "./types.ts";\nexport class S { e: Either; }' },
    ]);
    expect(relOf(m, 'S', 'A')?.type).toBe('dependency');
    expect(relOf(m, 'S', 'B')?.type).toBe('dependency');
    expect(relOf(m, 'S', 'A')?.toMultiplicity).toBeUndefined();
  });

  test('单一类型别名保持关联', () => {
    const m = merged([
      { name: 'p/types.ts', content: 'export class User {} export type UserRef = User;' },
      { name: 'p/use.ts', content: 'import type { UserRef } from "./types.ts";\nexport class S { u: UserRef; }' },
    ]);
    expect(relOf(m, 'S', 'User')?.type).toBe('association');
  });

  test('集合类型别名升级为聚合 *', () => {
    const m = merged([
      { name: 'p/types.ts', content: 'export class User {} export type Users = User[];' },
      { name: 'p/use.ts', content: 'import type { Users } from "./types.ts";\nexport class S { us: Users; }' },
    ]);
    const rel = relOf(m, 'S', 'User');
    expect(rel?.type).toBe('aggregation');
    expect(rel?.toMultiplicity).toBe('*');
  });

  test('联合别名里的成员各自解析到正确文件', () => {
    const m = merged([
      { name: 'p/a.ts', content: 'export class Item { a = 1; }' },
      { name: 'p/b.ts', content: 'export class Item { b = 2; }' },
      { name: 'p/types.ts', content: 'import type { Item as A } from "./a.ts";\nexport type Either = A;' },
      { name: 'p/use.ts', content: 'import type { Either } from "./types.ts";\nexport class S { e: Either; }' },
    ]);
    const rel = m.relations.find(r => r.from === 'S')!;
    expect(m.classes.find(c => c.name === rel.to)?.packageName).toBe('p/a.ts');
  });
});
