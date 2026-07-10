// src/lib/index.ts
// Main component
import './styles.css';
export { default as Cyphertap } from '$lib/components/cyphertap/cyphertap.svelte';

// Programmatic API
export {
	cyphertap,
	type SimpleNostrEvent,
	type SimpleNostrFilter
} from '$lib/api/cyphertap-api.svelte.js';

// Power-user escape hatch: the raw NDKSvelte instance. Throws before login;
// its API is coupled to the library's NDK version — prefer the cyphertap API.
export { getNDK } from '$lib/stores/nostr.js';

// Library configuration (relays/mints) — call before mounting <Cyphertap/>,
// or pass the equivalent component props
export { configure, type CyphertapConfig } from '$lib/stores/config.js';

// Navigation state (for external control of the popover)
export { isUserMenuOpen } from '$lib/stores/navigation.js';

// // Utility functions
// export { identifyScanType } from '$lib/stores/scan-store.js';
// export { formatTransactionDescription } from '$lib/utils/tx.js';

// // Types (if needed for consumers)
// export type { ScanResult, ScanResultType } from '$lib/stores/scan-store.js';