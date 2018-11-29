# Changelog

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
