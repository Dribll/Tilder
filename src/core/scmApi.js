import { apiFetch } from './apiBase.js';
import { isDesktopRuntime } from './runtime.js';

const SCM_STATUS_LABELS = {
  ' ': '',
  '!': 'Ignored',
  '?': 'Untracked',
  A: 'Added',
  C: 'Copied',
  D: 'Deleted',
  M: 'Modified',
  R: 'Renamed',
  U: 'Conflicted',
};

async function parseJson(response) {
  const raw = await response.text();
  let data = {};

  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    data = raw ? { message: raw } : {};
  }

  if (!response.ok) {
    const normalizedMessage = typeof data.message === 'string' ? data.message.trim() : '';
    const message =
      (response.status === 413 || normalizedMessage.includes('PayloadTooLargeError')
        ? 'The workspace mirror payload is too large. Tilder should skip generated folders like node_modules, dist, and build for Source Control.'
        : null) ||
      normalizedMessage ||
      (response.status === 404
        ? 'This Tilder deployment is missing the Node API routes.'
        : null) ||
      (response.status >= 500 && typeof window !== 'undefined' && window.location.port === '5173'
        ? 'Tilder API server is not reachable. Run the Node backend on port 3210, or use `npm run dev` so web and API start together.'
        : `SCM request failed (${response.status}).`);
    throw new Error(message);
  }

  return data;
}

async function post(path, payload) {
  const response = await apiFetch(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  return parseJson(response);
}

/**
 * Directly collects Git status on desktop via Tauri command execution.
 * All slow sub-operations (branch list, remote info, recent commits) run in
 * parallel via Promise.allSettled so they don't block each other.
 *
 * @param {string}  workspaceRoot
 * @param {boolean} [fastMode=false] – when true, skips git-log (used for
 *   post-action refreshes where commit history hasn't changed)
 */
async function collectDesktopScmStatus(workspaceRoot, fastMode = false) {
  const { desktopExecuteCommand } = await import('./desktopFileApi.js');

  const checkRepo = await desktopExecuteCommand('git', ['rev-parse', '--is-inside-work-tree'], workspaceRoot);
  if (!checkRepo || checkRepo.exitCode !== 0) {
    return {
      available: true,
      initialized: false,
      cwd: workspaceRoot,
      branch: null,
      branches: [],
      files: [],
      stagedCount: 0,
      changedCount: 0,
      recentCommits: [],
    };
  }

  // ── 1. Status (must run first – provides branch + file list) ──────────────
  const statusRes = await desktopExecuteCommand('git', ['status', '--porcelain=v1', '-b', '-u'], workspaceRoot);
  const statusOutput = statusRes?.stdout || '';
  const lines = statusOutput.split(/\r?\n/).filter(Boolean);

  let branch = 'main';
  let ahead = 0;
  let behind = 0;
  const files = [];

  for (const line of lines) {
    if (line.startsWith('##')) {
      const branchPart = line.slice(2).trim();
      const match = branchPart.match(/^([^.\s]+)(?:\.\.\.([^\s]+))?(?:\s+\[(?:ahead\s+(\d+))?[,\s]*(?:behind\s+(\d+))?\])?/);
      if (match) {
        branch = match[1] || 'main';
        ahead = parseInt(match[3] || '0', 10);
        behind = parseInt(match[4] || '0', 10);
      } else if (branchPart.includes('Initial commit on ')) {
        branch = branchPart.replace('Initial commit on ', '').trim();
      } else if (branchPart.includes('No commits yet on ')) {
        branch = branchPart.replace('No commits yet on ', '').trim();
      }
      continue;
    }

    if (line.length >= 4) {
      const index = line[0];
      const workingDir = line[1];
      let filePath = line.slice(3).trim();
      if (filePath.startsWith('"') && filePath.endsWith('"')) {
        filePath = filePath.slice(1, -1);
      }
      if (filePath.includes(' -> ')) {
        filePath = filePath.split(' -> ').pop().trim();
      }
      const isStaged = index.trim() !== '' && index !== '?';
      const isUntracked = index === '?' || workingDir === '?';
      const hasWorkingTreeChanges = workingDir.trim() !== '' || isUntracked;

      files.push({
        path: filePath.replace(/\\/g, '/'),
        index,
        workingDir,
        stagedLabel: SCM_STATUS_LABELS[index] || (index.trim() ? 'Changed' : ''),
        workingTreeLabel: SCM_STATUS_LABELS[workingDir] || (workingDir.trim() ? 'Changed' : ''),
        isStaged,
        hasWorkingTreeChanges,
        isUntracked,
        canStage: !isStaged || hasWorkingTreeChanges || isUntracked,
        canUnstage: isStaged,
        canDiscard: hasWorkingTreeChanges || isUntracked,
      });
    }
  }

  // ── 2. Parallel sub-queries (branch list + remote + optional log) ─────────
  const branchListPromise = desktopExecuteCommand('git', ['branch', '--list'], workspaceRoot);
  const remotePromise     = desktopExecuteCommand('git', ['remote', '-v'], workspaceRoot);
  const logPromise        = fastMode
    ? Promise.resolve(null)
    : desktopExecuteCommand('git', ['log', '-n', '8', '--pretty=format:%H|%s|%an|%ad'], workspaceRoot);

  const [branchListResult, remoteResult, logResult] = await Promise.allSettled([
    branchListPromise, remotePromise, logPromise,
  ]);

  // Branch list
  let branches = [branch];
  if (branchListResult.status === 'fulfilled') {
    const branchRes = branchListResult.value;
    if (branchRes?.exitCode === 0 && branchRes?.stdout) {
      const parsed = branchRes.stdout.split(/\r?\n/)
        .map(b => b.replace(/^[*+\s]+/, '').trim())
        .filter(Boolean);
      if (parsed.length) branches = parsed;
    }
  }

  // Remote info
  let hasRemote = false;
  let remoteUrl = '';
  let remoteName = null;
  if (remoteResult.status === 'fulfilled') {
    const remoteRes = remoteResult.value;
    if (remoteRes?.exitCode === 0 && remoteRes?.stdout) {
      const firstLine = remoteRes.stdout.split(/\r?\n/)[0];
      if (firstLine) {
        const parts = firstLine.split(/\s+/);
        remoteName = parts[0] || 'origin';
        remoteUrl  = parts[1] || '';
        hasRemote  = true;
      }
    }
  }

  // Recent commits
  let recentCommits = [];
  if (logResult.status === 'fulfilled' && logResult.value) {
    const logRes = logResult.value;
    if (logRes?.exitCode === 0 && logRes?.stdout) {
      recentCommits = logRes.stdout.split(/\r?\n/).filter(Boolean).map(entry => {
        const [hash, message, author_name, date] = entry.split('|');
        return { hash, message, author_name, date };
      });
    }
  }

  const stagedCount  = files.filter(f => f.canUnstage).length;
  const changedCount = files.filter(f => f.canStage).length;

  return {
    available: true,
    initialized: true,
    hasRemote,
    remoteUrl,
    remoteName,
    cwd: workspaceRoot,
    branch,
    branches,
    ahead,
    behind,
    stagedCount,
    changedCount,
    files,
    recentCommits,
  };
}

export async function fetchScmStatus(payload, fastMode = false) {
  const root = payload?.workspaceRoot || '';
  if (isDesktopRuntime() && root) {
    try {
      return await collectDesktopScmStatus(root, fastMode);
    } catch (err) {
      console.warn('Desktop native SCM status failed, trying server fallback:', err);
    }
  }

  const result = await post('/api/scm/status', payload);
  if (result.hasRemote == null && isDesktopRuntime() && root) {
    try {
      const { desktopExecuteCommand } = await import('./desktopFileApi.js');
      const remotesRes = await desktopExecuteCommand('git', ['remote'], root);
      const hasRemote = remotesRes?.exitCode === 0 && Boolean(remotesRes?.stdout?.trim());
      result.hasRemote = hasRemote;
      if (hasRemote) {
        const urlRes = await desktopExecuteCommand('git', ['remote', 'get-url', 'origin'], root);
        if (urlRes?.exitCode === 0) {
          result.remoteUrl = urlRes.stdout.trim();
        }
      }
    } catch (_) {}
  }
  return result;
}

export async function initializeScm(payload) {
  const root = payload?.workspaceRoot || '';
  if (isDesktopRuntime() && root) {
    const { desktopExecuteCommand } = await import('./desktopFileApi.js');
    const res = await desktopExecuteCommand('git', ['init'], root);
    if (res && res.exitCode !== 0) {
      throw new Error(res.stderr || res.stdout || 'Failed to initialize Git repository.');
    }
    return await fetchScmStatus(payload);
  }
  return post('/api/scm/init', payload);
}

export async function stageAllScm(payload) {
  const root = payload?.workspaceRoot || '';
  if (isDesktopRuntime() && root) {
    const { desktopExecuteCommand } = await import('./desktopFileApi.js');
    const res = await desktopExecuteCommand('git', ['add', '-A'], root);
    if (res && res.exitCode !== 0) {
      throw new Error(res.stderr || res.stdout || 'Failed to stage changes.');
    }
    // Fast mode: skip git log since staging doesn't create commits
    return await fetchScmStatus(payload, true);
  }
  return post('/api/scm/stage', payload);
}

export async function unstageAllScm(payload) {
  const root = payload?.workspaceRoot || '';
  if (isDesktopRuntime() && root) {
    const { desktopExecuteCommand } = await import('./desktopFileApi.js');
    const restoreRes = await desktopExecuteCommand('git', ['restore', '--staged', '.'], root);
    if (restoreRes?.exitCode !== 0) {
      await desktopExecuteCommand('git', ['reset', 'HEAD'], root);
    }
    return await fetchScmStatus(payload, true);
  }
  return post('/api/scm/unstage-all', payload);
}

export async function stageScmFile(payload) {
  const root = payload?.workspaceRoot || '';
  const target = payload?.path || '';
  if (isDesktopRuntime() && root && target) {
    const { desktopExecuteCommand } = await import('./desktopFileApi.js');
    const res = await desktopExecuteCommand('git', ['add', '--', target], root);
    if (res && res.exitCode !== 0) {
      throw new Error(res.stderr || res.stdout || `Failed to stage ${target}.`);
    }
    return await fetchScmStatus(payload, true);
  }
  return post('/api/scm/stage-file', payload);
}

export async function unstageScmFile(payload) {
  const root = payload?.workspaceRoot || '';
  const target = payload?.path || '';
  if (isDesktopRuntime() && root && target) {
    const { desktopExecuteCommand } = await import('./desktopFileApi.js');
    const res = await desktopExecuteCommand('git', ['restore', '--staged', '--', target], root);
    if (res?.exitCode !== 0) {
      await desktopExecuteCommand('git', ['reset', 'HEAD', '--', target], root);
    }
    return await fetchScmStatus(payload, true);
  }
  return post('/api/scm/unstage-file', payload);
}

export async function discardScmFile(payload) {
  const root = payload?.workspaceRoot || '';
  const target = payload?.path || '';
  if (isDesktopRuntime() && root && target) {
    const { desktopExecuteCommand } = await import('./desktopFileApi.js');
    await desktopExecuteCommand('git', ['restore', '--', target], root).catch(() => {});
    await desktopExecuteCommand('git', ['checkout', '--', target], root).catch(() => {});
    await desktopExecuteCommand('git', ['clean', '-f', '--', target], root).catch(() => {});
    return await fetchScmStatus(payload, true);
  }
  return post('/api/scm/discard-file', payload);
}

export async function fetchScmFileDiff(payload) {
  const root = payload?.workspaceRoot || '';
  const targetPath = payload?.path || '';
  if (isDesktopRuntime() && root && targetPath) {
    try {
      const { desktopExecuteCommand, desktopReadFile } = await import('./desktopFileApi.js');
      const headRes = await desktopExecuteCommand('git', ['show', `HEAD:${targetPath}`], root);
      const originalContent = (headRes && headRes.exitCode === 0 && headRes.stdout) ? headRes.stdout : '';
      const fullPath = `${root.replace(/\\/g, '/')}/${targetPath.replace(/\\/g, '/')}`;
      let modifiedContent = '';
      try {
        modifiedContent = await desktopReadFile(fullPath);
      } catch {
        modifiedContent = '';
      }

      let stagedDiff = '';
      let workingTreeDiff = '';
      try {
        const sDiff = await desktopExecuteCommand('git', ['diff', '--cached', '--', targetPath], root);
        if (sDiff?.exitCode === 0) stagedDiff = sDiff.stdout;
        const wDiff = await desktopExecuteCommand('git', ['diff', '--', targetPath], root);
        if (wDiff?.exitCode === 0) workingTreeDiff = wDiff.stdout;
      } catch (_) {}

      return {
        path: targetPath,
        originalContent,
        modifiedContent,
        stagedDiff,
        workingTreeDiff,
      };
    } catch (err) {
      console.warn('Desktop file diff fallback to API:', err);
    }
  }

  return post('/api/scm/diff-file', payload);
}

export async function commitScm(payload) {
  const root = payload?.workspaceRoot || '';
  const message = payload?.message || '';
  if (isDesktopRuntime() && root && message) {
    const { desktopExecuteCommand } = await import('./desktopFileApi.js');
    const res = await desktopExecuteCommand('git', ['commit', '-m', message], root);
    if (res && res.exitCode !== 0) {
      throw new Error(res.stderr || res.stdout || 'Git commit failed.');
    }
    return await fetchScmStatus(payload);
  }
  return post('/api/scm/commit', payload);
}

export async function createScmBranch(payload) {
  const root = payload?.workspaceRoot || '';
  const branch = payload?.branch || '';
  if (isDesktopRuntime() && root && branch) {
    const { desktopExecuteCommand } = await import('./desktopFileApi.js');
    const res = await desktopExecuteCommand('git', ['checkout', '-b', branch], root);
    if (res && res.exitCode !== 0) {
      throw new Error(res.stderr || res.stdout || `Failed to create branch ${branch}.`);
    }
    return await fetchScmStatus(payload);
  }
  return post('/api/scm/create-branch', payload);
}

export async function checkoutScmBranch(payload) {
  const root = payload?.workspaceRoot || '';
  const branch = payload?.branch || '';
  if (isDesktopRuntime() && root && branch) {
    const { desktopExecuteCommand } = await import('./desktopFileApi.js');
    const res = await desktopExecuteCommand('git', ['checkout', branch], root);
    if (res && res.exitCode !== 0) {
      throw new Error(res.stderr || res.stdout || `Failed to checkout branch ${branch}.`);
    }
    return await fetchScmStatus(payload);
  }
  return post('/api/scm/checkout-branch', payload);
}

export async function syncScm(payload) {
  const root = payload?.workspaceRoot || '';
  if (isDesktopRuntime() && root) {
    try {
      const { desktopExecuteCommand } = await import('./desktopFileApi.js');
      // 1. Identify current branch
      let currentBranch = 'main';
      const branchRes = await desktopExecuteCommand('git', ['branch', '--show-current'], root);
      if (branchRes?.exitCode === 0 && branchRes?.stdout?.trim()) {
        currentBranch = branchRes.stdout.trim();
      } else {
        const revRes = await desktopExecuteCommand('git', ['rev-parse', '--abbrev-ref', 'HEAD'], root);
        if (revRes?.exitCode === 0 && revRes?.stdout?.trim()) {
          currentBranch = revRes.stdout.trim();
        }
      }

      // 2. Identify remote name
      let remoteName = null;
      const remotesRes = await desktopExecuteCommand('git', ['remote'], root);
      if (remotesRes?.exitCode === 0 && remotesRes?.stdout?.trim()) {
        const remotes = remotesRes.stdout.trim().split(/\s+/);
        if (remotes.includes('origin')) {
          remoteName = 'origin';
        } else if (remotes.length > 0) {
          remoteName = remotes[0];
        }
      }

      if (!remoteName) {
        throw new Error('No remote configured. Click "Publish to GitHub" to publish this repository.');
      }

      // 3. Auto-commit any pending uncommitted changes
      try {
        const statusRes = await desktopExecuteCommand('git', ['status', '--porcelain'], root);
        if (statusRes?.exitCode === 0 && statusRes?.stdout?.trim()) {
          await desktopExecuteCommand('git', ['add', '-A'], root);
          await desktopExecuteCommand('git', ['commit', '-m', 'Update from Tilder'], root);
        }
      } catch (_) {}

      // Non-interactive credential settings
      const credentialArgs = [
        '-c', 'credential.interactive=never',
        '-c', 'core.askPass=echo',
      ];

      // 4. Pull latest changes with rebase
      try {
        await desktopExecuteCommand('git', [...credentialArgs, 'pull', '--rebase', remoteName, currentBranch], root);
      } catch (_) {}

      // 5. Push and establish upstream tracking
      const pushRes = await desktopExecuteCommand('git', [...credentialArgs, 'push', '-u', remoteName, currentBranch], root);
      if (pushRes?.exitCode !== 0) {
        const fallbackRes = await desktopExecuteCommand('git', [...credentialArgs, 'push', '-u', remoteName, 'HEAD'], root);
        if (fallbackRes?.exitCode !== 0) {
          const err = fallbackRes?.stderr || fallbackRes?.stdout || pushRes?.stderr || pushRes?.stdout || 'Git push failed.';
          throw new Error(err);
        }
      }

      return await fetchScmStatus(payload);
    } catch (err) {
      console.warn('Desktop syncScm error:', err);
      if (err.message && !err.message.includes('Failed to fetch') && !err.message.includes('NetworkError')) {
        throw err;
      }
    }
  }
  return post('/api/scm/sync', payload);
}

export async function stashScm(payload) {
  const root = payload?.workspaceRoot || '';
  if (isDesktopRuntime() && root) {
    const { desktopExecuteCommand } = await import('./desktopFileApi.js');
    await desktopExecuteCommand('git', ['stash'], root);
    return await fetchScmStatus(payload);
  }
  return post('/api/scm/stash', payload);
}

export async function stashPopScm(payload) {
  const root = payload?.workspaceRoot || '';
  if (isDesktopRuntime() && root) {
    const { desktopExecuteCommand } = await import('./desktopFileApi.js');
    await desktopExecuteCommand('git', ['stash', 'pop'], root);
    return await fetchScmStatus(payload);
  }
  return post('/api/scm/stash-pop', payload);
}

export async function fetchScmBlame(filePath, workspaceRoot) {
  if (isDesktopRuntime() && workspaceRoot) {
    try {
      const { desktopExecuteCommand } = await import('./desktopFileApi.js');
      const res = await desktopExecuteCommand('git', ['blame', '-p', filePath], workspaceRoot);
      if (res && res.exitCode === 0 && res.stdout) {
        return res.stdout;
      }
    } catch (e) {
      console.error('Git blame failed:', e);
    }
  }
  return post('/api/scm/blame-file', { path: filePath }).then(res => res.blame).catch(() => null);
}

export async function getScmLog(cwd, filePath) {
  if (isDesktopRuntime() && cwd) {
    try {
      const { desktopExecuteCommand } = await import('./desktopFileApi.js');
      const args = ['log', '-n', '20', '--pretty=format:%H|%s|%an|%ad'];
      if (filePath) args.push('--', filePath);
      const res = await desktopExecuteCommand('git', args, cwd);
      if (res && res.exitCode === 0 && res.stdout) {
        const commits = res.stdout.split(/\r?\n/).filter(Boolean).map(line => {
          const [hash, message, author, date] = line.split('|');
          return { hash, message, author, date };
        });
        return { commits };
      }
    } catch (_) {}
  }
  return post('/api/scm/log', { cwd, file: filePath });
}

export async function createScmTag(payload) {
  const root = payload?.workspaceRoot || '';
  const tag = payload?.tag || '';
  if (isDesktopRuntime() && root && tag) {
    const { desktopExecuteCommand } = await import('./desktopFileApi.js');
    await desktopExecuteCommand('git', ['tag', tag], root);
    return await fetchScmStatus(payload);
  }
  return post('/api/scm/create-tag', payload);
}
