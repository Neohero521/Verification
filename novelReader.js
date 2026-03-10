import { extension_settings, saveSettingsDebounced, state, defaultSettings } from './config.js';
import { debounce } from './utils.js';

export const NovelReader = {
    contentDom: null,
    drawerDom: null,
    isDrawerOpen: false,
    isScrolling: false,
    boundHandlers: {},

    init() {
        this.contentDom = document.getElementById("reader-content");
        this.drawerDom = document.getElementById("reader-chapter-drawer");
        
        if (!this.contentDom || !this.drawerDom) {
            console.error(`[${state.extensionName}] 阅读器DOM元素缺失`);
            return;
        }

        this.boundHandlers = {
            onScroll: debounce(this.handleScroll.bind(this), 100),
            onFontIncrease: this.handleFontIncrease.bind(this),
            onFontDecrease: this.handleFontDecrease.bind(this),
            onDrawerToggle: this.handleDrawerToggle.bind(this),
            onDrawerClose: this.handleDrawerClose.bind(this),
            onPrevChapter: this.handlePrevChapter.bind(this),
            onNextChapter: this.handleNextChapter.bind(this),
            onChapterClick: this.handleChapterClick.bind(this),
            onContinueChapterClick: this.handleContinueChapterClick.bind(this)
        };

        this.clearEvents();
        this.bindEvents();
        this.restoreReaderState();
        console.log(`[${state.extensionName}] 阅读器初始化完成`);
    },

    clearEvents() {
        this.contentDom?.removeEventListener("scroll", this.boundHandlers.onScroll);
        document.getElementById("reader-font-plus")?.removeEventListener("click", this.boundHandlers.onFontIncrease);
        document.getElementById("reader-font-minus")?.removeEventListener("click", this.boundHandlers.onFontDecrease);
        document.getElementById("reader-chapter-select-btn")?.removeEventListener("click", this.boundHandlers.onDrawerToggle);
        document.getElementById("reader-drawer-close")?.removeEventListener("click", this.boundHandlers.onDrawerClose);
        document.getElementById("reader-prev-chapter")?.removeEventListener("click", this.boundHandlers.onPrevChapter);
        document.getElementById("reader-next-chapter")?.removeEventListener("click", this.boundHandlers.onNextChapter);
        document.getElementById("reader-chapter-list")?.removeEventListener("click", ".reader-chapter-item", this.boundHandlers.onChapterClick);
        document.getElementById("reader-chapter-list")?.removeEventListener("click", ".reader-continue-chapter-item", this.boundHandlers.onContinueChapterClick);
    },

    bindEvents() {
        this.contentDom.addEventListener("scroll", this.boundHandlers.onScroll);
        document.getElementById("reader-font-plus").addEventListener("click", this.boundHandlers.onFontIncrease);
        document.getElementById("reader-font-minus").addEventListener("click", this.boundHandlers.onFontDecrease);
        document.getElementById("reader-chapter-select-btn").addEventListener("click", this.boundHandlers.onDrawerToggle);
        document.getElementById("reader-drawer-close").addEventListener("click", this.boundHandlers.onDrawerClose);
        document.getElementById("reader-prev-chapter").addEventListener("click", this.boundHandlers.onPrevChapter);
        document.getElementById("reader-next-chapter").addEventListener("click", this.boundHandlers.onNextChapter);
        document.getElementById("reader-chapter-list").addEventListener("click", ".reader-chapter-item", this.boundHandlers.onChapterClick);
        document.getElementById("reader-chapter-list").addEventListener("click", ".reader-continue-chapter-item", this.boundHandlers.onContinueChapterClick);
    },

    renderChapterList() {
        const listDom = document.getElementById("reader-chapter-list");
        const chapterCountEl = document.getElementById("reader-chapter-count");
        const originalChapters = state.currentParsedChapters || [];
        const continueChapters = state.continueWriteChain || [];
        const totalCount = originalChapters.length + continueChapters.length;

        chapterCountEl.textContent = `0/${totalCount}`;
        if (originalChapters.length === 0) {
            listDom.innerHTML = '<p class="empty-tip">暂无解析的章节，请先在「章节管理」中解析小说</p>';
            return;
        }

        let html = '';
        const settings = extension_settings.Always_remember_me;
        const currentId = settings.readerState.currentChapterId;
        const currentType = settings.readerState.currentChapterType;

        originalChapters.forEach(chapter => {
            const isActive = currentType === 'original' && currentId === chapter.id;
            html += `
                <div class="reader-chapter-item ${isActive ? 'active' : ''}" data-chapter-id="${chapter.id}" data-chapter-type="original">
                    ${chapter.title}
                </div>
            `;
        });

        if (continueChapters.length > 0) {
            html += `<div class="reader-chapter-branch">`;
            continueChapters.forEach((chapter, index) => {
                const isActive = currentType === 'continue' && currentId === chapter.id;
                html += `
                    <div class="reader-continue-chapter-item ${isActive ? 'active' : ''}" data-chapter-id="${chapter.id}" data-chapter-type="continue">
                        ${chapter.title} <span>续写</span>
                    </div>
                `;
            });
            html += `</div>`;
        }

        listDom.innerHTML = html;
        this.updateReaderFooter();
    },

    switchChapter(chapterId, chapterType = "original") {
        const settings = extension_settings.Always_remember_me;
        let targetChapter = null;

        if (chapterType === "original") {
            targetChapter = state.currentParsedChapters.find(item => item.id == chapterId);
        } else {
            targetChapter = state.continueWriteChain.find(item => item.id == chapterId);
        }

        if (!targetChapter) {
            toastr.warning('章节不存在', "小说续写器");
            return;
        }

        this.contentDom.innerHTML = targetChapter.content;
        this.contentDom.scrollTop = 0;
        document.getElementById("reader-current-chapter-title").innerText = targetChapter.title;

        settings.readerState.currentChapterId = chapterId;
        settings.readerState.currentChapterType = chapterType;
        saveSettingsDebounced();

        this.closeDrawer();
        this.renderChapterList();
        this.updateReaderFooter();
    },

    handleScroll() {
        if (this.isScrolling) return;

        const scrollTop = this.contentDom.scrollTop;
        const scrollHeight = this.contentDom.scrollHeight;
        const clientHeight = this.contentDom.clientHeight;
        const maxScroll = scrollHeight - clientHeight;
        const progress = Math.min(100, Math.max(0, (scrollTop / maxScroll) * 100));

        document.getElementById("reader-progress-fill").style.width = `${progress}%`;
        document.getElementById("reader-progress-text").innerText = `${Math.round(progress)}%`;

        const settings = extension_settings.Always_remember_me;
        const progressKey = `${settings.readerState.currentChapterType}_${settings.readerState.currentChapterId}`;
        settings.readerState.readProgress[progressKey] = scrollTop;
        saveSettingsDebounced();
    },

    handleFontIncrease() {
        const settings = extension_settings.Always_remember_me;
        let fontSize = settings.readerState.fontSize || 16;
        if (fontSize >= 24) {
            toastr.warning('字体已达最大尺寸', "小说续写器");
            return;
        }
        fontSize += 1;
        settings.readerState.fontSize = fontSize;
        this.contentDom.style.setProperty('--novel-reader-font-size', `${fontSize}px`);
        saveSettingsDebounced();
    },

    handleFontDecrease() {
        const settings = extension_settings.Always_remember_me;
        let fontSize = settings.readerState.fontSize || 16;
        if (fontSize <= 12) {
            toastr.warning('字体已达最小尺寸', "小说续写器");
            return;
        }
        fontSize -= 1;
        settings.readerState.fontSize = fontSize;
        this.contentDom.style.setProperty('--novel-reader-font-size', `${fontSize}px`);
        saveSettingsDebounced();
    },

    handleDrawerToggle() {
        this.isDrawerOpen ? this.closeDrawer() : this.openDrawer();
    },

    openDrawer() {
        this.drawerDom.classList.add('show');
        this.isDrawerOpen = true;
    },

    closeDrawer() {
        this.drawerDom.classList.remove('show');
        this.isDrawerOpen = false;
    },

    handleDrawerClose() {
        this.closeDrawer();
    },

    handlePrevChapter() {
        const settings = extension_settings.Always_remember_me;
        const currentId = settings.readerState.currentChapterId;
        const currentType = settings.readerState.currentChapterType;

        if (!currentId) {
            toastr.warning('请先选择章节', "小说续写器");
            return;
        }

        let prevId = null;
        let prevType = "original";

        if (currentType === "original") {
            const currentIndex = state.currentParsedChapters.findIndex(item => item.id == currentId);
            if (currentIndex <= 0) {
                toastr.warning('已经是第一章了', "小说续写器");
                return;
            }
            prevId = state.currentParsedChapters[currentIndex - 1].id;
        } else {
            const currentIndex = state.continueWriteChain.findIndex(item => item.id == currentId);
            if (currentIndex > 0) {
                prevId = state.continueWriteChain[currentIndex - 1].id;
                prevType = "continue";
            } else {
                const baseChapter = state.continueWriteChain[currentIndex].baseChapterId;
                prevId = baseChapter;
                prevType = "original";
            }
        }

        this.switchChapter(prevId, prevType);
    },

    handleNextChapter() {
        const settings = extension_settings.Always_remember_me;
        const currentId = settings.readerState.currentChapterId;
        const currentType = settings.readerState.currentChapterType;

        if (!currentId) {
            toastr.warning('请先选择章节', "小说续写器");
            return;
        }

        let nextId = null;
        let nextType = "original";

        if (currentType === "original") {
            const currentIndex = state.currentParsedChapters.findIndex(item => item.id == currentId);
            if (currentIndex < state.currentParsedChapters.length - 1) {
                nextId = state.currentParsedChapters[currentIndex + 1].id;
            } else if (state.continueWriteChain.length > 0) {
                nextId = state.continueWriteChain[0].id;
                nextType = "continue";
            } else {
                toastr.warning('已经是最后一章了', "小说续写器");
                return;
            }
        } else {
            const currentIndex = state.continueWriteChain.findIndex(item => item.id == currentId);
            if (currentIndex < state.continueWriteChain.length - 1) {
                nextId = state.continueWriteChain[currentIndex + 1].id;
                nextType = "continue";
            } else {
                toastr.warning('已经是最后一章了', "小说续写器");
                return;
            }
        }

        this.switchChapter(nextId, nextType);
    },

    handleChapterClick(e) {
        const chapterId = e.currentTarget.dataset.chapterId;
        this.switchChapter(chapterId, "original");
    },

    handleContinueChapterClick(e) {
        const chapterId = e.currentTarget.dataset.chapterId;
        this.switchChapter(chapterId, "continue");
    },

    updateReaderFooter() {
        const settings = extension_settings.Always_remember_me;
        const currentId = settings.readerState.currentChapterId;
        const currentType = settings.readerState.currentChapterType;

        let hasPrev = false;
        let hasNext = false;

        if (currentId) {
            if (currentType === "continue") {
                const currentIndex = state.continueWriteChain.findIndex(item => item.id == currentId);
                hasPrev = currentIndex > 0 || state.currentParsedChapters.length > 0;
                hasNext = currentIndex < state.continueWriteChain.length - 1;
            } else {
                const currentIndex = state.currentParsedChapters.findIndex(item => item.id == currentId);
                hasPrev = currentIndex > 0;
                hasNext = currentIndex < state.currentParsedChapters.length - 1 || state.continueWriteChain.length > 0;
            }
        }

        setButtonDisabled("#reader-prev-chapter", !hasPrev);
        setButtonDisabled("#reader-next-chapter", !hasNext);

        const totalCount = state.currentParsedChapters.length + state.continueWriteChain.length;
        let currentIndex = 0;
        if (currentType === "original") {
            currentIndex = state.currentParsedChapters.findIndex(item => item.id == currentId) + 1;
        } else {
            currentIndex = state.currentParsedChapters.length + state.continueWriteChain.findIndex(item => item.id == currentId) + 1;
        }
        document.getElementById("reader-chapter-count").textContent = `${currentIndex}/${totalCount}`;
    },

    restoreReaderState() {
        const settings = extension_settings.Always_remember_me;
        const readerState = settings.readerState || defaultSettings.readerState;

        this.contentDom.style.setProperty('--novel-reader-font-size', `${readerState.fontSize}px`);

        if (readerState.currentChapterId) {
            this.switchChapter(readerState.currentChapterId, readerState.currentChapterType);
            const progressKey = `${readerState.currentChapterType}_${readerState.currentChapterId}`;
            const savedScroll = readerState.readProgress[progressKey] || 0;
            setTimeout(() => {
                this.contentDom.scrollTop = savedScroll;
            }, 200);
        } else {
            this.contentDom.innerHTML = `<div class="reader-empty-tip">请从左侧目录选择章节开始阅读</div>`;
        }
    }
};
