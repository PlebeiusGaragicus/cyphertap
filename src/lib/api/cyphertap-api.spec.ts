// Contract tests for the public CyphertapAPI surface. State is injected
// through the real stores (see test-helpers.ts); signing/encryption run real
// crypto against a generated key, never touching the network. The singleton's
// rune-backed getters are intentionally untested here — no reactivity
// flushing in the node project.
import { getDecodedToken } from '@cashu/cashu-ts';
import { NDKEvent, NDKPublishError, type NDKRelay } from '@nostr-dev-kit/ndk';
import type { NDKUser } from '@nostr-dev-kit/ndk';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { currentUser } from '../stores/nostr.js';
import { cyphertap } from './cyphertap-api.svelte.js';
import {
	fakeNostrEvent,
	fakeSubscribe,
	injectFakeWallet,
	injectSignedInNDK,
	resetStores
} from './test-helpers.js';

afterEach(() => {
	resetStores();
	vi.restoreAllMocks();
});

describe('uninitialized guards', () => {
	it('publish/subscribe/sign/encrypt throw before login', async () => {
		await expect(cyphertap.publishEvent({ kind: 1, content: 'x' })).rejects.toThrow(
			'NDK not initialized'
		);
		expect(() => cyphertap.subscribe({ kinds: [1] }, () => {})).toThrow('NDK not initialized');
		expect(() => cyphertap.subscribeLatest({ kinds: [1] }, () => {})).toThrow(
			'NDK not initialized'
		);
		await expect(cyphertap.signEvent({ kind: 1, content: 'x' })).rejects.toThrow(
			'NDK not initialized'
		);
		await expect(cyphertap.encrypt('hi', 'ab'.repeat(32))).rejects.toThrow('Signer not available');
		await expect(cyphertap.getFollows()).rejects.toThrow('Not logged in');
	});

	it('wallet operations throw without a wallet', async () => {
		await expect(cyphertap.generateEcashToken(21)).rejects.toThrow('Wallet not initialized');
		await expect(cyphertap.sendLightningPayment('lnbc1...')).rejects.toThrow(
			'Wallet not initialized'
		);
	});
});

describe('signEvent (real crypto)', () => {
	it('signs with the injected key and returns id/pubkey/signature', async () => {
		const { pubkey } = await injectSignedInNDK();
		const result = await cyphertap.signEvent({ kind: 1, content: 'hello nostr' });
		expect(result.pubkey).toBe(pubkey);
		expect(result.id).toMatch(/^[0-9a-f]{64}$/);
		expect(result.signature).toMatch(/^[0-9a-f]{128}$/);
	});
});

describe('encrypt/decrypt (real NIP-44 round-trip)', () => {
	it('round-trips content encrypted to self', async () => {
		const { pubkey } = await injectSignedInNDK();
		const ciphertext = await cyphertap.encrypt('nutzap season', pubkey);
		expect(ciphertext).not.toContain('nutzap season');
		await expect(cyphertap.decrypt(ciphertext, pubkey)).resolves.toBe('nutzap season');
	});
});

describe('publish error tolerance', () => {
	it('resolves and warns when NDKPublishError says too few relays confirmed', async () => {
		await injectSignedInNDK();
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		vi.spyOn(NDKEvent.prototype, 'publish').mockRejectedValue(
			new NDKPublishError('Not enough relays', new Map(), new Set<NDKRelay>())
		);
		await expect(cyphertap.publishEvent({ kind: 1, content: 'x' })).resolves.toMatchObject({
			pubkey: expect.any(String)
		});
		expect(warn).toHaveBeenCalledOnce();
	});

	it('rethrows anything that is not an NDKPublishError', async () => {
		await injectSignedInNDK();
		vi.spyOn(NDKEvent.prototype, 'publish').mockRejectedValue(new Error('no signer'));
		await expect(cyphertap.publishEvent({ kind: 1, content: 'x' })).rejects.toThrow('no signer');
	});
});

describe('publishAddressable', () => {
	it('prepends the d tag and publishes once', async () => {
		const { pubkey } = await injectSignedInNDK();
		let published: NDKEvent | undefined;
		const publish = vi
			.spyOn(NDKEvent.prototype, 'publish')
			.mockImplementation(async function (this: NDKEvent) {
				published = this;
				await this.sign();
				return new Set<NDKRelay>();
			});

		const result = await cyphertap.publishAddressable(30315, 'general', 'shipping cyphertap', [
			['expiration', '1234567890']
		]);

		expect(publish).toHaveBeenCalledOnce();
		expect(published?.kind).toBe(30315);
		expect(published?.content).toBe('shipping cyphertap');
		expect(published?.tags[0]).toEqual(['d', 'general']);
		expect(published?.tags).toContainEqual(['expiration', '1234567890']);
		expect(result.pubkey).toBe(pubkey);
		expect(result.id).toMatch(/^[0-9a-f]{64}$/);
	});
});

describe('getFollows', () => {
	it('returns the follow set as a hex array', async () => {
		const follows = new Set(['aa'.repeat(32), 'bb'.repeat(32)]);
		currentUser.set({
			followSet: async () => follows
		} as unknown as NDKUser);
		await expect(cyphertap.getFollows()).resolves.toEqual([...follows]);
	});
});

describe('subscribeLatest', () => {
	it('keeps a long-lived, ungrouped subscription and stops it on unsubscribe', async () => {
		const { ndk } = await injectSignedInNDK();
		const { sub, captured } = fakeSubscribe(ndk);

		const unsubscribe = cyphertap.subscribeLatest({ kinds: [30315], '#d': ['general'] }, () => {});

		expect(captured.filter).toEqual({ kinds: [30315], '#d': ['general'] });
		expect(captured.opts).toMatchObject({ closeOnEose: false, groupable: false });
		expect(sub.stopped).toBe(false);
		unsubscribe();
		expect(sub.stopped).toBe(true);
	});

	it('delivers only the newest version per author+d, ignoring stale relays', async () => {
		const { ndk } = await injectSignedInNDK();
		const { sub } = fakeSubscribe(ndk);
		const seen: Array<{ pubkey: string; content: string }> = [];
		cyphertap.subscribeLatest({ kinds: [30315] }, (e) =>
			seen.push({ pubkey: e.pubkey, content: e.content })
		);

		const alice = 'aa'.repeat(32);
		const bob = 'bb'.repeat(32);
		// newest first, then a stale copy from a lagging relay, then a genuine update
		sub.emit(fakeNostrEvent({ kind: 30315, pubkey: alice, dTag: 'general', content: 'v2', created_at: 200 }));
		sub.emit(fakeNostrEvent({ kind: 30315, pubkey: alice, dTag: 'general', content: 'v1', created_at: 100 }));
		sub.emit(fakeNostrEvent({ kind: 30315, pubkey: bob, dTag: 'general', content: 'bob', created_at: 50 }));
		sub.emit(fakeNostrEvent({ kind: 30315, pubkey: alice, dTag: 'music', content: 'song', created_at: 10 }));
		sub.emit(fakeNostrEvent({ kind: 30315, pubkey: alice, dTag: 'general', content: 'v3', created_at: 300 }));

		expect(seen).toEqual([
			{ pubkey: alice, content: 'v2' },
			{ pubkey: bob, content: 'bob' },
			{ pubkey: alice, content: 'song' },
			{ pubkey: alice, content: 'v3' }
		]);
	});

	it('dedups regular events by id', async () => {
		const { ndk } = await injectSignedInNDK();
		const { sub } = fakeSubscribe(ndk);
		const seen: string[] = [];
		cyphertap.subscribeLatest({ kinds: [1] }, (e) => seen.push(e.id));

		const note = fakeNostrEvent({ kind: 1, id: 'f0'.repeat(32), content: 'gm', created_at: 100 });
		sub.emit(note);
		sub.emit(note); // same event from a second relay
		expect(seen).toEqual(['f0'.repeat(32)]);
	});
});

describe('generateEcashToken', () => {
	it('throws when the wallet returns no proofs', async () => {
		injectFakeWallet({
			cashuPay: async () => ({ mint: 'https://mint.example.com', proofs: [] })
		});
		await expect(cyphertap.generateEcashToken(21)).rejects.toThrow('No proofs returned');
	});

	it('encodes returned proofs into a decodable cashuB token', async () => {
		const proofs = [
			{
				id: '00ad268c4d1f5826',
				amount: 21,
				secret: 'test-secret-string',
				C: '02' + 'cd'.repeat(32)
			}
		];
		injectFakeWallet({
			cashuPay: async () => ({ mint: 'https://mint.example.com', proofs })
		});

		const { token, mint } = await cyphertap.generateEcashToken(21, 'coffee');
		expect(mint).toBe('https://mint.example.com');
		expect(token).toMatch(/^cashuB/);

		const decoded = getDecodedToken(token);
		expect(decoded.mint).toBe('https://mint.example.com');
		expect(decoded.memo).toBe('coffee');
		expect(decoded.proofs).toHaveLength(1);
		expect(decoded.proofs[0].amount).toBe(21);
		expect(decoded.proofs[0].secret).toBe('test-secret-string');
	});
});
