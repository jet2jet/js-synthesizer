
/** Error object used for errors occurred in the message receiver (e.g. Worklet) */
export default class MessageError extends Error {
	/** The name of original error object if available */
	public baseName: any;
	/** Detailed properties of original error object if available */
	public detail: any;

	constructor(baseName: string, message: string, detail?: any) {
		super(message);
		this.baseName = baseName;
		this.detail = detail;
		if (detail && detail.stack) {
			this.stack = detail.stack;
		}
	}
}
