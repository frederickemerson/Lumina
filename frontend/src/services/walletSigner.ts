import type { WalletAccount } from '@wallet-standard/core';
import type { SignatureScheme } from '@mysten/sui/cryptography';
import { Signer, parseSerializedSignature, PublicKey } from '@mysten/sui/cryptography';
import { Ed25519PublicKey } from '@mysten/sui/keypairs/ed25519';
import { Secp256k1PublicKey } from '@mysten/sui/keypairs/secp256k1';
import { Secp256r1PublicKey } from '@mysten/sui/keypairs/secp256r1';

type SignPersonalMessage = (input: { message: Uint8Array; account: WalletAccount }) => Promise<{
  bytes: string;
  signature: string;
}>;

type SignAndExecute = (input: any) => Promise<{
  digest: string;
  effects?: unknown;
}>;

export interface WalletSignerOptions {
  account: WalletAccount;
  signPersonalMessage: SignPersonalMessage;
  signAndExecuteTransactionBlock: SignAndExecute;
}

export class WalletSigner extends Signer {
  private readonly account: WalletAccount;
  private readonly signMessage: SignPersonalMessage;
  private readonly signTx: SignAndExecute;
  private cachedScheme?: SignatureScheme;
  private cachedPublicKey?: PublicKey;

  constructor(options: WalletSignerOptions) {
    super();
    this.account = options.account;
    this.signMessage = options.signPersonalMessage;
    this.signTx = options.signAndExecuteTransactionBlock;
  }

  async sign(bytes: Uint8Array): Promise<Uint8Array<ArrayBuffer>> {
    const { signature } = await this.signMessage({
      message: bytes,
      account: this.account,
    });
    const parsed = parseSerializedSignature(signature);
    if (!('signature' in parsed) || !parsed.signature || !parsed.publicKey) {
      throw new Error('Wallet provided unsupported signature format');
    }
    this.cachedScheme = parsed.signatureScheme;
    const signatureBytes = Uint8Array.from(parsed.signature as Iterable<number>);
    this.cachedPublicKey = instantiatePublicKey(parsed.signatureScheme, Uint8Array.from(parsed.publicKey as Iterable<number>));
    return signatureBytes as unknown as Uint8Array<ArrayBuffer>;
  }

  async signAndExecuteTransaction(options: Parameters<Signer['signAndExecuteTransaction']>[0]) {
    const response = await this.signTx({
      transactionBlock: options.transaction,
      account: this.account,
      chain: this.account.chains[0],
      options: {
        showEffects: true,
        showEvents: true,
        showObjectChanges: true,
      },
    });
    return response as any;
  }

  getKeyScheme(): SignatureScheme {
    if (this.cachedScheme) {
      return this.cachedScheme;
    }
    const inferred = inferSchemeFromPublicKey(this.account.publicKey as unknown as Uint8Array);
    if (!inferred) {
      throw new Error('Unable to determine signature scheme from wallet account');
    }
    return inferred;
  }

  getPublicKey(): PublicKey {
    if (this.cachedPublicKey) {
      return this.cachedPublicKey;
    }
    const scheme = this.getKeyScheme();
    const bytes = Uint8Array.from(this.account.publicKey as Iterable<number>);
    this.cachedPublicKey = instantiatePublicKey(scheme, bytes);
    return this.cachedPublicKey;
  }
}

function instantiatePublicKey(scheme: SignatureScheme, bytes: Uint8Array): PublicKey {
  switch (scheme) {
    case 'ED25519':
      return new Ed25519PublicKey(bytes);
    case 'Secp256k1':
      return new Secp256k1PublicKey(bytes);
    case 'Secp256r1':
      return new Secp256r1PublicKey(bytes);
    default:
      throw new Error(`Unsupported signature scheme: ${scheme}`);
  }
}

function inferSchemeFromPublicKey(publicKey: Readonly<Uint8Array> | Uint8Array): SignatureScheme | null {
  const raw = publicKey instanceof Uint8Array ? publicKey : Uint8Array.from(publicKey as Iterable<number>);
  const length = raw.length;
  if (length === 32) {
    return 'ED25519';
  }
  if (length === 33) {
    // Assume Secp256r1 for browsers (wallets typically expose compressed keys)
    return 'Secp256r1';
  }
  return null;
}

