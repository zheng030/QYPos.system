/* ui.js - 介面渲染與事件處理 (v15: 通用介面渲染) */
console.log("UI JS v15 Loaded - 通用介面程式已載入");

// 全域變數
let currentDiscount = { type: 'none', value: 0 }; 
let isServiceFeeEnabled = false;

function showApp() {
    document.getElementById("login-screen").style.display = "none";
    document.getElementById("app-container").style.display = "block";
    initRealtimeData(); 
    goHome();
}

function hideAll() { 
    ["home", "orderPage", "historyPage", "tableSelect", "reportPage", "confidentialPage", "settingsPage", "pastHistoryPage", "productPage"].forEach(id => { 
        let el = document.getElementById(id); 
        if(el) el.style.display = "none"; 
    }); 
    // 清除計時器 (使用 order_logic.js 中的函數)
    if(typeof clearSeatTimer === 'function') clearSeatTimer(); 
}

function goHome() { 
    hideAll(); 
    // 確保 home 使用 grid 佈局
    const homeEl = document.getElementById("home");
    if(homeEl) {
        homeEl.style.display = "grid"; 
        homeEl.style.gridTemplateColumns = "repeat(3, 1fr)";
        homeEl.style.gap = "20px";
    }
}

function openTableSelect() { 
    hideAll(); 
    refreshData(); 
    document.getElementById("tableSelect").style.display = "block"; 
    if(typeof renderTableGrid === 'function') renderTableGrid(); 
}

function openSettingsPage() {
    hideAll();
    document.getElementById("settingsPage").style.display = "block";
}

function openProductPage() {
    hideAll();
    document.getElementById("productPage").style.display = "block";
    renderProductManagement();
}

/* ========== QR Code 模式控制 (使用原邏輯) ========== */
let isQrMode = false;
function toggleQrMode() {
    isQrMode = !isQrMode;
    const grid = document.getElementById("tableSelectGrid");
    
    if (isQrMode) {
        grid.classList.add("qr-select-mode");
        showToast("📲 請點擊桌號以顯示 QR Code");
    } else {
        grid.classList.remove("qr-select-mode");
    }
}

function showQrModal(table) {
    const modal = document.getElementById("qrCodeModal");
    const title = document.getElementById("qrTableTitle");
    const qrContainer = document.getElementById("qrcode");
    
    title.innerText = `桌號：${table}`;
    qrContainer.innerHTML = ""; 
    
    const baseUrl = window.location.href.split('?')[0];
    const orderUrl = `${baseUrl}?table=${encodeURIComponent(table)}`;
    
    new QRCode(qrContainer, { text: orderUrl, width: 200, height: 200 });
    
    modal.style.display = "flex";
}

function closeQrModal() { document.getElementById("qrCodeModal").style.display = "none"; }

/* ========== 待確認訂單彈窗 (使用原邏輯) ========== */
let currentIncomingTable = null;
function checkIncomingOrders() { /* logic.js 在每次同步時呼叫此處 */ }
function showIncomingOrderModal(table, orderData) {
    currentIncomingTable = table;
    const modal = document.getElementById("incomingOrderModal");
    document.getElementById("incomingTableTitle").innerText = `桌號：${table}`;
    
    const list = document.getElementById("incomingList");
    list.innerHTML = "";
    
    if (orderData.items) {
        orderData.items.forEach(item => {
            list.innerHTML += `<div style="padding:5px 0; border-bottom:1px solid #ffccd5; display:flex; justify-content:space-between;">
                <span style="font-weight:bold; color:#333;">${item.name}</span>
                <span style="color:#ef476f;">$${item.price}</span>
            </div>`;
        });
    }
    
    modal.style.display = "flex";
}

function closeIncomingOrderModal() {
    document.getElementById("incomingOrderModal").style.display = "none";
    currentIncomingTable = null;
}

/* ========== 點餐介面功能 (使用原邏輯，但依賴 order_logic.js 中的狀態) ========== */
function startSeatTimerDisplay(startTime) { 
    if(typeof updateSeatTimerText === 'function') {
        updateSeatTimerText(startTime); 
        seatTimerInterval = setInterval(() => updateSeatTimerText(startTime), 1000); 
    }
}
let seatTimerInterval = null;
function updateSeatTimerText(startTime) { 
    if(!startTime) return; 
    let diff = Math.floor((Date.now() - startTime) / 1000); 
    let h = Math.floor(diff / 3600).toString().padStart(2,'0'); 
    let m = Math.floor((diff % 3600) / 60).toString().padStart(2,'0'); 
    let s = (diff % 60).toString().padStart(2,'0'); 
    document.getElementById("seatTimer").innerText = `⏳ 已入座：${h}:${m}:${s}`; 
}
function clearSeatTimer() {
    if(seatTimerInterval) clearInterval(seatTimerInterval);
    document.getElementById("seatTimer").innerText = "⏳ 尚未計時";
}

function buildCategories() { 
    const grid = document.getElementById("menuGrid"); 
    grid.innerHTML = ""; 
    
    if (typeof categories === 'undefined') return;

    let listToRender = categories;
    if (document.body.classList.contains("customer-mode")) {
        listToRender = categories.filter(c => c !== "甜點" && c !== "其他");
    }

    listToRender.forEach(c => { 
        let box = document.createElement("div"); 
        box.className = "categoryBtn btn-effect"; 
        box.innerText = c; 
        if (menuData[c]) box.onclick = () => openItems(c); 
        else box.style.opacity = "0.5"; 
        grid.appendChild(box); 
    }); 
}

function openItems(category) {
    let data = menuData[category]; 
    let backBtn = `<button class="back-to-cat btn-effect" onclick="buildCategories()">⬅ 返回 ${category} 分類</button>`;
    
    const createItemHtml = (item, isFlat = false) => {
        let actionsHtml = ""; 
        let realPrice = itemPrices[item.name] !== undefined ? itemPrices[item.name] : item.price;
        let nameHtml = `<span>${item.name} <b>$${realPrice}</b></span>`; 
        let itemClass = isFlat ? "item list-mode" : "item shot-item";
        
        let isSoldOut = inventory[item.name] === false;
        if (isSoldOut) itemClass += " sold-out";

        if (item.name === "隱藏啤酒") { 
            nameHtml = `<span style="font-weight:bold; color:var(--primary-color);">🍺 隱藏啤酒</span>`; 
            actionsHtml = `<input id="hbName" class="inline-input" placeholder="品名" style="width:100px;"><input type="number" id="hbPrice" class="inline-input" placeholder="時價" style="width:70px;"><button onclick="addInlineHiddenBeer()">加入</button>`; 
        } else if (item.name === "味繒鮭魚") { 
            nameHtml = `<span>味繒鮭魚 <b style="color:var(--danger-color);">(時價)</b></span>`; 
            actionsHtml = `<input type="number" id="salmonPrice" class="inline-input" placeholder="金額" style="width:80px;"><button onclick="addSalmonPrice()">加入</button>`; 
        } else if (item.name === "酥炸魷魚") { 
            nameHtml = `<span>酥炸魷魚 <b style="color:var(--danger-color);">(時價)</b></span>`; 
            actionsHtml = `<input type="number" id="squidPrice" class="inline-input" placeholder="金額" style="width:80px;"><button onclick="addFriedSquidPrice()">加入</button>`; 
        } else { 
            actionsHtml = `<button onclick='checkItemType("${item.name}", ${item.price}, "${category}")'>加入</button>`; 
            if (category === "shot") { actionsHtml += `<button onclick='addShotSet("${item.name}", ${item.price})' class="set-btn btn-effect" style="margin-left:5px; background:var(--secondary-color);">🔥 一組</button>`; } 
        }
        return `<div class="${itemClass}">${nameHtml}<div class="shot-actions">${actionsHtml}</div></div>`;
    };
    
    const flatListCategories = ["純飲", "shot", "啤酒", "咖啡", "飲料", "主餐", "炸物", "厚片", "甜點", "其他"];
    let html = backBtn; 
    const grid = document.getElementById("menuGrid"); 
    
    if (Array.isArray(data)) { 
        if(flatListCategories.includes(category)) { html += `<div class="sub-cat-title">${category}</div>`; data.forEach(item => { html += createItemHtml(item, true); }); } 
        else { data.forEach(item => { html += createItemHtml(item, true); }); }
    } else { 
        Object.keys(data).forEach((subCat, index) => { 
            let items = data[subCat]; 
            if(flatListCategories.includes(category)) { html += `<div class="sub-cat-title">${subCat}</div>`; items.forEach(item => { html += createItemHtml(item, true); }); } 
            else { let accId = `acc-${index}`; html += `<button class="accordion-header btn-effect" onclick="toggleAccordion('${accId}')">${subCat} <span class="arrow">▼</span></button><div id="${accId}" class="accordion-content">`; items.forEach(item => { html += createItemHtml(item, false); }); html += `</div>`; }
        }); 
    } 
    grid.innerHTML = html;
}

function toggleCartView() { isCartSimpleMode = !isCartSimpleMode; renderCart(); }
function toggleServiceFee() { 
    isServiceFeeEnabled = !isServiceFeeEnabled; 
    if(selectedOrderId && typeof saveOrderDiscount === 'function') {
        saveOrderDiscount(selectedOrderId, currentDiscount, isServiceFeeEnabled);
    }
    renderCart(); 
}

function renderCart() { 
    const cartList = document.getElementById("cart-list"); 
    const totalText = document.getElementById("total"); 
    cartList.innerHTML = ""; 
    currentOriginalTotal = 0; 
    
    const svcBtn = document.getElementById("svcBtn");
    if(svcBtn) {
        if(isServiceFeeEnabled) { svcBtn.classList.add("active"); svcBtn.innerHTML = "✅ 收 10% 服務費"; } 
        else { svcBtn.classList.remove("active"); svcBtn.innerHTML = "◻️ 收 10% 服務費"; }
    }

    const order = selectedOrderId ? tableOrders[selectedOrderId] : null;

    let displayItems = [];

    // 1. 合併已送出和未送出的品項到 displayItems
    if (order && order.sentItems && order.sentItems.length > 0) {
        order.sentItems.forEach(item => {
            displayItems.push({ ...item, isSent: true, count: item.count || 1 });
        });
    }
    
    // 2. 再加入目前購物車/未送出的 items
    let currentCartItems = isCartSimpleMode ? getMergedItems(cart) : cart.map(item => ({ ...item, count: 1 }));
    displayItems = [...displayItems, ...currentCartItems];

    if (displayItems.length === 0) {
        cartList.innerHTML = `<div style="text-align:center; color:#ccc; padding:20px;">購物車空空的</div>`;
    }

    displayItems.forEach((c, i) => { 
        let count = c.count || 1;
        let itemTotal = (c.isTreat ? 0 : c.price) * count;
        
        if (!c.isSent) {
            currentOriginalTotal += itemTotal;
        }

        let treatClass = c.isTreat ? "treat-btn active btn-effect" : "treat-btn btn-effect";
        let treatText = c.isTreat ? "已招待" : "🎁 招待";
        let priceHtml = "";
        let nameHtml = "";
        let rowClass = "cart-item-row";

        if (c.isSent) {
            nameHtml = `<div class="cart-item-name" style="color:#adb5bd;">${c.name} <small>(已送出)</small></div>`;
            priceHtml = `<span style="color:#adb5bd;">$${itemTotal}</span>`;
            rowClass += " sent-item"; 
        } else {
            if (typeof c.batchIdx !== 'undefined') {
                if (c.batchIdx === 0) rowClass += " batch-blue";
                else if (c.batchIdx === 1) rowClass += " batch-red";
                else if (c.batchIdx === 2) rowClass += " batch-green";
            }

            if (isCartSimpleMode && count > 1) {
                nameHtml = `<div class="cart-item-name">${c.name} <span style="color:#ef476f; font-weight:bold;">x${count}</span></div>`;
                if(c.isTreat) { priceHtml = `<span style='text-decoration:line-through; color:#999;'>$${c.price * count}</span> <span style='color:#06d6a0; font-weight:bold;'>$0</span>`; } else { priceHtml = `$${itemTotal}`; }
            } else {
                nameHtml = `<div class="cart-item-name">${c.name}</div>`;
                if (c.isTreat) { priceHtml = `<span style='text-decoration:line-through; color:#999;'>$${c.price}</span> <span style='color:#06d6a0; font-weight:bold;'>$0</span>`; } else { priceHtml = `$${c.price}`; }
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
