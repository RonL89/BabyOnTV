package com.babyontv.tv

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/** 题库种子：首次启动时把 APK 内置的 questions.json 导入数据库（只导入一次）。 */
object SeedAssets {
    fun ensureQuestions(context: Context, store: LocalStore) {
        if (store.countQuestions() > 0) return
        try {
            val raw = context.assets.open("questions.json").use { it.readBytes().toString(Charsets.UTF_8) }
            val arr = JSONArray(raw)
            val normalized = JSONArray()
            for (i in 0 until arr.length()) {
                val src = arr.getJSONObject(i)
                normalized.put(
                    JSONObject()
                        .put("id", src.optString("id"))
                        .put("subject", src.optString("subject", "常识"))
                        .put("level", src.optString("level", ""))
                        .put("difficulty", src.optInt("difficulty", 2))
                        .put("q", src.optString("q"))
                        .put("a", src.optJSONArray("a") ?: JSONArray())
                        .put("k", src.optInt("k", 0))
                        .put("tip", src.optString("tip", ""))
                )
            }
            store.importQuestions(normalized)
        } catch (_: Exception) {
        }
    }
}
