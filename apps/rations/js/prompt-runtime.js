/**
 * Prompt Runtime — assembles system prompts, manages conversation context,
 * and formats tool-call responses for the Rations agent.
 */

const PromptRuntime = (function () {
  const SYSTEM_PROMPT = `You are Rations Agent, an autonomous air-gapped browser agent.

You have these tools:
- hash: SHA-256 hash of text. Args: {"text": "..."}
- sign: Ed25519 sign. Args: {"message": "..."}
- verify: Ed25519 verify. Args: {"message", "signature", "publicKey"}
- encrypt: AES-256-GCM. Args: {"plaintext", "password"}
- decrypt: AES-256-GCM. Args: {"ciphertext", "password", "salt", "nonce", "tag"}
- shamir_split: Split secret. Args: {"secret", "threshold", "total"}
- shamir_reconstruct: Reconstruct. Args: {"shards", "shardLen"}
- stega_embed: Hide file in PNG image. Args: {"imageData", "payloadData", "password", "filename"}
- stega_extract: Extract hidden data from PNG. Args: {"imageData", "password"}
- stega_capacity: Check image capacity. Args: {"imageData", "bitDepth"}
- video_encode: Encode file as video. Args: {"data", "width", "height"}
- video_decode: Decode video to file. Args: {"videoData", "width", "height", "frameCount"}
- list_skills: List available skills. No args.
- framework_status: Report runtime/model status. No args.
- list_capabilities: List bundled Rations capability areas. No args.
- search_framework: Search bundled framework knowledge. Args: {"query":"..."}
- commit: Save state snapshot. Args: {"message"}
- rollback: Undo last change. No args.
- self_modify: Request an auditable self-modification snapshot. Args: {"description":"..."}

Tool calls are local and must use the exact tool name and JSON args. Use framework_status or search_framework before answering questions about Rations itself. Do not invent tool results.

To use a tool, output exactly:
<tool_call>
{"name": "tool_name", "args": {"key": "value"}}
</tool_call>

Example: to hash text, output:
<tool_call>
{"name": "hash", "args": {"text": "hello"}}
</tool_call>

Be concise. Explain briefly, then act.`;

  function buildMessages(userInput, conversationHistory, skills, context) {
    const messages = [];

    // System prompt
    let systemContent = SYSTEM_PROMPT;

    // Generate the same tool inventory used by validation/dispatch.
    if (typeof AgentTools !== "undefined") {
      systemContent += "\n\n## Tool Registry\n" + AgentTools.promptText();
    }

    // Append available skills
    if (skills && skills.length > 0) {
      systemContent += "\n\n## Available Skills\n";
      for (const skill of skills) {
        systemContent += "- " + skill.name + ": " + skill.description + "\n";
      }
    }

    // Append context if provided
    if (context) {
      systemContent += "\n## Current Context\n" + context;
    }

    messages.push({ role: "system", content: systemContent });

    // Add conversation history (keep last 10 turns)
    const history = conversationHistory.slice(-20);
    for (const turn of history) {
      messages.push({ role: turn.role, content: turn.content });
    }

    // Agent.run may already have appended the current user turn. Avoid
    // duplicating it, which wastes context and makes small local models
    // more likely to ignore the requested tool.
    const last = history[history.length - 1];
    if (!last || last.role !== "user" || last.content !== userInput) {
      messages.push({ role: "user", content: userInput });
    }

    return messages;
  }

  function parseToolCalls(text) {
    const calls = [];
    const add = (value) => {
      if (!value) return;
      if (Array.isArray(value)) {
        value.forEach(add);
        return;
      }
      if (typeof value === "object" && typeof value.name === "string") {
        calls.push({ name: value.name, args: value.args && typeof value.args === "object" ? value.args : {} });
      }
    };
    const parse = (source) => {
      try { add(JSON.parse(source)); } catch { /* try the next envelope */ }
    };

    const tagged = /<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/gi;
    let match;
    while ((match = tagged.exec(text)) !== null) parse(match[1]);
    if (calls.length) return calls;

    const fenced = /```(?:json|tool_call)?\s*([\s\S]*?)```/gi;
    while ((match = fenced.exec(text)) !== null) parse(match[1].trim());
    if (calls.length) return calls;

    // Small local models sometimes emit a complete JSON object without
    // the tag. Restrict this fallback to balanced objects containing name.
    for (let start = text.indexOf("{"); start >= 0; start = text.indexOf("{", start + 1)) {
      let depth = 0;
      let quoted = false;
      let escaped = false;
      for (let i = start; i < text.length; i++) {
        const ch = text[i];
        if (escaped) { escaped = false; continue; }
        if (ch === "\\") { escaped = true; continue; }
        if (ch === '"') { quoted = !quoted; continue; }
        if (quoted) continue;
        if (ch === "{") depth++;
        if (ch === "}") {
          depth--;
          if (depth === 0) {
            const candidate = text.slice(start, i + 1);
            if (candidate.includes('"name"')) parse(candidate);
            if (calls.length) return calls;
            break;
          }
        }
      }
    }
    return calls;
  }

  function formatToolResult(toolName, result, isError) {
    const status = isError ? "error" : "success";
    return `<tool_result name="${toolName}" status="${status}">\n${JSON.stringify(result, null, 2)}\n</tool_result>`;
  }

  function extractReasoning(text) {
    // Remove tool calls to get pure reasoning text
    return text.replace(/<tool_call>[\s\S]*?<\/tool_call>/g, "").trim();
  }

  return {
    buildMessages,
    parseToolCalls,
    formatToolResult,
    extractReasoning,
    SYSTEM_PROMPT,
  };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = PromptRuntime;
}
