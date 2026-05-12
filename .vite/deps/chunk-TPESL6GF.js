import {
  createPlugin,
  createStream
} from "./chunk-ZCRLZXAQ.js";

// node_modules/@tanstack/router-core/dist/esm/root.js
var rootRouteId = "__root__";

// node_modules/@tanstack/router-core/dist/esm/ssr/constants.js
var GLOBAL_TSR = "$_TSR";
var TSR_SCRIPT_BARRIER_ID = "$tsr-stream-barrier";

// node_modules/@tanstack/router-core/dist/esm/ssr/serializer/transformer.js
function createSerializationAdapter(opts) {
  return opts;
}
function makeSsrSerovalPlugin(serializationAdapter, options) {
  return createPlugin({
    tag: "$TSR/t/" + serializationAdapter.key,
    test: serializationAdapter.test,
    parse: { stream(value, ctx, _data) {
      return { v: ctx.parse(serializationAdapter.toSerializable(value)) };
    } },
    serialize(node, ctx, _data) {
      options.didRun = true;
      return GLOBAL_TSR + '.t.get("' + serializationAdapter.key + '")(' + ctx.serialize(node.v) + ")";
    },
    deserialize: void 0
  });
}
function makeSerovalPlugin(serializationAdapter) {
  return createPlugin({
    tag: "$TSR/t/" + serializationAdapter.key,
    test: serializationAdapter.test,
    parse: {
      sync(value, ctx, _data) {
        return { v: ctx.parse(serializationAdapter.toSerializable(value)) };
      },
      async async(value, ctx, _data) {
        return { v: await ctx.parse(serializationAdapter.toSerializable(value)) };
      },
      stream(value, ctx, _data) {
        return { v: ctx.parse(serializationAdapter.toSerializable(value)) };
      }
    },
    serialize: void 0,
    deserialize(node, ctx, _data) {
      return serializationAdapter.fromSerializable(ctx.deserialize(node.v));
    }
  });
}

// node_modules/@tanstack/router-core/dist/esm/ssr/serializer/RawStream.js
var RawStream = class {
  constructor(stream, options) {
    this.stream = stream;
    this.hint = options?.hint ?? "binary";
  }
};
var BufferCtor = globalThis.Buffer;
var hasNodeBuffer = !!BufferCtor && typeof BufferCtor.from === "function";
function uint8ArrayToBase64(bytes) {
  if (bytes.length === 0) return "";
  if (hasNodeBuffer) return BufferCtor.from(bytes).toString("base64");
  const CHUNK_SIZE = 32768;
  const chunks = [];
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    const chunk = bytes.subarray(i, i + CHUNK_SIZE);
    chunks.push(String.fromCharCode.apply(null, chunk));
  }
  return btoa(chunks.join(""));
}
function base64ToUint8Array(base64) {
  if (base64.length === 0) return new Uint8Array(0);
  if (hasNodeBuffer) {
    const buf = BufferCtor.from(base64, "base64");
    return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
var RAW_STREAM_FACTORY_BINARY = /* @__PURE__ */ Object.create(null);
var RAW_STREAM_FACTORY_TEXT = /* @__PURE__ */ Object.create(null);
var RAW_STREAM_FACTORY_CONSTRUCTOR_BINARY = (stream) => new ReadableStream({ start(controller) {
  stream.on({
    next(base64) {
      try {
        controller.enqueue(base64ToUint8Array(base64));
      } catch {
      }
    },
    throw(error) {
      controller.error(error);
    },
    return() {
      try {
        controller.close();
      } catch {
      }
    }
  });
} });
var textEncoderForFactory = new TextEncoder();
var RAW_STREAM_FACTORY_CONSTRUCTOR_TEXT = (stream) => {
  return new ReadableStream({ start(controller) {
    stream.on({
      next(value) {
        try {
          if (typeof value === "string") controller.enqueue(textEncoderForFactory.encode(value));
          else controller.enqueue(base64ToUint8Array(value.$b64));
        } catch {
        }
      },
      throw(error) {
        controller.error(error);
      },
      return() {
        try {
          controller.close();
        } catch {
        }
      }
    });
  } });
};
var FACTORY_BINARY = `(s=>new ReadableStream({start(c){s.on({next(b){try{const d=atob(b),a=new Uint8Array(d.length);for(let i=0;i<d.length;i++)a[i]=d.charCodeAt(i);c.enqueue(a)}catch(_){}},throw(e){c.error(e)},return(){try{c.close()}catch(_){}}})}}))`;
var FACTORY_TEXT = `(s=>{const e=new TextEncoder();return new ReadableStream({start(c){s.on({next(v){try{if(typeof v==='string'){c.enqueue(e.encode(v))}else{const d=atob(v.$b64),a=new Uint8Array(d.length);for(let i=0;i<d.length;i++)a[i]=d.charCodeAt(i);c.enqueue(a)}}catch(_){}},throw(x){c.error(x)},return(){try{c.close()}catch(_){}}})}})})`;
function toBinaryStream(readable) {
  const stream = createStream();
  const reader = readable.getReader();
  (async () => {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          stream.return(void 0);
          break;
        }
        stream.next(uint8ArrayToBase64(value));
      }
    } catch (error) {
      stream.throw(error);
    } finally {
      reader.releaseLock();
    }
  })();
  return stream;
}
function toTextStream(readable) {
  const stream = createStream();
  const reader = readable.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  (async () => {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          try {
            const remaining = decoder.decode();
            if (remaining.length > 0) stream.next(remaining);
          } catch {
          }
          stream.return(void 0);
          break;
        }
        try {
          const text = decoder.decode(value, { stream: true });
          if (text.length > 0) stream.next(text);
        } catch {
          stream.next({ $b64: uint8ArrayToBase64(value) });
        }
      }
    } catch (error) {
      stream.throw(error);
    } finally {
      reader.releaseLock();
    }
  })();
  return stream;
}
var RawStreamSSRPlugin = createPlugin({
  tag: "tss/RawStream",
  extends: [createPlugin({
    tag: "tss/RawStreamFactory",
    test(value) {
      return value === RAW_STREAM_FACTORY_BINARY;
    },
    parse: {
      sync(_value, _ctx, _data) {
        return {};
      },
      async async(_value, _ctx, _data) {
        return {};
      },
      stream(_value, _ctx, _data) {
        return {};
      }
    },
    serialize(_node, _ctx, _data) {
      return FACTORY_BINARY;
    },
    deserialize(_node, _ctx, _data) {
      return RAW_STREAM_FACTORY_BINARY;
    }
  }), createPlugin({
    tag: "tss/RawStreamFactoryText",
    test(value) {
      return value === RAW_STREAM_FACTORY_TEXT;
    },
    parse: {
      sync(_value, _ctx, _data) {
        return {};
      },
      async async(_value, _ctx, _data) {
        return {};
      },
      stream(_value, _ctx, _data) {
        return {};
      }
    },
    serialize(_node, _ctx, _data) {
      return FACTORY_TEXT;
    },
    deserialize(_node, _ctx, _data) {
      return RAW_STREAM_FACTORY_TEXT;
    }
  })],
  test(value) {
    return value instanceof RawStream;
  },
  parse: {
    sync(value, ctx, _data) {
      const factory = value.hint === "text" ? RAW_STREAM_FACTORY_TEXT : RAW_STREAM_FACTORY_BINARY;
      return {
        hint: ctx.parse(value.hint),
        factory: ctx.parse(factory),
        stream: ctx.parse(createStream())
      };
    },
    async async(value, ctx, _data) {
      const factory = value.hint === "text" ? RAW_STREAM_FACTORY_TEXT : RAW_STREAM_FACTORY_BINARY;
      const encodedStream = value.hint === "text" ? toTextStream(value.stream) : toBinaryStream(value.stream);
      return {
        hint: await ctx.parse(value.hint),
        factory: await ctx.parse(factory),
        stream: await ctx.parse(encodedStream)
      };
    },
    stream(value, ctx, _data) {
      const factory = value.hint === "text" ? RAW_STREAM_FACTORY_TEXT : RAW_STREAM_FACTORY_BINARY;
      const encodedStream = value.hint === "text" ? toTextStream(value.stream) : toBinaryStream(value.stream);
      return {
        hint: ctx.parse(value.hint),
        factory: ctx.parse(factory),
        stream: ctx.parse(encodedStream)
      };
    }
  },
  serialize(node, ctx, _data) {
    return "(" + ctx.serialize(node.factory) + ")(" + ctx.serialize(node.stream) + ")";
  },
  deserialize(node, ctx, _data) {
    const stream = ctx.deserialize(node.stream);
    return ctx.deserialize(node.hint) === "text" ? RAW_STREAM_FACTORY_CONSTRUCTOR_TEXT(stream) : RAW_STREAM_FACTORY_CONSTRUCTOR_BINARY(stream);
  }
});
function createRawStreamRPCPlugin(onRawStream) {
  let nextStreamId = 1;
  return createPlugin({
    tag: "tss/RawStream",
    test(value) {
      return value instanceof RawStream;
    },
    parse: {
      async async(value, ctx, _data) {
        const streamId = nextStreamId++;
        onRawStream(streamId, value.stream);
        return { streamId: await ctx.parse(streamId) };
      },
      stream(value, ctx, _data) {
        const streamId = nextStreamId++;
        onRawStream(streamId, value.stream);
        return { streamId: ctx.parse(streamId) };
      }
    },
    serialize() {
      throw new Error("RawStreamRPCPlugin.serialize should not be called. RPC uses JSON serialization, not JS code generation.");
    },
    deserialize() {
      throw new Error("RawStreamRPCPlugin.deserialize should not be called. Use createRawStreamDeserializePlugin on client.");
    }
  });
}
function createRawStreamDeserializePlugin(getOrCreateStream) {
  return createPlugin({
    tag: "tss/RawStream",
    test: () => false,
    parse: {},
    serialize() {
      throw new Error("RawStreamDeserializePlugin.serialize should not be called. Client only deserializes.");
    },
    deserialize(node, ctx, _data) {
      return getOrCreateStream(typeof ctx?.deserialize === "function" ? ctx.deserialize(node.streamId) : node.streamId);
    }
  });
}

// node_modules/@tanstack/router-core/dist/esm/ssr/serializer/ShallowErrorPlugin.js
var ShallowErrorPlugin = createPlugin({
  tag: "$TSR/Error",
  test(value) {
    return value instanceof Error;
  },
  parse: {
    sync(value, ctx) {
      return { message: ctx.parse(value.message) };
    },
    async async(value, ctx) {
      return { message: await ctx.parse(value.message) };
    },
    stream(value, ctx) {
      return { message: ctx.parse(value.message) };
    }
  },
  serialize(node, ctx) {
    return "new Error(" + ctx.serialize(node.message) + ")";
  },
  deserialize(node, ctx) {
    return new Error(ctx.deserialize(node.message));
  }
});

// node_modules/seroval-plugins/dist/esm/development/web.mjs
var PROMISE_TO_ABORT_SIGNAL = (promise) => {
  const controller = new AbortController();
  const abort = controller.abort.bind(controller);
  promise.then(abort, abort);
  return controller;
};
function resolveAbortSignalResult(resolve) {
  resolve(this.reason);
}
function resolveAbortSignal(resolve) {
  this.addEventListener("abort", resolveAbortSignalResult.bind(this, resolve), {
    once: true
  });
}
function abortSignalToPromise(signal) {
  return new Promise(resolveAbortSignal.bind(signal));
}
var ABORT_CONTROLLER = {};
var AbortControllerFactoryPlugin = createPlugin({
  tag: "seroval-plugins/web/AbortControllerFactoryPlugin",
  test(value) {
    return value === ABORT_CONTROLLER;
  },
  parse: {
    sync() {
      return ABORT_CONTROLLER;
    },
    async async() {
      return await Promise.resolve(ABORT_CONTROLLER);
    },
    stream() {
      return ABORT_CONTROLLER;
    }
  },
  serialize() {
    return PROMISE_TO_ABORT_SIGNAL.toString();
  },
  deserialize() {
    return PROMISE_TO_ABORT_SIGNAL;
  }
});
var AbortSignalPlugin = createPlugin({
  tag: "seroval-plugins/web/AbortSignal",
  extends: [AbortControllerFactoryPlugin],
  test(value) {
    if (typeof AbortSignal === "undefined") {
      return false;
    }
    return value instanceof AbortSignal;
  },
  parse: {
    sync(value, ctx) {
      if (value.aborted) {
        return {
          reason: ctx.parse(value.reason)
        };
      }
      return {};
    },
    async async(value, ctx) {
      if (value.aborted) {
        return {
          reason: await ctx.parse(value.reason)
        };
      }
      const result = await abortSignalToPromise(value);
      return {
        reason: await ctx.parse(result)
      };
    },
    stream(value, ctx) {
      if (value.aborted) {
        return {
          reason: ctx.parse(value.reason)
        };
      }
      const promise = abortSignalToPromise(value);
      return {
        factory: ctx.parse(ABORT_CONTROLLER),
        controller: ctx.parse(promise)
      };
    }
  },
  serialize(node, ctx) {
    if (node.reason) {
      return "AbortSignal.abort(" + ctx.serialize(node.reason) + ")";
    }
    if (node.controller && node.factory) {
      return "(" + ctx.serialize(node.factory) + ")(" + ctx.serialize(node.controller) + ").signal";
    }
    return "(new AbortController).signal";
  },
  deserialize(node, ctx) {
    if (node.reason) {
      return AbortSignal.abort(ctx.deserialize(node.reason));
    }
    if (node.controller) {
      return PROMISE_TO_ABORT_SIGNAL(ctx.deserialize(node.controller)).signal;
    }
    const controller = new AbortController();
    return controller.signal;
  }
});
var BlobPlugin = createPlugin({
  tag: "seroval-plugins/web/Blob",
  test(value) {
    if (typeof Blob === "undefined") {
      return false;
    }
    return value instanceof Blob;
  },
  parse: {
    async async(value, ctx) {
      return {
        type: await ctx.parse(value.type),
        buffer: await ctx.parse(await value.arrayBuffer())
      };
    }
  },
  serialize(node, ctx) {
    return "new Blob([" + ctx.serialize(node.buffer) + "],{type:" + ctx.serialize(node.type) + "})";
  },
  deserialize(node, ctx) {
    return new Blob([ctx.deserialize(node.buffer)], {
      type: ctx.deserialize(node.type)
    });
  }
});
function createCustomEventOptions(current) {
  return {
    detail: current.detail,
    bubbles: current.bubbles,
    cancelable: current.cancelable,
    composed: current.composed
  };
}
var CustomEventPlugin = createPlugin({
  tag: "seroval-plugins/web/CustomEvent",
  test(value) {
    if (typeof CustomEvent === "undefined") {
      return false;
    }
    return value instanceof CustomEvent;
  },
  parse: {
    sync(value, ctx) {
      return {
        type: ctx.parse(value.type),
        options: ctx.parse(createCustomEventOptions(value))
      };
    },
    async async(value, ctx) {
      return {
        type: await ctx.parse(value.type),
        options: await ctx.parse(createCustomEventOptions(value))
      };
    },
    stream(value, ctx) {
      return {
        type: ctx.parse(value.type),
        options: ctx.parse(createCustomEventOptions(value))
      };
    }
  },
  serialize(node, ctx) {
    return "new CustomEvent(" + ctx.serialize(node.type) + "," + ctx.serialize(node.options) + ")";
  },
  deserialize(node, ctx) {
    return new CustomEvent(
      ctx.deserialize(node.type),
      ctx.deserialize(node.options)
    );
  }
});
var DOMExceptionPlugin = createPlugin({
  tag: "seroval-plugins/web/DOMException",
  test(value) {
    if (typeof DOMException === "undefined") {
      return false;
    }
    return value instanceof DOMException;
  },
  parse: {
    sync(value, ctx) {
      return {
        name: ctx.parse(value.name),
        message: ctx.parse(value.message)
      };
    },
    async async(value, ctx) {
      return {
        name: await ctx.parse(value.name),
        message: await ctx.parse(value.message)
      };
    },
    stream(value, ctx) {
      return {
        name: ctx.parse(value.name),
        message: ctx.parse(value.message)
      };
    }
  },
  serialize(node, ctx) {
    return "new DOMException(" + ctx.serialize(node.message) + "," + ctx.serialize(node.name) + ")";
  },
  deserialize(node, ctx) {
    return new DOMException(
      ctx.deserialize(node.message),
      ctx.deserialize(node.name)
    );
  }
});
function createEventOptions(current) {
  return {
    bubbles: current.bubbles,
    cancelable: current.cancelable,
    composed: current.composed
  };
}
var EventPlugin = createPlugin({
  tag: "seroval-plugins/web/Event",
  test(value) {
    if (typeof Event === "undefined") {
      return false;
    }
    return value instanceof Event;
  },
  parse: {
    sync(value, ctx) {
      return {
        type: ctx.parse(value.type),
        options: ctx.parse(createEventOptions(value))
      };
    },
    async async(value, ctx) {
      return {
        type: await ctx.parse(value.type),
        options: await ctx.parse(createEventOptions(value))
      };
    },
    stream(value, ctx) {
      return {
        type: ctx.parse(value.type),
        options: ctx.parse(createEventOptions(value))
      };
    }
  },
  serialize(node, ctx) {
    return "new Event(" + ctx.serialize(node.type) + "," + ctx.serialize(node.options) + ")";
  },
  deserialize(node, ctx) {
    return new Event(
      ctx.deserialize(node.type),
      ctx.deserialize(node.options)
    );
  }
});
var FilePlugin = createPlugin({
  tag: "seroval-plugins/web/File",
  test(value) {
    if (typeof File === "undefined") {
      return false;
    }
    return value instanceof File;
  },
  parse: {
    async async(value, ctx) {
      return {
        name: await ctx.parse(value.name),
        options: await ctx.parse({
          type: value.type,
          lastModified: value.lastModified
        }),
        buffer: await ctx.parse(await value.arrayBuffer())
      };
    }
  },
  serialize(node, ctx) {
    return "new File([" + ctx.serialize(node.buffer) + "]," + ctx.serialize(node.name) + "," + ctx.serialize(node.options) + ")";
  },
  deserialize(node, ctx) {
    return new File(
      [ctx.deserialize(node.buffer)],
      ctx.deserialize(node.name),
      ctx.deserialize(node.options)
    );
  }
});
var file_default = FilePlugin;
function convertFormData(instance) {
  const items = [];
  instance.forEach((value, key) => {
    items.push([key, value]);
  });
  return items;
}
var FORM_DATA_FACTORY = {};
var FORM_DATA_FACTORY_CONSTRUCTOR = (e, f = new FormData(), i = 0, s = e.length, t) => {
  for (; i < s; i++) {
    t = e[i];
    f.append(t[0], t[1]);
  }
  return f;
};
var FormDataFactoryPlugin = createPlugin({
  tag: "seroval-plugins/web/FormDataFactory",
  test(value) {
    return value === FORM_DATA_FACTORY;
  },
  parse: {
    sync() {
      return FORM_DATA_FACTORY;
    },
    async async() {
      return await Promise.resolve(FORM_DATA_FACTORY);
    },
    stream() {
      return FORM_DATA_FACTORY;
    }
  },
  serialize() {
    return FORM_DATA_FACTORY_CONSTRUCTOR.toString();
  },
  deserialize() {
    return FORM_DATA_FACTORY;
  }
});
var FormDataPlugin = createPlugin({
  tag: "seroval-plugins/web/FormData",
  extends: [file_default, FormDataFactoryPlugin],
  test(value) {
    if (typeof FormData === "undefined") {
      return false;
    }
    return value instanceof FormData;
  },
  parse: {
    sync(value, ctx) {
      return {
        factory: ctx.parse(FORM_DATA_FACTORY),
        entries: ctx.parse(convertFormData(value))
      };
    },
    async async(value, ctx) {
      return {
        factory: await ctx.parse(FORM_DATA_FACTORY),
        entries: await ctx.parse(convertFormData(value))
      };
    },
    stream(value, ctx) {
      return {
        factory: ctx.parse(FORM_DATA_FACTORY),
        entries: ctx.parse(convertFormData(value))
      };
    }
  },
  serialize(node, ctx) {
    return "(" + ctx.serialize(node.factory) + ")(" + ctx.serialize(node.entries) + ")";
  },
  deserialize(node, ctx) {
    return FORM_DATA_FACTORY_CONSTRUCTOR(
      ctx.deserialize(node.entries)
    );
  }
});
function convertHeaders(instance) {
  const items = [];
  instance.forEach((value, key) => {
    items.push([key, value]);
  });
  return items;
}
var HeadersPlugin = createPlugin({
  tag: "seroval-plugins/web/Headers",
  test(value) {
    if (typeof Headers === "undefined") {
      return false;
    }
    return value instanceof Headers;
  },
  parse: {
    sync(value, ctx) {
      return {
        value: ctx.parse(convertHeaders(value))
      };
    },
    async async(value, ctx) {
      return {
        value: await ctx.parse(convertHeaders(value))
      };
    },
    stream(value, ctx) {
      return {
        value: ctx.parse(convertHeaders(value))
      };
    }
  },
  serialize(node, ctx) {
    return "new Headers(" + ctx.serialize(node.value) + ")";
  },
  deserialize(node, ctx) {
    return new Headers(ctx.deserialize(node.value));
  }
});
var headers_default = HeadersPlugin;
var ImageDataPlugin = createPlugin({
  tag: "seroval-plugins/web/ImageData",
  test(value) {
    if (typeof ImageData === "undefined") {
      return false;
    }
    return value instanceof ImageData;
  },
  parse: {
    sync(value, ctx) {
      return {
        data: ctx.parse(value.data),
        width: ctx.parse(value.width),
        height: ctx.parse(value.height),
        options: ctx.parse({
          colorSpace: value.colorSpace
        })
      };
    },
    async async(value, ctx) {
      return {
        data: await ctx.parse(value.data),
        width: await ctx.parse(value.width),
        height: await ctx.parse(value.height),
        options: await ctx.parse({
          colorSpace: value.colorSpace
        })
      };
    },
    stream(value, ctx) {
      return {
        data: ctx.parse(value.data),
        width: ctx.parse(value.width),
        height: ctx.parse(value.height),
        options: ctx.parse({
          colorSpace: value.colorSpace
        })
      };
    }
  },
  serialize(node, ctx) {
    return "new ImageData(" + ctx.serialize(node.data) + "," + ctx.serialize(node.width) + "," + ctx.serialize(node.height) + "," + ctx.serialize(node.options) + ")";
  },
  deserialize(node, ctx) {
    return new ImageData(
      ctx.deserialize(node.data),
      ctx.deserialize(node.width),
      ctx.deserialize(node.height),
      ctx.deserialize(node.options)
    );
  }
});
var READABLE_STREAM_FACTORY = {};
var READABLE_STREAM_FACTORY_CONSTRUCTOR = (stream) => new ReadableStream({
  start: (controller) => {
    stream.on({
      next: (value) => {
        try {
          controller.enqueue(value);
        } catch (_error) {
        }
      },
      throw: (value) => {
        controller.error(value);
      },
      return: () => {
        try {
          controller.close();
        } catch (_error) {
        }
      }
    });
  }
});
var ReadableStreamFactoryPlugin = createPlugin({
  tag: "seroval-plugins/web/ReadableStreamFactory",
  test(value) {
    return value === READABLE_STREAM_FACTORY;
  },
  parse: {
    sync() {
      return READABLE_STREAM_FACTORY;
    },
    async async() {
      return await Promise.resolve(READABLE_STREAM_FACTORY);
    },
    stream() {
      return READABLE_STREAM_FACTORY;
    }
  },
  serialize() {
    return READABLE_STREAM_FACTORY_CONSTRUCTOR.toString();
  },
  deserialize() {
    return READABLE_STREAM_FACTORY;
  }
});
function toStream(value) {
  const stream = createStream();
  const reader = value.getReader();
  async function push() {
    try {
      const result = await reader.read();
      if (result.done) {
        stream.return(result.value);
      } else {
        stream.next(result.value);
        await push();
      }
    } catch (error) {
      stream.throw(error);
    }
  }
  push().catch(() => {
  });
  return stream;
}
var ReadableStreamPlugin = createPlugin({
  tag: "seroval/plugins/web/ReadableStream",
  extends: [ReadableStreamFactoryPlugin],
  test(value) {
    if (typeof ReadableStream === "undefined") {
      return false;
    }
    return value instanceof ReadableStream;
  },
  parse: {
    sync(_value, ctx) {
      return {
        factory: ctx.parse(READABLE_STREAM_FACTORY),
        stream: ctx.parse(createStream())
      };
    },
    async async(value, ctx) {
      return {
        factory: await ctx.parse(READABLE_STREAM_FACTORY),
        stream: await ctx.parse(toStream(value))
      };
    },
    stream(value, ctx) {
      return {
        factory: ctx.parse(READABLE_STREAM_FACTORY),
        stream: ctx.parse(toStream(value))
      };
    }
  },
  serialize(node, ctx) {
    return "(" + ctx.serialize(node.factory) + ")(" + ctx.serialize(node.stream) + ")";
  },
  deserialize(node, ctx) {
    const stream = ctx.deserialize(node.stream);
    return READABLE_STREAM_FACTORY_CONSTRUCTOR(stream);
  }
});
var readable_stream_default = ReadableStreamPlugin;
function createRequestOptions(current, body) {
  return {
    body,
    cache: current.cache,
    credentials: current.credentials,
    headers: current.headers,
    integrity: current.integrity,
    keepalive: current.keepalive,
    method: current.method,
    mode: current.mode,
    redirect: current.redirect,
    referrer: current.referrer,
    referrerPolicy: current.referrerPolicy
  };
}
var RequestPlugin = createPlugin({
  tag: "seroval-plugins/web/Request",
  extends: [readable_stream_default, headers_default],
  test(value) {
    if (typeof Request === "undefined") {
      return false;
    }
    return value instanceof Request;
  },
  parse: {
    async async(value, ctx) {
      return {
        url: await ctx.parse(value.url),
        options: await ctx.parse(
          createRequestOptions(
            value,
            value.body && !value.bodyUsed ? await value.clone().arrayBuffer() : null
          )
        )
      };
    },
    stream(value, ctx) {
      return {
        url: ctx.parse(value.url),
        options: ctx.parse(
          createRequestOptions(
            value,
            value.body && !value.bodyUsed ? value.clone().body : null
          )
        )
      };
    }
  },
  serialize(node, ctx) {
    return "new Request(" + ctx.serialize(node.url) + "," + ctx.serialize(node.options) + ")";
  },
  deserialize(node, ctx) {
    return new Request(
      ctx.deserialize(node.url),
      ctx.deserialize(node.options)
    );
  }
});
function createResponseOptions(current) {
  return {
    headers: current.headers,
    status: current.status,
    statusText: current.statusText
  };
}
var ResponsePlugin = createPlugin({
  tag: "seroval-plugins/web/Response",
  extends: [readable_stream_default, headers_default],
  test(value) {
    if (typeof Response === "undefined") {
      return false;
    }
    return value instanceof Response;
  },
  parse: {
    async async(value, ctx) {
      return {
        body: await ctx.parse(
          value.body && !value.bodyUsed ? await value.clone().arrayBuffer() : null
        ),
        options: await ctx.parse(createResponseOptions(value))
      };
    },
    stream(value, ctx) {
      return {
        body: ctx.parse(
          value.body && !value.bodyUsed ? value.clone().body : null
        ),
        options: ctx.parse(createResponseOptions(value))
      };
    }
  },
  serialize(node, ctx) {
    return "new Response(" + ctx.serialize(node.body) + "," + ctx.serialize(node.options) + ")";
  },
  deserialize(node, ctx) {
    return new Response(
      ctx.deserialize(node.body),
      ctx.deserialize(node.options)
    );
  }
});
var URLPlugin = createPlugin({
  tag: "seroval-plugins/web/URL",
  test(value) {
    if (typeof URL === "undefined") {
      return false;
    }
    return value instanceof URL;
  },
  parse: {
    sync(value, ctx) {
      return {
        value: ctx.parse(value.href)
      };
    },
    async async(value, ctx) {
      return {
        value: await ctx.parse(value.href)
      };
    },
    stream(value, ctx) {
      return {
        value: ctx.parse(value.href)
      };
    }
  },
  serialize(node, ctx) {
    return "new URL(" + ctx.serialize(node.value) + ")";
  },
  deserialize(node, ctx) {
    return new URL(ctx.deserialize(node.value));
  }
});
var URLSearchParamsPlugin = createPlugin({
  tag: "seroval-plugins/web/URLSearchParams",
  test(value) {
    if (typeof URLSearchParams === "undefined") {
      return false;
    }
    return value instanceof URLSearchParams;
  },
  parse: {
    sync(value, ctx) {
      return {
        value: ctx.parse(value.toString())
      };
    },
    async async(value, ctx) {
      return {
        value: await ctx.parse(value.toString())
      };
    },
    stream(value, ctx) {
      return {
        value: ctx.parse(value.toString())
      };
    }
  },
  serialize(node, ctx) {
    return "new URLSearchParams(" + ctx.serialize(node.value) + ")";
  },
  deserialize(node, ctx) {
    return new URLSearchParams(ctx.deserialize(node.value));
  }
});

// node_modules/@tanstack/router-core/dist/esm/ssr/serializer/seroval-plugins.js
var defaultSerovalPlugins = [
  ShallowErrorPlugin,
  RawStreamSSRPlugin,
  readable_stream_default
];

// node_modules/@tanstack/router-core/dist/esm/lru-cache.js
function createLRUCache(max) {
  const cache = /* @__PURE__ */ new Map();
  let oldest;
  let newest;
  const touch = (entry) => {
    if (!entry.next) return;
    if (!entry.prev) {
      entry.next.prev = void 0;
      oldest = entry.next;
      entry.next = void 0;
      if (newest) {
        entry.prev = newest;
        newest.next = entry;
      }
    } else {
      entry.prev.next = entry.next;
      entry.next.prev = entry.prev;
      entry.next = void 0;
      if (newest) {
        newest.next = entry;
        entry.prev = newest;
      }
    }
    newest = entry;
  };
  return {
    get(key) {
      const entry = cache.get(key);
      if (!entry) return void 0;
      touch(entry);
      return entry.value;
    },
    set(key, value) {
      if (cache.size >= max && oldest) {
        const toDelete = oldest;
        cache.delete(toDelete.key);
        if (toDelete.next) {
          oldest = toDelete.next;
          toDelete.next.prev = void 0;
        }
        if (toDelete === newest) newest = void 0;
      }
      const existing = cache.get(key);
      if (existing) {
        existing.value = value;
        touch(existing);
      } else {
        const entry = {
          key,
          value,
          prev: newest
        };
        if (newest) newest.next = entry;
        newest = entry;
        if (!oldest) oldest = entry;
        cache.set(key, entry);
      }
    },
    clear() {
      cache.clear();
      oldest = void 0;
      newest = void 0;
    }
  };
}

export {
  createLRUCache,
  rootRouteId,
  GLOBAL_TSR,
  TSR_SCRIPT_BARRIER_ID,
  createSerializationAdapter,
  makeSsrSerovalPlugin,
  makeSerovalPlugin,
  RawStream,
  createRawStreamRPCPlugin,
  createRawStreamDeserializePlugin,
  defaultSerovalPlugins
};
//# sourceMappingURL=chunk-TPESL6GF.js.map
