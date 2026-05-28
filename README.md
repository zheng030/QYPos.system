# QYPos.system

Vite + TypeScript

## 開發

```bash
npm install
npm run dev
```

## 驗證

```bash
npm run check
npm run test
npm run build
```

## 架構

- `src/app/code`
  - app bootstrap、feature registry、expression-scope runtime
- `src/features/core-pos`
  - 主 POS 流程、資料同步、UI 與 shell
- `src/features/checkin`
  - 打卡系統 feature，透過 core POS API 共享 attendance data
- `src/features/flavor`
  - 口味 plugin feature，透過 core POS wrapper hooks 擴充點餐流程
- `src/shared/code`
  - Firebase compat adapter、QRCode helper、可測試共用工具

## 現況

- 所有執行入口已遷移到 `src/` 的 feature-based runtime。
- 舊版 `frontend/*.js` 不再作為執行時依賴。
- `checkin` 與 `flavor` 皆透過明確 feature API 掛到 `core-pos`，不再依賴 `window.*` global bridge。
