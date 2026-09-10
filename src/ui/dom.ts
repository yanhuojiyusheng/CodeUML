/** DOM 工具：元素获取与 HTML 转义 */

/** 安全获取 DOM 元素（找不到直接抛错，便于暴露模板缺元素的问题） */
export function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Element #${id} not found`);
  return el as T;
}

/** HTML 文本转义 */
export function escHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** HTML 属性转义 */
export function escAttr(s: string): string {
  return escHtml(s).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
