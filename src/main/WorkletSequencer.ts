
import ISequencer from './ISequencer';
import ISynthesizer from './ISynthesizer';
import SequencerEvent from './SequencerEvent';

import AudioWorkletNodeSynthesizer from './AudioWorkletNodeSynthesizer';

import * as MethodMessaging from './MethodMessaging';

/** @internal */
export default class WorkletSequencer implements ISequencer {
	/** @internal */
	private _messaging: MethodMessaging.CallMessageInstance | null;

	constructor(port: MessagePort) {
		this._messaging = MethodMessaging.initializeCallPort(port);
	}

	public close(): void {
		MethodMessaging.postCall(this._messaging!, 'close', []);
	}
	public registerSynthesizer(synth: ISynthesizer | number): Promise<void> {
		let val: Promise<number>;
		if (synth instanceof AudioWorkletNodeSynthesizer) {
			val = synth._getRawSynthesizer();
		} else {
			return Promise.reject(new TypeError('\'synth\' is not a compatible type instance'));
		}
		return val.then((v) => MethodMessaging.postCallWithPromise<void>(this._messaging!, 'registerSynthesizer', [v]));
	}
	public setTimeScale(scale: number): void {
		MethodMessaging.postCall(this._messaging!, 'setTimeScale', [scale]);
	}
	public getTimeScale(): Promise<number> {
		return MethodMessaging.postCallWithPromise<number>(this._messaging!, 'getTimeScale', []);
	}
	public getTick(): Promise<number> {
		return MethodMessaging.postCallWithPromise<number>(this._messaging!, 'getTick', []);
	}
	public sendEventAt(event: SequencerEvent, tick: number, isAbsolute: boolean): void {
		MethodMessaging.postCall(this._messaging!, 'sendEventAt', [event, tick, isAbsolute]);
	}
}
