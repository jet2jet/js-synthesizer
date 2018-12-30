
/**
 * Settings/configurations for synthesizer.
 *
 * Note: All default values are defined by libfluidsynth.
 */
export default interface SynthesizerSettings {
	/** Whether to activate chorus effects (default: true) */
	chorusActive?: boolean;
	/** The modulation depth of the chorus (double [0-256] / default: 8) */
	chorusDepth?: number;
	/** The output amplitude of the chorus signal (double [0-10] / default: 2) */
	chorusLevel?: number;
	/** The voice count of the chorus (int [0-99] / default: 3) */
	chorusNr?: number;
	/** The modulation speed in Hz (double [0.29-5] / default: 0.3) */
	chorusSpeed?: number;
	/**
	 * The initial gain value (double [0.0-10.0] / default: 0.2)
	 *
	 * Note: This value can be changed by ISynthesizer.setGain().
	 */
	initialGain?: number;
	/**
	 * The number of MIDI channels of the synthesizer (int [16-256] / default: 16)
	 *
	 * Note: The value must be the times of 16.
	 */
	midiChannelCount?: number;
	/** The MIDI bank select mode (default: 'gs') */
	midiBankSelect?: 'gm' | 'gs' | 'xg' | 'mma';
	/** The minimum note duration in milliseconds (int [0-65535] / default: 10) */
	minNoteLength?: number;
	/**
	 * The score value used for calculation of the overflow priority, based on the active voice count
	 * (double [-10000 - 10000] / default: 1000)
	 */
	overflowAge?: number;
	/**
	 * The value added to the overflow priority for each channels specified in overflowImportantChannels
	 * (double [-50000 - 50000] / default: 5000)
	 */
	overflowImportantValue?: number;
	/** One-based MIDI channels to use overflowImportantValue (default: (none)) */
	overflowImportantChannels?: number[];
	/** The value added to the overflow priority for percussion channels (double [-10000 - 10000] / default: 4000) */
	overflowPercussion?: number;
	/**
	 * The value added to the overflow priority for released (note-off'ed) notes
	 * (double [-10000 - 10000] / default: -2000)
	 */
	overflowReleased?: number;
	/**
	 * The value added to the overflow priority for sustained notes (double [-10000 - 10000] / default: -1000)
	 */
	overflowSustained?: number;
	/**
	 * The score value used for calculation of the overflow priority, based on the voice volume
	 * (double [-10000 - 10000] / default: 500)
	 */
	overflowVolume?: number;
	/** The maximum count of voices that can be played in parallel (int [1 - 65535] / default: 256) */
	polyphony?: number;
	/** Whether to activate reverb effects (default: true) */
	reverbActive?: boolean;
	/** The amount of reverb damping (double [0-1] / default: 0) */
	reverbDamp?: number;
	/** The reverb output amplitude (double [0-1] / default: 0.9) */
	reverbLevel?: number;
	/** The reverb room size (double [0-1] / default: 0.2) */
	reverbRoomSize?: number;
	/** The stereo spread of the reverb signal (double [0-100] / default: 0.5) */
	reverbWidth?: number;
}
