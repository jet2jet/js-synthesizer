
interface AudioNodeOptions {
	channelCount?: number;
	channelCountMode?: 'max' | 'clamped-max' | 'explicit';
	channelInterpretation?: 'speakers' | 'discrete';
}

interface AudioWorkletNodeOptions extends AudioNodeOptions {
	numberOfInputs?: number;
	numberOfOutputs?: number;
	outputChannelCount?: number[];
	parameterData?: { [key: string]: number; };
	processorOptions?: any;
}

abstract class AudioWorkletProcessor {
	public port: MessagePort;

	constructor(options: AudioWorkletNodeOptions);
	public abstract process(inputs: Float32Array[][], outputs: Float32Array[][], parameters: any): boolean;
}

type ProcessorConstructor<T extends AudioWorkletProcessor> = {
	new(options: AudioWorkletNodeOptions): T;
};

declare function registerProcessor<T extends AudioWorkletProcessor>(name: string, ctor: ProcessorConstructor<T>): void;
declare const currentFrame: number;
declare const currentTime: number;
declare const sampleRate: number;

interface AudioWorkletGlobalScopeObject {
	[key: string]: any;
	registerProcessor<T extends AudioWorkletProcessor>(name: string, ctor: ProcessorConstructor<T>): void;
	currentFrame: number;
	currentTime: number;
	sampleRate: number;
}

declare const AudioWorkletGlobalScope: AudioWorkletGlobalScopeObject;
