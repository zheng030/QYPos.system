/* flavor-plugin.js - 口味選項 Plugin (辣度/檸檬汁) */
/*
 * 此 Plugin 為顧客點餐介面新增口味選項功能
 * - 辣度：不辣、小辣、中辣、大辣 (預設：不辣)
 * - 檸檬汁：要、不要 (預設：不要)
 *
 * 設計原則：
 * 1. 最小化修改原始檔案 (僅 index.html 加入 2 行引用)
 * 2. 選項以 global 方式顯示在「品項」與「🧾 訂單明細」中間
 * 3. 選項存入品項名稱，與現有飲料/食物選項模式一致
 */

(function () {
    'use strict';

    console.log("🌶️ Flavor Plugin v1.0 Loaded - 口味選項已載入");

    // ==================== 設定 ====================
    const FLAVOR_CONFIG = {
        spice: {
            label: '🌶️ 辣度',
            options: ['不辣', '小辣', '中辣', '大辣'],
            default: '不辣'
        },
        lemon: {
            label: '🍋 檸檬汁',
            options: ['要', '不要'],
            default: '不要'
        },
        // 只有這些類別才顯示口味選項
        applicableCategories: ['燒烤', '炸物', '主餐']
    };

    // 目前選擇的口味狀態
    let currentFlavor = {
        spice: FLAVOR_CONFIG.spice.default,
        lemon: FLAVOR_CONFIG.lemon.default
    };

    // 目前瀏覽的類別
    let currentCategory = null;

    // ==================== UI 建立 ====================

    /**
     * 建立口味選擇區 HTML
     */
    function createFlavorSelectorHTML() {
        return `
        <div id="flavor-selector-container">
            <div class="flavor-section">
                <div class="flavor-label">
                    <span class="flavor-icon">🌶️</span>
                    <span>辣度選擇</span>
                </div>
                <div class="flavor-options" id="spice-options">
                    ${FLAVOR_CONFIG.spice.options.map(opt =>
            `<button type="button" class="flavor-btn ${opt === currentFlavor.spice ? 'selected spice-selected' : ''}"
                                 data-type="spice" data-value="${opt}">${opt}</button>`
        ).join('')}
                </div>
            </div>
            <div class="flavor-section">
                <div class="flavor-label">
                    <span class="flavor-icon">🍋</span>
                    <span>檸檬汁</span>
                </div>
                <div class="flavor-options" id="lemon-options">
                    ${FLAVOR_CONFIG.lemon.options.map(opt =>
            `<button type="button" class="flavor-btn ${opt === currentFlavor.lemon ? 'selected lemon-selected' : ''}"
                                 data-type="lemon" data-value="${opt}">${opt === '要' ? '要檸檬' : '不要檸檬'}</button>`
        ).join('')}
                </div>
            </div>
        </div>
        `;
    }

    /**
     * 注入口味選擇區到頁面
     */
    function injectFlavorSelector() {
        const menuGrid = document.getElementById('menuGrid');
        const cartContainer = document.getElementById('cart-container');

        if (!menuGrid || !cartContainer) {
            console.warn("Flavor Plugin: 找不到 menuGrid 或 cart-container");
            return;
        }

        // 檢查是否已存在
        let container = document.getElementById('flavor-selector-container');
        if (!container) {
            // 在 menuGrid 與 cart-container 之間插入
            const flavorHTML = createFlavorSelectorHTML();
            cartContainer.insertAdjacentHTML('beforebegin', flavorHTML);
            container = document.getElementById('flavor-selector-container');
            // 綁定事件
            bindFlavorEvents();
            console.log("🌶️ Flavor selector injected");
        }

        // 根據當前類別決定顯示/隱藏
        updateFlavorVisibility();
    }

    /**
     * 更新口味選擇區的顯示狀態
     */
    function updateFlavorVisibility() {
        const container = document.getElementById('flavor-selector-container');
        if (!container) return;

        const shouldShow = currentCategory && FLAVOR_CONFIG.applicableCategories.includes(currentCategory);

        if (shouldShow) {
            container.classList.add('active');
        } else {
            container.classList.remove('active');
        }
    }

    /**
     * 綁定口味按鈕事件
     */
    function bindFlavorEvents() {
        const container = document.getElementById('flavor-selector-container');
        if (!container) return;

        container.addEventListener('click', function (e) {
            const btn = e.target.closest('.flavor-btn');
            if (!btn) return;

            const type = btn.dataset.type;
            const value = btn.dataset.value;

            // 更新選擇狀態
            currentFlavor[type] = value;

            // 更新按鈕樣式
            const optionsContainer = btn.parentElement;
            optionsContainer.querySelectorAll('.flavor-btn').forEach(b => {
                b.classList.remove('selected', 'spice-selected', 'lemon-selected');
            });
            btn.classList.add('selected');
            if (type === 'spice') {
                btn.classList.add('spice-selected');
            } else if (type === 'lemon') {
                btn.classList.add('lemon-selected');
            }

            console.log(`🌶️ Flavor updated: ${type} = ${value}`);
        });
    }

    /**
     * 重置口味選擇為預設值
     */
    function resetFlavorSelection() {
        currentFlavor.spice = FLAVOR_CONFIG.spice.default;
        currentFlavor.lemon = FLAVOR_CONFIG.lemon.default;
        updateFlavorUI();
    }

    /**
     * 更新 UI 顯示
     */
    function updateFlavorUI() {
        const container = document.getElementById('flavor-selector-container');
        if (!container) return;

        // 更新辣度按鈕
        const spiceOptions = container.querySelectorAll('[data-type="spice"]');
        spiceOptions.forEach(btn => {
            const isSelected = btn.dataset.value === currentFlavor.spice;
            btn.classList.toggle('selected', isSelected);
            btn.classList.toggle('spice-selected', isSelected);
        });

        // 更新檸檬汁按鈕
        const lemonOptions = container.querySelectorAll('[data-type="lemon"]');
        lemonOptions.forEach(btn => {
            const isSelected = btn.dataset.value === currentFlavor.lemon;
            btn.classList.toggle('selected', isSelected);
            btn.classList.toggle('lemon-selected', isSelected);
        });
    }

    // ==================== Hook addToCart ====================

    /**
     * 建立口味標記字串
     * 只有非預設值才顯示
     */
    function buildFlavorTag() {
        const tags = [];

        // 辣度：非預設(不辣)才顯示
        if (currentFlavor.spice !== FLAVOR_CONFIG.spice.default) {
            tags.push(`<span class="flavor-tag spice spice-${currentFlavor.spice}">${currentFlavor.spice}</span>`);
        }

        // 檸檬汁：只有「要」才顯示標籤
        if (currentFlavor.lemon !== FLAVOR_CONFIG.lemon.default) {
            tags.push(`<span class="flavor-tag lemon lemon-${currentFlavor.lemon}">要檸檬</span>`);
        }

        return tags.length > 0 ? ' ' + tags.join('') : '';
    }

    /**
     * 包裝原本的 addToCart，加入口味選項
     */
    function wrapAddToCart() {
        if (typeof window.addToCart !== 'function') {
            console.warn("Flavor Plugin: addToCart 函數不存在");
            return;
        }

        const originalAddToCart = window.addToCart;

        window.addToCart = function (name, price) {
            // 檢查當前類別是否適用口味選項
            const flavorContainer = document.getElementById('flavor-selector-container');
            const isApplicable = currentCategory && FLAVOR_CONFIG.applicableCategories.includes(currentCategory);

            if (isApplicable && flavorContainer && flavorContainer.classList.contains('active')) {
                const flavorTag = buildFlavorTag();
                name = name + flavorTag;
            }

            // 呼叫原本的 addToCart
            return originalAddToCart.call(this, name, price);
        };

        console.log("🌶️ addToCart wrapped successfully");
    }

    // ==================== Hook openOrderPageLogic ====================

    /**
     * 包裝 openOrderPageLogic，確保口味選擇區被注入
     */
    function wrapOpenOrderPageLogic() {
        if (typeof window.openOrderPageLogic !== 'function') {
            console.warn("Flavor Plugin: openOrderPageLogic 函數不存在");
            return;
        }

        const originalOpenOrderPage = window.openOrderPageLogic;

        window.openOrderPageLogic = function (table) {
            // 先執行原本邏輯
            const result = originalOpenOrderPage.call(this, table);

            // 注入口味選擇區
            setTimeout(() => {
                injectFlavorSelector();
                resetFlavorSelection();
            }, 50);

            return result;
        };

        console.log("🌶️ openOrderPageLogic wrapped successfully");
    }

    // ==================== Hook buildCategories ====================

    /**
     * 包裝 buildCategories，確保回到分類列表時口味選擇區仍存在
     */
    function wrapBuildCategories() {
        if (typeof window.buildCategories !== 'function') {
            console.warn("Flavor Plugin: buildCategories 函數不存在");
            return;
        }

        const originalBuildCategories = window.buildCategories;

        window.buildCategories = function () {
            // 回到分類列表，清除當前類別
            currentCategory = null;

            // 先執行原本邏輯
            const result = originalBuildCategories.call(this);

            // 確保口味選擇區存在並更新顯示狀態
            setTimeout(() => {
                injectFlavorSelector();
            }, 10);

            return result;
        };

        console.log("🌶️ buildCategories wrapped successfully");
    }

    // ==================== Hook openItems ====================

    /**
     * 包裝 openItems，確保進入品項列表時口味選擇區仍存在
     */
    function wrapOpenItems() {
        if (typeof window.openItems !== 'function') {
            console.warn("Flavor Plugin: openItems 函數不存在");
            return;
        }

        const originalOpenItems = window.openItems;

        window.openItems = function (category) {
            // 記錄當前類別
            currentCategory = category;

            // 先執行原本邏輯
            const result = originalOpenItems.call(this, category);

            // 確保口味選擇區存在並根據類別更新顯示狀態
            setTimeout(() => {
                injectFlavorSelector();
            }, 10);

            return result;
        };

        console.log("🌶️ openItems wrapped successfully");
    }

    // ==================== 初始化 ====================

    function init() {
        console.log("🌶️ Flavor Plugin initializing...");

        // 等待原始函數載入完成
        if (typeof window.addToCart === 'undefined' ||
            typeof window.openOrderPageLogic === 'undefined') {
            console.log("🌶️ Waiting for core functions...");
            setTimeout(init, 100);
            return;
        }

        // 包裝函數
        wrapAddToCart();
        wrapOpenOrderPageLogic();
        wrapBuildCategories();
        wrapOpenItems();

        // 如果頁面已經在點餐頁面，立即注入
        const orderPage = document.getElementById('orderPage');
        if (orderPage && orderPage.style.display !== 'none') {
            injectFlavorSelector();
        }

        console.log("🌶️ Flavor Plugin initialized successfully!");
    }

    // DOM 載入完成後初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        // 延遲執行確保其他腳本已載入
        setTimeout(init, 100);
    }

    // ==================== 暴露 API (供除錯使用) ====================
    window.FlavorPlugin = {
        getCurrentFlavor: () => ({ ...currentFlavor }),
        resetFlavor: resetFlavorSelection,
        config: FLAVOR_CONFIG
    };

})();
