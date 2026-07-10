// src/lib/stores/config.ts
//
// Library configuration. Plain module state, not a Svelte store: the values
// are read once per login (NDK construction / wallet creation), so there is
// nothing to react to, and a plain module keeps this import-cycle-free.
// IMPORTANT: this module must not import from nostr.ts or wallet.ts — they
// import from here.

export interface CyphertapConfig {
	/** Relays NDK connects to on login. */
	relays: string[];
	/** Mints used when creating a NEW NIP-60 wallet. An existing wallet keeps
	 * the mint list stored in its own wallet event. */
	mints: string[];
}

// Overridable at build time by the consuming Vite app (e.g. to point at a
// local mint during development). The consumer's Vite build performs the
// substitution. Layering: configure()/props > VITE env > hardcoded default.
//
// SAFETY: the default mint is a Cashu TEST mint — unbacked fake
// ecash, fake Lightning backend (invoices auto-settle). No real funds can
// flow until this is deliberately changed (decision: test-only until the
// stack is thoroughly exercised). The default relay is our own whitelisted
// strfry (see nostr-ecash-ecosystem .test-accounts.json for accounts it
// accepts; unknown pubkeys are rejected with "blocked: pubkey not on
// whitelist").
const defaults: CyphertapConfig = {
	relays: ['wss://relay.abvstudio.net'],
	// nofee.testnut over testnut.cashu.space: the latter runs bleeding-edge
	// cdk-mintd with v2 keyset IDs ('01…') that cashu-ts 2.9 can't verify.
	mints: [import.meta.env.VITE_CASHU_MINT_URL || 'https://nofee.testnut.cashu.space']
};

const config: CyphertapConfig = { ...defaults, relays: [...defaults.relays], mints: [...defaults.mints] };

let consumed = false;

/**
 * Override library defaults. Call before mounting <Cyphertap/> (the component
 * calls this for you when given `relays`/`mints` props). Empty arrays are
 * ignored. Calling after login has initialized NDK only affects the NEXT
 * login (logout discards the NDK instance).
 */
export function configure(partial: Partial<CyphertapConfig>): void {
	if (partial.relays?.length) config.relays = [...partial.relays];
	if (partial.mints?.length) config.mints = [...partial.mints];
	if (consumed) {
		console.warn(
			'[CypherTap] configure() called after login initialized NDK — new values apply on next login'
		);
	}
}

export function getConfig(): Readonly<CyphertapConfig> {
	return config;
}

/** Internal: called by initNDK so late configure() calls can warn. */
export function markConfigConsumed(): void {
	consumed = true;
}
