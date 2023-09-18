
import { InterpolationValues, PlayerSetTempoType } from './Constants';
import SynthesizerSettings from './SynthesizerSettings';

/**
 * Abstract synthesizer object.
 */
export default interface ISynthesizer {
	/// --- Basic or configuration methods ---

	/** Return whether the instance (synthesizer) is initialized. */
	isInitialized(): boolean;
	/**
	 * Initialize the instance. If already initialized, the instance is re-initialized.
	 * @param sampleRate sample rate for rendered frames
	 * @param settings synthesizer settings
	 */
	init(sampleRate: number, settings?: SynthesizerSettings): void;
	/**
	 * Terminate the instance.
	 * You can call this method even if not initialized.
	 */
	close(): void;
	/**
	 * Return whether the synthesizer is playing any voices.
	 * You can call this method even if not initialized.
	 */
	isPlaying(): boolean;
	/**
	 * Specify the interpolation value, which affects speed and quality.
	 * @param value the interpolation value (InterpolationValues)
	 * @param channel the channel to specify (-1 or undefined to all channels)
	 */
	setInterpolation(value: InterpolationValues, channel?: number): void;
	/** Return the current gain value */
	getGain(): number;
	/**
	 * Specify the master gain value for the synthesizer.
	 * @param gain the gain value (0.0-10.0)
	 */
	setGain(gain: number): void;
	/**
	 * Specify the channel type, especially whether the channel is for drums.
	 * init() must be called before calling this method.
	 * @param channel MIDI channel number (0 to MIDI channel count - 1)
	 * @param isDrum true for drums, false for melodic channels
	 */
	setChannelType(channel: number, isDrum: boolean): void;
	/** Wait for all voices stopped. */
	waitForVoicesStopped(): Promise<void>;

	// ----- SoundFont methods -----

	/**
	 * Load SoundFont data into the synthesizer.
	 * init() must be called before calling this method.
	 * @param bin SoundFont binary data
	 * @return resolved with SFont id (larger than zero) if succeeded, or rejected if failed
	 */
	loadSFont(bin: ArrayBuffer): Promise<number>;
	/**
	 * Unload SoundFont from the synthesizer.
	 * Before unloading, the instance will wait for all sound off.
	 * init() must be called before calling this method.
	 * @param id SoundFont ID returned by loadSFont
	 */
	unloadSFont(id: number): void;
	/**
	 * Unload SoundFont from the synthesizer.
	 * Before unloading, the instance will wait for all sound off.
	 * init() must be called before calling this method.
	 * @param id SoundFont ID returned by loadSFont()
	 */
	unloadSFontAsync(id: number): Promise<void>;
	/**
	 * Return the bank offset of SoundFont.
	 * @param id SoundFont ID returned by loadSFont()
	 * @return resolved with offset value or zero if id is invalid
	 */
	getSFontBankOffset(id: number): Promise<number>;
	/**
	 * Specify the bank offset of SoundFont.
	 * @param id SoundFont ID returned by loadSFont()
	 * @param offset offset value for bank number
	 */
	setSFontBankOffset(id: number, offset: number): void;

	// ----- Render methods -----

	/**
	 * Render audio frames from the synthesizer output.
	 * init() must be called before calling this method.
	 * @param outBuffer the buffer object that receives frames
	 */
	render(outBuffer: AudioBuffer | Float32Array[]): void;

	// ----- MIDI channel message methods -----

	// NOTE: these messages will not check instance status and parameters because of performance.

	/**
	 * Send a note-on event.
	 * @param chan MIDI channel number (0 to MIDI channel count - 1)
	 * @param key MIDI note number (0-127)
	 * @param vel MIDI velocity (0-127, 0=noteoff)
	 */
	midiNoteOn(chan: number, key: number, vel: number): void;
	/**
	 * Sends a note-off event.
	 * @param chan MIDI channel number (0 to MIDI channel count - 1)
	 * @param key MIDI note number (0-127)
	 */
	midiNoteOff(chan: number, key: number): void;
	/**
	 * Set the MIDI polyphonic key pressure (aftertouch) controller value.
	 * @param chan MIDI channel number (0 to MIDI channel count - 1)
	 * @param key MIDI key number (0-127)
	 * @param val MIDI key pressure value (0-127)
	 */
	midiKeyPressure(chan: number, key: number, val: number): void;
	/**
	 * Send a MIDI controller event on a MIDI channel.
	 * @param chan MIDI channel number (0 to MIDI channel count - 1)
	 * @param num MIDI controller number (0-127)
	 * @param val MIDI controller value (0-127)
	 */
	midiControl(chan: number, ctrl: number, val: number): void;
	/**
	 * Send a program change event on a MIDI channel.
	 * @param chan MIDI channel number (0 to MIDI channel count - 1)
	 * @param prognum MIDI program number (0-127)
	 */
	midiProgramChange(chan: number, prognum: number): void;
	/**
	 * Set the MIDI channel pressure controller value.
	 * @param chan MIDI channel number (0 to MIDI channel count - 1)
	 * @param val MIDI channel pressure value (0-127)
	 */
	midiChannelPressure(chan: number, val: number): void;
	/**
	 * Set the MIDI pitch bend controller value on a MIDI channel.
	 * @param chan MIDI channel number (0 to MIDI channel count - 1)
	 * @param val MIDI pitch bend value (0-16383 with 8192 being center)
	 */
	midiPitchBend(chan: number, val: number): void;
	/**
	 * Process a MIDI SYSEX (system exclusive) message.
	 * @param data buffer containing SYSEX data (not including 0xF0 and 0xF7)
	 */
	midiSysEx(data: Uint8Array): void;

	/**
	 * Set MIDI pitch wheel sensitivity on a MIDI channel.
	 * @param chan MIDI channel number (0 to MIDI channel count - 1)
	 * @param val Pitch wheel sensitivity value in semitones
	 */
	midiPitchWheelSensitivity(chan: number, val: number): void;
	/**
	 * Set instrument bank number on a MIDI channel.
	 * @param chan MIDI channel number (0 to MIDI channel count - 1)
	 * @param bank MIDI bank number
	 */
	midiBankSelect(chan: number, bank: number): void;
	/**
	 * Set SoundFont ID on a MIDI channel.
	 * @param chan MIDI channel number (0 to MIDI channel count - 1)
	 * @param sfontId ID of a loaded SoundFont
	 */
	midiSFontSelect(chan: number, sfontId: number): void;
	/**
	 * Change program of specified channel, with loaded SoundFont.
	 * @param chan MIDI channel number (0 to MIDI channel count - 1)
	 * @param sfontId ID of a loaded SoundFont
	 * @param bank bank number in the SoundFont
	 * @param presetNum preset number in the SoundFont
	 */
	midiProgramSelect(chan: number, sfontId: number, bank: number, presetNum: number): void;
	midiUnsetProgram(chan: number): void;
	midiProgramReset(): void;
	midiSystemReset(): void;
	midiAllNotesOff(chan?: number): void;
	midiAllSoundsOff(chan?: number): void;
	midiSetChannelType(chan: number, isDrum: boolean): void;

	// ----- Player methods -----
	/**
	 * Re-initialize the player, playing SMF (MIDI) file data.
	 * The player is initialized via init() method, but you can reset
	 * the player by using this method.
	 * (this means all added SMF data will be removed.)
	 * init() must be called before calling this method.
	 * @return resolve if the player is available or reject if failed
	 */
	resetPlayer(): Promise<void>;
	/**
	 * Closes the player.
	 *
	 * The player is initialized automatically when player methods
	 * such as `addSMFDataToPlayer` and `playPlayer` are called,
	 * but not closed automatically. When the player is available,
	 * and its status is not playing, the sound will always be turned off
	 * (this is FluidSynth behavior), so if you want to avoid this,
	 * call this method explicitly after using the player.
	 */
	closePlayer(): void;
	/**
	 * Return whether the player is processing files.
	 * Note that this method returns false even if some voices are still active (please check isPlaying()).
	 * You can call this method even if not initialized.
	 */
	isPlayerPlaying(): boolean;
	/**
	 * Add SMF file data to the player.
	 * initPlayer() must be called before calling this method.
	 * @return resolved if succeeded, or rejected if failed
	 */
	addSMFDataToPlayer(bin: ArrayBuffer): Promise<void>;
	/**
	 * Start playing files with the player instance.
	 * initPlayer() must be called before calling this method.
	 * @return resolved if playing process is started or rejected if failed
	 */
	playPlayer(): Promise<void>;
	/**
	 * Stop playing files.
	 * You can call this method even if not initialized.
	 */
	stopPlayer(): void;
	/**
	 * Retrieve current (timing that method called) tick value of the player.
	 * initPlayer() must be called before calling this method.
	 * @return resolved with the tick value
	 */
	retrievePlayerCurrentTick(): Promise<number>;
	/**
	 * Retrieve tick value of the last event timing of current playing data.
	 * initPlayer() must be called before calling this method.
	 * @return resolved with the tick value
	 */
	retrievePlayerTotalTicks(): Promise<number>;
	/**
	 * Retrieve current (timing that method called) BPM value of the player.
	 * The BPM value is calculated by dividing 60000000 by the MIDI tempo value.
	 * initPlayer() must be called before calling this method.
	 * @return resolved with the BPM value
	 */
	retrievePlayerBpm(): Promise<number>;
	/**
	 * Retrieve current (timing that method called) MIDI tempo value of the player.
	 * initPlayer() must be called before calling this method.
	 * @return resolved with the MIDI tempo value
	 */
	retrievePlayerMIDITempo(): Promise<number>;
	/**
	 * Seeks the playing point of the player.
	 * initPlayer() must be called before calling this method.
	 * @param ticks the absolute tick value to seek (0 refers the first position)
	 */
	seekPlayer(ticks: number): void;
	/**
	 * Sets the loop for the playlist in the player.
	 * @param loopTimes loop count (`-1` for infinite loop)
	 */
	setPlayerLoop(loopTimes: number): void;
	/**
	 * Sets the tempo for the player.
	 * @param tempoType tempo value type for `tempo`
	 * @param tempo tempo value
	 */
	setPlayerTempo(tempoType: PlayerSetTempoType, tempo: number): void;
	/**
	 * Wait for finishing player process.
	 * Note that even if resolved, some voices may still be playing.
	 */
	waitForPlayerStopped(): Promise<void>;
}
