/* logic.js - 核心邏輯與資料初始化 (v15: 修復 data.js 載入問題) */
console.log("Logic JS v15 Loaded - 核心邏輯與資料初始化已載入");

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const db = firebase.database();

// 全域變數初始化
let historyOrders = [];
let itemCosts = {}; 
let itemPrices = {}; 
let inventory = {}; 
let tableTimers = {};
let incomingOrders = {};
let tableBatchCounts = {};

// 🔥 新增/變更：新的訂單結構
let tableOrders = {}; // 儲存 { orderId: { seat: "A1", items: [], ... }, ... }
let selectedOrderId = null; // 當前正在編輯的訂單 ID
let lastOrderId = 0; // 用於產生新的訂單 ID

let ownerPasswords = { "景偉": "0001", "小飛": "0002", "威志": "0003" };
let cart = []; // 購物車 (當前訂單的 Items 緩衝)
let sentItems = JSON.parse(sessionStorage.getItem("sentItems")) || [];

let historyViewDate = new Date();
let isCartSimpleMode = false;
let isHistorySimpleMode = false;

/* ========== 輔助函式 (保持不變) ========== */

function getMergedItems(items) {
    if (!items || !Array.isArray(items)) return [];
    let merged = [];
    items.forEach(item => {
        if(!item) return;
        let existing = merged.find(m => m.name === item.name && m.price === item.price && m.isTreat === item.isTreat && m.batchIdx === item.batchIdx && m.isSent === item.isSent);
        if (existing) { existing.count = (existing.count || 1) + 1; } else { merged.push({ ...item, count: 1 }); }
    });
    return merged;
}

function getDateFromOrder(order) {
    if (!order) return new Date();
    if (order.timestamp) return new Date(order.timestamp);
    if (order.time) {
        let d = new Date(order.time);
        if (!isNaN(d.getTime())) return d;
    }
    return new Date(); 
}

function getBusinessDate(dateObj) {
    let d = new Date(dateObj);
    if (isNaN(d.getTime())) d = new Date();
    if (d.getHours() < 5) d.setDate(d.getDate() - 1);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
}

function getVisibleOrders() {
    if (!historyOrders || !Array.isArray(historyOrders) || historyOrders.length === 0) return [];
    try {
        let currentBizDate = getBusinessDate(new Date());
        let filtered = historyOrders.filter(o => {
            if (!o) return false;
            if (!o.items || !Array.isArray(o.items)) return false;
            return getBusinessDate(getDateFromOrder(o)) === currentBizDate;
        });
        return filtered.reverse();
    } catch (e) {
        console.error("getVisibleOrders Error:", e);
        return [];
    }
}

function getItemCategoryType(itemName) {
    if(!itemName) return 'bar';
    // 這裡需要一個更穩健的名稱清理
    let baseName = itemName.split(" <")[0].replace(/\s*\(招待\)$/, "").trim();
    baseName = baseName.replace(/\s*[\(（].*?[\)）]$/, "").trim();

    const barCats = ["調酒", "純飲", "shot", "啤酒", "咖啡", "飲料", "厚片", "甜點", "其他"];
    const bbqCats = ["燒烤", "主餐", "炸物"];
    for (const [cat, content] of Object.entries(menuData)) {
        if (Array.isArray(content)) { if (content.some(x => baseName === x.name.trim())) { if (barCats.includes(cat)) return 'bar'; if (bbqCats.includes(cat)) return 'bbq'; } } 
        else { for (const subContent of Object.values(content)) { if (subContent.some(x => baseName === x.name.trim())) { if (barCats.includes(cat)) return 'bar'; if (bbqCats.includes(cat)) return 'bbq'; } } }
    }
    if(baseName.includes("雞") || baseName.includes("豬") || baseName.includes("牛") || baseName.includes("飯") || baseName.includes("麵") || baseName.includes("鮭魚") || baseName.includes("魷魚")) return 'bbq';
    return 'bar'; 
}

function getCostByItemName(itemName) {
    if(!itemName) return 0;
    
    let cleanName = itemName.split(" <")[0].replace(/\s*\(招待\)$/, "").trim();
    let baseName = cleanName.replace(/\s*[\(（].*?[\)）]$/, "").trim();
    
    if (itemCosts[cleanName] !== undefined) return itemCosts[cleanName];
    if (itemCosts[baseName] !== undefined) return itemCosts[baseName];

    if (cleanName.includes("隱藏特調")) { 
        if (itemCosts["隱藏特調"] !== undefined) return itemCosts["隱藏特調"]; 
    }
    
    return 0; 
}

function getItemSalesStats(startTime, endTime) {
    let stats = {};
    
    if (!historyOrders || historyOrders.length === 0) return { bar: [], bbq: [] };

    historyOrders.forEach(order => {
        if (!order || !order.items) return;
        const orderTime = getDateFromOrder(order);
        if (orderTime >= startTime && orderTime < endTime) {
            order.items.forEach(item => {
                let name = item.name.split(" <")[0].replace(/\s*\(招待\)$/, "").trim();
                name = name.replace(/\s*[\(（].*?[\)）]$/, "").trim();
                const count = item.count || 1;
                
                if (name) {
                    if (!stats[name]) stats[name] = 0;
                    stats[name] += count;
                }
            });
        }
    });

    let barList = [];
    let bbqList = [];

    for (const [name, count] of Object.entries(stats)) {
        if (inventory[name] === false) continue;
        const itemType = getItemCategoryType(name);
        
        if (itemType === 'bar') {
            barList.push({ name, count });
        } else if (itemType === 'bbq') {
            bbqList.push({ name, count });
        }
    }

    barList.sort((a, b) => b.count - a.count);
    bbqList.sort((a, b) => b.count - a.count);

    return { bar: barList, bbq: bbqList };
}

/* ========== 資料庫監聽與初始化 (保持不變) ========== */

function initRealtimeData() {
    db.ref('/').on('value', (snapshot) => {
        const data = snapshot.val() || {};
        
        let rawHistory = data.historyOrders ? (Array.isArray(data.historyOrders) ? data.historyOrders : Object.values(data.historyOrders)) : [];
        historyOrders = rawHistory.filter(order => {
            return order && typeof order === 'object' && Array.isArray(order.items) && order.total !== undefined;
        });

        // 🔥 更新：使用新的資料結構
        tableOrders = data.tableOrders || {};
        tableTimers = data.tableTimers || {}; // 沿用舊的計時器 (未來可移除)
        incomingOrders = data.incomingOrders || {};
        tableBatchCounts = data.tableBatchCounts || {};
        lastOrderId = data.lastOrderId || 0;
        
        // 舊資料
        itemCosts = data.itemCosts || {}; 
        itemPrices = data.itemPrices || {};
        inventory = data.inventory || {}; 
        if (data.ownerPasswords) OWNER_PASSWORDS = data.ownerPasswords;

        // 檢查新訂單 (排除客人模式)
        if (!document.body.classList.contains('customer-mode')) {
            // 檢查是否有 incomingOrders，由 order_logic.js 處理
            if (Object.keys(incomingOrders).length > 0) {
                checkIncomingOrders();
            }
        }

        // 重新渲染頁面
        setTimeout(() => {
            if(document.getElementById("tableSelect") && document.getElementById("tableSelect").style.display === "block") renderTableGrid();
            
            // ... (其餘頁面渲染邏輯不變，由 ui.js 處理)
            if(document.getElementById("historyPage") && document.getElementById("historyPage").style.display === "block") showHistory();
            if(document.getElementById("reportPage") && document.getElementById("reportPage").style.display === "block") { 
    在 tableSelect 的結構中，我已經排除了 Modal 內容的誤顯示，並使用了 `table-grid-custom` 佈局。

### 📄 檔案五：`style.css` (覆蓋 - 強制修正網格與 Modal 樣式)

我將在 `style.css` 中加入 `!important` 確保主頁面的網格佈局生效，並確保 Modal 預設是隱藏的。

```css
/* style.css - 完整版 (包含成本美化、銷量統計及新訂單拖曳介面) */

/* ========== 1. 全域設定 (現代化風格) ========== */
:root {
    --primary-color: #4361ee;       /* 主色調：現代藍 */
    --secondary-color: #3f37c9;     /* 次色調 */
    --accent-color: #f72585;        /* 強調色：玫紅 */
    --success-color: #06d6a0;       /* 成功/確認 */
    --warning-color: #ffd166;       /* 警告/暫存 */
    --danger-color: #ef476f;        /* 危險/刪除 */
    --bg-color: #f4f7f6;            /* 背景色：極淡灰綠 */
    --card-bg: #ffffff;             /* 卡片背景 */
    --text-main: #2b2d42;           /* 主要文字 */
    --text-sub: #8d99ae;            /* 次要文字 */
    --shadow-sm: 0 2px 4px rgba(0,0,0,0.05);
    --shadow-md: 0 4px 6px rgba(0,0,0,0.07);
    --shadow-lg: 0 10px 15px -3px rgba(0,0,0,0.1);
    --radius-md: 12px;
    --radius-lg: 20px;
}

body {
    font-family: "Noto Sans TC", "Microsoft JhengHei", -apple-system, BlinkMacSystemFont, sans-serif;
    margin: 0;
    background-color: var(--bg-color);
    color: var(--text-main);
    text-align: center;
    -webkit-tap-highlight-color: transparent;
    touch-action: manipulation; 
    overscroll-behavior: none;
}

button {
    cursor: pointer;
    font-family: inherit;
    user-select: none;
    border: none;
    outline: none;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.btn-effect:active { transform: scale(0.96); opacity: 0.9; }

/* 滾動條美化 */
::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: #94a3b8; }

#toast-container {
    position: fixed; bottom: 40px; left: 50%; transform: translateX(-50%) translateY(20px);
    background: rgba(43, 45, 66, 0.9); color: white; padding: 12px 30px;
    border-radius: 50px; font-size: 15px; font-weight: 500; z-index: 20000;
    opacity: 0; transition: all 0.3s ease; pointer-events: none; box-shadow: var(--shadow-lg);
}

/* Modal 預設隱藏 (修正誤顯示問題) */
.modal { 
    display: none; 
    position: fixed; 
    left: 0; 
    top: 0; 
    width: 100%; 
    height: 100%; 
    background-color: rgba(15, 23, 42, 0.6); 
    backdrop-filter: blur(4px); 
    justify-content: center; 
    align-items: center; 
    z-index: 10000; 
}


/* ========== 2. 登入畫面 & 全域排版 ========== */
#login-screen { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: linear-gradient(135deg, #4361ee 0%, #3a0ca3 100%); display: flex; justify-content: center; align-items: center; z-index: 9999; }
.login-box { background: rgba(255, 255, 255, 0.95); padding: 50px 40px; border-radius: var(--radius-lg); width: 320px; box-shadow: 0 20px 50px rgba(0,0,0,0.3); text-align: center; }
.login-box h1 { margin-bottom: 10px; color: var(--primary-color); font-size: 28px; }
.login-box p { color: var(--text-sub); margin-bottom: 30px; }
.login-box input { width: 100%; padding: 15px; margin-bottom: 20px; border: 2px solid #eef2f6; border-radius: var(--radius-md); font-size: 18px; text-align: center; box-sizing: border-box; transition: border-color 0.3s; }
.login-box button { width: 100%; padding: 15px; font-size: 18px; background: var(--primary-color); color: white; border-radius: var(--radius-md); font-weight: bold; box-shadow: 0 4px 15px rgba(67, 97, 238, 0.3); }

#app-container { padding-bottom: 40px; }
.title { font-size: 28px; font-weight: 800; margin-bottom: 25px; color: var(--text-main); text-align: left; border-left: 5px solid var(--primary-color); padding-left: 15px; }

/* Home & Header - **強制網格佈局** */
#home { 
    display: grid !important; 
    grid-template-columns: repeat(3, 1fr) !important; 
    gap: 20px; 
    padding: 30px; 
    max-width: 1000px; 
    margin: 0 auto; 
}
.menu-btn { background: var(--card-bg); border-radius: var(--radius-lg); padding: 25px 15px; font-size: 17px; font-weight: 600; color: var(--text-main); box-shadow: var(--shadow-sm); display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 110px; gap: 10px; transition: all 0.3s ease; border: 1px solid transparent; }
.menu-btn:hover { transform: translateY(-5px); box-shadow: var(--shadow-lg); border-color: var(--primary-color); color: var(--primary-color); }
.header-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; background: var(--card-bg); padding: 15px 20px; border-radius: var(--radius-md); box-shadow: var(--shadow-sm); }
.back { background: #edf2f7; color: var(--text-main); padding: 10px 20px; border-radius: 50px; font-size: 15px; font-weight: bold; }
#systemTime { font-size: 15px; font-weight: 600; color: var(--text-sub); background: #f8f9fa; padding: 8px 16px; border-radius: 50px; }

/* ========== 3. 桌位管理介面 (Table Select) - 大改動樣式 ========== */

.table-grid-custom { 
    display: grid; 
    grid-template-columns: repeat(4, 1fr); 
    gap: 20px; 
}
.table-container { 
    position: relative;
    background: linear-gradient(145deg, #ffffff, #f0f0f0); 
    padding: 15px 10px; 
    border-radius: var(--radius-lg); 
    box-shadow: var(--shadow-md);
    min-height: 150px;
    display: flex;
    flex-direction: column;
    align-items: center;
    border: 3px solid transparent;
    transition: all 0.2s;
}

.table-container b.table-name { 
    font-size: 22px; 
    font-weight: 800;
    margin-bottom: 10px;
    color: var(--text-main);
    z-index: 2;
}

.order-list-container {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 5px 0;
}

/* 新增訂單卡片樣式 */
.order-card {
    background: #e0e7ff; /* 訂單卡片底色 */
    border-radius: 10px;
    padding: 8px 12px;
    cursor: pointer;
    box-shadow: var(--shadow-sm);
    border-left: 5px solid var(--primary-color);
    transition: all 0.2s;
    user-select: none;
}

.order-card:hover {
    background: #c7d2fe;
    transform: translateY(-2px);
}

.order-card.dragging {
    opacity: 0.5;
    transform: scale(0.95);
}

.card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 12px;
    font-weight: 600;
    color: var(--primary-color);
    margin-bottom: 5px;
}

.card-body {
    text-align: left;
    font-size: 14px;
}
.card-body .card-info {
    display: flex;
    justify-content: space-between;
    font-weight: 500;
}
.card-body b {
    color: var(--danger-color);
}
.new-badge {
    background: var(--danger-color);
    color: white;
    font-size: 10px;
    padding: 2px 5px;
    border-radius: 3px;
    display: inline-block;
    margin-top: 5px;
    font-weight: bold;
}

/* 新增訂單按鈕 */
.add-order-btn {
    position: absolute;
    top: 5px;
    right: 5px;
    width: 30px;
    height: 30px;
    background: var(--success-color);
    color: white;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 20px;
    line-height: 1;
    z-index: 10;
}

/* 暫存區樣式 */
.standby-zone {
    grid-column: 1 / -1;
    background: var(--card-bg);
    border: 2px dashed #ff9a9e;
    border-radius: var(--radius-lg);
    padding: 20px;
    margin-bottom: 20px;
}
.standby-zone .zone-title {
    color: var(--danger-color);
    font-size: 18px;
    margin-bottom: 15px;
}

/* 狀態顏色繼承 */
.table-container.status-yellow { border-color: var(--warning-color); }
.table-container.status-red { border-color: var(--danger-color); }


/* 其他頁面樣式（保持不變或已優化） */

/* ========== 3. 點餐頁面 (OrderPage) ========== */
.order-header { background: var(--card-bg); padding: 15px 25px; border-radius: var(--radius-lg); display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; box-shadow: var(--shadow-sm); }
.customer-input-box { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 25px; }
.customer-input-box input { width: 100%; padding: 15px; font-size: 16px; border: 2px solid #eef2f6; border-radius: var(--radius-md); }
#menuGrid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; margin-bottom: 25px; }
.categoryBtn { background: var(--card-bg); border-radius: var(--radius-md); padding: 20px 10px; font-size: 16px; font-weight: bold; color: var(--text-main); box-shadow: var(--shadow-sm); }
.item { display: flex; justify-content: space-between; align-items: center; padding: 18px 20px; border-bottom: 1px solid #f1f5f9; background: var(--card-bg); }
.item b { color: var(--primary-color); margin-left: 8px; }
.item button { background: #ecfdf5; color: #059669; padding: 8px 20px; border-radius: 50px; font-size: 15px; font-weight: bold; }
.item.sold-out { opacity: 0.6; filter: grayscale(100%); pointer-events: none; position: relative; background: #f8f9fa; }
.item.sold-out::after { content: "售罄"; position: absolute; right: 80px; background: #ef476f; color: white; padding: 2px 8px; font-size: 12px; border-radius: 4px; font-weight: bold; }
.sub-cat-title { grid-column: 1 / -1; text-align: left; font-size: 18px; font-weight: 700; color: var(--primary-color); background: #e0e7ff; padding: 12px 20px; border-radius: 8px; margin: 20px 0 10px 0; }
.accordion-header { width: 100%; background: white; color: var(--text-main); padding: 18px 25px; border-radius: var(--radius-md); margin-top: 12px; font-size: 17px; font-weight: bold; display: flex; justify-content: space-between; align-items: center; grid-column: 1 / -1; box-shadow: var(--shadow-sm); }
.accordion-content { display: none; grid-column: 1 / -1; }
.accordion-content.show { display: block; }

/* Shopping Cart */
#cart-container { background: var(--card-bg); border-radius: var(--radius-lg); padding: 25px; margin-top: 25px; box-shadow: var(--shadow-md); }
#cart-list { max-height: 350px; overflow-y: auto; margin-bottom: 20px; border: 1px solid #f1f5f9; border-radius: var(--radius-md); }
.cart-item-row { display: grid; grid-template-columns: 2fr 1fr auto auto; align-items: center; gap: 10px; padding: 15px; border-bottom: 1px solid #f1f5f9; background: white; }
.cart-item-price { font-size: 16px; font-weight: bold; color: var(--primary-color); text-align: right;}
.treat-btn { background: #e0f2fe; color: #0284c7; padding: 6px 12px; border-radius: 6px; font-size: 13px; font-weight: bold; }
.del-btn { background: #fee2e2; color: #dc2626; padding: 6px 12px; border-radius: 6px; font-size: 13px; font-weight: bold; }
.summary-controls { display: flex; gap: 12px; margin-bottom: 15px; }
.control-btn { background: white; border: 1px solid #e2e8f0; color: var(--text-sub); padding: 10px; border-radius: 8px; font-weight: bold; flex: 1; }
.control-btn.active { background: #e0e7ff; color: var(--primary-color); border-color: var(--primary-color); }
.total-display p { margin: 0; font-size: 26px; font-weight: 800; color: var(--accent-color); text-align: right; }
.action-buttons-compact { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 12px; margin-top: 20px; }
.action-btn { padding: 15px 5px; font-size: 16px; font-weight: bold; color: white; border-radius: var(--radius-md); }
.save-btn { background: var(--warning-color); color: #744210; }
.checkout-btn { background: var(--primary-color); }
.batch-blue { border-left: 5px solid #007bff !important; background-color: #e0f2fe !important; }
.batch-red { border-left: 5px solid #ef476f !important; background-color: #fee2e2 !important; }
.batch-green { border-left: 5px solid #06d6a0 !important; background-color: #d1fae5 !important; }
.cart-item-row.sent-item { background: #f8f9fa; border-left: 5px solid #adb5bd; }

/* ========== 4. 今日訂單 (History) ========== */
.history-header-row { display: grid !important; grid-template-columns: 0.6fr 1fr 2fr 1fr 1fr auto !important; background: #334155; color: white; padding: 15px; border-radius: 12px 12px 0 0; font-weight: bold; font-size: 15px; }
.history-row { display: grid !important; grid-template-columns: 0.6fr 1fr 2fr 1fr 1fr auto !important; background: white; padding: 18px 15px; border-bottom: 1px solid #f1f5f9; align-items: center; font-size: 15px; transition: background 0.2s; }
.history-row:hover { background: #f8fafc; }
.hist-actions button { background: #e2e8f0; color: #475569; padding: 5px 8px; border-radius: 6px; font-size: 12px; }
.end-business-btn { background: #fee2e2; color: #ef476f; padding: 12px 20px; border-radius: 50px; font-weight: bold; font-size: 16px; margin-top: 20px; width: 100%; }

/* ========== 5. 報表 & 統計 & 權限頁面 ========== */
.segment-control-container { position: relative; display: flex; background: #e2e8f0; border-radius: 50px; padding: 4px; width: 320px; margin: 0 auto 30px; }
.segment-option { flex: 1; text-align: center; padding: 8px 0; font-weight: bold; color: #64748b; z-index: 2; }
.segment-highlighter { position: absolute; top: 4px; bottom: 4px; left: 4px; width: calc(33.33% - 5px); background: white; border-radius: 50px; box-shadow: 0 2px 5px rgba(0,0,0,0.1); z-index: 1; transition: transform 0.3s cubic-bezier(0.4, 0.0, 0.2, 1); }
.report-dashboard { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-bottom: 30px; }
.stat-card { background: white; border-radius: 20px; padding: 25px; box-shadow: 0 10px 20px -5px rgba(0,0,0,0.1); color: white; position: relative; overflow: hidden; text-align: left; }

.finance-layout { display: flex; gap: 25px; align-items: flex-start; }
.calendar-container-left { flex: 2; background: white; padding: 20px; border-radius: var(--radius-lg); box-shadow: var(--shadow-sm); }
.finance-summary-sidebar { flex: 1; display: flex; flex-direction: column; gap: 15px; }
.finance-controls button.active { background: white; color: var(--primary-color); box-shadow: 0 2px 4px rgba(0,0,0,0.05); }

/* 熱銷統計列表樣式 (即時 & 月報) */
.stats-body { display: flex; flex-wrap: wrap; gap: 20px; }
.stats-column { flex: 1; min-width: 300px; background: white; border-radius: var(--radius-md); padding: 0; border: 1px solid #e2e8f0; overflow: hidden; }
.stats-column h3 { margin: 0; padding: 15px; text-align: center; }
.stats-header-row { display: flex; justify-content: space-between; padding: 10px 20px; background: #f8fafc; font-weight: bold; color: var(--text-sub); border-bottom: 1px solid #eee; text-align: center; }
.stats-item-row { display: flex; justify-content: space-between; padding: 12px 20px; border-bottom: 1px solid #f1f5f9; font-size: 15px; }
.stats-count { font-weight: bold; background: #edf2f7; padding: 2px 10px; border-radius: 20px; font-size: 13px; color: #333; }
.top-stat-item:nth-child(2) { color: #d33; font-weight: bold; background: #fff5f5; } /* Top 1 */
.top-stat-item:nth-child(3) { color: #007bff; font-weight: bold; } /* Top 2 */
.top-stat-item:nth-child(4) { color: #059669; font-weight: bold; } /* Top 3 */


/* 🔥 成本輸入頁面美化 */
#costInputSection {
    background: var(--card-bg);
    border-radius: var(--radius-lg);
    padding: 25px;
    box-shadow: var(--shadow-md);
}
#costEditTitle {
    font-size: 24px;
    color: var(--primary-color);
    border-bottom: 3px solid var(--primary-color);
    padding-bottom: 10px;
    margin-bottom: 20px;
    text-align: left;
}
.cost-header-row {
    display: grid;
    grid-template-columns: 2fr 1fr 1fr;
    gap: 10px;
    background: #334155;
    color: white;
    padding: 12px 15px;
    border-radius: 8px 8px 0 0;
    font-weight: bold;
    font-size: 15px;
    text-align: center;
}
.cost-header-row span:nth-child(1) { text-align: left; }
.cost-category-header {
    grid-column: 1 / -1;
    text-align: left;
    font-size: 18px;
    font-weight: 700;
    color: var(--accent-color);
    background: #fef2f4;
    padding: 10px 15px;
    border-radius: 8px;
    margin: 15px 0 5px 0;
}
.cost-editor-row {
    display: grid;
    grid-template-columns: 2fr 2fr;
    align-items: center;
    padding: 12px 15px;
    border-bottom: 1px solid #f1f5f9;
    font-size: 15px;
    text-align: left;
}
.cost-item-name {
    font-weight: 500;
}
.cost-input-group {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
}
.cost-input-group input {
    padding: 8px;
    border: 1px solid #ddd;
    border-radius: 6px;
    text-align: center;
    font-size: 15px;
}
.cost-input-price { color: var(--primary-color); }
.cost-input-cost { color: var(--danger-color); }

/* RWD */
@media (max-width: 900px) {
    #home { grid-template-columns: repeat(3, 1fr) !important; }
    .table-grid-custom { grid-template-columns: repeat(3, 1fr); }
    #menuGrid { grid-template-columns: repeat(3, 1fr); } 
    .report-dashboard { grid-template-columns: 1fr; }
    .finance-layout { flex-direction: column; }
    .finance-summary-sidebar { flex-direction: row; overflow-x: auto; padding-bottom: 5px; }
    .summary-card { min-width: 260px; }
}
@media (max-width: 600px) {
    #home { grid-template-columns: repeat(2, 1fr) !important; }
    .table-grid-custom { grid-template-columns: repeat(2, 1fr); }
    #tableSelectGrid { grid-template-columns: repeat(3, 1fr); }
    #menuGrid { grid-template-columns: repeat(2, 1fr); }
    .finance-summary-sidebar { flex-direction: column; }
    .action-buttons-compact { grid-template-columns: 1fr 1fr; }
    .cost-header-row { grid-template-columns: 1fr 1fr 1fr; }
    .cost-editor-row { grid-template-columns: 1fr 2fr; }
    .cost-input-group { grid-template-columns: 1fr 1fr; }
}

/* 列印專用樣式 */
@media print {
    body * { visibility: hidden; }
    #receipt-print-area, #receipt-print-area * { visibility: visible; }
    #receipt-print-area { position: absolute; left: 0; top: 0; width: 100%; margin: 0; padding: 0; background: white; z-index: 99999; }
    .modal, #app-container, #login-screen { display: none !important; }
}
