<!-- src/lib/components/ui/ViewContainer.svelte -->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import { fly } from 'svelte/transition';
	import { startTransition, endTransition, direction } from '$lib/stores/navigation.js';

	let {
		// Allow passing additional classes
		className = '',
		// Allow customizing animation options
		animationDuration = 300,
		animationDistance = 300,
		children
	}: {
		className?: string;
		animationDuration?: number;
		animationDistance?: number;
		children?: Snippet;
	} = $props();
</script>

<div
	class="w-full {className}"
	in:fly={{ x: $direction * animationDistance, duration: animationDuration }}
	out:fly={{ x: $direction * -animationDistance, duration: animationDuration }}
	onintrostart={startTransition}
	onoutrostart={startTransition}
	onintroend={endTransition}
	onoutroend={endTransition}
>
	{@render children?.()}
</div>
