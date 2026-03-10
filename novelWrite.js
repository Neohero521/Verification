import {
    state, extension_settings, saveSettingsDebounced, generateRaw,
    getActivePresetParams, setButtonDisabled, countWords, sleep,
    NovelReader
} from './index.js';
import { updateGraphWithContinueContent } from './knowledgeGraph.js';

// 续写前置条件校验
export async function validateContinuePrecondition(chapterId, modifiedContent) {
    if (!chapterId || !modifiedContent) {
        toastr.error('请先选择基准章节并确认内容', "小说续写器");
        return;
    }

    const settings = extension_settings[state.extensionName];
    const mergedGraph = settings.mergedGraph;
    const chapterGraph = settings.chapterGraphMap?.[chapterId];
    const baseChapter = state.currentParsedChapters.find(item => item.id == chapterId);

    setButtonDisabled("#precheck-run-btn", true);
    $("#precheck-status").text("校验中...").removeClass("status-success status-danger").addClass("status-default");

    try {
        const systemPrompt = `
你是专业的小说续写前置校验专家，严格按照要求输出结构化的校验报告，不能有任何额外内容。
你的任务是校验续写的前置条件是否完备，分析基准章节内容和全量知识图谱，输出以下内容：
1.  基准章节核心信息提炼：提炼本章的核心剧情、人物状态、结尾悬念
2.  续写前置依赖校验：检查全量知识图谱是否包含续写所需的完整人设、设定、剧情脉络
3.  续写方向建议：基于本章结尾和全本剧情，给出3个具体的续写方向建议
4.  潜在风险预警：指出续写过程中需要注意的人设、设定、剧情一致性风险点
5.  最终校验结论：明确给出"通过"或"不通过"的校验结论，说明原因
`;
        const prompt = `
请基于以下信息，完成续写前置条件校验：
基准章节标题：${baseChapter?.title || '未知章节'}
基准章节内容：
${modifiedContent}
全量知识图谱：
${JSON.stringify(mergedGraph || {}, null, 2)}
基准章节单独图谱：
${JSON.stringify(chapterGraph?.data || {}, null, 2)}
`;

        const presetParams = getActivePresetParams();
        const result = await generateRaw({
            systemPrompt,
            prompt,
            ...presetParams,
            max_new_tokens: 3000
        });

        // 保存校验结果
        state.currentPrecheckResult = result;
        $("#precheck-report").val(result);
        settings.precheckReportText = result;

        // 判断校验结论
        const isPass = result.includes("校验结论：通过") || result.includes("最终结论：通过");
        if (isPass) {
            $("#precheck-status").text("通过").removeClass("status-default status-danger").addClass("status-success");
            settings.precheckStatus = "通过";
            toastr.success('续写前置校验通过', "小说续写器");
        } else {
            $("#precheck-status").text("不通过").removeClass("status-default status-success").addClass("status-danger");
            settings.precheckStatus = "不通过";
            toastr.warning('续写前置校验不通过，请查看报告', "小说续写器");
        }

        saveSettingsDebounced();
    } catch (error) {
        console.error('前置校验失败:', error);
        toastr.error(`前置校验失败：${error.message}`, "小说续写器");
        $("#precheck-status").text("校验失败").removeClass("status-default status-success").addClass("status-danger");
    } finally {
        setButtonDisabled("#precheck-run-btn", false);
    }
}

// 续写内容质量评估
export async function evaluateContinueQuality(continueContent, baseChapter, mergedGraph) {
    if (!continueContent || !baseChapter) return { isPass: false, score: 0, report: "缺少评估内容" };

    try {
        const systemPrompt = `
你是专业的小说续写质量评估专家，严格按照给定的JSON Schema输出，不能有任何额外内容，不能有markdown格式，必须是纯JSON。
你的任务是评估续写内容的质量，严格遵循以下评分标准：
1.  人设一致性（20分）：续写内容是否符合人物的性格、身份、行为逻辑，是否OOC
2.  设定合规性（20分）：续写内容是否符合小说的世界观、力量体系、社会设定，是否出现设定冲突
3.  剧情衔接度（20分）：续写内容是否和基准章节结尾无缝衔接，剧情推进是否自然合理
4.  文风匹配度（20分）：续写内容的叙事风格、语言节奏、对话特点是否和原文一致
5.  内容质量（20分）：续写内容是否有剧情张力、悬念设置、人物弧光，是否符合小说的整体调性
总分100分，80分以上为合格，必须严格按照Schema输出，不能有任何额外内容。
`;
        const prompt = `
请基于以下信息，评估续写内容的质量：
基准章节标题：${baseChapter.title}
基准章节结尾内容：
${baseChapter.content.slice(-500)}
全量知识图谱：
${JSON.stringify(mergedGraph || {}, null, 2)}
待评估的续写内容：
${continueContent}
`;

        const presetParams = getActivePresetParams();
        const result = await generateRaw({
            systemPrompt,
            prompt,
            jsonSchema: state.qualityEvaluateSchema,
            ...presetParams,
            max_new_tokens: 2000
        });

        // 解析结果
        const evaluateResult = JSON.parse(result.trim());
        return evaluateResult;
    } catch (error) {
        console.error('质量评估失败:', error);
        return {
            isPass: false,
            score: 0,
            report: `质量评估失败：${error.message}`,
            总分: 0
        };
    }
}

// 生成小说续写内容
export async function generateNovelWrite() {
    const settings = extension_settings[state.extensionName];
    const selectedChapterId = settings.selectedBaseChapterId;
    const modifiedContent = $("#write-chapter-content").val().trim();
    const mergedGraph = settings.mergedGraph;
    const enableQualityCheck = settings.enableQualityCheck;
    const targetWordCount = settings.writeWordCount || 2000;

    // 基础校验
    if (!selectedChapterId) {
        toastr.error('请先选择基准章节', "小说续写器");
        return;
    }
    if (!modifiedContent) {
        toastr.error('基准章节内容不能为空', "小说续写器");
        return;
    }
    if (settings.precheckStatus !== "通过") {
        toastr.warning('请先完成并通过续写前置校验', "小说续写器");
        return;
    }

    const baseChapter = state.currentParsedChapters.find(item => item.id == selectedChapterId);
    if (!baseChapter) {
        toastr.error('基准章节不存在', "小说续写器");
        return;
    }

    // 锁定按钮
    state.isGeneratingWrite = true;
    state.stopGenerateFlag = false;
    setButtonDisabled("#write-generate-btn, .continue-write-btn", true);
    setButtonDisabled("#write-stop-btn", false);
    $("#write-status").text("正在生成续写内容...");
    $("#write-content-preview").val("");

    try {
        // 构建提示词
        const systemPrompt = `
你是专业的小说续写作家，严格按照要求续写小说，不能有任何额外的说明内容，只输出续写的正文。
你的任务是基于基准章节的结尾、全量知识图谱，续写符合要求的小说内容，严格遵循以下规则：
1.  续写内容必须和基准章节的结尾无缝衔接，剧情推进自然合理，不能出现突兀的跳转
2.  续写内容必须严格符合全量知识图谱中的人设、世界观、设定、剧情脉络，绝对不能OOC，不能出现设定冲突
3.  续写内容的文风、叙事节奏、对话风格必须和原文完全一致，保持小说的整体调性
4.  续写内容必须有剧情张力，设置合理的悬念，推进人物弧光，符合小说的整体剧情走向
5.  续写内容的字数必须严格控制在${targetWordCount}字左右，误差不超过10%
6.  只输出续写的正文内容，不能有任何标题、说明、注释、markdown格式，不能有"续写内容："之类的前缀
7.  续写内容必须是中文，符合网络小说的写作规范，段落清晰，对话自然
`;
        const prompt = `
请基于以下信息，续写小说内容：
基准章节标题：${baseChapter.title}
基准章节完整内容：
${modifiedContent}
全量小说知识图谱（必须严格遵守）：
${JSON.stringify(mergedGraph || {}, null, 2)}
前置校验报告（参考续写方向建议）：
${state.currentPrecheckResult || ''}
`;

        // 调用生成API
        const presetParams = getActivePresetParams();
        const result = await generateRaw({
            systemPrompt,
            prompt,
            ...presetParams,
            max_new_tokens: Math.round(targetWordCount * 1.5)
        });

        if (state.stopGenerateFlag) {
            toastr.info('续写生成已停止', "小说续写器");
            return;
        }

        const continueContent = result.trim();
        const actualWordCount = countWords(continueContent);

        // 质量校验
        let evaluateResult = null;
        if (enableQualityCheck) {
            $("#write-status").text("正在进行质量评估...");
            evaluateResult = await evaluateContinueQuality(continueContent, baseChapter, mergedGraph);

            if (state.stopGenerateFlag) {
                toastr.info('续写生成已停止', "小说续写器");
                return;
            }

            // 不合格处理
            if (!evaluateResult.isPass) {
                $("#write-status").text(`生成完成，质量评估不通过（${evaluateResult.总分 || 0}分）`);
                $("#quality-result-block").show().find("textarea").val(evaluateResult.report);
                $("#write-content-preview").val(continueContent);
                settings.writeContentPreview = continueContent;
                settings.qualityResultShow = true;
                saveSettingsDebounced();

                toastr.warning(`续写生成完成，但质量评估不通过，得分${evaluateResult.总分 || 0}分`, "小说续写器");
                return;
            }
        }

        // 生成成功
        $("#write-status").text(evaluateResult ? `生成完成，质量评估通过（${evaluateResult.总分}分）` : "生成完成");
        $("#write-content-preview").val(continueContent);
        settings.writeContentPreview = continueContent;

        // 渲染质量报告
        if (evaluateResult) {
            $("#quality-result-block").show().find("textarea").val(evaluateResult.report);
            settings.qualityResultShow = true;
        }

        saveSettingsDebounced();
        toastr.success(`续写内容生成完成，共${actualWordCount}字`, "小说续写器");
    } catch (error) {
        console.error('续写生成失败:', error);
        toastr.error(`续写生成失败：${error.message}`, "小说续写器");
        $("#write-status").text("生成失败");
    } finally {
        // 解锁按钮
        state.isGeneratingWrite = false;
        state.stopGenerateFlag = false;
        setButtonDisabled("#write-generate-btn, .continue-write-btn", false);
        setButtonDisabled("#write-stop-btn", true);
    }
}

// 基于续写章节继续生成
export async function generateContinueWrite(baseChapter) {
    if (!baseChapter) return;

    const settings = extension_settings[state.extensionName];
    const mergedGraph = settings.mergedGraph;
    const enableQualityCheck = settings.enableQualityCheck;
    const targetWordCount = settings.writeWordCount || 2000;

    // 锁定按钮
    state.isGeneratingWrite = true;
    state.stopGenerateFlag = false;
    setButtonDisabled(".continue-write-btn", true);

    try {
        // 构建提示词
        const systemPrompt = `
你是专业的小说续写作家，严格按照要求续写小说，不能有任何额外的说明内容，只输出续写的正文。
你的任务是基于上一章续写内容、全量知识图谱，继续续写下一章内容，严格遵循以下规则：
1.  续写内容必须和上一章的结尾无缝衔接，剧情推进自然合理，不能出现突兀的跳转
2.  续写内容必须严格符合全量知识图谱中的人设、世界观、设定、剧情脉络，绝对不能OOC，不能出现设定冲突
3.  续写内容的文风、叙事节奏、对话风格必须和原文完全一致，保持小说的整体调性
4.  续写内容必须有剧情张力，设置合理的悬念，推进人物弧光，符合小说的整体剧情走向
5.  续写内容的字数必须严格控制在${targetWordCount}字左右，误差不超过10%
6.  只输出续写的正文内容，不能有任何标题、说明、注释、markdown格式，不能有"续写内容："之类的前缀
7.  续写内容必须是中文，符合网络小说的写作规范，段落清晰，对话自然
`;
        const prompt = `
请基于以下信息，续写小说的下一章内容：
上一章续写内容：
${baseChapter.content}
全量小说知识图谱（必须严格遵守）：
${JSON.stringify(mergedGraph || {}, null, 2)}
`;

        // 调用生成API
        const presetParams = getActivePresetParams();
        const result = await generateRaw({
            systemPrompt,
            prompt,
            ...presetParams,
            max_new_tokens: Math.round(targetWordCount * 1.5)
        });

        if (state.stopGenerateFlag) {
            toastr.info('续写生成已停止', "小说续写器");
            return;
        }

        const continueContent = result.trim();
        const actualWordCount = countWords(continueContent);
        const newChapterId = `continue_${state.continueChapterIdCounter++}`;
        const newChapter = {
            id: newChapterId,
            title: `续写第${state.continueChapterIdCounter - 1}章`,
            content: continueContent,
            wordCount: actualWordCount,
            baseChapterId: baseChapter.id,
            generateTime: Date.now()
        };

        // 质量校验
        if (enableQualityCheck) {
            const evaluateResult = await evaluateContinueQuality(continueContent, baseChapter, mergedGraph);
            if (!evaluateResult.isPass) {
                toastr.warning(`续写生成完成，但质量评估不通过，得分${evaluateResult.总分 || 0}分，已自动丢弃`, "小说续写器");
                return;
            }
        }

        // 保存到续写链条
        state.continueWriteChain.push(newChapter);
        settings.continueWriteChain = state.continueWriteChain;
        settings.continueChapterIdCounter = state.continueChapterIdCounter;
        saveSettingsDebounced();

        // 异步生成图谱
        updateGraphWithContinueContent(newChapter);
        // 刷新UI
        renderContinueWriteChain(state.continueWriteChain);
        NovelReader.renderChapterList();

        toastr.success(`续写章节生成完成，共${actualWordCount}字`, "小说续写器");
    } catch (error) {
        console.error('续写生成失败:', error);
        toastr.error(`续写生成失败：${error.message}`, "小说续写器");
    } finally {
        // 解锁按钮
        state.isGeneratingWrite = false;
        state.stopGenerateFlag = false;
        setButtonDisabled(".continue-write-btn", false);
    }
}

// 初始化续写链条事件
export function initContinueChainEvents() {
    $("#clear-chain-btn").off("click").on("click", function () {
        state.continueWriteChain = [];
        state.continueChapterIdCounter = 1;
        extension_settings[state.extensionName].continueWriteChain = state.continueWriteChain;
        extension_settings[state.extensionName].continueChapterIdCounter = state.continueChapterIdCounter;
        saveSettingsDebounced();
        renderContinueWriteChain(state.continueWriteChain);
        NovelReader.renderChapterList();
        toastr.success('已清空所有续写章节', "小说续写器");
    });
}
