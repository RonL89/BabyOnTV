package com.babyontv.tv

import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test
import java.io.File

/**
 * tailLines 从文件尾部倒着读、凑够 need 行就停。这些用例覆盖它在日志读取上的
 * 全部真实边界：多行取尾、UTF-8 多字节字符跨块边界、最后一行无换行、\r\n 行尾。
 */
class TailLinesTest {
    private lateinit var dir: File

    @Before
    fun setUp() { dir = createTempDir("tailLines") }

    private fun file(name: String, content: String): File =
        File(dir, name).apply { writeText(content, Charsets.UTF_8) }

    @Test
    fun emptyFile() {
        val f = file("e", "")
        assertEquals(emptyList<String>(), Diag.tailLines(f, 10))
    }

    @Test
    fun needLessThanLines_returnsLastNeed() {
        val f = file("m", (1..10).joinToString("\n"))
        assertEquals(listOf("9", "10"), Diag.tailLines(f, 2))
    }

    @Test
    fun needMoreThanLines_returnsAllLinesMerged() {
        // 3 个文件只会各取尾部，这里单文件验证取满全部 3 行
        val f = file("1", "$a\n$b\n$c")
        assertEquals(listOf(a, b, c), Diag.tailLines(f, 50))
    }

    @Test
    fun crlfLineEndings_areTrimmed() {
        val f = file("crlf", "aa\r\nbb\r\ncc\r\n")
        assertEquals(listOf("aa", "bb", "cc"), Diag.tailLines(f, 3))
    }

    @Test
    fun lastLineWithoutTrailingNewline() {
        val f = file("nowrap", "aa\nbb\ncc")
        assertEquals(listOf("aa", "bb", "cc"), Diag.tailLines(f, 3))
    }

    @Test
    fun multiByteUtf8CrossingChunkBoundary() {
        // 每行都是中文 + 长尾，制造内容跨 16KB 块边界的场景。
        // 若按字符串拼半个汉字就会出乱码 / 匹配失败。
        val line = "日志行-" + "中".repeat(2000)
        val n = 20
        val content = (1..n).map { "$line:$it" }.joinToString("\n")
        val f = file("utf8", content)
        assertEquals((11..n).map { "$line:$it" }, Diag.tailLines(f, n - 10))
    }

    @Test
    fun needZero_returnsEmpty() {
        val f = file("z", "aa\nbb")
        assertEquals(emptyList<String>(), Diag.tailLines(f, 0))
    }

    private companion object {
        const val a = "第一行"
        const val b = "第二行"
        const val c = "第三行"
    }
}
