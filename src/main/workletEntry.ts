
import registerAudioWorkletProcessor from './registerAudioWorkletProcessor';

import { rewriteEventData } from './ISequencerEventData';
import Synthesizer from './Synthesizer';

AudioWorkletGlobalScope.JSSynth = {
	rewriteEventData: rewriteEventData,
	Synthesizer: Synthesizer
};
// deprecated
AudioWorkletGlobalScope.Fluid = AudioWorkletGlobalScope.JSSynth;

registerAudioWorkletProcessor();
