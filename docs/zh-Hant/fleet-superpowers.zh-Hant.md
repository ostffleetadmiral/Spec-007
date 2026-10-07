# 艦隊超能力 — 安全團隊能力總帳

日期:2026-10-07 · 稽核器:`security/superpowers-audit.mjs`(即時驗證)· 結果:**28/28 已證實、0 項待決、8 項誠實限制** — 旗艦席位 `sha256:c7bf5aac9378d199` 已納入創世(digit + sheraton 雙重簽章);漫遊錨點已於全艦隊生效。

下列每一條目於稽核日皆對其證據錨點驗證 — 檔案存在與程式碼標記,並對創世簽章執行即時 Ed25519 驗證。本總帳無任何無探測支持之主張。

## 身分與金鑰

| 能力 | 證據 | 範圍備註 |
|---|---|---|
| ed25519 身分,PBKDF2 + AES-256-GCM 密鑰庫封裝 | `fano-auth.js` | 私鑰僅於解鎖時存在於會話記憶體 |
| TOTP 第二因子(Google Authenticator 級) | `fano-auth.js` + 誓約流程 | 時鐘綁定;設定於登入時揭示 |
| 名冊守衛之授權與角色憑證 | `verifyGrant`/`grantBytes` | 名冊為桌本地;艦隊授權需錨點 |
| **漫遊旗艦簽到** — 於他人創始之外桌以 FLEET-ADMIRAL 註冊而不奪其創始 | `bindFleetFlag` + DESK-01 探測 | **生效中**:`admiral` 成員已錨定於已發布創世 |
| 桌轉移 — `FANO-DESK-v1`,密鑰庫全程封裝 | DESK-03/04/05 | DOM 匯入路徑(Electron 相容) |
| 解鎖節流 — 持續性指數退避 | `fano1.auth.fail` | 深度而非城牆:本機攻擊者可清 localStorage |

## 託管與治理

| 能力 | 證據 | 範圍備註 |
|---|---|---|
| Shamir 託管 — 旗艦種子 3-of-3 全體一致重建 | `spec008_qstar_escrow.zig` | 於密碼學上對映重置投票教條 |
| 2-of-3 法定人數 — 座位熄燈復原 | 同線束 | 任二份額皆可重建 |
| 外來份額偽造由 sha256 承諾識破 | 同線束 | Shamir 本體無完整性標籤 — 承諾層補足 |
| 外源旗艦桌之全體一致重置投票 | `fano-reset.js` + 權杖鑄造器 | 即時雙簽:digit 本機 + sheraton 經 ssh |
| 雙重簽章創世根 + TOFU 釘選 + 新鮮度界線 | `fleet_bootstrap.py`、sentinel-sweep | 冷開機警告見限制 |

## 線路與傳輸

| 能力 | 證據 | 範圍備註 |
|---|---|---|
| 136 位元組密封封套,嚴格長度驗證,JS↔Python↔WASM 雙生 | `fano-mesh-bridge.mjs`、`fano-wan-gateway.mjs` | capstone:86/86 覆蓋位元組偽造皆拒 |
| O(1) 路由決策 — ≤14 次量測操作,≤42 跳界線 | `route-o1.mjs` | 僅決策 — 絕非遞送延遲 |
| 十種實體傳輸逐位元一致:QR、OPTAR、音訊、卡帶、紙本、隱寫、polyglot-JAR、LoRa、WiFi、maypole 橋 | `spec008_qstar_carriage.zig` | LoRa MTU 255 B 遵守;`NotForUs` 定址 |
| 陳舊偵測 — 創傷/置換/截斷皆標記 | `staleness-detect.mjs` | 偵測分歧,非偽造 |
| WAN 邊緣密封閘道 + 量測位址簿會合 | `fano-wan-gateway.mjs`、`fleet-map.mjs` | 外部 v6 入站未驗證 |
| 多跳中繼 — TTL-16 界線、貪婪轉發、誠實丟棄 | `spec008_qstar_mesh.zig` | 空同儕表 = 乾淨丟棄 |
| 網格 AEAD — 封套上 XChaCha20-Poly1305 | mesh 線束 | 竄改與錯鑰皆拒 |

## 封存與存續

| 能力 | 證據 | 範圍備註 |
|---|---|---|
| 格點原子化 — 3375 格 → 20,250 QR 門戶 | `spec008_qstar_archive.zig` | 抗崩壞深層封存 |
| 遞迴 QR 巢套 — 卷宗級(8 KB 已測)往返 | 同上 | MAX_DEPTH 8 遵守 |
| RMSY 容器 — 桌態壓縮逐位元一致 | 同上 | 去重 + 格變換 |
| VFS 格頁 — 釘選/逐出、代理狀態、心跳註冊表 | 同上 | 421 節點頁圖 |
| 紙本列印 — 2-of-3 Shamir 頁可容缺一張 | carriage 線束 | 門檻潛藏;`decode` 需完整容器 |

## 反制措施(BLUE/BLACK 態勢)

| 能力 | 證據 |
|---|---|
| 強化伺服器 — 僅 GET/HEAD、路徑穿越 404、無目錄列舉、CSP/nosniff/frame 標頭 | `tools/serve.py` + BLUE 探測 |
| 公開樹姓氏/機密絆線 | `publish-check.sh` + SPEC-004 探測 |
| Wasm 工件逐位元一致 + 5 項清單工件釘選 | BLACK 探測 |
| 分離工作樹部署 — 共享樹危害級已消除 | `tools/deploy-pages.sh` |
| JS↔Python 線路 canon 鎖步 | COMM 探測 |

## 誠實限制 — 我們做不到之事(且不主張)

1. **TOFU 冷開機** — 完全敵對之公告板可於首次接觸提供自我一致之攻擊者創世;防禦為帶外釘選。
2. **線路同位元界線** — `rsEncode` 同位元為 XOR 和(單一抹除復原),非 Vandermonde RS;`rsReconstruct` 輸出轉置(依賴缺陷,已繞行)。
3. **解鎖會話 `sk`** 存於頁面記憶體 — devtools/同源讀取為固有風險。
4. **名冊注入** 僅為桌面本地表象 — 艦隊權威由已發布金鑰守衛;本地 UI 仍可被偽裝。
5. **`fano-comms.js` `prompt()`** — Electron 下靜默失敗(訊息撰寫器重建待辦)。
6. **外部 IPv6 入站** 至 WAN 邊緣未驗證;IPv4 入站受 CGNAT 阻擋。
7. **136 位元組酬載尾部** 為未驗證之暫存區 — 接收方必須遵守 `plen`。
8. **`capacity()`** 傳輸依賴之註冊槽回傳常數,非位元組容量。

## 重現

```bash
node security/superpowers-audit.mjs   # 27/28 + 即時創世簽章驗證
zig build test                        # 799 項依賴 + 41 項線束斷言
node security/team-sweep-2.mjs        # 34 項探測:31 HELD / 3 NOTED
./tools/publish-check.sh              # 全閘門
```
