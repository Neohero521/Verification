import { presetChapterRegexList, defaultSettings } from "./constants.js";

// 全局共享状态，完全对齐原代码的全局变量
export const state = {
    // 自动解析相关状态
    currentRegexIndex: 0,
    sortedRegexList: [...presetChapterRegexList],
    lastParsedText: "",

    // 核心业务状态
    currentParsedChapters: [],
    isGeneratingGraph: false,
    isGeneratingWrite: false,
    stopGenerateFlag: false,
    isSending: false,
    stopSending: false,
    continueWriteChain: [],
    continueChapterIdCounter: defaultSettings.continueChapterIdCounter,
    currentPrecheckResult: null,
    isInitialized: false
};
