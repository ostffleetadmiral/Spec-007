# Provenance — src/js/ donor-derived assets

| File | Donor | Retrieved | Contents | License notes |
|---|---|---|---|---|
| `nomad_data.js` | `originals/project-nomad/collections/*.json` | 2026-09-18 | All 7 collection manifests vendored as structured data: `wikipedia` (6 options), `kiwix_categories` (category→tier→ZIM resources), `maps` (9 PMTiles region collections), `conditions`, `home_remedies`, `natural_remedies` (CDC/NIH-sourced text — public domain per donor source field), `creator_packs` | See `collections/creator-pack-license.md` in the donor for pack-specific terms; remedy content is US-government public-domain guidance per the manifest `source` fields |

## Hand-written Rations modules (not vendored)

| File | Purpose |
|---|---|
| `nomad.js` | Command Center parity layer: 17-service catalog with native/substitute/external availability (service names/ports from donor `service_seeder.ts`), collection flattening, ZIM/PMTiles inspect/fetch wrappers, remedy search, merged catalog |
| `vphone.js` | ws↔vsock gateway client for the R13 vphone-control v1 wire protocol (protocol reverse-engineered, not copied) |
| `zipapp.js` | ZipApp inspect/catalog/run with capability-gated lazy runtimes |
