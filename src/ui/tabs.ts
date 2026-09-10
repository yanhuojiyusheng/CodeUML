/** 文件标签管理（支持文件夹分组） */

import { escAttr, escHtml } from './dom';

export interface SourceTab {
  id: string;
  folder: string; // '' 表示根目录，否则形如 'src/models'
  name: string;   // 文件名（不含路径）
  content: string;
}

/** 包名 = 文件夹路径 + 文件名 */
export function packageName(tab: Pick<SourceTab, 'folder' | 'name'>): string {
  return tab.folder ? `${tab.folder}/${tab.name}` : tab.name;
}

export interface TabsController {
  readonly tabs: SourceTab[];
  readonly activeTabId: string | null;
  getActive(): SourceTab | undefined;
  create(name: string, content: string, folder?: string): SourceTab;
  createFolder(path: string): void;
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
  const manualFolders = new Set<string>(); // 新建的空文件夹
  const collapsed = new Set<string>();
  let activeTabId: string | null = null;
  let activeFolder = '';
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
    activeFolder = tab.folder;
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

  interface FolderNode {
    name: string;
    path: string;
    folders: Map<string, FolderNode>;
    files: SourceTab[];
  }

  /** 构建文件夹树（含隐式父级） */
  function buildTree(): FolderNode {
    const root: FolderNode = { name: '', path: '', folders: new Map(), files: [] };
    const ensure = (path: string): FolderNode => {
      let node = root;
      let acc = '';
      for (const seg of path.split('/')) {
        if (!seg) continue;
        acc = acc ? `${acc}/${seg}` : seg;
        let next = node.folders.get(seg);
        if (!next) {
          next = { name: seg, path: acc, folders: new Map(), files: [] };
          node.folders.set(seg, next);
        }
        node = next;
      }
      return node;
    };
    manualFolders.forEach(ensure);
    tabs.forEach(t => ensure(t.folder).files.push(t));
    return root;
  }

  /** 展开某路径的所有祖先文件夹（新建内容后保证可见） */
  function expandAncestors(path: string) {
    const parts = path.split('/');
    let acc = '';
    for (let i = 0; i < parts.length - 1; i++) {
      acc = acc ? `${acc}/${parts[i]}` : parts[i];
      collapsed.delete(acc);
    }
  }

  function fileRow(tab: SourceTab, depth: number): string {
    return `
      <div class="file-tab ${tab.id === activeTabId ? 'active' : ''}" data-id="${tab.id}" style="padding-left:${12 + depth * 14}px">
        <span class="name" data-id="${tab.id}" title="${escAttr(tab.name)}（双击重命名）">${escHtml(tab.name)}</span>
        <span class="close" data-id="${tab.id}">×</span>
      </div>`;
  }

  function folderRow(node: FolderNode, depth: number): string {
    const isCollapsed = collapsed.has(node.path);
    return `
      <div class="folder-row ${node.path === activeFolder ? 'active' : ''}" data-folder="${escAttr(node.path)}" title="${escAttr(node.path)}" style="padding-left:${10 + depth * 14}px">
        <span class="arrow">${isCollapsed ? '▸' : '▾'}</span>
        <span class="fname">📁 ${escHtml(node.name)}</span>
        ${node.files.length ? `<span class="count">${node.files.length}</span>` : ''}
        <span class="close" title="删除文件夹">×</span>
      </div>`;
  }

  /** 递归渲染文件夹树 */
  function renderNode(node: FolderNode, depth: number): string {
    let html = '';
    for (const child of [...node.folders.values()].sort((a, b) => a.name.localeCompare(b.name))) {
      html += folderRow(child, depth);
      if (!collapsed.has(child.path)) html += renderNode(child, depth + 1);
    }
    html += node.files.map(f => fileRow(f, depth)).join('');
    return html;
  }

  /** 渲染标签栏 */
  function render() {
    if (pendingSwitchTimer) {
      clearTimeout(pendingSwitchTimer);
      pendingSwitchTimer = undefined;
    }

    let html = `
      <div class="add-actions">
        <div class="file-tab add-tab" id="add-file" title="在${activeFolder ? ` 📁${escAttr(activeFolder)} ` : '根目录'}新建文件">+ 文件</div>
        <div class="file-tab add-tab" id="add-folder" title="在${activeFolder ? ` 📁${escAttr(activeFolder)} ` : '根目录'}新建子文件夹">+ 文件夹</div>
      </div>`;
    html += renderNode(buildTree(), 0);

    fileTabsEl.innerHTML = html;

    fileTabsEl.querySelectorAll('.folder-row').forEach(el => {
      const folder = el.getAttribute('data-folder')!;
      el.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        if (target.closest('.close')) {
          deleteFolder(folder);
          return;
        }
        if (target.closest('.arrow')) {
          collapsed.has(folder) ? collapsed.delete(folder) : collapsed.add(folder);
          render();
          return;
        }
        // 只选中；状态未变时不重绘，否则会打断双击重命名
        if (activeFolder !== folder) {
          activeFolder = folder;
          render();
        }
      });
      el.addEventListener('dblclick', (e) => {
        const nameEl = (e.target as HTMLElement).closest('.fname') as HTMLElement | null;
        if (nameEl) startRenameFolder(folder, nameEl);
      });
    });

    fileTabsEl.querySelectorAll('.file-tab[data-id]').forEach(el => {
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
          if (pendingSwitchTimer) {
            clearTimeout(pendingSwitchTimer);
            pendingSwitchTimer = undefined;
          }
          startRename(tabId, nameEl);
          return;
        }

        if (!isActive) scheduleSwitch(tabId);
      });
    });

    fileTabsEl.querySelector('#add-file')?.addEventListener('click', () => {
      create(nextFileName(activeFolder), '// 新文件\n', activeFolder);
    });
    fileTabsEl.querySelector('#add-folder')?.addEventListener('click', () => {
      const input = window.prompt(activeFolder ? `在 📁${activeFolder} 下新建子文件夹名` : '新建文件夹名');
      if (!input) return;
      createFolder(input.slice(0, MAX_FILE_NAME_LENGTH));
    });
  }

  /** 在文件夹内生成不重名的文件名 */
  function nextFileName(folder: string): string {
    let n = 1;
    let name = 'file';
    while (tabs.some(t => t.folder === folder && t.name === name)) {
      n++;
      name = `file${n}`;
    }
    return name;
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

  /** 重命名文件夹（连同其所有子文件夹与文件一起移动） */
  function startRenameFolder(folder: string, nameEl: HTMLElement) {
    const node = folder.split('/').pop() || folder;

    const input = document.createElement('input');
    input.type = 'text';
    input.value = node;
    input.maxLength = MAX_FILE_NAME_LENGTH;
    input.style.cssText = 'background:#fff;color:#333;border:1px solid #0078d4;padding:2px 6px;font-size:12px;flex:1;min-width:0;width:100%;box-sizing:border-box;outline:none;';

    nameEl.replaceWith(input);
    input.focus();
    input.select();

    const save = () => {
      const name = input.value.trim().replace(/^\/+|\/+$/g, '');
      if (name && name !== node) renameFolder(folder, name);
      else render();
    };

    input.addEventListener('blur', save);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') save();
      if (e.key === 'Escape') render();
    });
  }

  function renameFolder(oldPath: string, newName: string) {
    const parent = oldPath.includes('/') ? oldPath.slice(0, oldPath.lastIndexOf('/')) : '';
    const newPath = parent ? `${parent}/${newName}` : newName;
    if (newPath === oldPath) return;

    const prefix = `${oldPath}/`;
    const inside = (p: string) => p === oldPath || p.startsWith(prefix);
    const move = (p: string) => newPath + p.slice(oldPath.length);

    [...manualFolders].filter(inside).forEach(f => { manualFolders.delete(f); manualFolders.add(move(f)); });
    tabs.forEach(t => { if (inside(t.folder)) t.folder = move(t.folder); });
    [...collapsed].filter(inside).forEach(f => { collapsed.delete(f); collapsed.add(move(f)); });
    if (inside(activeFolder)) activeFolder = move(activeFolder);

    render();
    onChange();
  }

  /** 删除文件夹及其全部内容 */
  function deleteFolder(folder: string) {
    const prefix = `${folder}/`;
    const inside = (p: string) => p === folder || p.startsWith(prefix);
    const affected = tabs.filter(t => inside(t.folder));
    const subfolders = [...manualFolders].filter(inside);

    if ((affected.length || subfolders.length) &&
        !window.confirm(`删除文件夹「${folder}」及其所有内容？`)) return;

    affected.forEach(t => {
      const i = tabs.indexOf(t);
      if (i >= 0) tabs.splice(i, 1);
    });
    subfolders.forEach(f => manualFolders.delete(f));
    [...collapsed].filter(inside).forEach(f => collapsed.delete(f));
    if (inside(activeFolder)) activeFolder = '';

    if (tabs.length === 0) {
      activeTabId = null;
      create('untitled', '// 新文件\n', '');
      return;
    }
    if (!tabs.some(t => t.id === activeTabId)) {
      switchTo(tabs[0].id);
      return;
    }
    render();
    onChange();
  }

  /** 创建新文件 */
  function create(name: string, content: string, folder = activeFolder): SourceTab {
    const tab: SourceTab = {
      id: generateId(),
      folder,
      name: name.slice(0, MAX_FILE_NAME_LENGTH),
      content,
    };
    tabs.push(tab);
    expandAncestors(folder);
    render();
    switchTo(tab.id);
    return tab;
  }

  /** 新建（空）文件夹：作为当前文件夹的子文件夹 */
  function createFolder(name: string) {
    const segment = name.trim().replace(/^\/+|\/+$/g, '');
    if (!segment) return;
    const path = activeFolder ? `${activeFolder}/${segment}` : segment;
    manualFolders.add(path);
    expandAncestors(path);
    collapsed.delete(path);
    activeFolder = path;
    render();
  }

  /** 关闭标签 */
  function close(id: string) {
    const index = tabs.findIndex(t => t.id === id);
    if (index === -1) return;

    tabs.splice(index, 1);

    if (tabs.length === 0) {
      create('untitled', '// 新文件\n', '');
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
    createFolder,
    switchTo,
    close,
    syncActiveContent,
    render,
  };
}
