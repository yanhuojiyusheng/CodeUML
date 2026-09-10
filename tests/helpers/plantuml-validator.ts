/**
 * PlantUML 语法自检器（测试辅助）
 *
 * 校验范围：
 * - @startuml / @enduml 框架
 * - 块括号平衡（package / class）
 * - 类/接口/枚举声明（引号 + as 别名）
 * - 成员行前缀（{static}/{abstract}/可见性）与括号平衡
 * - 属性/方法分隔符 --
 * - 六种关系箭头
 * - 多重性引号语法
 * - 标签位置（同行冒号后）
 */

const REL_ARROWS = '--\\|>|\\.\\.\\|>|-->|\\.\\.>|o--|\\*--';
const MULT_RE = /^(\d+|\*|\d+\.\.\d+|\d+\.\.\*|0\.\.1)$/;
const IDENT = '[$A-Za-z_\\u4e00-\\u9fff][$\\w\\u4e00-\\u9fff]*';

export function validatePlantUML(text: string): string[] {
  const errors: string[] = [];
  const lines = text.split('\n');
  const trimmed = lines.map(l => l.trim());

  const firstNonEmpty = trimmed.find(l => l.length);
  const lastNonEmpty = [...trimmed].reverse().find(l => l.length);
  if (firstNonEmpty !== '@startuml') errors.push('首行非空行应为 @startuml');
  if (lastNonEmpty !== '@enduml') errors.push('末行非空行应为 @enduml');
  if (lines.some(l => /\[object |NaN/.test(l))) {
    errors.push('输出中出现 JS 运行时残留（NaN/[object ...]）');
  }

  const stack: string[] = []; // 块栈：package / class

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const where = `行 ${i + 1}: `;

    if (line === '@startuml' || line === '@enduml') continue;
    if (/^skinparam\s+\w/.test(line)) continue;
    if (line.startsWith("'")) continue; // PlantUML 注释

    if (line === '}') {
      if (!stack.length) { errors.push(where + `多余的 '}'`); continue; }
      stack.pop();
      continue;
    }

    const pkgMatch = line.match(/^package\s+"([^"]*)"\s*\{$/);
    if (pkgMatch) { stack.push('package'); continue; }

    const clsMatch = line.match(new RegExp(
      `^(abstract\\s+)?(class|interface|enum)\\s+"([^"]*)"\\s+as\\s+(${IDENT})\\s*\\{$`));
    if (clsMatch) { stack.push('class'); continue; }

    if (stack[stack.length - 1] === 'class') {
      if (line === '--') continue; // 属性/方法分隔符
      if (/^(\{(static|abstract)\}\s+)*[+#~-]\s+/.test(line)) {
        // 括号平衡检查
        let depth = 0;
        for (const ch of line) {
          if (ch === '(') depth++;
          if (ch === ')') depth--;
        }
        if (depth !== 0) errors.push(where + '成员行括号不匹配: ' + line);
        continue;
      }
      errors.push(where + '非法成员行: ' + line);
      continue;
    }

    // 关系行：Name ["mult"] Arrow ["mult"] Name [: label]
    const relMatch = line.match(new RegExp(
      `^(${IDENT})(?:\\s+"([^"]*)")?\\s+(${REL_ARROWS})(?:\\s+"([^"]*)")?\\s+(${IDENT})(?:\\s*:\\s*(.*))?$`));
    if (relMatch) {
      const [, , fromMult, , toMult] = relMatch;
      if (fromMult !== undefined && !MULT_RE.test(fromMult)) {
        errors.push(where + `非法源端多重性 "${fromMult}"`);
      }
      if (toMult !== undefined && !MULT_RE.test(toMult)) {
        errors.push(where + `非法目标端多重性 "${toMult}"`);
      }
      continue;
    }

    errors.push(where + '无法识别的 PlantUML 语句: ' + line);
  }

  if (stack.length) errors.push(`存在未闭合的块: ${stack.join(' > ')}`);
  return errors;
}

/** 校验并返回 PlantUML 文本（用于 expect(validateOrThrow(puml)).toBe(...) 场景） */
export function validateOrThrow(text: string): string {
  const errors = validatePlantUML(text);
  if (errors.length) {
    throw new Error('PlantUML 语法自检失败:\n' + errors.join('\n') + '\n---\n' + text);
  }
  return text;
}
