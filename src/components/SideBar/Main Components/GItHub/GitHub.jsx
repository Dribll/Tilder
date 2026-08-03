import React, { useEffect, useMemo, useState } from 'react';
import { createGitHubRepo, fetchGitHubRepos } from '../../../../core/accountApi.js';

export default function GitHub({ ariaExpandedisplaygithub, authSession, openAccount, workspace, pushNotification, handleCloneGitHubRepo }) {
  const isVisible = ariaExpandedisplaygithub === 'flex';
  const githubAccount = authSession?.accounts?.github;
  const [repositories, setRepositories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [creatingRepo, setCreatingRepo] = useState(false);
  const [repoName, setRepoName] = useState('');
  const [repoDescription, setRepoDescription] = useState('');
  const [isPrivateRepo, setIsPrivateRepo] = useState(true);

  const suggestedRepoName = useMemo(() => {
    const raw = workspace?.rootName || workspace?.getRootNode?.()?.name || 'tilder-project';
    return String(raw || 'tilder-project')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'tilder-project';
  }, [workspace]);

  useEffect(() => {
    if (!isVisible || !githubAccount) {
      return;
    }

    let active = true;
    setLoading(true);
    setError('');

    fetchGitHubRepos()
      .then((response) => {
        if (!active) {
          return;
        }

        setRepositories(response.repositories || []);
      })
      .catch((caughtError) => {
        if (!active) {
          return;
        }

        setError(caughtError instanceof Error ? caughtError.message : 'Unable to load GitHub repositories.');
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [githubAccount?.id, isVisible]);

  useEffect(() => {
    if (!isVisible || repoName.trim()) {
      return;
    }

    setRepoName(suggestedRepoName);
  }, [isVisible, repoName, suggestedRepoName]);

  async function handleCreateRepository() {
    try {
      setCreatingRepo(true);
      setError('');
      const response = await createGitHubRepo({
        name: repoName.trim(),
        description: repoDescription.trim(),
        private: isPrivateRepo,
      });

      const repository = response?.repository;
      if (repository) {
        setRepositories((current) => [repository, ...current.filter((entry) => entry.id !== repository.id)]);
      }
      setRepoDescription('');
      pushNotification?.(`GitHub repository ${repository?.fullName || repoName.trim()} created.`);
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : 'Unable to create GitHub repository.';
      setError(message);
      pushNotification?.(message, 'warning');
    } finally {
      setCreatingRepo(false);
    }
  }

  return (
    <div id="githubarea" className={`sidebarscontent d-${ariaExpandedisplaygithub}`}>
      <div className="account-panel-container" style={{ padding: '10px 10px 40px', height: '100%', overflowY: 'auto', justifyContent: 'flex-start' }}>
        <div className="account-glass-card" style={{ padding: '20px' }}>
          <div className="account-card-header" style={{ marginBottom: '16px' }}>
            <div className="account-icon-badge">
              <i className="fa-brands fa-github"></i>
            </div>
            <h2 className="account-main-title">GitHub</h2>
            <p className="account-main-subtitle">
              Manage your repositories and sync settings
            </p>
            {githubAccount ? (
              <button 
                type="button" 
                className="action-btn-pill" 
                onClick={openAccount} 
                title="Manage Account"
                style={{ position: 'absolute', top: 16, right: 16, width: 32, height: 32, padding: 0, justifyContent: 'center' }}
              >
                <i className="fa-solid fa-user-gear"></i>
              </button>
            ) : null}
          </div>

        {!githubAccount ? (
          <div className="account-panel-section">
            <h3 className="account-section-hdr">Connect GitHub</h3>
            <p className="account-main-subtitle" style={{ textAlign: 'left' }}>
              Sign in with GitHub from the Account modal to browse repositories and use GitHub-backed sync.
            </p>
            <button type="button" className="provider-canva-btn brand-github" onClick={openAccount}>
              <span className="btn-brand-icon-wrap"><i className="fa-brands fa-github"></i></span>
              <span className="btn-label-text">Open Account Center</span>
            </button>
          </div>
        ) : (
          <>
            <div className="account-active-profile" style={{ marginBottom: 20 }}>
              <div className="profile-top">
                <div className="profile-identity">
                  {githubAccount.avatarUrl ? <img src={githubAccount.avatarUrl} alt={githubAccount.displayName || githubAccount.username} className="profile-img-avatar" /> : (
                    <div className="profile-fallback-avatar"><i className="fa-brands fa-github"></i></div>
                  )}
                  <div className="profile-details">
                    <div className="profile-title-row">
                      <span className="profile-name">{githubAccount.displayName || githubAccount.username}</span>
                      {authSession?.syncProvider === 'github' ? <span className="profile-platform-pill sync-active" style={{ fontSize: 9 }}><i className="fa-solid fa-cloud-arrow-up"></i> Syncing</span> : null}
                    </div>
                    <span className="profile-email">{githubAccount.username ? `@${githubAccount.username}` : githubAccount.email || 'Connected'}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="account-panel-section">
              <h3 className="account-section-hdr">Create Repository</h3>
              <p className="account-main-subtitle" style={{ textAlign: 'left', marginBottom: 12 }}>
                Create a new GitHub repository directly from Tilder for the current workspace.
              </p>
              <input
                type="text"
                className="github-input"
                value={repoName}
                onChange={(event) => setRepoName(event.target.value)}
                placeholder="Repository name"
              />
              <textarea
                className="github-input github-textarea"
                value={repoDescription}
                onChange={(event) => setRepoDescription(event.target.value)}
                placeholder="Description (optional)"
              />
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, opacity: 0.8, marginBottom: 16 }}>
                <input
                  type="checkbox"
                  checked={isPrivateRepo}
                  onChange={(event) => setIsPrivateRepo(event.target.checked)}
                />
                <span>Private repository</span>
              </label>
              <button
                type="button"
                className="action-btn-pill sync-active"
                style={{ width: '100%', justifyContent: 'center', border: 'none' }}
                disabled={creatingRepo || !repoName.trim()}
                onClick={handleCreateRepository}
              >
                <i className="fa-solid fa-plus"></i> {creatingRepo ? 'Creating...' : 'Create GitHub Repo'}
              </button>
            </div>

            <div className="account-panel-section">
              <h3 className="account-section-hdr">Repositories</h3>
              {loading ? <div style={{ fontSize: 12, opacity: 0.6, textAlign: 'center' }}>Loading repositories...</div> : null}
              {error ? <div style={{ color: '#ff6b6b', fontSize: 12, textAlign: 'center' }}>{error}</div> : null}
              {!loading && !error ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {repositories.length ? (
                    repositories.map((repo) => (
                      <button
                        type="button"
                        key={repo.id}
                        className="action-btn-pill"
                        style={{ flexDirection: 'column', alignItems: 'flex-start', padding: '10px 12px', height: 'auto', textAlign: 'left' }}
                        onClick={() => handleCloneGitHubRepo?.(repo.fullName)}
                        title={`Clone ${repo.fullName}`}
                      >
                        <div style={{ fontWeight: 500, fontSize: 13, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                          <i className="fa-solid fa-code-branch" style={{ opacity: 0.5 }}></i> {repo.fullName}
                        </div>
                        <div style={{ fontSize: 11, opacity: 0.6 }}>
                          {repo.private ? 'Private' : 'Public'} · {repo.defaultBranch || 'main'}
                        </div>
                      </button>
                    ))
                  ) : (
                    <div style={{ fontSize: 12, opacity: 0.6, textAlign: 'center' }}>No repositories returned for this account yet.</div>
                  )}
                </div>
              ) : null}
            </div>
          </>
        )}
        </div>
      </div>
    </div>
  );
}
