import { UniquePointerType } from './PointerType';
import Soundfont from './Soundfont';

type PresetPointer = UniquePointerType<'preset_ptr'>;

/** @internal */
declare global {
	var Module: any;
}

let _module: any;

let fluid_preset_get_name: (preset: PresetPointer) => string;

function bindFunctions() {
	if (_module) {
		return;
	}

	if (typeof AudioWorkletGlobalScope !== 'undefined') {
		_module = AudioWorkletGlobalScope.wasmModule;
	} else {
		_module = Module;
	}

	fluid_preset_get_name =
		_module.cwrap('fluid_preset_get_name', 'string', ['number']);
}

export default class Preset {
	private readonly _ptr: PresetPointer;

	// @internal
	constructor(ptr: PresetPointer) {
		bindFunctions();
		this._ptr = ptr;
	}

	public getName(): string {
		return fluid_preset_get_name(this._ptr);
	}

	public getBankNum(): number {
		return _module._fluid_preset_get_banknum(this._ptr);
	}

	public getNum(): number {
		return _module._fluid_preset_get_num(this._ptr);
	}

	public getSoundfont(): Soundfont {
		return new Soundfont(_module._fluid_preset_get_sfont(this._ptr));
	}
}
