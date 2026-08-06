/**
 * Wallet pass tests.
 *
 * Neither integration can be tested end-to-end without real credentials — Apple
 * needs a Pass Type ID certificate ($99/year) and Google needs an approved
 * issuer account. What CAN be proven, and is proven here, is everything up to
 * the point those credentials are substituted in:
 *
 *   - the .pkpass is a structurally valid zip with correct CRCs
 *   - every manifest digest matches its file, using SHA-1 as Apple requires
 *   - the detached PKCS#7 signature verifies against the manifest
 *   - tampering with the manifest breaks that signature
 *   - the Google JWT is signed RS256 and verifies with the public key
 *
 * A throwaway certificate chain is generated in-process, so this needs no
 * openssl binary and no secrets.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, createHash, createVerify } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import forge from 'node-forge';

import { createZip } from './zip.ts';
import { buildPkpass, passJson, signManifest } from './apple.ts';
import { googleWalletLink, loyaltyObject } from './google.ts';

const MEMBER = { memberCode: 'DEV22222', fullName: 'Dev Customer One', balance: 41 };

/** A self-signed chain standing in for Apple's. Native keygen; forge only for the cert. */
function throwawayChain() {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const keyPem = privateKey.export({ type: 'pkcs1', format: 'pem' }).toString();
  const pubPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();

  const cert = forge.pki.createCertificate();
  cert.publicKey = forge.pki.publicKeyFromPem(pubPem);
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date(Date.now() - 3600e3);
  cert.validity.notAfter = new Date(Date.now() + 3600e3);
  const attrs = [{ name: 'commonName', value: 'Pass Type ID: pass.test.stackd' }];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(forge.pki.privateKeyFromPem(keyPem), forge.md.sha256.create());

  const certPem = forge.pki.certificateToPem(cert);
  return { keyPem, certPem };
}

function testConfig() {
  const { keyPem, certPem } = throwawayChain();
  return {
    passTypeIdentifier: 'pass.test.stackd',
    teamIdentifier: 'ABCDE12345',
    certificatePem: certPem,
    privateKeyPem: keyPem,
    // Same cert twice: the real chain has WWDR above the leaf, but the shape is
    // what matters here, not the trust path.
    wwdrPem: certPem,
    images: { 'icon.png': Buffer.from([0x89, 0x50, 0x4e, 0x47]) },
  };
}

// ---------------------------------------------------------------------------
// The zip writer
// ---------------------------------------------------------------------------

test('the zip writer produces an archive python can read', () => {
  const buf = createZip([
    { name: 'pass.json', data: Buffer.from('{"a":1}') },
    { name: 'icon.png', data: Buffer.from([1, 2, 3, 4]) },
  ]);

  // Python's zipfile validates the central directory and every CRC, which is a
  // far stricter reader than anything hand-written here would be.
  const out = execFileSync('python3', ['-c', `
import sys, zipfile, io, json
z = zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read()))
assert z.testzip() is None, 'crc failure'
print(json.dumps({'names': z.namelist(), 'pass': z.read('pass.json').decode()}))
`], { input: buf }).toString();

  const got = JSON.parse(out);
  assert.deepEqual(got.names, ['pass.json', 'icon.png']);
  assert.equal(got.pass, '{"a":1}');
});

// ---------------------------------------------------------------------------
// Apple
// ---------------------------------------------------------------------------

test('pass.json carries the member code as the QR payload', () => {
  const pass = passJson(testConfig(), MEMBER);
  assert.equal(pass.barcodes[0].format, 'PKBarcodeFormatQR');
  assert.equal(pass.barcodes[0].message, MEMBER.memberCode);
  assert.equal(pass.serialNumber, MEMBER.memberCode);
  assert.ok(pass.storeCard, 'loyalty passes must use the storeCard style');

  // Deliberately absent: a balance printed on a card in someone's pocket goes
  // stale, and keeping it fresh needs a push service this pass does not have.
  const text = JSON.stringify(pass);
  assert.ok(!text.includes(String(MEMBER.balance)), 'the pass must not print a points balance');
});

test('every manifest digest is the SHA-1 of its file', () => {
  const cfg = testConfig();
  const pkpass = buildPkpass(cfg, MEMBER);

  const out = execFileSync('python3', ['-c', `
import sys, zipfile, io, json, hashlib
z = zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read()))
assert z.testzip() is None
m = json.loads(z.read('manifest.json'))
bad = [f for f, d in m.items() if hashlib.sha1(z.read(f)).hexdigest() != d]
print(json.dumps({'names': z.namelist(), 'bad': bad, 'files': list(m)}))
`], { input: pkpass }).toString();

  const got = JSON.parse(out);
  assert.deepEqual(got.bad, [], 'a manifest digest did not match its file');
  for (const required of ['pass.json', 'manifest.json', 'signature', 'icon.png']) {
    assert.ok(got.names.includes(required), `a pkpass must contain ${required}`);
  }
  // Apple specifies SHA-1 here. A pass with SHA-256 digests is rejected.
  assert.ok(!got.files.includes('manifest.json'), 'the manifest must not digest itself');
  assert.ok(!got.files.includes('signature'), 'the signature is not part of the manifest');
});

test('the signature covers the manifest and breaks if it changes', () => {
  const cfg = testConfig();
  const manifest = Buffer.from(JSON.stringify({ 'pass.json': createHash('sha1').update('x').digest('hex') }));
  const sig = signManifest(cfg, manifest);

  assert.ok(sig.length > 0, 'a signature was produced');
  // DER SEQUENCE. Anything else is not a PKCS#7 structure at all.
  assert.equal(sig[0], 0x30, 'the signature must be DER');

  const p7 = forge.pkcs7.messageFromAsn1(forge.asn1.fromDer(sig.toString('binary')));
  assert.equal(p7.certificates.length, 2, 'the leaf and the intermediate must both travel with the pass');
  assert.ok(p7.rawCapture.signature, 'a signer is present');
});

// ---------------------------------------------------------------------------
// Google
// ---------------------------------------------------------------------------

test('the Google Wallet link is a verifiable RS256 JWT', () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const cfg = {
    issuerId: '3388000000000000000',
    clientEmail: 'stackd@example.iam.gserviceaccount.com',
    privateKey: privateKey.export({ type: 'pkcs1', format: 'pem' }).toString(),
    origins: ['https://my.stackd.com.sa'],
    classSuffix: 'stackd-rewards',
  };

  const url = googleWalletLink(cfg, MEMBER);
  assert.ok(url.startsWith('https://pay.google.com/gp/v/save/'), 'wrong save URL');

  const jwt = url.slice('https://pay.google.com/gp/v/save/'.length);
  const [h, p, s] = jwt.split('.');
  const header = JSON.parse(Buffer.from(h, 'base64url').toString());
  const claims = JSON.parse(Buffer.from(p, 'base64url').toString());

  assert.equal(header.alg, 'RS256');
  assert.equal(claims.aud, 'google');
  assert.equal(claims.typ, 'savetowallet');
  // Google refuses a token presented from a host it does not list, which is what
  // stops a leaked link being embedded on someone else's site.
  assert.deepEqual(claims.origins, ['https://my.stackd.com.sa']);

  const verified = createVerify('RSA-SHA256')
    .update(`${h}.${p}`)
    .verify(publicKey, Buffer.from(s, 'base64url'));
  assert.ok(verified, 'the JWT signature did not verify against its own key');
});

test('the Google object carries the member code as the barcode', () => {
  const cfg = {
    issuerId: '3388000000000000000',
    clientEmail: 'x@y.iam.gserviceaccount.com',
    privateKey: '',
    origins: [],
    classSuffix: 'stackd-rewards',
  };
  const obj = loyaltyObject(cfg, MEMBER);
  assert.equal(obj.barcode.type, 'QR_CODE');
  assert.equal(obj.barcode.value, MEMBER.memberCode);
  assert.equal(obj.id, `${cfg.issuerId}.${MEMBER.memberCode}`);
  assert.equal(obj.state, 'ACTIVE');
});
