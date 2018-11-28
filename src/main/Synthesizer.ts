
import { SynthesizerDefaultValues, InterpolationValues } from './Constants';
import IMIDIEvent from './IMIDIEvent';
import ISequencer from './ISequencer';
import ISequencerEventData from './ISequencerEventData';
import ISynthesizer from './ISynthesizer';
import PointerType, { INVALID_POINTER, UniquePointerType } from './PointerType';

import MIDIEvent, { MIDIEventType } from './MIDIEvent';
import Sequencer from './Sequencer';
import { EventType as SequencerEventType } from './SequencerEvent';
import SequencerEventData from './SequencerEventData';

/** @internal */
declare global {
	var Module: any;
	function addFunction(func: Function, sig: string): number;
	function removeFunction(funcPtr: number): void;
}

type SettingsId = UniquePointerType<'settings_id'>;
type SynthId = UniquePointerType<'synth_id'>;
type PlayerId = UniquePointerType<'player_id'>;

let _module: any;
let _addFunction: (func: Function, sig: string) => number;
let _removeFunction: (funcPtr: number) => void;
if (typeof AudioWorkletGlobalScope !== 'undefined') {
	_module = AudioWorkletGlobalScope.wasmModule;
	_addFunction = AudioWorkletGlobalScope.wasmAddFunction;
	_removeFunction = AudioWorkletGlobalScope.wasmRemoveFunction;
} else {
	_module = Module;
	_addFunction = addFunction;
	_removeFunction = removeFunction;
}
const _fs: any = _module.FS;

// wrapper to use String type
const fluid_synth_error: (synth: SynthId) => string =
	_module.cwrap('fluid_synth_error', 'string', ['number']);
const fluid_synth_sfload: (synth: SynthId, filename: string, reset_presets: number) => number =
	_module.cwrap('fluid_synth_sfload', 'number', ['number', 'string', 'number']);
const fluid_sequencer_register_client: (seq: PointerType, name: string, callback: number, data: number) => number =
	_module.cwrap('fluid_sequencer_register_client', 'number', ['number', 'string', 'number', 'number']);

const malloc: (size: number) => PointerType = _module._malloc.bind(_module);
const free: (ptr: PointerType) => void = _module._free.bind(_module);

function makeRandomFileName(type: string, ext: string) {
	return `/${type}-r${Math.random() * 65535}-${Math.random() * 65535}${ext}`;
}

/** Hook callback function type */
export interface HookMIDIEventCallback {
	/**
	 * Hook callback function type.
	 * @param synth the base synthesizer instance
	 * @param eventType MIDI event type (e.g. 0x90 is note-on event)
	 * @param eventData detailed event data
	 * @return true if the event data is processed, or false if the default processing is necessary
	 */
	(synth: Synthesizer, eventType: number, eventData: IMIDIEvent): boolean;
}

/** Client callback function type for sequencer object */
export interface SequencerClientCallback {
	/**
	 * Client callback function type for sequencer object.
	 * @param time the sequencer tick value
	 * @param eventType sequencer event type
	 * @param event actual event data (can only be used in this callback function)
	 * @param sequencer the base sequencer object
	 * @param param parameter data passed to the registration method
	 */
	(time: number, eventType: SequencerEventType, event: ISequencerEventData, sequencer: ISequencer, param: number): void;
}

function makeMIDIEventCallback(synth: Synthesizer, cb: HookMIDIEventCallback) {
	return (data: PointerType, event: MIDIEventType): number => {
		const t = _module._fluid_midi_event_get_type(event);
		if (cb(synth, t, new MIDIEvent(event, _module))) {
			return 0;
		}
		return _module._fluid_synth_handle_midi_event(data, event);
	};
}

const defaultMIDIEventCallback: (data: PointerType, event: MIDIEventType) => number =
	_module._fluid_synth_handle_midi_event.bind(_module);

/** Default implementation of ISynthesizer */
export default class Synthesizer implements ISynthesizer {
	/** @internal */
	private _settings: SettingsId;
	/** @internal */
	private _synth: SynthId;
	/** @internal */
	private _player: PlayerId;
	/** @internal */
	private _playerPlaying: boolean;
	/** @internal */
	private _playerDefer: undefined | {
		promise: Promise<void>;
		resolve: () => void;
	};
	/** @internal */
	private _playerCallbackPtr: number | null;
	/** @internal */
	private _fluidSynthCallback: PointerType | null;

	/** @internal */
	private _buffer: PointerType;
	/** @internal */
	private _bufferSize: number;

	/** @internal */
	private _gain: number;

	constructor() {
		this._settings = _module._new_fluid_settings();
		this._synth = INVALID_POINTER;
		this._player = INVALID_POINTER;
		this._playerPlaying = false;
		this._playerCallbackPtr = null;
		this._fluidSynthCallback = null;

		this._buffer = INVALID_POINTER;
		this._bufferSize = 0;

		this._gain = SynthesizerDefaultValues.Gain;
	}

	public isInitialized() {
		return this._synth !== INVALID_POINTER;
	}

	/** Return the raw synthesizer instance value (pointer for libfluidsynth). */
	public getRawSynthesizer(): number {
		return this._synth;
	}

	public createAudioNode(context: AudioContext, frameSize?: number): AudioNode {
		const node = context.createScriptProcessor(frameSize, 0, 2);
		node.addEventListener('audioprocess', (ev) => {
			this.render(ev.outputBuffer);
		});
		return node;
	}

	public init(sampleRate: number) {
		this.close();
		this._synth = _module._new_fluid_synth(this._settings);
		_module._fluid_synth_set_gain(this._synth, this._gain);
		_module._fluid_synth_set_sample_rate(this._synth, sampleRate);
		this._initPlayer();
	}

	public close() {
		if (this._synth === INVALID_POINTER) {
			return;
		}
		this._closePlayer();
		_module._delete_fluid_synth(this._synth);
		this._synth = INVALID_POINTER;
	}

	public isPlaying() {
		return this._synth !== INVALID_POINTER &&
			_module._fluid_synth_get_active_voice_count(this._synth) > 0;
	}

	public setInterpolation(value: InterpolationValues, channel?: number) {
		this.ensureInitialized();
		if (typeof channel === 'undefined') {
			channel = -1;
		}
		_module._fluid_synth_set_interp_method(this._synth, channel, value);
	}

	public getGain() {
		return this._gain;
	}

	public setGain(gain: number) {
		this.ensureInitialized();
		_module._fluid_synth_set_gain(this._synth, gain);
		this._gain = _module._fluid_synth_get_gain(this._synth);
	}

	public waitForVoicesStopped() {
		return this.flushFramesAsync();
	}

	public loadSFont(bin: ArrayBuffer) {
		this.ensureInitialized();

		const name = makeRandomFileName('sfont', '.sf2');
		const ub = new Uint8Array(bin);

		_fs.writeFile(name, ub);
		const sfont = fluid_synth_sfload(this._synth, name, 1);
		_fs.unlink(name);
		return sfont === -1 ?
			Promise.reject(new Error(fluid_synth_error(this._synth))) :
			Promise.resolve(sfont);
	}

	public unloadSFont(id: number) {
		this.ensureInitialized();
		this.stopPlayer();
		this.flushFramesSync();

		_module._fluid_synth_sfunload(this._synth, id, 1);
	}

	public unloadSFontAsync(id: number) {
		// not throw with Promise.reject
		this.ensureInitialized();
		this.stopPlayer();
		return this.flushFramesAsync().then(() => {
			_module._fluid_synth_sfunload(this._synth, id, 1);
		});
	}

	public getSFontBankOffset(id: number) {
		this.ensureInitialized();
		return Promise.resolve(_module._fluid_synth_get_bank_offset(this._synth, id) as number);
	}
	public setSFontBankOffset(id: number, offset: number) {
		this.ensureInitialized();
		_module._fluid_synth_set_bank_offset(this._synth, id, offset);
	}

	public render(outBuffer: AudioBuffer | Float32Array[]) {
		const frameCount = 'numberOfChannels' in outBuffer ? outBuffer.length : outBuffer[0].length;
		const channels = 'numberOfChannels' in outBuffer ? outBuffer.numberOfChannels : outBuffer.length;
		const sizePerChannel = 4 * frameCount;
		const totalSize = sizePerChannel * 2;
		if (this._bufferSize < totalSize) {
			if (this._buffer !== INVALID_POINTER) {
				free(this._buffer);
			}
			this._buffer = malloc(totalSize);
			this._bufferSize = totalSize;
		}

		const memLeft = this._buffer;
		const memRight = (this._buffer as number + sizePerChannel) as PointerType;
		this.renderRaw(memLeft, memRight, frameCount);

		const aLeft = new Float32Array(_module.HEAPU8.buffer, memLeft, frameCount);
		const aRight = channels >= 2 ? new Float32Array(_module.HEAPU8.buffer, memRight, frameCount) : null;
		if ('numberOfChannels' in outBuffer) {
			outBuffer.copyToChannel(aLeft, 0, 0);
			if (aRight) {
				outBuffer.copyToChannel(aRight, 1, 0);
			}
		} else {
			outBuffer[0].set(aLeft);
			if (aRight) {
				outBuffer[1].set(aRight);
			}
		}

		// check and update player status
		this.isPlayerPlaying();
	}

	public midiNoteOn(chan: number, key: number, vel: number) {
		_module._fluid_synth_noteon(this._synth, chan, key, vel);
	}
	public midiNoteOff(chan: number, key: number) {
		_module._fluid_synth_noteoff(this._synth, chan, key);
	}
	public midiKeyPressure(chan: number, key: number, val: number) {
		_module._fluid_synth_key_pressure(this._synth, chan, key, val);
	}
	public midiControl(chan: number, ctrl: number, val: number) {
		_module._fluid_synth_cc(this._synth, chan, ctrl, val);
	}
	public midiProgramChange(chan: number, prognum: number) {
		_module._fluid_synth_program_change(this._synth, chan, prognum);
	}
	public midiChannelPressure(chan: number, val: number) {
		_module._fluid_synth_channel_pressure(this._synth, chan, val);
	}
	public midiPitchBend(chan: number, val: number) {
		_module._fluid_synth_pitch_bend(this._synth, chan, val);
	}
	public midiSysEx(data: Uint8Array) {
		const len = data.byteLength;
		const mem = malloc(len);
		_module.HEAPU8.set(data, mem);
		_module._fluid_synth_sysex(this._synth, mem, len,
			INVALID_POINTER, INVALID_POINTER, INVALID_POINTER, 0);
	}

	public midiPitchWheelSensitivity(chan: number, val: number) {
		_module._fluid_synth_pitch_wheel_sens(this._synth, chan, val);
	}
	public midiBankSelect(chan: number, bank: number) {
		_module._fluid_synth_bank_select(this._synth, chan, bank);
	}
	public midiSFontSelect(chan: number, sfontId: number) {
		_module._fluid_synth_sfont_select(this._synth, chan, sfontId);
	}
	public midiProgramSelect(chan: number, sfontId: number, bank: number, presetNum: number) {
		_module._fluid_synth_program_select(this._synth, chan, sfontId, bank, presetNum);
	}
	public midiUnsetProgram(chan: number) {
		_module._fluid_synth_unset_program(this._synth, chan);
	}
	public midiProgramReset() {
		_module._fluid_synth_program_reset(this._synth);
	}
	public midiSystemReset() {
		_module._fluid_synth_system_reset(this._synth);
	}
	public midiAllNotesOff(chan?: number) {
		_module._fluid_synth_all_notes_off(this._synth, typeof chan === 'undefined' ? -1 : chan);
	}
	public midiAllSoundsOff(chan?: number) {
		_module._fluid_synth_all_sounds_off(this._synth, typeof chan === 'undefined' ? -1 : chan);
	}
	public midiSetChannelType(chan: number, isDrum: boolean) {
		// CHANNEL_TYPE_MELODIC = 0
		// CHANNEL_TYPE_DRUM = 1
		_module._fluid_synth_set_channel_type(this._synth, chan, isDrum ? 1 : 0);
	}

	public resetPlayer() {
		return this._initPlayer();
	}

	private _initPlayer() {
		this._closePlayer();

		const player = _module._new_fluid_player(this._synth);
		this._player = player;
		if (player !== INVALID_POINTER) {
			if (this._fluidSynthCallback === null) {
				// hacky retrieve 'fluid_synth_handle_midi_event' callback pointer
				// * 'playback_callback' is filled with 'fluid_synth_handle_midi_event' by default.
				// * 'playback_userdata' is filled with the synthesizer pointer by default
				const funcPtr: PointerType = _module.HEAPU32[((player as number) + 588) >> 2]; // _fluid_player_t::playback_callback
				const synthPtr: SynthId = _module.HEAPU32[((player as number) + 592) >> 2];    // _fluid_player_t::playback_userdata
				if (synthPtr === this._synth) {
					this._fluidSynthCallback = funcPtr;
				}
			}
		}
		return player !== INVALID_POINTER ? Promise.resolve() :
			Promise.reject(new Error('Out of memory'));
	}

	private _closePlayer() {
		const p = this._player;
		if (p === INVALID_POINTER) {
			return;
		}
		this.stopPlayer();
		_module._delete_fluid_player(p);
		this._player = INVALID_POINTER;
		this._playerCallbackPtr = null;
	}

	public isPlayerPlaying() {
		if (this._playerPlaying) {
			const status = _module._fluid_player_get_status(this._player);
			if (status === 1 /*FLUID_PLAYER_PLAYING*/) {
				return true;
			}
			this.stopPlayer();
		}
		return false;
	}

	public addSMFDataToPlayer(bin: ArrayBuffer) {
		this.ensurePlayerInitialized();
		const len = bin.byteLength;
		const mem = malloc(len);
		_module.HEAPU8.set(new Uint8Array(bin), mem);
		const r: number = _module._fluid_player_add_mem(this._player, mem, len);
		free(mem);
		return r !== -1 ? Promise.resolve() : Promise.reject(new Error(fluid_synth_error(this._synth)));
	}

	public playPlayer() {
		this.ensurePlayerInitialized();
		if (this._playerPlaying) {
			this.stopPlayer();
		}

		if (_module._fluid_player_play(this._player) === -1) {
			return Promise.reject(new Error(fluid_synth_error(this._synth)));
		}
		this._playerPlaying = true;
		let resolver = () => { };
		const p = new Promise<void>((resolve) => {
			resolver = resolve;
		});
		this._playerDefer = {
			promise: p,
			resolve: resolver
		};
		return Promise.resolve();
	}

	public stopPlayer() {
		const p = this._player;
		if (p === INVALID_POINTER || !this._playerPlaying) {
			return;
		}
		_module._fluid_player_stop(p);
		_module._fluid_player_join(p);
		_module._fluid_synth_all_sounds_off(this._synth, -1);
		if (this._playerDefer) {
			this._playerDefer.resolve();
			this._playerDefer = void (0);
		}
		this._playerPlaying = false;
	}

	public retrievePlayerCurrentTick(): Promise<number> {
		this.ensurePlayerInitialized();
		return Promise.resolve(_module._fluid_player_get_current_tick(this._player));
	}
	public retrievePlayerTotalTicks(): Promise<number> {
		this.ensurePlayerInitialized();
		return Promise.resolve(_module._fluid_player_get_total_ticks(this._player));
	}
	public retrievePlayerBpm(): Promise<number> {
		this.ensurePlayerInitialized();
		return Promise.resolve(_module._fluid_player_get_bpm(this._player));
	}
	public retrievePlayerMIDITempo(): Promise<number> {
		this.ensurePlayerInitialized();
		return Promise.resolve(_module._fluid_player_get_midi_tempo(this._player));
	}
	public seekPlayer(ticks: number): void {
		this.ensurePlayerInitialized();
		_module._fluid_player_seek(this._player, ticks);
	}

	/**
	 * Hooks MIDI events sent by the player.
	 * initPlayer() must be called before calling this method.
	 * @param callback hook callback function, or null to unhook
	 */
	public hookPlayerMIDIEvents(callback: HookMIDIEventCallback | null) {
		this.ensurePlayerInitialized();

		const oldPtr = this._playerCallbackPtr;
		if (oldPtr === null && callback === null) {
			return;
		}
		const newPtr = (
			// if callback is specified, add function
			callback !== null ? _addFunction(makeMIDIEventCallback(this, callback), 'iii') : (
				// if _fluidSynthCallback is filled, set null to use it for reset callback
				// if not, add function defaultMIDIEventCallback for reset
				this._fluidSynthCallback !== null ? null : _addFunction(defaultMIDIEventCallback, 'iii')
			)
		);
		// the third parameter of 'fluid_player_set_playback_callback' should be 'fluid_synth_t*'
		if (oldPtr !== null && newPtr !== null) {
			// (using defaultMIDIEventCallback also comes here)
			_module._fluid_player_set_playback_callback(this._player, newPtr, this._synth);
			_removeFunction(oldPtr);
		} else {
			if (newPtr === null) {
				// newPtr === null --> use _fluidSynthCallback
				_module._fluid_player_set_playback_callback(this._player, this._fluidSynthCallback!, this._synth);
				_removeFunction(oldPtr!);
			} else {
				_module._fluid_player_set_playback_callback(this._player, newPtr, this._synth);
			}
		}
		this._playerCallbackPtr = newPtr;
	}

	/** @internal */
	private ensureInitialized() {
		if (this._synth === INVALID_POINTER) {
			throw new Error('Synthesizer is not initialized');
		}
	}

	/** @internal */
	private ensurePlayerInitialized() {
		this.ensureInitialized();
		if (this._player === INVALID_POINTER) {
			throw new Error('Player is not initialized');
		}
	}

	/** @internal */
	private renderRaw(memLeft: PointerType, memRight: PointerType, frameCount: number) {
		_module._fluid_synth_write_float(this._synth, frameCount, memLeft, 0, 1, memRight, 0, 1);
	}

	/** @internal */
	private flushFramesSync() {
		const frameCount = 65536;
		const size = 4 * frameCount;
		const mem = malloc(size * 2);
		const memLeft = mem;
		const memRight = (mem as number + size) as PointerType;
		while (this.isPlaying()) {
			this.renderRaw(memLeft, memRight, frameCount);
		}
		free(mem);
	}

	/** @internal */
	private flushFramesAsync() {
		if (!this.isPlaying()) {
			return Promise.resolve();
		}
		const frameCount = 65536;
		const size = 4 * frameCount;
		const mem = malloc(size * 2);
		const memLeft = mem;
		const memRight = (mem as number + size) as PointerType;
		const nextFrame = (
			typeof setTimeout !== 'undefined' ?
				() => {
					return new Promise<void>((resolve) => setTimeout(resolve, 0));
				} :
				() => {
					return Promise.resolve();
				}
		);
		function head(): Promise<void> {
			return nextFrame().then(tail);
		}
		const self = this;
		function tail(): Promise<void> {
			if (!self.isPlaying()) {
				free(mem);
				return Promise.resolve();
			}
			self.renderRaw(memLeft, memRight, frameCount);
			return head();
		}
		return head();
	}

	public waitForPlayerStopped() {
		return this._playerDefer ? this._playerDefer.promise : Promise.resolve();
	}

	/**
	 * Create the sequencer object for this class.
	 */
	public static createSequencer(): Promise<ISequencer> {
		const seq = new Sequencer();
		return seq._initialize().then(() => seq);
	}

	/**
	 * Registers the user-defined client to the sequencer.
	 * The client can receive events in the time from sequencer process.
	 * @param seq the sequencer instance created by Synthesizer.createSequencer
	 * @param name the client name
	 * @param callback the client callback function that processes event data
	 * @param param additional parameter passed to the callback
	 * @return registered sequencer client id (can be passed to seq.unregisterClient())
	 */
	public static registerSequencerClient(seq: ISequencer, name: string, callback: SequencerClientCallback, param: number): number {
		if (!(seq instanceof Sequencer)) {
			throw new TypeError('Invalid sequencer instance');
		}
		const ptr = _addFunction((time: number, ev: PointerType, _seq: number, data: number) => {
			const e = new SequencerEventData(ev, _module);
			const type: SequencerEventType = _module._fluid_event_get_type(ev);
			callback(time, type, e, seq, data);
		}, 'viiii');
		const r = fluid_sequencer_register_client(seq.getRaw(), name, ptr, param);
		if (r !== -1) {
			seq._clientFuncMap[r] = ptr;
		}
		return r;
	}
}
