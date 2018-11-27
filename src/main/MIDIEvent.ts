
import IMIDIEvent from './IMIDIEvent';
import PointerType, { UniquePointerType } from './PointerType';

/** @internal */
export type MIDIEventType = UniquePointerType<'midi_event'>;

/** @internal */
export default class MIDIEvent implements IMIDIEvent {

	/** @internal */
	constructor(private _ptr: MIDIEventType, private _module: any) {
	}

	public getType(): number {
		return this._module._fluid_midi_event_get_type(this._ptr);
	}
	public setType(value: number): void {
		this._module._fluid_midi_event_set_type(this._ptr, value);
	}
	public getChannel(): number {
		return this._module._fluid_midi_event_get_channel(this._ptr);
	}
	public setChannel(value: number): void {
		this._module._fluid_midi_event_set_channel(this._ptr, value);
	}
	public getKey(): number {
		return this._module._fluid_midi_event_get_key(this._ptr);
	}
	public setKey(value: number): void {
		this._module._fluid_midi_event_set_key(this._ptr, value);
	}
	public getVelocity(): number {
		return this._module._fluid_midi_event_get_velocity(this._ptr);
	}
	public setVelocity(value: number): void {
		this._module._fluid_midi_event_set_velocity(this._ptr, value);
	}
	public getControl(): number {
		return this._module._fluid_midi_event_get_control(this._ptr);
	}
	public setControl(value: number): void {
		this._module._fluid_midi_event_set_control(this._ptr, value);
	}
	public getValue(): number {
		return this._module._fluid_midi_event_get_value(this._ptr);
	}
	public setValue(value: number): void {
		this._module._fluid_midi_event_set_value(this._ptr, value);
	}
	public getProgram(): number {
		return this._module._fluid_midi_event_get_program(this._ptr);
	}
	public setProgram(value: number): void {
		this._module._fluid_midi_event_set_program(this._ptr, value);
	}
	public getPitch(): number {
		return this._module._fluid_midi_event_get_pitch(this._ptr);
	}
	public setPitch(value: number): void {
		this._module._fluid_midi_event_set_pitch(this._ptr, value);
	}

	public setSysEx(data: Uint8Array): void {
		const size = data.byteLength;
		const ptr: PointerType = this._module._malloc(size);
		const ptrView = new Uint8Array(this._module.HEAPU8.buffer, ptr, size);
		ptrView.set(data);
		this._module._fluid_midi_event_set_sysex(this._ptr, ptr, size, 1);
	}
	public setText(data: Uint8Array): void {
		const size = data.byteLength;
		const ptr: PointerType = this._module._malloc(size);
		const ptrView = new Uint8Array(this._module.HEAPU8.buffer, ptr, size);
		ptrView.set(data);
		this._module._fluid_midi_event_set_text(this._ptr, ptr, size, 1);
	}
	public setLyrics(data: Uint8Array): void {
		const size = data.byteLength;
		const ptr: PointerType = this._module._malloc(size);
		const ptrView = new Uint8Array(this._module.HEAPU8.buffer, ptr, size);
		ptrView.set(data);
		this._module._fluid_midi_event_set_lyrics(this._ptr, ptr, size, 1);
	}
}
