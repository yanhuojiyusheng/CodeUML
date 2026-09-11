/**
 * 警告条渲染（纯函数）
 */

import { formatWarnings } from '../src/ui/warnings';

const empty = { failures: [], duplicates: [], ambiguous: [] };

describe('警告条渲染 formatWarnings', () => {
  test('无警告时返回空字符串', () => {
    expect(formatWarnings(empty)).toBe('');
  });

  test('解析失败：列出文件名与原因', () => {
    const html = formatWarnings({
      ...empty,
      failures: [{ name: 'src/broken.ts', message: 'Parameter declaration expected.' }],
    });
    expect(html).toContain('1 个文件解析失败');
    expect(html).toContain('src/broken.ts');
    expect(html).toContain('Parameter declaration expected.');
  });

  test('重名类：列出名字与所有包', () => {
    const html = formatWarnings({
      ...empty,
      duplicates: [{ name: 'Config', packages: ['src/a.ts', 'src/b.ts'] }],
    });
    expect(html).toContain('1 个类名在多个包中定义');
    expect(html).toContain('已按包分别绘制');
    expect(html).toContain('Config');
    expect(html).toContain('src/a.ts');
    expect(html).toContain('src/b.ts');
  });

  test('歧义引用：说明已连接全部候选', () => {
    const html = formatWarnings({
      ...empty,
      ambiguous: [{ from: 'App', to: 'Config', candidates: ['src/a.ts', 'src/b.ts'] }],
    });
    expect(html).toContain('1 处引用无法确定目标');
    expect(html).toContain('App');
    expect(html).toContain('Config');
    expect(html).toContain('src/a.ts');
    expect(html).toContain('src/b.ts');
  });

  test('三类警告可同时出现', () => {
    const html = formatWarnings({
      failures: [{ name: 'a.ts', message: 'err' }],
      duplicates: [{ name: 'A', packages: ['a.ts', 'b.ts'] }],
      ambiguous: [{ from: 'X', to: 'A', candidates: ['a.ts', 'b.ts'] }],
    });
    expect(html).toContain('文件解析失败');
    expect(html).toContain('类名在多个包中定义');
    expect(html).toContain('引用无法确定目标');
  });

  test('文件名与消息做 HTML 转义', () => {
    const html = formatWarnings({
      ...empty,
      failures: [{ name: '<b>x</b>', message: '<script>alert(1)</script>' }],
    });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<b>x</b>');
  });
});
