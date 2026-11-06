/**
 * Skills System — manages SKILL.md-style skill definitions for the agent.
 * Skills are plain-text definitions that describe reusable browser logic.
 * Stored in localStorage with Git-backed versioning via Rollback.
 */

const Skills = (function () {
  const STORAGE_KEY = "rations-skills";
  let skills = new Map();

  function load() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const arr = JSON.parse(stored);
        skills = new Map(arr.map((s) => [s.name, s]));
      }
    } catch (e) {
      console.warn("[rations] Failed to load skills:", e);
    }
  }

  function save() {
    try {
      const arr = Array.from(skills.values());
      localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
    } catch (e) {
      console.warn("[rations] Failed to save skills:", e);
    }
  }

  function list() {
    return Array.from(skills.values());
  }

  function get(name) {
    return skills.get(name) || null;
  }

  function write(name, description, definition) {
    const skill = {
      name,
      description,
      definition,
      updated: Date.now(),
    };
    skills.set(name, skill);
    save();
    return skill;
  }

  function remove(name) {
    const existed = skills.delete(name);
    if (existed) save();
    return existed;
  }

  // Built-in skills that ship with the agent
  const BUILTIN_SKILLS = [
    {
      name: "hash_text",
      description: "SHA-256 hash any text input",
      definition: `# hash_text
Use the rations_sha256 tool to hash input text.
Args: text (string)
Returns: hex-encoded SHA-256 digest`,
    },
    {
      name: "generate_identity",
      description: "Generate a new Ed25519 keypair for P2P identity",
      definition: `# generate_identity
Generate a random 32-byte seed, then call rations_ed25519_keypair_seed.
Store the result in localStorage under "rations-identity".
Args: none
Returns: { publicKey, secretKey } as hex strings`,
    },
    {
      name: "encrypt_data",
      description: "AES-256-GCM encrypt data with a password",
      definition: `# encrypt_data
1. Generate a 16-byte random salt
2. Derive a 32-byte key using PBKDF2(password, salt, 100000)
3. Generate a 12-byte random nonce
4. Call rations_aes_encrypt(plaintext, key, nonce)
5. Return { ciphertext, tag, salt, nonce }
Args: plaintext (string), password (string)
Returns: encrypted blob with salt and nonce`,
    },
    {
      name: "split_secret",
      description: "Shamir split a secret into shards for distribution",
      definition: `# split_secret
Call rations_shamir_split with the secret, threshold, and total count.
Args: secret (string), threshold (int), total (int)
Returns: array of hex-encoded shards`,
    },
    {
      name: "stega_embed",
      description: "Hide any file inside a PNG image using LSB steganography with compression and AES-256-GCM encryption",
      definition: `# stega_embed
1. User provides a cover PNG image and a payload file
2. Call Rations.stegaEmbed(imageData, payloadData, password, filename)
3. The pipeline compresses (zlib), encrypts (AES-256-GCM with PBKDF2), and embeds (LSB) automatically
4. Returns a stego PNG image that looks identical to the original
5. Download the stego image for the user
Args: imageData (Uint8Array - PNG bytes), payloadData (Uint8Array), password (string), filename (string)
Returns: Uint8Array - stego PNG image bytes`,
    },
    {
      name: "stega_extract",
      description: "Extract hidden data from a steganographic PNG image",
      definition: `# stega_extract
1. User provides a stego PNG image and the password used during embedding
2. Call Rations.stegaExtract(imageData, password)
3. The pipeline extracts, decrypts, and decompresses automatically
4. Returns { data: Uint8Array, filename: string }
5. Download the extracted file for the user
Args: imageData (Uint8Array - stego PNG bytes), password (string)
Returns: { data: Uint8Array, filename: string }`,
    },
    {
      name: "stega_capacity",
      description: "Check how much data an image can hold at different bit depths",
      definition: `# stega_capacity
Call Rations.stegaCapacity(imageData, bitDepth) to get max payload bytes.
Bit depth 1 = invisible (1 bit per channel), 3 = slight degradation, 7 = maximum capacity.
Args: imageData (Uint8Array - PNG bytes), bitDepth (int 1-7)
Returns: int - max payload bytes that can be embedded`,
    },
    {
      name: "video_encode",
      description: "Encode any file as video for infinite storage glitch",
      definition: `# video_encode
1. User provides a file to encode
2. Call WebCodecsBridge.encodeToVideo(data, width, height, fps) for MP4 output
3. Or call Rations.videoEncode(data, width, height) for raw frame data
4. Binary data is mapped to black/white pixels (1 bit per RGB channel)
5. Download the resulting video file
Args: data (Uint8Array), width (int, default 1920), height (int, default 1080), fps (int, default 30)
Returns: Uint8Array - MP4 video or raw frame data`,
    },
    {
      name: "video_decode",
      description: "Decode video data back to the original file",
      definition: `# video_decode
1. User provides a video file (MP4 or raw frames)
2. Call WebCodecsBridge.decodeFromVideo(videoData) for MP4 or RVID format
3. Or call Rations.videoDecode(framePixels, width, height, frameCount) for raw frames
4. Extracts bits from pixels (threshold at 127) and reconstructs original file
5. Download the decoded file
Args: videoData (Uint8Array - MP4 or raw frame pixels)
Returns: Uint8Array - original file data`,
    },
  ];

  function initBuiltins() {
    for (const skill of BUILTIN_SKILLS) {
      if (!skills.has(skill.name)) {
        skills.set(skill.name, { ...skill, updated: Date.now() });
      }
    }
    save();
  }

  load();
  initBuiltins();

  return { list, get, write, remove, initBuiltins };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = Skills;
}
