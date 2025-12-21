/* logic.js - 核心邏輯 (v15: 工作單與 UI 修正) */
console.log("Logic JS v15 Loaded - 核心邏輯已載入");

if (!firebase.apps.length) {
	firebase.initializeApp(firebaseConfig);
}
const db = firebase.database();

// 全域變數初始化
let historyOrders = [];
let tableTimers = {};
let tableCarts = {};
let tableStatuses = {};
let tableCustomers = {};
let tableSplitCounters = {};
let itemCosts = {};
let itemPrices = {};
let inventory = {};

let ownerPasswords = { 景偉: "0001", 小飛: "0002", 威志: "0003" };
let incomingOrders = {};
let tableBatchCounts = {};

const DATA_ROOT_KEYS = [
	"historyOrders",
	"tableTimers",
	"tableCarts",
	"tableStatuses",
	"tableCustomers",
	"tableSplitCounters",
	"itemCosts",
	"itemPrices",
	"inventory",
	"incomingOrders",
	"tableBatchCounts",
	"ownerPasswords",
];
const LOCAL_DATA_PREFIX = "localData.";
const LOCAL_REV_KEY = "localRevisions";

let selectedTable = null;
let cart = [];
// 🔥 新增：用來儲存客人已送出的商品 (從暫存讀取)
let sentItems = JSON.parse(sessionStorage.getItem("sentItems")) || [];

let seatTimerInterval = null;
let tempCustomItem = null;
let isExtraShot = false;
let tempLeftList = [];
let tempRightList = [];
let currentOriginalTotal = 0;
let finalTotal = 0;
let currentDiscount = { type: "none", value: 0 };
let discountedTotal = 0;
let isServiceFeeEnabled = false;
let isQrMode = false;
let currentIncomingTable = null;
let entryCartSignature = "[]"; // 紀錄進入點餐頁時的購物車狀態

let historyViewDate = new Date();
let isCartSimpleMode = false;
let isHistorySimpleMode = false;

const DataSync = {
	localRevisions: {},
	remoteRevisions: {},
	initLocal() {
		this.loadLocalRevisions();
		this.loadLocalData();
	},
	setRemoteRevisions(revs) {
		this.remoteRevisions = revs || {};
	},
	loadLocalRevisions() {
		try {
			let raw = localStorage.getItem(LOCAL_REV_KEY);
			this.localRevisions = raw ? JSON.parse(raw) : {};
		} catch (e) {
			this.localRevisions = {};
		}
		DATA_ROOT_KEYS.forEach((key) => {
			if (typeof this.localRevisions[key] !== "number")
				this.localRevisions[key] = 0;
		});
	},
	saveLocalRevisions() {
		localStorage.setItem(LOCAL_REV_KEY, JSON.stringify(this.localRevisions));
	},
	saveLocalDataForRoots(roots) {
		roots.forEach((root) => {
			switch (root) {
				case "historyOrders":
					localStorage.setItem(
						`${LOCAL_DATA_PREFIX}historyOrders`,
						JSON.stringify(historyOrders || []),
					);
					break;
				case "tableTimers":
					localStorage.setItem(
						`${LOCAL_DATA_PREFIX}tableTimers`,
						JSON.stringify(tableTimers || {}),
					);
					break;
				case "tableCarts":
					localStorage.setItem(
						`${LOCAL_DATA_PREFIX}tableCarts`,
						JSON.stringify(tableCarts || {}),
					);
					break;
				case "tableStatuses":
					localStorage.setItem(
						`${LOCAL_DATA_PREFIX}tableStatuses`,
						JSON.stringify(tableStatuses || {}),
					);
					break;
				case "tableCustomers":
					localStorage.setItem(
						`${LOCAL_DATA_PREFIX}tableCustomers`,
						JSON.stringify(tableCustomers || {}),
					);
					break;
				case "tableSplitCounters":
					localStorage.setItem(
						`${LOCAL_DATA_PREFIX}tableSplitCounters`,
						JSON.stringify(tableSplitCounters || {}),
					);
					break;
				case "itemCosts":
					localStorage.setItem(
						`${LOCAL_DATA_PREFIX}itemCosts`,
						JSON.stringify(itemCosts || {}),
					);
					break;
				case "itemPrices":
					localStorage.setItem(
						`${LOCAL_DATA_PREFIX}itemPrices`,
						JSON.stringify(itemPrices || {}),
					);
					break;
				case "inventory":
					localStorage.setItem(
						`${LOCAL_DATA_PREFIX}inventory`,
						JSON.stringify(inventory || {}),
					);
					break;
				case "incomingOrders":
					localStorage.setItem(
						`${LOCAL_DATA_PREFIX}incomingOrders`,
						JSON.stringify(incomingOrders || {}),
					);
					break;
				case "tableBatchCounts":
					localStorage.setItem(
						`${LOCAL_DATA_PREFIX}tableBatchCounts`,
						JSON.stringify(tableBatchCounts || {}),
					);
					break;
				case "ownerPasswords":
					localStorage.setItem(
						`${LOCAL_DATA_PREFIX}ownerPasswords`,
						JSON.stringify(OWNER_PASSWORDS || {}),
					);
					break;
				default:
					break;
			}
		});
	},
	loadLocalData() {
		DATA_ROOT_KEYS.forEach((root) => {
			let raw = localStorage.getItem(`${LOCAL_DATA_PREFIX}${root}`);
			if (!raw) return;
			try {
				let val = JSON.parse(raw);
				switch (root) {
					case "historyOrders":
						normalizeHistoryData(val);
						break;
					case "tableTimers":
						tableTimers = val || {};
						break;
					case "tableCarts":
						tableCarts = val || {};
						break;
					case "tableStatuses":
						tableStatuses = val || {};
						break;
					case "tableCustomers":
						tableCustomers = val || {};
						break;
					case "tableSplitCounters":
						tableSplitCounters = val || {};
						break;
					case "itemCosts":
						itemCosts = val || {};
						break;
					case "itemPrices":
						itemPrices = val || {};
						break;
					case "inventory":
						inventory = val || {};
						break;
					case "incomingOrders":
						incomingOrders = val || {};
						break;
					case "tableBatchCounts":
						tableBatchCounts = val || {};
						break;
					case "ownerPasswords":
						OWNER_PASSWORDS = val || OWNER_PASSWORDS;
						break;
					default:
						break;
				}
			} catch (e) {
				// Ignore invalid local cache
			}
		});
	},
	getRootKey(path) {
		if (!path || typeof path !== "string") return "";
		return path.split("/")[0];
	},
	hasLocalCache(root) {
		return localStorage.getItem(`${LOCAL_DATA_PREFIX}${root}`) !== null;
	},
	shouldApplyRemote(root) {
		let remoteRev = this.remoteRevisions[root];
		let localRev = this.localRevisions[root] || 0;
		if (typeof remoteRev === "number") return remoteRev > localRev;
		return !this.hasLocalCache(root);
	},
	applyRemoteValue(root, value) {
		switch (root) {
			case "historyOrders":
				normalizeHistoryData(value);
				break;
			case "tableTimers":
				tableTimers = value || {};
				break;
			case "tableCarts":
				tableCarts = value || {};
				break;
			case "tableStatuses":
				tableStatuses = value || {};
				break;
			case "tableCustomers":
				tableCustomers = value || {};
				break;
			case "tableSplitCounters":
				tableSplitCounters = value || {};
				break;
			case "itemCosts":
				itemCosts = value || {};
				break;
			case "itemPrices":
				itemPrices = value || {};
				break;
			case "inventory":
				inventory = value || {};
				break;
			case "incomingOrders":
				incomingOrders = value || {};
				break;
			case "tableBatchCounts":
				tableBatchCounts = value || {};
				break;
			case "ownerPasswords":
				if (value) OWNER_PASSWORDS = value;
				break;
			default:
				break;
		}

		if (typeof this.remoteRevisions[root] === "number") {
			this.localRevisions[root] = this.remoteRevisions[root];
			this.saveLocalRevisions();
		}
		this.saveLocalDataForRoots([root]);

		if (root === "incomingOrders") {
			if (!document.body.classList.contains("customer-mode")) {
				checkIncomingOrders();
			}
		}

		if (
			root === "historyOrders" ||
			root === "tableTimers" ||
			root === "tableCarts" ||
			root === "tableStatuses" ||
			root === "tableCustomers" ||
			root === "inventory" ||
			root === "incomingOrders"
		) {
			refreshUiAfterDataChange();
		}
	},
	bumpRevisionsForPayload(payload, roots) {
		roots.forEach((root) => {
			this.localRevisions[root] = (this.localRevisions[root] || 0) + 1;
			payload[`revisions/${root}`] = this.localRevisions[root];
		});
		if (roots.length > 0) {
			this.saveLocalRevisions();
			this.saveLocalDataForRoots(roots);
		}
	},
};

function getTodayMaxBaseSeq() {
	let currentBizDate = getBusinessDate(new Date());
	let maxSeq = 0;
	if (Array.isArray(historyOrders)) {
		historyOrders.forEach((o) => {
			if (!o) return;
			if (getBusinessDate(getDateFromOrder(o)) !== currentBizDate) return;
			let base = 0;
			if (o.formattedSeq) {
				let parts = String(o.formattedSeq).split("-");
				base = parseInt(parts[0], 10) || 0;
			} else if (o.seq) {
				base = parseInt(o.seq, 10) || 0;
			}
			if (base > maxSeq) maxSeq = base;
		});
	}
	return maxSeq;
}

/* ========== 輔助函式 ========== */

function getMergedItems(items) {
	if (!items || !Array.isArray(items)) return [];
	let merged = [];
	items.forEach((item) => {
		if (!item) return; // 防呆
		// 修改：加入 isSent 的判斷，避免已送出和未送出的合併
		let existing = merged.find(
			(m) =>
				m.name === item.name &&
				m.price === item.price &&
				m.isTreat === item.isTreat &&
				m.batchIdx === item.batchIdx &&
				m.isSent === item.isSent,
		);
		if (existing) {
			existing.count = (existing.count || 1) + 1;
		} else {
			merged.push({ ...item, count: 1 });
		}
	});
	return merged;
}

function getItemSignature(item) {
	let name = item && item.name ? item.name : "";
	let price = item && item.price !== undefined ? item.price : "";
	let isTreat = item && item.isTreat ? 1 : 0;
	let batchIdx = item && item.batchIdx !== undefined ? item.batchIdx : "";
	let batchId = item && item.batchId !== undefined ? item.batchId : "";
	let sentAt = item && item.sentAt !== undefined ? item.sentAt : "";
	let incomingIdx =
		item && item.incomingIdx !== undefined ? item.incomingIdx : "";
	let isSent = item && item.isSent ? 1 : 0;
	return [
		name,
		price,
		isTreat,
		batchIdx,
		batchId,
		sentAt,
		incomingIdx,
		isSent,
	].join("||");
}

function getDeltaItems(currentCart, baseCart) {
	let baseCounts = new Map();
	baseCart.forEach((item) => {
		let key = getItemSignature(item);
		baseCounts.set(key, (baseCounts.get(key) || 0) + 1);
	});

	let delta = [];
	currentCart.forEach((item) => {
		let key = getItemSignature(item);
		let count = baseCounts.get(key) || 0;
		if (count > 0) baseCounts.set(key, count - 1);
		else delta.push(item);
	});
	return delta;
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
	if (isNaN(d.getTime())) d = new Date(); // 防呆
	if (d.getHours() < 5) d.setDate(d.getDate() - 1);
	d.setHours(0, 0, 0, 0);
	return d.getTime();
}

function getVisibleOrders() {
	if (
		!historyOrders ||
		!Array.isArray(historyOrders) ||
		historyOrders.length === 0
	)
		return [];
	try {
		let currentBizDate = getBusinessDate(new Date());
		let filtered = historyOrders.filter((o) => {
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
	itemName = itemName.match(/^[^<]+/)?.[0].trim();
	if (!itemName) return "unknown";
	if (itemName === "奶茶") return "bbq";
	const barCats = [
		"調酒",
		"純飲",
		"shot",
		"啤酒",
		"咖啡",
		"飲料",
		"厚片",
		"甜點",
		"其他",
	];
	const bbqCats = ["燒烤", "主餐", "炸物"];
	for (const [cat, content] of Object.entries(menuData)) {
		if (Array.isArray(content)) {
			if (content.some((x) => itemName.includes(x.name))) {
				if (barCats.includes(cat)) return "bar";
				if (bbqCats.includes(cat)) return "bbq";
			}
		} else {
			for (const subContent of Object.values(content)) {
				if (subContent.some((x) => itemName.includes(x.name))) {
					if (barCats.includes(cat)) return "bar";
					if (bbqCats.includes(cat)) return "bbq";
				}
			}
		}
	}
	if (
		itemName.includes("雞") ||
		itemName.includes("豬") ||
		itemName.includes("牛") ||
		itemName.includes("飯") ||
		itemName.includes("麵")
	)
		return "bbq";
	return "unknown";
}

function getCostByItemName(itemName) {
	if (!itemName) return 0;
	let cleanName = itemName.replace(" (招待)", "").trim();
	if (itemCosts[cleanName] !== undefined) return itemCosts[cleanName];
	let baseName = cleanName.replace(/\s*[\(（].*?[\)）]$/, "").trim();
	if (itemCosts[baseName] !== undefined) return itemCosts[baseName];
	if (cleanName.includes("隱藏特調")) {
		if (itemCosts["隱藏特調"] !== undefined) return itemCosts["隱藏特調"];
	}
	return 0;
}


/* ========== 資料庫監聽與初始化 ========== */

function refreshUiAfterDataChange() {
	if (
		document.getElementById("tableSelect") &&
		document.getElementById("tableSelect").style.display === "block"
	)
		renderTableGrid();

	setTimeout(() => {
		if (
			document.getElementById("historyPage") &&
			document.getElementById("historyPage").style.display === "block"
		)
			showHistory();

		if (
			document.getElementById("reportPage") &&
			document.getElementById("reportPage").style.display === "block"
		) {
			let activeOption = document.querySelector(".segment-option.active");
			let type =
				activeOption && activeOption.innerText === "本周"
					? "week"
					: activeOption && activeOption.innerText === "當月"
						? "month"
						: "day";
			generateReport(type);
			renderCalendar();
		}

		if (
			document.getElementById("itemStatsModal") &&
			document.getElementById("itemStatsModal").style.display === "flex"
		) {
			let activeBtn = document.querySelector(".report-controls button.active");
			let range = "day";
			if (activeBtn) {
				if (activeBtn.id === "statBtnWeek") range = "week";
				if (activeBtn.id === "statBtnMonth") range = "month";
			}
			renderItemStats(range);
		}

		if (
			document.getElementById("pastHistoryPage") &&
			document.getElementById("pastHistoryPage").style.display === "block"
		) {
			renderPublicStats();
		}
	}, 50);

	let currentOwner = document.getElementById("ownerWelcome")
		? document.getElementById("ownerWelcome").innerText
		: "";
	if (
		document.getElementById("confidentialPage") &&
		document.getElementById("confidentialPage").style.display === "block" &&
		currentOwner
	) {
		let savedMode = sessionStorage.getItem("ownerMode") || "finance";
		if (savedMode === "cost") {
			updateFinancialPage(currentOwner);
		} else {
			renderConfidentialCalendar(currentOwner);
		}
	}
}

function normalizeHistoryData(val) {
	let rawHistory = val
		? Array.isArray(val)
			? val
			: Object.values(val)
		: [];
	historyOrders = rawHistory.filter((order) => {
		return (
			order &&
			typeof order === "object" &&
			Array.isArray(order.items) &&
			order.total !== undefined
		);
	});
}

function initRealtimeData() {
	DataSync.initLocal();
	refreshUiAfterDataChange();

	db.ref("revisions").on("value", (snapshot) => {
		let revs = snapshot.val() || {};
		DataSync.setRemoteRevisions(revs);
		DATA_ROOT_KEYS.forEach((root) => {
			if (DataSync.shouldApplyRemote(root)) {
				db.ref(root)
					.once("value")
					.then((snap) => DataSync.applyRemoteValue(root, snap.val()))
					.catch(() => { });
			}
		});
	});

	DATA_ROOT_KEYS.forEach((root) => {
		db.ref(root).on("value", (snapshot) => {
			if (!DataSync.shouldApplyRemote(root)) return;
			DataSync.applyRemoteValue(root, snapshot.val());
		});
	});
}

function checkIncomingOrders() {
	if (!incomingOrders) return;
	const tables = Object.keys(incomingOrders);
	for (let t of tables) {
		let q = incomingOrders[t];
		let arr = Array.isArray(q) ? q : q ? Object.values(q) : [];
		if (arr.length > 0) {
			showIncomingOrderModal(t, arr[0]);
			return;
		}
	}
	closeIncomingOrderModal();
}

function saveAllToCloud(updates) {
	if (!updates || typeof updates !== "object" || Object.keys(updates).length === 0) {
		console.warn("saveAllToCloud called without updates; skipping cloud write.");
		return Promise.resolve();
	}

	let payload = {};
	let touchedRoots = new Set();
	for (const [path, value] of Object.entries(updates)) {
		payload[path] = value === undefined ? null : value;
		let root = DataSync.getRootKey(path);
		if (root) touchedRoots.add(root);
	}
	DataSync.bumpRevisionsForPayload(payload, Array.from(touchedRoots));

	return db.ref("/").update(payload).catch((err) => console.error(err));
}

function refreshData() {
	try {
		let localHist = JSON.parse(localStorage.getItem("localData.historyOrders")) || JSON.parse(localStorage.getItem("orderHistory"));
		if (localHist && (!historyOrders || historyOrders.length === 0))
			historyOrders = localHist;
	} catch (e) { }
}

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
	} catch (e) {
		alert("登入錯誤: " + e.message);
	}
}

function updateItemData(name, type, value) {
	let val = parseInt(value);
	if (isNaN(val)) val = 0;
	if (type === "cost") itemCosts[name] = val;
	else if (type === "price") itemPrices[name] = val;
	const path = type === "cost" ? `itemCosts/${name}` : `itemPrices/${name}`;
	saveAllToCloud({ [path]: val });
}

function toggleStockStatus(name, isAvailable) {
	if (!inventory) inventory = {};
	inventory[name] = isAvailable;

	// UI Update
	let el = document.getElementById(`status-main-${name}`);
	if (el) {
		el.innerText = isAvailable ? "有貨" : "售完";
		el.style.color = isAvailable ? "#06d6a0" : "#ef476f";
	}

	saveAllToCloud({ [`inventory/${name}`]: isAvailable });
}

function toggleOptionStock(name, option, isAvailable) {
	if (!inventory) inventory = {};
	inventory[`${name}::${option}`] = isAvailable;

	// UI Update (Self)
	let optEl = document.getElementById(`status-opt-${name}::${option}`);
	if (optEl) {
		optEl.innerText = isAvailable ? "顯示" : "隱藏";
		optEl.style.color = isAvailable ? "#06d6a0" : "#ef476f";
	}

	// 若全關，主品項也視為下架；若開啟其中一個，主品項恢復上架
	if (FOOD_OPTION_VARIANTS[name]) {
		let hasAny = FOOD_OPTION_VARIANTS[name].some(
			(opt) => inventory[`${name}::${opt}`] !== false,
		);
		inventory[name] = hasAny;

		// UI Update (Parent)
		let parentEl = document.getElementById(`status-main-${name}`);
		if (parentEl) {
			parentEl.innerText = hasAny ? "有貨" : "售完";
			parentEl.style.color = hasAny ? "#06d6a0" : "#ef476f";
			// Update parent checkbox
			let label = parentEl.nextElementSibling;
			if (label) {
				let cb = label.querySelector("input");
				if (cb) cb.checked = hasAny;
			}
		}
	}

	let updates = { [`inventory/${name}::${option}`]: isAvailable };
	if (FOOD_OPTION_VARIANTS[name]) {
		let hasAny = FOOD_OPTION_VARIANTS[name].some(
			(opt) => inventory[`${name}::${opt}`] !== false,
		);
		updates[`inventory/${name}`] = hasAny;
	}
	saveAllToCloud(updates);
}

function toggleParentWithOptions(name, isAvailable) {
	if (!inventory) inventory = {};
	inventory[name] = isAvailable;

	// UI Update (Self)
	let parentEl = document.getElementById(`status-main-${name}`);
	if (parentEl) {
		parentEl.innerText = isAvailable ? "有貨" : "售完";
		parentEl.style.color = isAvailable ? "#06d6a0" : "#ef476f";
	}

	if (FOOD_OPTION_VARIANTS[name]) {
		FOOD_OPTION_VARIANTS[name].forEach((opt) => {
			inventory[`${name}::${opt}`] = isAvailable;

			// UI Update (Children)
			let optEl = document.getElementById(`status-opt-${name}::${opt}`);
			if (optEl) {
				optEl.innerText = isAvailable ? "顯示" : "隱藏";
				optEl.style.color = isAvailable ? "#06d6a0" : "#ef476f";
				// Update child checkbox
				let label = optEl.nextElementSibling;
				if (label) {
					let cb = label.querySelector("input");
					if (cb) cb.checked = isAvailable;
				}
			}
		});
	}
	let updates = { [`inventory/${name}`]: isAvailable };
	if (FOOD_OPTION_VARIANTS[name]) {
		FOOD_OPTION_VARIANTS[name].forEach((opt) => {
			updates[`inventory/${name}::${opt}`] = isAvailable;
		});
	}
	saveAllToCloud(updates);
}

function getAvailableVariants(name) {
	let variants = FOOD_OPTION_VARIANTS[name];
	if (!variants) return null;
	return variants.filter((opt) => inventory[`${name}::${opt}`] !== false);
}

function hasAvailableVariants(name) {
	let variants = FOOD_OPTION_VARIANTS[name];
	if (!variants) return inventory[name] !== false;
	if (inventory[name] === false) return false;
	return getAvailableVariants(name).length > 0;
}

function addToCart(name, price) {
	cart.push({ name, price, isNew: true, isTreat: false });
	renderCart();
}
function toggleTreat(index) {
	cart[index].isTreat = !cart[index].isTreat;
	renderCart();
}
function removeItem(index) {
	cart.splice(index, 1);
	renderCart();
}

function saveOrderManual() {
	try {
		if (cart.length === 0) {
			showToast("購物車是空的，訂單未成立。");
			saveAndExit();
			return;
		}
		if (!tableCustomers[selectedTable]) tableCustomers[selectedTable] = {};

		if (!tableTimers[selectedTable] || !tableCustomers[selectedTable].orderId) {
			tableTimers[selectedTable] = Date.now();
			tableSplitCounters[selectedTable] = 1;
			let currentBizDate = getBusinessDate(new Date());
			let todayCount = historyOrders.filter(
				(o) => getBusinessDate(getDateFromOrder(o)) === currentBizDate,
			).length;
			tableCustomers[selectedTable].orderId = todayCount + 1;
		}

		let itemsToSave = cart.map((item) => {
			let newItem = { ...item };
			delete newItem.isNew;
			return newItem;
		});

		let baseCart = [];
		try {
			baseCart = JSON.parse(entryCartSignature || "[]");
		} catch (e) {
			baseCart = [];
		}
		let newItems = getDeltaItems(cart, baseCart);

		tableCarts[selectedTable] = itemsToSave;
		tableStatuses[selectedTable] = "yellow";
		tableCustomers[selectedTable].name =
			document.getElementById("custName").value;
		tableCustomers[selectedTable].phone =
			document.getElementById("custPhone").value;

		saveAllToCloud({
			[`tableCarts/${selectedTable}`]: itemsToSave,
			[`tableStatuses/${selectedTable}`]: "yellow",
			[`tableCustomers/${selectedTable}`]: tableCustomers[selectedTable],
			[`tableTimers/${selectedTable}`]: tableTimers[selectedTable],
			[`tableSplitCounters/${selectedTable}`]: tableSplitCounters[selectedTable],
		});

		let shouldPrintItems = baseCart.length > 0 ? newItems : cart;
		if (shouldPrintItems.length > 0) {
			printReceipt(
				{
					seq: tableCustomers[selectedTable].orderId,
					table: selectedTable,
					time: new Date().toLocaleString("zh-TW", { hour12: false }),
					items: shouldPrintItems,
					original: 0,
					total: 0,
				},
				true,
			);
		}

		showToast(
			`✔ 訂單已送出 (單號 #${tableCustomers[selectedTable].orderId})！`,
		);
		openTableSelect();
	} catch (e) {
		alert("出單發生錯誤: " + e.message);
	}
}

function saveAndExit() {
	try {
		if (!Array.isArray(cart)) cart = [];
		let hasChanges = JSON.stringify(cart) !== entryCartSignature;
		if (hasChanges) {
			if (
				!confirm(
					"⚠️ 本次點餐有變更，確定要離開嗎？\n(離開後，這些未送出的商品將被清空)",
				)
			)
				return;
		}
		cart = [];
		entryCartSignature = "[]";
		currentDiscount = { type: "none", value: 0 };
		isServiceFeeEnabled = false;
		tempCustomItem = null;
		openTableSelect();
	} catch (e) {
		console.error("返回錯誤:", e);
		openTableSelect();
	}
}

function closeBusiness() {
	if (!confirm("確定要結束營業並清空今日資料嗎？")) return;
	// 暫時不實作
	// showToast("已結束營業，資料已清空");
	goHome();
}

async function customerSubmitOrder() {
	if (cart.length === 0) {
		alert("目前購物車內無新增品項！");
		return;
	}

	// 以 transaction 取得唯一批次，避免並發送單顏色重複
	let nextBatch = 1;
	try {
		let txResult = await db
			.ref(`tableBatchCounts/${selectedTable}`)
			.transaction((curr) => (curr || 0) + 1);
		if (!txResult.committed) throw new Error("批次編號更新失敗");
		nextBatch = txResult.snapshot.val() || 1;
		tableBatchCounts[selectedTable] = nextBatch;
	} catch (err) {
		alert("取得批次編號失敗，請稍後再試：" + err.message);
		return;
	}
	let batchColorIdx = (nextBatch - 1) % 3;

	let itemsToSend = cart.map((item, idx) => ({
		...item,
		isNew: true,
		batchIdx: batchColorIdx,
		incomingIdx: idx,
	}));

	let customerInfo = {
		name: document.getElementById("custName").value || "",
		phone: document.getElementById("custPhone").value || "",
	};

	// 取最新 incoming queue 避免覆蓋
	let latestSnap = await db
		.ref(`incomingOrders/${selectedTable}`)
		.once("value")
		.catch(() => null);
	let pendingList = [];
	if (latestSnap && latestSnap.val()) {
		let val = latestSnap.val();
		if (Array.isArray(val)) pendingList = [...val];
		else if (typeof val === "object") pendingList = Object.values(val);
	}
	pendingList.push({
		items: itemsToSend,
		customer: customerInfo,
		batchId: nextBatch,
		timestamp: Date.now(),
	});

	saveAllToCloud({ [`incomingOrders/${selectedTable}`]: pendingList })
		.then(() => {
			alert(
				"✅ 點餐成功！\n\n您的訂單已傳送至櫃台，\n服務人員確認後將為您準備餐點。",
			);

			// 🔥 修改：將購物車內容移至 sentItems
			let justSent = cart.map((item) => ({ ...item, isSent: true }));
			sentItems = [...sentItems, ...justSent];
			sessionStorage.setItem("sentItems", JSON.stringify(sentItems));

			cart = [];
			renderCart();
		})
		.catch((err) => {
			alert("傳送失敗，請通知服務人員：" + err.message);
		});
}

function confirmIncomingOrder() {
	if (!currentIncomingTable) return;

	let pendingRaw = incomingOrders[currentIncomingTable];
	let pendingQueue = Array.isArray(pendingRaw)
		? pendingRaw
		: pendingRaw
			? Object.values(pendingRaw)
			: [];
	if (!pendingQueue.length) {
		delete incomingOrders[currentIncomingTable];
		saveAllToCloud({ [`incomingOrders/${currentIncomingTable}`]: null });
		closeIncomingOrderModal();
		checkIncomingOrders();
		return;
	}
	let pendingData = pendingQueue.shift();

	// 將顧客送出的同一批次訂單附上時間/批次，避免被拆成多次列印
	let sentAt = pendingData.timestamp || Date.now();
	let batchId = pendingData.batchId;
	let rawItems = Array.isArray(pendingData.items)
		? pendingData.items
		: Object.values(pendingData.items || {});
	let items = rawItems
		.filter(Boolean)
		.map((i, idx) => ({
			...i,
			batchId,
			sentAt,
			incomingIdx: i.incomingIdx !== undefined ? i.incomingIdx : idx,
		}))
		.sort((a, b) => (a.incomingIdx || 0) - (b.incomingIdx || 0));
	let cust = pendingData.customer || {};

	tableBatchCounts[currentIncomingTable] = batchId;

	let currentCart = tableCarts[currentIncomingTable] || [];
	let newCart = currentCart.concat(items);
	tableCarts[currentIncomingTable] = newCart;
	// 只有在正在查看同一桌時才同步畫面購物車，避免其他桌被覆蓋
	const isViewingSameTable = selectedTable === currentIncomingTable;
	if (isViewingSameTable) {
		cart = newCart;
		entryCartSignature = JSON.stringify(cart || []);
	}

	tableStatuses[currentIncomingTable] = "yellow";
	if (!tableCustomers[currentIncomingTable])
		tableCustomers[currentIncomingTable] = {};
	if (cust.name) tableCustomers[currentIncomingTable].name = cust.name;

	if (
		!tableTimers[currentIncomingTable] ||
		!tableCustomers[currentIncomingTable].orderId
	) {
		tableTimers[currentIncomingTable] = Date.now();
		tableSplitCounters[currentIncomingTable] = 1;
		let currentBizDate = getBusinessDate(new Date());
		let todayCount = historyOrders.filter(
			(o) => getBusinessDate(getDateFromOrder(o)) === currentBizDate,
		).length;
		tableCustomers[currentIncomingTable].orderId = todayCount + 1;
	}

	printReceipt(
		{
			seq: tableCustomers[currentIncomingTable].orderId,
			table: currentIncomingTable,
			time: new Date(sentAt).toLocaleString("zh-TW", { hour12: false }),
			items: items,
			original: 0,
			total: 0,
		},
		true,
	);

	delete incomingOrders[currentIncomingTable];
	if (pendingQueue.length > 0) {
		incomingOrders[currentIncomingTable] = pendingQueue;
	}

	saveAllToCloud({
		[`incomingOrders/${currentIncomingTable}`]:
			pendingQueue.length > 0 ? pendingQueue : null,
		[`tableBatchCounts/${currentIncomingTable}`]: batchId,
		[`tableCarts/${currentIncomingTable}`]: newCart,
		[`tableStatuses/${currentIncomingTable}`]: "yellow",
		[`tableCustomers/${currentIncomingTable}`]: tableCustomers[currentIncomingTable],
		[`tableTimers/${currentIncomingTable}`]: tableTimers[currentIncomingTable],
		[`tableSplitCounters/${currentIncomingTable}`]:
			tableSplitCounters[currentIncomingTable],
	});
	closeIncomingOrderModal();
	showToast(`✅ 已接收 ${currentIncomingTable} 的訂單`);
	checkIncomingOrders();
	if (isViewingSameTable) renderCart();
}

function rejectIncomingOrder() {
	if (!currentIncomingTable) return;
	if (!confirm("確定要忽略這筆訂單嗎？")) return;
	let pendingRaw = incomingOrders[currentIncomingTable];
	let pendingQueue = Array.isArray(pendingRaw)
		? pendingRaw
		: pendingRaw
			? Object.values(pendingRaw)
			: [];
	if (pendingQueue.length > 0) pendingQueue.shift();
	if (pendingQueue.length === 0) delete incomingOrders[currentIncomingTable];
	else incomingOrders[currentIncomingTable] = pendingQueue;
	saveAllToCloud({
		[`incomingOrders/${currentIncomingTable}`]:
			pendingQueue.length === 0 ? null : pendingQueue,
	});
	closeIncomingOrderModal();
	checkIncomingOrders();
}

function checkoutAll(manualFinal) {
	let payingTotal = manualFinal !== undefined ? manualFinal : discountedTotal;
	let time = new Date().toLocaleString("zh-TW", { hour12: false });
	let originalTotal = currentOriginalTotal;
	let info = tableCustomers[selectedTable] || {
		name: "",
		phone: "",
		orderId: "?",
	};
	let currentBizDate = getBusinessDate(new Date());
	let todayOrders = historyOrders.filter(
		(o) => getBusinessDate(getDateFromOrder(o)) === currentBizDate,
	);
	if (!info.orderId || info.orderId === "?" || info.orderId === "T") {
		info.orderId = todayOrders.length + 1;
	}

	if (originalTotal > 0 || payingTotal > 0) {
		let splitNum = tableSplitCounters[selectedTable];
		let displaySeq = info.orderId;
		let displaySeat = selectedTable;
		if (splitNum && splitNum > 1) {
			displaySeq = `${info.orderId}-${splitNum}`;
			displaySeat = `${selectedTable} (拆單)`;
		}
		let processedItems = cart.map((item) => {
			let name = item.name;
			let price = item.price;
			let type = getItemCategoryType(name);
			if (item.isTreat) {
				if (!name.includes("(招待)")) name = `${name} (招待)`;
				price = 0;
			}
			return { ...item, name, price, type };
		});
		// Firebase 不接受 undefined，確保客人資訊至少為空字串
		let newOrder = {
			seat: displaySeat,
			formattedSeq: displaySeq,
			time: time,
			timestamp: Date.now(),
			items: processedItems,
			total: payingTotal,
			originalTotal: originalTotal,
			customerName: info.name || "",
			customerPhone: info.phone || "",
			isClosed: false,
		};
		if (!Array.isArray(historyOrders)) historyOrders = [];
		historyOrders.push(newOrder);
	}
	delete tableCarts[selectedTable];
	delete tableTimers[selectedTable];
	delete tableStatuses[selectedTable];
	delete tableCustomers[selectedTable];
	delete tableSplitCounters[selectedTable];
	delete tableBatchCounts[selectedTable];

	// 清除該桌的 sentItems
	sentItems = [];
	sessionStorage.removeItem("sentItems");

	const updates = {
		historyOrders,
		[`tableCarts/${selectedTable}`]: null,
		[`tableTimers/${selectedTable}`]: null,
		[`tableStatuses/${selectedTable}`]: null,
		[`tableCustomers/${selectedTable}`]: null,
		[`tableSplitCounters/${selectedTable}`]: null,
		[`tableBatchCounts/${selectedTable}`]: null,
	};
	saveAllToCloud(updates);
	cart = [];
	currentDiscount = { type: "none", value: 0 };
	isServiceFeeEnabled = false;
	alert(`💰 結帳完成！實收 $${payingTotal} \n(如需明細，請至「今日訂單」補印)`);
	openTableSelect();
}

function calcFinalPay() {
	let allowance = parseInt(document.getElementById("payAllowance").value) || 0;
	finalTotal = discountedTotal - allowance;
	if (finalTotal < 0) finalTotal = 0;
	document.getElementById("payFinal").value = finalTotal;
}
function calcSplitTotal() {
	let baseTotal = tempRightList.reduce(
		(a, b) => a + (b.isTreat ? 0 : b.price),
		0,
	);
	let disc = parseFloat(document.getElementById("splitDisc").value);
	let allow = parseInt(document.getElementById("splitAllow").value);
	let finalSplit = baseTotal;
	if (!isNaN(disc) && disc > 0 && disc <= 100) {
		finalSplit = Math.round(baseTotal * (disc / 100));
	}
	if (!isNaN(allow) && allow > 0) {
		finalSplit = finalSplit - allow;
	}
	if (finalSplit < 0) finalSplit = 0;
	document.getElementById("payTotal").innerText = "$" + finalSplit;
	return finalSplit;
}

function fixAllOrderIds() {
	if (
		!confirm(
			"⚠️ 確定要執行「一鍵重整」嗎？\n\n1. 將所有歷史訂單依照日期重新編號 (#1, #2...)\n2. 修正目前桌上未結帳訂單的錯誤單號",
		)
	)
		return;
	historyOrders.sort((a, b) => new Date(a.time) - new Date(b.time));
	let dateCounters = {};
	historyOrders.forEach((order) => {
		let d = new Date(order.time);
		if (d.getHours() < 5) d.setDate(d.getDate() - 1);
		let dateKey = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
		if (!dateCounters[dateKey]) dateCounters[dateKey] = 0;
		dateCounters[dateKey]++;
		order.formattedSeq = dateCounters[dateKey];
		order.seq = dateCounters[dateKey];
	});
	let now = new Date();
	if (now.getHours() < 5) now.setDate(now.getDate() - 1);
	let todayKey = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
	let currentMaxSeq = dateCounters[todayKey] || 0;
	for (let table in tableCustomers) {
		if (tableCustomers[table] && tableStatuses[table] === "yellow") {
			currentMaxSeq++;
			tableCustomers[table].orderId = currentMaxSeq;
		}
	}
	let updates = { historyOrders };
	for (let table in tableCustomers) {
		if (tableCustomers[table] && tableStatuses[table] === "yellow") {
			updates[`tableCustomers/${table}`] = tableCustomers[table];
		}
	}
	saveAllToCloud(updates);
	alert(
		"✅ 修復完成！\n歷史訂單已重整，目前桌位單號已校正。\n網頁將自動重新整理。",
	);
	location.reload();
}

function initHistoryDate() {
	let now = new Date();
	if (now.getHours() < 5) now.setDate(now.getDate() - 1);
	historyViewDate = new Date(now);
}
function getOrdersByDate(targetDate) {
	let start = new Date(targetDate);
	start.setHours(5, 0, 0, 0);
	let end = new Date(start);
	end.setDate(end.getDate() + 1);
	return historyOrders.filter((order) => {
		let t = getDateFromOrder(order);
		return t >= start && t < end;
	});
}

setInterval(updateSystemTime, 1000);
function updateSystemTime() {
	document.getElementById("systemTime").innerText =
		"🕒 " + new Date().toLocaleString("zh-TW", { hour12: false });
}

function confirmPayment() {
	if (!Array.isArray(tempRightList) || tempRightList.length === 0) {
		alert("請先將品項移至右側再結帳");
		return;
	}

	// 計算本次應收
	let finalSplit = calcSplitTotal();
	if (!confirm(`確認收款 $${finalSplit} 嗎？`)) return;

	// 確保單號存在
	let info = tableCustomers[selectedTable] || {
		name: "",
		phone: "",
		orderId: "?",
	};
	// 若已有 orderId，保持不變；僅當缺失時才依今日序號生成
	if (!info.orderId || info.orderId === "?" || info.orderId === "T") {
		// 以今日已存在的最大基礎單號為準（忽略拆單計數），避免被拆單次數推高
		let maxSeq = getTodayMaxBaseSeq();
		info.orderId = maxSeq + 1;
		// 回寫，讓後續拆單沿用同一基礎單號
		if (!tableCustomers[selectedTable]) tableCustomers[selectedTable] = {};
		tableCustomers[selectedTable].orderId = info.orderId;
	}

	// 拆單序號處理
	let splitNum = tableSplitCounters[selectedTable] || 1;
	let displaySeq = `${info.orderId}-${splitNum}`;
	let displaySeat = `${selectedTable} (拆單)`;

	// 本次結帳品項：處理招待
	let processedItems = tempRightList.map((item) => {
		let name = item.name;
		let price = item.price;
		let type = getItemCategoryType(name);
		if (item.isTreat) {
			if (!name.includes("(招待)")) name = `${name} (招待)`;
			price = 0;
		}
		return { ...item, name, price, type };
	});

	// 計算原價（不含折扣/折讓）
	let originalSplitTotal = tempRightList.reduce(
		(sum, item) => sum + (item.isTreat ? 0 : item.price),
		0,
	);

	// 寫入歷史訂單
	let timeStr = new Date().toLocaleString("zh-TW", { hour12: false });
	let newOrder = {
		seat: displaySeat,
		formattedSeq: displaySeq,
		time: timeStr,
		timestamp: Date.now(),
		items: processedItems,
		total: finalSplit,
		originalTotal: originalSplitTotal,
		customerName: info.name || "",
		customerPhone: info.phone || "",
		isClosed: false,
	};
	if (!Array.isArray(historyOrders)) historyOrders = [];
	historyOrders.push(newOrder);

	// 更新桌上剩餘品項
	tempLeftList = Array.isArray(tempLeftList) ? tempLeftList : [];
	cart = [...tempLeftList];
	tableCarts[selectedTable] = cart;

	// 增加拆單次數，供下次拆單使用
	tableSplitCounters[selectedTable] = splitNum + 1;

	// 若已全數結清，清桌
	if (cart.length === 0) {
		delete tableCarts[selectedTable];
		delete tableTimers[selectedTable];
		delete tableStatuses[selectedTable];
		delete tableCustomers[selectedTable];
		delete tableSplitCounters[selectedTable];
		delete tableBatchCounts[selectedTable];

		// 清除 sentItems
		sentItems = [];
		sessionStorage.removeItem("sentItems");
	}

	const updates = {
		historyOrders,
		[`tableCarts/${selectedTable}`]: cart.length === 0 ? null : cart,
		[`tableTimers/${selectedTable}`]:
			cart.length === 0 ? null : tableTimers[selectedTable],
		[`tableStatuses/${selectedTable}`]:
			cart.length === 0 ? null : tableStatuses[selectedTable] || "yellow",
		[`tableCustomers/${selectedTable}`]:
			cart.length === 0 ? null : tableCustomers[selectedTable],
		[`tableSplitCounters/${selectedTable}`]:
			cart.length === 0 ? null : tableSplitCounters[selectedTable],
		[`tableBatchCounts/${selectedTable}`]:
			cart.length === 0 ? null : tableBatchCounts[selectedTable],
	};
	saveAllToCloud(updates);
	renderCart();
	closeCheckoutModal();
	showToast(
		`✅ 已結帳 $${finalSplit}${cart.length === 0 ? "，此桌已清空" : ""}`,
	);
}
async function printReceipt(data, isTicket = false) {
	let kitchenCategories = ["燒烤", "主餐", "炸物", "厚片"];
	let barItems = [];
	let kitchenItems = [];
	// 依送出時間/批次/索引排序，避免同批次被拆成多張
	let itemsOrdered = Array.isArray(data.items)
		? [...data.items]
		: Object.values(data.items || {});
	itemsOrdered.sort((a, b) => {
		let ta = a.sentAt || 0;
		let tb = b.sentAt || 0;
		if (ta !== tb) return ta - tb;
		let ba = a.batchId || 0;
		let bb = b.batchId || 0;
		if (ba !== bb) return ba - bb;
		let ia = a.incomingIdx || 0;
		let ib = b.incomingIdx || 0;
		return ia - ib;
	});

	itemsOrdered.forEach((i) => {
		// 僅依主分類判斷吧檯/廚房
		let itemCat = "";
		for (const [cat, content] of Object.entries(menuData)) {
			if (Array.isArray(content)) {
				if (content.some((x) => i.name.includes(x.name))) itemCat = cat;
			} else {
				for (const subContent of Object.values(content)) {
					if (subContent.some((x) => i.name.includes(x.name))) itemCat = cat;
				}
			}
		}
		if (kitchenCategories.includes(itemCat)) kitchenItems.push(i);
		else barItems.push(i);
	});
	const printArea = document.getElementById("receipt-print-area");

	// 🔥 修改：新增 style 標籤強制列印時靠左對齊，並移除 printArea 的內容
	const styleOverride = `<style>
        @media print {
            .receipt-section { text-align: left !important; }
            .receipt-items { text-align: left !important; }
            .receipt-item span:first-child { text-align: left !important; }
            .receipt-item span:last-child { text-align: right !important; }
            /* 讓項目名稱靠左，數量靠右 */
            .receipt-item.kitchen-item { display: flex; justify-content: space-between; }
        }
    </style>`;

	const generateHtml = (title, items, isFullReceipt) => {
		let itemsHtml = "";
		items.forEach((i) => {
			let displayName = i.name;
			if (i.isTreat && !displayName.includes("(招待)")) displayName += " (招待)";
			let priceStr = isFullReceipt ? (i.isTreat ? "$0" : `$${i.price}`) : "";

			// 🔥 修正：讓 kitchen-item 具有 space-between 屬性，確保排版靠左
			let itemClass = isFullReceipt
				? "receipt-item"
				: "receipt-item kitchen-item";

			// 如果是工作單，只顯示名稱和數量
			if (!isFullReceipt) {
				// 為了排版正確，我們必須確保這裡的項目是未合併的單品項，但這裡的 data.items 已經是單品項
				itemsHtml += `<div class="${itemClass}"><span>${displayName}</span><span>${i.count ? "x" + i.count : "x1"}</span></div>`;
			} else {
				itemsHtml += `<div class="${itemClass}"><span>${displayName}</span><span>${priceStr}</span></div>`;
			}
		});

		let footerHtml = "";
		if (isFullReceipt) {
			footerHtml = `<div class="receipt-footer"><div class="row"><span>原價：</span><span>$${data.original}</span></div><div class="row"><span>總計：</span><span class="total">$${data.total}</span></div></div>`;
		}

		// 🔥 確保標題靠左
		let headerAlign = isFullReceipt ? "center" : "left";

		return `${styleOverride}<div class="receipt-section" style="text-align: ${headerAlign};"><div class="receipt-header"><h2 class="store-name" style="text-align: ${headerAlign};">${title}</h2><div class="receipt-info" style="text-align: ${headerAlign};"><p>單號：${data.seq}</p><p>桌號：${data.table}</p><p>時間：${data.time}</p></div></div><hr class="dashed-line"><div class="receipt-items">${itemsHtml}</div><hr class="dashed-line">${footerHtml}</div>`;
	};

	const performPrint = (htmlContent) => {
		return new Promise((resolve) => {
			// 每次列印前先清空，避免重複內容疊加
			printArea.innerHTML = "";
			printArea.innerHTML = htmlContent;

			// 將 printArea 暫時移到可視範圍進行列印
			printArea.style.position = "static";
			printArea.style.width = "auto";
			printArea.style.height = "auto";

			setTimeout(() => {
				window.print();

				// 列印完畢後再隱藏
				printArea.style.position = "absolute";
				printArea.style.width = "0";
				printArea.style.height = "0";

				setTimeout(resolve, 500);
			}, 500);
		});
	};

	if (!isTicket) {
		await performPrint(generateHtml("結帳收據", data.items, true));
	} else {
		let hasBar = barItems.length > 0;
		let hasKitchen = kitchenItems.length > 0;

		// 為了確保列印能夠分開，必須對 printArea 進行操作，並處理頁面樣式覆蓋
		let printQueue = [];
		if (hasBar) printQueue.push(generateHtml("吧檯工作單", barItems, false));
		if (hasKitchen)
			printQueue.push(generateHtml("廚房工作單", kitchenItems, false));

		for (const content of printQueue) {
			await performPrint(content);
		}
	}
}
