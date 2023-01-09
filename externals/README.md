# External files

This directory contains the files that are not part of js-synthesizer, especially libfluidsynth library from [fluidsynth-emscripten](https://github.com/jet2jet/fluidsynth-emscripten) project.
fluidsynth-emscripten and FluidSynth, the base of fluidsynth-emscripten, are licensed under [GNU Lesser General Public License (v2.1)](./LICENSE.fluidsynth.txt).

## libfluidsynth-x.x.x.js and libfluidsynth-x.x.x-with-libsndfile.js

There are two JS files for the same version (>= 2.3.0). The `-libsndfile` file is built with `libsndfile` library, which enables to load Soundfile version 3 (.sf3) files. If you want to use SF3 files, use `libfluidsynth-x.x.x-with-libsndfile.js` instead of `libfluidsynth-x.x.x.js`.
