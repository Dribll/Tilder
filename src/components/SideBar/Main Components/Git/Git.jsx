import React, { useEffect, useMemo, useState } from 'react';
import {
  checkoutScmBranch,
  commitScm,
  createScmBranch,
  discardScmFile,
  fetchScmFileDiff,
  fetchScmStatus,
  initializeScm,
  stageAllScm,
  stageScmFile,
  unstageScmFile,
  syncScm,
} from '../../../../core/scmApi.js';

function toFriendlyError(error, fallback) {
  const message = error instanceof Error ? error.message : fallback;
  if (message.includes('Failed to fetch')) {
    return 'Tilder API server is not reachable. Start or restart the Node server on port 3210.';
  }

  if (message.includes('PayloadTooLargeError') || message.includes('workspace mirror payload is too large')) {
    return 'This workspace is too large to mirror as-is for Source Control. Tilder now skips generated folders like node_modules, dist, build, and target. Refresh Source Control and try again.';
  }

  return message || fallback;
}

function fileStatusSummary(file) {
  const parts = [];
  if (file?.stagedLabel) {
    parts.push(`Index: ${file.stagedLabel}`);
  }
  if (file?.workingTreeLabel) {
    parts.push(`Working Tree: ${file.workingTreeLabel}`);
  }
  if (!parts.length && file?.isUntracked) {
    parts.push('Untracked');
  }
  return parts.join(' | ') || 'No status';
}

export default function Git({
  ariaExpandedisplaygit,
  workspace,
  workspaceVersion,
  authSession,
  pushNotification,
  onWorkspaceMutated,
  requestConfirmation,
}) {
  const isVisible = ariaExpandedisplaygit === 'flex';
  const [scmState, setScmState] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [commitMessage, setCommitMessage] = useState('');
  const [busyAction, setBusyAction] = useState('');
  const [branchSelection, setBranchSelection] = useState('');
  const [newBranchName, setNewBranchName] = useState('');
  const [expandedDiffPath, setExpandedDiffPath] = useState('');
  const [diffStateByPath, setDiffStateByPath] = useState({});

  const connectedAccountLabel = useMemo(() => {
    const githubAccount = authSession?.accounts?.github;
    const microsoftAccount = authSession?.accounts?.microsoft;
    return githubAccount?.displayName || githubAccount?.username || microsoftAccount?.displayName || '';
  }, [authSession?.accounts?.github, authSession?.accounts?.microsoft]);

  const hasPendingChanges = (scmState?.changedCount || 0) > 0 || (scmState?.stagedCount || 0) > 0;

  useEffect(() => {
    setBranchSelection(scmState?.branch || '');
  }, [scmState?.branch]);

  async function buildPayload() {
    return (await workspace.getSyncPayload({ includeGeneratedDirectories: false })) || workspace.getStructureSnapshot();
  }

  function clearDiffState() {
    setExpandedDiffPath('');
    setDiffStateByPath({});
  }

  async function refreshScm() {
    try {
      setLoading(true);
      setError('');
      const payload = await buildPayload();
      if (!payload) {
        setScmState(null);
        clearDiffState();
        return;
      }

      const nextState = await fetchScmStatus(payload);
      setScmState(nextState);
      clearDiffState();
    } catch (caughtError) {
      setError(toFriendlyError(caughtError, 'Unable to load source control state.'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!isVisible) {
      return;
    }

    refreshScm();
  }, [isVisible, workspaceVersion]);

  async function runScmAction(action, options = {}) {
    const busyKey = options.busyKey || options.successMessage || 'scm-action';

    try {
      setBusyAction(busyKey);
      setError('');
      const payload = await buildPayload();
      if (!payload) {
        throw new Error('Open or create a workspace first.');
      }

      const nextState = await action(payload);
      if (typeof options.applyResult === 'function') {
        await options.applyResult(nextState);
      }

      setScmState(nextState);
      clearDiffState();
      if (typeof onWorkspaceMutated === 'function') {
        onWorkspaceMutated();
      }
      if (options.successMessage) {
        pushNotification?.(options.successMessage);
      }
      return true;
    } catch (caughtError) {
      const message = toFriendlyError(caughtError, 'Source control action failed.');
      setError(message);
      pushNotification?.(message, 'warning');
      return false;
    } finally {
      setBusyAction('');
    }
  }

  async function loadDiffForFile(filePath) {
    try {
      setError('');
      setDiffStateByPath((current) => ({
        ...current,
        [filePath]: {
          ...(current[filePath] || {}),
          loading: true,
          error: '',
        },
      }));

      const payload = await buildPayload();
      if (!payload) {
        throw new Error('Open or create a workspace first.');
      }

      const diff = await fetchScmFileDiff({ ...payload, path: filePath });
      setDiffStateByPath((current) => ({
        ...current,
        [filePath]: {
          loading: false,
          error: '',
          stagedDiff: diff.stagedDiff || '',
          workingTreeDiff: diff.workingTreeDiff || '',
        },
      }));
    } catch (caughtError) {
      const message = toFriendlyError(caughtError, 'Unable to load file diff.');
      setDiffStateByPath((current) => ({
        ...current,
        [filePath]: {
          loading: false,
          error: message,
          stagedDiff: '',
          workingTreeDiff: '',
        },
      }));
    }
  }

  async function handleToggleDiff(filePath) {
    if (expandedDiffPath === filePath) {
      setExpandedDiffPath('');
      return;
    }

    setExpandedDiffPath(filePath);
    if (!diffStateByPath[filePath] || diffStateByPath[filePath]?.error) {
      await loadDiffForFile(filePath);
    }
  }

  async function handleDiscardFile(file) {
    const confirmed = requestConfirmation
      ? await requestConfirmation({
          title: 'Discard Changes',
          message: `Discard unstaged changes for "${file.path}"?`,
          confirmLabel: 'Discard',
          cancelLabel: 'Cancel',
          danger: true,
        })
      : window.confirm(`Discard unstaged changes for "${file.path}"?`);
    if (!confirmed) {
      return;
    }

    await runScmAction(
      (payload) => discardScmFile({ ...payload, path: file.path }),
      {
        busyKey: `discard:${file.path}`,
        successMessage: `Discarded changes in ${file.path}.`,
        applyResult: async (nextState) => {
          if (nextState?.updatedFile) {
            await workspace.applyScmFileSnapshot(nextState.updatedFile);
          }
        },
      }
    );
  }

  return (
    <div id="gitarea" className={`sidebarscontent d-${ariaExpandedisplaygit}`}>
      <div className="account-panel-container" style={{ padding: '10px 10px 40px', height: '100%', overflowY: 'auto', justifyContent: 'flex-start' }}>
        <div className="account-glass-card" style={{ padding: '20px' }}>
          <div className="account-card-header" style={{ marginBottom: '16px' }}>
            <div className="account-icon-badge">
              <i className="fa-brands fa-git-alt"></i>
            </div>
            <h2 className="account-main-title">Source Control</h2>
            <p className="account-main-subtitle">
              {workspace.rootName || workspace.getRootNode()?.name || 'Open a folder or draft workspace'}
            </p>
            <button 
              type="button" 
              className="action-btn-pill" 
              onClick={refreshScm} 
              title="Refresh Source Control"
              style={{ position: 'absolute', top: 16, right: 16, width: 32, height: 32, padding: 0, justifyContent: 'center' }}
            >
              <i className="fa-solid fa-rotate-right"></i>
            </button>
          </div>

          {connectedAccountLabel ? <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 16, textAlign: 'center' }}>Author: {connectedAccountLabel}</div> : null}
          {error ? <div style={{ color: '#ff6b6b', fontSize: 12, marginBottom: 16, textAlign: 'center' }}>{error}</div> : null}

        {scmState?.available === false ? (
          <div className="account-panel-section">
            <h3 className="account-section-hdr">Git Unavailable</h3>
            <p className="account-main-subtitle" style={{ textAlign: 'left', marginBottom: 0 }}>{scmState.message || 'Git is not available for this Tilder server yet.'}</p>
          </div>
        ) : !scmState?.initialized ? (
          <div className="account-panel-section">
            <h3 className="account-section-hdr">Initialize Repository</h3>
            <p className="account-main-subtitle" style={{ textAlign: 'left' }}>
              Create a Git repository for this mirrored Tilder workspace so status, staging, diffs, and commits are available.
            </p>
            <button
              type="button"
              className="provider-canva-btn"
              disabled={Boolean(busyAction) || loading}
              onClick={() =>
                runScmAction(initializeScm, {
                  busyKey: 'init',
                  successMessage: 'Repository initialized.',
                })
              }
            >
              <span className="btn-brand-icon-wrap"><i className="fa-brands fa-git-alt"></i></span>
              <span className="btn-label-text">{busyAction === 'init' ? 'Initializing...' : 'Initialize Repository'}</span>
            </button>
          </div>
        ) : (
          <>
            <div className="account-panel-section" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div style={{ background: 'rgba(255,255,255,0.03)', padding: '12px', borderRadius: '12px', textAlign: 'center' }}>
                <div style={{ fontSize: 11, opacity: 0.6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Branch</div>
                <div style={{ fontSize: 14, fontWeight: 500, marginTop: 4 }}>{scmState.branch || 'main'}</div>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.03)', padding: '12px', borderRadius: '12px', textAlign: 'center' }}>
                <div style={{ fontSize: 11, opacity: 0.6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Sync</div>
                <div style={{ fontSize: 14, fontWeight: 500, marginTop: 4 }}>{`${scmState.ahead || 0} ↑ / ${scmState.behind || 0} ↓`}</div>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.03)', padding: '12px', borderRadius: '12px', textAlign: 'center' }}>
                <div style={{ fontSize: 11, opacity: 0.6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Changed</div>
                <div style={{ fontSize: 14, fontWeight: 500, marginTop: 4 }}>{scmState.changedCount || 0}</div>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.03)', padding: '12px', borderRadius: '12px', textAlign: 'center' }}>
                <div style={{ fontSize: 11, opacity: 0.6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Staged</div>
                <div style={{ fontSize: 14, fontWeight: 500, marginTop: 4 }}>{scmState.stagedCount || 0}</div>
              </div>
            </div>

            <div className="account-panel-section">
              <button
                type="button"
                className="action-btn-pill"
                style={{ width: '100%', justifyContent: 'center' }}
                disabled={Boolean(busyAction) || loading}
                onClick={() => runScmAction((payload) => syncScm(payload), {
                  busyKey: 'sync',
                  successMessage: 'Synced with remote.',
                  applyResult: async (nextState) => {
                    if (nextState?.workspaceSnapshot) {
                      await workspace.applyScmSnapshot(nextState.workspaceSnapshot);
                    }
                  }
                })}
              >
                <i className="fa-solid fa-cloud-arrow-up"></i> {busyAction === 'sync' ? 'Syncing...' : 'Push / Pull (Sync)'}
              </button>
            </div>

            <div className="account-panel-section">
              <h3 className="account-section-hdr">Branches</h3>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                <select
                  className="github-input"
                  style={{ flex: 1, margin: 0 }}
                  value={branchSelection}
                  onChange={(event) => setBranchSelection(event.target.value)}
                >
                  {(scmState.branches || []).map((branch) => (
                    <option key={branch} value={branch}>
                      {branch}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="action-btn-pill"
                  disabled={Boolean(busyAction) || loading || !branchSelection || branchSelection === scmState.branch}
                  onClick={async () => {
                    const confirmed =
                      !hasPendingChanges ||
                      (requestConfirmation
                        ? await requestConfirmation({
                            title: 'Switch Branch',
                            message: `Switch to "${branchSelection}" and replace the current workspace files with that branch snapshot?`,
                            confirmLabel: 'Switch',
                            cancelLabel: 'Cancel',
                            danger: true,
                          })
                        : window.confirm(
                            `Switch to "${branchSelection}" and replace the current workspace files with that branch snapshot?`
                          ));
                    if (!confirmed) {
                      return;
                    }

                    await runScmAction(
                      (payload) => checkoutScmBranch({ ...payload, branch: branchSelection }),
                      {
                        busyKey: 'checkout-branch',
                        successMessage: `Switched to ${branchSelection}.`,
                        applyResult: async (nextState) => {
                          if (nextState?.workspaceSnapshot) {
                            await workspace.applyScmSnapshot(nextState.workspaceSnapshot);
                          }
                        },
                      }
                    );
                  }}
                >
                  {busyAction === 'checkout-branch' ? 'Switching...' : 'Switch'}
                </button>
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  className="github-input"
                  style={{ flex: 1, margin: 0 }}
                  value={newBranchName}
                  onChange={(event) => setNewBranchName(event.target.value)}
                  placeholder="New branch name"
                />
                <button
                  type="button"
                  className="action-btn-pill sync-active"
                  style={{ border: 'none' }}
                  disabled={Boolean(busyAction) || loading || !newBranchName.trim()}
                  onClick={async () => {
                    const branch = newBranchName.trim();
                    const created = await runScmAction(
                      (payload) => createScmBranch({ ...payload, branch }),
                      {
                        busyKey: 'create-branch',
                        successMessage: `Created branch ${branch}.`,
                      }
                    );

                    if (created) {
                      setNewBranchName('');
                      setBranchSelection(branch);
                    }
                  }}
                >
                  <i className="fa-solid fa-plus"></i> {busyAction === 'create-branch' ? 'Creating...' : 'Create'}
                </button>
              </div>
            </div>

            <div className="account-panel-section">
              <h3 className="account-section-hdr">Commit</h3>
              <textarea
                className="github-input github-textarea"
                value={commitMessage}
                onChange={(event) => setCommitMessage(event.target.value)}
                placeholder="Message (e.g. Fixed bug in login)"
                style={{ height: '60px', marginBottom: '12px' }}
              />
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  className="action-btn-pill"
                  style={{ flex: 1, justifyContent: 'center' }}
                  disabled={Boolean(busyAction) || loading || !hasPendingChanges}
                  onClick={() =>
                    runScmAction(stageAllScm, {
                      busyKey: 'stage-all',
                      successMessage: 'All changes staged.',
                    })
                  }
                >
                  {busyAction === 'stage-all' ? 'Staging...' : 'Stage All'}
                </button>
                <button
                  type="button"
                  className="action-btn-pill sync-active"
                  style={{ flex: 1, justifyContent: 'center', border: 'none' }}
                  disabled={Boolean(busyAction) || loading || !commitMessage.trim() || !hasPendingChanges}
                  onClick={async () => {
                    const message = commitMessage.trim();
                    const committed = await runScmAction(
                      (payload) => commitScm({ ...payload, message }),
                      {
                        busyKey: 'commit',
                        successMessage: 'Commit created.',
                      }
                    );
                    if (committed) {
                      setCommitMessage('');
                    }
                  }}
                >
                  <i className="fa-solid fa-check"></i> {busyAction === 'commit' ? 'Committing...' : 'Commit'}
                </button>
              </div>
            </div>

            <div className="account-panel-section">
              <h3 className="account-section-hdr">Changes</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {scmState.files?.length ? (
                  scmState.files.map((file) => {
                    const diffState = diffStateByPath[file.path] || {};
                    const isBusy = busyAction.endsWith(`:${file.path}`);
                    const isExpanded = expandedDiffPath === file.path;
                    return (
                      <div key={file.path} className="scm-file-row">
                        <div className="scm-file-main">
                          <div className="scm-file-copy">
                            <span className="scm-file-path">{file.path}</span>
                            <span className="scm-file-status">{fileStatusSummary(file)}</span>
                          </div>
                          <div className="scm-file-actions">
                            {file.canStage ? (
                              <button
                                type="button"
                                className="scm-file-btn"
                                disabled={Boolean(busyAction) || loading}
                                onClick={() =>
                                  runScmAction(
                                    (payload) => stageScmFile({ ...payload, path: file.path }),
                                    {
                                      busyKey: `stage:${file.path}`,
                                      successMessage: `Staged ${file.path}.`,
                                    }
                                  )
                                }
                              >
                                {busyAction === `stage:${file.path}` ? 'Staging...' : 'Stage'}
                              </button>
                            ) : null}
                            {file.canUnstage ? (
                              <button
                                type="button"
                                className="scm-file-btn"
                                disabled={Boolean(busyAction) || loading}
                                onClick={() =>
                                  runScmAction(
                                    (payload) => unstageScmFile({ ...payload, path: file.path }),
                                    {
                                      busyKey: `unstage:${file.path}`,
                                      successMessage: `Unstaged ${file.path}.`,
                                    }
                                  )
                                }
                              >
                                {busyAction === `unstage:${file.path}` ? 'Unstaging...' : 'Unstage'}
                              </button>
                            ) : null}
                            {file.canDiscard ? (
                              <button
                                type="button"
                                className="scm-file-btn danger"
                                disabled={Boolean(busyAction) || loading}
                                onClick={() => handleDiscardFile(file)}
                              >
                                {busyAction === `discard:${file.path}` || isBusy ? 'Discarding...' : 'Discard'}
                              </button>
                            ) : null}
                            <button
                              type="button"
                              className="scm-file-btn"
                              disabled={Boolean(busyAction) || loading}
                              onClick={() => handleToggleDiff(file.path)}
                            >
                              {isExpanded ? 'Hide Diff' : diffState.loading ? 'Loading...' : 'Diff'}
                            </button>
                          </div>
                        </div>

                        {isExpanded ? (
                          <div className="scm-diff-panel">
                            {diffState.error ? <div className="scm-error">{diffState.error}</div> : null}
                            {!diffState.loading && !diffState.error && !diffState.stagedDiff && !diffState.workingTreeDiff ? (
                              <div className="scm-empty">No diff preview available.</div>
                            ) : null}
                            {diffState.stagedDiff ? (
                              <div className="scm-diff-block">
                                <div className="scm-diff-title">Staged Changes</div>
                                <pre className="scm-diff-output">{diffState.stagedDiff}</pre>
                              </div>
                            ) : null}
                            {diffState.workingTreeDiff ? (
                              <div className="scm-diff-block">
                                <div className="scm-diff-title">Working Tree</div>
                                <pre className="scm-diff-output">{diffState.workingTreeDiff}</pre>
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    );
                  })
                ) : (
                  <div className="scm-empty">No pending changes.</div>
                )}
              </div>
            </div>

            <div className="scm-card">
              <div className="scm-card-title">Recent Commits</div>
              <div className="scm-commit-list">
                {scmState.recentCommits?.length ? (
                  scmState.recentCommits.map((commit) => (
                    <div key={commit.hash} className="scm-commit-row">
                      <div className="scm-commit-message">{commit.message}</div>
                      <div className="scm-commit-meta">
                        {(commit.hash || '').slice(0, 7)}
                        {commit.author_name ? ` | ${commit.author_name}` : ''}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="scm-empty">No commits yet.</div>
                )}
              </div>
            </div>
          </>
        )}
        </div>
      </div>
    </div>
  );
}
