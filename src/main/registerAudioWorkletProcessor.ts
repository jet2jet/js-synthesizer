
import Synthesizer from './Synthesizer';

import {
	Constants,
	SynthesizerStatus
} from './AudioWorkletNodeSynthesizer';

import {
	initializeReturnPort,
	postReturn,
    ReturnMessageInstance
} from './MethodMessaging';

const _module: any = AudioWorkletGlobalScope.wasmModule;
const promiseWasmInitialized = new Promise<void>((resolve) => {
	if (_module.calledRun) {
		resolve();
	} else {
		const fn: (() => void) | undefined = _module.onRuntimeInitialized;
		_module.onRuntimeInitialized = () => {
			resolve();
			if (fn) {
				fn();
			}
		};
	}
});

/** Registers processor using Synthesizer for AudioWorklet. */
export default function registerAudioWorkletProcessor() {
	/**
	 * The processor using Synthesizer
	 */
	class Processor extends AudioWorkletProcessor {

		private synth: Synthesizer | undefined;
		private _messaging: ReturnMessageInstance;

		constructor(options: AudioWorkletNodeOptions) {
			super(options);

			const promiseInitialized = this.doInit();
			this._messaging = initializeReturnPort(this.port, promiseInitialized, () => this.synth!, (data) => {
				if (data.method === 'init') {
					this.synth!.init(sampleRate);
					return true;
				} else if (data.method === 'createSequencer') {
					this.doCreateSequencer(data.args[0]).then(() => {
						postReturn(this._messaging!, data.id, data.method, void (0));
					});
					return true;
				}
				return false;
			});
		}

		private async doInit() {
			await promiseWasmInitialized;
			this.synth = new Synthesizer();
			this.synth.init(sampleRate);
		}

		private doCreateSequencer(port: MessagePort): Promise<void> {
			return Synthesizer.createSequencer().then((seq) => {
				initializeReturnPort(port, null, () => seq);
			});
		}

		public process(_inputs: Float32Array[][], outputs: Float32Array[][]) {
			if (!this.synth) {
				return true;
			}
			const syn = this.synth!;
			syn.render(outputs[0]);
			postReturn(this._messaging, -1, Constants.UpdateStatus, {
				playing: syn.isPlaying(),
				playerPlaying: syn.isPlayerPlaying()
			} as SynthesizerStatus);
			return true;
		}
	}

	registerProcessor(Constants.ProcessorName, Processor);
}
