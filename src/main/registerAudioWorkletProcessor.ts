
import Sequencer from './Sequencer';
import Synthesizer from './Synthesizer';
import SynthesizerSettings from './SynthesizerSettings';
import waitForReady from './waitForReady';

import {
	Constants,
	ProcessorOptions,
	SynthesizerStatus
} from './AudioWorkletNodeSynthesizer';

import {
	initializeReturnPort,
	MethodCallEventData,
	postReturn,
	postReturnError,
    ReturnMessageInstance
} from './MethodMessaging';
import { disableLogging } from './logging';

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

			const processorOptions: ProcessorOptions | undefined = options.processorOptions;
			const settings: SynthesizerSettings | undefined =
				processorOptions && processorOptions.settings;
			if (processorOptions && processorOptions.disabledLoggingLevel) {
				disableLogging(processorOptions.disabledLoggingLevel);
			}

			const promiseInitialized = this.doInit(settings);
			this._messaging = initializeReturnPort(this.port, promiseInitialized, () => this.synth!, (data) => {
				switch (data.method) {
					case 'init':
						this.synth!.init(sampleRate, settings);
						return true;
					case 'createSequencer':
						this.doCreateSequencer(data.args[0]).then(() => {
							postReturn(this._messaging!, data.id, data.method, void (0));
						});
						return true;
					case 'hookPlayerMIDIEventsByName':
						{
							const r = this.doHookPlayerMIDIEvents(data.args[0], data.args[1]);
							if (r) {
								postReturn(this._messaging!, data.id, data.method, void (0));
							} else {
								postReturnError(this._messaging!, data.id, data.method, new Error('Name not found'));
							}
						}
						return true;
					case 'callFunction':
						try {
							this.doCallFunction(data.args[0], data.args[1]);
							postReturn(this._messaging!, data.id, data.method, void (0));
						} catch (e) {
							postReturnError(this._messaging!, data.id, data.method, e);
						}
						return true;
					case 'getSFontObject':
						try {
							const name = this.doGetSFontObject(data.args[0], data.args[1]);
							if (name !== null) {
								postReturn(this._messaging!, data.id, data.method, name);
							} else {
								postReturnError(this._messaging!, data.id, data.method, new Error('Invalid sfontId'));
							}
						} catch (e) {
							postReturnError(this._messaging!, data.id, data.method, e);
						}
						return true;
					case 'playPlayer':
						this.doPlayPlayer(data);
						return true;
					case 'loggingChanged':
						disableLogging(data.args[0]);
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
				const messaging = initializeReturnPort(port, null, () => seq, (data) => {
					// special handle for Sequencer
					if (data.method === 'getRaw') {
						postReturn(messaging, data.id, data.method, (seq as Sequencer).getRaw());
						return true;
					} else if (data.method === 'registerSequencerClientByName') {
						const r = this.doRegisterSequencerClient(seq as Sequencer, data.args[0], data.args[1], data.args[2]);
						if (r !== null) {
							postReturn(messaging, data.id, data.method, r);
						} else {
							postReturnError(messaging, data.id, data.method, new Error('Name not found'));
						}
						return true;
					}
					return false;
				});
			});
		}

		private doGetSFontObject(port: MessagePort, sfontId: number): string | null {
			const sfont = this.synth!.getSFontObject(sfontId);
			if (sfont === null) {
				return null;
			}
			const messaging = initializeReturnPort(port, null, () => sfont, (data) => {
				if (data.method === 'getPresetIterable') {
					postReturn(messaging, data.id, data.method, [...sfont.getPresetIterable()]);
					return true;
				}
				return false;
			});
			return sfont.getName();
		}

		private doPlayPlayer(data: MethodCallEventData) {
			const syn = this.synth!;
			syn.playPlayer().then(() => {
				postReturn(this._messaging, -1, Constants.UpdateStatus, {
					playing: syn.isPlaying(),
					playerPlaying: syn.isPlayerPlaying()
				} as SynthesizerStatus);
				postReturn(this._messaging!, data.id, data.method, void (0));
			}, (e: unknown) => {
				postReturnError(this._messaging!, data.id, data.method, e);
			})
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

		private doCallFunction(name: string, param: any) {
			const fn: any = (AudioWorkletGlobalScope[name]);
			if (fn && typeof fn === 'function') {
				fn.call(null, this.synth, param);
				return;
			}
			throw new Error('Name not found');
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
