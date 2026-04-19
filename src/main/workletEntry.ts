/// <reference types='audioworklet' />

import registerAudioWorkletProcessor from './registerAudioWorkletProcessor';

import { rewriteEventData } from './ISequencerEventData';
import Synthesizer from './Synthesizer';
import { disableLogging, restoreLogging } from './logging';

const JSSynthObject = {
	rewriteEventData: rewriteEventData,
	Synthesizer: Synthesizer,
	disableLogging: disableLogging,
	restoreLogging: restoreLogging,
};

if (typeof globalThis !== 'undefined') {
	(globalThis as unknown as Record<string, unknown>).JSSynth = JSSynthObject;
}

(AudioWorkletGlobalScope as unknown as Record<string, unknown>).JSSynth = JSSynthObject;
// deprecated
(AudioWorkletGlobalScope as unknown as Record<string, unknown>).Fluid = JSSynthObject;

registerAudioWorkletProcessor();
