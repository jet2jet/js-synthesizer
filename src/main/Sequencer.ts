
import ISequencer from './ISequencer';
import ISynthesizer from './ISynthesizer';
import PointerType, { INVALID_POINTER, UniquePointerType } from './PointerType';
import SequencerEvent, { EventType } from './SequencerEvent';

import Synthesizer from './Synthesizer';

type SequencerId = UniquePointerType<'sequencer_id'>;

const _module: any = typeof AudioWorkletGlobalScope !== 'undefined' ?
	AudioWorkletGlobalScope.wasmModule : Module;

function makeEvent(event: SequencerEvent): PointerType | null {
	const ev = _module._new_fluid_event();
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
		default:
			// 'typeof event' must be 'never'
			_module._delete_fluid_event(ev);
			return null;
	}
	return ev;
}

/** @internal */
export default class Sequencer implements ISequencer {

	private _seq: SequencerId;

	constructor() {
		this._seq = INVALID_POINTER;
	}

	/** @internal */
	public _initialize(): Promise<void> {
		this.close();
		this._seq = _module._new_fluid_sequencer2(0);
		return Promise.resolve();
	}

	public close() {
		if (this._seq !== INVALID_POINTER) {
			_module._delete_fluid_sequencer(this._seq);
			this._seq = INVALID_POINTER;
		}
	}

	public registerSynthesizer(synth: ISynthesizer | number): Promise<void> {
		let val: number;
		if (typeof synth === 'number') {
			val = synth;
		} else if (synth instanceof Synthesizer) {
			val = synth.getRawSynthesizer();
		} else {
			return Promise.reject(new TypeError('\'synth\' is not a compatible type instance'));
		}

		_module._fluid_sequencer_register_fluidsynth(this._seq, val);
		return Promise.resolve();
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
			_module._fluid_sequencer_send_at(this._seq, ev, tick, isAbsolute ? 1 : 0);
			_module._delete_fluid_event(ev);
		}
	}
}
