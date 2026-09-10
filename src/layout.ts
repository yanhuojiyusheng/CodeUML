/** 布局引擎 - 支持包分组和优化布局 */

import { ParsedData, Box, Line, Diagram, ClassInfo, PackageBox } from './types';
import { memberText, textWidth, LAYOUT } from './utils';

export function layoutDiagram(parsed: ParsedData): Diagram {
  const { classes, relations } = parsed;
  if (!classes.length) return { boxes: [], lines: [], packages: [], width: 0, height: 0 };

  const nameMap: Record<string, ClassInfo> = {};
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

  // 2. 按包分组
  const packageGroups = new Map<string, string[]>();
  classes.forEach(c => {
    const pkg = c.packageName || 'default';
    if (!packageGroups.has(pkg)) packageGroups.set(pkg, []);
    packageGroups.get(pkg)!.push(c.name);
  });

  // 3. 计算类框尺寸
  const boxMap: Record<string, Box> = {};
  classes.forEach(c => {
    const props = c.members.filter(m => m.kind === 'property');
    const meths = c.members.filter(m => m.kind === 'method');
    
    const stereotypeH = c.isInterface || c.isAbstract ? 16 : 0;
    const titleH = 26;
    const propsH = Math.max(props.length, 1) * LAYOUT.LINE_H;
    const methsH = Math.max(meths.length, 1) * LAYOUT.LINE_H;
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

  // 4. 构建层级结构（按包组织）
  const levels: string[][] = [];
  const placed = new Set<string>();

  // 找根节点（没有父类的）
  const roots = classes.filter(c => !parentOf[c.name]).map(c => c.name);
  
  // 排序：抽象类 > 接口 > 具体类，同包的放一起
  roots.sort((a, b) => {
    const ca = nameMap[a], cb = nameMap[b];
    // 先按包排序
    const pkgA = ca.packageName || '';
    const pkgB = cb.packageName || '';
    if (pkgA !== pkgB) return pkgA.localeCompare(pkgB);
    // 再按类型排序
    if (ca.isAbstract && !cb.isAbstract) return -1;
    if (!ca.isAbstract && cb.isAbstract) return 1;
    if (ca.isInterface && !cb.isInterface) return -1;
    if (!ca.isInterface && cb.isInterface) return 1;
    return 0;
  });

  // BFS 构建层级，同包的类尽量在同一层
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
      level.sort((a, b) => {
        const pkgA = nameMap[a].packageName || '';
        const pkgB = nameMap[b].packageName || '';
        return pkgA.localeCompare(pkgB);
      });
      levels.push(level);
    }
    queue = nextQueue;
  }

  // 5. 按包布局 - 每个包内的类放在一起
  const PAD = LAYOUT.PAD_X;
  const GAP = 30; // 包内间距
  const PKG_GAP = 50; // 包间间距
  
  // 计算每层每个包的宽度
  interface PackageInLevel {
    name: string;
    boxes: Box[];
    totalW: number;
    maxH: number;
  }
  
  // 收集所有包
  const allPackages = new Set<string>();
  classes.forEach(c => allPackages.add(c.packageName || 'default'));
  
  // 按层和包组织
  const levelPackages: PackageInLevel[][] = [];
  levels.forEach(level => {
    const pkgs = new Map<string, Box[]>();
    level.forEach(name => {
      const pkg = nameMap[name].packageName || 'default';
      if (!pkgs.has(pkg)) pkgs.set(pkg, []);
      pkgs.get(pkg)!.push(boxMap[name]);
    });
    
    const levelPkgs: PackageInLevel[] = [];
    pkgs.forEach((boxes, name) => {
      const totalW = boxes.reduce((sum, b) => sum + b.w, 0) + (boxes.length - 1) * GAP;
      const maxH = Math.max(...boxes.map(b => b.h));
      levelPkgs.push({ name, boxes, totalW, maxH });
    });
    levelPackages.push(levelPkgs);
  });

  // 6. 计算包的位置
  const packageBoxes: PackageBox[] = [];
  const packagePositions = new Map<string, { x: number; y: number; w: number; h: number }>();
  
  let curY = 20;
  let globalMaxW = 0;
  
  levelPackages.forEach(levelPkgs => {
    let curX = 20;
    let rowMaxH = 0;
    
    levelPkgs.forEach(pkg => {
      const pkgX = curX;
      const pkgY = curY;
      const pkgW = pkg.totalW + 2 * GAP;
      const pkgH = pkg.maxH + 2 * GAP + 20; // 20 for package name
      
      // 记录包位置
      packagePositions.set(pkg.name, { x: pkgX, y: pkgY, w: pkgW, h: pkgH });
      
      // 放置类框
      let boxX = pkgX + GAP;
      pkg.boxes.forEach(box => {
        box.x = boxX;
        box.y = pkgY + GAP + 20; // 包名下方
        boxX += box.w + GAP;
      });
      
      packageBoxes.push({
        name: pkg.name,
        x: pkgX,
        y: pkgY,
        w: pkgW,
        h: pkgH,
        boxes: pkg.boxes
      });
      
      curX += pkgW + PKG_GAP;
      rowMaxH = Math.max(rowMaxH, pkgH);
      globalMaxW = Math.max(globalMaxW, curX);
    });
    
    curY += rowMaxH + PKG_GAP;
  });

  // 7. 计算边界
  const allBoxes = Object.values(boxMap);
  const minX = allBoxes.length ? Math.min(...allBoxes.map(b => b.x)) : 0;
  const maxX = allBoxes.length ? Math.max(...allBoxes.map(b => b.x + b.w)) : 0;
  const maxY = allBoxes.length ? Math.max(...allBoxes.map(b => b.y + b.h)) : 0;

  // 偏移使所有坐标为正
  const offsetX = -minX + 30;
  const offsetY = 30;
  
  allBoxes.forEach(b => {
    b.x += offsetX;
    b.y += offsetY;
  });
  
  packageBoxes.forEach(pkg => {
    pkg.x += offsetX;
    pkg.y += offsetY;
    pkg.boxes.forEach(b => {
      b.x += offsetX;
      b.y += offsetY;
    });
  });

  const width = Math.max(globalMaxW, maxX - minX + 60) + 30;
  const height = curY + 60;

  // 8. 计算关系连线
  const lines: Line[] = relations.map(r => {
    const from = boxMap[r.from];
    const to = boxMap[r.to];
    if (!from || !to) return null;

    let fx: number, fy: number, tx: number, ty: number;

    if (r.type === 'extends' || r.type === 'implements') {
      fx = from.x + from.w / 2;
      fy = from.y;
      tx = to.x + to.w / 2;
      ty = to.y + to.h;
    } else {
      const fromCx = from.x + from.w / 2;
      const fromCy = from.y + from.h / 2;
      const toCx = to.x + to.w / 2;
      const toCy = to.y + to.h / 2;
      
      const dx = toCx - fromCx;
      const dy = toCy - fromCy;
      
      if (Math.abs(dx) * from.h > Math.abs(dy) * from.w) {
        fx = dx > 0 ? from.x + from.w : from.x;
        fy = fromCy;
      } else {
        fx = fromCx;
        fy = dy > 0 ? from.y + from.h : from.y;
      }
      
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

  return { boxes: allBoxes, lines, packages: packageBoxes, width, height };
}