
/** Default values for synthesizer instances */
export const enum SynthesizerDefaultValues {
	Gain = 0.5
}

/** Interpolation values used by ISynthesizer.setInterpolation */
export const enum InterpolationValues {
	/** No interpolation: Fastest, but questionable audio quality */
	None = 0,
	/** Straight-line interpolation: A bit slower, reasonable audio quality */
	Linear = 1,
	/** Fourth-order interpolation, good quality, the default */
	FourthOrder = 4,
	/** Seventh-order interpolation */
	SeventhOrder = 7,
	/** Default interpolation method */
	Default = FourthOrder,
	/** Highest interpolation method */
	Highest = SeventhOrder,
}
