package com.studyontv.tv

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.MediaPlayer
import java.io.File

/**
 * 离线语音播放器：同一时刻只播放一段音频。
 * 优先用 AssetFileDescriptor 直接播放（构建时已对 mp3 设置 noCompress）；
 * 若 assets 被压缩导致 openFd 失败，则复制到缓存目录再播放。
 *
 * BabyOnTV 只把 data/audio 预生成的 mp3 接进上游的答题流程，不改任何答题/解锁逻辑。
 *
 * 语音走 STREAM_SYSTEM（用 legacy stream type 固定），刻意避开 STREAM_MUSIC：
 * 海信 VIDAA 的视频播放器不理会暂停键时，上游 MediaPause 会把整个音乐流静音，
 * 若语音也在音乐流上就会被一起压掉，导致答题时「部分题没声音」。
 */
object AudioPlayer {
    private var player: MediaPlayer? = null

    /** 是否正在朗读（供 MediaPause 在朗读期间不静音，作为双保险） */
    @Volatile
    var speaking: Boolean = false
        private set

    @Synchronized
    fun play(context: Context, filename: String) {
        if (filename.isEmpty()) return
        stop()
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
                context.assets.openFd("audio/$filename")
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
                    context.assets.open("audio/$filename").use { input ->
                        target.outputStream().use { out -> input.copyTo(out) }
                    }
                }
                mp.setDataSource(target.absolutePath)
            }
            mp.setOnCompletionListener { stop() }
            mp.prepare()
            mp.start()
            player = mp
            speaking = true
            Diag.info("Audio", "play ok file=$filename musicMuted=${MediaPause.isMuted()}")
        } catch (t: Throwable) {
            speaking = false
            try { mp.release() } catch (e: Exception) { }
            Diag.warn("Audio", "play fail file=$filename err=${t.javaClass.simpleName}:${t.message} musicMuted=${MediaPause.isMuted()}")
        }
    }

    @Synchronized
    fun stop() {
        val p = player ?: return
        player = null
        speaking = false
        try { if (p.isPlaying) p.stop() } catch (e: Exception) { }
        try { p.release() } catch (e: Exception) { }
    }
}
