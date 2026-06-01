import { authGate } from '@/shared/auth-gate'

const authNotice = authGate.getDevBypassNotice()

export const appShellHtml = `
  <div id="receipt-print-area" class="print-area-hidden"></div>
  <div id="toast-container"></div>

  <div id="login-screen">
    <div class="login-box">
      <h1>系統登入</h1>
      <p>請輸入員工密碼</p>
      ${authNotice ? `<p class="dev-auth-notice">${authNotice}</p>` : ''}
      <input type="password" id="loginPass" placeholder="密碼" data-action="login-password">
      <button class="btn-effect" data-action="check-login">進入系統</button>
      <p id="loginError" class="login-error-msg">密碼錯誤</p>
    </div>
  </div>

  <div id="app-container" style="display:none;">
    <div id="home">
      <div class="menu-btn" data-action="open-table-select">
        <span class="menu-icon">🛒</span>
        <span>點餐系統</span>
      </div>
      <div class="menu-btn" data-action="open-page" data-page="historyPage">
        <span class="menu-icon">📋</span>
        <span>今日訂單</span>
      </div>
      <div class="menu-btn" data-action="open-page" data-page="reportPage">
        <span class="menu-icon">📊</span>
        <span>營業報表</span>
      </div>
      <div class="menu-btn" data-action="open-checkin-page">
        <span class="menu-icon">🕒</span>
        <span>打卡系統</span>
      </div>
      <div class="menu-btn" data-action="open-finance-page" data-mode="cost">
        <span class="menu-icon">🤫</span>
        <span>成本輸入</span>
      </div>
      <div class="menu-btn" data-action="open-finance-page" data-mode="finance">
        <span class="menu-icon">🔐</span>
        <span>財務/詳單</span>
      </div>
      <div class="menu-btn" data-action="open-settings-page">
        <span class="menu-icon">🛠️</span>
        <span>系統設定</span>
      </div>
      <div class="menu-btn" data-action="open-product-page">
        <span class="menu-icon">📦</span>
        <span>商品庫存</span>
      </div>
      <div class="menu-btn" data-action="open-item-stats-page">
        <span class="menu-icon">📈</span>
        <span>歷史銷量</span>
      </div>
    </div>

    <div id="tableSelect">
      <div class="header-row">
        <button class="back btn-effect" data-action="go-home">返回主畫面</button>
        <button class="btn-effect qr-code-btn" data-action="toggle-qr-mode">顯示 QR Code</button>
        <div id="systemTime">載入中...</div>
      </div>
      <div class="title">請選擇桌號</div>
      <div id="tableSelectGrid"></div>
    </div>

    <div id="orderPage">
      <div class="order-page-shell">
        <div class="order-toolbar">
          <button class="back btn-effect" data-action="save-and-exit">返回</button>
          <div class="title">點餐中 <span id="seatLabel"></span></div>
          <div id="seatTimer"></div>
        </div>

        <div class="customer-input-box" id="orderCustomerBox">
          <input type="text" id="custName" placeholder="客人姓名" data-action="customer-info-input">
          <input type="tel" id="custPhone" placeholder="電話號碼" data-action="customer-info-input">
        </div>

        <div class="order-page-body" id="orderPageBody">
          <div class="order-tab-shell" id="customerOrderShell">
            <div class="order-toolbar-actions" id="orderToolbarTabs">
              <button class="btn-effect" data-action="set-order-tab" data-tab="menu">菜單</button>
              <button class="btn-effect" data-action="set-order-tab" data-tab="cart">購物車</button>
              <button class="btn-effect" data-action="set-order-tab" data-tab="orders">訂單紀錄</button>
            </div>

            <section id="orderMenuPanel" class="order-panel order-menu-panel" data-order-panel="menu">
              <div class="order-panel-head">
                <div>
                  <h2 class="panel-title">菜單</h2>
                  <p class="panel-subtitle" id="menuPanelSubtitle">依主分類瀏覽與加點</p>
                </div>
              </div>
              <div id="menuCategoryChips" class="menu-category-chips"></div>
              <div id="menuGrid" class="order-menu-grid"></div>
            </section>

            <section id="orderDraftPanel" class="order-panel order-draft-panel" data-order-panel="cart">
              <div class="order-panel-head">
                <div>
                  <h2 class="panel-title" id="draftPanelTitle">購物車</h2>
                  <p class="panel-subtitle" id="draftPanelSubtitle">確認後立即同步到購物車</p>
                </div>
              </div>
              <div id="cart-list" class="entry-list"></div>
              <div class="draft-summary-inline">
                <p id="total">總金額：$0</p>
              </div>
            </section>

            <section id="orderBatchesPanel" class="order-panel order-batches-panel" data-order-panel="orders">
              <div class="order-panel-head">
                <div>
                  <h2 class="panel-title" id="submittedPanelTitle">訂單紀錄</h2>
                  <p class="panel-subtitle" id="submittedPanelSubtitle">待接單與已接單分開顯示</p>
                </div>
              </div>
              <div id="submittedBatchList" class="batch-list"></div>
            </section>
          </div>
        </div>

        <div id="builderHost"></div>

        <div id="customerFloatingBar" class="customer-floating-bar">
          <div id="customerFloatingMain" class="floating-bar-customer">
            <div class="floating-main">
              <div class="floating-label" id="floatingActionLabel">購物車</div>
              <div class="floating-value" id="floatingDraftSummary">0 件 · $0</div>
            </div>
            <div class="floating-actions">
              <button class="btn-effect floating-clear-btn" id="floatingClearBtn" data-action="floating-clear-action">清空</button>
              <button class="btn-effect floating-submit-btn" id="floatingPrimaryBtn" data-action="floating-primary-action">送出</button>
            </div>
          </div>

          <div id="staffFloatingWorkspace" class="floating-bar-staff is-collapsed">
            <div class="staff-workspace-toggle" id="staffWorkspaceToggle">
              <div
                class="staff-workspace-toggle-trigger"
                id="staffWorkspaceToggleButton"
                data-action="toggle-staff-workspace"
                role="button"
                tabindex="0"
                aria-expanded="false"
              >
                <span class="staff-workspace-toggle-main">
                  <span id="staffWorkspaceToggleLabel">展開明細</span>
                  <span id="staffWorkspaceMeta">未送出 0 項 · 已接單 0 項 · 0 張已接單</span>
                </span>
                <span class="staff-workspace-toggle-side">
                  <span class="staff-workspace-toggle-tools">
                    <button class="btn-effect staff-tool-btn staff-tool-btn-fee" id="staffServiceFeeBtn" data-action="toggle-staff-service-fee">🧾 10%服務費</button>
                    <button class="btn-effect staff-tool-btn staff-tool-btn-discount" id="staffDiscountBtn" data-action="open-staff-discount-modal">🏷️ 折扣</button>
                  </span>
                  <span class="staff-workspace-total" id="staffWorkspaceTotal">$0</span>
                  <span class="staff-workspace-toggle-chevron" aria-hidden="true">⌄</span>
                </span>
              </div>
            </div>

            <div class="staff-workspace-body" id="staffWorkspaceBody">
              <div id="staffWorkspaceStreamList" class="staff-workspace-stream"></div>
            </div>

            <div class="staff-workspace-dock">
              <div class="staff-workspace-toolbar">
                <button class="btn-effect staff-tool-btn staff-tool-btn-save" data-action="staff-save-and-exit">📝 暫存</button>
                <button class="btn-effect staff-tool-btn staff-tool-btn-print" data-action="open-reprint-modal">🖨️ 補單</button>
                <button class="btn-effect staff-tool-btn staff-tool-btn-pay" data-action="open-payment-modal">💳 全結</button>
                <button class="btn-effect staff-tool-btn staff-tool-btn-split" data-action="open-split-checkout">✂️ 拆單</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div id="historyPage">
      <button class="back btn-effect" data-action="go-home">返回主畫面</button>
      <div class="title">今日訂單列表</div>
      <div class="history-header-row">
        <span>序號</span><span>桌號</span><span>客人資訊</span><span>時間</span><span>金額</span>
      </div>
      <div id="history-box"></div>
      <button class="end-business-btn btn-effect" data-action="close-business">結束營業</button>
    </div>

    <div id="pastHistoryPage">
      <button class="back btn-effect" data-action="go-home">返回主畫面</button>
      <div class="title">歷史銷售統計</div>
      <div class="calendar-wrapper">
        <div class="calendar-header d-flex justify-between items-center">
          <button class="btn-effect nav-circle-btn" data-action="change-stats-month" data-offset="-1">◀</button>
          <h2 id="statsMonthTitle"></h2>
          <button class="btn-effect nav-circle-btn" data-action="change-stats-month" data-offset="1">▶</button>
        </div>
      </div>
      <div class="stats-body">
        <div id="publicStatsColumns" class="stats-columns-grid"></div>
      </div>
    </div>

    <div id="reportPage">
      <button class="back btn-effect" data-action="go-home">返回主畫面</button>
      <div class="title">營業報表</div>
      <div id="reportContent">
        <div class="segment-control-wrapper">
          <div class="segment-control-container">
            <div class="segment-highlighter" id="reportHighlighter"></div>
            <div class="segment-option active" data-action="generate-report" data-range="day">今日</div>
            <div class="segment-option" data-action="generate-report" data-range="week">本周</div>
            <div class="segment-option" data-action="generate-report" data-range="month">當月</div>
          </div>
        </div>
        <div class="report-dashboard">
          <div class="stat-card total-gradient">
            <h3 id="rptTitle">全店營收</h3>
            <p id="rptTotal">$0</p>
            <small id="rptCount">總單數: 0</small>
          </div>
          <div class="stat-card primary-gradient">
            <h3>主餐組合</h3>
            <p id="rptPrimary">$0</p>
            <small>以新分類統計</small>
          </div>
          <div class="stat-card secondary-gradient">
            <h3>其餘品類</h3>
            <p id="rptSecondary">$0</p>
            <small>以新分類統計</small>
          </div>
        </div>
      </div>
      <div class="calendar-wrapper">
        <div class="calendar-header">
          <h2 id="calendarMonthTitle"></h2>
        </div>
        <div class="calendar-grid-header">
          <span>日</span><span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span>
        </div>
        <div id="calendarGrid" class="calendar-grid"></div>
      </div>
    </div>

    <div id="confidentialPage">
      <button class="back btn-effect" data-action="go-home">返回主畫面</button>
      <div class="title" id="confidentialTitle">財務 / 詳單</div>
      <div id="financeDashboard" class="finance-container"></div>
      <div id="financeCalendarSection">
        <div class="calendar-header d-flex justify-between items-center mb-15">
          <button class="btn-effect nav-circle-btn" data-action="change-owner-month" data-offset="-1">◀</button>
          <h2 id="finCalendarTitle"></h2>
          <button class="btn-effect nav-circle-btn" data-action="change-owner-month" data-offset="1">▶</button>
        </div>
        <div class="finance-layout">
          <div class="calendar-container-left">
            <div class="calendar-grid-header">
              <span>日</span><span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span>
            </div>
            <div id="finCalendarGrid" class="calendar-grid"></div>
          </div>
          <div class="finance-summary-sidebar">
            <div class="finance-controls">
              <button id="finBtnDay" class="btn-effect" data-action="update-finance-stats" data-range="day">今日</button>
              <button id="finBtnWeek" class="btn-effect" data-action="update-finance-stats" data-range="week">本周</button>
              <button id="finBtnMonth" class="btn-effect active" data-action="update-finance-stats" data-range="month">當月</button>
              <button id="finBtnCustom" class="btn-effect" data-action="update-finance-stats" data-range="custom">日期區間</button>
              <button id="finBtnSpecific" class="btn-effect" data-action="update-finance-stats" data-range="specific" style="display:none;"></button>
            </div>
            <div id="customFinanceDateRange" class="segment-control-container" style="display:none;">
              <input type="date" id="financeStartDate" data-action="finance-date-range">
              <span>～</span>
              <input type="date" id="financeEndDate" data-action="finance-date-range">
            </div>
            <div class="summary-card total-theme">
              <h3 id="financeTitle">全店總計</h3>
              <div class="sum-row"><span>總營收</span><span id="monthTotalRev">$0</span></div>
              <div class="sum-row"><span>總成本</span><span id="monthTotalCost">$0</span></div>
              <hr>
              <div class="sum-row grand-total"><span>淨利</span><span id="monthNetProfit">$0</span></div>
              <button class="btn-effect detail-btn" data-action="open-revenue-modal" data-type="total">查看明細</button>
            </div>
            <div id="financeCategoryCards" class="finance-category-cards"></div>
          </div>
        </div>
        <div id="financeOrderListSection" style="margin-top:20px; display:none;">
          <h3 id="financeSelectedDateTitle"></h3>
          <div class="history-header-row owner-grid-header">
            <span>#</span><span>桌號</span><span>內容</span><span>時間</span><span>金額</span><span>操作</span>
          </div>
          <div id="financeOrderBox"></div>
        </div>
      </div>
      <div id="costInputSection" class="finance-detail-box">
        <h3 id="costEditTitle">成本 / 售價</h3>
        <div class="cost-header-row">
          <span>品項名稱</span>
          <span>售價</span>
          <span>成本</span>
        </div>
        <div id="costEditorList"></div>
      </div>
    </div>

    <div id="settingsPage">
      <button class="back btn-effect" data-action="go-home">返回主畫面</button>
      <div class="title">系統設定</div>
      <div class="settings-card">
        <div class="settings-header"><h3>資料與維護</h3></div>
        <div class="p-20">
          <button class="btn-effect danger-btn-blue" data-action="download-sync-log">🔧 匯出同步紀錄</button>
          <button class="btn-effect danger-btn-blue" data-action="download-local-storage">💾 匯出本地資料</button>
        </div>
      </div>
      <div class="settings-card danger-zone">
        <div class="settings-header danger-header"><h3 class="danger-title">危險操作區</h3></div>
        <div class="p-20">
          <button class="btn-effect danger-btn-red" data-action="clear-all-data" style="display:none;">🗑️ 清空所有資料</button>
        </div>
      </div>
    </div>

    <div id="productPage">
      <button class="back btn-effect" data-action="go-home">返回主畫面</button>
      <div class="title">商品庫存管理</div>
      <div class="product-mgmt-box">
        <p class="product-mgmt-desc">保留顯示、可切換售完。</p>
        <div id="productManagementList"></div>
      </div>
    </div>

    <div id="itemStatsPage">
      <button class="back btn-effect" data-action="go-home">返回主畫面</button>
      <div class="title">商品銷售統計</div>
      <div class="segment-control-wrapper" style="flex-direction: column; align-items: center;">
        <div class="segment-control-container" style="width: 420px;">
          <div class="segment-highlighter" id="statsHighlighter"></div>
          <div class="segment-option active" id="statBtnDay" data-action="render-item-stats" data-range="day">今日</div>
          <div class="segment-option" id="statBtnWeek" data-action="render-item-stats" data-range="week">本周</div>
          <div class="segment-option" id="statBtnMonth" data-action="render-item-stats" data-range="month">當月</div>
          <div class="segment-option" id="statBtnCustom" data-action="render-item-stats" data-range="custom">特定日期</div>
        </div>
        <div id="customStatsDateRange" class="segment-control-container" style="display:none;">
          <input type="date" id="statsStartDate" data-action="stats-date-range">
          <span>～</span>
          <input type="date" id="statsEndDate" data-action="stats-date-range">
        </div>
      </div>
      <div class="stats-page-grid">
        <div id="itemStatsColumns" class="stats-columns-grid"></div>
      </div>
    </div>

  </div>

  <div id="summaryModal" class="modal">
    <div class="modal-content">
      <h2>本日營業結算</h2>
      <div class="summary-item"><span>總訂單數</span><span id="sumCount">0 單</span></div>
      <div class="summary-item"><span>營業總額</span><span id="sumTotal">$0</span></div>
      <hr>
      <div class="modal-actions">
        <button class="btn-effect cancel" data-action="close-summary-modal">取消</button>
        <button class="btn-effect confirm-success" data-action="confirm-clear-data">確認</button>
      </div>
    </div>
  </div>

  <div id="orderActionConfirmModal" class="modal">
    <div class="modal-content modal-sheet modal-sheet-compact">
      <h2 id="orderActionConfirmTitle">確認操作</h2>
      <p id="orderActionConfirmMessage" class="modal-copy">請確認是否繼續。</p>
      <div class="modal-actions">
        <button class="btn-effect cancel" data-action="close-order-action-confirm">取消</button>
        <button class="btn-effect confirm-primary" id="orderActionConfirmBtn" data-action="confirm-order-action">確認</button>
      </div>
    </div>
  </div>

  <div id="paymentModal" class="modal">
    <div class="modal-content modal-sheet modal-sheet-compact">
      <h2>結帳確認</h2>
      <div class="payment-info">
        <div class="pay-row"><span>應收金額 <small id="payDiscLabel"></small></span><span id="payOriginal">$0</span></div>
        <div class="pay-row" id="payDiscountRow" style="display:none;"><span>折數</span><span id="payDiscountValue">無</span></div>
        <div class="pay-row"><span>收 10% 服務費</span><input type="checkbox" id="payServiceFee" data-action="calc-final-pay"></div>
        <div class="pay-row"><span>折讓</span><input type="number" id="payAllowance" data-action="calc-final-pay"></div>
        <hr>
        <div class="pay-row large"><span>實收金額</span><input type="number" id="payFinal"></div>
      </div>
      <div class="modal-actions">
        <button class="btn-effect cancel" data-action="close-payment-modal">取消</button>
        <button class="btn-effect confirm-success" data-action="confirm-checkout">確認收款</button>
      </div>
    </div>
  </div>

  <div id="checkoutModal" class="modal">
    <div class="modal-content modal-sheet modal-sheet-wide split-modal">
      <div class="modal-header"><h2>拆單結帳</h2></div>
      <div class="modal-body">
        <div class="split-checkout-container">
          <div class="checkout-box">
            <div class="box-header"><div class="box-title">未結帳品項</div></div>
            <div id="unpaidList" class="checkout-list modern-list"></div>
          </div>
          <div class="checkout-box emphasis">
            <div class="box-header"><div class="box-title">本次結帳</div></div>
            <div id="payingList" class="checkout-list modern-list"></div>
            <div class="split-options">
              <label class="field"><span>折數 (%)</span><input type="number" id="splitDisc" data-action="calc-split-total"></label>
              <label class="field"><span>收 10% 服務費</span><input type="checkbox" id="splitServiceFee" data-action="calc-split-total"></label>
              <label class="field"><span>$ 折讓</span><input type="number" id="splitAllow" data-action="calc-split-total"></label>
            </div>
            <div class="checkout-total">
              <div class="total-label">應收</div>
              <div class="total-amount" id="payTotal">$0</div>
            </div>
          </div>
        </div>
      </div>
      <div class="modal-actions">
        <button class="btn-effect cancel" data-action="close-checkout-modal">取消</button>
        <button class="btn-effect confirm-success" data-action="confirm-payment">確認收款</button>
      </div>
    </div>
  </div>

  <div id="reprintSelectionModal" class="modal">
    <div class="modal-content modal-sheet modal-sheet-compact modal-scroll-frame reprint-modal">
      <div class="modal-header"><h2>補印選擇</h2></div>
      <div class="modal-body modal-list-body">
        <label class="reprint-select-all"><input type="checkbox" id="toggleAllReprint" data-action="toggle-all-reprint"> 全選</label>
        <div id="reprintSelectionList" class="reprint-list"></div>
      </div>
      <div class="modal-actions">
        <button class="btn-effect cancel" data-action="close-reprint-modal">取消</button>
        <button class="btn-effect confirm-success" data-action="confirm-reprint-selection">補印</button>
      </div>
    </div>
  </div>

  <div id="staffDiscountModal" class="modal">
    <div class="modal-content modal-sheet modal-sheet-compact">
      <h2>整單折數</h2>
      <div class="payment-info">
        <div class="pay-row"><span>原價</span><span id="staffDiscountOriginal">$0</span></div>
        <div class="pay-row">
          <span>折數 (%)</span>
          <div class="discount-input-inline">
            <input type="number" id="staffDiscountInput" min="1" max="100" data-action="preview-staff-discount">
            <span class="discount-percent">%</span>
          </div>
        </div>
        <p id="staffDiscountPreview" class="discount-preview"></p>
      </div>
      <div class="modal-actions">
        <button class="btn-effect cancel" data-action="close-staff-discount-modal">取消</button>
        <button class="btn-effect floating-clear-btn" data-action="reset-staff-discount">清除折扣</button>
        <button class="btn-effect confirm-primary" data-action="confirm-staff-discount">套用</button>
      </div>
    </div>
  </div>

  <div id="qrCodeModal" class="modal">
    <div class="modal-content">
      <div class="modal-header"><h2>客人點餐 QR Code</h2></div>
      <div class="modal-body">
        <h3 id="qrTableTitle"></h3>
        <div id="qrcode"></div>
      </div>
      <div class="modal-actions">
        <button class="btn-effect cancel" data-action="close-qr-modal">關閉</button>
      </div>
    </div>
  </div>

  <div id="pendingBatchOverlay" class="pending-overlay">
    <div class="pending-overlay-card">
      <div class="pending-overlay-head">
        <div>
          <h2>顧客待接單</h2>
          <p class="panel-subtitle" id="pendingOverlayTitle"></p>
        </div>
      </div>
      <div id="pendingOverlayList" class="pending-overlay-list"></div>
      <div class="pending-overlay-actions">
        <button class="btn-effect cancel" data-action="reject-pending-batch">拒絕</button>
        <button class="btn-effect confirm-success" data-action="accept-pending-batch">接單</button>
      </div>
    </div>
  </div>

  <div id="revenueDetailModal" class="modal">
    <div class="modal-content modal-sheet modal-sheet-compact modal-scroll-frame">
      <div class="modal-header"><h2 id="revenueDetailTitle">品項明細</h2></div>
      <div class="modal-body modal-list-body detail-list" id="revenueDetailList"></div>
      <div class="modal-actions">
        <button class="btn-effect cancel" data-action="close-revenue-modal">關閉</button>
      </div>
    </div>
  </div>
`
