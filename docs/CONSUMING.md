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

## Pattern B — git submodule in an external app repo

```sh
git submodule add https://github.com/PlebeiusGaragicus/cyphertap vendor/cyphertap
```

Then in the app's `package.json`:

```json
"dependencies": { "cyphertap": "file:./vendor/cyphertap" }
```

And copy the NDK override into the app's `pnpm-workspace.yaml` (see below).

## Required consumer configuration

1. **NDK version override** — ndk-cache-dexie pins an exact older
   `@nostr-dev-kit/ndk`; without a single forced version the app gets two
   incompatible NDK copies. In the consumer's `pnpm-workspace.yaml`:

   ```yaml
   overrides:
     "@nostr-dev-kit/ndk": 2.14.33
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

    const RELAYS = ['wss://relay.damus.io', 'wss://nos.lol'];
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
