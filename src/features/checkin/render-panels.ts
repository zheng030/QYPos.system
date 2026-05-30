import { renderCalendar, renderRecordList } from './render-shell'
import { AttendanceType, EmployeeStatus, state, UserRole } from './store'
import {
  calculateWorkHours,
  formatDate,
  formatDateKey,
  formatShortTime,
  formatTime,
  getAuthNotice,
  getEmployeeById,
  getEmployeesArray,
  getRecordLabel,
  getRecordMeta,
  getRecordsArray,
  getRoleLabel,
  getStatusDotClass,
  getStatusLabel,
  getUserRecords,
  groupRecordsByDay,
  icon,
  renderAvatar,
  renderStatusBadge,
  toBusinessDate,
  toDate,
} from './utils'

type NavItem = {
  id: string
  label: string
  icon: string
  roles: string[]
}

export function renderLogin() {
  const employees = getEmployeesArray()
  const authNotice = getAuthNotice()
  if (!state.loginEmployeeId) {
    return `
      <div class="checkin-login checkin-login--select">
        <div class="checkin-login__intro">
          <h1 class="checkin-title">歡迎使用打卡系統</h1>
          <p class="checkin-muted">請選擇您的身份以繼續</p>
          ${authNotice ? `<p class="checkin-dev-notice">${authNotice}</p>` : ''}
        </div>
        <div class="checkin-grid checkin-grid--cards">
          ${employees.map((emp) => `<button class="checkin-card checkin-card--select" data-action="select-employee" data-id="${emp.id}">${renderAvatar(emp.name, 'checkin-avatar--lg')}<div><div class="checkin-card__title">${emp.name}</div><div class="checkin-card__subtitle">${getRoleLabel(emp.role)}</div></div></button>`).join('')}
        </div>
      </div>
    `
  }
  const selected = getEmployeeById(state.loginEmployeeId)
  const selectedName = selected ? selected.name : ''
  return `
    <div class="checkin-login">
      <div class="checkin-card checkin-card--login">
        <button class="checkin-link checkin-link--back" data-action="login-back">${icon('arrow-left', 16)} 返回選擇使用者</button>
        <div class="checkin-login__profile">
          ${renderAvatar(selectedName, 'checkin-avatar--xl')}
          <h2 class="checkin-title">早安，${selectedName}</h2>
          <p class="checkin-muted">請輸入密碼以登入系統</p>
          ${authNotice ? `<p class="checkin-dev-notice">${authNotice}</p>` : ''}
        </div>
        <form class="checkin-form" data-action="login-submit">
          <label class="checkin-field"><span class="checkin-field__icon">${icon('lock', 18)}</span><input type="password" name="password" placeholder="請輸入密碼" required /></label>
          ${state.loginError ? `<div class="checkin-alert checkin-alert--error">${icon('alert', 16)}<span>${state.loginError}</span></div>` : ''}
          <button class="checkin-btn checkin-btn--primary checkin-btn--full" type="submit">登入系統 ${icon('arrow-right', 16)}</button>
        </form>
      </div>
    </div>
  `
}

export function renderHeader() {
  const user = getEmployeeById(state.currentUserId)
  if (!user) return ''
  const menuItems: NavItem[] = [
    { id: 'clock', label: '打卡', icon: 'clock', roles: [UserRole.ADMIN, UserRole.EMPLOYEE] },
    { id: 'dashboard', label: '儀表板', icon: 'layout', roles: [UserRole.ADMIN] },
    { id: 'individual', label: '個人儀表板', icon: 'user', roles: [UserRole.ADMIN, UserRole.EMPLOYEE] },
    { id: 'reports', label: '報表', icon: 'file-bar', roles: [UserRole.ADMIN, UserRole.EMPLOYEE] },
    { id: 'employees', label: '員工', icon: 'users', roles: [UserRole.ADMIN] },
    { id: 'password', label: '修改密碼', icon: 'lock', roles: [UserRole.ADMIN, UserRole.EMPLOYEE] },
  ]
  const renderNav = (items: NavItem[]) =>
    items
      .filter((item) => item.roles.includes(user.role))
      .map(
        (item) =>
          `<button class="checkin-nav__item ${state.currentView === item.id ? 'is-active' : ''}" data-action="nav" data-view="${item.id}">${icon(item.icon, 18)}<span>${item.label}</span></button>`
      )
      .join('')
  return `
    <header class="checkin-header">
      <div class="checkin-header__inner">
        <div class="checkin-header__left">
          <div class="checkin-brand"><span class="checkin-brand__text">打卡系統</span></div>
          <nav class="checkin-nav">${renderNav(menuItems)}</nav>
        </div>
        <div class="checkin-user">
          <div class="checkin-user__meta"><div class="checkin-user__name">${user.name}</div><div class="checkin-user__role">${getRoleLabel(user.role)}</div></div>
          ${renderAvatar(user.name, 'checkin-avatar--sm')}
          <button class="checkin-icon-btn checkin-icon-btn--danger" data-action="logout" title="登出">${icon('logout', 18)}</button>
        </div>
      </div>
    </header>
    <nav class="checkin-nav-mobile">${renderNav(menuItems.slice(0, 5)).replaceAll('checkin-nav__item', 'checkin-nav-mobile__item')}</nav>
  `
}

export function renderClockView() {
  const user = getEmployeeById(state.currentUserId)
  if (!user) return ''
  const { todayRecords, weeklyRecords } = getUserRecords(user.id)
  const now = new Date()
  const dailyHours = calculateWorkHours(todayRecords, now)
  const weeklyHours = calculateWorkHours(weeklyRecords, now)
  const statusLabel = getStatusLabel(user.status, user.id)
  const actionButtons = []
  if (user.status === EmployeeStatus.OFF_DUTY) {
    actionButtons.push(
      `<button class="checkin-btn checkin-btn--primary checkin-btn--xl checkin-btn--span" data-action="clock-action" data-type="${AttendanceType.CLOCK_IN}">${icon('play', 18)} 上班打卡</button>`
    )
  } else {
    if (user.status === EmployeeStatus.WORKING)
      actionButtons.push(
        `<button class="checkin-btn checkin-btn--orange checkin-btn--xl" data-action="clock-action" data-type="${AttendanceType.BREAK_START}">${icon('coffee', 18)} 開始休息</button>`
      )
    else
      actionButtons.push(
        `<button class="checkin-btn checkin-btn--green checkin-btn--xl" data-action="clock-action" data-type="${AttendanceType.BREAK_END}">${icon('briefcase', 18)} 結束休息</button>`
      )
    actionButtons.push(
      `<button class="checkin-btn checkin-btn--dark checkin-btn--xl" data-action="clock-action" data-type="${AttendanceType.CLOCK_OUT}">${icon('square', 16)} 下班打卡</button>`
    )
  }
  const sortedRecords = [...todayRecords].sort(
    (a, b) => (toDate(a.ts)?.getTime() || 0) - (toDate(b.ts)?.getTime() || 0)
  )
  const timelineItems = sortedRecords
    .map((record) => {
      const meta = getRecordMeta(record.type)
      return `<div class="checkin-timeline__item"><span class="${meta.dotClass}"></span><div class="checkin-timeline__card"><div class="checkin-timeline__row"><span class="checkin-timeline__title ${meta.textClass}">${getRecordLabel(record.type)}</span><span class="checkin-timeline__time">${formatShortTime(toDate(record.ts))}</span></div></div></div>`
    })
    .join('')
  const activeIndicator =
    user.status !== EmployeeStatus.OFF_DUTY
      ? `<div class="checkin-timeline__active">${user.status === EmployeeStatus.WORKING ? '工作中...' : '休息中...'}</div>`
      : ''
  return `<div class="checkin-section checkin-view--clock"><div class="checkin-section__header"><div><h1 class="checkin-section__title">早安，${user.name} 👋</h1><p class="checkin-section__subtitle checkin-inline">${icon('calendar', 16)}${formatDate(now)}</p></div></div><div class="checkin-grid checkin-grid--clock"><div class="checkin-stack"><div class="checkin-card checkin-card--clock"><div class="checkin-status-row">${renderStatusBadge(user.status, user.id, `目前狀態：${statusLabel}`)}</div><div class="checkin-time" data-role="checkin-time">${formatTime(now)}</div><div class="checkin-date" data-role="checkin-date">${formatDate(now)}</div><div class="checkin-actions">${actionButtons.join('')}</div></div><div class="checkin-grid checkin-grid--stats"><div class="checkin-card"><div class="checkin-stat-card"><div><div class="checkin-stat__label checkin-text--brand">本日工時</div><div class="checkin-stat__value">${dailyHours} <span>小時</span></div></div><div class="checkin-stat__icon checkin-stat__icon--blue">${icon('clock', 18)}</div></div></div><div class="checkin-card"><div class="checkin-stat-card"><div><div class="checkin-stat__label checkin-text--purple">本週工時</div><div class="checkin-stat__value">${weeklyHours} <span>小時</span></div></div><div class="checkin-stat__icon checkin-stat__icon--purple">${icon('calendar', 18)}</div></div></div></div></div><div class="checkin-card checkin-card--timeline"><h3 class="checkin-card__heading"><span class="checkin-card__accent"></span>今日打卡記錄</h3>${sortedRecords.length === 0 ? `<div class="checkin-empty">${icon('clock', 28)}<div>尚無今日打卡記錄</div><div class="checkin-muted">開始您的一天吧！</div></div>` : `<div class="checkin-timeline">${timelineItems}</div>${activeIndicator}`}</div></div></div>`
}

export function renderAdminDashboard() {
  const employees = getEmployeesArray()
  const records = getRecordsArray()
  const todayKey = formatDateKey(new Date())
  const employeesWithRecords = new Set(
    records
      .filter((r) => {
        const d = toDate(r.ts)
        return d && formatDateKey(d) === todayKey
      })
      .map((r) => r.eid)
  )
  let working = 0,
    onBreak = 0,
    clockedOut = 0,
    notClockedIn = 0
  employees.forEach((emp) => {
    if (emp.status === EmployeeStatus.WORKING) working += 1
    else if (emp.status === EmployeeStatus.ON_BREAK) onBreak += 1
    else if (employeesWithRecords.has(emp.id)) clockedOut += 1
    else notClockedIn += 1
  })
  const calculateAvgHours = (days: number) => {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - days)
    const validRecords = records.filter((r) => {
      const d = toDate(r.ts)
      return d && d >= cutoff
    })
    let totalMs = 0
    const empDays = new Set<string>()
    employees.forEach((emp) => {
      const empRecs = validRecords
        .filter((r) => r.eid === emp.id)
        .sort((a, b) => (toDate(a.ts)?.getTime() || 0) - (toDate(b.ts)?.getTime() || 0))
      let start: number | null = null
      empRecs.forEach((r) => {
        if (r.type === AttendanceType.CLOCK_IN) start = toDate(r.ts)?.getTime() || null
        if (r.type === AttendanceType.CLOCK_OUT && start !== null) {
          totalMs += (toDate(r.ts)?.getTime() || 0) - start
          start = null
        }
      })
    })
    validRecords.forEach((r) => {
      const d = toDate(r.ts)
      if (d) empDays.add(`${r.eid}_${formatDateKey(d)}`)
    })
    return empDays.size > 0 ? (totalMs / (1000 * 60 * 60) / empDays.size).toFixed(1) : '0.0'
  }
  const recent = records.slice(0, 10)
  const statCards = [
    { label: '總員工數', value: employees.length, icon: 'users', variant: 'blue' },
    { label: '平均工時 (7天)', value: `${calculateAvgHours(7)} hr`, icon: 'clock', variant: 'purple' },
    { label: '平均工時 (30天)', value: `${calculateAvgHours(30)} hr`, icon: 'calendar', variant: 'purple' },
  ]
  const statusCards = [
    { label: '未上班', value: notClockedIn, icon: 'login', variant: 'slate' },
    { label: '工作中', value: working, icon: 'briefcase', variant: 'green' },
    { label: '休息中', value: onBreak, icon: 'coffee', variant: 'orange' },
    { label: '已下班', value: clockedOut, icon: 'logout', variant: 'slate' },
  ]
  return `<div class="checkin-section checkin-view--dashboard"><div class="checkin-section__header"><div><h2 class="checkin-section__title">管理儀表板</h2><p class="checkin-section__subtitle">即時監控公司出勤狀況與數據概覽</p></div></div><div class="checkin-grid checkin-grid--stats">${statCards.map((item) => `<div class="checkin-card"><div class="checkin-stat-card"><div><div class="checkin-stat__label">${item.label}</div><div class="checkin-stat__value">${item.value}</div></div><div class="checkin-stat__icon checkin-stat__icon--${item.variant}">${icon(item.icon, 18)}</div></div></div>`).join('')}</div><div class="checkin-grid checkin-grid--status">${statusCards.map((item) => `<div class="checkin-card"><div class="checkin-stat-card"><div><div class="checkin-stat__label">${item.label}</div><div class="checkin-stat__value">${item.value}</div></div><div class="checkin-stat__icon checkin-stat__icon--${item.variant}">${icon(item.icon, 18)}</div></div></div>`).join('')}</div><div class="checkin-card checkin-card--table"><div class="checkin-card__header">最新打卡記錄</div><div class="checkin-table-wrap"><table class="checkin-table"><thead><tr><th>員工</th><th>類型</th><th>時間</th></tr></thead><tbody>${recent
    .map((record) => {
      const emp = getEmployeeById(record.eid)
      const meta = getRecordMeta(record.type)
      return `<tr><td><div class="checkin-inline">${renderAvatar(emp ? emp.name : 'U', 'checkin-avatar--xs')}<span>${emp ? emp.name : 'Unknown'}</span></div></td><td><span class="${meta.tagClass}">${getRecordLabel(record.type)}</span></td><td>${formatShortTime(toDate(record.ts))}</td></tr>`
    })
    .join('')}</tbody></table></div></div></div>`
}

export function renderIndividualDashboard() {
  const user = getEmployeeById(state.currentUserId)
  if (!user) return ''
  const canSelect = user.role === UserRole.ADMIN
  const selectedId = canSelect ? state.dashboardEmployeeId || user.id : user.id
  const target = getEmployeeById(selectedId) || user
  const records = getRecordsArray().filter((record) => record.eid === target.id)
  const dailyData = groupRecordsByDay(records)
  const totalHours = dailyData.reduce((sum, day) => sum + day.totalHours, 0)
  const avgHours = dailyData.length > 0 ? (totalHours / dailyData.length).toFixed(1) : '0.0'
  const chartData = []
  const now = new Date()
  const range = state.chartMode === 'week' ? 7 : 30
  for (let index = range - 1; index >= 0; index -= 1) {
    const date = new Date(now)
    date.setDate(date.getDate() - index)
    const key = formatDateKey(date)
    const businessDate = toBusinessDate(date)
    const found = dailyData.find((item) => formatDateKey(item.date) === key)
    chartData.push({
      label:
        state.chartMode === 'week'
          ? businessDate.toLocaleDateString('zh-TW', { weekday: 'short' })
          : `${businessDate.getMonth() + 1}/${businessDate.getDate()}`,
      hours: found ? found.totalHours : 0,
      date: businessDate.toLocaleDateString('zh-TW'),
    })
  }
  const maxHours = Math.max(1, ...chartData.map((item) => item.hours))
  return `<div class="checkin-section checkin-view--individual"><div class="checkin-section__header"><div><h2 class="checkin-section__title">個人儀表板</h2><p class="checkin-section__subtitle">員工個人工時分析與考勤記錄</p></div>${
    canSelect
      ? `<div class="checkin-select"><select data-action="select-employee" data-context="dashboard">${getEmployeesArray()
          .map(
            (emp) =>
              `<option value="${emp.id}" ${emp.id === selectedId ? 'selected' : ''}>${emp.name} (${getRoleLabel(emp.role)})</option>`
          )
          .join('')}</select><span class="checkin-select__icon">${icon('chevron-down', 16)}</span></div>`
      : ''
  }</div><div class="checkin-grid checkin-grid--individual"><div class="checkin-card checkin-profile"><div class="checkin-profile__avatar">${renderAvatar(target.name, 'checkin-avatar--xl')}<span class="checkin-status-dot ${getStatusDotClass(target.status)}"></span></div><h3 class="checkin-section__title">${target.name}</h3><div class="checkin-tag checkin-tag--slate">${target.role === UserRole.ADMIN ? '系統管理員' : '一般員工'}</div><div class="checkin-profile__status">${renderStatusBadge(target.status, target.id)}</div><div class="checkin-profile__meta"><div class="checkin-profile__row"><span>累積總工時</span><strong>${totalHours.toFixed(1)} <span class="checkin-muted">hr</span></strong></div><div class="checkin-profile__row"><span>出勤天數</span><strong>${dailyData.length} <span class="checkin-muted">天</span></strong></div><div class="checkin-profile__row"><span>平均日工時</span><strong>${avgHours} <span class="checkin-muted">hr</span></strong></div></div></div><div class="checkin-stack"><div class="checkin-card"><div class="checkin-toolbar"><h3 class="checkin-card__heading">${icon('bar-chart', 18)}工時趨勢分析</h3><div class="checkin-toggle"><button data-action="set-chart-mode" data-mode="week" class="${state.chartMode === 'week' ? 'is-active' : ''}">最近7天</button><button data-action="set-chart-mode" data-mode="month" class="${state.chartMode === 'month' ? 'is-active' : ''}">最近30天</button></div></div><div class="checkin-chart-scroll ${state.chartMode === 'month' ? 'is-scrollable' : ''}"><div class="checkin-chart">${chartData.map((entry) => `<div class="checkin-chart__bar" data-tooltip-date="${entry.date}" data-tooltip-hours="${entry.hours}"><div class="checkin-chart__fill ${entry.hours >= 1 ? 'is-strong' : ''}" style="height:${(entry.hours / maxHours) * 100}%"></div><span>${entry.label}</span></div>`).join('')}</div></div></div><div class="checkin-card"><div class="checkin-toolbar"><h3 class="checkin-card__heading">${icon('clock', 18)}${state.viewMode === 'list' ? '每日考勤詳情' : '打卡日曆視圖'}</h3><div class="checkin-toggle"><button data-action="set-view-mode" data-mode="list" class="${state.viewMode === 'list' ? 'is-active' : ''}">${icon('list', 14)}列表</button><button data-action="set-view-mode" data-mode="calendar" class="${state.viewMode === 'calendar' ? 'is-active' : ''}">${icon('calendar', 14)}日曆</button></div></div><div class="checkin-gap-top">${state.viewMode === 'list' ? renderRecordList(dailyData) : renderCalendar(dailyData)}</div></div></div></div></div>`
}
