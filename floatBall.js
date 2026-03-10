import { extension_settings, saveSettingsDebounced, defaultSettings, extensionName } from './config.js';
import { debounce } from './utils.js';

// 单例模式，对齐Cola的悬浮球实现，防止重复初始化
export const FloatBall = {
    isInited: false,
    ball: null,
    panel: null,
    root: null,
    isDragging: false,
    isClick: false,
    startPos: { x: 0, y: 0 },
    offset: { x: 0, y: 0 },
    minMoveDistance: 5, // 对齐Cola的拖动阈值，避免误触
    ballSize: 70,
    zIndex: 9999999, // 比Cola更高，确保在ST所有元素之上

    // 核心：动态创建DOM，不依赖外部HTML文件，彻底解决加载失败问题
    create() {
        // 根容器，对齐Cola的隔离实现
        this.root = document.createElement('div');
        this.root.className = 'novel-writer-extension-root';
        this.root.id = 'novel-writer-extension-root';
        this.root.style.zIndex = this.zIndex;

        // 悬浮球DOM，对齐Cola的结构
        this.ball = document.createElement('div');
        this.ball.id = 'novel-writer-float-ball';
        this.ball.className = 'float-ball';
        this.ball.innerHTML = `
            <div class="ball-icon">📖</div>
            <div class="ball-tip">小说续写</div>
        `;
        this.ball.style.zIndex = this.zIndex + 1;

        // 面板DOM，对齐Cola的面板结构
        this.panel = document.createElement('div');
        this.panel.id = 'novel-writer-panel';
        this.panel.className = 'writer-panel';
        this.panel.style.zIndex = this.zIndex;
        // 面板HTML内容，原example.html的核心内容内置，彻底不依赖外部文件
        this.panel.innerHTML = `
            <div class="panel-header">
                <div class="panel-title">
                    <span>📖</span>
                    <span>小说智能续写系统</span>
                </div>
                <button id="panel-close-btn" class="panel-close-btn">✕</button>
            </div>
            <div class="panel-tab-nav">
                <div class="panel-tab-item active" data-tab="tab-chapter">
                    <span>📋</span>
                    <span>章节管理</span>
                </div>
                <div class="panel-tab-item" data-tab="tab-graph">
                    <span>🧠</span>
                    <span>知识图谱</span>
                </div>
                <div class="panel-tab-item" data-tab="tab-write">
                    <span>✒️</span>
                    <span>内容续写</span>
                </div>
                <div class="panel-tab-item" data-tab="tab-reader">
                    <span>📚</span>
                    <span>小说阅读</span>
                </div>
            </div>
            <div class="panel-tab-content">
                <div class="panel-tab-panel active" id="tab-chapter">
                    <div class="content-card card-main">
                        <div class="card-header">
                            <h4><span>📥</span>小说文件解析</h4>
                        </div>
                        <div class="card-body">
                            <div class="file-select-group">
                                <input id="novel-file-upload" type="file" accept=".txt" style="display: none;">
                                <button class="btn btn-primary" id="select-file-btn"><span>📂</span>选择小说TXT文件</button>
                                <span id="file-name-text" class="file-name">未选择文件</span>
                            </div>
                            <div class="grid-row grid-2">
                                <div class="form-group">
                                    <label class="form-label">章节拆分正则（自定义优先）</label>
                                    <input id="chapter-regex-input" type="text" class="form-input" placeholder="请输入章节拆分正则表达式" value="^\\s*第\\s*[0-9零一二三四五六七八九十百千]+\\s*章.*$">
                                    <span class="input-tip">预设支持的章节格式：标准章节、括号序号(01)、第X节、卷X第X章、Chapter X、第X话、数字序号、中英文序号等</span>
                                </div>
                                <div class="form-group">
                                    <label class="form-label">按字数拆分（单章字数1000-10000）</label>
                                    <div class="input-with-tip">
                                        <input id="split-word-count" type="number" min="1000" max="10000" step="100" class="form-input" value="3000">
                                        <span class="input-tip">范围：1000-10000</span>
                                    </div>
                                </div>
                            </div>
                            <div class="grid-row grid-2">
                                <div class="form-group">
                                    <label class="form-label">发送命令模板</label>
                                    <input id="send-template-input" type="text" class="form-input" placeholder="请输入发送命令模板" value="/sendas name={{char}} {{pipe}}">
                                </div>
                                <div class="form-group">
                                    <label class="form-label">发送间隔(ms)</label>
                                    <input id="send-delay-input" type="number" min="0" max="5000" step="10" class="form-input" value="100">
                                </div>
                            </div>
                            <div class="btn-group-row btn-center">
                                <input id="parse-chapter-btn" class="btn btn-primary btn-lg" type="submit" value="解析章节">
                                <input id="split-by-word-btn" class="btn btn-secondary btn-lg" type="submit" value="按字数拆分">
                            </div>
                        </div>
                    </div>
                    <div class="content-card">
                        <div class="card-header">
                            <h4><span>⚙️</span>对话补全预设配置</h4>
                        </div>
                        <div class="card-body">
                            <div class="form-group form-group-inline">
                                <label for="auto-parent-preset-switch" class="form-label">自动使用父级对话预设</label>
                                <input id="auto-parent-preset-switch" type="checkbox" checked />
                                <span class="input-tip">开启后，续写将使用当前对话的生成预设参数</span>
                            </div>
                        </div>
                    </div>
                    <div class="content-card">
                        <div class="card-header card-header-inline">
                            <h4><span>📖</span>章节列表</h4>
                            <div class="btn-group-row">
                                <button class="btn btn-sm btn-outline" id="select-all-btn">全选</button>
                                <button class="btn btn-sm btn-outline" id="unselect-all-btn">取消全选</button>
                                <input id="import-selected-btn" class="btn btn-sm btn-primary" type="submit" value="导入选中章节">
                                <input id="import-all-btn" class="btn btn-sm btn-outline" type="submit" value="导入全部章节">
                                <input id="validate-chapter-graph-btn" class="btn btn-sm btn-secondary" type="submit" value="检验图谱状态">
                                <input id="stop-send-btn" class="btn btn-sm btn-danger" type="submit" value="停止发送" disabled>
                            </div>
                        </div>
                        <div class="progress-wrap">
                            <p id="novel-import-status" class="progress-text"></p>
                            <div class="progress-bar">
                                <div id="novel-import-progress" class="progress-fill"></div>
                            </div>
                        </div>
                        <div id="novel-chapter-list" class="chapter-list">
                            <p class="empty-tip">请上传小说文件并点击「解析章节」</p>
                        </div>
                    </div>
                    <div class="content-card card-mini">
                        <div class="form-group form-group-inline">
                            <input type="checkbox" id="example_setting"/>
                            <label for="example_setting">启用示例配置</label>
                            <input id="my_button" class="btn btn-sm btn-outline" type="submit" value="测试配置">
                        </div>
                    </div>
                </div>
                <div class="panel-tab-panel" id="tab-graph">
                    <div class="content-card card-main">
                        <div class="card-header card-header-inline">
                            <h4><span>🗺️</span>图谱生成</h4>
                            <div class="btn-group-row">
                                <input id="graph-single-btn" class="btn btn-primary" type="submit" value="生成选中章节图谱">
                                <input id="graph-batch-btn" class="btn btn-outline" type="submit" value="批量生成全章节图谱">
                            </div>
                        </div>
                        <div class="progress-wrap">
                            <p id="graph-generate-status" class="progress-text"></p>
                            <div class="progress-bar">
                                <div id="graph-progress" class="progress-fill"></div>
                            </div>
                        </div>
                        <div class="card-body">
                            <div class="btn-group-row btn-group-wrap">
                                <input id="chapter-graph-import-btn" class="btn btn-sm btn-outline" type="submit" value="导入单章节图谱">
                                <input id="chapter-graph-export-btn" class="btn btn-sm btn-secondary" type="submit" value="导出单章节图谱">
                            </div>
                            <input id="chapter-graph-file-upload" type="file" accept=".json" style="display: none;">
                        </div>
                    </div>
                    <div class="divider-line"></div>
                    <div class="content-card">
                        <div class="card-header card-header-inline">
                            <h4><span>📦</span>全量图谱合并</h4>
                            <input id="graph-merge-btn" class="btn btn-primary" type="submit" value="合并已生成的章节图谱">
                        </div>
                    </div>
                    <div class="content-card">
                        <div class="card-header">
                            <h4><span>&lt;/&gt;</span>合并后完整知识图谱</h4>
                        </div>
                        <div class="card-body">
                            <textarea id="merged-graph-preview" rows="8" class="form-textarea" readonly placeholder="合并后的图谱JSON将显示在这里..." wrap="soft" resize="vertical"></textarea>
                            <div class="btn-group-row btn-group-wrap">
                                <input id="graph-validate-btn" class="btn btn-sm btn-outline" type="submit" value="校验图谱合规性">
                                <input id="graph-import-btn" class="btn btn-sm btn-outline" type="submit" value="导入JSON">
                                <input id="graph-copy-btn" class="btn btn-sm btn-secondary" type="submit" value="复制JSON">
                                <input id="graph-export-btn" class="btn btn-sm btn-secondary" type="submit" value="导出JSON文件">
                                <input id="graph-clear-btn" class="btn btn-sm btn-danger" type="submit" value="清空图谱">
                            </div>
                            <input id="graph-file-upload" type="file" accept=".json" style="display: none;">
                        </div>
                    </div>
                    <div class="content-card" id="graph-validate-result" style="display: none;">
                        <div class="card-header">
                            <h4><span>🛡️</span>图谱合规性校验结果</h4>
                        </div>
                        <textarea id="graph-validate-content" rows="3" class="form-textarea" readonly placeholder="校验结果将显示在这里..." wrap="soft"></textarea>
                    </div>
                </div>
                <div class="panel-tab-panel" id="tab-write">
                    <div class="content-card card-main">
                        <div class="card-header">
                            <h4><span>🔖</span>续写基准设置</h4>
                        </div>
                        <div class="card-body">
                            <div class="form-group">
                                <label class="form-label">选择续写基准章节</label>
                                <select id="write-chapter-select" class="form-select">
                                    <option value="">请先解析章节</option>
                                </select>
                            </div>
                            <div class="form-group">
                                <div class="form-label-inline">
                                    <label class="form-label">基准章节内容（可直接编辑修改）</label>
                                    <input id="graph-update-modified-btn" class="btn btn-sm btn-outline" type="submit" value="更新魔改章节图谱">
                                </div>
                                <textarea id="write-chapter-content" rows="7" class="form-textarea" placeholder="请先选择上方的基准章节..." readonly wrap="soft" resize="vertical"></textarea>
                            </div>
                        </div>
                    </div>
                    <div class="inline-drawer" id="drawer-precheck">
                        <div class="inline-drawer-toggle inline-drawer-header">
                            <b><span>🎯</span>续写前置校验与合规边界</b>
                            <div class="inline-drawer-icon down">▼</div>
                        </div>
                        <div class="inline-drawer-content">
                            <div class="drawer-top-row">
                                <span>前置校验状态：<span id="precheck-status" class="status-text status-default">未执行</span></span>
                                <input id="precheck-run-btn" class="btn btn-sm btn-primary" type="submit" value="执行前置校验">
                            </div>
                            <div class="form-group">
                                <label class="form-label">合规边界与校验报告</label>
                                <textarea id="precheck-report" rows="6" class="form-textarea" readonly placeholder="执行前置校验后，将显示人设红线、设定禁区、可呼应伏笔、矛盾预警等内容..." wrap="soft"></textarea>
                            </div>
                        </div>
                    </div>
                    <div class="content-card card-mini">
                        <div class="grid-row grid-2">
                            <div class="form-group">
                                <label class="form-label">续写字数</label>
                                <div class="input-with-tip">
                                    <input id="write-word-count" type="number" min="500" max="10000" step="100" class="form-input" value="2000">
                                    <span class="input-tip">范围：500-10000</span>
                                </div>
                            </div>
                            <div class="form-group form-group-inline">
                                <label for="quality-check-switch" class="form-label">开启续写质量自动校验</label>
                                <input id="quality-check-switch" type="checkbox" checked />
                                <span class="input-tip">不合格自动重写</span>
                            </div>
                        </div>
                    </div>
                    <div class="divider-line"></div>
                    <div class="content-card card-mini">
                        <div class="btn-group-row btn-center">
                            <input id="write-generate-btn" class="btn btn-primary btn-lg" type="submit" value="生成续写章节">
                            <input id="write-stop-btn" class="btn btn-danger btn-lg" type="submit" value="停止生成" disabled>
                        </div>
                        <div class="progress-wrap">
                            <p id="write-status" class="progress-text"></p>
                            <div id="quality-result-block" style="display: none;">
                                <p class="quality-score">质量评估得分：<span id="quality-score">0</span>/100</p>
                                <textarea id="quality-report" rows="3" class="form-textarea" readonly placeholder="质量评估详细报告将显示在这里..." wrap="soft"></textarea>
                            </div>
                        </div>
                    </div>
                    <div class="divider-line"></div>
                    <div class="content-card">
                        <div class="card-header">
                            <h4><span>📝</span>续写生成结果</h4>
                        </div>
                        <div class="card-body">
                            <textarea id="write-content-preview" rows="10" class="form-textarea" placeholder="生成的续写章节内容将显示在这里..." wrap="soft" resize="vertical"></textarea>
                            <div class="btn-group-row btn-group-wrap">
                                <input id="write-copy-btn" class="btn btn-sm btn-secondary" type="submit" value="复制内容">
                                <input id="write-send-btn" class="btn btn-sm btn-primary" type="submit" value="发送到对话框">
                                <input id="write-clear-btn" class="btn btn-sm btn-danger" type="submit" value="清空内容">
                            </div>
                        </div>
                    </div>
                    <div class="divider-line"></div>
                    <div class="content-card">
                        <div class="card-header card-header-inline">
                            <h4><span>🔗</span>续写章节链条（可无限叠加续写）</h4>
                            <input id="clear-chain-btn" class="btn btn-sm btn-danger" type="submit" value="清空所有续写章节">
                        </div>
                        <div id="continue-write-chain" class="chain-container">
                            <p class="empty-tip">暂无续写章节，生成续写内容后自动添加到此处</p>
                        </div>
                    </div>
                </div>
                <div class="panel-tab-panel" id="tab-reader">
                    <div class="reader-header">
                        <div class="reader-title">
                            <span>📖</span>
                            <span id="reader-current-chapter-title">未选择章节</span>
                        </div>
                        <div class="reader-controls">
                            <button class="btn btn-sm btn-outline reader-font-btn" id="reader-font-minus" title="缩小字体">
                                <span>A</span><span>-</span>
                            </button>
                            <button class="btn btn-sm btn-outline reader-font-btn" id="reader-font-plus" title="放大字体">
                                <span>A</span><span>+</span>
                            </button>
                            <button class="btn btn-sm btn-primary" id="reader-chapter-select-btn">
                                <span>📋</span>章节列表
                            </button>
                        </div>
                    </div>
                    <div class="reader-content-wrap">
                        <div class="reader-content" id="reader-content">
                            <p class="reader-empty-tip">请先在「章节管理」中解析小说文件，然后选择章节开始阅读</p>
                        </div>
                        <div class="reader-click-mask" id="reader-click-mask"></div>
                    </div>
                    <div class="reader-footer">
                        <button class="btn btn-sm btn-outline" id="reader-prev-chapter" title="上一章">
                            <span>◀</span>上一章
                        </button>
                        <span id="reader-progress-text">0%</span>
                        <div class="reader-progress-bar">
                            <div class="reader-progress-fill" id="reader-progress-fill"></div>
                        </div>
                        <span id="reader-chapter-count">0/0</span>
                        <button class="btn btn-sm btn-outline" id="reader-next-chapter" title="下一章">
                            下一章 <span>▶</span>
                        </button>
                    </div>
                    <div class="reader-chapter-drawer" id="reader-chapter-drawer">
                        <div class="reader-drawer-header">
                            <h3><span>📋</span>章节列表</h3>
                            <button class="btn btn-sm btn-outline" id="reader-drawer-close">
                                <span>✕</span>关闭
                            </button>
                        </div>
                        <div class="reader-chapter-list" id="reader-chapter-list">
                            <p class="empty-tip">暂无解析的章节，请先在「章节管理」中解析小说</p>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // 组装DOM，对齐Cola的结构
        this.root.appendChild(this.ball);
        this.root.appendChild(this.panel);
        document.body.appendChild(this.root);

        console.log(`[${extensionName}] 悬浮球与面板DOM创建完成`);
    },

    // 初始化，对齐Cola的init流程
    init() {
        // 防止重复初始化，Cola核心防重逻辑
        if (this.isInited) {
            console.log(`[${extensionName}] 悬浮球已初始化，跳过重复执行`);
            return;
        }

        // 先创建DOM
        this.create();

        // 绑定事件
        this.bindEvents();

        // 恢复状态
        this.restoreState();

        // 强制显示，兜底所有样式
        this.forceShow();

        // 标记初始化完成
        this.isInited = true;

        console.log(`[${extensionName}] 悬浮球初始化完成，已强制显示`);
        toastr.success('小说续写悬浮球加载完成', "插件提示");
    },

    // 强制显示，兜底所有样式覆盖问题
    forceShow() {
        this.ball.style.cssText = `
            position: fixed !important;
            right: 20px !important;
            top: 50% !important;
            transform: translateY(-50%) !important;
            width: 70px !important;
            height: 70px !important;
            border-radius: 999px !important;
            background: linear-gradient(135deg, #6d28d9 0%, #7c3aed 50%, #06b6d4 100%) !important;
            box-shadow: 0 0 25px rgba(124, 58, 237, 0.7), 0 4px 15px rgba(0, 0, 0, 0.5) !important;
            display: flex !important;
            flex-direction: column !important;
            align-items: center !important;
            justify-content: center !important;
            cursor: pointer !important;
            z-index: 9999999 !important;
            transition: all 0.3s ease !important;
            user-select: none !important;
            border: 2px solid rgba(255, 255, 255, 0.1) !important;
            visibility: visible !important;
            opacity: 1 !important;
            touch-action: none !important;
        `;
    },

    // 绑定事件，对齐Cola的事件处理逻辑
    bindEvents() {
        // 拖动事件，同时支持鼠标和触摸，对齐Cola的跨端兼容
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

        // 点击外部关闭面板，对齐Cola的交互逻辑
        document.addEventListener("click", this.outsideClose.bind(this));

        // 窗口大小变化适配，防抖避免频繁触发，对齐Cola的优化
        window.addEventListener("resize", debounce(this.autoAdsorbEdge.bind(this), 200));

        // 窗口加载完成后再次校正位置
        window.addEventListener("load", () => {
            this.restoreState();
        });
    },

    // 点击外部关闭面板
    outsideClose(e) {
        const isInPanel = e.target.closest("#novel-writer-panel");
        const isInBall = e.target.closest("#novel-writer-float-ball");
        if (!isInPanel && !isInBall && this.panel.classList.contains("show")) {
            this.hidePanel();
        }
    },

    // 开始拖动，对齐Cola的拖动起始逻辑
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

    // 拖动中，对齐Cola的边界检测逻辑
    onDrag(e) {
        if (!this.ball.classList.contains("dragging")) return;

        const clientX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
        const clientY = e.type.includes('touch') ? e.touches[0].clientY : e.clientY;
        const moveX = Math.abs(clientX - this.startPos.x);
        const moveY = Math.abs(clientY - this.startPos.y);

        // 区分点击和拖动，超过阈值才判定为拖动
        if (moveX > this.minMoveDistance || moveY > this.minMoveDistance) {
            this.isClick = false;
            this.isDragging = true;
        }

        if (!this.isDragging) return;

        // 计算位置
        let x = clientX - this.offset.x;
        let y = clientY - this.offset.y;

        // 边界检测，确保不拖出屏幕，对齐Cola的边界逻辑
        const maxX = window.innerWidth - this.ball.offsetWidth;
        const maxY = window.innerHeight - this.ball.offsetHeight;
        x = Math.max(0, Math.min(x, maxX));
        y = Math.max(0, Math.min(y, maxY));

        // 应用位置
        this.ball.style.left = `${x}px !important`;
        this.ball.style.top = `${y}px !important`;
        this.ball.style.right = 'auto !important';
        this.ball.style.transform = 'none !important';

        // 保存位置
        extension_settings.Verification.floatBallState.position = { x, y };
        saveSettingsDebounced();
    },

    // 结束拖动，对齐Cola的结束逻辑
    stopDrag(e) {
        if (!this.ball.classList.contains("dragging")) return;

        this.ball.classList.remove("dragging");

        // 点击事件，未拖动则触发面板切换
        if (this.isClick && !this.isDragging) {
            this.togglePanel();
        }

        // 拖动结束，自动吸附边缘
        if (this.isDragging) {
            this.autoAdsorbEdge();
        }

        // 重置状态
        this.isDragging = false;
        this.isClick = false;
    },

    // 自动吸附边缘，对齐Cola的吸附逻辑
    autoAdsorbEdge() {
        const rect = this.ball.getBoundingClientRect();
        const windowWidth = window.innerWidth;
        const centerX = windowWidth / 2;

        // 吸附到左右边缘
        if (rect.left < centerX) {
            this.ball.style.left = "10px !important";
        } else {
            this.ball.style.left = `${windowWidth - this.ball.offsetWidth - 10}px !important`;
        }

        this.ball.style.right = "auto !important";
        this.ball.style.transform = "none !important";

        // 保存吸附后的位置
        const newRect = this.ball.getBoundingClientRect();
        extension_settings.Verification.floatBallState.position = { x: newRect.left, y: newRect.top };
        saveSettingsDebounced();
    },

    // 面板切换
    togglePanel() {
        this.panel.classList.contains("show") ? this.hidePanel() : this.showPanel();
    },

    // 显示面板
    showPanel() {
        this.panel.classList.add("show");
        extension_settings.Verification.floatBallState.isPanelOpen = true;
        saveSettingsDebounced();
    },

    // 隐藏面板
    hidePanel() {
        this.panel.classList.remove("show");
        extension_settings.Verification.floatBallState.isPanelOpen = false;
        saveSettingsDebounced();
    },

    // 切换选项卡
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

    // 恢复状态，对齐Cola的状态恢复逻辑
    restoreState() {
        const settings = extension_settings.Verification;
        const floatState = settings.floatBallState || defaultSettings.floatBallState;
        const ballWidth = this.ball.offsetWidth || 70;
        const ballHeight = this.ball.offsetHeight || 70;
        const maxX = window.innerWidth - ballWidth;
        const maxY = window.innerHeight - ballHeight;

        // 无效位置兜底，默认放到屏幕右侧垂直居中，对齐Cola的默认位置
        let safeX = floatState.position.x;
        let safeY = floatState.position.y;
        if (isNaN(safeX) || isNaN(safeY) || safeX <= 0 || safeY <= 0 || safeX > maxX || safeY > maxY) {
            safeX = window.innerWidth - ballWidth - 20;
            safeY = window.innerHeight / 2 - ballHeight / 2;
        }

        // 安全范围限制
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
        extension_settings.Verification.floatBallState.position = { x: safeX, y: safeY };
        saveSettingsDebounced();
    },

    // 销毁方法，对齐Cola的生命周期
    destroy() {
        if (this.root) {
            document.body.removeChild(this.root);
        }
        this.isInited = false;
        this.ball = null;
        this.panel = null;
        this.root = null;
        console.log(`[${extensionName}] 悬浮球已销毁`);
    }
};
