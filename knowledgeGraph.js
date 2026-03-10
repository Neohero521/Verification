import {
    state, extension_settings, saveSettingsDebounced, generateRaw,
    getActivePresetParams, setButtonDisabled, deepMerge, removeBOM,
    copyToClipboard, sleep
} from './index.js';

// 批量生成章节图谱
export async function generateChapterGraphBatch(chapters) {
    if (!chapters || chapters.length === 0) return;

    // 锁定按钮
    state.isGeneratingGraph = true;
    state.stopGenerateFlag = false;
    setButtonDisabled("#graph-single-btn, #graph-batch-btn, #graph-merge-btn", true);
    setButtonDisabled("#graph-stop-btn", false);

    let successCount = 0;
    const totalCount = chapters.length;
    const graphMap = extension_settings[state.extensionName].chapterGraphMap || {};
    const presetParams = getActivePresetParams();

    try {
        for (let i = 0; i < chapters.length; i++) {
            if (state.stopGenerateFlag) break;

            const chapter = chapters[i];
            $("#graph-generate-status").text(`正在生成：${chapter.title} (${i + 1}/${totalCount})`);
            $("#graph-progress-fill").style.width = `${((i + 1) / totalCount) * 100}%`;

            // 构建提示词
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

            // 调用生成API
            const result = await generateRaw({
                systemPrompt,
                prompt,
                jsonSchema: state.graphJsonSchema,
                ...presetParams,
                max_new_tokens: 4000
            });

            // 解析结果
            const graphData = JSON.parse(removeBOM(result.trim()));
            // 校验必填字段
            const requiredFields = state.graphJsonSchema.value.required;
            const hasAllFields = requiredFields.every(field => Object.hasOwn(graphData, field));
            if (!hasAllFields) {
                throw new Error(`图谱缺少必填字段，需要${requiredFields.join(', ')}`);
            }

            // 保存图谱
            graphMap[chapter.id] = {
                title: chapter.title,
                chapterId: chapter.id,
                generateTime: Date.now(),
                data: graphData
            };
            successCount++;

            // 同步到章节状态
            chapter.hasGraph = true;
        }

        // 保存到配置
        extension_settings[state.extensionName].chapterGraphMap = graphMap;
        saveSettingsDebounced();
        // 刷新章节列表
        renderChapterList(state.currentParsedChapters);

        if (state.stopGenerateFlag) {
            toastr.info(`生成已停止，成功生成${successCount}/${totalCount}个章节图谱`, "小说续写器");
        } else {
            toastr.success(`全部${totalCount}个章节图谱生成完成`, "小说续写器");
        }
    } catch (error) {
        console.error('图谱生成失败:', error);
        toastr.error(`图谱生成失败：${error.message}，已成功生成${successCount}个`, "小说续写器");
    } finally {
        // 解锁按钮
        state.isGeneratingGraph = false;
        state.stopGenerateFlag = false;
        setButtonDisabled("#graph-single-btn, #graph-batch-btn, #graph-merge-btn", false);
        setButtonDisabled("#graph-stop-btn", true);
        $("#graph-generate-status").text(state.stopGenerateFlag ? "生成已停止" : "生成完成");
    }
}

// 合并所有章节图谱为全量图谱
export async function mergeAllGraphs() {
    const graphMap = extension_settings[state.extensionName].chapterGraphMap || {};
    const graphList = Object.values(graphMap);

    if (graphList.length === 0) {
        toastr.warning('暂无可用的章节图谱，请先生成章节图谱', "小说续写器");
        return;
    }

    setButtonDisabled("#graph-merge-btn", true);
    $("#graph-generate-status").text("正在合并全量知识图谱...");

    try {
        // 按章节顺序排序
        const sortedGraphs = graphList.sort((a, b) => {
            const indexA = state.currentParsedChapters.findIndex(chapter => chapter.id == a.chapterId);
            const indexB = state.currentParsedChapters.findIndex(chapter => chapter.id == b.chapterId);
            return indexA - indexB;
        });

        // 构建合并提示词
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
请将以下${sortedGraphs.length}个章节的知识图谱，合并为完整的全小说知识图谱：
${JSON.stringify(sortedGraphs.map(item => item.data), null, 2)}
`;

        // 调用生成API
        const presetParams = getActivePresetParams();
        const result = await generateRaw({
            systemPrompt,
            prompt,
            jsonSchema: state.mergeGraphJsonSchema,
            ...presetParams,
            max_new_tokens: 8000
        });

        // 解析结果
        const mergedGraph = JSON.parse(removeBOM(result.trim()));
        // 校验必填字段
        const requiredFields = state.mergeGraphJsonSchema.value.required;
        const hasAllFields = requiredFields.every(field => Object.hasOwn(mergedGraph, field));
        if (!hasAllFields) {
            throw new Error(`全量图谱缺少必填字段，需要${requiredFields.join(', ')}`);
        }

        // 保存到配置
        extension_settings[state.extensionName].mergedGraph = mergedGraph;
        saveSettingsDebounced();
        // 渲染到页面
        $("#merged-graph-preview").val(JSON.stringify(mergedGraph, null, 2));

        toastr.success('全量知识图谱合并完成', "小说续写器");
    } catch (error) {
        console.error('图谱合并失败:', error);
        toastr.error(`图谱合并失败：${error.message}`, "小说续写器");
    } finally {
        setButtonDisabled("#graph-merge-btn", false);
        $("#graph-generate-status").text("合并完成");
    }
}

// 验证图谱合规性
export async function validateGraphCompliance() {
    const mergedGraph = extension_settings[state.extensionName].mergedGraph;
    if (!mergedGraph || Object.keys(mergedGraph).length === 0) {
        toastr.warning('请先合并全量知识图谱', "小说续写器");
        return;
    }

    setButtonDisabled("#graph-validate-btn", true);
    try {
        const systemPrompt = `
你是专业的小说知识图谱合规性校验专家，严格按照要求输出校验报告，不能有任何额外内容。
你的任务是校验全量小说知识图谱的完整性、一致性、逻辑自洽性，输出结构化的校验报告：
1.  完整性校验：检查所有必填字段是否完整，数据是否符合要求
2.  一致性校验：检查人设、设定、剧情是否前后一致，是否存在冲突
3.  逻辑自洽性校验：检查剧情逻辑是否通顺，伏笔是否有对应，依赖关系是否合理
4.  优化建议：针对存在的问题，给出具体的优化建议
`;
        const prompt = `
请校验以下全量小说知识图谱，输出详细的校验报告：
${JSON.stringify(mergedGraph, null, 2)}
`;

        const presetParams = getActivePresetParams();
        const result = await generateRaw({
            systemPrompt,
            prompt,
            ...presetParams,
            max_new_tokens: 2000
        });

        // 渲染结果
        $("#graph-validate-result").show().find("textarea").val(result);
        extension_settings[state.extensionName].graphValidateResultShow = true;
        saveSettingsDebounced();

        toastr.success('图谱合规性校验完成', "小说续写器");
    } catch (error) {
        console.error('图谱校验失败:', error);
        toastr.error(`图谱校验失败：${error.message}`, "小说续写器");
    } finally {
        setButtonDisabled("#graph-validate-btn", false);
    }
}

// 验证章节图谱状态
export async function validateChapterGraphStatus() {
    const chapters = state.currentParsedChapters;
    const graphMap = extension_settings[state.extensionName].chapterGraphMap || {};

    if (chapters.length === 0) {
        toastr.warning('暂无章节，请先解析小说', "小说续写器");
        return;
    }

    const totalCount = chapters.length;
    const hasGraphCount = chapters.filter(chapter => !!graphMap[chapter.id]).length;
    const missingCount = totalCount - hasGraphCount;

    let report = `章节图谱状态校验报告：
总章节数：${totalCount}
已生成图谱：${hasGraphCount}章
未生成图谱：${missingCount}章
`;

    if (missingCount > 0) {
        report += `\n未生成图谱的章节：\n`;
        chapters.filter(chapter => !graphMap[chapter.id]).forEach(chapter => {
            report += `- ${chapter.title}\n`;
        });
    }

    $("#precheck-report").val(report);
    extension_settings[state.extensionName].precheckReportText = report;
    saveSettingsDebounced();

    if (missingCount === 0) {
        $("#precheck-status").text("通过").removeClass("status-default status-danger").addClass("status-success");
        extension_settings[state.extensionName].precheckStatus = "通过";
        toastr.success('所有章节均已生成图谱', "小说续写器");
    } else {
        $("#precheck-status").text("不通过").removeClass("status-default status-success").addClass("status-danger");
        extension_settings[state.extensionName].precheckStatus = "不通过";
        toastr.warning(`有${missingCount}个章节未生成图谱`, "小说续写器");
    }
    saveSettingsDebounced();
}

// 导出章节图谱
export function exportChapterGraphs() {
    const graphMap = extension_settings[state.extensionName].chapterGraphMap || {};
    if (Object.keys(graphMap).length === 0) {
        toastr.warning('暂无可用的章节图谱', "小说续写器");
        return;
    }

    const exportData = {
        exportTime: new Date().toLocaleString(),
        chapterCount: Object.keys(graphMap).length,
        chapterGraphs: graphMap
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '小说章节图谱.json';
    a.click();
    URL.revokeObjectURL(url);

    toastr.success('章节图谱导出完成', "小说续写器");
}

// 导入章节图谱
export async function importChapterGraphs(file) {
    if (!file) return;

    try {
        const reader = new FileReader();
        reader.onload = (event) => {
            const importData = JSON.parse(removeBOM(event.target.result.trim()));
            if (!importData.chapterGraphs || typeof importData.chapterGraphs !== 'object') {
                throw new Error('图谱文件格式错误，缺少chapterGraphs字段');
            }

            const graphMap = extension_settings[state.extensionName].chapterGraphMap || {};
            let importCount = 0;

            // 合并图谱
            for (const chapterId in importData.chapterGraphs) {
                if (Object.prototype.hasOwnProperty.call(importData.chapterGraphs, chapterId)) {
                    graphMap[chapterId] = importData.chapterGraphs[chapterId];
                    importCount++;
                }
            }

            // 保存到配置
            extension_settings[state.extensionName].chapterGraphMap = graphMap;
            saveSettingsDebounced();
            // 刷新章节列表
            renderChapterList(state.currentParsedChapters);

            toastr.success(`成功导入${importCount}个章节图谱`, "小说续写器");
        };
        reader.onerror = () => {
            throw new Error('文件读取失败');
        };
        reader.readAsText(file, 'UTF-8');
    } catch (error) {
        console.error('图谱导入失败:', error);
        toastr.error(`图谱导入失败：${error.message}`, "小说续写器");
    } finally {
        $("#chapter-graph-file-upload").val('');
    }
}

// 更新修改后的章节图谱
export async function updateModifiedChapterGraph(chapterId, modifiedContent) {
    if (!chapterId || !modifiedContent) {
        toastr.error('章节ID和内容不能为空', "小说续写器");
        return;
    }

    const chapter = state.currentParsedChapters.find(item => item.id == chapterId);
    if (!chapter) {
        toastr.error('章节不存在', "小说续写器");
        return;
    }

    setButtonDisabled("#graph-update-modified-btn", true);
    try {
        const systemPrompt = `
你是专业的小说知识图谱构建专家，严格按照给定的JSON Schema输出，不能有任何额外内容，不能有markdown格式，必须是纯JSON。
你的任务是分析修改后的小说章节内容，更新对应的知识图谱，严格遵循以下要求：
1.  所有字段必须严格匹配Schema，必填字段不能为空，数据类型必须完全符合要求
2.  所有信息必须完全来自修改后的章节内容，不能添加任何主观臆造的内容
3.  必须精准记录修改后的人物、设定、剧情变更，不能遗漏关键信息
4.  实体关系网络必须是三元组格式：[实体A, 关系, 实体B]，至少5条
`;
        const prompt = `
请分析以下修改后的小说章节内容，构建更新后的知识图谱：
章节标题：${chapter.title}
修改后的章节内容：
${modifiedContent}
`;

        const presetParams = getActivePresetParams();
        const result = await generateRaw({
            systemPrompt,
            prompt,
            jsonSchema: state.graphJsonSchema,
            ...presetParams,
            max_new_tokens: 4000
        });

        // 解析结果
        const graphData = JSON.parse(removeBOM(result.trim()));
        const requiredFields = state.graphJsonSchema.value.required;
        const hasAllFields = requiredFields.every(field => Object.hasOwn(graphData, field));
        if (!hasAllFields) {
            throw new Error(`图谱缺少必填字段，需要${requiredFields.join(', ')}`);
        }

        // 保存图谱
        const graphMap = extension_settings[state.extensionName].chapterGraphMap || {};
        graphMap[chapterId] = {
            title: chapter.title,
            chapterId: chapterId,
            generateTime: Date.now(),
            data: graphData,
            isModified: true
        };
        extension_settings[state.extensionName].chapterGraphMap = graphMap;
        saveSettingsDebounced();

        // 刷新章节列表
        renderChapterList(state.currentParsedChapters);
        toastr.success('修改后的章节图谱已更新', "小说续写器");
    } catch (error) {
        console.error('图谱更新失败:', error);
        toastr.error(`图谱更新失败：${error.message}`, "小说续写器");
    } finally {
        setButtonDisabled("#graph-update-modified-btn", false);
    }
}

// 用续写内容更新图谱
export async function updateGraphWithContinueContent(chapter) {
    if (!chapter) return;

    try {
        const systemPrompt = `
你是专业的小说知识图谱构建专家，严格按照给定的JSON Schema输出，不能有任何额外内容，不能有markdown格式，必须是纯JSON。
你的任务是分析续写的小说章节内容，构建对应的知识图谱，严格遵循以下要求：
1.  所有字段必须严格匹配Schema，必填字段不能为空，数据类型必须完全符合要求
2.  所有信息必须完全来自续写内容，不能添加任何主观臆造的内容
3.  必须精准记录续写内容中的人物、设定、剧情变更，不能遗漏关键信息
4.  实体关系网络必须是三元组格式：[实体A, 关系, 实体B]，至少5条
`;
        const prompt = `
请分析以下续写的小说章节内容，构建对应的知识图谱：
章节标题：${chapter.title}
章节内容：
${chapter.content}
`;

        const presetParams = getActivePresetParams();
        const result = await generateRaw({
            systemPrompt,
            prompt,
            jsonSchema: state.graphJsonSchema,
            ...presetParams,
            max_new_tokens: 4000
        });

        // 解析结果
        const graphData = JSON.parse(removeBOM(result.trim()));
        const requiredFields = state.graphJsonSchema.value.required;
        const hasAllFields = requiredFields.every(field => Object.hasOwn(graphData, field));
        if (!hasAllFields) {
            throw new Error(`图谱缺少必填字段`);
        }

        // 保存图谱
        const graphMap = extension_settings[state.extensionName].chapterGraphMap || {};
        graphMap[chapter.id] = {
            title: chapter.title,
            chapterId: chapter.id,
            generateTime: Date.now(),
            data: graphData,
            isContinue: true
        };
        extension_settings[state.extensionName].chapterGraphMap = graphMap;
        saveSettingsDebounced();

        console.log(`[${state.extensionName}] 续写章节图谱生成完成: ${chapter.title}`);
    } catch (error) {
        console.error(`续写章节图谱生成失败:`, error);
    }
}
