package com.studyontv.tv

import android.content.Context
import android.media.MediaPlayer
import java.io.File

/**
 * 离线音频播放器：同一时刻只播放一段语音。
 * 优先用 AssetFileDescriptor 直接播放（构建时已对 mp3 设置 noCompress）；
 * 若 assets 被压缩导致 openFd 失败，则复制到缓存目录再播放。
 */
object AudioPlayer {
    private var player: MediaPlayer? = null

    @Synchronized
    fun play(context: Context, filename: String) {
        stop()
        val mp = MediaPlayer()
        try {
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
        } catch (t: Throwable) {
            try { mp.release() } catch (e: Exception) { }
        }
    }

    @Synchronized
    fun stop() {
        val p = player ?: return
        player = null
        try { if (p.isPlaying) p.stop() } catch (e: Exception) { }
        try { p.release() } catch (e: Exception) { }
    }
}
