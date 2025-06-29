
import { SynthesizerDefaultValues, InterpolationValues, PlayerSetTempoType } from './Constants';
import ISequencer from './ISequencer';
import ISynthesizer from './ISynthesizer';
import SynthesizerSettings from './SynthesizerSettings';
import WorkletSoundfont from './WorkletSoundfont';
import WorkletSequencer from './WorkletSequencer';
import * as MethodMessaging from './MethodMessaging';
import { addLoggingStatusChangedHandler, getDisabledLoggingLevel, LogLevel } from './logging';

/** @internal */
export const enum Constants {
	ProcessorName = 'js-synthesizer',
	UpdateStatus = 'updateStatus',
}
/** @internal */
export interface SynthesizerStatus {
	playing: boolean;
	playerPlaying: boolean;
}
/** @internal */
export interface ProcessorOptions {
	settings?: SynthesizerSettings;
	disabledLoggingLevel?: LogLevel | null;
}

/** An synthesizer object with AudioWorkletNode */
export default class AudioWorkletNodeSynthesizer implements ISynthesizer {

	/** @internal */
	private _status: SynthesizerStatus;
	/** @internal */
	private _messaging: MethodMessaging.CallMessageInstance | null;
	/** @internal */
	private _node: AudioWorkletNode | null;
	/** @internal */
	private _gain: number;

	/** @internal */
	private handleLoggingChanged: (level: LogLevel | null) => void;

	constructor() {
		this._status = {
			playing: false,
			playerPlaying: false
		};
		this._messaging = null;
		this._node = null;
		this._gain = SynthesizerDefaultValues.Gain;
		this.handleLoggingChanged = this._handleLoggingChanged.bind(this);
		addLoggingStatusChangedHandler(this.handleLoggingChanged);
	}

	/** Audio node for this synthesizer */
	public get node(): AudioWorkletNode | null {
		return this._node;
	}

	/**
	 * Create AudiWorkletNode instance
	 */
	public createAudioNode(context: AudioContext, settings?: SynthesizerSettings) {
		const processorOptions: ProcessorOptions = {
			settings: settings,
			disabledLoggingLevel: getDisabledLoggingLevel(),
		};
		const node = new AudioWorkletNode(context, Constants.ProcessorName, {
			numberOfInputs: 0,
			numberOfOutputs: 1,
			channelCount: 2,
			outputChannelCount: [2],
			processorOptions: processorOptions,
		});
		this._node = node;

		this._messaging = MethodMessaging.initializeCallPort(node.port, (data) => {
			if (data.method === Constants.UpdateStatus) {
				this._status = data.val;
				return true;
			}
			return false;
		});
		return node;
	}

	public isInitialized() {
		return this._messaging !== null;
	}

	public init(_sampleRate: number, _settings?: SynthesizerSettings) {
	}

	public close() {
		// call init instead of close
		MethodMessaging.postCall(this._messaging!, 'init', [0]);
	}

	public isPlaying() {
		return this._status.playing;
	}

	public setInterpolation(value: InterpolationValues, channel?: number) {
		MethodMessaging.postCall(this._messaging!, 'setInterpolation', [value, channel]);
	}

	public getGain() {
		return this._gain;
	}

	public setGain(gain: number) {
		this._gain = gain;
		MethodMessaging.postCallWithPromise<void>(this._messaging!, 'setGain', [gain]).then(() => {
			return MethodMessaging.postCallWithPromise<number>(this._messaging!, 'getGain', []);
		}).then((value) => {
			this._gain = value;
		});
	}

	public setChannelType(channel: number, isDrum: boolean) {
		MethodMessaging.postCall(this._messaging!, 'setChannelType', [channel, isDrum]);
	}

	public waitForVoicesStopped() {
		return MethodMessaging.postCallWithPromise<void>(this._messaging!, 'waitForVoicesStopped', []);
	}

	public loadSFont(bin: ArrayBuffer) {
		return MethodMessaging.postCallWithPromise<number>(this._messaging!, 'loadSFont', [bin]);
	}

	public unloadSFont(id: number) {
		MethodMessaging.postCall(this._messaging!, 'unloadSFont', [id]);
	}

	public unloadSFontAsync(id: number) {
		return MethodMessaging.postCallWithPromise<void>(this._messaging!, 'unloadSFont', [id]);
	}

	/**
	 * Returns the `Soundfont` instance for specified SoundFont.
	 * @param sfontId loaded SoundFont id ({@link loadSFont} returns this)
	 * @return resolve with `Soundfont` instance (rejected if `sfontId` is not valid or loaded)
	 */
	public getSFontObject(sfontId: number): Promise<WorkletSoundfont> {
		const channel = new MessageChannel();
		return MethodMessaging.postCallWithPromise<string>(this._messaging!, 'getSFontObject', [channel.port2, sfontId]).then((name) => {
			return new WorkletSoundfont(channel.port1, name);
		});
	}

	public getSFontBankOffset(id: number) {
		return MethodMessaging.postCallWithPromise<number>(this._messaging!, 'getSFontBankOffset', [id]);
	}
	public setSFontBankOffset(id: number, offset: number) {
		MethodMessaging.postCall(this._messaging!, 'setSFontBankOffset', [id, offset]);
	}

	public render() {
		throw new Error('Unexpected call');
	}

	public midiNoteOn(chan: number, key: number, vel: number) {
		MethodMessaging.postCall(this._messaging!, 'midiNoteOn', [chan, key, vel]);
	}
	public midiNoteOff(chan: number, key: number) {
		MethodMessaging.postCall(this._messaging!, 'midiNoteOff', [chan, key]);
	}
	public midiKeyPressure(chan: number, key: number, val: number) {
		MethodMessaging.postCall(this._messaging!, 'midiKeyPressure', [chan, key, val]);
	}
	public midiControl(chan: number, ctrl: number, val: number) {
		MethodMessaging.postCall(this._messaging!, 'midiControl', [chan, ctrl, val]);
	}
	public midiProgramChange(chan: number, prognum: number) {
		MethodMessaging.postCall(this._messaging!, 'midiProgramChange', [chan, prognum]);
	}
	public midiChannelPressure(chan: number, val: number) {
		MethodMessaging.postCall(this._messaging!, 'midiChannelPressure', [chan, val]);
	}
	public midiPitchBend(chan: number, val: number) {
		MethodMessaging.postCall(this._messaging!, 'midiPitchBend', [chan, val]);
	}
	public midiSysEx(data: Uint8Array) {
		MethodMessaging.postCall(this._messaging!, 'midiSysEx', [data]);
	}

	public midiPitchWheelSensitivity(chan: number, val: number) {
		MethodMessaging.postCall(this._messaging!, 'midiPitchWheelSensitivity', [chan, val]);
	}
	public midiBankSelect(chan: number, bank: number) {
		MethodMessaging.postCall(this._messaging!, 'midiBankSelect', [chan, bank]);
	}
	public midiSFontSelect(chan: number, sfontId: number) {
		MethodMessaging.postCall(this._messaging!, 'midiSFontSelect', [chan, sfontId]);
	}
	public midiProgramSelect(chan: number, sfontId: number, bank: number, presetNum: number) {
		MethodMessaging.postCall(this._messaging!, 'midiProgramSelect', [chan, sfontId, bank, presetNum]);
	}
	public midiUnsetProgram(chan: number) {
		MethodMessaging.postCall(this._messaging!, 'midiUnsetProgram', [chan]);
	}
	public midiProgramReset() {
		MethodMessaging.postCall(this._messaging!, 'midiProgramReset', []);
	}
	public midiSystemReset() {
		MethodMessaging.postCall(this._messaging!, 'midiSystemReset', []);
	}
	public midiAllNotesOff(chan?: number) {
		MethodMessaging.postCall(this._messaging!, 'midiAllNotesOff', [chan]);
	}
	public midiAllSoundsOff(chan?: number) {
		MethodMessaging.postCall(this._messaging!, 'midiAllSoundsOff', [chan]);
	}
	public midiSetChannelType(chan: number, isDrum: boolean) {
		MethodMessaging.postCall(this._messaging!, 'midiSetChannelType', [chan, isDrum]);
	}

	public resetPlayer() {
		return MethodMessaging.postCallWithPromise<void>(this._messaging!, 'resetPlayer', []);
	}

	public closePlayer() {
		MethodMessaging.postCall(this._messaging!, 'closePlayer', []);
	}

	public isPlayerPlaying() {
		return this._status.playerPlaying;
	}

	public addSMFDataToPlayer(bin: ArrayBuffer) {
		return MethodMessaging.postCallWithPromise<void>(this._messaging!, 'addSMFDataToPlayer', [bin]);
	}

	public playPlayer() {
		return MethodMessaging.postCallWithPromise<void>(this._messaging!, 'playPlayer', []);
	}

	public stopPlayer() {
		MethodMessaging.postCall(this._messaging!, 'stopPlayer', []);
	}

	public retrievePlayerCurrentTick(): Promise<number> {
		return MethodMessaging.postCallWithPromise<number>(this._messaging!, 'retrievePlayerCurrentTick', []);
	}
	public retrievePlayerTotalTicks(): Promise<number> {
		return MethodMessaging.postCallWithPromise<number>(this._messaging!, 'retrievePlayerTotalTicks', []);
	}
	public retrievePlayerBpm(): Promise<number> {
		return MethodMessaging.postCallWithPromise<number>(this._messaging!, 'retrievePlayerBpm', []);
	}
	public retrievePlayerMIDITempo(): Promise<number> {
		return MethodMessaging.postCallWithPromise<number>(this._messaging!, 'retrievePlayerMIDITempo', []);
	}
	public seekPlayer(ticks: number): void {
		MethodMessaging.postCall(this._messaging!, 'seekPlayer', [ticks]);
	}
	public setPlayerLoop(loopTimes: number): void {
		MethodMessaging.postCall(this._messaging!, 'setPlayerLoop', [loopTimes]);
	}
	public setPlayerTempo(tempoType: PlayerSetTempoType, tempo: number): void {
		MethodMessaging.postCall(this._messaging!, 'setPlayerTempo', [tempoType, tempo]);
	}

	public waitForPlayerStopped() {
		return MethodMessaging.postCallWithPromise<void>(this._messaging!, 'waitForPlayerStopped', []);
	}

	/**
	 * Creates a sequencer instance associated with this worklet node.
	 */
	public createSequencer(): Promise<ISequencer> {
		const channel = new MessageChannel();
		return MethodMessaging.postCallWithPromise<void>(this._messaging!, 'createSequencer', [channel.port2]).then(() => {
			return new WorkletSequencer(channel.port1);
		});
	}

	/**
	 * Hooks MIDI events sent by the player. The hook callback function defined on
	 * AudioWorkletGlobalScope object available in the worklet is used.
	 * @param callbackName hook callback function name available as 'AudioWorkletGlobalScope[callbackName]',
	 *     or falsy value ('', null, or undefined) to unhook.
	 *     The type of 'AudioWorkletGlobalScope[callbackName]' must be HookMIDIEventCallback.
	 * @param param any additional data passed to the callback.
	 *     This data must be 'Transferable' data.
	 * @return Promise object that resolves when succeeded, or rejects when failed
	 */
	public hookPlayerMIDIEventsByName(callbackName: string | null | undefined, param?: any): Promise<void> {
		return MethodMessaging.postCallWithPromise<void>(this._messaging!, 'hookPlayerMIDIEventsByName', [callbackName, param]);
	}

	/**
	 * Registers the user-defined client to the sequencer.
	 * The client callback function defined on AudioWorkletGlobalScope
	 * object available in the worklet is used.
	 * The client can receive events in the time from sequencer process.
	 * @param seq the sequencer instance created by AudioWorkletNodeSynthesizer.createSequencer
	 * @param clientName the client name
	 * @param callbackName callback function name available as 'AudioWorkletGlobalScope[callbackName]',
	 *     or falsy value ('', null, or undefined) to unhook.
	 *     The type of 'AudioWorkletGlobalScope[callbackName]' must be SequencerClientCallback.
	 * @param param additional parameter passed to the callback
	 * @return Promise object that resolves with registered client id when succeeded, or rejects when failed
	 */
	public registerSequencerClientByName(seq: ISequencer, clientName: string, callbackName: string, param: number): Promise<number> {
		if (!(seq instanceof WorkletSequencer)) {
			return Promise.reject(new TypeError('Invalid sequencer object'));
		}
		return seq.registerSequencerClientByName(clientName, callbackName, param);
	}

	/**
	 * Call a function defined in the AudioWorklet.
	 *
	 * The function will receive two parameters; the first parameter is a Synthesizer instance
	 * (not AudioWorkletNodeSynthesizer instance), and the second is the data passed to 'param'.
	 * This method is useful when the script loaded in AudioWorklet wants to
	 * retrieve Synthesizer instance.
	 *
	 * @param name a function name (must be retrieved from AudioWorkletGlobalScope[name])
	 * @param param any parameter (must be Transferable)
	 * @return Promise object that resolves when the function process has done, or rejects when failed
	 */
	public callFunction(name: string, param: any) {
		return MethodMessaging.postCallWithPromise<void>(this._messaging!, 'callFunction', [name, param]);
	}

	/** @internal */
	public _getRawSynthesizer(): Promise<number> {
		return MethodMessaging.postCallWithPromise<number>(this._messaging!, 'getRawSynthesizer', []);
	}

	/** @internal */
	private _handleLoggingChanged(level: LogLevel | null) {
		if (this._messaging == null) {
			return;
		}
		MethodMessaging.postCall(this._messaging, 'loggingChanged', [level]);
	}
}
