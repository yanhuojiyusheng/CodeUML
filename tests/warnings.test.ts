/**
 * 警告条渲染（纯函数）
 *
 * 两级：
 *   ⚠ 问题（解析失败 / 歧义引用）—— 需要处理
 *   ℹ 提示（类名在多个包中定义）—— 只是告知，不影响关系正确性
 */

import { formatWarnings, formatWarningSummary, warningSignature, hasProblems } from '../src/ui/warnings';

const empty = { failures: [], duplicates: [], ambiguous: [] };

describe('问题判定 hasProblems（决定是否自动展开）', () => {
  test('无警告不算问题', () => {
    expect(hasProblems(empty)).toBe(false);
  });

  test('只有重名不算问题（只展示一行摘要，由用户手动展开）', () => {
    expect(hasProblems({ ...empty, duplicates: [{ name: 'A', packages: ['a.ts', 'b.ts'] }] })).toBe(false);
  });

  test('解析失败算问题', () => {
    expect(hasProblems({ ...empty, failures: [{ name: 'a.ts', message: 'e' }] })).toBe(true);
  });

  test('歧义引用算问题', () => {
    expect(hasProblems({ ...empty, ambiguous: [{ file: 'app.ts', from: 'X', to: 'A', candidates: ['a.ts', 'b.ts'] }] })).toBe(true);
  });
});

describe('警告摘要 formatWarningSummary', () => {
  test('无警告时为空字符串', () => {
    expect(formatWarningSummary(empty)).toBe('');
  });

  test('问题用 ⚠，提示用 ℹ，问题在前', () => {
    expect(formatWarningSummary({
      failures: [{ name: 'a.ts', message: 'e' }],
      duplicates: [{ name: 'A', packages: ['a.ts', 'b.ts'] }],
      ambiguous: [{ file: 'app.ts', from: 'X', to: 'A', candidates: ['a.ts', 'b.ts'] }],
    })).toBe('⚠ 1 个文件解析失败 · 1 处歧义引用 · ℹ 1 个类名重复');
  });

  test('只有提示时不出现 ⚠', () => {
    const s = formatWarningSummary({ ...empty, duplicates: [{ name: 'A', packages: ['a.ts', 'b.ts'] }] });
    expect(s).toBe('ℹ 1 个类名重复');
    expect(s).not.toContain('⚠');
  });

  test('只有问题时用 ⚠', () => {
    const s = formatWarningSummary({ ...empty, failures: [{ name: 'a.ts', message: 'e' }] });
    expect(s).toBe('⚠ 1 个文件解析失败');
    expect(s).not.toContain('ℹ');
  });
});

describe('警告指纹 warningSignature', () => {
  test('无警告时为空', () => {
    expect(warningSignature(empty)).toBe('');
  });

  test('相同内容指纹相同', () => {
    const w = { ...empty, failures: [{ name: 'a.ts', message: 'e' }] };
    expect(warningSignature(w)).toBe(warningSignature({ ...w }));
  });

  test('内容变化则指纹变化（用于重新弹出已关闭的提示条）', () => {
    const a = { ...empty, failures: [{ name: 'a.ts', message: 'e' }] };
    const b = { ...empty, failures: [{ name: 'b.ts', message: 'e' }] };
    expect(warningSignature(a)).not.toBe(warningSignature(b));
  });
});

describe('警告明细 formatWarnings', () => {
  test('无警告时返回空字符串', () => {
    expect(formatWarnings(empty)).toBe('');
  });

  test('解析失败：⚠ 级别，列出文件名与原因', () => {
    const html = formatWarnings({
      ...empty,
      failures: [{ name: 'src/broken.ts', message: 'Parameter declaration expected.' }],
    });
    expect(html).toContain('⚠');
    expect(html).toContain('解析失败');
    expect(html).toContain('src/broken.ts');
    expect(html).toContain('Parameter declaration expected.');
    expect(html).not.toContain('notice');
  });

  test('重名类：ℹ 级别（notice），列出名字与所有包，并说明关系仍精确', () => {
    const html = formatWarnings({
      ...empty,
      duplicates: [{ name: 'Config', packages: ['src/a.ts', 'src/b.ts'] }],
    });
    expect(html).toContain('ℹ');
    expect(html).toContain('class="warn-title notice"');
    expect(html).not.toContain('⚠');
    expect(html).toContain('类名在多个包中定义');
    expect(html).toContain('已按包分别绘制');
    expect(html).toContain('import');
    expect(html).toContain('Config');
    expect(html).toContain('src/a.ts');
    expect(html).toContain('src/b.ts');
  });

  test('歧义引用：⚠ 级别，给出引用所在文件与全部候选', () => {
    const html = formatWarnings({
      ...empty,
      ambiguous: [{ file: 'src/app.ts', from: 'App', to: 'Config', candidates: ['src/a.ts', 'src/b.ts'] }],
    });
    expect(html).toContain('⚠');
    expect(html).toContain('引用无法确定目标');
    expect(html).toContain('src/app.ts');
    expect(html).toContain('App');
    expect(html).toContain('Config');
    expect(html).toContain('src/a.ts');
    expect(html).toContain('src/b.ts');
  });

  test('三类可同时出现，且问题排在提示前面', () => {
    const html = formatWarnings({
      failures: [{ name: 'a.ts', message: 'err' }],
      duplicates: [{ name: 'A', packages: ['a.ts', 'b.ts'] }],
      ambiguous: [{ file: 'app.ts', from: 'X', to: 'A', candidates: ['a.ts', 'b.ts'] }],
    });
    expect(html).toContain('解析失败');
    expect(html).toContain('引用无法确定目标');
    expect(html).toContain('类名在多个包中定义');
    expect(html.indexOf('引用无法确定目标')).toBeLessThan(html.indexOf('类名在多个包中定义'));
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
