# FANO-1 作業手冊 — 工作站與艦隊正典

**狀態:** 生效中 · **日期:** 2026-10-07
**範圍:** 桌面所有未曾成文之運作 — 身分、漫遊、轉移、重置、Electron 工作站、艦隊正典、以及掃蕩作業手冊。本檔與掃蕩結果相左時,以掃蕩為準 — 修正文件,勿找藉口。

---

## 1. 身分

- **金鑰對:** Ed25519,自 32 位元組種子展開。`sha256(pk)` 即為指紋 — 創世提示、名冊條目、誓約欄位皆同。
- **密鑰庫:** 種子以 AES-256-GCM 封裝,金鑰由通行語經 PBKDF2 導出。解封之 `session.sk` 僅存於解鎖期間之頁面記憶體 — 重載即重新解鎖,此乃設計(見「誠實限制」)。
- **TOTP:** RFC6238 第二因子(Google-Authenticator 等級)。註冊時選配;一旦啟用即為必要。時鐘綁定;秘密僅於設定時揭示一次。
- **解鎖節流:** 跨重載之持續性指數退避(`fano1.auth.fail`)。深度而非城牆 — 本機攻擊者可清除 localStorage;節流守護誠實路徑。
- **誓約:** 註冊證明 pk 連續性並簽署創始誓約;桌之創始為雜湊提交之事實,非介面標籤。
- **創始非將階。** 未創始之桌之首個註冊寫入創世記錄 — 惟 FLEET-ADMIRAL 唯源自釘選呼號(`ramsey 006`)宣稱創世,或艦隊錨定授權(漫遊)。其餘任何首個註冊以 **CADET** 創始桌面(基礎階層 — 程式內部仍稱 `field_agent`)— 新桌為新兵,非將帥府。2026-10-07 之前,任何首個註冊皆自封 FLEET-ADMIRAL(發現並修復之缺陷:公開部署上以 `marcus` 註冊即奪旗艦席位;DESK-06/07 現鎮守此界)。晉升唯經已列名 STATION-CHIEF+ 發行者之授權,或艦隊錨點 — 絕不因先進門而得。
- **OSTF 官職為職位而非名字。** 戰略指揮席位 — 議會銜(副/少將官職、倫理與平權准將、財務作戰上將)、顧問技術權責(首席技術系統架構師、首席安全與製造官、特級準尉、研究主管)、各 chief-of 官職,及一切軍銜前綴呼號(`admiral <名>`、`captain <名>`、`commander …`)— 皆列監察名單:無 STATION-CHIEF+ 發行者之授權憑證即拒絕註冊。獲授之官職仍以 CADET 落地 — **官銜是名號,非安全許可**(DESK-08/09 鎮守雙側;授權僅得席位一次)。
- **職位以申請而得,非自取。** OSTF 內之職務經分部鏈:`request-branch <division>` 以申請者自身金鑰簽署 FANO-BRANCH-REQ-v1 → 憑證經任何通道攜行 → 艦隊司令於指揮套件核准或否決 → 核准即鑄 FANO-BRANCH-v1 簽署憑證。`branchOf` 驗證簽章＋在冊簽發者＋效期。呼號授權命其名;分部憑證安其位。
- **機器人為受隔離之學員。** `detectAutomation()` 標記自動化樣態之註冊(webdriver、selenium/phantom/cdc_ 全域、無頭/機器人 UA 為強訊號;缺語系、外掛或人類熵為弱訊號對)。受標記之身分固定為 CADET 並蓋 `rec.contained` — 即便機器人宣稱釘選呼號亦為學員。受隔離工作階段悉數封閉(授權、憑證、漫遊、分部、名冊、TOTP、匯出、線路連線/在線/傳訊/邀請、受治理之橋);桌面僅啟 academy.os。釋放為人類裁決:STATION-CHIEF+ 或艦隊將旗簽署綁定主體 pk 之 `FANO-CONTAIN-v1` 晉升紙本 — 受隔離之桌以 `promotion <token>` 或告示欄位出示。指揮套件之 CONTAINMENT 面板列舉每一標記之證據。偵測為啟發式 — 僅閘控桌面權限,非人性證明;誤標之人類循同一裁決途徑。廣域邊界將壞封與超速來源記入 `bot-ledger.json` 為證,絕不靜默丟棄。

## 2. 起源

一個起源即一台裝置。`localhost` 與 `::1` 皆彈跳至 `127.0.0.1` — 正典主機名 — 使儲存庫絕不因迴路拼法而悄然分裂。

| 起源 | 桌面 |
|---|---|
| `http://127.0.0.1:8080` | 瀏覽器桌面(由 `tools/serve.py` 供應) |
| `http://127.0.0.1:8901` | Electron 海軍部桌面(內嵌伺服器,`persist:admiralty` 分割區) |
| `http://127.0.0.1:8902` | KALI 表面探測所用之硬化測試桌面 |

瀏覽器桌面與 Electron 桌面即便同機,亦為**不同裝置**。記錄不同步 — 須以桌面轉移搬運(§4)或重新註冊。

## 3. 漫遊 — FANO-ROOT-v1

兩種憑證,皆為對發行者金鑰驗證之 `FANO-ROOT-v1` 簽署授權:

| 憑證 | `sub` | 效期 | 用途 |
|---|---|---|---|
| **綁定驗證器** | 自身 pk 十六進位 | 365 日 | 自有之第二桌 — 唯己鑰可領 |
| **漫遊紙本(ROAMING PAPER)** | `null`(未綁定) | 30 日 | 艦隊任何桌 — 不奪創始即可註冊 |

漫遊紙本由 `7q` → FLAG AUTHENTICATOR → **ROAMING PAPER** 鑄造,唯創始旗艦席位可鑄(需 `fleet_admiral` 角色)。於外桌註冊:誓約 → 註冊 `ramsey 006` → 將紙本貼入 **grant token** 欄位。桌面呼叫 `bindFleetFlag`,於已發布之 `fleet-genesis.json` 中解析 `admiral`/`flag-seat` 成員,並以其公鑰驗證授權簽名。爾即以 FLEET-ADMIRAL 入座;宿主桌之創始分毫不動。

**持票憑證警告 — 讀一次:** `sub:null` 意即持紙者持席位。存於收件匣、截圖、剪貼簿歷史之漫遊紙本,即為行走之旗艦席位。鑄之、用之、任其亡。三十日即繮繩。

### 3a. 信任內部 — 桌面驗證何事(第二波逆向稽核)

憑證與授權機件經逐件逆向拆解;以下不變式現已成立並受探測(AUTH-01..09):

- **角色界限。** `verifyCert` 拒絕任何角色非 `0..5` 整數之憑證 — 簽名有效之 `role:99` 照樣斃於界限(AUTH-02)。
- **旗艦信任由推導而來,非儲存之物。** 釘定呼號之高階憑證,解鎖時須儲存之授權*重新驗證* — 發行者須在名冊或為艦隊錨定、效期未滿、未經撤銷。舊碼信任 `importGrant` 路徑從未寫入之 `_fleet` 標記(AUTH-08)。
- **領用不觸簽名。** `claimGrant` 改記 `g.claimed`,不再改寫 `g.sub` — 舊改寫曾使漫遊授權之簽名於領用後失效。`verifyGrant` 以重驗未綁本體之方式兼容舊帳本(AUTH-08 實證新路;COMM-19/20/21 持守全週期)。
- **名冊異動為特權。** `addIssuer`/`removeIssuer` 需 STATION-CHIEF+ 會話 — 未設門檻之 API 曾使任何會話皆可冊封自鑄憑證之發行者。創始金鑰不可移除(AUTH-01、AUTH-06)。創世播種、舊桌解鎖、桌面匯入皆走內部 raw 路徑。
- **失效紙本自清。** `grants()` 讀取時即剪除過期條目 — 漫遊紙本失效,其所錨定之席位隨之失效(AUTH-03)。
- **撤銷機制已立。** `revokeCallsign`(STATION-CHIEF+,Command 面板 REVOKE)記錄撤銷;授權紙本留存為證據,唯 `verifyGrant`/`checkCallsign` 一律拒之。桌面本地、永久生效(AUTH-04)。
- **TOTP 共享節流。** 六位數錯碼與錯誤口令同計一數 — 五錯即鎖(AUTH-05)。
- **鎖定即滅密。** `lock()` 先將解封種子填零再清會話;`burn()` 先鎖而後重置節流計數,以迎新生(AUTH-07)。密鑰庫仍為 PBKDF2×100k + AES-GCM — 無改。

### 3b. 線路內部 — comms.os 驗證何事(第三波逆向稽核)

`fano-comms.js` 同經拆解;以下不變式現已成立並受探測(WIRE-01..07):

- **回報長度皆受箝制。** 每處 WASM 輸出讀取之 `n` 以目標緩衝為上限 — 超量之 `n` 不得再將毗鄰堆積拉入解碼字串(WIRE-01)。
- **撥號僅限 ws/wss。** `connect` 於觸及 WASM 前即拒絕其他 scheme 與短/非 hex 之對端 id;同一 `pkOf` 六十四 hex 門檻守護 `addContact`、`sendMsg` 與邀請之 network id(WIRE-02、WIRE-06)。
- **邀請曾死 — 現已校準。** 舊呼叫將幻影 `network_id_len` 傳入 `rations_invite_create`,使後續引數悉數錯位(`u64` 效期又以 Number 傳入 — WASM ABI 需 BigInt)。簽名現已更正;角色欄為網路列舉 `0=admin 1=moderator 2=user`,非桌面層級:簽發需 STATION-CHIEF+,admin 邀請屬旗艦席位專屬(WIRE-03)。
- **在線不得借階。** 未簽名之在線文本若屬釘定或受限呼號,不再充當聯絡名 — 自稱「fleet admiral」之對端顯示為 `peer-<id>`(WIRE-04)。
- **Shamir 設界。** k/n/密文/份數之上限於 GF(256) 運算前即拒絕荒謬配置(WIRE-05)。
- **全檔無 `prompt()`。** MSG 改為行內撰寫 — Electron 桌面無原生對話框可擲(WIRE-07)。

### 3c. 桌面內部 — 玻璃所渲染者(第四波逆向稽核)

`fano-desktop.js`/`fano-reset.js`/`fano-i18n.js` 同經拆解(DESK-10..15):

- **桌面渲染實體,非標記。** 凡動態字串入 `innerHTML` 皆經 `esc()` — 視窗標題、解鎖身分區塊、資料夾列、圖示標籤。攜標記之呼號以純文本顯示(DESK-10)。
- **焚毀掃盡全帳。** 重置普查涵蓋桌面所寫全部 16 個 `fano1.*` 鍵 — 隔離、撤銷、分部帳本、節流計數、訓令、桌面存檔、語系偏好。一次裁決,不留孤帳(DESK-11)。
- **雙生完全一致。** i18n 雙方各 160 鍵,探測執行 — 死鍵屬合併失誤,非翻譯(DESK-12)。
- **學院計數誠實。** 申報 530 = 實錄 530,每課完整;面板以陣列實數核對申報,不符即明言(DESK-13)。
- **裁決先武裝而後執行。** 隔離 BURN 為雙擊之舉(DESK-14);全桌面無原生對話框 — 一切確認皆為 DOM 元件(DESK-15)。

### 3d. 制服與語言 — 桌面所通過者(第五波逆向稽核)

`fano-desktop.css`/`dossier.css`/`fano-i18n.js` 續經拆解(DESK-16..20):

- **每套制服皆過 AA。** 五套配色墨色對比皆 ≥4.5:1(最差現為 4.66);`desk-dim` 與 WHITEHALL 強調色原不足,已重新調校(DESK-16)。
- **動效是禮數,非權利。** `prefers-reduced-motion` 令旋轉平面、開機淡入與一切過場靜止(DESK-17)。
- **檔案列印如紙。** `@media print` 剝除導覽、浮水印、工作列與圖示;檔案頁守分頁紀律(DESK-18)。
- **窄桌仍是桌。** 50rem 以下圖表換行、狀態燈讓位、start-menu 限幅 92vw(DESK-19)。
- **桌面雙語並行。** 約二百介面字面量 — 浮訊、套件區段、POST 行、手冊、監測、成就、彩蛋 — 皆經 `t()`;字典雙方各 356 鍵,完全一致(DESK-20)。殘留:終端機命令語料與 ANOMALY_LORE 仍屬英文正典,留待雙生稽核。

### 3e. 線路內部 — 核心所拒絕者(第六波逆向稽核)

`deps/qstar-transport` 與 `src/spec008_*` 測試組經拆解(ZIG-01..03):

- **平裝本解碼器於 OOM 下記憶體安全。** 分額主體僅釋放已填充者 — 舊 `defer` 先於資料,觸及未定義槽位。
- **劣造分額被拒。** 重複 x 座標與零 x 分額命中 `InvalidShare`;y 長不等命中 `MismatchedShares` — Lagrange 分母不再靜默除零(ZIG-02)。
- **每個解碼器皆撐過變異組。** 288 個種子截斷與損毀案例橫跨 QR、音訊、平裝本、隱寫、複語 — 錯誤或乾淨解碼,絕無 panic 或洩漏(ZIG-03)。
- **核心維持整數限定。** `src/*.zig` 零未註記浮點;render/mesh 之 f32 讀取已標記 sidecar 邊界斷言(ZIG-01)。

### 3f. 電池本身 — 掃描組現所證明者(第七波逆向稽核)

探測基礎設施本波經拆解;電池現稽核自身證據:

- **缺席服務 ≠ 缺陷。** 被拒絕之 socket 標記探測為 NOTED(遞延),橫跨 `suite.mjs` 八處 relay/邊界 catch;唯真正的測試破壞報 ERROR。
- **旗座惟一。** `bindFleetFlag` 計數 genesis 文件中相異之旗座金鑰 — 兩名申索者一律拒絕綁定(SENT-14)。舊制乃陣列末位靜默勝出。
- **晉升紙券與宣言同韁。** SENT-11..14:旗簽 FANO-CONTAIN-v1 釋放受限 desk;過期與簽章竄改之紙券皆拒。
- **損耗邊界飄忽已絕。** COMM-06 以有界預算重發 — fire-and-forget 本無投遞保證,單一丟幀不再翻轉判決。
- **帳目詞表受控。** HARN-01 對每筆發現列驗證成文之 verdict/severity 集合;HARN-02 以宣言紀律視 `fleet-map.json` — FLEETMAPv1、24 小時內、全員實測。
- **超能帳目為最新。** 34/34 PROVEN;admiral 成員已入 genesis,漫遊錨定驗證全程實測。

### 3g. 艦隊正典 — 鑄造與載入紀律(第八波逆向稽核)

簽署公報與創世工具今與桌面同守先驗後寫之紀:

- **鑄造須明示。** `fleet-manifest.mjs` 裸行僅印未簽本體,不觸檔;`--emit` 簽署;`--push` 暫存正典**雙份**(`fleet-manifest.json` 與 `site/fleet-manifest.json`)— 舊路徑僅交一份,致 parity 閘轉紅。
- **載入設閘。** `--verify` 檢 spec、canon(payload) 簽名、創世系譜、公鑰指紋、時間戳、root↔site 一致 — 信任公報前先過六項實測(FLEET-01)。
- **目擊有期。** 逾 24 小時之 rendezvous 節點退出簽署文件;帳目仍存為證據。beacon 源埠改標 `observed_port` — 所見,非可撥。
- **旗座惟一。** `fleet-genesis-update.mjs` 入座前以名或角色清除一切旗座申索,寫入前對每枚簽名就 canon 自驗,單簽鑄造發警。歧義即敵意 — 各桌拒錨(SENT-14)。

### 3h. 叢集 — 家族架所證者(第九波逆向稽核)

兄弟專案為家族檔案,非宣傳品 — 架上每個數字皆須逐字溯源至該樹自身之 README/AGENTS(CLUSTER-01 親讀文檔強制執行)。證據分級:

- **本地實證。** Rations 橋接為上游真碼(`e932053`):SPEC-007 邀請紙券線路相容與劣化媒介/聲學壓力測試組已註冊於 `tests.zig`(CLUSTER-03),另驗證公開能力投影 — 3,472 列 × 18 域,計數一致,無絕對路徑或金鑰素材(CLUSTER-02)。
- **文件具結。** qstar-llm(2,610+ 測試)、zig-k3-port(token-identical)、TheUE(50 項登錄)、ThePlatform(Q# parity)、euz(6,372+ 測試)、Rations(116.9% 棘輪) — 皆引自其自身文檔,未經重建。兄弟樹缺席時探針遞延,絕不虛構。
- **邊界守住。** 鄰庫 WIP 原樣保留 — 實驗單庫之 dirty 路徑屬其主之作,非本戰役者。

### 3i. 雙語一典(第十波雙生稽核)

最後的純英語料已清償。異常編纂攜完整中文孿生(`ANOMALY_LORE_ZH` — 139/139 條連同兩條備援,判決語域一致),終端機說明逐行對應(`TERM_HELP_ZH`),`termZh()` 守於執行邊界 — 散文答覆有中文對映,導引標籤有前綴譯表。攜活體識別子之行 — 指紋、十六進位金鑰、授權主體 — 仍守指令正典:翻譯金鑰之封套即是謊言。DESK-21/22 以量測強制其對等。

### 3j. 藍圖稽核(統一生態計畫之開端波次)

一份七階段統一發展計畫已歸檔入櫃,並逐階段對照艦隊評級 — 是稽核計畫對照桌面,而非桌面對照計畫。安全階段已直接晉升:本電池即該階段。智慧編排、永續層、指揮中樞、課程體系各為部分達成 — 治理式提供者橋接、已封檔案鏈、桌面本身、學院俱已矗立;所餘缺口於後續波次化為治理式桌面表面。生成式影片與沉浸 3D 宣告為邊界:桌面將攜分鏡簿與 2D 投影,絕不假造能力。計畫所列外部捐贈專案僅為調查引證 — 絕不併入。C91 載此稽核;密櫃存其全圖。

### 3k. engine.os — 已簽名冊(統一生態第二波)

藍圖首個缺口已補:`tools/engine-manifest.mjs` 簽署單一 ENGINEMANIFESTv1 名冊,收錄此桌可信之每一運行時 — 治理橋接、三路 Ollama 提供者、兩枚 WASM 核心(spec007、rations — rations 之雜湊須與其公開側車一致)、五份資產登錄、以及以其掃描錨點雜湊釘定之安全電池。典律同艦隊公報:`--emit` 簽署 root+site 雙份,`--verify` 為載入閘(規格、簽名、創世系譜、金鑰指紋、時戳、雙份一致、**清點** — 每枚已簽署 sha256 須仍與盤上檔案相符),裸執行不寫檔。終端 `engine` 指令(與 engine.os 圖示)開啟窗格,依種類分組並以證據標示各運行時 — verified-here、bridge-mediated、doc-cited — 絕不擔保可達。ENG-01..04 為其探針。

### 3l. continuity.os — 永續表面(統一生態第三波)

藍圖第二個缺口已補。`tools/archive-projection.mjs` 將 `~/.archives` 語料投影為 `site/assets/archive-manifest.json` — 僅基名與封存狀態;原始語料絕不離機,未封條目如實列出而非隱藏。`continuity` 指令(與 continuity.os 圖示)開啟窗格:上方為已封檔案名冊,下方為桌本地記錄庫 — 文件、專案、任務卡片存入 `fano1.continuity`,已登錄於重置普查,重置教義如對他庫般一併清掃。CONT-01..03 以活體語料稽核投影(名稱、封存、計數),並查記錄庫之普查歸屬。

### 3m. editor.os — 桌內打字機(統一生態第四波)

藍圖第三階段要一座含內建 IDE 之 2D 指揮中樞;桌面本身早已是指揮中樞,comms.os 亦早已是社群樞紐 — 所缺者唯編輯器。`editor.os` 為永續庫上之純文字文件表面:kind 為 `document` 之記錄於此新建、編輯、銷毀,附即時行列計數,絕無遠端同步。無 eval、無轉譯器、無偽裝之編譯器 — CSP 規則自身即是探針(LIB-02)。`edit` 開啟之。社群樞紐之角色仍歸屬其本位記錄:comms.os(LIB-03)。

### 3n. director.os 與星雲 — 製作與投影(統一生態第五波)

藍圖之影片與沉浸階段以誠實之界內移植落地。`tools/slate-ledger.mjs`
裁出 `site/assets/production-ledger.json` — 桌面之真實正典清冊
(91 項主張、139 條密典、32 頁面、8 家族、8 視圖 — 共 278 項資產),
每波重製,俾分鏡表永不偏移檔案(PROD-01)。`director.os` 即分鏡
表面:正典資產落於桌本分鏡清單(`fano1.slate`,由重置普查清掃 —
PROD-02),附鏡次計數與判決註記,絕無渲染、上傳或 XR 之虛稱。
`nebula` 視圖為藍圖沉浸表面之誠實實現:真實能力域與家族名冊之
2D 投影,依視圖甲板真理標籤之律標為示意性 — 佈局為示意,資料為
真實(PROD-03)。`director` 與 `nebula` 指令開啟兩者;兩表面皆披
雙語制服。

### 3o. course-gen — 生成式課程(統一生態第六波)

藍圖末段閉合戰役自身所記之環:`tools/course-gen.mjs` 讀取
`security/out/` 下之波次報告 — 所建與所驗之首手記錄 — 確定性
產出學院課程。裸執行為試跑;`--emit` 併入 `academy-manifest.json`;
`--verify` 證明已錄之生成集合逐字節復現(CURR-01)。生成課程明標
而非漂洗:`origin:"generated"`(學院窗格標章)、
`evidence:"wave_report"` 且每條來源路徑皆可於倉庫內解析(CURR-02)、
`assessment:"deterministic_review_required"`,並誠實標為
`language:["en"]` — 機生文本不虛稱已審中文雙生(CURR-03)。清單現
錄 546 課:530 人文/規範典課 + 16 生成戰役模組。至此藍圖七階段悉數
晉升或明標邊界 — `BLUEPRINT-MAP.md` 載移植後評級,C92 記其狀。

### 3p. cluster-census — 諸根皆立案(簡報戰第零波)

簡報始於清點:`tools/cluster-census.mjs` 巡遍正典根表 — **33 個專案
根**:26 第一方、3 捐贈外置架、3 空/斷位、1 資產庫 — 並產出
`site/assets/cluster-registry.json`,為僅攜代號、領域、職司與證據
等級之淨化投影。來源路徑於工具內保持 `$HOME` 相對;成品不含絕對
路徑、金鑰素材或軍官姓名(CENS-02 — 落地前即逮獲一個以主人命名之
捐贈目錄)。`--verify` 僅查身分層一致 — 名稱、存在、類別、證據等級;
`file_count` 明定為快照標籤,因普查檔案自身即居於被計數之根內
(CENS-01、CENS-03)。完整檔卡 — 絕對路徑、git 頭、變更數 — 存於密
櫃側之 `CLUSTER-CENSUS.md`。

### 3q. d1 回退稽核 — 硬體家族與本桌自身

首輪簡報以十步回退開發規程巡遍硬體單倉:**qstar-llm**(格點原生
推理 — 感智引擎之算層;`fixed_point.zig` 模組測試全綠)、
**zig-k3-port**(kimi-k3-in-c 之整數 Q128.128 移植;`zig build test`
靜默全綠;攜 wasm64-memory64 發現 — 唯樹內 `k3w` 解譯器可運行)、
**移植前保存岔**(凍結證據 — 永不重建,永不刪除)、**TheUE**
(決定性 ChiralMath 核;`audit-capabilities` 一致性治具全綠 — 即
`zig-capability-registry.json` 投影之產生器)、**BS**(Wow! 訊號
聲明稽核 — 其索引→重算→標籤帳式即 d6 聲明覆審之範式),及
**Spec-007 自審**。

自審逮得真偏移:i18n 規範於第五波後之面板落地,卻從未回溯至舊介
面 — 受管橋接、學院、引擎標語、Q 部門、系統監視、開始選單、解鎖
流程、收容通告與旗艦指揮套件攜約百則英文字面,DESK-20 稽核所不及
(串接中段字串、`btn()/inp()` 輔助呼出、innerHTML 文節、
`copyText` 標籤)。現皆經 `t()` 路由 — 雙側各增約 96 鍵,520==520
對偶,`t()` 廣義化為不定參 `%s`,異常明細之內聯條件式亦歸併入辭
典。**DESK-23** 將殘存字面池棘輪至僅識別符白名單 — 產品名與終端
提示符;視窗標題依慣例守英文,因其兼任 `openWins` 識別鍵。全檔
卡見 `thoughts&convos/CLUSTER-CENSUS.md` §D1。

## 4. 桌面轉移 — FANO-DESK-v1

誓約終端之 `export-desk` / `import-desk`,或轉移畫面之 DOM 匯入路徑(Electron 相容 — 身分路徑全程無 `prompt()`)。套件攜帶封裝之密鑰庫記錄與創始狀態,由匯出桌之金鑰簽署。私鑰素材全程封裝;匯入桌拒絕覆於已創始之桌,亦拒絕外來創始之偽造。雙向通行:瀏覽器↔Electron 任意方向。具橋接之處(§6),鑄造/匯出之權杖自動推送至系統剪貼簿。

## 5. 重置教範

`reset.html` 為焚毀路徑。先示**普查** — 呼號、pk 指紋、創世旗艦狀態、TOTP 需求、失敗計數、桌態存在 — 而後焚記錄,並於同一鏈中清掃兄弟迴路起源之記錄(一次裁決,掃盡諸庫)。

守衛模式,經 team-sweep-2 RED/GRAY 實證:

- **常桌** — 自由重置。爾之桌,爾之裁;無誤鎖。
- **旗艦桌於其群集起源** — 單方重置。主權群集即教範自設之例外。
- **旗艦桌於外來起源** — 須 `FANO-RESET-v1` 權杖,攜**全體創世成員**對正典本體之 Ed25519 簽名;綁定創始呼號,24 小時衰減窗。偽造、部分、過期、竄改呼號之權杖皆拒。
  `security/admiralty-reset-token.mjs` 鑄造雙簽權杖(digit 本機 + sheraton 經 ssh — 私鑰絕不遠行)。

## 6. Electron 海軍部桌面 — 工作站

啟動:`admiralty-desk/desk.sh`(剝除 dev shell 洩漏之 `ELECTRON_RUN_AS_NODE`)。應用於 `http://127.0.0.1:8901` 內嵌站台,渲染器沙箱化(`contextIsolation`、`sandbox`、`nodeIntegration: false`),身分存於 `persist:admiralty` 分割區 — Electron 之摧毀或重裝絕不及瀏覽器桌,反之亦然。

**視窗控制**(`before-input-event`,視窗範圍):

| 按鍵 | 動作 |
|---|---|
| F11 | 切換全螢幕 |
| Esc | 退出全螢幕(桌面介面不綁 Esc) |
| Ctrl+M | 最小化 |
| Ctrl+Shift+Q | 關閉工作站 |
| Alt+F4 | 原生關閉 |

開始選單經 `ADMIRALTY_DESK` IPC 橋提供相同殼層項目(`desk:quit` / `desk:minimize` / `desk:fullscreen`)。

**作業系統輸入層** — 桌面行為如真實作業系統表面:

- **編輯快捷鍵** — 隱藏之原生編輯選單提供真實角色:Ctrl+C/X/V/A 於每頁每欄可用。
- **右鍵選單** — 原生內容選單:可編欄位之剪下/複製/貼上/全選,選取處之複製。
- **剪貼簿橋** — `ADMIRALTY_DESK.clipboard.{write,read}` → 經 IPC 達系統剪貼簿。`desk.js` 之 `copyText()` 優先使用橋接,退回 `navigator.clipboard` — 瀏覽器桌面亦可用。
- **自動複製** — `export-desk`、驗證器鑄造/更新/匯出、漫遊紙本鑄造,皆將權杖逕推系統剪貼簿。GENESIS SEAT 備 **COPY PK** 鈕(完整 64 十六進位公鑰,非 16 字元指紋 — 指紋供人讀,公鑰供創世)。
- **滑鼠捕獲** — `pointerLock` 權限僅授桌面起源;遊戲與沙箱可捕游標,其餘皆拒。
- **可選取內容** — `.win-body` 內容如真實作業系統可選取;視窗外框(標題列、圖示、工作列)維持鎖定。

**套件配色** — `.cmdsuite` 以作戰暗色主控台配色渲染(`--console-bg`,磷光墨色)。其居於 `.win-body` 之內,而 `.win-body` 為卷宗頁面上 `--win-paper`(米白) — 套件昔日因承襲紙色而致暗字於亮底、不可卒讀。已修;分野乃有意為之:套件為主控台,卷宗頁面為紙。

## 7. 艦隊正典 — 創世、宣言、會合

### 創世(`fleet-genesis.json`)

艦隊信任之根:正典 JSON,由創世之根(`digit`、`sheraton`)以 Ed25519 簽署。成員受背書而非簽署者 — `admiral` 旗艦席位**列於**創世而不簽之。現行形態:3 成員,酬載 `sha256:95f5b05a…`。

**修訂:** `security/fleet-genesis-update.mjs --pk <64-hex>` 納入成員、重新正典化、經雙根重新簽署(digit 本機、sheraton 經 ssh),並同寫 `fleet-genesis.json` 與 `site/fleet-genesis.json` 兩份。publish-check 以位元逐一閘守兩副本,使漂移不再復發。

**TOFU 重新錨定:** 桌面錨定其首取之創世。刻意之修訂於已錨桌顯現為 **GENESIS CONFLICT** — 此乃守衛運作,非故障。重新錨定之路徑為刻意且手動:驗證新酬載之成員簽名(bootstrap 於報告衝突前已行之),而後退役舊錨(Linux 桌面為 `~/.config/fleet/genesis.json`)。絕不自動覆寫衝突。

### 宣言(`fleet-manifest.json` + `fleet_bootstrap.py`)

佈告欄:ed25519 簽署之宣言經 git push 發布,同儕經 `raw.githubusercontent.com` 取閱。`fleet-manifest.mjs --emit` 依現行創世雜湊重新生成,並同寫根目錄與 `site/` 兩份(同一正典閘)。`fleet_bootstrap.py` 驗證已錨創世,要求宣言引證該確切創世雜湊**且**由創世成員簽署,而後充填會合。佈告欄遭竄改 → GENESIS CONFLICT 或簽署者拒絕,高聲示警。注意:push 後 raw.githubusercontent CDN 續供舊版數分鐘 — bootstrap 於裁決前先重試時滯。

### 會合(`fleet-map.mjs`)

探測實測之通訊錄,非斷言之名稱:digit 之 v6 邊界、sheraton v4+v6、mesh 節點 AP/STA 綁定。身分即封印;位置由量測得之。不可及之主機如實呈報,不加粉飾(HTTP 逾時處理於 2026-10-07 修補 — 死 mesh IP 迅即延遲而非掛起)。

### 種子空投(`seed-drop.mjs`)

桌對桌一次性密碼本之種子空投。鑄造計畫產生**每對一投** — 兄弟覆蓋屬鑄造時之冗餘裁決,非驗證器應有之假定(RAT-07 記錄此邊界;`rations-stress.mjs` 現於單一過期案例中佈建真實兄弟)。`--audit` 唯讀計畫而不鑄造。

## 8. 掃蕩作業手冊

順序攸關 — 若干套件消費先行步驟產出之構件或埠:

```sh
# 1. 生成 gov-stress 所需之格點構件
node security/lattice-probe.mjs          # 寫出 out/ivector-lattice.json
node security/gov-stress.mjs

# 2. 鑄造空投,而後壓力測試
node security/seed-drop.mjs
node security/rations-stress.mjs

# 3. 綜合團隊掃蕩(RED/BLUE/BLACK/GRAY/COMM/DESK/SPEC004)
node security/team-sweep-2.mjs

# 4. 時點稽核
node security/sentinel-sweep.mjs
node security/superpowers-audit.mjs      # 即時驗證創世簽名
node security/capstone-audit.mjs

# 5. KALI 表面 — 需 docker 實驗室 + 桌面目標
export HYDRA_TOKEN=… WAN_TOKEN=…         # compose 拒絕無閘啟動
docker compose -f security/docker-compose.wan.yml up -d
python3 tools/serve.py --port 8902 &     # 硬化桌面目標
node security/kali-sweep.mjs             # 缺席服務 → NOTED,非崩潰
RELAY_URL=ws://localhost:18081/ws RELAY_HTTP=http://localhost:18081 \
    node security/suite.mjs
docker compose -f security/docker-compose.wan.yml down

# 6. 正典 + 部署閘(姓氏絆線、創世/宣言對等、測試)
./tools/publish-check.sh
```

或由 `comms-suite.mjs` 代為架設實驗室:其生成逐次權杖並傳予 compose — **惟須傳 `--keep`**(argv 旗標;`KEEP=1` 環境變數無效),否則退出即拆。

**裁決詞彙:** `HELD`/`HARDENED` = 經測而抗之;`NOTED`/`BOUNDARY` = 觀測或架構所囿(已記錄);`OPEN`/`EXPLOITED`/`FRACTURE` = 真實破口 — 不得出貨。

**`out/findings.json` 為生成物** — 每次套件運行皆覆寫。其為證據,非源碼:豁免 gh-pages 位元對等,絕不手編。

## 9. 誠實限制

記錄之,非豁免之:

1. `session.sk` 於解鎖期間存於頁面記憶體 — 重載即重解;已解鎖會話遭頁面層入侵即為金鑰外洩。
2. 名冊注入乃桌本地之戲劇 — 改變爾之螢幕所見,非艦隊所信(已發布創世閘守一切)。
3. 線路重放/去重屬 WASM 端 — JS 收件匣所見即電話層佇列;中繼器重放封包屬核心議題,非介面之事。
4. WAN 邊界之外來 IPv6 入站未驗 — IPv4 受 CGNAT 阻擋,AAAA/紀錄端驗證待決。
5. TOFU 冷啟:桌之首取創世於具備帶外錨定前,仍可能被供予自洽之攻擊者盤面。
6. stega/carriage 依賴之 `capacity()` 回傳註冊表槽位,非位元組計數 — 以實測往返為準,勿依之規劃預算。
7. ESP32 mesh 節點未供電時呈報不可及 — 此乃探測如實以告,非故障。
8. 136 位元組封套之酬載尾端為未鑑別之草稿區 — 接收方必須遵 `plen`。

---

*孿生檔:`docs/en/fano-1-operations.en.md`。本檔所綜述之總帳列見 `spec-008-ipv6-tensor` 與 `fleet-superpowers`;能力主張見 `fleet-superpowers`(28/28 即時驗證)。*
