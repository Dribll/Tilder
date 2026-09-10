import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import workspace from '../../../../core/workspace.js';
import { desktopExecuteCommand, desktopReadFile } from '../../../../core/desktopFileApi.js';

function normalizePath(value) {
  return String(value || '')
    .replace(/^file:\/\//i, '')
    .replace(/\\/g, '/')
    .replace(/^\.\/+/, '');
}

function getCandidatePath(candidate) {
  return candidate?.path
    || candidate?.uri
    || candidate?.nativePath
    || candidate?.systemPath
    || candidate?.filePath
    || candidate?.absolutePath
    || candidate?.file?.path
    || candidate?.file?.uri
    || candidate?.file?.nativePath
    || candidate?.file?.systemPath;
}

function getCandidateName(candidate, path) {
  return candidate?.name
    || candidate?.fileName
    || candidate?.title
    || candidate?.file?.name
    || path.split('/').pop();
}

function addFile(files, seen, candidate) {
  if (!candidate) return;
  const rawPath = getCandidatePath(candidate);
  const path = normalizePath(rawPath);
  const name = getCandidateName(candidate, path);
  if (!path || !name || seen.has(path)) return;
  seen.add(path);
  files.push({
    ...candidate,
    path,
    name,
    nativePath: candidate.nativePath
      || candidate.file?.nativePath
      || candidate.systemPath
      || candidate.file?.systemPath
  });
}

function collectWorkspaceFiles(nodes, files = [], seen = new Set()) {
  const list = Array.isArray(nodes) ? nodes : nodes ? [nodes] : [];
  for (const node of list) {
    if (!node) continue;
    const hasChildren = Array.isArray(node.children) || Array.isArray(node.entries);
    if (node.type === 'file' || node.kind === 'file' || (!hasChildren && getCandidatePath(node))) {
      addFile(files, seen, node);
    }
    collectWorkspaceFiles(node.children || node.entries, files, seen);
  }
  return files;
}

function collectOpenTabFiles(tabs, files = [], seen = new Set()) {
  for (const tab of Array.isArray(tabs) ? tabs : []) {
    const rawPath = getCandidatePath(tab);
    const path = normalizePath(rawPath);
    const name = getCandidateName(tab, path);
    const normalizedName = String(name || '').toLowerCase();
    if (!path || !name || normalizedName === 'welcome' || normalizedName === 'welcome.md') continue;
    addFile(files, seen, { ...tab, path, name });
  }
  return files;
}

function readSource(candidate) {
  return typeof candidate?.content === 'string'
    ? candidate.content
    : typeof candidate?.text === 'string'
      ? candidate.text
      : '';
}

function getTestProfile(file, source = '') {
  const name = String(file?.name || file?.path || '').split(/[\\\/]/).pop();
  const lowerName = name.toLowerCase();
  const text = String(source || '');

  if (lowerName.endsWith('.py')) {
    const detected = /^test(?:_[^.]*)?\.py$/i.test(name)
      || /(?:^|_)test\.py$/i.test(name)
      || /\bdef\s+test_[A-Za-z0-9_]+\s*\(/.test(text)
      || /\b(?:unittest|pytest)\b/.test(text);
    return detected ? { language: 'Python', framework: /\bpytest\b/.test(text) ? 'pytest' : 'unittest', key: 'python' } : null;
  }

  if (/\.(m?js|cjs|jsx|ts|tsx)$/.test(lowerName)) {
    const detected = /(?:^|[._-])(test|spec)(?:[._-]|$)/i.test(name)
      || /\b(?:describe|it|test)\s*\(/.test(text);
    return detected ? { language: 'JS/TS', framework: lowerName.endsWith('.ts') || lowerName.endsWith('.tsx') ? 'ts-node test' : 'node test', key: 'javascript' } : null;
  }

  if (lowerName.endsWith('.go')) {
    const detected = /_test\.go$/i.test(name) || /\bfunc\s+Test[A-Z]\w*\s*\(/.test(text);
    return detected ? { language: 'Go', framework: 'go test', key: 'go' } : null;
  }

  if (lowerName.endsWith('.rs')) {
    const detected = /_test\.rs$/i.test(name) || /#\s*\[\s*test\s*\]/.test(text);
    return detected ? { language: 'Rust', framework: 'cargo test', key: 'rust' } : null;
  }

  if (lowerName.endsWith('.java')) {
    const detected = /(?:^|[._-])test(?:[._-]|$)/i.test(name) || /@(?:Test|ParameterizedTest)\b/.test(text);
    return detected ? { language: 'Java', framework: 'JUnit', key: 'java' } : null;
  }

  if (/\.(c|cc|cpp|cxx|h|hpp)$/.test(lowerName)) {
    const detected = /(?:^|[._-])test(?:[._-]|$)/i.test(name) || /\b(?:TEST|TEST_F|TEST_CASE)\s*\(/.test(text);
    return detected ? { language: 'C/C++', framework: 'CTest', key: 'cpp' } : null;
  }

  if (lowerName.endsWith('.cs')) {
    const detected = /(?:^|[._-])test(?:[._-]|$)/i.test(name) || /\[(?:Test|Fact|Theory)\]/.test(text);
    return detected ? { language: 'C#', framework: 'dotnet test', key: 'csharp' } : null;
  }

  return null;
}

function resolveFilePath(file) {
  const direct = file?.nativePath || file?.systemPath;
  if (direct) return String(direct);
  return workspace.resolveAbsolutePath(file.path);
}

function getDirectory(filePath) {
  const index = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
  return index > 0 ? filePath.slice(0, index) : filePath;
}

function getCommand(file, profile, source) {
  const name = String(file.name || file.path).toLowerCase();
  if (profile.key === 'javascript') {
    if (/\.(ts|tsx)$/.test(name)) return { command: 'npx', args: ['--no-install', 'tsx', '--test', file.name] };
    return { command: 'node', args: ['--test', file.name] };
  }
  if (profile.key === 'python') {
    const hasPytest = /\bpytest\b/.test(source) || /\bdef\s+test_/.test(source);
    return hasPytest
      ? { command: 'python', args: ['-m', 'pytest', file.name] }
      : { command: 'python', args: ['-u', file.name] };
  }
  if (profile.key === 'go') return { command: 'go', args: ['test', '.'] };
  if (profile.key === 'rust') return { command: 'cargo', args: ['test'] };
  if (profile.key === 'cpp') return { command: 'ctest', args: ['--test-dir', '.'] };
  if (profile.key === 'csharp') return { command: 'dotnet', args: ['test', '--no-restore'] };
  if (profile.key === 'java') throw new Error('Java tests need Maven or Gradle. Add pom.xml or build.gradle.');
  throw new Error('No test command configured for ' + file.name);
}

// Status helpers
function getStatusDot(status) {
  if (status === 'running') return { icon: 'fa-circle-notch fa-spin', color: '#f5a623' };
  if (status === 'passed')  return { icon: 'fa-circle-check',        color: '#30d158' };
  if (status === 'failed')  return { icon: 'fa-circle-xmark',        color: '#ff453a' };
  return                           { icon: 'fa-circle',              color: 'rgba(174,183,214,0.25)' };
}

const LANG_COLORS = {
  python:     '#3d85c8',
  javascript: '#f1c40f',
  go:         '#00acd7',
  rust:       '#e67e22',
  cpp:        '#7b68ee',
  csharp:     '#9b59b6',
  java:       '#e74c3c',
};

export default function TestRunner({ ariaExpandedisplaytestrunner, onRunTest, pushNotification }) {
  const [testFiles, setTestFiles] = useState([]);
  const [results, setResults] = useState({});
  const [running, setRunning] = useState(false);
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState({});
  const [filterMode, setFilterMode] = useState('all');
  const [coverageExpanded, setCoverageExpanded] = useState(false);
  const runningRef = useRef(false);
  const cancelRef = useRef(false);
  const searchRef = useRef(null);

  const refreshTestFiles = useCallback(() => {
    if (ariaExpandedisplaytestrunner === 'none') return;
    const files = [];
    const seen = new Set();
    collectWorkspaceFiles(workspace.tree, files, seen);
    collectOpenTabFiles(workspace.tabs, files, seen);
    const active = workspace.getActiveTab?.();
    if (active) addFile(files, seen, active);
    setTestFiles(files.filter(file => getTestProfile(file, readSource(file))));
  }, [ariaExpandedisplaytestrunner]);

  useEffect(() => {
    refreshTestFiles();
    const events = [
      'tilder:workspace-updated',
      'tilder:workspace-tree-updated',
      'tilder:tabs-updated',
      'tilder:active-tab-changed',
      'tilder:file-saved',
      'tilder:files-changed'
    ];
    events.forEach(event => window.addEventListener(event, refreshTestFiles));
    return () => events.forEach(event => window.removeEventListener(event, refreshTestFiles));
  }, [refreshTestFiles]);

  const visibleFiles = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return testFiles;
    return testFiles.filter(file => `${file.name} ${file.path}`.toLowerCase().includes(term));
  }, [query, testFiles]);

  const summary = useMemo(() => {
    const values = Object.values(results);
    return {
      total: testFiles.length,
      passed: values.filter(r => r.status === 'passed').length,
      failed: values.filter(r => r.status === 'failed').length,
      duration: values.reduce((t, r) => t + (Number(r.time) || 0), 0),
    };
  }, [results, testFiles.length]);

  const failedCount = summary.failed;

  const filteredFiles = useMemo(() => {
    if (filterMode === 'failed') return visibleFiles.filter(f => results[f.path]?.status === 'failed');
    if (filterMode === 'passed') return visibleFiles.filter(f => results[f.path]?.status === 'passed');
    return visibleFiles;
  }, [visibleFiles, filterMode, results]);

  const runTest = useCallback(async (file, batch = false) => {
    if (!file || (!batch && runningRef.current)) return;
    if (!workspace.isDesktopWorkspace() || !workspace.rootSystemPath) {
      pushNotification?.('Test running is only supported in desktop workspaces', 'error');
      return;
    }
    const startedAt = Date.now();
    setRunning(true);
    runningRef.current = true;
    setResults(prev => ({ ...prev, [file.path]: { status: 'running' } }));
    try {
      const filePath = resolveFilePath(file);
      const raw = await desktopReadFile(filePath).catch(() => '');
      const source = typeof raw === 'string' ? raw : raw?.content || raw?.text || '';
      const profile = getTestProfile(file, source);
      if (!profile) throw new Error('No supported tests detected in this file.');
      const { command, args } = getCommand(file, profile, source);
      const result = await desktopExecuteCommand(command, args, getDirectory(filePath));
      const exitCode = Number.isFinite(result?.exitCode) ? result.exitCode : result?.code;
      const output = [result?.stdout, result?.stderr, result?.output].filter(Boolean).join('\n').trim();
      const passed = exitCode === 0;
      setResults(prev => ({ ...prev, [file.path]: { status: passed ? 'passed' : 'failed', time: Date.now() - startedAt, output, exitCode, profile } }));
      onRunTest?.(file);
      pushNotification?.(`${passed ? '✓ Passed: ' : '✗ Failed: '}${file.name}`, passed ? 'success' : 'error');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setResults(prev => ({ ...prev, [file.path]: { status: 'failed', time: Date.now() - startedAt, error: message } }));
      pushNotification?.('Error: ' + message, 'error');
    } finally {
      if (!batch) { setRunning(false); runningRef.current = false; }
    }
  }, [onRunTest, pushNotification]);

  const runAllTests = useCallback(async () => {
    if (runningRef.current || !testFiles.length) return;
    cancelRef.current = false;
    runningRef.current = true;
    setRunning(true);
    for (const file of testFiles) {
      if (cancelRef.current) break;
      await runTest(file, true);
    }
    setRunning(false);
    runningRef.current = false;
  }, [runTest, testFiles]);

  const stopTests = useCallback(() => {
    cancelRef.current = true;
    pushNotification?.('Stopping after the current test finishes…', 'info');
  }, [pushNotification]);

  const runAllFailed = useCallback(async () => {
    const failed = testFiles.filter(f => results[f.path]?.status === 'failed');
    if (runningRef.current || !failed.length) return;
    cancelRef.current = false;
    runningRef.current = true;
    setRunning(true);
    for (const file of failed) {
      if (cancelRef.current) break;
      await runTest(file, true);
    }
    setRunning(false);
    runningRef.current = false;
  }, [runTest, testFiles, results]);

  const hasResults = Object.keys(results).length > 0;

  return (
    <div className={'sidebarscontent d-' + ariaExpandedisplaytestrunner}>
      <div className="tr-shell">

        {/* ── Top header bar ── */}
        <div className="tr-header">
          <div className="tr-header-left">
            <i className="fa-solid fa-flask tr-header-icon" />
            <span className="tr-title">Testing</span>
          </div>
          <div className="tr-header-actions">
            {running ? (
              <button type="button" className="tr-icon-btn tr-icon-btn--stop" title="Stop" onClick={stopTests}>
                <i className="fa-solid fa-stop" />
              </button>
            ) : (
              <button type="button" className="tr-icon-btn tr-icon-btn--run" title="Run all tests" onClick={runAllTests} disabled={!testFiles.length}>
                <i className="fa-solid fa-play" />
              </button>
            )}
            {failedCount > 0 && !running && (
              <button type="button" className="tr-icon-btn tr-icon-btn--rerun" title="Re-run failed" onClick={runAllFailed}>
                <i className="fa-solid fa-rotate-right" />
              </button>
            )}
            <button type="button" className="tr-icon-btn" title="Refresh discovery" onClick={refreshTestFiles}>
              <i className="fa-solid fa-rotate" />
            </button>
            {hasResults && (
              <button type="button" className="tr-icon-btn" title="Clear results" onClick={() => setResults({})}>
                <i className="fa-regular fa-trash-can" />
              </button>
            )}
          </div>
        </div>

        {/* ── Summary bar ── */}
        {testFiles.length > 0 && (
          <div className="tr-summary">
            <button
              type="button"
              className={`tr-pill${filterMode === 'all' ? ' tr-pill--active' : ''}`}
              onClick={() => setFilterMode('all')}
            >
              <span className="tr-pill-dot" style={{ background: 'rgba(174,183,214,0.4)' }} />
              {summary.total} test{summary.total !== 1 ? 's' : ''}
            </button>

            <button
              type="button"
              className={`tr-pill tr-pill--pass${filterMode === 'passed' ? ' tr-pill--active' : ''}${!summary.passed ? ' tr-pill--dim' : ''}`}
              onClick={() => setFilterMode(filterMode === 'passed' ? 'all' : 'passed')}
              disabled={!summary.passed}
            >
              <span className="tr-pill-dot" style={{ background: '#30d158' }} />
              {summary.passed} passed
            </button>

            <button
              type="button"
              className={`tr-pill tr-pill--fail${filterMode === 'failed' ? ' tr-pill--active' : ''}${!summary.failed ? ' tr-pill--dim' : ''}`}
              onClick={() => setFilterMode(filterMode === 'failed' ? 'all' : 'failed')}
              disabled={!summary.failed}
            >
              <span className="tr-pill-dot" style={{ background: '#ff453a' }} />
              {summary.failed} failed
            </button>

            {summary.duration > 0 && (
              <span className="tr-pill tr-pill--time">
                <i className="fa-regular fa-clock" style={{ fontSize: 9 }} />
                {summary.duration >= 1000 ? `${(summary.duration / 1000).toFixed(1)}s` : `${summary.duration}ms`}
              </span>
            )}
          </div>
        )}

        {/* ── Search ── */}
        <div className="tr-search-wrap">
          <div className="tr-search">
            <i className="fa-solid fa-magnifying-glass tr-search-icon" />
            <input
              ref={searchRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Filter tests…"
              spellCheck={false}
            />
            {query && (
              <button type="button" className="tr-search-clear" onClick={() => { setQuery(''); searchRef.current?.focus(); }}>
                <i className="fa-solid fa-xmark" />
              </button>
            )}
          </div>
        </div>

        {/* ── List ── */}
        <div className="tr-list">
          {!testFiles.length ? (
            <div className="tr-empty">
              <div className="tr-empty-glyph">
                <i className="fa-solid fa-flask" />
              </div>
              <div className="tr-empty-title">No Tests Found</div>
              <div className="tr-empty-sub">Supports Jest, Vitest, pytest,<br />go test, cargo test, dotnet test</div>
              <button type="button" className="tr-cta-btn" onClick={refreshTestFiles}>
                <i className="fa-solid fa-rotate" /> Refresh
              </button>
            </div>
          ) : filteredFiles.length === 0 ? (
            <div className="tr-empty tr-empty--sm">
              <i className="fa-solid fa-filter" style={{ fontSize: 18, color: 'rgba(174,183,214,0.25)', marginBottom: 8 }} />
              <div className="tr-empty-sub">No {filterMode} tests yet</div>
            </div>
          ) : (
            filteredFiles.map(file => {
              const result = results[file.path];
              const isExpanded = Boolean(expanded[file.path]);
              const profile = result?.profile || getTestProfile(file, readSource(file));
              const { icon, color } = getStatusDot(result?.status);
              const langColor = LANG_COLORS[profile?.key] || 'rgba(174,183,214,0.3)';

              return (
                <div key={file.path} className={`tr-item${result?.status ? ' tr-item--' + result.status : ''}`}>
                  <div className="tr-item-row">
                    {/* Status indicator / click to run */}
                    <button
                      type="button"
                      className="tr-dot-btn"
                      title={`Run ${file.name}`}
                      onClick={() => runTest(file)}
                    >
                      <i className={`fa-solid ${icon}`} style={{ color }} />
                    </button>

                    {/* File info */}
                    <button
                      type="button"
                      className="tr-item-body"
                      onClick={() => setExpanded(prev => ({ ...prev, [file.path]: !isExpanded }))}
                    >
                      <span className="tr-item-name">{file.name}</span>
                      <div className="tr-item-meta">
                        {profile && (
                          <span className="tr-item-tag" style={{ color: langColor, borderColor: langColor + '40', background: langColor + '15' }}>
                            {profile.framework}
                          </span>
                        )}
                        {result?.time != null && (
                          <span className="tr-item-time">{result.time >= 1000 ? `${(result.time / 1000).toFixed(1)}s` : `${result.time}ms`}</span>
                        )}
                      </div>
                    </button>

                    {/* Run button (on hover) */}
                    <button
                      type="button"
                      className="tr-run-btn"
                      onClick={() => runTest(file)}
                      disabled={running}
                      title="Run"
                    >
                      <i className="fa-solid fa-play" />
                    </button>

                    {/* Expand chevron */}
                    <button
                      type="button"
                      className="tr-expand-btn"
                      onClick={() => setExpanded(prev => ({ ...prev, [file.path]: !isExpanded }))}
                      title={isExpanded ? 'Collapse' : 'Expand'}
                    >
                      <i className={`fa-solid fa-chevron-${isExpanded ? 'down' : 'right'}`} />
                    </button>
                  </div>

                  {isExpanded && (
                    <div className="tr-output">
                      {result?.error && <div className="tr-output-error">{result.error}</div>}
                      {result?.output ? (
                        <pre className="tr-output-pre">{result.output}</pre>
                      ) : (
                        <span className="tr-output-hint">Run this test to see output.</span>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* ── Coverage footer ── */}
        <div className="tr-coverage">
          <button
            type="button"
            className="tr-coverage-header"
            onClick={() => setCoverageExpanded(p => !p)}
          >
            <i className={`fa-solid fa-chevron-${coverageExpanded ? 'down' : 'right'} tr-coverage-chevron`} />
            <span>Coverage</span>
          </button>
          {coverageExpanded && (
            <div className="tr-coverage-body">
              Coverage not available. Run tests with <code>--coverage</code> to generate a report.
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

