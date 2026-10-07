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
