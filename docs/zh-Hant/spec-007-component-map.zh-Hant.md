# 元件對照表 — SPEC-007 檔案

**狀態:** 現行對照表,歸檔於權限等級 **L2** — 稽核/追蹤資料。
本文件為逆向工程基線:樹中每一元件、其契約職責、以及驗證方式。
自上而下重建;本次新增的擴充在各列中註明。

## 整數層(`src/`)

| 元件 | 契約 | 驗證 | 擴充(本次) |
|---|---|---|---|
| `fixed_point_q128.zig` | Q128.128 引擎:i256 原值、i512 中間值、RNE 乘法、ratio/div/pow/abs/cmp。軍需官的算術,認證至半個 ulp。 | 37 項測試 | — 已完備;現由 publish-check 明確執行(先前被 `*q128*` glob 靜默跳過) |
| `spec007_q128.zig` | 精簡 Q 配件,服務於三個測試框架的影子驗證。依設計不帶自身測試。 | 經由匯入者驗證 | 新增 `sub`/`neg`/`abs`/`cmp` 鏡像運算 |
| `spec007_calculations.zig` | 基線化學計量:物料平衡、drip→gas、機架擴展、包絡健全性。僅守恆與縮放 — 非配方。 | 8 測試 + 影子 | 耗盡-帕雷托測試:`duration × rate + remainder = total gas` |
| `spec007_verified_calculations.zig` | 已驗證主張層:治理所有公開數字的修正基線。 | 15 測試 + 影子 | 單發彈匣測試:168.6 mL 水 = 化學計量上恰好一次裝藥 |
| `spec007_expanded_calculations.zig` | 擴充篩選:PDRC、ORC、TEG、車輛道路負載、經濟、日照上限。 | 18 測試 + 影子 | 卡諾上限篩選:TEG 效率嚴格低於 η_c — 約低一個數量級 |
| `spec007_drivetrain_calculations.zig` | 機械橋:速比窗口、扭矩/功率守恆、ρv² 轉子應力、雙路徑降額、損耗熱回收。 | 21 測試 + 影子 | `meshChainMilli` — 嚙合損耗累乘(0.98³ 整數下取至 940‰) |
| `spec007_manifold_calculations.zig` | 系統整合:匣體積/質量帳、ESP32-S3 寄生包絡、油匯流排流量、三級熱歧管守恆。 | 12 測試 | 油匯流排運輸帳:`ṁ·cp·ΔT` 反演回流公式 |
| `spec007_dynamics_calculations.zig` | 暫態層:整數尤拉積分、逐步能量帳(餘數結轉)。 | 12 測試 + q128 影子 | `slabCoolStep`/`coolToTemp` — 模型原為單向升溫;現雙向,下限為環境溫度,裝藥耗盡後冷卻已驗證 |
| `spec007_fixedpoint_prototype.zig` | 原型:u128-mg vs Q32.32 vs Q128.128 三方對驗。 | 5 測試 | 範圍邊界測試:100,000² 於 Q32.32 溢位、於 Q128.128 精確 |
| `spec007_compute.zig` | 即時運算 ABI:每個檔案數字以 u32 匯出在瀏覽器重算,零匯入,編譯至 wasm32。 | 1 測試 + wasm 成品 | 新增 `residue_mg`、`air_lpm_x10`、`slab_cool_step`;重建 wasm(623 B);過時 `-dynamic` 旗標更正為 `-fno-entry -rdynamic` |
| `spec007_q_toys.zig` | Q 分部野戰玩具 — 真能運行的玩笑。 | 6 測試 + `main()` 演示 | 玩具 7:THE PHILOTIC DESK — 相關對子,`philoticMessage()` 恆回 0 位元。關聯重於運動,化為桌上玩物 |

## 韌體(`firmware/`)

| 元件 | 契約 | 驗證 | 擴充 |
|---|---|---|---|
| `spec007_controller.c` | ESP32-S3 骨架:純整數、canon §10 狀態機、per-mille PID、硬體優先淬滅權。標示 SCAFFOLD。 | 編譯通過,常數溯源至 dynamics harness | 新增 `QUENCH_WITNESS_MS`、`COOL_TAU_S`、`CHARGE_WATER_UL` 篩選常數 |

## 安全實驗室(`security/`)

| 元件 | 契約 | 驗證 | 擴充 |
|---|---|---|---|
| `harness.mjs` | 無頭 WASM + 原生 WebSocket 用戶端。 | 由各套件驗證 | — |
| `suite.mjs` | RED/BLUE/BLACK/GRAY 可執行掃描 → `findings.json`。 | 33 探針 | +2 BLUE 探針:`compute-wasm-abi` 與 `science-inventory-ladder` |
| `comms-suite.mjs` | 21 探針,docker WAN 拓撲。 | docker 閘控 | — |
| `hydra-node.mjs` / `wan-bridge.mjs` | 帳本節點守護進程 + 確定性損傷代理。 | comms-suite 驗證 | — |
| `kali-sweep.mjs` | 第五隊掃描 — 可重放的外部工具探針。 | docker/WAN 閘控 | +2 探針:`desk-wasm-artifact` 與 `desk-component-map` |
| `vector_main.zig` + `tools/cross_target_check.sh` (TheUE) | **Golden 決定性向量 + 跨目標矩陣** — 153 條正規運算行(Q128.128 基層、expFp 軌、熔爐角落、philotic 謂詞、天文邊界、i-vector 普查)+ sha256 摘要 `538237e6…`。**跨架構位元組級一致已證實**:native x86_64(ReleaseSafe)== wasm32-wasi(Debug,Node WASI)。aarch64 + riscv64 以 ReleaseSafe 編譯。**三個獨立運行時已驗證**:wasm32 上 Node WASI + k3w 直譯器(zig-k3-port/wasmrt),以及 k3w 下 **wasm64-wasi memory64** — 全部位元組一致。已知邊界:wasm Release 模式觸發 Zig-0.13/LLVM 寬整數降級缺口(Debug 乾淨)。 | `zig build golden-vectors` + script | 新增 — 互通契約 |
| 位元序修復(`governance.zig`、`science_ledger.zig`) | **原生位元序雜湊前置訊息已消除** — `AuditChain.append` 序號與 `shadowCommit`/`shadowCommitAt` nonce+座標現以 `.little` 明確編碼;稽核鏈與位置繫結影子在大端與小端主機上驗證一致。由 Phase-2 位元序稽核發現。 | zig build test | 修復 — 可攜性裂縫已閉合 |
| `docs/{en,zh-Hant}/spec-007-integration-architecture.*.md` | **生態系接縫** — 五層模型(L0 鎖定核心 → L4 體驗);藍圖階段映射(P6 安全已建成 = 四支隊伍;P5 星雲 = ivector 立方體作為程序化幾何);證據織構(檔案支撐、校驗和錨定、僅閘控命令);command-deck 元件映射;彩蛋規則(僅裝飾狀態 — 能影響裁決的彩蛋即漏洞)。 | — | 新增 — 草案 1 |
| `docs/{en,zh-Hant}/spec-007-protocol.*.md` | **Phase 3:獨立協議規格** — 分叉不變式、成對播種、α-bit 紀律(`qetSequenceOk`)、線路計量、氫槽位、決定性向量、位元序規則、7 個符合性閘、不可協商拒絕。外部模組接入晶格必須滿足的邊界文件。 | — | 新增 — 草案 1 |
| `science_jordan.zig` (TheUE) | **J3(𝕆)— 鏡/手解剖可測試化。** Hermitian 3×3 八元數矩陣、純整數倍增 Jordan 積 `J(X,Y)=XY+YX`。已驗證:精確交換 · 非結合(見證三元組)· Jordan 保留的唯一恆等式 `J(J(X²,Y),X)=J(X²,J(Y,X))` · 原始積的手性殘差為反 Hermitian(`r_ji = −conj(r_ij)`)· 手性即**交錯結合子** — 奇置換下變號、循環下保持。鏡 = 對稱通道;手 = 定向障礙。 | zig build test | 新增 — 6 測試,全為精確整數 |
| `fabric-bridge.mjs` + `command-deck.html` | **Phase 3 第一切片 — 證據織構上線。** 橋接器:SSE `/events` 檔案變更時追蹤 findings/descent/continuity/twenty-re/vectors;`/status` 快照;`/command` 閘控 POST(僅白名單 argv、無 shell、2 秒限流);每次呼叫附加至 **sha256 稽核鏈**(LE 序號 — 構造上位元序安全)。實測:descent 經閘執行(鏈有效條目)、`run-probe "rm -rf /"` 被拒、未知命令被拒、SSE 快照串流。甲板:卷宗風操作頁 — descent 橫幅、裂縫計數、摘要、紅利計、氫 slack 條、421 普查柱、視界格、發現走馬燈、閘控命令鈕。 | `node fabric-bridge.mjs` | 新增 — 接縫可執行化 |
| `science_boundary.zig` (TheUE) | **Phase 2 — 陷阱邊界已釘定。** 由敲打定義域發現而非閱讀:`khat` 的 `16−x` u64 下溢使 x≥17 成為**恐慌邊界**(安全建構;Release 為 UB)— 合法摺疊域 x∈[0,16],正典 [1,15],khat(16)=khat(0) 使摺疊閉合。`ladderRung` 域 s∈[0,21] — s=22 觸發 `intCast(3s→u6)`;s=21 釘為最後合法階(`universes=2⁶³`)。RNE 乘法在**精確半 ULP 平手**:捨棄分數=2^127 趨偶(算術精確驗證);略低捨下、略高捨上。`fromRatio(1, maxInt i256)` 已定義;`toInt` 域為 i64 可讀值。 | zig build test | 新增 — 5 邊界測試,定義域契約文檔化 |
| `k3-stress.mjs` | **K3BRAIN 隊 — 大腦在炮火之下。** 對 `tiny_k3` 複本執行七探測(原檔不動):四路並行解碼 → 摘要逐位一致(確定性屬於核心而非排程器);層規範 F32 符號/指數位元損毀 → 摘要漂移 `12628702…` 被捕獲;截斷 + 非法 JSON 標頭 → 誠實 exit-1 拒絕;解碼中途 SIGKILL → 新解碼重發 `1f641085…`;資源上限已量測(每解碼峰值 20.6 MiB、平均 ~4.8s)。**已記錄邊界**:尾數 LSB 傷口對 argmax 不可見 — 摘要見證*行為*(輸出 id 一致性)而非權重完整性;結構性補充為 checkpoint 權重雜湊。 | node security/k3-stress.mjs | 新增 — 5 HELD、2 NOTED、0 open |
| `rations-stress.mjs` | **RATIONS 隊 — 氣隙下的錨點解離。** 對分段帳本+酬載複本執行八探測(線上 fabric 不動,`seed-drop.mjs` 提供 `SEED_LEDGER`/`SEED_PAYLOADS` 環境覆寫):簽名傷口 → corrupt;未簽章 shard 傷口 → 簽名仍有效但 `seedHash` 不符而中止;跨 drop shard 交換 → 兩者皆失同步;外部簽章者偽造 → `tokenHash` 失同步;帳本端 `seedHash` 竄改 → 中止;到期邊界(兄弟 drop 合法頂替,全到期 pair 回報 `expired`);酬載遺失 → 中止。**雙錨在每種解離類別下皆守住。** | node security/rations-stress.mjs | 新增 — 8 HELD、0 open |
| `spec007_medium_stress_test.zig` (Rations) | **劣化介質彈幕 — 紙質腿在炮火下。** 發現並關閉兩個真實解析邊界陷阱:`token.deserialize` 固定尾部越界恐慌(端點存在但尾部不足 → `@memcpy` 越界;現改為 `error.TokenTooShort`),以及 `peakAmplitude` 的 `@abs(-32768)` i16 轉型恐慌(現改為飽和)。對真實 SPEC-007 token 的逐位元變異掃描:簽章區域位元**絕不**通過驗證;未簽章尾部傷口(has_shard/sh_len/shard)僅在 shard 語意改變時通過 — 正是 `seedHash` 錨定綁定的原因。截斷掃描:所有前綴皆拒絕。Golay(24,12):所有 ≤3 位元傷口修正(每字 2324 例);4 位元邊界已量測 — **10,626 傷口零誤解碼**(距離 8 覆蓋半徑,失敗即響)。FSK 噪聲拐點已釘定;RS D-of-(D+P) 邊界精確(15 取 10 重建,9 個誠實拒絕)。 | zig build test | 新增 — 7 測試;關閉 2 陷阱 |
| `gov-stress.mjs` | **GOV 隊 — 憲法在炮火下。** 對分段語料庫執行七探測(`GOV_ROOT` 環境覆寫;線上語料不動):畸形/二進位/BOM/無副檔名檔案 → 重跑索引逐位一致;chmod-000 子目錄 → **發現真實破口**(未捕捉的 `readdirSync` EACCES 使整個走訪崩潰)— 現改為跳過並記錄 `errors[]`;822 層巢狀至 4094 字元路徑上限 → 走訪器存活;`.archive`/點檔排除契約釘定(無點 `archive` 會被索引 — 僅 `.` 前綴隱藏);churn 確定性精確。**絆線彈幕**:量測 11 種規避類別(小寫/大小寫混合/leet/拆字/全形/零寬/黏合詞/實體/URL 編碼)— grep 僅是捕捉*意外*的精確大小寫 ASCII 檢查;機密邊界是架構性的而非文字性的。Lattice 上限:8.1KiB 工件、3375 cells、0.4ms 解析 — DOM 繪製延後(無 Chromium)。 | node security/gov-stress.mjs | 新增 — 5 HELD、2 NOTED、0 open;關閉 1 破口 |
| `falsification-audit` | **負空間掃描。** 對照硬化基線重新檢驗所有被廢棄路徑:跨協議/整數核心/傳輸/外部/MOUND 空間共 16 條帳目。審計 1:零復活 — 封存成立於算術與物理。**審計 2(行政覆權 `prototypes/`)**:記錄中第一個被打破的封存 — OVR-02 證明正典結構 lattice 狀態壓縮至 267 B ≤ 1232 B;N-02 復活為邊界(原始狀態封存維持,`LATTICE-FULL-C` 單資料包承載正典狀態)。OVR-01 確認 N-03:公開決定性不是相關(Eve 100% 重放位址導出狀態)。OVR-03 閉合 N-05 之補充:權重雜湊看見 argmax 不可見之傷口。常駐規則 §8:未來提案必須引用帳目並反駁封存證明。 | docs/en\|zh-Hant/falsification-audit.* | 審計文件 — 審計 1:7 sealed、3 boundary、2 closed、4 external;審計 2:1 resurrection |
| `prototypes/` + `seal-override.mjs` + `quantum-falsifiables.mjs` + `seal-override-2.mjs` | **行政覆權試驗場** — 每條封存路徑皆作為隔離實驗執行(不觸動生產,報告落於 `prototypes/out/`)。掃描 1:OVR-01 路由播種確認 · OVR-02 單資料包 lattice **封存打破**(brotli 267 B;N-02 修訂)· OVR-03 權重雜湊建成。量子:Q1 無訊號 50.00% · Q2 傳送經典成本 · Q3 CHSH \|S\|=2.0000。掃描 2 — 再 10 項:有界文法通道可行(N-01→邊界;own-prop 必須 — 素樸文法帶 FAB-01 原型洞)· 正規化絆線捕獲全部 14 種規避(N-04 收窄,晉升候選)· 簽章 shard fabric 內冗餘 · khat 環繞 29 靜默混疊 · qmul4 第三主機 KILL ×3 · f64 定義域不足 · 飽和 22/22 錯誤但合法 · **Golay d=5:全部 42,504 傷口誤解碼**(包絡 = ≤4)· M-34/36 維持 UNVERIFIED(已計算,未符合)。 | `node prototypes/*.mjs` | 1 封存打破、2 邊界可行、物理確認 |
| `route-o1.mjs` | **O(1) 解析閘門 — SPEC-008 核心主張,已證。** 15³ 座標空間上的貪婪曼哈頓下一跳(最大 \|delta\| 軸):**op-bound** — 全部 3375²=11,390,625 配對中最多 14 個受檢運算(無表無掃描);**monotone-descent** — 每跳距離恰好減 1,窮盡驗證 → 歸納得 ≤42 跳終止;**walk-convergence** — 16 次完整行走恰以曼哈頓跳數抵達;**flat-vs-scan** — 較 3375 項早退表掃描快 502×,工作量與 N 無關。誠實範圍:O(1) 僅指*解析* — 遞送仍須穿越 ≤42 物理跳。 | `node security/route-o1.mjs --emit` | GATE GREEN,SPEC-008 §5 `route-o1` → PROVEN |
| `staleness-detect.mjs` | **片段閘門 — 分歧於位址本身可見。** 六項探測:共享狀態發送者接受;單格傷口 → STALE(`8bb4ec0c8ca`→`30df1c12a2c`);雙格置換 → STALE(額外發現:正典 lattice 為**中心對稱** — `cells[i]==cells[N-1-i]`,故反轉位元相同);截斷狀態 → STALE;全部 3375 接收位置判定一致(片段為全域狀態);誠實標註 2⁻⁴⁴ 碰撞界 — 偵測分歧而非偽造(認證仍屬雙錨簽章)。 | `node security/staleness-detect.mjs --emit` | GATE GREEN,SPEC-008 §5 `staleness-detect` → PROVEN |
| `spec008-wire.mjs` | **原始 UDP 線路 + wan-lab — 最終縫線,已切開。** 25 B 標頭(`S8W1` magic / class / seq / total / 16 B tensor 目的地)於 ::1,配種子 mulberry32 劣化器(drop/dup/reorder/delay — wan-bridge 詞彙之資料包版)。六項探測:乾淨通道 → 15/15 層 + LATTICE-FULL-C 299 B 逐位元一致;15% 遺失 → 依 seq 缺口誠實回報 INCOMPLETE 無虛構;重排+25% 重複 → 去重 → 逐位元 3375 格;陳舊片段於標頭即拒,先於酬載信任;線路 MTU 誠實 — 壓縮單包與 15 訊框路徑並行合法;500 id K3-TOKEN 串流於 2% 遺失+重排下 → 495 seq↔酬載精確。範圍:tensor 位址作為路由標頭 — 字面 `fd53:5007::/48` 綁定依主機而定。 | `node security/spec008-wire.mjs --emit` | 新 — GATE GREEN,`wan-lab` → PROVEN — **§5 五閘全閉** |
| `fano-mesh-bridge.mjs` | **射頻邊緣閘門 — SPEC-008 ↔ ESP32 網狀方言,逐位元精確。** 將 Fano_V1_6 韌體之凍結 136-B 線路契約(cell word + dst xyz + seq + ≤64 B 酬載 + FNV-256 封存與八元數路由簽章及逐跳相位混疊)移植至 JS,以韌體自身黃金向量驗證 — 抓出真實移植缺陷(plen 位元組遺漏於封存摺疊)。關鍵轉譯:mesh 座標為 **0 起 [0,14]** 對 spec8 [1,15] — 心臟 (8,8,8)↔(7,7,7),中心自 8 移至 7。S8W1 資料包經 mesh 酬載隧道承載(frag_idx|frag_total|≤62 B 分塊;以 seq 重組);mesh 封存逐跳驗證,spec8 摘要片段於重組後仍觸發 — 兩道獨立閘門。**12/12 探測含 M-07 真實矽晶實測**:FANO_NODE_IP 閘控硬體套件 — JS 構建封包於裝置端簽章預言機逐位元一致、覆蓋區內損毀被拒、射頻送達之簽章封包於真實節點收件匣記為 `valid:true`(`qstar001` @ 192.168.4.1,OTA 燒錄 Fano_V1_6)、偽造封包記為 `valid:false`、尺寸管控不對稱(短→plen:0xFF;過長→截斷→簽章失敗)、韌體構建封包於 JS 雙生實作驗證通過。 | `node security/fano-mesh-bridge.mjs --emit` · `FANO_NODE_IP=<ip> node …` 啟用硬體探測 | GATE GREEN — 線路已抵達射頻硬體且韌體認可 |
| `rf-field-probe.mjs` | **實地射頻閘門 — 多節點射頻驗證。** 對真實雙節點 AP 部署運行 Fano 方言:節點對節點量子通訊經共享 `qstar-mesh` 射頻雙向驗證(`qstar001`↔`fano001`,簽章封包記為 `valid:true` 且相位戳記正確);節點→主機 UDP 擷取經 JS 雙生驗證;8 封包完整性連續;突發誠實環形截頂(上限 8);路由延遲與跳數無關(矽晶上逐跳 O(1));干涉預言機格式良好。路徑缺席時誠實略過:失效 STA 關聯與離線節點被記錄,絕不偽造。 | `node security/rf-field-probe.mjs --emit`(環境:`FANO_NODE_AP/B/STA`) | GATE GREEN — 10/10,裝置對裝置通訊已上線 |
| `fleet-coverage` | **雙機普查 — digit + sheraton 所有含程式碼根目錄。** 依副檔名於雙機檔案系統列舉(不僅專案目錄 — 約 60% 程式碼位於 `Music/`、`Videos/`、`Pictures/`、`Public/`、`Desktop/`、`Documents/`)。六分類:CANONICAL / MAPPED / MIRROR / EXTERNAL / UNMAPPED / PLACEHOLDER。發現:零孤兒根目錄;EU v11 原始語料位於 sheraton(依 firingline 由同儕治理);三大艦隊體已具名(downbeat 490 測試、eu_version_z 6372+ 測試、Quantam Black 565 測試);隱藏樹常設規則 — 普查以樹根重跑,不以專案名稱為準。§6 艦隊對核心矩陣將六大 UNMAPPED 根目錄對齊正典支柱(理論上游 `eu_version_z`+`HexRedOx`;執行重器 `downbeat`+`ThePlatform`;射頻邊緣 `animation`/ESP32;量子模擬 `Euqinom`)— 課責而非升級。 | docs/en\|zh-Hant/fleet-coverage.* | 普查文件 — 7 發現,約 60 根目錄分類,6 根支柱矩陣 |
| `fleet-audit` | **鐵砧 — 三大巨人之外部降階驗證。** `security/fleet-audit.mjs` 以故障條件運行原生測試套件 + 解析器/檔案系統故障注入 + 決定性/N 次掃描,依各巨人**自身**宣告之契約以 HELD/BOUNDARY/FRACTURE/SEALED 分類。首次掃描:**eu_version_z** 6,367 測試全綠/160 檔案(1 FRACTURE — `chunker` 之 OSError 防護遺漏 UnicodeDecodeError,單一畸形 .md 終結語料載入;BOUNDARY — EACCES 靜默跳過、空語料靜默、7 個測試檔案引入舊版樹、未播種隨機模組、約 8% 抖動之隨機 grover 斷言);**downbeat** zig build test HELD 158 秒(0 處無防護引入點;7 個 rand/timestamp 檔案);**ThePlatform** zig build test HELD 96 秒於宣告之 zig 0.16.0(宿主 0.13.0 無法建置 — 工具鏈閘控驗證;靜態引入標記經複審 → 慣用選配檔案讀取)。 | `node security/fleet-audit.mjs <giant\|all> --emit` → `security/out/fleet-audit-*.json`;docs/en\|zh-Hant/fleet-audit.* | 審計總帳 — 8 項發現 FA-01..FA-08,巨人依其自身 AGENTS.md 受審 |
| `spec-008-ipv6-tensor` + `ipv6-derive.mjs` | **下一道接縫,誠實規格。** Draft-0 提案:IPv6 位址即是 lattice 座標 — `fd53:5007::/48` ULA 前綴 + (k,r,c) u4 三元組 + 器官 u8 + 44 位元 cell 摘要片段(狀態過時於位址中可見)。`ipv6-derive.mjs` 為 `addr-derive` 閘門:5 個黃金向量上 derive→decode 往返已證明;並抓到自己的規格錯誤(12+8+52=72>64 → 片段為 44 位元)。O(1) 僅主張*路由解析* — 遞送仍穿越真實跳數(WAN 實驗室量測前為 UNVERIFIED)。MTU 誠實:全 lattice 狀態 = 1266B > 1232B 最小 MTU 酬載 → 2 資料包或 15 層訊框,已規範。 | node security/ipv6-derive.mjs --emit | 草案規格 + 閘門向量 |
| `fabric-stress.mjs` | **FABRIC 隊 — 接縫自我攻擊。** 針對隔離橋接器的 9 探針(獨立埠、獨立鏈 `FABRIC_AUDIT_LOG`):200 並發洪水(1 執行 / 199 限流 — 視窗序列化)· 13 名注入風暴拒絕 · 11 體型別混淆風暴 · 畸形/超限請求體 · 方法介面碼 · 60 客戶端 SSE 洪水中途斷線 · 鏈重導 + 偽造摘要定位 · 重啟鏈續存。**發現並閉合兩個真實閘門漏洞**:`Object.hasOwn`(原型路徑如 `"constructor"`/`"__proto__"` 滿足真值查找 → execFile 崩潰)與嚴格字串型別(`["run-audit"]` 強制轉型繞過查找 → `spec.bin === undefined` → 守護進程死亡 — 單請求 DoS)。閘控為 `run-probe fabric-stress`。 | `node fabric-stress.mjs` | 新增 — 修復後 9/9 HELD |
| `ivector_export_main.zig` (TheUE) + `lattice-probe.mjs` | **晶格饋送** — `zig build ivector-export` 由 `science_ivector` 輸出完整 15³ e-立方體為 JSON:3375 個 `cellLabel` + 普查 + 層標籤 + 雙梯 + 代數表 + 細胞位元組 `sha256` 摘要(`9106b153…`)。探針落地 `out/ivector-lattice.json`;閘控 `emit-lattice`、`/lattice` 端點、快照欄位、SSE 監視。甲板**晶格瀏覽器**渲染 15 片 Fano 堆疊 — 15×15 格、k=1..15 層滑桿、e 著色、e0 心臟標記 — 純工件重播。已驗證:k=8 切片第 1 行輸出 `[6,5,4,3,2,1,0,7,0,1,2,3,4,5,6]` — CANON_L8 逐字越線。 | `zig build ivector-export` + gate | 新增 — 立方體成為介面 |
| `k3-probe.mjs` | **閘後的整數大腦** — zig-k3-port 經織構介面浮出:`k3-selfcheck` 以 golden-gate 提示 `[3,4,5,6,7]` 在 `tiny_k3` 上執行 argmax 決定性解碼(固定 argv — 不接受自由提示;開放推理屬 `k3serve` 宿主進程,織構僅觀測不予閘控);輸出 id 以 u32-LE 雜湊為 sha256 大腦摘要 `1f641085…` 寫入 `out/k3-selfcheck.json`。`k3-cap` 擷取 k3cap 節點清單(CPU/RAM/q128_native/GPU)。快照 `k3` 欄位 + SSE 監視;甲板元件顯示層數、核心、摘要。摘要漂移即發現,同向量摘要。 | gated probes | 新增 — 大腦接入織構 |
| `gov-index.mjs` | **甲板遵循治理文集** — `thoughts&convos/gov/` 的決定性索引(僅現行文集;`.archive` 已取代快照除外):每文件 sha256、分區統計,輸出至 `security/out/gov-index.json` — **僅橋接端**(官員姓氏不進入公開樹;姓氏絆線維持)。介面:閘控 `gov-index` 命令、`/gov` 端點、快照 `gov` 欄位 + SSE 監視。甲板渲染 Admiralty 鏈(依章程第二條五席位 — 艦隊上將、STEM 副上將、創業少將、財務上將、倫理與衡平准將)、SPEC-004 分級階梯(L0→L7Q;L6 AI-Core 由 WO 門控、L7 不得委任、7Q 合成觀察者層)、文集統計。 | `node gov-index.mjs` | 新增 — 541 文件、36 分區已索引 |
| `seed-drop.mjs` + `seed-pairs.json` | **紙質腿 — 物理種子空投鑄造為 Rations 邀請令牌。** 閘控 `run-seed-drop`(固定 argv;配對計畫為檔案 — 無執行期參數)。種子為 u32(艦隊 `SEED:` 慣例),以 `PHSEED01` 魔術標頭置入令牌 shard 欄位;線格式與 Rations `token.serialize` 位元組精確一致(ep/shard 長度 u16 BE、expiry u64 LE);由持久織構金鑰 ed25519 簽章。原始種子僅存於 `out/seed-payloads/*.txt`(0600)— QR/optar/FSK 可列印工件;帳本與鏈僅錨定 `seedHash`/`tokenHash`。`run-audit seed-coverage` 重新解析每個 payload、重驗簽章、重算雙雜湊 — 4/4 覆蓋、4/4 驗證。**位元組相容已證**:Rations 自身的 `token.deserialize`+`verify` 接受該空投(`token_spec007_compat_test.zig`,2 測試)。橋接器新增 `/seed-ledger` 與快照 `seeds` 欄位。 | gate + audit | 新增 — 古典腿實體化 |
| `emergence-watch.mjs` | **EMERGENT 隊:觀測線束** — 6 項即時觀測:philotic-dividend、seedless-pair-chance、sync-free-coordination、collective-desync、thermal-band-split、wire-accounting-closure。禁制湧現監視器:任何違反界限的巨觀態是裂縫而非發現。 | standalone(本地節點 + 中繼) | 新增 — 4 EMERGENT、2 HELD、0 裂縫 |
| `docker-compose.{sec,wan}.yml` | 兩個隔離網段 + 雙宿主中繼拓撲。 | — | — |

## 站點(`site/`)

| 元件 | 契約 | 驗證 | 擴充 |
|---|---|---|---|
| `build.py` | 將文件與頁面渲染為雙語權限標示 HTML。 | publish-check 雙語閘 | 新增 `component-map` 頁面對 |
| `desktop.html` + `fano-desktop.js` | FANO-1 工作站:誓約門控殼層、檔案視窗、終端機、Quplink 牌組、彩蛋/成就、雙語。 | JS 語法閘 + 安全套件 | ANOMALY CODEX:科學庫存下限化為可收集傳說 — 139 鍵 `ANOMALY_LORE`、`anomalySeen` 追蹤、`codex` 指令、3 彩蛋 + 3 成就 |
| `fano-auth.js` | 真實誓約:Ed25519、契約簽章、PBKDF2+AES-GCM、RBAC、創世記錄。 | 安全套件 | — |
| `fano-comms.js` | comms.os:封緘/開啟、QR、Shamir、隱寫、WS 中繼。 | comms-suite | — |
| `spec007.wasm` | 檔案算術於瀏覽器即時運行。 | ABI 探針 | 以 residue/air/cool 匯出重建 |

## 工具(`tools/`)

| 元件 | 契約 | 驗證 | 擴充 |
|---|---|---|---|
| `publish-check.sh` | 發佈閘:不可變基線 sha256、所有整數測試框架、雙語、姓氏絆線、wasm 連續性、JS 語法。 | 自檢 | 修復靜默缺口 — `fixed_point_q128.zig` 與 `spec007_compute.zig` 原被 glob 略過;現明確執行;新增 `component-map` 雙語檢查 |
| `serve.py` | 本機預覽伺服器。 | — | — |

## 常設規則

- 上表每一列皆由可執行檢查驗證,或明確標示為經由匯入者驗證。
  任何元件不得主張其測試框架無法展示之事。
- 韌體常數為可溯源至 `spec007_dynamics_calculations.zig` 的篩選算術
  — 測試框架為權威,控制器為見證。
- wasm 成品為重建所得,非宣稱:`zig build-exe src/spec007_compute.zig
  -target wasm32-freestanding -fno-entry -rdynamic -O ReleaseSmall`。

## 第二輪擴充補遺

| 元件 | 擴充 |
|---|---|
| `quplink.js` | +1 遊戲:**Coast the Slab** — 以 `slab_cool_step` 自爆發平衡冷卻至環境;帳本反向運行 |
| `fano-i18n.js` | `term.codex` 雙語;codex 指令現已在地化 |
| `serve.py` | `.wasm`/`.json`/`.html` 加 `Cache-Control: no-store` — 即時成品不取舊 |
| `philotic-probe.mjs` | **相關性優於位移範式之實線實驗** — 具儀錶之 TCP 管道:4096 輪相關於零位元組線上達成;竄改不傳任何位元;真送「HELLO」實費 5 位元組。findings.json 新增 PHILOTIC 隊;追加 `qet-mandatory-classical-leg` 探針 — 量子能量傳送之 α 位元必經實線,免費相關通道載不動能量;+NOTED `hydrogen-clock-baseline` — 21 公分線供無握手時隙排程;+NOTED `cmb-noise-floor` — 普朗克佔據數於熱噪底上衰減 QET;+3 NOTED:聲子屏蔽相干預算、波函數相位圖、校驗對合(E=mc^2<->i<->E=mc^-2 自逆結構) |
| `philotic-cluster.mjs` | **真實 docker WAN 實驗室上之量子通訊** — e1→w1 種子跨損傷邊緣投遞(~1.5 秒);4096 輪相關收件匣增量為零;QET α 位元實測送達;洛斯密特回聲時間反演見證(薩里 2025)。含 `--local` 備援 | docker WAN 全綠 | +2 階段:`constraint-web-agreement`(4 節點種子,6 對 1024/1024 全同)與 `constraint-battery` — PHYSICAL/STRUCTURAL/ARTIFICIAL 三類完整分類於實網上驗證 |
| `nosignal-break.mjs` | **BREAKER 隊:無訊號定理紅隊攻擊** — 5 路實測攻擊:被動通道(封鎖,容量 0)、時序通道(通道 — 可用但耗線上位元組)、後選擇幻象(封鎖 — 共享隨機非訊號)、竊聽加入(封鎖 — 50.7% 機率)、基底偏壓(zig 驗證)、既設載波(封鎖 — 已點亮串流上訊號位元仍付 177µs 航程與 1 線上位元組;索末菲–布里淵波前 = c;zig `frontVelocityMilli`/`infoVelocityMilli`/`dcCarrierBits`,Wang-2000 約 333c 群速仍受前緣所限)、膨脹場(zig `expandingDeliveryTicks`:度規膨脹僅致延遲;殼層比率 h=67‰ 時視界恰在基胞 — 15 稜可達,梯級 {16,32,62,128,256} 皆返 null)。發現真實模擬層錯誤:JS sm64 浮點截斷致串流退化 | 獨立執行 | 新 — 定理通過所有已實裝攻擊;JS 串流因攻擊而強化 |
| `carrier-flight.mjs` | **WAN 規模之最終攻擊** — 16 位元組載波經損傷邊緣點亮 e1→w1;既設串流上之訊號位元實測 375/379/383 ms 航程。傳播耗時按每次轉變計付,絕非按鏈路一次付清。判定 BLOCKED,立案 `BREAK-05-WAN` | docker WAN | 新 — 最強之現場證詞:光束可常亮,其變化仍以前緣速度而行 |
