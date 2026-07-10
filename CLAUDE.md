# cyphertap — working notes

Svelte 5 library: nostr auth + Lightning + Cashu ecash on a single button,
plus a programmatic API (`cyphertap` singleton). Maintained fork of
cypherflow/cyphertap; embedded in apps as a submodule/workspace package,
NOT published to npm. Treat as a maturing product — production quality bar.

## Read these before changing anything

- `docs/TECH-DEBT.md` — debt AND dated decisions (key storage deferred,
  distribution embedded, NDK 3.0 blocked upstream…). The decision log.
- `docs/CONSUMING.md` — the consumer contract this repo must not break:
  source consumption via `src/lib/index.ts` exports, NDK version override,
  explicit `cyphertap/styles.css` import.
- `docs/THEMING.md` — CSS-var override contract (`:root:root`).

## Hard invariants

- **`src/lib` must never use the `$lib` alias** — only relative imports.
  Consumers compile this source directly; `$lib` would resolve to *their*
  lib dir. (`src/routes`, the showcase app, may use `$lib`.)
- **Fully runes-mode.** No `$:`, `export let`, `export { x as class }`, or
  `<slot>` anywhere in `src/lib` — consumers force `runes: true` over this
  source. Watch for the subtle one: a plain `let` that gets reassigned needs
  `$state()` (the compiler only warns, and only at consumer build time).
- **`src/lib/styles.css` is committed build output** — regenerate with
  `pnpm watch:css` when Tailwind classes change; don't hand-edit.
- **package.json exports point at `src/lib/index.ts`** (source). The
  svelte-package dist pipeline (`pnpm package`) is an escape hatch only,
  but keep it green — CI runs it.
- New public API goes through `src/lib/index.ts` and takes plain types
  (`SimpleNostrFilter`, `SimpleNostrEvent`) so consumers never import NDK.

## Verification (all must pass before landing)

```sh
pnpm check                            # svelte-check, expect 0/0
pnpm vitest --project server --run    # 29+ unit/contract tests
pnpm package                          # dist escape hatch still builds
```

Then bump the submodule pointer in the consuming workspace and let both CIs
run (see the workspace CLAUDE.md landing checklist). Pushing here deploys
the showcase to GitHub Pages.

## Testing patterns (see src/lib/api/test-helpers.ts)

- **Store injection over vi.mock**: set `ndkInstance`/`currentUser`/`wallet`
  writables in the test, reset after. The module under test runs unmodified.
- **Real crypto, no network**: `new NDK({ signer: NDKPrivateKeySigner.generate() })`
  signs/encrypts offline; never call connect(). NIP-49 has official spec
  vectors in the suite.
- Publish-failure contract: spy on `NDKEvent.prototype.publish` and throw a
  real `NDKPublishError` (tolerated → warn) vs plain `Error` (rethrown) —
  keeps `instanceof` honest.
- Subscriptions: `FakeSubscription` (records filter/opts, `emit()` to drive
  events, asserts `stop()` on unsubscribe).

## Architecture in one paragraph

`stores/config.ts` (plain module, no store imports — everything imports it)
holds relays/mints; `<Cyphertap>` props call `configure()` before mount, and
config is read once per login. `stores/nostr.ts` owns NDK + login flows
(NIP-07 / nsec / NIP-49 device link); `stores/wallet.ts` owns the NIP-60
NDKCashuWallet. `api/cyphertap-api.svelte.ts` is the public singleton over
those stores; pure logic it depends on lives in `utils/` (e.g. `latest.ts`
dedup for subscribeLatest). The component tree under `components/cyphertap/`
is popover (desktop) / drawer (mobile) with a view router; SSR renders a
placeholder shell (`{#if !BROWSER}` in cyphertap.svelte).

## Security posture (deliberate, documented)

Private keys are stored as raw hex in localStorage under the misleadingly
named `ENCRYPTED_KEY` — decided 2026-07-10: document-and-defer (README
warning, pocket-money framing). The NIP-49 module (`utils/nip49.ts`) is
real and tested but wired only to device linking, not at-rest storage.
Don't "fix" this in passing; it's a product decision (TECH-DEBT #1).
