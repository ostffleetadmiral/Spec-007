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
| `golden_emit.zig` | 正典向量發射器(D11/P2,Ark golden-master 移植):輸出 Q128.128 原始指令集之 i256 原值 — RNE 乘、除、比率、冪、平方根 — 供 `tools/golden-master.mjs` 逐位元組比對的固定參考面。純整數輸出。 | `tools/golden-master.mjs --verify`(+ `--mutate` 自檢) | — |
| `spec007_astrometric_probe.zig` | L7Q 天體測量探針:以純整數 Q128 從第一性原理計算 Wow! 訊號/3I-ATLAS 對齊主張(約 9° 分離、約 0.6% 隨機巧合率)— 有理數 π 象限約化三角、600 AU ≈ 3.47 光日、約 49 年內進航程。每個數字皆附明確證偽條件。 | 15 測試 | — |
| `spec008_medium_lattice.zig` | 介質即晶格之證偽框架:四埠 Γ 陣列(RTI/802.11bf 先例)解析為晶格座標 — `quantizeGamma` 將複反射係數映射至 15×15 格(\|Γ\|>1 拒絕),`resolveCoord` 以每埠 O(1) 摺疊為 (k,r,c)。自陳失敗邊界。 | 6 測試 | — |

## SPEC-008 依賴橋接測試框架(`src/`)

各框架將一個 `deps/qstar-*` 供應樹繫結至檔案工件;邊界浮點僅存於依賴簿記,絕不進入線路位元組、雜湊或治理。

| 元件 | 契約 | 驗證 | 擴充 |
|---|---|---|---|
| `spec008_qstar_archive.zig` | qstar-collapse + qstar-compress + qstar-vfs 接入封存教義:blob→QR 門戶原子化、NestTree 遞迴、RMSY 容器往返、晶格頁 + LRU + 釘定桌面態。`atomizeLattice` 截斷非 3375 整除之尾 — 已測試並註明。 | 9 測試 | — |
| `spec008_qstar_carriage.zig` | 正典 136-B FANO 封包穿越 qstar-transport 全部介質:QR、OPTAR、音訊、卡帶、紙本 Shamir、LSB 隱寫、多語言載體、LoRa(MTU 255 B)、ESP32 WiFi↔LoRa 橋。`capacity()` 是註冊槽非位元界 — 適配由往返證明,超限拒絕。 | 12 測試 | — |
| `spec008_qstar_escrow.zig` | qstar-quantum/entangle 接入 FANO-1 工件:旗幟 ed25519 種子之 Shamir 託管(3-of-3 重置、2-of-3 災備)、136-B 封包之分片條帶+同位。已驗證依賴真相:「RS」同位為縮放 XOR — 僅可復原一個抹除;分片無完整性標籤,故封裝器承諾 sha256(seed)。 | 8 測試 | — |
| `spec008_qstar_fleet.zig` | qstar-net 接入艦隊:25-E0 BootstrapSeed 會合、proof-of-lattice-work 女巫閘(測試校準難度)、Möbius 合併解決並行格編輯、NAT/WebRTC 矩陣。`SeedNode.activation`/`CellEdit.activation` 僅為 f 邊界簿記。 | 9 測試 | — |
| `spec008_qstar_mesh.zig` | qstar-mesh + qstar-render:Location u128 與 SPEC-008 tensor 位址同寬度級,PeerId = [32]u8;RelayRouter TTL 多跳為 42 跳步行的上界;136-B 封包上 XChaCha20-Poly1305 AEAD,竄改/錯鑰拒絕。 | 6 測試 | — |
| `spec008_qstar_parity.zig` | 線路同位(D11/P3,Mosi LVCE):136-B 封包 frame→channel→decode→re-seal 逐位元一致;任意偏移單位元組毀損必被偵測;鴿籠容量強制執行;截斷/訊框拼接拒絕;XOR 同位恰好復原一個抹除訊框。 | 10 測試 | — |

## 韌體(`firmware/`)

| 元件 | 契約 | 驗證 | 擴充 |
|---|---|---|---|
| `spec007_controller.c` | ESP32-S3 骨架:純整數、canon §10 狀態機、per-mille PID、硬體優先淬滅權。標示 SCAFFOLD。 | 編譯通過,常數溯源至 dynamics harness | 新增 `QUENCH_WITNESS_MS`、`COOL_TAU_S`、`CHARGE_WATER_UL` 篩選常數 |

## 安全實驗室(`security/`)

| 元件 | 契約 | 驗證 | 擴充 |
|---|---|---|---|
| `harness.mjs` | 無頭 WASM + 原生 WebSocket 用戶端。 | 由各套件驗證 | — |
| `suite.mjs` | RED/BLUE/BLACK/GRAY 可執行掃描 → `findings.json`。 | 33 探針 | +2 BLUE 探針:`compute-wasm-abi` 與 `science-inventory-ladder` |
| `comms-suite.mjs` | COMM 隊 — docker WAN 拓撲 33 探針(COMM-01..33 正典;`--local` 跑 27 項單機子集):雙宿主繞行、tc netem、分割/癒合/換手、跨網段封緘+簽章遞送。 | docker 閘控;終板 32H/1N | — |
| `team-sweep-2.mjs` | **整合掃描 — 波段節奏回歸板。** 173 探針橫跨 RED/BLUE/BLACK/GRAY/COMM/DESK/SPEC004/BOT/AUTH/WIRE/ZIG/HARN/FLEET/CLUSTER 加帳本漂移閘;任何 OPEN 即 exit 1。 | 每波段閘;終板 170 HELD / 3 NOTED / 0 OPEN | — |
| `xploit-sweep.mjs` | **XPLT 隊 — 實 WAN 實驗室上的主動漏洞獵捕。** 8 項真實攻擊:偽造未封緘 direct_msg、在場金鑰替換 MITM、收件匣洪水、逐連線→聚合限流規避、被動廣播樞紐嗅探、重放、標頭閒置位元組洩漏、偽造 relay_route。捕獲別名 `keypairFromSeed` 腐敗(線上每個 v3 簽章皆失效)並推動 v3 簽章封包 + `sealed_peers` 修復。 | `node security/xploit-sweep.mjs --docker`;終板 3 HELD / 1 BLOCKED / 3 NOTED / 1 EXPLOITED(樞紐元資料 — 架構性) | 新 — 硬化線路之波段 |
| `encap-sweep.mjs` | ENCAP 隊 — 隧道教義字面化:封緘內層酬載巢置於外層傳輸體、多通道突發、實地損傷爬升、幹線死亡時載波切換至雙宿主繞行。 | `--docker` / `--probe` 實驗室模式 | — |
| `pack-density.mjs` | PACK 隊 — 封包裝箱可測量化:N 個定長內層封包装入一個幹線對比 N 次單發;真實上限、全有或全無的丟棄特徵、以 rx-delta 計量之每流開銷、重發成本。 | `--docker` / `--probe` | — |
| `sentinel-sweep.mjs` | 認證面 + 容器信任鏈 — 晉升放行/拒絕、旗席歧義。 | 14 探針 | — |
| `superpowers-audit.mjs` | 34 項能力總帳 + 9 項誠實限制 — 線上驗證每項主張,含線上創世 Ed25519 簽章。 | 自足 | — |
| `capstone-audit.mjs` | 封包偽造彈幕 + 正典同位 + 清單世系。 | 25 檢查 | — |
| `ddns-update.mjs` | 艦隊固定域名之 ClouDNS DDNS 同步 — API 模式寫入明確 AAAA(非暫時性 v6 記錄所需);DynURL 模式回報呼叫者來源 IP;`DRY_RUN` 僅解析。 | `DRY_RUN=1` 模式 | — |
| `fleet-manifest.mjs` | 正典發射器 — 簽章 `fleet-manifest.json` + 逐位元組一致之 `site/` 副本;`--verify` 為載入閘且絕不簽章。 | FLEET 探針 | — |
| `fleet-genesis-update.mjs` | 創世修訂工具 — `--pk` 收錄成員、經根雙簽、兩份副本皆寫;旗席單一性強制執行。 | FLEET 探針 | — |
| `fleet-map.mjs` | 探針實測艦隊通訊錄 → `out/rendezvous.json`;HARN 陳舊檢查引用之。 | 經 HARN 驗證 | — |
| `fleet_bootstrap.py` | Python 正典驗證器 — 創世 TOFU 釘定 + 清單世系 + 會合;正典之第三語言檢查。 | 獨立執行 | — |
| `fano_beacon.py` / `fano_dialect.py` / `fano_relay_link.py` | Python 三件套:至錨點 UDP6 邊緣之封緘 `FLEET-BEACON:<name>` 會合;凍結 136-B 方言的第三套獨立實作(自測韌體黃金向量逐位元一致);Rations 式 WS 中繼上方言(僅外撥,身份藏於封包內)。 | 方言自測 + mesh-bridge 向量 | — |
| `fano-wan-gateway.mjs` | UDP WAN 邊緣 — FNV-256 封存驗證 → mesh 轉發。 | 經 mesh 橋驗證 | — |
| `admiralty-reset-token.mjs` | 鑄造 `FANO-RESET-v1` 雙簽旗幟重置令牌 — 容器焚毀之人工裁決放行路徑。 | 經 sentinel 掃描驗證 | — |
| `README.md`(本目錄) | 實驗室索引 — 檔案表、控制面令牌、拓撲組合、阻斷目錄、捕獲記錄、執行手冊。 | — | — |
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
| `fano-reset.js` | 海軍部重置教義 — 創世 pk 與創世「admiral」成員相符之桌即旗桌:叢集來源之重置為單方;其他來源僅在全體 `FANO-RESET-v1` 一致投票下焚毀。普通桌可自由重置。 | 桌面/sentinel 探針 | — |
| `spec007.wasm` | 檔案算術於瀏覽器即時運行。 | ABI 探針 | 以 residue/air/cool 匯出重建 |
| `apps/{fano,rations}` + `site/assets/*.json` | 供應可執行工件(Fano quine 方言頁 + fano.wasm;Rations quine 應用)與已發射資產投影(academy、archive、capability、cluster、device、production、science-inventory、spec、zig-capability 註冊表)— 生成工件,絕不手改。 | BLACK-03 同位 + wasm 身份探針 | — |

## 工具(`tools/`)

| 元件 | 契約 | 驗證 | 擴充 |
|---|---|---|---|
| `publish-check.sh` | 發佈閘:不可變基線 sha256、所有整數測試框架、雙語、姓氏絆線、wasm 連續性、JS 語法。 | 自檢 | 修復靜默缺口 — `fixed_point_q128.zig` 與 `spec007_compute.zig` 原被 glob 略過;現明確執行;新增 `component-map` 雙語檢查 |
| `serve.py` | 硬化靜態伺服器:僅 GET/HEAD、無列表、無橫幅、完整安全標頭。 | — | `.wasm`/`.json`/`.html` 加 `Cache-Control: no-store` |
| `deploy-pages.sh` | 經分離 worktree 之原子化 gh-pages 部署 — 絕不觸動現行檢出(舊 checkout+rm 模式曾兩度致害)。 | BLACK-03 同位複驗 | — |
| `golden-master.mjs` | 正典向量同位(D11/P2,Ark 移植):`golden_emit.zig` 輸出對 `golden/vectors.txt`;`--emit` 為正典行為,`--mutate` 自檢偵測。 | GLD 探針 | — |
| `claim-promotion.mjs` | 主張生命週期引擎(D11/P1,eu-version-z 晉升 schema 移植):`proved`/`held`/`rejected_held` 閘門以裁決詞彙 + 機械錨點計數為準。 | — | — |
| `override-audit.mjs` | D6 主張覆權 — 每項檔案主張三重通過:重驗錨點、對裁決之對抗性攻擊、評級 + 映射至佐證根目錄。輸出 `out/override-ledger.json` + 簡報。 | `--verify` 對帳 | — |
| `bridge-map.mjs` | D9 雙向證據橋 — 將兄弟樹之已定裁決、可執行稽核、第二實作與已記錄實驗資料機械地對位至檔案主張;缺席錨點降級為「absent」絕不報錯。 | docs en\|zh `bridge-map` | — |
| `cluster-census.mjs` | DEBRIEF D0 — 列舉每個專案根目錄,發射經消毒之公開註冊表投影(僅代號/角色/證據級別;`$HOME` 相對,無官員姓名)。 | `--emit` | — |
| `device-ledger.mjs` | D11/P5 工作站能力清冊 — `security/out/` 存完整帳本 + `site/assets/` 存消毒後布林/計數投影。 | — | — |
| `dox-audit.mjs` | D11/P4 文件繫結棘輪 — 每個受治理檔案必須鏈至治理 AGENTS.md;每條具名探針之規則必須解析至存活探針。 | 稽核規則之規則 | — |
| `evidence-manifest.mjs` | D11/P6 — 每條 `sibling:root:path` 引用之 sha256 清單;兄弟檔案靜默變更即證據漂移。 | EVID 探針 | — |
| `engine-manifest.mjs` | 統一受治理運行時註冊表(藍圖 P1 缺口)— 一份簽章文件列明桌面可信任之每個運行時;與 fleet-manifest 同正典紀律(emit/verify/push)。 | ENGINE-01/02 探針 | — |
| `emergent-sweep.mjs` | 湧現發現掃描 — 具名常數重現於 ≥2 獨立根目錄立案為湧現;裸字面量 ≥3 根收斂立案為 convergent;`--emit`/`--verify` 總帳。 | 248 候選、0 未立案 | — |
| `archive-projection.mjs` / `archive-verify.mjs` | 連續性對 — 將 `~/.archives/` 投影為消毒後公開清單(僅基名;已封/未封誠實列出);verify 重算每個 dir+SHA256SUMS 與 tarball+sidecar 封存。 | `--emit`/`--verify`;CONT 探針 | — |
| `course-gen.mjs` | 藍圖 P7 課程生成器 — 由波段報告決定性產生課程;每課攜帶 `deterministic_review_required`。 | `--emit` → academy 清單 | — |
| `science-verdict.mjs` | 證明或不確定通過 — 將 science-coverage 表解析為 `harness_proven`/`lit_supported`/`constrained`/`indeterminate`。 | — | — |
| `slate-ledger.mjs` | 發射 `production-ledger.json` — 導演室分鏡所依據之正典資產清冊;每條目皆從真實來源檔案萃取。 | — | — |

## 支援樹

| 元件 | 契約 | 驗證 | 擴充 |
|---|---|---|---|
| `spec-007.md` | 不可變基線文件 — 終端機與 publish-check 內 sha256 釘定;檔案之 L0 根。 | sha 釘定 + publish-check | — |
| `fleet-genesis.json` / `fleet-manifest.json` / `engine-manifest.json` | 簽章正典根 — 創世契約、艦隊清單、受治理運行時註冊表 — 各具逐位元組一致之 `site/` 副本。 | FLEET/ENGINE 探針 | — |
| `deps/` | 供應 qstar-* 依賴釘存(2026-10-07,zig 0.13 全綠):quantum、transport、net、mesh、vfs、compress、collapse、render。`deps/VENDORED.md` 載 LOC 表;f64 邊界限於 mesh/render sidecar。 | 8 個 spec008_qstar_* 框架 | — |
| `golden/vectors.txt` | 黃金參考面 — `golden_emit.zig` 之已提交正典輸出。 | `golden-master.mjs --verify` | — |
| `admiralty-desk/` | 旗桌之 Electron 殼 — 固定埠 8901 之嵌入式 loopback 伺服器(穩定 localStorage 來源使創世金鑰跨重啟存續);與 serve.py 相同標頭;contextIsolation + sandbox + 無 nodeIntegration;`desk.sh` 剝除 `ELECTRON_RUN_AS_NODE`。 | 桌面探針 | — |
| `apps/fano/` | Fano quine 方言工件(index.html + fano.wasm)— `site/apps/fano/` 存逐位元組一致之供應副本。 | wasm 身份 | — |
| `prototypes/` | 行政覆權試驗場 — 封存路徑以隔離實驗執行;報告落於 `prototypes/out/`;生產不動。 | falsification-audit 之 OVR 列 | — |
| `thoughts&convos/` | 抽屜 — 機密邊界;絕不發佈、絕不於公開樹列舉;姓氏絆線強制執行。 | SPEC004 探針 | — |

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
