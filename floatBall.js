import { extension_settings, saveSettingsDebounced, defaultSettings } from './config.js';
import { debounce } from './utils.js';
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
        
        // 核心修复：DOM元素不存在时直接抛出明确错误，避免静默失败
        if (!this.ball || !this.panel) {
            const errorMsg = "[小说续写插件] 悬浮球/面板DOM元素未找到，请检查example.html是否正确加载";
            console.error(errorMsg);
            toastr.error(errorMsg, "插件错误");
            return;
        }

        // 先绑定事件，再恢复状态，最后设置可见性
        this.bindEvents();
        this.restoreState();
        // 强制显示悬浮球，兜底样式覆盖
        this.ball.style.visibility = "visible !important";
        this.ball.style.opacity = "1 !important";
        this.ball.style.display = "flex !important";
        
        console.log("[小说续写插件] 悬浮球初始化完成");
    },
    bindEvents() {
        // 拖动事件
        this.ball.addEventListener("mousedown", this.startDrag.bind(this));
        document.addEventListener("mousemove", this.onDrag.bind(this));
        document.addEventListener("mouseup", this.stopDrag.bind(this));
        this.ball.addEventListener("touchstart", this.startDrag.bind(this), { passive: false });
        document.addEventListener("touchmove", this.onDrag.bind(this), { passive: false });
        document.addEventListener("touchend", this.stopDrag.bind(this));
        // 面板关闭事件
        document.getElementById("panel-close-btn").addEventListener("click", (e) => {
            e.stopPropagation();
            this.hidePanel();
        });
        // 选项卡切换
        document.querySelectorAll(".panel-tab-item").forEach(tab => {
            tab.addEventListener("click", (e) => {
                e.stopPropagation();
                this.switchTab(e.currentTarget.dataset.tab);
            });
        });
        // 点击外部关闭面板
        document.addEventListener("click", this.outsideClose.bind(this));
        // 窗口大小变化适配，防抖避免频繁触发
        window.addEventListener("resize", debounce(this.autoAdsorbEdge.bind(this), 200));
        // 新增：窗口加载完成后再次校正位置，确保初始位置正确
        window.addEventListener("load", () => {
            this.restoreState();
        });
    },
    outsideClose(e) {
        const isInPanel = e.target.closest("#novel-writer-panel");
        const isInBall = e.target.closest("#novel-writer-float-ball");
        if (!isInPanel && !isInBall && this.panel.classList.contains("show")) {
            this.hidePanel();
        }
    },
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
        // 限制拖动范围，确保不会拖出屏幕
        x = Math.max(0, Math.min(x, maxX));
        y = Math.max(0, Math.min(y, maxY));
        this.ball.style.left = `${x}px`;
        this.ball.style.top = `${y}px`;
        this.ball.style.right = 'auto';
        this.ball.style.transform = 'none';
        extension_settings.Verification.floatBallState.position = { x, y };
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
    autoAdsorbEdge() {
        const rect = this.ball.getBoundingClientRect();
        const windowWidth = window.innerWidth;
        const centerX = windowWidth / 2;
        // 自动吸附到左右边缘
        if (rect.left < centerX) {
            this.ball.style.left = "10px";
        } else {
            this.ball.style.left = `${windowWidth - this.ball.offsetWidth - 10}px`;
        }
        this.ball.style.right = "auto";
        this.ball.style.transform = "none";
        // 保存吸附后的位置
        const newRect = this.ball.getBoundingClientRect();
        extension_settings.Verification.floatBallState.position = { x: newRect.left, y: newRect.top };
        saveSettingsDebounced();
    },
    togglePanel() {
        this.panel.classList.contains("show") ? this.hidePanel() : this.showPanel();
    },
    showPanel() {
        this.panel.classList.add("show");
        extension_settings.Verification.floatBallState.isPanelOpen = true;
        saveSettingsDebounced();
    },
    hidePanel() {
        this.panel.classList.remove("show");
        extension_settings.Verification.floatBallState.isPanelOpen = false;
        saveSettingsDebounced();
    },
    switchTab(tabId) {
        document.querySelectorAll(".panel-tab-item").forEach(tab => {
            tab.classList.toggle("active", tab.dataset.tab === tabId);
        });
        document.querySelectorAll(".panel-tab-panel").forEach(panel => {
            panel.classList.toggle("active", panel.id === tabId);
        });
        extension_settings.Verification.floatBallState.activeTab = tabId;
        saveSettingsDebounced();
    },
    restoreState() {
        const settings = extension_settings.Verification;
        const floatState = settings.floatBallState || defaultSettings.floatBallState;
        const ballWidth = this.ball.offsetWidth || 70; // 兜底宽度，避免offsetWidth获取异常
        const ballHeight = this.ball.offsetHeight || 70; // 兜底高度
        const maxX = window.innerWidth - ballWidth;
        const maxY = window.innerHeight - ballHeight;

        // 核心修复：无效位置兜底，确保悬浮球一定在可视区域内
        let safeX = floatState.position.x;
        let safeY = floatState.position.y;
        // 位置无效时，默认放到屏幕右侧垂直居中
        if (isNaN(safeX) || isNaN(safeY) || safeX <= 0 || safeY <= 0 || safeX > maxX || safeY > maxY) {
            safeX = window.innerWidth - ballWidth - 20;
            safeY = window.innerHeight / 2 - ballHeight / 2;
        }

        // 安全范围限制
        safeX = Math.max(0, Math.min(safeX, maxX));
        safeY = Math.max(0, Math.min(safeY, maxY));

        // 应用位置
        this.ball.style.left = `${safeX}px`;
        this.ball.style.top = `${safeY}px`;
        this.ball.style.right = "auto";
        this.ball.style.transform = "none";

        // 恢复其他状态
        this.switchTab(floatState.activeTab);
        if (floatState.isPanelOpen) this.showPanel();

        // 保存修正后的位置
        extension_settings.Verification.floatBallState.position = { x: safeX, y: safeY };
        saveSettingsDebounced();
    }
};
