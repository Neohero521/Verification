import { extensionName, extensionFolderPath, defaultSettings } from "./constants.js";
import { state } from "./state.js";
import { deepMerge, onExampleInput, onButtonClick, copyToClipboard, setButtonDisabled } from "./utils.js";
import { getActivePresetParams, loadPresetFile, refreshPresetPreview } from "./preset.js";
import { splitNovelIntoChapters, getSortedRegexList, splitNovelByWordCount, renderChapterList, renderChapterSelect, getSelectedChapters, sendChaptersBatch } from "./chapter.js";
import { generateChapterGraphBatch, mergeAllGraphs, validateGraphCompliance, validateChapterGraphStatus, exportChapterGraphs, importChapterGraphs, updateModifiedChapterGraph } from "./graph.js";
import { validateContinuePrecondition, generateNovelWrite, renderContinueWriteChain, initContinueChainEvents } from "./write.js";
import { FloatBall } from "./float-ball.js";
import { NovelReader } from "./reader.js";

// 保存抽屉状态
export function saveDrawerState() {
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

// 恢复抽屉状态
export function restoreDrawerState() {
    const savedState = extension_settings[extensionName].drawerState || defaultSettings.drawerState;
    $('.novel-writer-extension .inline-drawer').each(function() {
        const drawerId = $(this).attr('id');
        if (drawerId && savedState[drawerId] !== undefined) {
            $(this).toggleClass('open', savedState[drawerId]);
        }
    });
}

// 初始化抽屉切换
export function initDrawerToggle() {
    $('#novel-writer-panel').off('click', '.inline-drawer-header').on('click', '.inline-drawer-header', function(e) {
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
            refreshPresetPreview();
        }
    });
}

// 加载设置并初始化UI
export async function loadSettings() {
    extension_settings[extensionName] = extension_settings[extensionName] || {};
    extension_settings[extensionName] = deepMerge(defaultSettings, extension_settings[extensionName]);
    for (const key of Object.keys(defaultSettings)) {
        if (!Object.hasOwn(extension_settings[extensionName], key)) {
            extension_settings[extensionName][key] = structuredClone(defaultSettings[key]);
        }
    }
    state.currentParsedChapters = extension_settings[extensionName].chapterList || [];
    state.continueWriteChain = extension_settings[extensionName].continueWriteChain || [];
    state.continueChapterIdCounter = extension_settings[extensionName].continueChapterIdCounter || 1;
    state.currentPrecheckResult = extension_settings[extensionName].precheckReport || null;
    const settings = extension_settings[extensionName];

    $("#example_setting").prop("checked", settings.example_setting).trigger("input");
    $("#chapter-regex-input").val(settings.chapterRegex);
    $("#send-template-input").val(settings.sendTemplate);
    $("#send-delay-input").val(settings.sendDelay);
    $("#quality-check-switch").prop("checked", settings.enableQualityCheck);
    $("#write-word-count").val(settings.writeWordCount || 2000);
    $("#auto-parent-preset-switch").prop("checked", settings.enableAutoParentPreset);
    $("#preset-name-text").text(settings.presetName || "自动使用父级预设");
    $("#preset-preview").val(JSON.stringify(getActivePresetParams(), null, 2));

    const mergedGraph = settings.mergedGraph || {};
    $("#merged-graph-preview").val(Object.keys(mergedGraph).length > 0 ? JSON.stringify(mergedGraph, null, 2) : "");
    $("#write-content-preview").val(settings.writeContentPreview || "");
    if (settings.graphValidateResultShow) $("#graph-validate-result").show();
    if (settings.qualityResultShow) $("#quality-result-block").show();
    $("#precheck-status").text(settings.precheckStatus || "未执行").removeClass("status-default status-success status-danger").addClass(settings.precheckStatus === "通过"?"status-success": settings.precheckStatus === "不通过"? "status-danger": "status-default");
    $("#precheck-report").val(settings.precheckReportText || "");

    renderChapterList(state.currentParsedChapters);
    renderChapterSelect(state.currentParsedChapters);
    renderContinueWriteChain(state.continueWriteChain);
    NovelReader.renderChapterList();
    restoreDrawerState();
    if (settings.selectedBaseChapterId) {
        $("#write-chapter-select").val(settings.selectedBaseChapterId).trigger("change");
    }
    state.isInitialized = true;
    await new Promise(resolve => setTimeout(resolve, 50));
    FloatBall.init();
    NovelReader.init();
}

// 初始化所有事件绑定
export function initEvents() {
    // 基础配置事件
    $("#my_button").off("click").on("click", onButtonClick);
    $("#example_setting").off("input").on("input", onExampleInput);

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

    // 解析章节按钮
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

    // 按字数拆分按钮
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

    // 预设相关事件
    $("#auto-parent-preset-switch").off("change").on("change", (e) => {
        const isChecked = Boolean($(e.target).prop("checked"));
        extension_settings[extensionName].enableAutoParentPreset = isChecked;
        if (isChecked) {
            extension_settings[extensionName].presetName = "自动使用父级预设";
            $("#preset-name-text").text("自动使用父级预设");
        }
        saveSettingsDebounced();
        refreshPresetPreview();
    });
    $("#select-preset-btn").off("click").on("click", () => {
        $("#preset-file-upload").click();
    });
    $("#preset-file-upload").off("change").on("change", (e) => {
        const file = e.target.files[0];
        if (file) loadPresetFile(file);
    });

    // 章节全选/反选
    $("#select-all-btn").off("click").on("click", () => {
        $(".chapter-select").prop("checked", true);
    });
    $("#unselect-all-btn").off("click").on("click", () => {
        $(".chapter-select").prop("checked", false);
    });

    // 发送配置变更
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

    // 单章节图谱导入导出
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
    $("#graph-import-btn").off("click").on("click", () => {
        $("#graph-file-upload").click();
    });
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
        state.continueWriteChain = [];
        state.continueChapterIdCounter = 1;
        extension_settings[extensionName].continueWriteChain = state.continueWriteChain;
        extension_settings[extensionName].continueChapterIdCounter = state.continueChapterIdCounter;
        saveSettingsDebounced();
        renderContinueWriteChain(state.continueWriteChain);
        NovelReader.renderChapterList();
        toastr.success('已清空所有续写章节', "小说续写器");
    });
}
