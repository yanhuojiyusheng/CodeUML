/** 主入口 */

import { parseCode } from './parser';
import { layoutDiagram } from './layout';
import { renderSVG } from './renderer';
import { generateDrawioXML } from './exporter';
import { Diagram, ParsedData } from './types';

const codeEl = document.getElementById('code') as HTMLTextAreaElement;
const diagramEl = document.getElementById('diagram-view') as HTMLDivElement;
const xmlOutputEl = document.getElementById('xml-output') as HTMLTextAreaElement;
const parsedOutputEl = document.getElementById('parsed-output') as HTMLTextAreaElement;
const statusEl = document.getElementById('status') as HTMLDivElement;

let lastDiagram: Diagram = { boxes: [], lines: [], width: 0, height: 0 };
let lastParsed: ParsedData = { classes: [], relations: [] };

function update() {
  try {
    lastParsed = parseCode(codeEl.value);
    lastDiagram = layoutDiagram(lastParsed);
    
    // 更新图表视图
    diagramEl.innerHTML = renderSVG(lastDiagram);
    
    // 更新 XML 视图
    xmlOutputEl.value = generateDrawioXML(lastDiagram);
    
    // 更新解析结果视图
    parsedOutputEl.value = formatParsed(lastParsed);
    
    statusEl.textContent = `已解析 ${lastParsed.classes.length} 个类/接口, ${lastParsed.relations.length} 条关系`;
  } catch (e: any) {
    statusEl.textContent = '解析错误: ' + e.message;
    console.error(e);
  }
}

function formatParsed(parsed: ParsedData): string {
  let text = '@startuml\n\n';
  
  // 设置样式
  text += 'skinparam classAttributeIconSize 0\n';
  text += 'skinparam shadowing false\n\n';
  
  // 类/接口定义
  parsed.classes.forEach(c => {
    if (c.isInterface) {
      text += `interface "${c.name}" as ${c.name} {\n`;
    } else if (c.isAbstract) {
      text += `abstract class "${c.name}" as ${c.name} {\n`;
    } else {
      text += `class "${c.name}" as ${c.name} {\n`;
    }
    
    // 属性
    const props = c.members.filter(m => m.kind === 'property');
    const meths = c.members.filter(m => m.kind === 'method');
    
    props.forEach(m => {
      const staticStr = m.name.startsWith('{static}') ? '{static} ' : '';
      const name = m.name.replace('{static} ', '');
      text += `  ${staticStr}${m.modifier} ${name}${m.type ? ' : ' + m.type : ''}\n`;
    });
    
    if (props.length && meths.length) {
      text += '  --\n';
    }
    
    meths.forEach(m => {
      if (m.name === 'constructor') {
        text += `  + ${c.name}(${m.params || ''})\n`;
      } else {
        const staticStr = m.name.startsWith('{static}') ? '{static} ' : '';
        const name = m.name.replace('{static} ', '');
        text += `  ${staticStr}${m.modifier} ${name}(${m.params || ''})${m.type ? ' : ' + m.type : ''}\n`;
      }
    });
    
    text += '}\n\n';
  });
  
  // 关系
  if (parsed.relations.length) {
    parsed.relations.forEach(r => {
      let arrow = '';
      let label = '';
      
      switch (r.type) {
        case 'extends':
          arrow = '<|--';
          label = 'extends';
          break;
        case 'implements':
          arrow = '..|>';
          label = 'implements';
          break;
        case 'aggregation':
          arrow = 'o--';
          label = '';
          break;
        case 'composition':
          arrow = '*--';
          label = '';
          break;
        case 'dependency':
          arrow = '..>';
          label = '';
          break;
        case 'association':
          arrow = '-->';
          label = '';
          break;
        default:
          arrow = '-->';
          label = '';
      }
      
      // 多重性
      const fromMult = r.fromMultiplicity && r.fromMultiplicity !== '1' ? r.fromMultiplicity : '';
      const toMult = r.toMultiplicity && r.toMultiplicity !== '1' ? r.toMultiplicity : '';
      
      let relStr = `${r.from} ${arrow} ${r.to}`;
      if (label || fromMult || toMult) {
        relStr += ' : ';
        if (fromMult || toMult) {
          relStr += `${fromMult || ''}--${toMult || ''}`;
        }
        if (label) {
          relStr += (fromMult || toMult ? ' ' : '') + label;
        }
      }
      
      text += relStr + '\n';
    });
  }
  
  text += '\n@enduml';
  return text;
}

function downloadFile(name: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

function exportDrawio() {
  const xml = generateDrawioXML(lastDiagram);
  downloadFile('class-diagram.drawio', xml, 'application/xml');
}

function exportSVG() {
  const svgContent = diagramEl.innerHTML;
  const fullSvg = `<?xml version="1.0" encoding="UTF-8"?>\n${svgContent}`;
  downloadFile('class-diagram.svg', fullSvg, 'image/svg+xml');
}

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

// 暴露到全局供 HTML 按钮调用
(window as any).exportDrawio = exportDrawio;
(window as any).exportSVG = exportSVG;

// 初始化
let timer: number;
codeEl.addEventListener('input', () => {
  clearTimeout(timer);
  timer = window.setTimeout(update, 300);
});

update();