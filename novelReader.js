import { extension_settings, extensionName, defaultSettings, saveSettingsDebounced, currentParsedChapters, continueWriteChain } from "./constants.js";
import { debounce } from "./utils.js";

// 小说阅读器核心模块（原有逻辑100%保留）
export const NovelReader = {
    currentChapterId: null,
    currentChapterType: "original",
    fontSize: 16,
    maxFontSize: 24,
    minFontSize: 12,
    isPageTurning: false,
    globalPageCooldown: false,
    isProgrammaticScroll: false,
    cooldownTime: 3000,
    scrollDebounceTime: 200,
    scrollDebounceTimer: null,
    safeScrollOffset: 350,
    pageTriggerThreshold: 250,

    debounce(func, delay) {
        return (...args) => {
            clearTimeout(this.scrollDebounceTimer);
            this.scrollDebounceTimer = setTimeout(() => {
                func.apply(this, args);
            }, delay);
        };
    },

    setGlobalCooldown() {
        this.globalPageCooldown = true;
        setTimeout(() => {
            this.globalPageCooldown = false;
        }, this.cooldownTime);
    },

    init() {
        this.bindEvents();
        this.restoreState();
    },

    bindEvents() {
        const fontMinus = document.getElementById("reader-font-minus");
        const fontPlus = document.getElementById("reader-font-plus");
        const chapterSelectBtn = document.getElementById("reader-chapter-select-btn");
        const drawerClose = document.getElementById("reader-drawer-close");
        const prevChapter = document.getElementById("reader-prev-chapter");
        const nextChapter = document.getElementById("reader-next-chapter");
        const contentWrap = document.querySelector(".reader-content-wrap");
        const contentEl = document.getElementById("reader-content");
        const drawerEl = document.getElementById("reader-chapter-drawer");

        fontMinus.removeEventListener("click", this.setFontSize.bind(this, this.fontSize - 1));
        fontPlus.removeEventListener("click", this.setFontSize.bind(this, this.fontSize + 1));
        chapterSelectBtn.removeEventListener("click", this.showChapterDrawer.bind(this));
        drawerClose.removeEventListener("click", this.hideChapterDrawer.bind(this));
        prevChapter.removeEventListener("click", this.loadPrevChapter.bind(this));
        nextChapter.removeEventListener("click", this.loadNextChapter.bind(this));

        fontMinus.addEventListener("click", (e) => {
            e.stopPropagation();
            this.setFontSize(this.fontSize - 1);
        });
        fontPlus.addEventListener("click", (e) => {
            e.stopPropagation();
            this.setFontSize(this.fontSize + 1);
        });
        chapterSelectBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            this.showChapterDrawer();
        });
        drawerClose.addEventListener("click", (e) => {
            e.stopPropagation();
            this.hideChapterDrawer();
        });
        prevChapter.addEventListener("click", (e) => {
            e.stopPropagation();
            this.loadPrevChapter();
        });
        nextChapter.addEventListener("click", (e) => {
            e.stopPropagation();
            this.loadNextChapter();
        });

        contentWrap.addEventListener("click", (e) => {
            if (e.target.closest(".reader-content") || e.target.closest(".reader-controls") || e.target.closest(".reader-footer") || e.target.closest(".reader-chapter-drawer") || e.target.closest(".btn")) {
                return;
            }
            this.toggleChapterDrawer();
        });

        contentEl.addEventListener("scroll", (e) => {
            if (this.isProgrammaticScroll) {
                e.stopPropagation();
                return;
            }
            e.stopPropagation();
            this.updateProgressOnly();
        }, { passive: true });

        contentEl.addEventListener("wheel", (e) => {
            e.stopPropagation();
        }, { passive: true });

        contentEl.addEventListener("touchmove", (e) => {
            e.stopPropagation();
        }, { passive: true });

        drawerEl.addEventListener("click", (e) => {
            e.stopPropagation();
            e.stopImmediatePropagation();
        });
        drawerEl.addEventListener("scroll", (e) => {
            e.stopPropagation();
        });
    },

    updateProgressOnly() {
        if (this.isPageTurning || this.isProgrammaticScroll) return;
        const contentEl = document.getElementById("reader-content");
        const progressEl = document.getElementById("reader-progress-fill");
        const progressTextEl = document.getElementById("reader-progress-text");
        const scrollTop = contentEl.scrollTop;
        const scrollHeight = contentEl.scrollHeight;
        const clientHeight = contentEl.clientHeight;
        const maxScrollTop = scrollHeight - clientHeight;

        if (maxScrollTop <= 0) {
            progressEl.style.width = '100%';
            progressTextEl.textContent = '100%';
            return;
        }

        const validScrollTop = Math.max(0, Math.min(scrollTop, maxScrollTop));
        const progress = Math.floor((validScrollTop / maxScrollTop) * 100);
        progressEl.style.width = `${progress}%`;
        progressTextEl.textContent = `${progress}%`;

        const progressKey = `${this.currentChapterType}_${this.currentChapterId}`;
        extension_settings[extensionName].readerState.readProgress[progressKey] = validScrollTop;
        saveSettingsDebounced();
    },

    renderChapterList() {
        const listContainer = document.getElementById("reader-chapter-list");
        const chapterCountEl = document.getElementById("reader-chapter-count");
        const totalChapterCount = currentParsedChapters.length + continueWriteChain.length;
        chapterCountEl.textContent = `0/${totalChapterCount}`;

        if (currentParsedChapters.length === 0) {
            listContainer.innerHTML = '暂无解析的章节，请先在「章节管理」中解析小说';
            return;
        }

        let listHtml = "";
        currentParsedChapters.forEach(chapter => {
            const continueChapters = continueWriteChain.filter(item => item.baseChapterId === chapter.id);
            const isActive = this.currentChapterType === 'original' && this.currentChapterId === chapter.id;
            listHtml += `<div class="reader-chapter-item ${isActive ? 'active' : ''}" data-chapter-id="${chapter.id}" data-chapter-type="original">${chapter.title}</div>`;
            if (continueChapters.length > 0) {
                listHtml += `<div class="reader-chapter-branch">`;
                continueChapters.forEach((continueChapter, index) => {
                    const isContinueActive = this.currentChapterType === 'continue' && this.currentChapterId === continueChapter.id;
                    listHtml += `<div class="reader-continue-chapter-item ${isContinueActive ? 'active' : ''}" data-chapter-id="${continueChapter.id}" data-chapter-type="continue"><span>✒️</span>续写章节 ${index + 1}</div>`;
                });
                listHtml += `</div>`;
            }
        });
        listContainer.innerHTML = listHtml;

        document.querySelectorAll(".reader-chapter-item, .reader-continue-chapter-item").forEach(item => {
            item.removeEventListener("click", this.chapterClickHandler.bind(this));
            item.addEventListener("click", this.chapterClickHandler.bind(this));
        });
    },

    chapterClickHandler(e) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        const chapterId = parseInt(e.currentTarget.dataset.chapterId);
        const chapterType = e.currentTarget.dataset.chapterType;
        this.loadChapter(chapterId, chapterType);
        this.hideChapterDrawer();
    },

    loadChapter(chapterId, chapterType = "original") {
        this.isPageTurning = true;
        this.globalPageCooldown = true;
        this.isProgrammaticScroll = true;
        const contentEl = document.getElementById("reader-content");
        const titleEl = document.getElementById("reader-current-chapter-title");
        const chapterCountEl = document.getElementById("reader-chapter-count");
        const totalChapterCount = currentParsedChapters.length + continueWriteChain.length;

        let chapterData = null;
        let chapterTitle = "";
        let chapterIndex = 0;

        if (chapterType === "original") {
            chapterData = currentParsedChapters.find(item => item.id === chapterId);
            if (!chapterData) {
                this.resetAllLocks();
                return;
            }
            chapterTitle = chapterData.title;
            chapterIndex = currentParsedChapters.findIndex(item => item.id === chapterId) + 1;
        } else {
            chapterData = continueWriteChain.find(item => item.id === chapterId);
            if (!chapterData) {
                this.resetAllLocks();
                return;
            }
            const baseChapter = currentParsedChapters.find(item => item.id === chapterData.baseChapterId);
            const continueIndex = continueWriteChain.filter(item => item.baseChapterId === chapterData.baseChapterId).findIndex(item => item.id === chapterId) + 1;
            chapterTitle = `${baseChapter?.title || '未知章节'} - 续写章节 ${continueIndex}`;
            chapterIndex = currentParsedChapters.length + continueWriteChain.findIndex(item => item.id === chapterId) + 1;
        }

        this.currentChapterId = chapterId;
        this.currentChapterType = chapterType;
        extension_settings[extensionName].readerState.currentChapterId = chapterId;
        extension_settings[extensionName].readerState.currentChapterType = chapterType;
        titleEl.textContent = chapterTitle;
        contentEl.textContent = chapterData.content;
        chapterCountEl.textContent = `${chapterIndex}/${totalChapterCount}`;

        const progressKey = `${chapterType}_${chapterId}`;
        const savedScrollTop = extension_settings[extensionName].readerState.readProgress[progressKey] || 0;

        requestAnimationFrame(() => {
            contentEl.scrollTop = savedScrollTop;
            requestAnimationFrame(() => {
                contentEl.scrollTop = savedScrollTop;
                setTimeout(() => {
                    contentEl.scrollTop = savedScrollTop;
                    this.isProgrammaticScroll = false;
                    this.isPageTurning = false;
                    setTimeout(() => {
                        this.globalPageCooldown = false;
                    }, 500);
                }, 200);
            });
        });

        this.renderChapterList();
        saveSettingsDebounced();
    },

    resetAllLocks() {
        this.isPageTurning = false;
        this.isProgrammaticScroll = false;
        setTimeout(() => {
            this.globalPageCooldown = false;
        }, 200);
    },

    loadNextChapter() {
        if (this.isPageTurning || this.globalPageCooldown || this.isProgrammaticScroll) {
            return;
        }
        this.isPageTurning = true;
        this.globalPageCooldown = true;
        this.isProgrammaticScroll = true;

        let nextChapterId = null;
        let nextChapterType = "original";

        if (this.currentChapterType === "original") {
            const currentIndex = currentParsedChapters.findIndex(item => item.id === this.currentChapterId);
            if (currentIndex < 0 || currentIndex >= currentParsedChapters.length - 1) {
                this.resetAllLocks();
                return;
            }
            nextChapterId = currentParsedChapters[currentIndex + 1].id;
            nextChapterType = "original";
        } else {
            const currentChapter = continueWriteChain.find(item => item.id === this.currentChapterId);
            if (!currentChapter) {
                this.resetAllLocks();
                return;
            }
            const sameBaseChapters = continueWriteChain.filter(item => item.baseChapterId === currentChapter.baseChapterId);
            const sameBaseIndex = sameBaseChapters.findIndex(item => item.id === this.currentChapterId);
            if (sameBaseIndex >= 0 && sameBaseIndex < sameBaseChapters.length - 1) {
                nextChapterId = sameBaseChapters[sameBaseIndex + 1].id;
                nextChapterType = "continue";
            } else {
                const baseChapterIndex = currentParsedChapters.findIndex(item => item.id === currentChapter.baseChapterId);
                if (baseChapterIndex < 0 || baseChapterIndex >= currentParsedChapters.length - 1) {
                    this.resetAllLocks();
                    return;
                }
                nextChapterId = currentParsedChapters[baseChapterIndex + 1].id;
                nextChapterType = "original";
            }
        }

        if (nextChapterId === null) {
            this.resetAllLocks();
            return;
        }

        this.loadChapter(nextChapterId, nextChapterType);
        setTimeout(() => {
            const contentEl = document.getElementById("reader-content");
            this.isProgrammaticScroll = true;
            contentEl.scrollTop = this.safeScrollOffset;
            requestAnimationFrame(() => {
                contentEl.scrollTop = this.safeScrollOffset;
                this.isProgrammaticScroll = false;
            });
        }, 300);
        this.setGlobalCooldown();
    },

    loadPrevChapter() {
        if (this.isPageTurning || this.globalPageCooldown || this.isProgrammaticScroll) {
            return;
        }
        this.isPageTurning = true;
        this.globalPageCooldown = true;
        this.isProgrammaticScroll = true;

        let prevChapterId = null;
        let prevChapterType = "original";

        if (this.currentChapterType === "original") {
            const currentIndex = currentParsedChapters.findIndex(item => item.id === this.currentChapterId);
            if (currentIndex <= 0) {
                this.resetAllLocks();
                return;
            }
            prevChapterId = currentParsedChapters[currentIndex - 1].id;
            prevChapterType = "original";
        } else {
            const currentChapter = continueWriteChain.find(item => item.id === this.currentChapterId);
            if (!currentChapter) {
                this.resetAllLocks();
                return;
            }
            const sameBaseChapters = continueWriteChain.filter(item => item.baseChapterId === currentChapter.baseChapterId);
            const sameBaseIndex = sameBaseChapters.findIndex(item => item.id === this.currentChapterId);
            if (sameBaseIndex > 0) {
                prevChapterId = sameBaseChapters[sameBaseIndex - 1].id;
                prevChapterType = "continue";
            } else {
                prevChapterId = currentChapter.baseChapterId;
                prevChapterType = "original";
            }
        }

        if (prevChapterId === null) {
            this.resetAllLocks();
            return;
        }

        this.loadChapter(prevChapterId, prevChapterType);
        setTimeout(() => {
            const contentEl = document.getElementById("reader-content");
            const maxScrollTop = contentEl.scrollHeight - contentEl.clientHeight;
            const targetScrollTop = Math.max(0, maxScrollTop - this.safeScrollOffset);
            this.isProgrammaticScroll = true;
            contentEl.scrollTop = targetScrollTop;
            requestAnimationFrame(() => {
                contentEl.scrollTop = targetScrollTop;
                this.isProgrammaticScroll = false;
            });
        }, 300);
        this.setGlobalCooldown();
    },

    setFontSize(size) {
        if (size < this.minFontSize || size > this.maxFontSize) return;
        this.isPageTurning = true;
        this.globalPageCooldown = true;
        this.isProgrammaticScroll = true;
        this.fontSize = size;
        const contentEl = document.getElementById("reader-content");
        contentEl.style.setProperty("--novel-reader-font-size", `${size}px`);
        setTimeout(() => {
            this.isProgrammaticScroll = false;
            this.isPageTurning = false;
            setTimeout(() => {
                this.globalPageCooldown = false;
            }, 300);
        }, 300);
        extension_settings[extensionName].readerState.fontSize = size;
        saveSettingsDebounced();
    },

    toggleChapterDrawer() {
        const drawer = document.getElementById("reader-chapter-drawer");
        drawer.classList.toggle("show");
    },

    showChapterDrawer() {
        document.getElementById("reader-chapter-drawer").classList.add("show");
    },

    hideChapterDrawer() {
        document.getElementById("reader-chapter-drawer").classList.remove("show");
    },

    restoreState() {
        const state = extension_settings[extensionName].readerState || defaultSettings.readerState;
        this.setFontSize(state.fontSize);
        this.currentChapterId = state.currentChapterId;
        this.currentChapterType = state.currentChapterType || "original";
    }
};
