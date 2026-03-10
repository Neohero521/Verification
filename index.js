// 严格遵循SillyTavern官方扩展规范，所有核心API从getContext获取，不直接导入内部文件
const MODULE_NAME = "Always_remember_me";
const EXTENSION_PATH = `/scripts/extensions/third-party/${MODULE_NAME}`;

// 从ST全局上下文获取所有稳定API（官方推荐唯一方式）
const {
    eventSource,
    event_types,
    extensionSettings,
    saveSettingsDebounced,
    generateRaw,
    executeSlashCommandsWithOptions,
    getContext,
    Popup,
    libs: { lodash, DOMPurify }
} = SillyTavern.getContext();

// 全局共享状态（模块化共享，不污染window）
export const state = {
    extensionName: MODULE_NAME,
    extensionFolderPath: EXTENSION_PATH,
    presetChapterRegexList: [
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
    ],
    defaultSettings: Object.freeze({
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
        enableAutoParentPreset: true,
        writeWordCount: 2000
    }),
    // 运行时状态
    currentRegexIndex: 0,
    sortedRegexList: [],
    lastParsedText: "",
    currentParsedChapters: [],
    isGeneratingGraph: false,
    isGeneratingWrite: false,
    stopGenerateFlag: false,
    isSending: false,
    stopSending: false,
    continueWriteChain: [],
    continueChapterIdCounter: 1,
    currentPrecheckResult: null,
    isInitialized: false,
    // 全局JSON Schema
    graphJsonSchema: {
        name: 'NovelKnowledgeGraph',
        strict: true,
        value: {"$schema": "http://json-schema.org/draft-04/schema#","type": "object","required": ["基础章节信息", "人物信息", "世界观设定", "核心剧情线", "文风特点", "实体关系网络", "变更与依赖信息", "逆向分析洞察"],"properties": {"基础章节信息": {"type": "object","required": ["章节号", "章节版本号", "章节节点唯一标识", "本章字数", "叙事时间线节点"],"properties": {"章节号": { "type": "string"},"章节版本号": { "type": "string", "default": "1.0"},"章节节点唯一标识": { "type": "string"},"本章字数": { "type": "number"},"叙事时间线节点": { "type": "string"}}},"人物信息": {"type": "array", "minItems": 1,"items": {"type": "object","required": ["唯一人物ID", "姓名", "别名/称号", "本章更新的性格特征", "本章更新的身份/背景", "本章核心行为与动机", "本章人物关系变更", "本章人物弧光变化"],"properties": {"唯一人物ID": { "type": "string"},"姓名": { "type": "string"},"别名/称号": { "type": "string"},"本章更新的性格特征": { "type": "string"},"本章更新的身份/背景": { "type": "string"},"本章核心行为与动机": { "type": "string"},"本章人物关系变更": {"type": "array","items": {"type": "object","required": ["关系对象", "关系类型", "关系强度0-1", "关系描述", "对应原文位置"],"properties": {"关系对象": { "type": "string"},"关系类型": { "type": "string"},"关系强度0-1": { "type": "number", "minimum": 0, "maximum": 1 },"关系描述": { "type": "string"},"对应原文位置": { "type": "string"}}}},"本章人物弧光变化": { "type": "string"}}}},"世界观设定": {"type": "object","required": ["本章新增/变更的时代背景", "本章新增/变更的地理区域", "本章新增/变更的力量体系/规则", "本章新增/变更的社会结构", "本章新增/变更的独特物品/生物","本章新增的隐藏设定/伏笔", "对应原文位置"],"properties": {"本章新增/变更的时代背景": { "type": "string"},"本章新增/变更的地理区域": { "type": "string"},"本章新增/变更的力量体系/规则": { "type": "string"},"本章新增/变更的社会结构": { "type": "string"},"本章新增/变更的独特物品/生物": { "type": "string"},"本章新增的隐藏设定/伏笔": { "type": "string"},"对应原文位置": { "type": "string"}}},"核心剧情线": {"type": "object","required": ["本章主线剧情描述", "本章关键事件列表", "本章支线剧情", "本章核心冲突进展", "本章未回收伏笔"],"properties": {"本章主线剧情描述": { "type": "string"},"本章关键事件列表": {"type": "array","items": {"type": "object","required": ["事件ID", "事件名", "参与人物", "前因", "后果", "对主线的影响", "对应原文位置"],"properties": {"事件ID": { "type": "string"},"事件名": { "type": "string"},"参与人物": { "type": "string"},"前因": { "type": "string"},"后果": { "type": "string"},"对主线的影响": { "type": "string"},"对应原文位置": { "type": "string"}}}},"本章支线剧情": { "type": "string"},"本章核心冲突进展": { "type": "string"},"本章未回收伏笔": { "type": "string"}}},"文风特点": {"type": "object","required": ["本章叙事视角", "语言风格", "对话特点", "常用修辞", "节奏特点", "与全文文风的匹配度说明"],"properties": {"本章叙事视角": { "type": "string"},"语言风格": { "type": "string"},"对话特点": { "type": "string"},"常用修辞": { "type": "string"},"节奏特点": { "type": "string"},"与全文文风的匹配度说明": { "type": "string"}}},"实体关系网络": {"type": "array", "minItems": 5,"items": { "type": "array", "minItems": 3, "maxItems": 3, "items": { "type": "string"} }},"变更与依赖信息": {"type": "object","required": ["本章对全局图谱的变更项", "本章剧情依赖的前置章节", "本章内容对后续剧情的影响预判", "本章内容与前文的潜在冲突预警"],"properties": {"本章对全局图谱的变更项": { "type": "string"},"本章剧情依赖的前置章节": { "type": "string"},"本章内容对后续剧情的影响预判": { "type": "string"},"本章内容与前文的潜在冲突预警": { "type": "string"}}},"逆向分析洞察": { "type": "string"}}}
    },
    mergeGraphJsonSchema: {
        name: 'MergedNovelKnowledgeGraph',
        strict: true,
        value: {"$schema": "http://json-schema.org/draft-04/schema#","type": "object","required": ["全局基础信息", "人物信息库", "世界观设定库", "全剧情时间线", "全局文风标准", "全量实体关系网络", "反向依赖图谱", "逆向分析与质量评估"],"properties": {"全局基础信息": {"type": "object","required": ["小说名称", "总章节数", "已解析文本范围", "全局图谱版本号", "最新更新时间"],"properties": {"小说名称": { "type": "string"},"总章节数": { "type": "number"},"已解析文本范围": { "type": "string"},"全局图谱版本号": { "type": "string"},"最新更新时间": { "type": "string"}}},"人物信息库": {"type": "array","items": {"type": "object","required": ["唯一人物ID", "姓名", "所有别名/称号", "全本最终性格特征", "完整身份/背景", "全本核心动机", "全时间线人物关系网", "完整人物弧光", "人物关键事件时间线"],"properties": {"唯一人物ID": { "type": "string"},"姓名": { "type": "string"},"所有别名/称号": { "type": "string"},"全本最终性格特征": { "type": "string"},"完整身份/背景": { "type": "string"},"全本核心动机": { "type": "string"},"全时间线人物关系网": {"type": "array","items": {"type": "object","required": ["关系对象", "关系类型", "关系强度", "关系演变过程", "对应章节"],"properties": {"关系对象": { "type": "string"},"关系类型": { "type": "string"},"关系强度": { "type": "number", "minimum": 0, "maximum": 1 },"关系演变过程": { "type": "string"},"对应章节": { "type": "string"}}}},"完整人物弧光": { "type": "string"},"人物关键事件时间线": { "type": "string"}}}},"世界观设定库": {"type": "object","required": ["时代背景", "核心地理区域与地图", "完整力量体系/规则", "社会结构", "核心独特物品/生物", "全本所有隐藏设定/伏笔汇总", "设定变更历史记录"],"properties": {"时代背景": { "type": "string"},"核心地理区域与地图": { "type": "string"},"完整力量体系/规则": { "type": "string"},"社会结构": { "type": "string"},"核心独特物品/生物": { "type": "string"},"全本所有隐藏设定/伏笔汇总": {"type": "array","items": {"type": "object","required": ["伏笔内容", "出现章节", "当前回收状态", "预判回收节点"],"properties": {"伏笔内容": { "type": "string"},"出现章节": { "type": "string"},"当前回收状态": { "type": "string", "enum": ["未回收", "已回收", "待回收"] },"预判回收节点": { "type": "string"}}}},"设定变更历史记录": {"type": "array","items": {"type": "object","required": ["变更章节", "变更内容", "生效范围"],"properties": {"变更章节": { "type": "string"},"变更内容": { "type": "string"},"生效范围": { "type": "string"}}}}}},"全剧情时间线": {"type": "object","required": ["主线剧情完整脉络", "全本关键事件时序表", "支线剧情汇总与关联关系", "全本核心冲突演变轨迹", "剧情节点依赖关系图"],"properties": {"主线剧情完整脉络": { "type": "string"},"全本关键事件时序表": {"type": "array","items": {"type": "object","required": ["事件ID", "事件名", "参与人物", "发生章节", "前因后果", "对主线的影响"],"properties": {"事件ID": { "type": "string"},"事件名": { "type": "string"},"参与人物": { "type": "string"},"发生章节": { "type": "string"},"前因后果": { "type": "string"},"对主线的影响": { "type": "string"}}}},"支线剧情汇总与关联关系": { "type": "string"},"全本核心冲突演变轨迹": { "type": "string"},"剧情节点依赖关系图": { "type": "string"}}},"全局文风标准": {"type": "object","required": ["固定叙事视角", "核心语言风格", "对话写作特点", "常用修辞与句式", "整体节奏规律", "场景描写习惯"],"properties": {"固定叙事视角": { "type": "string"},"核心语言风格": { "type": "string"},"对话写作特点": { "type": "string"},"常用修辞与句式": { "type": "string"},"整体节奏规律": { "type": "string"},"场景描写习惯": { "type": "string"}}},"全量实体关系网络": {"type": "array", "minItems": 20,"items": { "type": "array", "minItems": 3, "maxItems": 3, "items": { "type": "string"} }},"反向依赖图谱": {"type": "array","items": {"type": "object","required": ["章节节点ID", "生效人设状态", "生效设定状态", "生效剧情状态", "依赖的前置节点"],"properties": {"章节节点ID": { "type": "string"},"生效人设状态": { "type": "string"},"生效设定状态": { "type": "string"},"生效剧情状态": { "type": "string"},"依赖的前置节点": { "type": "array", "items": { "type": "string"} }}}},"逆向分析与质量评估": {"type": "object","required": ["全本隐藏信息汇总", "潜在剧情矛盾预警", "设定一致性校验结果", "人设连贯性评估", "伏笔完整性评估", "全文本逻辑自洽性得分"],"properties": {"全本隐藏信息汇总": { "type": "string"},"潜在剧情矛盾预警": { "type": "string"},"设定一致性校验结果": { "type": "string"},"人设连贯性评估": { "type": "string"},"伏笔完整性评估": { "type": "string"},"全文本逻辑自洽性得分": { "type": "number", "minimum": 0, "maximum": 100 }}}}}
    },
    qualityEvaluateSchema: {
        name: 'NovelContinueQualityEvaluate',
        strict: true,
        value: {"$schema": "http://json-schema.org/draft-04/schema#","type": "object","required": ["总分", "人设一致性得分", "设定合规性得分", "剧情衔接度得分", "文风匹配度得分", "内容质量得分", "评估报告", "是否合格"],"properties": {"总分": { "type": "number", "minimum": 0, "maximum": 100 },"人设一致性得分": { "type": "number", "minimum": 0, "maximum": 100 },"设定合规性得分": { "type": "number", "minimum": 0, "maximum": 100 },"剧情衔接度得分": { "type": "number", "minimum": 0, "maximum": 100 },"文风匹配度得分": { "type": "number", "minimum": 0, "maximum": 100 },"内容质量得分": { "type": "number", "minimum": 0, "maximum": 100 },"评估报告": { "type": "string"},"是否合格": { "type": "boolean"}}}
    }
};

// 工具函数模块导入
import { debounce, deepMerge, removeBOM, copyToClipboard, renderCommandTemplate, setButtonDisabled, getActivePresetParams } from './utils.js';
// 核心模块导入
import { FloatBall } from './floatBall.js';
import { NovelReader } from './novelReader.js';
import {
    splitNovelByWordCount, splitNovelIntoChapters, getSortedRegexList,
    renderChapterList, renderChapterSelect, renderContinueWriteChain,
    sendChaptersBatch, getSelectedChapters
} from './chapterManager.js';
import {
    generateChapterGraphBatch, mergeAllGraphs, validateGraphCompliance,
    validateChapterGraphStatus, exportChapterGraphs, importChapterGraphs,
    updateModifiedChapterGraph, updateGraphWithContinueContent
} from './knowledgeGraph.js';
import { validateContinuePrecondition, evaluateContinueQuality, generateNovelWrite, generateContinueWrite, initContinueChainEvents } from './novelWrite.js';

// 全局导出给子模块使用
export {
    debounce, deepMerge, removeBOM, copyToClipboard, renderCommandTemplate, setButtonDisabled, getActivePresetParams,
    generateRaw, executeSlashCommandsWithOptions, saveSettingsDebounced, extensionSettings, lodash, DOMPurify, getContext,
    FloatBall, NovelReader
};

// 初始化设置
export function loadSettings() {
    // 用lodash深度合并默认配置，修复深层默认值丢失
    extensionSettings[MODULE_NAME] = lodash.merge(
        structuredClone(state.defaultSettings),
        extensionSettings[MODULE_NAME] || {}
    );
    const settings = extensionSettings[MODULE_NAME];

    // 同步运行时状态
    state.currentParsedChapters = settings.chapterList || [];
    state.continueWriteChain = settings.continueWriteChain || [];
    state.continueChapterIdCounter = settings.continueChapterIdCounter || 1;
    state.currentPrecheckResult = settings.precheckReport || null;

    // 同步UI
    $("#example_setting").prop("checked", settings.example_setting).trigger("input");
    $("#chapter-regex-input").val(settings.chapterRegex);
    $("#send-template-input").val(settings.sendTemplate);
    $("#send-delay-input").val(settings.sendDelay);
    $("#quality-check-switch").prop("checked", settings.enableQualityCheck);
    $("#write-word-count").val(settings.writeWordCount || 2000);
    $("#auto-parent-preset-switch").prop("checked", settings.enableAutoParentPreset);

    const mergedGraph = settings.mergedGraph || {};
    $("#merged-graph-preview").val(Object.keys(mergedGraph).length > 0 ? JSON.stringify(mergedGraph, null, 2) : "");
    $("#write-content-preview").val(settings.writeContentPreview || "");

    if (settings.graphValidateResultShow) $("#graph-validate-result").show();
    if (settings.qualityResultShow) $("#quality-result-block").show();
    $("#precheck-status").text(settings.precheckStatus || "未执行").removeClass("status-default status-success status-danger").addClass(settings.precheckStatus === "通过"?"status-success": settings.precheckStatus === "不通过"? "status-danger": "status-default");
    $("#precheck-report").val(settings.precheckReportText || "");

    // 渲染列表
    renderChapterList(state.currentParsedChapters);
    renderChapterSelect(state.currentParsedChapters);
    renderContinueWriteChain(state.continueWriteChain);
    NovelReader.renderChapterList();
    restoreDrawerState();

    if (settings.selectedBaseChapterId) {
        $("#write-chapter-select").val(settings.selectedBaseChapterId).trigger("change");
    }

    state.isInitialized = true;
    console.log(`[${MODULE_NAME}] 配置加载完成`);
}

// 抽屉状态管理
export function saveDrawerState() {
    const drawerState = {};
    $('.novel-writer-extension .inline-drawer').each(function() {
        const drawerId = $(this).attr('id');
        if (drawerId) {
            drawerState[drawerId] = $(this).hasClass('open');
        }
    });
    extensionSettings[MODULE_NAME].drawerState = drawerState;
    saveSettingsDebounced();
}

export function restoreDrawerState() {
    const savedState = extensionSettings[MODULE_NAME].drawerState || state.defaultSettings.drawerState;
    $('.novel-writer-extension .inline-drawer').each(function() {
        const drawerId = $(this).attr('id');
        if (drawerId && savedState[drawerId] !== undefined) {
            $(this).toggleClass('open', savedState[drawerId]);
        }
    });
}

export function initDrawerToggle() {
    $('#novel-writer-panel').off('click', '.inline-drawer-header').on('click', '.inline-drawer-header', function(e) {
        e.preventDefault();
        e.stopPropagation();
        const $drawer = $(this).closest('.inline-drawer');
        $drawer.toggleClass('open');
        saveDrawerState();
    });
}

// 页面可见性监听
export function initVisibilityListener() {
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && state.isInitialized) {
            if (state.isGeneratingWrite) {
                $('#write-status').text('生成状态异常，请重新点击生成');
                state.isGeneratingWrite = false;
                state.stopGenerateFlag = false;
                setButtonDisabled('#write-generate-btn, .continue-write-btn, #write-stop-btn', false);
            }
            if (state.isGeneratingGraph) {
                $('#graph-generate-status').text('图谱生成状态异常，请重新点击生成');
                state.isGeneratingGraph = false;
                state.stopGenerateFlag = false;
                setButtonDisabled('#graph-single-btn, #graph-batch-btn, #graph-merge-btn', false);
            }
            if (state.isSending) {
                $('#novel-import-status').text('发送状态异常，请重新点击导入');
                state.isSending = false;
                state.stopSending = false;
                setButtonDisabled('#import-selected-btn, #import-all-btn, #stop-send-btn', false);
            }
        }
    });
}

// 示例配置事件
export function onExampleInput(event) {
    const value = Boolean($(event.target).prop("checked"));
    extensionSettings[MODULE_NAME].example_setting = value;
    saveSettingsDebounced();
}

export function onButtonClick() {
    toastr.info(`The checkbox is ${extensionSettings[MODULE_NAME].example_setting ? "checked": "not checked"}`, "Extension Example");
}

// 插件主初始化函数
async function initExtension() {
    try {
        console.log(`[${MODULE_NAME}] 开始加载小说续写插件`);
        // 1. 加载HTML模板（绝对路径，避免相对路径错误）
        const settingsHtml = await $.get(`${EXTENSION_PATH}/example.html`);
        $("body").append(settingsHtml);
        await new Promise(resolve => setTimeout(resolve, 200)); // 等待DOM渲染
        console.log(`[${MODULE_NAME}] UI模板加载完成`);

        // 2. 初始化基础模块
        initDrawerToggle();
        initContinueChainEvents();
        initVisibilityListener();
        await loadSettings();

        // 3. 初始化核心功能模块
        FloatBall.init();
        NovelReader.init();
        console.log(`[${MODULE_NAME}] 核心模块初始化完成`);

        // 4. 绑定所有页面事件
        bindAllEvents();
        console.log(`[${MODULE_NAME}] 插件加载完成！`);
        toastr.success('小说智能续写插件加载成功', '插件就绪');

    } catch (error) {
        console.error(`[${MODULE_NAME}] 插件加载失败:`, error);
        toastr.error(`小说续写插件加载失败：${error.message}`, "插件错误");
    }
}

// 全量事件绑定
function bindAllEvents() {
    // 基础配置事件
    $("#my_button").off("click").on("click", onButtonClick);
    $("#example_setting").off("input").on("input", onExampleInput);

    // 文件选择事件
    $("#select-file-btn").off("click").on("click", () => $("#novel-file-upload").click());
    $("#novel-file-upload").off("change").on("change", (e) => {
        const file = e.target.files[0];
        if (file) {
            $("#file-name-text").text(file.name);
            state.lastParsedText = "";
            state.currentRegexIndex = 0;
            $("#parse-chapter-btn").val("解析章节");
        }
    });

    // 解析章节事件
    $("#parse-chapter-btn").off("click").on("click", () => {
        const file = $("#novel-file-upload")[0].files[0];
        const customRegex = $("#chapter-regex-input").val().trim();
        if (!file) {
            toastr.warning('请先选择小说TXT文件', "小说续写器");
            return;
        }
        if (customRegex) {
            extensionSettings[MODULE_NAME].chapterRegex = customRegex;
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
                if (state.lastParsedText !== novelText) {
                    state.lastParsedText = novelText;
                    state.sortedRegexList = getSortedRegexList(novelText);
                    state.currentRegexIndex = 0;
                    $("#parse-chapter-btn").val("再次解析");
                } else {
                    state.currentRegexIndex = (state.currentRegexIndex + 1) % state.sortedRegexList.length;
                }
                const currentRegexItem = state.sortedRegexList[state.currentRegexIndex];
                useRegex = currentRegexItem.regex;
                regexName = currentRegexItem.name;
                toastr.info(`正在使用【${regexName}】解析，匹配到${currentRegexItem.count}个章节`, "小说续写器");
            }
            state.currentParsedChapters = splitNovelIntoChapters(novelText, useRegex);
            // 重置状态
            extensionSettings[MODULE_NAME].chapterList = state.currentParsedChapters;
            extensionSettings[MODULE_NAME].chapterGraphMap = {};
            extensionSettings[MODULE_NAME].mergedGraph = {};
            extensionSettings[MODULE_NAME].continueWriteChain = [];
            extensionSettings[MODULE_NAME].continueChapterIdCounter = 1;
            extensionSettings[MODULE_NAME].selectedBaseChapterId = "";
            extensionSettings[MODULE_NAME].writeContentPreview = "";
            extensionSettings[MODULE_NAME].readerState = structuredClone(state.defaultSettings.readerState);
            $('#merged-graph-preview').val('');
            $('#write-content-preview').val('');
            state.continueWriteChain = [];
            state.continueChapterIdCounter = 1;
            saveSettingsDebounced();
            // 刷新UI
            renderChapterList(state.currentParsedChapters);
            renderChapterSelect(state.currentParsedChapters);
            renderContinueWriteChain(state.continueWriteChain);
            NovelReader.renderChapterList();
        };
        reader.onerror = () => toastr.error('文件读取失败，请检查文件编码（仅支持UTF-8）', "小说续写器");
        reader.readAsText(file, 'UTF-8');
    });

    // 按字数拆分事件
    $("#split-by-word-btn").off("click").on("click", () => {
        const file = $("#novel-file-upload")[0].files[0];
        const wordCount = parseInt($("#split-word-count").val()) || 3000;
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
            state.currentParsedChapters = splitNovelByWordCount(novelText, wordCount);
            // 重置状态
            extension_settings[MODULE_NAME].chapterList = state.currentParsedChapters;
            extension_settings[MODULE_NAME].chapterGraphMap = {};
            extension_settings[MODULE_NAME].mergedGraph = {};
            extension_settings[MODULE_NAME].continueWriteChain = [];
            extension_settings[MODULE_NAME].continueChapterIdCounter = 1;
            extension_settings[MODULE_NAME].selectedBaseChapterId = "";
            extension_settings[MODULE_NAME].writeContentPreview = "";
            extension_settings[MODULE_NAME].readerState = structuredClone(state.defaultSettings.readerState);
            $('#merged-graph-preview').val('');
            $('#write-content-preview').val('');
            state.continueWriteChain = [];
            state.continueChapterIdCounter = 1;
            state.lastParsedText = "";
            state.currentRegexIndex = 0;
            $("#parse-chapter-btn").val("解析章节");
            saveSettingsDebounced();
            // 刷新UI
            renderChapterList(state.currentParsedChapters);
            renderChapterSelect(state.currentParsedChapters);
            renderContinueWriteChain(state.continueWriteChain);
            NovelReader.renderChapterList();
        };
        reader.onerror = () => toastr.error('文件读取失败，请检查文件编码（仅支持UTF-8）', "小说续写器");
        reader.readAsText(file, 'UTF-8');
    });

    // 父级预设开关
    $("#auto-parent-preset-switch").off("change").on("change", (e) => {
        const isChecked = Boolean($(e.target).prop("checked"));
        extension_settings[MODULE_NAME].enableAutoParentPreset = isChecked;
        saveSettingsDebounced();
    });

    // 章节全选/取消
    $("#select-all-btn").off("click").on("click", () => $(".chapter-select").prop("checked", true));
    $("#unselect-all-btn").off("click").on("click", () => $(".chapter-select").prop("checked", false));

    // 发送配置
    $("#send-template-input").off("change").on("change", (e) => {
        extension_settings[MODULE_NAME].sendTemplate = $(e.target).val().trim();
        saveSettingsDebounced();
    });
    $("#send-delay-input").off("change").on("change", (e) => {
        extension_settings[MODULE_NAME].sendDelay = parseInt($(e.target).val()) || 100;
        saveSettingsDebounced();
    });
    $("#write-word-count").off("change").on("change", (e) => {
        extension_settings[MODULE_NAME].writeWordCount = parseInt($(e.target).val()) || 2000;
        saveSettingsDebounced();
    });

    // 章节导入
    $("#import-selected-btn").off("click").on("click", () => sendChaptersBatch(getSelectedChapters()));
    $("#import-all-btn").off("click").on("click", () => sendChaptersBatch(state.currentParsedChapters));
    $("#stop-send-btn").off("click").on("click", () => {
        if (state.isSending) {
            state.stopSending = true;
            toastr.info('已停止发送', "小说续写器");
        }
    });

    // 图谱导入导出
    $("#chapter-graph-export-btn").off("click").on("click", exportChapterGraphs);
    $("#chapter-graph-import-btn").off("click").on("click", () => $("#chapter-graph-file-upload").click());
    $("#chapter-graph-file-upload").off("change").on("change", (e) => {
        const file = e.target.files[0];
        if (file) importChapterGraphs(file);
    });

    // 图谱核心事件
    $("#validate-chapter-graph-btn").off("click").on("click", validateChapterGraphStatus);
    $("#graph-single-btn").off("click").on("click", () => generateChapterGraphBatch(getSelectedChapters()));
    $("#graph-batch-btn").off("click").on("click", () => generateChapterGraphBatch(state.currentParsedChapters));
    $("#graph-merge-btn").off("click").on("click", mergeAllGraphs);
    $("#graph-validate-btn").off("click").on("click", validateGraphCompliance);

    // 全量图谱导入导出
    $("#graph-import-btn").off("click").on("click", () => $("#graph-file-upload").click());
    $("#graph-file-upload").off("change").on("change", (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const graphData = JSON.parse(removeBOM(event.target.result.trim()));
                const fullRequiredFields = state.mergeGraphJsonSchema.value.required;
                const singleRequiredFields = state.graphJsonSchema.value.required;
                const hasFullFields = fullRequiredFields.every(field => Object.hasOwn(graphData, field));
                const hasSingleFields = singleRequiredFields.every(field => Object.hasOwn(graphData, field));
                if (!hasFullFields && !hasSingleFields) {
                    throw new Error("图谱格式错误，缺少核心必填字段");
                }
                extension_settings[MODULE_NAME].mergedGraph = graphData;
                saveSettingsDebounced();
                $('#merged-graph-preview').val(JSON.stringify(graphData, null, 2));
                toastr.success('知识图谱导入完成！', "小说续写器");
            } catch (error) {
                console.error('图谱导入失败:', error);
                toastr.error(`导入失败：${error.message}`, "小说续写器");
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
        success ? toastr.success('图谱JSON已复制到剪贴板', "小说续写器") : toastr.error('复制失败', "小说续写器");
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
        extension_settings[MODULE_NAME].mergedGraph = {};
        extension_settings[MODULE_NAME].graphValidateResultShow = false;
        $('#merged-graph-preview').val('');
        $('#graph-validate-result').hide();
        saveSettingsDebounced();
        toastr.success('已清空合并图谱', "小说续写器");
    });

    // 续写模块事件
    $("#write-chapter-select").off("change").on("change", function (e) {
        const selectedChapterId = $(e.target).val();
        state.currentPrecheckResult = null;
        $("#precheck-status").text("未执行").removeClass("status-success status-danger").addClass("status-default");
        $("#precheck-report").val("");
        $("#write-content-preview").val("");
        $("#write-status").text("");
        $("#quality-result-block").hide();
        extension_settings[MODULE_NAME].selectedBaseChapterId = selectedChapterId;
        extension_settings[MODULE_NAME].precheckStatus = "未执行";
        extension_settings[MODULE_NAME].precheckReportText = "";
        extension_settings[MODULE_NAME].writeContentPreview = "";
        extension_settings[MODULE_NAME].qualityResultShow = false;
        saveSettingsDebounced();
        if (!selectedChapterId) {
            $('#write-chapter-content').val('').prop('readonly', true);
            return;
        }
        const targetChapter = state.currentParsedChapters.find(item => item.id == selectedChapterId);
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
        extension_settings[MODULE_NAME].enableQualityCheck = isChecked;
        saveSettingsDebounced();
    });
    $("#write-generate-btn").off("click").on("click", generateNovelWrite);
    $("#write-stop-btn").off("click").on("click", () => {
        if (state.isGeneratingWrite) {
            state.stopGenerateFlag = true;
            state.isGeneratingWrite = false;
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
        success ? toastr.success('续写内容已复制到剪贴板', "小说续写器") : toastr.error('复制失败', "小说续写器");
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
        const command = renderCommandTemplate(extension_settings[MODULE_NAME].sendTemplate, currentCharName, writeText);
        executeSlashCommandsWithOptions(command).then(() => {
            toastr.success('续写内容已发送到对话框', "小说续写器");
        }).catch((error) => {
            toastr.error(`发送失败: ${error.message}`, "小说续写器");
        });
    });
    $("#write-clear-btn").off("click").on("click", () => {
        $('#write-content-preview').val('');
        $('#write-status').text('');
        $('#quality-result-block').hide();
        extension_settings[MODULE_NAME].writeContentPreview = "";
        extension_settings[MODULE_NAME].qualityResultShow = false;
        saveSettingsDebounced();
        toastr.success('已清空续写内容', "小说续写器");
    });
    $("#clear-chain-btn").off("click").on("click", () => {
        state.continueWriteChain = [];
        state.continueChapterIdCounter = 1;
        extension_settings[MODULE_NAME].continueWriteChain = state.continueWriteChain;
        extension_settings[MODULE_NAME].continueChapterIdCounter = state.continueChapterIdCounter;
        saveSettingsDebounced();
        renderContinueWriteChain(state.continueWriteChain);
        NovelReader.renderChapterList();
        toastr.success('已清空所有续写章节', "小说续写器");
    });
}

// 官方规范：必须监听APP_READY事件，ST完全加载后再初始化插件
eventSource.once(event_types.APP_READY, initExtension);
