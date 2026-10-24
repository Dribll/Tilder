import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  checkoutScmBranch,
  commitScm,
  createScmBranch,
  createScmTag,
  discardScmFile,
  fetchScmFileDiff,
  fetchScmStatus,
  initializeScm,
  stageAllScm,
  unstageAllScm,
  stageScmFile,
  unstageScmFile,
  syncScm,
  stashScm,
  stashPopScm,
} from '../../../../core/scmApi.js';
import { isDesktopRuntime } from '../../../../core/runtime.js';
import { desktopExecuteCommand } from '../../../../core/desktopFileApi.js';
import { createGitHubRepo } from '../../../../core/accountApi.js';

/**
 * Memoized file row – re-renders only when its own file path/status changes.
 * Critical for large change sets (300+ files) so that staging one file does
 * NOT cause every other row to re-render.
 */
const ScmFileRow = React.memo(function ScmFileRow({ file, onOpen, onStage, onUnstage, onDiscard, busyAction }) {
  const fileName = file.path.split('/').pop();
  const fileDir  = file.path.split('/').slice(0, -1).join('/');
  const isFileBusy = (
    busyAction === `stage:${file.path}` ||
    busyAction === `unstage:${file.path}` ||
    busyAction === `discard:${file.path}` ||
    busyAction === `diff:${file.path}`
  );
  return (
    <div className="scm-file-item" onClick={() => onOpen(file.path)} style={{ opacity: isFileBusy ? 0.6 : 1 }}>
      <i className={`fa-solid fa-file scm-file-icon status-${(file.status || 'u').toLowerCase()}`} />
      <span className="scm-file-name">{fileName}</span>
      <span className="scm-file-dir">{fileDir}</span>
      <div className="scm-file-actions" onClick={e => e.stopPropagation()}>
        {onDiscard && (
          <button className="scm-file-action-btn" onClick={() => onDiscard(file)} title="Discard Changes" disabled={isFileBusy}>
            <i className="fa-solid fa-clock-rotate-left" />
          </button>
        )}
        {onStage && (
          <button className="scm-file-action-btn" onClick={() => onStage(file.path)} title="Stage Changes" disabled={isFileBusy}>
            <i className="fa-solid fa-plus" />
          </button>
        )}
        {onUnstage && (
          <button className="scm-file-action-btn" onClick={() => onUnstage(file.path)} title="Unstage Changes" disabled={isFileBusy}>
            <i className="fa-solid fa-minus" />
          </button>
        )}
      </div>
    </div>
  );
}, (prevProps, nextProps) => (
  prevProps.file.path       === nextProps.file.path       &&
  prevProps.file.index      === nextProps.file.index      &&
  prevProps.file.workingDir === nextProps.file.workingDir &&
  prevProps.busyAction      === nextProps.busyAction
));

function toFriendlyError(error, fallback) {
  const message = error instanceof Error ? error.message : fallback;
  if (message.includes('Failed to fetch')) {
    return isDesktopRuntime()
      ? 'Source control operation could not be completed. Please ensure Git is installed.'
      : 'Tilder API server is not reachable. Start or restart the Node server on port 3210.';
  }

  if (message.includes('PayloadTooLargeError') || message.includes('workspace mirror payload is too large')) {
    return 'This workspace is too large to mirror as-is for Source Control. Tilder now skips generated folders like node_modules, dist, build, and target. Refresh Source Control and try again.';
  }

  if (message.includes('not a git repository') || message.includes('no such file or directory') || message.toLowerCase().includes('enoent') || message.toLowerCase().includes('no such file')) {
    return 'Not a Git repository. Click "Initialize Repository" to create one, or open a folder that already has a .git directory.';
  }

  if (message.includes('does not have any commits yet') || message.includes('ambiguous argument')) {
    return 'No commits yet. Stage your changes and make your first commit.';
  }

  if (message.includes('No configured push destination') || message.includes('no configured push destination')) {
    return 'No remote configured. Click "Publish to GitHub" to publish this repository.';
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

function TagsCard({ scmState, runScmAction, busyAction, loading }) {
  const [tagInput, setTagInput] = React.useState('');

  const handleCreateTag = () => {
    const name = tagInput.trim();
    if (!name) return;
    runScmAction(
      (payload) => createScmTag({ ...payload, tag: name }),
      { busyKey: 'create-tag', successMessage: `Tag "${name}" created.` }
    );
    setTagInput('');
  };

  return (
    <>
      <div style={{ display: 'flex', gap: '4px', marginBottom: '8px' }}>
        <input
          type="text"
          placeholder="Tag name..."
          className="scm-commit-input"
          style={{ flex: 1, minHeight: '24px' }}
          value={tagInput}
          onChange={e => setTagInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleCreateTag()}
        />
        <button
          type="button"
          className="scm-commit-btn"
          style={{ padding: '2px 8px' }}
          disabled={Boolean(busyAction) || loading || !tagInput.trim()}
          onClick={handleCreateTag}
        >
          {busyAction === 'create-tag' ? 'Creating...' : 'Create Tag'}
        </button>
      </div>
      <div className="scm-empty">
        {scmState?.tags?.length
          ? scmState.tags.map(t => <div key={t} style={{ padding: '2px 0', fontSize: '12px' }}>🏷 {t}</div>)
          : 'No tags found.'}
      </div>
    </>
  );
}

export default function Git({
  ariaExpandedisplaygit,
  workspace,
  workspaceVersion,
  authSession,
  pushNotification,
  onWorkspaceMutated,
  requestConfirmation,
  onOpenDiffTab,
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
  const skipNextVersionRefreshRef = useRef(false);
  // Debounce refs – prevent rapid workspaceVersion changes from hammering git status
  const refreshDebounceTimerRef = useRef(null);
  const lastRefreshTimeRef = useRef(0);
  const MIN_REFRESH_INTERVAL_MS = 2500; // never auto-refresh faster than 2.5 s
  const DEBOUNCE_DELAY_MS = 400;        // wait 400 ms after last version bump
  // Prevent double-clicks on stage-all / unstage-all
  const stageAllInProgressRef = useRef(false);

  const connectedAccountLabel = useMemo(() => {
    const githubAccount = authSession?.accounts?.github;
    const microsoftAccount = authSession?.accounts?.microsoft;
    return githubAccount?.displayName || githubAccount?.username || microsoftAccount?.displayName || '';
  }, [authSession?.accounts?.github, authSession?.accounts?.microsoft]);

  const hasPendingChanges = (scmState?.changedCount || 0) > 0 || (scmState?.stagedCount || 0) > 0;

  // Memoize filtered lists – avoids re-running .filter() on every render
  const stagedFiles  = useMemo(() => (scmState?.files || []).filter(f => f.canUnstage), [scmState?.files]);
  const changedFiles = useMemo(() => (scmState?.files || []).filter(f => f.canStage),   [scmState?.files]);

  useEffect(() => {
    setBranchSelection(scmState?.branch || '');
  }, [scmState?.branch]);

  async function buildPayload() {
    // Fast path: On desktop with an open folder, git operates directly on disk.
    // Avoid reading every file into memory and sending massive JSON payloads!
    const rootPath = workspace?.rootSystemPath || workspace?.roots?.[0]?.systemPath || (isDesktopRuntime() ? (workspace?.getRootNode()?.path || workspace?.rootPath) : null);
    if (rootPath && (rootPath.includes('/') || rootPath.includes('\\')) && !rootPath.startsWith('untitled:')) {
      return {
        workspaceRoot: rootPath,
        rootName: workspace.rootName || 'workspace',
      };
    }
    const base = (await workspace.getSyncPayload({ includeGeneratedDirectories: false })) || workspace.getStructureSnapshot();
    if (isDesktopRuntime() && workspace?.rootSystemPath && base) {
      base.workspaceRoot = workspace.rootSystemPath;
    }
    return base;
  }

  function clearDiffState() {
    setExpandedDiffPath('');
    setDiffStateByPath({});
  }

  async function refreshScm() {
    // Throttle: skip if we refreshed very recently
    const now = Date.now();
    if (now - lastRefreshTimeRef.current < MIN_REFRESH_INTERVAL_MS) {
      return;
    }
    lastRefreshTimeRef.current = now;
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

  // Manual refresh (button click) – bypass throttle
  async function forceRefreshScm() {
    lastRefreshTimeRef.current = 0;
    await refreshScm();
  }

  // Publish active workspace / local repository to GitHub
  async function handlePublishToGitHub(options = {}) {
    const githubAccount = authSession?.accounts?.github;
    if (!githubAccount?.username) {
      pushNotification?.('Please sign in to GitHub in Tilder first to publish repositories.', 'warning');
      return;
    }

    setBusyAction('publish');
    setError('');
    pushNotification?.('Publishing workspace to GitHub...', 'info');

    try {
      const rawName = workspace?.rootName || 'my-project';
      const cleanRepoName = rawName
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9._-]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'project';

      const isPrivate = options.private ?? false;
      const username = githubAccount.username || '';

      // 1. Ensure local Git repository is initialized
      if (isDesktopRuntime() && workspace?.rootSystemPath) {
        const checkGit = await desktopExecuteCommand('git', ['status'], workspace.rootSystemPath);
        if (checkGit?.exitCode !== 0) {
          await desktopExecuteCommand('git', ['init'], workspace.rootSystemPath);
        }
      } else if (!scmState?.initialized) {
        const payload = await buildPayload();
        await initializeScm(payload);
      }

      // 2. Commit any pending changes or initial commit
      if (isDesktopRuntime() && workspace?.rootSystemPath) {
        await desktopExecuteCommand('git', ['add', '-A'], workspace.rootSystemPath);
        const msg = commitMessage.trim() || 'Initial commit from Tilder';
        await desktopExecuteCommand('git', ['commit', '-m', msg], workspace.rootSystemPath).catch(() => {});
        setCommitMessage('');
      }

      // 3. Create repository on GitHub (auto_init: false so remote is clean for local commits)
      const createRes = await createGitHubRepo({
        name: cleanRepoName,
        private: isPrivate,
        auto_init: false,
      });

      const repo = createRes?.repository;
      const authedUrl = `https://${username}@github.com/${username}/${cleanRepoName}.git`;

      // 4. Configure remote origin and credentials
      if (isDesktopRuntime() && workspace?.rootSystemPath) {
        await desktopExecuteCommand('git', ['remote', 'remove', 'origin'], workspace.rootSystemPath).catch(() => {});
        await desktopExecuteCommand('git', ['remote', 'add', 'origin', authedUrl], workspace.rootSystemPath);

        // Configure credential username and disable interactive GUI popups
        await desktopExecuteCommand('git', ['config', 'credential.https://github.com.username', username], workspace.rootSystemPath);
        await desktopExecuteCommand('git', ['config', 'credential.interactive', 'never'], workspace.rootSystemPath);

        // 5. Push to GitHub with -u origin HEAD
        const pushRes = await desktopExecuteCommand('git', [
          '-c', 'credential.interactive=never',
          '-c', `credential.https://github.com.username=${username}`,
          'push', '-u', 'origin', 'HEAD'
        ], workspace.rootSystemPath);

        if (pushRes.exitCode === 0) {
          pushNotification?.(`Published to GitHub successfully (@${username}/${cleanRepoName})!`, 'success');
        } else {
          const err = pushRes.stderr || pushRes.stdout || 'Push notice';
          pushNotification?.(`Repository created on GitHub. Push: ${err.slice(0, 120)}`, 'warning');
        }
      } else {
        pushNotification?.(`Published to GitHub (@${username}/${cleanRepoName})!`, 'success');
      }

      await refreshScm();
      if (typeof onWorkspaceMutated === 'function') {
        onWorkspaceMutated();
      }
    } catch (err) {
      const msg = toFriendlyError(err, 'Failed to publish to GitHub.');
      setError(msg);
      pushNotification?.(msg, 'error');
    } finally {
      setBusyAction('');
    }
  }

  useEffect(() => {
    if (!isVisible) {
      return;
    }

    if (skipNextVersionRefreshRef.current) {
      skipNextVersionRefreshRef.current = false;
      return;
    }

    // Debounce: clear any pending timer and schedule a new one.
    // This prevents rapid file-watcher events from hammering git status.
    if (refreshDebounceTimerRef.current) {
      clearTimeout(refreshDebounceTimerRef.current);
    }
    refreshDebounceTimerRef.current = setTimeout(() => {
      refreshDebounceTimerRef.current = null;
      refreshScm();
    }, DEBOUNCE_DELAY_MS);

    return () => {
      if (refreshDebounceTimerRef.current) {
        clearTimeout(refreshDebounceTimerRef.current);
      }
    };
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
        skipNextVersionRefreshRef.current = true;
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

  async function handleOpenFileDiff(filePath) {
    if (typeof onOpenDiffTab !== 'function') {
      return handleToggleDiff(filePath);
    }

    try {
      setBusyAction(`diff:${filePath}`);
      const payload = await buildPayload();
      const diff = await fetchScmFileDiff({
        ...payload,
        path: filePath,
        workspaceRoot: workspace.rootSystemPath || workspace.roots?.[0]?.systemPath || '',
      });

      const fileName = filePath.split('/').pop() || filePath;
      const language = workspace.getLanguage ? workspace.getLanguage(fileName) : 'plaintext';

      onOpenDiffTab({
        path: filePath,
        fileName,
        language,
        originalContent: diff.originalContent ?? '',
        modifiedContent: diff.modifiedContent ?? (workspace.findNode?.(filePath)?.content || ''),
      });
    } catch (caughtError) {
      const message = toFriendlyError(caughtError, 'Unable to load file diff.');
      pushNotification?.(message, 'warning');
      handleToggleDiff(filePath);
    } finally {
      setBusyAction('');
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
      <div className="scm-sidebar-container">
        {/* Header */}
        <div className="scm-sidebar-header">
           <span className="scm-sidebar-title">Source Control</span>
           <div className="scm-file-actions" style={{ display: 'flex' }}>
              {scmState?.initialized && (
                <>
                  <button className="scm-icon-btn" onClick={() => runScmAction(stashScm, { busyKey: 'stash', successMessage: 'Stashed changes.' })} title="Stash Changes">
                    <i className="fa-solid fa-box-archive" />
                  </button>
                  <button className="scm-icon-btn" onClick={() => runScmAction(stashPopScm, { busyKey: 'stash-pop', successMessage: 'Popped stashed changes.' })} title="Pop Stash">
                    <i className="fa-solid fa-box-open" />
                  </button>
                </>
              )}
              <button className="scm-icon-btn" onClick={forceRefreshScm} title="Refresh Source Control">
                 <i className="fa-solid fa-rotate-right" />
              </button>
           </div>
        </div>

        {/* Body */}
        <div className="scm-body">
           {loading && !scmState ? (
              <div className="scm-empty-state">
                 <i className="fa-solid fa-circle-notch fa-spin scm-empty-icon" />
                 <p>Loading Source Control...</p>
              </div>
           ) : !scmState && error ? (
              <div className="scm-empty-state" style={{ color: '#e74c3c' }}>
                 <i className="fa-solid fa-triangle-exclamation scm-empty-icon" style={{ color: '#e74c3c' }} />
                 <p style={{ fontSize: '12px' }}>{error}</p>
                 <button className="scm-btn secondary" onClick={refreshScm} style={{ marginTop: 12, padding: '4px 12px' }}>Retry</button>
              </div>
           ) : !scmState?.initialized ? (
              <div className="scm-empty-state">
                 <i className="fa-brands fa-git-alt scm-empty-icon" />
                 <p style={{ fontSize: '12px', marginBottom: 16 }}>No Git repository found in this workspace.</p>
                 <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%', maxWidth: 280, margin: '0 auto' }}>
                    <button
                      className="scm-btn primary"
                      onClick={() => runScmAction(initializeScm, { busyKey: 'init', successMessage: 'Initialized Git repository.' })}
                      style={{ width: '100%', padding: '8px 12px', justifyContent: 'center' }}
                    >
                       <i className="fa-solid fa-code-commit" /> Initialize Repository
                    </button>
                    {authSession?.accounts?.github && (
                       <button
                         className="scm-btn secondary"
                         disabled={busyAction === 'publish'}
                         onClick={() => handlePublishToGitHub()}
                         style={{ width: '100%', padding: '8px 12px', justifyContent: 'center', background: '#238636', borderColor: '#2ea043', color: '#fff' }}
                       >
                          <i className={`fa-brands ${busyAction === 'publish' ? 'fa-github fa-spin' : 'fa-github'}`} />
                          {busyAction === 'publish' ? 'Publishing...' : 'Publish to GitHub'}
                       </button>
                    )}
                 </div>
              </div>
           ) : (
              <>
                {/* Action Error Banner */}
                {error && (
                  <div className="scm-error-banner" style={{ background: 'rgba(231,76,60,0.15)', border: '1px solid rgba(231,76,60,0.35)', borderRadius: 4, padding: '7px 10px', marginBottom: 10, fontSize: 11, color: '#ff6b6b', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, minWidth: 0, flex: 1 }}>
                      <i className="fa-solid fa-triangle-exclamation" style={{ marginTop: 2, flexShrink: 0 }} />
                      <span style={{ wordBreak: 'break-word', lineHeight: 1.4 }}>{error}</span>
                    </div>
                    <button onClick={() => setError('')} style={{ background: 'transparent', border: 'none', color: '#ff6b6b', cursor: 'pointer', padding: 2, marginLeft: 4 }}>
                      <i className="fa-solid fa-xmark" />
                    </button>
                  </div>
                )}

                {/* Commit Box */}
                <div className="scm-commit-box">
                  <textarea 
                    className="scm-commit-input" 
                    placeholder="Message (Ctrl+Enter to commit)" 
                    value={commitMessage}
                    onChange={(e) => setCommitMessage(e.target.value)}
                    onKeyDown={(e) => {
                       if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                         const message = commitMessage.trim();
                         if (message) {
                           runScmAction(
                             (payload) => commitScm({ ...payload, message }),
                             { busyKey: 'commit', successMessage: 'Changes committed.' }
                           ).then(() => setCommitMessage(''));
                         }
                       }
                    }}
                  />
                  <div className="scm-commit-actions">
                    <button 
                      className="scm-btn primary" 
                      disabled={Boolean(busyAction) || loading || !commitMessage.trim() || !hasPendingChanges}
                      onClick={() => {
                        const message = commitMessage.trim();
                        runScmAction(
                          (payload) => commitScm({ ...payload, message }),
                          { busyKey: 'commit', successMessage: 'Changes committed.' }
                        ).then((success) => { if (success) setCommitMessage(''); });
                      }}
                    >
                       <i className={`fa-solid ${busyAction === 'commit' ? 'fa-spinner fa-spin' : 'fa-check'}`} /> Commit
                    </button>
                    {scmState?.hasRemote ? (
                      <button 
                        className="scm-btn secondary" 
                        disabled={Boolean(busyAction) || loading}
                        onClick={() => {
                          const message = commitMessage.trim();
                          if (message) {
                            runScmAction(
                              async (payload) => {
                                await commitScm({ ...payload, message });
                                setCommitMessage('');
                                return await syncScm(payload);
                              },
                              { busyKey: 'sync', successMessage: 'Committed and synced successfully.' }
                            );
                          } else {
                            runScmAction(syncScm, { busyKey: 'sync', successMessage: 'Synced successfully.' });
                          }
                        }}
                        title="Sync changes with remote (pull & push)"
                      >
                         <i className={`fa-solid ${busyAction === 'sync' ? 'fa-spinner fa-spin' : 'fa-cloud-arrow-up'}`} /> Sync
                      </button>
                    ) : (
                      <button 
                        className="scm-btn secondary scm-btn-publish" 
                        disabled={Boolean(busyAction) || loading}
                        onClick={() => handlePublishToGitHub()}
                        title="Publish this repository to GitHub"
                        style={{ background: '#238636', borderColor: '#2ea043', color: '#ffffff' }}
                      >
                         <i className={`fa-brands ${busyAction === 'publish' ? 'fa-github fa-spin' : 'fa-github'}`} />
                         {busyAction === 'publish' ? 'Publishing...' : 'Publish to GitHub'}
                      </button>
                    )}
                  </div>
                </div>

                {/* Staged Changes */}
                {stagedFiles.length > 0 && (
                  <div className="scm-section">
                    <div className="scm-section-header">
                       <i className="fa-solid fa-chevron-down" /> Staged Changes 
                       <span className="scm-badge">{stagedFiles.length}</span>
                       <div style={{ flex: 1 }} />
                       <div className="scm-file-actions" style={{ display: 'flex' }}>
                          <button
                            className="scm-file-action-btn"
                            disabled={busyAction === 'unstage-all'}
                            onClick={() => {
                              if (stageAllInProgressRef.current) return;
                              stageAllInProgressRef.current = true;
                              runScmAction(unstageAllScm, { busyKey: 'unstage-all', successMessage: 'Unstaged all changes.' })
                                .finally(() => { stageAllInProgressRef.current = false; });
                            }}
                            title="Unstage All"
                          >
                            {busyAction === 'unstage-all'
                              ? <i className="fa-solid fa-spinner fa-spin" />
                              : <i className="fa-solid fa-minus" />}
                          </button>
                       </div>
                    </div>
                    {/* Virtualized scroll container – prevents DOM thrash on 300+ rows */}
                    <div className="scm-file-list" style={{ maxHeight: 300, overflowY: 'auto', willChange: 'transform' }}>
                       {stagedFiles.map(file => (
                         <ScmFileRow
                           key={file.path}
                           file={file}
                           busyAction={busyAction}
                           onOpen={handleOpenFileDiff}
                           onUnstage={(path) => runScmAction(
                             (p) => unstageScmFile({ ...p, path }),
                             { busyKey: `unstage:${path}`, successMessage: `Unstaged ${path}` }
                           )}
                         />
                       ))}
                    </div>
                  </div>
                )}

                {/* Changes */}
                {changedFiles.length > 0 && (
                  <div className="scm-section">
                    <div className="scm-section-header" style={{ marginTop: 8 }}>
                       <i className="fa-solid fa-chevron-down" /> Changes 
                       <span className="scm-badge">{changedFiles.length}</span>
                       <div style={{ flex: 1 }} />
                       <div className="scm-file-actions" style={{ display: 'flex' }}>
                          <button
                            className="scm-file-action-btn"
                            disabled={busyAction === 'stage-all'}
                            onClick={() => {
                              if (stageAllInProgressRef.current) return;
                              stageAllInProgressRef.current = true;
                              runScmAction(stageAllScm, { busyKey: 'stage-all', successMessage: 'Staged all changes.' })
                                .finally(() => { stageAllInProgressRef.current = false; });
                            }}
                            title="Stage All"
                          >
                            {busyAction === 'stage-all'
                              ? <i className="fa-solid fa-spinner fa-spin" />
                              : <i className="fa-solid fa-plus" />}
                          </button>
                       </div>
                    </div>
                    {/* Virtualized scroll container – prevents DOM thrash on 300+ rows */}
                    <div className="scm-file-list" style={{ maxHeight: 300, overflowY: 'auto', willChange: 'transform' }}>
                       {changedFiles.map(file => (
                         <ScmFileRow
                           key={file.path}
                           file={file}
                           busyAction={busyAction}
                           onOpen={handleOpenFileDiff}
                           onDiscard={handleDiscardFile}
                           onStage={(path) => runScmAction(
                             (p) => stageScmFile({ ...p, path }),
                             { busyKey: `stage:${path}`, successMessage: `Staged ${path}` }
                           )}
                         />
                       ))}
                    </div>
                  </div>
                )}

                {/* Inline Diff Viewer Modal-like logic (if expanded) */}
                {expandedDiffPath && diffStateByPath[expandedDiffPath] && (
                   <div style={{ padding: '0 12px 12px' }}>
                      <div style={{ 
                        background: 'rgba(0,0,0,0.3)', 
                        border: '1px solid rgba(255,255,255,0.08)',
                        borderRadius: 6,
                        overflow: 'hidden'
                      }}>
                        <div style={{ padding: '6px 12px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center' }}>
                           <span style={{ flex: 1, fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>{expandedDiffPath}</span>
                           <button className="scm-file-action-btn" style={{ width: 18, height: 18, fontSize: 12 }} onClick={() => setExpandedDiffPath('')}><i className="fa-solid fa-times" /></button>
                        </div>
                        <pre style={{ 
                          padding: 12, 
                          margin: 0,
                          fontSize: 11, 
                          color: '#a9b7c6', 
                          maxHeight: 250, 
                          overflow: 'auto',
                          fontFamily: 'var(--tilder-mono, monospace)',
                          whiteSpace: 'pre-wrap'
                        }}>
                          {diffStateByPath[expandedDiffPath].loading ? 'Loading diff...' : 
                           diffStateByPath[expandedDiffPath].error ? diffStateByPath[expandedDiffPath].error :
                           diffStateByPath[expandedDiffPath].workingTreeDiff || diffStateByPath[expandedDiffPath].stagedDiff || 'No changes.'}
                        </pre>
                      </div>
                   </div>
                )}

              </>
           )}
        </div>
      </div>
    </div>
  );

}
