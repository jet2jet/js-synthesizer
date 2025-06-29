import type { MIDIEventType } from './MIDIEvent';
import PointerType, { UniquePointerType } from './PointerType';

// @internal
declare global {
	var Module: any;
	function addFunction(func: Function, sig: string): number;
	function removeFunction(funcPtr: number): void;
	function addOnPostRun(cb: (Module: any) => void): void;
}

// @internal
export type SettingsId = UniquePointerType<"settings_id">;
// @internal
export type SynthId = UniquePointerType<"synth_id">;
// @internal
export type PlayerId = UniquePointerType<"player_id">;

// @internal
export let _module: any;
// @internal
export let _addFunction: (func: Function, sig: string) => number;
// @internal
export let _removeFunction: (funcPtr: number) => void;
// @internal
export let _fs: any;
let _addOnPostRunFn: ((cb: (Module: any) => void) => void) | undefined;

// @internal
export let fluid_settings_setint: (settings: SettingsId, name: string, val: number) => number;
// @internal
export let fluid_settings_setnum: (settings: SettingsId, name: string, val: number) => number;
// @internal
export let fluid_settings_setstr: (settings: SettingsId, name: string, str: string) => number;
// @internal
export let fluid_synth_error: undefined | ((synth: SynthId) => string);
// @internal
export let fluid_synth_sfload: (synth: SynthId, filename: string, reset_presets: number) => number;
// @internal
export let fluid_sequencer_register_client: (seq: PointerType, name: string, callback: number, data: number) => number;

// @internal
export let malloc: (size: number) => PointerType;
// @internal
export let free: (ptr: PointerType) => void;

// @internal
export let defaultMIDIEventCallback: (data: PointerType, event: MIDIEventType) => number;

// @internal
export function bindFunctions(module?: any): void {
	if (module == null && fluid_synth_error) {
		// (already bound)
		return;
	}

	if (module != null) {
		if (!module.addFunction || !module.removeFunction || !module.addOnPostRun) {
			throw new Error("Invalid 'module' object. libfluidsynth-*.js (2.4.6 or higher) must be used.");
		}
		_module = module;
		_addFunction = _module.addFunction;
		_removeFunction = _module.removeFunction;
		_addOnPostRunFn = _module.addOnPostRun;
	} else if (typeof AudioWorkletGlobalScope !== "undefined") {
		_module = AudioWorkletGlobalScope.wasmModule;
		_addFunction = _module.addFunction || AudioWorkletGlobalScope.wasmAddFunction;
		_removeFunction = _module.removeFunction || AudioWorkletGlobalScope.wasmRemoveFunction;
		_addOnPostRunFn = _module.addOnPostRun || AudioWorkletGlobalScope.addOnPostRun;
	} else if (typeof Module !== "undefined") {
		_module = Module;
		if (_module.addFunction) {
			_addFunction = _module.addFunction;
			_removeFunction = _module.removeFunction;
		} else {
			_addFunction = addFunction;
			_removeFunction = removeFunction;
		}
		if (_module.addOnPostRun) {
			_addOnPostRunFn = _module.addOnPostRun;
		} else {
			_addOnPostRunFn = typeof addOnPostRun !== "undefined" ? addOnPostRun : undefined;
		}
	} else {
		throw new Error(
			"wasm module is not available. libfluidsynth-*.js must be loaded."
		);
	}
	_fs = _module.FS;

	// wrapper to use String type
	fluid_settings_setint = _module.cwrap("fluid_settings_setint", "number", [
		"number",
		"string",
		"number",
	]);
	fluid_settings_setnum = _module.cwrap("fluid_settings_setnum", "number", [
		"number",
		"string",
		"number",
	]);
	fluid_settings_setstr = _module.cwrap("fluid_settings_setstr", "number", [
		"number",
		"string",
		"string",
	]);
	fluid_synth_error = _module.cwrap("fluid_synth_error", "string", [
		"number",
	]);
	fluid_synth_sfload = _module.cwrap("fluid_synth_sfload", "number", [
		"number",
		"string",
		"number",
	]);
	fluid_sequencer_register_client = _module.cwrap(
		"fluid_sequencer_register_client",
		"number",
		["number", "string", "number", "number"]
	);

	malloc = _module._malloc.bind(_module);
	free = _module._free.bind(_module);

	defaultMIDIEventCallback =
		_module._fluid_synth_handle_midi_event.bind(_module);
}

let promiseWaitForInitialized: Promise<void> | undefined;
// @internal
export function waitForInitialized(): Promise<void> {
	if (promiseWaitForInitialized) {
		return promiseWaitForInitialized;
	}

	try {
		bindFunctions();
	} catch (e: unknown) {
		return Promise.reject(e);
	}

	if (_module.calledRun) {
		promiseWaitForInitialized = Promise.resolve();
		return promiseWaitForInitialized;
	}
	if (typeof _addOnPostRunFn === 'undefined') {
		promiseWaitForInitialized = new Promise((resolve) => {
			const fn: (() => void) | undefined = _module.onRuntimeInitialized;
			_module.onRuntimeInitialized = () => {
				resolve();
				if (fn) {
					fn();
				}
			};
		});
	} else {
		promiseWaitForInitialized = new Promise((resolve) => {
			_addOnPostRunFn!(resolve);
		});
	}
	return promiseWaitForInitialized;
}
