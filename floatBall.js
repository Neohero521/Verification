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
    initRetryCount: 0,
    maxRetryCount: 5,
    init() {
        // 优化：用jQuery选择器确保能获取刚插入的DOM元素
        this.ball = $("#novel-writer-float-ball")[0];
        this.panel = $("#novel-writer-panel")[0];
        
        // 新增：DOM未找到时延迟重试，解决渲染延迟问题
        if (!this.ball || !this.panel) {
            if (this.initRetryCount < this.maxRetryCount) {
                this.initRetryCount++;
                console.error(`[${extension_settings.Verification.extensionName}] 悬浮球/面板元素未找到，第${this.initRetryCount}次重试...`);
                setTimeout(() => this.init(), 200);
                return;
            }
            console.error(`[${extension_settings.Verification.extensionName}] 悬浮球/面板元素缺失，重试失败`);
            toastr.error("小说续写插件加载失败：UI元素缺失，请检查文件完整性", "插件错误");
            return;
        }
        this.initRetryCount = 0;
        this.bindEvents();
        this.restoreState();
        // 强制显示悬浮球，兜底CSS的!important
        this.ball.style.visibility = "visible !important";
        this.ball.style.opacity = "1 !important";
        this.ball.style.display = "flex !important";
        console.log(`[${extension_settings.Verification.extensionName}] 悬浮球初始化完成`);
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
        $("#panel-close-btn").off("click").on("click", (e) => {
            e.stopPropagation();
            this.hidePanel();
        });
        // 选项卡切换
        $(".panel-tab-item").off("click").on("click", (e) => {
            e.stopPropagation();
            this.switchTab(e.currentTarget.dataset.tab);
        });
        // 点击外部关闭面板
        document.addEventListener("click", this.outsideClose.bind(this));
        // 窗口大小变化适配
        window.addEventListener("resize", debounce(this.autoAdsorbEdge.bind(this), 200));
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
        if (rect.left < centerX) {
            this.ball.style.left = "10px";
        } else {
            this.ball.style.left = `${windowWidth - this.ball.offsetWidth - 10}px`;
        }
        this.ball.style.right = "auto";
        this.ball.style.transform = "none";
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
        $(".panel-tab-item").each((_, tab) => {
            tab.classList.toggle("active", tab.dataset.tab === tabId);
        });
        $(".panel-tab-panel").each((_, panel) => {
            panel.classList.toggle("active", panel.id === tabId);
        });
        extension_settings.Verification.floatBallState.activeTab = tabId;
        saveSettingsDebounced();
    },
    restoreState() {
        const settings = extension_settings.Verification;
        const floatState = settings.floatBallState || defaultSettings.floatBallState;
        const maxX = window.innerWidth - this.ball.offsetWidth;
        const maxY = window.innerHeight - this.ball.offsetHeight;
        const safeX = Math.max(0, Math.min(floatState.position.x, maxX));
        const safeY = Math.max(0, Math.min(floatState.position.y, maxY));
        this.ball.style.left = `${safeX}px`;
        this.ball.style.top = `${safeY}px`;
        this.ball.style.right = "auto";
        this.ball.style.transform = "none";
        this.switchTab(floatState.activeTab);
        if (floatState.isPanelOpen) this.showPanel();
    }
};
