package com.babyontv.tv

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.text.InputType
import android.webkit.WebView

class ParentActivity : Activity() {
    private var verified = false
    private var web: WebView? = null
    private val tv get() = DeviceBridge.isTv(this)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        DeviceRuntime.ensure(this)
        if (AdminAuth.configured(this) && AdminAuth.recentlyVerified()) {
            verified = true
            // 从「权限与设置」页过来时直接进管理面板
            if (intent.getBooleanExtra("openAdmin", false)) adminPanel() else connection()
        } else form(!AdminAuth.configured(this))
    }

    private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()

    fun changePassword() = form(true, true)

    private fun form(setup: Boolean, changing: Boolean = false) {
        val tv = DeviceBridge.isTv(this)
        val content = android.widget.LinearLayout(this).apply {
            orientation = android.widget.LinearLayout.VERTICAL
            gravity = if (tv) android.view.Gravity.CENTER_HORIZONTAL else android.view.Gravity.NO_GRAVITY
            setPadding(dp(24), dp(if (tv) 28 else 40), dp(24), dp(32))
            setBackgroundColor(TvUi.background(this@ParentActivity))
        }
        val column = android.widget.LinearLayout(this).apply { orientation = android.widget.LinearLayout.VERTICAL }
        content.addView(column, android.widget.LinearLayout.LayoutParams(if (tv) dp(520) else -1, -2))
        fun text(value: String, size: Float, color: Int = TvUi.foreground(this)) = android.widget.TextView(this).apply {
            text = value; textSize = size; setTextColor(color); setPadding(0, dp(8), 0, dp(8))
        }
        column.addView(text(if (changing) "修改管理密码" else if (setup) "设置管理密码" else "家长验证", if (tv) 32f else 28f).apply { paint.isFakeBoldText = true })
        column.addView(text(if (setup) "请设置 6–64 位密码。再次连接、打开管理面板和 API 都需要验证。" else "请输入管理密码", 15f, TvUi.muted(this)))
        val secret = android.widget.EditText(this).apply {
            hint = if (changing) "新密码" else "管理密码"
            // 注意顺序：isSingleLine 内部会重设 inputType，必须放在最前面，
            // 否则密码类型和遮罩都会被清掉，密码就明文显示了
            isSingleLine = true
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
            transformationMethod = android.text.method.PasswordTransformationMethod.getInstance()
            imeOptions = android.view.inputmethod.EditorInfo.IME_ACTION_NEXT or android.view.inputmethod.EditorInfo.IME_FLAG_NO_EXTRACT_UI
            TvUi.field(this)
        }
        column.addView(secret, android.widget.LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(8) })
        val confirm = android.widget.EditText(this).apply {
            hint = "再次输入密码"
            isSingleLine = true
            inputType = secret.inputType
            transformationMethod = android.text.method.PasswordTransformationMethod.getInstance()
            imeOptions = android.view.inputmethod.EditorInfo.IME_ACTION_DONE or android.view.inputmethod.EditorInfo.IME_FLAG_NO_EXTRACT_UI
            TvUi.field(this)
        }
        if (setup) column.addView(confirm, android.widget.LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(12) })
        val error = text("", 14f, TvUi.palette(this).warn)
        column.addView(error)
        lateinit var submit: android.widget.Button
        fun go() {
            if (!submit.isEnabled) return
            val value = secret.text.toString()
            if (setup) {
                if (value.length !in 6..64 || value != confirm.text.toString()) {
                    error.text = "密码需要 6–64 位，两次输入须一致"; return
                }
                AdminAuth.setPassword(this, value)
                AdminAuth.markVerified()
                if (!Prefs.onboarded(this)) {
                    startActivity(Intent(this, OnboardingActivity::class.java)); finish(); return
                }
                verified = true
                connection()
            } else {
                submit.isEnabled = false
                submit.text = "正在验证…"
                error.text = ""
                Thread {
                    val ok = AdminAuth.verify(this, value)
                    runOnUiThread {
                        if (isFinishing) return@runOnUiThread
                        submit.isEnabled = true
                        submit.text = "验证并打开连接页"
                        if (ok) { AdminAuth.markVerified(); verified = true; connection() }
                        else { error.text = "密码错误，连续错误 5 次后需等待一分钟"; secret.setText(""); secret.requestFocus() }
                    }
                }.start()
            }
        }
        submit = TvUi.button(this, if (setup) "保存密码" else "验证并打开连接页", true) { go() }
        column.addView(submit, android.widget.LinearLayout.LayoutParams(-1, dp(56)).apply { topMargin = dp(4) })
        (if (setup) confirm else secret).setOnEditorActionListener { _, _, _ -> go(); true }
        if (!setup || changing) column.addView(TvUi.button(this, if (changing) "取消" else "返回答题") {
            if (changing) connection() else { startActivity(Intent(this, MainActivity::class.java)); finish() }
        }, android.widget.LinearLayout.LayoutParams(-1, dp(52)).apply { topMargin = dp(12) })
        // 电视端：原生入口进入「权限与设置」与「打开管理面板」
        if (tv) {
            column.addView(TvUi.button(this, "权限与设置") { startActivity(Intent(this, SettingsActivity::class.java)) },
                android.widget.LinearLayout.LayoutParams(-1, dp(52)).apply { topMargin = dp(12) })
            column.addView(TvUi.button(this, "打开管理面板") { adminPanel() },
                android.widget.LinearLayout.LayoutParams(-1, dp(52)).apply { topMargin = dp(12) })
        }
        if (setup && !changing) column.addView(text(if (tv) "之后在学习页最上方连续短按遥控器 ↑ 5 次，可重新打开此入口。" else "之后在学习页连续点击左上角标题 5 次，可重新打开此入口。", 14f, TvUi.muted(this)))
        setContentView(android.widget.ScrollView(this).apply { isFillViewport = true; setBackgroundColor(TvUi.background(this@ParentActivity)); addView(content) })
        secret.requestFocus()
    }

    private fun connection() {
        // 权限设置 / 修改密码 / 返回答题都放在网页里，方便遥控器在同一个页面里移动焦点
        currentFocus?.let { (getSystemService(INPUT_METHOD_SERVICE) as android.view.inputmethod.InputMethodManager).hideSoftInputFromWindow(it.windowToken, 0) }
        showPage(Prefs.localBase(this) + "#/pair")
    }

    /**
     * 电视端直接在 WebView 里打开家长管理面板（/admin/ 与学习页同源，WebShell 放行）。
     * 面板自带遥控器焦点导航；登录需要输入管理密码，遥控器可呼出系统输入法。
     */
    private fun adminPanel() {
        showPage(Prefs.localBase(this) + "admin/")
    }

    private fun showPage(url: String) {
        currentFocus?.let { (getSystemService(INPUT_METHOD_SERVICE) as android.view.inputmethod.InputMethodManager).hideSoftInputFromWindow(it.windowToken, 0) }
        web?.destroy()
        web = WebShell(this).create(url).also {
            it.addJavascriptInterface(DeviceBridge(this, true, it), "BOTVNative")
        }
        setContentView(web)
        web?.requestFocus()
    }

    private var stoppedAt = 0L

    override fun onStop() {
        super.onStop()
        stoppedAt = android.os.SystemClock.elapsedRealtime()
    }

    override fun onStart() {
        super.onStart()
        // 去系统权限页转一圈回来不用重新输密码；离开超过 1 分钟才重新验证
        if (verified && stoppedAt > 0 && android.os.SystemClock.elapsedRealtime() - stoppedAt > 60000) {
            verified = false
            web?.destroy(); web = null
            form(false)
        }
    }

    override fun onDestroy() {
        web?.destroy(); web = null
        super.onDestroy()
    }
}
