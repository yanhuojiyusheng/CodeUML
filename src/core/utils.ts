/** 共用工具函数 */

import { Member } from './types';

/** 常量配置（必须在使用前定义） */
export const LAYOUT = {
  PAD_X: 140,
  PAD_Y: 180,
  LINE_H: 18,
  CHAR_W: 7.2,
  ARROW: {
    TRI_LEN: 20,
    TRI_W: 12,
    DIA_LEN: 16,
    DIA_W: 9,
    SMALL_TRI_LEN: 16,
    SMALL_TRI_W: 9,
  },
  EXPORTER: {
    SCALE: 1.5,
    PAD: 40,
  },
} as const;

/** HTML 转义（防 XSS） */
export function esc(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** 类框标题：优先 displayName，并带上类型参数；重名时把 <T> 插在包名之前（Repo<T> (a.ts)） */
export function classTitle(c: { name: string; displayName?: string; typeParams?: string[] }): string {
  const base = c.displayName || c.name;
  if (!c.typeParams || c.typeParams.length === 0) return base;
  const params = `<${c.typeParams.join(', ')}>`;
  // displayName 形如 "Repo (pkg)"，把类型参数插在包名之前可读性更好
  const m = base.match(/^(.*?) (\([^)]*\))$/);
  return m ? `${m[1]}${params} ${m[2]}` : `${base}${params}`;
}

/** 格式化成员文本 */
export function memberText(m: Member): string {
  const staticStr = m.isStatic ? '{static} ' : '';
  const abstractStr = m.isAbstract ? '{abstract} ' : '';
  // readonly 只对属性有意义
  const readonlyStr = m.isReadonly && m.kind === 'property' ? '{readonly} ' : '';
  
  if (m.kind === 'property') {
    return `${staticStr}${abstractStr}${readonlyStr}${m.modifier} ${m.name}${m.type ? ': ' + m.type : ''}`;
  }
  return `${staticStr}${abstractStr}${m.modifier} ${m.name}(${m.params || ''})${m.type ? ': ' + m.type : ''}`;
}

/** 计算文本宽度 */
export function textWidth(s: string): number {
  return String(s).length * LAYOUT.CHAR_W + 16;
}

/** 路径是否等于 base 或位于 base 之下（用于文件夹的整批操作） */
export function isUnderPath(path: string, base: string): boolean {
  return path === base || path.startsWith(`${base}/`);
}

/**
 * 把拖入的文件路径拆成「文件夹 + 文件名」。
 * 必须保留扩展名：语义解析（TS 模块解析）靠它匹配 `import './args'`，
 * 选择 ScriptKind（.tsx）也靠它。
 *   'src/cli/args.ts' -> { folder: 'src/cli', name: 'args.ts' }
 */
export function splitSourcePath(path: string): { folder: string; name: string } {
  const parts = path.replace(/\\/g, '/').split('/').filter(Boolean);
  const name = parts.pop() || 'untitled';
  return { folder: parts.join('/'), name };
}

/** 点到线段的最短距离（不是点到直线的距离：超出端点时按端算） */
export function distanceToSegment(
  px: number, py: number,
  x1: number, y1: number,
  x2: number, y2: number,
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - x1, py - y1); // 退化成点
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

/** 生成关系的唯一标识（用于高亮等场景） */
export function relationKey(r: { from: string; type: string; to: string }): string {
  return `${r.from}|${r.type}|${r.to}`;
}