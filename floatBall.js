import { state, debounce, extension_settings, saveSettingsDebounced } from './index.js';

export const FloatBall = {
    ball: null,
    panel: null,
    isDragging: false,
    isClick: false,
    startPos: { x: 0, y: 0 },
    offset: { x: 0, y: 0 },
    minMoveDistance: 5,
    boundHandlers: {},

    init() {
        this.ball = document.getElementById("novel-writer-float-ball");
        this.panel = document.getElementById("novel-writer-panel");
        
        if (!this.ball) {
            console.error(`[${state.extensionName}] 悬浮球元素未找到`);
            toastr.error("小说续写插件加载失败：悬浮球元素未找到", "插件错误");
            return;
        }
        if (!this.panel) {
            console.error(`[${state.extensionName}] 面板元素未找到`);
            toastr.error("小说续写插件加载失败：面板元素未找到", "插件错误");
            return;
        }

        this.boundHandlers = {
            startDrag: this.startDrag.bind(this),
            onDrag: this.onDrag.bind(this),
            stopDrag: this.stopDrag.bind(this),
            onBallClick: this.onBallClick.bind(this),
            onPanelClose: this.onPanelClose.bind(this),
            onTabSwitch: this.onTabSwitch.bind(this),
            onOutsideClose: this.onOutsideClose.bind(this),
            resizeHandler: debounce(this.autoAdsorbEdge.bind(this), 200)
        };

        this.clearEvents();
        this.bindEvents();
        this.restoreState();
        this.autoAdsorbEdge();

        // 强制显示，ST环境下避免被样式覆盖
        this.ball.style.cssText += `
            visibility: visible !important;
            opacity: 1 !important;
            display: flex !important;
            pointer-events: all !important;
            z-index: 1000001 !important;
            touch-action: none !important;
            position: fixed !important;
        `;
        console.log(`[${state.extensionName}] 悬浮球初始化完成`);
    },

    clearEvents() {
        this.ball?.removeEventListener("mousedown", this.boundHandlers.startDrag);
        document.removeEventListener("mousemove", this.boundHandlers.onDrag);
        document.removeEventListener("mouseup", this.boundHandlers.stopDrag);
        this.ball?.removeEventListener("click", this.boundHandlers.onBallClick);

        this.ball?.removeEventListener("touchstart", this.boundHandlers.startDrag);
        document.removeEventListener("touchmove", this.boundHandlers.onDrag);
        document.removeEventListener("touchend", this.boundHandlers.stopDrag);

        document.getElementById("panel-close-btn")?.removeEventListener("click", this.boundHandlers.onPanelClose);
        document.querySelectorAll(".panel-tab-item").forEach(tab => {
            tab.removeEventListener("click", this.boundHandlers.onTabSwitch);
        });
        document.removeEventListener("click", this.boundHandlers.onOutsideClose);
        window.removeEventListener("resize", this.boundHandlers.resizeHandler);
    },

    bindEvents() {
        // 拖拽事件
        this.ball.addEventListener("mousedown", this.boundHandlers.startDrag);
        document.addEventListener("mousemove", this.boundHandlers.onDrag);
        document.addEventListener("mouseup", this.boundHandlers.stopDrag);
        // 点击事件（单独绑定，彻底阻断冒泡）
        this.ball.addEventListener("click", this.boundHandlers.onBallClick);

        // 触屏事件
        this.ball.addEventListener("touchstart", this.boundHandlers.startDrag, { passive: false });
        document.addEventListener("touchmove", this.boundHandlers.onDrag, { passive: false });
        document.addEventListener("touchend", this.boundHandlers.stopDrag);

        // 面板控制
        document.getElementById("panel-close-btn")?.addEventListener("click", this.boundHandlers.onPanelClose);
        document.querySelectorAll(".panel-tab-item").forEach(tab => {
            tab.addEventListener("click", this.boundHandlers.onTabSwitch);
        });
        document.addEventListener("click", this.boundHandlers.onOutsideClose);
        window.addEventListener("resize", this.boundHandlers.resizeHandler);
    },

    startDrag(e) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation(); // 彻底阻断ST全局事件
        this.isDragging = false;
        this.isClick = true;
        this.ball.classList.add("dragging");

        const clientX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
        const clientY = e.type.includes('touch') ? e.touches[0].clientY : e.clientY;
        const rect = this.ball.getBoundingClientRect();

        this.startPos.x = clientX;
        this.startPos.y = clientY;
        this.offset.x = clientX - rect.left;
        this.offset.y = clientY - rect.top;
    },

    onDrag(e) {
        if (!this.ball.classList.contains("dragging")) return;

        const clientX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
        const clientY = e.type.includes('touch') ? e.touches[0].clientY : e.clientY;

        const moveX = Math.abs(clientX - this.startPos.x);
        const moveY = Math.abs(clientY - this.startPos.y);
        if (moveX > this.minMoveDistance || moveY > this.minMoveDistance) {
            this.isClick = false;
            this.isDragging = true;
        }

        if (!this.isDragging) return;

        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();

        // 安全边界计算
        let x = clientX - this.offset.x;
        let y = clientY - this.offset.y;
        const maxX = window.innerWidth - this.ball.offsetWidth;
        const maxY = window.innerHeight - this.ball.offsetHeight;
        x = Math.max(10, Math.min(x, maxX - 10));
        y = Math.max(10, Math.min(y, maxY - 10));

        // 更新位置，彻底清除transform
        this.ball.style.left = `${x}px`;
        this.ball.style.top = `${y}px`;
        this.ball.style.right = 'auto';
        this.ball.style.transform = 'none';
    },

    stopDrag(e) {
        if (!this.ball.classList.contains("dragging")) return;
        this.ball.classList.remove("dragging");

        if (this.isDragging) {
            this.autoAdsorbEdge();
            const rect = this.ball.getBoundingClientRect();
            extension_settings[state.extensionName].floatBallState.position = { x: rect.left, y: rect.top };
            saveSettingsDebounced();
        }

        requestAnimationFrame(() => {
            this.isDragging = false;
            this.isClick = false;
        });
    },

    onBallClick(e) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation(); // 彻底阻断ST全局事件，解决面板闪关

        if (this.isDragging) return;
        this.togglePanel();
    },

    onOutsideClose(e) {
        const isInPanel = e.target.closest("#novel-writer-panel");
        const isInBall = e.target.closest("#novel-writer-float-ball");
        if (!isInPanel && !isInBall && this.panel.classList.contains("show")) {
            this.hidePanel();
        }
    },

    onPanelClose(e) {
        e.stopPropagation();
        this.hidePanel();
    },

    onTabSwitch(e) {
        e.stopPropagation();
        const tabId = e.currentTarget.dataset.tab;
        this.switchTab(tabId);
    },

    autoAdsorbEdge() {
        const rect = this.ball.getBoundingClientRect();
        const windowWidth = window.innerWidth;
        const centerX = windowWidth / 2;

        const targetLeft = rect.left < centerX ? 10 : windowWidth - this.ball.offsetWidth - 10;
        const maxY = window.innerHeight - this.ball.offsetHeight;
        const safeTop = Math.max(10, Math.min(rect.top, maxY - 10));

        this.ball.style.left = `${targetLeft}px`;
        this.ball.style.top = `${safeTop}px`;
        this.ball.style.right = 'auto';
        this.ball.style.transform = 'none';

        const newRect = this.ball.getBoundingClientRect();
        extension_settings[state.extensionName].floatBallState.position = { x: newRect.left, y: newRect.top };
        saveSettingsDebounced();
    },

    togglePanel() {
        this.panel.classList.contains("show") ? this.hidePanel() : this.showPanel();
    },

    showPanel() {
        this.panel.style.display = "flex";
        this.panel.style.opacity = "0";
        this.panel.style.zIndex = "1000000"; // 确保在ST原生UI之上
        this.panel.style.transform = "translate(-50%, -50%) scale(0.8)";
        
        requestAnimationFrame(() => {
            this.panel.classList.add("show");
            this.panel.style.opacity = "1";
            this.panel.style.transform = "translate(-50%, -50%) scale(1)";
            extension_settings[state.extensionName].floatBallState.isPanelOpen = true;
            saveSettingsDebounced();
        });
    },

    hidePanel() {
        this.panel.classList.remove("show");
        this.panel.style.opacity = "0";
        this.panel.style.transform = "translate(-50%, -50%) scale(0.8)";
        
        setTimeout(() => {
            if (!this.panel.classList.contains("show")) {
                this.panel.style.display = "none";
            }
        }, 300);
        
        extension_settings[state.extensionName].floatBallState.isPanelOpen = false;
        saveSettingsDebounced();
    },

    switchTab(tabId) {
        document.querySelectorAll(".panel-tab-item").forEach(tab => {
            tab.classList.toggle("active", tab.dataset.tab === tabId);
        });
        document.querySelectorAll(".panel-tab-panel").forEach(panel => {
            panel.classList.toggle("active", panel.id === tabId);
        });
        extension_settings[state.extensionName].floatBallState.activeTab = tabId;
        saveSettingsDebounced();
    },

    restoreState() {
        const stateSettings = extension_settings[state.extensionName].floatBallState || state.defaultSettings.floatBallState;
        const maxX = window.innerWidth - this.ball.offsetWidth;
        const maxY = window.innerHeight - this.ball.offsetHeight;
        const safeX = Math.max(10, Math.min(stateSettings.position.x, maxX - 10));
        const safeY = Math.max(10, Math.min(stateSettings.position.y, maxY - 10));

        this.ball.style.left = `${safeX}px`;
        this.ball.style.top = `${safeY}px`;
        this.ball.style.right = "auto";
        this.ball.style.transform = "none";

        this.switchTab(stateSettings.activeTab);
        if (stateSettings.isPanelOpen) this.showPanel();
    }
};
