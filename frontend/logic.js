/* logic.js - 核心邏輯與資料初始化 (v13: 簡化核心, 專注於同步) */
console.log("Logic JS v13 Loaded - 核心邏輯與資料初始化已載入");

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
            let currentOwner = document.getElementById("ownerWelcome") ? document.getElementById("ownerWelcome").innerText : "";
            if(document.getElementById("confidentialPage") && document.getElementById("confidentialPage").style.display === "block" && currentOwner) {
                let savedMode = sessionStorage.getItem('ownerMode') || 'finance';
                if (savedMode === 'cost') { updateFinancialPage(currentOwner); } else { renderConfidentialCalendar(currentOwner); }
            }
        }, 50);
    });
}

function saveAllToCloud() {
    db.ref('/').update({ 
        historyOrders, tableOrders, tableTimers, tableBatchCounts,
        itemCosts, itemPrices, inventory, lastOrderId, 
        ownerPasswords: OWNER_PASSWORDS,
        incomingOrders,
    }).catch(err => console.error(err));
}


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

function addToCart(name, price) { cart.push({ name, price, isNew: true, isTreat: false, id: Date.now() + Math.random() }); renderCart(); }
function toggleTreat(index) { cart[index].isTreat = !cart[index].isTreat; renderCart(); }
function removeItem(index) { cart.splice(index, 1); renderCart(); }

function initHistoryDate() { let now = new Date(); if (now.getHours() < 5) now.setDate(now.getDate() - 1); historyViewDate = new Date(now); }
function getOrdersByDate(targetDate) {
    let start = new Date(targetDate); start.setHours(5, 0, 0, 0); 
    let end = new Date(start); end.setDate(end.getDate() + 1); 
    return historyOrders.filter(order => { let t = getDateFromOrder(order); return t >= start && t < end; });
}

setInterval(updateSystemTime, 1000);
function updateSystemTime() { document.getElementById("systemTime").innerText = "🕒 " + new Date().toLocaleString('zh-TW', { hour12: false }); }

function refreshData() { 
    // 舊的 localStorage 保持不動，但新的資料結構主要依賴 Firebase
    try { 
        let localHist = JSON.parse(localStorage.getItem("orderHistory")); 
        if (localHist && (!historyOrders || historyOrders.length === 0)) historyOrders = localHist; 
    } catch(e) { } 
}

function fixAllOrderIds() {
    if (!confirm("⚠️ 確定要執行「一鍵重整」嗎？\n\n此操作將重編所有歷史單號。")) return;
    historyOrders.sort((a, b) => new Date(a.time) - new Date(b.time));
    let dateCounters = {};
    historyOrders.forEach(order => {
        let d = new Date(order.time); if (d.getHours() < 5) d.setDate(d.getDate() - 1);
        let dateKey = `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`;
        if (!dateCounters[dateKey]) dateCounters[dateKey] = 0; dateCounters[dateKey]++;
        order.formattedSeq = dateCounters[dateKey]; order.seq = dateCounters[dateKey];
    });
    // 重設 lastOrderId
    if(historyOrders.length > 0) {
        const lastOrder = historyOrders[historyOrders.length - 1];
        lastOrderId = parseInt(lastOrder.formattedSeq) + 1;
    } else {
        lastOrderId = 1;
    }
    saveAllToCloud(); 
    alert("✅ 修復完成！\n歷史訂單已重整，網頁將自動重新整理。"); 
    location.reload(); 
}
