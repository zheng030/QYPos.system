export const appShellHtml = `
    <div id="receipt-print-area" class="print-area-hidden"></div>

    <div id="toast-container"></div>

    <div id="login-screen">
        <div class="login-box">
            <h1>🔐 系統登入</h1>
            <p>請輸入員工密碼</p>
            <input type="password" id="loginPass" placeholder="密碼" data-action="login-password">
            <button class="btn-effect" data-action="check-login">進入系統</button>
            <p id="loginError" class="login-error-msg">❌ 密碼錯誤</p>
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

            <div class="menu-btn" data-action="open-owner-login" data-mode="cost">
                <span class="menu-icon">🤫</span>
                <span>機密 (輸入成本)</span>
            </div>
            <div class="menu-btn" data-action="open-owner-login" data-mode="finance">
                <span class="menu-icon">🔐</span>
                <span>權限 (財務/詳單)</span>
            </div>
            <div class="menu-btn" data-action="open-settings-page">
                <span class="menu-icon">🛠️</span>
                <span>系統設定</span>
            </div>

            <div class="menu-btn" data-action="open-product-page">
                <span class="menu-icon">📦</span>
                <span>商品上架(庫存)</span>
            </div>
            <div class="menu-btn" data-action="open-item-stats-page">
                <span class="menu-icon">📈</span>
                <span>歷史銷量</span>
            </div>
            <div class="menu-btn">
                <span class="menu-icon">🔍</span>
                <span>商品搜尋</span>
            </div>

            <div class="menu-btn menu-btn-disabled">
                <span class="menu-icon">✨</span>
                <span>(預留功能)</span>
            </div>
            <div class="menu-btn menu-btn-disabled">
                <span class="menu-icon">✨</span>
                <span>(預留功能)</span>
            </div>
        </div>

        <div id="tableSelect">
            <div class="header-row">
                <button class="back btn-effect" data-action="go-home">⬅ 返回主畫面</button>
                <button class="btn-effect qr-code-btn" data-action="toggle-qr-mode">
                    📲 顯示 QR Code
                </button>
                <div id="systemTime">載入中...</div>
            </div>
            <div class="title">請選擇座位</div>
            <div id="tableSelectGrid"></div>
        </div>

        <div id="orderPage">
            <div class="order-header">
                <button class="back btn-effect" data-action="save-and-exit">⬅ 取消 / 返回</button>
                <div class="title-group">
                    <span class="title title-compact">🛒 點餐中 <span id="seatLabel"></span></span>
                    <div id="seatTimer"></div>
                </div>
            </div>

            <div class="customer-input-box">
                <input type="text" id="custName" placeholder="輸入客人姓名">
                <input type="tel" id="custPhone" placeholder="輸入電話號碼">
            </div>

            <div id="menuGrid"></div>

            <div id="cart-container">
                <div class="cart-header-row">
                    <h2 class="cart-header-title">🧾 訂單明細</h2>
                    <button class="btn-effect view-toggle-btn-small" data-action="toggle-cart-view">
                        👁️ 切換視圖
                    </button>
                </div>

                <div id="cart-list"></div>

                <div class="summary-section">
                    <div class="summary-controls">
                        <button id="svcBtn" class="control-btn btn-effect" data-action="toggle-service-fee">
                            ◻️ 收 10% 服務費
                        </button>
                        <button class="control-btn btn-effect" data-action="open-discount-modal">
                            % 設定折扣
                        </button>
                    </div>

                    <div class="total-display">
                        <p id="total">總金額：0 元</p>
                    </div>
                </div>

                <div class="action-buttons-compact">
                    <button class="action-btn save-btn btn-effect" data-action="save-order-manual">📝 暫存</button>
                    <button class="action-btn reprint-btn btn-effect" data-action="open-reprint-modal">🖨 補單</button>
                    <button class="action-btn checkout-btn btn-effect" data-action="open-payment-modal">💰 全結</button>
                    <button class="action-btn split-btn btn-effect" data-action="open-split-checkout">✂ 拆單</button>
                </div>
            </div>
        </div>

        <div id="historyPage">
            <button class="back btn-effect" data-action="go-home">⬅ 返回主畫面</button>
            <div class="title">📋 今日訂單列表</div>
            <div class="history-header-row">
                <span>序號</span><span>桌號</span><span>客人資訊</span><span>時間</span><span>金額</span>
            </div>
            <div id="history-box"></div>
            <button class="end-business-btn btn-effect" data-action="close-business">🛑 結束營業 (日結)</button>
        </div>

        <div id="pastHistoryPage" style="display:none;">
            <button class="back btn-effect" data-action="go-home">⬅ 返回主畫面</button>
            <div class="title">📜 歷史銷售統計 (月報)</div>
            <div class="calendar-wrapper" style="margin-bottom: 20px;">
                <div class="calendar-header d-flex justify-between items-center" style="padding: 0 20px;">
                    <button class="btn-effect nav-circle-btn" data-action="change-stats-month" data-offset="-1">◀</button>
                    <h2 id="statsMonthTitle" class="m-0"></h2>
                    <button class="btn-effect nav-circle-btn" data-action="change-stats-month" data-offset="1">▶</button>
                </div>
            </div>
            <div class="stats-body">
                <div class="stats-column">
                    <h3>🍺 酒吧部銷量</h3>
                    <div class="stats-header-row"><span>品項</span><span>數量</span></div>
                    <div id="publicStatsBar"></div>
                </div>
                <div class="stats-column">
                    <h3>🍖 燒烤部銷量</h3>
                    <div class="stats-header-row"><span>品項</span><span>數量</span></div>
                    <div id="publicStatsBbq"></div>
                </div>
            </div>
        </div>

        <div id="reportPage">
            <button class="back btn-effect" data-action="go-home">⬅ 返回主畫面</button>
            <div class="title">📊 營業報表</div>

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
                        <div class="card-icon">💰</div>
                        <h3 id="rptTitle">今日營業額</h3>
                        <p id="rptTotal">$0</p>
                        <small id="rptCount">總單數: 0</small>
                    </div>
                    <div class="stat-card bar-gradient">
                        <div class="card-icon">🍺</div>
                        <h3>酒吧部營收</h3>
                        <p id="rptBar">$0</p>
                        <small>調酒/純飲/啤酒/飲料</small>
                    </div>
                    <div class="stat-card bbq-gradient">
                        <div class="card-icon">🍖</div>
                        <h3>燒烤部營收</h3>
                        <p id="rptBBQ">$0</p>
                        <small>燒烤/主餐/炸物</small>
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
            <div class="stats-note">* 統計時間以「營業日」計算 (凌晨5點前算前一日)</div>
        </div>

        <div id="confidentialPage">
            <button class="back btn-effect" data-action="go-home">⬅ 返回主畫面</button>
            <div class="title">🤫 <span id="ownerWelcome"></span> <span id="confidentialTitle"></span></div>
            <div id="financeDashboard" class="finance-container" style="display:none;"></div>
            <div id="financeCalendarSection" style="display:none;">
                <div class="calendar-header d-flex justify-between items-center mb-15" style="padding: 0 10px;">
                    <button class="btn-effect nav-circle-btn" data-action="change-owner-month" data-offset="-1">◀</button>
                    <h2 id="finCalendarTitle" class="m-0 text-22"></h2>
                    <button class="btn-effect nav-circle-btn" data-action="change-owner-month" data-offset="1">▶</button>
                </div>
                <div class="finance-layout">
                    <div class="calendar-container-left">
                        <div class="calendar-grid-header">
                            <span>日</span><span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span>
                        </div>
                        <div id="finCalendarGrid" class="calendar-grid"></div>
                        <div
                            style="text-align:center; color:#007bff; font-size:14px; margin-top:10px; font-weight:bold;">
                            (💡 點擊日期可查看當日詳細訂單)</div>
                    </div>
                    <div class="finance-summary-sidebar">
                        <div class="finance-controls">
                            <button id="finBtnDay" class="btn-effect" data-action="update-finance-stats" data-range="day">今日</button>
                            <button id="finBtnWeek" class="btn-effect" data-action="update-finance-stats" data-range="week">本周</button>
                            <button id="finBtnMonth" class="btn-effect active" data-action="update-finance-stats" data-range="month">當月</button>
                            <button id="finBtnCustom" class="btn-effect" data-action="update-finance-stats" data-range="custom">日期區間</button>
                            <button id="finBtnSpecific" class="btn-effect" data-action="update-finance-stats" data-range="specific"
                                style="display:none;"></button>
                        </div>
                        <div id="customFinanceDateRange" class="segment-control-container"
                            style="display:none; width: auto; padding: 8px 20px; animation: fadeIn 0.3s ease; align-items: center;">
                            <input type="date" id="financeStartDate" data-action="finance-date-range"
                                style="border:none; background:transparent; font-size:15px; color:#475569; font-weight:bold; font-family:inherit;">
                            <span style="margin: 0 10px; color: #a1a9b3;">～</span>
                            <input type="date" id="financeEndDate" data-action="finance-date-range"
                                style="border:none; background:transparent; font-size:15px; color:#475569; font-weight:bold; font-family:inherit;">
                        </div>
                        <div class="summary-card total-theme">
                            <h3 id="financeTitle">🏠 全店總計 (本月)</h3>
                            <div class="sum-row"><span>總營收</span><span id="monthTotalRev">$0</span></div>
                            <div class="sum-row"><span>總成本</span><span id="monthTotalCost" class="cost-text">$0</span></div>
                            <hr>
                            <div class="sum-row grand-total"><span>淨利</span><span id="monthNetProfit">$0</span></div>
                        </div>

                        <div class="summary-card bar-theme">
                            <h3>🍺 酒吧部</h3>
                            <div class="sum-row"><span>營收</span><span id="barRevenue">$0</span></div>
                            <div class="sum-row"><span>成本</span><span id="barCost" class="cost-text">$0</span></div>
                            <hr>
                            <div class="sum-row grand-total"><span>淨利</span><span id="barNet">$0</span></div>
                            <button class="btn-effect detail-btn" data-action="open-revenue-modal" data-type="bar">查看酒吧營收細節</button>
                        </div>

                        <div class="summary-card bbq-theme">
                            <h3>🍖 燒烤部</h3>
                            <div class="sum-row"><span>營收</span><span id="bbqRevenue">$0</span></div>
                            <div class="sum-row"><span>成本</span><span id="bbqCost" class="cost-text">$0</span></div>
                            <hr>
                            <div class="sum-row grand-total"><span>淨利</span><span id="bbqNet">$0</span></div>
                            <button class="btn-effect detail-btn" data-action="open-revenue-modal" data-type="bbq">查看燒烤營收細節</button>
                        </div>

                        <div class="summary-card unknown-theme">
                            <h3>📦 其他/未知類別</h3>
                            <div class="sum-row"><span>營收</span><span id="unknownRevenue">$0</span></div>
                            <div class="sum-row"><span>成本</span><span id="unknownCost" class="cost-text">$0</span></div>
                            <hr>
                            <div class="sum-row grand-total"><span>淨利</span><span id="unknownNet">$0</span></div>
                            <button class="btn-effect detail-btn" data-action="open-revenue-modal" data-type="unknown">查看其他營收細節</button>
                        </div>

                        <div class="summary-card extra-theme">
                            <h3>✨ 額外收入 / 折讓</h3>
                            <div class="sum-row"><span>金額</span><span id="extraRevenue">$0</span></div>
                            <button class="btn-effect detail-btn" data-action="open-revenue-modal" data-type="extra">查看額外收入細節</button>
                        </div>
                    </div>
                </div>
            </div>

            <div id="costInputSection" style="display:none;">
                <div id="costEditorList"></div>
            </div>

            <div id="ownerOrderListSection" style="display:none;">
                <div id="ownerOrderList"></div>
            </div>
        </div>

        <div id="settingsPage">
            <button class="back btn-effect" data-action="go-home">⬅ 返回主畫面</button>
            <div class="title">⚙️ 系統設定</div>
            <div class="settings-panel">
                <h3>👑 老闆密碼管理</h3>
                <div class="settings-row">
                    <button class="btn-effect owner-btn btn-owner-blue" data-action="open-change-password-modal" data-owner="景偉">👨‍💼 修改 景偉 密碼</button>
                    <button class="btn-effect owner-btn btn-owner-pink" data-action="open-change-password-modal" data-owner="小飛">🍸 修改 小飛 密碼</button>
                    <button class="btn-effect owner-btn btn-owner-orange" data-action="open-change-password-modal" data-owner="威志">🍖 修改 威志 密碼</button>
                </div>

                <h3>🛠️ 系統資料與維護</h3>
                <div class="settings-row">
                    <button class="btn-effect danger-btn-blue" data-action="download-sync-log">🔧 臨時操作紀錄</button>
                    <button class="btn-effect danger-btn-blue" data-action="download-local-storage">💾 本地資料庫</button>
                </div>
                <div class="settings-row">
                    <button class="btn-effect danger-btn-blue" data-action="fix-all-order-ids">🔄 一鍵重整單號</button>
                    <button class="btn-effect danger-btn-red" data-action="clear-all-data" style="display: none;">🗑️ 清空所有資料</button>
                </div>
            </div>
        </div>

        <div id="productPage">
            <button class="back btn-effect" data-action="go-home">⬅ 返回主畫面</button>
            <div class="title">📦 商品庫存管理 (上架/下架)</div>
            <div class="product-mgmt-box">
                <p class="product-mgmt-desc">點擊類別展開，切換開關可設定商品狀態。關閉後前台與客人端將顯示售完。</p>
                <div id="productManagementList"></div>
            </div>
        </div>

        <div id="itemStatsPage">
            <button class="back btn-effect" data-action="go-home">⬅ 返回主畫面</button>
            <div class="title">📈 商品銷售統計</div>

            <div class="segment-control-wrapper" style="flex-direction: column; align-items: center;">
                <div class="segment-control-container" style="width: 420px;">
                    <div class="segment-highlighter" id="statsHighlighter"></div>
                    <div class="segment-option active" id="statBtnDay" data-action="render-item-stats" data-range="day">今日</div>
                    <div class="segment-option" id="statBtnWeek" data-action="render-item-stats" data-range="week">本周</div>
                    <div class="segment-option" id="statBtnMonth" data-action="render-item-stats" data-range="month">當月</div>
                    <div class="segment-option" id="statBtnCustom" data-action="render-item-stats" data-range="custom">特定日期</div>
                </div>

                <div id="customStatsDateRange" class="segment-control-container"
                    style="display:none; width: auto; margin-top: 15px; padding: 8px 20px; animation: fadeIn 0.3s ease; align-items: center;">
                    <input type="date" id="statsStartDate" data-action="stats-date-range"
                        style="border:none; background:transparent; font-size:15px; color:#475569; font-weight:bold; font-family:inherit;">
                    <span style="margin: 0 10px; color: #a1a9b3;">～</span>
                    <input type="date" id="statsEndDate" data-action="stats-date-range"
                        style="border:none; background:transparent; font-size:15px; color:#475569; font-weight:bold; font-family:inherit;">
                </div>
            </div>

            <div class="stats-page-grid">
                <div class="stats-card-container">
                    <div class="stats-card-header bar">🍺 酒吧部</div>
                    <div id="statsListBar" class="stats-list-content"></div>
                </div>
                <div class="stats-card-container">
                    <div class="stats-card-header bbq">🍖 燒烤部</div>
                    <div id="statsListBbq" class="stats-list-content"></div>
                </div>
            </div>
        </div>
    </div>

    <div id="summaryModal" class="modal">
        <div class="modal-content">
            <h2>📅 本日營業結算</h2>
            <div class="summary-item"><span>📦 總訂單數</span><span id="sumCount">0 單</span></div>
            <div class="summary-item"><span>💰 營業總額</span><span id="sumTotal" class="text-danger">$0</span></div>
            <hr>
            <p class="text-muted text-14">確認後將完成日結，資料會自動寫入報表。</p>
            <div class="modal-actions">
                <button class="btn-effect cancel" data-action="close-summary-modal">取消</button>
                <button class="btn-effect confirm-success" data-action="confirm-clear-data">✅ 確認日結</button>
            </div>
        </div>
    </div>

    <div id="paymentModal" class="modal">
        <div class="modal-content">
            <h2>💰 結帳確認</h2>
            <div class="payment-info">
                <div class="pay-row"><span>應收金額 <small id="payDiscLabel" class="pay-row-label"></small>：</span><span
                        id="payOriginal" class="font-bold">$0</span></div>
                <div class="pay-row"><span>$ 折讓/抹零：</span><input type="number" id="payAllowance" value=""
                        data-action="calc-final-pay" placeholder="輸入金額" class="modal-input big-input text-danger"></div>
                <hr>
                <div class="pay-row large"><span>實收金額：</span><input type="number" id="payFinal"
                        class="modal-input big-input text-danger font-bold"></div>
            </div>
            <div class="modal-actions">
                <button class="btn-effect cancel" data-action="close-payment-modal">取消</button>
                <button class="btn-effect confirm-success" data-action="confirm-checkout">✅ 確認收款</button>
            </div>
        </div>
    </div>

    <div id="checkoutModal" class="modal">
        <div class="modal-content split-modal">
            <div class="modal-header">
                <div class="pill-badge">✂</div>
                <h2>拆單結帳</h2>
                <p class="subtext">點擊左側品項移至右側，完成本次結帳</p>
            </div>
            <div class="modal-body">
                <div class="split-checkout-container">
                    <div class="checkout-box">
                        <div class="box-header">
                            <div class="icon-chip">📦</div>
                            <div>
                                <div class="box-title">未結帳品項</div>
                                <small>點擊即可移動到右側</small>
                            </div>
                        </div>
                        <div id="unpaidList" class="checkout-list modern-list"></div>
                    </div>
                    <div class="split-arrow">⇄</div>
                    <div class="checkout-box emphasis">
                        <div class="box-header">
                            <div class="icon-chip accent">💳</div>
                            <div>
                                <div class="box-title">本次結帳</div>
                                <small>已選品項會顯示於此</small>
                            </div>
                        </div>
                        <div id="payingList" class="checkout-list modern-list"></div>
                        <div class="split-options">
                            <label class="field">
                                <span>% 折扣</span>
                                <input type="number" id="splitDisc" placeholder="輸入折扣" data-action="calc-split-total">
                            </label>
                            <label class="field">
                                <span>$ 折讓</span>
                                <input type="number" id="splitAllow" placeholder="輸入折讓" data-action="calc-split-total">
                            </label>
                        </div>
                        <div class="checkout-total">
                            <div class="total-label">應收</div>
                            <div class="total-amount" id="payTotal">$0</div>
                        </div>
                    </div>
                </div>
            </div>
            <div class="modal-actions stacked">
                <button class="btn-effect cancel ghost" data-action="close-checkout-modal">取消</button>
                <button class="btn-effect confirm-success wide" data-action="confirm-payment">✅ 確認結帳</button>
            </div>
        </div>
    </div>

    <div id="reprintSelectionModal" class="modal">
        <div class="modal-content reprint-modal">
            <div class="modal-header">
                <div class="pill-badge purple">🖨</div>
                <h2>補單列印</h2>
                <p class="subtext">勾選要列印的品項，可一鍵全選</p>
            </div>
            <div class="modal-body reprint-body">
                <div id="reprintList" class="reprint-list"></div>
            </div>
            <div class="modal-actions stacked">
                <button class="btn-effect cancel ghost" data-action="close-reprint-modal">取消</button>
                <button class="btn-effect confirm-primary wide" data-action="confirm-reprint-selection">🖨 確認列印</button>
            </div>
        </div>
    </div>

    <div id="ownerLoginModal" class="modal">
        <div class="modal-content modal-content-owner">
            <div class="modal-header border-none pb-10">
                <h2 class="text-28 text-dark">🔐 請選擇身分</h2>
                <p class="text-muted text-14 mt-5">請點擊您的帳號並輸入密碼</p>
            </div>
            <div class="modal-body pt-20">
                <div class="owner-buttons d-flex flex-column gap-15">
                    <button class="btn-effect owner-btn owner-login-btn btn-owner-blue" data-action="check-owner" data-owner="景偉">
                        <span class="text-24">👨‍💼</span> 景偉 (總管)
                    </button>
                    <button class="btn-effect owner-btn owner-login-btn btn-owner-pink" data-action="check-owner" data-owner="小飛">
                        <span class="text-24">🍸</span> 小飛 (酒吧)
                    </button>
                    <button class="btn-effect owner-btn owner-login-btn btn-owner-orange" data-action="check-owner" data-owner="威志">
                        <span class="text-24">🍖</span> 威志 (燒烤)
                    </button>
                </div>
            </div>
            <button class="btn-effect mt-20 wide btn-ghost-universal" data-action="close-owner-modal">取消</button>
        </div>
    </div>

    <div id="changePasswordModal" class="modal">
        <div class="modal-content">
            <h2>🔑 修改密碼 - <span id="pwdOwnerName"></span></h2>
            <div class="pwd-input-container">
                <input type="password" id="oldPwd" placeholder="輸入舊密碼" class="pwd-input modal-input">
                <input type="password" id="newPwd" placeholder="輸入新密碼" class="pwd-input modal-input">
                <input type="password" id="confirmPwd" placeholder="再次確認新密碼" class="pwd-input modal-input">
            </div>
            <div class="modal-actions">
                <button class="btn-effect cancel" data-action="close-change-password-modal">取消</button>
                <button class="btn-effect confirm-primary" data-action="confirm-change-password">✅ 確認修改</button>
            </div>
        </div>
    </div>

    <div id="discountModal" class="modal">
        <div class="modal-content">
            <div class="modal-header">
                <h2>% 折扣設定</h2>
            </div>
            <div class="modal-body text-center p-30-0">
                <div class="d-flex justify-center items-center gap-10 mb-15">
                    <input type="number" id="discInput" placeholder="輸入折扣額度"
                        class="modal-input big-input w-200 text-center" data-action="discount-preview">
                    <span class="discount-percent">%</span>
                </div>
                <p id="discPreviewText" class="discount-preview"></p>
            </div>
            <div class="modal-actions">
                <button class="btn-effect cancel" data-action="close-discount-modal">取消</button>
                <button class="btn-effect confirm-warning" data-action="confirm-discount">確定</button>
            </div>
        </div>
    </div>

    <div id="allowanceModal" class="modal">
        <div class="modal-content">
            <div class="modal-header">
                <h2>$ 金額折讓</h2>
            </div>
            <div class="modal-body text-center p-30-0">
                <p class="text-18 text-muted mb-15">選擇折讓金額</p>
                <div class="d-flex justify-center items-center gap-10">
                    <span class="allowance-symbol">- $</span>
                    <input type="number" id="allowInput" placeholder="輸入金額"
                        class="modal-input big-input w-160 text-center">
                </div>
            </div>
            <div class="modal-actions">
                <button class="btn-effect cancel" data-action="close-allowance-modal">取消</button>
                <button class="btn-effect confirm-primary" data-action="confirm-allowance">確定</button>
            </div>
        </div>
    </div>

    <div id="financeDetailModal" class="modal">
        <div class="modal-content">
            <div class="modal-header">
                <h2 id="fdTitle">📅 財務明細</h2>
            </div>
            <div class="modal-body">
                <div class="fin-detail-card bar-style">
                    <h3>🍺 酒吧部</h3>
                    <div class="fin-row"><span>營收</span><span id="fdBarRev">$0</span></div>
                    <div class="fin-row"><span>成本</span><span id="fdBarCost" class="red-text">$0</span></div>
                    <hr>
                    <div class="fin-row total"><span>毛利</span><span id="fdBarProfit">$0</span></div>
                </div>
                <div class="fin-detail-card bbq-style">
                    <h3>🍖 燒烤部</h3>
                    <div class="fin-row"><span>營收</span><span id="fdBbqRev">$0</span></div>
                    <div class="fin-row"><span>成本</span><span id="fdBbqCost" class="red-text">$0</span></div>
                    <hr>
                    <div class="fin-row total"><span>毛利</span><span id="fdBbqProfit">$0</span></div>
                </div>
                <div class="fin-detail-card total-style">
                    <h3>🏠 全店總計</h3>
                    <div class="fin-row"><span>總營收</span><span id="fdTotalRev">$0</span></div>
                    <div class="fin-row"><span>總成本</span><span id="fdTotalCost" class="red-text">$0</span></div>
                    <hr>
                    <div class="fin-row total large"><span>總淨利</span><span id="fdTotalProfit">$0</span></div>
                </div>
            </div>
            <div class="modal-actions">
                <button class="btn-effect bg-gray" data-action="close-finance-detail-modal">關閉</button>
            </div>
        </div>
    </div>

    <div id="customModal" class="modal">
        <div class="modal-content text-left">
            <div class="modal-header">
                <h2 class="custom-title-wrapper">🍹 <span id="customTitle">隱藏特調</span>客製化</h2>
            </div>
            <div class="modal-body">
                <div class="custom-section">
                    <div class="custom-label">1. 香氣選擇</div>
                    <div class="radio-group">
                        <label class="radio-box"><input type="radio" name="flavor" value="花香調" checked><div class="radio-btn btn-effect">花香調 🌸</div></label>
                        <label class="radio-box"><input type="radio" name="flavor" value="果香調"><div class="radio-btn btn-effect">果香調 🍎</div></label>
                        <label class="radio-box"><input type="radio" name="flavor" value="木質調"><div class="radio-btn btn-effect">木質調 🌲</div></label>
                    </div>
                </div>
                <div class="custom-section">
                    <div class="custom-label">2. 口感偏好</div>
                    <div class="radio-group">
                        <label class="radio-box"><input type="radio" name="taste" value="偏酸" checked><div class="radio-btn btn-effect">偏酸 🍋</div></label>
                        <label class="radio-box"><input type="radio" name="taste" value="偏甜"><div class="radio-btn btn-effect">偏甜 🍯</div></label>
                        <label class="radio-box"><input type="radio" name="taste" value="偏苦"><div class="radio-btn btn-effect">偏苦 ☕</div></label>
                        <label class="radio-box"><input type="radio" name="taste" value="偏鹹"><div class="radio-btn btn-effect">偏鹹 🧂</div></label>
                    </div>
                </div>
                <div id="modalAlcoholSection" class="custom-section">
                    <div class="custom-label">3. 濃度調整 (<span id="alcoholVal">0</span>%)</div>
                    <input type="range" id="alcoholRange" min="0" max="100" step="10" value="0" class="w-100 my-15" data-action="custom-alcohol-range">
                    <div class="flex-between font-12 color-gray mb-10">
                        <span>正常</span><span>加重</span><span>雙倍</span>
                    </div>
                    <button id="extraShotBtn" class="extra-shot-btn btn-effect" data-action="toggle-extra-shot">🍺 濃度升級 (+$40)</button>
                </div>
                <div id="modalNoteSection" class="custom-section" style="display:none;">
                    <div class="custom-label">3. 備註 (選填)</div>
                    <textarea id="customNote" rows="2" placeholder="例如：少冰、不要裝飾..." class="modal-input w-100"></textarea>
                </div>
            </div>
            <div class="modal-actions">
                <button class="btn-effect cancel" data-action="close-custom-modal">取消</button>
                <button class="btn-effect confirm-success" data-action="confirm-custom-item">✅ 確認加入</button>
            </div>
        </div>
    </div>

    <div id="drinkModal" class="modal">
        <div class="modal-content text-left">
            <div class="modal-header">
                <h2 class="custom-title-wrapper">🥤 <span id="drinkTitle">飲料</span>選項</h2>
            </div>
            <div class="modal-body pt-20">
                <div id="simpleTempSection" class="custom-section" style="display:none;">
                    <div class="custom-label">溫度選擇</div>
                    <div class="radio-group">
                        <label class="radio-box"><input type="radio" name="simpleTemp" value="冰" checked><div class="radio-btn btn-effect">🧊 冰</div></label>
                        <label class="radio-box"><input type="radio" name="simpleTemp" value="熱"><div class="radio-btn btn-effect">🔥 熱</div></label>
                    </div>
                </div>
                <div id="advanceTempSection" class="custom-section" style="display:none;">
                    <div class="custom-label">冰塊/溫度</div>
                    <div class="radio-group" style="font-size:14px;">
                        <label class="radio-box"><input type="radio" name="advTemp" value="去冰" checked><div class="radio-btn btn-effect">去冰</div></label>
                        <label class="radio-box"><input type="radio" name="advTemp" value="微冰"><div class="radio-btn btn-effect">微冰</div></label>
                        <label class="radio-box"><input type="radio" name="advTemp" value="少冰"><div class="radio-btn btn-effect">少冰</div></label>
                        <label class="radio-box"><input type="radio" name="advTemp" value="溫"><div class="radio-btn btn-effect">溫</div></label>
                        <label class="radio-box"><input type="radio" name="advTemp" value="熱"><div class="radio-btn btn-effect">熱</div></label>
                    </div>
                </div>
                <div id="sugarSection" class="custom-section" style="display:none;">
                    <div class="custom-label">甜度選擇</div>
                    <div class="radio-group">
                        <label class="radio-box"><input type="radio" name="sugar" value="無糖" checked><div class="radio-btn btn-effect">無糖</div></label>
                        <label class="radio-box"><input type="radio" name="sugar" value="微糖"><div class="radio-btn btn-effect">微糖</div></label>
                        <label class="radio-box"><input type="radio" name="sugar" value="少糖"><div class="radio-btn btn-effect">少糖</div></label>
                        <label class="radio-box"><input type="radio" name="sugar" value="全糖"><div class="radio-btn btn-effect">全糖</div></label>
                    </div>
                </div>
            </div>
            <div class="modal-actions">
                <button class="btn-effect cancel" data-action="close-drink-modal">取消</button>
                <button class="btn-effect confirm-success" data-action="confirm-drink-item">✅ 確認加入</button>
            </div>
        </div>
    </div>

    <div id="foodOptionModal" class="modal">
        <div class="modal-content text-left">
            <div class="modal-header">
                <h2 class="custom-title-wrapper">🍛 <span id="foodTitle">餐點</span>配料</h2>
            </div>
            <div class="modal-body pt-20">
                <div class="custom-section">
                    <div class="custom-label">請選擇配料：</div>
                    <div class="radio-group nowrap" id="meatOptions"></div>
                </div>
            </div>
            <div class="modal-actions">
                <button class="btn-effect cancel" data-action="close-food-modal">取消</button>
                <button class="btn-effect confirm-success" data-action="confirm-food-item">✅ 確認加入</button>
            </div>
        </div>
    </div>

    <div id="qrCodeModal" class="modal">
        <div class="modal-content text-center">
            <div class="modal-header">
                <h2>📲 客人點餐 QR Code</h2>
            </div>
            <div class="d-flex flex-column items-center p-20">
                <h3 id="qrTableTitle" class="text-primary mb-10"></h3>
                <div id="qrcode" class="my-10"></div>
                <p class="text-muted text-14 mt-15">請掃描此條碼即可開始點餐</p>
            </div>
            <div class="modal-actions">
                <button class="btn-effect bg-gray text-white" data-action="close-qr-modal">關閉</button>
            </div>
        </div>
    </div>

    <div id="incomingOrderModal" class="modal">
        <div class="modal-content incoming-order-content">
            <div class="modal-header">
                <h2 class="text-danger">🔔 新的顧客訂單！</h2>
            </div>
            <div class="modal-body text-center">
                <h3 id="incomingTableTitle" class="text-24 mt-10 mb-10"></h3>
                <p class="text-muted">顧客剛剛送出了以下餐點：</p>
                <div id="incomingList" class="incoming-list"></div>
            </div>
            <div class="modal-actions">
                <button class="btn-effect bg-light-gray" data-action="reject-incoming-order">❌ 忽略/拒絕</button>
                <button class="btn-effect bg-danger-btn" data-action="confirm-incoming-order">✅ 確認接單</button>
            </div>
        </div>
    </div>

    <div id="revenueDetailModal" class="modal" style="display:none;">
        <div class="modal-content text-left">
            <div class="modal-header">
                <h2 id="revenueDetailTitle">品項明細</h2>
            </div>
            <div class="modal-body" id="revenueDetailList" style="max-height:50vh; overflow-y:auto;"></div>
            <div class="modal-actions">
                <button class="btn-effect bg-light-gray" data-action="close-revenue-modal">關閉</button>
            </div>
        </div>
    </div>
`
