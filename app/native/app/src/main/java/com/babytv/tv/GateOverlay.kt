package com.babytv.tv

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.PixelFormat
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.view.Gravity
import android.view.KeyEvent
import android.view.View
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.webkit.WebView

class GateOverlay(
    private val context: Context,
    private val windowType: Int,
    private val goHome: (() -> Boolean)? = null
) {
    private val handler = Handler(Looper.getMainLooper())
    private val manager = context.getSystemService(Context.WINDOW_SERVICE) as WindowManager
    private var web: WebView? = null
    private var attached = false
    private var currentReason = ""
    private var backDownAt = 0L
    private val bridge = Bridge()
    val isShowing: Boolean get() = attached

    fun show(reason: String): Boolean {
        if (attached) return true
        val page = if (reason == "timeup") "quiz" else "lock?reason=$reason"
        val view = web ?: WebShell(context).create("about:blank").also { created ->
            created.addJavascriptInterface(bridge, "SOTVNative")
            created.setOnKeyListener { _, key, event ->
                // 长按返回键 3 秒进家长页；短按返回键不放行（防止孩子退出学习页）
                if (key == KeyEvent.KEYCODE_BACK) {
                    if (event.action == KeyEvent.ACTION_DOWN) {
                        val now = android.os.SystemClock.elapsedRealtime()
                        if (event.repeatCount == 0) backDownAt = now
                        else if (backDownAt > 0 && now - backDownAt >= 3000) {
                            backDownAt = 0
                            bridge.openParent()
                            return@setOnKeyListener true
                        }
                    } else if (event.action == KeyEvent.ACTION_UP) {
                        backDownAt = 0
                    }
                    return@setOnKeyListener true
                }
                WebShell(context).dispatchKey(created, key, event)
                true
            }
            web = created
            currentReason = reason
            created.loadUrl(Prefs.localBase(context) + "#/$page")
        }
        if (reason != currentReason) {
            currentReason = reason
            view.loadUrl(Prefs.localBase(context) + "#/$page")
        }
        val params = WindowManager.LayoutParams(-1, -1, windowType,
            WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN, PixelFormat.OPAQUE)
        params.gravity = Gravity.TOP or Gravity.START
        params.title = "BabyTV gate"
        return try {
            view.visibility = View.VISIBLE
            manager.addView(view, params)
            attached = true
            view.requestFocus()
            true
        } catch (e: Exception) {
            hide()
            false
        }
    }

    fun suspend() {
        val view = web ?: return
        if (attached) try { manager.removeViewImmediate(view) } catch (_: Exception) { }
        attached = false
    }

    fun hide() {
        val view = web ?: return
        suspend()
        web = null
        view.destroy()
    }

    private inner class Bridge {
        @JavascriptInterface fun apiToken(): String = AdminAuth.deviceToken
        @JavascriptInterface fun isGate(): Boolean = true
        @JavascriptInterface fun deviceInfo(): String = org.json.JSONObject()
            .put("platform", if (DeviceBridge.isTv(context)) "android-tv" else "android").toString()
        @JavascriptInterface fun answerInput(voice: Boolean) {
            handler.post {
                web?.let { InputSupport.open(context, it, voice) }
                if (InputSupport.active) suspend()
            }
        }
        @JavascriptInterface fun openParent() {
            handler.post {
                GateService.hideGates()
                hide()
                context.startActivity(Intent(context, ParentActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            }
        }
        @JavascriptInterface fun exitToLauncher() {
            // 门禁浮层里不允许退出（否则浮层收起→1.8 秒后又拉起，会闪烁）；家长走长按返回键
        }
    }

    companion object {
        @Suppress("DEPRECATION")
        fun applicationWindowType(): Int = if (Build.VERSION.SDK_INT >= 26)
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY else WindowManager.LayoutParams.TYPE_PHONE

        fun canDraw(context: Context): Boolean = try {
            if (Build.VERSION.SDK_INT >= 23) Settings.canDrawOverlays(context)
            else context.checkCallingOrSelfPermission(android.Manifest.permission.SYSTEM_ALERT_WINDOW) == PackageManager.PERMISSION_GRANTED
        } catch (_: Exception) { false }
    }
}
