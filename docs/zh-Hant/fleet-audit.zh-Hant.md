# 艦隊審計 — 巨人之外部降階驗證

**狀態:** 生效中 — 首次掃描完成,2026-10-07
**稽核器:** `security/fleet-audit.mjs`
**報告:** `security/out/fleet-audit-{euz,downbeat,theplatform}.json`

---

## 0. 章程

艦隊普查(`fleet-coverage`)已定位三個未覆蓋巨人 — `eu_version_z`(研究閘控之 EU 演化核心,宣稱 6,372+ 測試)、`downbeat`(Engineered Universe 星艦層,約 490 測試)與 `ThePlatform`「Quantam Black」(約 565 測試)。本文件記錄首次**外部審計**:非檢視 — 乃鐵砧錘鍊。各巨人均以其原生測試執行器運行,並於其引入、決定性與中斷邊界受測。

**常設規則 — 依彼等自身契約審計,非依我等之法。** 各巨人以其宣告之標準衡量(其 `AGENTS.md`/manifest):決定性、誠實失敗、出處紀律。SPEC-007 之整數純粹律為*正典核心*約束 — Python 研究倉庫使用 `numpy` 浮點並非違規,除非其宣稱未達之決定性。發現經分類,而非道德化批判。

**判定矩陣**(驗證場詞彙):

| 判定 | 意義 |
|---|---|
| `HELD` | 乾淨承受探測 |
| `BOUNDARY` | 於較窄或誠實分類之包絡內成立 |
| `FRACTURE` | 真實破斷 — 靜默錯誤、偽造狀態,或契約承諾容忍處之未處理崩潰 |
| `SEALED` | 經證據確認不安全 |

**唯讀誓約。** 故障注入僅運行於暫存目錄與子程序;巨人樹內絕不修改 — 修復屬各巨人自身之 retro-dev 迴圈。

---

## 1. `eu_version_z` — `~/Music/Paul/Sci-Fi`

`pytest` 160 測試檔案,逐檔案隔離,每檔案 300 秒上限,4 工執行緒。

### 階段 A — 測試套件窮盡

| 探測 | 判定 | 證據 |
|---|---|---|
| `pytest-per-file` | **HELD** | 160/160 測試檔案全綠;**6,367 通過**,0 失敗,0 錯誤,0 崩潰 — 「6,372+ 測試」宣稱於枚舉誤差內驗證(部分檔案計數隨收集而異) |
| `self-audit-gate` | **HELD** | `cli audit --check` 退出 1 並報 `release_blocked:true` — 專案刻意之釋出閘門如其 AGENTS.md 宣告般運作 |

觀察到之抖動(綠色運行未遇但另經量測):`test_web_expanded.py::test_quantum_grover` 於**未播種**之隨機 Grover 量測上斷言 `result == 5` — 兩輪 12 次探測(11/12 繼而 12/12 — 觀測約 96%,本質為隨機)。見階段 C。

### 階段 B — 檔案系統與解析器安全

| 探測 | 判定 | 證據 |
|---|---|---|
| `chunker-binary-md` | **FRACTURE** | `rag/chunker.load_chunks` 以 `except OSError` 包裹 `read_text` — 但偽裝二進位 `.md` 觸發 `UnicodeDecodeError`(屬 `ValueError`),逃逸防護並終結**整個**語料載入。單一畸形檔案 = RAG 引入管線之批次殺手 |
| `chunker-eacces` | BOUNDARY | `chmod 000` 檔案被靜默跳過(`except OSError: continue`)— 無錯誤、無日誌。可辯護之韌性,但被拒檔案自語料中消失而無訊號 |
| `chunker-badroot` | BOUNDARY | 不存在之根目錄靜默回傳 `[]` — 呼叫端無法分辨「空語料」與「路徑錯誤」 |
| `legacy-import-surface` | BOUNDARY | **7 個測試檔案引入舊版 `engineered_universe` 套件**(pip-editable 位於 `~/Music/Paul/engineered_universe`)— 該等測試行使舊版樹,非 `eu_version_z`。AGENTS.md 自身移植附註承認部分重映射未完成;審計已量測之 |
| `yaml-malformed` | HELD | `parse_pipeline_yaml` 對畸形 YAML 拋出 `ParserError` — 響亮、誠實 |
| `yaml-wrong-schema` | HELD | `pipeline: "not-a-list"` + `components: 42` → pydantic `ValidationError` — 真實欄位之綱要受執行 |
| `cache-corrupt-db` | HELD | 毀損 sqlite 檔案 → `DatabaseError: file is not a database` — 響亮 |
| `cli-audit-badroot` | HELD | `audit --source-root /nonexistent` → 退出 1,traceback — 響亮 |

### 階段 C — 決定性與並發

| 探測 | 判定 | 證據 |
|---|---|---|
| `determinism-3x` | **HELD** | `OCTONION_MULT_TABLE` + `build_mult_table()` + `E8_ROOTS` 雜湊 3 次 → 逐位元一致(240 根) |
| `random-surface-scan` | BOUNDARY | 3 個非實驗模組觸及未播種 `np.random`/`random`:`quantum/vqe.py`、`research/bio/hp_folding.py`、`research/quantum/vqe.py` — 對未傳 `rng` 之呼叫端構成排程漂移面 |
| `stochastic-assertion-flake` | BOUNDARY | `test_quantum_grover` ×24 跨兩輪:**23 通過 / 1 失敗(約 96%)** — 測試對舊版端點之未播種隨機量測斷言 `result==5`;物理誠實,斷言不誠實 |

### euz 統計

`HELD ×7 · BOUNDARY ×4 · FRACTURE ×1`

**判定:** 套件頭條宣稱成立 — 實測 6,367 綠燈。唯一 FRACTURE 為 `chunker` 之例外型別不對稱(OSError 被跳過,UnicodeDecodeError 未被捕捉)— 屬巨人自身 retro-dev 迴圈內之一行修復。更深之發現為治理形狀:7 個測試檔案仍行使舊版樹,且一測試本質上即抖動。

---

## 2. `downbeat` — `~/Projects/downbeat`

`zig build test` — 完整套件含 Q# sidecar 建置(dotnet restore)與 shader 編譯。

| 探測 | 判定 | 證據 |
|---|---|---|
| `zig-build-test` | **HELD** | 退出 0,費時 158 秒 — 全部模組測試構件於宿主 Zig(0.13.0)下通過;套件輸出其結尾簽名(「The torus belongs to humanity」) |
| `ingestion-surface` | **HELD** | 9 個 `src/` 檔案觸及檔案系統/解析(`corpus_analyzer`、`foundation_audit`、`pulse`、`simulator`、`sidecar_probe`…);**0 處呼叫點缺乏可見錯誤處理** — 每次讀取均有 `try`/catch 防護 |
| `nondeterminism-surface` | BOUNDARY | 7 個檔案觸及 rand/timestamp(`entropy_generator`、`pulse`、`static_presence_monitor`、`telemetry`、`stress_tester`…)— 對熵/壓力套件屬預期,但對 `parallel_orchestrator` 消費路徑構成排程漂移面 |

### downbeat 統計

`HELD ×2 · BOUNDARY ×1`

**判定:** HELD。星艦之測試裝備真實且於負載下全綠。非決定性面屬誠實(熵產生器本應汲取熵);此註記僅針對假設可重現性之呼叫端而立。

---

## 3. `ThePlatform` — `~/CascadeProjects/ThePlatform`

`zig build test` — 工具鏈敏感:`build.zig` 針對 **Zig 0.16.0**(`root_module` API)。宿主預設為 0.13.0;manifest 已載明需求。以 `/usr/local/zig-0.16.0/zig` 運行。

| 探測 | 判定 | 證據 |
|---|---|---|
| `zig-build-test` | **HELD** | 於 zig 0.16.0 下退出 0,費時 96 秒 — 全部測試構件全綠(number_systems、hyper_token、c137_vector、ui_telemetry、quantum_bridge、attestation_guard、reality_verifier、ivector_ingestor、residue_projector、zotron_types…)。**工具鏈附註在案:** PATH 預設之 0.13.0 無法編譯 — 套件僅於其宣告之工具鏈下可驗證。巨人自身 `FINAL_AUDIT_REPORT` 已揭露「7 套件待 0.16.0 API 遷移」— 其自我報告誠實 |
| `ingestion-surface` | BOUNDARY | 6 個檔案觸及檔案系統/解析;靜態掃描標記 `hardware/hardware_monitor.zig` 3 處。**人工複審:** 三處皆為 `if (openFileAbsolute(...)) \|file\| … else \|_\| {}` — 慣用之選配感測器讀取,處理正確。BOUNDARY 僅作為靜態掃描之侷限記錄,非缺陷 |
| `nondeterminism-surface` | BOUNDARY | 9 個檔案觸及 rand/timestamp(`hardware_monitor`、`ollama_bridge`、`monte_carlo`、`integration_test`、`stress_test`)— 與遙測/壓力程式碼庫一致 |

### theplatform 統計

`HELD ×1 · BOUNDARY ×2`

**判定:** HELD-附工具鏈附註。「565 測試」頭條未能逐項獨立計數(建置圖執行構件而非編號摘要),但建置產出之所有構件皆運行全綠。該平台誠實記載其自身遷移債務 — 此坦承即為發現。

---

## 4. 發現總帳

| ID | 巨人 | 類別 | 發現 |
|---|---|---|---|
| FA-01 | euz | **FRACTURE** | `rag/chunker.load_chunks`:`except OSError` 遺漏 `UnicodeDecodeError` — 單一畸形 `.md` 終結整個語料巡覽 |
| FA-02 | euz | BOUNDARY | EACCES/不可讀檔案被靜默跳過 — 無錯誤浮現 |
| FA-03 | euz | BOUNDARY | 不存在之語料根目錄 → 靜默 `[]` — 空語料歧義 |
| FA-04 | euz | BOUNDARY | 7 個測試檔案引入舊版 `engineered_universe`(測試錯誤之樹);`test_quantum_grover` 約 8% 抖動 — 未播種隨機斷言 |
| FA-05 | euz | BOUNDARY | 3 個非實驗模組使用未播種隨機(`vqe` ×2、`hp_folding`) |
| FA-06 | downbeat | BOUNDARY | `src/` 下 7 個 rand/timestamp 檔案 — 誠實熵面,僅於呼叫端假設可重現性時構成漂移風險 |
| FA-07 | theplatform | BOUNDARY | 套件需 Zig 0.16.0;宿主預設 0.13.0 無法建置 — 工具鏈閘控之驗證 |
| FA-08 | theplatform | BOUNDARY | 9 個 rand/timestamp 檔案;靜態掃描之引入標記經複審 → 慣用選配檔案讀取 |

## 5. 外部審計常設規則

1. **依彼等契約,非依我等之法** — 巨人以其自身 AGENTS.md/manifest 受審。正典核心律(整數純粹、降階閉合)僅適用於巨人宣稱之處。
2. **不修改彼等之樹** — 故障注入存於暫存目錄/子程序;審計構件輸出至 `security/out/`,絕不寫入巨人。
3. **工具鏈誠實** — 依巨人宣告之工具鏈驗證;錯誤工具鏈之失敗屬我等構件,非彼等斷裂。
4. **抖動須量測而非豁免** — 對隨機演算法斷言決定性之測試,無論當日通過與否皆為邊界發現。
5. **發現被記錄而非修復** — 修復屬各巨人自身之 retro-dev 迴圈;本檔案記錄之,不補綴外部之樹。

*審計稽核器:`node security/fleet-audit.mjs <giant|all> [--emit]` — JSON 報告輸出至 `security/out/fleet-audit-<giant>.json`。*
