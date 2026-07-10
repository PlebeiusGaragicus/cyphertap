// src/lib/utils/nip19.ts
//
// Minimal NIP-19 helpers for the public-key entities consumer apps meet in
// note content and user input: npub (bare pubkey) and nprofile (pubkey +
// relay hints, TLV-encoded). Deliberately NOT a full nip19 codec — no nsec
// (keys shouldn't travel through app code), no nevent/naddr (add when an
// app needs them).
import { bech32 } from '@scure/base';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';

const Bech32MaxSize = 5000;

/** Encode a hex pubkey as an npub. Throws on malformed input. */
export function hexToNpub(pubkeyHex: string): string {
	if (!/^[0-9a-f]{64}$/i.test(pubkeyHex)) {
		throw new Error('Invalid pubkey: expected 64 hex characters');
	}
	return bech32.encode('npub', bech32.toWords(hexToBytes(pubkeyHex.toLowerCase())), Bech32MaxSize);
}

/**
 * Decode an npub or nprofile (with or without a `nostr:` URI prefix) to a
 * hex pubkey. Throws on anything else — including nsec, deliberately.
 */
export function npubToHex(entity: string): string {
	const bare = entity.startsWith('nostr:') ? entity.slice(6) : entity;
	if (!bare.includes('1')) {
		throw new Error('Invalid entity: not a bech32 string');
	}
	const { prefix, words } = bech32.decode(bare as `${string}1${string}`, Bech32MaxSize);
	const data = new Uint8Array(bech32.fromWords(words));

	if (prefix === 'npub') {
		if (data.length !== 32) throw new Error('Invalid npub: expected 32 bytes');
		return bytesToHex(data);
	}

	if (prefix === 'nprofile') {
		// TLV: type 0 (special) holds the 32-byte pubkey
		let i = 0;
		while (i + 2 <= data.length) {
			const type = data[i];
			const length = data[i + 1];
			const value = data.slice(i + 2, i + 2 + length);
			if (type === 0) {
				if (value.length !== 32) throw new Error('Invalid nprofile: pubkey TLV not 32 bytes');
				return bytesToHex(value);
			}
			i += 2 + length;
		}
		throw new Error('Invalid nprofile: no pubkey TLV');
	}

	throw new Error(`Unsupported entity prefix '${prefix}' (expected npub or nprofile)`);
}
