/**
 * 点到线段的距离（关系线的几何命中依赖它）
 */

import { distanceToSegment } from '../src/core/utils';

// 一条水平线段 (0,0) → (100,0)
const seg = (px: number, py: number) => distanceToSegment(px, py, 0, 0, 100, 0);

describe('distanceToSegment', () => {
  test('线段上的点为 0', () => {
    expect(seg(50, 0)).toBe(0);
    expect(seg(0, 0)).toBe(0);
    expect(seg(100, 0)).toBe(0);
  });

  test('中段的垂距', () => {
    expect(seg(50, 7)).toBeCloseTo(7, 10);
    expect(seg(50, -7)).toBeCloseTo(7, 10);
  });

  test('超出端点时按端点算（不是到无限直线的距离）', () => {
    // 到 (0,0) 的距离是 10，到直线是 0
    expect(seg(-10, 0)).toBeCloseTo(10, 10);
    expect(seg(110, 0)).toBeCloseTo(10, 10);
    expect(seg(-3, 4)).toBeCloseTo(5, 10);
  });

  test('斜线段', () => {
    // (0,0)-(10,10) 的中点 (5,5)，点 (5,5) 距离 0；(0,10) 到该线段距离 = 10/√2
    expect(distanceToSegment(5, 5, 0, 0, 10, 10)).toBe(0);
    expect(distanceToSegment(0, 10, 0, 0, 10, 10)).toBeCloseTo(10 / Math.SQRT2, 10);
  });

  test('退化成点', () => {
    expect(distanceToSegment(3, 4, 0, 0, 0, 0)).toBeCloseTo(5, 10);
  });

  test('终点处对称（t 被夹在 [0,1]）', () => {
    expect(distanceToSegment(5, 5, 0, 0, 4, 4)).toBeCloseTo(Math.hypot(1, 1), 10);
  });
});
