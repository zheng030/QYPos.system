import { render } from './render'
import { AttendanceType, bridge, EmployeeStatus, runtime, setRender, setState, state, UserRole } from './store'
import {
  ensureContainer,
  ensureData,
  formatBusinessDateOnly,
  formatShortTime,
  getEmployeeById,
  getNextRecordId,
  getRecordLabel,
  getRecordsArray,
  logout,
  makePasswordRecord,
  open,
  toDate,
  updateGlobalData,
  verifyPassword,
  wrapHideAll,
} from './utils'

type CheckinForm = HTMLFormElement & {
  dataset: DOMStringMap
  password: HTMLInputElement
  name: HTMLInputElement
  role: HTMLSelectElement
  type: HTMLSelectElement
  ts: HTMLInputElement
  notes: HTMLInputElement
  current: HTMLInputElement
  next: HTMLInputElement
  confirm: HTMLInputElement
}

function getActionElement(event: Event, selector: string) {
  const target = event.target
  if (!(target instanceof Element)) {
    return null
  }
  return target.closest<HTMLElement>(selector)
}

let chartTooltipEl: HTMLElement | null = null

async function handleClockAction(type: string) {
  const user = getEmployeeById(state.currentUserId)
  if (!user) return
  const recordId = getNextRecordId()
  const record = { id: recordId, eid: user.id, type, ts: Date.now() }
  const nextStatus =
    type === AttendanceType.CLOCK_IN
      ? EmployeeStatus.WORKING
      : type === AttendanceType.CLOCK_OUT
        ? EmployeeStatus.OFF_DUTY
        : type === AttendanceType.BREAK_START
          ? EmployeeStatus.ON_BREAK
          : EmployeeStatus.WORKING
  const updatedUser = { ...user, status: nextStatus }
  state.employees = { ...state.employees, [user.id]: updatedUser }
  state.records = { ...state.records, [recordId]: record }
  updateGlobalData()
  render()
  await bridge.attendance?.save({
    [`attendanceEmployees/${user.id}`]: updatedUser,
    [`attendanceRecords/${recordId}`]: record,
  })
}

async function handleLoginSubmit(password: string) {
  const employee = getEmployeeById(state.loginEmployeeId)
  if (!employee) return
  const ok = await verifyPassword(password, employee)
  if (!ok) {
    setState({ loginError: '密碼錯誤，請重試' })
    return
  }
  setState({
    currentUserId: employee.id,
    currentView: 'clock',
    loginEmployeeId: null,
    loginError: '',
    passwordError: '',
    dashboardEmployeeId: employee.id,
    reportEmployeeId: employee.role === UserRole.ADMIN ? 'all' : employee.id,
  })
}

function getNextEmployeeId() {
  let maxId = 0
  Object.keys(state.employees || {}).forEach((existingId) => {
    const match = /^emp_(\d+)$/.exec(existingId)
    if (!match) return
    const numeric = Number(match[1])
    if (!Number.isNaN(numeric)) maxId = Math.max(maxId, numeric)
  })
  return `emp_${maxId + 1}`
}

async function handleAddEmployee(form: CheckinForm) {
  const name = form.name.value.trim()
  const password = form.password.value
  const role = form.role.value
  if (!name || !password) return
  const id = getNextEmployeeId()
  const passwordRecord = await makePasswordRecord(password)
  const employee = { id, name, role, status: EmployeeStatus.OFF_DUTY, ...passwordRecord }
  state.employees = { ...state.employees, [id]: employee }
  state.modal = null
  updateGlobalData()
  render()
  await bridge.attendance?.save({ [`attendanceEmployees/${id}`]: employee })
}

async function handleSaveEmployeeEdit(form: CheckinForm) {
  const empId = form.dataset.id
  if (!empId) return
  const employee = state.employees[empId]
  if (!employee) return
  const name = form.name.value.trim()
  const role = form.role.value
  const password = form.password.value
  if (!name) return
  const passwordRecord = password ? await makePasswordRecord(password) : {}
  const updated = { ...employee, name, role, ...passwordRecord }
  state.employees = { ...state.employees, [empId]: updated }
  state.modal = null
  updateGlobalData()
  render()
  await bridge.attendance?.save({ [`attendanceEmployees/${empId}`]: updated })
}

async function handleDeleteEmployee(empId: string) {
  const employee = getEmployeeById(empId)
  if (!employee) return
  if (!confirm('確定要刪除此員工嗎？此操作無法復原。')) return
  const nextEmployees = { ...state.employees }
  delete nextEmployees[empId]
  state.employees = nextEmployees
  updateGlobalData()
  render()
  await bridge.attendance?.save({ [`attendanceEmployees/${empId}`]: null })
}

async function handleDeleteRecord(recordId: string) {
  if (!confirm('確定要刪除此筆記錄嗎？此操作無法復原。')) return
  const nextRecords = { ...state.records }
  delete nextRecords[recordId]
  state.records = nextRecords
  updateGlobalData()
  render()
  await bridge.attendance?.save({ [`attendanceRecords/${recordId}`]: null })
}

async function handleSaveRecord(form: CheckinForm) {
  const recordId = form.dataset.id
  if (!recordId) return
  const record = state.records[recordId]
  if (!record) return
  const updated = {
    ...record,
    type: form.type.value,
    ts: new Date(form.ts.value).getTime(),
    notes: form.notes.value.trim(),
  }
  state.records = { ...state.records, [recordId]: updated }
  state.modal = null
  updateGlobalData()
  render()
  await bridge.attendance?.save({ [`attendanceRecords/${recordId}`]: updated })
}

async function handleChangePassword(form: CheckinForm) {
  const user = getEmployeeById(state.currentUserId)
  if (!user) return
  const current = form.current.value
  const next = form.next.value
  const confirmPwd = form.confirm.value
  if (!(await verifyPassword(current, user))) {
    setState({ passwordError: '目前密碼不正確' })
    return
  }
  if (!next) {
    setState({ passwordError: '請輸入新密碼' })
    return
  }
  if (next !== confirmPwd) {
    setState({ passwordError: '確認密碼與新密碼不符' })
    return
  }
  const passwordRecord = await makePasswordRecord(next)
  const updated = { ...user, ...passwordRecord }
  state.employees = { ...state.employees, [user.id]: updated }
  updateGlobalData()
  setState({ passwordError: '' })
  await bridge.attendance?.save({ [`attendanceEmployees/${user.id}`]: updated })
  alert('✅ 密碼已更新')
}

function handleExportCsv() {
  const user = getEmployeeById(state.currentUserId)
  if (!user || user.role !== UserRole.ADMIN) return
  const selectedEmp = state.reportEmployeeId
  const filtered = getRecordsArray().filter((record) => {
    if (state.reportFilterType !== 'all' && record.type !== state.reportFilterType) return false
    if (selectedEmp !== 'all' && record.eid !== selectedEmp) return false
    return true
  })
  const header = ['員工', '員工ID', '日期', '時間', '類型', '備註']
  const rows = filtered.map((record) => {
    const employee = getEmployeeById(record.eid)
    const date = toDate(record.ts)
    return [
      employee ? employee.name : '',
      record.eid || '',
      date ? formatBusinessDateOnly(date) : '',
      date ? formatShortTime(date) : '',
      getRecordLabel(record.type),
      record.notes || '',
    ]
  })
  const csvLines = [header, ...rows]
    .map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\n')
  const blob = new Blob([csvLines], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `打卡紀錄-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

function handleRootClick(event: MouseEvent) {
  const actionEl = getActionElement(event, '[data-action]')
  if (!actionEl) return
  const action = actionEl.dataset.action
  if (action === 'select-employee' && actionEl.dataset.id)
    return void setState({ loginEmployeeId: actionEl.dataset.id, loginError: '' })
  if (action === 'login-back') return void setState({ loginEmployeeId: null, loginError: '' })
  if (action === 'checkin-back') {
    logout()
    bridge.appShell?.showHome()
    return
  }
  if (action === 'nav' && actionEl.dataset.view) return void setState({ currentView: actionEl.dataset.view })
  if (action === 'logout') return void logout()
  if (action === 'clock-action' && actionEl.dataset.type) return void handleClockAction(actionEl.dataset.type)
  if (action === 'set-view-mode' && actionEl.dataset.mode) return void setState({ viewMode: actionEl.dataset.mode })
  if (action === 'set-chart-mode' && actionEl.dataset.mode) return void setState({ chartMode: actionEl.dataset.mode })
  if (action === 'calendar-prev') {
    const date = new Date(state.calendarDate)
    date.setMonth(date.getMonth() - 1)
    return void setState({ calendarDate: date })
  }
  if (action === 'calendar-next') {
    const date = new Date(state.calendarDate)
    date.setMonth(date.getMonth() + 1)
    return void setState({ calendarDate: date })
  }
  if (action === 'open-add-employee') return void setState({ modal: { type: 'addEmployee' } })
  if (action === 'close-modal') return void setState({ modal: null })
  if (action === 'delete-employee' && actionEl.dataset.id) return void handleDeleteEmployee(actionEl.dataset.id)
  if (action === 'export-csv') return void handleExportCsv()
  if (action === 'edit-employee' && actionEl.dataset.id)
    return void setState({ modal: { type: 'editEmployee', empId: actionEl.dataset.id } })
  if (action === 'edit-record' && actionEl.dataset.id)
    return void setState({ modal: { type: 'editRecord', recordId: actionEl.dataset.id } })
  if (action === 'delete-record' && actionEl.dataset.id) return void handleDeleteRecord(actionEl.dataset.id)
}

function handleRootChange(event: Event) {
  const target = event.target
  if (!(target instanceof HTMLInputElement) && !(target instanceof HTMLSelectElement)) {
    return
  }
  if (target.dataset.action === 'report-filter') setState({ reportFilterType: target.value })
  if (target.dataset.action === 'report-employee') setState({ reportEmployeeId: target.value })
  if (target.dataset.action === 'select-employee' && target.dataset.context === 'dashboard') {
    setState({ dashboardEmployeeId: target.value })
  }
}

function handleRootInput(event: Event) {
  const target = event.target
  if (!(target instanceof HTMLInputElement)) {
    return
  }
  if (target.dataset.action !== 'employee-search') return
  if (runtime.isEmployeeSearchComposing) return
  runtime.focusEmployeeSearch = true
  setState({ employeeSearch: target.value })
}

function handleRootCompositionStart(event: CompositionEvent) {
  const target = event.target
  if (!(target instanceof HTMLInputElement)) {
    return
  }
  if (target.dataset.action === 'employee-search') runtime.isEmployeeSearchComposing = true
}

function handleRootCompositionEnd(event: CompositionEvent) {
  const target = event.target
  if (!(target instanceof HTMLInputElement)) {
    return
  }
  if (target.dataset.action !== 'employee-search') return
  runtime.isEmployeeSearchComposing = false
  runtime.focusEmployeeSearch = true
  setState({ employeeSearch: target.value })
}

function handleRootSubmit(event: SubmitEvent) {
  const form = event.target
  if (!(form instanceof HTMLFormElement)) {
    return
  }
  if (!form.dataset.action) return
  event.preventDefault()
  if (form.dataset.action === 'login-submit') {
    void handleLoginSubmit((form as CheckinForm).password.value)
    form.reset()
    return
  }
  if (form.dataset.action === 'save-employee') return void handleAddEmployee(form as CheckinForm)
  if (form.dataset.action === 'save-employee-edit') return void handleSaveEmployeeEdit(form as CheckinForm)
  if (form.dataset.action === 'save-record') return void handleSaveRecord(form as CheckinForm)
  if (form.dataset.action === 'change-password') {
    void handleChangePassword(form as CheckinForm)
    form.reset()
  }
}

function ensureChartTooltip() {
  if (chartTooltipEl) return chartTooltipEl
  chartTooltipEl = document.createElement('div')
  chartTooltipEl.className = 'checkin-chart-tooltip'
  chartTooltipEl.style.display = 'none'
  document.body.appendChild(chartTooltipEl)
  return chartTooltipEl
}

function handleChartTooltipOver(event: MouseEvent) {
  const bar = getActionElement(event, '.checkin-chart__bar')
  if (!bar) return
  const tooltip = ensureChartTooltip()
  tooltip.innerHTML = `<strong>${bar.dataset.tooltipDate || ''}</strong><span>工時: ${bar.dataset.tooltipHours || '0'} 小時</span>`
  tooltip.style.display = 'flex'
  handleChartTooltipMove(event)
}

function handleChartTooltipMove(event: MouseEvent) {
  if (!chartTooltipEl || chartTooltipEl.style.display === 'none') return
  const offset = 14
  let x = event.clientX + offset
  let y = event.clientY - offset
  const rect = chartTooltipEl.getBoundingClientRect()
  if (x + rect.width > globalThis.innerWidth) x = event.clientX - rect.width - offset
  if (y - rect.height < 0) y = event.clientY + offset
  chartTooltipEl.style.left = `${x}px`
  chartTooltipEl.style.top = `${y}px`
}

function handleChartTooltipOut(event: MouseEvent) {
  const bar = getActionElement(event, '.checkin-chart__bar')
  if (!bar || !chartTooltipEl) return
  const related = event.relatedTarget
  if (related instanceof Node && bar.contains(related)) return
  chartTooltipEl.style.display = 'none'
}

function bindEvents() {
  const eventRoot = runtime.pageEl || runtime.rootEl
  if (!eventRoot) return
  eventRoot.addEventListener('click', handleRootClick)
  eventRoot.addEventListener('submit', handleRootSubmit)
  eventRoot.addEventListener('change', handleRootChange)
  eventRoot.addEventListener('input', handleRootInput)
  eventRoot.addEventListener('compositionstart', handleRootCompositionStart)
  eventRoot.addEventListener('compositionend', handleRootCompositionEnd)
  eventRoot.addEventListener('mouseover', handleChartTooltipOver)
  eventRoot.addEventListener('mousemove', handleChartTooltipMove)
  eventRoot.addEventListener('mouseout', handleChartTooltipOut)
}

export async function init(options?: { mountId?: string }) {
  if (state.initialized) return
  state.initialized = true
  setRender(render)
  ensureContainer(options?.mountId)
  wrapHideAll()
  bindEvents()
  await ensureData()
}

export function openCheckinPage() {
  if (!state.initialized) {
    void init({})
  }
  open()
}
