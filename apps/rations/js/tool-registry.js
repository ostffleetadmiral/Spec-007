/**
 * Agent tool registry — one source of truth for prompt help, validation,
 * and risk metadata. Dispatch remains in agent.js so the registry stays
 * declarative and easy to audit.
 */
const AgentTools = (function () {
  const TOOLS = [
    ["hash", "SHA-256 hash text", ["text"]],
    ["sign", "Ed25519 sign a message with the active identity", ["message"]],
    ["verify", "Verify an Ed25519 signature", ["message", "signature", "publicKey"]],
    ["encrypt", "Encrypt text with PBKDF2 and AES-256-GCM", ["plaintext", "password"]],
    ["decrypt", "Decrypt an AES-256-GCM result", ["ciphertext", "password", "salt", "nonce", "tag"]],
    ["shamir_split", "Split a secret into recovery shards", ["secret", "threshold", "total"]],
    ["shamir_reconstruct", "Recover a secret from shards", ["shards", "shardLen"]],
    ["stega_embed", "Embed bytes in a PNG", ["imageData", "payloadData", "password", "filename"]],
    ["stega_extract", "Extract bytes from a steganographic PNG", ["imageData", "password"]],
    ["stega_capacity", "Measure PNG steganography capacity", ["imageData", "bitDepth"]],
    ["video_encode", "Encode bytes into recovery video frames", ["data", "width", "height"]],
    ["video_decode", "Decode recovery video frames", ["videoData", "width", "height", "frameCount"]],
    ["write_skill", "Persist a reusable agent skill", ["name", "description", "definition"]],
    ["read_skill", "Read one persisted skill", ["name"]],
    ["list_skills", "List persisted and built-in skills", []],
    ["framework_status", "Report the bundled Rations runtime and model status", []],
    ["list_capabilities", "List the bundled framework capability areas", []],
    ["search_framework", "Search the bundled framework knowledge index", ["query"]],
    ["commit", "Save an auditable state snapshot", ["message"]],
    ["rollback", "Restore the previous auditable state snapshot", []],
    ["self_modify", "Request an auditable self-modification snapshot", ["description"]],
  ].map(([name, description, required]) => {
    const risk = ["write_skill", "commit", "rollback", "self_modify"].includes(name)
      ? "mutating" : ["sign", "encrypt", "decrypt"].includes(name) ? "sensitive" : "read-only";
    const result = name === "framework_status" ? "runtime status object"
      : name === "search_framework" ? "matching capability records"
      : name === "list_capabilities" ? "capability records"
      : name === "list_skills" ? "skill records" : "tool-specific result";
    return { name, description, required, risk, result, maxArgsBytes: 8 * 1024 * 1024 };
  });

  const KNOWLEDGE = [
    { area: "runtime", text: "Rations is a browser-first offline framework and platform: quine HTML UI, Zig WebAssembly core, local LLM, WebRTC/P2P relay, CAS, and physical preservation channels." },
    { area: "agent", text: "The agent uses a local Transformers.js ONNX model in a Web Worker. Tools are executed locally; remote model fallback is not required for air-gapped operation." },
    { area: "preservation", text: "Preservation layers include QR/paperback, audio cassette, video storage, steganography, polyglot carriers, Shamir recovery, Reed-Solomon repair, and collapse portals." },
    { area: "network", text: "Freenet-style GET/PUT/UPDATE/SUBSCRIBE/CONNECT operations use content-addressed storage, ring routing, relay transport, and hop-by-hop responses." },
    { area: "integrity", text: "Wire formats are frozen by ADR-0002 and conversion-emission contracts by ADR-0006. Donor quirks and intentional divergences are recorded in reverse-engineering docs." },
    { area: "integer-core", text: "Core Zig paths are integer-only. Floating point is restricted to explicitly documented JavaScript/f64 sidecars such as TurboQuant." },
  ];

  function list() { return TOOLS.slice(); }
  function get(name) { return TOOLS.find((tool) => tool.name === name) || null; }
  function validate(name, args) {
    const tool = get(name);
    if (!tool) return { ok: false, error: "Unknown tool: " + name };
    if (!args || typeof args !== "object" || Array.isArray(args)) {
      return { ok: false, error: "Tool args must be an object" };
    }
    const missing = tool.required.filter((key) => args[key] === undefined || args[key] === null);
    if (missing.length) return { ok: false, error: "Missing required args: " + missing.join(", ") };
    let encoded;
    try { encoded = JSON.stringify(args); } catch { return { ok: false, error: "Tool args are not serializable" }; }
    if (encoded.length > tool.maxArgsBytes) return { ok: false, error: "Tool args exceed 8 MiB" };
    const visit = (value) => {
      if (Array.isArray(value)) {
        if (value.length > 4 * 1024 * 1024) return false;
        return value.every(visit);
      }
      if (value && typeof value === "object") return Object.values(value).every(visit);
      return true;
    };
    if (!visit(args)) return { ok: false, error: "Binary/array argument exceeds 4 MiB items" };
    return { ok: true, tool };
  }
  function promptText() {
    return TOOLS.map((tool) => `- ${tool.name}: ${tool.description}. Required args: ${tool.required.length ? "{" + tool.required.join(", ") + "}" : "none"}; risk=${tool.risk}; returns=${tool.result}`).join("\n");
  }
  function capabilities() { return KNOWLEDGE.map((item) => ({ ...item })); }
  function search(query) {
    const terms = String(query || "").toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return [];
    return KNOWLEDGE.filter((item) => terms.some((term) => (item.area + " " + item.text).toLowerCase().includes(term)));
  }

  return { list, get, validate, promptText, capabilities, search };
})();

if (typeof window !== "undefined") window.AgentTools = AgentTools;
if (typeof module !== "undefined" && module.exports) module.exports = AgentTools;
