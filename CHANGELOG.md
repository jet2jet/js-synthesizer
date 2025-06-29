# Changelog

## v1.11.0

- Add `Synthesizer.initializeWithFluidSynthModule`
  - This allows to use loaded libfluidsynth instance explicitly, especially for Node.js environment (loaded via `require`)
- Add `libfluidsynth` directory
- Update libfluidsynth scripts (add 2.4.6 and remove 2.2.1)

## v1.10.0

- Add `setPlayerLoop` and `setPlayerTempo` methods to `ISynthesizer`

## v1.9.0

- Add `disableLogging` / `restoreLogging` for suppressing logs

## v1.8.5

(This version has no updates for js-synthesizer itself.)

- Update libfluidsynth scripts (add 2.3.0 and remove 2.1.9)
- Update README.md

## v1.8.4

(This version has no updates for js-synthesizer itself.)

- Update libfluidsynth scripts (remove 2.1.3)
- Update README.md

## v1.8.3

(This version has no updates for js-synthesizer itself.)

- Update libfluidsynth scripts
- Update README.md

## v1.8.2

- Downgrade Node.js version to v12

## v1.8.1

- Fixed to initialize player on first player method calls
   - Add `closePlayer` method to release internal player instance
- Bundle libfluidsynth-2.2.1.js (and remove libfluidsynth-2.0.2.js)

## v1.8.0

- Add `waitForWasmInitialized` to wait for WebAssembly initialization (#13)
- Add Soundfont object to read loaded soundfont information (including presets defined in the soundfont) (#14)
- Fix AudioWorkletNodeSynthesizer playPlayer to wait for internal playPlayer done (related: #16)
- Fix messaging usage on Sequence for AudioWorklet
- Add support for libfluidsynth 2.2.x
- Bundle libfluidsynth-2.1.9.js

## v1.7.0

(This version has no feature updates but the minor version is updated due to change default behavior.)

- Fix to initialize gain value
- Patch for retrieving active voice count (`isPlaying()` should work correctly now)
- Update libfluidsynth.js
  - Note that js-synthesizer still work with libfluidsynth-2.0.2.js.

## v1.6.0

(This version has no feature updates but the minor version is updated due to updating engine version.)

- Fix required engine version (#4)
- Update packages and build settings

## v1.5.2

(This version has no bug-fixes and feature updates.)

- Update packages and build settings

## v1.5.1

- Fix to support iOS Safari that does not support `copyToChannel` on `AudioBuffer` (#2, thanks to @CreadDiscans)

## v1.5.0

- Remove `Fluid` namespace support (breaking change for initial user)
- Add `callFunction` method to `AudioWorkletNodeSynthesizer`
- Add some methods to `Synthesizer` such as `setChorus` and `setGenerator` (not add to `AudioWorkletNodeSynthesizer`)
  - To use those methods from audio worklet, load your script into audio worklet and use `callFunction`

## v1.4.1

- Fix to send 'unregister' event explicitly before unregistering client from Sequencer, to avoid access violation ('index out of range' error in JS)

## v1.4.0

- Add `SynthesizerSettings` object for initialization of synthesizer
  - The object can be specified for `init` method of `Synthesizer`, or `createAudioNode` method of `AudioWorkletNodeSynthesizer`.
- Add `setChannelType` method for Synthesizer (`ISynthesizer`)
- Add `removeAllEvents` / `removeAllEventsFromClient` methods for Sequencer (`ISequencer`)

## v1.3.0

- Rename package name to `js-synthesizer` (from `fluid-js`)
  - Old `fluid`-related files are currently supported, but will be removed in the future.
- The root namespace `Fluid` is changed to `JSSynth` for `js-synthesizer.js` file
  - The namespace `Fluid` is only available when using `fluid.js` (or files beginning with `fluid`), and the namespace `JSSynth` is only available when using `js-synthesizer.js` (or files beginning with `js-synthesizer`).

## v1.2.0

- Update libfluidsynth to 2.0.2 (using [fluidsynth-emscripten v2.0.2-em-fix1](https://github.com/jet2jet/fluidsynth-emscripten/releases/tag/v2.0.2-em-fix1))
- Add 'midiProgramSelect' API for synthesizer
- Add APIs for hooking MIDI events from player
- Add APIs for handling event data from sequencer (as 'sequencer client')
- Fix handling errors on the audio worklet

## v1.1.1

- Fix missing destination for sequencer

## v1.1.0

- Add APIs for player status and seekings (`seekPlayer` etc.)
- Add APIs for 'sequencer' processings
- Add 'waitForReady' API

## v1.0.0

- Initial version (using [fluidsynth-emscripten v2.0.1-em](https://github.com/jet2jet/fluidsynth-emscripten/releases/tag/v2.0.1-em))
