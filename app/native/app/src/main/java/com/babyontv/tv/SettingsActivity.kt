package com.babyontv.tv

import android.app.Activity
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.view.Gravity
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView

/**
 * 电视端原生「权限与设置」页。
 *
 * 用户报的「权限开关遥控器不能操作」指的是系统设置里那两个开关（允许出现在其他应用上 /
 * 允许访问使用记录）——电视上没有浏览器、也进不去手机面板，之前唯一能到那一页的
 * OnboardingActivity 在引导完成后就 finish 了，等于永久失去入口。
 * 这一页就是那个常驻入口：每一行都能用遥控器上下选中、确定直接跳到对应的系统设置页，
 * 返回键回到家长连接页。
 */
class SettingsActivity : Activity() {
    private data class Item(val row: TvUi.Row, val enabled: () -> Boolean, val optional: Boolean)
    private val items = mutableListOf<Item>()
    private lateinit var statusTitle: TextView
    private lateinit var statusDesc: TextView
    private val handler = android.os.Handler(android.os.Looper.getMainLooper())
    private val refreshStatus = object : Runnable {
        override fun run() { refresh(); handler.postDelayed(this, 1000) }
    }
    private val tv get() = DeviceBridge.isTv(this)
    private fun dp(value: Int) = TvUi.dp(this, value)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        DeviceRuntime.ensure(this)
        if (tv) requestedOrientation = android.content.pm.ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE
        val p = TvUi.palette(this)
        window.decorView.setBackgroundColor(p.bg)

        val root = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }

        // 顶部标题 + 整体状态
        val header = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(40), dp(28), dp(40), dp(8))
        }
        header.addView(TvUi.text(this, "权限与设置", if (tv) 30f else 24f, p.text, true))
        statusTitle = TvUi.text(this, "", if (tv) 17f else 14f, p.text, true)
        statusDesc = TvUi.text(this, "", if (tv) 14f else 12f, p.text2)
        header.addView(statusTitle, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(10) })
        header.addView(statusDesc, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(2) })
        root.addView(header)

        // 权限列表：整行可选中，遥控器上下移动焦点、确定跳系统设置页
        val scroll = ScrollView(this).apply { isFillViewport = true }
        val list = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(40), dp(12), dp(40), dp(8))
        }
        scroll.addView(list)
        root.addView(scroll, LinearLayout.LayoutParams(-1, 0, 1f))

        fun add(iconRes: Int, title: String, description: String, optional: Boolean, enabled: () -> Boolean, action: () -> Unit) {
            val row = TvUi.row(this, iconRes, title, description, action)
            items.add(Item(row, enabled, optional))
            list.addView(row.view, LinearLayout.LayoutParams(-1, -2).apply { bottomMargin = dp(if (tv) 8 else 10) })
        }

        add(android.R.drawable.ic_menu_view, "允许出现在其他应用上", "到时间后在其他应用上方显示学习页，必须开启", false,
            { GateOverlay.canDraw(this) }, { PermissionIntents.openOverlay(this) })
        add(android.R.drawable.ic_menu_manage, "无障碍服务",
            if (tv) "及时识别应用切换，部分电视不支持" else "及时识别应用切换", true,
            { WatchAccessibilityService.connected }, { PermissionIntents.openAccessibility(this) })
        add(android.R.drawable.ic_menu_recent_history, "允许访问使用记录", "只统计其他应用的使用时长，让计时更准", true,
            { Foreground.hasUsageAccess(this) }, { PermissionIntents.openUsageAccess(this) })
        add(android.R.drawable.ic_lock_idle_alarm, "后台运行", "关闭电池优化，减少被系统清理", true,
            { Build.VERSION.SDK_INT < 23 || ignoringBattery() }, { PermissionIntents.openBatteryExemption(this) })
        add(android.R.drawable.ic_lock_lock, "防卸载", "孩子无法直接删除应用，家长可随时关闭", true,
            { UninstallGuard.active(this) }, { PermissionIntents.openDeviceAdmin(this) })

        val tip = TvUi.text(this, if (tv)
            "部分电视没有“电池优化”，可在系统“应用管理”里允许自启动。"
        else "部分手机还需要在系统设置里允许“自启动”或“后台活动”。", if (tv) 13f else 12f, p.text3)
        tip.setPadding(dp(40), 0, dp(40), dp(8))
        root.addView(tip)

        val actions = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(40), dp(4), dp(40), dp(24))
        }
        actions.addView(TvUi.button(this, "打开管理面板", true) {
            GateService.openingSystemPage(parentAuthorized = true)
            startActivity(Intent(this, ParentActivity::class.java).putExtra("openAdmin", true))
        }, LinearLayout.LayoutParams(0, dp(if (tv) 56 else 48), 1f))
        actions.addView(TvUi.button(this, "返回答题") {
            startActivity(Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP))
            finish()
        }, LinearLayout.LayoutParams(0, dp(if (tv) 56 else 48), 1f).apply { leftMargin = dp(12) })
        root.addView(actions)

        setContentView(root)
        refresh()
        // 第一个还没开启的权限获得焦点；都开好了就落在第一个按钮
        (items.firstOrNull { !it.enabled() }?.row?.view)?.requestFocus()
    }

    private fun ignoringBattery(): Boolean {
        if (Build.VERSION.SDK_INT < 23) return true
        return try {
            (getSystemService(POWER_SERVICE) as android.os.PowerManager).isIgnoringBatteryOptimizations(packageName)
        } catch (_: Exception) { false }
    }

    private fun refresh() {
        if (!::statusTitle.isInitialized) return
        val p = TvUi.palette(this)
        items.forEach { val on = it.enabled()
            it.row.setStatus(if (on) "已开启" else if (it.optional) "可选 · 去开启" else "必须 · 去开启", on) }
        val overlay = GateOverlay.canDraw(this)
        val usage = Foreground.hasUsageAccess(this)
        val (title, description) = when {
            overlay && (WatchAccessibilityService.connected || usage) ->
                Pair("已就绪", "到时间会自动显示学习页，计时准确")
            overlay -> Pair("基本可用", "离开学习页后按亮屏时间计时")
            usage -> Pair("可以记录使用时间", "开启「允许出现在其他应用上」后，才能在到时间时显示学习页")
            else -> Pair("尚未开启", "至少开启「允许出现在其他应用上」")
        }
        statusTitle.text = title
        statusTitle.setTextColor(if (overlay) p.ok else p.warn)
        statusDesc.text = description
    }

    override fun onResume() {
        super.onResume()
        handler.removeCallbacks(refreshStatus)
        handler.post(refreshStatus)
    }

    override fun onPause() {
        handler.removeCallbacks(refreshStatus)
        super.onPause()
    }
}
