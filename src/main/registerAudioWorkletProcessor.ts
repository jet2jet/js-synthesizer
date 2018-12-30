
import Sequencer from './Sequencer';
import Synthesizer from './Synthesizer';
import SynthesizerSettings from './SynthesizerSettings';
import waitForReady from './waitForReady';

import {
	Constants,
	SynthesizerStatus
} from './AudioWorkletNodeSynthesizer';

import {
	initializeReturnPort,
	postReturn,
	postReturnError,
    ReturnMessageInstance
} from './MethodMessaging';

const promiseWasmInitialized = waitForReady();

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

			const settings: SynthesizerSettings | undefined =
				options.processorOptions && options.processorOptions.settings;

			const promiseInitialized = this.doInit(settings);
			this._messaging = initializeReturnPort(this.port, promiseInitialized, () => this.synth!, (data) => {
				if (data.method === 'init') {
					this.synth!.init(sampleRate, settings);
					return true;
				} else if (data.method === 'createSequencer') {
					this.doCreateSequencer(data.args[0]).then(() => {
						postReturn(this._messaging!, data.id, data.method, void (0));
					});
					return true;
				} else if (data.method === 'hookPlayerMIDIEventsByName') {
					const r = this.doHookPlayerMIDIEvents(data.args[0], data.args[1]);
					if (r) {
						postReturn(this._messaging!, data.id, data.method, void (0));
					} else {
						postReturnError(this._messaging!, data.id, data.method, new Error('Name not found'));
					}
					return true;
				}
				return false;
			});
		}

		private async doInit(settings?: SynthesizerSettings | undefined) {
			await promiseWasmInitialized;
			this.synth = new Synthesizer();
			this.synth.init(sampleRate, settings);
		}

		private doCreateSequencer(port: MessagePort): Promise<void> {
			return Synthesizer.createSequencer().then((seq) => {
				initializeReturnPort(port, null, () => seq, (data) => {
					// special handle for Sequencer
					if (data.method === 'getRaw') {
						postReturn(this._messaging!, data.id, data.method, (seq as Sequencer).getRaw());
						return true;
					} else if (data.method === 'registerSequencerClientByName') {
						const r = this.doRegisterSequencerClient(seq as Sequencer, data.args[0], data.args[1], data.args[2]);
						if (r !== null) {
							postReturn(this._messaging!, data.id, data.method, r);
						} else {
							postReturnError(this._messaging!, data.id, data.method, new Error('Name not found'));
						}
						return true;
					}
					return false;
				});
			});
		}

		private doHookPlayerMIDIEvents(name: string | null | undefined, param: any) {
			if (!name) {
				this.synth!.hookPlayerMIDIEvents(null);
				return true;
			}
			const fn: any = (AudioWorkletGlobalScope[name]);
			if (fn && typeof fn === 'function') {
				this.synth!.hookPlayerMIDIEvents(fn, param);
				return true;
			}
			return false;
		}

		private doRegisterSequencerClient(seq: Sequencer, clientName: string, callbackName: string, param: number) {
			const fn: any = (AudioWorkletGlobalScope[callbackName]);
			if (fn && typeof fn === 'function') {
				return Synthesizer.registerSequencerClient(seq, clientName, fn, param);
			}
			return null;
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
