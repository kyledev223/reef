/**
 * OKX Wallet adapter for the Solana wallet adapter, using the provider OKX injects at
 * `window.okxwallet.solana`. If OKX also registers itself through the Wallet Standard, the
 * wallet provider prefers that registration (same name) and this adapter only supplies the
 * "not installed" entry with a download link.
 *
 * When OKX is installed but has no wallet yet, its connect() opens OKX's own onboarding page,
 * where the player creates or imports a wallet.
 */
import {
  BaseMessageSignerWalletAdapter, WalletAccountError, WalletConnectionError, WalletDisconnectedError,
  WalletDisconnectionError, WalletNotConnectedError, WalletNotReadyError, WalletPublicKeyError,
  WalletReadyState, WalletSignMessageError, WalletSignTransactionError, scopePollingDetectionStrategy,
  type WalletName,
} from "@solana/wallet-adapter-base";
import { PublicKey, type Transaction, type VersionedTransaction } from "@solana/web3.js";

interface OkxSolanaProvider {
  publicKey?: { toBytes(): Uint8Array } | null;
  isConnected?: boolean;
  connect(): Promise<{ publicKey?: { toBytes(): Uint8Array } } | void>;
  disconnect(): Promise<void>;
  signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T>;
  signAllTransactions<T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]>;
  signMessage(message: Uint8Array, display?: string): Promise<{ signature: Uint8Array } | Uint8Array>;
  on(event: string, cb: (...args: unknown[]) => void): void;
  off?(event: string, cb: (...args: unknown[]) => void): void;
  removeListener?(event: string, cb: (...args: unknown[]) => void): void;
}

declare global {
  interface Window {
    okxwallet?: { solana?: OkxSolanaProvider };
  }
}

export const OkxWalletName = "OKX Wallet" as WalletName<"OKX Wallet">;

// A simple OKX-style mark (five squares) so the wallet is recognisable in the picker.
const ICON =
  "data:image/svg+xml;base64," +
  (typeof btoa === "function"
    ? btoa(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" rx="20" fill="#000"/>' +
          '<g fill="#fff"><rect x="20" y="20" width="18" height="18"/><rect x="58" y="20" width="18" height="18"/>' +
          '<rect x="39" y="39" width="18" height="18"/><rect x="20" y="58" width="18" height="18"/><rect x="58" y="58" width="18" height="18"/></g></svg>',
      )
    : "");

export class OkxWalletAdapter extends BaseMessageSignerWalletAdapter {
  name = OkxWalletName;
  url = "https://web3.okx.com/download";
  icon = ICON;
  readonly supportedTransactionVersions = new Set(["legacy", 0] as const);

  private _connecting = false;
  private _wallet: OkxSolanaProvider | null = null;
  private _publicKey: PublicKey | null = null;
  private _readyState: WalletReadyState =
    typeof window === "undefined" || typeof document === "undefined" ? WalletReadyState.Unsupported : WalletReadyState.NotDetected;

  constructor() {
    super();
    if (this._readyState !== WalletReadyState.Unsupported) {
      scopePollingDetectionStrategy(() => {
        if (window.okxwallet?.solana) {
          this._readyState = WalletReadyState.Installed;
          this.emit("readyStateChange", this._readyState);
          return true;
        }
        return false;
      });
    }
  }

  get publicKey() {
    return this._publicKey;
  }
  get connecting() {
    return this._connecting;
  }
  get readyState() {
    return this._readyState;
  }

  async autoConnect() {
    if (this.readyState === WalletReadyState.Installed) await this.connect();
  }

  async connect() {
    try {
      if (this.connected || this.connecting) return;
      if (this.readyState !== WalletReadyState.Installed) throw new WalletNotReadyError();
      this._connecting = true;
      const wallet = window.okxwallet!.solana!;
      let res: Awaited<ReturnType<OkxSolanaProvider["connect"]>>;
      try {
        res = await wallet.connect();
      } catch (error) {
        throw new WalletConnectionError((error as Error)?.message, error);
      }
      const raw = (res && "publicKey" in res ? res.publicKey : null) ?? wallet.publicKey;
      if (!raw) throw new WalletAccountError();
      let publicKey: PublicKey;
      try {
        publicKey = new PublicKey(raw.toBytes());
      } catch (error) {
        throw new WalletPublicKeyError((error as Error)?.message, error);
      }
      wallet.on("disconnect", this._disconnected);
      wallet.on("accountChanged", this._accountChanged);
      this._wallet = wallet;
      this._publicKey = publicKey;
      this.emit("connect", publicKey);
    } catch (error) {
      this.emit("error", error as WalletConnectionError);
      throw error;
    } finally {
      this._connecting = false;
    }
  }

  async disconnect() {
    const wallet = this._wallet;
    if (wallet) {
      this._detach(wallet);
      this._wallet = null;
      this._publicKey = null;
      try {
        await wallet.disconnect();
      } catch (error) {
        this.emit("error", new WalletDisconnectionError((error as Error)?.message, error));
      }
    }
    this.emit("disconnect");
  }

  async signTransaction<T extends Transaction | VersionedTransaction>(transaction: T): Promise<T> {
    const wallet = this._wallet;
    if (!wallet) throw new WalletNotConnectedError();
    try {
      return await wallet.signTransaction(transaction);
    } catch (error) {
      throw new WalletSignTransactionError((error as Error)?.message, error);
    }
  }

  async signAllTransactions<T extends Transaction | VersionedTransaction>(transactions: T[]): Promise<T[]> {
    const wallet = this._wallet;
    if (!wallet) throw new WalletNotConnectedError();
    try {
      return await wallet.signAllTransactions(transactions);
    } catch (error) {
      throw new WalletSignTransactionError((error as Error)?.message, error);
    }
  }

  async signMessage(message: Uint8Array): Promise<Uint8Array> {
    const wallet = this._wallet;
    if (!wallet) throw new WalletNotConnectedError();
    try {
      const res = await wallet.signMessage(message, "utf8");
      return res instanceof Uint8Array ? res : new Uint8Array(res.signature);
    } catch (error) {
      throw new WalletSignMessageError((error as Error)?.message, error);
    }
  }

  private _detach(wallet: OkxSolanaProvider) {
    const off = (wallet.off ?? wallet.removeListener)?.bind(wallet);
    off?.("disconnect", this._disconnected);
    off?.("accountChanged", this._accountChanged);
  }

  private _disconnected = () => {
    const wallet = this._wallet;
    if (!wallet) return;
    this._detach(wallet);
    this._wallet = null;
    this._publicKey = null;
    this.emit("error", new WalletDisconnectedError());
    this.emit("disconnect");
  };

  private _accountChanged = (next: unknown) => {
    if (!this._publicKey || !next) return;
    try {
      const pk = new PublicKey((next as { toBytes(): Uint8Array }).toBytes());
      if (pk.equals(this._publicKey)) return;
      this._publicKey = pk;
      this.emit("connect", pk);
    } catch (error) {
      this.emit("error", new WalletPublicKeyError((error as Error)?.message, error));
    }
  };
}
