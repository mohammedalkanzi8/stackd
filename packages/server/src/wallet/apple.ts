/**
 * "Add to Apple Wallet" for a member's loyalty card.
 *
 * A .pkpass is a zip containing pass.json, the images it references, a
 * manifest.json of SHA-1 digests, and a detached PKCS#7 signature over that
 * manifest. Apple refuses anything unsigned, which is why this needs a Pass
 * Type ID certificate and therefore a paid Apple Developer membership.
 *
 * The pass is deliberately STATIC: it carries the member code and nothing that
 * changes. Showing a points balance would need a registration web service and
 * APNs pushes to keep honest, and a stale number on a card in someone's pocket
 * is worse than no number at all. The code is what the till scans, and it never
 * changes.
 *
 * Setup: docs/deploy/WALLET.md
 */

import { createHash } from 'node:crypto';
import forge from 'node-forge';
import type { WalletMember } from './types.ts';

import { createZip, type ZipEntry } from './zip.ts';

export interface AppleWalletConfig {
  /** e.g. pass.com.sa.stackd.rewards — must match the certificate exactly. */
  passTypeIdentifier: string;
  /** The 10-character Apple Team ID. */
  teamIdentifier: string;
  /** Pass Type ID certificate, PEM. */
  certificatePem: string;
  /** Its private key, PEM. Unencrypted, or supply the passphrase. */
  privateKeyPem: string;
  privateKeyPassphrase?: string;
  /** Apple WWDR intermediate certificate, PEM. Apple rejects a chain without it. */
  wwdrPem: string;
  /** PNG bytes, keyed by pass filename: icon.png, icon@2x.png, logo.png. */
  images: Record<string, Buffer>;
}

export function appleWalletConfig(images: Record<string, Buffer>): AppleWalletConfig | null {
  const passTypeIdentifier = process.env.APPLE_WALLET_PASS_TYPE_ID;
  const teamIdentifier = process.env.APPLE_WALLET_TEAM_ID;
  const certificatePem = process.env.APPLE_WALLET_CERT_PEM?.replace(/\\n/g, '\n');
  const privateKeyPem = process.env.APPLE_WALLET_KEY_PEM?.replace(/\\n/g, '\n');
  const wwdrPem = process.env.APPLE_WALLET_WWDR_PEM?.replace(/\\n/g, '\n');

  if (!passTypeIdentifier || !teamIdentifier || !certificatePem || !privateKeyPem || !wwdrPem) {
    return null;
  }
  return {
    passTypeIdentifier,
    teamIdentifier,
    certificatePem,
    privateKeyPem,
    privateKeyPassphrase: process.env.APPLE_WALLET_KEY_PASSPHRASE,
    wwdrPem,
    images,
  };
}

/** The pass definition. `storeCard` is Apple's style for loyalty programmes. */
export function passJson(cfg: AppleWalletConfig, member: WalletMember) {
  return {
    formatVersion: 1,
    passTypeIdentifier: cfg.passTypeIdentifier,
    teamIdentifier: cfg.teamIdentifier,
    // Unique per pass. The member code already is.
    serialNumber: member.memberCode,
    organizationName: 'STACKD',
    description: 'STACKD Rewards card',
    logoText: 'STACKD',
    foregroundColor: 'rgb(254, 254, 254)',
    backgroundColor: 'rgb(184, 39, 18)',
    labelColor: 'rgb(236, 167, 15)',
    storeCard: {
      primaryFields: [
        { key: 'member', label: 'MEMBER', value: member.fullName ?? 'STACKD member' },
      ],
      // No points field. See the note at the top of this file: a stale balance
      // on a card in someone's pocket is worse than no balance.
      secondaryFields: [{ key: 'code', label: 'MEMBER CODE', value: member.memberCode }],
      backFields: [
        {
          key: 'how',
          label: 'How it works',
          value: 'Show this card when you order and your points go on automatically.',
        },
      ],
    },
    barcodes: [
      {
        format: 'PKBarcodeFormatQR',
        message: member.memberCode,
        messageEncoding: 'iso-8859-1',
        altText: member.memberCode,
      },
    ],
  };
}

/**
 * manifest.json: SHA-1 of every file in the bundle.
 *
 * SHA-1 is not a choice — Apple specifies it, and a pass with SHA-256 digests
 * is rejected. It is an integrity manifest covered by the signature, not a
 * password hash, so its weakness does not matter here.
 */
function buildManifest(files: ZipEntry[]): Buffer {
  const manifest: Record<string, string> = {};
  for (const f of files) {
    manifest[f.name] = createHash('sha1').update(f.data).digest('hex');
  }
  return Buffer.from(JSON.stringify(manifest), 'utf8');
}

/**
 * Detached PKCS#7 signature over manifest.json.
 *
 * The chain must include the WWDR intermediate as well as the pass certificate;
 * with only the leaf, iOS silently refuses the pass with no useful message.
 */
export function signManifest(cfg: AppleWalletConfig, manifest: Buffer): Buffer {
  const cert = forge.pki.certificateFromPem(cfg.certificatePem);
  const wwdr = forge.pki.certificateFromPem(cfg.wwdrPem);
  const key = cfg.privateKeyPassphrase
    ? forge.pki.decryptRsaPrivateKey(cfg.privateKeyPem, cfg.privateKeyPassphrase)
    : forge.pki.privateKeyFromPem(cfg.privateKeyPem);

  if (!key) throw new Error('could not read the pass private key (wrong passphrase?)');

  const p7 = forge.pkcs7.createSignedData();
  p7.content = forge.util.createBuffer(manifest.toString('binary'));
  p7.addCertificate(cert);
  p7.addCertificate(wwdr);
  p7.addSigner({
    key,
    certificate: cert,
    digestAlgorithm: forge.pki.oids.sha256,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
      { type: forge.pki.oids.messageDigest },
      { type: forge.pki.oids.signingTime },
    ],
  });

  // detached: the manifest travels beside the signature, not inside it.
  p7.sign({ detached: true });
  return Buffer.from(forge.asn1.toDer(p7.toAsn1()).getBytes(), 'binary');
}

/** The complete .pkpass, ready to serve as application/vnd.apple.pkpass. */
export function buildPkpass(cfg: AppleWalletConfig, member: WalletMember): Buffer {
  const files: ZipEntry[] = [
    { name: 'pass.json', data: Buffer.from(JSON.stringify(passJson(cfg, member)), 'utf8') },
    ...Object.entries(cfg.images).map(([name, data]) => ({ name, data })),
  ];

  const manifest = buildManifest(files);
  const signature = signManifest(cfg, manifest);

  return createZip([
    ...files,
    { name: 'manifest.json', data: manifest },
    { name: 'signature', data: signature },
  ]);
}
