import Synthesizer from './Synthesizer';

/**
 * Returns the Promise object which resolves when the synthesizer engine is ready.
 */
export default function waitForReady(): Promise<void> {
	return Synthesizer.waitForWasmInitialized();
}
