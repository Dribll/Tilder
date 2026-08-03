import React from 'react';

export default class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      message: '',
    };
    this.handleReload = this.handleReload.bind(this);
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : 'The desktop app hit an unexpected error.',
    };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[Tilder] UI crash captured by error boundary.', error, errorInfo);
  }

  handleReload() {
    window.location.reload();
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0a0d16',
          color: '#edf1ff',
          fontFamily: 'Segoe UI, sans-serif',
          padding: '32px',
        }}
      >
        <div
          style={{
            width: 'min(560px, 100%)',
            background: '#121726',
            border: '1px solid #2f3760',
            borderRadius: '18px',
            padding: '28px',
            boxShadow: '0 24px 64px rgba(0, 0, 0, 0.35)',
          }}
        >
          <div style={{ fontSize: '26px', fontWeight: 700, marginBottom: '10px' }}>Tilder hit an error</div>
          <div style={{ fontSize: '14px', lineHeight: 1.6, color: '#cbd6ff', marginBottom: '18px' }}>
            The app recovered into safe mode instead of going blank. You can reload immediately and keep working.
          </div>
          <pre
            style={{
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              background: '#0b0e16',
              border: '1px solid #27304d',
              borderRadius: '12px',
              padding: '14px',
              marginBottom: '18px',
              color: '#ffcccc',
              fontSize: '13px',
            }}
          >
            {this.state.message || 'Unknown desktop UI error.'}
          </pre>
          <button
            type="button"
            onClick={this.handleReload}
            style={{
              border: 'none',
              borderRadius: '10px',
              padding: '10px 16px',
              background: '#6f6bf6',
              color: '#fff',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Reload Tilder
          </button>
        </div>
      </div>
    );
  }
}
