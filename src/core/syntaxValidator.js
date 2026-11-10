/**
 * Tilder Real-Time Syntax Validator
 * Lightweight client-side lexer for instant error detection in Monaco.
 * Feeds monaco.editor.setModelMarkers for squiggly underlines + Problems panel.
 *
 * Supported: JavaScript, TypeScript, Python, C, C++, Java, Rust, Go, C#, PHP, Ruby
 */

const SEVERITY_ERROR = 8; // monaco.MarkerSeverity.Error
const SEVERITY_WARN  = 4; // monaco.MarkerSeverity.Warning

/**
 * Check for unclosed string literals on a single line.
 * Returns array of { message, col }.
 */
function checkUnclosedStrings(line) {
  let inSingle = false, inDouble = false, inTemplate = false;
  let singleStart = 0, doubleStart = 0, templateStart = 0;
  const results = [];

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '\\' && (inSingle || inDouble || inTemplate)) { i++; continue; }
    if (ch === "'" && !inDouble && !inTemplate) {
      if (inSingle) { inSingle = false; } else { inSingle = true; singleStart = i + 1; }
    } else if (ch === '"' && !inSingle && !inTemplate) {
      if (inDouble) { inDouble = false; } else { inDouble = true; doubleStart = i + 1; }
    } else if (ch === '`' && !inSingle && !inDouble) {
      if (inTemplate) { inTemplate = false; } else { inTemplate = true; templateStart = i + 1; }
    }
  }

  if (inSingle) results.push({ message: "Unclosed string literal (missing closing ')", col: singleStart });
  if (inDouble) results.push({ message: 'Unclosed string literal (missing closing ")', col: doubleStart });
  if (inTemplate) results.push({ message: 'Unclosed template literal (missing closing `)', col: templateStart });
  return results;
}

/**
 * Check bracket/brace/paren matching across the whole file.
 */
function checkBrackets(lines) {
  const stack = [];
  const markers = [];
  const pairs = { '(': ')', '[': ']', '{': '}' };
  const closes = new Set([')', ']', '}']);
  const opens  = new Set(['(', '[', '{']);
  let inBlockComment = false;

  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    let inSingle = false, inDouble = false, inTemplate = false, inLineComment = false;

    for (let ci = 0; ci < line.length; ci++) {
      const ch = line[ci];
      const next = line[ci + 1] || '';

      if (!inSingle && !inDouble && !inTemplate && !inLineComment) {
        if (ch === '/' && next === '*') { inBlockComment = true; ci++; continue; }
      }
      if (inBlockComment) {
        if (ch === '*' && next === '/') { inBlockComment = false; ci++; }
        continue;
      }
      if (inLineComment) continue;

      if (!inSingle && !inDouble && !inTemplate) {
        if (ch === '/' && next === '/') { inLineComment = true; continue; }
        if (ch === '#') { inLineComment = true; continue; }
      }

      if (ch === '\\' && (inSingle || inDouble || inTemplate)) { ci++; continue; }
      if (ch === "'" && !inDouble && !inTemplate) { inSingle = !inSingle; continue; }
      if (ch === '"' && !inSingle && !inTemplate) { inDouble = !inDouble; continue; }
      if (ch === '`' && !inSingle && !inDouble) { inTemplate = !inTemplate; continue; }
      if (inSingle || inDouble || inTemplate) continue;

      if (opens.has(ch)) {
        stack.push({ ch, line: li + 1, col: ci + 1 });
      } else if (closes.has(ch)) {
        if (stack.length === 0) {
          markers.push({
            startLineNumber: li + 1, startColumn: ci + 1,
            endLineNumber: li + 1, endColumn: ci + 2,
            message: `Unexpected '${ch}' — no matching opening bracket`,
            severity: SEVERITY_ERROR,
          });
        } else {
          const top = stack[stack.length - 1];
          if (pairs[top.ch] === ch) {
            stack.pop();
          } else {
            markers.push({
              startLineNumber: li + 1, startColumn: ci + 1,
              endLineNumber: li + 1, endColumn: ci + 2,
              message: `Mismatched bracket: expected '${pairs[top.ch]}' to close '${top.ch}' (line ${top.line}:${top.col}), found '${ch}'`,
              severity: SEVERITY_ERROR,
            });
            stack.pop();
          }
        }
      }
    }
  }

  for (const { ch, line, col } of stack) {
    markers.push({
      startLineNumber: line, startColumn: col,
      endLineNumber: line, endColumn: col + 1,
      message: `Unclosed '${ch}' — missing closing '${pairs[ch]}'`,
      severity: SEVERITY_ERROR,
    });
  }

  return markers;
}

/**
 * Python: Check for missing colons after control-flow keywords.
 */
function checkPythonColons(lines) {
  const markers = [];
  const kwRe = /^\s*(def|class|if|elif|else|for|while|try|except|finally|with|async\s+def|async\s+for|async\s+with)\b(.*)/;

  for (let i = 0; i < lines.length; i++) {
    const stripped = lines[i].replace(/#[^'"]*$/, '').trimEnd();
    if (!stripped.trim()) continue;
    const m = stripped.match(kwRe);
    if (!m) continue;
    const last = stripped[stripped.length - 1];
    if (last !== ':' && last !== '\\' && !/[,(&|+\-*/%^~]$/.test(stripped)) {
      const col = stripped.trimEnd().length + 1;
      markers.push({
        startLineNumber: i + 1, startColumn: col,
        endLineNumber: i + 1, endColumn: col + 1,
        message: `Expected ':' at end of '${m[1].trim()}' block`,
        severity: SEVERITY_ERROR,
      });
    }
  }
  return markers;
}

/**
 * Main validation entry point.
 * @param {string} code - Full source code text
 * @param {string} language - Monaco language id
 * @returns {Array} Array of Monaco IMarkerData objects
 */
export function validateSyntax(code, language) {
  if (!code || !language) return [];
  const lines = code.split('\n');
  const markers = [];

  try {
    const bracketMarkers = checkBrackets(lines);
    markers.push(...bracketMarkers);

    const errorLines = new Set(bracketMarkers.map(m => m.startLineNumber));
    for (let i = 0; i < lines.length; i++) {
      if (errorLines.has(i + 1)) continue;
      for (const { message, col } of checkUnclosedStrings(lines[i])) {
        markers.push({
          startLineNumber: i + 1, startColumn: col,
          endLineNumber: i + 1, endColumn: lines[i].length + 1,
          message, severity: SEVERITY_ERROR,
        });
      }
    }

    if (language === 'python') {
      markers.push(...checkPythonColons(lines));
    }
  } catch (err) {
    console.warn('[SyntaxValidator] Internal error:', err);
  }

  const seen = new Set();
  return markers.filter(m => {
    const key = `${m.startLineNumber}:${m.startColumn}:${m.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export default validateSyntax;
