# SPEC-007 整合架構

**狀態:** 草案 1
**範圍:** 已驗證整數純核心(TheUE)與更廣之 Sentience 生態系藍圖
之連接方式 — Sentience Engine(Phase 1)、The Library 指揮中心
(Phase 3)及其餘封裝階段 — 不削弱已證明之邊界。

協定規格之規則約束以下所有接縫:**邊界須被執行,不被融合**。
封裝層中不得有任何事物繞過 `spec-007-protocol.*.md` §8 之一致性
閘門。

---

## 1. 分層模型

```
┌─────────────────────────────────────────────────────────────┐
│ L4 體驗層      The Library · Code Nebula · 門戶 · 彩蛋       │
│                (藍圖 Phase 3、5)                             │
├─────────────────────────────────────────────────────────────┤
│ L3 證據層      findings.json(112 條目 · 10 小隊)             │
│     織體       context/*.json 審計 · 探針 stdout 串流         │
│                SSE/WS 橋接 — Sentience-Engine 接縫           │
├─────────────────────────────────────────────────────────────┤
│ L2 指令層      theue-golden-vectors · descent_audit          │
│     介面       cross_target_check · continuity/twenty-re     │
│                決定性 CLI — API 契約                          │
├─────────────────────────────────────────────────────────────┤
│ L1 連續層      ~/.archives/* · SHA256SUMS · findings 語料    │
│                (藍圖 Phase 2 — 已在運行)                      │
├─────────────────────────────────────────────────────────────┤
│ L0 核心        fixed_point(Q128.128)· science_*(65)          │
│     (鎖定)     131 模組 DAG,0 環,0 浮點違規                  │
└─────────────────────────────────────────────────────────────┘
```

**L0 依契約不可變。** 上層不得修改;上層僅得引用。所有 UI/代理層
逐字消費 L2 輸出 — 絕不自行計算物理。

## 2. 藍圖階段映射

| 藍圖階段 | SPEC-007 基底 | 待閉合之缺口 |
|---|---|---|
| **P1 Sentience Engine**(代理編排) | `findings.json` 語料、探針框架、審計工具 = 代理可調用之決定性能力集 | **能力配接器**:每項代理動作映射至具名 L2 指令;代理絕不直接產出物理。GenesisAgency 計畫編譯為探針調用。 |
| **P2 Continuity Engine**(持久層) | `~/.archives/` 校驗和驗證狀態 + `findings.json` + `context/*-audit.json` | 封存層級已滿足。IDaaS/DMS 層可索引封存但 MUST NOT 修改(校驗和鎖定)。 |
| **P3 The Library**(指揮中心、IDE、社群) | `site/` 檔案庫(26+ 頁)+ findings 語料 | 新增 `command-deck` 頁:SSE 遙測、小隊/發現元件、晶格瀏覽器。IDE/聊天屬藍圖側工作,非核心範圍。 |
| **P4 生成式影視** | — | 無核心依賴;可選封裝,不設閘。 |
| **P5 Code Nebula**(3D 沉浸) | `science_ivector` 立方體(15³、421 普查)、Fano 線、雙梯 = 程序化幾何基底 | 幾何服務將 `cellLabel`/`census`/`ladderRung` 暴露為可渲染資料 — 只出資料,不入數學。 |
| **P6 測試與安全** | 四支對抗小隊(PHILOTIC/BREAKER/FURNACE/EMERGENT)+ 鑑別器 + 下降審計 | **已建成。** 本階段即核心之職責;藍圖安全工作經 L3 消費我方判定。 |
| **P7 教育** | 元件對照表、協定規格、本文件 | 課程生成唯讀消費文件。 |

## 3. 證據織體(Sentience-Engine 接縫)

核心與代理間唯一合法資料路徑:

```
探針/審計 ──寫入──> security/out/ + context/ + site/security/findings.json
                        │
              織體橋接(node .mjs)
              讀檔;追蹤探針 stdout
                        │
        SSE /event-stream ──> 指揮台元件
        WS /command       <── 受閘指令(閘表如下)
```

- **讀取路徑:** findings 語料、descent/continuity/twenty-re 報告、
  黃金向量摘要。檔案支撐,校驗和錨定。
- **寫入路徑:** 代理僅得*調用*受閘指令:`run-probe <name>`、
  `run-audit <name>`、`emit-vectors`。不允許原始參數、檔案寫入或
  核心變更。每次調用記入 AuditChain(現已位元組序安全)。
- **禁止:** 直接模組調用、FFI 進入 `fixed_point`、寫入 `src/`、
  無上限執行。執法者為織體 — 非代理。

## 4. 指揮台(Library Phase-3 切片)

首個可執行工件:`site/command-deck.html` + 橋接。元件與已驗證
機制一一對應:

| 元件 | 資料來源 | 鑑別器 |
|---|---|---|
| 小隊/發現走馬燈 | `findings.json`(team、verdict、id) | 任何 `OPEN` 判定即為告警燈 |
| 紅利表 | `webDividendMilli` 向量 | 二次方對線性顯示 |
| 氫鐘 HUD | `h1SlotBit`/`h1JitterSafe` 向量 | 鬆弛邊界可視化 |
| 晶格瀏覽器 | `cellLabel`/`census` 資料 | 渲染 421 個 e0 胞元 |
| 擴張視界 | `expandingDeliveryTicks` 向量 | 可達 vs `null` 網格 |
| 分流通訊模擬 | `philotic-cluster`/`carrier-flight` 輸出 | 每則訊息之線上成本徽章 |
| 下降狀態 | `descent-audit.json` | CLOSED/OPEN 旗幟 |

角色視圖(Operator/Architect/Auditor)為**同一證據之呈現過濾器**
— 絕非不同資料。Auditor 見原始校驗和;Operator 見健康聚合;
Architect 見約束分類。存取控制現階段屬 UI 層面;真實認證落地時
於織體橋接處設閘,非於頁面。

## 5. 彩蛋(僅呈現層)

Bond 層呈現可藏入 Codex 終端、Möbius 觸發與 Fano 鎖 — 唯一硬性
規則:**彩蛋為裝飾性狀態**,本地持久化,絕不觸及 findings、閘門
或核心。「God Mode」饋送僅係公開證據之無過濾視圖。若彩蛋能影響
判定,即非彩蛋 — 是漏洞,歸熔爐管轄。

## 6. 順序

1. **織體橋接**(`security/fabric-bridge.mjs`):檔案追蹤 +
   受閘指令 SSE/WS 伺服器。最小可用切片。
2. **指揮台頁面**消費橋接(靜態優先:讀取已提交 JSON;橋接
   運行時升級為即時)。
3. **晶格瀏覽器**由 `cellLabel`/`census` JSON 匯出(沿
   `theue-golden-vectors` 工具模式)供給。
4. 依藍圖遞延:完整代理執行時期(P1)、DMS(P2)、影視管線
   (P4)、UE5 星雲(P5)、課程(P7)— 各項建成時皆經同一
   一致性閘門進入。

每一切片皆經協定規格之七道一致性閘門發佈;不設「UI 例外」。
