// 导入SillyTavern内置核心模块
import {
  extension_settings,
  getContext,
  loadExtensionSettings,
} from "../../../extensions.js";
import { saveSettingsDebounced } from "../../../../script.js";

// 扩展核心配置（必须与仓库名称一致）
const extensionName = "Verification";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;
const extensionSettings = extension_settings[extensionName];
let floatBallInstance = null;

// 默认设置项
const defaultSettings = {
  apiKey: "",
  baseUrl: "https://api.openai.com/v1",
  model: "gpt-3.5-turbo",
  defaultLength: 500,
  defaultStyle: "默认",
  defaultTemperature: 0.7,
  enableFloatBall: true,
};

// 续写风格提示词模板
const stylePromptMap = {
  "默认": "严格承接上文的剧情、人设、世界观和行文风格，保持剧情连贯不崩塌，逻辑自洽，符合网文阅读节奏",
  "热血": "热血爽文风格，节奏紧凑，冲突强烈，爽点密集，情绪感染力强，人物塑造鲜明有张力",
  "甜宠": "甜宠言情风格，温馨甜蜜，细节细腻，人设讨喜，互动自然不油腻，氛围轻松治愈",
  "悬疑": "悬疑推理风格，伏笔重重，节奏紧张，逻辑严谨，反转合理，氛围感拉满",
  "玄幻": "玄幻修仙风格，世界观宏大，打斗场面精彩，境界设定清晰，剧情推进流畅有爽感",
  "都市": "都市现实风格，贴近生活，人物真实立体，剧情接地气，情感细腻有共鸣",
  "古风": "古风言情风格，文笔优美典雅，意境悠远，符合古代背景设定，人物言行贴合时代",
  "科幻": "科幻末世风格，世界观设定严谨，科技感十足，剧情有张力，兼具想象力与逻辑性"
};

// 加载并初始化扩展设置
async function loadSettings() {
  // 初始化设置项，不存在则赋值默认值
  extension_settings[extensionName] = extension_settings[extensionName] || {};
  if (Object.keys(extension_settings[extensionName]).length === 0) {
    Object.assign(extension_settings[extensionName], defaultSettings);
  }

  // 同步设置到UI
  const config = extension_settings[extensionName];
  $("#st-novel-api-key").val(config.apiKey || "");
  $("#st-novel-base-url").val(config.baseUrl || defaultSettings.baseUrl);
  $("#st-novel-model").val(config.model || defaultSettings.model);
  $("#st-novel-default-length").val(config.defaultLength || defaultSettings.defaultLength);
  $("#st-novel-default-style").val(config.defaultStyle || defaultSettings.defaultStyle);
  $("#st-novel-default-temperature").val(config.defaultTemperature || defaultSettings.defaultTemperature);
  $("#st-novel-temperature-value").text(config.defaultTemperature || defaultSettings.defaultTemperature);
  $("#st-novel-enable-floatball").prop("checked", config.enableFloatBall !== false);

  // 初始化悬浮球
  initFloatBall();
}

// 初始化悬浮球实例
function initFloatBall() {
  const config = extension_settings[extensionName];
  // 销毁已存在的实例
  if (floatBallInstance) {
    floatBallInstance.destroy();
    floatBallInstance = null;
  }
  // 开启状态下创建新实例
  if (config.enableFloatBall) {
    floatBallInstance = new NovelFloatBall(config);
  }
}

// API配置变更事件
function onApiKeyInput(event) {
  extension_settings[extensionName].apiKey = $(event.target).val().trim();
  saveSettingsDebounced();
}

function onBaseUrlInput(event) {
  extension_settings[extensionName].baseUrl = $(event.target).val().trim() || defaultSettings.baseUrl;
  saveSettingsDebounced();
}

function onModelInput(event) {
  extension_settings[extensionName].model = $(event.target).val().trim() || defaultSettings.model;
  saveSettingsDebounced();
}

// 续写参数变更事件
function onDefaultLengthChange(event) {
  extension_settings[extensionName].defaultLength = $(event.target).val();
  saveSettingsDebounced();
}

function onDefaultStyleChange(event) {
  extension_settings[extensionName].defaultStyle = $(event.target).val();
  saveSettingsDebounced();
}

function onTemperatureChange(event) {
  const value = $(event.target).val();
  $("#st-novel-temperature-value").text(value);
  extension_settings[extensionName].defaultTemperature = parseFloat(value);
  saveSettingsDebounced();
}

// 悬浮窗开关变更事件
function onFloatBallToggle(event) {
  const isEnabled = Boolean($(event.target).prop("checked"));
  extension_settings[extensionName].enableFloatBall = isEnabled;
  saveSettingsDebounced();
  initFloatBall();
  toastr.info(isEnabled ? "悬浮续写球已启用" : "悬浮续写球已关闭", "AI小说续写器");
}

// API连接测试事件
async function onTestConnectionClick() {
  const config = extension_settings[extensionName];
  if (!config.apiKey) {
    toastr.error("请先填写API Key", "连接测试失败");
    return;
  }

  try {
    const response = await fetch(`${config.baseUrl}/models`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${config.apiKey}`,
        "Content-Type": "application/json"
      }
    });

    if (!response.ok) throw new Error(`状态码: ${response.status}`);
    toastr.success("API连接正常，模型列表获取成功", "连接测试通过");
  } catch (error) {
    toastr.error(`连接失败: ${error.message}`, "连接测试失败");
  }
}

// 构建续写提示词
function buildContinuationPrompt(content, length, style) {
  return `你是一位专业的网络小说作家，擅长续写各类题材小说，严格遵守以下要求：
1. 严格承接上文的剧情、人设、世界观和行文风格，保持剧情连贯，不出现人设崩塌、逻辑矛盾
2. 续写内容流畅自然，有画面感，推动剧情发展，符合网文阅读节奏
3. 续写长度约${length}字，不要大幅超出
4. 续写要求：${stylePromptMap[style] || stylePromptMap["默认"]}
5. 只输出续写的正文内容，不要输出任何解释、说明、标题、客套话，直接承接上文内容续写

上文内容：
${content.slice(-2000)}`;
}

// 发起AI续写请求（支持流式输出）
async function requestAiContinuation(params, onStreamChunk, onComplete, onError) {
  const { apiKey, baseUrl, model, prompt, maxTokens, temperature, stream } = params;

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        stream,
        max_tokens: maxTokens,
        temperature,
        top_p: 0.9,
        frequency_penalty: 0.2,
        presence_penalty: 0.1
      })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error?.message || `请求失败，状态码: ${response.status}`);
    }

    // 非流式响应
    if (!stream) {
      const result = await response.json();
      const content = result.choices[0]?.message?.content || "";
      onComplete(content);
      return;
    }

    // 流式响应处理
    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let fullContent = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        onComplete(fullContent);
        break;
      }

      const chunk = decoder.decode(value);
      const lines = chunk.split("\n").filter(line => line.trim() !== "");
      
      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.slice(6).trim();
          if (data === "[DONE]") continue;
          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices[0]?.delta?.content || "";
            if (content) {
              fullContent += content;
              onStreamChunk(fullContent);
            }
          } catch (e) {}
        }
      }
    }

  } catch (error) {
    onError(error.message);
  }
}

// 悬浮球核心类
class NovelFloatBall {
  constructor(config) {
    this.config = config;
    this.ball = null;
    this.panel = null;
    this.isDragging = false;
    this.isPanelOpen = false;
    this.startX = 0;
    this.startY = 0;
    this.offsetX = 0;
    this.offsetY = 0;
    this.selectedText = "";
    this.defaultPosition = { right: "20px", bottom: "120px" };
    this.init();
  }

  init() {
    this.createBall();
    this.bindEvents();
    this.restorePosition();
    this.listenSelection();
  }

  createBall() {
    if ($("#st-novel-float-ball").length) return;

    this.ball = $(`
      <div id="st-novel-float-ball" class="st-novel-float-ball">
        <div class="st-novel-ball-icon">📝</div>
        <div class="st-novel-ball-badge" style="display: none;">续</div>
      </div>
    `);
    $("body").append(this.ball);
  }

  bindEvents() {
    const that = this;

    // 拖拽开始事件
    this.ball.on("mousedown touchstart", function(e) {
      that.isDragging = false;
      const event = e.type === "mousedown" ? e : e.originalEvent.touches[0];
      
      that.startX = event.clientX;
      that.startY = event.clientY;
      
      const rect = that.ball[0].getBoundingClientRect();
      that.offsetX = event.clientX - rect.left;
      that.offsetY = event.clientY - rect.top;

      that.ball.css("transition", "none");
      $(document).on("mousemove touchmove", onMove);
      $(document).on("mouseup touchend", onEnd);
    });

    // 拖拽移动事件
    const onMove = $.debounce(10, function(e) {
      const event = e.type === "mousemove" ? e : e.originalEvent.touches[0];
      const clientX = event.clientX;
      const clientY = event.clientY;

      const moveX = Math.abs(clientX - that.startX);
      const moveY = Math.abs(clientY - that.startY);
      if (moveX > 3 || moveY > 3) that.isDragging = true;

      let left = clientX - that.offsetX;
      let top = clientY - that.offsetY;

      const maxLeft = window.innerWidth - that.ball.outerWidth();
      const maxTop = window.innerHeight - that.ball.outerHeight();

      left = Math.max(0, Math.min(left, maxLeft));
      top = Math.max(0, Math.min(top, maxTop));

      that.ball.css({
        left: `${left}px`,
        top: `${top}px`,
        right: "auto",
        bottom: "auto"
      });

      if (e.type === "touchmove") e.preventDefault();
    });

    // 拖拽结束事件
    const onEnd = function() {
      $(document).off("mousemove touchmove", onMove);
      $(document).off("mouseup touchend", onEnd);

      that.ball.css("transition", "all 0.2s ease");
      that.autoAttachEdge();
      that.savePosition();

      if (!that.isDragging) that.togglePanel();
    };

    // 悬浮球hover效果
    this.ball.on("mouseenter", () => this.ball.css("transform", "scale(1.1)"));
    this.ball.on("mouseleave", () => this.ball.css("transform", "scale(1)"));

    // 窗口大小变化适配
    $(window).on("resize", $.debounce(300, () => {
      this.autoAttachEdge();
      this.savePosition();
    }));
  }

  // 自动吸附到屏幕边缘
  autoAttachEdge() {
    const rect = this.ball[0].getBoundingClientRect();
    const windowWidth = window.innerWidth;
    const centerX = windowWidth / 2;

    this.ball.css({ left: "auto", right: "auto", top: `${rect.top}px` });
    rect.left + rect.width / 2 < centerX 
      ? this.ball.css("left", "20px") 
      : this.ball.css("right", "20px");
  }

  // 保存悬浮球位置
  savePosition() {
    const position = {};
    if (this.ball.css("left") !== "auto") position.left = this.ball.css("left");
    if (this.ball.css("right") !== "auto") position.right = this.ball.css("right");
    position.top = this.ball.css("top");
    localStorage.setItem("st_novel_floatball_position", JSON.stringify(position));
  }

  // 恢复悬浮球位置
  restorePosition() {
    try {
      const position = JSON.parse(localStorage.getItem("st_novel_floatball_position")) || this.defaultPosition;
      this.ball.css(position);
    } catch (e) {
      this.ball.css(this.defaultPosition);
    }
  }

  // 切换续写面板
  togglePanel(open = !this.isPanelOpen) {
    this.isPanelOpen = open;
    if (open) {
      if (!this.panel) this.panel = new ContinuationPanel(this, this.config);
      this.panel.open();
      // 自动填充选中文本
      if (this.selectedText) {
        this.panel.fillContent(this.selectedText);
        this.selectedText = "";
        this.hideBadge();
      }
    } else {
      this.panel?.close();
    }
  }

  // 监听文本选中事件
  listenSelection() {
    $(document).on("mouseup", $.debounce(200, () => {
      const selection = window.getSelection();
      const text = selection.toString().trim();
      
      if (text && text.length > 5) {
        this.selectedText = text;
        this.showBadge();
      } else {
        this.selectedText = "";
        this.hideBadge();
      }
    }));
  }

  showBadge() {
    this.ball.find(".st-novel-ball-badge").show();
  }

  hideBadge() {
    this.ball.find(".st-novel-ball-badge").hide();
  }

  // 刷新配置
  refreshConfig(config) {
    this.config = config;
    this.panel?.refreshConfig(config);
  }

  // 销毁实例
  destroy() {
    this.ball?.remove();
    this.panel?.destroy();
    this.ball = null;
    this.panel = null;
    $(document).off("mouseup", this.listenSelection);
  }
}

// 续写面板核心类
class ContinuationPanel {
  constructor(floatBall, config) {
    this.floatBall = floatBall;
    this.config = config;
    this.panel = null;
    this.isGenerating = false;
    this.currentResult = "";
    this.init();
  }

  init() {
    this.createPanel();
    this.bindEvents();
  }

  createPanel() {
    if ($("#st-novel-continuation-panel").length) return;

    this.panel = $(`
      <div id="st-novel-continuation-panel" class="st-novel-continuation-panel">
        <!-- 面板头部 -->
        <div class="st-novel-panel-header">
          <span class="st-novel-panel-title">AI小说续写</span>
          <div class="st-novel-panel-close">×</div>
        </div>
        <!-- 面板内容 -->
        <div class="st-novel-panel-content">
          <!-- 原文输入区 -->
          <div class="st-novel-input-group">
            <label>待续写原文</label>
            <textarea class="st-novel-content-input" placeholder="请输入或粘贴要续写的小说内容，选中文本可自动填充"></textarea>
          </div>
          <!-- 参数设置区 -->
          <div class="st-novel-params-group">
            <div class="st-novel-param-item">
              <label>续写长度</label>
              <select class="st-novel-length-select">
                <option value="300">300字</option>
                <option value="500" selected>500字</option>
                <option value="800">800字</option>
                <option value="1000">1000字</option>
                <option value="2000">2000字</option>
              </select>
            </div>
            <div class="st-novel-param-item">
              <label>续写风格</label>
              <select class="st-novel-style-select">
                <option value="默认" selected>保持原文风格</option>
                <option value="热血">热血爽文</option>
                <option value="甜宠">甜宠言情</option>
                <option value="悬疑">悬疑推理</option>
                <option value="玄幻">玄幻修仙</option>
                <option value="都市">都市现实</option>
                <option value="古风">古风言情</option>
                <option value="科幻">科幻末世</option>
              </select>
            </div>
            <div class="st-novel-param-item full-width">
              <div class="param-header">
                <label>内容随机性</label>
                <span class="st-novel-temperature-value">0.7</span>
              </div>
              <input type="range" class="st-novel-temperature-slider" min="0" max="1" step="0.1" value="0.7" />
            </div>
          </div>
          <!-- 操作按钮区 -->
          <div class="st-novel-btn-group">
            <button class="st-novel-continue-btn">一键续写</button>
            <button class="st-novel-clear-btn">清空</button>
          </div>
          <!-- 结果展示区 -->
          <div class="st-novel-result-group">
            <div class="result-header">
              <label>续写结果</label>
              <div class="result-actions">
                <button class="st-novel-insert-btn" style="display: none;">插入输入框</button>
                <button class="st-novel-copy-btn" style="display: none;">复制结果</button>
              </div>
            </div>
            <div class="st-novel-result-container"></div>
          </div>
        </div>
      </div>
    `);
    $("body").append(this.panel);
    // 同步默认参数
    this.syncDefaultParams();
  }

  syncDefaultParams() {
    this.panel.find(".st-novel-length-select").val(this.config.defaultLength);
    this.panel.find(".st-novel-style-select").val(this.config.defaultStyle);
    this.panel.find(".st-novel-temperature-slider").val(this.config.defaultTemperature);
    this.panel.find(".st-novel-temperature-value").text(this.config.defaultTemperature);
  }

  bindEvents() {
    const that = this;

    // 关闭按钮
    this.panel.find(".st-novel-panel-close").on("click", (e) => {
      e.stopPropagation();
      this.floatBall.togglePanel(false);
    });

    // 温度滑块同步
    this.panel.find(".st-novel-temperature-slider").on("input", function() {
      that.panel.find(".st-novel-temperature-value").text($(this).val());
    });

    // 清空按钮
    this.panel.find(".st-novel-clear-btn").on("click", () => {
      this.panel.find(".st-novel-content-input").val("");
      this.panel.find(".st-novel-result-container").empty();
      this.currentResult = "";
      this.hideActionBtns();
    });

    // 复制按钮
    this.panel.find(".st-novel-copy-btn").on("click", async () => {
      if (!this.currentResult) return;
      try {
        await navigator.clipboard.writeText(this.currentResult);
        toastr.success("续写内容已复制到剪贴板", "复制成功");
      } catch (e) {
        const textarea = document.createElement("textarea");
        textarea.value = this.currentResult;
        textarea.style.position = "fixed";
        textarea.style.left = "-9999px";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
        toastr.success("续写内容已复制到剪贴板", "复制成功");
      }
    });

    // 插入输入框按钮
    this.panel.find(".st-novel-insert-btn").on("click", () => {
      if (!this.currentResult) return;
      const $textarea = $("#send_textarea");
      if ($textarea.length) {
        const originText = $textarea.val();
        $textarea.val(originText + this.currentResult);
        $textarea[0].dispatchEvent(new Event("input", { bubbles: true }));
        toastr.success("续写内容已插入到聊天输入框", "插入成功");
      } else {
        toastr.error("未找到聊天输入框", "插入失败");
      }
    });

    // 续写按钮
    this.panel.find(".st-novel-continue-btn").on("click", () => this.handleContinuation());

    // 快捷键 Ctrl+Enter 触发续写
    this.panel.find(".st-novel-content-input").on("keydown", (e) => {
      if (e.ctrlKey && e.key === "Enter") {
        e.preventDefault();
        this.handleContinuation();
      }
    });
  }

  // 发起续写请求
  async handleContinuation() {
    if (this.isGenerating) return;

    const content = this.panel.find(".st-novel-content-input").val().trim();
    if (!content) {
      toastr.warning("请输入待续写的小说内容", "提示");
      return;
    }

    if (!this.config.apiKey) {
      toastr.error("请先在扩展设置中填写API Key", "配置缺失");
      return;
    }

    // 获取参数
    const length = this.panel.find(".st-novel-length-select").val();
    const style = this.panel.find(".st-novel-style-select").val();
    const temperature = parseFloat(this.panel.find(".st-novel-temperature-slider").val());
    const prompt = buildContinuationPrompt(content, length, style);

    // 重置状态
    this.panel.find(".st-novel-result-container").empty();
    this.currentResult = "";
    this.hideActionBtns();
    this.setGeneratingState(true);

    // 发起请求
    requestAiContinuation(
      {
        apiKey: this.config.apiKey,
        baseUrl: this.config.baseUrl,
        model: this.config.model,
        prompt,
        maxTokens: Math.max(parseInt(length) * 2, 1000),
        temperature,
        stream: true
      },
      // 流式回调
      (content) => {
        this.currentResult = content;
        this.panel.find(".st-novel-result-container").text(content);
        this.panel.find(".st-novel-result-container").scrollTop(this.panel.find(".st-novel-result-container")[0].scrollHeight);
      },
      // 完成回调
      (content) => {
        this.currentResult = content;
        this.setGeneratingState(false);
        this.showActionBtns();
        toastr.success("小说续写完成", "操作成功");
      },
      // 错误回调
      (errorMsg) => {
        this.panel.find(".st-novel-result-container").html(`<span class="error-text">生成失败：${errorMsg}</span>`);
        this.setGeneratingState(false);
        toastr.error(errorMsg, "续写失败");
      }
    );
  }

  setGeneratingState(isGenerating) {
    this.isGenerating = isGenerating;
    const $btn = this.panel.find(".st-novel-continue-btn");
    if (isGenerating) {
      $btn.text("生成中...").addClass("disabled");
    } else {
      $btn.text("一键续写").removeClass("disabled");
    }
  }

  showActionBtns() {
    this.panel.find(".st-novel-copy-btn").show();
    this.panel.find(".st-novel-insert-btn").show();
  }

  hideActionBtns() {
    this.panel.find(".st-novel-copy-btn").hide();
    this.panel.find(".st-novel-insert-btn").hide();
  }

  fillContent(text) {
    this.panel.find(".st-novel-content-input").val(text);
    this.panel.find(".st-novel-content-input").scrollTop(this.panel.find(".st-novel-content-input")[0].scrollHeight);
  }

  refreshConfig(config) {
    this.config = config;
    this.syncDefaultParams();
  }

  open() {
    this.panel.show();
    // 定位面板跟随悬浮球
    const ballRect = this.floatBall.ball[0].getBoundingClientRect();
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;

    this.panel.css("top", `${ballRect.top}px`);
    if (ballRect.left + ballRect.width / 2 < windowWidth / 2) {
      this.panel.css({ left: `${ballRect.right + 10}px`, right: "auto" });
    } else {
      this.panel.css({ right: `${windowWidth - ballRect.left + 10}px`, left: "auto" });
    }

    // 边界适配
    const panelRect = this.panel[0].getBoundingClientRect();
    if (panelRect.top < 20) this.panel.css("top", "20px");
    if (panelRect.bottom > windowHeight - 20) {
      this.panel.css("top", `${windowHeight - panelRect.height - 20}px`);
    }
    if (panelRect.right > windowWidth - 20) {
      this.panel.css({ left: "auto", right: "20px" });
    }
    if (panelRect.left < 20) {
      this.panel.css({ left: "20px", right: "auto" });
    }

    // 入场动画
    this.panel.css({ opacity: 0, transform: "scale(0.95)" });
    setTimeout(() => {
      this.panel.css({ opacity: 1, transform: "scale(1)" });
    }, 10);
  }

  close() {
    this.panel.css({ opacity: 0, transform: "scale(0.95)" });
    setTimeout(() => this.panel.hide(), 300);
    // 停止生成
    if (this.isGenerating) {
      this.setGeneratingState(false);
    }
  }

  destroy() {
    this.panel?.remove();
    this.panel = null;
  }
}

// 扩展入口（严格遵循ST模板规范）
jQuery(async () => {
  // 加载设置面板HTML
  const settingsHtml = await $.get(`${extensionFolderPath}/example.html`);
  $("#extensions_settings").append(settingsHtml);

  // 绑定UI事件监听
  $("#st-novel-api-key").on("input", onApiKeyInput);
  $("#st-novel-base-url").on("input", onBaseUrlInput);
  $("#st-novel-model").on("input", onModelInput);
  $("#st-novel-default-length").on("change", onDefaultLengthChange);
  $("#st-novel-default-style").on("change", onDefaultStyleChange);
  $("#st-novel-default-temperature").on("input", onTemperatureChange);
  $("#st-novel-enable-floatball").on("change", onFloatBallToggle);
  $("#st-novel-test-connection").on("click", onTestConnectionClick);

  // 加载设置并初始化
  await loadSettings();

  // 监听设置变更，实时刷新悬浮球配置
  Object.defineProperty(extension_settings, extensionName, {
    set: (value) => {
      const oldValue = extension_settings[extensionName];
      extension_settings[extensionName] = value;
      if (floatBallInstance && JSON.stringify(oldValue) !== JSON.stringify(value)) {
        floatBallInstance.refreshConfig(value);
      }
    },
    get: () => extension_settings[extensionName]
  });
});
