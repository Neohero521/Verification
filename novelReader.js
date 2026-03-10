import {
    state, debounce, extension_settings, saveSettingsDebounced,
    getContext, lodash
} from './index.js';

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

        // 绑定事件处理器
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

        // 清除旧事件，避免重复绑定
        this.clearEvents();
        // 绑定新事件
        this.bindEvents();
        // 恢复阅读器状态
        this.restoreReaderState();

        console.log(`[${state.extensionName}] 阅读器初始化完成`);
    },

    clearEvents() {
        this.contentDom?.removeEventListener("scroll", this.boundHandlers.onScroll);
        document.getElementById("font-increase-btn")?.removeEventListener("click", this.boundHandlers.onFontIncrease);
        document.getElementById("font-decrease-btn")?.removeEventListener("click", this.boundHandlers.onFontDecrease);
        document.getElementById("reader-chapter-toggle")?.removeEventListener("click", this.boundHandlers.onDrawerToggle);
        document.getElementById("reader-drawer-close")?.removeEventListener("click", this.boundHandlers.onDrawerClose);
        document.getElementById("reader-prev-btn")?.removeEventListener("click", this.boundHandlers.onPrevChapter);
        document.getElementById("reader-next-btn")?.removeEventListener("click", this.boundHandlers.onNextChapter);
        document.getElementById("reader-chapter-list")?.removeEventListener("click", ".reader-chapter-item", this.boundHandlers.onChapterClick);
        document.getElementById("reader-chapter-list")?.removeEventListener("click", ".reader-continue-chapter-item", this.boundHandlers.onContinueChapterClick);
    },

    bindEvents() {
        this.contentDom.addEventListener("scroll", this.boundHandlers.onScroll);
        document.getElementById("font-increase-btn").addEventListener("click", this.boundHandlers.onFontIncrease);
        document.getElementById("font-decrease-btn").addEventListener("click", this.boundHandlers.onFontDecrease);
        document.getElementById("reader-chapter-toggle").addEventListener("click", this.boundHandlers.onDrawerToggle);
        document.getElementById("reader-drawer-close").addEventListener("click", this.boundHandlers.onDrawerClose);
        document.getElementById("reader-prev-btn").addEventListener("click", this.boundHandlers.onPrevChapter);
        document.getElementById("reader-next-btn").addEventListener("click", this.boundHandlers.onNextChapter);
        document.getElementById("reader-chapter-list").addEventListener("click", ".reader-chapter-item", this.boundHandlers.onChapterClick);
        document.getElementById("reader-chapter-list").addEventListener("click", ".reader-continue-chapter-item", this.boundHandlers.onContinueChapterClick);
    },

    // 渲染章节列表
    renderChapterList() {
        const listDom = document.getElementById("reader-chapter-list");
        if (!listDom) return;

        const originalChapters = state.currentParsedChapters || [];
        const continueChapters = state.continueWriteChain || [];
        let html = '';

        // 渲染原始章节
        originalChapters.forEach(chapter => {
            const isActive = extension_settings[state.extensionName].readerState.currentChapterId === chapter.id 
                && extension_settings[state.extensionName].readerState.currentChapterType === "original";
            html += `
                <div class="reader-chapter-item ${isActive ? 'active' : ''}" data-chapter-id="${chapter.id}" data-chapter-type="original">
                    ${chapter.title}
                </div>
            `;
        });

        // 渲染续写章节
        if (continueChapters.length > 0) {
            html += `<div class="reader-chapter-branch">`;
            continueChapters.forEach(chapter => {
                const isActive = extension_settings[state.extensionName].readerState.currentChapterId === chapter.id 
                    && extension_settings[state.extensionName].readerState.currentChapterType === "continue";
                html += `
                    <div class="reader-continue-chapter-item ${isActive ? 'active' : ''}" data-chapter-id="${chapter.id}" data-chapter-type="continue">
                        ${chapter.title} <span>续写</span>
                    </div>
                `;
            });
            html += `</div>`;
        }

        listDom.innerHTML = html || `<div class="empty-tip">暂无章节，请先导入小说</div>`;
        this.updateReaderFooter();
    },

    // 切换章节
    switchChapter(chapterId, chapterType = "original") {
        const settings = extension_settings[state.extensionName];
        let targetChapter = null;

        if (chapterType === "original") {
            targetChapter = state.currentParsedChapters.find(item => item.id == chapterId);
        } else {
            targetChapter = state.continueWriteChain.find(item => item.id == chapterId);
        }

        if (!targetChapter) {
            toastr.warning('章节不存在', "小说阅读器");
            return;
        }

        // 更新内容
        this.contentDom.innerHTML = targetChapter.content;
        // 滚动到顶部
        this.contentDom.scrollTop = 0;
        // 更新标题
        document.getElementById("reader-current-title").innerText = targetChapter.title;
        // 保存状态
        settings.readerState.currentChapterId = chapterId;
        settings.readerState.currentChapterType = chapterType;
        saveSettingsDebounced();
        // 关闭抽屉
        this.closeDrawer();
        // 高亮当前章节
        this.renderChapterList();
        // 更新底部进度
        this.updateReaderFooter();

        console.log(`[${state.extensionName}] 切换章节: ${targetChapter.title}`);
    },

    // 处理滚动事件
    handleScroll() {
        if (!this.contentDom || this.isScrolling) return;

        const scrollTop = this.contentDom.scrollTop;
        const scrollHeight = this.contentDom.scrollHeight;
        const clientHeight = this.contentDom.clientHeight;
        const progress = Math.min(100, Math.max(0, (scrollTop / (scrollHeight - clientHeight)) * 100));

        // 更新进度条
        document.getElementById("reader-progress-fill").style.width = `${progress}%`;
        document.getElementById("reader-progress-text").innerText = `${Math.round(progress)}%`;

        // 保存阅读进度
        const settings = extension_settings[state.extensionName];
        const currentChapterId = settings.readerState.currentChapterId;
        const currentChapterType = settings.readerState.currentChapterType;
        if (currentChapterId) {
            const progressKey = `${currentChapterType}_${currentChapterId}`;
            settings.readerState.readProgress[progressKey] = progress;
            saveSettingsDebounced();
        }
    },

    // 字体放大
    handleFontIncrease() {
        const settings = extension_settings[state.extensionName];
        let fontSize = settings.readerState.fontSize || 16;
        if (fontSize >= 24) {
            toastr.warning('字体已达最大尺寸', "小说阅读器");
            return;
        }
        fontSize += 1;
        settings.readerState.fontSize = fontSize;
        this.contentDom.style.setProperty('--novel-reader-font-size', `${fontSize}px`);
        saveSettingsDebounced();
    },

    // 字体缩小
    handleFontDecrease() {
        const settings = extension_settings[state.extensionName];
        let fontSize = settings.readerState.fontSize || 16;
        if (fontSize <= 12) {
            toastr.warning('字体已达最小尺寸', "小说阅读器");
            return;
        }
        fontSize -= 1;
        settings.readerState.fontSize = fontSize;
        this.contentDom.style.setProperty('--novel-reader-font-size', `${fontSize}px`);
        saveSettingsDebounced();
    },

    // 抽屉开关
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

    // 上一章
    handlePrevChapter() {
        const settings = extension_settings[state.extensionName];
        const currentId = settings.readerState.currentChapterId;
        const currentType = settings.readerState.currentChapterType;

        if (!currentId) {
            toastr.warning('请先选择章节', "小说阅读器");
            return;
        }

        // 续写章节跳上一章
        if (currentType === "continue") {
            const continueList = state.continueWriteChain;
            const currentIndex = continueList.findIndex(item => item.id == currentId);
            if (currentIndex > 0) {
                this.switchChapter(continueList[currentIndex - 1].id, "continue");
            } else if (state.currentParsedChapters.length > 0) {
                // 跳转到最后一章原始章节
                const lastOriginal = state.currentParsedChapters[state.currentParsedChapters.length - 1];
                this.switchChapter(lastOriginal.id, "original");
            }
            return;
        }

        // 原始章节跳上一章
        const originalList = state.currentParsedChapters;
        const currentIndex = originalList.findIndex(item => item.id == currentId);
        if (currentIndex > 0) {
            this.switchChapter(originalList[currentIndex - 1].id, "original");
        } else {
            toastr.warning('已经是第一章了', "小说阅读器");
        }
    },

    // 下一章
    handleNextChapter() {
        const settings = extension_settings[state.extensionName];
        const currentId = settings.readerState.currentChapterId;
        const currentType = settings.readerState.currentChapterType;

        if (!currentId) {
            toastr.warning('请先选择章节', "小说阅读器");
            return;
        }

        // 原始章节跳下一章
        if (currentType === "original") {
            const originalList = state.currentParsedChapters;
            const currentIndex = originalList.findIndex(item => item.id == currentId);
            if (currentIndex < originalList.length - 1) {
                this.switchChapter(originalList[currentIndex + 1].id, "original");
            } else if (state.continueWriteChain.length > 0) {
                // 跳转到第一章续写章节
                this.switchChapter(state.continueWriteChain[0].id, "continue");
            } else {
                toastr.warning('已经是最后一章了', "小说阅读器");
            }
            return;
        }

        // 续写章节跳下一章
        const continueList = state.continueWriteChain;
        const currentIndex = continueList.findIndex(item => item.id == currentId);
        if (currentIndex < continueList.length - 1) {
            this.switchChapter(continueList[currentIndex + 1].id, "continue");
        } else {
            toastr.warning('已经是最后一章了', "小说阅读器");
        }
    },

    // 章节点击事件
    handleChapterClick(e) {
        const chapterId = e.currentTarget.dataset.chapterId;
        this.switchChapter(chapterId, "original");
    },

    // 续写章节点击事件
    handleContinueChapterClick(e) {
        const chapterId = e.currentTarget.dataset.chapterId;
        this.switchChapter(chapterId, "continue");
    },

    // 更新底部按钮状态
    updateReaderFooter() {
        const settings = extension_settings[state.extensionName];
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

        setButtonDisabled("#reader-prev-btn", !hasPrev);
        setButtonDisabled("#reader-next-btn", !hasNext);
    },

    // 恢复阅读器状态
    restoreReaderState() {
        const settings = extension_settings[state.extensionName];
        const readerState = settings.readerState || state.defaultSettings.readerState;

        // 恢复字体大小
        this.contentDom.style.setProperty('--novel-reader-font-size', `${readerState.fontSize}px`);

        // 恢复当前章节
        if (readerState.currentChapterId) {
            this.switchChapter(readerState.currentChapterId, readerState.currentChapterType);
            // 恢复阅读进度
            const progressKey = `${readerState.currentChapterType}_${readerState.currentChapterId}`;
            const savedProgress = readerState.readProgress[progressKey] || 0;
            setTimeout(() => {
                const scrollHeight = this.contentDom.scrollHeight;
                const clientHeight = this.contentDom.clientHeight;
                this.contentDom.scrollTop = (savedProgress / 100) * (scrollHeight - clientHeight);
            }, 200);
        } else {
            this.contentDom.innerHTML = `<div class="reader-empty-tip">请从左侧目录选择章节开始阅读</div>`;
        }
    }
};
