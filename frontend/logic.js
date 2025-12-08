/* logic.js - 核心邏輯 (加入訂單攔截與顏色循環) */

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const db = firebase.database();

let historyOrders = [];
let tableTimers = {};
let tableCarts = {};
let tableStatuses = {};
let tableCustomers = {};
let tableSplitCounters = {}; 
let itemCosts = {}; 
let itemPrices = {}; 
let ownerPasswords = { "景偉": "0001", "小飛": "0002", "威志": "0003" };

// 🔥 新增：待確認訂單 與 桌號批次計數器
let incomingOrders = {}; 
let tableBatchCounts = {}; 

let selectedTable = null;
let cart = []; 
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
let currentIncomingTable = null; // 目前正在處理哪一桌的通知

let historyViewDate = new Date();
let isCartSimpleMode = false;
let isHistorySimpleMode = false;

function getMergedItems(items) {
    if (!items || !Array.isArray(items)) return [];
    let merged = [];
    items.forEach(item => {
        // 增加 batchIdx 判斷，不同批次的商品不合併
        let existing = merged.find(m => m.name === item.name && m.price === item.price && m.isTreat === item.isTreat && m.batchIdx === item.batchIdx);
        if (existing) { existing.count = (existing.count || 1) + 1; } else { merged.push({ ...item, count: 1 }); }
    });
    return merged;
}

function getDateFromOrder(order) {
    if (order.timestamp) return new Date(order.timestamp);
    let d = new Date(order.time);
    if (!isNaN(d.getTime())) return d;
    return new Date(); 
}

function getBusinessDate(dateObj) {
    let d = new Date(dateObj);
    if (d.getHours() < 5) d.setDate(d.getDate() - 1);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
}

function getItemCategoryType(itemName) {
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
    let cleanName = itemName.replace(" (招待)", "").trim();
    if (itemCosts[cleanName] !== undefined) return itemCosts[cleanName];
    let baseName = cleanName.replace(/\s*[\(（].*?[\)）]$/, "").trim();
    if (itemCosts[baseName] !== undefined) return itemCosts[baseName];
    if (cleanName.includes("隱藏特調")) { if (itemCosts["隱藏特調"] !== undefined) return itemCosts["隱藏特調"]; }
    return 0; 
}

function initRealtimeData() {
    db.ref('/').on('value', (snapshot) => {
        const data = snapshot.val() || {};
        historyOrders = data.historyOrders ? (Array.isArray(data.historyOrders) ? data.historyOrders : Object.values(data.historyOrders)) : [];
        tableTimers = data.tableTimers || {};
        tableCarts = data.tableCarts || {};
        tableStatuses = data.tableStatuses || {};
        tableCustomers = data.tableCustomers || {};
        tableSplitCounters = data.tableSplitCounters || {}; 
        itemCosts = data.itemCosts || {}; 
        itemPrices = data.itemPrices || {};
        
        // 🔥 讀取待確認訂單與批次計數
        incomingOrders = data.incomingOrders || {};
        tableBatchCounts = data.tableBatchCounts || {};
        
        if (data.ownerPasswords) OWNER_PASSWORDS = data.ownerPasswords;

        // 🔥 如果有新訂單，且不是客人模式，則跳出提示
        if (!document.body.classList.contains('customer-mode')) {
            checkIncomingOrders();
        }

        if(document.getElementById("tableSelect").style.display === "block") renderTableGrid();
        if(document.getElementById("historyPage").style.display === "block") showHistory();
        if(document.getElementById("reportPage").style.display === "block") { generateReport('day'); renderCalendar(); }
        if(document.getElementById("pastHistoryPage").style.display === "block") { renderPublicStats(); }
        
        let currentOwner = document.getElementById("ownerWelcome").innerText;
        if(document.getElementById("confidentialPage").style.display === "block" && currentOwner) {
            let savedMode = sessionStorage.getItem('ownerMode') || 'finance';
            if (savedMode === 'cost') { updateFinancialPage(currentOwner); } else { renderConfidentialCalendar(currentOwner); }
        }
    });
}

// 🔥 檢查是否有待確認訂單
function checkIncomingOrders() {
    const tables = Object.keys(incomingOrders);
    if (tables.length > 0) {
        // 取第一筆來顯示
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
        incomingOrders, tableBatchCounts // 🔥 同步新資料
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

function addToCart(name, price) { cart.push({ name, price, isNew: true, isTreat: false }); renderCart(); }
function toggleTreat(index) { cart[index].isTreat = !cart[index].isTreat; renderCart(); }
function removeItem(index) { cart.splice(index, 1); renderCart(); }

// 店員手動下單 (維持原樣，但要清除 batch 資訊以免混淆)
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
        
        // 店員手動下單不使用顏色區分，清除 batchIdx
        let itemsToSave = cart.map(item => {
             let newItem = {...item};
             delete newItem.isNew;
             // 店員點的不加顏色，或者您可以指定一個特殊顏色
             return newItem;
        });

        tableCarts[selectedTable] = itemsToSave; 
        tableStatuses[selectedTable] = 'yellow'; 
        tableCustomers[selectedTable].name = document.getElementById("custName").value; 
        tableCustomers[selectedTable].phone = document.getElementById("custPhone").value; 
        
        saveAllToCloud(); 
        
        // 若有新商品需列印 (這裡邏輯簡化，全印)
        printReceipt({ seq: tableCustomers[selectedTable].orderId, table: selectedTable, time: new Date().toLocaleString('zh-TW', { hour12: false }), items: cart, original: 0, total: 0 }, true); 
        
        showToast(`✔ 訂單已送出 (單號 #${tableCustomers[selectedTable].orderId})！`); openTableSelect(); 
    } catch (e) { alert("出單發生錯誤: " + e.message); } 
}

function saveAndExit() {
    try {
        if (!Array.isArray(cart)) cart = [];
        let hasUnsentItems = cart.some(item => item.isNew === true);
        if (hasUnsentItems) { if (!confirm("⚠️ 購物車內有未送出的商品，確定要離開嗎？\n(離開後，這些未送出的商品將被清空)")) return; }
        cart = []; currentDiscount = { type: 'none', value: 0 }; isServiceFeeEnabled = false; tempCustomItem = null; openTableSelect();
    } catch (e) { console.error("返回錯誤:", e); openTableSelect(); }
}

// 🔥 客人送出訂單 (修改版：送到 incomingOrders + 顏色標記)
function customerSubmitOrder() {
    if (cart.length === 0) { alert("購物車是空的喔！"); return; }
    
    // 1. 計算該桌目前的批次 (Batch Count)
    let currentBatch = tableBatchCounts[selectedTable] || 0;
    let nextBatch = currentBatch + 1; // 這是這一桌的第幾次點餐

    // 2. 決定顏色 (0:藍, 1:紅, 2:綠) -> 這裡用 % 3
    // 因為第一次點餐(1)希望是藍色，所以我們用 (nextBatch - 1) % 3
    // 1 -> 0 (藍), 2 -> 1 (紅), 3 -> 2 (綠), 4 -> 0 (藍)...
    let batchColorIdx = (nextBatch - 1) % 3;

    // 3. 幫商品加上批次標記
    let itemsToSend = cart.map(item => ({
        ...item,
        isNew: true,
        batchIdx: batchColorIdx // 標記顏色
    }));

    // 4. 準備顧客資料
    let customerInfo = {
        name: document.getElementById("custName").value || "",
        phone: document.getElementById("custPhone").value || ""
    };

    // 5. 寫入 "incomingOrders" 而不是直接寫入 tableCarts
    db.ref(`incomingOrders/${selectedTable}`).set({
        items: itemsToSend,
        customer: customerInfo,
        batchId: nextBatch, // 暫存批次號碼
        timestamp: Date.now()
    }).then(() => {
        alert("✅ 點餐成功！\n\n您的訂單已傳送至櫃台，\n服務人員確認後將為您準備餐點。");
        cart = []; // 清空客人的本地購物車
        renderCart();
    }).catch(err => {
        alert("傳送失敗，請通知服務人員：" + err.message);
    });
}

// 🔥 店員確認訂單 (將 incomingOrders 合併入 tableCarts)
function confirmIncomingOrder() {
    if (!currentIncomingTable) return;
    
    let pendingData = incomingOrders[currentIncomingTable];
    if (!pendingData) return;

    let items = pendingData.items || [];
    let cust = pendingData.customer || {};
    let batchId = pendingData.batchId;

    // 1. 更新該桌的批次計數
    tableBatchCounts[currentIncomingTable] = batchId;

    // 2. 合併入現有購物車
    let currentCart = tableCarts[currentIncomingTable] || [];
    let newCart = currentCart.concat(items);
    tableCarts[currentIncomingTable] = newCart;

    // 3. 更新狀態與顧客資訊
    tableStatuses[currentIncomingTable] = 'yellow';
    if (!tableCustomers[currentIncomingTable]) tableCustomers[currentIncomingTable] = {};
    if (cust.name) tableCustomers[currentIncomingTable].name = cust.name;
    // 賦予單號
    if (!tableTimers[currentIncomingTable] || !tableCustomers[currentIncomingTable].orderId) {
        tableTimers[currentIncomingTable] = Date.now();
        tableSplitCounters[currentIncomingTable] = 1;
        let currentBizDate = getBusinessDate(new Date());
        let todayCount = historyOrders.filter(o => getBusinessDate(getDateFromOrder(o)) === currentBizDate).length;
        tableCustomers[currentIncomingTable].orderId = todayCount + 1;
    }

    // 4. 列印工單
    printReceipt({ 
        seq: tableCustomers[currentIncomingTable].orderId, 
        table: currentIncomingTable, 
        time: new Date().toLocaleString('zh-TW', { hour12: false }), 
        items: items, // 只印新加的
        original: 0, total: 0 
    }, true);

    // 5. 清除 incomingOrders
    delete incomingOrders[currentIncomingTable];

    saveAllToCloud();
    closeIncomingOrderModal();
    showToast(`✅ 已接收 ${currentIncomingTable} 的訂單`);
}

// 🔥 店員拒絕訂單
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
        let newOrder = { seat: displaySeat, formattedSeq: displaySeq, time: time, timestamp: Date.now(), items: processedItems, total: payingTotal, originalTotal: originalTotal, customerName: info.name, customerPhone: info.phone, isClosed: false }; 
        if(!Array.isArray(historyOrders)) historyOrders = []; 
        historyOrders.push(newOrder); localStorage.setItem("orderHistory", JSON.stringify(historyOrders)); 
    } 
    delete tableCarts[selectedTable]; delete tableTimers[selectedTable]; delete tableStatuses[selectedTable]; delete tableCustomers[selectedTable]; delete tableSplitCounters[selectedTable]; 
    // 🔥 結帳時也清除該桌的批次紀錄，讓下一組客人從藍色開始
    delete tableBatchCounts[selectedTable];
    
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