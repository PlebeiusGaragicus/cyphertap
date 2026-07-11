# Consuming cyphertap (embedded, not npm)

This fork is not published to npm. Apps embed it — as a git submodule (the
end-state for external repos) or as a workspace package (how the ecosystem
monorepo consumes it). Both use the same mechanics: the app depends on the
package directory and consumes the library **from source** — `package.json`
exports point at `src/lib/index.ts`, and `src/lib` uses only relative imports
(no `$lib` alias), so the consumer's Vite compiles it directly. No build step,
no stale dist: edits in the submodule HMR straight into the consuming app.

A `svelte-package` dist pipeline remains as an escape hatch (e.g. for
consumers that can't compile TypeScript source):

```sh
pnpm --filter cyphertap package        # build dist (svelte-package + css)
pnpm --filter cyphertap package:watch  # rebuild on change during development
```

## Pattern A — workspace package (ecosystem monorepo)

The parent workspace lists `cyphertap` in `pnpm-workspace.yaml` and apps
depend on it with:

```json
"dependencies": { "cyphertap": "workspace:*" }
```

## Pattern B — git submodule in an external app repo (canonical)

This is the end-state for every app promoted out of the monorepo
(first production user: `socratic-seminar`). The submodule lives at the repo
root and is consumed as a **pnpm workspace package** — not `file:` — so it
resolves through one root lockfile and `pnpm --filter cyphertap …` still works
for running the library's own check/tests/package from inside the app repo.

```sh
git submodule add https://github.com/PlebeiusGaragicus/cyphertap cyphertap
```

App-root `pnpm-workspace.yaml`:

```yaml
packages:
  - cyphertap

allowBuilds:
  '@parcel/watcher': true
  '@tailwindcss/oxide': true
  esbuild: true
  sharp: true

# Keep identical to cyphertap/pnpm-workspace.yaml (see below).
overrides:
  "@nostr-dev-kit/ndk": 2.15.2
```

App `package.json`:

```json
"dependencies": { "cyphertap": "workspace:*" }
```

Vite: cyphertap resolves through the `node_modules/cyphertap` symlink, but
Vite serves *dynamically imported* files (e.g. the vendored negentropy
module) by real path — allow the submodule dir:

```ts
// vite.config.ts
server: { fs: { allow: ['cyphertap'] } }
```

CI must clone the submodule and will (intentionally) fail on unsynced
lockfiles:

```yaml
- uses: actions/checkout@v5
  with: { submodules: recursive }
- uses: pnpm/action-setup@v4
  with: { version: 11 }
- uses: actions/setup-node@v4
  with: { node-version: 22, cache: pnpm }
- run: pnpm install --frozen-lockfile
```

**Rules that keep this healthy:**

- **Changes flow upstream first.** The app never carries app-specific commits
  on its submodule. Need a fix or feature? Land it on cyphertap `main`, then
  bump the app's submodule pointer. The pointer is the version pin — that is
  the entire reason for replacing npm.
- **Every submodule bump that changes cyphertap's dependencies** requires
  `pnpm install` in the app repo and committing the updated `pnpm-lock.yaml`;
  otherwise CI's `--frozen-lockfile` fails (by design — it catches drift).
- **Clone with `git clone --recurse-submodules`.** A plain clone leaves
  `cyphertap/` empty and `workspace:*` resolution fails confusingly. Put this
  at the top of the app's README.
- `"cyphertap": "file:./cyphertap"` also works if you can't use a workspace,
  but you lose `--filter` and pnpm re-resolves the dep on every install.

## Required consumer configuration

1. **NDK version override** — the NDK companion packages resolve different
   `@nostr-dev-kit/ndk` versions; without a single forced version the app gets
   two incompatible NDK copies. In the consumer's `pnpm-workspace.yaml`,
   **identical to the override in cyphertap's own `pnpm-workspace.yaml`**
   (currently 2.15.2 — check there when in doubt):

   ```yaml
   overrides:
     "@nostr-dev-kit/ndk": 2.15.2
   ```

2. ~~Disable SSR~~ — no longer required: `<Cyphertap/>` is SSR-safe and
   renders a placeholder trigger server-side, hydrating into the real widget.
   `ssr = false` still works if you prefer a fully client-rendered app.

3. ~~Runes-mode exception~~ — no longer required: the library is fully
   runes-mode Svelte 5, so scaffolds that force `compilerOptions.runes: true`
   compile it fine. Keep the standard `node_modules` exclusion for third-party
   Svelte libraries:

   ```ts
   runes: ({ filename }) =>
       filename.split(/[/\\]/).includes('node_modules') ? undefined : true
   ```

4. **Relays and mints**: pass props (or call `configure()` before mounting).
   Defaults are TEST infrastructure (our whitelisted strfry relay
   `wss://relay.abvstudio.net` + the `nofee.testnut.cashu.space` fake-ecash
   mint — no real funds) — production apps must set their own. Layering: props/`configure()` > `VITE_CASHU_MINT_URL` env >
   hardcoded default. Note: mints only apply when a NEW NIP-60 wallet is
   created — an existing wallet keeps the mint list from its own wallet
   event. Config changes after login apply on the next login.

5. **Styles must be imported explicitly** in the app's root layout:

   ```ts
   import 'cyphertap/styles.css';
   ```

   The library's internal side-effect CSS import survives dev mode but is
   tree-shaken out of consumer **production** builds — without the explicit
   import the widget renders completely unstyled, and only in prod.
   (`cyphertap/styles.css` resolves to the committed `src/lib/styles.css`,
   which `pnpm --filter cyphertap watch:css` regenerates when the library's
   Tailwind classes change.)

## Usage

```svelte
<script lang="ts">
    // in +layout.svelte
    import 'cyphertap/styles.css';
    import { Cyphertap, cyphertap } from 'cyphertap';

    const RELAYS = ['wss://relay.abvstudio.net', 'wss://relay.primal.net'];
</script>

<Cyphertap relays={RELAYS} mints={['https://mint.example.com']} />
```

API highlights (see the `cyphertap` singleton): `publishEvent`,
`publishAddressable(kind, dTag, content, tags?)`, `subscribe`,
`subscribeLatest` (newest-per-key dedup for replaceable/addressable kinds),
`getFollows()`, payments (`generateEcashToken`, `sendLightningPayment`, …).
`getNDK()` is exported for power users (throws before login).

Styles ship with the package as prebuilt CSS; no Tailwind setup is required
in the consumer.
