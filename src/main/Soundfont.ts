import { INVALID_POINTER, UniquePointerType } from './PointerType';
import Preset from './Preset';
import Synthesizer from './Synthesizer';
import { _module, bindFunctions } from './WasmManager';

type SFontPointer = UniquePointerType<'sfont_ptr'>;
type PresetPointer = UniquePointerType<'preset_ptr'>;

let bound = false;
let fluid_sfont_get_name: (sfont: SFontPointer) => string;
let fluid_preset_get_name: (preset: PresetPointer) => string;

function bindFunctionsForSoundfont() {
	if (bound) {
		return;
	}
	bindFunctions();
	bound = true;

	fluid_sfont_get_name =
		_module.cwrap('fluid_sfont_get_name', 'string', ['number']);
	fluid_preset_get_name =
		_module.cwrap('fluid_preset_get_name', 'string', ['number']);
}

export default class Soundfont {
	private readonly _ptr: SFontPointer;

	// @internal
	public constructor(sfontPtr: SFontPointer) {
		this._ptr = sfontPtr;
	}

	public static getSoundfontById(synth: Synthesizer, id: number): Soundfont | null {
		bindFunctionsForSoundfont();

		const sfont = _module._fluid_synth_get_sfont_by_id(synth.getRawSynthesizer(), id);
		if (sfont === INVALID_POINTER) {
			return null;
		}
		return new Soundfont(sfont);
	}

	public getName(): string {
		return fluid_sfont_get_name(this._ptr);
	}

	public getPreset(bank: number, presetNum: number): Preset | null {
		const presetPtr: PresetPointer = _module._fluid_sfont_get_preset(this._ptr, bank, presetNum);
		if (presetPtr === INVALID_POINTER) {
			return null;
		}
		const name = fluid_preset_get_name(presetPtr);
		const bankNum = _module._fluid_preset_get_banknum(presetPtr);
		const num = _module._fluid_preset_get_num(presetPtr);
		return {
			soundfont: this,
			name,
			bankNum,
			num
		};
	}

	public getPresetIterable(): Iterable<Preset> {
		const reset = () => {
			_module._fluid_sfont_iteration_start(this._ptr);
		};
		const next = (): IteratorResult<Preset, void> => {
			const presetPtr = _module._fluid_sfont_iteration_next(this._ptr);
			if (presetPtr === 0) {
				return {
					done: true,
					value: undefined
				};
			} else {
				const name = fluid_preset_get_name(presetPtr);
				const bankNum = _module._fluid_preset_get_banknum(presetPtr);
				const num = _module._fluid_preset_get_num(presetPtr);
				return {
					done: false,
					value: {
						soundfont: this,
						name,
						bankNum,
						num
					}
				};
			}
		};
		const iterator = (): Iterator<Preset> => {
			reset();
			return {
				next,
			};
		};
		return {
			[Symbol.iterator]: iterator,
		};
	}
}
