/* order_logic.js - 訂單管理核心邏輯 (v13: 支援獨立訂單卡片) */
console.log("Order Logic JS v13 Loaded - 訂單管理核心已載入");

let currentTableId = null;
let currentOrderId = null; // 當前正在編輯的訂單 ID

// -------------------------------------------------------------
// I. 訂單生命週期操作
// -------------------------------------------------------------

/**
 * 根據 ID 載入指定訂單至購物車，並切換到訂餐頁面 (由 table_ui 呼叫)
 * @param {string} orderId - 訂單的唯一 ID
 * @param {string} tableId - 訂單所在的桌號
 */
function openOrderPage(orderId, tableId) {
    if (!orderId || !tableOrders[orderId]) {
        console.error("嘗試開啟不存在的訂單:", orderId);
        return;
    }
    
    currentOrderId = orderId;
    currentTableId = tableId;
    const order = tableOrders[orderId];
    
    // 1. 設置全域狀態
    selectedOrderId = orderId;
    // 將 sentItems 和 unsentItems 合併到購物車，以供編輯
    cart = (order.sentItems || []).concat(order.unsentItems || []); 
    
    // 2. 渲染訂餐頁面
    hideAll();
    document.getElementById("orderPage").style.display = "block";
    
    // 3. 更新訂單資訊欄位
    document.getElementById("orderIdLabel").innerText = `#${orderId.replace('T', '')}`;
    document.getElementById("seatLabel").innerText = `(${tableId || '暫存'})`;
    document.getElementById("custName").value = order.customerName || "";
    document.getElementById("custPhone").value = order.customerPhone || "";
    
    // 4. 啟動計時器 (如果開始時間存在)
    if (order.startTime) {
        startSeatTimerDisplay(order.startTime);
    } else {
        clearSeatTimer();
    }
    
    // 5. 渲染菜單和購物車
    buildCategories(); 
    renderCart();
}

/**
 * 創建一張新的空白訂單 (用於外帶或空桌開單) (由 index.html 呼叫)
 * @param {string} seat - 桌號 (或 '外帶', '暫存')
 */
function createNewOrder(seat = '暫存') {
    // 確保 ID 是最新的
    lastOrderId = lastOrderId || Object.keys(tableOrders).length;
    lastOrderId++; 
    const newId = `T${lastOrderId}`;
    
    const newOrder = {
        orderId: newId,
        seat: seat,
        customerName: "",
        customerPhone: "",
        startTime: (seat !== '暫存' && seat !== '外帶') ? Date.now() : null, // 實體桌位才計時
        isServiceFeeEnabled: false,
        discount: { type: 'none', value: 0 },
        items: [], // 總品項列表 (兼容舊邏輯)
        sentItems: [], // 客人已下單/員工已出單的品項
        unsentItems: [], // 待操作的品項 (當前購物車)
        status: 'new'
    };

    tableOrders[newId] = newOrder;
    saveAllToCloud();
    openOrderPage(newId, seat);
}

/**
 * 員工手動儲存/更新訂單內容 (取代 saveOrderManual)
 * 將 cart 內容保存到 order.unsentItems 或 sentItems
 */
function updateOrderManual(isCheckout = false) {
    if (!currentOrderId || !tableOrders[currentOrderId]) {
        showToast("錯誤：請先選擇或建立訂單。");
        return;
    }

    const order = tableOrders[currentOrderId];
    const itemsToPrint = []; // 僅列印新增或有變動的品項
    
    // 1. 處理未送出的品項
    const newUnsentItems = [];
    cart.forEach(item => {
        // 只有 isNew=true 的才視為待列印的新品項
        if (item.isNew && !item.isSent) { 
            itemsToPrint.push(item);
        }
        
        // 將所有購物車中的品項視為 unsentItems，但保留其 ID
        newUnsentItems.push({ 
            name: item.name, 
            price: item.price, 
            isTreat: item.isTreat, 
            batchIdx: item.batchIdx,
            id: item.id
        });
    });

    // 2. 更新訂單資訊和狀態
    order.customerName = document.getElementById("custName").value;
    order.customerPhone = document.getElementById("custPhone").value;
    order.isServiceFeeEnabled = isServiceFeeEnabled;
    order.discount = currentDiscount;
    order.status = 'occupied'; 
    
    // 3. 執行列印 (僅列印新加入的品項)
    if (itemsToPrint.length > 0 && !isCheckout) {
        printReceipt({ 
            seq: currentOrderId, 
            table: order.seat, 
            time: new Date().toLocaleString('zh-TW', { hour12: false }), 
            items: itemsToPrint, 
            original: 0, total: 0 
        }, true);
    }

    // 4. 合併 Items: 將 unsentItems 轉為 sentItems，並清空購物車
    const newlySent = newUnsentItems.map(item => ({...item, isSent: true, isNew: false}));
    
    order.sentItems = (order.sentItems || []).concat(newlySent);
    order.unsentItems = [];
    
    // 更新總品項列表 (兼容舊的計算邏輯)
    order.items = order.sentItems;
    cart = []; // 清空緩衝購物車
    
    tableOrders[currentOrderId] = order;

    saveAllToCloud();
    showToast(`✔ 訂單 #${currentOrderId.replace('T', '')} 已儲存並出單！`);
    
    // 如果不是結帳流程，則返回桌位選擇頁
    if (!isCheckout) {
        openTableSelect();
    }
}

/**
 * 刪除當前編輯中的訂單
 */
function deleteCurrentOrder() {
    if (!currentOrderId || !tableOrders[currentOrderId]) {
        return;
    }
    
    if (confirm(`⚠️ 確定要刪除訂單 #${currentOrderId.replace('T', '')} 嗎？此操作無法復原。`)) {
        delete tableOrders[currentOrderId];
        saveAllToCloud();
        showToast(`🗑️ 訂單 #${currentOrderId.replace('T', '')} 已刪除！`);
        openTableSelect();
    }
}

/**
 * 儲存折扣與服務費設定
 */
function saveOrderDiscount(orderId, discount, svc) {
    if (tableOrders[orderId]) {
        tableOrders[orderId].discount = discount;
        tableOrders[orderId].isServiceFeeEnabled = svc;
        saveAllToCloud();
    }
}


// -------------------------------------------------------------
// II. 結帳與歸檔
// -------------------------------------------------------------

/**
 * 結帳並歸檔訂單 (取代 checkoutAll)
 * @param {string} orderId 
 * @param {number} finalAmount 
 */
function checkoutOrder(orderId, finalAmount) {
    const order = tableOrders[orderId];
    if (!order) return;
    
    if (order.unsentItems && order.unsentItems.length > 0) {
        showToast("請先儲存未送出的品項再結帳！");
        return;
    }

    const total = finalAmount;
    const items = order.items || [];
    const originalTotal = items.reduce((sum, item) => sum + (item.isTreat ? 0 : item.price), 0);
    const time = new Date().toLocaleString('zh-TW', { hour12: false });
    
    // 1. 生成歷史訂單物件
    const newOrder = { 
        seat: order.seat, 
        formattedSeq: orderId.replace('T', ''), // 存入不帶 T 的數字單號
        time: time, 
        timestamp: Date.now(), 
        items: items.map(item => ({...item, count: item.count || 1})), 
        total: total, 
        originalTotal: originalTotal, 
        customerName: order.customerName, 
        customerPhone: order.customerPhone, 
        isClosed: true 
    };

    // 2. 歸檔並儲存
    historyOrders.push(newOrder); 
    localStorage.setItem("orderHistory", JSON.stringify(historyOrders)); 
    
    // 3. 從 tableOrders 刪除訂單
    delete tableOrders[orderId];
    
    saveAllToCloud(); 
    
    // 4. 清理狀態並返回
    selectedOrderId = null;
    cart = []; 
    currentDiscount = { type: 'none', value: 0 }; 
    isServiceFeeEnabled = false;
    
    alert(`💰 結帳完成！訂單 #${orderId.replace('T', '')} 實收 $${finalAmount}`); 
    openTableSelect();
}


// -------------------------------------------------------------
// III. 拖曳操作 (供 table_ui.js 呼叫)
// -------------------------------------------------------------

/**
 * 處理拖曳換桌操作
 * @param {string} orderId - 被拖曳的訂單 ID
 * @param {string} newTableId - 拖曳目標的桌號
 */
function moveOrderToTable(orderId, newTableId) {
    if (!tableOrders[orderId]) return;
    
    const oldTableId = tableOrders[orderId].seat;
    if (oldTableId === newTableId) return;

    tableOrders[orderId].seat = newTableId;
    
    // 重新計時 (如果原本是暫存單或外帶單)
    if (tableOrders[orderId].startTime === null && newTableId !== '暫存' && newTableId !== '外帶') {
        tableOrders[orderId].startTime = Date.now();
    }

    saveAllToCloud();
    showToast(`✔ 訂單 #${orderId.replace('T', '')} 已成功換至 ${newTableId}`);
    renderTableGrid(); // 重新渲染桌位
}

/**
 * 處理訂單合併操作
 * @param {string} sourceOrderId - 被拖曳的訂單 ID (將被刪除)
 * @param {string} targetOrderId - 拖曳目標的訂單 ID (接收品項)
 */
function mergeOrders(sourceOrderId, targetOrderId) {
    if (sourceOrderId === targetOrderId || !tableOrders[sourceOrderId] || !tableOrders[targetOrderId]) return;

    if (!confirm(`⚠️ 確定要將訂單 #${sourceOrderId.replace('T', '')} 的所有品項合併到訂單 #${targetOrderId.replace('T', '')} 嗎？\n(訂單 #${sourceOrderId.replace('T', '')} 將會被刪除)`)) {
        return;
    }

    const sourceOrder = tableOrders[sourceOrderId];
    const targetOrder = tableOrders[targetOrderId];

    // 1. 合併 Items (SentItems 和 UnsentItems 都併入)
    const sourceAllItems = (sourceOrder.sentItems || []).concat(sourceOrder.unsentItems || []);
    
    targetOrder.sentItems = (targetOrder.sentItems || []).concat(sourceOrder.sentItems || []);
    targetOrder.unsentItems = (targetOrder.unsentItems || []).concat(sourceOrder.unsentItems || []);
    targetOrder.items = targetOrder.items.concat(sourceAllItems); // 兼容舊邏輯

    // 2. 簡單處理客戶資訊 (取第一個非空的名字/電話)
    if (!targetOrder.customerName && sourceOrder.customerName) {
        targetOrder.customerName = sourceOrder.customerName;
    }

    // 3. 刪除來源訂單
    delete tableOrders[sourceOrderId];
    
    // 4. 更新目標訂單 (狀態不變)
    tableOrders[targetOrderId] = targetOrder;

    // 5. 清理當前編輯狀態 (如果被合併的是當前訂單)
    if (selectedOrderId === sourceOrderId) {
        selectedOrderId = targetOrderId;
        cart = targetOrder.items; // 重新載入合併後的購物車
    }
    
    saveAllToCloud();
    showToast(`✅ 訂單 #${sourceOrderId.replace('T', '')} 已成功合併至 #${targetOrderId.replace('T', '')}！`);
    renderTableGrid(); // 重新渲染桌位
}


// -------------------------------------------------------------
// IV. 客人模式 (簡化，主要功能在 UI)
// -------------------------------------------------------------

/**
 * 客人提交訂單 (取代 customerSubmitOrder)
 * @param {string} tableId - 客人所在的桌號
 */
function customerSubmitOrder(tableId) {
    if (cart.length === 0) { alert("購物車是空的喔！"); return; }
    
    // 這裡我們仍然把客人的新單傳給 incomingOrders，由櫃檯確認後才能建立新的 tableOrders
    let currentBatch = tableBatchCounts[tableId] || 0;
    let nextBatch = currentBatch + 1;
    let batchColorIdx = (nextBatch - 1) % 3;

    let itemsToSend = cart.map(item => ({
        ...item,
        isNew: true,
        batchIdx: batchColorIdx,
        count: item.count || 1 // 客人模式預設都是單個品項
    }));

    let customerInfo = {
        name: document.getElementById("custName").value || "",
        phone: document.getElementById("custPhone").value || ""
    };

    db.ref(`incomingOrders/${tableId}`).set({
        items: itemsToSend,
        customer: customerInfo,
        batchId: nextBatch,
        timestamp: Date.now()
    }).then(() => {
        alert("✅ 點餐成功！\n\n您的訂單已傳送至櫃台，\n服務人員確認後將為您準備餐點。");
        
        // 客人端清空購物車
        cart = [];
        renderCart();
    }).catch(err => {
        alert("傳送失敗，請通知服務人員：" + err.message);
    });
}

/**
 * 櫃檯確認接單 (取代 confirmIncomingOrder)
 */
function confirmIncomingOrder() {
    if (!currentIncomingTable) return;
    
    let pendingData = incomingOrders[currentIncomingTable];
    if (!pendingData) return;

    let items = pendingData.items || [];
    let cust = pendingData.customer || {};
    const tableId = currentIncomingTable;

    // 1. 檢查是否有該桌的訂單，如果沒有，就創建一張
    const existingOrder = Object.values(tableOrders).find(o => o.seat === tableId);
    let targetOrderId;
    
    if (existingOrder) {
        targetOrderId = existingOrder.orderId;
    } else {
        lastOrderId++;
        targetOrderId = `T${lastOrderId}`;
        tableOrders[targetOrderId] = {
            orderId: targetOrderId,
            seat: tableId,
            customerName: cust.name || "",
            customerPhone: cust.phone || "",
            startTime: Date.now(),
            isServiceFeeEnabled: false,
            discount: { type: 'none', value: 0 },
            items: [],
            sentItems: [], 
            unsentItems: [],
            status: 'occupied'
        };
    }
    
    const targetOrder = tableOrders[targetOrderId];

    // 2. 合併新訂單品項到 targetOrder.sentItems (已出單)
    const newSentItems = items.map(item => ({ 
        name: item.name, 
        price: item.price, 
        isTreat: item.isTreat, 
        batchIdx: item.batchIdx,
        id: Date.now() + Math.random() // 確保唯一 ID
    }));
    
    targetOrder.sentItems = (targetOrder.sentItems || []).concat(newSentItems);
    targetOrder.items = (targetOrder.items || []).concat(newSentItems); // 兼容舊的計算邏輯
    
    // 3. 列印工作單 (只印新來的品項)
    printReceipt({ 
        seq: targetOrderId, 
        table: targetOrder.seat, 
        time: new Date().toLocaleString('zh-TW', { hour12: false }), 
        items: items, 
        original: 0, total: 0 
    }, true);

    // 4. 清理 incomingOrders
    delete incomingOrders[currentIncomingTable];

    saveAllToCloud();
    closeIncomingOrderModal();
    showToast(`✅ 已接收 ${currentIncomingTable} 的網路訂單 #${targetOrderId.replace('T', '')}`);
    renderTableGrid();
}
