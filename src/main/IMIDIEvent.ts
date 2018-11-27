
/** Represents the MIDI event data */
export default interface IMIDIEvent {
	getType(): number;
	setType(value: number): void;
	getChannel(): number;
	setChannel(value: number): void;
	getKey(): number;
	setKey(value: number): void;
	getVelocity(): number;
	setVelocity(value: number): void;
	getControl(): number;
	setControl(value: number): void;
	getValue(): number;
	setValue(value: number): void;
	getProgram(): number;
	setProgram(value: number): void;
	getPitch(): number;
	setPitch(value: number): void;

	setSysEx(data: Uint8Array): void;
	setText(data: Uint8Array): void;
	setLyrics(data: Uint8Array): void;
}
