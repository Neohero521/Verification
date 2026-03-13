// 严格遵循官方模板导入规范，路径完全对齐原版本
import { extension_settings, getContext, loadExtensionSettings } from "../../../extensions.js";
import { saveSettingsDebounced } from "../../../../script.js";
import { extensionName, extensionFolderPath, defaultSettings } from "./constants.js";
import { state } from "./state.js";
import { deepMerge, initDrawerToggle, initVisibilityListener, restoreDrawerState, copyToClipboard } from "./utils.js";
import { updatePresetNameDisplay, setupPresetEventListeners } from "./preset-manager.js";
import { FloatBall } from "./float-ball.js";
import { NovelReader } from "./novel-reader.js";
import { splitNovelIntoChapters, getSortedRegexList, renderChapterList, renderChapterSelect, sendChaptersBatch, getSelectedChapters, splitNovelByWordCount, renderContinueWriteChain } from "./chapter-manager.js";
import { validateChapterGraphStatus, generateChapterGraphBatch, mergeAllGraphs, validateGraphCompliance, exportChapterGraphs, importChapterGraphs, batchMergeGraphs, clearBatchMergedGraphs, updateModifiedChapterGraph } from "./graph-manager.js";
import { initContinueChainEvents, validateContinuePrecondition, generateNovelWrite } from "./continue-write.js";

// 加载扩展设置
async function loadSettings() {
    extension_settings[extensionName] = extension_settings[extensionName] || {};
    extension_settings[extensionName] = deepMerge(defaultSettings, extension_settings[extensionName]);
    
    // 兼容旧数据，补充缺失字段
    for (const key of Object.keys(defaultSettings)) {
        if (!Object.hasOwn(extension_settings[extensionName], key)) {
            extension_settings[extensionName][key] = structuredClone(defaultSettings[key]);
        }
    }

    // 初始化全局状态
    state.currentParsedChapters = extension_settings[extensionName].chapterList || [];
    state.continueWriteChain = extension_settings[extensionName].continueWriteChain || [];
    state.continueChapterIdCounter = extension_settings[extensionName].continueChapterIdCounter || 1;
    state.currentPrecheckResult = extension_settings[extensionName].precheckReport || null;
    state.batchMergedGraphs = extension_settings[extensionName].batchMergedGraphs || [];

    const settings = extension_settings[extensionName];

    // 初始化表单控件
    $("#example_setting").prop("checked", settings.example_setting).trigger("input");
    $("#chapter-regex-input").val(settings.chapterRegex);
    $("#send-template-input").val(settings.sendTemplate);
    $("#send-delay-input").val(settings.sendDelay);
    $("#quality-check-switch").prop("checked", settings.enableQualityCheck);
    $("#write-word-count").val(settings.writeWordCount || 2000);
    $("#auto-parent-preset-switch").prop("checked", settings.enableAutoParentPreset);

    // 初始化预览内容
    const mergedGraph = settings.mergedGraph || {};
    $("#merged-graph-preview").val(Object.keys(mergedGraph).length > 0 ? JSON.stringify(mergedGraph, null, 2) : "");
    $("#write-content-preview").val(settings.writeContentPreview || "");

    // 初始化UI显示
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

    // 还原选中的基准章节
    if (settings.selectedBaseChapterId) {
        $("#write-chapter-select").val(settings.selectedBaseChapterId).trigger("change");
    }

    state.isInitialized = true;

    // 等待ST上下文初始化完成
    await new Promise(resolve => setTimeout(resolve, 200));

    // 初始化预设相关
    updatePresetNameDisplay();
    setupPresetEventListeners();

    // 初始化核心模块
    FloatBall.init();
    NovelReader.init();
}

// 插件入口
jQuery(async () => {
    try {
        // 加载HTML模板
        const settingsHtml = await $.get(`${extensionFolderPath}/example.html`);
        $("body").append(settingsHtml);
        await new Promise(resolve => setTimeout(resolve, 100));
        console.log("[小说续写插件] HTML加载完成");
    } catch (error) {
        console.error('[小说续写插件] 扩展HTML加载失败:', error);
        toastr.error('小说续写插件加载失败：HTML文件加载异常，请检查文件路径', "插件错误");
        return;
    }

    // 初始化基础模块
    initDrawerToggle();
    initContinueChainEvents();
    initVisibilityListener();
    await loadSettings();

    // 基础设置事件
    $("#my_button").off("click").on("click", () => {
        toastr.info(`The checkbox is ${extension_settings[extensionName].example_setting ? "checked": "not checked"}`, "Extension Example");
    });
    $("#example_setting").off("input").on("input", (e) => {
        const value = Boolean($(e.target).prop("checked"));
        extension_settings[extensionName].example_setting = value;
        saveSettingsDebounced();
    });

    // 文件选择事件
    $("#select-file-btn").off("click").on("click", () => {
        $("#novel-file-upload").click();
    });
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
            // 重置所有相关状态
            extension_settings[extensionName].chapterList = state.currentParsedChapters;
            extension_settings[extensionName].chapterGraphMap = {};
            extension_settings[extensionName].mergedGraph = {};
            extension_settings[extensionName].continueWriteChain = [];
            extension_settings[extensionName].continueChapterIdCounter = 1;
            extension_settings[extensionName].selectedBaseChapterId = "";
            extension_settings[extensionName].writeContentPreview = "";
            extension_settings[extensionName].readerState = structuredClone(defaultSettings.readerState);
            extension_settings[extensionName].batchMergedGraphs = [];
            state.batchMergedGraphs = [];
            $('#merged-graph-preview').val('');
            $('#write-content-preview').val('');
            state.continueWriteChain = [];
            state.continueChapterIdCounter = 1;
            saveSettingsDebounced();
            // 刷新界面
            renderChapterList(state.currentParsedChapters);
            renderChapterSelect(state.currentParsedChapters);
            renderContinueWriteChain(state.continueWriteChain);
            NovelReader.renderChapterList();
        };
        reader.onerror = () => {
            toastr.error('文件读取失败，请检查文件编码（仅支持UTF-8）', "小说续写器");
        };
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
            // 重置所有相关状态
            extension_settings[extensionName].chapterList = state.currentParsedChapters;
            extension_settings[extensionName].chapterGraphMap = {};
            extension_settings[extensionName].mergedGraph = {};
            extension_settings[extensionName].continueWriteChain = [];
            extension_settings[extensionName].continueChapterIdCounter = 1;
            extension_settings[extensionName].selectedBaseChapterId = "";
            extension_settings[extensionName].writeContentPreview = "";
            extension_settings[extensionName].readerState = structuredClone(defaultSettings.readerState);
            extension_settings[extensionName].batchMergedGraphs = [];
            state.batchMergedGraphs = [];
            $('#merged-graph-preview').val('');
            $('#write-content-preview').val('');
            state.continueWriteChain = [];
            state.continueChapterIdCounter = 1;
            state.lastParsedText = "";
            state.currentRegexIndex = 0;
            $("#parse-chapter-btn").val("解析章节");
            saveSettingsDebounced();
            // 刷新界面
            renderChapterList(state.currentParsedChapters);
            renderChapterSelect(state.currentParsedChapters);
            renderContinueWriteChain(state.continueWriteChain);
            NovelReader.renderChapterList();
        };
        reader.onerror = () => {
            toastr.error('文件读取失败，请检查文件编码（仅支持UTF-8）', "小说续写器");
        };
        reader.readAsText(file, 'UTF-8');
    });

    // 父级预设开关事件
    $("#auto-parent-preset-switch").off("change").on("change", (e) => {
        const isChecked = Boolean($(e.target).prop("checked"));
        extension_settings[extensionName].enableAutoParentPreset = isChecked;
        saveSettingsDebounced();
        updatePresetNameDisplay();
    });

    // 章节全选/反选事件
    $("#select-all-btn").off("click").on("click", () => {
        $(".chapter-select").prop("checked", true);
    });
    $("#unselect-all-btn").off("click").on("click", () => {
        $(".chapter-select").prop("checked", false);
    });

    // 发送模板/延迟设置事件
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

    // 章节发送事件
    $("#import-selected-btn").off("click").on("click", () => {
        const selectedChapters = getSelectedChapters();
        sendChaptersBatch(selectedChapters);
    });
    $("#import-all-btn").off("click").on("click", () => {
        sendChaptersBatch(state.currentParsedChapters);
    });
    $("#stop-send-btn").off("click").on("click", () => {
        if (state.isSending) {
            state.stopSending = true;
            toastr.info('已停止发送', "小说续写器");
        }
    });

    // 单章节图谱导入导出事件
    $("#chapter-graph-export-btn").off("click").on("click", exportChapterGraphs);
    $("#chapter-graph-import-btn").off("click").on("click", () => {
        $("#chapter-graph-file-upload").click();
    });
    $("#chapter-graph-file-upload").off("change").on("change", (e) => {
        const file = e.target.files[0];
        if (file) importChapterGraphs(file);
    });

    // 图谱相关事件
    $("#validate-chapter-graph-btn").off("click").on("click", validateChapterGraphStatus);
    $("#graph-single-btn").off("click").on("click", () => {
        const selectedChapters = getSelectedChapters();
        generateChapterGraphBatch(selectedChapters);
    });
    $("#graph-batch-btn").off("click").on("click", () => {
        generateChapterGraphBatch(state.currentParsedChapters);
    });
    $("#graph-merge-btn").off("click").on("click", mergeAllGraphs);
    $("#graph-validate-btn").off("click").on("click", validateGraphCompliance);

    // 全量图谱导入导出事件
    $("#graph-import-btn").off("click").on("click", () => {
        $("#graph-file-upload").click();
    });
    $("#graph-file-upload").off("change").on("change", (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const graphData = JSON.parse(event.target.result.trim());
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

    // 分批合并事件
    $("#graph-batch-merge-btn").off("click").on("click", batchMergeGraphs);
    $("#graph-batch-clear-btn").off("click").on("click", clearBatchMergedGraphs);

    // 续写章节选择事件
    $("#write-chapter-select").off("change").on("change", function(e) {
        const selectedChapterId = $(e.target).val();
        state.currentPrecheckResult = null;
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
        const targetChapter = state.currentParsedChapters.find(item => item.id == selectedChapterId);
        if (targetChapter) {
            $('#write-chapter-content').val(targetChapter.content).prop('readonly', false);
        }
    });

    // 魔改章节图谱更新事件
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

    // 前置校验事件
    $("#precheck-run-btn").off("click").on("click", () => {
        const selectedChapterId = $('#write-chapter-select').val();
        const modifiedContent = $('#write-chapter-content').val().trim();
        if (!selectedChapterId) {
            toastr.error('请先选择基准章节', "小说续写器");
            return;
        }
        validateContinuePrecondition(selectedChapterId, modifiedContent);
    });

    // 质量校验开关事件
    $("#quality-check-switch").off("change").on("change", (e) => {
        const isChecked = Boolean($(e.target).prop("checked"));
        extension_settings[extensionName].enableQualityCheck = isChecked;
        saveSettingsDebounced();
    });

    // 续写生成事件
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

    // 续写内容操作事件
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

    // 续写链条清空事件
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
});
