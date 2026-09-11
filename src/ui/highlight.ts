/** 类图高亮：双击关系线 / 单击类框 */

import { Diagram, Line, RelationType } from '../core/types';
import { distanceToSegment, relationKey } from '../core/utils';
import { RELATION_STRENGTH } from '../core/relations';

export interface Highlighter {
  /** 当前高亮的关系 key（渲染时传入 renderSVG） */
  readonly relationKey: string | null;
  /** 重新渲染后同步高亮状态，并清除已不存在的高亮目标 */
  sync(diagram: Diagram): void;
}

/** 命中容差（屏幕像素）：不随缩放变化，所以任何缩放下手感一致 */
const HIT_TOLERANCE_PX = 10;

export function createHighlighter(diagramEl: HTMLElement): Highlighter {
  // 当前高亮的关系（双击连接线时设置）
  let highlightedRelationKey: string | null = null;
  // 当前选中的类（单击类框时设置）
  let selectedClassName: string | null = null;
  // 当前显示的关系线段，用于几何命中（渲染时无命中热区元素，靠算距离）
  let segments: Line[] = [];

  /** 将高亮状态应用到已渲染的 SVG（关系线 + 关联类框） */
  function apply() {
    const relationEls = diagramEl.querySelectorAll<SVGGElement>('g.relation');
    const boxEls = diagramEl.querySelectorAll<SVGGElement>('g.class-box');

    // 先重置所有高亮
    relationEls.forEach(g => {
      g.classList.remove('highlighted', 'incoming', 'outgoing');
      g.style.removeProperty('--hl-width');
      g.style.removeProperty('--hl-opacity');
    });
    boxEls.forEach(b => b.classList.remove('highlighted', 'incoming', 'outgoing', 'selected'));

    // 模式一：双击连接线，高亮该线及两端类（橙色）
    if (highlightedRelationKey) {
      let fromName = '';
      let toName = '';
      relationEls.forEach(g => {
        if (g.dataset.key === highlightedRelationKey) {
          g.classList.add('highlighted');
          fromName = g.dataset.from || '';
          toName = g.dataset.to || '';
        }
      });
      boxEls.forEach(b => {
        const name = b.dataset.name || '';
        if (name && (name === fromName || name === toName)) b.classList.add('highlighted');
      });
      return;
    }

    // 模式二：单击类框，高亮其所有连接
    if (!selectedClassName) return;

    const boxMap = new Map<string, SVGGElement>();
    boxEls.forEach(b => {
      const name = b.dataset.name || '';
      if (name) boxMap.set(name, b);
    });
    boxMap.get(selectedClassName)?.classList.add('selected');

    relationEls.forEach(g => {
      const from = g.dataset.from || '';
      const to = g.dataset.to || '';
      const isOutgoing = from === selectedClassName;
      const isIncoming = to === selectedClassName;
      if (!isOutgoing && !isIncoming) return;

      // 发出的用橙色，连入的用蓝色
      if (isOutgoing) g.classList.add('outgoing');
      if (isIncoming) g.classList.add('incoming');

      // 连接越强，线越粗越亮
      const type = (g.dataset.key || '').split('|')[1] || '';
      const strength = RELATION_STRENGTH[type as RelationType] ?? 1;
      g.style.setProperty('--hl-width', String(1.5 + strength * 0.5));
      g.style.setProperty('--hl-opacity', String(0.55 + strength * 0.075));

      // 对端类框跟随方向颜色
      const otherName = isOutgoing ? to : from;
      const otherBox = boxMap.get(otherName);
      if (otherBox) {
        if (isOutgoing) otherBox.classList.add('outgoing');
        if (isIncoming) otherBox.classList.add('incoming');
      }
    });
  }

  /** 客户端坐标 -> SVG 用户坐标 + 当前缩放倍数 */
  function toUserSpace(clientX: number, clientY: number): { x: number; y: number; scale: number } | null {
    const svg = diagramEl.querySelector('svg') as unknown as SVGSVGElement | null;
    if (!svg) return null;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const p = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
    // 屏幕像素 / 用户单位；用来把「屏幕容差」换算成用户单位容差
    const scale = Math.hypot(ctm.a, ctm.b) || 1;
    return { x: p.x, y: p.y, scale };
  }

  /**
   * 几何命中：返回离点击点最近、且在容差内的关系 key。
   * 标签本身不再渲染透明热区线，这里用点到线段的距离代替。
   * 等距时取后渲染的那条，与原先 DOM「上层优先」的语义一致。
   */
  function hitRelationAt(clientX: number, clientY: number): string | null {
    const pos = toUserSpace(clientX, clientY);
    if (!pos) return null;
    const tolerance = HIT_TOLERANCE_PX / pos.scale;

    let best: string | null = null;
    let bestDist = Infinity;
    for (const l of segments) {
      const d = distanceToSegment(pos.x, pos.y, l.fx, l.fy, l.tx, l.ty);
      if (d <= tolerance && d <= bestDist) {
        bestDist = d;
        best = relationKey(l);
      }
    }
    return best;
  }

  /** DOM 上直接点中（精确点在可见线上/箭头上）优先，否则退回几何命中 */
  function relationKeyFromEvent(e: MouseEvent): string | null {
    const target = e.target as Element | null;
    const relEl = target?.closest?.('.relation') as SVGGElement | null;
    if (relEl) return relEl.dataset.key ?? null;
    return hitRelationAt(e.clientX, e.clientY);
  }

  // 双击连接线 -> 高亮整条线及两端类框
  diagramEl.addEventListener('dblclick', (e) => {
    const key = relationKeyFromEvent(e as MouseEvent);
    if (!key) return;
    highlightedRelationKey = key;
    selectedClassName = null;
    apply();
  });

  // 单击：线 -> 取消高亮；类 -> 高亮该类所有连接；空白 -> 取消高亮
  diagramEl.addEventListener('click', (e) => {
    const me = e as MouseEvent;
    const target = me.target as Element | null;
    const classEl = target?.closest?.('.class-box') as SVGGElement | null;
    // 关系与类框重叠时保持原有语义：线画在框上层，所以先判关系
    const key = relationKeyFromEvent(me);

    if (key) {
      // 单击已高亮的线保持不变
      if (key === highlightedRelationKey) return;
      if (highlightedRelationKey || selectedClassName) {
        highlightedRelationKey = null;
        selectedClassName = null;
        apply();
      }
      return;
    }

    if (classEl) {
      // 双击类框时不切换选中，避免选/取消来回抵消
      if ((me.detail || 1) > 1) return;
      const name = classEl.dataset.name || '';
      if (!name) return;
      if (selectedClassName === name) {
        selectedClassName = null;
      } else {
        selectedClassName = name;
        highlightedRelationKey = null;
      }
      apply();
      return;
    }

    // 点击空白
    if (highlightedRelationKey || selectedClassName) {
      highlightedRelationKey = null;
      selectedClassName = null;
      apply();
    }
  });

  // 悬停光标提示：没有热区元素后，靠几何命中去切换手型（rAF 合并，拖动时不抢时间）
  let hoverFrame = 0;
  let hoverKey: string | null = null;
  diagramEl.addEventListener('mousemove', (e) => {
    if (diagramEl.classList.contains('panning')) return;
    const me = e as MouseEvent;
    if (hoverFrame) return;
    hoverFrame = requestAnimationFrame(() => {
      hoverFrame = 0;
      const key = hitRelationAt(me.clientX, me.clientY);
      if (key === hoverKey) return;
      hoverKey = key;
      diagramEl.classList.toggle('over-relation', key != null);
    });
  });
  diagramEl.addEventListener('mouseleave', () => {
    hoverKey = null;
    diagramEl.classList.remove('over-relation');
  });

  return {
    get relationKey() {
      return highlightedRelationKey;
    },
    sync(diagram: Diagram) {
      if (highlightedRelationKey && !diagram.lines.some(l => relationKey(l) === highlightedRelationKey)) {
        highlightedRelationKey = null;
      }
      if (selectedClassName && !diagram.boxes.some(b => b.name === selectedClassName)) {
        selectedClassName = null;
      }
      segments = diagram.lines; // 只命中"当前显示"的那些关系
      apply();
    },
  };
}
