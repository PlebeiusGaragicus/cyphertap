# Tech debt & pending decisions

Status snapshot (2026-07-10): `svelte-check` 0 errors / 0 warnings; `pnpm build`
(vite + svelte-package + publint) green; single NDK version enforced via
pnpm-workspace.yaml override. Items below are what remains, roughly in
priority order. Items marked **DECISION** need a product call before code.

## 1. Private key stored unencrypted in localStorage — **DECISION**

`storePrivateKey()` in `src/lib/stores/nostr.ts` writes the raw hex nsec to
localStorage under a constant misleadingly named `ENCRYPTED_KEY`. Any XSS or
malicious extension can read it.

The repo already has a working NIP-49 module (`src/lib/utils/nip49.ts`,
scrypt + XChaCha20-Poly1305) — the crypto is not the blocker. The blocker is
UX: encrypting at rest means auto-login can no longer be silent. Options:

- **Full NIP-49**: user sets a password; unlock prompt each session. Most
  secure, most friction — arguably wrong for a drop-in payments button.
- **PIN-optional**: unencrypted by default, settings toggle to encrypt with a
  PIN. Middle ground; the toggle needs clear "if you forget the PIN the key
  is gone unless backed up" messaging.
- **Session-scoped unlock**: NIP-49 at rest + decrypted key kept only in
  memory; re-prompt on new tab/session.
- **Document and defer**: keep as-is; state plainly in the README that keys
  are hot and the wallet is for pocket-money amounts.

## 2. Test suite is a placeholder

One demo test (`src/demo.spec.ts`). Highest-value coverage to add first:

- `src/lib/utils/nip49.ts` — pure crypto, easy to test, catastrophic if wrong
  (NIP-49 spec has test vectors; nostr-tools' nip49 tests are a reference).
- `CyphertapAPI` publish/sign/subscribe — the publish error-handling contract
  (NDKPublishError tolerated, everything else rethrown) is exactly the kind
  of behavior a refactor silently breaks.
- Token encode/guard path in `generateEcashToken`.

## 3. `cashuPay` type casts

`src/lib/api/cyphertap-api.svelte.ts` and `src/lib/stores/wallet.ts` cast
payment info to `NDKZapDetails<CashuPaymentInfo>` because ndk-wallet's type
demands zap fields (`target`, `recipientPubkey`) that the runtime never reads
when minting a plain token. Remove the casts when NDK separates token-minting
from zapping in its types (check again on the NDK 3.x upgrade).

## 4. NDK 3.0 coordinated upgrade

Published versions as of 2026-07: ndk 3.0.3, ndk-svelte 2.4.48,
ndk-wallet 0.7.1, ndk-cache-dexie 2.6.44. This is a major-version migration
and must be done as one coordinated bump across all four packages. When doing
it, **remove the `@nostr-dev-kit/ndk: 2.14.33` override in
pnpm-workspace.yaml** — it exists only to fix the 2.14.9/2.14.33 split among
the 2.x packages and will fight a 3.x upgrade.

## 5. `import.meta.env` makes the library Vite-only

`DEFAULT_MINTS` in `src/lib/stores/wallet.ts` reads `VITE_CASHU_MINT_URL`;
svelte-package warns because non-Vite bundlers choke on it. Becomes a
non-issue if the library is consumed from source by Vite/SvelteKit apps (see
distribution decision); the clean general fix is a `configure({ mints })` /
component-prop API instead of env sniffing.

## 6. Distribution: embedded, not npm — **DECIDED 2026-07-10**

The fork is embedded in consuming apps: workspace package in the ecosystem
monorepo now, git submodule (`vendor/cyphertap` + `file:` dependency) for
external app repos. See `docs/CONSUMING.md` for the full pattern. Consumption
is **dist-based** (not raw source) because the source uses `$lib` aliases
that only `svelte-package` rewrites to portable relative paths. Remaining
follow-ups:

- `package.json` still points `repository`/`homepage`/`author` at upstream
  cypherflow — update once identity/rebrand is decided. Keep upstream's MIT
  license and attribution regardless.

## 6b. Components are legacy-mode Svelte 5 (pre-runes) — **RESOLVED 2026-07-10**

All components migrated to runes (`$props()`/`$derived`/`$effect`); no
`$:`/`export let` remains under `src/lib`. Consumers no longer need the
runes-mode exception in their Vite config (CONSUMING.md updated); the
standard `node_modules` exclusion suffices.

## 7. svelte-motion is Svelte-4 era

`animated-beam.svelte` needs typing workarounds (action cast for SVG
elements) because svelte-motion predates Svelte 5. If animations grow beyond
the one beam component, replace with the `motion` package (Motion One) or
plain CSS animations rather than accumulating casts.

## 8. Upstream relationship

The fork tracks `cypherflow/cyphertap` (remote `upstream`, unmoved since the
fork point). The signEvent/publishEvent return-value fix and the NIP-44
encrypt/decrypt fix are upstream-PR material if we want to give back; they
apply cleanly to upstream main.
