
import ISequencer, { ClientInfo } from './ISequencer';
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

	/** @internal */
	public getRaw(): Promise<number> {
		return MethodMessaging.postCallWithPromise<number>(this._messaging!, 'getRaw', []);
	}
	/** @internal */
	public registerSequencerClientByName(clientName: string, callbackName: string, param: number): Promise<number> {
		return this.getRaw().then((seqPtr) => MethodMessaging.postCallWithPromise<number>(
			this._messaging!,
			'registerSequencerClientByName',
			[seqPtr, clientName, callbackName, param]
		));
	}

	public close(): void {
		MethodMessaging.postCall(this._messaging!, 'close', []);
	}
	public registerSynthesizer(synth: ISynthesizer | number): Promise<number> {
		let val: Promise<number>;
		if (synth instanceof AudioWorkletNodeSynthesizer) {
			val = synth._getRawSynthesizer();
		} else {
			return Promise.reject(new TypeError('\'synth\' is not a compatible type instance'));
		}
		return val.then((v) => MethodMessaging.postCallWithPromise<number>(this._messaging!, 'registerSynthesizer', [v]));
	}
	public unregisterClient(clientId: number): void {
		MethodMessaging.postCall(this._messaging!, 'unregisterClient', [clientId]);
	}
	public getAllRegisteredClients(): Promise<ClientInfo[]> {
		return MethodMessaging.postCallWithPromise<ClientInfo[]>(this._messaging!, 'getAllRegisteredClients', []);
	}
	public getClientCount(): Promise<number> {
		return MethodMessaging.postCallWithPromise<number>(this._messaging!, 'getClientCount', []);
	}
	public getClientInfo(index: number): Promise<ClientInfo> {
		return MethodMessaging.postCallWithPromise<ClientInfo>(this._messaging!, 'getClientInfo', [index]);
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
	public sendEventToClientAt(clientId: number, event: SequencerEvent, tick: number, isAbsolute: boolean): void {
		MethodMessaging.postCall(this._messaging!, 'sendEventToClientAt', [clientId, event, tick, isAbsolute]);
	}
	public removeAllEvents(): void {
		MethodMessaging.postCall(this._messaging!, 'removeAllEvents', []);
	}
	public removeAllEventsFromClient(clientId: number): void {
		MethodMessaging.postCall(this._messaging!, 'removeAllEventsFromClient', [clientId]);
	}

	public processSequencer(msecToProcess: number) {
		MethodMessaging.postCall(this._messaging!, 'processSequencer', [msecToProcess]);
	}
}
