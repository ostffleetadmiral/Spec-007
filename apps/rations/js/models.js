/**
 * Rations Model Registry (R7.2)
 *
 * Mirror of src/agent/models.zig — local-first multi-model registry.
 * Each entry carries the model family so the UI/agent can pick the
 * right chat template, EOS handling, and dtype defaults.
 * transformers.js applies each model's own chat_template from
 * tokenizer_config.json when given a messages[] array; `family` is
 * kept for logging, WASM-side parity, and prompt-runtime stop rules.
 */

const Models = (function () {
  const REGISTRY = [
    {
      id: "models/Xenova_Qwen1.5-0.5B-Chat",
      label: "Qwen1.5 0.5B Chat (local)",
      family: "chatml",
      dtype: "int8",
      bos: "",
      eos: "<|im_end|>",
      eosId: 151645,
      fallback: "Xenova/Qwen1.5-0.5B-Chat",
    },
    {
      id: "models/LiquidAI_LFM2-350M",
      label: "LFM2 350M (optional sidecar)",
      family: "lfm2",
      dtype: "int8",
      bos: "<|startoftext|>",
      eos: "<|im_end|>",
      eosId: 151645,
      fallback: "LiquidAI/LFM2-350M",
    },
    {
      id: "models/LiquidAI_LFM2-700M",
      label: "LFM2 700M (optional sidecar)",
      family: "lfm2",
      dtype: "int8",
      bos: "<|startoftext|>",
      eos: "<|im_end|>",
      eosId: 151645,
      fallback: "LiquidAI/LFM2-700M",
    },
    {
      id: "models/onnx-community_Llama-3.2-1B-Instruct",
      label: "Llama 3.2 1B Instruct (optional sidecar)",
      family: "llama3",
      dtype: "q4",
      bos: "<|begin_of_text|>",
      eos: "<|eot_id|>",
      eosId: 128009,
      fallback: "onnx-community/Llama-3.2-1B-Instruct-ONNX",
    },
  ];

  const DEFAULT_ID = REGISTRY[0].id;

  function list() {
    return REGISTRY.slice();
  }

  function find(id) {
    return REGISTRY.find((m) => m.id === id) || null;
  }

  /** Resolve an id (registered or custom path) to a spec-like object. */
  function resolve(id) {
    const known = find(id);
    if (known) return known;
    if (!id) return find(DEFAULT_ID);
    // Custom path — treat as chatml (most common) with no fallback.
    return {
      id, label: id, family: "chatml", dtype: "int8",
      bos: "", eos: "<|im_end|>", eosId: 151645, fallback: null, custom: true,
    };
  }

  /** Stop strings per family — for trimming generated text if needed. */
  function stopStrings(id) {
    const m = resolve(id);
    switch (m.family) {
      case "llama3":
        return ["<|eot_id|>", "<|end_of_text|>", "<|start_header_id|>"];
      case "lfm2":
      case "chatml":
      default:
        return ["<|im_end|>", "<|im_start|>", "<|endoftext|>"];
    }
  }

  /** Populate a <select> with the registry; onPick(id) fills inputs. */
  function mountSelector(selectEl, onPick) {
    if (!selectEl) return;
    selectEl.innerHTML = "";
    for (const m of REGISTRY) {
      const opt = document.createElement("option");
      opt.value = m.id;
      opt.textContent = `${m.label} — ${m.family} / ${m.dtype}`;
      selectEl.appendChild(opt);
    }
    const custom = document.createElement("option");
    custom.value = "";
    custom.textContent = "— caminho personalizado —";
    selectEl.appendChild(custom);
    selectEl.onchange = () => {
      const m = find(selectEl.value);
      if (m && onPick) onPick(m);
    };
    const saved = (typeof localStorage !== "undefined")
      ? localStorage.getItem("rations-llm-model") : null;
    selectEl.value = saved && find(saved) ? saved : "";
  }

  return { list, find, resolve, stopStrings, mountSelector, DEFAULT_ID };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = Models;
}
