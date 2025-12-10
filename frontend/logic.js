/* logic.js - 核心邏輯 (v15: 工作單與 UI 修正) */
console.log("Logic JS v15 Loaded - 核心邏輯已載入");

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const db = firebase.database();

// 全域變數初始化
let historyOrders = [];
let tableTimers = {};
let tableCarts = {};
let tableStatuses = {};
let tableCustomers = {};
let tableSplitCounters = {}; 
let itemCosts = {}; 
let itemPrices = {}; 
let inventory = {}; 

let ownerPasswords = { "景偉": "0001", "小飛": "0002", "威志": "0003" };
let incomingOrders = {}; 
let tableBatchCounts = {}; 

let selectedTable = null;
let cart = []; 
// 🔥 新增：用來儲存客人已送出的商品 (從暫存讀取)
let sentItems = JSON.parse(sessionStorage.getItem("sentItems")) || [];

let seatTimerInterval = null;
let tempCustomItem = null;
let isExtraShot = false; 
let tempLeftList = [];
let tempRightList = [];
let currentOriginalTotal = 0; 
let finalTotal = 0; 
let currentDiscount = { type: 'none', value: 0 }; 
let discountedTotal = 0;
let isServiceFeeEnabled = false;
let isQrMode = false;
let currentIncomingTable = null; 
let entryCartSignature = "[]"; // 紀錄進入點餐頁時的購物車狀態

let historyViewDate = new Date();
let isCartSimpleMode = false;
let isHistorySimpleMode = false;

/* ========== 輔助函式 ========== */

function getMergedItems(items) {
    if (!items || !Array.isArray(items)) return [];
    let merged = [];
    items.forEach(item => {
        if(!item) return; // 防呆
        // 修改：加入 isSent 的判斷，避免已送出和未送出的合併
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
    if (isNaN(d.getTime())) d = new Date(); // 防呆
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
    const barCats = ["調酒", "純飲", "shot", "啤酒", "咖啡", "飲料", "厚片", "甜點", "其他"];
    const bbqCats = ["燒烤", "主餐", "炸物"];
    for (const [cat, content] of Object.entries(menuData)) {
        if (Array.isArray(content)) { if (content.some(x => itemName.includes(x.name))) { if (barCats.includes(cat)) return 'bar'; if (bbqCats.includes(cat)) return 'bbq'; } } 
        else { for (const subContent of Object.values(content)) { if (subContent.some(x => itemName.includes(x.name))) { if (barCats.includes(cat)) return 'bar'; if (bbqCats.includes(cat)) return 'bbq'; } } }
    }
    if(itemName.includes("雞") || itemName.includes("豬") || itemName.includes("牛") || itemName.includes("飯") || itemName.includes("麵")) return 'bbq';
    return 'bar'; 
}

function getCostByItemName(itemName) {
    if(!itemName) return 0;
    let cleanName = itemName.replace(" (招待)", "").trim();
    if (itemCosts[cleanName] !== undefined) return itemCosts[cleanName];
    let baseName = cleanName.replace(/\s*[\(（].*?[\)）]$/, "").trim();
    if (itemCosts[baseName] !== undefined) return itemCosts[baseName];
    if (cleanName.includes("隱藏特調")) { if (itemCosts["隱藏特調"] !== undefined) return itemCosts["隱藏特調"]; }
    return 0; 
}

/* ========== 資料庫監聽與初始化 ========== */

function initRealtimeData() {
    db.ref('/').on('value', (snapshot) => {
        const data = snapshot.val() || {};
        
        let rawHistory = data.historyOrders ? (Array.isArray(data.historyOrders) ? data.historyOrders : Object.values(data.historyOrders)) : [];
        historyOrders = rawHistory.filter(order => {
            return order && typeof order === 'object' && Array.isArray(order.items) && order.total !== undefined;
        });

        tableTimers = data.tableTimers || {};
        tableCarts = data.tableCarts || {};
        tableStatuses = data.tableStatuses || {};
        tableCustomers = data.tableCustomers || {};
        tableSplitCounters = data.tableSplitCounters || {}; 
        itemCosts = data.itemCosts || {}; 
        itemPrices = data.itemPrices || {};
        inventory = data.inventory || {}; 
        incomingOrders = data.incomingOrders || {};
        tableBatchCounts = data.tableBatchCounts || {};
        
        if (data.ownerPasswords) OWNER_PASSWORDS = data.ownerPasswords;

        // 檢查新訂單 (排除客人模式)
        if (!document.body.classList.contains('customer-mode')) {
            checkIncomingOrders();
        }

        if(document.getElementById("tableSelect") && document.getElementById("tableSelect").style.display === "block") renderTableGrid();
        
        setTimeout(() => {
            if(document.getElementById("historyPage") && document.getElementById("historyPage").style.display === "block") showHistory();
            
            if(document.getElementById("reportPage") && document.getElementById("reportPage").style.display === "block") { 
                let activeOption = document.querySelector('.segment-option.active');
                let type = activeOption && activeOption.innerText === '本周' ? 'week' : (activeOption && activeOption.innerText === '當月' ? 'month' : 'day');
                generateReport(type); 
                renderCalendar(); 
            }
            
            if(document.getElementById("itemStatsModal") && document.getElementById("itemStatsModal").style.display === "flex") { 
                 let activeBtn = document.querySelector('.report-controls button.active');
                 let range = 'day';
                 if(activeBtn) {
                     if(activeBtn.id === 'statBtnWeek') range = 'week';
                     if(activeBtn.id === 'statBtnMonth') range = 'month';
                 }
                 renderItemStats(range);
            }
            
            if(document.getElementById("pastHistoryPage") && document.getElementById("pastHistoryPage").style.display === "block") { renderPublicStats(); }
        }, 50);

        let currentOwner = document.getElementById("ownerWelcome") ? document.getElementById("ownerWelcome").innerText : "";
        if(document.getElementById("confidentialPage") && document.getElementById("confidentialPage").style.display === "block" && currentOwner) {
            let savedMode = sessionStorage.getItem('ownerMode') || 'finance';
            if (savedMode === 'cost') { updateFinancialPage(currentOwner); } else { renderConfidentialCalendar(currentOwner); }
        }
    });
}

function checkIncomingOrders() {
    if(!incomingOrders) return;
    const tables = Object.keys(incomingOrders);
    if (tables.length > 0) {
        let table = tables[0];
        let orderData = incomingOrders[table];
        showIncomingOrderModal(table, orderData);
    } else {
        closeIncomingOrderModal();
    }
}

function saveAllToCloud() {
    db.ref('/').update({ 
        historyOrders, tableTimers, tableCarts, tableStatuses, 
        tableCustomers, tableSplitCounters, itemCosts, itemPrices, 
        ownerPasswords: OWNER_PASSWORDS,
        incomingOrders, tableBatchCounts,
        inventory 
    }).catch(err => console.error(err));
}

function refreshData() { try { let localHist = JSON.parse(localStorage.getItem("orderHistory")); if (localHist && (!historyOrders || historyOrders.length === 0)) historyOrders = localHist; } catch(e) { } }

function checkLogin() {
    try {
        let input = document.getElementById("loginPass").value;
        if (input === SYSTEM_PASSWORD) { sessionStorage.setItem("isLoggedIn", "true"); document.getElementById("loginError").style.display = "none"; showApp(); } 
        else { document.getElementById("loginError").style.display = "block"; document.getElementById("loginPass").value = ""; }
    } catch (e) { alert("登入錯誤: " + e.message); }
}

function updateItemData(name, type, value) { 
    let val = parseInt(value); if(isNaN(val)) val = 0; 
    if (type === 'cost') itemCosts[name] = val; else if (type === 'price') itemPrices[name] = val; 
    saveAllToCloud(); 
}

function toggleStockStatus(name, isAvailable) {
    if (!inventory) inventory = {};
    inventory[name] = isAvailable;
    saveAllToCloud();
}

function addToCart(name, price) { cart.push({ name, price, isNew: true, isTreat: false }); renderCart(); }
function toggleTreat(index) { cart[index].isTreat = !cart[index].isTreat; renderCart(); }
function removeItem(index) { cart.splice(index, 1); renderCart(); }

function saveOrderManual() { 
    try { 
        if (cart.length === 0) { showToast("購物車是空的，訂單未成立。"); saveAndExit(); return; } 
        if (!tableCustomers[selectedTable]) tableCustomers[selectedTable] = {}; 
        
        if (!tableTimers[selectedTable] || !tableCustomers[selectedTable].orderId) { 
            tableTimers[selectedTable] = Date.now(); 
            tableSplitCounters[selectedTable] = 1; 
            let currentBizDate = getBusinessDate(new Date());
            let todayCount = historyOrders.filter(o => getBusinessDate(getDateFromOrder(o)) === currentBizDate).length;
            tableCustomers[selectedTable].orderId = todayCount + 1; 
        } 
        
        let itemsToSave = cart.map(item => {
             let newItem = {...item};
             delete newItem.isNew;
             return newItem;
        });

        tableCarts[selectedTable] = itemsToSave; 
        tableStatuses[selectedTable] = 'yellow'; 
        tableCustomers[selectedTable].name = document.getElementById("custName").value; 
        tableCustomers[selectedTable].phone = document.getElementById("custPhone").value; 
        
        saveAllToCloud(); 
        
        printReceipt({ seq: tableCustomers[selectedTable].orderId, table: selectedTable, time: new Date().toLocaleString('zh-TW', { hour12: false }), items: cart, original: 0, total: 0 }, true); 
        
        showToast(`✔ 訂單已送出 (單號 #${tableCustomers[selectedTable].orderId})！`); openTableSelect(); 
    } catch (e) { alert("出單發生錯誤: " + e.message); } 
}

function saveAndExit() {
    try {
        if (!Array.isArray(cart)) cart = [];
        let hasChanges = JSON.stringify(cart) !== entryCartSignature;
        if (hasChanges) { if (!confirm("⚠️ 本次點餐有變更，確定要離開嗎？\n(離開後，這些未送出的商品將被清空)")) return; }
        cart = []; entryCartSignature = "[]"; currentDiscount = { type: 'none', value: 0 }; isServiceFeeEnabled = false; tempCustomItem = null; openTableSelect();
    } catch (e) { console.error("返回錯誤:", e); openTableSelect(); }
}

function customerSubmitOrder() {
    if (cart.length === 0) { alert("購物車是空的喔！"); return; }
    
    let currentBatch = tableBatchCounts[selectedTable] || 0;
    let nextBatch = currentBatch + 1; 
    let batchColorIdx = (nextBatch - 1) % 3;

    let itemsToSend = cart.map((item, idx) => ({
        ...item,
        isNew: true,
        batchIdx: batchColorIdx,
        incomingIdx: idx 
    }));

    let customerInfo = {
        name: document.getElementById("custName").value || "",
        phone: document.getElementById("custPhone").value || ""
    };

    db.ref(`incomingOrders/${selectedTable}`).set({
        items: itemsToSend,
        customer: customerInfo,
        batchId: nextBatch, 
        timestamp: Date.now()
    }).then(() => {
        alert("✅ 點餐成功！\n\n您的訂單已傳送至櫃台，\n服務人員確認後將為您準備餐點。");
        
        // 🔥 修改：將購物車內容移至 sentItems
        let justSent = cart.map(item => ({ ...item, isSent: true }));
        sentItems = [...sentItems, ...justSent];
        sessionStorage.setItem("sentItems", JSON.stringify(sentItems));
        
        cart = []; 
        renderCart(); 
    }).catch(err => {
        alert("傳送失敗，請通知服務人員：" + err.message);
    });
}

function confirmIncomingOrder() {
    if (!currentIncomingTable) return;
    
    let pendingData = incomingOrders[currentIncomingTable];
    if (!pendingData) return;

    // 將顧客送出的同一批次訂單附上時間/批次，避免被拆成多次列印
    let sentAt = pendingData.timestamp || Date.now();
    let batchId = pendingData.batchId;
    let rawItems = Array.isArray(pendingData.items) ? pendingData.items : Object.values(pendingData.items || {});
    let items = rawItems
        .filter(Boolean)
        .map((i, idx) => ({ ...i, batchId, sentAt, incomingIdx: i.incomingIdx !== undefined ? i.incomingIdx : idx }))
        .sort((a, b) => (a.incomingIdx || 0) - (b.incomingIdx || 0));
    let cust = pendingData.customer || {};

    tableBatchCounts[currentIncomingTable] = batchId;

    let currentCart = tableCarts[currentIncomingTable] || [];
    let newCart = currentCart.concat(items);
    tableCarts[currentIncomingTable] = newCart;

    tableStatuses[currentIncomingTable] = 'yellow';
    if (!tableCustomers[currentIncomingTable]) tableCustomers[currentIncomingTable] = {};
    if (cust.name) tableCustomers[currentIncomingTable].name = cust.name;
    
    if (!tableTimers[currentIncomingTable] || !tableCustomers[currentIncomingTable].orderId) {
        tableTimers[currentIncomingTable] = Date.now();
        tableSplitCounters[currentIncomingTable] = 1;
        let currentBizDate = getBusinessDate(new Date());
        let todayCount = historyOrders.filter(o => getBusinessDate(getDateFromOrder(o)) === currentBizDate).length;
        tableCustomers[currentIncomingTable].orderId = todayCount + 1;
    }

    printReceipt({ 
        seq: tableCustomers[currentIncomingTable].orderId, 
        table: currentIncomingTable, 
        time: new Date(sentAt).toLocaleString('zh-TW', { hour12: false }), 
        items: items, 
        original: 0, total: 0 
    }, true);

    delete incomingOrders[currentIncomingTable];

    saveAllToCloud();
    closeIncomingOrderModal();
    showToast(`✅ 已接收 ${currentIncomingTable} 的訂單`);
}

function rejectIncomingOrder() {
    if (!currentIncomingTable) return;
    if(!confirm("確定要忽略這筆訂單嗎？")) return;
    delete incomingOrders[currentIncomingTable];
    saveAllToCloud();
    closeIncomingOrderModal();
}

function checkoutAll(manualFinal) { 
    let payingTotal = (manualFinal !== undefined) ? manualFinal : discountedTotal; 
    let time = new Date().toLocaleString('zh-TW', { hour12: false }); 
    let originalTotal = currentOriginalTotal; 
    let info = tableCustomers[selectedTable] || { name:"", phone:"", orderId: "?" }; 
    let currentBizDate = getBusinessDate(new Date());
    let todayOrders = historyOrders.filter(o => getBusinessDate(getDateFromOrder(o)) === currentBizDate);
    if(!info.orderId || info.orderId === "?" || info.orderId === "T") { info.orderId = todayOrders.length + 1; } 

    if (originalTotal > 0 || payingTotal > 0) { 
        let splitNum = tableSplitCounters[selectedTable]; let displaySeq = info.orderId; let displaySeat = selectedTable; 
        if(splitNum && splitNum > 1) { displaySeq = `${info.orderId}-${splitNum}`; displaySeat = `${selectedTable} (拆單)`; } 
        let processedItems = cart.map(item => { if (item.isTreat) { return { ...item, price: 0, name: item.name + " (招待)" }; } return item; }); 
        // Firebase 不接受 undefined，確保客人資訊至少為空字串
        let newOrder = { 
            seat: displaySeat, 
            formattedSeq: displaySeq, 
            time: time, 
            timestamp: Date.now(), 
            items: processedItems, 
            total: payingTotal, 
            originalTotal: originalTotal, 
            customerName: info.name || "", 
            customerPhone: info.phone || "", 
            isClosed: false 
        }; 
        if(!Array.isArray(historyOrders)) historyOrders = []; 
        historyOrders.push(newOrder); localStorage.setItem("orderHistory", JSON.stringify(historyOrders)); 
    } 
    delete tableCarts[selectedTable]; delete tableTimers[selectedTable]; delete tableStatuses[selectedTable]; delete tableCustomers[selectedTable]; delete tableSplitCounters[selectedTable]; 
    delete tableBatchCounts[selectedTable];
    
    // 清除該桌的 sentItems
    sentItems = [];
    sessionStorage.removeItem("sentItems");

    saveAllToCloud(); cart = []; currentDiscount = { type: 'none', value: 0 }; isServiceFeeEnabled = false; 
    alert(`💰 結帳完成！實收 $${payingTotal} \n(如需明細，請至「今日訂單」補印)`); openTableSelect(); 
}

function calcFinalPay() { let allowance = parseInt(document.getElementById("payAllowance").value) || 0; finalTotal = discountedTotal - allowance; if(finalTotal < 0) finalTotal = 0; document.getElementById("payFinal").value = finalTotal; }
function calcSplitTotal() { let baseTotal = tempRightList.reduce((a, b) => a + b.price, 0); let disc = parseFloat(document.getElementById("splitDisc").value); let allow = parseInt(document.getElementById("splitAllow").value); let finalSplit = baseTotal; if (!isNaN(disc) && disc > 0 && disc <= 100) { finalSplit = Math.round(baseTotal * (disc / 100)); } if (!isNaN(allow) && allow > 0) { finalSplit = finalSplit - allow; } if(finalSplit < 0) finalSplit = 0; document.getElementById("payTotal").innerText = "$" + finalSplit; return finalSplit; }

function fixAllOrderIds() {
    if (!confirm("⚠️ 確定要執行「一鍵重整」嗎？\n\n1. 將所有歷史訂單依照日期重新編號 (#1, #2...)\n2. 修正目前桌上未結帳訂單的錯誤單號")) return;
    historyOrders.sort((a, b) => new Date(a.time) - new Date(b.time));
    let dateCounters = {};
    historyOrders.forEach(order => {
        let d = new Date(order.time); if (d.getHours() < 5) d.setDate(d.getDate() - 1);
        let dateKey = `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`;
        if (!dateCounters[dateKey]) dateCounters[dateKey] = 0; dateCounters[dateKey]++;
        order.formattedSeq = dateCounters[dateKey]; order.seq = dateCounters[dateKey];
    });
    let now = new Date(); if (now.getHours() < 5) now.setDate(now.getDate() - 1);
    let todayKey = `${now.getFullYear()}-${now.getMonth()+1}-${now.getDate()}`;
    let currentMaxSeq = dateCounters[todayKey] || 0;
    for (let table in tableCustomers) {
        if (tableCustomers[table] && tableStatuses[table] === 'yellow') {
            currentMaxSeq++; tableCustomers[table].orderId = currentMaxSeq;
        }
    }
    saveAllToCloud(); alert("✅ 修復完成！\n歷史訂單已重整，目前桌位單號已校正。\n網頁將自動重新整理。"); location.reload(); 
}

function initHistoryDate() { let now = new Date(); if (now.getHours() < 5) now.setDate(now.getDate() - 1); historyViewDate = new Date(now); }
function getOrdersByDate(targetDate) {
    let start = new Date(targetDate); start.setHours(5, 0, 0, 0); 
    let end = new Date(start); end.setDate(end.getDate() + 1); 
    return historyOrders.filter(order => { let t = getDateFromOrder(order); return t >= start && t < end; });
}

setInterval(updateSystemTime, 1000);
function updateSystemTime() { document.getElementById("systemTime").innerText = "🕒 " + new Date().toLocaleString('zh-TW', { hour12: false }); }

/* ========== 🔥 顯示邏輯修改 (包含已下單區塊) ========== */
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

    // 🔥 顯示邏輯：合併「已送出」與「目前購物車」
    let displayItems = [];

    // 1. 先加入已送出的商品 (若有的話)
    if (sentItems.length > 0) {
        sentItems.forEach(item => {
            displayItems.push({ ...item, isSent: true, count: 1 });
        });
    }

    // 2. 再加入目前購物車
    let currentCartItems = isCartSimpleMode ? getMergedItems(cart) : cart.map(item => ({ ...item, count: 1 }));
    displayItems = [...displayItems, ...currentCartItems];

    if (displayItems.length === 0) {
        cartList.innerHTML = `<div style="text-align:center; color:#ccc; padding:20px;">購物車空空的</div>`;
    }

    displayItems.forEach((c, i) => { 
        let count = c.count || 1;
        let itemTotal = (c.isTreat ? 0 : c.price) * count;
        
        // 只有「未送出」的才計入目前應付金額 (避免客人以為重複算錢)
        if (!c.isSent) {
            currentOriginalTotal += itemTotal;
        }

        let treatClass = c.isTreat ? "treat-btn active btn-effect" : "treat-btn btn-effect";
        let treatText = c.isTreat ? "已招待" : "🎁 招待";
        let priceHtml = "";
        let nameHtml = "";
        let rowClass = "cart-item-row";

        // 已下單樣式
        if (c.isSent) {
            nameHtml = `<div class="cart-item-name" style="color:#adb5bd;">${c.name} <small>(已下單)</small></div>`;
            priceHtml = `<span style="color:#adb5bd;">$${itemTotal}</span>`;
            rowClass += " sent-item"; 
        } else {
            // 一般樣式
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
            }
        }

        let actionButtons = "";
        // 已下單的沒有刪除鈕
        if (c.isSent) {
             actionButtons = `<small style="color:#ccc;">已傳送</small>`;
        } else {
             // 這裡的 index 需要修正，因為 displayItems 包含了 sentItems
             // 我們需要找到這個 item 在原本 cart 陣列的 index
             // 簡單做法：displayItems 後半段就是 cart，所以 index 減去 sentItems 長度
             let realCartIndex = i - (typeof sentItems !== 'undefined' ? sentItems.length : 0);
             
             actionButtons = !isCartSimpleMode ? `<button class="${treatClass}" onclick="toggleTreat(${realCartIndex})">${treatText}</button><button class="del-btn btn-effect" onclick="removeItem(${realCartIndex})">刪除</button>` : `<small style="color:#888;">(切換檢視操作)</small>`;
        }
        
        cartList.innerHTML += `<div class="${rowClass}">${nameHtml}<div class="cart-item-price">${priceHtml}</div><div style="display:flex; gap:5px; justify-content:flex-end;">${actionButtons}</div></div>`; 
    }); 

    discountedTotal = currentOriginalTotal; 
    if (currentDiscount.type === 'percent') { discountedTotal = Math.round(currentOriginalTotal * (currentDiscount.value / 100)); } 
    else if (currentDiscount.type === 'amount') { discountedTotal = currentOriginalTotal - currentDiscount.value; if(discountedTotal < 0) discountedTotal = 0; }

    let serviceFee = 0;
    if (isServiceFeeEnabled) { serviceFee = Math.round(currentOriginalTotal * 0.1); discountedTotal += serviceFee; }

    let finalHtml = `總金額：`;
    if(currentDiscount.type !== 'none' || isServiceFeeEnabled) { finalHtml += `<span style="text-decoration:line-through; color:#999; font-size:16px;">$${currentOriginalTotal}</span> `; }
    finalHtml += `<span style="color:#ef476f;">$${discountedTotal}</span>`;

    let noteText = [];
    if (currentDiscount.type === 'percent') noteText.push(`折扣 ${currentDiscount.value}%`);
    if (currentDiscount.type === 'amount') noteText.push(`折讓 -${currentDiscount.value}`);
    if (isServiceFeeEnabled) noteText.push(`含服務費 +$${serviceFee}`);
    
    if(noteText.length > 0) { finalHtml += ` <small style="color:#555;">(${noteText.join(", ")})</small>`; }
    totalText.innerHTML = finalHtml;
}

function addInlineHiddenBeer() { let name = document.getElementById("hbName").value.trim(); let price = parseInt(document.getElementById("hbPrice").value); if(!name) name = "隱藏啤酒"; if(isNaN(price) || price < 0) { alert("請輸入正確價格"); return; } addToCart(name, price); }
function checkItemType(name, price, categoryName) { 
    if (name === "隱藏特調") { openCustomModal(name, price); return; } 
    let realPrice = itemPrices[name] !== undefined ? itemPrices[name] : price; 
    if (name === "隱藏啤酒") { addToCart(name, realPrice); return; } 
    if (categoryName === "咖啡") { openDrinkModal(name, realPrice, "coffee"); return; } 
    if (categoryName === "飲料") { if (name.includes("茶")) openDrinkModal(name, realPrice, "tea"); else openDrinkModal(name, realPrice, "drink"); return; } 
    if (categoryName === "主餐") { if (name === "炒飯") { openFoodModal(name, realPrice, "friedRice"); return; } if (name === "日式炒烏龍麵" || name === "親子丼") { openFoodModal(name, realPrice, "meatOnly"); return; } } 
    addToCart(name, realPrice); 
}
function addShotSet(name, price) { addToCart(`${name} <small style='color:#06d6a0'>[買5送1]</small>`, price * 5); }

function openFoodModal(name, price, type) { 
    tempCustomItem = { name, price, type }; document.getElementById("foodTitle").innerText = name; let meatOptions = document.getElementById("meatOptions"); let html = ""; 
    if (type === "friedRice") html = `<label class="radio-box"><input type="radio" name="meat" value="牛" onclick="tempCustomItem.price=${price}" checked><div class="radio-btn btn-effect">牛 ($${price})</div></label><label class="radio-box"><input type="radio" name="meat" value="豬" onclick="tempCustomItem.price=${price}"><div class="radio-btn btn-effect">豬 ($${price})</div></label><label class="radio-box"><input type="radio" name="meat" value="雞" onclick="tempCustomItem.price=${price}"><div class="radio-btn btn-effect">雞 ($${price})</div></label><label class="radio-box"><input type="radio" name="meat" value="蝦仁" onclick="tempCustomItem.price=${price}"><div class="radio-btn btn-effect">蝦仁 ($${price})</div></label>`; 
    else html = `<label class="radio-box"><input type="radio" name="meat" value="牛" checked><div class="radio-btn btn-effect">牛</div></label><label class="radio-box"><input type="radio" name="meat" value="豬"><div class="radio-btn btn-effect">豬</div></label><label class="radio-box"><input type="radio" name="meat" value="雞"><div class="radio-btn btn-effect">雞</div></label>`; 
    meatOptions.innerHTML = html; foodOptionModal.style.display = "flex"; 
}
function closeFoodModal() { foodOptionModal.style.display = "none"; tempCustomItem = null; }
function confirmFoodItem() { try { if (!tempCustomItem) return; let meat = document.querySelector('input[name="meat"]:checked').value; addToCart(`${tempCustomItem.name} <small style='color:#666'>(${meat})</small>`, tempCustomItem.price); closeFoodModal(); } catch (e) { alert("加入餐點失敗: " + e.message); } }

function openDrinkModal(name, price, type) { tempCustomItem = { name, price, type }; document.getElementById("drinkTitle").innerText = name; let simpleTemp = document.getElementById("simpleTempSection"); let advTemp = document.getElementById("advanceTempSection"); let sugar = document.getElementById("sugarSection"); document.querySelectorAll('input[name="simpleTemp"]')[0].checked = true; document.querySelectorAll('input[name="advTemp"]')[0].checked = true; document.querySelectorAll('input[name="sugar"]')[0].checked = true; if (type === "coffee") { simpleTemp.style.display = "block"; advTemp.style.display = "none"; sugar.style.display = "none"; } else if (type === "drink") { simpleTemp.style.display = "none"; advTemp.style.display = "block"; sugar.style.display = "none"; } else if (type === "tea") { simpleTemp.style.display = "none"; advTemp.style.display = "block"; sugar.style.display = "block"; } drinkModal.style.display = "flex"; }
function closeDrinkModal() { drinkModal.style.display = "none"; tempCustomItem = null; }
function confirmDrinkItem() { try { if (!tempCustomItem) return; let note = ""; if (tempCustomItem.type === "coffee") { let temp = document.querySelector('input[name="simpleTemp"]:checked').value; note = `<small style='color:#666'>(${temp})</small>`; } else { let temp = document.querySelector('input[name="advTemp"]:checked').value; if (tempCustomItem.type === "tea") { let sugar = document.querySelector('input[name="sugar"]:checked').value; note = `<small style='color:#666'>(${temp} / ${sugar})</small>`; } else { note = `<small style='color:#666'>(${temp})</small>`; } } addToCart(tempCustomItem.name + " " + note, tempCustomItem.price); closeDrinkModal(); } catch (e) { alert("加入飲料失敗: " + e.message); } }

function openCustomModal(name, price) { tempCustomItem = { name, price }; document.querySelectorAll('input[name="flavor"]')[0].checked = true; document.querySelectorAll('input[name="taste"]')[0].checked = true; let alcoholSec = document.getElementById("modalAlcoholSection"); let noteSec = document.getElementById("modalNoteSection"); let title = document.getElementById("customTitle"); if (price === 280) { title.innerText = "隱藏特調(酒精)"; alcoholSec.style.display = "block"; noteSec.style.display = "none"; isExtraShot = false; document.getElementById("extraShotBtn").classList.remove("active"); document.getElementById("alcoholRange").value = 0; document.getElementById("alcoholVal").innerText = "0"; } else if (price === 300) { title.innerText = "隱藏特調(無酒精)"; alcoholSec.style.display = "none"; noteSec.style.display = "block"; document.getElementById("customNote").value = ""; } customModal.style.display = "flex"; }
function toggleExtraShot() { isExtraShot = !isExtraShot; document.getElementById("extraShotBtn").classList.toggle("active"); }
function closeCustomModal() { customModal.style.display = "none"; tempCustomItem = null; }
function confirmCustomItem() { try { if (!tempCustomItem) return; let flavor = document.querySelector('input[name="flavor"]:checked').value; let taste = document.querySelector('input[name="taste"]:checked').value; let extraStr = ""; let finalPrice = tempCustomItem.price; if (tempCustomItem.price === 280) { let alcohol = document.getElementById("alcoholRange").value; if(isExtraShot) { finalPrice += 40; extraStr += "<br><b style='color:#d33;'>🔥 濃度升級 (+$40)</b>"; } extraStr += `<br><small style='color:#666'>(${flavor} / ${taste} / 濃度+${alcohol}%)</small>`; } else { let note = document.getElementById("customNote").value.trim(); if(note) extraStr += `<br><span style='color:#007bff; font-size:14px;'>📝 ${note}</span>`; extraStr += `<br><small style='color:#666'>(${flavor} / ${taste})</small>`; } addToCart(`${tempCustomItem.name} ${extraStr}`, finalPrice); closeCustomModal(); } catch (e) { alert("加入特調失敗: " + e.message); } }

function openDiscountModal() { discountModal.style.display = "flex"; }
function closeDiscountModal() { discountModal.style.display = "none"; }
function confirmDiscount() { let val = parseFloat(document.getElementById("discInput").value); if (isNaN(val) || val <= 0 || val > 100) { alert("請輸入正確折數 (1-100)"); return; } currentDiscount = { type: 'percent', value: val }; renderCart(); closeDiscountModal(); }
function openAllowanceModal() { allowanceModal.style.display = "flex"; }
function closeAllowanceModal() { allowanceModal.style.display = "none"; }
function confirmAllowance() { let val = parseInt(document.getElementById("allowInput").value); if (isNaN(val) || val < 0) { alert("請輸入正確金額"); return; } currentDiscount = { type: 'amount', value: val }; renderCart(); closeAllowanceModal(); }

function openPaymentModal() { 
    if (cart.length === 0) { if(!confirm("購物車是空的，確定要直接清桌嗎？")) return; checkoutAll(0); return; } 
    document.getElementById("payOriginal").innerText = "$" + discountedTotal; 
    let labels = [];
    if(currentDiscount.type === 'percent') labels.push(`${currentDiscount.value} 折`);
    if(currentDiscount.type === 'amount') labels.push(`折讓 ${currentDiscount.value}`);
    if(isServiceFeeEnabled) labels.push("10% 服務費");
    document.getElementById("payDiscLabel").innerText = labels.length > 0 ? `(${labels.join(" + ")})` : "";
    document.getElementById("payAllowance").value = ""; 
    document.getElementById("payFinal").value = discountedTotal; 
    finalTotal = discountedTotal; 
    paymentModal.style.display = "flex"; 
}
function closePaymentModal() { paymentModal.style.display = "none"; }
function confirmCheckout() { let finalAmount = parseInt(document.getElementById("payFinal").value); if(isNaN(finalAmount) || finalAmount < 0) { alert("金額錯誤！"); return; } checkoutAll(finalAmount); closePaymentModal(); }

function openSplitCheckout() { if (cart.length === 0) { alert("購物車是空的，無法拆單！"); return; } tempLeftList = [...cart]; tempRightList = []; if(document.getElementById("splitDisc")) document.getElementById("splitDisc").value = ""; if(document.getElementById("splitAllow")) document.getElementById("splitAllow").value = ""; renderCheckoutLists(); checkoutModal.style.display = "flex"; }
function renderCheckoutLists() { let leftHTML = ""; let rightHTML = ""; let rightTotal = 0; if(tempLeftList.length === 0) leftHTML = "<div class='empty-hint'>已無剩餘項目</div>"; else tempLeftList.forEach((item, index) => { leftHTML += `<div class="checkout-item" onclick="moveToPay(${index})"><span>${item.name}</span><span>$${item.price}</span></div>`; }); if(tempRightList.length === 0) rightHTML = "<div class='empty-hint'>點擊左側加入</div>"; else tempRightList.forEach((item, index) => { rightHTML += `<div class="checkout-item" onclick="removeFromPay(${index})"><span>${item.name}</span><span>$${item.price}</span></div>`; }); document.getElementById("unpaidList").innerHTML = leftHTML; document.getElementById("payingList").innerHTML = rightHTML; calcSplitTotal(); }
function moveToPay(index) { let item = tempLeftList.splice(index, 1)[0]; tempRightList.push(item); renderCheckoutLists(); }
function removeFromPay(index) { let item = tempRightList.splice(index, 1)[0]; tempLeftList.push(item); renderCheckoutLists(); }
function closeCheckoutModal() { checkoutModal.style.display = "none"; }
function updateDiscPreview() { let val = parseFloat(document.getElementById("discInput").value); if (isNaN(val) || val <= 0 || val > 100) { document.getElementById("discPreviewText").innerText = ""; return; } let discounted = Math.round(currentOriginalTotal * (val / 100)); document.getElementById("discPreviewText").innerText = `原價 $${currentOriginalTotal} ➡ 折後 $${discounted}`; }

async function printReceipt(data, isTicket = false) {
    let kitchenCategories = ["燒烤", "主餐", "炸物", "厚片"];
    let barItems = []; let kitchenItems = [];
    data.items.forEach(i => {
        let itemCat = "";
        for (const [cat, content] of Object.entries(menuData)) {
            if (Array.isArray(content)) { if (content.some(x => i.name.includes(x.name))) itemCat = cat; } else { for (const subContent of Object.values(content)) { if (subContent.some(x => i.name.includes(x.name))) itemCat = cat; } }
        }
        if(itemCat === "") { if(i.name.includes("雞") || i.name.includes("豬") || i.name.includes("牛") || i.name.includes("飯") || i.name.includes("麵")) itemCat = "主餐"; }
        if (kitchenCategories.includes(itemCat)) kitchenItems.push(i); else barItems.push(i);
    });
    const printArea = document.getElementById("receipt-print-area");
    
    // 🔥 修改：新增 style 標籤強制列印時靠左對齊，並移除 printArea 的內容
    const styleOverride = `<style>
        @media print {
            .receipt-section { text-align: left !important; }
            .receipt-items { text-align: left !important; }
            .receipt-item span:first-child { text-align: left !important; }
            .receipt-item span:last-child { text-align: right !important; }
            /* 讓項目名稱靠左，數量靠右 */
            .receipt-item.kitchen-item { display: flex; justify-content: space-between; }
        }
    </style>`;

    const generateHtml = (title, items, isFullReceipt) => {
        let itemsHtml = ""; 
        items.forEach(i => { 
            let displayName = i.name; 
            if (i.isTreat) displayName += " (招待)"; 
            let priceStr = isFullReceipt ? (i.isTreat ? "$0" : `$${i.price}`) : ""; 
            
            // 🔥 修正：讓 kitchen-item 具有 space-between 屬性，確保排版靠左
            let itemClass = isFullReceipt ? "receipt-item" : "receipt-item kitchen-item"; 
            
            // 如果是工作單，只顯示名稱和數量
            if (!isFullReceipt) {
                // 為了排版正確，我們必須確保這裡的項目是未合併的單品項，但這裡的 data.items 已經是單品項
                itemsHtml += `<div class="${itemClass}"><span>${displayName}</span><span>${i.count ? 'x' + i.count : 'x1'}</span></div>`;
            } else {
                itemsHtml += `<div class="${itemClass}"><span>${displayName}</span><span>${priceStr}</span></div>`;
            }
        });
        
        let footerHtml = ""; 
        if (isFullReceipt) { 
            footerHtml = `<div class="receipt-footer"><div class="row"><span>原價：</span><span>$${data.original}</span></div><div class="row"><span>總計：</span><span class="total">$${data.total}</span></div></div>`; 
        }
        
        // 🔥 確保標題靠左
        let headerAlign = isFullReceipt ? 'center' : 'left';
        
        return `${styleOverride}<div class="receipt-section" style="text-align: ${headerAlign};"><div class="receipt-header"><h2 class="store-name" style="text-align: ${headerAlign};">${title}</h2><div class="receipt-info" style="text-align: ${headerAlign};"><p>單號：${data.seq}</p><p>桌號：${data.table}</p><p>時間：${data.time}</p></div></div><hr class="dashed-line"><div class="receipt-items">${itemsHtml}</div><hr class="dashed-line">${footerHtml}</div>`;
    };
    
    const performPrint = (htmlContent) => { 
        return new Promise((resolve) => { 
            // 每次列印前先清空，避免重複內容疊加
            printArea.innerHTML = "";
            printArea.innerHTML = htmlContent; 
            
            // 將 printArea 暫時移到可視範圍進行列印
            printArea.style.position = 'static';
            printArea.style.width = 'auto';
            printArea.style.height = 'auto';
            
            setTimeout(() => { 
                window.print(); 
                
                // 列印完畢後再隱藏
                printArea.style.position = 'absolute';
                printArea.style.width = '0';
                printArea.style.height = '0';
                
                setTimeout(resolve, 500); 
            }, 500); 
        }); 
    };
    
    if (!isTicket) { 
        await performPrint(generateHtml("結帳收據", data.items, true)); 
    } else { 
        let hasBar = barItems.length > 0; 
        let hasKitchen = kitchenItems.length > 0; 
        
        // 為了確保列印能夠分開，必須對 printArea 進行操作，並處理頁面樣式覆蓋
        let printQueue = [];
        if (hasBar) printQueue.push(generateHtml("吧檯工作單", barItems, false));
        if (hasKitchen) printQueue.push(generateHtml("廚房工作單", kitchenItems, false));

        for (const content of printQueue) {
            await performPrint(content);
        }
    }
}
