<!-- src/lib/components/cyphertap/cyphertap.svelte -->
<script lang="ts">
	import {
		initNavigation,
		isUserMenuOpen,
		openMenu,
	} from '$lib/stores/navigation.js';
	import { MediaQuery } from 'svelte/reactivity';
	import { Popover, PopoverTrigger, PopoverContent }  from '$lib/components/ui/popover/index.js';
	import ViewRouter from './views/view-router.svelte';
	import CyphertapTrigger from './cyphertap-trigger.svelte';

	import { Drawer, DrawerTrigger, DrawerContent }  from '$lib/components/ui/drawer/index.js';
	import { onMount } from 'svelte';
	import { BROWSER } from 'esm-env';
	import { autoLogin } from '$lib/stores/nostr.js';
	import { configure } from '$lib/stores/config.js';

	// Library configuration (see stores/config.ts). Applied in the script
	// body so it lands before onMount's autoLogin.
	export let relays: string[] | undefined = undefined;
	export let mints: string[] | undefined = undefined;
	configure({ relays, mints });

	// MediaQuery touches window.matchMedia in its constructor, and the whole
	// widget is browser-only anyway — during SSR we render a placeholder shell
	// (see markup) so consumers don't need ssr=false.
	const isDesktop = BROWSER ? new MediaQuery('(min-width: 768px)').current : true;
	// When popover opens, reset current view
	$: if ($isUserMenuOpen) {
		initNavigation();
		openMenu();
	}

	// Try auto login
	onMount(() => {
		autoLogin();
	})
</script>

{#if !BROWSER}
	<!-- SSR placeholder: same footprint as the trigger, hydrates into the real widget -->
	<div class="relative">
		<CyphertapTrigger />
	</div>
{:else if isDesktop}
	<div class="relative">
		<Popover bind:open={$isUserMenuOpen}>
			<PopoverTrigger>
				<CyphertapTrigger />
			</PopoverTrigger>
			<PopoverContent align="end" class="w-80 overflow-hidden p-0">
				<ViewRouter {isDesktop} />
			</PopoverContent>
		</Popover>
	</div>
{:else}
	<Drawer bind:open={$isUserMenuOpen} shouldScaleBackground>
		<DrawerTrigger>
			<CyphertapTrigger />
		</DrawerTrigger>
		<DrawerContent class="pt-0">
			<ViewRouter {isDesktop} />
		</DrawerContent>
	</Drawer>
{/if}
