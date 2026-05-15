# 小说续写系统 - 预设系统优化文档

## 概述

本文档说明小说续写系统扩展对 SillyTavern 预设系统的优化，确保每次调用 API 时都正确使用父级对话预设的全部内容。

## 优化内容

### 1. 预设参数获取增强 (`getActivePresetParams`)

**改进点：**
- 增强预设参数获取逻辑，支持多种来源
- 添加详细的调试日志
- 确保所有有效参数都被正确传递

**支持的预设参数来源（优先级从高到低）：**

1. `context.generation_settings` - 主要来源
2. `window.generation_params` - 备选来源
3. `context.preset.data` - 预设数据对象
4. `window.SillyTavern.presetManager.currentPreset.data` - 预设管理器当前预设

**代码示例：**
```javascript
function getActivePresetParams() {
    if (settings.enableAutoParentPreset) {
        if (context?.generation_settings && typeof context.generation_settings === 'object') {
            presetParams = { ...context.generation_settings };
            console.log('[小说续写器] 使用 context.generation_settings 预设参数');
        } else if (window.generation_params && typeof window.generation_params === 'object') {
            presetParams = { ...window.generation_params };
            console.log('[小说续写器] 使用 window.generation_params 预设参数');
        } 
        // ... 更多来源
    }
}
```

### 2. 预设名称获取优化 (`getCurrentPresetName`)

**支持的预设名称来源：**
1. `context.preset.name`
2. `context.generation_settings.preset_name`
3. `window.SillyTavern.presetManager.currentPreset.name`
4. `window.current_preset.name`
5. `window.generation_params.preset_name`
6. `window.extension_settings.presets.current_preset`

### 3. 事件监听系统 (`setupPresetEventListeners`)

确保预设变化时实时更新显示：

```javascript
function setupPresetEventListeners() {
    eventSource.on(event_types.PRESET_CHANGED, updatePresetNameDisplay);
    eventSource.on(event_types.CHAT_CHANGED, updatePresetNameDisplay);
    eventSource.on(event_types.CHARACTER_CHANGED, updatePresetNameDisplay);
    eventSource.on(event_types.GENERATION_SETTINGS_UPDATED, updatePresetNameDisplay);
    eventSource.on(event_types.SETTINGS_UPDATED, updatePresetNameDisplay);
}
```

### 4. 调试日志增强

添加了详细的调试日志，方便排查问题：

- 预设参数来源日志
- 预设名称获取日志
- API 调用时的预设使用日志

## 默认设置

```javascript
const defaultSettings = {
    // ... 其他设置
    enableAutoParentPreset: true,  // 默认开启
    // ... 其他设置
};
```

## 有效的预设参数

系统会过滤并保留以下有效参数：

| 类别 | 参数列表 |
|------|---------|
| 温度采样 | `temperature`, `top_p`, `top_k`, `min_p`, `top_a` |
| 生成长度 | `max_new_tokens`, `min_new_tokens`, `max_tokens` |
| 重复惩罚 | `repetition_penalty`, `presence_penalty`, `frequency_penalty` |
| 采样方法 | `typical_p`, `tfs`, `epsilon_cutoff`, `eta_cutoff`, `guidance_scale`, `cfg_scale` |
| 特殊模式 | `penalty_alpha`, `mirostat_mode`, `mirostat_tau`, `dynamic_temperature`, `dynatemp_low`, `dynatemp_high` |
| 提示词控制 | `negative_prompt`, `stop_sequence`, `seed`, `do_sample` |
| 编码器设置 | `encoder_repetition_penalty`, `no_repeat_ngram_size` |
| beam 搜索 | `num_beams`, `length_penalty`, `early_stopping` |
| 特殊令牌 | `ban_eos_token`, `skip_special_tokens`, `add_bos_token` |
| 其他 | `truncation_length`, `custom_token_bans`, `sampler_priority`, `system_prompt`, `logit_bias`, `stream` |

## 界面说明

### 开关控制
- **开关名称**：自动使用父级对话预设
- **说明**：开启后，续写将使用当前对话的生成预设参数
- **默认状态**：开启

### 预设名称显示
在开关下方会实时显示当前正在使用的预设名称：
```
当前生效父级预设：[预设名称]
```

## 调试信息

控制台会输出以下调试信息：

```
[小说续写器] 使用 context.generation_settings 预设参数
[小说续写器] 使用 context.preset.name 预设名称: 浪漫小说预设
[小说续写器] 最终使用的预设参数: { temperature: 0.8, top_p: 0.92, ... }
[小说续写器] 准备调用 generateRaw，将使用父级预设
```

## 使用示例

### 1. 正常使用（自动预设）

1. 在 SillyTavern 中选择或创建一个预设
2. 确保"自动使用父级对话预设"开关处于开启状态
3. 查看预设名称显示，确认使用正确的预设
4. 开始续写，所有 API 调用都会自动使用该预设的参数

### 2. 禁用预设

1. 关闭"自动使用父级对话预设"开关
2. 系统将使用默认参数（`temperature: 0.7`, `top_p: 0.9` 等）
3. 预设名称显示会隐藏

## 与 SillyTavern 的集成

### 事件类型
系统监听以下 SillyTavern 事件：

- `PRESET_CHANGED` - 预设切换时
- `CHAT_CHANGED` - 对话切换时
- `CHARACTER_CHANGED` - 角色切换时
- `GENERATION_SETTINGS_UPDATED` - 生成设置更新时
- `SETTINGS_UPDATED` - 通用设置更新时

### 上下文对象
系统使用 SillyTavern 的 `getContext()` API 获取当前上下文，包括：
- `context.generation_settings` - 当前对话的生成设置
- `context.preset` - 当前预设信息

## 代码文件

- **[index.js](index.js)** - 主要的预设逻辑实现
- **[example.html](example.html)** - UI 界面
- **[style.css](style.css)** - 样式文件
- **[manifest.json](manifest.json)** - 扩展配置

## 注意事项

1. **预设参数覆盖**：如果在调用 API 时传入了特定参数，这些参数会覆盖预设中的同名参数
2. **调试模式**：调试日志会在控制台输出，方便开发和问题排查
3. **向后兼容**：代码保持向后兼容，不会影响已有的功能
4. **性能考虑**：预设获取和过滤都是 O(n) 操作，不会对性能产生明显影响

## 故障排除

### 预设不生效
1. 检查"自动使用父级对话预设"开关是否开启
2. 查看控制台日志，确认预设来源
3. 确保当前对话有设置预设

### 预设名称显示不正确
1. 检查是否有预设被正确设置
2. 查看控制台的预设名称获取日志
3. 尝试切换预设触发更新

### 参数没有被正确传递
1. 检查该参数是否在有效参数列表中
2. 查看控制台的最终参数日志
3. 确认预设中确实设置了该参数
