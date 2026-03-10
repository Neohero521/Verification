// 【Verification悬浮球核心】彻底修复拖拽、点击问题，严格对齐Cola仓库floating-ball.js
import { extension_settings, saveSettingsDebounced, defaultSettings, extensionName } from './config.js';
import { debounce } from './utils.js';

// 单例模式，防止重复初始化
export const FloatBall = {
    isInited: false,
    ball: null,
    panel: null,
    root: null,
    closeBtn: null,
    tabItems: [],
    isDragging: false,
    isClick: false,
    startPos: { x: 0, y: 0 },
    offset: { x: 0, y: 0 },
    minMoveDistance: 5,
    ballSize: 70,
    zIndex: 9999999,

    // 核心：动态创建DOM，100%隔离，不依赖外部文件
    create() {
        console.log('[Verification FloatBall] 开始创建DOM元素');
        // 根容器，完全隔离，不影响页面
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

        // 悬浮球核心：行内样式兜底，CSS不加载也能正常显示
        this.ball = document.createElement('div');
        this.ball.id = 'Verification-float-ball';
        this.ball.className = 'Verification-float-ball';
        // 【修复】用setProperty设置带!important的样式，直接赋值无效
        this.ball.style.setProperty('position', 'fixed', 'important');
        this.ball.style.setProperty('right', '20px', 'important');
        this.ball.style.setProperty('top', '50%', 'important');
        this.ball.style.setProperty('transform', 'translateY(-50%)', 'important');
        this.ball.style.setProperty('width', `${this.ballSize}px`, 'important');
        this.ball.style.setProperty('height', `${this.ballSize}px`, 'important');
        this.ball.style.setProperty('border-radius', '999px', 'important');
        this.ball.style.setProperty('background', 'linear-gradient(135deg, #6d28d9 0%, #7c3aed 50%, #06b6d4 100%)', 'important');
        this.ball.style.setProperty('box-shadow', '0 0 25px rgba(124, 58, 237, 0.7), 0 4px 15px rgba(0, 0, 0, 0.5)', 'important');
        this.ball.style.setProperty('display', 'flex', 'important');
        this.ball.style.setProperty('flex-direction', 'column', 'important');
        this.ball.style.setProperty('align-items', 'center', 'important');
        this.ball.style.setProperty('justify-content', 'center', 'important');
        this.ball.style.setProperty('cursor', 'pointer', 'important');
        this.ball.style.setProperty('z-index', `${this.zIndex}`, 'important');
        this.ball.style.setProperty('transition', 'all 0.3s ease', 'important');
        this.ball.style.setProperty('user-select', 'none', 'important');
        this.ball.style.setProperty('border', '2px solid rgba(255, 255, 255, 0.1)', 'important');
        this.ball.style.setProperty('visibility', 'visible', 'important');
        this.ball.style.setProperty('opacity', '1', 'important');
        this.ball.style.setProperty('touch-action', 'none', 'important');
        this.ball.style.setProperty('-webkit-user-select', 'none', 'important');
        // 悬浮球内部内容
        this.ball.innerHTML = `
            <div style="font-size: 1.5rem !important; color: white !important; margin-bottom: 2px !important; line-height: 1 !important;">📖</div>
            <div style="font-size: 0.7rem !important; color: white !important; font-weight: 600 !important; text-align: center !important; line-height: 1 !important;">小说续写</div>
        `;

        // 功能面板：行内样式兜底，点击必显示
        this.panel = document.createElement('div');
        this.panel.id = 'Verification-panel';
        this.panel.className = 'Verification-panel';
        this.panel.style.setProperty('position', 'fixed', 'important');
        this.panel.style.setProperty('top', '50%', 'important');
        this.panel.style.setProperty('left', '50%', 'important');
        this.panel.style.setProperty('transform', 'translate(-50%, -50%) scale(0.8)', 'important');
        this.panel.style.setProperty('width', '900px', 'important');
        this.panel.style.setProperty('height', '850px', 'important');
        this.panel.style.setProperty('max-width', '95vw', 'important');
        this.panel.style.setProperty('max-height', '95vh', 'important');
        this.panel.style.setProperty('background', 'linear-gradient(135deg, #0c0c18 0%, #101022 100%)', 'important');
        this.panel.style.setProperty('border', '1px solid #334155', 'important');
        this.panel.style.setProperty('border-radius', '16px', 'important');
        this.panel.style.setProperty('box-shadow', '0 8px 32px rgba(0, 0, 0, 0.6), 0 0 60px rgba(0, 0, 0, 0.8)', 'important');
        this.panel.style.setProperty('display', 'none', 'important');
        this.panel.style.setProperty('flex-direction', 'column', 'important');
        this.panel.style.setProperty('overflow', 'hidden', 'important');
        this.panel.style.setProperty('z-index', `${this.zIndex - 1}`, 'important');
        this.panel.style.setProperty('opacity', '0', 'important');
        this.panel.style.setProperty('transition', 'all 0.3s ease', 'important');
        this.panel.style.setProperty('font-family', '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', 'important');
        // 面板内部HTML，完整功能
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

        // 组装DOM，先append到root，再append到body
        this.root.appendChild(this.ball);
        this.root.appendChild(this.panel);
        document.body.appendChild(this.root);

        // 【修复】从root内查询元素，避免全局冲突，确保找到正确的元素
        this.closeBtn = this.root.querySelector('#panel-close-btn');
        this.tabItems = this.root.querySelectorAll('.panel-tab-item');
        console.log('[Verification FloatBall] DOM创建完成，元素查询成功', {
            ball: this.ball,
            panel: this.panel,
            closeBtn: this.closeBtn,
            tabItems: this.tabItems
        });
    },

    // 【修复】用箭头函数绑定事件，确保this指向正确，不会丢失
    init() {
        if (this.isInited) {
            console.log('[Verification FloatBall] 已初始化，跳过重复执行');
            return;
        }

        try {
            this.create();
            this.bindEvents();
            this.restoreState();
            this.isInited = true;
            // 挂载到window，方便用户控制台调试
            window.VerificationFloatBall = this;
            console.log('[Verification FloatBall] 初始化完成！已挂载到window.VerificationFloatBall');
            toastr.success('悬浮球初始化完成', 'Verification插件');
        } catch (error) {
            console.error('[Verification FloatBall] 初始化失败', error);
            toastr.error('悬浮球初始化失败，详情查看控制台', 'Verification插件');
            throw error;
        }
    },

    // 【修复】事件绑定全用箭头函数，确保this指向正确，每个事件加日志
    bindEvents() {
        console.log('[Verification FloatBall] 开始绑定事件');
        // 拖动事件：鼠标+触摸，全兼容
        this.ball.addEventListener("mousedown", (e) => this.startDrag(e));
        document.addEventListener("mousemove", (e) => this.onDrag(e));
        document.addEventListener("mouseup", (e) => this.stopDrag(e));
        this.ball.addEventListener("touchstart", (e) => this.startDrag(e), { passive: false });
        document.addEventListener("touchmove", (e) => this.onDrag(e), { passive: false });
        document.addEventListener("touchend", (e) => this.stopDrag(e));

        // 关闭按钮事件
        if (this.closeBtn) {
            this.closeBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                console.log('[Verification FloatBall] 点击关闭按钮');
                this.hidePanel();
            });
        }

        // 选项卡切换事件
        if (this.tabItems.length > 0) {
            this.tabItems.forEach(tab => {
                tab.addEventListener("click", (e) => {
                    e.stopPropagation();
                    const tabId = e.currentTarget.dataset.tab;
                    console.log('[Verification FloatBall] 切换选项卡', tabId);
                    this.switchTab(tabId);
                });
            });
        }

        // 点击外部关闭面板
        document.addEventListener("click", (e) => this.outsideClose(e));

        // 窗口大小变化适配
        window.addEventListener("resize", debounce(() => this.autoAdsorbEdge(), 200));

        console.log('[Verification FloatBall] 事件绑定完成');
    },

    // 点击外部关闭面板
    outsideClose(e) {
        const isInPanel = e.target.closest('#Verification-panel');
        const isInBall = e.target.closest('#Verification-float-ball');
        if (!isInPanel && !isInBall && this.panel.style.display === 'flex') {
            console.log('[Verification FloatBall] 点击外部，关闭面板');
            this.hidePanel();
        }
    },

    // 【修复】开始拖动，加日志，确保事件触发
    startDrag(e) {
        e.preventDefault();
        e.stopPropagation();
        console.log('[Verification FloatBall] 开始拖动/点击', e.type);
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

    // 【修复】拖动中，用setProperty设置样式，确保位置生效，加日志
    onDrag(e) {
        if (!this.ball.classList.contains("dragging")) return;

        const clientX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
        const clientY = e.type.includes('touch') ? e.touches[0].clientY : e.clientY;
        const moveX = Math.abs(clientX - this.startPos.x);
        const moveY = Math.abs(clientY - this.startPos.y);

        // 区分点击和拖动
        if (moveX > this.minMoveDistance || moveY > this.minMoveDistance) {
            this.isClick = false;
            this.isDragging = true;
        }

        if (!this.isDragging) return;
        console.log('[Verification FloatBall] 拖动中', { clientX, clientY });

        // 计算安全位置
        let x = clientX - this.offset.x;
        let y = clientY - this.offset.y;
        const maxX = window.innerWidth - this.ball.offsetWidth;
        const maxY = window.innerHeight - this.ball.offsetHeight;
        x = Math.max(0, Math.min(x, maxX));
        y = Math.max(0, Math.min(y, maxY));

        // 【修复】用setProperty设置带!important的样式，确保生效
        this.ball.style.setProperty('left', `${x}px`, 'important');
        this.ball.style.setProperty('top', `${y}px`, 'important');
        this.ball.style.setProperty('right', 'auto', 'important');
        this.ball.style.setProperty('transform', 'none', 'important');

        // 保存位置
        try {
            if (extension_settings?.[extensionName]?.floatBallState) {
                extension_settings[extensionName].floatBallState.position = { x, y };
                saveSettingsDebounced();
            }
        } catch (error) {
            console.warn('[Verification FloatBall] 保存位置失败', error);
        }
    },

    // 结束拖动，加日志
    stopDrag(e) {
        if (!this.ball.classList.contains("dragging")) return;
        console.log('[Verification FloatBall] 结束拖动/点击', { isClick: this.isClick, isDragging: this.isDragging });

        this.ball.classList.remove("dragging");

        // 点击事件：未拖动则切换面板
        if (this.isClick && !this.isDragging) {
            this.togglePanel();
        }

        // 拖动结束：自动吸附边缘
        if (this.isDragging) {
            this.autoAdsorbEdge();
        }

        // 重置状态
        this.isDragging = false;
        this.isClick = false;
    },

    // 自动吸附边缘，用setProperty设置样式
    autoAdsorbEdge() {
        const rect = this.ball.getBoundingClientRect();
        const windowWidth = window.innerWidth;
        const centerX = windowWidth / 2;

        // 吸附到左右边缘
        let targetX = rect.left < centerX ? 10 : windowWidth - this.ball.offsetWidth - 10;
        this.ball.style.setProperty('left', `${targetX}px`, 'important');
        this.ball.style.setProperty('right', 'auto', 'important');
        this.ball.style.setProperty('transform', 'none', 'important');

        // 保存位置
        try {
            const newRect = this.ball.getBoundingClientRect();
            if (extension_settings?.[extensionName]?.floatBallState) {
                extension_settings[extensionName].floatBallState.position = { x: newRect.left, y: newRect.top };
                saveSettingsDebounced();
            }
        } catch (error) {
            console.warn('[Verification FloatBall] 保存吸附位置失败', error);
        }
    },

    // 【修复】面板切换，统一用style，不用class，避免冲突，加日志
    togglePanel() {
        const isShow = this.panel.style.display === 'flex';
        console.log('[Verification FloatBall] 切换面板', isShow ? '关闭' : '打开');
        isShow ? this.hidePanel() : this.showPanel();
    },

    // 显示面板，统一用style设置，必显示
    showPanel() {
        this.panel.style.setProperty('display', 'flex', 'important');
        this.panel.style.setProperty('opacity', '1', 'important');
        this.panel.style.setProperty('transform', 'translate(-50%, -50%) scale(1)', 'important');
        // 保存状态
        try {
            if (extension_settings?.[extensionName]?.floatBallState) {
                extension_settings[extensionName].floatBallState.isPanelOpen = true;
                saveSettingsDebounced();
            }
        } catch (error) {
            console.warn('[Verification FloatBall] 保存面板状态失败', error);
        }
        console.log('[Verification FloatBall] 面板已打开');
    },

    // 隐藏面板，统一用style设置
    hidePanel() {
        this.panel.style.setProperty('display', 'none', 'important');
        this.panel.style.setProperty('opacity', '0', 'important');
        this.panel.style.setProperty('transform', 'translate(-50%, -50%) scale(0.8)', 'important');
        // 保存状态
        try {
            if (extension_settings?.[extensionName]?.floatBallState) {
                extension_settings[extensionName].floatBallState.isPanelOpen = false;
                saveSettingsDebounced();
            }
        } catch (error) {
            console.warn('[Verification FloatBall] 保存面板状态失败', error);
        }
        console.log('[Verification FloatBall] 面板已关闭');
    },

    // 切换选项卡，用style设置显示隐藏，加日志
    switchTab(tabId) {
        // 切换选项卡样式
        this.tabItems.forEach(tab => {
            const isActive = tab.dataset.tab === tabId;
            tab.classList.toggle("active", isActive);
            tab.style.setProperty('background', isActive ? 'linear-gradient(180deg, #6d28d9 0%, #7c3aed 100%)' : 'transparent', 'important');
            tab.style.setProperty('color', isActive ? 'white' : '#94a3b8', 'important');
        });

        // 切换面板显示
        const allPanels = this.root.querySelectorAll('.panel-tab-panel');
        allPanels.forEach(panel => {
            const isActive = panel.id === tabId;
            panel.style.setProperty('display', isActive ? 'block' : 'none', 'important');
        });

        // 保存状态
        try {
            if (extension_settings?.[extensionName]?.floatBallState) {
                extension_settings[extensionName].floatBallState.activeTab = tabId;
                saveSettingsDebounced();
            }
        } catch (error) {
            console.warn('[Verification FloatBall] 保存选项卡状态失败', error);
        }
    },

    // 恢复状态，加容错
    restoreState() {
        try {
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
            this.ball.style.setProperty('left', `${safeX}px`, 'important');
            this.ball.style.setProperty('top', `${safeY}px`, 'important');
            this.ball.style.setProperty('right', 'auto', 'important');
            this.ball.style.setProperty('transform', 'none', 'important');

            // 恢复其他状态
            this.switchTab(floatState.activeTab);
            if (floatState.isPanelOpen) this.showPanel();

            // 保存修正后的位置
            settings.floatBallState.position = { x: safeX, y: safeY };
            saveSettingsDebounced();
            console.log('[Verification FloatBall] 状态恢复完成');
        } catch (error) {
            console.error('[Verification FloatBall] 恢复状态失败', error);
        }
    },

    // 强制显示方法，控制台可调用
    forceShow() {
        this.ball.style.setProperty('display', 'flex', 'important');
        this.ball.style.setProperty('visibility', 'visible', 'important');
        this.ball.style.setProperty('opacity', '1', 'important');
        this.ball.style.setProperty('z-index', '9999999', 'important');
        console.log('[Verification FloatBall] 已强制显示悬浮球');
    },

    // 强制重新绑定事件，控制台可调用
    forceBindEvents() {
        this.bindEvents();
        console.log('[Verification FloatBall] 已强制重新绑定事件');
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
        window.VerificationFloatBall = null;
        console.log('[Verification FloatBall] 已销毁');
    }
};
