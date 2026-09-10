/** 导出动作：Draw.io / SVG / PlantUML */

import { ParsedData } from '../core/types';
import { mergeParsedData } from '../core/merge';
import { layoutDiagram } from '../core/layout';
import { generateDrawioXML } from '../core/drawio';
import { formatMergedPlantUML } from '../core/plantuml';

export interface ExportActions {
  exportDrawio(): void;
  exportSVG(): void;
  exportPlantUML(): void;
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

export function createExportActions(opts: {
  diagramEl: HTMLElement;
  mergeAllParsed: () => Map<string, ParsedData>;
}): ExportActions {
  const { diagramEl, mergeAllParsed } = opts;

  function exportDrawio() {
    const allParsed = mergeAllParsed();
    const { merged } = mergeParsedData(allParsed);
    const diagram = layoutDiagram(merged);
    downloadFile('class-diagram.drawio', generateDrawioXML(diagram), 'application/xml');
  }

  function exportSVG() {
    downloadFile('class-diagram.svg', `<?xml version="1.0" encoding="UTF-8"?>\n${diagramEl.innerHTML}`, 'image/svg+xml');
  }

  function exportPlantUML() {
    const allParsed = mergeAllParsed();
    const { classPackageMap } = mergeParsedData(allParsed);
    downloadFile('diagram.puml', formatMergedPlantUML(allParsed, classPackageMap), 'text/plain');
  }

  return { exportDrawio, exportSVG, exportPlantUML };
}
