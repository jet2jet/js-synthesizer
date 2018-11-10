
interface MethodCallEventData {
	id: number;
	method: string;
	args: any[];
}

interface MethodReturnEventData {
	id: number;
	method: string;
	val: any;
	error?: any;
}

/** @internal */
export interface Defer<T> {
	resolve(value: T): void;
	reject(reason: any): void;
}

/** @internal */
export interface DeferMap {
	[id: number]: Defer<any>;
}

/** @internal */
export type HookReturnMessageCallback = (data: MethodReturnEventData) => boolean;

/** @internal */
export interface CallMessageInstance {
	port: MessagePort;
	defers: DeferMap;
	deferId: number;
}

/** @internal */
export function initializeCallPort(
	port: MessagePort,
	hookMessage?: HookReturnMessageCallback | undefined
): CallMessageInstance {
	const instance: CallMessageInstance = {
		port: port,
		defers: {},
		deferId: 0
	};
	port.addEventListener('message', (e) => processReturnMessage(instance.defers, hookMessage, e));
	port.start();
	return instance;
}

function processReturnMessage(defers: DeferMap, hook: HookReturnMessageCallback | undefined, e: MessageEvent) {
	const data: MethodReturnEventData = e.data;
	if (!data) {
		return;
	}
	if (hook && hook(data)) {
		return;
	}
	const defer = defers[data.id];
	if (defer) {
		delete defers[data.id];
		if ('error' in data) {
			defer.reject(data.error);
		} else {
			defer.resolve(data.val);
		}
	} else {
		if ('error' in data) {
			throw data.error;
		}
	}
}

/** @internal */
export function postCall(instance: CallMessageInstance, method: string, args: any[]): void;

/** @internal */
export function postCall({ port }: CallMessageInstance, method: string, args: any[]) {
	port.postMessage({
		id: -1, method, args
	} as MethodCallEventData);
}

/** @internal */
export function postCallWithPromise<T>(instance: CallMessageInstance, method: string, args: any[]): Promise<T> {
	const id = instance.deferId++;
	if (instance.deferId === Infinity || instance.deferId < 0) {
		instance.deferId = 0;
	}
	const promise = new Promise<T>((resolve, reject) => {
		instance.defers[id] = { resolve, reject };
	});
	instance.port.postMessage({
		id, method, args
	} as MethodCallEventData);
	return promise;
}

////////////////////////////////////////////////////////////////////////////////

/** @internal */
export type HookCallMessageCallback = (data: MethodCallEventData) => boolean;

/** @internal */
export interface ReturnMessageInstance {
	port: MessagePort;
}

/** @internal */
export function initializeReturnPort(
	port: MessagePort,
	promiseInitialized: Promise<void>,
	targetObjectHolder: () => any,
	hookMessage?: HookCallMessageCallback | undefined
): ReturnMessageInstance {
	const instance: ReturnMessageInstance = {
		port: port
	};
	port.addEventListener('message', (e) => {
		const data = e.data;
		if (!data) {
			return;
		}
		promiseInitialized.then(() => processCallMessage(instance.port, data, targetObjectHolder, hookMessage));
	});
	port.start();
	return instance;
}

function processCallMessage(
	port: MessagePort,
	data: MethodCallEventData,
	targetObjectHolder: () => any,
	hook?: HookCallMessageCallback | undefined
) {
	if (hook && hook(data)) {
		return;
	}
	const target = targetObjectHolder();
	if (!target[data.method]) {
		postReturnError(port, data.id, data.method, new Error('Not implemented'));
	} else {
		try {
			postReturnImpl(port, data.id, data.method, target[data.method].apply(target, data.args));
		} catch (e) {
			postReturnError(port, data.id, data.method, e);
		}
	}
}

/** @internal */
export function postReturn(instance: ReturnMessageInstance, id: number, method: string, value: any) {
	postReturnImpl(instance.port, id, method, value);
}

function postReturnImpl(port: MessagePort, id: number, method: string, value: any) {
	if (value instanceof Promise) {
		value.then((v) => {
			if (id >= 0) {
				port.postMessage({
					id,
					method,
					val: v
				} as MethodReturnEventData);
			}
		}, (error) => {
			port.postMessage({
				id,
				method,
				error
			} as MethodReturnEventData);
		});
	} else {
		port.postMessage({
			id,
			method,
			val: value
		} as MethodReturnEventData);
	}
}

function postReturnError(port: MessagePort, id: number, method: string, error: Error) {
	port.postMessage({
		id,
		method,
		error
	} as MethodReturnEventData);
}
