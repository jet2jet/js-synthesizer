
/** Event type value */
export const enum EventType {
	Note = 0,
	NoteOn,
	NoteOff,
	AllSoundsOff,
	AllNotesOff,
	BankSelect,
	ProgramChange,
	ProgramSelect,
	PitchBend,
	PitchWheelSensitivity,
	Modulation,
	Sustain,
	ControlChange,
	Pan,
	Volume,
	ReverbSend,
	ChorusSend,
	Timer,
	/** internally used */
	_AnyControlChange,
	ChannelPressure,
	KeyPressure,
	SystemReset,
	/** internally used */
	_Unregistering
}

export interface EventBase {
	/** event type */
	type: EventType | string;
}

/** Note on/off event with duration */
export interface NoteEvent extends EventBase {
	type: EventType.Note | 'note';
	/** MIDI channel number */
	channel: number;
	/** MIDI note key (0-127) */
	key: number;
	/** velocity value (0-127) */
	vel: number;
	/** duration in the time scale (milliseconds by default) */
	duration: number;
}

/** Note on event */
export interface NoteOnEvent extends EventBase {
	type: EventType.NoteOn | 'noteon' | 'note-on';
	/** MIDI channel number */
	channel: number;
	/** MIDI note key (0-127) */
	key: number;
	/** velocity value (0-127) */
	vel: number;
}

/** Note off event */
export interface NoteOffEvent extends EventBase {
	type: EventType.NoteOff | 'noteoff' | 'note-off';
	/** MIDI channel number */
	channel: number;
	/** MIDI note key (0-127) */
	key: number;
}

/** All sounds off event */
export interface AllSoundsOffEvent extends EventBase {
	type: EventType.AllSoundsOff | 'allsoundsoff' | 'all-sounds-off';
	/** MIDI channel number */
	channel: number;
}

/** All notes off event */
export interface AllNotesOffEvent extends EventBase {
	type: EventType.AllNotesOff | 'allnotesoff' | 'all-notes-off';
	/** MIDI channel number */
	channel: number;
}

/** Bank select event */
export interface BankSelectEvent extends EventBase {
	type: EventType.BankSelect | 'bankselect' | 'bank-select';
	/** MIDI channel number */
	channel: number;
	/** bank number (0-16383) */
	bank: number;
}

/** Program change event */
export interface ProgramChangeEvent extends EventBase {
	type: EventType.ProgramChange | 'programchange' | 'program-change';
	/** MIDI channel number */
	channel: number;
	/** preset number (0-127) */
	preset: number;
}

/** Program select event */
export interface ProgramSelectEvent extends EventBase {
	type: EventType.ProgramSelect | 'programselect' | 'program-select';
	/** MIDI channel number */
	channel: number;
	/** SoundFont ID */
	sfontId: number;
	/** bank number (0-16383) */
	bank: number;
	/** preset number (0-127) */
	preset: number;
}

/** General control change event */
export interface ControlChangeEvent extends EventBase {
	type: EventType.ControlChange | 'controlchange' | 'control-change';
	/** MIDI channel number */
	channel: number;
	/** control number (0-127) */
	control: number;
	/** value for control (0-127) */
	value: number;
}

/** Pitch bend event */
export interface PitchBendEvent extends EventBase {
	type: EventType.PitchBend | 'pitchbend' | 'pitch-bend';
	/** MIDI channel number */
	channel: number;
	/** value (0-16383, 8192 = no bend) */
	value: number;
}

/** Pitch-wheel sensitivity event */
export interface PitchWheelSensitivityEvent extends EventBase {
	type: EventType.PitchWheelSensitivity | 'pitchwheelsens' | 'pitchwheelsensitivity' |
		'pitch-wheel-sens' | 'pitch-wheel-sensitivity';
	/** MIDI channel number */
	channel: number;
	/** value in semitones */
	value: number;
}

/** Modulation event */
export interface ModulationEvent extends EventBase {
	type: EventType.Modulation | 'modulation';
	/** MIDI channel number */
	channel: number;
	/** value (0-127) */
	value: number;
}

/** Sustain event */
export interface SustainEvent extends EventBase {
	type: EventType.Sustain | 'sustain';
	/** MIDI channel number */
	channel: number;
	/** value (0-127) */
	value: number;
}

/** Pan event */
export interface PanEvent extends EventBase {
	type: EventType.Pan | 'pan';
	/** MIDI channel number */
	channel: number;
	/** value (0-127, 0: left, 127: right) */
	value: number;
}

/** Volume event */
export interface VolumeEvent extends EventBase {
	type: EventType.Volume | 'volume';
	/** MIDI channel number */
	channel: number;
	/** value (0-127) */
	value: number;
}

/** Reverb-send event */
export interface ReverbSendEvent extends EventBase {
	type: EventType.ReverbSend | 'reverb' | 'reverbsend' | 'reverb-send';
	/** MIDI channel number */
	channel: number;
	/** value (0-127) */
	value: number;
}

/** Chorus-send event */
export interface ChorusSendEvent extends EventBase {
	type: EventType.ChorusSend | 'chorus' | 'chorussend' | 'chorus-send';
	/** MIDI channel number */
	channel: number;
	/** value (0-127) */
	value: number;
}

/** Key pressure event */
export interface KeyPressureEvent extends EventBase {
	type: EventType.KeyPressure | 'keypressure' | 'key-pressure' | 'aftertouch';
	/** MIDI channel number */
	channel: number;
	/** MIDI note key */
	key: number;
	/** aftertouch value (0-127) */
	value: number;
}

/** Channel pressure event */
export interface ChannelPressureEvent extends EventBase {
	type: EventType.ChannelPressure | 'channelpressure' | 'channel-pressure' | 'channel-aftertouch';
	/** MIDI channel number */
	channel: number;
	/** aftertouch value (0-127) */
	value: number;
}

/** System reset event */
export interface SystemResetEvent extends EventBase {
	type: EventType.SystemReset | 'systemreset' | 'system-reset';
}

/** Timer event (used for marker; no effect for synthesizer) */
export interface TimerEvent extends EventBase {
	type: EventType.Timer | 'timer';
	/** any number data */
	data: number;
}

/** All available events type */
type SequencerEvent = NoteEvent | NoteOnEvent | NoteOffEvent | AllSoundsOffEvent | AllNotesOffEvent |
	BankSelectEvent | ProgramChangeEvent | ProgramSelectEvent |
	ControlChangeEvent | PitchBendEvent | PitchWheelSensitivityEvent |
	ModulationEvent | SustainEvent | PanEvent | VolumeEvent |
	ReverbSendEvent | ChorusSendEvent |
	KeyPressureEvent | ChannelPressureEvent | SystemResetEvent | TimerEvent;
export default SequencerEvent;
