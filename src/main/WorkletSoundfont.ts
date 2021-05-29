import Preset from './Preset';

import * as MethodMessaging from './MethodMessaging';

export default class WorkletSoundfont {
	// @internal
	private _messaging: MethodMessaging.CallMessageInstance;

	// @internal
	public constructor(port: MessagePort, private readonly name: string) {
		this._messaging = MethodMessaging.initializeCallPort(port);
	}

	public getName(): string {
		return this.name;
	}

	public getPreset(bank: number, presetNum: number): Promise<Preset | null> {
		return MethodMessaging.postCallWithPromise(this._messaging, 'getPreset', [bank, presetNum]);
	}

	public getPresetIterable(): Promise<Iterable<Preset>> {
		return MethodMessaging.postCallWithPromise<Preset[]>(this._messaging, 'getPresetIterable', []);
	}
}
