// 【Verification插件入口】基于SillyTavern官方规范优化
console.log('[Verification] 插件入口开始执行');

// 优先加载悬浮球核心，不受其他模块影响
import { FloatBall } from './floatBall.js';
import { extensionName } from './config.js';

// 【核心】DOM就绪立即初始化悬浮球，兜底所有异常
function initFloatBall() {
    try {
        if (document.body) {
            FloatBall.init();
            window.VerificationFloatBall = FloatBall;
            console.log('[Verification] 悬浮球初始化完成，已挂载到window.VerificationFloatBall');
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
}

// 立即执行悬浮球初始化
initFloatBall();

// 延迟加载主业务模块，不阻塞悬浮球显示
setTimeout(async () => {
    try {
        console.log('[Verification] 开始加载主业务模块');
        const { mainInit } = await import('./main.js');
        await mainInit();
        console.log('[Verification] 插件全量加载完成');
    } catch (error) {
        console.error('[Verification] 主业务模块加载报错', error);
        toastr.warning('功能模块加载异常，悬浮球基础功能可用', 'Verification插件');
    }
}, 500);

// jQuery兼容
jQuery(async () => {
    console.log('[Verification] jQuery就绪');
});
