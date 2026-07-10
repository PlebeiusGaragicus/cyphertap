// Contract tests for LatestEventTracker — the pure dedup decision behind
// subscribeLatest. Keys follow NDKEvent.deduplicationKey(): `kind:pubkey`
// for replaceable kinds, `kind:pubkey:d` for addressable, event id otherwise.
import { describe, expect, it } from 'vitest';

import { LatestEventTracker } from './latest.js';

describe('LatestEventTracker', () => {
	it('accepts the first event for a key', () => {
		const t = new LatestEventTracker();
		expect(t.accept('30315:abc:general', 100)).toBe(true);
	});

	it('accepts strictly newer events and rejects stale or equal ones', () => {
		const t = new LatestEventTracker();
		expect(t.accept('k', 100)).toBe(true);
		expect(t.accept('k', 99)).toBe(false); // older
		expect(t.accept('k', 100)).toBe(false); // duplicate timestamp
		expect(t.accept('k', 101)).toBe(true); // newer
	});

	it('remembers the newest timestamp even after rejecting stale events', () => {
		const t = new LatestEventTracker();
		expect(t.accept('k', 200)).toBe(true);
		expect(t.accept('k', 150)).toBe(false);
		// A rejection must not lower the high-water mark
		expect(t.accept('k', 180)).toBe(false);
		expect(t.accept('k', 201)).toBe(true);
	});

	it('tracks keys independently (different d tags, pubkeys, kinds)', () => {
		const t = new LatestEventTracker();
		expect(t.accept('30315:alice:general', 100)).toBe(true);
		expect(t.accept('30315:alice:music', 50)).toBe(true); // other d tag
		expect(t.accept('30315:bob:general', 50)).toBe(true); // other author
		expect(t.accept('0:alice', 50)).toBe(true); // other kind
		expect(t.accept('30315:alice:general', 100)).toBe(false);
	});

	it('handles out-of-order delivery, keeping only the newest per key', () => {
		const t = new LatestEventTracker();
		const decisions = [300, 100, 200, 400, 350].map((ts) => t.accept('k', ts));
		expect(decisions).toEqual([true, false, false, true, false]);
	});
});
