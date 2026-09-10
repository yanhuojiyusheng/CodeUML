/** 主入口：只负责组装 core 能力与 ui 交互，并启动应用 */

import { parseFilesWithCrossFileTypes, mergeParsedData } from './core/merge';
import { layoutDiagram, setLayoutConfig } from './core/layout';
import { renderSVG, setDisplayConfig } from './core/svg';
import { generateDrawioXML } from './core/drawio';
import { formatMergedPlantUML } from './core/plantuml';
import { RELATION_MODES, filterRelationsByMode } from './core/relations';
import { ParsedData } from './core/types';

import { byId } from './ui/dom';
import { createTabsController } from './ui/tabs';
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
    tabsController.tabs.map(tab => ({ name: tab.name, content: tab.content }))
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

const tabsController = createTabsController({
  codeEl,
  fileTabsEl,
  onChange: () => updateAll(),
});

const exportActions = createExportActions({
  diagramEl,
  mergeAllParsed,
});

// ---------------- 顶部控件 ----------------
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

editorPane.addEventListener('drop', (e) => {
  e.preventDefault();
  editorPane.classList.remove('drag-over');

  const files = e.dataTransfer?.files;
  if (!files?.length) return;

  Array.from(files).forEach(file => {
    if (!file.name.endsWith('.ts') && !file.name.endsWith('.tsx')) {
      console.warn(`跳过非 TypeScript 文件: ${file.name}`);
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      const packageName = file.name.replace(/\.tsx?$/, '');
      tabsController.create(packageName, content);
    };
    reader.readAsText(file);
  });
});

// ---------------- 代码输入 ----------------
let timer: number;
codeEl.addEventListener('input', () => {
  clearTimeout(timer);
  timer = window.setTimeout(updateAll, 300);
});

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
