import React, { useEffect, useMemo, useState } from 'react';
import {
  fetchGitHubRepos,
  createGitHubRepo,
  fetchGitHubUser,
  fetchGitHubOrgs,
  cloneGitHubRepo,
  fetchGitHubRepoTree,
  fetchGitHubRepoBlob,
  fetchGitHubPulls,
  fetchGitHubIssues,
} from '../../../../core/accountApi.js';
import { desktopPickFolder, desktopExecuteCommand, openExternalUrl } from '../../../../core/desktopFileApi.js';
import { syncScm } from '../../../../core/scmApi.js';
import { isDesktopRuntime } from '../../../../core/runtime.js';
import './GitHub.css';

// Language color mapping for GitHub languages
const LANGUAGE_COLORS = {
  JavaScript: '#f1e05a',
  TypeScript: '#3178c6',
  Python: '#3572a5',
  Rust: '#dea584',
  HTML: '#e34c26',
  CSS: '#563d7c',
  Java: '#b07219',
  'C++': '#f34b7d',
  C: '#555555',
  'C#': '#178600',
  Go: '#00add8',
  Ruby: '#701516',
  PHP: '#4f5d95',
  Shell: '#89e051',
  PowerShell: '#012456',
  Vue: '#41b883',
  Dart: '#00b4ab',
  Kotlin: '#a97bff',
  Swift: '#f05138',
};

function GitHub({
  ariaExpandedisplaygithub,
  authSession,
  openAccount,
  workspace,
  pushNotification,
  handleCloneGitHubRepo,
  onOpenWorkspaceFolder,
}) {
  const isVisible = ariaExpandedisplaygithub === 'flex';
  const githubAccount = authSession?.accounts?.github;

  // Navigation tab: 'repos' | 'create' | 'pulls' | 'issues'
  const [activeTab, setActiveTab] = useState('repos');

  // Core Data
  const [userProfile, setUserProfile] = useState(null);
  const [organizations, setOrganizations] = useState([]);
  const [repositories, setRepositories] = useState([]);
  const [pullRequests, setPullRequests] = useState([]);
  const [issues, setIssues] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [filterVisibility, setFilterVisibility] = useState('all'); // 'all' | 'public' | 'private'
  const [filterOwner, setFilterOwner] = useState('all'); // 'all' | username | orgLogin
  const [sortBy, setSortBy] = useState('updated'); // 'updated' | 'name' | 'stars'

  // Repository Creation State
  const [repoOwner, setRepoOwner] = useState('');
  const [repoName, setRepoName] = useState('');
  const [repoDescription, setRepoDescription] = useState('');
  const [repoVisibility, setRepoVisibility] = useState('public'); // 'public' | 'private'
  const [initReadme, setInitReadme] = useState(true);
  const [gitignoreTemplate, setGitignoreTemplate] = useState('');
  const [licenseTemplate, setLicenseTemplate] = useState('mit');
  const [openAfterCreate, setOpenAfterCreate] = useState(true);
  const [creatingRepo, setCreatingRepo] = useState(false);
  const [createError, setCreateError] = useState('');
  const [createSuccess, setCreateSuccess] = useState('');

  // Remote Tree / Codebase Explorer State
  const [expandedRepoTree, setExpandedRepoTree] = useState(null); // repo fullName
  const [repoTrees, setRepoTrees] = useState({}); // { [repoFullName]: [] }
  const [loadingTree, setLoadingTree] = useState(false);
  const [cloningRepo, setCloningRepo] = useState(null); // repo fullName currently cloning
  const [copiedUrlRepo, setCopiedUrlRepo] = useState(null);

  // Suggested repository name from active workspace
  const suggestedRepoName = useMemo(() => {
    const raw = workspace?.rootName || workspace?.getRootNode?.()?.name || '';
    return String(raw || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }, [workspace]);

  // Detected remote repository URL/fullName for current workspace
  const [workspaceRemoteRepo, setWorkspaceRemoteRepo] = useState(null);
  const [syncingWorkspace, setSyncingWorkspace] = useState(false);

  // Check if current workspace has an existing git remote origin
  const checkWorkspaceRemote = React.useCallback(async () => {
    if (!isDesktopRuntime() || !workspace?.rootSystemPath) {
      setWorkspaceRemoteRepo(null);
      return;
    }
    try {
      const res = await desktopExecuteCommand('git', ['remote', 'get-url', 'origin'], workspace.rootSystemPath);
      if (res?.exitCode === 0 && res?.stdout) {
        const rawUrl = res.stdout.trim();
        // Extract owner/repo (e.g. https://github.com/owner/repo.git or git@github.com:owner/repo.git)
        const match = rawUrl.match(/github\.com[/:]([^/]+)\/([^/.]+)(?:\.git)?/i);
        if (match) {
          setWorkspaceRemoteRepo({
            fullName: `${match[1]}/${match[2]}`,
            owner: match[1],
            name: match[2],
            url: rawUrl,
          });
          return;
        }
      }
      setWorkspaceRemoteRepo(null);
    } catch {
      setWorkspaceRemoteRepo(null);
    }
  }, [workspace?.rootSystemPath]);

  useEffect(() => {
    checkWorkspaceRemote();
  }, [checkWorkspaceRemote, workspace?.rootName]);

  // Matched repository: either detected from git remote origin or by matching active workspace name
  const matchedRepo = useMemo(() => {
    if (workspaceRemoteRepo) return workspaceRemoteRepo;
    if (!repositories || repositories.length === 0) return null;
    const nameLower = (workspace?.rootName || suggestedRepoName || '').toLowerCase().trim();
    if (!nameLower) return null;
    const found = repositories.find(
      (r) => r.name?.toLowerCase() === nameLower || r.full_name?.toLowerCase().endsWith(`/${nameLower}`)
    );
    if (found) {
      return {
        fullName: found.full_name,
        owner: found.owner?.login,
        name: found.name,
        url: found.html_url || `https://github.com/${found.full_name}`,
        cloneUrl: found.clone_url || `https://github.com/${found.full_name}.git`,
      };
    }
    return null;
  }, [workspaceRemoteRepo, repositories, workspace?.rootName, suggestedRepoName]);

  // Sync / Push changes for connected repository
  async function handleSyncWorkspaceRemote() {
    if (syncingWorkspace) return;
    setSyncingWorkspace(true);
    pushNotification?.('Syncing changes with GitHub...', 'info');
    try {
      if (isDesktopRuntime() && workspace?.rootSystemPath) {
        const username = githubAccount?.username || matchedRepo?.owner || '';
        const targetRepo = workspaceRemoteRepo || matchedRepo;

        // Ensure remote origin exists
        const remoteCheck = await desktopExecuteCommand('git', ['remote', 'get-url', 'origin'], workspace.rootSystemPath);
        if (remoteCheck?.exitCode !== 0 && targetRepo?.cloneUrl) {
          const statusCheck = await desktopExecuteCommand('git', ['status'], workspace.rootSystemPath);
          if (statusCheck?.exitCode !== 0) {
            await desktopExecuteCommand('git', ['init'], workspace.rootSystemPath);
          }
          await desktopExecuteCommand('git', ['remote', 'add', 'origin', targetRepo.cloneUrl], workspace.rootSystemPath);
        }

        // Configure local git repo with credential settings to avoid GUI prompts
        if (username) {
          try {
            await desktopExecuteCommand('git', ['config', 'credential.https://github.com.username', username], workspace.rootSystemPath);
            await desktopExecuteCommand('git', ['config', 'credential.interactive', 'never'], workspace.rootSystemPath);
          } catch (_) {}
        }

        // Auto-stage & commit if there are pending uncommitted changes
        try {
          const statusRes = await desktopExecuteCommand('git', ['status', '--porcelain'], workspace.rootSystemPath);
          if (statusRes.exitCode === 0 && statusRes.stdout.trim()) {
            await desktopExecuteCommand('git', ['add', '-A'], workspace.rootSystemPath);
            await desktopExecuteCommand('git', ['commit', '-m', 'Update from Tilder'], workspace.rootSystemPath);
          }
        } catch (_) {}

        // Non-interactive credential parameters to bypass GCM account picker dialogs
        const credentialArgs = [
          '-c', 'credential.interactive=never',
          ...(username ? ['-c', `credential.https://github.com.username=${username}`] : []),
        ];

        // Pull with rebase
        try {
          await desktopExecuteCommand('git', [...credentialArgs, 'pull', '--rebase'], workspace.rootSystemPath);
        } catch (_) {}

        // Push to origin HEAD
        const pushRes = await desktopExecuteCommand('git', [...credentialArgs, 'push', '-u', 'origin', 'HEAD'], workspace.rootSystemPath);
        if (pushRes.exitCode === 0) {
          const outText = (pushRes.stdout || pushRes.stderr || '').toLowerCase();
          if (outText.includes('everything up-to-date') || outText.includes('up to date')) {
            pushNotification?.('Everything is up to date with GitHub!', 'success');
          } else {
            pushNotification?.('Pushed & synced changes to GitHub successfully!', 'success');
          }
          checkWorkspaceRemote();
        } else {
          const errText = pushRes.stderr || pushRes.stdout || 'Git push returned non-zero code.';
          pushNotification?.(`Push notice: ${errText.slice(0, 150)}`, 'warning');
        }
      } else {
        await syncScm({ workspaceRoot: workspace?.rootSystemPath || '' });
        pushNotification?.('Synced with GitHub successfully!', 'success');
      }
    } catch (err) {
      pushNotification?.(`Sync failed: ${err.message || err}`, 'error');
    } finally {
      setSyncingWorkspace(false);
    }
  }

  // Initial load when panel becomes visible and authenticated
  useEffect(() => {
    if (!isVisible || !githubAccount) {
      return;
    }

    loadAllGitHubData();
  }, [githubAccount?.id, isVisible]);

  // Sync default repo owner once account or profile loads
  useEffect(() => {
    if (githubAccount?.username && !repoOwner) {
      setRepoOwner(githubAccount.username);
    }
  }, [githubAccount?.username, repoOwner]);

  async function loadAllGitHubData(isManualRefresh = false) {
    if (isManualRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError('');

    try {
      // Parallel fetch of user info, orgs, and repositories
      const [userRes, orgsRes, reposRes] = await Promise.all([
        fetchGitHubUser().catch(() => null),
        fetchGitHubOrgs().catch(() => ({ organizations: [] })),
        fetchGitHubRepos({ per_page: 100 }).catch((err) => {
          throw err;
        }),
      ]);

      if (userRes?.user) {
        setUserProfile(userRes.user);
      }
      if (Array.isArray(orgsRes?.organizations)) {
        setOrganizations(orgsRes.organizations);
      }
      if (Array.isArray(reposRes?.repositories)) {
        setRepositories(reposRes.repositories);
      }

      // Secondary fetch for PRs and issues (non-blocking)
      fetchGitHubPulls().then((res) => {
        if (Array.isArray(res?.pullRequests)) setPullRequests(res.pullRequests);
      }).catch(() => {});

      fetchGitHubIssues().then((res) => {
        if (Array.isArray(res?.issues)) setIssues(res.issues);
      }).catch(() => {});
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Unable to load GitHub repositories.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  // Check if repository name conflicts with an existing repo
  const existingNameConflict = useMemo(() => {
    if (!repoName.trim()) return false;
    const targetOwner = repoOwner || githubAccount?.username || '';
    const full = `${targetOwner}/${repoName.trim()}`.toLowerCase();
    return repositories.some((r) => r.fullName?.toLowerCase() === full || (r.owner?.login?.toLowerCase() === targetOwner.toLowerCase() && r.name?.toLowerCase() === repoName.trim().toLowerCase()));
  }, [repoName, repoOwner, githubAccount?.username, repositories]);

  // Filtered and sorted repositories
  const filteredRepositories = useMemo(() => {
    return repositories
      .filter((repo) => {
        // Search query filter
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchName = repo.fullName?.toLowerCase().includes(q) || repo.name?.toLowerCase().includes(q);
          const matchDesc = repo.description?.toLowerCase().includes(q);
          const matchLang = repo.language?.toLowerCase().includes(q);
          if (!matchName && !matchDesc && !matchLang) return false;
        }
        // Visibility filter
        if (filterVisibility === 'public' && repo.private) return false;
        if (filterVisibility === 'private' && !repo.private) return false;
        // Owner filter
        if (filterOwner !== 'all') {
          if (repo.owner?.login?.toLowerCase() !== filterOwner.toLowerCase()) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'name') {
          return a.name.localeCompare(b.name);
        }
        if (sortBy === 'stars') {
          return (b.stars || 0) - (a.stars || 0);
        }
        // Default: recently updated / pushed
        const timeA = new Date(a.pushedAt || a.updatedAt || 0).getTime();
        const timeB = new Date(b.pushedAt || b.updatedAt || 0).getTime();
        return timeB - timeA;
      });
  }, [repositories, searchQuery, filterVisibility, filterOwner, sortBy]);

  // 1-Click "Open in Tilder" (Clone and Immediately Switch Workspace)
  async function handleOpenInTilder(repo, customFolder = null) {
    if (!repo) return;
    try {
      setCloningRepo(repo.fullName);
      pushNotification?.(`Cloning ${repo.fullName}...`, 'info');

      // Call desktop clone API
      const result = await cloneGitHubRepo({
        repoFullName: repo.fullName,
        repoName: repo.name,
        targetDir: customFolder || '',
      });

      if (result?.localPath) {
        pushNotification?.(result.message || `Cloned ${repo.name}! Opening workspace...`, 'success');

        // Immediately open the folder in Tilder workspace
        if (onOpenWorkspaceFolder) {
          await onOpenWorkspaceFolder(result.localPath, repo.name);
        } else if (handleCloneGitHubRepo) {
          await handleCloneGitHubRepo(repo.fullName);
        }
      }
    } catch (caughtError) {
      const msg = caughtError instanceof Error ? caughtError.message : 'Failed to clone and open repository.';
      pushNotification?.(msg, 'error');
    } finally {
      setCloningRepo(null);
    }
  }

  // Clone into custom directory
  async function handleCloneToCustomFolder(repo) {
    try {
      const selection = await desktopPickFolder();
      if (!selection?.path) return;
      await handleOpenInTilder(repo, selection.path);
    } catch (err) {
      console.error(err);
    }
  }

  // Copy Clone URL
  function handleCopyCloneUrl(repo) {
    const url = repo.cloneUrl || `https://github.com/${repo.fullName}.git`;
    navigator.clipboard?.writeText(url);
    setCopiedUrlRepo(repo.fullName);
    pushNotification?.(`Copied ${url} to clipboard!`, 'info');
    setTimeout(() => {
      setCopiedUrlRepo(null);
    }, 2000);
  }

  // Toggle Remote File Tree View
  async function handleToggleRemoteTree(repo) {
    if (expandedRepoTree === repo.fullName) {
      setExpandedRepoTree(null);
      return;
    }

    setExpandedRepoTree(repo.fullName);
    if (repoTrees[repo.fullName]) {
      return; // Already loaded
    }

    try {
      setLoadingTree(true);
      const owner = repo.owner?.login || repo.fullName.split('/')[0];
      const name = repo.name || repo.fullName.split('/')[1];
      const res = await fetchGitHubRepoTree(owner, name, repo.defaultBranch || 'main');
      if (Array.isArray(res?.tree)) {
        setRepoTrees((prev) => ({
          ...prev,
          [repo.fullName]: res.tree,
        }));
      }
    } catch (err) {
      pushNotification?.('Unable to load remote files for this repository.', 'warning');
    } finally {
      setLoadingTree(false);
    }
  }

  // Preview Remote File in Tilder Editor
  async function handlePreviewFile(repo, fileItem) {
    try {
      pushNotification?.(`Loading ${fileItem.path}...`, 'info');
      const owner = repo.owner?.login || repo.fullName.split('/')[0];
      const name = repo.name || repo.fullName.split('/')[1];
      const res = await fetchGitHubRepoBlob(owner, name, fileItem.path, repo.defaultBranch || 'main');

      if (res && typeof res.content === 'string') {
        // Open file content as a draft tab in Tilder workspace
        if (workspace?.createUntitledFile) {
          const fileName = fileItem.path.split('/').pop() || 'preview.txt';
          workspace.createUntitledFile('root', `[GitHub] ${fileName}`, res.content);
          pushNotification?.(`Previewing ${fileName} from ${repo.name}.`, 'success');
        }
      }
    } catch (err) {
      pushNotification?.(err instanceof Error ? err.message : 'Unable to preview file.', 'error');
    }
  }

  // Create Repository Handler (Both Public and Private supported with full feedback)
  async function handleCreateRepository() {
    if (!repoName.trim()) {
      setCreateError('Please enter a repository name.');
      return;
    }
    if (existingNameConflict) {
      setCreateError(`A repository named "${repoName.trim()}" already exists on this account.`);
      return;
    }

    setCreatingRepo(true);
    setCreateError('');
    setCreateSuccess('');

    try {
      const isPrivate = repoVisibility === 'private';
      const response = await createGitHubRepo({
        name: repoName.trim(),
        description: repoDescription.trim(),
        private: isPrivate,
        owner: repoOwner,
        auto_init: initReadme,
        gitignore_template: gitignoreTemplate || undefined,
        license_template: licenseTemplate || undefined,
      });

      const repository = response?.repository;
      if (repository) {
        // Add to list and select
        setRepositories((current) => [repository, ...current.filter((e) => e.id !== repository.id)]);
        setCreateSuccess(`Repository ${repository.fullName} created successfully as ${isPrivate ? 'Private 🔒' : 'Public 🌐'}!`);
        pushNotification?.(`GitHub repository ${repository.fullName} created!`, 'success');

        // Reset form
        setRepoName('');
        setRepoDescription('');

        // If user published/created from current workspace, link it directly
        if (workspace?.rootSystemPath && (repoName.trim().toLowerCase() === suggestedRepoName.toLowerCase() || !workspaceRemoteRepo)) {
          const username = githubAccount?.username || repository.owner?.login || '';
          const authedUrl = `https://${username}@github.com/${repository.fullName}.git`;

          if (isDesktopRuntime()) {
            try {
              const checkGit = await desktopExecuteCommand('git', ['status'], workspace.rootSystemPath);
              if (checkGit?.exitCode !== 0) {
                await desktopExecuteCommand('git', ['init'], workspace.rootSystemPath);
              }
              await desktopExecuteCommand('git', ['add', '-A'], workspace.rootSystemPath);
              await desktopExecuteCommand('git', ['commit', '-m', 'Initial commit from Tilder'], workspace.rootSystemPath).catch(() => {});
              await desktopExecuteCommand('git', ['remote', 'remove', 'origin'], workspace.rootSystemPath).catch(() => {});
              await desktopExecuteCommand('git', ['remote', 'add', 'origin', authedUrl], workspace.rootSystemPath);

              if (username) {
                await desktopExecuteCommand('git', ['config', 'credential.https://github.com.username', username], workspace.rootSystemPath);
                await desktopExecuteCommand('git', ['config', 'credential.interactive', 'never'], workspace.rootSystemPath);
              }

              await desktopExecuteCommand('git', [
                '-c', 'credential.interactive=never',
                ...(username ? ['-c', `credential.https://github.com.username=${username}`] : []),
                'push', '-u', 'origin', 'HEAD'
              ], workspace.rootSystemPath).catch(() => {});
            } catch (_) {}
          }

          checkWorkspaceRemote();
          setActiveTab('repos');
          pushNotification?.(`Workspace linked to GitHub (@${repository.fullName})!`, 'success');
        } else if (openAfterCreate) {
          pushNotification?.(`Opening newly created repository in Tilder...`, 'info');
          await handleOpenInTilder(repository);
        } else {
          setActiveTab('repos');
        }
      }
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : 'Unable to create GitHub repository.';
      setCreateError(message);
      pushNotification?.(message, 'warning');
    } finally {
      setCreatingRepo(false);
    }
  }

  // Format Relative Timestamp
  function formatRelativeTime(dateString) {
    if (!dateString) return '';
    try {
      const diffMs = Date.now() - new Date(dateString).getTime();
      const diffMins = Math.floor(diffMs / (1000 * 60));
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      if (diffMins < 60) return `${diffMins || 1}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays < 30) return `${diffDays}d ago`;
      return new Date(dateString).toLocaleDateString();
    } catch {
      return '';
    }
  }

  return (
    <div id="githubarea" className={`gh-panel-root d-${ariaExpandedisplaygithub}`}>
      {/* ── Top Header ────────────────────────────────────── */}
      <div className="gh-header">
        <div className="gh-header-left">
          <i className="fa-brands fa-github" style={{ fontSize: 15, color: '#ffffff' }} />
          <span className="gh-header-title">GitHub</span>
        </div>
        <div className="gh-header-actions">
          {githubAccount && (
            <>
              <button
                className="gh-icon-btn"
                onClick={() => loadAllGitHubData(true)}
                title="Refresh Repositories"
                disabled={refreshing}
              >
                <i className={`fa-solid fa-arrows-rotate ${refreshing ? 'fa-spin' : ''}`} />
              </button>
              <button className="gh-icon-btn" onClick={openAccount} title="GitHub Account Settings">
                <i className="fa-solid fa-gear" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── Unauthenticated State ─────────────────────────── */}
      {!githubAccount ? (
        <div className="gh-body" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="gh-empty-state">
            <i className="fa-brands fa-github gh-empty-icon" style={{ fontSize: 48 }} />
            <h4 style={{ color: '#ffffff', margin: '0 0 6px 0', fontSize: 14 }}>Connect with GitHub</h4>
            <p style={{ fontSize: 11.5, marginBottom: 16, lineHeight: 1.4 }}>
              Sign in with your GitHub account to access all your repositories, create public and private repos, and open codebases directly in Tilder.
            </p>
            <button className="gh-btn-primary" onClick={openAccount} style={{ padding: '8px 16px', margin: '0 auto' }}>
              <i className="fa-brands fa-github" style={{ marginRight: 6 }} /> Open Account Center
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* ── Profile Summary Card ────────────────────────── */}
          <div className="gh-profile-card">
            <div className="gh-profile-main">
              {githubAccount.avatarUrl ? (
                <img src={githubAccount.avatarUrl} className="gh-avatar" alt="Avatar" />
              ) : (
                <div className="gh-avatar-placeholder">
                  <i className="fa-brands fa-github" />
                </div>
              )}
              <div className="gh-profile-meta">
                <div className="gh-profile-name-row">
                  <span className="gh-profile-name">{userProfile?.name || githubAccount.displayName || githubAccount.username}</span>
                  {userProfile?.htmlUrl && (
                    <a
                      href={userProfile.htmlUrl}
                      target="_blank"
                      rel="noreferrer"
                      title="View GitHub Profile"
                      style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10 }}
                    >
                      <i className="fa-solid fa-arrow-up-right-from-square" />
                    </a>
                  )}
                </div>
                <span className="gh-profile-user">@{githubAccount.username}</span>
              </div>
            </div>

            {/* Profile Statistics */}
            <div className="gh-profile-stats">
              <span className="gh-profile-stat-badge" title="Public Repositories">
                <i className="fa-solid fa-globe" style={{ color: '#2ecc71', fontSize: 9 }} />
                {userProfile?.publicRepos ?? repositories.filter((r) => !r.private).length} public
              </span>
              <span className="gh-profile-stat-badge" title="Private Repositories">
                <i className="fa-solid fa-lock" style={{ color: '#f1c40f', fontSize: 9 }} />
                {userProfile?.totalPrivateRepos ?? repositories.filter((r) => r.private).length} private
              </span>
              {organizations.length > 0 && (
                <span className="gh-profile-stat-badge" title="Organizations">
                  <i className="fa-solid fa-building" style={{ color: '#58a6ff', fontSize: 9 }} />
                  {organizations.length} orgs
                </span>
              )}
            </div>
          </div>

          {/* ── Navigation Tabs ─────────────────────────────── */}
          <div className="gh-nav-tabs">
            <button
              className={`gh-nav-tab ${activeTab === 'repos' ? 'active' : ''}`}
              onClick={() => setActiveTab('repos')}
            >
              <i className="fa-solid fa-book-bookmark" />
              Repositories
              <span className="gh-nav-count">{repositories.length}</span>
            </button>
            <button
              className={`gh-nav-tab ${activeTab === 'create' ? 'active' : ''}`}
              onClick={() => {
                setActiveTab('create');
                if (!repoName && suggestedRepoName) {
                  setRepoName(suggestedRepoName);
                }
              }}
            >
              <i className="fa-solid fa-plus" />
              New Repo
            </button>
            <button
              className={`gh-nav-tab ${activeTab === 'pulls' ? 'active' : ''}`}
              onClick={() => setActiveTab('pulls')}
            >
              <i className="fa-solid fa-code-pull-request" />
              PRs
              {pullRequests.length > 0 && <span className="gh-nav-count">{pullRequests.length}</span>}
            </button>
            <button
              className={`gh-nav-tab ${activeTab === 'issues' ? 'active' : ''}`}
              onClick={() => setActiveTab('issues')}
            >
              <i className="fa-regular fa-circle-dot" />
              Issues
              {issues.length > 0 && <span className="gh-nav-count">{issues.length}</span>}
            </button>
          </div>

          {/* ── Scrollable Body Content ─────────────────────── */}
          <div className="gh-body">
            {/* Global Error Notice */}
            {error && (
              <div className="gh-alert-box error">
                <i className="fa-solid fa-triangle-exclamation" style={{ marginTop: 2 }} />
                <span>{error}</span>
              </div>
            )}

            {/* ═════════ TAB 1: REPOSITORIES ═════════ */}
            {activeTab === 'repos' && (
              <>
                {/* Active Workspace Banner */}
                {workspace?.rootName && (
                  <div className={`gh-workspace-banner ${matchedRepo ? 'gh-workspace-banner-linked' : ''}`}>
                    <div className="gh-workspace-info">
                      <div className="gh-workspace-header-row">
                        <span className="gh-workspace-label">
                          <i className={matchedRepo ? 'fa-brands fa-github' : 'fa-solid fa-folder'} style={{ marginRight: 4 }} />
                          {matchedRepo ? 'Connected to GitHub' : 'Current Workspace'}
                        </span>
                      </div>
                      <span className="gh-workspace-name" title={matchedRepo ? matchedRepo.fullName : workspace.rootName}>
                        {workspace.rootName}
                        {matchedRepo && (
                          <span className="gh-workspace-subname"> ({matchedRepo.fullName})</span>
                        )}
                      </span>
                    </div>

                    {matchedRepo ? (
                      <div className="gh-workspace-actions">
                        <button
                          className="gh-workspace-btn gh-workspace-sync-btn"
                          disabled={syncingWorkspace}
                          onClick={handleSyncWorkspaceRemote}
                          title="Sync and push workspace changes to GitHub"
                        >
                          <i className={`fa-solid ${syncingWorkspace ? 'fa-spinner fa-spin' : 'fa-cloud-arrow-up'}`} />
                          {syncingWorkspace ? 'Syncing...' : 'Sync Changes'}
                        </button>
                        <button
                          className="gh-workspace-icon-btn"
                          onClick={() => openExternalUrl(matchedRepo.url || `https://github.com/${matchedRepo.fullName}`)}
                          title="Open repository on GitHub.com"
                        >
                          <i className="fa-solid fa-arrow-up-right-from-square" />
                        </button>
                      </div>
                    ) : (
                      <button
                        className="gh-workspace-btn"
                        onClick={() => {
                          setActiveTab('create');
                          setRepoName(suggestedRepoName);
                        }}
                        title="Publish this workspace as a new GitHub repository"
                      >
                        <i className="fa-solid fa-cloud-arrow-up" /> Publish to GitHub
                      </button>
                    )}
                  </div>
                )}

                {/* Search & Filter Bar */}
                <div className="gh-search-filter-box">
                  <div className="gh-search-input-wrap">
                    <i className="fa-solid fa-magnifying-glass gh-search-icon" />
                    <input
                      className="gh-search-input"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search repositories..."
                    />
                    {searchQuery && (
                      <button className="gh-search-clear" onClick={() => setSearchQuery('')}>
                        <i className="fa-solid fa-xmark" />
                      </button>
                    )}
                  </div>

                  <div className="gh-filter-row">
                    <select
                      className="gh-filter-select"
                      value={filterOwner}
                      onChange={(e) => setFilterOwner(e.target.value)}
                    >
                      <option value="all">All Owners</option>
                      {githubAccount?.username && (
                        <option value={githubAccount.username}>@{githubAccount.username} (Personal)</option>
                      )}
                      {organizations.map((org) => (
                        <option key={org.id} value={org.login}>
                          🏢 {org.login}
                        </option>
                      ))}
                    </select>

                    <select
                      className="gh-filter-select"
                      value={filterVisibility}
                      onChange={(e) => setFilterVisibility(e.target.value)}
                    >
                      <option value="all">All Visibility</option>
                      <option value="public">🌐 Public</option>
                      <option value="private">🔒 Private</option>
                    </select>

                    <select
                      className="gh-filter-select"
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value)}
                    >
                      <option value="updated">Recently Updated</option>
                      <option value="name">Name (A-Z)</option>
                      <option value="stars">Most Stars</option>
                    </select>
                  </div>
                </div>

                {/* Loading State */}
                {loading && (
                  <div className="gh-empty-state">
                    <i className="fa-solid fa-circle-notch fa-spin gh-empty-icon" />
                    <p>Loading repositories from GitHub...</p>
                  </div>
                )}

                {/* Empty State */}
                {!loading && filteredRepositories.length === 0 && (
                  <div className="gh-empty-state">
                    <i className="fa-solid fa-folder-open gh-empty-icon" />
                    <p>{searchQuery ? 'No matching repositories found.' : 'No repositories found.'}</p>
                    {searchQuery && (
                      <button className="gh-btn-secondary" onClick={() => setSearchQuery('')} style={{ margin: '8px auto 0' }}>
                        Clear Search
                      </button>
                    )}
                  </div>
                )}

                {/* Repository Cards List */}
                {!loading &&
                  filteredRepositories.map((repo) => {
                    const isExpanded = expandedRepoTree === repo.fullName;
                    const treeFiles = repoTrees[repo.fullName] || [];
                    const isCloningThis = cloningRepo === repo.fullName;

                    return (
                      <div key={repo.id} className="gh-repo-card">
                        {/* Header: Title and Badges */}
                        <div className="gh-repo-card-header">
                          <div className="gh-repo-title-wrap">
                            <span
                              className={`gh-badge ${repo.private ? 'private' : 'public'}`}
                              title={repo.private ? 'Private Repository' : 'Public Repository'}
                            >
                              <i className={`fa-solid ${repo.private ? 'fa-lock' : 'fa-globe'}`} />
                              {repo.private ? 'Private' : 'Public'}
                            </span>
                            <span
                              className="gh-repo-name-link"
                              onClick={() => handleOpenInTilder(repo)}
                              title={`Open ${repo.fullName} in Tilder`}
                            >
                              {repo.fullName}
                            </span>
                          </div>
                          <a
                            href={repo.url}
                            target="_blank"
                            rel="noreferrer"
                            className="gh-icon-btn"
                            title="View on GitHub.com"
                          >
                            <i className="fa-solid fa-arrow-up-right-from-square" />
                          </a>
                        </div>

                        {/* Description */}
                        {repo.description ? (
                          <div className="gh-repo-desc">{repo.description}</div>
                        ) : (
                          <div className="gh-repo-desc" style={{ fontStyle: 'italic', opacity: 0.5 }}>
                            No description provided.
                          </div>
                        )}

                        {/* Metadata row */}
                        <div className="gh-repo-meta">
                          {repo.language && (
                            <span className="gh-repo-meta-item">
                              <span
                                className="gh-lang-dot"
                                style={{ background: LANGUAGE_COLORS[repo.language] || '#cccccc' }}
                              />
                              {repo.language}
                            </span>
                          )}
                          {repo.stars > 0 && (
                            <span className="gh-repo-meta-item">
                              <i className="fa-solid fa-star" style={{ color: '#e3b341' }} />
                              {repo.stars}
                            </span>
                          )}
                          {repo.forks > 0 && (
                            <span className="gh-repo-meta-item">
                              <i className="fa-solid fa-code-fork" />
                              {repo.forks}
                            </span>
                          )}
                          <span className="gh-repo-meta-item">
                            <i className="fa-solid fa-code-branch" style={{ opacity: 0.6 }} />
                            {repo.defaultBranch || 'main'}
                          </span>
                          {repo.pushedAt && (
                            <span className="gh-repo-meta-item" style={{ marginLeft: 'auto' }}>
                              {formatRelativeTime(repo.pushedAt)}
                            </span>
                          )}
                        </div>

                        {/* ── Actions Row ──────────────────────────────────── */}
                        <div className="gh-repo-actions">
                          {/* Main Button: Open in Tilder (Clones & Opens Workspace) */}
                          <button
                            className="gh-btn-primary"
                            onClick={() => handleOpenInTilder(repo)}
                            disabled={isCloningThis}
                            title="Clone and immediately open codebase in Tilder"
                          >
                            <i className={`fa-solid ${isCloningThis ? 'fa-circle-notch fa-spin' : 'fa-folder-open'}`} />
                            {isCloningThis ? 'Opening in Tilder...' : 'Open in Tilder'}
                          </button>

                          {/* Clone to Custom Folder */}
                          <button
                            className="gh-btn-secondary"
                            onClick={() => handleCloneToCustomFolder(repo)}
                            disabled={isCloningThis}
                            title="Clone into a custom folder of your choice"
                          >
                            <i className="fa-solid fa-folder-plus" />
                          </button>

                          {/* Browse Remote Files */}
                          <button
                            className="gh-btn-secondary"
                            onClick={() => handleToggleRemoteTree(repo)}
                            title={isExpanded ? 'Hide Remote Files' : 'Browse Files Remotely'}
                          >
                            <i className={`fa-solid ${isExpanded ? 'fa-chevron-up' : 'fa-list-tree'}`} />
                            {isExpanded ? 'Files' : 'Browse'}
                          </button>

                          {/* Copy Clone URL */}
                          <button
                            className="gh-btn-secondary"
                            onClick={() => handleCopyCloneUrl(repo)}
                            title={copiedUrlRepo === repo.fullName ? 'Copied!' : 'Copy Git Clone URL'}
                          >
                            <i className={`fa-solid ${copiedUrlRepo === repo.fullName ? 'fa-check' : 'fa-copy'}`} />
                          </button>
                        </div>

                        {/* ── Remote File Tree View ───────────────────────── */}
                        {isExpanded && (
                          <div className="gh-remote-tree">
                            {loadingTree && (
                              <div style={{ padding: '8px', textAlign: 'center', color: 'rgba(255,255,255,0.5)' }}>
                                <i className="fa-solid fa-circle-notch fa-spin" style={{ marginRight: 6 }} />
                                Loading repository files...
                              </div>
                            )}
                            {!loadingTree && treeFiles.length === 0 && (
                              <div style={{ padding: '8px', color: 'rgba(255,255,255,0.4)', textAlign: 'center' }}>
                                No files found or empty repository.
                              </div>
                            )}
                            {!loadingTree &&
                              treeFiles.slice(0, 100).map((file) => (
                                <div
                                  key={file.path}
                                  className={`gh-tree-item ${file.type}`}
                                  onClick={() => {
                                    if (file.type === 'blob') {
                                      handlePreviewFile(repo, file);
                                    }
                                  }}
                                  title={file.type === 'blob' ? `Click to preview ${file.path} in Tilder` : file.path}
                                >
                                  <i
                                    className={`fa-solid ${file.type === 'tree' ? 'fa-folder' : 'fa-file-code'}`}
                                    style={{
                                      color: file.type === 'tree' ? '#e2b340' : 'rgba(255,255,255,0.6)',
                                      fontSize: 11,
                                    }}
                                  />
                                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {file.path}
                                  </span>
                                </div>
                              ))}
                            {!loadingTree && treeFiles.length > 100 && (
                              <div style={{ padding: '6px', fontSize: 10, color: 'rgba(255,255,255,0.4)', textAlign: 'center' }}>
                                Showing first 100 files ({treeFiles.length} total).
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
              </>
            )}

            {/* ═════════ TAB 2: CREATE REPOSITORY ═════════ */}
            {activeTab === 'create' && (
              <div className="gh-create-section">
                {/* Status Banners */}
                {createError && (
                  <div className="gh-alert-box error">
                    <i className="fa-solid fa-circle-xmark" style={{ marginTop: 2 }} />
                    <div>
                      <strong>Repository creation failed</strong>
                      <div style={{ marginTop: 2 }}>{createError}</div>
                    </div>
                  </div>
                )}
                {createSuccess && (
                  <div className="gh-alert-box success">
                    <i className="fa-solid fa-circle-check" style={{ marginTop: 2 }} />
                    <div>{createSuccess}</div>
                  </div>
                )}

                {/* Owner and Repo Name Field */}
                <div className="gh-form-group">
                  <label className="gh-form-label">
                    <span>Repository Owner & Name</span>
                    <span className="gh-form-hint">Required</span>
                  </label>
                  <div className="gh-input-addon-wrap">
                    <select
                      className="gh-input-addon-select"
                      value={repoOwner}
                      onChange={(e) => setRepoOwner(e.target.value)}
                      title="Select Personal Account or Organization"
                    >
                      {githubAccount?.username && (
                        <option value={githubAccount.username}>@{githubAccount.username}</option>
                      )}
                      {organizations.map((org) => (
                        <option key={org.id} value={org.login}>
                          🏢 {org.login}
                        </option>
                      ))}
                    </select>
                    <input
                      className="gh-input gh-input-addon-input"
                      value={repoName}
                      onChange={(e) => {
                        setRepoName(e.target.value);
                        setCreateError('');
                      }}
                      placeholder="e.g. awesome-app"
                    />
                  </div>
                  {/* Realtime conflict warning */}
                  {existingNameConflict && (
                    <div style={{ color: '#ff6b6b', fontSize: 11, marginTop: 4 }}>
                      <i className="fa-solid fa-triangle-exclamation" style={{ marginRight: 4 }} />
                      A repository named "{repoName.trim()}" already exists on @{repoOwner || githubAccount?.username}.
                    </div>
                  )}
                  {repoName.trim() && !existingNameConflict && (
                    <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 10.5, marginTop: 4 }}>
                      Will be created at: <strong>github.com/{repoOwner || githubAccount?.username}/{repoName.trim()}</strong>
                    </div>
                  )}
                </div>

                {/* Description */}
                <div className="gh-form-group">
                  <label className="gh-form-label">
                    <span>Description</span>
                    <span className="gh-form-hint">Optional</span>
                  </label>
                  <textarea
                    className="gh-input"
                    style={{ minHeight: 65, resize: 'vertical' }}
                    value={repoDescription}
                    onChange={(e) => setRepoDescription(e.target.value)}
                    placeholder="Short description of your project..."
                  />
                </div>

                {/* ── VISIBILITY SELECTOR: PUBLIC VS PRIVATE CARDS ── */}
                <div className="gh-form-group">
                  <label className="gh-form-label">
                    <span>Repository Visibility</span>
                  </label>
                  <div className="gh-visibility-cards">
                    {/* Public Option */}
                    <div
                      className={`gh-visibility-card public ${repoVisibility === 'public' ? 'selected' : ''}`}
                      onClick={() => setRepoVisibility('public')}
                    >
                      <div className="gh-vis-header">
                        <i className="fa-solid fa-globe" />
                        <span>Public</span>
                        {repoVisibility === 'public' && <i className="fa-solid fa-check" style={{ marginLeft: 'auto' }} />}
                      </div>
                      <div className="gh-vis-desc">
                        Anyone on the internet can see this repository. You choose who can commit.
                      </div>
                    </div>

                    {/* Private Option */}
                    <div
                      className={`gh-visibility-card private ${repoVisibility === 'private' ? 'selected' : ''}`}
                      onClick={() => setRepoVisibility('private')}
                    >
                      <div className="gh-vis-header">
                        <i className="fa-solid fa-lock" />
                        <span>Private</span>
                        {repoVisibility === 'private' && <i className="fa-solid fa-check" style={{ marginLeft: 'auto' }} />}
                      </div>
                      <div className="gh-vis-desc">
                        You choose who can see and commit to this repository.
                      </div>
                    </div>
                  </div>
                </div>

                {/* ── Initialization Options ── */}
                <div className="gh-form-group" style={{ gap: 8, marginTop: 4 }}>
                  <label className="gh-checkbox-row">
                    <input
                      type="checkbox"
                      checked={initReadme}
                      onChange={(e) => setInitReadme(e.target.checked)}
                    />
                    <span>Add a README file (auto-init)</span>
                  </label>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', width: 80 }}>.gitignore:</span>
                    <select
                      className="gh-filter-select"
                      value={gitignoreTemplate}
                      onChange={(e) => setGitignoreTemplate(e.target.value)}
                    >
                      <option value="">None</option>
                      <option value="Node">Node.js</option>
                      <option value="Python">Python</option>
                      <option value="Rust">Rust</option>
                      <option value="Go">Go</option>
                      <option value="C++">C++</option>
                      <option value="Java">Java</option>
                    </select>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', width: 80 }}>License:</span>
                    <select
                      className="gh-filter-select"
                      value={licenseTemplate}
                      onChange={(e) => setLicenseTemplate(e.target.value)}
                    >
                      <option value="">None</option>
                      <option value="mit">MIT License</option>
                      <option value="apache-2.0">Apache 2.0</option>
                      <option value="gpl-3.0">GNU GPL v3</option>
                      <option value="bsd-3-clause">BSD 3-Clause</option>
                      <option value="unlicense">The Unlicense</option>
                    </select>
                  </div>

                  <label className="gh-checkbox-row" style={{ marginTop: 4 }}>
                    <input
                      type="checkbox"
                      checked={openAfterCreate}
                      onChange={(e) => setOpenAfterCreate(e.target.checked)}
                    />
                    <span>Open in Tilder immediately after creation</span>
                  </label>
                </div>

                {/* Submit Button */}
                <button
                  className="gh-btn-primary"
                  style={{ padding: '9px 14px', fontSize: 12, marginTop: 6 }}
                  disabled={creatingRepo || !repoName.trim() || existingNameConflict}
                  onClick={handleCreateRepository}
                >
                  <i className={`fa-solid ${creatingRepo ? 'fa-circle-notch fa-spin' : 'fa-plus'}`} />
                  {creatingRepo
                    ? 'Creating on GitHub...'
                    : `Create ${repoVisibility === 'public' ? 'Public' : 'Private'} Repository`}
                </button>
              </div>
            )}

            {/* ═════════ TAB 3: PULL REQUESTS ═════════ */}
            {activeTab === 'pulls' && (
              <div>
                {pullRequests.length === 0 ? (
                  <div className="gh-empty-state">
                    <i className="fa-solid fa-code-pull-request gh-empty-icon" />
                    <p>No open pull requests involving you.</p>
                  </div>
                ) : (
                  pullRequests.map((pr) => (
                    <a
                      key={pr.id}
                      href={pr.url}
                      target="_blank"
                      rel="noreferrer"
                      className="gh-item-card"
                      style={{ display: 'block', textDecoration: 'none' }}
                    >
                      <div className="gh-item-title-row">
                        <i className="fa-solid fa-code-pull-request" style={{ color: '#2ecc71', fontSize: 12 }} />
                        <span className="gh-item-title">{pr.title}</span>
                      </div>
                      <div className="gh-item-meta">
                        <span>{pr.repoFullName}</span>
                        <span>#{pr.number}</span>
                        <span style={{ marginLeft: 'auto' }}>{formatRelativeTime(pr.updatedAt)}</span>
                      </div>
                    </a>
                  ))
                )}
              </div>
            )}

            {/* ═════════ TAB 4: ISSUES ═════════ */}
            {activeTab === 'issues' && (
              <div>
                {issues.length === 0 ? (
                  <div className="gh-empty-state">
                    <i className="fa-regular fa-circle-dot gh-empty-icon" />
                    <p>No open issues assigned to you.</p>
                  </div>
                ) : (
                  issues.map((issue) => (
                    <a
                      key={issue.id}
                      href={issue.url}
                      target="_blank"
                      rel="noreferrer"
                      className="gh-item-card"
                      style={{ display: 'block', textDecoration: 'none' }}
                    >
                      <div className="gh-item-title-row">
                        <i className="fa-regular fa-circle-dot" style={{ color: '#2ecc71', fontSize: 12 }} />
                        <span className="gh-item-title">{issue.title}</span>
                      </div>
                      <div className="gh-item-meta">
                        <span>{issue.repoFullName}</span>
                        <span>#{issue.number}</span>
                        <span style={{ marginLeft: 'auto' }}>{formatRelativeTime(issue.updatedAt)}</span>
                      </div>
                    </a>
                  ))
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default React.memo(GitHub);
