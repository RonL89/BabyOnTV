package com.babyontv.tv

import android.annotation.SuppressLint
import android.content.Context
import android.view.KeyEvent
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import java.net.HttpURLConnection
import java.net.URL

class WebShell(private val context: Context) {

    @SuppressLint("SetJavaScriptEnabled")
    fun create(url: String): WebView {
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)
        val web = WebView(context)
        web.setBackgroundColor(TvUi.background(context))
        web.isFocusable = true
        web.isFocusableInTouchMode = true

        val s = web.settings
        s.javaScriptEnabled = true
        s.domStorageEnabled = true
        s.databaseEnabled = true
        s.cacheMode = WebSettings.LOAD_NO_CACHE
        s.loadsImagesAutomatically = true
        s.blockNetworkImage = false
        s.mediaPlaybackRequiresUserGesture = false
        s.allowFileAccess = false
        s.setSupportZoom(false)
        s.builtInZoomControls = false
        s.displayZoomControls = false
        s.useWideViewPort = false
        s.loadWithOverviewMode = false
        web.setInitialScale(100)
        s.userAgentString = s.userAgentString + " BabyOnTV/${BuildConfig.VERSION_NAME} (Android)"

        web.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView?, url: String?): Boolean {
                return !isAllowed(url)
            }
        }
        web.webChromeClient = WebChromeClient()
        web.loadUrl(url)
        return web
    }

    /** 后台预预热本机 HTTP 服务，门禁弹出时网页能立刻加载（老电视首次加载本机页面要 1–2 秒） */
    fun warmUp(url: String) {
        Thread {
            try {
                val c = URL(url).openConnection() as HttpURLConnection
                c.requestMethod = "HEAD"
                c.connectTimeout = 3000
                c.readTimeout = 3000
                c.connect()
                c.inputStream?.close()
                c.disconnect()
            } catch (_: Throwable) {
            }
        }.apply { isDaemon = true }.start()
    }

    companion object {
        /** 只允许加载本机学习页，外链一律拦截 */
        fun isAllowed(url: String?): Boolean {
            if (url == null || url == "about:blank") return true
            val base = PrefsHolder.baseUrl ?: return false
            return try {
                val target = URL(url)
                val source = URL(base)
                target.protocol == source.protocol && target.host == source.host && target.port == source.port
            } catch (_: Throwable) {
                false
            }
        }

        /** 仅配置 WebView settings，不执行 loadUrl —— 供桥接先注入场景使用 */
        @SuppressLint("SetJavaScriptEnabled")
        fun configureSettings(web: WebView) {
            web.setBackgroundColor(android.graphics.Color.parseColor("#141414"))
            web.isFocusable = true
            web.isFocusableInTouchMode = true

            val s = web.settings
            s.javaScriptEnabled = true
            s.domStorageEnabled = true
            s.databaseEnabled = true
            s.cacheMode = WebSettings.LOAD_NO_CACHE
            s.loadsImagesAutomatically = true
            s.blockNetworkImage = false
            s.mediaPlaybackRequiresUserGesture = false
            s.allowFileAccess = false
            s.setSupportZoom(false)
            s.builtInZoomControls = false
            s.displayZoomControls = false
            s.useWideViewPort = false
            s.loadWithOverviewMode = false
            web.setInitialScale(100)
            s.userAgentString = s.userAgentString + " BabyOnTV/${BuildConfig.VERSION_NAME} (Android)"

            web.webViewClient = object : WebViewClient() {
                override fun shouldOverrideUrlLoading(view: WebView?, url: String?): Boolean {
                    return !isAllowed(url)
                }
            }
            web.webChromeClient = WebChromeClient()
        }

        object PrefsHolder {
            @Volatile
            var baseUrl: String? = null
        }
    }
}
