# CypherTap

**Nostr, Lightning & Ecash in a Single Svelte Component**

Stop reinventing the wheel for every Nostr app. CypherTap gives you a complete authentication and payment solution with both a ready-to-use UI component and a comprehensive programmatic API - drop it in your Svelte app and you're done.

> This is a maintained fork of [cypherflow/cyphertap](https://github.com/cypherflow/cyphertap).
> It is **not published to npm** — apps embed it as a git submodule or workspace
> package and consume it from source. See [docs/CONSUMING.md](docs/CONSUMING.md).
> Theming: [docs/THEMING.md](docs/THEMING.md). Known debt and dated decisions:
> [docs/TECH-DEBT.md](docs/TECH-DEBT.md). Contributor invariants, verification
> steps, and testing patterns: [CLAUDE.md](CLAUDE.md).

> **⚠️ HOT KEYS — READ BEFORE USING**
>
> Private keys created in or imported into CypherTap are stored as **raw
> unencrypted hex in browser localStorage** — under a storage key misleadingly
> named `ENCRYPTED_KEY` (it is *not* encrypted). Any XSS or malicious browser
> extension can read it. A working NIP-49 encryption module exists in the repo
> (`src/lib/utils/nip49.ts`, used for device linking) but is **not wired** to
> at-rest key storage — that trade-off is deliberate for now (see TECH-DEBT #1).
>
> Treat wallets here as **pocket money**: never more sats than you'd carry as
> cash, never a key that holds your identity. Prefer NIP-07 extension login
> (keys never leave the extension) for anything that matters.

## Overview

CypherTap is a **drop-in Svelte component** that gives your application:

- 🔐 **Nostr Authentication** - Multiple login methods (NIP-07 extensions, private keys, device linking)
- ⚡ **Lightning Payments** - Send and receive Lightning payments via NIP-60 Cashu wallets
- 💰 **Ecash Tokens** - Generate and receive Cashu ecash tokens
- 🔄 **Multi-mint Support** - Manage multiple Cashu mints with automatic token consolidation
- 📱 **Responsive UI** - Works seamlessly on desktop (popover) and mobile (drawer)
- 🎨 **Customizable** - Built with shadcn-svelte components and Tailwind CSS

## Quick Start

### Installation

Not on npm — embed the repo (git submodule or pnpm workspace package) and
depend on the directory. Full pattern, including the required NDK version
override: [docs/CONSUMING.md](docs/CONSUMING.md).

```json
"dependencies": { "cyphertap": "workspace:*" }
```

### Basic Usage

#### 1. Component API (Simplest)

Import the styles once in your root layout, then drop the component in:

```svelte
<script lang="ts">
  // +layout.svelte
  import 'cyphertap/styles.css';
  import { Cyphertap } from 'cyphertap';
</script>

<Cyphertap
  relays={['wss://relay.abvstudio.net', 'wss://relay.primal.net']}
  mints={['https://mint.example.com']}
/>
```

The button handles everything — login, wallet management, sending/receiving
payments. `relays`/`mints` are optional but production apps should set them:
the defaults are TEST infrastructure: a whitelisted private relay and the
feeless testnut mint (fake ecash, no real funds).

#### 2. Programmatic API (Advanced)

For more control, use the programmatic API with Svelte 5 runes:

```svelte
<script lang="ts">
  import { Cyphertap, cyphertap } from 'cyphertap';
  
  async function sendPayment() {
    // Generate a Lightning invoice
    const { bolt11 } = await cyphertap.createLightningInvoice(1000, 'Coffee');
    
    // Or generate an ecash token
    const { token } = await cyphertap.generateEcashToken(100, 'Tip');
    
    // Or publish a Nostr note
    await cyphertap.publishTextNote('Hello Nostr!');
  }
</script>

<Cyphertap />

{#if cyphertap.isLoggedIn}
  <p>Balance: {cyphertap.balance} sats</p>
  <p>User: {cyphertap.npub}</p>
  <button onclick={sendPayment}>Send Payment</button>
{/if}
```

## Features

### Authentication Methods

CypherTap supports multiple ways for users to authenticate:

- **🔑 Create New Account** - Generates a new Nostr keypair and stores it in the browser's localStorage. **⚠️ Note**: In the current beta version, keys are stored unencrypted. Future versions will implement encrypted storage. Only use new keypairs for testing or if you understand the security risks.
- **📱 Link from Another Device** - Secure QR code + PIN based device linking using NIP-49 encryption
- **🔌 Browser Extension** - NIP-07 compatible extensions (Alby, nos2x, etc.) - most secure option as private keys never leave the extension
- **🗝️ Private Key** - Direct nsec import. **⚠️ Warning**: Keys are stored unencrypted in localStorage. Only import throwaway keys or keys you're comfortable with this security model.

### Lightning Operations

```javascript
// Create an invoice to receive sats
const { bolt11 } = await cyphertap.createLightningInvoice(
  1000,  // amount in sats
  'Payment for services'  // description
);

// Pay a Lightning invoice
const result = await cyphertap.sendLightningPayment(bolt11);
```

### Ecash Operations

```javascript
// Generate an ecash token to send
const { token, mint } = await cyphertap.generateEcashToken(
  500,  // amount in sats
  'Here you go!'  // memo
);

// Receive an ecash token
const result = await cyphertap.receiveEcashToken(token);
console.log(`Received ${result.amount} sats`);
```

### Nostr Operations

```javascript
// Publish a text note
const event = await cyphertap.publishTextNote('Hello Nostr!');

// Publish any event
const event = await cyphertap.publishEvent({
  kind: 1,
  content: 'Custom event',
  tags: [['t', 'cyphertap']]
});

// Sign an event without publishing
const signed = await cyphertap.signEvent({
  kind: 1,
  content: 'This will be signed but not published'
});

// Publish an addressable event (kind 3xxxx + d tag), e.g. a NIP-38 status
await cyphertap.publishAddressable(30315, 'general', 'building cyphertap', [
  ['expiration', String(Math.floor(Date.now() / 1000) + 3600)]
]);

// Subscribe to events
const unsubscribe = cyphertap.subscribe(
  { kinds: [1], authors: [userPubkey] },
  (event) => console.log('New event:', event)
);

// Subscribe keeping only the newest version per replaceable/addressable key
const stop = cyphertap.subscribeLatest(
  { kinds: [30315], authors: follows, '#d': ['general'] },
  (event) => console.log('Status update:', event.pubkey, event.content)
);

// Pubkeys from the logged-in user's contact list (kind 3)
const follows = await cyphertap.getFollows();

// Encrypt/decrypt messages (NIP-44)
const encrypted = await cyphertap.encrypt('Secret message', recipientPubkey);
const decrypted = await cyphertap.decrypt(encrypted, senderPubkey);
```

### User Information

```javascript
// Get user's npub
const npub = cyphertap.getUserNpub();

// Get user's hex pubkey
const hex = cyphertap.getUserHex();

// Check connection status
const { connected, total } = cyphertap.getConnectionStatus();
console.log(`${connected}/${total} relays connected`);
```

## Reactive State

CypherTap provides reactive state using Svelte 5 runes that automatically updates your UI:

```svelte
<script lang="ts">
  import { Cyphertap, cyphertap } from 'cyphertap';
  
  // Use $state and $derived for reactive state
  let userStatus = $derived({
    isLoggedIn: cyphertap.isLoggedIn,
    isReady: cyphertap.isReady,
    balance: cyphertap.balance,
    npub: cyphertap.npub
  });
  
  // Or use $effect for side effects
  $effect(() => {
    console.log('Balance changed:', cyphertap.balance);
  });
</script>

{#if cyphertap.isLoggedIn}
  {#if cyphertap.isReady}
    <p>Balance: {cyphertap.balance} sats</p>
    <p>NPub: {cyphertap.npub}</p>
  {:else}
    <p>Loading wallet...</p>
  {/if}
{:else}
  <p>Please log in</p>
{/if}
```

### Reactive Properties

The `cyphertap` API object exposes the following reactive properties:

- `cyphertap.isLoggedIn` - `boolean` - User authentication status
- `cyphertap.isReady` - `boolean` - Wallet initialization status
- `cyphertap.balance` - `number` - Current balance in sats
- `cyphertap.npub` - `string | null` - User's npub

These values update automatically and trigger Svelte's reactivity system.

## Component Features

### Built-in Views

The CypherTap button component includes:

- **Login Flow** - Multiple authentication methods with smooth UX
- **Main Wallet** - Balance display, quick send/receive actions
- **Send** - Lightning invoices and ecash tokens with QR codes
- **Receive** - Generate invoices or scan ecash tokens
- **Transaction History** - View all wallet transactions with details
- **Settings** - Manage mints, relays, keys, and device linking
- **QR Scanner** - Built-in camera scanner for payments

### Responsive Design

- **Desktop**: Opens as a popover
- **Mobile**: Opens as a bottom drawer
- Automatically adapts based on screen size

## Advanced Configuration

### Default Mints

By default, CypherTap uses `https://nofee.testnut.cashu.space` — a TEST mint
issuing unbacked fake ecash (its Lightning backend auto-settles invoices).
No real funds can flow until this default is deliberately changed. Users can
add additional mints through the settings interface.

### Relay Configuration

Users can manage their relay list directly from the settings. The component publishes relay lists as NIP-65 events.

### Styling

CypherTap uses Tailwind CSS and shadcn-svelte components. You can customize the appearance by:

1. Using your own Tailwind theme
2. Overriding CSS custom properties
3. Extending the component styles

## NIP Support

CypherTap implements several Nostr Improvement Proposals (NIPs):

- **NIP-01**: Basic protocol
- **NIP-44**: Encrypted payloads (the `encrypt`/`decrypt` API)
- **NIP-07**: Browser extension signing
- **NIP-49**: Private key encryption for device linking
- **NIP-60**: Cashu wallet events
- **NIP-61**: Nutzaps (ecash zaps), Full support comming soon.
- **NIP-65**: Relay list metadata

## Security Considerations

> **⚠️ IMPORTANT SECURITY INFORMATION**

### Current Beta Limitations

- **Unencrypted Storage**: Private keys from newly created accounts or nsec imports are currently stored **unencrypted** in browser localStorage
- **Production Use**: This beta version is **not recommended for production** use with keys that hold significant value
- **Recommended Usage**: 
  - Use only for testing and development
  - Create new throwaway keypairs specifically for testing
  - Only import nsec keys if you fully understand the risks
  - Never use keys that manage significant funds or identity

### Secure Alternatives

- 🔌 **Browser Extensions** (Recommended): Use NIP-07 compatible extensions like Alby or nos2x - private keys never leave the extension
- 📱 **Device Linking**: Link from another device or app running Cyphertap with NIP-49 encrypted QR codes + PIN

### Future Improvements

- Improve wallet and Nostr sync with [Negentropy](https://github.com/hoytech/negentropy)
- Encrypted key storage using browser-native encryption APIs
- Optional password protection for locally stored keys
- Ecash Spending conditions views and userflows (NUT-10, NUT-11, NUT-12, NUT-14)
- Partial multi-path payments (MPP) (NUT-15) 
- HTTP 402 Payment Required (NUT-24)
- Nostr remote signing device integration.

### Other Security Features

- 📱 Device linking uses NIP-49 encryption with random one-time-use PINs
- ⚠️ The component displays appropriate warnings for different security levels
- 🗄️ Users can choose to clear local database on logout

## Browser Support

CypherTap requires a modern browser with support for:

- IndexedDB (for local caching)
- Web Crypto API (for encryption)
- Camera API (for QR scanning, optional)

## Development

### Project Structure

```
cyphertap/
├── src/lib/
│   ├── components/
│   │   ├── cyphertap/          # Main component
│   │   │   ├── views/          # Different UI views
│   │   │   ├── wallet/         # Wallet-specific components
│   │   │   └── settings/       # Settings components
│   │   └── ui/                 # shadcn-svelte components
│   ├── stores/
│   │   ├── nostr.ts           # Nostr state management
│   │   ├── wallet.ts          # Wallet state management
│   │   └── navigation.ts      # View navigation
│   ├── services/
│   │   ├── init.svelte.ts     # App initialization
│   │   └── logout.ts          # Logout handling
│   └── utils/                  # Utility functions
├── src/routes/                 # Demo application
└── package.json
```

### Local Development

```bash
# Clone the repository
git clone https://github.com/cypherflow/cyphertap.git
cd cyphertap

# Install dependencies
npm install

# Run the development server
npm run dev

# Run tests
npm test

# Build the library
npm run build
```

## API Reference

### Component

```svelte
<Cyphertap relays={['wss://...']} mints={['https://...']} />
```

Both props are optional (defaults: whitelisted test relay + testnut fake
mint — no real funds). Config is
read at login; changing props afterwards applies on the next login. Mints
only apply when a NEW NIP-60 wallet is created — an existing wallet keeps
the mint list from its own wallet event. For non-component setups, call
`configure({ relays, mints })` before mounting.

### Programmatic API

#### Properties (Reactive)

- `cyphertap.isLoggedIn: boolean` - User authentication status
- `cyphertap.isReady: boolean` - Wallet initialization status
- `cyphertap.balance: number` - Current balance in sats
- `cyphertap.npub: string | null` - User's npub

#### Methods

**User Info**
- `getUserNpub(): string | null`
- `getUserHex(): string | null`
- `getConnectionStatus(): { connected: number; total: number }`

**Lightning**
- `createLightningInvoice(amount: number, description?: string): Promise<{ bolt11: string }>`
- `sendLightningPayment(bolt11: string): Promise<{ success: boolean; preimage?: string }>`

**Ecash**
- `generateEcashToken(amount: number, memo?: string): Promise<{ token: string; mint?: string }>`
- `receiveEcashToken(token: string): Promise<{ success: boolean; amount: number }>`

**Nostr**
- `publishTextNote(content: string): Promise<{ id: string; pubkey: string }>`
- `publishEvent(event: Partial<NDKRawEvent>): Promise<{ id: string; pubkey: string }>`
- `publishAddressable(kind: number, dTag: string, content: string, tags?: string[][]): Promise<{ id: string; pubkey: string }>`
- `signEvent(event: Partial<NDKRawEvent>): Promise<{ id: string; pubkey: string; signature: string }>`
- `subscribe(filter: SimpleNostrFilter, callback: (event: SimpleNostrEvent) => void): () => void`
- `subscribeLatest(filter: SimpleNostrFilter, callback: (event: SimpleNostrEvent) => void): () => void` — newest-per-key dedup for replaceable/addressable kinds
- `getFollows(): Promise<string[]>` — hex pubkeys from the user's kind-3 contact list
- `encrypt(content: string, recipientPubkey: string): Promise<string>` (NIP-44)
- `decrypt(encryptedContent: string, senderPubkey: string): Promise<string>` (NIP-44)
- `getNDK(): NDKSvelte` — escape hatch for power users; throws before login, couples you to the library's NDK version

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License 

## Links

- 🚀 [Live Demo](https://cyphertap.cypherflow.ai)
- [GitHub Repository](https://github.com/cypherflow/cyphertap)
- [NPM Package](https://www.npmjs.com/package/cyphertap)
- [CypherFlow](https://cypherflow.ai)

## Acknowledgments

Built with:
- [NDK](https://github.com/nostr-dev-kit/ndk) - Nostr Development Kit
- [Cashu](https://cashu.space/) - Ecash protocol
- [Svelte 5](https://svelte.dev/) - UI framework
- [shadcn-svelte](https://www.shadcn-svelte.com/) - Component library
- [Tailwind CSS](https://tailwindcss.com/) - Styling
