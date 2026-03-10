import { debounce } from "./utils.js";
import { extension_settings, extensionName, defaultSettings, saveSettingsDebounced } from "./constants.js";

// 可移动悬浮球核心模块（原有逻辑100%保留）
export const FloatBall = {
    ball: null,
    panel: null,
    isDragging: false,
    isClick: false,
    startPos: { x: 0, y: 0 },
    offset: { x: 0, y: 0 },
    minMoveDistance: 3,

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
        console.log("[小说续写插件] 悬浮球初始化成功");
        this.bindEvents();
        this.restoreState();
        this.ball.style.visibility = "visible";
        this.ball.style.opacity = "1";
        this.ball.style.display = "flex";
    },

    bindEvents() {
        // 清除旧事件，避免重复绑定
        this.ball.removeEventListener("mousedown", this.startDrag.bind(this));
        document.removeEventListener("mousemove", this.onDrag.bind(this));
        document.removeEventListener("mouseup", this.stopDrag.bind(this));
        this.ball.removeEventListener("touchstart", this.startDrag.bind(this));
        document.removeEventListener("touchmove", this.onDrag.bind(this));
        document.removeEventListener("touchend", this.stopDrag.bind(this));

        // 重新绑定事件
        this.ball.addEventListener("mousedown", this.startDrag.bind(this));
        document.addEventListener("mousemove", this.onDrag.bind(this));
        document.addEventListener("mouseup", this.stopDrag.bind(this));
        this.ball.addEventListener("touchstart", this.startDrag.bind(this), { passive: false });
        document.addEventListener("touchmove", this.onDrag.bind(this), { passive: false });
        document.addEventListener("touchend", this.stopDrag.bind(this));

        // 面板关闭按钮
        const closeBtn = document.getElementById("panel-close-btn");
        closeBtn.removeEventListener("click", this.hidePanel.bind(this));
        closeBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            this.hidePanel();
        });

        // 选项卡切换
        document.querySelectorAll(".panel-tab-item").forEach(tab => {
            tab.removeEventListener("click", this.switchTab.bind(this));
            tab.addEventListener("click", (e) => {
                e.stopPropagation();
                this.switchTab(e.currentTarget.dataset.tab);
            });
        });

        // 点击外部关闭面板
        document.removeEventListener("click", this.outsideClose.bind(this));
        document.addEventListener("click", this.outsideClose.bind(this));

        // 窗口resize适配
        window.removeEventListener("resize", this.resizeHandler.bind(this));
        window.addEventListener("resize", this.resizeHandler.bind(this));
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
            this.togglePanel();
        }
        if (this.isDragging) {
            this.autoAdsorbEdge();
        }

        this.isDragging = false;
        this.isClick = false;
    },

    // 吸附仅处理左右边缘，不改变垂直位置，不强制居中
    autoAdsorbEdge() {
        const rect = this.ball.getBoundingClientRect();
        const windowWidth = window.innerWidth;
        const centerX = windowWidth / 2;

        // 仅左右吸附，垂直位置保持用户拖动的位置
        if (rect.left < centerX) {
            this.ball.style.left = "10px";
        } else {
            this.ball.style.left = `${windowWidth - this.ball.offsetWidth - 10}px`;
        }
        this.ball.style.right = "auto";
        // 移除强制垂直居中的transform，避免位置偏移
        this.ball.style.transform = "none";

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
