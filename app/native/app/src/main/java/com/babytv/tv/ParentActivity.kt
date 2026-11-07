package com.babytv.tv

import android.app.Activity
import android.content.Intent
import android.graphics.Typeface
import android.os.Bundle
import android.text.InputType
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView

class ParentActivity : Activity() {
    private var verified = false
    private var keepVerified = false
    private var pauseInfo: TextView? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        DeviceRuntime.ensure(this)
        form(!AdminAuth.configured(this))
    }

    private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()

    private fun form(setup: Boolean, changing: Boolean = false) {
        val content = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(24), dp(40), dp(24), dp(32))
            setBackgroundColor(0xFFF8F9F6.toInt())
        }
        fun text(value: String, size: Float) = TextView(this).apply {
            text = value; textSize = size; setTextColor(0xFF303B31.toInt()); setPadding(0, dp(10), 0, dp(10))
        }
        content.addView(text(if (setup) "设置管理密码" else "家长验证", 28f))
        content.addView(text(if (setup) "请设置 6–64 位密码。再次连接、打开管理面板和 API 都需要验证。" else "请输入管理密码", 16f))
        val secret = EditText(this).apply {
            hint = if (changing) "新密码" else "管理密码"
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
            setTextColor(0xFF303B31.toInt()); setHintTextColor(0xFF999999.toInt())
            isSingleLine = true
            learningField()
        }
        content.addView(secret)
        val confirm = EditText(this).apply {
            hint = "再次输入密码"; inputType = secret.inputType; isSingleLine = true
            setTextColor(0xFF303B31.toInt()); setHintTextColor(0xFF999999.toInt())
            learningField()
        }
        if (setup) content.addView(confirm)
        val error = text("", 14f)
        error.setTextColor(0xFFFFB020.toInt())
        content.addView(error)
        val submit = Button(this).apply {
            text = if (setup) "保存密码" else "验证并打开连接页"
            learningStyle(primary = true)
        }
        content.addView(submit, LinearLayout.LayoutParams(-1, dp(56)))
        submit.setOnClickListener {
            val value = secret.text.toString()
            if (setup) {
                if (value.length !in 6..64 || value != confirm.text.toString()) {
                    error.text = "密码需要 6–64 位，两次输入须一致"; return@setOnClickListener
                }
                AdminAuth.setPassword(this, value)
                if (!Prefs.onboarded(this)) {
                    startActivity(Intent(this, OnboardingActivity::class.java)); finish(); return@setOnClickListener
                }
                verified = true
                connection()
            } else {
                submit.isEnabled = false
                Thread {
                    val ok = AdminAuth.verify(this, value)
                    runOnUiThread {
                        submit.isEnabled = true
                        if (ok) { verified = true; connection() }
                        else error.text = "密码错误，连续错误 5 次后需等待一分钟"
                    }
                }.start()
            }
        }
        if (setup) content.addView(text("点击标题 5 次，或连续短按遥控器 ↑ 5 次，可重新打开此入口。", 16f))
        setContentView(ScrollView(this).apply { isFillViewport = true; addView(content) })
    }

    private fun connection() {
        val content = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setBackgroundColor(0xFFF8F9F6.toInt()) }

        // 手机/电脑浏览器打开家长面板；电视上只显示地址与常用开关（不再内嵌一份重复页面）
        val info = DeviceRuntime.connection(this)
        val ip = info.optString("ip")
        val port = info.optInt("port", 8099)
        val address = if (ip.isEmpty()) "未连接 Wi-Fi，请先在电视上连接网络" else "http://$ip:$port/admin/"
        content.addView(TextView(this).apply {
            text = "家长面板（手机 / 电脑浏览器直接打开）\n$address\n同一 Wi-Fi 下无需扫码"
            textSize = 20f
            setTextColor(0xFF303B31.toInt())
            setBackgroundColor(0xFFFFF3D6.toInt())
            setPadding(dp(24), dp(20), dp(24), dp(20))
            setLineSpacing(dp(4).toFloat(), 1f)
        })

        val controls = LinearLayout(this)
        fun button(label: String, action: () -> Unit) {
            controls.addView(Button(this).apply { text = label; learningStyle(); setOnClickListener { action() } }, LinearLayout.LayoutParams(0, -2, 1f))
        }
        button("权限设置") { keepVerified = true; startActivity(Intent(this, OnboardingActivity::class.java)) }
        button("修改密码") { form(true, true) }
        button("返回答题") { startActivity(Intent(this, MainActivity::class.java)); finish() }
        content.addView(controls)

        // 休息时段：到点之前孩子端只显示「休息中」并自动退出，家长可随时取消
        val rest = LinearLayout(this)
        fun restButton(label: String, minutes: Int) {
            rest.addView(Button(this).apply {
                text = label
                learningStyle()
                setOnClickListener { setPause(minutes) }
            }, LinearLayout.LayoutParams(0, -2, 1f))
        }
        restButton("休息 1 小时", 60)
        restButton("休息 2 小时", 120)
        restButton("休息 4 小时", 240)
        restButton("取消休息", 0)
        content.addView(rest)

        val tv = TextView(this).apply {
            textSize = 16f
            setTextColor(0xFF303B31.toInt())
            setPadding(dp(24), dp(8), dp(24), dp(8))
            text = pauseText()
        }
        pauseInfo = tv
        content.addView(tv)

        // 严格 / 宽松：严格 = 答对 5 题解锁 10 分钟，其余时间离开 App 会被学习页盖住
        val strictBtn = Button(this).apply {
            text = strictLabel()
            learningStyle()
            setOnClickListener {
                setStrict(!isStrict())
                text = strictLabel()
            }
        }
        content.addView(strictBtn, LinearLayout.LayoutParams(-1, -2))

        // 门禁诊断：一眼看出「为什么没弹学习页」
        content.addView(TextView(this).apply {
            text = "门禁诊断"
            textSize = 18f
            typeface = Typeface.create("sans-serif-medium", Typeface.NORMAL)
            setTextColor(0xFF303B31.toInt())
            setPadding(dp(24), dp(12), dp(24), dp(4))
        })
        val diag = TextView(this).apply {
            text = diagText()
            textSize = 13f
            typeface = Typeface.MONOSPACE
            setTextColor(0xFF303B31.toInt())
            setPadding(dp(24), dp(4), dp(24), dp(8))
        }
        content.addView(diag)
        val diagRow = LinearLayout(this)
        fun diagButton(label: String, action: () -> Unit) {
            diagRow.addView(Button(this).apply {
                text = label
                learningStyle()
                setOnClickListener { action(); diag.text = diagText() }
            }, LinearLayout.LayoutParams(0, -2, 1f))
        }
        diagButton("测试锁屏") { GateService.testGate(this) }
        diagButton("重启门禁") { try { GateService.start(this) } catch (e: RuntimeException) { } }
        diagButton("刷新") { }
        content.addView(diagRow)

        content.addView(Button(this).apply {
            text = "退出应用（回电视桌面）"
            learningStyle()
            setOnClickListener { quitApp() }
        }, LinearLayout.LayoutParams(-1, -2))
        setContentView(ScrollView(this).apply { isFillViewport = true; addView(content) })
    }

    private fun isStrict(): Boolean =
        DeviceRuntime.store.config().optString("playMode", "round") != "practice"

    private fun strictLabel(): String = if (isStrict())
        "答题锁屏：开（答对 5 题解锁 10 分钟）"
    else
        "答题锁屏：关（自由练习，不锁屏）"

    private fun diagText(): String {
        val st = DeviceRuntime.learning.status()
        val sb = StringBuilder()
        sb.append("服务: ").append(if (Prefs.serviceRunning(this)) "运行中" else "未运行").append('\n')
        sb.append("悬浮窗: ").append(if (GateOverlay.canDraw(this)) "已授权" else "未授权")
            .append("  使用情况: ").append(if (Foreground.hasUsageAccess(this)) "已授权" else "未授权").append('\n')
        sb.append("无障碍: ").append(if (WatchAccessibilityService.connected) "已连接" else "未连接").append('\n')
        val leftSec = st.optLong("remainingSeconds")
        sb.append("剩余: ").append(leftSec / 60).append(" 分 ").append(leftSec % 60).append(" 秒")
            .append("  今日: ").append(st.optDouble("usedMinutes").toInt()).append(" 分 / ")
            .append(st.optInt("roundsDoneToday")).append(" 轮\n")
        sb.append("状态: ").append(st.optString("reason").ifEmpty { "可观看" }).append('\n')
        sb.append("最近弹窗: ").append(Prefs.lastGateResult(this).ifEmpty { "无" }).append('\n')
        sb.append("日志:\n").append(Prefs.gateLog(this).takeLast(1200))
        return sb.toString()
    }

    private fun setStrict(on: Boolean) {
        try {
            val next = DeviceRuntime.store.config()
            next.put("playMode", if (on) "round" else "practice")
            if (on) next.put("passRatio", 1.0)
            DeviceRuntime.store.saveConfig(next)
            if (on) try { GateService.start(this) } catch (_: RuntimeException) { }
        } catch (e: Exception) {
        }
    }

    private fun pauseText(): String {
        val until = DeviceRuntime.store.get("pause_until").toLongOrNull() ?: 0L
        val left = (until - System.currentTimeMillis()) / 60000L
        return if (left > 0) "当前休息中，约剩 $left 分钟（孩子端不会出题）" else "当前没有休息时段"
    }

    private fun setPause(minutes: Int) {
        val until = if (minutes <= 0) 0L else System.currentTimeMillis() + minutes * 60000L
        DeviceRuntime.store.set("pause_until", until.toString())
        pauseInfo?.text = pauseText()
    }

    private fun quitApp() {
        // 家长主动退出：停门禁，并在 30 分钟内不再自动弹学习页（孩子重新打开 App 会解除）
        try {
            DeviceRuntime.ensure(this)
            DeviceRuntime.store.set("gate_hold_until", (System.currentTimeMillis() + 30 * 60 * 1000L).toString())
        } catch (_: Exception) {
        }
        try {
            stopService(Intent(this, GateService::class.java))
        } catch (_: Exception) {
        }
        try {
            startActivity(Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        } catch (_: Exception) {
        }
        finishAffinity()
    }

    override fun onResume() {
        super.onResume()
        keepVerified = false
    }

    override fun onStop() {
        super.onStop()
        if (verified && !keepVerified) {
            verified = false
            form(false)
        }
    }
}
