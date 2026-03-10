import { debounce } from "./utils.js";
import { extension_settings, extensionName, defaultSettings, saveSettingsDebounced } from "./constants.js";

// 完全对齐源文件可用逻辑，仅做模块化拆分，无破坏性修改
export const FloatBall = {
    ball: null,
    panel: null,
    isDragging: false,
    isClick: false,
    startPos: { x: 0, y: 0 },
    offset: { x: 0, y: 0 },
    minMoveDistance: 5, // 对齐源文件阈值，避免点击误判为拖拽
    boundHandlers: {},

    init() {
        // 强校验DOM，对齐源文件逻辑
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

        // 预绑定事件，确保可正确移除，对齐源文件事件处理逻辑
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

        console.log("[小说续写插件] 悬浮球初始化成功，DOM元素已确认");
        this.clearEvents(); // 先彻底清除旧事件，避免重复绑定
        this.bindEvents();
        this.restoreState();
        this.autoAdsorbEdge();

        // 强制显示悬浮球，对齐源文件初始逻辑，避免CSS隐藏
        this.ball.style.cssText += `
            visibility: visible !important;
            opacity: 1 !important;
            display: flex !important;
            pointer-events: all !important;
            z-index: 999999 !important;
            touch-action: none !important;
        `;
    },

    // 彻底清除所有事件，避免重复绑定导致的冲突
    clearEvents() {
        this.ball?.removeEventListener("mousedown", this.boundHandlers.startDrag);
        document.removeEventListener("mousemove", this.boundHandlers.onDrag);
        document.removeEventListener("mouseup", this.boundHandlers.stopDrag);
        this.ball?.removeEventListener("click", this.boundHandlers.onBallClick);

        this.ball?.removeEventListener("touchstart", this.boundHandlers.startDrag);
        document.removeEventListener("touchmove", this.boundHandlers.onDrag);
        document.removeEventListener("touchend", this.boundHandlers.stopDrag);

        const closeBtn = document.getElementById("panel-close-btn");
        closeBtn?.removeEventListener("click", this.boundHandlers.onPanelClose);

        document.querySelectorAll(".panel-tab-item").forEach(tab => {
            tab.removeEventListener("click", this.boundHandlers.onTabSwitch);
        });

        document.removeEventListener("click", this.boundHandlers.onOutsideClose);
        window.removeEventListener("resize", this.boundHandlers.resizeHandler);
    },

    // 绑定事件，完全对齐源文件逻辑
    bindEvents() {
        // 鼠标拖拽事件
        this.ball.addEventListener("mousedown", this.boundHandlers.startDrag);
        document.addEventListener("mousemove", this.boundHandlers.onDrag);
        document.addEventListener("mouseup", this.boundHandlers.stopDrag);
        // 核心修复：单独绑定click事件，彻底阻断冒泡
        this.ball.addEventListener("click", this.boundHandlers.onBallClick);

        // 触屏拖拽事件（适配移动端）
        this.ball.addEventListener("touchstart", this.boundHandlers.startDrag, { passive: false });
        document.addEventListener("touchmove", this.boundHandlers.onDrag, { passive: false });
        document.addEventListener("touchend", this.boundHandlers.stopDrag);

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
        window.addEventListener("resize", this.boundHandlers.resizeHandler);
    },

    // 拖拽开始，对齐源文件逻辑
    startDrag(e) {
        e.preventDefault();
        e.stopPropagation();
        this.isDragging = false;
        this.isClick = true;
        this.ball.classList.add("dragging");

        // 统一获取鼠标/触屏坐标
        const clientX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
        const clientY = e.type.includes('touch') ? e.touches[0].clientY : e.clientY;
        const rect = this.ball.getBoundingClientRect();

        this.startPos.x = clientX;
        this.startPos.y = clientY;
        this.offset.x = clientX - rect.left;
        this.offset.y = clientY - rect.top;
    },

    // 拖拽中，对齐源文件位置计算逻辑
    onDrag(e) {
        if (!this.ball.classList.contains("dragging")) return;

        const clientX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
        const clientY = e.type.includes('touch') ? e.touches[0].clientY : e.clientY;

        // 计算移动距离，超过阈值判定为拖拽
        const moveX = Math.abs(clientX - this.startPos.x);
        const moveY = Math.abs(clientY - this.startPos.y);
        if (moveX > this.minMoveDistance || moveY > this.minMoveDistance) {
            this.isClick = false;
            this.isDragging = true;
        }

        // 非拖拽状态不执行位置更新
        if (!this.isDragging) return;

        // 彻底阻止浏览器默认行为，避免拖拽时页面滚动
        e.preventDefault();
        e.stopPropagation();

        // 计算安全边界，确保悬浮球不会超出屏幕
        let x = clientX - this.offset.x;
        let y = clientY - this.offset.y;
        const maxX = window.innerWidth - this.ball.offsetWidth;
        const maxY = window.innerHeight - this.ball.offsetHeight;
        x = Math.max(10, Math.min(x, maxX - 10));
        y = Math.max(10, Math.min(y, maxY - 10));

        // 更新位置，清除所有冲突的transform属性
        this.ball.style.left = `${x}px`;
        this.ball.style.top = `${y}px`;
        this.ball.style.right = 'auto';
        this.ball.style.transform = 'none'; // 核心修复：彻底清除transform，避免hover冲突
    },

    // 拖拽结束，对齐源文件逻辑
    stopDrag(e) {
        if (!this.ball.classList.contains("dragging")) return;
        this.ball.classList.remove("dragging");

        // 拖拽结束执行边缘吸附
        if (this.isDragging) {
            this.autoAdsorbEdge();
            // 保存拖拽后的位置
            const rect = this.ball.getBoundingClientRect();
            extension_settings[extensionName].floatBallState.position = { x: rect.left, y: rect.top };
            saveSettingsDebounced();
        }

        // 下一帧重置状态，避免影响click事件
        requestAnimationFrame(() => {
            this.isDragging = false;
            this.isClick = false;
        });
    },

    // 核心修复：悬浮球点击事件，彻底阻断所有冒泡，避免面板闪关
    onBallClick(e) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();

        // 拖拽过程中不触发点击
        if (this.isDragging) {
            console.log("[小说续写插件] 拖拽操作，不触发点击");
            return;
        }

        console.log("[小说续写插件] 悬浮球点击，切换面板");
        this.togglePanel();
    },

    // 点击外部关闭面板，对齐源文件逻辑
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

    // 边缘吸附，完全对齐源文件逻辑：仅左右吸附，不改变垂直位置
    autoAdsorbEdge() {
        const rect = this.ball.getBoundingClientRect();
        const windowWidth = window.innerWidth;
        const centerX = windowWidth / 2;

        // 仅左右吸附，垂直位置完全保留用户拖拽的位置
        const targetLeft = rect.left < centerX ? 10 : windowWidth - this.ball.offsetWidth - 10;
        // 垂直方向安全边界，避免超出屏幕
        const maxY = window.innerHeight - this.ball.offsetHeight;
        const safeTop = Math.max(10, Math.min(rect.top, maxY - 10));

        // 更新位置，彻底清除transform
        this.ball.style.left = `${targetLeft}px`;
        this.ball.style.top = `${safeTop}px`;
        this.ball.style.right = 'auto';
        this.ball.style.transform = 'none';

        // 保存位置
        const newRect = this.ball.getBoundingClientRect();
        extension_settings[extensionName].floatBallState.position = { x: newRect.left, y: newRect.top };
        saveSettingsDebounced();
    },

    // 面板开关，对齐源文件逻辑，修复过渡动画问题
    togglePanel() {
        this.panel.classList.contains("show") ? this.hidePanel() : this.showPanel();
    },

    showPanel() {
        // 先设置display，再触发过渡，解决display:none无法过渡的问题
        this.panel.style.display = "flex";
        this.panel.style.opacity = "0";
        this.panel.style.transform = "translate(-50%, -50%) scale(0.8)";
        
        // 下一帧添加show类，触发过渡，对齐源文件显示逻辑
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
        
        // 过渡结束后隐藏，对齐源文件关闭逻辑
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

    // 恢复状态，对齐源文件逻辑
    restoreState() {
        const state = extension_settings[extensionName].floatBallState || defaultSettings.floatBallState;
        // 计算安全位置
        const maxX = window.innerWidth - this.ball.offsetWidth;
        const maxY = window.innerHeight - this.ball.offsetHeight;
        const safeX = Math.max(10, Math.min(state.position.x, maxX - 10));
        const safeY = Math.max(10, Math.min(state.position.y, maxY - 10));

        // 恢复位置，清除transform
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
