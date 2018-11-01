
import Synthesizer from './Synthesizer';

import {
	Constants,
	MethodCallEventData,
	MethodReturnEventData,
	SynthesizerStatus
} from './AudioWorkletNodeSynthesizer';

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

		/** @internal */
		private synth: Synthesizer | undefined;
		private promiseInitialized: Promise<void>;

		constructor(options: AudioWorkletNodeOptions) {
			super(options);

			this.port.onmessage = this.onMessage.bind(this);
			this.port.start();
			this.promiseInitialized = this.doInit();
		}

		private async doInit() {
			await promiseWasmInitialized;
			this.synth = new Synthesizer();
			this.synth.init(sampleRate);
		}

		public process(_inputs: Float32Array[][], outputs: Float32Array[][]) {
			if (!this.synth) {
				return true;
			}
			const syn = this.synth!;
			syn.render(outputs[0]);
			this.post(-1, Constants.UpdateStatus, {
				playing: syn.isPlaying(),
				playerPlaying: syn.isPlayerPlaying()
			} as SynthesizerStatus);
			return true;
		}

		private post(id: number, method: string, value: any) {
			if (value instanceof Promise) {
				value.then((v) => {
					if (id >= 0) {
						this.port.postMessage({
							id,
							method,
							val: v
						} as MethodReturnEventData);
					}
				}, (error) => {
					this.port.postMessage({
						id,
						method,
						error
					} as MethodReturnEventData);
				});
			} else if (id >= 0) {
				this.port.postMessage({
					id,
					method,
					val: value
				} as MethodReturnEventData);
			}
		}

		private postError(id: number, method: string, error: Error) {
			// always post even if id < 0
			this.port.postMessage({
				id,
				method,
				error
			} as MethodReturnEventData);
		}

		private onMessage(ev: MessageEvent) {
			const data: MethodCallEventData = ev.data;
			this.promiseInitialized.then(() => {
				const syn: any = this.synth!;
				if (data.method === 'init') {
					syn.init(sampleRate);
				} else if (!syn[data.method]) {
					this.postError(data.id, data.method, new Error('Not implemented'));
				} else {
					try {
						this.post(data.id, data.method, syn[data.method].apply(syn, data.args));
					} catch (e) {
						this.postError(data.id, data.method, e);
					}
				}
			});
		}
	}

	registerProcessor(Constants.ProcessorName, Processor);
}
