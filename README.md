[![NPM version](https://badge.fury.io/js/fluid-js.svg)](https://www.npmjs.com/package/fluid-js)

fluid-js
==========

fluid-js is a library that generates audio data (frames). fluid-js uses wasm version of FluidSynth.

## Install

```
npm install --save fluid-js
```

## Usage

### From main thread

Copies `dist/fluid.js` (or `dist/fluid.min.js`) and `externals/libfluidsynth-2.0.1.js` (libfluidsynth JS file) to your project, and writes `<script>` tags as following order:

```html
<script src="libfluidsynth-2.0.1.js"></script>
<script src="fluid.js"></script>
```

When scripts are available, you can use APIs via `Fluid` namespace object.

```js
// Prepare the AudioContext instance
var context = new AudioContext();
var synth = new Fluid.Synthesizer();
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

If you prefer to load fluid-js as an ES module, you can use `import` statement such as `import * as Fluid from 'fluid-js'`.

Notes:

* `fluid.js` intends the ES2015-supported environment. If you need to run the script without errors on non-ES2015 environment such as IE11 (to notify 'unsupported'), you should load those scripts dynamically, or use transpiler such as babel.
* When just after the scripts loaded, some APIs may fail since libfluidsynth is not ready. To avoid this, you can use the Promise object returned by `Fluid.waitForReady`.
* libfluidsynth JS file is not `import`-able and its license (LGPL v2.1) is differ from fluid-js's (BSD-3-Clause).

### With AudioWorklet

fluid-js supports AudioWorklet process via `dist/fluid.worklet.js` (or `dist/fluid.worklet.min.js`). You can load fluid-js on the AudioWorklet as the following code:

```js
var context = new AudioContext();
context.audioWorklet.addModule('libfluidsynth-2.0.1.js')
    .then(function () {
        return context.audioWorklet.addModule('fluid.worklet.js');
    })
    .then(function () {
        // Create the synthesizer instance for AudioWorkletNode
        var synth = new Fluid.AudioWorkletNodeSynthesizer();
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

fluid-js and libfluidsynth can be executed on a Web Worker. Executing on a Web Worker prevents from blocking main thread while rendering.

To use fluid-js on a Web Worker, simply call `importScripts` as followings:

```js
self.importScripts('libfluidsynth-2.0.1.js');
self.importScripts('fluid.js');
```

(You can also load fluid-js as an ES Module from the Web Worker.)

Note that since the Web Audio is not supported on the Web Worker, the APIs/methods related to the Web Audio will not work. If you want to use both Web Worker and AudioWorklet, you should implement AudioWorkletProcessor manually as followings:

* main thread -- create AudioWorkletNode and establish connections between Web Worker and AudioWorklet
    * You must transfer rendered audio frames from Web Worker to AudioWorklet because AudioWorklet environment does not support creating Web Worker. By creating `MessageChannel` and sending its port instances to Web Worker and AudioWorklet, they can communicate each other directly.
* Web Worker thread -- render audio frames into raw buffers and send it for AudioWorklet thread
* AudioWorklet thread -- receive audio frames and 'render' it in the `process` method

## API

### Creation of Synthesizer instance

These classes implement the interface named `Fluid.ISynthesizer`.

* `Fluid.Synthesizer` (construct: `new Fluid.Synthesizer()`)
    * Creates the general synthesizer instance. No parameters are available.
* `Fluid.AudioWorkletNodeSynthesizer` (construct: `new Fluid.AudioWorkletNodeSynthesizer()`)
    * Creates the synthesizer instance communicating AudioWorklet (see above). No parameters are available.
    * You must call `createAudioNode` method to use other instance methods.

### Creation of Sequencer instance

The `Sequencer` instance is created only via following methods:

* `Fluid.Synthesizer.createSequencer` (static method)
    * Returns the Promise object that resolves with `Fluid.ISequencer` instance. The instance can be used with `Fluid.Synthesizer` instances.
* `Fluid.AudioWorkletNodeSynthesizer.prototype.createSequencer` (instance method)
    * Returns the Promise object that resolves with `Fluid.ISequencer` instance. The instance can be used with `Fluid.AudioWorkletNodeSynthesizer` instances which handled `createSequencer` calls.

### `Fluid` methods

#### `waitForReady`

Can be used to wait for the synthesizer engine's ready.

Return: `Promise` object (resolves when the synthesizer engine (libfluidsynth) is ready)

### `Fluid.ISynthesizer` methods

(Not documented yet. Please see `dist/lib/ISynthesizer.d.ts`.)

## License

fluid-js is licensed under [BSD 3-Clause License](./LICENSE) except for the files in `externals` directory.
For licenses of the files in `externals` directory, please read [`externals/README.md`](./externals/README.md).
