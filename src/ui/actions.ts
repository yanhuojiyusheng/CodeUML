/** 导出动作：SVG / PlantUML */

import { ParsedData } from '../core/types';
import { mergeParsedData } from '../core/merge';
import { layoutDiagram } from '../core/layout';
import { formatMergedPlantUML } from '../core/plantuml';

export interface ExportActions {
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
  /** 纯计算生成当前图表的 SVG（不依赖图表视图是否恰好是最新渲染的） */
  renderDiagramSVG: () => string;
  mergeAllParsed: () => Map<string, ParsedData>;
}): ExportActions {
  const { renderDiagramSVG, mergeAllParsed } = opts;

  function exportSVG() {
    downloadFile('class-diagram.svg', `<?xml version="1.0" encoding="UTF-8"?>\n${renderDiagramSVG()}`, 'image/svg+xml');
  }

  function exportPlantUML() {
    const allParsed = mergeAllParsed();
    const { classPackageMap } = mergeParsedData(allParsed);
    downloadFile('diagram.puml', formatMergedPlantUML(allParsed, classPackageMap), 'text/plain');
  }

  return { exportSVG, exportPlantUML };
}
