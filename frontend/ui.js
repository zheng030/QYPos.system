/* ui.js - 介面渲染與事件處理 (v15) */

console.log("UI JS v15 Loaded - 介面程式已載入");

let revenueDetails = { bar: [], bbq: [], unknown: [], extra: [] };

async function ensureSubscriptions(roots) {
	if (typeof ensureDataSubscriptions === "function") {
		await ensureDataSubscriptions(roots);
	}
}

function showApp(options = {}) {
	const { skipHome = false } = options;
	document.getElementById("login-screen").style.display = "none";
	document.getElementById("app-container").style.display = "block";
	initRealtimeData();
	if (!skipHome) goHome();
}

function hideAll() {
	[
		"home",
		"orderPage",
		"historyPage",
		"tableSelect",
		"reportPage",
		"confidentialPage",
		"settingsPage",
		"pastHistoryPage",
		"productPage",
		"itemStatsPage",
	].forEach((id) => {
		let el = document.getElementById(id);
		if (el) el.style.display = "none";
	});
	if (seatTimerInterval) clearInterval(seatTimerInterval);
}

function goHome() {
	hideAll();
	document.getElementById("home").style.display = "grid";
}

async function openTableSelect() {
	hideAll();
	await ensureSubscriptions([
		"tableTimers",
		"tableCarts",
		"tableStatuses",
		"tableCustomers",
		"tableSplitCounters",
		"tableBatchCounts",
	]);
	refreshData();
	document.getElementById("tableSelect").style.display = "block";
	renderTableGrid();
}

async function openSettingsPage() {
	hideAll();
	await ensureSubscriptions(["ownerPasswords"]);
	document.getElementById("settingsPage").style.display = "block";
}

async function openProductPage() {
	hideAll();
	await ensureSubscriptions(["inventory"]);
	document.getElementById("productPage").style.display = "block";
	renderProductManagement();
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

	const baseUrl = window.location.href.split("?")[0];
	const orderUrl = `${baseUrl}?table=${encodeURIComponent(table)}`;

	new QRCode(qrContainer, { text: orderUrl, width: 200, height: 200 });

	modal.style.display = "flex";
}

function closeQrModal() {
	document.getElementById("qrCodeModal").style.display = "none";
}

/* ========== 🔥 待確認訂單彈窗 ========== */
function showIncomingOrderModal(table, orderData) {
	currentIncomingTable = table;
	const modal = document.getElementById("incomingOrderModal");
	document.getElementById("incomingTableTitle").innerText = `桌號：${table}`;

	const list = document.getElementById("incomingList");
	list.innerHTML = "";

	if (orderData.items) {
		orderData.items.forEach((item) => {
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
	if (!grid) return;
	grid.innerHTML = "";
	tables.forEach((t) => {
		let btn = document.createElement("div");
		btn.className = "tableBtn btn-effect";
		let status = tableStatuses[t];
		let cartData = tableCarts[t];
		let hasCart = false;
		if (Array.isArray(cartData)) {
			hasCart = cartData.length > 0;
		} else if (cartData && typeof cartData === "object") {
			hasCart = Object.keys(cartData).length > 0;
		}
		if (status !== "yellow" && !hasCart && tableTimers[t]) {
			delete tableTimers[t];
			saveAllToCloud({ [`tableTimers/${t}`]: null });
		}
		if (status === "yellow" && !hasCart) {
			delete tableTimers[t];
			delete tableStatuses[t];
			delete tableCarts[t];
			delete tableCustomers[t];
			delete tableSplitCounters[t];
			delete tableBatchCounts[t];
			saveAllToCloud({
				[`tableTimers/${t}`]: null,
				[`tableStatuses/${t}`]: null,
				[`tableCarts/${t}`]: null,
				[`tableCustomers/${t}`]: null,
				[`tableSplitCounters/${t}`]: null,
				[`tableBatchCounts/${t}`]: null,
			});
			status = null;
		}

		if (status === "red") {
			btn.classList.add("status-red");
			btn.innerHTML = `<b>${t}</b>`;
		} else if (status === "yellow") {
			btn.classList.add("status-yellow");
			btn.innerHTML = `<b>${t}</b>`;
		} else {
			btn.classList.add("status-white");
			btn.innerHTML = `<b>${t}</b><br><span style="font-size:14px;">(空桌)</span>`;
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

async function openOrderPageLogic(table) {
	selectedTable = table;
	document.getElementById("seatLabel").innerHTML = "（" + table + "）";
	hideAll();
	document.getElementById("orderPage").style.display = "block";
	await ensureSubscriptions(["inventory", "itemPrices"]);
	await ensureSubscriptions([
		"tableTimers",
		"tableCarts",
		"tableStatuses",
		"tableCustomers",
		"tableSplitCounters",
		"tableBatchCounts",
	]);

	if (tableTimers[table]) startSeatTimerDisplay();
	else {
		document.getElementById("seatTimer").innerText = "⏳ 尚未計時";
		if (seatTimerInterval) clearInterval(seatTimerInterval);
	}

	cart = tableCarts[table] || [];
	entryCartSignature = JSON.stringify(cart || []);
	let info = tableCustomers[table] || { name: "", phone: "" };

	document.getElementById("custName").value = info.name || "";
	document.getElementById("custPhone").value = info.phone || "";

	currentDiscount = { type: "none", value: 0 };
	isServiceFeeEnabled = false;

	// 如果是從後台進入，清空已送出暫存，避免混淆
	if (!document.body.classList.contains("customer-mode")) {
		sentItems = [];
		sessionStorage.removeItem("sentItems");
	}

	buildCategories();
	renderCart();
}

function startSeatTimerDisplay() {
	updateSeatTimerText();
	seatTimerInterval = setInterval(updateSeatTimerText, 1000);
}
function updateSeatTimerText() {
	let startTime = tableTimers[selectedTable];
	if (!startTime) return;
	let diff = Math.floor((Date.now() - startTime) / 1000);
	let h = Math.floor(diff / 3600)
		.toString()
		.padStart(2, "0");
	let m = Math.floor((diff % 3600) / 60)
		.toString()
		.padStart(2, "0");
	let s = (diff % 60).toString().padStart(2, "0");
	document.getElementById("seatTimer").innerText = `⏳ 已入座：${h}:${m}:${s}`;
}

function buildCategories() {
	const grid = document.getElementById("menuGrid");
	grid.innerHTML = "";

	if (typeof categories === "undefined") return;

	let listToRender = categories;
	if (document.body.classList.contains("customer-mode")) {
		listToRender = categories.filter((c) => c !== "甜點" && c !== "其他");
	}

	listToRender.forEach((c) => {
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

		let isSoldOut =
			inventory[item.name] === false || !hasAvailableVariants(item.name);
		if (isSoldOut) itemClass += " sold-out";

		if (item.name === "隱藏啤酒") {
			nameHtml = `<span style="font-weight:bold; color:var(--primary-color);">🍺 隱藏啤酒</span>`;
			actionsHtml = `<input id="hbName" class="inline-input" placeholder="品名" style="width:100px;"><input type="number" id="hbPrice" class="inline-input" placeholder="時價" style="width:70px;"><button onclick="addInlineHiddenBeer()">加入</button>`;
		} else {
			actionsHtml = `<button onclick='checkItemType("${item.name}", ${item.price}, "${category}")'>加入</button>`;
			if (category === "shot") {
				actionsHtml += `<button onclick='addShotSet("${item.name}", ${item.price})' class="set-btn btn-effect" style="margin-left:5px; background:var(--secondary-color);">🔥 一組</button>`;
			}
		}
		return `<div class="${itemClass}">${nameHtml}<div class="shot-actions">${actionsHtml}</div></div>`;
	};

	const flatListCategories = [
		"純飲",
		"shot",
		"啤酒",
		"咖啡",
		"飲料",
		"主餐",
		"炸物",
		"厚片",
		"甜點",
		"其他",
	];
	let html = backBtn;
	const grid = document.getElementById("menuGrid");

	if (Array.isArray(data)) {
		if (flatListCategories.includes(category)) {
			html += `<div class="sub-cat-title">${category}</div>`;
			data.forEach((item) => {
				html += createItemHtml(item, true);
			});
		} else {
			data.forEach((item) => {
				html += createItemHtml(item, true);
			});
		}
	} else {
		Object.keys(data).forEach((subCat, index) => {
			let items = data[subCat];
			if (flatListCategories.includes(category)) {
				html += `<div class="sub-cat-title">${subCat}</div>`;
				items.forEach((item) => {
					html += createItemHtml(item, true);
				});
			} else {
				let accId = `acc-${index}`;
				html += `<button class="accordion-header btn-effect" onclick="toggleAccordion('${accId}')">${subCat} <span class="arrow">▼</span></button><div id="${accId}" class="accordion-content">`;
				items.forEach((item) => {
					html += createItemHtml(item, false);
				});
				html += `</div>`;
			}
		});
	}
	grid.innerHTML = html;
}

function toggleCartView() {
	isCartSimpleMode = !isCartSimpleMode;
	renderCart();
}
function toggleServiceFee() {
	isServiceFeeEnabled = !isServiceFeeEnabled;
	renderCart();
}

/* ========== 🔥 顯示邏輯 (與 logic.js 同步，確保 UI 渲染正確) ========== */
function renderCart() {
	const cartList = document.getElementById("cart-list");
	const totalText = document.getElementById("total");
	cartList.innerHTML = "";
	currentOriginalTotal = 0;

	const svcBtn = document.getElementById("svcBtn");
	if (svcBtn) {
		if (isServiceFeeEnabled) {
			svcBtn.classList.add("active");
			svcBtn.innerHTML = "✅ 收 10% 服務費";
		} else {
			svcBtn.classList.remove("active");
			svcBtn.innerHTML = "◻️ 收 10% 服務費";
		}
	}

	// 🔥 顯示邏輯：合併「已送出」與「目前購物車」
	let displayItems = [];

	// 1. 先加入已送出的商品 (若有的話)
	if (sentItems.length > 0) {
		sentItems.forEach((item) => {
			displayItems.push({ ...item, isSent: true, count: 1 });
		});
	}

	// 2. 再加入目前購物車
	let currentCartItems = isCartSimpleMode
		? getMergedItems(cart)
		: cart.map((item) => ({ ...item, count: 1 }));
	displayItems = [...displayItems, ...currentCartItems];

	if (displayItems.length === 0) {
		cartList.innerHTML = `<div style="text-align:center; color:#ccc; padding:20px;">購物車空空的</div>`;
	}

	let lastBatchShown = {};
	displayItems.forEach((c, i) => {
		let count = c.count || 1;
		let itemTotal = (c.isTreat ? 0 : c.price) * count;

		// 只有「未送出」的才計入目前應付金額 (避免客人以為重複算錢)
		if (!c.isSent) {
			currentOriginalTotal += itemTotal;
		}

		let treatClass = c.isTreat
			? "treat-btn active btn-effect"
			: "treat-btn btn-effect";
		let treatText = c.isTreat ? "已招待" : "🎁 招待";
		let priceHtml = "";
		let nameHtml = "";
		let rowClass = "cart-item-row";
		let batchBadge = "";

		if (
			typeof c.batchId !== "undefined" &&
			lastBatchShown[c.batchId] === undefined
		) {
			let minutesAgo = "";
			if (c.sentAt) {
				let diffMs = Date.now() - c.sentAt;
				let mins = Math.max(0, Math.floor(diffMs / 60000));
				minutesAgo = `${mins}`;
			}
			batchBadge = `<div class="batch-badge">顧客訂單#${c.batchId} - ${minutesAgo} 分鐘前</div>`;
			lastBatchShown[c.batchId] = true;
		}

		// 已下單樣式
		if (c.isSent) {
			nameHtml = `<div class="cart-item-name" style="color:#adb5bd;">${c.name} <small>(已下單)</small></div>`;
			priceHtml = `<span style="color:#adb5bd;">$${itemTotal}</span>`;
			rowClass += " sent-item";
		} else {
			// 一般樣式
			if (typeof c.batchIdx !== "undefined") {
				if (c.batchIdx === 0) rowClass += " batch-blue";
				else if (c.batchIdx === 1) rowClass += " batch-red";
				else if (c.batchIdx === 2) rowClass += " batch-green";
			}

			if (isCartSimpleMode && count > 1) {
				nameHtml = `<div class="cart-item-name">${c.name} <span style="color:#ef476f; font-weight:bold;">x${count}</span></div>`;
				if (c.isTreat) {
					priceHtml = `<span style='text-decoration:line-through; color:#999;'>$${c.price * count}</span> <span style='color:#06d6a0; font-weight:bold;'>$0</span>`;
				} else {
					priceHtml = `$${itemTotal}`;
				}
			} else {
				nameHtml = `<div class="cart-item-name">${c.name}</div>`;
				if (c.isTreat) {
					priceHtml = `<span style='text-decoration:line-through; color:#999;'>$${c.price}</span> <span style='color:#06d6a0; font-weight:bold;'>$0</span>`;
				} else {
					priceHtml = `$${c.price}`;
				}
			}
		}

		let actionButtons = "";
		// 已下單的沒有刪除鈕
		if (c.isSent) {
			actionButtons = `<small style="color:#ccc;">已傳送</small>`;
		} else {
			// 這裡的 index 需要修正，因為 displayItems 包含了 sentItems
			// 我們需要找到這個 item 在原本 cart 陣列的 index
			// 簡單做法：displayItems 後半段就是 cart，所以 index 減去 sentItems 長度
			let realCartIndex =
				i - (typeof sentItems !== "undefined" ? sentItems.length : 0);

			actionButtons = !isCartSimpleMode
				? `<button class="${treatClass}" onclick="toggleTreat(${realCartIndex})">${treatText}</button><button class="del-btn btn-effect" onclick="removeItem(${realCartIndex})">刪除</button>`
				: `<small style="color:#888;">(切換檢視操作)</small>`;
		}

		cartList.innerHTML += `${batchBadge}<div class="${rowClass}">${nameHtml}<div class="cart-item-price">${priceHtml}</div><div style="display:flex; gap:5px; justify-content:flex-end;">${actionButtons}</div></div>`;
	});

	discountedTotal = currentOriginalTotal;
	if (currentDiscount.type === "percent") {
		discountedTotal = Math.round(
			currentOriginalTotal * (currentDiscount.value / 100),
		);
	} else if (currentDiscount.type === "amount") {
		discountedTotal = currentOriginalTotal - currentDiscount.value;
		if (discountedTotal < 0) discountedTotal = 0;
	}

	let serviceFee = 0;
	if (isServiceFeeEnabled) {
		serviceFee = Math.round(currentOriginalTotal * 0.1);
		discountedTotal += serviceFee;
	}

	let finalHtml = `總金額：`;
	if (currentDiscount.type !== "none" || isServiceFeeEnabled) {
		finalHtml += `<span style="text-decoration:line-through; color:#999; font-size:16px;">$${currentOriginalTotal}</span> `;
	}
	finalHtml += `<span style="color:#ef476f;">$${discountedTotal}</span>`;

	let noteText = [];
	if (currentDiscount.type === "percent")
		noteText.push(`折扣 ${currentDiscount.value}%`);
	if (currentDiscount.type === "amount")
		noteText.push(`折讓 -${currentDiscount.value}`);
	if (isServiceFeeEnabled) noteText.push(`含服務費 +$${serviceFee}`);

	if (noteText.length > 0) {
		finalHtml += ` <small style="color:#555;">(${noteText.join(", ")})</small>`;
	}
	totalText.innerHTML = finalHtml;

	const saveBtn = document.querySelector(".save-btn");
	if (saveBtn) {
		if (cart.length > 0) {
			saveBtn.classList.add("active");
		} else {
			saveBtn.classList.remove("active");
		}
	}
}

function addInlineHiddenBeer() {
	let name = document.getElementById("hbName").value.trim();
	let price = parseInt(document.getElementById("hbPrice").value);
	if (!name) name = "隱藏啤酒";
	if (isNaN(price) || price < 0) {
		alert("請輸入正確價格");
		return;
	}
	addToCart(name, price);
}
function checkItemType(name, price, categoryName) {
	if (name === "隱藏特調") {
		openCustomModal(name, price);
		return;
	}
	let realPrice = itemPrices[name] !== undefined ? itemPrices[name] : price;
	if (name === "隱藏啤酒") {
		addToCart(name, realPrice);
		return;
	}
	if (categoryName === "咖啡") {
		openDrinkModal(name, realPrice, "coffee");
		return;
	}
	if (categoryName === "飲料") {
		if (name.includes("茶")) openDrinkModal(name, realPrice, "tea");
		else openDrinkModal(name, realPrice, "drink");
		return;
	}
	if (categoryName === "主餐") {
		if (name === "炒飯") {
			openFoodModal(name, realPrice, "friedRice");
			return;
		}
		if (name === "日式炒烏龍麵" || name === "親子丼") {
			openFoodModal(name, realPrice, "meatOnly");
			return;
		}
	}
	addToCart(name, realPrice);
}
function addShotSet(name, price) {
	addToCart(`${name} <small style='color:#06d6a0'>[買5送1]</small>`, price * 5);
}

function openFoodModal(name, price, type) {
	tempCustomItem = { name, price, type };
	document.getElementById("foodTitle").innerText = name;
	let meatOptions = document.getElementById("meatOptions");
	let variants = FOOD_OPTION_VARIANTS[name] || [];
	let available = getAvailableVariants(name);
	if (available) variants = available;
	if (variants.length === 0) {
		alert("此品項的子選項已全部下架，無法選擇");
		return;
	}
	let html = variants
		.map(
			(opt, idx) =>
				`<label class="radio-box"><input type="radio" name="meat" value="${opt}" onclick="tempCustomItem.price=${price}" ${idx === 0 ? "checked" : ""}><div class="radio-btn btn-effect">${opt}${type === "friedRice" ? ` ($${price})` : ""}</div></label>`,
		)
		.join("");
	meatOptions.innerHTML = html;
	foodOptionModal.style.display = "flex";
}
function closeFoodModal() {
	foodOptionModal.style.display = "none";
	tempCustomItem = null;
}
function confirmFoodItem() {
	try {
		if (!tempCustomItem) return;
		let meat = document.querySelector('input[name="meat"]:checked').value;
		addToCart(
			`${tempCustomItem.name} <small style='color:#666'>(${meat})</small>`,
			tempCustomItem.price,
		);
		closeFoodModal();
	} catch (e) {
		alert("加入餐點失敗: " + e.message);
	}
}

function openDrinkModal(name, price, type) {
	tempCustomItem = { name, price, type };
	document.getElementById("drinkTitle").innerText = name;
	let simpleTemp = document.getElementById("simpleTempSection");
	let advTemp = document.getElementById("advanceTempSection");
	let sugar = document.getElementById("sugarSection");
	document.querySelectorAll('input[name="simpleTemp"]')[0].checked = true;
	document.querySelectorAll('input[name="advTemp"]')[0].checked = true;
	document.querySelectorAll('input[name="sugar"]')[0].checked = true;
	if (type === "coffee") {
		simpleTemp.style.display = "block";
		advTemp.style.display = "none";
		sugar.style.display = "none";
	} else if (type === "drink") {
		simpleTemp.style.display = "none";
		advTemp.style.display = "block";
		sugar.style.display = "none";
	} else if (type === "tea") {
		simpleTemp.style.display = "none";
		advTemp.style.display = "block";
		sugar.style.display = "block";
	}
	drinkModal.style.display = "flex";
}
function closeDrinkModal() {
	drinkModal.style.display = "none";
	tempCustomItem = null;
}
function confirmDrinkItem() {
	try {
		if (!tempCustomItem) return;
		let note = "";
		if (tempCustomItem.type === "coffee") {
			let temp = document.querySelector(
				'input[name="simpleTemp"]:checked',
			).value;
			note = `<small style='color:#666'>(${temp})</small>`;
		} else {
			let temp = document.querySelector('input[name="advTemp"]:checked').value;
			if (tempCustomItem.type === "tea") {
				let sugar = document.querySelector('input[name="sugar"]:checked').value;
				note = `<small style='color:#666'>(${temp} / ${sugar})</small>`;
			} else {
				note = `<small style='color:#666'>(${temp})</small>`;
			}
		}
		addToCart(tempCustomItem.name + " " + note, tempCustomItem.price);
		closeDrinkModal();
	} catch (e) {
		alert("加入飲料失敗: " + e.message);
	}
}

function openCustomModal(name, price) {
	tempCustomItem = { name, price };
	document.querySelectorAll('input[name="flavor"]')[0].checked = true;
	document.querySelectorAll('input[name="taste"]')[0].checked = true;
	let alcoholSec = document.getElementById("modalAlcoholSection");
	let noteSec = document.getElementById("modalNoteSection");
	let title = document.getElementById("customTitle");
	if (price === 280) {
		title.innerText = "隱藏特調(酒精)";
		alcoholSec.style.display = "block";
		noteSec.style.display = "none";
		isExtraShot = false;
		document.getElementById("extraShotBtn").classList.remove("active");
		document.getElementById("alcoholRange").value = 0;
		document.getElementById("alcoholVal").innerText = "0";
	} else if (price === 300) {
		title.innerText = "隱藏特調(無酒精)";
		alcoholSec.style.display = "none";
		noteSec.style.display = "block";
		document.getElementById("customNote").value = "";
	}
	customModal.style.display = "flex";
}
function toggleExtraShot() {
	isExtraShot = !isExtraShot;
	document.getElementById("extraShotBtn").classList.toggle("active");
}
function closeCustomModal() {
	customModal.style.display = "none";
	tempCustomItem = null;
}
function confirmCustomItem() {
	try {
		if (!tempCustomItem) return;
		let flavor = document.querySelector('input[name="flavor"]:checked').value;
		let taste = document.querySelector('input[name="taste"]:checked').value;
		let extraStr = "";
		let finalPrice = tempCustomItem.price;
		if (tempCustomItem.price === 280) {
			let alcohol = document.getElementById("alcoholRange").value;
			if (isExtraShot) {
				finalPrice += 40;
				extraStr += "<br><b style='color:#d33;'>🔥 濃度升級 (+$40)</b>";
			}
			extraStr += `<br><small style='color:#666'>(${flavor} / ${taste} / 濃度+${alcohol}%)</small>`;
		} else {
			let note = document.getElementById("customNote").value.trim();
			if (note)
				extraStr += `<br><span style='color:#007bff; font-size:14px;'>📝 ${note}</span>`;
			extraStr += `<br><small style='color:#666'>(${flavor} / ${taste})</small>`;
		}
		addToCart(`${tempCustomItem.name} ${extraStr}`, finalPrice);
		closeCustomModal();
	} catch (e) {
		alert("加入特調失敗: " + e.message);
	}
}

function openDiscountModal() {
	discountModal.style.display = "flex";
}
function closeDiscountModal() {
	discountModal.style.display = "none";
}
function confirmDiscount() {
	let val = parseFloat(document.getElementById("discInput").value);
	if (isNaN(val) || val <= 0 || val > 100) {
		alert("請輸入正確折數 (1-100)");
		return;
	}
	currentDiscount = { type: "percent", value: val };
	renderCart();
	closeDiscountModal();
}
function openAllowanceModal() {
	allowanceModal.style.display = "flex";
}
function closeAllowanceModal() {
	allowanceModal.style.display = "none";
}
function confirmAllowance() {
	let val = parseInt(document.getElementById("allowInput").value);
	if (isNaN(val) || val < 0) {
		alert("請輸入正確金額");
		return;
	}
	currentDiscount = { type: "amount", value: val };
	renderCart();
	closeAllowanceModal();
}

function openPaymentModal() {
	if (cart.length === 0) {
		if (!confirm("購物車是空的，確定要直接清桌嗎？")) return;
		checkoutAll(0);
		return;
	}
	document.getElementById("payOriginal").innerText = "$" + discountedTotal;
	let labels = [];
	if (currentDiscount.type === "percent")
		labels.push(`${currentDiscount.value} 折`);
	if (currentDiscount.type === "amount")
		labels.push(`折讓 ${currentDiscount.value}`);
	if (isServiceFeeEnabled) labels.push("10% 服務費");
	document.getElementById("payDiscLabel").innerText =
		labels.length > 0 ? `(${labels.join(" + ")})` : "";
	document.getElementById("payAllowance").value = "";
	document.getElementById("payFinal").value = discountedTotal;
	finalTotal = discountedTotal;
	paymentModal.style.display = "flex";
}
function closePaymentModal() {
	paymentModal.style.display = "none";
}
function confirmCheckout() {
	let finalAmount = parseInt(document.getElementById("payFinal").value);
	if (isNaN(finalAmount) || finalAmount < 0) {
		alert("金額錯誤！");
		return;
	}
	checkoutAll(finalAmount);
	closePaymentModal();
}

function openSplitCheckout() {
	if (cart.length === 0) {
		alert("購物車是空的，無法拆單！");
		return;
	}
	tempLeftList = [...cart];
	tempRightList = [];
	if (document.getElementById("splitDisc"))
		document.getElementById("splitDisc").value = "";
	if (document.getElementById("splitAllow"))
		document.getElementById("splitAllow").value = "";
	renderCheckoutLists();
	checkoutModal.style.display = "flex";
}
function renderCheckoutLists() {
	let leftHTML = "";
	let rightHTML = "";
	let rightTotal = 0;
	if (tempLeftList.length === 0)
		leftHTML = "<div class='empty-hint'>已無剩餘項目</div>";
	else
		tempLeftList.forEach((item, index) => {
			let price = item.isTreat ? 0 : item.price;
			let priceHtml = item.isTreat
				? `<span style="color:#06d6a0; font-weight:700;">$0</span>`
				: `$${price}`;
			leftHTML += `<div class="checkout-item" onclick="moveToPay(${index})"><span>${item.name}${item.isTreat && !item.name.includes("(招待)") ? " (招待)" : ""
				}</span><span>${priceHtml}</span></div>`;
		});
	if (tempRightList.length === 0)
		rightHTML = "<div class='empty-hint'>點擊左側加入</div>";
	else
		tempRightList.forEach((item, index) => {
			let price = item.isTreat ? 0 : item.price;
			let priceHtml = item.isTreat
				? `<span style="color:#06d6a0; font-weight:700;">$0</span>`
				: `$${price}`;
			rightHTML += `<div class="checkout-item" onclick="removeFromPay(${index})"><span>${item.name}${item.isTreat && !item.name.includes("(招待)") ? " (招待)" : ""
				}</span><span>${priceHtml}</span></div>`;
		});
	document.getElementById("unpaidList").innerHTML = leftHTML;
	document.getElementById("payingList").innerHTML = rightHTML;
	calcSplitTotal();
}
function moveToPay(index) {
	let item = tempLeftList.splice(index, 1)[0];
	tempRightList.push(item);
	renderCheckoutLists();
}
function removeFromPay(index) {
	let item = tempRightList.splice(index, 1)[0];
	tempLeftList.push(item);
	renderCheckoutLists();
}
function closeCheckoutModal() {
	checkoutModal.style.display = "none";
}
function updateDiscPreview() {
	let val = parseFloat(document.getElementById("discInput").value);
	if (isNaN(val) || val <= 0 || val > 100) {
		document.getElementById("discPreviewText").innerText = "";
		return;
	}
	let discounted = Math.round(currentOriginalTotal * (val / 100));
	document.getElementById("discPreviewText").innerText =
		`原價 $${currentOriginalTotal} ➡ 折後 $${discounted}`;
}

function openReprintModal() {
	if (cart.length === 0) {
		alert("購物車是空的");
		return;
	}
	const list = document.getElementById("reprintList");
	list.innerHTML = "";

	// 依當前視圖決定是否合併品項
	let reprintItems =
		isCartSimpleMode && typeof getMergedItems === "function"
			? getMergedItems(cart)
			: cart.map((item) => ({ ...item, count: item.count || 1 }));

	window.reprintItemsForModal = reprintItems;

	list.innerHTML = `<label class="checkout-item reprint-select-all" style="justify-content: flex-start; gap: 10px;"><input type="checkbox" id="selectAllReprint" checked onchange="toggleAllReprint(this)"><span>全選 / 取消全選</span></label><hr style="margin: 5px 0;">`;

	reprintItems.forEach((item, index) => {
		let price = item.isTreat ? 0 : item.price;
		let countText = item.count && item.count > 1 ? ` x${item.count}` : "";
		let priceText =
			price === 0
				? `<span style="color:#06d6a0; font-weight:700;">$0</span>`
				: `$${price}`;
		list.innerHTML += `<label class="checkout-item" style="justify-content: space-between; gap: 10px;"><div style="display:flex; align-items:center; gap:10px;"><input type="checkbox" class="reprint-checkbox" id="reprint-item-${index}" checked><span>${item.name}${item.isTreat && !item.name.includes("(招待)") ? " (招待)" : ""}${countText}</span></div><span style="color:#475569;">${priceText}</span></label>`;
	});
	reprintSelectionModal.style.display = "flex";
}
function toggleAllReprint(source) {
	let checkboxes = document.querySelectorAll(".reprint-checkbox");
	checkboxes.forEach((cb) => {
		cb.checked = source.checked;
	});
}
function closeReprintModal() {
	reprintSelectionModal.style.display = "none";
}
function confirmReprintSelection() {
	try {
		let selectedItems = [];
		let sourceItems = window.reprintItemsForModal || cart;
		sourceItems.forEach((item, index) => {
			let cb = document.getElementById(`reprint-item-${index}`);
			if (cb && cb.checked) selectedItems.push(item);
		});
		if (selectedItems.length === 0) {
			alert("請至少選擇一個項目");
			return;
		}

		// 依顧客送出時間排序，並使用最早的送出時間作為補單時間
		selectedItems.sort((a, b) => {
			let ta = a.sentAt || 0;
			let tb = b.sentAt || 0;
			if (ta === tb) return 0;
			return ta - tb;
		});

		let seqNum = "補";
		if (tableCustomers[selectedTable] && tableCustomers[selectedTable].orderId)
			seqNum = tableCustomers[selectedTable].orderId;
		let printTime = selectedItems[0].sentAt
			? new Date(selectedItems[0].sentAt)
			: new Date();

		printReceipt(
			{
				seq: seqNum,
				table: selectedTable,
				time: printTime.toLocaleString("zh-TW", { hour12: false }),
				items: selectedItems,
				original: 0,
				total: 0,
			},
			true,
		);
		closeReprintModal();
	} catch (e) {
		alert("補單發生錯誤: " + e.message);
	}
}

function openPage(pageId) {
	hideAll();
	let el = document.getElementById(pageId);
	if (el) el.style.display = "block";

	setTimeout(() => {
		(async () => {
			if (pageId === "historyPage") {
				await ensureSubscriptions(["historyOrders"]);
				showHistory();
			}
			if (pageId === "reportPage") {
				await ensureSubscriptions(["historyOrders"]);
				generateReport("day");
				renderCalendar();
				moveSegmentHighlighter(0);
			}
			if (pageId === "pastHistoryPage") {
				await ensureSubscriptions(["historyOrders"]);
				if (typeof initHistoryDate === "function") initHistoryDate();
				renderPublicStats();
			}
			if (pageId === "itemStatsPage") {
				await ensureSubscriptions(["historyOrders"]);
			}
		})();
	}, 100);
}

function showHistory() {
	try {
		let currentlyOpenIds = [];
		const openDetails = document.querySelectorAll(".history-detail");
		openDetails.forEach((el) => {
			if (el.style.display === "block") currentlyOpenIds.push(el.id);
		});
		const historyBox = document.getElementById("history-box");
		if (!historyBox) return;
		historyBox.innerHTML = "";

		if (typeof getVisibleOrders !== "function") {
			historyBox.innerHTML =
				"<div style='padding:20px;color:red;'>系統初始化中，請稍後...</div>";
			return;
		}

		let orders = getVisibleOrders();
		latestVisibleOrders = orders;
		window.latestVisibleOrders = orders;

		if (!orders || orders.length === 0) {
			historyBox.innerHTML =
				"<div style='padding:20px;color:#8d99ae;'>今日尚無訂單 (或已日結)</div>";
			return;
		}

		let btnIcon = isHistorySimpleMode ? "📝" : "🔢";
		let btnText = isHistorySimpleMode
			? "切換為詳細清單"
			: "切換為簡化清單 (合併數量)";
		historyBox.innerHTML += `<div class="view-toggle-container"><button onclick="toggleHistoryView()" class="view-toggle-btn btn-effect"><span class="icon">${btnIcon}</span><span>${btnText}</span></button></div>`;

		orders.forEach((o, index) => {
			let seqDisplay = o.formattedSeq
				? `#${o.formattedSeq}`
				: `#${orders.length - index}`;
			let custInfo =
				o.customerName || o.customerPhone
					? `<span style="color:#007bff; font-weight:bold;">${o.customerName || ""}</span> ${o.customerPhone || ""}`
					: "<span style='color:#ccc'>-</span>";
			let itemsToDisplay = isHistorySimpleMode
				? getMergedItems(o.items)
				: o.items;
			let itemsDetail = itemsToDisplay
				.map((i) => {
					let countStr =
						i.count && i.count > 1
							? ` <b style="color:#ef476f;">x${i.count}</b>`
							: "";
					let priceStr =
						i.count && i.count > 1 ? `$${i.price * i.count}` : `$${i.price}`;
					if (i.isTreat) {
						const treatTag = i.name.includes("(招待)") ? "" : " (招待)";
						return `<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px dotted #eee;"><span>${i.name}${treatTag}${countStr}</span> <span>$0</span></div>`;
					}
					return `<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px dotted #eee;"><span>${i.name}${countStr}</span> <span>${priceStr}</span></div>`;
				})
				.join("");
			let timeOnly = o.time.split(" ")[1] || o.time;
			let rowId = `detail-${index}`;
			let displayStyle = currentlyOpenIds.includes(rowId) ? "block" : "none";
			let amountDisplay = `$${o.total}`;
			if (o.originalTotal && o.originalTotal !== o.total)
				amountDisplay = `<span style="text-decoration:line-through; color:#999; font-size:12px;">$${o.originalTotal}</span> <br> <span style="color:#ef476f;">$${o.total}</span>`;
			historyBox.innerHTML += `<div class="history-row btn-effect" onclick="window.toggleDetail('${rowId}')"><span class="seq" style="font-weight:bold; color:#4361ee;">${seqDisplay}</span><span class="seat">${o.seat}</span><span class="cust">${custInfo}</span><span class="time">${timeOnly}</span><span class="amt">${amountDisplay}</span></div><div id="${rowId}" class="history-detail" style="display:${displayStyle};"><div style="background:#f8fafc; padding:15px; border-radius:0 0 12px 12px; border:1px solid #eee; border-top:none;"><b>📅 完整時間：</b>${o.time}<br><b>🧾 內容：</b><br>${itemsDetail}<div style="text-align:right; margin-top:10px; font-size:18px; font-weight:bold; color:#ef476f;">總計：$${o.total}</div><div style="text-align:right; margin-top:15px; border-top:1px solid #ddd; padding-top:10px; display:flex; justify-content:flex-end; gap:10px;"><button onclick="reprintOrder(${index})" class="print-btn btn-effect">🖨 列印明細</button><button onclick="deleteSingleOrder(${index})" class="delete-single-btn btn-effect">🗑 刪除此筆訂單</button></div></div></div>`;
		});
	} catch (e) {
		console.error("showHistory 錯誤", e);
	}
}

function toggleHistoryView() {
	isHistorySimpleMode = !isHistorySimpleMode;
	showHistory();
}

function generateReport(type) {
	try {
		let reportContent = document.getElementById("reportContent");
		if (
			!reportContent ||
			document.getElementById("reportPage").style.display === "none"
		)
			return;

		document
			.querySelectorAll(".segment-option")
			.forEach((b) => b.classList.remove("active"));

		let index = 0;
		if (type === "week") index = 1;
		if (type === "month") index = 2;

		let options = document.querySelectorAll(".segment-option");
		if (options[index]) options[index].classList.add("active");
		moveSegmentHighlighter(index);

		let now = new Date();
		if (now.getHours() < 5) now.setDate(now.getDate() - 1);
		let start = new Date(now);
		let title = "";

		if (type === "day") {
			start.setHours(5, 0, 0, 0);
			let end = new Date(start);
			end.setDate(end.getDate() + 1);
			title = "💰 今日營業額 (即時)";
			filterOrders(start, end, title);
		} else if (type === "week") {
			let day = start.getDay() || 7;
			if (day !== 1) start.setHours(-24 * (day - 1));
			start.setHours(5, 0, 0, 0);
			title = "💰 本周營業額 (即時)";
			filterOrders(start, new Date(), title);
		} else if (type === "month") {
			start.setDate(1);
			start.setHours(5, 0, 0, 0);
			title = "💰 當月營業額 (即時)";
			filterOrders(start, new Date(), title);
		}
	} catch (e) {
		console.error("generateReport 錯誤", e);
	}
}

function filterOrders(startTime, endTime, titleText) {
	let total = 0;
	let count = 0;
	let barTotal = 0;
	let bbqTotal = 0;

	if (!Array.isArray(historyOrders)) return;

	historyOrders.forEach((order) => {
		if (!order) return;
		let orderTime = getDateFromOrder(order);
		if (orderTime >= startTime && (endTime ? orderTime < endTime : true)) {
			total += order.total || 0;
			count++;
			if (order.items && Array.isArray(order.items)) {
				order.items.forEach((item) => {
					let itemType = item.type || getItemCategoryType(item.name);
					if (itemType === "bbq") bbqTotal += item.price || 0;
					else barTotal += item.price || 0;
				});
			}
		}
	});

	if (document.getElementById("rptTitle"))
		document.getElementById("rptTitle").innerText = titleText;
	if (document.getElementById("rptTotal"))
		document.getElementById("rptTotal").innerText = "$" + total;
	if (document.getElementById("rptCount"))
		document.getElementById("rptCount").innerText = "總單數: " + count;
	if (document.getElementById("rptBar"))
		document.getElementById("rptBar").innerText = "$" + barTotal;
	if (document.getElementById("rptBBQ"))
		document.getElementById("rptBBQ").innerText = "$" + bbqTotal;
}

function renderCalendar() {
	try {
		let now = new Date();
		if (now.getHours() < 5) now.setDate(now.getDate() - 1);
		let year = now.getFullYear();
		let month = now.getMonth();
		if (document.getElementById("calendarMonthTitle"))
			document.getElementById("calendarMonthTitle").innerText =
				`${year}年 ${month + 1}月`;
		let dailyTotals = {};

		if (Array.isArray(historyOrders)) {
			historyOrders.forEach((order) => {
				if (!order) return;
				let t = getDateFromOrder(order);
				if (t.getHours() < 5) t.setDate(t.getDate() - 1);
				if (t.getFullYear() === year && t.getMonth() === month) {
					let dayKey = t.getDate();
					if (!dailyTotals[dayKey]) dailyTotals[dayKey] = 0;
					dailyTotals[dayKey] += order.total || 0;
				}
			});
		}

		let firstDay = new Date(year, month, 1).getDay();
		let daysInMonth = new Date(year, month + 1, 0).getDate();
		let grid = document.getElementById("calendarGrid");
		if (!grid) return;
		grid.innerHTML = "";
		for (let i = 0; i < firstDay; i++) {
			let empty = document.createElement("div");
			empty.className = "calendar-day empty";
			grid.appendChild(empty);
		}
		let today = new Date();
		if (today.getHours() < 5) today.setDate(today.getDate() - 1);
		for (let d = 1; d <= daysInMonth; d++) {
			let cell = document.createElement("div");
			cell.className = "calendar-day";
			if (d === today.getDate() && month === today.getMonth())
				cell.classList.add("today");
			let revenue = dailyTotals[d] ? `$${dailyTotals[d]}` : "";
			cell.innerHTML = `<div class="day-num">${d}</div><div class="day-revenue">${revenue}</div>`;
			grid.appendChild(cell);
		}
	} catch (e) {
		console.error("renderCalendar 錯誤", e);
	}
}

/* ========== 商品銷售統計 (歷史銷量) ========== */
function openItemStatsPage() {
	openPage("itemStatsPage");
	const activeBtn = document.getElementById("statBtnDay");
	if (activeBtn) renderItemStats("day", activeBtn);
}

function renderItemStats(range, button) {
	const btns = document.querySelectorAll("#itemStatsPage .segment-option");
	btns.forEach((btn) => btn.classList.remove("active"));

	let activeBtn = button;
	if (!activeBtn) {
		if (range === "day") activeBtn = document.getElementById("statBtnDay");
		if (range === "week") activeBtn = document.getElementById("statBtnWeek");
		if (range === "month") activeBtn = document.getElementById("statBtnMonth");
		if (range === "custom")
			activeBtn = document.getElementById("statBtnCustom");
	}

	const customRangeDiv = document.getElementById("customStatsDateRange");
	if (range === "custom") {
		if (customRangeDiv) customRangeDiv.style.display = "flex";
	} else {
		if (customRangeDiv) customRangeDiv.style.display = "none";
	}

	if (activeBtn) {
		activeBtn.classList.add("active");
		// Highlighter Logic
		const highlighter = document.getElementById("statsHighlighter");
		if (highlighter) {
			let index = 0;
			if (range === "week") index = 1;
			if (range === "month") index = 2;
			if (range === "custom") index = 3;
			highlighter.style.transform = `translateX(${index * 100}%)`;
		}
	}

	let now = new Date();
	if (now.getHours() < 5) now.setDate(now.getDate() - 1);
	let start = new Date(now);
	let end = null;

	if (range === "day") {
		start.setHours(5, 0, 0, 0);
		end = new Date(start);
		end.setDate(end.getDate() + 1);
	} else if (range === "week") {
		let day = start.getDay() || 7;
		start.setDate(start.getDate() - (day - 1));
		start.setHours(5, 0, 0, 0);
		end = new Date(start);
		end.setDate(end.getDate() + 7);
	} else if (range === "month") {
		start.setDate(1);
		start.setHours(5, 0, 0, 0);
		end = new Date(start);
		end.setMonth(end.getMonth() + 1);
	} else if (range === "custom") {
		const sInput = document.getElementById("statsStartDate");
		const eInput = document.getElementById("statsEndDate");

		const toLocalISO = (d) => {
			const offset = d.getTimezoneOffset() * 60000;
			return new Date(d.getTime() - offset).toISOString().split("T")[0];
		};

		if (sInput && !sInput.value) {
			let d = new Date();
			d.setDate(1);
			sInput.value = toLocalISO(d);
		}
		if (eInput && !eInput.value) {
			let d = new Date();
			d.setMonth(d.getMonth() + 1);
			d.setDate(0);
			eInput.value = toLocalISO(d);
		}

		if (sInput && eInput && sInput.value && eInput.value) {
			let sParts = sInput.value.split("-");
			let eParts = eInput.value.split("-");
			start = new Date(sParts[0], sParts[1] - 1, sParts[2]);
			start.setHours(5, 0, 0, 0);

			end = new Date(eParts[0], eParts[1] - 1, eParts[2]);
			end.setDate(end.getDate() + 1); // Inclusive
			end.setHours(5, 0, 0, 0);
		} else {
			// Fallback (should not happen due to defaults above)
			start.setHours(5, 0, 0, 0);
			end = new Date(start);
			end.setDate(end.getDate() + 1);
		}
	}
	let counts = {};
	let typeMap = {};
	let startBiz = getBusinessDate(start);
	let endBiz = getBusinessDate(end);

	if (Array.isArray(historyOrders)) {
		historyOrders.forEach((order) => {
			let t = getDateFromOrder(order);
			let biz = getBusinessDate(t);
			if (biz >= startBiz && biz < endBiz) {
				if (Array.isArray(order.items)) {
					order.items.forEach((item) => {
						let nameMatch = item.name.match(/^[^<]+/);
						let name = nameMatch
							? nameMatch[0].replace(/\s*\(招待\)$/, "").trim()
							: item.name.replace(/\s*\(招待\)$/, "").trim();
						let qty = item.count || 1;
						if (!typeMap[name])
							typeMap[name] = item.type || getItemCategoryType(name);
						if (!counts[name]) counts[name] = 0;
						counts[name] += qty;
					});
				}
			}
		});
	}

	let sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
	let barList = [];
	let bbqList = [];

	sorted.forEach(([name, count]) => {
		let type = typeMap[name] || getItemCategoryType(name);
		if (type === "bar") barList.push({ name, count });
		else bbqList.push({ name, count });
	});

	const renderList = (list, containerId) => {
		const container = document.getElementById(containerId);
		container.innerHTML = "";
		if (list.length === 0) {
			container.innerHTML =
				"<div style='text-align:center; padding:20px; color:#ccc;'>無銷量資料</div>";
			return;
		}
		list.forEach((item, index) => {
			let rankClass = "";
			if (index === 0) rankClass = "top-1";
			else if (index === 1) rankClass = "top-2";
			else if (index === 2) rankClass = "top-3";

			container.innerHTML += `
                <div class="stats-row-item">
                    <div class="rank-badge ${rankClass}">${index + 1}</div>
                    <span class="stats-name">${item.name}</span>
                    <span class="stats-val">${item.count}</span>
                </div>
            `;
		});
	};

	renderList(barList, "statsListBar");
	renderList(bbqList, "statsListBbq");
}

/* ========== 公開歷史統計 (只顯示銷量) ========== */
function changeStatsMonth(offset) {
	historyViewDate.setMonth(historyViewDate.getMonth() + offset);
	renderPublicStats();
}

function renderPublicStats() {
	let year = historyViewDate.getFullYear();
	let month = historyViewDate.getMonth();
	if (document.getElementById("statsMonthTitle"))
		document.getElementById("statsMonthTitle").innerText =
			`${year}年 ${month + 1}月`;

	let stats = {};
	if (Array.isArray(historyOrders)) {
		historyOrders.forEach((order) => {
			if (!order) return;
			let t = getDateFromOrder(order);
			if (t.getHours() < 5) t.setDate(t.getDate() - 1);
			if (t.getFullYear() === year && t.getMonth() === month) {
				if (order.items && Array.isArray(order.items)) {
					order.items.forEach((item) => {
						let nameMatch = item.name.match(/^[^<]+/);
						let name = nameMatch
							? nameMatch[0].replace(" (招待)", "").trim()
							: item.name.replace(" (招待)", "").trim();
						if (!stats[name])
							stats[name] = { count: 0, type: item.type || getItemCategoryType(name) };
						stats[name].count += item.count || 1;
					});
				}
			}
		});
	}

	let barList = [];
	let bbqList = [];
	for (let [name, data] of Object.entries(stats)) {
		if (data.type === "bar") barList.push({ name, count: data.count });
		else bbqList.push({ name, count: data.count });
	}
	barList.sort((a, b) => b.count - a.count);
	bbqList.sort((a, b) => b.count - a.count);

	const renderList = (list, containerId) => {
		const container = document.getElementById(containerId);
		if (!container) return;
		container.innerHTML = "";
		if (list.length === 0) {
			container.innerHTML =
				"<div style='padding:10px; color:#8d99ae;'>無資料</div>";
			return;
		}
		list.forEach((item, index) => {
			container.innerHTML += `<div class="stats-item-row"><span>${index + 1}. ${item.name}</span><span class="stats-count">${item.count}</span></div>`;
		});
	};
	renderList(barList, "publicStatsBar");
	renderList(bbqList, "publicStatsBbq");
}

// 單筆列印/刪除 (歷史區塊)
function reprintOrder(index) {
	try {
		let orders =
			latestVisibleOrders && latestVisibleOrders.length > 0
				? latestVisibleOrders
				: window.latestVisibleOrders || getVisibleOrders();
		let target = orders && orders[index];
		if (!target) {
			alert("找不到此訂單");
			return;
		}
		let seq = target.formattedSeq || target.seq || index + 1;
		let table = target.seat || target.table || "";
		let timeStr =
			target.time ||
			(target.timestamp
				? new Date(target.timestamp).toLocaleString("zh-TW", { hour12: false })
				: new Date().toLocaleString("zh-TW", { hour12: false }));
		let orig = target.originalTotal || target.total || 0;
		let rawItems = Array.isArray(target.items) ? target.items : [];
		let items =
			isHistorySimpleMode
				? getMergedItems(rawItems)
				: rawItems;
		printReceipt(
			{
				seq,
				table,
				time: timeStr,
				items,
				original: orig,
				total: target.total || 0,
			},
			false,
		);
	} catch (e) {
		alert("列印失敗：" + e.message);
	}
}

function deleteSingleOrder(index) {
	try {
		if (!confirm("確定刪除此筆訂單嗎？")) return;
		let orders =
			latestVisibleOrders && latestVisibleOrders.length > 0
				? latestVisibleOrders
				: window.latestVisibleOrders || getVisibleOrders();
		let target = orders && orders[index];
		if (!target) {
			alert("找不到此訂單");
			return;
		}
		let idxInHistory = Array.isArray(historyOrders)
			? historyOrders.indexOf(target)
			: -1;
		if (idxInHistory === -1) {
			alert("刪除失敗：索引不存在");
			return;
		}
		historyOrders.splice(idxInHistory, 1);
		saveAllToCloud({ historyOrders });
		showHistory();
	} catch (e) {
		alert("刪除失敗：" + e.message);
	}
}

/* ========== 6. 修改：庫存管理 (下拉式選單) ========== */
function renderProductManagement() {
	const container = document.getElementById("productManagementList");

	let openStates = {};
	const existingContent = container.querySelectorAll(".accordion-content");
	existingContent.forEach((el) => {
		if (el.classList.contains("show")) {
			openStates[el.id] = true;
		}
	});

	container.innerHTML = "";

	let index = 0;
	for (const [category, content] of Object.entries(menuData)) {
		if (category === "其他") continue;
		index++;
		let accId = `mgmt-acc-${index}`;

		let isOpen = openStates[accId] ? "show" : "";
		let isActive = openStates[accId] ? "active" : "";

		let catHeader = `
            <button class="accordion-header-mgmt btn-effect ${isActive}" onclick="toggleAccordion('${accId}')">
                <span>📂 ${category}</span>
                <span class="arrow">▼</span>
            </button>
            <div id="${accId}" class="accordion-content ${isOpen}">
        `;

		let itemsHtml = "";
		let items = [];
		if (Array.isArray(content)) {
			items = content;
		} else {
			for (const [subCat, subItems] of Object.entries(content)) {
				items = items.concat(subItems);
			}
		}

		items.forEach((item) => {
			let isSpecial = FOOD_OPTION_VARIANTS && FOOD_OPTION_VARIANTS[item.name];
			let isAvailable = isSpecial
				? hasAvailableVariants(item.name)
				: inventory[item.name] !== false;
			let checked = isAvailable ? "checked" : "";
			let statusText = isAvailable
				? `<span id="status-main-${item.name}" style="color:#06d6a0; font-weight:bold;">有貨</span>`
				: `<span id="status-main-${item.name}" style="color:#ef476f; font-weight:bold;">售完</span>`;

			itemsHtml += `
                <div class="product-mgmt-row">
                    <span style="font-size:16px; font-weight:500;">${item.name}</span>
                    <div style="display:flex; align-items:center; gap:10px;">
                        ${statusText}
                        <label class="toggle-switch">
                            <input type="checkbox" ${checked} onchange="${isSpecial ? `toggleParentWithOptions('${item.name}', this.checked)` : `toggleStockStatus('${item.name}', this.checked)`}">
                            <span class="slider"></span>
                        </label>
                    </div>
                </div>
            `;

			if (isSpecial) {
				let variants = FOOD_OPTION_VARIANTS[item.name];
				variants.forEach((opt) => {
					let optKey = `${item.name}::${opt}`;
					let optAvail = inventory[optKey] !== false;
					let optChecked = optAvail ? "checked" : "";
					let optStatus = optAvail
						? `<span id="status-opt-${optKey}" style="color:#06d6a0; font-weight:bold;">顯示</span>`
						: `<span id="status-opt-${optKey}" style="color:#ef476f; font-weight:bold;">隱藏</span>`;
					itemsHtml += `
                        <div class="product-mgmt-row" style="padding-left:20px; list-style: none;">
                            <li style="font-size:14px; color:#555; list-style: disc;">${opt}</li>
                            <div style="display:flex; align-items:center; gap:10px;">
                                ${optStatus}
                                <label class="toggle-switch">
                                    <input type="checkbox" ${optChecked} onchange="toggleOptionStock('${item.name}', '${opt}', this.checked)">
                                    <span class="slider"></span>
                                </label>
                            </div>
                        </div>
                    `;
				});
			}
		});

		container.innerHTML += catHeader + itemsHtml + `</div>`;
	}
}

/* ========== 機密與權限頁面邏輯 ========== */
function openOwnerLogin(mode) {
	sessionStorage.setItem("ownerMode", mode);
	if (ownerLoginModal) ownerLoginModal.style.display = "flex";
}
function closeOwnerModal() {
	ownerLoginModal.style.display = "none";
}
function checkOwner(name) {
	let password = prompt(`請輸入 ${name} 的密碼：`);
	if (password === OWNER_PASSWORDS[name]) {
		closeOwnerModal();
		openConfidentialPage(name);
	} else {
		alert("❌ 密碼錯誤！");
	}
}

async function openConfidentialPage(ownerName) {
	hideAll();
	document.getElementById("confidentialPage").style.display = "block";
	document.getElementById("ownerWelcome").innerText = ownerName;
	await ensureSubscriptions(["historyOrders", "itemCosts", "itemPrices"]);
	document.getElementById("financeDashboard").style.display = "none";
	let currentLoginMode = sessionStorage.getItem("ownerMode") || "finance";
	if (currentLoginMode === "cost") {
		document.getElementById("costInputSection").style.display = "block";
		document.getElementById("financeCalendarSection").style.display = "none";
		document.getElementById("confidentialTitle").innerText = "成本輸入";
		updateFinancialPage(ownerName);
	} else {
		document.getElementById("costInputSection").style.display = "none";
		document.getElementById("financeCalendarSection").style.display = "block";
		document.getElementById("confidentialTitle").innerText = "財務與詳細訂單";
		if (typeof initHistoryDate === "function") initHistoryDate();
		renderConfidentialCalendar(ownerName);
	}
}

/* 🔥 修改：美化後的成本輸入介面 (使用 Table) */
function updateFinancialPage(ownerName) {
	const listContainer = document.getElementById("costEditorList");
	listContainer.innerHTML = "";

	// 動態加入專用 CSS 樣式，確保不影響其他頁面
	const style = document.createElement("style");
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
	const barCats = [
		"調酒",
		"純飲",
		"shot",
		"啤酒",
		"咖啡",
		"飲料",
		"厚片",
		"甜點",
	];
	const bbqCats = ["燒烤", "主餐", "炸物"];

	if (ownerName === "小飛") {
		targetCategories = barCats;
	} else if (ownerName === "威志") {
		targetCategories = bbqCats;
	} else {
		targetCategories = [...barCats, ...bbqCats, "其他"];
	}

	targetCategories.forEach((cat) => {
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
		if (Array.isArray(data)) {
			items = data;
		} else {
			Object.values(data).forEach((subList) => {
				items = items.concat(subList);
			});
		}

		items.forEach((item) => {
			let currentPrice =
				itemPrices[item.name] !== undefined
					? itemPrices[item.name]
					: item.price;
			let currentCost =
				itemCosts[item.name] !== undefined ? itemCosts[item.name] : 0;

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

function openFinanceDetailModal(dateKey, stats) {
	document.getElementById("fdTitle").innerText = `📅 ${dateKey} 財務明細`;
	document.getElementById("fdBarRev").innerText = `$${stats.barRev}`;
	document.getElementById("fdBarCost").innerText = `-$${stats.barCost}`;
	document.getElementById("fdBarProfit").innerText =
		`$${stats.barRev - stats.barCost}`;
	document.getElementById("fdBbqRev").innerText = `$${stats.bbqRev}`;
	document.getElementById("fdBbqCost").innerText = `-$${stats.bbqCost}`;
	document.getElementById("fdBbqProfit").innerText =
		`$${stats.bbqRev - stats.bbqCost}`;
	let totalRev = stats.barRev + stats.bbqRev;
	let totalCost = stats.barCost + stats.bbqCost;
	document.getElementById("fdTotalRev").innerText = `$${totalRev}`;
	document.getElementById("fdTotalCost").innerText = `-$${totalCost}`;
	document.getElementById("fdTotalProfit").innerText =
		`$${totalRev - totalCost}`;
	let currentUser = document.getElementById("ownerWelcome").innerText;
	document.querySelector(".bar-style").style.display =
		currentUser === "小飛" || currentUser === "景偉" ? "block" : "none";
	document.querySelector(".bbq-style").style.display =
		currentUser === "威志" || currentUser === "景偉" ? "block" : "none";
	document.querySelector(".total-style").style.display =
		currentUser === "景偉" ? "block" : "none";
	financeDetailModal.style.display = "flex";
}
function closeFinanceDetailModal() {
	financeDetailModal.style.display = "none";
}

/* ========== 權限區：日曆與詳細訂單 ========== */
function changeOwnerMonth(offset) {
	historyViewDate.setMonth(historyViewDate.getMonth() + offset);
	let owner = document.getElementById("ownerWelcome").innerText;
	renderConfidentialCalendar(owner);
	document.getElementById("ownerOrderListSection").style.display = "none";
	const customBtn = document.getElementById("finBtnCustom");
	if (customBtn) {
		customBtn.style.display = "none";
		customBtn.dataset.date = "";
	}
}

function renderConfidentialCalendar(ownerName) {
	document
		.querySelectorAll(".finance-controls button")
		.forEach((b) => b.classList.remove("active"));
	document.getElementById("finBtnMonth").classList.add("active");
	document.getElementById("financeTitle").innerText = "🏠 全店總計 (該月)";

	let year = historyViewDate.getFullYear();
	let month = historyViewDate.getMonth();
	document.getElementById("finCalendarTitle").innerText =
		`${year}年 ${month + 1}月`;
	dailyFinancialData = {};
	let dailyCounts = {};
	let monthStats = {
		barRev: 0,
		barCost: 0,
		bbqRev: 0,
		bbqCost: 0,
		totalRev: 0,
	};

	if (Array.isArray(historyOrders)) {
		historyOrders.forEach((order) => {
			if (!order) return;
			let t = getDateFromOrder(order);
			if (t.getHours() < 5) t.setDate(t.getDate() - 1);
			if (t.getFullYear() === year && t.getMonth() === month) {
				let dayKey = t.getDate();
				let dateStr = `${year}/${month + 1}/${dayKey}`;
				if (!dailyFinancialData[dateStr])
					dailyFinancialData[dateStr] = {
						barRev: 0,
						barCost: 0,
						bbqRev: 0,
						bbqCost: 0,
					};
				if (!dailyCounts[dayKey]) dailyCounts[dayKey] = 0;
				dailyCounts[dayKey]++;

				// 以訂單總額為主，避免折扣與明細不一致
				let orderTotal = order.total || 0;
				dailyFinancialData[dateStr].barRev += orderTotal;
				dailyFinancialData[dateStr].bbqRev += 0;
				monthStats.barRev += orderTotal;
				monthStats.totalRev += orderTotal;
			}
		});
	}

	document.getElementById("monthBarRev").innerText = `$${monthStats.barRev}`;
	document.getElementById("monthBarCost").innerText = `-$${monthStats.barCost}`;
	document.getElementById("monthBarProfit").innerText =
		`$${monthStats.barRev - monthStats.barCost}`;

	document.getElementById("monthBbqRev").innerText = `$${monthStats.bbqRev}`;
	document.getElementById("monthBbqCost").innerText = `-$${monthStats.bbqCost}`;
	document.getElementById("monthBbqProfit").innerText =
		`$${monthStats.bbqRev - monthStats.bbqCost}`;

	let totalRev = monthStats.barRev + monthStats.bbqRev;
	let totalCost = monthStats.barCost + monthStats.bbqCost;
	document.getElementById("monthTotalRev").innerText =
		`$${monthStats.totalRev || totalRev}`;
	document.getElementById("monthTotalCost").innerText = `-$${totalCost}`;
	document.getElementById("monthTotalProfit").innerText =
		`$${totalRev - totalCost}`;

	let barCard = document.querySelector(".bar-theme");
	let bbqCard = document.querySelector(".bbq-theme");
	let totalCard = document.querySelector(".total-theme");

	if (barCard && bbqCard && totalCard) {
		if (ownerName === "小飛") {
			barCard.style.display = "block";
			bbqCard.style.display = "none";
			totalCard.style.display = "none";
		} else if (ownerName === "威志") {
			barCard.style.display = "none";
			bbqCard.style.display = "block";
			totalCard.style.display = "none";
		} else {
			barCard.style.display = "block";
			bbqCard.style.display = "block";
			totalCard.style.display = "block";
		}
	}

	let firstDay = new Date(year, month, 1).getDay();
	let daysInMonth = new Date(year, month + 1, 0).getDate();
	let grid = document.getElementById("finCalendarGrid");
	grid.innerHTML = "";
	for (let i = 0; i < firstDay; i++) {
		let empty = document.createElement("div");
		empty.className = "calendar-day empty";
		grid.appendChild(empty);
	}
	let today = new Date();
	if (today.getHours() < 5) today.setDate(today.getDate() - 1);

	for (let d = 1; d <= daysInMonth; d++) {
		let cell = document.createElement("div");
		cell.className = "calendar-day";
		if (d === today.getDate() && month === today.getMonth())
			cell.classList.add("active");
		let dateStr = `${year}/${month + 1}/${d}`;
		let stats = dailyFinancialData[dateStr] || {
			barRev: 0,
			barCost: 0,
			bbqRev: 0,
			bbqCost: 0,
		};
		let showRev = 0;
		if (ownerName === "小飛") showRev = stats.barRev;
		else if (ownerName === "威志") showRev = stats.bbqRev;
		else showRev = stats.barRev + stats.bbqRev;

		let htmlContent = `<div class="day-num">${d}</div>`;
		if (showRev > 0) {
			htmlContent += `<div style="font-size:12px; color:#4361ee; font-weight:bold;">$${showRev}</div>`;
			if (dailyCounts[d])
				htmlContent += `<div style="font-size:10px; color:#8d99ae;">(${dailyCounts[d]}單)</div>`;
			cell.style.backgroundColor = "#e0e7ff";
		}

		cell.onclick = () => {
			grid
				.querySelectorAll(".calendar-day")
				.forEach((c) => c.classList.remove("active"));
			cell.classList.add("active");

			showOwnerDetailedOrders(year, month, d);
			let customBtn = document.getElementById("finBtnCustom");
			if (customBtn) {
				let mm = String(month + 1).padStart(2, "0");
				let dd = String(d).padStart(2, "0");
				customBtn.innerText = `${String(year).slice(2)}-${mm}-${dd}`;
				customBtn.dataset.date = `${year}-${mm}-${dd}`;
				customBtn.style.display = "inline-block";
				updateFinanceStats("custom", new Date(year, month, d, 5, 0, 0, 0));
			}
		};

		cell.innerHTML = htmlContent;
		grid.appendChild(cell);
	}
	updateFinanceStats("month");
}

function updateFinanceStats(range) {
	const DAY_MS = 24 * 60 * 60 * 1000;
	document
		.querySelectorAll(".finance-controls button")
		.forEach((b) => b.classList.remove("active"));
	if (range === "day")
		document.getElementById("finBtnDay").classList.add("active");
	if (range === "week")
		document.getElementById("finBtnWeek").classList.add("active");
	if (range === "month")
		document.getElementById("finBtnMonth").classList.add("active");
	if (range === "custom") {
		let btn = document.getElementById("finBtnCustom");
		if (btn) {
			btn.classList.add("active");
		}
	}

	let now = new Date();
	if (now.getHours() < 5) now.setDate(now.getDate() - 1);
	let start = new Date(now);
	let end = null;
	let titleText = "";
	let customDate = null;
	let bizStart = null;
	let bizEnd = null;

	if (range === "day") {
		start.setHours(5, 0, 0, 0);
		end = new Date(start);
		end.setDate(end.getDate() + 1);
		titleText = "🏠 全店總計 (今日)";
		bizStart = getBusinessDate(start);
		bizEnd = bizStart + DAY_MS;
	} else if (range === "week") {
		let day = start.getDay() || 7;
		start.setDate(start.getDate() - (day - 1));
		start.setHours(5, 0, 0, 0);
		end = new Date(start);
		end.setDate(end.getDate() + 7);
		titleText = "🏠 全店總計 (本周)";
		bizStart = getBusinessDate(start);
		bizEnd = bizStart + 7 * DAY_MS;
	} else if (range === "month") {
		start.setDate(1);
		start.setHours(5, 0, 0, 0);
		end = new Date(start);
		end.setMonth(end.getMonth() + 1);
		titleText = "🏠 全店總計 (本月)";
		bizStart = getBusinessDate(start);
		bizEnd = getBusinessDate(end);
	} else if (range === "custom") {
		let btn = document.getElementById("finBtnCustom");
		let dateStr = btn && btn.dataset.date ? btn.dataset.date : "";
		if (dateStr) {
			let [y, m, d] = dateStr.split("-").map((n) => parseInt(n, 10));
			customDate = new Date(y, m - 1, d);
		}
		if (!customDate) customDate = new Date();
		customDate.setHours(5, 0, 0, 0);
		start = new Date(customDate);
		end = new Date(customDate);
		end.setDate(end.getDate() + 1);
		titleText = `🏠 全店總計 (${dateStr || "自選日"})`;
		bizStart = getBusinessDate(start);
		bizEnd = bizStart + DAY_MS;
	}

	let stats = {
		barRev: 0,
		barCost: 0,
		bbqRev: 0,
		bbqCost: 0,
		unknownRev: 0,
		unknownCost: 0,
		extraRev: 0, // 整單折扣/折讓/服務費統一放這裡
		totalRev: 0,
	};
	revenueDetails = { bar: [], bbq: [], unknown: [], extra: [] };

	if (Array.isArray(historyOrders)) {
		historyOrders.forEach((order) => {
			if (!order) return;
			let t = getDateFromOrder(order);
			let biz = getBusinessDate(t);

			if (
				bizStart !== null &&
				bizEnd !== null &&
				biz >= bizStart &&
				biz < bizEnd
			) {
				let items = Array.isArray(order.items) ? order.items : [];
				let total = order.total || 0;
				let barSum = 0;
				let bbqSum = 0;
				let unknownSum = 0;

				items.forEach((item) => {
					let cost = getCostByItemName(item.name);
					let name = item.name.replace(" (招待)", "").trim();
					let type = item.type || getItemCategoryType(name);
					let itemPrice = item.price ? item.price : 0;

					if (type === "bar") {
						barSum += itemPrice;
						stats.barCost += cost;
						revenueDetails.bar.push({
							name,
							price: itemPrice,
							cost,
							time: order.time || t.toLocaleString("zh-TW", { hour12: false }),
							seq: order.formattedSeq || order.seq || "",
						});
					} else if (type === "bbq") {
						bbqSum += itemPrice;
						stats.bbqCost += cost;
						revenueDetails.bbq.push({
							name,
							price: itemPrice,
							cost,
							time: order.time || t.toLocaleString("zh-TW", { hour12: false }),
							seq: order.formattedSeq || order.seq || "",
						});
					} else {
						unknownSum += itemPrice;
						stats.unknownCost += cost;
						revenueDetails.unknown.push({
							name,
							price: itemPrice,
							cost,
							time: order.time || t.toLocaleString("zh-TW", { hour12: false }),
							seq: order.formattedSeq || order.seq || "",
						});
					}
				});

				let adjustment = total - (barSum + bbqSum + unknownSum); // 折扣/折讓/服務費
				stats.barRev += barSum;
				stats.bbqRev += bbqSum;
				stats.unknownRev += unknownSum;
				stats.extraRev += adjustment;
				if (adjustment !== 0) {
					revenueDetails.extra.push({
						amount: adjustment,
						seat: order.seat || "",
						time: order.time || t.toLocaleString("zh-TW", { hour12: false }),
						seq: order.formattedSeq || order.seq || "",
					});
				}
				stats.totalRev += total;
			}
		});
	}

	document.getElementById("financeTitle").innerText = titleText;

	document.getElementById("monthBarRev").innerText =
		`$${Math.round(stats.barRev)}`;
	document.getElementById("monthBarCost").innerText =
		`-$${Math.round(stats.barCost)}`;
	document.getElementById("monthBarProfit").innerText =
		`$${Math.round(stats.barRev - stats.barCost)}`;

	document.getElementById("monthBbqRev").innerText =
		`$${Math.round(stats.bbqRev)}`;
	document.getElementById("monthBbqCost").innerText =
		`-$${Math.round(stats.bbqCost)}`;
	document.getElementById("monthBbqProfit").innerText =
		`$${Math.round(stats.bbqRev - stats.bbqCost)}`;

	let unknownRevEl = document.getElementById("monthUnknownRev");
	if (unknownRevEl) unknownRevEl.innerText = `$${Math.round(stats.unknownRev)}`;

	let extraStr =
		stats.extraRev >= 0
			? `$${Math.round(stats.extraRev)}`
			: `-$${Math.abs(Math.round(stats.extraRev))}`;
	let extraEl = document.getElementById("monthExtraRev");
	if (extraEl) extraEl.innerText = extraStr;

	let totalRev =
		stats.totalRev ||
		stats.barRev + stats.bbqRev + stats.unknownRev + stats.extraRev;
	let totalCost = stats.barCost + stats.bbqCost + stats.unknownCost;
	document.getElementById("monthTotalRev").innerText =
		`$${Math.round(totalRev)}`;
	document.getElementById("monthTotalCost").innerText =
		`-$${Math.round(totalCost)}`;
	document.getElementById("monthTotalProfit").innerText =
		`$${Math.round(totalRev - totalCost)}`;
}

function openRevenueModal(type) {
	let modal = document.getElementById("revenueDetailModal");
	let list = document.getElementById("revenueDetailList");
	let title = document.getElementById("revenueDetailTitle");
	if (!modal || !list || !title) return;
	const map = {
		bar: "🍺 酒吧明細",
		bbq: "🍖 燒烤明細",
		unknown: "❔ 未分類明細",
		extra: "🎫 整單調整來源",
	};
	title.innerText = map[type] || "品項明細";

	let data = revenueDetails[type] || [];
	if (!Array.isArray(data) || data.length === 0) {
		list.innerHTML = "<div class='empty-hint'>目前區間沒有此類品項</div>";
	} else {
		if (type === "extra") {
			list.innerHTML = data
				.map((i) => {
					let amt =
						i.amount >= 0
							? `<span class="detail-price">$${Math.round(i.amount)}</span>`
							: `<span class="detail-price" style="color:#ef476f;">-$${Math.abs(Math.round(i.amount))}</span>`;
					let seatText = i.seat ? `<span class="detail-name">${i.seat}</span>` : "";
					let seqText = i.seq ? `<span class="detail-price">#${i.seq}</span>` : "";
					return `<div class="detail-item-row">
                        ${seqText}
                        ${seatText}
                        <div class="detail-info">
                            ${amt}
                            <span class="detail-time">${i.time || "--:--"}</span>
                        </div>
                    </div>`;
				})
				.join("");
		} else {
			list.innerHTML = data
				.map((i) => {
					let costText =
						typeof i.cost === "number" && i.cost > 0
							? `<span class="detail-price" style="color:#ef476f;">成本 $${i.cost}</span>`
							: "";
					return `<div class="detail-item-row">
					<span class="detail-price">#${i.seq}</span>
                    <div class="detail-name">${i.name}</div>
                    <div class="detail-info">
                        <span class="detail-price">$${i.price}</span>
                        ${costText}
                        <span class="detail-time">${i.time || "--:--"}</span>
                    </div>
                </div>`;
				})
				.join("");
		}
	}
	modal.style.display = "flex";
}
function closeRevenueModal() {
	let modal = document.getElementById("revenueDetailModal");
	if (modal) modal.style.display = "none";
}

function showOwnerDetailedOrders(year, month, day) {
	let targetDate = new Date(year, month, day);
	document.getElementById("ownerSelectedDateTitle").innerText =
		`📅 ${year}/${month + 1}/${day} 詳細訂單`;
	document.getElementById("ownerOrderListSection").style.display = "block";
	let box = document.getElementById("ownerOrderBox");
	box.innerHTML = "";

	let targetOrders = getOrdersByDate(targetDate);
	if (targetOrders.length === 0) {
		box.innerHTML =
			"<div style='padding:20px; text-align:center;'>無資料</div>";
		return;
	}

	targetOrders.reverse().forEach((o) => {
		let seqDisplay = o.formattedSeq ? `#${o.formattedSeq}` : `#?`;
		let timeOnly = o.time.split(" ")[1] || o.time;
		let summary = o.items
			.map((i) => {
				let n = i.name;
				if (i.count > 1) n += ` x${i.count}`;
				if (i.isTreat && !n.includes("(招待)")) n += ` (招待)`;
				return n;
			})
			.join("、");

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
	document
		.getElementById("ownerOrderListSection")
		.scrollIntoView({ behavior: "smooth" });
}

/* 🔥 滑動式按鈕動畫控制 */
function moveSegmentHighlighter(index) {
	const highlighter = document.getElementById("reportHighlighter");
	const options = document.querySelectorAll(
		".segment-control-container .segment-option",
	);
	options.forEach((opt) => opt.classList.remove("active"));
	if (options[index]) options[index].classList.add("active");
	const movePercent = index * 100;
	if (highlighter) highlighter.style.transform = `translateX(${movePercent}%)`;
}

function showToast(message, options = {}) {
	const toast = document.getElementById("toast-container");
	if (!toast) return;

	if (!toast.toastState) {
		toast.toastState = { items: new Map() };
	}

	let state = toast.toastState.items.get(message);
	if (!state) {
		let el = document.createElement("div");
		el.className = "toast-item";
		state = { count: 0, el, hideTimer: null, removeTimer: null };
		toast.appendChild(el);
	}

	if (typeof options.count === "number" && options.count > 0) {
		state.count = options.count;
	} else {
		state.count += 1;
	}
	state.el.innerHTML = "";
	const msgSpan = document.createElement("span");
	const plainNode = document.createElement("div");
	plainNode.innerHTML = message;
	msgSpan.textContent = plainNode.innerText;
	state.el.appendChild(msgSpan);

	if (state.count > 1) {
		const countSpan = document.createElement("span");
		countSpan.textContent = ` x${state.count}`;
		countSpan.style.color = "#ef476f";
		countSpan.style.fontWeight = "bold";
		countSpan.style.marginLeft = "6px";
		state.el.appendChild(countSpan);
	}

	// Re-append to move it to the newest position
	toast.appendChild(state.el);

	if (state.hideTimer) clearTimeout(state.hideTimer);
	if (state.removeTimer) clearTimeout(state.removeTimer);

	// Show animation
	requestAnimationFrame(() => {
		state.el.classList.add("show");
	});

	state.hideTimer = setTimeout(() => {
		state.el.classList.remove("show");
		state.removeTimer = setTimeout(() => {
			if (state.el.parentNode) state.el.parentNode.removeChild(state.el);
			toast.toastState.items.delete(message);
		}, 300);
	}, 2500);

	toast.toastState.items.set(message, state);
}
function closeSummaryModal() {
	summaryModal.style.display = "none";
}

function openChangePasswordModal(ownerName) {
	document.getElementById("pwdOwnerName").innerText = ownerName;
	document.getElementById("oldPwd").value = "";
	document.getElementById("newPwd").value = "";
	document.getElementById("confirmPwd").value = "";
	changePasswordModal.style.display = "flex";
}

function closeChangePasswordModal() {
	changePasswordModal.style.display = "none";
}

function confirmChangePassword() {
	let ownerName = document.getElementById("pwdOwnerName").innerText;
	let oldPwd = document.getElementById("oldPwd").value;
	let newPwd = document.getElementById("newPwd").value;
	let confirmPwd = document.getElementById("confirmPwd").value;

	if (!OWNER_PASSWORDS || OWNER_PASSWORDS[ownerName] === undefined) {
		alert("找不到該帳號");
		return;
	}
	if (oldPwd !== OWNER_PASSWORDS[ownerName]) {
		alert("舊密碼錯誤");
		return;
	}
	if (!newPwd) {
		alert("請輸入新密碼");
		return;
	}
	if (newPwd !== confirmPwd) {
		alert("兩次新密碼不一致");
		return;
	}

	OWNER_PASSWORDS[ownerName] = newPwd;
	saveAllToCloud({ [`ownerPasswords/${ownerName}`]: newPwd });
	alert("✅ 密碼已更新");
	closeChangePasswordModal();
}
window.toggleDetail = function (id) {
	let el = document.getElementById(id);
	if (el.style.display === "none") {
		el.style.display = "block";
	} else {
		el.style.display = "none";
	}
};
window.toggleAccordion = function (id) {
	let el = document.getElementById(id);
	if (!el) return;
	let btn = el.previousElementSibling;
	el.classList.toggle("show");
	if (btn) btn.classList.toggle("active");
};

/* ========== 這裡是最重要的修正區域 ========== */
/* 在 DOMContentLoaded 監聽器中，加入 buildCategories() 呼叫 */
window.addEventListener("DOMContentLoaded", async () => {
	const urlParams = new URLSearchParams(window.location.search);
	const tableParam = urlParams.get("table");
	const storedCustomerMode = sessionStorage.getItem("customerMode") === "true";
	if (tableParam) {
		console.log("進入客人點餐模式，桌號:", tableParam);
		document.body.classList.add("customer-mode");
		sessionStorage.setItem("customerMode", "true");
		sessionStorage.setItem("isLoggedIn", "true");
		await ensureSubscriptions(["tableCarts", "inventory", "itemPrices"]);
		showApp({ skipHome: true });
		selectedTable = decodeURIComponent(tableParam);
		hideAll();
		document.getElementById("orderPage").style.display = "block";
		document.getElementById("seatLabel").innerText =
			"（" + selectedTable + "）";
		const saveBtn = document.querySelector(".save-btn");
		if (saveBtn) {
			saveBtn.innerText = "🚀 送出廚房";
			saveBtn.onclick = customerSubmitOrder;
		}
		document.getElementById("seatTimer").style.display = "none";

		buildCategories();

		sentItems = (tableCarts[selectedTable] || []).map((item) => ({
			...item,
			isSent: true,
		}));
		sessionStorage.setItem("sentItems", JSON.stringify(sentItems));
		cart = [];
		renderCart();
	} else {
		if (storedCustomerMode) {
			sessionStorage.removeItem("isLoggedIn");
			sessionStorage.removeItem("customerMode");
			if (document.getElementById("login-screen")) {
				document.getElementById("login-screen").style.display = "block";
			}
			if (document.getElementById("app-container")) {
				document.getElementById("app-container").style.display = "none";
			}
			return;
		}
		if (sessionStorage.getItem("isLoggedIn") === "true") {
			showApp();
		}
	}
});


if (typeof window !== "undefined") {
	window.FOOD_OPTION_VARIANTS = FOOD_OPTION_VARIANTS;
	window.getAvailableVariants = getAvailableVariants;
	window.hasAvailableVariants = hasAvailableVariants;
	window.toggleOptionStock = toggleOptionStock;
	window.toggleParentWithOptions = toggleParentWithOptions;
	window.toggleHistoryView = toggleHistoryView;
	window.closeBusiness = closeBusiness;
}
