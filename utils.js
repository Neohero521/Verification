import { saveSettingsDebounced } from "../../../../script.js";
import { extensionName, defaultSettings } from "./constants.js";
import { state } from "./state.js";

// 防抖工具函数
export function debounce(func, delay) {
    let timer = null;
    return function(...args) {
        clearTimeout(timer);
        timer = setTimeout(() => func.apply(this, args), delay);
    };
}

// 递归深拷贝合并配置
export function deepMerge(target, source) {
    const merged = { ...target };
    for (const key in source) {
        if (Object.prototype.hasOwnProperty.call(source, key)) {
            if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
                merged[key] = deepMerge(merged[key] || {}, source[key]);
            } else if (Array.isArray(source[key])) {
                merged[key] = Array.isArray(merged[key]) ? [...merged[key]] : [...source[key]];
            } else {
                merged[key] = merged[key] !== undefined ? merged[key] : source[key];
            }
        }
    }
    return merged;
}

// 移除BOM头
export function removeBOM(text) {
    if (!text) return text;
    if (text.charCodeAt(0) === 0xFEFF || text.charCodeAt(0) === 0xFFFE) {
        return text.slice(1);
    }
    return text;
}

// 复制到剪贴板
export async function copyToClipboard(text) {
    try {
        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(text);
            return true;
        }
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        textArea.style.opacity = '0';
        textArea.readOnly = true;
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        textArea.setSelectionRange(0, textArea.value.length);
        const result = document.execCommand('copy');
        document.body.removeChild(textArea);
        return result;
    } catch (error) {
        console.error('复制失败:', error);
        return false;
    }
}

// 设置按钮禁用状态
export function setButtonDisabled(selector, disabled) {
    $(selector).prop('disabled', disabled).toggleClass('menu_button--disabled', disabled);
}

// 更新进度条与状态文本
export function updateProgress(progressId, statusId, current, total, textPrefix = "进度") {
    const $progressEl = $(`#${progressId}`);
    const $statusEl = $(`#${statusId}`);
    if (total === 0) {
        $progressEl.css('width', '0%');
        $statusEl.text('');
        return;
    }
    const percent = Math.floor((current / total) * 100);
    $progressEl.css('width', `${percent}%`);
    $statusEl.text(`${textPrefix}: ${current}/${total} (${percent}%)`);
}

// sendas命令模板渲染
export function renderCommandTemplate(template, charName, chapterContent) {
    const escapedContent = chapterContent.replace(/"/g, '\\"').replace(/\|/g, '\\|');
    return template.replace(/{{char}}/g, charName || '角色').replace(/{{pipe}}/g, escapedContent);
}

// 保存抽屉状态
export function saveDrawerState() {
    const drawerState = {};
    $('.novel-writer-extension .inline-drawer').each(function() {
        const drawerId = $(this).attr('id');
        if (drawerId) {
            drawerState[drawerId] = $(this).hasClass('open');
        }
    });
    extension_settings[extensionName].drawerState = drawerState;
    saveSettingsDebounced();
}

// 恢复抽屉状态
export function restoreDrawerState() {
    const savedState = extension_settings[extensionName].drawerState || defaultSettings.drawerState;
    $('.novel-writer-extension .inline-drawer').each(function() {
        const drawerId = $(this).attr('id');
        if (drawerId && savedState[drawerId] !== undefined) {
            $(this).toggleClass('open', savedState[drawerId]);
        }
    });
}

// 初始化抽屉切换事件
export function initDrawerToggle() {
    $('#novel-writer-panel').off('click', '.inline-drawer-header').on('click', '.inline-drawer-header', function(e) {
        e.preventDefault();
        e.stopPropagation();
        const $drawer = $(this).closest('.inline-drawer');
        $drawer.toggleClass('open');
        saveDrawerState();
    });
}

// 初始化页面可见性监听
export function initVisibilityListener() {
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && state.isInitialized) {
            if (state.isGeneratingWrite) {
                $('#write-status').text('生成状态异常，请重新点击生成');
                state.isGeneratingWrite = false;
                state.stopGenerateFlag = false;
                setButtonDisabled('#write-generate-btn, .continue-write-btn, #write-stop-btn', false);
            }
            if (state.isGeneratingGraph) {
                $('#graph-generate-status').text('图谱生成状态异常，请重新点击生成');
                state.isGeneratingGraph = false;
                state.stopGenerateFlag = false;
                setButtonDisabled('#graph-single-btn, #graph-batch-btn, #graph-merge-btn, #graph-batch-merge-btn', false);
            }
            if (state.isSending) {
                $('#novel-import-status').text('发送状态异常，请重新点击导入');
                state.isSending = false;
                state.stopSending = false;
                setButtonDisabled('#import-selected-btn, #import-all-btn, #stop-send-btn', false);
            }
        }
    });
}
