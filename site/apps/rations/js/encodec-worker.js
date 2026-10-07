/**
 * EnCodec Worker — runs the int8 ONNX EnCodec decoder in a Web Worker on the
 * vendored onnxruntime-web bundle (air-gapped, no CDN).
 *
 * Wire protocol (mirrors src/acoustic/encodec_sidecar.zig):
 *   request  "EC01" | n_q u16 LE | T u32 LE | codes u32 LE × (n_q·T)
 *            — codes already in ONNX layout [n_q, T] (codebook-major).
 *   response "ECP1" | sample_rate u32 LE | n_samples u32 LE | pcm i16 LE × N
 *
 * Messages:
 *   { type: "init",   modelUrl, wasmPath? }            → load the decoder session
 *   { type: "decode", requestId, request: ArrayBuffer } → { type: "decoded", requestId, response }
 *   { type: "status" }                                  → { type: "status", loaded, model }
 */

import * as ort from "./vendor/ort.webgpu.bundle.min.mjs";

const DEFAULT_MODEL_URL = "models/encodec_decoder_24khz_int8.onnx";
const CODEBOOK_SIZE = 1024;

let session = null;
let modelUrl = null;
let loading = false;

self.onmessage = async function (e) {
  const { type } = e.data;
  try {
    switch (type) {
      case "init":
        await initSession(e.data.modelUrl || DEFAULT_MODEL_URL, e.data.wasmPath);
        self.postMessage({ type: "ready", model: modelUrl });
        break;
      case "decode":
        await decode(e.data.requestId, e.data.request);
        break;
      case "status":
        self.postMessage({ type: "status", loaded: session !== null, model: modelUrl, loading });
        break;
    }
  } catch (err) {
    self.postMessage({ type: "error", requestId: e.data.requestId, message: String(err && err.message ? err.message : err) });
  }
};

async function initSession(url, wasmPath) {
  if (session && modelUrl === url) return;
  if (loading) throw new Error("session load already in progress");
  loading = true;
  try {
    if (wasmPath && ort.env && ort.env.wasm) ort.env.wasm.wasmPaths = wasmPath;

    // Prefer WebGPU (int8-capable EP), fall back to WASM SIMD.
    const providers = [];
    if (typeof navigator !== "undefined" && navigator.gpu) {
      const adapter = await navigator.gpu.requestAdapter().catch(() => null);
      if (adapter) providers.push("webgpu");
    }
    providers.push("wasm");

    session = await ort.InferenceSession.create(url, { executionProviders: providers });
    modelUrl = url;
  } finally {
    loading = false;
  }
}

/** Parse an EC01 request blob. Returns { n_q, t, codes: Uint32Array }. */
function parseRequest(buf) {
  const view = new DataView(buf);
  if (view.byteLength < 10) throw new Error("EC01 request truncated");
  const magic = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
  if (magic !== "EC01") throw new Error(`bad request magic "${magic}"`);
  const n_q = view.getUint16(4, true);
  const t = view.getUint32(6, true);
  const count = n_q * t;
  if (view.byteLength !== 10 + count * 4) throw new Error("EC01 request length mismatch");
  if (n_q === 0) throw new Error("n_q must be > 0");
  const codes = new Uint32Array(count);
  for (let i = 0; i < count; i++) {
    codes[i] = view.getUint32(10 + i * 4, true);
    if (codes[i] >= CODEBOOK_SIZE) throw new Error(`token ${codes[i]} out of codebook range`);
  }
  return { n_q, t, codes };
}

/** Serialize an ECP1 response blob. */
function packResponse(sampleRate, pcm) {
  const buf = new ArrayBuffer(12 + pcm.length * 2);
  const view = new DataView(buf);
  view.setUint8(0, 0x45); // 'E'
  view.setUint8(1, 0x43); // 'C'
  view.setUint8(2, 0x50); // 'P'
  view.setUint8(3, 0x31); // '1'
  view.setUint32(4, sampleRate, true);
  view.setUint32(8, pcm.length, true);
  for (let i = 0; i < pcm.length; i++) view.setInt16(12 + i * 2, pcm[i], true);
  return buf;
}

/** Convert the decoder's output tensor to i16 PCM. */
function tensorToPcm(tensor) {
  const data = tensor.data;
  const pcm = new Int16Array(data.length);
  if (tensor.type === "int8") {
    // Quantized audio path: int8 amplitude −128..127 → i16.
    for (let i = 0; i < data.length; i++) pcm[i] = data[i] << 8;
  } else {
    // float32/float16 path: amplitude −1..1 → i16 with clipping.
    for (let i = 0; i < data.length; i++) {
      const s = Math.round(data[i] * 32767);
      pcm[i] = s > 32767 ? 32767 : s < -32768 ? -32768 : s;
    }
  }
  return pcm;
}

async function decode(requestId, request) {
  if (!session) throw new Error("decoder session not initialized — send { type: 'init' } first");
  const { n_q, t, codes } = parseRequest(request);
  if (t === 0) {
    self.postMessage({ type: "decoded", requestId, response: packResponse(24000, new Int16Array(0)) });
    return;
  }

  const inputName = session.inputNames[0];
  const inputMeta = session.inputMetadata ? session.inputMetadata[inputName] : null;
  const dtype = inputMeta && inputMeta.type === "int64" ? "int64" : "int32";
  const codeData =
    dtype === "int64" ? BigInt64Array.from(codes, (c) => BigInt(c)) : Int32Array.from(codes);
  const tensor = new ort.Tensor(dtype, codeData, [1, n_q, t]);

  const outputs = await session.run({ [inputName]: tensor });
  const audio = outputs[session.outputNames[0]];
  const pcm = tensorToPcm(audio);
  self.postMessage({ type: "decoded", requestId, response: packResponse(24000, pcm) }, [
    /* transfer handled by structured clone */
  ]);
}
