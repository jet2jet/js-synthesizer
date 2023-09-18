
import registerAudioWorkletProcessor from './registerAudioWorkletProcessor';

import { rewriteEventData } from './ISequencerEventData';
import Synthesizer from './Synthesizer';
import { disableLogging, restoreLogging } from './logging';

AudioWorkletGlobalScope.JSSynth = {
	rewriteEventData: rewriteEventData,
	Synthesizer: Synthesizer,
	disableLogging: disableLogging,
	restoreLogging: restoreLogging,
};
// deprecated
AudioWorkletGlobalScope.Fluid = AudioWorkletGlobalScope.JSSynth;

registerAudioWorkletProcessor();
