/** 主入口：只负责组装 core 能力与 ui 交互，并启动应用 */

import { parseFilesWithCrossFileTypes, mergeParsedData, ParseReport } from './core/merge';
import { layoutDiagram, setLayoutConfig } from './core/layout';
import { renderSVG, setDisplayConfig } from './core/svg';
import { generateDrawioXML } from './core/drawio';
import { formatMergedPlantUML } from './core/plantuml';
import { RELATION_MODES, filterRelationsByMode } from './core/relations';
import { splitSourcePath } from './core/utils';
import { ParsedData } from './core/types';

import { byId } from './ui/dom';
import { formatWarnings, formatWarningSummary, warningSignature, hasProblems, defaultCollapsedSections, WarningInput, WarningSectionKey } from './ui/warnings';
import { createTabsController, packageName } from './ui/tabs';
import { createUpdateScheduler } from './ui/scheduler';
import { createHighlighter } from './ui/highlight';
import { createSplitPanes } from './ui/panes';
import { createExportActions } from './ui/actions';
import { createZoom, createPan } from './ui/zoom';
import { DEFAULT_FILES } from './ui/samples';

// ---------------- DOM 元素 ----------------
const codeEl = byId<HTMLTextAreaElement>('code');
const diagramEl = byId<HTMLDivElement>('diagram-view');
const xmlOutputEl = byId<HTMLTextAreaElement>('xml-output');
const parsedOutputEl = byId<HTMLTextAreaElement>('parsed-output');
const editorPane = byId<HTMLDivElement>('editor-pane');
const fileTabsEl = byId<HTMLDivElement>('file-tabs');
const fileSidebarEl = byId<HTMLDivElement>('file-sidebar');
const sidebarToggle = byId<HTMLButtonElement>('sidebar-toggle');
const editorToggle = byId<HTMLButtonElement>('editor-toggle');
const foldToggleBtn = byId<HTMLButtonElement>('fold-toggle');
const visibilityToggleBtn = byId<HTMLButtonElement>('visibility-toggle');
const sidebarResizer = byId<HTMLDivElement>('sidebar-resizer');
const rightPane = byId<HTMLDivElement>('right-pane');
const warningsEl = byId<HTMLDivElement>('warnings');
const warningsSummaryEl = byId<HTMLSpanElement>('warnings-summary');
const warningsBodyEl = byId<HTMLDivElement>('warnings-body');
const warningsToggleBtn = byId<HTMLButtonElement>('warnings-toggle');
const warningsCloseBtn = byId<HTMLButtonElement>('warnings-close');
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

// 视图懒生成：三份输出共用同一次解析/合并/布局，但只有当前选中的视图才序列化
type ViewKey = 'diagram' | 'xml' | 'parsed';
let activeView: ViewKey = 'diagram';
const staleViews = new Set<ViewKey>(['diagram', 'xml', 'parsed']);
let lastBase: {
  diagram: ReturnType<typeof layoutDiagram>;
  displayDiagram: ReturnType<typeof layoutDiagram>;
  allParsed: ReturnType<typeof mergeAllParsed>;
  classPackageMap: Map<string, string>;
} | null = null;

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
/** 合并所有文件的解析结果（跨文件类型感知）；report 收集解析失败，configFiles 用于 workspace 包名解析 */
function mergeAllParsed(report?: ParseReport): Map<string, ParsedData> {
  tabsController.syncActiveContent();
  return parseFilesWithCrossFileTypes(
    tabsController.visibleTabs().map(tab => ({ name: packageName(tab), content: tab.content })),
    report,
    configFiles,
  );
}

// 警告条状态：记录上一次的内容指纹、已关闭的指纹、以及各分类的折叠状态
let lastWarningInput: WarningInput | null = null;
let lastWarningSignature = '';
let dismissedWarnings = '';
let collapsedSections = new Set<WarningSectionKey>();

function setWarningsCollapsed(collapsed: boolean) {
  warningsEl.classList.toggle('collapsed', collapsed);
  warningsToggleBtn.textContent = collapsed ? '▸' : '▾';
  warningsToggleBtn.title = collapsed ? '展开提示' : '折叠提示';
}

// 整条提示条的折叠
warningsToggleBtn.addEventListener('click', () => {
  setWarningsCollapsed(!warningsEl.classList.contains('collapsed'));
});

// 单个分类的折叠（事件委托：body 每次重绘，委托到稳定的父元素上）
warningsBodyEl.addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest('.warn-section-toggle') as HTMLElement | null;
  if (!btn) return;
  const section = btn.closest('.warn-section') as HTMLElement | null;
  const key = section?.dataset.section as WarningSectionKey | undefined;
  if (!section || !key) return;

  const collapsed = section.classList.toggle('collapsed');
  if (collapsed) collapsedSections.add(key);
  else collapsedSections.delete(key);
  btn.title = collapsed ? '展开' : '折叠';
  const arrow = btn.firstChild;
  if (arrow && arrow.nodeType === Node.TEXT_NODE) arrow.textContent = collapsed ? '▸ ' : '▾ ';
});

warningsCloseBtn.addEventListener('click', () => {
  dismissedWarnings = lastWarningInput ? warningSignature(lastWarningInput) : '';
  warningsEl.hidden = true;
});

/**
 * 顶部警告条：解析失败 / 歧义引用（⚠）与重名类（ℹ）。
 * - 无警告时隐藏；被用户关闭后，仅当内容变化才重新弹出
 * - 内容变化时才自动决定展开/折叠（整条：有问题展开；分类：提示类收起）
 * - 内容不变时保留用户的手动展开/折叠状态（否则每次编辑都会被重置）
 */
function renderWarnings(input: WarningInput) {
  lastWarningInput = input;
  const signature = warningSignature(input);

  if (signature === '') {
    warningsEl.hidden = true;
    warningsBodyEl.innerHTML = '';
    lastWarningSignature = '';
    dismissedWarnings = '';
    collapsedSections = new Set();
    return;
  }

  warningsSummaryEl.textContent = formatWarningSummary(input);

  if (signature !== lastWarningSignature) {
    lastWarningSignature = signature;
    setWarningsCollapsed(!hasProblems(input));
    collapsedSections = defaultCollapsedSections(input);
  }

  warningsBodyEl.innerHTML = formatWarnings(input, collapsedSections);
  warningsEl.hidden = signature === dismissedWarnings;
}

/** 更新所有视图（合并视图） */
function updateAll() {
  if (typeof (window as any).ts === 'undefined') {
    diagramEl.innerHTML = '<p style="padding:16px;color:#b00">TypeScript 编译器未加载：请先运行 <code>npm run build</code>（生成 dist/typescript.min.js）后刷新页面。</p>';
    return;
  }
  try {
    const report: ParseReport = { failures: [], duplicates: [], ambiguous: [] };
    const allParsed = mergeAllParsed(report);
    const { merged, classPackageMap } = mergeParsedData(allParsed);
    renderWarnings({
      resolutionError: report.resolutionError,
      failures: report.failures,
      duplicates: report.duplicates,
      ambiguous: report.ambiguous,
    });

    const diagram = layoutDiagram(merged);

    // 图表显示按当前关系模式过滤，XML/PlantUML 保留全量
    const displayDiagram = { ...diagram, lines: filterRelationsByMode(diagram.lines, relationMode) };
    lastBase = { diagram, displayDiagram, allParsed, classPackageMap };

    // 基础数据变了，三份输出都过期；只重算当前视图（切页时会补算）
    staleViews.add('diagram');
    staleViews.add('xml');
    staleViews.add('parsed');
    renderView(activeView);
  } catch (e: unknown) {
    console.error('解析错误:', e);
  }
}

// 解析去抖；拖入大量文件时用 suspend/resume 挂起，导入结束只解析一次
const scheduler = createUpdateScheduler({ run: updateAll, delay: 250 });
function scheduleUpdate() {
  scheduler.schedule();
}

const tabsController = createTabsController({
  codeEl,
  fileTabsEl,
  onChange: () => {
    syncVisibilityButton();
    scheduleUpdate();
  },
});

/** 顶部眼睛按钮：仅反映自身的开关状态（不受单个文件/文件夹修改影响） */
function syncVisibilityButton() {
  const hidden = tabsController.isAllHidden();
  visibilityToggleBtn.classList.toggle('off', hidden);
  visibilityToggleBtn.title = hidden ? '显示所有文件' : '隐藏所有文件';
}

const exportActions = createExportActions({
  // 导出走纯计算：不依赖图表视图恰好在最新状态（懒生成下图表可能过期）
  renderDiagramSVG: () => {
    const allParsed = mergeAllParsed();
    const { merged } = mergeParsedData(allParsed);
    const diagram = layoutDiagram(merged);
    const display = { ...diagram, lines: filterRelationsByMode(diagram.lines, relationMode) };
    return renderSVG(display, highlighter.relationKey);
  },
  mergeAllParsed,
});

// ---------------- 顶部控件 ----------------
foldToggleBtn.addEventListener('click', () => tabsController.toggleAllFolders());
visibilityToggleBtn.addEventListener('click', () => tabsController.toggleAllVisibility());

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

// ---------------- 视图懒生成 ----------------
/** 只渲染指定视图；XML / PlantUML 只有在切到那一页时才序列化 */
function renderView(view: ViewKey) {
  const base = lastBase;
  if (!base) return;

  if (view === 'diagram') {
    diagramEl.innerHTML = renderSVG(base.displayDiagram, highlighter.relationKey);
    highlighter.sync(base.displayDiagram);
    zoom.apply();
  } else if (view === 'xml') {
    xmlOutputEl.value = generateDrawioXML(base.diagram);
  } else {
    parsedOutputEl.value = formatMergedPlantUML(base.allParsed, base.classPackageMap);
  }
  staleViews.delete(view);
}

/** 切到某个视图；内容过期时才补算 */
function showView(view: ViewKey) {
  activeView = view;
  if (staleViews.has(view)) renderView(view);
}

// ---------------- 视图标签切换 ----------------
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');

    const view = tab.getAttribute('data-view') as ViewKey | null;
    const viewId = `${view}-view`;
    document.querySelectorAll('#diagram-view, #xml-view, #parsed-view').forEach(v => v.classList.remove('active'));
    document.getElementById(viewId)?.classList.add('active');
    if (view) showView(view);
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

  // 导入期间挂起解析：每批 flush 都会触发 onChange，而全局类型集合一变就会让解析缓存
  // 整批失效（实测 1000 个文件 ≈ 40 次全量重解析，累计 1108ms）。挂起后只在导入结束解析一次。
  scheduler.suspend();
  try {
    if (entries.length) {
      for (const entry of entries) {
        await collectTsFiles(entry, (path, content) => {
          const { folder, name } = splitSourcePath(path);
          buffer.push({ name, content, folder });
          if (buffer.length >= CHUNK) flush();
        });
      }
    } else {
      // 回退：普通文件列表（无 entry API 的浏览器）
      for (const file of Array.from(dt.files)) {
        if (/\.tsx?$/.test(file.name)) {
          // 保留扩展名：语义解析与 .tsx 的 ScriptKind 都依赖它
          buffer.push({ name: file.name, content: await file.text(), folder: '' });
        } else if (CONFIG_FILE_RE.test(file.name)) {
          configFiles.push({ name: file.name, content: await file.text() });
        } else {
          console.warn(`跳过不支持的文件: ${file.name}`);
          continue;
        }
        if (buffer.length >= CHUNK) flush();
      }
    }

    flush();
    if (firstId) tabsController.switchTo(firstId);
  } finally {
    // 导入结束：只解析一次（resume 会立即跑，不再等去抖）
    scheduler.resume();
  }
});

/** 拖入时忽略的目录 */
const SKIP_DIRS = new Set(['dist', 'node_modules']);

/** 仅用于模块解析的配置文件（package.json / tsconfig*.json），不作为图表内容 */
const CONFIG_FILE_RE = /(^|\/)(package\.json|tsconfig(\.[^/]*)?\.json)$/i;
let configFiles: { name: string; content: string }[] = [];

/** 递归收集拖入文件夹中的 .ts/.tsx（每读到一个就回调，边读边加；跳过 dist / node_modules） */
async function collectTsFiles(entry: FileSystemEntry, onFile: (path: string, content: string) => void): Promise<void> {
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject));
    const path = entry.fullPath.replace(/^\//, '');
    if (/\.tsx?$/.test(file.name)) {
      onFile(path, await file.text());
    } else if (CONFIG_FILE_RE.test(path)) {
      // workspace 包名要靠它才能解析，但不能当成源码放进图表
      configFiles.push({ name: path, content: await file.text() });
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

/** 路径拆分见 core/utils 的 splitSourcePath（保留扩展名） */

// ---------------- 代码输入 ----------------
codeEl.addEventListener('input', scheduleUpdate);

// ---------------- 分栏拖拽 ----------------
createSplitPanes({
  rightPane,
  divider: dividerEl,
  fileSidebar: fileSidebarEl,
  sidebarResizer,
  sidebarToggle,
  editorPane,
  editorToggle,
});

// ---------------- 初始化：加载示例（含文件夹的跨包示例项目） ----------------
const sampleTabs = tabsController.addTabs(
  DEFAULT_FILES.map(f => ({ name: f.name, content: f.content, folder: f.folder })),
);
if (sampleTabs.length) tabsController.switchTo(sampleTabs[0].id);
