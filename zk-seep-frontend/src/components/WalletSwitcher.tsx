import { useWallet } from '../hooks/useWallet';
import './WalletSwitcher.css';

export function WalletSwitcher() {
  const {
    publicKey,
    isConnected,
    isConnecting,
    error,
    connectFreighter,
    disconnect,
  } = useWallet();

  const handleConnect = async () => {
    try {
      await connectFreighter();
    } catch (err) {
      console.error('Failed to connect wallet:', err);
    }
  };

  if (!isConnected) {
    return (
      <div className="wallet-switcher">
        {error ? (
          <div className="wallet-error">
            <div className="error-title">Connection Failed</div>
            <div className="error-message">{error}</div>
          </div>
        ) : isConnecting ? (
          <div className="wallet-status connecting">
            <span className="status-indicator"></span>
            <span className="status-text">Connecting...</span>
          </div>
        ) : (
          <button
            onClick={handleConnect}
            className="switch-button"
            style={{ padding: '6px 14px' }}
          >
            🔗 Connect Wallet
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="wallet-switcher">
      {error && (
        <div className="wallet-error">
          {error}
        </div>
      )}

      <div className="wallet-info">
        <div className="wallet-status connected">
          <span className="status-indicator"></span>
          <div className="wallet-details">
            <div className="wallet-label">
              Connected
            </div>
            <div className="wallet-address">
              {publicKey ? `${publicKey.slice(0, 8)}...${publicKey.slice(-4)}` : ''}
            </div>
          </div>
          <button
            onClick={disconnect}
            className="switch-button"
          >
            Disconnect
          </button>
        </div>
      </div>
    </div>
  );
}
