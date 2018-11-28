
import { EventType } from './SequencerEvent';
import ISequencerEventData from './ISequencerEventData';
import PointerType, { INVALID_POINTER } from './PointerType';

/** @internal */
export default class SequencerEventData implements ISequencerEventData {
	/** @internal */
	constructor(private _ptr: PointerType, private _module: any) {
	}

	/** @internal */
	public getRaw() {
		return this._ptr;
	}

	/** @internal */
	public dispose() {
		this._ptr = INVALID_POINTER;
	}

	public getType(): EventType {
		if (this._ptr === INVALID_POINTER) return -1 as any as EventType;
		return this._module._fluid_event_get_type(this._ptr);
	}
	public getSource(): number {
		if (this._ptr === INVALID_POINTER) return -1;
		return this._module._fluid_event_get_source(this._ptr);
	}
	public getDest(): number {
		if (this._ptr === INVALID_POINTER) return -1;
		return this._module._fluid_event_get_dest(this._ptr);
	}
	public getChannel(): number {
		if (this._ptr === INVALID_POINTER) return -1;
		return this._module._fluid_event_get_channel(this._ptr);
	}
	public getKey(): number {
		if (this._ptr === INVALID_POINTER) return -1;
		return this._module._fluid_event_get_key(this._ptr);
	}
	public getVelocity(): number {
		if (this._ptr === INVALID_POINTER) return -1;
		return this._module._fluid_event_get_velocity(this._ptr);
	}
	public getControl(): number {
		if (this._ptr === INVALID_POINTER) return -1;
		return this._module._fluid_event_get_control(this._ptr);
	}
	public getValue(): number {
		if (this._ptr === INVALID_POINTER) return -1;
		return this._module._fluid_event_get_value(this._ptr);
	}
	public getProgram(): number {
		if (this._ptr === INVALID_POINTER) return -1;
		return this._module._fluid_event_get_program(this._ptr);
	}
	public getData(): number {
		if (this._ptr === INVALID_POINTER) return -1;
		return this._module._fluid_event_get_data(this._ptr);
	}
	public getDuration(): number {
		if (this._ptr === INVALID_POINTER) return -1;
		return this._module._fluid_event_get_duration(this._ptr);
	}
	public getBank(): number {
		if (this._ptr === INVALID_POINTER) return -1;
		return this._module._fluid_event_get_bank(this._ptr);
	}
	public getPitch(): number {
		if (this._ptr === INVALID_POINTER) return -1;
		return this._module._fluid_event_get_pitch(this._ptr);
	}
	public getSFontId(): number {
		if (this._ptr === INVALID_POINTER) return -1;
		return this._module._fluid_event_get_sfont_id(this._ptr);
	}
}
