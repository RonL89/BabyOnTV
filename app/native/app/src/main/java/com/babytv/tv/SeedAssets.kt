package com.babytv.tv

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

object SeedAssets {
    private fun signature(arr: JSONArray): String {
        // 题数 + 首题 + 末题：只比首题的话，换了一整套题但题数相同时设备不会重建题库
        if (arr.length() == 0) return "0"
        val first = arr.getJSONObject(0).optString("q")
        val last = arr.getJSONObject(arr.length() - 1).optString("q")
        return arr.length().toString() + "|" + first.hashCode() + "|" + last.hashCode()
    }

    fun ensureQuestions(context: Context, store: LocalStore) {
        val raw = try {
            context.assets.open("questions.json").use { it.readBytes().toString(Charsets.UTF_8) }
        } catch (e: Exception) {
            return
        }
        val arr = try { JSONArray(raw) } catch (e: Exception) { return }
        val sig = signature(arr)
        // 题库与内置题库不一致（重新打包了新题）时，重建题库；家长自建题目在题库一致时保留
        if (store.countQuestions() > 0 && store.get("seed_signature") == sig) return

        val normalized = JSONArray()
        for (i in 0 until arr.length()) {
            val src = arr.getJSONObject(i)
            normalized.put(
                JSONObject()
                    // 固定 ID：与离线音频文件名一一对应（q_0.mp3 / q_0_opt_1.mp3）
                    .put("id", src.optString("id").ifEmpty { "q_$i" })
                    .put("subject", src.optString("subject", "常识"))
                    .put("level", src.optString("level", src.optString("grade", "")))
                    .put("difficulty", src.optInt("difficulty", 2))
                    .put("q", src.optString("q", src.optString("stem")))
                    .put("a", src.optJSONArray("a") ?: src.optJSONArray("options"))
                    .put("k", if (src.has("k")) src.optInt("k") else src.optInt("answerIndex", 0))
                    .put("tip", src.optString("tip", ""))
            )
        }
        try {
            store.replaceQuestions(normalized)
            store.set("seed_signature", sig)
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }
}
