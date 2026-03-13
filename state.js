// 全局共享状态，100%对齐原代码全局变量
export const state = {
    // 自动解析相关状态
    currentRegexIndex: 0,
    sortedRegexList: [],
    lastParsedText: "",
    // 全局状态缓存
    currentParsedChapters: [],
    isGeneratingGraph: false,
    isGeneratingWrite: false,
    stopGenerateFlag: false,
    isSending: false,
    stopSending: false,
    continueWriteChain: [],
    continueChapterIdCounter: 1,
    currentPrecheckResult: null,
    isInitialized: false,
    // 分批合并全局状态
    batchMergedGraphs: [],
    // 当前父级预设名缓存
    currentPresetName: "",
};
