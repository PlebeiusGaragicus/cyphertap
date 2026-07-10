// NIP-19 helper tests against the official spec vectors (nips/19.md).
import { describe, expect, it } from 'vitest';

import { hexToNpub, npubToHex } from './nip19.js';

// Spec: "the hex public key 3bf0c63f… translates to npub180cvv07…"
const SPEC_HEX = '3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d';
const SPEC_NPUB = 'npub180cvv07tjdrrgpa0j7j7tmnyl2yr6yr7l8j4s3evf6u64th6gkwsyjh6w6';

// Spec test-vector section
const VECTOR_NPUB = 'npub10elfcs4fr0l0r8af98jlmgdh9c8tcxjvz9qkw038js35mp4dma8qzvjptg';
const VECTOR_HEX = '7e7e9c42a91bfef19fa929e5fda1b72e0ebc1a4c1141673e2794234d86addf4e';

// Spec nprofile vector: pubkey 3bf0c63f… + two relay TLVs
const VECTOR_NPROFILE =
	'nprofile1qqsrhuxx8l9ex335q7he0f09aej04zpazpl0ne2cgukyawd24mayt8gpp4mhxue69uhhytnc9e3k7mgpz4mhxue69uhkg6nzv9ejuumpv34kytnrdaksjlyr9p';

describe('hexToNpub', () => {
	it('encodes the spec pubkey', () => {
		expect(hexToNpub(SPEC_HEX)).toBe(SPEC_NPUB);
		expect(hexToNpub(VECTOR_HEX)).toBe(VECTOR_NPUB);
	});

	it('rejects non-pubkey input', () => {
		expect(() => hexToNpub('abc123')).toThrow('64 hex characters');
		expect(() => hexToNpub('zz'.repeat(32))).toThrow('64 hex characters');
	});
});

describe('npubToHex', () => {
	it('decodes the spec npubs (vice-versa direction)', () => {
		expect(npubToHex(SPEC_NPUB)).toBe(SPEC_HEX);
		expect(npubToHex(VECTOR_NPUB)).toBe(VECTOR_HEX);
	});

	it('decodes the spec nprofile to its pubkey TLV', () => {
		expect(npubToHex(VECTOR_NPROFILE)).toBe(SPEC_HEX);
	});

	it('accepts nostr: URI prefixes', () => {
		expect(npubToHex(`nostr:${SPEC_NPUB}`)).toBe(SPEC_HEX);
		expect(npubToHex(`nostr:${VECTOR_NPROFILE}`)).toBe(SPEC_HEX);
	});

	it('rejects nsec and other entities', () => {
		const specNsec = 'nsec1vl029mgpspedva04g90vltkh6fvh240zqtv9k0t9af8935ke9laqsnlfe5';
		expect(() => npubToHex(specNsec)).toThrow("Unsupported entity prefix 'nsec'");
		expect(() => npubToHex('hello world')).toThrow();
	});
});
