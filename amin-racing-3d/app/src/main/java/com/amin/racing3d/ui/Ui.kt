package com.amin.racing3d.ui

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.util.TypedValue
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.view.animation.OvershootInterpolator
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import com.amin.racing3d.R
import com.amin.racing3d.core.Lang

/** Small view toolkit for the neon / dark gaming style. All UI is built in code. */
object Ui {
    const val CYAN = 0xFF00E5FF.toInt()
    const val PINK = 0xFFFF2D95.toInt()
    const val YELLOW = 0xFFFFD23F.toInt()
    const val GREEN = 0xFF39FF88.toInt()
    const val RED = 0xFFFF4D5E.toInt()
    const val TEXT = 0xFFF2F6FF.toInt()
    const val DIM = 0xFF8A97B8.toInt()
    const val PANEL = 0xE60D1424.toInt()
    const val PANEL_LIGHT = 0xCC16203A.toInt()
    const val BG = 0xFF070A14.toInt()

    lateinit var regular: Typeface
    lateinit var bold: Typeface
    lateinit var black: Typeface
    var density = 1f
    var onClickSound: (() -> Unit)? = null
    var onHaptic: ((View) -> Unit)? = null

    fun init(ctx: Context) {
        density = ctx.resources.displayMetrics.density
        regular = loadFont(ctx, R.font.vazirmatn_regular, Typeface.DEFAULT)
        bold = loadFont(ctx, R.font.vazirmatn_bold, Typeface.DEFAULT_BOLD)
        black = loadFont(ctx, R.font.vazirmatn_black, Typeface.DEFAULT_BOLD)
    }

    private fun loadFont(ctx: Context, id: Int, fallback: Typeface): Typeface = try {
        ctx.resources.getFont(id)
    } catch (e: Exception) {
        fallback
    }

    fun dp(v: Float): Int = (v * density + 0.5f).toInt()
    fun dp(v: Int): Int = dp(v.toFloat())

    fun bg(fill: Int, stroke: Int = 0, radiusDp: Float = 14f, strokeDp: Float = 1.5f): GradientDrawable {
        val d = GradientDrawable()
        d.setColor(fill)
        d.cornerRadius = dp(radiusDp).toFloat()
        if (stroke != 0) d.setStroke(dp(strokeDp), stroke)
        return d
    }

    fun gradient(c1: Int, c2: Int, stroke: Int = 0, radiusDp: Float = 14f, orientation: GradientDrawable.Orientation = GradientDrawable.Orientation.TL_BR): GradientDrawable {
        val d = GradientDrawable(orientation, intArrayOf(c1, c2))
        d.cornerRadius = dp(radiusDp).toFloat()
        if (stroke != 0) d.setStroke(dp(1.5f), stroke)
        return d
    }

    fun withAlpha(color: Int, alpha: Int): Int = (color and 0x00FFFFFF) or (alpha shl 24)

    fun text(ctx: Context, s: CharSequence, sizeSp: Float, color: Int = TEXT, tf: Typeface = regular): TextView {
        val t = TextView(ctx)
        t.text = s
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, sizeSp)
        t.setTextColor(color)
        t.typeface = tf
        t.includeFontPadding = true
        return t
    }

    fun glowTitle(ctx: Context, s: CharSequence, sizeSp: Float, color: Int = CYAN): TextView {
        val t = text(ctx, s, sizeSp, color, black)
        t.setShadowLayer(dp(10f).toFloat(), 0f, 0f, color)
        t.gravity = Gravity.CENTER
        return t
    }

    @SuppressLint("ClickableViewAccessibility")
    fun pressable(v: View) {
        v.setOnTouchListener { view, ev ->
            when (ev.actionMasked) {
                MotionEvent.ACTION_DOWN -> view.animate().scaleX(0.94f).scaleY(0.94f).setDuration(70).start()
                MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL ->
                    view.animate().scaleX(1f).scaleY(1f).setDuration(220).setInterpolator(OvershootInterpolator(3f)).start()
            }
            false
        }
    }

    fun button(ctx: Context, s: CharSequence, accent: Int, primary: Boolean = false, sizeSp: Float = 18f, onClick: () -> Unit): TextView {
        val t = text(ctx, s, sizeSp, if (primary) BG else TEXT, bold)
        t.gravity = Gravity.CENTER
        val padV = dp(if (primary) 14f else 11f)
        t.setPadding(dp(22f), padV, dp(22f), padV)
        t.background = if (primary) gradient(accent, withAlpha(lighten(accent), 255), 0, 16f, GradientDrawable.Orientation.LEFT_RIGHT)
        else bg(withAlpha(accent, 0x22), accent, 16f, 1.6f)
        if (primary) t.setShadowLayer(0f, 0f, 0f, 0)
        else t.setShadowLayer(dp(6f).toFloat(), 0f, 0f, withAlpha(accent, 0xAA))
        t.isClickable = true
        t.isFocusable = true
        pressable(t)
        t.setOnClickListener {
            onClickSound?.invoke()
            onHaptic?.invoke(it)
            onClick()
        }
        return t
    }

    private fun lighten(c: Int): Int {
        val r = minOf(255, ((c shr 16) and 0xFF) + 70)
        val g = minOf(255, ((c shr 8) and 0xFF) + 70)
        val b = minOf(255, (c and 0xFF) + 70)
        return Color.rgb(r, g, b)
    }

    fun panel(ctx: Context, vertical: Boolean = true, stroke: Int = withAlpha(CYAN, 0x55)): LinearLayout {
        val l = LinearLayout(ctx)
        l.orientation = if (vertical) LinearLayout.VERTICAL else LinearLayout.HORIZONTAL
        l.background = bg(PANEL, stroke, 20f, 1.2f)
        val p = dp(16f)
        l.setPadding(p, p, p, p)
        return l
    }

    fun vbox(ctx: Context, gravity: Int = Gravity.CENTER_HORIZONTAL): LinearLayout {
        val l = LinearLayout(ctx)
        l.orientation = LinearLayout.VERTICAL
        l.gravity = gravity
        return l
    }

    fun hbox(ctx: Context, gravity: Int = Gravity.CENTER_VERTICAL): LinearLayout {
        val l = LinearLayout(ctx)
        l.orientation = LinearLayout.HORIZONTAL
        l.gravity = gravity
        return l
    }

    fun lp(w: Int = ViewGroup.LayoutParams.MATCH_PARENT, h: Int = ViewGroup.LayoutParams.WRAP_CONTENT, topDp: Float = 0f, bottomDp: Float = 0f, weight: Float = 0f): LinearLayout.LayoutParams {
        val p = LinearLayout.LayoutParams(w, h, weight)
        p.topMargin = dp(topDp)
        p.bottomMargin = dp(bottomDp)
        return p
    }

    fun frame(w: Int, h: Int, gravity: Int): FrameLayout.LayoutParams = FrameLayout.LayoutParams(w, h, gravity)

    const val MATCH = ViewGroup.LayoutParams.MATCH_PARENT
    const val WRAP = ViewGroup.LayoutParams.WRAP_CONTENT

    /** Segmented selector (e.g. Low / Medium / High). */
    fun segmented(ctx: Context, options: List<CharSequence>, selected: Int, accent: Int = CYAN, onSelect: (Int) -> Unit): LinearLayout {
        val row = hbox(ctx)
        row.background = bg(withAlpha(0xFF000000.toInt(), 0x55), withAlpha(accent, 0x55), 14f, 1f)
        row.setPadding(dp(3f), dp(3f), dp(3f), dp(3f))
        val views = ArrayList<TextView>()
        fun paint(sel: Int) {
            for ((i, v) in views.withIndex()) {
                if (i == sel) {
                    v.background = bg(accent, 0, 11f)
                    v.setTextColor(BG)
                } else {
                    v.background = null
                    v.setTextColor(TEXT)
                }
            }
        }
        for ((i, o) in options.withIndex()) {
            val t = text(ctx, o, 14f, TEXT, bold)
            t.gravity = Gravity.CENTER
            t.setPadding(dp(8f), dp(8f), dp(8f), dp(8f))
            t.isClickable = true
            t.setOnClickListener {
                onClickSound?.invoke()
                paint(i)
                onSelect(i)
            }
            views.add(t)
            row.addView(t, LinearLayout.LayoutParams(0, WRAP, 1f))
        }
        paint(selected)
        return row
    }

    fun toggle(ctx: Context, value: Boolean, accent: Int = CYAN, onChange: (Boolean) -> Unit): TextView {
        val t = text(ctx, "", 14f, TEXT, bold)
        t.gravity = Gravity.CENTER
        t.minWidth = dp(76f)
        t.setPadding(dp(12f), dp(7f), dp(12f), dp(7f))
        var v = value
        fun paint() {
            t.text = ctx.getString(if (v) R.string.on_label else R.string.off_label)
            t.background = if (v) bg(accent, 0, 12f) else bg(withAlpha(0xFF000000.toInt(), 0x66), withAlpha(DIM, 0x88), 12f, 1f)
            t.setTextColor(if (v) BG else DIM)
        }
        paint()
        t.setOnClickListener {
            onClickSound?.invoke()
            v = !v
            paint()
            onChange(v)
        }
        return t
    }

    fun coinPill(ctx: Context, coins: Int): TextView {
        val t = text(ctx, "●  " + Lang.num(coins), 16f, YELLOW, bold)
        t.background = bg(withAlpha(0xFF000000.toInt(), 0x88), withAlpha(YELLOW, 0x88), 20f, 1.2f)
        t.setPadding(dp(14f), dp(6f), dp(14f), dp(6f))
        t.setShadowLayer(dp(4f).toFloat(), 0f, 0f, withAlpha(YELLOW, 0x99))
        return t
    }

    /** Animated horizontal stat bar. */
    fun statBar(ctx: Context, value: Float, accent: Int, extra: Float = 0f): View {
        val frame = FrameLayout(ctx)
        frame.background = bg(withAlpha(0xFFFFFFFF.toInt(), 0x18), 0, 6f)
        val fillUp = View(ctx)
        fillUp.background = bg(withAlpha(GREEN, 0xAA), 0, 6f)
        val fill = View(ctx)
        fill.background = gradient(withAlpha(accent, 0xCC), accent, 0, 6f, GradientDrawable.Orientation.LEFT_RIGHT)
        frame.addView(fillUp, FrameLayout.LayoutParams(0, MATCH))
        frame.addView(fill, FrameLayout.LayoutParams(0, MATCH))
        frame.addOnLayoutChangeListener { v, l, _, r, _, _, _, _, _ ->
            val w = r - l
            val target = (w * value.coerceIn(0f, 1f)).toInt()
            val up = (w * (value + extra).coerceIn(0f, 1f)).toInt()
            val lp1 = fill.layoutParams as FrameLayout.LayoutParams
            val lp2 = fillUp.layoutParams as FrameLayout.LayoutParams
            if (lp1.width != target || lp2.width != up) {
                lp1.width = target
                lp2.width = up
                lp1.gravity = Gravity.START
                lp2.gravity = Gravity.START
                v.post {
                    fill.layoutParams = lp1
                    fillUp.layoutParams = lp2
                    fill.scaleX = 0f
                    fill.pivotX = if (v.layoutDirection == View.LAYOUT_DIRECTION_RTL) target.toFloat() else 0f
                    fill.animate().scaleX(1f).setDuration(450).start()
                }
            }
        }
        return frame
    }
}
