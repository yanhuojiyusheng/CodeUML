/**
 * 默认示例项目：确保它覆盖文件夹分组与各种（含跨包）关系
 */

import { DEFAULT_FILES } from '../src/ui/samples';
import { parseFilesWithCrossFileTypes, mergeParsedData } from '../src/core/merge';

const parsed = parseFilesWithCrossFileTypes(
  DEFAULT_FILES.map(f => ({ name: `${f.folder}/${f.name}`, content: f.content })),
);
const { merged, classPackageMap } = mergeParsedData(parsed);

const relation = (from: string, to: string) =>
  merged.relations.find(r => r.from === from && r.to === to);
const pkg = (cls: string) => classPackageMap.get(cls);
const crossesPackage = (from: string, to: string) => pkg(from) !== pkg(to);

describe('默认示例项目', () => {
  test('所有文件都能解析出类型', () => {
    expect(parsed.size).toBe(DEFAULT_FILES.length);
    expect(merged.classes.length).toBeGreaterThan(0);
  });

  test('覆盖全部文件夹分组', () => {
    expect([...classPackageMap.values()].every(p => p.startsWith('src/'))).toBe(true);
    const folders = new Set([...classPackageMap.values()].map(p => p.replace(/\/[^/]+$/, '')));
    expect(folders).toEqual(new Set(['src/domain', 'src/infra', 'src/service', 'src/config']));
  });

  test('覆盖全部关系类型', () => {
    const types = new Set(merged.relations.map(r => r.type));
    expect(types).toEqual(new Set(['extends', 'implements', 'association', 'aggregation', 'composition', 'dependency']));
  });

  test('存在跨包关系（不只是包内）', () => {
    const cross = merged.relations.filter(r => crossesPackage(r.from, r.to));
    expect(cross.length).toBeGreaterThan(8);
  });

  test('关键跨包关系逐一成立', () => {
    // 继承 / 实现
    expect(relation('User', 'Person')?.type).toBe('extends');
    expect(crossesPackage('User', 'Person')).toBe(true);
    expect(relation('MemoryUserRepository', 'InMemoryRepository')?.type).toBe('extends');
    expect(crossesPackage('MemoryUserRepository', 'InMemoryRepository')).toBe(true);
    expect(relation('UserRepository', 'Repository')?.type).toBe('extends');
    expect(crossesPackage('UserRepository', 'Repository')).toBe(true);
    expect(relation('Coupon', 'Promotion')?.type).toBe('implements');

    // 关联 / 聚合 / 组合
    expect(relation('Order', 'User')?.type).toBe('association');
    expect(crossesPackage('Order', 'User')).toBe(true);
    expect(relation('User', 'Address')?.type).toBe('aggregation');
    expect(crossesPackage('User', 'Address')).toBe(true);
    expect(relation('Repository', 'Database')?.type).toBe('composition');
    expect(crossesPackage('Repository', 'Database')).toBe(true);
    expect(relation('OrderService', 'UserService')?.type).toBe('association');
    expect(crossesPackage('OrderService', 'UserService')).toBe(true);

    // 依赖
    expect(relation('UserService', 'User')?.type).toBe('dependency');
    expect(relation('OrderService', 'Order')?.type).toBe('dependency');
    expect(relation('Order', 'OrderError')?.type).toBe('dependency');
  });
});
