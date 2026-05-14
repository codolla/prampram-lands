import { dehydrateSsrMatchId, mergeHeaders } from "./chunk-N22YCUSM.js";
import {
  GLOBAL_TSR,
  TSR_SCRIPT_BARRIER_ID,
  createLRUCache,
  defaultSerovalPlugins,
  makeSsrSerovalPlugin,
  rootRouteId,
} from "./chunk-TPESL6GF.js";
import { decodePath, invariant } from "./chunk-CLINTJPG.js";
import { crossSerializeStream, getCrossReferenceHeader } from "./chunk-ZCRLZXAQ.js";
import { createMemoryHistory } from "./chunk-AVKHF3FF.js";
import { __commonJS, __toESM } from "./chunk-PR4QN5HX.js";

// browser-external:node:stream/web
var require_web = __commonJS({
  "browser-external:node:stream/web"(exports, module) {
    module.exports = Object.create(
      new Proxy(
        {},
        {
          get(_, key) {
            if (
              key !== "__esModule" &&
              key !== "__proto__" &&
              key !== "constructor" &&
              key !== "splice"
            ) {
              console.warn(
                `Module "node:stream/web" has been externalized for browser compatibility. Cannot access "node:stream/web.${key}" in client code. See https://vite.dev/guide/troubleshooting.html#module-externalized-for-browser-compatibility for more details.`,
              );
            }
          },
        },
      ),
    );
  },
});

// browser-external:node:stream
var require_node_stream = __commonJS({
  "browser-external:node:stream"(exports, module) {
    module.exports = Object.create(
      new Proxy(
        {},
        {
          get(_, key) {
            if (
              key !== "__esModule" &&
              key !== "__proto__" &&
              key !== "constructor" &&
              key !== "splice"
            ) {
              console.warn(
                `Module "node:stream" has been externalized for browser compatibility. Cannot access "node:stream.${key}" in client code. See https://vite.dev/guide/troubleshooting.html#module-externalized-for-browser-compatibility for more details.`,
              );
            }
          },
        },
      ),
    );
  },
});

// node_modules/@tanstack/router-core/dist/esm/ssr/tsrScript.js
var tsrScript_default =
  "self.$_TSR={h(){this.hydrated=!0,this.c()},e(){this.streamEnded=!0,this.c()},c(){this.hydrated&&this.streamEnded&&(delete self.$_TSR,delete self.$R.tsr)},p(e){this.initialized?e():this.buffer.push(e)},buffer:[]}";

// node_modules/@tanstack/router-core/dist/esm/ssr/ssr-server.js
var SCOPE_ID = "tsr";
var TSR_PREFIX = GLOBAL_TSR + ".router=";
var P_PREFIX = GLOBAL_TSR + ".p(()=>";
var P_SUFFIX = ")";
function dehydrateMatch(match) {
  const dehydratedMatch = {
    i: dehydrateSsrMatchId(match.id),
    u: match.updatedAt,
    s: match.status,
  };
  for (const [key, shorthand] of [
    ["__beforeLoadContext", "b"],
    ["loaderData", "l"],
    ["error", "e"],
    ["ssr", "ssr"],
  ])
    if (match[key] !== void 0) dehydratedMatch[shorthand] = match[key];
  if (match.globalNotFound) dehydratedMatch.g = true;
  return dehydratedMatch;
}
var INITIAL_SCRIPTS = [getCrossReferenceHeader(SCOPE_ID), tsrScript_default];
var ScriptBuffer = class {
  constructor(router) {
    this._scriptBarrierLifted = false;
    this._cleanedUp = false;
    this._pendingMicrotask = false;
    this.router = router;
    this._queue = INITIAL_SCRIPTS.slice();
  }
  enqueue(script) {
    if (this._cleanedUp) return;
    this._queue.push(script);
    if (this._scriptBarrierLifted && !this._pendingMicrotask) {
      this._pendingMicrotask = true;
      queueMicrotask(() => {
        this._pendingMicrotask = false;
        this.injectBufferedScripts();
      });
    }
  }
  liftBarrier() {
    if (this._scriptBarrierLifted || this._cleanedUp) return;
    this._scriptBarrierLifted = true;
    if (this._queue.length > 0 && !this._pendingMicrotask) {
      this._pendingMicrotask = true;
      queueMicrotask(() => {
        this._pendingMicrotask = false;
        this.injectBufferedScripts();
      });
    }
  }
  /**
   * Flushes any pending scripts synchronously.
   * Call this before emitting onSerializationFinished to ensure all scripts are injected.
   *
   * IMPORTANT: Only injects if the barrier has been lifted. Before the barrier is lifted,
   * scripts should remain in the queue so takeBufferedScripts() can retrieve them
   */
  flush() {
    if (!this._scriptBarrierLifted) return;
    if (this._cleanedUp) return;
    this._pendingMicrotask = false;
    const scriptsToInject = this.takeAll();
    if (scriptsToInject && this.router?.serverSsr)
      this.router.serverSsr.injectScript(scriptsToInject);
  }
  takeAll() {
    const bufferedScripts = this._queue;
    this._queue = [];
    if (bufferedScripts.length === 0) return;
    if (bufferedScripts.length === 1)
      return bufferedScripts[0] + ";document.currentScript.remove()";
    return bufferedScripts.join(";") + ";document.currentScript.remove()";
  }
  injectBufferedScripts() {
    if (this._cleanedUp) return;
    if (this._queue.length === 0) return;
    const scriptsToInject = this.takeAll();
    if (scriptsToInject && this.router?.serverSsr)
      this.router.serverSsr.injectScript(scriptsToInject);
  }
  cleanup() {
    this._cleanedUp = true;
    this._queue = [];
    this.router = void 0;
  }
};
var isProd = false;
var MANIFEST_CACHE_SIZE = 100;
var manifestCaches = /* @__PURE__ */ new WeakMap();
function getManifestCache(manifest) {
  const cache = manifestCaches.get(manifest);
  if (cache) return cache;
  const newCache = createLRUCache(MANIFEST_CACHE_SIZE);
  manifestCaches.set(manifest, newCache);
  return newCache;
}
function attachRouterServerSsrUtils({
  router,
  manifest,
  getRequestAssets,
  includeUnmatchedRouteAssets = true,
}) {
  router.ssr = {
    get manifest() {
      const requestAssets = getRequestAssets?.();
      if (!requestAssets?.length) return manifest;
      return {
        ...manifest,
        routes: {
          ...manifest?.routes,
          [rootRouteId]: {
            ...manifest?.routes?.[rootRouteId],
            assets: [...requestAssets, ...(manifest?.routes?.["__root__"]?.assets ?? [])],
          },
        },
      };
    },
  };
  let _dehydrated = false;
  let _serializationFinished = false;
  const renderFinishedListeners = [];
  const serializationFinishedListeners = [];
  const scriptBuffer = new ScriptBuffer(router);
  let injectedHtmlBuffer = "";
  router.serverSsr = {
    injectHtml: (html) => {
      if (!html) return;
      injectedHtmlBuffer += html;
      router.emit({ type: "onInjectedHtml" });
    },
    injectScript: (script) => {
      if (!script) return;
      const html = `<script${router.options.ssr?.nonce ? ` nonce='${router.options.ssr.nonce}'` : ""}>${script}<\/script>`;
      router.serverSsr.injectHtml(html);
    },
    dehydrate: async (opts) => {
      if (_dehydrated) {
        if (true) throw new Error("Invariant failed: router is already dehydrated!");
        invariant();
      }
      let matchesToDehydrate = router.stores.matches.get();
      if (router.isShell()) matchesToDehydrate = matchesToDehydrate.slice(0, 1);
      const matches = matchesToDehydrate.map(dehydrateMatch);
      let manifestToDehydrate = void 0;
      if (manifest) {
        const currentRouteIdsList = matchesToDehydrate.map((m) => m.routeId);
        const manifestCacheKey = `${currentRouteIdsList.join("\0")}\0includeUnmatchedRouteAssets=${includeUnmatchedRouteAssets}`;
        let filteredRoutes;
        if (isProd) filteredRoutes = getManifestCache(manifest).get(manifestCacheKey);
        if (!filteredRoutes) {
          const currentRouteIds = new Set(currentRouteIdsList);
          const nextFilteredRoutes = {};
          for (const routeId in manifest.routes) {
            const routeManifest = manifest.routes[routeId];
            if (currentRouteIds.has(routeId)) nextFilteredRoutes[routeId] = routeManifest;
            else if (
              includeUnmatchedRouteAssets &&
              routeManifest.assets &&
              routeManifest.assets.length > 0
            )
              nextFilteredRoutes[routeId] = { assets: routeManifest.assets };
          }
          if (isProd) getManifestCache(manifest).set(manifestCacheKey, nextFilteredRoutes);
          filteredRoutes = nextFilteredRoutes;
        }
        manifestToDehydrate = { routes: filteredRoutes };
        if (opts?.requestAssets?.length) {
          const existingRoot = manifestToDehydrate.routes[rootRouteId];
          manifestToDehydrate.routes[rootRouteId] = {
            ...existingRoot,
            assets: [...opts.requestAssets, ...(existingRoot?.assets ?? [])],
          };
        }
      }
      const dehydratedRouter = {
        manifest: manifestToDehydrate,
        matches,
      };
      const lastMatchId = matchesToDehydrate[matchesToDehydrate.length - 1]?.id;
      if (lastMatchId) dehydratedRouter.lastMatchId = dehydrateSsrMatchId(lastMatchId);
      const dehydratedData = await router.options.dehydrate?.();
      if (dehydratedData) dehydratedRouter.dehydratedData = dehydratedData;
      _dehydrated = true;
      const trackPlugins = { didRun: false };
      const serializationAdapters = router.options.serializationAdapters;
      const plugins = serializationAdapters
        ? serializationAdapters
            .map((t) => makeSsrSerovalPlugin(t, trackPlugins))
            .concat(defaultSerovalPlugins)
        : defaultSerovalPlugins;
      const signalSerializationComplete = () => {
        _serializationFinished = true;
        try {
          serializationFinishedListeners.forEach((l) => l());
          router.emit({ type: "onSerializationFinished" });
        } catch (err) {
          console.error("Serialization listener error:", err);
        } finally {
          serializationFinishedListeners.length = 0;
          renderFinishedListeners.length = 0;
        }
      };
      crossSerializeStream(dehydratedRouter, {
        refs: /* @__PURE__ */ new Map(),
        plugins,
        onSerialize: (data, initial) => {
          let serialized = initial ? TSR_PREFIX + data : data;
          if (trackPlugins.didRun) serialized = P_PREFIX + serialized + P_SUFFIX;
          scriptBuffer.enqueue(serialized);
        },
        onError: (err) => {
          console.error("Serialization error:", err);
          if (err && err.stack) console.error(err.stack);
          signalSerializationComplete();
        },
        scopeId: SCOPE_ID,
        onDone: () => {
          scriptBuffer.enqueue(GLOBAL_TSR + ".e()");
          scriptBuffer.flush();
          signalSerializationComplete();
        },
      });
    },
    isDehydrated() {
      return _dehydrated;
    },
    isSerializationFinished() {
      return _serializationFinished;
    },
    onRenderFinished: (listener) => renderFinishedListeners.push(listener),
    onSerializationFinished: (listener) => serializationFinishedListeners.push(listener),
    setRenderFinished: () => {
      try {
        renderFinishedListeners.forEach((l) => l());
      } catch (err) {
        console.error("Error in render finished listener:", err);
      } finally {
        renderFinishedListeners.length = 0;
      }
      scriptBuffer.liftBarrier();
    },
    takeBufferedScripts() {
      const scripts = scriptBuffer.takeAll();
      return {
        tag: "script",
        attrs: {
          nonce: router.options.ssr?.nonce,
          className: "$tsr",
          id: TSR_SCRIPT_BARRIER_ID,
        },
        children: scripts,
      };
    },
    liftScriptBarrier() {
      scriptBuffer.liftBarrier();
    },
    takeBufferedHtml() {
      if (!injectedHtmlBuffer) return;
      const buffered = injectedHtmlBuffer;
      injectedHtmlBuffer = "";
      return buffered;
    },
    cleanup() {
      if (!router.serverSsr) return;
      renderFinishedListeners.length = 0;
      serializationFinishedListeners.length = 0;
      injectedHtmlBuffer = "";
      scriptBuffer.cleanup();
      router.serverSsr = void 0;
    },
  };
}
function getOrigin(request) {
  try {
    return new URL(request.url).origin;
  } catch {}
  return "http://localhost";
}
function getNormalizedURL(url, base) {
  if (typeof url === "string") url = url.replace("\\", "%5C");
  const rawUrl = new URL(url, base);
  const { path: decodedPathname, handledProtocolRelativeURL } = decodePath(rawUrl.pathname);
  const searchParams = new URLSearchParams(rawUrl.search);
  const normalizedHref =
    decodedPathname + (searchParams.size > 0 ? "?" : "") + searchParams.toString() + rawUrl.hash;
  return {
    url: new URL(normalizedHref, rawUrl.origin),
    handledProtocolRelativeURL,
  };
}

// node_modules/@tanstack/router-core/dist/esm/ssr/createRequestHandler.js
function createRequestHandler({ createRouter, request, getRouterManifest }) {
  return async (cb) => {
    const router = createRouter();
    let cbWillCleanup = false;
    try {
      attachRouterServerSsrUtils({
        router,
        manifest: await getRouterManifest?.(),
      });
      const { url } = getNormalizedURL(request.url, "http://localhost");
      const origin = getOrigin(request);
      const history = createMemoryHistory({ initialEntries: [url.href.replace(url.origin, "")] });
      router.update({
        history,
        origin: router.options.origin ?? origin,
      });
      await router.load();
      await router.serverSsr?.dehydrate();
      const responseHeaders = getRequestHeaders({ router });
      cbWillCleanup = true;
      return cb({
        request,
        router,
        responseHeaders,
      });
    } finally {
      if (!cbWillCleanup) router.serverSsr?.cleanup();
    }
  };
}
function getRequestHeaders(opts) {
  const matchHeaders = opts.router.stores.matches.get().map((match) => match.headers);
  const redirect = opts.router.stores.redirect.get();
  if (redirect) matchHeaders.push(redirect.headers);
  return mergeHeaders({ "Content-Type": "text/html; charset=UTF-8" }, ...matchHeaders);
}

// node_modules/@tanstack/router-core/dist/esm/ssr/handlerCallback.js
function defineHandlerCallback(handler) {
  return handler;
}

// node_modules/@tanstack/router-core/dist/esm/ssr/transformStreamWithRouter.js
var import_web = __toESM(require_web(), 1);
var import_node_stream = __toESM(require_node_stream(), 1);
function transformReadableStreamWithRouter(router, routerStream) {
  return transformStreamWithRouter(router, routerStream);
}
function transformPipeableStreamWithRouter(router, routerStream) {
  return import_node_stream.Readable.fromWeb(
    transformStreamWithRouter(router, import_node_stream.Readable.toWeb(routerStream)),
  );
}
var BODY_END_TAG = "</body>";
var HTML_END_TAG = "</html>";
var MIN_CLOSING_TAG_LENGTH = 4;
var DEFAULT_SERIALIZATION_TIMEOUT_MS = 6e4;
var DEFAULT_LIFETIME_TIMEOUT_MS = 6e4;
var textEncoder = new TextEncoder();
function findLastClosingTagEnd(str) {
  const len = str.length;
  if (len < MIN_CLOSING_TAG_LENGTH) return -1;
  let i = len - 1;
  while (i >= MIN_CLOSING_TAG_LENGTH - 1) {
    if (str.charCodeAt(i) === 62) {
      let j = i - 1;
      while (j >= 1) {
        const code = str.charCodeAt(j);
        if (
          (code >= 97 && code <= 122) ||
          (code >= 65 && code <= 90) ||
          (code >= 48 && code <= 57) ||
          code === 95 ||
          code === 58 ||
          code === 46 ||
          code === 45
        )
          j--;
        else break;
      }
      const tagNameStart = j + 1;
      if (tagNameStart < i) {
        const startCode = str.charCodeAt(tagNameStart);
        if ((startCode >= 97 && startCode <= 122) || (startCode >= 65 && startCode <= 90)) {
          if (j >= 1 && str.charCodeAt(j) === 47 && str.charCodeAt(j - 1) === 60) return i + 1;
        }
      }
    }
    i--;
  }
  return -1;
}
function transformStreamWithRouter(router, appStream, opts) {
  const serializationAlreadyFinished = router.serverSsr?.isSerializationFinished() ?? false;
  const initialBufferedHtml = router.serverSsr?.takeBufferedHtml();
  if (serializationAlreadyFinished && !initialBufferedHtml) {
    let cleanedUp2 = false;
    let controller2;
    let isStreamClosed2 = false;
    let lifetimeTimeoutHandle2;
    const cleanup2 = () => {
      if (cleanedUp2) return;
      cleanedUp2 = true;
      if (lifetimeTimeoutHandle2 !== void 0) {
        clearTimeout(lifetimeTimeoutHandle2);
        lifetimeTimeoutHandle2 = void 0;
      }
      router.serverSsr?.cleanup();
    };
    const safeClose2 = () => {
      if (isStreamClosed2) return;
      isStreamClosed2 = true;
      try {
        controller2?.close();
      } catch {}
    };
    const safeError2 = (error) => {
      if (isStreamClosed2) return;
      isStreamClosed2 = true;
      try {
        controller2?.error(error);
      } catch {}
    };
    const lifetimeMs2 = opts?.lifetimeMs ?? DEFAULT_LIFETIME_TIMEOUT_MS;
    lifetimeTimeoutHandle2 = setTimeout(() => {
      if (!cleanedUp2 && !isStreamClosed2) {
        console.warn(
          `SSR stream transform exceeded maximum lifetime (${lifetimeMs2}ms), forcing cleanup`,
        );
        safeError2(new Error("Stream lifetime exceeded"));
        cleanup2();
      }
    }, lifetimeMs2);
    const stream2 = new import_web.ReadableStream({
      start(c) {
        controller2 = c;
      },
      cancel() {
        isStreamClosed2 = true;
        cleanup2();
      },
    });
    (async () => {
      const reader = appStream.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (cleanedUp2 || isStreamClosed2) return;
          controller2?.enqueue(value);
        }
        if (cleanedUp2 || isStreamClosed2) return;
        router.serverSsr?.setRenderFinished();
        safeClose2();
        cleanup2();
      } catch (error) {
        if (cleanedUp2) return;
        console.error("Error reading appStream:", error);
        router.serverSsr?.setRenderFinished();
        safeError2(error);
        cleanup2();
      } finally {
        reader.releaseLock();
      }
    })().catch((error) => {
      if (cleanedUp2) return;
      console.error("Error in stream transform:", error);
      safeError2(error);
      cleanup2();
    });
    return stream2;
  }
  let stopListeningToInjectedHtml;
  let stopListeningToSerializationFinished;
  let serializationTimeoutHandle;
  let lifetimeTimeoutHandle;
  let cleanedUp = false;
  let controller;
  let isStreamClosed = false;
  const textDecoder = new TextDecoder();
  let pendingRouterHtml = initialBufferedHtml ?? "";
  let leftover = "";
  let pendingClosingTags = "";
  const MAX_LEFTOVER_CHARS = 2048;
  let isAppRendering = true;
  let streamBarrierLifted = false;
  let serializationFinished = serializationAlreadyFinished;
  function safeEnqueue(chunk) {
    if (isStreamClosed) return;
    if (typeof chunk === "string") controller.enqueue(textEncoder.encode(chunk));
    else controller.enqueue(chunk);
  }
  function safeClose() {
    if (isStreamClosed) return;
    isStreamClosed = true;
    try {
      controller.close();
    } catch {}
  }
  function safeError(error) {
    if (isStreamClosed) return;
    isStreamClosed = true;
    try {
      controller.error(error);
    } catch {}
  }
  function cleanup() {
    if (cleanedUp) return;
    cleanedUp = true;
    try {
      stopListeningToInjectedHtml?.();
      stopListeningToSerializationFinished?.();
    } catch {}
    stopListeningToInjectedHtml = void 0;
    stopListeningToSerializationFinished = void 0;
    if (serializationTimeoutHandle !== void 0) {
      clearTimeout(serializationTimeoutHandle);
      serializationTimeoutHandle = void 0;
    }
    if (lifetimeTimeoutHandle !== void 0) {
      clearTimeout(lifetimeTimeoutHandle);
      lifetimeTimeoutHandle = void 0;
    }
    pendingRouterHtml = "";
    leftover = "";
    pendingClosingTags = "";
    router.serverSsr?.cleanup();
  }
  const stream = new import_web.ReadableStream({
    start(c) {
      controller = c;
    },
    cancel() {
      isStreamClosed = true;
      cleanup();
    },
  });
  function flushPendingRouterHtml() {
    if (!pendingRouterHtml) return;
    safeEnqueue(pendingRouterHtml);
    pendingRouterHtml = "";
  }
  function appendRouterHtml(html) {
    if (!html) return;
    pendingRouterHtml += html;
  }
  function tryFinish() {
    if (isAppRendering || !serializationFinished) return;
    if (cleanedUp || isStreamClosed) return;
    if (serializationTimeoutHandle !== void 0) {
      clearTimeout(serializationTimeoutHandle);
      serializationTimeoutHandle = void 0;
    }
    const decoderRemainder = textDecoder.decode();
    if (leftover) safeEnqueue(leftover);
    if (decoderRemainder) safeEnqueue(decoderRemainder);
    flushPendingRouterHtml();
    if (pendingClosingTags) safeEnqueue(pendingClosingTags);
    safeClose();
    cleanup();
  }
  const lifetimeMs = opts?.lifetimeMs ?? DEFAULT_LIFETIME_TIMEOUT_MS;
  lifetimeTimeoutHandle = setTimeout(() => {
    if (!cleanedUp && !isStreamClosed) {
      console.warn(
        `SSR stream transform exceeded maximum lifetime (${lifetimeMs}ms), forcing cleanup`,
      );
      safeError(new Error("Stream lifetime exceeded"));
      cleanup();
    }
  }, lifetimeMs);
  if (!serializationAlreadyFinished) {
    stopListeningToInjectedHtml = router.subscribe("onInjectedHtml", () => {
      if (cleanedUp || isStreamClosed) return;
      const html = router.serverSsr?.takeBufferedHtml();
      if (!html) return;
      if (isAppRendering || leftover || pendingClosingTags) appendRouterHtml(html);
      else {
        flushPendingRouterHtml();
        safeEnqueue(html);
      }
    });
    stopListeningToSerializationFinished = router.subscribe("onSerializationFinished", () => {
      serializationFinished = true;
      tryFinish();
    });
  }
  (async () => {
    const reader = appStream.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (cleanedUp || isStreamClosed) return;
        const text =
          value instanceof Uint8Array ? textDecoder.decode(value, { stream: true }) : String(value);
        const chunkString = leftover ? leftover + text : text;
        if (!streamBarrierLifted) {
          if (chunkString.includes("$tsr-stream-barrier")) {
            streamBarrierLifted = true;
            router.serverSsr?.liftScriptBarrier();
          }
        }
        if (pendingClosingTags) {
          pendingClosingTags += chunkString;
          leftover = "";
          continue;
        }
        const bodyEndIndex = chunkString.indexOf(BODY_END_TAG);
        const htmlEndIndex = chunkString.indexOf(HTML_END_TAG);
        if (bodyEndIndex !== -1 && htmlEndIndex !== -1 && bodyEndIndex < htmlEndIndex) {
          pendingClosingTags = chunkString.slice(bodyEndIndex);
          safeEnqueue(chunkString.slice(0, bodyEndIndex));
          flushPendingRouterHtml();
          leftover = "";
          continue;
        }
        const lastClosingTagEnd = findLastClosingTagEnd(chunkString);
        if (lastClosingTagEnd > 0) {
          safeEnqueue(chunkString.slice(0, lastClosingTagEnd));
          flushPendingRouterHtml();
          leftover = chunkString.slice(lastClosingTagEnd);
          if (leftover.length > MAX_LEFTOVER_CHARS) {
            safeEnqueue(leftover.slice(0, leftover.length - MAX_LEFTOVER_CHARS));
            leftover = leftover.slice(-MAX_LEFTOVER_CHARS);
          }
        } else {
          const combined = chunkString;
          if (combined.length > MAX_LEFTOVER_CHARS) {
            const flushUpto = combined.length - MAX_LEFTOVER_CHARS;
            safeEnqueue(combined.slice(0, flushUpto));
            leftover = combined.slice(flushUpto);
          } else leftover = combined;
        }
      }
      if (cleanedUp || isStreamClosed) return;
      isAppRendering = false;
      router.serverSsr?.setRenderFinished();
      if (serializationFinished) tryFinish();
      else {
        const timeoutMs = opts?.timeoutMs ?? DEFAULT_SERIALIZATION_TIMEOUT_MS;
        serializationTimeoutHandle = setTimeout(() => {
          if (!cleanedUp && !isStreamClosed) {
            console.error("Serialization timeout after app render finished");
            safeError(new Error("Serialization timeout after app render finished"));
            cleanup();
          }
        }, timeoutMs);
      }
    } catch (error) {
      if (cleanedUp) return;
      console.error("Error reading appStream:", error);
      isAppRendering = false;
      router.serverSsr?.setRenderFinished();
      safeError(error);
      cleanup();
    } finally {
      reader.releaseLock();
    }
  })().catch((error) => {
    if (cleanedUp) return;
    console.error("Error in stream transform:", error);
    safeError(error);
    cleanup();
  });
  return stream;
}
export {
  attachRouterServerSsrUtils,
  createRequestHandler,
  defineHandlerCallback,
  getNormalizedURL,
  getOrigin,
  transformPipeableStreamWithRouter,
  transformReadableStreamWithRouter,
  transformStreamWithRouter,
};
//# sourceMappingURL=@tanstack_router-core_ssr_server.js.map
