import { extensionName } from "./constants.js";
import { state } from "./state.js";

// 防抖工具函数
export function debounce(func, delay) {
    let timer = null;
    return function(...args) {
        clearTimeout(timer);
        timer = setTimeout(() =>func.apply(this, args), delay);
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

// 更新进度条
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
    const escapedContent = chapterContent.replace(/"/g, '\\"').replace(/\|/g, '\\|').replace(/\n/g, '\\n');
    return template.replace(/{{char}}/g, charName || '角色').replace(/{{pipe}}/g, escapedContent);
}

// 示例配置输入处理
export function onExampleInput(event) {
    const value = Boolean($(event.target).prop("checked"));
    extension_settings[extensionName].example_setting = value;
    saveSettingsDebounced();
}

// 示例按钮点击处理
export function onButtonClick() {
    toastr.info(`The checkbox is ${extension_settings[extensionName].example_setting ? "checked": "not checked"}`, "Extension Example");
}
