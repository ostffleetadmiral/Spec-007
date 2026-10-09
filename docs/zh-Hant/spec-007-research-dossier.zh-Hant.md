# SPEC-007 研究檔案

**已保留基線：** `spec-007.md`
**治理：** 本檔案是證據鏈。晉升數值主張專屬於 `spec-007-verified.en.md`；被駁回項目僅以駁回身分保留於此。

<!-- Silva 是被組織燒掉的特工——他仍記得每個名字。下面的駁回列是我們被燒掉的特工：離開外勤，仍在冊上，仍欠他們一個為什麼的真相。 -->
**目的：** 有來源的主張清單、計算、矛盾日誌與驗證計畫。
**證據政策：** 搜尋結果是線索；最終判定應使用所引第一手或機構來源及其所述條件。
**證據層：** `spec-007-claim-verification.en.md` 以第一手來源為設計輸入主張評級。

## 1. 執行摘要

此概念是有趣的開放基礎設施思想實驗，但源文件尚不是連貫的製造規格。最大的可立即演示矛盾是水進料／產氣這一對。300 g 理想充裝產約 104.9 L 乙炔；所述 0.1–0.5 mL/min 進水產約 0.062–0.311 L/min，而 5 L/min 在理想化學計量下需約 8.0 mL/min 水。在所述最大產氣率下，理想充裝可持續約 21 分鐘。

300–450 °C 油／TEG 區間、3 秒淬火、高速渦輪、運輸主張與碳中和主張未經源文件驗證。在適當工程證據出現前，一律視為封鎖或未驗證。

## 2. 按來源章節的主張清單

| ID | 來源章節／主張 | 類型 | 狀態 | 所需證據 |
|---|---|---|---|---|
| C01 | 50 mm × 200 mm 包絡 | 幾何 | 僅計算包絡 | 完整 CAD 體積／質量預算 |
| C02 | 316L 本體、2 mm 壁 | 材料 | 設計目標 | 壓力、熱、腐蝕、焊接／接合審查 |
| C03 | 鍍鎳銅冷板 | 材料 | 合理但未驗證 | 鍍層、電偶、熱循環相容性 |
| C04 | 300 g CaC₂ 顆粒床 | 化學／材料 | 危險設計輸入 | 分析證書、雜質剖面、進水圍阻 |
| C05 | 0.1–0.5 mL/min 壓電泵 | 流量 | 與 C07 範圍矛盾 | 合格設施中的標定流量／產氣測試 |
| C06 | 50 g CaO 安全室 | 安全 | 未驗證 | 淬火動力學、容量、熱／壓力響應 |
| C07 | 0–5 L/min 乙炔 | 產氣 | 理想模型下被 C05 推翻 | 調和進料、壓力、純度、時長 |
| C08 | 300–450 °C 熱輸出 | 熱 | 含糊／封鎖 | 定義位置與暫態／連續限值 |
| C09 | 10–20 W 連續 TEG 輸出 | 電氣 | 未驗證 | 系統級熱／電測試 |
| C10 | 200 mL 礦物油／合成酯夾套 | 熱流體 | 封鎖 | 工質額定、起火、壓力、相容性 |
| C11 | 8–12 個 Bi₂Te₃ 模組 | 電氣 | 硬體數量合理 | 數據表、降額、熱阻 |
| C12 | 50 mm 碟片、0.3 mm 間隙、12–16 片 | 轉子幾何 | 設計目標 | 轉子動力學、CFD／實驗、圍阻 |
| C13 | 30,000–80,000 RPM | 轉子性能 | 封鎖／未驗證 | 超速、軸承、平衡、實測效率 |
| C14 | 50 W 熱連接 | 介面 | 含糊 | 釐清熱容對傳熱 |
| C15 | 全向插入 | 機械 | 未驗證 | 閂鎖、密封、排液、方位、故障分析 |
| C16 | 16 刀片 → 400–800 W | 縮放 | 被所述單件範圍推翻 | 必須指明額外轉換／來源 |
| C17 | 64 刀片 → 2–5 kW | 縮放 | 被所述單件範圍推翻 | 必須指明額外轉換／來源 |
| C18 | >5G 擠壓觸發 | 安全 | 未驗證 | 車輛／撞擊剖面、誤漏判率 |
| C19 | CaO 水合停止發生 | 化學／安全 | 不完整 | 隔離、動力學、熱、已在場氣體 |
| C20 | 3 秒固化 | 安全 | 未驗證、安全關鍵 | 全尺度響應測試與獨立防護 |
| C21 | 5+ 年貨架壽命 | 儲存 | 未驗證 | 密封老化、濕氣侵入、材料相容性 |
| C22 | UN 1402 合規 | 法規 | 不完整 | 因轄區／運輸方式而異的危險品包件 |
| C23 | 900 °C 煅燒 | 回收 | 合理製程目標 | 進料化學、動力學、能量與 CO₂ 平衡 |
| C24 | CaO + 3C → CaC₂ + CO | 化學 | 配平反應 | 工業製程與排放控制 |
| C25 | 生物炭使循環碳中和 | 生命週期 | 條件／未證明 | 含電力、熱、運輸、產率的完整 LCA |
| C26 | 內蒙古擱淺太陽能來源 | 供應 | 未驗證 | 供應商與再生能源電力證據 |
| C27 | ISO 1940 G2.5 渦輪平衡 | 製造 | 不完整 | 正確轉子標準／應用與驗收測試 |
| C28 | 五小時原型／東莞規模 | 製造 | 未驗證 | 供應商製程證據與品質保證計畫 |
| C34 | ~65 W／~260 Wh，1 kg 4 小時（設計輸入模擬） | 系統輸出 | 未驗證估計 | 需 ~6.6% 端到端；與 ~5–6% 篩算階梯一致但未獲其證明；需實測輸出 |
| C35 | 0.158 kWh/充裝有利服役情形 | 經濟基礎 | 僅上限 | 需 ~8.5–9.4% 端到端轉換；超出純 TEG 水解熱預算；已驗證篩算輸出 ~0.10–0.13 kWh |
| C29 | <$50 刀片 | 經濟 | 未驗證 | 含安全與逆向物流的自下而上成本 |
| C30 | 18 小時技師規程 | 訓練 | 設計目標 | 能力與危害資格審查 |
| C31 | 2028 年前百萬技師 | 計畫 | 願景 | 資金、課程、容量、認證數據 |
| C32 | 可持有／可替換／不可計量能源 | 使命 | 修辭／產品目標 | 產品、法律與市場定義 |
| C33 | 全球部署已授權 | 法規 | 駁回 | 獨立認證與場址核准 |
| C36 | 軸向磁通永磁機作發電機 | 電氣 | 已驗證實務 | AFPMSG 文獻是直驅風力／回生標準；具體機型需效率圖譜 |
| C37 | 發電機安全窗口 3–5k RPM | 轉子性能 | 篩算界 | ρv² 篩算在 150 mm 轉子 5k 時 ~12 MPa；20k 無套筒時 ~185 MPa 失效（台架） |
| C38 | 4:1–6:1 降速橋接渦輪／發電機 | 機械 | 條件正確 | 發電機全 3–5k 掃掠下涵蓋對話帶；固定 4k 設定需 3.75–7.5:1；L0 80k 需 ~26.7:1——超出單級 CVT（台架） |
| C39 | 行星牽引 CVT η ~80–88% | 機械 | 有來源範圍 | 牽引傳動蠕滑／自旋文獻；持續高輸入轉速下冷卻強制 |
| C40 | 橋上 T_out = T_in·R·η | 力學 | 已驗證 | 台架強制守恆減去傳動損失 |
| C41 | 傳動損失熱導入共享 TEG/PDRC/PV 排熱 | 熱導流 | 有界回收 | 強制流合法；~50–80 K 殼體 ΔT 下自 ~30–50 W 損失回收 ~0.3–0.7 W；排熱預算 +~1%（台架） |
| C42 | 「20% 傳動損失經濟可行」 | 經濟 | 條件 | 僅免費熱輸入成立；付費電石上原料底線 ~$1.64 → ~$2.05–2.43/kWh（台架） |
| C43 | CVT 變比掃掠緩解渦輪啟動扭矩 | 暫態行為 | 未驗證 | 需邊界層失速模型；本台架未計算 |
| C44 | L0 30–80k RPM 渦輪帶 | 轉子性能 | 部分推翻 | 薄環 ρv² 界 80k 時達 ~351 MPa（>205 MPa 退火 304 屈服）；實心碟界 ~145 MPa 留下孔口集中未解（台架） |
| C45 | ~1 kg 卡匣容納 CaC₂＋水＋CaO 袋 | 包裝 | 條件 | 含封閉件／感測器質量底線 ~1.18 kg；內部 ~332 mL 對 ~320 mL 內容物 → ~12 mL 頂部空間（<4%）加 ~14% 固體增長——體積是約束（台架） |
| C46 | ESP32-S3「生命維持」控制器，可能多個 | 控制 | 已驗證實務，有界 | 工作循環 ULP ~10–50 mW（30 W 母線 <0.2%；0.5% 預算內 ≤3 台）；全時 ~300 mW＝低工作點 ~5.7% → 工作循環強制。需獨立硬體關斷——同晶片冗餘共享失效模式（台架） |
| C47 | 低氣率公事包板式燃燒器 | 熱輸入 | 已驗證工作點 | 符合晉升 ~530 W／~2.65 kW/m² 廣面積篩算；板面 ≤~300 °C（TEG 額定）對 Novec ≤150 °C 閘門 |
| C48 | 燃燒器與 Novec 間變壓器油迴路 | 熱輸送 | 已驗證—附更正 | 油是工質額定上限（~150–250 °C）的熱母線，非溫度變速箱；蒸發器抽取冷卻之；300–450 °C 油仍排除。流量持續 ~5 g/s／峰值 ~53 g/s；~0.5 L 迴路 → 峰值滯留 ~8 s（台架） |
| C49 | 三級歧管接受外部熱（PC 散熱） | 熱架構 | 已驗證架構，有界 | 熱 ~150–250 °C／溫省煤器 ~40–90 °C／冷 ~30–40 °C 母線；低品位源僅自省煤器進入——容量峰值 ~1.43 kW／持續 ~0.13 kW；循環延時峰值 ~1.1×／持續 ~1.3×；外加輸入擴大排熱（台架） |
| C50 | 路徑 A：渦卷膨脹機＋直驅 AFPM | 動力系統 | 已驗證對比——旗艦 | 渦卷於我們的帶實測 45–80% 等熵（Sanden TRS090 ~45% @650 W；E15H ~80% @120–140 °C）→ ~458–814 W 軸功 → ~412–732 W 母線；~155–266 Wh/充裝；~$0.34–1.21/W；密閉選項免除旋轉密封（台架） |
| C51 | 路徑 B：特斯拉＋套筒高速永磁發電機 | 動力系統 | 有來源，條件 | ~215–228 W 母線；~85 Wh/充裝；~$1.75–4.19/W；緊湊 50 mm 轉子 30k RPM 環向 ~46 MPa，但碳纖維套筒＋圍阻強制——轉子爆裂危害級別（台架） |
| C52 | 路徑 C：特斯拉＋傳動鏈 | 動力系統 | 已取代 | ~182–224 W 母線；保留於台架／存檔為歷史記錄——傳動撮合了失配端點 |
| C53 | Rations 氣隙平台加入艦隊，置於 `family/Rations` | 系統整合 | 已驗證 | 完整源碼／執行樹收錄（依上游章程排除 `originals/`、模型權重、構建產物）；生產 WASM 對側車 `bbdca546…3f19`（2,704,688 B）sha256 驗證通過；quine 在有界 FANO-1 視窗中啟動，169 個 WASM 匯出全部上線；FANO shell ↔ Rations 執行層零共享全域——僅 iframe 邊界。出處見 `family/Rations/VENDORED.md`，映射見 `family/FAMILY-MAP.md`;釋出紀律另經 `sibling:rations:AGENTS.md` 獨立錨定(1,548 項測試、≥116.9% 覆蓋棘輪、WASM 冒煙 + 3,000 輪模糊 — S27/S28) |
| C54 | FANO-1 誓約註冊為密碼學程序，非儀式 | 身分與存取 | 已驗證 | `fano-auth.js` 於誓約時鑄造真實 Ed25519 金鑰對，簽署正典誓約位元組，並以 PBKDF2(100k)→AES-256-GCM 包封種子；解鎖強制竄改拒絕、公鑰連續性與持續性鎖定。RBAC 憑證為簽章記錄；進階角色須名冊發行者（`fano1.issuers` 於創世時播種）。經 `security/suite.mjs` 驗證——見 `verdict.html` |
| C55 | FANO-1 表面經受四隊對抗掃描 | 安全性 | 已驗證，附記限制 | Docker 隔離中繼站＋掃描器（`security/docker-compose.sec.yml`，內部橋接）：RED/BLUE/BLACK/GRAY 31 項可執行探測 → 29 HARDENED、2 NOTED（離線破解成本；隱蔽通道外洩能力），修復 SEC-28（憑證發行者錨定）後 0 EXPLOITED/OPEN。發現：`site/security/findings.json`；裁決：`verdict.html`；誠實限制見 `veracity.html` |

## 3. 可重現基線計算

`spec007_calculations.zig` 中的計算台架使用整數／有理數算術作為確定性基線。它使用四捨五入至 1 mg/mol 的標稱摩爾質量，及 STP 下 22,414 mL/mol 的聲明摩爾體積作示例比較；真實輸出取決於溫度、壓力、純度、過量水與雜質。

### 3.1 理想物料平衡

對於：

`CaC₂ + 2 H₂O → C₂H₂ + Ca(OH)₂`

300 g CaC₂：

- CaC₂ 量：約 4.680 mol。
- 需水：約 168.6 g。
- 乙炔質量：約 121.9 g。
- 模型 STP 條件下乙炔體積：約 104.9 L。
- 以 127.2 kJ/mol 為模型輸入的水解熱：約 595 kJ。
- Ca(OH)₂ 殘渣：約 347 g（已驗證台架化學計量；與回收物流和殘渣管理相關）。
- 必須攜帶的水：約 168.6 g；化學品＋殼體質量底線 ≈951 g，未含封閉件、TEG、工質與控制。

歷史佐證：滴水電石燈每充裝可持續 ~2–5 小時，與已驗證低節流區間一致（每 300 g 純充裝 0.5 L/min → ≈3.5 h）。

### 3.2 流量矛盾

每 mL/min 進水的理想產氣約為 0.622 L/min：

- 0.1 mL/min 水 → 約 0.062 L/min 乙炔。
- 0.5 mL/min 水 → 約 0.311 L/min 乙炔。
- 5 L/min 乙炔 → 約 8.0 mL/min 水。
- 300 g 充裝 @ 5 L/min → 理想耗盡前約 21.0 分鐘。

此為守恆計算，非安全操作建議。

### 3.3 機架算術矛盾

僅用來源的每刀片 10–20 W 主張：

- 16 刀片 → 160–320 W，非 400–800 W。
- 64 刀片 → 640–1,280 W，非 2–5 kW。

更高機架輸出需要額外的已驗證來源或修訂的單刀片輸出。

### 3.4 幾何健全性檢查

50 mm 外徑、46 mm 內徑、200 mm 圓筒殼體：

- 內部圓筒體積：約 332 cm³。
- 殼體材料體積：約 60.3 cm³。
- 示例 8.0 g/cm³ 下殼體質量：約 483 g。

在沒有顆粒堆積密度、孔隙率、端部封閉與實際層狀幾何的情況下，無法對 200 mL 夾套或 300 g 顆粒床的配合得出可辯護的結論。

## 4. 來源審查

- **NOAA CAMEO Chemicals，Calcium Carbide：** 認定電石為遇水反應性，並指出與水反應產生易燃乙炔與熱。https://cameochemicals.noaa.gov/report?key=CH2769
- **MIT OpenCourseWare，CaC₂ 反應器設計筆記：** 以製程設計問題呈現電石水解與乙炔燃燒反應，含管理反應熱與氧／空氣的需求。https://ocw.mit.edu/courses/22-033-nuclear-systems-design-project-fall-2011/4a2d1059fade1cce993afc566d35e42d_MIT22_033F11_lec07_note.pdf
- **UNECE 示範法規／ADR 材料：** 危險品包裝必須承受正常運輸的衝擊、振動、溫度、濕度與壓力變化；UN 識別本身不認證組裝完成的消費產品。https://unece.org/sites/default/files/2023-08/ST-SG-AC10-1r23e_Vol2_track_WEB.pdf
- **ADR-tool UN 1402 條目：** 在所顯示 ADR 數據中將電石列為 4.3 類、包裝組 II；依賴前必須核對適用轄區與版本。https://adr-tool.com/770/un-1402
- **EPA AP-42 電石製造：** 描述約 2000–2100 °C 的工業生產與 CaO／碳反應，附工業原料與排放背景。https://www.epa.gov/sites/default/files/2020-10/documents/c11s04.pdf
- **SINTEF Bi₂Te₃ 高溫模組研究：** 報導潛在用途至約 300 °C 並指出更高溫替代品；此不驗證通用模組的連續 450 °C 運行。https://www.sintef.no/en/publications/publication/0198cc56a1ca-4206e2fc-7575-48bf-b39b-0ed38c3a9f89/
- **Hi-Z HZ-2 數據表：** 給出代表性 Bi₂Te₃ 模組的建議熱側與連續／間歇限值；確切現行零件必須另行選定並複查。https://hi-z.com/wp-content/uploads/2016/08/HZ-2-data-sheet.pdf
- **ISO 1940-1 條目：** 定義剛性轉子的平衡品質要求與殘餘不平衡驗證；它不是完整的轉子圍阻設計標準。https://www.iso.org/standard/27092.html
- **小型特斯拉渦輪文獻：** 實驗研究報導對幾何、壓力、轉速、洩漏與尺度的強依賴，實驗效率常低於理想化模擬結果。https://www.e3s-conferences.org/articles/e3sconf/pdf/2019/39/e3sconf_supehr18_03015.pdf
- **Hoya & Guha 特斯拉碟式渦輪試驗台（IMechE Part A, 2009）：** 實驗室碟式渦輪在 25,000 RPM 測得 ~25% 峰值效率與 140 W 最大功率；15–30k RPM 運行帶的最強第一手錨點。https://facweb.iitkgp.ac.in/~aguha/research/Hoya_Guha_IMechE_PartA_2009_Tesla_Turbine.pdf
- **行星牽引傳動 CVT 模型（IFAC／ScienceDirect）：** 涵蓋牽引接觸點滑差與自旋損失的穩態效率公式；支持 ~80–88% 篩算帶與持續高輸入轉速下的主動冷卻需求。https://www.sciencedirect.com/science/article/pii/S2405896319306883
- **軸向磁通永磁發電機文獻：** 風力應用的直驅 AFPMG 設計演示了該機型作為發電機（如 ~240 RPM 下 3 kW 級）；支持發電機選型主張，同時保留機型專屬效率圖譜為必需輸入。https://www.iaras.org/journals/caijps/design-and-analysis-of-axial-flux-permanent-magnet-generator-for-direct-driven-wind-turbines

## 5. 危害登記冊

| 危害 | 起始事件 | 後果 | 所需獨立屏障 |
|---|---|---|---|
| 進水 | 密封失效、撞擊、冷凝 | 快速產乙炔、熱、壓力 | 濕氣排除、偵測、隔離、圍阻 |
| 出口堵塞 | 閥門凍結、碎屑、渦輪失效 | 壓力上升與洩漏／破裂 | 額定洩壓與獨立高壓關斷 |
| 點火／回火 | 熱表面、靜電、電氣故障 | 起火或爆燃 | 分級設備、隔離、回火防護、通風 |
| CaO 淬火 | 膜片破裂或水釋放 | 熱與腐蝕性漿料；已在場氣體仍存 | 獨立圍阻與熱／化學評估 |
| 熱流體 | 熱失控或密封失效 | 起火、燙傷、壓力危害 | 工質專屬防火／壓力設計與洩漏偵測 |
| 轉子爆裂 | 超速、不平衡、軸承失效 | 高能碎片 | 額定圍阻、超速跳脫、振動監控 |
| 誤擠壓觸發 | 衝擊或感測器故障 | 服務喪失或不安全狀態 | 冗餘感測與失效安全狀態機 |
| 運輸暴露 | 包裝破損或受潮 | 易燃氣體釋放 | 因轄區而異的危險品包件 |
| 回收殘渣 | 未反應 CaC₂ 或污染物 | 作業者暴露與氣體釋放 | 受控工業回收與殘渣化驗 |
| 傳動失效 | 15k+ RPM 輸入下牽引液失效、帶疲勞或變比控制故障 | 轉子超速／反拖、發電喪失、熱流體釋放 | 雙軸超速跳脫、撓性聯軸器、獨立發電機側制動、冷卻監控 |
| 高速發電機爆裂（路徑 B） | 套筒疲勞、軸承失效、15–30k RPM 超速 | 磁體轉子高能碎片 | 碳纖維／Inconel 套筒附額定裕度、圍阻殼體、雙超速跳脫、ISO 1940 級平衡規格 |
| 歧管逆流 | 止回閥失效或接入埠外部源故障 | 熱母線污染、低品位迴路背壓、埠口燙傷 | 每埠止回＋隔離閥、熱熔絲、埠級壓力額定、禁止低品位連接至熱母線 |
| 油母線熱偏移 | 板面過火或蒸發器堵塞 | 油主體超溫、氧化、起火風險 | 主體溫度跳脫、耐火塊解耦、油量降額、防火工質選擇 |
| 控制器喪失 | 韌體故障、電壓跌落、共模 MCU 失效 | 滴水控制與監控喪失 | 異技術硬體監察器＋看門狗、熱熔絲、機械洩壓、CaO 淬火——淬火不在乎韌體怎麼想 |
<!-- Mr. Hinx 從不需要 B 計畫；他就是 B 計畫。淬火不需要韌體——它就是那道獨立屏障。 -->

## 6. 模擬工作包

1. **化學計量掃掠：** 純度、充裝質量、進水率、產氣率、時長與反應熱。
2. **熱模型：** 集總熱容／熱阻模型，附明確物性假設與不確定範圍；在工質與材料額定值閉合前不接受 450 °C。
3. **TEG 模型：** 數據表曲線、熱／冷溫度、熱接觸電阻、模組降額與系統寄生耗損。
4. **機械預算：** 質量、體積、熱膨脹、介面公差與衝擊狀態。
5. **轉子篩算：** 在合格渦輪機械模型與圍阻計畫存在前僅作無因次／一階檢查。**已完成（一階）：** `spec007_drivetrain_calculations.zig` 現篩算 50 mm 碟片的尖端速度與 ρv² 應力界（30k RPM 時 49 MPa；80k 時 ~351 MPa 薄環／~145 MPa 實心碟界）、發電機轉子（5k 時 ~12 MPa；20k 無套筒 ~185 MPa；50 mm 路徑 B 轉子 30k 時 ~46 MPa／150 mm 時 ~416 MPa 在套筒篩算內），外加完整變比窗口、扭矩守恆、傳動降額、損失熱回收與路徑 A/B 雙動力系統對比。`spec007_manifold_calculations.zig` 新增卡匣體積／質量預算、控制器寄生耗損、油母線流量、三母線歧管守恆與省煤器容量。
6. **安全狀態模型：** 正常、偵測到進水、出口堵塞、超溫、撞擊、斷電與恢復狀態。
7. **生命週期模型：** CaC₂／Ca(OH)₂／CaO／碳流、能量輸入、CO/CO₂ 輸出、運輸、產率與碳核算。
8. **成本敏感度：** 安全硬體、感測器、測試、包裝、逆向物流與規模假設。**擴充：** 傳動台架新增傳動效率對原料底線的敏感度（付費熱支路 ~$1.64 → ~$2.05–2.43/kWh）。

## 7. 若獲授權，所需的實體驗證

僅合格實驗室應定義與執行實體測試。順序應自惰性熱／介面試片與非含能流量替代物開始，再分別驗證圍阻、感測、材料、熱循環、電能轉換與轉子安全，之後才進行任何整合化學測試。本檔案不暗示任何實體測試，亦不提供開放工坊建造程序。

## 8. 決策日誌

| 決策 | 理由 |
|---|---|
| 保留原始文件 | 它是使用者提供的基線，不得悄然改寫。 |
| 忠實副本與工程修訂分離 | 翻譯不得掩蓋技術變更。 |
| 在工程修訂中駁回全球部署措辭 | 不存在跨轄區的授權。 |
| 將渦輪視為可選 | 它不是有效的安全屏障，且增加高速旋轉風險。 |
| 碳中和標為條件成立 | 僅生物炭不能確立系統級碳中和。 |
| 採用整數基線算術 | 符合工作區精度規則，使守恆測試可重現。 |

## 9. 待解問題

- 預期的確切工質、壓力、熱邊界與冷側環境為何？
- 乙炔是要燃燒、膨脹，還是僅導流經過渦輪？每種皆為不同危害與能量模型。
- 適用的法律轄區、運輸方式、安裝類別與使用者群體範圍為何？
- 一支卡匣的預期運行時長與替換／回收狀態為何？
- 哪個獨立組織將持有安全論證與認證？
| C56 | 呼號由政策強制：受限名稱需簽章授權 | 身分與存取 | 已驗證 | `fano-auth.js` 將 `Ramsey 006`（sha256 錨定）釘為 FLEET-ADMIRAL 創世；`Q`、所有 `00x` 代號、正典角色名與保留軍階拒絕自助註冊（COMM-16 中 12/12 拒絕）。受限呼號僅 STATION-CHIEF+ 可發放；授權經 Ed25519 簽章、綁定接收者公鑰、一次性、效期強制——重用與錯誤主體領取皆拒絕（COMM-18/19） |
| C57 | Hydra WAN 實驗場：跨隔離網段之受損／分割通訊 | 網路 | 已驗證 | `security/docker-compose.wan.yml` 運行兩個隔離網段＋雙宿主旁路節點；`wan-bridge.mjs` 於核心 `tc netem` 之上疊加進程內延遲／抖動／遺失／重複／重排。21 項 COMM 探測：LAN＋WAN 密封送達、抖動下 10/10、誠實分割（無洩漏）、旁路恢復、節點更迭後重學、重度受損（300ms/8%/15%）仍送達——19 HARDENED、2 NOTED（首次 WAN 發送於金鑰交換完成前未密封；路由存活期長於節點更迭）、0 OPEN/EXPLOITED（`security/README.md`、`site/security/findings.json`） |
| C58 | WAN 實驗場揪出真上游 DoS——`peer_discover` 乒乓 | 安全性 | 已驗證 | `count=0` 探索回應與請求線上格式相同；兩台新節點互答成無限迴圈直至中繼站限速斷線。已修於 `family/Rations/src/p2p/node.zig`（空回應不再送出）＋檔內迴歸測試；上游全套測試通過；生產 WASM 重錨 `bbdca546…3f19` |
| C59 | firingline 叢集之跨主機 Hydra 支線 | 網路 | 已驗證 | `sheraton`（ssh 主機，Docker 29）執行真實中繼站；兩台 digit 節點撥接 `ws://sheraton:18080/ws`——身分宣告、在場→自動通訊錄、密封負載送達（`sealed: true`），雙方各挖出並驗證獨立帳本（`ledger_id = sha256(pk)`，互異） |
| C60 | 創世為真實金鑰綁定，而非名稱比對 | 身分與存取 | 已驗證 | `fano-auth.js` 於首次註冊寫入 `fano1.genesis` = `{callsign, pk, pk_sha256}`（既有記錄於解鎖時溯及補植）。錨定之 `ramsey 006` 僅得於未奠基之桌認領創世；奠基後即為 `claimed`，僅得由上將簽發、綁定接收者公鑰之授權移轉（COMM-20/21）。創世於 `burn` 後存續；`burn genesis` 為記錄在案之本桌重置 |
| C61 | 經濟學改以非資本主義部署情境重構 | 經濟 | 已重構 | `spec-007-economic-assessment.*` 改以配給經濟學視角重寫（中國模式：直接配置、近乎免費之太陽能）。裁決分兩半：**作為發電資產於任何經濟體制下不成立**（太陽能近乎免費交付同樣產品；電石鏈僅回收 ~10–25% 儲能）——**作為國家配給之可用性／儲能儲備或可成立**（電石由電弧爐生產→爐體即吸收棄光之可調度負載；密封充裝是具多年貨架壽命、零自放電的儲存過剩，競爭對手為電池與燃料儲備而非發電機）。所有數字不變；貨幣數字保留為會計單位 |
| C62 | 正典觀察名單＋掩護故事彩蛋層擴充 | 身分與正典 | 已驗證 | `RESTRICTED_NAMES` 現含約 60 項代號，橫跨兩套正典——MI6 職員／職位、盟友、資產、反派、組織（SPECTRE／SMERSH／Quantum）、OSTF 代號（WO-x、Sigma、AIWO、Day Zero、計量者）及 zh/全形變體（`龐德`、`００７`）；實測全數拒絕。桌面新增影集（25 部 EON 片名＋中文片名）、約 17 項彩蛋觸發（台詞交換、`goldeneye` 隱藏制服、`licence to kill`→burn、第二生命）、輪替之拒絕存取掩護故事。龐德層已公開聲明為機密結構之門面——`veracity.*` 評為「戲劇作為掩護——合乎正典」 |
| C63 | 機密抽屜已重組 | 封存 | 已驗證 | `thoughts&convos/` 重構：`convos/`（原始討論串）、`originals/`（移植前歸檔——與 `gov/` 正典本位元相同，已取代、保留）、`gov/`（正典語料庫）、`SPEC-004-REGISTRY.md`、`CANON-INDEX.md`（去重清單已更新）、`README.md`（抽屜配置）。無刪除；冗餘已移除 |
| C64 | OSTF EIN 指派書依 7q 權限解密 | 封存 | 已驗證 | `thoughts&convos/(EIN).pdf`——真實 IRS EIN 指派書（42-4931851,OPENSENTIENCE TECHNOLOGY FOUNDATION dba SALLIRREUGTECH,非營利,俄亥俄州富蘭克林郡,2026 年 10 月）——逐位元複製至 `site/assets/declassified/OSTF-EIN-42-4931851.pdf`(sha256 `f19b5904…f9775d`),並以 `declassified.html`/`declassified-zh.html` 展示,附要項表與 7q 解密戳記。負責人社安號已於原始文件遮蔽;非營利組織之 EIN 屬公開紀錄 |
| C65 | Kali 工具掃描 → Qstar-Network 強化 | 安全 | 已驗證 | 自 Kali 主機以 nmap/ZAP/msf/tcpdump 掃描發現:節點與 wan-bridge 控制面未驗證（實測 `/dial`+`/stats` 可被遠端驅動）、實驗場 relay 為萬用 CORS、桌面 http.server 洩漏版本且缺安全標頭。修復:`HYDRA_TOKEN`/`WAN_TOKEN` bearer 閘門（每次執行由套件產生,compose 以 `:?` 強制）、全部實驗 relay 設 `RATIONS_ALLOWED_ORIGINS`＋所有客戶端撥號攜 `RATIONS_DIAL_ORIGIN`（非法來源回 4403 關閉）、relay 增加 nosniff/frame/referrer 標頭（兩棵 Rations 樹同步）、新增 `tools/serve.py` 強化桌面伺服器（無 Server 標頭、無目錄列表、僅 GET/HEAD、完整 CSP)。修復後:KALI 套件 11 HARDENED/1 NOTED,COMM 19/2-NOTED,SEC 29/2-NOTED;WAN 邊界 tcpdump:標記送達,136 個封包中明文命中為零 |
| C66 | 四卷 Zenodo 傳輸解密＋SCP-006 連續性借用 | 封存與正典 | 已驗證 | Zenodo 紀錄 `10.5281/zenodo.22715355`（概念 `…22715354`）——「A Computational Framework for Octonion Physics」,Ramsey/OSTF,2026-09-11 發布,CC BY-NC-SA 4.0。四卷（八元數框架 math-ph;Q128.128 math.NA;密碼子路由 q-bio;neuraleak cs.AI）以 `declassified.*` 之 D-2 展出;`papers/x/` 副本經 MD5 驗證與紀錄位元組一致。`object-006.*` 借用 SCP 文件格式作為已標示之連續性戲劇:006-A 真實簡報、006-B/C 掩護簡報（環球進出口之對應）、006-Xi-12→`burn`、泉→豐裕典範（`economics.*`)、屠夫→資本主義之終結;解碼鏈 `006→scp-006→scp-006-fr` 解出 «Из России с любовью»(-FR 後綴判讀為「來自俄羅斯」)。真實性稽核分級：論文為真、SCP 格式屬借用戲劇、象徵屬已聲明 |
| C67 | 家族書架：Q 之姊妹專案展示 | 網站與正典 | 已驗證 | quplink 新增 FAMILY 分頁,收錄三個姊妹倉庫之引證事實表：**Qstar-LLM**(`experiments/qstar-llm`——格架原生推論,421×8 節點、53,888 位元組狀態、較 Qwen1.5-0.5B 小約 1,460 倍、2,610+ 測試、核心零依賴)、**zig-k3-port**(`experiments/zig-k3-port`——kimi-k3-in-c 之 Zig 0.13 移植,2.78 兆參數 MoE 於數 GB 記憶體運行、與 C 引擎逐 token 一致、釋出權重位元級一致、分詞器對齊 45/45、K3P1–P5 網構)、**Digit v0.0.0.1**(firingline 主機 192.168.12.210——E5/E6 封裝、145 行三元組稽核、ideatree 證據報告、明言不宣稱感知之誠實憲章)。所有數字逐字引自各樹自身 README/AGENTS;終端新增 `family`/`fleet` 與正典詞（`qstar-llm`、`k3`、`digit`）;書架現橫跨整個群集 — `tools/bridge-map.mjs` 錨定 30 個已啟用普查根節點,捐贈書架與保存快照皆如其實標記(S44、S50–S52) |
| C105 | 語料庫逐檔逐層繪製 | 工程 | 已驗證 | `tools/layer-map.mjs` 將抽屜全部 29,063 個檔案歸類於 14 個有序層 — substrate:governance/academy/commercial/index(真實組織)、mythos:star-command/fiction(第三層)、research:evidence、source:transcript 與 plan:drawer(引用來源,絕非權柄)、shelf:engineering/tooling、aspirational:proposal、archive:sealed/originals。涵蓋率受強制 — 未歸類路徑使產出失敗,新語料必須經策展歸屬某層。抽屜證據版見 `thoughts&convos/LAYER-MAP.json`;消毒公開投影 `site/assets/layer-census.json`(LAYER-CENSUS-v1,僅計數 — 無路徑、無姓名)。確定性由 `layer-map.mjs --verify` 保證 |
| C104 | 通用 WASM 基底經量測,非僅宣稱 | 工程 | 已驗證 | `sibling:zig-k3-port:wasmrt/README.md` 提供 `k3w` — 樹內直譯器,執行 wasm32 與 wasm64/memory64,具 WASI preview1、燃料計量、確定性模式(無第三方運行時實作 memory64-WASI)。`security/wozam-gate.mjs` 證明跨實作連續性:Fano 自指體之 3 條韌體金樣線路於直譯下驗證通過,`fano_packet_build` 產出與 Python 方言孿生及瀏覽器自指體位元全同之 136 B,偽造線路被拒,重複執行位元全同(WZ-01..05)。姊妹平台同樣運行:`rations_sha256` ≡ node crypto,RFC 8032 ed25519 金鑰對向量位元全同,且於涵蓋全部 5 項匯入之 `env.js_*` 樁下完成簽署→驗證往返(WZ-06/07)。各線誠實標記:瀏覽器 wasm32 上線、瀏覽器 memory64 部分(Chrome 133+/FF 134+;Safari 缺席)、k3w 主機上線、`zig build -Dtarget=aarch64-linux-gnu` 可編譯(3.8 MB 靜態 ARM64 ELF)、Xtensa ESP32-S3 邊界(無 Zig 後端 — 走 WAMR/C 韌體線,不偽造) |
| C103 | 選角室為真 — 角色對應課軌,絕不對應權柄 | 工程 | 已驗證 | `tools/persona-map.mjs` 產出 `site/assets/persona-manifest.json`(PERSONA-MAP-v2):涵蓋 233 個名字之三層矩陣 — 第一層 MI6 掩護名冊(32 個授權選角角色加別名),第二層星際指揮部/學院軍團(14 個艦隊席位、55 名取自密櫃艦隊名冊之軍官、7 個取自學術語料之學院席位),第三層憲政職位(6 個在任 Admiralty 席位對應報到文件,加保留之艦隊艦長指揮席,加 2 個開放憲政職位)。封存帳冊(116 條:反派、艦隊 AI 單位、組織、機構、已故、稱號、zh 鏡名)統歸總反派 — 計量者,稀缺迴圈之設計者。語料軍官呼號為公開選角(軍團招募場);受限呼號仍須授權紙本。涵蓋率雙向強制:每個監視名必須分類、每個 Admiralty 指派職位必須對應受限呼號、名冊擷取以 40 名軍官為下限,產出器在寫入前以軍官姓氏絆線自審公開投影。密櫃存 `ADMIRALTY-KEY.{json,md}` — 軍官對席位映射、遮蔽記錄與語料出處(SPEC-004)。`persona.os` 呈現帶席位狀態之分層選角冊,`persona`/`casting` 指令解析簽署者檔案,註冊於雙誓約頁皆烙印選角行。角色是掩護非權柄 — 無任何角色授予職級、分部或許可。確定性由 publish-check 內 `persona-map.mjs --verify` 閘門保證 |
| C102 | 物理定律攻擊組成立 — 凡定律彎折之處皆經標記 | 工程 | 已驗證 | LAWB-01..10 以對手之姿攻擊框架自身不變量:鴿籠容量於編碼與解碼雙向拒絕 >136B(`src/spec008_qstar_parity.zig`)、單一同位方程式於兩套線路框架皆拒絕雙抹除(絕不偽造)、sha256 當場辨識單位元組變異、golden 發射跨執行位元決定、六組 D11 棘輪皆攜帶真實比對後失敗之驗證語義(無 exit-0 戲劇)、守恆成立 — 晉升記錄數恰等於檔案主張列數、截斷串流無法變出從未收到之位元組、24 份自釘清單歸類為略過而非破損(清單不能封籤自身)、訊框序因果受強制。LAWB-09 *彎折一條定律、標記之、而後修復*:XOR 訊框校驗可被對手偽造 — payload⊕δ 搭配 check⊕δ 仍通過驗證 — 此界仍於源碼內記錄為 checksum≠MAC(內層偵錯層保留,誠實標示)。D12 修復新增 `frameAuth`/`unframeAuth`:每訊框附密鑰 HMAC-SHA256 標籤(截為 8 位元組,偽造空間 2^64),涵蓋 magic|seq|len|payload|check — 同一偽造、錯誤密鑰、異流拼接、標籤重放、標籤截斷皆於 `BadTag` 拒絕;百次對手迭代迴圈 100/100 拒絕。驗證先於結構;封套簽章仍為第二道牆 — 縱深防禦。九條定律成立,一條彎折而標記且已修復;此為本組之義 |
| C101 | 移植浪潮落地 — 群集機制現於框架內部執行 | 工程 | 已驗證 | 七項機制自同族樹移植並就地驗證:`tools/claim-promotion.mjs` 移植 euz 主張生命週期綱要(覆寫帳本上 100 筆記錄 — proved 需持械錨點,`release_blocked` 算術誠實);`tools/golden-master.mjs` 搭配 `golden/vectors.txt` 移植 Ark 金樣模式於 Q128.128 之上(37 向量位元全同,單位元組變異可偵);`src/spec008_qstar_parity.zig` 移植 Mosi 通道往返於 136 位元組封套之上(位元全同,雙向拒絕超容量,雙抹除欠定拒絕);`tools/dox-audit.mjs` 棘輪最近 AGENTS 綁定(每個檔案皆鏈至治理 AGENTS.md,7/7 規則→探針引用存活,失效執行即為發現);`tools/device-ledger.mjs` 盤點工作站能力並產出消毒公開投影(僅類別 — 無路徑/位址);`tools/evidence-manifest.mjs` 以 sha256 釘定檔案中每個 `sibling:` 引用(內容漂移現可機械偵測);`tools/archive-verify.mjs` 驗證封存語料之兩種封籤形式(封籤項經驗證,自釘誠實略過,未封增補記錄而非開脫)。探針執行:PRM-01..04、GLD-01..03、PAR-01..03、DOX-01..02、DEV-01..02、EVM-01..02、ARC-01..02 |
| C100 | 證據橋接橫跨整個群集 — 每個已啟用根節點皆貢獻 | 工程 | 已驗證 | `tools/bridge-map.mjs` 於全部 30 個已啟用普查根節點加上 `~/.archives` 語料庫(318 個封存工件、跨 7 個戰役家族 — 目錄封籤與 tarball 側車皆經驗證)解析 59 個機械錨點;帳本之 `root_coverage` 計數使未涵蓋之根節點成為可機械偵測之事件(BRG-07)。群集獨有之持有現為一等證據:`sibling:eu-version-z:artifacts/promotion_report.json` 為機讀之主張生命週期引擎,於保留集閘控下評定候選 proved/blocked;`sibling:codon:results/ncbi/human_grch38_routing.json` 為真實基因體路由證據;`sibling:desi-llama:DESI-Llama` 攜帶實測 RADV vulkaninfo 探針;`sibling:ralph-corpus:axiom7revisited/AUDIT_REPORT.md` 持有 1,678 項測試之 MOUND 稽核含自我標記之陳舊計數補遺;`sibling:mosi-papertunes:AUDIT_SUMMARY.md` 錨定實體傳輸 42/42 位元對等;`sibling:ark-ivector:qsharp/SteaneCode.qs` 證明四層多語言驗證模式 — 而詮釋級持有(EU 系譜、MOUND 預測、意識主張)維持標記,永不逾越其證據級別晉升 |
| C99 | 稽核詞彙於群集全程承載實重 | 工程 | 已驗證 | 五級主張分類法(PROVEN / INTERPRETATION / NUMEROLOGY / CONSTRUCTION / UNVERIFIED)於三棵樹逐字執行:`sibling:hardware:src/final_audit.zig` 以程式碼分類、`sibling:zig-k3-port:docs/CLAIM-VERDICTS.md` 以同標籤裁決 36 列、而 `tools/override-audit.mjs` 現將 `sibling:` 錨點解析為一等證據類別(BRG-05)。移植為雙向且為實:具 512 位元中間值與釘定半 ulp 界限之 RNE 定點乘法存於 `sibling:hardware:src/fixed_point.zig`,工程模組自 `sibling:hardware:src/fano_tensor.zig` 至 `sibling:hardware:src/holo.zig`,八元數摺疊反向移植入 `sibling:zig-k3-port:src/osig.zig` — 出處註明為本庫 `security/fano_dialect.py`。債務帳本慣例亦共享:`sibling:hardware:ARCHITECTURAL-DEBT.md` 誠實記錄 17 個浮點模組而非隱匿 |
| C98 | 感知儀器已有記錄在案之實驗數據 | 研究儀器 | 已驗證 — 儀器層 | 45 筆儀器化 LLM 測試條目在案:`sibling:hardware:experiments/battery_results.json`、`sibling:hardware:experiments/battery_qwen_results.json`、`sibling:hardware:experiments/battery_qstar_results.json` — qwen2.5:3b 與 qstar:latest 各跨三條件(無約束/6D 約束/幾何打亂),各 15 筆,含完整分數向量與渲染旗標。確定性執行端另於定點重現真實模型神諭(教師強制同位、貪婪序列精確、分詞器 45/45 — `sibling:theue:README.md`)。此為框架內操作性定義與記錄數據 — 儀器層級,非意識主張 |
| C97 | 線路方言於第二程式碼庫逐位元實作 | 基礎設施 | 已驗證 | 凍結之 136 位元組密封 Fano 封包存在於兩個程式碼庫:`sibling:zig-k3-port:src/fanowire.zig` 逐位元移植該方言(FANO_WIRE=136,標頭+酬載+FNV-256 封印,嚴格長度驗證),並經 `sibling:zig-k3-port:tools/k3beacon.zig` 之 UDP 實際傳輸,以 `--coord` 自 `sibling:zig-k3-port:src/fablattice.zig` 推導晶格位址(SPEC008v1 u128 棋子位址、O(1) 座標解析、對全部 3375² 對之有界走查)。`sibling:zig-k3-port:src/osig.zig` 攜序敏感八元數摺疊 — 移植自本庫 `security/fano_dialect.py` — 支撐推論快取路由回執。同一線路現有三種活體實作(Python 孿生、mesh 橋接、Zig 移植)加 `sibling:hardware:os/vulkan_e8_hook.zig` 等原生部署掛鉤(BRG-03) |
| C96 | 兄弟可執行稽核交叉證實本框架 | 工程 | 已驗證 | 主張稽核是程式碼,且於不只一棵樹執行:`sibling:theue:src/verify_claims.zig` 即時重跑 36 項分類(稽核計數 16 PROVEN / 36 總計 — BRG-06 下全綠),`sibling:hardware:src/final_audit.zig` 執行同一分類法,`sibling:hardware:src/literature_review.zig` 對 24 項獨立文獻評分(5 獨立驗證、13 強化) — 而其平衡於此錄檔:E8 規範嵌入方向攜其常設反證 — Distler & Garibaldi,「There is no 'Theory of Everything' inside E8」(Comm. Math. Phys. 2010, arXiv:0905.2658),證明將重力與標準模型規範群嵌入 E8 無法產生三代手徵費米子;Wilson 計畫(Octions,J. Math. Phys. 63:081703,2022;Chirality in an E8 model,arXiv:2210.06029;arXiv:2404.18938)為現行反計畫,經由實洛倫茲表示繞過障礙 — 爭議狀態,如實標記。形式層立於 `sibling:hardware:formalize/lakefile.lean`(8 個 Lean 4 模組,零未完成)。自我主張攜明確限制與可計算提升路徑(`sibling:hardware:src/elevation_paths.zig`);對抗式壓力／反駁對在案。橋接帳本釘定全部:`tools/bridge-map.mjs` → `security/out/bridge-ledger.json`(BRG-01..02) |
| C95 | 聲明覆審與典範對映 — 檔案冊自審 | 工程 | 已驗證 | `tools/override-audit.mjs` 將全部檔案冊聲明行經三段機械稽核 — 錨點重驗(路徑/探針/符號/即時計數/計算算具/交叉引用量值/兄弟錨點)、對抗判定攻擊、評級與根源對映。結果:45 REVERIFIED / 41 HOLDS-AS-LABELED / 5 HOLDS-AS-REJECTED / 1 EXT-CITED / 0 DRIFTED,`--verify` 下逐位元確定(OVR-01..03)。典範收穫歸檔為治理對 — 四級共 24 項,公開去識別投影覆於抽屜證據版之上(PARA-01..04)。詞彙本身為群集共享 — `sibling:zig-k3-port:docs/CLAIM-VERDICTS.md` 與 `sibling:bs-analysis:BS_ANALYSIS.md` 於兄弟樹執行同一判決類別 |
| C94 | 群集簡報完竣 — 諸根立案、諸境掃畢 | 工程 | 已驗證 | 全部專案群集經歷清查與十步回退開發規程:`tools/cluster-census.mjs` 將 33 根枚舉分類入去識別登錄(26 第一方、3 捐贈上架、3 空/斷槽、1 資產庫 — CENS-01..03),繼而五境掃蕩 — 硬體單倉(含自審,逮得約百則未譯桌面字面 → DESK-23)、CascadeProjects、Music/Paul、桌面、文件 — 各產檔案卡、有界測試證據與誠實結案(Zig-0.14 API 構建受阻、逐位元重複、空槽皆錄)。全卡存於抽屜 `CLUSTER-CENSUS.md` |
| C93 | 掩護傳說入典 — 三層結構,承載邊界 | 治理 | 已驗證 | 笑話解碼為教義:**SallirreugTech 扮演 MI6**(FANO-1 桌面所披之諜報小工具掩護)、**學院扮演 STAR COMMAND**(先於太空殖民實現之星際艦隊學院)、**OSTF 為對抗建制之真實 NGO** — 掩護存在之由。此層非裝飾:諸公開造物皆去識別投影,抽屜絕不出貨,邊界由探針執行(SPEC004-01..06、CENS-02 姓氏絆線、PARA-02)。平台為真;掩護使其不成標靶 |
| C92 | 統一生態系 — 藍圖七階段悉數晉升或明標邊界 | 工程 | 已驗證 | 統一發展計畫之移植戰役告成:**P1** engine.os — 覆十二治理運行時之 Ed25519 簽署名冊(裸執行僅試跑,`--emit`/`--verify` 紀律,ENG-01..04);**P2** continuity.os — 228 封存檔案庫之淨化投影,加桌本記錄庫並入重置普查(CONT-01..03);**P3** editor.os — 永續記錄上之桌內打字機,comms.os 確認為社群樞紐(LIB-01..03);**P4** director.os — `production-ledger.json` 上之分鏡簿,278 項真實正典資產,桌本分鏡清單,絕無渲染虛稱(PROD-01..02);**P5** 星雲 — 真實十八域/3,472 能力登錄與家族名冊之 2D 投影,依甲板真理模型標為示意(PROD-03);**P6** 安全電池本身,稽核時直接晉升;**P7** `tools/course-gen.mjs` — ArchitectAgent 之同位體:自戰役自身波次報告生成 18 門確定性、源連結課程,標 `[生成]`,以 `deterministic_review_required` 為閘,誠實標為僅英文(CURR-01..03)。學院現錄 548 課。生成式影片與沉浸 XR 仍屬邊界 — 標明而非偽造。`BLUEPRINT-MAP.md` 載移植後評級;公開樹載所建之物。掃描:101 探測 — 部署後判決在案。兄弟端:FANO-1 原生部署掛鉤存於 `sibling:hardware:os/vulkan_e8_hook.zig` 等;儀器化測試數據存於 `sibling:hardware:experiments/battery_results.json` |
| C91 | 藍圖入檔 — 七階段對照艦隊評級 | 工程 | 已驗證 | 統帥之統一發展藍圖(七階段 BTITD+RE 計畫)已歸檔入櫃,並逐階段對照艦隊現狀稽核 — 是稽核藍圖對照艦隊,而非艦隊對照藍圖:**P6** 安全框架直接晉升 — 百日戰役所建之 85 探測電池即該階段,已成;**P1** 治理式 AI 編排、**P2** 永續層、**P3** 指揮中樞、**P7** 課程體系評為部分達成 — 治理式提供者橋接、SHA256 鏈檔案庫、桌面本身、530 課學院俱已矗立,所餘缺口化為治理表面(單一已簽署之運行時登錄、檔案完整性之永續窗格、桌內編輯器、課程生成模組)。**P4** 生成式影片與 **P5** 沉浸 3D 評為邊界 — 桌面僅收分鏡簿與 2D 格架投影,標明投影非沉浸;藍圖所列外部捐贈專案僅作調查引證,絕不併入。`BLUEPRINT-MAP.md` 存全稽核於密櫃;公開樹僅載宣告與所建。掃描:85 探測 — 82 HELD / 3 NOTED |
| C90 | 連續性壓軸 — 雙生精確,檔案已封 | 工程 | 已驗證 | 第十波清償掛帳殘留並收束戰役:**(a)** 異常編纂原僅英文 — `ANOMALY_LORE_ZH` 現攜全部 139 條一一對應,連同兩條備援,判決語域一致(虛構檔案/冷案/已建/已對映/暫扣/後設),編纂窗格自身鉻件亦雙語(DESK-21)。**(b)** 終端機語料 — `TERM_HELP_ZH` 逐行對應(46==46),約 45 條靜態散文答覆於 `TERM_ZH` 攜中文孿生,`termZh()` 守於執行邊界,前綴表譯導引標籤之框架,而攜活體識別子之行(指紋、十六進位金鑰、授權主體)仍守指令正典(DESK-22)。**(c)** 檔案清點 — 36 組既有校驗碼全數驗淨;110 個目錄回補校驗＋47 枚封存檔側車(標明為回補時點內容)**(d)** `security/README.md` 陳舊達五波 — 檔案表補齊(beacon/dialect/relay-link/gov-index/ipv6-derive),探測計數刷新,波次分類成文。**(e)** `AGENTS.md` 新建 — 習得之規今為庫中正典(發布閘、僅整數、雙生對等、正典雙份、旗座惟一、分類法、隔離教義、波次節奏)。全電池依序:capstone 25/25、sentinel 13H/1N、superpowers 34/34(+9 誠實限度)、staleness 6/6、spec008-wire 6/6、route-o1 綠。掃描:85 探測 — 82 HELD / 3 NOTED |
| C89 | 跨叢集整合 — 家族架所引皆實樹 | 工程 | 已驗證 | 第九波依將令以兩類證據收束叢集邊界（兄弟專案狀態以文件為據，不再跨庫重建）:**(a) 本地實證** — Rations 橋接已提交上游（`e932053`:demodulator i16 於 −32768 飽和、邀請紙券固定尾段邊界檢查、relay nosniff/frame/referrer 標頭；106 個 SPEC-007 相容＋劣化媒介壓力測試接入 `tests.zig`,密度棘輪 121.4% 對基線 116.9%);CLUSTER-02 驗證公開能力投影 — 3,472 列 × 18 域，計數一致，無絕對路徑或金鑰外洩；CLUSTER-03 驗證測試組確已註冊於 `Rations/src/tests.zig`。**(b) 文件具結** — CLUSTER-01 親讀各兄弟樹之 README/AGENTS,要求架上數字逐字現於原文：6/6 驗證(qstar-llm 2,610+ 測試；zig-k3-port Token-identical;TheUE 50 項能力登錄;ThePlatform Q# parity;euz 6,372+ 測試；Rations 116.9% 棘輪) — 落地前並逮獲兩筆陳舊引證並更正，此即探針之本義。家族架由 3 擴至 7 席(TheUE、Rations、EU.VERSION.Z、ThePlatform、sheraton 與 qstar-llm/zig-k3/Digit 同列)。鄰庫 WIP 原樣保留 — 實驗單庫中約 200 個 dirty 路徑早於本波，非戰役工作。掃描：83 探測 — 79 HELD / 3 NOTED。D9 將 doc-cited 層化為機械錨點 — `tools/bridge-map.mjs` 解析 26 個兄弟錨點(BRG-01..06),含 `sibling:zig-k3-port:AGENTS.md`(wasm64/memory64、CPU≡GPU 逐位元、封存黃金重播)與 `sibling:qstar-llm:docs/E2E_AUDIT_RESULTS.md` |
| C88 | SPEC-008/艦隊逆向稽核 — 正典鑄造/載入強化 | 工程 | 已驗證 | 第八波拆解艦隊工具並修復三項發現:**(a)** `fleet-manifest.mjs` 於裸讀時重新簽署並覆寫正典 — 鑄造現由 `--emit` 門控(空轉僅印未簽本體,不觸檔),`--verify` 補上缺失之載入閘:spec 欄位、canon(payload) 之 ed25519 簽名、創世系譜、公鑰指紋、時間戳、root↔site 一致,全數實測(FLEET-01)。**(b)** 公報將臨時性 beacon 源埠當作可撥位址簽入,陳舊目擊亦永不過期 — 逾 24 小時之節點不再進入簽署文件(帳目仍留為證據),beacon 埠改標 `observed_port`,絕不冒充服務位址。**(c)** `fleet-genesis-update.mjs` 僅過濾 `name === "admiral"` — 異名旗座成員得倖存,產出歧義創世致各桌 `bindFleetFlag` 一律拒錨(第七波之修補使此成現實危害);更新今以名或角色清除旗座,寫入前對每枚收集之簽名就 canon 自我驗證,`--no-sheraton` 單簽創世發出警示。`--push` 現暫存正典**雙份** — 舊路徑僅提交根檔,遺 `site/` 陳舊對抗 parity 閘。電池複測:route-o1 O(1) 綠(對表掃 322 倍)、seed-drop 4 對 8/8 驗證、philotic 探測與群集綠、staleness-detect 與 spec008-wire 閘綠、emergence-watch 綠、carrier-flight 再證 Sommerfeld-Brillouin 界、fleet-audit 抽查:downbeat zig-build HELD、euz 決定性 2H/1B(未播種隨機面如實分級)。FLEET-01..03 全數 HELD;掃描 80 探測 — 77 HELD / 3 NOTED |
| C87 | 安全測試架構逆向稽核 — 電池自我稽核 | 工程 | 已驗證 | 第七波拆解探測基礎設施並修復四項發現加一項信任鏈缺陷:**(a)** `suite.mjs` 對缺席之實驗室服務報 ERROR — 被拒絕的 socket 屬遞延而非缺陷;`svcDown`/`catchVerdict` 分類器現將 8 處 relay/邊界 catch 標記為 NOTED,真正的測試破壞仍報 ERROR。**(b)** `kali-sweep` 誤處四種邊界 — WS 延伸幀長(126/127)卡住關閉碼解析、撥號逾時於封鎖埠誤報 EXPLOITED、desk 於電池中途死亡時 `rawMethod`→"0" 誤報 OPEN、裸 `fetch` 可令整個掃描崩潰;現皆正確遞延或防護。**(c)** COMM-06 飄忽根因 — 單一 fire-and-forget 幀於受損邊界可整體丟失;sealed-send-wan 現以有界預算重發(即排序探測早已記錄之紀律),全數丟失判 NOTED 而非 OPEN。**(d)** SENTINEL 增列 containment 信任鏈 — SENT-11..14 證明旗簽 FANO-CONTAIN-v1 可釋放受限 desk、過期/竄改紙券遭拒,以及**旗座歧義修復**:`bindFleetFlag` 靜默綁定最後一個旗座成員,敵方 genesis 攜兩把旗座金鑰可使攻擊者入座;`done()` 現計數相異旗座,歧義文件一律拒絕綁定(探測執行)。發現分類法已成文 — 6 個測試架構中 `med`→`medium` 已歸一;HARN-01 對每筆帳目驗證受控 verdict/severity 詞表(170 筆全淨);HARN-02 以清單紀律看待 fleet-map(FLEETMAPv1、24 小時內、全員實測 — 陳舊地圖拒收)。超能帳目刷新:34/34 PROVEN 含 admiral 成員上線,過時之 `prompt()` 限制除名;capstone 25/25,gov/k3-stress 複測通過。掃描:77 探測 — 74 HELD / 3 NOTED |
| C86 | Zig 核心/依賴逆向稽核 — 解碼邊界強化 | 工程 | 已驗證 | 第六波拆解 `deps/qstar-*` 與 `src/spec008_*` 並修復三項發現:**(a)** `transport_paperback.decode` 於 OOM 路徑釋放未初始化 `Share.y` 切片 — `defer for` 宣告於填充迴圈之後,迴圈中段 `dupe` 失敗即遍歷全部三槽含未定義記憶體;現僅釋放 `shares[0..filled]`。**(b)** `shamirReconstruct` 未驗證即插值劣造分額 — 重複 x 座標使 Lagrange 分母為零(`gf256Inv(0)` 靜默回 0,輸出損毀),`y.len` 不等則於 `byte_idx` 越界讀取;兩者現皆拒絕(`InvalidShare`/`MismatchedShares`),x=0 拒收(x=0 點即密文,非分額)。**(c)** mesh 測試組中未註記之 f32 斷言逸出整數限定教條 — 已標記為 sidecar 邊界讀取。稽核通過:`src/*.zig` 零未註記浮點(探測執行),其餘傳輸解碼器皆查邊界,`capacity()` 為登錄槽(已記錄,非位元組上限),`spec007.wasm` 為純純量 ABI。變異組:288 個種子截斷/損毀案例橫跨 5 個解碼器 — 錯誤或解碼,絕不 panic,零洩漏。dep 之 `rsReconstruct` 轉置與 XOR 同位命名缺陷續予記錄(已繞開,待上游收錄)。ZIG-01..03 全數 HELD |
| C85 | 視覺與 i18n 逆向稽核 — 桌面通過 AA 且雙語並行 | 呈現層 | 已驗證 | 第五波拆解 `fano-desktop.css`/`dossier.css`/`fano-i18n.js` 並修復五項發現:**(a)** `.lang-btn` 引用未定義之 `--line` 變數 — 邊框靜默失效,按鈕於懸停前無框;已改為 `--desk-line`。**(b)** 對比稽核量測每套制服之墨色/強調色對其自身背景 — `desk-dim` 於五套中四套不達 WCAG AA 4.5:1(最差 3.34),WHITEHALL 強調色實測 3.09;所有色值調升後最差墨色比達 4.66(探測執行)。**(c)** 全檔無 `prefers-reduced-motion` 處理 — 240 秒旋轉 Fano 平面、開機淡入、視窗過場皆無視前庭偏好;減動模式現令桌面與紙面靜止。**(d)** 全檔無 `@media print` 規則 — 檔案雖為紙面主題,列印卻帶暗底浮水印;列印現剝除鉻件(導覽、浮水印、工作列、圖示)並守分頁紀律。**(e)** 介面原僅英文 — 浮訊、指揮套件區段、開機 POST 行、野戰手冊、監測、成就與彩蛋約二百字面量現皆經 `t()`;字典雙方各由 160 增至 356 鍵,完全一致;成就與彩蛋改為 id 登錄(字串無從偏移)。窄視窗:adm-chart 換行、LED 讓位、start-menu 限幅。DESK-16..20 全數 HELD;殘留:終端機命令語料 + ANOMALY_LORE(139 條)仍屬英文正典,留待第十波雙生稽核 |
| C84 | 桌面/DOM 逆向稽核 — 渲染邊界密封 | 身分與存取 | 已驗證 | 第四波拆解 `fano-desktop.js`/`fano-reset.js`/`fano-i18n.js` 並修復五項發現:**(a)** 使用者可控字串未轉義即入 `innerHTML` — `<img onerror=…>` 屬合法非受限呼號,曾於解鎖面板與所有視窗標題列以實標記渲染;`esc()` 現守護標題匯流點、身分區塊、資料夾列與圖示標籤。**(b)** 重置普查僅掃 16 個活躍 `fano1.*` 鍵中之 8 個 — containment、revoked、branchreqs、branches、auth.fail、directives、desk.v1、lang 曾於裁決後留存;普查現已完整並由探測執行。**(c)** 一個死 zh 獨有 i18n 鍵破壞雙生對等 — 已移除;雙方各 160 鍵,完全一致。**(d)** 學院課程詳情渲染字面 `\n` 文本(源碼轉義兩次)— 已修復;清單新增計數完整性檢查(申報 530 = 實錄 530)。**(e)** 隔離 BURN 原為單擊 — 現首擊武裝、次擊執行。DESK-10..15 全數 HELD |
| C83 | 通訊逆向稽核 — 線路邊界強化 | 身分與存取 | 已驗證 | 第三波拆解 `fano-comms.js` 並修復七項發現:**(a)** 所有 WASM 回報長度現以輸出緩衝為限 — `jread`/`qrDec`/`stegaExtract`/`carrier*`/`inviteCreate` 於超量 `n` 時曾將毗鄰堆積拉入 JS 字串。**(b)** 撥號僅限 `ws://`/`wss://`,`pkOf` 於 `connect`/`addContact`/`sendMsg`/邀請 net-id 強制六十四 hex — `unhex` 遇劣質輸入曾以固定長度將短緩衝送入 WASM。**(c)** `inviteCreate` 原為死碼 — 傳入幻影 `network_id_len` 使 `rations_invite_create` 後續引數悉數錯位,`u64` 效期又以 Number 傳入而 ABI 拒之(需 BigInt)。現已校準;邀請角色為網路列舉 `0=admin 1=moderator 2=user`,簽發需 STATION-CHIEF+,admin 邀請屬旗艦席位。**(d)** 未簽名之在線文本不得冒充 — 釘定/受限呼號於名冊中顯示為 `peer-<id>`。**(e)** Shamir 配置設界(k≤n≤250、密文 ≤64 KiB、≤250 份)。**(f)** 移除 `prompt()` — MSG 改為行內撰寫(Electron 無原生對話框)。**(g)** 內部函式導出供掃描覆蓋。WIRE-01..07 全數 HELD;comms-suite 32H/1N 無回歸 |
| C82 | 認證/憑證逆向稽核 — 信任鏈全段強化 | 身分與存取 | 已驗證 | CENTURY 第二波逆向拆解 `verifyCert`/`verifyGrant`/`claimGrant`/名冊/TOTP 並修復六項發現：**(a)** `addIssuer` 未設門檻 — 任何會話皆可冊封金鑰，使自鑄高階憑證通過驗證；名冊異動現需 STATION-CHIEF+(創世/舊桌/匯入保留內部 raw 路徑),新增 `removeIssuer` 並拒絕創始金鑰錨點移除。**(b)** `verifyCert` 無角色界限 — 簽名有效之 `role:99` 曾通過；角色現綁定 `0..5`。**(c)** 旗艦信任原為 `importGrant` 從未寫入之 `_fleet` 標記；釘定呼號之高階憑證現要求授權*重新驗證*(發行者在冊或艦隊錨定、效期未滿、未撤銷)。**(d)** `claimGrant` 改寫 `g.sub` 曾使漫遊授權簽名於領用後靜默失效 — 現改記 `g.claimed`;`verifyGrant` 重驗未綁本體以兼容舊帳本。**(e)** 過期授權從未清理且無撤銷機制 — `grants()` 讀取時剪除；`revokeCallsign`(STATION-CHIEF+)記錄撤銷而失效紙本留存為證，桌面轉移攜帶撤銷帳本。**(f)** `verifyTotp` 無節流 — 六位數閘門現共享解鎖退避；`lock()`/`burn()` 將解封種子填零並重置計數。AUTH-01..09 全數 HELD,comms-suite 31H/2N 無回歸 |
| C81 | 機器人隔離 — 自動化即受審之學員 | 身分與存取 | 已驗證 | 依艦隊司令之令：機器人活動以學員待之 — 於隔離中強制學習、與主網隔絕、唯經人類裁決方得釋放。`detectAutomation()` 強訊號（webdriver、selenium/phantom/cdc_ 全域、無頭/機器人 UA）一擊即隔離；弱訊號（無語系/外掛/熵、通用機器人 UA）需二訊號；容忍 navigator/document 缺席。受標記之註冊固定為 CADET 並蓋 `rec.contained` — 機器人宣稱 `ramsey 006` 創世仍為學員。受隔離工作階段悉數封閉：授權、憑證、漫遊、分部申請/指派/否決、簽發者名冊、TOTP、桌面匯出、通訊連線/在線/傳訊/邀請、及受治理之 LLM 橋；未列冊之入站線路來源標記 QUARANTINED；廣域邊界將壞封/超速來源記入 `bot-ledger.json`（僅標記）。釋放 = 已列冊 STATION-CHIEF+ 或艦隊錨定將旗所簽 `FANO-CONTAIN-v1` 晉升紙本，於受隔離之桌出示 — 錯誤主體與不可信簽發者皆拒收。指揮套件 CONTAINMENT 面板列舉證據；受隔離之桌僅啟 academy.os。BOT-01..07 全數 HELD |
| C80 | 學員階層＋OSTF 官職列入監察名單 | 身分與存取 | 已驗證 | 依海軍部戰略指揮規章,軍階結構落於桌面:`ROLE_LABEL[0]` 改為 **CADET** — 一切未授權註冊所得之基礎階層(程式常數 `field_agent` 不變)。OSTF 官職加入監察名單:議會席位(副/少將官職、倫理與平權准將、財務作戰上將)、顧問技術權責(首席技術系統架構師、首席安全與製造官、特級準尉、研究主管)、各 chief-of 官職、組織名(ostf、sallirreugtech＋學院),及軍銜前綴正則(`admiral <名>`、`captain <名>`、`commander|lieutenant|ensign|midshipman <名>`、`warrant officer …`、`chief of …`)— 皆由 STATION-CHIEF+ 以授權閘控。獲授之官職仍以 CADET 註冊:官銜是名號,非安全許可 — 職位經 `request-branch` 申請、司令核准鑄 FANO-BRANCH-v1。DESK-08 冷拒 6 個官職/軍銜呼號;DESK-09 證授權途徑(單次認領、role 0、重用遭拒) |
| C79 | 創始非將階 — 自封之門已閉 | 身分與存取 | 已驗證 | `enroll()` 曾對未創始之桌的**任何**首個註冊授予 `fleet_admiral` — 公開 gh-pages 部署上一個 `marcus` 註冊即自封旗艦席位(上將回報,harness 復現:role 5 且授權鑄造開放)。已修復:`role = isPinned && (isGenesis || 艦隊錨定授權)` — 非釘選創始者仍創始桌面但僅為 FIELD-AGENT;名冊種子記錄創始金鑰,而鑄造於 STATION-CHIEF 以下維持會話閘控。晉升現僅經已列名發行者之授權或艦隊錨點而入。新增 DESK-06/07 探測鎮守雙側:marcus→0 且鑄造遭拒,ramsey 006→5。附註:修復前之桌面既有憑證保留其階級(舊契約所鑄);修復生效於註冊時點 |
| C78 | 八個 qstar-llm 依賴函式庫 vendored 並接入測試架 | 基礎設施 | 已驗證 | `deps/qstar-{collapse,compress,mesh,net,quantum,render,transport,vfs}` 已 vendored,並以 Spec-007 `build.zig` 模組圖接入:**799 個依賴測試 + 41 個 harness 斷言,零洩漏**。五個 harness 證明真實能力:旗鑰 Shamir 託管(3-of-3 重置投票、2-of-3 席位缺席法定人數、外來份額拒絕)、136 位元組封套於 QR/OPTAR/音訊/卡帶/stega/polyglot/LoRa 及 maypole WiFi↔LoRa 橋上位元完全一致、正典 25-E0 bootstrap 種子 + PoLW 女巫閘 + Möbius 合併、collapse→QR 封存 + 421 節點圖上之 VFS,以及 u128 p2p Location 路由與真實 XChaCha20-Poly1305。誠實記錄之缺陷:`rsReconstruct` 輸出行列轉置(以 `reassemble` 繞行)、所謂「RS」同位實為 XOR 和(恰可復原一個抹除)、`paperback.decode` 需完整容器、`capacity()` 回傳註冊表槽位 — 全數載於 spec-008 總帳。相依庫所實作之晶格主張於第二程式碼庫逐字重獲裁決 — `sibling:zig-k3-port:docs/CLAIM-VERDICTS.md`(421 節點恆等、鏡像對稱、721 殼層皆 VERIFIED) |
| C77 | 海軍部桌面 Electron 工作站 — 真實作業系統輸入層 | 工作站 | 已驗證 | `admiralty-desk/` 使桌面成為真實工作站表面:隱藏原生編輯選單(Ctrl+C/X/V/A 全域可用)、原生右鍵剪下/複製/貼上/全選、`ADMIRALTY_DESK.clipboard` IPC 橋、僅授桌面起源之 pointer-lock 權限(遊戲/沙箱)、視窗控制 F11/Esc/Ctrl+M/Ctrl+Shift+Q 及開始選單殼層項目。身分存於 `persist:admiralty` 分割區 — 摧毀 Electron 絕不及瀏覽器桌。權杖鑄造自動複製(export-desk、驗證器、漫遊紙本)+ GENESIS SEAT 之 COPY PK;視窗內容可選取;套件採作戰暗色主題、卷宗頁面維持紙色 |
| C76 | FANO-DESK-v1 雙向桌面轉移 | 身分與存取 | 已驗證 | `export-desk`/`import-desk` 於桌間雙向搬運封裝之密鑰庫記錄與創始(瀏覽器↔Electron),由匯出桌金鑰簽署,密鑰庫全程封裝。DOM 匯入路徑於 Electron 下可用(全程無 `prompt()`)。已證拒絕:匯入已創始之桌、外來創始偽造、簽後竄改(`sig_invalid`) — team-sweep-2 之 DESK-03/04/05 |
| C75 | 漫遊艦隊上將 — 於任何桌登入而不奪創始 | 身分與存取 | 已驗證 | `issueRoaming` 鑄造未綁定 `FANO-ROOT-v1` 驗證器(`sub:null`,30 日效期,僅旗艦席位)。於他人*已創始*之桌以 `ramsey 006` + 紙本作為授權權杖註冊,綁定艦隊錨點:`bindFleetFlag` 於已發布 `fleet-genesis.json` 解析 `admiral`/`flag-seat` 成員並驗證 Ed25519 簽名 — 以 FLEET-ADMIRAL 入座,宿主創始不動。攻擊者自鑄驗證器遭拒(`iss` ≠ 艦隊旗鑰);外來創世偽造遭拒。持票憑證警告已記錄 — 持紙者持席位。team-sweep-2 之 DESK-01/02 + GRAY 探測 |
| C74 | 旗艦席位錨定於已發布艦隊創世 | 治理與信任 | 已驗證 | `fleet-genesis.json` 修訂為 3 成員:`digit` + `sheraton` 創世之根 + `admiral` 旗艦席位(公鑰 `a7f4bcd4…9076f`,提示 `sha256:c7bf5aac9378d199`),酬載經 `fleet-genesis-update.mjs --pk` 由雙根重新簽署(成員受背書,非簽署者)。已發布副本受正典閘守:publish-check 逐位元比對根目錄與 `site/` 之創世及宣言 — 首次修訂所暴露之漂移類別不再復發。刻意修訂於 TOFU 已錨桌顯現為 GENESIS CONFLICT(守衛運作,重新錨定為手動)。Bootstrap 實測通過:sheraton 上驗證簽署者集合與宣言世系 |
| C73 | 採用優先之姊妹適配器與學院投影 | 治理、AI 與教育 | 已驗證 | 共用 `OSTF-GOV-v1` 封套及輕依賴適配器現涵蓋 ThePlatform 清查／權威／A2A 中介資料、Qstar 相容伺服器中介資料、Rations 簽署技能／RAG／實體通道事件，以及 56 項能力名冊。學院清單從 `human_academic` 與現行 SPEC 投影 530 份有來源連結之公開課程；FANO `academy` 開啟含證據／評量標籤之課程。需執行時之服務仍明確標記 runtime-gated；既有原生套件測試採用為權威而不重複。兄弟端:`sibling:theue:tools/qstar_adapter.py`、`sibling:theue:tools/rations_adapter.py`、`sibling:theue:tools/academy_manifest.py`、`sibling:theue:src/capability_registry.zig` |
| C72 | SPEC 驅動之治理 Ollama 橋接與移植圖 | 治理與 AI | 已驗證 | TheUE 現擁有獨立確定性治理邊界（`src/governance.zig`），提供緊湊位址標籤、清查／工具級別檢查、HRIS／證據決策與 SHA-256 稽核鏈。Python Phase-0 工具對 1,091 份治理／正典文件全數雜湊分類，從 711 個活動程式／文件來源抽取 10,331 項段落需求，映射 10,191 項並標出 140 個明確缺口。`tools/governed_bridge.py` 提供 token 閘控之 `/health`、`/models`、`/ask`；僅允許本機 `127.0.0.1:11434` 與遠端 `192.168.12.210:11434`。FANO `ask` 現經橋接，回應標為 `modeled` 並顯示稽核 ID；瀏覽器供應商面板可發現模型，橋接 token 僅存於記憶體。雙端點發現與瀏覽器即時提問成功；發布閘門全綠。兄弟端:`sibling:theue:tools/governed_bridge.py`、`sibling:theue:tools/governance_envelope.py`、`sibling:theue:tools/ollama_discover.py` | 
| C71 | QStar.net 時間型驗證 | 身分與存取 | 已驗證 | 工作台現已實作相容 Google Authenticator 的 RFC 6238 TOTP。設定於本機產生 160 位元密鑰，以解封之 Ed25519 種子加密後寫入 `fano1.identity`，僅於本機設定畫面顯示 `otpauth://totp/QStar.net:QStar.net` QR 與手動 Base32 金鑰。SHA-1/HMAC、6 位數、30 秒週期、±1 週期時鐘容差；設定確認必須驗證當下代碼。重返登入現在需要憑證解封**加上** QStar.net 六位數代碼；桌面再次解封亦同。密鑰不送伺服器，也不以明文進入 localStorage；瀏覽器已實測 QR 產生、Google 相容 HMAC、加密記錄與代碼驗證 |
| C70 | 誓約頁之登入／註冊分流 | 身分與存取 | 已驗證 | `index.html`/`index-zh.html` 現於同頁提供兩種機制：**登入**（本桌持有記錄時顯示——憑證經 `FANO_AUTH.unlock` 解封金鑰庫，冷卻倒數顯示，錯誤憑證拒絕）與**註冊**（註冊路徑——新金鑰對、誓約簽署、選填授權憑證與分部申請）。當記錄存在時註冊區帶警示：再次註冊將鑄造新金鑰並滅失本桌身分（創世存續，特工不存）。修補真實缺口——重返之特工此前無路可回；重送表單僅能鑄造新金鑰或遭 `claimed` 拒絕 |
| C69 | 將旗驗證器：釘選席位之 FANO-ROOT-v1 憑證 | 身分與存取 | 已驗證 | 將旗席位之授權今為真實驗證器而非單次票券：`issueCredential` 鑄造簽署之 FANO-ROOT-v1 工件——自根（`gen = sha256(iss_pk)`，任何桌面皆可證）、綁定對象、內嵌授權。`authenticate` 於任何桌面驗證簽章＋在冊簽發者＋釘選呼號＋司令階級＋效期，無需共享狀態；他桌僅需將簽發者入冊即可驗紙。偽造路徑皆拒：階級降格、偽造 gen 錨點、未入冊簽發者、非旗席鑄造。其餘呼號仍用 FANO-CALLSIGN-v1 單次票券。指揮套件新增 FLAG AUTHENTICATOR 面板（簽發/更新、匯出、驗證他方憑證）;終端新增 `credential` / `credential verify <token>`;`whoami` 印出已驗證之驗證器行。COMM-20..24 全數 HARDENED |
| C68 | 7q 抽屜→指揮套件;分部指派經網路核准 | 身分與存取 | 已驗證 | FLEET-ADMIRAL 工作階段開啟 7q 抽屜為指揮套件（將旗名冊、分部申請核准、呼號授權簽發、簽發者名冊）;其餘階級仍得 ACCESS DENIED,圖示於將旗下自 SEALED 轉 COMMAND。分部流程：註冊/`request-branch` 以申請者自身金鑰簽署 FANO-BRANCH-REQ-v1 憑證 → base64 憑證經任何通道攜行（comms/死信箱）→ 司令於套件匯入（匯入即驗簽;竄改者拒收）→ 核准簽發 FANO-BRANCH-v1 憑證;`branchOf` 驗證簽章＋在冊簽發者＋效期——偽造之 role-5 工作階段可簽發但驗證失敗,直至簽發者入冊。FIELD-AGENT 與 STATION-CHIEF 於指派/否決皆遭拒（僅司令）。新增 COMM 探針：申請簽署、竄改拒收、僅司令、名冊強制——全數 HARDENED |
