/**
 * Agent Execution Loop — the core turn-based execution cycle.
 * Receives user input, sends to LLM, parses tool calls, executes them,
 * feeds results back, and repeats until the LLM produces a final response.
 */

const Agent = (function () {
  const MAX_TURNS = 10;
  let conversation = [];
  let running = false;
  let listeners = [];

  function notify(type, payload) {
    listeners.forEach((fn) => fn(type, payload));
  }

  function on(listener) {
    listeners.push(listener);
    return () => {
      listeners = listeners.filter((l) => l !== listener);
    };
  }

  function log(level, message) {
    notify("log", { level, message, timestamp: Date.now() });
  }

  function clearHistory() {
    conversation = [];
  }

  /**
   * Execute a single tool call.
   * @param {Object} call - { name, args }
   * @param {Object} rations - RationsBridge instance
   * @returns {Promise<{result, isError}>}
   */
  async function executeTool(call, rations, llm) {
    const { name, args } = call;
    const validation = typeof AgentTools !== "undefined"
      ? AgentTools.validate(name, args)
      : { ok: true };
    if (!validation.ok) return { result: { error: validation.error }, isError: true };

    try {
      switch (name) {
        case "hash": {
          const data = new TextEncoder().encode(args.text || "");
          const hash = rations.sha256(data);
          return { result: { hash: toHex(hash) } };
        }

        case "sign": {
          const identity = getIdentity();
          if (!identity) return { result: { error: "No identity loaded" }, isError: true };
          const msg = new TextEncoder().encode(args.message || "");
          const sig = rations.ed25519Sign(msg, identity.secretKey);
          return { result: { signature: toHex(sig) } };
        }

        case "verify": {
          const msg = new TextEncoder().encode(args.message || "");
          const sig = fromHex(args.signature || "");
          const pk = fromHex(args.publicKey || "");
          const ok = rations.ed25519Verify(msg, sig, pk);
          return { result: { valid: ok } };
        }

        case "encrypt": {
          const plaintext = new TextEncoder().encode(args.plaintext || "");
          const password = new TextEncoder().encode(args.password || "");
          const salt = new Uint8Array(16);
          crypto.getRandomValues(salt);
          const key = rations.pbkdf2(password, salt, 100000, 32);
          const nonce = new Uint8Array(12);
          crypto.getRandomValues(nonce);
          const result = rations.aesEncrypt(plaintext, key, nonce);
          if (!result) return { result: { error: "Encryption failed" }, isError: true };
          return {
            result: {
              ciphertext: toHex(result.ciphertext),
              tag: toHex(result.tag),
              salt: toHex(salt),
              nonce: toHex(nonce),
            },
          };
        }

        case "decrypt": {
          const ciphertext = fromHex(args.ciphertext || "");
          const password = new TextEncoder().encode(args.password || "");
          const salt = fromHex(args.salt || "");
          const nonce = fromHex(args.nonce || "");
          const tag = fromHex(args.tag || "");
          const key = rations.pbkdf2(password, salt, 100000, 32);
          const plaintext = rations.aesDecrypt(ciphertext, key, nonce, tag);
          if (!plaintext) return { result: { error: "Decryption failed (auth error)" }, isError: true };
          return { result: { plaintext: new TextDecoder().decode(plaintext) } };
        }

        case "shamir_split": {
          const secret = new TextEncoder().encode(args.secret || "");
          const shards = rations.shamirSplit(secret, args.threshold || 3, args.total || 5);
          if (!shards) return { result: { error: "Shamir split failed" }, isError: true };
          const shardLen = 1 + secret.length;
          const result = [];
          for (let i = 0; i < (args.total || 5); i++) {
            result.push(toHex(shards.slice(i * shardLen, (i + 1) * shardLen)));
          }
          return { result: { shards: result, shardLen } };
        }

        case "shamir_reconstruct": {
          const shardHexes = args.shards || [];
          const shardLen = args.shardLen || 0;
          if (shardHexes.length < 2 || shardLen < 2) {
            return { result: { error: "Need at least 2 shards and shardLen" }, isError: true };
          }
          const allShards = new Uint8Array(shardHexes.length * shardLen);
          for (let i = 0; i < shardHexes.length; i++) {
            const shard = fromHex(shardHexes[i]);
            allShards.set(shard, i * shardLen);
          }
          const secretLen = shardLen - 1;
          const secret = rations.shamirReconstruct(allShards, shardLen, shardHexes.length, secretLen);
          if (!secret) return { result: { error: "Reconstruction failed" }, isError: true };
          return { result: { secret: new TextDecoder().decode(secret) } };
        }

        case "write_skill": {
          const skill = Skills.write(args.name, args.description || "", args.definition || "");
          log("success", "Skill written: " + args.name);
          return { result: { name: skill.name, updated: skill.updated } };
        }

        case "read_skill": {
          const skill = Skills.get(args.name);
          if (!skill) return { result: { error: "Skill not found" }, isError: true };
          return { result: skill };
        }

        case "list_skills": {
          return { result: { skills: Skills.list().map((s) => ({ name: s.name, description: s.description })) } };
        }

        case "framework_status": {
          const status = llm && typeof llm.getStatus === "function" ? llm.getStatus() : {};
          return {
            result: {
              product: "Rations",
              runtime: "browser-first offline-capable WASM framework",
              model: status.model || null,
              modelLoaded: !!status.loaded,
              modelLoading: !!status.loading,
              device: status.device || null,
              loadMs: status.loadMs || 0,
              lastInferenceMs: status.lastInferenceMs || 0,
              tools: typeof AgentTools !== "undefined" ? AgentTools.list().length : 0,
            },
          };
        }

        case "list_capabilities": {
          return { result: { capabilities: AgentTools.capabilities() } };
        }

        case "search_framework": {
          return { result: { query: args.query, matches: AgentTools.search(args.query) } };
        }

        case "stega_embed": {
          const imageData = args.imageData ? new Uint8Array(args.imageData) : null;
          const payloadData = args.payloadData ? new Uint8Array(args.payloadData) : null;
          if (!imageData || !payloadData) {
            return { result: { error: "Need imageData and payloadData" }, isError: true };
          }
          const stegoPng = rations.stegaEmbed(imageData, payloadData, args.password || "default", args.filename || "payload.bin");
          if (!stegoPng) return { result: { error: "Embedding failed" }, isError: true };
          log("success", "Stega embed: " + payloadData.length + " bytes in " + stegoPng.length + " byte PNG");
          return { result: { stegoPngSize: stegoPng.length, stegoPng: Array.from(stegoPng) } };
        }

        case "stega_extract": {
          const imageData = args.imageData ? new Uint8Array(args.imageData) : null;
          if (!imageData) {
            return { result: { error: "Need imageData" }, isError: true };
          }
          const extracted = rations.stegaExtract(imageData, args.password || "");
          if (!extracted) return { result: { error: "Extraction failed" }, isError: true };
          log("success", "Stega extract: " + extracted.data.length + " bytes, filename: " + extracted.filename);
          return { result: { data: Array.from(extracted.data), filename: extracted.filename } };
        }

        case "stega_capacity": {
          const imageData = args.imageData ? new Uint8Array(args.imageData) : null;
          if (!imageData) {
            return { result: { error: "Need imageData" }, isError: true };
          }
          const cap = rations.stegaCapacity(imageData, args.bitDepth || 1);
          return { result: { capacity: cap, bitDepth: args.bitDepth || 1 } };
        }

        case "video_encode": {
          const data = args.data ? new Uint8Array(args.data) : null;
          if (!data) {
            return { result: { error: "Need data" }, isError: true };
          }
          const width = args.width || 1920;
          const height = args.height || 1080;
          const encoded = rations.videoEncode(data, width, height);
          if (!encoded) return { result: { error: "Video encode failed" }, isError: true };
          log("success", "Video encode: " + data.length + " bytes → " + encoded.frameCount + " frames");
          return { result: { frameCount: encoded.frameCount, pixelSize: encoded.pixels.length, originalSize: encoded.originalSize } };
        }

        case "video_decode": {
          const videoData = args.videoData ? new Uint8Array(args.videoData) : null;
          if (!videoData) {
            return { result: { error: "Need videoData" }, isError: true };
          }
          const width = args.width || 1920;
          const height = args.height || 1080;
          const frameCount = args.frameCount || 1;
          const decoded = rations.videoDecode(videoData, width, height, frameCount);
          if (!decoded) return { result: { error: "Video decode failed" }, isError: true };
          log("success", "Video decode: " + decoded.length + " bytes");
          return { result: { data: Array.from(decoded), size: decoded.length } };
        }

        case "commit": {
          const state = {
            skills: Skills.list(),
            conversation: conversation.slice(-10),
          };
          const hash = await Rollback.commit(state, args.message || "Agent commit");
          log("success", "State committed: " + hash.substring(0, 8));
          return { result: { commit: hash } };
        }

        case "rollback": {
          const state = await Rollback.rollback();
          if (!state) return { result: { error: "No previous state to rollback to" }, isError: true };
          log("warn", "Rolled back to previous state");
          return { result: { restored: true } };
        }

        case "self_modify": {
          log("warn", "Self-modification requested: " + (args.description || "no description"));
          const state = {
            skills: Skills.list(),
            conversation: conversation.slice(-10),
            modification: args,
          };
          const hash = await Rollback.commit(state, "self_modify: " + (args.description || "unknown"));
          log("success", "Self-modification committed: " + hash.substring(0, 8));
          return { result: { commit: hash, message: "Self-modification saved. Use rollback to revert." } };
        }

        default:
          return { result: { error: "Unknown tool: " + name }, isError: true };
      }
    } catch (e) {
      return { result: { error: e.message }, isError: true };
    }
  }

  function getIdentity() {
    try {
      // Prefer the unlocked in-memory keypair — a passphrase-wrapped
      // stored record has no plaintext secretKey to read.
      if (typeof currentKeypair !== "undefined" && currentKeypair) {
        return currentKeypair;
      }
      const stored = localStorage.getItem("rations-identity");
      if (!stored) return null;
      const id = JSON.parse(stored);
      return {
        publicKey: fromHex(id.publicKey),
        secretKey: fromHex(id.secretKey),
      };
    } catch (e) {
      return null;
    }
  }

  function toHex(bytes) {
    return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  function fromHex(hex) {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
    }
    return bytes;
  }

  /**
   * Run the agent execution loop.
   * @param {string} userInput - User's message
   * @param {Object} rations - RationsBridge instance
   * @param {Object} llm - LLMManager instance
   * @returns {Promise<string>} Final response text
   */
  async function run(userInput, rations, llm) {
    if (running) {
      log("warn", "Agent already running, please wait…");
      return "Agent is already processing a request.";
    }
    running = true;
    notify("start", { input: userInput });

    try {
      const skills = Skills.list();
      let turn = 0;

      // Add user message to conversation
      conversation.push({ role: "user", content: userInput });

      while (turn < MAX_TURNS) {
        turn++;
        log("info", "Turn " + turn + ": sending to LLM…");

        const messages = PromptRuntime.buildMessages(userInput, conversation, skills);
        const response = await llm.generate(messages, {
          maxTokens: 128,
          temperature: 0.3,
        });

        // Add assistant response to conversation
        conversation.push({ role: "assistant", content: response });

        // Parse tool calls
        const toolCalls = PromptRuntime.parseToolCalls(response);
        const reasoning = PromptRuntime.extractReasoning(response);

        if (reasoning) {
          log("info", "Agent: " + reasoning.substring(0, 200));
        }

        if (toolCalls.length === 0) {
          // No tool calls — this is the final response
          running = false;
          notify("complete", { response, turns: turn });
          return response;
        }

        // Execute tool calls
        let toolResults = "";
        for (const call of toolCalls) {
          log("info", "Tool: " + call.name);
          const { result, isError } = await executeTool(call, rations, llm);
          toolResults += PromptRuntime.formatToolResult(call.name, result, isError) + "\n";
        }

        // Feed tool results back into conversation
        conversation.push({ role: "user", content: toolResults });
      }

      // Exceeded max turns
      log("warn", "Max turns (" + MAX_TURNS + ") exceeded");
      running = false;
      notify("complete", { response: "Max turns exceeded", turns: MAX_TURNS });
      return "Agent exceeded maximum turns without producing a final response.";
    } catch (e) {
      running = false;
      log("error", "Agent error: " + e.message);
      notify("error", { message: e.message });
      return "Agent error: " + e.message;
    }
  }

  return { run, on, clearHistory, isRunning: () => running };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = Agent;
}
