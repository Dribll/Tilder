import React, { useState, useEffect } from 'react';
import workspace from '../../../../core/workspace.js';
import { desktopExecuteCommand } from '../../../../core/desktopFileApi.js';

export default function TestRunner({ ariaExpandedisplaytestrunner, onRunTest, pushNotification }) {
  const [testFiles, setTestFiles] = useState([]);
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState({});

  useEffect(() => {
    // Scan workspace for test files when opened
    if (ariaExpandedisplaytestrunner !== 'none') {
      const files = workspace.getAllFiles();
      const tests = files.filter(f => 
        f.name.endsWith('.test.js') || 
        f.name.endsWith('.spec.js') ||
        f.name.endsWith('test.py') ||
        f.name.endsWith('.test.ts')
      );
      setTestFiles(tests);
    }
  }, [ariaExpandedisplaytestrunner, workspace.tree]);

  async function handleRunTest(file) {
    setRunning(true);
    const startTime = Date.now();
    try {
      setResults(prev => ({ ...prev, [file.path]: { status: 'running' } }));
      
      if (workspace.isDesktop && workspace.rootSystemPath) {
        let cmd = '';
        let args = [];
        
        if (file.name.endsWith('.js') || file.name.endsWith('.ts')) {
          // Assume jest or mocha is installed globally or node test runner
          cmd = 'node';
          args = ['--test', file.name];
        } else if (file.name.endsWith('.py')) {
          cmd = 'python';
          args = ['-m', 'unittest', file.name];
        } else {
          throw new Error('Unsupported test file type');
        }

        const dir = file.path.includes('/') ? `${workspace.rootSystemPath}/${file.path.split('/').slice(0, -1).join('/')}` : workspace.rootSystemPath;
        const res = await desktopExecuteCommand(cmd, args, dir);
        
        const time = Date.now() - startTime;
        const pass = res.code === 0;
        
        setResults(prev => ({ 
          ...prev, 
          [file.path]: { 
            status: pass ? 'passed' : 'failed',
            time: time,
            output: res.stdout || res.stderr
          } 
        }));
        
        if (pass) {
            pushNotification?.(`Test passed: ${file.name}`, 'success');
        } else {
            pushNotification?.(`Test failed: ${file.name}`, 'error');
        }
      } else {
        throw new Error('Test running is only supported in desktop mode');
      }
    } catch (e) {
      setResults(prev => ({ ...prev, [file.path]: { status: 'failed', error: e.message } }));
      pushNotification?.(`Error running test: ${e.message}`, 'error');
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className={`sidebarscontent d-${ariaExpandedisplaytestrunner}`}>
      <div className="explorer-shell">
        <div className="explorer-header">
          <div>
            <p className="explorer-eyebrow">Testing</p>
            <h6 className="explorer-title">TEST RUNNER</h6>
          </div>
        </div>
        <div className="explorer-section">
          {testFiles.length === 0 ? (
            <div className="debug-empty-state" style={{ padding: '20px', textAlign: 'center', color: '#888' }}>
              No test files detected. (e.g. *.test.js, test_*.py)
            </div>
          ) : (
            <div className="debug-list">
              {testFiles.map(file => {
                const res = results[file.path];
                let statusIcon = <i className="fa-regular fa-circle"></i>;
                let statusColor = '#888';
                
                if (res?.status === 'running') {
                  statusIcon = <i className="fa-solid fa-spinner fa-spin"></i>;
                  statusColor = '#fff';
                } else if (res?.status === 'passed') {
                  statusIcon = <i className="fa-solid fa-check-circle"></i>;
                  statusColor = 'var(--debug-var-string)';
                } else if (res?.status === 'failed') {
                  statusIcon = <i className="fa-solid fa-times-circle"></i>;
                  statusColor = '#e51400';
                }

                return (
                  <div key={file.path} className="debug-list-item" style={{ cursor: 'pointer' }} onClick={() => handleRunTest(file)}>
                    <div style={{ color: statusColor, marginRight: '10px' }}>{statusIcon}</div>
                    <div className="debug-list-main">
                      <div className="debug-list-title">{file.name}</div>
                      <div className="debug-list-meta">{file.path}</div>
                    </div>
                    {res?.time && <div style={{ fontSize: '11px', color: '#666' }}>{res.time}ms</div>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
