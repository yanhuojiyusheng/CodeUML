/** 类图高亮：双击关系线 / 单击类框 */

import { Diagram, RelationType } from '../core/types';
import { relationKey } from '../core/utils';
import { RELATION_STRENGTH } from '../core/relations';

export interface Highlighter {
  /** 当前高亮的关系 key（渲染时传入 renderSVG） */
  readonly relationKey: string | null;
  /** 重新渲染后同步高亮状态，并清除已不存在的高亮目标 */
  sync(diagram: Diagram): void;
}

export function createHighlighter(diagramEl: HTMLElement): Highlighter {
  // 当前高亮的关系（双击连接线时设置）
  let highlightedRelationKey: string | null = null;
  // 当前选中的类（单击类框时设置）
  let selectedClassName: string | null = null;

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

  // 双击连接线 -> 高亮整条线及两端类框
  diagramEl.addEventListener('dblclick', (e) => {
    const target = e.target as Element | null;
    const relationEl = target?.closest?.('.relation') as SVGGElement | null;
    if (!relationEl) return;
    highlightedRelationKey = relationEl.dataset.key ?? null;
    selectedClassName = null;
    apply();
  });

  // 单击：线 -> 取消高亮；类 -> 高亮该类所有连接；空白 -> 取消高亮
  diagramEl.addEventListener('click', (e) => {
    const me = e as MouseEvent;
    const target = me.target as Element | null;
    const relationEl = target?.closest?.('.relation') as SVGGElement | null;
    const classEl = target?.closest?.('.class-box') as SVGGElement | null;

    if (relationEl) {
      // 单击已高亮的线保持不变
      if (relationEl.dataset.key === highlightedRelationKey) return;
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
      apply();
    },
  };
}
