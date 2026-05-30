## 注意事項

- 系統處於早期開發階段，所有功能不須向後相容，**盡可能 breaking change**，確保不遺留 technical debt
- 所有產出的程式碼在KISS原則與clean code(清晰明確且簡潔正確，而易於理解維護)之間取得平衡
- 執行任務前，先參考既有module的實作、library，例如rotues、controller、service、repository等，確保code style一致
- 測試的核心是 debug by test，而不是 make test pass
- 完成任務後，如果有更新程式碼，則執行對應的 lint/check/test; 確認無 error、無 warning
- 除非user明確要求，否則禁止任何遞迴刪除(rd /s,Remove-Item -Recurse,rm -rf,find -delete)，允許單檔刪除