# Theming cyphertap

The widget is styled entirely through shadcn-style CSS custom properties
(oklch tokens defined in `src/lib/tailwind.css`, compiled into
`cyphertap/styles.css`). Consumers theme it by redefining those variables —
no Tailwind setup, no fork, no build flag.

## The override contract

Redefine the variables in a stylesheet loaded **after** `cyphertap/styles.css`:

```css
/* src/app.css — imported after 'cyphertap/styles.css' in +layout.svelte */
:root:root {
	--primary: oklch(0.55 0.2 260);
	--primary-foreground: oklch(0.98 0 0);
	--radius: 0.375rem;
}

:root:root.dark {
	--primary: oklch(0.7 0.19 260);
}
```

Use the doubled `:root:root` selector. It costs nothing to write but doubles
specificity, which matters because Vite's CSS ordering between a library's
own stylesheet and app CSS can differ between `dev` and `build` — plain
`:root` overrides can win in dev and silently lose in prod. `:root:root`
wins in both regardless of order.

Verify any theme change against a production build (`vite build` + preview),
not just dev, for the same reason.

## Dark mode

Dark mode is the `.dark` class on `<html>` — the consumer owns toggling it.
The library ships no watcher in the component; `mode-watcher` in the repo is
showcase-only. Minimal consumer toggle:

```svelte
<button onclick={() => document.documentElement.classList.toggle('dark')}>
	toggle theme
</button>
```

If you want OS-preference tracking, persistence, and FOUC avoidance, use
[`mode-watcher`](https://github.com/svecosystem/mode-watcher) in the app.

## Variables that visibly matter

The full set is in `src/lib/tailwind.css` (`:root` for light, `.dark` for
dark — override both). The ones with visible effect on the widget:

| Variable | Drives |
| --- | --- |
| `--primary` / `--primary-foreground` | The trigger button, primary action buttons |
| `--background` / `--foreground` | Popover/drawer surface and body text |
| `--popover` / `--popover-foreground` | The desktop popover panel |
| `--card` / `--card-foreground` | Balance and transaction cards |
| `--secondary` / `--secondary-foreground` | Secondary buttons (Receive, presets) |
| `--muted` / `--muted-foreground` | Hints, timestamps, empty states |
| `--accent` / `--accent-foreground` | Hover/selected states in lists |
| `--destructive` | Sign-out, delete-relay/mint actions |
| `--border` / `--input` / `--ring` | Outlines, text inputs, focus rings |
| `--radius` | Corner rounding everywhere (sm/md/lg/xl derive from it) |

The `--chart-*`, `--sidebar-*`, and `--color-*` variables exist in the token
sheet but are not used by the widget itself — safe to ignore.
