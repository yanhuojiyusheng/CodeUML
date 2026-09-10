/** 关系的强弱分级与显示模式（纯逻辑，无 DOM） */

import { RelationType } from './types';

/** 关系强弱分级：数字越大关系越强 */
export const RELATION_STRENGTH: Record<RelationType, number> = {
  extends: 6,
  implements: 5,
  composition: 4,
  aggregation: 3,
  association: 2,
  dependency: 1,
};

/** 三种显示模式：全部 / 忽略最弱两种 / 只保留最强两种 */
export const RELATION_MODES = [
  { label: '全部', minStrength: 0 },
  { label: '较强', minStrength: 3 }, // 忽略 dependency + association
  { label: '最强', minStrength: 5 }, // 忽略 dependency + association + aggregation + composition
] as const;

export type RelationModeIndex = 0 | 1 | 2;

/** 按显示模式过滤关系/连线 */
export function filterRelationsByMode<T extends { type: RelationType }>(items: T[], mode: number): T[] {
  const min = RELATION_MODES[mode]?.minStrength ?? 0;
  return items.filter(r => RELATION_STRENGTH[r.type] >= min);
}
