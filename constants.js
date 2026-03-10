// 扩展基础信息（修复模板字符串反引号缺失）
export const extensionName = "Always_remember_me";
export const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;

// 预设章节拆分正则列表（修复正则转义错误，对齐最新源码）
export const presetChapterRegexList = [
    { name: "标准章节", regex: "^\\s*第\\s*[0-9零一二三四五六七八九十百千]+\\s*章.*$" },
    { name: "括号序号", regex: "^\\s*.*\\（[0-9零一二三四五六七八九十百千]+\\）.*$" },
    { name: "英文括号序号", regex: "^\\s*.*\\([0-9零一二三四五六七八九十百千]+\\).*$" },
    { name: "标准节", regex: "^\\s*第\\s*[0-9零一二三四五六七八九十百千]+\\s*节.*$" },
    { name: "卷+章", regex: "^\\s*卷\\s*[0-9零一二三四五六七八九十百千]+\\s*第\\s*[0-9零一二三四五六七八九十百千]+\\s*章.*$" },
    { name: "英文Chapter", regex: "^\\s*Chapter\\s*[0-9]+\\s*.*$" },
    { name: "标准话", regex: "^\\s*第\\s*[0-9零一二三四五六七八九十百千]+\\s*话.*$" },
    { name: "顿号序号", regex: "^\\s*[0-9零一二三四五六七八九十百千]+、.*$" },
    { name: "方括号序号", regex: "^\\s*【\\s*[0-9零一二三四五六七八九十百千]+\\s*】.*$" },
    { name: "圆点序号", regex: "^\\s*[0-9]+\\.\\s*.*$" },
    { name: "中文序号空格", regex: "^\\s*[零一二三四五六七八九十百千]+\\s+.*$" }
];

// 默认配置（修复正则转义错误，对齐最新源码）
export const defaultSettings = {
    chapterRegex: "^\\s*第\\s*[0-9零一二三四五六七八九十百千]+\\s*章.*$",
    sendTemplate: "/sendas name={{char}} {{pipe}}",
    sendDelay: 100,
    example_setting: false,
    chapterList: [],
    chapterGraphMap: {},
    mergedGraph: {},
    continueWriteChain: [],
    continueChapterIdCounter: 1,
    enableQualityCheck: true,
    precheckReport: {},
    drawerState: {
        "drawer-chapter-import": true,
        "drawer-graph": false,
        "drawer-write": false,
        "drawer-precheck": false
    },
    selectedBaseChapterId: "",
    writeContentPreview: "",
    graphValidateResultShow: false,
    qualityResultShow: false,
    precheckStatus: "未执行",
    precheckReportText: "",
    floatBallState: {
        position: { x: window.innerWidth - 90, y: window.innerHeight / 2 },
        isPanelOpen: false,
        activeTab: "tab-chapter"
    },
    readerState: {
        fontSize: 16,
        currentChapterId: null,
        currentChapterType: "original",
        readProgress: {}
    },
    enableAutoParentPreset: true
};
