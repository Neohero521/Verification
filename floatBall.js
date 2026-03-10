// 【Verification悬浮球核心】严格对齐Cola仓库floating-ball.js实现
import { extension_settings, saveSettingsDebounced, defaultSettings, extensionName } from './config.js';
import { debounce } from './utils.js';

// 单例模式，对齐Cola的实现，防止重复初始化
export const FloatBall = {
    isInited: false,
    ball: null,
    panel: null,
    root: null,
    isDragging: false,
    isClick: false,
    startPos: { x: 0, y: 0 },
    offset: { x: 0, y: 0 },
    minMoveDistance: 5,
    ballSize: 70,
    zIndex: 9999999,

    // 核心：动态创建DOM，不依赖外部HTML，对齐Cola的结构
    create() {
        console.log('[Verification] 开始创建悬浮球DOM');
        // 根容器，完全隔离
        this.root = document.createElement('div');
        this.root.className = 'Verification-extension-root';
        this.root.id = 'Verification-extension-root';
        this.root.style.cssText = `
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            width: 0 !important;
            height: 0 !important;
            padding: 0 !important;
            margin: 0 !important;
            border: none !important;
            overflow: visible !important;
            z-index: ${this.zIndex - 1} !important;
            background: transparent !important;
        `;

        // 悬浮球核心DOM，行内强制样式兜底，即使CSS不加载也能显示
        this.ball = document.createElement('div');
        this.ball.id = 'Verification-float-ball';
        this.ball.className = 'Verification-float-ball';
        // 【强制行内样式兜底】核心显示样式全部写在行内，加!important
        this.ball.style.cssText = `
            position: fixed !important;
            right: 20px !important;
            top: 50% !important;
            transform: translateY(-50%) !important;
            width: ${this.ballSize}px !important;
            height: ${this.ballSize}px !important;
            border-radius: 999px !important;
            background: linear-gradient(135deg, #6d28d9 0%, #7c3aed 50%, #06b6d4 100%) !important;
            box-shadow: 0 0 25px rgba(124, 58, 237, 0.7), 0 4px 15px rgba(0, 0, 0, 0.5) !important;
            display: flex !important;
            flex-direction: column !important;
            align-items: center !important;
            justify-content: center !important;
            cursor: pointer !important;
            z-index: ${this.zIndex} !important;
            transition: all 0.3s ease !important;
            user-select: none !important;
            border: 2px solid rgba(255, 255, 255, 0.1) !important;
            visibility: visible !important;
            opacity: 1 !important;
            touch-action: none !important;
            -webkit-user-select: none !important;
        `;
        this.ball.innerHTML = `
            <div style="font-size: 1.5rem !important; color: white !important; margin-bottom: 2px !important; line-height: 1 !important;">📖</div>
            <div style="font-size: 0.7rem !important; color: white !important; font-weight: 600 !important; text-align: center !important; line-height: 1 !important;">小说续写</div>
        `;

        // 面板DOM，对齐Cola的面板结构
        this.panel = document.createElement('div');
        this.panel.id = 'Verification-panel';
        this.panel.className = 'Verification-panel';
        this.panel.style.cssText = `
            position: fixed !important;
            top: 50% !important;
            left: 50% !important;
            transform: translate(-50%, -50%) scale(0.8) !important;
            width: 900px !important;
            height: 850px !important;
            max-width: 95vw !important;
            max-height: 95vh !important;
            background: linear-gradient(135deg, #0c0c18 0%, #101022 100%) !important;
            border: 1px solid #334155 !important;
            border-radius: 16px !important;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6), 0 0 60px rgba(0, 0, 0, 0.8) !important;
            display: none !important;
            flex-direction: column !important;
            overflow: hidden !important;
            z-index: ${this.zIndex - 1} !important;
            opacity: 0 !important;
            transition: all 0.3s ease !important;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
        `;
        // 面板HTML内容，完全对齐Cola的结构
        this.panel.innerHTML = `
            <div class="panel-header" style="display: flex !important; justify-content: space-between !important; align-items: center !important; padding: 16px 24px !important; background: linear-gradient(90deg, #151528 0%, #0c0c18 100%) !important; border-bottom: 1px solid #334155 !important; flex-shrink: 0 !important;">
                <div class="panel-title" style="display: flex !important; align-items: center !important; gap: 10px !important; font-weight: 700 !important; font-size: 1.25rem !important; color: #f8fafc !important;">
                    <span style="color: #7c3aed !important; font-size: 1.3rem !important;">📖</span>
                    <span>小说智能续写系统</span>
                </div>
                <button id="panel-close-btn" class="panel-close-btn" style="width: 38px !important; height: 38px !important; border: none !important; border-radius: 6px !important; background: #121224 !important; color: #cbd5e1 !important; cursor: pointer !important; display: flex !important; align-items: center !important; justify-content: center !important; font-size: 1rem !important; font-weight: bold !important;">✕</button>
            </div>
            <div class="panel-tab-nav" style="display: flex !important; background: #151528 !important; border-bottom: 1px solid #334155 !important; flex-shrink: 0 !important; padding: 0 16px !important; gap: 4px !important;">
                <div class="panel-tab-item active" data-tab="tab-chapter" style="padding: 14px 20px !important; border: none !important; background: linear-gradient(180deg, #6d28d9 0%, #7c3aed 100%) !important; color: white !important; cursor: pointer !important; display: flex !important; align-items: center !important; gap: 8px !important; border-radius: 6px 6px 0 0 !important; font-weight: 600 !important; font-size: 0.9rem !important;">
                    <span>📋</span>
                    <span>章节管理</span>
                </div>
                <div class="panel-tab-item" data-tab="tab-graph" style="padding: 14px 20px !important; border: none !important; background: transparent !important; color: #94a3b8 !important; cursor: pointer !important; display: flex !important; align-items: center !important; gap: 8px !important; border-radius: 6px 6px 0 0 !important; font-weight: 600 !important; font-size: 0.9rem !important;">
                    <span>🧠</span>
                    <span>知识图谱</span>
                </div>
                <div class="panel-tab-item" data-tab="tab-write" style="padding: 14px 20px !important; border: none !important; background: transparent !important; color: #94a3b8 !important; cursor: pointer !important; display: flex !important; align-items: center !important; gap: 8px !important; border-radius: 6px 6px 0 0 !important; font-weight: 600 !important; font-size: 0.9rem !important;">
                    <span>✒️</span>
                    <span>内容续写</span>
                </div>
                <div class="panel-tab-item" data-tab="tab-reader" style="padding: 14px 20px !important; border: none !important; background: transparent !important; color: #94a3b8 !important; cursor: pointer !important; display: flex !important; align-items: center !important; gap: 8px !important; border-radius: 6px 6px 0 0 !important; font-weight: 600 !important; font-size: 0.9rem !important;">
                    <span>📚</span>
                    <span>小说阅读</span>
                </div>
            </div>
            <div class="panel-tab-content" style="flex: 1 !important; overflow-y: auto !important; padding: 20px 24px !important; background: #0c0c18 !important;">
                <div class="panel-tab-panel active" id="tab-chapter" style="display: block !important;">
                    <div class="content-card" style="background: #151528 !important; border: 1px solid #334155 !important; border-radius: 10px !important; margin-bottom: 16px !important; overflow: hidden !important;">
                        <div class="card-header" style="padding: 14px 20px !important; background: linear-gradient(90deg, #121224 0%, transparent 100%) !important; border-bottom: 1px solid #334155 !important;">
                            <h4 style="color: #f8fafc !important; font-size: 1.05rem !important; font-weight: 600 !important; margin: 0 !important; display: flex !important; align-items: center !important; gap: 8px !important;">
                                <span style="color: #7c3aed !important;">📥</span>
                                小说文件解析
                            </h4>
                        </div>
                        <div class="card-body" style="padding: 20px !important;">
                            <div class="file-select-group" style="display: flex !important; align-items: center !important; gap: 16px !important; margin-bottom: 20px !important; flex-wrap: wrap !important;">
                                <input id="novel-file-upload" type="file" accept=".txt" style="display: none;">
                                <button class="btn btn-primary" id="select-file-btn" style="border: none !important; border-radius: 6px !important; padding: 10px 18px !important; font-weight: 600 !important; font-size: 0.9rem !important; cursor: pointer !important; background: linear-gradient(90deg, #6d28d9 0%, #7c3aed 100%) !important; color: white !important; display: inline-flex !important; align-items: center !important; gap: 6px !important;">
                                    <span>📂</span>选择小说TXT文件
                                </button>
                                <span id="file-name-text" class="file-name" style="color: #cbd5e1 !important; font-size: 0.95rem !important;">未选择文件</span>
                            </div>
                            <div class="grid-row" style="display: grid !important; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)) !important; gap: 16px !important; margin-bottom: 16px !important;">
                                <div class="form-group">
                                    <label class="form-label" style="display: block !important; margin-bottom: 8px !important; font-weight: 600 !important; color: #e2e8f0 !important; font-size: 0.9rem !important;">章节拆分正则（自定义优先）</label>
                                    <input id="chapter-regex-input" type="text" class="form-input" style="width: 100% !important; background: #121224 !important; border: 1px solid #334155 !important; border-radius: 6px !important; padding: 10px 14px !important; color: #e2e8f0 !important; font-size: 0.95rem !important;" placeholder="请输入章节拆分正则表达式" value="^\\s*第\\s*[0-9零一二三四五六七八九十百千]+\\s*章.*$">
                                    <span class="input-tip" style="color: #94a3b8 !important; font-size: 0.85rem !important;">预设支持的章节格式：标准章节、括号序号、第X节、卷X第X章、Chapter X、第X话等</span>
                                </div>
                                <div class="form-group">
                                    <label class="form-label" style="display: block !important; margin-bottom: 8px !important; font-weight: 600 !important; color: #e2e8f0 !important; font-size: 0.9rem !important;">按字数拆分（单章字数1000-10000）</label>
                                    <input id="split-word-count" type="number" min="1000" max="10000" step="100" class="form-input" style="width: 100% !important; background: #121224 !important; border: 1px solid #334155 !important; border-radius: 6px !important; padding: 10px 14px !important; color: #e2e8f0 !important; font-size: 0.95rem !important;" value="3000">
                                    <span class="input-tip" style="color: #94a3b8 !important; font-size: 0.85rem !important;">范围：1000-10000</span>
                                </div>
                            </div>
                            <div class="btn-group-row" style="display: flex !important; align-items: center !important; gap: 10px !important; justify-content: center !important; margin-top: 20px !important;">
                                <input id="parse-chapter-btn" class="btn btn-primary btn-lg" type="submit" value="解析章节" style="border: none !important; border-radius: 6px !important; padding: 12px 32px !important; font-weight: 600 !important; font-size: 1rem !important; cursor: pointer !important; background: linear-gradient(90deg, #6d28d9 0%, #7c3aed 100%) !important; color: white !important;">
                                <input id="split-by-word-btn" class="btn btn-secondary btn-lg" type="submit" value="按字数拆分" style="border: none !important; border-radius: 6px !important; padding: 12px 32px !important; font-weight: 600 !important; font-size: 1rem !important; cursor: pointer !important; background: linear-gradient(90deg, #0891b2 0%, #06b6d4 100%) !important; color: #0c0c18 !important;">
                            </div>
                        </div>
                    </div>
                    <div id="novel-chapter-list" class="chapter-list" style="max-height: 320px !important; overflow-y: auto !important; padding: 0 20px 20px !important; display: flex !important; flex-direction: column !important; gap: 8px !important;">
                        <p class="empty-tip" style="text-align: center !important; color: #94a3b8 !important; padding: 40px 20px !important; font-size: 0.95rem !important;">请上传小说文件并点击「解析章节」</p>
                    </div>
                </div>
                <div class="panel-tab-panel" id="tab-graph" style="display: none !important;">
                    <div class="content-card" style="background: #151528 !important; border: 1px solid #334155 !important; border-radius: 10px !important; margin-bottom: 16px !important; overflow: hidden !important;">
                        <div class="card-header" style="padding: 14px 20px !important; background: linear-gradient(90deg, #121224 0%, transparent 100%) !important; border-bottom: 1px solid #334155 !important;">
                            <h4 style="color: #f8fafc !important; font-size: 1.05rem !important; font-weight: 600 !important; margin: 0 !important; display: flex !important; align-items: center !important; gap: 8px !important;">
                                <span style="color: #7c3aed !important;">🗺️</span>
                                知识图谱
                            </h4>
                        </div>
                        <div class="card-body" style="padding: 20px !important;">
                            <textarea id="merged-graph-preview" rows="15" class="form-textarea" style="width: 100% !important; background: #121224 !important; border: 1px solid #334155 !important; border-radius: 6px !important; padding: 12px 14px !important; color: #e2e8f0 !important; font-size: 0.9rem !important; line-height: 1.6 !important;" readonly placeholder="合并后的图谱JSON将显示在这里..." wrap="soft"></textarea>
                        </div>
                    </div>
                </div>
                <div class="panel-tab-panel" id="tab-write" style="display: none !important;">
                    <div class="content-card" style="background: #151528 !important; border: 1px solid #334155 !important; border-radius: 10px !important; margin-bottom: 16px !important; overflow: hidden !important;">
                        <div class="card-header" style="padding: 14px 20px !important; background: linear-gradient(90deg, #121224 0%, transparent 100%) !important; border-bottom: 1px solid #334155 !important;">
                            <h4 style="color: #f8fafc !important; font-size: 1.05rem !important; font-weight: 600 !important; margin: 0 !important; display: flex !important; align-items: center !important; gap: 8px !important;">
                                <span style="color: #7c3aed !important;">✒️</span>
                                内容续写
                            </h4>
                        </div>
                        <div class="card-body" style="padding: 20px !important;">
                            <textarea id="write-content-preview" rows="15" class="form-textarea" style="width: 100% !important; background: #121224 !important; border: 1px solid #334155 !important; border-radius: 6px !important; padding: 12px 14px !important; color: #e2e8f0 !important; font-size: 0.9rem !important; line-height: 1.6 !important;" placeholder="生成的续写内容将显示在这里..." wrap="soft"></textarea>
                        </div>
                    </div>
                </div>
                <div class="panel-tab-panel" id="tab-reader" style="display: none !important;">
                    <div class="reader-content" style="padding: 20px !important; color: #e2e8f0 !important; font-size: 1rem !important; line-height: 1.8 !important;">
                        <p class="reader-empty-tip" style="text-align: center !important; color: #94a3b8 !important; padding: 60px 20px !important; font-size: 1rem !important;">请先在「章节管理」中解析小说文件</p>
                    </div>
                </div>
            </div>
        `;

        // 组装DOM
        this.root.appendChild(this.ball);
        this.root.appendChild(this.panel);
        document.body.appendChild(this.root);

        console.log('[Verification] 悬浮球DOM创建完成，已append到document.body');
    },

    // 初始化，对齐Cola的init流程
    init() {
        if (this.isInited) {
            console.log('[Verification] 悬浮球已初始化，跳过重复执行');
            return;
        }

        try {
            this.create();
            this.bindEvents();
            this.restoreState();
            this.isInited = true;
            console.log('[Verification] 悬浮球全量初始化完成，已强制显示在屏幕右侧');
        } catch (error) {
            console.error('[Verification] 悬浮球初始化失败', error);
            throw error;
        }
    },

    // 绑定事件，对齐Cola的事件处理逻辑
    bindEvents() {
        // 拖动事件，同时支持鼠标和触摸
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

        // 窗口大小变化适配
        window.addEventListener("resize", debounce(this.autoAdsorbEdge.bind(this), 200));
    },

    // 点击外部关闭面板
    outsideClose(e) {
        const isInPanel = e.target.closest("#Verification-panel");
        const isInBall = e.target.closest("#Verification-float-ball");
        if (!isInPanel && !isInBall && this.panel.classList.contains("show")) {
            this.hidePanel();
        }
    },

    // 开始拖动
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

    // 拖动中
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

        // 应用位置，强制行内样式
        this.ball.style.left = `${x}px !important`;
        this.ball.style.top = `${y}px !important`;
        this.ball.style.right = 'auto !important';
        this.ball.style.transform = 'none !important';

        // 保存位置
        if (extension_settings?.[extensionName]?.floatBallState) {
            extension_settings[extensionName].floatBallState.position = { x, y };
            saveSettingsDebounced();
        }
    },

    // 结束拖动
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

    // 自动吸附边缘
    autoAdsorbEdge() {
        const rect = this.ball.getBoundingClientRect();
        const windowWidth = window.innerWidth;
        const centerX = windowWidth / 2;

        if (rect.left < centerX) {
            this.ball.style.left = "10px !important";
        } else {
            this.ball.style.left = `${windowWidth - this.ball.offsetWidth - 10}px !important`;
        }

        this.ball.style.right = "auto !important";
        this.ball.style.transform = "none !important";

        // 保存位置
        const newRect = this.ball.getBoundingClientRect();
        if (extension_settings?.[extensionName]?.floatBallState) {
            extension_settings[extensionName].floatBallState.position = { x: newRect.left, y: newRect.top };
            saveSettingsDebounced();
        }
    },

    // 面板切换
    togglePanel() {
        this.panel.classList.contains("show") ? this.hidePanel() : this.showPanel();
    },

    // 显示面板
    showPanel() {
        this.panel.style.display = 'flex !important';
        this.panel.style.opacity = '1 !important';
        this.panel.style.transform = 'translate(-50%, -50%) scale(1) !important';
        this.panel.classList.add("show");
        if (extension_settings?.[extensionName]?.floatBallState) {
            extension_settings[extensionName].floatBallState.isPanelOpen = true;
            saveSettingsDebounced();
        }
    },

    // 隐藏面板
    hidePanel() {
        this.panel.style.display = 'none !important';
        this.panel.style.opacity = '0 !important';
        this.panel.style.transform = 'translate(-50%, -50%) scale(0.8) !important';
        this.panel.classList.remove("show");
        if (extension_settings?.[extensionName]?.floatBallState) {
            extension_settings[extensionName].floatBallState.isPanelOpen = false;
            saveSettingsDebounced();
        }
    },

    // 切换选项卡
    switchTab(tabId) {
        document.querySelectorAll(".panel-tab-item").forEach(tab => {
            const isActive = tab.dataset.tab === tabId;
            tab.classList.toggle("active", isActive);
            tab.style.background = isActive ? 'linear-gradient(180deg, #6d28d9 0%, #7c3aed 100%) !important' : 'transparent !important';
            tab.style.color = isActive ? 'white !important' : '#94a3b8 !important';
        });
        document.querySelectorAll(".panel-tab-panel").forEach(panel => {
            const isActive = panel.id === tabId;
            panel.classList.toggle("active", isActive);
            panel.style.display = isActive ? 'block !important' : 'none !important';
        });
        if (extension_settings?.[extensionName]?.floatBallState) {
            extension_settings[extensionName].floatBallState.activeTab = tabId;
            saveSettingsDebounced();
        }
    },

    // 恢复状态
    restoreState() {
        if (!extension_settings?.[extensionName]) return;
        const settings = extension_settings[extensionName];
        const floatState = settings.floatBallState || defaultSettings.floatBallState;
        const ballWidth = this.ball.offsetWidth || this.ballSize;
        const ballHeight = this.ball.offsetHeight || this.ballSize;
        const maxX = window.innerWidth - ballWidth;
        const maxY = window.innerHeight - ballHeight;

        // 无效位置兜底
        let safeX = floatState.position.x;
        let safeY = floatState.position.y;
        if (isNaN(safeX) || isNaN(safeY) || safeX <= 0 || safeY <= 0 || safeX > maxX || safeY > maxY) {
            safeX = window.innerWidth - ballWidth - 20;
            safeY = window.innerHeight / 2 - ballHeight / 2;
        }

        safeX = Math.max(0, Math.min(safeX, maxX));
        safeY = Math.max(0, Math.min(safeY, maxY));

        // 应用位置
        this.ball.style.left = `${safeX}px !important`;
        this.ball.style.top = `${safeY}px !important`;
        this.ball.style.right = "auto !important";
        this.ball.style.transform = "none !important";

        // 恢复其他状态
        this.switchTab(floatState.activeTab);
        if (floatState.isPanelOpen) this.showPanel();

        // 保存修正后的位置
        settings.floatBallState.position = { x: safeX, y: safeY };
        saveSettingsDebounced();
    },

    // 销毁方法
    destroy() {
        if (this.root) {
            document.body.removeChild(this.root);
        }
        this.isInited = false;
        this.ball = null;
        this.panel = null;
        this.root = null;
        console.log('[Verification] 悬浮球已销毁');
    }
};
