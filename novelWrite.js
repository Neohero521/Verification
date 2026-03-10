import {
  extension_settings, extensionName, saveSettingsDebounced, qualityEvaluateSchema,
  currentParsedChapters, continueWriteChain, continueChapterIdCounter,
  isGeneratingWrite, stopGenerateFlag, currentPrecheckResult
} from "./constants.js";
import { getActivePresetParams, setButtonDisabled, renderCommandTemplate, copyToClipboard } from "./utils.js";
import { updateGraphWithContinueContent, generateSingleChapterGraph } from "./knowledgeGraph.js";
import { renderContinueWriteChain } from "./chapterManager.js";

// 续写前置合规性校验
export async function validateContinuePrecondition(baseChapterId, modifiedChapterContent = null) {
  const context = getContext();
  const { generateRaw } = context;
  const graphMap = extension_settings[extensionName].chapterGraphMap || {};
  const baseId = parseInt(baseChapterId);
  const preChapters = currentParsedChapters.filter(chapter => chapter.id <= baseId);
  const preGraphList = preChapters.map(chapter => graphMap[chapter.id]).filter(Boolean);

  // 无前置图谱时生成临时图谱
  if (preGraphList.length === 0 && modifiedChapterContent) {
    toastr.info('基准章节无可用图谱，正在生成临时图谱用于前置校验...', "小说续写器");
    const tempChapter = { id: baseId, title: `临时基准章节${baseId}`, content: modifiedChapterContent };
    const tempGraph = await generateSingleChapterGraph(tempChapter);
    if (tempGraph) preGraphList.push(tempGraph);
  }

  // 无图谱时返回默认结果
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

  // 校验Prompt
  const systemPrompt = `触发词：续写节点逆向分析、前置合规性校验
强制约束（100%遵守）：
所有分析只能基于续写节点（章节号${baseId}）及之前的小说内容，绝对不能引入该节点之后的任何剧情、设定、人物变化，禁止剧透
若前文有设定冲突，以续写节点前最后一次出现的内容为准，同时标注冲突预警
优先以用户提供的魔改后基准章节内容为准，更新对应人设、设定、剧情状态
只能基于提供的章节知识图谱分析，绝对不能引入外部信息、主观新增设定
输出必须为纯JSON格式，无任何前置/后置内容、注释、markdown，必须以{开头、以}结尾
必填字段：isPass、preMergedGraph、人设红线清单、设定禁区清单、可呼应伏笔清单、潜在矛盾预警、可推进剧情方向、合规性报告`;
  const userPrompt = `续写基准章节ID：${baseId}
基准章节及前置章节的知识图谱列表：${JSON.stringify(preGraphList, null, 2)}
用户魔改后的基准章节内容：${modifiedChapterContent || "无魔改，沿用原章节内容"}
请执行续写节点逆向分析与前置合规性校验，输出符合要求的JSON内容。`;

  try {
    const result = await generateRaw({
      systemPrompt,
      prompt: userPrompt,
      jsonSchema: { name: 'ContinuePrecheck', strict: true, value: { 
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
      } },
      ...getActivePresetParams()
    });
    const precheckResult = JSON.parse(result.trim());
    currentPrecheckResult = precheckResult;

    // 渲染校验结果
    const reportText = `合规性校验结果：${precheckResult.isPass ? "通过" : "不通过"}
人设红线清单：${precheckResult["人设红线清单"]}
设定禁区清单：${precheckResult["设定禁区清单"]}
可呼应伏笔清单：${precheckResult["可呼应伏笔清单"]}
潜在矛盾预警：${precheckResult["潜在矛盾预警"]}
可推进剧情方向：${precheckResult["可推进剧情方向"]}
详细报告：${precheckResult["合规性报告"]}`.trim();
    const statusText = precheckResult.isPass ? "通过" : "不通过";

    $("#precheck-status").text(statusText).removeClass("status-default status-success status-danger").addClass(precheckResult.isPass ? "status-success" : "status-danger");
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

// 续写内容质量评估
export async function evaluateContinueQuality(continueContent, precheckResult, baseGraph, baseChapterContent, targetWordCount) {
  const context = getContext();
  const { generateRaw } = context;
  const actualWordCount = continueContent.length;
  const wordErrorRate = Math.abs(actualWordCount - targetWordCount) / targetWordCount;

  const systemPrompt = `触发词：小说续写质量评估、多维度合规性校验
强制约束（100%遵守）：
严格按照5个维度执行评估，单项得分0-100分，总分=5个维度得分的平均值，精确到整数
合格标准：单项得分不得低于80分，总分不得低于85分，不符合即为不合格
所有评估只能基于提供的前置校验结果、知识图谱、基准章节内容，不能引入外部主观标准
必须校验字数合规性：目标字数${targetWordCount}字，实际字数${actualWordCount}字，误差超过10%（当前误差率${(wordErrorRate*100).toFixed(2)}%），内容质量得分必须对应扣分
输出必须为纯JSON格式，无任何前置/后置内容、注释、markdown，必须以{开头、以}结尾
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
    const result = await generateRaw({
      systemPrompt,
      prompt: userPrompt,
      jsonSchema: qualityEvaluateSchema,
      ...getActivePresetParams()
    });
    return JSON.parse(result.trim());
  } catch (error) {
    console.error('质量评估失败:', error);
    toastr.error(`质量评估失败: ${error.message}`, "小说续写器");
    return { 总分: 90, 人设一致性得分: 90, 设定合规性得分: 90, 剧情衔接度得分: 90, 文风匹配度得分: 90, 内容质量得分: 90, 评估报告: "质量评估执行失败，默认通过", 是否合格: true };
  }
}

// 初始化续写链条事件
export function initContinueChainEvents() {
  const $root = $('#novel-writer-panel');
  // 续写内容编辑事件
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
  // 基于续写章节继续续写
  $root.off('click', '.continue-write-btn').on('click', '.continue-write-btn', function(e) {
    e.stopPropagation();
    const chainId = parseInt($(e.target).data('chain-id'));
    generateContinueWrite(chainId);
  });
  // 复制续写内容
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
  // 发送续写内容到对话框
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
  // 删除续写章节
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
    toastr.success('已删除该续写章节', "小说续写器");
  });
}

// 基础续写生成
export async function generateNovelWrite() {
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

  // 提取基准章节最后一段
  const baseParagraphs = editedChapterContent.split('\n').filter(p => p.trim() !== '');
  const baseLastParagraph = baseParagraphs.length > 0 ? baseParagraphs[baseParagraphs.length - 1].trim() : '';

  // 初始化生成状态
  isGeneratingWrite = true;
  stopGenerateFlag = false;
  setButtonDisabled('#write-generate-btn', true);
  setButtonDisabled('#write-stop-btn', false);
  $('#write-status').text('正在执行续写前置校验...');

  try {
    // 前置校验
    const precheckResult = await validateContinuePrecondition(selectedChapterId, editedChapterContent);
    const useGraph = Object.keys(precheckResult.preGraph).length > 0 ? precheckResult.preGraph : mergedGraph;

    if (stopGenerateFlag) {
      $('#write-status').text('已停止生成');
      toastr.info('已停止生成，丢弃本次生成结果', "小说续写器");
      return;
    }

    // 续写Prompt
    const systemPrompt = `小说续写规则（100%遵守）：
人设锁定：续写内容必须完全贴合小说的核心人物设定，绝对不能出现人设崩塌（OOC），严格遵守以下人设红线：${precheckResult.redLines}
设定合规：续写内容必须完全符合小说的世界观设定，绝对不能出现吃书、新增违规设定、违反原有规则的问题，严格遵守以下设定禁区：${precheckResult.forbiddenRules}
文本衔接：续写内容必须紧接在基准章节的最后一段之后开始，从那个地方继续写下去，确保文本连续，逻辑自洽。基准章节的最后一段内容是："${baseLastParagraph}"
续写必须从这段文字之后直接开始，不能重复这段内容。
剧情承接：续写内容必须承接前文剧情，合理呼应以下伏笔：${precheckResult.foreshadowList}，开启新的章节内容，且与上述文本衔接要求一致。
文风统一：续写内容必须完全贴合原小说的叙事风格、语言习惯、对话方式、节奏特点，和原文无缝衔接，无风格割裂
剧情合理：续写内容要符合原小说的世界观设定，推动主线剧情发展，有完整的情节起伏、生动的细节、符合人设的对话
输出要求：只输出续写的正文内容，不要任何标题、章节名、解释、备注、说明、分割线
字数要求：续写约${wordCount}字，误差不超过10%
矛盾规避：必须规避以下潜在剧情矛盾：${precheckResult.conflictWarning}
小数据适配：若前文内容较少，严格遵循现有文本的叙事范式、对话模式、剧情节奏，不做风格跳脱的续写，不无限新增设定与人物`;
    const userPrompt = `小说核心设定知识图谱：${JSON.stringify(useGraph)}
基准章节内容：${editedChapterContent}
请基于以上内容，按照规则续写后续的章节正文。`;

    // 生成续写内容
    $('#write-status').text('正在生成续写章节，请稍候...');
    let continueContent = await generateRaw({ systemPrompt, prompt: userPrompt, ...getActivePresetParams()});

    if (stopGenerateFlag) {
      $('#write-status').text('已停止生成');
      toastr.info('已停止生成，丢弃本次生成结果', "小说续写器");
      return;
    }
    if (!continueContent.trim()) {
      throw new Error('生成内容为空');
    }
    continueContent = continueContent.trim();

    // 质量校验
    let qualityResult = null;
    if (enableQualityCheck && !stopGenerateFlag) {
      $('#write-status').text('正在执行续写内容质量校验，请稍候...');
      qualityResult = await evaluateContinueQuality(continueContent, precheckResult, useGraph, editedChapterContent, wordCount);
      // 不合格自动重写
      if (!qualityResult.是否合格 && !stopGenerateFlag) {
        toastr.warning(`续写内容质量不合格，总分${qualityResult.总分}，正在重新生成...`, "小说续写器");
        $('#write-status').text('正在重新生成续写章节，请稍候...');
        continueContent = await generateRaw({ 
          systemPrompt: systemPrompt + `\n注意：本次续写必须修正以下问题：${qualityResult.评估报告}`, 
          prompt: userPrompt, 
          ...getActivePresetParams()
        });
        if (stopGenerateFlag) {
          $('#write-status').text('已停止生成');
          toastr.info('已停止生成，丢弃本次生成结果', "小说续写器");
          return;
        }
        continueContent = continueContent.trim();
        qualityResult = await evaluateContinueQuality(continueContent, precheckResult, useGraph, editedChapterContent, wordCount);
      }
      // 渲染质量结果
      $("#quality-score").text(qualityResult.总分);
      $("#quality-report").val(qualityResult.评估报告);
      $("#quality-result-block").show();
      extension_settings[extensionName].qualityResultShow = true;
      saveSettingsDebounced();
    }

    // 渲染生成结果
    $('#write-content-preview').val(continueContent);
    $('#write-status').text('续写章节生成完成！');
    extension_settings[extensionName].writeContentPreview = continueContent;
    saveSettingsDebounced();

    // 添加到续写链条
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

    // 生成续写章节图谱
    await updateGraphWithContinueContent(newChapter, newChapter.id);
    renderContinueWriteChain(continueWriteChain);
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

// 基于已有续写章节继续续写
export async function generateContinueWrite(targetChainId) {
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

  // 获取目标续写章节
  const targetChapter = continueWriteChain.find(item => item.id === targetChainId);
  if (!targetChapter) {
    toastr.error('目标续写章节不存在', "小说续写器");
    return;
  }
  // 提取目标章节最后一段
  const targetContent = targetChapter.content;
  const targetParagraphs = targetContent.split('\n').filter(p => p.trim() !== '');
  const targetLastParagraph = targetParagraphs.length > 0 ? targetParagraphs[targetParagraphs.length - 1].trim() : '';

  // 初始化生成状态
  isGeneratingWrite = true;
  stopGenerateFlag = false;
  setButtonDisabled('#write-generate-btn, .continue-write-btn', true);
  setButtonDisabled('#write-stop-btn', false);
  toastr.info('正在生成续写章节，请稍候...', "小说续写器");

  try {
    // 前置校验
    const precheckResult = await validateContinuePrecondition(selectedBaseChapterId, editedBaseChapterContent);
    const useGraph = Object.keys(precheckResult.preGraph).length > 0 ? precheckResult.preGraph : mergedGraph;

    if (stopGenerateFlag) {
      $('#write-status').text('已停止生成，丢弃本次生成结果');
      toastr.info('已停止生成，丢弃本次生成结果', "小说续写器");
      return;
    }

    // 拼接完整上下文
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

    // 续写Prompt
    const systemPrompt = `小说续写规则（100%遵守）：
人设锁定：续写内容必须完全贴合小说的核心人物设定，绝对不能出现人设崩塌（OOC），严格遵守以下人设红线：${precheckResult.redLines}
设定合规：续写内容必须完全符合小说的世界观设定，绝对不能出现吃书、新增违规设定、违反原有规则的问题，严格遵守以下设定禁区：${precheckResult.forbiddenRules}
文本衔接：续写内容必须紧接在上一章（续写章节 ${targetChapter.title}）的最后一段之后开始，从那个地方继续写下去，确保文本连续，逻辑自洽。上一章的最后一段内容是："${targetLastParagraph}"
续写必须从这段文字之后直接开始，不能重复这段内容。
剧情承接：续写内容必须承接前文所有剧情，合理呼应以下伏笔：${precheckResult.foreshadowList}，开启新章节，且与上述文本衔接要求一致，不得重复前文已有的情节。
文风统一：续写内容必须完全贴合原小说的叙事风格、语言习惯、对话方式、节奏特点，和原文无缝衔接，无风格割裂
剧情合理：续写内容要符合原小说的世界观设定，推动主线剧情发展，有完整的情节起伏、生动的细节、符合人设的对话
输出要求：只输出续写的正文内容，不要任何标题、章节名、解释、备注、说明、分割线
字数要求：续写约${wordCount}字，误差不超过10%
矛盾规避：必须规避以下潜在剧情矛盾：${precheckResult.conflictWarning}
小数据适配：若前文内容较少，严格遵循现有文本的叙事范式、对话模式、剧情节奏，不做风格跳脱的续写，不无限新增设定与人物`;
    const userPrompt = `小说核心设定知识图谱：${JSON.stringify(useGraph)}
完整前文上下文：${fullContextContent}
请基于以上完整的前文内容和知识图谱，按照规则续写后续的新章节正文，确保和前文最后一段内容完美衔接，不重复前文情节。`;

    // 生成续写内容
    let continueContent = await generateRaw({ systemPrompt, prompt: userPrompt, ...getActivePresetParams()});
    if (stopGenerateFlag) {
      $('#write-status').text('已停止生成，丢弃本次生成结果');
      toastr.info('已停止生成，丢弃本次生成结果', "小说续写器");
      return;
    }
    if (!continueContent.trim()) {
      throw new Error('生成内容为空');
    }
    continueContent = continueContent.trim();

    // 质量校验
    let qualityResult = null;
    if (enableQualityCheck && !stopGenerateFlag) {
      toastr.info('正在执行续写内容质量校验，请稍候...', "小说续写器");
      qualityResult = await evaluateContinueQuality(continueContent, precheckResult, useGraph, editedBaseChapterContent, wordCount);
      // 不合格自动重写
      if (!qualityResult.是否合格 && !stopGenerateFlag) {
        toastr.warning(`续写内容质量不合格，总分${qualityResult.总分}，正在重新生成...`, "小说续写器");
        continueContent = await generateRaw({ 
          systemPrompt: systemPrompt + `\n注意：本次续写必须修正以下问题：${qualityResult.评估报告}`, 
          prompt: userPrompt, 
          ...getActivePresetParams()
        });
        if (stopGenerateFlag) {
          $('#write-status').text('已停止生成');
          toastr.info('已停止生成，丢弃本次生成结果', "小说续写器");
          return;
        }
        continueContent = continueContent.trim();
        qualityResult = await evaluateContinueQuality(continueContent, precheckResult, useGraph, editedBaseChapterContent, wordCount);
      }
      // 渲染质量结果
      $("#quality-score").text(qualityResult.总分);
      $("#quality-report").val(qualityResult.评估报告);
      $("#quality-result-block").show();
      extension_settings[extensionName].qualityResultShow = true;
      saveSettingsDebounced();
    }

    // 添加到续写链条
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

    // 生成续写章节图谱
    await updateGraphWithContinueContent(newChapter, newChapter.id);
    renderContinueWriteChain(continueWriteChain);
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
