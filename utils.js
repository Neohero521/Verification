// 【Verification工具函数】基于SillyTavern官方规范优化
import { extensionSettings, extensionName } from './config.js';
import { saveSettingsDebounced } from './config.js';

// 深合并
export function deepMerge(target, source) {
    const merged = structuredClone(target);
    for (const key in source) {
        if (Object.prototype.hasOwnProperty.call(source, key)) {
            if (source[key] instanceof Object && key in merged && merged[key] instanceof Object) {
                merged[key] = deepMerge(merged[key], source[key]);
            } else {
                merged[key] = structuredClone(source[key]);
            }
        }
    }
    return merged;
}

// 复制到剪贴板
export async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch (error) {
        // 降级方案
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed !important';
        textarea.style.left = '-9999px !important';
        textarea.style.top = '-9999px !important';
        document.body.appendChild(textarea);
        textarea.select();
        const success = document.execCommand('copy');
        document.body.removeChild(textarea);
        return success;
    }
}

// 渲染命令模板
export function renderCommandTemplate(template, charName, content) {
    return template
        .replace(/{{char}}/g, charName)
        .replace(/{{pipe}}/g, content);
}

// 设置按钮禁用状态
export function setButtonDisabled(selector, disabled) {
    $(selector).prop('disabled', disabled).toggleClass('menu_button--disabled', disabled);
}

// 防抖函数
export function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// 节流函数
export function throttle(func, limit) {
    let inThrottle;
    return function() {
        const args = arguments;
        const context = this;
        if (!inThrottle) {
            func.apply(context, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}
