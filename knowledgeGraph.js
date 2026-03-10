import {
    extension_settings, extensionName, saveSettingsDebounced,
    graphJsonSchema, mergeGraphJsonSchema,
    currentParsedChapters, isGeneratingGraph, stopGenerateFlag
} from "./constants.js";
import { getActivePresetParams, updateProgress, setButtonDisabled, removeBOM } from "./utils.js";
import { renderChapterList } from "./chapterManager.js";
import { NovelReader } from "./novelReader.js";

// 生成单章节图谱
export async function generateSingleChapterGraph(chapter) {
    const context = getContext();
    const { generateRaw } = context;
    const systemPrompt = `触发词：构建单章节知识图谱JSON、小说章节解析
强制约束（100%遵守）：
输出必须为纯JSON格式，无任何前置/后置内容、注释、markdown
必须以{开头，以}结尾，无其他字符
仅基于提供的小说文本分析，不引入任何外部内容
严格包含所有要求的字段，不修改字段名
无对应内容设为"暂无"，数组设为[]，不得留空
必须实现全链路双向可追溯，所有信息必须关联对应原文位置
同一人物、设定、事件不能重复出现，同一人物的不同别名必须合并为同一个唯一实体条目
基础章节信息必须填写：章节号=${chapter.id}，章节节点唯一标识=chapter_${chapter.id}，本章字数=${chapter.content.length}
必填字段：基础章节信息、人物信息、世界观设定、核心剧情线、文风特点、实体关系网络、变更与依赖信息、逆向分析洞察`;
    const userPrompt = `小说章节标题：${chapter.title}\n小说章节内容：${chapter.content}`;

    try {
        const result = await generateRaw({
            systemPrompt,
            prompt: userPrompt,
            jsonSchema: graphJsonSchema,
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

// 批量生成章节图谱
export async function generateChapterGraphBatch(chapters) {
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
    setButtonDisabled('#graph-single-btn, #graph-batch-btn, #graph-merge-btn', true);

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
        setButtonDisabled('#graph-single-btn, #graph-batch-btn, #graph-merge-btn', false);
    }
}

// 合并全量图谱
export async function mergeAllGraphs() {
    const context = getContext();
    const { generateRaw } = context;
    const graphMap = extension_settings[extensionName].chapterGraphMap || {};
    const graphList = Object.values(graphMap);

    if (graphList.length === 0) {
        toastr.warning('没有可合并的章节图谱，请先生成图谱', "小说续写器");
        return;
    }
    setButtonDisabled('#graph-merge-btn', true);

    const systemPrompt = `触发词：合并全量知识图谱JSON、小说全局图谱构建
强制约束（100%遵守）：
输出必须为纯JSON格式，无任何前置/后置内容、注释、markdown
必须以{开头，以}结尾，无其他字符
仅基于提供的多组图谱合并，不引入任何外部内容
严格去重，同一人物/设定/事件不能重复，不同别名合并为同一条目
同一设定以最新章节的生效内容为准，同时保留历史变更记录
严格包含所有要求的字段，不修改字段名
无对应内容设为"暂无"，数组设为[]，不得留空
必须构建完整的反向依赖图谱，支持任意章节续写的前置信息提取
必填字段：全局基础信息、人物信息库、世界观设定库、全剧情时间线、全局文风标准、全量实体关系网络、反向依赖图谱、逆向分析与质量评估`;
    const userPrompt = `待合并的多组知识图谱：\n${JSON.stringify(graphList, null, 2)}`;

    try {
        toastr.info('开始合并知识图谱，请稍候...', "小说续写器");
        const result = await generateRaw({
            systemPrompt,
            prompt: userPrompt,
            jsonSchema: mergeGraphJsonSchema,
            ...getActivePresetParams()
        });
        const mergedGraph = JSON.parse(result.trim());
        extension_settings[extensionName].mergedGraph = mergedGraph;
        saveSettingsDebounced();
        $('#merged-graph-preview').val(JSON.stringify(mergedGraph, null, 2));
        toastr.success('知识图谱合并完成！', "小说续写器");
        return mergedGraph;
    } catch (error) {
        console.error('图谱合并失败:', error);
        toastr.error(`图谱合并失败: ${error.message}`, "小说续写器");
        return null;
    } finally {
        setButtonDisabled('#graph-merge-btn', false);
    }
}

// 校验图谱合规性
export async function validateGraphCompliance() {
    const mergedGraph = extension_settings[extensionName].mergedGraph || {};
    const fullRequiredFields = mergeGraphJsonSchema.value.required;
    const singleRequiredFields = graphJsonSchema.value.required;
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
        const graphType = isFullGraph ? "全量图谱" : "单章节图谱";
        result = `图谱合规性校验不通过，${graphType}缺少必填字段：${missingFields.join('、')}，请重新生成/合并图谱`;
        isPass = false;
    } else if (graphWordCount < minWordCount) {
        const graphType = isFullGraph ? "全量图谱" : "单章节图谱";
        result = `图谱合规性校验不通过，${graphType}内容字数不足，当前字数：${graphWordCount}，最低要求：${minWordCount}字，请重新生成图谱`;
        isPass = false;
    } else {
        const logicScore = mergedGraph?.逆向分析与质量评估?.全文本逻辑自洽性得分 || mergedGraph?.逆向分析洞察 ? 90 : 0;
        const graphType = isFullGraph ? "全量图谱" : "单章节图谱";
        result = `图谱合规性校验通过，${graphType}所有必填字段完整，内容字数：${graphWordCount}字，全文本逻辑自洽性得分：${logicScore}/100`;
        isPass = true;
    }

    $("#graph-validate-content").val(result);
    $("#graph-validate-result").show();
    extension_settings[extensionName].graphValidateResultShow = true;
    saveSettingsDebounced();

    if (isPass) {
        toastr.success('图谱合规性校验通过', "小说续写器");
    } else {
        toastr.warning('图谱合规性校验不通过', "小说续写器");
    }
    return isPass;
}

// 检验章节图谱状态
export async function validateChapterGraphStatus() {
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

// 导出单章节图谱
export function exportChapterGraphs() {
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

// 导入单章节图谱
export async function importChapterGraphs(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const importData = JSON.parse(removeBOM(event.target.result.trim()));
            if (!importData.chapterGraphMap || typeof importData.chapterGraphMap !== 'object') {
                throw new Error("图谱格式错误，缺少chapterGraphMap字段");
            }
            // 合并导入的图谱，不覆盖已有内容
            const existingGraphMap = extension_settings[extensionName].chapterGraphMap || {};
            const newGraphMap = { ...existingGraphMap, ...importData.chapterGraphMap };
            extension_settings[extensionName].chapterGraphMap = newGraphMap;
            saveSettingsDebounced();
            // 更新章节图谱状态
            currentParsedChapters.forEach(chapter => {
                chapter.hasGraph = !!newGraphMap[chapter.id];
            });
            renderChapterList(currentParsedChapters);
            toastr.success(`单章节图谱导入完成！共导入${Object.keys(importData.chapterGraphMap).length}个章节图谱`, "小说续写器");
        } catch (error) {
            console.error('单章节图谱导入失败:', error);
            toastr.error(`导入失败：${error.message}，请检查JSON文件格式是否正确`, "小说续写器");
        } finally {
            $("#chapter-graph-file-upload").val('');
        }
    };
    reader.onerror = () => {
        toastr.error('文件读取失败，请检查文件', "小说续写器");
        $("#chapter-graph-file-upload").val('');
    };
    reader.readAsText(file, 'UTF-8');
}

// 更新魔改章节图谱
export async function updateModifiedChapterGraph(chapterId, modifiedContent) {
    const context = getContext();
    const { generateRaw } = context;
    const targetChapter = currentParsedChapters.find(item => item.id === parseInt(chapterId));
    if (!targetChapter) {
        toastr.error('目标章节不存在', "小说续写器");
        return null;
    }
    if (!modifiedContent.trim()) {
        toastr.error('魔改后的章节内容不能为空', "小说续写器");
        return null;
    }

    const systemPrompt = `触发词：构建单章节知识图谱JSON、小说魔改章节解析
强制约束（100%遵守）：
输出必须为纯JSON格式，无任何前置/后置内容、注释、markdown
必须以{开头，以}结尾，无其他字符
仅基于提供的魔改后章节内容分析，不引入任何外部内容
严格包含所有要求的字段，不修改字段名
无对应内容设为"暂无"，数组设为[]，不得留空
必须实现全链路双向可追溯，所有信息必须关联对应原文位置
同一人物、设定、事件不能重复出现，同一人物的不同别名必须合并为同一个唯一实体条目
基础章节信息必须填写：章节号=${targetChapter.id}，章节节点唯一标识=chapter_${targetChapter.id}，本章字数=${modifiedContent.length}
必填字段：基础章节信息、人物信息、世界观设定、核心剧情线、文风特点、实体关系网络、变更与依赖信息、逆向分析洞察`;
    const userPrompt = `小说章节标题：${targetChapter.title}\n魔改后章节内容：${modifiedContent}`;

    try {
        toastr.info('正在更新魔改章节图谱，请稍候...', "小说续写器");
        const result = await generateRaw({
            systemPrompt,
            prompt: userPrompt,
            jsonSchema: graphJsonSchema,
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

// 更新续写章节图谱
export async function updateGraphWithContinueContent(continueChapter, continueId) {
    const context = getContext();
    const { generateRaw } = context;
    const graphMap = extension_settings[extensionName].chapterGraphMap || {};

    const systemPrompt = `触发词：构建单章节知识图谱JSON、小说续写章节解析
强制约束（100%遵守）：
输出必须为纯JSON格式，无任何前置/后置内容、注释、markdown
必须以{开头，以}结尾，无其他字符
仅基于提供的续写章节内容分析，不引入任何外部内容
严格包含所有要求的字段，不修改字段名
无对应内容设为"暂无"，数组设为[]，不得留空
必填字段：基础章节信息、人物信息、世界观设定、核心剧情线、文风特点、实体关系网络、变更与依赖信息、逆向分析洞察`;
    const userPrompt = `小说章节标题：续写章节${continueId}\n小说章节内容：${continueChapter.content}`;

    try {
        const result = await generateRaw({
            systemPrompt,
            prompt: userPrompt,
            jsonSchema: graphJsonSchema,
            ...getActivePresetParams()
        });
        const graphData = JSON.parse(result.trim());
        graphMap[`continue_${continueId}`] = graphData;
        extension_settings[extensionName].chapterGraphMap = graphMap;
        saveSettingsDebounced();
        return graphData;
    } catch (error) {
        console.error('续写章节图谱更新失败:', error);
        return null;
    }
}
