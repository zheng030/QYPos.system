/* logic.js - 核心邏輯 (v23: 修正今日訂單簡化模式) */
console.log("Logic JS v23 Loaded - 核心邏輯已載入");

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

let historyViewDate = new Date();
let isCartSimpleMode = false;
let isHistorySimpleMode = false; // 🔥 新增/確保這個狀態變數存在
let dailyFinancialData = {}; 

/* ========== 輔助函式 (保持不變) ========== */

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
            return getBusinessDate(getDateFromOrder(o)) === currentBizDate && o.isClosed !== true; // 只顯示未結清的當日訂單
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

/* ========== 資料庫監聽與初始化 (保持不變) ========== */

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
            // 確保頁面重新載入後能更新內容
            if(document.getElementById("historyPage") && document.getElementById("historyPage").style.display === "block") showHistory();
            
            if(document.getElementById("reportPage") && document.getElementById("reportPage").style.display === "block") { 
                let activeOption = document.querySelector('.segment-option.active');
                let type = activeOption && activeOption.innerText === '本周' ? 'week' : (activeOption && activeOption.innerText === '當月' ? 'month' : 'day');
                generateReport(type); 
                renderCalendar(); 
            }
            // 其他頁面更新邏輯 (略)
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
    // 篩選出目前沒有正在處理的 incomingOrders
    // 避免重複顯示同一個桌號的 incomingOrder
    const pendingTables = Object.keys(incomingOrders).filter(table => {
        return table !== currentIncomingTable;
    });

    if (pendingTables.length > 0) {
        let table = pendingTables[0];
        let orderData = incomingOrders[table];
        showIncomingOrderModal(table, orderData);
    } else {
        // 如果當前正在處理的 currentIncomingTable 被清空了，也會關閉 Modal
        if (!incomingOrders[currentIncomingTable]) { 
            closeIncomingOrderModal();
        }
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
            // 只計算當日已結和未結的訂單數量
            let todayCount = historyOrders.filter(o => getBusinessDate(getDateFromOrder(o)) === currentBizDate && o.isClosed !== true).length;
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
        
        // 這裡只印出新增的 (isNew:true) 項目作為廚房單
        printReceipt({ 
            seq: tableCustomers[selectedTable].orderId, 
            table: selectedTable, 
            time: new Date().toLocaleString('zh-TW', { hour12: false }), 
            items: cart, 
            original: 0, 
            total: 0 
        }, true); 
        
        // 清除 isNew 標記
        cart.forEach(item => delete item.isNew);
        
        saveAllToCloud();
        showToast(`✔ 訂單已送出 (單號 #${tableCustomers[selectedTable].orderId})！`); openTableSelect(); 
    } catch (e) { alert("出單發生錯誤: " + e.message); } 
}

function saveAndExit() {
    try {
        if (!Array.isArray(cart)) cart = [];
        
        // 檢查購物車和資料庫中是否有任何商品
        let hasItemsInCart = cart.length > 0;
        let hasItemsInDB = tableCarts[selectedTable] && tableCarts[selectedTable].length > 0;
        
        if (hasItemsInCart || hasItemsInDB) {
             let hasUnsentItems = cart.some(item => item.isNew === true);
             if (hasUnsentItems) { 
                 if (!confirm("⚠️ 購物車內有未送出的商品，確定要離開嗎？\n(離開後，這些未送出的商品將被清空)")) return; 
             }
        } else {
             // 如果購物車和資料庫都是空的，直接離開，無需提示
             cart = []; currentDiscount = { type: 'none', value: 0 }; isServiceFeeEnabled = false; tempCustomItem = null; openTableSelect();
             return;
        }

        cart = []; currentDiscount = { type: 'none', value: 0 }; isServiceFeeEnabled = false; tempCustomItem = null; openTableSelect();
    } catch (e) { console.error("返回錯誤:", e); openTableSelect(); }
}

function customerSubmitOrder() {
    if (cart.length === 0) { alert("購物車是空的喔！"); return; }
    
    let currentBatch = tableBatchCounts[selectedTable] || 0;
    let nextBatch = currentBatch + 1; 
    let batchColorIdx = (nextBatch - 1) % 3;

    let itemsToSend = cart.map(item => ({
        ...item,
        isNew: true,
        batchIdx: batchColorIdx 
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

    let items = pendingData.items || [];
    let cust = pendingData.customer || {};
    let batchId = pendingData.batchId;

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
        let todayCount = historyOrders.filter(o => getBusinessDate(getDateFromOrder(o)) === currentBizDate && o.isClosed !== true).length;
        tableCustomers[currentIncomingTable].orderId = todayCount + 1;
    }

    printReceipt({ 
        seq: tableCustomers[currentIncomingTable].orderId, 
        table: currentIncomingTable, 
        time: new Date().toLocaleString('zh-TW', { hour12: false }), 
        items: items, 
        original: 0, total: 0 
    }, true);

    // 🔥 修正邏輯：清除該桌的 incomingOrder，防止重複彈窗
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
    let todayOrders = historyOrders.filter(o => getBusinessDate(getDateFromOrder(o)) === currentBizDate && o.isClosed !== true);
    if(!info.orderId || info.orderId === "?" || info.orderId === "T") { info.orderId = todayOrders.length + 1; } 

    if (originalTotal > 0 || payingTotal > 0) { 
        let splitNum = tableSplitCounters[selectedTable]; let displaySeq = info.orderId; let displaySeat = selectedTable; 
        if(splitNum && splitNum > 1) { displaySeq = `${info.orderId}-${splitNum}`; displaySeat = `${selectedTable} (拆單)`; } 
        let processedItems = cart.map(item => { if (item.isTreat) { return { ...item, price: 0, name: item.name + " (招待)" }; } return item; }); 
        let newOrder = { seat: displaySeat, formattedSeq: displaySeq, time: time, timestamp: Date.now(), items: processedItems, total: payingTotal, originalTotal: originalTotal, customerName: info.name, customerPhone: info.phone, isClosed: false }; 
        if(!Array.isArray(historyOrders)) historyOrders = []; 
        historyOrders.push(newOrder); localStorage.setItem("orderHistory", JSON.stringify(historyOrders)); 
        
        // 印出消費明細 (非廚房單)
        printReceipt(newOrder, false);
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
        let d = getDateFromOrder(order); if (d.getHours() < 5) d.setDate(d.getDate() - 1);
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

/* ========== 顯示邏輯 (延續 logic.js 中的 renderCart) ========== */
// renderCart 邏輯在 logic.js 中已經定義

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

function openReprintModal() {
    if (cart.length === 0) { alert("購物車是空的"); return; }
    const list = document.getElementById('reprintList'); list.innerHTML = '';
    // 排除已送出的項目，只顯示目前購物車內的項目
    let currentCart = cart.filter(item => !item.isSent);
    currentCart.forEach((item, index) => { list.innerHTML += `<label class="checkout-item" style="justify-content: flex-start; gap: 10px;"><input type="checkbox" class="reprint-checkbox" id="reprint-item-${index}" checked><span>${item.name}</span></label>`; });
    list.innerHTML = `<label class="checkout-item" style="background:#f0f7ff; border-color:#007bff; font-weight:bold;"><input type="checkbox" id="selectAllReprint" checked onchange="toggleAllReprint(this)"><span>全選 / 取消全選</span></label><hr style="margin: 5px 0;">` + list.innerHTML;
    reprintSelectionModal.style.display = "flex";
}
function toggleAllReprint(source) { let checkboxes = document.querySelectorAll('.reprint-checkbox'); checkboxes.forEach(cb => cb.checked = source.checked); }
function closeReprintModal() { reprintSelectionModal.style.display = "none"; }
function confirmReprintSelection() {
    try { 
        let selectedItems = []; 
        let currentCart = cart.filter(item => !item.isSent);
        
        currentCart.forEach((item, index) => { 
            let cb = document.getElementById(`reprint-item-${index}`); 
            if (cb && cb.checked) selectedItems.push(item); 
        }); 
        
        if (selectedItems.length === 0) { alert("請至少選擇一個項目"); return; } 
        
        let seqNum = "補"; 
        if (tableCustomers[selectedTable] && tableCustomers[selectedTable].orderId) seqNum = tableCustomers[selectedTable].orderId; 
        
        // 印出選取的項目作為廚房單 (isKitchenTicket: true)
        printReceipt({ 
            seq: seqNum, 
            table: selectedTable, 
            time: new Date().toLocaleString('zh-TW', { hour12: false }), 
            items: selectedItems.map(i => ({...i, isNew: true})), // 暫時標記為 new，讓 printReceipt 處理
            original: 0, 
            total: 0 
        }, true); 
        closeReprintModal(); 
    } catch (e) { alert("補單發生錯誤: " + e.message); }
}

function openFinanceDetailModal(dateKey, stats) {
    document.getElementById("fdTitle").innerText = `📅 ${dateKey} 財務明細`;
    document.getElementById("fdBarRev").innerText = `$${stats.barRev}`;
    document.getElementById("fdBarCost").innerText = `-$${stats.barCost}`;
    document.getElementById("fdBarProfit").innerText = `$${stats.barRev - stats.barCost}`;
    document.getElementById("fdBbqRev").innerText = `$${stats.bbqRev}`;
    document.getElementById("fdBbqCost").innerText = `-$${stats.bbqCost}`;
    document.getElementById("fdBbqProfit").innerText = `$${stats.bbqRev - stats.bbqCost}`;
    let totalRev = stats.barRev + stats.bbqRev; let totalCost = stats.barCost + stats.bbqCost;
    document.getElementById("fdTotalRev").innerText = `$${totalRev}`; document.getElementById("fdTotalCost").innerText = `-$${totalCost}`; document.getElementById("fdTotalProfit").innerText = `$${totalRev - totalCost}`;
    let currentUser = document.getElementById("ownerWelcome").innerText;
    document.querySelector('.bar-style').style.display = (currentUser === '小飛' || currentUser === '景偉') ? 'block' : 'none';
    document.querySelector('.bbq-style').style.display = (currentUser === '威志' || currentUser === '景偉') ? 'block' : 'none';
    document.querySelector('.total-style').style.display = (currentUser === '景偉') ? 'block' : 'none';
    financeDetailModal.style.display = "flex";
}
function closeFinanceDetailModal() { financeDetailModal.style.display = "none"; }


/* 🔥 修改：美化後的成本輸入介面 (使用 Table) */
function updateFinancialPage(ownerName) {
    const listContainer = document.getElementById("costEditorList");
    listContainer.innerHTML = "";

    // 動態加入專用 CSS 樣式，確保不影響其他頁面
    const style = document.createElement('style');
    style.innerHTML = `
        .cost-table-container { width: 100%; overflow-x: auto; }
        .cost-table { width: 100%; border-collapse: collapse; margin-top: 10px; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.05); }
        .cost-table th { background: #f8f9fa; color: #495057; padding: 12px; text-align: left; font-size: 14px; border-bottom: 2px solid #e9ecef; }
        .cost-table td { padding: 10px 12px; border-bottom: 1px solid #f1f3f5; vertical-align: middle; }
        .cost-table tr:last-child td { border-bottom: none; }
        .cost-table tr:hover { background-color: #f8f9fa; }
        .cost-input { width: 100%; padding: 8px; border: 1px solid #ced4da; border-radius: 4px; font-size: 14px; transition: border-color 0.2s; box-sizing: border-box; }
        .cost-input:focus { border-color: #4dabf7; outline: none; box-shadow: 0 0 0 3px rgba(77, 171, 247, 0.1); }
        .cat-badge { display: inline-block; padding: 4px 10px; background: #e7f5ff; color: #1c7ed6; border-radius: 20px; font-size: 13px; font-weight: bold; margin-top: 20px; margin-bottom: 5px; }
    `;
    listContainer.appendChild(style);

    let targetCategories = [];
    const barCats = ["調酒", "純飲", "shot", "啤酒", "咖啡", "飲料", "厚片", "甜點"];
    const bbqCats = ["燒烤", "主餐", "炸物"];

    if (ownerName === "小飛") { targetCategories = barCats; }
    else if (ownerName === "威志") { targetCategories = bbqCats; }
    else { targetCategories = [...barCats, ...bbqCats, "其他"]; }

    targetCategories.forEach(cat => {
        if (!menuData[cat]) return;

        // 分類標題
        let catHeader = document.createElement("div");
        catHeader.className = "cat-badge";
        catHeader.innerText = cat;
        listContainer.appendChild(catHeader);

        // 建立表格容器
        let tableContainer = document.createElement("div");
        tableContainer.className = "cost-table-container";

        let tableHtml = `
            <table class="cost-table">
                <thead>
                    <tr>
                        <th style="width: 40%;">品項名稱</th>
                        <th style="width: 30%;">售價 (改)</th>
                        <th style="width: 30%;">成本 (改)</th>
                    </tr>
                </thead>
                <tbody>
        `;

        let items = [];
        let data = menuData[cat];
        if (Array.isArray(data)) { items = data; }
        else { Object.values(data).forEach(subList => { items = items.concat(subList); }); }

        items.forEach(item => {
            let currentPrice = itemPrices[item.name] !== undefined ? itemPrices[item.name] : item.price;
            let currentCost = itemCosts[item.name] !== undefined ? itemCosts[item.name] : 0;

            tableHtml += `
                <tr>
                    <td style="font-weight: 500; color: #343a40;">${item.name}</td>
                    <td>
                        <input type="number" class="cost-input" value="${currentPrice}" placeholder="售價"
                            onchange="updateItemData('${item.name}', 'price', this.value)">
                    </td>
                    <td>
                        <input type="number" class="cost-input" value="${currentCost}" placeholder="成本"
                            onchange="updateItemData('${item.name}', 'cost', this.value)" style="color: #e03131; font-weight:bold;">
                    </td>
                </tr>
            `;
        });

        tableHtml += `</tbody></table>`;
        tableContainer.innerHTML = tableHtml;
        listContainer.appendChild(tableContainer);
    });
}

function renderConfidentialCalendar(ownerName) {
    document.querySelectorAll('.finance-controls button').forEach(b => b.classList.remove('active'));
    document.getElementById('finBtnMonth').classList.add('active'); 
    document.getElementById("financeTitle").innerText = "🏠 全店總計 (該月)"; 

    let year = historyViewDate.getFullYear();
    let month = historyViewDate.getMonth();
    document.getElementById("finCalendarTitle").innerText = `${year}年 ${month + 1}月`;
    dailyFinancialData = {}; 
    let dailyCounts = {};
    let monthStats = { barRev: 0, barCost: 0, bbqRev: 0, bbqCost: 0 }; 

    if(Array.isArray(historyOrders)) {
        historyOrders.forEach(order => { 
            if(!order) return;
            let t = getDateFromOrder(order); 
            if (t.getHours() < 5) t.setDate(t.getDate() - 1); 
            
            if (t.getFullYear() === year && t.getMonth() === month && order.total > 0) { 
                let dayKey = t.getDate(); 
                let dateStr = `${year}/${month+1}/${dayKey}`;
                if (!dailyFinancialData[dateStr]) dailyFinancialData[dateStr] = { barRev:0, barCost:0, bbqRev:0, bbqCost:0 }; 
                if (!dailyCounts[dayKey]) dailyCounts[dayKey] = 0;
                dailyCounts[dayKey]++;

                if(order.items && Array.isArray(order.items)) {
                    order.items.forEach(item => { 
                        let costPerItem = getCostByItemName(item.name);
                        let rawName = item.name.replace(" (招待)", "").trim(); 
                        let type = getItemCategoryType(rawName); 
                        if (type === 'bar') { 
                            dailyFinancialData[dateStr].barRev += (item.price||0); dailyFinancialData[dateStr].barCost += costPerItem; 
                            monthStats.barRev += (item.price||0); monthStats.barCost += costPerItem;
                        } else { 
                            dailyFinancialData[dateStr].bbqRev += (item.price||0); dailyFinancialData[dateStr].bbqCost += costPerItem; 
                            monthStats.bbqRev += (item.price||0); monthStats.bbqCost += costPerItem;
                        } 
                    }); 
                }
            } 
        }); 
    }

    document.getElementById("monthBarRev").innerText = `$${monthStats.barRev.toLocaleString('zh-TW')}`;
    document.getElementById("monthBarCost").innerText = `-$${monthStats.barCost.toLocaleString('zh-TW')}`;
    document.getElementById("monthBarProfit").innerText = `$${(monthStats.barRev - monthStats.barCost).toLocaleString('zh-TW')}`;
    
    document.getElementById("monthBbqRev").innerText = `$${monthStats.bbqRev.toLocaleString('zh-TW')}`;
    document.getElementById("monthBbqCost").innerText = `-$${monthStats.bbqCost.toLocaleString('zh-TW')}`;
    document.getElementById("monthBbqProfit").innerText = `$${(monthStats.bbqRev - monthStats.bbqCost).toLocaleString('zh-TW')}`;

    let totalRev = monthStats.barRev + monthStats.bbqRev;
    let totalCost = monthStats.barCost + monthStats.bbqCost;
    document.getElementById("monthTotalRev").innerText = `$${totalRev.toLocaleString('zh-TW')}`;
    document.getElementById("monthTotalCost").innerText = `-$${totalCost.toLocaleString('zh-TW')}`;
    document.getElementById("monthTotalProfit").innerText = `$${(totalRev - totalCost).toLocaleString('zh-TW')}`;

    let barCard = document.querySelector('.bar-theme');
    let bbqCard = document.querySelector('.bbq-theme');
    let totalCard = document.querySelector('.total-theme');
    
    if(barCard && bbqCard && totalCard) {
        if (ownerName === "小飛") { barCard.style.display = "block"; bbqCard.style.display = "none"; totalCard.style.display = "none"; } 
        else if (ownerName === "威志") { barCard.style.display = "none"; bbqCard.style.display = "block"; totalCard.style.display = "none"; } 
        else { barCard.style.display = "block"; bbqCard.style.display = "block"; totalCard.style.display = "block"; }
    }

    let firstDay = new Date(year, month, 1).getDay(); let daysInMonth = new Date(year, month + 1, 0).getDate(); let grid = document.getElementById("finCalendarGrid"); grid.innerHTML = ""; for (let i = 0; i < firstDay; i++) { let empty = document.createElement("div"); empty.className = "calendar-day empty"; grid.appendChild(empty); } 
    let today = new Date(); if(today.getHours() < 5) today.setDate(today.getDate() - 1); 
    
    for (let d = 1; d <= daysInMonth; d++) { 
        let cell = document.createElement("div"); 
        cell.className = "calendar-day"; 
        if (d === today.getDate() && month === today.getMonth()) cell.classList.add("today"); 
        let dateStr = `${year}/${month+1}/${d}`;
        let stats = dailyFinancialData[dateStr] || { barRev:0, barCost:0, bbqRev:0, bbqCost:0 }; 
        let showRev = 0;
        if (ownerName === "小飛") showRev = stats.barRev; 
        else if (ownerName === "威志") showRev = stats.bbqRev; 
        else showRev = stats.barRev + stats.bbqRev; 
        
        let htmlContent = `<div class="day-num">${d}</div>`; 
        if (showRev > 0) { 
            htmlContent += `<div class="day-revenue">$${showRev.toLocaleString('zh-TW')}</div>`;
            if(dailyCounts[d]) htmlContent += `<div style="font-size:10px; color:#8d99ae;">(${dailyCounts[d]}單)</div>`;
            cell.style.cursor = "pointer";
            cell.style.backgroundColor = "#e0e7ff";
            cell.onclick = () => { showOwnerDetailedOrders(year, month, d); };
        } 
        cell.innerHTML = htmlContent; grid.appendChild(cell); 
    } 
}

function updateFinanceStats(range) {
    document.querySelectorAll('.finance-controls button').forEach(b => b.classList.remove('active'));
    if(range === 'day') document.getElementById('finBtnDay').classList.add('active');
    if(range === 'week') document.getElementById('finBtnWeek').classList.add('active');
    if(range === 'month') document.getElementById('finBtnMonth').classList.add('active');

    let stats = generateReportData(range);

    document.getElementById("financeTitle").innerText = "🏠 全店總計 (" + (range === 'day' ? "今日" : (range === 'week' ? "本周" : "本月")) + ")"; 

    document.getElementById("monthBarRev").innerText = `$${stats.barRev.toLocaleString('zh-TW')}`;
    document.getElementById("monthBarCost").innerText = `-$${stats.barCost.toLocaleString('zh-TW')}`;
    document.getElementById("monthBarProfit").innerText = `$${(stats.barRev - stats.barCost).toLocaleString('zh-TW')}`;
    
    document.getElementById("monthBbqRev").innerText = `$${stats.bbqRev.toLocaleString('zh-TW')}`;
    document.getElementById("monthBbqCost").innerText = `-$${stats.bbqCost.toLocaleString('zh-TW')}`;
    document.getElementById("monthBbqProfit").innerText = `$${(stats.bbqRev - stats.bbqCost).toLocaleString('zh-TW')}`;

    let totalRev = stats.barRev + stats.bbqRev;
    let totalCost = stats.barCost + stats.bbqCost;
    document.getElementById("monthTotalRev").innerText = `$${totalRev.toLocaleString('zh-TW')}`;
    document.getElementById("monthTotalCost").innerText = `-$${totalCost.toLocaleString('zh-TW')}`;
    document.getElementById("monthTotalProfit").innerText = `$${(totalRev - totalCost).toLocaleString('zh-TW')}`;
}

function showOwnerDetailedOrders(year, month, day) {
    let targetDate = new Date(year, month, day);
    document.getElementById("ownerSelectedDateTitle").innerText = `📅 ${year}/${month+1}/${day} 詳細訂單`;
    document.getElementById("ownerOrderListSection").style.display = "block";
    let box = document.getElementById("ownerOrderBox");
    box.innerHTML = "";

    let targetOrders = getOrdersByDate(targetDate);
    if (targetOrders.length === 0) { box.innerHTML = "<div style='padding:20px; text-align:center;'>無資料</div>"; return; }

    targetOrders.reverse().forEach((o) => {
        let seqDisplay = o.formattedSeq ? `#${o.formattedSeq}` : `#?`;
        let timeOnly = o.time.split(" ")[1] || o.time;
        let summary = getMergedItems(o.items).map(i => { let n = i.name; if(i.count>1) n+=` x${i.count}`; if(i.isTreat) n+=` (招待)`; return n; }).join("、");
        
        let rowHtml = `
            <div class="history-row" style="grid-template-columns: 0.5fr 0.8fr 2fr 0.8fr 0.8fr auto !important; font-size:14px; cursor:default;">
                <span class="seq" style="font-weight:bold; color:#4361ee;">${seqDisplay}</span>
                <span class="seat">${o.seat}</span>
                <span class="cust" style="color:#64748b; font-size:13px;">${summary}</span>
                <span class="time">${timeOnly}</span>
                <span class="amt" style="font-weight:bold; color:#ef476f;">$${o.total}</span>
                <button onclick='alert("此介面僅供查帳")' class="btn-effect" style="padding:5px 10px; font-size:12px; background:#94a3b8; color:white; border-radius:5px;">已歸檔</button>
            </div>`;
        box.innerHTML += rowHtml;
    });
    document.getElementById("ownerOrderListSection").scrollIntoView({behavior: "smooth"});
}

/* 🔥 滑動式按鈕動畫控制 */
function moveSegmentHighlighter(index) {
    const highlighter = document.getElementById('reportHighlighter');
    const options = document.querySelectorAll('.segment-control-container .segment-option');
    options.forEach(opt => opt.classList.remove('active'));
    if(options[index]) options[index].classList.add('active');
    const movePercent = index * 100;
    if(highlighter) highlighter.style.transform = `translateX(${movePercent}%)`;
}

// 新增報表渲染主函式
function generateReport(range) {
    const stats = generateReportData(range);
    
    // 設置標題和高亮
    let title = "";
    let index = 0;
    if (range === 'day') { title = "今日營業額"; index = 0; }
    else if (range === 'week') { title = "本周營業額"; index = 1; }
    else if (range === 'month') { title = "當月營業額"; index = 2; }
    
    document.getElementById('rptTitle').innerText = title;
    
    // 呼叫 Segment 高亮動畫
    moveSegmentHighlighter(index);

    // 更新報表內容
    document.getElementById('rptTotal').innerText = `$${stats.totalRev.toLocaleString('zh-TW')}`;
    document.getElementById('rptCount').innerText = `總單數: ${stats.totalCount}`;
    document.getElementById('rptBar').innerText = `$${stats.barRev.toLocaleString('zh-TW')}`;
    document.getElementById('rptBBQ').innerText = `$${stats.bbqRev.toLocaleString('zh-TW')}`;
}

// 新增日曆渲染主函式
function renderCalendar() {
    let now = new Date();
    // 營業日計算：凌晨 5 點前算前一天
    if (now.getHours() < 5) now.setDate(now.getDate() - 1);
    
    let year = now.getFullYear();
    let month = now.getMonth();
    
    document.getElementById("calendarMonthTitle").innerText = `${year}年 ${month + 1}月`;
    const grid = document.getElementById("calendarGrid");
    grid.innerHTML = "";
    
    // 填充該月每日資料
    let dailyData = {};
    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);
    
    for(let d = firstDayOfMonth.getDate(); d <= lastDayOfMonth.getDate(); d++) {
        let dayStart = new Date(year, month, d, 5, 0, 0, 0); // 該日的 5:00AM
        let dayEnd = new Date(year, month, d + 1, 5, 0, 0, 0); // 隔日的 5:00AM
        
        let dailyOrders = historyOrders.filter(order => {
            let t = getDateFromOrder(order);
            return t >= dayStart && t < dayEnd && order.total > 0;
        });
        
        dailyData[d] = { 
            rev: dailyOrders.reduce((sum, order) => sum + (order.total || 0), 0), 
            count: dailyOrders.length
        };
    }
    
    let firstDay = new Date(year, month, 1).getDay(); // 0 是周日
    let daysInMonth = lastDayOfMonth.getDate();
    
    // 填補空格
    for (let i = 0; i < firstDay; i++) {
        let empty = document.createElement("div");
        empty.className = "calendar-day empty";
        grid.appendChild(empty);
    }
    
    // 填入日期
    for (let d = 1; d <= daysInMonth; d++) {
        let cell = document.createElement("div");
        cell.className = "calendar-day";
        if (d === now.getDate() && month === now.getMonth()) cell.classList.add("today");
        
        let stats = dailyData[d] || { rev: 0, count: 0 };

        let htmlContent = `<div class="day-num">${d}</div>`;
        if (stats.rev > 0) {
            htmlContent += `<div class="day-revenue">$${stats.rev.toLocaleString('zh-TW')}</div>`;
            if (stats.count > 0) htmlContent += `<div style="font-size:10px; color:#8d99ae;">(${stats.count}單)</div>`;
            cell.style.backgroundColor = "#e0e7ff";
        }
        
        cell.innerHTML = htmlContent;
        grid.appendChild(cell);
    }
}

// 結束營業 (日結) 功能
function closeBusiness() {
    if(!confirm("⚠️ 確定要執行今日營業日結嗎？\n\n- 結算當日營業額\n- 清空今日所有未結帳桌位和已結帳訂單\n- 數據將歸檔至報表")) return;
    
    const todayStats = generateReportData('day');

    document.getElementById("sumCount").innerText = `${todayStats.totalCount} 單`;
    document.getElementById("sumTotal").innerText = `$${todayStats.totalRev.toLocaleString('zh-TW')}`;

    document.getElementById("summaryModal").style.display = "flex";
}

// 確認清除資料 (日結確認)
function confirmClearData() {
    try {
        let currentBizDate = getBusinessDate(new Date());
        
        // 篩選出非當營業日的歷史訂單
        let toKeep = historyOrders.filter(o => getBusinessDate(getDateFromOrder(o)) !== currentBizDate);
        
        // 取得當日已結訂單
        let todayClosedOrders = historyOrders.filter(o => getBusinessDate(getDateFromOrder(o)) === currentBizDate);

        // 將當日訂單標記為已結 (isClosed: true)
        todayClosedOrders.forEach(o => o.isClosed = true);
        
        // 合併回總訂單列表
        historyOrders = [...toKeep, ...todayClosedOrders];
        
        // 清空所有桌位的購物車和狀態
        tableCarts = {};
        tableTimers = {};
        tableStatuses = {};
        tableCustomers = {};
        tableSplitCounters = {};
        tableBatchCounts = {};

        saveAllToCloud();
        closeSummaryModal();
        showToast("✅ 今日營業日結已完成！數據已歸檔。");
        setTimeout(() => { location.reload(); }, 1500);

    } catch(e) {
        alert("日結失敗: " + e.message);
    }
}

// 新增列印功能 (ui.js) - 已修改為靠左對齊
function printReceipt(order, isKitchenTicket) {
    if (!order || !order.items) return;

    // 取得所有已送出/未送出的商品
    const itemsToPrint = isKitchenTicket ? order.items.filter(item => item.isNew) : getMergedItems(order.items);

    if (itemsToPrint.length === 0) {
        if(isKitchenTicket) return; // 廚房單沒新項目就不用印
    }

    let printArea = document.getElementById('receipt-print-area');
    printArea.innerHTML = ''; // 清空列印區域
    printArea.style.width = '300px'; // 模擬收據機寬度

    const title = isKitchenTicket ? '🔔 廚房/吧檯工作單' : '🧾 消費明細';
    const totalLine = isKitchenTicket ? '' : `<div style="border-top:1px dashed black; margin-top:10px; padding-top:10px; font-size:18px; font-weight:bold;">總計: $${order.total}</div>`;

    let itemHtml = '';
    itemsToPrint.forEach(item => {
        let itemName = item.name.replace("<small style='color:#06d6a0'>[買5送1]</small>", "").trim();
        // 確保列印時的單價和總價是正確的
        let itemPrice = item.isTreat ? 0 : item.price; 
        let itemQty = item.count || 1;
        let itemTotal = item.isTreat ? '招待' : `$${itemPrice * itemQty}`;
        let itemNote = '';
        
        // 提取客製化/備註資訊
        // 匹配 <small...>...</small>
        const noteMatch = itemName.match(/<small.*?<\/small>/);
        if(noteMatch) {
            itemNote = noteMatch[0].replace(/<small style='color:#666'>\((.*?)\)<\/small>/, ' ($1)');
            itemName = itemName.replace(noteMatch[0], '').trim();
        }
        
        // 匹配 <b...>...</b >
        const extraShotMatch = itemName.match(/<br><b.*?<\/b>/);
        if(extraShotMatch) {
             itemNote += extraShotMatch[0].replace(/<br><b.*?>(.*?)<\/b>/, ' | $1');
             itemName = itemName.replace(extraShotMatch[0], '').trim();
        }
        
        // 修正：將數量、名稱、總價分開列印
        itemHtml += `
            <div style="display:flex; justify-content:space-between; font-size:15px; margin-bottom:2px; font-weight:bold;">
                <span style="width:30px;">x${itemQty}</span>
                <span style="flex-grow:1; text-align:left;">${itemName} ${item.isTreat ? ' (招待)' : ''}</span>
                <span style="width:60px; text-align:right;">${itemTotal}</span>
            </div>
            ${itemNote ? `<div style="font-size:12px; color:#555; margin-left:30px; text-align:left; margin-bottom:5px;">${itemNote.replace(/<br>/g, ' ')}</div>` : ''}
        `;
    });

    // 修正：將最外層改為 text-align:left
    const receiptHtml = `
        <div style="width:280px; margin:0 auto; padding:10px; text-align:left;">
            <h1 style="font-size:20px; margin-bottom:5px; text-align:center;">${title}</h1>
            <p style="font-size:14px; margin:5px 0;">單號: ${order.seq}</p>
            <h2 style="font-size:16px; margin:5px 0;">桌號: ${order.table}</h2>
            <p style="font-size:12px; margin:5px 0 10px 0;">時間: ${order.time}</p>
            <div style="border-top:1px dashed black; padding-top:10px;">
                ${itemHtml}
            </div>
            ${totalLine}
            ${isKitchenTicket ? '' : `<div style="margin-top:15px; font-size:12px; text-align:center;">謝謝您的惠顧！</div>`}
        </div>
    `;

    printArea.innerHTML = receiptHtml;
    
    // 觸發列印
    window.print();
    
    // 清空列印區域，避免在非列印模式下顯示
    setTimeout(() => {
        printArea.innerHTML = '';
        printArea.style.width = '0';
    }, 500);
}


function showToast(message) { const toast = document.getElementById("toast-container"); toast.innerText = message; toast.style.opacity = "1"; setTimeout(() => { toast.style.opacity = "0"; }, 2500); }
function closeSummaryModal() { summaryModal.style.display = "none"; }
window.toggleDetail = function(id) { let el = document.getElementById(id); if (el.style.display === "none") { el.style.display = "block"; } else { el.style.display = "none"; } };
window.toggleAccordion = function(id) { let el = document.getElementById(id); if(!el) return; let btn = el.previousElementSibling; el.classList.toggle("show"); if (btn) btn.classList.toggle("active"); };

/* ========== 這裡是最重要的修正區域 (確保功能連動) ========== */
window.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const tableParam = urlParams.get('table');
    if (tableParam) {
        console.log("進入客人點餐模式，桌號:", tableParam);
        document.body.classList.add("customer-mode");
        sessionStorage.setItem("isLoggedIn", "true");
        showApp();
        setTimeout(() => {
            selectedTable = decodeURIComponent(tableParam);
            hideAll();
            document.getElementById("orderPage").style.display = "block";
            document.getElementById("seatLabel").innerText = "（" + selectedTable + "）";
            const saveBtn = document.querySelector('.save-btn');
            if(saveBtn) { saveBtn.innerText = "🚀 送出廚房"; saveBtn.onclick = customerSubmitOrder; }
            document.getElementById("seatTimer").style.display = "none";
            
            buildCategories(); 
            
            if(tableCarts[selectedTable]) { 
                // 將所有 cart 內容視為已送出，並更新 sentItems
                sentItems = tableCarts[selectedTable].map(item => ({ ...item, isSent: true, isNew: false }));
                sessionStorage.setItem("sentItems", JSON.stringify(sentItems));
                cart = []; // 客人重新登入，購物車清空
                renderCart(); 
            }
        }, 800);
    } else { if(sessionStorage.getItem("isLoggedIn") === "true") { showApp(); } }
});
