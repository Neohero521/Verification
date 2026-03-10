import {
    state, extension_settings, saveSettingsDebounced, getContext,
    executeSlashCommandsWithOptions, renderCommandTemplate, setButtonDisabled,
    escapeRegExp, countWords, sleep
} from './index.js';

// 获取排序后的正则列表（按匹配数量排序）
export function getSortedRegexList(novelText) {
    const regexList = state.presetChapterRegexList;
    const sortedList = regexList.map(item => {
        try {
            const regex = new RegExp(item.regex, 'gm');
            const matches = novelText.match(regex) || [];
            return { ...item, count: matches.length };
        } catch (error) {
            console.error(`正则匹配失败: ${item.name}`, error);
            return { ...item, count: 0 };
        }
    }).filter(item => item.count > 0).sort((a, b) => b.count - a.count);

    return sortedList.length > 0 ? sortedList : regexList;
}

// 按正则拆分小说为章节
export function splitNovelIntoChapters(novelText, regexStr) {
    if (!novelText || !regexStr) return [];

    try {
        const regex = new RegExp(regexStr, 'gm');
        const matches = [...novelText.matchAll(regex)];
        const chapters = [];

        if (matches.length === 0) {
            toastr.warning('未匹配到任何章节标题，将全文作为单章', "小说续写器");
            return [{
                id: Date.now(),
                title: "全文",
                content: novelText.trim(),
                wordCount: countWords(novelText),
                hasGraph: false
            }];
        }

        // 处理前置内容
        if (matches[0].index > 0) {
            const preContent = novelText.slice(0, matches[0].index).trim();
            if (preContent) {
                chapters.push({
                    id: Date.now() + Math.random(),
                    title: "前言",
                    content: preContent,
                    wordCount: countWords(preContent),
                    hasGraph: false
                });
            }
        }

        // 拆分章节
        for (let i = 0; i < matches.length; i++) {
            const match = matches[i];
            const title = match[0].trim();
            const startIndex = match.index;
            const endIndex = matches[i + 1] ? matches[i + 1].index : novelText.length;
            const content = novelText.slice(startIndex + title.length, endIndex).trim();

            chapters.push({
                id: Date.now() + i,
                title: title,
                content: content,
                wordCount: countWords(content),
                hasGraph: false
            });
        }

        toastr.success(`成功解析到${chapters.length}个章节`, "小说续写器");
        return chapters;
    } catch (error) {
        console.error('章节解析失败:', error);
        toastr.error(`章节解析失败：${error.message}`, "小说续写器");
        return [];
    }
}

// 按字数拆分小说为章节
export function splitNovelByWordCount(novelText, wordCount) {
    if (!novelText || wordCount < 1000) return [];

    try {
        const text = novelText.trim();
        const totalWords = countWords(text);
        const chapterCount = Math.ceil(totalWords / wordCount);
        const chapters = [];

        // 按段落拆分，避免拆分句子
        const paragraphs = text.split(/\n+/).filter(p => p.trim());
        let currentChapter = [];
        let currentWordCount = 0;
        let chapterIndex = 1;

        for (const paragraph of paragraphs) {
            const paraWordCount = countWords(paragraph);
            if (currentWordCount + paraWordCount > wordCount && currentChapter.length > 0) {
                chapters.push({
                    id: Date.now() + chapterIndex,
                    title: `第${chapterIndex}章`,
                    content: currentChapter.join('\n\n'),
                    wordCount: currentWordCount,
                    hasGraph: false
                });
                currentChapter = [paragraph];
                currentWordCount = paraWordCount;
                chapterIndex++;
            } else {
                currentChapter.push(paragraph);
                currentWordCount += paraWordCount;
            }
        }

        // 处理最后一章
        if (currentChapter.length > 0) {
            chapters.push({
                id: Date.now() + chapterIndex,
                title: `第${chapterIndex}章`,
                content: currentChapter.join('\n\n'),
                wordCount: currentWordCount,
                hasGraph: false
            });
        }

        toastr.success(`成功按${wordCount}字/章拆分，共${chapters.length}章`, "小说续写器");
        return chapters;
    } catch (error) {
        console.error('字数拆分失败:', error);
        toastr.error(`字数拆分失败：${error.message}`, "小说续写器");
        return [];
    }
}

// 渲染章节列表
export function renderChapterList(chapters) {
    const listDom = document.getElementById("chapter-list");
    if (!listDom) return;

    if (!chapters || chapters.length === 0) {
        listDom.innerHTML = `<div class="empty-tip">暂无章节，请先上传并解析小说</div>`;
        return;
    }

    const graphMap = extension_settings[state.extensionName].chapterGraphMap || {};
    let html = '';

    chapters.forEach(chapter => {
        const hasGraph = !!graphMap[chapter.id];
        html += `
            <div class="chapter-item">
                <label class="chapter-checkbox">
                    <input type="checkbox" class="chapter-select" value="${chapter.id}">
                    <span class="chapter-title">${chapter.title}</span>
                </label>
                <div class="text-sm">
                    <span class="${hasGraph ? 'text-success' : 'text-muted'}">
                        ${hasGraph ? '已生成图谱' : '未生成图谱'}
                    </span>
                    <span class="text-muted" style="margin-left: 12px;">${chapter.wordCount}字</span>
                </div>
            </div>
        `;
    });

    listDom.innerHTML = html;
}

// 渲染章节下拉选择框
export function renderChapterSelect(chapters) {
    const selectDom = document.getElementById("write-chapter-select");
    if (!selectDom) return;

    if (!chapters || chapters.length === 0) {
        selectDom.innerHTML = `<option value="">暂无章节</option>`;
        return;
    }

    let html = `<option value="">请选择基准章节</option>`;
    chapters.forEach(chapter => {
        html += `<option value="${chapter.id}">${chapter.title}</option>`;
    });

    selectDom.innerHTML = html;
}

// 渲染续写链条列表
export function renderContinueWriteChain(chain) {
    const listDom = document.getElementById("continue-write-chain");
    if (!listDom) return;

    if (!chain || chain.length === 0) {
        listDom.innerHTML = `<div class="empty-tip">暂无续写章节，生成续写后将显示在这里</div>`;
        return;
    }

    let html = '';
    chain.forEach(chapter => {
        html += `
            <div class="continue-chapter-item">
                <div class="continue-chapter-title">${chapter.title}</div>
                <textarea class="continue-chapter-content" readonly>${chapter.content}</textarea>
                <div class="btn-group-row btn-group-wrap">
                    <button class="btn btn-sm btn-outline continue-copy-btn" data-chapter-id="${chapter.id}">复制内容</button>
                    <button class="btn btn-sm btn-outline continue-send-btn" data-chapter-id="${chapter.id}">发送到对话框</button>
                    <button class="btn btn-sm btn-primary continue-write-btn" data-chapter-id="${chapter.id}">基于本章续写</button>
                </div>
            </div>
        `;
    });

    listDom.innerHTML = html;

    // 绑定续写链条事件
    bindChainEvents();
}

// 绑定续写链条事件
function bindChainEvents() {
    const { generateContinueWrite } = await import('./novelWrite.js');

    // 复制按钮
    $("#continue-write-chain").off("click", ".continue-copy-btn").on("click", ".continue-copy-btn", async function (e) {
        const chapterId = $(this).data("chapter-id");
        const chapter = state.continueWriteChain.find(item => item.id == chapterId);
        if (!chapter) return;

        const success = await copyToClipboard(chapter.content);
        success ? toastr.success('续写内容已复制到剪贴板', "小说续写器") : toastr.error('复制失败', "小说续写器");
    });

    // 发送按钮
    $("#continue-write-chain").off("click", ".continue-send-btn").on("click", ".continue-send-btn", function (e) {
        const context = getContext();
        const chapterId = $(this).data("chapter-id");
        const chapter = state.continueWriteChain.find(item => item.id == chapterId);
        const currentCharName = context.characters[context.characterId]?.name;

        if (!chapter) {
            toastr.warning('章节不存在', "小说续写器");
            return;
        }
        if (!currentCharName) {
            toastr.error('请先选择一个聊天角色', "小说续写器");
            return;
        }

        const settings = extension_settings[state.extensionName];
        const command = renderCommandTemplate(settings.sendTemplate, currentCharName, chapter.content);
        executeSlashCommandsWithOptions(command).then(() => {
            toastr.success('续写内容已发送到对话框', "小说续写器");
        }).catch((error) => {
            toastr.error(`发送失败: ${error.message}`, "小说续写器");
        });
    });

    // 基于本章续写按钮
    $("#continue-write-chain").off("click", ".continue-write-btn").on("click", ".continue-write-btn", function (e) {
        const chapterId = $(this).data("chapter-id");
        const chapter = state.continueWriteChain.find(item => item.id == chapterId);
        if (!chapter) {
            toastr.warning('章节不存在', "小说续写器");
            return;
        }

        // 切换到续写标签页
        document.querySelector(`.panel-tab-item[data-tab="tab-write"]`).click();
        // 填充内容
        $("#write-chapter-content").val(chapter.content).prop('readonly', false);
        // 重置状态
        $("#precheck-status").text("未执行").removeClass("status-success status-danger").addClass("status-default");
        $("#precheck-report").val("");
        $("#write-content-preview").val("");
        $("#write-status").text("");
        $("#quality-result-block").hide();

        extension_settings[state.extensionName].selectedBaseChapterId = "";
        extension_settings[state.extensionName].precheckStatus = "未执行";
        extension_settings[state.extensionName].precheckReportText = "";
        extension_settings[state.extensionName].writeContentPreview = "";
        extension_settings[state.extensionName].qualityResultShow = false;
        saveSettingsDebounced();

        toastr.info(`已加载【${chapter.title}】作为续写基准`, "小说续写器");
    });
}

// 获取选中的章节
export function getSelectedChapters() {
    const selectedIds = $(".chapter-select:checked").map(function () {
        return $(this).val();
    }).get();

    if (selectedIds.length === 0) {
        toastr.warning('请先选择章节', "小说续写器");
        return [];
    }

    return state.currentParsedChapters.filter(chapter => selectedIds.includes(chapter.id.toString()));
}

// 批量发送章节到对话框
export async function sendChaptersBatch(chapters) {
    if (!chapters || chapters.length === 0) return;

    const context = getContext();
    const currentCharName = context.characters[context.characterId]?.name;
    const settings = extension_settings[state.extensionName];
    const sendDelay = settings.sendDelay || 100;

    if (!currentCharName) {
        toastr.error('请先选择一个聊天角色', "小说续写器");
        return;
    }

    // 锁定按钮
    state.isSending = true;
    state.stopSending = false;
    setButtonDisabled("#import-selected-btn, #import-all-btn", true);
    setButtonDisabled("#stop-send-btn", false);

    let successCount = 0;
    const totalCount = chapters.length;

    try {
        for (let i = 0; i < chapters.length; i++) {
            if (state.stopSending) break;

            const chapter = chapters[i];
            $("#novel-import-status").text(`正在发送：${chapter.title} (${i + 1}/${totalCount})`);
            $("#import-progress-fill").style.width = `${((i + 1) / totalCount) * 100}%`;

            // 渲染发送命令
            const command = renderCommandTemplate(settings.sendTemplate, currentCharName, chapter.content);
            await executeSlashCommandsWithOptions(command);
            successCount++;

            // 延迟发送，避免触发风控
            if (i < chapters.length - 1 && !state.stopSending) {
                await sleep(sendDelay);
            }
        }

        if (state.stopSending) {
            toastr.info(`发送已停止，成功发送${successCount}/${totalCount}个章节`, "小说续写器");
        } else {
            toastr.success(`全部${totalCount}个章节发送完成`, "小说续写器");
        }
    } catch (error) {
        console.error('批量发送失败:', error);
        toastr.error(`发送失败：${error.message}，已成功发送${successCount}个章节`, "小说续写器");
    } finally {
        // 解锁按钮
        state.isSending = false;
        state.stopSending = false;
        setButtonDisabled("#import-selected-btn, #import-all-btn", false);
        setButtonDisabled("#stop-send-btn", true);
        $("#novel-import-status").text(state.stopSending ? "发送已停止" : "发送完成");
    }
}
