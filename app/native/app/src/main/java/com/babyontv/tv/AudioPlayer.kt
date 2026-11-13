package com.babyontv.tv

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.MediaPlayer
import java.io.File

/**
 * 离线语音播放器：串行播放队列（同一时刻只响一段，但排队时互不打断）。
 *
 * 为什么需要队列：渲染一道题时前端会连续请求「题干音」和「选项音」。
 * 旧实现 play() 第一句就 stop()，后一条请求会把前一条当场掐掉，
 * 结果孩子听到的永远是选项音，题干本身从来没被读过。
 *
 * 优先级：题干（q_N.mp3）与音效（sfx_*.mp3）打断当前朗读并清空积压；
 * 选项音（q_N_opt_i.mp3）在后面排队，等题干读完再播。
 *
 * 优先用 AssetFileDescriptor 直接播放（构建时已对 mp3 设置 noCompress）；
 * 若 assets 被压缩导致 openFd 失败，则复制到缓存目录再播放。
 *
 * 语音走 STREAM_SYSTEM（用 legacy stream type 固定），刻意避开 STREAM_MUSIC：
 * 海信 VIDAA 的视频播放器不理会暂停键时，MediaPause 会把整个音乐流静音，
 * 若语音也在音乐流上就会被一起压掉，导致答题时「部分题没声音」。
 */
object AudioPlayer {
    /** 积压上限：遥控器连按方向键时避免语音排成长队 */
    private const val MAX_QUEUE = 6

    private val lock = Any()
    private var player: MediaPlayer? = null
    private var current = ""
    private var app: Context? = null
    private val queue = ArrayList<String>()

    /** 是否正在朗读（供 MediaPause 在朗读期间不静音，作为双保险） */
    @Volatile
    var speaking: Boolean = false
        private set

    /** 当前正在播放的文件名（诊断用） */
    @Volatile
    var currentFile: String = ""
        private set

    fun play(context: Context, filename: String) {
        if (filename.isEmpty()) return
        synchronized(lock) {
            app = context.applicationContext
            if (isForeground(filename)) {
                // 题干与音效优先：打断当前朗读，丢掉还在排队的旧内容
                queue.clear()
                if (current == filename && player != null) return
                startLocked(filename)
            } else {
                if (current == filename || queue.contains(filename)) return
                if (player == null) {
                    startLocked(filename)
                } else {
                    if (queue.size >= MAX_QUEUE) queue.removeAt(0)
                    queue.add(filename)
                    Diag.info("Audio", "queue file=" + filename + " size=" + queue.size)
                }
            }
        }
    }

    /** 题干 q_<n>.mp3 与音效 sfx_*.mp3 属于「必须马上听到」的一类 */
    private fun isForeground(file: String): Boolean {
        if (file.startsWith("sfx_")) return true
        if (!file.startsWith("q_")) return false
        val rest = file.substring(2)
        val dot = rest.indexOf('.')
        if (dot <= 0 || rest.substring(dot) != ".mp3") return false
        for (ch in rest.substring(0, dot)) if (!ch.isDigit()) return false
        return true
    }

    fun stop() {
        synchronized(lock) {
            queue.clear()
            releaseLocked()
            current = ""
            currentFile = ""
            speaking = false
        }
    }

    private fun releaseLocked() {
        val p = player ?: return
        player = null
        try { if (p.isPlaying) p.stop() } catch (_: Exception) { }
        try { p.release() } catch (_: Exception) { }
    }

    /** 播完/出错后接上队列里的下一段；没有下一段就收工 */
    private fun advanceLocked() {
        if (queue.isEmpty()) {
            current = ""
            currentFile = ""
            speaking = false
            return
        }
        startLocked(queue.removeAt(0))
    }

    private fun startLocked(filename: String) {
        releaseLocked()
        val context = app ?: return
        current = filename
        val mp = MediaPlayer()
        try {
            try {
                // 电视走 STREAM_SYSTEM，避开 MediaPause 对音乐流的静音（VIDAA 视频播放器不理会暂停键）；
                // 手机/平板走 STREAM_MUSIC，音量正常（系统流在手机上听不到）。
                if (BuildConfig.FLAVOR == "tv") {
                    mp.setAudioAttributes(AudioAttributes.Builder()
                        .setLegacyStreamType(AudioManager.STREAM_SYSTEM)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                        .build())
                } else {
                    mp.setAudioAttributes(AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_MEDIA)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                        .build())
                }
            } catch (_: Throwable) { }
            val afd = try {
                context.assets.openFd("audio/" + filename)
            } catch (e: Exception) {
                null
            }
            if (afd != null) {
                mp.setDataSource(afd.fileDescriptor, afd.startOffset, afd.length)
                afd.close()
            } else {
                val dir = File(context.cacheDir, "audio").apply { mkdirs() }
                val target = File(dir, filename)
                if (!target.exists() || target.length() == 0L) {
                    context.assets.open("audio/" + filename).use { input ->
                        target.outputStream().use { out -> input.copyTo(out) }
                    }
                }
                mp.setDataSource(target.absolutePath)
            }
            mp.setOnCompletionListener {
                synchronized(lock) {
                    if (player === mp) {
                        player = null
                        Diag.info("Audio", "play done file=" + filename + " queued=" + queue.size)
                        try { mp.release() } catch (_: Exception) { }
                        advanceLocked()
                    }
                }
            }
            mp.setOnErrorListener { _, what, extra ->
                synchronized(lock) {
                    if (player === mp) {
                        player = null
                        Diag.warn("Audio", "play error file=" + filename + " what=" + what + " extra=" + extra)
                        try { mp.release() } catch (_: Exception) { }
                        advanceLocked()
                    }
                }
                true
            }
            mp.prepare()
            mp.start()
            player = mp
            speaking = true
            currentFile = filename
            Diag.info("Audio", "play ok file=" + filename + " musicMuted=" + MediaPause.isMuted())
        } catch (t: Throwable) {
            try { mp.release() } catch (e: Exception) { }
            speaking = false
            current = ""
            currentFile = ""
            Diag.warn("Audio", "play fail file=" + filename + " err=" + t.javaClass.simpleName + ":" + t.message +
                " musicMuted=" + MediaPause.isMuted())
            advanceLocked()
        }
    }
}
