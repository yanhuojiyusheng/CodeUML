/**
 * 拖入文件的路径拆分
 *
 * 必须保留扩展名：语义解析（TS 模块解析）与 .tsx 的 ScriptKind 选择都依赖它。
 * 历史上这里把 .ts/.tsx 删掉了，导致所有 import 都解析不到、跨包引用退化成"歧义"。
 */

import { splitSourcePath } from '../src/core/utils';

describe('splitSourcePath', () => {
  test('保留扩展名', () => {
    expect(splitSourcePath('coding-agent/src/cli/args.ts'))
      .toEqual({ folder: 'coding-agent/src/cli', name: 'args.ts' });
    expect(splitSourcePath('src/Widget.tsx'))
      .toEqual({ folder: 'src', name: 'Widget.tsx' });
  });

  test('根目录文件', () => {
    expect(splitSourcePath('user.ts')).toEqual({ folder: '', name: 'user.ts' });
  });

  test('没有扩展名时原样保留', () => {
    expect(splitSourcePath('untitled')).toEqual({ folder: '', name: 'untitled' });
  });

  test('同名不同扩展名不会互相覆盖', () => {
    expect(splitSourcePath('a.ts').name).not.toBe(splitSourcePath('a.tsx').name);
  });

  test('空路径回退为 untitled', () => {
    expect(splitSourcePath('')).toEqual({ folder: '', name: 'untitled' });
  });
});
