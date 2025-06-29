[![NPM version](https://badge.fury.io/js/js-synthesizer.svg)](https://www.npmjs.com/package/js-synthesizer)

# js-synthesizer

js-synthesizer is a library that generates audio data (frames). [WebAssembly (wasm) version of FluidSynth](https://github.com/jet2jet/fluidsynth-emscripten) is used as a core synthesizer engine.

## Demo

https://www.pg-fl.jp/music/js-synthesizer/index.en.htm

## Install

```
npm install --save js-synthesizer
```

## Usage

### From main thread

Copies `dist/js-synthesizer.js` (or `dist/js-synthesizer.min.js`) and `externals/libfluidsynth-2.4.6.js` (libfluidsynth JS file) to your project, and writes `<script>` tags as following order:

```html
<script src="libfluidsynth-2.4.6.js"></script>
<script src="js-synthesizer.js"></script>
```

> If you want to use Soundfont version 3 (.sf3) files, use `externals/libfluidsynth-2.4.6-with-libsndfile.js` instead of `externals/libfluidsynth-2.4.6.js`.

When scripts are available, please check whether `waitForReady` resolves.

```js
JSSynth.waitForReady().then(loadSynthesizer);

function loadSynthesizer() {
    // process with JSSynth...
}
```

After initialized, you can use APIs via `JSSynth` namespace object.

```js
// Prepare the AudioContext instance
var context = new AudioContext();
var synth = new JSSynth.Synthesizer();
synth.init(context.sampleRate);

// Create AudioNode (ScriptProcessorNode) to output audio data
var node = synth.createAudioNode(context, 8192); // 8192 is the frame count of buffer
node.connect(context.destination);

// Load your SoundFont data (sfontBuffer: ArrayBuffer)
synth.loadSFont(sfontBuffer).then(function () {
    // Load your SMF file data (smfBuffer: ArrayBuffer)
    return synth.addSMFDataToPlayer(smfBuffer);
}).then(function () {
    // Play the loaded SMF data
    return synth.playPlayer();
}).then(function () {
    // Wait for finishing playing
    return synth.waitForPlayerStopped();
}).then(function () {
    // Wait for all voices stopped
    return synth.waitForVoicesStopped();
}).then(function () {
    // Releases the synthesizer
    synth.close();
}, function (err) {
    console.log('Failed:', err);
    // Releases the synthesizer
    synth.close();
});
```

(Above example uses Web Audio API, but you can use `Synthesizer` without Web Audio, by using `render()` method.)

js-synthesizer is built as UMD module. If you prefer to load js-synthesizer as a CommonJS / ES module, you can use `import` statement such as `import * as JSSynth from 'js-synthesizer'` by using bundlers (such as webpack).

Notes:

* `js-synthesizer.js` intends the ES2015-supported environment. If you need to run the script without errors on non-ES2015 environment such as IE11 (to notify 'unsupported'), you should load those scripts dynamically, or use transpiler such as babel.
* When just after the scripts loaded, some APIs may fail since libfluidsynth is not ready. To avoid this, you can use the Promise object returned by `JSSynth.waitForReady` as above example.
* libfluidsynth JS file is not `import`-able (but `require`-able from 2.4.6) and its license (LGPL v2.1) is different from js-synthesizer's (BSD-3-Clause).

### With AudioWorklet

js-synthesizer supports AudioWorklet process via `dist/js-synthesizer.worklet.js` (or `dist/js-synthesizer.worklet.min.js`). You can load js-synthesizer on the AudioWorklet as the following code:

```js
var context = new AudioContext();
context.audioWorklet.addModule('libfluidsynth-2.4.6.js')
    .then(function () {
        return context.audioWorklet.addModule('js-synthesizer.worklet.js');
    })
    .then(function () {
        // Create the synthesizer instance for AudioWorkletNode
        var synth = new JSSynth.AudioWorkletNodeSynthesizer();
        synth.init(context.sampleRate);
        // You must create AudioWorkletNode before using other methods
        // (This is because the message port is not available until the
        // AudioWorkletNode is created)
        audioNode = synth.createAudioNode(context);
        audioNode.connect(context.destination); // or another node...
        // After node creation, you can use Synthesizer methods
        return synth.loadSFont(sfontBuffer).then(function () {
            return synth.addSMFDataToPlayer(smfBuffer);
        }).then(function () {
            return synth.playPlayer();
        }).then(function () {
            ...
        });
    });
```

### With Web Worker

js-synthesizer and libfluidsynth can be executed on a Web Worker. Executing on a Web Worker prevents from blocking main thread while rendering.

To use js-synthesizer on a Web Worker, simply call `importScripts` as followings:

```js
self.importScripts('libfluidsynth-2.4.6.js');
self.importScripts('js-synthesizer.js');
```

Note that since the Web Audio is not supported on the Web Worker, the APIs/methods related to the Web Audio will not work. If you want to use both Web Worker and AudioWorklet, you should implement AudioWorkletProcessor manually as followings:

* main thread -- create AudioWorkletNode and establish connections between Web Worker and AudioWorklet
    * You need to transfer rendered audio frames from Web Worker to AudioWorklet, but AudioWorklet environment does not support creating Web Worker. By creating `MessageChannel` and sending its port instances to Web Worker and AudioWorklet, they can communicate each other directly.
* Web Worker thread -- render audio frames into raw buffers and send it for AudioWorklet thread
* AudioWorklet thread -- receive audio frames (and queue) and 'render' it in the `process` method

### In Node.js environment

From fluidsynth-emscripten version 2.4.6, the library supports Node.js environment. js-synthesizer also supports for this since 1.11.0.

To use js-synthesizer in Node.js environment, load with `require` function:

```js
const libfluidsynth = require('js-synthesizer/libfluidsynth');
const JSSynth = require('js-synthesizer');

// Initialize with loaded libfluidsynth
JSSynth.Synthesizer.initializeWithFluidSynthModule(libfluidsynth);

JSSynth.waitForReady().then(() => {
  // Now JSSynth.Synthesizer can be constructed
});
```

## API

### Creation of Synthesizer instance

These classes implement the interface named `JSSynth.ISynthesizer`.

* `JSSynth.Synthesizer` (construct: `new JSSynth.Synthesizer()`)
    * Creates the general synthesizer instance. No parameters are available.
* `JSSynth.AudioWorkletNodeSynthesizer` (construct: `new JSSynth.AudioWorkletNodeSynthesizer()`)
    * Creates the synthesizer instance communicating AudioWorklet (see above). No parameters are available.
    * You must call `createAudioNode` method first to use other instance methods.

### Creation of Sequencer instance

The `Sequencer` instance is created only via following methods:

* `JSSynth.Synthesizer.createSequencer` (static method)
    * Returns the Promise object that resolves with `JSSynth.ISequencer` instance. The instance can be used with `JSSynth.Synthesizer` instances.
* `JSSynth.AudioWorkletNodeSynthesizer.prototype.createSequencer` (instance method)
    * Returns the Promise object that resolves with `JSSynth.ISequencer` instance. The instance can be used with `JSSynth.AudioWorkletNodeSynthesizer` instances which handled `createSequencer` calls.

### Using hook / handle MIDI-related event data with user-defined callback

You can hook MIDI events posted by player. For `JSSynth.Synthesizer` instance, use `hookPlayerMIDIEvents` method as followings:

```js
syn.hookPlayerMIDIEvents(function (s, type, event) {
    // hook '0xC0' event (Program Change event)
    if (type === 0xC0) {
        // if the 'program' value is 0, use another SoundFont
        if (event.getProgram() === 0) {
            syn.midiProgramSelect(event.getChannel(), secondSFont, 0, 0);
            return true;
        }
    }
    // return false to use default processings for other events
    return false;
});
```

For `JSSynth.AudioWorkletNodeSynthesizer` instance, use `hookPlayerMIDIEventsByName` as followings:

* worklet.js

```js
// We must add method to AudioWorkletGlobalScope to pass to another module.
AudioWorkletGlobalScope.myHookPlayerEvents = function (s, type, event, data) {
    if (type === 0xC0) {
        if (event.getProgram() === 0) {
            // 'secondSFont' will be passed from 'hookPlayerMIDIEventsByName'
            s.midiProgramSelect(event.getChannel(), data.secondSFont, 0, 0);
            return true;
        }
    }
    return false;
};
```

* main.js

```js
// before use this, 'worklet.js' above must be loaded as AudioWorklet completely, and
// syn.createAudioNode must be called to activate worklet.

// The first parameter is the method name added to 'AudioWorkletGlobalScope'.
// The second parameter will be passed to the worklet.
syn.hookPlayerMIDIEventsByName('myHookPlayerEvents', { secondSFont: secondSFont });
```

The sequencer also supports 'user-defined client' to handle event data.

* For sequncer instance created by `Synthesizer.createSequencer`, use `Synthesizer.registerSequencerClient` static method.
    * You can use `Synthesizer.sendEventNow` static method to send event data, processed by the synthesizer or clients, to another clients/synthesizers.
* For sequncer instance created by `createSequencer` of `AudioWorkletNodeSynthesizer`, use `registerSequencerClientByName` instance method.
    * The callback function must be added to 'AudioWorkletGlobalScope' like `hookPlayerMIDIEventsByName`'s callback.
    * To re-send event data, use `Synthesizer.sendEventNow` in the worklet. `Synthesizer` constructor is available via `AudioWorkletGlobalScope.JSSynth.Synthesizer`.
* You can rewrite event data passed to the callback, by using `JSSynth.rewriteEventData` (`AudioWorkletGlobalScope.JSSynth.rewriteEventData` for worklet).

### `JSSynth` methods

#### `waitForReady`

Can be used to wait for the synthesizer engine's ready.

Return: `Promise` object (resolves when the synthesizer engine (libfluidsynth) is ready)

#### `JSSynth.Synthesizer.initializeWithFluidSynthModule`

Initializes js-synthesizer with (explicitly) loaded libfluidsynth library.

#### `disableLogging` / `restoreLogging`

Can be used to suppress logs from libfluidsynth.

### `JSSynth.ISynthesizer` methods

(Not documented yet. Please see `dist/lib/ISynthesizer.d.ts`.)

## License

js-synthesizer is licensed under [BSD 3-Clause License](./LICENSE) except for the files in `externals` directory.
For licenses of the files in `externals` directory, please read [`externals/README.md`](./externals/README.md).

> `libfluidsynth` directory is only a wrapper for `externals/libfluidsynth-*.js`, but uses same license of libfluidsynth for convenience.
