// src/lib/api/cyphertap-api.svelte.ts
import {
  type CashuPaymentInfo,
  type NDKFilter,
  type NDKRawEvent,
  type NDKSubscription,
  type NDKZapDetails,
  NDKEvent,
  NDKPublishError,
  NDKRelaySet,
  NDKSubscriptionCacheUsage,
  giftUnwrap,
  giftWrap
} from '@nostr-dev-kit/ndk';
import type NDKSvelte from '@nostr-dev-kit/ndk-svelte';
import { getEncodedTokenV4 } from '@cashu/cashu-ts';

// Import existing stores directly
import {
  ndkInstance,
  currentUser,
  relayConnectionStatus
} from '../stores/nostr.js';
import {
  wallet,
  walletBalance,
  isWalletReady
} from '../stores/wallet.js';
import { LatestEventTracker } from '../utils/latest.js';
import { get, derived } from 'svelte/store';

/** Plain-object shape delivered to subscription callbacks. */
export interface SimpleNostrEvent {
  id: string;
  pubkey: string;
  content: string;
  kind: number;
  created_at: number;
  tags: string[][];
  sig: string;
  /** URL of the relay this event was first received from (undefined when
   * served purely from the local cache or constructed locally). */
  relay?: string;
}

/**
 * Plain-number filter accepted by subscribe/subscribeLatest, so consumers
 * can use any kind (e.g. 30315) without importing NDK's NDKKind enum.
 */
export type SimpleNostrFilter = {
  ids?: string[];
  kinds?: number[];
  authors?: string[];
  since?: number;
  until?: number;
  limit?: number;
  search?: string;
} & { [key: `#${string}`]: string[] | undefined };

/** Dedicated NIP-65 relay-list index relays, queried when the pool doesn't
 * have a user's kind 10002. */
const RELAY_LIST_INDEXERS = ['wss://purplepag.es'];

function toSimpleEvent(event: NDKEvent): SimpleNostrEvent {
  return {
    id: event.id || '',
    pubkey: event.pubkey || '',
    content: event.content || '',
    kind: event.kind || 0,
    created_at: event.created_at || 0,
    tags: event.tags || [],
    sig: event.sig || '',
    relay: event.relay?.url
  };
}

/** Resolve a relay-targeting option into an NDKRelaySet: undefined = the
 * configured pool; `relays` = pool ∪ relays; `relays` + `exclusive` = the
 * given relays ONLY. */
function buildRelaySet(
  ndk: NDKSvelte,
  opts?: { relays?: string[]; exclusive?: boolean }
): NDKRelaySet | undefined {
  if (!opts?.relays?.length) return undefined;
  const urls = opts.exclusive
    ? new Set(opts.relays)
    : new Set([...ndk.pool.relays.keys(), ...opts.relays]);
  return NDKRelaySet.fromRelayUrls([...urls], ndk);
}

export class CyphertapAPI {
  private static instance: CyphertapAPI | null = null;

  // Create derived stores for reactive state
  private _isLoggedIn = derived(
    [currentUser, ndkInstance], 
    ([$currentUser, $ndkInstance]) => Boolean($currentUser && $ndkInstance)
  );
  
  private _isReady = derived(
    [ndkInstance, currentUser, wallet, isWalletReady], 
    ([$ndkInstance, $currentUser, $wallet, $isWalletReady]) => 
      Boolean($ndkInstance && $currentUser && $wallet && $isWalletReady)
  );
  
  private _npub = derived(
    [currentUser], 
    ([$currentUser]) => $currentUser?.npub || null
  );

  // Reactive state using runes that subscribe to derived stores
  #isLoggedIn = $state(false);
  #isReady = $state(false);
  #balance = $state(0);
  #npub = $state<string | null>(null);

  constructor() {
    // Subscribe to derived stores and update runes
    this._isLoggedIn.subscribe(value => {
      this.#isLoggedIn = value;
    });

    this._isReady.subscribe(value => {
      this.#isReady = value;
    });

    walletBalance.subscribe(value => {
      this.#balance = value;
    });

    this._npub.subscribe(value => {
      this.#npub = value;
    });
  }

  // Public reactive getters
  get isLoggedIn() { 
    return this.#isLoggedIn;
  }
  
  get isReady() { 
    return this.#isReady;
  }
  
  get balance() { 
    return this.#balance;
  }
  
  get npub() { 
    return this.#npub;
  }

  static getInstance(): CyphertapAPI {
    if (!CyphertapAPI.instance) {
      CyphertapAPI.instance = new CyphertapAPI();
    }
    return CyphertapAPI.instance;
  }

  // Public API methods

  // User info
  getUserNpub(): string | null {
    return get(currentUser)?.npub || null;
  }

  getUserHex(): string | null {
    return get(currentUser)?.pubkey || null;
  }

  // Lightning operations
  async createLightningInvoice(amount: number, description = ''): Promise<{ bolt11: string}> {
    const currentWallet = get(wallet);
    if (!currentWallet) throw new Error('Wallet not initialized');
    
    try {
      const deposit = currentWallet.deposit(amount);
      const bolt11 = await deposit.start();
      return { 
        bolt11 
        // paymentHash: deposit.id || '' 
      };
    } catch (error) {
      throw new Error(`Invoice creation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async sendLightningPayment(bolt11: string): Promise<{ success: boolean; preimage?: string }> {
    const currentWallet = get(wallet);
    if (!currentWallet) throw new Error('Wallet not initialized');
    
    try {
      const result = await currentWallet.lnPay({ pr: bolt11 }, true);
      return { success: true, preimage: result?.preimage };
    } catch (error) {
      throw new Error(`Payment failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Ecash operations
  async generateEcashToken(amount: number, memo = ''): Promise<{ token: string; mint?: string }> {
    const currentWallet = get(wallet);
    if (!currentWallet) throw new Error('Wallet not initialized');
    
    try {
      // cashuPay's type demands zap fields (target/recipientPubkey), but at
      // runtime it only reads amount/unit/mints/p2pk — we're minting a plain
      // token, not zapping, so those fields don't apply.
      const paymentInfo = {
        amount,
        unit: 'sat' as const,
        paymentDescription: memo || `${amount} sats token`
      } as NDKZapDetails<CashuPaymentInfo>;
      const result = await currentWallet.cashuPay(paymentInfo);
      if (!result?.mint || !result.proofs?.length) {
        throw new Error('No proofs returned by wallet');
      }
      const token = getEncodedTokenV4({
        mint: result.mint,
        proofs: result.proofs,
        memo
      });
      return { token, mint: result.mint };
    } catch (error) {
      throw new Error(`Token generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async receiveEcashToken(token: string): Promise<{ success: boolean; amount: number }> {
    const currentWallet = get(wallet);
    if (!currentWallet) throw new Error('Wallet not initialized');
    
    try {
      const result = await currentWallet.receiveToken(token, 'Received via API');
      return { 
        success: true, 
        amount: result?.amount || 0 
      };
    } catch (error) {
      throw new Error(`Token receive failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Publish, tolerating relay-confirmation failures only. NDK throws
  // NDKPublishError when fewer than the required relays confirm, but by then
  // the event is signed and queued in the cache adapter for retry — so we log
  // and move on. Anything else (no signer, invalid event) is a real failure.
  private async publishWithRetryTolerance(ndkEvent: NDKEvent, relaySet?: NDKRelaySet): Promise<void> {
    try {
      await ndkEvent.publish(relaySet);
    } catch (error) {
      if (error instanceof NDKPublishError) {
        console.warn(
          `[CypherTap] Event ${ndkEvent.id} not confirmed by enough relays (published to ${error.publishedToRelays.size}), cached for retry`
        );
        return;
      }
      throw error;
    }
  }

  // Nostr operations
  async publishTextNote(content: string): Promise<{ id: string; pubkey: string }> {
    const ndk = get(ndkInstance);
    if (!ndk) throw new Error('NDK not initialized');

    const event = new NDKEvent(ndk, {
      kind: 1,
      content,
    });
    await this.publishWithRetryTolerance(event);

    return {
      id: event.id || '',
      pubkey: event.pubkey || ''
    };
  }

  /**
   * Publish an event. `opts.relays` adds explicit relay URLs on top of the
   * configured pool — e.g. routing a reply to the relay the parent note was
   * seen on, so the recipient actually finds it. `opts.exclusive` publishes
   * to `opts.relays` ONLY, skipping the pool — for app-specific event kinds
   * that must never leave their dedicated relay.
   */
  async publishEvent(
    event: Partial<NDKRawEvent>,
    opts?: { relays?: string[]; exclusive?: boolean }
  ): Promise<{ id: string; pubkey: string }> {
    const ndk = get(ndkInstance);
    if (!ndk) throw new Error('NDK not initialized');

    const relaySet = buildRelaySet(ndk, opts);
    const ndkEvent = new NDKEvent(ndk, event);
    await this.publishWithRetryTolerance(ndkEvent, relaySet);

    return {
      id: ndkEvent.id || '',
      pubkey: ndkEvent.pubkey || ''
    };
  }

  /**
   * Publish an addressable (parameterized replaceable) event — kind 3xxxx
   * with a d tag, e.g. a NIP-38 user status (kind 30315, d "general").
   * Relays replace the previous event with the same kind+pubkey+d.
   */
  async publishAddressable(
    kind: number,
    dTag: string,
    content: string,
    tags: string[][] = []
  ): Promise<{ id: string; pubkey: string }> {
    return this.publishEvent({
      kind,
      content,
      tags: [['d', dTag], ...tags]
    });
  }

  /**
   * NIP-65 relay list (kind 10002) for a pubkey: where they write their
   * events and where they read mentions. Per the NIP, replies/mentions
   * should be published to the tagged user's READ relays. Falls back to
   * dedicated relay-list indexers when the configured pool doesn't have
   * the list. Returns empty lists when the user never published one.
   */
  async getRelayList(pubkey: string): Promise<{ read: string[]; write: string[] }> {
    const ndk = get(ndkInstance);
    if (!ndk) throw new Error('NDK not initialized');

    const filter: NDKFilter = { kinds: [10002], authors: [pubkey] };
    const opts = {
      closeOnEose: true,
      groupable: false,
      cacheUsage: NDKSubscriptionCacheUsage.PARALLEL
    };

    let events = await ndk.fetchEvents(filter, opts);
    if (!events.size) {
      const indexers = NDKRelaySet.fromRelayUrls(RELAY_LIST_INDEXERS, ndk);
      events = await ndk.fetchEvents(filter, opts, indexers);
    }
    // kind 10002 is replaceable, but different relays can serve different
    // versions — use the newest
    const latest = [...events].sort((a, b) => (b.created_at || 0) - (a.created_at || 0))[0];
    const read: string[] = [];
    const write: string[] = [];
    for (const tag of latest?.tags ?? []) {
      if (tag[0] !== 'r' || !/^wss?:\/\//.test(tag[1] || '')) continue;
      const url = tag[1].replace(/\/+$/, '');
      const marker = tag[2];
      if (marker !== 'write' && !read.includes(url)) read.push(url);
      if (marker !== 'read' && !write.includes(url)) write.push(url);
    }
    return { read, write };
  }

  /**
   * Pubkeys (hex) from the logged-in user's contact list (kind 3).
   */
  async getFollows(): Promise<string[]> {
    const user = get(currentUser);
    if (!user) throw new Error('Not logged in');

    const follows = await user.followSet({ closeOnEose: true });
    return [...follows];
  }

  /**
   * One-shot fetch: query the local cache AND relays in parallel, resolve on
   * EOSE with the matching events newest-first. Cache and relays must both be
   * consulted — NDK's CACHE_FIRST default can satisfy paginated queries from
   * a partial cache and never ask the network. For live updates use
   * subscribe/subscribeLatest instead. `opts.relays` queries those relays
   * ONLY instead of the configured pool — for app-specific event kinds that
   * live on a dedicated relay.
   */
  async fetchEvents(
    filter: SimpleNostrFilter,
    opts?: { relays?: string[] }
  ): Promise<SimpleNostrEvent[]> {
    const ndk = get(ndkInstance);
    if (!ndk) throw new Error('NDK not initialized');

    const events = await ndk.fetchEvents(
      filter as NDKFilter,
      {
        closeOnEose: true,
        groupable: false,
        cacheUsage: NDKSubscriptionCacheUsage.PARALLEL
      },
      buildRelaySet(ndk, { relays: opts?.relays, exclusive: true })
    );
    return [...events].map(toSimpleEvent).sort((a, b) => b.created_at - a.created_at);
  }

  subscribe(filter: SimpleNostrFilter, callback: (event: SimpleNostrEvent) => void): () => void {
    const ndk = get(ndkInstance);
    if (!ndk) throw new Error('NDK not initialized');

    const subscription = ndk.subscribe(filter as NDKFilter);
    subscription.on('event', (event: NDKEvent) => {
      callback(toSimpleEvent(event));
    });

    return () => subscription.stop();
  }

  /**
   * Like subscribe, but for replaceable/addressable events: the callback only
   * fires for the newest version per deduplication key (kind:pubkey, plus the
   * d tag for addressable kinds), so stale copies served by relays are
   * ignored. Falls back to per-event-id dedup for regular events.
   */
  subscribeLatest(filter: SimpleNostrFilter, callback: (event: SimpleNostrEvent) => void): () => void {
    const ndk = get(ndkInstance);
    if (!ndk) throw new Error('NDK not initialized');

    const latest = new LatestEventTracker();
    const subscription = ndk.subscribe(filter as NDKFilter, { closeOnEose: false, groupable: false });
    subscription.on('event', (event: NDKEvent) => {
      if (!latest.accept(event.deduplicationKey(), event.created_at || 0)) return;
      callback(toSimpleEvent(event));
    });

    return () => subscription.stop();
  }

  /**
   * NIP-59: seal `rumor` (signed by the logged-in key, provable to the
   * recipient only), wrap it with an ephemeral key (kind 1059, randomized
   * created_at — backdated up to ~28h), and publish. The rumor stays
   * unsigned inside the wrap; its kind/tags/content are caller-defined.
   * `opts.relays` adds explicit relay URLs on top of the configured pool;
   * `opts.exclusive` publishes to `opts.relays` ONLY (see publishEvent).
   */
  async giftWrapAndPublish(
    rumor: Partial<SimpleNostrEvent>,
    recipientHex: string,
    opts?: { relays?: string[]; exclusive?: boolean }
  ): Promise<{ id: string }> {
    const ndk = get(ndkInstance);
    if (!ndk) throw new Error('NDK not initialized');
    if (!ndk.signer) throw new Error('Signer not available');

    const sender = get(currentUser);
    if (!sender) throw new Error('Not logged in');

    const event = new NDKEvent(ndk, {
      kind: rumor.kind,
      content: rumor.content ?? '',
      tags: rumor.tags ?? [],
      created_at: rumor.created_at ?? Math.floor(Date.now() / 1000),
      // giftUnwrap validates rumor.pubkey === seal.pubkey — the rumor must
      // carry the sender even though it is never signed.
      pubkey: sender.pubkey
    } as NDKRawEvent);

    const recipient = ndk.getUser({ pubkey: recipientHex });
    const wrap = await giftWrap(event, recipient, ndk.signer);

    await this.publishWithRetryTolerance(wrap, buildRelaySet(ndk, opts));

    return { id: wrap.id || '' };
  }

  /**
   * NIP-59: unwrap a kind-1059 gift wrap addressed to the logged-in key and
   * return the inner rumor (sig is empty — rumors are unsigned; authorship
   * is the verified seal signature). Returns null when the wrap isn't for
   * us or is malformed — callers iterate relay results without try/catch.
   */
  async unwrapGiftWrap(event: SimpleNostrEvent): Promise<SimpleNostrEvent | null> {
    const ndk = get(ndkInstance);
    if (!ndk?.signer) throw new Error('Signer not available');

    try {
      const wrap = new NDKEvent(ndk, event as NDKRawEvent);
      // The signer must be passed explicitly: giftUnwrap's internal
      // fallback dereferences the parameter, not the fallback variable.
      const rumor = await giftUnwrap(wrap, undefined, ndk.signer);
      return toSimpleEvent(rumor);
    } catch {
      // giftUnwrap rejects with a plain string on any decrypt/validation
      // failure — treat every shape of failure as "not ours".
      return null;
    }
  }

  async signEvent(event: Partial<NDKRawEvent>): Promise<{ id: string; pubkey: string; signature: string }> {
    const ndk = get(ndkInstance);
    if (!ndk) throw new Error('NDK not initialized');
    
    const ndkEvent = new NDKEvent(ndk, event);
    await ndkEvent.sign();

    return {
      id: ndkEvent.id || '',
      pubkey: ndkEvent.pubkey || '',
      signature: ndkEvent.sig || ''
    };
  }

  // Encryption/Decryption (NIP-44)
  async encrypt(content: string, recipientPubkey: string): Promise<string> {
    const ndk = get(ndkInstance);
    if (!ndk?.signer) {
      throw new Error('Signer not available');
    }
    const recipient = ndk.getUser({ pubkey: recipientPubkey });
    return await ndk.signer.encrypt(recipient, content, 'nip44');
  }

  async decrypt(encryptedContent: string, senderPubkey: string): Promise<string> {
    const ndk = get(ndkInstance);
    if (!ndk?.signer) {
      throw new Error('Signer not available');
    }
    const sender = ndk.getUser({ pubkey: senderPubkey });
    return await ndk.signer.decrypt(sender, encryptedContent, 'nip44');
  }

  // Utility methods
  getConnectionStatus(): { connected: number; total: number } {
    const status = get(relayConnectionStatus);
    const connected = status.filter(relay => relay.connected).length;
    return { connected, total: status.length };
  }
}

// Export singleton instance
export const cyphertap = CyphertapAPI.getInstance();