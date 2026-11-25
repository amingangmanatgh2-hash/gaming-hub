package com.amin.racing3d.ui

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Canvas
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RadialGradient
import android.graphics.RectF
import android.graphics.Shader
import android.os.SystemClock
import android.view.MotionEvent
import android.view.View
import com.amin.racing3d.R
import com.amin.racing3d.core.Lang
import com.amin.racing3d.game.GameData
import com.amin.racing3d.game.World
import com.amin.racing3d.input.InputState
import kotlin.math.ceil
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sin

/**
 * In-race heads-up display and multi-touch controls, drawn with Canvas.
 * Reads the world's volatile hud* snapshot; does not allocate while drawing.
 */
class HudView(context: Context, private val world: World, private val input: InputState) : View(context) {

    interface Listener {
        fun onPausePressed()
        fun onHudFrame(state: Int)
        fun onButtonHaptic()
    }

    var listener: Listener? = null

    /** When false (tilt steering) the left/right buttons are hidden. */
    var touchSteering = true
        set(v) { field = v; layoutButtons() }
    var showFps = false
    @Volatile var fps = 60

    // ---------------------------------------------------------------- strings (prefetched)
    private val sScore = context.getString(R.string.score)
    private val sKm = context.getString(R.string.km)
    private val sKmh = context.getString(R.string.kmh)
    private val sNear = context.getString(R.string.hud_near_miss)
    private val sCombo = context.getString(R.string.hud_combo)
    private val sX2 = context.getString(R.string.hud_x2)
    private val sCheckpoint = context.getString(R.string.hud_checkpoint)
    private val sTime = context.getString(R.string.hud_time)
    private val sNitro = context.getString(R.string.hud_nitro)
    private val sGas = context.getString(R.string.btn_gas)
    private val sBrake = context.getString(R.string.btn_brake)
    private val sBtnNitro = context.getString(R.string.btn_nitro)
    private val sHorn = context.getString(R.string.btn_horn)
    private val sGo = context.getString(R.string.countdown_go)
    private val sHintTilt = context.getString(R.string.hint_tilt)
    private val sHintTouch = context.getString(R.string.hint_touch)
    private val sBest = context.getString(R.string.best_score_short)
    private val sFps = "FPS"
    private var message: String? = null
    private var messageUntil = 0L

    var bestScore = 0

    // ---------------------------------------------------------------- paints
    private val d = resources.displayMetrics.density
    private val pText = Paint(Paint.ANTI_ALIAS_FLAG).apply { typeface = Ui.bold; color = Ui.TEXT }
    private val pBig = Paint(Paint.ANTI_ALIAS_FLAG).apply { typeface = Ui.black; color = Ui.TEXT; textAlign = Paint.Align.CENTER }
    private val pSmall = Paint(Paint.ANTI_ALIAS_FLAG).apply { typeface = Ui.regular; color = Ui.DIM }
    private val pFill = Paint(Paint.ANTI_ALIAS_FLAG)
    private val pStroke = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeCap = Paint.Cap.ROUND }
    private val pVignette = Paint()
    private val pFlash = Paint()

    private val chars = CharArray(48)
    private val rect = RectF()

    // ---------------------------------------------------------------- buttons
    private class Button(val id: Int) {
        val r = RectF()
        var visible = true
        var label: String = ""
    }

    private val buttons = Array(7) { Button(it) }
    private val arrowLeft = Path()
    private val arrowRight = Path()
    private val pointerButton = IntArray(12) { -1 }

    // ---------------------------------------------------------------- layout
    private var portrait = false
    private var gaugeX = 0f
    private var gaugeY = 0f
    private var gaugeR = 0f
    private var margin = 0f

    // ---------------------------------------------------------------- animation state
    private var lastNearSeq = -1
    private var nearStart = 0L
    private var nearPts = 0
    private var lastCheckSeq = -1
    private var checkStart = 0L
    @Volatile var checkpointBonus = 0
    private var goStart = 0L
    private var lastState = -1
    private var raceStart = 0L
    private var nitroGlow = 0f
    private var displaySpeed = 0f

    init {
        isClickable = true
        buttons[B_GAS].label = sGas
        buttons[B_BRAKE].label = sBrake
        buttons[B_NITRO].label = sBtnNitro
        buttons[B_HORN].label = sHorn
        setWillNotDraw(false)
    }

    fun showMessage(msg: String, durationMs: Long = 2600) {
        message = msg
        messageUntil = SystemClock.uptimeMillis() + durationMs
        invalidate()
    }

    fun resetEffects() {
        lastNearSeq = world.hudNearSeq
        lastCheckSeq = world.hudCheckSeq
        nearStart = 0L; checkStart = 0L; goStart = 0L
        lastState = -1
        displaySpeed = 0f
        nitroGlow = 0f
        for (i in pointerButton.indices) pointerButton[i] = -1
        input.reset()
    }

    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
        super.onSizeChanged(w, h, oldw, oldh)
        layoutButtons()
        val r = max(w, h) * 0.75f
        pVignette.shader = RadialGradient(w / 2f, h / 2f, r,
            intArrayOf(0x00000000, 0x0000E5FF, 0x8800C8FF.toInt()), floatArrayOf(0f, 0.55f, 1f), Shader.TileMode.CLAMP)
        pFlash.shader = LinearGradient(0f, 0f, 0f, h.toFloat(),
            intArrayOf(0x66FF2D95, 0x00000000, 0x00000000, 0x66FF2D95), floatArrayOf(0f, 0.18f, 0.82f, 1f), Shader.TileMode.CLAMP)
    }

    override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) {
        super.onLayout(changed, left, top, right, bottom)
        if (changed) layoutButtons()
    }

    private fun layoutButtons() {
        val w = width.toFloat()
        val h = height.toFloat()
        if (w <= 0f || h <= 0f) return
        portrait = h > w
        val minDim = min(w, h)
        margin = 14f * d
        val padL = paddingLeft + margin
        val padR = paddingRight + margin
        val padB = paddingBottom + margin
        val padT = paddingTop + margin
        val b = (minDim * 0.2f).coerceIn(62f * d, 104f * d)
        val gap = 10f * d

        // pause button
        buttons[B_PAUSE].r.set(padL, padT, padL + 46f * d, padT + 46f * d)

        val gas = buttons[B_GAS].r
        gas.set(w - padR - b, h - padB - b * 1.35f, w - padR, h - padB)
        val nitro = buttons[B_NITRO].r
        nitro.set(gas.left, gas.top - gap - b * 0.82f, gas.right, gas.top - gap)

        if (touchSteering) {
            buttons[B_LEFT].visible = true
            buttons[B_RIGHT].visible = true
            buttons[B_LEFT].r.set(padL, h - padB - b, padL + b, h - padB)
            buttons[B_RIGHT].r.set(padL + b + gap, h - padB - b, padL + 2 * b + gap, h - padB)
            val brake = buttons[B_BRAKE].r
            brake.set(gas.left - gap - b, h - padB - b, gas.left - gap, h - padB)
            buttons[B_HORN].r.set(brake.left, brake.top - gap - b * 0.62f, brake.right, brake.top - gap)
        } else {
            buttons[B_LEFT].visible = false
            buttons[B_RIGHT].visible = false
            val brake = buttons[B_BRAKE].r
            brake.set(padL, h - padB - b * 1.2f, padL + b, h - padB)
            buttons[B_HORN].r.set(padL, brake.top - gap - b * 0.62f, padL + b, brake.top - gap)
        }
        buildArrow(arrowLeft, buttons[B_LEFT].r, -1f)
        buildArrow(arrowRight, buttons[B_RIGHT].r, 1f)

        if (portrait) {
            gaugeR = (w * 0.115f).coerceIn(40f * d, 70f * d)
            gaugeX = w - padR - gaugeR
            gaugeY = padT + 78f * d + gaugeR
        } else {
            gaugeR = (h * 0.13f).coerceIn(44f * d, 84f * d)
            gaugeX = w / 2f
            gaugeY = h - padB - gaugeR * 0.85f - 22f * d
        }
    }

    private fun buildArrow(p: Path, r: RectF, dir: Float) {
        p.reset()
        val cx = r.centerX()
        val cy = r.centerY()
        val s = r.width() * 0.2f
        p.moveTo(cx + dir * s * 1.1f, cy)
        p.lineTo(cx - dir * s * 0.7f, cy - s)
        p.lineTo(cx - dir * s * 0.7f, cy + s)
        p.close()
    }

    // ================================================================= touch
    @SuppressLint("ClickableViewAccessibility")
    override fun onTouchEvent(ev: MotionEvent): Boolean {
        val action = ev.actionMasked
        val idx = ev.actionIndex
        when (action) {
            MotionEvent.ACTION_DOWN, MotionEvent.ACTION_POINTER_DOWN -> {
                val id = ev.getPointerId(idx)
                val hit = hitTest(ev.getX(idx), ev.getY(idx))
                if (hit == B_PAUSE) {
                    listener?.onPausePressed()
                    return true
                }
                if (id < pointerButton.size) pointerButton[id] = hit
                if (hit >= 0) listener?.onButtonHaptic()
            }
            MotionEvent.ACTION_MOVE -> {
                for (i in 0 until ev.pointerCount) {
                    val id = ev.getPointerId(i)
                    if (id >= pointerButton.size) continue
                    val hit = hitTest(ev.getX(i), ev.getY(i))
                    // allow sliding between steering buttons and between gas/brake
                    if (hit != B_PAUSE) pointerButton[id] = hit
                }
            }
            MotionEvent.ACTION_POINTER_UP -> {
                val id = ev.getPointerId(idx)
                if (id < pointerButton.size) pointerButton[id] = -1
            }
            MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                for (i in pointerButton.indices) pointerButton[i] = -1
            }
        }
        applyButtons()
        return true
    }

    private fun hitTest(x: Float, y: Float): Int {
        val slop = 10f * d
        for (b in buttons) {
            if (!b.visible) continue
            val r = b.r
            if (x >= r.left - slop && x <= r.right + slop && y >= r.top - slop && y <= r.bottom + slop) return b.id
        }
        return -1
    }

    private fun applyButtons() {
        var l = false; var r = false; var g = false; var br = false; var n = false; var h = false
        for (p in pointerButton) {
            when (p) {
                B_LEFT -> l = true
                B_RIGHT -> r = true
                B_GAS -> g = true
                B_BRAKE -> br = true
                B_NITRO -> n = true
                B_HORN -> h = true
            }
        }
        input.left = l; input.right = r; input.gas = g; input.brake = br; input.nitro = n; input.horn = h
    }

    // ================================================================= drawing
    override fun onDraw(canvas: Canvas) {
        val state = world.hudState
        listener?.onHudFrame(state)
        val now = SystemClock.uptimeMillis()
        if (state != lastState) {
            if (state == World.STATE_RACING && lastState == World.STATE_COUNTDOWN) goStart = now
            if (state == World.STATE_COUNTDOWN || (state == World.STATE_RACING && lastState != World.STATE_COUNTDOWN)) raceStart = now
            lastState = state
        }
        val w = width.toFloat()
        val h = height.toFloat()

        // nitro screen glow
        val nitroTarget = if (world.hudNitroOn) 1f else 0f
        nitroGlow += (nitroTarget - nitroGlow) * 0.12f
        if (nitroGlow > 0.02f) {
            pVignette.alpha = (nitroGlow * 255).toInt().coerceIn(0, 255)
            canvas.drawRect(0f, 0f, w, h, pVignette)
        }
        if (world.hudX2 && state == World.STATE_RACING) {
            pFlash.alpha = (140 + 100 * sin(now / 160.0)).toInt().coerceIn(0, 255)
            canvas.drawRect(0f, 0f, w, h, pFlash)
        }

        drawTopBar(canvas, w, now)
        drawGauge(canvas)
        drawCombo(canvas, w, h, now)
        drawPopups(canvas, w, h, now, state)
        drawButtons(canvas)

        if (showFps) {
            pSmall.textAlign = Paint.Align.LEFT
            pSmall.textSize = 11f * d
            pSmall.color = Ui.GREEN
            val n = Lang.writeInt(fps, chars, 0, false)
            val r = buttons[B_PAUSE].r
            canvas.drawText(sFps, r.left, r.bottom + 16f * d, pSmall)
            canvas.drawText(chars, 0, n, r.left + 30f * d, r.bottom + 16f * d, pSmall)
        }

        val msg = message
        if (msg != null) {
            if (now > messageUntil) message = null
            else {
                val a = min(1f, (messageUntil - now) / 400f)
                pText.textAlign = Paint.Align.CENTER
                pText.textSize = 14f * d
                val tw = pText.measureText(msg)
                val y = h * 0.62f
                rect.set(w / 2 - tw / 2 - 16f * d, y - 24f * d, w / 2 + tw / 2 + 16f * d, y + 10f * d)
                pFill.color = Ui.withAlpha(0xFF000000.toInt(), (170 * a).toInt())
                canvas.drawRoundRect(rect, 12f * d, 12f * d, pFill)
                pText.color = Ui.withAlpha(Ui.YELLOW, (255 * a).toInt())
                canvas.drawText(msg, w / 2, y, pText)
                pText.color = Ui.TEXT
            }
        }
        if (visibility == VISIBLE) postInvalidateOnAnimation()
    }

    private fun drawTopBar(canvas: Canvas, w: Float, now: Long) {
        val top = paddingTop + margin
        // ---- score (centre)
        pSmall.textAlign = Paint.Align.CENTER
        pSmall.textSize = 12f * d
        pSmall.color = Ui.DIM
        canvas.drawText(sScore, w / 2, top + 12f * d, pSmall)
        pBig.textSize = 34f * d
        pBig.color = Ui.TEXT
        pBig.setShadowLayer(10f * d, 0f, 0f, Ui.CYAN)
        val n = Lang.writeInt(world.hudScore, chars, 0, true)
        canvas.drawText(chars, 0, n, w / 2, top + 48f * d, pBig)
        pBig.clearShadowLayer()
        if (bestScore > 0) {
            pSmall.textSize = 11f * d
            val m = Lang.writeInt(bestScore, chars, 0, true)
            val y = top + 64f * d
            val bw = pSmall.measureText(sBest)
            val nw = pSmall.measureText(chars, 0, m)
            pSmall.color = Ui.withAlpha(Ui.YELLOW, 0xBB)
            val total = bw + nw + 6f * d
            if (Lang.isFa) {
                pSmall.textAlign = Paint.Align.RIGHT
                canvas.drawText(sBest, w / 2 + total / 2, y, pSmall)
                pSmall.textAlign = Paint.Align.LEFT
                canvas.drawText(chars, 0, m, w / 2 - total / 2, y, pSmall)
            } else {
                pSmall.textAlign = Paint.Align.LEFT
                canvas.drawText(sBest, w / 2 - total / 2, y, pSmall)
                pSmall.textAlign = Paint.Align.RIGHT
                canvas.drawText(chars, 0, m, w / 2 + total / 2, y, pSmall)
            }
        }

        // ---- time attack clock
        if (world.mode == GameData.MODE_TIME_ATTACK) {
            val t = world.hudTime
            val secs = ceil(t.toDouble()).toInt()
            val low = t < 10f
            val y = top + 100f * d
            pText.textAlign = Paint.Align.CENTER
            pText.textSize = 13f * d
            pText.color = Ui.DIM
            canvas.drawText(sTime, w / 2, y - 26f * d, pText)
            pBig.textSize = 30f * d
            val pulse = if (low) (0.5f + 0.5f * sin(now / 90.0).toFloat()) else 0f
            pBig.color = if (low) Ui.withAlpha(Ui.RED, (180 + 75 * pulse).toInt()) else Ui.YELLOW
            val k = Lang.writeInt(secs, chars, 0, false)
            canvas.drawText(chars, 0, k, w / 2, y + 4f * d, pBig)
            pBig.color = Ui.TEXT
        }

        // ---- distance + coins panel
        val panelW = 128f * d
        val panelH = 54f * d
        val px: Float
        val py: Float
        if (portrait) {
            px = paddingLeft + margin
            py = top + 72f * d
        } else {
            px = w - paddingRight - margin - panelW
            py = top
        }
        rect.set(px, py, px + panelW, py + panelH)
        pFill.color = 0x99070A14.toInt()
        canvas.drawRoundRect(rect, 14f * d, 14f * d, pFill)
        pStroke.color = Ui.withAlpha(Ui.CYAN, 0x44)
        pStroke.strokeWidth = 1.2f * d
        canvas.drawRoundRect(rect, 14f * d, 14f * d, pStroke)

        // coins row
        val rowStart = px + 12f * d
        pFill.color = Ui.YELLOW
        canvas.drawCircle(rowStart + 7f * d, py + 18f * d, 7f * d, pFill)
        pFill.color = 0xFFB88A00.toInt()
        canvas.drawCircle(rowStart + 7f * d, py + 18f * d, 3.5f * d, pFill)
        pText.textAlign = Paint.Align.LEFT
        pText.textSize = 15f * d
        pText.color = Ui.YELLOW
        val c = Lang.writeInt(world.hudCoins, chars, 0, true)
        canvas.drawText(chars, 0, c, rowStart + 20f * d, py + 23.5f * d, pText)

        // distance row
        pText.color = Ui.TEXT
        pText.textSize = 14f * d
        val dist = world.hudDistance
        val tenths = (dist / 100f).toInt()
        var k = Lang.writeInt(tenths / 10, chars, 0, false)
        chars[k++] = if (Lang.isFa) '\u066B' else '.'
        k += Lang.writeInt(tenths % 10, chars, k, false)
        canvas.drawText(chars, 0, k, rowStart, py + 44f * d, pText)
        val numW = pText.measureText(chars, 0, k)
        pSmall.textAlign = Paint.Align.LEFT
        pSmall.textSize = 11f * d
        pSmall.color = Ui.DIM
        canvas.drawText(sKm, rowStart + numW + 5f * d, py + 44f * d, pSmall)

        // ---- pause button
        val pr = buttons[B_PAUSE].r
        pFill.color = 0x99070A14.toInt()
        canvas.drawRoundRect(pr, 12f * d, 12f * d, pFill)
        pStroke.color = Ui.withAlpha(Ui.CYAN, 0x88)
        canvas.drawRoundRect(pr, 12f * d, 12f * d, pStroke)
        pFill.color = Ui.TEXT
        val bw = pr.width() * 0.12f
        val bh = pr.height() * 0.38f
        val cx = pr.centerX()
        val cy = pr.centerY()
        rect.set(cx - bw * 2f, cy - bh / 2, cx - bw, cy + bh / 2)
        canvas.drawRoundRect(rect, 2f * d, 2f * d, pFill)
        rect.set(cx + bw, cy - bh / 2, cx + bw * 2f, cy + bh / 2)
        canvas.drawRoundRect(rect, 2f * d, 2f * d, pFill)
    }

    private fun drawGauge(canvas: Canvas) {
        val r = gaugeR
        val cx = gaugeX
        val cy = gaugeY
        displaySpeed += (world.hudSpeed - displaySpeed) * 0.25f
        // dial background
        pFill.color = 0xAA070A14.toInt()
        canvas.drawCircle(cx, cy, r + 6f * d, pFill)
        rect.set(cx - r, cy - r, cx + r, cy + r)
        pStroke.strokeWidth = r * 0.13f
        pStroke.color = 0x33FFFFFF
        canvas.drawArc(rect, 135f, 270f, false, pStroke)
        val maxKmh = 340f
        val frac = (displaySpeed / maxKmh).coerceIn(0f, 1f)
        val col = when {
            world.hudNitroOn -> Ui.PINK
            frac > 0.75f -> Ui.YELLOW
            else -> Ui.CYAN
        }
        pStroke.color = col
        canvas.drawArc(rect, 135f, 270f * frac, false, pStroke)
        // ticks
        pStroke.strokeWidth = 1.5f * d
        pStroke.color = 0x88FFFFFF.toInt()
        for (i in 0..8) {
            val a = Math.toRadians(135.0 + 270.0 * i / 8.0)
            val ca = kotlin.math.cos(a).toFloat()
            val sa = kotlin.math.sin(a).toFloat()
            canvas.drawLine(cx + ca * r * 0.72f, cy + sa * r * 0.72f, cx + ca * r * 0.8f, cy + sa * r * 0.8f, pStroke)
        }
        // number
        pBig.textSize = r * 0.55f
        pBig.color = Ui.TEXT
        val n = Lang.writeInt(displaySpeed.toInt(), chars, 0, false)
        canvas.drawText(chars, 0, n, cx, cy + r * 0.18f, pBig)
        pSmall.textAlign = Paint.Align.CENTER
        pSmall.textSize = r * 0.2f
        pSmall.color = Ui.DIM
        canvas.drawText(sKmh, cx, cy + r * 0.48f, pSmall)

        // nitro bar
        val barW = r * 2.1f
        val barH = 9f * d
        val top = cy + r + 12f * d
        rect.set(cx - barW / 2, top, cx + barW / 2, top + barH)
        pFill.color = 0x55FFFFFF
        canvas.drawRoundRect(rect, barH / 2, barH / 2, pFill)
        val nv = world.hudNitro.coerceIn(0f, 1f)
        if (nv > 0.01f) {
            if (Lang.isFa) rect.left = rect.right - barW * nv else rect.right = rect.left + barW * nv
            pFill.color = if (world.hudNitroOn) Ui.PINK else Ui.CYAN
            canvas.drawRoundRect(rect, barH / 2, barH / 2, pFill)
        }
        pSmall.textSize = 10f * d
        pSmall.color = Ui.withAlpha(Ui.CYAN, 0xCC)
        canvas.drawText(sNitro, cx, top + barH + 12f * d, pSmall)
    }

    private fun drawCombo(canvas: Canvas, w: Float, h: Float, now: Long) {
        val combo = world.hudCombo
        if (combo < 2) return
        val t = (world.hudComboTimer / 3.5f).coerceIn(0f, 1f)
        val x = if (portrait) w / 2 else (if (Lang.isFa) w - paddingRight - margin - 70f * d else paddingLeft + margin + 70f * d)
        val y = if (portrait) h * 0.36f else h * 0.42f
        val pulse = 1f + 0.06f * sin(now / 70.0).toFloat() * t
        pText.textAlign = Paint.Align.CENTER
        pText.textSize = 13f * d
        pText.color = Ui.YELLOW
        canvas.drawText(sCombo, x, y - 30f * d, pText)
        pBig.textSize = 36f * d * pulse
        pBig.color = Ui.YELLOW
        pBig.setShadowLayer(12f * d, 0f, 0f, Ui.PINK)
        var k = 0
        chars[k++] = '×'
        k += Lang.writeInt(combo, chars, k, false)
        canvas.drawText(chars, 0, k, x, y + 6f * d, pBig)
        pBig.clearShadowLayer()
        rect.set(x - 44f * d, y + 16f * d, x + 44f * d, y + 21f * d)
        pFill.color = 0x44FFFFFF
        canvas.drawRoundRect(rect, 3f * d, 3f * d, pFill)
        rect.right = rect.left + 88f * d * t
        pFill.color = Ui.YELLOW
        canvas.drawRoundRect(rect, 3f * d, 3f * d, pFill)
    }

    private fun drawPopups(canvas: Canvas, w: Float, h: Float, now: Long, state: Int) {
        // near miss
        val seq = world.hudNearSeq
        if (lastNearSeq < 0) lastNearSeq = seq
        if (seq != lastNearSeq) {
            lastNearSeq = seq
            nearStart = now
            nearPts = world.hudNearPts
        }
        if (nearStart != 0L) {
            val t = (now - nearStart) / 1000f
            if (t > 1.1f) nearStart = 0L
            else {
                val a = if (t < 0.75f) 1f else 1f - (t - 0.75f) / 0.35f
                val scale = if (t < 0.12f) 0.6f + t / 0.12f * 0.55f else 1.15f - min(0.15f, (t - 0.12f) * 0.6f)
                val y = h * 0.3f - t * 30f * d
                pText.textAlign = Paint.Align.CENTER
                pText.textSize = 20f * d * scale
                pText.color = Ui.withAlpha(Ui.CYAN, (255 * a).toInt())
                pText.setShadowLayer(8f * d, 0f, 0f, Ui.withAlpha(Ui.CYAN, (200 * a).toInt()))
                canvas.drawText(sNear, w / 2, y, pText)
                pText.clearShadowLayer()
                var k = 0
                chars[k++] = '+'
                k += Lang.writeInt(nearPts, chars, k, true)
                pBig.textSize = 26f * d * scale
                pBig.color = Ui.withAlpha(Ui.TEXT, (255 * a).toInt())
                canvas.drawText(chars, 0, k, w / 2, y + 30f * d, pBig)
                pBig.color = Ui.TEXT
            }
        }

        // x2 banner
        if (world.hudX2 && state == World.STATE_RACING) {
            pText.textAlign = Paint.Align.CENTER
            pText.textSize = 15f * d
            val y = paddingTop + margin + (if (world.mode == GameData.MODE_TIME_ATTACK) 140f else 90f) * d
            val tw = pText.measureText(sX2)
            rect.set(w / 2 - tw / 2 - 14f * d, y - 20f * d, w / 2 + tw / 2 + 14f * d, y + 8f * d)
            pFill.color = Ui.withAlpha(Ui.PINK, 0xCC)
            canvas.drawRoundRect(rect, 14f * d, 14f * d, pFill)
            pText.color = Ui.TEXT
            canvas.drawText(sX2, w / 2, y, pText)
        }

        // checkpoint
        val cs = world.hudCheckSeq
        if (lastCheckSeq < 0) lastCheckSeq = cs
        if (cs != lastCheckSeq) {
            lastCheckSeq = cs
            checkStart = now
        }
        if (checkStart != 0L) {
            val t = (now - checkStart) / 1000f
            if (t > 1.8f) checkStart = 0L
            else {
                val a = if (t < 1.4f) 1f else 1f - (t - 1.4f) / 0.4f
                pText.textAlign = Paint.Align.CENTER
                pText.textSize = 24f * d
                pText.color = Ui.withAlpha(Ui.GREEN, (255 * a).toInt())
                pText.setShadowLayer(10f * d, 0f, 0f, Ui.withAlpha(Ui.GREEN, (200 * a).toInt()))
                canvas.drawText(sCheckpoint, w / 2, h * 0.22f, pText)
                pText.clearShadowLayer()
                var k = 0
                chars[k++] = '+'
                k += Lang.writeInt(checkpointBonus, chars, k, false)
                pBig.textSize = 28f * d
                pBig.color = Ui.withAlpha(Ui.GREEN, (255 * a).toInt())
                canvas.drawText(chars, 0, k, w / 2, h * 0.22f + 34f * d, pBig)
                pBig.color = Ui.TEXT
            }
        }

        // countdown
        if (state == World.STATE_COUNTDOWN) {
            val c = world.hudCountdown
            val num = ceil(c.toDouble()).toInt().coerceAtLeast(1)
            val frac = c - (num - 1)
            val scale = 0.8f + frac * 0.6f
            pBig.textSize = 96f * d * scale
            pBig.color = Ui.withAlpha(Ui.YELLOW, (255 * min(1f, frac * 1.6f)).toInt())
            pBig.setShadowLayer(18f * d, 0f, 0f, Ui.PINK)
            val k = Lang.writeInt(num, chars, 0, false)
            canvas.drawText(chars, 0, k, w / 2, h * 0.45f, pBig)
            pBig.clearShadowLayer()
            pBig.color = Ui.TEXT
        } else if (goStart != 0L) {
            val t = (now - goStart) / 1000f
            if (t > 0.9f) goStart = 0L
            else {
                pBig.textSize = 84f * d * (1f + t * 0.5f)
                pBig.color = Ui.withAlpha(Ui.GREEN, (255 * (1f - t / 0.9f)).toInt())
                pBig.setShadowLayer(18f * d, 0f, 0f, Ui.GREEN)
                canvas.drawText(sGo, w / 2, h * 0.45f, pBig)
                pBig.clearShadowLayer()
                pBig.color = Ui.TEXT
            }
        }

        // control hint at race start
        if ((state == World.STATE_COUNTDOWN || state == World.STATE_RACING) && raceStart != 0L) {
            val t = (now - raceStart) / 1000f
            if (t < 6f) {
                val a = if (t < 5f) 1f else 6f - t
                pText.textAlign = Paint.Align.CENTER
                pText.textSize = 14f * d
                pText.color = Ui.withAlpha(Ui.TEXT, (220 * a).toInt())
                canvas.drawText(if (touchSteering) sHintTouch else sHintTilt, w / 2, h * 0.56f, pText)
                pText.color = Ui.TEXT
            }
        }
    }

    private fun drawButtons(canvas: Canvas) {
        val state = world.hudState
        if (state != World.STATE_RACING && state != World.STATE_COUNTDOWN) return
        for (b in buttons) {
            if (!b.visible || b.id == B_PAUSE) continue
            val pressed = when (b.id) {
                B_LEFT -> input.left
                B_RIGHT -> input.right
                B_GAS -> input.gas
                B_BRAKE -> input.brake
                B_NITRO -> input.nitro
                else -> input.horn
            }
            val accent = when (b.id) {
                B_GAS -> Ui.GREEN
                B_BRAKE -> Ui.RED
                B_NITRO -> Ui.PINK
                B_HORN -> Ui.YELLOW
                else -> Ui.CYAN
            }
            val r = b.r
            val rad = 18f * d
            pFill.color = if (pressed) Ui.withAlpha(accent, 0x88) else 0x55070A14
            canvas.drawRoundRect(r, rad, rad, pFill)
            pStroke.strokeWidth = (if (pressed) 2.5f else 1.6f) * d
            pStroke.color = Ui.withAlpha(accent, if (pressed) 0xFF else 0x99)
            canvas.drawRoundRect(r, rad, rad, pStroke)
            when (b.id) {
                B_LEFT, B_RIGHT -> {
                    pFill.color = Ui.withAlpha(Ui.TEXT, if (pressed) 0xFF else 0xCC)
                    canvas.drawPath(if (b.id == B_LEFT) arrowLeft else arrowRight, pFill)
                }
                B_NITRO -> {
                    // flame glyph + fill level
                    val lvl = world.hudNitro.coerceIn(0f, 1f)
                    rect.set(r.left + 6f * d, r.bottom - 6f * d - (r.height() - 12f * d) * lvl, r.right - 6f * d, r.bottom - 6f * d)
                    pFill.color = Ui.withAlpha(Ui.PINK, 0x33)
                    canvas.drawRoundRect(rect, 12f * d, 12f * d, pFill)
                    drawLabel(canvas, b.label, r, accent, pressed)
                }
                else -> drawLabel(canvas, b.label, r, accent, pressed)
            }
        }
    }

    private fun drawLabel(canvas: Canvas, label: String, r: RectF, accent: Int, pressed: Boolean) {
        pText.textAlign = Paint.Align.CENTER
        pText.textSize = min(16f * d, r.width() * 0.22f)
        pText.color = if (pressed) Ui.TEXT else Ui.withAlpha(accent, 0xEE)
        canvas.drawText(label, r.centerX(), r.centerY() + pText.textSize * 0.35f, pText)
        pText.color = Ui.TEXT
    }

    override fun onVisibilityChanged(changedView: View, visibility: Int) {
        super.onVisibilityChanged(changedView, visibility)
        if (visibility == VISIBLE) postInvalidateOnAnimation()
    }

    companion object {
        const val B_LEFT = 0
        const val B_RIGHT = 1
        const val B_GAS = 2
        const val B_BRAKE = 3
        const val B_NITRO = 4
        const val B_HORN = 5
        const val B_PAUSE = 6
    }
}
