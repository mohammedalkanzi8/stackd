/**
 * "Add to Google Wallet" for a member's loyalty card.
 *
 * The button is a link to pay.google.com carrying a JWT signed with a Google
 * Cloud service account key. The whole pass is described inside that token, so
 * there is no REST call to make and nothing to keep in sync — which is exactly
 * why the pass is deliberately STATIC.
 *
 * It carries the member code and nothing else that changes. A points balance
 * printed on a wallet card would be wrong within a day and there is no cheap way
 * to correct it; the code is the thing the till scans and it never changes.
 *
 * ⚠ A new issuer account starts in DEMO MODE. Only accounts listed as admins,
 * developers or test users in the Google Pay & Wallet Console can save a pass
 * until you request publishing access. A customer trying it before then gets a
 * refusal from Google that this code never sees.
 *
 * Setup: docs/deploy/WALLET.md
 */

import { createSign } from 'node:crypto';
import type { WalletMember } from './types.ts';

export interface GoogleWalletConfig {
  /** Numeric issuer id from the Google Pay & Wallet Console. */
  issuerId: string;
  /** Service account email, from the JSON key. */
  clientEmail: string;
  /** Service account PEM private key, from the JSON key. */
  privateKey: string;
  /** Hosts allowed to serve the link. Google rejects a JWT used elsewhere. */
  origins: string[];
  /** Loyalty class suffix, e.g. `stackd-rewards`. Created once, shared by all members. */
  classSuffix: string;
}

/**
 * Reads config from the environment, or returns null when it is absent.
 *
 * Null is the normal state until credentials exist, and every caller treats it
 * as "do not show the button" rather than as an error. A half-configured pass
 * would fail in the customer's hands instead of here.
 */
export function googleWalletConfig(): GoogleWalletConfig | null {
  const issuerId = process.env.GOOGLE_WALLET_ISSUER_ID;
  const clientEmail = process.env.GOOGLE_WALLET_CLIENT_EMAIL;
  const rawKey = process.env.GOOGLE_WALLET_PRIVATE_KEY;
  if (!issuerId || !clientEmail || !rawKey) return null;

  return {
    issuerId,
    clientEmail,
    // An env var cannot hold real newlines, so the key is stored with literal
    // \n and restored here. Skipping this yields "error:1E08010C:DECODER
    // routines::unsupported", which says nothing about newlines.
    privateKey: rawKey.replace(/\\n/g, '\n'),
    origins: (process.env.GOOGLE_WALLET_ORIGINS ?? process.env.STACKD_PORTAL_URL ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    classSuffix: process.env.GOOGLE_WALLET_CLASS ?? 'stackd-rewards',
  };
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

/**
 * The loyalty class: the programme itself, shared by every member.
 *
 * Returned so it can be created once via the REST API or embedded in the JWT.
 * Embedding means Google creates it on first use, which avoids a provisioning
 * step that would otherwise have to happen before the first customer.
 */
export function loyaltyClass(cfg: GoogleWalletConfig) {
  return {
    id: `${cfg.issuerId}.${cfg.classSuffix}`,
    issuerName: 'STACKD',
    programName: 'STACKD Rewards',
    reviewStatus: 'UNDER_REVIEW',
    hexBackgroundColor: '#b82712',
  };
}

/** The per-member object. The barcode value is what the till scans. */
export function loyaltyObject(cfg: GoogleWalletConfig, member: WalletMember) {
  return {
    id: `${cfg.issuerId}.${member.memberCode}`,
    classId: `${cfg.issuerId}.${cfg.classSuffix}`,
    state: 'ACTIVE',
    accountId: member.memberCode,
    accountName: member.fullName ?? 'STACKD member',
    barcode: {
      type: 'QR_CODE',
      value: member.memberCode,
      // Shown under the barcode so it can be read out if a scanner fails.
      alternateText: member.memberCode,
    },
  };
}

/**
 * The "Add to Google Wallet" URL for one member.
 *
 * The JWT is signed RS256 with the service account key. `origins` matters:
 * Google refuses a token presented from a host that is not listed, which is what
 * stops a leaked link being embedded elsewhere.
 */
export function googleWalletLink(cfg: GoogleWalletConfig, member: WalletMember): string {
  const header = { alg: 'RS256', typ: 'JWT' };
  const claims = {
    iss: cfg.clientEmail,
    aud: 'google',
    typ: 'savetowallet',
    iat: Math.floor(Date.now() / 1000),
    origins: cfg.origins,
    payload: {
      loyaltyClasses: [loyaltyClass(cfg)],
      loyaltyObjects: [loyaltyObject(cfg, member)],
    },
  };

  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claims))}`;
  const signature = createSign('RSA-SHA256').update(signingInput).sign(cfg.privateKey);

  return `https://pay.google.com/gp/v/save/${signingInput}.${base64url(signature)}`;
}
