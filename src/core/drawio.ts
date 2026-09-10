/** Draw.io XML 导出器 */

import { Box, Diagram, DrawioCell, Relation } from './types';
import { esc, LAYOUT } from './utils';

function getDrawioArrowStyle(type: string): string {
  switch (type) {
    case 'extends':
      return 'endArrow=block;endFill=0;html=1;exitX=0.5;exitY=1;exitDx=0;exitDy=0;entryX=0.5;entryY=0;entryDx=0;entryDy=0;';
    case 'implements':
      return 'endArrow=block;endFill=0;dashed=1;html=1;exitX=0.5;exitY=1;exitDx=0;exitDy=0;entryX=0.5;entryY=0;entryDx=0;entryDy=0;';
    case 'aggregation':
      return 'endArrow=none;startArrow=diamond;startFill=0;html=1;exitX=0.5;exitY=1;exitDx=0;exitDy=0;entryX=0.5;entryY=0;entryDx=0;entryDy=0;';
    case 'composition':
      return 'endArrow=none;startArrow=diamond;startFill=1;html=1;exitX=0.5;exitY=1;exitDx=0;exitDy=0;entryX=0.5;entryY=0;entryDx=0;entryDy=0;';
    case 'dependency':
      return 'endArrow=open;endFill=0;dashed=1;html=1;exitX=0.5;exitY=1;exitDx=0;exitDy=0;entryX=0.5;entryY=0;entryDx=0;entryDy=0;';
    default:
      return 'endArrow=block;endFill=1;html=1;exitX=0.5;exitY=1;exitDx=0;exitDy=0;entryX=0.5;entryY=0;entryDx=0;entryDy=0;';
  }
}

/** 类框的 HTML label（先按 HTML 转义，写 XML 时再整体做属性转义） */
function buildBoxLabel(b: Box): string {
  const titleLines = b.lines.filter(l => l.cls === 'stereotype');
  const titleText = b.lines.find(l => l.cls === 'title');

  let label = '';
  titleLines.forEach(l => { label += `<p><i>${esc(l.text)}</i></p>`; });
  label += `<p><b>${esc(titleText?.text || '')}</b></p>`;
  label += '<hr size="1"/>';

  b.props.forEach(p => {
    label += `<p>${esc(p.modifier)} ${esc(p.name)}${p.type ? ': ' + esc(p.type) : ''}</p>`;
  });
  label += '<hr size="1"/>';

  b.meths.forEach(m => {
    const sig = `${m.name}(${m.params || ''})${m.type ? ': ' + m.type : ''}`;
    label += `<p>${esc(m.modifier)} ${esc(sig)}</p>`;
  });

  return label;
}

/** 关系边标签：字段名 + 两端多重性 */
function buildEdgeLabel(r: Relation): string {
  const parts: string[] = [];
  if (r.label) parts.push(r.label);
  if (r.fromMultiplicity && r.fromMultiplicity !== '1') parts.push(r.fromMultiplicity);
  if (r.toMultiplicity && r.toMultiplicity !== '1') parts.push(r.toMultiplicity);
  return parts.join(' ');
}

export function generateDrawioXML(diagram: Diagram): string {
  const { boxes, lines } = diagram;
  const { SCALE, PAD } = LAYOUT.EXPORTER;

  const cells: DrawioCell[] = [];
  // 根节点固定占用 id 0 与 1，业务节点从 2 开始，避免 id 冲突
  const nameToId = new Map<string, number>();
  let id = 2;

  boxes.forEach(b => {
    const boxId = id++;
    nameToId.set(b.name, boxId);
    cells.push({
      id: boxId,
      value: buildBoxLabel(b),
      style: 'swimlane;fontStyle=1;align=center;startSize=26;html=1;',
      vertex: 1,
      x: b.x * SCALE + PAD,
      y: b.y * SCALE + PAD,
      w: b.w * SCALE,
      h: b.h * SCALE,
    });
  });

  lines.forEach(r => {
    const source = nameToId.get(r.from);
    const target = nameToId.get(r.to);
    if (source === undefined || target === undefined) return;

    cells.push({
      id: id++,
      value: buildEdgeLabel(r),
      style: getDrawioArrowStyle(r.type),
      edge: 1,
      source,
      target,
    });
  });

  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<mxfile><diagram name="TypeScript UML" id="ts-uml"><mxGraphModel><root>';
  xml += '<mxCell id="0"/><mxCell id="1" parent="0"/>';

  cells.forEach(c => {
    const attrs: string[] = [
      `id="${c.id}"`,
      `value="${esc(c.value)}"`,
      `style="${esc(c.style)}"`,
      'parent="1"',
    ];
    if (c.vertex) {
      attrs.push('vertex="1"', `x="${c.x}"`, `y="${c.y}"`, `width="${c.w}"`, `height="${c.h}"`);
    }
    if (c.edge) {
      attrs.push('edge="1"', `source="${c.source}"`, `target="${c.target}"`);
    }
    xml += `<mxCell ${attrs.join(' ')}/>`;
  });

  xml += '</root></mxGraphModel></diagram></mxfile>';
  return xml;
}
