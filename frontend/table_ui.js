
/* table_ui.js - 桌位與訂單卡片渲染及拖曳邏輯 (v13) */
console.log("Table UI JS v13 Loaded - 桌位互動已載入");

let draggedOrderId = null;

// -------------------------------------------------------------
// I. 渲染核心
// -------------------------------------------------------------

/**
 * 渲染桌位網格和訂單卡片 (由 ui.js 呼叫)
 */
function renderTableGrid() { 
    const grid = document.getElementById("tableSelectGrid"); 
    const standbyContainer = document.getElementById("standbyOrdersContainer");
    if (!grid || !standbyContainer) return;

    const ordersByTable = {}; // { "A1": [orderId1, orderId2, ...], "暫存": [...] }

    // 1. 初始化 ordersByTable
    tables.forEach(t => ordersByTable[t] = []);
    ordersByTable['暫存'] = [];
    ordersByTable['外帶'] = [];

    // 2. 根據 tableOrders 歸類訂單
    Object.keys(tableOrders).forEach(orderId => {
        const order = tableOrders[orderId];
        const seat = order.seat || '暫存';
        if (ordersByTable[seat]) {
            ordersByTable[seat].push(orderId);
        } else {
            // 對應到不存在的桌號，歸類到暫存區
            ordersByTable['暫存'].push(orderId);
        }
    });

    // 3. 清空並重建網格
    grid.innerHTML = ""; 
    standbyContainer.innerHTML = "";

    // 4. 渲染常規桌位
    tables.forEach(t => { 
        const btn = document.createElement("div"); 
        btn.className = "tableBtn table-container"; 
        btn.setAttribute('data-table-id', t);
        btn.ondrop = (event) => dropToTable(event, t);
        btn.ondragover = allowDrop;

        let totalOrders = ordersByTable[t].length;
        let statusClass = "status-white";
        
        if (totalOrders > 0) {
            statusClass = "status-yellow"; // 有訂單即視為使用中
        }

        btn.classList.add(statusClass); 
        btn.innerHTML = `<b class="table-name">${t}</b><div class="order-list-container" id="orderList-${t}"></div>`; 

        // 渲染訂單卡片到該桌的 order-list-container
        const orderListContainer = btn.querySelector('.order-list-container');
        if (ordersByTable[t].length > 0) {
            ordersByTable[t].forEach(orderId => {
                orderListContainer.appendChild(createOrderCard(orderId));
            });
        }
        
        // 新增快速開單按鈕
        const addBtn = document.createElement('div');
        addBtn.className = 'add-order-btn btn-effect';
        addBtn.innerHTML = '＋';
        addBtn.onclick = () => createNewOrder(t);
        
        btn.appendChild(addBtn);
        grid.appendChild(btn); 
    }); 
    
    // 5. 渲染暫存區訂單 (包括外帶和真正的暫存)
    const standbyOrderIds = ordersByTable['暫存'].concat(ordersByTable['外帶']);
    standbyOrderIds.forEach(orderId => {
        standbyContainer.appendChild(createOrderCard(orderId));
    });
}


/**
 * 創建單一訂單卡片元素
 * @param {string} orderId 
 * @returns {HTMLElement}
 */
function createOrderCard(orderId) {
    const order = tableOrders[orderId];
    if (!order) return document.createElement('div');
    
    const card = document.createElement('div');
    card.className = 'order-card';
    card.id = `order-${orderId}`;
    card.draggable = true;
    card.setAttribute('data-order-id', orderId);

    // 計算總價和品項數量
    const totalItems = (order.items || []).length;
    const totalPrice = (order.items || []).reduce((sum, item) => sum + (item.isTreat ? 0 : item.price), 0);
    
    // 計算未送出數量
    const unsentCount = (order.unsentItems || []).length;
    
    let timeDisplay = order.startTime ? Math.floor((Date.now() - order.startTime) / 60000) + 'm' : '新單';

    card.innerHTML = `
        <div class="card-header">
            <span class="order-id">#${orderId.replace('T', '')}</span>
            <span class="order-seat">${order.seat}</span>
            <span class="order-time">⏳ ${timeDisplay}</span>
        </div>
        <div class="card-body">
            <div class="card-info">
                <span>品項: ${totalItems}</span>
                <span>總價: <b>$${totalPrice}</b></span>
            </div>
            ${unsentCount > 0 ? `<div class="new-badge">未送出: ${unsentCount}</div>` : ''}
        </div>
    `;

    // 設置事件監聽器
    card.onclick = () => openOrderPage(orderId, order.seat);
    card.ondragstart = dragStartOrder;
    card.ondrop = (event) => dropToOrderCard(event, orderId); // 處理合併
    card.ondragover = allowDrop;
    
    // 根據未送出狀態添加視覺提示
    if (unsentCount > 0) {
        card.style.borderColor = var(--danger-color);
        card.style.borderLeft = `5px solid var(--danger-color)`;
    }

    return card;
}


// -------------------------------------------------------------
// II. 拖曳操作邏輯
// -------------------------------------------------------------

/**
 * 拖曳開始
 */
function dragStartOrder(event) {
    draggedOrderId = event.target.getAttribute('data-order-id');
    event.dataTransfer.setData("text/plain", draggedOrderId);
    event.dataTransfer.effectAllowed = "move";
    event.target.classList.add('dragging');
}

/**
 * 允許拖曳
 */
function allowDrop(event) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
}

/**
 * 拖曳到桌位容器上 (換桌) (呼叫 order_logic.js)
 */
function dropToTable(event, newTableId) {
    event.preventDefault();
    const orderId = event.dataTransfer.getData("text/plain");
    
    if (orderId && orderId !== draggedOrderId) return; 

    if (draggedOrderId && typeof moveOrderToTable === 'function') {
        moveOrderToTable(draggedOrderId, newTableId);
        draggedOrderId = null;
    }
}

/**
 * 拖曳到暫存區 (呼叫 order_logic.js)
 */
function dropToStandby(event) {
    event.preventDefault();
    const orderId = event.dataTransfer.getData("text/plain");
    
    if (orderId && orderId !== draggedOrderId) return;

    if (draggedOrderId && typeof moveOrderToTable === 'function') {
        // 將訂單座位設為 '暫存'
        moveOrderToTable(draggedOrderId, '暫存');
        draggedOrderId = null;
    }
}

/**
 * 拖曳到另一個訂單卡片上 (合併) (呼叫 order_logic.js)
 */
function dropToOrderCard(event, targetOrderId) {
    event.preventDefault();
    const sourceOrderId = event.dataTransfer.getData("text/plain");

    if (sourceOrderId && targetOrderId && sourceOrderId !== targetOrderId) {
        if(typeof mergeOrders === 'function') {
            mergeOrders(sourceOrderId, targetOrderId);
            draggedOrderId = null;
        }
    }
}
