// 严格遵循官方模板导入规范
import { extension_settings, getContext, loadExtensionSettings } from "../../../extensions.js";
import { saveSettingsDebounced } from "../../../../script.js";
import { extensionFolderPath } from "./modules/constants.js";
import { initDrawerToggle, initVisibilityListener, loadSettings, initEvents } from "./modules/ui.js";
import { initContinueChainEvents } from "./modules/write.js";

// 插件入口
jQuery(async () => {
    try {
        // 加载HTML结构
        const settingsHtml = await $.get(`${extensionFolderPath}/example.html`);
        $("body").append(settingsHtml);
        await new Promise(resolve => setTimeout(resolve, 100));
        console.log("[小说续写插件] HTML加载完成");
    } catch (error) {
        console.error('[小说续写插件] 扩展HTML加载失败:', error);
        toastr.error('小说续写插件加载失败：HTML文件加载异常，请检查文件路径', "插件错误");
        return;
    }

    // 初始化核心模块
    initDrawerToggle();
    initContinueChainEvents();
    initVisibilityListener();
    await loadSettings();
    initEvents();
});
