<script lang="ts">
	import {
		type CarouselAPI,
		type CarouselProps,
		setEmblaContext,
	} from "./context.js";
	import { cn, type WithElementRef } from "$lib/utils.js";

	let {
		ref = $bindable(null),
		opts = {},
		plugins = [],
		setApi = () => {},
		orientation = "horizontal",
		class: className,
		children,
		...restProps
	}: WithElementRef<CarouselProps> = $props();

	let api = $state<CarouselAPI>();
	let canScrollNext = $state(false);
	let canScrollPrev = $state(false);
	let scrollSnaps = $state<number[]>([]);
	let selectedIndex = $state(0);

	// Expose props through getters so context consumers stay reactive to
	// prop changes (capturing them in a $state literal freezes the initial
	// value — svelte's state_referenced_locally warning).
	setEmblaContext({
		get api() {
			return api;
		},
		set api(value) {
			api = value;
		},
		scrollPrev,
		scrollNext,
		get orientation() {
			return orientation;
		},
		get canScrollNext() {
			return canScrollNext;
		},
		set canScrollNext(value) {
			canScrollNext = value;
		},
		get canScrollPrev() {
			return canScrollPrev;
		},
		set canScrollPrev(value) {
			canScrollPrev = value;
		},
		handleKeyDown,
		get options() {
			return opts;
		},
		get plugins() {
			return plugins;
		},
		onInit,
		get scrollSnaps() {
			return scrollSnaps;
		},
		set scrollSnaps(value) {
			scrollSnaps = value;
		},
		get selectedIndex() {
			return selectedIndex;
		},
		set selectedIndex(value) {
			selectedIndex = value;
		},
		scrollTo,
	});

	function scrollPrev() {
		api?.scrollPrev();
	}

	function scrollNext() {
		api?.scrollNext();
	}

	function scrollTo(index: number, jump?: boolean) {
		api?.scrollTo(index, jump);
	}

	function onSelect() {
		if (!api) return;
		selectedIndex = api.selectedScrollSnap();
		canScrollNext = api.canScrollNext();
		canScrollPrev = api.canScrollPrev();
	}

	function handleKeyDown(e: KeyboardEvent) {
		if (e.key === "ArrowLeft") {
			e.preventDefault();
			scrollPrev();
		} else if (e.key === "ArrowRight") {
			e.preventDefault();
			scrollNext();
		}
	}

	function onInit(event: CustomEvent<CarouselAPI>) {
		api = event.detail;
		setApi(api);

		scrollSnaps = api.scrollSnapList();
		api.on("select", onSelect);
		onSelect();
	}

	$effect(() => {
		return () => {
			api?.off("select", onSelect);
		};
	});
</script>

<div
	bind:this={ref}
	data-slot="carousel"
	class={cn("relative", className)}
	role="region"
	aria-roledescription="carousel"
	{...restProps}
>
	{@render children?.()}
</div>
