/**
 * WebCodecs Bridge — encodes raw frame pixels to MP4 video and decodes back.
 *
 * Uses WebCodecs API (VideoEncoder/VideoDecoder) when available, with a
 * canvas-based fallback (RVID format) for browsers without WebCodecs support.
 *
 * Pipeline:
 *   Encode: binary data → rations.videoEncode() → raw pixels → VideoEncoder → MP4
 *   Decode: MP4 → VideoDecoder → raw pixels → rations.videoDecode() → binary data
 *
 * Per ADR-020: WebCodecs for video; canvas fallback if unavailable.
 */

const WebCodecsBridge = (function () {
  let rations = null;

  function init(rationsModule) {
    rations = rationsModule;
  }

  function isWebCodecsAvailable() {
    return typeof VideoEncoder !== "undefined" && typeof VideoDecoder !== "undefined";
  }

  // ============================================================
  // MP4 Muxer — minimal MP4 writer for H.264 chunks
  // ============================================================

  function writeU32BE(buf, offset, val) {
    buf[offset] = (val >>> 24) & 0xFF;
    buf[offset + 1] = (val >>> 16) & 0xFF;
    buf[offset + 2] = (val >>> 8) & 0xFF;
    buf[offset + 3] = val & 0xFF;
  }

  function box(type, content) {
    const size = 8 + content.length;
    const buf = new Uint8Array(size);
    writeU32BE(buf, 0, size);
    for (let i = 0; i < 4; i++) buf[4 + i] = type.charCodeAt(i);
    buf.set(content, 8);
    return buf;
  }

  function fullBox(type, version, flags, content) {
    const hdr = new Uint8Array(4);
    hdr[0] = version;
    hdr[1] = (flags >> 16) & 0xFF;
    hdr[2] = (flags >> 8) & 0xFF;
    hdr[3] = flags & 0xFF;
    const inner = new Uint8Array(hdr.length + content.length);
    inner.set(hdr, 0);
    inner.set(content, 4);
    return box(type, inner);
  }

  function w32(buf, off, val) { writeU32BE(buf, off, val); }

  /**
   * Build a minimal MP4 file from encoded H.264 chunks.
   * Structure: ftyp + mdat + moov
   */
  function buildMP4(chunkEntries, width, height, fps, avcConfig) {
    const fpsNum = fps || 30;
    const timescale = fpsNum * 1000;
    const duration = chunkEntries.length * 1000;

    // Collect all chunk data
    const chunkData = [];
    let totalChunkSize = 0;
    for (const entry of chunkEntries) {
      chunkData.push(entry.data);
      totalChunkSize += entry.data.length;
    }

    // ftyp
    const ftypContent = new Uint8Array(12);
    for (let i = 0; i < 4; i++) ftypContent[i] = "isom".charCodeAt(i);
    w32(ftypContent, 4, 0x200);
    for (let i = 0; i < 4; i++) ftypContent[8 + i] = "isom".charCodeAt(i);
    const ftyp = box("ftyp", ftypContent);

    // mdat
    const mdatContent = new Uint8Array(totalChunkSize);
    let off = 0;
    for (const cd of chunkData) { mdatContent.set(cd, off); off += cd.length; }
    const mdat = box("mdat", mdatContent);

    // mvhd
    const mvhdContent = new Uint8Array(96);
    w32(mvhdContent, 0, timescale);
    w32(mvhdContent, 4, duration);
    w32(mvhdContent, 8, 0x00010000); // rate 1.0
    w32(mvhdContent, 12, 0x01000000); // volume 1.0
    w32(mvhdContent, 20, 0x00010000); // matrix
    w32(mvhdContent, 32, 0x00010000);
    w32(mvhdContent, 44, 0x40000000);
    w32(mvhdContent, 80, 0x00010000); // next_track_id
    const mvhd = fullBox("mvhd", 0, 0, mvhdContent);

    // tkhd
    const tkhdContent = new Uint8Array(80);
    w32(tkhdContent, 0, 1); // flags = enabled
    w32(tkhdContent, 4, 1); // track_id
    w32(tkhdContent, 12, duration);
    w32(tkhdContent, 72, width << 16);
    w32(tkhdContent, 76, height << 16);
    const tkhd = fullBox("tkhd", 0, 3, tkhdContent);

    // mdhd
    const mdhdContent = new Uint8Array(20);
    w32(mdhdContent, 0, timescale);
    w32(mdhdContent, 4, duration);
    const mdhd = fullBox("mdhd", 0, 0, mdhdContent);

    // hdlr
    const hdlrContent = new Uint8Array(21);
    for (let i = 0; i < 4; i++) hdlrContent[i] = "vide".charCodeAt(i);
    hdlrContent[20] = 0;
    const hdlr = fullBox("hdlr", 0, 0, hdlrContent);

    // vmhd
    const vmhd = fullBox("vmhd", 0, 1, new Uint8Array(8));

    // dinf with empty dref
    const dref = fullBox("dref", 0, 0, new Uint8Array(4));
    const dinf = box("dinf", dref);

    // stsd with avc1 + avcC
    const avc1Inner = new Uint8Array(78);
    w32(avc1Inner, 6, 1); // data_ref_index
    w32(avc1Inner, 24, width << 16);
    w32(avc1Inner, 28, height << 16);
    w32(avc1Inner, 32, 0x00480000);
    w32(avc1Inner, 36, 0x00480000);
    w32(avc1Inner, 44, 1); // frame_count
    const cname = "RationsVideo";
    avc1Inner[45] = cname.length;
    for (let i = 0; i < cname.length; i++) avc1Inner[46 + i] = cname.charCodeAt(i);
    w32(avc1Inner, 76, 0x0018FFFF);

    // Build avc1 box content: visual sample entry + avcC box
    let avc1Content;
    if (avcConfig && avcConfig.description) {
      const avcC = box("avcC", new Uint8Array(avcConfig.description));
      avc1Content = new Uint8Array(avc1Inner.length + avcC.length);
      avc1Content.set(avc1Inner, 0);
      avc1Content.set(avcC, avc1Inner.length);
    } else {
      avc1Content = avc1Inner;
    }
    const avc1 = box("avc1", avc1Content);
    const stsdContent = new Uint8Array(4 + avc1.length);
    w32(stsdContent, 0, 1);
    stsdContent.set(avc1, 4);
    const stsd = fullBox("stsd", 0, 0, stsdContent);

    // stts
    const sttsContent = new Uint8Array(16);
    w32(sttsContent, 0, 1);
    w32(sttsContent, 4, chunkEntries.length);
    w32(sttsContent, 8, 1000);
    const stts = fullBox("stts", 0, 0, sttsContent);

    // stsc
    const stscContent = new Uint8Array(20);
    w32(stscContent, 0, 1);
    w32(stscContent, 4, 1);
    w32(stscContent, 8, 1);
    w32(stscContent, 12, 1);
    const stsc = fullBox("stsc", 0, 0, stscContent);

    // stsz
    const stszContent = new Uint8Array(8 + 4 * chunkData.length);
    w32(stszContent, 0, 0);
    w32(stszContent, 4, chunkData.length);
    for (let i = 0; i < chunkData.length; i++) {
      w32(stszContent, 8 + i * 4, chunkData[i].length);
    }
    const stsz = fullBox("stsz", 0, 0, stszContent);

    // stco
    const stcoContent = new Uint8Array(8 + 4 * chunkData.length);
    w32(stcoContent, 0, chunkData.length);
    let chunkOffset = ftyp.length + 8; // ftyp + mdat header
    for (let i = 0; i < chunkData.length; i++) {
      w32(stcoContent, 8 + i * 4, chunkOffset);
      chunkOffset += chunkData[i].length;
    }
    const stco = fullBox("stco", 0, 0, stcoContent);

    // stbl
    const stblParts = [stsd, stts, stsc, stsz, stco];
    let stblLen = 0;
    for (const p of stblParts) stblLen += p.length;
    const stblContent = new Uint8Array(stblLen);
    let sp = 0;
    for (const p of stblParts) { stblContent.set(p, sp); sp += p.length; }
    const stbl = box("stbl", stblContent);

    // minf
    const minfParts = [vmhd, dinf, stbl];
    let minfLen = 0;
    for (const p of minfParts) minfLen += p.length;
    const minfContent = new Uint8Array(minfLen);
    let mp = 0;
    for (const p of minfParts) { minfContent.set(p, mp); mp += p.length; }
    const minf = box("minf", minfContent);

    // mdia
    const mdiaParts = [mdhd, hdlr, minf];
    let mdiaLen = 0;
    for (const p of mdiaParts) mdiaLen += p.length;
    const mdiaContent = new Uint8Array(mdiaLen);
    let dp = 0;
    for (const p of mdiaParts) { mdiaContent.set(p, dp); dp += p.length; }
    const mdia = box("mdia", mdiaContent);

    // trak
    const trakContent = new Uint8Array(tkhd.length + mdia.length);
    trakContent.set(tkhd, 0);
    trakContent.set(mdia, tkhd.length);
    const trak = box("trak", trakContent);

    // moov
    const moovContent = new Uint8Array(mvhd.length + trak.length);
    moovContent.set(mvhd, 0);
    moovContent.set(trak, mvhd.length);
    const moov = box("moov", moovContent);

    // Final: ftyp + mdat + moov
    const total = ftyp.length + mdat.length + moov.length;
    const mp4 = new Uint8Array(total);
    let pos = 0;
    mp4.set(ftyp, pos); pos += ftyp.length;
    mp4.set(mdat, pos); pos += mdat.length;
    mp4.set(moov, pos); pos += moov.length;

    return mp4;
  }

  // ============================================================
  // Encode: binary data → raw pixels → WebCodecs → MP4
  // ============================================================

  async function encodeToVideo(data, width, height, fps) {
    width = width || 1920;
    height = height || 1080;
    fps = fps || 30;
    if (!rations) throw new Error("WebCodecsBridge not initialized");

    const encoded = rations.videoEncode(data, width, height);
    if (!encoded || !encoded.pixels || encoded.pixels.length === 0) {
      throw new Error("WASM videoEncode failed");
    }

    if (isWebCodecsAvailable() && width >= 16 && height >= 16) {
      try {
        return await encodeWithWebCodecs(encoded, width, height, fps);
      } catch (e) {
        console.warn("[webcodecs] encode failed, falling back to RVID:", e.message);
      }
    }
    return encodeRvid(encoded, width, height);
  }

  async function encodeWithWebCodecs(encoded, width, height, fps) {
    const chunks = [];
    let avcConfig = null;
    const frameDuration = Math.round(1000000 / fps);

    const encoder = new VideoEncoder({
      output: (chunk, metadata) => {
        if (metadata && metadata.decoderConfig) {
          avcConfig = metadata.decoderConfig;
        }
        const data = new Uint8Array(chunk.byteLength);
        chunk.copyTo(data);
        chunks.push({ data, type: chunk.type });
      },
      error: (e) => { console.error("[webcodecs] VideoEncoder error:", e); },
    });

    encoder.configure({
      codec: "avc1.42E01E",
      width: width,
      height: height,
      bitrate: 5000000,
      framerate: fps,
      avc: { format: "avc" },
    });

    const frameSize = width * height * 3;
    for (let i = 0; i < encoded.frameCount; i++) {
      const framePixels = encoded.pixels.subarray(i * frameSize, (i + 1) * frameSize);

      const rgba = new Uint8ClampedArray(width * height * 4);
      for (let j = 0; j < width * height; j++) {
        rgba[j * 4] = framePixels[j * 3];
        rgba[j * 4 + 1] = framePixels[j * 3 + 1];
        rgba[j * 4 + 2] = framePixels[j * 3 + 2];
        rgba[j * 4 + 3] = 255;
      }

      const frame = new VideoFrame(rgba, {
        format: "RGBA",
        codedWidth: width,
        codedHeight: height,
        timestamp: i * frameDuration,
        duration: frameDuration,
      });

      encoder.encode(frame, { keyFrame: i === 0 });
      frame.close();
    }

    await encoder.flush();
    encoder.close();

    // Build MP4 with AVC config embedded in avcC box inside stsd
    return buildMP4(chunks, width, height, fps, avcConfig);
  }

  /**
   * RVID fallback format: raw pixel data with a simple header.
   * Format: [magic:4][width:4][height:4][frame_count:4][orig_size:8][pixel_data]
   */
  function encodeRvid(encoded, width, height) {
    const headerSize = 24;
    const buf = new Uint8Array(headerSize + encoded.pixels.length);
    buf[0] = 0x52; buf[1] = 0x56; buf[2] = 0x49; buf[3] = 0x44; // "RVID"
    const view = new DataView(buf.buffer);
    view.setUint32(4, width);
    view.setUint32(8, height);
    view.setUint32(12, encoded.frameCount);
    view.setBigUint64(16, BigInt(encoded.originalSize));
    buf.set(encoded.pixels, headerSize);
    return buf;
  }

  // ============================================================
  // Decode: MP4 video → raw pixels → binary data
  // ============================================================

  async function decodeFromVideo(videoData) {
    if (!rations) throw new Error("WebCodecsBridge not initialized");

    // Check for RVID fallback format
    if (videoData.length >= 4 && videoData[0] === 0x52 && videoData[1] === 0x56 &&
        videoData[2] === 0x49 && videoData[3] === 0x44) {
      return decodeRvid(videoData);
    }

    if (isWebCodecsAvailable()) {
      return await decodeWithWebCodecs(videoData);
    } else {
      throw new Error("Cannot decode MP4 without WebCodecs — use RVID format");
    }
  }

  function decodeRvid(videoData) {
    const view = new DataView(videoData.buffer, videoData.byteOffset, videoData.byteLength);
    const width = view.getUint32(4);
    const height = view.getUint32(8);
    const frameCount = view.getUint32(12);
    const pixels = videoData.subarray(24);

    const decoded = rations.videoDecode(pixels, width, height, frameCount);
    if (!decoded) throw new Error("WASM videoDecode failed");
    return decoded;
  }

  async function decodeWithWebCodecs(videoData) {
    const chunkEntries = parseMP4Chunks(videoData);
    if (chunkEntries.length === 0) throw new Error("No video chunks found in MP4");

    const dims = parseMP4Dimensions(videoData);
    const width = dims.width;
    const height = dims.height;

    // Extract AVC decoder config (avcC box) from stsd
    const avcConfig = extractAvcConfig(videoData);

    const decodedFrames = [];

    const decoder = new VideoDecoder({
      output: (frame) => {
        const rgba = new Uint8Array(width * height * 4);
        frame.copyTo(rgba, { format: "RGBA" });
        const rgb = new Uint8Array(width * height * 3);
        for (let i = 0; i < width * height; i++) {
          rgb[i * 3] = rgba[i * 4];
          rgb[i * 3 + 1] = rgba[i * 4 + 1];
          rgb[i * 3 + 2] = rgba[i * 4 + 2];
        }
        decodedFrames.push(rgb);
        frame.close();
      },
      error: (e) => { console.error("[webcodecs] VideoDecoder error:", e); },
    });

    const config = {
      codec: "avc1.42E01E",
      codedWidth: width,
      codedHeight: height,
    };
    if (avcConfig) {
      config.description = avcConfig;
    }
    decoder.configure(config);

    for (let i = 0; i < chunkEntries.length; i++) {
      const chunk = new EncodedVideoChunk({
        type: chunkEntries[i].type || (i === 0 ? "key" : "delta"),
        timestamp: i * Math.round(1000000 / 30),
        data: chunkEntries[i].data,
      });
      decoder.decode(chunk);
    }

    await decoder.flush();
    decoder.close();

    const frameSize = width * height * 3;
    const allPixels = new Uint8Array(decodedFrames.length * frameSize);
    for (let i = 0; i < decodedFrames.length; i++) {
      allPixels.set(decodedFrames[i], i * frameSize);
    }

    const decoded = rations.videoDecode(allPixels, width, height, decodedFrames.length);
    if (!decoded) throw new Error("WASM videoDecode failed");
    return decoded;
  }

  // ============================================================
  // MP4 Parsing — extract H.264 chunks and dimensions
  // ============================================================

  function parseMP4Boxes(data, start, end) {
    const boxes = [];
    let pos = start;
    while (pos + 8 <= end) {
      const size = (data[pos] << 24) | (data[pos + 1] << 16) | (data[pos + 2] << 8) | data[pos + 3];
      const type = String.fromCharCode(data[pos + 4], data[pos + 5], data[pos + 6], data[pos + 7]);
      if (size < 8 || pos + size > end) break;
      boxes.push({ type, offset: pos, size, dataOffset: pos + 8, dataSize: size - 8 });
      pos += size;
    }
    return boxes;
  }

  function findBox(boxes, type) {
    return boxes.find(b => b.type === type);
  }

  function parseMP4Chunks(videoData) {
    const boxes = parseMP4Boxes(videoData, 0, videoData.length);
    const mdat = findBox(boxes, "mdat");
    const moov = findBox(boxes, "moov");
    if (!mdat || !moov) return [];

    const chunkSizes = extractChunkSizes(videoData, moov);
    const entries = [];
    let offset = mdat.dataOffset;
    for (let i = 0; i < chunkSizes.length; i++) {
      entries.push({
        data: videoData.subarray(offset, offset + chunkSizes[i]),
        type: i === 0 ? "key" : "delta",
      });
      offset += chunkSizes[i];
    }
    return entries;
  }

  function extractAvcConfig(videoData) {
    const boxes = parseMP4Boxes(videoData, 0, videoData.length);
    const moov = findBox(boxes, "moov");
    if (!moov) return null;

    const moovBoxes = parseMP4Boxes(videoData, moov.dataOffset, moov.offset + moov.size);
    const trak = findBox(moovBoxes, "trak");
    if (!trak) return null;

    const trakBoxes = parseMP4Boxes(videoData, trak.dataOffset, trak.offset + trak.size);
    const mdia = findBox(trakBoxes, "mdia");
    if (!mdia) return null;

    const mdiaBoxes = parseMP4Boxes(videoData, mdia.dataOffset, mdia.offset + mdia.size);
    const minf = findBox(mdiaBoxes, "minf");
    if (!minf) return null;

    const minfBoxes = parseMP4Boxes(videoData, minf.dataOffset, minf.offset + minf.size);
    const stbl = findBox(minfBoxes, "stbl");
    if (!stbl) return null;

    const stblBoxes = parseMP4Boxes(videoData, stbl.dataOffset, stbl.offset + stbl.size);
    const stsd = findBox(stblBoxes, "stsd");
    if (!stsd) return null;

    // stsd is a full box: skip version/flags(4) + entry_count(4) = 8 bytes
    const stsdBase = stsd.dataOffset + 8;
    // First entry is avc1 box
    if (stsdBase + 8 > stsd.offset + stsd.size) return null;
    const avc1Size = (videoData[stsdBase] << 24) | (videoData[stsdBase + 1] << 16) |
                     (videoData[stsdBase + 2] << 8) | videoData[stsdBase + 3];
    // avc1 data starts at stsdBase + 8, visual sample entry is 78 bytes
    // avcC box follows at stsdBase + 8 + 78
    const avcCOffset = stsdBase + 8 + 78;
    if (avcCOffset + 8 > stsd.offset + stsd.size) return null;

    const avcCType = String.fromCharCode(
      videoData[avcCOffset + 4], videoData[avcCOffset + 5],
      videoData[avcCOffset + 6], videoData[avcCOffset + 7]
    );
    if (avcCType !== "avcC") return null;

    const avcCSize = (videoData[avcCOffset] << 24) | (videoData[avcCOffset + 1] << 16) |
                     (videoData[avcCOffset + 2] << 8) | videoData[avcCOffset + 3];
    // Return the avcC box content (after box header)
    return videoData.subarray(avcCOffset + 8, avcCOffset + avcCSize);
  }

  function extractChunkSizes(data, moovBox) {
    const moovBoxes = parseMP4Boxes(data, moovBox.dataOffset, moovBox.offset + moovBox.size);
    const trak = findBox(moovBoxes, "trak");
    if (!trak) return [];

    const trakBoxes = parseMP4Boxes(data, trak.dataOffset, trak.offset + trak.size);
    const mdia = findBox(trakBoxes, "mdia");
    if (!mdia) return [];

    const mdiaBoxes = parseMP4Boxes(data, mdia.dataOffset, mdia.offset + mdia.size);
    const minf = findBox(mdiaBoxes, "minf");
    if (!minf) return [];

    const minfBoxes = parseMP4Boxes(data, minf.dataOffset, minf.offset + minf.size);
    const stbl = findBox(minfBoxes, "stbl");
    if (!stbl) return [];

    const stblBoxes = parseMP4Boxes(data, stbl.dataOffset, stbl.offset + stbl.size);
    const stsz = findBox(stblBoxes, "stsz");
    if (!stsz) return [];

    // stsz is a full box: dataOffset → version(1)+flags(3), then sample_size(4), sample_count(4), entries
    const base = stsz.dataOffset + 4; // skip version/flags
    const count = (data[base + 4] << 24) | (data[base + 5] << 16) |
                  (data[base + 6] << 8) | data[base + 7];
    const sizes = [];
    for (let i = 0; i < count; i++) {
      const off = base + 8 + i * 4;
      sizes.push((data[off] << 24) | (data[off + 1] << 16) | (data[off + 2] << 8) | data[off + 3]);
    }
    return sizes;
  }

  function parseMP4Dimensions(videoData) {
    const boxes = parseMP4Boxes(videoData, 0, videoData.length);
    const moov = findBox(boxes, "moov");
    if (!moov) return { width: 1920, height: 1080 };

    const moovBoxes = parseMP4Boxes(videoData, moov.dataOffset, moov.offset + moov.size);
    const trak = findBox(moovBoxes, "trak");
    if (!trak) return { width: 1920, height: 1080 };

    const trakBoxes = parseMP4Boxes(videoData, trak.dataOffset, trak.offset + trak.size);
    const tkhd = findBox(trakBoxes, "tkhd");
    if (!tkhd) return { width: 1920, height: 1080 };

    // tkhd is a full box: dataOffset → version(1)+flags(3), then content
    // width at content offset 72, height at 76 (16.16 fixed point)
    const base = tkhd.dataOffset + 4;
    const width = (videoData[base + 72] << 8) | videoData[base + 73];
    const height = (videoData[base + 76] << 8) | videoData[base + 77];
    return { width, height };
  }

  // ============================================================
  // Public API
  // ============================================================

  return {
    init,
    isWebCodecsAvailable,
    encodeToVideo,
    decodeFromVideo,
  };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = WebCodecsBridge;
}
