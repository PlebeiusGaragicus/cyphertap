// autoLogin idempotence: <Cyphertap> mounts once per appearance of whatever
// chrome hosts it (drawers, sidebars), and each mount calls autoLogin(). With
// a session already live it must be a no-op — re-running login() redoes
// NIP-60 wallet discovery against the relays on every remount (live feedback
// 98b5ed68, 2026-07-16). esm-env is mocked because the node test env reports
// BROWSER=false, which would short-circuit before the guard under test.
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('esm-env', async (importOriginal) => ({
	...(await importOriginal<typeof import('esm-env')>()),
	BROWSER: true
}));

import { injectSignedInNDK, resetStores } from '../api/test-helpers.js';
import { autoLogin } from './nostr.js';

describe('autoLogin', () => {
	afterEach(() => {
		resetStores();
		vi.unstubAllGlobals();
	});

	it('is a no-op when a session is already active', async () => {
		await injectSignedInNDK();
		const getItem = vi.fn();
		vi.stubGlobal('localStorage', { getItem, setItem: vi.fn(), removeItem: vi.fn() });

		await expect(autoLogin()).resolves.toBeNull();
		// The guard must fire before credential lookup — reaching localStorage
		// means the full login pipeline (initWallet's relay queries) would rerun.
		expect(getItem).not.toHaveBeenCalled();
	});

	it('still consults stored credentials when logged out', async () => {
		const getItem = vi.fn().mockReturnValue(null);
		vi.stubGlobal('localStorage', { getItem, setItem: vi.fn(), removeItem: vi.fn() });

		await autoLogin();
		expect(getItem).toHaveBeenCalledWith('ncrypt');
	});
});
