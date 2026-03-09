// 严格遵循官方模板导入规范，路径完全对齐原版本
import { extension_settings, getContext, loadExtensionSettings } from "../../../extensions.js";
import { saveSettingsDebounced } from "../../../../script.js";
const extensionName = "Always_remember_me";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;

// 【扩展优化】章节拆分正则预设库（覆盖主流+冷门格式，新增用户需求格式）
const chapterRegexPresets = [
    { label: "标准章节（第X章）", value: "^\\s*第\\s*[0-9零一二三四五六七八九十百千]+\\s*章.*$" },
    { label: "卷+章节双匹配", value: "^\\s*第\\s*[0-9零一二三四五六七八九十百千]+\\s*卷.*$|^\\s*第\\s*[0-9零一二三四五六七八九十百千]+\\s*章.*$" },
    { label: "古典回体（第X回）", value: "^\\s*第\\s*[0-9零一二三四五六七八九十百千]+\\s*回.*$" },
    { label: "节体格式（第X节）", value: "^\\s*第\\s*[0-9零一二三四五六七八九十百千]+\\s*节.*$" },
    { label: "漫画/轻小说（第X话）", value: "^\\s*第\\s*[0-9零一二三四五六七八九十百千]+\\s*话.*$" },
    { label: "数字点开头（1. 标题）", value: "^\\s*\\d+\\.\\s.*$" },
    { label: "纯数字章节", value: "^\\s*\\d+\\s*$" },
    { label: "番外/外传匹配", value: "^\\s*番外.*$|^\\s*外传.*$|^\\s*后记.*$|^\\s*前言.*$" },
    // 【新增】用户需求&冷门格式正则
    { label: "括号数字结尾（xxx（01））", value: ".*\\（\\s*\\d+\\s*\\）\\s*$" },
    { label: "括号数字开头（（01）xxx）", value: "^\\s*\\（\\s*\\d+\\s*\\）.*$" },
    { label: "方括号数字开头（【01】xxx）", value: "^\\s*【\\s*\\d+\\s*】.*$" },
    { label: "英文章节（Chapter 01）", value: "^\\s*Chapter\\s*\\d+.*$|^\\s*CH\\s*\\d+.*$" },
    { label: "英文剧集（Episode 01）", value: "^\\s*Episode\\s*\\d+.*$|^\\s*EP\\s*\\d+.*$|^\\s*Act\\s*\\d+.*$" },
    { label: "卷章双级带点（1.1 标题）", value: "^\\s*\\d+\\.\\d+\\s.*$" },
    { label: "中文数字带括号（第（一）章）", value: "^\\s*第\\s*\\（[零一二三四五六七八九十百千]+\\）\\s*章.*$" },
    { label: "无第字章节（一章/一回）", value: "^\\s*[零一二三四五六七八九十百千]+\\s*[章回节话].*$" },
    { label: "序号横杠分隔（xxx - 01 -）", value: ".*-\\s*\\d+\\s*-.*$" },
    { label: "纯中文数字顿号（一、标题）", value: "^\\s*[零一二三四五六七八九十百千]+\\、.*$" },
    { label: "万字开头章节（xxx第X章）", value: "^\\s*.*第\\s*\\d+\\s*章.*$" }
];

// 默认配置（原有字段100%保留，新增字段仅追加，完全兼容旧数据）
const defaultSettings = {
    chapterRegex: "^\\s*第\\s*[0-9零一二三四五六七八九十百千]+\\s*章.*$",
    sendTemplate: "/sendas name={{char}} {{pipe}}",
    sendDelay: 100,
    example_setting: false,
    chapterList: [],
    chapterGraphMap: {},
    mergedGraph: {},
    continueWriteChain: [],
    continueChapterIdCounter: 1,
    enableQualityCheck: true,
    precheckReport: {},
    drawerState: {
        "drawer-chapter-import": true,
        "drawer-graph": false,
        "drawer-write": false,
        "drawer-precheck": false
    },
    selectedBaseChapterId: "",
    writeContentPreview: "",
    graphValidateResultShow: false,
    qualityResultShow: false,
    precheckStatus: "未执行",
    precheckReportText: "",
    floatBallState: {
        position: { x: window.innerWidth - 90, y: window.innerHeight / 2 },
        isPanelOpen: false,
        activeTab: "tab-chapter"
    },
    readerState: {
        fontSize: 16,
        currentChapterId: null,
        currentChapterType: "original",
        readProgress: {}
    },
    // 原有新增字段保留
    splitMode: "regex",
    splitWordCount: 3000,
    // 【本次优化新增】配置项
    minChapterGraphWordCount: 200, // 图谱有效最小章节字数，低于此值视为无效
    currentRegexPresetIndex: -1 // 自动正则解析当前索引
};

// 全局状态缓存（原有字段完全不变，新增仅追加）
let currentParsedChapters = [];
let isGeneratingGraph = false;
let isGeneratingWrite = false;
let stopGenerateFlag = false;
let isSending = false;
let stopSending = false;
let continueWriteChain = [];
let continueChapterIdCounter = 1;
let currentPrecheckResult = null;
let isInitialized = false;
let chapterCheckedState = new Map();
// 【本次优化新增】全局状态
let sortedRegexPresets = []; // 自动排序后的正则预设缓存
let currentUploadedNovelText = ""; // 当前上传的小说文本缓存

// 防抖工具函数（修复箭头函数语法错误）
function debounce(func, delay) {
    let timer = null;
    return function(...args) {
        clearTimeout(timer);
        timer = setTimeout(() => func.apply(this, args), delay);
    };
}
// 递归深拷贝合并配置（修复深层默认值丢失BUG）
function deepMerge(target, source) {
    const merged = { ...target };
    for (const key in source) {
        if (Object.prototype.hasOwnProperty.call(source, key)) {
            if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
                merged[key] = deepMerge(merged[key] || {}, source[key]);
            } else if (Array.isArray(source[key])) {
                merged[key] = Array.isArray(merged[key]) ? [...merged[key]] : [...source[key]];
            } else {
                merged[key] = merged[key] !== undefined ? merged[key] : source[key];
            }
        }
    }
    return merged;
}

// ==============================================
// 可移动悬浮球核心模块（修复箭头函数语法+拖动逻辑）
// ==============================================
const FloatBall = {
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
        this.ball.removeEventListener("mousedown", this.startDrag.bind(this));
        document.removeEventListener("mousemove", this.onDrag.bind(this));
        document.removeEventListener("mouseup", this.stopDrag.bind(this));
        this.ball.removeEventListener("touchstart", this.startDrag.bind(this));
        document.removeEventListener("touchmove", this.onDrag.bind(this));
        document.removeEventListener("touchend", this.stopDrag.bind(this));

        this.ball.addEventListener("mousedown", this.startDrag.bind(this));
        document.addEventListener("mousemove", this.onDrag.bind(this));
        document.addEventListener("mouseup", this.stopDrag.bind(this));
        this.ball.addEventListener("touchstart", this.startDrag.bind(this), { passive: false });
        document.addEventListener("touchmove", this.onDrag.bind(this), { passive: false });
        document.addEventListener("touchend", this.stopDrag.bind(this));

        const closeBtn = document.getElementById("panel-close-btn");
        closeBtn.removeEventListener("click", this.hidePanel.bind(this));
        closeBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            this.hidePanel();
        });

        document.querySelectorAll(".panel-tab-item").forEach(tab => {
            tab.removeEventListener("click", this.switchTab.bind(this));
            tab.addEventListener("click", (e) => {
                e.stopPropagation();
                this.switchTab(e.currentTarget.dataset.tab);
            });
        });

        document.removeEventListener("click", this.outsideClose.bind(this));
        document.addEventListener("click", this.outsideClose.bind(this));
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
    resizeHandler: debounce(function() {
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
        if (moveX >= this.minMoveDistance || moveY >= this.minMoveDistance) {
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
        this.ball.style.transform = "translateY(-50%)";
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

// ==============================================
// 小说阅读器核心模块（修复箭头函数语法+标签闭合BUG）
// ==============================================
const NovelReader = {
    currentChapterId: null,
    currentChapterType: "original",
    fontSize: 16,
    maxFontSize: 24,
    minFontSize: 12,
    isPageTurning: false,
    globalPageCooldown: false,
    isProgrammaticScroll: false,
    cooldownTime: 3000,
    scrollDebounceTime: 200,
    scrollDebounceTimer: null,
    safeScrollOffset: 350,
    pageTriggerThreshold: 250,
    debounce(func, delay) {
        return (...args) => {
            clearTimeout(this.scrollDebounceTimer);
            this.scrollDebounceTimer = setTimeout(() => {
                func.apply(this, args);
            }, delay);
        };
    },
    setGlobalCooldown() {
        this.globalPageCooldown = true;
        setTimeout(() => {
            this.globalPageCooldown = false;
        }, this.cooldownTime);
    },
    init() {
        this.bindEvents();
        this.restoreState();
    },
    bindEvents() {
        const fontMinus = document.getElementById("reader-font-minus");
        const fontPlus = document.getElementById("reader-font-plus");
        const chapterSelectBtn = document.getElementById("reader-chapter-select-btn");
        const drawerClose = document.getElementById("reader-drawer-close");
        const prevChapter = document.getElementById("reader-prev-chapter");
        const nextChapter = document.getElementById("reader-next-chapter");
        const contentWrap = document.querySelector(".reader-content-wrap");
        const contentEl = document.getElementById("reader-content");
        const drawerEl = document.getElementById("reader-chapter-drawer");

        fontMinus.removeEventListener("click", this.setFontSize.bind(this, this.fontSize - 1));
        fontPlus.removeEventListener("click", this.setFontSize.bind(this, this.fontSize + 1));
        chapterSelectBtn.removeEventListener("click", this.showChapterDrawer.bind(this));
        drawerClose.removeEventListener("click", this.hideChapterDrawer.bind(this));
        prevChapter.removeEventListener("click", this.loadPrevChapter.bind(this));
        nextChapter.removeEventListener("click", this.loadNextChapter.bind(this));

        fontMinus.addEventListener("click", (e) => {
            e.stopPropagation();
            this.setFontSize(this.fontSize - 1);
        });
        fontPlus.addEventListener("click", (e) => {
            e.stopPropagation();
            this.setFontSize(this.fontSize + 1);
        });
        chapterSelectBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            this.showChapterDrawer();
        });
        drawerClose.addEventListener("click", (e) => {
            e.stopPropagation();
            this.hideChapterDrawer();
        });
        prevChapter.addEventListener("click", (e) => {
            e.stopPropagation();
            this.loadPrevChapter();
        });
        nextChapter.addEventListener("click", (e) => {
            e.stopPropagation();
            this.loadNextChapter();
        });

        contentWrap.addEventListener("click", (e) => {
            if (e.target.closest(".reader-content") || e.target.closest(".reader-controls") || e.target.closest(".reader-footer") || e.target.closest(".reader-chapter-drawer") || e.target.closest(".btn")) {
                return;
            }
            this.toggleChapterDrawer();
        });
        contentEl.addEventListener("scroll", (e) => {
            if (this.isProgrammaticScroll) {
                e.stopPropagation();
                return;
            }
            e.stopPropagation();
            this.updateProgressOnly();
        }, { passive: true });
        contentEl.addEventListener("wheel", (e) => {
            e.stopPropagation();
        }, { passive: true });
        contentEl.addEventListener("touchmove", (e) => {
            e.stopPropagation();
        }, { passive: true });
        drawerEl.addEventListener("click", (e) => {
            e.stopPropagation();
            e.stopImmediatePropagation();
        });
        drawerEl.addEventListener("scroll", (e) => {
            e.stopPropagation();
        });
    },
    updateProgressOnly() {
        if (this.isPageTurning || this.isProgrammaticScroll) return;
        const contentEl = document.getElementById("reader-content");
        const progressEl = document.getElementById("reader-progress-fill");
        const progressTextEl = document.getElementById("reader-progress-text");
        const scrollTop = contentEl.scrollTop;
        const scrollHeight = contentEl.scrollHeight;
        const clientHeight = contentEl.clientHeight;
        const maxScrollTop = scrollHeight - clientHeight;
        if (maxScrollTop <= 0) {
            progressEl.style.width = `100%`;
            progressTextEl.textContent = `100%`;
            return;
        }
        const validScrollTop = Math.max(0, Math.min(scrollTop, maxScrollTop));
        const progress = Math.floor((validScrollTop / maxScrollTop) * 100);
        progressEl.style.width = `${progress}%`;
        progressTextEl.textContent = `${progress}%`;
        const progressKey = `${this.currentChapterType}_${this.currentChapterId}`;
        extension_settings[extensionName].readerState.readProgress[progressKey] = validScrollTop;
        saveSettingsDebounced();
    },
    renderChapterList() {
        const listContainer = document.getElementById("reader-chapter-list");
        const chapterCountEl = document.getElementById("reader-chapter-count");
        const totalChapterCount = currentParsedChapters.length + continueWriteChain.length;
        chapterCountEl.textContent = `0/${totalChapterCount}`;
        if (currentParsedChapters.length === 0) {
            listContainer.innerHTML = '<p class="empty-tip">暂无解析的章节，请先在「章节管理」中解析小说</p>';
            return;
        }
        let listHtml = "";
        currentParsedChapters.forEach(chapter => {
            const continueChapters = continueWriteChain.filter(item => item.baseChapterId === chapter.id);
            const isActive = this.currentChapterType === 'original' && this.currentChapterId === chapter.id;
            listHtml += `<div class="reader-chapter-item ${isActive ? 'active' : ''}" data-chapter-id="${chapter.id}" data-chapter-type="original">${chapter.title}</div>`;
            if (continueChapters.length > 0) {
                listHtml += `<div class="reader-chapter-branch">`;
                continueChapters.forEach((continueChapter, index) => {
                    const isContinueActive = this.currentChapterType === 'continue' && this.currentChapterId === continueChapter.id;
                    listHtml += `<div class="reader-continue-chapter-item ${isContinueActive ? 'active' : ''}" data-chapter-id="${continueChapter.id}" data-chapter-type="continue"><span>✒️</span>续写章节 ${index + 1}</div>`;
                });
                listHtml += `</div>`;
            }
        });
        listContainer.innerHTML = listHtml;
        document.querySelectorAll(".reader-chapter-item, .reader-continue-chapter-item").forEach(item => {
            item.removeEventListener("click", this.chapterClickHandler.bind(this));
            item.addEventListener("click", this.chapterClickHandler.bind(this));
        });
    },
    chapterClickHandler(e) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        const chapterId = parseInt(e.currentTarget.dataset.chapterId);
        const chapterType = e.currentTarget.dataset.chapterType;
        this.loadChapter(chapterId, chapterType);
        this.hideChapterDrawer();
    },
    loadChapter(chapterId, chapterType = "original") {
        this.isPageTurning = true;
        this.globalPageCooldown = true;
        this.isProgrammaticScroll = true;
        const contentEl = document.getElementById("reader-content");
        const titleEl = document.getElementById("reader-current-chapter-title");
        const chapterCountEl = document.getElementById("reader-chapter-count");
        const totalChapterCount = currentParsedChapters.length + continueWriteChain.length;
        let chapterData = null;
        let chapterTitle = "";
        let chapterIndex = 0;
        if (chapterType === "original") {
            chapterData = currentParsedChapters.find(item => item.id === chapterId);
            if (!chapterData) {
                this.resetAllLocks();
                return;
            }
            chapterTitle = chapterData.title;
            chapterIndex = currentParsedChapters.findIndex(item => item.id === chapterId) + 1;
        } else {
            chapterData = continueWriteChain.find(item => item.id === chapterId);
            if (!chapterData) {
                this.resetAllLocks();
                return;
            }
            const baseChapter = currentParsedChapters.find(item => item.id === chapterData.baseChapterId);
            const continueIndex = continueWriteChain.filter(item => item.baseChapterId === chapterData.baseChapterId).findIndex(item => item.id === chapterId) + 1;
            chapterTitle = `${baseChapter?.title || '未知章节'} - 续写章节 ${continueIndex}`;
            chapterIndex = currentParsedChapters.length + continueWriteChain.findIndex(item => item.id === chapterId) + 1;
        }
        this.currentChapterId = chapterId;
        this.currentChapterType = chapterType;
        extension_settings[extensionName].readerState.currentChapterId = chapterId;
        extension_settings[extensionName].readerState.currentChapterType = chapterType;
        titleEl.textContent = chapterTitle;
        contentEl.textContent = chapterData.content;
        chapterCountEl.textContent = `${chapterIndex}/${totalChapterCount}`;
        const progressKey = `${chapterType}_${chapterId}`;
        const savedScrollTop = extension_settings[extensionName].readerState.readProgress[progressKey] || 0;
        requestAnimationFrame(() => {
            contentEl.scrollTop = savedScrollTop;
            requestAnimationFrame(() => {
                contentEl.scrollTop = savedScrollTop;
                setTimeout(() => {
                    contentEl.scrollTop = savedScrollTop;
                    this.isProgrammaticScroll = false;
                    this.isPageTurning = false;
                    setTimeout(() => {
                        this.globalPageCooldown = false;
                    }, 500);
                }, 200);
            });
        });
        this.renderChapterList();
        saveSettingsDebounced();
    },
    resetAllLocks() {
        this.isPageTurning = false;
        this.isProgrammaticScroll = false;
        setTimeout(() => {
            this.globalPageCooldown = false;
        }, 200);
    },
    loadNextChapter() {
        if (this.isPageTurning || this.globalPageCooldown || this.isProgrammaticScroll) {
            return;
        }
        this.isPageTurning = true;
        this.globalPageCooldown = true;
        this.isProgrammaticScroll = true;
        let nextChapterId = null;
        let nextChapterType = "original";
        if (this.currentChapterType === "original") {
            const currentIndex = currentParsedChapters.findIndex(item => item.id === this.currentChapterId);
            if (currentIndex < 0 || currentIndex >= currentParsedChapters.length - 1) {
                this.resetAllLocks();
                return;
            }
            nextChapterId = currentParsedChapters[currentIndex + 1].id;
            nextChapterType = "original";
        } else {
            const currentChapter = continueWriteChain.find(item => item.id === this.currentChapterId);
            if (!currentChapter) {
                this.resetAllLocks();
                return;
            }
            const sameBaseChapters = continueWriteChain.filter(item => item.baseChapterId === currentChapter.baseChapterId);
            const sameBaseIndex = sameBaseChapters.findIndex(item => item.id === this.currentChapterId);
            if (sameBaseIndex >= 0 && sameBaseIndex < sameBaseChapters.length - 1) {
                nextChapterId = sameBaseChapters[sameBaseIndex + 1].id;
                nextChapterType = "continue";
            } else {
                const baseChapterIndex = currentParsedChapters.findIndex(item => item.id === currentChapter.baseChapterId);
                if (baseChapterIndex < 0 || baseChapterIndex >= currentParsedChapters.length - 1) {
                    this.resetAllLocks();
                    return;
                }
                nextChapterId = currentParsedChapters[baseChapterIndex + 1].id;
                nextChapterType = "original";
            }
        }
        if (nextChapterId === null) {
            this.resetAllLocks();
            return;
        }
        this.loadChapter(nextChapterId, nextChapterType);
        setTimeout(() => {
            const contentEl = document.getElementById("reader-content");
            this.isProgrammaticScroll = true;
            contentEl.scrollTop = this.safeScrollOffset;
            requestAnimationFrame(() => {
                contentEl.scrollTop = this.safeScrollOffset;
                this.isProgrammaticScroll = false;
            });
        }, 300);
        this.setGlobalCooldown();
    },
    loadPrevChapter() {
        if (this.isPageTurning || this.globalPageCooldown || this.isProgrammaticScroll) {
            return;
        }
        this.isPageTurning = true;
        this.globalPageCooldown = true;
        this.isProgrammaticScroll = true;
        let prevChapterId = null;
        let prevChapterType = "original";
        if (this.currentChapterType === "original") {
            const currentIndex = currentParsedChapters.findIndex(item => item.id === this.currentChapterId);
            if (currentIndex <= 0) {
                this.resetAllLocks();
                return;
            }
            prevChapterId = currentParsedChapters[currentIndex - 1].id;
            prevChapterType = "original";
        } else {
            const currentChapter = continueWriteChain.find(item => item.id === this.currentChapterId);
            if (!currentChapter) {
                this.resetAllLocks();
                return;
            }
            const sameBaseChapters = continueWriteChain.filter(item => item.baseChapterId === currentChapter.baseChapterId);
            const sameBaseIndex = sameBaseChapters.findIndex(item => item.id === this.currentChapterId);
            if (sameBaseIndex > 0) {
                prevChapterId = sameBaseChapters[sameBaseIndex - 1].id;
                prevChapterType = "continue";
            } else {
                prevChapterId = currentChapter.baseChapterId;
                prevChapterType = "original";
            }
        }
        if (prevChapterId === null) {
            this.resetAllLocks();
            return;
        }
        this.loadChapter(prevChapterId, prevChapterType);
        setTimeout(() => {
            const contentEl = document.getElementById("reader-content");
            const maxScrollTop = contentEl.scrollHeight - contentEl.clientHeight;
            const targetScrollTop = Math.max(0, maxScrollTop - this.safeScrollOffset);
            this.isProgrammaticScroll = true;
            contentEl.scrollTop = targetScrollTop;
            requestAnimationFrame(() => {
                contentEl.scrollTop = targetScrollTop;
                this.isProgrammaticScroll = false;
            });
        }, 300);
        this.setGlobalCooldown();
    },
    setFontSize(size) {
        if (size < this.minFontSize || size > this.maxFontSize) return;
        this.isPageTurning = true;
        this.globalPageCooldown = true;
        this.isProgrammaticScroll = true;
        this.fontSize = size;
        const contentEl = document.getElementById("reader-content");
        contentEl.style.setProperty("--novel-reader-font-size", `${size}px`);
        setTimeout(() => {
            this.isProgrammaticScroll = false;
            this.isPageTurning = false;
            setTimeout(() => {
                this.globalPageCooldown = false;
            }, 300);
        }, 300);
        extension_settings[extensionName].readerState.fontSize = size;
        saveSettingsDebounced();
    },
    toggleChapterDrawer() {
        const drawer = document.getElementById("reader-chapter-drawer");
        drawer.classList.toggle("show");
    },
    showChapterDrawer() {
        document.getElementById("reader-chapter-drawer").classList.add("show");
    },
    hideChapterDrawer() {
        document.getElementById("reader-chapter-drawer").classList.remove("show");
    },
    restoreState() {
        const state = extension_settings[extensionName].readerState || defaultSettings.readerState;
        this.setFontSize(state.fontSize);
        this.currentChapterId = state.currentChapterId;
        this.currentChapterType = state.currentChapterType || "original";
    }
};

// ==============================================
// 核心工具函数（100%兼容原有功能，新增功能仅追加）
// ==============================================
async function loadSettings() {
    extension_settings[extensionName] = extension_settings[extensionName] || {};
    extension_settings[extensionName] = deepMerge(defaultSettings, extension_settings[extensionName]);
    for (const key of Object.keys(defaultSettings)) {
        if (!Object.hasOwn(extension_settings[extensionName], key)) {
            extension_settings[extensionName][key] = structuredClone(defaultSettings[key]);
        }
    }
    currentParsedChapters = extension_settings[extensionName].chapterList || [];
    continueWriteChain = extension_settings[extensionName].continueWriteChain || [];
    continueChapterIdCounter = extension_settings[extensionName].continueChapterIdCounter || 1;
    currentPrecheckResult = extension_settings[extensionName].precheckReport || null;
    const settings = extension_settings[extensionName];

    $('input[name="split-mode"]').prop("checked", false);
    $(`input[name="split-mode"][value="${settings.splitMode}"]`).prop("checked", true);
    $("#split-word-count-input").val(settings.splitWordCount);
    toggleSplitMode(settings.splitMode);

    $("#example_setting").prop("checked", settings.example_setting).trigger("input");
    $("#chapter-regex-input").val(settings.chapterRegex);
    $("#send-template-input").val(settings.sendTemplate);
    $("#send-delay-input").val(settings.sendDelay);
    $("#quality-check-switch").prop("checked", settings.enableQualityCheck);
    $("#write-word-count").val(settings.writeWordCount || 2000);
    const mergedGraph = settings.mergedGraph || {};
    $("#merged-graph-preview").val(Object.keys(mergedGraph).length > 0 ? JSON.stringify(mergedGraph, null, 2) : "");
    $("#write-content-preview").val(settings.writeContentPreview || "");
    if (settings.graphValidateResultShow) $("#graph-validate-result").show();
    if (settings.qualityResultShow) $("#quality-result-block").show();
    $("#precheck-status").text(settings.precheckStatus || "未执行").removeClass("status-default status-success status-danger").addClass(settings.precheckStatus === "通过"?"status-success": settings.precheckStatus === "不通过"? "status-danger": "status-default");
    $("#precheck-report").val(settings.precheckReportText || "");

    renderChapterList(currentParsedChapters);
    renderChapterSelect(currentParsedChapters);
    renderContinueWriteChain(continueWriteChain);
    NovelReader.renderChapterList();
    restoreDrawerState();
    if (settings.selectedBaseChapterId) {
        $("#write-chapter-select").val(settings.selectedBaseChapterId).trigger("change");
    }
    isInitialized = true;
    await new Promise(resolve => setTimeout(resolve, 50));
    FloatBall.init();
    NovelReader.init();
}
function saveDrawerState() {
    const drawerState = {};
    $('.novel-writer-extension .inline-drawer').each(function() {
        const drawerId = $(this).attr('id');
        if (drawerId) {
            drawerState[drawerId] = $(this).hasClass('open');
        }
    });
    extension_settings[extensionName].drawerState = drawerState;
    saveSettingsDebounced();
}
function restoreDrawerState() {
    const savedState = extension_settings[extensionName].drawerState || defaultSettings.drawerState;
    $('.novel-writer-extension .inline-drawer').each(function() {
        const drawerId = $(this).attr('id');
        if (drawerId && savedState[drawerId] !== undefined) {
            $(this).toggleClass('open', savedState[drawerId]);
        }
    });
}
function initDrawerToggle() {
    $('#novel-writer-panel').off('click', '.inline-drawer-header').on('click', '.inline-drawer-header', function(e) {
        e.preventDefault();
        e.stopPropagation();
        const $drawer = $(this).closest('.inline-drawer');
        $drawer.toggleClass('open');
        saveDrawerState();
    });
}
async function copyToClipboard(text) {
    try {
        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(text);
            return true;
        }
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        textArea.style.opacity = '0';
        textArea.readOnly = true;
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        textArea.setSelectionRange(0, textArea.value.length);
        const result = document.execCommand('copy');
        document.body.removeChild(textArea);
        return result;
    } catch (error) {
        console.error('复制失败:', error);
        return false;
    }
}
function initVisibilityListener() {
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && isInitialized) {
            if (isGeneratingWrite) {
                $('#write-status').text('生成状态异常，请重新点击生成');
                isGeneratingWrite = false;
                stopGenerateFlag = false;
                setButtonDisabled('#write-generate-btn, .continue-write-btn, #write-stop-btn', false);
            }
            if (isGeneratingGraph) {
                $('#graph-generate-status').text('图谱生成状态异常，请重新点击生成');
                isGeneratingGraph = false;
                stopGenerateFlag = false;
                setButtonDisabled('#graph-single-btn, #graph-batch-btn, #graph-merge-btn', false);
            }
            if (isSending) {
                $('#novel-import-status').text('发送状态异常，请重新点击导入');
                isSending = false;
                stopSending = false;
                setButtonDisabled('#import-selected-btn, #import-all-btn, #stop-send-btn', false);
            }
        }
    });
}
function setButtonDisabled(selector, disabled) {
    $(selector).prop('disabled', disabled).toggleClass('menu_button--disabled', disabled);
}
function onExampleInput(event) {
    const value = Boolean($(event.target).prop("checked"));
    extension_settings[extensionName].example_setting = value;
    saveSettingsDebounced();
}
function onButtonClick() {
    toastr.info(`The checkbox is ${extension_settings[extensionName].example_setting ? "checked": "not checked"}`, "Extension Example");
}
function renderCommandTemplate(template, charName, chapterContent) {
    const escapedContent = chapterContent
        .replace(/"/g, '\\"')
        .replace(/\|/g, '\\|')
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\r')
        .replace(/`/g, '\\`');
    return template
        .replace(/{{char}}/g, charName || '角色')
        .replace(/{{pipe}}/g, escapedContent);
}
function updateProgress(progressId, statusId, current, total, textPrefix = "进度") {
    const $progressEl = $(`#${progressId}`);
    const $statusEl = $(`#${statusId}`);
    if (total === 0) {
        $progressEl.css('width', '0%');
        $statusEl.text('');
        return;
    }
    const percent = Math.floor((current / total) * 100);
    $progressEl.css('width', `${percent}%`);
    $statusEl.setText(`${textPrefix}: ${current}/${total} (${percent}%)`);
}
function removeBOM(text) {
    if (!text) return text;
    if (text.charCodeAt(0) === 0xFEFF || text.charCodeAt(0) === 0xFFFE) {
        return text.slice(1);
    }
    return text;
}

// 拆分模式切换显示控制
function toggleSplitMode(mode) {
    if (mode === 'regex') {
        $('#regex-split-group').show();
        $('#wordcount-split-group').hide();
    } else if (mode === 'wordCount') {
        $('#regex-split-group').hide();
        $('#wordcount-split-group').show();
    }
}

// 按字数拆分章节核心函数（语义优先，不拆分句子/段落）
function splitNovelByWordCount(novelText, targetWordCount) {
    try {
        const cleanText = removeBOM(novelText).replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
        if (!cleanText) {
            toastr.error('小说文本为空，无法拆分', "小说续写器");
            return [];
        }

        const paragraphs = cleanText.split('\n').filter(p => p.trim().length > 0);
        const chapters = [];
        let currentChapterContent = '';
        let currentWordCount = 0;
        let chapterId = 0;
        const sentenceEndRegex = /([。！？；\n])/g;

        for (const paragraph of paragraphs) {
            const paragraphTrimmed = paragraph.trim();
            const paragraphLength = paragraphTrimmed.length;

            if (currentWordCount + paragraphLength <= targetWordCount * 1.1) {
                currentChapterContent += (currentChapterContent ? '\n\n' : '') + paragraphTrimmed;
                currentWordCount += paragraphLength;
            }
            else if (paragraphLength > targetWordCount * 0.8) {
                if (currentWordCount > 0) {
                    chapters.push({
                        id: chapterId++,
                        title: `第${chapterId}段 - 约${currentWordCount}字`,
                        content: currentChapterContent,
                        hasGraph: false
                    });
                    currentChapterContent = '';
                    currentWordCount = 0;
                }

                const sentences = paragraphTrimmed.split(sentenceEndRegex).filter(s => s.trim().length > 0);
                let currentSentenceContent = '';
                let currentSentenceCount = 0;

                for (let i = 0; i < sentences.length; i += 2) {
                    const sentence = sentences[i] + (sentences[i+1] || '');
                    const sentenceLength = sentence.length;

                    if (currentSentenceCount + sentenceLength <= targetWordCount * 1.1) {
                        currentSentenceContent += sentence;
                        currentSentenceCount += sentenceLength;
                    } else {
                        chapters.push({
                            id: chapterId++,
                            title: `第${chapterId}段 - 约${currentSentenceCount}字`,
                            content: currentSentenceContent,
                            hasGraph: false
                        });
                        currentSentenceContent = sentence;
                        currentSentenceCount = sentenceLength;
                    }
                }

                if (currentSentenceCount > 0) {
                    currentChapterContent = currentSentenceContent;
                    currentWordCount = currentSentenceCount;
                }
            }
            else {
                chapters.push({
                    id: chapterId++,
                    title: `第${chapterId}段 - 约${currentWordCount}字`,
                    content: currentChapterContent,
                    hasGraph: false
                });
                currentChapterContent = paragraphTrimmed;
                currentWordCount = paragraphLength;
            }
        }

        if (currentWordCount > 0) {
            chapters.push({
                id: chapterId++,
                title: `第${chapterId}段 - 约${currentWordCount}字`,
                content: currentChapterContent,
                hasGraph: false
            });
        }

        toastr.success(`按字数拆分完成，共生成 ${chapters.length} 个章节`, "小说续写器");
        return chapters;
    } catch (error) {
        console.error('按字数拆分章节失败:', error);
        toastr.error('按字数拆分章节失败，请检查配置', "小说续写器");
        return [];
    }
}

// ==============================================
// 【本次优化新增】自动正则匹配排序函数
// ==============================================
function getSortedRegexPresets(novelText) {
    const cleanText = removeBOM(novelText).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const regexResultList = [];

    chapterRegexPresets.forEach(preset => {
        try {
            const regex = new RegExp(preset.value, 'gm');
            const matches = [...cleanText.matchAll(regex)];
            if (matches.length >= 2) {
                regexResultList.push({
                    ...preset,
                    chapterCount: matches.length
                });
            }
        } catch (e) {
            console.warn(`正则预设${preset.label}解析错误:`, e);
        }
    });

    return regexResultList.sort((a, b) => b.chapterCount - a.chapterCount);
}

// ==============================================
// 【本次优化重写】章节列表渲染函数（修复复选框状态+图谱状态显示）
// ==============================================
function renderChapterList(chapters) {
    const $listContainer = $('#novel-chapter-list');
    const graphMap = extension_settings[extensionName].chapterGraphMap || {};
    const settings = extension_settings[extensionName];
    if (chapters.length === 0) {
        $listContainer.html('<p class="empty-tip">请上传小说文件并点击「解析章节」</p>');
        return;
    }

    chapters.forEach(chapter => {
        const graph = graphMap[chapter.id];
        const isWordCountValid = chapter.content.length >= settings.minChapterGraphWordCount;
        chapter.hasGraph = !!graph && isWordCountValid;
        chapter.graphInvalid = !!graph && !isWordCountValid;
        if (!chapterCheckedState.has(chapter.id)) {
            chapterCheckedState.set(chapter.id, true);
        }
    });

    const listHtml = chapters.map((chapter) => `
        <div class="chapter-item">
            <label class="chapter-checkbox">
                <input type="checkbox" class="chapter-select" data-index="${chapter.id}" ${chapterCheckedState.get(chapter.id) ? 'checked' : ''}>
                <span class="chapter-title">${chapter.title}</span>
                <span class="text-sm text-muted">（约${chapter.content.length}字）</span>
            </label>
            <span class="text-sm ${chapter.hasGraph ? 'text-success' : chapter.graphInvalid ? 'status-danger' : 'text-muted'}">
                ${chapter.hasGraph ? '✅ 图谱正常' : chapter.graphInvalid ? '❌ 字数不足' : '⚠️ 无图谱'}
            </span>
        </div>
    `).join('');
    $listContainer.html(listHtml);

    $listContainer.off('change', '.chapter-select').on('change', '.chapter-select', function(e) {
        const chapterId = parseInt($(this).data('index'));
        const isChecked = $(this).prop('checked');
        chapterCheckedState.set(chapterId, isChecked);
    });
}

// ==============================================
// 【本次优化重写】图谱状态检验函数（新增字数校验+深度校验）
// ==============================================
async function validateChapterGraphStatus() {
    const graphMap = extension_settings[extensionName].chapterGraphMap || {};
    const settings = extension_settings[extensionName];
    const minWordCount = settings.minChapterGraphWordCount;
    if (currentParsedChapters.length === 0) {
        toastr.warning('请先上传小说文件并解析章节', "小说续写器");
        return;
    }
    let validGraphCount = 0;
    let noGraphList = [];
    let wordCountInvalidList = [];
    let graphInvalidList = [];

    currentParsedChapters.forEach(chapter => {
        const graph = graphMap[chapter.id];
        const chapterWordCount = chapter.content.length;

        if (chapterWordCount < minWordCount) {
            chapter.hasGraph = false;
            chapter.graphInvalid = true;
            wordCountInvalidList.push(`${chapter.title}（仅${chapterWordCount}字，最低要求${minWordCount}字）`);
            return;
        }
        if (!graph) {
            chapter.hasGraph = false;
            chapter.graphInvalid = false;
            noGraphList.push(chapter.title);
            return;
        }
        const requiredFields = graphJsonSchema.value.required;
        const hasAllRequiredFields = requiredFields.every(field => Object.hasOwn(graph, field));
        if (!hasAllRequiredFields) {
            chapter.hasGraph = false;
            chapter.graphInvalid = true;
            graphInvalidList.push(`${chapter.title}（图谱缺少必填字段）`);
            return;
        }
        chapter.hasGraph = true;
        chapter.graphInvalid = false;
        validGraphCount++;
    });

    renderChapterList(currentParsedChapters);

    const totalCount = currentParsedChapters.length;
    let reportMessage = `===== 章节图谱状态深度检验报告 =====
检验时间：${new Date().toLocaleString()}
总章节数：${totalCount}
有效图谱章节：${validGraphCount}个
无图谱章节：${noGraphList.length}个
字数不足章节：${wordCountInvalidList.length}个
图谱无效章节：${graphInvalidList.length}个
最低有效章节字数：${minWordCount}字`;

    if (noGraphList.length > 0) {
        reportMessage += `\n\n【无图谱章节列表】\n${noGraphList.join('\n')}`;
    }
    if (wordCountInvalidList.length > 0) {
        reportMessage += `\n\n【字数不足章节列表】\n${wordCountInvalidList.join('\n')}`;
    }
    if (graphInvalidList.length > 0) {
        reportMessage += `\n\n【图谱无效章节列表】\n${graphInvalidList.join('\n')}`;
    }

    console.log(reportMessage);
    $('#graph-status-report').val(reportMessage);

    if (noGraphList.length === 0 && wordCountInvalidList.length === 0 && graphInvalidList.length === 0) {
        toastr.success(`图谱状态检验完成！所有${totalCount}个章节均有有效图谱`, "小说续写器");
    } else {
        toastr.warning(`图谱状态检验完成！有效${validGraphCount}/${totalCount}个，详情见报告`, "小说续写器");
    }

    return {
        validCount: validGraphCount,
        totalCount: totalCount,
        noGraphList,
        wordCountInvalidList,
        graphInvalidList
    };
}

// ==============================================
// 【本次优化新增】单章节图谱导入导出核心函数
// ==============================================
async function exportSingleChapterGraph() {
    const selectedChapters = getSelectedChapters();
    const graphMap = extension_settings[extensionName].chapterGraphMap || {};
    if (selectedChapters.length === 0) {
        toastr.warning('请先选择要导出的章节', "小说续写器");
        return;
    }
    if (selectedChapters.length > 1) {
        toastr.warning('单次仅支持导出单个章节的图谱，请只选择一个章节', "小说续写器");
        return;
    }

    const targetChapter = selectedChapters[0];
    const graph = graphMap[targetChapter.id];
    if (!graph) {
        toastr.error('该章节暂无可用图谱，无法导出', "小说续写器");
        return;
    }

    const exportData = {
        chapterId: targetChapter.id,
        chapterTitle: targetChapter.title,
        chapterWordCount: targetChapter.content.length,
        graphData: graph,
        exportTime: new Date().toISOString()
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${targetChapter.title.replace(/[\\/:*?"<>|]/g, '_')}_图谱.json`;
    a.click();
    URL.revokeObjectURL(url);
    toastr.success('单章节图谱导出完成！', "小说续写器");
}

async function exportAllSingleChapterGraphs() {
    const graphMap = extension_settings[extensionName].chapterGraphMap || {};
    if (Object.keys(graphMap).length === 0) {
        toastr.warning('暂无可用的单章节图谱，无法导出', "小说续写器");
        return;
    }

    const exportData = {
        exportType: "全量单章节图谱",
        exportTime: new Date().toISOString(),
        totalChapters: currentParsedChapters.length,
        graphCount: Object.keys(graphMap).length,
        chapterGraphs: []
    };

    currentParsedChapters.forEach(chapter => {
        const graph = graphMap[chapter.id];
        if (graph) {
            exportData.chapterGraphs.push({
                chapterId: chapter.id,
                chapterTitle: chapter.title,
                chapterWordCount: chapter.content.length,
                graphData: graph
            });
        }
    });

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `小说全量单章节图谱_${new Date().getTime()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toastr.success(`全量单章节图谱导出完成！共导出${exportData.graphCount}个章节的图谱`, "小说续写器");
}

async function importSingleChapterGraphs(file) {
    if (!file) {
        toastr.warning('请先选择要导入的图谱JSON文件', "小说续写器");
        return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const importData = JSON.parse(removeBOM(event.target.result.trim()));
            const graphMap = extension_settings[extensionName].chapterGraphMap || {};
            let importCount = 0;
            let failCount = 0;

            if (importData.exportType === "全量单章节图谱" && Array.isArray(importData.chapterGraphs)) {
                importData.chapterGraphs.forEach(item => {
                    if (item.chapterId !== undefined && item.graphData) {
                        graphMap[item.chapterId] = item.graphData;
                        importCount++;
                    } else {
                        failCount++;
                    }
                });
            }
            else if (importData.chapterId !== undefined && importData.graphData) {
                graphMap[importData.chapterId] = importData.graphData;
                importCount++;
            }
            else {
                throw new Error("图谱文件格式错误，不支持该文件");
            }

            extension_settings[extensionName].chapterGraphMap = graphMap;
            saveSettingsDebounced();
            renderChapterList(currentParsedChapters);
            NovelReader.renderChapterList();

            if (failCount === 0) {
                toastr.success(`单章节图谱导入完成！成功导入${importCount}个图谱`, "小说续写器");
            } else {
                toastr.warning(`单章节图谱导入完成！成功${importCount}个，失败${failCount}个`, "小说续写器");
            }
        } catch (error) {
            console.error('图谱导入失败:', error);
            toastr.error(`导入失败：${error.message}，请检查JSON文件格式是否正确`, "小说续写器");
        } finally {
            $("#single-graph-file-upload").val('');
        }
    };
    reader.onerror = () => {
        toastr.error('文件读取失败，请检查文件', "小说续写器");
        $("#single-graph-file-upload").val('');
    };
    reader.readAsText(file, 'UTF-8');
}

// ==============================================
// 规则适配核心函数（100%完整保留，JSON容错优化）
// ==============================================
const graphJsonSchema = {
    name: 'NovelKnowledgeGraph',
    strict: true,
    value: {
        "$schema": "http://json-schema.org/draft-04/schema#",
        "type": "object",
        "required": ["基础章节信息", "人物信息", "世界观设定", "核心剧情线", "文风特点", "实体关系网络", "变更与依赖信息", "逆向分析洞察"],
        "properties": {
            "基础章节信息": {
                "type": "object",
                "required": ["章节号", "章节版本号", "章节节点唯一标识", "本章字数", "叙事时间线节点"],
                "properties": {
                    "章节号": { "type": "string"},
                    "章节版本号": { "type": "string", "default": "1.0"},
                    "章节节点唯一标识": { "type": "string"},
                    "本章字数": { "type": "number"},
                    "叙事时间线节点": { "type": "string"}
                }
            },
            "人物信息": {
                "type": "array", "minItems": 1,
                "items": {
                    "type": "object",
                    "required": ["唯一人物ID", "姓名", "别名/称号", "本章更新的性格特征", "本章更新的身份/背景", "本章核心行为与动机", "本章人物关系变更", "本章人物弧光变化"],
                    "properties": {
                        "唯一人物ID": { "type": "string"},
                        "姓名": { "type": "string"},
                        "别名/称号": { "type": "string"},
                        "本章更新的性格特征": { "type": "string"},
                        "本章更新的身份/背景": { "type": "string"},
                        "本章核心行为与动机": { "type": "string"},
                        "本章人物关系变更": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "required": ["关系对象", "关系类型", "关系强度0-1", "关系描述", "对应原文位置"],
                                "properties": {
                                    "关系对象": { "type": "string"},
                                    "关系类型": { "type": "string"},
                                    "关系强度0-1": { "type": "number", "minimum": 0, "maximum": 1 },
                                    "关系描述": { "type": "string"},
                                    "对应原文位置": { "type": "string"}
                                }
                            }
                        },
                        "本章人物弧光变化": { "type": "string"}
                    }
                }
            },
            "世界观设定": {
                "type": "object",
                "required": ["本章新增/变更的时代背景", "本章新增/变更的地理区域", "本章新增/变更的力量体系/规则", "本章新增/变更的社会结构", "本章新增/变更的独特物品/生物","本章新增的隐藏设定/伏笔", "对应原文位置"],
                "properties": {
                    "本章新增/变更的时代背景": { "type": "string"},
                    "本章新增/变更的地理区域": { "type": "string"},
                    "本章新增/变更的力量体系/规则": { "type": "string"},
                    "本章新增/变更的社会结构": { "type": "string"},
                    "本章新增/变更的独特物品/生物": { "type": "string"},
                    "本章新增的隐藏设定/伏笔": { "type": "string"},
                    "对应原文位置": { "type": "string"}
                }
            },
            "核心剧情线": {
                "type": "object",
                "required": ["本章主线剧情描述", "本章关键事件列表", "本章支线剧情", "本章核心冲突进展", "本章未回收伏笔"],
                "properties": {
                    "本章主线剧情描述": { "type": "string"},
                    "本章关键事件列表": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "required": ["事件ID", "事件名", "参与人物", "前因", "后果", "对主线的影响", "对应原文位置"],
                            "properties": {
                                "事件ID": { "type": "string"},
                                "事件名": { "type": "string"},
                                "参与人物": { "type": "string"},
                                "前因": { "type": "string"},
                                "后果": { "type": "string"},
                                "对主线的影响": { "type": "string"},
                                "对应原文位置": { "type": "string"}
                            }
                        }
                    },
                    "本章支线剧情": { "type": "string"},
                    "本章核心冲突进展": { "type": "string"},
                    "本章未回收伏笔": { "type": "string"}
                }
            },
            "文风特点": {
                "type": "object",
                "required": ["本章叙事视角", "语言风格", "对话特点", "常用修辞", "节奏特点", "与全文文风的匹配度说明"],
                "properties": {
                    "本章叙事视角": { "type": "string"},
                    "语言风格": { "type": "string"},
                    "对话特点": { "type": "string"},
                    "常用修辞": { "type": "string"},
                    "节奏特点": { "type": "string"},
                    "与全文文风的匹配度说明": { "type": "string"}
                }
            },
            "实体关系网络": {
                "type": "array", "minItems": 5,
                "items": { "type": "array", "minItems": 3, "maxItems": 3, "items": { "type": "string"} }
            },
            "变更与依赖信息": {
                "type": "object",
                "required": ["本章对全局图谱的变更项", "本章剧情依赖的前置章节", "本章内容对后续剧情的影响预判", "本章内容与前文的潜在冲突预警"],
                "properties": {
                    "本章对全局图谱的变更项": { "type": "string"},
                    "本章剧情依赖的前置章节": { "type": "string"},
                    "本章内容对后续剧情的影响预判": { "type": "string"},
                    "本章内容与前文的潜在冲突预警": { "type": "string"}
                }
            },
            "逆向分析洞察": { "type": "string"}
        }
    }
};
const mergeGraphJsonSchema = {
    name: 'MergedNovelKnowledgeGraph',
    strict: true,
    value: {
        "$schema": "http://json-schema.org/draft-04/schema#",
        "type": "object",
        "required": ["全局基础信息", "人物信息库", "世界观设定库", "全剧情时间线", "全局文风标准", "全量实体关系网络", "反向依赖图谱", "逆向分析与质量评估"],
        "properties": {
            "全局基础信息": {
                "type": "object",
                "required": ["小说名称", "总章节数", "已解析文本范围", "全局图谱版本号", "最新更新时间"],
                "properties": {
                    "小说名称": { "type": "string"},
                    "总章节数": { "type": "number"},
                    "已解析文本范围": { "type": "string"},
                    "全局图谱版本号": { "type": "string"},
                    "最新更新时间": { "type": "string"}
                }
            },
            "人物信息库": {
                "type": "array",
                "items": {
                    "type": "object",
                    "required": ["唯一人物ID", "姓名", "所有别名/称号", "全本最终性格特征", "完整身份/背景", "全本核心动机", "全时间线人物关系网", "完整人物弧光", "人物关键事件时间线"],
                    "properties": {
                        "唯一人物ID": { "type": "string"},
                        "姓名": { "type": "string"},
                        "所有别名/称号": { "type": "string"},
                        "全本最终性格特征": { "type": "string"},
                        "完整身份/背景": { "type": "string"},
                        "全本核心动机": { "type": "string"},
                        "全时间线人物关系网": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "required": ["关系对象", "关系类型", "关系强度", "关系演变过程", "对应章节"],
                                "properties": {
                                    "关系对象": { "type": "string"},
                                    "关系类型": { "type": "string"},
                                    "关系强度": { "type": "number", "minimum": 0, "maximum": 1 },
                                    "关系演变过程": { "type": "string"},
                                    "对应章节": { "type": "string"}
                                }
                            }
                        },
                        "完整人物弧光": { "type": "string"},
                        "人物关键事件时间线": { "type": "string"}
                    }
                }
            },
            "世界观设定库": {
                "type": "object",
                "required": ["时代背景", "核心地理区域与地图", "完整力量体系/规则", "社会结构", "核心独特物品/生物", "全本所有隐藏设定/伏笔汇总", "设定变更历史记录"],
                "properties": {
                    "时代背景": { "type": "string"},
                    "核心地理区域与地图": { "type": "string"},
                    "完整力量体系/规则": { "type": "string"},
                    "社会结构": { "type": "string"},
                    "核心独特物品/生物": { "type": "string"},
                    "全本所有隐藏设定/伏笔汇总": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "required": ["伏笔内容", "出现章节", "当前回收状态", "预判回收节点"],
                            "properties": {
                                "伏笔内容": { "type": "string"},
                                "出现章节": { "type": "string"},
                                "当前回收状态": { "type": "string", "enum": ["未回收", "已回收", "待回收"] },
                                "预判回收节点": { "type": "string"}
                            }
                        }
                    },
                    "设定变更历史记录": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "required": ["变更章节", "变更内容", "生效范围"],
                            "properties": {
                                "变更章节": { "type": "string"},
                                "变更内容": { "type": "string"},
                                "生效范围": { "type": "string"}
                            }
                        }
                    }
                }
            },
            "全剧情时间线": {
                "type": "object",
                "required": ["主线剧情完整脉络", "全本关键事件时序表", "支线剧情汇总与关联关系", "全本核心冲突演变轨迹", "剧情节点依赖关系图"],
                "properties": {
                    "主线剧情完整脉络": { "type": "string"},
                    "全本关键事件时序表": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "required": ["事件ID", "事件名", "参与人物", "发生章节", "前因后果", "对主线的影响"],
                            "properties": {
                                "事件ID": { "type": "string"},
                                "事件名": { "type": "string"},
                                "参与人物": { "type": "string"},
                                "发生章节": { "type": "string"},
                                "前因后果": { "type": "string"},
                                "对主线的影响": { "type": "string"}
                            }
                        }
                    },
                    "支线剧情汇总与关联关系": { "type": "string"},
                    "全本核心冲突演变轨迹": { "type": "string"},
                    "剧情节点依赖关系图": { "type": "string"}
                }
            },
            "全局文风标准": {
                "type": "object",
                "required": ["固定叙事视角", "核心语言风格", "对话写作特点", "常用修辞与句式", "整体节奏规律", "场景描写习惯"],
                "properties": {
                    "固定叙事视角": { "type": "string"},
                    "核心语言风格": { "type": "string"},
                    "对话写作特点": { "type": "string"},
                    "常用修辞与句式": { "type": "string"},
                    "整体节奏规律": { "type": "string"},
                    "场景描写习惯": { "type": "string"}
                }
            },
            "全量实体关系网络": {
                "type": "array", "minItems": 20,
                "items": { "type": "array", "minItems": 3, "maxItems": 3, "items": { "type": "string"} }
            },
            "反向依赖图谱": {
                "type": "array",
                "items": {
                    "type": "object",
                    "required": ["章节节点ID", "生效人设状态", "生效设定状态", "生效剧情状态", "依赖的前置节点"],
                    "properties": {
                        "章节节点ID": { "type": "string"},
                        "生效人设状态": { "type": "string"},
                        "生效设定状态": { "type": "string"},
                        "生效剧情状态": { "type": "string"},
                        "依赖的前置节点": { "type": "array", "items": { "type": "string"} }
                    }
                }
            },
            "逆向分析与质量评估": {
                "type": "object",
                "required": ["全本隐藏信息汇总", "潜在剧情矛盾预警", "设定一致性校验结果", "人设连贯性评估", "伏笔完整性评估", "全文本逻辑自洽性得分"],
                "properties": {
                    "全本隐藏信息汇总": { "type": "string"},
                    "潜在剧情矛盾预警": { "type": "string"},
                    "设定一致性校验结果": { "type": "string"},
                    "人设连贯性评估": { "type": "string"},
                    "伏笔完整性评估": { "type": "string"},
                    "全文本逻辑自洽性得分": { "type": "number", "minimum": 0, "maximum": 100 }
                }
            }
        }
    }
};
const qualityEvaluateSchema = {
    name: 'NovelContinueQualityEvaluate',
    strict: true,
    value: {
        "$schema": "http://json-schema.org/draft-04/schema#",
        "type": "object",
        "required": ["总分", "人设一致性得分", "设定合规性得分", "剧情衔接度得分", "文风匹配度得分", "内容质量得分", "评估报告", "是否合格"],
        "properties": {
            "总分": { "type": "number", "minimum": 0, "maximum": 100 },
            "人设一致性得分": { "type": "number", "minimum": 0, "maximum": 100 },
            "设定合规性得分": { "type": "number", "minimum": 0, "maximum": 100 },
            "剧情衔接度得分": { "type": "number", "minimum": 0, "maximum": 100 },
            "文风匹配度得分": { "type": "number", "minimum": 0, "maximum": 100 },
            "内容质量得分": { "type": "number", "minimum": 0, "maximum": 100 },
            "评估报告": { "type": "string"},
            "是否合格": { "type": "boolean"}
        }
    }
};

// Schema深度校验工具函数
function validateSchemaDeep(data, schema, parentPath = "根节点") {
    const errors = [];
    const { type, required, properties, items, minItems } = schema;

    if (type && typeof data !== type) {
        errors.push(`【类型错误】${parentPath}：预期类型为${type}，实际为${typeof data}`);
        return errors;
    }

    if (required && Array.isArray(required)) {
        required.forEach(field => {
            if (data[field] === undefined || data[field] === null || data[field] === "") {
                errors.push(`【必填字段缺失】${parentPath} → ${field}：该字段为必填项，不能为空`);
            }
        });
    }

    if (type === "object" && properties && typeof data === "object" && data !== null) {
        Object.keys(properties).forEach(key => {
            if (data[key] !== undefined && data[key] !== null) {
                const childErrors = validateSchemaDeep(data[key], properties[key], `${parentPath} → ${key}`);
                errors.push(...childErrors);
            }
        });
    }

    if (type === "array" && Array.isArray(data)) {
        if (minItems !== undefined && data.length < minItems) {
            errors.push(`【数组长度不足】${parentPath}：最小长度要求${minItems}，实际长度${data.length}`);
        }
        if (items && data.length > 0) {
            data.forEach((item, index) => {
                const childErrors = validateSchemaDeep(item, items, `${parentPath}[${index}]`);
                errors.push(...childErrors);
            });
        }
    }

    if (type === "number" && schema.minimum !== undefined && data < schema.minimum) {
        errors.push(`【数值超出范围】${parentPath}：最小值要求${schema.minimum}，实际值${data}`);
    }
    if (type === "number" && schema.maximum !== undefined && data > schema.maximum) {
        errors.push(`【数值超出范围】${parentPath}：最大值要求${schema.maximum}，实际值${data}`);
    }

    return errors;
}

async function validateContinuePrecondition(baseChapterId, modifiedChapterContent = null) {
    const context = getContext();
    const { generateRaw } = context;
    const graphMap = extension_settings[extensionName].chapterGraphMap || {};
    const baseId = parseInt(baseChapterId);
    const preChapters = currentParsedChapters.filter(chapter => chapter.id <= baseId);
    const preGraphList = preChapters.map(chapter => graphMap[chapter.id]).filter(Boolean);
    if (preGraphList.length === 0 && modifiedChapterContent) {
        toastr.info('基准章节无可用图谱，正在生成临时图谱用于前置校验...', "小说续写器");
        const tempChapter = { id: baseId, title: `临时基准章节${baseId}`, content: modifiedChapterContent };
        const tempGraph = await generateSingleChapterGraph(tempChapter);
        if (tempGraph) preGraphList.push(tempGraph);
    }
    if (preGraphList.length === 0) {
        const result = {
            isPass: true,
            preGraph: {},
            report: "无前置图谱数据，将基于基准章节内容直接续写，建议先生成图谱以保证续写质量",
            redLines: "无明确人设红线",
            forbiddenRules: "无明确设定禁区",
            foreshadowList: "无明确可呼应伏笔",
            conflictWarning: "无潜在矛盾预警"
        };
        currentPrecheckResult = result;
        return result;
    }
    const systemPrompt = `触发词：续写节点逆向分析、前置合规性校验强制约束（100%遵守）：
1. 所有分析只能基于续写节点（章节号${baseId}）及之前的小说内容，绝对不能引入该节点之后的任何剧情、设定、人物变化，禁止剧透
2. 若前文有设定冲突，以续写节点前最后一次出现的内容为准，同时标注冲突预警
3. 优先以用户提供的魔改后基准章节内容为准，更新对应人设、设定、剧情状态
4. 只能基于提供的章节知识图谱分析，绝对不能引入外部信息、主观新增设定
5. 输出必须为纯JSON格式，无任何前置/后置内容、注释、markdown，必须以{开头、以}结尾
必填字段：isPass、preMergedGraph、人设红线清单、设定禁区清单、可呼应伏笔清单、潜在矛盾预警、可推进剧情方向、合规性报告`;
    const userPrompt = `续写基准章节ID：${baseId}
基准章节及前置章节的知识图谱列表：${JSON.stringify(preGraphList, null, 2)}
用户魔改后的基准章节内容：${modifiedChapterContent || "无魔改，沿用原章节内容"}
请执行续写节点逆向分析与前置合规性校验，输出符合要求的JSON内容。`;
    try {
        const result = await generateRaw({
            systemPrompt,
            prompt: userPrompt,
            jsonSchema: {
                name: 'ContinuePrecheck',
                strict: true,
                value: {
                    type: "object",
                    required: ["isPass", "preMergedGraph", "人设红线清单", "设定禁区清单", "可呼应伏笔清单", "潜在矛盾预警", "可推进剧情方向", "合规性报告"],
                    properties: {
                        isPass: { type: "boolean"},
                        preMergedGraph: { type: "object"},
                        "人设红线清单": { type: "string"},
                        "设定禁区清单": { type: "string"},
                        "可呼应伏笔清单": { type: "string"},
                        "潜在矛盾预警": { type: "string"},
                        "可推进剧情方向": { type: "string"},
                        "合规性报告": { type: "string"}
                    }
                }
            }
        });
        const precheckResult = JSON.parse(result.trim());
        currentPrecheckResult = precheckResult;
        const reportText = `合规性校验结果：${precheckResult.isPass ? "通过": "不通过"}
人设红线清单：${precheckResult["人设红线清单"]}
设定禁区清单：${precheckResult["设定禁区清单"]}
可呼应伏笔清单：${precheckResult["可呼应伏笔清单"]}
潜在矛盾预警：${precheckResult["潜在矛盾预警"]}
可推进剧情方向：${precheckResult["可推进剧情方向"]}
详细报告：${precheckResult["合规性报告"]}`.trim();
        const statusText = precheckResult.isPass ? "通过": "不通过";
        $("#precheck-status").text(statusText).removeClass("status-default status-success status-danger").addClass(precheckResult.isPass ? "status-success": "status-danger");
        $("#precheck-report").val(reportText);
        extension_settings[extensionName].precheckReport = precheckResult;
        extension_settings[extensionName].precheckStatus = statusText;
        extension_settings[extensionName].precheckReportText = reportText;
        saveSettingsDebounced();
        return {
            isPass: precheckResult.isPass,
            preGraph: precheckResult.preMergedGraph,
            report: reportText,
            redLines: precheckResult["人设红线清单"],
            forbiddenRules: precheckResult["设定禁区清单"],
            foreshadowList: precheckResult["可呼应伏笔清单"],
            conflictWarning: precheckResult["潜在矛盾预警"]
        };
    } catch (error) {
        console.error('前置校验失败:', error);
        toastr.error(`前置校验失败: ${error.message}`, "小说续写器");
        const result = {
            isPass: true,
            preGraph: {},
            report: "前置校验执行失败，将基于基准章节内容直接续写",
            redLines: "无明确人设红线",
            forbiddenRules: "无明确设定禁区",
            foreshadowList: "无明确可呼应伏笔",
            conflictWarning: "无潜在矛盾预警"
        };
        currentPrecheckResult = result;
        return result;
    }
}
async function evaluateContinueQuality(continueContent, precheckResult, baseGraph, baseChapterContent, targetWordCount) {
    const context = getContext();
    const { generateRaw } = context;
    const actualWordCount = continueContent.length;
    const wordErrorRate = Math.abs(actualWordCount - targetWordCount) / targetWordCount;
    const systemPrompt = `触发词：小说续写质量评估、多维度合规性校验强制约束（100%遵守）：
1. 严格按照5个维度执行评估，单项得分0-100分，总分=5个维度得分的平均值，精确到整数
2. 合格标准：单项得分不得低于80分，总分不得低于85分，不符合即为不合格
3. 所有评估只能基于提供的前置校验结果、知识图谱、基准章节内容，不能引入外部主观标准
4. 必须校验字数合规性：目标字数${targetWordCount}字，实际字数${actualWordCount}字，误差超过10%（当前误差率${(wordErrorRate*100).toFixed(2)}%），内容质量得分必须对应扣分
5. 输出必须为纯JSON格式，无任何前置/后置内容、注释、markdown，必须以{开头、以}结尾
评估维度说明：
● 人设一致性：校验续写内容中人物的言行、性格、动机是否符合人设设定，有无OOC问题
● 设定合规性：校验续写内容是否符合世界观设定，有无吃书、新增违规设定、违反原有规则的问题
● 剧情衔接度：校验续写内容与前文的衔接是否自然，逻辑是否自洽，有无剧情断层、前后矛盾的问题
● 文风匹配度：校验续写内容的叙事视角、语言风格、对话模式、节奏规律是否与原文一致，有无风格割裂
● 内容质量：校验续写内容是否有完整的情节、生动的细节、符合逻辑的对话，有无无意义水内容、剧情拖沓、逻辑混乱的问题，字数是否符合要求`;
    const userPrompt = `待评估续写内容：${continueContent}
前置校验合规边界：${JSON.stringify(precheckResult)}
小说核心设定知识图谱：${JSON.stringify(baseGraph)}
续写基准章节内容：${baseChapterContent}
目标续写字数：${targetWordCount}字
实际续写字数：${actualWordCount}字
请执行多维度质量评估，输出符合要求的JSON内容。`;
    try {
        const result = await generateRaw({ systemPrompt, prompt: userPrompt, jsonSchema: qualityEvaluateSchema });
        return JSON.parse(result.trim());
    } catch (error) {
        console.error('质量评估失败:', error);
        toastr.error(`质量评估失败: ${error.message}`, "小说续写器");
        return {
            总分: 90,
            人设一致性得分: 90,
            设定合规性得分: 90,
            剧情衔接度得分: 90,
            文风匹配度得分: 90,
            内容质量得分: 90,
            评估报告: "质量评估执行失败，默认通过",
            是否合格: true
        };
    }
}
async function updateModifiedChapterGraph(chapterId, modifiedContent) {
    const context = getContext();
    const { generateRaw } = context;
    const targetChapter = currentParsedChapters.find(item => item.id === parseInt(chapterId));
    if (!targetChapter) {
        toastr.error('目标章节不存在', "小说续写器");
        return null;
    }
    if (!modifiedContent.trim()) {
        toastr.error('魔改后的章节内容不能为空', "小说续写器");
        return null;
    }
    const systemPrompt = `触发词：构建单章节知识图谱JSON、小说魔改章节解析强制约束（100%遵守）：
1. 输出必须为纯JSON格式，无任何前置/后置内容、注释、markdown
2. 必须以{开头，以}结尾，无其他字符
3. 仅基于提供的魔改后章节内容分析，不引入任何外部内容
4. 严格包含所有要求的字段，不修改字段名
5. 无对应内容设为"暂无"，数组设为[]，不得留空
6. 必须实现全链路双向可追溯，所有信息必须关联对应原文位置
7. 同一人物、设定、事件不能重复出现，同一人物的不同别名必须合并为同一个唯一实体条目
8. 基础章节信息必须填写：章节号=${targetChapter.id}，章节节点唯一标识=chapter_${targetChapter.id}，本章字数=${targetChapter.content.length}
必填字段：基础章节信息、人物信息、世界观设定、核心剧情线、文风特点、实体关系网络、变更与依赖信息、逆向分析洞察`;
    const userPrompt = `小说章节标题：${targetChapter.title}\n魔改后章节内容：${modifiedContent}`;
    try {
        toastr.info('正在更新魔改章节图谱，请稍候...', "小说续写器");
        const result = await generateRaw({ systemPrompt, prompt: userPrompt, jsonSchema: graphJsonSchema });
        const graphData = JSON.parse(result.trim());
        const graphMap = extension_settings[extensionName].chapterGraphMap || {};
        graphMap[chapterId] = graphData;
        extension_settings[extensionName].chapterGraphMap = graphMap;
        currentParsedChapters.find(item => item.id === parseInt(chapterId)).content = modifiedContent;
        extension_settings[extensionName].chapterList = currentParsedChapters;
        saveSettingsDebounced();
        renderChapterList(currentParsedChapters);
        NovelReader.renderChapterList();
        toastr.success('魔改章节图谱更新完成！', "小说续写器");
        return graphData;
    } catch (error) {
        console.error('魔改章节图谱更新失败:', error);
        toastr.error(`魔改章节图谱更新失败: ${error.message}`, "小说续写器");
        return null;
    }
}
async function updateGraphWithContinueContent(continueChapter, continueId) {
    const context = getContext();
    const { generateRaw } = context;
    const graphMap = extension_settings[extensionName].chapterGraphMap || {};
    const systemPrompt = `触发词：构建单章节知识图谱JSON、小说续写章节解析强制约束（100%遵守）：
1. 输出必须为纯JSON格式，无任何前置/后置内容、注释、markdown
2. 必须以{开头，以}结尾，无其他字符
3. 仅基于提供的续写章节内容分析，不引入任何外部内容
4. 严格包含所有要求的字段，不修改字段名
5. 无对应内容设为"暂无"，数组设为[]，不得留空
必填字段：基础章节信息、人物信息、世界观设定、核心剧情线、文风特点、实体关系网络、变更与依赖信息、逆向分析洞察`;
    const userPrompt = `小说章节标题：续写章节${continueId}\n小说章节内容：${continueChapter.content}`;
    try {
        const result = await generateRaw({ systemPrompt, prompt: userPrompt, jsonSchema: graphJsonSchema });
        const graphData = JSON.parse(result.trim());
        graphMap[`continue_${continueId}`] = graphData;
        extension_settings[extensionName].chapterGraphMap = graphMap;
        saveSettingsDebounced();
        return graphData;
    } catch (error) {
        console.error('续写章节图谱更新失败:', error);
        return null;
    }
}

// 图谱合规性校验函数（深度校验+详细报告）
async function validateGraphCompliance() {
    const mergedGraph = extension_settings[extensionName].mergedGraph || {};
    const graphMap = extension_settings[extensionName].chapterGraphMap || {};
    const chapterCount = currentParsedChapters.length;

    if (Object.keys(mergedGraph).length === 0 && Object.keys(graphMap).length === 0) {
        const result = "⚠️ 校验失败：未找到任何图谱数据，请先生成单章节图谱或合并全量图谱";
        $("#graph-validate-content").val(result);
        $("#graph-validate-result").show();
        extension_settings[extensionName].graphValidateResultShow = true;
        saveSettingsDebounced();
        toastr.warning('未找到任何图谱数据，校验失败', "小说续写器");
        return false;
    }

    let isFullGraph = false;
    let targetSchema = null;
    let graphType = "";
    let validateErrors = [];
    let validatePassItems = [];

    const fullRequiredFields = mergeGraphJsonSchema.value.required;
    const singleRequiredFields = graphJsonSchema.value.required;
    const hasFullFields = fullRequiredFields.every(field => Object.hasOwn(mergedGraph, field));

    if (hasFullFields) {
        isFullGraph = true;
        targetSchema = mergeGraphJsonSchema.value;
        graphType = "全量合并图谱";
        validatePassItems.push("✅ 图谱类型识别：全量合并图谱，根节点结构完整");
    } else {
        isFullGraph = false;
        targetSchema = graphJsonSchema.value;
        graphType = "单章节图谱";
        validatePassItems.push("✅ 图谱类型识别：单章节图谱，根节点结构完整");
    }

    const schemaErrors = validateSchemaDeep(mergedGraph, targetSchema);
    if (schemaErrors.length > 0) {
        validateErrors = [...validateErrors, ...schemaErrors];
    } else {
        validatePassItems.push(`✅ Schema合规性：${graphType}所有必填字段完整，数据格式符合规范`);
    }

    if (isFullGraph) {
        const totalChapters = mergedGraph?.全局基础信息?.总章节数 || 0;
        if (totalChapters > 0 && totalChapters !== chapterCount) {
            validateErrors.push(`⚠️ 业务逻辑警告：全量图谱总章节数(${totalChapters})与实际解析章节数(${chapterCount})不一致`);
        } else if (totalChapters > 0) {
            validatePassItems.push("✅ 业务逻辑校验：全量图谱章节数与实际解析章节数匹配");
        }

        const logicScore = mergedGraph?.逆向分析与质量评估?.全文本逻辑自洽性得分 || 0;
        if (logicScore >= 60) {
            validatePassItems.push(`✅ 逻辑自洽性校验：全文本逻辑自洽性得分${logicScore}/100，符合要求`);
        } else if (logicScore > 0) {
            validateErrors.push(`⚠️ 业务逻辑警告：全文本逻辑自洽性得分${logicScore}/100，低于60分，建议重新合并图谱`);
        }

        const characterCount = mergedGraph?.人物信息库?.length || 0;
        if (characterCount > 0) {
            validatePassItems.push(`✅ 人物信息校验：共识别到${characterCount}个核心人物，人物库结构完整`);
        } else {
            validateErrors.push("❌ 业务逻辑错误：人物信息库为空，图谱无有效人物数据");
        }

        const relationCount = mergedGraph?.全量实体关系网络?.length || 0;
        if (relationCount >= 20) {
            validatePassItems.push(`✅ 实体关系校验：共识别到${relationCount}组实体关系，符合最小数量要求`);
        } else if (relationCount > 0) {
            validateErrors.push(`⚠️ 业务逻辑警告：实体关系网络仅${relationCount}组，低于最小要求20组，建议重新合并图谱`);
        }
    } else {
        const chapterWordCount = mergedGraph?.基础章节信息?.本章字数 || 0;
        if (chapterWordCount > 0) {
            validatePassItems.push(`✅ 章节信息校验：本章字数${chapterWordCount}，基础信息完整`);
        } else {
            validateErrors.push("❌ 业务逻辑错误：基础章节信息缺失字数数据，图谱无效");
        }

        const characterCount = mergedGraph?.人物信息?.length || 0;
        if (characterCount > 0) {
            validatePassItems.push(`✅ 人物信息校验：本章共识别到${characterCount}个核心人物`);
        } else {
            validateErrors.push("❌ 业务逻辑错误：人物信息为空，图谱无有效人物数据");
        }

        const relationCount = mergedGraph?.实体关系网络?.length || 0;
        if (relationCount >= 5) {
            validatePassItems.push(`✅ 实体关系校验：本章共识别到${relationCount}组实体关系，符合最小数量要求`);
        } else if (relationCount > 0) {
            validateErrors.push(`⚠️ 业务逻辑警告：实体关系网络仅${relationCount}组，低于最小要求5组，建议重新生成图谱`);
        }
    }

    if (chapterCount > 0) {
        const graphCoverCount = Object.keys(graphMap).filter(key => !isNaN(key)).length;
        const coverRate = Math.floor((graphCoverCount / chapterCount) * 100);
        if (coverRate === 100) {
            validatePassItems.push(`✅ 章节图谱覆盖度：${graphCoverCount}/${chapterCount} 个章节已生成图谱，覆盖率100%`);
        } else {
            validateErrors.push(`⚠️ 章节图谱覆盖度：${graphCoverCount}/${chapterCount} 个章节已生成图谱，覆盖率${coverRate}%，建议补全未生成章节的图谱`);
        }
    }

    let finalReport = `===== 图谱合规性深度校验报告 =====
校验时间：${new Date().toLocaleString()}
图谱类型：${graphType}
校验结果：${validateErrors.length === 0 ? "✅ 全部校验通过" : `⚠️ 发现${validateErrors.length}个问题`}

====================
✅ 校验通过项
====================
${validatePassItems.join('\n')}

====================
❌ 问题与警告项
====================
${validateErrors.length === 0 ? "无任何问题，图谱完全合规" : validateErrors.join('\n')}

====================
💡 修复建议
====================
${validateErrors.length === 0 
? "当前图谱完全符合规范，可正常用于续写生成" 
: `1. 针对【必填字段缺失/类型错误】：请重新生成/合并图谱，确保所有必填字段完整
2. 针对【数组长度不足】：请优化生成提示词，确保生成的图谱包含足够的实体关系和人物信息
3. 针对【章节覆盖度不足】：请批量生成所有章节的图谱，提升覆盖度
4. 针对【逻辑得分过低】：请重新合并全量图谱，优化全局逻辑一致性`}`;

    $("#graph-validate-content").val(finalReport);
    $("#graph-validate-result").show();
    extension_settings[extensionName].graphValidateResultShow = true;
    saveSettingsDebounced();

    const isPass = validateErrors.filter(e => e.includes("❌")).length === 0;
    if (isPass) {
        toastr.success('图谱合规性深度校验通过，详细报告已生成', "小说续写器");
    } else {
        toastr.warning(`图谱校验发现${validateErrors.length}个问题，详细报告已生成`, "小说续写器");
    }
    return isPass;
}

// 章节管理核心函数
function splitNovelIntoChapters(novelText, regexSource) {
    try {
        const settings = extension_settings[extensionName];
        if (settings.splitMode === 'wordCount') {
            return splitNovelByWordCount(novelText, settings.splitWordCount);
        }

        const cleanText = removeBOM(novelText).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        const chapterRegex = new RegExp(regexSource, 'gm');
        const matches = [...cleanText.matchAll(chapterRegex)];
        const chapters = [];
        if (matches.length === 0) {
            return [{ id: 0, title: '全文', content: cleanText, hasGraph: false }];
        }
        for (let i = 0; i < matches.length; i++) {
            const start = matches[i].index + matches[i][0].length;
            const end = i < matches.length - 1 ? matches[i + 1].index : cleanText.length;
            const title = matches[i][0].trim();
            const content = cleanText.slice(start, end).trim();
            if (content) {
                chapters.push({
                    id: i,
                    title,
                    content,
                    hasGraph: false
                });
            }
        }
        toastr.success(`解析完成，共找到 ${chapters.length} 个章节`, "小说续写器");
        return chapters;
    } catch (error) {
        console.error('章节拆分失败:', error);
        toastr.error('章节正则表达式格式错误，请检查', "小说续写器");
        return [];
    }
}

function renderChapterSelect(chapters) {
    const $select = $('#write-chapter-select');
    $('#write-chapter-content').val('').prop('readonly', true);
    $('#precheck-status').text("未执行").removeClass("status-success status-danger").addClass("status-default");
    $('#precheck-report').val('');
    $('#quality-result-block').hide();
    if (chapters.length === 0) {
        $select.html('<option value="">请先解析章节</option>');
        return;
    }
    const optionHtml = chapters.map(chapter => `<option value="${chapter.id}">${chapter.title}</option>`).join('');
    $select.html(`<option value="">请选择基准章节</option>${optionHtml}`);
}
async function sendChaptersBatch(chapters) {
    const context = getContext();
    const settings = extension_settings[extensionName];
    if (isSending) {
        toastr.warning('正在发送中，请等待完成或停止发送', "小说续写器");
        return;
    }
    if (chapters.length === 0) {
        toastr.warning('没有可发送的章节', "小说续写器");
        return;
    }
    const currentCharName = context.characters[context.characterId]?.name;
    if (!currentCharName) {
        toastr.error('请先选择一个聊天角色', "小说续写器");
        return;
    }
    isSending = true;
    stopSending = false;
    let successCount = 0;
    setButtonDisabled('#import-selected-btn, #import-all-btn', true);
    setButtonDisabled('#stop-send-btn', false);
    try {
        for (let i = 0; i < chapters.length; i++) {
            if (stopSending) break;
            const chapter = chapters[i];
            const command = renderCommandTemplate(settings.sendTemplate, currentCharName, chapter.content);
            await context.executeSlashCommandsWithOptions(command);
            successCount++;
            updateProgress('novel-import-progress', 'novel-import-status', i + 1, chapters.length, "发送进度");
            if (i < chapters.length - 1 && !stopSending) {
                await new Promise(resolve => setTimeout(resolve, settings.sendDelay));
            }
        }
        toastr.success(`发送完成！成功发送 ${successCount}/${chapters.length} 个章节`, "小说续写器");
    } catch (error) {
        console.error('发送失败:', error);
        toastr.error(`发送失败: ${error.message}`, "小说续写器");
    } finally {
        isSending = false;
        stopSending = false;
        updateProgress('novel-import-progress', 'novel-import-status', 0, 0);
        setButtonDisabled('#import-selected-btn, #import-all-btn, #stop-send-btn', false);
    }
}
function getSelectedChapters() {
    const checkedInputs = document.querySelectorAll('.chapter-select:checked');
    const selectedIndexes = [...checkedInputs].map(input => parseInt(input.dataset.index));
    return selectedIndexes.map(index => currentParsedChapters.find(item => item.id === index)).filter(Boolean);
}

// 知识图谱核心函数
async function generateSingleChapterGraph(chapter) {
    const context = getContext();
    const { generateRaw } = context;
    const systemPrompt = `触发词：构建单章节知识图谱JSON、小说章节解析强制约束（100%遵守）：
1. 输出必须为纯JSON格式，无任何前置/后置内容、注释、markdown
2. 必须以{开头，以}结尾，无其他字符
3. 仅基于提供的小说文本分析，不引入任何外部内容
4. 严格包含所有要求的字段，不修改字段名
5. 无对应内容设为"暂无"，数组设为[]，不得留空
6. 必须实现全链路双向可追溯，所有信息必须关联对应原文位置
7. 同一人物、设定、事件不能重复出现，同一人物的不同别名必须合并为同一个唯一实体条目
8. 基础章节信息必须填写：章节号=${chapter.id}，章节节点唯一标识=chapter_${chapter.id}，本章字数=${chapter.content.length}
必填字段：基础章节信息、人物信息、世界观设定、核心剧情线、文风特点、实体关系网络、变更与依赖信息、逆向分析洞察`;
    const userPrompt = `小说章节标题：${chapter.title}\n小说章节内容：${chapter.content}`;
    try {
        const result = await generateRaw({ systemPrompt, prompt: userPrompt, jsonSchema: graphJsonSchema });
        const graphData = JSON.parse(result.trim());
        return graphData;
    } catch (error) {
        console.error(`章节${chapter.title}图谱生成失败:`, error);
        toastr.error(`章节${chapter.title}图谱生成失败`, "小说续写器");
        return null;
    }
}
async function generateChapterGraphBatch(chapters) {
    if (isGeneratingGraph) {
        toastr.warning('正在生成图谱中，请等待完成', "小说续写器");
        return;
    }
    if (chapters.length === 0) {
        toastr.warning('没有可生成图谱的章节', "小说续写器");
        return;
    }
    isGeneratingGraph = true;
    stopGenerateFlag = false;
    let successCount = 0;
    const graphMap = extension_settings[extensionName].chapterGraphMap || {};
    setButtonDisabled('#graph-single-btn, #graph-batch-btn, #graph-merge-btn', true);
    try {
        for (let i = 0; i < chapters.length; i++) {
            if (stopGenerateFlag) break;
            const chapter = chapters[i];
            updateProgress('graph-progress', 'graph-generate-status', i + 1, chapters.length, "图谱生成进度");
            if (graphMap[chapter.id]) {
                successCount++;
                continue;
            }
            const graphData = await generateSingleChapterGraph(chapter);
            if (graphData) {
                graphMap[chapter.id] = graphData;
                currentParsedChapters.find(item => item.id === chapter.id).hasGraph = true;
                successCount++;
            }
            if (i < chapters.length - 1 && !stopGenerateFlag) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
        extension_settings[extensionName].chapterGraphMap = graphMap;
        extension_settings[extensionName].chapterList = currentParsedChapters;
        saveSettingsDebounced();
        renderChapterList(currentParsedChapters);
        toastr.success(`图谱生成完成！成功生成 ${successCount}/${chapters.length} 个章节图谱`, "小说续写器");
    } catch (error) {
        console.error('批量生成图谱失败:', error);
        toastr.error(`图谱生成失败: ${error.message}`, "小说续写器");
    } finally {
        isGeneratingGraph = false;
        stopGenerateFlag = false;
        updateProgress('graph-progress', 'graph-generate-status', 0, 0);
        setButtonDisabled('#graph-single-btn, #graph-batch-btn, #graph-merge-btn', false);
    }
}
async function mergeAllGraphs() {
    const context = getContext();
    const { generateRaw } = context;
    const graphMap = extension_settings[extensionName].chapterGraphMap || {};
    const graphList = Object.values(graphMap);
    if (graphList.length === 0) {
        toastr.warning('没有可合并的章节图谱，请先生成图谱', "小说续写器");
        return;
    }
    setButtonDisabled('#graph-merge-btn', true);
    const systemPrompt = `触发词：合并全量知识图谱JSON、小说全局图谱构建强制约束（100%遵守）：
1. 输出必须为纯JSON格式，无任何前置/后置内容、注释、markdown
2. 必须以{开头，以}结尾，无其他字符
3. 仅基于提供的多组图谱合并，不引入任何外部内容
4. 严格去重，同一人物/设定/事件不能重复，不同别名合并为同一条目
5. 同一设定以最新章节的生效内容为准，同时保留历史变更记录
6. 严格包含所有要求的字段，不修改字段名
7. 无对应内容设为"暂无"，数组设为[]，不得留空
8. 必须构建完整的反向依赖图谱，支持任意章节续写的前置信息提取
必填字段：全局基础信息、人物信息库、世界观设定库、全剧情时间线、全局文风标准、全量实体关系网络、反向依赖图谱、逆向分析与质量评估`;
    const userPrompt = `待合并的多组知识图谱：\n${JSON.stringify(graphList, null, 2)}`;
    try {
        toastr.info('开始合并知识图谱，请稍候...', "小说续写器");
        const result = await generateRaw({ systemPrompt, prompt: userPrompt, jsonSchema: mergeGraphJsonSchema });
        const mergedGraph = JSON.parse(result.trim());
        extension_settings[extensionName].mergedGraph = mergedGraph;
        saveSettingsDebounced();
        $('#merged-graph-preview').val(JSON.stringify(mergedGraph, null, 2));
        toastr.success('知识图谱合并完成！', "小说续写器");
        return mergedGraph;
    } catch (error) {
        console.error('图谱合并失败:', error);
        toastr.error(`图谱合并失败: ${error.message}`, "小说续写器");
        return null;
    } finally {
        setButtonDisabled('#graph-merge-btn', false);
    }
}

// 无限续写核心函数
function renderContinueWriteChain(chain) {
    const $chainContainer = $('#continue-write-chain');
    const scrollTop = $chainContainer.scrollTop();
    if (chain.length === 0) {
        $chainContainer.html('<p class="empty-tip">暂无续写章节，生成续写内容后自动添加到此处</p>');
        return;
    }
    const chainHtml = chain.map((chapter, index) => `
        <div class="continue-chapter-item">
            <div class="card-header-inline">
                <div class="continue-chapter-title">${chapter.title}</div>
                <div class="btn-group-row">
                    <button class="btn btn-sm btn-primary continue-write-btn" data-chain-id="${chapter.id}">继续续写</button>
                    <button class="btn btn-sm btn-outline continue-copy-btn" data-chain-id="${chapter.id}">复制</button>
                    <button class="btn btn-sm btn-outline continue-send-btn" data-chain-id="${chapter.id}">发送</button>
                    <button class="btn btn-sm btn-danger continue-delete-btn" data-chain-id="${chapter.id}">删除</button>
                </div>
            </div>
            <textarea class="continue-chapter-content" data-chain-id="${chapter.id}">${chapter.content}</textarea>
        </div>
    `).join('');
    $chainContainer.html(chainHtml);
    $chainContainer.scrollTop(scrollTop);
}
function initContinueChainEvents() {
    const $root = $('#novel-writer-panel');
    $root.off('input', '.continue-chapter-content').on('input', '.continue-chapter-content', function(e) {
        const chainId = parseInt($(e.target).data('chain-id'));
        const newContent = $(e.target).val();
        const chapterIndex = continueWriteChain.findIndex(item => item.id === chainId);
        if (chapterIndex !== -1) {
            continueWriteChain[chapterIndex].content = newContent;
            extension_settings[extensionName].continueWriteChain = continueWriteChain;
            saveSettingsDebounced();
        }
    });
    $root.off('click', '.continue-write-btn').on('click', '.continue-write-btn', function(e) {
        e.stopPropagation();
        const chainId = parseInt($(e.target).data('chain-id'));
        generateContinueWrite(chainId);
    });
    $root.off('click', '.continue-copy-btn').on('click', '.continue-copy-btn', async function(e) {
        e.stopPropagation();
        const chainId = parseInt($(e.target).data('chain-id'));
        const chapter = continueWriteChain.find(item => item.id === chainId);
        if (!chapter || !chapter.content) {
            toastr.warning('没有可复制的内容', "小说续写器");
            return;
        }
        const success = await copyToClipboard(chapter.content);
        if (success) {
            toastr.success('续写内容已复制到剪贴板', "小说续写器");
        } else {
            toastr.error('复制失败', "小说续写器");
        }
    });
    $root.off('click', '.continue-send-btn').on('click', '.continue-send-btn', function(e) {
        e.stopPropagation();
        const context = getContext();
        const chainId = parseInt($(e.target).data('chain-id'));
        const chapter = continueWriteChain.find(item => item.id === chainId);
        const currentCharName = context.characters[context.characterId]?.name;
        if (!chapter || !chapter.content) {
            toastr.warning('没有可发送的续写内容', "小说续写器");
            return;
        }
        if (!currentCharName) {
            toastr.error('请先选择一个聊天角色', "小说续写器");
            return;
        }
        const command = renderCommandTemplate(extension_settings[extensionName].sendTemplate, currentCharName, chapter.content);
        context.executeSlashCommandsWithOptions(command).then(() => {
            toastr.success('续写内容已发送到对话框', "小说续写器");
        }).catch((error) => {
            toastr.error(`发送失败: ${error.message}`, "小说续写器");
        });
    });
    $root.off('click', '.continue-delete-btn').on('click', '.continue-delete-btn', function(e) {
        e.stopPropagation();
        const chainId = parseInt($(e.target).data('chain-id'));
        const chapterIndex = continueWriteChain.findIndex(item => item.id === chainId);
        if (chapterIndex === -1) {
            toastr.warning('章节不存在', "小说续写器");
            return;
        }
        continueWriteChain.splice(chapterIndex, 1);
        extension_settings[extensionName].continueWriteChain = continueWriteChain;
        saveSettingsDebounced();
        renderContinueWriteChain(continueWriteChain);
        NovelReader.renderChapterList();
        toastr.success('已删除该续写章节', "小说续写器");
    });
}
async function generateContinueWrite(targetChainId) {
    const context = getContext();
    const { generateRaw } = context;
    const selectedBaseChapterId = $('#write-chapter-select').val();
    const editedBaseChapterContent = $('#write-chapter-content').val().trim();
    const wordCount = parseInt($('#write-word-count').val()) || 2000;
    const mergedGraph = extension_settings[extensionName].mergedGraph || {};
    const enableQualityCheck = extension_settings[extensionName].enableQualityCheck;
    if (isGeneratingWrite) {
        toastr.warning('正在生成续写内容中，请等待完成', "小说续写器");
        return;
    }
    if (!selectedBaseChapterId) {
        toastr.error('请先选择初始续写基准章节', "小说续写器");
        return;
    }
    if (!editedBaseChapterContent) {
        toastr.error('初始基准章节内容不能为空', "小说续写器");
        return;
    }
    const targetChapter = continueWriteChain.find(item => item.id === targetChainId);
    if (!targetChapter) {
        toastr.error('目标续写章节不存在', "小说续写器");
        return;
    }
    const targetContent = targetChapter.content;
    const targetParagraphs = targetContent.split('\n').filter(p => p.trim() !== '');
    const targetLastParagraph = targetParagraphs.length > 0 ? targetParagraphs[targetParagraphs.length - 1].trim() : '';
    const precheckResult = await validateContinuePrecondition(selectedBaseChapterId, editedBaseChapterContent);
    const useGraph = Object.keys(precheckResult.preGraph).length > 0 ? precheckResult.preGraph : mergedGraph;
    let fullContextContent = '';
    const baseChapterId = parseInt(selectedBaseChapterId);
    const preBaseChapters = currentParsedChapters.filter(chapter => chapter.id < baseChapterId);
    preBaseChapters.forEach(chapter => {
        fullContextContent += `${chapter.title}\n${chapter.content}\n\n`;
    });
    const baseChapterTitle = currentParsedChapters.find(c => c.id === baseChapterId)?.title || '基准章节';
    fullContextContent += `${baseChapterTitle}\n${editedBaseChapterContent}\n\n`;
    const targetBeforeChapters = continueWriteChain.slice(0, targetChainId + 1);
    targetBeforeChapters.forEach((chapter, index) => {
        fullContextContent += `续写章节 ${index + 1}\n${chapter.content}\n\n`;
    });
    const systemPrompt = `小说续写规则（100%遵守）：
1. 人设锁定：续写内容必须完全贴合小说的核心人物设定，绝对不能出现人设崩塌（OOC），严格遵守以下人设红线：${precheckResult.redLines}
2. 设定合规：续写内容必须完全符合小说的世界观设定，绝对不能出现吃书、新增违规设定、违反原有规则的问题，严格遵守以下设定禁区：${precheckResult.forbiddenRules}
3. 文本衔接：续写内容必须紧接在上一章（续写章节 ${targetChapter.title}）的最后一段之后开始，从那个地方继续写下去，确保文本连续，逻辑自洽。上一章的最后一段内容是："${targetLastParagraph}"
续写必须从这段文字之后直接开始，不能重复这段内容。
4. 剧情承接：续写内容必须承接前文所有剧情，合理呼应以下伏笔：${precheckResult.foreshadowList}，开启新章节，且与上述文本衔接要求一致，不得重复前文已有的情节。
5. 文风统一：续写内容必须完全贴合原小说的叙事风格、语言习惯、对话方式、节奏特点，和原文无缝衔接，无风格割裂
6. 剧情合理：续写内容要符合原小说的世界观设定，推动主线剧情发展，有完整的情节起伏、生动的细节、符合人设的对话
7. 输出要求：只输出续写的正文内容，不要任何标题、章节名、解释、备注、说明、分割线
8. 字数要求：续写约${wordCount}字，误差不超过10%
9. 矛盾规避：必须规避以下潜在剧情矛盾：${precheckResult.conflictWarning}
10. 小数据适配：若前文内容较少，严格遵循现有文本的叙事范式、对话模式、剧情节奏，不做风格跳脱的续写，不无限新增设定与人物`;
    const userPrompt = `小说核心设定知识图谱：${JSON.stringify(useGraph)}
完整前文上下文：${fullContextContent}
请基于以上完整的前文内容和知识图谱，按照规则续写后续的新章节正文，确保和前文最后一段内容完美衔接，不重复前文情节。`;
    isGeneratingWrite = true;
    stopGenerateFlag = false;
    setButtonDisabled('#write-generate-btn, .continue-write-btn', true);
    setButtonDisabled('#write-stop-btn', false);
    toastr.info('正在生成续写章节，请稍候...', "小说续写器");
    try {
        let continueContent = await generateRaw({ systemPrompt, prompt: userPrompt });
        if (stopGenerateFlag) {
            $('#write-status').text('已停止生成，丢弃本次生成结果');
            toastr.info('已停止生成，丢弃本次生成结果', "小说续写器");
            return;
        }
        if (!continueContent.trim()) {
            throw new Error('生成内容为空');
        }
        continueContent = continueContent.trim();
        let qualityResult = null;
        if (enableQualityCheck && !stopGenerateFlag) {
            toastr.info('正在执行续写内容质量校验，请稍候...', "小说续写器");
            qualityResult = await evaluateContinueQuality(continueContent, precheckResult, useGraph, editedBaseChapterContent, wordCount);
            if (!qualityResult.是否合格 && !stopGenerateFlag) {
                toastr.warning(`续写内容质量不合格，总分${qualityResult.总分}，正在重新生成...`, "小说续写器");
                continueContent = await generateRaw({
                    systemPrompt: systemPrompt + `\n注意：本次续写必须修正以下问题：${qualityResult.评估报告}`,
                    prompt: userPrompt
                });
                if (stopGenerateFlag) {
                    $('#write-status').text('已停止生成');
                    toastr.info('已停止生成，丢弃本次生成结果', "小说续写器");
                    return;
                }
                continueContent = continueContent.trim();
                qualityResult = await evaluateContinueQuality(continueContent, precheckResult, useGraph, editedBaseChapterContent, wordCount);
            }
            $("#quality-score").text(qualityResult.总分);
            $("#quality-report").val(qualityResult.评估报告);
            $("#quality-result-block").show();
            extension_settings[extensionName].qualityResultShow = true;
            saveSettingsDebounced();
        }
        const newChapter = {
            id: continueChapterIdCounter++,
            title: `续写章节 ${continueWriteChain.length + 1}`,
            content: continueContent,
            baseChapterId: parseInt(selectedBaseChapterId)
        };
        continueWriteChain.push(newChapter);
        extension_settings[extensionName].continueWriteChain = continueWriteChain;
        extension_settings[extensionName].continueChapterIdCounter = continueChapterIdCounter;
        saveSettingsDebounced();
        await updateGraphWithContinueContent(newChapter, newChapter.id);
        renderContinueWriteChain(continueWriteChain);
        NovelReader.renderChapterList();
        toastr.success('续写章节生成完成！已添加到续写链条', "小说续写器");
    } catch (error) {
        if (!stopGenerateFlag) {
            console.error('继续续写生成失败:', error);
            toastr.error(`继续续写生成失败: ${error.message}`, "小说续写器");
        }
    } finally {
        isGeneratingWrite = false;
        stopGenerateFlag = false;
        setButtonDisabled('#write-generate-btn, .continue-write-btn, #write-stop-btn', false);
    }
}

// 小说续写核心函数
async function generateNovelWrite() {
    const context = getContext();
    const { generateRaw } = context;
    const selectedChapterId = $('#write-chapter-select').val();
    const editedChapterContent = $('#write-chapter-content').val().trim();
    const wordCount = parseInt($('#write-word-count').val()) || 2000;
    const mergedGraph = extension_settings[extensionName].mergedGraph || {};
    const enableQualityCheck = extension_settings[extensionName].enableQualityCheck;
    if (isGeneratingWrite) {
        toastr.warning('正在生成续写内容中，请等待完成', "小说续写器");
        return;
    }
    if (!selectedChapterId) {
        toastr.error('请先选择续写基准章节', "小说续写器");
        return;
    }
    if (!editedChapterContent) {
        toastr.error('基准章节内容不能为空', "小说续写器");
        return;
    }
    const baseParagraphs = editedChapterContent.split('\n').filter(p => p.trim() !== '');
    const baseLastParagraph = baseParagraphs.length > 0 ? baseParagraphs[baseParagraphs.length - 1].trim() : '';
    isGeneratingWrite = true;
    stopGenerateFlag = false;
    setButtonDisabled('#write-generate-btn', true);
    setButtonDisabled('#write-stop-btn', false);
    $('#write-status').text('正在执行续写前置校验...');
    try {
        const precheckResult = await validateContinuePrecondition(selectedChapterId, editedChapterContent);
        const useGraph = Object.keys(precheckResult.preGraph).length > 0 ? precheckResult.preGraph : mergedGraph;
        if (stopGenerateFlag) {
            $('#write-status').text('已停止生成');
            toastr.info('已停止生成，丢弃本次生成结果', "小说续写器");
            return;
        }
        const systemPrompt = `小说续写规则（100%遵守）：
1. 人设锁定：续写内容必须完全贴合小说的核心人物设定，绝对不能出现人设崩塌（OOC），严格遵守以下人设红线：${precheckResult.redLines}
2. 设定合规：续写内容必须完全符合小说的世界观设定，绝对不能出现吃书、新增违规设定、违反原有规则的问题，严格遵守以下设定禁区：${precheckResult.forbiddenRules}
3. 文本衔接：续写内容必须紧接在基准章节的最后一段之后开始，从那个地方继续写下去，确保文本连续，逻辑自洽。基准章节的最后一段内容是："${baseLastParagraph}"
续写必须从这段文字之后直接开始，不能重复这段内容。
4. 剧情承接：续写内容必须承接前文剧情，合理呼应以下伏笔：${precheckResult.foreshadowList}，开启新的章节内容，且与上述文本衔接要求一致。
5. 文风统一：续写内容必须完全贴合原小说的叙事风格、语言习惯、对话方式、节奏特点，和原文无缝衔接，无风格割裂
6. 剧情合理：续写内容要符合原小说的世界观设定，推动主线剧情发展，有完整的情节起伏、生动的细节、符合人设的对话
7. 输出要求：只输出续写的正文内容，不要任何标题、章节名、解释、备注、说明、分割线
8. 字数要求：续写约${wordCount}字，误差不超过10%
9. 矛盾规避：必须规避以下潜在剧情矛盾：${precheckResult.conflictWarning}
10. 小数据适配：若前文内容较少，严格遵循现有文本的叙事范式、对话模式、剧情节奏，不做风格跳脱的续写，不无限新增设定与人物`;
        const userPrompt = `小说核心设定知识图谱：${JSON.stringify(useGraph)}
基准章节内容：${editedChapterContent}
请基于以上内容，按照规则续写后续的章节正文。`;
        $('#write-status').text('正在生成续写章节，请稍候...');
        let continueContent = await generateRaw({ systemPrompt, prompt: userPrompt });
        if (stopGenerateFlag) {
            $('#write-status').text('已停止生成');
            toastr.info('已停止生成，丢弃本次生成结果', "小说续写器");
            return;
        }
        if (!continueContent.trim()) {
            throw new Error('生成内容为空');
        }
        continueContent = continueContent.trim();
        let qualityResult = null;
        if (enableQualityCheck && !stopGenerateFlag) {
            $('#write-status').text('正在执行续写内容质量校验，请稍候...');
            qualityResult = await evaluateContinueQuality(continueContent, precheckResult, useGraph, editedChapterContent, wordCount);
            if (!qualityResult.是否合格 && !stopGenerateFlag) {
                toastr.warning(`续写内容质量不合格，总分${qualityResult.总分}，正在重新生成...`, "小说续写器");
                $('#write-status').text('正在重新生成续写章节，请稍候...');
                continueContent = await generateRaw({
                    systemPrompt: systemPrompt + `\n注意：本次续写必须修正以下问题：${qualityResult.评估报告}`,
                    prompt: userPrompt
                });
                if (stopGenerateFlag) {
                    $('#write-status').text('已停止生成');
                    toastr.info('已停止生成，丢弃本次生成结果', "小说续写器");
                    return;
                }
                continueContent = continueContent.trim();
                qualityResult = await evaluateContinueQuality(continueContent, precheckResult, useGraph, editedChapterContent, wordCount);
            }
            $("#quality-score").text(qualityResult.总分);
            $("#quality-report").val(qualityResult.评估报告);
            $("#quality-result-block").show();
            extension_settings[extensionName].qualityResultShow = true;
            saveSettingsDebounced();
        }
        $('#write-content-preview').val(continueContent);
        $('#write-status').text('续写章节生成完成！');
        extension_settings[extensionName].writeContentPreview = continueContent;
        saveSettingsDebounced();
        const newChapter = {
            id: continueChapterIdCounter++,
            title: `续写章节 ${continueWriteChain.length + 1}`,
            content: continueContent,
            baseChapterId: parseInt(selectedChapterId)
        };
        continueWriteChain.push(newChapter);
        extension_settings[extensionName].continueWriteChain = continueWriteChain;
        extension_settings[extensionName].continueChapterIdCounter = continueChapterIdCounter;
        saveSettingsDebounced();
        await updateGraphWithContinueContent(newChapter, newChapter.id);
        renderContinueWriteChain(continueWriteChain);
        NovelReader.renderChapterList();
        toastr.success('续写章节生成完成！已添加到续写链条', "小说续写器");
    } catch (error) {
        if (!stopGenerateFlag) {
            console.error('续写生成失败:', error);
            $('#write-status').text(`生成失败: ${error.message}`);
            toastr.error(`续写生成失败: ${error.message}`, "小说续写器");
        }
    } finally {
        isGeneratingWrite = false;
        stopGenerateFlag = false;
        setButtonDisabled('#write-generate-btn, #write-stop-btn', false);
    }
}

// ==============================================
// 扩展入口（新增事件绑定，原有逻辑100%保留）
// ==============================================
jQuery(async () =>{
    try {
        const settingsHtml = await $.get(`${extensionFolderPath}/example.html`);
        $("body").append(settingsHtml);
        await new Promise(resolve => setTimeout(resolve, 100));
        console.log("[小说续写插件] HTML加载完成");
    } catch (error) {
        console.error('[小说续写插件] 扩展HTML加载失败:', error);
        toastr.error('小说续写插件加载失败：HTML文件加载异常，请检查文件路径', "插件错误");
        return;
    }

    initDrawerToggle();
    initContinueChainEvents();
    initVisibilityListener();
    await loadSettings();

    $("#my_button").off("click").on("click", onButtonClick);
    $("#example_setting").off("input").on("input", onExampleInput);

    // 正则预设下拉事件绑定
    $("#chapter-regex-preset").off("change").on("change", function(e) {
        const selectedValue = $(this).val();
        if (selectedValue) {
            $("#chapter-regex-input").val(selectedValue);
            extension_settings[extensionName].chapterRegex = selectedValue;
            saveSettingsDebounced();
        }
    });

    // 拆分模式切换事件绑定
    $('input[name="split-mode"]').off("change").on("change", function(e) {
        const selectedMode = $(this).val();
        extension_settings[extensionName].splitMode = selectedMode;
        saveSettingsDebounced();
        toggleSplitMode(selectedMode);
    });

    // 字数拆分配置事件绑定
    $("#split-word-count-input").off("change").on("change", function(e) {
        const wordCount = parseInt($(this).val()) || 3000;
        const safeWordCount = Math.max(1000, Math.min(10000, wordCount));
        $(this).val(safeWordCount);
        extension_settings[extensionName].splitWordCount = safeWordCount;
        saveSettingsDebounced();
    });

    // 【本次优化新增】最小字数配置事件绑定
    $("#min-graph-wordcount-input").off("change").on("change", function(e) {
        const minCount = parseInt($(this).val()) || 200;
        const safeMinCount = Math.max(50, Math.min(5000, minCount));
        $(this).val(safeMinCount);
        extension_settings[extensionName].minChapterGraphWordCount = safeMinCount;
        saveSettingsDebounced();
    });

    // 文件选择事件
    $("#select-file-btn").off("click").on("click", () => {$("#novel-file-upload").click();});
    $("#novel-file-upload").off("change").on("change", (e) => {
        const file = e.target.files[0];
        if (file) {
            $("#file-name-text").text(file.name);
            sortedRegexPresets = [];
            extension_settings[extensionName].currentRegexPresetIndex = -1;
            currentUploadedNovelText = "";
            $("#parse-chapter-btn").text("解析章节");
            saveSettingsDebounced();
        }
    });

    // 【本次优化重写】解析章节按钮事件（自动正则排序循环切换）
    $("#parse-chapter-btn").off("click").on("click", () => {
        const file = $("#novel-file-upload")[0].files[0];
        const manualRegex = $("#chapter-regex-input").val().trim();
        const settings = extension_settings[extensionName];

        if (!file) {
            toastr.warning('请先选择小说TXT文件', "小说续写器");
            return;
        }

        chapterCheckedState.clear();
        extension_settings[extensionName].chapterRegex = manualRegex;
        saveSettingsDebounced();

        const reader = new FileReader();
        reader.onload = async (e) => {
            const novelText = e.target.result;
            currentUploadedNovelText = novelText;
            let useRegex = manualRegex;
            let usePresetLabel = "手动输入正则";
            let finalChapters = [];

            if (manualRegex === defaultSettings.chapterRegex || sortedRegexPresets.length > 0) {
                if (sortedRegexPresets.length === 0) {
                    sortedRegexPresets = getSortedRegexPresets(novelText);
                    if (sortedRegexPresets.length === 0) {
                        toastr.warning('所有预设正则均无法拆分出有效章节，将使用默认正则', "小说续写器");
                        sortedRegexPresets = [{ ...chapterRegexPresets[0], chapterCount: 1 }];
                    }
                    settings.currentRegexPresetIndex = 0;
                } else {
                    settings.currentRegexPresetIndex = (settings.currentRegexPresetIndex + 1) % sortedRegexPresets.length;
                }

                const currentPreset = sortedRegexPresets[settings.currentRegexPresetIndex];
                useRegex = currentPreset.value;
                usePresetLabel = currentPreset.label;
                $("#chapter-regex-input").val(useRegex);
                extension_settings[extensionName].chapterRegex = useRegex;
                $("#parse-chapter-btn").text("再次解析（切换正则）");
                saveSettingsDebounced();
            }

            finalChapters = splitNovelIntoChapters(novelText, useRegex);
            toastr.success(`【${usePresetLabel}】解析完成，共找到 ${finalChapters.length} 个章节`, "小说续写器");

            currentParsedChapters = finalChapters;
            extension_settings[extensionName].chapterList = currentParsedChapters;
            extension_settings[extensionName].chapterGraphMap = {};
            extension_settings[extensionName].mergedGraph = {};
            extension_settings[extensionName].continueWriteChain = [];
            extension_settings[extensionName].continueChapterIdCounter = 1;
            extension_settings[extensionName].selectedBaseChapterId = "";
            extension_settings[extensionName].writeContentPreview = "";
            extension_settings[extensionName].readerState = structuredClone(defaultSettings.readerState);
            $('#merged-graph-preview').val('');
            $('#write-content-preview').val('');
            continueWriteChain = [];
            continueChapterIdCounter = 1;
            saveSettingsDebounced();
            renderChapterList(currentParsedChapters);
            renderChapterSelect(currentParsedChapters);
            renderContinueWriteChain(continueWriteChain);
            NovelReader.renderChapterList();
        };
        reader.onerror = () => {
            toastr.error('文件读取失败，请检查文件编码（仅支持UTF-8）', "小说续写器");
        };
        reader.readAsText(file, 'UTF-8');
    });

    // 全选/反选事件
    $("#select-all-btn").off("click").on("click", () => {
        $(".chapter-select").prop("checked", true);
        currentParsedChapters.forEach(chapter => {
            chapterCheckedState.set(chapter.id, true);
        });
    });
    $("#unselect-all-btn").off("click").on("click", () => {
        $(".chapter-select").prop("checked", false);
        currentParsedChapters.forEach(chapter => {
            chapterCheckedState.set(chapter.id, false);
        });
    });

    // 基础配置事件
    $("#send-template-input").off("change").on("change", (e) => {
        extension_settings[extensionName].sendTemplate = $(e.target).val().trim();
        saveSettingsDebounced();
    });
    $("#send-delay-input").off("change").on("change", (e) => {
        extension_settings[extensionName].sendDelay = parseInt($(e.target).val()) || 100;
        saveSettingsDebounced();
    });
    $("#write-word-count").off("change").on("change", (e) => {
        extension_settings[extensionName].writeWordCount = parseInt($(e.target).val()) || 2000;
        saveSettingsDebounced();
    });

    // 章节导入事件
    $("#import-selected-btn").off("click").on("click", () => {
        const selectedChapters = getSelectedChapters();
        sendChaptersBatch(selectedChapters);
    });
    $("#import-all-btn").off("click").on("click", () => {
        sendChaptersBatch(currentParsedChapters);
    });
    $("#stop-send-btn").off("click").on("click", () => {
        if (isSending) {
            stopSending = true;
            toastr.info('已停止发送', "小说续写器");
        }
    });

    // 【本次优化新增】图谱状态检验事件
    $("#validate-chapter-graph-btn").off("click").on("click", validateChapterGraphStatus);
    $("#graph-status-clear-btn").off("click").on("click", () => {
        $("#graph-status-report").val('');
    });

    // 【本次优化新增】单章节图谱导入导出事件
    $("#single-graph-export-btn").off("click").on("click", exportSingleChapterGraph);
    $("#single-graph-batch-export-btn").off("click").on("click", exportAllSingleChapterGraphs);
    $("#single-graph-import-btn").off("click").on("click", () => $("#single-graph-file-upload").click());
    $("#single-graph-file-upload").off("change").on("change", (e) => importSingleChapterGraphs(e.target.files[0]));

    // 原有图谱事件
    $("#graph-single-btn").off("click").on("click", () => {
        const selectedChapters = getSelectedChapters();
        generateChapterGraphBatch(selectedChapters);
    });
    $("#graph-batch-btn").off("click").on("click", () => {
        generateChapterGraphBatch(currentParsedChapters);
    });
    $("#graph-merge-btn").off("click").on("click", mergeAllGraphs);
    $("#graph-validate-btn").off("click").on("click", validateGraphCompliance);
    $("#graph-import-btn").off("click").on("click", () => {$("#graph-file-upload").click();});
    $("#graph-file-upload").off("change").on("change", (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const graphData = JSON.parse(removeBOM(event.target.result.trim()));
                const fullRequiredFields = mergeGraphJsonSchema.value.required;
                const singleRequiredFields = graphJsonSchema.value.required;
                const hasFullFields = fullRequiredFields.every(field => Object.hasOwn(graphData, field));
                const hasSingleFields = singleRequiredFields.every(field => Object.hasOwn(graphData, field));
                if (!hasFullFields && !hasSingleFields) {
                    throw new Error("图谱格式错误，缺少核心必填字段，不支持该图谱格式");
                }
                extension_settings[extensionName].mergedGraph = graphData;
                saveSettingsDebounced();
                $('#merged-graph-preview').val(JSON.stringify(graphData, null, 2));
                toastr.success('知识图谱导入完成！', "小说续写器");
            } catch (error) {
                console.error('图谱导入失败:', error);
                toastr.error(`导入失败：${error.message}，请检查JSON文件格式是否正确`, "小说续写器");
            } finally {
                $("#graph-file-upload").val('');
            }
        };
        reader.onerror = () => {
            toastr.error('文件读取失败，请检查文件', "小说续写器");
            $("#graph-file-upload").val('');
        };
        reader.readAsText(file, 'UTF-8');
    });
    $("#graph-copy-btn").off("click").on("click", async () => {
        const graphText = $('#merged-graph-preview').val();
        if (!graphText) {
            toastr.warning('没有可复制的图谱内容', "小说续写器");
            return;
        }
        const success = await copyToClipboard(graphText);
        if (success) {
            toastr.success('图谱JSON已复制到剪贴板', "小说续写器");
        } else {
            toastr.error('复制失败', "小说续写器");
        }
    });
    $("#graph-export-btn").off("click").on("click", () => {
        const graphText = $('#merged-graph-preview').val();
        if (!graphText) {
            toastr.warning('没有可导出的图谱内容', "小说续写器");
            return;
        }
        const blob = new Blob([graphText], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = '小说知识图谱.json';
        a.click();
        URL.revokeObjectURL(url);
        toastr.success('图谱JSON已导出', "小说续写器");
    });
    $("#graph-clear-btn").off("click").on("click", () => {
        extension_settings[extensionName].mergedGraph = {};
        extension_settings[extensionName].graphValidateResultShow = false;
        $('#merged-graph-preview').val('');
        $('#graph-validate-result').hide();
        saveSettingsDebounced();
        toastr.success('已清空合并图谱', "小说续写器");
    });

    // 续写模块事件
    $("#write-chapter-select").off("change").on("change", function(e) {
        const selectedChapterId = $(e.target).val();
        currentPrecheckResult = null;
        $("#precheck-status").text("未执行").removeClass("status-success status-danger").addClass("status-default");
        $("#precheck-report").val("");
        $("#write-content-preview").val("");
        $("#write-status").text("");
        $("#quality-result-block").hide();
        extension_settings[extensionName].selectedBaseChapterId = selectedChapterId;
        extension_settings[extensionName].precheckStatus = "未执行";
        extension_settings[extensionName].precheckReportText = "";
        extension_settings[extensionName].writeContentPreview = "";
        extension_settings[extensionName].qualityResultShow = false;
        saveSettingsDebounced();
        if (!selectedChapterId) {
            $('#write-chapter-content').val('').prop('readonly', true);
            return;
        }
        const targetChapter = currentParsedChapters.find(item => item.id == selectedChapterId);
        if (targetChapter) {
            $('#write-chapter-content').val(targetChapter.content).prop('readonly', false);
        }
    });
    $("#graph-update-modified-btn").off("click").on("click", () => {
        const selectedChapterId = $('#write-chapter-select').val();
        const modifiedContent = $('#write-chapter-content').val().trim();
        if (!selectedChapterId) {
            toastr.error('请先选择基准章节', "小说续写器");
            return;
        }
        if (!modifiedContent) {
            toastr.error('基准章节内容不能为空', "小说续写器");
            return;
        }
        updateModifiedChapterGraph(selectedChapterId, modifiedContent);
    });
    $("#precheck-run-btn").off("click").on("click", () => {
        const selectedChapterId = $('#write-chapter-select').val();
        const modifiedContent = $('#write-chapter-content').val().trim();
        if (!selectedChapterId) {
            toastr.error('请先选择基准章节', "小说续写器");
            return;
        }
        validateContinuePrecondition(selectedChapterId, modifiedContent);
    });
    $("#quality-check-switch").off("change").on("change", (e) => {
        const isChecked = Boolean($(e.target).prop("checked"));
        extension_settings[extensionName].enableQualityCheck = isChecked;
        saveSettingsDebounced();
    });
    $("#write-generate-btn").off("click").on("click", generateNovelWrite);
    $("#write-stop-btn").off("click").on("click", () => {
        if (isGeneratingWrite) {
            stopGenerateFlag = true;
            isGeneratingWrite = false;
            $('#write-status').text('已停止生成');
            setButtonDisabled('#write-generate-btn, #write-stop-btn', false);
            toastr.info('已停止生成续写内容', "小说续写器");
        }
    });
    $("#write-copy-btn").off("click").on("click", async () => {
        const writeText = $('#write-content-preview').val();
        if (!writeText) {
            toastr.warning('没有可复制的续写内容', "小说续写器");
            return;
        }
        const success = await copyToClipboard(writeText);
        if (success) {
            toastr.success('续写内容已复制到剪贴板', "小说续写器");
        } else {
            toastr.error('复制失败', "小说续写器");
        }
    });
    $("#write-send-btn").off("click").on("click", () => {
        const context = getContext();
        const writeText = $('#write-content-preview').val();
        const currentCharName = context.characters[context.characterId]?.name;
        if (!writeText) {
            toastr.warning('没有可发送的续写内容', "小说续写器");
            return;
        }
        if (!currentCharName) {
            toastr.error('请先选择一个聊天角色', "小说续写器");
            return;
        }
        const command = renderCommandTemplate(extension_settings[extensionName].sendTemplate, currentCharName, writeText);
        context.executeSlashCommandsWithOptions(command).then(() => {
            toastr.success('续写内容已发送到对话框', "小说续写器");
        }).catch((error) => {
            toastr.error(`发送失败: ${error.message}`, "小说续写器");
        });
    });
    $("#write-clear-btn").off("click").on("click", () => {
        $('#write-content-preview').val('');
        $('#write-status').text('');
        $('#quality-result-block').hide();
        extension_settings[extensionName].writeContentPreview = "";
        extension_settings[extensionName].qualityResultShow = false;
        saveSettingsDebounced();
        toastr.success('已清空续写内容', "小说续写器");
    });
    $("#clear-chain-btn").off("click").on("click", () => {
        continueWriteChain = [];
        continueChapterIdCounter = 1;
        extension_settings[extensionName].continueWriteChain = continueWriteChain;
        extension_settings[extensionName].continueChapterIdCounter = continueChapterIdCounter;
        saveSettingsDebounced();
        renderContinueWriteChain(continueWriteChain);
        NovelReader.renderChapterList();
        toastr.success('已清空所有续写章节', "小说续写器");
    });
});
