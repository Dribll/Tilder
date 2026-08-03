import { apiFetch } from './apiBase.js';

const LANGUAGE_NAME_HINTS = {
  c: ['C (GCC 9.2.0)', 'C (Clang 7.0.1)'],
  cpp: ['C++ (GCC 9.2.0)', 'C++ (Clang 7.0.1)'],
  csharp: ['C# (Mono 6.6.0.161)'],
  css: [],
  go: ['Go (1.13.5)'],
  html: [],
  java: ['Java (OpenJDK 13.0.1)'],
  javascript: ['JavaScript (Node.js 12.14.0)', 'JavaScript (Node.js 18.15.0)'],
  json: [],
  markdown: [],
  php: ['PHP (7.4.1)'],
  plaintext: [],
  python: ['Python (3.8.1)', 'Python (3.11.2)'],
  ruby: ['Ruby (2.7.0)'],
  rust: ['Rust (1.40.0)'],
  shell: ['Bash (5.0.0)'],
  sql: ['SQLite (3.27.2)'],
  typescript: ['TypeScript (3.7.4)', 'TypeScript (5.0.3)'],
  xml: [],
  yaml: [],
};

function normalizeName(value = '') {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

export async function fetchRunnerLanguages() {
  const response = await apiFetch('/api/runner/languages');
  if (!response.ok) {
    throw new Error('Unable to load runner languages.');
  }

  return response.json();
}

export function resolveRunnerLanguage(activeTab, languages) {
  if (!activeTab?.language) {
    return null;
  }

  const hints = LANGUAGE_NAME_HINTS[activeTab.language] || [];
  if (!hints.length) {
    return null;
  }

  const normalizedLanguages = languages.map((language) => ({
    ...language,
    normalizedName: normalizeName(language.name),
  }));

  for (const hint of hints) {
    const normalizedHint = normalizeName(hint);
    const match = normalizedLanguages.find((language) => language.normalizedName === normalizedHint);
    if (match) {
      return match;
    }
  }

  for (const hint of hints) {
    const normalizedHint = normalizeName(hint);
    const partialMatch = normalizedLanguages.find((language) => language.normalizedName.includes(normalizedHint.split('(')[0].trim()));
    if (partialMatch) {
      return partialMatch;
    }
  }

  return null;
}

export async function runCode({ source, languageId, stdin = '' }) {
  const response = await apiFetch('/api/runner/run', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      source_code: source,
      language_id: languageId,
      stdin,
    }),
  });

  if (!response.ok) {
    throw new Error('Runner request failed.');
  }

  return response.json();
}

export async function runCodeLocally({ name, language, source }) {
  // Legacy hosted local runner, replaced by direct terminal commands in Desktop.
  throw new Error("Use getRunCommandForTab and terminal execution in Desktop mode.");
}

export function getRunCommandForTab(tab, runtimes, cwd) {
  if (!tab || !tab.name) return null;
  
  const ext = tab.name.split('.').pop().toLowerCase();
  let lang = languageIdToCommandLang(tab.language) || languageIdToCommandLang(ext) || ext;
  
  let fileName = tab.name;
  let cdCommand = '';

  if (tab.nativePath) {
    const forwardPath = tab.nativePath.replace(/\\/g, '/');
    const fileDir = forwardPath.substring(0, forwardPath.lastIndexOf('/'));
    const baseName = forwardPath.substring(forwardPath.lastIndexOf('/') + 1);
    
    // Use PowerShell syntax by default since Tilder uses PowerShell on Windows
    cdCommand = `cd "${fileDir}" ; `;
    fileName = baseName;
  } else if (cwd && tab.path) {
    const forwardPath = `${cwd}/${tab.path === 'root' ? tab.name : tab.path}`.replace(/\\/g, '/');
    const fileDir = forwardPath.substring(0, forwardPath.lastIndexOf('/'));
    const baseName = forwardPath.substring(forwardPath.lastIndexOf('/') + 1);
    
    cdCommand = `cd "${fileDir}" ; `;
    fileName = baseName;
  } else if (tab.isUntitled && cwd) {
    const forwardPath = `${cwd}/${tab.name}`.replace(/\\/g, '/');
    const fileDir = forwardPath.substring(0, forwardPath.lastIndexOf('/'));
    const baseName = forwardPath.substring(forwardPath.lastIndexOf('/') + 1);
    
    cdCommand = `cd "${fileDir}" ; `;
    fileName = baseName;
  }
  
  const fileNoExt = fileName.substring(0, fileName.lastIndexOf('.')) || fileName;
  
  // Windows executable extension
  const exeExt = '.exe'; 
  
  let runCommand = null;
  switch (lang) {
    case 'python':
      runCommand = runtimes.python ? `${runtimes.python.executable} -u "${fileName}"` : `python -u "${fileName}"`;
      break;
    case 'javascript':
    case 'node':
      runCommand = runtimes.node ? `${runtimes.node.executable} "${fileName}"` : `node "${fileName}"`;
      break;
    case 'typescript':
      runCommand = `npx ts-node "${fileName}"`;
      break;
    case 'java':
      if (runtimes.javac && runtimes.java) {
        runCommand = `${runtimes.javac.executable} "${fileName}" && ${runtimes.java.executable} "${fileNoExt}"`;
      } else {
        runCommand = `javac "${fileName}" && java "${fileNoExt}"`;
      }
      break;
    case 'rust':
      runCommand = runtimes.rust 
        ? `${runtimes.rust.executable} "${fileName}" -o "${fileNoExt}${exeExt}" && .\\"${fileNoExt}${exeExt}"`
        : `rustc "${fileName}" -o "${fileNoExt}${exeExt}" && .\\"${fileNoExt}${exeExt}"`;
      break;
    case 'c':
      runCommand = runtimes.gcc
        ? `${runtimes.gcc.executable} "${fileName}" -o "${fileNoExt}${exeExt}" && .\\"${fileNoExt}${exeExt}"`
        : `gcc "${fileName}" -o "${fileNoExt}${exeExt}" && .\\"${fileNoExt}${exeExt}"`;
      break;
    case 'cpp':
      runCommand = runtimes['g++']
        ? `${runtimes['g++'].executable} "${fileName}" -o "${fileNoExt}${exeExt}" && .\\"${fileNoExt}${exeExt}"`
        : `g++ "${fileName}" -o "${fileNoExt}${exeExt}" && .\\"${fileNoExt}${exeExt}"`;
      break;
    case 'go':
      runCommand = runtimes.go ? `${runtimes.go.executable} run "${fileName}"` : `go run "${fileName}"`;
      break;
    case 'exe':
      runCommand = `.\\"${fileName}\\"`;
      break;
  }

  // Dynamic universal language resolver fallback (2000+ languages support)
  const UNIVERSAL_RUNNERS = {
    ruby: 'ruby',
    php: 'php',
    swift: 'swift',
    kotlin: 'kotlinc -script',
    scala: 'scala',
    elixir: 'elixir',
    lua: 'lua',
    perl: 'perl',
    dart: 'dart run',
    haskell: 'runhaskell',
    r: 'Rscript',
    shell: 'bash',
    bash: 'bash',
    powershell: 'powershell -File',
    bat: 'cmd /c',
    clojure: 'clojure',
    julia: 'julia',
  };

  const normalizedLang = lang.toLowerCase();
  if (!runCommand && UNIVERSAL_RUNNERS[normalizedLang]) {
    runCommand = `${UNIVERSAL_RUNNERS[normalizedLang]} "${fileName}"`;
  }
  
  if (runCommand) {
    return `${cdCommand}${runCommand}`;
  }
  
  return null;
}

function languageIdToCommandLang(id) {
  if (!id) return null;
  const mapping = {
    'py': 'python',
    'python': 'python',
    'js': 'javascript',
    'javascript': 'javascript',
    'ts': 'typescript',
    'typescript': 'typescript',
    'java': 'java',
    'rs': 'rust',
    'rust': 'rust',
    'c': 'c',
    'cpp': 'cpp',
    'go': 'go',
    'rb': 'ruby',
    'ruby': 'ruby',
    'php': 'php',
    'swift': 'swift',
    'kt': 'kotlin',
    'kotlin': 'kotlin',
    'scala': 'scala',
    'ex': 'elixir',
    'elixir': 'elixir',
    'lua': 'lua',
    'pl': 'perl',
    'perl': 'perl',
    'dart': 'dart',
    'hs': 'haskell',
    'haskell': 'haskell',
    'r': 'r',
    'sh': 'shell',
    'shell': 'shell',
    'bash': 'bash',
    'ps1': 'powershell',
    'powershell': 'powershell',
    'bat': 'bat',
    'clj': 'clojure',
    'clojure': 'clojure',
    'jl': 'julia',
    'julia': 'julia',
  };
  return mapping[id.toLowerCase()] || null;
}

export async function syncTerminalWorkspaceRoot(snapshot) {
  const response = await apiFetch('/api/terminal/workspace-root', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(snapshot),
  });

  if (!response.ok) {
    throw new Error('Unable to sync terminal workspace.');
  }

  return response.json();
}

export function formatRunResult(result) {
  const lines = [];

  if (result.stdout) {
    lines.push('=== Output ===');
    lines.push(result.stdout);
  }

  if (result.stderr) {
    lines.push('=== Error ===');
    lines.push(result.stderr);
  }

  if (result.compile_output) {
    lines.push('=== Compile Output ===');
    lines.push(result.compile_output);
  }

  if (result.message) {
    lines.push('=== Message ===');
    lines.push(result.message);
  }

  lines.push(`Status: ${result.status?.description || 'Unknown'}`);
  return lines;
}

export function formatLocalRunResult(result) {
  const lines = [];

  if (result.commandLines?.length) {
    lines.push('=== Command ===');
    result.commandLines.forEach((command) => lines.push(command));
  }

  if (result.stdout) {
    lines.push('=== Output ===');
    lines.push(result.stdout);
  }

  if (result.stderr) {
    lines.push(result.ok ? '=== Notes ===' : '=== Error ===');
    lines.push(result.stderr);
  }

  if (result.exitCode !== undefined && result.exitCode !== null) {
    lines.push(`Exit Code: ${result.exitCode}`);
  }

  return lines.length ? lines : ['Process finished.'];
}
