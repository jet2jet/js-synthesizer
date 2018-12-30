
/** @internal */
declare global {
	var Module: any;
}

let promiseWasmInitialized: Promise<void> | undefined;

/**
 * Returns the Promise object which resolves when the synthesizer engine is ready.
 */
export default function waitForReady(): Promise<void> {
	if (!promiseWasmInitialized) {
		const _module: any = typeof AudioWorkletGlobalScope !== 'undefined' ?
			AudioWorkletGlobalScope.wasmModule : Module;
		promiseWasmInitialized = new Promise<void>((resolve) => {
			if (_module.calledRun) {
				resolve();
			} else {
				const fn: (() => void) | undefined = _module.onRuntimeInitialized;
				_module.onRuntimeInitialized = () => {
					resolve();
					if (fn) {
						fn();
					}
				};
			}
		});
	}
	return promiseWasmInitialized;
}
