import { debounce } from "./utils.js";
import { extension_settings, extensionName, defaultSettings, saveSettingsDebounced } from "./constants.js";

// 可移动悬浮球核心模块（完整修复版，解决位置错误、面板无法打开问题）
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
            console.error("[小说续写插件] 悬浮球元素未找到，HTML加载失败");
            toastr.error("小说续写插件加载失败：悬浮球元素未找到", "插件错误");
            return;
        }
        if (!this.panel) {
            console.error("[小说续写插件] 面板元素未找到，HTML加载失败");
            toastr.error("小说续写插件加载失败：面板元素未找到", "插件错误");
            return;
        }
        this.boundHandlers = {
            startDrag: this.startDrag.bind(this),
            onDrag: this.onDrag.bind(this),
            stopDrag: this.stopDrag.bind(this),
            hidePanel: this.hidePanel.bind(this),
            switchTab: this.switchTab.bind(this),
            outsideClose: this.outsideClose.bind(this),
            resizeHandler: this.resizeHandler.bind(this)
        };
        console.log("[小说续写插件] 悬浮球初始化成功");
        this.bindEvents();
        requestAnimationFrame(() => {
            this.restoreState();
            this.autoAdsorbEdge();
            this.ball.style.visibility = "visible";
            this.ball.style.opacity = "1";
            this.ball.style.display = "flex";
        });
    },
    bindEvents() {
        this.ball.removeEventListener("mousedown", this.boundHandlers.startDrag);
        document.removeEventListener("mousemove", this.boundHandlers.onDrag);
        document.removeEventListener("mouseup", this.boundHandlers.stopDrag);
        this.ball.removeEventListener("touchstart", this.boundHandlers.startDrag);
        document.removeEventListener("touchmove", this.boundHandlers.onDrag);
        document.removeEventListener("touchend", this.boundHandlers.stopDrag);

        this.ball.addEventListener("mousedown", this.boundHandlers.startDrag);
        document.addEventListener("mousemove", this.boundHandlers.onDrag);
        document.addEventListener("mouseup", this.boundHandlers.stopDrag);
        this.ball.addEventListener("touchstart", this.boundHandlers.startDrag, { passive: false });
        document.addEventListener("touchmove", this.boundHandlers.onDrag, { passive: false });
        document.addEventListener("touchend", this.boundHandlers.stopDrag);

        const closeBtn = document.getElementById("panel-close-btn");
        closeBtn?.removeEventListener("click", this.boundHandlers.hidePanel);
        closeBtn?.addEventListener("click", (e) => {
            e.stopPropagation();
            this.hidePanel();
        });

        document.querySelectorAll(".panel-tab-item").forEach(tab => {
            tab.removeEventListener("click", this.boundHandlers.switchTab);
            tab.addEventListener("click", (e) => {
                e.stopPropagation();
                this.switchTab(e.currentTarget.dataset.tab);
            });
        });

        document.removeEventListener("click", this.boundHandlers.outsideClose);
        document.addEventListener("click", this.boundHandlers.outsideClose);

        window.removeEventListener("resize", this.boundHandlers.resizeHandler);
        window.addEventListener("resize", this.boundHandlers.resizeHandler);
    },
    outsideClose(e) {
        const isInPanel = e.target.closest("#novel-writer-panel");
        const isInBall = e.target.closest("#novel-writer-float-ball");
        if (!isInPanel && !isInBall && this.panel.classList.contains("show")) {
            this.hidePanel();
        }
    },
    resizeHandler: debounce(function () {
        if (!this.isDragging) {
            this.autoAdsorbEdge();
        }
    }, 200),
    startDrag(e) {
        e.preventDefault();
        e.stopPropagation();
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
        let x = clientX - this.offset.x;
        let y = clientY - this.offset.y;
        const maxX = window.innerWidth - this.ball.offsetWidth;
        const maxY = window.innerHeight - this.ball.offsetHeight;
        x = Math.max(0, Math.min(x, maxX));
        y = Math.max(0, Math.min(y, maxY));
        this.ball.style.left = `${x}px`;
        this.ball.style.top = `${y}px`;
        this.ball.style.right = 'auto';
        this.ball.style.transform = 'none';
        extension_settings[extensionName].floatBallState.position = { x, y };
        saveSettingsDebounced();
    },
    stopDrag(e) {
        if (!this.ball.classList.contains("dragging")) return;
        this.ball.classList.remove("dragging");
        if (this.isClick && !this.isDragging) {
            e.stopPropagation();
            this.togglePanel();
        }
        if (this.isDragging) {
            this.autoAdsorbEdge();
        }
        this.isDragging = false;
        this.isClick = false;
    },
    autoAdsorbEdge() {
        const rect = this.ball.getBoundingClientRect();
        const windowWidth = window.innerWidth;
        const centerX = windowWidth / 2;
        const targetLeft = rect.left < centerX ? 10 : windowWidth - this.ball.offsetWidth - 10;
        const maxY = window.innerHeight - this.ball.offsetHeight;
        const safeTop = Math.max(10, Math.min(rect.top, maxY));
        this.ball.style.left = `${targetLeft}px`;
        this.ball.style.top = `${safeTop}px`;
        this.ball.style.right = 'auto';
        this.ball.style.transform = 'none';
        const newRect = this.ball.getBoundingClientRect();
        extension_settings[extensionName].floatBallState.position = { x: newRect.left, y: newRect.top };
        saveSettingsDebounced();
    },
    togglePanel() {
        if (this.panel.classList.contains("show")) {
            this.hidePanel();
        } else {
            this.showPanel();
        }
    },
    showPanel() {
        this.panel.classList.add("show");
        extension_settings[extensionName].floatBallState.isPanelOpen = true;
        saveSettingsDebounced();
    },
    hidePanel() {
        this.panel.classList.remove("show");
        extension_settings[extensionName].floatBallState.isPanelOpen = false;
        saveSettingsDebounced();
    },
    switchTab(tabId) {
        document.querySelectorAll(".panel-tab-item").forEach(tab => {
            tab.classList.toggle("active", tab.dataset.tab === tabId);
        });
        document.querySelectorAll(".panel-tab-panel").forEach(panel => {
            panel.classList.toggle("active", panel.id === tabId);
        });
        extension_settings[extensionName].floatBallState.activeTab = tabId;
        saveSettingsDebounced();
    },
    restoreState() {
        const state = extension_settings[extensionName].floatBallState || defaultSettings.floatBallState;
        const maxX = window.innerWidth - this.ball.offsetWidth;
        const maxY = window.innerHeight - this.ball.offsetHeight;
        const safeX = Math.max(0, Math.min(state.position.x, maxX));
        const safeY = Math.max(0, Math.min(state.position.y, maxY));
        this.ball.style.left = `${safeX}px`;
        this.ball.style.top = `${safeY}px`;
        this.ball.style.right = "auto";
        this.ball.style.transform = "none";
        this.switchTab(state.activeTab);
        if (state.isPanelOpen) this.showPanel();
    }
};
