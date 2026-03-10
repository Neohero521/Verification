import { extension_settings, getContext, state } from './config.js';

// 防抖函数
export function debounce(func, delay) {
    let timer = null;
    return function(...args) {
        clearTimeout(timer);
        timer = setTimeout(() => func.apply(this, args), delay);
    };
}

// 深度合并对象
export function deepMerge(target, source) {
    if (!source || typeof source !== 'object') return target;
    const merged = structuredClone(target || {});
    for (const key in source) {
        if (Object.prototype.hasOwnProperty.call(source, key)) {
            if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
                merged[key] = deepMerge(merged[key], source[key]);
            } else if (Array.isArray(source[key])) {
                merged[key] = Array.isArray(merged[key]) ? [...merged[key]] : [...source[key]];
            } else {
                merged[key] = source[key];
            }
        }
    }
    return merged;
}

// 移除文本BOM头
export function removeBOM(text) {
    if (!text || typeof text !== 'string') return text;
    if (text.charCodeAt(0) === 0xFEFF || text.charCodeAt(0) === 0xFFFE) {
        return text.slice(1);
    }
    return text;
}

// 复制文本到剪贴板
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
        console.error(`[${state.extensionName}] 复制失败:`, error);
        return false;
    }
}

// 渲染发送命令模板
export function renderCommandTemplate(template, charName, chapterContent) {
    const escapedContent = chapterContent.replace(/"/g, '\\"').replace(/\|/g, '\\|');
    return template
        .replace(/{{char}}/g, charName || '角色')
        .replace(/{{pipe}}/g, escapedContent);
}

// 设置按钮禁用状态
export function setButtonDisabled(selector, disabled) {
    $(selector).prop('disabled', disabled).toggleClass('menu_button--disabled', disabled);
}

// 获取当前生效的生成预设参数
export function getActivePresetParams() {
    const settings = extension_settings[state.extensionName];
    const context = getContext();
    let presetParams = {};

    if (settings.enableAutoParentPreset && context.generation_params) {
        presetParams = { ...context.generation_params };
    }

    const validParams = [
        'temperature', 'top_p', 'top_k', 'min_p', 'top_a',
        'max_new_tokens', 'min_new_tokens', 'repetition_penalty',
        'repetition_penalty_range', 'typical_p', 'tfs',
        'epsilon_cutoff', 'eta_cutoff', 'guidance_scale',
        'negative_prompt', 'stop_sequence', 'seed', 'do_sample'
    ];

    const filteredParams = {};
    for (const key of validParams) {
        if (presetParams[key] !== undefined) {
            filteredParams[key] = presetParams[key];
        }
    }
    return filteredParams;
}

// 正则表达式转义
export function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// 字数统计（中文+英文单词）
export function countWords(text) {
    if (!text) return 0;
    const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    const englishWords = (text.match(/[a-zA-Z]+/g) || []).length;
    return chineseChars + englishWords;
}

// 延迟函数
export function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
