/* ui.js - 介面渲染與事件處理 (v13: 通用介面渲染) */
console.log("UI JS v13 Loaded - 通用介面程式已載入");

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
            }
        }
        
        // 尋找此 item 在當前購物車(cart)中的實際索引
        const realCartIndex = cart.findIndex(item => item.id === c.id);
        let actionButtons = "";
        // 已送出的沒有操作按鈕
        if (c.isSent) {
             actionButtons = `<small style="color:#ccc;">已送出</small>`;
        } else if (realCartIndex !== -1) {
             actionButtons = !isCartSimpleMode ? `<button class="${treatClass}" onclick="toggleTreat(${realCartIndex})">${treatText}</button><button class="del-btn btn-effect" onclick="removeItem(${realCartIndex})">刪除</button>` : `<small style="color:#888;">(切換檢視操作)</small>`;
        }
        
        cartList.innerHTML += `<div class="${rowClass}">${nameHtml}<div class="cart-item-price">${priceHtml}</div><div style="display:flex; gap:5px; justify-content:flex-end;">${actionButtons}</div></div>`; 
    }); 

    // 計算最終金額
    currentDiscount = order ? order.discount : { type: 'none', value: 0 };
    isServiceFeeEnabled = order ? order.isServiceFeeEnabled : false;
    
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
function addSalmonPrice() { let price = parseInt(document.getElementById("salmonPrice").value); if(isNaN(price) || price <= 0) { alert("請輸入金額！"); return; } addToCart("味繒鮭魚", price); }
function addFriedSquidPrice() { let price = parseInt(document.getElementById("squidPrice").value); if(isNaN(price) || price <= 0) { alert("請輸入金額！"); return; } addToCart("酥炸魷魚", price); }
let tempCustomItem = null;
function checkItemType(name, price, categoryName) { 
    if (name === "隱藏特調") { openCustomModal(name, price); return; } 
    let realPrice = itemPrices[name] !== undefined ? itemPrices[name] : price; 
    if (name === "隱藏啤酒" || name === "味繒鮭魚" || name === "酥炸魷魚") { addToCart(name, realPrice); return; } 
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

let isExtraShot = false;
function openCustomModal(name, price) { tempCustomItem = { name, price }; document.querySelectorAll('input[name="flavor"]')[0].checked = true; document.querySelectorAll('input[name="taste"]')[0].checked = true; let alcoholSec = document.getElementById("modalAlcoholSection"); let noteSec = document.getElementById("modalNoteSection"); let title = document.getElementById("customTitle"); if (price === 280) { title.innerText = "隱藏特調(酒精)"; alcoholSec.style.display = "block"; noteSec.style.display = "none"; isExtraShot = false; document.getElementById("extraShotBtn").classList.remove("active"); document.getElementById("alcoholRange").value = 0; document.getElementById("alcoholVal").innerText = "0"; } else if (price === 300) { title.innerText = "隱藏特調(無酒精)"; alcoholSec.style.display = "none"; noteSec.style.display = "block"; document.getElementById("customNote").value = ""; } customModal.style.display = "flex"; }
function toggleExtraShot() { isExtraShot = !isExtraShot; document.getElementById("extraShotBtn").classList.toggle("active"); }
function closeCustomModal() { customModal.style.display = "none"; tempCustomItem = null; }
function confirmCustomItem() { try { if (!tempCustomItem) return; let flavor = document.querySelector('input[name="flavor"]:checked').value; let taste = document.querySelector('input[name="taste"]:checked').value; let extraStr = ""; let finalPrice = tempCustomItem.price; if (tempCustomItem.price === 280) { let alcohol = document.getElementById("alcoholRange").value; if(isExtraShot) { finalPrice += 40; extraStr += "<br><b style='color:#d33;'>🔥 濃度升級 (+$40)</b>"; } extraStr += `<br><small style='color:#666'>(${flavor} / ${taste} / 濃度+${alcohol}%)</small>`; } else { let note = document.getElementById("customNote").value.trim(); if(note) extraStr += `<br><span style='color:#007bff; font-size:14px;'>📝 ${note}</span>`; extraStr += `<br><small style='color:#666'>(${flavor} / ${taste})</small>`; } addToCart(`${tempCustomItem.name} ${extraStr}`, finalPrice); closeCustomModal(); } catch (e) { alert("加入特調失敗: " + e.message); } }

function openDiscountModal() { discountModal.style.display = "flex"; }
function closeDiscountModal() { discountModal.style.display = "none"; }
function confirmDiscount() { 
    let val = parseFloat(document.getElementById("discInput").value); 
    if (isNaN(val) || val <= 0 || val > 100) { alert("請輸入正確折數 (1-100)"); return; } 
    currentDiscount = { type: 'percent', value: val }; 
    if(selectedOrderId && typeof saveOrderDiscount === 'function') saveOrderDiscount(selectedOrderId, currentDiscount, isServiceFeeEnabled);
    renderCart(); 
    closeDiscountModal(); 
}

function openAllowanceModal() { allowanceModal.style.display = "flex"; }
function closeAllowanceModal() { allowanceModal.style.display = "none"; }
function confirmAllowance() { 
    let val = parseInt(document.getElementById("allowInput").value); 
    if (isNaN(val) || val < 0) { alert("請輸入正確金額"); return; } 
    currentDiscount = { type: 'amount', value: val }; 
    if(selectedOrderId && typeof saveOrderDiscount === 'function') saveOrderDiscount(selectedOrderId, currentDiscount, isServiceFeeEnabled);
    renderCart(); 
    closeAllowanceModal(); 
}

function openPaymentModal() { 
    if (!selectedOrderId) { alert("請先選擇或建立訂單！"); return; }
    const order = tableOrders[selectedOrderId];
    if (!order || (cart.length === 0 && (!order.items || order.items.length === 0))) { 
        if(!confirm("訂單是空的，確定要直接清桌嗎？")) return; 
        if(typeof checkoutOrder === 'function') checkoutOrder(selectedOrderId, 0); 
        return; 
    } 
    if (cart.length > 0) {
        if (!confirm("購物車有未送出的品項，將自動儲存出單後再結帳，確定嗎？")) return;
        if(typeof updateOrderManual === 'function') updateOrderManual(true);
        // updateOrderManual 會重新呼叫 openPaymentModal
        return; 
    }
    
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
function confirmCheckout() { 
    let finalAmount = parseInt(document.getElementById("payFinal").value); 
    if(isNaN(finalAmount) || finalAmount < 0) { alert("金額錯誤！"); return; } 
    if(typeof checkoutOrder === 'function') checkoutOrder(selectedOrderId, finalAmount);
    closePaymentModal(); 
}

// 拆單相關邏輯 (與舊版相容)
let tempLeftList = [];
let tempRightList = [];
function openSplitCheckout() { 
    if (!selectedOrderId || !tableOrders[selectedOrderId]) { alert("請先選擇訂單！"); return; }
    const order = tableOrders[selectedOrderId];
    const items = order.items || [];
    if (items.length === 0) { alert("訂單是空的，無法拆單！"); return; } 
    
    // 如果購物車有未送出項目，先要求儲存
    if(cart.length > 0) {
        if (!confirm("購物車有未送出的品項，請先儲存訂單後再拆單！")) return;
        if(typeof updateOrderManual === 'function') updateOrderManual(false);
    }
    
    tempLeftList = [...items]; 
    tempRightList = []; 
    if(document.getElementById("splitDisc")) document.getElementById("splitDisc").value = ""; 
    if(document.getElementById("splitAllow")) document.getElementById("splitAllow").value = ""; 
    renderCheckoutLists(); 
    checkoutModal.style.display = "flex"; 
}

// ... (省略其他功能函數，因為它們與主改動無關且已在 logic.js 中保留)

/* ========== 客人模式初始化 (需依賴 order_logic.js) ========== */
window.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const tableParam = urlParams.get('table');
    if (tableParam) {
        console.log("進入客人點餐模式，桌號:", tableParam);
        document.body.classList.add("customer-mode");
        sessionStorage.setItem("isLoggedIn", "true");
        showApp();
        setTimeout(() => {
            // 客人模式現在會呼叫 order_logic 中的函式
            if(typeof initCustomerOrder === 'function') {
                initCustomerOrder(decodeURIComponent(tableParam));
            }
        }, 800);
    } else { if(sessionStorage.getItem("isLoggedIn") === "true") { showApp(); } }
});
