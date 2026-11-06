package com.babytv.tv

import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.StateListDrawable
import android.widget.Button
import android.widget.EditText

private fun rounded(color: Int, stroke: Int, strokeWidth: Int, radiusPx: Int) = GradientDrawable().apply {
    setColor(color)
    cornerRadius = radiusPx.toFloat()
    if (strokeWidth > 0) setStroke(strokeWidth, stroke)
}

/**
 * 电视按钮样式：带焦点态（绿色描边 + 更亮底色 + 文字加深 + 轻微放大）。
 * 遥控器上下移动时能看清当前选中哪一个；手机/平板同样适用。
 */
fun Button.learningStyle(primary: Boolean = false) {
    val density = resources.displayMetrics.density
    val normalBg = if (primary) 0xFFDBA363.toInt() else 0xFFEDF1E7.toInt()
    val normalText = if (primary) 0xFFFFFFFF.toInt() else 0xFF3E4A38.toInt()
    val focusBg = if (primary) 0xFFFFC98A.toInt() else 0xFFDCEFD2.toInt()
    val focusText = 0xFF1B2A16.toInt()
    val radius = (14 * density).toInt()
    val border = (2 * density).toInt().coerceAtLeast(2)

    backgroundTintList = null
    stateListAnimator = null
    background = StateListDrawable().apply {
        addState(intArrayOf(android.R.attr.state_focused), rounded(focusBg, 0xFF35B98A.toInt(), border, radius))
        addState(intArrayOf(android.R.attr.state_pressed), rounded(focusBg, 0xFF35B98A.toInt(), border, radius))
        addState(intArrayOf(), rounded(normalBg, normalBg, 0, radius))
    }
    textSize = 18f
    isAllCaps = false
    elevation = 0f
    minHeight = (48 * density).toInt()
    setPadding((16 * density).toInt(), (12 * density).toInt(), (16 * density).toInt(), (12 * density).toInt())
    setTextColor(normalText)
    setOnFocusChangeListener { view, hasFocus ->
        setTextColor(if (hasFocus) focusText else normalText)
        view.animate().cancel()
        view.animate().scaleX(if (hasFocus) 1.04f else 1f).scaleY(if (hasFocus) 1.04f else 1f)
            .setDuration(120).start()
    }
}

fun EditText.learningField() {
    val density = resources.displayMetrics.density
    val radius = (12 * density).toInt()
    val border = (2 * density).toInt().coerceAtLeast(2)
    background = StateListDrawable().apply {
        addState(intArrayOf(android.R.attr.state_focused), rounded(0xFFFCFDF9.toInt(), 0xFF35B98A.toInt(), border, radius))
        addState(intArrayOf(), rounded(0xFFFCFDF9.toInt(), 0xFFE4EBDD.toInt(), density.toInt().coerceAtLeast(1), radius))
    }
    setTextColor(0xFF303B31.toInt()); setHintTextColor(0xFF8B9684.toInt())
    textSize = 17f
    setPadding((14 * density).toInt(), (14 * density).toInt(), (14 * density).toInt(), (14 * density).toInt())
}
