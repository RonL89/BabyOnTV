package com.babyontv.tv

import android.content.Context
import android.os.Build
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream

/**
 * 本机诊断日志：只保留最近的运行信息，不上传。
 * 面板可以查看和导出，方便排查电视上的权限、计时、音频和更新问题。
 *
 * 第 2 版（v1.1.0）：
 * - write() 加了按行分级丢弃，Broken pipe / SocketException 这类客户端断开不再写进日志，
 *   避免「日志自己把自己刷爆」；
 * - export() 全程容错：任何一个日志文件或任何一段诊断 JSON 出问题都只影响那一条，
 *   不会让整个 zip 变成半截（半截 zip 是「点了导出没反应」的直接原因之一）。
 */
object Diag {
    private const val FILE = "botv.log"
    private const val MAX_BYTES = 1024 * 1024L
    private const val KEEP = 3

    /** 同一 (tag, message) 连续重复时的噪音闸门：默认每 10 秒最多落一条 */
    private const val NOISE_WINDOW_MS = 10_000L
    private const val NOISE_LEVEL = "N"

    private val format = SimpleDateFormat("MM-dd HH:mm:ss.SSS", Locale.US)
    private val lock = Any()
    private var noiseKey = ""
    private var noiseAt = 0L
    private var noiseSkipped = 0

    private fun dir(context: Context): File = File(context.filesDir, "logs").apply { mkdirs() }

    /** 面板点导出时用的是浏览器下载，会把整帧日志刷成「已断开」；这些不是故障，不该进日志 */
    private fun isClientGone(message: String): Boolean {
        val m = message.lowercase()
        return m.contains("broken pipe") || m.contains("socketexception") ||
            m.contains("connection reset") || m.contains("econnreset") || m.contains("epipe")
    }

    fun write(level: String, tag: String, message: String) {
        // 噪音闸门放在加锁之前，避免高频重复把锁抢满
        val key = tag + "|" + level + "|" + message
        var skipped: Int
        synchronized(lock) {
            val now = android.os.SystemClock.elapsedRealtime()
            if (key == noiseKey && now - noiseAt < NOISE_WINDOW_MS) {
                noiseSkipped++
                return
            }
            skipped = noiseSkipped
            noiseSkipped = 0
            noiseKey = key
            noiseAt = now
        }
        val suffix = if (skipped > 0) "（同类日志已折叠 $skipped 条）" else ""
        append(level, tag, message + suffix)
    }

    private fun append(level: String, tag: String, message: String) {
        synchronized(lock) {
            try {
                val context = DeviceRuntime.appContext
                rotate(context)
                val line = format.format(Date()) + " " + level + "/" + tag + " " +
                    Thread.currentThread().name + ": " + message + "\n"
                File(dir(context), FILE).appendText(line)
                android.util.Log.println(if (level == "E") android.util.Log.ERROR else android.util.Log.INFO, "BabyOnTV-" + tag, message)
            } catch (_: Throwable) { }
        }
    }

    fun info(tag: String, message: String) {
        if (isClientGone(message)) return
        write("I", tag, message)
    }

    fun warn(tag: String, message: String) {
        if (isClientGone(message)) return
        write("W", tag, message)
    }

    fun error(tag: String, message: String, throwable: Throwable? = null) {
        if (isClientGone(message) || (throwable != null && isClientGone(throwable.toString()))) return
        write("E", tag, message + (throwable?.let { " | " + it.javaClass.simpleName + ": " + (it.message ?: "") } ?: ""))
        if (throwable != null) write("E", tag, throwable.stackTraceToString().take(8000))
    }

    private fun rotate(context: Context) {
        val current = File(dir(context), FILE)
        if (!current.exists() || current.length() < MAX_BYTES) return
        for (i in KEEP - 1 downTo 1) {
            val from = File(dir(context), if (i == 1) FILE else FILE + "." + i)
            val to = File(dir(context), FILE + "." + (i + 1))
            if (from.exists()) { to.delete(); from.renameTo(to) }
        }
        current.renameTo(File(dir(context), FILE + ".1"))
    }

    fun read(context: Context, limit: Int = 500, query: String = ""): JSONArray {
        val lines = ArrayList<String>()
        val files = (KEEP downTo 1).map { File(dir(context), FILE + "." + it) } + File(dir(context), FILE)
        // 只读文件尾部：日志页会反复刷新，整份 1 MB × 4 全读进来会把电视的 IO 打满
        files.forEach { file -> if (file.exists()) try { lines += tailLines(file, limit) } catch (_: Exception) { } }
        val key = query.trim().lowercase()
        val result = JSONArray()
        lines.asSequence().filter { key.isEmpty() || it.lowercase().contains(key) }.toList().takeLast(limit).forEach { result.put(it) }
        return result
    }

    /** 从文件尾部倒着读，凑够 need 行就停；16 KB 一块，避免整份读入内存 */
    internal fun tailLines(file: File, need: Int): List<String> {
        if (need <= 0 || !file.exists()) return emptyList()
        java.io.RandomAccessFile(file, "r").use { raf ->
            val length = raf.length()
            if (length == 0L) return emptyList()
            val chunk = 16 * 1024
            val chunks = ArrayList<ByteArray>()
            var pos = length
            while (pos > 0 && chunks.size < 64) {
                val start = maxOf(0L, pos - chunk)
                val size = (pos - start).toInt()
                val buffer = ByteArray(size)
                raf.seek(start)
                raf.readFully(buffer)
                chunks.add(0, buffer)
                pos = start
                val text = String(concat(chunks), Charsets.UTF_8)
                if (text.count { it == '\n' } > need) break
            }
            if (chunks.isEmpty()) return emptyList()
            var parts = String(concat(chunks), Charsets.UTF_8).split('\n')
            if (pos > 0 && parts.isNotEmpty()) parts = parts.drop(1)
            return parts.map { it.trimEnd('\r') }.filter { it.isNotEmpty() }.takeLast(need)
        }
    }

    private fun concat(chunks: List<ByteArray>): ByteArray {
        var total = 0
        chunks.forEach { total += it.size }
        val out = ByteArray(total)
        var at = 0
        chunks.forEach { System.arraycopy(it, 0, out, at, it.size); at += it.size }
        return out
    }

    @Synchronized
    fun clear(context: Context) {
        try { dir(context).listFiles()?.forEach { it.delete() } } catch (_: Exception) { }
        noiseKey = ""; noiseSkipped = 0
        Diag.info("Log", "log cleared by parent")
    }

    /**
     * 导出诊断包。每一项都单独 try/catch：单个日志文件读失败、某个诊断接口抛异常，
     * 只会让那一条缺失，不会让整个 zip 断在半截（那样浏览器收到的就是一个坏压缩包）。
     */
    fun export(context: Context): ByteArray {
        val out = ByteArrayOutputStream()
        ZipOutputStream(out).use { zip ->
            val files = try { dir(context).listFiles()?.filter { it.isFile } ?: emptyList() } catch (_: Exception) { emptyList() }
            files.forEach { file ->
                try {
                    zip.putNextEntry(ZipEntry("logs/" + file.name))
                    zip.write(file.readBytes())
                    zip.closeEntry()
                } catch (_: Exception) {
                    try { zip.closeEntry() } catch (_: Exception) { }
                }
            }
            putJson(zip, "device.json", deviceInfo(context))
            putJson(zip, "config.json", safe { DeviceRuntime.store.config() })
            putJson(zip, "report.txt", reportText(context).toByteArray())
        }
        return out.toByteArray()
    }

    private fun putJson(zip: ZipOutputStream, name: String, value: Any?) {
        if (value == null) return
        try {
            zip.putNextEntry(ZipEntry(name))
            val text = when (value) {
                is ByteArray -> String(value, Charsets.UTF_8)
                is JSONObject -> value.toString(2)
                else -> value.toString()
            }
            zip.write(text.toByteArray())
            zip.closeEntry()
        } catch (_: Exception) {
            try { zip.closeEntry() } catch (_: Exception) { }
        }
    }

    private inline fun safe(block: () -> JSONObject): JSONObject? = try { block() } catch (_: Exception) { null }

    private fun deviceInfo(context: Context): JSONObject {
        val info = JSONObject()
        info.put("app", "BabyOnTV")
        info.put("version", BuildConfig.VERSION_NAME)
        info.put("versionCode", BuildConfig.VERSION_CODE)
        info.put("flavor", BuildConfig.FLAVOR)
        info.put("package", context.packageName)
        info.put("model", Build.MODEL)
        info.put("manufacturer", Build.MANUFACTURER)
        info.put("android", Build.VERSION.RELEASE)
        info.put("sdk", Build.VERSION.SDK_INT)
        info.put("abi", Build.SUPPORTED_ABIS.joinToString(","))
        info.put("webview", webViewVersion(context))
        info.put("uptimeMinutes", android.os.SystemClock.elapsedRealtime() / 60000)
        info.put("monitor", safe { GateService.diagnostics(context) })
        info.put("autostart", safe { Watchdog.report(context) })
        info.put("update", safe { Updater.status(context) })
        return info
    }

    private fun webViewVersion(context: Context): String = try {
        val pm = context.packageManager
        val pkg = if (Build.VERSION.SDK_INT >= 26) android.webkit.WebView.getCurrentWebViewPackage()?.packageName else "com.google.android.webview"
        if (pkg == null) "" else pm.getPackageInfo(pkg, 0).versionName ?: ""
    } catch (_: Exception) { "" }

    /** 给人看的一段摘要：家长把 zip 发回来之前能直接看出主要配置和权限状态 */
    private fun reportText(context: Context): String {
        val sb = StringBuilder()
        sb.append("BabyOnTV 诊断摘要\n")
        sb.append("版本: ").append(BuildConfig.VERSION_NAME).append(" (").append(BuildConfig.VERSION_CODE).append(")\n")
        sb.append("机型: ").append(Build.MANUFACTURER).append(' ').append(Build.MODEL)
            .append(" Android ").append(Build.VERSION.RELEASE).append(" / API ").append(Build.VERSION.SDK_INT).append('\n')
        sb.append("WebView: ").append(webViewVersion(context)).append('\n')
        sb.append("悬浮窗: ").append(GateOverlay.canDraw(context)).append('\n')
        sb.append("无障碍: ").append(WatchAccessibilityService.connected)
            .append(" (enabled=").append(WatchAccessibilityService.enabled(context)).append(")\n")
        sb.append("使用情况访问: ").append(Foreground.hasUsageAccess(context)).append('\n')
        sb.append("防卸载: ").append(UninstallGuard.active(context)).append('\n')
        sb.append("管控服务: ").append(GateService.running).append('\n')
        sb.append("设备名: ").append(Prefs.deviceName(context)).append('\n')
        return sb.toString()
    }

    fun installCrashHandler() {
        val previous = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { thread, throwable ->
            try {
                write("E", "Crash", "thread=" + thread.name + " " + throwable.javaClass.name + ": " + throwable.message)
                write("E", "Crash", throwable.stackTraceToString().take(12000))
            } catch (_: Throwable) { }
            previous?.uncaughtException(thread, throwable)
        }
    }
}
