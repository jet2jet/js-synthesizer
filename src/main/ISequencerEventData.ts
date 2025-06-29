
import SequencerEvent, { EventType } from './SequencerEvent';
import { _module } from './WasmManager';

/** @internal */
import PointerType, { INVALID_POINTER } from './PointerType';
/** @internal */
import SequencerEventData from './SequencerEventData';

/** Event data for sequencer callback. Only available in the callback function due to the instance lifetime. */
export default interface ISequencerEventData {
	/** Returns the event type */
	getType(): EventType;
	/** Returns the source client id of event */
	getSource(): number;
	/** Returns the destination client id of event */
	getDest(): number;
	getChannel(): number;
	getKey(): number;
	getVelocity(): number;
	getControl(): number;
	getValue(): number;
	getProgram(): number;
	getData(): number;
	getDuration(): number;
	getBank(): number;
	getPitch(): number;
	getSFontId(): number;
}

/** @internal */
export function rewriteEventDataImpl(ev: PointerType, event: SequencerEvent): boolean {
	switch (event.type) {
		case EventType.Note:
		case 'note':
			_module._fluid_event_note(ev, event.channel, event.key, event.vel, event.duration);
			break;
		case EventType.NoteOn:
		case 'noteon':
		case 'note-on':
			_module._fluid_event_noteon(ev, event.channel, event.key, event.vel);
			break;
		case EventType.NoteOff:
		case 'noteoff':
		case 'note-off':
			_module._fluid_event_noteoff(ev, event.channel, event.key);
			break;
		case EventType.AllSoundsOff:
		case 'allsoundsoff':
		case 'all-sounds-off':
			_module._fluid_event_all_sounds_off(ev, event.channel);
			break;
		case EventType.AllNotesOff:
		case 'allnotesoff':
		case 'all-notes-off':
			_module._fluid_event_all_notes_off(ev, event.channel);
			break;
		case EventType.BankSelect:
		case 'bankselect':
		case 'bank-select':
			_module._fluid_event_bank_select(ev, event.channel, event.bank);
			break;
		case EventType.ProgramChange:
		case 'programchange':
		case 'program-change':
			_module._fluid_event_program_change(ev, event.channel, event.preset);
			break;
		case EventType.ProgramSelect:
		case 'programselect':
		case 'program-select':
			_module._fluid_event_program_select(ev, event.channel, event.sfontId, event.bank, event.preset);
			break;
		case EventType.ControlChange:
		case 'controlchange':
		case 'control-change':
			_module._fluid_event_control_change(ev, event.channel, event.control, event.value);
			break;
		case EventType.PitchBend:
		case 'pitchbend':
		case 'pitch-bend':
			_module._fluid_event_pitch_bend(ev, event.channel, event.value);
			break;
		case EventType.PitchWheelSensitivity:
		case 'pitchwheelsens':
		case 'pitchwheelsensitivity':
		case 'pitch-wheel-sens':
		case 'pitch-wheel-sensitivity':
			_module._fluid_event_pitch_wheelsens(ev, event.channel, event.value);
			break;
		case EventType.Modulation:
		case 'modulation':
			_module._fluid_event_modulation(ev, event.channel, event.value);
			break;
		case EventType.Sustain:
		case 'sustain':
			_module._fluid_event_sustain(ev, event.channel, event.value);
			break;
		case EventType.Pan:
		case 'pan':
			_module._fluid_event_pan(ev, event.channel, event.value);
			break;
		case EventType.Volume:
		case 'volume':
			_module._fluid_event_volume(ev, event.channel, event.value);
			break;
		case EventType.ReverbSend:
		case 'reverb':
		case 'reverbsend':
		case 'reverb-send':
			_module._fluid_event_reverb_send(ev, event.channel, event.value);
			break;
		case EventType.ChorusSend:
		case 'chorus':
		case 'chorussend':
		case 'chorus-send':
			_module._fluid_event_chorus_send(ev, event.channel, event.value);
			break;
		case EventType.KeyPressure:
		case 'keypressure':
		case 'key-pressure':
		case 'aftertouch':
			_module._fluid_event_key_pressure(ev, event.channel, event.key, event.value);
			break;
		case EventType.ChannelPressure:
		case 'channelpressure':
		case 'channel-pressure':
		case 'channel-aftertouch':
			_module._fluid_event_channel_pressure(ev, event.channel, event.value);
			break;
		case EventType.SystemReset:
		case 'systemreset':
		case 'system-reset':
			_module._fluid_event_system_reset(ev);
			break;
		case EventType.Timer:
		case 'timer':
			_module._fluid_event_timer(ev, event.data);
			break;
		default:
			// 'typeof event' must be 'never' here
			return false;
	}
	return true;
}

/**
 * Rewrites event data with specified SequencerEvent object.
 * @param data destination instance
 * @param event source data
 * @return true if succeeded
 */
export function rewriteEventData(data: ISequencerEventData, event: SequencerEvent): boolean {
	if (!data || !(data instanceof SequencerEventData)) {
		return false;
	}
	const ev = data.getRaw();
	if (ev === INVALID_POINTER) {
		return false;
	}
	return rewriteEventDataImpl(ev, event);
}
