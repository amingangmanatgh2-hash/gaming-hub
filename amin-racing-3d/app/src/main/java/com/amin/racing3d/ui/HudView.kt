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
import kotlin.math.abs
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
        /** v2.0: the phone button in the top bar */
        fun onPhonePressed() {}
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
    private val sPos = context.getString(R.string.hud_pos)
    private val sToGo = context.getString(R.string.hud_to_go)
    private val sDrift = context.getString(R.string.hud_drift)
    private val sBust = context.getString(R.string.hud_bust)
    private val sEscape = context.getString(R.string.hud_escape)
    private val sHeat = context.getString(R.string.hud_heat)
    private val sNearGoal = context.getString(R.string.hud_near_goal)
    private val sTarget = context.getString(R.string.hud_target)
    private val sEvEscape = context.getString(R.string.ev_escape)
    private val sEvTakedown = context.getString(R.string.ev_takedown)
    private val sEvWave = context.getString(R.string.ev_wave)
    private val sEvRegion = context.getString(R.string.ev_region)
    private val sDriftLost = context.getString(R.string.drift_lost)
    // v2.0 on foot / taxi
    private val sWalk = context.getString(R.string.btn_walk)
    private val sRun = context.getString(R.string.btn_run)
    private val sBack = context.getString(R.string.btn_back)
    private val sDoorExit = context.getString(R.string.door_exit)
    private val sDoorEnter = context.getString(R.string.door_enter)
    private val sEvExit = context.getString(R.string.ev_exit)
    private val sEvOuch = context.getString(R.string.ev_ouch)
    private val sTaxi = context.getString(R.string.taxi_title)
    private val sTaxiWaiting = context.getString(R.string.taxi_waiting)
    private val sTaxiBoarding = context.getString(R.string.taxi_boarding)
    private val sTaxiStop = context.getString(R.string.taxi_stop_hint)
    private val sTaxiNew = context.getString(R.string.taxi_new)
    private val sTaxiAboard = context.getString(R.string.taxi_aboard)
    private val sTaxiPaid = context.getString(R.string.taxi_paid)
    private val sTaxiMissed = context.getString(R.string.taxi_missed)
    private val sTaxiReroute = context.getString(R.string.taxi_reroute)
    private val sTaxiCancel = context.getString(R.string.taxi_cancel)
    private val sTaxiLate = context.getString(R.string.taxi_late)
    private val sKerbL = context.getString(R.string.taxi_kerb_left)
    private val sKerbR = context.getString(R.string.taxi_kerb_right)
    private val sM = context.getString(R.string.unit_m)
    private val sDest = Array(World.NUM_DESTS) { context.getString(DESTS[it]) }
    private var lastTaxiSeq = -1
    private val pCard = Paint(Paint.ANTI_ALIAS_FLAG)
    private val sWeather = Array(GameData.weatherNames.size) { context.getString(GameData.weatherNames[it]) }
    private val sEnvNames = Array(GameData.envs.size) { context.getString(GameData.envs[it].nameRes) }
    private var lastEventSeq = -1
    private var lastDriftSeq = -1
    private var lastDriftLostSeq = -1
    private var driftBankStart = 0L
    private var driftBankPts = 0
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

    private val buttons = Array(9) { Button(it) }
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
        lastEventSeq = world.hudEventSeq
        lastDriftSeq = world.hudDriftSeq
        lastDriftLostSeq = world.hudDriftLostSeq
        lastTaxiSeq = world.hudTaxiSeq
        driftBankStart = 0L
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

        // pause button, phone next to it
        buttons[B_PAUSE].r.set(padL, padT, padL + 46f * d, padT + 46f * d)
        buttons[B_PHONE].r.set(padL + 56f * d, padT, padL + 102f * d, padT + 46f * d)

        val gas = buttons[B_GAS].r
        gas.set(w - padR - b, h - padB - b * 1.35f, w - padR, h - padB)
        val nitro = buttons[B_NITRO].r
        nitro.set(gas.left, gas.top - gap - b * 0.82f, gas.right, gas.top - gap)
        buttons[B_DOOR].r.set(nitro.left - b * 0.15f, nitro.top - gap - b * 0.62f, nitro.right, nitro.top - gap)

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
            // landscape: keep the centre (the car) clear – the gauge sits on the left side
            gaugeR = (h * 0.12f).coerceIn(40f * d, 76f * d)
            val below = gaugeR + 36f * d   // nitro bar + label under the dial
            if (touchSteering) {
                val arrowsTop = buttons[B_LEFT].r.top
                gaugeX = padL + b + gap / 2f
                gaugeY = arrowsTop - 8f * d - below
                if (gaugeY - gaugeR < padT + 56f * d) gaugeY = padT + 56f * d + gaugeR
            } else {
                gaugeX = padL + b + gap + gaugeR + 18f * d
                gaugeY = h - padB - below
            }
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
                if (hit == B_PHONE) {
                    listener?.onButtonHaptic()
                    listener?.onPhonePressed()
                    return true
                }
                if (hit == B_DOOR) {
                    listener?.onButtonHaptic()
                    input.doorRequest = true
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
                    if (hit != B_PAUSE && hit != B_PHONE && hit != B_DOOR) pointerButton[id] = hit
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
            if (!shown(b)) continue
            val r = b.r
            if (x >= r.left - slop && x <= r.right + slop && y >= r.top - slop && y <= r.bottom + slop) return b.id
        }
        return -1
    }

    private fun phoneAvailable(): Boolean {
        val st = world.hudState
        return (world.mode == GameData.MODE_ENDLESS || world.mode == GameData.MODE_FREE) && world.cfg.missionId < 0 &&
            (st == World.STATE_RACING || st == World.STATE_CRASHED)
    }

    /** dynamic visibility: horn hides on foot, door/phone only when usable */
    private fun shown(b: Button): Boolean = when (b.id) {
        B_DOOR -> world.hudDoor != World.DOOR_NONE && world.hudState == World.STATE_RACING
        B_PHONE -> phoneAvailable()
        B_HORN -> b.visible && !world.onFoot
        else -> b.visible
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
        drawModePanel(canvas, w, now)
        drawTaxi(canvas, w, now)
        if (!world.onFoot) drawGauge(canvas)
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

    private fun scoreHidden(): Boolean {
        val m = world.mode
        return m == GameData.MODE_STREET || m == GameData.MODE_TIME_TRIAL || m == GameData.MODE_POLICE || m == GameData.MODE_FREE
    }

    /** writes m:ss.t into [chars] at [start]; returns the new length */
    private fun writeClock(t: Float, start: Int): Int {
        val tenths = (t * 10f).toInt().coerceAtLeast(0)
        var k = start
        k += Lang.writeInt(tenths / 600, chars, k, false)
        chars[k++] = ':'
        val sec = (tenths / 10) % 60
        if (sec < 10) k += Lang.writeInt(0, chars, k, false)
        k += Lang.writeInt(sec, chars, k, false)
        chars[k++] = if (Lang.isFa) '\u066B' else '.'
        k += Lang.writeInt(tenths % 10, chars, k, false)
        return k
    }

    private fun drawBar(canvas: Canvas, cx: Float, y: Float, bw: Float, v: Float, color: Int, label: String) {
        rect.set(cx - bw / 2, y, cx + bw / 2, y + 9f * d)
        pFill.color = 0xAA070A14.toInt()
        canvas.drawRoundRect(rect, 5f * d, 5f * d, pFill)
        val fill = v.coerceIn(0f, 1f)
        if (fill > 0.01f) {
            if (Lang.isFa) rect.set(cx + bw / 2 - bw * fill, y, cx + bw / 2, y + 9f * d)
            else rect.set(cx - bw / 2, y, cx - bw / 2 + bw * fill, y + 9f * d)
            pFill.color = color
            canvas.drawRoundRect(rect, 5f * d, 5f * d, pFill)
        }
        pSmall.textAlign = Paint.Align.CENTER
        pSmall.textSize = 10.5f * d
        pSmall.color = Ui.withAlpha(color, 0xEE)
        canvas.drawText(label, cx, y - 3f * d, pSmall)
    }

    /** Objective read-outs for the v2 modes plus event banners. */
    private fun drawModePanel(canvas: Canvas, w: Float, now: Long) {
        val top = paddingTop + margin
        val m = world.mode
        // event banners
        val es = world.hudEventSeq
        if (es != lastEventSeq) {
            if (lastEventSeq != -1) {
                when (world.hudEvent) {
                    World.EV_ESCAPE -> showMessage(sEvEscape)
                    World.EV_TAKEDOWN -> showMessage(sEvTakedown, 1600)
                    World.EV_WAVE -> showMessage(sEvWave, 1800)
                    World.EV_EXIT -> showMessage(sEvExit, 3000)
                    World.EV_OUCH -> showMessage(sEvOuch, 1800)
                    World.EV_REGION -> showMessage(sEvRegion + " " + sEnvNames[world.hudEnv.coerceIn(0, sEnvNames.size - 1)] +
                        "  •  " + sWeather[world.hudWeather.coerceIn(0, sWeather.size - 1)], 3200)
                }
            }
            lastEventSeq = es
        }
        if (world.hudDriftSeq != lastDriftSeq) {
            if (lastDriftSeq != -1) { driftBankStart = now; driftBankPts = world.hudDriftBank }
            lastDriftSeq = world.hudDriftSeq
        }
        if (world.hudDriftLostSeq != lastDriftLostSeq) {
            if (lastDriftLostSeq != -1) showMessage(sDriftLost, 1400)
            lastDriftLostSeq = world.hudDriftLostSeq
        }
        if (world.hudState != World.STATE_RACING && world.hudState != World.STATE_CRASHED && world.hudState != World.STATE_COUNTDOWN) return
        val cx = w / 2
        pText.textAlign = Paint.Align.CENTER
        when (m) {
            GameData.MODE_STREET -> {
                pSmall.textAlign = Paint.Align.CENTER; pSmall.textSize = 12f * d; pSmall.color = Ui.DIM
                canvas.drawText(sPos, cx, top + 12f * d, pSmall)
                var k = Lang.writeInt(world.hudPosition, chars, 0, false)
                chars[k++] = '/'
                k += Lang.writeInt(world.hudRacers + 1, chars, k, false)
                pBig.textSize = 36f * d
                pBig.color = if (world.hudPosition == 1) Ui.YELLOW else Ui.TEXT
                pBig.setShadowLayer(10f * d, 0f, 0f, Ui.PINK)
                canvas.drawText(chars, 0, k, cx, top + 48f * d, pBig)
                pBig.clearShadowLayer()
                drawToGo(canvas, cx, top + 68f * d)
            }
            GameData.MODE_TIME_TRIAL -> {
                pSmall.textAlign = Paint.Align.CENTER; pSmall.textSize = 12f * d; pSmall.color = Ui.DIM
                canvas.drawText(sTime, cx, top + 12f * d, pSmall)
                val k = writeClock(world.hudRaceTime, 0)
                pBig.textSize = 32f * d
                val gold = world.cfg.gold
                pBig.color = if (world.hudRaceTime <= gold) Ui.YELLOW else if (world.hudRaceTime <= world.cfg.bronze) Ui.TEXT else Ui.RED
                canvas.drawText(chars, 0, k, cx, top + 46f * d, pBig)
                pSmall.color = Ui.withAlpha(Ui.YELLOW, 0xCC)
                val k2 = writeClock(gold, 0)
                val label = sTarget + " "
                val lw = pSmall.measureText(label); val nw = pSmall.measureText(chars, 0, k2)
                pSmall.textAlign = Paint.Align.LEFT
                if (Lang.isFa) { canvas.drawText(chars, 0, k2, cx - (lw + nw) / 2, top + 62f * d, pSmall); canvas.drawText(label, cx - (lw + nw) / 2 + nw, top + 62f * d, pSmall) }
                else { canvas.drawText(label, cx - (lw + nw) / 2, top + 62f * d, pSmall); canvas.drawText(chars, 0, k2, cx - (lw + nw) / 2 + lw, top + 62f * d, pSmall) }
                drawToGo(canvas, cx, top + 80f * d)
            }
            GameData.MODE_DRIFT -> {
                drawTimeLeft(canvas, cx, top + 96f * d, now)
                val chain = world.hudDriftChain
                if (chain > 0) {
                    pText.textSize = 22f * d
                    pText.color = Ui.PINK
                    pText.setShadowLayer(8f * d, 0f, 0f, Ui.PINK)
                    var k = Lang.writeInt(chain, chars, 0, true)
                    chars[k++] = ' '; chars[k++] = '×'
                    k += Lang.writeInt(world.hudDriftMult, chars, k, false)
                    canvas.drawText(chars, 0, k, cx, height * 0.36f, pText)
                    pText.clearShadowLayer()
                    pSmall.textAlign = Paint.Align.CENTER; pSmall.textSize = 12f * d; pSmall.color = Ui.withAlpha(Ui.PINK, 0xCC)
                    canvas.drawText(sDrift, cx, height * 0.36f - 26f * d, pSmall)
                }
                val age = now - driftBankStart
                if (driftBankStart > 0L && age < 1300L) {
                    val a = 1f - age / 1300f
                    pText.textSize = 20f * d
                    pText.color = Ui.withAlpha(Ui.GREEN, (255 * a).toInt())
                    var k = 0
                    chars[k++] = '+'
                    k += Lang.writeInt(driftBankPts, chars, k, true)
                    canvas.drawText(chars, 0, k, cx, height * 0.3f - age / 1300f * 40f * d, pText)
                }
            }
            GameData.MODE_CHALLENGE -> {
                drawTimeLeft(canvas, cx, top + 96f * d, now)
                // count towards the next medal: bronze (passes) → silver → gold
                val near = world.hudNear
                val cfg = world.cfg
                val target: Int
                val tc: Int
                if (cfg.bronze > 0f && near < cfg.bronze) { target = cfg.bronze.toInt(); tc = 0xFFD08A4E.toInt() }
                else if (cfg.silver > 0f && near < cfg.silver) { target = cfg.silver.toInt(); tc = 0xFFD7DCE4.toInt() }
                else { target = cfg.gold.toInt(); tc = 0xFFFFD34D.toInt() }
                pText.textSize = 18f * d
                pText.color = tc
                var k = Lang.writeInt(near, chars, 0, false)
                chars[k++] = ' '; chars[k++] = '/'; chars[k++] = ' '
                k += Lang.writeInt(target, chars, k, false)
                canvas.drawText(chars, 0, k, cx, top + 130f * d, pText)
                pSmall.textAlign = Paint.Align.CENTER; pSmall.textSize = 11f * d; pSmall.color = Ui.DIM
                canvas.drawText(sNearGoal, cx, top + 146f * d, pSmall)
            }
            GameData.MODE_POLICE -> {
                val bw = 170f * d
                drawBar(canvas, cx, top + 22f * d, bw, world.hudBust, Ui.RED, sBust)
                drawBar(canvas, cx, top + 50f * d, bw, world.hudEscape, Ui.GREEN, sEscape)
                // heat stars
                pText.textSize = 14f * d
                val heat = world.hudHeat
                val sw = 16f * d
                for (i in 0 until 5) {
                    pText.color = if (i < heat) Ui.YELLOW else Ui.withAlpha(Ui.DIM, 0x66)
                    canvas.drawText("★", cx + (i - 2) * sw, top + 80f * d, pText)
                }
                if (world.hudBust > 0.6f && (now / 150) % 2 == 0L) {
                    pFill.color = Ui.withAlpha(Ui.RED, 0x30)
                    canvas.drawRect(0f, 0f, w, height.toFloat(), pFill)
                }
            }
            else -> {}
        }
    }

    private fun drawToGo(canvas: Canvas, cx: Float, y: Float) {
        val dist = world.hudToGo
        val tenths = (dist / 100f).toInt()
        var k = Lang.writeInt(tenths / 10, chars, 0, false)
        chars[k++] = if (Lang.isFa) '\u066B' else '.'
        k += Lang.writeInt(tenths % 10, chars, k, false)
        chars[k++] = ' '
        for (ch in sKm) chars[k++] = ch
        pSmall.textSize = 12f * d; pSmall.color = Ui.CYAN
        val lw = pSmall.measureText(sToGo) + 8f * d
        val nw = pSmall.measureText(chars, 0, k)
        val x0 = cx - (lw + nw) / 2
        pSmall.textAlign = Paint.Align.LEFT
        if (Lang.isFa) { canvas.drawText(chars, 0, k, x0, y, pSmall); canvas.drawText(sToGo, x0 + nw + 8f * d, y, pSmall) }
        else { canvas.drawText(sToGo, x0, y, pSmall); canvas.drawText(chars, 0, k, x0 + lw, y, pSmall) }
    }

    private fun drawTimeLeft(canvas: Canvas, cx: Float, y: Float, now: Long) {
        val t = world.hudTime
        val secs = ceil(t.toDouble()).toInt()
        val low = t < 10f
        pText.textAlign = Paint.Align.CENTER
        pText.textSize = 12f * d
        pText.color = Ui.DIM
        canvas.drawText(sTime, cx, y - 24f * d, pText)
        pBig.textSize = 26f * d
        val pulse = if (low) (0.5f + 0.5f * sin(now / 90.0).toFloat()) else 0f
        pBig.color = if (low) Ui.withAlpha(Ui.RED, (180 + 75 * pulse).toInt()) else Ui.YELLOW
        val k = Lang.writeInt(secs, chars, 0, false)
        canvas.drawText(chars, 0, k, cx, y + 2f * d, pBig)
        pBig.color = Ui.TEXT
    }

    private fun drawTopBar(canvas: Canvas, w: Float, now: Long) {
        val top = paddingTop + margin
        // ---- score (centre)
        if (!scoreHidden()) drawScore(canvas, w, top)
        drawTopRest(canvas, w, now, top)
    }

    private fun drawScore(canvas: Canvas, w: Float, top: Float) {
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
    }

    private fun drawTopRest(canvas: Canvas, w: Float, now: Long, top: Float) {
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
        val foot = world.onFoot
        for (b in buttons) {
            if (!shown(b) || b.id == B_PAUSE) continue
            if (b.id == B_PHONE) { drawPhoneButton(canvas, b.r); continue }
            if (b.id == B_DOOR) {
                val enter = world.hudDoor == World.DOOR_ENTER
                val acc = if (enter) Ui.GREEN else Ui.YELLOW
                val pulse = 0.5f + 0.5f * sin(SystemClock.uptimeMillis() / 220.0).toFloat()
                pFill.color = Ui.withAlpha(acc, (0x33 + 0x33 * pulse).toInt())
                canvas.drawRoundRect(b.r, 16f * d, 16f * d, pFill)
                pStroke.strokeWidth = 2f * d
                pStroke.color = acc
                canvas.drawRoundRect(b.r, 16f * d, 16f * d, pStroke)
                drawLabel(canvas, if (enter) sDoorEnter else sDoorExit, b.r, acc, false, 13f)
                continue
            }
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
                    if (foot) { drawLabel(canvas, sRun, r, accent, pressed); continue }
                    // flame glyph + fill level
                    val lvl = world.hudNitro.coerceIn(0f, 1f)
                    rect.set(r.left + 6f * d, r.bottom - 6f * d - (r.height() - 12f * d) * lvl, r.right - 6f * d, r.bottom - 6f * d)
                    pFill.color = Ui.withAlpha(Ui.PINK, 0x33)
                    canvas.drawRoundRect(rect, 12f * d, 12f * d, pFill)
                    drawLabel(canvas, b.label, r, accent, pressed)
                }
                B_GAS -> drawLabel(canvas, if (foot) sWalk else b.label, r, accent, pressed)
                B_BRAKE -> drawLabel(canvas, if (foot) sBack else b.label, r, accent, pressed)
                else -> drawLabel(canvas, b.label, r, accent, pressed)
            }
        }
    }

    /** rounded phone glyph with a notification dot while a taxi job is waiting */
    private fun drawPhoneButton(canvas: Canvas, r: RectF) {
        pFill.color = 0x99070A14.toInt()
        canvas.drawRoundRect(r, 12f * d, 12f * d, pFill)
        pStroke.strokeWidth = 1.6f * d
        pStroke.color = Ui.withAlpha(Ui.PINK, 0xAA)
        canvas.drawRoundRect(r, 12f * d, 12f * d, pStroke)
        val cx = r.centerX(); val cy = r.centerY()
        rect.set(cx - 7.5f * d, cy - 13f * d, cx + 7.5f * d, cy + 13f * d)
        pStroke.color = Ui.TEXT
        pStroke.strokeWidth = 2f * d
        canvas.drawRoundRect(rect, 3.5f * d, 3.5f * d, pStroke)
        pFill.color = Ui.TEXT
        canvas.drawCircle(cx, cy + 9f * d, 1.6f * d, pFill)
        rect.set(cx - 3f * d, cy - 10.5f * d, cx + 3f * d, cy - 9f * d)
        canvas.drawRect(rect, pFill)
        if (world.hudTaxiState == World.TAXI_WAITING) {
            pFill.color = Ui.YELLOW
            canvas.drawCircle(r.right - 7f * d, r.top + 7f * d, 5f * d, pFill)
        }
    }

    /** Taxi job card: state, distance + kerb side, and for a ride the timer and the fare. */
    private fun drawTaxi(canvas: Canvas, w: Float, now: Long) {
        val seq = world.hudTaxiSeq
        if (seq != lastTaxiSeq) {
            if (lastTaxiSeq != -1) when (world.hudTaxiEvent) {
                World.TAXI_EV_NEW -> showMessage(sTaxiNew, 2200)
                World.TAXI_EV_ABOARD -> showMessage(sTaxiAboard + " " + sDest[world.hudTaxiDest.coerceIn(0, sDest.size - 1)], 2600)
                World.TAXI_EV_PAID -> {
                    val st = world.taxiStars.coerceIn(1, 5)
                    showMessage(sTaxiPaid + " +" + Lang.num(world.taxiLastPay) + "  " + "★".repeat(st) + "☆".repeat(5 - st), 3400)
                }
                World.TAXI_EV_MISSED -> showMessage(sTaxiMissed, 2000)
                World.TAXI_EV_REROUTE -> showMessage(sTaxiReroute, 2400)
                World.TAXI_EV_CANCEL -> showMessage(sTaxiCancel, 2000)
            }
            lastTaxiSeq = seq
        }
        val ts = world.hudTaxiState
        if (ts != World.TAXI_WAITING && ts != World.TAXI_BOARDING && ts != World.TAXI_RIDING) return
        val st = world.hudState
        if (st != World.STATE_RACING && st != World.STATE_CRASHED) return
        val top = paddingTop + margin
        val cw = 196f * d
        val ch = if (ts == World.TAXI_RIDING) 78f * d else 60f * d
        val x0: Float
        val y0: Float
        if (portrait) { x0 = paddingLeft + margin; y0 = top + 134f * d }
        else { x0 = w - paddingRight - margin - cw; y0 = top + 62f * d }
        rect.set(x0, y0, x0 + cw, y0 + ch)
        pCard.shader = null
        pCard.color = 0xCC0B0F1C.toInt()
        canvas.drawRoundRect(rect, 14f * d, 14f * d, pCard)
        val acc = if (ts == World.TAXI_RIDING) Ui.GREEN else Ui.YELLOW
        pStroke.strokeWidth = 1.6f * d
        pStroke.color = Ui.withAlpha(acc, 0xAA)
        canvas.drawRoundRect(rect, 14f * d, 14f * d, pStroke)
        // accent stripe
        rect.set(x0, y0 + 10f * d, x0 + 4f * d, y0 + ch - 10f * d)
        pFill.color = acc
        canvas.drawRoundRect(rect, 2f * d, 2f * d, pFill)
        val fa = Lang.isFa
        val tx = if (fa) x0 + cw - 14f * d else x0 + 14f * d
        val al = if (fa) Paint.Align.RIGHT else Paint.Align.LEFT
        val ax = if (fa) x0 + 14f * d else x0 + cw - 14f * d
        val alOpp = if (fa) Paint.Align.LEFT else Paint.Align.RIGHT
        // line 1: title / state
        pText.textAlign = al
        pText.textSize = 13f * d
        pText.color = acc
        val title = when (ts) {
            World.TAXI_WAITING -> sTaxiWaiting
            World.TAXI_BOARDING -> sTaxiBoarding
            else -> sDest[world.hudTaxiDest.coerceIn(0, sDest.size - 1)]
        }
        canvas.drawText(title, tx, y0 + 20f * d, pText)
        pSmall.textAlign = alOpp
        pSmall.textSize = 11f * d
        pSmall.color = Ui.DIM
        canvas.drawText(sTaxi, ax, y0 + 20f * d, pSmall)
        // line 2: distance + kerb side
        val dist = world.hudTaxiDist
        val ad = abs(dist).toInt()
        var k: Int
        if (ad >= 1000) {
            val tenths = ad / 100
            k = Lang.writeInt(tenths / 10, chars, 0, false)
            chars[k++] = if (fa) '\u066B' else '.'
            k += Lang.writeInt(tenths % 10, chars, k, false)
        } else k = Lang.writeInt((ad / 10) * 10, chars, 0, false)
        pBig.textAlign = al
        pBig.textSize = 20f * d
        pBig.color = Ui.TEXT
        canvas.drawText(chars, 0, k, tx, y0 + 44f * d, pBig)
        pBig.textAlign = Paint.Align.CENTER
        val nw = pBig.measureText(chars, 0, k)
        pSmall.textAlign = al
        pSmall.color = Ui.DIM
        pSmall.textSize = 11f * d
        val unit = if (ad >= 1000) sKm else sM
        canvas.drawText(unit, if (fa) tx - nw - 5f * d else tx + nw + 5f * d, y0 + 44f * d, pSmall)
        val side = if (ts == World.TAXI_RIDING) world.taxiDropSide else world.taxiPickSide
        pText.textAlign = alOpp
        pText.textSize = 12f * d
        pText.color = acc
        canvas.drawText(if (side > 0) sKerbR else sKerbL, ax, y0 + 43f * d, pText)
        if (ts == World.TAXI_RIDING) {
            // line 3: timer + fare
            val left = world.hudTaxiTime
            pText.textAlign = al
            pText.textSize = 14f * d
            if (left > 0f) {
                val kk = writeClock(left, 0)
                pText.color = if (left < 10f) Ui.withAlpha(Ui.RED, (170 + 85 * sin(now / 120.0)).toInt().coerceIn(0, 255)) else Ui.TEXT
                canvas.drawText(chars, 0, kk, tx, y0 + 66f * d, pText)
            } else {
                pText.color = Ui.RED
                canvas.drawText(sTaxiLate, tx, y0 + 66f * d, pText)
            }
            pText.textAlign = alOpp
            pText.color = Ui.YELLOW
            val fk = Lang.writeInt(world.hudTaxiFare, chars, 0, true)
            canvas.drawText(chars, 0, fk, ax, y0 + 66f * d, pText)
        }
        // stop hint when close
        if (abs(dist) < 70f && world.hudSpeed > 15) {
            pText.textAlign = Paint.Align.CENTER
            pText.textSize = 15f * d
            pText.color = Ui.withAlpha(acc, (180 + 75 * sin(now / 140.0)).toInt().coerceIn(0, 255))
            pText.setShadowLayer(6f * d, 0f, 0f, 0xFF000000.toInt())
            canvas.drawText(sTaxiStop, w / 2, height * 0.3f, pText)
            pText.clearShadowLayer()
        }
        pText.color = Ui.TEXT
    }

    private fun drawLabel(canvas: Canvas, label: String, r: RectF, accent: Int, pressed: Boolean, maxSp: Float = 16f) {
        pText.textAlign = Paint.Align.CENTER
        pText.textSize = min(maxSp * d, r.width() * 0.22f)
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
        const val B_DOOR = 7
        const val B_PHONE = 8
        val DESTS = intArrayOf(R.string.dest_0, R.string.dest_1, R.string.dest_2, R.string.dest_3, R.string.dest_4, R.string.dest_5,
            R.string.dest_6, R.string.dest_7, R.string.dest_8, R.string.dest_9, R.string.dest_10, R.string.dest_11)
    }
}
