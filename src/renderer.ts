/** SVG 渲染器 */

import { Box, Diagram, Line, Member } from './types';

function esc(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function memberText(m: Member): string {
  if (m.kind === 'property') {
    return `${m.modifier} ${m.name}${m.type ? ': ' + m.type : ''}`;
  }
  return `${m.modifier} ${m.name}(${m.params || ''})${m.type ? ': ' + m.type : ''}`;
}

function renderRelation(r: Line): string {
  const dx = r.tx - r.fx, dy = r.ty - r.fy;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const ux = dx / len, uy = dy / len;
  const px = -uy, py = ux;

  const stroke = 'stroke="#666" stroke-width="1.5"';
  const dashed = r.type === 'implements' || r.type === 'dependency' ? ' stroke-dasharray="8,4"' : '';

  let svg = '';

  switch (r.type) {
    case 'extends': {
      // 继承：实线 + 空心三角
      const triLen = 20, triW = 12;
      const baseX = r.tx - ux * triLen, baseY = r.ty - uy * triLen;
      svg += `<line x1="${r.fx}" y1="${r.fy}" x2="${baseX}" y2="${baseY}" ${stroke}/>`;
      svg += `<polygon points="${r.tx},${r.ty} ${baseX + px * triW},${baseY + py * triW} ${baseX - px * triW},${baseY - py * triW}" fill="#fff" ${stroke}/>`;
      break;
    }
    case 'implements': {
      // 实现：虚线 + 空心三角
      const triLen = 20, triW = 12;
      const baseX = r.tx - ux * triLen, baseY = r.ty - uy * triLen;
      svg += `<line x1="${r.fx}" y1="${r.fy}" x2="${baseX}" y2="${baseY}" ${stroke}${dashed}/>`;
      svg += `<polygon points="${r.tx},${r.ty} ${baseX + px * triW},${baseY + py * triW} ${baseX - px * triW},${baseY - py * triW}" fill="#fff" ${stroke}/>`;
      break;
    }
    case 'aggregation': {
      // 聚合：实线 + 空心菱形（在 from 端）
      const diaLen = 16, diaW = 9;
      const endX = r.fx + ux * diaLen * 2, endY = r.fy + uy * diaLen * 2;
      const mx = r.fx + ux * diaLen, my = r.fy + uy * diaLen;
      svg += `<polygon points="${r.fx},${r.fy} ${mx + px * diaW},${my + py * diaW} ${endX},${endY} ${mx - px * diaW},${my - py * diaW}" fill="#fff" ${stroke}/>`;
      svg += `<line x1="${endX}" y1="${endY}" x2="${r.tx}" y2="${r.ty}" ${stroke}/>`;
      break;
    }
    case 'composition': {
      // 组合：实线 + 实心菱形（在 from 端）
      const diaLen = 16, diaW = 9;
      const endX = r.fx + ux * diaLen * 2, endY = r.fy + uy * diaLen * 2;
      const mx = r.fx + ux * diaLen, my = r.fy + uy * diaLen;
      svg += `<polygon points="${r.fx},${r.fy} ${mx + px * diaW},${my + py * diaW} ${endX},${endY} ${mx - px * diaW},${my - py * diaW}" fill="#666" ${stroke}/>`;
      svg += `<line x1="${endX}" y1="${endY}" x2="${r.tx}" y2="${r.ty}" ${stroke}/>`;
      break;
    }
    default: {
      // 关联：实线 + 实心三角箭头
      const triLen = 16, triW = 9;
      const baseX = r.tx - ux * triLen, baseY = r.ty - uy * triLen;
      svg += `<line x1="${r.fx}" y1="${r.fy}" x2="${baseX}" y2="${baseY}" ${stroke}${dashed}/>`;
      svg += `<polygon points="${r.tx},${r.ty} ${baseX + px * triW},${baseY + py * triW} ${baseX - px * triW},${baseY - py * triW}" fill="#666" ${stroke}/>`;
    }
  }

  // 绘制多重性标签
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

export function renderSVG(diagram: Diagram): string {
  const { boxes, lines, width, height } = diagram;
  if (!boxes.length) return '<text x="10" y="30" fill="#999">无有效类/接口定义</text>';

  let svg = '';
  const LH = 18;
  const SEP = 1;

  // 1) 先画类框
  boxes.forEach((b) => {
    const propsH = b.props.length * LH || LH;

    svg += `<g class="class-box" transform="translate(${b.x},${b.y})">`;
    svg += `<rect width="${b.w}" height="${b.h}" fill="#fff" stroke="#333" stroke-width="1.5" rx="2"/>`;

    let y = 0;
    const titleLines = b.lines.filter(l => l.cls === 'stereotype');
    const titleText = b.lines.find(l => l.cls === 'title');
    const titleH = (titleLines.length + 1) * 16 + 10;

    titleLines.forEach((l, i) => {
      svg += `<text class="${l.cls}" x="${b.w / 2}" y="${y + 14 + i * 14}">${esc(l.text)}</text>`;
    });
    if (titleText) {
      svg += `<text class="${titleText.cls}" x="${b.w / 2}" y="${y + 14 + titleLines.length * 14}">${esc(titleText.text)}</text>`;
    }

    y += titleH;
    svg += `<line class="sep" x1="0" y1="${y}" x2="${b.w}" y2="${y}"/>`;
    y += SEP;

    b.props.forEach((p, i) => {
      svg += `<text x="8" y="${y + 12 + i * LH}" fill="#333">${esc(memberText(p))}</text>`;
    });
    y += propsH + SEP;
    svg += `<line class="sep" x1="0" y1="${y}" x2="${b.w}" y2="${y}"/>`;
    y += SEP;

    b.meths.forEach((m, i) => {
      svg += `<text x="8" y="${y + 12 + i * LH}" fill="#333">${esc(memberText(m))}</text>`;
    });

    svg += '</g>';
  });

  // 2) 再画关系线
  lines.forEach(r => {
    svg += renderRelation(r);
  });

  return `<svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">${svg}</svg>`;
}