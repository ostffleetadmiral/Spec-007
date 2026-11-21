//! QR Code rendering module — renders QR matrix from WASM to canvas.
//! Provides canvas-based QR rendering and data URL generation for download.

(function (global) {
  'use strict';

  const QR_RENDER = {
    /**
     * Render a QR code matrix to a canvas element.
     * @param {Uint8Array} matrix - QR matrix data (size*size bytes)
     * @param {number} size - Matrix dimension (e.g. 21 for version 1)
     * @param {HTMLCanvasElement} canvas - Target canvas
     * @param {number} scale - Pixels per module (default 8)
     * @param {string} dark - Dark module color (default #000)
     * @param {string} light - Light module color (default #fff)
     */
    renderToCanvas(matrix, size, canvas, scale = 8, dark = '#000', light = '#fff') {
      const quiet = 4; // quiet zone
      const total = (size + quiet * 2) * scale;
      canvas.width = total;
      canvas.height = total;
      const ctx = canvas.getContext('2d');
      if (!ctx) return false;

      ctx.fillStyle = light;
      ctx.fillRect(0, 0, total, total);

      ctx.fillStyle = dark;
      for (let row = 0; row < size; row++) {
        for (let col = 0; col < size; col++) {
          if (matrix[row * size + col] === 1) {
            ctx.fillRect(
              (col + quiet) * scale,
              (row + quiet) * scale,
              scale,
              scale
            );
          }
        }
      }
      return true;
    },

    /**
     * Render QR code to a data URL (PNG).
     * @param {Uint8Array} matrix - QR matrix data
     * @param {number} size - Matrix dimension
     * @param {number} scale - Pixels per module
     * @returns {string|null} Data URL or null on failure
     */
    renderToDataURL(matrix, size, scale = 8) {
      const canvas = document.createElement('canvas');
      if (!this.renderToCanvas(matrix, size, canvas, scale)) return null;
      return canvas.toDataURL('image/png');
    },

    /**
     * Render QR code to an SVG string.
     * @param {Uint8Array} matrix - QR matrix data
     * @param {number} size - Matrix dimension
     * @param {number} scale - Pixels per module
     * @returns {string} SVG string
     */
    renderToSVG(matrix, size, scale = 8) {
      const quiet = 4;
      const total = (size + quiet * 2) * scale;
      let rects = '';
      for (let row = 0; row < size; row++) {
        for (let col = 0; col < size; col++) {
          if (matrix[row * size + col] === 1) {
            rects += `<rect x="${(col + quiet) * scale}" y="${(row + quiet) * scale}" width="${scale}" height="${scale}"/>`;
          }
        }
      }
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${total}" height="${total}" viewBox="0 0 ${total} ${total}">
<rect width="${total}" height="${total}" fill="#fff"/>
<g fill="#000">${rects}</g>
</svg>`;
    },

    /**
     * Generate QR code for a string using WASM and render to canvas.
     * @param {string} data - Data to encode
     * @param {number} eccLevel - Error correction level (0=L, 1=M, 2=Q, 3=H)
     * @param {HTMLCanvasElement} canvas - Target canvas
     * @param {number} scale - Pixels per module
     * @returns {number} QR version (1-10), or 0 on failure
     */
    generateAndRender(data, eccLevel, canvas, scale = 8) {
      if (!global.Rations || !global.Rations.exports) return 0;
      const exports = global.Rations.exports;

      // Encode string to bytes first
      const encoded = new TextEncoder().encode(data);
      const dataLen = encoded.length;

      // Write data to WASM memory
      const dataPtr = exports.rations_alloc(dataLen);
      if (!dataPtr) return 0;
      new Uint8Array(global.Rations.memory.buffer, dataPtr, dataLen).set(encoded);

      // Allocate output buffer (max version 10 = 57x57 = 3249 bytes)
      const maxMatrixSize = 57 * 57;
      const matrixPtr = exports.rations_alloc(maxMatrixSize);
      if (!matrixPtr) {
        exports.rations_free(dataPtr, dataLen);
        return 0;
      }
      const sizePtr = exports.rations_alloc(2);
      if (!sizePtr) {
        exports.rations_free(dataPtr, dataLen);
        exports.rations_free(matrixPtr, maxMatrixSize);
        return 0;
      }

      const version = exports.rations_qr_generate(
        dataPtr,
        dataLen,
        eccLevel,
        matrixPtr,
        sizePtr
      );

      if (version > 0) {
        const size = new Uint16Array(global.Rations.memory.buffer, sizePtr, 1)[0];
        const matrix = new Uint8Array(
          global.Rations.memory.buffer,
          matrixPtr,
          size * size
        );
        this.renderToCanvas(matrix, size, canvas, scale);
      }

      exports.rations_free(dataPtr, dataLen);
      exports.rations_free(matrixPtr, maxMatrixSize);
      exports.rations_free(sizePtr, 2);

      return version;
    },

    /**
     * Compress a URL and generate a QR code for the compressed result.
     * @param {string} url - URL to compress and encode
     * @param {string} alphabetName - 'qr' or 'ascii'
     * @param {number} eccLevel - Error correction level
     * @param {HTMLCanvasElement} canvas - Target canvas
     * @returns {number} QR version, or 0 on failure
     */
    compressAndQR(url, alphabetName, eccLevel, canvas) {
      if (!global.Rations || !global.Rations.exports) return 0;
      const exports = global.Rations.exports;

      const alphabet = (alphabetName === 'qr')
        ? '$*+-./:0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'
        : "!#$&'()*+,-./0123456789:;=?~@ABCDEFGHIJKLMNOPQRSTUVWXYZ[]_abcdefghijklmnopqrstuvwxyz";

      // Write URL to WASM
      const urlPtr = exports.rations_alloc(url.length);
      if (!urlPtr) return 0;
      new Uint8Array(global.Rations.memory.buffer, urlPtr, url.length).set(
        new TextEncoder().encode(url)
      );

      // Write alphabet to WASM
      const alphaPtr = exports.rations_alloc(alphabet.length);
      if (!alphaPtr) {
        exports.rations_free(urlPtr, url.length);
        return 0;
      }
      new Uint8Array(global.Rations.memory.buffer, alphaPtr, alphabet.length).set(
        new TextEncoder().encode(alphabet)
      );

      // Allocate output for compressed URL
      const maxOutLen = url.length + 256;
      const outPtr = exports.rations_alloc(maxOutLen);
      if (!outPtr) {
        exports.rations_free(urlPtr, url.length);
        exports.rations_free(alphaPtr, alphabet.length);
        return 0;
      }
      const lenPtr = exports.rations_alloc(4);
      if (!lenPtr) {
        exports.rations_free(urlPtr, url.length);
        exports.rations_free(alphaPtr, alphabet.length);
        exports.rations_free(outPtr, maxOutLen);
        return 0;
      }

      const ok = exports.rations_url_compress(
        urlPtr, url.length,
        alphaPtr, alphabet.length,
        outPtr, lenPtr
      );

      let version = 0;
      if (ok) {
        const compressedLen = new Uint32Array(global.Rations.memory.buffer, lenPtr, 1)[0];
        const compressedBytes = new Uint8Array(global.Rations.memory.buffer, outPtr, compressedLen);
        const compressedStr = new TextDecoder().decode(compressedBytes);
        version = this.generateAndRender(compressedStr, eccLevel, canvas);
      }

      exports.rations_free(urlPtr, url.length);
      exports.rations_free(alphaPtr, alphabet.length);
      exports.rations_free(outPtr, maxOutLen);
      exports.rations_free(lenPtr, 4);

      return version;
    },

    /**
     * Create an invite token and render its QR code.
     * @param {Uint8Array} networkId - 32-byte network ID
     * @param {string} endpoint - Peer endpoint URL
     * @param {Uint8Array} seed - 32-byte signing seed
     * @param {number} role - 0=admin, 1=moderator, 2=user
     * @param {number} expiry - Expiry timestamp (u64)
     * @param {HTMLCanvasElement} canvas - Target canvas
     * @returns {number} QR version, or 0 on failure
     */
    createInviteQR(networkId, endpoint, seed, role, expiry, canvas) {
      if (!global.Rations || !global.Rations.exports) return 0;
      const exports = global.Rations.exports;

      const endpointBytes = new TextEncoder().encode(endpoint);

      // Allocate WASM memory for inputs
      const netIdPtr = exports.rations_alloc(32);
      const epPtr = exports.rations_alloc(endpointBytes.length);
      const seedPtr = exports.rations_alloc(32);
      const outPtr = exports.rations_alloc(512); // token max size
      const lenPtr = exports.rations_alloc(4);

      if (!netIdPtr || !epPtr || !seedPtr || !outPtr || !lenPtr) return 0;

      new Uint8Array(global.Rations.memory.buffer, netIdPtr, 32).set(networkId);
      new Uint8Array(global.Rations.memory.buffer, epPtr, endpointBytes.length).set(endpointBytes);
      new Uint8Array(global.Rations.memory.buffer, seedPtr, 32).set(seed);

      const ok = exports.rations_invite_create(
        netIdPtr, epPtr, endpointBytes.length,
        seedPtr, 32,
        role, BigInt(expiry),
        outPtr, lenPtr
      );

      let version = 0;
      if (ok) {
        const tokenLen = new Uint32Array(global.Rations.memory.buffer, lenPtr, 1)[0];
        const tokenBytes = new Uint8Array(global.Rations.memory.buffer, outPtr, tokenLen);

        // Base64 encode the token for QR
        const b64OutPtr = exports.rations_alloc(1024);
        const b64LenPtr = exports.rations_alloc(4);
        if (b64OutPtr && b64LenPtr) {
          const b64Ok = exports.rations_base64_encode(tokenBytes.ptr || outPtr, tokenLen, b64OutPtr, b64LenPtr);
          if (b64Ok) {
            const b64Len = new Uint32Array(global.Rations.memory.buffer, b64LenPtr, 1)[0];
            const b64Str = new TextDecoder().decode(
              new Uint8Array(global.Rations.memory.buffer, b64OutPtr, b64Len)
            );
            version = this.generateAndRender(b64Str, 1, canvas); // ECC level M
          }
          if (b64OutPtr) exports.rations_free(b64OutPtr, 1024);
          if (b64LenPtr) exports.rations_free(b64LenPtr, 4);
        }
      }

      exports.rations_free(netIdPtr, 32);
      exports.rations_free(epPtr, endpointBytes.length);
      exports.rations_free(seedPtr, 32);
      exports.rations_free(outPtr, 512);
      exports.rations_free(lenPtr, 4);

      return version;
    }
  };

  global.QrRender = QR_RENDER;
})(typeof window !== 'undefined' ? window : globalThis);
