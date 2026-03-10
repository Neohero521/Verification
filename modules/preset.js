import { extensionName } from "./constants.js";
import { debounce } from "./utils.js";

// 获取当前生效的预设参数
export function getActivePresetParams() {
    const settings = extension_settings[extensionName];
    const context = getContext();
    let presetParams = {};

    // 优先级1：自动使用父级对话预设
    if (settings.enableAutoParentPreset && context.completionParams) {
        presetParams = { ...context.completionParams };
    }
    // 优先级2：用户自定义预设
    else if (settings.customPreset) {
        presetParams = { ...settings.customPreset };
    }

    // 过滤无效参数，只保留generateRaw支持的字段
    const validParams = ['temperature', 'top_p', 'top_k', 'min_p', 'top_a',
        'max_new_tokens', 'min_new_tokens', 'repetition_penalty',
        'repetition_penalty_range', 'typical_p', 'tfs',
        'epsilon_cutoff', 'eta_cutoff', 'guidance_scale',
        'negative_prompt', 'stop_sequence', 'seed', 'do_sample'];
    const filteredParams = {};
    for (const key of validParams) {
        if (presetParams[key] !== undefined) {
            filteredParams[key] = presetParams[key];
        }
    }
    return filteredParams;
}

// 加载并解析预设文件
export function loadPresetFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const presetData = JSON.parse(removeBOM(event.target.result.trim()));
            if (typeof presetData !== 'object' || Array.isArray(presetData)) {
                throw new Error("预设格式错误，必须为JSON对象");
            }
            extension_settings[extensionName].customPreset = presetData;
            extension_settings[extensionName].presetName = file.name;
            extension_settings[extensionName].enableAutoParentPreset = false;
            $("#auto-parent-preset-switch").prop("checked", false);
            $("#preset-name-text").text(file.name);
            $("#preset-preview").val(JSON.stringify(presetData, null, 2));
            saveSettingsDebounced();
            toastr.success(`预设文件「${file.name}」加载成功`, "小说续写器");
        } catch (error) {
            console.error('预设加载失败:', error);
            toastr.error(`预设加载失败：${error.message}`, "小说续写器");
        } finally {
            $("#preset-file-upload").val('');
        }
    };
    reader.onerror = () => {
        toastr.error('预设文件读取失败，请检查文件', "小说续写器");
        $("#preset-file-upload").val('');
    };
    reader.readAsText(file, 'UTF-8');
}

// 刷新预设预览
export function refreshPresetPreview() {
    const activeParams = getActivePresetParams();
    $("#preset-preview").val(JSON.stringify(activeParams, null, 2));
}
