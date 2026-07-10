<script lang="ts">
	import QRCode from '@castlenine/svelte-qrcode';

	let { invoice }: { invoice: string | undefined } = $props();
</script>

<QRCode data={invoice} haveBackgroundRoundedEdges padding={2} />
