// src/lib/utils/negentropy.ts
import { createDebug } from '$lib/utils/debug.js';

const debug = createDebug('negentropy');

let negentropyLoaded = false;
let loadingPromise: Promise<void> | null = null;

// Load Negentropy library
export const loadNegentropy = (): Promise<void> => {
    const d = debug.extend('loadNegentropy')
    // If already loaded, return resolved promise
    if (negentropyLoaded) {
        return Promise.resolve();
    }
    
    // If already loading, return the existing promise
    if (loadingPromise) {
        return loadingPromise;
    }
    
    // Start loading. The vendored library ships with the package and is
    // code-split by the bundler (the old approach — a script tag pointing at
    // /negentropy.js — 404'd in every consuming app, since that file only
    // existed in this repo's static/ dir). The vendored file's browser shim
    // exposes window.Negentropy / window.NegentropyStorageVector on import.
    loadingPromise = (async () => {
        if (window.Negentropy && window.NegentropyStorageVector) {
            d.log('Negentropy already available on window');
            negentropyLoaded = true;
            return;
        }

        d.log('Loading Negentropy library...');
        const mod = await import('$lib/vendor/negentropy-browser.js');
        window.Negentropy = mod.Negentropy;
        window.NegentropyStorageVector = mod.NegentropyStorageVector;

        if (window.Negentropy && window.NegentropyStorageVector) {
            d.log('✅ Negentropy loaded successfully');
            negentropyLoaded = true;
        } else {
            const error = new Error('Negentropy library did not load properly');
            d.log('❌ Negentropy load failed:', error);
            throw error;
        }
    })();

    return loadingPromise;
};

// Check if Negentropy is loaded
export const isNegentropyLoaded = (): boolean => {
    return negentropyLoaded;
};

// Get Negentropy classes (throws if not loaded)
export const getNegentropy = () => {
    if (!isNegentropyLoaded) {
        throw new Error('Negentropy library not loaded. Call loadNegentropy() first.');
    }
    return {
        Negentropy: window.Negentropy,
        NegentropyStorageVector: window.NegentropyStorageVector
    };
};

// Declare global types for Negentropy
declare global {
    interface Window {
        Negentropy: any;
        NegentropyStorageVector: any;
    }
}