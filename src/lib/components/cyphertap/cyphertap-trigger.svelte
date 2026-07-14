<script lang="ts">
	import { LogIn, User, Wallet } from '@lucide/svelte';
	import Button from '../ui/button/button.svelte';
	import { isLoggedIn, isConnecting } from '../../stores/nostr.js';
</script>

{#if $isLoggedIn}
	<!-- Icon-only: no balance and no wallet-loading skeleton, so the trigger
	     renders identically from first paint (balance lives inside the
	     popover). user+wallet pair = both halves of what the button opens. -->
	<Button variant="default">
		<User class="h-5 w-5" />
		<Wallet class="h-5 w-5" />
	</Button>
{:else}
	<Button variant="default" size="sm" disabled={$isConnecting}>
		{#if $isConnecting}
			<span
				class="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent"
			></span>
			Connecting...
		{:else}
			<LogIn class="mr-2 h-4 w-4" />
			Start
		{/if}
	</Button>
{/if}
