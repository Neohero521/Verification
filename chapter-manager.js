import { getContext } from "../../../extensions.js";
import { saveSettingsDebounced } from "../../../../script.js";
import { extensionName, presetChapterRegexList, defaultSettings } from "./constants.js";
import { state } from "./state.js";
import { removeBOM, renderCommandTemplate, updateProgress, setButtonDisabled } from "./utils.js";
import { NovelReader } from "./novel-reader.js";

// 按正则拆分小说为章节
export function splitNovelIntoChapters(novelText, regexSource) {
    try {
        const cleanText = removeBOM(novelText).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        const chapterRegex = new RegExp(regexSource, 'gm');
        const matches = [...cleanText.matchAll(chapterRegex)];
        const chapters = [];

        if (matches.length === 0) {
            return [{ id: 0, title: '全文', content: cleanText, hasGraph: false }];
        }

        for (let i = 0; i < matches.length; i++) {
            const start = matches[i].index + matches[i][0].length;
            const end = i < matches.length - 1 ? matches[i + 1].index : cleanText.length;
            const title = matches[i][0].trim();
            const content = cleanText.slice(start, end).trim();
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

// 自动匹配最优正则，按章节数排序
export function getSortedRegexList(novelText) {
    const cleanText = removeBOM(novelText).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const regexWithCount = presetChapterRegexList.map(item => {
        try {
            const regex = new RegExp(item.regex, 'gm');
            const matches = [...cleanText.matchAll(regex)];
            return { ...item, count: matches.length };
        } catch {
            return { ...item, count: 0 };
        }
    });
    return regexWithCount.sort((a, b) => b.count - a.count);
}

// 渲染章节列表
export function renderChapterList(chapters) {
    const $listContainer = $('#novel-chapter-list');
    const graphMap = extension_settings[extensionName].chapterGraphMap || {};
    if (chapters.length === 0) {
        $listContainer.html('请上传小说文件并点击「解析章节」');
        return;
    }
    chapters.forEach(chapter => {
        chapter.hasGraph = !!graphMap[chapter.id];
    });
    const listHtml = chapters.map((chapter) => `
        <div class="chapter-item">
            <label class="chapter-checkbox">
                <input type="checkbox" class="chapter-select" data-index="${chapter.id}">
                <span class="chapter-title">${chapter.title}</span>
            </label>
            <span class="text-sm ${chapter.hasGraph ? 'text-success' : 'text-muted'}">${chapter.hasGraph ? '已生成图谱' : '未生成图谱'}</span>
        </div>
    `).join('');
    $listContainer.html(listHtml);
}

// 渲染章节选择下拉框
export function renderChapterSelect(chapters) {
    const $select = $('#write-chapter-select');
    $('#write-chapter-content').val('').prop('readonly', true);
    $('#precheck-status').text("未执行").removeClass("status-success status-danger").addClass("status-default");
    $('#precheck-report').val('');
    $('#quality-result-block').hide();
    if (chapters.length === 0) {
        $select.html('请先解析章节');
        return;
    }
    const optionHtml = chapters.map(chapter => `<option value="${chapter.id}">${chapter.title}</option>`).join('');
    $select.html(`<option value="">请选择基准章节</option>${optionHtml}`);
}

// 批量发送章节到对话框
export async function sendChaptersBatch(chapters) {
    const context = getContext();
    const settings = extension_settings[extensionName];
    if (state.isSending) {
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
    state.isSending = true;
    state.stopSending = false;
    let successCount = 0;
    setButtonDisabled('#import-selected-btn, #import-all-btn', true);
    setButtonDisabled('#stop-send-btn', false);

    try {
        for (let i = 0; i < chapters.length; i++) {
            if (state.stopSending) break;
            const chapter = chapters[i];
            const command = renderCommandTemplate(settings.sendTemplate, currentCharName, chapter.content);
            await context.executeSlashCommandsWithOptions(command);
            successCount++;
            updateProgress('novel-import-progress', 'novel-import-status', i + 1, chapters.length, "发送进度");
            if (i < chapters.length - 1 && !state.stopSending) {
                await new Promise(resolve => setTimeout(resolve, settings.sendDelay));
            }
        }
        toastr.success(`发送完成！成功发送 ${successCount}/${chapters.length} 个章节`, "小说续写器");
    } catch (error) {
        console.error('发送失败:', error);
        toastr.error(`发送失败: ${error.message}`, "小说续写器");
    } finally {
        state.isSending = false;
        state.stopSending = false;
        updateProgress('novel-import-progress', 'novel-import-status', 0, 0);
        setButtonDisabled('#import-selected-btn, #import-all-btn, #stop-send-btn', false);
    }
}

// 获取选中的章节
export function getSelectedChapters() {
    const checkedInputs = document.querySelectorAll('.chapter-select:checked');
    const selectedIndexes = [...checkedInputs].map(input => parseInt(input.dataset.index));
    return selectedIndexes.map(index => state.currentParsedChapters.find(item => item.id === index)).filter(Boolean);
}

// 按字数拆分小说
export function splitNovelByWordCount(novelText, wordCount) {
    try {
        const cleanText = removeBOM(novelText).replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
        if (!cleanText) return [];
        const chapters = [];
        const totalLength = cleanText.length;
        let currentIndex = 0;
        let chapterId = 0;

        while (currentIndex < totalLength) {
            let endIndex = currentIndex + wordCount;
            if (endIndex < totalLength) {
                const nextLineIndex = cleanText.indexOf('\n', endIndex);
                if (nextLineIndex !== -1 && nextLineIndex - endIndex < 200) {
                    endIndex = nextLineIndex + 1;
                }
            }
            const content = cleanText.slice(currentIndex, endIndex).trim();
            if (content) {
                chapters.push({
                    id: chapterId,
                    title: `第${chapterId + 1}章（字数拆分）`,
                    content,
                    hasGraph: false
                });
                chapterId++;
            }
            currentIndex = endIndex;
        }
        toastr.success(`按字数拆分完成，共生成 ${chapters.length} 个章节`, "小说续写器");
        return chapters;
    } catch (error) {
        console.error('按字数拆分失败:', error);
        toastr.error('字数拆分失败，请检查输入的字数', "小说续写器");
        return [];
    }
}

// 渲染续写链条
export function renderContinueWriteChain(chain) {
    const $chainContainer = $('#continue-write-chain');
    const scrollTop = $chainContainer.scrollTop();
    if (chain.length === 0) {
        $chainContainer.html('暂无续写章节，生成续写内容后自动添加到此处');
        return;
    }
    const chainHtml = chain.map((chapter, index) => `
        <div class="continue-chapter-item">
            <div class="continue-chapter-title">续写章节 ${index + 1}</div>
            <textarea class="continue-chapter-content" data-chain-id="${chapter.id}" rows="8" placeholder="续写内容">${chapter.content}</textarea>
            <div class="btn-group-row btn-group-wrap">
                <button class="btn btn-sm btn-primary continue-write-btn" data-chain-id="${chapter.id}">基于此章继续续写</button>
                <button class="btn btn-sm btn-secondary continue-copy-btn" data-chain-id="${chapter.id}">复制内容</button>
                <button class="btn btn-sm btn-outline continue-send-btn" data-chain-id="${chapter.id}">发送到对话框</button>
                <button class="btn btn-sm btn-danger continue-delete-btn" data-chain-id="${chapter.id}">删除章节</button>
            </div>
        </div>
    `).join('');
    $chainContainer.html(chainHtml);
    $chainContainer.scrollTop(scrollTop);
    NovelReader.renderChapterList();
}
