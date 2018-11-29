
import registerAudioWorkletProcessor from './registerAudioWorkletProcessor';

import { rewriteEventData } from './ISequencerEventData';
import Synthesizer from './Synthesizer';

AudioWorkletGlobalScope.Fluid = {
	rewriteEventData: rewriteEventData,
	Synthesizer: Synthesizer
};

registerAudioWorkletProcessor();
