# 🐛 小说续写系统 - Bug 报告与功能优化建议

**检查日期：** 2026-05-15  
**检查范围：** index.js, example.html, style.css  
**检查标准：** 错误处理、边界条件、性能、安全、功能完整性

---

## 🔴 一、严重 Bug (P0 - 必须立即修复)

### 1.1 JSON.parse 缺少错误处理

**文件：** index.js  
**严重程度：** 🔴 高

**问题位置：**

1. **第 1620 行 - batchMergeGraphs**
```javascript
const result = await generateRawWithBreakLimit({...});
const batchMergedGraph = JSON.parse(result.trim()); // ❌ 缺少 try-catch
```

2. **第 1873 行 - validateContinuePrecondition**
```javascript
const result = await generateRawWithBreakLimit({...});
const precheckResult = JSON.parse(result.trim()); // ❌ 缺少 try-catch
```

3. **第 1969 行 - updateGraphWithContinueContent**
```javascript
const result = await generateRawWithBreakLimit({...});
const graphData = JSON.parse(result.trim()); // ❌ 缺少 try-catch
```

**风险：**  
- 如果 API 返回的 JSON 格式不正确，会导致整个功能崩溃
- 错误不会被捕获，用户看不到友好的错误提示
- 可能导致数据丢失或状态不一致

**修复建议：**
```javascript
try {
    const batchMergedGraph = JSON.parse(result.trim());
} catch (parseError) {
    console.error('[小说续写插件] JSON解析失败:', parseError);
    throw new Error(`批次${batchNum}合并结果解析失败`);
}
```

---

### 1.2 缺少输入验证

**文件：** index.js  
**严重程度：** 🔴 高

**问题位置：**

```javascript
// 第 1581 行
const batchCount = parseInt($('#batch-merge-count').val()) || 50;
if (batchCount < 10 || batchCount > 100) {
    // 虽然有范围检查，但没有检查 NaN
}

// 第 1574 行
const graphList = sortedChapters.map(chapter => graphMap[chapter.id]).filter(Boolean);
// 如果 chapter.id 是 undefined，会导致问题
```

**修复建议：**
```javascript
const batchCountInput = $('#batch-merge-count').val();
const batchCount = parseInt(batchCountInput);

if (isNaN(batchCount) || batchCount < 10 || batchCount > 100) {
    toastr.error('每批合并数必须是10-100之间的数字', "小说续写器");
    return;
}

// 验证 chapter.id
if (typeof chapter.id === 'undefined') {
    console.warn('[小说续写插件] 章节ID缺失:', chapter);
    return null;
}
```

---

### 1.3 竞态条件风险

**文件：** index.js  
**严重程度：** 🔴 高

**问题代码：**
```javascript
// 第 605-606 行
finalParams.systemPrompt += `\n\n【重试修正】...`;
finalParams.temperature = Math.min((finalParams.temperature || 0.7) + 0.12, 1.2);
await new Promise(resolve => setTimeout(resolve, 1200));
```

**问题：**  
- 如果用户在重试期间点击停止，`finalParams` 已经被修改
- 下次重试会使用错误的 temperature 值
- 可能导致 API 调用失败后状态不一致

**修复建议：**
```javascript
// 保存原始参数
const originalTemperature = params.temperature || 0.7;
let currentTemperature = originalTemperature;

while (retryCount < MAX_RETRY_TIMES) {
    // ...
    if (retryCount < MAX_RETRY_TIMES) {
        const retrySystemPrompt = params.systemPrompt + 
            `\n\n【重试修正】上次错误：${error.message}。本次必须严格遵守所有强制规则。`;
        const retryTemperature = Math.min(currentTemperature + 0.12, 1.2);
        await new Promise(resolve => setTimeout(resolve, 1200));
    }
}
```

---

## 🟠 二、中等问题 (P1)

### 2.1 全局变量污染

**文件：** index.js  
**严重程度：** 🟠 中

**问题代码：**
```javascript
// 多个全局变量
let currentParsedChapters = [];
let continueWriteChain = [];
let mergedGraph = {};
let batchMergedGraphs = [];
let stopGenerateFlag = false;
let isGeneratingWrite = false;
let isGeneratingGraph = false;
let apiCallTimestamps = [];
```

**风险：**  
- 可能与其他扩展冲突
- 变量名可能与 SillyTavern 核心冲突
- 难以进行单元测试

**修复建议：**
```javascript
// 使用命名空间
const NovelWriterState = {
    chapters: [],
    chain: [],
    graph: {},
    batchGraphs: [],
    stopFlag: false,
    isWriting: false,
    isGraphGenerating: false,
    apiTimestamps: []
};

// 或者使用 IIFE
const NovelWriter = (function() {
    let chapters = [];
    let chain = [];
    // ...
    
    return {
        getChapters: () => chapters,
        setChapters: (c) => { chapters = c; }
    };
})();
```

---

### 2.2 缺少防抖处理

**文件：** index.js  
**严重程度：** 🟠 中

**问题代码：**
```javascript
// 第 780 行
window.onresize = debounce(this.resizeHandler.bind(this), 200);
```

**问题：**  
- 虽然窗口调整大小有防抖，但其他事件可能没有
- 比如 `input` 事件、滚动事件等
- 可能导致性能问题

**修复建议：**
```javascript
// 为输入框添加防抖
let inputDebounceTimer;
$('#chapter-regex-input').on('input', function() {
    clearTimeout(inputDebounceTimer);
    inputDebounceTimer = setTimeout(() => {
        // 处理输入
    }, 300);
});

// 为章节列表滚动添加节流
let scrollThrottleTimer;
$('.chapter-list').on('scroll', function() {
    if (!scrollThrottleTimer) {
        scrollThrottleTimer = setTimeout(() => {
            // 处理滚动
            scrollThrottleTimer = null;
        }, 100);
    }
});
```

---

### 2.3 资源泄漏风险

**文件：** index.js  
**严重程度：** 🟠 中

**问题代码：**
```javascript
// ReaderManager.bindEvents 中使用 cloneNode
elements.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
        const newEl = el.cloneNode(true);
        el.parentNode.replaceChild(newEl, el);
        // 旧的事件监听器丢失了，但也没有正确清理
    }
});
```

**修复建议：**
```javascript
// 使用 AbortController 或 jQuery 的 off() 方法
const bindReaderEvents = () => {
    const controller = new AbortController();
    
    $('#reader-font-minus').on('click.reader', handler, { signal: controller.signal });
    $('#reader-font-plus').on('click.reader', handler, { signal: controller.signal });
    
    return () => controller.abort();
};

// 或者在销毁时清理
const destroyReader = () => {
    $('#reader-font-minus').off('click.reader');
    $('#reader-font-plus').off('click.reader');
    // ...
};
```

---

### 2.4 缺少撤销/重做功能

**严重程度：** 🟠 中

**问题：**  
- 章节编辑、图谱修改等操作无法撤销
- 用户可能误操作导致数据丢失

**优化建议：**
```javascript
// 实现简单的撤销栈
class UndoManager {
    constructor(maxSize = 50) {
        this.stack = [];
        this.maxSize = maxSize;
    }
    
    push(action) {
        this.stack.push(action);
        if (this.stack.length > this.maxSize) {
            this.stack.shift();
        }
    }
    
    undo() {
        const action = this.stack.pop();
        if (action && action.undo) {
            action.undo();
        }
    }
}

const undoManager = new UndoManager();

// 使用示例
function updateChapterContent(chapterId, newContent) {
    const chapter = currentParsedChapters.find(c => c.id === chapterId);
    const oldContent = chapter.content;
    
    undoManager.push({
        do: () => {
            chapter.content = newContent;
            renderChapterList();
        },
        undo: () => {
            chapter.content = oldContent;
            renderChapterList();
        }
    });
    
    chapter.content = newContent;
    renderChapterList();
}
```

---

## 🟡 三、优化建议 (P2)

### 3.1 代码重复 - 提取通用函数

**文件：** index.js  
**严重程度：** 🟡 低

**问题代码：**  
多个函数有相似的 try-catch-finally 结构：
```javascript
// batchMergeGraphs
try { ... }
catch (error) { ... }
finally { ... }

// updateGraphWithContinueContent
try { ... }
catch (error) { ... }
```

**优化建议：**
```javascript
/**
 * 包装异步操作，自动处理错误
 * @param {Function} asyncFn - 异步函数
 * @param {Object} options - 配置选项
 * @returns {Promise}
 */
async function withErrorHandler(asyncFn, options = {}) {
    const {
        errorMessage = '操作失败',
        successMessage = null,
        finallyCallback = null,
        title = '小说续写器'
    } = options;
    
    try {
        const result = await asyncFn();
        if (successMessage) {
            toastr.success(successMessage, title);
        }
        return result;
    } catch (error) {
        console.error(`[${title}] ${errorMessage}:`, error);
        toastr.error(`${errorMessage}: ${error.message}`, title);
        throw error;
    } finally {
        if (finallyCallback) {
            finallyCallback();
        }
    }
}

// 使用示例
await withErrorHandler(
    async () => {
        const result = await generateRawWithBreakLimit({...});
        return JSON.parse(result.trim());
    },
    {
        errorMessage: '批次合并失败',
        successMessage: '批次合并成功',
        finallyCallback: () => {
            isGeneratingGraph = false;
            stopGenerateFlag = false;
        }
    }
);
```

---

### 3.2 性能优化 - 虚拟滚动

**严重程度：** 🟡 低

**问题：**  
章节列表可能包含大量章节，渲染所有 DOM 会导致性能问题。

**优化建议：**
```javascript
/**
 * 简单的虚拟滚动实现
 */
class VirtualScroll {
    constructor(container, items, itemHeight = 60) {
        this.container = container;
        this.items = items;
        this.itemHeight = itemHeight;
        this.visibleItems = 10; // 可见项数量
        this.scrollTop = 0;
        
        this.setup();
    }
    
    setup() {
        this.container.style.height = `${this.items.length * this.itemHeight}px`;
        this.render();
        
        this.container.parentElement.addEventListener('scroll', () => {
            this.scrollTop = this.container.parentElement.scrollTop;
            this.render();
        });
    }
    
    render() {
        const startIndex = Math.floor(this.scrollTop / this.itemHeight);
        const endIndex = Math.min(startIndex + this.visibleItems + 2, this.items.length);
        
        const visibleItems = this.items.slice(startIndex, endIndex);
        const offsetY = startIndex * this.itemHeight;
        
        this.container.innerHTML = visibleItems.map(item => 
            this.renderItem(item)
        ).join('');
        
        this.container.style.transform = `translateY(${offsetY}px)`;
    }
    
    renderItem(item) {
        // 返回单个列表项的 HTML
        return `<div class="chapter-item" style="height: ${this.itemHeight}px">
            ${item.title}
        </div>`;
    }
}
```

---

### 3.3 用户体验优化 - 快捷键支持

**严重程度：** 🟡 低

**优化建议：**
```javascript
/**
 * 添加快捷键支持
 */
const KeyboardShortcuts = {
    shortcuts: new Map(),
    
    register(key, handler, description = '') {
        this.shortcuts.set(key, { handler, description });
    },
    
    handle(e) {
        const key = this.getKeyString(e);
        const shortcut = this.shortcuts.get(key);
        
        if (shortcut) {
            e.preventDefault();
            shortcut.handler();
        }
    },
    
    getKeyString(e) {
        const parts = [];
        if (e.ctrlKey) parts.push('ctrl');
        if (e.shiftKey) parts.push('shift');
        if (e.altKey) parts.push('alt');
        parts.push(e.key.toLowerCase());
        return parts.join('+');
    },
    
    showHelp() {
        const help = Array.from(this.shortcuts.entries())
            .map(([key, { description }]) => `${key}: ${description}`)
            .join('\n');
        toastr.info(`快捷键帮助:\n${help}`, '键盘快捷键');
    }
};

// 注册快捷键
KeyboardShortcuts.register('ctrl+s', () => {
    saveSettingsDebounced();
    toastr.success('设置已保存', '小说续写器');
}, '保存设置');

KeyboardShortcuts.register('ctrl+z', () => {
    undoManager.undo();
}, '撤销');

KeyboardShortcuts.register('ctrl+shift+z', () => {
    undoManager.redo();
}, '重做');

KeyboardShortcuts.register('escape', () => {
    FloatBall.hidePanel();
}, '关闭面板');

KeyboardShortcuts.register('?', () => {
    KeyboardShortcuts.showHelp();
}, '显示帮助');

// 在初始化时启用
document.addEventListener('keydown', KeyboardShortcuts.handle.bind(KeyboardShortcuts));
```

---

### 3.4 数据持久化优化 - 自动保存草稿

**严重程度：** 🟡 低

**优化建议：**
```javascript
/**
 * 自动保存草稿功能
 */
const DraftManager = {
    draftKey: 'novel_writer_draft',
    autoSaveTimer: null,
    autoSaveInterval: 30000, // 30秒自动保存
    
    init() {
        this.loadDraft();
        this.startAutoSave();
        
        // 监听输入变化
        $('textarea, input[type="text"]').on('input', () => {
            this.scheduleAutoSave();
        });
    },
    
    saveDraft() {
        const draft = {
            timestamp: Date.now(),
            content: {
                chapters: currentParsedChapters,
                chain: continueWriteChain,
                graph: mergedGraph
            }
        };
        
        try {
            localStorage.setItem(this.draftKey, JSON.stringify(draft));
            console.log('[DraftManager] 草稿已保存');
        } catch (error) {
            console.error('[DraftManager] 保存草稿失败:', error);
        }
    },
    
    loadDraft() {
        try {
            const draft = JSON.parse(localStorage.getItem(this.draftKey));
            if (draft && Date.now() - draft.timestamp < 24 * 60 * 60 * 1000) { // 24小时内
                const shouldRestore = confirm('发现未保存的草稿，是否恢复？');
                if (shouldRestore) {
                    currentParsedChapters = draft.content.chapters;
                    continueWriteChain = draft.content.chain;
                    mergedGraph = draft.content.graph;
                    renderChapterList();
                    toastr.success('草稿已恢复', '小说续写器');
                }
            }
        } catch (error) {
            console.error('[DraftManager] 加载草稿失败:', error);
        }
    },
    
    clearDraft() {
        localStorage.removeItem(this.draftKey);
    },
    
    scheduleAutoSave() {
        clearTimeout(this.autoSaveTimer);
        this.autoSaveTimer = setTimeout(() => {
            this.saveDraft();
        }, this.autoSaveInterval);
    },
    
    startAutoSave() {
        setInterval(() => {
            this.saveDraft();
        }, this.autoSaveInterval);
    }
};
```

---

### 3.5 调试功能优化 - 开发者模式

**严重程度：** 🟡 低

**优化建议：**
```javascript
/**
 * 开发者模式
 */
const DevMode = {
    enabled: false,
    
    toggle() {
        this.enabled = !this.enabled;
        
        if (this.enabled) {
            this.enable();
        } else {
            this.disable();
        }
        
        toastr.info(
            `开发者模式: ${this.enabled ? '开启' : '关闭'}`,
            '小说续写器'
        );
    },
    
    enable() {
        // 显示调试信息
        $('<div id="dev-panel"></div>')
            .css({
                position: 'fixed',
                bottom: '10px',
                left: '10px',
                background: 'rgba(0,0,0,0.8)',
                color: '#0f0',
                padding: '10px',
                'font-family': 'monospace',
                'font-size': '12px',
                'z-index': 10000,
                'max-width': '400px'
            })
            .appendTo('body');
        
        this.updateDebugInfo();
        this.debugInterval = setInterval(() => {
            this.updateDebugInfo();
        }, 1000);
        
        // 添加调试面板到右键菜单
        document.addEventListener('contextmenu', this.showDebugMenu);
    },
    
    disable() {
        $('#dev-panel').remove();
        clearInterval(this.debugInterval);
        document.removeEventListener('contextmenu', this.showDebugMenu);
    },
    
    updateDebugInfo() {
        const info = `
            章节数: ${currentParsedChapters.length}
            图谱数: ${Object.keys(extension_settings[extensionName].chapterGraphMap || {}).length}
            续写链条: ${continueWriteChain.length}
            API调用: ${apiCallTimestamps.length}
            生成中: ${isGeneratingWrite || isGeneratingGraph}
        `;
        $('#dev-panel').text(info);
    },
    
    showDebugMenu(e) {
        e.preventDefault();
        const menu = `
            <div class="debug-menu">
                <button onclick="DevMode.exportState()">导出状态</button>
                <button onclick="DevMode.importState()">导入状态</button>
                <button onclick="DevMode.resetAll()">重置所有</button>
                <button onclick="DevMode.simulateError()">模拟错误</button>
            </div>
        `;
        // 显示菜单逻辑
    },
    
    exportState() {
        const state = {
            chapters: currentParsedChapters,
            graph: extension_settings[extensionName],
            timestamp: Date.now()
        };
        
        const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `novel-writer-state-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }
};

// 在控制台暴露开发者模式
window.NovelWriterDev = DevMode;

// 使用方法：在控制台输入 NovelWriterDev.toggle()
```

---

## 📊 四、总结

### Bug 优先级分布

| 优先级 | 数量 | 说明 |
|--------|------|------|
| 🔴 P0 | 3 | 必须立即修复 |
| 🟠 P1 | 4 | 尽快修复 |
| 🟡 P2 | 5 | 建议优化 |

### 修复清单

- [ ] **P0-1**: JSON.parse 错误处理（3处）
- [ ] **P0-2**: 输入验证
- [ ] **P0-3**: 竞态条件修复
- [ ] **P1-1**: 全局变量命名空间化
- [ ] **P1-2**: 添加防抖/节流
- [ ] **P1-3**: 资源泄漏修复
- [ ] **P1-4**: 撤销/重做功能（可选）

### 优化清单

- [ ] 代码重复 - 提取通用函数
- [ ] 性能优化 - 虚拟滚动（可选）
- [ ] 用户体验 - 快捷键支持
- [ ] 数据持久化 - 自动保存草稿
- [ ] 调试功能 - 开发者模式

---

**建议优先修复 P0 和 P1 级别的问题**，这些问题可能导致功能崩溃或数据丢失。

**生成时间：** 2026-05-15  
**检查工具：** 人工代码审查 + 静态分析
