/**
 * 文件 / 文件夹可见性：路径归属规则 + 对解析输出的影响
 *
 * 设计：可见性是纯标记，不做级联判断。
 * 文件夹 / 顶部按钮被点击时，把结果“写穿”到名下条目。
 */

import { isUnderPath } from '../src/core/utils';
import { parseFilesWithCrossFileTypes, mergeParsedData } from '../src/core/merge';
import { formatMergedPlantUML } from '../src/core/plantuml';

/** 模拟 UI 侧：隐藏某文件夹后，其下所有文件都不参与解析 */
function plantumlWithFolderHidden(
  files: { folder: string; name: string; content: string }[],
  hiddenFolder: string,
): string {
  const visible = files.filter(f => !isUnderPath(f.folder, hiddenFolder));
  const parsed = parseFilesWithCrossFileTypes(visible.map(f => ({ name: f.name, content: f.content })));
  const { classPackageMap } = mergeParsedData(parsed);
  return formatMergedPlantUML(parsed, classPackageMap);
}

describe('路径归属规则 isUnderPath', () => {
  test('自身与后代匹配，兄弟目录不误伤', () => {
    expect(isUnderPath('src', 'src')).toBe(true);
    expect(isUnderPath('src/models', 'src')).toBe(true);
    expect(isUnderPath('src/models/deep', 'src')).toBe(true);
    expect(isUnderPath('srcc', 'src')).toBe(false);
    expect(isUnderPath('src/other', 'src/models')).toBe(false);
    expect(isUnderPath('', 'src')).toBe(false);
  });
});

describe('可见性影响 PlantUML 输出', () => {
  const files = [
    { folder: 'src', name: 'a', content: 'class A {}' },
    { folder: 'src/models', name: 'b', content: 'class B {}' },
    { folder: 'other', name: 'c', content: 'class C {}' },
  ];

  test('隐藏文件夹后其下所有子文件夹与文件的类都不出现', () => {
    const out = plantumlWithFolderHidden(files, 'src');
    expect(out).not.toContain('class "A"');
    expect(out).not.toContain('class "B"');
    expect(out).toContain('class "C"');
  });

  test('单独隐藏文件只影响该文件（纯标记，不牵连同级）', () => {
    const hidden = new Set(['1']);
    const visible = files
      .map((f, i) => ({ ...f, id: String(i + 1) }))
      .filter(f => !hidden.has(f.id));
    const parsed = parseFilesWithCrossFileTypes(visible.map(f => ({ name: f.name, content: f.content })));
    const { classPackageMap } = mergeParsedData(parsed);
    const out = formatMergedPlantUML(parsed, classPackageMap);
    expect(out).not.toContain('class "A"');
    expect(out).toContain('class "B"');
    expect(out).toContain('class "C"');
  });
});
