# 小说续写系统 - 界面优化指南

## 📚 目录
1. [可访问性优化](#可访问性优化)
2. [加载状态与动画](#加载状态与动画)
3. [移动端优化](#移动端优化)
4. [配置管理](#配置管理)
5. [使用示例](#使用示例)

---

## ✨ 1. 可访问性优化

### 1.1 键盘操作快捷键

| 操作 | 按键 |
|------|------|
| 打开/关闭面板 | `Ctrl/Cmd + Shift + N` |
| 关闭面板 | `Escape` |
| 聚焦悬浮球 | `Tab` 键 (循环) |
| 打开悬浮球菜单 | `Enter` / `Space` |
| 切换选项卡 | `←` `→` `Home` `End` |

### 1.2 ARIA 支持
- 完整的 ARIA 语义化标签
- 屏幕阅读器友好
- 焦点环可见性优化

### 1.3 系统偏好适配
- `prefers-reduced-motion` - 尊重减少动画偏好
- `prefers-color-scheme` - 亮色/深色模式
- `prefers-contrast: high` - 高对比度支持
- `prefers-reduced-data` - 数据节省模式

---

## 🎬 2. 加载状态与动画

### 2.1 按钮加载状态

```javascript
// 基础使用
const btn = document.querySelector('#my-button');
setButtonLoading(btn, true, '处理中...');

// 完成后恢复
setTimeout(() => {
  setButtonLoading(btn, false);
  showOperationStatus('成功！', 'success');
}, 1500);
```

### 2.2 操作反馈

```javascript
// 显示消息提示
showOperationStatus('操作成功！', 'success');  // success | error | warning | info
```

### 2.3 可用动画类

| 类名 | 效果 |
|------|------|
| `.fade-in` | 淡入动画 |
| `.slide-up` | 向上滑入 |
| `.bounce-in` | 弹性弹出 |
| `.success-animation` | 成功反馈 |
| `.shake` | 错误抖动 |

---

## 📱 3. 移动端优化

### 3.1 响应式断点

| 断点 | 尺寸 | 描述 |
|------|------|------|
| `≤480px` | 超小屏 | 全屏面板，紧凑布局 |
| `481-768px` | 中屏 | 95% 宽面板 |
| `769-1024px` | 平板 | 85% 宽面板 |
| `≥1025px` | 桌面 | 标准尺寸 |

### 3.2 触摸优化
- 最小 44px 触摸目标 (Apple HIG)
- 防双击缩放 (`touch-action`)
- 安全区域适配 (iPhone notch)

---

## ⚙️ 4. 配置管理

### 4.1 ConfigManager 用法

```javascript
// 读取配置
const value = ConfigManager.get('sendDelay', 100);

// 写入配置
ConfigManager.set('sendDelay', 150);

// 嵌套配置
ConfigManager.set('ui.theme', 'dark');
ConfigManager.get('ui.theme', 'auto');

// 配置操作
ConfigManager.has('key');
ConfigManager.delete('key');
ConfigManager.reset();
ConfigManager.export();
ConfigManager.import(jsonStr);
```

### 4.2 SessionManager 用法

```javascript
// 临时会话数据 (localStorage)
SessionManager.set('lastChapter', 5);
const last = SessionManager.get('lastChapter', 0);
SessionManager.clear();
```

### 4.3 ThemeManager 用法

```javascript
// 主题管理
ThemeManager.setMode('dark'); // 'auto' | 'light' | 'dark'
ThemeManager.init();
```

---

## 💻 5. 使用示例

### 完整按钮示例

```javascript
async function handleImport() {
  const btn = document.querySelector('#import-btn');
  
  try {
    setButtonLoading(btn, true, '正在导入...');
    
    // 执行操作
    await doSomethingAsync();
    
    showOperationStatus('导入成功！', 'success');
    
  } catch (err) {
    console.error(err);
    showOperationStatus('导入失败: ' + err.message, 'error');
  } finally {
    setButtonLoading(btn, false);
  }
}
```

### 配置持久化

```javascript
// 初始化时加载
function initSettings() {
  const savedDelay = ConfigManager.get('sendDelay', 100);
  const savedTheme = ConfigManager.get('ui.theme', 'auto');
  // ... 使用配置 ...
}

// 保存配置
function onSettingChange(e) {
  ConfigManager.set('sendDelay', e.target.value);
}
```

---

## 📂 文件清单

| 文件 | 说明 |
|------|------|
| `index.js` | 主程序 (新增了工具函数和配置管理) |
| `style.css` | 样式文件 (新增了可访问性、动画、移动端) |
| `example.html` | 界面文件 (新增了 ARIA 属性) |

---

## 🎯 快速开始

1. 键盘操作：按 `Ctrl/Cmd + Shift + N` 打开面板
2. 焦点导航：使用 `Tab` 键聚焦，`Enter` 激活
3. 加载状态：调用 `setButtonLoading()` 显示加载
4. 配置管理：使用 `ConfigManager` 读写设置

---

## 📖 更多信息

- 遵循 **WCAG 2.1 AA** 标准
- 支持所有主流浏览器
- 性能优化 (硬件加速、will-change)
- 完整响应式设计
