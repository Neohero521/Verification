import { extension_settings, saveSettingsDebounced, getContext, state, graphJsonSchema, mergeGraphJsonSchema, qualityEvaluateSchema } from './config.js';
import { getActivePresetParams, setButtonDisabled, removeBOM, copyToClipboard, sleep } from './utils.js';
import { renderChapterList, NovelReader } from './chapterManager.js';

// 生成单章节图谱
export async function generateSingleChapterGraph(chapter) {
    const context = getContext();
    const { generateRaw } = context;

    const systemPrompt = `
你是专业的小说知识图谱构建专家，严格按照给定的JSON Schema输出，不能有任何额外内容，不能有markdown格式，必须是纯JSON。
你的任务是分析小说章节内容，构建精准、完整、结构化的知识图谱，严格遵循以下要求：
1.  所有字段必须严格匹配Schema，必填字段不能为空，数据类型必须完全符合要求
2.  所有信息必须完全来自章节内容，不能添加任何主观臆造的内容
3.  实体关系网络必须是三元组格式：[实体A, 关系, 实体B]，至少5条
4.  必须精准记录所有人物、设定、剧情、伏笔的变更，不能遗漏关键信息
5.  必须严格区分本章新增内容和已有内容，只记录本章相关的信息
`;
    const prompt = `
请分析以下小说章节内容，构建符合要求的知识图谱：
章节标题：${chapter.title}
章节内容：
${chapter.content}
`;

    try {
        const result = await generateRaw({
            systemPrompt,
            prompt,
            jsonSchema: graphJsonSchema,
            ...getActivePresetParams(),
            max_new_tokens: 4000
        });

        return JSON.parse(removeBOM(result.trim()));
    } catch (error) {
        console.error(`章节${chapter.title}图谱生成失败:`, error);
        toastr.error(`章节${chapter.title}图谱生成失败`, "小说续写器");
        return null;
    }
}

// 批量生成章节图谱
export async function generateChapterGraphBatch(chapters) {
    if (state.isGeneratingGraph) {
        toastr.warning('正在生成图谱中，请等待完成', "小说续写器");
        return;
    }
    if (!chapters || chapters.length === 0) {
        toastr.warning('没有可生成图谱的章节', "小说续写器");
        return;
    }

    state.isGeneratingGraph = true;
    state.stopGenerateFlag = false;
    let successCount = 0;
    const totalCount = chapters.length;
    const graphMap = extension_settings.Always_remember_me.chapterGraphMap || {};

    setButtonDisabled("#graph-single-btn, #graph-batch-btn, #graph-merge-btn", true);
    setButtonDisabled("#graph-stop-btn", false);

    try {
        for (let i = 0; i < chapters.length; i++) {
            if (state.stopGenerateFlag) break;

            const chapter = chapters[i];
            $("#graph-generate-status").text(`正在生成：${chapter.title} (${i + 1}/${totalCount})`);
            $("#graph-progress").css('width', `${((i + 1) / totalCount) * 100}%`);

            // 跳过已生成的图谱
            if (graphMap[chapter.id]) {
                successCount++;
                continue;
            }

            const graphData = await generateSingleChapterGraph(chapter);
            if (graphData) {
                graphMap[chapter.id] = graphData;
                chapter.hasGraph = true;
                successCount++;
            }

            if (i < chapters.length - 1 && !state.stopGenerateFlag) {
                await sleep(1000);
            }
        }

        extension_settings.Always_remember_me.chapterGraphMap = graphMap;
        extension_settings.Always_remember_me.chapterList = state.currentParsedChapters;
        saveSettingsDebounced();
        renderChapterList(state.currentParsedChapters);

        const message = state.stopGenerateFlag
            ? `生成已停止，成功生成${successCount}/${totalCount}个章节图谱`
            : `图谱生成完成！成功生成 ${successCount}/${totalCount} 个章节图谱`;
        toastr.success(message, "小说续写器");
    } catch (error) {
        console.error('批量生成图谱失败:', error);
        toastr.error(`图谱生成失败: ${error.message}`, "小说续写器");
    } finally {
        state.isGeneratingGraph = false;
        state.stopGenerateFlag = false;
        setButtonDisabled("#graph-single-btn, #graph-batch-btn, #graph-merge-btn", false);
        setButtonDisabled("#graph-stop-btn", true);
        $("#graph-generate-status").text(state.stopGenerateFlag ? "生成已停止" : "生成完成");
        $("#graph-progress").css('width', '0%');
    }
}

// 合并全量图谱
export async function mergeAllGraphs() {
    const context = getContext();
    const { generateRaw } = context;
    const graphMap = extension_settings.Always_remember_me.chapterGraphMap || {};
    const graphList = Object.values(graphMap);

    if (graphList.length === 0) {
        toastr.warning('没有可合并的章节图谱，请先生成图谱', "小说续写器");
        return;
    }

    setButtonDisabled("#graph-merge-btn", true);
    const systemPrompt = `
你是专业的小说全量知识图谱整合专家，严格按照给定的JSON Schema输出，不能有任何额外内容，不能有markdown格式，必须是纯JSON。
你的任务是将多个章节的分章知识图谱，合并为一个完整、连贯、无冲突的全小说知识图谱，严格遵循以下要求：
1.  所有字段必须严格匹配Schema，必填字段不能为空，数据类型必须完全符合要求
2.  必须整合所有章节的信息，按时间线梳理，保留最新的人设、设定、剧情状态
3.  必须解决不同章节之间的信息冲突，以最新章节的内容为准
4.  必须完整记录所有人物、设定、剧情、伏笔的演变过程，不能遗漏关键信息
5.  实体关系网络必须是三元组格式：[实体A, 关系, 实体B]，至少20条
6.  必须精准构建反向依赖图谱，明确每个章节的前置依赖节点
7.  必须完成全本逻辑自洽性校验，输出潜在矛盾预警
`;
    const prompt = `
请将以下${graphList.length}个章节的知识图谱，合并为完整的全小说知识图谱：
${JSON.stringify(graphList, null, 2)}
`;

    try {
        toastr.info('开始合并知识图谱，请稍候...', "小说续写器");
        const result = await generateRaw({
            systemPrompt,
            prompt,
            jsonSchema: mergeGraphJsonSchema,
            ...getActivePresetParams(),
            max_new_tokens: 8000
        });

        const mergedGraph = JSON.parse(removeBOM(result.trim()));
        extension_settings.Always_remember_me.mergedGraph = mergedGraph;
        saveSettingsDebounced();
        $("#merged-graph-preview").val(JSON.stringify(mergedGraph, null, 2));
        toastr.success('知识图谱合并完成！', "小说续写器");
        return mergedGraph;
    } catch (error) {
        console.error('图谱合并失败:', error);
        toastr.error(`图谱合并失败: ${error.message}`, "小说续写器");
        return null;
    } finally {
        setButtonDisabled("#graph-merge-btn", false);
    }
}

// 校验图谱合规性
export async function validateGraphCompliance() {
    const mergedGraph = extension_settings.Always_remember_me.mergedGraph || {};
    const fullRequiredFields = mergeGraphJsonSchema.value.required;
    const singleRequiredFields = graphJsonSchema.value.required;

    let isFullGraph = true;
    let missingFields = fullRequiredFields.filter(field => !Object.hasOwn(mergedGraph, field));

    if (missingFields.length > 0) {
        isFullGraph = false;
        missingFields = singleRequiredFields.filter(field => !Object.hasOwn(mergedGraph, field));
    }

    const graphString = JSON.stringify(mergedGraph, null, 2);
    const graphWordCount = graphString.length;
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
    extension_settings.Always_remember_me.graphValidateResultShow = true;
    saveSettingsDebounced();

    isPass ? toastr.success('图谱合规性校验通过', "小说续写器") : toastr.warning('图谱合规性校验不通过', "小说续写器");
    return isPass;
}

// 校验章节图谱状态
export async function validateChapterGraphStatus() {
    const graphMap = extension_settings.Always_remember_me.chapterGraphMap || {};
    if (state.currentParsedChapters.length === 0) {
        toastr.warning('请先上传小说文件并解析章节', "小说续写器");
        return;
    }

    let hasGraphCount = 0;
    let noGraphList = [];
    state.currentParsedChapters.forEach(chapter => {
        const hasGraph = !!graphMap[chapter.id];
        chapter.hasGraph = hasGraph;
        hasGraph ? hasGraphCount++ : noGraphList.push(chapter.title);
    });

    renderChapterList(state.currentParsedChapters);
    const totalCount = state.currentParsedChapters.length;
    let message = `图谱状态检验完成\n总章节数：${totalCount}\n已生成图谱：${hasGraphCount}个\n未生成图谱：${totalCount - hasGraphCount}个`;
    if (noGraphList.length > 0) {
        message += `\n\n未生成图谱的章节：\n${noGraphList.join('\n')}`;
    }

    noGraphList.length === 0 ? toastr.success(message, "小说续写器") : toastr.warning(message, "小说续写器");
}

// 更新魔改章节图谱
export async function updateModifiedChapterGraph(chapterId, modifiedContent) {
    const context = getContext();
    const { generateRaw } = context;
    const targetChapter = state.currentParsedChapters.find(item => item.id == chapterId);

    if (!targetChapter) {
        toastr.error('目标章节不存在', "小说续写器");
        return null;
    }
    if (!modifiedContent.trim()) {
        toastr.error('魔改后的章节内容不能为空', "小说续写器");
        return null;
    }

    const systemPrompt = `
你是专业的小说知识图谱构建专家，严格按照给定的JSON Schema输出，不能有任何额外内容，不能有markdown格式，必须是纯JSON。
你的任务是分析修改后的小说章节内容，构建对应的知识图谱，严格遵循以下要求：
1.  所有字段必须严格匹配Schema，必填字段不能为空，数据类型必须完全符合要求
2.  所有信息必须完全来自修改后的章节内容，不能添加任何主观臆造的内容
3.  必须精准记录修改后的人物、设定、剧情变更，不能遗漏关键信息
4.  实体关系网络必须是三元组格式：[实体A, 关系, 实体B]，至少5条
`;
    const prompt = `
小说章节标题：${targetChapter.title}
修改后的章节内容：
${modifiedContent}
`;

    try {
        toastr.info('正在更新魔改章节图谱，请稍候...', "小说续写器");
        const result = await generateRaw({
            systemPrompt,
            prompt,
            jsonSchema: graphJsonSchema,
            ...getActivePresetParams(),
            max_new_tokens: 4000
        });

        const graphData = JSON.parse(removeBOM(result.trim()));
        const graphMap = extension_settings.Always_remember_me.chapterGraphMap || {};
        graphMap[chapterId] = graphData;

        extension_settings.Always_remember_me.chapterGraphMap = graphMap;
        targetChapter.content = modifiedContent;
        extension_settings.Always_remember_me.chapterList = state.currentParsedChapters;
        saveSettingsDebounced();

        renderChapterList(state.currentParsedChapters);
        NovelReader.renderChapterList();
        toastr.success('魔改章节图谱更新完成！', "小说续写器");
        return graphData;
    } catch (error) {
        console.error('魔改章节图谱更新失败:', error);
        toastr.error(`魔改章节图谱更新失败: ${error.message}`, "小说续写器");
        return null;
    }
}

// 用续写内容更新图谱
export async function updateGraphWithContinueContent(chapter) {
    const context = getContext();
    const { generateRaw } = context;
    const graphMap = extension_settings.Always_remember_me.chapterGraphMap || {};

    const systemPrompt = `
你是专业的小说知识图谱构建专家，严格按照给定的JSON Schema输出，不能有任何额外内容，不能有markdown格式，必须是纯JSON。
你的任务是分析续写的小说章节内容，构建对应的知识图谱，严格遵循以下要求：
1.  所有字段必须严格匹配Schema，必填字段不能为空，数据类型必须完全符合要求
2.  所有信息必须完全来自续写内容，不能添加任何主观臆造的内容
3.  必须精准记录续写内容中的人物、设定、剧情变更，不能遗漏关键信息
4.  实体关系网络必须是三元组格式：[实体A, 关系, 实体B]，至少5条
`;
    const prompt = `
小说章节标题：${chapter.title}
小说章节内容：
${chapter.content}
`;

    try {
        const result = await generateRaw({
            systemPrompt,
            prompt,
            jsonSchema: graphJsonSchema,
            ...getActivePresetParams(),
            max_new_tokens: 4000
        });

        const graphData = JSON.parse(removeBOM(result.trim()));
        graphMap[chapter.id] = graphData;
        extension_settings.Always_remember_me.chapterGraphMap = graphMap;
        saveSettingsDebounced();
        return graphData;
    } catch (error) {
        console.error('续写章节图谱生成失败:', error);
        return null;
    }
}
