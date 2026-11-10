import React, { useEffect, useMemo, useState } from 'react';
import './Extensions.css';
import {
  buildExtensionCategories,
  EXTENSION_STATE_STORAGE_KEY,
  TILDER_EXTENSION_MANIFEST_VERSION,
} from '../../core/extensionsCatalog.js';
import { resolveExtensionIcon } from '../../core/iconTheme.js';
import {
  createExtensionPublisher,
  createExtensionPublisherToken,
  fetchMyExtensionPublishers,
  publishExtensionMarketplacePackage,
  validateExtensionMarketplacePackage,
} from '../../core/extensionsMarketplaceApi.js';

class ExtensionsErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error) {
    console.error('Extensions modal crashed', error);
  }

  componentDidUpdate(prevProps) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.hasError) {
      this.setState({ hasError: false });
    }
  }

  handleReset = () => {
    this.setState({ hasError: false });
    this.props.onReset?.();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="ext-detail-empty">
          <div className="ext-detail-empty-icon"><i className="fa-solid fa-triangle-exclamation" /></div>
          <div style={{ fontSize: 16, fontWeight: 600 }}>Extensions state reset needed</div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>The marketplace hit a temporary state error.</div>
          <button type="button" className="ext-btn-primary" onClick={this.handleReset}>
            Reset Extensions View
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

function encodeUtf8Base64(value) {
  return btoa(unescape(encodeURIComponent(String(value || ''))));
}

function createInitialPublisherForm() {
  return {
    name: '',
    slug: '',
    bio: '',
    website: '',
    repository: '',
    email: '',
    avatarUrl: '',
  };
}

function createInitialPublishDraft() {
  return {
    publisherId: '',
    token: '',
    manifest: {
      id: '',
      name: '',
      version: '1.0.0',
      category: 'Productivity',
      summary: '',
      description: '',
      tags: '',
      permissions: '',
      repository: '',
      website: '',
      iconClass: 'fa-solid fa-puzzle-piece',
      accent: '#7f86ff',
      webEntrypoint: 'main.js',
    },
    code: `export async function activate(api) {\n  api.notifications.info('Hello from your Tilder extension.');\n\n  api.commands.register('hello', () => {\n    api.notifications.info('Command executed.');\n  });\n}\n`,
  };
}

function ExtensionLogo({ extension }) {
  const visual = resolveExtensionIcon(extension);
  return <visual.Icon className="extensions-icon-glyph" color={visual.color} aria-hidden="true" />;
}

function persistExtensionState(nextState) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(EXTENSION_STATE_STORAGE_KEY, JSON.stringify(nextState));
  window.dispatchEvent(new Event('tilder:extensions-updated'));
}

export default function Extensions({
  modalType,
  pushNotification,
  extensionCatalog: externalCatalog = null,
  marketplacePublishers = {},
  authSession = null,
}) {
  const [topTab, setTopTab] = useState('marketplace'); // 'marketplace' | 'installed' | 'publisher'
  const [subTab, setSubTab] = useState('overview'); // 'overview' | 'features' | 'publisher'
  const [sortMode, setSortMode] = useState('popular'); // 'popular' | 'name' | 'rating'
  const [searchValue, setSearchValue] = useState('');
  const [category, setCategory] = useState('All');
  const [selectedExtensionId, setSelectedExtensionId] = useState('');
  const [extensionState, setExtensionState] = useState({});

  // Publisher state
  const [ownedPublishers, setOwnedPublishers] = useState([]);
  const [publishersLoading, setPublishersLoading] = useState(false);
  const [publishersError, setPublishersError] = useState('');
  const [publisherForm, setPublisherForm] = useState(createInitialPublisherForm());
  const [publisherFormBusy, setPublisherFormBusy] = useState(false);
  const [selectedPublisherId, setSelectedPublisherId] = useState('');
  const [tokenLabel, setTokenLabel] = useState('CLI token');
  const [generatedToken, setGeneratedToken] = useState('');
  const [publishDraft, setPublishDraft] = useState(createInitialPublishDraft());
  const [publishBusy, setPublishBusy] = useState(false);
  const [validationResult, setValidationResult] = useState(null);

  const trimmedSearchValue = searchValue.trim();

  const catalog = useMemo(() => {
    const source = Array.isArray(externalCatalog) ? externalCatalog : [];
    const seenIds = new Set();
    return source.filter((entry) => {
      if (!entry || typeof entry !== 'object') return false;
      const id = String(entry.id || '').trim();
      if (!id || seenIds.has(id)) return false;
      seenIds.add(id);
      return true;
    });
  }, [externalCatalog]);

  const categories = useMemo(() => buildExtensionCategories(catalog), [catalog]);

  const installedIds = useMemo(
    () => Object.entries(extensionState).filter(([, state]) => state?.installed).map(([id]) => id),
    [extensionState]
  );

  const installedExtensions = useMemo(
    () => catalog.filter((extension) => installedIds.includes(extension.id)),
    [catalog, installedIds]
  );

  const activePool = useMemo(
    () => (topTab === 'installed' ? installedExtensions : catalog),
    [topTab, catalog, installedExtensions]
  );

  const filteredExtensions = useMemo(() => {
    const query = trimmedSearchValue.toLowerCase();
    return activePool.filter((extension) => {
      if (!extension || typeof extension !== 'object') return false;
      if (category !== 'All' && extension.category !== category) return false;
      if (!query) return true;
      return [
        extension.name,
        extension.publisher,
        extension.summary,
        extension.description,
        ...(Array.isArray(extension.tags) ? extension.tags : []),
      ]
        .filter(Boolean)
        .some((val) => String(val).toLowerCase().includes(query));
    });
  }, [activePool, category, trimmedSearchValue]);

  const sortedExtensions = useMemo(() => {
    return [...filteredExtensions].sort((left, right) => {
      if (sortMode === 'name') return String(left.name || '').localeCompare(String(right.name || ''));
      if (sortMode === 'rating') return Number(right.rating || 0) - Number(left.rating || 0);
      return String(right.downloads || '').localeCompare(String(left.downloads || ''), undefined, { numeric: true });
    });
  }, [filteredExtensions, sortMode]);

  const selectedExtension = useMemo(() => {
    if (!selectedExtensionId) return sortedExtensions[0] || null;
    return catalog.find((ext) => ext.id === selectedExtensionId) || sortedExtensions[0] || null;
  }, [catalog, selectedExtensionId, sortedExtensions]);

  const currentAccount = useMemo(
    () => authSession?.accounts?.github || authSession?.accounts?.microsoft || null,
    [authSession]
  );

  useEffect(() => {
    if (modalType !== 'Extensions') return;
    try {
      const parsed = JSON.parse(window.localStorage.getItem(EXTENSION_STATE_STORAGE_KEY) || '{}');
      setExtensionState(parsed && typeof parsed === 'object' ? parsed : {});
    } catch {
      setExtensionState({});
    }
  }, [modalType]);

  useEffect(() => {
    if (topTab !== 'publisher') return;
    let cancelled = false;
    setPublishersLoading(true);
    setPublishersError('');
    fetchMyExtensionPublishers()
      .then((payload) => {
        if (cancelled) return;
        const publishers = Array.isArray(payload.publishers) ? payload.publishers : [];
        setOwnedPublishers(publishers);
        if (!selectedPublisherId && publishers[0]) {
          setSelectedPublisherId(publishers[0].id);
          setPublishDraft((c) => ({ ...c, publisherId: publishers[0].id }));
        }
      })
      .catch((error) => {
        if (!cancelled) setPublishersError(error instanceof Error ? error.message : 'Unable to load publishers.');
      })
      .finally(() => {
        if (!cancelled) setPublishersLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [topTab, selectedPublisherId]);

  function setInstalledState(extensionId, nextPartialState) {
    setExtensionState((current) => {
      const nextState = {
        ...current,
        [extensionId]: {
          installed: current?.[extensionId]?.installed ?? false,
          enabled: current?.[extensionId]?.enabled ?? false,
          ...nextPartialState,
        },
      };
      persistExtensionState(nextState);
      return nextState;
    });
  }

  function handleInstall(extension) {
    setInstalledState(extension.id, { installed: true, enabled: true });
    pushNotification?.(`${extension.name} installed successfully.`, 'info');
  }

  function handleUninstall(extension) {
    setInstalledState(extension.id, { installed: false, enabled: false });
    pushNotification?.(`${extension.name} uninstalled.`, 'info');
  }

  function handleToggleEnabled(extension) {
    const enabled = Boolean(extensionState?.[extension.id]?.enabled);
    setInstalledState(extension.id, { installed: true, enabled: !enabled });
    pushNotification?.(`${extension.name} ${enabled ? 'disabled' : 'enabled'}.`, 'info');
  }

  async function handleCreatePublisher(e) {
    e.preventDefault();
    setPublisherFormBusy(true);
    try {
      const result = await createExtensionPublisher(publisherForm);
      setGeneratedToken(result.token || '');
      setPublisherForm(createInitialPublisherForm());
      pushNotification?.('Publisher created successfully.', 'info');
      const refreshed = await fetchMyExtensionPublishers();
      setOwnedPublishers(Array.isArray(refreshed.publishers) ? refreshed.publishers : []);
      if (result.publisher?.id) {
        setSelectedPublisherId(result.publisher.id);
        setPublishDraft((c) => ({ ...c, publisherId: result.publisher.id }));
      }
    } catch (err) {
      pushNotification?.(err instanceof Error ? err.message : 'Could not create publisher.', 'warning');
    } finally {
      setPublisherFormBusy(false);
    }
  }

  async function handleCreateToken() {
    if (!selectedPublisherId) {
      pushNotification?.('Select a publisher first.', 'warning');
      return;
    }
    try {
      const result = await createExtensionPublisherToken(selectedPublisherId, { label: tokenLabel });
      setGeneratedToken(result.token || '');
      pushNotification?.('Publisher token created.', 'info');
    } catch (err) {
      pushNotification?.(err instanceof Error ? err.message : 'Could not create token.', 'warning');
    }
  }

  async function handleValidatePackage() {
    try {
      const payload = {
        packageVersion: 1,
        publisherId: publishDraft.publisherId.trim(),
        manifest: {
          manifestVersion: TILDER_EXTENSION_MANIFEST_VERSION,
          id: publishDraft.manifest.id.trim(),
          name: publishDraft.manifest.name.trim(),
          version: publishDraft.manifest.version.trim(),
          category: publishDraft.manifest.category.trim(),
          summary: publishDraft.manifest.summary.trim(),
          description: publishDraft.manifest.description.trim(),
          tags: String(publishDraft.manifest.tags || '').split(',').map((s) => s.trim()).filter(Boolean),
          permissions: String(publishDraft.manifest.permissions || '').split(',').map((s) => s.trim()).filter(Boolean),
          repository: publishDraft.manifest.repository.trim(),
          website: publishDraft.manifest.website.trim(),
          iconClass: publishDraft.manifest.iconClass.trim(),
          accent: publishDraft.manifest.accent.trim(),
          webEntrypoint: publishDraft.manifest.webEntrypoint.trim(),
        },
        files: [
          {
            path: publishDraft.manifest.webEntrypoint.trim(),
            encoding: 'base64',
            content: encodeUtf8Base64(publishDraft.code),
          },
        ],
      };
      const res = await validateExtensionMarketplacePackage(payload);
      setValidationResult(res);
      pushNotification?.(res.ok ? 'Manifest and code validated.' : 'Validation failed.', res.ok ? 'info' : 'warning');
    } catch (err) {
      setValidationResult({ ok: false, message: err.message });
    }
  }

  async function handlePublishPackage() {
    setPublishBusy(true);
    try {
      const payload = {
        packageVersion: 1,
        publisherId: publishDraft.publisherId.trim(),
        manifest: {
          manifestVersion: TILDER_EXTENSION_MANIFEST_VERSION,
          id: publishDraft.manifest.id.trim(),
          name: publishDraft.manifest.name.trim(),
          version: publishDraft.manifest.version.trim(),
          category: publishDraft.manifest.category.trim(),
          summary: publishDraft.manifest.summary.trim(),
          description: publishDraft.manifest.description.trim(),
          tags: String(publishDraft.manifest.tags || '').split(',').map((s) => s.trim()).filter(Boolean),
          permissions: String(publishDraft.manifest.permissions || '').split(',').map((s) => s.trim()).filter(Boolean),
          repository: publishDraft.manifest.repository.trim(),
          website: publishDraft.manifest.website.trim(),
          iconClass: publishDraft.manifest.iconClass.trim(),
          accent: publishDraft.manifest.accent.trim(),
          webEntrypoint: publishDraft.manifest.webEntrypoint.trim(),
        },
        files: [
          {
            path: publishDraft.manifest.webEntrypoint.trim(),
            encoding: 'base64',
            content: encodeUtf8Base64(publishDraft.code),
          },
        ],
      };
      await publishExtensionMarketplacePackage(payload, publishDraft.token);
      pushNotification?.('Extension published successfully to marketplace!', 'info');
    } catch (err) {
      pushNotification?.(err instanceof Error ? err.message : 'Publish failed.', 'warning');
    } finally {
      setPublishBusy(false);
    }
  }

  return (
    <div className="ext-container">
      {/* Top Header Navigation Tabs */}
      <div className="ext-header-tabs">
        <div className="ext-tabs-group">
          <button
            type="button"
            className={`ext-tab-btn ${topTab === 'marketplace' ? 'active' : ''}`}
            onClick={() => setTopTab('marketplace')}
          >
            <i className="fa-solid fa-store" />
            <span>Marketplace</span>
          </button>
          <button
            type="button"
            className={`ext-tab-btn ${topTab === 'installed' ? 'active' : ''}`}
            onClick={() => setTopTab('installed')}
          >
            <i className="fa-solid fa-box-open" />
            <span>Installed</span>
            <span className="ext-badge-count">{installedExtensions.length}</span>
          </button>
          <button
            type="button"
            className={`ext-tab-btn ${topTab === 'publisher' ? 'active' : ''}`}
            onClick={() => setTopTab('publisher')}
          >
            <i className="fa-solid fa-cloud-arrow-up" />
            <span>Publisher Dashboard</span>
          </button>
        </div>

        {topTab === 'installed' && installedExtensions.length > 0 && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className="ext-btn-secondary"
              style={{ padding: '4px 10px', fontSize: 11 }}
              onClick={() => {
                const next = { ...extensionState };
                installedExtensions.forEach((ext) => {
                  if (next[ext.id]) next[ext.id].enabled = false;
                });
                setExtensionState(next);
                persistExtensionState(next);
                pushNotification?.('All extensions disabled.', 'info');
              }}
            >
              Disable All
            </button>
            <button
              type="button"
              className="ext-btn-secondary"
              style={{ padding: '4px 10px', fontSize: 11 }}
              onClick={() => {
                const next = { ...extensionState };
                installedExtensions.forEach((ext) => {
                  if (next[ext.id]) next[ext.id].enabled = true;
                });
                setExtensionState(next);
                persistExtensionState(next);
                pushNotification?.('All extensions enabled.', 'info');
              }}
            >
              Enable All
            </button>
          </div>
        )}
      </div>

      <ExtensionsErrorBoundary resetKey={topTab} onReset={() => { setSearchValue(''); setCategory('All'); }}>
        {topTab === 'publisher' ? (
          /* Publisher Dashboard View */
          <div className="ext-main-layout" style={{ overflowY: 'auto' }}>
            <div className="ext-publisher-container">
              <div className="ext-form-card">
                <div className="ext-form-title">
                  <i className="fa-solid fa-id-badge" style={{ marginRight: 8, color: 'var(--accent)' }} />
                  Create Extension Publisher
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                  {currentAccount
                    ? `Connected as ${currentAccount.username || currentAccount.name || 'Verified user'}.`
                    : 'Sign in under Account to verify your identity.'}
                </div>
                <form className="ext-form-grid-2" onSubmit={handleCreatePublisher}>
                  <div className="ext-form-group">
                    <label className="ext-form-label">Publisher Name</label>
                    <input
                      className="ext-input"
                      placeholder="e.g. Acme Tools"
                      value={publisherForm.name}
                      onChange={(e) => setPublisherForm((c) => ({ ...c, name: e.target.value }))}
                      required
                    />
                  </div>
                  <div className="ext-form-group">
                    <label className="ext-form-label">Identifier Slug</label>
                    <input
                      className="ext-input"
                      placeholder="e.g. acme-tools"
                      value={publisherForm.slug}
                      onChange={(e) => setPublisherForm((c) => ({ ...c, slug: e.target.value }))}
                      required
                    />
                  </div>
                  <div className="ext-form-group full">
                    <label className="ext-form-label">Bio</label>
                    <textarea
                      className="ext-textarea"
                      rows="2"
                      placeholder="Brief description about the publisher organization"
                      value={publisherForm.bio}
                      onChange={(e) => setPublisherForm((c) => ({ ...c, bio: e.target.value }))}
                    />
                  </div>
                  <div className="ext-form-group">
                    <label className="ext-form-label">Website</label>
                    <input
                      className="ext-input"
                      placeholder="https://example.com"
                      value={publisherForm.website}
                      onChange={(e) => setPublisherForm((c) => ({ ...c, website: e.target.value }))}
                    />
                  </div>
                  <div className="ext-form-group">
                    <label className="ext-form-label">Repository</label>
                    <input
                      className="ext-input"
                      placeholder="https://github.com/org/repo"
                      value={publisherForm.repository}
                      onChange={(e) => setPublisherForm((c) => ({ ...c, repository: e.target.value }))}
                    />
                  </div>
                  <div className="ext-form-group full">
                    <button type="submit" className="ext-btn-primary" disabled={publisherFormBusy}>
                      {publisherFormBusy ? 'Creating...' : 'Register Publisher'}
                    </button>
                  </div>
                </form>
              </div>

              <div className="ext-form-card">
                <div className="ext-form-title">
                  <i className="fa-solid fa-key" style={{ marginRight: 8, color: 'var(--accent)' }} />
                  Publisher Tokens
                </div>
                <div className="ext-form-grid-2">
                  <div className="ext-form-group">
                    <label className="ext-form-label">Select Publisher</label>
                    <select
                      className="ext-select"
                      value={selectedPublisherId}
                      onChange={(e) => setSelectedPublisherId(e.target.value)}
                    >
                      <option value="">-- Choose Publisher --</option>
                      {ownedPublishers.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.slug})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="ext-form-group">
                    <label className="ext-form-label">Token Label</label>
                    <input
                      className="ext-input"
                      value={tokenLabel}
                      onChange={(e) => setTokenLabel(e.target.value)}
                    />
                  </div>
                  <div className="ext-form-group full">
                    <button type="button" className="ext-btn-secondary" onClick={handleCreateToken}>
                      Generate Token
                    </button>
                  </div>
                  {generatedToken && (
                    <div className="ext-form-group full" style={{ background: 'rgba(0,0,0,0.2)', padding: 12, borderRadius: 6 }}>
                      <div className="ext-form-label" style={{ color: '#40c057' }}>Token generated (copy now):</div>
                      <code style={{ fontSize: 12, wordBreak: 'break-all', color: '#cdd6f4' }}>{generatedToken}</code>
                    </div>
                  )}
                </div>
              </div>

              <div className="ext-form-card">
                <div className="ext-form-title">
                  <i className="fa-solid fa-cube" style={{ marginRight: 8, color: 'var(--accent)' }} />
                  Publish Package
                </div>
                <div className="ext-form-grid-2">
                  <div className="ext-form-group">
                    <label className="ext-form-label">Extension ID</label>
                    <input
                      className="ext-input"
                      placeholder="e.g. code-beautifier"
                      value={publishDraft.manifest.id}
                      onChange={(e) => setPublishDraft((c) => ({ ...c, manifest: { ...c.manifest, id: e.target.value } }))}
                    />
                  </div>
                  <div className="ext-form-group">
                    <label className="ext-form-label">Display Name</label>
                    <input
                      className="ext-input"
                      placeholder="e.g. Code Beautifier"
                      value={publishDraft.manifest.name}
                      onChange={(e) => setPublishDraft((c) => ({ ...c, manifest: { ...c.manifest, name: e.target.value } }))}
                    />
                  </div>
                  <div className="ext-form-group">
                    <label className="ext-form-label">Version</label>
                    <input
                      className="ext-input"
                      value={publishDraft.manifest.version}
                      onChange={(e) => setPublishDraft((c) => ({ ...c, manifest: { ...c.manifest, version: e.target.value } }))}
                    />
                  </div>
                  <div className="ext-form-group">
                    <label className="ext-form-label">Category</label>
                    <select
                      className="ext-select"
                      value={publishDraft.manifest.category}
                      onChange={(e) => setPublishDraft((c) => ({ ...c, manifest: { ...c.manifest, category: e.target.value } }))}
                    >
                      {categories.filter((cat) => cat !== 'All').map((cat) => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>
                  <div className="ext-form-group full">
                    <label className="ext-form-label">Summary</label>
                    <input
                      className="ext-input"
                      placeholder="One-line summary of what this extension does"
                      value={publishDraft.manifest.summary}
                      onChange={(e) => setPublishDraft((c) => ({ ...c, manifest: { ...c.manifest, summary: e.target.value } }))}
                    />
                  </div>
                  <div className="ext-form-group full">
                    <label className="ext-form-label">Entrypoint Code (JavaScript)</label>
                    <textarea
                      className="ext-textarea"
                      rows="8"
                      style={{ fontFamily: 'monospace', fontSize: 12 }}
                      value={publishDraft.code}
                      onChange={(e) => setPublishDraft((c) => ({ ...c, code: e.target.value }))}
                    />
                  </div>
                  <div className="ext-form-group full" style={{ display: 'flex', gap: 10 }}>
                    <button type="button" className="ext-btn-secondary" onClick={handleValidatePackage}>
                      Validate Manifest & Code
                    </button>
                    <button
                      type="button"
                      className="ext-btn-primary"
                      disabled={publishBusy}
                      onClick={handlePublishPackage}
                    >
                      {publishBusy ? 'Publishing...' : 'Publish to Marketplace'}
                    </button>
                  </div>
                  {validationResult && (
                    <div
                      className="ext-form-group full"
                      style={{
                        padding: 10,
                        borderRadius: 6,
                        background: validationResult.ok ? 'rgba(64, 192, 87, 0.15)' : 'rgba(243, 139, 168, 0.15)',
                        color: validationResult.ok ? '#40c057' : '#f38ba8',
                        fontSize: 13,
                      }}
                    >
                      {validationResult.message || (validationResult.ok ? 'Package validated successfully.' : 'Validation failed.')}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* Main Master-Detail Layout (Marketplace & Installed) */
          <div className="ext-main-layout">
            {/* Left Sidebar (List) */}
            <div className="ext-sidebar">
              {/* Search Bar */}
              <div className="ext-search-box">
                <div className="ext-search-input-wrapper">
                  <i className="fa-solid fa-magnifying-glass ext-search-icon" />
                  <input
                    type="text"
                    className="ext-search-input"
                    placeholder={`Search ${topTab === 'installed' ? 'installed' : 'all'} extensions...`}
                    value={searchValue}
                    onChange={(e) => setSearchValue(e.target.value)}
                  />
                  {searchValue && (
                    <button type="button" className="ext-search-clear" onClick={() => setSearchValue('')}>
                      <i className="fa-solid fa-xmark" />
                    </button>
                  )}
                </div>

                {/* Category Filter Chips */}
                <div className="ext-categories-bar">
                  {categories.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      className={`ext-chip ${category === cat ? 'active' : ''}`}
                      onClick={() => setCategory(cat)}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              {/* List Header / Sort */}
              <div className="ext-list-header">
                <span>{sortedExtensions.length} {sortedExtensions.length === 1 ? 'extension' : 'extensions'}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>Sort:</span>
                  <select
                    className="ext-sort-select"
                    value={sortMode}
                    onChange={(e) => setSortMode(e.target.value)}
                  >
                    <option value="popular">Popular</option>
                    <option value="name">Name</option>
                    <option value="rating">Rating</option>
                  </select>
                </div>
              </div>

              {/* Scrollable List */}
              <div className="ext-list-scroll">
                {sortedExtensions.map((extension) => {
                  const state = extensionState[extension.id];
                  const isInstalled = Boolean(state?.installed);
                  const isEnabled = Boolean(state?.enabled);
                  const isSelected = selectedExtension?.id === extension.id;

                  return (
                    <div
                      key={extension.id}
                      className={`ext-card-item ${isSelected ? 'selected' : ''}`}
                      onClick={() => setSelectedExtensionId(extension.id)}
                    >
                      <div className="ext-card-icon-tile" style={{ color: extension.accent || 'var(--accent)' }}>
                        <ExtensionLogo extension={extension} />
                      </div>
                      <div className="ext-card-info">
                        <div className="ext-card-title-row">
                          <span className="ext-card-title">{extension.name}</span>
                          {isInstalled && (
                            <span className={`ext-card-status-badge ${isEnabled ? 'enabled' : 'disabled'}`}>
                              <i className={`fa-solid ${isEnabled ? 'fa-check' : 'fa-pause'}`} style={{ fontSize: 9 }} />
                              {isEnabled ? 'Enabled' : 'Disabled'}
                            </span>
                          )}
                        </div>
                        <span className="ext-card-publisher">{extension.publisher} • v{extension.version || '1.0.0'}</span>
                        <span className="ext-card-summary">{extension.summary || extension.description}</span>
                        <div className="ext-card-footer">
                          <div className="ext-card-stats">
                            <span><i className="fa-solid fa-download" style={{ marginRight: 3, fontSize: 10 }} />{extension.downloads || 'New'}</span>
                            {typeof extension.rating === 'number' && (
                              <span><i className="fa-solid fa-star" style={{ color: '#fab387', marginRight: 3, fontSize: 10 }} />{extension.rating.toFixed(1)}</span>
                            )}
                          </div>
                          {!isInstalled ? (
                            <button
                              type="button"
                              className="ext-btn-primary"
                              style={{ padding: '3px 10px', fontSize: 11 }}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleInstall(extension);
                              }}
                            >
                              Install
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="ext-btn-secondary"
                              style={{ padding: '3px 8px', fontSize: 11 }}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleToggleEnabled(extension);
                              }}
                            >
                              {isEnabled ? 'Disable' : 'Enable'}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {!sortedExtensions.length && (
                  <div className="ext-detail-empty" style={{ padding: 40 }}>
                    <i className="fa-solid fa-box-open ext-detail-empty-icon" />
                    <div style={{ fontSize: 14, fontWeight: 500 }}>No extensions match your search.</div>
                    <button
                      type="button"
                      className="ext-btn-secondary"
                      style={{ fontSize: 12, padding: '4px 12px' }}
                      onClick={() => { setSearchValue(''); setCategory('All'); }}
                    >
                      Clear Filters
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Right Side Detail Pane */}
            <div className="ext-detail-pane">
              {selectedExtension ? (
                <>
                  <div className="ext-detail-header">
                    <div
                      className="ext-detail-hero-icon"
                      style={{ color: selectedExtension.accent || 'var(--accent)' }}
                    >
                      <ExtensionLogo extension={selectedExtension} />
                    </div>
                    <div className="ext-detail-header-copy">
                      <div className="ext-detail-title">{selectedExtension.name}</div>
                      <div className="ext-detail-meta-line">
                        <span style={{ fontWeight: 600, color: 'var(--accent)' }}>{selectedExtension.publisher}</span>
                        <span>•</span>
                        <span>v{selectedExtension.version || '1.0.0'}</span>
                        <span>•</span>
                        <span className="ext-chip" style={{ margin: 0, padding: '2px 8px' }}>
                          {selectedExtension.category || 'Tools'}
                        </span>
                      </div>
                      <div className="ext-detail-summary">{selectedExtension.summary}</div>

                      {/* Detail Action Buttons */}
                      <div className="ext-detail-actions">
                        {!extensionState[selectedExtension.id]?.installed ? (
                          <button
                            type="button"
                            className="ext-btn-primary"
                            onClick={() => handleInstall(selectedExtension)}
                          >
                            <i className="fa-solid fa-download" />
                            Install Extension
                          </button>
                        ) : (
                          <>
                            <button
                              type="button"
                              className="ext-btn-secondary"
                              onClick={() => handleToggleEnabled(selectedExtension)}
                            >
                              <i className={`fa-solid ${extensionState[selectedExtension.id]?.enabled ? 'fa-pause' : 'fa-play'}`} />
                              {extensionState[selectedExtension.id]?.enabled ? 'Disable' : 'Enable'}
                            </button>
                            <button
                              type="button"
                              className="ext-btn-danger"
                              onClick={() => handleUninstall(selectedExtension)}
                            >
                              <i className="fa-solid fa-trash" />
                              Uninstall
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Subtabs: Overview | Features | Details */}
                  <div className="ext-subtabs">
                    <button
                      type="button"
                      className={`ext-subtab-btn ${subTab === 'overview' ? 'active' : ''}`}
                      onClick={() => setSubTab('overview')}
                    >
                      Overview
                    </button>
                    <button
                      type="button"
                      className={`ext-subtab-btn ${subTab === 'features' ? 'active' : ''}`}
                      onClick={() => setSubTab('features')}
                    >
                      Features & Permissions
                    </button>
                    <button
                      type="button"
                      className={`ext-subtab-btn ${subTab === 'publisher' ? 'active' : ''}`}
                      onClick={() => setSubTab('publisher')}
                    >
                      Publisher Info
                    </button>
                  </div>

                  {/* Subtab Contents */}
                  <div className="ext-content-body">
                    {subTab === 'overview' && (
                      <>
                        <div className="ext-desc-text">
                          {selectedExtension.description || selectedExtension.summary || 'No detailed description available.'}
                        </div>
                        {Array.isArray(selectedExtension.tags) && selectedExtension.tags.length > 0 && (
                          <div>
                            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>
                              Tags
                            </div>
                            <div className="ext-tag-list">
                              {selectedExtension.tags.map((tag) => (
                                <span key={tag} className="ext-tag-item">#{tag}</span>
                              ))}
                            </div>
                          </div>
                        )}
                      </>
                    )}

                    {subTab === 'features' && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <div className="ext-form-card" style={{ padding: 14 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Entrypoint</div>
                          <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                            {selectedExtension.webEntrypoint || 'main.js'}
                          </div>
                        </div>
                        <div className="ext-form-card" style={{ padding: 14 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Permissions Requested</div>
                          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                            {Array.isArray(selectedExtension.permissions) && selectedExtension.permissions.length
                              ? selectedExtension.permissions.join(', ')
                              : 'Standard workspace API access (no elevated permissions)'}
                          </div>
                        </div>
                        <div className="ext-form-card" style={{ padding: 14 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Manifest Version</div>
                          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                            Tilder Extension Manifest v{selectedExtension.manifestVersion || 2}
                          </div>
                        </div>
                      </div>
                    )}

                    {subTab === 'publisher' && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <div className="ext-form-card" style={{ padding: 16 }}>
                          <div style={{ fontSize: 14, fontWeight: 600 }}>{selectedExtension.publisher}</div>
                          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                            {marketplacePublishers?.[selectedExtension.publisherId]?.bio || 'Verified public community extension author.'}
                          </div>
                          {selectedExtension.repository && (
                            <div style={{ marginTop: 10, fontSize: 12 }}>
                              <a
                                href={selectedExtension.repository}
                                target="_blank"
                                rel="noreferrer"
                                style={{ color: 'var(--accent)', textDecoration: 'none' }}
                              >
                                <i className="fa-brands fa-github" style={{ marginRight: 6 }} />
                                Source Repository
                              </a>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="ext-detail-empty">
                  <i className="fa-solid fa-puzzle-piece ext-detail-empty-icon" />
                  <div style={{ fontSize: 16, fontWeight: 600 }}>Select an extension</div>
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                    Choose an extension from the list to view its details, features, and documentation.
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </ExtensionsErrorBoundary>
    </div>
  );
}
