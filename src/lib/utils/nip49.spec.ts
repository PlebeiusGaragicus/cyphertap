// NIP-49 (ncryptsec) tests against the official spec vectors plus
// round-trip/tamper cases. Fast cases use logn=4; the official vector
// requires the real logn=16 scrypt (64 MiB, ~100ms).
import { bech32 } from '@scure/base';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { NDKPrivateKeySigner } from '@nostr-dev-kit/ndk';
import { describe, expect, it } from 'vitest';

import { decrypt, decryptToSigner, encrypt, encryptSigner } from './nip49.js';

// Official NIP-49 test vector (nips/49.md "Test Data")
const SPEC_NCRYPTSEC =
	'ncryptsec1qgg9947rlpvqu76pj5ecreduf9jxhselq2nae2kghhvd5g7dgjtcxfqtd67p9m0w57lspw8gsq6yphnm8623nsl8xn9j4jdzz84zm3frztj3z7s35vpzmqf6ksu8r89qk5z2zxfmu5gv8th8wclt0h4p';
const SPEC_PASSWORD = 'nostr';
const SPEC_PRIVATE_KEY_HEX = '3501454135014541350145413501453fefb02227e449e57cf4d3a3ce05378683';

const KEY = hexToBytes('f7f2f77f98890885462764afb15b68eb5f69979c8046ecb08fad7c0f6ee99d61');

describe('official spec vector', () => {
	it('decrypts the spec ncryptsec with password "nostr" (log_n=16)', () => {
		const decrypted = decrypt(SPEC_NCRYPTSEC, SPEC_PASSWORD);
		expect(bytesToHex(decrypted)).toBe(SPEC_PRIVATE_KEY_HEX);
	});
});

describe('encrypt/decrypt round-trip', () => {
	it('round-trips a private key', () => {
		const ncryptsec = encrypt(KEY, 'correct horse battery staple', 4);
		expect(ncryptsec).toMatch(/^ncryptsec1/);
		expect(decrypt(ncryptsec, 'correct horse battery staple')).toEqual(KEY);
	});

	it('produces a 91-byte payload with the spec layout', () => {
		const ncryptsec = encrypt(KEY, 'pw', 4, 0x01);
		const { prefix, words } = bech32.decode(ncryptsec as `${string}1${string}`, 5000);
		expect(prefix).toBe('ncryptsec');
		const bytes = new Uint8Array(bech32.fromWords(words));
		expect(bytes).toHaveLength(91); // 1 version + 1 logn + 16 salt + 24 nonce + 1 ksb + 48 ciphertext
		expect(bytes[0]).toBe(0x02); // version
		expect(bytes[1]).toBe(4); // logn
		expect(bytes[42]).toBe(0x01); // key security byte
	});

	it('is non-deterministic (random salt and nonce)', () => {
		expect(encrypt(KEY, 'pw', 4)).not.toBe(encrypt(KEY, 'pw', 4));
	});

	it('normalizes passwords to NFKC (spec unicode vector)', () => {
		// U+212B U+2126 U+1E9B U+0323 normalizes to U+00C5 U+03A9 U+1E69
		const unnormalized = 'ÅΩẛ̣';
		const normalized = 'ÅΩṩ';
		expect(unnormalized).not.toBe(normalized);
		const ncryptsec = encrypt(KEY, unnormalized, 4);
		expect(decrypt(ncryptsec, normalized)).toEqual(KEY);
	});
});

describe('failure modes', () => {
	it('rejects a wrong password (Poly1305 auth failure)', () => {
		const ncryptsec = encrypt(KEY, 'right', 4);
		expect(() => decrypt(ncryptsec, 'wrong')).toThrow();
	});

	it('rejects the key security byte being tampered with (it is AAD)', () => {
		const { words } = bech32.decode(encrypt(KEY, 'pw', 4, 0x00) as `${string}1${string}`, 5000);
		const bytes = new Uint8Array(bech32.fromWords(words));
		bytes[42] = 0x01; // flip ksb 0x00 → 0x01
		const tampered = bech32.encode('ncryptsec', bech32.toWords(bytes), 5000);
		expect(() => decrypt(tampered, 'pw')).toThrow();
	});

	it('rejects non-bech32 input, wrong prefix, and wrong version', () => {
		expect(() => decrypt('not bech32 at all', 'pw')).toThrow('not a bech32 string');
		const nsec = bech32.encode('nsec', bech32.toWords(KEY), 5000);
		expect(() => decrypt(nsec, 'pw')).toThrow("expected 'ncryptsec'");
		const { words } = bech32.decode(encrypt(KEY, 'pw', 4) as `${string}1${string}`, 5000);
		const bytes = new Uint8Array(bech32.fromWords(words));
		bytes[0] = 0x01;
		const wrongVersion = bech32.encode('ncryptsec', bech32.toWords(bytes), 5000);
		expect(() => decrypt(wrongVersion, 'pw')).toThrow('expected 0x02');
	});
});

describe('signer helpers', () => {
	it('encryptSigner/decryptToSigner round-trip preserves the identity', async () => {
		const signer = NDKPrivateKeySigner.generate();
		const ncryptsec = encryptSigner(signer, 'device-link-pin');
		const restored = decryptToSigner(ncryptsec, 'device-link-pin');
		expect(restored.privateKey).toBe(signer.privateKey);
		expect((await restored.user()).pubkey).toBe((await signer.user()).pubkey);
	});

	it('encryptSigner throws for a signer without a private key', () => {
		expect(() =>
			encryptSigner({ privateKey: undefined } as unknown as NDKPrivateKeySigner, 'pw')
		).toThrow('does not have a private key');
	});
});
