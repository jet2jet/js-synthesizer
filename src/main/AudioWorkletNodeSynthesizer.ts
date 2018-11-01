
import { SynthesizerDefaultValues, InterpolationValues } from './Constants';
import ISynthesizer from './ISynthesizer';

/** @internal */
export const enum Constants {
	ProcessorName = 'fluid-js',
	UpdateStatus = 'updateStatus',
}
/** @internal */
export interface MethodCallEventData {
	id: number;
	method: string;
	args: any[];
}
/** @internal */
export interface MethodReturnEventData {
	id: number;
	method: string;
	val: any;
	error?: any;
}
/** @internal */
export interface SynthesizerStatus {
	playing: boolean;
	playerPlaying: boolean;
}

interface Defer<T> {
	resolve(value: T): void;
	reject(reason: any): void;
}

/** An synthesizer object with AudioWorkletNode */
export default class AudioWorkletNodeSynthesizer implements ISynthesizer {

	/** @internal */
	private _status: SynthesizerStatus;
	/** @internal */
	private _port: MessagePort | null;
	/** @internal */
	private _defers: {
		[id: number]: Defer<any>;
	};
	/** @internal */
	private _deferId: number;
	/** @internal */
	private _node: AudioWorkletNode | null;
	/** @internal */
	private _gain: number;

	constructor() {
		this._status = {
			playing: false,
			playerPlaying: false
		};
		this._defers = {};
		this._deferId = 0;
		this._port = null;
		this._node = null;
		this._gain = SynthesizerDefaultValues.Gain;
	}

	/** @internal */
	private onMessage(ev: MessageEvent) {
		const data: MethodReturnEventData = ev.data;
		if (data.method === Constants.UpdateStatus) {
			this._status = data.val;
		} else {
			const defer = this._defers[data.id];
			if (defer) {
				delete this._defers[data.id];
				if ('error' in data) {
					defer.reject(data.error);
				} else {
					defer.resolve(data.val);
				}
			} else {
				if ('error' in data) {
					throw data.error;
				}
			}
		}
	}

	/** @internal */
	private postCall(method: string, args: any[]) {
		this._port!.postMessage({
			id: -1, method, args
		} as MethodCallEventData);
	}

	/** @internal */
	private postCallWithPromise<T>(method: string, args: any[]): Promise<T> {
		const id = this._deferId++;
		if (this._deferId === Infinity || this._deferId < 0) {
			this._deferId = 0;
		}
		const promise = new Promise<T>((resolve, reject) => {
			this._defers[id] = { resolve, reject };
		});
		this._port!.postMessage({
			id, method, args
		} as MethodCallEventData);
		return promise;
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

		const port = node.port;
		this._port = port;
		port.addEventListener('message', this.onMessage.bind(this));
		port.start();
		return node;
	}

	public isInitialized() {
		return this._port !== null;
	}

	public init(_sampleRate: number) {
	}

	public close() {
		// call init instead of close
		this.postCall('init', [0]);
	}

	public isPlaying() {
		return this._status.playing;
	}

	public setInterpolation(value: InterpolationValues, channel?: number) {
		this.postCall('setInterpolation', [value, channel]);
	}

	public getGain() {
		return this._gain;
	}

	public setGain(gain: number) {
		this._gain = gain;
		this.postCallWithPromise<void>('setGain', [gain]).then(() => {
			return this.postCallWithPromise<number>('getGain', []);
		}).then((value) => {
			this._gain = value;
		});
	}

	public waitForVoicesStopped() {
		return this.postCallWithPromise<void>('waitForVoicesStopped', []);
	}

	public loadSFont(bin: ArrayBuffer) {
		return this.postCallWithPromise<number>('loadSFont', [bin]);
	}

	public unloadSFont(id: number) {
		this.postCall('unloadSFont', [id]);
	}

	public unloadSFontAsync(id: number) {
		return this.postCallWithPromise<void>('unloadSFont', [id]);
	}

	public getSFontBankOffset(id: number) {
		return this.postCallWithPromise<number>('getSFontBankOffset', [id]);
	}
	public setSFontBankOffset(id: number, offset: number) {
		this.postCall('setSFontBankOffset', [id, offset]);
	}

	public render() {
		throw new Error('Unexpected call');
	}

	public midiNoteOn(chan: number, key: number, vel: number) {
		this.postCall('midiNoteOn', [chan, key, vel]);
	}
	public midiNoteOff(chan: number, key: number) {
		this.postCall('midiNoteOff', [chan, key]);
	}
	public midiKeyPressure(chan: number, key: number, val: number) {
		this.postCall('midiKeyPressure', [chan, key, val]);
	}
	public midiControl(chan: number, ctrl: number, val: number) {
		this.postCall('midiControl', [chan, ctrl, val]);
	}
	public midiProgramChange(chan: number, prognum: number) {
		this.postCall('midiProgramChange', [chan, prognum]);
	}
	public midiChannelPressure(chan: number, val: number) {
		this.postCall('midiChannelPressure', [chan, val]);
	}
	public midiPitchBend(chan: number, val: number) {
		this.postCall('midiPitchBend', [chan, val]);
	}
	public midiSysEx(data: Uint8Array) {
		this.postCall('midiSysEx', [data]);
	}

	public midiPitchWheelSensitivity(chan: number, val: number) {
		this.postCall('midiPitchWheelSensitivity', [chan, val]);
	}
	public midiBankSelect(chan: number, bank: number) {
		this.postCall('midiBankSelect', [chan, bank]);
	}
	public midiSFontSelect(chan: number, sfontId: number) {
		this.postCall('midiSFontSelect', [chan, sfontId]);
	}
	public midiUnsetProgram(chan: number) {
		this.postCall('midiUnsetProgram', [chan]);
	}
	public midiProgramReset() {
		this.postCall('midiProgramReset', []);
	}
	public midiSystemReset() {
		this.postCall('midiSystemReset', []);
	}
	public midiAllNotesOff(chan?: number) {
		this.postCall('midiAllNotesOff', [chan]);
	}
	public midiAllSoundsOff(chan?: number) {
		this.postCall('midiAllSoundsOff', [chan]);
	}
	public midiSetChannelType(chan: number, isDrum: boolean) {
		this.postCall('midiSetChannelType', [chan, isDrum]);
	}

	public resetPlayer() {
		return this.postCallWithPromise<void>('resetPlayer', []);
	}

	public isPlayerPlaying() {
		return this._status.playerPlaying;
	}

	public addSMFDataToPlayer(bin: ArrayBuffer) {
		return this.postCallWithPromise<void>('addSMFDataToPlayer', [bin]);
	}

	public playPlayer() {
		return this.postCallWithPromise<void>('playPlayer', []);
	}

	public stopPlayer() {
		this.postCall('stopPlayer', []);
	}

	public waitForPlayerStopped() {
		return this.postCallWithPromise<void>('waitForPlayerStopped', []);
	}
}
