/** SVG 渲染器 - 支持包分组和成员筛选 */

import { Box, Diagram, Line, PackageBox } from './types';
import { esc, memberText, LAYOUT, relationKey } from './utils';
import { selectVisibleProperties, selectVisibleMethods } from './members';

const { ARROW } = LAYOUT;

// 显示配置（可由外部调整）
export const DISPLAY_CONFIG = {
  MAX_PROPS: 8,       // 属性最大显示数量
  MAX_METHODS: 8,     // 方法最大显示数量
  TRUNCATE_THRESHOLD: 10, // 超过此数量触发筛选
};

/** 设置显示配置 */
export function setDisplayConfig(config: Partial<typeof DISPLAY_CONFIG>) {
  Object.assign(DISPLAY_CONFIG, config);
}

function renderRelation(r: Line, highlightKey?: string | null): string {
  const dx = r.tx - r.fx, dy = r.ty - r.fy;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const ux = dx / len, uy = dy / len;
  const px = -uy, py = ux;

  const strokeAttr = 'stroke="#666" stroke-width="1.5"';
  const dashed = r.type === 'implements' || r.type === 'dependency' ? ' stroke-dasharray="8,4"' : '';

  let svg = '';

  switch (r.type) {
    case 'extends': {
      const { TRI_LEN, TRI_W } = ARROW;
      const baseX = r.tx - ux * TRI_LEN, baseY = r.ty - uy * TRI_LEN;
      svg += `<line x1="${r.fx}" y1="${r.fy}" x2="${baseX}" y2="${baseY}" ${strokeAttr}/>`;
      svg += `<polygon points="${r.tx},${r.ty} ${baseX + px * TRI_W},${baseY + py * TRI_W} ${baseX - px * TRI_W},${baseY - py * TRI_W}" fill="#fff" ${strokeAttr}/>`;
      break;
    }
    case 'implements': {
      const { TRI_LEN, TRI_W } = ARROW;
      const baseX = r.tx - ux * TRI_LEN, baseY = r.ty - uy * TRI_LEN;
      svg += `<line x1="${r.fx}" y1="${r.fy}" x2="${baseX}" y2="${baseY}" ${strokeAttr}${dashed}/>`;
      svg += `<polygon points="${r.tx},${r.ty} ${baseX + px * TRI_W},${baseY + py * TRI_W} ${baseX - px * TRI_W},${baseY - py * TRI_W}" fill="#fff" ${strokeAttr}/>`;
      break;
    }
    case 'aggregation': {
      const { DIA_LEN, DIA_W } = ARROW;
      const endX = r.fx + ux * DIA_LEN * 2, endY = r.fy + uy * DIA_LEN * 2;
      const mx = r.fx + ux * DIA_LEN, my = r.fy + uy * DIA_LEN;
      svg += `<polygon points="${r.fx},${r.fy} ${mx + px * DIA_W},${my + py * DIA_W} ${endX},${endY} ${mx - px * DIA_W},${my - py * DIA_W}" fill="#fff" ${strokeAttr}/>`;
      svg += `<line x1="${endX}" y1="${endY}" x2="${r.tx}" y2="${r.ty}" ${strokeAttr}/>`;
      break;
    }
    case 'composition': {
      const { DIA_LEN, DIA_W } = ARROW;
      const endX = r.fx + ux * DIA_LEN * 2, endY = r.fy + uy * DIA_LEN * 2;
      const mx = r.fx + ux * DIA_LEN, my = r.fy + uy * DIA_LEN;
      svg += `<polygon points="${r.fx},${r.fy} ${mx + px * DIA_W},${my + py * DIA_W} ${endX},${endY} ${mx - px * DIA_W},${my - py * DIA_W}" fill="#666" ${strokeAttr}/>`;
      svg += `<line x1="${endX}" y1="${endY}" x2="${r.tx}" y2="${r.ty}" ${strokeAttr}/>`;
      break;
    }
    default: {
      const { SMALL_TRI_LEN, SMALL_TRI_W } = ARROW;
      const baseX = r.tx - ux * SMALL_TRI_LEN, baseY = r.ty - uy * SMALL_TRI_LEN;
      svg += `<line x1="${r.fx}" y1="${r.fy}" x2="${baseX}" y2="${baseY}" ${strokeAttr}${dashed}/>`;
      svg += `<polygon points="${r.tx},${r.ty} ${baseX + px * SMALL_TRI_W},${baseY + py * SMALL_TRI_W} ${baseX - px * SMALL_TRI_W},${baseY - py * SMALL_TRI_W}" fill="#666" ${strokeAttr}/>`;
    }
  }

  // 多重性标签
  if (r.fromMultiplicity && r.fromMultiplicity !== '1') {
    const labelX = r.fx + ux * 15 + px * 12;
    const labelY = r.fy + uy * 15 + py * 12;
    svg += `<text x="${labelX}" y="${labelY}" fill="#666" font-size="10" text-anchor="middle">${esc(r.fromMultiplicity)}</text>`;
  }
  if (r.toMultiplicity && r.toMultiplicity !== '1') {
    const labelX = r.tx - ux * 15 + px * 12;
    const labelY = r.ty - uy * 15 + py * 12;
    svg += `<text x="${labelX}" y="${labelY}" fill="#666" font-size="10" text-anchor="middle">${esc(r.toMultiplicity)}</text>`;
  }

  const key = relationKey(r);
  const highlighted = highlightKey != null && key === highlightKey;
  return `<g class="relation${highlighted ? ' highlighted' : ''}" data-key="${esc(key)}" data-from="${esc(r.from)}" data-to="${esc(r.to)}">${svg}</g>`;
}

/** 截断文本，超长显示... */
function truncateText(text: string, maxWidth: number, fontSize: number = 12): string {
  const charWidth = fontSize * 0.6;
  const maxChars = Math.floor((maxWidth - 16) / charWidth);
  
  if (text.length <= maxChars) return esc(text);
  if (maxChars <= 3) return esc(text.substring(0, 1)) + '...';
  return esc(text.substring(0, maxChars - 3)) + '...';
}

function renderBox(b: Box, highlighted = false): string {
  const LH = LAYOUT.LINE_H;
  const SEP = 1;
  
  // 筛选成员
  const { filtered: filteredProps, hasMore: hasMoreProps } = selectVisibleProperties(b.props, DISPLAY_CONFIG.MAX_PROPS);
  const { filtered: filteredMeths, hasMore: hasMoreMeths } = selectVisibleMethods(b.meths, DISPLAY_CONFIG.MAX_METHODS);
  
  const propsH = (filteredProps.length + (hasMoreProps ? 1 : 0)) * LH || LH;
  const methsH = (filteredMeths.length + (hasMoreMeths ? 1 : 0)) * LH || LH;

  let svg = `<g class="class-box${highlighted ? ' highlighted' : ''}" data-name="${esc(b.name)}" transform="translate(${b.x},${b.y})">`;
  svg += `<rect width="${b.w}" height="${b.h}" fill="#fff" stroke="#333" stroke-width="1.5" rx="2"/>`;

  let y = 0;
  const titleLines = b.lines.filter(l => l.cls === 'stereotype');
  const titleText = b.lines.find(l => l.cls === 'title');
  const titleH = (titleLines.length + 1) * 16 + 10;

  titleLines.forEach((l, i) => {
    svg += `<text class="${l.cls}" x="${b.w / 2}" y="${y + 14 + i * 14}" text-anchor="middle" font-style="italic" fill="#666">${esc(l.text)}</text>`;
  });
  if (titleText) {
    svg += `<text class="${titleText.cls}" x="${b.w / 2}" y="${y + 14 + titleLines.length * 14}" text-anchor="middle" font-weight="bold">${esc(titleText.text)}</text>`;
  }

  y += titleH;
  svg += `<line class="sep" x1="0" y1="${y}" x2="${b.w}" y2="${y}" stroke="#999" stroke-width="1"/>`;
  y += SEP;

  // 属性
  filteredProps.forEach((p, i) => {
    const text = memberText(p);
    const truncated = truncateText(text, b.w - 8, 12);
    svg += `<text x="8" y="${y + 12 + i * LH}" fill="#333">${truncated}</text>`;
  });
  
  if (hasMoreProps) {
    svg += `<text x="8" y="${y + 12 + filteredProps.length * LH}" fill="#999" font-style="italic">... (${b.props.length - filteredProps.length} more)</text>`;
  }
  
  y += propsH + SEP;
  svg += `<line class="sep" x1="0" y1="${y}" x2="${b.w}" y2="${y}" stroke="#999" stroke-width="1"/>`;
  y += SEP;

  // 方法
  filteredMeths.forEach((m, i) => {
    const text = memberText(m);
    const truncated = truncateText(text, b.w - 8, 12);
    svg += `<text x="8" y="${y + 12 + i * LH}" fill="#333">${truncated}</text>`;
  });
  
  if (hasMoreMeths) {
    svg += `<text x="8" y="${y + 12 + filteredMeths.length * LH}" fill="#999" font-style="italic">... (${b.meths.length - filteredMeths.length} more)</text>`;
  }

  svg += '</g>';
  return svg;
}

/**
 * 为包生成互不相同的颜色。
 * 按包总数均匀分布色相，保证不同包颜色不同；包数量很多时也不会发生碰撞。
 */
function getPackageColor(index: number, total: number): { bg: string; border: string; text: string } {
  const hue = (index * 360) / Math.max(total, 1);
  const h = hue.toFixed(1);
  return {
    bg: `hsl(${h}, 72%, 90%)`,
    border: `hsl(${h}, 42%, 58%)`,
    text: `hsl(${h}, 45%, 30%)`,
  };
}

function renderPackage(pkg: PackageBox, index: number, total: number): string {
  const { bg, border, text } = getPackageColor(index, total);
  
  let svg = `<g class="package-box">`;
  svg += `<rect x="${pkg.x}" y="${pkg.y}" width="${pkg.w}" height="${pkg.h}" fill="${bg}" stroke="${border}" stroke-width="1.5" rx="4" stroke-dasharray="6,3"/>`;
  svg += `<text x="${pkg.x + 8}" y="${pkg.y + 14}" fill="${text}" font-size="12" font-weight="bold">📦 ${esc(pkg.name)}</text>`;
  svg += `</g>`;
  return svg;
}

export function renderSVG(diagram: Diagram, highlightKey?: string | null): string {
  const { boxes, lines, packages, width, height } = diagram;
  if (!boxes.length) return '<text x="10" y="30" fill="#999">无有效类/接口定义</text>';

  let svg = '';

  // 1) 先画包背景
  // 按包名排序后分配稳定索引，保证配色与绘制顺序无关且互不重复
  const sortedPackageNames = packages.map(p => p.name).sort();
  const packageColorIndex = new Map<string, number>();
  sortedPackageNames.forEach((name, i) => packageColorIndex.set(name, i));
  packages.forEach(pkg => {
    const index = packageColorIndex.get(pkg.name) ?? 0;
    svg += renderPackage(pkg, index, packages.length);
  });

  // 2) 再画类框（高亮关系两端时同步高亮起点/终点类）
  const highlightNames = new Set<string>();
  if (highlightKey) {
    const hl = lines.find(l => relationKey(l) === highlightKey);
    if (hl) {
      highlightNames.add(hl.from);
      highlightNames.add(hl.to);
    }
  }
  boxes.forEach(b => {
    svg += renderBox(b, highlightNames.has(b.name));
  });

  // 3) 最后画关系线（在最上层）
  lines.forEach(r => {
    svg += renderRelation(r, highlightKey);
  });

  return `<svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" font-family="system-ui,sans-serif" font-size="12">${svg}</svg>`;
}