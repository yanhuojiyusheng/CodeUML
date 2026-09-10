/** 主入口：只负责组装 core 能力与 ui 交互，并启动应用 */

import { parseFilesWithCrossFileTypes, mergeParsedData } from './core/merge';
import { layoutDiagram, setLayoutConfig } from './core/layout';
import { renderSVG, setDisplayConfig } from './core/svg';
import { generateDrawioXML } from './core/drawio';
import { formatMergedPlantUML } from './core/plantuml';
import { RELATION_MODES, filterRelationsByMode } from './core/relations';
import { ParsedData } from './core/types';

import { byId } from './ui/dom';
import { createTabsController, packageName } from './ui/tabs';
import { createHighlighter } from './ui/highlight';
import { createSplitPanes } from './ui/panes';
import { createExportActions } from './ui/actions';
import { createZoom, createPan } from './ui/zoom';
import { DEFAULT_CODE, DEFAULT_CODE_2, DEFAULT_CODE_3 } from './ui/samples';

// ---------------- DOM 元素 ----------------
const codeEl = byId<HTMLTextAreaElement>('code');
const diagramEl = byId<HTMLDivElement>('diagram-view');
const xmlOutputEl = byId<HTMLTextAreaElement>('xml-output');
const parsedOutputEl = byId<HTMLTextAreaElement>('parsed-output');
const editorPane = byId<HTMLDivElement>('editor-pane');
const fileTabsEl = byId<HTMLDivElement>('file-tabs');
const fileSidebarEl = byId<HTMLDivElement>('file-sidebar');
const sidebarToggle = byId<HTMLButtonElement>('sidebar-toggle');
const foldToggleBtn = byId<HTMLButtonElement>('fold-toggle');
const sidebarResizer = byId<HTMLDivElement>('sidebar-resizer');
const rightPane = byId<HTMLDivElement>('right-pane');
const dividerEl = byId<HTMLDivElement>('divider');
const maxPropsEl = byId<HTMLInputElement>('max-props');
const maxMethodsEl = byId<HTMLInputElement>('max-methods');
const relationModeBtn = byId<HTMLButtonElement>('relation-mode-btn');
const zoomLevelEl = byId<HTMLSpanElement>('zoom-level');
const zoomInBtn = byId<HTMLButtonElement>('zoom-in');
const zoomOutBtn = byId<HTMLButtonElement>('zoom-out');
const zoomResetBtn = byId<HTMLButtonElement>('zoom-reset');

// ---------------- 状态 ----------------
let relationMode = 0;

const highlighter = createHighlighter(diagramEl);

const zoom = createZoom({
  diagramEl,
  levelEl: zoomLevelEl,
  inBtn: zoomInBtn,
  outBtn: zoomOutBtn,
  resetBtn: zoomResetBtn,
});

createPan(diagramEl);

// ---------------- 解析调度 ----------------
/** 合并所有文件的解析结果（跨文件类型感知） */
function mergeAllParsed(): Map<string, ParsedData> {
  tabsController.syncActiveContent();
  return parseFilesWithCrossFileTypes(
    tabsController.tabs.map(tab => ({ name: packageName(tab), content: tab.content }))
  );
}

/** 更新所有视图（合并视图） */
function updateAll() {
  try {
    const allParsed = mergeAllParsed();
    const { merged, classPackageMap } = mergeParsedData(allParsed);

    const diagram = layoutDiagram(merged);

    // 图表显示按当前关系模式过滤，XML/PlantUML 保留全量
    const displayDiagram = { ...diagram, lines: filterRelationsByMode(diagram.lines, relationMode) };
    diagramEl.innerHTML = renderSVG(displayDiagram, highlighter.relationKey);
    highlighter.sync(displayDiagram);
    zoom.apply();

    xmlOutputEl.value = generateDrawioXML(diagram);
    parsedOutputEl.value = formatMergedPlantUML(allParsed, classPackageMap);
  } catch (e: unknown) {
    console.error('解析错误:', e);
  }
}

// 解析去抖：连续变更（如批量拖入文件）只触发一次全量解析
let updateTimer: number | undefined;
function scheduleUpdate() {
  clearTimeout(updateTimer);
  updateTimer = window.setTimeout(updateAll, 250);
}

const tabsController = createTabsController({
  codeEl,
  fileTabsEl,
  onChange: scheduleUpdate,
});

const exportActions = createExportActions({
  diagramEl,
  mergeAllParsed,
});

// ---------------- 顶部控件 ----------------
foldToggleBtn.addEventListener('click', () => tabsController.toggleAllFolders());

relationModeBtn.addEventListener('click', () => {
  relationMode = (relationMode + 1) % RELATION_MODES.length;
  relationModeBtn.textContent = `关系: ${RELATION_MODES[relationMode].label}`;
  updateAll();
});

maxPropsEl.addEventListener('change', () => {
  const val = parseInt(maxPropsEl.value) || 8;
  setDisplayConfig({ MAX_PROPS: val });
  setLayoutConfig({ MAX_PROPS: val });
  updateAll();
});

maxMethodsEl.addEventListener('change', () => {
  const val = parseInt(maxMethodsEl.value) || 8;
  setDisplayConfig({ MAX_METHODS: val });
  setLayoutConfig({ MAX_METHODS: val });
  updateAll();
});

// ---------------- 导出（供 HTML onclick 调用） ----------------
declare global {
  interface Window {
    exportDrawio: () => void;
    exportSVG: () => void;
    exportPlantUML: () => void;
  }
}
window.exportDrawio = exportActions.exportDrawio;
window.exportSVG = exportActions.exportSVG;
window.exportPlantUML = exportActions.exportPlantUML;

// ---------------- 视图标签切换 ----------------
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');

    const viewId = tab.getAttribute('data-view') + '-view';
    document.querySelectorAll('#diagram-view, #xml-view, #parsed-view').forEach(v => v.classList.remove('active'));
    document.getElementById(viewId)?.classList.add('active');
  });
});

// ---------------- 拖放 .ts / .tsx 文件 ----------------
editorPane.addEventListener('dragover', (e) => {
  e.preventDefault();
  editorPane.classList.add('drag-over');
});

editorPane.addEventListener('dragleave', () => {
  editorPane.classList.remove('drag-over');
});

editorPane.addEventListener('drop', async (e) => {
  e.preventDefault();
  editorPane.classList.remove('drag-over');

  const dt = e.dataTransfer;
  if (!dt) return;

  // 优先用 entry API，这样拖入整个文件夹也能读取
  const entries: FileSystemEntry[] = [];
  for (const item of Array.from(dt.items || [])) {
    if (item.kind !== 'file') continue;
    const entry = item.webkitGetAsEntry?.();
    if (entry) entries.push(entry);
  }

  // 边读取边分块加入：读到的先显示，不阻塞后续读取
  const CHUNK = 25;
  const buffer: { name: string; content: string; folder: string }[] = [];
  let firstId: string | undefined;
  const flush = () => {
    if (!buffer.length) return;
    const added = tabsController.addTabs(buffer.splice(0));
    if (!firstId) firstId = added[0]?.id;
  };

  if (entries.length) {
    for (const entry of entries) {
      await collectTsFiles(entry, (path, content) => {
        const { folder, name } = splitTsPath(path);
        buffer.push({ name, content, folder });
        if (buffer.length >= CHUNK) flush();
      });
    }
  } else {
    // 回退：普通文件列表（无 entry API 的浏览器）
    for (const file of Array.from(dt.files)) {
      if (!/\.tsx?$/.test(file.name)) {
        console.warn(`跳过非 TypeScript 文件: ${file.name}`);
        continue;
      }
      buffer.push({ name: file.name.replace(/\.tsx?$/, ''), content: await file.text(), folder: '' });
      if (buffer.length >= CHUNK) flush();
    }
  }

  flush();
  if (firstId) tabsController.switchTo(firstId);
});

/** 拖入时忽略的目录 */
const SKIP_DIRS = new Set(['dist', 'node_modules']);

/** 递归收集拖入文件夹中的 .ts/.tsx（每读到一个就回调，边读边加；跳过 dist / node_modules） */
async function collectTsFiles(entry: FileSystemEntry, onFile: (path: string, content: string) => void): Promise<void> {
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject));
    if (/\.tsx?$/.test(file.name)) {
      onFile(entry.fullPath.replace(/^\//, ''), await file.text());
    }
    return;
  }
  if (entry.isDirectory) {
    if (SKIP_DIRS.has(entry.name)) return; // 整个目录跳过
    for (const child of await readAllEntries((entry as FileSystemDirectoryEntry).createReader())) {
      await collectTsFiles(child, onFile);
    }
  }
}

function readAllEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => {
    const all: FileSystemEntry[] = [];
    const next = () => reader.readEntries(batch => {
      if (!batch.length) return resolve(all);
      all.push(...batch);
      next();
    }, reject);
    next();
  });
}

/** 'src/models/user.ts' -> { folder: 'src/models', name: 'user' } */
function splitTsPath(p: string): { folder: string; name: string } {
  const parts = p.split('/');
  const name = (parts.pop() || 'untitled').replace(/\.tsx?$/, '');
  return { folder: parts.join('/'), name };
}

// ---------------- 代码输入 ----------------
codeEl.addEventListener('input', scheduleUpdate);

// ---------------- 分栏拖拽 ----------------
createSplitPanes({
  rightPane,
  divider: dividerEl,
  fileSidebar: fileSidebarEl,
  sidebarResizer,
  sidebarToggle,
});

// ---------------- 初始化：加载示例 ----------------
tabsController.create('models', DEFAULT_CODE);
tabsController.create('services', DEFAULT_CODE_2);
tabsController.create('utils', DEFAULT_CODE_3);
