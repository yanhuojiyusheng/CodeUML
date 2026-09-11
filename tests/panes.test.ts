/**
 * 分栏宽度约束（纯函数）
 *
 * 历史上这里出过两次同类 bug：用「当前测出来的」右侧面板宽度去算文件栏上限。
 * 当右侧面板变成 flex 伸缩容器时，测出来的宽度几乎是整个主区，上限被算成负数、
 * 被兜底值卡死，文件栏就拖不动了。所以约束只接受「固定宽度」，并且做成纯函数便于回归。
 */

import { maxSidebarWidth, clampSidebarWidth, maxRightWidth, clampRightWidth } from '../src/ui/panes';

// 与实现保持一致的常量
const RESIZER = 5;
const DIVIDER = 6;
const EDITOR_MIN = 240;

describe('文件栏宽度上限 maxSidebarWidth', () => {
  test('= 主区 - 分隔条 - 右侧固定宽度 - 编辑区最小留白', () => {
    expect(maxSidebarWidth(1400, 700)).toBe(1400 - RESIZER - DIVIDER - 700 - EDITOR_MIN); // 449
    expect(maxSidebarWidth(1536, 768)).toBe(517);
  });

  test('上限 600', () => {
    expect(maxSidebarWidth(3000, 500)).toBe(600);
  });

  test('下限 180 兜底，但不会算成负数', () => {
    expect(maxSidebarWidth(500, 100)).toBe(180);
    expect(maxSidebarWidth(1400, 1400)).toBe(180);
    expect(maxSidebarWidth(1000, 2000)).toBe(180);
  });

  test('不变式：未触底时 文件栏 + 右侧固定宽度 + 分隔条 + 编辑区最小留白 ≤ 主区', () => {
    const cases: [number, number][] = [[1400, 700], [1536, 768], [1000, 300], [900, 450], [2400, 900]];
    for (const [mainW, rightW] of cases) {
      const s = maxSidebarWidth(mainW, rightW);
      if (s > 180) {
        expect(s + rightW + RESIZER + DIVIDER + EDITOR_MIN).toBeLessThanOrEqual(mainW);
      }
    }
  });
});

describe('文件栏宽度夹取 clampSidebarWidth', () => {
  test('在 [120, maxSidebarWidth] 之间', () => {
    expect(clampSidebarWidth(700, 1400, 700)).toBe(449);
    expect(clampSidebarWidth(300, 1400, 700)).toBe(300);
    expect(clampSidebarWidth(50, 1400, 700)).toBe(120);
  });

  test('右侧面板占满时不会把文件栏锁死到 0（至少 120）', () => {
    expect(clampSidebarWidth(200, 1400, 1400)).toBe(180);
  });
});

describe('图表区宽度约束', () => {
  test('上限 = 主区 - 文件栏 - 分隔条 - 编辑区最小留白', () => {
    expect(maxRightWidth(1400, 170)).toBe(1400 - 170 - RESIZER - DIVIDER - EDITOR_MIN); // 979
  });

  test('下限 280', () => {
    expect(maxRightWidth(900, 500)).toBe(280);
    expect(clampRightWidth(100, 900, 500)).toBe(280);
  });

  test('夹取', () => {
    expect(clampRightWidth(500, 1400, 170)).toBe(500);
    expect(clampRightWidth(5000, 1400, 170)).toBe(979);
  });
});
