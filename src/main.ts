/** 主入口 */

import { parseCode, parseCodeWithKnownTypes } from './parser';
import { layoutDiagram } from './layout';
import { renderSVG } from './renderer';
import { generateDrawioXML } from './exporter';
import { Diagram, ParsedData, Member, ClassInfo, Relation } from './types';
import { getElement } from './utils';

// DOM 元素
const codeEl = getElement<HTMLTextAreaElement>('code');
const diagramEl = getElement<HTMLDivElement>('diagram-view');
const xmlOutputEl = getElement<HTMLTextAreaElement>('xml-output');
const parsedOutputEl = getElement<HTMLTextAreaElement>('parsed-output');
const statusEl = getElement<HTMLDivElement>('status');
const editorPane = getElement<HTMLDivElement>('editor-pane');
const fileTabsEl = getElement<HTMLDivElement>('file-tabs');

// 文件管理
interface FileTab {
  id: string;
  name: string; // 包名
  content: string;
  parsed?: ParsedData;
}

let tabs: FileTab[] = [];
let activeTabId: string | null = null;

// 默认示例代码
const DEFAULT_CODE = `// 示例代码 - 拖放多个 .ts 文件查看跨文件关系
enum Gender {
  MALE,
  FEMALE,
  UNKNOWN
}

interface Pet {
  name: string;
  play(): void;
}

interface Flyable {
  fly(): void;
}

abstract class Animal {
  private id: string;
  public name: string;
  protected age: number;
  private gender: Gender;
  
  constructor(name: string, age: number, gender: Gender) {
    this.name = name;
    this.age = age;
    this.gender = gender;
  }
  
  abstract makeSound(): void;
  
  getAge(): number {
    return this.age;
  }
}

class Dog extends Animal implements Pet {
  private breed: string;
  public owner: Person;
  
  constructor(name: string, age: number, gender: Gender, breed: string) {
    super(name, age, gender);
    this.breed = breed;
  }
  
  makeSound(): void { console.log("Woof!"); }
  play(): void { console.log("playing"); }
}

class Bird extends Animal implements Pet, Flyable {
  private wingSpan: number;
  
  constructor(name: string, age: number, gender: Gender, wingSpan: number) {
    super(name, age, gender);
    this.wingSpan = wingSpan;
  }
  
  makeSound(): void { console.log("Chirp!"); }
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
  play(): void { console.log("playing"); }
}

class Person {
  public name: string;
  private pets: Pet[];
  
  constructor(name: string) {
    this.name = name;
    this.pets = [];
  }
  
  adopt(pet: Pet): void {
    this.pets.push(pet);
  }
}`;

const DEFAULT_CODE_2 = `// 第二个文件示例 - services.ts
// 拖放更多文件查看跨包关系

class UserService {
  private database: Database;
  private logger: Logger;
  
  constructor(db: Database, logger: Logger) {
    this.database = db;
    this.logger = logger;
  }
  
  findUser(id: string): User | null {
    return null;
  }
  
  createUser(data: UserData): User {
    return {} as User;
  }
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
}`;

/** 生成唯一 ID */
function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

/** 创建新文件标签 */
function createTab(name: string, content: string): FileTab {
  const tab: FileTab = { id: generateId(), name, content };
  tabs.push(tab);
  renderTabs();
  switchTab(tab.id);
  return tab;
}

/** 渲染标签栏 */
function renderTabs() {
  let html = tabs.map(tab => `
    <div class="file-tab ${tab.id === activeTabId ? 'active' : ''}" data-id="${tab.id}">
      <span class="name" data-id="${tab.id}" title="双击重命名">${escHtml(tab.name)}</span>
      <span class="close" data-id="${tab.id}">×</span>
    </div>
  `).join('');
  
  // 添加新建按钮
  html += '<div class="file-tab add-tab" id="add-tab" title="新建空白文件">+</div>';
  
  fileTabsEl.innerHTML = html;
  
  fileTabsEl.querySelectorAll('.file-tab:not(.add-tab)').forEach(el => {
    el.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.classList.contains('close')) {
        closeTab(target.dataset.id!);
      } else if (!target.classList.contains('name')) {
        switchTab(el.getAttribute('data-id')!);
      }
    });
  });
  
  // 新建按钮事件
  document.getElementById('add-tab')?.addEventListener('click', () => {
    const count = tabs.length + 1;
    createTab(`file${count}`, '// 新文件\n');
  });
  
  // 双击重命名
  fileTabsEl.querySelectorAll('.file-tab .name').forEach(el => {
    el.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      const tabId = el.getAttribute('data-id')!;
      startRename(tabId, el as HTMLElement);
    });
  });
}

/** 开始重命名 */
function startRename(tabId: string, nameEl: HTMLElement) {
  const tab = tabs.find(t => t.id === tabId);
  if (!tab) return;
  
  const input = document.createElement('input');
  input.type = 'text';
  input.value = tab.name;
  input.style.cssText = 'background:#1e1e1e;color:#fff;border:1px solid #0078d4;padding:2px 6px;font-size:12px;width:100px;outline:none;';
  
  nameEl.replaceWith(input);
  input.focus();
  input.select();
  
  const save = () => {
    const newName = input.value.trim();
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

/** 合并所有文件的解析结果（跨文件类型感知） */
function mergeAllParsed(): Map<string, ParsedData> {
  // 先解析当前标签的内容
  if (activeTabId) {
    const currentTab = tabs.find(t => t.id === activeTabId);
    if (currentTab) currentTab.content = codeEl.value;
  }
  
  // 第一步：收集所有文件的类型名称
  const allTypeNames = new Set<string>();
  tabs.forEach(tab => {
    try {
      const parsed = parseCode(tab.content);
      parsed.classes.forEach(c => allTypeNames.add(c.name));
    } catch (e) {
      // 忽略解析错误，继续收集
    }
  });
  
  // 第二步：使用合并的类型集合重新解析每个文件
  const results = new Map<string, ParsedData>();
  tabs.forEach(tab => {
    try {
      const parsed = parseCodeWithKnownTypes(tab.content, allTypeNames);
      // 设置包名
      parsed.classes.forEach(c => {
        c.packageName = tab.name;
      });
      tab.parsed = parsed;
      results.set(tab.name, parsed);
    } catch (e) {
      console.error(`Error parsing ${tab.name}:`, e);
    }
  });
  
  return results;
}

/** 更新所有视图（合并视图） */
function updateAll() {
  try {
    const allParsed = mergeAllParsed();
    
    // 合并所有类和关系
    const allClasses: ClassInfo[] = [];
    const allRelations: Relation[] = [];
    const classPackageMap = new Map<string, string>(); // className -> packageName
    
    allParsed.forEach((parsed, packageName) => {
      parsed.classes.forEach(c => {
        // 检查是否已存在（跨文件引用）
        if (!classPackageMap.has(c.name)) {
          classPackageMap.set(c.name, packageName);
          allClasses.push(c);
        }
      });
      allRelations.push(...parsed.relations);
    });
    
    // 去重关系
    const uniqueRelations: Relation[] = [];
    const relationKeys = new Set<string>();
    allRelations.forEach(r => {
      const key = `${r.from}-${r.type}-${r.to}`;
      if (!relationKeys.has(key)) {
        relationKeys.add(key);
        uniqueRelations.push(r);
      }
    });
    
    const merged: ParsedData = { classes: allClasses, relations: uniqueRelations };
    const diagram = layoutDiagram(merged);
    
    // 更新图表
    diagramEl.innerHTML = renderSVG(diagram);
    xmlOutputEl.value = generateDrawioXML(diagram);
    parsedOutputEl.value = formatMergedPlantUML(allParsed, classPackageMap);
    
    // 状态栏
    const fileNames = Array.from(allParsed.keys()).join(', ');
    statusEl.textContent = `文件: ${fileNames} | 类: ${allClasses.length} | 关系: ${uniqueRelations.length}`;
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
    diagramEl.innerHTML = renderSVG(diagram);
    xmlOutputEl.value = generateDrawioXML(diagram);
    parsedOutputEl.value = formatParsed(parsed, tab.name);
    
    statusEl.textContent = `[${tab.name}] 已解析 ${parsed.classes.length} 个类, ${parsed.relations.length} 条关系`;
  } catch (e: unknown) {
    statusEl.textContent = '解析错误: ' + (e instanceof Error ? e.message : String(e));
    console.error(e);
  }
}

/** 格式化成员 */
function formatMember(m: Member): string {
  const staticStr = m.isStatic ? '{static} ' : '';
  const abstractStr = m.isAbstract ? '{abstract} ' : '';
  
  if (m.kind === 'property') {
    return `${staticStr}${abstractStr}${m.modifier} ${m.name}${m.type ? ' : ' + m.type : ''}`;
  }
  if (m.name === 'constructor') {
    return `${m.modifier} constructor(${m.params || ''})`;
  }
  return `${staticStr}${abstractStr}${m.modifier} ${m.name}(${m.params || ''})${m.type ? ' : ' + m.type : ''}`;
}

/** 格式化关系 */
function formatRelation(r: Relation): string {
  let arrow = '';
  switch (r.type) {
    case 'extends': arrow = '--|>'; break;
    case 'implements': arrow = '..|>'; break;
    case 'aggregation': arrow = 'o--'; break;
    case 'composition': arrow = '*--'; break;
    case 'dependency': arrow = '..>'; break;
    case 'association': 
    default: arrow = '-->';
  }
  
  const fromMult = r.fromMultiplicity && r.fromMultiplicity !== '1' ? `"${r.fromMultiplicity}" ` : '';
  const toMult = r.toMultiplicity && r.toMultiplicity !== '1' ? ` "${r.toMultiplicity}"` : '';
  
  let relStr = `${r.from}${fromMult} ${arrow}${toMult} ${r.to}`;
  if (r.label && ['association', 'aggregation', 'composition'].includes(r.type)) {
    relStr += ` : ${r.label}`;
  }
  return relStr;
}

/** 格式化单个文件的 PlantUML */
function formatParsed(parsed: ParsedData, packageName?: string): string {
  let text = '@startuml\n\n';
  text += 'skinparam classAttributeIconSize 0\n';
  text += 'skinparam shadowing false\n\n';
  
  if (packageName) {
    text += `package "${packageName}" {\n`;
  }
  
  parsed.classes.forEach(c => {
    const indent = packageName ? '  ' : '';
    if (c.isEnum) {
      text += `${indent}enum "${c.name}" as ${c.name} {\n`;
    } else if (c.isInterface) {
      text += `${indent}interface "${c.name}" as ${c.name} {\n`;
    } else if (c.isAbstract) {
      text += `${indent}abstract class "${c.name}" as ${c.name} {\n`;
    } else {
      text += `${indent}class "${c.name}" as ${c.name} {\n`;
    }
    
    const props = c.members.filter(m => m.kind === 'property');
    const meths = c.members.filter(m => m.kind === 'method');
    
    props.forEach(m => { text += `${indent}  ${formatMember(m)}\n`; });
    if (props.length && meths.length) { text += `${indent}  --\n`; }
    meths.forEach(m => { text += `${indent}  ${formatMember(m)}\n`; });
    
    text += `${indent}}\n\n`;
  });
  
  if (packageName) {
    text += '}\n\n';
  }
  
  parsed.relations.forEach(r => {
    text += formatRelation(r) + '\n';
  });
  
  return text + '\n@enduml';
}

/** 格式化合并的 PlantUML（按包分组） */
function formatMergedPlantUML(allParsed: Map<string, ParsedData>, classPackageMap: Map<string, string>): string {
  let text = '@startuml\n\n';
  text += 'skinparam classAttributeIconSize 0\n';
  text += 'skinparam shadowing false\n';
  text += 'skinparam packageStyle rectangle\n\n';
  
  // 收集所有关系
  const allRelations: Relation[] = [];
  allParsed.forEach(parsed => {
    allRelations.push(...parsed.relations);
  });
  
  // 去重关系
  const uniqueRelations: Relation[] = [];
  const relationKeys = new Set<string>();
  allRelations.forEach(r => {
    const key = `${r.from}-${r.type}-${r.to}`;
    if (!relationKeys.has(key)) {
      relationKeys.add(key);
      uniqueRelations.push(r);
    }
  });
  
  // 按包输出类
  allParsed.forEach((parsed, packageName) => {
    text += `package "${packageName}" {\n`;
    
    parsed.classes.forEach(c => {
      if (c.isEnum) {
        text += `  enum "${c.name}" as ${c.name} {\n`;
      } else if (c.isInterface) {
        text += `  interface "${c.name}" as ${c.name} {\n`;
      } else if (c.isAbstract) {
        text += `  abstract class "${c.name}" as ${c.name} {\n`;
      } else {
        text += `  class "${c.name}" as ${c.name} {\n`;
      }
      
      const props = c.members.filter(m => m.kind === 'property');
      const meths = c.members.filter(m => m.kind === 'method');
      
      props.forEach(m => { text += `    ${formatMember(m)}\n`; });
      if (props.length && meths.length) { text += '    --\n'; }
      meths.forEach(m => { text += `    ${formatMember(m)}\n`; });
      
      text += '  }\n';
    });
    
    text += '}\n\n';
  });
  
  // 输出所有关系
  text += "' 关系\n";
  uniqueRelations.forEach(r => {
    text += formatRelation(r) + '\n';
  });
  
  return text + '\n@enduml';
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
  const allClasses: ClassInfo[] = [];
  const allRelations: Relation[] = [];
  
  allParsed.forEach(parsed => {
    allClasses.push(...parsed.classes);
    allRelations.push(...parsed.relations);
  });
  
  const diagram = layoutDiagram({ classes: allClasses, relations: allRelations });
  downloadFile('class-diagram.drawio', generateDrawioXML(diagram), 'application/xml');
}

/** 导出 SVG */
function exportSVG() {
  downloadFile('class-diagram.svg', `<?xml version="1.0" encoding="UTF-8"?>\n${diagramEl.innerHTML}`, 'image/svg+xml');
}

/** 导出 PlantUML */
function exportPlantUML() {
  const allParsed = mergeAllParsed();
  const classPackageMap = new Map<string, string>();
  
  allParsed.forEach((parsed, packageName) => {
    parsed.classes.forEach(c => {
      if (!classPackageMap.has(c.name)) {
        classPackageMap.set(c.name, packageName);
      }
    });
  });
  
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

// 初始化 - 加载示例
createTab('models', DEFAULT_CODE);
createTab('services', DEFAULT_CODE_2);