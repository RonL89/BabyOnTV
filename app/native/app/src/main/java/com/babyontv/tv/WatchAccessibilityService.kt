package com.babyontv.tv

import android.accessibilityservice.AccessibilityService
import android.content.Context
import android.view.WindowManager
import android.view.accessibility.AccessibilityEvent

/** 无障碍服务：实时感知前台切换，并承载无障碍层的学习门禁窗口。 */
class WatchAccessibilityService : AccessibilityService() {
    private var gate: GateOverlay? = null

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        if (event?.eventType == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) {
            val pkg = event.packageName?.toString()
            if (pkg != null && (pkg.contains("inputmethod") || pkg.contains("keyboard"))) return
            // 忽略自家悬浮窗（锚点 1x1 / 门禁）产生的事件：它们会把真实前台（视频应用）
            // 误判成本应用，导致 active=false、余额不扣、门禁永不弹出（海信 VIDAA 实测）。
            // 本应用自身的前台状态由 resumeOwn/pauseOwn（Activity 生命周期）跟踪，这里无需再更新。
            if (pkg != packageName) Foreground.update(pkg)
            // 无障碍服务由系统常驻，顺便充当看门狗：管理服务被系统清理后在下一次切换应用时拉起
            if (!GateService.running) GateService.ensureRunning(this, "accessibility")
            GateService.onForegroundChanged(this, pkg)
        }
    }
    override fun onInterrupt() = Unit
    override fun onServiceConnected() {
        instance = this
        connected = true
        gate = GateOverlay(this, WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY) {
            performGlobalAction(GLOBAL_ACTION_HOME)
        }
        GateService.ensureRunning(this, "accessibility")
    }
    override fun onDestroy() {
        gate?.destroy(); gate = null
        instance = null
        connected = false
        Foreground.clearExternal()
        super.onDestroy()
    }

    companion object {
        private var instance: WatchAccessibilityService? = null
        var connected = false
            private set
        fun enabled(context: Context): Boolean = try {
            val manager = context.getSystemService(Context.ACCESSIBILITY_SERVICE) as android.view.accessibility.AccessibilityManager
            manager.getEnabledAccessibilityServiceList(android.accessibilityservice.AccessibilityServiceInfo.FEEDBACK_ALL_MASK)
                .any { it.resolveInfo.serviceInfo.packageName == context.packageName }
        } catch (_: Exception) { false }
        fun hasGate(): Boolean = instance?.gate?.isShowing == true
        fun showGate(reason: String): Boolean = instance?.gate?.show(reason) == true
        fun hideGate() { instance?.gate?.hide() }
        fun suspendGate() { instance?.gate?.suspend() }
    }
}
