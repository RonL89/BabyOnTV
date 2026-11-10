package com.babyontv.tv

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.view.KeyEvent
import android.view.WindowManager
import android.webkit.WebView

open class MainActivity : Activity() {
    protected lateinit var web: WebView
    private var webReleased = false
    private var page = "quiz"
    private val remote = RemoteKeys { startActivity(Intent(this, ParentActivity::class.java)) }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (!AdminAuth.configured(this)) {
            startActivity(Intent(this, ParentActivity::class.java)); finish(); return
        }
        if (!Prefs.onboarded(this)) {
            startActivity(Intent(this, OnboardingActivity::class.java)); finish(); return
        }
        DeviceRuntime.ensure(this)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        if (DeviceBridge.isTv(this)) requestedOrientation = android.content.pm.ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE
        val reason = intent.getStringExtra("reason")
        page = if (this is GateActivity && reason != null && reason != "timeup") "lock?reason=$reason" else "quiz"
        createWeb()
        GateService.start(this)
    }

    /** 每次回到学习页都检查一次（6 小时内用缓存，不会频繁联网） */
    private fun checkCrashReport() {
        if (!CrashDetector.hasPending(this)) return
        CrashDetector.clear(this)
    }

    private fun checkUpdate() {
        if (this is GateActivity) return
        Updater.check(this) { info ->
            val newer = Updater.newerThanCurrent(this, info) ?: return@check
            runOnUiThread {
                if (isFinishing) return@runOnUiThread
                val raw = DeviceBridge(this).updateInfo()
                if (newer.force) startActivity(Intent(this, UpdateActivity::class.java).putExtra("payload", raw))
                else if (::web.isInitialized && !webReleased) web.evaluateJavascript("window.BOTV_UPDATE&&BOTV_UPDATE($raw)", null)
            }
        }
    }

    private fun createWeb() {
        web = WebShell(this).create(Prefs.localBase(this) + "#/$page")
        web.addJavascriptInterface(DeviceBridge(this, false, web), "BOTVNative")
        setContentView(web)
        web.requestFocus()
        webReleased = false
    }

    override fun onStop() {
        super.onStop()
        MediaPause.release(this)
        AudioPlayer.stop()
        // 正在等原生输入页（填空题）回传答案时不能销毁 WebView：
        // 输入页会把结果写回当前 WebView，destroy() 后 JS 上下文消失，
        // AnswerInput 的重投全部落在死实例上，表现为「点确定回到题目还是空的」。
        val awaitingInput = AnswerInput.active
        if (DeviceBridge.isTv(this) && ::web.isInitialized && !webReleased && !awaitingInput) {
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
            web.evaluateJavascript("window.BOTV_RESUME&&BOTV_RESUME()", null)
        }
    }

    override fun onResume() {
        super.onResume()
        if (Prefs.onboarded(this)) GateService.ensureRunning(this, "app")
        if (this is GateActivity && !DeviceRuntime.learning.status().optBoolean("free")) MediaPause.pause(this)
        if (webReleased) createWeb()
        checkCrashReport()
        checkUpdate()
        if (::web.isInitialized && !webReleased) web.evaluateJavascript("window.BOTV_RESUME&&BOTV_RESUME()", null)
    }

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        // 手机 / 平板的回车键交给网页输入框
        if (!DeviceBridge.isTv(this) && event.keyCode == KeyEvent.KEYCODE_ENTER) return super.dispatchKeyEvent(event)
        val view = if (::web.isInitialized && !webReleased) web else null
        return remote.handle(view, event) || super.dispatchKeyEvent(event)
    }

    override fun onDestroy() {
        if (::web.isInitialized && !webReleased) web.destroy()
        super.onDestroy()
    }
}
