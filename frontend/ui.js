/* ui.js - 介面渲染與事件處理 (v24: 確保所有頁面切換和渲染函式存在) */
console.log("UI JS v24 Loaded - 介面程式已載入");

let monthlyReportData = {}; 

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
    if(seatTimerInterval) clearInterval(seatTimerInterval); 
}

function goHome() { hideAll(); document.getElementById("home").style.display = "grid"; }

// 核心修復: openPage 確保切換頁面並調用渲染
function openPage(pageId) {
    hideAll();
    let el = document.getElementById(pageId);
    if(el) el.style.display = "block";

    if (pageId === 'historyPage') { showHistory(); }
    if (pageId === 'reportPage') { 
        generateReport('day');
        renderCalendar();
    }
}

function openTableSelect() { 
    hideAll(); 
    refreshData(); 
    document.getElementById("tableSelect").style.display = "block"; 
    renderTableGrid(); 
}

function openSettingsPage() {
    hideAll();
    document.getElementById("settingsPage").style.display = "block";
}

// 核心修復: openProductPage (顯示商品上下架頁面)
function openProductPage() {
    hideAll();
    document.getElementById("productPage").style.display = "block";
    renderProductManagement(); 
}

// 核心修復: openOwnerLogin (打開管理員登入模態框)
function openOwnerLogin(mode) {
    sessionStorage.setItem('ownerMode', mode);
    document.getElementById('ownerLoginModal').style.display = 'flex';
}

function openItemStatsModal() {
    document.getElementById('itemStatsModal').style.display = 'flex';
    // 應有 renderItemStats('day') 呼叫，此處保留，避免錯誤
}
function closeItemStatsModal() { document.getElementById('itemStatsModal').style.display = 'none'; }


/* ========== QR Code 模式控制 ========== */
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

/* ========== 🔥 待確認訂單彈窗 ========== */
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

/* ========== 座位與點餐 UI ========== */
function renderTableGrid() { 
    let grid = document.getElementById("tableSelectGrid"); 
    if(!grid) return;
    grid.innerHTML = ""; 
    tables.forEach(t => { 
        let btn = document.createElement("div"); 
        btn.className = "tableBtn btn-effect"; 
        let status = tableStatuses[t]; 
        let hasCart = tableCarts[t] && tableCarts[t].length > 0; 
        
        // 檢查是否有 Incoming Order
        let isIncoming = incomingOrders[t] !== undefined;

        if (status !== 'yellow' && tableTimers[t]) { delete tableTimers[t]; saveAllToCloud(); } 
        if (status === 'yellow' && !hasCart) { delete tableTimers[t]; delete tableStatuses[t]; delete tableCarts[t]; delete tableCustomers[t]; delete tableSplitCounters[t]; saveAllToCloud(); status = null; } 
        
        if (status === 'red') { btn.classList.add("status-red"); btn.innerHTML = `<b>${t}</b>`; } 
        else if (status === 'yellow') { btn.classList.add("status-yellow"); btn.innerHTML = `<b>${t}</b>`; } 
        else { 
            // 如果是空桌，但有 incoming order，顯示藍色提醒
            if (isIncoming) {
                 btn.classList.add("status-blue"); 
                 btn.innerHTML = `<b>${t}</b><br><span style="font-size:14px; color:#4361ee;">🔔 新訂單</span>`;
            } else {
                 btn.classList.add("status-white"); 
                 btn.innerHTML = `<b>${t}</b><br><span style="font-size:14px;">(空桌)</span>`; 
            }
        } 
        
        btn.onclick = () => {
            if (isQrMode) {
                showQrModal(t);
                toggleQrMode(); 
            } else {
                openOrderPageLogic(t);
            }
        }; 
        grid.appendChild(btn); 
    }); 
}

function openOrderPageLogic(table) { 
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
    
    document.getElementById("custName").value = info.name || ""; 
    document.getElementById("custPhone").value = info.phone || ""; 
    
    currentDiscount = { type: 'none', value: 0 }; 
    isServiceFeeEnabled = false; 
    
    // 如果是從後台進入，清空已送出暫存，避免混淆
    if(!document.body.classList.contains("customer-mode")) {
        sentItems = [];
        sessionStorage.removeItem("sentItems");
    }

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
function toggleServiceFee() { isServiceFeeEnabled = !isServiceFeeEnabled; renderCart(); }

/* ========== 顯示邏輯 (延續 logic.js 中的 renderCart) ========== */

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

function openChangePasswordModal(owner) {
    // 應有的功能：打開修改密碼的模態框
    document.getElementById("pwdOwnerName").innerText = owner;
    document.getElementById("oldPwd").value = '';
    document.getElementById("newPwd").value = '';
    document.getElementById("confirmPwd").value = '';
    document.getElementById('changePasswordModal').style.display = 'flex';
}
function closeChangePasswordModal() { document.getElementById('changePasswordModal').style.display = 'none'; }
function confirmChangePassword() { /* 實際邏輯需在 logic.js 實作 */ }


function closeOwnerModal() { document.getElementById('ownerLoginModal').style.display = 'none'; }
function checkOwner(owner) { /* 實際檢查密碼邏輯需在 logic.js 實作 */ }


function renderProductManagement() {
    const listContainer = document.getElementById("productManagementList");
    if (!listContainer) return;
    listContainer.innerHTML = ''; 

    // 重新構造菜單數據以顯示上下架開關
    for (const category of categories) {
        let items = [];
        const data = menuData[category];
        if (Array.isArray(data)) { items = data; }
        else if (typeof data === 'object') { Object.values(data).forEach(subList => { items = items.concat(subList); }); }

        if (items.length > 0) {
            let accId = `prod-acc-${category}`;
            let categoryHtml = `<button class="accordion-header-mgmt btn-effect" onclick="toggleAccordion('${accId}')">📦 ${category}</button><div id="${accId}" class="accordion-content">`;
            
            items.forEach(item => {
                const isAvailable = inventory[item.name] !== false; 
                categoryHtml += `
                    <div class="product-mgmt-row">
                        <span style="font-weight: 500; color: #333;">${item.name} ($${item.price})</span>
                        <label class="toggle-switch">
                            <input type="checkbox" onchange="toggleStockStatus('${item.name}', this.checked)" ${isAvailable ? 'checked' : ''}>
                            <span class="slider"></span>
                        </label>
                    </div>
                `;
            });
            categoryHtml += `</div>`;
            listContainer.innerHTML += categoryHtml;
        }
    }
}


// 🔥 今日訂單切換邏輯
function toggleHistoryView() {
    isHistorySimpleMode = !isHistorySimpleMode;
    const btn = document.getElementById('toggleSimpleViewBtn');
    
    if (isHistorySimpleMode) {
        btn.classList.add('active');
        btn.innerText = '✅ 簡化訂單 (合併數量)';
    } else {
        btn.classList.remove('active');
        btn.innerText = '🔄 詳盡訂單 (展開明細)';
    }
    
    showHistory();
}

// 🔥 核心功能: 渲染今日訂單列表
function showHistory() {
    const historyBox = document.getElementById("history-box");
    const container = document.getElementById("historyPage");
    if (!historyBox || !container) return;
    
    // 檢查並創建/更新切換按鈕
    if (!document.getElementById('toggleSimpleViewBtn')) {
        const headerRow = container.querySelector('.history-header-row');
        if (headerRow) {
            const toggleBtn = document.createElement('button');
            toggleBtn.id = 'toggleSimpleViewBtn';
            toggleBtn.className = 'view-toggle-btn btn-effect';
            toggleBtn.onclick = toggleHistoryView;
            headerRow.parentNode.insertBefore(toggleBtn, headerRow);
        }
    }

    const btn = document.getElementById('toggleSimpleViewBtn');
    if (btn) {
        if (isHistorySimpleMode) {
            btn.classList.add('active');
            btn.innerText = '✅ 簡化訂單 (合併數量)';
        } else {
            btn.classList.remove('active');
            btn.innerText = '🔄 詳盡訂單 (展開明細)';
        }
    }

    historyBox.innerHTML = "";
    
    let visibleOrders = getVisibleOrders();
    if (visibleOrders.length === 0) {
        historyBox.innerHTML = "<div style='text-align:center; color:#888; padding:30px;'>今日尚無已結帳訂單</div>";
        return;
    }

    visibleOrders.forEach((o, index) => {
        let seqDisplay = o.formattedSeq ? `#${o.formattedSeq}` : `#${visibleOrders.length - index}`;
        let timeOnly = o.time.split(" ")[1] || o.time;
        
        // 根據模式選擇使用合併或原始列表
        const displayItems = isHistorySimpleMode ? getMergedItems(o.items) : o.items;
        
        // 摘要始終使用合併後的列表，以便於概覽
        let summary = getMergedItems(o.items)
            .map(i => {
                let n = i.name.replace(" (招待)", "");
                if (i.count > 1) n += ` x${i.count}`;
                return n;
            }).join("、");

        let detailHtml = displayItems.map(item => {
            const count = item.count || 1;
            const price = item.isTreat ? 0 : item.price;
            const itemTotal = price * count;
            const itemDisplayName = item.name.replace(/<small.*?<\/small>|<br><b.*?<\/b>/g, '').trim(); // 移除修飾符
            const itemNote = item.name.match(/<small.*?<\/small>|<br><b.*?<\/b>/g)?.join(' ') || '';

            return `<div style="display:flex; justify-content:space-between; font-size:14px; padding:2px 0;">
                        <span style="color:#333;">${itemDisplayName} ${item.isTreat ? ' (招待)' : ''} x${count}</span>
                        <span style="font-weight:bold; color:#ef476f;">$${itemTotal}</span>
                    </div>
                    ${itemNote ? `<div style="font-size:11px; color:#999; margin-left:15px; margin-bottom:5px;">${itemNote.replace(/<br>/g, ' ').replace(/<[^>]*>/g, '').trim()}</div>` : ''}`;
        }).join('');

        let rowHtml = `
            <div class="history-row" onclick="toggleDetail('detail-${index}')">
                <span class="seq">${seqDisplay}</span>
                <span class="seat">${o.seat}</span>
                <span class="cust" style="font-size:13px; color:#64748b;">${summary}</span>
                <span class="time">${timeOnly}</span>
                <span class="amt">$${o.total}</span>
                <button onclick="event.stopPropagation(); printReceipt(historyOrders.find(ord => ord.time === '${o.time}'), false);" class="btn-effect" style="padding:5px 10px; font-size:12px; background:#475569; color:white; border-radius:5px;">🖨 補印</button>
            </div>
            <div id="detail-${index}" style="display:none; padding:15px; background:#f8fafc; border-bottom:1px solid #e2e8f0; text-align:left;">
                <p style="font-weight:bold; margin-top:0; color:var(--primary-color);">訂單內容 (實收: $${o.total} / 原價: $${o.originalTotal || o.total}):</p>
                ${detailHtml}
            </div>
        `;
        historyBox.innerHTML += rowHtml;
    });
}


// 🔥 核心功能: 渲染營業報表 (簡化版本)
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
    
    // 重新渲染日曆 (如果 reportPage 是顯示的)
    if(document.getElementById("reportPage").style.display === "block") {
        renderCalendar();
    }
}

// 🔥 核心功能: 渲染營業報表日曆 (顯示每日數據)
function renderCalendar() {
    let now = new Date();
    if (now.getHours() < 5) now.setDate(now.getDate() - 1);
    
    let year = now.getFullYear();
    let month = now.getMonth();
    
    document.getElementById("calendarMonthTitle").innerText = `${year}年 ${month + 1}月`;
    const grid = document.getElementById("calendarGrid");
    grid.innerHTML = "";
    
    let dailyData = {};
    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);
    
    for(let d = firstDayOfMonth.getDate(); d <= lastDayOfMonth.getDate(); d++) {
        let dayStart = new Date(year, month, d, 5, 0, 0, 0); 
        let dayEnd = new Date(year, month, d + 1, 5, 0, 0, 0); 
        
        let dailyOrders = historyOrders.filter(order => {
            let t = getDateFromOrder(order);
            return t >= dayStart && t < dayEnd && order.total > 0;
        });
        
        dailyData[d] = { 
            rev: dailyOrders.reduce((sum, order) => sum + (order.total || 0), 0), 
            count: dailyOrders.length
        };
    }
    
    let firstDay = new Date(year, month, 1).getDay(); 
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


/* --- 其他輔助函式 (為避免錯誤，也需確保存在) --- */
function moveSegmentHighlighter(index) {
    const highlighter = document.getElementById('reportHighlighter');
    const options = document.querySelectorAll('.segment-control-container .segment-option');
    options.forEach(opt => opt.classList.remove('active'));
    if(options[index]) options[index].classList.add('active');
    const movePercent = index * 100;
    if(highlighter) highlighter.style.transform = `translateX(${movePercent}%)`;
}

function closeBusiness() {
    if(!confirm("⚠️ 確定要執行今日營業日結嗎？\n\n- 結算當日營業額\n- 清空今日所有未結帳桌位和已結帳訂單\n- 數據將歸檔至報表")) return;
    
    const todayStats = generateReportData('day');

    document.getElementById("sumCount").innerText = `${todayStats.totalCount} 單`;
    document.getElementById("sumTotal").innerText = `$${todayStats.totalRev.toLocaleString('zh-TW')}`;

    document.getElementById("summaryModal").style.display = "flex";
}

function confirmClearData() {
    try {
        let currentBizDate = getBusinessDate(new Date());
        
        let toKeep = historyOrders.filter(o => getBusinessDate(getDateFromOrder(o)) !== currentBizDate);
        let todayClosedOrders = historyOrders.filter(o => getBusinessDate(getDateFromOrder(o)) === currentBizDate);
        todayClosedOrders.forEach(o => o.isClosed = true);
        historyOrders = [...toKeep, ...todayClosedOrders];
        
        tableCarts = {}; tableTimers = {}; tableStatuses = {}; tableCustomers = {}; tableSplitCounters = {}; tableBatchCounts = {};

        saveAllToCloud();
        closeSummaryModal();
        showToast("✅ 今日營業日結已完成！數據已歸檔。");
        setTimeout(() => { location.reload(); }, 1500);

    } catch(e) {
        alert("日結失敗: " + e.message);
    }
}

function openSplitCheckout() { if (cart.length === 0) { alert("購物車是空的，無法拆單！"); return; } tempLeftList = [...cart]; tempRightList = []; if(document.getElementById("splitDisc")) document.getElementById("splitDisc").value = ""; if(document.getElementById("splitAllow")) document.getElementById("splitAllow").value = ""; renderCheckoutLists(); checkoutModal.style.display = "flex"; }
function renderCheckoutLists() { let leftHTML = ""; let rightHTML = ""; let rightTotal = 0; if(tempLeftList.length === 0) leftHTML = "<div class='empty-hint'>已無剩餘項目</div>"; else tempLeftList.forEach((item, index) => { leftHTML += `<div class="checkout-item" onclick="moveToPay(${index})"><span>${item.name}</span><span>$${item.price}</span></div>`; }); if(tempRightList.length === 0) rightHTML = "<div class='empty-hint'>點擊左側加入</div>"; else tempRightList.forEach((item, index) => { rightHTML += `<div class="checkout-item" onclick="removeFromPay(${index})"><span>${item.name}</span><span>$${item.price}</span></div>`; }); document.getElementById("unpaidList").innerHTML = leftHTML; document.getElementById("payingList").innerHTML = rightHTML; calcSplitTotal(); }
function moveToPay(index) { let item = tempLeftList.splice(index, 1)[0]; tempRightList.push(item); renderCheckoutLists(); }
function removeFromPay(index) { let item = tempRightList.splice(index, 1)[0]; tempLeftList.push(item); renderCheckoutLists(); }
function closeCheckoutModal() { checkoutModal.style.display = "none"; }
function calcFinalPay() { let allowance = parseInt(document.getElementById("payAllowance").value) || 0; finalTotal = discountedTotal - allowance; if(finalTotal < 0) finalTotal = 0; document.getElementById("payFinal").value = finalTotal; }
function calcSplitTotal() { let baseTotal = tempRightList.reduce((a, b) => a + b.price, 0); let disc = parseFloat(document.getElementById("splitDisc").value); let allow = parseInt(document.getElementById("splitAllow").value); let finalSplit = baseTotal; if (!isNaN(disc) && disc > 0 && disc <= 100) { finalSplit = Math.round(baseTotal * (disc / 100)); } if (!isNaN(allow) && allow > 0) { finalSplit = finalSplit - allow; } if(finalSplit < 0) finalSplit = 0; document.getElementById("payTotal").innerText = "$" + finalSplit; return finalSplit; }
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
function openDiscountModal() { discountModal.style.display = "flex"; }
function closeDiscountModal() { discountModal.style.display = "none"; }
function confirmDiscount() { let val = parseFloat(document.getElementById("discInput").value); if (isNaN(val) || val <= 0 || val > 100) { alert("請輸入正確折數 (1-100)"); return; } currentDiscount = { type: 'percent', value: val }; renderCart(); closeDiscountModal(); }
function updateDiscPreview() { let val = parseFloat(document.getElementById("discInput").value); if (isNaN(val) || val <= 0 || val > 100) { document.getElementById("discPreviewText").innerText = ""; return; } let discounted = Math.round(currentOriginalTotal * (val / 100)); document.getElementById("discPreviewText").innerText = `原價 $${currentOriginalTotal} ➡ 折後 $${discounted}`; }
function openAllowanceModal() { allowanceModal.style.display = "flex"; }
function closeAllowanceModal() { allowanceModal.style.display = "none"; }
function confirmAllowance() { let val = parseInt(document.getElementById("allowInput").value); if (isNaN(val) || val < 0) { alert("請輸入正確金額"); return; } currentDiscount = { type: 'amount', value: val }; renderCart(); closeAllowanceModal(); }
function closeSummaryModal() { summaryModal.style.display = "none"; }
function closeOwnerModal() { document.getElementById('ownerLoginModal').style.display = 'none'; }
function openChangePasswordModal(owner) {
    document.getElementById("pwdOwnerName").innerText = owner;
    document.getElementById("oldPwd").value = '';
    document.getElementById("newPwd").value = '';
    document.getElementById("confirmPwd").value = '';
    document.getElementById('changePasswordModal').style.display = 'flex';
}
function closeChangePasswordModal() { document.getElementById('changePasswordModal').style.display = 'none'; }
function confirmChangePassword() { /* 實際邏輯需在 logic.js 實作 */ }
function showOwnerDetailedOrders() { /* 實際邏輯需在 logic.js 實作 */ }
function renderConfidentialCalendar() { /* 實際邏輯需在 logic.js 實作 */ }
function updateFinancialPage(ownerName) { /* 實際邏輯需在 logic.js 實作 */ }
function openReprintModal() {
    if (cart.length === 0) { alert("購物車是空的"); return; }
    const list = document.getElementById('reprintList'); list.innerHTML = '';
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
        printReceipt({ 
            seq: seqNum, 
            table: selectedTable, 
            time: new Date().toLocaleString('zh-TW', { hour12: false }), 
            items: selectedItems.map(i => ({...i, isNew: true})), 
            original: 0, 
            total: 0 
        }, true); 
        closeReprintModal(); 
    } catch (e) { alert("補單發生錯誤: " + e.message); }
}

function printReceipt(order, isKitchenTicket) {
    if (!order || !order.items) return;
    const itemsToPrint = isKitchenTicket ? order.items.filter(item => item.isNew) : getMergedItems(order.items);
    if (itemsToPrint.length === 0) { if(isKitchenTicket) return; }
    let printArea = document.getElementById('receipt-print-area');
    printArea.innerHTML = ''; printArea.style.width = '300px'; 
    const title = isKitchenTicket ? '🔔 廚房/吧檯工作單' : '🧾 消費明細';
    const totalLine = isKitchenTicket ? '' : `<div style="border-top:1px dashed black; margin-top:10px; padding-top:10px; font-size:18px; font-weight:bold;">總計: $${order.total}</div>`;
    let itemHtml = '';
    itemsToPrint.forEach(item => {
        let itemName = item.name.replace("<small style='color:#06d6a0'>[買5送1]</small>", "").trim();
        let itemPrice = item.isTreat ? 0 : item.price; 
        let itemQty = item.count || 1;
        let itemTotal = item.isTreat ? '招待' : `$${itemPrice * itemQty}`;
        let itemNote = '';
        const noteMatch = itemName.match(/<small.*?<\/small>/);
        if(noteMatch) {
            itemNote = noteMatch[0].replace(/<small style='color:#666'>\((.*?)\)<\/small>/, ' ($1)');
            itemName = itemName.replace(noteMatch[0], '').trim();
        }
        const extraShotMatch = itemName.match(/<br><b.*?<\/b>/);
        if(extraShotMatch) {
             itemNote += extraShotMatch[0].replace(/<br><b.*?>(.*?)<\/b>/, ' | $1');
             itemName = itemName.replace(extraShotMatch[0], '').trim();
        }
        itemHtml += `
            <div style="display:flex; justify-content:space-between; font-size:15px; margin-bottom:2px; font-weight:bold;">
                <span style="width:30px;">x${itemQty}</span>
                <span style="flex-grow:1; text-align:left;">${itemName} ${item.isTreat ? ' (招待)' : ''}</span>
                <span style="width:60px; text-align:right;">${itemTotal}</span>
            </div>
            ${itemNote ? `<div style="font-size:12px; color:#555; margin-left:30px; text-align:left; margin-bottom:5px;">${itemNote.replace(/<br>/g, ' ').replace(/<[^>]*>/g, '').trim()}</div>` : ''}
        `;
    });
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
    window.print();
    setTimeout(() => {
        printArea.innerHTML = '';
        printArea.style.width = '0';
    }, 500);
}


/* ========== DOMContentLoaded (確保載入時執行) ========== */
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
                sentItems = tableCarts[selectedTable].map(item => ({ ...item, isSent: true, isNew: false }));
                sessionStorage.setItem("sentItems", JSON.stringify(sentItems));
                cart = [];
                renderCart(); 
            }
        }, 800);
    } else { if(sessionStorage.getItem("isLoggedIn") === "true") { showApp(); } }
});
