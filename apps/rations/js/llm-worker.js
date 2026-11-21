/**
 * LLM Worker — runs in a Web Worker, loads Transformers.js + ONNX Runtime WebGPU,
 * and handles inference requests. Supports both local (air-gapped) and remote models.
 */

import { pipeline, env } from "./vendor/transformers.js";

// Configure Transformers.js for local/offline use
env.allowLocalModels = true;
env.allowRemoteModels = false; // Air-gapped default; remote is opt-in per load request
env.useBrowserCache = true;
env.localModelPath = "/";

// Set WASM paths to local vendor directory (absolute from server root)
env.backends.onnx.wasm.wasmPaths = "/js/vendor/";

// Default model: local Qwen1.5-0.5B-Chat (air-gapped)
const DEFAULT_MODEL_ID = "models/Xenova_Qwen1.5-0.5B-Chat";
const DEFAULT_DTYPE = "int8";

// Fallback to remote if local model not available
const REMOTE_FALLBACK_ID = "Xenova/Qwen1.5-0.5B-Chat";
const REMOTE_FALLBACK_DTYPE = "int8";

let generator = null;
let currentModel = null;
let currentDtype = null;
let currentDevice = null;
let loading = false;
let loadPromise = null;
let generationPromise = Promise.resolve();

self.onmessage = async function (e) {
  const { type, payload } = e.data;

  switch (type) {
    case "load":
      await loadModel(payload?.modelId || DEFAULT_MODEL_ID, payload?.dtype || DEFAULT_DTYPE, !!payload?.allowRemote);
      break;
    case "generate":
      // Serialize inference requests; ONNX sessions are not safely
      // re-entrant and concurrent calls otherwise multiply latency/memory.
      generationPromise = generationPromise.then(() => generate(payload));
      break;
    case "status":
      self.postMessage({ type: "status", payload: { loaded: generator !== null, model: currentModel, loading } });
      break;
  }
};

async function loadModel(modelId, dtype, allowRemote) {
  if (generator && currentModel === modelId && currentDtype === dtype) {
    self.postMessage({
      type: "loaded",
      payload: { model: modelId, dtype, device: currentDevice, cached: true },
    });
    return;
  }
  if (loading && loadPromise) return loadPromise;
  loading = true;
  env.allowRemoteModels = !!allowRemote;
  self.postMessage({ type: "loading", payload: { model: modelId, dtype, allowRemote: !!allowRemote } });
  loadPromise = loadModelInternal(modelId, dtype, allowRemote);
  try {
    await loadPromise;
  } finally {
    loading = false;
    loadPromise = null;
  }
}

async function loadModelInternal(modelId, dtype, allowRemote) {

  // Determine device: prefer webgpu, fallback to wasm
  let device = "wasm";
  if (typeof navigator !== "undefined" && navigator.gpu) {
    try {
      const adapter = await navigator.gpu.requestAdapter();
      if (adapter) {
        device = "webgpu";
      } else {
        self.postMessage({ type: "info", payload: { message: "WebGPU adapter unavailable, using WASM backend" } });
      }
    } catch (e) {
      self.postMessage({ type: "info", payload: { message: "WebGPU not available, using WASM backend" } });
    }
  } else {
    self.postMessage({ type: "info", payload: { message: "WebGPU not available, using WASM backend" } });
  }

  try {
    generator = await pipeline("text-generation", modelId, {
      device: device,
      dtype: dtype,
    });
    currentModel = modelId;
    currentDtype = dtype;
    currentDevice = device;
    self.postMessage({ type: "loaded", payload: { model: modelId, dtype, device, cached: false } });
  } catch (err) {
    self.postMessage({ type: "error", payload: { message: "Failed to load " + modelId + ": " + err.message } });

    // If local model failed, try remote fallback
    if (allowRemote && modelId.startsWith("models/") && modelId !== REMOTE_FALLBACK_ID) {
      self.postMessage({ type: "loading", payload: { model: REMOTE_FALLBACK_ID, fallback: true } });
      try {
        generator = await pipeline("text-generation", REMOTE_FALLBACK_ID, {
          device: device,
          dtype: REMOTE_FALLBACK_DTYPE,
        });
        currentModel = REMOTE_FALLBACK_ID;
        currentDtype = REMOTE_FALLBACK_DTYPE;
        currentDevice = device;
        self.postMessage({
          type: "loaded",
          payload: { model: REMOTE_FALLBACK_ID, dtype: REMOTE_FALLBACK_DTYPE, device, fallback: true },
        });
      } catch (err2) {
        self.postMessage({
          type: "load_failed",
          payload: { message: "Remote fallback also failed: " + err2.message },
        });
      }
    } else {
      self.postMessage({ type: "load_failed", payload: { message: "Failed to load " + modelId } });
    }
  }
}

function trimStopText(text) {
  if (typeof text !== "string") return "";
  const stops = currentModel && /Llama|llama/i.test(currentModel)
    ? ["<|eot_id|>", "<|end_of_text|>", "<|start_header_id|>"]
    : ["<|im_end|>", "<|im_start|>", "<|endoftext|>"];
  let end = text.length;
  for (const stop of stops) {
    const at = text.indexOf(stop);
    if (at >= 0 && at < end) end = at;
  }
  return text.slice(0, end).trim();
}

async function generate(payload) {
  const startedAt = performance.now();
  if (!generator) {
    self.postMessage({
      type: "error",
      payload: { message: "Model not loaded", requestId: payload.requestId },
    });
    return;
  }

  try {
    const messages = payload.messages || [];
    const options = {
      max_new_tokens: payload.maxTokens || 128,
      temperature: payload.temperature || 0.3,
      top_p: payload.topP || 0.9,
      do_sample: payload.doSample !== false,
      repetition_penalty: 1.1,
      repetition_present_penalty: 1.1,
    };

    const output = await generator(messages, options);

    // Extract generated text — handle different output formats
    let text;
    if (Array.isArray(output) && output.length > 0) {
      const last = output[0];
      if (Array.isArray(last) && last.length > 0) {
        text = last[last.length - 1]?.content || last[last.length - 1]?.generated_text || "";
      } else {
        text = last.generated_text || last.content || "";
      }
      // If it's a chat-format output, extract just the assistant's response
      if (Array.isArray(text)) {
        const assistantMsg = text.find((m) => m.role === "assistant");
        text = assistantMsg ? assistantMsg.content : (typeof text === "string" ? text : JSON.stringify(text));
      }
    } else {
      text = output.generated_text || output.content || "";
    }

    text = trimStopText(text);
    self.postMessage({
      type: "result",
      payload: {
        text,
        requestId: payload.requestId,
        inferenceMs: performance.now() - startedAt,
      },
    });
  } catch (err) {
    self.postMessage({
      type: "error",
      payload: {
        message: "Generation failed: " + err.message,
        requestId: payload.requestId,
      },
    });
  }
}
