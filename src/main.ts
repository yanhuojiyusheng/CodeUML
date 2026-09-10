/** 主入口 */

import { parseCode } from './parser';
import { parseFilesWithCrossFileTypes, mergeParsedData } from './merge';
import { layoutDiagram, setLayoutConfig } from './layout';
import { renderSVG, setDisplayConfig } from './renderer';
import { generateDrawioXML } from './exporter';
import { ParsedData, RelationType } from './types';
import { formatParsed, formatMergedPlantUML } from './plantuml';
import { getElement, relationKey } from './utils';

// DOM 元素
const codeEl = getElement<HTMLTextAreaElement>('code');
const diagramEl = getElement<HTMLDivElement>('diagram-view');
const xmlOutputEl = getElement<HTMLTextAreaElement>('xml-output');
const parsedOutputEl = getElement<HTMLTextAreaElement>('parsed-output');
const statusEl = getElement<HTMLDivElement>('status');
const editorPane = getElement<HTMLDivElement>('editor-pane');
const fileTabsEl = getElement<HTMLDivElement>('file-tabs');
const fileSidebarEl = getElement<HTMLDivElement>('file-sidebar');
const sidebarToggle = getElement<HTMLButtonElement>('sidebar-toggle');
const sidebarResizer = getElement<HTMLDivElement>('sidebar-resizer');
const rightPane = getElement<HTMLDivElement>('right-pane');
const dividerEl = getElement<HTMLDivElement>('divider');
const maxPropsEl = getElement<HTMLInputElement>('max-props');
const maxMethodsEl = getElement<HTMLInputElement>('max-methods');
const relationModeBtn = getElement<HTMLButtonElement>('relation-mode-btn');

// 关系强弱分级：数字越大关系越强
const RELATION_STRENGTH: Record<RelationType, number> = {
  extends: 6,
  implements: 5,
  composition: 4,
  aggregation: 3,
  association: 2,
  dependency: 1,
};

// 三种显示模式：全部 / 忽略最弱两种 / 只保留最强两种
const RELATION_MODES = [
  { label: '全部', minStrength: 0 },
  { label: '较强', minStrength: 3 }, // 忽略 dependency + association
  { label: '最强', minStrength: 5 }, // 忽略 dependency + association + aggregation + composition
] as const;

let relationMode = 0;

// 当前高亮的关系（双击连接线时设置）
let highlightedRelationKey: string | null = null;

/** 将高亮状态应用到已渲染的 SVG（关系线 + 两端类框） */
function applyHighlight() {
  let fromName = '';
  let toName = '';
  
  diagramEl.querySelectorAll<SVGGElement>('g.relation').forEach(g => {
    const isHighlighted = g.dataset.key === highlightedRelationKey;
    g.classList.toggle('highlighted', isHighlighted);
    if (isHighlighted) {
      fromName = g.dataset.from || '';
      toName = g.dataset.to || '';
    }
  });
  
  diagramEl.querySelectorAll<SVGGElement>('g.class-box').forEach(b => {
    const name = b.dataset.name || '';
    const isHighlighted = highlightedRelationKey != null && (name === fromName || name === toName);
    b.classList.toggle('highlighted', isHighlighted);
  });
}

// 双击连接线 -> 高亮整条线
diagramEl.addEventListener('dblclick', (e) => {
  const target = e.target as Element | null;
  const relationEl = target?.closest?.('.relation') as SVGGElement | null;
  if (!relationEl) return;
  highlightedRelationKey = relationEl.dataset.key ?? null;
  applyHighlight();
});

// 单击其他线或空白 -> 取消高亮；单击已高亮的线保持不变
diagramEl.addEventListener('click', (e) => {
  const target = e.target as Element | null;
  const relationEl = target?.closest?.('.relation') as SVGGElement | null;
  if (relationEl && relationEl.dataset.key === highlightedRelationKey) return;
  if (highlightedRelationKey) {
    highlightedRelationKey = null;
    applyHighlight();
  }
});

/** 按显示模式过滤关系/连线 */
function filterRelationsByMode<T extends { type: RelationType }>(items: T[], mode: number): T[] {
  const min = RELATION_MODES[mode]?.minStrength ?? 0;
  return items.filter(r => RELATION_STRENGTH[r.type] >= min);
}

relationModeBtn.addEventListener('click', () => {
  relationMode = (relationMode + 1) % RELATION_MODES.length;
  relationModeBtn.textContent = `关系: ${RELATION_MODES[relationMode].label}`;
  updateAll();
});

// 初始化显示配置
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

// 文件管理
interface FileTab {
  id: string;
  name: string; // 包名
  content: string;
  parsed?: ParsedData;
}

let tabs: FileTab[] = [];
let activeTabId: string | null = null;
let pendingSwitchTimer: number | undefined;

// 文件名最大长度，防止手误粘贴超长文本
const MAX_FILE_NAME_LENGTH = 400;

// 默认示例代码
const DEFAULT_CODE = `// 领域模型与设计模式示例 - models.ts
// 覆盖：枚举、接口、继承/实现、组合/聚合/关联/依赖、构造函数参数属性、getter/setter

// 枚举：数字枚举 + 字符串枚举
enum Gender {
  MALE,
  FEMALE,
  UNKNOWN
}

enum OrderStatus {
  PENDING = "pending",
  PAID = "paid",
  SHIPPED = "shipped",
  CANCELLED = "cancelled"
}

// 接口：可选的动物、可飞行的、可序列化的
interface Pet {
  name: string;
  owner?: Person;
  play(): void;
}

interface Flyable {
  fly(): void;
}

interface Serializable {
  serialize(): string;
}

// 抽象基类
abstract class Animal implements Serializable {
  private id: string;
  public name: string;
  protected age: number;
  private gender: Gender;
  // 组合关系：内部 new 创建
  private heart = new Heart();

  constructor(name: string, age: number, gender: Gender) {
    this.name = name;
    this.age = age;
    this.gender = gender;
  }

  abstract makeSound(): void;
  abstract serialize(): string;

  getAge(): number {
    return this.age;
  }
}

class Heart {
  public bpm: number = 72;
  beat(): void {}
}

// 继承 + 多接口实现
class Dog extends Animal implements Pet, Flyable {
  private breed: string;
  // 关联关系：普通引用类型
  public owner: Person;
  // 聚合关系：数组/集合
  private toys: Toy[] = [];

  constructor(name: string, age: number, gender: Gender, breed: string, owner: Person) {
    super(name, age, gender);
    this.breed = breed;
    this.owner = owner;
  }

  makeSound(): void { console.log("Woof!"); }
  serialize(): string { return JSON.stringify({ name: this.name, breed: this.breed }); }
  play(): void { console.log("playing fetch"); }
  // 依赖关系：方法参数与返回类型
  fetch(toy: Toy): Toy | null {
    return toy;
  }
}

class Bird extends Animal implements Pet {
  private wingSpan: number;

  constructor(name: string, age: number, gender: Gender, wingSpan: number) {
    super(name, age, gender);
    this.wingSpan = wingSpan;
  }

  makeSound(): void { console.log("Chirp!"); }
  serialize(): string { return this.name; }
  play(): void { console.log("hopping"); }
  fly(): void { console.log("flying"); }
}

class Cat extends Animal implements Pet {
  private indoor: boolean;

  constructor(name: string, age: number, gender: Gender, indoor: boolean) {
    super(name, age, gender);
    this.indoor = indoor;
  }

  makeSound(): void { console.log("Meow!"); }
  serialize(): string { return this.name; }
  play(): void { console.log("playing with string"); }
}

class Toy {
  public name: string;
  constructor(name: string) {
    this.name = name;
  }
}

// 人：getter/setter + 可选属性 + 聚合
class Person {
  public name: string;
  private email?: string;
  private pets: Pet[];

  constructor(name: string) {
    this.name = name;
    this.pets = [];
  }

  get id(): string {
    return this.name.toLowerCase();
  }

  set displayEmail(value: string) {
    this.email = value;
  }

  adopt(pet: Pet): void {
    this.pets.push(pet);
  }
}
`;

const DEFAULT_CODE_2 = `// 服务层与数据访问 - services.ts
// 覆盖：跨文件依赖/关联、构造函数参数属性、可选返回、泛型剥壳

class UserService {
  // 关联：字段引用
  private database: Database;
  private logger: Logger;

  // 构造函数参数属性：public/private/readonly 自动成为字段
  constructor(private repo: UserRepository, db: Database, logger: Logger) {
    this.database = db;
    this.logger = logger;
  }

  findUser(id: string): User | null {
    return this.repo.findById(id);
  }

  listUsers(): Promise<User[]> {
    return this.repo.list();
  }

  createUser(data: UserData): User {
    return {} as User;
  }

  // 依赖：参数 + 返回值
  deleteUser(deleter: UserDeleter, id: string): boolean {
    return deleter.delete(id);
  }
}

interface UserRepository {
  findById(id: string): User | null;
  list(): Promise<User[]>;
}

interface UserDeleter {
  delete(id: string): boolean;
}

class Database {
  private connectionString: string;

  constructor(connStr: string) {
    this.connectionString = connStr;
  }

  query(sql: string): any[] {
    return [];
  }
}

class Logger {
  private level: string = "info";
  log(message: string): void {}
  error(message: string): void {}
}

interface User {
  id: string;
  name: string;
  email: string;
}

interface UserData {
  name: string;
  email: string;
}
`;

const DEFAULT_CODE_3 = `// 第三方库与工具 - utils.ts
// 覆盖：工具类型剥壳（Partial/Required/Record/Map/Set）、单例模式、静态成员、抽象静态

// 泛型仓库：泛型参数 + Map 值类型关联
class Repository<T> {
  protected items: Map<string, T> = new Map();
  private cache: Map<number, CacheEntry<T>> = new Map();

  put(key: string, value: T): void {
    this.items.set(key, value);
  }

  get(key: string): T | undefined {
    return this.items.get(key);
  }

  list(): T[] {
    return Array.from(this.items.values());
  }
}

class CacheEntry<V> {
  public value: V;
  public timestamp: number;
  constructor(value: V) {
    this.value = value;
    this.timestamp = Date.now();
  }
}

// 单例模式 + 静态成员
class Config {
  private static instance: Config;
  public static readonly VERSION: string = "1.0.0";
  private constructor(public data: Record<string, Partial<User>>) {}

  static getInstance(): Config {
    if (!Config.instance) {
      Config.instance = new Config({});
    }
    return Config.instance;
  }

  get(key: string): Partial<User> | undefined {
    return this.data[key];
  }
}

// 工具类型剥壳
class UserStore {
  private users: Required<Record<string, User>> = {} as any;
  private partials: Partial<User>[] = [];
  private ids: Set<string> = new Set();

  save(user: User): void {
    this.ids.add(user.id);
    this.partials.push(user);
  }
}
`;

/** 生成唯一 ID */
function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

/** 创建新文件标签 */
function createTab(name: string, content: string): FileTab {
  const safeName = name.slice(0, MAX_FILE_NAME_LENGTH);
  const tab: FileTab = { id: generateId(), name: safeName, content };
  tabs.push(tab);
  renderTabs();
  switchTab(tab.id);
  return tab;
}

/** 延迟切换标签，避免干扰双击重命名 */
function scheduleSwitch(tabId: string) {
  if (pendingSwitchTimer) {
    clearTimeout(pendingSwitchTimer);
  }
  pendingSwitchTimer = window.setTimeout(() => {
    pendingSwitchTimer = undefined;
    switchTab(tabId);
  }, 200);
}

/** 渲染标签栏 */
function renderTabs() {
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
        closeTab(closeBtn.dataset.id!);
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
      if (!isActive) {
        scheduleSwitch(tabId);
      }
    });
  });
  
  // 新建按钮事件
  document.getElementById('add-tab')?.addEventListener('click', () => {
    const count = tabs.length + 1;
    createTab(`file${count}`, '// 新文件\n');
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
      updateAll();
    }
    renderTabs();
  };
  
  input.addEventListener('blur', save);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') save();
    if (e.key === 'Escape') renderTabs();
  });
}

/** 切换标签 */
function switchTab(id: string) {
  const tab = tabs.find(t => t.id === id);
  if (!tab) return;
  
  // 保存当前内容
  if (activeTabId) {
    const currentTab = tabs.find(t => t.id === activeTabId);
    if (currentTab) currentTab.content = codeEl.value;
  }
  
  activeTabId = id;
  codeEl.value = tab.content;
  renderTabs();
  updateAll();
}

/** 关闭标签 */
function closeTab(id: string) {
  const index = tabs.findIndex(t => t.id === id);
  if (index === -1) return;
  
  tabs.splice(index, 1);
  
  // 如果删除完了，创建一个空白文件
  if (tabs.length === 0) {
    createTab('untitled', '// 新文件\n');
    return;
  }
  
  if (activeTabId === id) {
    const newIndex = Math.min(index, tabs.length - 1);
    switchTab(tabs[newIndex].id);
  } else {
    renderTabs();
    updateAll();
  }
}

/** HTML 转义 */
function escHtml(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** HTML 属性转义 */
function escAttr(s: string): string {
  return escHtml(s).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** 合并所有文件的解析结果（跨文件类型感知） */
function mergeAllParsed(): Map<string, ParsedData> {
  // 先解析当前标签的内容
  if (activeTabId) {
    const currentTab = tabs.find(t => t.id === activeTabId);
    if (currentTab) currentTab.content = codeEl.value;
  }

  const results = parseFilesWithCrossFileTypes(
    tabs.map(tab => ({ name: tab.name, content: tab.content }))
  );

  // 回填每个标签的解析结果
  tabs.forEach(tab => {
    tab.parsed = results.get(tab.name);
  });

  return results;
}

/** 更新所有视图（合并视图） */
function updateAll() {
  try {
    const allParsed = mergeAllParsed();
    const { merged, classPackageMap } = mergeParsedData(allParsed);

    const diagram = layoutDiagram(merged);
    
    // 图表显示按当前关系模式过滤，XML/PlantUML 保留全量
    const displayDiagram = { ...diagram, lines: filterRelationsByMode(diagram.lines, relationMode) };
    diagramEl.innerHTML = renderSVG(displayDiagram, highlightedRelationKey);
    // 若高亮的关系在当前可见集合中已不存在，则清除高亮
    if (highlightedRelationKey && !displayDiagram.lines.some(l => relationKey(l) === highlightedRelationKey)) {
      highlightedRelationKey = null;
    }
    applyHighlight();
    xmlOutputEl.value = generateDrawioXML(diagram);
    parsedOutputEl.value = formatMergedPlantUML(allParsed, classPackageMap);
    
    // 状态栏
    const fileNames = Array.from(allParsed.keys()).join(', ');
    const shownRelations = displayDiagram.lines.length;
    statusEl.textContent = `文件: ${fileNames} | 类: ${merged.classes.length} | 关系: ${merged.relations.length}（显示 ${shownRelations}）`;
  } catch (e: unknown) {
    statusEl.textContent = '解析错误: ' + (e instanceof Error ? e.message : String(e));
    console.error(e);
  }
}

/** 更新单个标签视图 */
function updateSingle() {
  try {
    if (!activeTabId) return;
    const tab = tabs.find(t => t.id === activeTabId);
    if (!tab) return;
    
    const code = codeEl.value;
    const parsed = parseCode(code);
    tab.parsed = parsed;
    
    const diagram = layoutDiagram(parsed);
    diagramEl.innerHTML = renderSVG(diagram, highlightedRelationKey);
    if (highlightedRelationKey && !diagram.lines.some(l => relationKey(l) === highlightedRelationKey)) {
      highlightedRelationKey = null;
    }
    applyHighlight();
    xmlOutputEl.value = generateDrawioXML(diagram);
    parsedOutputEl.value = formatParsed(parsed, tab.name);
    
    statusEl.textContent = `[${tab.name}] 已解析 ${parsed.classes.length} 个类, ${parsed.relations.length} 条关系`;
  } catch (e: unknown) {
    statusEl.textContent = '解析错误: ' + (e instanceof Error ? e.message : String(e));
    console.error(e);
  }
}

/** 下载文件 */
function downloadFile(name: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

/** 导出 Draw.io */
function exportDrawio() {
  const allParsed = mergeAllParsed();
  const { merged } = mergeParsedData(allParsed);

  const diagram = layoutDiagram(merged);
  downloadFile('class-diagram.drawio', generateDrawioXML(diagram), 'application/xml');
}

/** 导出 SVG */
function exportSVG() {
  downloadFile('class-diagram.svg', `<?xml version="1.0" encoding="UTF-8"?>\n${diagramEl.innerHTML}`, 'image/svg+xml');
}

/** 导出 PlantUML */
function exportPlantUML() {
  const allParsed = mergeAllParsed();
  const { classPackageMap } = mergeParsedData(allParsed);

  const content = formatMergedPlantUML(allParsed, classPackageMap);
  downloadFile('diagram.puml', content, 'text/plain');
}

// 声明全局函数
declare global {
  interface Window {
    exportDrawio: () => void;
    exportSVG: () => void;
    exportPlantUML: () => void;
  }
}
window.exportDrawio = exportDrawio;
window.exportSVG = exportSVG;
window.exportPlantUML = exportPlantUML;

// Tab 切换
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    
    const viewId = tab.getAttribute('data-view') + '-view';
    document.querySelectorAll('#diagram-view, #xml-view, #parsed-view').forEach(v => v.classList.remove('active'));
    document.getElementById(viewId)?.classList.add('active');
  });
});

// 拖放处理
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
      statusEl.textContent = `跳过非 TypeScript 文件: ${file.name}`;
      return;
    }
    
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      const packageName = file.name.replace(/\.tsx?$/, '');
      createTab(packageName, content);
    };
    reader.readAsText(file);
  });
});

// 代码输入处理
let timer: number;
codeEl.addEventListener('input', () => {
  clearTimeout(timer);
  timer = window.setTimeout(updateAll, 300);
});

// 左右分栏拖动调整
let dividerDragging = false;
let dividerStartX = 0;
let dividerStartWidth = 0;

function setRightWidth(width: number) {
  const mainEl = rightPane.parentElement;
  if (!mainEl) return;
  const sidebarW = fileSidebarEl.getBoundingClientRect().width || 170;
  const resizerW = sidebarResizer.getBoundingClientRect().width || 5;
  const dividerW = dividerEl.getBoundingClientRect().width || 6;
  const mainW = mainEl.getBoundingClientRect().width || window.innerWidth;
  const maxW = Math.max(280, mainW - sidebarW - resizerW - dividerW - 240); // 编辑器至少保留 240px
  const minW = 280;
  const clamped = Math.max(minW, Math.min(maxW, width));
  rightPane.style.flex = `0 0 ${clamped}px`;
  rightPane.style.width = `${clamped}px`;
}

dividerEl.addEventListener('mousedown', (e: MouseEvent) => {
  e.preventDefault();
  dividerDragging = true;
  dividerStartX = e.clientX;
  dividerStartWidth = rightPane.getBoundingClientRect().width;
  dividerEl.classList.add('dragging');
  document.body.style.cursor = 'col-resize';
  document.body.style.userSelect = 'none';
});

document.addEventListener('mousemove', (e: MouseEvent) => {
  if (!dividerDragging) return;
  // 向右拖动 -> 右侧图表区变窄
  setRightWidth(dividerStartWidth - (e.clientX - dividerStartX));
});

document.addEventListener('mouseup', () => {
  if (!dividerDragging) return;
  dividerDragging = false;
  dividerEl.classList.remove('dragging');
  document.body.style.cursor = '';
  document.body.style.userSelect = '';
});

// 触摸设备支持
let touchDragging = false;
let touchStartX = 0;
let touchStartWidth = 0;

dividerEl.addEventListener('touchstart', (e: TouchEvent) => {
  const touch = e.touches[0];
  if (!touch) return;
  touchDragging = true;
  touchStartX = touch.clientX;
  touchStartWidth = rightPane.getBoundingClientRect().width;
  dividerEl.classList.add('dragging');
}, { passive: true });

dividerEl.addEventListener('touchmove', (e: TouchEvent) => {
  if (!touchDragging) return;
  const touch = e.touches[0];
  if (!touch) return;
  setRightWidth(touchStartWidth - (touch.clientX - touchStartX));
  e.preventDefault();
}, { passive: false });

dividerEl.addEventListener('touchend', () => {
  touchDragging = false;
  dividerEl.classList.remove('dragging');
});

// 文件栏宽度拖动调整
let sidebarDragging = false;
let sidebarStartX = 0;
let sidebarStartWidth = 0;

function setSidebarWidth(width: number) {
  const mainEl = fileSidebarEl.parentElement;
  if (!mainEl) return;
  const mainW = mainEl.getBoundingClientRect().width || window.innerWidth;
  const resizerW = sidebarResizer.getBoundingClientRect().width || 5;
  const dividerW = dividerEl.getBoundingClientRect().width || 6;
  const rightW = rightPane.getBoundingClientRect().width || 0;
  // 保证：文件栏 + 编辑器(>=240) + 分隔条 + 右侧面板 不超出主区域
  const maxW = Math.max(180, Math.min(600, mainW - resizerW - dividerW - rightW - 240));
  const minW = 120;
  const clamped = Math.max(minW, Math.min(maxW, width));
  fileSidebarEl.style.setProperty('--sidebar-width', `${clamped}px`);
}

sidebarResizer.addEventListener('mousedown', (e: MouseEvent) => {
  e.preventDefault();
  sidebarDragging = true;
  sidebarStartX = e.clientX;
  sidebarStartWidth = fileSidebarEl.getBoundingClientRect().width;
  fileSidebarEl.classList.add('resizing');
  sidebarResizer.classList.add('dragging');
  document.body.style.cursor = 'col-resize';
  document.body.style.userSelect = 'none';
});

document.addEventListener('mousemove', (e: MouseEvent) => {
  if (!sidebarDragging) return;
  setSidebarWidth(sidebarStartWidth + (e.clientX - sidebarStartX));
});

document.addEventListener('mouseup', () => {
  if (!sidebarDragging) return;
  sidebarDragging = false;
  fileSidebarEl.classList.remove('resizing');
  sidebarResizer.classList.remove('dragging');
  document.body.style.cursor = '';
  document.body.style.userSelect = '';
});

// 文件栏触摸拖动
let sidebarTouchDragging = false;
let sidebarTouchStartX = 0;
let sidebarTouchStartWidth = 0;

sidebarResizer.addEventListener('touchstart', (e: TouchEvent) => {
  const touch = e.touches[0];
  if (!touch) return;
  sidebarTouchDragging = true;
  sidebarTouchStartX = touch.clientX;
  sidebarTouchStartWidth = fileSidebarEl.getBoundingClientRect().width;
  fileSidebarEl.classList.add('resizing');
  sidebarResizer.classList.add('dragging');
}, { passive: true });

sidebarResizer.addEventListener('touchmove', (e: TouchEvent) => {
  if (!sidebarTouchDragging) return;
  const touch = e.touches[0];
  if (!touch) return;
  setSidebarWidth(sidebarTouchStartWidth + (touch.clientX - sidebarTouchStartX));
  e.preventDefault();
}, { passive: false });

sidebarResizer.addEventListener('touchend', () => {
  sidebarTouchDragging = false;
  fileSidebarEl.classList.remove('resizing');
  sidebarResizer.classList.remove('dragging');
});

// 窗口缩放时，重新约束右侧面板与文件栏宽度
window.addEventListener('resize', () => {
  if (rightPane.style.flex) {
    setRightWidth(rightPane.getBoundingClientRect().width);
  }
  if (!fileSidebarEl.classList.contains('collapsed') && fileSidebarEl.style.getPropertyValue('--sidebar-width')) {
    setSidebarWidth(fileSidebarEl.getBoundingClientRect().width);
  }
});

// 文件栏折叠/展开
function toggleSidebar() {
  const collapsed = fileSidebarEl.classList.toggle('collapsed');
  sidebarToggle.textContent = collapsed ? '»' : '«';
  sidebarToggle.title = collapsed ? '展开文件栏' : '折叠文件栏';
}

sidebarToggle.addEventListener('click', (e) => {
  e.stopPropagation();
  toggleSidebar();
});

// 折叠状态下点击整条竖栏可展开
fileSidebarEl.addEventListener('click', () => {
  if (fileSidebarEl.classList.contains('collapsed')) {
    toggleSidebar();
  }
});

// 初始化 - 加载示例
createTab('models', DEFAULT_CODE);
createTab('services', DEFAULT_CODE_2);
createTab('utils', DEFAULT_CODE_3);
