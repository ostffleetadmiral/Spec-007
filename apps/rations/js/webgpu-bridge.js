/**
 * WebGPU Bridge — GPU compute dispatch for the chain-runner hash path
 * (R8.1 / G4).
 *
 * Zig side (src/blockchain/webgpu_runner.zig) is authoritative for job
 * packing (SHA-256 padding, WGJ1 batch table) and digest verification.
 * This bridge owns the GPU device: batch SHA-256 compute (one invocation
 * per job, chained multi-block), Merkle level dispatch, and CPU fallback
 * whenever WebGPU or verification fails.
 *
 * WGJ1 wire format (u32 LE):
 *   [u32 job_count][u32 × count block_counts][64B padded blocks...]
 * Output: count × 32-byte digests.
 */

const WebGPUBridge = (function () {
  let device = null;
  let adapter = null;
  let pipeline = null;
  let initialized = false;
  let useWebGPU = false;

  async function init() {
    if (initialized) return useWebGPU;

    if (!navigator.gpu) {
      console.warn("[rations] WebGPU not available, using CPU fallback");
      initialized = true;
      useWebGPU = false;
      return false;
    }

    try {
      adapter = await navigator.gpu.requestAdapter();
      if (!adapter) {
        console.warn("[rations] No GPU adapter found, using CPU fallback");
        initialized = true;
        useWebGPU = false;
        return false;
      }

      device = await adapter.requestDevice();
      const shaderModule = device.createShaderModule({ code: SHA256_WGSL });
      pipeline = device.createComputePipeline({
        layout: "auto",
        compute: { module: shaderModule, entryPoint: "main" },
      });

      initialized = true;
      useWebGPU = true;
      console.log("[rations] WebGPU initialized for blockchain acceleration");
      return true;
    } catch (e) {
      console.warn("[rations] WebGPU init failed: " + e.message + ", using CPU fallback");
      initialized = true;
      useWebGPU = false;
      return false;
    }
  }

  /**
   * JS-side WGJ1 packer — same layout as
   * webgpu_runner.packSha256Batch. When the WASM bridge is loaded,
   * `packJobs` prefers `Rations.wgpuPackSha256` (single source of truth).
   */
  function padSha256(msg) {
    const paddedLen = Math.ceil((msg.length + 9) / 64) * 64;
    const padded = new Uint8Array(paddedLen);
    padded.set(msg);
    padded[msg.length] = 0x80;
    // 64-bit BIG-endian bit length (bugfix: was LE — broke digests)
    const dv = new DataView(padded.buffer);
    const bitLen = msg.length * 8;
    dv.setUint32(paddedLen - 8, Math.floor(bitLen / 0x100000000), false);
    dv.setUint32(paddedLen - 4, bitLen >>> 0, false);
    return padded;
  }

  function packJobsJS(msgs) {
    const blockCounts = msgs.map((m) => Math.ceil((m.length + 9) / 64));
    const total =
      4 + 4 * msgs.length + blockCounts.reduce((a, b) => a + b, 0) * 64;
    const out = new Uint8Array(total);
    const dv = new DataView(out.buffer);
    dv.setUint32(0, msgs.length, true);
    blockCounts.forEach((n, i) => dv.setUint32(4 + i * 4, n, true));
    let off = 4 + 4 * msgs.length;
    for (const m of msgs) {
      out.set(padSha256(m), off);
      off += blockCounts[msgs.indexOf(m)] * 64;
    }
    return out;
  }

  /**
   * Pack msgs via the WASM export when available (authoritative),
   * else JS-side pack (identical layout).
   */
  function packJobs(msgs) {
    if (typeof Rations !== "undefined" && Rations.wgpuPackSha256) {
      const packed = Rations.wgpuPackSha256(msgs);
      if (packed) return packed;
    }
    return packJobsJS(msgs);
  }

  /**
   * Dispatch a WGJ1-packed batch through the compute shader.
   * @param {Uint8Array} packed - WGJ1 buffer
   * @param {number} jobCount
   * @returns {Promise<Uint8Array[]>} digest per job (32 B each)
   */
  async function dispatchBatch(packed, jobCount) {
    if (!useWebGPU || !device || jobCount === 0) return null;

    const inputBuffer = device.createBuffer({
      size: (packed.length + 3) & ~3,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    const outputBuffer = device.createBuffer({
      size: jobCount * 32,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    });
    const stagingBuffer = device.createBuffer({
      size: jobCount * 32,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });

    device.queue.writeBuffer(inputBuffer, 0, packed);

    const bindGroup = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: inputBuffer } },
        { binding: 1, resource: { buffer: outputBuffer } },
      ],
    });

    const encoder = device.createCommandEncoder();
    const pass = encoder.beginComputePass();
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(jobCount);
    pass.end();
    encoder.copyBufferToBuffer(outputBuffer, 0, stagingBuffer, 0, jobCount * 32);
    device.queue.submit([encoder.finish()]);

    await stagingBuffer.mapAsync(GPUMapMode.READ);
    const flat = new Uint8Array(stagingBuffer.getMappedRange().slice(0));
    stagingBuffer.unmap();

    inputBuffer.destroy();
    outputBuffer.destroy();
    stagingBuffer.destroy();

    const digests = [];
    for (let i = 0; i < jobCount; i++) {
      digests.push(flat.slice(i * 32, i * 32 + 32));
    }
    return digests;
  }

  /**
   * Batch SHA-256 — the primary GPU path.
   * @param {Uint8Array[]} msgs
   * @returns {Promise<Uint8Array[]|null>} digests, or null → CPU fallback
   */
  async function dispatchSha256Batch(msgs) {
    if (!useWebGPU || !device || msgs.length === 0) return null;
    const packed = packJobs(msgs);
    const dv = new DataView(packed.buffer, packed.byteOffset);
    const count = dv.getUint32(0, true);
    if (count !== msgs.length) return null;
    return dispatchBatch(packed, count);
  }

  /**
   * Single-message SHA-256 via the batch path (arbitrary length —
   * the shader chains padded blocks internally).
   * @returns {Promise<Uint8Array|null>} 32-byte digest or null → CPU
   */
  async function dispatchSha256(data) {
    const out = await dispatchSha256Batch([data]);
    return out ? out[0] : null;
  }

  /**
   * Verify a GPU digest against the authoritative CPU path.
   * Prefers `rations_wgpu_verify_sha256`; otherwise compares against
   * a caller-supplied CPU digest. Returns true/false, or null when no
   * verifier is available (treat as unverified — caller may proceed
   * optimistically or CPU-fallback per policy).
   */
  function verifySha256(data, gpuDigest, cpuDigest) {
    if (typeof Rations !== "undefined" && Rations.wgpuVerifySha256) {
      return Rations.wgpuVerifySha256(data, gpuDigest);
    }
    if (cpuDigest) {
      return cpuDigest.length === gpuDigest.length &&
        cpuDigest.every((b, i) => b === gpuDigest[i]);
    }
    return null;
  }

  /**
   * Merkle root via batched level dispatches — pads odd levels by
   * duplicating the last leaf (same rule as chain.merkleRoot).
   * @param {Uint8Array[]} leaves - 32-byte leaf hashes
   * @returns {Promise<Uint8Array|null>} root, or null → CPU fallback
   */
  async function dispatchMerkleRoot(leaves) {
    if (!useWebGPU || !device || leaves.length === 0) return null;
    if (leaves.length <= 4) return null; // small trees stay on CPU

    let current = leaves;
    while (current.length > 1) {
      const msgs = [];
      for (let i = 0; i < current.length; i += 2) {
        const j = i + 1 < current.length ? i + 1 : i; // dup last on odd
        const pair = new Uint8Array(64);
        pair.set(current[i], 0);
        pair.set(current[j], 32);
        msgs.push(pair);
      }
      const digests = await dispatchSha256Batch(msgs);
      if (!digests) return null;
      current = digests;
    }
    return current[0];
  }

  function isAvailable() {
    return useWebGPU;
  }

  /**
   * Batch-chained SHA-256 WGSL.
   * Input: WGJ1 buffer as u32 array — [0]=count, [1..count]=block
   * counts, then 64-byte blocks. Invocation x handles job x: sums
   * counts[0..x) for its byte offset, then compresses its blocks in
   * order, feeding each digest state forward (chained multi-block).
   * Words are byte-swapped LE→BE (bugfix: was raw LE — broke digests).
   */
  const SHA256_WGSL = `
struct InputData {
  data: array<u32>,
};

struct OutputData {
  hash: array<u32>,
};

@group(0) @binding(0) var<storage, read> input: InputData;
@group(0) @binding(1) var<storage, read_write> output: OutputData;

const K: array<u32, 64> = array<u32, 64>(
  0x428a2f98u, 0x71374491u, 0xb5c0fbcfu, 0xe9b5dba5u,
  0x3956c25bu, 0x59f111f1u, 0x923f82a4u, 0xab1c5ed5u,
  0xd807aa98u, 0x12835b01u, 0x243185beu, 0x550c7dc3u,
  0x72be5d74u, 0x80deb1feu, 0x9bdc06a7u, 0xc19bf174u,
  0xe49b69c1u, 0xefbe4786u, 0x0fc19dc6u, 0x240ca1ccu,
  0x2de92c6fu, 0x4a7484aau, 0x5cb0a9dcu, 0x76f988dau,
  0x983e5152u, 0xa831c66du, 0xb00327c8u, 0xbf597fc7u,
  0xc6e00bf3u, 0xd5a79147u, 0x06ca6351u, 0x14292967u,
  0x27b70a85u, 0x2e1b2138u, 0x4d2c6dfcu, 0x53380d13u,
  0x650a7354u, 0x766a0abbu, 0x81c2c92eu, 0x92722c85u,
  0xa2bfe8a1u, 0xa81a664bu, 0xc24b8b70u, 0xc76c51a3u,
  0xd192e819u, 0xd6990624u, 0xf40e3585u, 0x106aa070u,
  0x19a4c116u, 0x1e376c08u, 0x2748774cu, 0x34b0bcb5u,
  0x391c0cb3u, 0x4ed8aa4au, 0x5b9cca4fu, 0x682e6ff3u,
  0x748f82eeu, 0x78a5636fu, 0x84c87814u, 0x8cc70208u,
  0x90befffau, 0xa4506cebu, 0xbef9a3f7u, 0xc67178f2u,
);

fn be32(x: u32) -> u32 {
  return ((x & 0x000000ffu) << 24u) | ((x & 0x0000ff00u) << 8u) |
         ((x >> 8u) & 0x0000ff00u) | ((x >> 24u) & 0x000000ffu);
}

fn rotr(x: u32, n: u32) -> u32 {
  return (x >> n) | (x << (32u - n));
}

fn ch(x: u32, y: u32, z: u32) -> u32 {
  return (x & y) ^ (~x & z);
}

fn maj(x: u32, y: u32, z: u32) -> u32 {
  return (x & y) ^ (x & z) ^ (y & z);
}

fn big_sigma0(x: u32) -> u32 {
  return rotr(x, 2u) ^ rotr(x, 13u) ^ rotr(x, 22u);
}

fn big_sigma1(x: u32) -> u32 {
  return rotr(x, 6u) ^ rotr(x, 11u) ^ rotr(x, 25u);
}

fn small_sigma0(x: u32) -> u32 {
  return rotr(x, 7u) ^ rotr(x, 18u) ^ (x >> 3u);
}

fn small_sigma1(x: u32) -> u32 {
  return rotr(x, 17u) ^ rotr(x, 19u) ^ (x >> 10u);
}

@compute @workgroup_size(1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let job = gid.x;
  let count = input.data[0];
  if (job >= count) { return; }

  // Byte offset of this job's first block: header = 4 + 4*count bytes,
  // then sum of prior block counts × 64 bytes. u32 index = bytes / 4.
  var blocks_before: u32 = 0u;
  for (var i = 0u; i < job; i++) {
    blocks_before += input.data[1u + i];
  }
  let nblocks = input.data[1u + job];
  var base = (4u + 4u * count) / 4u + blocks_before * 16u;

  var h: array<u32, 8>;
  h[0] = 0x6a09e667u; h[1] = 0xbb67ae85u;
  h[2] = 0x3c6ef372u; h[3] = 0xa54ff53au;
  h[4] = 0x510e527fu; h[5] = 0x9b05688cu;
  h[6] = 0x1f83d9abu; h[7] = 0x5be0cd19u;

  for (var blk = 0u; blk < nblocks; blk++) {
    var w: array<u32, 64>;
    for (var i = 0u; i < 16u; i++) {
      w[i] = be32(input.data[base + blk * 16u + i]);
    }
    for (var i = 16u; i < 64u; i++) {
      w[i] = small_sigma1(w[i - 2u]) + w[i - 7u] +
             small_sigma0(w[i - 15u]) + w[i - 16u];
    }

    var a = h[0]; var b = h[1]; var c = h[2]; var d = h[3];
    var e = h[4]; var f = h[5]; var g = h[6]; var hh = h[7];

    for (var i = 0u; i < 64u; i++) {
      let t1 = hh + big_sigma1(e) + ch(e, f, g) + K[i] + w[i];
      let t2 = big_sigma0(a) + maj(a, b, c);
      hh = g; g = f; f = e; e = d + t1;
      d = c; c = b; b = a; a = t1 + t2;
    }

    h[0] += a; h[1] += b; h[2] += c; h[3] += d;
    h[4] += e; h[5] += f; h[6] += g; h[7] += hh;
  }

  // Digest written as 8 big-endian u32s (byte-swapped back to LE words)
  for (var i = 0u; i < 8u; i++) {
    output.hash[job * 8u + i] = be32(h[i]);
  }
}
`;

  return {
    init, isAvailable,
    packJobs, packJobsJS, dispatchBatch,
    dispatchSha256, dispatchSha256Batch,
    verifySha256, dispatchMerkleRoot,
  };
})();

if (typeof window !== "undefined") {
  window.WebGPUBridge = WebGPUBridge;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = WebGPUBridge;
}
