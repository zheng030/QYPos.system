/* ui.js - 介面渲染與事件處理 (v20: 終極完整版 - 修正列印和功能載入) */
console.log("UI JS v20 Loaded - 介面程式已載入");

let monthlyReportData = {}; // 用於儲存月報表的每日數據

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

function openPage(pageId) {
    hideAll();
    document.getElementById(pageId).style.display = "block";
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

function openProductPage() {
    hideAll();
    document.getElementById("productPage").style.display = "block";
    // renderProductManagement(); // 依賴其他未提供程式碼
}

/* ========== QR Code 模式控制 ========== */
// const originalOpenOrderPage = openOrderPageLogic;  // 這行似乎是舊程式碼註解，不需要

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

/* ========== 🔥 顯示邏輯 (與 logic.js 同步，確保 UI 渲染正確) ========== */
// 由於 logic.js 中已經有一個完整的 renderCart 邏輯，這裡為了避免重複定義，使用 logic.js 的版本
// 但為了相容性，保留原本的 function 名稱
// function renderCart() {...} - 已經在 logic.js 中定義

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
            htmlContent += `<div style="font-size:12px; color:#4361ee; font-weight:bold;">$${showRev.toLocaleString('zh-TW')}</div>`;
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

// 新增列印功能 (ui.js)
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

    const title = isKitchenTicket ? '🔔 廚房/吧檯出單' : '🧾 消費明細';
    const totalLine = isKitchenTicket ? '' : `<div style="border-top:1px dashed black; margin-top:10px; padding-top:10px; font-size:18px; font-weight:bold;">總計: $${order.total}</div>`;

    let itemHtml = '';
    itemsToPrint.forEach(item => {
        let itemName = item.name.replace("<small style='color:#06d6a0'>[買5送1]</small>", "").trim();
        // 確保列印時的單價和總價是正確的
        let itemPrice = item.isTreat ? 0 : item.price; 
        let itemQty = item.count || 1;
        let itemTotal = item.isTreat ? '0' : `$${itemPrice * itemQty}`;
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
        

        itemHtml += `
            <div style="display:flex; justify-content:space-between; font-size:14px; margin-bottom:5px;">
                <span style="flex-grow:1; max-width:150px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; text-align:left;">${itemName} ${item.isTreat ? ' (招待)' : ''}</span>
                <span style="width:30px; text-align:center;">x${itemQty}</span>
                <span style="width:50px; text-align:right;">${itemTotal}</span>
            </div>
            ${itemNote ? `<div style="font-size:12px; color:#555; margin-left:10px; text-align:left;">${itemNote.replace(/<br>/g, ' ')}</div>` : ''}
        `;
    });

    const receiptHtml = `
        <div style="width:280px; margin:0 auto; padding:10px; text-align:center;">
            <h1 style="font-size:20px; margin-bottom:5px;">${title}</h1>
            <p style="font-size:14px; margin:5px 0;">桌號: ${order.table} | 單號: ${order.seq}</p>
            <p style="font-size:12px; margin:5px 0 10px 0;">時間: ${order.time}</p>
            <div style="border-top:1px dashed black; padding-top:10px;">
                ${itemHtml}
            </div>
            ${totalLine}
            ${isKitchenTicket ? '' : `<div style="margin-top:15px; font-size:12px;">謝謝您的惠顧！</div>`}
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

/* ========== 這裡是最重要的修正區域 ========== */
/* 在 DOMContentLoaded 監聽器中，加入 buildCategories() 呼叫 */
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
            
            // 從資料庫讀取該桌所有點餐紀錄
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
