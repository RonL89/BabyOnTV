package com.babytv.tv

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.view.KeyEvent
import android.view.View
import android.view.WindowManager
import android.webkit.WebView

open class MainActivity : Activity() {
    protected lateinit var web: WebView
    private var webReleased = false
    private var page = "quiz"
    private var backDownAt = 0L

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (!AdminAuth.configured(this)) {
            startActivity(Intent(this, ParentActivity::class.java)); finish(); return
        }
        if (!Prefs.onboarded(this)) {
            startActivity(Intent(this, OnboardingActivity::class.java)); finish(); return
        }
        DeviceRuntime.ensure(this)
        // 孩子重新打开 App：解除家长「退出应用」后的 30 分钟暂停
        if (this !is GateActivity) DeviceRuntime.store.set("gate_hold_until", "0")
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        if (DeviceBridge.isTv(this)) requestedOrientation = android.content.pm.ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE
        val reason = intent.getStringExtra("reason")
        page = if (this is GateActivity && reason != null && reason != "timeup") "lock?reason=$reason" else "quiz"
        createWeb()
        // 屏幕时间守护（电视 + 手机/平板都启动）；练习模式会在 GateService 里自动跳过
        GateService.start(this)
        if (this !is GateActivity) Updater.check(this) { info ->
            val newer = Updater.newerThanCurrent(this, info) ?: return@check
            runOnUiThread {
                val raw = DeviceBridge(this).updateInfo()
                if (newer.force) startActivity(Intent(this, UpdateActivity::class.java).putExtra("payload", raw))
                else if (::web.isInitialized && !webReleased) web.evaluateJavascript("window.SOTV_UPDATE&&SOTV_UPDATE($raw)", null)
            }
        }
    }

    private fun createWeb() {
        web = WebShell(this).create(Prefs.localBase(this) + "#/$page")
        web.addJavascriptInterface(DeviceBridge(this, false, web), "SOTVNative")
        setContentView(web)
        web.requestFocus()
        webReleased = false
    }

    override fun onStop() {
        super.onStop()
        AudioPlayer.stop()
        if (DeviceBridge.isTv(this) && ::web.isInitialized && !webReleased) {
            (web.parent as? android.view.ViewGroup)?.removeView(web)
            web.destroy()
            webReleased = true
        }
    }

    override fun onNewIntent(intent: Intent?) {
        super.onNewIntent(intent)
        setIntent(intent)
        val reason = intent?.getStringExtra("reason")
        page = if (this is GateActivity && reason != null && reason != "timeup") "lock?reason=$reason" else "quiz"
        if (::web.isInitialized && !webReleased) {
            web.loadUrl(Prefs.localBase(this) + "#/$page")
            web.evaluateJavascript("window.SOTV_RESUME&&SOTV_RESUME()", null)
        }
    }

    override fun onResume() {
        super.onResume()
        if (webReleased) createWeb()
        if (::web.isInitialized && !webReleased) web.evaluateJavascript("window.SOTV_RESUME&&SOTV_RESUME()", null)
        // 门禁被系统杀掉后，回到 App 时自愈
        if (!Prefs.serviceRunning(this)) try { GateService.start(this) } catch (_: RuntimeException) { }
    }

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        // 长按返回键 3 秒进家长页；短按返回键交给网页（答题页提示、面板页取消倒计时）
        if (event.keyCode == KeyEvent.KEYCODE_BACK) {
            if (event.action == KeyEvent.ACTION_DOWN) {
                val now = android.os.SystemClock.elapsedRealtime()
                if (event.repeatCount == 0) {
                    backDownAt = now
                    if (::web.isInitialized && !webReleased) web.evaluateJavascript("window.TV&&TV.back()", null)
                } else if (backDownAt > 0 && now - backDownAt >= 3000) {
                    backDownAt = 0
                    startActivity(Intent(this, ParentActivity::class.java))
                    return true
                }
            } else if (event.action == KeyEvent.ACTION_UP) {
                backDownAt = 0
            }
            return true
        }
        if (!DeviceBridge.isTv(this) && event.keyCode == KeyEvent.KEYCODE_ENTER) return super.dispatchKeyEvent(event)
        val action = when (event.keyCode) {
            KeyEvent.KEYCODE_DPAD_LEFT -> "move('left')"
            KeyEvent.KEYCODE_DPAD_RIGHT -> "move('right')"
            KeyEvent.KEYCODE_DPAD_UP -> "move('up')"
            KeyEvent.KEYCODE_DPAD_DOWN -> "move('down')"
            KeyEvent.KEYCODE_DPAD_CENTER, KeyEvent.KEYCODE_ENTER, KeyEvent.KEYCODE_NUMPAD_ENTER -> "select()"
            KeyEvent.KEYCODE_MENU, KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE -> "replay()"   // 再听一遍
            else -> return super.dispatchKeyEvent(event)
        }
        if (event.action == KeyEvent.ACTION_DOWN && ::web.isInitialized && !webReleased) web.evaluateJavascript("window.TV&&TV.$action", null)
        return true
    }

    override fun onDestroy() {
        if (::web.isInitialized && !webReleased) web.destroy()
        super.onDestroy()
    }
}
