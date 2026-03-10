import {
  extensionName, extensionFolderPath,
  presetChapterRegexList, currentRegexIndex, sortedRegexList, lastParsedText,
  currentParsedChapters, continueWriteChain, continueChapterIdCounter,
  extension_settings, saveSettingsDebounced, defaultSettings,
  graphJsonSchema, mergeGraphJsonSchema,
  isGeneratingWrite, isGeneratingGraph, isSending, stopGenerateFlag, stopSending
} from "./constants.js";
import {
  removeBOM, copyToClipboard, renderCommandTemplate, setButtonDisabled
} from "./utils.js";
import {
  splitNovelByWordCount, splitNovelIntoChapters, getSortedRegexList,
  renderChapterList, renderChapterSelect, renderContinueWriteChain,
  sendChaptersBatch, getSelectedChapters
} from "./chapterManager.js";
import {
  generateChapterGraphBatch, mergeAllGraphs, validateGraphCompliance,
  validateChapterGraphStatus, exportChapterGraphs, importChapterGraphs,
  updateModifiedChapterGraph
} from "./knowledgeGraph.js";
import {
  validateContinuePrecondition, generateNovelWrite, generateContinueWrite,
  initContinueChainEvents
} from "./novelWrite.js";
import { NovelReader } from "./novelReader.js";
import {
  loadSettings, initDrawerToggle, initVisibilityListener,
  onExampleInput, onButtonClick
} from "./settings.js";

// 插件主入口，完全对齐原代码初始化与事件绑定逻辑
jQuery(async () => {
  // 加载HTML模板
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

  // 初始化核心模块
  initDrawerToggle();
  initContinueChainEvents();
  initVisibilityListener();
  await loadSettings();

  // 基础配置事件绑定
  $("#my_button").off("click").on("click", onButtonClick);
  $("#example_setting").off("input").on("input", onExampleInput);

  // 小说文件选择事件
  $("#select-file-btn").off("click").on("click", () => {
    $("#novel-file-upload").click();
  });
  $("#novel-file-upload").off("change").on("change", (e) => {
    const file = e.target.files[0];
    if (file) {
      $("#file-name-text").text(file.name);
      // 重置解析状态
      lastParsedText = "";
      currentRegexIndex = 0;
      $("#parse-chapter-btn").val("解析章节");
    }
  });

  // 正则解析章节按钮事件
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
        // 首次解析：自动匹配最优正则
        if (lastParsedText !== novelText) {
          lastParsedText = novelText;
          sortedRegexList.length = 0;
          sortedRegexList.push(...getSortedRegexList(novelText));
          currentRegexIndex = 0;
          $("#parse-chapter-btn").val("再次解析");
        } else {
          // 再次解析：切换下一个正则
          currentRegexIndex = (currentRegexIndex + 1) % sortedRegexList.length;
        }
        // 循环切换正则
        const currentRegexItem = sortedRegexList[currentRegexIndex];
        useRegex = currentRegexItem.regex;
        regexName = currentRegexItem.name;
        toastr.info(`正在使用【${regexName}】解析，匹配到${currentRegexItem.count}个章节`, "小说续写器");
      }
      // 执行章节拆分
      currentParsedChapters.length = 0;
      currentParsedChapters.push(...splitNovelIntoChapters(novelText, useRegex));
      // 重置所有相关状态
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
      continueWriteChain.length = 0;
      continueChapterIdCounter = 1;
      saveSettingsDebounced();
      // 刷新界面
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

  // 按字数拆分按钮事件
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
      currentParsedChapters.length = 0;
      currentParsedChapters.push(...splitNovelByWordCount(novelText, wordCount));
      // 重置所有相关状态
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
      continueWriteChain.length = 0;
      continueChapterIdCounter = 1;
      // 重置解析按钮状态
      lastParsedText = "";
      currentRegexIndex = 0;
      $("#parse-chapter-btn").val("解析章节");
      saveSettingsDebounced();
      // 刷新界面
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

  // 父级对话预设开关事件
  $("#auto-parent-preset-switch").off("change").on("change", (e) => {
    const isChecked = Boolean($(e.target).prop("checked"));
    extension_settings[extensionName].enableAutoParentPreset = isChecked;
    saveSettingsDebounced();
  });

  // 章节全选/取消全选
  $("#select-all-btn").off("click").on("click", () => {
    $(".chapter-select").prop("checked", true);
  });
  $("#unselect-all-btn").off("click").on("click", () => {
    $(".chapter-select").prop("checked", false);
  });

  // 发送配置输入事件
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

  // 单章节图谱导入导出事件
  $("#chapter-graph-export-btn").off("click").on("click", exportChapterGraphs);
  $("#chapter-graph-import-btn").off("click").on("click", () => {
    $("#chapter-graph-file-upload").click();
  });
  $("#chapter-graph-file-upload").off("change").on("change", (e) => {
    const file = e.target.files[0];
    if (file) importChapterGraphs(file);
  });

  // 知识图谱核心事件
  $("#validate-chapter-graph-btn").off("click").on("click", validateChapterGraphStatus);
  $("#graph-single-btn").off("click").on("click", () => {
    const selectedChapters = getSelectedChapters();
    generateChapterGraphBatch(selectedChapters);
  });
  $("#graph-batch-btn").off("click").on("click", () => {
    generateChapterGraphBatch(currentParsedChapters);
  });
  $("#graph-merge-btn").off("click").on("click", mergeAllGraphs);
  $("#graph-validate-btn").off("click").on("click", validateGraphCompliance);

  // 全量图谱导入事件
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

  // 图谱复制、导出、清空事件
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

  // 续写基准章节选择事件
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

  // 前置校验执行事件
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

  // 续写生成与停止事件
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

  // 续写内容复制、发送、清空事件
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

  // 清空续写链条事件
  $("#clear-chain-btn").off("click").on("click", () => {
    continueWriteChain.length = 0;
    continueChapterIdCounter = 1;
    extension_settings[extensionName].continueWriteChain = continueWriteChain;
    extension_settings[extensionName].continueChapterIdCounter = continueChapterIdCounter;
    saveSettingsDebounced();
    renderContinueWriteChain(continueWriteChain);
    NovelReader.renderChapterList();
    toastr.success('已清空所有续写章节', "小说续写器");
  });
});
