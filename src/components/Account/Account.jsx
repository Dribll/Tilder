import React from 'react';

const PROVIDER_LABELS = {
  github: 'GitHub',
  microsoft: 'Microsoft',
};

function getProviderBadge(provider, authSession) {
  const connected = Boolean(authSession?.accounts?.[provider]);
  const configured = Boolean(authSession?.providers?.[provider]);

  if (connected) {
    return { label: 'Connected', tone: 'success' };
  }

  if (configured) {
    return { label: 'Ready', tone: 'ready' };
  }

  return { label: 'Not Enabled', tone: 'muted' };
}

export default function Account({
  modalType,
  authSession,
  authServiceStatus,
  authServiceMessage,
  authBusyProvider,
  syncBusy,
  onStartOAuth,
  onDisconnectProvider,
  onSetSyncProvider,
  onToggleSyncPreference,
  onPushSync,
  onPullSync,
}) {
  if (modalType !== 'Account') {
    return null;
  }

  const accounts = authSession?.accounts || {};
  const syncPreferences = authSession?.syncPreferences || {
    syncSettings: true,
    syncLayout: true,
    syncShortcuts: true,
  };
  const connectedProviders = Object.keys(accounts);

  return (
    <div className="account-panel-container">
      <div className="account-glass-card">
        {/* Status Indicator */}
        <div className="account-server-status">
          <span className={`status-dot ${authServiceStatus}`} />
          <span className="status-text">
            {authServiceStatus === 'error'
              ? authServiceMessage || 'Auth Server Offline'
              : authServiceStatus === 'ready'
                ? 'Cloud Sync Server Online'
                : 'Connecting to Cloud...'}
          </span>
        </div>

        {/* Header */}
        <div className="account-card-header">
          <div className="account-icon-badge">
            <i className="fa-regular fa-circle-user"></i>
          </div>
          <h2 className="account-main-title">Workspace Identity</h2>
          <p className="account-main-subtitle">
            Connect your cloud accounts to enable seamless settings synchronization and remote repository access.
          </p>
        </div>

        {/* Connected Accounts Section */}
        <div className="account-panel-section">
          <h3 className="account-section-hdr">Connected Accounts</h3>
          <div className="account-platforms-grid">
            {['github', 'microsoft'].map((provider) => {
              const account = accounts[provider];
              const connecting = authBusyProvider === provider;
              const selectedForSync = authSession?.syncProvider === provider;
              const providerLabel = PROVIDER_LABELS[provider];
              const badge = getProviderBadge(provider, authSession);

              const brandIcon = provider === 'github' ? 'fa-github' : 'fa-microsoft';

              if (account) {
                return (
                  <div key={provider} className="account-active-profile">
                    <div className="profile-top">
                      <div className="profile-identity">
                        {account.avatarUrl ? (
                          <img src={account.avatarUrl} alt={account.displayName || provider} className="profile-img-avatar" />
                        ) : (
                          <div className="profile-fallback-avatar">
                            <i className={`fa-brands ${brandIcon}`}></i>
                          </div>
                        )}
                        <div className="profile-details">
                          <div className="profile-title-row">
                            <span className="profile-name">{account.displayName || account.email || 'Connected User'}</span>
                            <span className="profile-platform-pill">
                              <i className={`fa-brands ${brandIcon}`}></i> {providerLabel}
                            </span>
                          </div>
                          <span className="profile-email">{account.email || 'No email shared'}</span>
                        </div>
                      </div>
                    </div>

                    <div className="profile-actions">
                      <button
                        type="button"
                        className={`action-btn-pill sync-preference-trigger ${selectedForSync ? 'sync-active' : ''}`}
                        disabled={syncBusy}
                        onClick={() => onSetSyncProvider(provider)}
                      >
                        <i className="fa-solid fa-arrows-rotate"></i> {selectedForSync ? 'Active Sync Target' : 'Use for Cloud Sync'}
                      </button>
                      <button 
                        type="button" 
                        className="action-btn-pill disconnect-trigger" 
                        disabled={connecting || syncBusy} 
                        onClick={() => onDisconnectProvider(provider)}
                      >
                        <i className="fa-solid fa-circle-minus"></i> Disconnect
                      </button>
                    </div>
                  </div>
                );
              }

              return (
                <button
                  key={provider}
                  type="button"
                  className={`provider-canva-btn brand-${provider}`}
                  disabled={connecting || authServiceStatus === 'loading'}
                  onClick={() => onStartOAuth(provider)}
                >
                  <span className="btn-brand-icon-wrap">
                    <i className={`fa-brands ${brandIcon}`}></i>
                  </span>
                  <span className="btn-label-text">
                    {connecting ? 'Authorizing in Browser...' : `Continue with ${providerLabel}`}
                  </span>
                  <i className="fa-solid fa-chevron-right btn-arrow-icon"></i>
                </button>
              );
            })}
          </div>
        </div>

        {/* Settings Sync Section */}
        {connectedProviders.length > 0 && (
          <div className="account-panel-section sync-setup-section">
            <div className="section-header-row">
              <h3 className="account-section-hdr">Settings Sync</h3>
              {authSession?.syncProvider && (
                <span className="active-sync-label">
                  <i className="fa-solid fa-cloud-arrow-up"></i> Syncing to {PROVIDER_LABELS[authSession.syncProvider]}
                </span>
              )}
            </div>

            <div className="sync-preference-toggles">
              <button 
                type="button" 
                className={`sync-toggle-pill ${syncPreferences.syncSettings ? 'pill-active' : ''}`} 
                disabled={syncBusy || !authSession?.syncProvider} 
                onClick={() => onToggleSyncPreference('syncSettings')}
              >
                <i className="fa-solid fa-sliders"></i> Settings
              </button>
              <button 
                type="button" 
                className={`sync-toggle-pill ${syncPreferences.syncLayout ? 'pill-active' : ''}`} 
                disabled={syncBusy || !authSession?.syncProvider} 
                onClick={() => onToggleSyncPreference('syncLayout')}
              >
                <i className="fa-solid fa-table-columns"></i> Layout
              </button>
              <button 
                type="button" 
                className={`sync-toggle-pill ${syncPreferences.syncShortcuts ? 'pill-active' : ''}`} 
                disabled={syncBusy || !authSession?.syncProvider} 
                onClick={() => onToggleSyncPreference('syncShortcuts')}
              >
                <i className="fa-regular fa-keyboard"></i> Shortcuts
              </button>
            </div>

            <div className="sync-action-footer">
              <button
                type="button"
                className="sync-trigger-btn pull-btn"
                disabled={!authSession?.syncProvider || syncBusy}
                onClick={onPullSync}
              >
                <i className="fa-solid fa-cloud-arrow-down"></i> {syncBusy ? 'Syncing...' : 'Pull from Cloud'}
              </button>
              <button
                type="button"
                className="sync-trigger-btn push-btn"
                disabled={!authSession?.syncProvider || syncBusy}
                onClick={onPushSync}
              >
                <i className="fa-solid fa-cloud-arrow-up"></i> {syncBusy ? 'Syncing...' : 'Push to Cloud'}
              </button>
            </div>
          </div>
        )}

        {connectedProviders.length === 0 && (
          <div className="account-panel-section sync-setup-section-empty">
            <div className="empty-sync-card">
              <i className="fa-solid fa-cloud-arrow-up empty-sync-icon"></i>
              <p className="empty-sync-text">Settings sync is inactive. Connect a platform account above to securely back up your editor preferences, custom shortcuts, and workbench layout.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
