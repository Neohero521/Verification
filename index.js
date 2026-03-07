// 严格遵循官方模板导入规范，路径完全对齐
import {
  extension_settings,
  getContext,
  loadExtensionSettings,
} from "../../../extensions.js";

import { saveSettingsDebounced } from "../../../../script.js";

// 与仓库名称完全一致，确保路径正确
const extensionName = "Verification";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;

// ==================== 升级版知识图谱Schema ====================
// 单章节图谱Schema（符合规则一）
const SINGLE_CHAPTER_GRAPH_SCHEMA = {
  name: 'SingleChapterKnowledgeGraph',
  strict: true,
  value: {
    "$schema": "http://json-schema.org/draft-04/schema#",
    "type": "object",
    "required": [
      "基础章节信息", "人物信息", "世界观设定", "核心剧情线",
      "文风特点", "实体关系网络", "变更与依赖信息", "逆向分析洞察"
    ],
    "properties": {
      "基础章节信息": {
        "type": "object",
        "required": ["章节号", "章节版本号", "章节节点唯一标识", "本章字数", "叙事时间线节点"],
        "properties": {
          "章节号": { "type": "string" },
          "章节版本号": { "type": "string" },
          "章节节点唯一标识": { "type": "string" },
          "本章字数": { "type": "integer" },
          "叙事时间线节点": { "type": "string" }
        }
      },
      "人物信息": {
        "type": "array",
        "items": {
          "type": "object",
          "required": [
            "唯一人物ID", "姓名", "别名/称号", "本章更新的性格特征",
            "本章更新的身份/背景", "本章核心行为与动机", "本章人物关系变更", "本章人物弧光变化"
          ],
          "properties": {
            "唯一人物ID": { "type": "string" },
            "姓名": { "type": "string" },
            "别名/称号": { "type": "string" },
            "本章更新的性格特征": { "type": "string" },
            "本章更新的身份/背景": { "type": "string" },
            "本章核心行为与动机": { "type": "string" },
            "本章人物关系变更": {
              "type": "array",
              "items": {
                "type": "object",
                "required": ["关系对象", "关系类型", "关系强度", "关系描述", "对应原文位置"],
                "properties": {
                  "关系对象": { "type": "string" },
                  "关系类型": { "type": "string" },
                  "关系强度": { "type": "number", "minimum": 0, "maximum": 1 },
                  "关系描述": { "type": "string" },
                  "对应原文位置": { "type": "string" }
                }
              }
            },
            "本章人物弧光变化": { "type": "string" }
          }
        }
      },
      "世界观设定": {
        "type": "object",
        "required": [
          "本章新增/变更的时代背景", "本章新增/变更的地理区域",
          "本章新增/变更的力量体系/规则", "本章新增/变更的社会结构",
          "本章新增/变更的独特物品/生物", "本章新增的隐藏设定/伏笔",
          "对应原文位置"
        ],
        "properties": {
          "本章新增/变更的时代背景": { "type": "string" },
          "本章新增/变更的地理区域": { "type": "string" },
          "本章新增/变更的力量体系/规则": { "type": "string" },
          "本章新增/变更的社会结构": { "type": "string" },
          "本章新增/变更的独特物品/生物": { "type": "string" },
          "本章新增的隐藏设定/伏笔": { "type": "string" },
          "对应原文位置": { "type": "string" }
        }
      },
      "核心剧情线": {
        "type": "object",
        "required": ["本章主线剧情描述", "本章关键事件列表", "本章支线剧情", "本章核心冲突进展", "本章未回收伏笔"],
        "properties": {
          "本章主线剧情描述": { "type": "string" },
          "本章关键事件列表": {
            "type": "array",
            "items": {
              "type": "object",
              "required": ["事件ID", "事件名", "参与人物", "前因", "后果", "对主线的影响", "对应原文位置"],
              "properties": {
                "事件ID": { "type": "string" },
                "事件名": { "type": "string" },
                "参与人物": { "type": "string" },
                "前因": { "type": "string" },
                "后果": { "type": "string" },
                "对主线的影响": { "type": "string" },
                "对应原文位置": { "type": "string" }
              }
            }
          },
          "本章支线剧情": { "type": "string" },
          "本章核心冲突进展": { "type": "string" },
          "本章未回收伏笔": { "type": "string" }
        }
      },
      "文风特点": {
        "type": "object",
        "required": ["本章叙事视角", "本章语言风格", "本章对话特点", "本章常用修辞", "本章节奏特点", "与全文文风的匹配度说明"],
        "properties": {
          "本章叙事视角": { "type": "string" },
          "本章语言风格": { "type": "string" },
          "本章对话特点": { "type": "string" },
          "本章常用修辞": { "type": "string" },
          "本章节奏特点": { "type": "string" },
          "与全文文风的匹配度说明": { "type": "string" }
        }
      },
      "实体关系网络": {
        "type": "array",
        "minItems": 5,
        "items": {
          "type": "array",
          "minItems": 3,
          "maxItems": 3,
          "items": { "type": "string" }
        }
      },
      "变更与依赖信息": {
        "type": "object",
        "required": ["本章对全局图谱的变更项", "本章剧情依赖的前置章节", "本章内容对后续剧情的影响预判", "本章内容与前文的潜在冲突预警"],
        "properties": {
          "本章对全局图谱的变更项": { "type": "string" },
          "本章剧情依赖的前置章节": { "type": "string" },
          "本章内容对后续剧情的影响预判": { "type": "string" },
          "本章内容与前文的潜在冲突预警": { "type": "string" }
        }
      },
      "逆向分析洞察": { "type": "string" }
    }
  }
};

// 合并图谱Schema（符合规则一）
const MERGED_GRAPH_SCHEMA = {
  name: 'MergedNovelKnowledgeGraph',
  strict: true,
  value: {
    "$schema": "http://json-schema.org/draft-04/schema#",
    "type": "object",
    "required": [
      "全局基础信息", "人物信息库", "世界观设定库", "全剧情时间线",
      "全局文风标准", "全量实体关系网络", "反向依赖图谱", "逆向分析与质量评估"
    ],
    "properties": {
      "全局基础信息": {
        "type": "object",
        "required": ["小说名称", "总章节数", "已解析文本范围", "全局图谱版本号", "最新更新时间"],
        "properties": {
          "小说名称": { "type": "string" },
          "总章节数": { "type": "integer" },
          "已解析文本范围": { "type": "string" },
          "全局图谱版本号": { "type": "string" },
          "最新更新时间": { "type": "string" }
        }
      },
      "人物信息库": {
        "type": "array",
        "items": {
          "type": "object",
          "required": [
            "唯一人物ID", "姓名", "所有别名/称号", "全本最终性格特征",
            "完整身份/背景", "全本核心动机", "全时间线人物关系网",
            "完整人物弧光", "人物关键事件时间线"
          ],
          "properties": {
            "唯一人物ID": { "type": "string" },
            "姓名": { "type": "string" },
            "所有别名/称号": { "type": "string" },
            "全本最终性格特征": { "type": "string" },
            "完整身份/背景": { "type": "string" },
            "全本核心动机": { "type": "string" },
            "全时间线人物关系网": {
              "type": "array",
              "items": {
                "type": "object",
                "required": ["关系对象", "关系类型", "关系强度", "关系演变过程", "对应章节"],
                "properties": {
                  "关系对象": { "type": "string" },
                  "关系类型": { "type": "string" },
                  "关系强度": { "type": "number", "minimum": 0, "maximum": 1 },
                  "关系演变过程": { "type": "string" },
                  "对应章节": { "type": "string" }
                }
              }
            },
            "完整人物弧光": { "type": "string" },
            "人物关键事件时间线": { "type": "string" }
          }
        }
      },
      "世界观设定库": {
        "type": "object",
        "required": [
          "时代背景", "核心地理区域与地图", "完整力量体系/规则",
          "社会结构", "核心独特物品/生物", "全本所有隐藏设定/伏笔汇总",
          "设定变更历史记录"
        ],
        "properties": {
          "时代背景": { "type": "string" },
          "核心地理区域与地图": { "type": "string" },
          "完整力量体系/规则": { "type": "string" },
          "社会结构": { "type": "string" },
          "核心独特物品/生物": { "type": "string" },
          "全本所有隐藏设定/伏笔汇总": { "type": "string" },
          "设定变更历史记录": { "type": "string" }
        }
      },
      "全剧情时间线": {
        "type": "object",
        "required": [
          "主线剧情完整脉络", "全本关键事件时序表",
          "支线剧情汇总与关联关系", "全本核心冲突演变轨迹", "剧情节点依赖关系图"
        ],
        "properties": {
          "主线剧情完整脉络": { "type": "string" },
          "全本关键事件时序表": { "type": "string" },
          "支线剧情汇总与关联关系": { "type": "string" },
          "全本核心冲突演变轨迹": { "type": "string" },
          "剧情节点依赖关系图": { "type": "string" }
        }
      },
      "全局文风标准": {
        "type": "object",
        "required": ["固定叙事视角", "核心语言风格", "对话写作特点", "常用修辞与句式", "整体节奏规律", "场景描写习惯"],
        "properties": {
          "固定叙事视角": { "type": "string" },
          "核心语言风格": { "type": "string" },
          "对话写作特点": { "type": "string" },
          "常用修辞与句式": { "type": "string" },
          "整体节奏规律": { "type": "string" },
          "场景描写习惯": { "type": "string" }
        }
      },
      "全量实体关系网络": {
        "type": "array",
        "minItems": 20,
        "items": {
          "type": "array",
          "minItems": 3,
          "maxItems": 3,
          "items": { "type": "string" }
        }
      },
      "反向依赖图谱": {
        "type": "object",
        "additionalProperties": {
          "type": "object",
          "properties": {
            "生效人物": { "type": "array", "items": { "type": "string" } },
            "生效设定": { "type": "array", "items": { "type": "string" } },
            "生效剧情状态": { "type": "string" }
          }
        }
      },
      "逆向分析与质量评估": {
        "type": "object",
        "required": ["隐藏信息汇总", "潜在剧情矛盾预警", "设定一致性校验结果", "人设连贯性评估", "伏笔完整性评估", "全文本逻辑自洽性得分"],
        "properties": {
          "隐藏信息汇总": { "type": "string" },
          "潜在剧情矛盾预警": { "type": "string" },
          "设定一致性校验结果": { "type": "string" },
          "人设连贯性评估": { "type": "string" },
          "伏笔完整性评估": { "type": "string" },
          "全文本逻辑自洽性得分": { "type": "number", "minimum": 0, "maximum": 100 }
        }
      }
    }
  }
};

// 质量评估Schema（规则四）
const EVALUATION_SCHEMA = {
  name: 'ContinuationQualityEvaluation',
  strict: true,
  value: {
    "type": "object",
    "required": ["人设一致性", "设定合规性", "剧情衔接度", "文风匹配度", "内容质量", "总分", "是否合格"],
    "properties": {
      "人设一致性": { "type": "number", "minimum": 0, "maximum": 100 },
      "设定合规性": { "type": "number", "minimum": 0, "maximum": 100 },
      "剧情衔接度": { "type": "number", "minimum": 0, "maximum": 100 },
      "文风匹配度": { "type": "number", "minimum": 0, "maximum": 100 },
      "内容质量": { "type": "number", "minimum": 0, "maximum": 100 },
      "总分": { "type": "number", "minimum": 0, "maximum": 500 },
      "是否合格": { "type": "boolean" }
    }
  }
};

// ==================== 默认配置 ====================
const defaultSettings = {
  chapterRegex: "^\\s*第\\s*[0-9零一二三四五六七八九十百千]+\\s*章.*$",
  sendTemplate: "/sendas name={{char}} {{pipe}}",
  sendDelay: 100,
  example_setting: false,
  chapterList: [],              // 原始章节列表
  chapterGraphMap: {},          // 原始章节ID -> 单章图谱
  continueChapterGraphs: [],    // 续写章节图谱数组 { id, title, content, graph }
  mergedGraph: {},              // 合并后的全量图谱
  continueWriteChain: [],       // 续写链条（仅内容）
  continueChapterIdCounter: 1,
};

// 全局状态
let currentParsedChapters = [];
let isGeneratingGraph = false;
let isGeneratingWrite = false;
let stopGenerateFlag = false;
let isSending = false;
let stopSending = false;
let continueWriteChain = [];
let continueChapterIdCounter = 1;
let continueChapterGraphs = [];  // 新增：存储续写章节的图谱

// ==================== 工具函数 ====================
async function loadSettings() {
  extension_settings[extensionName] = extension_settings[extensionName] || {};
  
  if (Object.keys(extension_settings[extensionName]).length === 0) {
    Object.assign(extension_settings[extensionName], defaultSettings);
  }

  for (const key of Object.keys(defaultSettings)) {
    if (!Object.hasOwn(extension_settings[extensionName], key)) {
      extension_settings[extensionName][key] = structuredClone(defaultSettings[key]);
    }
  }

  currentParsedChapters = extension_settings[extensionName].chapterList || [];
  continueWriteChain = extension_settings[extensionName].continueWriteChain || [];
  continueChapterIdCounter = extension_settings[extensionName].continueChapterIdCounter || 1;
  continueChapterGraphs = extension_settings[extensionName].continueChapterGraphs || [];

  $("#example_setting").prop("checked", extension_settings[extensionName].example_setting).trigger("input");
  $("#chapter-regex-input").val(extension_settings[extensionName].chapterRegex);
  $("#send-template-input").val(extension_settings[extensionName].sendTemplate);
  $("#send-delay-input").val(extension_settings[extensionName].sendDelay);
  $("#merged-graph-preview").val(JSON.stringify(extension_settings[extensionName].mergedGraph, null, 2));

  renderChapterList(currentParsedChapters);
  renderChapterSelect(currentParsedChapters);
  renderContinueWriteChain(continueWriteChain);
}

function onExampleInput(event) {
  const value = Boolean($(event.target).prop("checked"));
  extension_settings[extensionName].example_setting = value;
  saveSettingsDebounced();
}

function onButtonClick() {
  toastr.info(
    `The checkbox is ${ extension_settings[extensionName].example_setting ? "checked" : "not checked" }`,
    "Extension Example"
  );
}

function renderCommandTemplate(template, charName, chapterContent) {
  return template
    .replace(/{{char}}/g, charName || '角色')
    .replace(/{{pipe}}/g, `"${chapterContent.replace(/"/g, '\\"').replace(/\|/g, '\\|')}"`);
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

// ==================== 章节管理 ====================
function splitNovelIntoChapters(novelText, regexSource) {
  try {
    const chapterRegex = new RegExp(regexSource, 'gm');
    const matches = [...novelText.matchAll(chapterRegex)];
    const chapters = [];

    if (matches.length === 0) {
      return [{ id: 0, title: '全文', content: novelText, hasGraph: false }];
    }

    for (let i = 0; i < matches.length; i++) {
      const start = matches[i].index + matches[i][0].length;
      const end = i < matches.length - 1 ? matches[i + 1].index : novelText.length;
      const title = matches[i][0].trim();
      const content = novelText.slice(start, end).trim();
      
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

function renderChapterList(chapters) {
  const $listContainer = $('#novel-chapter-list');
  const graphMap = extension_settings[extensionName].chapterGraphMap || {};

  if (chapters.length === 0) {
    $listContainer.html('<p class="text-muted text-center">请上传小说文件并点击「解析章节」</p>');
    return;
  }

  chapters.forEach(chapter => {
    chapter.hasGraph = !!graphMap[chapter.id];
  });

  const listHtml = chapters.map((chapter) => `
    <div class="chapter-item flex-container alignCenter justifySpaceBetween" data-chapter-id="${chapter.id}">
      <label class="chapter-checkbox flex-container alignCenter gap5">
        <input type="checkbox" class="chapter-select" data-index="${chapter.id}" checked />
        <span class="chapter-title fontBold">${chapter.title}</span>
      </label>
      <span class="text-sm ${chapter.hasGraph ? 'text-success' : 'text-muted'}">
        ${chapter.hasGraph ? '已生成图谱' : '未生成图谱'}
      </span>
    </div>
  `).join('');

  $listContainer.html(listHtml);
}

function renderChapterSelect(chapters) {
  const $select = $('#write-chapter-select');
  if (chapters.length === 0) {
    $select.html('<option value="">请先解析章节</option>');
    $('#write-chapter-content').val('').prop('readonly', true);
    return;
  }

  const optionHtml = chapters.map(chapter => `
    <option value="${chapter.id}">${chapter.title}</option>
  `).join('');

  $select.html(`<option value="">请选择基准章节</option>${optionHtml}`);
  $('#write-chapter-content').val('').prop('readonly', true);
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
  }
}

function getSelectedChapters() {
  const checkedInputs = document.querySelectorAll('.chapter-select:checked');
  const selectedIndexes = [...checkedInputs].map(input => parseInt(input.dataset.index));
  return selectedIndexes.map(index => currentParsedChapters.find(item => item.id === index)).filter(Boolean);
}

// ==================== 知识图谱核心（升级版） ====================
async function generateSingleChapterGraph(chapter) {
  const context = getContext();
  const { generateRaw } = context;

  const systemPrompt = `
触发词：构建知识图谱JSON、小说章节分析
强制约束（100%遵守）：
1. 输出必须为纯JSON格式，无任何前置/后置内容、注释、markdown
2. 必须以{开头，以}结尾，无其他字符
3. 仅基于提供的小说文本分析，不引入任何外部内容
4. 严格包含所有要求的字段，不修改字段名
5. 无对应内容设为"暂无"或[]，不得留空
6. 必须包含原文位置信息，实现双向可追溯
7. 同一人物的不同别名必须合并，以本章出现的名称为准

必填字段：基础章节信息、人物信息、世界观设定、核心剧情线、文风特点、实体关系网络、变更与依赖信息、逆向分析洞察
`;

  const userPrompt = `小说章节标题：${chapter.title}\n小说章节内容：${chapter.content}`;

  try {
    const result = await generateRaw({ systemPrompt, prompt: userPrompt, jsonSchema: SINGLE_CHAPTER_GRAPH_SCHEMA });
    const graphData = JSON.parse(result.trim());

    // 补充基础章节信息中的字段
    graphData.基础章节信息 = graphData.基础章节信息 || {};
    graphData.基础章节信息.章节号 = graphData.基础章节信息.章节号 || chapter.id.toString();
    graphData.基础章节信息.本章字数 = graphData.基础章节信息.本章字数 || chapter.content.length;
    graphData.基础章节信息.章节节点唯一标识 = `chap_${chapter.id}`;
    graphData.基础章节信息.章节版本号 = "1.0";
    graphData.基础章节信息.叙事时间线节点 = chapter.title;

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
  }
}

async function mergeAllGraphs() {
  const context = getContext();
  const { generateRaw } = context;
  const graphMap = extension_settings[extensionName].chapterGraphMap || {};
  const continueGraphs = extension_settings[extensionName].continueChapterGraphs || [];
  
  // 合并所有图谱：原始章节图谱 + 续写章节图谱
  const allGraphs = [...Object.values(graphMap), ...continueGraphs.map(item => item.graph)];

  if (allGraphs.length === 0) {
    toastr.warning('没有可合并的章节图谱，请先生成图谱', "小说续写器");
    return;
  }

  const systemPrompt = `
触发词：合并知识图谱JSON、图谱合并
强制约束（100%遵守）：
1. 输出必须为纯JSON格式，无任何前置/后置内容、注释、markdown
2. 必须以{开头，以}结尾，无其他字符
3. 仅基于提供的多组图谱合并，不引入任何外部内容
4. 严格去重，同一人物/设定/事件不能重复，不同别名合并为同一条目，保留历史变更
5. 必须生成反向依赖图谱，每个章节节点标注生效的人物、设定、剧情状态
6. 必须包含质量评估，对全本逻辑自洽性打分

必填字段：全局基础信息、人物信息库、世界观设定库、全剧情时间线、全局文风标准、全量实体关系网络、反向依赖图谱、逆向分析与质量评估
`;

  const userPrompt = `待合并的多组知识图谱：\n${JSON.stringify(allGraphs, null, 2)}`;

  try {
    toastr.info('开始合并知识图谱，请稍候...', "小说续写器");
    const result = await generateRaw({ systemPrompt, prompt: userPrompt, jsonSchema: MERGED_GRAPH_SCHEMA });
    const mergedGraph = JSON.parse(result.trim());

    // 补充全局基础信息
    mergedGraph.全局基础信息 = mergedGraph.全局基础信息 || {};
    mergedGraph.全局基础信息.小说名称 = mergedGraph.全局基础信息.小说名称 || "未知小说";
    mergedGraph.全局基础信息.总章节数 = currentParsedChapters.length + continueGraphs.length;
    mergedGraph.全局基础信息.已解析文本范围 = `1-${currentParsedChapters.length}章 + 续写${continueGraphs.length}章`;
    mergedGraph.全局基础信息.全局图谱版本号 = `v${Date.now()}`;
    mergedGraph.全局基础信息.最新更新时间 = new Date().toISOString();

    extension_settings[extensionName].mergedGraph = mergedGraph;
    saveSettingsDebounced();
    $('#merged-graph-preview').val(JSON.stringify(mergedGraph, null, 2));

    toastr.success('知识图谱合并完成！', "小说续写器");
    return mergedGraph;
  } catch (error) {
    console.error('图谱合并失败:', error);
    toastr.error(`图谱合并失败: ${error.message}`, "小说续写器");
    return null;
  }
}

// ==================== 逆向分析与前置校验（规则二） ====================
function performReverseAnalysis(chapterId, mergedGraph) {
  // 如果合并图谱为空，返回默认提示
  if (!mergedGraph || Object.keys(mergedGraph).length === 0) {
    return "未检测到合并图谱，请先合并图谱以获取精确前置信息。";
  }

  // 从反向依赖图谱中提取该章节的信息
  const reverseDep = mergedGraph.反向依赖图谱 || {};
  const chapterKey = `chap_${chapterId}`; // 假设章节标识为 chap_<id>
  const nodeInfo = reverseDep[chapterKey] || { 生效人物: [], 生效设定: [], 生效剧情状态: "暂无" };

  // 从人物信息库中提取该章节之前的人物状态（简化：仅输出生效人物列表）
  // 实际可根据需要细化
  const report = `
【前置校验报告】
- 生效人物：${nodeInfo.生效人物.join('、') || '无'}
- 生效设定：${nodeInfo.生效设定.join('、') || '无'}
- 当前剧情状态：${nodeInfo.生效剧情状态}
- 续写红线：不得违反以上人设、设定，不得引入外部元素，必须与前文无缝衔接。
- 可呼应的伏笔：请参考合并图谱中的“全本所有隐藏设定/伏笔汇总”。
`;

  return report;
}

// 小数据场景适配
function isSmallDataScenario() {
  return currentParsedChapters.length < 3;
}

// ==================== 质量评估（规则四） ====================
async function evaluateContinuation(originalContext, generatedContent, prerequisiteInfo) {
  const context = getContext();
  const { generateRaw } = context;

  const systemPrompt = `
你是一位专业的小说质量评估专家。请对生成的续写内容进行多维度评分，并判断是否合格。
评分标准：
- 人设一致性：0-100分，人物言行是否符合人设
- 设定合规性：0-100分，是否符合世界观设定
- 剧情衔接度：0-100分，与前文衔接是否自然
- 文风匹配度：0-100分，风格是否贴合原文
- 内容质量：0-100分，情节完整、细节生动、无灌水

合格阈值：单项≥80分，总分≥425分（85%）。
输出严格JSON格式，包含以上五个维度的分数、总分及是否合格。
`;

  const userPrompt = `
前文上下文（含前置校验）：${originalContext}

续写内容：${generatedContent}

前置校验报告：${prerequisiteInfo}

请评分。
`;

  try {
    const result = await generateRaw({ systemPrompt, prompt: userPrompt, jsonSchema: EVALUATION_SCHEMA });
    const evalData = JSON.parse(result.trim());
    return evalData;
  } catch (error) {
    console.error('质量评估失败:', error);
    return { 是否合格: false, 总分: 0 }; // 默认不合格
  }
}

// ==================== 续写核心（规则三） ====================
async function generateNovelWrite() {
  const context = getContext();
  const { generateRaw } = context;
  const selectedChapterId = $('#write-chapter-select').val();
  const editedChapterContent = $('#write-chapter-content').val().trim();
  const wordCount = parseInt($('#write-word-count').val()) || 2000;
  const mergedGraph = extension_settings[extensionName].mergedGraph || {};

  // 前置校验
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

  // 逆向分析
  const prerequisiteReport = performReverseAnalysis(parseInt(selectedChapterId), mergedGraph);
  
  // 构建续写prompt（根据小数据场景调整）
  const smallDataHint = isSmallDataScenario() ? "注意：当前小说文本较少，请深度挖掘现有信息，严格贴合原文细节，避免新增外部元素。" : "";

  const systemPrompt = `
小说续写规则（100%遵守）：
1. 人设锁定：续写内容必须完全贴合小说的核心人物设定，绝对不能出现人设崩塌（OOC）。
2. 剧情衔接：续写内容必须和提供的基准章节内容完美衔接，逻辑自洽，承接前文剧情，开启新的章节内容。
3. 文风统一：续写内容必须完全贴合原小说的叙事风格、语言习惯、对话方式、节奏特点。
4. 剧情合理：续写内容要符合原小说的世界观设定，推动主线剧情发展，有完整的情节起伏、生动的细节、符合人设的对话。
5. 输出要求：只输出续写的正文内容，不要任何标题、章节名、解释、备注。
6. 字数要求：续写约${wordCount}字，误差不超过10%。
${smallDataHint}
`;

  const userPrompt = `
小说核心设定知识图谱：${JSON.stringify(mergedGraph)}

前置校验报告：
${prerequisiteReport}

基准章节内容：${editedChapterContent}

请基于以上内容，按照规则续写后续的章节正文。
`;

  // 开始生成（带重试机制）
  isGeneratingWrite = true;
  stopGenerateFlag = false;
  $('#write-status').text('正在生成续写章节，请稍候...');

  let retryCount = 0;
  const MAX_RETRIES = 3;
  let finalContent = '';

  try {
    while (retryCount < MAX_RETRIES && !stopGenerateFlag) {
      const result = await generateRaw({ systemPrompt, prompt: userPrompt });
      if (!result.trim()) {
        throw new Error('生成内容为空');
      }
      const generated = result.trim();

      // 质量评估
      const evalResult = await evaluateContinuation(editedChapterContent, generated, prerequisiteReport);
      if (evalResult.是否合格) {
        finalContent = generated;
        break;
      } else {
        retryCount++;
        $('#write-status').text(`质量不合格，正在重试 (${retryCount}/${MAX_RETRIES})...`);
        if (retryCount === MAX_RETRIES) {
          toastr.warning('多次尝试后质量仍不合格，请手动检查', "小说续写器");
          finalContent = generated; // 最后一次尝试的内容
        }
      }
    }

    if (stopGenerateFlag) {
      $('#write-status').text('已停止生成');
      return;
    }

    // 更新预览
    $('#write-content-preview').val(finalContent);
    $('#write-status').text('续写章节生成完成！');

    // 添加到续写链条
    const newChapter = {
      id: continueChapterIdCounter++,
      title: `续写章节 ${continueWriteChain.length + 1}`,
      content: finalContent
    };
    continueWriteChain.push(newChapter);
    extension_settings[extensionName].continueWriteChain = continueWriteChain;
    extension_settings[extensionName].continueChapterIdCounter = continueChapterIdCounter;
    saveSettingsDebounced();
    renderContinueWriteChain(continueWriteChain);

    // 为续写章节生成图谱并加入合并图谱（闭环更新）
    toastr.info('正在为续写章节生成知识图谱...', "小说续写器");
    const newChapterGraph = await generateSingleChapterGraph({
      id: `chain-${newChapter.id}`,
      title: newChapter.title,
      content: newChapter.content
    });
    if (newChapterGraph) {
      continueChapterGraphs.push({ id: newChapter.id, title: newChapter.title, graph: newChapterGraph });
      extension_settings[extensionName].continueChapterGraphs = continueChapterGraphs;
      saveSettingsDebounced();
      // 触发自动合并
      await mergeAllGraphs();
    }

    toastr.success('续写章节生成完成！已添加到续写链条并更新图谱', "小说续写器");
  } catch (error) {
    console.error('续写生成失败:', error);
    $('#write-status').text(`生成失败: ${error.message}`);
    toastr.error(`续写生成失败: ${error.message}`, "小说续写器");
  } finally {
    isGeneratingWrite = false;
    stopGenerateFlag = false;
  }
}

// 基于续写链条继续续写（与generateNovelWrite类似，但上下文拼接不同）
async function generateContinueWrite(targetChainId) {
  const context = getContext();
  const { generateRaw } = context;
  const selectedBaseChapterId = $('#write-chapter-select').val();
  const editedBaseChapterContent = $('#write-chapter-content').val().trim();
  const wordCount = parseInt($('#write-word-count').val()) || 2000;
  const mergedGraph = extension_settings[extensionName].mergedGraph || {};

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
  const targetChapterIndex = continueWriteChain.findIndex(item => item.id === targetChainId);
  if (targetChapterIndex === -1) {
    toastr.error('目标续写章节不存在', "小说续写器");
    return;
  }

  // 逆向分析（针对基准章节）
  const prerequisiteReport = performReverseAnalysis(parseInt(selectedBaseChapterId), mergedGraph);

  // 拼接完整上下文：基准前所有章节 + 魔改基准章 + 链条中到目标章的所有内容
  let fullContextContent = '';

  const baseChapterId = parseInt(selectedBaseChapterId);
  const preBaseChapters = currentParsedChapters.filter(chapter => chapter.id < baseChapterId);
  preBaseChapters.forEach(chapter => {
    fullContextContent += `${chapter.title}\n${chapter.content}\n\n`;
  });

  const baseChapterTitle = currentParsedChapters.find(c => c.id === baseChapterId)?.title || '基准章节';
  fullContextContent += `${baseChapterTitle}\n${editedBaseChapterContent}\n\n`;

  const targetBeforeChapters = continueWriteChain.slice(0, targetChapterIndex + 1);
  targetBeforeChapters.forEach((chapter, index) => {
    fullContextContent += `续写章节 ${index + 1}\n${chapter.content}\n\n`;
  });

  const smallDataHint = isSmallDataScenario() ? "注意：当前小说文本较少，请深度挖掘现有信息。" : "";

  const systemPrompt = `
小说续写规则（100%遵守）：
1. 人设锁定：续写内容必须完全贴合小说的核心人物设定，绝对不能出现人设崩塌。
2. 剧情衔接：续写内容必须和提供的完整上下文的最后一段内容完美衔接，逻辑自洽，开启新章节，不重复前文。
3. 文风统一：续写内容必须完全贴合原小说的叙事风格、语言习惯、对话方式、节奏特点。
4. 剧情合理：续写内容要符合世界观设定，推动主线剧情，有完整的情节起伏、生动的细节。
5. 输出要求：只输出续写的正文内容，不要任何标题、解释、备注。
6. 字数要求：续写约${wordCount}字，误差不超过10%。
${smallDataHint}
`;

  const userPrompt = `
小说核心设定知识图谱：${JSON.stringify(mergedGraph)}

前置校验报告：
${prerequisiteReport}

完整前文上下文：
${fullContextContent}

请基于以上完整的前文内容和知识图谱，按照规则续写后续的新章节正文，确保和前文最后一段内容完美衔接，不重复前文情节。
`;

  // 生成与重试逻辑同generateNovelWrite
  isGeneratingWrite = true;
  stopGenerateFlag = false;
  $('#write-status').text('正在生成续写章节，请稍候...');

  let retryCount = 0;
  const MAX_RETRIES = 3;
  let finalContent = '';

  try {
    while (retryCount < MAX_RETRIES && !stopGenerateFlag) {
      const result = await generateRaw({ systemPrompt, prompt: userPrompt });
      if (!result.trim()) {
        throw new Error('生成内容为空');
      }
      const generated = result.trim();
      const evalResult = await evaluateContinuation(fullContextContent, generated, prerequisiteReport);
      if (evalResult.是否合格) {
        finalContent = generated;
        break;
      } else {
        retryCount++;
        $('#write-status').text(`质量不合格，正在重试 (${retryCount}/${MAX_RETRIES})...`);
      }
    }

    if (stopGenerateFlag) {
      $('#write-status').text('已停止生成');
      return;
    }

    // 新增到续写链条
    const newChapter = {
      id: continueChapterIdCounter++,
      title: `续写章节 ${continueWriteChain.length + 1}`,
      content: finalContent
    };
    continueWriteChain.push(newChapter);
    extension_settings[extensionName].continueWriteChain = continueWriteChain;
    extension_settings[extensionName].continueChapterIdCounter = continueChapterIdCounter;
    saveSettingsDebounced();
    renderContinueWriteChain(continueWriteChain);

    // 为续写章节生成图谱并合并
    toastr.info('正在为续写章节生成知识图谱...', "小说续写器");
    const newChapterGraph = await generateSingleChapterGraph({
      id: `chain-${newChapter.id}`,
      title: newChapter.title,
      content: newChapter.content
    });
    if (newChapterGraph) {
      continueChapterGraphs.push({ id: newChapter.id, title: newChapter.title, graph: newChapterGraph });
      extension_settings[extensionName].continueChapterGraphs = continueChapterGraphs;
      saveSettingsDebounced();
      await mergeAllGraphs();
    }

    toastr.success('续写章节生成完成！已添加到续写链条并更新图谱', "小说续写器");
  } catch (error) {
    console.error('继续续写生成失败:', error);
    $('#write-status').text(`生成失败: ${error.message}`);
    toastr.error(`继续续写生成失败: ${error.message}`, "小说续写器");
  } finally {
    isGeneratingWrite = false;
    stopGenerateFlag = false;
  }
}

// ==================== 续写链条渲染 ====================
function renderContinueWriteChain(chain) {
  const $chainContainer = $('#continue-write-chain');
  if (chain.length === 0) {
    $chainContainer.html('<p class="text-muted text-center">暂无续写章节，生成续写内容后自动添加到此处</p>');
    return;
  }

  const chainHtml = chain.map((chapter, index) => `
    <div class="continue-chapter-item" data-chain-id="${chapter.id}">
      <div class="flex-container justifySpaceBetween alignCenter margin-b5">
        <b class="continue-chapter-title">续写章节 ${index + 1}</b>
        <div class="flex-container gap5">
          <input class="menu_button menu_button--sm menu_button--primary continue-write-btn" data-chain-id="${chapter.id}" type="submit" value="基于此章继续续写" />
          <input class="menu_button menu_button--sm continue-copy-btn" data-chain-id="${chapter.id}" type="submit" value="复制内容" />
          <input class="menu_button menu_button--sm continue-send-btn" data-chain-id="${chapter.id}" type="submit" value="发送到对话框" />
          <input class="menu_button menu_button--sm menu_button--danger continue-delete-btn" data-chain-id="${chapter.id}" type="submit" value="删除此章" />
        </div>
      </div>
      <textarea class="form-control w100 continue-chapter-content" data-chain-id="${chapter.id}" rows="12" placeholder="续写章节内容...">${chapter.content}</textarea>
    </div>
  `).join('');

  $chainContainer.html(chainHtml);

  // 绑定事件（略，同原代码）
  $('.continue-chapter-content').on('input', function(e) {
    const chainId = parseInt($(e.target).data('chain-id'));
    const newContent = $(e.target).val();
    const chapterIndex = continueWriteChain.findIndex(item => item.id === chainId);
    if (chapterIndex !== -1) {
      continueWriteChain[chapterIndex].content = newContent;
      extension_settings[extensionName].continueWriteChain = continueWriteChain;
      saveSettingsDebounced();
    }
  });

  $('.continue-write-btn').on('click', function(e) {
    const chainId = parseInt($(e.target).data('chain-id'));
    generateContinueWrite(chainId);
  });

  $('.continue-copy-btn').on('click', function(e) {
    const chainId = parseInt($(e.target).data('chain-id'));
    const chapter = continueWriteChain.find(item => item.id === chainId);
    if (!chapter || !chapter.content) {
      toastr.warning('没有可复制的内容', "小说续写器");
      return;
    }
    navigator.clipboard.writeText(chapter.content).then(() => {
      toastr.success('续写内容已复制到剪贴板', "小说续写器");
    }).catch(() => {
      toastr.error('复制失败', "小说续写器");
    });
  });

  $('.continue-send-btn').on('click', function(e) {
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

  $('.continue-delete-btn').on('click', function(e) {
    const chainId = parseInt($(e.target).data('chain-id'));
    const chapterIndex = continueWriteChain.findIndex(item => item.id === chainId);
    if (chapterIndex === -1) {
      toastr.warning('章节不存在', "小说续写器");
      return;
    }

    continueWriteChain.splice(chapterIndex, 1);
    // 同时删除对应的图谱
    continueChapterGraphs = continueChapterGraphs.filter(item => item.id !== chainId);
    extension_settings[extensionName].continueWriteChain = continueWriteChain;
    extension_settings[extensionName].continueChapterGraphs = continueChapterGraphs;
    saveSettingsDebounced();
    renderContinueWriteChain(continueWriteChain);
    toastr.success('已删除该续写章节', "小说续写器");
  });
}

// ==================== 扩展入口 ====================
jQuery(async () => {
  const settingsHtml = await $.get(`${extensionFolderPath}/example.html`);
  $("#extensions_settings").append(settingsHtml);

  $("#my_button").on("click", onButtonClick);
  $("#example_setting").on("input", onExampleInput);

  // 章节管理事件
  $("#parse-chapter-btn").on("click", () => {
    const file = $("#novel-file-upload")[0].files[0];
    const regexSource = $("#chapter-regex-input").val().trim();

    if (!file) {
      toastr.warning('请先选择小说TXT文件', "小说续写器");
      return;
    }

    extension_settings[extensionName].chapterRegex = regexSource;
    saveSettingsDebounced();

    const reader = new FileReader();
    reader.onload = (e) => {
      const novelText = e.target.result;
      currentParsedChapters = splitNovelIntoChapters(novelText, regexSource);
      extension_settings[extensionName].chapterList = currentParsedChapters;
      extension_settings[extensionName].chapterGraphMap = {};
      extension_settings[extensionName].mergedGraph = {};
      extension_settings[extensionName].continueWriteChain = [];
      extension_settings[extensionName].continueChapterGraphs = [];
      continueWriteChain = [];
      continueChapterGraphs = [];
      continueChapterIdCounter = 1;
      $('#merged-graph-preview').val('');
      saveSettingsDebounced();
      renderChapterList(currentParsedChapters);
      renderChapterSelect(currentParsedChapters);
      renderContinueWriteChain([]);
    };
    reader.onerror = () => {
      toastr.error('文件读取失败，请检查文件编码（仅支持UTF-8）', "小说续写器");
    };
    reader.readAsText(file, 'UTF-8');
  });

  $("#select-all-btn").on("click", () => {
    $(".chapter-select").prop("checked", true);
  });
  $("#unselect-all-btn").on("click", () => {
    $(".chapter-select").prop("checked", false);
  });

  $("#send-template-input").on("change", (e) => {
    extension_settings[extensionName].sendTemplate = $(e.target).val().trim();
    saveSettingsDebounced();
  });
  $("#send-delay-input").on("change", (e) => {
    extension_settings[extensionName].sendDelay = parseInt($(e.target).val()) || 100;
    saveSettingsDebounced();
  });

  $("#import-selected-btn").on("click", () => {
    const selectedChapters = getSelectedChapters();
    sendChaptersBatch(selectedChapters);
  });

  $("#import-all-btn").on("click", () => {
    sendChaptersBatch(currentParsedChapters);
  });

  $("#stop-send-btn").on("click", () => {
    if (isSending) {
      stopSending = true;
      toastr.info('已停止发送', "小说续写器");
    }
  });

  // 图谱事件
  $("#graph-single-btn").on("click", () => {
    const selectedChapters = getSelectedChapters();
    generateChapterGraphBatch(selectedChapters);
  });

  $("#graph-batch-btn").on("click", () => {
    generateChapterGraphBatch(currentParsedChapters);
  });

  $("#graph-merge-btn").on("click", mergeAllGraphs);

  $("#graph-import-btn").on("click", () => {
    $("#graph-file-upload").click();
  });

  $("#graph-file-upload").on("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const graphData = JSON.parse(event.target.result.trim());
        // 简单校验
        if (!graphData.全局基础信息) throw new Error("不是有效的合并图谱格式");
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

  $("#graph-copy-btn").on("click", () => {
    const graphText = $('#merged-graph-preview').val();
    if (!graphText) {
      toastr.warning('没有可复制的图谱内容', "小说续写器");
      return;
    }
    navigator.clipboard.writeText(graphText).then(() => {
      toastr.success('图谱JSON已复制到剪贴板', "小说续写器");
    }).catch(() => {
      toastr.error('复制失败', "小说续写器");
    });
  });

  $("#graph-export-btn").on("click", () => {
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

  $("#graph-clear-btn").on("click", () => {
    extension_settings[extensionName].mergedGraph = {};
    $('#merged-graph-preview').val('');
    saveSettingsDebounced();
    toastr.success('已清空合并图谱', "小说续写器");
  });

  // 续写模块事件
  $("#write-chapter-select").on("change", function(e) {
    const selectedChapterId = $(e.target).val();
    if (!selectedChapterId) {
      $('#write-chapter-content').val('').prop('readonly', true);
      return;
    }
    const targetChapter = currentParsedChapters.find(item => item.id == selectedChapterId);
    if (targetChapter) {
      $('#write-chapter-content').val(targetChapter.content).prop('readonly', false);
    }
  });

  $("#write-generate-btn").on("click", generateNovelWrite);

  $("#write-stop-btn").on("click", () => {
    if (isGeneratingWrite) {
      stopGenerateFlag = true;
      $('#write-status').text('已停止生成');
      toastr.info('已停止生成续写内容', "小说续写器");
    }
  });

  $("#write-copy-btn").on("click", () => {
    const writeText = $('#write-content-preview').val();
    if (!writeText) {
      toastr.warning('没有可复制的续写内容', "小说续写器");
      return;
    }
    navigator.clipboard.writeText(writeText).then(() => {
      toastr.success('续写内容已复制到剪贴板', "小说续写器");
    }).catch(() => {
      toastr.error('复制失败', "小说续写器");
    });
  });

  $("#write-send-btn").on("click", () => {
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

  $("#write-clear-btn").on("click", () => {
    $('#write-content-preview').val('');
    $('#write-status').text('');
    toastr.success('已清空续写内容', "小说续写器");
  });

  $("#clear-chain-btn").on("click", () => {
    continueWriteChain = [];
    continueChapterIdCounter = 1;
    continueChapterGraphs = [];
    extension_settings[extensionName].continueWriteChain = continueWriteChain;
    extension_settings[extensionName].continueChapterIdCounter = continueChapterIdCounter;
    extension_settings[extensionName].continueChapterGraphs = continueChapterGraphs;
    saveSettingsDebounced();
    renderContinueWriteChain(continueWriteChain);
    toastr.success('已清空所有续写章节', "小说续写器");
  });

  loadSettings();
});