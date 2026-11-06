// nomad.js — Command Center parity layer (R14 project-nomad port).
//
//   Nomad.services()                 merged service catalog w/ availability
//   Nomad.collections()              flattened ZIM/PMTiles/remedy resources
//   Nomad.inspectArchive(bytes)      ZIM/PMTILES header inventory (WASM)
//   Nomad.zimArticle(bytes, ns, url) article bytes via rations_zim_article
//   Nomad.pmtilesTile(bytes, z,x,y)  tile bytes via rations_pmtiles_tile
//   Nomad.pmtilesMetadata(bytes)     metadata JSON string
//   Nomad.remedies(query)            search vendored remedy collections
//   Nomad.mergedCatalog()            Supply Depot + ZipApp view
//
// project-nomad orchestrates Docker services (Kiwix, Ollama, Qdrant,
// Kolibri, CyberChef, FlatNotes, ProtoMaps, Supply Depot). Rations is
// browser-first: container services are reported honestly as `external`,
// with the Rations subsystem that covers the capability named as a
// `substitute`. See docs/reverse-engineering/project-nomad.md.

"use strict";

const Nomad = (() => {
  const decoder = new TextDecoder();

  function bridge() {
    if (!self.Rations) throw new Error("WASM bridge not ready");
    return self.Rations;
  }

  // Donor service table — admin/database/seeders/service_seeder.ts.
  // availability: "native" (implemented in Rations), "substitute"
  // (Rations subsystem covers the capability), "external" (host-bound).
  const SERVICES = [
    { id: "kiwix", name: "Kiwix (ZIM server)", port: "8090", availability: "substitute",
      substitute: "native ZIM reader (src/media/handlers/zim.zig) — read articles directly",
      description: "Offline Wikipedia and knowledge libraries in ZIM format" },
    { id: "qdrant", name: "Qdrant", port: "6333", availability: "external",
      substitute: null,
      description: "Vector database for storing and searching embeddings" },
    { id: "ollama", name: "Ollama (AI chat)", port: "/chat", availability: "substitute",
      substitute: "agent layer — on-device model registry + prompt-runtime",
      description: "Local AI chat that runs entirely on your hardware" },
    { id: "cyberchef", name: "CyberChef", port: "8100", availability: "substitute",
      substitute: "media conversion graph — encode/encrypt/transform pipelines",
      description: "Swiss Army knife for data encoding, encryption, and analysis" },
    { id: "flatnotes", name: "FlatNotes", port: "8200", availability: "substitute",
      substitute: "quine self-edit + Store (IndexedDB/LS autosave)",
      description: "Simple note-taking app with local storage" },
    { id: "kolibri", name: "Kolibri", port: "8310", availability: "external",
      substitute: null,
      description: "Interactive learning platform with video courses" },
    { id: "protomaps", name: "ProtoMaps (PMTiles)", port: null, availability: "substitute",
      substitute: "native PMTiles reader (src/media/handlers/pmtiles.zig)",
      description: "Offline basemap tiles in PMTiles format" },
    // ── Supply Depot (donor ports 8400–8499) ────────────────────────────
    { id: "stirling_pdf", name: "Stirling-PDF", port: "8400", availability: "external",
      substitute: "polyglot PDF carrier (partial — merge/split only)",
      description: "Locally-hosted PDF manipulation — merge, split, compress, convert" },
    { id: "filebrowser", name: "Filebrowser", port: "8410", availability: "external",
      substitute: null,
      description: "Web-based file manager" },
    { id: "calibreweb", name: "Calibre-Web", port: "8420", availability: "external",
      substitute: "EPUB/ZIM readers cover book viewing",
      description: "E-book reader and Calibre library manager" },
    { id: "it_tools", name: "IT-Tools", port: "8430", availability: "external",
      substitute: "media conversion graph covers hash/encode/format",
      description: "Developer utilities — UUID, hash, encoding, formatters" },
    { id: "excalidraw", name: "Excalidraw", port: "8440", availability: "external",
      substitute: null,
      description: "Virtual whiteboard, fully offline" },
    { id: "meshtastic_web", name: "Meshtastic Web", port: "8450", availability: "external",
      substitute: "Rations P2P mesh covers off-grid messaging",
      description: "Browser client for Meshtastic mesh radios" },
    { id: "meshcore_web", name: "MeshCore Web", port: "https:8500", availability: "external",
      substitute: "Rations P2P mesh covers off-grid messaging",
      description: "Browser client for MeshCore mesh radios" },
    { id: "homebox", name: "Homebox", port: "8470", availability: "external",
      substitute: null,
      description: "Home inventory and asset management" },
    { id: "vaultwarden", name: "Vaultwarden", port: "https:8480", availability: "external",
      substitute: null,
      description: "Bitwarden-compatible password manager server" },
    { id: "jellyfin", name: "Jellyfin", port: "8490", availability: "external",
      substitute: null,
      description: "Media server — video, music, photo libraries" },
  ];

  function services() {
    return SERVICES.map(s => ({ ...s }));
  }

  /** Flatten vendored collection manifests into uniform resources.
   *  kind: "zim" | "pmtiles" | "remedy" | "condition" | "pack". */
  function collections() {
    const D = self.NomadData || {};
    const out = [];
    for (const o of (D.wikipedia && D.wikipedia.options) || []) {
      if (!o.url) continue;
      out.push({ kind: "zim", group: "wikipedia", id: o.id, title: o.name,
        description: o.description, url: o.url, size_mb: o.size_mb, version: o.version });
    }
    for (const cat of (D.kiwix_categories && D.kiwix_categories.categories) || []) {
      for (const tier of cat.tiers || []) {
        for (const r of tier.resources || []) {
          out.push({ kind: "zim", group: cat.slug, tier: tier.slug,
            recommended: !!tier.recommended, id: r.id, title: r.title,
            description: r.description, url: r.url, size_mb: r.size_mb, version: r.version });
        }
      }
    }
    for (const col of (D.maps && D.maps.collections) || []) {
      for (const r of col.resources || []) {
        out.push({ kind: "pmtiles", group: col.slug, id: r.id, title: r.title,
          description: r.description, url: r.url, size_mb: r.size_mb, version: r.version });
      }
    }
    for (const pack of (D.creator_packs && D.creator_packs.packs) || []) {
      out.push({ kind: "pack", group: "creator-packs", id: pack.slug || pack.id,
        title: pack.name, description: pack.description });
    }
    for (const src of ["home_remedies", "natural_remedies"]) {
      for (const r of (D[src] && D[src].remedies) || []) {
        out.push({ kind: "remedy", group: src, id: r.slug, title: r.name,
          conditions: r.conditions, uses: r.uses, cautions: r.cautions });
      }
    }
    return out;
  }

  /** Inspect an archive blob: {format, inventory} — ZIM/PMTILES header JSON. */
  function inspectArchive(bytes) {
    const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const format = bridge().detectFormat(b);
    if (format !== "ZIM" && format !== "PMTILES") return { format, inventory: null };
    const raw = bridge().convert(format, "JSON", b, Math.max(65536, b.length));
    if (!raw) return { format, inventory: null };
    return { format, inventory: JSON.parse(decoder.decode(raw)) };
  }

  /** ZIM article bytes (ns e.g. "A"), or null. */
  function zimArticle(bytes, ns, url) {
    const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    return bridge().zimArticle(b, ns, url);
  }

  /** PMTiles tile bytes at (z,x,y), or null. */
  function pmtilesTile(bytes, z, x, y) {
    const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    return bridge().pmtilesTile(b, z, x, y);
  }

  /** PMTiles metadata JSON string, or null. */
  function pmtilesMetadata(bytes) {
    const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    return bridge().pmtilesMetadata(b);
  }

  /** Search vendored remedies by condition/name substring (lowercase). */
  function remedies(query) {
    const q = (query || "").toLowerCase();
    return collections().filter(r => r.kind === "remedy").filter(r => {
      if (!q) return true;
      if ((r.title || "").toLowerCase().includes(q)) return true;
      return (r.conditions || []).some(c => c.toLowerCase().includes(q));
    });
  }

  /** Unified catalog: Supply Depot services + ZipApp runtime families —
   *  the Command Center parity view for the Apps panel. */
  function mergedCatalog() {
    const svc = services().map(s => ({
      id: s.id, name: s.name, port: s.port, availability: s.availability,
      substitute: s.substitute, description: s.description, source: "supply-depot",
    }));
    const zapps = (self.ZipApp ? [] : []);
    return { services: svc, zipapps: zapps };
  }

  return { services, collections, inspectArchive, zimArticle,
    pmtilesTile, pmtilesMetadata, remedies, mergedCatalog };
})();

if (typeof self !== "undefined") self.Nomad = Nomad;
