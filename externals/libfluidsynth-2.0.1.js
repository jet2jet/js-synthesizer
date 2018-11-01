// Copyright 2010 The Emscripten Authors.  All rights reserved.
// Emscripten is available under two separate licenses, the MIT license and the
// University of Illinois/NCSA Open Source License.  Both these licenses can be
// found in the LICENSE file.

// The Module object: Our interface to the outside world. We import
// and export values on it. There are various ways Module can be used:
// 1. Not defined. We create it here
// 2. A function parameter, function(Module) { ..generated code.. }
// 3. pre-run appended it, var Module = {}; ..generated code..
// 4. External script tag defines var Module.
// We need to check if Module already exists (e.g. case 3 above).
// Substitution will be replaced with actual code on later stage of the build,
// this way Closure Compiler will not mangle it (e.g. case 4. above).
// Note that if you want to run closure, and also to use Module
// after the generated code, you will need to define   var Module = {};
// before the code. Then that object will be used in the code, and you
// can continue to use Module afterwards as well.
var Module = typeof Module !== 'undefined' ? Module : {};

// --pre-jses are emitted after the Module integration code, so that they can
// refer to Module (if they choose; they can also define Module)
//var Module = typeof Module !== 'undefined' ? Module : {};
// (to avoid errors occurred in emscripten's code)
var document = typeof document !== 'undefined' ? document : {};
var window = typeof window !== 'undefined' ? window : {};
// expose wasm API to AudioWorklet
if (typeof AudioWorkletGlobalScope !== 'undefined' && AudioWorkletGlobalScope) {
    AudioWorkletGlobalScope.wasmModule = Module;
}



// Sometimes an existing Module object exists with properties
// meant to overwrite the default module functionality. Here
// we collect those properties and reapply _after_ we configure
// the current environment's defaults to avoid having to be so
// defensive during initialization.
var moduleOverrides = {};
var key;
for (key in Module) {
  if (Module.hasOwnProperty(key)) {
    moduleOverrides[key] = Module[key];
  }
}

Module['arguments'] = [];
Module['thisProgram'] = './this.program';
Module['quit'] = function(status, toThrow) {
  throw toThrow;
};
Module['preRun'] = [];
Module['postRun'] = [];

// Determine the runtime environment we are in. You can customize this by
// setting the ENVIRONMENT setting at compile time (see settings.js).

var ENVIRONMENT_IS_WEB = true;
var ENVIRONMENT_IS_WORKER = false;
var ENVIRONMENT_IS_NODE = false;
var ENVIRONMENT_IS_SHELL = false;


// Three configurations we can be running in:
// 1) We could be the application main() thread running in the main JS UI thread. (ENVIRONMENT_IS_WORKER == false and ENVIRONMENT_IS_PTHREAD == false)
// 2) We could be the application main() thread proxied to worker. (with Emscripten -s PROXY_TO_WORKER=1) (ENVIRONMENT_IS_WORKER == true, ENVIRONMENT_IS_PTHREAD == false)
// 3) We could be an application pthread running in a worker. (ENVIRONMENT_IS_WORKER == true and ENVIRONMENT_IS_PTHREAD == true)

// `/` should be present at the end if `scriptDirectory` is not empty
var scriptDirectory = '';
function locateFile(path) {
  if (Module['locateFile']) {
    return Module['locateFile'](path, scriptDirectory);
  } else {
    return scriptDirectory + path;
  }
}

if (ENVIRONMENT_IS_WEB || ENVIRONMENT_IS_WORKER) {
  if (ENVIRONMENT_IS_WORKER) { // Check worker, not web, since window could be polyfilled
    scriptDirectory = self.location.href;
  } else if (document.currentScript) { // web
    scriptDirectory = document.currentScript.src;
  }
  // blob urls look like blob:http://site.com/etc/etc and we cannot infer anything from them.
  // otherwise, slice off the final part of the url to find the script directory.
  // if scriptDirectory does not contain a slash, lastIndexOf will return -1,
  // and scriptDirectory will correctly be replaced with an empty string.
  if (scriptDirectory.indexOf('blob:') !== 0) {
    scriptDirectory = scriptDirectory.substr(0, scriptDirectory.lastIndexOf('/')+1);
  } else {
    scriptDirectory = '';
  }


  Module['read'] = function shell_read(url) {
    try {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', url, false);
      xhr.send(null);
      return xhr.responseText;
    } catch (err) {
      var data = tryParseAsDataURI(url);
      if (data) {
        return intArrayToString(data);
      }
      throw err;
    }
  };

  if (ENVIRONMENT_IS_WORKER) {
    Module['readBinary'] = function readBinary(url) {
      try {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', url, false);
        xhr.responseType = 'arraybuffer';
        xhr.send(null);
        return new Uint8Array(xhr.response);
      } catch (err) {
        var data = tryParseAsDataURI(url);
        if (data) {
          return data;
        }
        throw err;
      }
    };
  }

  Module['readAsync'] = function readAsync(url, onload, onerror) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.responseType = 'arraybuffer';
    xhr.onload = function xhr_onload() {
      if (xhr.status == 200 || (xhr.status == 0 && xhr.response)) { // file URLs can return 0
        onload(xhr.response);
        return;
      }
      var data = tryParseAsDataURI(url);
      if (data) {
        onload(data.buffer);
        return;
      }
      onerror();
    };
    xhr.onerror = onerror;
    xhr.send(null);
  };

  Module['setWindowTitle'] = function(title) { document.title = title };
} else
{
}

// Set up the out() and err() hooks, which are how we can print to stdout or
// stderr, respectively.
// If the user provided Module.print or printErr, use that. Otherwise,
// console.log is checked first, as 'print' on the web will open a print dialogue
// printErr is preferable to console.warn (works better in shells)
// bind(console) is necessary to fix IE/Edge closed dev tools panel behavior.
var out = Module['print'] || (typeof console !== 'undefined' ? console.log.bind(console) : (typeof print !== 'undefined' ? print : null));
var err = Module['printErr'] || (typeof printErr !== 'undefined' ? printErr : ((typeof console !== 'undefined' && console.warn.bind(console)) || out));

// Merge back in the overrides
for (key in moduleOverrides) {
  if (moduleOverrides.hasOwnProperty(key)) {
    Module[key] = moduleOverrides[key];
  }
}
// Free the object hierarchy contained in the overrides, this lets the GC
// reclaim data used e.g. in memoryInitializerRequest, which is a large typed array.
moduleOverrides = undefined;

// perform assertions in shell.js after we set up out() and err(), as otherwise if an assertion fails it cannot print the message



// Copyright 2017 The Emscripten Authors.  All rights reserved.
// Emscripten is available under two separate licenses, the MIT license and the
// University of Illinois/NCSA Open Source License.  Both these licenses can be
// found in the LICENSE file.

// {{PREAMBLE_ADDITIONS}}

var STACK_ALIGN = 16;


function staticAlloc(size) {
  var ret = STATICTOP;
  STATICTOP = (STATICTOP + size + 15) & -16;
  return ret;
}

function dynamicAlloc(size) {
  var ret = HEAP32[DYNAMICTOP_PTR>>2];
  var end = (ret + size + 15) & -16;
  HEAP32[DYNAMICTOP_PTR>>2] = end;
  if (end >= TOTAL_MEMORY) {
    var success = enlargeMemory();
    if (!success) {
      HEAP32[DYNAMICTOP_PTR>>2] = ret;
      return 0;
    }
  }
  return ret;
}

function alignMemory(size, factor) {
  if (!factor) factor = STACK_ALIGN; // stack alignment (16-byte) by default
  var ret = size = Math.ceil(size / factor) * factor;
  return ret;
}

function getNativeTypeSize(type) {
  switch (type) {
    case 'i1': case 'i8': return 1;
    case 'i16': return 2;
    case 'i32': return 4;
    case 'i64': return 8;
    case 'float': return 4;
    case 'double': return 8;
    default: {
      if (type[type.length-1] === '*') {
        return 4; // A pointer
      } else if (type[0] === 'i') {
        var bits = parseInt(type.substr(1));
        assert(bits % 8 === 0);
        return bits / 8;
      } else {
        return 0;
      }
    }
  }
}

function warnOnce(text) {
  if (!warnOnce.shown) warnOnce.shown = {};
  if (!warnOnce.shown[text]) {
    warnOnce.shown[text] = 1;
    err(text);
  }
}

var asm2wasmImports = { // special asm2wasm imports
    "f64-rem": function(x, y) {
        return x % y;
    },
    "debugger": function() {
        debugger;
    }
};



var jsCallStartIndex = 1;
var functionPointers = new Array(0);

// 'sig' parameter is only used on LLVM wasm backend
function addFunction(func, sig) {
  var base = 0;
  for (var i = base; i < base + 0; i++) {
    if (!functionPointers[i]) {
      functionPointers[i] = func;
      return jsCallStartIndex + i;
    }
  }
  throw 'Finished up all reserved function pointers. Use a higher value for RESERVED_FUNCTION_POINTERS.';
}

function removeFunction(index) {
  functionPointers[index-jsCallStartIndex] = null;
}

var funcWrappers = {};

function getFuncWrapper(func, sig) {
  if (!func) return; // on null pointer, return undefined
  assert(sig);
  if (!funcWrappers[sig]) {
    funcWrappers[sig] = {};
  }
  var sigCache = funcWrappers[sig];
  if (!sigCache[func]) {
    // optimize away arguments usage in common cases
    if (sig.length === 1) {
      sigCache[func] = function dynCall_wrapper() {
        return dynCall(sig, func);
      };
    } else if (sig.length === 2) {
      sigCache[func] = function dynCall_wrapper(arg) {
        return dynCall(sig, func, [arg]);
      };
    } else {
      // general case
      sigCache[func] = function dynCall_wrapper() {
        return dynCall(sig, func, Array.prototype.slice.call(arguments));
      };
    }
  }
  return sigCache[func];
}


function makeBigInt(low, high, unsigned) {
  return unsigned ? ((+((low>>>0)))+((+((high>>>0)))*4294967296.0)) : ((+((low>>>0)))+((+((high|0)))*4294967296.0));
}

function dynCall(sig, ptr, args) {
  if (args && args.length) {
    return Module['dynCall_' + sig].apply(null, [ptr].concat(args));
  } else {
    return Module['dynCall_' + sig].call(null, ptr);
  }
}



var Runtime = {
  // FIXME backwards compatibility layer for ports. Support some Runtime.*
  //       for now, fix it there, then remove it from here. That way we
  //       can minimize any period of breakage.
  dynCall: dynCall, // for SDL2 port
};

// The address globals begin at. Very low in memory, for code size and optimization opportunities.
// Above 0 is static memory, starting with globals.
// Then the stack.
// Then 'dynamic' memory for sbrk.
var GLOBAL_BASE = 1024;


// === Preamble library stuff ===

// Documentation for the public APIs defined in this file must be updated in:
//    site/source/docs/api_reference/preamble.js.rst
// A prebuilt local version of the documentation is available at:
//    site/build/text/docs/api_reference/preamble.js.txt
// You can also build docs locally as HTML or other formats in site/
// An online HTML version (which may be of a different version of Emscripten)
//    is up at http://kripken.github.io/emscripten-site/docs/api_reference/preamble.js.html



//========================================
// Runtime essentials
//========================================

// whether we are quitting the application. no code should run after this.
// set in exit() and abort()
var ABORT = false;

// set by exit() and abort().  Passed to 'onExit' handler.
// NOTE: This is also used as the process return code code in shell environments
// but only when noExitRuntime is false.
var EXITSTATUS = 0;

/** @type {function(*, string=)} */
function assert(condition, text) {
  if (!condition) {
    abort('Assertion failed: ' + text);
  }
}

var globalScope = this;

// Returns the C function with a specified identifier (for C++, you need to do manual name mangling)
function getCFunc(ident) {
  var func = Module['_' + ident]; // closure exported function
  assert(func, 'Cannot call unknown function ' + ident + ', make sure it is exported');
  return func;
}

var JSfuncs = {
  // Helpers for cwrap -- it can't refer to Runtime directly because it might
  // be renamed by closure, instead it calls JSfuncs['stackSave'].body to find
  // out what the minified function name is.
  'stackSave': function() {
    stackSave()
  },
  'stackRestore': function() {
    stackRestore()
  },
  // type conversion from js to c
  'arrayToC' : function(arr) {
    var ret = stackAlloc(arr.length);
    writeArrayToMemory(arr, ret);
    return ret;
  },
  'stringToC' : function(str) {
    var ret = 0;
    if (str !== null && str !== undefined && str !== 0) { // null string
      // at most 4 bytes per UTF-8 code point, +1 for the trailing '\0'
      var len = (str.length << 2) + 1;
      ret = stackAlloc(len);
      stringToUTF8(str, ret, len);
    }
    return ret;
  }
};

// For fast lookup of conversion functions
var toC = {
  'string': JSfuncs['stringToC'], 'array': JSfuncs['arrayToC']
};


// C calling interface.
function ccall(ident, returnType, argTypes, args, opts) {
  function convertReturnValue(ret) {
    if (returnType === 'string') return Pointer_stringify(ret);
    if (returnType === 'boolean') return Boolean(ret);
    return ret;
  }

  var func = getCFunc(ident);
  var cArgs = [];
  var stack = 0;
  if (args) {
    for (var i = 0; i < args.length; i++) {
      var converter = toC[argTypes[i]];
      if (converter) {
        if (stack === 0) stack = stackSave();
        cArgs[i] = converter(args[i]);
      } else {
        cArgs[i] = args[i];
      }
    }
  }
  var ret = func.apply(null, cArgs);
  ret = convertReturnValue(ret);
  if (stack !== 0) stackRestore(stack);
  return ret;
}

function cwrap(ident, returnType, argTypes, opts) {
  argTypes = argTypes || [];
  // When the function takes numbers and returns a number, we can just return
  // the original function
  var numericArgs = argTypes.every(function(type){ return type === 'number'});
  var numericRet = returnType !== 'string';
  if (numericRet && numericArgs && !opts) {
    return getCFunc(ident);
  }
  return function() {
    return ccall(ident, returnType, argTypes, arguments, opts);
  }
}

/** @type {function(number, number, string, boolean=)} */
function setValue(ptr, value, type, noSafe) {
  type = type || 'i8';
  if (type.charAt(type.length-1) === '*') type = 'i32'; // pointers are 32-bit
    switch(type) {
      case 'i1': HEAP8[((ptr)>>0)]=value; break;
      case 'i8': HEAP8[((ptr)>>0)]=value; break;
      case 'i16': HEAP16[((ptr)>>1)]=value; break;
      case 'i32': HEAP32[((ptr)>>2)]=value; break;
      case 'i64': (tempI64 = [value>>>0,(tempDouble=value,(+(Math_abs(tempDouble))) >= 1.0 ? (tempDouble > 0.0 ? ((Math_min((+(Math_floor((tempDouble)/4294967296.0))), 4294967295.0))|0)>>>0 : (~~((+(Math_ceil((tempDouble - +(((~~(tempDouble)))>>>0))/4294967296.0)))))>>>0) : 0)],HEAP32[((ptr)>>2)]=tempI64[0],HEAP32[(((ptr)+(4))>>2)]=tempI64[1]); break;
      case 'float': HEAPF32[((ptr)>>2)]=value; break;
      case 'double': HEAPF64[((ptr)>>3)]=value; break;
      default: abort('invalid type for setValue: ' + type);
    }
}

/** @type {function(number, string, boolean=)} */
function getValue(ptr, type, noSafe) {
  type = type || 'i8';
  if (type.charAt(type.length-1) === '*') type = 'i32'; // pointers are 32-bit
    switch(type) {
      case 'i1': return HEAP8[((ptr)>>0)];
      case 'i8': return HEAP8[((ptr)>>0)];
      case 'i16': return HEAP16[((ptr)>>1)];
      case 'i32': return HEAP32[((ptr)>>2)];
      case 'i64': return HEAP32[((ptr)>>2)];
      case 'float': return HEAPF32[((ptr)>>2)];
      case 'double': return HEAPF64[((ptr)>>3)];
      default: abort('invalid type for getValue: ' + type);
    }
  return null;
}

var ALLOC_NORMAL = 0; // Tries to use _malloc()
var ALLOC_STACK = 1; // Lives for the duration of the current function call
var ALLOC_STATIC = 2; // Cannot be freed
var ALLOC_DYNAMIC = 3; // Cannot be freed except through sbrk
var ALLOC_NONE = 4; // Do not allocate

// allocate(): This is for internal use. You can use it yourself as well, but the interface
//             is a little tricky (see docs right below). The reason is that it is optimized
//             for multiple syntaxes to save space in generated code. So you should
//             normally not use allocate(), and instead allocate memory using _malloc(),
//             initialize it with setValue(), and so forth.
// @slab: An array of data, or a number. If a number, then the size of the block to allocate,
//        in *bytes* (note that this is sometimes confusing: the next parameter does not
//        affect this!)
// @types: Either an array of types, one for each byte (or 0 if no type at that position),
//         or a single type which is used for the entire block. This only matters if there
//         is initial data - if @slab is a number, then this does not matter at all and is
//         ignored.
// @allocator: How to allocate memory, see ALLOC_*
/** @type {function((TypedArray|Array<number>|number), string, number, number=)} */
function allocate(slab, types, allocator, ptr) {
  var zeroinit, size;
  if (typeof slab === 'number') {
    zeroinit = true;
    size = slab;
  } else {
    zeroinit = false;
    size = slab.length;
  }

  var singleType = typeof types === 'string' ? types : null;

  var ret;
  if (allocator == ALLOC_NONE) {
    ret = ptr;
  } else {
    ret = [typeof _malloc === 'function' ? _malloc : staticAlloc, stackAlloc, staticAlloc, dynamicAlloc][allocator === undefined ? ALLOC_STATIC : allocator](Math.max(size, singleType ? 1 : types.length));
  }

  if (zeroinit) {
    var stop;
    ptr = ret;
    assert((ret & 3) == 0);
    stop = ret + (size & ~3);
    for (; ptr < stop; ptr += 4) {
      HEAP32[((ptr)>>2)]=0;
    }
    stop = ret + size;
    while (ptr < stop) {
      HEAP8[((ptr++)>>0)]=0;
    }
    return ret;
  }

  if (singleType === 'i8') {
    if (slab.subarray || slab.slice) {
      HEAPU8.set(/** @type {!Uint8Array} */ (slab), ret);
    } else {
      HEAPU8.set(new Uint8Array(slab), ret);
    }
    return ret;
  }

  var i = 0, type, typeSize, previousType;
  while (i < size) {
    var curr = slab[i];

    type = singleType || types[i];
    if (type === 0) {
      i++;
      continue;
    }

    if (type == 'i64') type = 'i32'; // special case: we have one i32 here, and one i32 later

    setValue(ret+i, curr, type);

    // no need to look up size unless type changes, so cache it
    if (previousType !== type) {
      typeSize = getNativeTypeSize(type);
      previousType = type;
    }
    i += typeSize;
  }

  return ret;
}

// Allocate memory during any stage of startup - static memory early on, dynamic memory later, malloc when ready
function getMemory(size) {
  if (!staticSealed) return staticAlloc(size);
  if (!runtimeInitialized) return dynamicAlloc(size);
  return _malloc(size);
}

/** @type {function(number, number=)} */
function Pointer_stringify(ptr, length) {
  if (length === 0 || !ptr) return '';
  // Find the length, and check for UTF while doing so
  var hasUtf = 0;
  var t;
  var i = 0;
  while (1) {
    t = HEAPU8[(((ptr)+(i))>>0)];
    hasUtf |= t;
    if (t == 0 && !length) break;
    i++;
    if (length && i == length) break;
  }
  if (!length) length = i;

  var ret = '';

  if (hasUtf < 128) {
    var MAX_CHUNK = 1024; // split up into chunks, because .apply on a huge string can overflow the stack
    var curr;
    while (length > 0) {
      curr = String.fromCharCode.apply(String, HEAPU8.subarray(ptr, ptr + Math.min(length, MAX_CHUNK)));
      ret = ret ? ret + curr : curr;
      ptr += MAX_CHUNK;
      length -= MAX_CHUNK;
    }
    return ret;
  }
  return UTF8ToString(ptr);
}

// Given a pointer 'ptr' to a null-terminated ASCII-encoded string in the emscripten HEAP, returns
// a copy of that string as a Javascript String object.

function AsciiToString(ptr) {
  var str = '';
  while (1) {
    var ch = HEAP8[((ptr++)>>0)];
    if (!ch) return str;
    str += String.fromCharCode(ch);
  }
}

// Copies the given Javascript String object 'str' to the emscripten HEAP at address 'outPtr',
// null-terminated and encoded in ASCII form. The copy will require at most str.length+1 bytes of space in the HEAP.

function stringToAscii(str, outPtr) {
  return writeAsciiToMemory(str, outPtr, false);
}

// Given a pointer 'ptr' to a null-terminated UTF8-encoded string in the given array that contains uint8 values, returns
// a copy of that string as a Javascript String object.

var UTF8Decoder = typeof TextDecoder !== 'undefined' ? new TextDecoder('utf8') : undefined;
function UTF8ArrayToString(u8Array, idx) {
  var endPtr = idx;
  // TextDecoder needs to know the byte length in advance, it doesn't stop on null terminator by itself.
  // Also, use the length info to avoid running tiny strings through TextDecoder, since .subarray() allocates garbage.
  while (u8Array[endPtr]) ++endPtr;

  if (endPtr - idx > 16 && u8Array.subarray && UTF8Decoder) {
    return UTF8Decoder.decode(u8Array.subarray(idx, endPtr));
  } else {
    var u0, u1, u2, u3, u4, u5;

    var str = '';
    while (1) {
      // For UTF8 byte structure, see:
      // http://en.wikipedia.org/wiki/UTF-8#Description
      // https://www.ietf.org/rfc/rfc2279.txt
      // https://tools.ietf.org/html/rfc3629
      u0 = u8Array[idx++];
      if (!u0) return str;
      if (!(u0 & 0x80)) { str += String.fromCharCode(u0); continue; }
      u1 = u8Array[idx++] & 63;
      if ((u0 & 0xE0) == 0xC0) { str += String.fromCharCode(((u0 & 31) << 6) | u1); continue; }
      u2 = u8Array[idx++] & 63;
      if ((u0 & 0xF0) == 0xE0) {
        u0 = ((u0 & 15) << 12) | (u1 << 6) | u2;
      } else {
        u3 = u8Array[idx++] & 63;
        if ((u0 & 0xF8) == 0xF0) {
          u0 = ((u0 & 7) << 18) | (u1 << 12) | (u2 << 6) | u3;
        } else {
          u4 = u8Array[idx++] & 63;
          if ((u0 & 0xFC) == 0xF8) {
            u0 = ((u0 & 3) << 24) | (u1 << 18) | (u2 << 12) | (u3 << 6) | u4;
          } else {
            u5 = u8Array[idx++] & 63;
            u0 = ((u0 & 1) << 30) | (u1 << 24) | (u2 << 18) | (u3 << 12) | (u4 << 6) | u5;
          }
        }
      }
      if (u0 < 0x10000) {
        str += String.fromCharCode(u0);
      } else {
        var ch = u0 - 0x10000;
        str += String.fromCharCode(0xD800 | (ch >> 10), 0xDC00 | (ch & 0x3FF));
      }
    }
  }
}

// Given a pointer 'ptr' to a null-terminated UTF8-encoded string in the emscripten HEAP, returns
// a copy of that string as a Javascript String object.

function UTF8ToString(ptr) {
  return UTF8ArrayToString(HEAPU8,ptr);
}

// Copies the given Javascript String object 'str' to the given byte array at address 'outIdx',
// encoded in UTF8 form and null-terminated. The copy will require at most str.length*4+1 bytes of space in the HEAP.
// Use the function lengthBytesUTF8 to compute the exact number of bytes (excluding null terminator) that this function will write.
// Parameters:
//   str: the Javascript string to copy.
//   outU8Array: the array to copy to. Each index in this array is assumed to be one 8-byte element.
//   outIdx: The starting offset in the array to begin the copying.
//   maxBytesToWrite: The maximum number of bytes this function can write to the array.
//                    This count should include the null terminator,
//                    i.e. if maxBytesToWrite=1, only the null terminator will be written and nothing else.
//                    maxBytesToWrite=0 does not write any bytes to the output, not even the null terminator.
// Returns the number of bytes written, EXCLUDING the null terminator.

function stringToUTF8Array(str, outU8Array, outIdx, maxBytesToWrite) {
  if (!(maxBytesToWrite > 0)) // Parameter maxBytesToWrite is not optional. Negative values, 0, null, undefined and false each don't write out any bytes.
    return 0;

  var startIdx = outIdx;
  var endIdx = outIdx + maxBytesToWrite - 1; // -1 for string null terminator.
  for (var i = 0; i < str.length; ++i) {
    // Gotcha: charCodeAt returns a 16-bit word that is a UTF-16 encoded code unit, not a Unicode code point of the character! So decode UTF16->UTF32->UTF8.
    // See http://unicode.org/faq/utf_bom.html#utf16-3
    // For UTF8 byte structure, see http://en.wikipedia.org/wiki/UTF-8#Description and https://www.ietf.org/rfc/rfc2279.txt and https://tools.ietf.org/html/rfc3629
    var u = str.charCodeAt(i); // possibly a lead surrogate
    if (u >= 0xD800 && u <= 0xDFFF) {
      var u1 = str.charCodeAt(++i);
      u = 0x10000 + ((u & 0x3FF) << 10) | (u1 & 0x3FF);
    }
    if (u <= 0x7F) {
      if (outIdx >= endIdx) break;
      outU8Array[outIdx++] = u;
    } else if (u <= 0x7FF) {
      if (outIdx + 1 >= endIdx) break;
      outU8Array[outIdx++] = 0xC0 | (u >> 6);
      outU8Array[outIdx++] = 0x80 | (u & 63);
    } else if (u <= 0xFFFF) {
      if (outIdx + 2 >= endIdx) break;
      outU8Array[outIdx++] = 0xE0 | (u >> 12);
      outU8Array[outIdx++] = 0x80 | ((u >> 6) & 63);
      outU8Array[outIdx++] = 0x80 | (u & 63);
    } else if (u <= 0x1FFFFF) {
      if (outIdx + 3 >= endIdx) break;
      outU8Array[outIdx++] = 0xF0 | (u >> 18);
      outU8Array[outIdx++] = 0x80 | ((u >> 12) & 63);
      outU8Array[outIdx++] = 0x80 | ((u >> 6) & 63);
      outU8Array[outIdx++] = 0x80 | (u & 63);
    } else if (u <= 0x3FFFFFF) {
      if (outIdx + 4 >= endIdx) break;
      outU8Array[outIdx++] = 0xF8 | (u >> 24);
      outU8Array[outIdx++] = 0x80 | ((u >> 18) & 63);
      outU8Array[outIdx++] = 0x80 | ((u >> 12) & 63);
      outU8Array[outIdx++] = 0x80 | ((u >> 6) & 63);
      outU8Array[outIdx++] = 0x80 | (u & 63);
    } else {
      if (outIdx + 5 >= endIdx) break;
      outU8Array[outIdx++] = 0xFC | (u >> 30);
      outU8Array[outIdx++] = 0x80 | ((u >> 24) & 63);
      outU8Array[outIdx++] = 0x80 | ((u >> 18) & 63);
      outU8Array[outIdx++] = 0x80 | ((u >> 12) & 63);
      outU8Array[outIdx++] = 0x80 | ((u >> 6) & 63);
      outU8Array[outIdx++] = 0x80 | (u & 63);
    }
  }
  // Null-terminate the pointer to the buffer.
  outU8Array[outIdx] = 0;
  return outIdx - startIdx;
}

// Copies the given Javascript String object 'str' to the emscripten HEAP at address 'outPtr',
// null-terminated and encoded in UTF8 form. The copy will require at most str.length*4+1 bytes of space in the HEAP.
// Use the function lengthBytesUTF8 to compute the exact number of bytes (excluding null terminator) that this function will write.
// Returns the number of bytes written, EXCLUDING the null terminator.

function stringToUTF8(str, outPtr, maxBytesToWrite) {
  return stringToUTF8Array(str, HEAPU8,outPtr, maxBytesToWrite);
}

// Returns the number of bytes the given Javascript string takes if encoded as a UTF8 byte array, EXCLUDING the null terminator byte.

function lengthBytesUTF8(str) {
  var len = 0;
  for (var i = 0; i < str.length; ++i) {
    // Gotcha: charCodeAt returns a 16-bit word that is a UTF-16 encoded code unit, not a Unicode code point of the character! So decode UTF16->UTF32->UTF8.
    // See http://unicode.org/faq/utf_bom.html#utf16-3
    var u = str.charCodeAt(i); // possibly a lead surrogate
    if (u >= 0xD800 && u <= 0xDFFF) u = 0x10000 + ((u & 0x3FF) << 10) | (str.charCodeAt(++i) & 0x3FF);
    if (u <= 0x7F) {
      ++len;
    } else if (u <= 0x7FF) {
      len += 2;
    } else if (u <= 0xFFFF) {
      len += 3;
    } else if (u <= 0x1FFFFF) {
      len += 4;
    } else if (u <= 0x3FFFFFF) {
      len += 5;
    } else {
      len += 6;
    }
  }
  return len;
}

// Given a pointer 'ptr' to a null-terminated UTF16LE-encoded string in the emscripten HEAP, returns
// a copy of that string as a Javascript String object.

var UTF16Decoder = typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-16le') : undefined;
function UTF16ToString(ptr) {
  var endPtr = ptr;
  // TextDecoder needs to know the byte length in advance, it doesn't stop on null terminator by itself.
  // Also, use the length info to avoid running tiny strings through TextDecoder, since .subarray() allocates garbage.
  var idx = endPtr >> 1;
  while (HEAP16[idx]) ++idx;
  endPtr = idx << 1;

  if (endPtr - ptr > 32 && UTF16Decoder) {
    return UTF16Decoder.decode(HEAPU8.subarray(ptr, endPtr));
  } else {
    var i = 0;

    var str = '';
    while (1) {
      var codeUnit = HEAP16[(((ptr)+(i*2))>>1)];
      if (codeUnit == 0) return str;
      ++i;
      // fromCharCode constructs a character from a UTF-16 code unit, so we can pass the UTF16 string right through.
      str += String.fromCharCode(codeUnit);
    }
  }
}

// Copies the given Javascript String object 'str' to the emscripten HEAP at address 'outPtr',
// null-terminated and encoded in UTF16 form. The copy will require at most str.length*4+2 bytes of space in the HEAP.
// Use the function lengthBytesUTF16() to compute the exact number of bytes (excluding null terminator) that this function will write.
// Parameters:
//   str: the Javascript string to copy.
//   outPtr: Byte address in Emscripten HEAP where to write the string to.
//   maxBytesToWrite: The maximum number of bytes this function can write to the array. This count should include the null
//                    terminator, i.e. if maxBytesToWrite=2, only the null terminator will be written and nothing else.
//                    maxBytesToWrite<2 does not write any bytes to the output, not even the null terminator.
// Returns the number of bytes written, EXCLUDING the null terminator.

function stringToUTF16(str, outPtr, maxBytesToWrite) {
  // Backwards compatibility: if max bytes is not specified, assume unsafe unbounded write is allowed.
  if (maxBytesToWrite === undefined) {
    maxBytesToWrite = 0x7FFFFFFF;
  }
  if (maxBytesToWrite < 2) return 0;
  maxBytesToWrite -= 2; // Null terminator.
  var startPtr = outPtr;
  var numCharsToWrite = (maxBytesToWrite < str.length*2) ? (maxBytesToWrite / 2) : str.length;
  for (var i = 0; i < numCharsToWrite; ++i) {
    // charCodeAt returns a UTF-16 encoded code unit, so it can be directly written to the HEAP.
    var codeUnit = str.charCodeAt(i); // possibly a lead surrogate
    HEAP16[((outPtr)>>1)]=codeUnit;
    outPtr += 2;
  }
  // Null-terminate the pointer to the HEAP.
  HEAP16[((outPtr)>>1)]=0;
  return outPtr - startPtr;
}

// Returns the number of bytes the given Javascript string takes if encoded as a UTF16 byte array, EXCLUDING the null terminator byte.

function lengthBytesUTF16(str) {
  return str.length*2;
}

function UTF32ToString(ptr) {
  var i = 0;

  var str = '';
  while (1) {
    var utf32 = HEAP32[(((ptr)+(i*4))>>2)];
    if (utf32 == 0)
      return str;
    ++i;
    // Gotcha: fromCharCode constructs a character from a UTF-16 encoded code (pair), not from a Unicode code point! So encode the code point to UTF-16 for constructing.
    // See http://unicode.org/faq/utf_bom.html#utf16-3
    if (utf32 >= 0x10000) {
      var ch = utf32 - 0x10000;
      str += String.fromCharCode(0xD800 | (ch >> 10), 0xDC00 | (ch & 0x3FF));
    } else {
      str += String.fromCharCode(utf32);
    }
  }
}

// Copies the given Javascript String object 'str' to the emscripten HEAP at address 'outPtr',
// null-terminated and encoded in UTF32 form. The copy will require at most str.length*4+4 bytes of space in the HEAP.
// Use the function lengthBytesUTF32() to compute the exact number of bytes (excluding null terminator) that this function will write.
// Parameters:
//   str: the Javascript string to copy.
//   outPtr: Byte address in Emscripten HEAP where to write the string to.
//   maxBytesToWrite: The maximum number of bytes this function can write to the array. This count should include the null
//                    terminator, i.e. if maxBytesToWrite=4, only the null terminator will be written and nothing else.
//                    maxBytesToWrite<4 does not write any bytes to the output, not even the null terminator.
// Returns the number of bytes written, EXCLUDING the null terminator.

function stringToUTF32(str, outPtr, maxBytesToWrite) {
  // Backwards compatibility: if max bytes is not specified, assume unsafe unbounded write is allowed.
  if (maxBytesToWrite === undefined) {
    maxBytesToWrite = 0x7FFFFFFF;
  }
  if (maxBytesToWrite < 4) return 0;
  var startPtr = outPtr;
  var endPtr = startPtr + maxBytesToWrite - 4;
  for (var i = 0; i < str.length; ++i) {
    // Gotcha: charCodeAt returns a 16-bit word that is a UTF-16 encoded code unit, not a Unicode code point of the character! We must decode the string to UTF-32 to the heap.
    // See http://unicode.org/faq/utf_bom.html#utf16-3
    var codeUnit = str.charCodeAt(i); // possibly a lead surrogate
    if (codeUnit >= 0xD800 && codeUnit <= 0xDFFF) {
      var trailSurrogate = str.charCodeAt(++i);
      codeUnit = 0x10000 + ((codeUnit & 0x3FF) << 10) | (trailSurrogate & 0x3FF);
    }
    HEAP32[((outPtr)>>2)]=codeUnit;
    outPtr += 4;
    if (outPtr + 4 > endPtr) break;
  }
  // Null-terminate the pointer to the HEAP.
  HEAP32[((outPtr)>>2)]=0;
  return outPtr - startPtr;
}

// Returns the number of bytes the given Javascript string takes if encoded as a UTF16 byte array, EXCLUDING the null terminator byte.

function lengthBytesUTF32(str) {
  var len = 0;
  for (var i = 0; i < str.length; ++i) {
    // Gotcha: charCodeAt returns a 16-bit word that is a UTF-16 encoded code unit, not a Unicode code point of the character! We must decode the string to UTF-32 to the heap.
    // See http://unicode.org/faq/utf_bom.html#utf16-3
    var codeUnit = str.charCodeAt(i);
    if (codeUnit >= 0xD800 && codeUnit <= 0xDFFF) ++i; // possibly a lead surrogate, so skip over the tail surrogate.
    len += 4;
  }

  return len;
}

// Allocate heap space for a JS string, and write it there.
// It is the responsibility of the caller to free() that memory.
function allocateUTF8(str) {
  var size = lengthBytesUTF8(str) + 1;
  var ret = _malloc(size);
  if (ret) stringToUTF8Array(str, HEAP8, ret, size);
  return ret;
}

// Allocate stack space for a JS string, and write it there.
function allocateUTF8OnStack(str) {
  var size = lengthBytesUTF8(str) + 1;
  var ret = stackAlloc(size);
  stringToUTF8Array(str, HEAP8, ret, size);
  return ret;
}

function demangle(func) {
  return func;
}

function demangleAll(text) {
  var regex =
    /__Z[\w\d_]+/g;
  return text.replace(regex,
    function(x) {
      var y = demangle(x);
      return x === y ? x : (y + ' [' + x + ']');
    });
}

function jsStackTrace() {
  var err = new Error();
  if (!err.stack) {
    // IE10+ special cases: It does have callstack info, but it is only populated if an Error object is thrown,
    // so try that as a special-case.
    try {
      throw new Error(0);
    } catch(e) {
      err = e;
    }
    if (!err.stack) {
      return '(no stack trace available)';
    }
  }
  return err.stack.toString();
}

function stackTrace() {
  var js = jsStackTrace();
  if (Module['extraStackTrace']) js += '\n' + Module['extraStackTrace']();
  return demangleAll(js);
}

// Memory management

var PAGE_SIZE = 16384;
var WASM_PAGE_SIZE = 65536;
var ASMJS_PAGE_SIZE = 16777216;
var MIN_TOTAL_MEMORY = 16777216;

function alignUp(x, multiple) {
  if (x % multiple > 0) {
    x += multiple - (x % multiple);
  }
  return x;
}

var HEAP,
/** @type {ArrayBuffer} */
  buffer,
/** @type {Int8Array} */
  HEAP8,
/** @type {Uint8Array} */
  HEAPU8,
/** @type {Int16Array} */
  HEAP16,
/** @type {Uint16Array} */
  HEAPU16,
/** @type {Int32Array} */
  HEAP32,
/** @type {Uint32Array} */
  HEAPU32,
/** @type {Float32Array} */
  HEAPF32,
/** @type {Float64Array} */
  HEAPF64;

function updateGlobalBuffer(buf) {
  Module['buffer'] = buffer = buf;
}

function updateGlobalBufferViews() {
  Module['HEAP8'] = HEAP8 = new Int8Array(buffer);
  Module['HEAP16'] = HEAP16 = new Int16Array(buffer);
  Module['HEAP32'] = HEAP32 = new Int32Array(buffer);
  Module['HEAPU8'] = HEAPU8 = new Uint8Array(buffer);
  Module['HEAPU16'] = HEAPU16 = new Uint16Array(buffer);
  Module['HEAPU32'] = HEAPU32 = new Uint32Array(buffer);
  Module['HEAPF32'] = HEAPF32 = new Float32Array(buffer);
  Module['HEAPF64'] = HEAPF64 = new Float64Array(buffer);
}

var STATIC_BASE, STATICTOP, staticSealed; // static area
var STACK_BASE, STACKTOP, STACK_MAX; // stack area
var DYNAMIC_BASE, DYNAMICTOP_PTR; // dynamic area handled by sbrk

  STATIC_BASE = STATICTOP = STACK_BASE = STACKTOP = STACK_MAX = DYNAMIC_BASE = DYNAMICTOP_PTR = 0;
  staticSealed = false;




function abortOnCannotGrowMemory() {
  abort('Cannot enlarge memory arrays. Either (1) compile with  -s TOTAL_MEMORY=X  with X higher than the current value ' + TOTAL_MEMORY + ', (2) compile with  -s ALLOW_MEMORY_GROWTH=1  which allows increasing the size at runtime, or (3) if you want malloc to return NULL (0) instead of this abort, compile with  -s ABORTING_MALLOC=0 ');
}

if (!Module['reallocBuffer']) Module['reallocBuffer'] = function(size) {
  var ret;
  try {
    var oldHEAP8 = HEAP8;
    ret = new ArrayBuffer(size);
    var temp = new Int8Array(ret);
    temp.set(oldHEAP8);
  } catch(e) {
    return false;
  }
  var success = _emscripten_replace_memory(ret);
  if (!success) return false;
  return ret;
};

function enlargeMemory() {
  // TOTAL_MEMORY is the current size of the actual array, and DYNAMICTOP is the new top.


  var PAGE_MULTIPLE = Module["usingWasm"] ? WASM_PAGE_SIZE : ASMJS_PAGE_SIZE; // In wasm, heap size must be a multiple of 64KB. In asm.js, they need to be multiples of 16MB.
  var LIMIT = 2147483648 - PAGE_MULTIPLE; // We can do one page short of 2GB as theoretical maximum.

  if (HEAP32[DYNAMICTOP_PTR>>2] > LIMIT) {
    return false;
  }

  var OLD_TOTAL_MEMORY = TOTAL_MEMORY;
  TOTAL_MEMORY = Math.max(TOTAL_MEMORY, MIN_TOTAL_MEMORY); // So the loop below will not be infinite, and minimum asm.js memory size is 16MB.

  while (TOTAL_MEMORY < HEAP32[DYNAMICTOP_PTR>>2]) { // Keep incrementing the heap size as long as it's less than what is requested.
    if (TOTAL_MEMORY <= 536870912) {
      TOTAL_MEMORY = alignUp(2 * TOTAL_MEMORY, PAGE_MULTIPLE); // Simple heuristic: double until 1GB...
    } else {
      // ..., but after that, add smaller increments towards 2GB, which we cannot reach
      TOTAL_MEMORY = Math.min(alignUp((3 * TOTAL_MEMORY + 2147483648) / 4, PAGE_MULTIPLE), LIMIT);
    }
  }



  var replacement = Module['reallocBuffer'](TOTAL_MEMORY);
  if (!replacement || replacement.byteLength != TOTAL_MEMORY) {
    // restore the state to before this call, we failed
    TOTAL_MEMORY = OLD_TOTAL_MEMORY;
    return false;
  }

  // everything worked

  updateGlobalBuffer(replacement);
  updateGlobalBufferViews();



  return true;
}

var byteLength;
try {
  byteLength = Function.prototype.call.bind(Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'byteLength').get);
  byteLength(new ArrayBuffer(4)); // can fail on older ie
} catch(e) { // can fail on older node/v8
  byteLength = function(buffer) { return buffer.byteLength; };
}

var TOTAL_STACK = Module['TOTAL_STACK'] || 5242880;
var TOTAL_MEMORY = Module['TOTAL_MEMORY'] || 16777216;
if (TOTAL_MEMORY < TOTAL_STACK) err('TOTAL_MEMORY should be larger than TOTAL_STACK, was ' + TOTAL_MEMORY + '! (TOTAL_STACK=' + TOTAL_STACK + ')');

// Initialize the runtime's memory



// Use a provided buffer, if there is one, or else allocate a new one
if (Module['buffer']) {
  buffer = Module['buffer'];
} else {
  // Use a WebAssembly memory where available
  if (typeof WebAssembly === 'object' && typeof WebAssembly.Memory === 'function') {
    Module['wasmMemory'] = new WebAssembly.Memory({ 'initial': TOTAL_MEMORY / WASM_PAGE_SIZE });
    buffer = Module['wasmMemory'].buffer;
  } else
  {
    buffer = new ArrayBuffer(TOTAL_MEMORY);
  }
  Module['buffer'] = buffer;
}
updateGlobalBufferViews();


function getTotalMemory() {
  return TOTAL_MEMORY;
}

// Endianness check (note: assumes compiler arch was little-endian)

function callRuntimeCallbacks(callbacks) {
  while(callbacks.length > 0) {
    var callback = callbacks.shift();
    if (typeof callback == 'function') {
      callback();
      continue;
    }
    var func = callback.func;
    if (typeof func === 'number') {
      if (callback.arg === undefined) {
        Module['dynCall_v'](func);
      } else {
        Module['dynCall_vi'](func, callback.arg);
      }
    } else {
      func(callback.arg === undefined ? null : callback.arg);
    }
  }
}

var __ATPRERUN__  = []; // functions called before the runtime is initialized
var __ATINIT__    = []; // functions called during startup
var __ATMAIN__    = []; // functions called when main() is to be run
var __ATEXIT__    = []; // functions called during shutdown
var __ATPOSTRUN__ = []; // functions called after the main() is called

var runtimeInitialized = false;
var runtimeExited = false;


function preRun() {
  // compatibility - merge in anything from Module['preRun'] at this time
  if (Module['preRun']) {
    if (typeof Module['preRun'] == 'function') Module['preRun'] = [Module['preRun']];
    while (Module['preRun'].length) {
      addOnPreRun(Module['preRun'].shift());
    }
  }
  callRuntimeCallbacks(__ATPRERUN__);
}

function ensureInitRuntime() {
  if (runtimeInitialized) return;
  runtimeInitialized = true;
  callRuntimeCallbacks(__ATINIT__);
}

function preMain() {
  callRuntimeCallbacks(__ATMAIN__);
}

function exitRuntime() {
  callRuntimeCallbacks(__ATEXIT__);
  runtimeExited = true;
}

function postRun() {
  // compatibility - merge in anything from Module['postRun'] at this time
  if (Module['postRun']) {
    if (typeof Module['postRun'] == 'function') Module['postRun'] = [Module['postRun']];
    while (Module['postRun'].length) {
      addOnPostRun(Module['postRun'].shift());
    }
  }
  callRuntimeCallbacks(__ATPOSTRUN__);
}

function addOnPreRun(cb) {
  __ATPRERUN__.unshift(cb);
}

function addOnInit(cb) {
  __ATINIT__.unshift(cb);
}

function addOnPreMain(cb) {
  __ATMAIN__.unshift(cb);
}

function addOnExit(cb) {
  __ATEXIT__.unshift(cb);
}

function addOnPostRun(cb) {
  __ATPOSTRUN__.unshift(cb);
}

// Deprecated: This function should not be called because it is unsafe and does not provide
// a maximum length limit of how many bytes it is allowed to write. Prefer calling the
// function stringToUTF8Array() instead, which takes in a maximum length that can be used
// to be secure from out of bounds writes.
/** @deprecated */
function writeStringToMemory(string, buffer, dontAddNull) {
  warnOnce('writeStringToMemory is deprecated and should not be called! Use stringToUTF8() instead!');

  var /** @type {number} */ lastChar, /** @type {number} */ end;
  if (dontAddNull) {
    // stringToUTF8Array always appends null. If we don't want to do that, remember the
    // character that existed at the location where the null will be placed, and restore
    // that after the write (below).
    end = buffer + lengthBytesUTF8(string);
    lastChar = HEAP8[end];
  }
  stringToUTF8(string, buffer, Infinity);
  if (dontAddNull) HEAP8[end] = lastChar; // Restore the value under the null character.
}

function writeArrayToMemory(array, buffer) {
  HEAP8.set(array, buffer);
}

function writeAsciiToMemory(str, buffer, dontAddNull) {
  for (var i = 0; i < str.length; ++i) {
    HEAP8[((buffer++)>>0)]=str.charCodeAt(i);
  }
  // Null-terminate the pointer to the HEAP.
  if (!dontAddNull) HEAP8[((buffer)>>0)]=0;
}

function unSign(value, bits, ignore) {
  if (value >= 0) {
    return value;
  }
  return bits <= 32 ? 2*Math.abs(1 << (bits-1)) + value // Need some trickery, since if bits == 32, we are right at the limit of the bits JS uses in bitshifts
                    : Math.pow(2, bits)         + value;
}
function reSign(value, bits, ignore) {
  if (value <= 0) {
    return value;
  }
  var half = bits <= 32 ? Math.abs(1 << (bits-1)) // abs is needed if bits == 32
                        : Math.pow(2, bits-1);
  if (value >= half && (bits <= 32 || value > half)) { // for huge values, we can hit the precision limit and always get true here. so don't do that
                                                       // but, in general there is no perfect solution here. With 64-bit ints, we get rounding and errors
                                                       // TODO: In i64 mode 1, resign the two parts separately and safely
    value = -2*half + value; // Cannot bitshift half, as it may be at the limit of the bits JS uses in bitshifts
  }
  return value;
}


var Math_abs = Math.abs;
var Math_cos = Math.cos;
var Math_sin = Math.sin;
var Math_tan = Math.tan;
var Math_acos = Math.acos;
var Math_asin = Math.asin;
var Math_atan = Math.atan;
var Math_atan2 = Math.atan2;
var Math_exp = Math.exp;
var Math_log = Math.log;
var Math_sqrt = Math.sqrt;
var Math_ceil = Math.ceil;
var Math_floor = Math.floor;
var Math_pow = Math.pow;
var Math_imul = Math.imul;
var Math_fround = Math.fround;
var Math_round = Math.round;
var Math_min = Math.min;
var Math_max = Math.max;
var Math_clz32 = Math.clz32;
var Math_trunc = Math.trunc;

// A counter of dependencies for calling run(). If we need to
// do asynchronous work before running, increment this and
// decrement it. Incrementing must happen in a place like
// Module.preRun (used by emcc to add file preloading).
// Note that you can add dependencies in preRun, even though
// it happens right before run - run will be postponed until
// the dependencies are met.
var runDependencies = 0;
var runDependencyWatcher = null;
var dependenciesFulfilled = null; // overridden to take different actions when all run dependencies are fulfilled

function getUniqueRunDependency(id) {
  return id;
}

function addRunDependency(id) {
  runDependencies++;
  if (Module['monitorRunDependencies']) {
    Module['monitorRunDependencies'](runDependencies);
  }
}

function removeRunDependency(id) {
  runDependencies--;
  if (Module['monitorRunDependencies']) {
    Module['monitorRunDependencies'](runDependencies);
  }
  if (runDependencies == 0) {
    if (runDependencyWatcher !== null) {
      clearInterval(runDependencyWatcher);
      runDependencyWatcher = null;
    }
    if (dependenciesFulfilled) {
      var callback = dependenciesFulfilled;
      dependenciesFulfilled = null;
      callback(); // can add another dependenciesFulfilled
    }
  }
}

Module["preloadedImages"] = {}; // maps url to image data
Module["preloadedAudios"] = {}; // maps url to audio data



var memoryInitializer = null;






// Copyright 2017 The Emscripten Authors.  All rights reserved.
// Emscripten is available under two separate licenses, the MIT license and the
// University of Illinois/NCSA Open Source License.  Both these licenses can be
// found in the LICENSE file.

// Prefix of data URIs emitted by SINGLE_FILE and related options.
var dataURIPrefix = 'data:application/octet-stream;base64,';

// Indicates whether filename is a base64 data URI.
function isDataURI(filename) {
  return String.prototype.startsWith ?
      filename.startsWith(dataURIPrefix) :
      filename.indexOf(dataURIPrefix) === 0;
}




function integrateWasmJS() {
  // wasm.js has several methods for creating the compiled code module here:
  //  * 'native-wasm' : use native WebAssembly support in the browser
  //  * 'interpret-s-expr': load s-expression code from a .wast and interpret
  //  * 'interpret-binary': load binary wasm and interpret
  //  * 'interpret-asm2wasm': load asm.js code, translate to wasm, and interpret
  //  * 'asmjs': no wasm, just load the asm.js code and use that (good for testing)
  // The method is set at compile time (BINARYEN_METHOD)
  // The method can be a comma-separated list, in which case, we will try the
  // options one by one. Some of them can fail gracefully, and then we can try
  // the next.

  // inputs

  var method = 'native-wasm';

  var wasmTextFile = '';
  var wasmBinaryFile = 'data:application/octet-stream;base64,AGFzbQEAAAABkgM4YAF/AGABfwF/YAJ/fwF/YAN/f38Bf2ADf39/AGADf398AGACf38AYAR/f39/AGAFf39/f38Bf2AGf39/f39/AX9gAAF/YAAAYAF8AXxgAnx/AXxgBX9/fHx8AX9gBH9/f38Bf2ADf398AX9gAAF8YAd/f39/f39/AX9gAXwBf2AHf39/fHx8fwBgA398fABgBX9/f398AX9gCH9/f39/fH9/AX9gBX9/f3x/AX9gAn98AGAGf398fHx8AGAFf39/f38AYAJ/fwF8YAF/AXxgBH9/f38BfGADfH98AXxgAn99AGABfwF9YAh/f39/f39/fwF/YAV/fHx8fAF/YAJ/fAF/YAZ/f3x8fH8Bf2AEf39/fQF/YAN/f38BfWAJf39/f39/f398AX9gA39/fQBgAn9/AX1gBH9/fH8Bf2AFf39/fX8AYAN+f38Bf2ACfn8Bf2AGf3x/f39/AX9gAXwBfmACfHwBfGACfH8Bf2ADfHx/AXxgBH9/f3wAYAR/f398AX9gBX9/f3x/AGADf39/AXwCowQdA2VudgVhYm9ydAAAA2Vudg1lbmxhcmdlTWVtb3J5AAoDZW52DmdldFRvdGFsTWVtb3J5AAoDZW52F2Fib3J0T25DYW5ub3RHcm93TWVtb3J5AAoDZW52B19fX2xvY2sAAANlbnYLX19fc2V0RXJyTm8AAANlbnYNX19fc3lzY2FsbDE0MAACA2Vudg1fX19zeXNjYWxsMTQ1AAIDZW52DV9fX3N5c2NhbGwxNDYAAgNlbnYNX19fc3lzY2FsbDE1MAACA2Vudg1fX19zeXNjYWxsMTUxAAIDZW52DV9fX3N5c2NhbGwxOTUAAgNlbnYNX19fc3lzY2FsbDIyMQACA2VudgtfX19zeXNjYWxsNQACA2VudgxfX19zeXNjYWxsNTQAAgNlbnYLX19fc3lzY2FsbDYAAgNlbnYJX19fdW5sb2NrAAADZW52Bl9hYm9ydAALA2VudhZfZW1zY3JpcHRlbl9tZW1jcHlfYmlnAAMDZW52DV9nZXR0aW1lb2ZkYXkAAgNlbnYOX2xsdm1fZXhwMl9mNjQADANlbnYHX3VzbGVlcAABA2Vudgl0YWJsZUJhc2UDfwADZW52DkRZTkFNSUNUT1BfUFRSA38AA2VudghTVEFDS1RPUAN/AANlbnYJU1RBQ0tfTUFYA38ABmdsb2JhbAhJbmZpbml0eQN8AANlbnYGbWVtb3J5AgCAAgNlbnYFdGFibGUBcAGUAZQBA9IF0AUBAQoABgYACgsMDAwMDAwMDQ0MDAEAAAAKAgQEBgIBAAACAgICAgIBAwICAAoAAAMDAw4JAg8PAgMCAw8DAwMDEAMDDwMDAw8DBwIDBAMDCwQDAwIKAQELChEPAAoBAgEDAAEBAQMCAgMBAQEIAAMACAEDAgECAAMBAQEDAwIJAAIBCAEBAwABAQkBAQoACgIJAwMCAgIBAAECCRIBBhMAABQHBwQGAAYGFQYGAgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGCwMDAwMWDw8GFwABAQYGBhgABgYGBgYGBgMDAQIGExkAAAAHBxoZAgAAAAIHBgYHBAMEAAQABgYACgYGBgYHBBsGBgQEGwYEBAQEBwQEBAQABAcAAQEBAQEBAQEBAQoAAQYBAhwGBAQGGQEBAQEBHRweHwIKCgMCAAQKAwYBBQUEBAUEBQQCAwACAAIgIAYGBgEPBAMCDwMGCAgPEgkSCQICAQ8DDwMDAwMCAwMDAggICCEBAQEBCQIJIiIICQYDAwACAgICAQICAgIHIyQkJCQdHR0dJQIkJCQCAR0dHQEDAQEBAQEdCQMAAwEmJicCEgIDAgMBAwMDAwMDAwIIDwgPAw8DAQACAQYGBSQZACgAGQEpKSodAAYEAAEDAQQAAAEAAAQBAQEBAQEBKyQBJwQKAAECAQICAQIPDw8BBAMAAQACAwECAQIBAgICAQEBAQMACgEBAywsLAICAgICBwIKAQIGAAYBDwECAgIGAQ8HGR0AAgEDAAEAAwACAgAAAQAkAQEBAwICDwoBAAICBgEDAwEKAwMBAQICAQ8DCAsEAQQtLi4BAhsCLzANDQIKCgICAgMCAwEDDQECAg8CAjEyDzMdAgMAAgECAQoLAQEBAQMDAwMCAgMDCgIBAQ8BAQwMDAwBAwMBAgMPCRIGBDQHGwECAwgJAAYFBAc1NjY2HTcZNRkcBQUGJAd/ASMBC38BIwILfwEjAwt/AUEAC38BQQALfAEjBAt/AUEACweFT+oCEF9fZ3Jvd1dhc21NZW1vcnkAFhFfX19lcnJub19sb2NhdGlvbgDxBBpfZGVsZXRlX2ZsdWlkX2F1ZGlvX2RyaXZlcgDUBBNfZGVsZXRlX2ZsdWlkX2V2ZW50AJUBG19kZWxldGVfZmx1aWRfZmlsZV9yZW5kZXJlcgDeBBlfZGVsZXRlX2ZsdWlkX21pZGlfZHJpdmVyANgEGF9kZWxldGVfZmx1aWRfbWlkaV9ldmVudACPBBlfZGVsZXRlX2ZsdWlkX21pZGlfcm91dGVyAK8EHl9kZWxldGVfZmx1aWRfbWlkaV9yb3V0ZXJfcnVsZQCVARFfZGVsZXRlX2ZsdWlkX21vZAA2FF9kZWxldGVfZmx1aWRfcGxheWVyAJ0EFF9kZWxldGVfZmx1aWRfcHJlc2V0AJUBFF9kZWxldGVfZmx1aWRfc2FtcGxlAKMBF19kZWxldGVfZmx1aWRfc2VxdWVuY2VyAMIEFl9kZWxldGVfZmx1aWRfc2V0dGluZ3MARBZfZGVsZXRlX2ZsdWlkX3NmbG9hZGVyAJUBE19kZWxldGVfZmx1aWRfc2ZvbnQAngETX2RlbGV0ZV9mbHVpZF9zeW50aADnAhxfZmx1aWRfYXVkaW9fZHJpdmVyX3JlZ2lzdGVyANUEG19mbHVpZF9kZWZhdWx0X2xvZ19mdW5jdGlvbgBmGl9mbHVpZF9ldmVudF9hbGxfbm90ZXNfb2ZmAJ8CG19mbHVpZF9ldmVudF9hbGxfc291bmRzX29mZgCeAh9fZmx1aWRfZXZlbnRfYW55X2NvbnRyb2xfY2hhbmdlAKMCGF9mbHVpZF9ldmVudF9iYW5rX3NlbGVjdACgAh1fZmx1aWRfZXZlbnRfY2hhbm5lbF9wcmVzc3VyZQCuAhhfZmx1aWRfZXZlbnRfY2hvcnVzX3NlbmQArAIbX2ZsdWlkX2V2ZW50X2NvbnRyb2xfY2hhbmdlAKgCFV9mbHVpZF9ldmVudF9nZXRfYmFuawC2AhhfZmx1aWRfZXZlbnRfZ2V0X2NoYW5uZWwAswIYX2ZsdWlkX2V2ZW50X2dldF9jb250cm9sALYCFV9mbHVpZF9ldmVudF9nZXRfZGF0YQC4AhVfZmx1aWRfZXZlbnRfZ2V0X2Rlc3QAsgIZX2ZsdWlkX2V2ZW50X2dldF9kdXJhdGlvbgC5AhRfZmx1aWRfZXZlbnRfZ2V0X2tleQC0AhZfZmx1aWRfZXZlbnRfZ2V0X3BpdGNoALoCGF9mbHVpZF9ldmVudF9nZXRfcHJvZ3JhbQC3AhlfZmx1aWRfZXZlbnRfZ2V0X3Nmb250X2lkALkCF19mbHVpZF9ldmVudF9nZXRfc291cmNlALECFV9mbHVpZF9ldmVudF9nZXRfdHlwZQCZARZfZmx1aWRfZXZlbnRfZ2V0X3ZhbHVlALcCGV9mbHVpZF9ldmVudF9nZXRfdmVsb2NpdHkAtQIZX2ZsdWlkX2V2ZW50X2tleV9wcmVzc3VyZQCvAhdfZmx1aWRfZXZlbnRfbW9kdWxhdGlvbgCmAhFfZmx1aWRfZXZlbnRfbm90ZQCdAhRfZmx1aWRfZXZlbnRfbm90ZW9mZgCcAhNfZmx1aWRfZXZlbnRfbm90ZW9uAJsCEF9mbHVpZF9ldmVudF9wYW4AqQIXX2ZsdWlkX2V2ZW50X3BpdGNoX2JlbmQApAIcX2ZsdWlkX2V2ZW50X3BpdGNoX3doZWVsc2VucwClAhtfZmx1aWRfZXZlbnRfcHJvZ3JhbV9jaGFuZ2UAoQIbX2ZsdWlkX2V2ZW50X3Byb2dyYW1fc2VsZWN0AKICGF9mbHVpZF9ldmVudF9yZXZlcmJfc2VuZACrAhVfZmx1aWRfZXZlbnRfc2V0X2Rlc3QAmQIXX2ZsdWlkX2V2ZW50X3NldF9zb3VyY2UAmAIUX2ZsdWlkX2V2ZW50X3N1c3RhaW4ApwIZX2ZsdWlkX2V2ZW50X3N5c3RlbV9yZXNldACwAhJfZmx1aWRfZXZlbnRfdGltZXIAmgIaX2ZsdWlkX2V2ZW50X3VucmVnaXN0ZXJpbmcArQITX2ZsdWlkX2V2ZW50X3ZvbHVtZQCqAiJfZmx1aWRfZmlsZV9yZW5kZXJlcl9wcm9jZXNzX2Jsb2NrAOAEIF9mbHVpZF9maWxlX3NldF9lbmNvZGluZ19xdWFsaXR5AN8EEl9mbHVpZF9pc19taWRpZmlsZQBrE19mbHVpZF9pc19zb3VuZGZvbnQAbBZfZmx1aWRfbGFkc3BhX2FjdGl2YXRlAOIEGF9mbHVpZF9sYWRzcGFfYWRkX2J1ZmZlcgDlBBhfZmx1aWRfbGFkc3BhX2FkZF9lZmZlY3QA5gQbX2ZsdWlkX2xhZHNwYV9idWZmZXJfZXhpc3RzAOQEE19mbHVpZF9sYWRzcGFfY2hlY2sA4wQYX2ZsdWlkX2xhZHNwYV9kZWFjdGl2YXRlAOIEHF9mbHVpZF9sYWRzcGFfZWZmZWN0X2Nhbl9taXgA5AQZX2ZsdWlkX2xhZHNwYV9lZmZlY3RfbGluawDmBCBfZmx1aWRfbGFkc3BhX2VmZmVjdF9wb3J0X2V4aXN0cwDXBCBfZmx1aWRfbGFkc3BhX2VmZmVjdF9zZXRfY29udHJvbADaBRxfZmx1aWRfbGFkc3BhX2VmZmVjdF9zZXRfbWl4ANoFHl9mbHVpZF9sYWRzcGFfaG9zdF9wb3J0X2V4aXN0cwDkBBdfZmx1aWRfbGFkc3BhX2lzX2FjdGl2ZQDhBBNfZmx1aWRfbGFkc3BhX3Jlc2V0AOIECl9mbHVpZF9sb2cAaBtfZmx1aWRfbWlkaV9kdW1wX3Bvc3Ryb3V0ZXIAuQQaX2ZsdWlkX21pZGlfZHVtcF9wcmVyb3V0ZXIAuAQdX2ZsdWlkX21pZGlfZXZlbnRfZ2V0X2NoYW5uZWwAkgQdX2ZsdWlkX21pZGlfZXZlbnRfZ2V0X2NvbnRyb2wAswIZX2ZsdWlkX21pZGlfZXZlbnRfZ2V0X2tleQCzAhtfZmx1aWRfbWlkaV9ldmVudF9nZXRfcGl0Y2gAswIdX2ZsdWlkX21pZGlfZXZlbnRfZ2V0X3Byb2dyYW0AswIaX2ZsdWlkX21pZGlfZXZlbnRfZ2V0X3R5cGUAkAQbX2ZsdWlkX21pZGlfZXZlbnRfZ2V0X3ZhbHVlAJUEHl9mbHVpZF9taWRpX2V2ZW50X2dldF92ZWxvY2l0eQCVBB1fZmx1aWRfbWlkaV9ldmVudF9zZXRfY2hhbm5lbACTBB1fZmx1aWRfbWlkaV9ldmVudF9zZXRfY29udHJvbACUBBlfZmx1aWRfbWlkaV9ldmVudF9zZXRfa2V5AJQEHF9mbHVpZF9taWRpX2V2ZW50X3NldF9seXJpY3MAmQQbX2ZsdWlkX21pZGlfZXZlbnRfc2V0X3BpdGNoAJQEHV9mbHVpZF9taWRpX2V2ZW50X3NldF9wcm9ncmFtAJQEG19mbHVpZF9taWRpX2V2ZW50X3NldF9zeXNleACXBBpfZmx1aWRfbWlkaV9ldmVudF9zZXRfdGV4dACYBBpfZmx1aWRfbWlkaV9ldmVudF9zZXRfdHlwZQCRBBtfZmx1aWRfbWlkaV9ldmVudF9zZXRfdmFsdWUAlgQeX2ZsdWlkX21pZGlfZXZlbnRfc2V0X3ZlbG9jaXR5AJYEG19mbHVpZF9taWRpX3JvdXRlcl9hZGRfcnVsZQCzBB5fZmx1aWRfbWlkaV9yb3V0ZXJfY2xlYXJfcnVsZXMAsgQkX2ZsdWlkX21pZGlfcm91dGVyX2hhbmRsZV9taWRpX2V2ZW50ALcEIF9mbHVpZF9taWRpX3JvdXRlcl9ydWxlX3NldF9jaGFuANsFIl9mbHVpZF9taWRpX3JvdXRlcl9ydWxlX3NldF9wYXJhbTEA3AUiX2ZsdWlkX21pZGlfcm91dGVyX3J1bGVfc2V0X3BhcmFtMgDdBSRfZmx1aWRfbWlkaV9yb3V0ZXJfc2V0X2RlZmF1bHRfcnVsZXMAsQQQX2ZsdWlkX21vZF9jbG9uZQDCAhVfZmx1aWRfbW9kX2dldF9hbW91bnQAzAITX2ZsdWlkX21vZF9nZXRfZGVzdADLAhVfZmx1aWRfbW9kX2dldF9mbGFnczEAyAIVX2ZsdWlkX21vZF9nZXRfZmxhZ3MyAMoCFl9mbHVpZF9tb2RfZ2V0X3NvdXJjZTEAxwIWX2ZsdWlkX21vZF9nZXRfc291cmNlMgDJAhNfZmx1aWRfbW9kX2hhc19kZXN0ANQCFV9mbHVpZF9tb2RfaGFzX3NvdXJjZQDTAhVfZmx1aWRfbW9kX3NldF9hbW91bnQAxgITX2ZsdWlkX21vZF9zZXRfZGVzdADFAhZfZmx1aWRfbW9kX3NldF9zb3VyY2UxAMMCFl9mbHVpZF9tb2Rfc2V0X3NvdXJjZTIAxAIRX2ZsdWlkX21vZF9zaXplb2YA0gIYX2ZsdWlkX21vZF90ZXN0X2lkZW50aXR5ANACEV9mbHVpZF9wbGF5ZXJfYWRkAKAEFV9mbHVpZF9wbGF5ZXJfYWRkX21lbQChBBVfZmx1aWRfcGxheWVyX2dldF9icG0ArAQeX2ZsdWlkX3BsYXllcl9nZXRfY3VycmVudF90aWNrAKsEHF9mbHVpZF9wbGF5ZXJfZ2V0X21pZGlfdGVtcG8ArQQYX2ZsdWlkX3BsYXllcl9nZXRfc3RhdHVzAOUDHV9mbHVpZF9wbGF5ZXJfZ2V0X3RvdGFsX3RpY2tzAKYEEl9mbHVpZF9wbGF5ZXJfam9pbgCqBBJfZmx1aWRfcGxheWVyX3BsYXkAogQSX2ZsdWlkX3BsYXllcl9zZWVrAKUEFV9mbHVpZF9wbGF5ZXJfc2V0X2JwbQCpBBZfZmx1aWRfcGxheWVyX3NldF9sb29wAKcEHF9mbHVpZF9wbGF5ZXJfc2V0X21pZGlfdGVtcG8AqAQjX2ZsdWlkX3BsYXllcl9zZXRfcGxheWJhY2tfY2FsbGJhY2sAnAQSX2ZsdWlkX3BsYXllcl9zdG9wAJ4EGV9mbHVpZF9wcmVzZXRfZ2V0X2JhbmtudW0AoQEWX2ZsdWlkX3ByZXNldF9nZXRfZGF0YQCXARZfZmx1aWRfcHJlc2V0X2dldF9uYW1lAKABFV9mbHVpZF9wcmVzZXRfZ2V0X251bQCaARdfZmx1aWRfcHJlc2V0X2dldF9zZm9udACZARZfZmx1aWRfcHJlc2V0X3NldF9kYXRhAJYBFl9mbHVpZF9zYW1wbGVfc2V0X2xvb3AApwEWX2ZsdWlkX3NhbXBsZV9zZXRfbmFtZQClARdfZmx1aWRfc2FtcGxlX3NldF9waXRjaACoARxfZmx1aWRfc2FtcGxlX3NldF9zb3VuZF9kYXRhAKYBFF9mbHVpZF9zYW1wbGVfc2l6ZW9mAKQBKV9mbHVpZF9zZXF1ZW5jZXJfYWRkX21pZGlfZXZlbnRfdG9fYnVmZmVyAL0EH19mbHVpZF9zZXF1ZW5jZXJfY2xpZW50X2lzX2Rlc3QAyQQeX2ZsdWlkX3NlcXVlbmNlcl9jb3VudF9jbGllbnRzAMYEHl9mbHVpZF9zZXF1ZW5jZXJfZ2V0X2NsaWVudF9pZADHBCBfZmx1aWRfc2VxdWVuY2VyX2dldF9jbGllbnRfbmFtZQDIBBlfZmx1aWRfc2VxdWVuY2VyX2dldF90aWNrAMsEH19mbHVpZF9zZXF1ZW5jZXJfZ2V0X3RpbWVfc2NhbGUAzwQlX2ZsdWlkX3NlcXVlbmNlcl9nZXRfdXNlX3N5c3RlbV90aW1lcgDEBBhfZmx1aWRfc2VxdWVuY2VyX3Byb2Nlc3MAwQQgX2ZsdWlkX3NlcXVlbmNlcl9yZWdpc3Rlcl9jbGllbnQAxQQkX2ZsdWlkX3NlcXVlbmNlcl9yZWdpc3Rlcl9mbHVpZHN5bnRoALoEHl9mbHVpZF9zZXF1ZW5jZXJfcmVtb3ZlX2V2ZW50cwDNBBhfZmx1aWRfc2VxdWVuY2VyX3NlbmRfYXQAzAQZX2ZsdWlkX3NlcXVlbmNlcl9zZW5kX25vdwDKBB9fZmx1aWRfc2VxdWVuY2VyX3NldF90aW1lX3NjYWxlAM4EIl9mbHVpZF9zZXF1ZW5jZXJfdW5yZWdpc3Rlcl9jbGllbnQAwwQXX2ZsdWlkX3NldF9sb2dfZnVuY3Rpb24AZxdfZmx1aWRfc2V0dGluZ3NfY29weXN0cgBRFl9mbHVpZF9zZXR0aW5nc19kdXBzdHIAUhdfZmx1aWRfc2V0dGluZ3NfZm9yZWFjaABiHl9mbHVpZF9zZXR0aW5nc19mb3JlYWNoX29wdGlvbgBfGV9mbHVpZF9zZXR0aW5nc19nZXRfaGludHMAThhfZmx1aWRfc2V0dGluZ3NfZ2V0X3R5cGUATRZfZmx1aWRfc2V0dGluZ3NfZ2V0aW50AFweX2ZsdWlkX3NldHRpbmdzX2dldGludF9kZWZhdWx0AF4cX2ZsdWlkX3NldHRpbmdzX2dldGludF9yYW5nZQBdFl9mbHVpZF9zZXR0aW5nc19nZXRudW0AVx5fZmx1aWRfc2V0dGluZ3NfZ2V0bnVtX2RlZmF1bHQAWhxfZmx1aWRfc2V0dGluZ3NfZ2V0bnVtX3JhbmdlAFkeX2ZsdWlkX3NldHRpbmdzX2dldHN0cl9kZWZhdWx0AFQbX2ZsdWlkX3NldHRpbmdzX2lzX3JlYWx0aW1lAE8dX2ZsdWlkX3NldHRpbmdzX29wdGlvbl9jb25jYXQAYRxfZmx1aWRfc2V0dGluZ3Nfb3B0aW9uX2NvdW50AGAWX2ZsdWlkX3NldHRpbmdzX3NldGludABbFl9mbHVpZF9zZXR0aW5nc19zZXRudW0AVhZfZmx1aWRfc2V0dGluZ3Nfc2V0c3RyAFAZX2ZsdWlkX3NldHRpbmdzX3N0cl9lcXVhbABTGF9mbHVpZF9zZmxvYWRlcl9nZXRfZGF0YQCXAR1fZmx1aWRfc2Zsb2FkZXJfc2V0X2NhbGxiYWNrcwCUARhfZmx1aWRfc2Zsb2FkZXJfc2V0X2RhdGEAlgEVX2ZsdWlkX3Nmb250X2dldF9kYXRhAJcBE19mbHVpZF9zZm9udF9nZXRfaWQAmQEVX2ZsdWlkX3Nmb250X2dldF9uYW1lAJoBF19mbHVpZF9zZm9udF9nZXRfcHJlc2V0AJsBG19mbHVpZF9zZm9udF9pdGVyYXRpb25fbmV4dACdARxfZmx1aWRfc2ZvbnRfaXRlcmF0aW9uX3N0YXJ0AJwBFV9mbHVpZF9zZm9udF9zZXRfZGF0YQCWASBfZmx1aWRfc3ludGhfYWN0aXZhdGVfa2V5X3R1bmluZwDEAyNfZmx1aWRfc3ludGhfYWN0aXZhdGVfb2N0YXZlX3R1bmluZwD8AhxfZmx1aWRfc3ludGhfYWN0aXZhdGVfdHVuaW5nAPYCHF9mbHVpZF9zeW50aF9hZGRfZGVmYXVsdF9tb2QA5AIZX2ZsdWlkX3N5bnRoX2FkZF9zZmxvYWRlcgDrAhZfZmx1aWRfc3ludGhfYWRkX3Nmb250AKEDGl9mbHVpZF9zeW50aF9hbGxfbm90ZXNfb2ZmAP0CG19mbHVpZF9zeW50aF9hbGxfc291bmRzX29mZgD+AhhfZmx1aWRfc3ludGhfYWxsb2Nfdm9pY2UAmQMYX2ZsdWlkX3N5bnRoX2Jhbmtfc2VsZWN0AIkDD19mbHVpZF9zeW50aF9jYwDzAh1fZmx1aWRfc3ludGhfY2hhbm5lbF9wcmVzc3VyZQCBAyFfZmx1aWRfc3ludGhfY291bnRfYXVkaW9fY2hhbm5lbHMAvwMfX2ZsdWlkX3N5bnRoX2NvdW50X2F1ZGlvX2dyb3VwcwDAAyNfZmx1aWRfc3ludGhfY291bnRfZWZmZWN0c19jaGFubmVscwDBAyFfZmx1aWRfc3ludGhfY291bnRfZWZmZWN0c19ncm91cHMAwgMgX2ZsdWlkX3N5bnRoX2NvdW50X21pZGlfY2hhbm5lbHMAvgMeX2ZsdWlkX3N5bnRoX2RlYWN0aXZhdGVfdHVuaW5nAMUDEl9mbHVpZF9zeW50aF9lcnJvcgDuAiNfZmx1aWRfc3ludGhfZ2V0X2FjdGl2ZV92b2ljZV9jb3VudACRAxxfZmx1aWRfc3ludGhfZ2V0X2Jhbmtfb2Zmc2V0ANADHl9mbHVpZF9zeW50aF9nZXRfYmFzaWNfY2hhbm5lbADbAxxfZmx1aWRfc3ludGhfZ2V0X2JyZWF0aF9tb2RlANkDE19mbHVpZF9zeW50aF9nZXRfY2MA+AIfX2ZsdWlkX3N5bnRoX2dldF9jaGFubmVsX3ByZXNldACnAx1fZmx1aWRfc3ludGhfZ2V0X2Nob3J1c19kZXB0aAC7Ax1fZmx1aWRfc3ludGhfZ2V0X2Nob3J1c19sZXZlbAC5AxpfZmx1aWRfc3ludGhfZ2V0X2Nob3J1c19ucgC4Ax1fZmx1aWRfc3ludGhfZ2V0X2Nob3J1c19zcGVlZAC6AxxfZmx1aWRfc3ludGhfZ2V0X2Nob3J1c190eXBlALwDGV9mbHVpZF9zeW50aF9nZXRfY3B1X2xvYWQAwwMVX2ZsdWlkX3N5bnRoX2dldF9nYWluAN4FFF9mbHVpZF9zeW50aF9nZXRfZ2VuAN8FIV9mbHVpZF9zeW50aF9nZXRfaW50ZXJuYWxfYnVmc2l6ZQCSAxpfZmx1aWRfc3ludGhfZ2V0X2xhZHNwYV9meADSAxxfZmx1aWRfc3ludGhfZ2V0X2xlZ2F0b19tb2RlANUDG19mbHVpZF9zeW50aF9nZXRfcGl0Y2hfYmVuZACEAyFfZmx1aWRfc3ludGhfZ2V0X3BpdGNoX3doZWVsX3NlbnMAhgMaX2ZsdWlkX3N5bnRoX2dldF9wb2x5cGhvbnkAkAMgX2ZsdWlkX3N5bnRoX2dldF9wb3J0YW1lbnRvX21vZGUA1wMYX2ZsdWlkX3N5bnRoX2dldF9wcm9ncmFtAIwDHF9mbHVpZF9zeW50aF9nZXRfcmV2ZXJiX2RhbXAArwMdX2ZsdWlkX3N5bnRoX2dldF9yZXZlcmJfbGV2ZWwAsAMgX2ZsdWlkX3N5bnRoX2dldF9yZXZlcmJfcm9vbXNpemUArgMdX2ZsdWlkX3N5bnRoX2dldF9yZXZlcmJfd2lkdGgAsQMZX2ZsdWlkX3N5bnRoX2dldF9zZXR0aW5ncwDIAxZfZmx1aWRfc3ludGhfZ2V0X3Nmb250AKQDHF9mbHVpZF9zeW50aF9nZXRfc2ZvbnRfYnlfaWQApQMeX2ZsdWlkX3N5bnRoX2dldF9zZm9udF9ieV9uYW1lAKYDGl9mbHVpZF9zeW50aF9nZXRfdm9pY2VsaXN0AKgDHl9mbHVpZF9zeW50aF9oYW5kbGVfbWlkaV9ldmVudADMAxlfZmx1aWRfc3ludGhfa2V5X3ByZXNzdXJlAIIDFF9mbHVpZF9zeW50aF9ub3Rlb2ZmAPECE19mbHVpZF9zeW50aF9ub3Rlb24A7wIZX2ZsdWlkX3N5bnRoX253cml0ZV9mbG9hdACUAxdfZmx1aWRfc3ludGhfcGl0Y2hfYmVuZACDAx1fZmx1aWRfc3ludGhfcGl0Y2hfd2hlZWxfc2VucwCFAxRfZmx1aWRfc3ludGhfcHJvY2VzcwCWAxtfZmx1aWRfc3ludGhfcHJvZ3JhbV9jaGFuZ2UAiAMaX2ZsdWlkX3N5bnRoX3Byb2dyYW1fcmVzZXQAkwMbX2ZsdWlkX3N5bnRoX3Byb2dyYW1fc2VsZWN0AI0DKV9mbHVpZF9zeW50aF9wcm9ncmFtX3NlbGVjdF9ieV9zZm9udF9uYW1lAI4DH19mbHVpZF9zeW50aF9yZW1vdmVfZGVmYXVsdF9tb2QA8gIZX2ZsdWlkX3N5bnRoX3JlbW92ZV9zZm9udACiAyBfZmx1aWRfc3ludGhfcmVzZXRfYmFzaWNfY2hhbm5lbADaAxxfZmx1aWRfc3ludGhfc2V0X2Jhbmtfb2Zmc2V0AM8DHl9mbHVpZF9zeW50aF9zZXRfYmFzaWNfY2hhbm5lbACAAxxfZmx1aWRfc3ludGhfc2V0X2JyZWF0aF9tb2RlANgDHV9mbHVpZF9zeW50aF9zZXRfY2hhbm5lbF90eXBlANEDF19mbHVpZF9zeW50aF9zZXRfY2hvcnVzALIDHV9mbHVpZF9zeW50aF9zZXRfY2hvcnVzX2RlcHRoALYDHV9mbHVpZF9zeW50aF9zZXRfY2hvcnVzX2xldmVsALQDGl9mbHVpZF9zeW50aF9zZXRfY2hvcnVzX25yALMDGl9mbHVpZF9zeW50aF9zZXRfY2hvcnVzX29uAO0CHV9mbHVpZF9zeW50aF9zZXRfY2hvcnVzX3NwZWVkALUDHF9mbHVpZF9zeW50aF9zZXRfY2hvcnVzX3R5cGUAtwMeX2ZsdWlkX3N5bnRoX3NldF9jdXN0b21fZmlsdGVyANMDFV9mbHVpZF9zeW50aF9zZXRfZ2FpbgDgBRRfZmx1aWRfc3ludGhfc2V0X2dlbgDhBR5fZmx1aWRfc3ludGhfc2V0X2ludGVycF9tZXRob2QAvQMcX2ZsdWlkX3N5bnRoX3NldF9sZWdhdG9fbW9kZQDUAxpfZmx1aWRfc3ludGhfc2V0X3BvbHlwaG9ueQDoAiBfZmx1aWRfc3ludGhfc2V0X3BvcnRhbWVudG9fbW9kZQDWAxdfZmx1aWRfc3ludGhfc2V0X3JldmVyYgCpAxxfZmx1aWRfc3ludGhfc2V0X3JldmVyYl9kYW1wAKsDHV9mbHVpZF9zeW50aF9zZXRfcmV2ZXJiX2xldmVsAK0DGl9mbHVpZF9zeW50aF9zZXRfcmV2ZXJiX29uAOwCIF9mbHVpZF9zeW50aF9zZXRfcmV2ZXJiX3Jvb21zaXplAKoDHV9mbHVpZF9zeW50aF9zZXRfcmV2ZXJiX3dpZHRoAKwDHF9mbHVpZF9zeW50aF9zZXRfc2FtcGxlX3JhdGUA4gUUX2ZsdWlkX3N5bnRoX3NmY291bnQAowMTX2ZsdWlkX3N5bnRoX3NmbG9hZACcAxlfZmx1aWRfc3ludGhfc2ZvbnRfc2VsZWN0AIoDFV9mbHVpZF9zeW50aF9zZnJlbG9hZACgAxVfZmx1aWRfc3ludGhfc2Z1bmxvYWQAnQMSX2ZsdWlkX3N5bnRoX3N0YXJ0AM0DGF9mbHVpZF9zeW50aF9zdGFydF92b2ljZQCbAxFfZmx1aWRfc3ludGhfc3RvcADOAxJfZmx1aWRfc3ludGhfc3lzZXgA+QIZX2ZsdWlkX3N5bnRoX3N5c3RlbV9yZXNldAD/AhdfZmx1aWRfc3ludGhfdHVuZV9ub3RlcwD7AhhfZmx1aWRfc3ludGhfdHVuaW5nX2R1bXAA+gIiX2ZsdWlkX3N5bnRoX3R1bmluZ19pdGVyYXRpb25fbmV4dADHAyNfZmx1aWRfc3ludGhfdHVuaW5nX2l0ZXJhdGlvbl9zdGFydADGAxpfZmx1aWRfc3ludGhfdW5zZXRfcHJvZ3JhbQCLAxhfZmx1aWRfc3ludGhfd3JpdGVfZmxvYXQAlwMWX2ZsdWlkX3N5bnRoX3dyaXRlX3MxNgCYAw5fZmx1aWRfdmVyc2lvbgDWAhJfZmx1aWRfdmVyc2lvbl9zdHIA1wIUX2ZsdWlkX3ZvaWNlX2FkZF9tb2QAgQQUX2ZsdWlkX3ZvaWNlX2dlbl9nZXQA4wUVX2ZsdWlkX3ZvaWNlX2dlbl9pbmNyAOQFFF9mbHVpZF92b2ljZV9nZW5fc2V0AOUFG19mbHVpZF92b2ljZV9nZXRfYWN0dWFsX2tleQD4AyBfZmx1aWRfdm9pY2VfZ2V0X2FjdHVhbF92ZWxvY2l0eQCHBBhfZmx1aWRfdm9pY2VfZ2V0X2NoYW5uZWwAhQQTX2ZsdWlkX3ZvaWNlX2dldF9pZADlAxRfZmx1aWRfdm9pY2VfZ2V0X2tleQCGBBlfZmx1aWRfdm9pY2VfZ2V0X3ZlbG9jaXR5AIgEEl9mbHVpZF92b2ljZV9pc19vbgCEBBdfZmx1aWRfdm9pY2VfaXNfcGxheWluZwDvAxlfZmx1aWRfdm9pY2VfaXNfc29zdGVudXRvAIMEGV9mbHVpZF92b2ljZV9pc19zdXN0YWluZWQAggQcX2ZsdWlkX3ZvaWNlX29wdGltaXplX3NhbXBsZQCLBBlfZmx1aWRfdm9pY2VfdXBkYXRlX3BhcmFtAPUDBV9mcmVlAOkED19sbHZtX2Jzd2FwX2kzMgDCBQdfbWFsbG9jAOgEB19tZW1jcHkAwwUHX21lbXNldADEBRdfbmV3X2ZsdWlkX2F1ZGlvX2RyaXZlcgDRBBhfbmV3X2ZsdWlkX2F1ZGlvX2RyaXZlcjIA0wQWX25ld19mbHVpZF9kZWZzZmxvYWRlcgBzEF9uZXdfZmx1aWRfZXZlbnQAlgIYX25ld19mbHVpZF9maWxlX3JlbmRlcmVyAN0EFl9uZXdfZmx1aWRfbWlkaV9kcml2ZXIA1wQVX25ld19mbHVpZF9taWRpX2V2ZW50AI4EFl9uZXdfZmx1aWRfbWlkaV9yb3V0ZXIArgQbX25ld19mbHVpZF9taWRpX3JvdXRlcl9ydWxlALAEDl9uZXdfZmx1aWRfbW9kANECEV9uZXdfZmx1aWRfcGxheWVyAJoEEV9uZXdfZmx1aWRfcHJlc2V0AJ8BEV9uZXdfZmx1aWRfc2FtcGxlAKIBFF9uZXdfZmx1aWRfc2VxdWVuY2VyAL4EFV9uZXdfZmx1aWRfc2VxdWVuY2VyMgC/BBNfbmV3X2ZsdWlkX3NldHRpbmdzAEITX25ld19mbHVpZF9zZmxvYWRlcgCTARBfbmV3X2ZsdWlkX3Nmb250AJgBEF9uZXdfZmx1aWRfc3ludGgA2gIFX3NicmsAxQUKZHluQ2FsbF9paQDGBQtkeW5DYWxsX2lpaQDHBQxkeW5DYWxsX2lpaWkAyAUOZHluQ2FsbF9paWlpaWkAyQUPZHluQ2FsbF9paWlpaWlpAMoFCmR5bkNhbGxfdmkAywULZHluQ2FsbF92aWkAzAUMZHluQ2FsbF92aWlkAM0FDGR5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QgA3ADAgAEIANwA4IABBQGtCADcAACAAQgA3AEggAEIANwBQIABCADcAWCAAQgA3AGAgAEIANwBoIABCADcAcCAAQgA3AHggAkF/OgCQASACQQA6ADMgAkG8AWoiAEIANwAAIABCADcACCAAQgA3ABAgAEIANwAYIABCADcAICAAQgA3ACggAEIANwAwIABCADcAOCAAQUBrQgA3AAAgAEIANwBIIABCADcAUCAAQgA3AFggAEIANwBgIABCADcAaCAAQgA3AHAgAEIANwB4IAJB/wA6AEcgAkH/ADoAZyACQf/+/fsHNgGeASACQQI6AMUCIAJBggFqIgBCwICBgoSIkKDAADcAACAAQcCAATsACCACQeQAOgBDIAJBADoAYyACQcAAOgBGIAJBADoAZiACQcAAOgBEIAJBADoAZCADJAYgAgVBAUHU9wAgBBBoGiADJAZBAAsLnQMBBX8gAEEANgLIAiAAQQA2AgggAEEANgIMIABBAToAFCAAQQI6ABcgAEEDOgAaIABBBDoAHSAAQQU6ACAgAEEGOgAjIABBBzoAJiAAQQg6ACkgAEEJOgAsIABBADoALyAAQQA6ABMgAEEAOgARIABBAToAECAAQX86ABIgAEF/OgAyIABBATYCNCAAQQE2AjggACAAQQRqIgQoAgBBCUYiATYCvAIgACABBH9BgAEFQQALIgFBCHQ2AtwCIAAoAgAgARCHAyEBIABB2AJqIgUoAgAiAiABRwRAIAIEQCACKAIEQQhqIgMgAygCAEF/ajYCACACKAIcIgMEQCACQQEgBCgCACADQQ9xQSBqEQMAGgsLIAUgATYCACABBEAgASgCBEEIaiICIAIoAgBBAWo2AgAgASgCHCICBEAgAUEAIAQoAgAgAkEPcUEgahEDABoLCwsgAEEENgLAAiAAQQA2AswCIABBADYC0AIgAEEANgLgAiAAQQA6AOQCIABB1AJqIgAoAgAiAUUEQA8LIAFBARDkAxogAEEANgIAC7ACAQF/IABBADoAxAIgAEGAwAA7AcYCIABB6AJqQQBBtwQQxAUaA0ACQCABQaV/akEFSSABQbp/akEKSXJFBEACQAJAIAFB/////wdxDisAAQEBAQEBAAABAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQABAQEBAQEAAAEAAQsMAgsgAEE8aiABakEAOgAA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GiAAQZTWAEEEIAIQSxogAEG61gBBBCACEEsaIABBp9YAQQQgAhBLGiAEKAIAIhZBD3EEQCAEIBZBEG1BBHRBEGoiFjYCACAAQc7wACAWEFsaQQJB8doAIBAQaBoLAkACQCADKAIAIhBBAUgEQEECQefbACAhEGgaQQEhAQwBBSAQQYABSgRAIAEgEDYCAEECQbncACABEGgaQYABIQEMAgsLDAELIAMgATYCAAsCQAJAIAcoAgAiAUEBSARAQQJBi90AICAQaBpBASEBDAEFIAFBgAFKBEAgDyABNgIAQQJB290AIA8QaBpBgAEhAQwCCwsMAQsgByABNgIACyALKAIAIg9BAkgEQCAOIA82AgBBAkGr3gAgDhBoGiALQQI2AgAgBygCACEBCyABIAMoAgAiA0oEQCABIQMLIABBiNoAIAYQUkUEQCACIAYoAgAQ4wIEQEECQfLeACAfEGgaCyAGKAIAEOkECyACQQE2AkggAkH/ATYCnAEgAkEANgJMIAJBADYC/AFBBBDoBCEBIAIgATYCgAIgGygCACIBQQFKBEAgGCgCAEHV9AAgDBBcGiAbKAIAIQELIBQoAgAiBkEGdCAGIAMgCygCACAiKAIAIBUrAwAgAUF/aiAMKAIAEOYBIQEgAkGgAWoiBiABNgIAAkAgAQRAIAJBADYCkAIgAkHwgRxBARDkAhogAkHAgRxBARDkAhogAkGIghxBARDkAhogAkGgghxBARDkAhogAkG4ghxBARDkAhogAkHQghxBARDkAhogAkHoghxBARDkAhogAkGAgxxBARDkAhogAkGYgxxBARDkAhogAkGwgxxBARDkAhogAkHIgxxBARDkAhogAEHN1gAgDRBcGiANKAIABEBBAkGc3wAgHhBoGgsgABBzIgEEQCACEOUCIAIoAnhFBEAgAkH0AGoiAygCACABEDghASADIAE2AgALIAogCigCAEF/aiIBNgIAIAFFBEAgBigCACIDQQRqIgcoAgAiAUEASgRAIAdBADYCACADKAIAIgNBCGoiBygCABogByAHKAIAIAFqNgIAIANBDGoiBygCACABaiEBIAcgATYCACABIAMoAgQiA04EQCAHIAEgA2s2AgALCwsFQQJB0d8AIB0QaBoLIAQoAgAiAUECdBDoBCEDIAJBhAFqIgcgAzYCACADRQRAQQFB1PcAIBwQaBoMAgsgCUEANgIAIAFBAEoEQEEAIQEDQCACIAEQhAIhAyAHKAIAIAkoAgAiAUECdGogAzYCACAHKAIAIAFBAnRqKAIARQ0DIAkgAUEBaiIBNgIAIAEgBCgCACIDSA0ACyADIQELIAJBiAFqIg0gFCgCACIDNgIAIANBAnQQ6AQhCyACQYwBaiIMIAs2AgAgCwRAIAlBADYCACADQQBKBEADQCAGKAIAIBUrAwAQ6QMhAyAMKAIAIAkoAgAiAUECdGogAzYCACAMKAIAIAFBAnRqKAIARQ0EIAkgAUEBaiIBNgIAIAEgDSgCAEgNAAsgBCgCACEBCyABQQBKBEBBACEDA0AgAiADEOYCGiADRSILBH8gAQVBAAshBCAHKAIAIANBAnRqKAIAIgxBCGoiDSgCAEFwcSEOIA0gCwR/QQwFQQgLIA5yNgIAIAwgBDYCDCADQQFqIgMgAUcNAAsLIBgoAgBB0NgAIAgQXBogAiAVKwMAIAgoAgC3okQAAAAAAECPQKOrNgKIAiAUKAIAIQMgBigCACIBBEAgASgCDCIEBEAgAUEBIAQgA0QAAAAAAAAAABDiARoLCyAZKAIAIQEgAhDlAiAZIAFBAEciAzYCAAJAIAYoAgAiAQRAIAEoAgwiBEUNASABQQIgBCADRAAAAAAAAAAAEOIBGgsLIAogCigCAEF/aiIBNgIAAkAgAUUEQCAGKAIAIgNBBGoiBCgCACIBQQBMDQEgBEEANgIAIAMoAgAiA0EIaiIEKAIAGiAEIAQoAgAgAWo2AgAgA0EMaiIEKAIAIAFqIQEgBCABNgIAIAEgAygCBCIDSA0BIAQgASADazYCAAsLIBooAgAhASACEOUCIBogAUEARyIDNgIAAkAgBigCACIBBEAgASgCDCIERQ0BIAFBAyAEIANEAAAAAAAAAAAQ4gEaCwsgCiAKKAIAQX9qIgE2AgACQCABRQRAIAYoAgAiA0EEaiIEKAIAIgFBAEwNASAEQQA2AgAgAygCACIDQQhqIgQoAgAaIAQgBCgCACABajYCACADQQxqIgQoAgAgAWohASAEIAE2AgAgASADKAIEIgNIDQEgBCABIANrNgIACwsgAkHAADYC7AEgAkEANgLwASACQQA2AvQBIABBodUAIBEQVxogAEG41QAgEhBXGiAAQcrVACATEFcaIABB3dUAIBcQVxogEisDACElIBMrAwAhJiAXKwMAIScgAiARKwMAIig5A6gBIAIgJTkDsAEgAiAmOQO4ASACICc5A8ABIAhBDzYCACAIICg5AwggCEEQaiIBICU5AwAgCEEYaiIDICY5AwAgCEEgaiIEICc5AwAgBigCACIKQQQgCigCDCAIEOMBGiAAQYTWACAJEFwaIABBlNYAIBEQVxogAEGn1gAgEhBXGiAAQbrWACATEFcaIBErAwAhJSASKwMAISYgEysDACEnIAIgCSgCACIJNgLIASACICU5A9ABIAIgJjkD2AEgAiAnOQPgASACQQA2AugBIAhBHzYCACAIIAk2AgggASAlOQMAIAMgJjkDACAEICc5AwAgCEEANgIoIAYoAgAiAUEFIAEoAgwgCBDjARogAkE0aiIBQQE2AgACQAJAIABBqtoAQcTaABBTBEBBACEADAEFIABBqtoAQcHaABBTBEBBASEADAILIABBqtoAQcfaABBTBEBBAiEADAILIABBqtoAQcraABBTBEBBAyEADAILCwwBCyABIAA2AgALIAYoAgAQ6QEaEG4hACACIAA2AlAgBSQGIAIPCwsLIAIQ5wIgBSQGQQALCgAgACACthDqAgsKACAAIAK2EOkCCwoAIAAgAhDoAhoLnAEAIABFBEAPCyAAEOUCIAAgAjYCECAAQQhqIgIoAgBBf2ohASACIAE2AgAgAQRADwsgACgCoAEiAUEEaiICKAIAIgBBAEwEQA8LIAJBADYCACABKAIAIgFBCGoiAigCABogAiACKAIAIABqNgIAIAFBDGoiAigCACAAaiEAIAIgADYCACAAIAEoAgQiAUgEQA8LIAIgACABazYCAAugAgEBfyAARQRADwsgABDlAgJAIAFB+9gAEPYEBEAgAUGu2QAQ9gRFBEAgACACtjgCWAwCCyABQZXZABD2BEUEQCAAIAK2OAJcDAILIAFB2dkAEPYERQRAIAAgArY4AmAMAgsgAUHG2QAQ9gRFBEAgACACtjgCZAwCCyABQe/ZABD2BEUEQCAAIAK2OAJoCwUgACACtjgCVAsLIABBCGoiAygCAEF/aiEBIAMgATYCACABBEAPCyAAKAKgASIBQQRqIgMoAgAiAEEATARADwsgA0EANgIAIAEoAgAiAUEIaiIDKAIAGiADIAMoAgAgAGo2AgAgAUEMaiIDKAIAIABq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f0ogAEEARyACQQBHcXFFBEBBfw8LIAAQ5QIgACgCMCABTARAIABBCGoiAigCAEF/aiEBIAIgATYCACABBEBBfw8LIAAoAqABIgFBBGoiAigCACIAQQBMBEBBfw8LIAJBADYCACABKAIAIgFBCGoiAigCABogAiACKAIAIABqNgIAIAFBDGoiAigCACAAaiEAIAIgADYCACAAIAEoAgQiAUgEQEF/DwsgAiAAIAFrNgIAQX8PCyAAKAKEASABQQJ0aigCACIBKAIIQQhxBH8gAiABLgHGAjYCACAAQQhqIgIoAgBBf2ohASACIAE2AgAgAQRAQQAPCyAAKAKgASIBQQRqIgIoAgAiAEEATARAQQAPCyACQQA2AgAgASgCACIBQQhqIgIoAgAaIAIgAigCACAAajYCACABQQxqIgIoAgAgAGohACACIAA2AgAgACABKAIEIgFIBEBBAA8LIAIgACABazYCAEEABSAAQQhqIgIoAgBBf2ohASACIAE2AgAgAQRAQX8PCyAAKAKgASIBQQRqIgIoAgAiAEEATARAQX8PCyACQQA2AgAgASgCACIBQQhqIgIoAgAaIAIgAigCACAAajYCACABQQxqIgIoAgAgAGohACACIAA2AgAgACABKAIEIgFIBEBBfw8LIAIgACABazYCAEF/CwvJBQEEfyMGIQQjBkEQaiQGIAFBf0ogAEEARyACQckASXFxRQRAIAQkBkF/DwsgBCEFIAAQ5QIgACgCMCABTARAIABBCGoiASgCAEF/aiECIAEgAjYCACACBEAgBCQGQX8PCyAAKAKgASIBQQRqIgAoAgAiA0EATARAIAQkBkF/DwsgAEEANgIAIAEoAgAiAkEIaiIAKAIAGiAAIAAoAgAgA2o2AgAgAkEMaiIBKAIAIANqIQMgASADNgIAIAMgAigCBCIASARAIAQkBkF/DwsgASADIABrNgIAIAQkBkF/DwsgAEGEAWoiBigCACABQQJ0aigCACIDKAIIQQhxRQRAIABBCGoiASgCAEF/aiECIAEgAjYCACACBEAgBCQGQX8PCyAAKAKgASIBQQRqIgAoAgAiA0EATARAIAQkBkF/DwsgAEEANgIAIAEoAgAiAkEIaiIAKAIAGiAAIAAoAgAgA2o2AgAgAkEMaiIBKAIAIANqIQMgASADNgIAIAMgAigCBCIASARAIAQk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BCAAQQhqIgEoAgBBf2ohAiABIAI2AgAgAgRAIAUkBiAEDwsgACgCoAEiAUEEaiIAKAIAIgNBAEwEQCAFJAYgBA8LIABBADYCACABKAIAIgJBCGoiACgCABogACAAKAIAIANqNgIAIAJBDGoiASgCACADaiEDIAEgAzYCACADIAIoAgQiAEgEQCAFJAYgBA8LIAEgAyAAazYCACAFJAYgBA8LCwsgByADNgIAIAcgBDYCBCAHIAI2AghBAUGq4wAgBxBoGiAAQQhqIgEoAgBBf2ohAiABIAI2AgAgAgRAIAUkBkF/DwsgACgCoAEiAUEEaiIAKAIAIgNBAEwEQCAFJAZBfw8LIABBADYCACABKAIAIgJBCGoiACgCABogACAAKAIAIANqNgIAIAJBDGoiASgCACADaiEDIAEgAzYCACADIAIoAgQiAEgEQCAFJAZBfw8LIAEgAyAAazYCACAFJAZBfwuuAQICfwF9IABFBEBDAAAAAA8LIAAQ5QIgACoCgAEhAyAAQQhqIgEoAgBBf2ohAiABIAI2AgAgAgRAIAMPCyAAKAKgASICQQRqIgEoAgAiAEEATARAIAMPCyABQQA2AgAgAigCACICQQhqIgEoAgAaIAEgASgCACAAajYCACACQQxqIgEoAgAgAGohACABIAA2AgAgACACKAIEIgJIBEAgAw8LIAEgACACazYCACADC6gBAQN/IABFBEBBfw8LIAAQ5QIgACgCFCEDIABBCGoiASgCAEF/aiECIAEgAjYCACACBEAgAw8LIAAoAqABIgJBBGoiASgCACIAQQBMBEAgAw8LIAFBADYCACACKAIAIgJBCGoiASgCABogASABKAIAIABqNgIAIAJBDGoiASgCACAAaiEAIAEgADYCACAAIAIoAgQiAkgEQCADDwsgASAAIAJrNgIAIAMLqQEBA38gAEUEQEF/DwsgABDlAiAAKAKQASEDIABBCGoiASgCAEF/aiECIAEgAjYCACACBEAgAw8LIAAoAqABIgJBBGoiASgCACIAQQBMBEAgAw8LIAFBADYCACACKAIAIgJBCGoiASgCABogASABKAIAIABqNgIAIAJBDGoiASgCACAAaiEAIAEgADYCACAAIAIoAgQiAkgEQCADDwsgASAAIAJrNgIAIAMLBQBBwAALkgIBBX8jBiEDIwZBEGokBiAARQRA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AgBBf2ohAiABIAI2AgAgAgRAIAMPCyAAKAKgASICQQRqIgEoAgAiAEEATARAIAMPCyABQQA2AgAgAigCACICQQhqIgEoAgAaIAEgASgCACAAajYCACACQQxqIgEoAgAgAGohACABIAA2AgAgACACKAIEIgJIBEAgAw8LIAEgACACazYCACADC6kBAQN/IABFBEBBAA8LIAAQ5QIgACgC6AEhAyAAQQhqIgEoAgBBf2ohAiABIAI2AgAgAgRAIAMPCyAAKAKgASICQQRqIgEoAgAiAEEATARAIAMPCyABQQA2AgAgAigCACICQQhqIgEoAgAaIAEgASgCACAAajYCACACQQxqIgEoAgAgAGohACABIAA2AgAgACACKAIEIgJIBEAgAw8LIAEgACACazYCACADC9gGAQV/IwYhAyMGQRBqJAYgAEUEQCADJAZBfw8LIAMhBSAAEOUCIAFBf0gEQCAAQQhqIgIoAgBBf2ohASACIAE2AgAgAQRAIAMkBkF/DwsgACgCoAEiAUEEaiICKAIAIgBBAEwEQCADJAZBfw8LIAJBADYCACABKAIAIgFBCGoiAigCABogAiACKAIAIABqNgIAIAFBDGoiAigCACAAaiEAIAIgADYCACAAIAEoAgQiAUgEQCADJAZBfw8LIAIgACABazYCACADJAZBfw8LIAAoAjAiBiABTARAIABBCGoiAigCAEF/aiEBIAIgATYCACABBEAgAyQGQX8PCyAAKAKgASIBQQRqIgIoAgAiAEEATARAIAMkBkF/DwsgAkEANgIAIAEoAgAiAUEIaiICKAIAGiACIAIoAgAgAGo2AgAgAUEMaiICKAIAIABqIQAgAiAANgIAIAAgASgCBCIBSARAIAMkBkF/DwsgAiAAIAFrNgIAIAMkBkF/DwsgACgChAEiBygCACIERQRAQQFBlOYAIAUQaBogAEEIaiICKAIAQX9qIQEgAiABNgIAIAEEQCADJAZBfw8LIAAoAqABIgFBBGoiAigCACIAQQBMBEAgAyQGQX8PCyACQQA2AgAgASgCACIBQQhqIgIoAgAaIAIgAigCACAAajYCACABQQxqIgIoAgAgAGohACACIAA2AgAgACABKAIEIgFIBEAgAyQGQX8PCyACIAAgAWs2AgAgAyQGQX8PCwJAIAZBAEoEQCABQQBIBEAgBCACNgLAAiAGQQFGDQJBASEBA0AgByABQQJ0aigCACACNgLAAiABQQFqIgEgBkcNAAsMAgtBACEFA0AgBCgCBCABRgRAIAQgAjYCwAILIAVBAWoiBCAGRg0CIAQhBSAHIARBAnRqKAIAIQQMAAALAAsLIABBCGoiAigCAEF/aiEBIAIgATYCACABBEAgAyQGQQAPCyAAKAKgASIBQQRqIgIoAgAiAEEATARAIAMkBkEADwsgAkEANgIAIAEoAgAiAUEIaiICKAIAGiACIAIoAgAgAGo2AgAgAUEMaiICKAIAIABqIQAgAiAANgIAIAAgASgCBCIBSARAIAMkBkEADwsgAiAAIAFrNgIAIAMkBkEAC6gBAQN/IABFBEBBAA8LIAAQ5QIgACgCMCEDIABBCGoiASgCAEF/aiECIAEgAjYCACACBEAgAw8LIAAoAqABIgJBBGoiASgCACIAQQBMBEAgAw8LIAFBADYCACACKAIAIgJBCGoiASgCABogASABKAIAIABqNgIAIAJBDGoiASgCACAAaiEAIAEgADYCACAAIAIoAgQiAkgEQCADDwsgASAAIAJrNgIAIAMLqAEBA38gAEUEQEEADwsgABDlAiAAKAI4IQMgAEEIaiIBKAIAQX9qIQIgASACNgIAIAIEQCADDwsgACgCoAEiAkEEaiIBKAIAIgBBAEwEQCADDwsgAUEANgIAIAIoAgAiAkEIaiIBKAIAGiABIAEoAgAgAGo2AgAgAkEMaiIBKAIAIABqIQAgASAANgIAIAAgAigCBCICSARAIAMPCyABIAAgAms2AgAgAwuoAQEDfyAARQRAQQAPCyAAEOUCIAAoAjwhAyAAQQhqIgEoAgBBf2ohAiABIAI2AgAgAgRAIAMPCyAAKAKgASICQQRqIgEoAgAiAEEATARAIAMPCyABQQA2AgAgAigCACICQQhqIgEoAgAaIAEgASgCACAAajYCACACQQxqIgEoAgAgAGohACABIAA2AgAgACACKAIEIgJIBEAgAw8LIAEgACACazYCACADC6sBAQN/IABFBEBBAA8LIAAQ5QIgAEFAaygCACEDIABBCGoiASgCAEF/aiECIAEgAjYCACACBEAgAw8LIAAoAqABIgJBBGoiASgCACIAQQBMBEAgAw8LIAFBADYCACACKAIAIgJBCGoiASgCABogASABKAIAIABqNgIAIAJBDGoiASgCACAAaiEAIAEgADYCACAAIAIoAgQiAkgEQCADDwsgASAAIAJrNgIAIAMLqAEBA38gAEUEQEEADwsgABDlAiAAKAJEIQMgAEEIaiIBKAIAQX9qIQIgASACNgIAIAIEQCADDwsgACgCoAEiAkEEaiIBKAIAIgBBAEwEQCADDwsgAUEANgIAIAIoAgAiAkEIaiIBKAIAGiABIAEoAgAgAGo2AgAgAkEMaiIBKAIAIABqIQAgASAANgIAIAAgAigCBCICSARAIAMPCyABIAAgAms2AgAgAwsaACAARQRARAAAAAAAAAAADwsgACgC+AG+uwvtAQAgA0UgAEUgAiABckH/AEtycgRAQX8PCyAAEOUCIAMgASACEOEDIgMEQCAEBEAgAyAEEOcDCyAAIAMgASACIAUQ9wIiAUF/RgRAIANBARDkAxpBfyEBCwVBfyEBCyAAQQhqIgMoAgBBf2ohAiADIAI2AgAgAgRAIAEPCyAAKAKgASICQQRqIgMoAgAiAEEATARAIAEPCyADQQA2AgAgAigCACICQQhqIgMoAgAaIAMgAygCACAAajYCACACQQxqIgMoAgAgAGohACADIAA2AgAgACACKAIEIgJIBEAgAQ8LIAMgACACazYCACABC9UDAQR/IABBAEcgAUF/SnFFBEBBfw8LIAAQ5QIgACgCMCABTARAIABBCGoiAigCAEF/aiEBIAIgATYCACABBEBBfw8LIAAoAqABIgFBBGoiAigCACIAQQBMBEBBfw8LIAJBADYCACABKAIAIgFBCGoiAigCABogAiACKAIAIABqNgIAIAFBDGoiAigCACAAaiEAIAIgADYCACAAIAEoAgQiAUgEQEF/DwsgAiAAIAFrNgIAQX8PCyAAKAKEASABQQJ0aigCACIEQdQCaiIBKAIAIQMgAUEANgIAIAIEQCAAQRRqIgUoAgBBAEoEQCAAQYwBaiEGQQAhAQNAIAYoAgAgAUECdGooAgAiAhCEBARAIAIoAgggBEYEQCACEPcDIAJBOxD1AwsLIAFBAWoiASAFKAIASA0ACwsLIAMEQCADQQEQ5AMaCyAAQQhqIgIoAgBBf2ohASACIAE2AgAgAQRAQQAPCyAAKAKgASIBQQRqIgIoAgAiAEEATARAQQAPCyACQQA2AgAgASgCACIBQQhqIgIoAgAaIAIgAigCACAAajYCACABQQxqIgIoAgAgAGohACACIAA2AgAgACABKAIEIgFIBEBBAA8LIAIgACABazYCAEEAC6IBAQJ/IABFBEAPCyAAEOUCIAAoAoACQQA2AgAgAEEIaiIBKAIAQX9qIQIgASACNgIAIAIEQA8LIAAoAqABIgJBBGoiASgCACIAQQBMBEAPCyABQQA2AgAgAigCACICQQhqIgEoAgAaIAEgASgCACAAajYCACACQQxqIgEoAgAgAGohACABIAA2AgAgACACKAIEIgJIBEAPCyABIAAgAms2AgALiQUBBX8gAEUgAUVyIAJFcgRAQQAPCyAAEOUCIAAoAoACIgUoAgAhAyAAKAL8ASIGRQRAIABBCGoiAigCAEF/aiEBIAIgATYCACABBEBBAA8LIAAoAqABIgFBBGoiAigCACIAQQBMBEBBAA8LIAJBADYCACABKAIAIgFBCGoiAigCABogAiACKAIAIABqNgIAIAFBDGoiAigCACAAaiEAIAIgADYCACAAIAEoAgQiAUgEQEEADwsgAiAAIAFrNgIAQQAPCwJAIANBCHZB/wFxIgRBgAFJBEAgA0H/AXEhAwNAAkAgBiAEQQJ0aigCACIHQQBHIANBgAFJcQRAA0AgByADQQJ0aigCAA0CIANBAWoiA0GAAUkNAAsLIARB/wBPDQMgBEEBaiEEQQAhAwwBCwsgASAENgIAIAIgAzYCACAEQQh0IgFBgAJqIQIgA0EBaiABciEBIAUgA0H/AEkEfyABBSACCzYCACAAQQhqIgIoAgBBf2ohASACIAE2AgAgAQRAQQEPCyAAKAKgASIBQQRqIgIoAgAiAEEATARAQQEPCyACQQA2AgAgASgCACIBQQhqIgIoAgAaIAIgAigCACAAajYCACABQQxqIgIoAgAgAGohACACIAA2AgAgACABKAIEIgFIBEBBAQ8LIAIgACABazYCAEEBDwsLIABBCGoiAigCAEF/aiEBIAIgATYCACABBEBBAA8LIAAoAqABIgFBBGoiAigCACIAQQBMBEBBAA8LIAJBADYCACABKAIAIgFBCGoiAigCABogAiACKAIAIABqNgIAIAFBDGoiAigCACAAaiEAIAIgADYCACAAIAEoAgQiAUgEQEEADwsgAiAAIAFrNgIAQQALDwAgAAR/IAAoAgwFQQALCw0AIAAgASACIAMQygML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CyAAKAKgASIBQQRqIgIoAgAiAEEATARAIAQkBkEADwsgAkEANgIAIAEoAgAiAUEIaiICKAIAGiACIAIoAgAgAGo2AgAgAUEMaiICKAIAIABqIQAgAiAANgIAIAAgASgCBCIBSARAIAQkBkEADwsgAiAAIAFrNgIAIAQkBkEAC94CACABQX9KIABBAEcgAkECSXFxRQRAQX8PCyAAEOUCIAAoAjAgAUoEfyAAKAKEASABQQJ0aigCACACNgK8AiAAQQhqIgIoAgBBf2ohASACIAE2AgAgAQRAQQAPCyAAKAKgASIBQQRqIgIoAgAiAEEATARAQQAPCyACQQA2AgAgASgCACIBQQhqIgIoAgAaIAIgAigCACAAajYCACABQQxqIgIoAgAgAGohACACIAA2AgAgACABKAIEIgFIBEBBAA8LIAIgACABazYCAEEABSAAQQhqIgIoAgBBf2ohASACIAE2AgAgAQRAQX8PCyAAKAKgASIBQQRqIgIoAgAiAEEATARAQX8PCyACQQA2AgAgASgCACIBQQhqIgIoAgAaIAIgAigCACAAajYCACABQQxqIgIoAgAgAGohACACIAA2AgAgACABKAIEIgFIBEBBfw8LIAIgACABazYCAEF/CwsQACAABH8gACgClAIFQQALC/kBAQN/IABBAEcgAUEDSXFFBEBBfw8LIAAQ5QIgACABNgKYAiAAIAI2ApwCIABBFGoiBCgCAEEASgRAIABBjAFqIQUDQCAFKAIAIANBAnRqKAIAIAEgAhCNBCADQQFqIgMgBCgCAEgNAAsLIABBCGoiASgCAEF/aiECIAEgAjYCACACBEBBAA8LIAAoAqABIgFBBGoiACgCACIDQQBMBEBBAA8LIABBADYCACABKAIAIgJBCGoiACgCABogACAAKAIAIANqNgIAIAJBDGoiASgCACADaiEDIAEgAzYCACADIAIoAgQiAEgEQEEADwsgASADIABrNgIAQQAL3QIAIAFBf0ogAEEARyACQQJJcXFFBEBBfw8LIAAQ5QIgACgCMCABSgR/IAAoAoQBIAFBAnRqKAIAIAI2AjQgAEEIaiICKAIAQX9qIQEgAiABNgIAIAEEQEEADwsgACgCoAEiAUEEaiICKAIAIgBBAEwEQEEADwsgAkEANgIAIAEoAgAiAUEIaiICKAIAGiACIAIoAgAgAGo2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IAA2AgAgACABKAIEIgFIBEBBAA8LIAIgACABazYCAEEABSAAQQhqIgIoAgBBf2ohASACIAE2AgAgAQRAQX8PCyAAKAKgASIBQQRqIgIoAgAiAEEATARAQX8PCyACQQA2AgAgASgCACIBQQhqIgIoAgAaIAIgAigCACAAajYCACABQQxqIgIoAgAgAGohACACIAA2AgAgACABKAIEIgFIBEBBfw8LIAIgACABazYCAEF/CwvEBgEFfyAAQQBHIQIgAUEASARAIAJFBEBBfw8LIAAQ5QIgACgCMCICQQBKBEAgACgChAEhA0EAIQEDQCADIAFBAnRqKAIAIgRBCGoiBSAFKAIAQXBxNgIAIARBADYCDCABQQFqIgEgAkcNAAsLIABBCGoiAigCAEF/aiEBIAIgATYCACABBEBBAA8LIAAoAqABIgFBBGoiAigCACIAQQBMBEBBAA8LIAJBADYCACABKAIAIgFBCGoiAigCABogAiACKAIAIABqNgIAIAFBDGoiAigCACAAaiEAIAIgADYCACAAIAEoAgQiAUgEQEEADwsgAiAAIAFrNgIAQQAPCyACRQRAQX8PCyAAEOUCIAAoAjAgAUwEQCAAQQhqIgIoAgBBf2ohASACIAE2AgAgAQRAQX8PCyAAKAKgASIBQQRqIgIoAgAiAEEATARAQX8PCyACQQA2AgAgASgCACIBQQhqIgIoAgAaIAIgAigCACAAajYCACABQQxqIgIoAgAgAGohACACIAA2AgAgACABKAIEIgFIBEBBfw8LIAIgACABazYCAEF/DwsgACgChAEiBCABQQJ0aigCACICKAIIIgVBBHFFBEAgAEEIaiICKAIAQX9qIQEgAiABNgIAIAEEQEF/DwsgACgCoAEiAUEEaiICKAIAIgBBAEwEQEF/DwsgAkEANgIAIAEoAgAiAUEIaiICKAIAGiACIAIoAgAgAGo2AgAgAUEMaiICKAIAIABqIQAgAiAANgIAIAAgASgCBCIBSARAQX8PCyACIAAgAWs2AgBBfw8LIAIoAgwiBiABaiEDIAZBAEoEQCACIAVBcHE2AgggAkEANgIMIAFBAWoiASADSARAA0AgBCABQQJ0aigCACICIAIoAghBcHE2AgggAkEANgIMIAFBAWoiASADSA0ACwsLIABBCGoiAigCAEF/aiEBIAIgATYCACABBEBB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AQ4XAgABAwQFBgcJCgwNCw4PEBEVFRITFAgVCyABELMCIQIgARC0AkEQdEEQdSEDIAEQtQJBEHRBEHUhASAAIAIgAyABEO8CGg8LIAEQswIhAiABELQCQRB0QRB1IQEgACACIAEQ8QIaDwsgARCzAiEDIAEQtAJBEHRBEHUhBCABELUCQRB0QRB1IQUgACADIAQgBRDvAhogARC5AiEAIAEQswIhAyABELQCIQQgASADIAQQnAIgAiABIABBABDMBBoPCyABELMCIQEgACABEP4CGg8LIAEQswIhASAAIAEQ/QIaDwsgARCzAiECIAEQtgJBEHRBEHUhASAAIAIgARCJAxoPCyABELMCIQIgARC3AkEQdEEQdSEBIAAgAiABEIgDGg8LIAEQswIhAiABELkCIQMgARC2AkEQdEEQdSEEIAEQtwJBEHRBEHUhASAAIAIgAyAEIAEQjQMaDwsgA0EMaiIALgEAIgFBf0cEQCADKAIEIgIEQCACIAEQwwQgAEF/OwEACwsgAygCCCIABEAgAygCACIBBEAgASAAENkCCwsgAxDpBA8LIAEQswIhAiABELoCIQEgACACIAEQgwMaDwsgARCzAiECIAEQtwJBEHRBEHUhASAAIAIgARCFAxoPCyABELMCIQIgARC2AkEQdEEQdSEDIAEQtwJBEHRBEHUhASAAIAIgAyABEPMCGg8LIAEQswIhAiABELcCQRB0QRB1IQEgACACQQEgARDzAhoPCyABELMCIQIgARC3AkEQdEEQdSEBIAAgAkHAACABEPMCGg8LIAEQswIhAiABELcCQRB0QRB1IQEgACACQQogARDzAhoPCyABELMCIQIgARC3AkEQdEEQdSEBIAAgAkEHIAEQ8wIaDwsgARCzAiECIAEQtwJBEHRBEHUhASAAIAJB2wAgARDzAhoPCyABELMCIQIgARC3AkEQdEEQdSEBIAAgAkHdACABEPMCGg8LIAEQswIhAiABELcCQRB0QRB1IQEgACACIAEQgQMaDwsgARCzAiECIAEQtAJBEHRBEHUhAyABELcCQRB0QRB1IQEgACACIAMgARCCAxoPCyAAEP8CGgsLmgQBB38jBiEGIwZBMGokBiAGIQIgARCSBCEEIAIQlQIgABDLBCEDIAIgAxCXAgJAIAAQxgQiB0EASgRAQQAhAwNAIAAgAxDHBCEFIAAgBRDIBCIIBEAgCEHF8wAQ9gRFDQMLIANBAWoiAyAHSA0AC0F/IQUFQX8hBQsLIAIgBRCZAgJAAkACQAJAAkACQAJAAkACQAJAIAEQkARBgAFrDoABAAgICAgICAgICAgICAgICAEICAgICAgICAgICAgICAgGCAgICAgICAgICAgICAgIAggICAgICAgICAgICAgICAMICAgICAgICAgICAgICAgFCAgICAgICAgICAgICAgIBAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAcICyABELMCQf//A3EhASACIAQgARCcAgwICyABEJIEIQUgARCzAkH//wNxIQMgARCVBEH//wNxIQEgAiAFIAMgARCbAgwHCyABELMCQf//A3EhAyABEJUEQf//A3EhASACIAQgAyABEKgCDAYLIAEQswJB//8DcSEBIAIgBCABEKECDAULIAEQswIhASACIAQgARCkAgwECyABELMCQf//A3EhASACIAQgARCuAgwDCyABELMCQf//A3EhAyABEJUEQf//A3EhASACIAQgAyABEK8CDAILIAIQsAIMAQsgBiQGQX8PCyAAIAJBAEEAEMwEIQAgBiQGIAALBwBBARC/BAviAgIGfwF8IwYhAyMGQSBqJAYgA0EQaiEEIANBCGohBSADIQJBuCAQ6AQiAUUEQEEAQdDzACACEGgaIAMkBkEADwsgAUEAQbggEMQFGiABQRBqIgZEAAAAAABAj0A5AwAgAUEIaiICIABBAEciADYCACAABH8QbgVBAAshACABIAA2AgAgAUEANgIYIAFBADsBHBC7AiEAIAFBsCBqIAA2AgAgAEUEQEEAQdDzACAFEGgaIAEQ6QRBAEHQ8wAgBBBoGiADJAZBAA8LIAFBADYCICABQQA2AiQgAUE0akEAQfwfEMQFGiACKAIABH8QbiEAIAIoAgBFBSABKAIEIQBBAQshAiABIAYrAwAiByAAIAEoAgBruKJEAAAAAABAj0CjqzYCLCABQX87ATAgAgRAIAMkBiABDwsgAUEoaiEARAAAAAAAQI9AIAejqkELIAFBABBwIQIgACACNgIAIAMkBiABCwsAIAAgARDBBEEBC+YgARZ/IABBIGoiAigCACEDIAJBADYCACAAQQA2AiQgAwRAIABBsCBqIQcgAEEsaiEWIABBGGohFCAA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AUEEaiEBIABBBGohACACQXxqIgJBA0sNAAsLDAILBUEAIQILDAELIAIEQCABIQMgAiEBA0AgACADLAAAIgI6AAAgAkUEQCABIQIMAwsgA0EBaiEDIABBAWohACABQX9qIgENAAtBACECBUEAIQILCyAAQQAgAhDEBRogAAspAQF+QeCDHEHggxwpAwBCrf7V5NSF/ajYAH5CAXwiADcDACAAQiGIpwsYAQF/IAAQlwUhAiAAIAJqIAEQmwUaIAALGwAgACgCTEF/SgR/EHIaIAAQugUFIAAQugULC2QBAn8gACgCKCECIABBACAAKAIAQYABcQR/IAAoAhQgACgCHEsEf0ECBUEBCwVBAQsiASACQQ9xQSBqEQMAIgFBAE4EQCABIAAoAghrIAAoAgRqIAAoAhRqIAAoAhxrIQELIAELhgIBBX8gAygCTEF/SgR/EHIFQQALIQggAiABbCEGIANBygBqIgUsAAAhBCAFIARB/wFqIARyOgAAIAMoAgggA0EEaiIFKAIAIgdrIgRBAEoEfyAAIAcgBCAGSQR/IAQFIAYiBAsQwwUaIAUgBSgCACAEajYCACAAIARqIQAgBiAEawUgBgshBSABRQRAQQAhAgsCQAJAIAVFDQAgA0EgaiEHIAAhBCAFIQADQAJAIAMQ9QQNACADIAQgACAHKAIAQQ9xQSBqEQMAIgVBAWpBAkkNACAEIAVqIQQgACAFayIADQEMAgsLIAgEQBD8BAsgBiAAayABbiECDAELIAgEQBD8BAsLIAILBwAgABC5BQunAQEDfwNAIAAsAAAQ9ARFIQIgAEEBaiEBIAJFBEAgASEADAELCwJ/AkACQAJAAkAgACwAACIDQStrDgMBAgACC0EBIQAMAgtBACEADAELQQAhAiADDAELIAAhAiABIgAsAAALIgEQ+AQEQEEAIQEDQCABQQpsQTBqIAAsAABrIQEgAEEBaiIALAAAEPgEDQALBUEAIQELQQAgAWshACACBH8gAQUgAAsLygEBA38jBiECIwZBEGokBiACIQECfCAAvUIgiKdB/////wdxIgNB/MOk/wNJBHwgA0GewZryA0kEfEQAAAAAAADwPwUgAEQAAAAAAAAAABCdBQsFIAAgAKEgA0H//7//B0sNARoCQAJAAkACQCAAIAEQngVBA3EOAwABAgMLIAErAwAgASsDCBCd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AAAMAEHVEgsBDgBB4RILFQ0AAAAEDQAAAAAJDgAAAAAADgAADgBBjxMLARAAQZsTCx4PAAAAAA8AAAAACRAAAAAAABAAABAAABIAAAASEhIAQdITCw4SAAAAEhISAAAAAAAACQBBgxQLAQsAQY8UCxUKAAAAAAoAAAAACQsAAAAAAAsAAAsAQb0UCwEMAEHJFAt+DAAAAAAMAAAAAAkMAAAAAAAMAAAMAAAwMTIzNDU2Nzg5QUJDREVGVCEiGQ0BAgMRSxwMEAQLHRIeJ2hub3BxYiAFBg8TFBUaCBYHKCQXGAkKDhsfJSODgn0mKis8PT4/Q0dKTVhZWltcXV5fYGFjZGVmZ2lqa2xyc3R5ent8AEHQFQunEElsbGVnYWwgYnl0ZSBzZXF1ZW5jZQBEb21haW4gZXJyb3IAUmVzdWx0IG5vdCByZXByZXNlbnRhYmxlAE5vdCBhIHR0eQBQZXJtaXNzaW9uIGRlbmllZABPcGVyYXRpb24gbm90IHBlcm1pdHRlZABObyBzdWNoIGZpbGUgb3IgZGlyZWN0b3J5AE5vIHN1Y2ggcHJvY2VzcwBGaWxlIGV4aXN0cwBWYWx1ZSB0b28gbGFyZ2UgZm9yIGRhdGEgdHlwZQBObyBzcGFjZSBsZWZ0IG9uIGRldmljZQBPdXQgb2YgbWVtb3J5AFJlc291cmNlIGJ1c3kASW50ZXJydXB0ZWQgc3lzdGVtIGNhbGwAUmVzb3VyY2UgdGVtcG9yYXJpbHkgdW5hdmFpbGFibGUASW52YWxpZCBzZWVrAENyb3NzLWRldmljZSBsaW5rAFJlYWQtb25seSBmaWxlIHN5c3RlbQBEaXJlY3Rvcnkgbm90IGVtcHR5AENvbm5lY3Rpb24gcmVzZXQgYnkgcGVlcgBPcGVyYXRpb24gdGltZWQgb3V0AENvbm5lY3Rpb24gcmVmdXNlZABIb3N0IGlzIGRvd24ASG9zdCBpcyB1bnJlYWNoYWJsZQBBZGRyZXNzIGluIHVzZQBCcm9rZW4gcGlwZQBJL08gZXJyb3IATm8gc3VjaCBkZXZpY2Ugb3IgYWRkcmVzcwBCbG9jayBkZXZpY2UgcmVxdWlyZWQATm8gc3VjaCBkZXZpY2UATm90IGEgZGlyZWN0b3J5AElzIGEgZGlyZWN0b3J5AFRleHQgZmlsZSBidXN5AEV4ZWMgZm9ybWF0IGVycm9yAEludmFsaWQgYXJndW1lbnQAQXJndW1lbnQgbGlzdCB0b28gbG9uZwBTeW1ib2xpYyBsaW5rIGxvb3AARmlsZW5hbWUgdG9vIGxvbmcAVG9vIG1hbnkgb3BlbiBmaWxlcyBpbiBzeXN0ZW0ATm8gZmlsZSBkZXNjcmlwdG9ycyBhdmFpbGFibGUAQmFkIGZpbGUgZGVzY3JpcHRvcgBObyBjaGlsZCBwcm9jZXNzAEJhZCBhZGRyZXNzAEZpbGUgdG9vIGxhcmdlAFRvbyBtYW55IGxpbmtzAE5vIGxvY2tzIGF2YWlsYWJsZQBSZXNvdXJjZSBkZWFkbG9jayB3b3VsZCBvY2N1cgBTdGF0ZSBub3QgcmVjb3ZlcmFibGUAUHJldmlvdXMgb3duZXIgZGllZABPcGVyYXRpb24gY2FuY2VsZWQARnVuY3Rpb24gbm90IGltcGxlbWVudGVkAE5vIG1lc3NhZ2Ugb2YgZGVzaXJlZCB0eXBlAElkZW50aWZpZXIgcmVtb3ZlZABEZXZpY2Ugbm90IGEgc3RyZWFtAE5vIGRhdGEgYXZhaWxhYmxlAERldmljZSB0aW1lb3V0AE91dCBvZiBzdHJlYW1zIHJlc291cmNlcwBMaW5rIGhhcyBiZWVuIHNldmVyZWQAUHJvdG9jb2wgZXJyb3IAQmFkIG1lc3NhZ2UARmlsZSBkZXNjcmlwdG9yIGluIGJhZCBzdGF0ZQBOb3QgYSBzb2NrZXQARGVzdGluYXRpb24gYWRkcmVzcyByZXF1aXJlZABNZXNzYWdlIHRvbyBsYXJnZQBQcm90b2NvbCB3cm9uZyB0eXBlIGZvciBzb2NrZXQAUHJvdG9jb2wgbm90IGF2YWlsYWJsZQBQcm90b2NvbCBub3Qgc3VwcG9ydGVkAFNvY2tldCB0eXBlIG5vdCBzdXBwb3J0ZWQATm90IHN1cHBvcnRlZABQcm90b2NvbCBmYW1pbHkgbm90IHN1cHBvcnRlZABBZGRyZXNzIGZhbWlseSBub3Qgc3VwcG9ydGVkIGJ5IHByb3RvY29sAEFkZHJlc3Mgbm90IGF2YWlsYWJsZQBOZXR3b3JrIGlzIGRvd24ATmV0d29yayB1bnJlYWNoYWJsZQBDb25uZWN0aW9uIHJlc2V0IGJ5IG5ldHdvcmsAQ29ubmVjdGlvbiBhYm9ydGVkAE5vIGJ1ZmZlciBzcGFjZSBhdmFpbGFibGUAU29ja2V0IGlzIGNvbm5lY3RlZABTb2NrZXQgbm90IGNvbm5lY3RlZABDYW5ub3Qgc2VuZCBhZnRlciBzb2NrZXQgc2h1dGRvd24AT3BlcmF0aW9uIGFscmVhZHkgaW4gcHJvZ3Jlc3MAT3BlcmF0aW9uIGluIHByb2dyZXNzAFN0YWxlIGZpbGUgaGFuZGxlAFJlbW90ZSBJL08gZXJyb3IAUXVvdGEgZXhjZWVkZWQATm8gbWVkaXVtIGZvdW5kAFdyb25nIG1lZGl1bSB0eXBlAE5vIGVycm9yIGluZm9ybWF0aW9uAAAAAAAAAwAAAAQAAAAEAAAABgAAAIP5ogBETm4A/CkVANFXJwDdNPUAYtvAADyZlQBBkEMAY1H+ALveqwC3YcUAOm4kANJNQgBJBuAACeouAByS0QDrHf4AKbEcAOg+pwD1NYIARLsuAJzphAC0JnAAQX5fANaROQBTgzkAnPQ5AItfhAAo+b0A+B87AN7/lwAPmAUAES/vAApaiwBtH20Az342AAnLJwBGT7cAnmY/AC3qXwC6J3UA5evHAD178QD3OQcAklKKAPtr6gAfsV8ACF2NADADVgB7/EYA8KtrACC8zwA29JoA46kdAF5hkQAIG+YAhZllAKAUXwCNQGgAgNj/ACdzTQAGBjEAylYVAMmocwB74mAAa4zAAEGDJgtNQPsh+T8AAAAALUR0PgAAAICYRvg8AAAAYFHMeDsAAACAgxvwOQAAAEAgJXo4AAAAgCKC4zYAAAAAHfNpNQAAAAAAAPA/AAAAAAAA+D8AQdgmCwgG0M9D6/1MPgBB6yYLCkADuOI/dBMAAAUAQYAnCwEBAEGYJwsLAQAAAAIAAABCBAcAQbAnCwECAEG/JwsF//////8AQfAnCwX0EwAABQBBgCgLAQEAQZgoCw4DAAAAAgAAALj8BgAABABBsCgLAQEAQb8oCwUK/////wBB8CgLAvQTAEGYKQsBBABBvykLBf//////AEGsKwsDEAQHAEHkKwuiTVR5cGUgbWlzbWF0Y2ggb24gc2V0dGluZyAnJXMnACclcycgaXMgbm90IGEgbm9kZS4gTmFtZSBvZiB0aGUgc2V0dGluZyB3YXMgJyVzJwBTZXR0aW5nIHZhcmlhYmxlIG5hbWUgZXhjZWVkZWQgbWF4IGxlbmd0aCBvZiAlZCBjaGFycwBTZXR0aW5nIHZhcmlhYmxlIG5hbWUgZXhjZWVkZWQgbWF4IHRva2VuIGNvdW50IG9mICVkAG5vAHllcwByZXF1ZXN0ZWQgc2V0IHZhbHVlIGZvciAlcyBvdXQgb2YgcmFuZ2UALCAALAAlczogcGFuaWM6ICVzCgAlczogZXJyb3I6ICVzCgAlczogd2FybmluZzogJXMKACVzOiAlcwoATnVsbCBwb2ludGVyAFJJRkYAc2ZiawBUaW1lciB0aHJlYWQgZmluaXNoZWQAQ291bGRuJ3QgbG9hZCBzb3VuZGZvbnQgZmlsZQBDb3VsZG4ndCBwYXJzZSBwcmVzZXRzIGZyb20gc291bmRmb250IGZpbGUAVW5hYmxlIHRvIGxvYWQgYWxsIHNhbXBsZSBkYXRhAFNlbGVjdGVkIHByZXNldCAnJXMnIG9uIGNoYW5uZWwgJWQAVW5hYmxlIHRvIG9wZW4gU291bmRmb250IGZpbGUAVW5hYmxlIHRvIGxvYWQgc2FtcGxlICclcycsIGRpc2FibGluZwBEZXNlbGVjdGVkIHByZXNldCAnJXMnIGZyb20gY2hhbm5lbCAlZABVbmxvYWRpbmcgc2FtcGxlICclcycAVW5hYmxlIHRvIHVubG9hZCBzYW1wbGUgJyVzJwBCYW5rJWQsUHJlJWQAJXMvJWQAPHVudGl0bGVkPgBBdHRlbXB0ZWQgdG8gcmVhZCAlZCB3b3JkcyBvZiBzYW1wbGUgZGF0YSwgYnV0IGdvdCAlZCBpbnN0ZWFkAEZhaWxlZCB0byBsb2FkIHNhbXBsZSAnJXMnAEVPRiB3aGlsZSBhdHRlbXBpbmcgdG8gcmVhZCAlZCBieXRlcwBGaWxlIHJlYWQgZmFpbGVkAEZpbGUgc2VlayBmYWlsZWQgd2l0aCBvZmZzZXQgPSAlbGQgYW5kIHdoZW5jZSA9ICVkAFNhbXBsZSAnJXMnOiBST00gc2FtcGxlIGlnbm9yZWQAU2FtcGxlICclcyc6IGludmFsaWQgYnVmZmVyIHNpemUAU2FtcGxlICclcyc6IGludmFsaWQgc3RhcnQvZW5kIGZpbGUgcG9zaXRpb25zAFNhbXBsZSAnJXMnOiByZXZlcnNlZCBsb29wIHBvaW50ZXJzICclZCcgLSAnJWQnLCB0cnlpbmcgdG8gZml4AFNhbXBsZSAnJXMnOiBpbnZhbGlkIGxvb3Agc3RhcnQgJyVkJywgc2V0dGluZyB0byBzYW1wbGUgc3RhcnQgJyVkJwBTYW1wbGUgJyVzJzogaW52YWxpZCBsb29wIGVuZCAnJWQnLCBzZXR0aW5nIHRvIHNhbXBsZSBlbmQgJyVkJwBTYW1wbGUgJyVzJzogbG9vcCByYW5nZSAnJWQgLSAlZCcgYWZ0ZXIgc2FtcGxlIGVuZCAnJWQnLCB1c2luZyBpdCBhbnl3YXkAVW5hYmxlIHRvIG9wZW4gZmlsZSAnJXMnAFNlZWsgdG8gZW5kIG9mIGZpbGUgZmFpbGVkAEdldCBlbmQgb2YgZmlsZSBwb3NpdGlvbiBmYWlsZWQAUmV3aW5kIHRvIHN0YXJ0IG9mIGZpbGUgZmFpbGVkAE5vdCBhIFJJRkYgZmlsZQBOb3QgYSBTb3VuZEZvbnQgZmlsZQBTb3VuZEZvbnQgZmlsZSBzaXplIG1pc21hdGNoAEludmFsaWQgY2h1bmsgaWQgaW4gbGV2ZWwgMCBwYXJzZQBJbnZhbGlkIElEIGZvdW5kIHdoZW4gZXhwZWN0aW5nIElORk8gY2h1bmsAU291bmQgZm9udCB2ZXJzaW9uIGluZm8gY2h1bmsgaGFzIGludmFsaWQgc2l6ZQBTb3VuZCBmb250IHZlcnNpb24gaXMgJWQuJWQgd2hpY2ggaXMgbm90IHN1cHBvcnRlZCwgY29udmVydCB0byB2ZXJzaW9uIDIuMHgAU291bmQgZm9udCB2ZXJzaW9uIGlzICVkLiVkIGJ1dCBmbHVpZHN5bnRoIHdhcyBjb21waWxlZCB3aXRob3V0IHN1cHBvcnQgZm9yICh2My54KQBTb3VuZCBmb250IHZlcnNpb24gaXMgJWQuJWQgd2hpY2ggaXMgbmV3ZXIgdGhhbiB3aGF0IHRoaXMgdmVyc2lvbiBvZiBmbHVpZHN5bnRoIHdhcyBkZXNpZ25lZCBmb3IgKHYyLjB4KQBST00gdmVyc2lvbiBpbmZvIGNodW5rIGhhcyBpbnZhbGlkIHNpemUASU5GTyBzdWIgY2h1bmsgJS40cyBoYXMgaW52YWxpZCBjaHVuayBzaXplIG9mICVkIGJ5dGVzAEludmFsaWQgY2h1bmsgaWQgaW4gSU5GTyBjaHVuawBJTkZPIGNodW5rIHNpemUgbWlzbWF0Y2gASW52YWxpZCBJRCBmb3VuZCB3aGVuIGV4cGVjdGluZyBTQU1QTEUgY2h1bmsARXhwZWN0ZWQgU01QTCBjaHVuayBmb3VuZCBpbnZhbGlkIGlkIGluc3RlYWQAU0RUQSBjaHVuayBzaXplIG1pc21hdGNoAEZvdW5kIFNNMjQgY2h1bmsAU00yNCBleGVlZHMgU0RUQSBjaHVuaywgaWdub3JpbmcgU00yNABTTTI0IG5vdCBlcXVhbCB0byBoYWxmIHRoZSBzaXplIG9mIFNNUEwgY2h1bmsgKDB4JVggIT0gMHglWCksIGlnbm9yaW5nIFNNMjQASW52YWxpZCBJRCBmb3VuZCB3aGVuIGV4cGVjdGluZyBIWURSQSBjaHVuawBGYWlsZWQgdG8gc2VlayB0byBIWURSQSBwb3NpdGlvbgBFeHBlY3RlZCBQRFRBIHN1Yi1jaHVuayAnJS40cycgZm91bmQgaW52YWxpZCBpZCBpbnN0ZWFkACclLjRzJyBjaHVuayBzaXplIGlzIG5vdCBhIG11bHRpcGxlIG9mICVkIGJ5dGVzACclLjRzJyBjaHVuayBzaXplIGV4Y2VlZHMgcmVtYWluaW5nIFBEVEEgY2h1bmsgc2l6ZQBQcmVzZXQgaGVhZGVyIGNodW5rIHNpemUgaXMgaW52YWxpZABQcmVzZXQgaGVhZGVyIGluZGljZXMgbm90IG1vbm90b25pYwAlZCBwcmVzZXQgem9uZXMgbm90IHJlZmVyZW5jZWQsIGRpc2NhcmRpbmcARmlsZSBjb250YWlucyBubyBwcmVzZXRzAFByZXNldCBiYWcgY2h1bmsgc2l6ZSBpcyBpbnZhbGlkAFByZXNldCBiYWcgY2h1bmsgc2l6ZSBtaXNtYXRjaABQcmVzZXQgYmFnIGdlbmVyYXRvciBpbmRpY2VzIG5vdCBtb25vdG9uaWMAUHJlc2V0IGJhZyBtb2R1bGF0b3IgaW5kaWNlcyBub3QgbW9ub3RvbmljAE5vIHByZXNldCBnZW5lcmF0b3JzIGFuZCB0ZXJtaW5hbCBpbmRleCBub3QgMABObyBwcmVzZXQgbW9kdWxhdG9ycyBhbmQgdGVybWluYWwgaW5kZXggbm90IDAAUHJlc2V0IG1vZHVsYXRvciBjaHVuayBzaXplIG1pc21hdGNoAFByZXNldCBnZW5lcmF0b3IgY2h1bmsgc2l6ZSBtaXNtYXRjaABQcmVzZXQgJyVzJzogR2xvYmFsIHpvbmUgaXMgbm90IGZpcnN0IHpvbmUAUHJlc2V0ICclcyc6IERpc2NhcmRpbmcgaW52YWxpZCBnbG9iYWwgem9uZQBQcmVzZXQgJyVzJzogU29tZSBpbnZhbGlkIGdlbmVyYXRvcnMgd2VyZSBkaXNjYXJkZWQASW5zdHJ1bWVudCBoZWFkZXIgaGFzIGludmFsaWQgc2l6ZQBJbnN0cnVtZW50IGhlYWRlciBpbmRpY2VzIG5vdCBtb25vdG9uaWMAJWQgaW5zdHJ1bWVudCB6b25lcyBub3QgcmVmZXJlbmNlZCwgZGlzY2FyZGluZwBGaWxlIGNvbnRhaW5zIG5vIGluc3RydW1lbnRzAEluc3RydW1lbnQgYmFnIGNodW5rIHNpemUgaXMgaW52YWxpZABJbnN0cnVtZW50IGJhZyBjaHVuayBzaXplIG1pc21hdGNoAEluc3RydW1lbnQgZ2VuZXJhdG9yIGluZGljZXMgbm90IG1vbm90b25pYwBJbnN0cnVtZW50IG1vZHVsYXRvciBpbmRpY2VzIG5vdCBtb25vdG9uaWMASW5zdHJ1bWVudCBjaHVuayBzaXplIG1pc21hdGNoAE5vIGluc3RydW1lbnQgZ2VuZXJhdG9ycyBhbmQgdGVybWluYWwgaW5kZXggbm90IDAATm8gaW5zdHJ1bWVudCBtb2R1bGF0b3JzIGFuZCB0ZXJtaW5hbCBpbmRleCBub3QgMABJbnN0cnVtZW50IG1vZHVsYXRvciBjaHVuayBzaXplIG1pc21hdGNoAElHRU4gY2h1bmsgc2l6ZSBtaXNtYXRjaABJbnN0cnVtZW50ICclcyc6IEdsb2JhbCB6b25lIGlzIG5vdCBmaXJzdCB6b25lAEluc3RydW1lbnQgJyVzJzogRGlzY2FyZGluZyBpbnZhbGlkIGdsb2JhbCB6b25lAEluc3RydW1lbnQgZ2VuZXJhdG9yIGNodW5rIHNpemUgbWlzbWF0Y2gASW5zdHJ1bWVudCAnJXMnOiBTb21lIGludmFsaWQgZ2VuZXJhdG9ycyB3ZXJlIGRpc2NhcmRlZABTYW1wbGUgaGVhZGVyIGhhcyBpbnZhbGlkIHNpemUARmlsZSBjb250YWlucyBubyBzYW1wbGVzAFByZXNldCAlMDNkICUwM2Q6IEludmFsaWQgaW5zdHJ1bWVudCByZWZlcmVuY2UASW5zdHJ1bWVudCAnJXMnOiBJbnZhbGlkIHNhbXBsZSByZWZlcmVuY2UAU2FtcGxlIG9mZnNldHMgZXhjZWVkIHNhbXBsZSBkYXRhIGNodW5rAEZhaWxlZCB0byBzZWVrIHRvIHNhbXBsZSBwb3NpdGlvbgBGYWlsZWQgdG8gcmVhZCBzYW1wbGUgZGF0YQBTYW1wbGUgb2Zmc2V0cyBleGNlZWQgMjQtYml0IHNhbXBsZSBkYXRhIGNodW5rAEZhaWxlZCB0byBzZWVrIHBvc2l0aW9uIGZvciAyNC1iaXQgc2FtcGxlIGRhdGEgaW4gZGF0YSBmaWxlAE91dCBvZiBtZW1vcnkgcmVhZGluZyAyNC1iaXQgc2FtcGxlIGRhdGEARmFpbGVkIHRvIHJlYWQgMjQtYml0IHNhbXBsZSBkYXRhAElnbm9yaW5nIDI0LWJpdCBzYW1wbGUgZGF0YSwgc291bmQgcXVhbGl0eSBtaWdodCBzdWZmZXIAVW5hYmxlIHRvIHJlYWQgbW9kaWZpY2F0b24gdGltZSBvZiBzb3VuZGZvbnQgZmlsZS4ARmFpbGVkIHRvIHBpbiB0aGUgc2FtcGxlIGRhdGEgdG8gUkFNOyBzd2FwcGluZyBpcyBwb3NzaWJsZS4AVHJ5aW5nIHRvIGZyZWUgc2FtcGxlIGRhdGEgbm90IGZvdW5kIGluIGNhY2hlLgBjaG9ydXM6IE91dCBvZiBtZW1vcnkAY2hvcnVzOiBudW1iZXIgYmxvY2tzIG11c3QgYmUgPj0wISBTZXR0aW5nIHZhbHVlIHRvIDAuAGNob3J1czogbnVtYmVyIGJsb2NrcyBsYXJnZXIgdGhhbiBtYXguIGFsbG93ZWQhIFNldHRpbmcgdmFsdWUgdG8gJWQuAGNob3J1czogc3BlZWQgaXMgdG9vIGxvdyAobWluICVmKSEgU2V0dGluZyB2YWx1ZSB0byBtaW4uAGNob3J1czogc3BlZWQgbXVzdCBiZSBiZWxvdyAlZiBIeiEgU2V0dGluZyB2YWx1ZSB0byBtYXguAGNob3J1czogZGVwdGggbXVzdCBiZSBwb3NpdGl2ZSEgU2V0dGluZyB2YWx1ZSB0byAwLgBjaG9ydXM6IGxldmVsIG11c3QgYmUgcG9zaXRpdmUhIFNldHRpbmcgdmFsdWUgdG8gMC4AY2hvcnVzOiBsZXZlbCBtdXN0IGJlIDwgMTAuIEEgcmVhc29uYWJsZSBsZXZlbCBpcyA8PCAxISBTZXR0aW5nIGl0IHRvIDAuMS4AY2hvcnVzOiBUb28gaGlnaCBkZXB0aC4gU2V0dGluZyBpdCB0byBtYXggKCVkKS4AY2hvcnVzOiBVbmtub3duIG1vZHVsYXRpb24gdHlwZS4gVXNpbmcgc2luZXdhdmUuAFJpbmdidWZmZXIgZnVsbCwgdHJ5IGluY3JlYXNpbmcgcG9seXBob255IQBJbnRlcm5hbCBlcnJvcjogVHJ5aW5nIHRvIHJlcGxhY2UgYW4gZXhpc3RpbmcgcnZvaWNlIGluIGZsdWlkX3J2b2ljZV9taXhlcl9hZGRfdm9pY2U/IQBFeGNlZWRlZCBmaW5pc2hlZCB2b2ljZXMgYXJyYXksIHRyeSBpbmNyZWFzaW5nIHBvbHlwaG9ueQBUcnlpbmcgdG8gZXhjZWVkIHBvbHlwaG9ueSBpbiBmbHVpZF9ydm9pY2VfbWl4ZXJfYWRkX3ZvaWNlAGV2ZW50OiBPdXQgb2YgbWVtb3J5CgBVbmtub3duIG1vZHVsYXRvciB0eXBlICclZCcsIGRpc2FibGluZyBtb2R1bGF0b3IuAFVua25vd24gbW9kdWxhdG9yIHNvdXJjZSAnJWQnLCBkaXNhYmxpbmcgbW9kdWxhdG9yLgBzeW50aC52ZXJib3NlAHN5bnRoLnJldmVyYi5hY3RpdmUAc3ludGgucmV2ZXJiLnJvb20tc2l6ZQBzeW50aC5yZXZlcmIuZGFtcABzeW50aC5yZXZlcmIud2lkdGgAc3ludGgucmV2ZXJiLmxldmVsAHN5bnRoLmNob3J1cy5hY3RpdmUAc3ludGguY2hvcnVzLm5yAHN5bnRoLmNob3J1cy5sZXZlbABzeW50aC5jaG9ydXMuc3BlZWQAc3ludGguY2hvcnVzLmRlcHRoAHN5bnRoLmxhZHNwYS5hY3RpdmUAc3ludGgubG9jay1tZW1vcnkAbWlkaS5wb3J0bmFtZQBzeW50aC5kZWZhdWx0LXNvdW5kZm9udAAvdXNyL2xvY2FsL3NoYXJlL3NvdW5kZm9udHMvZGVmYXVsdC5zZjIAc3ludGgucG9seXBob255AHN5bnRoLmdhaW4Ac3ludGguYXVkaW8tY2hhbm5lbHMAc3ludGguYXVkaW8tZ3JvdXBzAHN5bnRoLmVmZmVjdHMtY2hhbm5lbHMAc3ludGguZWZmZWN0cy1ncm91cHMAc3ludGguZGV2aWNlLWlkAHN5bnRoLmNwdS1jb3JlcwBzeW50aC5taW4tbm90ZS1sZW5ndGgAc3ludGgudGhyZWFkc2FmZS1hcGkAc3ludGgub3ZlcmZsb3cucGVyY3Vzc2lvbgBzeW50aC5vdmVyZmxvdy5zdXN0YWluZWQAc3ludGgub3ZlcmZsb3cucmVsZWFzZWQAc3ludGgub3ZlcmZsb3cuYWdlAHN5bnRoLm92ZXJmbG93LnZvbHVtZQBzeW50aC5vdmVyZmxvdy5pbXBvcnRhbnQAc3ludGgub3ZlcmZsb3cuaW1wb3J0YW50LWNoYW5uZWxzAHN5bnRoLm1pZGktYmFuay1zZWxlY3QAZ3MAZ20AeGcAbW1hAHN5bnRoLmR5bmFtaWMtc2FtcGxlLWxvYWRpbmcAMi4wLjEAUmVxdWVzdGVkIG51bWJlciBvZiBNSURJIGNoYW5uZWxzIGlzIG5vdCBhIG11bHRpcGxlIG9mIDE2LiBJJ2xsIGluY3JlYXNlIHRoZSBudW1iZXIgb2YgY2hhbm5lbHMgdG8gdGhlIG5leHQgbXVsdGlwbGUuAFJlcXVlc3RlZCBudW1iZXIgb2YgYXVkaW8gY2hhbm5lbHMgaXMgc21hbGxlciB0aGFuIDEuIENoYW5naW5nIHRoaXMgc2V0dGluZyB0byAxLgBSZXF1ZXN0ZWQgbnVtYmVyIG9mIGF1ZGlvIGNoYW5uZWxzIGlzIHRvbyBiaWcgKCVkKS4gTGltaXRpbmcgdGhpcyBzZXR0aW5nIHRvIDEyOC4AUmVxdWVzdGVkIG51bWJlciBvZiBhdWRpbyBncm91cHMgaXMgc21hbGxlciB0aGFuIDEuIENoYW5naW5nIHRoaXMgc2V0dGluZyB0byAxLgBSZXF1ZXN0ZWQgbnVtYmVyIG9mIGF1ZGlvIGdyb3VwcyBpcyB0b28gYmlnICglZCkuIExpbWl0aW5nIHRoaXMgc2V0dGluZyB0byAxMjguAEludmFsaWQgbnVtYmVyIG9mIGVmZmVjdHMgY2hhbm5lbHMgKCVkKS5TZXR0aW5nIGVmZmVjdHMgY2hhbm5lbHMgdG8gMi4ARmFpbGVkIHRvIHNldCBvdmVyZmxvdyBpbXBvcnRhbnQgY2hhbm5lbHMARmx1aWRTeW50aCBoYXMgbm90IGJlZW4gY29tcGlsZWQgd2l0aCBMQURTUEEgc3VwcG9ydABGYWlsZWQgdG8gY3JlYXRlIHRoZSBkZWZhdWx0IFNvdW5kRm9udCBsb2FkZXIAbm90ZW9uCSVkCSVkCSVkCSUwNWQJJS4zZgklLjNmCSUuM2YJJWQJJXMAY2hhbm5lbCBoYXMgbm8gcHJlc2V0AGNjCSVkCSVkCSVkAFVubmFtZWQAU1lTRVgAJXMAYmFzaWMgY2hhbm5lbCAlZCBvdmVybGFwcyBhbm90aGVyIGdyb3VwAGNoYW5uZWxwcmVzc3VyZQklZAklZABrZXlwcmVzc3VyZQklZAklZAklZABwaXRjaGIJJWQJJWQAcGl0Y2hzZW5zCSVkCSVkAHByb2cJJWQJJWQJJWQASW5zdHJ1bWVudCBub3QgZm91bmQgb24gY2hhbm5lbCAlZCBbYmFuaz0lZCBwcm9nPSVkXSwgc3Vic3RpdHV0ZWQgW2Jhbms9JWQgcHJvZz0lZF0ATm8gcHJlc2V0IGZvdW5kIG9uIGNoYW5uZWwgJWQgW2Jhbms9JWQgcHJvZz0lZF0AVGhlcmUgaXMgbm8gcHJlc2V0IHdpdGggYmFuayBudW1iZXIgJWQgYW5kIHByZXNldCBudW1iZXIgJWQgaW4gU291bmRGb250ICVkAFRoZXJlIGlzIG5vIHByZXNldCB3aXRoIGJhbmsgbnVtYmVyICVkIGFuZCBwcmVzZXQgbnVtYmVyICVkIGluIFNvdW5kRm9udCAlcwBQb2x5cGhvbnkgZXhjZWVkZWQsIHRyeWluZyB0byBraWxsIGEgdm9pY2UAS2lsbGluZyB2b2ljZSAlZCwgaW5kZXggJWQsIGNoYW4gJWQsIGtleSAlZCAARmFpbGVkIHRvIGFsbG9jYXRlIGEgc3ludGhlc2lzIHByb2Nlc3MuIChjaGFuPSVkLGtleT0lZCkAbm90ZW9uCSVkCSVkCSVkCSUwNWQJJS4zZgklLjNmCSUuM2YJJWQARmFpbGVkIHRvIGluaXRpYWxpemUgdm9pY2UARmFpbGVkIHRvIGxvYWQgU291bmRGb250ICIlcyIATm8gU291bmRGb250IHdpdGggaWQgPSAlZABVbmxvYWRlZCBTb3VuZEZvbnQAQ2hhbm5lbHMgZG9uJ3QgZXhpc3QgKHlldCkhAEZhaWxlZCB0byBleGVjdXRlIGxlZ2F0byBtb2RlOiAlZABub3Rlb2ZmCSVkCSVkCSVkCSUwNWQJJS4zZgklZABEZWxldGluZyB2b2ljZSAldSB3aGljaCBoYXMgbG9ja2VkIHJ2b2ljZXMhAEludGVybmFsIGVycm9yOiBDYW5ub3QgYWNjZXNzIGFuIHJ2b2ljZSBpbiBmbHVpZF92b2ljZV9pbml0IQBJZ25vcmluZyBpbnZhbGlkIGNvbnRyb2xsZXIsIHVzaW5nIG5vbi1DQyBzb3VyY2UgJWkuAFZvaWNlICVpIGhhcyBtb3JlIG1vZHVsYXRvcnMgdGhhbiBzdXBwb3J0ZWQsIGlnbm9yaW5nLgBwbGF5ZXIudGltaW5nLXNvdXJjZQBzeXN0ZW0AcGxheWVyLnJlc2V0LXN5bnRoAHNhbXBsZQAlczogJWQ6IExvYWRpbmcgbWlkaWZpbGUgJXMAL21udC9uL0Vtc2NyaXB0ZW4vZmx1aWRzeW50aC1lbXNjcmlwdGVuLTIuMC4xL3NyYy9taWRpL2ZsdWlkX21pZGkuYwByYgBDb3VsZG4ndCBvcGVuIHRoZSBNSURJIGZpbGUARmlsZSBsb2FkOiBDb3VsZCBub3Qgc2VlayB3aXRoaW4gZmlsZQBGaWxlIGxvYWQ6IEFsbG9jYXRpbmcgJWQgYnl0ZXMAT25seSByZWFkICVkIGJ5dGVzOyBleHBlY3RlZCAlZAAlczogJWQ6IExvYWRpbmcgbWlkaWZpbGUgZnJvbSBtZW1vcnkgKCVwKQBNVGhkAERvZXNuJ3QgbG9vayBsaWtlIGEgTUlESSBmaWxlOiBpbnZhbGlkIE1UaGQgaGVhZGVyAEZpbGUgdXNlcyBTTVBURSB0aW1pbmcgLS0gTm90IGltcGxlbWVudGVkIHlldABEaXZpc2lvbj0lZAB0ZW1wbz0lZCwgdGljayB0aW1lPSVmIG1zZWMsIGN1ciB0aW1lPSVkIG1zZWMsIGN1ciB0aWNrPSVkAEFuIG5vbi1hc2NpaSB0cmFjayBoZWFkZXIgZm91bmQsIGNvcnJ1cHQgZmlsZQBNVHJrAFVuZXhwZWN0ZWQgZW5kIG9mIGZpbGUAVW5kZWZpbmVkIHN0YXR1cyBhbmQgaW52YWxpZCBydW5uaW5nIHN0YXR1cwAlczogJWQ6IGFsbG9jIG1ldGFkYXRhLCBsZW4gPSAlZABJbnZhbGlkIGxlbmd0aCBmb3IgRW5kT2ZUcmFjayBldmVudABJbnZhbGlkIGxlbmd0aCBmb3IgU2V0VGVtcG8gbWV0YSBldmVudABJbnZhbGlkIGxlbmd0aCBmb3IgU01QVEUgT2Zmc2V0IG1ldGEgZXZlbnQASW52YWxpZCBsZW5ndGggZm9yIFRpbWVTaWduYXR1cmUgbWV0YSBldmVudABzaWduYXR1cmU9JWQvJWQsIG1ldHJvbm9tZT0lZCwgMzJuZC1ub3Rlcz0lZABJbnZhbGlkIGxlbmd0aCBmb3IgS2V5U2lnbmF0dXJlIG1ldGEgZXZlbnQAJXM6ICVkOiBmcmVlIG1ldGFkYXRhAFVucmVjb2duaXplZCBNSURJIGV2ZW50AEZhaWxlZCB0byBzZWVrIHBvc2l0aW9uIGluIGZpbGUAJXM6ICVkOiBEdXJhdGlvbj0lLjNmIHNlYwBJbnZhbGlkIHZhcmlhYmxlIGxlbmd0aCBudW1iZXIAc3ludGgubWlkaS1jaGFubmVscwBldmVudF9wcmVfbm90ZW9uICVpICVpICVpCgBldmVudF9wcmVfbm90ZW9mZiAlaSAlaSAlaQoAZXZlbnRfcHJlX2NjICVpICVpICVpCgBldmVudF9wcmVfcHJvZyAlaSAlaQoAZXZlbnRfcHJlX3BpdGNoICVpICVpCgBldmVudF9wcmVfY3ByZXNzICVpICVpCgBldmVudF9wcmVfa3ByZXNzICVpICVpICVpCgBldmVudF9wb3N0X25vdGVvbiAlaSAlaSAlaQoAZXZlbnRfcG9zdF9ub3Rlb2ZmICVpICVpICVpCgBldmVudF9wb3N0X2NjICVpICVpICVpCgBldmVudF9wb3N0X3Byb2cgJWkgJWkKAGV2ZW50X3Bvc3RfcGl0Y2ggJWkgJWkKAGV2ZW50X3Bvc3RfY3ByZXNzICVpICVpCgBldmVudF9wb3N0X2twcmVzcyAlaSAlaSAlaQoAZmx1aWRzeW50aABzZXF1ZW5jZXI6IE91dCBvZiBtZW1vcnkKAHNlcXVlbmNlcjogbm8gbW9yZSBmcmVlIGV2ZW50cwoAc2VxdWVuY2VyOiBzY2FsZSA8PSAwIDogJWYKAGF1ZGlvLnNhbXBsZS1mb3JtYXQAMTZiaXRzAGZsb2F0AGF1ZGlvLnBlcmlvZHMAYXVkaW8ucmVhbHRpbWUtcHJpbwBhdWRpby5kcml2ZXIAZmlsZQBVc2luZyAnJXMnIGF1ZGlvIGRyaXZlcgBOVUxMAEVSUk9SAENvdWxkbid0IGZpbmQgdGhlIHJlcXVlc3RlZCBhdWRpbyBkcml2ZXIgJXMuIFZhbGlkIGRyaXZlcnMgYXJlOiAlcy4AQ2FsbGJhY2sgbW9kZSB1bnN1cHBvcnRlZCBvbiAnJXMnIGF1ZGlvIGRyaXZlcgBtaWRpLmF1dG9jb25uZWN0AG1pZGkucmVhbHRpbWUtcHJpbwBtaWRpLmRyaXZlcgBzeW50aC5zYW1wbGUtcmF0ZQBDb3VsZG4ndCBjcmVhdGUgdGhlIGF1ZGlvIHRocmVhZC4AYXVkaW8uZmlsZS5uYW1lAGZsdWlkc3ludGgucmF3AGF1ZGlvLmZpbGUudHlwZQByYXcAYXVkaW8uZmlsZS5mb3JtYXQAczE2AGF1ZGlvLmZpbGUuZW5kaWFuAGNwdQBPdXQgb2YgbWVtb3J5AGF1ZGlvLnBlcmlvZC1zaXplAE5vIGZpbGUgbmFtZSBzcGVjaWZpZWQAd2IARmFpbGVkIHRvIG9wZW4gdGhlIGZpbGUgJyVzJwBBdWRpbyBvdXRwdXQgZmlsZSB3cml0ZSBlcnJvcjogJXMALSsgICAwWDB4AChudWxsKQAtMFgrMFggMFgtMHgrMHggMHgAaW5mAElORgBuYW4ATkFOAC4AcndhAKiSAQRuYW1lAZ+SAeYFAAVhYm9ydAENZW5sYXJnZU1lbW9yeQIOZ2V0VG90YWxNZW1vcnkDF2Fib3J0T25DYW5ub3RHcm93TWVtb3J5BAdfX19sb2NrBQtfX19zZXRFcnJObwYNX19fc3lzY2FsbDE0MAcNX19fc3lzY2FsbDE0NQgNX19fc3lzY2FsbDE0NgkNX19fc3lzY2FsbDE1MAoNX19fc3lzY2FsbDE1MQsNX19fc3lzY2FsbDE5NQwNX19fc3lzY2FsbDIyMQ0LX19fc3lzY2FsbDUODF9fX3N5c2NhbGw1NA8LX19fc3lzY2FsbDYQCV9fX3VubG9jaxEGX2Fib3J0EhZfZW1zY3JpcHRlbl9tZW1jcHlfYmlnEw1fZ2V0dGltZW9mZGF5FA5fbGx2bV9leHAyX2Y2NBUHX3VzbGVlcBYQX19ncm93V2FzbU1lbW9yeRcKc3RhY2tBbGxvYxgJc3RhY2tTYXZlGQxzdGFja1Jlc3RvcmUaE2VzdGFibGlzaFN0YWNrU3BhY2UbCHNldFRocmV3HAtzZXRUZW1wUmV0MB0LZ2V0VGVtcFJldDAeGF9mbHVpZF9jb252ZXJzaW9uX2NvbmZpZx8RX2ZsdWlkX2N0Mmh6X3JlYWwgDF9mbHVpZF9jdDJoeiENX2ZsdWlkX2NiMmFtcCITX2ZsdWlkX3RjMnNlY19kZWxheSMUX2ZsdWlkX3RjMnNlY19hdHRhY2skDV9mbHVpZF90YzJzZWMlDV9mbHVpZF9hY3QyaHomCl9mbHVpZF9wYW4nDl9mbHVpZF9iYWxhbmNlKA5fZmx1aWRfY29uY2F2ZSkNX2ZsdWlkX2NvbnZleCoSX2ZsdWlkX2RpcmVjdF9oYXNoKxdfZGVsZXRlX2ZsdWlkX2hhc2h0YWJsZSwdX2ZsdWlkX2hhc2h0YWJsZV9tYXliZV9yZXNpemUtFl9mbHVpZF9oYXNodGFibGVfdW5yZWYuGV9uZXdfZmx1aWRfaGFzaHRhYmxlX2Z1bGwvF19mbHVpZF9oYXNodGFibGVfbG9va3VwMBdfZmx1aWRfaGFzaHRhYmxlX2luc2VydDEgX2ZsdWlkX2hhc2h0YWJsZV9pbnNlcnRfaW50ZXJuYWwyGF9mbHVpZF9oYXNodGFibGVfZm9yZWFjaDMQX2ZsdWlkX3N0cl9lcXVhbDQPX2ZsdWlkX3N0cl9oYXNoNRJfZGVsZXRlX2ZsdWlkX2xpc3Q2E19kZWxldGUxX2ZsdWlkX2xpc3Q3El9mbHVpZF9saXN0X2FwcGVuZDgTX2ZsdWlkX2xpc3RfcHJlcGVuZDkPX2ZsdWlkX2xpc3RfbnRoOhJfZmx1aWRfbGlzdF9yZW1vdmU7F19mbHVpZF9saXN0X3JlbW92ZV9saW5rPBBfZmx1aWRfbGlzdF9zb3J0PRBfZmx1aWRfbGlzdF9zaXplPhVfZmx1aWRfbGlzdF9pbnNlcnRfYXQ/HF9mbHVpZF9saXN0X3N0cl9jb21wYXJlX2Z1bmNAFV9uZXdfZmx1aWRfcmluZ2J1ZmZlckEYX2RlbGV0ZV9mbHVpZF9yaW5nYnVmZmVyQhNfbmV3X2ZsdWlkX3NldHRpbmdzQyJfZmx1aWRfc2V0dGluZ3NfdmFsdWVfZGVzdHJveV9mdW5jRBZfZGVsZXRlX2ZsdWlkX3NldHRpbmdzRRxfZmx1aWRfc2V0dGluZ3NfcmVnaXN0ZXJfc3RyRhhfZmx1aWRfc2V0dGluZ3NfdG9rZW5pemVHE19mbHVpZF9zZXR0aW5nc19zZXRIHF9mbHVpZF9zZXR0aW5nc19yZWdpc3Rlcl9udW1JHF9mbHVpZF9zZXR0aW5nc19yZWdpc3Rlcl9pbnRKHF9mbHVpZF9zZXR0aW5nc19jYWxsYmFja19zdHJLHF9mbHVpZF9zZXR0aW5nc19jYWxsYmFja19udW1MHF9mbHVpZF9zZXR0aW5nc19jYWxsYmFja19pbnRNGF9mbHVpZF9zZXR0aW5nc19nZXRfdHlwZU4ZX2ZsdWlkX3NldHRpbmdzX2dldF9oaW50c08bX2ZsdWlkX3NldHRpbmdzX2lzX3JlYWx0aW1lUBZfZmx1aWRfc2V0dGluZ3Nfc2V0c3RyURdfZmx1aWRfc2V0dGluZ3NfY29weXN0clIWX2ZsdWlkX3NldHRpbmdzX2R1cHN0clMZX2ZsdWlkX3NldHRpbmdzX3N0cl9lcXVhbFQeX2ZsdWlkX3NldHRpbmdzX2dldHN0cl9kZWZhdWx0VRpfZmx1aWRfc2V0dGluZ3NfYWRkX29wdGlvblYWX2ZsdWlkX3NldHRpbmdzX3NldG51bVcWX2ZsdWlkX3NldHRpbmdzX2dldG51bVgcX2ZsdWlkX3NldHRpbmdzX2dldG51bV9mbG9hdFkcX2ZsdWlkX3NldHRpbmdzX2dldG51bV9yYW5nZVoeX2ZsdWlkX3NldHRpbmdzX2dldG51bV9kZWZhdWx0WxZfZmx1aWRfc2V0dGluZ3Nfc2V0aW50XBZfZmx1aWRfc2V0dGluZ3NfZ2V0aW50XRxfZmx1aWRfc2V0dGluZ3NfZ2V0aW50X3JhbmdlXh5fZmx1aWRfc2V0dGluZ3NfZ2V0aW50X2RlZmF1bHRfHl9mbHVpZF9zZXR0aW5nc19mb3JlYWNoX29wdGlvbmAcX2ZsdWlkX3NldHRpbmdzX29wdGlvbl9jb3VudGEdX2ZsdWlkX3NldHRpbmdzX29wdGlvbl9jb25jYXRiF19mbHVpZF9zZXR0aW5nc19mb3JlYWNoYxxfZmx1aWRfc2V0dGluZ3NfZm9yZWFjaF9pdGVyZBlfZmx1aWRfc2V0dGluZ3Nfc3BsaXRfY3N2ZRFfZmx1aWRfc3lzX2NvbmZpZ2YbX2ZsdWlkX2RlZmF1bHRfbG9nX2Z1bmN0aW9uZxdfZmx1aWRfc2V0X2xvZ19mdW5jdGlvbmgKX2ZsdWlkX2xvZ2kNX2ZsdWlkX3N0cnRva2oMX2ZsdWlkX2Vycm9yaxJfZmx1aWRfaXNfbWlkaWZpbGVsE19mbHVpZF9pc19zb3VuZGZvbnRtDV9mbHVpZF9tc2xlZXBuDl9mbHVpZF9jdXJ0aW1lbwxfZmx1aWRfdXRpbWVwEF9uZXdfZmx1aWRfdGltZXJxE19kZWxldGVfZmx1aWRfdGltZXJyEV9mbHVpZF90aW1lcl9qb2lucxZfbmV3X2ZsdWlkX2RlZnNmbG9hZGVydBdfZmx1aWRfZGVmc2Zsb2FkZXJfbG9hZHUeX2ZsdWlkX2RlZnNmb250X3Nmb250X2dldF9uYW1ldiBfZmx1aWRfZGVmc2ZvbnRfc2ZvbnRfZ2V0X3ByZXNldHclX2ZsdWlkX2RlZnNmb250X3Nmb250X2l0ZXJhdGlvbl9zdGFydHgkX2ZsdWlkX2RlZnNmb250X3Nmb250X2l0ZXJhdGlvbl9uZXh0eRxfZmx1aWRfZGVmc2ZvbnRfc2ZvbnRfZGVsZXRlehZfZGVsZXRlX2ZsdWlkX2RlZnNmb250exRfZmx1aWRfZGVmc2ZvbnRfbG9hZHweX2R5bmFtaWNfc2FtcGxlc19zYW1wbGVfbm90aWZ5fSNfZmx1aWRfZGVmc2ZvbnRfbG9hZF9hbGxfc2FtcGxlZGF0YX4dX2ZsdWlkX2RlZnByZXNldF9pbXBvcnRfc2ZvbnR/IF9mbHVpZF9kZWZwcmVzZXRfcHJlc2V0X2dldF9uYW1lgAEjX2ZsdWlkX2RlZnByZXNldF9wcmVzZXRfZ2V0X2JhbmtudW2BAR9fZmx1aWRfZGVmcHJlc2V0X3ByZXNldF9nZXRfbnVtggEeX2ZsdWlkX2RlZnByZXNldF9wcmVzZXRfbm90ZW9ugwEeX2ZsdWlkX2RlZnByZXNldF9wcmVzZXRfZGVsZXRlhAEeX2R5bmFtaWNfc2FtcGxlc19wcmVzZXRfbm90aWZ5hQEXX2RlbGV0ZV9mbHVpZF9kZWZwcmVzZXSGARdfZmx1aWRfZGVmcHJlc2V0X25vdGVvbocBFl9uZXdfZmx1aWRfcHJlc2V0X3pvbmWIAR9fZmx1aWRfcHJlc2V0X3pvbmVfaW1wb3J0X3Nmb250iQEYX2ZsdWlkX2luc3RfaW1wb3J0X3Nmb250igEUX25ld19mbHVpZF9pbnN0X3pvbmWLAR1fZmx1aWRfaW5zdF96b25lX2ltcG9ydF9zZm9udIwBEl9kZWxldGVfZmx1aWRfaW5zdI0BGF9mbHVpZF96b25lX2luc2lkZV9yYW5nZY4BDl9kZWZhdWx0X2ZvcGVujwEPX2RlZmF1bHRfZmNsb3NlkAEOX2RlZmF1bHRfZnRlbGyRAQtfc2FmZV9mcmVhZJIBC19zYWZlX2ZzZWVrkwETX25ld19mbHVpZF9zZmxvYWRlcpQBHV9mbHVpZF9zZmxvYWRlcl9zZXRfY2FsbGJhY2tzlQEWX2RlbGV0ZV9mbHVpZF9zZmxvYWRlcpYBGF9mbHVpZF9zZmxvYWRlcl9zZXRfZGF0YZcBGF9mbHVpZF9zZmxvYWRlcl9nZXRfZGF0YZgBEF9uZXdfZmx1aWRfc2ZvbnSZARNfZmx1aWRfc2ZvbnRfZ2V0X2lkmgEVX2ZsdWlkX3Nmb250X2dldF9uYW1lmwEXX2ZsdWlkX3Nmb250X2dldF9wcmVzZXScARxfZmx1aWRfc2ZvbnRfaXRlcmF0aW9uX3N0YXJ0nQEbX2ZsdWlkX3Nmb250X2l0ZXJhdGlvbl9uZXh0ngETX2RlbGV0ZV9mbHVpZF9zZm9udJ8BEV9uZXdfZmx1aWRfcHJlc2V0oAEWX2ZsdWlkX3ByZXNldF9nZXRfbmFtZaEBGV9mbHVpZF9wcmVzZXRfZ2V0X2JhbmtudW2iARFfbmV3X2ZsdWlkX3NhbXBsZaMBFF9kZWxldGVfZmx1aWRfc2FtcGxlpAEUX2ZsdWlkX3NhbXBsZV9zaXplb2alARZfZmx1aWRfc2FtcGxlX3NldF9uYW1lpgEcX2ZsdWlkX3NhbXBsZV9zZXRfc291bmRfZGF0YacBFl9mbHVpZF9zYW1wbGVfc2V0X2xvb3CoARdfZmx1aWRfc2FtcGxlX3NldF9waXRjaKkBFl9mbHVpZF9zYW1wbGVfdmFsaWRhdGWqARtfZmx1aWRfc2FtcGxlX3Nhbml0aXplX2xvb3CrARJfZmx1aWRfc2ZmaWxlX29wZW6sAQhfY2h1bmtpZK0BE19mbHVpZF9zZmZpbGVfY2xvc2WuARtfZmx1aWRfc2ZmaWxlX3BhcnNlX3ByZXNldHOvARRfcHJlc2V0X2NvbXBhcmVfZnVuY7ABHl9mbHVpZF9zZmZpbGVfcmVhZF9zYW1wbGVfZGF0YbEBF19mbHVpZF9zYW1wbGVjYWNoZV9sb2FksgEZX2ZsdWlkX3NhbXBsZWNhY2hlX3VubG9hZLMBGF9mbHVpZF9hZHNyX2Vudl9zZXRfZGF0YbQBEV9uZXdfZmx1aWRfY2hvcnVztQEUX2RlbGV0ZV9mbHVpZF9jaG9ydXO2ARNfZmx1aWRfY2hvcnVzX3Jlc2V0twERX2ZsdWlkX2Nob3J1c19zZXS4ARhfZmx1aWRfY2hvcnVzX3Byb2Nlc3NtaXi5ARxfZmx1aWRfY2hvcnVzX3Byb2Nlc3NyZXBsYWNlugEXX2ZsdWlkX2lpcl9maWx0ZXJfYXBwbHm7ARZfZmx1aWRfaWlyX2ZpbHRlcl9pbml0vAEXX2ZsdWlkX2lpcl9maWx0ZXJfcmVzZXS9ARpfZmx1aWRfaWlyX2ZpbHRlcl9zZXRfZnJlc74BF19mbHVpZF9paXJfZmlsdGVyX3NldF9xvwEWX2ZsdWlkX2lpcl9maWx0ZXJfY2FsY8ABE19mbHVpZF9sZm9fc2V0X2luY3LBARRfZmx1aWRfbGZvX3NldF9kZWxhecIBE19mbHVpZF9ydm9pY2Vfd3JpdGXDAR1fZmx1aWRfcnZvaWNlX2J1ZmZlcnNfc2V0X2FtcMQBIV9mbHVpZF9ydm9pY2VfYnVmZmVyc19zZXRfbWFwcGluZ8UBE19mbHVpZF9ydm9pY2VfcmVzZXTGARVfZmx1aWRfcnZvaWNlX25vdGVvZmbHASRfZmx1aWRfcnZvaWNlX211bHRpX3JldHJpZ2dlcl9hdHRhY2vIARxfZmx1aWRfcnZvaWNlX3NldF9wb3J0YW1lbnRvyQEdX2ZsdWlkX3J2b2ljZV9zZXRfb3V0cHV0X3JhdGXKAR9fZmx1aWRfcnZvaWNlX3NldF9pbnRlcnBfbWV0aG9kywEfX2ZsdWlkX3J2b2ljZV9zZXRfcm9vdF9waXRjaF9oeswBF19mbHVpZF9ydm9pY2Vfc2V0X3BpdGNozQEdX2ZsdWlkX3J2b2ljZV9zZXRfYXR0ZW51YXRpb27OASRfZmx1aWRfcnZvaWNlX3NldF9taW5fYXR0ZW51YXRpb25fY0LPASFfZmx1aWRfcnZvaWNlX3NldF92aWJsZm9fdG9fcGl0Y2jQASFfZmx1aWRfcnZvaWNlX3NldF9tb2RsZm9fdG9fcGl0Y2jRAR9fZmx1aWRfcnZvaWNlX3NldF9tb2RsZm9fdG9fdm9s0gEeX2ZsdWlkX3J2b2ljZV9zZXRfbW9kbGZvX3RvX2Zj0wEeX2ZsdWlkX3J2b2ljZV9zZXRfbW9kZW52X3RvX2Zj1AEhX2ZsdWlkX3J2b2ljZV9zZXRfbW9kZW52X3RvX3BpdGNo1QEcX2ZsdWlkX3J2b2ljZV9zZXRfc3ludGhfZ2FpbtYBF19mbHVpZF9ydm9pY2Vfc2V0X3N0YXJ01wEVX2ZsdWlkX3J2b2ljZV9zZXRfZW5k2AEbX2ZsdWlkX3J2b2ljZV9zZXRfbG9vcHN0YXJ02QEZX2ZsdWlkX3J2b2ljZV9zZXRfbG9vcGVuZNoBHF9mbHVpZF9ydm9pY2Vfc2V0X3NhbXBsZW1vZGXbARhfZmx1aWRfcnZvaWNlX3NldF9zYW1wbGXcARZfZmx1aWRfcnZvaWNlX3ZvaWNlb2Zm3QEYX2ZsdWlkX3J2b2ljZV9kc3BfY29uZmln3gEiX2ZsdWlkX3J2b2ljZV9kc3BfaW50ZXJwb2xhdGVfbm9uZd8BJF9mbHVpZF9ydm9pY2VfZHNwX2ludGVycG9sYXRlX2xpbmVhcuABJ19mbHVpZF9ydm9pY2VfZHNwX2ludGVycG9sYXRlXzR0aF9vcmRlcuEBJ19mbHVpZF9ydm9pY2VfZHNwX2ludGVycG9sYXRlXzd0aF9vcmRlcuIBKF9mbHVpZF9ydm9pY2VfZXZlbnRoYW5kbGVyX3B1c2hfaW50X3JlYWzjAR9fZmx1aWRfcnZvaWNlX2V2ZW50aGFuZGxlcl9wdXNo5AEjX2ZsdWlkX3J2b2ljZV9ldmVudGhhbmRsZXJfcHVzaF9wdHLlATJfZmx1aWRfcnZvaWNlX2V2ZW50aGFuZGxlcl9maW5pc2hlZF92b2ljZV9jYWxsYmFja+YBHl9uZXdfZmx1aWRfcnZvaWNlX2V2ZW50aGFuZGxlcucBIV9kZWxldGVfZmx1aWRfcnZvaWNlX2V2ZW50aGFuZGxlcugBKV9mbHVpZF9ydm9pY2VfZXZlbnRoYW5kbGVyX2Rpc3BhdGNoX2NvdW506QEnX2ZsdWlkX3J2b2ljZV9ldmVudGhhbmRsZXJfZGlzcGF0Y2hfYWxs6gEdX2ZsdWlkX3J2b2ljZV9taXhlcl9hZGRfdm9pY2XrASFfZmx1aWRfcnZvaWNlX21peGVyX3NldF9wb2x5cGhvbnnsASJfZmx1aWRfcnZvaWNlX21peGVyX3NldF9zYW1wbGVyYXRl7QEXX25ld19mbHVpZF9ydm9pY2VfbWl4ZXLuARpfZGVsZXRlX2ZsdWlkX3J2b2ljZV9taXhlcu8BJl9mbHVpZF9ydm9pY2VfbWl4ZXJfc2V0X3JldmVyYl9lbmFibGVk8AEmX2ZsdWlkX3J2b2ljZV9taXhlcl9zZXRfY2hvcnVzX2VuYWJsZWTxAR5fZmx1aWRfcnZvaWNlX21peGVyX3NldF9taXhfZnjyASVfZmx1aWRfcnZvaWNlX21peGVyX3NldF9jaG9ydXNfcGFyYW1z8wElX2ZsdWlkX3J2b2ljZV9taXhlcl9zZXRfcmV2ZXJiX3BhcmFtc/QBIF9mbHVpZF9ydm9pY2VfbWl4ZXJfcmVzZXRfcmV2ZXJi9QEgX2ZsdWlkX3J2b2ljZV9taXhlcl9yZXNldF9jaG9ydXP2ARxfZmx1aWRfcnZvaWNlX21peGVyX2dldF9idWZz9wEfX2ZsdWlkX3J2b2ljZV9taXhlcl9nZXRfZnhfYnVmc/gBIF9mbHVpZF9ydm9pY2VfbWl4ZXJfZ2V0X2J1ZmNvdW50+QEaX2ZsdWlkX3J2b2ljZV9taXhlcl9yZW5kZXL6AR9fZmx1aWRfcmVuZGVyX2xvb3Bfc2luZ2xldGhyZWFk+wETX25ld19mbHVpZF9yZXZtb2RlbPwBG19mbHVpZF9zZXRfcmV2bW9kZWxfYnVmZmVyc/0BFF9mbHVpZF9yZXZtb2RlbF9pbml0/gEWX2RlbGV0ZV9mbHVpZF9yZXZtb2RlbP8BFV9mbHVpZF9yZXZtb2RlbF9yZXNldIACHl9mbHVpZF9yZXZtb2RlbF9wcm9jZXNzcmVwbGFjZYECGl9mbHVpZF9yZXZtb2RlbF9wcm9jZXNzbWl4ggITX2ZsdWlkX3Jldm1vZGVsX3NldIMCIV9mbHVpZF9yZXZtb2RlbF9zYW1wbGVyYXRlX2NoYW5nZYQCEl9uZXdfZmx1aWRfY2hhbm5lbIUCE19mbHVpZF9jaGFubmVsX2luaXSGAhhfZmx1aWRfY2hhbm5lbF9pbml0X2N0cmyHAhRfZmx1aWRfY2hhbm5lbF9yZXNldIgCGV9mbHVpZF9jaGFubmVsX3NldF9wcmVzZXSJAiJfZmx1aWRfY2hhbm5lbF9zZXRfc2ZvbnRfYmFua19wcm9nigIbX2ZsdWlkX2NoYW5uZWxfc2V0X2JhbmtfbHNiiwIbX2ZsdWlkX2NoYW5uZWxfc2V0X2JhbmtfbXNijAIiX2ZsdWlkX2NoYW5uZWxfZ2V0X3Nmb250X2JhbmtfcHJvZ40CG19mbHVpZF9jaGFubmVsX2FkZF9tb25vbGlzdI4CHl9mbHVpZF9jaGFubmVsX3NlYXJjaF9tb25vbGlzdI8CHl9mbHVpZF9jaGFubmVsX3JlbW92ZV9tb25vbGlzdJACHV9mbHVpZF9jaGFubmVsX2NsZWFyX21vbm9saXN0kQIjX2ZsdWlkX2NoYW5uZWxfc2V0X29uZW5vdGVfbW9ub2xpc3SSAilfZmx1aWRfY2hhbm5lbF9pbnZhbGlkX3ByZXZfbm90ZV9zdGFjY2F0b5MCGF9mbHVpZF9jaGFubmVsX2NjX2xlZ2F0b5QCJF9mbHVpZF9jaGFubmVsX2NjX2JyZWF0aF9ub3RlX29uX29mZpUCEl9mbHVpZF9ldmVudF9jbGVhcpYCEF9uZXdfZmx1aWRfZXZlbnSXAhVfZmx1aWRfZXZlbnRfc2V0X3RpbWWYAhdfZmx1aWRfZXZlbnRfc2V0X3NvdXJjZZkCFV9mbHVpZF9ldmVudF9zZXRfZGVzdJoCEl9mbHVpZF9ldmVudF90aW1lcpsCE19mbHVpZF9ldmVudF9ub3Rlb26cAhRfZmx1aWRfZXZlbnRfbm90ZW9mZp0CEV9mbHVpZF9ldmVudF9ub3RlngIbX2ZsdWlkX2V2ZW50X2FsbF9zb3VuZHNfb2ZmnwIaX2ZsdWlkX2V2ZW50X2FsbF9ub3Rlc19vZmagAhhfZmx1aWRfZXZlbnRfYmFua19zZWxlY3ShAhtfZmx1aWRfZXZlbnRfcHJvZ3JhbV9jaGFuZ2WiAhtfZmx1aWRfZXZlbnRfcHJvZ3JhbV9zZWxlY3SjAh9fZmx1aWRfZXZlbnRfYW55X2NvbnRyb2xfY2hhbmdlpAIXX2ZsdWlkX2V2ZW50X3BpdGNoX2JlbmSlAhxfZmx1aWRfZXZlbnRfcGl0Y2hfd2hlZWxzZW5zpgIXX2ZsdWlkX2V2ZW50X21vZHVsYXRpb26nAhRfZmx1aWRfZXZlbnRfc3VzdGFpbqgCG19mbHVpZF9ldmVudF9jb250cm9sX2NoYW5nZakCEF9mbHVpZF9ldmVudF9wYW6qAhNfZmx1aWRfZXZlbnRfdm9sdW1lqwIYX2ZsdWlkX2V2ZW50X3JldmVyYl9zZW5krAIYX2ZsdWlkX2V2ZW50X2Nob3J1c19zZW5krQIaX2ZsdWlkX2V2ZW50X3VucmVnaXN0ZXJpbmeuAh1fZmx1aWRfZXZlbnRfY2hhbm5lbF9wcmVzc3VyZa8CGV9mbHVpZF9ldmVudF9rZXlfcHJlc3N1cmWwAhlfZmx1aWRfZXZlbnRfc3lzdGVtX3Jlc2V0sQIXX2ZsdWlkX2V2ZW50X2dldF9zb3VyY2WyAhVfZmx1aWRfZXZlbnRfZ2V0X2Rlc3SzAhhfZmx1aWRfZXZlbnRfZ2V0X2NoYW5uZWy0AhRfZmx1aWRfZXZlbnRfZ2V0X2tlebUCGV9mbHVpZF9ldmVudF9nZXRfdmVsb2NpdHm2AhhfZmx1aWRfZXZlbnRfZ2V0X2NvbnRyb2y3AhZfZmx1aWRfZXZlbnRfZ2V0X3ZhbHVluAIVX2ZsdWlkX2V2ZW50X2dldF9kYXRhuQIZX2ZsdWlkX2V2ZW50X2dldF9kdXJhdGlvbroCFl9mbHVpZF9ldmVudF9nZXRfcGl0Y2i7AhVfX2ZsdWlkX2V2dF9oZWFwX2luaXS8AhVfX2ZsdWlkX2V2dF9oZWFwX2ZyZWW9AhlfX2ZsdWlkX3NlcV9oZWFwX2dldF9mcmVlvgIZX19mbHVpZF9zZXFfaGVhcF9zZXRfZnJlZb8CHV9mbHVpZF9nZW5fc2V0X2RlZmF1bHRfdmFsdWVzwAIPX2ZsdWlkX2dlbl9pbml0wQIVX2ZsdWlkX2dlbl9zY2FsZV9ucnBuwgIQX2ZsdWlkX21vZF9jbG9uZcMCFl9mbHVpZF9tb2Rfc2V0X3NvdXJjZTHEAhZfZmx1aWRfbW9kX3NldF9zb3VyY2UyxQITX2ZsdWlkX21vZF9zZXRfZGVzdMYCFV9mbHVpZF9tb2Rfc2V0X2Ftb3VudMcCFl9mbHVpZF9tb2RfZ2V0X3NvdXJjZTHIAhVfZmx1aWRfbW9kX2dldF9mbGFnczHJAhZfZmx1aWRfbW9kX2dldF9zb3VyY2UyygIVX2ZsdWlkX21vZF9nZXRfZmxhZ3MyywITX2ZsdWlkX21vZF9nZXRfZGVzdMwCFV9mbHVpZF9tb2RfZ2V0X2Ftb3VudM0CFF9mbHVpZF9tb2RfZ2V0X3ZhbHVlzgIbX2ZsdWlkX21vZF9nZXRfc291cmNlX3ZhbHVlzwIhX2ZsdWlkX21vZF90cmFuc2Zvcm1fc291cmNlX3ZhbHVl0AIYX2ZsdWlkX21vZF90ZXN0X2lkZW50aXR50QIOX25ld19mbHVpZF9tb2TSAhFfZmx1aWRfbW9kX3NpemVvZtMCFV9mbHVpZF9tb2RfaGFzX3NvdXJjZdQCE19mbHVpZF9tb2RfaGFzX2Rlc3TVAhVfZmx1aWRfc3ludGhfc2V0dGluZ3PWAg5fZmx1aWRfdmVyc2lvbtcCEl9mbHVpZF92ZXJzaW9uX3N0ctgCF19uZXdfZmx1aWRfc2FtcGxlX3RpbWVy2QIaX2RlbGV0ZV9mbHVpZF9zYW1wbGVfdGltZXLaAhBfbmV3X2ZsdWlkX3N5bnRo2wIfX2ZsdWlkX3N5bnRoX2hhbmRsZV9zYW1wbGVfcmF0ZdwCGF9mbHVpZF9zeW50aF9oYW5kbGVfZ2Fpbt0CHV9mbHVpZF9zeW50aF9oYW5kbGVfcG9seXBob2553gIdX2ZsdWlkX3N5bnRoX2hhbmRsZV9kZXZpY2VfaWTfAhxfZmx1aWRfc3ludGhfaGFuZGxlX292ZXJmbG934AImX2ZsdWlkX3N5bnRoX2hhbmRsZV9pbXBvcnRhbnRfY2hhbm5lbHPhAiVfZmx1aWRfc3ludGhfaGFuZGxlX3JldmVyYl9jaG9ydXNfbnVt4gIlX2ZsdWlkX3N5bnRoX2hhbmRsZV9yZXZlcmJfY2hvcnVzX2ludOMCI19mbHVpZF9zeW50aF9zZXRfaW1wb3J0YW50X2NoYW5uZWxz5AIcX2ZsdWlkX3N5bnRoX2FkZF9kZWZhdWx0X21vZOUCFl9mbHVpZF9zeW50aF9hcGlfZW50ZXLmAiBfZmx1aWRfc3ludGhfYWxsX25vdGVzX29mZl9MT0NBTOcCE19kZWxldGVfZmx1aWRfc3ludGjoAhpfZmx1aWRfc3ludGhfc2V0X3BvbHlwaG9ueekCFV9mbHVpZF9zeW50aF9zZXRfZ2FpbuoCHF9mbHVpZF9zeW50aF9zZXRfc2FtcGxlX3JhdGXrAhlfZmx1aWRfc3ludGhfYWRkX3NmbG9hZGVy7AIaX2ZsdWlkX3N5bnRoX3NldF9yZXZlcmJfb27tAhpfZmx1aWRfc3ludGhfc2V0X2Nob3J1c19vbu4CEl9mbHVpZF9zeW50aF9lcnJvcu8CE19mbHVpZF9zeW50aF9ub3Rlb27wAi1fZmx1aWRfc3ludGhfcmVsZWFzZV92b2ljZV9vbl9zYW1lX25vdGVfTE9DQUzxAhRfZmx1aWRfc3ludGhfbm90ZW9mZvICH19mbHVpZF9zeW50aF9yZW1vdmVfZGVmYXVsdF9tb2TzAg9fZmx1aWRfc3ludGhfY2P0AhVfZmx1aWRfc3ludGhfY2NfTE9DQUz1AiFfZmx1aWRfc3ludGhfYWxsX3NvdW5kc19vZmZfTE9DQUz2AhxfZmx1aWRfc3ludGhfYWN0aXZhdGVfdHVuaW5n9wIgX2ZsdWlkX3N5bnRoX3JlcGxhY2VfdHVuaW5nX0xPQ0v4AhNfZmx1aWRfc3ludGhfZ2V0X2Nj+QISX2ZsdWlkX3N5bnRoX3N5c2V4+gIYX2ZsdWlkX3N5bnRoX3R1bmluZ19kdW1w+wIXX2ZsdWlkX3N5bnRoX3R1bmVfbm90ZXP8AiNfZmx1aWRfc3ludGhfYWN0aXZhdGVfb2N0YXZlX3R1bmluZ/0CGl9mbHVpZF9zeW50aF9hbGxfbm90ZXNfb2Zm/gIbX2ZsdWlkX3N5bnRoX2FsbF9zb3VuZHNfb2Zm/wIZX2ZsdWlkX3N5bnRoX3N5c3RlbV9yZXNldIADHl9mbHVpZF9zeW50aF9zZXRfYmFzaWNfY2hhbm5lbIEDHV9mbHVpZF9zeW50aF9jaGFubmVsX3ByZXNzdXJlggMZX2ZsdWlkX3N5bnRoX2tleV9wcmVzc3VyZYMDF19mbHVpZF9zeW50aF9waXRjaF9iZW5khAMbX2ZsdWlkX3N5bnRoX2dldF9waXRjaF9iZW5khQMdX2ZsdWlkX3N5bnRoX3BpdGNoX3doZWVsX3NlbnOGAyFfZmx1aWRfc3ludGhfZ2V0X3BpdGNoX3doZWVsX3NlbnOHAxhfZmx1aWRfc3ludGhfZmluZF9wcmVzZXSIAxtfZmx1aWRfc3ludGhfcHJvZ3JhbV9jaGFuZ2WJAxhfZmx1aWRfc3ludGhfYmFua19zZWxlY3SKAxlfZmx1aWRfc3ludGhfc2ZvbnRfc2VsZWN0iwMaX2ZsdWlkX3N5bnRoX3Vuc2V0X3Byb2dyYW2MAxhfZmx1aWRfc3ludGhfZ2V0X3Byb2dyYW2NAxtfZmx1aWRfc3ludGhfcHJvZ3JhbV9zZWxlY3SOAylfZmx1aWRfc3ludGhfcHJvZ3JhbV9zZWxlY3RfYnlfc2ZvbnRfbmFtZY8DFV9mbHVpZF9zeW50aF9nZXRfZ2FpbpADGl9mbHVpZF9zeW50aF9nZXRfcG9seXBob255kQMjX2ZsdWlkX3N5bnRoX2dldF9hY3RpdmVfdm9pY2VfY291bnSSAyFfZmx1aWRfc3ludGhfZ2V0X2ludGVybmFsX2J1ZnNpemWTAxpfZmx1aWRfc3ludGhfcHJvZ3JhbV9yZXNldJQDGV9mbHVpZF9zeW50aF9ud3JpdGVfZmxvYXSVAxpfZmx1aWRfc3ludGhfcmVuZGVyX2Jsb2Nrc5YDFF9mbHVpZF9zeW50aF9wcm9jZXNzlwMYX2ZsdWlkX3N5bnRoX3dyaXRlX2Zsb2F0mAMWX2ZsdWlkX3N5bnRoX3dyaXRlX3MxNpkDGF9mbHVpZF9zeW50aF9hbGxvY192b2ljZZoDHl9mbHVpZF9zeW50aF9hbGxvY192b2ljZV9MT0NBTJsDGF9mbHVpZF9zeW50aF9zdGFydF92b2ljZZwDE19mbHVpZF9zeW50aF9zZmxvYWSdAxVfZmx1aWRfc3ludGhfc2Z1bmxvYWSeAxtfZmx1aWRfc3ludGhfdXBkYXRlX3ByZXNldHOfAx5fZmx1aWRfc3ludGhfc2Z1bmxvYWRfY2FsbGJhY2ugAxVfZmx1aWRfc3ludGhfc2ZyZWxvYWShAxZfZmx1aWRfc3ludGhfYWRkX3Nmb250ogMZX2ZsdWlkX3N5bnRoX3JlbW92ZV9zZm9udKMDFF9mbHVpZF9zeW50aF9zZmNvdW50pAMWX2ZsdWlkX3N5bnRoX2dldF9zZm9udKUDHF9mbHVpZF9zeW50aF9nZXRfc2ZvbnRfYnlfaWSmAx5fZmx1aWRfc3ludGhfZ2V0X3Nmb250X2J5X25hbWWnAx9fZmx1aWRfc3ludGhfZ2V0X2NoYW5uZWxfcHJlc2V0qAMaX2ZsdWlkX3N5bnRoX2dldF92b2ljZWxpc3SpAxdfZmx1aWRfc3ludGhfc2V0X3JldmVyYqoDIF9mbHVpZF9zeW50aF9zZXRfcmV2ZXJiX3Jvb21zaXplqwMcX2ZsdWlkX3N5bnRoX3NldF9yZXZlcmJfZGFtcKwDHV9mbHVpZF9zeW50aF9zZXRfcmV2ZXJiX3dpZHRorQMdX2ZsdWlkX3N5bnRoX3NldF9yZXZlcmJfbGV2ZWyuAyBfZmx1aWRfc3ludGhfZ2V0X3JldmVyYl9yb29tc2l6Za8DHF9mbHVpZF9zeW50aF9nZXRfcmV2ZXJiX2RhbXCwAx1fZmx1aWRfc3ludGhfZ2V0X3JldmVyYl9sZXZlbLEDHV9mbHVpZF9zeW50aF9nZXRfcmV2ZXJiX3dpZHRosgMXX2ZsdWlkX3N5bnRoX3NldF9jaG9ydXOzAxpfZmx1aWRfc3ludGhfc2V0X2Nob3J1c19ucrQDHV9mbHVpZF9zeW50aF9zZXRfY2hvcnVzX2xldmVstQMdX2ZsdWlkX3N5bnRoX3NldF9jaG9ydXNfc3BlZWS2Ax1fZmx1aWRfc3ludGhfc2V0X2Nob3J1c19kZXB0aLcDHF9mbHVpZF9zeW50aF9zZXRfY2hvcnVzX3R5cGW4AxpfZmx1aWRfc3ludGhfZ2V0X2Nob3J1c19ucrkDHV9mbHVpZF9zeW50aF9nZXRfY2hvcnVzX2xldmVsugMdX2ZsdWlkX3N5bnRoX2dldF9jaG9ydXNfc3BlZWS7Ax1fZmx1aWRfc3ludGhfZ2V0X2Nob3J1c19kZXB0aLwDHF9mbHVpZF9zeW50aF9nZXRfY2hvcnVzX3R5cGW9Ax5fZmx1aWRfc3ludGhfc2V0X2ludGVycF9tZXRob2S+AyBfZmx1aWRfc3ludGhfY291bnRfbWlkaV9jaGFubmVsc78DIV9mbHVpZF9zeW50aF9jb3VudF9hdWRpb19jaGFubmVsc8ADH19mbHVpZF9zeW50aF9jb3VudF9hdWRpb19ncm91cHPBAyNfZmx1aWRfc3ludGhfY291bnRfZWZmZWN0c19jaGFubmVsc8IDIV9mbHVpZF9zeW50aF9jb3VudF9lZmZlY3RzX2dyb3Vwc8MDGV9mbHVpZF9zeW50aF9nZXRfY3B1X2xvYWTEAyBfZmx1aWRfc3ludGhfYWN0aXZhdGVfa2V5X3R1bmluZ8UDHl9mbHVpZF9zeW50aF9kZWFjdGl2YXRlX3R1bmluZ8YDI19mbHVpZF9zeW50aF90dW5pbmdfaXRlcmF0aW9uX3N0YXJ0xwMiX2ZsdWlkX3N5bnRoX3R1bmluZ19pdGVyYXRpb25fbmV4dMgDGV9mbHVpZF9zeW50aF9nZXRfc2V0dGluZ3PJAxRfZmx1aWRfc3ludGhfc2V0X2dlbsoDFV9mbHVpZF9zeW50aF9zZXRfZ2VuMssDFF9mbHVpZF9zeW50aF9nZXRfZ2VuzAMeX2ZsdWlkX3N5bnRoX2hhbmRsZV9taWRpX2V2ZW50zQMSX2ZsdWlkX3N5bnRoX3N0YXJ0zgMRX2ZsdWlkX3N5bnRoX3N0b3DPAxxfZmx1aWRfc3ludGhfc2V0X2Jhbmtfb2Zmc2V00AMcX2ZsdWlkX3N5bnRoX2dldF9iYW5rX29mZnNldNEDHV9mbHVpZF9zeW50aF9zZXRfY2hhbm5lbF90eXBl0gMaX2ZsdWlkX3N5bnRoX2dldF9sYWRzcGFfZnjTAx5fZmx1aWRfc3ludGhfc2V0X2N1c3RvbV9maWx0ZXLUAxxfZmx1aWRfc3ludGhfc2V0X2xlZ2F0b19tb2Rl1QMcX2ZsdWlkX3N5bnRoX2dldF9sZWdhdG9fbW9kZdYDIF9mbHVpZF9zeW50aF9zZXRfcG9ydGFtZW50b19tb2Rl1wMgX2ZsdWlkX3N5bnRoX2dldF9wb3J0YW1lbnRvX21vZGXYAxxfZmx1aWRfc3ludGhfc2V0X2JyZWF0aF9tb2Rl2QMcX2ZsdWlkX3N5bnRoX2dldF9icmVhdGhfbW9kZdoDIF9mbHVpZF9zeW50aF9yZXNldF9iYXNpY19jaGFubmVs2wMeX2ZsdWlkX3N5bnRoX2dldF9iYXNpY19jaGFubmVs3AMeX2ZsdWlkX3N5bnRoX25vdGVvbl9tb25vX0xPQ0FM3QMjX2ZsdWlkX3N5bnRoX25vdGVvbl9tb25vcG9seV9sZWdhdG/eAyFfZmx1aWRfc3ludGhfbm90ZW9uX21vbm9fc3RhY2NhdG/fAx9fZmx1aWRfc3ludGhfbm90ZW9mZl9tb25vX0xPQ0FM4AMdX2ZsdWlkX3N5bnRoX25vdGVvZmZfbW9ub3BvbHnhAxFfbmV3X2ZsdWlkX3R1bmluZ+IDF19mbHVpZF90dW5pbmdfZHVwbGljYXRl4wMRX2ZsdWlkX3R1bmluZ19yZWbkAxNfZmx1aWRfdHVuaW5nX3VucmVm5QMWX2ZsdWlkX3R1bmluZ19nZXRfbmFtZeYDGF9mbHVpZF90dW5pbmdfc2V0X29jdGF2ZecDFV9mbHVpZF90dW5pbmdfc2V0X2FsbOgDF19mbHVpZF90dW5pbmdfc2V0X3BpdGNo6QMQX25ld19mbHVpZF92b2ljZeoDHl9mbHVpZF92b2ljZV9pbml0aWFsaXplX3J2b2ljZesDE19kZWxldGVfZmx1aWRfdm9pY2XsAxFfZmx1aWRfdm9pY2VfaW5pdO0DEF9mbHVpZF92b2ljZV9vZmbuAxxfZmx1aWRfdm9pY2Vfc2V0X291dHB1dF9yYXRl7wMXX2ZsdWlkX3ZvaWNlX2lzX3BsYXlpbmfwAxRfZmx1aWRfdm9pY2VfZ2VuX3NldPEDFV9mbHVpZF92b2ljZV9nZW5faW5jcvIDFF9mbHVpZF92b2ljZV9nZW5fZ2V08wMWX2ZsdWlkX3ZvaWNlX2dlbl92YWx1ZfQDEl9mbHVpZF92b2ljZV9zdGFydPUDGV9mbHVpZF92b2ljZV91cGRhdGVfcGFyYW32Ax5fZmx1aWRfdm9pY2VfdXBkYXRlX3BvcnRhbWVudG/3AyBfZmx1aWRfdm9pY2VfY2FsY3VsYXRlX2dlbl9waXRjaPgDG19mbHVpZF92b2ljZV9nZXRfYWN0dWFsX2tlefkDFV9mbHVpZF92b2ljZV9tb2R1bGF0ZfoDGV9mbHVpZF92b2ljZV9tb2R1bGF0ZV9hbGz7AypfZmx1aWRfdm9pY2VfdXBkYXRlX211bHRpX3JldHJpZ2dlcl9hdHRhY2v8AxRfZmx1aWRfdm9pY2VfcmVsZWFzZf0DFF9mbHVpZF92b2ljZV9ub3Rlb2Zm/gMWX2ZsdWlkX3ZvaWNlX2tpbGxfZXhjbP8DJV9mbHVpZF92b2ljZV9vdmVyZmxvd19ydm9pY2VfZmluaXNoZWSABBFfZmx1aWRfdm9pY2Vfc3RvcIEEFF9mbHVpZF92b2ljZV9hZGRfbW9kggQZX2ZsdWlkX3ZvaWNlX2lzX3N1c3RhaW5lZIMEGV9mbHVpZF92b2ljZV9pc19zb3N0ZW51dG+EBBJfZmx1aWRfdm9pY2VfaXNfb26FBBhfZmx1aWRfdm9pY2VfZ2V0X2NoYW5uZWyGBBRfZmx1aWRfdm9pY2VfZ2V0X2tleYcEIF9mbHVpZF92b2ljZV9nZXRfYWN0dWFsX3ZlbG9jaXR5iAQZX2ZsdWlkX3ZvaWNlX2dldF92ZWxvY2l0eYkEFl9mbHVpZF92b2ljZV9zZXRfcGFyYW2KBBVfZmx1aWRfdm9pY2Vfc2V0X2dhaW6LBBxfZmx1aWRfdm9pY2Vfb3B0aW1pemVfc2FtcGxljAQeX2ZsdWlkX3ZvaWNlX2dldF9vdmVyZmxvd19wcmlvjQQeX2ZsdWlkX3ZvaWNlX3NldF9jdXN0b21fZmlsdGVyjgQVX25ld19mbHVpZF9taWRpX2V2ZW50jwQYX2RlbGV0ZV9mbHVpZF9taWRpX2V2ZW50kAQaX2ZsdWlkX21pZGlfZXZlbnRfZ2V0X3R5cGWRBBpfZmx1aWRfbWlkaV9ldmVudF9zZXRfdHlwZZIEHV9mbHVpZF9taWRpX2V2ZW50X2dldF9jaGFubmVskwQdX2ZsdWlkX21pZGlfZXZlbnRfc2V0X2NoYW5uZWyUBBlfZmx1aWRfbWlkaV9ldmVudF9zZXRfa2V5lQQeX2ZsdWlkX21pZGlfZXZlbnRfZ2V0X3ZlbG9jaXR5lgQeX2ZsdWlkX21pZGlfZXZlbnRfc2V0X3ZlbG9jaXR5lwQbX2ZsdWlkX21pZGlfZXZlbnRfc2V0X3N5c2V4mAQaX2ZsdWlkX21pZGlfZXZlbnRfc2V0X3RleHSZBBxfZmx1aWRfbWlkaV9ldmVudF9zZXRfbHlyaWNzmgQRX25ld19mbHVpZF9wbGF5ZXKbBCBfZmx1aWRfcGxheWVyX2hhbmRsZV9yZXNldF9zeW50aJwEI19mbHVpZF9wbGF5ZXJfc2V0X3BsYXliYWNrX2NhbGxiYWNrnQQUX2RlbGV0ZV9mbHVpZF9wbGF5ZXKeBBJfZmx1aWRfcGxheWVyX3N0b3CfBBZfZmx1aWRfcGxheWVyX3NldHRpbmdzoAQRX2ZsdWlkX3BsYXllcl9hZGShBBVfZmx1aWRfcGxheWVyX2FkZF9tZW2iBBJfZmx1aWRfcGxheWVyX3BsYXmjBBZfZmx1aWRfcGxheWVyX2NhbGxiYWNrpAQcX2ZsdWlkX21pZGlfZmlsZV9yZWFkX3ZhcmxlbqUEEl9mbHVpZF9wbGF5ZXJfc2Vla6YEHV9mbHVpZF9wbGF5ZXJfZ2V0X3RvdGFsX3RpY2tzpwQWX2ZsdWlkX3BsYXllcl9zZXRfbG9vcKgEHF9mbHVpZF9wbGF5ZXJfc2V0X21pZGlfdGVtcG+pBBVfZmx1aWRfcGxheWVyX3NldF9icG2qBBJfZmx1aWRfcGxheWVyX2pvaW6rBB5fZmx1aWRfcGxheWVyX2dldF9jdXJyZW50X3RpY2usBBVfZmx1aWRfcGxheWVyX2dldF9icG2tBBxfZmx1aWRfcGxheWVyX2dldF9taWRpX3RlbXBvrgQWX25ld19mbHVpZF9taWRpX3JvdXRlcq8EGV9kZWxldGVfZmx1aWRfbWlkaV9yb3V0ZXKwBBtfbmV3X2ZsdWlkX21pZGlfcm91dGVyX3J1bGWxBCRfZmx1aWRfbWlkaV9yb3V0ZXJfc2V0X2RlZmF1bHRfcnVsZXOyBB5fZmx1aWRfbWlkaV9yb3V0ZXJfY2xlYXJfcnVsZXOzBBtfZmx1aWRfbWlkaV9yb3V0ZXJfYWRkX3J1bGW0BCBfZmx1aWRfbWlkaV9yb3V0ZXJfcnVsZV9zZXRfY2hhbrUEIl9mbHVpZF9taWRpX3JvdXRlcl9ydWxlX3NldF9wYXJhbTG2BCJfZmx1aWRfbWlkaV9yb3V0ZXJfcnVsZV9zZXRfcGFyYW0ytwQkX2ZsdWlkX21pZGlfcm91dGVyX2hhbmRsZV9taWRpX2V2ZW50uAQaX2ZsdWlkX21pZGlfZHVtcF9wcmVyb3V0ZXK5BBtfZmx1aWRfbWlkaV9kdW1wX3Bvc3Ryb3V0ZXK6BCRfZmx1aWRfc2VxdWVuY2VyX3JlZ2lzdGVyX2ZsdWlkc3ludGi7BB1fZmx1aWRfc2VxYmluZF90aW1lcl9jYWxsYmFja7wEHl9mbHVpZF9zZXFfZmx1aWRzeW50aF9jYWxsYmFja70EKV9mbHVpZF9zZXF1ZW5jZXJfYWRkX21pZGlfZXZlbnRfdG9fYnVmZmVyvgQUX25ld19mbHVpZF9zZXF1ZW5jZXK/BBVfbmV3X2ZsdWlkX3NlcXVlbmNlcjLABBlfX2ZsdWlkX3NlcV9xdWV1ZV9wcm9jZXNzwQQYX2ZsdWlkX3NlcXVlbmNlcl9wcm9jZXNzwgQXX2RlbGV0ZV9mbHVpZF9zZXF1ZW5jZXLDBCJfZmx1aWRfc2VxdWVuY2VyX3VucmVnaXN0ZXJfY2xpZW50xAQlX2ZsdWlkX3NlcXVlbmNlcl9nZXRfdXNlX3N5c3RlbV90aW1lcsUEIF9mbHVpZF9zZXF1ZW5jZXJfcmVnaXN0ZXJfY2xpZW50xgQeX2ZsdWlkX3NlcXVlbmNlcl9jb3VudF9jbGllbnRzxwQeX2ZsdWlkX3NlcXVlbmNlcl9nZXRfY2xpZW50X2lkyAQgX2ZsdWlkX3NlcXVlbmNlcl9nZXRfY2xpZW50X25hbWXJBB9fZmx1aWRfc2VxdWVuY2VyX2NsaWVudF9pc19kZXN0ygQZX2ZsdWlkX3NlcXVlbmNlcl9zZW5kX25vd8sEGV9mbHVpZF9zZXF1ZW5jZXJfZ2V0X3RpY2vMBBhfZmx1aWRfc2VxdWVuY2VyX3NlbmRfYXTNBB5fZmx1aWRfc2VxdWVuY2VyX3JlbW92ZV9ldmVudHPOBB9fZmx1aWRfc2VxdWVuY2VyX3NldF90aW1lX3NjYWxlzwQfX2ZsdWlkX3NlcXVlbmNlcl9nZXRfdGltZV9zY2FsZdAEHF9mbHVpZF9hdWRpb19kcml2ZXJfc2V0dGluZ3PRBBdfbmV3X2ZsdWlkX2F1ZGlvX2RyaXZlctIEGF9maW5kX2ZsdWlkX2F1ZGlvX2RyaXZlctMEGF9uZXdfZmx1aWRfYXVkaW9fZHJpdmVyMtQEGl9kZWxldGVfZmx1aWRfYXVkaW9fZHJpdmVy1QQcX2ZsdWlkX2F1ZGlvX2RyaXZlcl9yZWdpc3RlctYEG19mbHVpZF9taWRpX2RyaXZlcl9zZXR0aW5nc9cEFl9uZXdfZmx1aWRfbWlkaV9kcml2ZXLYBBlfZGVsZXRlX2ZsdWlkX21pZGlfZHJpdmVy2QQcX25ld19mbHVpZF9maWxlX2F1ZGlvX2RyaXZlctoEGV9mbHVpZF9maWxlX2F1ZGlvX3J1bl9zMTbbBB9fZGVsZXRlX2ZsdWlkX2ZpbGVfYXVkaW9fZHJpdmVy3AQdX2ZsdWlkX2ZpbGVfcmVuZGVyZXJfc2V0dGluZ3PdBBhfbmV3X2ZsdWlkX2ZpbGVfcmVuZGVyZXLeBBtfZGVsZXRlX2ZsdWlkX2ZpbGVfcmVuZGVyZXLfBCBfZmx1aWRfZmlsZV9zZXRfZW5jb2RpbmdfcXVhbGl0eeAEIl9mbHVpZF9maWxlX3JlbmRlcmVyX3Byb2Nlc3NfYmxvY2vhBBdfZmx1aWRfbGFkc3BhX2lzX2FjdGl2ZeIEFl9mbHVpZF9sYWRzcGFfYWN0aXZhdGXjBBNfZmx1aWRfbGFkc3BhX2NoZWNr5AQeX2ZsdWlkX2xhZHNwYV9ob3N0X3BvcnRfZXhpc3Rz5QQYX2ZsdWlkX2xhZHNwYV9hZGRfYnVmZmVy5gQYX2ZsdWlkX2xhZHNwYV9hZGRfZWZmZWN05wQcX2ZsdWlkX2xhZHNwYV9lZmZlY3Rfc2V0X21peOgEB19tYWxsb2PpBAVfZnJlZeoECF9yZWFsbG9j6wQSX3RyeV9yZWFsbG9jX2NodW5r7AQOX2Rpc3Bvc2VfY2h1bmvtBA5fX19zdGRpb19jbG9zZe4EDl9fX3N0ZGlvX3dyaXRl7wQNX19fc3RkaW9fc2Vla/AEDl9fX3N5c2NhbGxfcmV08QQRX19fZXJybm9fbG9jYXRpb27yBA1fX19zdGRpb19yZWFk8wQPX19fc3Rkb3V0X3dyaXRl9AQIX2lzc3BhY2X1BAlfX190b3JlYWT2BAdfc3RyY21w9wQIX3N0cm5jbXD4BAhfaXNkaWdpdPkECl92c25wcmludGb6BAlfdmZwcmludGb7BAxfcHJpbnRmX2NvcmX8BA1fX191bmxvY2tmaWxl/QQEX291dP4EB19nZXRpbnT/BAhfcG9wX2FyZ4AFBl9mbXRfeIEFBl9mbXRfb4IFBl9mbXRfdYMFCV9zdHJlcnJvcoQFB19tZW1jaHKFBQhfcGFkXzY2OYYFB193Y3RvbWKHBQdfZm10X2ZwiAUSX19fRE9VQkxFX0JJVFNfNjcwiQUHX2ZyZXhwbIoFBl9mcmV4cIsFCF93Y3J0b21ijAUTX19fcHRocmVhZF9zZWxmXzQyM40FDV9wdGhyZWFkX3NlbGaOBQ1fX19zdHJlcnJvcl9sjwUKX19fbGN0cmFuc5AFD19fX2xjdHJhbnNfaW1wbJEFDF9fX21vX2xvb2t1cJIFBl9zd2FwY5MFCl9fX2Z3cml0ZXiUBQpfX190b3dyaXRllQUJX3NuX3dyaXRllgUHX3NjYWxibpcFB19zdHJsZW6YBQdfc3RyY2hymQUMX19fc3RyY2hybnVsmgUJX3NucHJpbnRmmwUHX3N0cmNweZwFCV9fX3N0cGNweZ0FBl9fX2Nvc54FC19fX3JlbV9waW8ynwURX19fcmVtX3BpbzJfbGFyZ2WgBQZfX19zaW6hBQZfbGRleHCiBQVfc3RhdKMFB19md3JpdGWkBRVfX191bmxpc3RfbG9ja2VkX2ZpbGWlBQZfZm9wZW6mBQ1fX19mbW9kZWZsYWdzpwUJX19fZmRvcGVuqAUKX19fb2ZsX2FkZKkFC19fX29mbF9sb2NrqgUNX19fb2ZsX3VubG9ja6sFB19mY2xvc2WsBQdfZmZsdXNorQUSX19fZmZsdXNoX3VubG9ja2VkrgUFX2Zlb2avBQZfZnNlZWuwBQhfZnByaW50ZrEFCV9fX2ZzZWVrb7IFEl9fX2ZzZWVrb191bmxvY2tlZLMFBl9tbG9ja7QFCF9tdW5sb2NrtQUIX3N0cm5jcHm2BQpfX19zdHBuY3B5twUFX3JhbmS4BQdfc3RyY2F0uQUJX19fZnRlbGxvugUSX19fZnRlbGxvX3VubG9ja2VkuwUGX2ZyZWFkvAUGX2Z0ZWxsvQUFX2F0b2m+BQRfY29zvwUEX3NpbsAFBF9sb2fBBQRfcG93wgUPX2xsdm1fYnN3YXBfaTMywwUHX21lbWNwecQFB19tZW1zZXTFBQVfc2Jya8YFCmR5bkNhbGxfaWnHBQtkeW5DYWxsX2lpacgFDGR5bkNhbGxfaWlpackFDmR5bkNhbGxfaWlpaWlpygUPZHluQ2FsbF9paWlpaWlpywUKZHluQ2FsbF92acwFC2R5bkNhbGxfdmlpzQUMZHluQ2FsbF92aWlkzgUMZHluQ2FsbF92aWlpzwUNZHluQ2FsbF92aWlpadAFAmIw0QUCYjHSBQJiMtMFAmIz1AUCYjTVBQJiNdYFAmI21wUCYjfYBQJiONkFAmI52gUqbGVnYWxzdHViJF9mbHVpZF9sYWRzcGFfZWZmZWN0X3NldF9jb250cm9s2wUqbGVnYWxzdHViJF9mbHVpZF9taWRpX3JvdXRlcl9ydWxlX3NldF9jaGFu3AUsbGVnYWxzdHViJF9mbHVpZF9taWRpX3JvdXRlcl9ydWxlX3NldF9wYXJhbTHdBSxsZWdhbHN0dWIkX2ZsdWlkX21pZGlfcm91dGVyX3J1bGVfc2V0X3BhcmFtMt4FH2xlZ2Fsc3R1YiRfZmx1aWRfc3ludGhfZ2V0X2dhaW7fBR5sZWdhbHN0dWIkX2ZsdWlkX3N5bnRoX2dldF9nZW7gBR9sZWdhbHN0dWIkX2ZsdWlkX3N5bnRoX3NldF9nYWlu4QUebGVnYWxzdHViJF9mbHVpZF9zeW50aF9zZXRfZ2Vu4gUmbGVnYWxzdHViJF9mbHVpZF9zeW50aF9zZXRfc2FtcGxlX3JhdGXjBR5sZWdhbHN0dWIkX2ZsdWlkX3ZvaWNlX2dlbl9nZXTkBR9sZWdhbHN0dWIkX2ZsdWlkX3ZvaWNlX2dlbl9pbmNy5QUebGVnYWxzdHViJF9mbHVpZF92b2ljZV9nZW5fc2V0';
  var asmjsCodeFile = '';

  if (!isDataURI(wasmTextFile)) {
    wasmTextFile = locateFile(wasmTextFile);
  }
  if (!isDataURI(wasmBinaryFile)) {
    wasmBinaryFile = locateFile(wasmBinaryFile);
  }
  if (!isDataURI(asmjsCodeFile)) {
    asmjsCodeFile = locateFile(asmjsCodeFile);
  }

  // utilities

  var wasmPageSize = 64*1024;

  var info = {
    'global': null,
    'env': null,
    'asm2wasm': asm2wasmImports,
    'parent': Module // Module inside wasm-js.cpp refers to wasm-js.cpp; this allows access to the outside program.
  };

  var exports = null;


  function mergeMemory(newBuffer) {
    // The wasm instance creates its memory. But static init code might have written to
    // buffer already, including the mem init file, and we must copy it over in a proper merge.
    // TODO: avoid this copy, by avoiding such static init writes
    // TODO: in shorter term, just copy up to the last static init write
    var oldBuffer = Module['buffer'];
    if (newBuffer.byteLength < oldBuffer.byteLength) {
      err('the new buffer in mergeMemory is smaller than the previous one. in native wasm, we should grow memory here');
    }
    var oldView = new Int8Array(oldBuffer);
    var newView = new Int8Array(newBuffer);


    newView.set(oldView);
    updateGlobalBuffer(newBuffer);
    updateGlobalBufferViews();
  }

  function fixImports(imports) {
    return imports;
  }

  function getBinary() {
    try {
      if (Module['wasmBinary']) {
        return new Uint8Array(Module['wasmBinary']);
      }
      var binary = tryParseAsDataURI(wasmBinaryFile);
      if (binary) {
        return binary;
      }
      if (Module['readBinary']) {
        return Module['readBinary'](wasmBinaryFile);
      } else {
        throw "both async and sync fetching of the wasm failed";
      }
    }
    catch (err) {
      abort(err);
    }
  }

  function getBinaryPromise() {
    // if we don't have the binary yet, and have the Fetch api, use that
    // in some environments, like Electron's render process, Fetch api may be present, but have a different context than expected, let's only use it on the Web
    if (!Module['wasmBinary'] && (ENVIRONMENT_IS_WEB || ENVIRONMENT_IS_WORKER) && typeof fetch === 'function') {
      return fetch(wasmBinaryFile, { credentials: 'same-origin' }).then(function(response) {
        if (!response['ok']) {
          throw "failed to load wasm binary file at '" + wasmBinaryFile + "'";
        }
        return response['arrayBuffer']();
      }).catch(function () {
        return getBinary();
      });
    }
    // Otherwise, getBinary should be able to get it synchronously
    return new Promise(function(resolve, reject) {
      resolve(getBinary());
    });
  }

  // do-method functions


  function doNativeWasm(global, env, providedBuffer) {
    if (typeof WebAssembly !== 'object') {
      err('no native wasm support detected');
      return false;
    }
    // prepare memory import
    if (!(Module['wasmMemory'] instanceof WebAssembly.Memory)) {
      err('no native wasm Memory in use');
      return false;
    }
    env['memory'] = Module['wasmMemory'];
    // Load the wasm module and create an instance of using native support in the JS engine.
    info['global'] = {
      'NaN': NaN,
      'Infinity': Infinity
    };
    info['global.Math'] = Math;
    info['env'] = env;
    // handle a generated wasm instance, receiving its exports and
    // performing other necessary setup
    function receiveInstance(instance, module) {
      exports = instance.exports;
      if (exports.memory) mergeMemory(exports.memory);
      Module['asm'] = exports;
      Module["usingWasm"] = true;
      removeRunDependency('wasm-instantiate');
    }
    addRunDependency('wasm-instantiate');

    // User shell pages can write their own Module.instantiateWasm = function(imports, successCallback) callback
    // to manually instantiate the Wasm module themselves. This allows pages to run the instantiation parallel
    // to any other async startup actions they are performing.
    if (Module['instantiateWasm']) {
      try {
        return Module['instantiateWasm'](info, receiveInstance);
      } catch(e) {
        err('Module.instantiateWasm callback failed with error: ' + e);
        return false;
      }
    }

    function receiveInstantiatedSource(output) {
      // 'output' is a WebAssemblyInstantiatedSource object which has both the module and instance.
      // receiveInstance() will swap in the exports (to Module.asm) so they can be called
      receiveInstance(output['instance'], output['module']);
    }
    function instantiateArrayBuffer(receiver) {
      getBinaryPromise().then(function(binary) {
        return WebAssembly.instantiate(binary, info);
      }).then(receiver, function(reason) {
        err('failed to asynchronously prepare wasm: ' + reason);
        abort(reason);
      });
    }
    // Prefer streaming instantiation if available.
    if (!Module['wasmBinary'] &&
        typeof WebAssembly.instantiateStreaming === 'function' &&
        !isDataURI(wasmBinaryFile) &&
        typeof fetch === 'function') {
      WebAssembly.instantiateStreaming(fetch(wasmBinaryFile, { credentials: 'same-origin' }), info)
        .then(receiveInstantiatedSource, function(reason) {
          // We expect the most common failure cause to be a bad MIME type for the binary,
          // in which case falling back to ArrayBuffer instantiation should work.
          err('wasm streaming compile failed: ' + reason);
          err('falling back to ArrayBuffer instantiation');
          instantiateArrayBuffer(receiveInstantiatedSource);
        });
    } else {
      instantiateArrayBuffer(receiveInstantiatedSource);
    }
    return {}; // no exports yet; we'll fill them in later
  }


  // We may have a preloaded value in Module.asm, save it
  Module['asmPreload'] = Module['asm'];

  // Memory growth integration code

  var asmjsReallocBuffer = Module['reallocBuffer'];

  var wasmReallocBuffer = function(size) {
    var PAGE_MULTIPLE = Module["usingWasm"] ? WASM_PAGE_SIZE : ASMJS_PAGE_SIZE; // In wasm, heap size must be a multiple of 64KB. In asm.js, they need to be multiples of 16MB.
    size = alignUp(size, PAGE_MULTIPLE); // round up to wasm page size
    var old = Module['buffer'];
    var oldSize = old.byteLength;
    if (Module["usingWasm"]) {
      // native wasm support
      try {
        var result = Module['wasmMemory'].grow((size - oldSize) / wasmPageSize); // .grow() takes a delta compared to the previous size
        if (result !== (-1 | 0)) {
          // success in native wasm memory growth, get the buffer from the memory
          return Module['buffer'] = Module['wasmMemory'].buffer;
        } else {
          return null;
        }
      } catch(e) {
        return null;
      }
    }
  };

  Module['reallocBuffer'] = function(size) {
    if (finalMethod === 'asmjs') {
      return asmjsReallocBuffer(size);
    } else {
      return wasmReallocBuffer(size);
    }
  };

  // we may try more than one; this is the final one, that worked and we are using
  var finalMethod = '';

  // Provide an "asm.js function" for the application, called to "link" the asm.js module. We instantiate
  // the wasm module at that time, and it receives imports and provides exports and so forth, the app
  // doesn't need to care that it is wasm or olyfilled wasm or asm.js.

  Module['asm'] = function(global, env, providedBuffer) {
    env = fixImports(env);

    // import table
    if (!env['table']) {
      var TABLE_SIZE = Module['wasmTableSize'];
      if (TABLE_SIZE === undefined) TABLE_SIZE = 1024; // works in binaryen interpreter at least
      var MAX_TABLE_SIZE = Module['wasmMaxTableSize'];
      if (typeof WebAssembly === 'object' && typeof WebAssembly.Table === 'function') {
        if (MAX_TABLE_SIZE !== undefined) {
          env['table'] = new WebAssembly.Table({ 'initial': TABLE_SIZE, 'maximum': MAX_TABLE_SIZE, 'element': 'anyfunc' });
        } else {
          env['table'] = new WebAssembly.Table({ 'initial': TABLE_SIZE, element: 'anyfunc' });
        }
      } else {
        env['table'] = new Array(TABLE_SIZE); // works in binaryen interpreter at least
      }
      Module['wasmTable'] = env['table'];
    }

    if (!env['memoryBase']) {
      env['memoryBase'] = Module['STATIC_BASE']; // tell the memory segments where to place themselves
    }
    if (!env['tableBase']) {
      env['tableBase'] = 0; // table starts at 0 by default, in dynamic linking this will change
    }

    // try the methods. each should return the exports if it succeeded

    var exports;
    exports = doNativeWasm(global, env, providedBuffer);

    assert(exports, 'no binaryen method succeeded.');


    return exports;
  };

  var methodHandler = Module['asm']; // note our method handler, as we may modify Module['asm'] later
}

integrateWasmJS();

// === Body ===

var ASM_CONSTS = [];





STATIC_BASE = GLOBAL_BASE;

STATICTOP = STATIC_BASE + 459856;
/* global initializers */  __ATINIT__.push();







var STATIC_BUMP = 459856;
Module["STATIC_BASE"] = STATIC_BASE;
Module["STATIC_BUMP"] = STATIC_BUMP;

/* no memory initializer */
var tempDoublePtr = STATICTOP; STATICTOP += 16;

function copyTempFloat(ptr) { // functions, because inlining this code increases code size too much

  HEAP8[tempDoublePtr] = HEAP8[ptr];

  HEAP8[tempDoublePtr+1] = HEAP8[ptr+1];

  HEAP8[tempDoublePtr+2] = HEAP8[ptr+2];

  HEAP8[tempDoublePtr+3] = HEAP8[ptr+3];

}

function copyTempDouble(ptr) {

  HEAP8[tempDoublePtr] = HEAP8[ptr];

  HEAP8[tempDoublePtr+1] = HEAP8[ptr+1];

  HEAP8[tempDoublePtr+2] = HEAP8[ptr+2];

  HEAP8[tempDoublePtr+3] = HEAP8[ptr+3];

  HEAP8[tempDoublePtr+4] = HEAP8[ptr+4];

  HEAP8[tempDoublePtr+5] = HEAP8[ptr+5];

  HEAP8[tempDoublePtr+6] = HEAP8[ptr+6];

  HEAP8[tempDoublePtr+7] = HEAP8[ptr+7];

}

// {{PRE_LIBRARY}}


  function ___lock() {}

  
  
  
  var ERRNO_CODES={EPERM:1,ENOENT:2,ESRCH:3,EINTR:4,EIO:5,ENXIO:6,E2BIG:7,ENOEXEC:8,EBADF:9,ECHILD:10,EAGAIN:11,EWOULDBLOCK:11,ENOMEM:12,EACCES:13,EFAULT:14,ENOTBLK:15,EBUSY:16,EEXIST:17,EXDEV:18,ENODEV:19,ENOTDIR:20,EISDIR:21,EINVAL:22,ENFILE:23,EMFILE:24,ENOTTY:25,ETXTBSY:26,EFBIG:27,ENOSPC:28,ESPIPE:29,EROFS:30,EMLINK:31,EPIPE:32,EDOM:33,ERANGE:34,ENOMSG:42,EIDRM:43,ECHRNG:44,EL2NSYNC:45,EL3HLT:46,EL3RST:47,ELNRNG:48,EUNATCH:49,ENOCSI:50,EL2HLT:51,EDEADLK:35,ENOLCK:37,EBADE:52,EBADR:53,EXFULL:54,ENOANO:55,EBADRQC:56,EBADSLT:57,EDEADLOCK:35,EBFONT:59,ENOSTR:60,ENODATA:61,ETIME:62,ENOSR:63,ENONET:64,ENOPKG:65,EREMOTE:66,ENOLINK:67,EADV:68,ESRMNT:69,ECOMM:70,EPROTO:71,EMULTIHOP:72,EDOTDOT:73,EBADMSG:74,ENOTUNIQ:76,EBADFD:77,EREMCHG:78,ELIBACC:79,ELIBBAD:80,ELIBSCN:81,ELIBMAX:82,ELIBEXEC:83,ENOSYS:38,ENOTEMPTY:39,ENAMETOOLONG:36,ELOOP:40,EOPNOTSUPP:95,EPFNOSUPPORT:96,ECONNRESET:104,ENOBUFS:105,EAFNOSUPPORT:97,EPROTOTYPE:91,ENOTSOCK:88,ENOPROTOOPT:92,ESHUTDOWN:108,ECONNREFUSED:111,EADDRINUSE:98,ECONNABORTED:103,ENETUNREACH:101,ENETDOWN:100,ETIMEDOUT:110,EHOSTDOWN:112,EHOSTUNREACH:113,EINPROGRESS:115,EALREADY:114,EDESTADDRREQ:89,EMSGSIZE:90,EPROTONOSUPPORT:93,ESOCKTNOSUPPORT:94,EADDRNOTAVAIL:99,ENETRESET:102,EISCONN:106,ENOTCONN:107,ETOOMANYREFS:109,EUSERS:87,EDQUOT:122,ESTALE:116,ENOTSUP:95,ENOMEDIUM:123,EILSEQ:84,EOVERFLOW:75,ECANCELED:125,ENOTRECOVERABLE:131,EOWNERDEAD:130,ESTRPIPE:86};
  
  var ERRNO_MESSAGES={0:"Success",1:"Not super-user",2:"No such file or directory",3:"No such process",4:"Interrupted system call",5:"I/O error",6:"No such device or address",7:"Arg list too long",8:"Exec format error",9:"Bad file number",10:"No children",11:"No more processes",12:"Not enough core",13:"Permission denied",14:"Bad address",15:"Block device required",16:"Mount device busy",17:"File exists",18:"Cross-device link",19:"No such device",20:"Not a directory",21:"Is a directory",22:"Invalid argument",23:"Too many open files in system",24:"Too many open files",25:"Not a typewriter",26:"Text file busy",27:"File too large",28:"No space left on device",29:"Illegal seek",30:"Read only file system",31:"Too many links",32:"Broken pipe",33:"Math arg out of domain of func",34:"Math result not representable",35:"File locking deadlock error",36:"File or path name too long",37:"No record locks available",38:"Function not implemented",39:"Directory not empty",40:"Too many symbolic links",42:"No message of desired type",43:"Identifier removed",44:"Channel number out of range",45:"Level 2 not synchronized",46:"Level 3 halted",47:"Level 3 reset",48:"Link number out of range",49:"Protocol driver not attached",50:"No CSI structure available",51:"Level 2 halted",52:"Invalid exchange",53:"Invalid request descriptor",54:"Exchange full",55:"No anode",56:"Invalid request code",57:"Invalid slot",59:"Bad font file fmt",60:"Device not a stream",61:"No data (for no delay io)",62:"Timer expired",63:"Out of streams resources",64:"Machine is not on the network",65:"Package not installed",66:"The object is remote",67:"The link has been severed",68:"Advertise error",69:"Srmount error",70:"Communication error on send",71:"Protocol error",72:"Multihop attempted",73:"Cross mount point (not really error)",74:"Trying to read unreadable message",75:"Value too large for defined data type",76:"Given log. name not unique",77:"f.d. invalid for this operation",78:"Remote address changed",79:"Can   access a needed shared lib",80:"Accessing a corrupted shared lib",81:".lib section in a.out corrupted",82:"Attempting to link in too many libs",83:"Attempting to exec a shared library",84:"Illegal byte sequence",86:"Streams pipe error",87:"Too many users",88:"Socket operation on non-socket",89:"Destination address required",90:"Message too long",91:"Protocol wrong type for socket",92:"Protocol not available",93:"Unknown protocol",94:"Socket type not supported",95:"Not supported",96:"Protocol family not supported",97:"Address family not supported by protocol family",98:"Address already in use",99:"Address not available",100:"Network interface is not configured",101:"Network is unreachable",102:"Connection reset by network",103:"Connection aborted",104:"Connection reset by peer",105:"No buffer space available",106:"Socket is already connected",107:"Socket is not connected",108:"Can't send after socket shutdown",109:"Too many references",110:"Connection timed out",111:"Connection refused",112:"Host is down",113:"Host is unreachable",114:"Socket already connected",115:"Connection already in progress",116:"Stale file handle",122:"Quota exceeded",123:"No medium (in tape drive)",125:"Operation canceled",130:"Previous owner died",131:"State not recoverable"};
  
  function ___setErrNo(value) {
      if (Module['___errno_location']) HEAP32[((Module['___errno_location']())>>2)]=value;
      return value;
    }
  
  var PATH={splitPath:function (filename) {
        var splitPathRe = /^(\/?|)([\s\S]*?)((?:\.{1,2}|[^\/]+?|)(\.[^.\/]*|))(?:[\/]*)$/;
        return splitPathRe.exec(filename).slice(1);
      },normalizeArray:function (parts, allowAboveRoot) {
        // if the path tries to go above the root, `up` ends up > 0
        var up = 0;
        for (var i = parts.length - 1; i >= 0; i--) {
          var last = parts[i];
          if (last === '.') {
            parts.splice(i, 1);
          } else if (last === '..') {
            parts.splice(i, 1);
            up++;
          } else if (up) {
            parts.splice(i, 1);
            up--;
          }
        }
        // if the path is allowed to go above the root, restore leading ..s
        if (allowAboveRoot) {
          for (; up; up--) {
            parts.unshift('..');
          }
        }
        return parts;
      },normalize:function (path) {
        var isAbsolute = path.charAt(0) === '/',
            trailingSlash = path.substr(-1) === '/';
        // Normalize the path
        path = PATH.normalizeArray(path.split('/').filter(function(p) {
          return !!p;
        }), !isAbsolute).join('/');
        if (!path && !isAbsolute) {
          path = '.';
        }
        if (path && trailingSlash) {
          path += '/';
        }
        return (isAbsolute ? '/' : '') + path;
      },dirname:function (path) {
        var result = PATH.splitPath(path),
            root = result[0],
            dir = result[1];
        if (!root && !dir) {
          // No dirname whatsoever
          return '.';
        }
        if (dir) {
          // It has a dirname, strip trailing slash
          dir = dir.substr(0, dir.length - 1);
        }
        return root + dir;
      },basename:function (path) {
        // EMSCRIPTEN return '/'' for '/', not an empty string
        if (path === '/') return '/';
        var lastSlash = path.lastIndexOf('/');
        if (lastSlash === -1) return path;
        return path.substr(lastSlash+1);
      },extname:function (path) {
        return PATH.splitPath(path)[3];
      },join:function () {
        var paths = Array.prototype.slice.call(arguments, 0);
        return PATH.normalize(paths.join('/'));
      },join2:function (l, r) {
        return PATH.normalize(l + '/' + r);
      },resolve:function () {
        var resolvedPath = '',
          resolvedAbsolute = false;
        for (var i = arguments.length - 1; i >= -1 && !resolvedAbsolute; i--) {
          var path = (i >= 0) ? arguments[i] : FS.cwd();
          // Skip empty and invalid entries
          if (typeof path !== 'string') {
            throw new TypeError('Arguments to path.resolve must be strings');
          } else if (!path) {
            return ''; // an invalid portion invalidates the whole thing
          }
          resolvedPath = path + '/' + resolvedPath;
          resolvedAbsolute = path.charAt(0) === '/';
        }
        // At this point the path should be resolved to a full absolute path, but
        // handle relative paths to be safe (might happen when process.cwd() fails)
        resolvedPath = PATH.normalizeArray(resolvedPath.split('/').filter(function(p) {
          return !!p;
        }), !resolvedAbsolute).join('/');
        return ((resolvedAbsolute ? '/' : '') + resolvedPath) || '.';
      },relative:function (from, to) {
        from = PATH.resolve(from).substr(1);
        to = PATH.resolve(to).substr(1);
        function trim(arr) {
          var start = 0;
          for (; start < arr.length; start++) {
            if (arr[start] !== '') break;
          }
          var end = arr.length - 1;
          for (; end >= 0; end--) {
            if (arr[end] !== '') break;
          }
          if (start > end) return [];
          return arr.slice(start, end - start + 1);
        }
        var fromParts = trim(from.split('/'));
        var toParts = trim(to.split('/'));
        var length = Math.min(fromParts.length, toParts.length);
        var samePartsLength = length;
        for (var i = 0; i < length; i++) {
          if (fromParts[i] !== toParts[i]) {
            samePartsLength = i;
            break;
          }
        }
        var outputParts = [];
        for (var i = samePartsLength; i < fromParts.length; i++) {
          outputParts.push('..');
        }
        outputParts = outputParts.concat(toParts.slice(samePartsLength));
        return outputParts.join('/');
      }};
  
  var TTY={ttys:[],init:function () {
        // https://github.com/kripken/emscripten/pull/1555
        // if (ENVIRONMENT_IS_NODE) {
        //   // currently, FS.init does not distinguish if process.stdin is a file or TTY
        //   // device, it always assumes it's a TTY device. because of this, we're forcing
        //   // process.stdin to UTF8 encoding to at least make stdin reading compatible
        //   // with text files until FS.init can be refactored.
        //   process['stdin']['setEncoding']('utf8');
        // }
      },shutdown:function () {
        // https://github.com/kripken/emscripten/pull/1555
        // if (ENVIRONMENT_IS_NODE) {
        //   // inolen: any idea as to why node -e 'process.stdin.read()' wouldn't exit immediately (with process.stdin being a tty)?
        //   // isaacs: because now it's reading from the stream, you've expressed interest in it, so that read() kicks off a _read() which creates a ReadReq operation
        //   // inolen: I thought read() in that case was a synchronous operation that just grabbed some amount of buffered data if it exists?
        //   // isaacs: it is. but it also triggers a _read() call, which calls readStart() on the handle
        //   // isaacs: do process.stdin.pause() and i'd think it'd probably close the pending call
        //   process['stdin']['pause']();
        // }
      },register:function (dev, ops) {
        TTY.ttys[dev] = { input: [], output: [], ops: ops };
        FS.registerDevice(dev, TTY.stream_ops);
      },stream_ops:{open:function (stream) {
          var tty = TTY.ttys[stream.node.rdev];
          if (!tty) {
            throw new FS.ErrnoError(ERRNO_CODES.ENODEV);
          }
          stream.tty = tty;
          stream.seekable = false;
        },close:function (stream) {
          // flush any pending line data
          stream.tty.ops.flush(stream.tty);
        },flush:function (stream) {
          stream.tty.ops.flush(stream.tty);
        },read:function (stream, buffer, offset, length, pos /* ignored */) {
          if (!stream.tty || !stream.tty.ops.get_char) {
            throw new FS.ErrnoError(ERRNO_CODES.ENXIO);
          }
          var bytesRead = 0;
          for (var i = 0; i < length; i++) {
            var result;
            try {
              result = stream.tty.ops.get_char(stream.tty);
            } catch (e) {
              throw new FS.ErrnoError(ERRNO_CODES.EIO);
            }
            if (result === undefined && bytesRead === 0) {
              throw new FS.ErrnoError(ERRNO_CODES.EAGAIN);
            }
            if (result === null || result === undefined) break;
            bytesRead++;
            buffer[offset+i] = result;
          }
          if (bytesRead) {
            stream.node.timestamp = Date.now();
          }
          return bytesRead;
        },write:function (stream, buffer, offset, length, pos) {
          if (!stream.tty || !stream.tty.ops.put_char) {
            throw new FS.ErrnoError(ERRNO_CODES.ENXIO);
          }
          for (var i = 0; i < length; i++) {
            try {
              stream.tty.ops.put_char(stream.tty, buffer[offset+i]);
            } catch (e) {
              throw new FS.ErrnoError(ERRNO_CODES.EIO);
            }
          }
          if (length) {
            stream.node.timestamp = Date.now();
          }
          return i;
        }},default_tty_ops:{get_char:function (tty) {
          if (!tty.input.length) {
            var result = null;
            if (ENVIRONMENT_IS_NODE) {
              // we will read data by chunks of BUFSIZE
              var BUFSIZE = 256;
              var buf = new Buffer(BUFSIZE);
              var bytesRead = 0;
  
              var isPosixPlatform = (process.platform != 'win32'); // Node doesn't offer a direct check, so test by exclusion
  
              var fd = process.stdin.fd;
              if (isPosixPlatform) {
                // Linux and Mac cannot use process.stdin.fd (which isn't set up as sync)
                var usingDevice = false;
                try {
                  fd = fs.openSync('/dev/stdin', 'r');
                  usingDevice = true;
                } catch (e) {}
              }
  
              try {
                bytesRead = fs.readSync(fd, buf, 0, BUFSIZE, null);
              } catch(e) {
                // Cross-platform differences: on Windows, reading EOF throws an exception, but on other OSes,
                // reading EOF returns 0. Uniformize behavior by treating the EOF exception to return 0.
                if (e.toString().indexOf('EOF') != -1) bytesRead = 0;
                else throw e;
              }
  
              if (usingDevice) { fs.closeSync(fd); }
              if (bytesRead > 0) {
                result = buf.slice(0, bytesRead).toString('utf-8');
              } else {
                result = null;
              }
  
            } else if (typeof window != 'undefined' &&
              typeof window.prompt == 'function') {
              // Browser.
              result = window.prompt('Input: ');  // returns null on cancel
              if (result !== null) {
                result += '\n';
              }
            } else if (typeof readline == 'function') {
              // Command line.
              result = readline();
              if (result !== null) {
                result += '\n';
              }
            }
            if (!result) {
              return null;
            }
            tty.input = intArrayFromString(result, true);
          }
          return tty.input.shift();
        },put_char:function (tty, val) {
          if (val === null || val === 10) {
            out(UTF8ArrayToString(tty.output, 0));
            tty.output = [];
          } else {
            if (val != 0) tty.output.push(val); // val == 0 would cut text output off in the middle.
          }
        },flush:function (tty) {
          if (tty.output && tty.output.length > 0) {
            out(UTF8ArrayToString(tty.output, 0));
            tty.output = [];
          }
        }},default_tty1_ops:{put_char:function (tty, val) {
          if (val === null || val === 10) {
            err(UTF8ArrayToString(tty.output, 0));
            tty.output = [];
          } else {
            if (val != 0) tty.output.push(val);
          }
        },flush:function (tty) {
          if (tty.output && tty.output.length > 0) {
            err(UTF8ArrayToString(tty.output, 0));
            tty.output = [];
          }
        }}};
  
  var MEMFS={ops_table:null,mount:function (mount) {
        return MEMFS.createNode(null, '/', 16384 | 511 /* 0777 */, 0);
      },createNode:function (parent, name, mode, dev) {
        if (FS.isBlkdev(mode) || FS.isFIFO(mode)) {
          // no supported
          throw new FS.ErrnoError(ERRNO_CODES.EPERM);
        }
        if (!MEMFS.ops_table) {
          MEMFS.ops_table = {
            dir: {
              node: {
                getattr: MEMFS.node_ops.getattr,
                setattr: MEMFS.node_ops.setattr,
                lookup: MEMFS.node_ops.lookup,
                mknod: MEMFS.node_ops.mknod,
                rename: MEMFS.node_ops.rename,
                unlink: MEMFS.node_ops.unlink,
                rmdir: MEMFS.node_ops.rmdir,
                readdir: MEMFS.node_ops.readdir,
                symlink: MEMFS.node_ops.symlink
              },
              stream: {
                llseek: MEMFS.stream_ops.llseek
              }
            },
            file: {
              node: {
                getattr: MEMFS.node_ops.getattr,
                setattr: MEMFS.node_ops.setattr
              },
              stream: {
                llseek: MEMFS.stream_ops.llseek,
                read: MEMFS.stream_ops.read,
                write: MEMFS.stream_ops.write,
                allocate: MEMFS.stream_ops.allocate,
                mmap: MEMFS.stream_ops.mmap,
                msync: MEMFS.stream_ops.msync
              }
            },
            link: {
              node: {
                getattr: MEMFS.node_ops.getattr,
                setattr: MEMFS.node_ops.setattr,
                readlink: MEMFS.node_ops.readlink
              },
              stream: {}
            },
            chrdev: {
              node: {
                getattr: MEMFS.node_ops.getattr,
                setattr: MEMFS.node_ops.setattr
              },
              stream: FS.chrdev_stream_ops
            }
          };
        }
        var node = FS.createNode(parent, name, mode, dev);
        if (FS.isDir(node.mode)) {
          node.node_ops = MEMFS.ops_table.dir.node;
          node.stream_ops = MEMFS.ops_table.dir.stream;
          node.contents = {};
        } else if (FS.isFile(node.mode)) {
          node.node_ops = MEMFS.ops_table.file.node;
          node.stream_ops = MEMFS.ops_table.file.stream;
          node.usedBytes = 0; // The actual number of bytes used in the typed array, as opposed to contents.length which gives the whole capacity.
          // When the byte data of the file is populated, this will point to either a typed array, or a normal JS array. Typed arrays are preferred
          // for performance, and used by default. However, typed arrays are not resizable like normal JS arrays are, so there is a small disk size
          // penalty involved for appending file writes that continuously grow a file similar to std::vector capacity vs used -scheme.
          node.contents = null; 
        } else if (FS.isLink(node.mode)) {
          node.node_ops = MEMFS.ops_table.link.node;
          node.stream_ops = MEMFS.ops_table.link.stream;
        } else if (FS.isChrdev(node.mode)) {
          node.node_ops = MEMFS.ops_table.chrdev.node;
          node.stream_ops = MEMFS.ops_table.chrdev.stream;
        }
        node.timestamp = Date.now();
        // add the new node to the parent
        if (parent) {
          parent.contents[name] = node;
        }
        return node;
      },getFileDataAsRegularArray:function (node) {
        if (node.contents && node.contents.subarray) {
          var arr = [];
          for (var i = 0; i < node.usedBytes; ++i) arr.push(node.contents[i]);
          return arr; // Returns a copy of the original data.
        }
        return node.contents; // No-op, the file contents are already in a JS array. Return as-is.
      },getFileDataAsTypedArray:function (node) {
        if (!node.contents) return new Uint8Array;
        if (node.contents.subarray) return node.contents.subarray(0, node.usedBytes); // Make sure to not return excess unused bytes.
        return new Uint8Array(node.contents);
      },expandFileStorage:function (node, newCapacity) {
        // If we are asked to expand the size of a file that already exists, revert to using a standard JS array to store the file
        // instead of a typed array. This makes resizing the array more flexible because we can just .push() elements at the back to
        // increase the size.
        if (node.contents && node.contents.subarray && newCapacity > node.contents.length) {
          node.contents = MEMFS.getFileDataAsRegularArray(node);
          node.usedBytes = node.contents.length; // We might be writing to a lazy-loaded file which had overridden this property, so force-reset it.
        }
  
        if (!node.contents || node.contents.subarray) { // Keep using a typed array if creating a new storage, or if old one was a typed array as well.
          var prevCapacity = node.contents ? node.contents.length : 0;
          if (prevCapacity >= newCapacity) return; // No need to expand, the storage was already large enough.
          // Don't expand strictly to the given requested limit if it's only a very small increase, but instead geometrically grow capacity.
          // For small filesizes (<1MB), perform size*2 geometric increase, but for large sizes, do a much more conservative size*1.125 increase to
          // avoid overshooting the allocation cap by a very large margin.
          var CAPACITY_DOUBLING_MAX = 1024 * 1024;
          newCapacity = Math.max(newCapacity, (prevCapacity * (prevCapacity < CAPACITY_DOUBLING_MAX ? 2.0 : 1.125)) | 0);
          if (prevCapacity != 0) newCapacity = Math.max(newCapacity, 256); // At minimum allocate 256b for each file when expanding.
          var oldContents = node.contents;
          node.contents = new Uint8Array(newCapacity); // Allocate new storage.
          if (node.usedBytes > 0) node.contents.set(oldContents.subarray(0, node.usedBytes), 0); // Copy old data over to the new storage.
          return;
        }
        // Not using a typed array to back the file storage. Use a standard JS array instead.
        if (!node.contents && newCapacity > 0) node.contents = [];
        while (node.contents.length < newCapacity) node.contents.push(0);
      },resizeFileStorage:function (node, newSize) {
        if (node.usedBytes == newSize) return;
        if (newSize == 0) {
          node.contents = null; // Fully decommit when requesting a resize to zero.
          node.usedBytes = 0;
          return;
        }
        if (!node.contents || node.contents.subarray) { // Resize a typed array if that is being used as the backing store.
          var oldContents = node.contents;
          node.contents = new Uint8Array(new ArrayBuffer(newSize)); // Allocate new storage.
          if (oldContents) {
            node.contents.set(oldContents.subarray(0, Math.min(newSize, node.usedBytes))); // Copy old data over to the new storage.
          }
          node.usedBytes = newSize;
          return;
        }
        // Backing with a JS array.
        if (!node.contents) node.contents = [];
        if (node.contents.length > newSize) node.contents.length = newSize;
        else while (node.contents.length < newSize) node.contents.push(0);
        node.usedBytes = newSize;
      },node_ops:{getattr:function (node) {
          var attr = {};
          // device numbers reuse inode numbers.
          attr.dev = FS.isChrdev(node.mode) ? node.id : 1;
          attr.ino = node.id;
          attr.mode = node.mode;
          attr.nlink = 1;
          attr.uid = 0;
          attr.gid = 0;
          attr.rdev = node.rdev;
          if (FS.isDir(node.mode)) {
            attr.size = 4096;
          } else if (FS.isFile(node.mode)) {
            attr.size = node.usedBytes;
          } else if (FS.isLink(node.mode)) {
            attr.size = node.link.length;
          } else {
            attr.size = 0;
          }
          attr.atime = new Date(node.timestamp);
          attr.mtime = new Date(node.timestamp);
          attr.ctime = new Date(node.timestamp);
          // NOTE: In our implementation, st_blocks = Math.ceil(st_size/st_blksize),
          //       but this is not required by the standard.
          attr.blksize = 4096;
          attr.blocks = Math.ceil(attr.size / attr.blksize);
          return attr;
        },setattr:function (node, attr) {
          if (attr.mode !== undefined) {
            node.mode = attr.mode;
          }
          if (attr.timestamp !== undefined) {
            node.timestamp = attr.timestamp;
          }
          if (attr.size !== undefined) {
            MEMFS.resizeFileStorage(node, attr.size);
          }
        },lookup:function (parent, name) {
          throw FS.genericErrors[ERRNO_CODES.ENOENT];
        },mknod:function (parent, name, mode, dev) {
          return MEMFS.createNode(parent, name, mode, dev);
        },rename:function (old_node, new_dir, new_name) {
          // if we're overwriting a directory at new_name, make sure it's empty.
          if (FS.isDir(old_node.mode)) {
            var new_node;
            try {
              new_node = FS.lookupNode(new_dir, new_name);
            } catch (e) {
            }
            if (new_node) {
              for (var i in new_node.contents) {
                throw new FS.ErrnoError(ERRNO_CODES.ENOTEMPTY);
              }
            }
          }
          // do the internal rewiring
          delete old_node.parent.contents[old_node.name];
          old_node.name = new_name;
          new_dir.contents[new_name] = old_node;
          old_node.parent = new_dir;
        },unlink:function (parent, name) {
          delete parent.contents[name];
        },rmdir:function (parent, name) {
          var node = FS.lookupNode(parent, name);
          for (var i in node.contents) {
            throw new FS.ErrnoError(ERRNO_CODES.ENOTEMPTY);
          }
          delete parent.contents[name];
        },readdir:function (node) {
          var entries = ['.', '..']
          for (var key in node.contents) {
            if (!node.contents.hasOwnProperty(key)) {
              continue;
            }
            entries.push(key);
          }
          return entries;
        },symlink:function (parent, newname, oldpath) {
          var node = MEMFS.createNode(parent, newname, 511 /* 0777 */ | 40960, 0);
          node.link = oldpath;
          return node;
        },readlink:function (node) {
          if (!FS.isLink(node.mode)) {
            throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
          }
          return node.link;
        }},stream_ops:{read:function (stream, buffer, offset, length, position) {
          var contents = stream.node.contents;
          if (position >= stream.node.usedBytes) return 0;
          var size = Math.min(stream.node.usedBytes - position, length);
          assert(size >= 0);
          if (size > 8 && contents.subarray) { // non-trivial, and typed array
            buffer.set(contents.subarray(position, position + size), offset);
          } else {
            for (var i = 0; i < size; i++) buffer[offset + i] = contents[position + i];
          }
          return size;
        },write:function (stream, buffer, offset, length, position, canOwn) {
          // If memory can grow, we don't want to hold on to references of
          // the memory Buffer, as they may get invalidated. That means
          // we need to do a copy here.
          canOwn = false;
  
          if (!length) return 0;
          var node = stream.node;
          node.timestamp = Date.now();
  
          if (buffer.subarray && (!node.contents || node.contents.subarray)) { // This write is from a typed array to a typed array?
            if (canOwn) {
              node.contents = buffer.subarray(offset, offset + length);
              node.usedBytes = length;
              return length;
            } else if (node.usedBytes === 0 && position === 0) { // If this is a simple first write to an empty file, do a fast set since we don't need to care about old data.
              node.contents = new Uint8Array(buffer.subarray(offset, offset + length));
              node.usedBytes = length;
              return length;
            } else if (position + length <= node.usedBytes) { // Writing to an already allocated and used subrange of the file?
              node.contents.set(buffer.subarray(offset, offset + length), position);
              return length;
            }
          }
  
          // Appending to an existing file and we need to reallocate, or source data did not come as a typed array.
          MEMFS.expandFileStorage(node, position+length);
          if (node.contents.subarray && buffer.subarray) node.contents.set(buffer.subarray(offset, offset + length), position); // Use typed array write if available.
          else {
            for (var i = 0; i < length; i++) {
             node.contents[position + i] = buffer[offset + i]; // Or fall back to manual write if not.
            }
          }
          node.usedBytes = Math.max(node.usedBytes, position+length);
          return length;
        },llseek:function (stream, offset, whence) {
          var position = offset;
          if (whence === 1) {  // SEEK_CUR.
            position += stream.position;
          } else if (whence === 2) {  // SEEK_END.
            if (FS.isFile(stream.node.mode)) {
              position += stream.node.usedBytes;
            }
          }
          if (position < 0) {
            throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
          }
          return position;
        },allocate:function (stream, offset, length) {
          MEMFS.expandFileStorage(stream.node, offset + length);
          stream.node.usedBytes = Math.max(stream.node.usedBytes, offset + length);
        },mmap:function (stream, buffer, offset, length, position, prot, flags) {
          if (!FS.isFile(stream.node.mode)) {
            throw new FS.ErrnoError(ERRNO_CODES.ENODEV);
          }
          var ptr;
          var allocated;
          var contents = stream.node.contents;
          // Only make a new copy when MAP_PRIVATE is specified.
          if ( !(flags & 2) &&
                (contents.buffer === buffer || contents.buffer === buffer.buffer) ) {
            // We can't emulate MAP_SHARED when the file is not backed by the buffer
            // we're mapping to (e.g. the HEAP buffer).
            allocated = false;
            ptr = contents.byteOffset;
          } else {
            // Try to avoid unnecessary slices.
            if (position > 0 || position + length < stream.node.usedBytes) {
              if (contents.subarray) {
                contents = contents.subarray(position, position + length);
              } else {
                contents = Array.prototype.slice.call(contents, position, position + length);
              }
            }
            allocated = true;
            ptr = _malloc(length);
            if (!ptr) {
              throw new FS.ErrnoError(ERRNO_CODES.ENOMEM);
            }
            buffer.set(contents, ptr);
          }
          return { ptr: ptr, allocated: allocated };
        },msync:function (stream, buffer, offset, length, mmapFlags) {
          if (!FS.isFile(stream.node.mode)) {
            throw new FS.ErrnoError(ERRNO_CODES.ENODEV);
          }
          if (mmapFlags & 2) {
            // MAP_PRIVATE calls need not to be synced back to underlying fs
            return 0;
          }
  
          var bytesWritten = MEMFS.stream_ops.write(stream, buffer, 0, length, offset, false);
          // should we check if bytesWritten and length are the same?
          return 0;
        }}};
  
  var IDBFS={dbs:{},indexedDB:function () {
        if (typeof indexedDB !== 'undefined') return indexedDB;
        var ret = null;
        if (typeof window === 'object') ret = window.indexedDB || window.mozIndexedDB || window.webkitIndexedDB || window.msIndexedDB;
        assert(ret, 'IDBFS used, but indexedDB not supported');
        return ret;
      },DB_VERSION:21,DB_STORE_NAME:"FILE_DATA",mount:function (mount) {
        // reuse all of the core MEMFS functionality
        return MEMFS.mount.apply(null, arguments);
      },syncfs:function (mount, populate, callback) {
        IDBFS.getLocalSet(mount, function(err, local) {
          if (err) return callback(err);
  
          IDBFS.getRemoteSet(mount, function(err, remote) {
            if (err) return callback(err);
  
            var src = populate ? remote : local;
            var dst = populate ? local : remote;
  
            IDBFS.reconcile(src, dst, callback);
          });
        });
      },getDB:function (name, callback) {
        // check the cache first
        var db = IDBFS.dbs[name];
        if (db) {
          return callback(null, db);
        }
  
        var req;
        try {
          req = IDBFS.indexedDB().open(name, IDBFS.DB_VERSION);
        } catch (e) {
          return callback(e);
        }
        if (!req) {
          return callback("Unable to connect to IndexedDB");
        }
        req.onupgradeneeded = function(e) {
          var db = e.target.result;
          var transaction = e.target.transaction;
  
          var fileStore;
  
          if (db.objectStoreNames.contains(IDBFS.DB_STORE_NAME)) {
            fileStore = transaction.objectStore(IDBFS.DB_STORE_NAME);
          } else {
            fileStore = db.createObjectStore(IDBFS.DB_STORE_NAME);
          }
  
          if (!fileStore.indexNames.contains('timestamp')) {
            fileStore.createIndex('timestamp', 'timestamp', { unique: false });
          }
        };
        req.onsuccess = function() {
          db = req.result;
  
          // add to the cache
          IDBFS.dbs[name] = db;
          callback(null, db);
        };
        req.onerror = function(e) {
          callback(this.error);
          e.preventDefault();
        };
      },getLocalSet:function (mount, callback) {
        var entries = {};
  
        function isRealDir(p) {
          return p !== '.' && p !== '..';
        };
        function toAbsolute(root) {
          return function(p) {
            return PATH.join2(root, p);
          }
        };
  
        var check = FS.readdir(mount.mountpoint).filter(isRealDir).map(toAbsolute(mount.mountpoint));
  
        while (check.length) {
          var path = check.pop();
          var stat;
  
          try {
            stat = FS.stat(path);
          } catch (e) {
            return callback(e);
          }
  
          if (FS.isDir(stat.mode)) {
            check.push.apply(check, FS.readdir(path).filter(isRealDir).map(toAbsolute(path)));
          }
  
          entries[path] = { timestamp: stat.mtime };
        }
  
        return callback(null, { type: 'local', entries: entries });
      },getRemoteSet:function (mount, callback) {
        var entries = {};
  
        IDBFS.getDB(mount.mountpoint, function(err, db) {
          if (err) return callback(err);
  
          try {
            var transaction = db.transaction([IDBFS.DB_STORE_NAME], 'readonly');
            transaction.onerror = function(e) {
              callback(this.error);
              e.preventDefault();
            };
  
            var store = transaction.objectStore(IDBFS.DB_STORE_NAME);
            var index = store.index('timestamp');
  
            index.openKeyCursor().onsuccess = function(event) {
              var cursor = event.target.result;
  
              if (!cursor) {
                return callback(null, { type: 'remote', db: db, entries: entries });
              }
  
              entries[cursor.primaryKey] = { timestamp: cursor.key };
  
              cursor.continue();
            };
          } catch (e) {
            return callback(e);
          }
        });
      },loadLocalEntry:function (path, callback) {
        var stat, node;
  
        try {
          var lookup = FS.lookupPath(path);
          node = lookup.node;
          stat = FS.stat(path);
        } catch (e) {
          return callback(e);
        }
  
        if (FS.isDir(stat.mode)) {
          return callback(null, { timestamp: stat.mtime, mode: stat.mode });
        } else if (FS.isFile(stat.mode)) {
          // Performance consideration: storing a normal JavaScript array to a IndexedDB is much slower than storing a typed array.
          // Therefore always convert the file contents to a typed array first before writing the data to IndexedDB.
          node.contents = MEMFS.getFileDataAsTypedArray(node);
          return callback(null, { timestamp: stat.mtime, mode: stat.mode, contents: node.contents });
        } else {
          return callback(new Error('node type not supported'));
        }
      },storeLocalEntry:function (path, entry, callback) {
        try {
          if (FS.isDir(entry.mode)) {
            FS.mkdir(path, entry.mode);
          } else if (FS.isFile(entry.mode)) {
            FS.writeFile(path, entry.contents, { canOwn: true });
          } else {
            return callback(new Error('node type not supported'));
          }
  
          FS.chmod(path, entry.mode);
          FS.utime(path, entry.timestamp, entry.timestamp);
        } catch (e) {
          return callback(e);
        }
  
        callback(null);
      },removeLocalEntry:function (path, callback) {
        try {
          var lookup = FS.lookupPath(path);
          var stat = FS.stat(path);
  
          if (FS.isDir(stat.mode)) {
            FS.rmdir(path);
          } else if (FS.isFile(stat.mode)) {
            FS.unlink(path);
          }
        } catch (e) {
          return callback(e);
        }
  
        callback(null);
      },loadRemoteEntry:function (store, path, callback) {
        var req = store.get(path);
        req.onsuccess = function(event) { callback(null, event.target.result); };
        req.onerror = function(e) {
          callback(this.error);
          e.preventDefault();
        };
      },storeRemoteEntry:function (store, path, entry, callback) {
        var req = store.put(entry, path);
        req.onsuccess = function() { callback(null); };
        req.onerror = function(e) {
          callback(this.error);
          e.preventDefault();
        };
      },removeRemoteEntry:function (store, path, callback) {
        var req = store.delete(path);
        req.onsuccess = function() { callback(null); };
        req.onerror = function(e) {
          callback(this.error);
          e.preventDefault();
        };
      },reconcile:function (src, dst, callback) {
        var total = 0;
  
        var create = [];
        Object.keys(src.entries).forEach(function (key) {
          var e = src.entries[key];
          var e2 = dst.entries[key];
          if (!e2 || e.timestamp > e2.timestamp) {
            create.push(key);
            total++;
          }
        });
  
        var remove = [];
        Object.keys(dst.entries).forEach(function (key) {
          var e = dst.entries[key];
          var e2 = src.entries[key];
          if (!e2) {
            remove.push(key);
            total++;
          }
        });
  
        if (!total) {
          return callback(null);
        }
  
        var errored = false;
        var completed = 0;
        var db = src.type === 'remote' ? src.db : dst.db;
        var transaction = db.transaction([IDBFS.DB_STORE_NAME], 'readwrite');
        var store = transaction.objectStore(IDBFS.DB_STORE_NAME);
  
        function done(err) {
          if (err) {
            if (!done.errored) {
              done.errored = true;
              return callback(err);
            }
            return;
          }
          if (++completed >= total) {
            return callback(null);
          }
        };
  
        transaction.onerror = function(e) {
          done(this.error);
          e.preventDefault();
        };
  
        // sort paths in ascending order so directory entries are created
        // before the files inside them
        create.sort().forEach(function (path) {
          if (dst.type === 'local') {
            IDBFS.loadRemoteEntry(store, path, function (err, entry) {
              if (err) return done(err);
              IDBFS.storeLocalEntry(path, entry, done);
            });
          } else {
            IDBFS.loadLocalEntry(path, function (err, entry) {
              if (err) return done(err);
              IDBFS.storeRemoteEntry(store, path, entry, done);
            });
          }
        });
  
        // sort paths in descending order so files are deleted before their
        // parent directories
        remove.sort().reverse().forEach(function(path) {
          if (dst.type === 'local') {
            IDBFS.removeLocalEntry(path, done);
          } else {
            IDBFS.removeRemoteEntry(store, path, done);
          }
        });
      }};
  
  var NODEFS={isWindows:false,staticInit:function () {
        NODEFS.isWindows = !!process.platform.match(/^win/);
        var flags = process["binding"]("constants");
        // Node.js 4 compatibility: it has no namespaces for constants
        if (flags["fs"]) {
          flags = flags["fs"];
        }
        NODEFS.flagsForNodeMap = {
          "1024": flags["O_APPEND"],
          "64": flags["O_CREAT"],
          "128": flags["O_EXCL"],
          "0": flags["O_RDONLY"],
          "2": flags["O_RDWR"],
          "4096": flags["O_SYNC"],
          "512": flags["O_TRUNC"],
          "1": flags["O_WRONLY"]
        };
      },bufferFrom:function (arrayBuffer) {
        // Node.js < 4.5 compatibility: Buffer.from does not support ArrayBuffer
        // Buffer.from before 4.5 was just a method inherited from Uint8Array
        // Buffer.alloc has been added with Buffer.from together, so check it instead
        return Buffer.alloc ? Buffer.from(arrayBuffer) : new Buffer(arrayBuffer);
      },mount:function (mount) {
        assert(ENVIRONMENT_IS_NODE);
        return NODEFS.createNode(null, '/', NODEFS.getMode(mount.opts.root), 0);
      },createNode:function (parent, name, mode, dev) {
        if (!FS.isDir(mode) && !FS.isFile(mode) && !FS.isLink(mode)) {
          throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
        }
        var node = FS.createNode(parent, name, mode);
        node.node_ops = NODEFS.node_ops;
        node.stream_ops = NODEFS.stream_ops;
        return node;
      },getMode:function (path) {
        var stat;
        try {
          stat = fs.lstatSync(path);
          if (NODEFS.isWindows) {
            // Node.js on Windows never represents permission bit 'x', so
            // propagate read bits to execute bits
            stat.mode = stat.mode | ((stat.mode & 292) >> 2);
          }
        } catch (e) {
          if (!e.code) throw e;
          throw new FS.ErrnoError(ERRNO_CODES[e.code]);
        }
        return stat.mode;
      },realPath:function (node) {
        var parts = [];
        while (node.parent !== node) {
          parts.push(node.name);
          node = node.parent;
        }
        parts.push(node.mount.opts.root);
        parts.reverse();
        return PATH.join.apply(null, parts);
      },flagsForNode:function (flags) {
        flags &= ~0x200000 /*O_PATH*/; // Ignore this flag from musl, otherwise node.js fails to open the file.
        flags &= ~0x800 /*O_NONBLOCK*/; // Ignore this flag from musl, otherwise node.js fails to open the file.
        flags &= ~0x8000 /*O_LARGEFILE*/; // Ignore this flag from musl, otherwise node.js fails to open the file.
        flags &= ~0x80000 /*O_CLOEXEC*/; // Some applications may pass it; it makes no sense for a single process.
        var newFlags = 0;
        for (var k in NODEFS.flagsForNodeMap) {
          if (flags & k) {
            newFlags |= NODEFS.flagsForNodeMap[k];
            flags ^= k;
          }
        }
  
        if (!flags) {
          return newFlags;
        } else {
          throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
        }
      },node_ops:{getattr:function (node) {
          var path = NODEFS.realPath(node);
          var stat;
          try {
            stat = fs.lstatSync(path);
          } catch (e) {
            if (!e.code) throw e;
            throw new FS.ErrnoError(ERRNO_CODES[e.code]);
          }
          // node.js v0.10.20 doesn't report blksize and blocks on Windows. Fake them with default blksize of 4096.
          // See http://support.microsoft.com/kb/140365
          if (NODEFS.isWindows && !stat.blksize) {
            stat.blksize = 4096;
          }
          if (NODEFS.isWindows && !stat.blocks) {
            stat.blocks = (stat.size+stat.blksize-1)/stat.blksize|0;
          }
          return {
            dev: stat.dev,
            ino: stat.ino,
            mode: stat.mode,
            nlink: stat.nlink,
            uid: stat.uid,
            gid: stat.gid,
            rdev: stat.rdev,
            size: stat.size,
            atime: stat.atime,
            mtime: stat.mtime,
            ctime: stat.ctime,
            blksize: stat.blksize,
            blocks: stat.blocks
          };
        },setattr:function (node, attr) {
          var path = NODEFS.realPath(node);
          try {
            if (attr.mode !== undefined) {
              fs.chmodSync(path, attr.mode);
              // update the common node structure mode as well
              node.mode = attr.mode;
            }
            if (attr.timestamp !== undefined) {
              var date = new Date(attr.timestamp);
              fs.utimesSync(path, date, date);
            }
            if (attr.size !== undefined) {
              fs.truncateSync(path, attr.size);
            }
          } catch (e) {
            if (!e.code) throw e;
            throw new FS.ErrnoError(ERRNO_CODES[e.code]);
          }
        },lookup:function (parent, name) {
          var path = PATH.join2(NODEFS.realPath(parent), name);
          var mode = NODEFS.getMode(path);
          return NODEFS.createNode(parent, name, mode);
        },mknod:function (parent, name, mode, dev) {
          var node = NODEFS.createNode(parent, name, mode, dev);
          // create the backing node for this in the fs root as well
          var path = NODEFS.realPath(node);
          try {
            if (FS.isDir(node.mode)) {
              fs.mkdirSync(path, node.mode);
            } else {
              fs.writeFileSync(path, '', { mode: node.mode });
            }
          } catch (e) {
            if (!e.code) throw e;
            throw new FS.ErrnoError(ERRNO_CODES[e.code]);
          }
          return node;
        },rename:function (oldNode, newDir, newName) {
          var oldPath = NODEFS.realPath(oldNode);
          var newPath = PATH.join2(NODEFS.realPath(newDir), newName);
          try {
            fs.renameSync(oldPath, newPath);
          } catch (e) {
            if (!e.code) throw e;
            throw new FS.ErrnoError(ERRNO_CODES[e.code]);
          }
        },unlink:function (parent, name) {
          var path = PATH.join2(NODEFS.realPath(parent), name);
          try {
            fs.unlinkSync(path);
          } catch (e) {
            if (!e.code) throw e;
            throw new FS.ErrnoError(ERRNO_CODES[e.code]);
          }
        },rmdir:function (parent, name) {
          var path = PATH.join2(NODEFS.realPath(parent), name);
          try {
            fs.rmdirSync(path);
          } catch (e) {
            if (!e.code) throw e;
            throw new FS.ErrnoError(ERRNO_CODES[e.code]);
          }
        },readdir:function (node) {
          var path = NODEFS.realPath(node);
          try {
            return fs.readdirSync(path);
          } catch (e) {
            if (!e.code) throw e;
            throw new FS.ErrnoError(ERRNO_CODES[e.code]);
          }
        },symlink:function (parent, newName, oldPath) {
          var newPath = PATH.join2(NODEFS.realPath(parent), newName);
          try {
            fs.symlinkSync(oldPath, newPath);
          } catch (e) {
            if (!e.code) throw e;
            throw new FS.ErrnoError(ERRNO_CODES[e.code]);
          }
        },readlink:function (node) {
          var path = NODEFS.realPath(node);
          try {
            path = fs.readlinkSync(path);
            path = NODEJS_PATH.relative(NODEJS_PATH.resolve(node.mount.opts.root), path);
            return path;
          } catch (e) {
            if (!e.code) throw e;
            throw new FS.ErrnoError(ERRNO_CODES[e.code]);
          }
        }},stream_ops:{open:function (stream) {
          var path = NODEFS.realPath(stream.node);
          try {
            if (FS.isFile(stream.node.mode)) {
              stream.nfd = fs.openSync(path, NODEFS.flagsForNode(stream.flags));
            }
          } catch (e) {
            if (!e.code) throw e;
            throw new FS.ErrnoError(ERRNO_CODES[e.code]);
          }
        },close:function (stream) {
          try {
            if (FS.isFile(stream.node.mode) && stream.nfd) {
              fs.closeSync(stream.nfd);
            }
          } catch (e) {
            if (!e.code) throw e;
            throw new FS.ErrnoError(ERRNO_CODES[e.code]);
          }
        },read:function (stream, buffer, offset, length, position) {
          // Node.js < 6 compatibility: node errors on 0 length reads
          if (length === 0) return 0;
          try {
            return fs.readSync(stream.nfd, NODEFS.bufferFrom(buffer.buffer), offset, length, position);
          } catch (e) {
            throw new FS.ErrnoError(ERRNO_CODES[e.code]);
          }
        },write:function (stream, buffer, offset, length, position) {
          try {
            return fs.writeSync(stream.nfd, NODEFS.bufferFrom(buffer.buffer), offset, length, position);
          } catch (e) {
            throw new FS.ErrnoError(ERRNO_CODES[e.code]);
          }
        },llseek:function (stream, offset, whence) {
          var position = offset;
          if (whence === 1) {  // SEEK_CUR.
            position += stream.position;
          } else if (whence === 2) {  // SEEK_END.
            if (FS.isFile(stream.node.mode)) {
              try {
                var stat = fs.fstatSync(stream.nfd);
                position += stat.size;
              } catch (e) {
                throw new FS.ErrnoError(ERRNO_CODES[e.code]);
              }
            }
          }
  
          if (position < 0) {
            throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
          }
  
          return position;
        }}};
  
  var WORKERFS={DIR_MODE:16895,FILE_MODE:33279,reader:null,mount:function (mount) {
        assert(ENVIRONMENT_IS_WORKER);
        if (!WORKERFS.reader) WORKERFS.reader = new FileReaderSync();
        var root = WORKERFS.createNode(null, '/', WORKERFS.DIR_MODE, 0);
        var createdParents = {};
        function ensureParent(path) {
          // return the parent node, creating subdirs as necessary
          var parts = path.split('/');
          var parent = root;
          for (var i = 0; i < parts.length-1; i++) {
            var curr = parts.slice(0, i+1).join('/');
            // Issue 4254: Using curr as a node name will prevent the node
            // from being found in FS.nameTable when FS.open is called on
            // a path which holds a child of this node,
            // given that all FS functions assume node names
            // are just their corresponding parts within their given path,
            // rather than incremental aggregates which include their parent's
            // directories.
            if (!createdParents[curr]) {
              createdParents[curr] = WORKERFS.createNode(parent, parts[i], WORKERFS.DIR_MODE, 0);
            }
            parent = createdParents[curr];
          }
          return parent;
        }
        function base(path) {
          var parts = path.split('/');
          return parts[parts.length-1];
        }
        // We also accept FileList here, by using Array.prototype
        Array.prototype.forEach.call(mount.opts["files"] || [], function(file) {
          WORKERFS.createNode(ensureParent(file.name), base(file.name), WORKERFS.FILE_MODE, 0, file, file.lastModifiedDate);
        });
        (mount.opts["blobs"] || []).forEach(function(obj) {
          WORKERFS.createNode(ensureParent(obj["name"]), base(obj["name"]), WORKERFS.FILE_MODE, 0, obj["data"]);
        });
        (mount.opts["packages"] || []).forEach(function(pack) {
          pack['metadata'].files.forEach(function(file) {
            var name = file.filename.substr(1); // remove initial slash
            WORKERFS.createNode(ensureParent(name), base(name), WORKERFS.FILE_MODE, 0, pack['blob'].slice(file.start, file.end));
          });
        });
        return root;
      },createNode:function (parent, name, mode, dev, contents, mtime) {
        var node = FS.createNode(parent, name, mode);
        node.mode = mode;
        node.node_ops = WORKERFS.node_ops;
        node.stream_ops = WORKERFS.stream_ops;
        node.timestamp = (mtime || new Date).getTime();
        assert(WORKERFS.FILE_MODE !== WORKERFS.DIR_MODE);
        if (mode === WORKERFS.FILE_MODE) {
          node.size = contents.size;
          node.contents = contents;
        } else {
          node.size = 4096;
          node.contents = {};
        }
        if (parent) {
          parent.contents[name] = node;
        }
        return node;
      },node_ops:{getattr:function (node) {
          return {
            dev: 1,
            ino: undefined,
            mode: node.mode,
            nlink: 1,
            uid: 0,
            gid: 0,
            rdev: undefined,
            size: node.size,
            atime: new Date(node.timestamp),
            mtime: new Date(node.timestamp),
            ctime: new Date(node.timestamp),
            blksize: 4096,
            blocks: Math.ceil(node.size / 4096),
          };
        },setattr:function (node, attr) {
          if (attr.mode !== undefined) {
            node.mode = attr.mode;
          }
          if (attr.timestamp !== undefined) {
            node.timestamp = attr.timestamp;
          }
        },lookup:function (parent, name) {
          throw new FS.ErrnoError(ERRNO_CODES.ENOENT);
        },mknod:function (parent, name, mode, dev) {
          throw new FS.ErrnoError(ERRNO_CODES.EPERM);
        },rename:function (oldNode, newDir, newName) {
          throw new FS.ErrnoError(ERRNO_CODES.EPERM);
        },unlink:function (parent, name) {
          throw new FS.ErrnoError(ERRNO_CODES.EPERM);
        },rmdir:function (parent, name) {
          throw new FS.ErrnoError(ERRNO_CODES.EPERM);
        },readdir:function (node) {
          var entries = ['.', '..'];
          for (var key in node.contents) {
            if (!node.contents.hasOwnProperty(key)) {
              continue;
            }
            entries.push(key);
          }
          return entries;
        },symlink:function (parent, newName, oldPath) {
          throw new FS.ErrnoError(ERRNO_CODES.EPERM);
        },readlink:function (node) {
          throw new FS.ErrnoError(ERRNO_CODES.EPERM);
        }},stream_ops:{read:function (stream, buffer, offset, length, position) {
          if (position >= stream.node.size) return 0;
          var chunk = stream.node.contents.slice(position, position + length);
          var ab = WORKERFS.reader.readAsArrayBuffer(chunk);
          buffer.set(new Uint8Array(ab), offset);
          return chunk.size;
        },write:function (stream, buffer, offset, length, position) {
          throw new FS.ErrnoError(ERRNO_CODES.EIO);
        },llseek:function (stream, offset, whence) {
          var position = offset;
          if (whence === 1) {  // SEEK_CUR.
            position += stream.position;
          } else if (whence === 2) {  // SEEK_END.
            if (FS.isFile(stream.node.mode)) {
              position += stream.node.size;
            }
          }
          if (position < 0) {
            throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
          }
          return position;
        }}};
  
  var _stdin=STATICTOP; STATICTOP += 16;;
  
  var _stdout=STATICTOP; STATICTOP += 16;;
  
  var _stderr=STATICTOP; STATICTOP += 16;;var FS={root:null,mounts:[],devices:{},streams:[],nextInode:1,nameTable:null,currentPath:"/",initialized:false,ignorePermissions:true,trackingDelegate:{},tracking:{openFlags:{READ:1,WRITE:2}},ErrnoError:null,genericErrors:{},filesystems:null,syncFSRequests:0,handleFSError:function (e) {
        if (!(e instanceof FS.ErrnoError)) throw e + ' : ' + stackTrace();
        return ___setErrNo(e.errno);
      },lookupPath:function (path, opts) {
        path = PATH.resolve(FS.cwd(), path);
        opts = opts || {};
  
        if (!path) return { path: '', node: null };
  
        var defaults = {
          follow_mount: true,
          recurse_count: 0
        };
        for (var key in defaults) {
          if (opts[key] === undefined) {
            opts[key] = defaults[key];
          }
        }
  
        if (opts.recurse_count > 8) {  // max recursive lookup of 8
          throw new FS.ErrnoError(ERRNO_CODES.ELOOP);
        }
  
        // split the path
        var parts = PATH.normalizeArray(path.split('/').filter(function(p) {
          return !!p;
        }), false);
  
        // start at the root
        var current = FS.root;
        var current_path = '/';
  
        for (var i = 0; i < parts.length; i++) {
          var islast = (i === parts.length-1);
          if (islast && opts.parent) {
            // stop resolving
            break;
          }
  
          current = FS.lookupNode(current, parts[i]);
          current_path = PATH.join2(current_path, parts[i]);
  
          // jump to the mount's root node if this is a mountpoint
          if (FS.isMountpoint(current)) {
            if (!islast || (islast && opts.follow_mount)) {
              current = current.mounted.root;
            }
          }
  
          // by default, lookupPath will not follow a symlink if it is the final path component.
          // setting opts.follow = true will override this behavior.
          if (!islast || opts.follow) {
            var count = 0;
            while (FS.isLink(current.mode)) {
              var link = FS.readlink(current_path);
              current_path = PATH.resolve(PATH.dirname(current_path), link);
  
              var lookup = FS.lookupPath(current_path, { recurse_count: opts.recurse_count });
              current = lookup.node;
  
              if (count++ > 40) {  // limit max consecutive symlinks to 40 (SYMLOOP_MAX).
                throw new FS.ErrnoError(ERRNO_CODES.ELOOP);
              }
            }
          }
        }
  
        return { path: current_path, node: current };
      },getPath:function (node) {
        var path;
        while (true) {
          if (FS.isRoot(node)) {
            var mount = node.mount.mountpoint;
            if (!path) return mount;
            return mount[mount.length-1] !== '/' ? mount + '/' + path : mount + path;
          }
          path = path ? node.name + '/' + path : node.name;
          node = node.parent;
        }
      },hashName:function (parentid, name) {
        var hash = 0;
  
  
        for (var i = 0; i < name.length; i++) {
          hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
        }
        return ((parentid + hash) >>> 0) % FS.nameTable.length;
      },hashAddNode:function (node) {
        var hash = FS.hashName(node.parent.id, node.name);
        node.name_next = FS.nameTable[hash];
        FS.nameTable[hash] = node;
      },hashRemoveNode:function (node) {
        var hash = FS.hashName(node.parent.id, node.name);
        if (FS.nameTable[hash] === node) {
          FS.nameTable[hash] = node.name_next;
        } else {
          var current = FS.nameTable[hash];
          while (current) {
            if (current.name_next === node) {
              current.name_next = node.name_next;
              break;
            }
            current = current.name_next;
          }
        }
      },lookupNode:function (parent, name) {
        var err = FS.mayLookup(parent);
        if (err) {
          throw new FS.ErrnoError(err, parent);
        }
        var hash = FS.hashName(parent.id, name);
        for (var node = FS.nameTable[hash]; node; node = node.name_next) {
          var nodeName = node.name;
          if (node.parent.id === parent.id && nodeName === name) {
            return node;
          }
        }
        // if we failed to find it in the cache, call into the VFS
        return FS.lookup(parent, name);
      },createNode:function (parent, name, mode, rdev) {
        if (!FS.FSNode) {
          FS.FSNode = function(parent, name, mode, rdev) {
            if (!parent) {
              parent = this;  // root node sets parent to itself
            }
            this.parent = parent;
            this.mount = parent.mount;
            this.mounted = null;
            this.id = FS.nextInode++;
            this.name = name;
            this.mode = mode;
            this.node_ops = {};
            this.stream_ops = {};
            this.rdev = rdev;
          };
  
          FS.FSNode.prototype = {};
  
          // compatibility
          var readMode = 292 | 73;
          var writeMode = 146;
  
          // NOTE we must use Object.defineProperties instead of individual calls to
          // Object.defineProperty in order to make closure compiler happy
          Object.defineProperties(FS.FSNode.prototype, {
            read: {
              get: function() { return (this.mode & readMode) === readMode; },
              set: function(val) { val ? this.mode |= readMode : this.mode &= ~readMode; }
            },
            write: {
              get: function() { return (this.mode & writeMode) === writeMode; },
              set: function(val) { val ? this.mode |= writeMode : this.mode &= ~writeMode; }
            },
            isFolder: {
              get: function() { return FS.isDir(this.mode); }
            },
            isDevice: {
              get: function() { return FS.isChrdev(this.mode); }
            }
          });
        }
  
        var node = new FS.FSNode(parent, name, mode, rdev);
  
        FS.hashAddNode(node);
  
        return node;
      },destroyNode:function (node) {
        FS.hashRemoveNode(node);
      },isRoot:function (node) {
        return node === node.parent;
      },isMountpoint:function (node) {
        return !!node.mounted;
      },isFile:function (mode) {
        return (mode & 61440) === 32768;
      },isDir:function (mode) {
        return (mode & 61440) === 16384;
      },isLink:function (mode) {
        return (mode & 61440) === 40960;
      },isChrdev:function (mode) {
        return (mode & 61440) === 8192;
      },isBlkdev:function (mode) {
        return (mode & 61440) === 24576;
      },isFIFO:function (mode) {
        return (mode & 61440) === 4096;
      },isSocket:function (mode) {
        return (mode & 49152) === 49152;
      },flagModes:{"r":0,"rs":1052672,"r+":2,"w":577,"wx":705,"xw":705,"w+":578,"wx+":706,"xw+":706,"a":1089,"ax":1217,"xa":1217,"a+":1090,"ax+":1218,"xa+":1218},modeStringToFlags:function (str) {
        var flags = FS.flagModes[str];
        if (typeof flags === 'undefined') {
          throw new Error('Unknown file open mode: ' + str);
        }
        return flags;
      },flagsToPermissionString:function (flag) {
        var perms = ['r', 'w', 'rw'][flag & 3];
        if ((flag & 512)) {
          perms += 'w';
        }
        return perms;
      },nodePermissions:function (node, perms) {
        if (FS.ignorePermissions) {
          return 0;
        }
        // return 0 if any user, group or owner bits are set.
        if (perms.indexOf('r') !== -1 && !(node.mode & 292)) {
          return ERRNO_CODES.EACCES;
        } else if (perms.indexOf('w') !== -1 && !(node.mode & 146)) {
          return ERRNO_CODES.EACCES;
        } else if (perms.indexOf('x') !== -1 && !(node.mode & 73)) {
          return ERRNO_CODES.EACCES;
        }
        return 0;
      },mayLookup:function (dir) {
        var err = FS.nodePermissions(dir, 'x');
        if (err) return err;
        if (!dir.node_ops.lookup) return ERRNO_CODES.EACCES;
        return 0;
      },mayCreate:function (dir, name) {
        try {
          var node = FS.lookupNode(dir, name);
          return ERRNO_CODES.EEXIST;
        } catch (e) {
        }
        return FS.nodePermissions(dir, 'wx');
      },mayDelete:function (dir, name, isdir) {
        var node;
        try {
          node = FS.lookupNode(dir, name);
        } catch (e) {
          return e.errno;
        }
        var err = FS.nodePermissions(dir, 'wx');
        if (err) {
          return err;
        }
        if (isdir) {
          if (!FS.isDir(node.mode)) {
            return ERRNO_CODES.ENOTDIR;
          }
          if (FS.isRoot(node) || FS.getPath(node) === FS.cwd()) {
            return ERRNO_CODES.EBUSY;
          }
        } else {
          if (FS.isDir(node.mode)) {
            return ERRNO_CODES.EISDIR;
          }
        }
        return 0;
      },mayOpen:function (node, flags) {
        if (!node) {
          return ERRNO_CODES.ENOENT;
        }
        if (FS.isLink(node.mode)) {
          return ERRNO_CODES.ELOOP;
        } else if (FS.isDir(node.mode)) {
          if (FS.flagsToPermissionString(flags) !== 'r' || // opening for write
              (flags & 512)) { // TODO: check for O_SEARCH? (== search for dir only)
            return ERRNO_CODES.EISDIR;
          }
        }
        return FS.nodePermissions(node, FS.flagsToPermissionString(flags));
      },MAX_OPEN_FDS:4096,nextfd:function (fd_start, fd_end) {
        fd_start = fd_start || 0;
        fd_end = fd_end || FS.MAX_OPEN_FDS;
        for (var fd = fd_start; fd <= fd_end; fd++) {
          if (!FS.streams[fd]) {
            return fd;
          }
        }
        throw new FS.ErrnoError(ERRNO_CODES.EMFILE);
      },getStream:function (fd) {
        return FS.streams[fd];
      },createStream:function (stream, fd_start, fd_end) {
        if (!FS.FSStream) {
          FS.FSStream = function(){};
          FS.FSStream.prototype = {};
          // compatibility
          Object.defineProperties(FS.FSStream.prototype, {
            object: {
              get: function() { return this.node; },
              set: function(val) { this.node = val; }
            },
            isRead: {
              get: function() { return (this.flags & 2097155) !== 1; }
            },
            isWrite: {
              get: function() { return (this.flags & 2097155) !== 0; }
            },
            isAppend: {
              get: function() { return (this.flags & 1024); }
            }
          });
        }
        // clone it, so we can return an instance of FSStream
        var newStream = new FS.FSStream();
        for (var p in stream) {
          newStream[p] = stream[p];
        }
        stream = newStream;
        var fd = FS.nextfd(fd_start, fd_end);
        stream.fd = fd;
        FS.streams[fd] = stream;
        return stream;
      },closeStream:function (fd) {
        FS.streams[fd] = null;
      },chrdev_stream_ops:{open:function (stream) {
          var device = FS.getDevice(stream.node.rdev);
          // override node's stream ops with the device's
          stream.stream_ops = device.stream_ops;
          // forward the open call
          if (stream.stream_ops.open) {
            stream.stream_ops.open(stream);
          }
        },llseek:function () {
          throw new FS.ErrnoError(ERRNO_CODES.ESPIPE);
        }},major:function (dev) {
        return ((dev) >> 8);
      },minor:function (dev) {
        return ((dev) & 0xff);
      },makedev:function (ma, mi) {
        return ((ma) << 8 | (mi));
      },registerDevice:function (dev, ops) {
        FS.devices[dev] = { stream_ops: ops };
      },getDevice:function (dev) {
        return FS.devices[dev];
      },getMounts:function (mount) {
        var mounts = [];
        var check = [mount];
  
        while (check.length) {
          var m = check.pop();
  
          mounts.push(m);
  
          check.push.apply(check, m.mounts);
        }
  
        return mounts;
      },syncfs:function (populate, callback) {
        if (typeof(populate) === 'function') {
          callback = populate;
          populate = false;
        }
  
        FS.syncFSRequests++;
  
        if (FS.syncFSRequests > 1) {
          console.log('warning: ' + FS.syncFSRequests + ' FS.syncfs operations in flight at once, probably just doing extra work');
        }
  
        var mounts = FS.getMounts(FS.root.mount);
        var completed = 0;
  
        function doCallback(err) {
          assert(FS.syncFSRequests > 0);
          FS.syncFSRequests--;
          return callback(err);
        }
  
        function done(err) {
          if (err) {
            if (!done.errored) {
              done.errored = true;
              return doCallback(err);
            }
            return;
          }
          if (++completed >= mounts.length) {
            doCallback(null);
          }
        };
  
        // sync all mounts
        mounts.forEach(function (mount) {
          if (!mount.type.syncfs) {
            return done(null);
          }
          mount.type.syncfs(mount, populate, done);
        });
      },mount:function (type, opts, mountpoint) {
        var root = mountpoint === '/';
        var pseudo = !mountpoint;
        var node;
  
        if (root && FS.root) {
          throw new FS.ErrnoError(ERRNO_CODES.EBUSY);
        } else if (!root && !pseudo) {
          var lookup = FS.lookupPath(mountpoint, { follow_mount: false });
  
          mountpoint = lookup.path;  // use the absolute path
          node = lookup.node;
  
          if (FS.isMountpoint(node)) {
            throw new FS.ErrnoError(ERRNO_CODES.EBUSY);
          }
  
          if (!FS.isDir(node.mode)) {
            throw new FS.ErrnoError(ERRNO_CODES.ENOTDIR);
          }
        }
  
        var mount = {
          type: type,
          opts: opts,
          mountpoint: mountpoint,
          mounts: []
        };
  
        // create a root node for the fs
        var mountRoot = type.mount(mount);
        mountRoot.mount = mount;
        mount.root = mountRoot;
  
        if (root) {
          FS.root = mountRoot;
        } else if (node) {
          // set as a mountpoint
          node.mounted = mount;
  
          // add the new mount to the current mount's children
          if (node.mount) {
            node.mount.mounts.push(mount);
          }
        }
  
        return mountRoot;
      },unmount:function (mountpoint) {
        var lookup = FS.lookupPath(mountpoint, { follow_mount: false });
  
        if (!FS.isMountpoint(lookup.node)) {
          throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
        }
  
        // destroy the nodes for this mount, and all its child mounts
        var node = lookup.node;
        var mount = node.mounted;
        var mounts = FS.getMounts(mount);
  
        Object.keys(FS.nameTable).forEach(function (hash) {
          var current = FS.nameTable[hash];
  
          while (current) {
            var next = current.name_next;
  
            if (mounts.indexOf(current.mount) !== -1) {
              FS.destroyNode(current);
            }
  
            current = next;
          }
        });
  
        // no longer a mountpoint
        node.mounted = null;
  
        // remove this mount from the child mounts
        var idx = node.mount.mounts.indexOf(mount);
        assert(idx !== -1);
        node.mount.mounts.splice(idx, 1);
      },lookup:function (parent, name) {
        return parent.node_ops.lookup(parent, name);
      },mknod:function (path, mode, dev) {
        var lookup = FS.lookupPath(path, { parent: true });
        var parent = lookup.node;
        var name = PATH.basename(path);
        if (!name || name === '.' || name === '..') {
          throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
        }
        var err = FS.mayCreate(parent, name);
        if (err) {
          throw new FS.ErrnoError(err);
        }
        if (!parent.node_ops.mknod) {
          throw new FS.ErrnoError(ERRNO_CODES.EPERM);
        }
        return parent.node_ops.mknod(parent, name, mode, dev);
      },create:function (path, mode) {
        mode = mode !== undefined ? mode : 438 /* 0666 */;
        mode &= 4095;
        mode |= 32768;
        return FS.mknod(path, mode, 0);
      },mkdir:function (path, mode) {
        mode = mode !== undefined ? mode : 511 /* 0777 */;
        mode &= 511 | 512;
        mode |= 16384;
        return FS.mknod(path, mode, 0);
      },mkdirTree:function (path, mode) {
        var dirs = path.split('/');
        var d = '';
        for (var i = 0; i < dirs.length; ++i) {
          if (!dirs[i]) continue;
          d += '/' + dirs[i];
          try {
            FS.mkdir(d, mode);
          } catch(e) {
            if (e.errno != ERRNO_CODES.EEXIST) throw e;
          }
        }
      },mkdev:function (path, mode, dev) {
        if (typeof(dev) === 'undefined') {
          dev = mode;
          mode = 438 /* 0666 */;
        }
        mode |= 8192;
        return FS.mknod(path, mode, dev);
      },symlink:function (oldpath, newpath) {
        if (!PATH.resolve(oldpath)) {
          throw new FS.ErrnoError(ERRNO_CODES.ENOENT);
        }
        var lookup = FS.lookupPath(newpath, { parent: true });
        var parent = lookup.node;
        if (!parent) {
          throw new FS.ErrnoError(ERRNO_CODES.ENOENT);
        }
        var newname = PATH.basename(newpath);
        var err = FS.mayCreate(parent, newname);
        if (err) {
          throw new FS.ErrnoError(err);
        }
        if (!parent.node_ops.symlink) {
          throw new FS.ErrnoError(ERRNO_CODES.EPERM);
        }
        return parent.node_ops.symlink(parent, newname, oldpath);
      },rename:function (old_path, new_path) {
        var old_dirname = PATH.dirname(old_path);
        var new_dirname = PATH.dirname(new_path);
        var old_name = PATH.basename(old_path);
        var new_name = PATH.basename(new_path);
        // parents must exist
        var lookup, old_dir, new_dir;
        try {
          lookup = FS.lookupPath(old_path, { parent: true });
          old_dir = lookup.node;
          lookup = FS.lookupPath(new_path, { parent: true });
          new_dir = lookup.node;
        } catch (e) {
          throw new FS.ErrnoError(ERRNO_CODES.EBUSY);
        }
        if (!old_dir || !new_dir) throw new FS.ErrnoError(ERRNO_CODES.ENOENT);
        // need to be part of the same mount
        if (old_dir.mount !== new_dir.mount) {
          throw new FS.ErrnoError(ERRNO_CODES.EXDEV);
        }
        // source must exist
        var old_node = FS.lookupNode(old_dir, old_name);
        // old path should not be an ancestor of the new path
        var relative = PATH.relative(old_path, new_dirname);
        if (relative.charAt(0) !== '.') {
          throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
        }
        // new path should not be an ancestor of the old path
        relative = PATH.relative(new_path, old_dirname);
        if (relative.charAt(0) !== '.') {
          throw new FS.ErrnoError(ERRNO_CODES.ENOTEMPTY);
        }
        // see if the new path already exists
        var new_node;
        try {
          new_node = FS.lookupNode(new_dir, new_name);
        } catch (e) {
          // not fatal
        }
        // early out if nothing needs to change
        if (old_node === new_node) {
          return;
        }
        // we'll need to delete the old entry
        var isdir = FS.isDir(old_node.mode);
        var err = FS.mayDelete(old_dir, old_name, isdir);
        if (err) {
          throw new FS.ErrnoError(err);
        }
        // need delete permissions if we'll be overwriting.
        // need create permissions if new doesn't already exist.
        err = new_node ?
          FS.mayDelete(new_dir, new_name, isdir) :
          FS.mayCreate(new_dir, new_name);
        if (err) {
          throw new FS.ErrnoError(err);
        }
        if (!old_dir.node_ops.rename) {
          throw new FS.ErrnoError(ERRNO_CODES.EPERM);
        }
        if (FS.isMountpoint(old_node) || (new_node && FS.isMountpoint(new_node))) {
          throw new FS.ErrnoError(ERRNO_CODES.EBUSY);
        }
        // if we are going to change the parent, check write permissions
        if (new_dir !== old_dir) {
          err = FS.nodePermissions(old_dir, 'w');
          if (err) {
            throw new FS.ErrnoError(err);
          }
        }
        try {
          if (FS.trackingDelegate['willMovePath']) {
            FS.trackingDelegate['willMovePath'](old_path, new_path);
          }
        } catch(e) {
          console.log("FS.trackingDelegate['willMovePath']('"+old_path+"', '"+new_path+"') threw an exception: " + e.message);
        }
        // remove the node from the lookup hash
        FS.hashRemoveNode(old_node);
        // do the underlying fs rename
        try {
          old_dir.node_ops.rename(old_node, new_dir, new_name);
        } catch (e) {
          throw e;
        } finally {
          // add the node back to the hash (in case node_ops.rename
          // changed its name)
          FS.hashAddNode(old_node);
        }
        try {
          if (FS.trackingDelegate['onMovePath']) FS.trackingDelegate['onMovePath'](old_path, new_path);
        } catch(e) {
          console.log("FS.trackingDelegate['onMovePath']('"+old_path+"', '"+new_path+"') threw an exception: " + e.message);
        }
      },rmdir:function (path) {
        var lookup = FS.lookupPath(path, { parent: true });
        var parent = lookup.node;
        var name = PATH.basename(path);
        var node = FS.lookupNode(parent, name);
        var err = FS.mayDelete(parent, name, true);
        if (err) {
          throw new FS.ErrnoError(err);
        }
        if (!parent.node_ops.rmdir) {
          throw new FS.ErrnoError(ERRNO_CODES.EPERM);
        }
        if (FS.isMountpoint(node)) {
          throw new FS.ErrnoError(ERRNO_CODES.EBUSY);
        }
        try {
          if (FS.trackingDelegate['willDeletePath']) {
            FS.trackingDelegate['willDeletePath'](path);
          }
        } catch(e) {
          console.log("FS.trackingDelegate['willDeletePath']('"+path+"') threw an exception: " + e.message);
        }
        parent.node_ops.rmdir(parent, name);
        FS.destroyNode(node);
        try {
          if (FS.trackingDelegate['onDeletePath']) FS.trackingDelegate['onDeletePath'](path);
        } catch(e) {
          console.log("FS.trackingDelegate['onDeletePath']('"+path+"') threw an exception: " + e.message);
        }
      },readdir:function (path) {
        var lookup = FS.lookupPath(path, { follow: true });
        var node = lookup.node;
        if (!node.node_ops.readdir) {
          throw new FS.ErrnoError(ERRNO_CODES.ENOTDIR);
        }
        return node.node_ops.readdir(node);
      },unlink:function (path) {
        var lookup = FS.lookupPath(path, { parent: true });
        var parent = lookup.node;
        var name = PATH.basename(path);
        var node = FS.lookupNode(parent, name);
        var err = FS.mayDelete(parent, name, false);
        if (err) {
          // According to POSIX, we should map EISDIR to EPERM, but
          // we instead do what Linux does (and we must, as we use
          // the musl linux libc).
          throw new FS.ErrnoError(err);
        }
        if (!parent.node_ops.unlink) {
          throw new FS.ErrnoError(ERRNO_CODES.EPERM);
        }
        if (FS.isMountpoint(node)) {
          throw new FS.ErrnoError(ERRNO_CODES.EBUSY);
        }
        try {
          if (FS.trackingDelegate['willDeletePath']) {
            FS.trackingDelegate['willDeletePath'](path);
          }
        } catch(e) {
          console.log("FS.trackingDelegate['willDeletePath']('"+path+"') threw an exception: " + e.message);
        }
        parent.node_ops.unlink(parent, name);
        FS.destroyNode(node);
        try {
          if (FS.trackingDelegate['onDeletePath']) FS.trackingDelegate['onDeletePath'](path);
        } catch(e) {
          console.log("FS.trackingDelegate['onDeletePath']('"+path+"') threw an exception: " + e.message);
        }
      },readlink:function (path) {
        var lookup = FS.lookupPath(path);
        var link = lookup.node;
        if (!link) {
          throw new FS.ErrnoError(ERRNO_CODES.ENOENT);
        }
        if (!link.node_ops.readlink) {
          throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
        }
        return PATH.resolve(FS.getPath(link.parent), link.node_ops.readlink(link));
      },stat:function (path, dontFollow) {
        var lookup = FS.lookupPath(path, { follow: !dontFollow });
        var node = lookup.node;
        if (!node) {
          throw new FS.ErrnoError(ERRNO_CODES.ENOENT);
        }
        if (!node.node_ops.getattr) {
          throw new FS.ErrnoError(ERRNO_CODES.EPERM);
        }
        return node.node_ops.getattr(node);
      },lstat:function (path) {
        return FS.stat(path, true);
      },chmod:function (path, mode, dontFollow) {
        var node;
        if (typeof path === 'string') {
          var lookup = FS.lookupPath(path, { follow: !dontFollow });
          node = lookup.node;
        } else {
          node = path;
        }
        if (!node.node_ops.setattr) {
          throw new FS.ErrnoError(ERRNO_CODES.EPERM);
        }
        node.node_ops.setattr(node, {
          mode: (mode & 4095) | (node.mode & ~4095),
          timestamp: Date.now()
        });
      },lchmod:function (path, mode) {
        FS.chmod(path, mode, true);
      },fchmod:function (fd, mode) {
        var stream = FS.getStream(fd);
        if (!stream) {
          throw new FS.ErrnoError(ERRNO_CODES.EBADF);
        }
        FS.chmod(stream.node, mode);
      },chown:function (path, uid, gid, dontFollow) {
        var node;
        if (typeof path === 'string') {
          var lookup = FS.lookupPath(path, { follow: !dontFollow });
          node = lookup.node;
        } else {
          node = path;
        }
        if (!node.node_ops.setattr) {
          throw new FS.ErrnoError(ERRNO_CODES.EPERM);
        }
        node.node_ops.setattr(node, {
          timestamp: Date.now()
          // we ignore the uid / gid for now
        });
      },lchown:function (path, uid, gid) {
        FS.chown(path, uid, gid, true);
      },fchown:function (fd, uid, gid) {
        var stream = FS.getStream(fd);
        if (!stream) {
          throw new FS.ErrnoError(ERRNO_CODES.EBADF);
        }
        FS.chown(stream.node, uid, gid);
      },truncate:function (path, len) {
        if (len < 0) {
          throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
        }
        var node;
        if (typeof path === 'string') {
          var lookup = FS.lookupPath(path, { follow: true });
          node = lookup.node;
        } else {
          node = path;
        }
        if (!node.node_ops.setattr) {
          throw new FS.ErrnoError(ERRNO_CODES.EPERM);
        }
        if (FS.isDir(node.mode)) {
          throw new FS.ErrnoError(ERRNO_CODES.EISDIR);
        }
        if (!FS.isFile(node.mode)) {
          throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
        }
        var err = FS.nodePermissions(node, 'w');
        if (err) {
          throw new FS.ErrnoError(err);
        }
        node.node_ops.setattr(node, {
          size: len,
          timestamp: Date.now()
        });
      },ftruncate:function (fd, len) {
        var stream = FS.getStream(fd);
        if (!stream) {
          throw new FS.ErrnoError(ERRNO_CODES.EBADF);
        }
        if ((stream.flags & 2097155) === 0) {
          throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
        }
        FS.truncate(stream.node, len);
      },utime:function (path, atime, mtime) {
        var lookup = FS.lookupPath(path, { follow: true });
        var node = lookup.node;
        node.node_ops.setattr(node, {
          timestamp: Math.max(atime, mtime)
        });
      },open:function (path, flags, mode, fd_start, fd_end) {
        if (path === "") {
          throw new FS.ErrnoError(ERRNO_CODES.ENOENT);
        }
        flags = typeof flags === 'string' ? FS.modeStringToFlags(flags) : flags;
        mode = typeof mode === 'undefined' ? 438 /* 0666 */ : mode;
        if ((flags & 64)) {
          mode = (mode & 4095) | 32768;
        } else {
          mode = 0;
        }
        var node;
        if (typeof path === 'object') {
          node = path;
        } else {
          path = PATH.normalize(path);
          try {
            var lookup = FS.lookupPath(path, {
              follow: !(flags & 131072)
            });
            node = lookup.node;
          } catch (e) {
            // ignore
          }
        }
        // perhaps we need to create the node
        var created = false;
        if ((flags & 64)) {
          if (node) {
            // if O_CREAT and O_EXCL are set, error out if the node already exists
            if ((flags & 128)) {
              throw new FS.ErrnoError(ERRNO_CODES.EEXIST);
            }
          } else {
            // node doesn't exist, try to create it
            node = FS.mknod(path, mode, 0);
            created = true;
          }
        }
        if (!node) {
          throw new FS.ErrnoError(ERRNO_CODES.ENOENT);
        }
        // can't truncate a device
        if (FS.isChrdev(node.mode)) {
          flags &= ~512;
        }
        // if asked only for a directory, then this must be one
        if ((flags & 65536) && !FS.isDir(node.mode)) {
          throw new FS.ErrnoError(ERRNO_CODES.ENOTDIR);
        }
        // check permissions, if this is not a file we just created now (it is ok to
        // create and write to a file with read-only permissions; it is read-only
        // for later use)
        if (!created) {
          var err = FS.mayOpen(node, flags);
          if (err) {
            throw new FS.ErrnoError(err);
          }
        }
        // do truncation if necessary
        if ((flags & 512)) {
          FS.truncate(node, 0);
        }
        // we've already handled these, don't pass down to the underlying vfs
        flags &= ~(128 | 512);
  
        // register the stream with the filesystem
        var stream = FS.createStream({
          node: node,
          path: FS.getPath(node),  // we want the absolute path to the node
          flags: flags,
          seekable: true,
          position: 0,
          stream_ops: node.stream_ops,
          // used by the file family libc calls (fopen, fwrite, ferror, etc.)
          ungotten: [],
          error: false
        }, fd_start, fd_end);
        // call the new stream's open function
        if (stream.stream_ops.open) {
          stream.stream_ops.open(stream);
        }
        if (Module['logReadFiles'] && !(flags & 1)) {
          if (!FS.readFiles) FS.readFiles = {};
          if (!(path in FS.readFiles)) {
            FS.readFiles[path] = 1;
            err('read file: ' + path);
          }
        }
        try {
          if (FS.trackingDelegate['onOpenFile']) {
            var trackingFlags = 0;
            if ((flags & 2097155) !== 1) {
              trackingFlags |= FS.tracking.openFlags.READ;
            }
            if ((flags & 2097155) !== 0) {
              trackingFlags |= FS.tracking.openFlags.WRITE;
            }
            FS.trackingDelegate['onOpenFile'](path, trackingFlags);
          }
        } catch(e) {
          console.log("FS.trackingDelegate['onOpenFile']('"+path+"', flags) threw an exception: " + e.message);
        }
        return stream;
      },close:function (stream) {
        if (FS.isClosed(stream)) {
          throw new FS.ErrnoError(ERRNO_CODES.EBADF);
        }
        if (stream.getdents) stream.getdents = null; // free readdir state
        try {
          if (stream.stream_ops.close) {
            stream.stream_ops.close(stream);
          }
        } catch (e) {
          throw e;
        } finally {
          FS.closeStream(stream.fd);
        }
        stream.fd = null;
      },isClosed:function (stream) {
        return stream.fd === null;
      },llseek:function (stream, offset, whence) {
        if (FS.isClosed(stream)) {
          throw new FS.ErrnoError(ERRNO_CODES.EBADF);
        }
        if (!stream.seekable || !stream.stream_ops.llseek) {
          throw new FS.ErrnoError(ERRNO_CODES.ESPIPE);
        }
        stream.position = stream.stream_ops.llseek(stream, offset, whence);
        stream.ungotten = [];
        return stream.position;
      },read:function (stream, buffer, offset, length, position) {
        if (length < 0 || position < 0) {
          throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
        }
        if (FS.isClosed(stream)) {
          throw new FS.ErrnoError(ERRNO_CODES.EBADF);
        }
        if ((stream.flags & 2097155) === 1) {
          throw new FS.ErrnoError(ERRNO_CODES.EBADF);
        }
        if (FS.isDir(stream.node.mode)) {
          throw new FS.ErrnoError(ERRNO_CODES.EISDIR);
        }
        if (!stream.stream_ops.read) {
          throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
        }
        var seeking = typeof position !== 'undefined';
        if (!seeking) {
          position = stream.position;
        } else if (!stream.seekable) {
          throw new FS.ErrnoError(ERRNO_CODES.ESPIPE);
        }
        var bytesRead = stream.stream_ops.read(stream, buffer, offset, length, position);
        if (!seeking) stream.position += bytesRead;
        return bytesRead;
      },write:function (stream, buffer, offset, length, position, canOwn) {
        if (length < 0 || position < 0) {
          throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
        }
        if (FS.isClosed(stream)) {
          throw new FS.ErrnoError(ERRNO_CODES.EBADF);
        }
        if ((stream.flags & 2097155) === 0) {
          throw new FS.ErrnoError(ERRNO_CODES.EBADF);
        }
        if (FS.isDir(stream.node.mode)) {
          throw new FS.ErrnoError(ERRNO_CODES.EISDIR);
        }
        if (!stream.stream_ops.write) {
          throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
        }
        if (stream.flags & 1024) {
          // seek to the end before writing in append mode
          FS.llseek(stream, 0, 2);
        }
        var seeking = typeof position !== 'undefined';
        if (!seeking) {
          position = stream.position;
        } else if (!stream.seekable) {
          throw new FS.ErrnoError(ERRNO_CODES.ESPIPE);
        }
        var bytesWritten = stream.stream_ops.write(stream, buffer, offset, length, position, canOwn);
        if (!seeking) stream.position += bytesWritten;
        try {
          if (stream.path && FS.trackingDelegate['onWriteToFile']) FS.trackingDelegate['onWriteToFile'](stream.path);
        } catch(e) {
          console.log("FS.trackingDelegate['onWriteToFile']('"+path+"') threw an exception: " + e.message);
        }
        return bytesWritten;
      },allocate:function (stream, offset, length) {
        if (FS.isClosed(stream)) {
          throw new FS.ErrnoError(ERRNO_CODES.EBADF);
        }
        if (offset < 0 || length <= 0) {
          throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
        }
        if ((stream.flags & 2097155) === 0) {
          throw new FS.ErrnoError(ERRNO_CODES.EBADF);
        }
        if (!FS.isFile(stream.node.mode) && !FS.isDir(stream.node.mode)) {
          throw new FS.ErrnoError(ERRNO_CODES.ENODEV);
        }
        if (!stream.stream_ops.allocate) {
          throw new FS.ErrnoError(ERRNO_CODES.EOPNOTSUPP);
        }
        stream.stream_ops.allocate(stream, offset, length);
      },mmap:function (stream, buffer, offset, length, position, prot, flags) {
        // TODO if PROT is PROT_WRITE, make sure we have write access
        if ((stream.flags & 2097155) === 1) {
          throw new FS.ErrnoError(ERRNO_CODES.EACCES);
        }
        if (!stream.stream_ops.mmap) {
          throw new FS.ErrnoError(ERRNO_CODES.ENODEV);
        }
        return stream.stream_ops.mmap(stream, buffer, offset, length, position, prot, flags);
      },msync:function (stream, buffer, offset, length, mmapFlags) {
        if (!stream || !stream.stream_ops.msync) {
          return 0;
        }
        return stream.stream_ops.msync(stream, buffer, offset, length, mmapFlags);
      },munmap:function (stream) {
        return 0;
      },ioctl:function (stream, cmd, arg) {
        if (!stream.stream_ops.ioctl) {
          throw new FS.ErrnoError(ERRNO_CODES.ENOTTY);
        }
        return stream.stream_ops.ioctl(stream, cmd, arg);
      },readFile:function (path, opts) {
        opts = opts || {};
        opts.flags = opts.flags || 'r';
        opts.encoding = opts.encoding || 'binary';
        if (opts.encoding !== 'utf8' && opts.encoding !== 'binary') {
          throw new Error('Invalid encoding type "' + opts.encoding + '"');
        }
        var ret;
        var stream = FS.open(path, opts.flags);
        var stat = FS.stat(path);
        var length = stat.size;
        var buf = new Uint8Array(length);
        FS.read(stream, buf, 0, length, 0);
        if (opts.encoding === 'utf8') {
          ret = UTF8ArrayToString(buf, 0);
        } else if (opts.encoding === 'binary') {
          ret = buf;
        }
        FS.close(stream);
        return ret;
      },writeFile:function (path, data, opts) {
        opts = opts || {};
        opts.flags = opts.flags || 'w';
        var stream = FS.open(path, opts.flags, opts.mode);
        if (typeof data === 'string') {
          var buf = new Uint8Array(lengthBytesUTF8(data)+1);
          var actualNumBytes = stringToUTF8Array(data, buf, 0, buf.length);
          FS.write(stream, buf, 0, actualNumBytes, undefined, opts.canOwn);
        } else if (ArrayBuffer.isView(data)) {
          FS.write(stream, data, 0, data.byteLength, undefined, opts.canOwn);
        } else {
          throw new Error('Unsupported data type');
        }
        FS.close(stream);
      },cwd:function () {
        return FS.currentPath;
      },chdir:function (path) {
        var lookup = FS.lookupPath(path, { follow: true });
        if (lookup.node === null) {
          throw new FS.ErrnoError(ERRNO_CODES.ENOENT);
        }
        if (!FS.isDir(lookup.node.mode)) {
          throw new FS.ErrnoError(ERRNO_CODES.ENOTDIR);
        }
        var err = FS.nodePermissions(lookup.node, 'x');
        if (err) {
          throw new FS.ErrnoError(err);
        }
        FS.currentPath = lookup.path;
      },createDefaultDirectories:function () {
        FS.mkdir('/tmp');
        FS.mkdir('/home');
        FS.mkdir('/home/web_user');
      },createDefaultDevices:function () {
        // create /dev
        FS.mkdir('/dev');
        // setup /dev/null
        FS.registerDevice(FS.makedev(1, 3), {
          read: function() { return 0; },
          write: function(stream, buffer, offset, length, pos) { return length; }
        });
        FS.mkdev('/dev/null', FS.makedev(1, 3));
        // setup /dev/tty and /dev/tty1
        // stderr needs to print output using Module['printErr']
        // so we register a second tty just for it.
        TTY.register(FS.makedev(5, 0), TTY.default_tty_ops);
        TTY.register(FS.makedev(6, 0), TTY.default_tty1_ops);
        FS.mkdev('/dev/tty', FS.makedev(5, 0));
        FS.mkdev('/dev/tty1', FS.makedev(6, 0));
        // setup /dev/[u]random
        var random_device;
        if (typeof crypto !== 'undefined') {
          // for modern web browsers
          var randomBuffer = new Uint8Array(1);
          random_device = function() { crypto.getRandomValues(randomBuffer); return randomBuffer[0]; };
        } else if (ENVIRONMENT_IS_NODE) {
        } else {
          // default for ES5 platforms
          random_device = function() { abort("random_device"); /*Math.random() is not safe for random number generation, so this fallback random_device implementation aborts... see kripken/emscripten/pull/7096 */ };
        }
        FS.createDevice('/dev', 'random', random_device);
        FS.createDevice('/dev', 'urandom', random_device);
        // we're not going to emulate the actual shm device,
        // just create the tmp dirs that reside in it commonly
        FS.mkdir('/dev/shm');
        FS.mkdir('/dev/shm/tmp');
      },createSpecialDirectories:function () {
        // create /proc/self/fd which allows /proc/self/fd/6 => readlink gives the name of the stream for fd 6 (see test_unistd_ttyname)
        FS.mkdir('/proc');
        FS.mkdir('/proc/self');
        FS.mkdir('/proc/self/fd');
        FS.mount({
          mount: function() {
            var node = FS.createNode('/proc/self', 'fd', 16384 | 511 /* 0777 */, 73);
            node.node_ops = {
              lookup: function(parent, name) {
                var fd = +name;
                var stream = FS.getStream(fd);
                if (!stream) throw new FS.ErrnoError(ERRNO_CODES.EBADF);
                var ret = {
                  parent: null,
                  mount: { mountpoint: 'fake' },
                  node_ops: { readlink: function() { return stream.path } }
                };
                ret.parent = ret; // make it look like a simple root node
                return ret;
              }
            };
            return node;
          }
        }, {}, '/proc/self/fd');
      },createStandardStreams:function () {
        // TODO deprecate the old functionality of a single
        // input / output callback and that utilizes FS.createDevice
        // and instead require a unique set of stream ops
  
        // by default, we symlink the standard streams to the
        // default tty devices. however, if the standard streams
        // have been overwritten we create a unique device for
        // them instead.
        if (Module['stdin']) {
          FS.createDevice('/dev', 'stdin', Module['stdin']);
        } else {
          FS.symlink('/dev/tty', '/dev/stdin');
        }
        if (Module['stdout']) {
          FS.createDevice('/dev', 'stdout', null, Module['stdout']);
        } else {
          FS.symlink('/dev/tty', '/dev/stdout');
        }
        if (Module['stderr']) {
          FS.createDevice('/dev', 'stderr', null, Module['stderr']);
        } else {
          FS.symlink('/dev/tty1', '/dev/stderr');
        }
  
        // open default streams for the stdin, stdout and stderr devices
        var stdin = FS.open('/dev/stdin', 'r');
        assert(stdin.fd === 0, 'invalid handle for stdin (' + stdin.fd + ')');
  
        var stdout = FS.open('/dev/stdout', 'w');
        assert(stdout.fd === 1, 'invalid handle for stdout (' + stdout.fd + ')');
  
        var stderr = FS.open('/dev/stderr', 'w');
        assert(stderr.fd === 2, 'invalid handle for stderr (' + stderr.fd + ')');
      },ensureErrnoError:function () {
        if (FS.ErrnoError) return;
        FS.ErrnoError = function ErrnoError(errno, node) {
          //err(stackTrace()); // useful for debugging
          this.node = node;
          this.setErrno = function(errno) {
            this.errno = errno;
            for (var key in ERRNO_CODES) {
              if (ERRNO_CODES[key] === errno) {
                this.code = key;
                break;
              }
            }
          };
          this.setErrno(errno);
          this.message = ERRNO_MESSAGES[errno];
          // Node.js compatibility: assigning on this.stack fails on Node 4 (but fixed on Node 8)
          if (this.stack) Object.defineProperty(this, "stack", { value: (new Error).stack, writable: true });
        };
        FS.ErrnoError.prototype = new Error();
        FS.ErrnoError.prototype.constructor = FS.ErrnoError;
        // Some errors may happen quite a bit, to avoid overhead we reuse them (and suffer a lack of stack info)
        [ERRNO_CODES.ENOENT].forEach(function(code) {
          FS.genericErrors[code] = new FS.ErrnoError(code);
          FS.genericErrors[code].stack = '<generic error, no stack>';
        });
      },staticInit:function () {
        FS.ensureErrnoError();
  
        FS.nameTable = new Array(4096);
  
        FS.mount(MEMFS, {}, '/');
  
        FS.createDefaultDirectories();
        FS.createDefaultDevices();
        FS.createSpecialDirectories();
  
        FS.filesystems = {
          'MEMFS': MEMFS,
          'IDBFS': IDBFS,
          'NODEFS': NODEFS,
          'WORKERFS': WORKERFS,
        };
      },init:function (input, output, error) {
        assert(!FS.init.initialized, 'FS.init was previously called. If you want to initialize later with custom parameters, remove any earlier calls (note that one is automatically added to the generated code)');
        FS.init.initialized = true;
  
        FS.ensureErrnoError();
  
        // Allow Module.stdin etc. to provide defaults, if none explicitly passed to us here
        Module['stdin'] = input || Module['stdin'];
        Module['stdout'] = output || Module['stdout'];
        Module['stderr'] = error || Module['stderr'];
  
        FS.createStandardStreams();
      },quit:function () {
        FS.init.initialized = false;
        // force-flush all streams, so we get musl std streams printed out
        var fflush = Module['_fflush'];
        if (fflush) fflush(0);
        // close all of our streams
        for (var i = 0; i < FS.streams.length; i++) {
          var stream = FS.streams[i];
          if (!stream) {
            continue;
          }
          FS.close(stream);
        }
      },getMode:function (canRead, canWrite) {
        var mode = 0;
        if (canRead) mode |= 292 | 73;
        if (canWrite) mode |= 146;
        return mode;
      },joinPath:function (parts, forceRelative) {
        var path = PATH.join.apply(null, parts);
        if (forceRelative && path[0] == '/') path = path.substr(1);
        return path;
      },absolutePath:function (relative, base) {
        return PATH.resolve(base, relative);
      },standardizePath:function (path) {
        return PATH.normalize(path);
      },findObject:function (path, dontResolveLastLink) {
        var ret = FS.analyzePath(path, dontResolveLastLink);
        if (ret.exists) {
          return ret.object;
        } else {
          ___setErrNo(ret.error);
          return null;
        }
      },analyzePath:function (path, dontResolveLastLink) {
        // operate from within the context of the symlink's target
        try {
          var lookup = FS.lookupPath(path, { follow: !dontResolveLastLink });
          path = lookup.path;
        } catch (e) {
        }
        var ret = {
          isRoot: false, exists: false, error: 0, name: null, path: null, object: null,
          parentExists: false, parentPath: null, parentObject: null
        };
        try {
          var lookup = FS.lookupPath(path, { parent: true });
          ret.parentExists = true;
          ret.parentPath = lookup.path;
          ret.parentObject = lookup.node;
          ret.name = PATH.basename(path);
          lookup = FS.lookupPath(path, { follow: !dontResolveLastLink });
          ret.exists = true;
          ret.path = lookup.path;
          ret.object = lookup.node;
          ret.name = lookup.node.name;
          ret.isRoot = lookup.path === '/';
        } catch (e) {
          ret.error = e.errno;
        };
        return ret;
      },createFolder:function (parent, name, canRead, canWrite) {
        var path = PATH.join2(typeof parent === 'string' ? parent : FS.getPath(parent), name);
        var mode = FS.getMode(canRead, canWrite);
        return FS.mkdir(path, mode);
      },createPath:function (parent, path, canRead, canWrite) {
        parent = typeof parent === 'string' ? parent : FS.getPath(parent);
        var parts = path.split('/').reverse();
        while (parts.length) {
          var part = parts.pop();
          if (!part) continue;
          var current = PATH.join2(parent, part);
          try {
            FS.mkdir(current);
          } catch (e) {
            // ignore EEXIST
          }
          parent = current;
        }
        return current;
      },createFile:function (parent, name, properties, canRead, canWrite) {
        var path = PATH.join2(typeof parent === 'string' ? parent : FS.getPath(parent), name);
        var mode = FS.getMode(canRead, canWrite);
        return FS.create(path, mode);
      },createDataFile:function (parent, name, data, canRead, canWrite, canOwn) {
        var path = name ? PATH.join2(typeof parent === 'string' ? parent : FS.getPath(parent), name) : parent;
        var mode = FS.getMode(canRead, canWrite);
        var node = FS.create(path, mode);
        if (data) {
          if (typeof data === 'string') {
            var arr = new Array(data.length);
            for (var i = 0, len = data.length; i < len; ++i) arr[i] = data.charCodeAt(i);
            data = arr;
          }
          // make sure we can write to the file
          FS.chmod(node, mode | 146);
          var stream = FS.open(node, 'w');
          FS.write(stream, data, 0, data.length, 0, canOwn);
          FS.close(stream);
          FS.chmod(node, mode);
        }
        return node;
      },createDevice:function (parent, name, input, output) {
        var path = PATH.join2(typeof parent === 'string' ? parent : FS.getPath(parent), name);
        var mode = FS.getMode(!!input, !!output);
        if (!FS.createDevice.major) FS.createDevice.major = 64;
        var dev = FS.makedev(FS.createDevice.major++, 0);
        // Create a fake device that a set of stream ops to emulate
        // the old behavior.
        FS.registerDevice(dev, {
          open: function(stream) {
            stream.seekable = false;
          },
          close: function(stream) {
            // flush any pending line data
            if (output && output.buffer && output.buffer.length) {
              output(10);
            }
          },
          read: function(stream, buffer, offset, length, pos /* ignored */) {
            var bytesRead = 0;
            for (var i = 0; i < length; i++) {
              var result;
              try {
                result = input();
              } catch (e) {
                throw new FS.ErrnoError(ERRNO_CODES.EIO);
              }
              if (result === undefined && bytesRead === 0) {
                throw new FS.ErrnoError(ERRNO_CODES.EAGAIN);
              }
              if (result === null || result === undefined) break;
              bytesRead++;
              buffer[offset+i] = result;
            }
            if (bytesRead) {
              stream.node.timestamp = Date.now();
            }
            return bytesRead;
          },
          write: function(stream, buffer, offset, length, pos) {
            for (var i = 0; i < length; i++) {
              try {
                output(buffer[offset+i]);
              } catch (e) {
                throw new FS.ErrnoError(ERRNO_CODES.EIO);
              }
            }
            if (length) {
              stream.node.timestamp = Date.now();
            }
            return i;
          }
        });
        return FS.mkdev(path, mode, dev);
      },createLink:function (parent, name, target, canRead, canWrite) {
        var path = PATH.join2(typeof parent === 'string' ? parent : FS.getPath(parent), name);
        return FS.symlink(target, path);
      },forceLoadFile:function (obj) {
        if (obj.isDevice || obj.isFolder || obj.link || obj.contents) return true;
        var success = true;
        if (typeof XMLHttpRequest !== 'undefined') {
          throw new Error("Lazy loading should have been performed (contents set) in createLazyFile, but it was not. Lazy loading only works in web workers. Use --embed-file or --preload-file in emcc on the main thread.");
        } else if (Module['read']) {
          // Command-line.
          try {
            // WARNING: Can't read binary files in V8's d8 or tracemonkey's js, as
            //          read() will try to parse UTF8.
            obj.contents = intArrayFromString(Module['read'](obj.url), true);
            obj.usedBytes = obj.contents.length;
          } catch (e) {
            success = false;
          }
        } else {
          throw new Error('Cannot load without read() or XMLHttpRequest.');
        }
        if (!success) ___setErrNo(ERRNO_CODES.EIO);
        return success;
      },createLazyFile:function (parent, name, url, canRead, canWrite) {
        // Lazy chunked Uint8Array (implements get and length from Uint8Array). Actual getting is abstracted away for eventual reuse.
        function LazyUint8Array() {
          this.lengthKnown = false;
          this.chunks = []; // Loaded chunks. Index is the chunk number
        }
        LazyUint8Array.prototype.get = function LazyUint8Array_get(idx) {
          if (idx > this.length-1 || idx < 0) {
            return undefined;
          }
          var chunkOffset = idx % this.chunkSize;
          var chunkNum = (idx / this.chunkSize)|0;
          return this.getter(chunkNum)[chunkOffset];
        }
        LazyUint8Array.prototype.setDataGetter = function LazyUint8Array_setDataGetter(getter) {
          this.getter = getter;
        }
        LazyUint8Array.prototype.cacheLength = function LazyUint8Array_cacheLength() {
          // Find length
          var xhr = new XMLHttpRequest();
          xhr.open('HEAD', url, false);
          xhr.send(null);
          if (!(xhr.status >= 200 && xhr.status < 300 || xhr.status === 304)) throw new Error("Couldn't load " + url + ". Status: " + xhr.status);
          var datalength = Number(xhr.getResponseHeader("Content-length"));
          var header;
          var hasByteServing = (header = xhr.getResponseHeader("Accept-Ranges")) && header === "bytes";
          var usesGzip = (header = xhr.getResponseHeader("Content-Encoding")) && header === "gzip";
  
          var chunkSize = 1024*1024; // Chunk size in bytes
  
          if (!hasByteServing) chunkSize = datalength;
  
          // Function to get a range from the remote URL.
          var doXHR = (function(from, to) {
            if (from > to) throw new Error("invalid range (" + from + ", " + to + ") or no bytes requested!");
            if (to > datalength-1) throw new Error("only " + datalength + " bytes available! programmer error!");
  
            // TODO: Use mozResponseArrayBuffer, responseStream, etc. if available.
            var xhr = new XMLHttpRequest();
            xhr.open('GET', url, false);
            if (datalength !== chunkSize) xhr.setRequestHeader("Range", "bytes=" + from + "-" + to);
  
            // Some hints to the browser that we want binary data.
            if (typeof Uint8Array != 'undefined') xhr.responseType = 'arraybuffer';
            if (xhr.overrideMimeType) {
              xhr.overrideMimeType('text/plain; charset=x-user-defined');
            }
  
            xhr.send(null);
            if (!(xhr.status >= 200 && xhr.status < 300 || xhr.status === 304)) throw new Error("Couldn't load " + url + ". Status: " + xhr.status);
            if (xhr.response !== undefined) {
              return new Uint8Array(xhr.response || []);
            } else {
              return intArrayFromString(xhr.responseText || '', true);
            }
          });
          var lazyArray = this;
          lazyArray.setDataGetter(function(chunkNum) {
            var start = chunkNum * chunkSize;
            var end = (chunkNum+1) * chunkSize - 1; // including this byte
            end = Math.min(end, datalength-1); // if datalength-1 is selected, this is the last block
            if (typeof(lazyArray.chunks[chunkNum]) === "undefined") {
              lazyArray.chunks[chunkNum] = doXHR(start, end);
            }
            if (typeof(lazyArray.chunks[chunkNum]) === "undefined") throw new Error("doXHR failed!");
            return lazyArray.chunks[chunkNum];
          });
  
          if (usesGzip || !datalength) {
            // if the server uses gzip or doesn't supply the length, we have to download the whole file to get the (uncompressed) length
            chunkSize = datalength = 1; // this will force getter(0)/doXHR do download the whole file
            datalength = this.getter(0).length;
            chunkSize = datalength;
            console.log("LazyFiles on gzip forces download of the whole file when length is accessed");
          }
  
          this._length = datalength;
          this._chunkSize = chunkSize;
          this.lengthKnown = true;
        }
        if (typeof XMLHttpRequest !== 'undefined') {
          if (!ENVIRONMENT_IS_WORKER) throw 'Cannot do synchronous binary XHRs outside webworkers in modern browsers. Use --embed-file or --preload-file in emcc';
          var lazyArray = new LazyUint8Array();
          Object.defineProperties(lazyArray, {
            length: {
              get: function() {
                if(!this.lengthKnown) {
                  this.cacheLength();
                }
                return this._length;
              }
            },
            chunkSize: {
              get: function() {
                if(!this.lengthKnown) {
                  this.cacheLength();
                }
                return this._chunkSize;
              }
            }
          });
  
          var properties = { isDevice: false, contents: lazyArray };
        } else {
          var properties = { isDevice: false, url: url };
        }
  
        var node = FS.createFile(parent, name, properties, canRead, canWrite);
        // This is a total hack, but I want to get this lazy file code out of the
        // core of MEMFS. If we want to keep this lazy file concept I feel it should
        // be its own thin LAZYFS proxying calls to MEMFS.
        if (properties.contents) {
          node.contents = properties.contents;
        } else if (properties.url) {
          node.contents = null;
          node.url = properties.url;
        }
        // Add a function that defers querying the file size until it is asked the first time.
        Object.defineProperties(node, {
          usedBytes: {
            get: function() { return this.contents.length; }
          }
        });
        // override each stream op with one that tries to force load the lazy file first
        var stream_ops = {};
        var keys = Object.keys(node.stream_ops);
        keys.forEach(function(key) {
          var fn = node.stream_ops[key];
          stream_ops[key] = function forceLoadLazyFile() {
            if (!FS.forceLoadFile(node)) {
              throw new FS.ErrnoError(ERRNO_CODES.EIO);
            }
            return fn.apply(null, arguments);
          };
        });
        // use a custom read function
        stream_ops.read = function stream_ops_read(stream, buffer, offset, length, position) {
          if (!FS.forceLoadFile(node)) {
            throw new FS.ErrnoError(ERRNO_CODES.EIO);
          }
          var contents = stream.node.contents;
          if (position >= contents.length)
            return 0;
          var size = Math.min(contents.length - position, length);
          assert(size >= 0);
          if (contents.slice) { // normal array
            for (var i = 0; i < size; i++) {
              buffer[offset + i] = contents[position + i];
            }
          } else {
            for (var i = 0; i < size; i++) { // LazyUint8Array from sync binary XHR
              buffer[offset + i] = contents.get(position + i);
            }
          }
          return size;
        };
        node.stream_ops = stream_ops;
        return node;
      },createPreloadedFile:function (parent, name, url, canRead, canWrite, onload, onerror, dontCreateFile, canOwn, preFinish) {
        Browser.init(); // XXX perhaps this method should move onto Browser?
        // TODO we should allow people to just pass in a complete filename instead
        // of parent and name being that we just join them anyways
        var fullname = name ? PATH.resolve(PATH.join2(parent, name)) : parent;
        var dep = getUniqueRunDependency('cp ' + fullname); // might have several active requests for the same fullname
        function processData(byteArray) {
          function finish(byteArray) {
            if (preFinish) preFinish();
            if (!dontCreateFile) {
              FS.createDataFile(parent, name, byteArray, canRead, canWrite, canOwn);
            }
            if (onload) onload();
            removeRunDependency(dep);
          }
          var handled = false;
          Module['preloadPlugins'].forEach(function(plugin) {
            if (handled) return;
            if (plugin['canHandle'](fullname)) {
              plugin['handle'](byteArray, fullname, finish, function() {
                if (onerror) onerror();
                removeRunDependency(dep);
              });
              handled = true;
            }
          });
          if (!handled) finish(byteArray);
        }
        addRunDependency(dep);
        if (typeof url == 'string') {
          Browser.asyncLoad(url, function(byteArray) {
            processData(byteArray);
          }, onerror);
        } else {
          processData(url);
        }
      },indexedDB:function () {
        return window.indexedDB || window.mozIndexedDB || window.webkitIndexedDB || window.msIndexedDB;
      },DB_NAME:function () {
        return 'EM_FS_' + window.location.pathname;
      },DB_VERSION:20,DB_STORE_NAME:"FILE_DATA",saveFilesToDB:function (paths, onload, onerror) {
        onload = onload || function(){};
        onerror = onerror || function(){};
        var indexedDB = FS.indexedDB();
        try {
          var openRequest = indexedDB.open(FS.DB_NAME(), FS.DB_VERSION);
        } catch (e) {
          return onerror(e);
        }
        openRequest.onupgradeneeded = function openRequest_onupgradeneeded() {
          console.log('creating db');
          var db = openRequest.result;
          db.createObjectStore(FS.DB_STORE_NAME);
        };
        openRequest.onsuccess = function openRequest_onsuccess() {
          var db = openRequest.result;
          var transaction = db.transaction([FS.DB_STORE_NAME], 'readwrite');
          var files = transaction.objectStore(FS.DB_STORE_NAME);
          var ok = 0, fail = 0, total = paths.length;
          function finish() {
            if (fail == 0) onload(); else onerror();
          }
          paths.forEach(function(path) {
            var putRequest = files.put(FS.analyzePath(path).object.contents, path);
            putRequest.onsuccess = function putRequest_onsuccess() { ok++; if (ok + fail == total) finish() };
            putRequest.onerror = function putRequest_onerror() { fail++; if (ok + fail == total) finish() };
          });
          transaction.onerror = onerror;
        };
        openRequest.onerror = onerror;
      },loadFilesFromDB:function (paths, onload, onerror) {
        onload = onload || function(){};
        onerror = onerror || function(){};
        var indexedDB = FS.indexedDB();
        try {
          var openRequest = indexedDB.open(FS.DB_NAME(), FS.DB_VERSION);
        } catch (e) {
          return onerror(e);
        }
        openRequest.onupgradeneeded = onerror; // no database to load from
        openRequest.onsuccess = function openRequest_onsuccess() {
          var db = openRequest.result;
          try {
            var transaction = db.transaction([FS.DB_STORE_NAME], 'readonly');
          } catch(e) {
            onerror(e);
            return;
          }
          var files = transaction.objectStore(FS.DB_STORE_NAME);
          var ok = 0, fail = 0, total = paths.length;
          function finish() {
            if (fail == 0) onload(); else onerror();
          }
          paths.forEach(function(path) {
            var getRequest = files.get(path);
            getRequest.onsuccess = function getRequest_onsuccess() {
              if (FS.analyzePath(path).exists) {
                FS.unlink(path);
              }
              FS.createDataFile(PATH.dirname(path), PATH.basename(path), getRequest.result, true, true, true);
              ok++;
              if (ok + fail == total) finish();
            };
            getRequest.onerror = function getRequest_onerror() { fail++; if (ok + fail == total) finish() };
          });
          transaction.onerror = onerror;
        };
        openRequest.onerror = onerror;
      }};var SYSCALLS={DEFAULT_POLLMASK:5,mappings:{},umask:511,calculateAt:function (dirfd, path) {
        if (path[0] !== '/') {
          // relative path
          var dir;
          if (dirfd === -100) {
            dir = FS.cwd();
          } else {
            var dirstream = FS.getStream(dirfd);
            if (!dirstream) throw new FS.ErrnoError(ERRNO_CODES.EBADF);
            dir = dirstream.path;
          }
          path = PATH.join2(dir, path);
        }
        return path;
      },doStat:function (func, path, buf) {
        try {
          var stat = func(path);
        } catch (e) {
          if (e && e.node && PATH.normalize(path) !== PATH.normalize(FS.getPath(e.node))) {
            // an error occurred while trying to look up the path; we should just report ENOTDIR
            return -ERRNO_CODES.ENOTDIR;
          }
          throw e;
        }
        HEAP32[((buf)>>2)]=stat.dev;
        HEAP32[(((buf)+(4))>>2)]=0;
        HEAP32[(((buf)+(8))>>2)]=stat.ino;
        HEAP32[(((buf)+(12))>>2)]=stat.mode;
        HEAP32[(((buf)+(16))>>2)]=stat.nlink;
        HEAP32[(((buf)+(20))>>2)]=stat.uid;
        HEAP32[(((buf)+(24))>>2)]=stat.gid;
        HEAP32[(((buf)+(28))>>2)]=stat.rdev;
        HEAP32[(((buf)+(32))>>2)]=0;
        HEAP32[(((buf)+(36))>>2)]=stat.size;
        HEAP32[(((buf)+(40))>>2)]=4096;
        HEAP32[(((buf)+(44))>>2)]=stat.blocks;
        HEAP32[(((buf)+(48))>>2)]=(stat.atime.getTime() / 1000)|0;
        HEAP32[(((buf)+(52))>>2)]=0;
        HEAP32[(((buf)+(56))>>2)]=(stat.mtime.getTime() / 1000)|0;
        HEAP32[(((buf)+(60))>>2)]=0;
        HEAP32[(((buf)+(64))>>2)]=(stat.ctime.getTime() / 1000)|0;
        HEAP32[(((buf)+(68))>>2)]=0;
        HEAP32[(((buf)+(72))>>2)]=stat.ino;
        return 0;
      },doMsync:function (addr, stream, len, flags) {
        var buffer = new Uint8Array(HEAPU8.subarray(addr, addr + len));
        FS.msync(stream, buffer, 0, len, flags);
      },doMkdir:function (path, mode) {
        // remove a trailing slash, if one - /a/b/ has basename of '', but
        // we want to create b in the context of this function
        path = PATH.normalize(path);
        if (path[path.length-1] === '/') path = path.substr(0, path.length-1);
        FS.mkdir(path, mode, 0);
        return 0;
      },doMknod:function (path, mode, dev) {
        // we don't want this in the JS API as it uses mknod to create all nodes.
        switch (mode & 61440) {
          case 32768:
          case 8192:
          case 24576:
          case 4096:
          case 49152:
            break;
          default: return -ERRNO_CODES.EINVAL;
        }
        FS.mknod(path, mode, dev);
        return 0;
      },doReadlink:function (path, buf, bufsize) {
        if (bufsize <= 0) return -ERRNO_CODES.EINVAL;
        var ret = FS.readlink(path);
  
        var len = Math.min(bufsize, lengthBytesUTF8(ret));
        var endChar = HEAP8[buf+len];
        stringToUTF8(ret, buf, bufsize+1);
        // readlink is one of the rare functions that write out a C string, but does never append a null to the output buffer(!)
        // stringToUTF8() always appends a null byte, so restore the character under the null byte after the write.
        HEAP8[buf+len] = endChar;
  
        return len;
      },doAccess:function (path, amode) {
        if (amode & ~7) {
          // need a valid mode
          return -ERRNO_CODES.EINVAL;
        }
        var node;
        var lookup = FS.lookupPath(path, { follow: true });
        node = lookup.node;
        var perms = '';
        if (amode & 4) perms += 'r';
        if (amode & 2) perms += 'w';
        if (amode & 1) perms += 'x';
        if (perms /* otherwise, they've just passed F_OK */ && FS.nodePermissions(node, perms)) {
          return -ERRNO_CODES.EACCES;
        }
        return 0;
      },doDup:function (path, flags, suggestFD) {
        var suggest = FS.getStream(suggestFD);
        if (suggest) FS.close(suggest);
        return FS.open(path, flags, 0, suggestFD, suggestFD).fd;
      },doReadv:function (stream, iov, iovcnt, offset) {
        var ret = 0;
        for (var i = 0; i < iovcnt; i++) {
          var ptr = HEAP32[(((iov)+(i*8))>>2)];
          var len = HEAP32[(((iov)+(i*8 + 4))>>2)];
          var curr = FS.read(stream, HEAP8,ptr, len, offset);
          if (curr < 0) return -1;
          ret += curr;
          if (curr < len) break; // nothing more to read
        }
        return ret;
      },doWritev:function (stream, iov, iovcnt, offset) {
        var ret = 0;
        for (var i = 0; i < iovcnt; i++) {
          var ptr = HEAP32[(((iov)+(i*8))>>2)];
          var len = HEAP32[(((iov)+(i*8 + 4))>>2)];
          var curr = FS.write(stream, HEAP8,ptr, len, offset);
          if (curr < 0) return -1;
          ret += curr;
        }
        return ret;
      },varargs:0,get:function (varargs) {
        SYSCALLS.varargs += 4;
        var ret = HEAP32[(((SYSCALLS.varargs)-(4))>>2)];
        return ret;
      },getStr:function () {
        var ret = Pointer_stringify(SYSCALLS.get());
        return ret;
      },getStreamFromFD:function () {
        var stream = FS.getStream(SYSCALLS.get());
        if (!stream) throw new FS.ErrnoError(ERRNO_CODES.EBADF);
        return stream;
      },getSocketFromFD:function () {
        var socket = SOCKFS.getSocket(SYSCALLS.get());
        if (!socket) throw new FS.ErrnoError(ERRNO_CODES.EBADF);
        return socket;
      },getSocketAddress:function (allowNull) {
        var addrp = SYSCALLS.get(), addrlen = SYSCALLS.get();
        if (allowNull && addrp === 0) return null;
        var info = __read_sockaddr(addrp, addrlen);
        if (info.errno) throw new FS.ErrnoError(info.errno);
        info.addr = DNS.lookup_addr(info.addr) || info.addr;
        return info;
      },get64:function () {
        var low = SYSCALLS.get(), high = SYSCALLS.get();
        if (low >= 0) assert(high === 0);
        else assert(high === -1);
        return low;
      },getZero:function () {
        assert(SYSCALLS.get() === 0);
      }};function ___syscall140(which, varargs) {SYSCALLS.varargs = varargs;
  try {
   // llseek
      var stream = SYSCALLS.getStreamFromFD(), offset_high = SYSCALLS.get(), offset_low = SYSCALLS.get(), result = SYSCALLS.get(), whence = SYSCALLS.get();
      // NOTE: offset_high is unused - Emscripten's off_t is 32-bit
      var offset = offset_low;
      FS.llseek(stream, offset, whence);
      HEAP32[((result)>>2)]=stream.position;
      if (stream.getdents && offset === 0 && whence === 0) stream.getdents = null; // reset readdir state
      return 0;
    } catch (e) {
    if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
    return -e.errno;
  }
  }

  function ___syscall145(which, varargs) {SYSCALLS.varargs = varargs;
  try {
   // readv
      var stream = SYSCALLS.getStreamFromFD(), iov = SYSCALLS.get(), iovcnt = SYSCALLS.get();
      return SYSCALLS.doReadv(stream, iov, iovcnt);
    } catch (e) {
    if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
    return -e.errno;
  }
  }

  function ___syscall146(which, varargs) {SYSCALLS.varargs = varargs;
  try {
   // writev
      var stream = SYSCALLS.getStreamFromFD(), iov = SYSCALLS.get(), iovcnt = SYSCALLS.get();
      return SYSCALLS.doWritev(stream, iov, iovcnt);
    } catch (e) {
    if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
    return -e.errno;
  }
  }

  
  function ___syscall153(which, varargs) {SYSCALLS.varargs = varargs;
  try {
   // munlockall
      return 0;
    } catch (e) {
    if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
    return -e.errno;
  }
  }function ___syscall150() {
  return ___syscall153.apply(null, arguments)
  }

  function ___syscall151() {
  return ___syscall153.apply(null, arguments)
  }

  function ___syscall195(which, varargs) {SYSCALLS.varargs = varargs;
  try {
   // SYS_stat64
      var path = SYSCALLS.getStr(), buf = SYSCALLS.get();
      return SYSCALLS.doStat(FS.stat, path, buf);
    } catch (e) {
    if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
    return -e.errno;
  }
  }

  function ___syscall221(which, varargs) {SYSCALLS.varargs = varargs;
  try {
   // fcntl64
      var stream = SYSCALLS.getStreamFromFD(), cmd = SYSCALLS.get();
      switch (cmd) {
        case 0: {
          var arg = SYSCALLS.get();
          if (arg < 0) {
            return -ERRNO_CODES.EINVAL;
          }
          var newStream;
          newStream = FS.open(stream.path, stream.flags, 0, arg);
          return newStream.fd;
        }
        case 1:
        case 2:
          return 0;  // FD_CLOEXEC makes no sense for a single process.
        case 3:
          return stream.flags;
        case 4: {
          var arg = SYSCALLS.get();
          stream.flags |= arg;
          return 0;
        }
        case 12:
        case 12: {
          var arg = SYSCALLS.get();
          var offset = 0;
          // We're always unlocked.
          HEAP16[(((arg)+(offset))>>1)]=2;
          return 0;
        }
        case 13:
        case 14:
        case 13:
        case 14:
          return 0; // Pretend that the locking is successful.
        case 16:
        case 8:
          return -ERRNO_CODES.EINVAL; // These are for sockets. We don't have them fully implemented yet.
        case 9:
          // musl trusts getown return values, due to a bug where they must be, as they overlap with errors. just return -1 here, so fnctl() returns that, and we set errno ourselves.
          ___setErrNo(ERRNO_CODES.EINVAL);
          return -1;
        default: {
          return -ERRNO_CODES.EINVAL;
        }
      }
    } catch (e) {
    if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
    return -e.errno;
  }
  }

  function ___syscall5(which, varargs) {SYSCALLS.varargs = varargs;
  try {
   // open
      var pathname = SYSCALLS.getStr(), flags = SYSCALLS.get(), mode = SYSCALLS.get() // optional TODO
      var stream = FS.open(pathname, flags, mode);
      return stream.fd;
    } catch (e) {
    if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
    return -e.errno;
  }
  }

  function ___syscall54(which, varargs) {SYSCALLS.varargs = varargs;
  try {
   // ioctl
      var stream = SYSCALLS.getStreamFromFD(), op = SYSCALLS.get();
      switch (op) {
        case 21509:
        case 21505: {
          if (!stream.tty) return -ERRNO_CODES.ENOTTY;
          return 0;
        }
        case 21510:
        case 21511:
        case 21512:
        case 21506:
        case 21507:
        case 21508: {
          if (!stream.tty) return -ERRNO_CODES.ENOTTY;
          return 0; // no-op, not actually adjusting terminal settings
        }
        case 21519: {
          if (!stream.tty) return -ERRNO_CODES.ENOTTY;
          var argp = SYSCALLS.get();
          HEAP32[((argp)>>2)]=0;
          return 0;
        }
        case 21520: {
          if (!stream.tty) return -ERRNO_CODES.ENOTTY;
          return -ERRNO_CODES.EINVAL; // not supported
        }
        case 21531: {
          var argp = SYSCALLS.get();
          return FS.ioctl(stream, op, argp);
        }
        case 21523: {
          // TODO: in theory we should write to the winsize struct that gets
          // passed in, but for now musl doesn't read anything on it
          if (!stream.tty) return -ERRNO_CODES.ENOTTY;
          return 0;
        }
        case 21524: {
          // TODO: technically, this ioctl call should change the window size.
          // but, since emscripten doesn't have any concept of a terminal window
          // yet, we'll just silently throw it away as we do TIOCGWINSZ
          if (!stream.tty) return -ERRNO_CODES.ENOTTY;
          return 0;
        }
        default: abort('bad ioctl syscall ' + op);
      }
    } catch (e) {
    if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
    return -e.errno;
  }
  }

  function ___syscall6(which, varargs) {SYSCALLS.varargs = varargs;
  try {
   // close
      var stream = SYSCALLS.getStreamFromFD();
      FS.close(stream);
      return 0;
    } catch (e) {
    if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
    return -e.errno;
  }
  }

  function ___unlock() {}

  function _abort() {
      Module['abort']();
    }

  function _gettimeofday(ptr) {
      var now = Date.now();
      HEAP32[((ptr)>>2)]=(now/1000)|0; // seconds
      HEAP32[(((ptr)+(4))>>2)]=((now % 1000)*1000)|0; // microseconds
      return 0;
    }

   

  
  function _llvm_exp2_f32(x) {
      return Math.pow(2, x);
    }function _llvm_exp2_f64() {
  return _llvm_exp2_f32.apply(null, arguments)
  }

  var _llvm_fabs_f64=Math_abs;

  
  function _emscripten_memcpy_big(dest, src, num) {
      HEAPU8.set(HEAPU8.subarray(src, src+num), dest);
      return dest;
    } 

   

   

  function _usleep(useconds) {
      // int usleep(useconds_t useconds);
      // http://pubs.opengroup.org/onlinepubs/000095399/functions/usleep.html
      // We're single-threaded, so use a busy loop. Super-ugly.
      var msec = useconds / 1000;
      if ((ENVIRONMENT_IS_WEB || ENVIRONMENT_IS_WORKER) && self['performance'] && self['performance']['now']) {
        var start = self['performance']['now']();
        while (self['performance']['now']() - start < msec) {
          // Do nothing.
        }
      } else {
        var start = Date.now();
        while (Date.now() - start < msec) {
          // Do nothing.
        }
      }
      return 0;
    }
FS.staticInit();__ATINIT__.unshift(function() { if (!Module["noFSInit"] && !FS.init.initialized) FS.init() });__ATMAIN__.push(function() { FS.ignorePermissions = false });__ATEXIT__.push(function() { FS.quit() });;
__ATINIT__.unshift(function() { TTY.init() });__ATEXIT__.push(function() { TTY.shutdown() });;
if (ENVIRONMENT_IS_NODE) { var fs = require("fs"); var NODEJS_PATH = require("path"); NODEFS.staticInit(); };
DYNAMICTOP_PTR = staticAlloc(4);

STACK_BASE = STACKTOP = alignMemory(STATICTOP);

STACK_MAX = STACK_BASE + TOTAL_STACK;

DYNAMIC_BASE = alignMemory(STACK_MAX);

HEAP32[DYNAMICTOP_PTR>>2] = DYNAMIC_BASE;

staticSealed = true; // seal the static portion of memory

var ASSERTIONS = false;

// Copyright 2017 The Emscripten Authors.  All rights reserved.
// Emscripten is available under two separate licenses, the MIT license and the
// University of Illinois/NCSA Open Source License.  Both these licenses can be
// found in the LICENSE file.

/** @type {function(string, boolean=, number=)} */
function intArrayFromString(stringy, dontAddNull, length) {
  var len = length > 0 ? length : lengthBytesUTF8(stringy)+1;
  var u8array = new Array(len);
  var numBytesWritten = stringToUTF8Array(stringy, u8array, 0, u8array.length);
  if (dontAddNull) u8array.length = numBytesWritten;
  return u8array;
}

function intArrayToString(array) {
  var ret = [];
  for (var i = 0; i < array.length; i++) {
    var chr = array[i];
    if (chr > 0xFF) {
      if (ASSERTIONS) {
        assert(false, 'Character code ' + chr + ' (' + String.fromCharCode(chr) + ')  at offset ' + i + ' not in 0x00-0xFF.');
      }
      chr &= 0xFF;
    }
    ret.push(String.fromCharCode(chr));
  }
  return ret.join('');
}


// Copied from https://github.com/strophe/strophejs/blob/e06d027/src/polyfills.js#L149

// This code was written by Tyler Akins and has been placed in the
// public domain.  It would be nice if you left this header intact.
// Base64 code from Tyler Akins -- http://rumkin.com

/**
 * Decodes a base64 string.
 * @param {String} input The string to decode.
 */
var decodeBase64 = typeof atob === 'function' ? atob : function (input) {
  var keyStr = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';

  var output = '';
  var chr1, chr2, chr3;
  var enc1, enc2, enc3, enc4;
  var i = 0;
  // remove all characters that are not A-Z, a-z, 0-9, +, /, or =
  input = input.replace(/[^A-Za-z0-9\+\/\=]/g, '');
  do {
    enc1 = keyStr.indexOf(input.charAt(i++));
    enc2 = keyStr.indexOf(input.charAt(i++));
    enc3 = keyStr.indexOf(input.charAt(i++));
    enc4 = keyStr.indexOf(input.charAt(i++));

    chr1 = (enc1 << 2) | (enc2 >> 4);
    chr2 = ((enc2 & 15) << 4) | (enc3 >> 2);
    chr3 = ((enc3 & 3) << 6) | enc4;

    output = output + String.fromCharCode(chr1);

    if (enc3 !== 64) {
      output = output + String.fromCharCode(chr2);
    }
    if (enc4 !== 64) {
      output = output + String.fromCharCode(chr3);
    }
  } while (i < input.length);
  return output;
};

// Converts a string of base64 into a byte array.
// Throws error on invalid input.
function intArrayFromBase64(s) {
  if (typeof ENVIRONMENT_IS_NODE === 'boolean' && ENVIRONMENT_IS_NODE) {
    var buf;
    try {
      buf = Buffer.from(s, 'base64');
    } catch (_) {
      buf = new Buffer(s, 'base64');
    }
    return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  }

  try {
    var decoded = decodeBase64(s);
    var bytes = new Uint8Array(decoded.length);
    for (var i = 0 ; i < decoded.length ; ++i) {
      bytes[i] = decoded.charCodeAt(i);
    }
    return bytes;
  } catch (_) {
    throw new Error('Converting base64 string to bytes failed.');
  }
}

// If filename is a base64 data URI, parses and returns data (Buffer on node,
// Uint8Array otherwise). If filename is not a base64 data URI, returns undefined.
function tryParseAsDataURI(filename) {
  if (!isDataURI(filename)) {
    return;
  }

  return intArrayFromBase64(filename.slice(dataURIPrefix.length));
}



Module['wasmTableSize'] = 148;

Module['wasmMaxTableSize'] = 148;

function invoke_ii(index,a1) {
  var sp = stackSave();
  try {
    return Module["dynCall_ii"](index,a1);
  } catch(e) {
    stackRestore(sp);
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    Module["setThrew"](1, 0);
  }
}

function invoke_iii(index,a1,a2) {
  var sp = stackSave();
  try {
    return Module["dynCall_iii"](index,a1,a2);
  } catch(e) {
    stackRestore(sp);
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    Module["setThrew"](1, 0);
  }
}

function invoke_iiii(index,a1,a2,a3) {
  var sp = stackSave();
  try {
    return Module["dynCall_iiii"](index,a1,a2,a3);
  } catch(e) {
    stackRestore(sp);
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    Module["setThrew"](1, 0);
  }
}

function invoke_iiiiii(index,a1,a2,a3,a4,a5) {
  var sp = stackSave();
  try {
    return Module["dynCall_iiiiii"](index,a1,a2,a3,a4,a5);
  } catch(e) {
    stackRestore(sp);
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    Module["setThrew"](1, 0);
  }
}

function invoke_iiiiiii(index,a1,a2,a3,a4,a5,a6) {
  var sp = stackSave();
  try {
    return Module["dynCall_iiiiiii"](index,a1,a2,a3,a4,a5,a6);
  } catch(e) {
    stackRestore(sp);
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    Module["setThrew"](1, 0);
  }
}

function invoke_vi(index,a1) {
  var sp = stackSave();
  try {
    Module["dynCall_vi"](index,a1);
  } catch(e) {
    stackRestore(sp);
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    Module["setThrew"](1, 0);
  }
}

function invoke_vii(index,a1,a2) {
  var sp = stackSave();
  try {
    Module["dynCall_vii"](index,a1,a2);
  } catch(e) {
    stackRestore(sp);
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    Module["setThrew"](1, 0);
  }
}

function invoke_viid(index,a1,a2,a3) {
  var sp = stackSave();
  try {
    Module["dynCall_viid"](index,a1,a2,a3);
  } catch(e) {
    stackRestore(sp);
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    Module["setThrew"](1, 0);
  }
}

function invoke_viii(index,a1,a2,a3) {
  var sp = stackSave();
  try {
    Module["dynCall_viii"](index,a1,a2,a3);
  } catch(e) {
    stackRestore(sp);
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    Module["setThrew"](1, 0);
  }
}

function invoke_viiii(index,a1,a2,a3,a4) {
  var sp = stackSave();
  try {
    Module["dynCall_viiii"](index,a1,a2,a3,a4);
  } catch(e) {
    stackRestore(sp);
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    Module["setThrew"](1, 0);
  }
}

Module.asmGlobalArg = {};

Module.asmLibraryArg = { "abort": abort, "assert": assert, "enlargeMemory": enlargeMemory, "getTotalMemory": getTotalMemory, "abortOnCannotGrowMemory": abortOnCannotGrowMemory, "invoke_ii": invoke_ii, "invoke_iii": invoke_iii, "invoke_iiii": invoke_iiii, "invoke_iiiiii": invoke_iiiiii, "invoke_iiiiiii": invoke_iiiiiii, "invoke_vi": invoke_vi, "invoke_vii": invoke_vii, "invoke_viid": invoke_viid, "invoke_viii": invoke_viii, "invoke_viiii": invoke_viiii, "___lock": ___lock, "___setErrNo": ___setErrNo, "___syscall140": ___syscall140, "___syscall145": ___syscall145, "___syscall146": ___syscall146, "___syscall150": ___syscall150, "___syscall151": ___syscall151, "___syscall153": ___syscall153, "___syscall195": ___syscall195, "___syscall221": ___syscall221, "___syscall5": ___syscall5, "___syscall54": ___syscall54, "___syscall6": ___syscall6, "___unlock": ___unlock, "_abort": _abort, "_emscripten_memcpy_big": _emscripten_memcpy_big, "_gettimeofday": _gettimeofday, "_llvm_exp2_f32": _llvm_exp2_f32, "_llvm_exp2_f64": _llvm_exp2_f64, "_llvm_fabs_f64": _llvm_fabs_f64, "_usleep": _usleep, "DYNAMICTOP_PTR": DYNAMICTOP_PTR, "tempDoublePtr": tempDoublePtr, "STACKTOP": STACKTOP, "STACK_MAX": STACK_MAX };
// EMSCRIPTEN_START_ASM
var asm =Module["asm"]// EMSCRIPTEN_END_ASM
(Module.asmGlobalArg, Module.asmLibraryArg, buffer);

Module["asm"] = asm;
var ___errno_location = Module["___errno_location"] = function() {  return Module["asm"]["___errno_location"].apply(null, arguments) };
var _delete_fluid_audio_driver = Module["_delete_fluid_audio_driver"] = function() {  return Module["asm"]["_delete_fluid_audio_driver"].apply(null, arguments) };
var _delete_fluid_event = Module["_delete_fluid_event"] = function() {  return Module["asm"]["_delete_fluid_event"].apply(null, arguments) };
var _delete_fluid_file_renderer = Module["_delete_fluid_file_renderer"] = function() {  return Module["asm"]["_delete_fluid_file_renderer"].apply(null, arguments) };
var _delete_fluid_midi_driver = Module["_delete_fluid_midi_driver"] = function() {  return Module["asm"]["_delete_fluid_midi_driver"].apply(null, arguments) };
var _delete_fluid_midi_event = Module["_delete_fluid_midi_event"] = function() {  return Module["asm"]["_delete_fluid_midi_event"].apply(null, arguments) };
var _delete_fluid_midi_router = Module["_delete_fluid_midi_router"] = function() {  return Module["asm"]["_delete_fluid_midi_router"].apply(null, arguments) };
var _delete_fluid_midi_router_rule = Module["_delete_fluid_midi_router_rule"] = function() {  return Module["asm"]["_delete_fluid_midi_router_rule"].apply(null, arguments) };
var _delete_fluid_mod = Module["_delete_fluid_mod"] = function() {  return Module["asm"]["_delete_fluid_mod"].apply(null, arguments) };
var _delete_fluid_player = Module["_delete_fluid_player"] = function() {  return Module["asm"]["_delete_fluid_player"].apply(null, arguments) };
var _delete_fluid_preset = Module["_delete_fluid_preset"] = function() {  return Module["asm"]["_delete_fluid_preset"].apply(null, arguments) };
var _delete_fluid_sample = Module["_delete_fluid_sample"] = function() {  return Module["asm"]["_delete_fluid_sample"].apply(null, arguments) };
var _delete_fluid_sequencer = Module["_delete_fluid_sequencer"] = function() {  return Module["asm"]["_delete_fluid_sequencer"].apply(null, arguments) };
var _delete_fluid_settings = Module["_delete_fluid_settings"] = function() {  return Module["asm"]["_delete_fluid_settings"].apply(null, arguments) };
var _delete_fluid_sfloader = Module["_delete_fluid_sfloader"] = function() {  return Module["asm"]["_delete_fluid_sfloader"].apply(null, arguments) };
var _delete_fluid_sfont = Module["_delete_fluid_sfont"] = function() {  return Module["asm"]["_delete_fluid_sfont"].apply(null, arguments) };
var _delete_fluid_synth = Module["_delete_fluid_synth"] = function() {  return Module["asm"]["_delete_fluid_synth"].apply(null, arguments) };
var _emscripten_replace_memory = Module["_emscripten_replace_memory"] = function() {  return Module["asm"]["_emscripten_replace_memory"].apply(null, arguments) };
var _fluid_audio_driver_register = Module["_fluid_audio_driver_register"] = function() {  return Module["asm"]["_fluid_audio_driver_register"].apply(null, arguments) };
var _fluid_default_log_function = Module["_fluid_default_log_function"] = function() {  return Module["asm"]["_fluid_default_log_function"].apply(null, arguments) };
var _fluid_event_all_notes_off = Module["_fluid_event_all_notes_off"] = function() {  return Module["asm"]["_fluid_event_all_notes_off"].apply(null, arguments) };
var _fluid_event_all_sounds_off = Module["_fluid_event_all_sounds_off"] = function() {  return Module["asm"]["_fluid_event_all_sounds_off"].apply(null, arguments) };
var _fluid_event_any_control_change = Module["_fluid_event_any_control_change"] = function() {  return Module["asm"]["_fluid_event_any_control_change"].apply(null, arguments) };
var _fluid_event_bank_select = Module["_fluid_event_bank_select"] = function() {  return Module["asm"]["_fluid_event_bank_select"].apply(null, arguments) };
var _fluid_event_channel_pressure = Module["_fluid_event_channel_pressure"] = function() {  return Module["asm"]["_fluid_event_channel_pressure"].apply(null, arguments) };
var _fluid_event_chorus_send = Module["_fluid_event_chorus_send"] = function() {  return Module["asm"]["_fluid_event_chorus_send"].apply(null, arguments) };
var _fluid_event_control_change = Module["_fluid_event_control_change"] = function() {  return Module["asm"]["_fluid_event_control_change"].apply(null, arguments) };
var _fluid_event_get_bank = Module["_fluid_event_get_bank"] = function() {  return Module["asm"]["_fluid_event_get_bank"].apply(null, arguments) };
var _fluid_event_get_channel = Module["_fluid_event_get_channel"] = function() {  return Module["asm"]["_fluid_event_get_channel"].apply(null, arguments) };
var _fluid_event_get_control = Module["_fluid_event_get_control"] = function() {  return Module["asm"]["_fluid_event_get_control"].apply(null, arguments) };
var _fluid_event_get_data = Module["_fluid_event_get_data"] = function() {  return Module["asm"]["_fluid_event_get_data"].apply(null, arguments) };
var _fluid_event_get_dest = Module["_fluid_event_get_dest"] = function() {  return Module["asm"]["_fluid_event_get_dest"].apply(null, arguments) };
var _fluid_event_get_duration = Module["_fluid_event_get_duration"] = function() {  return Module["asm"]["_fluid_event_get_duration"].apply(null, arguments) };
var _fluid_event_get_key = Module["_fluid_event_get_key"] = function() {  return Module["asm"]["_fluid_event_get_key"].apply(null, arguments) };
var _fluid_event_get_pitch = Module["_fluid_event_get_pitch"] = function() {  return Module["asm"]["_fluid_event_get_pitch"].apply(null, arguments) };
var _fluid_event_get_program = Module["_fluid_event_get_program"] = function() {  return Module["asm"]["_fluid_event_get_program"].apply(null, arguments) };
var _fluid_event_get_sfont_id = Module["_fluid_event_get_sfont_id"] = function() {  return Module["asm"]["_fluid_event_get_sfont_id"].apply(null, arguments) };
var _fluid_event_get_source = Module["_fluid_event_get_source"] = function() {  return Module["asm"]["_fluid_event_get_source"].apply(null, arguments) };
var _fluid_event_get_type = Module["_fluid_event_get_type"] = function() {  return Module["asm"]["_fluid_event_get_type"].apply(null, arguments) };
var _fluid_event_get_value = Module["_fluid_event_get_value"] = function() {  return Module["asm"]["_fluid_event_get_value"].apply(null, arguments) };
var _fluid_event_get_velocity = Module["_fluid_event_get_velocity"] = function() {  return Module["asm"]["_fluid_event_get_velocity"].apply(null, arguments) };
var _fluid_event_key_pressure = Module["_fluid_event_key_pressure"] = function() {  return Module["asm"]["_fluid_event_key_pressure"].apply(null, arguments) };
var _fluid_event_modulation = Module["_fluid_event_modulation"] = function() {  return Module["asm"]["_fluid_event_modulation"].apply(null, arguments) };
var _fluid_event_note = Module["_fluid_event_note"] = function() {  return Module["asm"]["_fluid_event_note"].apply(null, arguments) };
var _fluid_event_noteoff = Module["_fluid_event_noteoff"] = function() {  return Module["asm"]["_fluid_event_noteoff"].apply(null, arguments) };
var _fluid_event_noteon = Module["_fluid_event_noteon"] = function() {  return Module["asm"]["_fluid_event_noteon"].apply(null, arguments) };
var _fluid_event_pan = Module["_fluid_event_pan"] = function() {  return Module["asm"]["_fluid_event_pan"].apply(null, arguments) };
var _fluid_event_pitch_bend = Module["_fluid_event_pitch_bend"] = function() {  return Module["asm"]["_fluid_event_pitch_bend"].apply(null, arguments) };
var _fluid_event_pitch_wheelsens = Module["_fluid_event_pitch_wheelsens"] = function() {  return Module["asm"]["_fluid_event_pitch_wheelsens"].apply(null, arguments) };
var _fluid_event_program_change = Module["_fluid_event_program_change"] = function() {  return Module["asm"]["_fluid_event_program_change"].apply(null, arguments) };
var _fluid_event_program_select = Module["_fluid_event_program_select"] = function() {  return Module["asm"]["_fluid_event_program_select"].apply(null, arguments) };
var _fluid_event_reverb_send = Module["_fluid_event_reverb_send"] = function() {  return Module["asm"]["_fluid_event_reverb_send"].apply(null, arguments) };
var _fluid_event_set_dest = Module["_fluid_event_set_dest"] = function() {  return Module["asm"]["_fluid_event_set_dest"].apply(null, arguments) };
var _fluid_event_set_source = Module["_fluid_event_set_source"] = function() {  return Module["asm"]["_fluid_event_set_source"].apply(null, arguments) };
var _fluid_event_sustain = Module["_fluid_event_sustain"] = function() {  return Module["asm"]["_fluid_event_sustain"].apply(null, arguments) };
var _fluid_event_system_reset = Module["_fluid_event_system_reset"] = function() {  return Module["asm"]["_fluid_event_system_reset"].apply(null, arguments) };
var _fluid_event_timer = Module["_fluid_event_timer"] = function() {  return Module["asm"]["_fluid_event_timer"].apply(null, arguments) };
var _fluid_event_unregistering = Module["_fluid_event_unregistering"] = function() {  return Module["asm"]["_fluid_event_unregistering"].apply(null, arguments) };
var _fluid_event_volume = Module["_fluid_event_volume"] = function() {  return Module["asm"]["_fluid_event_volume"].apply(null, arguments) };
var _fluid_file_renderer_process_block = Module["_fluid_file_renderer_process_block"] = function() {  return Module["asm"]["_fluid_file_renderer_process_block"].apply(null, arguments) };
var _fluid_file_set_encoding_quality = Module["_fluid_file_set_encoding_quality"] = function() {  return Module["asm"]["_fluid_file_set_encoding_quality"].apply(null, arguments) };
var _fluid_is_midifile = Module["_fluid_is_midifile"] = function() {  return Module["asm"]["_fluid_is_midifile"].apply(null, arguments) };
var _fluid_is_soundfont = Module["_fluid_is_soundfont"] = function() {  return Module["asm"]["_fluid_is_soundfont"].apply(null, arguments) };
var _fluid_ladspa_activate = Module["_fluid_ladspa_activate"] = function() {  return Module["asm"]["_fluid_ladspa_activate"].apply(null, arguments) };
var _fluid_ladspa_add_buffer = Module["_fluid_ladspa_add_buffer"] = function() {  return Module["asm"]["_fluid_ladspa_add_buffer"].apply(null, arguments) };
var _fluid_ladspa_add_effect = Module["_fluid_ladspa_add_effect"] = function() {  return Module["asm"]["_fluid_ladspa_add_effect"].apply(null, arguments) };
var _fluid_ladspa_buffer_exists = Module["_fluid_ladspa_buffer_exists"] = function() {  return Module["asm"]["_fluid_ladspa_buffer_exists"].apply(null, arguments) };
var _fluid_ladspa_check = Module["_fluid_ladspa_check"] = function() {  return Module["asm"]["_fluid_ladspa_check"].apply(null, arguments) };
var _fluid_ladspa_deactivate = Module["_fluid_ladspa_deactivate"] = function() {  return Module["asm"]["_fluid_ladspa_deactivate"].apply(null, arguments) };
var _fluid_ladspa_effect_can_mix = Module["_fluid_ladspa_effect_can_mix"] = function() {  return Module["asm"]["_fluid_ladspa_effect_can_mix"].apply(null, arguments) };
var _fluid_ladspa_effect_link = Module["_fluid_ladspa_effect_link"] = function() {  return Module["asm"]["_fluid_ladspa_effect_link"].apply(null, arguments) };
var _fluid_ladspa_effect_port_exists = Module["_fluid_ladspa_effect_port_exists"] = function() {  return Module["asm"]["_fluid_ladspa_effect_port_exists"].apply(null, arguments) };
var _fluid_ladspa_effect_set_control = Module["_fluid_ladspa_effect_set_control"] = function() {  return Module["asm"]["_fluid_ladspa_effect_set_control"].apply(null, arguments) };
var _fluid_ladspa_effect_set_mix = Module["_fluid_ladspa_effect_set_mix"] = function() {  return Module["asm"]["_fluid_ladspa_effect_set_mix"].apply(null, arguments) };
var _fluid_ladspa_host_port_exists = Module["_fluid_ladspa_host_port_exists"] = function() {  return Module["asm"]["_fluid_ladspa_host_port_exists"].apply(null, arguments) };
var _fluid_ladspa_is_active = Module["_fluid_ladspa_is_active"] = function() {  return Module["asm"]["_fluid_ladspa_is_active"].apply(null, arguments) };
var _fluid_ladspa_reset = Module["_fluid_ladspa_reset"] = function() {  return Module["asm"]["_fluid_ladspa_reset"].apply(null, arguments) };
var _fluid_log = Module["_fluid_log"] = function() {  return Module["asm"]["_fluid_log"].apply(null, arguments) };
var _fluid_midi_dump_postrouter = Module["_fluid_midi_dump_postrouter"] = function() {  return Module["asm"]["_fluid_midi_dump_postrouter"].apply(null, arguments) };
var _fluid_midi_dump_prerouter = Module["_fluid_midi_dump_prerouter"] = function() {  return Module["asm"]["_fluid_midi_dump_prerouter"].apply(null, arguments) };
var _fluid_midi_event_get_channel = Module["_fluid_midi_event_get_channel"] = function() {  return Module["asm"]["_fluid_midi_event_get_channel"].apply(null, arguments) };
var _fluid_midi_event_get_control = Module["_fluid_midi_event_get_control"] = function() {  return Module["asm"]["_fluid_midi_event_get_control"].apply(null, arguments) };
var _fluid_midi_event_get_key = Module["_fluid_midi_event_get_key"] = function() {  return Module["asm"]["_fluid_midi_event_get_key"].apply(null, arguments) };
var _fluid_midi_event_get_pitch = Module["_fluid_midi_event_get_pitch"] = function() {  return Module["asm"]["_fluid_midi_event_get_pitch"].apply(null, arguments) };
var _fluid_midi_event_get_program = Module["_fluid_midi_event_get_program"] = function() {  return Module["asm"]["_fluid_midi_event_get_program"].apply(null, arguments) };
var _fluid_midi_event_get_type = Module["_fluid_midi_event_get_type"] = function() {  return Module["asm"]["_fluid_midi_event_get_type"].apply(null, arguments) };
var _fluid_midi_event_get_value = Module["_fluid_midi_event_get_value"] = function() {  return Module["asm"]["_fluid_midi_event_get_value"].apply(null, arguments) };
var _fluid_midi_event_get_velocity = Module["_fluid_midi_event_get_velocity"] = function() {  return Module["asm"]["_fluid_midi_event_get_velocity"].apply(null, arguments) };
var _fluid_midi_event_set_channel = Module["_fluid_midi_event_set_channel"] = function() {  return Module["asm"]["_fluid_midi_event_set_channel"].apply(null, arguments) };
var _fluid_midi_event_set_control = Module["_fluid_midi_event_set_control"] = function() {  return Module["asm"]["_fluid_midi_event_set_control"].apply(null, arguments) };
var _fluid_midi_event_set_key = Module["_fluid_midi_event_set_key"] = function() {  return Module["asm"]["_fluid_midi_event_set_key"].apply(null, arguments) };
var _fluid_midi_event_set_lyrics = Module["_fluid_midi_event_set_lyrics"] = function() {  return Module["asm"]["_fluid_midi_event_set_lyrics"].apply(null, arguments) };
var _fluid_midi_event_set_pitch = Module["_fluid_midi_event_set_pitch"] = function() {  return Module["asm"]["_fluid_midi_event_set_pitch"].apply(null, arguments) };
var _fluid_midi_event_set_program = Module["_fluid_midi_event_set_program"] = function() {  return Module["asm"]["_fluid_midi_event_set_program"].apply(null, arguments) };
var _fluid_midi_event_set_sysex = Module["_fluid_midi_event_set_sysex"] = function() {  return Module["asm"]["_fluid_midi_event_set_sysex"].apply(null, arguments) };
var _fluid_midi_event_set_text = Module["_fluid_midi_event_set_text"] = function() {  return Module["asm"]["_fluid_midi_event_set_text"].apply(null, arguments) };
var _fluid_midi_event_set_type = Module["_fluid_midi_event_set_type"] = function() {  return Module["asm"]["_fluid_midi_event_set_type"].apply(null, arguments) };
var _fluid_midi_event_set_value = Module["_fluid_midi_event_set_value"] = function() {  return Module["asm"]["_fluid_midi_event_set_value"].apply(null, arguments) };
var _fluid_midi_event_set_velocity = Module["_fluid_midi_event_set_velocity"] = function() {  return Module["asm"]["_fluid_midi_event_set_velocity"].apply(null, arguments) };
var _fluid_midi_router_add_rule = Module["_fluid_midi_router_add_rule"] = function() {  return Module["asm"]["_fluid_midi_router_add_rule"].apply(null, arguments) };
var _fluid_midi_router_clear_rules = Module["_fluid_midi_router_clear_rules"] = function() {  return Module["asm"]["_fluid_midi_router_clear_rules"].apply(null, arguments) };
var _fluid_midi_router_handle_midi_event = Module["_fluid_midi_router_handle_midi_event"] = function() {  return Module["asm"]["_fluid_midi_router_handle_midi_event"].apply(null, arguments) };
var _fluid_midi_router_rule_set_chan = Module["_fluid_midi_router_rule_set_chan"] = function() {  return Module["asm"]["_fluid_midi_router_rule_set_chan"].apply(null, arguments) };
var _fluid_midi_router_rule_set_param1 = Module["_fluid_midi_router_rule_set_param1"] = function() {  return Module["asm"]["_fluid_midi_router_rule_set_param1"].apply(null, arguments) };
var _fluid_midi_router_rule_set_param2 = Module["_fluid_midi_router_rule_set_param2"] = function() {  return Module["asm"]["_fluid_midi_router_rule_set_param2"].apply(null, arguments) };
var _fluid_midi_router_set_default_rules = Module["_fluid_midi_router_set_default_rules"] = function() {  return Module["asm"]["_fluid_midi_router_set_default_rules"].apply(null, arguments) };
var _fluid_mod_clone = Module["_fluid_mod_clone"] = function() {  return Module["asm"]["_fluid_mod_clone"].apply(null, arguments) };
var _fluid_mod_get_amount = Module["_fluid_mod_get_amount"] = function() {  return Module["asm"]["_fluid_mod_get_amount"].apply(null, arguments) };
var _fluid_mod_get_dest = Module["_fluid_mod_get_dest"] = function() {  return Module["asm"]["_fluid_mod_get_dest"].apply(null, arguments) };
var _fluid_mod_get_flags1 = Module["_fluid_mod_get_flags1"] = function() {  return Module["asm"]["_fluid_mod_get_flags1"].apply(null, arguments) };
var _fluid_mod_get_flags2 = Module["_fluid_mod_get_flags2"] = function() {  return Module["asm"]["_fluid_mod_get_flags2"].apply(null, arguments) };
var _fluid_mod_get_source1 = Module["_fluid_mod_get_source1"] = function() {  return Module["asm"]["_fluid_mod_get_source1"].apply(null, arguments) };
var _fluid_mod_get_source2 = Module["_fluid_mod_get_source2"] = function() {  return Module["asm"]["_fluid_mod_get_source2"].apply(null, arguments) };
var _fluid_mod_has_dest = Module["_fluid_mod_has_dest"] = function() {  return Module["asm"]["_fluid_mod_has_dest"].apply(null, arguments) };
var _fluid_mod_has_source = Module["_fluid_mod_has_source"] = function() {  return Module["asm"]["_fluid_mod_has_source"].apply(null, arguments) };
var _fluid_mod_set_amount = Module["_fluid_mod_set_amount"] = function() {  return Module["asm"]["_fluid_mod_set_amount"].apply(null, arguments) };
var _fluid_mod_set_dest = Module["_fluid_mod_set_dest"] = function() {  return Module["asm"]["_fluid_mod_set_dest"].apply(null, arguments) };
var _fluid_mod_set_source1 = Module["_fluid_mod_set_source1"] = function() {  return Module["asm"]["_fluid_mod_set_source1"].apply(null, arguments) };
var _fluid_mod_set_source2 = Module["_fluid_mod_set_source2"] = function() {  return Module["asm"]["_fluid_mod_set_source2"].apply(null, arguments) };
var _fluid_mod_sizeof = Module["_fluid_mod_sizeof"] = function() {  return Module["asm"]["_fluid_mod_sizeof"].apply(null, arguments) };
var _fluid_mod_test_identity = Module["_fluid_mod_test_identity"] = function() {  return Module["asm"]["_fluid_mod_test_identity"].apply(null, arguments) };
var _fluid_player_add = Module["_fluid_player_add"] = function() {  return Module["asm"]["_fluid_player_add"].apply(null, arguments) };
var _fluid_player_add_mem = Module["_fluid_player_add_mem"] = function() {  return Module["asm"]["_fluid_player_add_mem"].apply(null, arguments) };
var _fluid_player_get_bpm = Module["_fluid_player_get_bpm"] = function() {  return Module["asm"]["_fluid_player_get_bpm"].apply(null, arguments) };
var _fluid_player_get_current_tick = Module["_fluid_player_get_current_tick"] = function() {  return Module["asm"]["_fluid_player_get_current_tick"].apply(null, arguments) };
var _fluid_player_get_midi_tempo = Module["_fluid_player_get_midi_tempo"] = function() {  return Module["asm"]["_fluid_player_get_midi_tempo"].apply(null, arguments) };
var _fluid_player_get_status = Module["_fluid_player_get_status"] = function() {  return Module["asm"]["_fluid_player_get_status"].apply(null, arguments) };
var _fluid_player_get_total_ticks = Module["_fluid_player_get_total_ticks"] = function() {  return Module["asm"]["_fluid_player_get_total_ticks"].apply(null, arguments) };
var _fluid_player_join = Module["_fluid_player_join"] = function() {  return Module["asm"]["_fluid_player_join"].apply(null, arguments) };
var _fluid_player_play = Module["_fluid_player_play"] = function() {  return Module["asm"]["_fluid_player_play"].apply(null, arguments) };
var _fluid_player_seek = Module["_fluid_player_seek"] = function() {  return Module["asm"]["_fluid_player_seek"].apply(null, arguments) };
var _fluid_player_set_bpm = Module["_fluid_player_set_bpm"] = function() {  return Module["asm"]["_fluid_player_set_bpm"].apply(null, arguments) };
var _fluid_player_set_loop = Module["_fluid_player_set_loop"] = function() {  return Module["asm"]["_fluid_player_set_loop"].apply(null, arguments) };
var _fluid_player_set_midi_tempo = Module["_fluid_player_set_midi_tempo"] = function() {  return Module["asm"]["_fluid_player_set_midi_tempo"].apply(null, arguments) };
var _fluid_player_set_playback_callback = Module["_fluid_player_set_playback_callback"] = function() {  return Module["asm"]["_fluid_player_set_playback_callback"].apply(null, arguments) };
var _fluid_player_stop = Module["_fluid_player_stop"] = function() {  return Module["asm"]["_fluid_player_stop"].apply(null, arguments) };
var _fluid_preset_get_banknum = Module["_fluid_preset_get_banknum"] = function() {  return Module["asm"]["_fluid_preset_get_banknum"].apply(null, arguments) };
var _fluid_preset_get_data = Module["_fluid_preset_get_data"] = function() {  return Module["asm"]["_fluid_preset_get_data"].apply(null, arguments) };
var _fluid_preset_get_name = Module["_fluid_preset_get_name"] = function() {  return Module["asm"]["_fluid_preset_get_name"].apply(null, arguments) };
var _fluid_preset_get_num = Module["_fluid_preset_get_num"] = function() {  return Module["asm"]["_fluid_preset_get_num"].apply(null, arguments) };
var _fluid_preset_get_sfont = Module["_fluid_preset_get_sfont"] = function() {  return Module["asm"]["_fluid_preset_get_sfont"].apply(null, arguments) };
var _fluid_preset_set_data = Module["_fluid_preset_set_data"] = function() {  return Module["asm"]["_fluid_preset_set_data"].apply(null, arguments) };
var _fluid_sample_set_loop = Module["_fluid_sample_set_loop"] = function() {  return Module["asm"]["_fluid_sample_set_loop"].apply(null, arguments) };
var _fluid_sample_set_name = Module["_fluid_sample_set_name"] = function() {  return Module["asm"]["_fluid_sample_set_name"].apply(null, arguments) };
var _fluid_sample_set_pitch = Module["_fluid_sample_set_pitch"] = function() {  return Module["asm"]["_fluid_sample_set_pitch"].apply(null, arguments) };
var _fluid_sample_set_sound_data = Module["_fluid_sample_set_sound_data"] = function() {  return Module["asm"]["_fluid_sample_set_sound_data"].apply(null, arguments) };
var _fluid_sample_sizeof = Module["_fluid_sample_sizeof"] = function() {  return Module["asm"]["_fluid_sample_sizeof"].apply(null, arguments) };
var _fluid_sequencer_add_midi_event_to_buffer = Module["_fluid_sequencer_add_midi_event_to_buffer"] = function() {  return Module["asm"]["_fluid_sequencer_add_midi_event_to_buffer"].apply(null, arguments) };
var _fluid_sequencer_client_is_dest = Module["_fluid_sequencer_client_is_dest"] = function() {  return Module["asm"]["_fluid_sequencer_client_is_dest"].apply(null, arguments) };
var _fluid_sequencer_count_clients = Module["_fluid_sequencer_count_clients"] = function() {  return Module["asm"]["_fluid_sequencer_count_clients"].apply(null, arguments) };
var _fluid_sequencer_get_client_id = Module["_fluid_sequencer_get_client_id"] = function() {  return Module["asm"]["_fluid_sequencer_get_client_id"].apply(null, arguments) };
var _fluid_sequencer_get_client_name = Module["_fluid_sequencer_get_client_name"] = function() {  return Module["asm"]["_fluid_sequencer_get_client_name"].apply(null, arguments) };
var _fluid_sequencer_get_tick = Module["_fluid_sequencer_get_tick"] = function() {  return Module["asm"]["_fluid_sequencer_get_tick"].apply(null, arguments) };
var _fluid_sequencer_get_time_scale = Module["_fluid_sequencer_get_time_scale"] = function() {  return Module["asm"]["_fluid_sequencer_get_time_scale"].apply(null, arguments) };
var _fluid_sequencer_get_use_system_timer = Module["_fluid_sequencer_get_use_system_timer"] = function() {  return Module["asm"]["_fluid_sequencer_get_use_system_timer"].apply(null, arguments) };
var _fluid_sequencer_process = Module["_fluid_sequencer_process"] = function() {  return Module["asm"]["_fluid_sequencer_process"].apply(null, arguments) };
var _fluid_sequencer_register_client = Module["_fluid_sequencer_register_client"] = function() {  return Module["asm"]["_fluid_sequencer_register_client"].apply(null, arguments) };
var _fluid_sequencer_register_fluidsynth = Module["_fluid_sequencer_register_fluidsynth"] = function() {  return Module["asm"]["_fluid_sequencer_register_fluidsynth"].apply(null, arguments) };
var _fluid_sequencer_remove_events = Module["_fluid_sequencer_remove_events"] = function() {  return Module["asm"]["_fluid_sequencer_remove_events"].apply(null, arguments) };
var _fluid_sequencer_send_at = Module["_fluid_sequencer_send_at"] = function() {  return Module["asm"]["_fluid_sequencer_send_at"].apply(null, arguments) };
var _fluid_sequencer_send_now = Module["_fluid_sequencer_send_now"] = function() {  return Module["asm"]["_fluid_sequencer_send_now"].apply(null, arguments) };
var _fluid_sequencer_set_time_scale = Module["_fluid_sequencer_set_time_scale"] = function() {  return Module["asm"]["_fluid_sequencer_set_time_scale"].apply(null, arguments) };
var _fluid_sequencer_unregister_client = Module["_fluid_sequencer_unregister_client"] = function() {  return Module["asm"]["_fluid_sequencer_unregister_client"].apply(null, arguments) };
var _fluid_set_log_function = Module["_fluid_set_log_function"] = function() {  return Module["asm"]["_fluid_set_log_function"].apply(null, arguments) };
var _fluid_settings_copystr = Module["_fluid_settings_copystr"] = function() {  return Module["asm"]["_fluid_settings_copystr"].apply(null, arguments) };
var _fluid_settings_dupstr = Module["_fluid_settings_dupstr"] = function() {  return Module["asm"]["_fluid_settings_dupstr"].apply(null, arguments) };
var _fluid_settings_foreach = Module["_fluid_settings_foreach"] = function() {  return Module["asm"]["_fluid_settings_foreach"].apply(null, arguments) };
var _fluid_settings_foreach_option = Module["_fluid_settings_foreach_option"] = function() {  return Module["asm"]["_fluid_settings_foreach_option"].apply(null, arguments) };
var _fluid_settings_get_hints = Module["_fluid_settings_get_hints"] = function() {  return Module["asm"]["_fluid_settings_get_hints"].apply(null, arguments) };
var _fluid_settings_get_type = Module["_fluid_settings_get_type"] = function() {  return Module["asm"]["_fluid_settings_get_type"].apply(null, arguments) };
var _fluid_settings_getint = Module["_fluid_settings_getint"] = function() {  return Module["asm"]["_fluid_settings_getint"].apply(null, arguments) };
var _fluid_settings_getint_default = Module["_fluid_settings_getint_default"] = function() {  return Module["asm"]["_fluid_settings_getint_default"].apply(null, arguments) };
var _fluid_settings_getint_range = Module["_fluid_settings_getint_range"] = function() {  return Module["asm"]["_fluid_settings_getint_range"].apply(null, arguments) };
var _fluid_settings_getnum = Module["_fluid_settings_getnum"] = function() {  return Module["asm"]["_fluid_settings_getnum"].apply(null, arguments) };
var _fluid_settings_getnum_default = Module["_fluid_settings_getnum_default"] = function() {  return Module["asm"]["_fluid_settings_getnum_default"].apply(null, arguments) };
var _fluid_settings_getnum_range = Module["_fluid_settings_getnum_range"] = function() {  return Module["asm"]["_fluid_settings_getnum_range"].apply(null, arguments) };
var _fluid_settings_getstr_default = Module["_fluid_settings_getstr_default"] = function() {  return Module["asm"]["_fluid_settings_getstr_default"].apply(null, arguments) };
var _fluid_settings_is_realtime = Module["_fluid_settings_is_realtime"] = function() {  return Module["asm"]["_fluid_settings_is_realtime"].apply(null, arguments) };
var _fluid_settings_option_concat = Module["_fluid_settings_option_concat"] = function() {  return Module["asm"]["_fluid_settings_option_concat"].apply(null, arguments) };
var _fluid_settings_option_count = Module["_fluid_settings_option_count"] = function() {  return Module["asm"]["_fluid_settings_option_count"].apply(null, arguments) };
var _fluid_settings_setint = Module["_fluid_settings_setint"] = function() {  return Module["asm"]["_fluid_settings_setint"].apply(null, arguments) };
var _fluid_settings_setnum = Module["_fluid_settings_setnum"] = function() {  return Module["asm"]["_fluid_settings_setnum"].apply(null, arguments) };
var _fluid_settings_setstr = Module["_fluid_settings_setstr"] = function() {  return Module["asm"]["_fluid_settings_setstr"].apply(null, arguments) };
var _fluid_settings_str_equal = Module["_fluid_settings_str_equal"] = function() {  return Module["asm"]["_fluid_settings_str_equal"].apply(null, arguments) };
var _fluid_sfloader_get_data = Module["_fluid_sfloader_get_data"] = function() {  return Module["asm"]["_fluid_sfloader_get_data"].apply(null, arguments) };
var _fluid_sfloader_set_callbacks = Module["_fluid_sfloader_set_callbacks"] = function() {  return Module["asm"]["_fluid_sfloader_set_callbacks"].apply(null, arguments) };
var _fluid_sfloader_set_data = Module["_fluid_sfloader_set_data"] = function() {  return Module["asm"]["_fluid_sfloader_set_data"].apply(null, arguments) };
var _fluid_sfont_get_data = Module["_fluid_sfont_get_data"] = function() {  return Module["asm"]["_fluid_sfont_get_data"].apply(null, arguments) };
var _fluid_sfont_get_id = Module["_fluid_sfont_get_id"] = function() {  return Module["asm"]["_fluid_sfont_get_id"].apply(null, arguments) };
var _fluid_sfont_get_name = Module["_fluid_sfont_get_name"] = function() {  return Module["asm"]["_fluid_sfont_get_name"].apply(null, arguments) };
var _fluid_sfont_get_preset = Module["_fluid_sfont_get_preset"] = function() {  return Module["asm"]["_fluid_sfont_get_preset"].apply(null, arguments) };
var _fluid_sfont_iteration_next = Module["_fluid_sfont_iteration_next"] = function() {  return Module["asm"]["_fluid_sfont_iteration_next"].apply(null, arguments) };
var _fluid_sfont_iteration_start = Module["_fluid_sfont_iteration_start"] = function() {  return Module["asm"]["_fluid_sfont_iteration_start"].apply(null, arguments) };
var _fluid_sfont_set_data = Module["_fluid_sfont_set_data"] = function() {  return Module["asm"]["_fluid_sfont_set_data"].apply(null, arguments) };
var _fluid_synth_activate_key_tuning = Module["_fluid_synth_activate_key_tuning"] = function() {  return Module["asm"]["_fluid_synth_activate_key_tuning"].apply(null, arguments) };
var _fluid_synth_activate_octave_tuning = Module["_fluid_synth_activate_octave_tuning"] = function() {  return Module["asm"]["_fluid_synth_activate_octave_tuning"].apply(null, arguments) };
var _fluid_synth_activate_tuning = Module["_fluid_synth_activate_tuning"] = function() {  return Module["asm"]["_fluid_synth_activate_tuning"].apply(null, arguments) };
var _fluid_synth_add_default_mod = Module["_fluid_synth_add_default_mod"] = function() {  return Module["asm"]["_fluid_synth_add_default_mod"].apply(null, arguments) };
var _fluid_synth_add_sfloader = Module["_fluid_synth_add_sfloader"] = function() {  return Module["asm"]["_fluid_synth_add_sfloader"].apply(null, arguments) };
var _fluid_synth_add_sfont = Module["_fluid_synth_add_sfont"] = function() {  return Module["asm"]["_fluid_synth_add_sfont"].apply(null, arguments) };
var _fluid_synth_all_notes_off = Module["_fluid_synth_all_notes_off"] = function() {  return Module["asm"]["_fluid_synth_all_notes_off"].apply(null, arguments) };
var _fluid_synth_all_sounds_off = Module["_fluid_synth_all_sounds_off"] = function() {  return Module["asm"]["_fluid_synth_all_sounds_off"].apply(null, arguments) };
var _fluid_synth_alloc_voice = Module["_fluid_synth_alloc_voice"] = function() {  return Module["asm"]["_fluid_synth_alloc_voice"].apply(null, arguments) };
var _fluid_synth_bank_select = Module["_fluid_synth_bank_select"] = function() {  return Module["asm"]["_fluid_synth_bank_select"].apply(null, arguments) };
var _fluid_synth_cc = Module["_fluid_synth_cc"] = function() {  return Module["asm"]["_fluid_synth_cc"].apply(null, arguments) };
var _fluid_synth_channel_pressure = Module["_fluid_synth_channel_pressure"] = function() {  return Module["asm"]["_fluid_synth_channel_pressure"].apply(null, arguments) };
var _fluid_synth_count_audio_channels = Module["_fluid_synth_count_audio_channels"] = function() {  return Module["asm"]["_fluid_synth_count_audio_channels"].apply(null, arguments) };
var _fluid_synth_count_audio_groups = Module["_fluid_synth_count_audio_groups"] = function() {  return Module["asm"]["_fluid_synth_count_audio_groups"].apply(null, arguments) };
var _fluid_synth_count_effects_channels = Module["_fluid_synth_count_effects_channels"] = function() {  return Module["asm"]["_fluid_synth_count_effects_channels"].apply(null, arguments) };
var _fluid_synth_count_effects_groups = Module["_fluid_synth_count_effects_groups"] = function() {  return Module["asm"]["_fluid_synth_count_effects_groups"].apply(null, arguments) };
var _fluid_synth_count_midi_channels = Module["_fluid_synth_count_midi_channels"] = function() {  return Module["asm"]["_fluid_synth_count_midi_channels"].apply(null, arguments) };
var _fluid_synth_deactivate_tuning = Module["_fluid_synth_deactivate_tuning"] = function() {  return Module["asm"]["_fluid_synth_deactivate_tuning"].apply(null, arguments) };
var _fluid_synth_error = Module["_fluid_synth_error"] = function() {  return Module["asm"]["_fluid_synth_error"].apply(null, arguments) };
var _fluid_synth_get_active_voice_count = Module["_fluid_synth_get_active_voice_count"] = function() {  return Module["asm"]["_fluid_synth_get_active_voice_count"].apply(null, arguments) };
var _fluid_synth_get_bank_offset = Module["_fluid_synth_get_bank_offset"] = function() {  return Module["asm"]["_fluid_synth_get_bank_offset"].apply(null, arguments) };
var _fluid_synth_get_basic_channel = Module["_fluid_synth_get_basic_channel"] = function() {  return Module["asm"]["_fluid_synth_get_basic_channel"].apply(null, arguments) };
var _fluid_synth_get_breath_mode = Module["_fluid_synth_get_breath_mode"] = function() {  return Module["asm"]["_fluid_synth_get_breath_mode"].apply(null, arguments) };
var _fluid_synth_get_cc = Module["_fluid_synth_get_cc"] = function() {  return Module["asm"]["_fluid_synth_get_cc"].apply(null, arguments) };
var _fluid_synth_get_channel_preset = Module["_fluid_synth_get_channel_preset"] = function() {  return Module["asm"]["_fluid_synth_get_channel_preset"].apply(null, arguments) };
var _fluid_synth_get_chorus_depth = Module["_fluid_synth_get_chorus_depth"] = function() {  return Module["asm"]["_fluid_synth_get_chorus_depth"].apply(null, arguments) };
var _fluid_synth_get_chorus_level = Module["_fluid_synth_get_chorus_level"] = function() {  return Module["asm"]["_fluid_synth_get_chorus_level"].apply(null, arguments) };
var _fluid_synth_get_chorus_nr = Module["_fluid_synth_get_chorus_nr"] = function() {  return Module["asm"]["_fluid_synth_get_chorus_nr"].apply(null, arguments) };
var _fluid_synth_get_chorus_speed = Module["_fluid_synth_get_chorus_speed"] = function() {  return Module["asm"]["_fluid_synth_get_chorus_speed"].apply(null, arguments) };
var _fluid_synth_get_chorus_type = Module["_fluid_synth_get_chorus_type"] = function() {  return Module["asm"]["_fluid_synth_get_chorus_type"].apply(null, arguments) };
var _fluid_synth_get_cpu_load = Module["_fluid_synth_get_cpu_load"] = function() {  return Module["asm"]["_fluid_synth_get_cpu_load"].apply(null, arguments) };
var _fluid_synth_get_gain = Module["_fluid_synth_get_gain"] = function() {  return Module["asm"]["_fluid_synth_get_gain"].apply(null, arguments) };
var _fluid_synth_get_gen = Module["_fluid_synth_get_gen"] = function() {  return Module["asm"]["_fluid_synth_get_gen"].apply(null, arguments) };
var _fluid_synth_get_internal_bufsize = Module["_fluid_synth_get_internal_bufsize"] = function() {  return Module["asm"]["_fluid_synth_get_internal_bufsize"].apply(null, arguments) };
var _fluid_synth_get_ladspa_fx = Module["_fluid_synth_get_ladspa_fx"] = function() {  return Module["asm"]["_fluid_synth_get_ladspa_fx"].apply(null, arguments) };
var _fluid_synth_get_legato_mode = Module["_fluid_synth_get_legato_mode"] = function() {  return Module["asm"]["_fluid_synth_get_legato_mode"].apply(null, arguments) };
var _fluid_synth_get_pitch_bend = Module["_fluid_synth_get_pitch_bend"] = function() {  return Module["asm"]["_fluid_synth_get_pitch_bend"].apply(null, arguments) };
var _fluid_synth_get_pitch_wheel_sens = Module["_fluid_synth_get_pitch_wheel_sens"] = function() {  return Module["asm"]["_fluid_synth_get_pitch_wheel_sens"].apply(null, arguments) };
var _fluid_synth_get_polyphony = Module["_fluid_synth_get_polyphony"] = function() {  return Module["asm"]["_fluid_synth_get_polyphony"].apply(null, arguments) };
var _fluid_synth_get_portamento_mode = Module["_fluid_synth_get_portamento_mode"] = function() {  return Module["asm"]["_fluid_synth_get_portamento_mode"].apply(null, arguments) };
var _fluid_synth_get_program = Module["_fluid_synth_get_program"] = function() {  return Module["asm"]["_fluid_synth_get_program"].apply(null, arguments) };
var _fluid_synth_get_reverb_damp = Module["_fluid_synth_get_reverb_damp"] = function() {  return Module["asm"]["_fluid_synth_get_reverb_damp"].apply(null, arguments) };
var _fluid_synth_get_reverb_level = Module["_fluid_synth_get_reverb_level"] = function() {  return Module["asm"]["_fluid_synth_get_reverb_level"].apply(null, arguments) };
var _fluid_synth_get_reverb_roomsize = Module["_fluid_synth_get_reverb_roomsize"] = function() {  return Module["asm"]["_fluid_synth_get_reverb_roomsize"].apply(null, arguments) };
var _fluid_synth_get_reverb_width = Module["_fluid_synth_get_reverb_width"] = function() {  return Module["asm"]["_fluid_synth_get_reverb_width"].apply(null, arguments) };
var _fluid_synth_get_settings = Module["_fluid_synth_get_settings"] = function() {  return Module["asm"]["_fluid_synth_get_settings"].apply(null, arguments) };
var _fluid_synth_get_sfont = Module["_fluid_synth_get_sfont"] = function() {  return Module["asm"]["_fluid_synth_get_sfont"].apply(null, arguments) };
var _fluid_synth_get_sfont_by_id = Module["_fluid_synth_get_sfont_by_id"] = function() {  return Module["asm"]["_fluid_synth_get_sfont_by_id"].apply(null, arguments) };
var _fluid_synth_get_sfont_by_name = Module["_fluid_synth_get_sfont_by_name"] = function() {  return Module["asm"]["_fluid_synth_get_sfont_by_name"].apply(null, arguments) };
var _fluid_synth_get_voicelist = Module["_fluid_synth_get_voicelist"] = function() {  return Module["asm"]["_fluid_synth_get_voicelist"].apply(null, arguments) };
var _fluid_synth_handle_midi_event = Module["_fluid_synth_handle_midi_event"] = function() {  return Module["asm"]["_fluid_synth_handle_midi_event"].apply(null, arguments) };
var _fluid_synth_key_pressure = Module["_fluid_synth_key_pressure"] = function() {  return Module["asm"]["_fluid_synth_key_pressure"].apply(null, arguments) };
var _fluid_synth_noteoff = Module["_fluid_synth_noteoff"] = function() {  return Module["asm"]["_fluid_synth_noteoff"].apply(null, arguments) };
var _fluid_synth_noteon = Module["_fluid_synth_noteon"] = function() {  return Module["asm"]["_fluid_synth_noteon"].apply(null, arguments) };
var _fluid_synth_nwrite_float = Module["_fluid_synth_nwrite_float"] = function() {  return Module["asm"]["_fluid_synth_nwrite_float"].apply(null, arguments) };
var _fluid_synth_pitch_bend = Module["_fluid_synth_pitch_bend"] = function() {  return Module["asm"]["_fluid_synth_pitch_bend"].apply(null, arguments) };
var _fluid_synth_pitch_wheel_sens = Module["_fluid_synth_pitch_wheel_sens"] = function() {  return Module["asm"]["_fluid_synth_pitch_wheel_sens"].apply(null, arguments) };
var _fluid_synth_process = Module["_fluid_synth_process"] = function() {  return Module["asm"]["_fluid_synth_process"].apply(null, arguments) };
var _fluid_synth_program_change = Module["_fluid_synth_program_change"] = function() {  return Module["asm"]["_fluid_synth_program_change"].apply(null, arguments) };
var _fluid_synth_program_reset = Module["_fluid_synth_program_reset"] = function() {  return Module["asm"]["_fluid_synth_program_reset"].apply(null, arguments) };
var _fluid_synth_program_select = Module["_fluid_synth_program_select"] = function() {  return Module["asm"]["_fluid_synth_program_select"].apply(null, arguments) };
var _fluid_synth_program_select_by_sfont_name = Module["_fluid_synth_program_select_by_sfont_name"] = function() {  return Module["asm"]["_fluid_synth_program_select_by_sfont_name"].apply(null, arguments) };
var _fluid_synth_remove_default_mod = Module["_fluid_synth_remove_default_mod"] = function() {  return Module["asm"]["_fluid_synth_remove_default_mod"].apply(null, arguments) };
var _fluid_synth_remove_sfont = Module["_fluid_synth_remove_sfont"] = function() {  return Module["asm"]["_fluid_synth_remove_sfont"].apply(null, arguments) };
var _fluid_synth_reset_basic_channel = Module["_fluid_synth_reset_basic_channel"] = function() {  return Module["asm"]["_fluid_synth_reset_basic_channel"].apply(null, arguments) };
var _fluid_synth_set_bank_offset = Module["_fluid_synth_set_bank_offset"] = function() {  return Module["asm"]["_fluid_synth_set_bank_offset"].apply(null, arguments) };
var _fluid_synth_set_basic_channel = Module["_fluid_synth_set_basic_channel"] = function() {  return Module["asm"]["_fluid_synth_set_basic_channel"].apply(null, arguments) };
var _fluid_synth_set_breath_mode = Module["_fluid_synth_set_breath_mode"] = function() {  return Module["asm"]["_fluid_synth_set_breath_mode"].apply(null, arguments) };
var _fluid_synth_set_channel_type = Module["_fluid_synth_set_channel_type"] = function() {  return Module["asm"]["_fluid_synth_set_channel_type"].apply(null, arguments) };
var _fluid_synth_set_chorus = Module["_fluid_synth_set_chorus"] = function() {  return Module["asm"]["_fluid_synth_set_chorus"].apply(null, arguments) };
var _fluid_synth_set_chorus_depth = Module["_fluid_synth_set_chorus_depth"] = function() {  return Module["asm"]["_fluid_synth_set_chorus_depth"].apply(null, arguments) };
var _fluid_synth_set_chorus_level = Module["_fluid_synth_set_chorus_level"] = function() {  return Module["asm"]["_fluid_synth_set_chorus_level"].apply(null, arguments) };
var _fluid_synth_set_chorus_nr = Module["_fluid_synth_set_chorus_nr"] = function() {  return Module["asm"]["_fluid_synth_set_chorus_nr"].apply(null, arguments) };
var _fluid_synth_set_chorus_on = Module["_fluid_synth_set_chorus_on"] = function() {  return Module["asm"]["_fluid_synth_set_chorus_on"].apply(null, arguments) };
var _fluid_synth_set_chorus_speed = Module["_fluid_synth_set_chorus_speed"] = function() {  return Module["asm"]["_fluid_synth_set_chorus_speed"].apply(null, arguments) };
var _fluid_synth_set_chorus_type = Module["_fluid_synth_set_chorus_type"] = function() {  return Module["asm"]["_fluid_synth_set_chorus_type"].apply(null, arguments) };
var _fluid_synth_set_custom_filter = Module["_fluid_synth_set_custom_filter"] = function() {  return Module["asm"]["_fluid_synth_set_custom_filter"].apply(null, arguments) };
var _fluid_synth_set_gain = Module["_fluid_synth_set_gain"] = function() {  return Module["asm"]["_fluid_synth_set_gain"].apply(null, arguments) };
var _fluid_synth_set_gen = Module["_fluid_synth_set_gen"] = function() {  return Module["asm"]["_fluid_synth_set_gen"].apply(null, arguments) };
var _fluid_synth_set_interp_method = Module["_fluid_synth_set_interp_method"] = function() {  return Module["asm"]["_fluid_synth_set_interp_method"].apply(null, arguments) };
var _fluid_synth_set_legato_mode = Module["_fluid_synth_set_legato_mode"] = function() {  return Module["asm"]["_fluid_synth_set_legato_mode"].apply(null, arguments) };
var _fluid_synth_set_polyphony = Module["_fluid_synth_set_polyphony"] = function() {  return Module["asm"]["_fluid_synth_set_polyphony"].apply(null, arguments) };
var _fluid_synth_set_portamento_mode = Module["_fluid_synth_set_portamento_mode"] = function() {  return Module["asm"]["_fluid_synth_set_portamento_mode"].apply(null, arguments) };
var _fluid_synth_set_reverb = Module["_fluid_synth_set_reverb"] = function() {  return Module["asm"]["_fluid_synth_set_reverb"].apply(null, arguments) };
var _fluid_synth_set_reverb_damp = Module["_fluid_synth_set_reverb_damp"] = function() {  return Module["asm"]["_fluid_synth_set_reverb_damp"].apply(null, arguments) };
var _fluid_synth_set_reverb_level = Module["_fluid_synth_set_reverb_level"] = function() {  return Module["asm"]["_fluid_synth_set_reverb_level"].apply(null, arguments) };
var _fluid_synth_set_reverb_on = Module["_fluid_synth_set_reverb_on"] = function() {  return Module["asm"]["_fluid_synth_set_reverb_on"].apply(null, arguments) };
var _fluid_synth_set_reverb_roomsize = Module["_fluid_synth_set_reverb_roomsize"] = function() {  return Module["asm"]["_fluid_synth_set_reverb_roomsize"].apply(null, arguments) };
var _fluid_synth_set_reverb_width = Module["_fluid_synth_set_reverb_width"] = function() {  return Module["asm"]["_fluid_synth_set_reverb_width"].apply(null, arguments) };
var _fluid_synth_set_sample_rate = Module["_fluid_synth_set_sample_rate"] = function() {  return Module["asm"]["_fluid_synth_set_sample_rate"].apply(null, arguments) };
var _fluid_synth_sfcount = Module["_fluid_synth_sfcount"] = function() {  return Module["asm"]["_fluid_synth_sfcount"].apply(null, arguments) };
var _fluid_synth_sfload = Module["_fluid_synth_sfload"] = function() {  return Module["asm"]["_fluid_synth_sfload"].apply(null, arguments) };
var _fluid_synth_sfont_select = Module["_fluid_synth_sfont_select"] = function() {  return Module["asm"]["_fluid_synth_sfont_select"].apply(null, arguments) };
var _fluid_synth_sfreload = Module["_fluid_synth_sfreload"] = function() {  return Module["asm"]["_fluid_synth_sfreload"].apply(null, arguments) };
var _fluid_synth_sfunload = Module["_fluid_synth_sfunload"] = function() {  return Module["asm"]["_fluid_synth_sfunload"].apply(null, arguments) };
var _fluid_synth_start = Module["_fluid_synth_start"] = function() {  return Module["asm"]["_fluid_synth_start"].apply(null, arguments) };
var _fluid_synth_start_voice = Module["_fluid_synth_start_voice"] = function() {  return Module["asm"]["_fluid_synth_start_voice"].apply(null, arguments) };
var _fluid_synth_stop = Module["_fluid_synth_stop"] = function() {  return Module["asm"]["_fluid_synth_stop"].apply(null, arguments) };
var _fluid_synth_sysex = Module["_fluid_synth_sysex"] = function() {  return Module["asm"]["_fluid_synth_sysex"].apply(null, arguments) };
var _fluid_synth_system_reset = Module["_fluid_synth_system_reset"] = function() {  return Module["asm"]["_fluid_synth_system_reset"].apply(null, arguments) };
var _fluid_synth_tune_notes = Module["_fluid_synth_tune_notes"] = function() {  return Module["asm"]["_fluid_synth_tune_notes"].apply(null, arguments) };
var _fluid_synth_tuning_dump = Module["_fluid_synth_tuning_dump"] = function() {  return Module["asm"]["_fluid_synth_tuning_dump"].apply(null, arguments) };
var _fluid_synth_tuning_iteration_next = Module["_fluid_synth_tuning_iteration_next"] = function() {  return Module["asm"]["_fluid_synth_tuning_iteration_next"].apply(null, arguments) };
var _fluid_synth_tuning_iteration_start = Module["_fluid_synth_tuning_iteration_start"] = function() {  return Module["asm"]["_fluid_synth_tuning_iteration_start"].apply(null, arguments) };
var _fluid_synth_unset_program = Module["_fluid_synth_unset_program"] = function() {  return Module["asm"]["_fluid_synth_unset_program"].apply(null, arguments) };
var _fluid_synth_write_float = Module["_fluid_synth_write_float"] = function() {  return Module["asm"]["_fluid_synth_write_float"].apply(null, arguments) };
var _fluid_synth_write_s16 = Module["_fluid_synth_write_s16"] = function() {  return Module["asm"]["_fluid_synth_write_s16"].apply(null, arguments) };
var _fluid_version = Module["_fluid_version"] = function() {  return Module["asm"]["_fluid_version"].apply(null, arguments) };
var _fluid_version_str = Module["_fluid_version_str"] = function() {  return Module["asm"]["_fluid_version_str"].apply(null, arguments) };
var _fluid_voice_add_mod = Module["_fluid_voice_add_mod"] = function() {  return Module["asm"]["_fluid_voice_add_mod"].apply(null, arguments) };
var _fluid_voice_gen_get = Module["_fluid_voice_gen_get"] = function() {  return Module["asm"]["_fluid_voice_gen_get"].apply(null, arguments) };
var _fluid_voice_gen_incr = Module["_fluid_voice_gen_incr"] = function() {  return Module["asm"]["_fluid_voice_gen_incr"].apply(null, arguments) };
var _fluid_voice_gen_set = Module["_fluid_voice_gen_set"] = function() {  return Module["asm"]["_fluid_voice_gen_set"].apply(null, arguments) };
var _fluid_voice_get_actual_key = Module["_fluid_voice_get_actual_key"] = function() {  return Module["asm"]["_fluid_voice_get_actual_key"].apply(null, arguments) };
var _fluid_voice_get_actual_velocity = Module["_fluid_voice_get_actual_velocity"] = function() {  return Module["asm"]["_fluid_voice_get_actual_velocity"].apply(null, arguments) };
var _fluid_voice_get_channel = Module["_fluid_voice_get_channel"] = function() {  return Module["asm"]["_fluid_voice_get_channel"].apply(null, arguments) };
var _fluid_voice_get_id = Module["_fluid_voice_get_id"] = function() {  return Module["asm"]["_fluid_voice_get_id"].apply(null, arguments) };
var _fluid_voice_get_key = Module["_fluid_voice_get_key"] = function() {  return Module["asm"]["_fluid_voice_get_key"].apply(null, arguments) };
var _fluid_voice_get_velocity = Module["_fluid_voice_get_velocity"] = function() {  return Module["asm"]["_fluid_voice_get_velocity"].apply(null, arguments) };
var _fluid_voice_is_on = Module["_fluid_voice_is_on"] = function() {  return Module["asm"]["_fluid_voice_is_on"].apply(null, arguments) };
var _fluid_voice_is_playing = Module["_fluid_voice_is_playing"] = function() {  return Module["asm"]["_fluid_voice_is_playing"].apply(null, arguments) };
var _fluid_voice_is_sostenuto = Module["_fluid_voice_is_sostenuto"] = function() {  return Module["asm"]["_fluid_voice_is_sostenuto"].apply(null, arguments) };
var _fluid_voice_is_sustained = Module["_fluid_voice_is_sustained"] = function() {  return Module["asm"]["_fluid_voice_is_sustained"].apply(null, arguments) };
var _fluid_voice_optimize_sample = Module["_fluid_voice_optimize_sample"] = function() {  return Module["asm"]["_fluid_voice_optimize_sample"].apply(null, arguments) };
var _fluid_voice_update_param = Module["_fluid_voice_update_param"] = function() {  return Module["asm"]["_fluid_voice_update_param"].apply(null, arguments) };
var _free = Module["_free"] = function() {  return Module["asm"]["_free"].apply(null, arguments) };
var _llvm_bswap_i32 = Module["_llvm_bswap_i32"] = function() {  return Module["asm"]["_llvm_bswap_i32"].apply(null, arguments) };
var _malloc = Module["_malloc"] = function() {  return Module["asm"]["_malloc"].apply(null, arguments) };
var _memcpy = Module["_memcpy"] = function() {  return Module["asm"]["_memcpy"].apply(null, arguments) };
var _memset = Module["_memset"] = function() {  return Module["asm"]["_memset"].apply(null, arguments) };
var _new_fluid_audio_driver = Module["_new_fluid_audio_driver"] = function() {  return Module["asm"]["_new_fluid_audio_driver"].apply(null, arguments) };
var _new_fluid_audio_driver2 = Module["_new_fluid_audio_driver2"] = function() {  return Module["asm"]["_new_fluid_audio_driver2"].apply(null, arguments) };
var _new_fluid_defsfloader = Module["_new_fluid_defsfloader"] = function() {  return Module["asm"]["_new_fluid_defsfloader"].apply(null, arguments) };
var _new_fluid_event = Module["_new_fluid_event"] = function() {  return Module["asm"]["_new_fluid_event"].apply(null, arguments) };
var _new_fluid_file_renderer = Module["_new_fluid_file_renderer"] = function() {  return Module["asm"]["_new_fluid_file_renderer"].apply(null, arguments) };
var _new_fluid_midi_driver = Module["_new_fluid_midi_driver"] = function() {  return Module["asm"]["_new_fluid_midi_driver"].apply(null, arguments) };
var _new_fluid_midi_event = Module["_new_fluid_midi_event"] = function() {  return Module["asm"]["_new_fluid_midi_event"].apply(null, arguments) };
var _new_fluid_midi_router = Module["_new_fluid_midi_router"] = function() {  return Module["asm"]["_new_fluid_midi_router"].apply(null, arguments) };
var _new_fluid_midi_router_rule = Module["_new_fluid_midi_router_rule"] = function() {  return Module["asm"]["_new_fluid_midi_router_rule"].apply(null, arguments) };
var _new_fluid_mod = Module["_new_fluid_mod"] = function() {  return Module["asm"]["_new_fluid_mod"].apply(null, arguments) };
var _new_fluid_player = Module["_new_fluid_player"] = function() {  return Module["asm"]["_new_fluid_player"].apply(null, arguments) };
var _new_fluid_preset = Module["_new_fluid_preset"] = function() {  return Module["asm"]["_new_fluid_preset"].apply(null, arguments) };
var _new_fluid_sample = Module["_new_fluid_sample"] = function() {  return Module["asm"]["_new_fluid_sample"].apply(null, arguments) };
var _new_fluid_sequencer = Module["_new_fluid_sequencer"] = function() {  return Module["asm"]["_new_fluid_sequencer"].apply(null, arguments) };
var _new_fluid_sequencer2 = Module["_new_fluid_sequencer2"] = function() {  return Module["asm"]["_new_fluid_sequencer2"].apply(null, arguments) };
var _new_fluid_settings = Module["_new_fluid_settings"] = function() {  return Module["asm"]["_new_fluid_settings"].apply(null, arguments) };
var _new_fluid_sfloader = Module["_new_fluid_sfloader"] = function() {  return Module["asm"]["_new_fluid_sfloader"].apply(null, arguments) };
var _new_fluid_sfont = Module["_new_fluid_sfont"] = function() {  return Module["asm"]["_new_fluid_sfont"].apply(null, arguments) };
var _new_fluid_synth = Module["_new_fluid_synth"] = function() {  return Module["asm"]["_new_fluid_synth"].apply(null, arguments) };
var _sbrk = Module["_sbrk"] = function() {  return Module["asm"]["_sbrk"].apply(null, arguments) };
var establishStackSpace = Module["establishStackSpace"] = function() {  return Module["asm"]["establishStackSpace"].apply(null, arguments) };
var getTempRet0 = Module["getTempRet0"] = function() {  return Module["asm"]["getTempRet0"].apply(null, arguments) };
var runPostSets = Module["runPostSets"] = function() {  return Module["asm"]["runPostSets"].apply(null, arguments) };
var setTempRet0 = Module["setTempRet0"] = function() {  return Module["asm"]["setTempRet0"].apply(null, arguments) };
var setThrew = Module["setThrew"] = function() {  return Module["asm"]["setThrew"].apply(null, arguments) };
var stackAlloc = Module["stackAlloc"] = function() {  return Module["asm"]["stackAlloc"].apply(null, arguments) };
var stackRestore = Module["stackRestore"] = function() {  return Module["asm"]["stackRestore"].apply(null, arguments) };
var stackSave = Module["stackSave"] = function() {  return Module["asm"]["stackSave"].apply(null, arguments) };
var dynCall_ii = Module["dynCall_ii"] = function() {  return Module["asm"]["dynCall_ii"].apply(null, arguments) };
var dynCall_iii = Module["dynCall_iii"] = function() {  return Module["asm"]["dynCall_iii"].apply(null, arguments) };
var dynCall_iiii = Module["dynCall_iiii"] = function() {  return Module["asm"]["dynCall_iiii"].apply(null, arguments) };
var dynCall_iiiiii = Module["dynCall_iiiiii"] = function() {  return Module["asm"]["dynCall_iiiiii"].apply(null, arguments) };
var dynCall_iiiiiii = Module["dynCall_iiiiiii"] = function() {  return Module["asm"]["dynCall_iiiiiii"].apply(null, arguments) };
var dynCall_vi = Module["dynCall_vi"] = function() {  return Module["asm"]["dynCall_vi"].apply(null, arguments) };
var dynCall_vii = Module["dynCall_vii"] = function() {  return Module["asm"]["dynCall_vii"].apply(null, arguments) };
var dynCall_viid = Module["dynCall_viid"] = function() {  return Module["asm"]["dynCall_viid"].apply(null, arguments) };
var dynCall_viii = Module["dynCall_viii"] = function() {  return Module["asm"]["dynCall_viii"].apply(null, arguments) };
var dynCall_viiii = Module["dynCall_viiii"] = function() {  return Module["asm"]["dynCall_viiii"].apply(null, arguments) };
;



// === Auto-generated postamble setup entry stuff ===

Module['asm'] = asm;



Module["ccall"] = ccall;
Module["cwrap"] = cwrap;































Module["FS"] = FS;









































/**
 * @constructor
 * @extends {Error}
 * @this {ExitStatus}
 */
function ExitStatus(status) {
  this.name = "ExitStatus";
  this.message = "Program terminated with exit(" + status + ")";
  this.status = status;
};
ExitStatus.prototype = new Error();
ExitStatus.prototype.constructor = ExitStatus;

var initialStackTop;
var calledMain = false;

dependenciesFulfilled = function runCaller() {
  // If run has never been called, and we should call run (INVOKE_RUN is true, and Module.noInitialRun is not false)
  if (!Module['calledRun']) run();
  if (!Module['calledRun']) dependenciesFulfilled = runCaller; // try this again later, after new deps are fulfilled
}





/** @type {function(Array=)} */
function run(args) {
  args = args || Module['arguments'];

  if (runDependencies > 0) {
    return;
  }


  preRun();

  if (runDependencies > 0) return; // a preRun added a dependency, run will be called later
  if (Module['calledRun']) return; // run may have just been called through dependencies being fulfilled just in this very frame

  function doRun() {
    if (Module['calledRun']) return; // run may have just been called while the async setStatus time below was happening
    Module['calledRun'] = true;

    if (ABORT) return;

    ensureInitRuntime();

    preMain();

    if (Module['onRuntimeInitialized']) Module['onRuntimeInitialized']();


    postRun();
  }

  if (Module['setStatus']) {
    Module['setStatus']('Running...');
    setTimeout(function() {
      setTimeout(function() {
        Module['setStatus']('');
      }, 1);
      doRun();
    }, 1);
  } else {
    doRun();
  }
}
Module['run'] = run;


function exit(status, implicit) {

  // if this is just main exit-ing implicitly, and the status is 0, then we
  // don't need to do anything here and can just leave. if the status is
  // non-zero, though, then we need to report it.
  // (we may have warned about this earlier, if a situation justifies doing so)
  if (implicit && Module['noExitRuntime'] && status === 0) {
    return;
  }

  if (Module['noExitRuntime']) {
  } else {

    ABORT = true;
    EXITSTATUS = status;
    STACKTOP = initialStackTop;

    exitRuntime();

    if (Module['onExit']) Module['onExit'](status);
  }

  Module['quit'](status, new ExitStatus(status));
}

var abortDecorators = [];

function abort(what) {
  if (Module['onAbort']) {
    Module['onAbort'](what);
  }

  if (what !== undefined) {
    out(what);
    err(what);
    what = JSON.stringify(what)
  } else {
    what = '';
  }

  ABORT = true;
  EXITSTATUS = 1;

  throw 'abort(' + what + '). Build with -s ASSERTIONS=1 for more info.';
}
Module['abort'] = abort;

if (Module['preInit']) {
  if (typeof Module['preInit'] == 'function') Module['preInit'] = [Module['preInit']];
  while (Module['preInit'].length > 0) {
    Module['preInit'].pop()();
  }
}


Module["noExitRuntime"] = true;

run();





// {{MODULE_ADDITIONS}}



