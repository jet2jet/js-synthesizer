
import { SynthesizerDefaultValues, InterpolationValues } from './Constants';
import ISequencer from './ISequencer';
import ISynthesizer from './ISynthesizer';

import WorkletSequencer from './WorkletSequencer';

import * as MethodMessaging from './MethodMessaging';

/** @internal */
export const enum Constants {
	ProcessorName = 'fluid-js',
	UpdateStatus = 'updateStatus',
}
/** @internal */
export interface SynthesizerStatus {
	playing: boolean;
	playerPlaying: boolean;
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

	constructor() {
		this._status = {
			playing: false,
			playerPlaying: false
		};
		this._messaging = null;
		this._node = null;
		this._gain = SynthesizerDefaultValues.Gain;
	}

	/** Audio node for this synthesizer */
	public get node(): AudioWorkletNode | null {
		return this._node;
	}

	public createAudioNode(context: AudioContext) {
		const node = new AudioWorkletNode(context, Constants.ProcessorName, {
			numberOfInputs: 0,
			numberOfOutputs: 1,
			channelCount: 2,
			outputChannelCount: [2]
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

	public init(_sampleRate: number) {
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

	/** @internal */
	public _getRawSynthesizer(): Promise<number> {
		return MethodMessaging.postCallWithPromise<number>(this._messaging!, 'getRawSynthesizer', []);
	}
}
