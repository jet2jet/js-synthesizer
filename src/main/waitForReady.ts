import Synthesizer from "./Synthesizer";

/** @internal */
declare global {
	var Module: any;
}

/**
 * Returns the Promise object which resolves when the synthesizer engine is ready.
 */
export default function waitForReady(): Promise<void> {
	return Synthesizer.waitForWasmInitialized();
}
