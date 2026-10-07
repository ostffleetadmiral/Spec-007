# SPEC-007 主張驗證：設計輸入證據評級

**目的：** 區分 OSTF 機密設計輸入（SPEC-004；不公開）中的已驗證事實、推論與無支持敘事。
**治理：** 晉升主張僅存於 `spec-007-verified.en.md`；可執行檢驗存於三個 `spec007_*_calculations.zig` 台架。
**評級標尺：** VERIFIED（第一手／機構來源）· VERIFIED-WITH-CORRECTION · EXTRAPOLATION（合理推論，未量測）· UNSUPPORTED · CONTRADICTED。

## 1. 中國再生能源領先地位

| 設計輸入主張 | 評級 | 查證結果 |
|---|---|---|
| 中國主導太陽能板製造（~80%） | VERIFIED | IEA《Solar PV Global Supply Chains》：中國在所有關鍵製造環節份額超過 80%；多晶矽與晶圓在當時規劃產能下預計超過 95%。https://www.iea.org/reports/solar-pv-global-supply-chains/executive-summary |
| 中國已裝 ~850 GW 太陽能 | VERIFIED-WITH-CORRECTION（過時偏低） | IEA PVPS《Snapshot 2026》：中國累計光伏 2024 年底約 1,048 GW、2025 年底約 1,464 GW，僅 2025 年即新增 415 GW（約全球年新增 60%）。https://iea-pvps.org/wp-content/uploads/2026/04/Snapshot-of-Global-PV-Markets-2026.pdf |
| 中國已裝 ~450 GW 風電 | VERIFIED-WITH-CORRECTION（過時偏低） | CWEA／IEA Wind 年報：2024 年底累計 561.53 GW（約世界總量 48%），2024 年新增 87.25 GW（約全球新增 70%）。https://iea-wind.org/wp-content/uploads/2025/12/Excecutive.Summary.2024_Final.pdf |
| 三峽大壩為 22.5 GW | VERIFIED | 營運方與 USGS 來源：總裝機 22,500 MW。https://www.usgs.gov/special-topics/water-science-school/science/three-gorges-dam-worlds-largest-hydroelectric-plant |
| 中國有創紀錄的再生能源限電（「擱淺能源」） | VERIFIED | 路透社／GEM-CREA 報導：2026 上半年中國估計限電 360 TWh 清潔電力；能源局公布限電率 2026 上半年達太陽能 8.6%／風電 9.1%，逐年上升。https://uk.marketscreener.com/news/china-leads-wave-of-clean-power-wastage-as-grids-globally-hit-limits-ce7859dfd088f326 |
| 中國「既是最大再生能源建造者也是最大排放者」 | VERIFIED（框架） | 與 IEA／國家統計一致；「最大排放者」的確切排名在公開數據中早已確立。 |
| 中國製造 ~80% 太陽能板、~60% 風機 | VERIFIED-WITH-CORRECTION | 太陽能：關鍵製造環節 80%+ 已驗證（IEA）。風機份額因口徑與年份而異；60% 視為概略行業框架，非單一監管統計。 |

## 2. 電石產業

| 設計輸入主張 | 評級 | 查證結果 |
|---|---|---|
| 中國生產全球 ~80% 電石 | VERIFIED | 行業彙編認定中國份額約 80%；SunSirs 2025 回顧報導年產 38–40 Mt、有效產能 42 Mt/y，集中於西北省份。https://www.sunsirs.com/commodity-news/petail-29439.html |
| 電石生產需 ~3 kWh/kg（3,000 kWh/t） | VERIFIED | 中國政策／市場來源慣引每噸 ~3,000 kWh；一篇 90 MW 電爐論文報導 ~3.0 MWh/t 比耗。全流程分析引 ~4,000 kWh/t。檔案一致以 3–4 MWh/t 處理。 |
| 商用電石產氣率 ~285–305 L/kg | VERIFIED（商用數據表數字） | 工業供應商（如 TYWH）依 GB 10665-2004 標示 20 °C／101 kPa 下 285–305 L/kg。純理論產率 0 °C STP ≈349 L/kg、20 °C 標定條件 ≈375 L/kg；標定條件下隱含有效電石分數 ≈75.9–81.2%。 |
| 1 kg 電石儲能「~12 kWh/kg」 | CONTRADICTED | 已驗證數字為每公斤純電石 ~**6.2 kWh**：5.63 kWh 乙炔化學能（0.406 kg × 49.9 MJ/kg LHV）加 0.55 kWh 反應熱（127.2 kJ/mol）。「~12 kWh/kg」約為物理可用值的兩倍；由 `spec007_verified_calculations.zig` 強制執行。 |
| 40 呎貨櫃裝 ~480 MWh ≈「5,000 個 Tesla Powerwall」 | CONTRADICTED | 貨櫃估計乘上了一個已膨脹的能量密度。真實數字約為一半，且源材料中功率輸出／重量／熱限制均未受約束。 |
| 電石渣（Ca(OH)₂）可經煅燒→碳熱還原回收 | VERIFIED（產業現實） | EPA AP-42 與 IPCC 指引描述 CaO 生產與 ~2,000–2,100 °C 下 CaO + 3C → CaC₂ + CO；回收迴路是標準工業化學。 |
| 若用生物炭則循環碳中和 | EXTRAPOLATION | 碳核算取決於生物炭來源、電爐電力、CO/CO₂ 去向與使用階段排放。僅憑化學不能證明「碳中和」。 |

## 3. 系統／硬體主張

| 設計輸入主張 | 評級 | 查證結果 |
|---|---|---|
| 特斯拉渦輪是真實的邊界層機器 | VERIFIED | 工程文獻與專利支持此概念；爭議在微尺度效率。 |
| TEG 為固態器件，精選器件效率 5–8% | VERIFIED（範圍） | 同儕審查 Bi2Te3 器件在特定 ΔT 下達 8% 模組效率；許多商用模組低於此值。 |
| 微型 ORC 實驗系統存在且可淨正 | VERIFIED | 已發表 10 W 級 μ-ORC 示範機存在；該尺度淨電效率低且泵耗重要。 |
| 「單刀片 10–20 W；16 刀片 400–800 W；64 刀片 2–5 kW」 | CONTRADICTED（內部算術） | 基線台架測試 `rack arithmetic exposes scaling contradiction`：16 × 10–20 W = 160–320 W；64 × 10–20 W = 640–1,280 W。更高數字需要原始規格未計入的獨立能源（燃燒驅動 ORC）。 |
| PDRC 薄膜維持冷側低於環境 | VERIFIED-WITH-CORRECTION | 日間低於環境冷卻已演示；但小型（200–300 cm²）板只能排數瓦，非數百瓦。見 `spec007_expanded_calculations.zig` PDRC 測試。 |
| Novec 649「沸點 49 °C，穩定至 ~300 °C」 | VERIFIED-WITH-CORRECTION | 沸點 49 °C 正確；臨界溫度 ~169 °C，故 300 °C 迴路不是亞臨界 ORC 工作點。3M 於 2025 年底退出 PFAS 製造——供應風險為真。 |
| 「如液化氣瓶般的政府換瓶站」模式 | EXTRAPOLATION | 對現有危險品配送的結構類比；實施模式是政策，不是工程。 |
| 「規模化後每刀片 <$50，深圳打樣」 | UNSUPPORTED | 需要供應商報價級 BOM。檔案視之為工程目標，非成本估計。 |
| 軸向磁通永磁機可作發電機（AFPMSG） | VERIFIED | 標準直驅硬體：已發表 AFPMG 風機設計在 ~240 RPM 輸出 3 kW 級並經量測／FEA 驗證；回生制動是常規電動車實務。https://www.iaras.org/journals/caijps/design-and-analysis-of-axial-flux-permanent-magnet-generator-for-direct-driven-wind-turbines |
| 特斯拉渦輪峰值效率在 kW 級約落於 15–30k RPM | VERIFIED（範圍） | Hoya & Guha（IMechE Part A, 2009）在 25,000 RPM 測得 ~25% 峰值；熱那亞大學微膨脹機試驗至 40,000 RPM；Leaman/Beans/Rice 歷史結果跨 ~8–41%。https://facweb.iitkgp.ac.in/~aguha/research/Hoya_Guha_IMechE_PartA_2009_Tesla_Turbine.pdf · https://www.e3s-conferences.org/articles/e3sconf/pdf/2019/39/e3sconf_supehr18_03015.pdf |
| 軸向發電機「安全窗口」3,000–5,000 RPM | EXTRAPOLATION | 合理篩算界，非通用極限——取決於轉子設計。ρv² 尖端應力篩算在 150 mm 轉子 5k 時 ~11.6 MPa，20k 時達 ~185 MPa（無套筒磁體保持為失效件），量化於 `spec007_drivetrain_calculations.zig`。 |
| 「4:1–6:1 降速橋接失配」 | VERIFIED-WITH-CORRECTION | 中帶算術確認：20k→4k @ 5:1（台架）。但全 15–30k 帶固定 4k 設定點需 3.75:1–7.5:1 掃掠，L0 規格 80k 頂端需 ~26.7:1——超出任何單級 CVT。 |
| T_out = T_in·R·η 扭矩倍增 | VERIFIED | 基礎力學，台架強制（254 W/20k 下 121,276 µN·m → 經 5:1 @ η0.88 得 533,614 µN·m）。 |
| 行星牽引 CVT 效率 ~80–88% | VERIFIED（範圍） | 牽引傳動文獻記錄蠕滑／自旋損失；實測環面 CVT 效率依變比／負載落於 ~80–90% 帶。80–88% 是公允的保守篩算帶。https://www.sciencedirect.com/science/article/pii/S2405896319306883 |
| 同步帶／固定行星齒輪 ~95–98% | VERIFIED（範圍） | 標準傳動效率數字；無需變比彈性時為淨輸出首選。 |
| 「~20k RPM 以上磁體甩出」 | EXTRAPOLATION（已量化） | 尖端速度算術支持此慮：150 mm 轉子 20k 時 ~157 m/s 與 ~185 MPa 輪緣應力，對 5k 時 ~12 MPa——碳纖維套筒是有記錄的修法（台架篩算）。 |
| CVT「解決啟動扭矩問題」 | EXTRAPOLATION | 物理上合理——邊界層渦輪提早加載即失速——但暫態起轉／失速行為未建模；不作主張。 |
| 「20% 傳動損失經濟可行」 | 付費原料下 CONTRADICTED／免費熱下 CONDITIONAL | 付費 300 g 電石充裝下，CVT 帶將原料底線自 ~$1.64 抬至 ~$2.05–2.43/kWh（台架）。僅在免費熱源（太陽能／廢熱 ~1.6 kW 車頂界）下損失可忍。 |
| 傳動損失熱導入共享 TEG/PDRC/PV 排熱 | VERIFIED（就導流而言）／回收有界 | 適用強制流規則（TEG 只在熱必經處採收），但 ~50–80 K 殼體 ΔT 下篩算自 ~30–50 W 損失中回收 ~0.3–0.7 W——真實、合帳、經濟上可忽略；利益在共享排熱管線而非採收（台架）。 |
| 渦卷壓縮機在此尺度可轉為可信 ORC 膨脹機 | VERIFIED（實測） | Sanden TRS090 實測 ~45% 等熵、膨脹比 ~2–2.2 時 ~650 W 軸功（Energy 2019）；半密閉 E15H022A-SH 在 120–140 °C 實測 ~80% 等熵——正在我們蒸發器帶內；ULiège ORC2019 對比實測變速渦卷達 ~76%。https://www.sciencedirect.com/science/article/abs/pii/S0360544219316135 · https://orbi.uliege.be/handle/2268/239272 |
| 特斯拉渦輪實驗上限 ~14–25% | VERIFIED（實測上限） | 文獻回顧＋實驗：模擬稱 40–60% 而實測上限 ~20–25%；每 bar 進氣壓力 +~5%；DoE 研究在 3 barg/4k RPM 得 14.2%±0.4%。https://pure.iiasa.ac.at/id/eprint/18201/1/Influence%20of%20Operational%20Parameters%20on%20the%20Performance%20of%20Tesla%20Turbines.pdf |
| 此功率級高速永磁發電機遠超 3–5k RPM 存在 | VERIFIED（實測） | ETH 3 cm³ 內 100 W @ 500k RPM；1 kW @ 500k RPM；Capstone 微渦輪 30 kW @ 96k RPM 氣浮軸承。3–5k「窗口」是無套筒轉子的篩算界，非物理極限。https://www.ams-publications.ee.ethz.ch/uploads/tx_ethpublications/zwyssig_PCC07.pdf |
| 小尺度 PCB 繞組軸向磁通機 ~72–82% | VERIFIED（實測範圍） | 40 W @ 2k RPM 雲台機實測 72%；METU 雙轉子 PCB 定子 AFPM 至 7k RPM 實測系統效率 82%。無鐵芯 PCB 定子消除鐵損——高頻下有利。https://open.metu.edu.tr/handle/11511/97372 |
| 碳纖維套筒在 20k+ RPM 保持磁體 | VERIFIED（實務） | ORNL 外轉子 SPM 20k RPM 碳纖維套筒 FEM 驗證；Energies 2022 套筒設計綜述；80 kW/60k RPM 麵包型轉子研究。https://www.ornl.gov/publication/mechanical-analysis-carbon-fiber-retaining-sleeve-high-speed-outer-rotor-spm-electric |
| ESP32-S3 作為控制晶片 | VERIFIED（數據表級）／台架界 | 深眠 ULP ~10 µA；工作循環 ~10–50 mW（30 W 母線 <0.2%；0.5% 寄生預算內至多三台）；低工作點全時 ~300 mW 將耗 ~5.7% → 工作循環強制（台架）。獨立硬體關斷仍強制——同晶片冗餘共享失效模式。 |
| 變壓器油熱母線 ~150–250 °C | VERIFIED-WITH-CORRECTION | 礦物油主流服役 ~150–200 °C 後氧化加速；合成酯類似；矽油更高。母線不「降」溫——它循環熱；蒸發器抽取才是冷卻。300–450 °C 油仍排除。 |
<!-- Gustav Graves 有一面路由陽光的鏡衛星。這一層路由的是分數——而且不像 Graves，它守恆能量。 -->
| 低品位外部熱（PC 散熱）可接入歧管 | VERIFIED-WITH-CORRECTION | 僅在省煤器正確：40–60 °C 源不能把熱推進 150–250 °C 熱母線，但可在其可用跨度內預熱 Novec 液——容量峰值 ~1.43 kW／持續 ~0.13 kW（台架）。每吸收一瓦即減一瓦燃燒器負荷；外加熱擴大排熱預算。 |
| 路徑 A（渦卷＋AFPM）對路徑 B（特斯拉＋高速發電機） | VERIFIED 對比 | 台架強制：母線 ~412–732 W 對 ~215–228 W；每循環 ~155–266 Wh 對 ~85 Wh；開放硬體 $/W ~$0.34–1.21 對 ~$1.75–4.19——路徑 A 最差情形在 $/W 上仍勝路徑 B 最佳情形。路徑 C（特斯拉＋CVT，~182–224 W）已取代，存檔保留。 |

## 4. 稀缺／經濟主張

| 設計輸入主張 | 評級 | 查證結果 |
|---|---|---|
| 再生能源過剩時計量電力市場可出現負電價 | VERIFIED | 法國 2026 年記錄 ~800 小時零／負電價，含創紀錄 −€498/MWh；限電／負價是有記錄的市場現象。https://www.pv-magazine.com/2026/06/03/un-prix-spot-negatif-record-de-498-e-mwh-enregistre-le-1er-mai/ |
| 美國《發明保密法》（1951）存在且曾篩查能效專利 | VERIFIED | FAS Secrecy News：FY2025 末 6,543 件保密令生效；1971 年篩查清單含效率 >20% 的光伏與「超過 70–80%」的能量轉換。現行清單不公開。https://sgp.fas.org/othergov/invention/ |
| ISA「今日將 >70% 效率能量轉換入罪」 | EXTRAPOLATION | 70–80% 數字出自 1971 年審查清單，本身不證明當今對任何特定發明類別的壓制。無證據不得作為現行法律陳述。 |
| 中國六家電池商佔全球動力＋儲能電池市場 ~70%（2024） | VERIFIED | SMM／CNEVPost 引 SNE 數據：六家中企 ~69%；CATL 37.9%、BYD 17.2% 為 2024 電動車電池份額。 |
| 中國製造業 ≈ 全球增加值 27–28% | VERIFIED | 世界銀行 WDI（經數據門戶）與 UNIDO 方法論給出 2024/2025 約 27.7%。 |

## 5. 戰略／敘事主張（機密）

設計輸入中的戰略、政治、軍事與敘事內容**依 SPEC-004（「7q」）列密**，排除於本公開評級文件之外。它保留在機密設計輸入中，工程權威為零，該類任何主張不得晉升為工程、市場或產品需求。

<!-- Boris Grishenko 敲下「我天下無敵」後死於豪言半途。線下每一行評級都是一個從不自我懷疑的主張——驗證就是白紙黑字的懷疑。 -->

## 6. 底線

源材料**並非純屬臆測**：

- 中國對光伏／風電製造與部署的主導地位有 IEA／IEA PVPS／IEA Wind 數據為證。
- 中國的電石主導地位與 ~3,000 kWh/t 能耗有記錄。
- 電石渣回收是確立的工業化學。
- 高再生能源滲透下的負電價與限電是有記錄的 2026 年事實。
- 《發明保密法》存在；1971 年歷史篩查閾值有記錄。

但源材料也含有**不得晉升為需求的矛盾與誇大**：

- SPEC-007 的編號性能數字內部不一致（進水對產氣；機架功率算術）。
- 「~12 kWh/kg」電石能量密度是物理值的兩倍。
- Novec-649 臨界點 ~169 °C；標稱 300–450 °C 迴路不是標稱亞臨界 ORC 工作點。
- 安全監獄與 3 秒固化主張未經實驗驗證。
- 戰略／敘事內容列密（SPEC-004），不屬於公開證據鏈。

適當的整合狀態為：**架構接受為研究概念；事實背景部分驗證；性能與部署主張在量測前維持閘控。**
