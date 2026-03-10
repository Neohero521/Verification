import { debounce } from "./utils.js";
import { extension_settings, extensionName, defaultSettings, saveSettingsDebounced } from "./constants.js";

export const FloatBall = {
    ball: null,
    panel: null,
    isDragging: false,
    startPos: { x: 0, y: 0 },
    offset: { x: 0, y: 0 },
    minMoveDistance: 8, // 放大阈值，彻底避免点击误判为拖拽
    boundHandlers: {},
    init() {
        // 强校验DOM元素，不存在直接报错
        this.ball = document.getElementById("novel-writer-float-ball");
        this.panel = document.getElementById("novel-writer-panel");
        
        if (!this.ball) {
            console.error("[小说续写插件] 悬浮球DOM元素不存在，请检查HTML是否正确加载");
            toastr.error("插件加载失败：悬浮球元素未找到", "错误");
            return;
        }
        if (!this.panel) {
            console.error("[小说续写插件] 面板DOM元素不存在，请检查HTML是否正确加载");
            toastr.error("插件加载失败：面板元素未找到", "错误");
            return;
        }

        // 预绑定所有事件处理函数，确保可正确移除
        this.boundHandlers = {
            onMouseDown: this.onMouseDown.bind(this),
            onMouseMove: this.onMouseMove.bind(this),
            onMouseUp: this.onMouseUp.bind(this),
            onTouchStart: this.onTouchStart.bind(this),
            onTouchMove: this.onTouchMove.bind(this),
            onTouchEnd: this.onTouchEnd.bind(this),
            onBallClick: this.onBallClick.bind(this),
            onPanelClose: this.onPanelClose.bind(this),
            onTabSwitch: this.onTabSwitch.bind(this),
            onOutsideClose: this.onOutsideClose.bind(this),
            onResize: this.resizeHandler.bind(this)
        };

        console.log("[小说续写插件] 悬浮球初始化成功，DOM元素已找到");
        this.bindEvents();
        this.restoreState();
        this.autoAdsorbEdge();

        // 强制显示悬浮球，避免CSS/加载问题导致隐藏
        this.ball.style.cssText += `
            visibility: visible !important;
            opacity: 1 !important;
            display: flex !important;
            pointer-events: all !important;
            z-index: 999999 !important;
        `;
    },
    bindEvents() {
        // 先彻底清除所有旧事件，避免重复绑定
        this.clearEvents();

        // 鼠标事件绑定
        this.ball.addEventListener("mousedown", this.boundHandlers.onMouseDown);
        document.addEventListener("mousemove", this.boundHandlers.onMouseMove);
        document.addEventListener("mouseup", this.boundHandlers.onMouseUp);
        this.ball.addEventListener("click", this.boundHandlers.onBallClick);

        // 触屏事件绑定（适配移动端）
        this.ball.addEventListener("touchstart", this.boundHandlers.onTouchStart, { passive: false });
        document.addEventListener("touchmove", this.boundHandlers.onTouchMove, { passive: false });
        document.addEventListener("touchend", this.boundHandlers.onTouchEnd);

        // 面板关闭按钮
        const closeBtn = document.getElementById("panel-close-btn");
        closeBtn?.addEventListener("click", this.boundHandlers.onPanelClose);

        // 选项卡切换
        document.querySelectorAll(".panel-tab-item").forEach(tab => {
            tab.addEventListener("click", this.boundHandlers.onTabSwitch);
        });

        // 点击外部关闭面板
        document.addEventListener("click", this.boundHandlers.onOutsideClose);

        // 窗口缩放适配
        window.addEventListener("resize", this.boundHandlers.onResize);
    },
    clearEvents() {
        // 清除所有已绑定的事件，彻底避免冲突
        this.ball?.removeEventListener("mousedown", this.boundHandlers.onMouseDown);
        document.removeEventListener("mousemove", this.boundHandlers.onMouseMove);
        document.removeEventListener("mouseup", this.boundHandlers.onMouseUp);
        this.ball?.removeEventListener("click", this.boundHandlers.onBallClick);

        this.ball?.removeEventListener("touchstart", this.boundHandlers.onTouchStart);
        document.removeEventListener("touchmove", this.boundHandlers.onTouchMove);
        document.removeEventListener("touchend", this.boundHandlers.onTouchEnd);

        const closeBtn = document.getElementById("panel-close-btn");
        closeBtn?.removeEventListener("click", this.boundHandlers.onPanelClose);

        document.querySelectorAll(".panel-tab-item").forEach(tab => {
            tab.removeEventListener("click", this.boundHandlers.onTabSwitch);
        });

        document.removeEventListener("click", this.boundHandlers.onOutsideClose);
        window.removeEventListener("resize", this.boundHandlers.onResize);
    },
    // 鼠标按下/触屏开始：记录初始位置
    onMouseDown(e) {
        this.startDrag(e.clientX, e.clientY);
    },
    onTouchStart(e) {
        e.preventDefault();
        e.stopPropagation();
        const touch = e.touches[0];
        this.startDrag(touch.clientX, touch.clientY);
    },
    startDrag(clientX, clientY) {
        this.isDragging = false;
        const rect = this.ball.getBoundingClientRect();
        this.startPos.x = clientX;
        this.startPos.y = clientY;
        this.offset.x = clientX - rect.left;
        this.offset.y = clientY - rect.top;
        this.ball.classList.add("dragging");
    },
    // 鼠标移动/触屏移动：执行拖拽
    onMouseMove(e) {
        this.handleDragMove(e.clientX, e.clientY, e);
    },
    onTouchMove(e) {
        const touch = e.touches[0];
        this.handleDragMove(touch.clientX, touch.clientY, e);
    },
    handleDragMove(clientX, clientY, event) {
        if (!this.ball.classList.contains("dragging")) return;

        // 计算移动距离，超过阈值判定为拖拽
        const moveX = Math.abs(clientX - this.startPos.x);
        const moveY = Math.abs(clientY - this.startPos.y);
        if (moveX > this.minMoveDistance || moveY > this.minMoveDistance) {
            this.isDragging = true;
        }

        // 非拖拽状态不执行位置更新
        if (!this.isDragging) return;

        // 彻底阻止浏览器默认行为，避免拖拽时页面滚动/选中文本
        event.preventDefault();
        event.stopPropagation();

        // 计算安全边界，确保悬浮球不会超出屏幕
        let x = clientX - this.offset.x;
        let y = clientY - this.offset.y;
        const maxX = window.innerWidth - this.ball.offsetWidth;
        const maxY = window.innerHeight - this.ball.offsetHeight;
        x = Math.max(10, Math.min(x, maxX - 10));
        y = Math.max(10, Math.min(y, maxY - 10));

        // 更新位置，清除冲突的CSS属性
        this.ball.style.left = `${x}px`;
        this.ball.style.top = `${y}px`;
        this.ball.style.right = 'auto';
        this.ball.style.transform = 'none';
    },
    // 鼠标/触屏抬起：结束拖拽
    onMouseUp() {
        this.endDrag();
    },
    onTouchEnd() {
        this.endDrag();
    },
    endDrag() {
        this.ball.classList.remove("dragging");
        // 拖拽结束执行边缘吸附
        if (this.isDragging) {
            this.autoAdsorbEdge();
            // 保存拖拽后的位置
            const rect = this.ball.getBoundingClientRect();
            extension_settings[extensionName].floatBallState.position = { x: rect.left, y: rect.top };
            saveSettingsDebounced();
        }
        // 下一帧重置拖拽状态，避免影响click事件
        requestAnimationFrame(() => {
            this.isDragging = false;
        });
    },
    // 核心修复：单独处理点击事件，彻底阻止冒泡
    onBallClick(e) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();

        // 拖拽过程中不触发点击
        if (this.isDragging) {
            console.log("[小说续写插件] 拖拽操作，不触发点击");
            return;
        }

        console.log("[小说续写插件] 悬浮球点击，切换面板显示状态");
        this.togglePanel();
    },
    // 点击外部关闭面板
    onOutsideClose(e) {
        const isInPanel = e.target.closest("#novel-writer-panel");
        const isInBall = e.target.closest("#novel-writer-float-ball");
        // 仅当点击既不在面板也不在悬浮球时，才关闭面板
        if (!isInPanel && !isInBall && this.panel.classList.contains("show")) {
            console.log("[小说续写插件] 点击外部，关闭面板");
            this.hidePanel();
        }
    },
    // 面板关闭按钮事件
    onPanelClose(e) {
        e.stopPropagation();
        this.hidePanel();
    },
    // 选项卡切换事件
    onTabSwitch(e) {
        e.stopPropagation();
        const tabId = e.currentTarget.dataset.tab;
        this.switchTab(tabId);
    },
    // 窗口缩放适配
    resizeHandler: debounce(function () {
        if (!this.isDragging) {
            this.autoAdsorbEdge();
        }
    }, 200),
    // 边缘吸附逻辑（仅左右吸附，垂直位置保留）
    autoAdsorbEdge() {
        const rect = this.ball.getBoundingClientRect();
        const windowWidth = window.innerWidth;
        const centerX = windowWidth / 2;

        // 左右边缘吸附
        const targetLeft = rect.left < centerX ? 10 : windowWidth - this.ball.offsetWidth - 10;
        // 垂直方向安全边界，避免超出屏幕
        const maxY = window.innerHeight - this.ball.offsetHeight;
        const safeTop = Math.max(10, Math.min(rect.top, maxY - 10));

        // 更新位置
        this.ball.style.left = `${targetLeft}px`;
        this.ball.style.top = `${safeTop}px`;
        this.ball.style.right = 'auto';
        this.ball.style.transform = 'none';
    },
    // 面板开关逻辑（修复过渡动画问题）
    togglePanel() {
        this.panel.classList.contains("show") ? this.hidePanel() : this.showPanel();
    },
    showPanel() {
        // 先设置display:flex，再触发过渡动画，解决display:none无法过渡的问题
        this.panel.style.display = "flex";
        this.panel.style.opacity = "0";
        this.panel.style.transform = "translate(-50%, -50%) scale(0.8)";
        
        // 下一帧添加show类，触发过渡
        requestAnimationFrame(() => {
            this.panel.classList.add("show");
            this.panel.style.opacity = "1";
            this.panel.style.transform = "translate(-50%, -50%) scale(1)";
            extension_settings[extensionName].floatBallState.isPanelOpen = true;
            saveSettingsDebounced();
            console.log("[小说续写插件] 面板已打开");
        });
    },
    hidePanel() {
        this.panel.classList.remove("show");
        this.panel.style.opacity = "0";
        this.panel.style.transform = "translate(-50%, -50%) scale(0.8)";
        
        // 过渡结束后设置display:none
        setTimeout(() => {
            if (!this.panel.classList.contains("show")) {
                this.panel.style.display = "none";
            }
        }, 300);
        
        extension_settings[extensionName].floatBallState.isPanelOpen = false;
        saveSettingsDebounced();
        console.log("[小说续写插件] 面板已关闭");
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
        // 计算安全位置
        const maxX = window.innerWidth - this.ball.offsetWidth;
        const maxY = window.innerHeight - this.ball.offsetHeight;
        const safeX = Math.max(10, Math.min(state.position.x, maxX - 10));
        const safeY = Math.max(10, Math.min(state.position.y, maxY - 10));

        // 恢复位置
        this.ball.style.left = `${safeX}px`;
        this.ball.style.top = `${safeY}px`;
        this.ball.style.right = "auto";
        this.ball.style.transform = "none";

        // 恢复标签页
        this.switchTab(state.activeTab);
        // 恢复面板状态
        if (state.isPanelOpen) {
            this.showPanel();
        } else {
            this.hidePanel();
        }
    }
};
