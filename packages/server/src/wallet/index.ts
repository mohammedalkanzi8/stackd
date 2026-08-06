/**
 * Wallet passes for the member loyalty card.
 *
 * Both integrations are optional and stay dark until their credentials exist.
 * `walletOptions()` is the single place that decides which buttons a customer
 * sees, so a half-configured pass never reaches someone's phone.
 */

export * from './types.ts';
export * from './zip.ts';
export * from './apple.ts';
export * from './google.ts';

import { appleWalletConfig } from './apple.ts';
import { googleWalletConfig, googleWalletLink } from './google.ts';
import type { WalletMember } from './types.ts';

export interface WalletOptions {
  /** Signed save link, or null when Google Wallet is not configured. */
  googleUrl: string | null;
  /** True when the .pkpass route can produce a pass. */
  appleAvailable: boolean;
}

export function walletOptions(member: WalletMember): WalletOptions {
  const google = googleWalletConfig();
  return {
    googleUrl: google ? googleWalletLink(google, member) : null,
    // Images are only read when a pass is actually built, so an empty map is
    // enough to answer "are the credentials present".
    appleAvailable: appleWalletConfig({}) !== null,
  };
}
