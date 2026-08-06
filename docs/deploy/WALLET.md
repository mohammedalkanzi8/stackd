# Wallet passes

Putting the member's loyalty QR into Apple Wallet and Google Wallet, so it is a
swipe from the lock screen rather than a browser tab and a sign-in.

**Nothing here is required.** Both buttons stay hidden until their credentials
exist, and the portal works exactly as it does today without either. The
home-screen install below needs no accounts at all and is already live.

> ⚠ Neither integration has been tested against a real Apple certificate or a
> real Google issuer account, because both need credentials only you can obtain.
> What *is* tested, on every `npm test`: the pass bundles as a valid zip, every
> manifest digest matches its file, the PKCS#7 signature verifies and breaks
> when the manifest is altered, and the Google JWT verifies against its key.
> Expect to fix something the first time real credentials go in.

---

## Already working: add to home screen

No accounts, no fees, live now. On the portal, a customer uses their browser's
**Add to Home Screen** and gets a STACKD icon that opens straight to `/points`
with the QR on screen, no browser chrome.

It covers most of the convenience of a wallet pass. Worth telling customers about
at the counter regardless of whether you do the rest of this page.

---

## Google Wallet — free, needs approval

### 1. Issuer account

Sign up at the **Google Pay & Wallet Console** for a Wallet API issuer account.
You need a public business name and to accept the terms. You get a numeric
**issuer ID**.

⚠ **New accounts start in demo mode.** Only accounts you list as admins,
developers or test users can save a pass. Everyone else gets a refusal from
Google that the portal never sees, so it looks like the button is broken. Request
publishing access from the Wallet API dashboard before telling customers about
it.

### 2. Service account

In Google Cloud: create a project, enable the **Google Wallet API**, create a
service account, and download a JSON key. Then grant that service account access
in the Wallet Console.

### 3. Configure

From the JSON key, take `client_email` and `private_key`:

```
GOOGLE_WALLET_ISSUER_ID=3388000000000000000
GOOGLE_WALLET_CLIENT_EMAIL=stackd@your-project.iam.gserviceaccount.com
GOOGLE_WALLET_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\nMIIE...\n-----END PRIVATE KEY-----\n
GOOGLE_WALLET_ORIGINS=https://my.stackd.com.sa
```

The private key must keep its `\n` escapes on one line — an env file cannot hold
real newlines. The code converts them back. Getting this wrong produces
`error:1E08010C:DECODER routines::unsupported`, which says nothing about
newlines and wastes an hour.

`GOOGLE_WALLET_ORIGINS` matters: Google refuses a token presented from a host it
does not list, which is what stops a leaked link working on someone else's site.

---

## Apple Wallet — $99/year

### 1. Apple Developer Program

Enrol at developer.apple.com. **US$99 per year.** An organisation enrolment needs
a D-U-N-S number and takes longer than an individual one. There is no free path:
Apple will not accept an unsigned pass.

### 2. Pass Type ID and certificate

In the developer portal: **Identifiers → Pass Type IDs → +**, e.g.
`pass.com.sa.stackd.rewards`. Create a certificate for it, download the `.cer`,
and convert:

```bash
openssl x509 -inform DER -in pass.cer -out pass.pem
# Export the matching private key from Keychain as pass.p12, then:
openssl pkcs12 -in pass.p12 -nocerts -nodes -out passkey.pem
```

You also need Apple's **WWDR intermediate certificate** (currently G4), from
apple.com/certificateauthority. A chain without it makes iOS refuse the pass
with no useful message at all.

### 3. Configure

```
APPLE_WALLET_PASS_TYPE_ID=pass.com.sa.stackd.rewards
APPLE_WALLET_TEAM_ID=ABCDE12345
APPLE_WALLET_CERT_PEM=-----BEGIN CERTIFICATE-----\nMIIF...\n-----END CERTIFICATE-----\n
APPLE_WALLET_KEY_PEM=-----BEGIN PRIVATE KEY-----\nMIIE...\n-----END PRIVATE KEY-----\n
APPLE_WALLET_WWDR_PEM=-----BEGIN CERTIFICATE-----\nMIIE...\n-----END CERTIFICATE-----\n
```

Same `\n` rule as Google. `APPLE_WALLET_TEAM_ID` is the 10-character Team ID from
your developer account, and `APPLE_WALLET_PASS_TYPE_ID` must match the
certificate exactly.

⚠ **The certificate expires after a year** and the pass stops signing when it
does. Put a reminder somewhere that outlives this document.

---

## Applying it

Add the variables to `deploy/.env` on the server, then:

```bash
cd /opt/stackd
docker compose -f deploy/docker-compose.yml up -d portal
```

No rebuild needed — these are read at runtime. The buttons appear on `/points`
for signed-in members as soon as the container restarts.

Check it worked:

```bash
# 404 means Apple is not configured; 200 with the pkpass type means it is.
curl -sI https://my.stackd.com.sa/wallet/apple -b "stackd_member=<a real session cookie>"
```

---

## What the pass contains, and what it does not

It carries the **member code** and nothing that changes. No points balance.

That is deliberate. Keeping a number fresh on a card in someone's pocket needs a
registration web service and APNs pushes on Apple, and a REST write on every
ledger change on Google. A stale balance on a wallet card is worse than no
balance: it gets believed, and then argued about at the counter.

The code is what the till scans, and it never changes. If you later want live
balances, that is a real feature with its own infrastructure, not a config
change.
