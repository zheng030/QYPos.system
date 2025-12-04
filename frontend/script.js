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

firebase.initializeApp(firebaseConfig);
const db = firebase.database();

/* ========== 2. 系統設定 ========== */
const SYSTEM_PASSWORD = "5898"; 
let OWNER_PASSWORDS = { "景偉": "0001", "小飛": "0002", "威志": "0003" };

function checkLogin() {
    let input = document.getElementById("loginPass").value;
    if (input === SYSTEM_PASSWORD) {
        sessionStorage.setItem("isLoggedIn", "true");
        document.getElementById("loginError").style.display = "none"; 
        showApp();
    } else {
        document.getElementById("loginError").style.display = "block"; 
        document.getElementById("loginPass").value = ""; 
    }
}

function showApp() {
    document.getElementById("login-screen").style.display = "none";
    document.getElementById("app-container").style.display = "block";
    initRealtimeData();
    goHome();
}

let dailyOrderCount = 0;

function initRealtimeData() {
    db.ref('/').on('value', (snapshot) => {
        const data = snapshot.val() || {};
        historyOrders = data.historyOrders ? (Array.isArray(data.historyOrders) ? data.historyOrders : Object.values(data.historyOrders)) : [];
        tableTimers = data.tableTimers || {};
        tableCarts = data.tableCarts || {};
        tableStatuses = data.tableStatuses || {};
        tableCustomers = data.tableCustomers || {};
        tableSplitCounters = data.tableSplitCounters || {}; 
        dailyOrderCount = data.dailyOrderCount || 0;
        itemCosts = data.itemCosts || {}; 
        itemPrices = data.itemPrices || {};
        if (data.ownerPasswords) OWNER_PASSWORDS = data.ownerPasswords;

        if(document.getElementById("tableSelect").style.display === "block") renderTableGrid();
        if(document.getElementById("historyPage").style.display === "block") showHistory();
        if(document.getElementById("reportPage").style.display === "block") generateReport('day');
        let currentOwner = document.getElementById("ownerWelcome").innerText;
        if(document.getElementById("confidentialPage").style.display === "block" && currentOwner) { updateFinancialPage(currentOwner); }
    });
}

function saveAllToCloud() {
    db.ref('/').update({
        historyOrders, tableTimers, tableCarts, tableStatuses, tableCustomers, tableSplitCounters, dailyOrderCount, itemCosts, itemPrices, ownerPasswords: OWNER_PASSWORDS
    }).catch(err => console.error(err));
}

const categories = ["調酒", "純飲", "shot", "啤酒", "咖啡", "飲料", "燒烤", "主餐", "炸物", "厚片", "甜點", "其他"];
const menuData = {
    "調酒": { "$250 調酒": [{name:"高球",price:250},{name:"琴通寧",price:250},{name:"螺絲起子",price:250},{name:"藍色珊瑚礁",price:250},{name:"龍舌蘭日出",price:250}], "$280 調酒": [{name:"白色俄羅斯",price:280},{name:"性感海灘",price:280},{name:"威士忌酸",price:280},{name:"惡魔",price:280},{name:"梅夢",price:280},{name:"輕浪蘭夢",price:280},{name:"暮色梅影",price:280},{name:"醉椰落日",price:280},{name:"晨曦花露",price:280},{name:"隱藏特調",price:280}], "$320 調酒": [{name:"橙韻旋律",price:320},{name:"莫希托",price:320},{name:"長島冰茶",price:320},{name:"內格羅尼",price:320},{name:"咖啡馬丁尼",price:320},{name:"雅茗",price:320},{name:"幽香琥珀",price:320},{name:"琴盈紅酸",price:320},{name:"微醺榛情",price:320}], "無酒精調酒": [{name:"小熊軟糖",price:300},{name:"桂花晨露",price:300},{name:"玫瑰紅茶",price:300},{name:"珍珠奶茶",price:300},{name:"紅豆牛奶",price:300},{name:"隱藏特調",price:300}] },
    "純飲": { "$200 純飲": [{name:"岩井(紅酒桶)",price:200},{name:"鉑仕曼 12 年",price:200},{name:"百富 12 年",price:200},{name:"拉佛格",price:200},{name:"蘇格登 12 年",price:200},{name:"格蘭利威 12 年",price:200},{name:"凱德漢 7 年",price:200}], "$300 純飲": [{name:"響",price:300},{name:"白州",price:300},{name:"岩井(雪莉桶)",price:300},{name:"大摩 12 年",price:300},{name:"百富 14 年",price:300},{name:"卡爾里拉",price:300}] },
    "shot": [{name:"伏特加",price:100},{name:"蘭姆酒",price:100},{name:"龍舌蘭",price:100},{name:"琴酒",price:100},{name:"威士忌",price:100},{name:"B52",price:150},{name:"薄荷奶糖",price:150},{name:"提拉米蘇",price:150},{name:"小愛爾蘭",price:150}],
    "啤酒": [{name:"百威",price:120},{name:"可樂娜",price:120},{name:"金樽",price:150},{name:"雪山",price:150},{name:"隱藏啤酒",price:0}],
    "咖啡": [{name:"美式",price:100},{name:"青檸美式",price:120},{name:"冰橙美式",price:150},{name:"拿鐵",price:120},{name:"香草拿鐵",price:120},{name:"榛果拿鐵",price:150},{name:"摩卡拿鐵",price:150}],
    "飲料": [{name:"可樂",price:80},{name:"雪碧",price:80},{name:"可爾必思",price:80},{name:"柳橙汁",price:80},{name:"蘋果汁",price:80},{name:"蔓越莓汁",price:80},{name:"紅茶",price:80},{name:"綠茶",price:80},{name:"烏龍茶",price:80}],
    "燒烤": { "Popular": [{name:"米血",price:25},{name:"豆乾",price:25},{name:"雞脖子",price:25},{name:"小肉豆",price:25},{name:"甜不辣",price:25},{name:"鑫鑫腸",price:25},{name:"糯米腸",price:25},{name:"百頁豆腐",price:25},{name:"豆包",price:30},{name:"肥腸",price:30},{name:"鱈魚丸",price:30},{name:"豬捲蔥",price:40},{name:"雞胸肉",price:40},{name:"豬捲金針菇",price:40},{name:"香腸",price:40},{name:"牛肉串",price:45},{name:"雞腿捲",price:45},{name:"孜然羊肉串",price:50},{name:"香蔥雞腿肉串",price:55},{name:"雞腿",price:80}], "Chicken": [{name:"雞胗",price:30},{name:"雞心",price:30},{name:"雞翅",price:30},{name:"雞屁股",price:30},{name:"雞皮",price:35},{name:"大熱狗",price:35},{name:"鹹麻吉",price:35},{name:"花生麻吉",price:35}], "花生糯米腸組合": [{name:"A 糯米腸+香腸",price:80},{name:"B 糯米腸+鹹豬肉",price:100},{name:"C 糯米腸+香腸+鹹豬肉",price:150},{name:"糯米腸",price:100},{name:"鹹豬肉",price:120},{name:"香酥雞胸",price:120}], "隱藏限定": [{name:"碳烤豆腐",price:40},{name:"牛蒡甜不辣",price:40},{name:"沙爹豬",price:45},{name:"手羽先",price:50},{name:"洋蔥牛五花",price:55},{name:"香蔥牛五花",price:55},{name:"碳烤雞排",price:90},{name:"麝香牛五花",price:95},{name:"乾煎虱目魚",price:180},{name:"帶骨牛小排",price:280}] },
    "主餐": [{name:"炒飯",price:90},{name:"蒜漬糖蜜番茄麵包",price:140},{name:"日式炒烏龍麵",price:150},{name:"親子丼",price:160},{name:"酒蒸蛤蠣",price:180},{name:"純酒白蝦",price:200},{name:"唐揚咖哩",price:220},{name:"龍膽石斑魚湯",price:280},{name:"味繒鮭魚",price:0}],
    "炸物": [{name:"嫩炸豆腐",price:80},{name:"脆薯",price:100},{name:"雞塊",price:100},{name:"鑫鑫腸",price:100},{name:"雞米花",price:100},{name:"洋蔥圈",price:100},{name:"酥炸魷魚",price:0},{name:"炸物拼盤",price:400}],
    "厚片": [{name:"花生厚片",price:80},{name:"奶酥厚片",price:80},{name:"蒜香厚片",price:80},{name:"巧克力厚片",price:80},{name:"巧克力棉花糖厚片",price:80}],
    "甜點": [{name:"起司蛋糕",price:120}],
    "其他": [{name:"服務費",price:100}]
};

const tables = ["吧檯1","吧檯2","吧檯3","吧檯4","吧檯5","圓桌1","圓桌2","六人桌","四人桌1","四人桌2","大理石桌1","備用1","備用2","備用3","備用4"];

let selectedTable = null;
let cart = []; 
let historyOrders = [];
let tableTimers = {};
let tableCarts = {};
let tableStatuses = {};
let tableCustomers = {};
let tableSplitCounters = {}; 
let itemCosts = {}; 
let itemPrices = {}; 

let seatTimerInterval = null;
let tempCustomItem = null;
let isExtraShot = false; 
let tempLeftList = [];
let tempRightList = [];
let currentOriginalTotal = 0; 
let finalTotal = 0;           
let currentDiscount = { type: 'none', value: 0 }; 

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

/* ========== 頁面導航與管理 ========== */
function goHome() { hideAll(); document.getElementById("home").style.display = "grid"; }
function hideAll() { ["home", "orderPage", "historyPage", "tableSelect", "reportPage", "confidentialPage", "settingsPage"].forEach(id => { let el = document.getElementById(id); if(el) el.style.display = "none"; }); if(seatTimerInterval) clearInterval(seatTimerInterval); }
function openPage(pageId) { hideAll(); let el = document.getElementById(pageId); if(el) el.style.display = "block"; if(pageId === 'historyPage') { showHistory(); } if(pageId === 'reportPage') { generateReport('day'); } }

function openTableSelect() { hideAll(); refreshData(); document.getElementById("tableSelect").style.display = "block"; renderTableGrid(); }
function renderTableGrid() { 
    let grid = document.getElementById("tableSelectGrid"); grid.innerHTML = ""; 
    tables.forEach(t => { 
        let btn = document.createElement("div"); btn.className = "tableBtn btn-effect"; 
        let status = tableStatuses[t]; let hasCart = tableCarts[t] && tableCarts[t].length > 0; 
        if (status !== 'yellow' && tableTimers[t]) { delete tableTimers[t]; saveAllToCloud(); } 
        if (status === 'yellow' && !hasCart) { delete tableTimers[t]; delete tableStatuses[t]; delete tableCarts[t]; delete tableCustomers[t]; delete tableSplitCounters[t]; saveAllToCloud(); status = null; } 
        if (status === 'red') { btn.classList.add("status-red"); btn.innerHTML = `<b>${t}</b>`; } else if (status === 'yellow') { btn.classList.add("status-yellow"); btn.innerHTML = `<b>${t}</b>`; } else { btn.classList.add("status-white"); btn.innerHTML = `<b>${t}</b><br><span style="font-size:14px; color:#666;">(空桌)</span>`; } 
        btn.onclick = () => openOrderPage(t); grid.appendChild(btn); 
    }); 
}

function openOrderPage(table) { 
    selectedTable = table; document.getElementById("seatLabel").innerHTML = "（" + table + "）"; hideAll(); document.getElementById("orderPage").style.display = "block"; 
    if (tableTimers[table]) { startSeatTimerDisplay(); } else { document.getElementById("seatTimer").innerText = "⏳ 尚未計時"; if(seatTimerInterval) clearInterval(seatTimerInterval); } 
    cart = tableCarts[table] || []; let info = tableCustomers[table] || {name:"", phone:""}; custNameInput.value = info.name || ""; custPhoneInput.value = info.phone || ""; 
    currentDiscount = { type: 'none', value: 0 }; buildCategories(); renderCart(); 
}
function startSeatTimerDisplay() { updateSeatTimerText(); seatTimerInterval = setInterval(updateSeatTimerText, 1000); }
function updateSeatTimerText() { let startTime = tableTimers[selectedTable]; if(!startTime) return; let diff = Math.floor((Date.now() - startTime) / 1000); let h = Math.floor(diff / 3600).toString().padStart(2,'0'); let m = Math.floor((diff % 3600) / 60).toString().padStart(2,'0'); let s = (diff % 60).toString().padStart(2,'0'); document.getElementById("seatTimer").innerText = `⏳ 已入座：${h}:${m}:${s}`; }

/* ========== 菜單與加點 ========== */
function buildCategories() { menuGrid.innerHTML = ""; categories.forEach(c => { let box = document.createElement("div"); box.className = "categoryBtn btn-effect"; box.innerText = c; if (menuData[c]) box.onclick = () => openItems(c); else box.style.opacity = "0.5"; menuGrid.appendChild(box); }); }
function openItems(category) {
    let data = menuData[category]; let backBtn = `<button class="back-to-cat btn-effect" onclick="buildCategories()">⬅ 返回 ${category} 分類</button>`;
    const flatListCategories = ["純飲", "shot", "啤酒", "咖啡", "飲料", "主餐", "炸物", "厚片", "甜點", "其他"];
    const createItemHtml = (item, isFlat = false) => {
        let actionsHtml = ""; let nameHtml = `<span>${item.name} <b>$${item.price}</b></span>`; let itemClass = isFlat ? "item list-mode" : "item shot-item";
        if (item.name === "隱藏啤酒") { nameHtml = `<span style="font-weight:bold; color:#007bff;">🍺 隱藏啤酒</span>`; actionsHtml = `<input id="hbName" class="inline-input" placeholder="品名" style="width:100px;"><input type="number" id="hbPrice" class="inline-input" placeholder="時價" style="width:70px;"><button onclick="addInlineHiddenBeer()" style="background:#28a745;" class="btn-effect">加入</button>`; } 
        else if (item.name === "味繒鮭魚") { nameHtml = `<span>味繒鮭魚 <b style="color:#d33;">(時價)</b></span>`; actionsHtml = `<input type="number" id="salmonPrice" class="inline-input" placeholder="金額" style="width:80px;"><button onclick="addSalmonPrice()" style="background:#28a745;" class="btn-effect">加入</button>`; } 
        else if (item.name === "酥炸魷魚") { nameHtml = `<span>酥炸魷魚 <b style="color:#d33;">(時價)</b></span>`; actionsHtml = `<input type="number" id="squidPrice" class="inline-input" placeholder="金額" style="width:80px;"><button onclick="addFriedSquidPrice()" style="background:#28a745;" class="btn-effect">加入</button>`; } 
        else { actionsHtml = `<button onclick='checkItemType("${item.name}", ${item.price}, "${category}")' class="btn-effect">加入</button>`; if (category === "shot") { actionsHtml += `<button onclick='addShotSet("${item.name}", ${item.price})' class="set-btn btn-effect" style="margin-left:5px; background:#6f42c1;">🔥 一組</button>`; } }
        return `<div class="${itemClass}">${nameHtml}<div class="shot-actions">${actionsHtml}</div></div>`;
    };
    if (flatListCategories.includes(category)) { let html = backBtn; if (Array.isArray(data)) { html += `<div class="sub-cat-title">${category}</div>`; data.forEach(item => { html += createItemHtml(item, true); }); } else { Object.keys(data).forEach((subCat) => { let items = data[subCat]; html += `<div class="sub-cat-title">${subCat}</div>`; items.forEach(item => { html += createItemHtml(item, true); }); }); } html += backBtn; menuGrid.innerHTML = html; return; }
    if (!Array.isArray(data)) { let html = backBtn; Object.keys(data).forEach((subCat, index) => { let items = data[subCat]; let accId = `acc-${index}`; html += `<button class="accordion-header btn-effect" onclick="toggleAccordion('${accId}')">${subCat} <span class="arrow">▼</span></button><div id="${accId}" class="accordion-content">`; items.forEach(item => { html += createItemHtml(item, false); }); html += `</div>`; }); html += backBtn; menuGrid.innerHTML = html; return; }
}

// 特殊商品處理
function addInlineHiddenBeer() { let name = document.getElementById("hbName").value.trim(); let price = parseInt(document.getElementById("hbPrice").value); if(!name) name = "隱藏啤酒"; if(isNaN(price) || price < 0) { alert("請輸入正確價格"); return; } addToCart(name, price); }
function addSalmonPrice() { let price = parseInt(document.getElementById("salmonPrice").value); if(isNaN(price) || price <= 0) { alert("請輸入金額！"); return; } addToCart("味繒鮭魚", price); }
function addFriedSquidPrice() { let price = parseInt(document.getElementById("squidPrice").value); if(isNaN(price) || price <= 0) { alert("請輸入金額！"); return; } addToCart("酥炸魷魚", price); }
function checkItemType(name, price, categoryName) { if (name === "隱藏特調") { openCustomModal(name, price); return; } let realPrice = itemPrices[name] !== undefined ? itemPrices[name] : price; if (name === "隱藏啤酒" || name === "味繒鮭魚" || name === "酥炸魷魚") { addToCart(name, realPrice); return; } if (categoryName === "咖啡") { openDrinkModal(name, realPrice, "coffee"); return; } if (categoryName === "飲料") { if (name.includes("茶")) openDrinkModal(name, realPrice, "tea"); else openDrinkModal(name, realPrice, "drink"); return; } if (categoryName === "主餐") { if (name === "炒飯") { openFoodModal(name, realPrice, "friedRice"); return; } if (name === "日式炒烏龍麵" || name === "親子丼") { openFoodModal(name, realPrice, "meatOnly"); return; } } addToCart(name, realPrice); }
function openFoodModal(name, price, type) { tempCustomItem = { name, price, type }; document.getElementById("foodTitle").innerText = name; let meatOptions = document.getElementById("meatOptions"); let html = ""; if (type === "friedRice") { html = `<label class="radio-box"><input type="radio" name="meat" value="牛" onclick="tempCustomItem.price=${price}" checked><div class="radio-btn btn-effect">牛 ($${price})</div></label><label class="radio-box"><input type="radio" name="meat" value="豬" onclick="tempCustomItem.price=${price}"><div class="radio-btn btn-effect">豬 ($${price})</div></label><label class="radio-box"><input type="radio" name="meat" value="雞" onclick="tempCustomItem.price=${price}"><div class="radio-btn btn-effect">雞 ($${price})</div></label><label class="radio-box"><input type="radio" name="meat" value="蝦仁" onclick="tempCustomItem.price=${price + 20}"><div class="radio-btn btn-effect">蝦仁 ($${price + 20})</div></label>`; } else { html = `<label class="radio-box"><input type="radio" name="meat" value="牛" checked><div class="radio-btn btn-effect">牛</div></label><label class="radio-box"><input type="radio" name="meat" value="豬"><div class="radio-btn btn-effect">豬</div></label><label class="radio-box"><input type="radio" name="meat" value="雞"><div class="radio-btn btn-effect">雞</div></label>`; } meatOptions.innerHTML = html; foodOptionModal.style.display = "flex"; }
function closeFoodModal() { foodOptionModal.style.display = "none"; tempCustomItem = null; }
function confirmFoodItem() { if (!tempCustomItem) return; let meat = document.querySelector('input[name="meat"]:checked').value; addToCart(`${tempCustomItem.name} <small style='color:#666'>(${meat})</small>`, tempCustomItem.price); closeFoodModal(); }
function openDrinkModal(name, price, type) { tempCustomItem = { name, price, type }; document.getElementById("drinkTitle").innerText = name; let simpleTemp = document.getElementById("simpleTempSection"); let advTemp = document.getElementById("advanceTempSection"); let sugar = document.getElementById("sugarSection"); document.querySelectorAll('input[name="simpleTemp"]')[0].checked = true; document.querySelectorAll('input[name="advTemp"]')[0].checked = true; document.querySelectorAll('input[name="sugar"]')[0].checked = true; if (type === "coffee") { simpleTemp.style.display = "block"; advTemp.style.display = "none"; sugar.style.display = "none"; } else if (type === "drink") { simpleTemp.style.display = "none"; advTemp.style.display = "block"; sugar.style.display = "none"; } else if (type === "tea") { simpleTemp.style.display = "none"; advTemp.style.display = "block"; sugar.style.display = "block"; } drinkModal.style.display = "flex"; }
function closeDrinkModal() { drinkModal.style.display = "none"; tempCustomItem = null; }
function confirmDrinkItem() { if (!tempCustomItem) return; let note = ""; if (tempCustomItem.type === "coffee") { let temp = document.querySelector('input[name="simpleTemp"]:checked').value; note = `<small style='color:#666'>(${temp})</small>`; } else { let temp = document.querySelector('input[name="advTemp"]:checked').value; if (tempCustomItem.type === "tea") { let sugar = document.querySelector('input[name="sugar"]:checked').value; note = `<small style='color:#666'>(${temp} / ${sugar})</small>`; } else { note = `<small style='color:#666'>(${temp})</small>`; } } addToCart(tempCustomItem.name + " " + note, tempCustomItem.price); closeDrinkModal(); }
function addShotSet(name, price) { addToCart(`${name} <small style='color:#28a745'>[買5送1]</small>`, price * 5); }
function openCustomModal(name, price) { tempCustomItem = { name, price }; document.querySelectorAll('input[name="flavor"]')[0].checked = true; document.querySelectorAll('input[name="taste"]')[0].checked = true; let alcoholSec = document.getElementById("modalAlcoholSection"); let noteSec = document.getElementById("modalNoteSection"); let title = document.getElementById("customTitle"); if (price === 280) { title.innerText = "隱藏特調(酒精)"; alcoholSec.style.display = "block"; noteSec.style.display = "none"; isExtraShot = false; document.getElementById("extraShotBtn").classList.remove("active"); document.getElementById("alcoholRange").value = 0; document.getElementById("alcoholVal").innerText = "0"; } else if (price === 300) { title.innerText = "隱藏特調(無酒精)"; alcoholSec.style.display = "none"; noteSec.style.display = "block"; document.getElementById("customNote").value = ""; } customModal.style.display = "flex"; }
function toggleExtraShot() { isExtraShot = !isExtraShot; document.getElementById("extraShotBtn").classList.toggle("active"); }
function closeCustomModal() { customModal.style.display = "none"; tempCustomItem = null; }
function confirmCustomItem() { if (!tempCustomItem) return; let flavor = document.querySelector('input[name="flavor"]:checked').value; let taste = document.querySelector('input[name="taste"]:checked').value; let extraStr = ""; let finalPrice = tempCustomItem.price; if (tempCustomItem.price === 280) { let alcohol = document.getElementById("alcoholRange").value; if(isExtraShot) { finalPrice += 40; extraStr += "<br><b style='color:#d33;'>🔥 濃度升級 (+$40)</b>"; } extraStr += `<br><small style='color:#666'>(${flavor} / ${taste} / 濃度+${alcohol}%)</small>`; } else { let note = document.getElementById("customNote").value.trim(); if(note) extraStr += `<br><span style='color:#007bff; font-size:14px;'>📝 ${note}</span>`; extraStr += `<br><small style='color:#666'>(${flavor} / ${taste})</small>`; } addToCart(`${tempCustomItem.name} ${extraStr}`, finalPrice); closeCustomModal(); }

/* ========== 🔥 核心邏輯修正 ========== */
function addToCart(name, price) { cart.push({ name, price, isNew: true }); renderCart(); }

function saveAndExit(){
    if(tableStatuses[selectedTable] === 'yellow') {
        tableCarts[selectedTable] = cart;
        if (!tableCustomers[selectedTable]) tableCustomers[selectedTable] = {};
        tableCustomers[selectedTable].name = custNameInput.value;
        tableCustomers[selectedTable].phone = custPhoneInput.value;
    } else {
        delete tableCarts[selectedTable]; delete tableTimers[selectedTable]; delete tableCustomers[selectedTable]; delete tableStatuses[selectedTable]; delete tableSplitCounters[selectedTable];
        cart = [];
    }
    saveAllToCloud();
    openTableSelect();
}

function saveOrderManual() {
    if (cart.length === 0) { alert("購物車是空的，訂單未成立。"); saveAndExit(); return; }
    if (!tableCustomers[selectedTable]) { tableCustomers[selectedTable] = {}; }
    
    // 🔥 確保有訂單編號 (開桌或防呆)
    if (!tableTimers[selectedTable] || !tableCustomers[selectedTable].orderId) {
        tableTimers[selectedTable] = Date.now();
        tableSplitCounters[selectedTable] = 1; 
        dailyOrderCount++;
        tableCustomers[selectedTable].orderId = dailyOrderCount;
    }
    
    let newItemsToPrint = cart.filter(item => item.isNew === true);
    if (newItemsToPrint.length > 0) {
        printReceipt({
            seq: tableCustomers[selectedTable].orderId,
            table: selectedTable,
            time: new Date().toLocaleString('zh-TW', { hour12: false }),
            items: newItemsToPrint,
            original: 0,
            total: 0
        }, true);
        cart.forEach(item => delete item.isNew);
    }

    tableCarts[selectedTable] = cart;
    tableStatuses[selectedTable] = 'yellow';
    tableCustomers[selectedTable].name = custNameInput.value;
    tableCustomers[selectedTable].phone = custPhoneInput.value;
    saveAllToCloud();
    alert(`✔ 訂單已送出 (單號 #${tableCustomers[selectedTable].orderId})！`);
    openTableSelect();
}

function checkoutAll(manualFinal) {
    let payingTotal = (manualFinal !== undefined) ? manualFinal : finalTotal;
    let time = new Date().toLocaleString('zh-TW', { hour12: false });
    let originalTotal = currentOriginalTotal;
    let info = tableCustomers[selectedTable] || { name:"", phone:"", orderId: "?" };

    // 🔥 防呆補號
    if(!info.orderId || info.orderId === "?" || info.orderId === "T") {
        dailyOrderCount++;
        info.orderId = dailyOrderCount;
    }
    
    if (originalTotal > 0 || payingTotal > 0) {
        let splitNum = tableSplitCounters[selectedTable];
        let displaySeq = info.orderId; 
        let displaySeat = selectedTable;
        // 若拆過單，這筆算尾款
        if(splitNum && splitNum > 1) {
            displaySeq = `${info.orderId}-${splitNum}`;
            displaySeat = `${selectedTable} (拆單)`;
        }

        let newOrder = { seat: displaySeat, formattedSeq: displaySeq, time: time, items: [...cart], total: payingTotal, originalTotal: originalTotal, customerName: info.name, customerPhone: info.phone };
        if(!Array.isArray(historyOrders)) historyOrders = [];
        historyOrders.push(newOrder);
        localStorage.setItem("orderHistory", JSON.stringify(historyOrders));
    }
    
    delete tableCarts[selectedTable]; delete tableTimers[selectedTable]; delete tableStatuses[selectedTable]; delete tableCustomers[selectedTable]; delete tableSplitCounters[selectedTable];
    saveAllToCloud();
    cart = []; currentDiscount = { type: 'none', value: 0 }; 
    alert(`💰 結帳完成！實收 $${payingTotal}`);
    
    // 列印
    printReceipt({
        seq: (originalTotal > 0 || payingTotal > 0) ? (tableCustomers[selectedTable] ? tableCustomers[selectedTable].orderId : "?") : "N/A",
        table: selectedTable,
        time: time,
        items: (originalTotal > 0) ? [...historyOrders[historyOrders.length-1].items] : [],
        original: originalTotal,
        total: payingTotal
    });
    openTableSelect(); 
}

function confirmPayment() { // 拆單結帳
    if (tempRightList.length === 0) { alert("右側沒有商品，無法結帳！"); return; }
    let time = new Date().toLocaleString('zh-TW', { hour12: false });
    let total = calcSplitTotal();
    let info = tableCustomers[selectedTable] || { name:"", phone:"", orderId: "?" };
    
    // 🔥 防呆補號
    if(!info.orderId || info.orderId === "?" || info.orderId === "T") {
        dailyOrderCount++;
        info.orderId = dailyOrderCount;
        if (!tableCustomers[selectedTable]) tableCustomers[selectedTable] = {};
        tableCustomers[selectedTable].orderId = dailyOrderCount;
    }
    
    let currentSplit = tableSplitCounters[selectedTable] || 1;
    let displaySeq = `${info.orderId}-${currentSplit}`;
    let displaySeat = `${selectedTable} (拆單)`;
    tableSplitCounters[selectedTable] = currentSplit + 1; 

    let newOrder = { seat: displaySeat, formattedSeq: displaySeq, time: time, items: [...tempRightList], total: total, customerName: info.name, customerPhone: info.phone };
    if(!Array.isArray(historyOrders)) historyOrders = [];
    historyOrders.push(newOrder);
    localStorage.setItem("orderHistory", JSON.stringify(historyOrders));

    if (tempLeftList.length === 0) {
        delete tableCarts[selectedTable]; delete tableTimers[selectedTable]; delete tableStatuses[selectedTable]; delete tableCustomers[selectedTable]; delete tableSplitCounters[selectedTable];
        cart = []; alert(`💰 ${selectedTable} 全部結帳完成！`); openTableSelect();
    } else {
        tableCarts[selectedTable] = tempLeftList; cart = tempLeftList; 
        alert(`💰 單號 ${displaySeq} 結帳完成！`); 
        renderCart(); 
    }
    saveAllToCloud(); closeCheckoutModal();
    
    printReceipt({
        seq: displaySeq,
        table: displaySeat,
        time: time,
        items: newOrder.items,
        original: newOrder.items.reduce((a, b) => a + b.price, 0),
        total: total
    });
}

/* ========== 其他功能 ========== */
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

/* ========== 列印邏輯 ========== */
function printReceipt(data, isTicket = false) {
    let kitchenCategories = ["燒烤", "主餐", "炸物", "厚片"]; 
    let barItemsHtml = ""; let kitchenItemsHtml = ""; let hasBar = false; let hasKitchen = false;
    data.items.forEach(i => {
        let itemCat = "";
        for (const [cat, content] of Object.entries(menuData)) { if (Array.isArray(content)) { if (content.some(x => i.name.includes(x.name))) itemCat = cat; } else { for (const subContent of Object.values(content)) { if (subContent.some(x => i.name.includes(x.name))) itemCat = cat; } } }
        if(itemCat === "") { if(i.name.includes("雞") || i.name.includes("豬") || i.name.includes("牛") || i.name.includes("飯") || i.name.includes("麵")) itemCat = "主餐"; }
        if (kitchenCategories.includes(itemCat)) { hasKitchen = true; kitchenItemsHtml += `<div class="kitchen-item">${i.name} <span style="font-size:12px; font-weight:normal;">${isTicket ? '' : ''}</span></div>`; } 
        else { hasBar = true; let priceStr = isTicket ? "" : `$${i.price}`; barItemsHtml += `<div class="receipt-item"><span>${i.name}</span><span>${priceStr}</span></div>`; }
    });
    let receiptHtml = "";
    if (hasBar || (!hasKitchen && !hasBar)) { receiptHtml += `<div class="receipt-section"><div class="receipt-header"><h2 class="store-name">${isTicket ? "加點工單 (吧台)" : "結帳收據 (櫃台)"}</h2><div class="receipt-info"><p>單號：${data.seq}</p><p>桌號：${data.table}</p><p>時間：${data.time}</p></div></div><hr class="dashed-line"><div class="receipt-items">${barItemsHtml}</div><hr class="dashed-line">${isTicket ? '' : `<div class="receipt-footer"><div class="row"><span>原價：</span><span>$${data.original}</span></div><div class="row"><span>總計：</span><span class="total">$${data.total}</span></div></div>`}</div>`; }
    if (hasBar && hasKitchen) { receiptHtml += `<div class="page-break"></div>`; }
    if (hasKitchen) { receiptHtml += `<div class="receipt-section"><div class="receipt-header"><h2 class="store-name">${isTicket ? "加點工單" : "廚房工作單"}</h2><div class="receipt-info"><p>單號：${data.seq}</p><p>桌號：${data.table}</p><p>時間：${data.time}</p></div></div><hr class="dashed-line"><div class="receipt-items">${kitchenItemsHtml}</div><hr class="dashed-line"></div>`; }
    document.getElementById("receipt-print-area").innerHTML = receiptHtml; setTimeout(() => { window.print(); }, 500);
}
function updateDiscPreview() { let val = parseFloat(document.getElementById("discInput").value); if (isNaN(val) || val <= 0 || val > 100) { document.getElementById("discPreviewText").innerText = ""; return; } let discounted = Math.round(currentOriginalTotal * (val / 100)); document.getElementById("discPreviewText").innerText = `原價 $${currentOriginalTotal} ➡ 折後 $${discounted}`; }
function renderCart() { cartList.innerHTML = ""; currentOriginalTotal = 0; cart.forEach((c, i) => { currentOriginalTotal += c.price; cartList.innerHTML += `<div style="margin-bottom:5px; border-bottom:1px dashed #ccc; padding:5px;">${c.name} - $${c.price} <button class="del-btn btn-effect" onclick="removeItem(${i})">刪除</button></div>`; }); discountedTotal = currentOriginalTotal; if (currentDiscount.type === 'percent') { discountedTotal = Math.round(currentOriginalTotal * (currentDiscount.value / 100)); totalText.innerHTML = `總金額：<span style="text-decoration:line-through; color:#999; font-size:16px;">$${currentOriginalTotal}</span> <span style="color:#d33;">$${discountedTotal}</span> <small>(折扣 ${currentDiscount.value}%)</small>`; } else { totalText.innerText = "總金額：" + currentOriginalTotal + " 元"; } }
function removeItem(index) { cart.splice(index, 1); renderCart(); }
function deleteSingleOrder(displayIndex) { if(!confirm("⚠️ 確定要刪除這筆訂單嗎？")) return; let realIndex = historyOrders.length - 1 - displayIndex; historyOrders.splice(realIndex, 1); saveAllToCloud(); showHistory(); }
function showHistory() { historyBox.innerHTML = ""; if(!historyOrders || historyOrders.length === 0) { historyBox.innerHTML = "<div style='padding:20px;color:#888;'>今日尚無訂單</div>"; return; } let orders = [...historyOrders].reverse(); orders.forEach((o, index) => { let seqDisplay = o.formattedSeq ? `#${o.formattedSeq}` : `#${orders.length - index}`; let custInfo = (o.customerName || o.customerPhone) ? `<span style="color:#007bff; font-weight:bold;">${o.customerName||""}</span> ${o.customerPhone||""}` : "<span style='color:#ccc'>-</span>"; let itemsDetail = o.items.map(i => `<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px dotted #eee;"><span>${i.name}</span> <span>$${i.price}</span></div>`).join(""); let timeOnly = o.time.split(" ")[1] || o.time; let rowId = `detail-${index}`; let amountDisplay = `$${o.total}`; if (o.originalTotal && o.originalTotal !== o.total) { amountDisplay = `<span style="text-decoration:line-through; color:#999; font-size:12px;">$${o.originalTotal}</span> <br> <span style="color:#d33;">$${o.total}</span>`; } historyBox.innerHTML += `<div class="history-row btn-effect" onclick="window.toggleDetail('${rowId}')" style="cursor:pointer;"><span class="seq" style="font-weight:bold; color:#007bff;">${seqDisplay}</span><span class="seat">${o.seat}</span><span class="cust">${custInfo}</span><span class="time">${timeOnly}</span><span class="amt">${amountDisplay}</span></div><div id="${rowId}" class="history-detail" style="display:none;"><div style="background:#f9f9f9; padding:15px; border-radius:0 0 8px 8px; border:1px solid #eee; border-top:none;"><b>📅 完整時間：</b>${o.time}<br><b>🧾 內容：</b><br>${itemsDetail}<div style="text-align:right; margin-top:10px; font-size:18px; font-weight:bold; color:#d33;">總計：$${o.total}</div><div style="text-align:right; margin-top:15px; border-top:1px solid #ddd; padding-top:10px;"><button onclick="deleteSingleOrder(${index})" class="delete-single-btn btn-effect">🗑 刪除此筆訂單</button></div></div></div>`; }); }
function openSettingsPage() { hideAll(); document.getElementById("settingsPage").style.display = "block"; }
function openChangePasswordModal(name) { document.getElementById("pwdOwnerName").innerText = name; document.getElementById("oldPwd").value = ""; document.getElementById("newPwd").value = ""; document.getElementById("confirmPwd").value = ""; changePasswordModal.style.display = "flex"; }
function closeChangePasswordModal() { changePasswordModal.style.display = "none"; }
function openOwnerLogin() { if(ownerLoginModal) ownerLoginModal.style.display = "flex"; }
function closeOwnerModal() { ownerLoginModal.style.display = "none"; }
function checkOwner(name) { let password = prompt(`請輸入 ${name} 的密碼：`); if (password === OWNER_PASSWORDS[name]) { closeOwnerModal(); openConfidentialPage(name); } else { alert("❌ 密碼錯誤！"); } }
function window_toggleAccordion(id) { let el = document.getElementById(id); if(!el) return; let btn = el.previousElementSibling; el.classList.toggle("show"); if (btn) btn.classList.toggle("active"); }
window.onload = function() { document.body.addEventListener('touchstart', function() {}, false); if(sessionStorage.getItem("isLoggedIn") === "true") { showApp(); } };