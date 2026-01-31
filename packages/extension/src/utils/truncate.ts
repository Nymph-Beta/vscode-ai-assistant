/**
 * 输出截断工具
 * 参考 Roo-Code: src/integrations/misc/extract-text.ts
 * 
 * 策略：保留前 20% + 后 80%，中间添加省略标记
 * 字符限制优先于行数限制
 */

/**
 * 截断输出内容
 * 
 * @param content 原始内容
 * @param lineLimit 行数限制（可选）
 * @param characterLimit 字符数限制（可选，优先级更高）
 * @returns 截断后的内容
 * 
 * @example
 * // 字符限制截断:
 * // 内容长度 50000，限制 40000
 * // 结果: 前 8000 字符 + "[...10000 characters omitted...]" + 后 32000 字符
 * 
 * @example
 * // 行数限制截断:
 * // 总行数 100，限制 50
 * // 结果: 前 10 行 + "[...50 lines omitted...]" + 后 40 行
 */
export function truncateOutput(
  content: string,
  lineLimit?: number,
  characterLimit?: number
): string {
  // 如果没有指定限制，返回原内容
  if (!lineLimit && !characterLimit) {
    return content;
  }

  // 字符限制优先于行数限制
  if (characterLimit && content.length > characterLimit) {
    const beforeLimit = Math.floor(characterLimit * 0.2); // 前 20%
    const afterLimit = characterLimit - beforeLimit;       // 后 80%

    const startSection = content.slice(0, beforeLimit);
    const endSection = content.slice(-afterLimit);
    const omittedChars = content.length - characterLimit;

    return `${startSection}\n[...${omittedChars} characters omitted...]\n${endSection}`;
  }

  // 如果字符限制未超出或未指定，检查行数限制
  if (!lineLimit) {
    return content;
  }

  // 计算总行数
  let totalLines = 0;
  let pos = -1;
  pos = content.indexOf("\n", pos + 1);
  while (pos !== -1) {
    totalLines++;
    pos = content.indexOf("\n", pos + 1);
  }
  totalLines++; // 最后一行没有换行符

  if (totalLines <= lineLimit) {
    return content;
  }

  const beforeLimit = Math.floor(lineLimit * 0.2); // 前 20% 行
  const afterLimit = lineLimit - beforeLimit;       // 后 80% 行

  // 查找前段结束位置
  let startEndPos = -1;
  let lineCount = 0;
  pos = 0;
  pos = content.indexOf("\n", pos);
  while (lineCount < beforeLimit && pos !== -1) {
    startEndPos = pos;
    lineCount++;
    pos++;
    pos = content.indexOf("\n", pos);
  }

  // 查找后段开始位置
  let endStartPos = content.length;
  lineCount = 0;
  pos = content.length;
  pos = content.lastIndexOf("\n", pos - 1);
  while (lineCount < afterLimit && pos !== -1) {
    endStartPos = pos + 1; // 从换行符后开始
    lineCount++;
    pos = content.lastIndexOf("\n", pos - 1);
  }

  const omittedLines = totalLines - lineLimit;
  const startSection = content.slice(0, startEndPos + 1);
  const endSection = content.slice(endStartPos);

  return `${startSection}\n[...${omittedLines} lines omitted...]\n\n${endSection}`;
}

/**
 * 对重复行应用 RLE（游程编码）压缩
 * 仅当压缩后的描述比重复内容更短时才压缩
 * 
 * @param content 原始内容
 * @returns 压缩后的内容
 * 
 * @example
 * // 输入:
 * // "line1\nline1\nline1\nline1\nline2"
 * // 输出:
 * // "line1\n[Previous line repeated 3 more times]\nline2"
 */
export function applyRunLengthEncoding(content: string): string {
  if (!content) {
    return content;
  }

  let result = "";
  let pos = 0;
  let repeatCount = 0;
  let prevLine: string | null = null;

  while (pos < content.length) {
    const nextNewlineIdx = content.indexOf("\n", pos);
    const currentLine = nextNewlineIdx === -1
      ? content.slice(pos)
      : content.slice(pos, nextNewlineIdx + 1);

    if (currentLine === prevLine) {
      repeatCount++;
    } else {
      if (repeatCount > 0 && prevLine !== null) {
        const repeatDesc = `[Previous line repeated ${repeatCount} more time${repeatCount > 1 ? "s" : ""}]\n`;
        // 只有压缩描述更短时才使用
        if (repeatDesc.length < prevLine.length * repeatCount) {
          result += repeatDesc;
        } else {
          result += prevLine.repeat(repeatCount);
        }
      }
      result += currentLine;
      prevLine = currentLine;
      repeatCount = 0;
    }

    pos = nextNewlineIdx === -1 ? content.length : nextNewlineIdx + 1;
  }

  // 处理末尾重复
  if (repeatCount > 0 && prevLine !== null) {
    const repeatDesc = `[Previous line repeated ${repeatCount} more time${repeatCount > 1 ? "s" : ""}]\n`;
    if (repeatDesc.length < prevLine.length * repeatCount) {
      result += repeatDesc;
    } else {
      result += prevLine.repeat(repeatCount);
    }
  }

  return result;
}

/**
 * 处理工具输出：先应用 RLE 压缩，再应用截断
 * 
 * @param content 原始内容
 * @param options 配置选项
 * @returns 处理后的内容
 */
export function processToolOutput(
  content: string,
  options: {
    lineLimit?: number;
    characterLimit?: number;
    enableRLE?: boolean;
  } = {}
): string {
  const {
    lineLimit = 500,
    characterLimit = 15000,
    enableRLE = true,
  } = options;

  let result = content;

  // 先应用 RLE 压缩（如果启用）
  if (enableRLE) {
    result = applyRunLengthEncoding(result);
  }

  // 再应用截断
  result = truncateOutput(result, lineLimit, characterLimit);

  return result;
}
