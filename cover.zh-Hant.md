# SPEC-007 — 任務檔案

**艦隊上將辦公桌 · OSTF 艦隊司令部**
**事由：**「冰淇淋管」——模組化化學熱電卡匣
**許可等級：**公開發布 · **版本：** 1.3.0-public-research

---

*致所有閱讀本檔者：*

*本檔案收錄艦隊對此資產所知的一切——它宣稱什麼、算術證明了什麼、它在哪裡失敗、以及它的代價。原始概念文件已封存且不可更改；本檔案內容皆不對其構成修訂。其餘一切只為用你能親自運行的數字回答一個問題：這台機器究竟能做什麼？*

*依序閱讀。若某項主張與測試台架相左，以台架為準。*

— FA

---

## 登記冊

**SPEC-007** —「冰淇淋管」熱卡匣概念 · **狀態：**研究階段——*未核准*建造、運輸或部署 · **基線：** `spec-007.md`（SHA-256 `bcb81b78ebeab9e3762a806788a0c4c1bd3bbd1e8a7b9339030037efab6367b4`）· **授權：** CC0

## 權限等級

| 等級 | 意義 | 文件 |
|---|---|---|
| L0 — 不可變記錄 | 原始概念文件及其忠實譯本。其中主張屬歷史記錄，**不**予晉升。 | [簡報](public-zh.html) · [密件 EN](covert-en.html) · [密件 ZH](covert-zh.html) · [術語表](terminology-zh.html) |
| L1 — 已驗證／晉升 | 由化學計量、測試台架或機構來源支持的主張。**所有數字以此為準。** | [可信數字](verified-zh.html) |
| L2 — 證據鏈 | 主張清單、評級、駁回記錄。 | [檔案](dossier-zh.html) · [審訊記錄](claims-zh.html) · [設計輸入審計](input-audit-zh.html) |
| L3 — 衍生分析 | 經濟、紅隊、擴充架構。 | [帳本](economics-zh.html) · [紅隊](red-team-zh.html) · [擴充設計](expanded-zh.html) · [治理](governance-zh.html) |
| L4 — 可執行檢驗 | 整數／有理數台架 + Q128.128 影子引擎。 | [分數帳本](ledger-zh.html) · 儲存庫中的 `spec007_*.zig` |
| L5 — 機密輸入 | SPEC-004 之下的 OSTF 設計記錄。排除在外。 | [7q](7q.html) |

## 實地驗證

```sh
zig test src/spec007_calculations.zig            # 8 項測試 — 化學計量、矛盾與影子層
zig test src/spec007_expanded_calculations.zig   # 18 項測試 — PDRC/ORC/載具/經濟/TEG 篩算與影子層
zig test src/spec007_verified_calculations.zig   # 15 項測試 — 晉升主張算術與影子層
zig test src/spec007_drivetrain_calculations.zig # 21 項測試 — 雙路徑動力系統、降額與應力邊界
zig test src/spec007_manifold_calculations.zig   # 12 項測試 — 卡匣預算、控制器寄生耗損、歧管
zig test src/spec007_dynamics_calculations.zig   # 12 項測試 — 暫態熱／電荷模擬、守恆帳本
zig test src/spec007_q_toys.zig                  # 6 項測試 — Q 部門野戰玩具
```

*所有軍械均自 Q 部門領用——影子引擎記的是整數看不見的帳，誤差不超過半個 ulp。*

## 工作站

[開啟 FANO-1 工作站](desktop.html) ——檔案化作桌面：檔案、資料夾、`fano:~$` 終端機、運行真實 482 位元組 wasm 核心的 Quplink 沙盒，以及停靠在視窗內的姊妹平台 **rations.os**（收錄於 `family/Rations/`——1,548 項測試的氣隙網路平台，生產構件經 sha256 驗證）。桌面通曉雙語：**EN ⇄ 繁體中文**——工作列切換或 `lang zh`。

<!-- 錢班霓守著辦公室與檔案；這份索引就是她的辦公桌。費利克斯·雷特不是我們的人，但他總會出現——若你找到了 bug，今天你就是他。 -->

## 常駐命令

1. 原始 `spec-007.md` 永不編輯。
2. 數字唯有出現在 `spec-007-verified.en.md` 且由台架測試或引用第一手來源支持，方為「晉升」。
3. 被駁回的主張永不刪除；永久標記為駁回。
4. 每個通過的里程碑皆存檔。
5. 機密輸入永不編輯、引用，任何公開文件亦不得依賴之。
