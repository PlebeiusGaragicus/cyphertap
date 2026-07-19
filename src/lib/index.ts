// src/lib/index.ts
// Main component
import './styles.css';
export { default as Cyphertap } from './components/cyphertap/cyphertap.svelte';

// Programmatic API
export {
	cyphertap,
	type SimpleNostrEvent,
	type SimpleNostrFilter
} from './api/cyphertap-api.svelte.js';

// Power-user escape hatch: the raw NDKSvelte instance. Throws before login;
// its API is coupled to the library's NDK version — prefer the cyphertap API.
export { getNDK } from './stores/nostr.js';

// Headless session API: everything an app needs to own its login/account UI
// without mounting <Cyphertap/> (the widget remains a thin shell over these).
// A headless host must call configure() itself and run autoLogin() once at
// startup — the widget's onMount does both for widget consumers.
export {
	autoLogin,
	generateNewKeypair,
	getLocalPrivateKey,
	logout,
	nip07Login,
	privateKeyLogin
} from './stores/nostr.js';

// Library configuration (relays/mints) — call before mounting <Cyphertap/>,
// or pass the equivalent component props
export { configure, type CyphertapConfig } from './stores/config.js';

// Navigation state (for external control of the popover)
export { isUserMenuOpen } from './stores/navigation.js';

// NIP-19 helpers (npub/nprofile ↔ hex) so apps can handle mentions and
// user input without importing a nostr library
export { hexToNpub, npubToHex } from './utils/nip19.js';

// // Utility functions
// export { identifyScanType } from './stores/scan-store.js';
// export { formatTransactionDescription } from './utils/tx.js';

// // Types (if needed for consumers)
// export type { ScanResult, ScanResultType } from './stores/scan-store.js';