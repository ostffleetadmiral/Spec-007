//! QR Code scanner module — pumps getUserMedia frames through the WASM
//! decoder (rations_qr_decode). Pairs with qr-render.js for full-duplex
//! physical-channel invites: render out, scan in.

(function (global) {
  'use strict';

  const MAX_PAYLOAD = 4096; // QR v10 byte-mode capacity bound
  const ERR_NAMES = {
    1: 'TooSmall',
    2: 'NoFinderPatterns',
    3: 'BadFormatInfo',
    4: 'UnsupportedVersion',
    5: 'RsUncorrectable',
    6: 'BadMode',
    7: 'DataTruncated',
    8: 'OutputBufferTooSmall',
    0x7f: 'OutOfMemory',
  };

  function errName(code) {
    return ERR_NAMES[code & 0x7f] || 'UnknownError';
  }

  const QR_SCANNER = {
    /**
     * Decode a QR code from a grayscale frame buffer.
     * @param {WebAssembly.Instance} wasm - Instantiated rations.wasm
     * @param {Uint8Array} gray - width*height grayscale pixels
     * @param {number} width
     * @param {number} height
     * @returns {{data: Uint8Array, version: number}|{error: string}}
     */
    decodeGray(wasm, gray, width, height) {
      const ex = wasm.exports;

      const inPtr = ex.rations_alloc(gray.length);
      const outPtr = ex.rations_alloc(MAX_PAYLOAD);
      const lenPtr = ex.rations_alloc(4);
      const verPtr = ex.rations_alloc(1);
      if (!inPtr || !outPtr || !lenPtr || !verPtr) {
        return { error: 'OutOfMemory' };
      }
      try {
        // Views must be (re)created after every call that can allocate —
        // rations_alloc and rations_qr_decode may grow memory, detaching
        // any earlier buffer view.
        new Uint8Array(ex.memory.buffer).set(gray, inPtr);
        const status = ex.rations_qr_decode(
          inPtr, width, height, outPtr, MAX_PAYLOAD, lenPtr, verPtr
        );
        if (status !== 1) return { error: errName(status) };
        const buf = ex.memory.buffer; // post-call: may be a fresh buffer
        // usize is u32 on wasm32 — read 4 bytes only
        const len = new DataView(buf).getUint32(lenPtr, true);
        return {
          data: new Uint8Array(buf).slice(outPtr, outPtr + len),
          version: new Uint8Array(buf)[verPtr],
        };
      } finally {
        ex.rations_free(inPtr, gray.length);
        ex.rations_free(outPtr, MAX_PAYLOAD);
        ex.rations_free(lenPtr, 4);
        ex.rations_free(verPtr, 1);
      }
    },

    /**
     * Decode a QR code from a canvas or ImageData source.
     * @param {WebAssembly.Instance} wasm
     * @param {CanvasImageSource|ImageData} source
     * @returns {{data: Uint8Array, version: number}|{error: string}}
     */
    decodeSource(wasm, source) {
      const img = QR_SCANNER._toGray(source);
      if (!img) return { error: 'NoSource' };
      return QR_SCANNER.decodeGray(wasm, img.pixels, img.width, img.height);
    },

    /**
     * Start a camera scan loop. Calls onResult({data,version}) on the first
     * successful decode (and stops), or keeps scanning otherwise.
     * @param {WebAssembly.Instance} wasm
     * @param {HTMLVideoElement} video - target video element (created if null)
     * @param {object} opts - {onResult, onError, intervalMs, once, constraints}
     * @returns {Promise<{stop: () => void, video: HTMLVideoElement}>}
     */
    async startCamera(wasm, video, opts = {}) {
      const intervalMs = opts.intervalMs || 250;
      const once = opts.once !== false;
      const constraints = opts.constraints || {
        video: { facingMode: 'environment' },
        audio: false,
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      const vid = video || document.createElement('video');
      vid.srcObject = stream;
      vid.playsInline = true;
      await vid.play();

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      let timer = null;
      let stopped = false;

      const stop = () => {
        stopped = true;
        if (timer) clearInterval(timer);
        stream.getTracks().forEach((t) => t.stop());
        vid.srcObject = null;
      };

      const tick = () => {
        if (stopped || !vid.videoWidth) return;
        canvas.width = vid.videoWidth;
        canvas.height = vid.videoHeight;
        ctx.drawImage(vid, 0, 0);
        const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const gray = QR_SCANNER._rgbaToGray(frame.data, frame.width, frame.height);
        const res = QR_SCANNER.decodeGray(wasm, gray, frame.width, frame.height);
        if (res.data) {
          if (once) stop();
          if (opts.onResult) opts.onResult(res);
        } else if (opts.onFrame && res.error !== 'NoFinderPatterns') {
          opts.onFrame(res);
        }
      };
      timer = setInterval(tick, intervalMs);
      return { stop, video: vid };
    },

    /** RGBA → 8-bit grayscale (integer luma approximation). */
    _rgbaToGray(rgba, width, height) {
      const gray = new Uint8Array(width * height);
      for (let i = 0, j = 0; j < gray.length; i += 4, j++) {
        // 0.299/0.587/0.114 ≈ (77,150,29)/256 — integer only
        gray[j] = (77 * rgba[i] + 150 * rgba[i + 1] + 29 * rgba[i + 2]) >> 8;
      }
      return gray;
    },

    /** Any canvas-source → gray via an offscreen canvas. */
    _toGray(source) {
      if (source instanceof ImageData) {
        return {
          pixels: QR_SCANNER._rgbaToGray(source.data, source.width, source.height),
          width: source.width,
          height: source.height,
        };
      }
      const w = source.videoWidth || source.naturalWidth || source.width;
      const h = source.videoHeight || source.naturalHeight || source.height;
      if (!w || !h) return null;
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(source, 0, 0);
      const frame = ctx.getImageData(0, 0, w, h);
      return {
        pixels: QR_SCANNER._rgbaToGray(frame.data, w, h),
        width: w,
        height: h,
      };
    },
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = QR_SCANNER;
  } else {
    global.QR_SCANNER = QR_SCANNER;
  }
})(typeof window !== 'undefined' ? window : globalThis);
