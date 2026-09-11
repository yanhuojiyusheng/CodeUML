/**
 * 解析警告的格式化与指纹（纯函数，不碰 DOM，便于单测）。
 *
 * - formatWarningSummary：折叠状态下显示的一行摘要
 * - formatWarnings：展开后的明细 HTML（返回 '' 表示无警告）
 * - warningSignature：内容指纹，用来判断"是否需要重新弹出被关闭的提示条"
 */

import { escHtml } from './dom';

export interface WarningInput {
  /** 语义解析整块不可用（模块解析失败）——会让跨文件引用退化为歧义 */
  resolutionError?: string;
  /** 解析失败的文件（语法错误 / 解析异常） */
  failures: { name: string; message: string }[];
  /** 跨包同名类（已按包区分，仍提示用户） */
  duplicates: { name: string; packages: string[] }[];
  /** 无法确定目标的引用（没提供 import），已连接到全部候选 */
  ambiguous: { file: string; from: string; to: string; candidates: string[] }[];
}

/** 警告分类的 key（与 DOM 上的 data-section 对应） */
export type WarningSectionKey = 'resolution' | 'failures' | 'ambiguous' | 'duplicates';

const hasWarnings = (w: WarningInput) =>
  Boolean(w.resolutionError) || w.failures.length > 0 || w.duplicates.length > 0 || w.ambiguous.length > 0;

/** 是否需要用户处理（语义解析不可用 / 解析失败 / 歧义引用）。重名只是告知。 */
export function hasProblems(w: WarningInput): boolean {
  return Boolean(w.resolutionError) || w.failures.length > 0 || w.ambiguous.length > 0;
}

/** 各分类的默认折叠状态：⚠ 问题展开，ℹ 提示（重名）收起 */
export function defaultCollapsedSections(w: WarningInput): Set<WarningSectionKey> {
  const collapsed = new Set<WarningSectionKey>();
  if (w.duplicates.length > 0) collapsed.add('duplicates');
  return collapsed;
}

/**
 * 一行摘要。分两级：
 *   ⚠ 问题（解析失败 / 歧义引用）—— 需要处理
 *   ℹ 提示（类名在多个包中定义）—— 只是告知，不影响关系正确性
 * 无警告返回 ''。
 */
export function formatWarningSummary(w: WarningInput): string {
  const problems: string[] = [];
  if (w.resolutionError) problems.push('语义解析不可用');
  if (w.failures.length > 0) problems.push(`${w.failures.length} 个文件解析失败`);
  if (w.ambiguous.length > 0) problems.push(`${w.ambiguous.length} 处歧义引用`);

  const notices: string[] = [];
  if (w.duplicates.length > 0) notices.push(`${w.duplicates.length} 个类名重复`);

  const parts: string[] = [];
  if (problems.length > 0) parts.push(`⚠ ${problems.join(' · ')}`);
  if (notices.length > 0) parts.push(`ℹ ${notices.join(' · ')}`);
  return parts.join(' · ');
}

/** 内容指纹：内容变了才重新显示被用户关掉的提示条；无警告返回 '' */
export function warningSignature(w: WarningInput): string {
  if (!hasWarnings(w)) return '';
  return JSON.stringify([w.failures, w.duplicates, w.ambiguous]);
}

const list = (items: string[]) =>
  '<ul>' + items.map(i => `<li>${i}</li>`).join('') + '</ul>';

/** 明细 HTML；无警告返回 ''。问题（⚠）排在提示（ℹ）之前，每一类各自可折叠 */
export function formatWarnings(
  w: WarningInput,
  collapsed: ReadonlySet<WarningSectionKey> = new Set(),
): string {
  if (!hasWarnings(w)) return '';

  const sections: string[] = [];

  const section = (
    key: WarningSectionKey,
    severity: 'problem' | 'notice',
    title: string,
    items: string[],
  ) => {
    const isCollapsed = collapsed.has(key);
    const classes = ['warn-section'];
    if (severity === 'notice') classes.push('notice');
    if (isCollapsed) classes.push('collapsed');
    const icon = severity === 'notice' ? 'ℹ' : '⚠';
    // 整行都是开关，点哪里都能折叠
    sections.push(
      `<div class="${classes.join(' ')}" data-section="${key}">` +
        `<button type="button" class="warn-section-toggle" title="${isCollapsed ? '展开' : '折叠'}">` +
          `${isCollapsed ? '▸' : '▾'} <span class="warn-section-title">${icon} ${title}</span>` +
        '</button>' +
        list(items) +
      '</div>',
    );
  };

  if (w.resolutionError) {
    section('resolution', 'problem', '语义解析不可用（跨文件引用会退化为歧义）',
      [`<code>${escHtml(w.resolutionError)}</code>`],
    );
  }

  if (w.failures.length > 0) {
    section('failures', 'problem', '解析失败（其余文件已正常解析）',
      w.failures.map(f => `<code>${escHtml(f.name)}</code>：${escHtml(f.message)}`),
    );
  }

  if (w.ambiguous.length > 0) {
    section('ambiguous', 'problem', '引用无法确定目标（未提供 import，已连接到全部候选）',
      w.ambiguous.map(a =>
        `<code>${escHtml(a.file)}</code> 中的 <code>${escHtml(a.from)}</code> → <code>${escHtml(a.to)}</code>：候选 ` +
        a.candidates.map(p => `<code>${escHtml(p)}</code>`).join('、'),
      ),
    );
  }

  if (w.duplicates.length > 0) {
    section('duplicates', 'notice', '类名在多个包中定义（已按包分别绘制，引用按所在文件的 import 精确解析）',
      w.duplicates.map(d =>
        `<code>${escHtml(d.name)}</code>：${d.packages.map(p => `<code>${escHtml(p)}</code>`).join('、')}`,
      ),
    );
  }

  return sections.join('');
}
