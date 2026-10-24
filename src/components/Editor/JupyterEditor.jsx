import React, { useState, useEffect, useRef, useCallback } from 'react';
import MonacoEditor from './MonacoEditor';
import { apiFetch } from '../../core/apiBase';
import './JupyterEditor.css';

/**
 * JupyterEditor - Interactive Jupyter Notebook (.ipynb) viewer & execution environment
 * Supports code & markdown cells, execution via Python kernel, output rendering,
 * adding/deleting/moving cells, clear outputs, run all, restart kernel, and saving back to .ipynb.
 */
export default function JupyterEditor({ tab, onChange, settings }) {
  const [notebook, setNotebook] = useState(null);
  const [activeCellIndex, setActiveCellIndex] = useState(0);
  const [executingIndices, setExecutingIndices] = useState(new Set());
  const [kernelStatus, setKernelStatus] = useState('idle'); // 'idle' | 'busy' | 'error'
  const sessionIdRef = useRef(tab?.path || tab?.id || 'default');
  const executionCountRef = useRef(1);

  // Parse .ipynb JSON content
  useEffect(() => {
    try {
      let raw = tab?.content;
      if (typeof raw === 'string') {
        const parsed = JSON.parse(raw);
        if (parsed.cells && Array.isArray(parsed.cells)) {
          // Normalize cells
          const normalizedCells = parsed.cells.map((cell, idx) => ({
            id: cell.id || `cell-${idx}-${Date.now()}`,
            cell_type: cell.cell_type || 'code',
            source: Array.isArray(cell.source) ? cell.source.join('') : (cell.source || ''),
            outputs: cell.outputs || [],
            execution_count: cell.execution_count ?? null,
            metadata: cell.metadata || {},
          }));
          setNotebook({
            ...parsed,
            cells: normalizedCells,
          });
          return;
        }
      }
    } catch (e) {
      console.warn('[JupyterEditor] Failed to parse initial notebook JSON, creating starter template:', e);
    }

    // Default template if empty or unparseable
    setNotebook({
      nbformat: 4,
      nbformat_minor: 5,
      metadata: {
        kernelspec: {
          display_name: 'Python 3',
          language: 'python',
          name: 'python3'
        },
        language_info: {
          name: 'python',
          version: '3.14'
        }
      },
      cells: [
        {
          id: 'cell-0',
          cell_type: 'code',
          source: '# Welcome to Tilder Jupyter Notebook\nprint("Hello from Tilder!")',
          outputs: [],
          execution_count: null,
          metadata: {}
        }
      ]
    });
  }, [tab?.id]);

  // Synchronize notebook updates to tab.content & notify parent onChange
  const syncChanges = useCallback((updatedNb) => {
    setNotebook(updatedNb);
    try {
      const serializableCells = updatedNb.cells.map(c => ({
        ...c,
        source: c.source.includes('\n') ? c.source.split(/(?<=\n)/) : [c.source],
      }));
      const serialized = JSON.stringify({
        ...updatedNb,
        cells: serializableCells
      }, null, 2);
      onChange?.(serialized);
    } catch (e) {
      console.error('[JupyterEditor] Serialize error:', e);
    }
  }, [onChange]);

  // Update a single cell's source code
  const handleCellSourceChange = useCallback((cellIndex, newSource) => {
    setNotebook(prev => {
      if (!prev) return prev;
      const nextCells = [...prev.cells];
      nextCells[cellIndex] = { ...nextCells[cellIndex], source: newSource };
      const updated = { ...prev, cells: nextCells };
      try {
        const serializable = {
          ...updated,
          cells: updated.cells.map(c => ({
            ...c,
            source: c.source.includes('\n') ? c.source.split(/(?<=\n)/) : [c.source],
          }))
        };
        onChange?.(JSON.stringify(serializable, null, 2));
      } catch (_) {}
      return updated;
    });
  }, [onChange]);

  // Execute a specific cell
  const executeCell = async (cellIndex) => {
    if (!notebook || !notebook.cells[cellIndex]) return;
    const cell = notebook.cells[cellIndex];
    if (cell.cell_type !== 'code') return;

    setExecutingIndices(prev => new Set(prev).add(cellIndex));
    setKernelStatus('busy');

    const execNumber = executionCountRef.current++;

    try {
      const cwd = tab?.nativePath
        ? tab.nativePath.replace(/\\/g, '/').substring(0, tab.nativePath.replace(/\\/g, '/').lastIndexOf('/'))
        : null;

      let res;
      try {
        const rawRes = await apiFetch('/api/jupyter/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: sessionIdRef.current,
            code: cell.source,
            cwd
          })
        });
        res = await rawRes.json();
      } catch (err) {
        // Desktop fallback if backend server is offline: run python directly via Tauri
        const { isDesktopRuntime } = await import('../../core/runtime.js');
        if (isDesktopRuntime()) {
          const { desktopExecuteCommand } = await import('../../core/desktopFileApi.js');
          const pyRes = await desktopExecuteCommand('python', ['-c', cell.source], cwd);
          res = {
            stdout: pyRes?.stdout || '',
            stderr: pyRes?.stderr || '',
            error: pyRes && pyRes.exitCode !== 0 ? (pyRes.stderr || 'Execution failed') : null,
          };
        } else {
          throw err;
        }
      }

      const newOutputs = [];
      if (res.stdout) {
        newOutputs.push({
          output_type: 'stream',
          name: 'stdout',
          text: res.stdout
        });
      }
      if (res.stderr) {
        newOutputs.push({
          output_type: 'stream',
          name: 'stderr',
          text: res.stderr
        });
      }
      if (res.result) {
        newOutputs.push({
          output_type: 'execute_result',
          execution_count: execNumber,
          data: { 'text/plain': res.result }
        });
      }
      if (res.images && res.images.length > 0) {
        res.images.forEach(imgB64 => {
          newOutputs.push({
            output_type: 'display_data',
            data: { 'image/png': imgB64 }
          });
        });
      }
      if (res.error) {
        newOutputs.push({
          output_type: 'error',
          ename: 'ExecutionError',
          evalue: String(res.error),
          traceback: [res.error]
        });
      }

      setNotebook(prev => {
        if (!prev) return prev;
        const nextCells = [...prev.cells];
        nextCells[cellIndex] = {
          ...nextCells[cellIndex],
          outputs: newOutputs,
          execution_count: execNumber
        };
        const updated = { ...prev, cells: nextCells };
        syncChanges(updated);
        return updated;
      });
      setKernelStatus('idle');
    } catch (err) {
      console.error('[Jupyter] Cell execution failed:', err);
      setKernelStatus('error');
      setNotebook(prev => {
        if (!prev) return prev;
        const nextCells = [...prev.cells];
        nextCells[cellIndex] = {
          ...nextCells[cellIndex],
          outputs: [{
            output_type: 'error',
            ename: 'KernelError',
            evalue: err.message || 'Execution error',
            traceback: [err.message || 'Execution error']
          }],
          execution_count: execNumber
        };
        const updated = { ...prev, cells: nextCells };
        syncChanges(updated);
        return updated;
      });
    } finally {
      setExecutingIndices(prev => {
        const next = new Set(prev);
        next.delete(cellIndex);
        return next;
      });
    }
  };

  // Run all code cells sequentially
  const handleRunAll = async () => {
    if (!notebook) return;
    for (let i = 0; i < notebook.cells.length; i++) {
      if (notebook.cells[i].cell_type === 'code') {
        await executeCell(i);
      }
    }
  };

  // Restart Python kernel
  const handleRestartKernel = async () => {
    try {
      setKernelStatus('busy');
      await apiFetch('/api/jupyter/restart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: sessionIdRef.current })
      });
      executionCountRef.current = 1;
      setKernelStatus('idle');
    } catch (e) {
      console.error('[Jupyter] Restart error:', e);
      setKernelStatus('error');
    }
  };

  // Clear all cell outputs
  const handleClearAllOutputs = () => {
    if (!notebook) return;
    const cleared = {
      ...notebook,
      cells: notebook.cells.map(c => ({
        ...c,
        outputs: [],
        execution_count: null
      }))
    };
    syncChanges(cleared);
  };

  // Add new cell
  const handleAddCell = (index, cellType = 'code') => {
    if (!notebook) return;
    const newCell = {
      id: `cell-${Date.now()}`,
      cell_type: cellType,
      source: cellType === 'code' ? '' : '# Heading\nType markdown here...',
      outputs: [],
      execution_count: null,
      metadata: {}
    };
    const nextCells = [...notebook.cells];
    nextCells.splice(index + 1, 0, newCell);
    syncChanges({ ...notebook, cells: nextCells });
    setActiveCellIndex(index + 1);
  };

  // Delete cell
  const handleDeleteCell = (index) => {
    if (!notebook || notebook.cells.length <= 1) return;
    const nextCells = notebook.cells.filter((_, i) => i !== index);
    syncChanges({ ...notebook, cells: nextCells });
    setActiveCellIndex(Math.max(0, index - 1));
  };

  // Move cell up/down
  const handleMoveCell = (index, direction) => {
    if (!notebook) return;
    const targetIdx = index + direction;
    if (targetIdx < 0 || targetIdx >= notebook.cells.length) return;
    const nextCells = [...notebook.cells];
    const [moved] = nextCells.splice(index, 1);
    nextCells.splice(targetIdx, 0, moved);
    syncChanges({ ...notebook, cells: nextCells });
    setActiveCellIndex(targetIdx);
  };

  if (!notebook) {
    return (
      <div className="jupyter-loading">
        <i className="fa-solid fa-spinner fa-spin"></i> Loading Notebook...
      </div>
    );
  }

  return (
    <div className="jupyter-notebook-container">
      {/* Notebook Toolbar */}
      <div className="jupyter-toolbar">
        <div className="jupyter-toolbar-group">
          <button
            type="button"
            className="jupyter-btn primary"
            onClick={handleRunAll}
            title="Run All Cells"
          >
            <i className="fa-solid fa-forward-step"></i> Run All
          </button>
          <button
            type="button"
            className="jupyter-btn"
            onClick={() => handleAddCell(activeCellIndex, 'code')}
            title="Add Code Cell Below"
          >
            <i className="fa-solid fa-plus"></i> Code
          </button>
          <button
            type="button"
            className="jupyter-btn"
            onClick={() => handleAddCell(activeCellIndex, 'markdown')}
            title="Add Markdown Cell Below"
          >
            <i className="fa-solid fa-plus"></i> Markdown
          </button>
          <button
            type="button"
            className="jupyter-btn"
            onClick={handleClearAllOutputs}
            title="Clear Outputs"
          >
            <i className="fa-solid fa-eraser"></i> Clear Outputs
          </button>
          <button
            type="button"
            className="jupyter-btn"
            onClick={handleRestartKernel}
            title="Restart Python Kernel"
          >
            <i className="fa-solid fa-rotate-right"></i> Restart Kernel
          </button>
        </div>

        <div className="jupyter-kernel-indicator">
          <span className={`kernel-status-dot ${kernelStatus}`}></span>
          <span className="kernel-name">Python 3 (Interactive Kernel)</span>
          <span className="kernel-status-label">{kernelStatus.toUpperCase()}</span>
        </div>
      </div>

      {/* Cells List */}
      <div className="jupyter-cells-scroll-area">
        {notebook.cells.map((cell, idx) => {
          const isExecuting = executingIndices.has(idx);
          const isActive = activeCellIndex === idx;

          return (
            <div
              key={cell.id || idx}
              className={`jupyter-cell ${cell.cell_type} ${isActive ? 'active' : ''} ${isExecuting ? 'executing' : ''}`}
              onClick={() => setActiveCellIndex(idx)}
            >
              <div className="jupyter-cell-gutter">
                {cell.cell_type === 'code' ? (
                  <button
                    type="button"
                    className="cell-run-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      executeCell(idx);
                    }}
                    title="Execute Cell (Ctrl+Enter)"
                  >
                    {isExecuting ? (
                      <i className="fa-solid fa-spinner fa-spin"></i>
                    ) : (
                      <i className="fa-solid fa-play"></i>
                    )}
                  </button>
                ) : (
                  <span className="cell-md-badge" title="Markdown cell">M</span>
                )}
                <div className="cell-exec-count">
                  {cell.cell_type === 'code' && (
                    <span>[{isExecuting ? '*' : (cell.execution_count ?? ' ')}]</span>
                  )}
                </div>
              </div>

              <div className="jupyter-cell-content">
                {/* Cell Actions Overlay */}
                <div className="cell-actions-bar">
                  <span className="cell-type-badge">{cell.cell_type}</span>
                  <button
                    type="button"
                    className="cell-action-icon"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleMoveCell(idx, -1);
                    }}
                    title="Move Cell Up"
                    disabled={idx === 0}
                  >
                    <i className="fa-solid fa-arrow-up"></i>
                  </button>
                  <button
                    type="button"
                    className="cell-action-icon"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleMoveCell(idx, 1);
                    }}
                    title="Move Cell Down"
                    disabled={idx === notebook.cells.length - 1}
                  >
                    <i className="fa-solid fa-arrow-down"></i>
                  </button>
                  <button
                    type="button"
                    className="cell-action-icon danger"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteCell(idx);
                    }}
                    title="Delete Cell"
                  >
                    <i className="fa-solid fa-trash"></i>
                  </button>
                </div>

                {/* Editor Container */}
                <div className="cell-editor-wrapper">
                  <MonacoEditor
                    key={`jupyter-${cell.id || idx}`}
                    tab={{
                      id: `jupyter-cell-${cell.id || idx}`,
                      name: `cell-${idx}.${cell.cell_type === 'code' ? 'py' : 'md'}`,
                      language: cell.cell_type === 'code' ? 'python' : 'markdown',
                      content: cell.source
                    }}
                    settings={{
                      ...settings,
                      lineNumbers: 'on',
                      minimap: { enabled: false },
                      scrollBeyondLastLine: false,
                      fontSize: settings?.fontSize || 13,
                    }}
                    onChange={(val) => handleCellSourceChange(idx, val)}
                    onMount={(editor) => {
                      // Add Ctrl+Enter or Shift+Enter to run cell
                      editor.addCommand(
                        editor._monaco.KeyMod.CtrlCmd | editor._monaco.KeyCode.Enter,
                        () => executeCell(idx)
                      );
                      editor.addCommand(
                        editor._monaco.KeyMod.Shift | editor._monaco.KeyCode.Enter,
                        () => {
                          executeCell(idx);
                          if (idx === notebook.cells.length - 1) {
                            handleAddCell(idx, 'code');
                          } else {
                            setActiveCellIndex(idx + 1);
                          }
                        }
                      );
                    }}
                    monacoEditorStyle={{
                      height: `${Math.max(65, Math.min(500, (cell.source.split('\n').length + 1) * 20))}px`,
                      width: '100%'
                    }}
                  />
                </div>

                {/* Cell Outputs */}
                {cell.outputs && cell.outputs.length > 0 && (
                  <div className="cell-outputs-area">
                    {cell.outputs.map((out, outIdx) => {
                      if (out.output_type === 'stream') {
                        return (
                          <pre
                            key={outIdx}
                            className={`output-stream ${out.name || 'stdout'}`}
                          >
                            {Array.isArray(out.text) ? out.text.join('') : (out.text || '')}
                          </pre>
                        );
                      }
                      if (out.output_type === 'execute_result' || out.output_type === 'display_data') {
                        const data = out.data || {};
                        const text = data['text/plain']
                          ? (Array.isArray(data['text/plain']) ? data['text/plain'].join('') : data['text/plain'])
                          : null;
                        const pngB64 = data['image/png'];

                        return (
                          <div key={outIdx} className="output-result">
                            {pngB64 && (
                              <img
                                src={`data:image/png;base64,${pngB64}`}
                                alt="Plot Output"
                                className="output-plot-image"
                              />
                            )}
                            {text && <pre className="output-text-result">{text}</pre>}
                          </div>
                        );
                      }
                      if (out.output_type === 'error') {
                        return (
                          <pre key={outIdx} className="output-error">
                            {Array.isArray(out.traceback)
                              ? out.traceback.join('\n')
                              : (out.evalue || 'Execution error')}
                          </pre>
                        );
                      }
                      return null;
                    })}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
