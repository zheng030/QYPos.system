## pos baseline

repo使用firebase RTDB，只算流量、儲存
- 只訂閱所需path
- 允許小寫index/metadata換取減少大讀
- 歷史訂單因為菜單可能刪除，所以統一以當下價格、名稱儲存
- code在src/，不碰legacy的frontend/
- 所有讀、寫操作必須合理，至少確保是local best
- KISS原則，要的是合理、結構性設計，不因此做得過於複雜

## 注意事項

- 系統處於早期開發階段，所有功能不須向後相容，**盡可能 breaking change**，確保不遺留 technical debt
- 所有產出的程式碼在KISS原則與clean code(清晰明確且簡潔正確，而易於理解維護)之間取得平衡
- 執行任務前，先參考既有module的實作、library，例如rotues、controller、service、repository等，確保code style一致
- 測試的核心是 debug by test，而不是 make test pass
- 如果有更新程式碼，則執行對應的 lint/check/test; 確認無 error、無 warning
- 除非user明確要求，否則禁止任何遞迴刪除(rd /s,Remove-Item -Recurse,rm -rf,find -delete)，只允許單檔刪除