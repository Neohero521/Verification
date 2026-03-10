// 【Verification插件入口】严格对齐Cola仓库index.js实现
console.log('[Verification] 插件入口index.js开始执行');

// 优先加载悬浮球核心，确保第一时间显示，不受其他模块报错影响
import { FloatBall } from './floatBall.js';
import { extensionName } from './config.js';

// 强制优先初始化悬浮球，DOM就绪立即执行，兜底所有异常
try {
    // 确保document.body存在
    if (document.body) {
        FloatBall.init();
        // 挂载到window，方便控制台调试
        window.VerificationFloatBall = FloatBall;
        console.log('[Verification] 悬浮球优先初始化完成，已挂载到window');
    } else {
        document.addEventListener('DOMContentLoaded', () => {
            FloatBall.init();
            window.VerificationFloatBall = FloatBall;
            console.log('[Verification] DOM就绪，悬浮球初始化完成');
        });
    }
} catch (error) {
    console.error('[Verification] 悬浮球初始化报错', error);
    toastr.error('悬浮球初始化失败，详情查看控制台', 'Verification插件');
}

// 延迟加载主业务逻辑，不阻塞悬浮球显示
setTimeout(async () => {
    try {
        console.log('[Verification] 开始加载主业务模块');
        const { mainInit } = await import('./main.js');
        await mainInit();
        console.log('[Verification] 主业务模块加载完成，插件全量就绪');
        toastr.success('Verification小说续写插件加载完成', '插件提示');
    } catch (error) {
        console.error('[Verification] 主业务模块加载报错', error);
        toastr.warning('功能模块加载异常，悬浮球基础功能可用', 'Verification插件');
    }
}, 300);

// jQuery兼容，对齐Cola的legacy实现
jQuery(async () => {
    console.log('[Verification] jQuery就绪');
});
