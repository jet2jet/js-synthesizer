
import {
	SynthesizerDefaultValues,
	InterpolationValues,
	ChorusModulation,
	GeneratorTypes,
	LegatoMode,
	PortamentoMode,
	PlayerSetTempoType,
} from './Constants';
import IMIDIEvent from './IMIDIEvent';
import ISequencer from './ISequencer';
import ISequencerEventData from './ISequencerEventData';
import ISynthesizer from './ISynthesizer';
import PointerType, { INVALID_POINTER } from './PointerType';
import SynthesizerSettings from './SynthesizerSettings';
import {
	PlayerId,
	SettingsId,
	SynthId,
	_addFunction,
	_fs,
	_module,
	_removeFunction,
	bindFunctions,
	defaultMIDIEventCallback,
	fluid_sequencer_register_client,
	fluid_settings_setint,
	fluid_settings_setnum,
	fluid_settings_setstr,
	fluid_synth_error,
	fluid_synth_sfload,
	malloc,
	free,
	waitForInitialized,
} from './WasmManager';

import MIDIEvent, { MIDIEventType } from './MIDIEvent';
import Sequencer from './Sequencer';
import SequencerEvent, { EventType as SequencerEventType } from './SequencerEvent';
import SequencerEventData from './SequencerEventData';
import Soundfont from './Soundfont';

function setBoolValueForSettings(settings: SettingsId, name: string, value: boolean | undefined) {
	if (typeof value !== 'undefined') {
		fluid_settings_setint(settings, name, value ? 1 : 0);
	}
}
function setIntValueForSettings(settings: SettingsId, name: string, value: number | undefined) {
	if (typeof value !== 'undefined') {
		fluid_settings_setint(settings, name, value);
	}
}
function setNumValueForSettings(settings: SettingsId, name: string, value: number | undefined) {
	if (typeof value !== 'undefined') {
		fluid_settings_setnum(settings, name, value);
	}
}
function setStrValueForSettings(settings: SettingsId, name: string, value: string | undefined) {
	if (typeof value !== 'undefined') {
		fluid_settings_setstr(settings, name, value);
	}
}

function getActiveVoiceCount(synth: SynthId): number {
	const actualCount = _module._fluid_synth_get_active_voice_count(synth);
	if (!actualCount) {
		return 0;
	}

	// FluidSynth may return incorrect value for active voice count,
	// so check internal data and correct it

	// check if the structure is not changed
	// for fluidsynth 2.0.x-2.1.x:
	//   140 === offset [synth->voice]
	//   144 === offset [synth->active_voice_count] for 
	// for fluidsynth 2.2.x:
	//   144 === offset [synth->voice]
	//   148 === offset [synth->active_voice_count]
	// first check 2.1.x structure
	let baseOffsetOfVoice = 140;
	let offsetOfActiveVoiceCount = (synth + baseOffsetOfVoice + 4) >> 2;
	let structActiveVoiceCount = _module.HEAPU32[offsetOfActiveVoiceCount];
	if (structActiveVoiceCount !== actualCount) {
		// add 4 for 2.2.x
		baseOffsetOfVoice += 4;
		offsetOfActiveVoiceCount = (synth + baseOffsetOfVoice + 4) >> 2;
		structActiveVoiceCount = _module.HEAPU32[offsetOfActiveVoiceCount];
		if (structActiveVoiceCount !== actualCount) {
			// unknown structure
			const c = console;
			c.warn(
				'js-synthesizer: cannot check synthesizer internal data (may be changed)'
			);
			return actualCount;
		}
	}

	const voiceList = _module.HEAPU32[(synth + baseOffsetOfVoice) >> 2];
	// (voice should not be NULL)
	if (!voiceList || voiceList >= _module.HEAPU32.byteLength) {
		// unknown structure
		const c = console;
		c.warn(
			'js-synthesizer: cannot check synthesizer internal data (may be changed)'
		);
		return actualCount;
	}

	// count of internal voice data is restricted to polyphony value
	const voiceCount = _module._fluid_synth_get_polyphony(synth);
	let isRunning = false;
	for (let i = 0; i < voiceCount; ++i) {
		// auto voice = voiceList[i]
		const voice = _module.HEAPU32[(voiceList >> 2) + i];
		if (!voice) {
			continue;
		}
		// offset [voice->status]
		const status = _module.HEAPU8[voice + 4];
		// 4: FLUID_VOICE_OFF
		if (status !== 4) {
			isRunning = true;
			break;
		}
	}
	if (!isRunning) {
		if (structActiveVoiceCount !== 0) {
			const c = console;
			c.warn(
				'js-synthesizer: Active voice count is not zero, but all voices are off:',
				structActiveVoiceCount,
			);
		}
		_module.HEAPU32[offsetOfActiveVoiceCount] = 0;
		return 0;
	}

	return actualCount;
}

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
	 * @param param parameter data passed to the registration method
	 * @return true if the event data is processed, or false if the default processing is necessary
	 */
	(synth: Synthesizer, eventType: number, eventData: IMIDIEvent, param: any): boolean;
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

function makeMIDIEventCallback(synth: Synthesizer, cb: HookMIDIEventCallback, param: any) {
	return (data: PointerType, event: MIDIEventType): number => {
		const t = _module._fluid_midi_event_get_type(event);
		if (cb(synth, t, new MIDIEvent(event, _module), param)) {
			return 0;
		}
		return _module._fluid_synth_handle_midi_event(data, event);
	};
}

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
	private _playerDefer:
		| undefined
		| {
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
	private _numPtr: PointerType;

	/** @internal */
	private _gain: number;

	constructor() {
		bindFunctions();

		this._settings = INVALID_POINTER;
		this._synth = INVALID_POINTER;
		this._player = INVALID_POINTER;
		this._playerPlaying = false;
		this._playerCallbackPtr = null;
		this._fluidSynthCallback = null;

		this._buffer = INVALID_POINTER;
		this._bufferSize = 0;
		this._numPtr = INVALID_POINTER;

		this._gain = SynthesizerDefaultValues.Gain;
	}

	/**
	 * Initializes with loaded FluidSynth module.
	 * If using this method, you must call this before all methods/constructors, including `waitForWasmInitialized`.
	 * @param mod loaded libfluidsynth.js instance (typically `const mod = Module` (loaded via script tag) or `const mod = require('libfluidsynth-*.js')` (in Node.js))
	 */
	public static initializeWithFluidSynthModule(mod: unknown): void {
		bindFunctions(mod);
	}

	/** Return the promise object that resolves when WebAssembly has been initialized. */
	public static waitForWasmInitialized(): Promise<void> {
		return waitForInitialized();
	}

	public isInitialized() {
		return this._synth !== INVALID_POINTER;
	}

	/** Return the raw synthesizer instance value (pointer for libfluidsynth). */
	public getRawSynthesizer(): number {
		return this._synth;
	}

	public createAudioNode(
		context: AudioContext,
		frameSize?: number
	): AudioNode {
		const node = context.createScriptProcessor(frameSize, 0, 2);
		node.addEventListener("audioprocess", (ev) => {
			this.render(ev.outputBuffer);
		});
		return node;
	}

	public init(sampleRate: number, settings?: SynthesizerSettings) {
		this.close();

		const set = (this._settings = _module._new_fluid_settings());
		fluid_settings_setnum(set, "synth.sample-rate", sampleRate);
		if (settings) {
			if (typeof settings.initialGain !== "undefined") {
				this._gain = settings.initialGain;
			}
			setBoolValueForSettings(
				set,
				"synth.chorus.active",
				settings.chorusActive
			);
			setNumValueForSettings(
				set,
				"synth.chorus.depth",
				settings.chorusDepth
			);
			setNumValueForSettings(
				set,
				"synth.chorus.level",
				settings.chorusLevel
			);
			setIntValueForSettings(set, "synth.chorus.nr", settings.chorusNr);
			setNumValueForSettings(
				set,
				"synth.chorus.speed",
				settings.chorusSpeed
			);
			setIntValueForSettings(
				set,
				"synth.midi-channels",
				settings.midiChannelCount
			);
			setStrValueForSettings(
				set,
				"synth.midi-bank-select",
				settings.midiBankSelect
			);
			setIntValueForSettings(
				set,
				"synth.min-note-length",
				settings.minNoteLength
			);
			setNumValueForSettings(
				set,
				"synth.overflow.age",
				settings.overflowAge
			);
			setNumValueForSettings(
				set,
				"synth.overflow.important",
				settings.overflowImportantValue
			);
			if (typeof settings.overflowImportantChannels !== "undefined") {
				fluid_settings_setstr(
					set,
					"synth.overflow.important-channels",
					settings.overflowImportantChannels.join(",")
				);
			}
			setNumValueForSettings(
				set,
				"synth.overflow.percussion",
				settings.overflowPercussion
			);
			setNumValueForSettings(
				set,
				"synth.overflow.released",
				settings.overflowReleased
			);
			setNumValueForSettings(
				set,
				"synth.overflow.sustained",
				settings.overflowSustained
			);
			setNumValueForSettings(
				set,
				"synth.overflow.volume",
				settings.overflowVolume
			);
			setIntValueForSettings(set, "synth.polyphony", settings.polyphony);
			setBoolValueForSettings(
				set,
				"synth.reverb.active",
				settings.reverbActive
			);
			setNumValueForSettings(
				set,
				"synth.reverb.damp",
				settings.reverbDamp
			);
			setNumValueForSettings(
				set,
				"synth.reverb.level",
				settings.reverbLevel
			);
			setNumValueForSettings(
				set,
				"synth.reverb.room-size",
				settings.reverbRoomSize
			);
			setNumValueForSettings(
				set,
				"synth.reverb.width",
				settings.reverbWidth
			);
		}
		fluid_settings_setnum(set, "synth.gain", this._gain);

		this._synth = _module._new_fluid_synth(this._settings);

		this._numPtr = malloc(8);
	}

	public close() {
		if (this._synth === INVALID_POINTER) {
			return;
		}
		this._closePlayer();
		_module._delete_fluid_synth(this._synth);
		this._synth = INVALID_POINTER;
		_module._delete_fluid_settings(this._settings);
		this._settings = INVALID_POINTER;
		free(this._numPtr);
		this._numPtr = INVALID_POINTER;
	}

	public isPlaying() {
		return (
			this._synth !== INVALID_POINTER &&
			getActiveVoiceCount(this._synth) > 0
		);
	}

	public setInterpolation(value: InterpolationValues, channel?: number) {
		this.ensureInitialized();
		if (typeof channel === "undefined") {
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

	public setChannelType(channel: number, isDrum: boolean) {
		this.ensureInitialized();
		// CHANNEL_TYPE_MELODIC = 0, CHANNEL_TYPE_DRUM = 1
		_module._fluid_synth_set_channel_type(
			this._synth,
			channel,
			isDrum ? 1 : 0
		);
	}

	public waitForVoicesStopped() {
		return this.flushFramesAsync();
	}

	public loadSFont(bin: ArrayBuffer) {
		this.ensureInitialized();

		const name = makeRandomFileName("sfont", ".sf2");
		const ub = new Uint8Array(bin);

		_fs.writeFile(name, ub);
		const sfont = fluid_synth_sfload(this._synth, name, 1);
		_fs.unlink(name);
		return sfont === -1
			? Promise.reject(new Error(fluid_synth_error!(this._synth)))
			: Promise.resolve(sfont);
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

	/**
	 * Returns the `Soundfont` instance for specified SoundFont.
	 * @param sfontId loaded SoundFont id ({@link loadSFont} returns this)
	 * @return `Soundfont` instance or `null` if `sfontId` is not valid or loaded
	 */
	public getSFontObject(sfontId: number): Soundfont | null {
		return Soundfont.getSoundfontById(this, sfontId);
	}

	public getSFontBankOffset(id: number) {
		this.ensureInitialized();
		return Promise.resolve(
			_module._fluid_synth_get_bank_offset(this._synth, id) as number
		);
	}
	public setSFontBankOffset(id: number, offset: number) {
		this.ensureInitialized();
		_module._fluid_synth_set_bank_offset(this._synth, id, offset);
	}

	public render(outBuffer: AudioBuffer | Float32Array[]) {
		const frameCount =
			"numberOfChannels" in outBuffer
				? outBuffer.length
				: outBuffer[0].length;
		const channels =
			"numberOfChannels" in outBuffer
				? outBuffer.numberOfChannels
				: outBuffer.length;
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
		const memRight = ((this._buffer as number) +
			sizePerChannel) as PointerType;
		this.renderRaw(memLeft, memRight, frameCount);

		const aLeft = new Float32Array(
			_module.HEAPU8.buffer,
			memLeft,
			frameCount
		);
		const aRight =
			channels >= 2
				? new Float32Array(_module.HEAPU8.buffer, memRight, frameCount)
				: null;
		if ("numberOfChannels" in outBuffer) {
			if (outBuffer.copyToChannel) {
				outBuffer.copyToChannel(aLeft, 0, 0);
				if (aRight) {
					outBuffer.copyToChannel(aRight, 1, 0);
				}
			} else {
				// copyToChannel API not exist in Safari AudioBuffer
				const leftData = outBuffer.getChannelData(0);
				aLeft.forEach((val, i) => (leftData[i] = val));
				if (aRight) {
					const rightData = outBuffer.getChannelData(1);
					aRight.forEach((val, i) => (rightData[i] = val));
				}
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
		_module._fluid_synth_sysex(
			this._synth,
			mem,
			len,
			INVALID_POINTER,
			INVALID_POINTER,
			INVALID_POINTER,
			0
		);
		free(mem);
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
	public midiProgramSelect(
		chan: number,
		sfontId: number,
		bank: number,
		presetNum: number
	) {
		_module._fluid_synth_program_select(
			this._synth,
			chan,
			sfontId,
			bank,
			presetNum
		);
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
		_module._fluid_synth_all_notes_off(
			this._synth,
			typeof chan === "undefined" ? -1 : chan
		);
	}
	public midiAllSoundsOff(chan?: number) {
		_module._fluid_synth_all_sounds_off(
			this._synth,
			typeof chan === "undefined" ? -1 : chan
		);
	}
	public midiSetChannelType(chan: number, isDrum: boolean) {
		// CHANNEL_TYPE_MELODIC = 0
		// CHANNEL_TYPE_DRUM = 1
		_module._fluid_synth_set_channel_type(
			this._synth,
			chan,
			isDrum ? 1 : 0
		);
	}

	/**
	 * Set reverb parameters to the synthesizer.
	 */
	public setReverb(
		roomsize: number,
		damping: number,
		width: number,
		level: number
	) {
		_module._fluid_synth_set_reverb(
			this._synth,
			roomsize,
			damping,
			width,
			level
		);
	}
	/**
	 * Set reverb roomsize parameter to the synthesizer.
	 */
	public setReverbRoomsize(roomsize: number) {
		_module._fluid_synth_set_reverb_roomsize(this._synth, roomsize);
	}
	/**
	 * Set reverb damping parameter to the synthesizer.
	 */
	public setReverbDamp(damping: number) {
		_module._fluid_synth_set_reverb_damp(this._synth, damping);
	}
	/**
	 * Set reverb width parameter to the synthesizer.
	 */
	public setReverbWidth(width: number) {
		_module._fluid_synth_set_reverb_width(this._synth, width);
	}
	/**
	 * Set reverb level to the synthesizer.
	 */
	public setReverbLevel(level: number) {
		_module._fluid_synth_set_reverb_level(this._synth, level);
	}
	/**
	 * Enable or disable reverb effect of the synthesizer.
	 */
	public setReverbOn(on: boolean) {
		_module._fluid_synth_set_reverb_on(this._synth, on ? 1 : 0);
	}
	/**
	 * Get reverb roomsize parameter of the synthesizer.
	 */
	public getReverbRoomsize(): number {
		return _module._fluid_synth_get_reverb_roomsize(this._synth);
	}
	/**
	 * Get reverb damping parameter of the synthesizer.
	 */
	public getReverbDamp(): number {
		return _module._fluid_synth_get_reverb_damp(this._synth);
	}
	/**
	 * Get reverb level of the synthesizer.
	 */
	public getReverbLevel(): number {
		return _module._fluid_synth_get_reverb_level(this._synth);
	}
	/**
	 * Get reverb width parameter of the synthesizer.
	 */
	public getReverbWidth(): number {
		return _module._fluid_synth_get_reverb_width(this._synth);
	}

	/**
	 * Set chorus parameters to the synthesizer.
	 */
	public setChorus(
		voiceCount: number,
		level: number,
		speed: number,
		depthMillisec: number,
		type: ChorusModulation
	) {
		_module._fluid_synth_set_chorus(
			this._synth,
			voiceCount,
			level,
			speed,
			depthMillisec,
			type
		);
	}
	/**
	 * Set chorus voice count parameter to the synthesizer.
	 */
	public setChorusVoiceCount(voiceCount: number) {
		_module._fluid_synth_set_chorus_nr(this._synth, voiceCount);
	}
	/**
	 * Set chorus level parameter to the synthesizer.
	 */
	public setChorusLevel(level: number) {
		_module._fluid_synth_set_chorus_level(this._synth, level);
	}
	/**
	 * Set chorus speed parameter to the synthesizer.
	 */
	public setChorusSpeed(speed: number) {
		_module._fluid_synth_set_chorus_speed(this._synth, speed);
	}
	/**
	 * Set chorus depth parameter to the synthesizer.
	 */
	public setChorusDepth(depthMillisec: number) {
		_module._fluid_synth_set_chorus_depth(this._synth, depthMillisec);
	}
	/**
	 * Set chorus modulation type to the synthesizer.
	 */
	public setChorusType(type: ChorusModulation) {
		_module._fluid_synth_set_chorus_type(this._synth, type);
	}
	/**
	 * Enable or disable chorus effect of the synthesizer.
	 */
	public setChorusOn(on: boolean) {
		_module._fluid_synth_set_chorus_on(this._synth, on ? 1 : 0);
	}
	/**
	 * Get chorus voice count of the synthesizer.
	 */
	public getChorusVoiceCount(): number {
		return _module._fluid_synth_get_chorus_nr(this._synth);
	}
	/**
	 * Get chorus level of the synthesizer.
	 */
	public getChorusLevel(): number {
		return _module._fluid_synth_get_chorus_level(this._synth);
	}
	/**
	 * Get chorus speed of the synthesizer.
	 */
	public getChorusSpeed(): number {
		return _module._fluid_synth_get_chorus_speed(this._synth);
	}
	/**
	 * Get chorus depth (in milliseconds) of the synthesizer.
	 */
	public getChorusDepth(): number {
		return _module._fluid_synth_get_chorus_depth(this._synth);
	}
	/**
	 * Get chorus modulation type of the synthesizer.
	 */
	public getChorusType(): ChorusModulation {
		return _module._fluid_synth_get_chorus_type(this._synth);
	}

	/**
	 * Get generator value assigned to the MIDI channel.
	 * @param channel MIDI channel number
	 * @param param generator ID
	 * @return a value related to the generator
	 */
	public getGenerator(channel: number, param: GeneratorTypes): number {
		return _module._fluid_synth_get_gen(this._synth, channel, param);
	}
	/**
	 * Set generator value assigned to the MIDI channel.
	 * @param channel MIDI channel number
	 * @param param generator ID
	 * @param value a value related to the generator
	 */
	public setGenerator(channel: number, param: GeneratorTypes, value: number) {
		_module._fluid_synth_set_gen(this._synth, channel, param, value);
	}
	/**
	 * Return the current legato mode of the channel.
	 * @param channel MIDI channel number
	 * @return legato mode
	 */
	public getLegatoMode(channel: number) {
		_module._fluid_synth_get_legato_mode(
			this._synth,
			channel,
			this._numPtr
		);
		return _module.HEAP32[(this._numPtr as number) >> 2] as LegatoMode;
	}
	/**
	 * Set the current legato mode of the channel.
	 * @param channel MIDI channel number
	 * @param mode legato mode
	 */
	public setLegatoMode(channel: number, mode: LegatoMode) {
		_module._fluid_synth_set_legato_mode(this._synth, channel, mode);
	}
	/**
	 * Return the current portamento mode of the channel.
	 * @param channel MIDI channel number
	 * @return portamento mode
	 */
	public getPortamentoMode(channel: number) {
		_module._fluid_synth_get_portamento_mode(
			this._synth,
			channel,
			this._numPtr
		);
		return _module.HEAP32[(this._numPtr as number) >> 2] as PortamentoMode;
	}
	/**
	 * Set the current portamento mode of the channel.
	 * @param channel MIDI channel number
	 * @param mode portamento mode
	 */
	public setPortamentoMode(channel: number, mode: PortamentoMode) {
		_module._fluid_synth_set_portamento_mode(this._synth, channel, mode);
	}
	/**
	 * Return the current breath mode of the channel.
	 * @param channel MIDI channel number
	 * @return breath mode (BreathFlags)
	 */
	public getBreathMode(channel: number) {
		_module._fluid_synth_get_breath_mode(
			this._synth,
			channel,
			this._numPtr
		);
		return _module.HEAP32[(this._numPtr as number) >> 2] as number;
	}
	/**
	 * Set the current breath mode of the channel.
	 * @param channel MIDI channel number
	 * @param flags breath mode flags (BreathFlags)
	 */
	public setBreathMode(channel: number, flags: number) {
		_module._fluid_synth_set_breath_mode(this._synth, channel, flags);
	}

	////////////////////////////////////////////////////////////////////////////

	public resetPlayer() {
		return new Promise<void>((resolve) => {
			this._initPlayer();
			resolve();
		});
	}

	public closePlayer() {
		this._closePlayer();
	}

	/** @internal */
	private _initPlayer() {
		this._closePlayer();

		const player = _module._new_fluid_player(this._synth);
		this._player = player;
		if (player !== INVALID_POINTER) {
			if (this._fluidSynthCallback === null) {
				// hacky retrieve 'fluid_synth_handle_midi_event' callback pointer
				// * 'playback_callback' is filled with 'fluid_synth_handle_midi_event' by default.
				// * 'playback_userdata' is filled with the synthesizer pointer by default
				const funcPtr: PointerType =
					_module.HEAPU32[((player as number) + 588) >> 2]; // _fluid_player_t::playback_callback
				const synthPtr: SynthId =
					_module.HEAPU32[((player as number) + 592) >> 2]; // _fluid_player_t::playback_userdata
				if (synthPtr === this._synth) {
					this._fluidSynthCallback = funcPtr;
				}
			}
		} else {
			throw new Error("Out of memory");
		}
	}

	/** @internal */
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
		return r !== -1
			? Promise.resolve()
			: Promise.reject(new Error(fluid_synth_error!(this._synth)));
	}

	public playPlayer() {
		this.ensurePlayerInitialized();
		if (this._playerPlaying) {
			this.stopPlayer();
		}

		if (_module._fluid_player_play(this._player) === -1) {
			return Promise.reject(new Error(fluid_synth_error!(this._synth)));
		}
		this._playerPlaying = true;
		let resolver = () => {};
		const p = new Promise<void>((resolve) => {
			resolver = resolve;
		});
		this._playerDefer = {
			promise: p,
			resolve: resolver,
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
			this._playerDefer = void 0;
		}
		this._playerPlaying = false;
	}

	public retrievePlayerCurrentTick(): Promise<number> {
		this.ensurePlayerInitialized();
		return Promise.resolve(
			_module._fluid_player_get_current_tick(this._player)
		);
	}
	public retrievePlayerTotalTicks(): Promise<number> {
		this.ensurePlayerInitialized();
		return Promise.resolve(
			_module._fluid_player_get_total_ticks(this._player)
		);
	}
	public retrievePlayerBpm(): Promise<number> {
		this.ensurePlayerInitialized();
		return Promise.resolve(_module._fluid_player_get_bpm(this._player));
	}
	public retrievePlayerMIDITempo(): Promise<number> {
		this.ensurePlayerInitialized();
		return Promise.resolve(
			_module._fluid_player_get_midi_tempo(this._player)
		);
	}
	public seekPlayer(ticks: number): void {
		this.ensurePlayerInitialized();
		_module._fluid_player_seek(this._player, ticks);
	}
	public setPlayerLoop(loopTimes: number): void {
		this.ensurePlayerInitialized();
		_module._fluid_player_set_loop(this._player, loopTimes);
	}
	public setPlayerTempo(tempoType: PlayerSetTempoType, tempo: number): void {
		this.ensurePlayerInitialized();
		_module._fluid_player_set_tempo(this._player, tempoType, tempo);
	}

	/**
	 * Hooks MIDI events sent by the player.
	 * initPlayer() must be called before calling this method.
	 * @param callback hook callback function, or null to unhook
	 * @param param any additional data passed to the callback
	 */
	public hookPlayerMIDIEvents(
		callback: HookMIDIEventCallback | null,
		param?: any
	) {
		this.ensurePlayerInitialized();

		const oldPtr = this._playerCallbackPtr;
		if (oldPtr === null && callback === null) {
			return;
		}
		const newPtr =
			// if callback is specified, add function
			callback !== null
				? _addFunction(
						makeMIDIEventCallback(this, callback, param),
						"iii"
				  )
				: // if _fluidSynthCallback is filled, set null to use it for reset callback
				// if not, add function defaultMIDIEventCallback for reset
				this._fluidSynthCallback !== null
				? null
				: _addFunction(defaultMIDIEventCallback, "iii");
		// the third parameter of 'fluid_player_set_playback_callback' should be 'fluid_synth_t*'
		if (oldPtr !== null && newPtr !== null) {
			// (using defaultMIDIEventCallback also comes here)
			_module._fluid_player_set_playback_callback(
				this._player,
				newPtr,
				this._synth
			);
			_removeFunction(oldPtr);
		} else {
			if (newPtr === null) {
				// newPtr === null --> use _fluidSynthCallback
				_module._fluid_player_set_playback_callback(
					this._player,
					this._fluidSynthCallback!,
					this._synth
				);
				_removeFunction(oldPtr!);
			} else {
				_module._fluid_player_set_playback_callback(
					this._player,
					newPtr,
					this._synth
				);
			}
		}
		this._playerCallbackPtr = newPtr;
	}

	/** @internal */
	private ensureInitialized() {
		if (this._synth === INVALID_POINTER) {
			throw new Error("Synthesizer is not initialized");
		}
	}

	/** @internal */
	private ensurePlayerInitialized() {
		this.ensureInitialized();
		if (this._player === INVALID_POINTER) {
			this._initPlayer();
		}
	}

	/** @internal */
	private renderRaw(
		memLeft: PointerType,
		memRight: PointerType,
		frameCount: number
	) {
		_module._fluid_synth_write_float(
			this._synth,
			frameCount,
			memLeft,
			0,
			1,
			memRight,
			0,
			1
		);
	}

	/** @internal */
	private flushFramesSync() {
		const frameCount = 65536;
		const size = 4 * frameCount;
		const mem = malloc(size * 2);
		const memLeft = mem;
		const memRight = ((mem as number) + size) as PointerType;
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
		const memRight = ((mem as number) + size) as PointerType;
		const nextFrame =
			typeof setTimeout !== "undefined"
				? () => {
						return new Promise<void>((resolve) =>
							setTimeout(resolve, 0)
						);
				  }
				: () => {
						return Promise.resolve();
				  };
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
		return this._playerDefer
			? this._playerDefer.promise
			: Promise.resolve();
	}

	/**
	 * Create the sequencer object for this class.
	 */
	public static createSequencer(): Promise<ISequencer> {
		bindFunctions();
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
	public static registerSequencerClient(
		seq: ISequencer,
		name: string,
		callback: SequencerClientCallback,
		param: number
	): number {
		if (!(seq instanceof Sequencer)) {
			throw new TypeError("Invalid sequencer instance");
		}
		const ptr = _addFunction(
			(time: number, ev: PointerType, _seq: number, data: number) => {
				const e = new SequencerEventData(ev, _module);
				const type: SequencerEventType =
					_module._fluid_event_get_type(ev);
				callback(time, type, e, seq, data);
			},
			"viiii"
		);
		const r = fluid_sequencer_register_client(
			seq.getRaw(),
			name,
			ptr,
			param
		);
		if (r !== -1) {
			seq._clientFuncMap[r] = ptr;
		}
		return r;
	}

	/**
	 * Send sequencer event immediately to the specific client.
	 * @param seq the sequencer instance created by Synthesizer.createSequencer
	 * @param clientId registered client id (-1 for registered synthesizer)
	 * @param event event data
	 */
	public static sendEventToClientNow(
		seq: ISequencer,
		clientId: number,
		event: SequencerEvent
	): void {
		if (!(seq instanceof Sequencer)) {
			throw new TypeError("Invalid sequencer instance");
		}
		seq.sendEventToClientNow(clientId, event);
	}
	/**
	 * (Re-)send event data immediately.
	 * @param seq the sequencer instance created by Synthesizer.createSequencer
	 * @param clientId registered client id (-1 for registered synthesizer)
	 * @param eventData event data which can be retrieved in SequencerClientCallback
	 */
	public static sendEventNow(
		seq: ISequencer,
		clientId: number,
		eventData: ISequencerEventData
	): void {
		if (!(seq instanceof Sequencer)) {
			throw new TypeError("Invalid sequencer instance");
		}
		seq.sendEventNow(clientId, eventData);
	}
	/**
	 * Set interval timer process to call processSequencer for this sequencer.
	 * This method uses 'setInterval' global method to register timer.
	 * @param seq the sequencer instance created by Synthesizer.createSequencer
	 * @param msec time in milliseconds passed to both setInterval and processSequencer
	 * @return return value of 'setInterval' (usually passing to 'clearInterval' will reset event)
	 */
	public static setIntervalForSequencer(seq: ISequencer, msec: number) {
		if (!(seq instanceof Sequencer)) {
			throw new TypeError("Invalid sequencer instance");
		}
		return seq.setIntervalForSequencer(msec);
	}
}
