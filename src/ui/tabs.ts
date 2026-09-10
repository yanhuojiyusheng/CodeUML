/** 文件标签管理 */

import { escAttr, escHtml } from './dom';

export interface SourceTab {
  id: string;
  name: string; // 包名
  content: string;
}

export interface TabsController {
  readonly tabs: SourceTab[];
  readonly activeTabId: string | null;
  getActive(): SourceTab | undefined;
  create(name: string, content: string): SourceTab;
  switchTo(id: string): void;
  close(id: string): void;
  /** 把编辑器当前内容写回活动标签 */
  syncActiveContent(): void;
  render(): void;
}

// 文件名最大长度，防止手误粘贴超长文本
const MAX_FILE_NAME_LENGTH = 400;

/** 生成唯一 ID */
function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

export function createTabsController(opts: {
  codeEl: HTMLTextAreaElement;
  fileTabsEl: HTMLElement;
  onChange: () => void;
}): TabsController {
  const { codeEl, fileTabsEl, onChange } = opts;

  const tabs: SourceTab[] = [];
  let activeTabId: string | null = null;
  let pendingSwitchTimer: number | undefined;

  function getActive(): SourceTab | undefined {
    return tabs.find(t => t.id === activeTabId);
  }

  /** 保存编辑器当前内容 */
  function syncActiveContent() {
    const current = getActive();
    if (current) current.content = codeEl.value;
  }

  /** 切换标签 */
  function switchTo(id: string) {
    const tab = tabs.find(t => t.id === id);
    if (!tab) return;

    syncActiveContent();

    activeTabId = id;
    codeEl.value = tab.content;
    render();
    onChange();
  }

  /** 延迟切换标签，避免干扰双击重命名 */
  function scheduleSwitch(tabId: string) {
    if (pendingSwitchTimer) clearTimeout(pendingSwitchTimer);
    pendingSwitchTimer = window.setTimeout(() => {
      pendingSwitchTimer = undefined;
      switchTo(tabId);
    }, 200);
  }

  /** 渲染标签栏 */
  function render() {
    if (pendingSwitchTimer) {
      clearTimeout(pendingSwitchTimer);
      pendingSwitchTimer = undefined;
    }

    let html = tabs.map(tab => `
    <div class="file-tab ${tab.id === activeTabId ? 'active' : ''}" data-id="${tab.id}">
      <span class="name" data-id="${tab.id}" title="${escAttr(tab.name)}（双击重命名）">${escHtml(tab.name)}</span>
      <span class="close" data-id="${tab.id}">×</span>
    </div>
  `).join('');

    // 添加新建按钮
    html += '<div class="file-tab add-tab" id="add-tab" title="新建空白文件">+</div>';

    fileTabsEl.innerHTML = html;

    fileTabsEl.querySelectorAll('.file-tab:not(.add-tab)').forEach(el => {
      el.addEventListener('click', (e) => {
        const me = e as MouseEvent;
        const target = me.target as HTMLElement;
        const closeBtn = target.closest('.close') as HTMLElement | null;
        if (closeBtn) {
          close(closeBtn.dataset.id!);
          return;
        }
        const tabId = el.getAttribute('data-id')!;
        const nameEl = target.closest('.name') as HTMLElement | null;
        const isActive = el.classList.contains('active');

        if (me.detail === 2 && nameEl) {
          // 双击文件名 -> 重命名，并取消延迟切换
          if (pendingSwitchTimer) {
            clearTimeout(pendingSwitchTimer);
            pendingSwitchTimer = undefined;
          }
          startRename(tabId, nameEl);
          return;
        }

        // 当前标签单击无需切换；非当前标签延迟切换
        if (!isActive) scheduleSwitch(tabId);
      });
    });

    // 新建按钮事件
    fileTabsEl.querySelector('#add-tab')?.addEventListener('click', () => {
      const count = tabs.length + 1;
      create(`file${count}`, '// 新文件\n');
    });
  }

  /** 开始重命名 */
  function startRename(tabId: string, nameEl: HTMLElement) {
    const tab = tabs.find(t => t.id === tabId);
    if (!tab) return;

    const input = document.createElement('input');
    input.type = 'text';
    input.value = tab.name;
    input.maxLength = MAX_FILE_NAME_LENGTH;
    input.style.cssText = 'background:#1e1e1e;color:#fff;border:1px solid #0078d4;padding:2px 6px;font-size:12px;flex:1;min-width:0;width:100%;box-sizing:border-box;outline:none;';

    nameEl.replaceWith(input);
    input.focus();
    input.select();

    const save = () => {
      const newName = input.value.trim().slice(0, MAX_FILE_NAME_LENGTH);
      if (newName && newName !== tab.name) {
        tab.name = newName;
        onChange();
      }
      render();
    };

    input.addEventListener('blur', save);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') save();
      if (e.key === 'Escape') render();
    });
  }

  /** 创建新文件标签 */
  function create(name: string, content: string): SourceTab {
    const safeName = name.slice(0, MAX_FILE_NAME_LENGTH);
    const tab: SourceTab = { id: generateId(), name: safeName, content };
    tabs.push(tab);
    render();
    switchTo(tab.id);
    return tab;
  }

  /** 关闭标签 */
  function close(id: string) {
    const index = tabs.findIndex(t => t.id === id);
    if (index === -1) return;

    tabs.splice(index, 1);

    // 如果删除完了，创建一个空白文件
    if (tabs.length === 0) {
      create('untitled', '// 新文件\n');
      return;
    }

    if (activeTabId === id) {
      const newIndex = Math.min(index, tabs.length - 1);
      switchTo(tabs[newIndex].id);
    } else {
      render();
      onChange();
    }
  }

  return {
    get tabs() { return tabs; },
    get activeTabId() { return activeTabId; },
    getActive,
    create,
    switchTo,
    close,
    syncActiveContent,
    render,
  };
}
