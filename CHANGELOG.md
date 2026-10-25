# daily-podcast-host 更新日誌 (Changelog)

本專案遵循語意化版本（Semantic Versioning）與時序更新原則，記錄所有架構升級、功能迭代、UI/UX 優化與 Bug 修復。

## [2026-10-25] — ⚡️ 全面升級 Node.js 26 (v26.12.1) 與最新 CVE 安全防護加固 (Node.js 26 Runtime & Security Hardening)

### ⚡️ 容器運行環境升級 Node.js 26 (`v26.12.1`)
- **Docker 容器基底升級**：
  - 更新 `apps/web/Dockerfile` 與 `apps/worker/Dockerfile` 基礎映像檔為 `node:26.12.1-alpine`（從舊版 Node 20 升級）。
  - 全面啟用最新 V8 引擎，帶來原生 Type Stripping、低記憶體佔用與更高效的垃圾回收（GC）。
- **最新官方安全性修補（October 2026 Security Releases）完整防禦**：
  - 完整修補官方近期披露之重大安全漏洞（包含 CVE-2026-111497 Brotli 解碼器越界寫入 RCE 漏洞、CVE-2026-105482 DNS 截斷漏洞、CVE-2026-105483/106069 TLS 主機名檢查繞過漏洞）。
