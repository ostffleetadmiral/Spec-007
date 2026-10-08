# 科學覆蓋圖 — 每一領域、每一引文、每一爭議

本文件為框架的完整外部科學對映:主張觸及的每一科學領域、外部文獻之記錄、
以及該記錄所處之層級。層級為誠實標籤,非讚辭:**PEER-REVIEWED**(期刊/
正式場域)、**PREPRINT**(arXiv/Zenodo 預印本,未經同儕審查)、
**FRINGE-TIER**(真實存在但證據權重低)、**STANDARD/SETTLED**(RFC、
ISO、教科書)、**INTERNAL**(框架自身造物 — 以驗具為證)、以及
**COUNTER-LEDGER**(已發表之反證或實測約束)。

出處:自兄弟文獻引擎 `sibling:hardware:src/literature_review.zig` 逐字提取之
24 項引文(SCI-01 逐一釘定 DOI 原文),加上 2026-10-08 研究簡報
(`security/out/research-debrief.md`)。

## §1 分配代數與例外結構

| 主題 | 框架角色 | 外部記錄 | 層級 |
|---|---|---|---|
| 八元數乘法、法諾平面 | `sibling:hardware:src/octonion.zig`、`src/spec008_qstar_*` 方言 | 定案代數 — Hurwitz 1898;法諾平面 PG(2,2) | SETTLED |
| Aut(O)=G₂、Aut(J₃(O))=F₄ | `sibling:hardware:src/jordan_algebra.zig` | Chevalley & Schafer 1950 | SETTLED |
| 八元數 U(1) 電荷譜 (0,1/3,2/3,1) | `sibling:hardware:src/electric_charges.zig` | 已發表之八元數模型結果(Todorov/Dubois-Violette 計畫) | PEER-REVIEWED |
| 由 F₄ 極大子群交得 SM 規範群 | 例外結構層 | Todorov & Dubois-Violette,arXiv:1806.09450(Universe 4:117, 2018) | PEER-REVIEWED |
| 三重性 → 三代,經 Albert 代數 | `sibling:hardware:src/so8_triality.zig` | Dubois-Violette & Todorov,arXiv:1604.01247(Nucl. Phys. B 912:426, 2016) | PEER-REVIEWED |
| 複數八元數出三代 | 物理解讀層 | Furey,arXiv:1910.08395(Phys. Lett. B 785:84, 2018) | PEER-REVIEWED |
| 三重性三元組出三代與 Higgs | 文獻評審第 32/33 項 | Furey & Hughes,Phys. Lett. B 865:139473 (2025),arXiv:2409.17948,doi 10.1016/j.physletb.2025.139473 | PEER-REVIEWED |
| Spin(10)→SM 代數層疊 | SO(10) 層 | Furey,Annalen der Physik (2024),doi 10.1002/andp.202400323 | PEER-REVIEWED |
| SM 表示即 H₁₆(ℂ) 約當超代數 | 16=15+1 層 | Furey,Annalen der Physik (2025),doi 10.1002/andp.202500229 | PEER-REVIEWED |
| E8(-24) SM 詮釋(「octions」) | 15×16=240 層 | Wilson, Dray & Manogue,J. Math. Phys. 63:081703 (2022),doi 10.1063/5.0095484 | PEER-REVIEWED |
| E8 模型之手徵性 | E8 計畫 | Wilson,arXiv:2210.06029 (2022) | PREPRINT |
| E8 之 SM 嵌入唯一性 | E8 計畫 | Wilson (2024),INSPIRE-HEP inspirehep.net/literature/2811411 | PREPRINT |
| E8(-24) 中之 SM+重力嵌入 | E8 計畫 | Wilson,arXiv:2404.18938 (2024) | PREPRINT |
| J₃(O) 本徵值 → 費米子質量比 | 文獻評審第 34 項 | Singh & Teli et al.,arXiv:2508.10131,doi 10.48550/arxiv.2508.10131 — 閉式 √質量比、δ²=3/8、馬約拉納預言 | PREPRINT |
| J₃(O) → CKM 矩陣 | 文獻評審第 35 項 | 同上 — Cabibbo 相位 π/2;另 arXiv:2305.00668(獨立約當-CKM 推導,角度與實測差約 15%) | PREPRINT |
| 八元數空間出 α | 文獻評審第 36 項 | Singh (TIFR),EPJ Plus (2022);合併稿 arXiv:2603.28810;兄弟引文:APS meetings-archive.aps.org/smt/2026 | PREPRINT(場域旗標 — 見 §10) |
| J₃(O) + 重力/MOND 基礎 | 文獻評審第 7 項 | Singh,arXiv:2304.01213,doi 10.48550/arxiv.2304.01213 | PREPRINT |
| E8×E8 八元數統一 | 文獻評審第 1 項 | Singh,arXiv:2501.18139,doi 10.48550/arxiv.2501.18139 | PREPRINT |
| E8 根系(240 根、反射閉包) | `sibling:hardware:src/e8_roots.zig`、`octavian.zig` | 定案李理論 — E8 根數與 Weyl 反射閉包 | SETTLED |
| SO(10) 16 維手徵旋子 = 15+1 | `sibling:hardware:src/so10_decomposition.zig` | 定案 GUT 表示論 | SETTLED |
| Pati-Salam SU(4)≅SO(6) | `sibling:hardware:src/pati_salam.zig` | Pati-Salam 1974;2024–25 活躍研究 arXiv:2504.01893,doi 10.48550/arxiv.2504.01893 | PEER-REVIEWED + PREPRINT |

## §2 遺傳密碼與代數結構

| 主題 | 框架角色 | 外部記錄 | 層級 |
|---|---|---|---|
| 密碼子簡併為李超代數多重集 | 密碼路由先例 | Forger & Sachse,J. Math. Phys. 41:5407 (2000) | PEER-REVIEWED |
| 經 sl(6/1) 之遺傳密碼演化 | 密碼路由先例 | Hornos & Hornos et al.,PNAS 95:987 (1998) | PEER-REVIEWED |
| 64 密碼子 ↔ 8 維超複數 | 文獻評審第 30 項 | Petoukhov,arXiv:1102.3596,doi 10.48550/arxiv.1102.3596 | PREPRINT |
| GF(4) 遺傳密碼李代數 | 密碼路由先例 | Sánchez & Grau,arXiv:q-bio/0501036 | PREPRINT |
| 環面/量子密碼子表示 | 文獻評審第 30 項 | Frontiers in Applied Mathematics (2024),doi 10.3389/fams.2024.1341158 | PEER-REVIEWED(期刊層級已註) |
| E8 ↔ 八元數 ↔ RNA 基因矩陣同構 | 文獻評審第 30 項 | theoryofeverything.org/theToE/2025/06/19/ | FRINGE-TIER(網頁來源) |
| 遺傳密碼 ↔ 分裂八元數 | 密碼路由先例 | JIMS 期刊論文(rgnpublications) | FRINGE-TIER(低層級期刊) |
| 真實基因組路由結果 | `sibling:codon:results/ncbi/` | NCBI 組配 GCF_000005845.2(大腸桿菌 K12)、GRCh38、S288C — 真實資料集、框架自身路由 | INTERNAL |
| 6 位元 base-4 密碼子編碼 | `sibling:hardware:src/codon.zig` | 64 = 2⁶ — 算術恆等;路由規則為框架建構 | SETTLED(算術)/ INTERNAL(路由) |

## §3 數系、算術與計算

| 主題 | 框架角色 | 外部記錄 | 層級 |
|---|---|---|---|
| 定點 Q 格式算術 | `src/fixed_point_q128.zig` | 定案計算機科學 — Q 記法;RNE 半 ulp 界於庫內證明(Lean 4,零 sorries) | SETTLED + INTERNAL |
| i256 原始/i512 中間精確性 | 純整數教義 | 定案整數算術;框架實作 | INTERNAL |
| Wasm memory64 | `sibling:zig-k3-port` wasm64 部署 | Chrome 133(2025-02)、Firefox 134(2025-01)已釋出;Safari 待決 | SETTLED |
| Kimi K3 架構 | `sibling:zig-k3-port` 移植目標 | 官方釋出(2026-07-16):2.78T 參數、93 層、896 專家×16 路由、104B 激活、1M 上下文 — 獨立證實移植之要項數字 | PEER-REVIEWED(廠商技術報告 arXiv:2607.24653) |
| Qwen1.5-0.5B 對照尺寸 | `sibling:qstar-llm` 比較錨點 | 真實模型;兄弟 README 錨點 75 MB → 53,888 B ≈ 1,392×(「~1,460×」隱含 ~78.7 MB — 見 §10 旗標) | SETTLED(模型存在)/ 基準旗標數值 |
| tiktoken / BPE 分詞 | `sibling:zig-k3-port` 45/45 同位 | OpenAI tiktoken — 真實分詞器,同位為內部測試 | SETTLED + INTERNAL |
| 確定性 LLM 推論 | `sibling:theue` 執行端 | 教師強制同位、貪婪序列精確,對 torch 神諭 — 內部驗具 | INTERNAL |
| GGUF / Q4KM / MoE 稀疏 | `sibling:Falsifible` 執行端 | 標準量化格式;執行端為內部 | SETTLED + INTERNAL |

## §4 編碼理論與密碼學

| 主題 | 框架角色 | 外部記錄 | 層級 |
|---|---|---|---|
| Ed25519 簽章 | 創世、封印、表決、創世對 | RFC 8032 | STANDARD |
| SHA-256 | 承諾、封印、清單 | FIPS 180-4 | STANDARD |
| HMAC-SHA256 | D12 通道標籤(frameAuth) | RFC 2104 | STANDARD |
| PBKDF2 | 金鑰庫封裝 | RFC 8018 / RFC 2898 | STANDARD |
| TOTP | QStar.net 驗證 | RFC 6238 | STANDARD |
| Shamir (k,n) 秘密分享 | 分片/託管驗具 | Shamir,CACM 22(11),1979 | SETTLED |
| GF(2⁸) 算術、Cauchy-MDS | `qentangle` 同位層 | Plank、編碼理論教科書 — 真實 MDS 技術;dep 之「RS」為 XOR 和(單抹除界,已記錄) | SETTLED + 已標界 |
| XChaCha20-Poly1305 AEAD | `sibling:` 網格線路 | draft-irtf-cfrg-xchacha | STANDARD |
| SimHash 指紋 | 晶格探針 | Charikar,STOC 2002 | SETTLED |
| Steane ⟦7,1,3⟧ 碼 | `sibling:ark-ivector:qsharp/SteaneCode.qs` | Steane 1996 | SETTLED |
| 校驗和 ≠ MAC | LAWB-09 教訓 | 已發表原理 — 無金鑰完整標籤可偽造;已以金鑰層修復 | SETTLED + 已修復 |
| 多埠 S 矩陣/四聯 Smith 圖 | `sibling:hardware:src/smith.zig`、`src/spec008_medium_lattice.zig` | 多埠網路分析屬定論工程(Pozar);框架自有四聯圖以 Q128 做 Γ↔z,四象限為精確 90° 旋轉 | SETTLED + INTERNAL |
| Wi-Fi CSI 感測 | 介質即感測器先例 | 通道狀態資訊擷取(Intel 5300/AX200 級)— 大量同儕審查 Wi-Fi 感測文獻 | PEER-REVIEWED |
| IEEE 802.11bf WLAN 感測 | 標準化里程碑 | IEEE bf 任務組 — WLAN 感測已標準化為正式服務(2025 批准) | STANDARD |
| 無線電層析成像(RTI) | 「介質即晶格」先例 | Wilson & Patwari,IEEE Trans. Mobile Comput. 9(5):621(2010)— 鏈路矩陣之射頻遮蔽解析為體素網格:介質即晶格屬已發表科學 | PEER-REVIEWED |
| TDR 線纜阻抗計量 | 線纜即晶格先例 | 時域反射術 — 定論計量學,將線纜阻抗/故障映射至同一 Γ 平面 | SETTLED |
| 介質即晶格計畫 | 框架建構 | `src/spec008_medium_lattice.zig` — Γ→15×15 格胞量化、四埠陣列→(k,r,c)、次/超閾值界限雙向檢驗;作為量測疊層可行,可否證條件在案 | INTERNAL |

## §5 熱力學與能源硬體

| 主題 | 框架角色 | 外部記錄 | 層級 |
|---|---|---|---|
| Tesla 渦輪設計/測試方法 | C13/C44/C51 已篩 | Hoya & Guha,Proc. IMechE A 223 (2009);25k RPM 下實測 ~25% | PEER-REVIEWED |
| Tesla 渦輪 ORC 實測效率 | 篩查界限 | UniFi ORC 台架(2019):軸功 9.6%/絕熱 30% 上限 — 對性能樂觀之 COUNTER-LEDGER | PEER-REVIEWED(實測) |
| Tesla 微膨脹器 | 縮放脈絡 | 熱那亞大學實驗,E3S Conf. 39:03015 (2019) — 40k RPM 下 200 W | PEER-REVIEWED |
| 渦旋膨脹器微 ORC | C50 旗艦路線 | 綜述(Appl. Energy;Sustain. Energy Tech.):實測等熵 0.50–0.64,潤滑可至 ~0.80;sub-10kWe 首選膨脹器 | PEER-REVIEWED |
| 行星牽引 CVT η ~80–88% | C39 來源區間 | Tomaselli et al.,Mech. Mach. Theory 150:103877 (2020) — 球牽引傳動 70–89%;NREL WindPACT 評估 | PEER-REVIEWED |
| 軸向磁通 PM 發電機 | C36 已驗實務 | 直驅風電 AFPM 設計 — 機型真實;逐機圖譜為必要 | PEER-REVIEWED |
| Bi₂Te₃ TEG 模組 | C11 硬體計數 | 定案熱電實務 | SETTLED |
| Novec 工程流體 | C48 熱迴路 | 3M Novec 649/7000 級 ORC 工作流體 | SETTLED |
| Friis / Johnson-Nyquist / Greinacher | `sibling:hardware:src/rf_harvest.zig` | 定案射頻工程 | SETTLED |
| CaC₂ + 2H₂O → C₂H₂ + Ca(OH)₂ | C04/C19/C24 鏈 | ICSC 0406;NOAA CAMEO — 放熱,乙炔爆炸範圍 2.5–82% vol,引燃 ~305 °C | STANDARD |
| UN 1402 分類 | C22 合規 | UN Class 4.3 遇水反應,Pack Group II | STANDARD |
| CaO 水合安全停止 | C19 安全路線 | 放熱熟化 — 定案化學 | SETTLED |
| 煅燒 ~900 °C | C23 回收 | CaCO₃ → CaO + CO₂,~825–900 °C | SETTLED |
| CaO + 3C → CaC₂ + CO | C24 反應 | 電爐碳化物化學,~2000 °C — 平衡且真實之製程 | SETTLED |
| ISO 1940-1 G2.5 | C27 平衡等級 | G2.5 即渦輪等級(燃氣/蒸汽渦輪) | STANDARD |

## §6 量子資訊

| 主題 | 框架角色 | 外部記錄 | 層級 |
|---|---|---|---|
| 3I/ATLAS(第三星際天體) | 受測異常 | ATLAS 於 2025-07-01 發現;雙曲 v∞≈58 km/s,銀心方向輻射點;Loeb,arXiv:2507.12213 — 異常分類論述,非偵測主張 | PREPRINT |
| Wow! 訊號(1977) | 基準無線電瞬變 | Ehman,Big Ear 1420.4556 MHz(氫超精細線),約 72 秒,1977-08-15;48 年未再現 — 觀測屬定論,來源未定 | PEER-REVIEWED |
| Wow↔ATLAS 對準主張 | 受測 | Loeb(2025):約 9° 間隔(ΔRA≈4°、ΔDec≈8°),隨機帽蓋機率約 0.6%;對 3I/ATLAS 之 1420 MHz 後續觀測:迄今零偵測 | PREPRINT(提議層) |
| 測天探針驗具 | `src/spec007_astrometric_probe.zig` | 整數 Q128 評估:間隔 <9°(實測 ≈8.77°)、P≈0.0062、600 AU 處 3.47 光日、內向過境約 49 年一致;超光速前提於線費不變量關卡遭拒 | INTERNAL |
| Steane ⟦7,1,3⟧ CSS 碼 | `sibling:ark-ivector` Q# 層 | Steane 1996 — 標準 QEC 碼 | SETTLED |
| Q# / .NET 8 量子見證 | `sibling:hardware:qsharp/` | Microsoft Quantum SDK — 真實工具鏈 | SETTLED + INTERNAL |
| 6 量子位元密碼子編碼 | `sibling:hardware:qsharp/CodonProofs.qs` | 建構於真實原語上之框架建構 | INTERNAL |
| 八元數量子計算 | 解讀層 | Quantum Rep. 7(4):55 (2025) — 正式化障礙:非結合張量積、路徑相依演化、結合域外可能之能量守恆失效;四元數 QC 為 BQP 等價,八元數受約束 | PEER-REVIEWED(約束 — 見 §10) |

## §7 儀器化認知與基礎

| 主題 | 框架角色 | 外部記錄 | 層級 |
|---|---|---|---|
| 45 筆 neuraleak 測試條目 | C98 儀器層 | 內部儀器化 LLM 資料 — 操作性定義,非意識主張 | INTERNAL |
| 「It from bit」/參與式宇宙 | 文獻評審第 22 項 | Wheeler,Sakurai Prize Lecture (1989),doi 10.1201/9780429500459-19 | SETTLED(奠基性論述) |
| 強自由意志定理 | 文獻評審第 24 項 | Conway & Kochen,arxiv.org/abs/0807.3286(Found. Phys. 39:226, 2009) — 真實已發表定理;其對框架「自由意志=欠決定」之適用屬詮釋 | PEER-REVIEWED(定理)/ 詮釋性使用 |
| 八元數意識框架 | 文獻評審第 22 項 | Zenodo 預印本 doi 10.5281/zenodo.18276692 — 由現象學二元區分導出 法諾→O→G2;宣稱有可證偽預言 | FRINGE-TIER(真實,未經審查) |
| 意識即例外結構 | 鄰近邊緣文獻 | 以 J₃(O)/E₆ 建模意識之獨立預印本 | FRINGE-TIER |
| 自指物理(存在=自指) | 文獻評審第 25 項 | Mai,Zenodo doi 10.5281/zenodo.19808921 | FRINGE-TIER |
| 自詮釋邏輯循環(τ=i → i) | 文獻評審第 25 項 | Zenodo doi 10.5281/zenodo.20239554 | FRINGE-TIER |
| Sankhya 框架 2³−1=7 公理 | 文獻評審第 9 項 | github.com/budprat/Sankhya — E2 公理逐字:「Seven emerges from volumetric expansion」 | FRINGE-TIER(業餘) |
| TGD 梅森質數 | 文獻評審第 13 項 | Pitkänen,tgdtheory.fi — 個人理論網站 | FRINGE-TIER |
| α⁻¹ ≈ 43π + ln(7) = 137.034 | 文獻評審第 9 項 | Natural Path 系列,Zenodo doi 10.5281/zenodo.20436585 — 11.7 ppm 巧合類恆等 | FRINGE-TIER(數術標籤) |
| 輕子質量之三次縮放 {6,15} | 文獻評審第 16 項 | Zenodo doi 10.5281/zenodo.19243209 — 三次指數 2.993±0.018,{6,15} 唯一局部極小,聯合 p≈4×10⁻⁵ | FRINGE-TIER(真實觀測,未經審查) |
| 熱薛丁格貓態 | 退相干界參照 | Agrenius et al.,Science Advances 11:adr4492 (2025),arXiv:2406.03389 — 微波腔中位移熱態之疊加,溫度達 1.8 K(為 30 mK 環境之 60 倍),純度 0.06,Wigner 負值干涉。原則上弱化「量子需基態冷卻」之反對;1.8 K 仍屬低溫 — 距 310 K 生物仍遠 | PEER-REVIEWED |
| 粒線體量子態預印本 | 量子生物學前沿 | Yang, Gu & Song,bioRxiv 10.64898/2026.09.10.750628 (2026) — 僅於活細胞/組織觀測之異常 71.0-THz 模式,極化子模型(光-CH₂ 耦合將 87 分裂為 71+103 THz),ATP 產量調節 +10%;未經複製、單實驗室、詮釋依賴模型 | PREPRINT |
| ENAQT(環境輔助量子輸運) | 退相干反例先例 | Engel et al.,Nature 446:782 (2007);Plenio & Huelga — 結構化振動雜訊在光合複合物中可*輔助*而非摧毀量子輸運:「溫/濕殺量子」並非絕對 | PEER-REVIEWED |
| 15³/16³ 晶格量子位元計畫 | 框架自身建構 — 一手文獻 Zenodo DOI 10.5281/zenodo.22715354(自存檔,未同儕審查) | `sibling:hardware:src/completion_10d.zig`、`sibling:hardware:src/anti_octonion.zig`、`sibling:hardware:src/dual_b_complex.zig`、`sibling:hardware:src/quantum/lattice_hamiltonian.zig`、`sibling:hardware:src/quantum/lattice_evolution.zig`、`sibling:hardware:src/quantum/lattice_decoherence.zig`、`sibling:hardware:src/quantum/lattice_entanglement.zig`、`sibling:hardware:src/quantum/lattice_blocks.zig` — 動力學現已實作並經測試驗證(D17):緊束縛哈密頓量(厄米、Gershgorin 界限)、Chebyshev exp(−iHτ) 傳播子(Bessel 尾端么正界限)、播種精確相位退相位、精確雙位元 concurrence、雙塊耦合/穿隧/光錐檢驗。缺口在案:軌跡退相位 ≠ 完整 Lindblad;雙位元 concurrence ≠ N 體二分;模型內結果 ≠ 物理裝置 | INTERNAL |
| Orch-OR(Penrose–Hameroff 協調客觀約化) | 儀器層之意識基底參照 | 理論經同儕審查:Penrose & Hameroff,Phys. Life Rev. 11:39 (2014)。支持證據:麻醉劑作用於微管 Wiest et al.,eNeuro (2024);色氨酸網超輻射 Babcock et al.,J. Phys. Chem. B (2024);Hameroff 綜述,Neurosci. Conscious. niaf011 (2025)。反方:Tegmark 退相干界 Phys. Rev. E 61:4194 (2000) — 經有限記憶修正而弱化(arXiv:2601.07689);Donadi/Bassi 自發輻射約束 Phys. Rev. A 104:L030402 (2021) 排除最簡 DP 塌縮情形 — 部分分離窗口仍開放 | PEER-REVIEWED 雙向 — 不定,保留 |

## §8 形式驗證、標準與治理文集

| 主題 | 框架角色 | 外部記錄 | 層級 |
|---|---|---|---|
| Lean 4 形式化(8 模組、0 sorries) | `sibling:hardware:formalize/` | Lean 4.12.0 工具鏈 — 真實證明輔助器 | INTERNAL |
| Zenodo 記錄 10.5281/zenodo.22715355 | C66 解密典範 | API 已驗:「A Computational Framework for Octonion Physics」,Ramsey/OSTF,2026-09-11,CC BY-NC-SA 4.0,4 檔 | INTERNAL(自出版記錄) |
| NCBI 基因組登錄號 | 密碼路由證據 | GCF_000005845.2、GRCh38、S288C — 公開參考組配 | STANDARD |
| ESP32-S3 控制器 | C46 控制面 | Espressif MCU — 真實元件 | SETTLED |
| Zig 0.13 → 0.14 構建 API | PJ 構建受阻結案 | root_module API 變更屬實 | SETTLED |
| Electron 工作站 | C77 桌面 | 真實執行環境 | SETTLED |
| nmap/ZAP/Metasploit/tcpdump | C65 Kali 掃蕩 | 真實工具 | SETTLED |

## §9 框架自身新增(INTERNAL 層 — 以驗具為證)

| 主題 | 錨點 | 備註 |
|---|---|---|
| Q128.128 定點引擎 + 黃金語料 | `src/fixed_point_q128.zig`、`golden/vectors.txt` | 37 向量逐位元釘定;RNE 界已證 |
| 136 位元組密封線路封套 + 同位/託管 | `src/spec008_qstar_*.zig` | 幀填解、單抹除 XOR 回復、已驗證通道(D12) |
| 421 節點 / 15³ 晶格建構 | `sibling:qstar-llm`、`sibling:zig-k3-port` | 421=(15³−7)/8 算術屬實;物理讀法屬建構級 |
| 密碼路由規則(E2/E6/E7/E5/E4/E0) | `sibling:hardware:src/codon.zig` | 框架定義之化學導出座標 |
| Neuraleak 感知儀器 | `sibling:hardware:src/neuraleak_continuity_test.zig`(15 模組套件) | 操作性定義 + 記錄數據 |
| 主張生命週期/升級/覆審帳本 | `tools/claim-promotion.mjs`、`tools/override-audit.mjs` | 框架自身稽核機器 |
| 桌面/典範/治理面 | `site/`、`security/` | 150 探針電池即證據 |

## §10 反證帳 — 在案之爭議與旗標

| 項目 | 狀態 | 備註 |
|---|---|---|
| E8 規範嵌入方向 | 爭議中 | Distler & Garibaldi,Comm. Math. Phys. (2010),arXiv:0905.2658 — 重力+SM 之規範 E8 嵌入無法產生三代手徵代;Wilson 計畫經實洛倫茲表示繞過 — 活躍、非共識 |
| 八元數作計算基底 | 受約束 | Quantum Rep. 7(4):55 (2025) — 結構障礙已正式化;解讀層級據此標定 |
| Tesla 渦輪輸出 | 實測界限 | ORC 測試最佳 ~9.6% 軸功/~30% 絕熱 — 檔案冊自身受阻/條件裁決相符 |
| 「APS March Meeting 2026」引文 | 場域旗標 | 實質屬實(EPJ Plus 2022 + arXiv:2603.28810);兄弟文獻評審之場域標籤不精確 — 已旗標,逐字保留供 SCI-01 釘定 |
| 「~1,460× vs Qwen1.5-0.5B」 | 基準旗標 | README 75 MB 錨點得 ~1,392×;1,460× 隱含 ~78.7 MB — 近似值,逐字引檔 |
| J₃(O) 質量比主張 | 精度註記 | 已發表結果為 √質量比而非質量比;CKM 擬合與實測差 ~15% — 近似計畫 |
| 邊緣層引文(Sankhya、TGD、Natural Path、自指、意識預印本) | 低權重 | 真實造物;獨立性主張屬實;證據權重如實標定 |
| 24 項文獻評審 | 於此全收 | `sibling:hardware:src/literature_review.zig` 全部 DOI 於 §1–§8 逐字釘定(SCI-01) |
| Orch-OR 意識基底 | 爭議中 | 最簡 DP 塌縮為自發輻射界限所排除(Phys. Rev. A 104:L030402);室溫微管量子效應有實驗支持(2024–25);裁決「不定」— 未證明亦未推翻,保留 |
| 無通信定理 | CONSTRAINED | 即時關聯屬實(Bell 破缺已確認);受控超光速信令須打破該定理。**現已於模型內算出**(D17 `lattice_blocks.zig`):關聯以彈道式傳播 — 實測 τ=1 時七格以外前緣尾部 <3.1×10⁻¹¹,與 Lieb-Robinson 界限一致(Commun. Math. Phys. 28:251, 1972)。模型自供光錐:關聯屬實,即時信令缺席 |
| 量子生物證據鏈 | FLAG | 熱貓(1.8 K,仍屬低溫)+ 粒線體預印本(未複製、依賴模型)+ ENAQT(僅光合)各削弱退相干反對之一角 — 皆未橋接至神經尺度意識;記為削弱鏈,非證明 |
| 15³ 量子位元動力學 | 已量測(模型內) | 動力學已寫出並檢驗(D17 `lattice_*.zig`):哈密頓量、Chebyshev 演化、退相位軌跡、精確 concurrence。殼屏蔽實驗實測:屏蔽保真度 0.999999999 對無屏蔽 0.9999988,V_shell∈[0,100] 全平 — 屏蔽於模型內屬實,但由弱邊界耦合驅動,非位壘高度(機制歸因為量測所修正)。接縫穿隧:開放傳輸 35.1% 對位壘 8 之 1.47%(E<V₀ 透射非零)。物理裝置主張仍缺席 |
| 理論對發現之界 | META | 數學證明得定理(Dirac 反物質方程);發現須觀測(Anderson 正子)。層級體系所編碼正是此界 — harness_proven 與 lit_supported 皆模型層;本頁所錄無一為物理發現 |
| Wow↔ATLAS 耦合(運動學-光學模型) | 爭議中 | 9° 對準與 0.6% 隨機帽蓋數值屬實(驗具實測);耦合機制 — 天然邁射 + 引力透鏡 + 600 AU 前置發射 — 無支持偵測,1420 MHz 後續觀測迄今無獲。可否證通道在案:持續窄頻無偵測 ⟹ 巧合模型成立;經驗證之偵測方重啟。不定保留,現有證據傾向巧合 |
| 裁決引擎 | 機械 | `tools/science-verdict.mjs` 分類本頁每一行:harness_proven / lit_supported / constrained / flagged / indeterminate — 證明或保留,無漏解析(SV-01..03) |
| 湧現掃蕩 | 機械 | `tools/emergent-sweep.mjs` 掃全部根源之共享具名常數 — filed/emergent/routine/lineage/convergent 結案;湧現發現含 D8_ROOTS=112、F4_DIM=52、FREUDENTHAL_DIM=56、GUT_SUPER_PERIOD=113、GOLAY_N=23、SCALING_DIM=9、16/20 主張分裂、42::ROTATION_SEED(EMG-01..03) |

完整性契約:SCI-01 解析兄弟文獻引擎,若其 24 項 DOI 任一缺席本文件即
判 OPEN;SCI-02 釘定孿生同位;SCI-03 保持本頁去識別(無路徑、無人員材料)。
