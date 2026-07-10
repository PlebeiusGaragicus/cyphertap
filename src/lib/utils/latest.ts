// src/lib/utils/latest.ts
//
// Pure latest-event tracking for replaceable/addressable subscriptions.
// Relays can serve stale versions of replaceable (kind 0, 3, 1xxxx) and
// addressable (3xxxx) events; a subscription must keep only the newest per
// deduplication key (NDK's NDKEvent.deduplicationKey(): `kind:pubkey` for
// replaceables, `kind:pubkey:d` for addressables, event id otherwise).

export class LatestEventTracker {
	private newest = new Map<string, number>();

	/**
	 * Record an event's dedup key + created_at. Returns true when the event
	 * is strictly newer than anything seen for that key (i.e. the caller
	 * should act on it), false when it is stale or a duplicate.
	 */
	accept(key: string, createdAt: number): boolean {
		const prev = this.newest.get(key);
		if (prev !== undefined && createdAt <= prev) return false;
		this.newest.set(key, createdAt);
		return true;
	}
}
