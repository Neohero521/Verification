// 严格遵循ST官方扩展模板规范，主入口文件
import { extension_settings, loadExtensionSettings, getContext, extensionName, extensionFolderPath, state, defaultSettings } from './config.js';
import { saveSettingsDebounced } from './config.js';
import { deepMerge, copyToClipboard, renderCommandTemplate, setButtonDisabled } from './utils.js';
import { FloatBall } from './floatBall.js';
import { NovelReader } from './novelReader.js';
import {
    getSortedRegexList, splitNovelIntoChapters, splitNovelByWordCount,
    renderChapterList, renderChapterSelect, renderContinueWriteChain,
    getSelectedChapters, sendChaptersBatch, initDrawerToggle, restoreDrawerState,
    exportChapterGraphs, importChapterGraphs
} from './chapterManager.js';
import {
    generateChapterGraphBatch, mergeAllGraphs, validateGraphCompliance,
    validateChapterGraphStatus, updateModifiedChapterGraph
} from './knowledgeGraph.js';
import {
    validateContinuePrecondition, generateNovelWrite, initContinueChainEvents
} from './novelWrite.js';
// 示例配置事件
function onExampleInput(event) {
    const value = Boolean($(event.target).prop("checked"));
    extension_settings[extensionName].example_setting = value;
    saveSettingsDebounced();
}
function onButtonClick() {
    toastr.info(`The checkbox is ${extension_settings[extensionName].example_setting ? "checked": "not checked"}`, "Extension Example");
}
// 页面可见性监听
function initVisibilityListener() {
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && state.isInitialized) {
            // 重置异常状态
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
// 加载配置
async function loadSettings() {
    extension_settings[extensionName] = extension_settings[extensionName] || {};
    extension_settings[extensionName] = deepMerge(defaultSettings, extension_settings[extensionName]);
    // 补全缺失的默认配置
    for (const key of Object.keys(defaultSettings)) {
        if (!Object.hasOwn(extension_settings[extensionName], key)) {
            extension_settings[extensionName][key] = structuredClone(defaultSettings[key]);
        }
    }
    // 恢复全局状态
    state.currentParsedChapters = extension_settings[extensionName].chapterList || [];
    state.continueWriteChain = extension_settings[extensionName].continueWriteChain || [];
    state.continueChapterIdCounter = extension_settings[extensionName].continueChapterIdCounter || 1;
    state.currentPrecheckResult = extension_settings[extensionName].precheckReport || null;
    // 初始化UI
    const settings = extension_settings[extensionName];
    $("#example_setting").prop("checked", settings.example_setting).trigger("input");
    $("#chapter-regex-input").val(settings.chapterRegex);
    $("#send-template-input").val(settings.sendTemplate);
    $("#send-delay-input").val(settings.sendDelay);
    $("#quality-check-switch").prop("checked", settings.enableQualityCheck);
    $("#write-word-count").val(settings.writeWordCount || 2000);
    $("#auto-parent-preset-switch").prop("checked", settings.enableAutoParentPreset);
    $("#merged-graph-preview").val(Object.keys(settings.mergedGraph || {}).length > 0 ? JSON.stringify(settings.mergedGraph, null, 2) : "");
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
    // 恢复选中的基准章节
    if (settings.selectedBaseChapterId) {
        $("#write-chapter-select").val(settings.selectedBaseChapterId).trigger("change");
    }
    state.isInitialized = true;
    await new Promise(resolve => setTimeout(resolve, 100));
    // 初始化核心模块
    FloatBall.init();
    NovelReader.init();
}
// 插件初始化入口（ST规范必须导出init函数）
export async function init() {
    console.log(`[${extensionName}] 小说续写插件开始加载`);
    try {
        // 加载HTML模板，增加错误捕获
        const settingsHtml = await $.get(`${extensionFolderPath}/example.html`);
        $("body").append(settingsHtml);
        await new Promise(resolve => setTimeout(resolve, 100));
        console.log(`[${extensionName}] HTML模板加载完成`);
    } catch (error) {
        console.error(`[${extensionName}] HTML模板加载失败:`, error);
        toastr.error('小说续写插件加载失败：HTML文件加载异常，请检查文件路径与完整性', "插件错误");
        return;
    }
    // 初始化基础模块
    initDrawerToggle();
    initContinueChainEvents();
    initVisibilityListener();
    await loadExtensionSettings(extensionName);
    await loadSettings();
    // ==============================================
    // 事件绑定（所有UI事件统一在此绑定）
    // ==============================================
    // 示例配置
    $("#my_button").off("click").on("click", onButtonClick);
    $("#example_setting").off("input").on("input", onExampleInput);
    // 文件选择
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
    // 章节解析
    $("#parse-chapter-btn").off("click").on("click", () => {
        const file = $("#novel-file-upload")[0].files[0];
        const customRegex = $("#chapter-regex-input").val().trim();
        if (!file) {
            toastr.warning('请先选择小说TXT文件', "小说续写器");
            return;
        }
        // 保存自定义正则
        if (customRegex) {
            extension_settings[extensionName].chapterRegex = customRegex;
            saveSettingsDebounced();
        }
        const reader = new FileReader();
        reader.onload = (e) => {
            const novelText = e.target.result;
            let useRegex = "";
            let regexName = "";
            // 自定义正则优先
            if (customRegex) {
                useRegex = customRegex;
                regexName = "自定义正则";
            } else {
                // 自动匹配最优正则
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
            // 执行拆分
            state.currentParsedChapters = splitNovelIntoChapters(novelText, useRegex);
            // 重置状态
            extension_settings[extensionName].chapterList = state.currentParsedChapters;
            extension_settings[extensionName].chapterGraphMap = {};
            extension_settings[extensionName].mergedGraph = {};
            extension_settings[extensionName].continueWriteChain = [];
            extension_settings[extensionName].continueChapterIdCounter = 1;
            extension_settings[extensionName].selectedBaseChapterId = "";
            extension_settings[extensionName].writeContentPreview = "";
            extension_settings[extensionName].readerState = structuredClone(defaultSettings.readerState);
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
    // 按字数拆分
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
            extension_settings[extensionName].chapterList = state.currentParsedChapters;
            extension_settings[extensionName].chapterGraphMap = {};
            extension_settings[extensionName].mergedGraph = {};
            extension_settings[extensionName].continueWriteChain = [];
            extension_settings[extensionName].continueChapterIdCounter = 1;
            extension_settings[extensionName].selectedBaseChapterId = "";
            extension_settings[extensionName].writeContentPreview = "";
            extension_settings[extensionName].readerState = structuredClone(defaultSettings.readerState);
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
    // 章节全选/取消全选
    $("#select-all-btn").off("click").on("click", () => $(".chapter-select").prop("checked", true));
    $("#unselect-all-btn").off("click").on("click", () => $(".chapter-select").prop("checked", false));
    // 配置保存
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
    $("#auto-parent-preset-switch").off("change").on("change", (e) => {
        extension_settings[extensionName].enableAutoParentPreset = Boolean($(e.target).prop("checked"));
        saveSettingsDebounced();
    });
    $("#quality-check-switch").off("change").on("change", (e) => {
        extension_settings[extensionName].enableQualityCheck = Boolean($(e.target).prop("checked"));
        saveSettingsDebounced();
    });
    // 章节导入
    $("#import-selected-btn").off("click").on("click", () => {
        const selectedChapters = getSelectedChapters();
        sendChaptersBatch(selectedChapters);
    });
    $("#import-all-btn").off("click").on("click", () => sendChaptersBatch(state.currentParsedChapters));
    $("#stop-send-btn").off("click").on("click", () => {
        if (state.isSending) {
            state.stopSending = true;
            toastr.info('已停止发送', "小说续写器");
        }
    });
    // 章节图谱导入导出
    $("#chapter-graph-export-btn").off("click").on("click", exportChapterGraphs);
    $("#chapter-graph-import-btn").off("click").on("click", () => $("#chapter-graph-file-upload").click());
    $("#chapter-graph-file-upload").off("change").on("change", (e) => {
        const file = e.target.files[0];
        if (file) importChapterGraphs(file);
    });
    // 图谱相关
    $("#validate-chapter-graph-btn").off("click").on("click", validateChapterGraphStatus);
    $("#graph-single-btn").off("click").on("click", () => {
        const selectedChapters = getSelectedChapters();
        generateChapterGraphBatch(selectedChapters);
    });
    $("#graph-batch-btn").off("click").on("click", () => generateChapterGraphBatch(state.currentParsedChapters));
    $("#graph-merge-btn").off("click").on("click", mergeAllGraphs);
    $("#graph-validate-btn").off("click").on("click", validateGraphCompliance);
    $("#graph-stop-btn").off("click").on("click", () => {
        if (state.isGeneratingGraph) {
            state.stopGenerateFlag = true;
            toastr.info('已停止生成图谱', "小说续写器");
        }
    });
    // 图谱导入导出
    $("#graph-import-btn").off("click").on("click", () => $("#graph-file-upload").click());
    $("#graph-file-upload").off("change").on("change", (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const graphData = JSON.parse(event.target.result.trim());
                extension_settings[extensionName].mergedGraph = graphData;
                saveSettingsDebounced();
                $('#merged-graph-preview').val(JSON.stringify(graphData, null, 2));
                toastr.success('知识图谱导入完成！', "小说续写器");
            } catch (error) {
                toastr.error(`导入失败：${error.message}`, "小说续写器");
            } finally {
                $("#graph-file-upload").val('');
            }
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
        extension_settings[extensionName].mergedGraph = {};
        extension_settings[extensionName].graphValidateResultShow = false;
        $('#merged-graph-preview').val('');
        $('#graph-validate-result').hide();
        saveSettingsDebounced();
        toastr.success('已清空合并图谱', "小说续写器");
    });
    // 续写相关
    $("#write-chapter-select").off("change").on("change", function(e) {
        const selectedId = $(e.target).val();
        state.currentPrecheckResult = null;
        $("#precheck-status").text("未执行").removeClass("status-success status-danger").addClass("status-default");
        $("#precheck-report").val("");
        $("#write-content-preview").val("");
        $("#write-status").text("");
        $("#quality-result-block").hide();
        extension_settings[extensionName].selectedBaseChapterId = selectedId;
        extension_settings[extensionName].precheckStatus = "未执行";
        extension_settings[extensionName].precheckReportText = "";
        extension_settings[extensionName].writeContentPreview = "";
        extension_settings[extensionName].qualityResultShow = false;
        saveSettingsDebounced();
        if (!selectedId) {
            $('#write-chapter-content').val('').prop('readonly', true);
            return;
        }
        const targetChapter = state.currentParsedChapters.find(item => item.id == selectedId);
        if (targetChapter) {
            $('#write-chapter-content').val(targetChapter.content).prop('readonly', false);
        }
    });
    $("#graph-update-modified-btn").off("click").on("click", () => {
        const selectedId = $("#write-chapter-select").val();
        const modifiedContent = $("#write-chapter-content").val().trim();
        updateModifiedChapterGraph(selectedId, modifiedContent);
    });
    $("#precheck-run-btn").off("click").on("click", () => {
        const selectedId = $("#write-chapter-select").val();
        const modifiedContent = $("#write-chapter-content").val().trim();
        if (!selectedId) {
            toastr.error('请先选择基准章节', "小说续写器");
            return;
        }
        validateContinuePrecondition(selectedId, modifiedContent);
    });
    $("#write-generate-btn").off("click").on("click", generateNovelWrite);
    $("#write-stop-btn").off("click").on("click", () => {
        if (state.isGeneratingWrite) {
            state.stopGenerateFlag = true;
            state.isGeneratingWrite = false;
            $('#write-status').text('已停止生成');
            setButtonDisabled('#write-generate-btn, #write-stop-btn, .continue-write-btn', false);
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
        state.continueWriteChain = [];
        state.continueChapterIdCounter = 1;
        extension_settings[extensionName].continueWriteChain = state.continueWriteChain;
        extension_settings[extensionName].continueChapterIdCounter = state.continueChapterIdCounter;
        saveSettingsDebounced();
        renderContinueWriteChain(state.continueWriteChain);
        NovelReader.renderChapterList();
        toastr.success('已清空所有续写章节', "小说续写器");
    });
    console.log(`[${extensionName}] 小说续写插件加载完成`);
    toastr.success('小说续写插件加载完成', "插件提示");
}
// jQuery初始化（兼容ST旧版本）
jQuery(async () => {
    await init();
});
