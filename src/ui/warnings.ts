/**
 * 解析警告条渲染：把诊断信息格式化成 HTML 片段。
 * 纯函数，不碰 DOM，便于单测（返回 '' 表示无警告）。
 */

import { escHtml } from './dom';

export interface WarningInput {
  /** 解析失败的文件（语法错误 / 解析异常） */
  failures: { name: string; message: string }[];
  /** 跨包同名类（已按包区分，仍提示用户） */
  duplicates: { name: string; packages: string[] }[];
  /** 无法确定目标的引用（没提供 import），已连接到全部候选 */
  ambiguous: { from: string; to: string; candidates: string[] }[];
}

const list = (items: string[]) =>
  '<ul>' + items.map(i => `<li>${i}</li>`).join('') + '</ul>';

export function formatWarnings({ failures, duplicates, ambiguous }: WarningInput): string {
  if (failures.length === 0 && duplicates.length === 0 && ambiguous.length === 0) return '';

  const sections: string[] = [];

  if (failures.length > 0) {
    sections.push(
      `<div class="warn-title">⚠ ${failures.length} 个文件解析失败（其余文件已正常解析）</div>` +
      list(failures.map(f => `<code>${escHtml(f.name)}</code>：${escHtml(f.message)}`)),
    );
  }

  if (duplicates.length > 0) {
    sections.push(
      `<div class="warn-title">⚠ ${duplicates.length} 个类名在多个包中定义（已按包分别绘制）</div>` +
      list(duplicates.map(d =>
        `<code>${escHtml(d.name)}</code>：${d.packages.map(p => `<code>${escHtml(p)}</code>`).join('、')}`,
      )),
    );
  }

  if (ambiguous.length > 0) {
    sections.push(
      `<div class="warn-title">⚠ ${ambiguous.length} 处引用无法确定目标（未提供 import，已连接到全部候选）</div>` +
      list(ambiguous.map(a =>
        `<code>${escHtml(a.from)}</code> → <code>${escHtml(a.to)}</code>：候选 ` +
        a.candidates.map(p => `<code>${escHtml(p)}</code>`).join('、'),
      )),
    );
  }

  return sections.join('');
}
