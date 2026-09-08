/** Draw.io XML 导出器 */

import { Box, Diagram, Line, DrawioCell } from './types';

function esc(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

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

function buildBoxLabel(b: Box): string {
  const titleLines = b.lines.filter(l => l.cls === 'stereotype');
  const titleText = b.lines.find(l => l.cls === 'title');

  let label = '';
  titleLines.forEach(l => {
    label += `<p><i>${esc(l.text)}</i></p>`;
  });
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

export function generateDrawioXML(diagram: Diagram): string {
  const { boxes, lines } = diagram;
  const SCALE = 1.5;
  const PAD = 40;

  let cells: DrawioCell[] = [];
  let id = 1;

  boxes.forEach(b => {
    cells.push({
      id,
      value: buildBoxLabel(b),
      style: 'swimlane;fontStyle=1;align=center;startSize=26;html=1;',
      vertex: 1,
      x: b.x * SCALE + PAD,
      y: b.y * SCALE + PAD,
      w: b.w * SCALE,
      h: b.h * SCALE
    });
    id++;
  });

  const nameMap: Record<string, Box> = {};
  boxes.forEach(b => nameMap[b.name] = b);

  lines.forEach(r => {
    const from = nameMap[r.from];
    const to = nameMap[r.to];
    if (!from || !to) return;

    const fromId = boxes.indexOf(from) + 1;
    const toId = boxes.indexOf(to) + 1;

    let style = getDrawioArrowStyle(r.type);
    
    // 添加多重性标签
    let label = '';
    if (r.fromMultiplicity && r.fromMultiplicity !== '1') {
      label = r.fromMultiplicity;
    }
    if (r.toMultiplicity && r.toMultiplicity !== '1') {
      label = (label ? label + '..' : '') + r.toMultiplicity;
    }
    if (r.label) {
      label = label ? r.label + ' ' + label : r.label;
    }

    cells.push({
      id,
      value: label,
      style,
      edge: 1,
      source: fromId,
      target: toId
    });
    id++;
  });

  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<mxfile><diagram name="TypeScript UML" id="ts-uml"><mxGraphModel><root>';
  xml += '<mxCell id="0"/><mxCell id="1" parent="0"/>';

  cells.forEach(c => {
    const extra = c.vertex ? ` x="${c.x}" y="${c.y}" width="${c.w}" height="${c.h}"` : '';
    const parent = c.edge ? '' : ' parent="1"';
    xml += `<mxCell id="${c.id}" value="${c.value}" style="${c.style}"${c.vertex ? ' vertex="1"' : ''}${c.edge ? ' edge="1"' : ''}${parent}${extra}`;
    if (c.source) xml += ` source="${c.source}" target="${c.target}"`;
    xml += '/>';
  });

  xml += '</root></mxGraphModel></diagram></mxfile>';
  return xml;
}