package com.babyontv.tv

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.view.KeyEvent
import android.view.View
import android.view.WindowManager
import android.webkit.WebView
import android.webkit.WebViewClient
import android.webkit.WebChromeClient
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.PopupWindow
import android.graphics.drawable.ColorDrawable
import android.view.Gravity
import android.view.LayoutInflater
import android.widget.Button

open class MainActivity : Activity() {
    protected lateinit var web: WebView
    private var webReleased = false
    private var page = "quiz"
    private val remote = RemoteKeys { startActivity(Intent(this, ParentActivity::class.java)) }
    private var brandPressTime = 0L

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
        // 全屏沉浸式：电视/手机统一隐藏导航栏和状态栏
        window.decorView.systemUiVisibility = (View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY.toInt()
            or View.SYSTEM_UI_FLAG_FULLSCREEN.toInt()
            or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION.toInt()
            or View.SYSTEM_UI_FLAG_LAYOUT_STABLE.toInt()
            or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION.toInt()
            or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN.toInt())
        if (DeviceBridge.isTv(this)) requestedOrientation = android.content.pm.ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE
        val reason = intent.getStringExtra("reason")
        page = if (this is GateActivity && reason != null && reason != "timeup") "lock?reason=$reason" else "quiz"
        createWeb()
        GateService.start(this)
        
        // 监听品牌区长按 (仅 TV 端)
        if (DeviceBridge.isTv(this)) {
            web.setOnTouchListener { _, event ->
                if (event.action == android.view.MotionEvent.ACTION_DOWN) brandPressTime = System.currentTimeMillis()
                else if (event.action == android.view.MotionEvent.ACTION_UP) {
                    if (System.currentTimeMillis() - brandPressTime >= quickPanelThreshold) showQuickPanel()
                } else if (event.action == android.view.MotionEvent.ACTION_CANCEL) {
                    brandPressTime = 0
                }
                false
            }
        }
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
        // 先配置 WebView settings，再注入 JS 接口，最后 loadUrl —— 彻底消除桥接竞态
        web = WebView(this).apply {
            WebShell.configureSettings(this)
            addJavascriptInterface(DeviceBridge(this@MainActivity, false, this), "BOTVNative")
        }
        setContentView(web)
        // 清理缓存 + 版本号 cache-busting，覆盖安装后强制刷新
        web.clearCache(true)
        web.loadUrl("${Prefs.localBase(this)}#/$page?v=${BuildConfig.VERSION_CODE}")
        web.requestFocus()
        webReleased = false
    }

    /** TV端家长控制快捷面板：长按品牌区 1.5s 或按 MENU 键唤出 */
    private var quickPanel: PopupWindow? = null
    private val quickPanelThreshold = 1500L
    
    private fun getQuickPanel(): PopupWindow? = quickPanel
    private fun setQuickPanel(pw: PopupWindow?) { quickPanel = pw }
    
    /** 供 GateService 调用：获取 WebView 引用 */
    internal fun getWebView(): WebView? = web

    private fun showQuickPanel() {
        if (quickPanel?.isShowing == true) return
        val ctx = this@MainActivity
        val p = TvUi.palette(ctx)
        val container = LinearLayout(ctx).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            setBackgroundColor(p.surface)
            setPadding(TvUi.dp(ctx, 24), TvUi.dp(ctx, 20), TvUi.dp(ctx, 24), TvUi.dp(ctx, 20))
            // 圆角
            background = android.graphics.drawable.GradientDrawable().apply {
                setColor(p.surface)
                cornerRadius = TvUi.dp(ctx, 20).toFloat()
            }
        }
        val title = TextView(ctx).apply {
            text = "家长快捷控制"
            textSize = 22f
            setTextColor(p.text)
            typeface = android.graphics.Typeface.create("sans-serif-medium", android.graphics.Typeface.NORMAL)
            gravity = Gravity.CENTER
            setPadding(0, 0, 0, TvUi.dp(ctx, 16))
        }
        container.addView(title)

        val btns = arrayOf(
            "临时解锁 30 分钟" to "quickUnlock(30)",
            "临时解锁 60 分钟" to "quickUnlock(60)",
            "立即锁定" to "quickLock()",
            "恢复规则" to "quickCancel()",
            "关闭管控" to "quickIndefinite()"
        )
        for ((label, js) in btns) {
            val btn = TvUi.button(ctx, label, true) {
                // 调用 WebView JS 接口
                web.evaluateJavascript("window.BOTVNative.$js", null)
                quickPanel?.dismiss()
            }
            container.addView(btn, LinearLayout.LayoutParams(
                android.view.ViewGroup.LayoutParams.MATCH_PARENT,
                android.view.ViewGroup.LayoutParams.WRAP_CONTENT
            ).apply { topMargin = TvUi.dp(ctx, 10) })
        }

        val closeBtn = TvUi.button(ctx, "取消", false) { quickPanel?.dismiss() }
        container.addView(closeBtn, LinearLayout.LayoutParams(
            android.view.ViewGroup.LayoutParams.MATCH_PARENT,
            android.view.ViewGroup.LayoutParams.WRAP_CONTENT
        ).apply { topMargin = TvUi.dp(ctx, 10) })

        val pw = PopupWindow(
            container,
            android.view.ViewGroup.LayoutParams.WRAP_CONTENT,
            android.view.ViewGroup.LayoutParams.WRAP_CONTENT,
            true
        )
        pw.setBackgroundDrawable(ColorDrawable(0))
        pw.elevation = 20f
        pw.isFocusable = true
        pw.isOutsideTouchable = true
        pw.setOnDismissListener { }
        setQuickPanel(pw)

        // 显示在屏幕底部中央
        val root = window.decorView.findViewById<android.view.ViewGroup>(android.R.id.content)
        quickPanel?.showAtLocation(root, Gravity.BOTTOM or Gravity.CENTER_HORIZONTAL, 0, TvUi.dp(ctx, 60))
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
        // TV 端 MENU 键唤出快捷面板
        if (DeviceBridge.isTv(this) && event.keyCode == KeyEvent.KEYCODE_MENU && event.action == KeyEvent.ACTION_DOWN) {
            showQuickPanel()
            return true
        }
        val view = if (::web.isInitialized && !webReleased) web else null
        return remote.handle(view, event) || super.dispatchKeyEvent(event)
    }

    override fun onDestroy() {
        if (::web.isInitialized && !webReleased) web.destroy()
        super.onDestroy()
    }
}
