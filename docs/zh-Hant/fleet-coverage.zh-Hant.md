# 艦隊覆蓋普查 — 雙機所有含程式碼根目錄

**狀態:** 普查 1 — 全機掃描,digit + sheraton
**範圍:** `digit`(本機)與 `sheraton`(遠端同儕)上所有含原始碼的目錄,
無論是否位於專案目錄內。於第二次覆寫掃蕩後執行(2026-10-07)。

**目的:** 檔案記錄資產。本普查記錄*產出資產的艦隊* —
使任何程式碼根目錄不得宣稱被遺忘,未經檢驗的樹亦不得暗自偏離正典。

**覆蓋分類:**
- **CANONICAL** — 位於受治理語料內(檔案、元件對照表、發佈閘門)。
- **MAPPED** — 於檔案或對照表中具名為艦隊成員。
- **MIRROR** — 受覆蓋根之副本;受覆蓋根為準。
- **EXTERNAL** — 第三方/預置捐贈樹;非艦隊智慧財產。
- **UNMAPPED** — 尚未列於任何對照表之艦隊程式碼;於此指定處置。
- **PLACEHOLDER** — 空根目錄;記錄在案使其日後不得宣稱覆蓋。

---

## 1. `digit` — 受治理根目錄

| 根目錄 | 內容 | 覆蓋 |
|---|---|---|
| `CascadeProjects/hardware/experiments/Spec-007` | 本檔案 — 卡匣正典、織構、安全閘門、原型 | **CANONICAL** |
| `CascadeProjects/hardware/experiments/TheUE` | 整數協定/證據層 | **MAPPED** — 檔案姊妹專案 |
| `CascadeProjects/hardware/experiments/zig-k3-port` | 決定性 K3 推論引擎 | **MAPPED** |
| `CascadeProjects/hardware/experiments/zig-k3-port-local-preserved-20261004` | 移植前快照 | **MIRROR** — 依政策封存之保存狀態 |
| `CascadeProjects/hardware/experiments/qstar-llm` | 晶格原生推理引擎(主要副本) | **MAPPED** |
| `CascadeProjects/hardware/experiments/BS` | BS 語料(資料 + 原型) | **MAPPED** — 語料捐贈者 |
| `CascadeProjects/hardware/experiments/family/Rations` | 家族 Rations 樹 | **MAPPED** |
| `CascadeProjects/hardware`(父層) | 證明工作區 — MOUND 前身、codon、neuraleak、E8、J3(O)、Lean 4 formalize/、qsharp/、sidecar/、os/ FANO 鉤子、polyglot-ref、papers | **CANONICAL** — 自有 AGENTS.md 與封存政策 |
| `CascadeProjects/Rations` | 實體/氣隙傳輸、quine UI、WASM 核心、中繼 | **MAPPED** — 檔案姊妹專案,WASM 連續性受閘門管制 |
| `CascadeProjects/basic/qstar-llm` | 第二份 qstar-llm 檢出 | **MIRROR** — 以 experiments 副本為準 |

## 2. `digit` — experiments 樹外的艦隊根目錄

| 根目錄 | 內容 | 覆蓋 |
|---|---|---|
| `CascadeProjects/ThePlatform` | 「Quantam Black」— 57 個 Zig 模組(physics/、governance/、network/、rendering/、spatial/)、Q# 層、565 測試、hyper-token、AdmPaul、number-systems | **UNMAPPED → 現列入普查** — 艦隊平台姊妹專案,自有 ROOT_MANIFEST |
| `CascadeProjects/basic/Abby` | 捐贈籃:codon、Falsifible、llama.cpp、neuraleak、RamseyLLM、zotron/Qstar、repositories/(beheader、concepts、freenet-core、ISG、Maypole_firmware、PaperTune) | **混合** — codon+neuraleak 已移植入 hardware/;repositories/ 為捐贈樹(見 §4) |
| `CascadeProjects/Falsifible` | Zig 證偽框架(batch、dense_mlp、entropy、compression) | **UNMAPPED** — 測試床根目錄 |
| `CascadeProjects/octo` | Octolab — GPLv3 隨插即用私有 GitLab(ostf/octolab) | **EXTERNAL-FLEET** — OSTF 工具,非資產本身 |
| `CascadeProjects/digit-sheraton` | — | **PLACEHOLDER** — 空目錄 |
| `CascadeProjects/ThePlatform.git`、`git/downbeat.git` | 裸儲存庫 | **MIRROR** — 受覆蓋根之 git 遠端 |
| `Projects/downbeat` | Engineered Universe — Zig+Q#+Vulkan、490 測試、parallel_orchestrator(星艦層)、firstprinciples/ 語料、Gov/、neuraleak/、sidecars(nullclaw/nullhub)、tinyagi、UltraRAG、visualizer | **UNMAPPED → 現列入普查** — 主要艦隊專案;gov/ 血脈已餵入憲章語料 |
| `Documents/Ark` | I-Vector 多語言框架 — Zig 運算核心 + Vulkan + Q# + Python 黃金母本 | **UNMAPPED** — 艦隊多語言姊妹專案 |
| `Documents/Mosi` | Mosi — Zig 備份/編解碼套件:afsk、beheader、huffman、isg、optar、papertune、qrbackup、quine、ramsey、shamir、stega、lattice、babel_path | **MAPPED** — 實體備份姊妹專案;optar 用於 Rations 腿 |
| `Documents/animation` | Fano_V1_6 韌體 + Zig 動畫引擎(Maple/Maypole 衍生,ESP32 網狀測試台) | **UNMAPPED → 現列入普查** — 硬體艦隊成員 |
| `Documents/archive` | 捐贈/封存:3D_Tensor_Prototype、ip_quantum_latent_engine、ip_qubit_simulator、llama.cpp、vulkan-zig、Zig_tensor_prototype、Governance/、docs/ | **MIRROR/EXTERNAL** — 已封存捐贈者 |
| `Documents/models` | GGUF 權重(qwen 0.5B/2.5B-3B/3-8B/3-9B) | **MAPPED** — 腦部構件,摘要閘門管制 |

## 3. `digit` — 專案目錄外之根目錄(長尾)

| 根目錄 | 內容 | 覆蓋 |
|---|---|---|
| `Desktop/PJ` | HexRedox HIPF — algebraic/dimensional/exceptional 程式碼 + 文件 + LaTeX | **MIRROR** — HexRedOx 血脈;引擎在 sheraton |
| `Desktop/Qstar` | Book of Phi、Gov/(admiralty、constitutional、ethics、human_academic)、Maypole_firmware、papers、QSTAR-Public-Disclosure | **MAPPED** — Gov 餵入憲章語料 |
| `Desktop/Ralph` | axiom7revisited(**MOUND v0.2.0,1175 測試**)、EU(Exceptional Universe)、2606.25219、TheBriefing | **MAPPED** — MOUND 理論層;EU v11 語料源 |
| `Desktop/Sheraton` | HexRedOx、models/qwen0.5b、nullclaw、nullhub、tinyoffice、zml | **MIRROR** — sheraton 暫存副本 |
| `Desktop/ThePlatform` | hyper-token、nullclaw、nullhub、number-systems、qdk、vulkan-zig、zlm、8DPhysics/FANO_OVERFLOW/PARITY 文件 | **MIRROR** — ThePlatform 捐贈副本 |
| `Desktop/Desi` | DESI-Llama、llama.cpp | **EXTERNAL** — 捐贈者 |
| `Music/Paul/Sci-Fi` | **EU.VERSION.Z**(eu_version_z)— 6372+ 測試、計畫 A–O、280+ 模組、研究閘門 | **UNMAPPED → 現列入普查** — 主要艦隊 Python 語料 |
| `Music/Paul/engineered_universe` | EU Python 套件(依 Sci-Fi AGENTS 為舊版儲存庫) | **MIRROR** — eu_version_z 已取代 |
| `Music/Paul/codon`、`Public/Euqinom/codon` | Codon 專案副本 | **MIRROR** — hardware/codon 為移植正典 |
| `Music/Paul/newest` | EU vX4 腳本 + 視覺化 | **UNMAPPED** — 零散研究腳本 |
| `Music/Paul/space-agent` | space-agent.ai — 瀏覽器優先代理執行環境、薄 Node 伺服器、DOX 階層 | **EXTERNAL-FLEET** — 產品儲存庫 |
| `Music/Paul/pi` | — | **PLACEHOLDER** — 空目錄 |
| `Videos/HexRedOx` | 8g-cli/edge/engine — HexRedOx 幾何推論引擎 v0.2.5.3 | **UNMAPPED → 現列入普查** — 艦隊引擎 |
| `Videos/Ansible` | phi-llm(biological_tokenizer,Zig)、Idk 包 | **UNMAPPED** — 分詞器測試床 |
| `Pictures/V0.0.0.1` | 封存籃:3DGS(CLOD-3DGS、lyra、vulkan-zig)、Agency(nullclaw/nullhub/SplitBrain)、concepts/、continuityengine(Obsidian 記憶體、qdk)、n1/n..n13、qsharp-test(OctonionSim)、rust 工具鏈源碼 | **混合** — rust/3DGS/lyra 為 EXTERNAL 捐贈;n1/qsharp-test/concepts 為 UNMAPPED 研究 |
| `Public/Euqinom` | Euqinom 框架 — 24 概念、Python+Q#、Bible/、proofs/、RuView/ | **UNMAPPED → 現列入普查** — 艦隊框架 |
| `quantum-sidecar/sidecar.py` | WaveSimulator — 雙 32³ 晶格門戶結構 | **UNMAPPED** — 零散研究腳本 |
| `Arduino/libraries` | Arduino 函式庫檢出 | **EXTERNAL** — 預置 |
| `bin/` | arduino-cli、attestation_guard、nullclaw-left/right、openclaw、tokenjuice、zig 工具鏈、verify_parity.sh | **混合** — 工具鏈為 EXTERNAL;attestation_guard/tokenjuice 為艦隊工具(已列入普查) |
| `lib/libtokenjuice.so` | 編譯共享物件 | **MIRROR** — 艦隊工具之構件 |
| `zig/` | Zig 工具鏈源碼 | **EXTERNAL** — 工具鏈 |
| `Downloads/` | 語料文件/壓縮包(Admiralty Rules v2、eigen-modifications、grok 報告、雲端包) | **EXTERNAL** — 文件接收 |
| `scikit_learn_data/` | sklearn 資料集快取 | **EXTERNAL** — 快取 |
| `/opt` | xplico、balenaEtcher、firmware-mod-kit | **EXTERNAL** — 系統工具 |

## 4. `sheraton` — 遠端同儕普查

| 根目錄 | 內容 | 覆蓋 |
|---|---|---|
| `~/CascadeProjects` | **EU v11 原始語料** — eu_v11_prototype.py、EU_COMPLETE_FRAMEWORK.txt、EU_VERIFICATION.json、concepts/、eu_computational_architecture、Qstar 工作區 | **MAPPED** — 檔案所引 BorisADorsey EU v11 來源 |
| `~/Mosi` | 完整 Mosi 樹(16.6k 檔案)— Infinite_Storage_Glitch、PaperTune、beheader、qr-backup、benchmarks、convert、models、prototype | **MAPPED** — 比 digit 副本完整;同儕自治其樹 |
| `~/archive-migrated/ip_quantum_latent_engine` | 潛在引擎封存(models/) | **MIRROR** — 已遷移封存 |
| `~/hydra-relay` | relay-bundle.tgz + server.js — firingline Hydra 腿 | **MAPPED** — 檔案 C59 已驗證中繼 |
| `~/ollama-build` | Ollama 源碼建構樹 | **EXTERNAL** — 工具鏈捐贈者 |
| `~/go`、`~/Arduino`、`~/bin` | Go 模組快取、Arduino 函式庫、arduino-cli | **EXTERNAL** — 工具鏈 |
| `~/backups` | — | **PLACEHOLDER** — 空目錄 |

## 5. 發現

| # | 發現 | 處置 |
|---|---|---|
| F-01 | **無孤兒艦隊程式碼。** 所有含程式碼根目錄均可歸類為受覆蓋專案、其鏡像、捐贈者、或具名普查項目。無匿名者存留。 | 普查結案 |
| F-02 | **艦隊遠大於檔案。** experiments/ 之外約 25 個艦隊根目錄承載同一數學血脈(EU → MOUND → SPEC-007)。 | 本文件即艦隊對照表;任何元件升級仍須經 §9 升級程序,不得僅以目錄存在而升級 |
| F-03 | **EU 語料位於 sheraton 而非 digit。** sheraton 之 `~/CascadeProjects` 持有 EU v11 原始檔 — 檔案之上游理論來源為*同儕資產*,符合 firingline 單一空間模型 | 記錄在案;同儕治理 |
| F-04 | **三個主要未覆蓋體** — `downbeat`(490 測試,Engineered Universe)、`eu_version_z`(6372+ 測試,研究閘門)、`ThePlatform/Quantam Black`(565 測試)— 現以 UNMAPPED 艦隊根目錄列入普查。其各自 AGENTS.md/稽核文件已執行共同規則(整數核心、封存政策、覆蓋率棘輪) | 已上圖;未升級前各依其治理 |
| F-05 | **鏡像誠實。** Codon 存在 3+ 處;hardware/ 副本為 Zig/Q#/sidecar 移植正典。nullclaw/nullhub 出現 5+ 處為工具而非語料 | 鏡像規則記錄在案 |
| F-06 | **隱藏樹教訓:** digit 上約 60% 程式碼檔案位於名稱不似專案之目錄 — `Music/`、`Videos/`、`Pictures/`、`Public/`、`Desktop/`、`Documents/` 各含完整儲存庫。僅掃描 `*/CascadeProjects|Projects/` 之普查會漏失多數 | 普查須以樹根重跑,不得以專案名稱為準 — 常設規則 |
| F-07 | **空佔位記錄在案**(`digit-sheraton`、`Music/Paul/pi`、sheraton 之 `~/backups`),使其日後不得宣稱未記錄內容 | 新增 PLACEHOLDER 分類 |

## 6. 艦隊對核心映射矩陣

將普查具名之根目錄對齊生態系統之六正典支柱 —
各資產接入機器之位置:

| 艦隊根目錄 | 主要技術堆疊 | 支柱對齊 | 架構功能 |
|---|---|---|---|
| `Projects/downbeat`(Engineered Universe) | Zig + Q# + Vulkan(490 測試) | 理論、法度與軀體 | 巨觀「星艦」層(`parallel_orchestrator`)與物理渲染引擎;經原生 `Gov/` 血脈餵入憲章語料變體 |
| `Music/Paul/Sci-Fi`(`eu_version_z`) | Python(6372+ 測試,280+ 模組) | 理論(上游源頭) | 檔案之 EU 與 MOUND 數學血脈最初分岔之處 — 鉅細靡遺的母本模擬與研究閘門演化核心 |
| `CascadeProjects/ThePlatform`(「Quantam Black」) | Zig + Q#(57 模組,565 測試) | 法度、網路與渲染 | 大型平行平台,內含原生 physics、network、rendering、spatial 模組,與 TheUE 整數核心並行 |
| `Videos/HexRedOx`(幾何推論引擎) | 代數/例外程式碼 + LaTeX | 理論與空間邏輯 | 高維例外代數推論引擎(v0.2.5.3),為 J3(O) 八元數矩陣提供數學骨幹 |
| `Documents/animation`(Fano_V1_6 韌體) | C++ / ESP32 韌體 | 傳輸與硬體網狀層 | 實體微網狀測試台,將 Fano 堆疊直接實作於場域硬體節點 |
| `Public/Euqinom`(Euqinom 框架) | Python + Q#(24 概念,proofs) | 理論與量子模擬 | 基礎概念本體論與量子態模擬器(`OctonionSim`),支援高維代數模型 |

### 各部件如何咬合

- **理論上游**(`eu_version_z` 與 `HexRedOx`):檔案運作於封存
  工件之上,其理論公理可追溯至 `eu_version_z` 測試套件與
  HexRedOx 例外幾何 — 數學推導引擎。
- **執行重器**(`downbeat` 與 `ThePlatform`):同儕平台而非
  捐贈者 — `downbeat` 承載 Vulkan 空間視覺化與編排層;
  `ThePlatform` 承載重型 Zig 模組,呼應 TheUE 整數純粹之承諾。
- **實體邊緣**(`animation` / ESP32 網狀層):核心傳輸使用
  IPv6 扁平空間 ULA + loopback/WAN 之原始 UDP;韌體樹為
  射頻邊緣,Fano 座標狀態於此映射至無線網狀硬體。

### 常設執行規則

映射為資產課責,而非自動升級:

- 列於此圖之根目錄僅獲認可為已驗證同儕或捐贈血脈 — 僅此而已。
- 此等根目錄之任何程式碼、模組或邏輯,未經完整對抗壓力矩陣、
  沉降閉合檢查與依 §9 升級之正式證偽審計前,不得觸及正典核心
  (`hardware/experiments/Spec-007`)。

## 7. 常設規則

任一機器上之新程式碼根目錄必須列入本普查或後續普查修訂版。
未列入普查之根目錄依定義即未經檢驗 — 與證偽帳本對缺席條目
之處理相同:不可信、不判罪、*排入佇列*。

*普查以程式碼副檔名列舉雙機檔案系統
(zig/js/mjs/py/rs/c/cpp/h/ts/qs/cs/ino/sh),
排除 node_modules、.git、zig-cache 與工具鏈內部。*
