package com.amin.racing3d.core

import android.content.Context
import android.content.res.Configuration
import android.view.View
import java.util.Locale

/**
 * Language handling. Persian (default, RTL) and English (LTR).
 * The chosen language is applied by wrapping the activity base context.
 */
object Lang {
    const val FA = "fa"
    const val EN = "en"

    @Volatile
    var current: String = FA
        private set

    val isFa: Boolean get() = current == FA

    fun wrap(base: Context, lang: String): Context {
        current = if (lang == EN) EN else FA
        val locale = Locale(current)
        Locale.setDefault(locale)
        val config = Configuration(base.resources.configuration)
        config.setLocale(locale)
        config.setLayoutDirection(locale)
        return base.createConfigurationContext(config)
    }

    val layoutDirection: Int get() = if (isFa) View.LAYOUT_DIRECTION_RTL else View.LAYOUT_DIRECTION_LTR

    private const val FA_ZERO = '\u06F0'

    /** Converts ASCII digits to Persian digits when the UI language is Persian. */
    fun digits(s: String): String {
        if (!isFa) return s
        val sb = StringBuilder(s.length)
        for (c in s) {
            sb.append(
                when (c) {
                    in '0'..'9' -> (FA_ZERO + (c - '0'))
                    ',' -> '\u066C'
                    '.' -> '\u066B'
                    else -> c
                }
            )
        }
        return sb.toString()
    }

    /** Formats an integer with thousands separators and localized digits. */
    fun num(v: Long): String {
        val neg = v < 0
        var n = if (neg) -v else v
        val sb = StringBuilder()
        var count = 0
        if (n == 0L) sb.append('0')
        while (n > 0) {
            if (count > 0 && count % 3 == 0) sb.append(',')
            sb.append(('0' + (n % 10).toInt()))
            n /= 10
            count++
        }
        if (neg) sb.append('-')
        return digits(sb.reverse().toString())
    }

    fun num(v: Int): String = num(v.toLong())

    fun km(meters: Float): String {
        val tenths = (meters / 100f).toInt()
        return digits("${tenths / 10}.${tenths % 10}")
    }

    /**
     * Allocation-free integer writer used by the HUD. Writes [value] into [out]
     * starting at [offset] and returns the number of chars written.
     */
    fun writeInt(value: Int, out: CharArray, offset: Int, grouping: Boolean): Int {
        var n = if (value < 0) 0 else value
        val zero = if (isFa) FA_ZERO else '0'
        val sep = if (isFa) '\u066C' else ','
        // write reversed into the tail of the buffer, then copy
        var len = 0
        val tmp = scratch
        var groupCount = 0
        if (n == 0) {
            tmp[len++] = zero
        }
        while (n > 0) {
            if (grouping && groupCount == 3) {
                tmp[len++] = sep
                groupCount = 0
            }
            tmp[len++] = zero + (n % 10)
            n /= 10
            groupCount++
        }
        for (i in 0 until len) out[offset + i] = tmp[len - 1 - i]
        return len
    }

    private val scratch = CharArray(32)
}
