/* checkin-plugin.js - 打卡系統 Plugin (Vanilla JS) */
(function () {
	"use strict";

	const CHECKIN_PAGE_ID = "checkinPage";
	const CHECKIN_ROOT_ID = "checkin-root";
	const CHECKIN_ROOTS = ["attendanceEmployees", "attendanceRecords"];
	const PBKDF2_HASH_ALGO = "SHA-256";
	const PBKDF2_ITERATIONS = 100000;
	const BUSINESS_DAY_SHIFT_HOURS = 5;

	const UserRole = {
		ADMIN: "ADMIN",
		EMPLOYEE: "EMPLOYEE",
	};

	const EmployeeStatus = {
		WORKING: "WORKING",
		ON_BREAK: "ON_BREAK",
		OFF_DUTY: "OFF_DUTY",
	};

	const AttendanceType = {
		CLOCK_IN: "CLOCK_IN",
		CLOCK_OUT: "CLOCK_OUT",
		BREAK_START: "BREAK_START",
		BREAK_END: "BREAK_END",
	};

	const DEFAULT_ADMIN = {
		id: "emp_admin",
		name: "小飛",
		role: UserRole.ADMIN,
		status: EmployeeStatus.OFF_DUTY,
	};

	const AVATAR_COLORS = [
		"#ef4444",
		"#f97316",
		"#f59e0b",
		"#10b981",
		"#14b8a6",
		"#06b6d4",
		"#0ea5e9",
		"#3b82f6",
		"#6366f1",
		"#8b5cf6",
		"#d946ef",
		"#ec4899",
		"#f43f5e",
	];

	const ICONS = {
		layout: `
			<rect width="7" height="9" x="3" y="3" rx="1" />
			<rect width="7" height="5" x="14" y="3" rx="1" />
			<rect width="7" height="9" x="14" y="12" rx="1" />
			<rect width="7" height="5" x="3" y="16" rx="1" />
		`,
		user: `
			<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
			<circle cx="12" cy="7" r="4" />
		`,
		clock: `
			<circle cx="12" cy="12" r="10" />
			<polyline points="12 6 12 12 16 14" />
		`,
		"file-bar": `
			<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
			<polyline points="14 2 14 8 20 8" />
			<path d="M8 13v5" />
			<path d="M12 11v7" />
			<path d="M16 15v3" />
		`,
		users: `
			<path d="M17 21v-2a4 4 0 0 0-3-3.87" />
			<path d="M7 21v-2a4 4 0 0 1 3-3.87" />
			<circle cx="9" cy="7" r="4" />
			<circle cx="17" cy="9" r="3" />
		`,
		lock: `
			<rect x="3" y="11" width="18" height="11" rx="2" />
			<path d="M7 11V7a5 5 0 0 1 10 0v4" />
		`,
		logout: `
			<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
			<polyline points="16 17 21 12 16 7" />
			<line x1="21" y1="12" x2="9" y2="12" />
		`,
		login: `
			<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
			<polyline points="10 17 15 12 10 7" />
			<line x1="15" y1="12" x2="3" y2="12" />
		`,
		play: `
			<polygon points="5 3 19 12 5 21 5 3" fill="currentColor" />
		`,
		square: `
			<rect x="4" y="4" width="16" height="16" rx="2" fill="currentColor" stroke="currentColor" />
		`,
		coffee: `
			<path d="M17 8h1a4 4 0 1 1 0 8h-1" />
			<path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z" />
			<line x1="6" y1="2" x2="6" y2="4" />
			<line x1="10" y1="2" x2="10" y2="4" />
			<line x1="14" y1="2" x2="14" y2="4" />
		`,
		briefcase: `
			<rect x="2" y="7" width="20" height="14" rx="2" />
			<path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
			<path d="M2 13h20" />
		`,
		calendar: `
			<rect x="3" y="4" width="18" height="18" rx="2" />
			<line x1="16" y1="2" x2="16" y2="6" />
			<line x1="8" y1="2" x2="8" y2="6" />
			<line x1="3" y1="10" x2="21" y2="10" />
		`,
		download: `
			<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
			<polyline points="7 10 12 15 17 10" />
			<line x1="12" y1="15" x2="12" y2="3" />
		`,
		filter: `
			<path d="M22 3H2l8 9v7l4 2v-9l8-9z" />
		`,
		edit: `
			<path d="M12 20h9" />
			<path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
		`,
		save: `
			<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
			<polyline points="17 21 17 13 7 13 7 21" />
			<polyline points="7 3 7 8 15 8" />
		`,
		close: `
			<line x1="18" y1="6" x2="6" y2="18" />
			<line x1="6" y1="6" x2="18" y2="18" />
		`,
		trash: `
			<polyline points="3 6 5 6 21 6" />
			<path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
			<path d="M10 11v6" />
			<path d="M14 11v6" />
			<path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
		`,
		plus: `
			<line x1="12" y1="5" x2="12" y2="19" />
			<line x1="5" y1="12" x2="19" y2="12" />
		`,
		search: `
			<circle cx="11" cy="11" r="8" />
			<line x1="21" y1="21" x2="16.65" y2="16.65" />
		`,
		check: `
			<polyline points="20 6 9 17 4 12" />
		`,
		alert: `
			<circle cx="12" cy="12" r="10" />
			<line x1="12" y1="8" x2="12" y2="12" />
			<line x1="12" y1="16" x2="12.01" y2="16" />
		`,
		"chevron-down": `
			<polyline points="6 9 12 15 18 9" />
		`,
		"chevron-left": `
			<polyline points="15 18 9 12 15 6" />
		`,
		"chevron-right": `
			<polyline points="9 18 15 12 9 6" />
		`,
		"arrow-left": `
			<line x1="19" y1="12" x2="5" y2="12" />
			<polyline points="12 19 5 12 12 5" />
		`,
		"arrow-right": `
			<line x1="5" y1="12" x2="19" y2="12" />
			<polyline points="12 5 19 12 12 19" />
		`,
		activity: `
			<polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
		`,
		"bar-chart": `
			<line x1="6" y1="20" x2="6" y2="16" />
			<line x1="12" y1="20" x2="12" y2="10" />
			<line x1="18" y1="20" x2="18" y2="4" />
			<line x1="2" y1="20" x2="22" y2="20" />
		`,
		list: `
			<line x1="8" y1="6" x2="21" y2="6" />
			<line x1="8" y1="12" x2="21" y2="12" />
			<line x1="8" y1="18" x2="21" y2="18" />
			<circle cx="4" cy="6" r="1" />
			<circle cx="4" cy="12" r="1" />
			<circle cx="4" cy="18" r="1" />
		`,
	};

	const state = {
		initialized: false,
		open: false,
		loading: true,
		employees: {},
		records: {},
		currentUserId: null,
		currentView: "clock",
		loginEmployeeId: null,
		loginError: "",
		passwordError: "",
		dashboardEmployeeId: null,
		viewMode: "list",
		chartMode: "week",
		calendarDate: new Date(),
		reportFilterType: "all",
		reportEmployeeId: "all",
		employeeSearch: "",
		modal: null,
	};

	let rootEl = null;
	let clockTimer = null;
	let focusEmployeeSearch = false;
	let isEmployeeSearchComposing = false;

	function setState(patch) {
		Object.assign(state, patch);
		render();
	}

	function bytesToBase64(bytes) {
		let binary = "";
		for (let i = 0; i < bytes.length; i++) {
			binary += String.fromCharCode(bytes[i]);
		}
		return btoa(binary);
	}

	function base64ToBytes(base64) {
		const binary = atob(base64);
		const bytes = new Uint8Array(binary.length);
		for (let i = 0; i < binary.length; i++) {
			bytes[i] = binary.charCodeAt(i);
		}
		return bytes;
	}

	async function pbkdf2Hash(password, saltBase64) {
		const keyMaterial = await crypto.subtle.importKey(
			"raw",
			new TextEncoder().encode(password),
			"PBKDF2",
			false,
			["deriveBits"],
		);
		const derivedBits = await crypto.subtle.deriveBits(
			{
				name: "PBKDF2",
				salt: base64ToBytes(saltBase64),
				iterations: PBKDF2_ITERATIONS,
				hash: PBKDF2_HASH_ALGO,
			},
			keyMaterial,
			256,
		);
		return bytesToBase64(new Uint8Array(derivedBits));
	}

	async function makePasswordRecord(password) {
		const saltBytes = new Uint8Array(16);
		crypto.getRandomValues(saltBytes);
		const salt = bytesToBase64(saltBytes);
		const hash = await pbkdf2Hash(password, salt);
		return {
			passwordHash: hash,
			passwordSalt: salt,
		};
	}

	async function verifyPassword(password, employee) {
		if (!employee || !employee.passwordHash || !employee.passwordSalt) return false;
		const computed = await pbkdf2Hash(password, employee.passwordSalt);
		return computed === employee.passwordHash;
	}

	function icon(name, size, className) {
		const svg = ICONS[name];
		if (!svg) return "";
		const classes = ["checkin-icon"];
		if (className) classes.push(className);
		const finalSize = size || 18;
		return `
			<svg class="${classes.join(" ")}" width="${finalSize}" height="${finalSize}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
				${svg}
			</svg>
		`;
	}

	function getAvatarColor(name) {
		let hash = 0;
		for (let i = 0; i < name.length; i++) {
			hash = name.charCodeAt(i) + ((hash << 5) - hash);
		}
		return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
	}

	function renderAvatar(name, className) {
		const safeName = name || "?";
		const initial = safeName.charAt(0);
		const color = getAvatarColor(safeName);
		const classes = ["checkin-avatar"];
		if (className) classes.push(className);
		return `<div class="${classes.join(" ")}" style="background:${color}">${initial}</div>`;
	}

	function getRoleLabel(role) {
		return role === UserRole.ADMIN ? "管理員" : "員工";
	}

	function getStatusClass(status) {
		switch (status) {
			case EmployeeStatus.WORKING:
				return "checkin-badge--working";
			case EmployeeStatus.ON_BREAK:
				return "checkin-badge--break";
			case EmployeeStatus.OFF_DUTY:
			default:
				return "checkin-badge--off";
		}
	}

	function getStatusDotClass(status) {
		switch (status) {
			case EmployeeStatus.WORKING:
				return "is-working";
			case EmployeeStatus.ON_BREAK:
				return "is-break";
			case EmployeeStatus.OFF_DUTY:
			default:
				return "is-off";
		}
	}

	function getStatusDotVariant(status) {
		switch (status) {
			case EmployeeStatus.WORKING:
				return "checkin-dot--green";
			case EmployeeStatus.ON_BREAK:
				return "checkin-dot--orange";
			case EmployeeStatus.OFF_DUTY:
			default:
				return "checkin-dot--slate";
		}
	}

	function renderStatusBadge(status, empId, labelOverride) {
		const label = labelOverride || getStatusLabel(status, empId);
		return `<span class="checkin-badge ${getStatusClass(status)}">${label}</span>`;
	}

	function getRecordMeta(type) {
		switch (type) {
			case AttendanceType.CLOCK_IN:
				return {
					tagClass: "checkin-tag checkin-tag--brand",
					dotClass: "checkin-dot checkin-dot--brand",
					textClass: "checkin-text--brand",
					logDotClass: "checkin-dot--brand",
				};
			case AttendanceType.CLOCK_OUT:
				return {
					tagClass: "checkin-tag checkin-tag--slate",
					dotClass: "checkin-dot checkin-dot--slate",
					textClass: "checkin-text--slate",
					logDotClass: "checkin-dot--slate",
				};
			case AttendanceType.BREAK_START:
				return {
					tagClass: "checkin-tag checkin-tag--orange",
					dotClass: "checkin-dot checkin-dot--orange",
					textClass: "checkin-text--orange",
					logDotClass: "checkin-dot--orange",
				};
			case AttendanceType.BREAK_END:
				return {
					tagClass: "checkin-tag checkin-tag--green",
					dotClass: "checkin-dot checkin-dot--green",
					textClass: "checkin-text--green",
					logDotClass: "checkin-dot--green",
				};
			default:
				return {
					tagClass: "checkin-tag checkin-tag--slate",
					dotClass: "checkin-dot checkin-dot--slate",
					textClass: "checkin-text--slate",
					logDotClass: "checkin-dot--slate",
				};
		}
	}

	function toDate(value) {
		if (!value) return null;
		if (value instanceof Date) return value;
		if (typeof value === "number") return new Date(value);
		const parsed = new Date(value);
		return Number.isNaN(parsed.getTime()) ? null : parsed;
	}

	function formatTime(date) {
		if (!date) return "--:--:--";
		return date.toLocaleTimeString("zh-TW", {
			hour12: false,
			hour: "2-digit",
			minute: "2-digit",
			second: "2-digit",
		});
	}

	function formatShortTime(date) {
		if (!date) return "--:--";
		return date.toLocaleTimeString("zh-TW", {
			hour12: false,
			hour: "2-digit",
			minute: "2-digit",
			second: "2-digit",
		});
	}

	function formatDate(date) {
		return date.toLocaleDateString("zh-TW", {
			year: "numeric",
			month: "long",
			day: "numeric",
			weekday: "long",
		});
	}

	function formatDateKey(date) {
		const shifted = new Date(date);
		shifted.setHours(shifted.getHours() - BUSINESS_DAY_SHIFT_HOURS);
		return shifted.toDateString();
	}

	function formatDateInput(date) {
		const d = toDate(date);
		if (!d) return "";
		const pad = (n) => String(n).padStart(2, "0");
		return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
	}

	function normalizeEmployees(data) {
		if (!data) return {};
		if (Array.isArray(data)) {
			const map = {};
			data.forEach((emp) => {
				if (emp && emp.id) map[emp.id] = emp;
			});
			return map;
		}
		return data;
	}

	function normalizeRecords(data) {
		if (!data) return {};
		if (Array.isArray(data)) {
			const map = {};
			data.forEach((record) => {
				if (record && record.id) map[record.id] = record;
			});
			return map;
		}
		return data;
	}

	function updateGlobalData() {
		if (typeof attendanceEmployees !== "undefined") {
			attendanceEmployees = { ...state.employees };
		}
		if (typeof attendanceRecords !== "undefined") {
			attendanceRecords = { ...state.records };
		}
	}

	function getEmployeesArray() {
		return Object.values(state.employees || {}).sort((a, b) => a.name.localeCompare(b.name, "zh-Hant"));
	}

	function getRecordsArray() {
		return Object.values(state.records || {}).sort((a, b) => {
			const at = toDate(a.ts)?.getTime() || 0;
			const bt = toDate(b.ts)?.getTime() || 0;
			return bt - at;
		});
	}

	function getEmployeeById(id) {
		return state.employees && state.employees[id] ? state.employees[id] : null;
	}

	function isAdmin() {
		const user = getEmployeeById(state.currentUserId);
		return user && user.role === UserRole.ADMIN;
	}

	function hasRecordToday(empId) {
		const todayKey = formatDateKey(new Date());
		return getRecordsArray().some((record) => {
			if (record.eid !== empId) return false;
			const date = toDate(record.ts);
			return date && formatDateKey(date) === todayKey;
		});
	}

	function getStatusLabel(status, empId) {
		switch (status) {
			case EmployeeStatus.WORKING:
				return "工作中";
			case EmployeeStatus.ON_BREAK:
				return "休息中";
			case EmployeeStatus.OFF_DUTY:
			default:
				return hasRecordToday(empId) ? "已下班" : "未上班";
		}
	}

	function getRecordLabel(type) {
		switch (type) {
			case AttendanceType.CLOCK_IN:
				return "上班";
			case AttendanceType.CLOCK_OUT:
				return "下班";
			case AttendanceType.BREAK_START:
				return "開始休息";
			case AttendanceType.BREAK_END:
				return "結束休息";
			default:
				return type;
		}
	}

	function calculateWorkHours(records, now) {
		if (!records || records.length === 0) return 0;
		const sorted = [...records].sort((a, b) => {
			const at = toDate(a.ts)?.getTime() || 0;
			const bt = toDate(b.ts)?.getTime() || 0;
			return at - bt;
		});
		let totalMs = 0;
		let workStart = null;
		sorted.forEach((record) => {
			if (record.type === AttendanceType.CLOCK_IN || record.type === AttendanceType.BREAK_END) {
				if (workStart === null) workStart = toDate(record.ts)?.getTime() || null;
			} else if (record.type === AttendanceType.CLOCK_OUT || record.type === AttendanceType.BREAK_START) {
				if (workStart !== null) {
					totalMs += (toDate(record.ts)?.getTime() || 0) - workStart;
					workStart = null;
				}
			}
		});
		const lastRecord = sorted[sorted.length - 1];
		const isWorking = lastRecord &&
			(lastRecord.type === AttendanceType.CLOCK_IN || lastRecord.type === AttendanceType.BREAK_END);
		if (isWorking && workStart !== null) {
			totalMs += (now ? now.getTime() : Date.now()) - workStart;
		}
		return Number((totalMs / (1000 * 60 * 60)).toFixed(1));
	}

	function getUserRecords(empId) {
		const all = getRecordsArray().filter((r) => r.eid === empId);
		const todayKey = formatDateKey(new Date());
		const todayRecords = all.filter((r) => {
			const d = toDate(r.ts);
			return d && formatDateKey(d) === todayKey;
		});
		const oneWeekAgo = new Date();
		oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
		const weeklyRecords = all.filter((r) => {
			const d = toDate(r.ts);
			return d && d >= oneWeekAgo;
		});
		return { todayRecords, weeklyRecords };
	}

	function groupRecordsByDay(records) {
		const grouped = {};
		records.forEach((record) => {
			const dateObj = toDate(record.ts);
			if (!dateObj) return;
			const businessDate = new Date(dateObj);
			businessDate.setHours(businessDate.getHours() - BUSINESS_DAY_SHIFT_HOURS);
			const key = businessDate.toDateString();
			if (!grouped[key]) {
				grouped[key] = {
					date: new Date(dateObj),
					records: [],
					sessions: [],
					totalHours: 0,
				};
			}
			grouped[key].records.push(record);
		});

		Object.values(grouped).forEach((day) => {
			const sorted = [...day.records].sort((a, b) => {
				const at = toDate(a.ts)?.getTime() || 0;
				const bt = toDate(b.ts)?.getTime() || 0;
				return at - bt;
			});
			let workStart = null;
			let dailyMs = 0;
			sorted.forEach((record) => {
				const ts = toDate(record.ts)?.getTime() || 0;
				if (record.type === AttendanceType.CLOCK_IN || record.type === AttendanceType.BREAK_END) {
					if (workStart === null) workStart = ts;
				} else if (record.type === AttendanceType.CLOCK_OUT || record.type === AttendanceType.BREAK_START) {
					if (workStart !== null) {
						const duration = ts - workStart;
						dailyMs += duration;
						day.sessions.push({
							start: new Date(workStart),
							end: new Date(ts),
							duration,
							type: "WORK",
						});
						workStart = null;
					}
				}
			});

			const isToday = new Date().toDateString() === day.date.toDateString();
			if (isToday && workStart !== null) {
				const now = Date.now();
				const duration = now - workStart;
				dailyMs += duration;
				day.sessions.push({
					start: new Date(workStart),
					end: null,
					duration,
					type: "WORK",
				});
			}

			day.totalHours = Number((dailyMs / (1000 * 60 * 60)).toFixed(1));
			day.sessions.sort((a, b) => a.start.getTime() - b.start.getTime());
			day.records.sort((a, b) => (toDate(b.ts)?.getTime() || 0) - (toDate(a.ts)?.getTime() || 0));
		});

		return Object.values(grouped).sort((a, b) => b.date.getTime() - a.date.getTime());
	}

	function getNextRecordId() {
		const ids = Object.keys(state.records || {});
		let maxId = 0;
		ids.forEach((existingId) => {
			const match = /^r_(\d+)$/.exec(existingId);
			if (match) {
				const numeric = Number(match[1]);
				if (!Number.isNaN(numeric)) maxId = Math.max(maxId, numeric);
			}
		});
		return `r_${maxId + 1}`;
	}

	async function ensureData() {
		if (typeof ensureDataSubscriptions === "function") {
			await ensureDataSubscriptions(CHECKIN_ROOTS);
		}

		const employees = normalizeEmployees(typeof attendanceEmployees !== "undefined" ? attendanceEmployees : {});
		const records = normalizeRecords(typeof attendanceRecords !== "undefined" ? attendanceRecords : {});
		state.employees = employees;
		state.records = records;

		if (!employees || Object.keys(employees).length === 0) {
			await seedDefaultAdmin();
		}

		state.loading = false;
		render();
	}

	async function seedDefaultAdmin() {
		try {
			const passwordRecord = await makePasswordRecord("123");
			const employee = {
				...DEFAULT_ADMIN,
				...passwordRecord,
			};
			state.employees = { [employee.id]: employee };
			updateGlobalData();
			if (typeof saveAllToCloud === "function") {
				await saveAllToCloud({ [`attendanceEmployees/${employee.id}`]: employee });
			} else if (typeof db !== "undefined") {
				await db.ref(`attendanceEmployees/${employee.id}`).set(employee);
			}
		} catch (e) {
			console.warn("CheckIn: failed to seed default admin", e);
		}
	}

	function ensureContainer(mountId) {
		const mount = document.getElementById(mountId || "app-container");
		if (!mount) return null;
		let page = document.getElementById(CHECKIN_PAGE_ID);
		if (!page) {
			page = document.createElement("div");
			page.id = CHECKIN_PAGE_ID;
			page.style.display = "none";
			page.className = "checkin-page";
			page.innerHTML = `
				<div class="checkin-shell">
					<button class="back btn-effect checkin-back-btn" onclick="CheckInPlugin && CheckInPlugin.reset && CheckInPlugin.reset(); goHome();">⬅ 返回主畫面</button>
				</div>
				<div id="${CHECKIN_ROOT_ID}"></div>
			`;
			mount.appendChild(page);
		}
		rootEl = page.querySelector(`#${CHECKIN_ROOT_ID}`);
		return page;
	}

	function wrapHideAll() {
		if (typeof window.hideAll !== "function" || window.hideAll.__checkinWrapped) return;
		const original = window.hideAll;
		const wrapped = function () {
			original();
			const page = document.getElementById(CHECKIN_PAGE_ID);
			if (page) page.style.display = "none";
		};
		wrapped.__checkinWrapped = true;
		window.hideAll = wrapped;
	}

	function startClockTimer() {
		if (clockTimer) return;
		clockTimer = setInterval(() => {
			const now = new Date();
			const timeEl = rootEl && rootEl.querySelector("[data-role=checkin-time]");
			if (timeEl) timeEl.textContent = formatTime(now);
			const dateEl = rootEl && rootEl.querySelector("[data-role=checkin-date]");
			if (dateEl) dateEl.textContent = formatDate(now);
		}, 1000);
	}

	function open() {
		state.open = true;
		const page = document.getElementById(CHECKIN_PAGE_ID);
		if (page) page.style.display = "block";
		if (typeof hideAll === "function") hideAll();
		if (page) page.style.display = "block";
		render();
	}

	function logout() {
		setState({
			currentUserId: null,
			currentView: "clock",
			loginEmployeeId: null,
			loginError: "",
			passwordError: "",
			dashboardEmployeeId: null,
			reportEmployeeId: "all",
			employeeSearch: "",
		});
	}

	function renderLogin() {
		const employees = getEmployeesArray();
		if (!state.loginEmployeeId) {
			return `
			<div class="checkin-login checkin-login--select">
				<div class="checkin-login__intro">
					<h1 class="checkin-title">歡迎使用打卡系統</h1>
					<p class="checkin-muted">請選擇您的身份以繼續</p>
				</div>
				<div class="checkin-grid checkin-grid--cards">
					${employees.map((emp) => `
						<button class="checkin-card checkin-card--select" data-action="select-employee" data-id="${emp.id}">
							${renderAvatar(emp.name, "checkin-avatar--lg")}
							<div>
								<div class="checkin-card__title">${emp.name}</div>
								<div class="checkin-card__subtitle">${getRoleLabel(emp.role)}</div>
							</div>
						</button>
					`).join("")}
				</div>
			</div>
		`;
		}

		const selected = getEmployeeById(state.loginEmployeeId);
		const selectedName = selected ? selected.name : "";
		return `
		<div class="checkin-login">
			<div class="checkin-card checkin-card--login">
				<button class="checkin-link checkin-link--back" data-action="login-back">
					${icon("arrow-left", 16)} 返回選擇使用者
				</button>
				<div class="checkin-login__profile">
					${renderAvatar(selectedName, "checkin-avatar--xl")}
					<h2 class="checkin-title">早安，${selectedName}</h2>
					<p class="checkin-muted">請輸入密碼以登入系統</p>
				</div>
				<form class="checkin-form" data-action="login-submit">
					<label class="checkin-field">
						<span class="checkin-field__icon">${icon("lock", 18)}</span>
						<input type="password" name="password" placeholder="請輸入密碼" required />
					</label>
					${state.loginError ? `<div class="checkin-alert checkin-alert--error">${icon("alert", 16)}<span>${state.loginError}</span></div>` : ""}
					<button class="checkin-btn checkin-btn--primary checkin-btn--full" type="submit">
						登入系統 ${icon("arrow-right", 16)}
					</button>
				</form>
			</div>
		</div>
		`;
	}

	function renderHeader() {
		const user = getEmployeeById(state.currentUserId);
		if (!user) return "";
		const menuItems = [
			{ id: "clock", label: "打卡", icon: "clock", roles: [UserRole.ADMIN, UserRole.EMPLOYEE] },
			{ id: "dashboard", label: "儀表板", icon: "layout", roles: [UserRole.ADMIN] },
			{ id: "individual", label: "個人儀表板", icon: "user", roles: [UserRole.ADMIN, UserRole.EMPLOYEE] },
			{ id: "reports", label: "報表", icon: "file-bar", roles: [UserRole.ADMIN, UserRole.EMPLOYEE] },
			{ id: "employees", label: "員工", icon: "users", roles: [UserRole.ADMIN] },
			{ id: "password", label: "修改密碼", icon: "lock", roles: [UserRole.ADMIN, UserRole.EMPLOYEE] },
		];
		const nav = menuItems
			.filter((item) => item.roles.includes(user.role))
			.map((item) => `
				<button class="checkin-nav__item ${state.currentView === item.id ? "is-active" : ""}" data-action="nav" data-view="${item.id}">
					${icon(item.icon, 18)}
					<span>${item.label}</span>
				</button>
			`).join("");

		const mobileNav = menuItems
			.filter((item) => item.roles.includes(user.role))
			.slice(0, 5)
			.map((item) => `
				<button class="checkin-nav-mobile__item ${state.currentView === item.id ? "is-active" : ""}" data-action="nav" data-view="${item.id}">
					${icon(item.icon, 18)}
					<span>${item.label}</span>
				</button>
			`).join("");

		return `
		<header class="checkin-header">
			<div class="checkin-header__inner">
				<div class="checkin-header__left">
					<div class="checkin-brand">
						<span class="checkin-brand__text">打卡系統</span>
					</div>
					<nav class="checkin-nav">
						${nav}
					</nav>
				</div>
				<div class="checkin-user">
					<div class="checkin-user__meta">
						<div class="checkin-user__name">${user.name}</div>
						<div class="checkin-user__role">${getRoleLabel(user.role)}</div>
					</div>
					${renderAvatar(user.name, "checkin-avatar--sm")}
					<button class="checkin-icon-btn checkin-icon-btn--danger" data-action="logout" title="登出">
						${icon("logout", 18)}
					</button>
				</div>
			</div>
		</header>
		<nav class="checkin-nav-mobile">
			${mobileNav}
		</nav>
		`;
	}

	function renderClockView() {
		const user = getEmployeeById(state.currentUserId);
		const { todayRecords, weeklyRecords } = getUserRecords(user.id);
		const now = new Date();
		const dailyHours = calculateWorkHours(todayRecords, now);
		const weeklyHours = calculateWorkHours(weeklyRecords, now);
		const statusLabel = getStatusLabel(user.status, user.id);
		const actionButtons = [];

		if (user.status === EmployeeStatus.OFF_DUTY) {
			actionButtons.push(`
				<button class="checkin-btn checkin-btn--primary checkin-btn--xl checkin-btn--span" data-action="clock-action" data-type="${AttendanceType.CLOCK_IN}">
					${icon("play", 18)} 上班打卡
				</button>
			`);
		} else {
			if (user.status === EmployeeStatus.WORKING) {
				actionButtons.push(`
					<button class="checkin-btn checkin-btn--orange checkin-btn--xl" data-action="clock-action" data-type="${AttendanceType.BREAK_START}">
						${icon("coffee", 18)} 開始休息
					</button>
				`);
			} else {
				actionButtons.push(`
					<button class="checkin-btn checkin-btn--green checkin-btn--xl" data-action="clock-action" data-type="${AttendanceType.BREAK_END}">
						${icon("briefcase", 18)} 結束休息
					</button>
				`);
			}
			actionButtons.push(`
				<button class="checkin-btn checkin-btn--dark checkin-btn--xl" data-action="clock-action" data-type="${AttendanceType.CLOCK_OUT}">
					${icon("square", 16)} 下班打卡
				</button>
			`);
		}

		const sortedRecords = [...todayRecords].sort((a, b) => (toDate(a.ts)?.getTime() || 0) - (toDate(b.ts)?.getTime() || 0));
		const timelineItems = sortedRecords.map((record) => {
			const meta = getRecordMeta(record.type);
			return `
				<div class="checkin-timeline__item">
					<span class="${meta.dotClass}"></span>
					<div class="checkin-timeline__card">
						<div class="checkin-timeline__row">
							<span class="checkin-timeline__title ${meta.textClass}">${getRecordLabel(record.type)}</span>
							<span class="checkin-timeline__time">${formatShortTime(toDate(record.ts))}</span>
						</div>
					</div>
				</div>
			`;
		}).join("");

		const activeIndicator = user.status !== EmployeeStatus.OFF_DUTY
			? `<div class="checkin-timeline__active">${user.status === EmployeeStatus.WORKING ? "工作中..." : "休息中..."}</div>`
			: "";

		return `
		<div class="checkin-section checkin-view--clock">
			<div class="checkin-section__header">
				<div>
					<h1 class="checkin-section__title">早安，${user.name} 👋</h1>
					<p class="checkin-section__subtitle checkin-inline">${icon("calendar", 16)}${formatDate(now)}</p>
				</div>
			</div>
			<div class="checkin-grid checkin-grid--clock">
				<div class="checkin-stack">
					<div class="checkin-card checkin-card--clock">
						<div class="checkin-status-row">
							${renderStatusBadge(user.status, user.id, `目前狀態：${statusLabel}`)}
						</div>
						<div class="checkin-time" data-role="checkin-time">${formatTime(now)}</div>
						<div class="checkin-date" data-role="checkin-date">${formatDate(now)}</div>
						<div class="checkin-actions">
							${actionButtons.join("")}
						</div>
					</div>
					<div class="checkin-grid checkin-grid--stats">
						<div class="checkin-card">
							<div class="checkin-stat-card">
								<div>
									<div class="checkin-stat__label checkin-text--brand">本日工時</div>
									<div class="checkin-stat__value">${dailyHours} <span>小時</span></div>
								</div>
								<div class="checkin-stat__icon checkin-stat__icon--blue">${icon("clock", 18)}</div>
							</div>
						</div>
						<div class="checkin-card">
							<div class="checkin-stat-card">
								<div>
									<div class="checkin-stat__label checkin-text--purple">本週工時</div>
									<div class="checkin-stat__value">${weeklyHours} <span>小時</span></div>
								</div>
								<div class="checkin-stat__icon checkin-stat__icon--purple">${icon("calendar", 18)}</div>
							</div>
						</div>
					</div>
				</div>
				<div class="checkin-card checkin-card--timeline">
					<h3 class="checkin-card__heading"><span class="checkin-card__accent"></span>今日打卡記錄</h3>
					${sortedRecords.length === 0 ? `
						<div class="checkin-empty">
							${icon("clock", 28)}
							<div>尚無今日打卡記錄</div>
							<div class="checkin-muted">開始您的一天吧！</div>
						</div>
					` : `
						<div class="checkin-timeline">
							${timelineItems}
						</div>
						${activeIndicator}
					`}
				</div>
			</div>
		</div>
		`;
	}

	function renderAdminDashboard() {
		const employees = getEmployeesArray();
		const records = getRecordsArray();
		const todayKey = formatDateKey(new Date());
		const employeesWithRecords = new Set(
			records
				.filter((r) => {
					const d = toDate(r.ts);
					return d && formatDateKey(d) === todayKey;
				})
				.map((r) => r.eid),
		);
		let working = 0;
		let onBreak = 0;
		let clockedOut = 0;
		let notClockedIn = 0;
		employees.forEach((emp) => {
			if (emp.status === EmployeeStatus.WORKING) working += 1;
			else if (emp.status === EmployeeStatus.ON_BREAK) onBreak += 1;
			else if (employeesWithRecords.has(emp.id)) clockedOut += 1;
			else notClockedIn += 1;
		});

		const calculateAvgHours = (days) => {
			const cutoff = new Date();
			cutoff.setDate(cutoff.getDate() - days);
			const validRecords = records.filter((r) => {
				const d = toDate(r.ts);
				return d && d >= cutoff;
			});
			let totalMs = 0;
			const empDays = new Set();
			employees.forEach((emp) => {
				const empRecs = validRecords
					.filter((r) => r.eid === emp.id)
					.sort((a, b) => (toDate(a.ts)?.getTime() || 0) - (toDate(b.ts)?.getTime() || 0));
				let start = null;
				empRecs.forEach((r) => {
					if (r.type === AttendanceType.CLOCK_IN) start = toDate(r.ts)?.getTime() || null;
					if (r.type === AttendanceType.CLOCK_OUT && start !== null) {
						totalMs += (toDate(r.ts)?.getTime() || 0) - start;
						start = null;
					}
				});
			});
			validRecords.forEach((r) => {
				const d = toDate(r.ts);
				if (d) empDays.add(`${r.eid}_${formatDateKey(d)}`);
			});
			const totalDays = empDays.size;
			return totalDays > 0 ? (totalMs / (1000 * 60 * 60) / totalDays).toFixed(1) : "0.0";
		};

		const recent = records.slice(0, 10);

		const statCards = [
			{
				label: "總員工數",
				value: employees.length,
				icon: "users",
				variant: "blue",
			},
			{
				label: "平均工時 (7天)",
				value: `${calculateAvgHours(7)} hr`,
				icon: "clock",
				variant: "purple",
			},
			{
				label: "平均工時 (30天)",
				value: `${calculateAvgHours(30)} hr`,
				icon: "calendar",
				variant: "purple",
			},
		];

		const statusCards = [
			{ label: "未上班", value: notClockedIn, icon: "login", variant: "slate" },
			{ label: "工作中", value: working, icon: "briefcase", variant: "green" },
			{ label: "休息中", value: onBreak, icon: "coffee", variant: "orange" },
			{ label: "已下班", value: clockedOut, icon: "logout", variant: "slate" },
		];

		return `
		<div class="checkin-section checkin-view--dashboard">
			<div class="checkin-section__header">
				<div>
					<h2 class="checkin-section__title">管理儀表板</h2>
					<p class="checkin-section__subtitle">即時監控公司出勤狀況與數據概覽</p>
				</div>
			</div>
			<div class="checkin-grid checkin-grid--stats">
				${statCards.map((item) => `
					<div class="checkin-card">
						<div class="checkin-stat-card">
							<div>
								<div class="checkin-stat__label">${item.label}</div>
								<div class="checkin-stat__value">${item.value}</div>
							</div>
							<div class="checkin-stat__icon checkin-stat__icon--${item.variant}">${icon(item.icon, 18)}</div>
						</div>
					</div>
				`).join("")}
			</div>
			<div class="checkin-grid checkin-grid--status">
				${statusCards.map((item) => `
					<div class="checkin-card">
						<div class="checkin-stat-card">
							<div>
								<div class="checkin-stat__label">${item.label}</div>
								<div class="checkin-stat__value">${item.value}</div>
							</div>
							<div class="checkin-stat__icon checkin-stat__icon--${item.variant}">${icon(item.icon, 18)}</div>
						</div>
					</div>
				`).join("")}
			</div>
			<div class="checkin-card checkin-card--table">
				<div class="checkin-card__header">最新打卡記錄</div>
				<div class="checkin-table-wrap">
					<table class="checkin-table">
						<thead>
							<tr>
								<th>員工</th>
								<th>類型</th>
								<th>時間</th>
							</tr>
						</thead>
						<tbody>
							${recent.map((record) => {
			const emp = getEmployeeById(record.eid);
			const meta = getRecordMeta(record.type);
			return `
									<tr>
										<td>
											<div class="checkin-inline">
												${renderAvatar(emp ? emp.name : "U", "checkin-avatar--xs")}
												<span>${emp ? emp.name : "Unknown"}</span>
											</div>
										</td>
										<td><span class="${meta.tagClass}">${getRecordLabel(record.type)}</span></td>
										<td>${formatShortTime(toDate(record.ts))}</td>
									</tr>
								`;
		}).join("")}
						</tbody>
					</table>
				</div>
			</div>
		</div>
		`;
	}

	function renderIndividualDashboard() {
		const user = getEmployeeById(state.currentUserId);
		const canSelect = user.role === UserRole.ADMIN;
		const selectedId = canSelect ? (state.dashboardEmployeeId || user.id) : user.id;
		const target = getEmployeeById(selectedId) || user;
		const records = getRecordsArray().filter((r) => r.eid === target.id);
		const dailyData = groupRecordsByDay(records);

		const totalHours = dailyData.reduce((acc, d) => acc + d.totalHours, 0);
		const avgHours = dailyData.length > 0 ? (totalHours / dailyData.length).toFixed(1) : "0.0";

		const chartData = [];
		const now = new Date();
		const range = state.chartMode === "week" ? 7 : 30;
		for (let i = range - 1; i >= 0; i--) {
			const d = new Date(now);
			d.setDate(d.getDate() - i);
			const key = formatDateKey(d);
			const found = dailyData.find((dd) => formatDateKey(dd.date) === key);
			chartData.push({
				label: state.chartMode === "week" ? d.toLocaleDateString("zh-TW", { weekday: "short" }) : `${d.getMonth() + 1}/${d.getDate()}`,
				hours: found ? found.totalHours : 0,
				date: d.toLocaleDateString("zh-TW"),
			});
		}
		const maxHours = Math.max(8, ...chartData.map((d) => d.hours));

		return `
		<div class="checkin-section checkin-view--individual">
			<div class="checkin-section__header">
				<div>
					<h2 class="checkin-section__title">個人儀表板</h2>
					<p class="checkin-section__subtitle">員工個人工時分析與考勤記錄</p>
				</div>
				${canSelect ? `
					<div class="checkin-select">
						<select data-action="select-employee" data-context="dashboard">
							${getEmployeesArray().map((emp) => `
								<option value="${emp.id}" ${emp.id === selectedId ? "selected" : ""}>${emp.name} (${getRoleLabel(emp.role)})</option>
							`).join("")}
						</select>
						<span class="checkin-select__icon">${icon("chevron-down", 16)}</span>
					</div>
				` : ""}
			</div>
			<div class="checkin-grid checkin-grid--individual">
				<div class="checkin-card checkin-profile">
					<div class="checkin-profile__avatar">
						${renderAvatar(target.name, "checkin-avatar--xl")}
						<span class="checkin-status-dot ${getStatusDotClass(target.status)}"></span>
					</div>
					<h3 class="checkin-section__title">${target.name}</h3>
					<div class="checkin-tag checkin-tag--slate">${target.role === UserRole.ADMIN ? "系統管理員" : "一般員工"}</div>
					<div class="checkin-profile__status">
						${renderStatusBadge(target.status, target.id)}
					</div>
					<div class="checkin-profile__meta">
						<div class="checkin-profile__row">
							<span>累積總工時</span>
							<strong>${totalHours.toFixed(1)} <span class="checkin-muted">hr</span></strong>
						</div>
						<div class="checkin-profile__row">
							<span>出勤天數</span>
							<strong>${dailyData.length} <span class="checkin-muted">天</span></strong>
						</div>
						<div class="checkin-profile__row">
							<span>平均日工時</span>
							<strong>${avgHours} <span class="checkin-muted">hr</span></strong>
						</div>
					</div>
				</div>
				<div class="checkin-stack">
					<div class="checkin-card">
						<div class="checkin-toolbar">
							<h3 class="checkin-card__heading">${icon("bar-chart", 18)}工時趨勢分析</h3>
							<div class="checkin-toggle">
								<button data-action="set-chart-mode" data-mode="week" class="${state.chartMode === "week" ? "is-active" : ""}">最近7天</button>
								<button data-action="set-chart-mode" data-mode="month" class="${state.chartMode === "month" ? "is-active" : ""}">最近30天</button>
							</div>
						</div>
						<div class="checkin-chart ${state.chartMode === "month" ? "is-scrollable" : ""}">
							${chartData.map((entry) => `
								<div class="checkin-chart__bar" title="${entry.date}: ${entry.hours} 小時">
									<div class="checkin-chart__fill ${entry.hours >= 8 ? "is-strong" : ""}" style="height:${(entry.hours / maxHours) * 100}%"></div>
									<span>${entry.label}</span>
								</div>
							`).join("")}
						</div>
					</div>
					<div class="checkin-card">
						<div class="checkin-toolbar">
							<h3 class="checkin-card__heading">${icon("clock", 18)}${state.viewMode === "list" ? "每日考勤詳情" : "打卡日曆視圖"}</h3>
							<div class="checkin-toggle">
								<button data-action="set-view-mode" data-mode="list" class="${state.viewMode === "list" ? "is-active" : ""}">${icon("list", 14)}列表</button>
								<button data-action="set-view-mode" data-mode="calendar" class="${state.viewMode === "calendar" ? "is-active" : ""}">${icon("calendar", 14)}日曆</button>
							</div>
						</div>
						<div class="checkin-gap-top">
							${state.viewMode === "list" ? renderRecordList(dailyData) : renderCalendar(dailyData)}
						</div>
					</div>
				</div>
			</div>
		</div>
		`;
	}

	function renderRecordList(dailyData) {
		if (!dailyData.length) return `<div class="checkin-empty">尚無打卡記錄</div>`;
		return `
		<div class="checkin-record-list">
			${dailyData.slice(0, 14).map((day) => {
			const dateLabel = day.date.toLocaleDateString("zh-TW", { year: "numeric", month: "long", day: "numeric" });
			const dayShort = day.date.toLocaleDateString("en-US", { weekday: "short" });
			const dayNum = day.date.getDate();
			const sessionItems = day.sessions.length
				? day.sessions.map((session) => {
					const startTime = formatShortTime(session.start);
					const endTime = session.end ? formatShortTime(session.end) : "工作中...";
					const duration = (session.duration / (1000 * 60 * 60)).toFixed(2);
					return `
							<div class="checkin-session">
								<span class="checkin-session__dot"></span>
								<div class="checkin-session__bar">
									<span>${startTime} ➔ ${endTime}</span>
									<strong>${duration} h</strong>
								</div>
							</div>
						`;
				}).join("")
				: `<div class="checkin-muted">無有效工時區段</div>`;

			const recordLogs = day.records.map((record) => {
				const meta = getRecordMeta(record.type);
				return `
						<div class="checkin-record-log">
							<span class="checkin-record-log__dot ${meta.logDotClass}"></span>
							<span>${formatShortTime(toDate(record.ts))}</span>
							<span class="${meta.textClass}">${getRecordLabel(record.type)}</span>
						</div>
					`;
			}).join("");

			return `
					<div class="checkin-record-day">
						<div class="checkin-record-day__header">
							<div class="checkin-record-day__date">
								<div class="checkin-date-box">
									<span>${dayShort}</span>
									<strong>${dayNum}</strong>
								</div>
								<div>
									<div class="checkin-card__title">${dateLabel}</div>
									<div class="checkin-card__subtitle">${day.records.length} 筆打卡紀錄</div>
								</div>
							</div>
							<div class="checkin-record-day__total">${day.totalHours} <span class="checkin-muted">小時</span></div>
						</div>
						<div>
							${sessionItems}
						</div>
						<div class="checkin-record-day__logs">
							${recordLogs}
						</div>
					</div>
				`;
		}).join("")}
		</div>
		`;
	}

	function renderCalendar(dailyData) {
		const calendarDate = state.calendarDate;
		const year = calendarDate.getFullYear();
		const month = calendarDate.getMonth();
		const firstDay = new Date(year, month, 1).getDay();
		const daysInMonth = new Date(year, month + 1, 0).getDate();
		const today = new Date();
		const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

		const cells = [];
		for (let i = 0; i < firstDay; i++) {
			cells.push(`<div class="checkin-calendar__cell checkin-calendar__cell--empty"></div>`);
		}
		for (let d = 1; d <= daysInMonth; d++) {
			const date = new Date(year, month, d);
			const isToday = date.toDateString() === today.toDateString();
			const isWeekend = date.getDay() === 0 || date.getDay() === 6;
			const dayData = dailyData.find((item) => item.date.toDateString() === date.toDateString());
			cells.push(`
				<div class="checkin-calendar__cell ${isToday ? "is-today" : ""} ${isWeekend ? "is-weekend" : ""}">
					<div class="checkin-calendar__date">${d}</div>
					${dayData ? `<div class="checkin-calendar__hours">${dayData.totalHours}h</div>` : ""}
				</div>
			`);
		}

		return `
		<div class="checkin-calendar">
			<div class="checkin-calendar__header">
				<button class="checkin-icon-btn" data-action="calendar-prev">${icon("chevron-left", 18)}</button>
				<span class="checkin-calendar__month">${year} 年 ${month + 1} 月</span>
				<button class="checkin-icon-btn" data-action="calendar-next">${icon("chevron-right", 18)}</button>
			</div>
			<div class="checkin-calendar__weekdays">
				${weekdays.map((label, idx) => `
					<div class="${idx === 0 || idx === 6 ? "checkin-calendar__weekday--weekend" : ""}">${label}</div>
				`).join("")}
			</div>
			<div class="checkin-calendar__grid">
				${cells.join("")}
			</div>
		</div>
		`;
	}

	function renderReports() {
		const user = getEmployeeById(state.currentUserId);
		const admin = user.role === UserRole.ADMIN;
		const selectedEmp = admin ? state.reportEmployeeId : user.id;
		const filtered = getRecordsArray().filter((record) => {
			if (state.reportFilterType !== "all" && record.type !== state.reportFilterType) return false;
			if (selectedEmp !== "all" && record.eid !== selectedEmp) return false;
			return true;
		});

		return `
		<div class="checkin-section checkin-view--reports">
			<div class="checkin-section__header">
				<div>
					<h2 class="checkin-section__title">考勤明細報表</h2>
					<p class="checkin-section__subtitle">${admin ? "查看所有員工的詳細打卡歷史記錄" : "查看您的個人打卡歷史記錄"}</p>
				</div>
				${admin ? `
					<button class="checkin-btn checkin-btn--outline" data-action="export-csv">${icon("download", 16)} 匯出 CSV</button>
				` : ""}
			</div>
			<div class="checkin-card checkin-card--table">
				<div class="checkin-filter">
					<div class="checkin-filter__label">${icon("filter", 14)} 篩選條件</div>
					${admin ? `
						<select data-action="report-employee">
							<option value="all">所有員工</option>
							${getEmployeesArray().map((emp) => `
								<option value="${emp.id}" ${emp.id === selectedEmp ? "selected" : ""}>${emp.name}</option>
							`).join("")}
						</select>
					` : ""}
					<select data-action="report-filter">
						<option value="all">所有類型</option>
						<option value="${AttendanceType.CLOCK_IN}" ${state.reportFilterType === AttendanceType.CLOCK_IN ? "selected" : ""}>上班</option>
						<option value="${AttendanceType.CLOCK_OUT}" ${state.reportFilterType === AttendanceType.CLOCK_OUT ? "selected" : ""}>下班</option>
						<option value="${AttendanceType.BREAK_START}" ${state.reportFilterType === AttendanceType.BREAK_START ? "selected" : ""}>休息</option>
						<option value="${AttendanceType.BREAK_END}" ${state.reportFilterType === AttendanceType.BREAK_END ? "selected" : ""}>結束休息</option>
					</select>
					<div class="checkin-filter__count">共找到 ${filtered.length} 筆記錄</div>
				</div>
				<div class="checkin-table-wrap">
					<table class="checkin-table">
						<thead>
							<tr>
								<th>員工</th>
								<th>日期</th>
								<th>時間</th>
								<th>打卡類型</th>
								<th>備註</th>
								${admin ? "<th class=\"checkin-text-right\">操作</th>" : ""}
							</tr>
						</thead>
						<tbody>
							${filtered.map((record) => {
			const emp = getEmployeeById(record.eid);
			const date = toDate(record.ts);
			const meta = getRecordMeta(record.type);
			return `
									<tr>
										<td>
											<div class="checkin-inline">
												${renderAvatar(emp ? emp.name : "U", "checkin-avatar--xs")}
												<span>${emp ? emp.name : "Unknown"}</span>
											</div>
										</td>
										<td>${date ? date.toLocaleDateString() : "-"}</td>
										<td>${date ? formatShortTime(date) : "-"}</td>
										<td><span class="${meta.tagClass}">${getRecordLabel(record.type)}</span></td>
										<td>${record.notes || "-"}</td>
								${admin ? `
								<td class="checkin-text-right">
									<div class="checkin-table__actions">
										<button class="checkin-icon-btn" data-action="edit-record" data-id="${record.id}" title="編輯">
											${icon("edit", 16)}
										</button>
												<button class="checkin-icon-btn checkin-icon-btn--danger" data-action="delete-record" data-id="${record.id}" title="刪除 (無法復原)">
													${icon("trash", 16)}
												</button>
											</div>
										</td>
										` : ""}
									</tr>
								`;
		}).join("")}
						</tbody>
					</table>
				</div>
				${filtered.length === 0 ? `<div class="checkin-empty">尚無符合條件的記錄</div>` : ""}
			</div>
		</div>
		`;
	}

	function renderEmployees() {
		const search = state.employeeSearch.trim().toLowerCase();
		const employees = getEmployeesArray().filter((emp) => emp.name.toLowerCase().includes(search));
		return `
		<div class="checkin-section checkin-view--employees">
			<div class="checkin-section__header">
				<div>
					<h2 class="checkin-section__title">員工管理</h2>
					<p class="checkin-section__subtitle">管理公司成員與角色權限</p>
				</div>
				<button class="checkin-btn checkin-btn--primary" data-action="open-add-employee">${icon("plus", 18)} 新增員工</button>
			</div>
			<div class="checkin-card checkin-card--table">
				<div class="checkin-filter">
					<div class="checkin-search">
						<span class="checkin-search__icon">${icon("search", 16)}</span>
						<input type="text" data-action="employee-search" placeholder="搜尋員工姓名..." value="${state.employeeSearch}" />
					</div>
				</div>
				<div class="checkin-table-wrap">
					<table class="checkin-table">
						<thead>
							<tr>
								<th>員工資訊</th>
								<th>權限角色</th>
								<th>狀態</th>
								<th class="checkin-text-right">操作</th>
							</tr>
						</thead>
						<tbody>
							${employees.map((emp) => {
			const statusLabel = getStatusLabel(emp.status, emp.id);
			return `
									<tr>
										<td>
											<div class="checkin-inline">
												${renderAvatar(emp.name, "checkin-avatar--sm")}
												<div>
													<div class="checkin-card__title">${emp.name}</div>
													<div class="checkin-card__subtitle">ID: ${emp.id}</div>
												</div>
											</div>
										</td>
										<td>
											<span class="checkin-tag ${emp.role === UserRole.ADMIN ? "checkin-tag--green" : "checkin-tag--brand"}">
												${emp.role === UserRole.ADMIN ? "系統管理員" : "一般員工"}
											</span>
										</td>
								<td>
									<div class="checkin-inline">
										<span class="checkin-record-log__dot ${getStatusDotVariant(emp.status)}"></span>
										<span>${statusLabel}</span>
									</div>
								</td>
								<td>
									<div class="checkin-table__actions">
										<button class="checkin-icon-btn" data-action="edit-employee" data-id="${emp.id}" title="編輯">
											${icon("edit", 16)}
										</button>
										<button class="checkin-icon-btn checkin-icon-btn--danger" data-action="delete-employee" data-id="${emp.id}" title="刪除">
											${icon("trash", 16)}
										</button>
									</div>
								</td>
									</tr>
								`;
		}).join("")}
						</tbody>
					</table>
				</div>
				${employees.length === 0 ? `<div class="checkin-empty">尚無員工資料</div>` : ""}
			</div>
		</div>
		`;
	}

	function renderChangePassword() {
		return `
		<div class="checkin-section checkin-view--password">
			<div class="checkin-card">
				<div class="checkin-card__header">${icon("lock", 18)} 修改密碼</div>
				<form class="checkin-card__body checkin-form" data-action="change-password">
					${state.passwordError ? `<div class="checkin-alert checkin-alert--error">${icon("alert", 16)}<span>${state.passwordError}</span></div>` : ""}
					<label class="checkin-field">
						<span class="checkin-field__icon">${icon("lock", 16)}</span>
						<input type="password" name="current" placeholder="目前密碼" required />
					</label>
					<label class="checkin-field">
						<span class="checkin-field__icon">${icon("lock", 16)}</span>
						<input type="password" name="next" placeholder="新密碼" required />
					</label>
					<label class="checkin-field">
						<span class="checkin-field__icon">${icon("lock", 16)}</span>
						<input type="password" name="confirm" placeholder="確認新密碼" required />
					</label>
					<button class="checkin-btn checkin-btn--primary checkin-btn--full" type="submit">確認修改</button>
				</form>
			</div>
		</div>
		`;
	}

	function renderModal() {
		if (!state.modal) return "";
		if (state.modal.type === "addEmployee") {
			return `
			<div class="checkin-modal">
				<div class="checkin-modal__content">
					<div class="checkin-modal__header">
						<h3>新增員工</h3>
						<button class="checkin-icon-btn" data-action="close-modal">${icon("close", 18)}</button>
					</div>
					<form class="checkin-modal__body checkin-form" data-action="save-employee">
						<label>
							<span class="checkin-card__subtitle">姓名</span>
							<input type="text" name="name" placeholder="姓名" required />
						</label>
						<label>
							<span class="checkin-card__subtitle">密碼</span>
							<input type="password" name="password" placeholder="密碼" required />
						</label>
						<label>
							<span class="checkin-card__subtitle">角色</span>
							<select name="role">
								<option value="${UserRole.EMPLOYEE}">一般員工</option>
								<option value="${UserRole.ADMIN}">管理員</option>
							</select>
						</label>
						<div class="checkin-modal__footer">
							<button type="button" class="checkin-btn checkin-btn--outline" data-action="close-modal">取消</button>
							<button type="submit" class="checkin-btn checkin-btn--primary">建立</button>
						</div>
					</form>
				</div>
			</div>
			`;
		}
		if (state.modal.type === "editEmployee") {
			const employee = state.employees[state.modal.empId];
			if (!employee) return "";
			return `
			<div class="checkin-modal">
				<div class="checkin-modal__content">
					<div class="checkin-modal__header">
						<h3>編輯員工</h3>
						<button class="checkin-icon-btn" data-action="close-modal">${icon("close", 18)}</button>
					</div>
					<form class="checkin-modal__body checkin-form" data-action="save-employee-edit" data-id="${employee.id}">
						<label>
							<span class="checkin-card__subtitle">姓名</span>
							<input type="text" name="name" placeholder="姓名" value="${employee.name}" required />
						</label>
						<label>
							<span class="checkin-card__subtitle">角色</span>
							<select name="role">
								<option value="${UserRole.EMPLOYEE}" ${employee.role === UserRole.EMPLOYEE ? "selected" : ""}>一般員工</option>
								<option value="${UserRole.ADMIN}" ${employee.role === UserRole.ADMIN ? "selected" : ""}>管理員</option>
							</select>
						</label>
						<label>
							<span class="checkin-card__subtitle">新密碼（留空不變）</span>
							<input type="password" name="password" placeholder="新密碼" />
						</label>
						<div class="checkin-modal__footer">
							<button type="button" class="checkin-btn checkin-btn--outline" data-action="close-modal">取消</button>
							<button type="submit" class="checkin-btn checkin-btn--primary">儲存</button>
						</div>
					</form>
				</div>
			</div>
			`;
		}
		if (state.modal.type === "editRecord") {
			const record = state.records[state.modal.recordId];
			if (!record) return "";
			const dateValue = formatDateInput(record.ts);
			return `
			<div class="checkin-modal">
				<div class="checkin-modal__content">
					<div class="checkin-modal__header">
						<h3>編輯打卡記錄</h3>
						<button class="checkin-icon-btn" data-action="close-modal">${icon("close", 18)}</button>
					</div>
					<form class="checkin-modal__body checkin-form" data-action="save-record" data-id="${record.id}">
						<label>
							<span class="checkin-card__subtitle">類型</span>
							<select name="type">
								<option value="${AttendanceType.CLOCK_IN}" ${record.type === AttendanceType.CLOCK_IN ? "selected" : ""}>上班</option>
								<option value="${AttendanceType.CLOCK_OUT}" ${record.type === AttendanceType.CLOCK_OUT ? "selected" : ""}>下班</option>
								<option value="${AttendanceType.BREAK_START}" ${record.type === AttendanceType.BREAK_START ? "selected" : ""}>休息</option>
								<option value="${AttendanceType.BREAK_END}" ${record.type === AttendanceType.BREAK_END ? "selected" : ""}>結束休息</option>
							</select>
						</label>
						<label>
							<span class="checkin-card__subtitle">時間</span>
							<input type="datetime-local" name="ts" value="${dateValue}" required />
						</label>
						<label>
							<span class="checkin-card__subtitle">備註</span>
							<input type="text" name="notes" placeholder="備註" value="${record.notes || ""}" />
						</label>
						<div class="checkin-modal__footer">
							<button type="button" class="checkin-btn checkin-btn--outline" data-action="close-modal">取消</button>
							<button type="submit" class="checkin-btn checkin-btn--primary">儲存</button>
						</div>
					</form>
				</div>
			</div>
			`;
		}
		return "";
	}

	function renderView() {
		switch (state.currentView) {
			case "dashboard":
				return renderAdminDashboard();
			case "individual":
				return renderIndividualDashboard();
			case "reports":
				return renderReports();
			case "employees":
				return renderEmployees();
			case "password":
				return renderChangePassword();
			case "clock":
			default:
				return renderClockView();
		}
	}

	function render() {
		if (!rootEl) return;
		if (state.loading) {
			rootEl.innerHTML = `<div class="checkin-loading">載入中...</div>`;
			return;
		}
		if (!state.currentUserId) {
			rootEl.innerHTML = renderLogin();
			return;
		}
		rootEl.innerHTML = `
			${renderHeader()}
			<div class="checkin-content">${renderView()}</div>
			${renderModal()}
		`;
		startClockTimer();
		if (focusEmployeeSearch && state.currentView === "employees") {
			focusEmployeeSearch = false;
			requestAnimationFrame(() => {
				const input = rootEl.querySelector('[data-action="employee-search"]');
				if (input) {
					input.focus();
					const len = input.value.length;
					if (typeof input.setSelectionRange === "function") {
						input.setSelectionRange(len, len);
					}
				}
			});
		}
	}

	async function handleClockAction(type) {
		const user = getEmployeeById(state.currentUserId);
		if (!user) return;
		const recordId = getNextRecordId();
		const ts = Date.now();
		const record = {
			id: recordId,
			eid: user.id,
			type,
			ts,
		};
		const nextStatus =
			type === AttendanceType.CLOCK_IN
				? EmployeeStatus.WORKING
				: type === AttendanceType.CLOCK_OUT
					? EmployeeStatus.OFF_DUTY
					: type === AttendanceType.BREAK_START
						? EmployeeStatus.ON_BREAK
						: EmployeeStatus.WORKING;

		const updatedUser = { ...user, status: nextStatus };
		const nextEmployees = { ...state.employees, [user.id]: updatedUser };
		const nextRecords = { ...state.records, [recordId]: record };
		state.employees = nextEmployees;
		state.records = nextRecords;
		updateGlobalData();
		render();

		if (typeof saveAllToCloud === "function") {
			await saveAllToCloud({
				[`attendanceEmployees/${user.id}`]: updatedUser,
				[`attendanceRecords/${recordId}`]: record,
			});
		}
	}

	async function handleLoginSubmit(password) {
		const employee = getEmployeeById(state.loginEmployeeId);
		if (!employee) return;
		const ok = await verifyPassword(password, employee);
		if (!ok) {
			setState({ loginError: "密碼錯誤，請重試" });
			return;
		}
		setState({
			currentUserId: employee.id,
			currentView: "clock",
			loginEmployeeId: null,
			loginError: "",
			passwordError: "",
			dashboardEmployeeId: employee.id,
			reportEmployeeId: employee.role === UserRole.ADMIN ? "all" : employee.id,
		});
	}

	async function handleAddEmployee(form) {
		const name = form.name.value.trim();
		const password = form.password.value;
		const role = form.role.value;
		if (!name || !password) return;
		const nextId = (() => {
			const ids = Object.keys(state.employees || {});
			let maxId = 0;
			ids.forEach((existingId) => {
				const match = /^emp_(\d+)$/.exec(existingId);
				if (match) {
					const numeric = Number(match[1]);
					if (!Number.isNaN(numeric)) maxId = Math.max(maxId, numeric);
				}
			});
			return `emp_${maxId + 1}`;
		})();
		const id = nextId;
		const passwordRecord = await makePasswordRecord(password);
		const employee = {
			id,
			name,
			role,
			status: EmployeeStatus.OFF_DUTY,
			...passwordRecord,
		};
		state.employees = { ...state.employees, [id]: employee };
		state.modal = null;
		updateGlobalData();
		render();
		if (typeof saveAllToCloud === "function") {
			await saveAllToCloud({ [`attendanceEmployees/${id}`]: employee });
		}
	}

	async function handleSaveEmployeeEdit(form) {
		const empId = form.dataset.id;
		const employee = state.employees[empId];
		if (!employee) return;
		const name = form.name.value.trim();
		const role = form.role.value;
		const password = form.password.value;
		if (!name) return;
		let passwordRecord = {};
		if (password) {
			passwordRecord = await makePasswordRecord(password);
		}
		const updated = {
			...employee,
			name,
			role,
			...passwordRecord,
		};
		state.employees = { ...state.employees, [empId]: updated };
		state.modal = null;
		updateGlobalData();
		render();
		if (typeof saveAllToCloud === "function") {
			await saveAllToCloud({ [`attendanceEmployees/${empId}`]: updated });
		}
	}

	async function handleDeleteEmployee(empId) {
		const emp = getEmployeeById(empId);
		if (!emp) return;
		if (!confirm("確定要刪除此員工嗎？此操作無法復原。")) return;
		const next = { ...state.employees };
		delete next[empId];
		state.employees = next;
		updateGlobalData();
		render();
		if (typeof saveAllToCloud === "function") {
			await saveAllToCloud({ [`attendanceEmployees/${empId}`]: null });
		}
	}

	async function handleDeleteRecord(recordId) {
		if (!confirm("確定要刪除此筆記錄嗎？此操作無法復原。")) return;
		const next = { ...state.records };
		delete next[recordId];
		state.records = next;
		updateGlobalData();
		render();
		if (typeof saveAllToCloud === "function") {
			await saveAllToCloud({ [`attendanceRecords/${recordId}`]: null });
		}
	}

	async function handleSaveRecord(form) {
		const recordId = form.dataset.id;
		const record = state.records[recordId];
		if (!record) return;
		const updated = {
			...record,
			type: form.type.value,
			ts: new Date(form.ts.value).getTime(),
			notes: form.notes.value.trim(),
		};
		state.records = { ...state.records, [recordId]: updated };
		state.modal = null;
		updateGlobalData();
		render();
		if (typeof saveAllToCloud === "function") {
			await saveAllToCloud({ [`attendanceRecords/${recordId}`]: updated });
		}
	}

	async function handleChangePassword(form) {
		const user = getEmployeeById(state.currentUserId);
		if (!user) return;
		const current = form.current.value;
		const next = form.next.value;
		const confirmPwd = form.confirm.value;
		if (!(await verifyPassword(current, user))) {
			setState({ passwordError: "目前密碼不正確" });
			return;
		}
		if (!next) {
			setState({ passwordError: "請輸入新密碼" });
			return;
		}
		if (next !== confirmPwd) {
			setState({ passwordError: "確認密碼與新密碼不符" });
			return;
		}
		const passwordRecord = await makePasswordRecord(next);
		const updated = { ...user, ...passwordRecord };
		state.employees = { ...state.employees, [user.id]: updated };
		updateGlobalData();
		setState({ passwordError: "" });
		if (typeof saveAllToCloud === "function") {
			await saveAllToCloud({ [`attendanceEmployees/${user.id}`]: updated });
		}
		alert("✅ 密碼已更新");
	}

	function handleExportCsv() {
		const user = getEmployeeById(state.currentUserId);
		if (!user || user.role !== UserRole.ADMIN) return;
		const selectedEmp = state.reportEmployeeId;
		const filtered = getRecordsArray().filter((record) => {
			if (state.reportFilterType !== "all" && record.type !== state.reportFilterType) return false;
			if (selectedEmp !== "all" && record.eid !== selectedEmp) return false;
			return true;
		});

		const header = ["員工", "員工ID", "日期", "時間", "類型", "備註"];
		const rows = filtered.map((record) => {
			const emp = getEmployeeById(record.eid);
			const date = toDate(record.ts);
			const dateText = date ? date.toLocaleDateString("zh-TW") : "";
			const timeText = date ? formatShortTime(date) : "";
			return [
				emp ? emp.name : "",
				record.eid || "",
				dateText,
				timeText,
				getRecordLabel(record.type),
				record.notes || "",
			];
		});

		const csvLines = [header, ...rows]
			.map((row) =>
				row
					.map((cell) => {
						const value = String(cell ?? "");
						return `"${value.replace(/\"/g, "\"\"")}"`;
					})
					.join(","),
			)
			.join("\n");

		const blob = new Blob([csvLines], { type: "text/csv;charset=utf-8" });
		const url = URL.createObjectURL(blob);
		const link = document.createElement("a");
		const stamp = new Date().toISOString().slice(0, 10);
		link.href = url;
		link.download = `打卡紀錄-${stamp}.csv`;
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
		URL.revokeObjectURL(url);
	}

	function handleRootClick(event) {
		const actionEl = event.target.closest("[data-action]");
		if (!actionEl) return;
		const action = actionEl.dataset.action;
		if (action === "select-employee" && actionEl.dataset.id) {
			setState({ loginEmployeeId: actionEl.dataset.id, loginError: "" });
			return;
		}
		if (action === "login-back") {
			setState({ loginEmployeeId: null, loginError: "" });
			return;
		}
		if (action === "nav") {
			setState({ currentView: actionEl.dataset.view });
			return;
		}
		if (action === "logout") {
			logout();
			return;
		}
		if (action === "clock-action") {
			handleClockAction(actionEl.dataset.type);
			return;
		}
		if (action === "set-view-mode") {
			setState({ viewMode: actionEl.dataset.mode });
			return;
		}
		if (action === "set-chart-mode") {
			setState({ chartMode: actionEl.dataset.mode });
			return;
		}
		if (action === "calendar-prev") {
			const date = new Date(state.calendarDate);
			date.setMonth(date.getMonth() - 1);
			setState({ calendarDate: date });
			return;
		}
		if (action === "calendar-next") {
			const date = new Date(state.calendarDate);
			date.setMonth(date.getMonth() + 1);
			setState({ calendarDate: date });
			return;
		}
		if (action === "open-add-employee") {
			setState({ modal: { type: "addEmployee" } });
			return;
		}
		if (action === "close-modal") {
			setState({ modal: null });
			return;
		}
		if (action === "delete-employee") {
			handleDeleteEmployee(actionEl.dataset.id);
			return;
		}
		if (action === "export-csv") {
			handleExportCsv();
			return;
		}
		if (action === "edit-employee") {
			setState({ modal: { type: "editEmployee", empId: actionEl.dataset.id } });
			return;
		}
		if (action === "edit-record") {
			setState({ modal: { type: "editRecord", recordId: actionEl.dataset.id } });
			return;
		}
		if (action === "delete-record") {
			handleDeleteRecord(actionEl.dataset.id);
			return;
		}
	}

	function handleRootChange(event) {
		const target = event.target;
		if (target.dataset.action === "report-filter") {
			setState({ reportFilterType: target.value });
		}
		if (target.dataset.action === "report-employee") {
			setState({ reportEmployeeId: target.value });
		}
		if (target.dataset.action === "select-employee" && target.dataset.context === "dashboard") {
			setState({ dashboardEmployeeId: target.value });
		}
	}

	function handleRootInput(event) {
		const target = event.target;
		if (target.dataset.action === "employee-search") {
			if (isEmployeeSearchComposing) return;
			focusEmployeeSearch = true;
			setState({ employeeSearch: target.value });
		}
	}

	function handleRootCompositionStart(event) {
		const target = event.target;
		if (target.dataset.action === "employee-search") {
			isEmployeeSearchComposing = true;
		}
	}

	function handleRootCompositionEnd(event) {
		const target = event.target;
		if (target.dataset.action === "employee-search") {
			isEmployeeSearchComposing = false;
			focusEmployeeSearch = true;
			setState({ employeeSearch: target.value });
		}
	}

	function handleRootSubmit(event) {
		const form = event.target;
		if (!form.dataset.action) return;
		event.preventDefault();
		if (form.dataset.action === "login-submit") {
			handleLoginSubmit(form.password.value);
			form.reset();
			return;
		}
		if (form.dataset.action === "save-employee") {
			handleAddEmployee(form);
			return;
		}
		if (form.dataset.action === "save-employee-edit") {
			handleSaveEmployeeEdit(form);
			return;
		}
		if (form.dataset.action === "save-record") {
			handleSaveRecord(form);
			return;
		}
		if (form.dataset.action === "change-password") {
			handleChangePassword(form);
			form.reset();
			return;
		}
	}

	function bindEvents() {
		if (!rootEl) return;
		rootEl.addEventListener("click", handleRootClick);
		rootEl.addEventListener("submit", handleRootSubmit);
		rootEl.addEventListener("change", handleRootChange);
		rootEl.addEventListener("input", handleRootInput);
		rootEl.addEventListener("compositionstart", handleRootCompositionStart);
		rootEl.addEventListener("compositionend", handleRootCompositionEnd);
	}

	async function init(options) {
		if (state.initialized) return;
		state.initialized = true;
		ensureContainer(options && options.mountId);
		wrapHideAll();
		bindEvents();
		await ensureData();
	}

	window.CheckInPlugin = {
		init,
		open,
		reset() {
			logout();
		},
		onDataUpdate(root, value) {
			if (root === "attendanceEmployees") state.employees = normalizeEmployees(value);
			if (root === "attendanceRecords") state.records = normalizeRecords(value);
			if (!state.loading) render();
		},
	};

	window.openCheckinPage = function () {
		if (!state.initialized) {
			init({});
		}
		open();
	};

	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", () => init({}));
	} else {
		init({});
	}
})();
