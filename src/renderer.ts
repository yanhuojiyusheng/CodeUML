/** SVG 渲染器 - 支持包分组和成员筛选 */

import { Box, Diagram, Line, Member, PackageBox } from './types';
import { esc, memberText, LAYOUT } from './utils';

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

/** 筛选重要成员 */
function filterImportantMembers(members: Member[], maxCount: number): { filtered: Member[], hasMore: boolean } {
  if (members.length <= maxCount) {
    return { filtered: members, hasMore: false };
  }
  
  // 第一轮：只保留公共和静态成员
  const important = members.filter(m => m.isStatic || m.modifier === '+');
  
  // 如果筛选后足够，返回
  if (important.length >= maxCount) {
    return { filtered: important.slice(0, maxCount), hasMore: true };
  }
  
  // 如果不够，补充其他成员直到达到上限
  const remaining = members.filter(m => !m.isStatic && m.modifier !== '+');
  const combined = [...important, ...remaining].slice(0, maxCount);
  return { filtered: combined, hasMore: members.length > maxCount };
}

/** 筛选属性（跳过可选属性，但确保显示数量） */
function filterProperties(props: Member[], maxCount: number): { filtered: Member[], hasMore: boolean } {
  if (props.length <= maxCount) {
    return { filtered: props, hasMore: false };
  }
  
  // 第一轮：跳过带 ? 的可选属性
  const required = props.filter(p => !p.name.includes('?'));
  
  // 如果必需属性足够
  if (required.length >= maxCount) {
    return { filtered: required.slice(0, maxCount), hasMore: true };
  }
  
  // 如果不够，补充可选属性直到达到上限
  const optional = props.filter(p => p.name.includes('?'));
  const combined = [...required, ...optional].slice(0, maxCount);
  return { filtered: combined, hasMore: props.length > maxCount };
}

function renderRelation(r: Line): string {
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

  return svg;
}

/** 截断文本，超长显示... */
function truncateText(text: string, maxWidth: number, fontSize: number = 12): string {
  const charWidth = fontSize * 0.6;
  const maxChars = Math.floor((maxWidth - 16) / charWidth);
  
  if (text.length <= maxChars) return esc(text);
  if (maxChars <= 3) return esc(text.substring(0, 1)) + '...';
  return esc(text.substring(0, maxChars - 3)) + '...';
}

function renderBox(b: Box): string {
  const LH = LAYOUT.LINE_H;
  const SEP = 1;
  
  // 筛选成员
  const { filtered: filteredProps, hasMore: hasMoreProps } = filterProperties(b.props, DISPLAY_CONFIG.MAX_PROPS);
  const { filtered: filteredMeths, hasMore: hasMoreMeths } = filterImportantMembers(b.meths, DISPLAY_CONFIG.MAX_METHODS);
  
  const propsH = (filteredProps.length + (hasMoreProps ? 1 : 0)) * LH || LH;
  const methsH = (filteredMeths.length + (hasMoreMeths ? 1 : 0)) * LH || LH;

  let svg = `<g class="class-box" transform="translate(${b.x},${b.y})">`;
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

function renderPackage(pkg: PackageBox): string {
  const colors = ['#e3f2fd', '#fce4ec', '#e8f5e9', '#fff3e0', '#f3e5f5', '#e0f2f1', '#fff8e1'];
  const colorIndex = Math.abs(hashString(pkg.name)) % colors.length;
  const bgColor = colors[colorIndex];
  
  let svg = `<g class="package-box">`;
  svg += `<rect x="${pkg.x}" y="${pkg.y}" width="${pkg.w}" height="${pkg.h}" fill="${bgColor}" stroke="#90a4ae" stroke-width="1.5" rx="4" stroke-dasharray="6,3"/>`;
  svg += `<text x="${pkg.x + 8}" y="${pkg.y + 14}" fill="#546e7a" font-size="12" font-weight="bold">📦 ${esc(pkg.name)}</text>`;
  svg += `</g>`;
  return svg;
}

function hashString(s: string): number {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    const char = s.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return hash;
}

export function renderSVG(diagram: Diagram): string {
  const { boxes, lines, packages, width, height } = diagram;
  if (!boxes.length) return '<text x="10" y="30" fill="#999">无有效类/接口定义</text>';

  let svg = '';

  // 1) 先画包背景
  packages.forEach(pkg => {
    svg += renderPackage(pkg);
  });

  // 2) 再画类框
  boxes.forEach(b => {
    svg += renderBox(b);
  });

  // 3) 最后画关系线（在最上层）
  lines.forEach(r => {
    svg += renderRelation(r);
  });

  return `<svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" font-family="system-ui,sans-serif" font-size="12">${svg}</svg>`;
}