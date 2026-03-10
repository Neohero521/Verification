// 【Verification主业务逻辑】基于SillyTavern官方规范优化
import { extensionSettings, loadExtensionSettings, getContext, extensionName, state, defaultSettings } from './config.js';
import { saveSettingsDebounced } from './config.js';
import { deepMerge, copyToClipboard, renderCommandTemplate, setButtonDisabled } from './utils.js';

// 页面可见性监听
function initVisibilityListener() {
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && state.isInitialized) {
            // 重置异常状态
            if (state.isGeneratingWrite) {
                $('#write-status').text('生成状态异常，请重新点击生成');
                state.isGeneratingWrite = false;
                state.stopGenerateFlag = false;
                setButtonDisabled('#write-generate-btn, #write-stop-btn', false);
            }
            if (state.isGeneratingGraph) {
                $('#graph-generate-status').text('图谱生成状态异常，请重新点击生成');
                state.isGeneratingGraph = false;
                state.stopGenerateFlag = false;
                setButtonDisabled('#graph-single-btn, #graph-batch-btn', false);
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

// 加载配置
async function loadSettings() {
    console.log('[Verification Main] 开始加载配置');
    extensionSettings[extensionName] = extensionSettings[extensionName] || {};
    extensionSettings[extensionName] = deepMerge(defaultSettings, extensionSettings[extensionName]);

    // 补全缺失配置
    for (const key of Object.keys(defaultSettings)) {
        if (!Object.hasOwn(extensionSettings[extensionName], key)) {
            extensionSettings[extensionName][key] = structuredClone(defaultSettings[key]);
        }
    }

    // 恢复全局状态
    state.currentParsedChapters = extensionSettings[extensionName].chapterList || [];
    state.continueWriteChain = extensionSettings[extensionName].continueWriteChain || [];
    state.continueChapterIdCounter = extensionSettings[extensionName].continueChapterIdCounter || 1;

    // 初始化UI
    const settings = extensionSettings[extensionName];
    $("#example_setting").prop("checked", settings.example_setting).trigger("input");
    $("#chapter-regex-input").val(settings.chapterRegex);
    $("#send-template-input").val(settings.sendTemplate);
    $("#send-delay-input").val(settings.sendDelay);
    $("#merged-graph-preview").val(Object.keys(settings.mergedGraph || {}).length > 0 ? JSON.stringify(settings.mergedGraph, null, 2) : "");
    $("#write-content-preview").val(settings.writeContentPreview || "");

    state.isInitialized = true;
    console.log('[Verification Main] 配置加载完成');
}

// 绑定基础事件（仅绑定已存在的元素，不依赖缺失模块）
function bindBaseEvents() {
    console.log('[Verification Main] 开始绑定基础事件');
    // 示例配置事件
    $("#example_setting").off("input").on("input", (e) => {
        const value = Boolean($(e.target).prop("checked"));
        extensionSettings[extensionName].example_setting = value;
        saveSettingsDebounced();
    });
    $("#my_button").off("click").on("click", () => {
        toastr.info(`复选框状态：${extensionSettings[extensionName].example_setting ? "已勾选" : "未勾选"}`, "Verification插件");
    });

    // 文件选择事件
    $("#select-file-btn").off("click").on("click", () => $("#novel-file-upload").click());
    $("#novel-file-upload").off("change").on("change", (e) => {
        const file = e.target.files[0];
        if (file) {
            $("#file-name-text").text(file.name);
            toastr.success(`已选择文件：${file.name}`, "Verification插件");
        }
    });

    // 配置保存事件
    $("#chapter-regex-input").off("change").on("change", (e) => {
        extensionSettings[extensionName].chapterRegex = $(e.target).val().trim();
        saveSettingsDebounced();
    });
    $("#send-template-input").off("change").on("change", (e) => {
        extensionSettings[extensionName].sendTemplate = $(e.target).val().trim();
        saveSettingsDebounced();
    });
    $("#send-delay-input").off("change").on("change", (e) => {
        extensionSettings[extensionName].sendDelay = parseInt($(e.target).val()) || 100;
        saveSettingsDebounced();
    });

    // 复制按钮事件
    $("#graph-copy-btn").off("click").on("click", async () => {
        const text = $('#merged-graph-preview').val();
        if (!text) return toastr.warning('没有可复制的内容', "Verification插件");
        const success = await copyToClipboard(text);
        success ? toastr.success('已复制到剪贴板', "Verification插件") : toastr.error('复制失败', "Verification插件");
    });
    $("#write-copy-btn").off("click").on("click", async () => {
        const text = $('#write-content-preview').val();
        if (!text) return toastr.warning('没有可复制的内容', "Verification插件");
        const success = await copyToClipboard(text);
        success ? toastr.success('已复制到剪贴板', "Verification插件") : toastr.error('复制失败', "Verification插件");
    });

    console.log('[Verification Main] 基础事件绑定完成');
}

// 主初始化函数，全量try-catch，避免报错
export async function mainInit() {
    try {
        console.log('[Verification Main] 开始初始化主业务模块');
        initVisibilityListener();
        await loadExtensionSettings(extensionName);
        await loadSettings();
        bindBaseEvents();
        console.log('[Verification Main] 主业务模块初始化完成！');
        toastr.success('功能模块加载完成', 'Verification插件');
    } catch (error) {
        console.error('[Verification Main] 主业务模块初始化失败', error);
        toastr.warning('功能模块基础功能可用，高级功能加载异常', 'Verification插件');
        // 不抛出错误，避免影响悬浮球
    }
}
