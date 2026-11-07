package com.babytv.tv

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent


class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        val action = intent?.action ?: return
        if (action == Intent.ACTION_BOOT_COMPLETED || action == Intent.ACTION_LOCKED_BOOT_COMPLETED ||
            action == Intent.ACTION_MY_PACKAGE_REPLACED || action == WATCHDOG
        ) {
            if (Prefs.onboarded(context)) {
                try {
                    GateService.start(context)
                } catch (e: Exception) {
                    Prefs.appendGateLog(context, "start fail: " + e.message)
                }
            }
        }
    }

    companion object {
        const val WATCHDOG = "com.babytv.tv.WATCHDOG"
    }
}
