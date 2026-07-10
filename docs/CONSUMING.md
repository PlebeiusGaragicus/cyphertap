# Consuming cyphertap (embedded, not npm)

This fork is not published to npm. Apps embed it — as a git submodule (the
end-state for external repos) or as a workspace package (how the ecosystem
monorepo consumes it). Both use the same mechanics: the app depends on the
package directory and consumes the built `dist/`.

## Why `dist/`, not raw source

The source uses SvelteKit's `$lib` alias throughout. In a consuming app,
`$lib` resolves to the *consumer's* lib directory, so raw-source consumption
would break imports. `svelte-package` rewrites `$lib` to relative paths when
emitting `dist/`, which makes the build output portable. Hence: consumers
need `dist/` built once (and rebuilt after library edits).

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

2. **Disable SSR** on routes that render the component (it needs
   localStorage/IndexedDB/WebSocket):

   ```ts
   // +layout.ts
   export const ssr = false;
   ```

3. **Runes-mode exception** — new SvelteKit scaffolds force
   `compilerOptions.runes: true` for non-`node_modules` files. Workspace- and
   submodule-linked packages resolve through their symlink to a real path
   without a `node_modules` segment, so cyphertap (legacy-mode Svelte 5) gets
   runes-compiled and fails. Extend the scaffold's check to treat anything
   outside the app dir as a library:

   ```ts
   runes: ({ filename }) =>
       filename.split(/[/\\]/).includes('node_modules') ||
       !filename.startsWith(import.meta.dirname)
           ? undefined
           : true
   ```

   (Goes away when the library itself migrates to runes — see TECH-DEBT.)

4. **Optional build-time default mint**: set `VITE_CASHU_MINT_URL` in the
   consumer's env to override `DEFAULT_MINTS`.

## Usage

```svelte
<script lang="ts">
    import { Cyphertap, cyphertap } from 'cyphertap';
</script>

<Cyphertap />
```

Styles ship with the package (`dist/index.js` imports the compiled CSS);
no Tailwind setup is required in the consumer.
