package com.babyontv.tv

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.widget.Toast

/**
 * 系统权限页跳转的唯一实现。
 *
 * 电视 / 盒子固件对标准 Settings Action 的支持参差不齐，所以每个入口都带一条
 * 「精确 → 通用 → 应用详情 → 系统设置首页」的回退链，逐个 try 直到成功。
 * 之前 OnboardingActivity、SettingsActivity、面板桥各写了一份，行为容易漂移，统一到这里。
 */
object PermissionIntents {

    /** 打开前必须调用：让 GateService 知道是家长在操作，暂停门禁与计时 */
    fun beginParentTrip(activity: Activity) {
        GateService.openingSystemPage(parentAuthorized = true)
    }

    fun openOverlay(activity: Activity) =
        launch(activity, Settings.ACTION_MANAGE_OVERLAY_PERMISSION, packageSpecific = true)

    fun openAccessibility(activity: Activity) =
        launch(activity, Settings.ACTION_ACCESSIBILITY_SETTINGS)

    fun openUsageAccess(activity: Activity) =
        launch(activity, Settings.ACTION_USAGE_ACCESS_SETTINGS)

    fun openBatteryExemption(activity: Activity) {
        if (Build.VERSION.SDK_INT >= 23) {
            launch(activity, Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
                packageSpecific = true, fallback = Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)
        } else openAppDetails(activity)
    }

    fun openDeviceAdmin(activity: Activity) {
        if (UninstallGuard.active(activity)) launch(activity, Settings.ACTION_SECURITY_SETTINGS)
        else try {
            activity.startActivity(UninstallGuard.requestIntent(activity))
        } catch (_: Exception) {
            Toast.makeText(activity, "这台设备不支持设备管理应用，无法开启防卸载", Toast.LENGTH_LONG).show()
        }
    }

    fun openAppDetails(activity: Activity) =
        launch(activity, Settings.ACTION_APPLICATION_DETAILS_SETTINGS, packageSpecific = true)

    /** 面板桥用的字符串键；未知键退到应用详情页 */
    fun openByKey(activity: Activity, key: String) {
        when (key) {
            "overlay" -> openOverlay(activity)
            "accessibility" -> openAccessibility(activity)
            "usage" -> openUsageAccess(activity)
            "battery" -> openBatteryExemption(activity)
            "uninstall" -> openDeviceAdmin(activity)
            "details" -> openAppDetails(activity)
            else -> openAppDetails(activity)
        }
    }

    private fun launch(activity: Activity, action: String, packageSpecific: Boolean = false, fallback: String? = null) {
        beginParentTrip(activity)
        val options = mutableListOf<Intent>()
        options.add(Intent(action).apply { if (packageSpecific) data = Uri.parse("package:" + activity.packageName) })
        if (packageSpecific) options.add(Intent(action))
        if (fallback != null) options.add(Intent(fallback))
        options.add(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + activity.packageName)))
        options.add(Intent(Settings.ACTION_SETTINGS))
        for (intent in options) try { activity.startActivity(intent); return } catch (_: Exception) { }
        Toast.makeText(activity, "请在系统设置中调整权限", Toast.LENGTH_SHORT).show()
    }
}
