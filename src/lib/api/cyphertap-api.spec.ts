// Contract tests for the public CyphertapAPI surface. State is injected
// through the real stores (see test-helpers.ts); signing/encryption run real
// crypto against a generated key, never touching the network. The singleton's
// rune-backed getters are intentionally untested here — no reactivity
// flushing in the node project.
import { getDecodedToken } from '@cashu/cashu-ts';
import NDK, { NDKEvent, NDKPrivateKeySigner, NDKPublishError, type NDKRelay } from '@nostr-dev-kit/ndk';
import type { NDKUser } from '@nostr-dev-kit/ndk';
import type NDKSvelte from '@nostr-dev-kit/ndk-svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { currentUser, ndkInstance } from '../stores/nostr.js';
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

describe('publishEvent relay targeting', () => {
	it('publishes to the pool plus explicitly requested relays', async () => {
		await injectSignedInNDK();
		let capturedSet: unknown;
		vi.spyOn(NDKEvent.prototype, 'publish').mockImplementation(async function (
			this: NDKEvent,
			relaySet?: unknown
		) {
			capturedSet = relaySet;
			await this.sign();
			return new Set<NDKRelay>();
		});

		await cyphertap.publishEvent(
			{ kind: 1, content: 'targeted' },
			{ relays: ['wss://relay.damus.io'] }
		);
		const urls = [...(capturedSet as { relays: Set<{ url: string }> }).relays].map((r) => r.url);
		expect(urls).toContain('wss://relay.damus.io/');
	});

	it('publishes ONLY to the requested relays when exclusive is set', async () => {
		await injectSignedInNDK();
		let capturedSet: unknown;
		vi.spyOn(NDKEvent.prototype, 'publish').mockImplementation(async function (
			this: NDKEvent,
			relaySet?: unknown
		) {
			capturedSet = relaySet;
			await this.sign();
			return new Set<NDKRelay>();
		});

		await cyphertap.publishEvent(
			{ kind: 1059, content: 'pinned' },
			{ relays: ['wss://relay.abvstudio.net'], exclusive: true }
		);
		const urls = [...(capturedSet as { relays: Set<{ url: string }> }).relays].map((r) => r.url);
		expect(urls).toEqual(['wss://relay.abvstudio.net/']);
	});

	it('publishes to the default pool when no relays are given', async () => {
		await injectSignedInNDK();
		let capturedSet: unknown = 'unset';
		vi.spyOn(NDKEvent.prototype, 'publish').mockImplementation(async function (
			this: NDKEvent,
			relaySet?: unknown
		) {
			capturedSet = relaySet;
			return new Set<NDKRelay>();
		});
		await cyphertap.publishEvent({ kind: 1, content: 'default' });
		expect(capturedSet).toBeUndefined();
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

describe('fetchEvents', () => {
	it('throws before login', async () => {
		await expect(cyphertap.fetchEvents({ kinds: [1] })).rejects.toThrow('NDK not initialized');
	});

	it('one-shot fetches with closeOnEose and returns plain events newest-first', async () => {
		const { ndk } = await injectSignedInNDK();
		const captured: { filter?: unknown; opts?: Record<string, unknown> } = {};
		const raw = [
			fakeNostrEvent({ kind: 1, id: 'a1'.repeat(32), content: 'old', created_at: 100 }),
			fakeNostrEvent({ kind: 1, id: 'b2'.repeat(32), content: 'new', created_at: 300 }),
			fakeNostrEvent({ kind: 1, id: 'c3'.repeat(32), content: 'mid', created_at: 200 })
		];
		ndk.fetchEvents = (async (filter: unknown, opts?: Record<string, unknown>) => {
			captured.filter = filter;
			captured.opts = opts;
			return new Set(raw);
		}) as unknown as typeof ndk.fetchEvents;

		const events = await cyphertap.fetchEvents({ kinds: [1], until: 400 });

		expect(captured.filter).toEqual({ kinds: [1], until: 400 });
		expect(captured.opts).toMatchObject({ closeOnEose: true, groupable: false });
		expect(events.map((e) => e.content)).toEqual(['new', 'mid', 'old']);
		// plain objects, not NDKEvent instances
		expect(events[0]).toEqual({
			id: 'b2'.repeat(32),
			pubkey: 'ab'.repeat(32),
			content: 'new',
			kind: 1,
			created_at: 300,
			tags: [],
			sig: '',
			relay: undefined
		});
	});

	it('queries ONLY the given relays when opts.relays is set, the pool otherwise', async () => {
		const { ndk } = await injectSignedInNDK();
		const relaySets: unknown[] = [];
		ndk.fetchEvents = (async (_f: unknown, _o: unknown, relaySet?: unknown) => {
			relaySets.push(relaySet);
			return new Set();
		}) as unknown as typeof ndk.fetchEvents;

		await cyphertap.fetchEvents({ kinds: [1059] });
		await cyphertap.fetchEvents({ kinds: [1059] }, { relays: ['wss://relay.abvstudio.net'] });

		expect(relaySets[0]).toBeUndefined();
		const urls = [...(relaySets[1] as { relays: Set<{ url: string }> }).relays].map((r) => r.url);
		expect(urls).toEqual(['wss://relay.abvstudio.net/']);
	});
});

describe('getRelayList (NIP-65)', () => {
	const relayListEvent = (created_at: number, tags: string[][]) => ({
		id: 'aa'.repeat(32),
		pubkey: 'bb'.repeat(32),
		kind: 10002,
		content: '',
		created_at,
		tags,
		sig: '',
		relay: undefined
	});

	it('splits r tags into read/write per the marker rules', async () => {
		const { ndk } = await injectSignedInNDK();
		ndk.fetchEvents = (async () =>
			new Set([
				relayListEvent(100, [
					['r', 'wss://both.example.com/'],
					['r', 'wss://writeonly.example.com', 'write'],
					['r', 'wss://readonly.example.com', 'read'],
					['r', 'not-a-url'],
					['p', 'wss://wrong-tag.example.com']
				])
			])) as unknown as typeof ndk.fetchEvents;

		const list = await cyphertap.getRelayList('bb'.repeat(32));
		expect(list.read).toEqual(['wss://both.example.com', 'wss://readonly.example.com']);
		expect(list.write).toEqual(['wss://both.example.com', 'wss://writeonly.example.com']);
	});

	it('uses the newest version when relays disagree', async () => {
		const { ndk } = await injectSignedInNDK();
		ndk.fetchEvents = (async () =>
			new Set([
				relayListEvent(100, [['r', 'wss://old.example.com']]),
				relayListEvent(200, [['r', 'wss://new.example.com']])
			])) as unknown as typeof ndk.fetchEvents;
		const list = await cyphertap.getRelayList('bb'.repeat(32));
		expect(list.read).toEqual(['wss://new.example.com']);
	});

	it('falls back to the relay-list indexers when the pool has nothing', async () => {
		const { ndk } = await injectSignedInNDK();
		const calls: unknown[] = [];
		ndk.fetchEvents = (async (_f: unknown, _o: unknown, relaySet?: unknown) => {
			calls.push(relaySet);
			return calls.length === 1
				? new Set()
				: new Set([relayListEvent(100, [['r', 'wss://indexed.example.com']])]);
		}) as unknown as typeof ndk.fetchEvents;

		const list = await cyphertap.getRelayList('bb'.repeat(32));
		expect(calls).toHaveLength(2);
		expect(calls[0]).toBeUndefined(); // pool first
		const indexerUrls = [...(calls[1] as { relays: Set<{ url: string }> }).relays].map((r) => r.url);
		expect(indexerUrls).toContain('wss://purplepag.es/');
		expect(list.read).toEqual(['wss://indexed.example.com']);
	});

	it('returns empty lists for users without a relay list', async () => {
		const { ndk } = await injectSignedInNDK();
		ndk.fetchEvents = (async () => new Set()) as unknown as typeof ndk.fetchEvents;
		await expect(cyphertap.getRelayList('bb'.repeat(32))).resolves.toEqual({
			read: [],
			write: []
		});
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

describe('gift wrap (NIP-59, real crypto)', () => {
	/** Capture whatever NDKEvent gets published without touching the network. */
	function capturePublish(): { get: () => NDKEvent | undefined } {
		let published: NDKEvent | undefined;
		vi.spyOn(NDKEvent.prototype, 'publish').mockImplementation(async function (this: NDKEvent) {
			published = this;
			return new Set<NDKRelay>();
		});
		return { get: () => published };
	}

	it('throws before login', async () => {
		await expect(
			cyphertap.giftWrapAndPublish({ kind: 1060, content: 'x' }, 'ab'.repeat(32))
		).rejects.toThrow('NDK not initialized');
		await expect(
			cyphertap.unwrapGiftWrap({
				id: '',
				pubkey: '',
				kind: 1059,
				content: '',
				created_at: 0,
				tags: [],
				sig: ''
			})
		).rejects.toThrow('Signer not available');
	});

	it('publishes a kind-1059 wrap signed by an ephemeral key, p-tagged to the recipient', async () => {
		const { pubkey: sender } = await injectSignedInNDK();
		const recipient = await NDKPrivateKeySigner.generate().user();
		const published = capturePublish();

		const { id } = await cyphertap.giftWrapAndPublish(
			{ kind: 1060, content: JSON.stringify({ secret: 'report body' }), tags: [['t', 'bug']] },
			recipient.pubkey
		);

		const wrap = published.get();
		expect(wrap?.kind).toBe(1059);
		expect(wrap?.pubkey).not.toBe(sender); // ephemeral wrap key, not the user's
		expect(wrap?.tagValue('p')).toBe(recipient.pubkey);
		expect(wrap?.content).not.toContain('report body');
		expect(wrap?.created_at).toBeLessThanOrEqual(Math.floor(Date.now() / 1000));
		expect(id).toBe(wrap?.id);
	});

	it('round-trips: the recipient unwraps the rumor, anyone else gets null', async () => {
		const { pubkey: sender } = await injectSignedInNDK();
		const recipientSigner = NDKPrivateKeySigner.generate();
		const recipient = await recipientSigner.user();
		const published = capturePublish();

		await cyphertap.giftWrapAndPublish(
			{ kind: 1060, content: 'secret report', tags: [['t', 'bug']] },
			recipient.pubkey
		);
		const wrap = published.get();
		const wire = {
			id: wrap?.id ?? '',
			pubkey: wrap?.pubkey ?? '',
			kind: 1059,
			content: wrap?.content ?? '',
			created_at: wrap?.created_at ?? 0,
			tags: wrap?.tags ?? [],
			sig: wrap?.sig ?? ''
		};

		// A different logged-in key can't decrypt someone else's wrap.
		resetStores();
		await injectSignedInNDK();
		await expect(cyphertap.unwrapGiftWrap(wire)).resolves.toBeNull();

		// The recipient recovers the rumor: original kind/content/tags, the
		// sender's pubkey, and no signature (rumors are unsigned).
		resetStores();
		const recipientNdk = new NDK({ signer: recipientSigner });
		recipientNdk.activeUser = recipient;
		ndkInstance.set(recipientNdk as unknown as NDKSvelte);
		currentUser.set(recipient);

		const rumor = await cyphertap.unwrapGiftWrap(wire);
		expect(rumor?.kind).toBe(1060);
		expect(rumor?.content).toBe('secret report');
		expect(rumor?.tags).toEqual([['t', 'bug']]);
		expect(rumor?.pubkey).toBe(sender);
		expect(rumor?.sig).toBe('');
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
