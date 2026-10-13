# 原生 AIWO provider cutover

日期：2026-10-13 · 決策：**原生 primary／外部 compatibility fallback**。

Spec-007 的 `spec007-native-aiwo` 現為 manifest 唯一宣告之 primary AI
runtime。它擁有 policy 評估、Digit model observation、AIWO 認知、FANO
heartbeat 與 chunked scaling admission。

Ollama、qstar HTTP、k3serve、remote Ollama 與 Agent Zero 保留為相容性及
rollback 路徑，不刪除；manifest 角色為 `compatibility-fallback` 且
`primary:false`。它們不得發出 binding orders 或繞過原生 policy gate。

## Cutover 證據

- 原生 AIWO parity：18/18；chunk admission、執行與 checkpoint/resume
  亦已納入 scale parity
- 原生 Digit q4：750 tensors 已索引/上傳；六步 ReleaseFast 路徑與供應
  Digit parity 的前三個 ID 相符
- 原生 FANO：每步 136-byte heartbeat
- 原生 DHT：每 chunk 簽章記錄、三份 replicas，既有 DHT query 可驗證
- governance：48/48
- team sweep：零 OPEN
- publish-check：綠

外部 provider 僅保留作 rollback、功能比較與尚未原生化的能力（例如
一般聊天/provider-specific schema 行為）。這是外部 authority 的退休，
不是刪除通過測試的相容性軟體。
