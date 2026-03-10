import { extension_settings, saveSettingsDebounced, getContext, state, presetChapterRegexList, defaultSettings } from './config.js';
import { removeBOM, countWords, sleep, renderCommandTemplate, setButtonDisabled } from './utils.js';
import { NovelReader } from './novelReader.js';

// 获取排序后的正则列表
export function getSortedRegexList(novelText) {
    const cleanText = removeBOM(novelText);
    const sortedList = presetChapterRegexList.map(item => {
        try {
            const regex = new RegExp(item.regex, 'gm');
            const matches = cleanText.match(regex) || [];
            return { ...item, count: matches.length };
        } catch (error) {
            console.error(`正则匹配失败: ${item.name}`, error);
            return { ...item, count: 0 };
        }
    }).filter(item => item.count > 0).sort((a, b) => b.count - a.count);

    return sortedList.length > 0 ? sortedList : presetChapterRegexList;
}

// 按正则拆分章节
export function splitNovelIntoChapters(novelText, regexStr) {
    try {
        const cleanText = removeBOM(novelText).replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
        const chapterRegex = new RegExp(regexStr, 'gm');
        const matches = [...cleanText.matchAll(chapterRegex)];
        const chapters = [];

        if (matches.length === 0) {
            toastr.warning('未匹配到任何章节标题，将全文作为单章', "小说续写器");
            return [{
                id: Date.now(),
                title: "全文",
                content: cleanText,
                wordCount: countWords(cleanText),
                hasGraph: false
            }];
        }

        // 处理前置内容
        if (matches[0].index > 0) {
            const preContent = cleanText.slice(0, matches[0].index).trim();
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
            const start = match.index + title.length;
            const end = matches[i + 1] ? matches[i + 1].index : cleanText.length;
            const content = cleanText.slice(start, end).trim();

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

// 按字数拆分章节
export function splitNovelByWordCount(novelText, wordCount) {
    try {
        const cleanText = removeBOM(novelText).replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
        if (!cleanText) return [];

        const paragraphs = cleanText.split('\n').filter(p => p.trim());
        const chapters = [];
        let currentChapter = [];
        let currentWordCount = 0;
        let chapterId = 0;

        for (const paragraph of paragraphs) {
            const paraWordCount = countWords(paragraph);
            if (currentWordCount + paraWordCount > wordCount && currentChapter.length > 0) {
                chapters.push({
                    id: chapterId,
                    title: `第${chapterId + 1}章（字数拆分）`,
                    content: currentChapter.join('\n\n'),
                    wordCount: currentWordCount,
                    hasGraph: false
                });
                currentChapter = [paragraph];
                currentWordCount = paraWordCount;
                chapterId++;
            } else {
                currentChapter.push(paragraph);
                currentWordCount += paraWordCount;
            }
        }

        // 处理最后一章
        if (currentChapter.length > 0) {
            chapters.push({
                id: chapterId,
                title: `第${chapterId + 1}章（字数拆分）`,
                content: currentChapter.join('\n\n'),
                wordCount: currentWordCount,
                hasGraph: false
            });
        }

        toastr.success(`按字数拆分完成，共生成 ${chapters.length} 个章节`, "小说续写器");
        return chapters;
    } catch (error) {
        console.error('字数拆分失败:', error);
        toastr.error('字数拆分失败，请检查输入的字数', "小说续写器");
        return [];
    }
}

// 渲染章节列表
export function renderChapterList(chapters) {
    const listDom = document.getElementById("novel-chapter-list");
    const graphMap = extension_settings.Verification.chapterGraphMap || {};

    if (!chapters || chapters.length === 0) {
        listDom.innerHTML = '<p class="empty-tip">请上传小说文件并点击「解析章节」</p>';
        return;
    }

    chapters.forEach(chapter => {
        chapter.hasGraph = !!graphMap[chapter.id];
    });

    const html = chapters.map(chapter => `
        <div class="chapter-item">
            <label class="chapter-checkbox">
                <input type="checkbox" class="chapter-select" data-index="${chapter.id}">
                <span class="chapter-title">${chapter.title}</span>
            </label>
            <span class="text-sm ${chapter.hasGraph ? 'text-success' : 'text-muted'}">
                ${chapter.hasGraph ? '已生成图谱' : '未生成图谱'}
            </span>
            <span class="text-sm text-muted" style="margin-left: 12px;">${chapter.wordCount}字</span>
        </div>
    `).join('');

    listDom.innerHTML = html;
}

// 渲染章节下拉选择框
export function renderChapterSelect(chapters) {
    const selectDom = document.getElementById("write-chapter-select");
    $("#write-chapter-content").val('').prop('readonly', true);
    $("#precheck-status").text("未执行").removeClass("status-success status-danger").addClass("status-default");
    $("#precheck-report").val('');
    $("#quality-result-block").hide();

    if (!chapters || chapters.length === 0) {
        selectDom.innerHTML = '<option value="">请先解析章节</option>';
        return;
    }

    const optionHtml = chapters.map(chapter => 
        `<option value="${chapter.id}">${chapter.title}</option>`
    ).join('');
    selectDom.innerHTML = `<option value="">请选择基准章节</option>${optionHtml}`;
}

// 渲染续写链条
export function renderContinueWriteChain(chain) {
    const listDom = document.getElementById("continue-write-chain");
    const scrollTop = listDom.scrollTop;

    if (!chain || chain.length === 0) {
        listDom.innerHTML = '<p class="empty-tip">暂无续写章节，生成续写内容后自动添加到此处</p>';
        return;
    }

    const html = chain.map((chapter, index) => `
        <div class="continue-chapter-item">
            <div class="continue-chapter-title">${chapter.title}</div>
            <textarea class="continue-chapter-content" data-chain-id="${chapter.id}" rows="8" readonly>${chapter.content}</textarea>
            <div class="btn-group-row btn-group-wrap">
                <button class="btn btn-sm btn-primary continue-write-btn" data-chain-id="${chapter.id}">基于此章继续续写</button>
                <button class="btn btn-sm btn-secondary continue-copy-btn" data-chain-id="${chapter.id}">复制内容</button>
                <button class="btn btn-sm btn-outline continue-send-btn" data-chain-id="${chapter.id}">发送到对话框</button>
                <button class="btn btn-sm btn-danger continue-delete-btn" data-chain-id="${chapter.id}">删除章节</button>
            </div>
        </div>
    `).join('');

    listDom.innerHTML = html;
    listDom.scrollTop = scrollTop;
}

// 获取选中的章节
export function getSelectedChapters() {
    const selectedIds = $(".chapter-select:checked").map(function () {
        return $(this).data("index");
    }).get();

    if (selectedIds.length === 0) {
        toastr.warning('请先选择章节', "小说续写器");
        return [];
    }

    return state.currentParsedChapters.filter(chapter => selectedIds.includes(chapter.id));
}

// 批量发送章节
export async function sendChaptersBatch(chapters) {
    const context = getContext();
    const settings = extension_settings.Verification;
    const currentCharName = context.characters[context.characterId]?.name;

    if (state.isSending) {
        toastr.warning('正在发送中，请等待完成或停止发送', "小说续写器");
        return;
    }
    if (!chapters || chapters.length === 0) {
        toastr.warning('没有可发送的章节', "小说续写器");
        return;
    }
    if (!currentCharName) {
        toastr.error('请先选择一个聊天角色', "小说续写器");
        return;
    }

    state.isSending = true;
    state.stopSending = false;
    let successCount = 0;
    const totalCount = chapters.length;

    setButtonDisabled("#import-selected-btn, #import-all-btn", true);
    setButtonDisabled("#stop-send-btn", false);

    try {
        for (let i = 0; i < chapters.length; i++) {
            if (state.stopSending) break;

            const chapter = chapters[i];
            $("#novel-import-status").text(`正在发送：${chapter.title} (${i + 1}/${totalCount})`);
            $("#novel-import-progress").css('width', `${((i + 1) / totalCount) * 100}%`);

            const command = renderCommandTemplate(settings.sendTemplate, currentCharName, chapter.content);
            await context.executeSlashCommandsWithOptions(command);
            successCount++;

            if (i < chapters.length - 1 && !state.stopSending) {
                await sleep(settings.sendDelay);
            }
        }

        const message = state.stopSending 
            ? `发送已停止，成功发送${successCount}/${totalCount}个章节`
            : `全部${totalCount}个章节发送完成`;
        toastr.success(message, "小说续写器");
    } catch (error) {
        console.error('批量发送失败:', error);
        toastr.error(`发送失败：${error.message}，已成功发送${successCount}个章节`, "小说续写器");
    } finally {
        state.isSending = false;
        state.stopSending = false;
        setButtonDisabled("#import-selected-btn, #import-all-btn", false);
        setButtonDisabled("#stop-send-btn", true);
        $("#novel-import-status").text(state.stopSending ? "发送已停止" : "发送完成");
        $("#novel-import-progress").css('width', '0%');
    }
}

// 初始化抽屉状态
export function initDrawerToggle() {
    $('#novel-writer-panel').off('click', '.inline-drawer-header').on('click', '.inline-drawer-header', function(e) {
        e.preventDefault();
        e.stopPropagation();
        const $drawer = $(this).closest('.inline-drawer');
        $drawer.toggleClass('open');
        saveDrawerState();
    });
}

// 保存抽屉状态
export function saveDrawerState() {
    const drawerState = {};
    $('.inline-drawer').each(function() {
        const drawerId = $(this).attr('id');
        if (drawerId) {
            drawerState[drawerId] = $(this).hasClass('open');
        }
    });
    extension_settings.Verification.drawerState = drawerState;
    saveSettingsDebounced();
}

// 恢复抽屉状态
export function restoreDrawerState() {
    const savedState = extension_settings.Verification.drawerState || defaultSettings.drawerState;
    $('.inline-drawer').each(function() {
        const drawerId = $(this).attr('id');
        if (drawerId && savedState[drawerId] !== undefined) {
            $(this).toggleClass('open', savedState[drawerId]);
        }
    });
}

// 导出章节图谱
export function exportChapterGraphs() {
    const graphMap = extension_settings.Verification.chapterGraphMap || {};
    if (Object.keys(graphMap).length === 0) {
        toastr.warning('没有可导出的单章节图谱', "小说续写器");
        return;
    }

    const exportData = {
        exportTime: new Date().toISOString(),
        chapterCount: state.currentParsedChapters.length,
        chapterGraphMap: graphMap
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '小说章节图谱.json';
    a.click();
    URL.revokeObjectURL(url);
    toastr.success('单章节图谱已导出', "小说续写器");
}

// 导入章节图谱
export async function importChapterGraphs(file) {
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const importData = JSON.parse(removeBOM(event.target.result.trim()));
            if (!importData.chapterGraphMap || typeof importData.chapterGraphMap !== 'object') {
                throw new Error("图谱格式错误，缺少chapterGraphMap字段");
            }

            const existingMap = extension_settings.Verification.chapterGraphMap || {};
            const newMap = { ...existingMap, ...importData.chapterGraphMap };
            extension_settings.Verification.chapterGraphMap = newMap;
            saveSettingsDebounced();

            // 更新章节状态
            state.currentParsedChapters.forEach(chapter => {
                chapter.hasGraph = !!newMap[chapter.id];
            });

            renderChapterList(state.currentParsedChapters);
            NovelReader.renderChapterList();
            toastr.success(`成功导入${Object.keys(importData.chapterGraphMap).length}个章节图谱`, "小说续写器");
        } catch (error) {
            console.error('图谱导入失败:', error);
            toastr.error(`导入失败：${error.message}`, "小说续写器");
        } finally {
            $("#chapter-graph-file-upload").val('');
        }
    };
    reader.onerror = () => {
        toastr.error('文件读取失败', "小说续写器");
        $("#chapter-graph-file-upload").val('');
    };
    reader.readAsText(file, 'UTF-8');
}
