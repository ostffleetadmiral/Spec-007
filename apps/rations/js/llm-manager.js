/**
 * LLM Manager — manages the Web Worker lifecycle, request queuing,
 * and provides a clean async API for the agent execution loop.
 */

const LLMManager = (function () {
  let worker = null;
  let loaded = false;
  let loading = false;
  let currentModel = null;
  let currentDtype = null;
  let currentDevice = null;
  let loadPromise = null;
  let loadResolve = null;
  let loadReject = null;
  let loadStartedAt = 0;
  let loadMs = 0;
  let lastInferenceMs = 0;
  let requestQueue = [];
  let pendingRequests = new Map();
  let requestIdCounter = 0;
  let listeners = [];

  function init() {
    if (worker) return;
    // Keep the worker URL stable so the browser and service worker can
    // reuse the downloaded module instead of creating a fresh cache entry
    // on every page load.
    const workerUrl = new URL("llm-worker.js?v=10", import.meta.url);
    worker = new Worker(workerUrl, { type: "module" });

    worker.onmessage = function (e) {
      const { type, payload } = e.data;

      switch (type) {
        case "loading":
          notify("loading", payload);
          break;
        case "loaded":
          loaded = true;
          loading = false;
          currentModel = payload.model;
          currentDtype = payload.dtype || currentDtype;
          currentDevice = payload.device || currentDevice;
          loadMs = loadStartedAt ? performance.now() - loadStartedAt : 0;
          notify("loaded", { ...payload, loadMs, cached: !!payload.cached });
          if (loadResolve) loadResolve(getStatus());
          clearLoadPromise();
          processQueue();
          break;
        case "result":
          handleResult(payload);
          break;
        case "error":
          // A local-model error may be followed by an explicit fallback
          // load. The terminal `load_failed` event rejects initialization.
          if (loading && payload && payload.fatal) {
            loading = false;
            if (loadReject) loadReject(new Error(payload.message));
            clearLoadPromise();
          }
          handleError(payload);
          break;
        case "load_failed":
          loading = false;
          if (loadReject) loadReject(new Error(payload.message));
          clearLoadPromise();
          notify("error", payload);
          break;
        case "info":
          notify("info", payload);
          break;
        case "status":
          notify("status", { loaded, model: currentModel, loading });
          break;
      }
    };

    worker.onerror = function (err) {
      loading = false;
      const error = new Error("Worker error: " + (err.message || "unknown error"));
      if (loadReject) loadReject(error);
      clearLoadPromise();
      for (const [requestId, pending] of pendingRequests) {
        pending.reject(error);
        pendingRequests.delete(requestId);
      }
      notify("error", { message: error.message });
    };
  }

  function handleResult(payload) {
    const { requestId, text, inferenceMs } = payload;
    const pending = pendingRequests.get(requestId);
    if (pending) {
      pendingRequests.delete(requestId);
      lastInferenceMs = inferenceMs || (performance.now() - pending.startedAt);
      pending.resolve(text);
      notify("result", { requestId, inferenceMs: lastInferenceMs });
    }
    processQueue();
  }

  function handleError(payload) {
    const { requestId, message } = payload;
    if (requestId !== undefined) {
      const pending = pendingRequests.get(requestId);
      if (pending) {
        pendingRequests.delete(requestId);
        pending.reject(new Error(message));
      }
    }
    notify("error", { message, requestId });
    processQueue();
  }

  function clearLoadPromise() {
    loadPromise = null;
    loadResolve = null;
    loadReject = null;
    loadStartedAt = 0;
  }

  function processQueue() {
    if (requestQueue.length === 0 || !loaded) return;
    const next = requestQueue.shift();
    next();
  }

  function notify(type, payload) {
    listeners.forEach((fn) => fn(type, payload));
  }

  function load(modelId, dtype) {
    init();

    // Check for saved model preference in localStorage. The default is
    // resolved by the worker so a release can replace its bundled model
    // without changing the UI contract.
    const savedModel = localStorage.getItem("rations-llm-model");
    const savedDtype = localStorage.getItem("rations-llm-dtype");
    const finalModelId = modelId || savedModel || undefined;
    const finalDtype = dtype || savedDtype || "int8";
    const allowRemote = localStorage.getItem("rations-llm-allow-remote") === "1";

    if (loaded && (!modelId || modelId === currentModel) && finalDtype === currentDtype) {
      return Promise.resolve(getStatus());
    }
    if (loading && loadPromise) return loadPromise;

    loading = true;
    loadStartedAt = performance.now();
    loadPromise = new Promise((resolve, reject) => {
      loadResolve = resolve;
      loadReject = reject;
    });
    worker.postMessage({ type: "load", payload: { modelId: finalModelId, dtype: finalDtype, allowRemote } });
    return loadPromise;
  }

  function reset() {
    if (worker) worker.terminate();
    worker = null;
    loaded = false;
    loading = false;
    currentModel = null;
    currentDtype = null;
    currentDevice = null;
    requestQueue = [];
    for (const [requestId, pending] of pendingRequests) {
      pending.reject(new Error("LLM worker reset"));
      pendingRequests.delete(requestId);
    }
    if (loadReject) loadReject(new Error("LLM worker reset"));
    clearLoadPromise();
    init();
  }

  function generate(messages, options = {}) {
    return new Promise((resolve, reject) => {
      const requestId = ++requestIdCounter;

      const sendRequest = () => {
        pendingRequests.set(requestId, { resolve, reject, startedAt: performance.now() });
        worker.postMessage({
          type: "generate",
          payload: {
            messages,
            requestId,
            maxTokens: options.maxTokens || 128,
            temperature: options.temperature || 0.3,
            topP: options.topP || 0.9,
            doSample: options.doSample !== false,
          },
        });
      };

      if (!loaded) {
        requestQueue.push(sendRequest);
        if (!loading) load();
      } else {
        sendRequest();
      }
    });
  }

  function on(listener) {
    listeners.push(listener);
    return () => {
      listeners = listeners.filter((l) => l !== listener);
    };
  }

  function getStatus() {
    return {
      loaded,
      loading,
      model: currentModel,
      dtype: currentDtype,
      device: currentDevice,
      loadMs,
      lastInferenceMs,
      queueLength: requestQueue.length,
      pendingRequests: pendingRequests.size,
    };
  }

  return { init, load, ready: load, reset, generate, on, getStatus };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = LLMManager;
}

// Make available globally when loaded as a module script in browser
if (typeof window !== "undefined") {
  window.LLMManager = LLMManager;
}
