import {
    extension_settings, extensionName, saveSettingsDebounced, defaultSettings,
    currentParsedChapters, continueWriteChain, continueChapterIdCounter, currentPrecheckResult, isInitialized,
    isGeneratingWrite, isGeneratingGraph, isSending, stopGenerateFlag, stopSending
} from "./constants.js";
import { deepMerge, setButtonDisabled } from "./utils.js";
import { renderChapterList, renderChapterSelect, renderContinueWriteChain } from "./chapterManager.js";
import { FloatBall } from "./floatBall.js";
import { NovelReader } from "./novelReader.js";

// 示例配置事件
export function onExampleInput(event) {
    const value = Boolean($(event.target).prop("checked"));
    extension_settings[extensionName].example_setting = value;
    saveSettingsDebounced();
}

export function onButtonClick() {
    toastr.info(`The checkbox is ${extension_settings[extensionName].example_setting ? "checked" : "not checked"}`, "Extension Example");
}

// 保存抽屉状态
export function saveDrawerState() {
    const drawerState = {};
    $('.novel-writer-extension-root .inline-drawer').each(function () {
        const drawerId = $(this).attr('id');
        if (drawerId) {
            drawerState[drawerId] = $(this).hasClass('open');
        }
    });
    extension_settings[extensionName].drawerState = drawerState;
    saveSettingsDebounced();
}

// 恢复抽屉状态
export function restoreDrawerState() {
    const savedState = extension_settings[extensionName].drawerState || defaultSettings.drawerState;
    $('.novel-writer-extension-root .inline-drawer').each(function () {
        const drawerId = $(this).attr('id');
        if (drawerId && savedState[drawerId] !== undefined) {
            $(this).toggleClass('open', savedState[drawerId]);
        }
    });
}

// 初始化抽屉切换事件
export function initDrawerToggle() {
    $('#novel-writer-panel').off('click', '.inline-drawer-header').on('click', '.inline-drawer-header', function (e) {
        e.preventDefault();
        e.stopPropagation();
        const $drawer = $(this).closest('.inline-drawer');
        $drawer.toggleClass('open');
        saveDrawerState();
    });
}

// 初始化页面可见性监听
export function initVisibilityListener() {
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

// 加载插件设置
export async function loadSettings() {
    extension_settings[extensionName] = extension_settings[extensionName] || {};
    extension_settings[extensionName] = deepMerge(defaultSettings, extension_settings[extensionName]);

    // 补全缺失的默认字段，100%兼容旧数据
    for (const key of Object.keys(defaultSettings)) {
        if (!Object.hasOwn(extension_settings[extensionName], key)) {
            extension_settings[extensionName][key] = structuredClone(defaultSettings[key]);
        }
    }

    // 初始化全局状态
    currentParsedChapters.length = 0;
    currentParsedChapters.push(...(extension_settings[extensionName].chapterList || []));
    continueWriteChain.length = 0;
    continueWriteChain.push(...(extension_settings[extensionName].continueWriteChain || []));
    continueChapterIdCounter = extension_settings[extensionName].continueChapterIdCounter || 1;
    currentPrecheckResult = extension_settings[extensionName].precheckReport || null;
    const settings = extension_settings[extensionName];

    // 初始化表单元素
    $("#example_setting").prop("checked", settings.example_setting).trigger("input");
    $("#chapter-regex-input").val(settings.chapterRegex);
    $("#send-template-input").val(settings.sendTemplate);
    $("#send-delay-input").val(settings.sendDelay);
    $("#quality-check-switch").prop("checked", settings.enableQualityCheck);
    $("#write-word-count").val(settings.writeWordCount || 2000);
    $("#auto-parent-preset-switch").prop("checked", settings.enableAutoParentPreset);

    // 初始化图谱预览
    const mergedGraph = settings.mergedGraph || {};
    $("#merged-graph-preview").val(Object.keys(mergedGraph).length > 0 ? JSON.stringify(mergedGraph, null, 2) : "");
    $("#write-content-preview").val(settings.writeContentPreview || "");

    // 初始化显示状态
    if (settings.graphValidateResultShow) $("#graph-validate-result").show();
    if (settings.qualityResultShow) $("#quality-result-block").show();
    $("#precheck-status").text(settings.precheckStatus || "未执行").removeClass("status-default status-success status-danger").addClass(settings.precheckStatus === "通过" ? "status-success" : settings.precheckStatus === "不通过" ? "status-danger" : "status-default");
    $("#precheck-report").val(settings.precheckReportText || "");

    // 渲染所有列表
    renderChapterList(currentParsedChapters);
    renderChapterSelect(currentParsedChapters);
    renderContinueWriteChain(continueWriteChain);
    NovelReader.renderChapterList();
    restoreDrawerState();

    // 恢复选中的基准章节
    if (settings.selectedBaseChapterId) {
        $("#write-chapter-select").val(settings.selectedBaseChapterId).trigger("change");
    }

    isInitialized = true;
    await new Promise(resolve => setTimeout(resolve, 50));

    // 初始化核心模块
    FloatBall.init();
    NovelReader.init();
}
