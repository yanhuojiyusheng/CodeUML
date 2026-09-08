/** 布局引擎 - 改进的层级布局 */

import { ParsedData, Box, Line, Diagram, Member } from './types';

const PAD_X = 140;
const PAD_Y = 180;
const LINE_H = 18;
const CHAR_W = 7.2;

function textWidth(s: string): number {
  return String(s).length * CHAR_W + 16;
}

function memberText(m: Member): string {
  if (m.kind === 'property') {
    return `${m.modifier} ${m.name}${m.type ? ': ' + m.type : ''}`;
  }
  return `${m.modifier} ${m.name}(${m.params || ''})${m.type ? ': ' + m.type : ''}`;
}

export function layoutDiagram(parsed: ParsedData): Diagram {
  const { classes, relations } = parsed;
  if (!classes.length) return { boxes: [], lines: [], width: 0, height: 0 };

  const nameMap: Record<string, any> = {};
  classes.forEach(c => nameMap[c.name] = c);

  // 1. 构建依赖图
  const childrenOf: Record<string, string[]> = {};
  const parentOf: Record<string, string> = {};
  const implementsOf: Record<string, string[]> = {};
  
  relations.forEach(r => {
    if (r.type === 'extends') {
      if (!childrenOf[r.to]) childrenOf[r.to] = [];
      childrenOf[r.to].push(r.from);
      parentOf[r.from] = r.to;
    } else if (r.type === 'implements') {
      if (!implementsOf[r.from]) implementsOf[r.from] = [];
      implementsOf[r.from].push(r.to);
    }
  });

  // 2. 分类：有继承关系的 vs 独立的
  const hasInheritance = new Set<string>();
  Object.keys(childrenOf).forEach(p => hasInheritance.add(p));
  Object.keys(parentOf).forEach(c => hasInheritance.add(c));
  
  // 3. 构建层级结构
  const levels: string[][] = [];
  const placed = new Set<string>();

  // 找所有根节点（没有父类的）
  const roots = classes.filter(c => !parentOf[c.name]).map(c => c.name);
  
  // 按类型排序根节点：先抽象类，再接口，最后具体类
  roots.sort((a, b) => {
    const ca = nameMap[a], cb = nameMap[b];
    if (ca.isAbstract && !cb.isAbstract) return -1;
    if (!ca.isAbstract && cb.isAbstract) return 1;
    if (ca.isInterface && !cb.isInterface) return -1;
    if (!ca.isInterface && cb.isInterface) return 1;
    return 0;
  });

  // BFS 构建层级
  let queue = [...roots];
  while (queue.length) {
    const level: string[] = [];
    const nextQueue: string[] = [];
    
    queue.forEach(name => {
      if (placed.has(name)) return;
      placed.add(name);
      level.push(name);
      
      (childrenOf[name] || []).forEach(child => {
        if (!placed.has(child)) nextQueue.push(child);
      });
    });
    
    if (level.length) {
      // 层内排序：按成员数量、子类数量排序
      level.sort((a, b) => {
        const aImpl = (implementsOf[a] || []).length;
        const bImpl = (implementsOf[b] || []).length;
        const aChildren = (childrenOf[a] || []).length;
        const bChildren = (childrenOf[b] || []).length;
        return (bImpl + bChildren) - (aImpl + aChildren);
      });
      levels.push(level);
    }
    queue = nextQueue;
  }

  // 4. 计算每个类框的尺寸
  const boxMap: Record<string, Box> = {};
  classes.forEach(c => {
    const props = c.members.filter(m => m.kind === 'property');
    const meths = c.members.filter(m => m.kind === 'method');
    
    const stereotypeH = c.isInterface || c.isAbstract ? 16 : 0;
    const titleH = 26;
    const propsH = Math.max(props.length, 1) * LINE_H;
    const methsH = Math.max(meths.length, 1) * LINE_H;
    const h = stereotypeH + titleH + 1 + propsH + 1 + methsH + 8;

    const lines = [
      ...(c.isInterface ? [{ text: '«interface»', cls: 'stereotype' }] : []),
      ...(c.isAbstract && !c.isInterface ? [{ text: '«abstract»', cls: 'stereotype' }] : []),
      { text: c.name, cls: 'title' }
    ];

    let maxW = textWidth(c.name);
    props.forEach(p => { maxW = Math.max(maxW, textWidth(memberText(p))); });
    meths.forEach(m => { maxW = Math.max(maxW, textWidth(memberText(m))); });
    const w = Math.max(180, maxW + 30);

    boxMap[c.name] = { ...c, x: 0, y: 0, w, h, lines, props, meths };
  });

  // 5. 分层放置
  let curY = 0;
  const allBoxes: Box[] = [];

  // 计算每层最大宽度用于居中
  const levelWidths = levels.map(level => 
    level.reduce((sum, name) => sum + boxMap[name].w + PAD_X, -PAD_X)
  );
  const maxWidth = Math.max(...levelWidths, 0);

  levels.forEach((level, levelIdx) => {
    let totalW = 0;
    level.forEach((name, i) => {
      totalW += boxMap[name].w;
      if (i < level.length - 1) totalW += PAD_X;
    });

    // 居中放置
    let curX = (maxWidth - totalW) / 2;
    let rowMaxH = 0;

    level.forEach(name => {
      const b = boxMap[name];
      b.x = curX;
      b.y = curY;
      curX += b.w + PAD_X;
      rowMaxH = Math.max(rowMaxH, b.h);
      allBoxes.push(b);
    });

    curY += rowMaxH + PAD_Y;
  });

  // 6. 计算边界并偏移
  const minX = allBoxes.length ? Math.min(...allBoxes.map(b => b.x)) : 0;
  const maxX = allBoxes.length ? Math.max(...allBoxes.map(b => b.x + b.w)) : 0;
  const maxY = allBoxes.length ? Math.max(...allBoxes.map(b => b.y + b.h)) : 0;

  const offsetX = -minX + PAD_X;
  allBoxes.forEach(b => { 
    b.x += offsetX;
    b.y += PAD_Y;
  });

  const width = maxX - minX + PAD_X * 2;
  const height = maxY + PAD_Y * 2;

  // 7. 计算关系连线（直线）
  const lines: Line[] = relations.map(r => {
    const from = boxMap[r.from];
    const to = boxMap[r.to];
    if (!from || !to) return null;

    let fx: number, fy: number, tx: number, ty: number;

    if (r.type === 'extends' || r.type === 'implements') {
      // 继承/实现：子类顶部中心 -> 父类底部中心
      fx = from.x + from.w / 2;
      fy = from.y;
      tx = to.x + to.w / 2;
      ty = to.y + to.h;
    } else {
      // 关联：找最近的边
      const fromCx = from.x + from.w / 2;
      const fromCy = from.y + from.h / 2;
      const toCx = to.x + to.w / 2;
      const toCy = to.y + to.h / 2;
      
      const dx = toCx - fromCx;
      const dy = toCy - fromCy;
      
      // 计算从 from 边缘出发的点
      if (Math.abs(dx) * from.h > Math.abs(dy) * from.w) {
        fx = dx > 0 ? from.x + from.w : from.x;
        fy = fromCy;
      } else {
        fx = fromCx;
        fy = dy > 0 ? from.y + from.h : from.y;
      }
      
      // 计算到 to 边缘的点
      if (Math.abs(dx) * to.h > Math.abs(dy) * to.w) {
        tx = dx > 0 ? to.x : to.x + to.w;
        ty = toCy;
      } else {
        tx = toCx;
        ty = dy > 0 ? to.y : to.y + to.h;
      }
    }

    return { ...r, fx, fy, tx, ty };
  }).filter((x): x is Line => x !== null);

  return { boxes: allBoxes, lines, width, height };
}