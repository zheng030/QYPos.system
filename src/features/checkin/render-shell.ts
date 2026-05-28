import { AttendanceType, state, UserRole } from './store'
import type { AttendanceEmployee, AttendanceRecord } from './types'
import {
  formatBusinessDateOnly,
  formatDateInput,
  formatShortTime,
  getEmployeeById,
  getEmployeesArray,
  getRecordLabel,
  getRecordMeta,
  getRecordsArray,
  getStatusDotVariant,
  getStatusLabel,
  icon,
  renderAvatar,
  toBusinessDate,
  toDate,
} from './utils'

type DailyRecordGroup = ReturnType<typeof import('./utils').groupRecordsByDay>[number]

export function renderRecordList(dailyData: DailyRecordGroup[]) {
  if (!dailyData.length) return `<div class="checkin-empty">尚無打卡記錄</div>`
  return `<div class="checkin-record-list">${dailyData
    .slice(0, 14)
    .map((day) => {
      const dateLabel = day.date.toLocaleDateString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric' })
      const dayShort = day.date.toLocaleDateString('en-US', { weekday: 'short' })
      const dayNum = day.date.getDate()
      const sessionItems = day.sessions.length
        ? day.sessions
            .map((session) => {
              const startTime = formatShortTime(session.start)
              const endTime = session.end ? formatShortTime(session.end) : '工作中...'
              const duration = (session.duration / (1000 * 60 * 60)).toFixed(2)
              return `<div class="checkin-session"><span class="checkin-session__dot"></span><div class="checkin-session__bar"><span>${startTime} ➔ ${endTime}</span><strong>${duration} h</strong></div></div>`
            })
            .join('')
        : `<div class="checkin-muted">無有效工時區段</div>`
      const recordLogs = day.records
        .map((record) => {
          const meta = getRecordMeta(record.type)
          return `<div class="checkin-record-log"><span class="checkin-record-log__dot ${meta.logDotClass}"></span><span>${formatShortTime(toDate(record.ts))}</span><span class="${meta.textClass}">${getRecordLabel(record.type)}</span></div>`
        })
        .join('')
      return `<div class="checkin-record-day"><div class="checkin-record-day__header"><div class="checkin-record-day__date"><div class="checkin-date-box"><span>${dayShort}</span><strong>${dayNum}</strong></div><div><div class="checkin-card__title">${dateLabel}</div><div class="checkin-card__subtitle">${day.records.length} 筆打卡紀錄</div></div></div><div class="checkin-record-day__total">${day.totalHours} <span class="checkin-muted">小時</span></div></div><div>${sessionItems}</div><div class="checkin-record-day__logs">${recordLogs}</div></div>`
    })
    .join('')}</div>`
}

export function renderCalendar(dailyData: DailyRecordGroup[]) {
  const calendarDate = state.calendarDate
  const year = calendarDate.getFullYear()
  const month = calendarDate.getMonth()
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const today = toBusinessDate(new Date())
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const cells = []
  for (let index = 0; index < firstDay; index += 1)
    cells.push(`<div class="checkin-calendar__cell checkin-calendar__cell--empty"></div>`)
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(year, month, day)
    const isToday = date.toDateString() === today.toDateString()
    const isWeekend = date.getDay() === 0 || date.getDay() === 6
    const dayData = dailyData.find((item) => item.date.toDateString() === date.toDateString())
    cells.push(
      `<div class="checkin-calendar__cell ${isToday ? 'is-today' : ''} ${isWeekend ? 'is-weekend' : ''}"><div class="checkin-calendar__date">${day}</div>${dayData ? `<div class="checkin-calendar__hours">${dayData.totalHours}h</div>` : ''}</div>`
    )
  }
  return `<div class="checkin-calendar"><div class="checkin-calendar__header"><button class="checkin-icon-btn" data-action="calendar-prev">${icon('chevron-left', 18)}</button><span class="checkin-calendar__month">${year} 年 ${month + 1} 月</span><button class="checkin-icon-btn" data-action="calendar-next">${icon('chevron-right', 18)}</button></div><div class="checkin-calendar__weekdays">${weekdays.map((label, index) => `<div class="${index === 0 || index === 6 ? 'checkin-calendar__weekday--weekend' : ''}">${label}</div>`).join('')}</div><div class="checkin-calendar__grid">${cells.join('')}</div></div>`
}

export function renderReports() {
  const user = getEmployeeById(state.currentUserId)
  if (!user) return ''
  const admin = user.role === UserRole.ADMIN
  const selectedEmp = admin ? state.reportEmployeeId : user.id
  const filtered = getRecordsArray().filter(
    (record) =>
      (state.reportFilterType === 'all' || record.type === state.reportFilterType) &&
      (selectedEmp === 'all' || record.eid === selectedEmp)
  )
  return `<div class="checkin-section checkin-view--reports"><div class="checkin-section__header"><div><h2 class="checkin-section__title">考勤明細報表</h2><p class="checkin-section__subtitle">${admin ? '查看所有員工的詳細打卡歷史記錄' : '查看您的個人打卡歷史記錄'}</p></div>${admin ? `<button class="checkin-btn checkin-btn--outline" data-action="export-csv">${icon('download', 16)} 匯出 CSV</button>` : ''}</div><div class="checkin-card checkin-card--table"><div class="checkin-filter"><div class="checkin-filter__label">${icon('filter', 14)} 篩選條件</div>${
    admin
      ? `<select data-action="report-employee"><option value="all">所有員工</option>${getEmployeesArray()
          .map((emp) => `<option value="${emp.id}" ${emp.id === selectedEmp ? 'selected' : ''}>${emp.name}</option>`)
          .join('')}</select>`
      : ''
  }<select data-action="report-filter"><option value="all">所有類型</option><option value="${AttendanceType.CLOCK_IN}" ${state.reportFilterType === AttendanceType.CLOCK_IN ? 'selected' : ''}>上班</option><option value="${AttendanceType.CLOCK_OUT}" ${state.reportFilterType === AttendanceType.CLOCK_OUT ? 'selected' : ''}>下班</option><option value="${AttendanceType.BREAK_START}" ${state.reportFilterType === AttendanceType.BREAK_START ? 'selected' : ''}>休息</option><option value="${AttendanceType.BREAK_END}" ${state.reportFilterType === AttendanceType.BREAK_END ? 'selected' : ''}>結束休息</option></select><div class="checkin-filter__count">共找到 ${filtered.length} 筆記錄</div></div><div class="checkin-table-wrap"><table class="checkin-table"><thead><tr><th>員工</th><th>日期</th><th>時間</th><th>打卡類型</th><th>備註</th>${admin ? '<th class="checkin-text-right">操作</th>' : ''}</tr></thead><tbody>${filtered
    .map((record) => {
      const emp = getEmployeeById(record.eid)
      const date = toDate(record.ts)
      const meta = getRecordMeta(record.type)
      return `<tr><td><div class="checkin-inline">${renderAvatar(emp ? emp.name : 'U', 'checkin-avatar--xs')}<span>${emp ? emp.name : 'Unknown'}</span></div></td><td>${date ? formatBusinessDateOnly(date) : '-'}</td><td>${date ? formatShortTime(date) : '-'}</td><td><span class="${meta.tagClass}">${getRecordLabel(record.type)}</span></td><td>${record.notes || '-'}</td>${admin ? `<td class="checkin-text-right"><div class="checkin-table__actions"><button class="checkin-icon-btn" data-action="edit-record" data-id="${record.id}" title="編輯">${icon('edit', 16)}</button><button class="checkin-icon-btn checkin-icon-btn--danger" data-action="delete-record" data-id="${record.id}" title="刪除 (無法復原)">${icon('trash', 16)}</button></div></td>` : ''}</tr>`
    })
    .join(
      ''
    )}</tbody></table></div>${filtered.length === 0 ? `<div class="checkin-empty">尚無符合條件的記錄</div>` : ''}</div></div>`
}

export function renderEmployees() {
  const search = state.employeeSearch.trim().toLowerCase()
  const employees = getEmployeesArray().filter((emp) => emp.name.toLowerCase().includes(search))
  return `<div class="checkin-section checkin-view--employees"><div class="checkin-section__header"><div><h2 class="checkin-section__title">員工管理</h2><p class="checkin-section__subtitle">管理公司成員與角色權限</p></div><button class="checkin-btn checkin-btn--primary" data-action="open-add-employee">${icon('plus', 18)} 新增員工</button></div><div class="checkin-card checkin-card--table"><div class="checkin-toolbar"><div class="checkin-search"><span>${icon('search', 16)}</span><input type="text" data-action="employee-search" placeholder="搜尋員工姓名..." value="${state.employeeSearch}" /></div></div><div class="checkin-table-wrap"><table class="checkin-table"><thead><tr><th>員工資訊</th><th>權限角色</th><th>狀態</th><th class="checkin-text-right">操作</th></tr></thead><tbody>${employees
    .map((emp) => {
      const statusLabel = getStatusLabel(emp.status, emp.id)
      return `<tr><td><div class="checkin-inline">${renderAvatar(emp.name, 'checkin-avatar--sm')}<div><div class="checkin-card__title">${emp.name}</div><div class="checkin-card__subtitle">ID: ${emp.id}</div></div></div></td><td><span class="checkin-tag ${emp.role === UserRole.ADMIN ? 'checkin-tag--green' : 'checkin-tag--brand'}">${emp.role === UserRole.ADMIN ? '系統管理員' : '一般員工'}</span></td><td><div class="checkin-inline"><span class="checkin-record-log__dot ${getStatusDotVariant(emp.status)}"></span><span>${statusLabel}</span></div></td><td><div class="checkin-table__actions"><button class="checkin-icon-btn" data-action="edit-employee" data-id="${emp.id}" title="編輯">${icon('edit', 16)}</button><button class="checkin-icon-btn checkin-icon-btn--danger" data-action="delete-employee" data-id="${emp.id}" title="刪除">${icon('trash', 16)}</button></div></td></tr>`
    })
    .join(
      ''
    )}</tbody></table></div>${employees.length === 0 ? `<div class="checkin-empty">尚無員工資料</div>` : ''}</div></div>`
}

export function renderChangePassword() {
  return `<div class="checkin-section checkin-view--password"><div class="checkin-card"><div class="checkin-card__header">${icon('lock', 18)} 修改密碼</div><form class="checkin-card__body checkin-form" data-action="change-password">${state.passwordError ? `<div class="checkin-alert checkin-alert--error">${icon('alert', 16)}<span>${state.passwordError}</span></div>` : ''}<label class="checkin-field"><span class="checkin-field__icon">${icon('lock', 16)}</span><input type="password" name="current" placeholder="目前密碼" required /></label><label class="checkin-field"><span class="checkin-field__icon">${icon('lock', 16)}</span><input type="password" name="next" placeholder="新密碼" required /></label><label class="checkin-field"><span class="checkin-field__icon">${icon('lock', 16)}</span><input type="password" name="confirm" placeholder="確認新密碼" required /></label><button class="checkin-btn checkin-btn--primary checkin-btn--full" type="submit">確認修改</button></form></div></div>`
}

export function renderModal() {
  if (!state.modal) return ''
  if (state.modal.type === 'addEmployee') {
    return `<div class="checkin-modal"><div class="checkin-modal__content"><div class="checkin-modal__header"><h3>新增員工</h3><button class="checkin-icon-btn" data-action="close-modal">${icon('close', 18)}</button></div><form class="checkin-modal__body checkin-form" data-action="save-employee"><label><span class="checkin-card__subtitle">姓名</span><input type="text" name="name" placeholder="姓名" required /></label><label><span class="checkin-card__subtitle">密碼</span><input type="password" name="password" placeholder="密碼" required /></label><label><span class="checkin-card__subtitle">角色</span><select name="role"><option value="${UserRole.EMPLOYEE}">一般員工</option><option value="${UserRole.ADMIN}">管理員</option></select></label><div class="checkin-modal__footer"><button type="button" class="checkin-btn checkin-btn--outline" data-action="close-modal">取消</button><button type="submit" class="checkin-btn checkin-btn--primary">建立</button></div></form></div></div>`
  }
  if (state.modal.type === 'editEmployee') {
    const employee = state.employees[state.modal.empId] as AttendanceEmployee | undefined
    if (!employee) return ''
    return `<div class="checkin-modal"><div class="checkin-modal__content"><div class="checkin-modal__header"><h3>編輯員工</h3><button class="checkin-icon-btn" data-action="close-modal">${icon('close', 18)}</button></div><form class="checkin-modal__body checkin-form" data-action="save-employee-edit" data-id="${employee.id}"><label><span class="checkin-card__subtitle">姓名</span><input type="text" name="name" placeholder="姓名" value="${employee.name}" required /></label><label><span class="checkin-card__subtitle">角色</span><select name="role"><option value="${UserRole.EMPLOYEE}" ${employee.role === UserRole.EMPLOYEE ? 'selected' : ''}>一般員工</option><option value="${UserRole.ADMIN}" ${employee.role === UserRole.ADMIN ? 'selected' : ''}>管理員</option></select></label><label><span class="checkin-card__subtitle">新密碼（留空不變）</span><input type="password" name="password" placeholder="新密碼" /></label><div class="checkin-modal__footer"><button type="button" class="checkin-btn checkin-btn--outline" data-action="close-modal">取消</button><button type="submit" class="checkin-btn checkin-btn--primary">儲存</button></div></form></div></div>`
  }
  if (state.modal.type === 'editRecord') {
    const record = state.records[state.modal.recordId] as AttendanceRecord | undefined
    if (!record) return ''
    const dateValue = formatDateInput(record.ts)
    return `<div class="checkin-modal"><div class="checkin-modal__content"><div class="checkin-modal__header"><h3>編輯打卡記錄</h3><button class="checkin-icon-btn" data-action="close-modal">${icon('close', 18)}</button></div><form class="checkin-modal__body checkin-form" data-action="save-record" data-id="${record.id}"><label><span class="checkin-card__subtitle">類型</span><select name="type"><option value="${AttendanceType.CLOCK_IN}" ${record.type === AttendanceType.CLOCK_IN ? 'selected' : ''}>上班</option><option value="${AttendanceType.CLOCK_OUT}" ${record.type === AttendanceType.CLOCK_OUT ? 'selected' : ''}>下班</option><option value="${AttendanceType.BREAK_START}" ${record.type === AttendanceType.BREAK_START ? 'selected' : ''}>休息</option><option value="${AttendanceType.BREAK_END}" ${record.type === AttendanceType.BREAK_END ? 'selected' : ''}>結束休息</option></select></label><label><span class="checkin-card__subtitle">時間</span><input type="datetime-local" name="ts" value="${dateValue}" required /></label><label><span class="checkin-card__subtitle">備註</span><input type="text" name="notes" placeholder="備註" value="${record.notes || ''}" /></label><div class="checkin-modal__footer"><button type="button" class="checkin-btn checkin-btn--outline" data-action="close-modal">取消</button><button type="submit" class="checkin-btn checkin-btn--primary">儲存</button></div></form></div></div>`
  }
  return ''
}
