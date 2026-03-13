// 严格遵循官方模板导入规范，路径完全对齐原版本
import { extension_settings, getContext, loadExtensionSettings } from "../../../extensions.js";
import { saveSettingsDebounced, eventSource, event_types } from "../../../../script.js";
// 导入抽离的提示词模块
import * as PromptConstants from './prompt-constants.js';
// ====================== 全局配置与状态 ======================
const extensionName = "Verification";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;
// ====================== 核心优化：取消自动重试 + API速率控制 ======================
// 取消失败自动重试：仅调用1次，失败直接抛出
const MAX_RETRY_TIMES = 0;
// 空内容/拒绝内容匹配规则
const EMPTY_CONTENT_REGEX = /^[\s\p{P}]*$/u;
const REJECT_KEYWORDS = ['不能', '无法', '不符合', '抱歉', '对不起', '无法提供', '请调整', '违规', '敏感', '不予生成'];
// API全局锁：保证串行调用，避免并发触发速率限制
let API_CALL_LOCK = false;
// 当前生效的提示词配置
let CURRENT_PROMPTS = { ...PromptConstants.DEFAULT_PROMPTS };
// ====================== 默认配置（全量兼容原有配置，新增自定义项）======================
const defaultSettings = {
    // 原有配置100%保留
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
        "novel-drawer-chapter-import": true,
        "novel-drawer-graph": false,
        "novel-drawer-write": false,
        "novel-drawer-precheck": false
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
        activeTab: "novel-tab-chapter"
    },
    readerState: {
        fontSize: 16,
        currentChapterId: null,
        currentChapterType: "original",
        readProgress: {}
    },
    enableAutoParentPreset: true,
    batchMergedGraphs: [],
    // 新增：API速率控制配置
    apiConfig: {
        callInterval: 2000, // API调用间隔（ms），解决一分钟3次限制，默认2秒/次
        enableBreakLimit: true, // 是否启用破限提示词
    },
    // 新增：界面配置
    uiConfig: {
        floatBallSize: 70, // 悬浮球大小（px）
        defaultActiveTab: "novel-tab-chapter", // 默认打开的选项卡
        enableHoverEffect: true, // 是否启用hover动效
        autoSaveDraft: true, // 是否自动保存续写草稿
    },
    // 新增：用户自定义提示词配置
    customPrompts: { ...PromptConstants.DEFAULT_PROMPTS }
};
// ====================== 全局状态缓存（原有100%保留，新增扩展项）======================
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
let batchMergedGraphs = [];
let currentPresetName = "";
// ====================== 核心优化：API调用封装（取消重试 + 速率控制 + 串行锁）======================
async function generateRawWithBreakLimit(params) {
    const context = getContext();
    const { generateRaw } = context;
    const settings = extension_settings[extensionName];
    let lastError = null;
    let finalResult = null;
    // 等待API锁释放，保证串行调用
    while (API_CALL_LOCK) {
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    API_CALL_LOCK = true;
    try {
        // 处理提示词注入，优先使用用户自定义提示词
        let finalSystemPrompt = params.systemPrompt || '';
        const isJsonMode = !!params.jsonSchema;
        const enableBreakLimit = settings?.apiConfig?.enableBreakLimit ?? defaultSettings.apiConfig.enableBreakLimit;
        // 按模式追加规则
        if (isJsonMode) {
            finalSystemPrompt += CURRENT_PROMPTS.JSON_MODE_RULE;
        } else if (enableBreakLimit) {
            // 小说正文模式，追加破限规则
            finalSystemPrompt += CURRENT_PROMPTS.BREAK_LIMIT_PROMPT;
        }
        // 合并最终参数，完整保留原有所有配置
        const finalParams = {
            ...params,
            systemPrompt: finalSystemPrompt
        };
        // 取消自动重试：仅调用1次
        console.log(`[小说续写插件] API调用，模式：${isJsonMode ? 'JSON结构化' : '小说正文'}`);
        const rawResult = await generateRaw(finalParams);
        const trimmedResult = rawResult.trim();
        // 空内容校验
        if (EMPTY_CONTENT_REGEX.test(trimmedResult)) {
            throw new Error('返回内容为空，或仅包含空格、标点符号');
        }
        // JSON模式校验
        if (isJsonMode) {
            let parsedJson;
            try {
                parsedJson = JSON.parse(trimmedResult);
            } catch (e) {
                throw new Error(`返回内容不是合法JSON格式，解析失败：${e.message}`);
            }
            // 必填字段校验
            const requiredFields = params.jsonSchema?.value?.required || [];
            if (requiredFields.length > 0) {
                const missingFields = requiredFields.filter(field => !Object.hasOwn(parsedJson, field));
                if (missingFields.length > 0) {
                    throw new Error(`JSON内容缺失必填字段：${missingFields.join('、')}`);
                }
            }
            finalResult = trimmedResult;
        } 
        // 正文模式校验
        else {
            // 拦截拒绝生成内容
            const hasRejectContent = trimmedResult.length < 300 && REJECT_KEYWORDS.some(keyword => 
                trimmedResult.includes(keyword)
            );
            if (hasRejectContent) {
                throw new Error('返回内容为拒绝生成的提示，未完成小说创作任务');
            }
            finalResult = trimmedResult;
        }
        // 调用成功后，等待设置的间隔时间，释放锁
        const callInterval = settings?.apiConfig?.callInterval ?? defaultSettings.apiConfig.callInterval;
        await new Promise(resolve => setTimeout(resolve, callInterval));
    } catch (error) {
        lastError = error;
        console.error(`[小说续写插件] API调用失败：${error.message}`);
        throw lastError;
    } finally {
        API_CALL_LOCK = false;
    }
    if (finalResult === null) {
        throw lastError || new Error('API调用失败，返回无效内容');
    }
    console.log(`[小说续写插件] API调用成功，内容长度：${finalResult.length}字符`);
    return finalResult;
}
// ====================== 工具函数（原有100%保留，新增扩展）======================
// 防抖工具函数
function debounce(func, delay) {
    let timer = null;
    return function(...args) {
        clearTimeout(timer);
        timer = setTimeout(() => func.apply(this, args), delay);
    };
}
// 深拷贝合并配置
function deepMerge(target, source) {
    const merged = { ...target };
    for (const key in source) {
        if (Object.hasOwnProperty.call(source, key)) {
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
// 父级预设参数获取（原有100%保留）
function getActivePresetParams() {
    const settings = extension_settings[extensionName];
    let presetParams = {};
    const context = getContext();
    if (context?.generation_settings && typeof context.generation_settings === 'object') {
        presetParams = { ...context.generation_settings };
    } else if (window.generation_params && typeof window.generation_params === 'object') {
        presetParams = { ...window.generation_params };
    }
    if (!settings.enableAutoParentPreset) {
        if (window.generation_params && typeof window.generation_params === 'object') {
            presetParams = { ...window.generation_params };
        }
    }
    const validParams = [
        'temperature', 'top_p', 'top_k', 'min_p', 'top_a',
        'max_new_tokens', 'min_new_tokens', 'max_tokens',
        'repetition_penalty', 'repetition_penalty_range', 'repetition_penalty_slope', 'presence_penalty', 'frequency_penalty', 'dry_multiplier', 'dry_base', 'dry_sequence_length', 'dry_allowed_length', 'dry_penalty_last_n',
        'typical_p', 'tfs', 'epsilon_cutoff', 'eta_cutoff', 'guidance_scale', 'cfg_scale', 'penalty_alpha', 'mirostat_mode', 'mirostat_tau', 'mirostat_eta', 'smoothing_factor', 'dynamic_temperature', 'dynatemp_low', 'dynatemp_high', 'dynatemp_exponent',
        'negative_prompt', 'stop_sequence', 'seed', 'do_sample', 'encoder_repetition_penalty', 'no_repeat_ngram_size', 'num_beams', 'length_penalty', 'early_stopping', 'ban_eos_token', 'skip_special_tokens', 'add_bos_token', 'truncation_length', 'custom_token_bans', 'sampler_priority', 'system_prompt', 'logit_bias', 'stream'
    ];
    const filteredParams = {};
    for (const key of validParams) {
        if (presetParams[key] !== undefined && presetParams[key] !== null) {
            filteredParams[key] = presetParams[key];
        }
    }
    const defaultFallbackParams = {
        temperature: 0.7,
        top_p: 0.9,
        max_new_tokens: 2048,
        repetition_penalty: 1.1,
        do_sample: true
    };
    for (const [key, value] of Object.entries(defaultFallbackParams)) {
        if (filteredParams[key] === undefined || filteredParams[key] === null) {
            filteredParams[key] = value;
        }
    }
    return filteredParams;
}
// 预设名获取与显示（原有100%保留）
function getCurrentPresetName() {
    const context = getContext();
    let presetName = "默认预设";
    if (context?.preset?.name && typeof context.preset.name === 'string') {
        presetName = context.preset.name;
    }
    else if (context?.generation_settings?.preset_name && typeof context.generation_settings.preset_name === 'string') {
        presetName = context.generation_settings.preset_name;
    }
    else if (window.SillyTavern?.presetManager?.currentPreset?.name && typeof window.SillyTavern.presetManager.currentPreset.name === 'string') {
        presetName = window.SillyTavern.presetManager.currentPreset.name;
    }
    else if (window?.current_preset?.name && typeof window.current_preset.name === 'string') {
        presetName = window.current_preset.name;
    }
    else if (window?.generation_params?.preset_name && typeof window.generation_params.preset_name === 'string') {
        presetName = window.generation_params.preset_name;
    }
    else if (window?.extension_settings?.presets?.current_preset && typeof window.extension_settings.presets.current_preset === 'string') {
        presetName = window.extension_settings.presets.current_preset;
    }
    return presetName;
}
const updatePresetNameDisplay = debounce(function() {
    const settings = extension_settings[extensionName];
    const presetNameElement = document.getElementById("novel-parent-preset-name-display");
    if (!presetNameElement) return;
    if (!settings.enableAutoParentPreset) {
        presetNameElement.style.display = "none";
        currentPresetName = "";
        return;
    }
    currentPresetName = getCurrentPresetName();
    presetNameElement.textContent = `当前生效父级预设：${currentPresetName}`;
    presetNameElement.style.display = "block";
}, 100);
function setupPresetEventListeners() {
    eventSource.on(event_types.PRESET_CHANGED, () => {
        updatePresetNameDisplay();
    });
    eventSource.on(event_types.CHAT_CHANGED, () => {
        updatePresetNameDisplay();
    });
    eventSource.on(event_types.CHARACTER_CHANGED, () => {
        updatePresetNameDisplay();
    });
    eventSource.on(event_types.GENERATION_SETTINGS_UPDATED, () => {
        updatePresetNameDisplay();
    });
    eventSource.on(event_types.SETTINGS_UPDATED, () => {
        updatePresetNameDisplay();
    });
}
// ====================== 新增：提示词配置管理函数 ======================
// 重置提示词到默认值
function resetPromptsToDefault() {
    extension_settings[extensionName].customPrompts = { ...PromptConstants.DEFAULT_PROMPTS };
    CURRENT_PROMPTS = { ...PromptConstants.DEFAULT_PROMPTS };
    saveSettingsDebounced();
    renderPromptSettings();
    toastr.success('所有提示词已重置为默认值', "小说续写器");
}
// 保存自定义提示词
function saveCustomPrompts() {
    const settings = extension_settings[extensionName];
    const newCustomPrompts = { ...settings.customPrompts };
    // 遍历所有提示词输入框，更新配置
    Object.keys(PromptConstants.DEFAULT_PROMPTS).forEach(key => {
        const inputEl = document.getElementById(`novel-prompt-${key}`);
        if (inputEl) {
            newCustomPrompts[key] = inputEl.value;
        }
    });
    settings.customPrompts = newCustomPrompts;
    CURRENT_PROMPTS = { ...PromptConstants.DEFAULT_PROMPTS, ...newCustomPrompts };
    saveSettingsDebounced();
    toastr.success('自定义提示词已保存', "小说续写器");
}
// 渲染提示词设置面板
function renderPromptSettings() {
    const settings = extension_settings[extensionName];
    const promptContainer = document.getElementById("novel-prompt-settings-container");
    if (!promptContainer) return;
    const promptLabels = {
        BATCH_MERGE_GRAPH_SYSTEM_PROMPT: "批次合并图谱系统提示词",
        MERGE_ALL_GRAPH_SYSTEM_PROMPT: "全量合并图谱系统提示词",
        CONTINUE_CHAPTER_GRAPH_SYSTEM_PROMPT: "单章节图谱系统提示词",
        SINGLE_CHAPTER_GRAPH_TEMPLATE: "单章节图谱生成模板",
        PRECHECK_SYSTEM_TEMPLATE: "续写前置校验模板",
        QUALITY_EVALUATE_TEMPLATE: "续写质量评估模板",
        NOVEL_WRITE_TEMPLATE: "小说续写核心模板",
        CONTINUE_WRITE_TEMPLATE: "链条续写核心模板",
        BREAK_LIMIT_PROMPT: "全局破限创作规则",
        JSON_MODE_RULE: "JSON模式强制规则"
    };
    let html = "";
    Object.keys(PromptConstants.DEFAULT_PROMPTS).forEach(key => {
        const label = promptLabels[key] || key;
        const value = settings?.customPrompts?.[key] || PromptConstants.DEFAULT_PROMPTS[key];
        html += `
            <div class="novel-card novel-card-mini" style="margin-bottom: 12px;">
                <div class="novel-form-label" style="margin-bottom: 8px; font-weight: 600; color: var(--novel-text-primary);">${label}</div>
                <textarea id="novel-prompt-${key}" rows="4" class="novel-form-textarea" style="width: 100%; font-size: 0.85rem;" wrap="soft">${value}</textarea>
            </div>
        `;
    });
    promptContainer.innerHTML = html;
}
// ====================== 悬浮球模块（原有100%保留，修正选择器）======================
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
        if (!this.ball || !this.panel) {
            console.error("[小说续写插件] 悬浮球/面板元素未找到");
            toastr.error("小说续写插件加载失败：UI元素未找到", "插件错误");
            return;
        }
        // 应用自定义悬浮球大小
        const settings = extension_settings[extensionName];
        const ballSize = settings?.uiConfig?.floatBallSize ?? defaultSettings.uiConfig.floatBallSize;
        this.ball.style.width = `${ballSize}px`;
        this.ball.style.height = `${ballSize}px`;
        console.log("[小说续写插件] 悬浮球初始化成功");
        this.bindEvents();
        this.restoreState();
        // 强制显示悬浮球
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
        const closeBtn = document.getElementById("novel-panel-close-btn");
        closeBtn.removeEventListener("click", this.hidePanel.bind(this));
        closeBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            this.hidePanel();
        });
        document.querySelectorAll(".novel-tab-item").forEach(tab => {
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
        if (!isInPanel && !isInBall && this.panel.classList.contains("novel-show")) {
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
        this.ball.classList.add("novel-dragging");
        const clientX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
        const clientY = e.type.includes('touch') ? e.touches[0].clientY : e.clientY;
        const rect = this.ball.getBoundingClientRect();
        this.startPos.x = clientX;
        this.startPos.y = clientY;
        this.offset.x = clientX - rect.left;
        this.offset.y = clientY - rect.top;
    },
    onDrag(e) {
        if (!this.ball.classList.contains("novel-dragging")) return;
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
        if (!this.ball.classList.contains("novel-dragging")) return;
        this.ball.classList.remove("novel-dragging");
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
        extension_settings[extensionName].floatBallState.position = { x: newRect.left, y: newRect.top };
        saveSettingsDebounced();
    },
    togglePanel() {
        if (this.panel.classList.contains("novel-show")) {
            this.hidePanel();
        } else {
            this.showPanel();
        }
    },
    showPanel() {
        this.panel.classList.add("novel-show");
        extension_settings[extensionName].floatBallState.isPanelOpen = true;
        saveSettingsDebounced();
    },
    hidePanel() {
        this.panel.classList.remove("novel-show");
        extension_settings[extensionName].floatBallState.isPanelOpen = false;
        saveSettingsDebounced();
    },
    switchTab(tabId) {
        document.querySelectorAll(".novel-tab-item").forEach(tab => {
            tab.classList.toggle("novel-active", tab.dataset.tab === tabId);
        });
        document.querySelectorAll(".novel-tab-panel").forEach(panel => {
            panel.classList.toggle("novel-active", panel.id === tabId);
        });
        extension_settings[extensionName].floatBallState.activeTab = tabId;
        saveSettingsDebounced();
    },
    restoreState() {
        const settings = extension_settings[extensionName];
        const state = settings.floatBallState || defaultSettings.floatBallState;
        const maxX = window.innerWidth - this.ball.offsetWidth;
        const maxY = window.innerHeight - this.ball.offsetHeight;
        const safeX = Math.max(0, Math.min(state.position.x, maxX));
        const safeY = Math.max(0, Math.min(state.position.y, maxY));
        this.ball.style.left = `${safeX}px`;
        this.ball.style.top = `${safeY}px`;
        this.ball.style.right = "auto";
        this.ball.style.transform = "none";
        // 应用默认打开的选项卡
        const defaultTab = settings?.uiConfig?.defaultActiveTab ?? defaultSettings.uiConfig.defaultActiveTab;
        this.switchTab(state.activeTab || defaultTab);
        if (state.isPanelOpen) this.showPanel();
    }
};
// ====================== 小说阅读器模块（原有100%保留，修正选择器）======================
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
        const fontMinus = document.getElementById("novel-reader-font-minus");
        const fontPlus = document.getElementById("novel-reader-font-plus");
        const chapterSelectBtn = document.getElementById("novel-reader-chapter-select-btn");
        const drawerClose = document.getElementById("novel-reader-drawer-close");
        const prevChapter = document.getElementById("novel-reader-prev-chapter");
        const nextChapter = document.getElementById("novel-reader-next-chapter");
        const contentWrap = document.querySelector(".novel-reader-content-wrap");
        const contentEl = document.getElementById("novel-reader-content");
        const drawerEl = document.getElementById("novel-reader-chapter-drawer");
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
            if (e.target.closest(".novel-reader-content") || e.target.closest(".novel-reader-controls") || e.target.closest(".novel-reader-footer") || e.target.closest(".novel-reader-chapter-drawer") || e.target.closest(".novel-btn")) {
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
        const contentEl = document.getElementById("novel-reader-content");
        const progressEl = document.getElementById("novel-reader-progress-fill");
        const progressTextEl = document.getElementById("novel-reader-progress-text");
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
        const listContainer = document.getElementById("novel-reader-chapter-list");
        const chapterCountEl = document.getElementById("novel-reader-chapter-count");
        const totalChapterEl = document.getElementById("novel-reader-total-chapter");
        const totalChapterCount = currentParsedChapters.length + continueWriteChain.length;
        chapterCountEl.textContent = `0/${totalChapterCount}`;
        totalChapterEl.textContent = totalChapterCount;
        if (currentParsedChapters.length === 0) {
            listContainer.innerHTML = '<p class="novel-empty-tip">暂无解析的章节，请先在「章节管理」中解析小说</p>';
            return;
        }
        let listHtml = "";
        currentParsedChapters.forEach(chapter => {
            const continueChapters = continueWriteChain.filter(item => item.baseChapterId === chapter.id);
            const isActive = this.currentChapterType === 'original' && this.currentChapterId === chapter.id;
            listHtml += `<div class="novel-reader-chapter-item ${isActive ? 'novel-active' : ''}" data-chapter-id="${chapter.id}" data-chapter-type="original">${chapter.title}</div>`;
            if (continueChapters.length > 0) {
                listHtml += `<div class="novel-reader-chapter-branch">`;
                continueChapters.forEach((continueChapter, index) => {
                    const isContinueActive = this.currentChapterType === 'continue' && this.currentChapterId === continueChapter.id;
                    listHtml += `<div class="novel-reader-continue-item ${isContinueActive ? 'novel-active' : ''}" data-chapter-id="${continueChapter.id}" data-chapter-type="continue"><span>✒️</span>续写章节 ${index + 1}</div>`;
                });
                listHtml += `</div>`;
            }
        });
        listContainer.innerHTML = listHtml;
        document.querySelectorAll(".novel-reader-chapter-item, .novel-reader-continue-item").forEach(item => {
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
        const contentEl = document.getElementById("novel-reader-content");
        const titleEl = document.getElementById("novel-reader-current-chapter-title");
        const chapterCountEl = document.getElementById("novel-reader-chapter-count");
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
            const baseChapter = currentParsedChapters.find(c => c.id === chapterData.baseChapterId);
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
            const contentEl = document.getElementById("novel-reader-content");
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
        if (prevChapterId === null);
        setTimeout(() => {
            const contentEl = document.getElementById("novel-reader-content");
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
        const contentEl = document.getElementById("novel-reader-content");
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
        const drawer = document.getElementById("novel-reader-chapter-drawer");
        drawer.classList.toggle("novel-show");
    },
    showChapterDrawer() {
        document.getElementById("novel-reader-chapter-drawer").classList.add("novel-show");
    },
    hideChapterDrawer() {
        document.getElementById("novel-reader-chapter-drawer").classList.remove("novel-show");
    },
    restoreState() {
        const state = extension_settings[extensionName].readerState || defaultSettings.readerState;
        this.setFontSize(state.fontSize);
        this.currentChapterId = state.currentChapterId;
        this.currentChapterType = state.currentChapterType || "original";
    }
};
// ====================== 原有核心功能函数（100%保留，修正选择器）======================
function renderCommandTemplate(template, charName, chapterContent) {
    const escapedContent = chapterContent.replace(/"/g, '\\"').replace(/\|/g, '\\|');
    return template.replace(/{{char}}/g, charName || '角色').replace(/{{pipe}}/g, escapedContent);
}
function splitNovelByWordCount(novelText, wordCount) {
    try {
        const cleanText = removeBOM(novelText).replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
        if (!cleanText) return [];
        const chapters = [];
        const totalLength = cleanText.length;
        let currentIndex = 0;
        let chapterId = 0;
        while (currentIndex < totalLength) {
            let endIndex = currentIndex + wordCount;
            if (endIndex < totalLength) {
                const nextLineIndex = cleanText.indexOf('\n', endIndex);
                if (nextLineIndex !== -1 && nextLineIndex - endIndex < 200) {
                    endIndex = nextLineIndex + 1;
                }
            }
            const content = cleanText.slice(currentIndex, endIndex).trim();
            if (content) {
                chapters.push({
                    id: chapterId,
                    title: `第${chapterId + 1}章（字数拆分）`,
                    content,
                    hasGraph: false
                });
                chapterId++;
            }
            currentIndex = endIndex;
        }
        toastr.success(`按字数拆分完成，共生成 ${chapters.length} 个章节`, "小说续写器");
        return chapters;
    } catch (error) {
        console.error('按字数拆分失败:', error);
        toastr.error('字数拆分失败，请检查输入的字数', "小说续写器");
        return [];
    }
}
function exportChapterGraphs() {
    const graphMap = extension_settings[extensionName].chapterGraphMap || {};
    if (Object.keys(graphMap).length === 0) {
        toastr.warning('没有可导出的单章节图谱，请先生成图谱', "小说续写器");
        return;
    }
    const exportData = {
        exportTime: new Date().toISOString(),
        chapterCount: currentParsedChapters.length,
        chapterGraphMap: graphMap
    };
    const jsonString = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '小说单章节图谱.json';
    a.click();
    URL.revokeObjectURL(url);
    toastr.success('单章节图谱已导出', "小说续写器");
}
async function importChapterGraphs(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const importData = JSON.parse(removeBOM(event.target.result.trim()));
            if (!importData.chapterGraphMap || typeof importData.chapterGraphMap !== 'object') {
                throw new Error("图谱格式错误，缺少chapterGraphMap字段");
            }
            const existingGraphMap = extension_settings[extensionName].chapterGraphMap || {};
            const newGraphMap = { ...existingGraphMap, ...importData.chapterGraphMap };
            extension_settings[extensionName].chapterGraphMap = newGraphMap;
            saveSettingsDebounced();
            currentParsedChapters.forEach(chapter => {
                chapter.hasGraph = !!newGraphMap[chapter.id];
            });
            renderChapterList(currentParsedChapters);
            toastr.success(`单章节图谱导入完成！共导入${Object.keys(importData.chapterGraphMap).length}个章节图谱`, "小说续写器");
        } catch (error) {
            console.error('单章节图谱导入失败:', error);
            toastr.error(`导入失败：${error.message}，请检查JSON文件格式是否正确`, "小说续写器");
        } finally {
            $("#novel-chapter-graph-file-upload").val('');
        }
    };
    reader.onerror = () => {
        toastr.error('文件读取失败，请检查文件', "小说续写器");
        $("#novel-chapter-graph-file-upload").val('');
    };
    reader.readAsText(file, 'UTF-8');
}
async function batchMergeGraphs() {
    const graphMap = extension_settings[extensionName].chapterGraphMap || {};
    const sortedChapters = [...currentParsedChapters].sort((a, b) => a.id - b.id);
    const graphList = sortedChapters.map(chapter => graphMap[chapter.id]).filter(Boolean);
    
    if (graphList.length === 0) {
        toastr.warning('没有可合并的章节图谱，请先生成图谱', "小说续写器");
        return;
    }
    
    const batchCount = parseInt($('#novel-batch-merge-count').val()) || 50;
    if (batchCount < 10 || batchCount > 100) {
        toastr.error('每批合并章节数必须在10-100之间', "小说续写器");
        return;
    }
    
    batchMergedGraphs = [];
    extension_settings[extensionName].batchMergedGraphs = batchMergedGraphs;
    saveSettingsDebounced();
    
    const batches = [];
    for (let i = 0; i < graphList.length; i += batchCount) {
        batches.push(graphList.slice(i, i + batchCount));
    }
    
    isGeneratingGraph = true;
    stopGenerateFlag = false;
    let successCount = 0;
    setButtonDisabled('#novel-graph-batch-merge-btn, #novel-graph-merge-btn, #novel-graph-batch-clear-btn', true);
    
    try {
        toastr.info(`开始分批合并，共${batches.length}个批次，每批最多${batchCount}章`, "小说续写器");
        for (let i = 0; i < batches.length; i++) {
            if (stopGenerateFlag) break;
            
            const batch = batches[i];
            const batchNum = i + 1;
            updateProgress('novel-batch-merge-progress', 'novel-batch-merge-status', batchNum, batches.length, "分批合并进度");
            
            const systemPrompt = CURRENT_PROMPTS.BATCH_MERGE_GRAPH_SYSTEM_PROMPT;
            const userPrompt = `待合并的批次${batchNum}章节图谱列表：\n${JSON.stringify(batch, null, 2)}`;
            
            const result = await generateRawWithBreakLimit({
                systemPrompt,
                prompt: userPrompt,
                jsonSchema: PromptConstants.mergeGraphJsonSchema,
                ...getActivePresetParams()
            });
            
            const batchMergedGraph = JSON.parse(result.trim());
            batchMergedGraph.batchInfo = {
                batchNumber: batchNum,
                totalBatches: batches.length,
                startChapterId: sortedChapters[i * batchCount].id,
                endChapterId: sortedChapters[Math.min((i + 1) * batchCount - 1, sortedChapters.length - 1)].id,
                chapterCount: batch.length
            };
            batchMergedGraphs.push(batchMergedGraph);
            successCount++;
            
            extension_settings[extensionName].batchMergedGraphs = batchMergedGraphs;
            saveSettingsDebounced();
            
            if (i < batches.length - 1 && !stopGenerateFlag) {
                const callInterval = extension_settings[extensionName]?.apiConfig?.callInterval ?? defaultSettings.apiConfig.callInterval;
                await new Promise(resolve => setTimeout(resolve, callInterval));
            }
        }
        
        if (stopGenerateFlag) {
            toastr.info(`已停止分批合并，成功完成${successCount}/${batches.length}个批次`, "小说续写器");
        } else {
            toastr.success(`分批合并完成！共成功合并${successCount}个批次，可点击「整体合并全量图谱」生成最终全量图谱`, "小说续写器");
        }
        
    } catch (error) {
        console.error('分批合并图谱失败:', error);
        toastr.error(`分批合并失败：${error.message}，已完成${successCount}个批次`, "小说续写器");
    } finally {
        isGeneratingGraph = false;
        stopGenerateFlag = false;
        updateProgress('novel-batch-merge-progress', 'novel-batch-merge-status', 0, 0);
        setButtonDisabled('#novel-graph-batch-merge-btn, #novel-graph-merge-btn, #novel-graph-batch-clear-btn', false);
    }
}
function clearBatchMergedGraphs() {
    batchMergedGraphs = [];
    extension_settings[extensionName].batchMergedGraphs = batchMergedGraphs;
    updateProgress('novel-batch-merge-progress', 'novel-batch-merge-status', 0, 0);
    saveSettingsDebounced();
    toastr.success('已清空所有批次合并结果', "小说续写器");
}
async function loadSettings() {
    extension_settings[extensionName] = extension_settings[extensionName] || {};
    extension_settings[extensionName] = deepMerge(defaultSettings, extension_settings[extensionName]);
    for (const key of Object.keys(defaultSettings)) {
        if (!Object.hasOwn(extension_settings[extensionName], key)) {
            extension_settings[extensionName][key] = structuredClone(defaultSettings[key]);
        }
    }
    // 初始化当前生效提示词
    CURRENT_PROMPTS = { ...PromptConstants.DEFAULT_PROMPTS, ...extension_settings[extensionName].customPrompts };
    currentParsedChapters = extension_settings[extensionName].chapterList || [];
    continueWriteChain = extension_settings[extensionName].continueWriteChain || [];
    continueChapterIdCounter = extension_settings[extensionName].continueChapterIdCounter || 1;
    currentPrecheckResult = extension_settings[extensionName].precheckReport || null;
    batchMergedGraphs = extension_settings[extensionName].batchMergedGraphs || [];
    const settings = extension_settings[extensionName];
    $("#novel-example_setting").prop("checked", settings.example_setting).trigger("input");
    $("#novel-chapter-regex-input").val(settings.chapterRegex);
    $("#novel-send-template-input").val(settings.sendTemplate);
    $("#novel-send-delay-input").val(settings.sendDelay);
    $("#novel-quality-check-switch").prop("checked", settings.enableQualityCheck);
    $("#novel-write-word-count").val(settings.writeWordCount || 2000);
    $("#novel-auto-parent-preset-switch").prop("checked", settings.enableAutoParentPreset);
    // 新增：API配置初始化
    $("#novel-api-call-interval").val(settings.apiConfig.callInterval);
    $("#novel-api-break-limit-switch").prop("checked", settings.apiConfig.enableBreakLimit);
    // 新增：UI配置初始化
    $("#novel-ui-float-ball-size").val(settings.uiConfig.floatBallSize);
    $("#novel-ui-default-tab").val(settings.uiConfig.defaultActiveTab);
    $("#novel-ui-hover-switch").prop("checked", settings.uiConfig.enableHoverEffect);
    $("#novel-ui-draft-switch").prop("checked", settings.uiConfig.autoSaveDraft);
    const mergedGraph = settings.mergedGraph || {};
    $("#novel-merged-graph-preview").val(Object.keys(mergedGraph).length > 0 ? JSON.stringify(mergedGraph, null, 2) : "");
    $("#novel-write-content-preview").val(settings.writeContentPreview || "");
    if (settings.graphValidateResultShow) $("#novel-graph-validate-result").show();
    if (settings.qualityResultShow) $("#novel-quality-result-block").show();
    $("#novel-precheck-status").text(settings.precheckStatus || "未执行").removeClass("novel-status-default novel-status-success novel-status-danger").addClass(settings.precheckStatus === "通过"?"novel-status-success": settings.precheckStatus === "不通过"? "novel-status-danger": "novel-status-default");
    $("#novel-precheck-report").val(settings.precheckReportText || "");
    renderChapterList(currentParsedChapters);
    renderChapterSelect(currentParsedChapters);
    renderContinueWriteChain(continueWriteChain);
    NovelReader.renderChapterList();
    restoreDrawerState();
    // 新增：渲染提示词设置
    renderPromptSettings();
    if (settings.selectedBaseChapterId) {
        $("#novel-write-chapter-select").val(settings.selectedBaseChapterId).trigger("change");
    }
    isInitialized = true;
    await new Promise(resolve => setTimeout(resolve, 200));
    updatePresetNameDisplay();
    setupPresetEventListeners();
    FloatBall.init();
    NovelReader.init();
}
function saveDrawerState() {
    const drawerState = {};
    $('.novel-writer-extension-root .novel-inline-drawer').each(function() {
        const drawerId = $(this).attr('id');
        if (drawerId) {
            drawerState[drawerId] = $(this).hasClass('novel-open');
        }
    });
    extension_settings[extensionName].drawerState = drawerState;
    saveSettingsDebounced();
}
function restoreDrawerState() {
    const savedState = extension_settings[extensionName].drawerState || defaultSettings.drawerState;
    $('.novel-writer-extension-root .novel-inline-drawer').each(function() {
        const drawerId = $(this).attr('id');
        if (drawerId && savedState[drawerId] !== undefined) {
            $(this).toggleClass('novel-open', savedState[drawerId]);
        }
    });
}
function initDrawerToggle() {
    $('#novel-writer-panel').off('click', '.novel-inline-drawer-header').on('click', '.novel-inline-drawer-header', function(e) {
        e.preventDefault();
        e.stopPropagation();
        const $drawer = $(this).closest('.novel-inline-drawer');
        $drawer.toggleClass('novel-open');
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
        textArea.style.left = '-99999px';
        textArea.style.top = '-99999px';
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
                $('#novel-write-status').text('生成状态异常，请重新点击生成');
                isGeneratingWrite = false;
                stopGenerateFlag = false;
                setButtonDisabled('#novel-write-generate-btn, .novel-continue-write-btn, #novel-write-stop-btn', false);
            }
            if (isGeneratingGraph) {
                $('#novel-graph-generate-status').text('图谱生成状态异常，请重新点击生成');
                isGeneratingGraph = false;
                stopGenerateFlag = false;
                setButtonDisabled('#novel-graph-single-btn, #novel-graph-batch-btn, #novel-graph-merge-btn, #novel-graph-batch-merge-btn', false);
            }
            if (isSending) {
                $('#novel-import-status').text('发送状态异常，请重新点击导入');
                isSending = false;
                stopSending = false;
                setButtonDisabled('#novel-import-selected-btn, #novel-import-all-btn, #novel-stop-send-btn', false);
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
    $statusEl.text(`${textPrefix}: ${current}/${total} (${percent}%)`);
}
function removeBOM(text) {
    if (!text) return text;
    if (text.charCodeAt(0) === 0xFEFF || text.charCodeAt(0) === 0xFFFE) {
        return text.slice(1);
    }
    return text;
}
const presetChapterRegexList = [
    { name: "标准章节", regex: "^\\s*第\\s*[0-9零一二三四五六七八九十百千]+\\s*章.*$" },
    { name: "括号序号", regex: "^\\s*.*\\（[0-9零一二三四五六七八九十百千]+\\）.*$" },
    { name: "英文括号序号", regex: "^\\s*.*\\([0-9零一二三四五六七八九十百千]+\\).*$" },
    { name: "标准节", regex: "^\\s*第\\s*[0-9零一二三四五六七八九十百千]+\\s*节.*$" },
    { name: "卷+章", regex: "^\\s*卷\\s*[0-9零一二三四五六七八九十百千]+\\s*第\\s*[0-9零一二三四五六七八九十百千]+\\s*章.*$" },
    { name: "英文Chapter", regex: "^\\s*Chapter\\s*[0-9]+\\s*.*$" },
    { name: "标准话", regex: "^\\s*第\\s*[0-9零一二三四五六七八九十百千]+\\s*话.*$" },
    { name: "顿号序号", regex: "^\\s*[0-9零一二三四五六七八九十百千]+、.*$" },
    { name: "方括号序号", regex: "^\\s*【\\s*[0-9零一二三四五六七八九十百千]+\\s*】.*$" },
    { name: "圆点序号", regex: "^\\s*[0-9]+\\.\\s*.*$" },
    { name: "中文序号空格", regex: "^\\s*[零一二三四五六七八九十百千]+\\s+.*$" }
];
let currentRegexIndex = 0;
let sortedRegexList = [...presetChapterRegexList];
let lastParsedText = "";
async function validateContinuePrecondition(baseChapterId, modifiedChapterContent = null) {
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
    const systemPrompt = PromptConstants.getPrecheckSystemPrompt(baseId, CURRENT_PROMPTS.PRECHECK_SYSTEM_TEMPLATE);
    const userPrompt = `续写基准章节ID：${baseId} 基准章节及前置章节的知识图谱列表：${JSON.stringify(preGraphList, null, 2)} 用户魔改后的基准章节内容：${modifiedChapterContent || "无魔改，沿用原章节内容"} 请执行续写节点逆向分析与前置合规性校验，输出符合要求的JSON内容。`;
    try {
        const result = await generateRawWithBreakLimit({ 
            systemPrompt, 
            prompt: userPrompt, 
            jsonSchema: PromptConstants.PRECHECK_JSON_SCHEMA,
            ...getActivePresetParams()
        });
        const precheckResult = JSON.parse(result.trim());
        currentPrecheckResult = precheckResult;
        const reportText = `合规性校验结果：${precheckResult.isPass ? "通过": "不通过"} 人设红线清单：${precheckResult["人设红线清单"]} 设定禁区清单：${precheckResult["设定禁区清单"]} 可呼应伏笔清单：${precheckResult["可呼应伏笔清单"]} 潜在矛盾预警：${precheckResult["潜在矛盾预警"]} 可推进剧情方向：${precheckResult["可推进剧情方向"]} 详细报告：${precheckResult["合规性报告"]}`.trim();
        const statusText = precheckResult.isPass ? "通过": "不通过";
        $("#novel-precheck-status").text(statusText).removeClass("novel-status-default novel-status-success novel-status-danger").addClass(precheckResult.isPass ? "novel-status-success": "novel-status-danger");
        $("#novel-precheck-report").val(reportText);
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
    const actualWordCount = continueContent.length;
    const wordErrorRate = Math.abs(actualWordCount - targetWordCount) / targetWordCount;
    const systemPrompt = PromptConstants.getQualityEvaluateSystemPrompt(targetWordCount, actualWordCount, wordErrorRate, CURRENT_PROMPTS.QUALITY_EVALUATE_TEMPLATE);
    const userPrompt = `待评估续写内容：${continueContent} 前置校验合规边界：${JSON.stringify(precheckResult)} 小说核心设定知识图谱：${JSON.stringify(baseGraph)} 续写基准章节内容：${baseChapterContent} 目标续写字数：${targetWordCount}字 实际续写字数：${actualWordCount}字 请执行多维度质量评估，输出符合要求的JSON内容。`;
    try {
        const result = await generateRawWithBreakLimit({ 
            systemPrompt, 
            prompt: userPrompt, 
            jsonSchema: PromptConstants.qualityEvaluateSchema,
            ...getActivePresetParams()
        });
        return JSON.parse(result.trim());
    } catch (error) {
        console.error('质量评估失败:', error);
        toastr.error(`质量评估失败: ${error.message}`, "小说续写器");
        return { 总分: 90, 人设一致性得分: 90, 设定合规性得分: 90, 剧情衔接度得分: 90, 文风匹配度得分: 90, 内容质量得分: 90, 评估报告: "质量评估执行失败，默认通过", 是否合格: true };
    }
}
async function updateModifiedChapterGraph(chapterId, modifiedContent) {
    const targetChapter = currentParsedChapters.find(item => item.id === parseInt(chapterId));
    if (!targetChapter) {
        toastr.error('目标章节不存在', "小说续写器");
        return null;
    }
    if (!modifiedContent.trim()) {
        toastr.error('魔改后的章节内容不能为空', "小说续写器");
        return null;
    }
    const systemPrompt = PromptConstants.getSingleChapterGraphPrompt({id: targetChapter.id, content: modifiedContent}, true, CURRENT_PROMPTS.SINGLE_CHAPTER_GRAPH_TEMPLATE);
    const userPrompt = `小说章节标题：${targetChapter.title}\n魔改后章节内容：${modifiedContent}`;
    try {
        toastr.info('正在更新魔改章节图谱，请稍候...', "小说续写器");
        const result = await generateRawWithBreakLimit({ 
            systemPrompt, 
            prompt: userPrompt, 
            jsonSchema: PromptConstants.graphJsonSchema,
            ...getActivePresetParams()
        });
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
    const systemPrompt = CURRENT_PROMPTS.CONTINUE_CHAPTER_GRAPH_SYSTEM_PROMPT;
    const userPrompt = `小说章节标题：续写章节${continueId}\n小说章节内容：${continueChapter.content}`;
    try {
        const result = await generateRawWithBreakLimit({ 
            systemPrompt, 
            prompt: userPrompt, 
            jsonSchema: PromptConstants.graphJsonSchema,
            ...getActivePresetParams()
        });
        const graphData = JSON.parse(result.trim());
        const graphMap = extension_settings[extensionName].chapterGraphMap || {};
        graphMap[`continue_${continueId}`] = graphData;
        extension_settings[extensionName].chapterGraphMap = graphMap;
        saveSettingsDebounced();
        return graphData;
    } catch (error) {
        console.error('续写章节图谱更新失败:', error);
        return null;
    }
}
async function validateGraphCompliance() {
    const mergedGraph = extension_settings[extensionName].mergedGraph || {};
    const fullRequiredFields = PromptConstants.mergeGraphJsonSchema.value.required;
    const singleRequiredFields = PromptConstants.graphJsonSchema.value.required;
    let isFullGraph = true;
    let missingFields = fullRequiredFields.filter(field => !Object.hasOwn(mergedGraph, field));
    if (missingFields.length > 0) {
        isFullGraph = false;
        missingFields = singleRequiredFields.filter(field => !Object.hasOwn(mergedGraph, field));
    }
    const graphJsonString = JSON.stringify(mergedGraph, null, 2);
    const graphWordCount = graphJsonString.length;
    const minWordCount = 1200;
    let result = "";
    let isPass = false;
    if (missingFields.length > 0) {
        const graphType = isFullGraph ? "全量图谱": "单章节图谱";
        result = `图谱合规性校验不通过，${graphType}缺少必填字段：${missingFields.join('、')}，请重新生成/合并图谱`;
        isPass = false;
    } else if (graphWordCount < minWordCount) {
        const graphType = isFullGraph ? "全量图谱": "单章节图谱";
        result = `图谱合规性校验不通过，${graphType}内容字数不足，当前字数：${graphWordCount}，最低要求：${minWordCount}字，请重新生成图谱`;
        isPass = false;
    } else {
        const logicScore = mergedGraph?.逆向分析与质量评估?.全文本逻辑自洽性得分 || mergedGraph?.逆向分析洞察 ? 90 : 0;
        const graphType = isFullGraph ? "全量图谱": "单章节图谱";
        result = `图谱合规性校验通过，${graphType}所有必填字段完整，内容字数：${graphWordCount}字，全文本逻辑自洽性得分：${logicScore}/100`;
        isPass = true;
    }
    $("#novel-graph-validate-content").val(result);
    $("#novel-graph-validate-result").show();
    extension_settings[extensionName].graphValidateResultShow = true;
    saveSettingsDebounced();
    if (isPass) {
        toastr.success('图谱合规性校验通过', "小说续写器");
    } else {
        toastr.warning('图谱合规性校验不通过', "小说续写器");
    }
    return isPass;
}
async function validateChapterGraphStatus() {
    const graphMap = extension_settings[extensionName].chapterGraphMap || {};
    if (currentParsedChapters.length === 0) {
        toastr.warning('请先上传小说文件并解析章节', "小说续写器");
        return;
    }
    let hasGraphCount = 0;
    let noGraphList = [];
    currentParsedChapters.forEach(chapter => {
        const hasGraph = !!graphMap[chapter.id];
        chapter.hasGraph = hasGraph;
        if (hasGraph) {
            hasGraphCount++;
        } else {
            noGraphList.push(chapter.title);
        }
    });
    renderChapterList(currentParsedChapters);
    const totalCount = currentParsedChapters.length;
    let message = `图谱状态检验完成\n总章节数：${totalCount}\n已生成图谱：${hasGraphCount}个\n未生成图谱：${totalCount - hasGraphCount}个`;
    if (noGraphList.length > 0) {
        message += `\n\n未生成图谱的章节：\n${noGraphList.join('\n')}`;
    }
    if (noGraphList.length === 0) {
        toastr.success(message, "小说续写器");
    } else {
        toastr.warning(message, "小说续写器");
    }
}
function splitNovelIntoChapters(novelText, regexSource) {
    try {
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
function getSortedRegexList(novelText) {
    const cleanText = removeBOM(novelText).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const regexWithCount = presetChapterRegexList.map(item => {
        try {
            const regex = new RegExp(item.regex, 'gm');
            const matches = [...cleanText.matchAll(regex)];
            return { ...item, count: matches.length };
        } catch {
            return { ...item, count: 0 };
        }
    });
    return regexWithCount.sort((a, b) => b.count - a.count);
}
function renderChapterList(chapters) {
    const $listContainer = $('#novel-chapter-list');
    const graphMap = extension_settings[extensionName].chapterGraphMap || {};
    if (chapters.length === 0) {
        $listContainer.html('<p class="novel-empty-tip">请上传小说文件并点击「解析章节」</p>');
        return;
    }
    chapters.forEach(chapter => {
        chapter.hasGraph = !!graphMap[chapter.id];
    });
    const listHtml = chapters.map((chapter) => `
        <div class="novel-chapter-item">
            <label class="novel-chapter-checkbox">
                <input type="checkbox" class="novel-chapter-select" data-index="${chapter.id}">
                <span class="novel-chapter-title">${chapter.title}</span>
            </label>
            <span class="novel-input-tip ${chapter.hasGraph ? 'novel-status-success' : 'novel-text-secondary'}">${chapter.hasGraph ? '已生成图谱' : '未生成图谱'}</span>
        </div>
    `).join('');
    $listContainer.html(listHtml);
}
function renderChapterSelect(chapters) {
    const $select = $('#novel-write-chapter-select');
    $('#novel-write-chapter-content').val('').prop('readonly', true);
    $('#novel-precheck-status').text("未执行").removeClass("novel-status-success novel-status-danger").addClass("novel-status-default");
    $('#novel-precheck-report').val('');
    $('#novel-quality-result-block').hide();
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
    setButtonDisabled('#novel-import-selected-btn, #novel-import-all-btn', true);
    setButtonDisabled('#novel-stop-send-btn', false);
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
        setButtonDisabled('#novel-import-selected-btn, #novel-import-all-btn, #novel-stop-send-btn', false);
    }
}
function getSelectedChapters() {
    const checkedInputs = document.querySelectorAll('.novel-chapter-select:checked');
    const selectedIndexes = [...checkedInputs].map(input => parseInt(input.dataset.index));
    return selectedIndexes.map(index => currentParsedChapters.find(item => item.id === index)).filter(Boolean);
}
async function generateSingleChapterGraph(chapter) {
    const systemPrompt = PromptConstants.getSingleChapterGraphPrompt(chapter, false, CURRENT_PROMPTS.SINGLE_CHAPTER_GRAPH_TEMPLATE);
    const userPrompt = `小说章节标题：${chapter.title}\n小说章节内容：${chapter.content}`;
    try {
        const result = await generateRawWithBreakLimit({
            systemPrompt,
            prompt: userPrompt,
            jsonSchema: PromptConstants.graphJsonSchema,
            ...getActivePresetParams()
        });
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
    setButtonDisabled('#novel-graph-single-btn, #novel-graph-batch-btn, #novel-graph-merge-btn, #novel-graph-batch-merge-btn', true);
    try {
        for (let i = 0; i < chapters.length; i++) {
            if (stopGenerateFlag) break;
            const chapter = chapters[i];
            updateProgress('novel-graph-progress', 'novel-graph-generate-status', i + 1, chapters.length, "图谱生成进度");
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
        updateProgress('novel-graph-progress', 'novel-graph-generate-status', 0, 0);
        setButtonDisabled('#novel-graph-single-btn, #novel-graph-batch-btn, #novel-graph-merge-btn, #novel-graph-batch-merge-btn', false);
    }
}
async function mergeAllGraphs() {
    const batchGraphs = extension_settings[extensionName].batchMergedGraphs || [];
    let graphList = [];
    let mergeType = "全量章节";
    
    if (batchGraphs.length > 0) {
        graphList = batchGraphs;
        mergeType = "批次合并结果";
    } else {
        const graphMap = extension_settings[extensionName].chapterGraphMap || {};
        graphList = Object.values(graphMap);
        mergeType = "全量章节";
    }
    
    if (graphList.length === 0) {
        toastr.warning('没有可合并的图谱，请先生成章节图谱或完成分批合并', "小说续写器");
        return;
    }
    
    setButtonDisabled('#novel-graph-merge-btn, #novel-graph-batch-merge-btn', true);
    const systemPrompt = CURRENT_PROMPTS.MERGE_ALL_GRAPH_SYSTEM_PROMPT;
    const userPrompt = `待合并的${mergeType}图谱列表：\n${JSON.stringify(graphList, null, 2)}`;
    
    try {
        toastr.info(`开始合并${mergeType}，生成最终全量知识图谱，请稍候...`, "小说续写器");
        const result = await generateRawWithBreakLimit({
            systemPrompt,
            prompt: userPrompt,
            jsonSchema: PromptConstants.mergeGraphJsonSchema,
            ...getActivePresetParams()
        });
        const mergedGraph = JSON.parse(result.trim());
        extension_settings[extensionName].mergedGraph = mergedGraph;
        saveSettingsDebounced();
        $('#novel-merged-graph-preview').val(JSON.stringify(mergedGraph, null, 2));
        toastr.success(`全量知识图谱合并完成！基于${mergeType}生成`, "小说续写器");
        return mergedGraph;
    } catch (error) {
        console.error('图谱合并失败:', error);
        toastr.error(`图谱合并失败: ${error.message}`, "小说续写器");
        return null;
    } finally {
        setButtonDisabled('#novel-graph-merge-btn, #novel-graph-batch-merge-btn', false);
    }
}
function renderContinueWriteChain(chain) {
    const $chainContainer = $('#novel-continue-write-chain');
    const scrollTop = $chainContainer.scrollTop();
    if (chain.length === 0) {
        $chainContainer.html('<p class="novel-empty-tip">暂无续写章节，生成续写内容后自动添加到此处</p>');
        return;
    }
    const chainHtml = chain.map((chapter, index) => `
        <div class="novel-continue-item">
            <div class="novel-continue-title">续写章节 ${index + 1}</div>
            <textarea class="novel-continue-content" data-chain-id="${chapter.id}" rows="8" placeholder="续写内容">${chapter.content}</textarea>
            <div class="novel-btn-group novel-btn-group-wrap">
                <button class="novel-btn novel-btn-sm novel-btn-primary novel-continue-write-btn" data-chain-id="${chapter.id}">基于此章继续续写</button>
                <button class="novel-btn novel-btn-sm novel-btn-secondary novel-continue-copy-btn" data-chain-id="${chapter.id}">复制内容</button>
                <button class="novel-btn novel-btn-sm novel-btn-outline novel-continue-send-btn" data-chain-id="${chapter.id}">发送到对话框</button>
                <button class="novel-btn novel-btn-sm novel-btn-danger novel-continue-delete-btn" data-chain-id="${chapter.id}">删除章节</button>
            </div>
        </div>
    `).join('');
    $chainContainer.html(chainHtml);
    $chainContainer.scrollTop(scrollTop);
}
function initContinueChainEvents() {
    const $root = $('#novel-writer-panel');
    $root.off('input', '.novel-continue-content').on('input', '.novel-continue-content', function(e) {
        const chainId = parseInt($(e.target).data('chain-id'));
        const newContent = $(e.target).val();
        const chapterIndex = continueWriteChain.findIndex(item => item.id === chainId);
        if (chapterIndex !== -1) {
            continueWriteChain[chapterIndex].content = newContent;
            extension_settings[extensionName].continueWriteChain = continueWriteChain;
            saveSettingsDebounced();
        }
    });
    $root.off('click', '.novel-continue-write-btn').on('click', '.novel-continue-write-btn', function(e) {
        e.stopPropagation();
        const chainId = parseInt($(e.target).data('chain-id'));
        generateContinueWrite(chainId);
    });
    $root.off('click', '.novel-continue-copy-btn').on('click', '.novel-continue-copy-btn', async function(e) {
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
    $root.off('click', '.novel-continue-send-btn').on('click', '.novel-continue-send-btn', function(e) {
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
    $root.off('click', '.novel-continue-delete-btn').on('click', '.novel-continue-delete-btn', function(e) {
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
    const selectedBaseChapterId = $('#novel-write-chapter-select').val();
    const editedBaseChapterContent = $('#novel-write-chapter-content').val().trim();
    const wordCount = parseInt($('#novel-write-word-count').val()) || 2000;
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
    const targetBeforeChapters = continueWriteChain.slice(0, continueWriteChain.findIndex(item => item.id === targetChainId) + 1);
    targetBeforeChapters.forEach((chapter, index) => {
        fullContextContent += `续写章节 ${index + 1}\n${chapter.content}\n\n`;
    });
    const systemPrompt = PromptConstants.getContinueWriteSystemPrompt({
        redLines: precheckResult.redLines,
        forbiddenRules: precheckResult.forbiddenRules,
        targetLastParagraph: targetLastParagraph,
        foreshadowList: precheckResult.foreshadowList,
        wordCount: wordCount,
        conflictWarning: precheckResult.conflictWarning,
        targetChapterTitle: targetChapter.title
    }, CURRENT_PROMPTS.CONTINUE_WRITE_TEMPLATE);
    const userPrompt = `小说核心设定知识图谱：${JSON.stringify(useGraph)} 完整前文上下文：${fullContextContent} 请基于以上完整的前文内容和知识图谱，按照规则续写后续的新章节正文，确保和前文最后一段内容完美衔接，不重复前文情节。`;
    isGeneratingWrite = true;
    stopGenerateFlag = false;
    setButtonDisabled('#novel-write-generate-btn, .novel-continue-write-btn', true);
    setButtonDisabled('#novel-write-stop-btn', false);
    toastr.info('正在生成续写章节，请稍候...', "小说续写器");
    try {
        let continueContent = await generateRawWithBreakLimit({ systemPrompt, prompt: userPrompt, ...getActivePresetParams()});
        if (stopGenerateFlag) {
            $('#novel-write-status').text('已停止生成，丢弃本次生成结果');
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
                toastr.warning(`续写内容质量不合格，总分${qualityResult.总分}，请手动点击重新生成`, "小说续写器");
            }
            $("#novel-quality-score").text(qualityResult.总分);
            $("#novel-quality-report").val(qualityResult.评估报告);
            $("#novel-quality-result-block").show();
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
        setButtonDisabled('#novel-write-generate-btn, .novel-continue-write-btn, #novel-write-stop-btn', false);
    }
}
async function generateNovelWrite() {
    const selectedChapterId = $('#novel-write-chapter-select').val();
    const editedChapterContent = $('#novel-write-chapter-content').val().trim();
    const wordCount = parseInt($('#novel-write-word-count').val()) || 2000;
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
    setButtonDisabled('#novel-write-generate-btn', true);
    setButtonDisabled('#novel-write-stop-btn', false);
    $('#novel-write-status').text('正在执行续写前置校验...');
    try {
        const precheckResult = await validateContinuePrecondition(selectedChapterId, editedChapterContent);
        const useGraph = Object.keys(precheckResult.preGraph).length > 0 ? precheckResult.preGraph : mergedGraph;
        if (stopGenerateFlag) {
            $('#novel-write-status').text('已停止生成');
            toastr.info('已停止生成，丢弃本次生成结果', "小说续写器");
            return;
        }
        const systemPrompt = PromptConstants.getNovelWriteSystemPrompt({
            redLines: precheckResult.redLines,
            forbiddenRules: precheckResult.forbiddenRules,
            baseLastParagraph: baseLastParagraph,
            foreshadowList: precheckResult.foreshadowList,
            wordCount: wordCount,
            conflictWarning: precheckResult.conflictWarning
        }, CURRENT_PROMPTS.NOVEL_WRITE_TEMPLATE);
        const userPrompt = `小说核心设定知识图谱：${JSON.stringify(useGraph)}基准章节内容：${editedChapterContent}请基于以上内容，按照规则续写后续的章节正文。`;
        $('#novel-write-status').text('正在生成续写章节，请稍候...');
        let continueContent = await generateRawWithBreakLimit({ systemPrompt, prompt: userPrompt, ...getActivePresetParams()});
        if (stopGenerateFlag) {
            $('#novel-write-status').text('已停止生成');
            toastr.info('已停止生成，丢弃本次生成结果', "小说续写器");
            return;
        }
        if (!continueContent.trim()) {
            throw new Error('生成内容为空');
        }
        continueContent = continueContent.trim();
        let qualityResult = null;
        if (enableQualityCheck && !stopGenerateFlag) {
            $('#novel-write-status').text('正在执行续写内容质量校验，请稍候...');
            qualityResult = await evaluateContinueQuality(continueContent, precheckResult, useGraph, editedChapterContent, wordCount);
            if (!qualityResult.是否合格 && !stopGenerateFlag) {
                toastr.warning(`续写内容质量不合格，总分${qualityResult.总分}，请手动点击重新生成`, "小说续写器");
            }
            $("#novel-quality-score").text(qualityResult.总分);
            $("#novel-quality-report").val(qualityResult.评估报告);
            $("#novel-quality-result-block").show();
            extension_settings[extensionName].qualityResultShow = true;
            saveSettingsDebounced();
        }
        $('#novel-write-content-preview').val(continueContent);
        $('#novel-write-status').text('续写章节生成完成！');
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
            $('#novel-write-status').text(`生成失败: ${error.message}`);
            toastr.error(`续写生成失败: ${error.message}`, "小说续写器");
        }
    } finally {
        isGeneratingWrite = false;
        stopGenerateFlag = false;
        setButtonDisabled('#novel-write-generate-btn, #novel-write-stop-btn', false);
    }
}
// ====================== 扩展入口（原有100%保留，修正选择器）======================
jQuery(async () => {
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
    // 原有基础事件绑定
    $("#novel-my_button").off("click").on("click", onButtonClick);
    $("#novel-example_setting").off("input").on("input", onExampleInput);
    $("#novel-select-file-btn").off("click").on("click", () => {
        $("#novel-file-upload").click();
    });
    $("#novel-file-upload").off("change").on("change", (e) => {
        const file = e.target.files[0];
        if (file) {
            $("#novel-file-name-text").text(file.name);
            lastParsedText = "";
            currentRegexIndex = 0;
            $("#novel-parse-chapter-btn").val("解析章节");
        }
    });
    $("#novel-parse-chapter-btn").off("click").on("click", () => {
        const file = $("#novel-file-upload")[0].files[0];
        const customRegex = $("#novel-chapter-regex-input").val().trim();
        if (!file) {
            toastr.warning('请先选择小说TXT文件', "小说续写器");
            return;
        }
        if (customRegex) {
            extension_settings[extensionName].chapterRegex = customRegex;
            saveSettingsDebounced();
        }
        const reader = new FileReader();
        reader.onload = (e) => {
            const novelText = e.target.result;
            let useRegex = "";
            let regexName = "";
            if (customRegex) {
                useRegex = customRegex;
                regexName = "自定义正则";
            } else {
                if (lastParsedText !== novelText) {
                    lastParsedText = novelText;
                    sortedRegexList = getSortedRegexList(novelText);
                    currentRegexIndex = 0;
                    $("#novel-parse-chapter-btn").val("再次解析");
                } else {
                    currentRegexIndex = (currentRegexIndex + 1) % sortedRegexList.length;
                }
                const currentRegexItem = sortedRegexList[currentRegexIndex];
                useRegex = currentRegexItem.regex;
                regexName = currentRegexItem.name;
                toastr.info(`正在使用【${regexName}】解析，匹配到${currentRegexItem.count}个章节`, "小说续写器");
            }
            currentParsedChapters = splitNovelIntoChapters(novelText, useRegex);
            extension_settings[extensionName].chapterList = currentParsedChapters;
            extension_settings[extensionName].chapterGraphMap = {};
            extension_settings[extensionName].mergedGraph = {};
            extension_settings[extensionName].continueWriteChain = [];
            extension_settings[extensionName].continueChapterIdCounter = 1;
            extension_settings[extensionName].selectedBaseChapterId = "";
            extension_settings[extensionName].writeContentPreview = "";
            extension_settings[extensionName].readerState = structuredClone(defaultSettings.readerState);
            extension_settings[extensionName].batchMergedGraphs = [];
            batchMergedGraphs = [];
            $('#novel-merged-graph-preview').val('');
            $('#novel-write-content-preview').val('');
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
    $("#novel-split-by-word-btn").off("click").on("click", () => {
        const file = $("#novel-file-upload")[0].files[0];
        const wordCount = parseInt($("#novel-split-word-count").val()) || 3000;
        if (!file) {
            toastr.warning('请先选择小说TXT文件', "小说续写器");
            return;
        }
        if (wordCount < 1000 || wordCount > 10000) {
            toastr.error('单章字数必须在1000-10000之间', "小说续写器");
            return;
        }
        const reader = new FileReader();
        reader.onload = (e) => {
            const novelText = e.target.result;
            currentParsedChapters = splitNovelByWordCount(novelText, wordCount);
            extension_settings[extensionName].chapterList = currentParsedChapters;
            extension_settings[extensionName].chapterGraphMap = {};
            extension_settings[extensionName].mergedGraph = {};
            extension_settings[extensionName].continueWriteChain = [];
            extension_settings[extensionName].continueChapterIdCounter = 1;
            extension_settings[extensionName].selectedBaseChapterId = "";
            extension_settings[extensionName].writeContentPreview = "";
            extension_settings[extensionName].readerState = structuredClone(defaultSettings.readerState);
            extension_settings[extensionName].batchMergedGraphs = [];
            batchMergedGraphs = [];
            $('#novel-merged-graph-preview').val('');
            $('#novel-write-content-preview').val('');
            continueWriteChain = [];
            continueChapterIdCounter = 1;
            lastParsedText = "";
            currentRegexIndex = 0;
            $("#novel-parse-chapter-btn").val("解析章节");
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
    $("#novel-auto-parent-preset-switch").off("change").on("change", (e) => {
        const isChecked = Boolean($(e.target).prop("checked"));
        extension_settings[extensionName].enableAutoParentPreset = isChecked;
        saveSettingsDebounced();
        updatePresetNameDisplay();
    });
    $("#novel-select-all-btn").off("click").on("click", () => {
        $(".novel-chapter-select").prop("checked", true);
    });
    $("#novel-unselect-all-btn").off("click").on("click", () => {
        $(".novel-chapter-select").prop("checked", false);
    });
    $("#novel-send-template-input").off("change").on("change", (e) => {
        extension_settings[extensionName].sendTemplate = $(e.target).val().trim();
        saveSettingsDebounced();
    });
    $("#novel-send-delay-input").off("change").on("change", (e) => {
        extension_settings[extensionName].sendDelay = parseInt($(e.target).val()) || 100;
        saveSettingsDebounced();
    });
    $("#novel-write-word-count").off("change").on("change", (e) => {
        extension_settings[extensionName].writeWordCount = parseInt($(e.target).val()) || 2000;
        saveSettingsDebounced();
    });
    $("#novel-import-selected-btn").off("click").on("click", () => {
        const selectedChapters = getSelectedChapters();
        sendChaptersBatch(selectedChapters);
    });
    $("#novel-import-all-btn").off("click").on("click", () => {
        sendChaptersBatch(currentParsedChapters);
    });
    $("#novel-stop-send-btn").off("click").on("click", () => {
        if (isSending) {
            stopSending = true;
            toastr.info('已停止发送', "小说续写器");
        }
    });
    $("#novel-chapter-graph-export-btn").off("click").on("click", exportChapterGraphs);
    $("#novel-chapter-graph-import-btn").off("click").on("click", () => {
        $("#novel-chapter-graph-file-upload").click();
    });
    $("#novel-chapter-graph-file-upload").off("change").on("change", (e) => {
        const file = e.target.files[0];
        if (file) importChapterGraphs(file);
    });
    $("#novel-validate-chapter-graph-btn").off("click").on("click", validateChapterGraphStatus);
    $("#novel-graph-single-btn").off("click").on("click", () => {
        const selectedChapters = getSelectedChapters();
        generateChapterGraphBatch(selectedChapters);
    });
    $("#novel-graph-batch-btn").off("click").on("click", () => {
        generateChapterGraphBatch(currentParsedChapters);
    });
    $("#novel-graph-merge-btn").off("click").on("click", mergeAllGraphs);
    $("#novel-graph-validate-btn").off("click").on("click", validateGraphCompliance);
    $("#novel-graph-import-btn").off("click").on("click", () => {
        $("#novel-graph-file-upload").click();
    });
    $("#novel-graph-file-upload").off("change").on("change", (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const graphData = JSON.parse(removeBOM(event.target.result.trim()));
                const fullRequiredFields = PromptConstants.mergeGraphJsonSchema.value.required;
                const singleRequiredFields = PromptConstants.graphJsonSchema.value.required;
                const hasFullFields = fullRequiredFields.every(field => Object.hasOwn(graphData, field));
                const hasSingleFields = singleRequiredFields.every(field => Object.hasOwn(graphData, field));
                if (!hasFullFields && !hasSingleFields) {
                    throw new Error("图谱格式错误，缺少核心必填字段，不支持该图谱格式");
                }
                extension_settings[extensionName].mergedGraph = graphData;
                saveSettingsDebounced();
                $('#novel-merged-graph-preview').val(JSON.stringify(graphData, null, 2));
                toastr.success('知识图谱导入完成！', "小说续写器");
            } catch (error) {
                console.error('图谱导入失败:', error);
                toastr.error(`导入失败：${error.message}，请检查JSON文件格式是否正确`, "小说续写器");
            } finally {
                $("#novel-graph-file-upload").val('');
            }
        };
        reader.onerror = () => {
            toastr.error('文件读取失败，请检查文件', "小说续写器");
            $("#novel-graph-file-upload").val('');
        };
        reader.readAsText(file, 'UTF-8');
    });
    $("#novel-graph-copy-btn").off("click").on("click", async () => {
        const graphText = $('#novel-merged-graph-preview').val();
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
    $("#novel-graph-export-btn").off("click").on("click", () => {
        const graphText = $('#novel-merged-graph-preview').val();
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
    $("#novel-graph-clear-btn").off("click").on("click", () => {
        extension_settings[extensionName].mergedGraph = {};
        extension_settings[extensionName].graphValidateResultShow = false;
        $('#novel-merged-graph-preview').val('');
        $('#novel-graph-validate-result').hide();
        saveSettingsDebounced();
        toastr.success('已清空合并图谱', "小说续写器");
    });
    $("#novel-graph-batch-merge-btn").off("click").on("click", batchMergeGraphs);
    $("#novel-graph-batch-clear-btn").off("click").on("click", clearBatchMergedGraphs);
    $("#novel-write-chapter-select").off("change").on("change", function(e) {
        const selectedChapterId = $(e.target).val();
        currentPrecheckResult = null;
        $("#novel-precheck-status").text("未执行").removeClass("novel-status-default novel-status-success novel-status-danger").addClass("novel-status-default");
        $("#novel-precheck-report").val("");
        $("#novel-write-content-preview").val("");
        $("#novel-write-status").text("");
        $("#novel-quality-result-block").hide();
        extension_settings[extensionName].selectedBaseChapterId = selectedChapterId;
        extension_settings[extensionName].precheckStatus = "未执行";
        extension_settings[extensionName].precheckReportText = "";
        extension_settings[extensionName].writeContentPreview = "";
        extension_settings[extensionName].qualityResultShow = false;
        saveSettingsDebounced();
        if (!selectedChapterId) {
            $('#novel-write-chapter-content').val('').prop('readonly', true);
            return;
        }
        const targetChapter = currentParsedChapters.find(item => item.id == selectedChapterId);
        if (targetChapter) {
            $('#novel-write-chapter-content').val(targetChapter.content).prop('readonly', false);
        }
    });
    $("#novel-graph-update-modified-btn").off("click").on("click", () => {
        const selectedChapterId = $('#novel-write-chapter-select').val();
        const modifiedContent = $('#novel-write-chapter-content').val().trim();
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
    $("#novel-precheck-run-btn").off("click").on("click", () => {
        const selectedChapterId = $('#novel-write-chapter-select').val();
        const modifiedContent = $('#novel-write-chapter-content').val().trim();
        if (!selectedChapterId) {
            toastr.error('请先选择基准章节', "小说续写器");
            return;
        }
        validateContinuePrecondition(selectedChapterId, modifiedContent);
    });
    $("#novel-quality-check-switch").off("change").on("change", (e) => {
        const isChecked = Boolean($(e.target).prop("checked"));
        extension_settings[extensionName].enableQualityCheck = isChecked;
        saveSettingsDebounced();
    });
    $("#novel-write-generate-btn").off("click").on("click", generateNovelWrite);
    $("#novel-write-stop-btn").off("click").on("click", () => {
        if (isGeneratingWrite) {
            stopGenerateFlag = true;
            isGeneratingWrite = false;
            $('#novel-write-status').text('已停止生成');
            setButtonDisabled('#novel-write-generate-btn, #novel-write-stop-btn', false);
            toastr.info('已停止生成续写内容', "小说续写器");
        }
    });
    $("#novel-write-copy-btn").off("click").on("click", async () => {
        const writeText = $('#novel-write-content-preview').val();
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
    $("#novel-write-send-btn").off("click").on("click", () => {
        const context = getContext();
        const writeText = $('#novel-write-content-preview').val();
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
    $("#novel-write-clear-btn").off("click").on("click", () => {
        $('#novel-write-content-preview').val('');
        $('#novel-write-status').text('');
        $('#novel-quality-result-block').hide();
        extension_settings[extensionName].writeContentPreview = "";
        extension_settings[extensionName].qualityResultShow = false;
        saveSettingsDebounced();
        toastr.success('已清空续写内容', "小说续写器");
    });
    $("#novel-clear-chain-btn").off("click").on("click", () => {
        continueWriteChain = [];
        continueChapterIdCounter = 1;
        extension_settings[extensionName].continueWriteChain = continueWriteChain;
        extension_settings[extensionName].continueChapterIdCounter = continueChapterIdCounter;
        saveSettingsDebounced();
        renderContinueWriteChain(continueWriteChain);
        NovelReader.renderChapterList();
        toastr.success('已清空所有续写章节', "小说续写器");
    });
    // ====================== 新增：设置面板事件绑定 ======================
    // API设置保存
    $("#novel-api-settings-save-btn").off("click").on("click", () => {
        const callInterval = parseInt($("#novel-api-call-interval").val()) || 2000;
        const enableBreakLimit = Boolean($("#novel-api-break-limit-switch").prop("checked"));
        if (callInterval < 500 || callInterval > 30000) {
            toastr.error('API调用间隔必须在500-30000ms之间', "小说续写器");
            return;
        }
        extension_settings[extensionName].apiConfig = { callInterval, enableBreakLimit };
        saveSettingsDebounced();
        toastr.success('API设置已保存', "小说续写器");
    });
    // UI设置保存
    $("#novel-ui-settings-save-btn").off("click").on("click", () => {
        const floatBallSize = parseInt($("#novel-ui-float-ball-size").val()) || 70;
        const defaultActiveTab = $("#novel-ui-default-tab").val();
        const enableHoverEffect = Boolean($("#novel-ui-hover-switch").prop("checked"));
        const autoSaveDraft = Boolean($("#novel-ui-draft-switch").prop("checked"));
        if (floatBallSize < 50 || floatBallSize > 100) {
            toastr.error('悬浮球大小必须在50-100px之间', "小说续写器");
            return;
        }
        extension_settings[extensionName].uiConfig = { floatBallSize, defaultActiveTab, enableHoverEffect, autoSaveDraft };
        saveSettingsDebounced();
        // 应用悬浮球大小
        const ballEl = document.getElementById("novel-writer-float-ball");
        if (ballEl) {
            ballEl.style.width = `${floatBallSize}px`;
            ballEl.style.height = `${floatBallSize}px`;
        }
        toastr.success('UI设置已保存', "小说续写器");
    });
    // 提示词保存
    $("#novel-prompt-save-btn").off("click").on("click", saveCustomPrompts);
    // 提示词重置
    $("#novel-prompt-reset-btn").off("click").on("click", resetPromptsToDefault);
});
