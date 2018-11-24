
type NullPointerType = number & { _null_pointer_marker: never; };

/** @internal */
type PointerType = NullPointerType | (number & { _pointer_marker: never; });

export default PointerType;

type UniquePointerType<TMarker extends string> = NullPointerType | (number & {
	_pointer_marker: never;
} & {
	[P in TMarker]: never;
});
export { UniquePointerType };

export const INVALID_POINTER: NullPointerType = 0 as any as NullPointerType;
