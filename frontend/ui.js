/* ui.js - 介面渲染與事件處理 (Fix: Use document.getElementById directly) */

function showApp() {
    document.getElementById("login-screen").style.display = "none";
    document.getElementById("app-container").style.display = "block";
    initRealtimeData(); 
    goHome();
}

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

/* ========== QR Code 模式控制 ========== */
const originalOpenOrderPage = openOrderPageLogic; 

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

/* ========== 座位與點餐 UI ========== */
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
        else { btn.classList.add("status-white"); btn.innerHTML = `<b>${t}</b><br><span style="font-size:14px;">(空桌)</span>`; } 
        
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
    
    // 🔥 Fix: Use getElementById directly
    document.getElementById("custName").value = info.name || ""; 
    document.getElementById("custPhone").value = info.phone || ""; 
    
    currentDiscount = { type: 'none', value: 0 }; 
    isServiceFeeEnabled = false; 
    
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
    const grid = document.getElementById("menuGrid"); // Fix: Get element
    grid.innerHTML = ""; 
    
    if (typeof categories === 'undefined') return;

    categories.forEach(c => { 
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
        let nameHtml = `<span>${item.name} <b>$${item.price}</b></span>`; 
        let itemClass = isFlat ? "item list-mode" : "item shot-item";
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
    const grid = document.getElementById("menuGrid"); // Fix: Get element
    
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

/* ========== 購物車渲染 ========== */
function toggleCartView() { isCartSimpleMode = !isCartSimpleMode; renderCart(); }
function toggleServiceFee() { isServiceFeeEnabled = !isServiceFeeEnabled; renderCart(); }

function renderCart() { 
    const cartList = document.getElementById("cart-list"); // Fix
    const totalText = document.getElementById("total"); // Fix
    cartList.innerHTML = ""; 
    currentOriginalTotal = 0; 
    
    const svcBtn = document.getElementById("svcBtn");
    if(svcBtn) {
        if(isServiceFeeEnabled) { svcBtn.classList.add("active"); svcBtn.innerHTML = "✅ 收 10% 服務費"; } 
        else { svcBtn.classList.remove("active"); svcBtn.innerHTML = "◻️ 收 10% 服務費"; }
    }

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
             nameHtml = `<div class="cart-item-name">${c.name} <span style="color:#ef476f; font-weight:bold;">x${count}</span></div>`;
             if(c.isTreat) { priceHtml = `<span style='text-decoration:line-through; color:#999;'>$${c.price * count}</span> <span style='color:#06d6a0; font-weight:bold;'>$0</span>`; } else { priceHtml = `$${itemTotal}`; }
        } else {
            nameHtml = `<div class="cart-item-name">${c.name}</div>`;
            if (c.isTreat) { priceHtml = `<span style='text-decoration:line-through; color:#999;'>$${c.price}</span> <span style='color:#06d6a0; font-weight:bold;'>$0</span>`; } else { priceHtml = `$${c.price}`; }
        }

        let actionButtons = !isCartSimpleMode ? `<button class="${treatClass}" onclick="toggleTreat(${i})">${treatText}</button><button class="del-btn btn-effect" onclick="removeItem(${i})">刪除</button>` : `<small style="color:#888;">(切換檢視操作)</small>`;
        cartList.innerHTML += `<div class="cart-item-row">${nameHtml}<div class="cart-item-price">${priceHtml}</div><div style="display:flex; gap:5px; justify-content:flex-end;">${actionButtons}</div></div>`; 
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

/* ========== 特殊商品加入 ========== */
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
function addShotSet(name, price) { addToCart(`${name} <small style='color:#06d6a0'>[買5送1]</small>`, price * 5); }

/* ========== Modals (彈出視窗) ========== */
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
    const generateHtml = (title, items, isFullReceipt) => {
        let itemsHtml = ""; items.forEach(i => { let displayName = i.name; if (i.isTreat) displayName += " (招待)"; let priceStr = isFullReceipt ? (i.isTreat ? "$0" : `$${i.price}`) : ""; let itemClass = isFullReceipt ? "receipt-item" : "receipt-item kitchen-item"; itemsHtml += `<div class="${itemClass}"><span>${displayName}</span><span>${priceStr}</span></div>`; });
        let footerHtml = ""; if (isFullReceipt) { footerHtml = `<div class="receipt-footer"><div class="row"><span>原價：</span><span>$${data.original}</span></div><div class="row"><span>總計：</span><span class="total">$${data.total}</span></div></div>`; }
        return `<div class="receipt-section"><div class="receipt-header"><h2 class="store-name">${title}</h2><div class="receipt-info"><p>單號：${data.seq}</p><p>桌號：${data.table}</p><p>時間：${data.time}</p></div></div><hr class="dashed-line"><div class="receipt-items">${itemsHtml}</div><hr class="dashed-line">${footerHtml}</div>`;
    };
    const performPrint = (htmlContent) => { return new Promise((resolve) => { printArea.innerHTML = htmlContent; setTimeout(() => { window.print(); setTimeout(resolve, 500); }, 500); }); };
    if (!isTicket) { await performPrint(generateHtml("結帳收據", data.items, true)); } else { let hasBar = barItems.length > 0; let hasKitchen = kitchenItems.length > 0; if (hasBar) await performPrint(generateHtml("吧檯工作單", barItems, false)); if (hasKitchen) await performPrint(generateHtml("廚房工作單", kitchenItems, false)); }
}

function openReprintModal() {
    if (cart.length === 0) { alert("購物車是空的"); return; }
    const list = document.getElementById('reprintList'); list.innerHTML = '';
    cart.forEach((item, index) => { list.innerHTML += `<label class="checkout-item" style="justify-content: flex-start; gap: 10px;"><input type="checkbox" class="reprint-checkbox" id="reprint-item-${index}" checked><span>${item.name}</span></label>`; });
    list.innerHTML = `<label class="checkout-item" style="background:#f0f7ff; border-color:#007bff; font-weight:bold;"><input type="checkbox" id="selectAllReprint" checked onchange="toggleAllReprint(this)"><span>全選 / 取消全選</span></label><hr style="margin: 5px 0;">` + list.innerHTML;
    reprintSelectionModal.style.display = "flex";
}
function toggleAllReprint(source) { let checkboxes = document.querySelectorAll('.reprint-checkbox'); checkboxes.forEach(cb => cb.checked = source.checked); }
function closeReprintModal() { reprintSelectionModal.style.display = "none"; }
function confirmReprintSelection() {
    try { let selectedItems = []; cart.forEach((item, index) => { let cb = document.getElementById(`reprint-item-${index}`); if (cb && cb.checked) selectedItems.push(item); }); if (selectedItems.length === 0) { alert("請至少選擇一個項目"); return; } let seqNum = "補"; if (tableCustomers[selectedTable] && tableCustomers[selectedTable].orderId) seqNum = tableCustomers[selectedTable].orderId; printReceipt({ seq: seqNum, table: selectedTable, time: new Date().toLocaleString('zh-TW', { hour12: false }), items: selectedItems, original: 0, total: 0 }, true); closeReprintModal(); } catch (e) { alert("補單發生錯誤: " + e.message); }
}

function openPage(pageId) { 
    hideAll(); 
    let el = document.getElementById(pageId); 
    if(el) el.style.display = "block"; 
    
    if(pageId === 'historyPage') showHistory();
    // 🔥 預設選中「今日」，並觸發滑動動畫
    if(pageId === 'reportPage') { 
        generateReport('day'); 
        renderCalendar(); 
        moveSegmentHighlighter(0); 
    } 
    
    if(pageId === 'pastHistoryPage') {
        if(typeof initHistoryDate === 'function') initHistoryDate(); 
        renderPublicStats();
    }
}

function showHistory() { 
    let currentlyOpenIds = []; const openDetails = document.querySelectorAll('.history-detail'); openDetails.forEach(el => { if (el.style.display === 'block') currentlyOpenIds.push(el.id); });
    const historyBox = document.getElementById("history-box"); // Fix
    historyBox.innerHTML = ""; 
    if(!historyOrders || historyOrders.length === 0) { historyBox.innerHTML = "<div style='padding:20px;color:#8d99ae;'>今日尚無訂單</div>"; return; } 
    let btnIcon = isHistorySimpleMode ? "📝" : "🔢"; let btnText = isHistorySimpleMode ? "切換為詳細清單" : "切換為簡化清單 (合併數量)";
    historyBox.innerHTML += `<div class="view-toggle-container"><button onclick="toggleHistoryView()" class="view-toggle-btn btn-effect"><span class="icon">${btnIcon}</span><span>${btnText}</span></button></div>`;
    let orders = getVisibleOrders(); 
    if (orders.length === 0) { historyBox.innerHTML += "<div style='padding:20px;color:#8d99ae;'>今日尚無訂單 (或已日結)</div>"; return; } 
    orders.forEach((o, index) => { 
        let seqDisplay = o.formattedSeq ? `#${o.formattedSeq}` : `#${orders.length - index}`; 
        let custInfo = (o.customerName || o.customerPhone) ? `<span style="color:#007bff; font-weight:bold;">${o.customerName||""}</span> ${o.customerPhone||""}` : "<span style='color:#ccc'>-</span>"; 
        let itemsToDisplay = isHistorySimpleMode ? getMergedItems(o.items) : o.items;
        let itemsDetail = itemsToDisplay.map(i => { let countStr = (i.count && i.count > 1) ? ` <b style="color:#ef476f;">x${i.count}</b>` : ""; let priceStr = (i.count && i.count > 1) ? `$${i.price * i.count}` : `$${i.price}`; if(i.isTreat) return `<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px dotted #eee;"><span>${i.name} (招待)${countStr}</span> <span>$0</span></div>`; return `<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px dotted #eee;"><span>${i.name}${countStr}</span> <span>${priceStr}</span></div>`; }).join("");
        let timeOnly = o.time.split(" ")[1] || o.time; let rowId = `detail-${index}`; let displayStyle = currentlyOpenIds.includes(rowId) ? "block" : "none";
        let amountDisplay = `$${o.total}`; if (o.originalTotal && o.originalTotal !== o.total) amountDisplay = `<span style="text-decoration:line-through; color:#999; font-size:12px;">$${o.originalTotal}</span> <br> <span style="color:#ef476f;">$${o.total}</span>`; 
        historyBox.innerHTML += `<div class="history-row btn-effect" onclick="window.toggleDetail('${rowId}')" style="cursor:pointer;"><span class="seq" style="font-weight:bold; color:#4361ee;">${seqDisplay}</span><span class="seat">${o.seat}</span><span class="cust">${custInfo}</span><span class="time">${timeOnly}</span><span class="amt">${amountDisplay}</span></div><div id="${rowId}" class="history-detail" style="display:${displayStyle};"><div style="background:#f8fafc; padding:15px; border-radius:0 0 12px 12px; border:1px solid #eee; border-top:none;"><b>📅 完整時間：</b>${o.time}<br><b>🧾 內容：</b><br>${itemsDetail}<div style="text-align:right; margin-top:10px; font-size:18px; font-weight:bold; color:#ef476f;">總計：$${o.total}</div><div style="text-align:right; margin-top:15px; border-top:1px solid #ddd; padding-top:10px; display:flex; justify-content:flex-end; gap:10px;"><button onclick="reprintOrder(${index})" class="print-btn btn-effect">🖨 列印明細</button><button onclick="deleteSingleOrder(${index})" class="delete-single-btn btn-effect">🗑 刪除此筆訂單</button></div></div></div>`; 
    }); 
}

function generateReport(type) { document.querySelectorAll('.report-controls button').forEach(b => b.classList.remove('active')); let now = new Date(); if (now.getHours() < 5) now.setDate(now.getDate() - 1); let start = new Date(now); let title = ""; if (type === 'day') { document.getElementById('btnDay').classList.add('active'); start.setHours(5, 0, 0, 0); let end = new Date(start); end.setDate(end.getDate() + 1); title = "💰 今日營業額 (即時)"; filterOrders(start, end, title); } else if (type === 'week') { document.getElementById('btnWeek').classList.add('active'); let day = start.getDay() || 7; if (day !== 1) start.setHours(-24 * (day - 1)); start.setHours(5, 0, 0, 0); title = "💰 本周營業額 (即時)"; filterOrders(start, new Date(), title); } else if (type === 'month') { document.getElementById('btnMonth').classList.add('active'); start.setDate(1); start.setHours(5, 0, 0, 0); title = "💰 當月營業額 (即時)"; filterOrders(start, new Date(), title); } }
function filterOrders(startTime, endTime, titleText) { let total = 0; let count = 0; let barTotal = 0; let bbqTotal = 0; let kitchenCats = ["燒烤", "主餐", "炸物"]; historyOrders.forEach(order => { let orderTime = getDateFromOrder(order); if (orderTime >= startTime && (endTime ? orderTime < endTime : true)) { total += order.total; count++; order.items.forEach(item => { let itemCat = ""; for (const [cat, content] of Object.entries(menuData)) { if (Array.isArray(content)) { if (content.some(x => item.name.includes(x.name))) itemCat = cat; } else { for (const sub of Object.values(content)) { if (sub.some(x => item.name.includes(x.name))) itemCat = cat; } } } if(itemCat === "") { if(item.name.includes("雞") || item.name.includes("豬") || item.name.includes("牛")) itemCat = "主餐"; } if (kitchenCats.includes(itemCat)) bbqTotal += item.price; else barTotal += item.price; }); } }); document.getElementById("rptTitle").innerText = titleText; document.getElementById("rptTotal").innerText = "$" + total; document.getElementById("rptCount").innerText = "總單數: " + count; document.getElementById("rptBar").innerText = "$" + barTotal; document.getElementById("rptBBQ").innerText = "$" + bbqTotal; }
function renderCalendar() { let now = new Date(); if (now.getHours() < 5) now.setDate(now.getDate() - 1); let year = now.getFullYear(); let month = now.getMonth(); document.getElementById("calendarMonthTitle").innerText = `${year}年 ${month + 1}月`; let dailyTotals = {}; historyOrders.forEach(order => { let t = getDateFromOrder(order); if (t.getHours() < 5) t.setDate(t.getDate() - 1); if (t.getFullYear() === year && t.getMonth() === month) { let dayKey = t.getDate(); if (!dailyTotals[dayKey]) dailyTotals[dayKey] = 0; dailyTotals[dayKey] += order.total; } }); let firstDay = new Date(year, month, 1).getDay(); let daysInMonth = new Date(year, month + 1, 0).getDate(); let grid = document.getElementById("calendarGrid"); grid.innerHTML = ""; for (let i = 0; i < firstDay; i++) { let empty = document.createElement("div"); empty.className = "calendar-day empty"; grid.appendChild(empty); } let today = new Date(); if(today.getHours() < 5) today.setDate(today.getDate() - 1); for (let d = 1; d <= daysInMonth; d++) { let cell = document.createElement("div"); cell.className = "calendar-day"; if (d === today.getDate() && month === today.getMonth()) cell.classList.add("today"); let revenue = dailyTotals[d] ? `$${dailyTotals[d]}` : ""; cell.innerHTML = `<div class="day-num">${d}</div><div class="day-revenue">${revenue}</div>`; grid.appendChild(cell); } }

/* ========== 公開歷史統計 (只顯示銷量) ========== */
function changeStatsMonth(offset) { historyViewDate.setMonth(historyViewDate.getMonth() + offset); renderPublicStats(); }

function renderPublicStats() {
    let year = historyViewDate.getFullYear();
    let month = historyViewDate.getMonth();
    document.getElementById("statsMonthTitle").innerText = `${year}年 ${month + 1}月`;
    
    let stats = {}; 
    historyOrders.forEach(order => {
        let t = getDateFromOrder(order);
        if (t.getHours() < 5) t.setDate(t.getDate() - 1);
        if (t.getFullYear() === year && t.getMonth() === month) {
            order.items.forEach(item => {
                let name = item.name.split(" <")[0].replace(" (招待)", "").trim();
                if (!stats[name]) stats[name] = { count: 0, type: getItemCategoryType(name) };
                stats[name].count += (item.count || 1);
            });
        }
    });

    let barList = []; let bbqList = [];
    for (let [name, data] of Object.entries(stats)) { if (data.type === 'bar') barList.push({name, count: data.count}); else bbqList.push({name, count: data.count}); }
    barList.sort((a, b) => b.count - a.count); bbqList.sort((a, b) => b.count - a.count);

    const renderList = (list, containerId) => {
        const container = document.getElementById(containerId); container.innerHTML = "";
        if(list.length === 0) { container.innerHTML = "<div style='padding:10px; color:#8d99ae;'>無資料</div>"; return; }
        list.forEach((item, index) => { container.innerHTML += `<div class="stats-item-row"><span>${index + 1}. ${item.name}</span><span class="stats-count">${item.count}</span></div>`; });
    };
    renderList(barList, 'publicStatsBar'); renderList(bbqList, 'publicStatsBbq');
}

/* ========== 機密與權限頁面邏輯 ========== */
function openOwnerLogin(mode) { sessionStorage.setItem('ownerMode', mode); if(ownerLoginModal) ownerLoginModal.style.display = "flex"; }
function closeOwnerModal() { ownerLoginModal.style.display = "none"; }
function checkOwner(name) { let password = prompt(`請輸入 ${name} 的密碼：`); if (password === OWNER_PASSWORDS[name]) { closeOwnerModal(); openConfidentialPage(name); } else { alert("❌ 密碼錯誤！"); } }

function openConfidentialPage(ownerName) { 
    hideAll(); 
    document.getElementById("confidentialPage").style.display = "block"; 
    document.getElementById("ownerWelcome").innerText = ownerName; 
    document.getElementById("financeDashboard").style.display = "none"; 
    let currentLoginMode = sessionStorage.getItem('ownerMode') || 'finance'; 
    if (currentLoginMode === 'cost') { 
        document.getElementById("costInputSection").style.display = "block"; 
        document.getElementById("financeCalendarSection").style.display = "none"; 
        document.getElementById("confidentialTitle").innerText = "成本輸入"; 
        updateFinancialPage(ownerName); 
    } else { 
        document.getElementById("costInputSection").style.display = "none"; 
        document.getElementById("financeCalendarSection").style.display = "block"; 
        document.getElementById("confidentialTitle").innerText = "財務與詳細訂單"; 
        if(typeof initHistoryDate === 'function') initHistoryDate(); 
        renderConfidentialCalendar(ownerName); 
    } 
}

function updateFinancialPage(ownerName) { const listContainer = document.getElementById("costEditorList"); listContainer.innerHTML = ""; let targetCategories = []; let canEdit = true; const barCats = ["調酒", "純飲", "shot", "啤酒", "咖啡", "飲料", "厚片", "甜點"]; const bbqCats = ["燒烤", "主餐", "炸物"]; if (ownerName === "小飛") { targetCategories = barCats; } else if (ownerName === "威志") { targetCategories = bbqCats; } else { targetCategories = [...barCats, ...bbqCats, "其他"]; } targetCategories.forEach(cat => { if (!menuData[cat]) return; let catHeader = document.createElement("div"); catHeader.className = "sub-cat-title"; catHeader.style.marginTop = "15px"; catHeader.innerText = cat; listContainer.appendChild(catHeader); let items = []; let data = menuData[cat]; if (Array.isArray(data)) { items = data; } else { Object.values(data).forEach(subList => { items = items.concat(subList); }); } items.forEach(item => { let currentPrice = itemPrices[item.name] !== undefined ? itemPrices[item.name] : item.price; let currentCost = itemCosts[item.name] !== undefined ? itemCosts[item.name] : 0; let row = document.createElement("div"); row.className = "cost-row"; row.innerHTML = `<span>${item.name}</span><input type="number" value="${currentPrice}" placeholder="售價" onchange="updateItemData('${item.name}', 'price', this.value)"><input type="number" value="${currentCost}" placeholder="成本" onchange="updateItemData('${item.name}', 'cost', this.value)">`; listContainer.appendChild(row); }); }); }

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

/* ========== 權限區：日曆與詳細訂單 ========== */
function changeOwnerMonth(offset) { historyViewDate.setMonth(historyViewDate.getMonth() + offset); let owner = document.getElementById("ownerWelcome").innerText; renderConfidentialCalendar(owner); document.getElementById("ownerOrderListSection").style.display = "none"; }

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

    historyOrders.forEach(order => { 
        let t = getDateFromOrder(order); 
        if (t.getHours() < 5) t.setDate(t.getDate() - 1); 
        if (t.getFullYear() === year && t.getMonth() === month) { 
            let dayKey = t.getDate(); 
            let dateStr = `${year}/${month+1}/${dayKey}`;
            if (!dailyFinancialData[dateStr]) dailyFinancialData[dateStr] = { barRev:0, barCost:0, bbqRev:0, bbqCost:0 }; 
            if (!dailyCounts[dayKey]) dailyCounts[dayKey] = 0;
            dailyCounts[dayKey]++;

            order.items.forEach(item => { 
                let costPerItem = getCostByItemName(item.name);
                let rawName = item.name.replace(" (招待)", "").trim(); 
                let type = getItemCategoryType(rawName); 
                if (type === 'bar') { 
                    dailyFinancialData[dateStr].barRev += item.price; dailyFinancialData[dateStr].barCost += costPerItem; 
                    monthStats.barRev += item.price; monthStats.barCost += costPerItem;
                } else { 
                    dailyFinancialData[dateStr].bbqRev += item.price; dailyFinancialData[dateStr].bbqCost += costPerItem; 
                    monthStats.bbqRev += item.price; monthStats.bbqCost += costPerItem;
                } 
            }); 
        } 
    }); 

    /* 更新右側財務總表 */
    document.getElementById("monthBarRev").innerText = `$${monthStats.barRev}`;
    document.getElementById("monthBarCost").innerText = `-$${monthStats.barCost}`;
    document.getElementById("monthBarProfit").innerText = `$${monthStats.barRev - monthStats.barCost}`;
    
    document.getElementById("monthBbqRev").innerText = `$${monthStats.bbqRev}`;
    document.getElementById("monthBbqCost").innerText = `-$${monthStats.bbqCost}`;
    document.getElementById("monthBbqProfit").innerText = `$${monthStats.bbqRev - monthStats.bbqCost}`;

    let totalRev = monthStats.barRev + monthStats.bbqRev;
    let totalCost = monthStats.barCost + monthStats.bbqCost;
    document.getElementById("monthTotalRev").innerText = `$${totalRev}`;
    document.getElementById("monthTotalCost").innerText = `-$${totalCost}`;
    document.getElementById("monthTotalProfit").innerText = `$${totalRev - totalCost}`;

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
            htmlContent += `<div style="font-size:12px; color:#4361ee; font-weight:bold;">$${showRev}</div>`;
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

    let now = new Date();
    if (now.getHours() < 5) now.setDate(now.getDate() - 1); 
    let start = new Date(now);
    let end = null;
    let titleText = "";

    if (range === 'day') {
        start.setHours(5, 0, 0, 0);
        end = new Date(start);
        end.setDate(end.getDate() + 1);
        titleText = "🏠 全店總計 (今日)";
    } else if (range === 'week') {
        let day = start.getDay() || 7; 
        start.setHours(-24 * (day - 1));
        start.setHours(5, 0, 0, 0);
        end = new Date();
        titleText = "🏠 全店總計 (本周)";
    } else if (range === 'month') {
        start.setDate(1);
        start.setHours(5, 0, 0, 0);
        end = new Date();
        titleText = "🏠 全店總計 (本月)";
    }

    let stats = { barRev: 0, barCost: 0, bbqRev: 0, bbqCost: 0 };

    historyOrders.forEach(order => {
        let t = getDateFromOrder(order);
        if (t.getHours() < 5) t.setDate(t.getDate() - 1);

        if (t >= start && (!end || t < end)) {
            order.items.forEach(item => {
                let cost = getCostByItemName(item.name);
                let name = item.name.replace(" (招待)", "").trim();
                let type = getItemCategoryType(name);
                
                if (type === 'bar') { stats.barRev += item.price; stats.barCost += cost; }
                else { stats.bbqRev += item.price; stats.bbqCost += cost; }
            });
        }
    });

    document.getElementById("financeTitle").innerText = titleText; 

    document.getElementById("monthBarRev").innerText = `$${stats.barRev}`;
    document.getElementById("monthBarCost").innerText = `-$${stats.barCost}`;
    document.getElementById("monthBarProfit").innerText = `$${stats.barRev - stats.barCost}`;
    
    document.getElementById("monthBbqRev").innerText = `$${stats.bbqRev}`;
    document.getElementById("monthBbqCost").innerText = `-$${stats.bbqCost}`;
    document.getElementById("monthBbqProfit").innerText = `$${stats.bbqRev - stats.bbqCost}`;

    let totalRev = stats.barRev + stats.bbqRev;
    let totalCost = stats.barCost + stats.bbqCost;
    document.getElementById("monthTotalRev").innerText = `$${totalRev}`;
    document.getElementById("monthTotalCost").innerText = `-$${totalCost}`;
    document.getElementById("monthTotalProfit").innerText = `$${totalRev - totalCost}`;
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
        let summary = o.items.map(i => { let n = i.name; if(i.count>1) n+=` x${i.count}`; if(i.isTreat) n+=` (招待)`; return n; }).join("、");
        
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

function showToast(message) { const toast = document.getElementById("toast-container"); toast.innerText = message; toast.style.opacity = "1"; setTimeout(() => { toast.style.opacity = "0"; }, 2500); }
function closeSummaryModal() { summaryModal.style.display = "none"; }
window.toggleDetail = function(id) { let el = document.getElementById(id); if (el.style.display === "none") { el.style.display = "block"; } else { el.style.display = "none"; } };
window.toggleAccordion = function(id) { let el = document.getElementById(id); if(!el) return; let btn = el.previousElementSibling; el.classList.toggle("show"); if (btn) btn.classList.toggle("active"); };

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
            if(tableCarts[selectedTable]) { cart = tableCarts[selectedTable]; renderCart(); }
        }, 800);
    } else { if(sessionStorage.getItem("isLoggedIn") === "true") { showApp(); } }
});