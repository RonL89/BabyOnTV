package com.babytv.tv

import android.app.Activity
import android.app.UiModeManager
import android.content.Context
import android.content.Intent
import android.content.res.Configuration
import android.os.Build
import android.webkit.JavascriptInterface
import org.json.JSONObject

open class DeviceBridge(protected val activity: Activity, private val connectionAllowed: Boolean = false, private val web: android.webkit.WebView? = null) {
    @JavascriptInterface
    fun answerInput(voice: Boolean) {
        activity.runOnUiThread { web?.let { InputSupport.open(activity, it, voice) } }
    }

    @JavascriptInterface
    fun playAudio(filename: String) {
        if (filename.isBlank()) return
        val safe = filename.substringAfterLast('/')
        activity.runOnUiThread { AudioPlayer.play(activity, safe) }
    }

    @JavascriptInterface
    fun stopAudio() {
        activity.runOnUiThread { AudioPlayer.stop() }
    }

    @JavascriptInterface
    fun apiToken(): String = AdminAuth.deviceToken

    @JavascriptInterface
    fun deviceInfo(): String = JSONObject().put("platform", if (isTv(activity)) "android-tv" else "android")
        .put("model", Build.MODEL).put("version", BuildConfig.VERSION_NAME).toString()

    @JavascriptInterface
    fun lanInfo(): String = if (connectionAllowed) DeviceRuntime.connection(activity).toString() else ""

    @JavascriptInterface
    fun openParent() {
        activity.runOnUiThread {
            activity.startActivity(Intent(activity, ParentActivity::class.java))
        }
    }

    @JavascriptInterface
    fun exitToLauncher() {
        // 孩子答完题、或家长按「退出」时都要能离开答题界面：
        // 练习模式没有攒观看时长，不能再被「学习时间未到」挡住（否则只能重启电视）。
        activity.runOnUiThread {
            AudioPlayer.stop()
            GateService.hideGates()
            if (isTv(activity)) {
                activity.startActivity(Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            }
            if (activity is GateActivity) activity.finish() else activity.moveTaskToBack(true)
        }
    }

    @JavascriptInterface
    fun backToQuiz() {
        activity.runOnUiThread {
            activity.startActivity(Intent(activity, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP))
            if (activity is ParentActivity) activity.finish()
        }
    }

    @JavascriptInterface
    fun updateInfo(): String {
        val info = Updater.newerThanCurrent(activity, Updater.cachedInfo(activity)) ?: return ""
        return JSONObject().put("latest", info.latest).put("current", info.current)
            .put("notes", info.notes).put("url", info.url).put("force", info.force).toString()
    }

    @JavascriptInterface
    fun installUpdate(url: String, latest: String, notes: String) {
        activity.runOnUiThread {
            activity.startActivity(Intent(activity, UpdateActivity::class.java).putExtra("payload", JSONObject()
                .put("latest", latest).put("current", BuildConfig.VERSION_NAME).put("notes", notes).put("url", url).toString()))
        }
    }

    companion object {
        fun isTv(context: Context): Boolean = BuildConfig.FLAVOR == "tv"
    }
}
