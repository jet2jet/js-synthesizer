
import ISequencer, { ClientInfo } from './ISequencer';
import ISequencerEventData, { rewriteEventDataImpl } from './ISequencerEventData';
import ISynthesizer from './ISynthesizer';
import PointerType, { INVALID_POINTER, UniquePointerType } from './PointerType';
import SequencerEvent from './SequencerEvent';
import SequencerEventData from './SequencerEventData';
import { _module, _removeFunction, bindFunctions } from './WasmManager';

import Synthesizer from './Synthesizer';

type SequencerPointer = UniquePointerType<'sequencer_ptr'>;
type SequencerId = number;

let bound = false;
let fluid_sequencer_get_client_name: (seq: number, id: number) => string;

function bindFunctionsForSequencer() {
	if (bound) {
		return;
	}
	bindFunctions();
	bound = true;

	fluid_sequencer_get_client_name =
		_module.cwrap('fluid_sequencer_get_client_name', 'string', ['number', 'number']);
}

function makeEvent(event: SequencerEvent): PointerType | null {
	const ev = _module._new_fluid_event();
	if (!rewriteEventDataImpl(ev, event)) {
		_module._delete_fluid_event(ev);
		return null;
	}
	return ev;
}

/** @internal */
export default class Sequencer implements ISequencer {

	private _seq: SequencerPointer;
	private _seqId: SequencerId;

	/** @internal */
	public _clientFuncMap: { [id: number]: number };

	constructor() {
		bindFunctionsForSequencer();

		this._seq = INVALID_POINTER;
		this._seqId = -1;
		this._clientFuncMap = {};
	}

	/** @internal */
	public _initialize(): Promise<void> {
		this.close();
		this._seq = _module._new_fluid_sequencer2(0);
		this._seqId = -1;
		return Promise.resolve();
	}

	/** @internal */
	public getRaw() {
		return this._seq;
	}

	public close() {
		if (this._seq !== INVALID_POINTER) {
			Object.keys(this._clientFuncMap).forEach((clientIdStr) => {
				this.unregisterClient(Number(clientIdStr));
			});
			this.unregisterClient(-1);
			_module._delete_fluid_sequencer(this._seq);
			this._seq = INVALID_POINTER;
		}
	}

	public registerSynthesizer(synth: ISynthesizer | number): Promise<number> {
		if (this._seqId !== -1) {
			_module._fluid_sequencer_unregister_client(this._seq, this._seqId);
			this._seqId = -1;
		}
		let val: number;
		if (typeof synth === 'number') {
			val = synth;
		} else if (synth instanceof Synthesizer) {
			val = synth.getRawSynthesizer();
		} else {
			return Promise.reject(new TypeError('\'synth\' is not a compatible type instance'));
		}

		this._seqId = _module._fluid_sequencer_register_fluidsynth(this._seq, val);
		return Promise.resolve(this._seqId);
	}

	public unregisterClient(clientId: number): void {
		if (clientId === -1) {
			clientId = this._seqId;
			if (clientId === -1) {
				return;
			}
		}

		// send 'unregistering' event
		const ev = _module._new_fluid_event();
		_module._fluid_event_set_source(ev, -1);
		_module._fluid_event_set_dest(ev, clientId);
		_module._fluid_event_unregistering(ev);
		_module._fluid_sequencer_send_now(this._seq, ev);
		_module._delete_fluid_event(ev);

		_module._fluid_sequencer_unregister_client(this._seq, clientId);
		if (this._seqId === clientId) {
			this._seqId = -1;
		} else {
			const map = this._clientFuncMap;
			if (map[clientId]) {
				_removeFunction(map[clientId]);
				delete map[clientId];
			}
		}
	}

	public getAllRegisteredClients(): Promise<ClientInfo[]> {
		const c = _module._fluid_sequencer_count_clients(this._seq);
		const r: ClientInfo[] = [];
		for (let i = 0; i < c; ++i) {
			const id = _module._fluid_sequencer_get_client_id(this._seq, i);
			const name = fluid_sequencer_get_client_name(this._seq, id);
			r.push({ clientId: id, name: name });
		}
		return Promise.resolve(r);
	}

	public getClientCount(): Promise<number> {
		return Promise.resolve<number>(_module._fluid_sequencer_count_clients(this._seq));
	}

	public getClientInfo(index: number): Promise<ClientInfo> {
		const id = _module._fluid_sequencer_get_client_id(this._seq, index);
		const name = fluid_sequencer_get_client_name(this._seq, id);
		return Promise.resolve<ClientInfo>({ clientId: id, name: name });
	}

	public setTimeScale(scale: number): void {
		_module._fluid_sequencer_set_time_scale(this._seq, scale);
	}

	public getTimeScale(): Promise<number> {
		return Promise.resolve(_module._fluid_sequencer_get_time_scale(this._seq));
	}

	public getTick(): Promise<number> {
		return Promise.resolve(_module._fluid_sequencer_get_tick(this._seq));
	}

	public sendEventAt(event: SequencerEvent, tick: number, isAbsolute: boolean): void {
		const ev = makeEvent(event);
		if (ev !== null) {
			// send to all clients
			const count = _module._fluid_sequencer_count_clients(this._seq);
			for (let i = 0; i < count; ++i) {
				const id: number = _module._fluid_sequencer_get_client_id(this._seq, i);
				_module._fluid_event_set_dest(ev, id);
				_module._fluid_sequencer_send_at(this._seq, ev, tick, isAbsolute ? 1 : 0);
			}
			_module._delete_fluid_event(ev);
		}
	}

	public sendEventToClientAt(clientId: number, event: SequencerEvent, tick: number, isAbsolute: boolean): void {
		const ev = makeEvent(event);
		if (ev !== null) {
			_module._fluid_event_set_dest(ev, clientId === -1 ? this._seqId : clientId);
			_module._fluid_sequencer_send_at(this._seq, ev, tick, isAbsolute ? 1 : 0);
			_module._delete_fluid_event(ev);
		}
	}

	/** @internal */
	public sendEventToClientNow(clientId: number, event: SequencerEvent): void {
		const ev = makeEvent(event);
		if (ev !== null) {
			_module._fluid_event_set_dest(ev, clientId === -1 ? this._seqId : clientId);
			_module._fluid_sequencer_send_now(this._seq, ev);
			_module._delete_fluid_event(ev);
		}
	}

	/** @internal */
	public sendEventNow(clientId: number, eventData: ISequencerEventData): void {
		if (!(eventData instanceof SequencerEventData)) {
			return;
		}
		const ev = eventData.getRaw();
		if (ev !== INVALID_POINTER) {
			_module._fluid_event_set_dest(ev, clientId === -1 ? this._seqId : clientId);
			_module._fluid_sequencer_send_now(this._seq, ev);
		}
	}

	public removeAllEvents(): void {
		_module._fluid_sequencer_remove_events(this._seq, -1, -1, -1);
	}

	public removeAllEventsFromClient(clientId: number): void {
		_module._fluid_sequencer_remove_events(this._seq, -1, clientId === -1 ? this._seqId : clientId, -1);
	}

	public processSequencer(msecToProcess: number) {
		if (this._seq !== INVALID_POINTER) {
			_module._fluid_sequencer_process(this._seq, msecToProcess);
		}
	}

	/** @internal */
	public setIntervalForSequencer(msec: number) {
		return setInterval(() => this.processSequencer(msec), msec);
	}
}
