/** 成员筛选 - 布局（算高度）与渲染（画内容）共用的唯一规则 */

import { Member } from './types';

export interface DisplaySelection {
  /** 实际要显示的成员 */
  filtered: Member[];
  /** 是否还有被折叠的成员 */
  hasMore: boolean;
}

/**
 * 选择要显示的属性：优先必需属性（非 `?`），不足时用可选属性补齐。
 */
export function selectVisibleProperties(members: Member[], maxCount: number): DisplaySelection {
  if (members.length <= maxCount) {
    return { filtered: members, hasMore: false };
  }

  const required = members.filter(m => !m.name.includes('?'));
  const optional = members.filter(m => m.name.includes('?'));
  const filtered = (required.length >= maxCount
    ? required.slice(0, maxCount)
    : [...required, ...optional].slice(0, maxCount)
  );

  return { filtered, hasMore: true };
}

/**
 * 选择要显示的方法：优先公共 / 静态成员，不足时用其余成员补齐。
 */
export function selectVisibleMethods(members: Member[], maxCount: number): DisplaySelection {
  if (members.length <= maxCount) {
    return { filtered: members, hasMore: false };
  }

  const important = members.filter(m => m.isStatic || m.modifier === '+');
  const remaining = members.filter(m => !m.isStatic && m.modifier !== '+');
  const filtered = (important.length >= maxCount
    ? important.slice(0, maxCount)
    : [...important, ...remaining].slice(0, maxCount)
  );

  return { filtered, hasMore: true };
}
