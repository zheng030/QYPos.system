/* ========== 🔥 1. Firebase 設定 ========== */
const firebaseConfig = {
  apiKey: "AIzaSyBY3ILlBr5N8a8PxMv3IDSScmNZzvtXXVw",
  authDomain: "pos-system-database.firebaseapp.com",
  databaseURL: "https://pos-system-database-default-rtdb.firebaseio.com",
  projectId: "pos-system-database",
  storageBucket: "pos-system-database.firebasestorage.app",
  messagingSenderId: "302159719042",
  appId: "1:302159719042:web:5efb78fe497cc2f426629b",
  measurementId: "G-2G680G6GHF"
};

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const db = firebase.database();

/* ========== 2. 系統變數 ========== */
const SYSTEM_PASSWORD = "5898"; 
let OWNER_PASSWORDS = { "景偉": "0001", "小飛": "0002", "威志": "0003" };

// dailyOrderCount 已棄用，改用即時計算
let historyOrders = [];
let tableTimers = {};
let tableCarts = {};
let tableStatuses = {};
let tableCustomers = {};
let tableSplitCounters = {}; 
let itemCosts = {}; 
let itemPrices = {}; 
let dailyFinancialData = {}; 

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

// 合併顯示模式變數
let isCartSimpleMode = false;
let isHistorySimpleMode = false;

const tables = ["吧檯1","吧檯2","吧檯3","吧檯4","吧檯5","圓桌1","圓桌2","六人桌","四人桌1","四人桌2","大理石桌1","備用1","備用2","備用3","備用4"];

/* ========== 核心合併邏輯 ========== */
function getMergedItems(items) {
    if (!items || !Array.isArray(items)) return [];
    let merged = [];
    items.forEach(item => {
        let existing = merged.find(m => 
            m.name === item.name && 
            m.price === item.price && 
            m.isTreat === item.isTreat
        );
        if (existing) {
            existing.count = (existing.count || 1) + 1;
        } else {
            merged.push({ ...item, count: 1 }); 
        }
    });
    return merged;
}

/* ========== 3. 菜單資料 ========== */
const categories = ["調酒", "純飲", "shot", "啤酒", "咖啡", "飲料", "燒烤", "主餐", "炸物", "厚片", "甜點", "其他"];
const menuData = {
    "調酒": { 
        "$250 調酒": [{name:"高球",price:250},{name:"琴通寧",price:250},{name:"螺絲起子",price:250},{name:"藍色珊瑚礁",price:250},{name:"龍舌蘭日出",price:250}], 
        "$280 調酒": [{name:"白色俄羅斯",price:280},{name:"性感海灘",price:280},{name:"威士忌酸",price:280},{name:"惡魔",price:280},{name:"梅夢",price:280},{name:"輕浪蘭夢",price:280},{name:"暮色梅影",price:280},{name:"醉椰落日",price:280},{name:"晨曦花露",price:280},{name:"隱藏特調",price:280}], 
        "$320 調酒": [{name:"橙韻旋律",price:320},{name:"莫希托",price:320},{name:"長島冰茶",price:320},{name:"內格羅尼",price:320},{name:"咖啡馬丁尼",price:320},{name:"雅茗",price:320},{name:"幽香琥珀",price:320},{name:"琴盈紅酸",price:320},{name:"微醺榛情",price:320}], 
        "無酒精調酒": [{name:"小熊軟糖",price:300},{name:"桂花晨露",price:300},{name:"玫瑰紅茶",price:300},{name:"珍珠奶茶",price:300},{name:"紅豆牛奶",price:300},{name:"隱藏特調",price:300}] 
    },
    "純飲": { 
        "$200 純飲": [{name:"岩井(紅酒桶)",price:200},{name:"鉑仕曼 12 年",price:200},{name:"百富 12 年",price:200},{name:"拉佛格",price:200},{name:"蘇格登 12 年",price:200},{name:"格蘭利威 12 年",price:200},{name:"凱德漢 7 年",price:200}], 
        "$300 純飲": [{name:"響",price:300},{name:"白州",price:300},{name:"岩井(雪莉桶)",price:300},{name:"大摩 12 年",price:300},{name:"百富 14 年",price:300},{name:"卡爾里拉",price:300}] 
    },
    "shot": [{name:"伏特加",price:100},{name:"蘭姆酒",price:100},{name:"龍舌蘭",price:100},{name:"琴酒",price:100},{name:"威士忌",price:100},{name:"B52",price:150},{name:"薄荷奶糖",price:150},{name:"提拉米蘇",price:150},{name:"小愛爾蘭",price:150}],
    "啤酒": [{name:"百威",price:120},{name:"可樂娜",price:120},{name:"金樽",price:150},{name:"雪山",price:150},{name:"隱藏啤酒",price:0}],
    "咖啡": [{name:"美式",price:100},{name:"青檸美式",price:120},{name:"冰橙美式",price:150},{name:"拿鐵",price:120},{name:"香草拿鐵",price:120},{name:"榛果拿鐵",price:150},{name:"摩卡拿鐵",price:150}],
    "飲料": [{name:"可樂",price:80},{name:"雪碧",price:80},{name:"可爾必思",price:80},{name:"柳橙汁",price:80},{name:"蘋果汁",price:80},{name:"蔓越莓汁",price:80},{name:"紅茶",price:80},{name:"綠茶",price:80},{name:"烏龍茶",price:80}],
    "燒烤": { 
        "Popular": [{name:"米血",price:25},{name:"豆乾",price:25},{name:"雞脖子",price:25},{name:"小肉豆",price:25},{name:"甜不辣",price:25},{name:"鑫鑫腸",price:25},{name:"糯米腸",price:25},{name:"百頁豆腐",price:25},{name:"豆包",price:30},{name:"肥腸",price:30},{name:"鱈魚丸",price:30},{name:"豬捲蔥",price:40},{name:"雞胸肉",price:40},{name:"豬捲金針菇",price:40},{name:"香腸",price:40},{name:"牛肉串",price:45},{name:"雞腿捲",price:45},{name:"孜然羊肉串",price:50},{name:"香蔥雞腿肉串",price:55},{name:"雞腿",price:80}], 
        "Chicken": [{name:"雞胗",price:30},{name:"雞心",price:30},{name:"雞翅",price:30},{name:"雞屁股",price:30},{name:"雞皮",price:35},{name:"大熱狗",price:35},{name:"鹹麻吉",price:35},{name:"花生麻吉",price:35}], 
        "花生糯米腸組合": [{name:"A 糯米腸+香腸",price:80},{name:"B 糯米腸+鹹豬肉",price:100},{name:"C 糯米腸+香腸+鹹豬肉",price:150},{name:"糯米腸",price:100},{name:"鹹豬肉",price:120},{name:"香酥雞胸",price:120}], 
        "隱藏限定": [{name:"碳烤豆腐",price:40},{name:"牛蒡甜不辣",price:40},{name:"沙爹豬",price:45},{name:"手羽先",price:50},{name:"洋蔥牛五花",price:55},{name:"香蔥牛五花",price:55},{name:"碳烤雞排",price:90},{name:"麝香牛五花",price:95},{name:"乾煎虱目魚",price:180},{name:"帶骨牛小排",price:280}] 
    },
    "主餐": [{name:"炒飯",price:90},{name:"蒜漬糖蜜番茄麵包",price:140},{name:"日式炒烏龍麵",price:150},{name:"親子丼",price:160},{name:"酒蒸蛤蠣",price:180},{name:"純酒白蝦",price:200},{name:"唐揚咖哩",price:220},{name:"龍膽石斑魚湯",price:280},{name:"味繒鮭魚",price:0}],
    "炸物": [{name:"嫩炸豆腐",price:80},{name:"脆薯",price:100},{name:"雞塊",price:100},{name:"鑫鑫腸",price:100},{name:"雞米花",price:100},{name:"洋蔥圈",price:100},{name:"酥炸魷魚",price:0},{name:"炸物拼盤",price:400}],
    "厚片": [{name:"花生厚片",price:80},{name:"奶酥厚片",price:80},{name:"蒜香厚片",price:80},{name:"巧克力厚片",price:80},{name:"巧克力棉花糖厚片",price:80}],
    "甜點": [{name:"起司蛋糕",price:120}],
    "其他": [{name:"服務費",price:100}]
};

/* ========== 登入與初始化 ========== */
function checkLogin() {
    try {
        let input = document.getElementById("loginPass").value;
        if (input === SYSTEM_PASSWORD) {
            sessionStorage.setItem("isLoggedIn", "true");
            document.getElementById("loginError").style.display = "none"; 
            showApp();
        } else {
            document.getElementById("loginError").style.display = "block"; 
            document.getElementById("loginPass").value = ""; 
        }
    } catch (e) { alert("登入錯誤: " + e.message); }
}

function showApp() {
    document.getElementById("login-screen").style.display = "none";
    document.getElementById("app-container").style.display = "block";
    initRealtimeData();
    goHome();
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
        // 移除 dailyOrderCount，改用即時計算
        itemCosts = data.itemCosts || {}; 
        itemPrices = data.itemPrices || {};
        if (data.ownerPasswords) OWNER_PASSWORDS = data.ownerPasswords;

        if(document.getElementById("tableSelect").style.display === "block") renderTableGrid();
        if(document.getElementById("historyPage").style.display === "block") showHistory();
        if(document.getElementById("reportPage").style.display === "block") {
            generateReport('day'); 
            renderCalendar();
        }
        
        let currentOwner = document.getElementById("ownerWelcome").innerText;
        if(document.getElementById("confidentialPage").style.display === "block" && currentOwner) {
            let savedMode = sessionStorage.getItem('ownerMode') || 'finance';
            if (savedMode === 'cost') {
                updateFinancialPage(currentOwner);
            } else {
                renderFinanceCalendar(currentOwner);
            }
        }
    });
}

function saveAllToCloud() {
    db.ref('/').update({
        historyOrders, tableTimers, tableCarts, tableStatuses, tableCustomers, tableSplitCounters, itemCosts, itemPrices, ownerPasswords: OWNER_PASSWORDS
    }).catch(err => console.error(err));
}

function refreshData() { try { let localHist = JSON.parse(localStorage.getItem("orderHistory")); if (localHist && (!historyOrders || historyOrders.length === 0)) historyOrders = localHist; } catch(e) { } }

setInterval(updateSystemTime, 1000);
function updateSystemTime() { document.getElementById("systemTime").innerText = "🕒 " + new Date().toLocaleString('zh-TW', { hour12: false }); }

/* ========== 介面導航 ========== */
const menuGrid = document.getElementById("menuGrid");
const cartList = document.getElementById("cart-list");
const totalText = document.getElementById("total");
const historyBox = document.getElementById("history-box");

const custNameInput = document.getElementById("custName");
const custPhoneInput = document.getElementById("custPhone");

const summaryModal = document.getElementById("summaryModal");
const customModal = document.getElementById("customModal");
const drinkModal = document.getElementById("drinkModal");
const foodOptionModal = document.getElementById("foodOptionModal");
const checkoutModal = document.getElementById("checkoutModal");
const ownerLoginModal = document.getElementById("ownerLoginModal");
const paymentModal = document.getElementById("paymentModal"); 
const changePasswordModal = document.getElementById("changePasswordModal");
const discountModal = document.getElementById("discountModal");
const allowanceModal = document.getElementById("allowanceModal");
const financeDetailModal = document.getElementById("financeDetailModal");
const reprintSelectionModal = document.getElementById("reprintSelectionModal");

function hideAll() { 
    ["home", "orderPage", "historyPage", "tableSelect", "reportPage", "confidentialPage", "settingsPage", "pastHistoryPage"].forEach(id => { 
        let el = document.getElementById(id); 
        if(el) el.style.display = "none"; 
    }); 
    if(seatTimerInterval) clearInterval(seatTimerInterval); 
}

function goHome() { hideAll(); document.getElementById("home").style.display = "grid"; }

function openTableSelect() { 
    hideAll(); 
    refreshData(); 
    document.getElementById("tableSelect").style.display = "block"; 
    renderTableGrid(); 
}

// 🔥🔥🔥 修正後的 openPage (確保所有頁面都能正常開啟) 🔥🔥🔥
function openPage(pageId) { 
    hideAll(); 
    let el = document.getElementById(pageId); 
    if(el) el.style.display = "block"; 
    
    if(pageId === 'historyPage') {
        showHistory();
    }
    
    if(pageId === 'reportPage') { 
        generateReport('day'); 
        renderCalendar(); 
    } 
    
    if(pageId === 'pastHistoryPage') {
        renderHistoryCalendar();
    }
}

function openSettingsPage() { hideAll(); document.getElementById("settingsPage").style.display = "block"; }

function clearAllData() {
    if (!confirm("⚠️ 危險操作！\n\n這將會：\n1. 清空所有歷史訂單\n2. 歸零今日單號\n3. 清空所有桌況\n\n(成本與售價設定會保留)\n\n確定要執行嗎？")) return;

    historyOrders = [];
    tableTimers = {};
    tableCarts = {};
    tableStatuses = {};
    tableCustomers = {};
    tableSplitCounters = {};

    localStorage.removeItem("orderHistory");
    saveAllToCloud();

    showHistory();
    if(document.getElementById("reportPage").style.display === "block") {
        generateReport('day');
        renderCalendar();
    }
    if(document.getElementById("tableSelect").style.display === "block") {
        renderTableGrid();
    }

    alert("✅ 系統已重置！所有測試資料已清除。");
}

/* ========== Helper Functions (時間處理) ========== */
function getDateFromOrder(order) {
    // 優先使用 timestamp，若無則嘗試解析 time 字串
    if (order.timestamp) return new Date(order.timestamp);
    
    // 嘗試解析 "2025/12/8 00:45:11" 這種格式
    let d = new Date(order.time);
    if (!isNaN(d.getTime())) return d;
    
    // 如果解析失敗（可能是舊資料只有時間），回傳現在時間以免報錯
    return new Date(); 
}

function getBusinessDate(dateObj) {
    let d = new Date(dateObj);
    // 凌晨 5 點前算前一天
    if (d.getHours() < 5) d.setDate(d.getDate() - 1);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
}

function getItemCategoryType(itemName) {
    const barCats = ["調酒", "純飲", "shot", "啤酒", "咖啡", "飲料", "厚片", "甜點", "其他"];
    const bbqCats = ["燒烤", "主餐", "炸物"];
    for (const [cat, content] of Object.entries(menuData)) {
        if (Array.isArray(content)) {
            if (content.some(x => itemName.includes(x.name))) { if (barCats.includes(cat)) return 'bar'; if (bbqCats.includes(cat)) return 'bbq'; }
        } else {
            for (const subContent of Object.values(content)) {
                if (subContent.some(x => itemName.includes(x.name))) { if (barCats.includes(cat)) return 'bar'; if (bbqCats.includes(cat)) return 'bbq'; }
            }
        }
    }
    if(itemName.includes("雞") || itemName.includes("豬") || itemName.includes("牛") || itemName.includes("飯") || itemName.includes("麵")) return 'bbq';
    return 'bar'; 
}

function getCostByItemName(itemName) {
    let cleanName = itemName.replace(" (招待)", "").trim();
    if (itemCosts[cleanName] !== undefined) return itemCosts[cleanName];
    let baseName = cleanName.replace(/\s*[\(（].*?[\)）]$/, "").trim();
    if (itemCosts[baseName] !== undefined) return itemCosts[baseName];
    if (cleanName.includes("隱藏特調")) {
        if (itemCosts["隱藏特調"] !== undefined) return itemCosts["隱藏特調"];
    }
    return 0; 
}

// 🔥 Toast 提示函式
function showToast(message) {
    const toast = document.getElementById("toast-container");
    toast.innerText = message;
    toast.style.opacity = "1";
    setTimeout(() => { toast.style.opacity = "0"; }, 2500);
}

/* ========== 座位與點餐邏輯 ========== */
function renderTableGrid() { 
    let grid = document.getElementById("tableSelectGrid"); 
    grid.innerHTML = ""; 
    tables.forEach(t => { 
        let btn = document.createElement("div"); 
        btn.className = "tableBtn btn-effect"; 
        let status = tableStatuses[t]; 
        let hasCart = tableCarts[t] && tableCarts[t].length > 0; 
        if (status !== 'yellow' && tableTimers[t]) { delete tableTimers[t]; saveAllToCloud(); } 
        if (status === 'yellow' && !hasCart) { delete tableTimers[t]; delete tableStatuses[t]; delete tableCarts[t]; delete tableCustomers[t]; delete tableSplitCounters[t]; saveAllToCloud(); status = null; } 
        if (status === 'red') { btn.classList.add("status-red"); btn.innerHTML = `<b>${t}</b>`; } 
        else if (status === 'yellow') { btn.classList.add("status-yellow"); btn.innerHTML = `<b>${t}</b>`; } 
        else { btn.classList.add("status-white"); btn.innerHTML = `<b>${t}</b><br><span style="font-size:14px; color:#666;">(空桌)</span>`; } 
        btn.onclick = () => openOrderPage(t); 
        grid.appendChild(btn); 
    }); 
}

function openOrderPage(table) { 
    selectedTable = table; 
    document.getElementById("seatLabel").innerHTML = "（" + table + "）"; 
    hideAll(); 
    document.getElementById("orderPage").style.display = "block"; 
    if (tableTimers[table]) startSeatTimerDisplay(); 
    else { 
        document.getElementById("seatTimer").innerText = "⏳ 尚未計時"; 
        if(seatTimerInterval) clearInterval(seatTimerInterval); 
    } 
    cart = tableCarts[table] || []; 
    let info = tableCustomers[table] || {name:"", phone:""}; 
    if(custNameInput) custNameInput.value = info.name || ""; 
    if(custPhoneInput) custPhoneInput.value = info.phone || ""; 
    currentDiscount = { type: 'none', value: 0 }; 
    buildCategories(); 
    renderCart(); 
}

function startSeatTimerDisplay() { updateSeatTimerText(); seatTimerInterval = setInterval(updateSeatTimerText, 1000); }
function updateSeatTimerText() { 
    let startTime = tableTimers[selectedTable]; 
    if(!startTime) return; 
    let diff = Math.floor((Date.now() - startTime) / 1000); 
    let h = Math.floor(diff / 3600).toString().padStart(2,'0'); 
    let m = Math.floor((diff % 3600) / 60).toString().padStart(2,'0'); 
    let s = (diff % 60).toString().padStart(2,'0'); 
    document.getElementById("seatTimer").innerText = `⏳ 已入座：${h}:${m}:${s}`; 
}

/* ========== 菜單顯示與購物車 ========== */
function buildCategories() { 
    menuGrid.innerHTML = ""; 
    categories.forEach(c => { 
        let box = document.createElement("div"); 
        box.className = "categoryBtn btn-effect"; 
        box.innerText = c; 
        if (menuData[c]) box.onclick = () => openItems(c); 
        else box.style.opacity = "0.5"; 
        menuGrid.appendChild(box); 
    }); 
}

function openItems(category) {
    let data = menuData[category]; 
    let backBtn = `<button class="back-to-cat btn-effect" onclick="buildCategories()">⬅ 返回 ${category} 分類</button>`;
    const createItemHtml = (item, isFlat = false) => {
        let actionsHtml = ""; 
        let nameHtml = `<span>${item.name} <b>$${item.price}</b></span>`; 
        let itemClass = isFlat ? "item list-mode" : "item shot-item";
        if (item.name === "隱藏啤酒") { 
            nameHtml = `<span style="font-weight:bold; color:#007bff;">🍺 隱藏啤酒</span>`; 
            actionsHtml = `<input id="hbName" class="inline-input" placeholder="品名" style="width:100px;"><input type="number" id="hbPrice" class="inline-input" placeholder="時價" style="width:70px;"><button onclick="addInlineHiddenBeer()" style="background:#28a745;" class="btn-effect">加入</button>`; 
        } else if (item.name === "味繒鮭魚") { 
            nameHtml = `<span>味繒鮭魚 <b style="color:#d33;">(時價)</b></span>`; 
            actionsHtml = `<input type="number" id="salmonPrice" class="inline-input" placeholder="金額" style="width:80px;"><button onclick="addSalmonPrice()" style="background:#28a745;" class="btn-effect">加入</button>`; 
        } else if (item.name === "酥炸魷魚") { 
            nameHtml = `<span>酥炸魷魚 <b style="color:#d33;">(時價)</b></span>`; 
            actionsHtml = `<input type="number" id="squidPrice" class="inline-input" placeholder="金額" style="width:80px;"><button onclick="addFriedSquidPrice()" style="background:#28a745;" class="btn-effect">加入</button>`; 
        } else { 
            actionsHtml = `<button onclick='checkItemType("${item.name}", ${item.price}, "${category}")' class="btn-effect">加入</button>`; 
            if (category === "shot") { actionsHtml += `<button onclick='addShotSet("${item.name}", ${item.price})' class="set-btn btn-effect" style="margin-left:5px; background:#6f42c1;">🔥 一組</button>`; } 
        }
        return `<div class="${itemClass}">${nameHtml}<div class="shot-actions">${actionsHtml}</div></div>`;
    };
    const flatListCategories = ["純飲", "shot", "啤酒", "咖啡", "飲料", "主餐", "炸物", "厚片", "甜點", "其他"];
    if (flatListCategories.includes(category)) { 
        let html = backBtn; 
        if (Array.isArray(data)) { html += `<div class="sub-cat-title">${category}</div>`; data.forEach(item => { html += createItemHtml(item, true); }); } 
        else { Object.keys(data).forEach((subCat) => { let items = data[subCat]; html += `<div class="sub-cat-title">${subCat}</div>`; items.forEach(item => { html += createItemHtml(item, true); }); }); } 
        html += backBtn; menuGrid.innerHTML = html; return; 
    }
    if (!Array.isArray(data)) { 
        let html = backBtn; 
        Object.keys(data).forEach((subCat, index) => { 
            let items = data[subCat]; let accId = `acc-${index}`; 
            html += `<button class="accordion-header btn-effect" onclick="toggleAccordion('${accId}')">${subCat} <span class="arrow">▼</span></button><div id="${accId}" class="accordion-content">`; 
            items.forEach(item => { html += createItemHtml(item, false); }); 
            html += `</div>`; 
        }); 
        html += backBtn; menuGrid.innerHTML = html; return; 
    }
}

function addToCart(name, price) { cart.push({ name, price, isNew: true, isTreat: false }); renderCart(); }
function toggleTreat(index) { cart[index].isTreat = !cart[index].isTreat; renderCart(); }

/* ========== renderCart (支援合併檢視) ========== */
function toggleCartView() {
    isCartSimpleMode = !isCartSimpleMode;
    renderCart();
}

function renderCart() { 
    cartList.innerHTML = ""; 
    currentOriginalTotal = 0; 
    
    // 依據模式決定顯示資料
    let displayItems = isCartSimpleMode ? getMergedItems(cart) : cart.map(item => ({ ...item, count: 1 }));

    displayItems.forEach((c, i) => { 
        let count = c.count || 1;
        let itemTotal = (c.isTreat ? 0 : c.price) * count;
        currentOriginalTotal += itemTotal;
        
        let treatClass = c.isTreat ? "treat-btn active btn-effect" : "treat-btn btn-effect";
        let treatText = c.isTreat ? "已招待" : "🎁 招待";
        
        let priceHtml = "";
        let nameHtml = "";

        if (isCartSimpleMode && count > 1) {
             nameHtml = `<div class="cart-item-name">${c.name} <span style="color:#d33; font-weight:bold;">x${count}</span></div>`;
             if(c.isTreat) {
                 priceHtml = `<span style='text-decoration:line-through; color:#999;'>$${c.price * count}</span> <span style='color:#28a745; font-weight:bold;'>$0</span>`;
             } else {
                 priceHtml = `$${itemTotal}`;
             }
        } else {
            nameHtml = `<div class="cart-item-name">${c.name}</div>`;
            if (c.isTreat) {
                 priceHtml = `<span style='text-decoration:line-through; color:#999;'>$${c.price}</span> <span style='color:#28a745; font-weight:bold;'>$0</span>`;
             } else {
                 priceHtml = `$${c.price}`;
             }
        }

        let actionButtons = "";
        if (!isCartSimpleMode) {
             actionButtons = `<button class="${treatClass}" onclick="toggleTreat(${i})">${treatText}</button><button class="del-btn btn-effect" onclick="removeItem(${i})">刪除</button>`;
        } else {
             actionButtons = `<small style="color:#888;">(切換檢視操作)</small>`;
        }

        cartList.innerHTML += `<div class="cart-item-row">${nameHtml}<div class="cart-item-price">${priceHtml}</div><div style="display:flex; gap:5px; justify-content:flex-end;">${actionButtons}</div></div>`; 
    }); 

    let discountedTotal = currentOriginalTotal; 
    if (currentDiscount.type === 'percent') { 
        discountedTotal = Math.round(currentOriginalTotal * (currentDiscount.value / 100)); 
        totalText.innerHTML = `總金額：<span style="text-decoration:line-through; color:#999; font-size:16px;">$${currentOriginalTotal}</span> <span style="color:#d33;">$${discountedTotal}</span> <small>(折扣 ${currentDiscount.value}%)</small>`; 
    } else if (currentDiscount.type === 'amount') {
        discountedTotal = currentOriginalTotal - currentDiscount.value;
        if(discountedTotal < 0) discountedTotal = 0;
        totalText.innerHTML = `總金額：<span style="text-decoration:line-through; color:#999; font-size:16px;">$${currentOriginalTotal}</span> <span style="color:#d33;">$${discountedTotal}</span> <small>(折讓 -${currentDiscount.value})</small>`;
    } else { 
        totalText.innerText = "總金額：" + currentOriginalTotal + " 元"; 
    } 
}
function removeItem(index) { cart.splice(index, 1); renderCart(); }

/* ========== 客製化與特殊商品邏輯 ========== */
function addInlineHiddenBeer() { let name = document.getElementById("hbName").value.trim(); let price = parseInt(document.getElementById("hbPrice").value); if(!name) name = "隱藏啤酒"; if(isNaN(price) || price < 0) { alert("請輸入正確價格"); return; } addToCart(name, price); }
function addSalmonPrice() { let price = parseInt(document.getElementById("salmonPrice").value); if(isNaN(price) || price <= 0) { alert("請輸入金額！"); return; } addToCart("味繒鮭魚", price); }
function addFriedSquidPrice() { let price = parseInt(document.getElementById("squidPrice").value); if(isNaN(price) || price <= 0) { alert("請輸入金額！"); return; } addToCart("酥炸魷魚", price); }
function checkItemType(name, price, categoryName) { 
    if (name === "隱藏特調") { openCustomModal(name, price); return; } 
    let realPrice = itemPrices[name] !== undefined ? itemPrices[name] : price; 
    if (name === "隱藏啤酒" || name === "味繒鮭魚" || name === "酥炸魷魚") { addToCart(name, realPrice); return; } 
    if (categoryName === "咖啡") { openDrinkModal(name, realPrice, "coffee"); return; } 
    if (categoryName === "飲料") { if (name.includes("茶")) openDrinkModal(name, realPrice, "tea"); else openDrinkModal(name, realPrice, "drink"); return; } 
    if (categoryName === "主餐") { if (name === "炒飯") { openFoodModal(name, realPrice, "friedRice"); return; } if (name === "日式炒烏龍麵" || name === "親子丼") { openFoodModal(name, realPrice, "meatOnly"); return; } } 
    addToCart(name, realPrice); 
}

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
function addShotSet(name, price) { addToCart(`${name} <small style='color:#28a745'>[買5送1]</small>`, price * 5); }

function openCustomModal(name, price) { tempCustomItem = { name, price }; document.querySelectorAll('input[name="flavor"]')[0].checked = true; document.querySelectorAll('input[name="taste"]')[0].checked = true; let alcoholSec = document.getElementById("modalAlcoholSection"); let noteSec = document.getElementById("modalNoteSection"); let title = document.getElementById("customTitle"); if (price === 280) { title.innerText = "隱藏特調(酒精)"; alcoholSec.style.display = "block"; noteSec.style.display = "none"; isExtraShot = false; document.getElementById("extraShotBtn").classList.remove("active"); document.getElementById("alcoholRange").value = 0; document.getElementById("alcoholVal").innerText = "0"; } else if (price === 300) { title.innerText = "隱藏特調(無酒精)"; alcoholSec.style.display = "none"; noteSec.style.display = "block"; document.getElementById("customNote").value = ""; } customModal.style.display = "flex"; }
function toggleExtraShot() { isExtraShot = !isExtraShot; document.getElementById("extraShotBtn").classList.toggle("active"); }
function closeCustomModal() { customModal.style.display = "none"; tempCustomItem = null; }
function confirmCustomItem() { try { if (!tempCustomItem) return; let flavor = document.querySelector('input[name="flavor"]:checked').value; let taste = document.querySelector('input[name="taste"]:checked').value; let extraStr = ""; let finalPrice = tempCustomItem.price; if (tempCustomItem.price === 280) { let alcohol = document.getElementById("alcoholRange").value; if(isExtraShot) { finalPrice += 40; extraStr += "<br><b style='color:#d33;'>🔥 濃度升級 (+$40)</b>"; } extraStr += `<br><small style='color:#666'>(${flavor} / ${taste} / 濃度+${alcohol}%)</small>`; } else { let note = document.getElementById("customNote").value.trim(); if(note) extraStr += `<br><span style='color:#007bff; font-size:14px;'>📝 ${note}</span>`; extraStr += `<br><small style='color:#666'>(${flavor} / ${taste})</small>`; } addToCart(`${tempCustomItem.name} ${extraStr}`, finalPrice); closeCustomModal(); } catch (e) { alert("加入特調失敗: " + e.message); } }

function saveAndExit() {
    try {
        if (!Array.isArray(cart)) cart = [];
        let hasUnsentItems = cart.some(item => item.isNew === true);
        if (hasUnsentItems) {
            let confirmLeave = confirm("⚠️ 購物車內有未送出的商品，確定要離開嗎？\n(離開後，這些未送出的商品將被清空)");
            if (!confirmLeave) return; 
        }
        cart = [];
        currentDiscount = { type: 'none', value: 0 }; 
        tempCustomItem = null;
        openTableSelect();
    } catch (e) {
        console.error("返回錯誤:", e);
        openTableSelect();
    }
}

// 🔥🔥 修正後的 saveOrderManual (正確產生每日單號) 🔥🔥
function saveOrderManual() { 
    try { 
        if (cart.length === 0) { showToast("購物車是空的，訂單未成立。"); saveAndExit(); return; } 
        if (!tableCustomers[selectedTable]) tableCustomers[selectedTable] = {}; 
        
        if (!tableTimers[selectedTable] || !tableCustomers[selectedTable].orderId) { 
            tableTimers[selectedTable] = Date.now(); 
            tableSplitCounters[selectedTable] = 1; 
            
            // 🔥 計算今日訂單數 + 1
            let currentBizDate = getBusinessDate(new Date());
            let todayCount = historyOrders.filter(o => getBusinessDate(getDateFromOrder(o)) === currentBizDate).length;
            tableCustomers[selectedTable].orderId = todayCount + 1; 
        } 
        
        let newItemsToPrint = cart.filter(item => item.isNew === true); 
        if (newItemsToPrint.length > 0) { 
            printReceipt({ seq: tableCustomers[selectedTable].orderId, table: selectedTable, time: new Date().toLocaleString('zh-TW', { hour12: false }), items: newItemsToPrint, original: 0, total: 0 }, true); 
            cart.forEach(item => delete item.isNew); 
        } else { 
            tableCarts[selectedTable] = cart; 
            tableStatuses[selectedTable] = 'yellow'; 
            tableCustomers[selectedTable].name = custNameInput.value; 
            tableCustomers[selectedTable].phone = custPhoneInput.value; 
            saveAllToCloud(); 
            showToast("✅ 暫存成功 (無新商品需列印)"); 
            openTableSelect(); 
            return; 
        } 
        tableCarts[selectedTable] = cart; 
        tableStatuses[selectedTable] = 'yellow'; 
        tableCustomers[selectedTable].name = custNameInput.value; 
        tableCustomers[selectedTable].phone = custPhoneInput.value; 
        saveAllToCloud(); 
        showToast(`✔ 訂單已送出 (單號 #${tableCustomers[selectedTable].orderId})！`); 
        openTableSelect(); 
    } catch (e) { alert("出單發生錯誤: " + e.message); } 
}

/* ========== Promise 列印 (防阻擋) ========== */
async function printReceipt(data, isTicket = false) {
    let kitchenCategories = ["燒烤", "主餐", "炸物", "厚片"];
    let barItems = [];
    let kitchenItems = [];

    data.items.forEach(i => {
        let itemCat = "";
        for (const [cat, content] of Object.entries(menuData)) {
            if (Array.isArray(content)) {
                if (content.some(x => i.name.includes(x.name))) itemCat = cat;
            } else {
                for (const subContent of Object.values(content)) {
                    if (subContent.some(x => i.name.includes(x.name))) itemCat = cat;
                }
            }
        }
        if(itemCat === "") {
             if(i.name.includes("雞") || i.name.includes("豬") || i.name.includes("牛") || i.name.includes("飯") || i.name.includes("麵")) itemCat = "主餐";
        }
        if (kitchenCategories.includes(itemCat)) kitchenItems.push(i);
        else barItems.push(i);
    });

    const printArea = document.getElementById("receipt-print-area");

    const generateHtml = (title, items, isFullReceipt) => {
        let itemsHtml = "";
        items.forEach(i => {
            let displayName = i.name;
            if (i.isTreat) displayName += " (招待)";
            let priceStr = isFullReceipt ? (i.isTreat ? "$0" : `$${i.price}`) : "";
            let itemClass = isFullReceipt ? "receipt-item" : "receipt-item kitchen-item";
            itemsHtml += `<div class="${itemClass}"><span>${displayName}</span><span>${priceStr}</span></div>`;
        });
        let footerHtml = "";
        if (isFullReceipt) {
            footerHtml = `<div class="receipt-footer"><div class="row"><span>原價：</span><span>$${data.original}</span></div><div class="row"><span>總計：</span><span class="total">$${data.total}</span></div></div>`;
        }
        return `<div class="receipt-section"><div class="receipt-header"><h2 class="store-name">${title}</h2><div class="receipt-info"><p>單號：${data.seq}</p><p>桌號：${data.table}</p><p>時間：${data.time}</p></div></div><hr class="dashed-line"><div class="receipt-items">${itemsHtml}</div><hr class="dashed-line">${footerHtml}</div>`;
    };

    const performPrint = (htmlContent) => {
        return new Promise((resolve) => {
            printArea.innerHTML = htmlContent;
            setTimeout(() => {
                window.print();
                setTimeout(resolve, 500);
            }, 500);
        });
    };

    if (!isTicket) {
        await performPrint(generateHtml("結帳收據", data.items, true));
    } else {
        let hasBar = barItems.length > 0;
        let hasKitchen = kitchenItems.length > 0;
        if (hasBar) await performPrint(generateHtml("吧檯工作單", barItems, false));
        if (hasKitchen) await performPrint(generateHtml("廚房工作單", kitchenItems, false));
    }
}

function openReprintModal() {
    if (cart.length === 0) { alert("購物車是空的"); return; }
    const list = document.getElementById('reprintList');
    list.innerHTML = '';
    cart.forEach((item, index) => {
        list.innerHTML += `<label class="checkout-item" style="justify-content: flex-start; gap: 10px;"><input type="checkbox" class="reprint-checkbox" id="reprint-item-${index}" checked><span>${item.name}</span></label>`;
    });
    list.innerHTML = `<label class="checkout-item" style="background:#f0f7ff; border-color:#007bff; font-weight:bold;"><input type="checkbox" id="selectAllReprint" checked onchange="toggleAllReprint(this)"><span>全選 / 取消全選</span></label><hr style="margin: 5px 0;">` + list.innerHTML;
    reprintSelectionModal.style.display = "flex";
}

function toggleAllReprint(source) { let checkboxes = document.querySelectorAll('.reprint-checkbox'); checkboxes.forEach(cb => cb.checked = source.checked); }
function closeReprintModal() { reprintSelectionModal.style.display = "none"; }

function confirmReprintSelection() {
    try {
        let selectedItems = [];
        cart.forEach((item, index) => {
            let cb = document.getElementById(`reprint-item-${index}`);
            if (cb && cb.checked) selectedItems.push(item);
        });
        if (selectedItems.length === 0) { alert("請至少選擇一個項目"); return; }
        let seqNum = "補";
        if (tableCustomers[selectedTable] && tableCustomers[selectedTable].orderId) seqNum = tableCustomers[selectedTable].orderId;
        printReceipt({ seq: seqNum, table: selectedTable, time: new Date().toLocaleString('zh-TW', { hour12: false }), items: selectedItems, original: 0, total: 0 }, true); 
        closeReprintModal();
    } catch (e) { alert("補單發生錯誤: " + e.message); }
}

/* ========== 結帳與其他 ========== */
function checkoutAll(manualFinal) { 
    let payingTotal = (manualFinal !== undefined) ? manualFinal : finalTotal; 
    let time = new Date().toLocaleString('zh-TW', { hour12: false }); 
    let originalTotal = currentOriginalTotal; 
    let info = tableCustomers[selectedTable] || { name:"", phone:"", orderId: "?" }; 
    
    // 🔥 修改這裡：計算今日正確單號
    let currentBizDate = getBusinessDate(new Date());
    let todayOrders = historyOrders.filter(o => getBusinessDate(getDateFromOrder(o)) === currentBizDate);
    
    if(!info.orderId || info.orderId === "?" || info.orderId === "T") { 
        info.orderId = todayOrders.length + 1; 
    } 

    if (originalTotal > 0 || payingTotal > 0) { 
        let splitNum = tableSplitCounters[selectedTable]; 
        let displaySeq = info.orderId; 
        let displaySeat = selectedTable; 
        if(splitNum && splitNum > 1) { 
            displaySeq = `${info.orderId}-${splitNum}`; 
            displaySeat = `${selectedTable} (拆單)`; 
        } 
        let processedItems = cart.map(item => { if (item.isTreat) { return { ...item, price: 0, name: item.name + " (招待)" }; } return item; }); 
        let newOrder = { seat: displaySeat, formattedSeq: displaySeq, time: time, timestamp: Date.now(), items: processedItems, total: payingTotal, originalTotal: originalTotal, customerName: info.name, customerPhone: info.phone, isClosed: false }; 
        if(!Array.isArray(historyOrders)) historyOrders = []; 
        historyOrders.push(newOrder); 
        localStorage.setItem("orderHistory", JSON.stringify(historyOrders)); 
    } 
    delete tableCarts[selectedTable]; delete tableTimers[selectedTable]; delete tableStatuses[selectedTable]; delete tableCustomers[selectedTable]; delete tableSplitCounters[selectedTable]; saveAllToCloud(); cart = []; currentDiscount = { type: 'none', value: 0 }; alert(`💰 結帳完成！實收 $${payingTotal} \n(如需明細，請至「今日訂單」補印)`); openTableSelect(); 
}

function confirmPayment() { 
    if (tempRightList.length === 0) { alert("右側沒有商品，無法結帳！"); return; } 
    let time = new Date().toLocaleString('zh-TW', { hour12: false }); 
    let total = calcSplitTotal(); 
    let info = tableCustomers[selectedTable] || { name:"", phone:"", orderId: "?" }; 
    
    // 🔥 修改這裡：同樣加入單號計算邏輯
    if(!info.orderId || info.orderId === "?" || info.orderId === "T") { 
        let currentBizDate = getBusinessDate(new Date());
        let todayCount = historyOrders.filter(o => getBusinessDate(getDateFromOrder(o)) === currentBizDate).length;
        info.orderId = todayCount + 1; 
        
        if (!tableCustomers[selectedTable]) tableCustomers[selectedTable] = {}; 
        tableCustomers[selectedTable].orderId = info.orderId; 
    }

    let currentSplit = tableSplitCounters[selectedTable] || 1; 
    let displaySeq = `${info.orderId}-${currentSplit}`; 
    let displaySeat = `${selectedTable} (拆單)`; 
    tableSplitCounters[selectedTable] = currentSplit + 1; 
    let processedItems = tempRightList.map(item => { if (item.isTreat) { return { ...item, price: 0, name: item.name + " (招待)" }; } return item; }); 
    let newOrder = { seat: displaySeat, formattedSeq: displaySeq, time: time, timestamp: Date.now(), items: processedItems, total: total, customerName: info.name, customerPhone: info.phone, isClosed: false }; 
    if(!Array.isArray(historyOrders)) historyOrders = []; 
    historyOrders.push(newOrder); 
    localStorage.setItem("orderHistory", JSON.stringify(historyOrders)); 
    if (tempLeftList.length === 0) { delete tableCarts[selectedTable]; delete tableTimers[selectedTable]; delete tableStatuses[selectedTable]; delete tableCustomers[selectedTable]; delete tableSplitCounters[selectedTable]; cart = []; alert(`💰 ${selectedTable} 全部結帳完成！`); openTableSelect(); } else { tableCarts[selectedTable] = tempLeftList; cart = tempLeftList; alert(`💰 單號 ${displaySeq} 結帳完成！`); renderCart(); } saveAllToCloud(); closeCheckoutModal(); 
}

function openDiscountModal() { discountModal.style.display = "flex"; }
function closeDiscountModal() { discountModal.style.display = "none"; }
function confirmDiscount() { let val = parseFloat(document.getElementById("discInput").value); if (isNaN(val) || val <= 0 || val > 100) { alert("請輸入正確折數 (1-100)"); return; } currentDiscount = { type: 'percent', value: val }; renderCart(); closeDiscountModal(); }
function openAllowanceModal() { allowanceModal.style.display = "flex"; }
function closeAllowanceModal() { allowanceModal.style.display = "none"; }
function confirmAllowance() { let val = parseInt(document.getElementById("allowInput").value); if (isNaN(val) || val < 0) { alert("請輸入正確金額"); return; } currentDiscount = { type: 'amount', value: val }; renderCart(); closeAllowanceModal(); }
function openPaymentModal() { if (cart.length === 0) { if(!confirm("購物車是空的，確定要直接清桌嗎？")) return; checkoutAll(0); return; } document.getElementById("payOriginal").innerText = "$" + discountedTotal; if(currentDiscount.type === 'percent') { document.getElementById("payDiscLabel").innerText = `(已打 ${currentDiscount.value} 折)`; } else { document.getElementById("payDiscLabel").innerText = ""; } document.getElementById("payAllowance").value = ""; document.getElementById("payFinal").value = discountedTotal; finalTotal = discountedTotal; paymentModal.style.display = "flex"; }
function calcFinalPay() { let allowance = parseInt(document.getElementById("payAllowance").value) || 0; finalTotal = discountedTotal - allowance; if(finalTotal < 0) finalTotal = 0; document.getElementById("payFinal").value = finalTotal; }
function closePaymentModal() { paymentModal.style.display = "none"; }
function confirmCheckout() { let finalAmount = parseInt(document.getElementById("payFinal").value); if(isNaN(finalAmount) || finalAmount < 0) { alert("金額錯誤！"); return; } checkoutAll(finalAmount); closePaymentModal(); }
function openSplitCheckout() { if (cart.length === 0) { alert("購物車是空的，無法拆單！"); return; } tempLeftList = [...cart]; tempRightList = []; if(document.getElementById("splitDisc")) document.getElementById("splitDisc").value = ""; if(document.getElementById("splitAllow")) document.getElementById("splitAllow").value = ""; renderCheckoutLists(); checkoutModal.style.display = "flex"; }
function renderCheckoutLists() { let leftHTML = ""; let rightHTML = ""; let rightTotal = 0; if(tempLeftList.length === 0) leftHTML = "<div class='empty-hint'>已無剩餘項目</div>"; else tempLeftList.forEach((item, index) => { leftHTML += `<div class="checkout-item" onclick="moveToPay(${index})"><span>${item.name}</span><span>$${item.price}</span></div>`; }); if(tempRightList.length === 0) rightHTML = "<div class='empty-hint'>點擊左側加入</div>"; else tempRightList.forEach((item, index) => { rightHTML += `<div class="checkout-item" onclick="removeFromPay(${index})"><span>${item.name}</span><span>$${item.price}</span></div>`; }); document.getElementById("unpaidList").innerHTML = leftHTML; document.getElementById("payingList").innerHTML = rightHTML; calcSplitTotal(); }
function calcSplitTotal() { let baseTotal = tempRightList.reduce((a, b) => a + b.price, 0); let disc = parseFloat(document.getElementById("splitDisc").value); let allow = parseInt(document.getElementById("splitAllow").value); let finalSplit = baseTotal; if (!isNaN(disc) && disc > 0 && disc <= 100) { finalSplit = Math.round(baseTotal * (disc / 100)); } if (!isNaN(allow) && allow > 0) { finalSplit = finalSplit - allow; } if(finalSplit < 0) finalSplit = 0; document.getElementById("payTotal").innerText = "$" + finalSplit; return finalSplit; }
function moveToPay(index) { let item = tempLeftList.splice(index, 1)[0]; tempRightList.push(item); renderCheckoutLists(); }
function removeFromPay(index) { let item = tempRightList.splice(index, 1)[0]; tempLeftList.push(item); renderCheckoutLists(); }
function closeCheckoutModal() { checkoutModal.style.display = "none"; }
function updateDiscPreview() { let val = parseFloat(document.getElementById("discInput").value); if (isNaN(val) || val <= 0 || val > 100) { document.getElementById("discPreviewText").innerText = ""; return; } let discounted = Math.round(currentOriginalTotal * (val / 100)); document.getElementById("discPreviewText").innerText = `原價 $${currentOriginalTotal} ➡ 折後 $${discounted}`; }

/* ========== 機密與權限頁面邏輯 ========== */
function openOwnerLogin(mode) { sessionStorage.setItem('ownerMode', mode); if(ownerLoginModal) ownerLoginModal.style.display = "flex"; }
function closeOwnerModal() { ownerLoginModal.style.display = "none"; }
function checkOwner(name) { let password = prompt(`請輸入 ${name} 的密碼：`); if (password === OWNER_PASSWORDS[name]) { closeOwnerModal(); openConfidentialPage(name); } else { alert("❌ 密碼錯誤！"); } }
function openConfidentialPage(ownerName) { hideAll(); document.getElementById("confidentialPage").style.display = "block"; document.getElementById("ownerWelcome").innerText = ownerName; document.getElementById("financeDashboard").style.display = "none"; let currentLoginMode = sessionStorage.getItem('ownerMode') || 'finance'; if (currentLoginMode === 'cost') { document.getElementById("costInputSection").style.display = "block"; document.getElementById("financeCalendarSection").style.display = "none"; document.getElementById("confidentialTitle").innerText = "成本輸入"; updateFinancialPage(ownerName); } else { document.getElementById("costInputSection").style.display = "none"; document.getElementById("financeCalendarSection").style.display = "block"; document.getElementById("confidentialTitle").innerText = "財務報表"; renderFinanceCalendar(ownerName); } }
function updateFinancialPage(ownerName) { const listContainer = document.getElementById("costEditorList"); listContainer.innerHTML = ""; let targetCategories = []; let canEdit = true; const barCats = ["調酒", "純飲", "shot", "啤酒", "咖啡", "飲料", "厚片", "甜點"]; const bbqCats = ["燒烤", "主餐", "炸物"]; if (ownerName === "小飛") { targetCategories = barCats; } else if (ownerName === "威志") { targetCategories = bbqCats; } else { targetCategories = [...barCats, ...bbqCats, "其他"]; } targetCategories.forEach(cat => { if (!menuData[cat]) return; let catHeader = document.createElement("div"); catHeader.className = "sub-cat-title"; catHeader.style.marginTop = "15px"; catHeader.innerText = cat; listContainer.appendChild(catHeader); let items = []; let data = menuData[cat]; if (Array.isArray(data)) { items = data; } else { Object.values(data).forEach(subList => { items = items.concat(subList); }); } items.forEach(item => { let currentPrice = itemPrices[item.name] !== undefined ? itemPrices[item.name] : item.price; let currentCost = itemCosts[item.name] !== undefined ? itemCosts[item.name] : 0; let row = document.createElement("div"); row.className = "cost-row"; row.innerHTML = `<span>${item.name}</span><input type="number" value="${currentPrice}" placeholder="售價" onchange="updateItemData('${item.name}', 'price', this.value)"><input type="number" value="${currentCost}" placeholder="成本" onchange="updateItemData('${item.name}', 'cost', this.value)">`; listContainer.appendChild(row); }); }); }

function openFinanceDetailModal(dateKey, stats) {
    document.getElementById("fdTitle").innerText = `📅 ${dateKey} 財務明細`;
    document.getElementById("fdBarRev").innerText = `$${stats.barRev}`;
    document.getElementById("fdBarCost").innerText = `-$${stats.barCost}`;
    document.getElementById("fdBarProfit").innerText = `$${stats.barRev - stats.barCost}`;
    document.getElementById("fdBbqRev").innerText = `$${stats.bbqRev}`;
    document.getElementById("fdBbqCost").innerText = `-$${stats.bbqCost}`;
    document.getElementById("fdBbqProfit").innerText = `$${stats.bbqRev - stats.bbqCost}`;
    let totalRev = stats.barRev + stats.bbqRev;
    let totalCost = stats.barCost + stats.bbqCost;
    document.getElementById("fdTotalRev").innerText = `$${totalRev}`;
    document.getElementById("fdTotalCost").innerText = `-$${totalCost}`;
    document.getElementById("fdTotalProfit").innerText = `$${totalRev - totalCost}`;
    let currentUser = document.getElementById("ownerWelcome").innerText;
    document.querySelector('.bar-style').style.display = (currentUser === '小飛' || currentUser === '景偉') ? 'block' : 'none';
    document.querySelector('.bbq-style').style.display = (currentUser === '威志' || currentUser === '景偉') ? 'block' : 'none';
    document.querySelector('.total-style').style.display = (currentUser === '景偉') ? 'block' : 'none';
    financeDetailModal.style.display = "flex";
}
function closeFinanceDetailModal() { financeDetailModal.style.display = "none"; }

function renderFinanceCalendar(ownerName) {
    let now = new Date(); if (now.getHours() < 5) now.setDate(now.getDate() - 1); let year = now.getFullYear(); let month = now.getMonth(); 
    document.getElementById("finCalendarTitle").innerText = `${year}年 ${month + 1}月 財務概況`; 
    dailyFinancialData = {}; 
    historyOrders.forEach(order => { 
        let t = getDateFromOrder(order); 
        if (t.getHours() < 5) t.setDate(t.getDate() - 1); 
        if (t.getFullYear() === year && t.getMonth() === month) { 
            let dayKey = t.getDate(); 
            let dateStr = `${year}/${month+1}/${dayKey}`;
            if (!dailyFinancialData[dateStr]) dailyFinancialData[dateStr] = { barRev:0, barCost:0, bbqRev:0, bbqCost:0 }; 
            order.items.forEach(item => { 
                let costPerItem = getCostByItemName(item.name);
                let rawName = item.name.replace(" (招待)", "").trim(); 
                let type = getItemCategoryType(rawName); 
                if (type === 'bar') { 
                    dailyFinancialData[dateStr].barRev += item.price; 
                    dailyFinancialData[dateStr].barCost += costPerItem; 
                } else { 
                    dailyFinancialData[dateStr].bbqRev += item.price; 
                    dailyFinancialData[dateStr].bbqCost += costPerItem; 
                } 
            }); 
        } 
    }); 
    let firstDay = new Date(year, month, 1).getDay(); let daysInMonth = new Date(year, month + 1, 0).getDate(); let grid = document.getElementById("finCalendarGrid"); grid.innerHTML = ""; for (let i = 0; i < firstDay; i++) { let empty = document.createElement("div"); empty.className = "calendar-day empty"; grid.appendChild(empty); } 
    let today = new Date(); if(today.getHours() < 5) today.setDate(today.getDate() - 1); 
    for (let d = 1; d <= daysInMonth; d++) { 
        let cell = document.createElement("div"); 
        cell.className = "calendar-day"; 
        if (d === today.getDate() && month === today.getMonth()) cell.classList.add("today"); 
        let dateStr = `${year}/${month+1}/${d}`;
        let stats = dailyFinancialData[dateStr] || { barRev:0, barCost:0, bbqRev:0, bbqCost:0 }; 
        let showRev = 0, showCost = 0; 
        if (ownerName === "小飛") { showRev = stats.barRev; showCost = stats.barCost; } 
        else if (ownerName === "威志") { showRev = stats.bbqRev; showCost = stats.bbqCost; } 
        else { showRev = stats.barRev + stats.bbqRev; showCost = stats.barCost + stats.bbqCost; } 
        let profit = showRev - showCost; 
        let htmlContent = `<div class="day-num">${d}</div>`; 
        if (showRev > 0 || showCost > 0) { 
            htmlContent += `<div class="fin-line"><span>營收:</span> <span class="fin-rev">$${showRev}</span></div><div class="fin-line"><span>成本:</span> <span class="fin-cost">-$${showCost}</span></div><div class="fin-line"><span>利潤:</span> <span class="fin-profit">+$${profit}</span></div>`; 
            cell.onclick = () => openFinanceDetailModal(dateStr, stats);
        } 
        cell.innerHTML = htmlContent; grid.appendChild(cell); 
    } 
}
function updateItemData(name, type, value) { let val = parseInt(value); if(isNaN(val)) val = 0; if (type === 'cost') itemCosts[name] = val; else if (type === 'price') itemPrices[name] = val; saveAllToCloud(); }

/* ========== 🔥🔥🔥 歷史記錄 (查詢+檢視+日曆) 🔥🔥🔥 ========== */
function getVisibleOrders() { return historyOrders.filter(o => !o.isClosed).reverse(); }

function toggleHistoryView() {
    isHistorySimpleMode = !isHistorySimpleMode;
    showHistory();
}

function showHistory() { 
    // 1. 抓取目前有哪些訂單是「展開」的
    let currentlyOpenIds = [];
    const openDetails = document.querySelectorAll('.history-detail');
    openDetails.forEach(el => {
        if (el.style.display === 'block') {
            currentlyOpenIds.push(el.id);
        }
    });

    historyBox.innerHTML = ""; 
    
    if(!historyOrders || historyOrders.length === 0) { 
        historyBox.innerHTML = "<div style='padding:20px;color:#888;'>今日尚無訂單</div>"; 
        return; 
    } 
    
    // 2. 按鈕 UI
    let btnIcon = isHistorySimpleMode ? "📝" : "🔢";
    let btnText = isHistorySimpleMode ? "切換為詳細清單" : "切換為簡化清單 (合併數量)";
    
    historyBox.innerHTML += `
        <div class="view-toggle-container">
            <button onclick="toggleHistoryView()" class="view-toggle-btn btn-effect">
                <span class="icon">${btnIcon}</span>
                <span>${btnText}</span>
            </button>
        </div>`;

    let orders = getVisibleOrders(); 
    if (orders.length === 0) { 
        historyBox.innerHTML += "<div style='padding:20px;color:#888;'>今日尚無訂單 (或已日結)</div>"; 
        return; 
    } 

    orders.forEach((o, index) => { 
        let seqDisplay = o.formattedSeq ? `#${o.formattedSeq}` : `#${orders.length - index}`; 
        let custInfo = (o.customerName || o.customerPhone) ? `<span style="color:#007bff; font-weight:bold;">${o.customerName||""}</span> ${o.customerPhone||""}` : "<span style='color:#ccc'>-</span>"; 
        
        let itemsToDisplay = isHistorySimpleMode ? getMergedItems(o.items) : o.items;

        let itemsDetail = itemsToDisplay.map(i => {
            let countStr = (i.count && i.count > 1) ? ` <b style="color:#d33;">x${i.count}</b>` : "";
            let priceStr = (i.count && i.count > 1) ? `$${i.price * i.count}` : `$${i.price}`;
            if(i.isTreat) {
                 return `<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px dotted #eee;"><span>${i.name} (招待)${countStr}</span> <span>$0</span></div>`;
            }
            return `<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px dotted #eee;"><span>${i.name}${countStr}</span> <span>${priceStr}</span></div>`;
        }).join("");

        let timeOnly = o.time.split(" ")[1] || o.time; 
        let rowId = `detail-${index}`; 
        
        // 3. 回復展開狀態
        let displayStyle = currentlyOpenIds.includes(rowId) ? "block" : "none";

        let amountDisplay = `$${o.total}`; 
        if (o.originalTotal && o.originalTotal !== o.total) { 
            amountDisplay = `<span style="text-decoration:line-through; color:#999; font-size:12px;">$${o.originalTotal}</span> <br> <span style="color:#d33;">$${o.total}</span>`; 
        } 
        
        historyBox.innerHTML += `
            <div class="history-row btn-effect" onclick="window.toggleDetail('${rowId}')" style="cursor:pointer;">
                <span class="seq" style="font-weight:bold; color:#007bff;">${seqDisplay}</span>
                <span class="seat">${o.seat}</span>
                <span class="cust">${custInfo}</span>
                <span class="time">${timeOnly}</span>
                <span class="amt">${amountDisplay}</span>
            </div>
            <div id="${rowId}" class="history-detail" style="display:${displayStyle};">
                <div style="background:#f9f9f9; padding:15px; border-radius:0 0 8px 8px; border:1px solid #eee; border-top:none;">
                    <b>📅 完整時間：</b>${o.time}<br>
                    <b>🧾 內容：</b><br>
                    ${itemsDetail}
                    <div style="text-align:right; margin-top:10px; font-size:18px; font-weight:bold; color:#d33;">總計：$${o.total}</div>
                    <div style="text-align:right; margin-top:15px; border-top:1px solid #ddd; padding-top:10px; display:flex; justify-content:flex-end; gap:10px;">
                        <button onclick="reprintOrder(${index})" class="print-btn btn-effect">🖨 列印明細</button>
                        <button onclick="deleteSingleOrder(${index})" class="delete-single-btn btn-effect">🗑 刪除此筆訂單</button>
                    </div>
                </div>
            </div>`; 
    }); 
}

function deleteSingleOrder(displayIndex) { try { let visibleList = getVisibleOrders(); let targetOrder = visibleList[displayIndex]; if (!targetOrder) { alert("❌ 錯誤：找不到該筆訂單資料，請重新整理網頁。"); return; } if(!confirm(`⚠️ 確定要刪除這筆訂單嗎？\n(單號: ${targetOrder.formattedSeq || targetOrder.seq})`)) return; let realIndex = historyOrders.indexOf(targetOrder); if (realIndex > -1) { historyOrders.splice(realIndex, 1); saveAllToCloud(); showHistory(); showToast("✅ 訂單已成功刪除"); } else { alert("❌ 系統錯誤：無法在原始資料中定位此訂單"); } } catch (e) { alert("刪除失敗: " + e.message); } }
function reprintOrder(displayIndex) { try { let visibleList = getVisibleOrders(); let targetOrder = visibleList[displayIndex]; if (!targetOrder) { alert("❌ 錯誤：找不到該筆訂單資料"); return; } printReceipt({ seq: targetOrder.formattedSeq || targetOrder.seq || "補", table: targetOrder.seat, time: targetOrder.time, items: targetOrder.items, original: targetOrder.originalTotal || 0, total: targetOrder.total }, false); } catch (e) { alert("補印失敗: " + e.message); } }
function closeBusiness() { try { let currentBizDate = getBusinessDate(new Date()); let targetOrders = historyOrders.filter(o => !o.isClosed && getBusinessDate(getDateFromOrder(o)) === currentBizDate); let totalRevenue = targetOrders.reduce((acc, curr) => acc + curr.total, 0); let totalCount = targetOrders.length; if (totalCount === 0) { alert("⚠️ 目前沒有需要日結的訂單 (都已結算或是今日無單)"); return; } document.getElementById("sumCount").innerText = totalCount + " 單"; document.getElementById("sumTotal").innerText = "$" + totalRevenue; summaryModal.style.display = "flex"; } catch (e) { alert("日結發生錯誤: " + e.message); } }
function confirmClearData() { try { let currentBizDate = getBusinessDate(new Date()); let updated = false; historyOrders.forEach(o => { if (!o.isClosed && getBusinessDate(getDateFromOrder(o)) === currentBizDate) { o.isClosed = true; updated = true; } }); if (updated) { saveAllToCloud(); closeSummaryModal(); showHistory(); alert("✅ 日結完成！今日列表已清空，報表資料已存檔。"); } else { closeSummaryModal(); alert("⚠️ 日結失敗：找不到可結算的訂單。"); } } catch (e) { alert("確認日結時發生錯誤: " + e.message); } }
function closeSummaryModal() { summaryModal.style.display = "none"; }
function generateReport(type) { document.querySelectorAll('.report-controls button').forEach(b => b.classList.remove('active')); let now = new Date(); if (now.getHours() < 5) now.setDate(now.getDate() - 1); let start = new Date(now); let title = ""; if (type === 'day') { document.getElementById('btnDay').classList.add('active'); start.setHours(5, 0, 0, 0); let end = new Date(start); end.setDate(end.getDate() + 1); title = "💰 今日營業額 (即時)"; filterOrders(start, end, title); } else if (type === 'week') { document.getElementById('btnWeek').classList.add('active'); let day = start.getDay() || 7; if (day !== 1) start.setHours(-24 * (day - 1)); start.setHours(5, 0, 0, 0); title = "💰 本周營業額 (即時)"; filterOrders(start, new Date(), title); } else if (type === 'month') { document.getElementById('btnMonth').classList.add('active'); start.setDate(1); start.setHours(5, 0, 0, 0); title = "💰 當月營業額 (即時)"; filterOrders(start, new Date(), title); } }
function filterOrders(startTime, endTime, titleText) { let total = 0; let count = 0; let barTotal = 0; let bbqTotal = 0; let kitchenCats = ["燒烤", "主餐", "炸物"]; historyOrders.forEach(order => { let orderTime = getDateFromOrder(order); if (orderTime >= startTime && (endTime ? orderTime < endTime : true)) { total += order.total; count++; order.items.forEach(item => { let itemCat = ""; for (const [cat, content] of Object.entries(menuData)) { if (Array.isArray(content)) { if (content.some(x => item.name.includes(x.name))) itemCat = cat; } else { for (const sub of Object.values(content)) { if (sub.some(x => item.name.includes(x.name))) itemCat = cat; } } } if(itemCat === "") { if(item.name.includes("雞") || item.name.includes("豬") || item.name.includes("牛")) itemCat = "主餐"; } if (kitchenCats.includes(itemCat)) bbqTotal += item.price; else barTotal += item.price; }); } }); document.getElementById("rptTitle").innerText = titleText; document.getElementById("rptTotal").innerText = "$" + total; document.getElementById("rptCount").innerText = "總單數: " + count; document.getElementById("rptBar").innerText = "$" + barTotal; document.getElementById("rptBBQ").innerText = "$" + bbqTotal; }
function renderCalendar() { let now = new Date(); if (now.getHours() < 5) now.setDate(now.getDate() - 1); let year = now.getFullYear(); let month = now.getMonth(); document.getElementById("calendarMonthTitle").innerText = `${year}年 ${month + 1}月`; let dailyTotals = {}; historyOrders.forEach(order => { let t = getDateFromOrder(order); if (t.getHours() < 5) t.setDate(t.getDate() - 1); if (t.getFullYear() === year && t.getMonth() === month) { let dayKey = t.getDate(); if (!dailyTotals[dayKey]) dailyTotals[dayKey] = 0; dailyTotals[dayKey] += order.total; } }); let firstDay = new Date(year, month, 1).getDay(); let daysInMonth = new Date(year, month + 1, 0).getDate(); let grid = document.getElementById("calendarGrid"); grid.innerHTML = ""; for (let i = 0; i < firstDay; i++) { let empty = document.createElement("div"); empty.className = "calendar-day empty"; grid.appendChild(empty); } let today = new Date(); if(today.getHours() < 5) today.setDate(today.getDate() - 1); for (let d = 1; d <= daysInMonth; d++) { let cell = document.createElement("div"); cell.className = "calendar-day"; if (d === today.getDate() && month === today.getMonth()) cell.classList.add("today"); let revenue = dailyTotals[d] ? `$${dailyTotals[d]}` : ""; cell.innerHTML = `<div class="day-num">${d}</div><div class="day-revenue">${revenue}</div>`; grid.appendChild(cell); } }

/* ========== 🔥🔥🔥 歷史紀錄頁面功能 (日曆 + 列表) 🔥🔥🔥 ========== */
function renderHistoryCalendar() {
    let now = new Date(); 
    if (now.getHours() < 5) now.setDate(now.getDate() - 1); 
    let year = now.getFullYear(); 
    let month = now.getMonth(); 
    
    document.getElementById("historyCalendarTitle").innerText = `${year}年 ${month + 1}月`; 
    
    let dailyCounts = {}; 
    historyOrders.forEach(order => { 
        let t = getDateFromOrder(order); 
        if (t.getHours() < 5) t.setDate(t.getDate() - 1); 
        if (t.getFullYear() === year && t.getMonth() === month) { 
            let dayKey = t.getDate(); 
            if (!dailyCounts[dayKey]) dailyCounts[dayKey] = 0; 
            dailyCounts[dayKey]++; 
        } 
    }); 

    let firstDay = new Date(year, month, 1).getDay(); 
    let daysInMonth = new Date(year, month + 1, 0).getDate(); 
    let grid = document.getElementById("historyCalendarGrid"); 
    grid.innerHTML = ""; 
    
    for (let i = 0; i < firstDay; i++) { 
        let empty = document.createElement("div"); 
        empty.className = "calendar-day empty"; 
        grid.appendChild(empty); 
    } 
    
    let today = new Date(); 
    if(today.getHours() < 5) today.setDate(today.getDate() - 1); 
    
    for (let d = 1; d <= daysInMonth; d++) { 
        let cell = document.createElement("div"); 
        cell.className = "calendar-day"; 
        if (d === today.getDate() && month === today.getMonth()) cell.classList.add("today"); 
        
        let countHtml = dailyCounts[d] ? `<div style="font-size:12px; color:#28a745; font-weight:bold;">${dailyCounts[d]} 單</div>` : ""; 
        cell.innerHTML = `<div class="day-num">${d}</div>${countHtml}`; 
        
        if (dailyCounts[d]) {
            cell.onclick = () => showOrdersByDate(year, month, d);
            cell.style.cursor = "pointer";
        }

        grid.appendChild(cell); 
    } 
}

function showOrdersByDate(year, month, day) {
    let targetDateStart = new Date(year, month, day, 5, 0, 0); 
    let targetDateEnd = new Date(year, month, day + 1, 5, 0, 0); 
    
    document.getElementById("selectedDateTitle").innerText = `📅 ${year}/${month+1}/${day} 訂單記錄`;
    document.getElementById("pastOrderListSection").style.display = "block";
    let box = document.getElementById("pastOrderBox");
    box.innerHTML = "";

    let targetOrders = historyOrders.filter(order => {
        let t = getDateFromOrder(order);
        return t >= targetDateStart && t < targetDateEnd;
    });

    if (targetOrders.length === 0) {
        box.innerHTML = "<div style='padding:20px; text-align:center;'>無資料</div>";
        return;
    }

    targetOrders.reverse().forEach((o) => {
        let seqDisplay = o.formattedSeq ? `#${o.formattedSeq}` : `#?`;
        let timeOnly = o.time.split(" ")[1] || o.time;
        
        let summary = o.items.slice(0, 2).map(i => i.name).join(", ");
        if (o.items.length > 2) summary += `...等${o.items.length}項`;

        let rowHtml = `
            <div class="history-row" style="cursor:default; background:#fff;">
                <span class="seq" style="font-weight:bold; color:#555;">${seqDisplay}</span>
                <span class="seat">${o.seat}</span>
                <span class="cust" style="font-size:14px; color:#666;">${summary}</span>
                <span class="time">${timeOnly}</span>
                <span class="amt" style="font-weight:bold; color:#d33;">$${o.total}</span>
            </div>`;
        box.innerHTML += rowHtml;
    });
    
    document.getElementById("pastOrderListSection").scrollIntoView({behavior: "smooth"});
}

/* ========== 🔥🔥🔥 加強版修復工具 (修復歷史 + 正在進行的桌位) 🔥🔥🔥 ========== */
function fixAllOrderIds() {
    if (!confirm("⚠️ 確定要執行「一鍵重整」嗎？\n\n1. 將所有歷史訂單依照日期重新編號 (#1, #2...)\n2. 修正目前桌上未結帳訂單的錯誤單號")) return;
    
    // 1. 確保排序正確
    historyOrders.sort((a, b) => new Date(a.time) - new Date(b.time));

    let dateCounters = {};

    // 2. 修復歷史訂單編號
    historyOrders.forEach(order => {
        let d = new Date(order.time);
        // 凌晨5點算前一天
        if (d.getHours() < 5) d.setDate(d.getDate() - 1);
        let dateKey = `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`;

        if (!dateCounters[dateKey]) dateCounters[dateKey] = 0;
        
        dateCounters[dateKey]++;

        order.formattedSeq = dateCounters[dateKey];
        order.seq = dateCounters[dateKey];
    });

    // 3. 🔥🔥🔥 關鍵：修復目前還在桌上的單號 (tableCustomers)
    // 取得今天的日期Key
    let now = new Date();
    if (now.getHours() < 5) now.setDate(now.getDate() - 1);
    let todayKey = `${now.getFullYear()}-${now.getMonth()+1}-${now.getDate()}`;
    let currentMaxSeq = dateCounters[todayKey] || 0;

    // 檢查所有桌子，如果有掛單，就賦予新的號碼
    for (let table in tableCustomers) {
        if (tableCustomers[table] && tableStatuses[table] === 'yellow') {
            currentMaxSeq++; // 號碼 +1
            tableCustomers[table].orderId = currentMaxSeq;
            console.log(`已修正 ${table} 的單號為 #${currentMaxSeq}`);
        }
    }

    // 4. 存回雲端
    saveAllToCloud();
    
    alert("✅ 修復完成！\n歷史訂單已重整，目前桌位單號已校正。\n網頁將自動重新整理。");
    location.reload(); 
}

window.toggleDetail = function(id) { let el = document.getElementById(id); if (el.style.display === "none") { el.style.display = "block"; } else { el.style.display = "none"; } };
window.toggleAccordion = function(id) { let el = document.getElementById(id); if(!el) return; let btn = el.previousElementSibling; el.classList.toggle("show"); if (btn) btn.classList.toggle("active"); };
window.onload = function() { document.body.addEventListener('touchstart', function() {}, false); if(sessionStorage.getItem("isLoggedIn") === "true") { showApp(); } };