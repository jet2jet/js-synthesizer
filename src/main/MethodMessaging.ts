
import MessageError from './MessageError';

export interface MethodCallEventData {
	id: number;
	method: string;
	args: any[];
}

export interface MethodReturnEventData {
	id: number;
	method: string;
	val: any;
	error?: MessageErrorData;
}

export interface MessageErrorData {
	baseName: string;
	message: string;
	detail: any;
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

function convertErrorTransferable(err: Error): MessageErrorData {
	const result: any = {};
	const objList: any[] = [];
	let obj: any = err;
	while (obj && obj !== Object.prototype) {
		objList.unshift(obj);
		obj = Object.getPrototypeOf(obj);
	}
	objList.forEach((o) => {
		Object.getOwnPropertyNames(o).forEach((key) => {
			try {
				const data = (err as any)[key];
				if (typeof data !== 'function' && typeof data !== 'symbol') {
					result[key] = data;
				}
			} catch (_e) { }
		});
	});
	return {
		baseName: err.name,
		message: err.message,
		detail: result
	};
}

function convertAnyErrorTransferable(err: any): MessageErrorData {
	return convertErrorTransferable((err && err instanceof Error) ? err : new Error(`${err}`));
}

function makeMessageError(error: MessageErrorData): MessageError {
	return new MessageError(error.baseName, error.message, error.detail);
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
		if (data.error) {
			defer.reject(makeMessageError(data.error));
		} else {
			defer.resolve(data.val);
		}
	} else {
		if (data.error) {
			throw makeMessageError(data.error);
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
	const transfers: Transferable[] = [];
	if (args[0] instanceof MessagePort) {
		transfers.push(args[0]);
	}
	instance.port.postMessage({
		id, method, args
	} as MethodCallEventData, transfers);
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
	promiseInitialized: Promise<void> | null,
	targetObjectHolder: () => any,
	hookMessage?: HookCallMessageCallback | undefined
): ReturnMessageInstance {
	const instance: ReturnMessageInstance = {
		port: port
	};
	if (promiseInitialized) {
		port.addEventListener('message', (e) => {
			const data = e.data;
			if (!data) {
				return;
			}
			promiseInitialized.then(() => processCallMessage(instance.port, data, targetObjectHolder, hookMessage));
		});
	} else {
		port.addEventListener('message', (e) => {
			const data = e.data;
			if (!data) {
				return;
			}
			processCallMessage(instance.port, data, targetObjectHolder, hookMessage);
		});
	}
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
		postReturnErrorImpl(port, data.id, data.method, new Error('Not implemented'));
	} else {
		try {
			postReturnImpl(port, data.id, data.method, target[data.method].apply(target, data.args));
		} catch (e) {
			postReturnErrorImpl(port, data.id, data.method, e);
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
				error: convertAnyErrorTransferable(error)
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

/** @internal */
export function postReturnError(instance: ReturnMessageInstance, id: number, method: string, error: any) {
	postReturnErrorImpl(instance.port, id, method, error);
}

function postReturnErrorImpl(port: MessagePort, id: number, method: string, error: any) {
	port.postMessage({
		id,
		method,
		error: convertAnyErrorTransferable(error)
	} as MethodReturnEventData);
}
