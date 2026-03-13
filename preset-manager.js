import { getContext } from "../../../extensions.js";
import { eventSource, event_types, saveSettingsDebounced } from "../../../../script.js";
import { extensionName, defaultSettings } from "./constants.js";
import { state } from "./state.js";
import { debounce } from "./utils.js";

// 获取当前激活的预设参数
export function getActivePresetParams() {
    const settings = extension_settings[extensionName];
    let presetParams = {};
    const context = getContext();

    // 优先级严格对齐ST官方规范
    if (context?.generation_settings && typeof context.generation_settings === 'object') {
        presetParams = { ...context.generation_settings };
    } else if (window.generation_params && typeof window.generation_params === 'object') {
        presetParams = { ...window.generation_params };
    }

    // 开关关闭时使用全局默认预设
    if (!settings.enableAutoParentPreset) {
        if (window.generation_params && typeof window.generation_params === 'object') {
            presetParams = { ...window.generation_params };
        }
    }

    // 过滤ST官方支持的有效参数
    const validParams = [
        'temperature', 'top_p', 'top_k', 'min_p', 'top_a',
        'max_new_tokens', 'min_new_tokens', 'max_tokens',
        'repetition_penalty', 'repetition_penalty_range', 'repetition_penalty_slope', 'presence_penalty', 'frequency_penalty', 'dry_multiplier', 'dry_base', 'dry_sequence_length', 'dry_allowed_length', 'dry_penalty_last_n',
        'typical_p', 'tfs', 'epsilon_cutoff', 'eta_cutoff', 'guidance_scale', 'cfg_scale', 'penalty_alpha', 'mirostat_mode', 'mirostat_tau', 'mirostat_eta', 'smoothing_factor', 'dynamic_temperature', 'dynatemp_low', 'dynatemp_high', 'dynatemp_exponent',
        'negative_prompt', 'stop_sequence', 'seed', 'do_sample', 'encoder_repetition_penalty', 'no_repeat_ngram_size', 'num_beams', 'length_penalty', 'early_stopping', 'ban_eos_token', 'skip_special_tokens', 'add_bos_token', 'truncation_length', 'custom_token_bans', 'sampler_priority', 'system_prompt', 'logit_bias', 'stream'
    ];

    const filteredParams = {};
    for (const key of validParams) {
        if (presetParams[key] !== undefined && presetParams[key] !== null) {
            filteredParams[key] = presetParams[key];
        }
    }

    // 核心参数兜底默认值
    const defaultFallbackParams = {
        temperature: 0.7,
        top_p: 0.9,
        max_new_tokens: 2048,
        repetition_penalty: 1.1,
        do_sample: true
    };
    for (const [key, value] of Object.entries(defaultFallbackParams)) {
        if (filteredParams[key] === undefined || filteredParams[key] === null) {
            filteredParams[key] = value;
        }
    }

    return filteredParams;
}

// 获取当前预设名
export function getCurrentPresetName() {
    const context = getContext();
    let presetName = "默认预设";

    // 按ST官方优先级从高到低获取
    if (context?.preset?.name && typeof context.preset.name === 'string') {
        presetName = context.preset.name;
    }
    else if (context?.generation_settings?.preset_name && typeof context.generation_settings.preset_name === 'string') {
        presetName = context.generation_settings.preset_name;
    }
    else if (window.SillyTavern?.presetManager?.currentPreset?.name && typeof window.SillyTavern.presetManager.currentPreset.name === 'string') {
        presetName = window.SillyTavern.presetManager.currentPreset.name;
    }
    else if (window?.current_preset?.name && typeof window.current_preset.name === 'string') {
        presetName = window.current_preset.name;
    }
    else if (window?.generation_params?.preset_name && typeof window.generation_params.preset_name === 'string') {
        presetName = window.generation_params.preset_name;
    }
    else if (window?.extension_settings?.presets?.current_preset && typeof window.extension_settings.presets.current_preset === 'string') {
        presetName = window.extension_settings.presets.current_preset;
    }

    return presetName;
}

// 更新预设名UI显示
export const updatePresetNameDisplay = debounce(function() {
    const settings = extension_settings[extensionName];
    const presetNameElement = document.getElementById("parent-preset-name-display");
    if (!presetNameElement) return;

    if (!settings.enableAutoParentPreset) {
        presetNameElement.style.display = "none";
        state.currentPresetName = "";
        return;
    }

    state.currentPresetName = getCurrentPresetName();
    presetNameElement.textContent = `当前生效父级预设：${state.currentPresetName}`;
    presetNameElement.style.display = "block";
}, 100);

// 初始化预设事件监听
export function setupPresetEventListeners() {
    eventSource.on(event_types.PRESET_CHANGED, () => {
        updatePresetNameDisplay();
    });
    eventSource.on(event_types.CHAT_CHANGED, () => {
        updatePresetNameDisplay();
    });
    eventSource.on(event_types.CHARACTER_CHANGED, () => {
        updatePresetNameDisplay();
    });
    eventSource.on(event_types.GENERATION_SETTINGS_UPDATED, () => {
        updatePresetNameDisplay();
    });
    eventSource.on(event_types.SETTINGS_UPDATED, () => {
        updatePresetNameDisplay();
    });
}
