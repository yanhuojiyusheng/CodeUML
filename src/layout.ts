/** 布局引擎 - 优化的空间布局 */

import { ParsedData, Box, Line, Diagram, ClassInfo, PackageBox, Member } from './types';
import { memberText, textWidth, LAYOUT } from './utils';

// 显示配置（与 renderer 同步）
export const LAYOUT_CONFIG = {
  MAX_PROPS: 8,
  MAX_METHODS: 8,
};

export function setLayoutConfig(config: Partial<typeof LAYOUT_CONFIG>) {
  Object.assign(LAYOUT_CONFIG, config);
}

/** 筛选后的成员数量（用于计算框高度） */
function getDisplayCount(members: Member[], maxCount: number, isProp: boolean): { count: number; hasMore: boolean } {
  if (members.length <= maxCount) {
    return { count: members.length, hasMore: false };
  }
  
  let filtered: Member[];
  
  if (isProp) {
    // 属性：优先必需属性，不够则补充可选属性
    const required = members.filter(m => !m.name.includes('?'));
    if (required.length >= maxCount) {
      filtered = required.slice(0, maxCount);
    } else {
      const optional = members.filter(m => m.name.includes('?'));
      filtered = [...required, ...optional].slice(0, maxCount);
    }
  } else {
    // 方法：优先公共和静态，不够则补充其他
    const important = members.filter(m => m.isStatic || m.modifier === '+');
    if (important.length >= maxCount) {
      filtered = important.slice(0, maxCount);
    } else {
      const remaining = members.filter(m => !m.isStatic && m.modifier !== '+');
      filtered = [...important, ...remaining].slice(0, maxCount);
    }
  }
  
  return { count: filtered.length, hasMore: members.length > filtered.length };
}

// 布局配置
const CONFIG = {
  MAX_ROW_WIDTH: 1600,      // 最大行宽
  PKG_PADDING: 20,          // 包内边距
  PKG_GAP: 30,              // 包间距
  ROW_GAP: 40,              // 行间距
  BOX_GAP: 15,              // 类框间距
  MIN_BOX_WIDTH: 160,       // 最小框宽
  MAX_BOX_WIDTH: 280,       // 最大框宽
};

export function layoutDiagram(parsed: ParsedData): Diagram {
  const { classes, relations } = parsed;
  if (!classes.length) return { boxes: [], lines: [], packages: [], width: 0, height: 0 };

  const nameMap: Record<string, ClassInfo> = {};
  classes.forEach(c => nameMap[c.name] = c);

  // 1. 构建依赖图
  const childrenOf: Record<string, string[]> = {};
  const parentOf: Record<string, string> = {};
  
  relations.forEach(r => {
    if (r.type === 'extends') {
      if (!childrenOf[r.to]) childrenOf[r.to] = [];
      childrenOf[r.to].push(r.from);
      parentOf[r.from] = r.to;
    }
  });

  // 2. 计算类框尺寸（考虑显示限制）
  const boxMap: Record<string, Box> = {};
  classes.forEach(c => {
    const props = c.members.filter(m => m.kind === 'property');
    const meths = c.members.filter(m => m.kind === 'method');
    
    // 计算显示数量
    const { count: displayProps, hasMore: hasMoreProps } = getDisplayCount(props, LAYOUT_CONFIG.MAX_PROPS, true);
    const { count: displayMeths, hasMore: hasMoreMeths } = getDisplayCount(meths, LAYOUT_CONFIG.MAX_METHODS, false);
    
    const stereotypeH = c.isInterface || c.isAbstract ? 16 : 0;
    const titleH = 26;
    const propsH = Math.max(displayProps + (hasMoreProps ? 1 : 0), 1) * LAYOUT.LINE_H;
    const methsH = Math.max(displayMeths + (hasMoreMeths ? 1 : 0), 1) * LAYOUT.LINE_H;
    const h = stereotypeH + titleH + 1 + propsH + 1 + methsH + 8;

    const lines = [
      ...(c.isInterface ? [{ text: '«interface»', cls: 'stereotype' }] : []),
      ...(c.isAbstract && !c.isInterface ? [{ text: '«abstract»', cls: 'stereotype' }] : []),
      { text: c.name, cls: 'title' }
    ];

    // 计算最大宽度
    let maxW = textWidth(c.name);
    props.slice(0, displayProps).forEach(p => { maxW = Math.max(maxW, textWidth(memberText(p))); });
    meths.slice(0, displayMeths).forEach(m => { maxW = Math.max(maxW, textWidth(memberText(m))); });
    if (hasMoreProps || hasMoreMeths) {
      maxW = Math.max(maxW, textWidth('... (N more)'));
    }
    const w = Math.max(CONFIG.MIN_BOX_WIDTH, Math.min(CONFIG.MAX_BOX_WIDTH, maxW + 30));

    boxMap[c.name] = { ...c, x: 0, y: 0, w, h, lines, props, meths };
  });

  // 3. 按包分组并计算包内布局
  const packageBoxes: PackageBox[] = [];
  const packageGroups = new Map<string, string[]>();
  
  classes.forEach(c => {
    const pkg = c.packageName || 'default';
    if (!packageGroups.has(pkg)) packageGroups.set(pkg, []);
    packageGroups.get(pkg)!.push(c.name);
  });

  // 计算每个包的内容尺寸
  interface PackageInfo {
    name: string;
    classNames: string[];
    contentW: number;
    contentH: number;
  }
  
  const packageInfos: PackageInfo[] = [];
  
  packageGroups.forEach((classNames, name) => {
    // 包内按层级排序
    const sorted = sortClassesInPackage(classNames, parentOf, childrenOf);
    
    // 计算包内网格布局
    const { width: contentW, height: contentH } = calculatePackageLayout(
      sorted.map(n => boxMap[n]), CONFIG.BOX_GAP, CONFIG.BOX_GAP
    );
    
    packageInfos.push({ name, classNames: sorted, contentW, contentH });
  });

  // 4. 行式装箱布局 - 将包排列成多行
  const rows: PackageInfo[][] = [];
  let currentRow: PackageInfo[] = [];
  let currentRowWidth = 0;
  
  // 按面积降序排序，大的包优先放置（First Fit Decreasing）
  packageInfos.sort((a, b) => (b.contentW * b.contentH) - (a.contentW * a.contentH));
  
  packageInfos.forEach(pkg => {
    const pkgTotalW = pkg.contentW + 2 * CONFIG.PKG_PADDING;
    
    if (currentRow.length > 0 && currentRowWidth + CONFIG.PKG_GAP + pkgTotalW > CONFIG.MAX_ROW_WIDTH) {
      rows.push(currentRow);
      currentRow = [];
      currentRowWidth = 0;
    }
    
    currentRow.push(pkg);
    currentRowWidth += (currentRow.length === 1 ? 0 : CONFIG.PKG_GAP) + pkgTotalW;
  });
  
  if (currentRow.length > 0) {
    rows.push(currentRow);
  }

  // 5. 计算每个包和类的最终位置
  let globalY = 20;
  let globalMaxW = 0;
  
  rows.forEach(row => {
    // 计算本行最大高度
    const rowMaxH = Math.max(...row.map(pkg => pkg.contentH + 2 * CONFIG.PKG_PADDING + 20));
    
    // 计算本行总宽度，用于居中
    const rowTotalW = row.reduce((sum, pkg, i) => {
      return sum + (i > 0 ? CONFIG.PKG_GAP : 0) + pkg.contentW + 2 * CONFIG.PKG_PADDING;
    }, 0);
    
    let curX = 20;
    
    row.forEach(pkg => {
      const pkgW = pkg.contentW + 2 * CONFIG.PKG_PADDING;
      const pkgH = rowMaxH;
      
      // 放置类框
      layoutBoxesInPackage(
        pkg.classNames.map(n => boxMap[n]),
        curX + CONFIG.PKG_PADDING,
        globalY + CONFIG.PKG_PADDING + 20, // 包名下方
        CONFIG.BOX_GAP,
        CONFIG.BOX_GAP
      );
      
      packageBoxes.push({
        name: pkg.name,
        x: curX,
        y: globalY,
        w: pkgW,
        h: pkgH,
        boxes: pkg.classNames.map(n => boxMap[n])
      });
      
      curX += pkgW + CONFIG.PKG_GAP;
      globalMaxW = Math.max(globalMaxW, curX);
    });
    
    globalY += rowMaxH + CONFIG.ROW_GAP;
  });

  // 6. 计算边界
  const allBoxes = Object.values(boxMap);
  const width = Math.max(globalMaxW, 800);
  const height = globalY + 40;

  // 7. 计算关系连线
  const lines: Line[] = relations.map(r => {
    const from = boxMap[r.from];
    const to = boxMap[r.to];
    if (!from || !to) return null;

    let fx: number, fy: number, tx: number, ty: number;

    // 计算连接点 - 选择最近的边
    const fromCx = from.x + from.w / 2;
    const fromCy = from.y + from.h / 2;
    const toCx = to.x + to.w / 2;
    const toCy = to.y + to.h / 2;
    
    const dx = toCx - fromCx;
    const dy = toCy - fromCy;
    
    // 继承/实现：从底部到顶部
    if (r.type === 'extends' || r.type === 'implements') {
      if (dy > 0) {
        // to 在 from 下方
        fx = fromCx; fy = from.y + from.h;
        tx = toCx; ty = to.y;
      } else {
        // to 在 from 上方
        fx = fromCx; fy = from.y;
        tx = toCx; ty = to.y + to.h;
      }
    } else {
      // 其他关系：找最近的边
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

/** 包内类排序（父类优先） */
function sortClassesInPackage(
  classNames: string[],
  parentOf: Record<string, string>,
  childrenOf: Record<string, string[]>
): string[] {
  const visited = new Set<string>();
  const result: string[] = [];
  const classSet = new Set(classNames);
  
  function visit(name: string) {
    if (visited.has(name)) return;
    visited.add(name);
    
    // 先访问父类（如果在同一个包内）
    const parent = parentOf[name];
    if (parent && classSet.has(parent)) {
      visit(parent);
    }
    
    result.push(name);
    
    // 再访问子类
    (childrenOf[name] || []).forEach(child => {
      if (classSet.has(child)) visit(child);
    });
  }
  
  classNames.forEach(name => visit(name));
  return result;
}

/** 计算包内网格布局尺寸 */
function calculatePackageLayout(boxes: Box[], gapX: number, gapY: number): { width: number; height: number } {
  if (boxes.length === 0) return { width: 0, height: 0 };
  
  // 使用紧凑的网格布局
  const cols = Math.ceil(Math.sqrt(boxes.length));
  let maxRowW = 0;
  let totalH = 0;
  
  for (let i = 0; i < boxes.length; i += cols) {
    const rowBoxes = boxes.slice(i, i + cols);
    const rowW = rowBoxes.reduce((sum, b) => sum + b.w, 0) + (rowBoxes.length - 1) * gapX;
    const rowH = Math.max(...rowBoxes.map(b => b.h));
    maxRowW = Math.max(maxRowW, rowW);
    totalH += rowH + (i > 0 ? gapY : 0);
  }
  
  return { width: maxRowW, height: totalH };
}

/** 在包内放置类框 */
function layoutBoxesInPackage(boxes: Box[], startX: number, startY: number, gapX: number, gapY: number): void {
  if (boxes.length === 0) return;
  
  const cols = Math.ceil(Math.sqrt(boxes.length));
  let curX = startX;
  let curY = startY;
  let rowMaxH = 0;
  
  boxes.forEach((box, i) => {
    const col = i % cols;
    if (col === 0 && i > 0) {
      curX = startX;
      curY += rowMaxH + gapY;
      rowMaxH = 0;
    }
    
    box.x = curX;
    box.y = curY;
    curX += box.w + gapX;
    rowMaxH = Math.max(rowMaxH, box.h);
  });
}