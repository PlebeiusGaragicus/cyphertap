// Shared fakes for API contract tests. Approach: inject state through the
// real stores (ndkInstance/currentUser/wallet) rather than vi.mock, so the
// module under test runs unmodified. Crypto is real where possible — a real
// NDK with a generated private-key signer signs/encrypts offline; only the
// network edges (subscriptions, wallet backends) are faked.
import NDK, { NDKPrivateKeySigner } from '@nostr-dev-kit/ndk';
import type NDKSvelte from '@nostr-dev-kit/ndk-svelte';
import type { NDKCashuWallet } from '@nostr-dev-kit/ndk-wallet';

import { currentUser, ndkInstance } from '../stores/nostr.js';
import { isWalletReady, wallet, walletBalance } from '../stores/wallet.js';

/** Real NDK + real signer, never connected. Cast to NDKSvelte for the store. */
export async function injectSignedInNDK(): Promise<{ ndk: NDK; pubkey: string }> {
	const signer = NDKPrivateKeySigner.generate();
	const ndk = new NDK({ signer });
	const user = await signer.user();
	ndk.activeUser = user;
	ndkInstance.set(ndk as unknown as NDKSvelte);
	currentUser.set(user);
	return { ndk, pubkey: user.pubkey };
}

export function resetStores(): void {
	ndkInstance.set(null);
	currentUser.set(null);
	wallet.set(undefined);
	walletBalance.set(0);
	isWalletReady.set(false);
}

export function injectFakeWallet(overrides: Partial<NDKCashuWallet>): void {
	wallet.set(overrides as NDKCashuWallet);
}

type EventHandler = (event: unknown) => void;

/** Minimal stand-in for NDKSubscription: on('event', cb) + stop(). */
export class FakeSubscription {
	stopped = false;
	private handlers: EventHandler[] = [];

	on(name: string, handler: EventHandler): void {
		if (name === 'event') this.handlers.push(handler);
	}

	emit(event: unknown): void {
		for (const handler of this.handlers) handler(event);
	}

	stop(): void {
		this.stopped = true;
	}
}

/**
 * Replace the injected NDK's subscribe with a recording fake. Returns the
 * subscription plus the captured filter/options for contract assertions.
 */
export function fakeSubscribe(ndk: NDK): {
	sub: FakeSubscription;
	captured: { filter?: unknown; opts?: Record<string, unknown> };
} {
	const sub = new FakeSubscription();
	const captured: { filter?: unknown; opts?: Record<string, unknown> } = {};
	ndk.subscribe = ((filter: unknown, opts?: Record<string, unknown>) => {
		captured.filter = filter;
		captured.opts = opts;
		return sub;
	}) as unknown as NDK['subscribe'];
	return { sub, captured };
}

/** Plain-object nostr event with a deduplicationKey(), as subscribeLatest sees it. */
export function fakeNostrEvent(fields: {
	id?: string;
	pubkey?: string;
	kind: number;
	content?: string;
	created_at: number;
	dTag?: string;
}) {
	const tags = fields.dTag !== undefined ? [['d', fields.dTag]] : [];
	return {
		id: fields.id ?? `id-${fields.kind}-${fields.created_at}`,
		pubkey: fields.pubkey ?? 'ab'.repeat(32),
		kind: fields.kind,
		content: fields.content ?? '',
		created_at: fields.created_at,
		tags,
		deduplicationKey(): string {
			if (fields.kind >= 30000 && fields.kind < 40000) {
				return `${fields.kind}:${this.pubkey}:${fields.dTag ?? ''}`;
			}
			if (fields.kind === 0 || fields.kind === 3 || (fields.kind >= 10000 && fields.kind < 20000)) {
				return `${fields.kind}:${this.pubkey}`;
			}
			return this.id;
		}
	};
}
