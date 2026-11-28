package com.amin.racing3d.ui

import android.annotation.SuppressLint
import android.content.res.ColorStateList
import android.graphics.drawable.GradientDrawable
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.SeekBar
import com.amin.racing3d.R
import com.amin.racing3d.audio.AudioEngine
import com.amin.racing3d.core.Lang
import com.amin.racing3d.game.GameData

// =====================================================================================
/** Garage / car select: rotating 3D showroom car, stats, paint and purchase. */
class GarageScreen(host: GameHost, startCar: Int = -1) : Screen(host) {
    override val dim = 0f
    private var car = if (startCar in GameData.cars.indices) startCar else save.selectedCar
    private var previewPaint = save.paintIndex(car)
    private lateinit var panel: LinearLayout
    private lateinit var nameView: android.widget.TextView
    private lateinit var priceView: android.widget.TextView
    /** v2.1: cars in the chosen shop order (default: cheapest first) */
    private var order = sortedCars(save.shopSort)
    private lateinit var strip: LinearLayout
    private lateinit var stripScroll: android.widget.HorizontalScrollView

    @SuppressLint("ClickableViewAccessibility")
    override fun build(): View {
        val root = FrameLayout(ctx)

        // inspection surface (transparent, under the UI): rotate, tilt, pinch zoom, double-tap reset
        root.addView(inspectSurface(host), FrameLayout.LayoutParams(Ui.MATCH, Ui.MATCH))

        val column = LinearLayout(ctx)
        column.orientation = LinearLayout.VERTICAL
        column.addView(header(str(R.string.garage_title)), LinearLayout.LayoutParams(Ui.MATCH, Ui.WRAP))

        // car name + arrows
        val nameRow = Ui.hbox(ctx, Gravity.CENTER)
        nameRow.setPadding(Ui.dp(12f), Ui.dp(4f), Ui.dp(12f), 0)
        // arrows point outward in both reading directions
        val prev = Ui.button(ctx, if (Lang.isFa) "›" else "‹", Ui.CYAN, false, 26f) { step(-1) }
        val next = Ui.button(ctx, if (Lang.isFa) "‹" else "›", Ui.CYAN, false, 26f) { step(1) }
        prev.setPadding(Ui.dp(18f), 0, Ui.dp(18f), Ui.dp(4f))
        next.setPadding(Ui.dp(18f), 0, Ui.dp(18f), Ui.dp(4f))
        val nameCol = Ui.vbox(ctx, Gravity.CENTER)
        nameView = Ui.glowTitle(ctx, "", 26f, Ui.TEXT)
        priceView = Ui.text(ctx, "", 13f, Ui.YELLOW, Ui.bold)
        priceView.gravity = Gravity.CENTER
        nameCol.addView(nameView, Ui.lp(Ui.WRAP))
        nameCol.addView(priceView, Ui.lp(Ui.WRAP))
        nameRow.addView(prev)
        nameRow.addView(nameCol, LinearLayout.LayoutParams(0, Ui.WRAP, 1f))
        nameRow.addView(next)

        // v2.1 shop: sort chips + a strip of every car with price and state
        val shop = Ui.vbox(ctx, Gravity.NO_GRAVITY)
        shop.layoutDirection = Lang.layoutDirection
        shop.setPadding(Ui.dp(10f), 0, Ui.dp(10f), Ui.dp(6f))
        val sortNames = listOf(str(R.string.sort_cheap), str(R.string.sort_expensive), str(R.string.sort_perf), str(R.string.sort_category))
        val chips = Ui.segmented(ctx, sortNames, save.shopSort, Ui.YELLOW) {
            save.shopSort = it
            order = sortedCars(it)
            buildStrip()
            scrollStripTo(car)
        }
        shop.addView(chips, Ui.lp())
        stripScroll = android.widget.HorizontalScrollView(ctx)
        stripScroll.isHorizontalScrollBarEnabled = false
        strip = Ui.hbox(ctx, Gravity.CENTER_VERTICAL)
        strip.setPadding(0, Ui.dp(6f), 0, 0)
        stripScroll.addView(strip, FrameLayout.LayoutParams(Ui.WRAP, Ui.WRAP))
        shop.addView(stripScroll, Ui.lp())
        buildStrip()

        panel = Ui.panel(ctx, true, Ui.withAlpha(Ui.PINK, 0x66))
        val scroll = ScrollView(ctx)
        scroll.isVerticalScrollBarEnabled = false
        scroll.addView(panel, FrameLayout.LayoutParams(Ui.MATCH, Ui.WRAP))

        if (portrait) {
            // car occupies the space between the name and the bottom panel
            column.addView(nameRow, Ui.lp())
            val spacer = View(ctx)
            column.addView(spacer, LinearLayout.LayoutParams(Ui.MATCH, 0, 1f))
            column.addView(shop, Ui.lp())
            val h = (ctx.resources.displayMetrics.heightPixels * 0.5f).toInt()
            val lp = LinearLayout.LayoutParams(Ui.MATCH, Ui.WRAP)
            lp.setMargins(Ui.dp(10f), 0, Ui.dp(10f), Ui.dp(10f))
            scroll.layoutParams = lp
            val box = FrameLayout(ctx)
            box.addView(scroll, FrameLayout.LayoutParams(Ui.MATCH, Ui.WRAP, Gravity.BOTTOM))
            column.addView(box, LinearLayout.LayoutParams(Ui.MATCH, h))
        } else {
            // the 3D car is framed on the left, so the panel always sits on the right
            val body = Ui.hbox(ctx, Gravity.TOP)
            body.layoutDirection = View.LAYOUT_DIRECTION_LTR
            scroll.layoutDirection = Lang.layoutDirection
            panel.layoutDirection = Lang.layoutDirection
            val left = Ui.vbox(ctx, Gravity.CENTER_HORIZONTAL)
            nameRow.layoutDirection = Lang.layoutDirection
            left.addView(nameRow, Ui.lp())
            left.addView(View(ctx), LinearLayout.LayoutParams(Ui.MATCH, 0, 1f))
            left.addView(shop, Ui.lp())
            body.addView(left, LinearLayout.LayoutParams(0, Ui.MATCH, 1f))
            val lp = LinearLayout.LayoutParams(minOf(Ui.dp(360f), (ctx.resources.displayMetrics.widthPixels * 0.46f).toInt()), Ui.MATCH)
            lp.setMargins(0, 0, Ui.dp(10f), Ui.dp(10f))
            body.addView(scroll, lp)
            column.addView(body, LinearLayout.LayoutParams(Ui.MATCH, 0, 1f))
        }
        root.addView(column, FrameLayout.LayoutParams(Ui.MATCH, Ui.MATCH))
        refresh(false)
        root.post { scrollStripTo(car) }
        return root
    }

    // ---------------------------------------------------------------- v2.1 shop
    /** car state in the shop */
    private fun stateOf(id: Int): Int {
        val spec = GameData.cars[id]
        return when {
            save.isCarOwned(id) -> if (id == save.selectedCar) ST_SELECTED else ST_OWNED
            save.level() < GameData.carLevelReq(spec) -> ST_LOCKED
            save.coins < spec.price -> ST_SHORT
            else -> ST_AVAILABLE
        }
    }

    private fun stateColor(st: Int) = when (st) {
        ST_SELECTED -> Ui.CYAN
        ST_OWNED -> Ui.GREEN
        ST_AVAILABLE -> Ui.YELLOW
        ST_SHORT -> 0xFFFF8A3D.toInt()
        else -> 0xFF6B7385.toInt()
    }

    private fun buildStrip() {
        strip.removeAllViews()
        for (id in order) {
            val spec = GameData.cars[id]
            val st = stateOf(id)
            val acc = stateColor(st)
            val sel = id == car
            val card = Ui.vbox(ctx, Gravity.CENTER)
            card.background = Ui.bg(if (sel) Ui.withAlpha(acc, 0x40) else 0xCC0B1020.toInt(), Ui.withAlpha(acc, if (sel) 0xFF else 0x88), 12f, if (sel) 2.2f else 1.2f)
            card.setPadding(Ui.dp(8f), Ui.dp(5f), Ui.dp(8f), Ui.dp(5f))
            val name = Ui.text(ctx, str(spec.nameRes), 11.5f, if (st == ST_LOCKED) Ui.DIM else Ui.TEXT, Ui.bold)
            name.maxLines = 1
            name.gravity = Gravity.CENTER
            card.addView(name, Ui.lp(Ui.WRAP))
            val pi = GameData.performanceIndex(spec)
            val sub = Ui.text(ctx, Lang.digits(GameData.piClass(pi) + " " + pi) + (if (spec.catRes != 0) " · " + str(spec.catRes) else ""), 9.5f, Ui.DIM)
            sub.maxLines = 1
            card.addView(sub, Ui.lp(Ui.WRAP))
            val badge = Ui.text(ctx, badgeText(id, st), 11f, acc, Ui.bold)
            badge.maxLines = 1
            card.addView(badge, Ui.lp(Ui.WRAP))
            card.isClickable = true
            Ui.pressable(card)
            card.setOnClickListener {
                if (id == car) return@setOnClickListener
                host.sfx(AudioEngine.SFX_CLICK)
                val dir = if (order.indexOf(id) > order.indexOf(car)) 1 else -1
                select(id, dir)
            }
            card.contentDescription = str(spec.nameRes) + ", " + badgeText(id, st)
            val lp = LinearLayout.LayoutParams(Ui.dp(118f), Ui.WRAP)
            lp.marginEnd = Ui.dp(6f)
            strip.addView(card, lp)
        }
    }

    private fun badgeText(id: Int, st: Int): String {
        val spec = GameData.cars[id]
        return when (st) {
            ST_SELECTED -> "✓ " + str(R.string.selected)
            ST_OWNED -> "✓ " + str(R.string.shop_owned)
            ST_LOCKED -> "🔒 " + str(R.string.shop_level, Lang.num(GameData.carLevelReq(spec)))
            else -> "● " + Lang.num(spec.price)
        }
    }

    private fun scrollStripTo(id: Int) {
        val i = order.indexOf(id)
        if (i < 0 || i >= strip.childCount) return
        val c = strip.getChildAt(i)
        stripScroll.post { stripScroll.smoothScrollTo((c.left - (stripScroll.width - c.width) / 2).coerceAtLeast(0), 0) }
    }

    private fun select(id: Int, d: Int) {
        car = id
        previewPaint = save.paintIndex(car)
        refresh(true)
        buildStrip()
        scrollStripTo(car)
        nameView.translationX = Ui.dp(if (d > 0) 40f else -40f).toFloat() * (if (Lang.isFa) -1 else 1)
        nameView.alpha = 0f
        nameView.animate().translationX(0f).alpha(1f).setDuration(260).start()
    }

    private fun step(d: Int) {
        val n = order.size
        val i = order.indexOf(car).coerceAtLeast(0)
        select(order[(i + d + n) % n], d)
    }

    private fun refresh(animate: Boolean) {
        val spec = GameData.cars[car]
        val owned = save.isCarOwned(car)
        host.showroom(car, GameData.PAINT_PALETTE[previewPaint], if (owned) save.customs(car) else null)
        nameView.text = str(spec.nameRes)
        val st = stateOf(car)
        priceView.text = when (st) {
            ST_SELECTED -> "✓ " + str(R.string.selected)
            ST_OWNED -> "✓ " + str(R.string.shop_owned)
            ST_LOCKED -> "🔒 " + Lang.num(spec.price) + " " + str(R.string.coins) + "  ·  " + str(R.string.shop_level, Lang.num(GameData.carLevelReq(spec)))
            ST_SHORT -> "● " + Lang.num(spec.price) + " " + str(R.string.coins) + "  ·  " + str(R.string.shop_short, Lang.num(spec.price - save.coins))
            else -> "● " + Lang.num(spec.price) + " " + str(R.string.coins)
        }
        priceView.setTextColor(stateColor(st))

        panel.removeAllViews()
        // ---- stats
        val statNames = intArrayOf(R.string.stat_speed, R.string.stat_accel, R.string.stat_handling, R.string.stat_brakes, R.string.stat_nitro)
        val statUpg = intArrayOf(GameData.UPG_SPEED, -1, GameData.UPG_HANDLING, GameData.UPG_BRAKES, GameData.UPG_NITRO)
        val statColors = intArrayOf(Ui.CYAN, Ui.YELLOW, Ui.PINK, Ui.RED, 0xFFB57BFF.toInt())
        for (i in 0..4) {
            val row = Ui.hbox(ctx)
            row.setPadding(0, Ui.dp(3f), 0, Ui.dp(3f))
            val label = Ui.text(ctx, str(statNames[i]), 13f, Ui.TEXT, Ui.bold)
            row.addView(label, LinearLayout.LayoutParams(Ui.dp(92f), Ui.WRAP))
            val lvl = if (statUpg[i] >= 0) save.upgradeLevel(car, statUpg[i]) else 0
            val base = GameData.statBar(spec, i, 0)
            val withUpg = GameData.statBar(spec, i, lvl)
            row.addView(Ui.statBar(ctx, base, statColors[i], withUpg - base), LinearLayout.LayoutParams(0, Ui.dp(9f), 1f))
            panel.addView(row, Ui.lp())
        }
        val speedLine = Ui.text(ctx, str(R.string.top_speed) + ": " +
            Lang.num(GameData.topSpeedKmh(spec, save.upgradeLevel(car, GameData.UPG_SPEED)).toInt()) + " " + str(R.string.kmh), 12f, Ui.DIM)
        panel.addView(speedLine, Ui.lp(topDp = 4f))
        // class, kerb weight and tyre grip (they change how the car handles, not only the bars above)
        val info = StringBuilder()
        if (spec.catRes != 0) info.append(str(spec.catRes)).append("  •  ")
        info.append(str(R.string.stat_weight)).append(": ").append(Lang.num(spec.massKg)).append(' ').append(str(R.string.kg))
        info.append("  •  ").append(str(R.string.stat_grip)).append(": ").append(Lang.num((spec.grip * 100f).toInt())).append('%')
        if (spec.allTerrain) info.append("  •  4×4")
        panel.addView(Ui.text(ctx, info.toString(), 12f, Ui.CYAN, Ui.bold), Ui.lp(topDp = 2f))
        // v2.1: full spec sheet (also before purchase) and a comparison with the car you drive now
        val lvS = save.upgradeLevel(car, GameData.UPG_SPEED)
        val lvH = save.upgradeLevel(car, GameData.UPG_HANDLING)
        val lvB = save.upgradeLevel(car, GameData.UPG_BRAKES)
        val pi = GameData.performanceIndex(spec, lvS, lvH, lvB)
        val z100 = GameData.zeroTo100(spec, lvS)
        val sheet = StringBuilder()
        sheet.append(str(R.string.shop_pi)).append(": ").append(GameData.piClass(pi)).append(' ').append(pi)
        sheet.append("   ").append(str(R.string.shop_0100)).append(": ").append(String.format(java.util.Locale.US, "%.1f", z100)).append(' ').append(str(R.string.unit_s))
        sheet.append("\n").append(str(R.string.shop_drift)).append(": ").append(stars(spec.drift / 1.75f))
        sheet.append("   ").append(str(R.string.shop_drive)).append(": ").append(if (spec.allTerrain) "4×4" else str(R.string.shop_rwd))
        if (car == GameData.CAR_TAXI) sheet.append("\n").append(str(R.string.shop_taxi_bonus))
        panel.addView(Ui.text(ctx, Lang.digits(sheet.toString()), 12f, Ui.TEXT), Ui.lp(topDp = 4f))
        val cur = save.selectedCar
        if (cur != car) {
            val cs = GameData.cars[cur]
            val dPi = pi - GameData.performanceIndex(cs, save.upgradeLevel(cur, GameData.UPG_SPEED), save.upgradeLevel(cur, GameData.UPG_HANDLING), save.upgradeLevel(cur, GameData.UPG_BRAKES))
            val dZ = z100 - GameData.zeroTo100(cs, save.upgradeLevel(cur, GameData.UPG_SPEED))
            val cmp = str(R.string.shop_vs, str(cs.nameRes)) + ": PI " + (if (dPi >= 0) "+" else "") + dPi +
                "  ·  0-100 " + (if (dZ <= 0) "" else "+") + String.format(java.util.Locale.US, "%.1f", dZ) + str(R.string.unit_s)
            panel.addView(Ui.text(ctx, Lang.digits(cmp), 11.5f, if (dPi >= 0) Ui.GREEN else 0xFFFF8A3D.toInt(), Ui.bold), Ui.lp(topDp = 2f))
        }

        // ---- paint
        panel.addView(sectionTitle(str(R.string.paint)), Ui.lp())
        val pal = GameData.PAINT_PALETTE
        val perRow = 5
        var row: LinearLayout? = null
        for (i in pal.indices) {
            if (i % perRow == 0) {
                row = Ui.hbox(ctx, Gravity.CENTER)
                panel.addView(row, Ui.lp(topDp = 4f))
            }
            val sw = View(ctx)
            val sel = i == previewPaint
            sw.background = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setColor(pal[i])
                setStroke(Ui.dp(if (sel) 3f else 1f), if (sel) Ui.TEXT else Ui.withAlpha(Ui.TEXT, 0x44))
            }
            if (sel) { sw.scaleX = 1.12f; sw.scaleY = 1.12f }
            sw.isClickable = true
            sw.setOnClickListener {
                host.sfx(AudioEngine.SFX_CLICK)
                previewPaint = i
                if (save.isCarOwned(car)) save.setPaintIndex(car, i)
                refresh(false)
            }
            val lp = LinearLayout.LayoutParams(Ui.dp(34f), Ui.dp(34f))
            lp.marginStart = Ui.dp(6f); lp.marginEnd = Ui.dp(6f)
            row!!.addView(sw, lp)
        }

        // ---- actions
        if (owned) {
            if (car == save.selectedCar) {
                val t = Ui.text(ctx, str(R.string.selected), 16f, Ui.GREEN, Ui.bold)
                t.gravity = Gravity.CENTER
                t.background = Ui.bg(Ui.withAlpha(Ui.GREEN, 0x1A), Ui.withAlpha(Ui.GREEN, 0x88), 16f, 1.4f)
                t.setPadding(0, Ui.dp(11f), 0, Ui.dp(11f))
                panel.addView(t, Ui.lp(topDp = 14f))
            } else {
                panel.addView(Ui.button(ctx, str(R.string.select), Ui.GREEN, true, 18f) {
                    save.selectedCar = car
                    host.sfx(AudioEngine.SFX_BUY)
                    refresh(false)
                    buildStrip()
                }, Ui.lp(topDp = 14f))
            }
            panel.addView(Ui.button(ctx, str(R.string.cus_open), Ui.PINK, true, 16f) {
                host.push(CustomizeScreen(host, car))
            }, Ui.lp(topDp = 8f))
            panel.addView(Ui.button(ctx, str(R.string.upgrade_shop), Ui.YELLOW, false, 16f) {
                host.push(UpgradeScreen(host, car))
            }, Ui.lp(topDp = 8f))
        } else if (st == ST_LOCKED) {
            val t = Ui.text(ctx, "🔒 " + str(R.string.shop_locked_info, Lang.num(GameData.carLevelReq(spec)), Lang.num(save.level())), 13f, Ui.DIM, Ui.bold)
            t.gravity = Gravity.CENTER
            t.background = Ui.bg(0x22FFFFFF, 0x44FFFFFF, 16f, 1.2f)
            t.setPadding(Ui.dp(8f), Ui.dp(11f), Ui.dp(8f), Ui.dp(11f))
            panel.addView(t, Ui.lp(topDp = 14f))
        } else {
            val buyCar = car
            panel.addView(Ui.button(ctx, str(R.string.buy_for, Lang.num(spec.price)), if (st == ST_SHORT) 0xFFFF8A3D.toInt() else Ui.YELLOW, st == ST_AVAILABLE, 18f) {
                if (save.isCarOwned(buyCar)) { refresh(false); buildStrip(); return@button }
                if (save.coins < spec.price) {
                    host.toast(str(R.string.not_enough_coins) + " (" + str(R.string.shop_short, Lang.num(spec.price - save.coins)) + ")", Ui.RED)
                    return@button
                }
                host.confirm(str(R.string.buy_for, Lang.num(spec.price)) + " — " + str(spec.nameRes)) {
                    // atomic: never charges twice (double tap, second dialog, story unlock in between)
                    when (save.buyCar(buyCar)) {
                        com.amin.racing3d.core.SaveManager.BUY_OK -> {
                            save.setPaintIndex(buyCar, previewPaint)
                            host.sfx(AudioEngine.SFX_BUY)
                            host.toast(str(R.string.purchased), Ui.GREEN)
                            announceUnlocks()
                        }
                        com.amin.racing3d.core.SaveManager.BUY_OWNED -> host.toast(str(R.string.shop_already_owned), Ui.CYAN)
                        else -> host.toast(str(R.string.not_enough_coins), Ui.RED)
                    }
                    refreshCoins()
                    refresh(false)
                    buildStrip()
                }
            }, Ui.lp(topDp = 14f))
        }
        panel.addView(Ui.text(ctx, str(R.string.inspect_hint), 11f, Ui.DIM), Ui.lp(topDp = 10f))
        if (animate) staggerIn(panel, 0L, 14f)
    }

    override fun onBack() {
        Inspect.reset()
        host.leaveShowroom()
        host.back()
    }

    private fun stars(v: Float): String {
        val n = (v.coerceIn(0f, 1f) * 5f + 0.5f).toInt().coerceIn(1, 5)
        return "★".repeat(n) + "☆".repeat(5 - n)
    }

    companion object {
        const val ST_SELECTED = 0
        const val ST_OWNED = 1
        const val ST_AVAILABLE = 2
        const val ST_SHORT = 3
        const val ST_LOCKED = 4
        private val CAT_RANK = intArrayOf(2, 2, 3, 4, 1, 1, 3, 3, 4, 4, 1, 4, 1, 2)

        /** 0 cheapest, 1 most expensive, 2 highest performance, 3 category (then price) */
        fun sortedCars(mode: Int): List<Int> {
            val ids = GameData.cars.indices.toList()
            return when (mode) {
                1 -> ids.sortedByDescending { GameData.cars[it].price }
                2 -> ids.sortedWith(compareByDescending<Int> { GameData.performanceIndex(GameData.cars[it]) }.thenBy { GameData.cars[it].price })
                3 -> ids.sortedWith(compareBy<Int> { CAT_RANK.getOrElse(it) { 9 } }.thenBy { GameData.cars[it].price })
                else -> ids.sortedBy { GameData.cars[it].price }
            }
        }
    }
}

// =====================================================================================
/** Garage camera state shared by the garage and the customization screen. */
internal object Inspect {
    var zoom = 1f
    var elev = 0.18f
    fun reset() { zoom = 1f; elev = 0.18f }
}

/**
 * Transparent touch surface over the 3D car: horizontal drag rotates, vertical drag changes the
 * camera height, two-finger pinch zooms in to inspect details, double tap resets the view.
 */
@SuppressLint("ClickableViewAccessibility")
internal fun inspectSurface(host: GameHost): View {
    val ctx = host.activity
    val v = View(ctx)
    var lastX = 0f
    var lastY = 0f
    var lastTap = 0L
    val scale = android.view.ScaleGestureDetector(ctx, object : android.view.ScaleGestureDetector.SimpleOnScaleGestureListener() {
        override fun onScale(d: android.view.ScaleGestureDetector): Boolean {
            Inspect.zoom = (Inspect.zoom / d.scaleFactor).coerceIn(0.42f, 1.45f)
            host.showroomCamera(Inspect.zoom, Inspect.elev)
            return true
        }
    })
    host.showroomCamera(Inspect.zoom, Inspect.elev)
    v.setOnTouchListener { _, ev ->
        scale.onTouchEvent(ev)
        when (ev.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                lastX = ev.x; lastY = ev.y
                host.rotateShowroom(0f, true)
                val now = android.os.SystemClock.uptimeMillis()
                if (now - lastTap < 300) { Inspect.reset(); host.showroomCamera(Inspect.zoom, Inspect.elev) }
                lastTap = now
            }
            MotionEvent.ACTION_POINTER_DOWN -> { lastX = ev.getX(0); lastY = ev.getY(0) }
            MotionEvent.ACTION_MOVE -> {
                if (ev.pointerCount == 1 && !scale.isInProgress) {
                    val dx = ev.x - lastX
                    val dy = ev.y - lastY
                    host.rotateShowroom(dx * 0.012f, true)
                    Inspect.elev = (Inspect.elev + dy * 0.004f).coerceIn(0.02f, 1.15f)
                    host.showroomCamera(Inspect.zoom, Inspect.elev)
                }
                lastX = ev.getX(0); lastY = ev.getY(0)
            }
            MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> host.rotateShowroom(0f, false)
        }
        true
    }
    return v
}

// =====================================================================================
/**
 * Garage 2.0 customization: paint finish, rims, rim colour, calipers, spoiler, window tint,
 * underglow neon, nitro flame colour and interior. Every option is previewed live on the 3D car;
 * options are bought once per car and can be switched freely afterwards.
 */
class CustomizeScreen(host: GameHost, private val car: Int) : Screen(host) {
    override val dim = 0f
    private var cat = 0
    private val preview = save.customs(car)
    private lateinit var catRow: LinearLayout
    private lateinit var options: LinearLayout
    private lateinit var action: LinearLayout

    override fun build(): View {
        val root = FrameLayout(ctx)
        root.addView(inspectSurface(host), FrameLayout.LayoutParams(Ui.MATCH, Ui.MATCH))
        val column = LinearLayout(ctx)
        column.orientation = LinearLayout.VERTICAL
        column.addView(header(str(R.string.cus_title) + " — " + str(GameData.cars[car].nameRes)), LinearLayout.LayoutParams(Ui.MATCH, Ui.WRAP))

        val panel = Ui.panel(ctx, true, Ui.withAlpha(Ui.PINK, 0x66))
        catRow = Ui.vbox(ctx)
        panel.addView(catRow, Ui.lp())
        options = Ui.vbox(ctx)
        panel.addView(options, Ui.lp(topDp = 8f))
        action = Ui.vbox(ctx)
        panel.addView(action, Ui.lp(topDp = 8f))
        val scroll = ScrollView(ctx)
        scroll.isVerticalScrollBarEnabled = false
        scroll.addView(panel, FrameLayout.LayoutParams(Ui.MATCH, Ui.WRAP))

        if (portrait) {
            column.addView(View(ctx), LinearLayout.LayoutParams(Ui.MATCH, 0, 1f))
            val lp = LinearLayout.LayoutParams(Ui.MATCH, (ctx.resources.displayMetrics.heightPixels * 0.5f).toInt())
            lp.setMargins(Ui.dp(10f), 0, Ui.dp(10f), Ui.dp(10f))
            column.addView(scroll, lp)
        } else {
            val body = Ui.hbox(ctx, Gravity.TOP)
            body.layoutDirection = View.LAYOUT_DIRECTION_LTR
            scroll.layoutDirection = Lang.layoutDirection
            panel.layoutDirection = Lang.layoutDirection
            body.addView(View(ctx), LinearLayout.LayoutParams(0, Ui.MATCH, 1f))
            val lp = LinearLayout.LayoutParams(minOf(Ui.dp(380f), (ctx.resources.displayMetrics.widthPixels * 0.48f).toInt()), Ui.MATCH)
            lp.setMargins(0, 0, Ui.dp(10f), Ui.dp(10f))
            body.addView(scroll, lp)
            column.addView(body, LinearLayout.LayoutParams(Ui.MATCH, 0, 1f))
        }
        root.addView(column, FrameLayout.LayoutParams(Ui.MATCH, Ui.MATCH))
        buildCategories()
        showPreview()
        fill()
        return root
    }

    private fun color() = save.paintColor(car)
    private fun showPreview() = host.showroom(car, color(), preview.copyOf())

    private fun buildCategories() {
        catRow.removeAllViews()
        var row: LinearLayout? = null
        for (c in 0 until GameData.NUM_CUS) {
            if (c % 3 == 0) { row = Ui.hbox(ctx, Gravity.CENTER); catRow.addView(row, Ui.lp(topDp = if (c == 0) 0f else 5f)) }
            val sel = c == cat
            val names = GameData.customCategories[c]
            val chip = Ui.text(ctx, if (Lang.isFa) names[0] else names[1], 12f, if (sel) Ui.BG else Ui.TEXT, Ui.bold)
            chip.gravity = Gravity.CENTER
            chip.setPadding(Ui.dp(6f), Ui.dp(7f), Ui.dp(6f), Ui.dp(7f))
            chip.background = if (sel) Ui.gradient(Ui.PINK, 0xFFB388FF.toInt(), 0, 12f, GradientDrawable.Orientation.LEFT_RIGHT)
                else Ui.bg(Ui.PANEL_LIGHT, Ui.withAlpha(Ui.PINK, 0x55), 12f, 1f)
            chip.isClickable = true
            chip.setOnClickListener {
                host.sfx(AudioEngine.SFX_CLICK)
                // leaving a category drops an unbought preview back to the owned selection
                if (!save.ownsCustom(car, cat, preview[cat])) preview[cat] = save.custom(car, cat)
                cat = c
                focusCamera()
                buildCategories(); showPreview(); fill()
            }
            row!!.addView(chip, LinearLayout.LayoutParams(0, Ui.WRAP, 1f).also { it.marginStart = Ui.dp(3f); it.marginEnd = Ui.dp(3f) })
        }
    }

    /** move the camera to the part being customised */
    private fun focusCamera() {
        when (cat) {
            GameData.CUS_RIM, GameData.CUS_RIM_COLOR, GameData.CUS_CALIPER -> { Inspect.zoom = 0.55f; Inspect.elev = 0.08f }
            GameData.CUS_INTERIOR, GameData.CUS_TINT -> { Inspect.zoom = 0.6f; Inspect.elev = 0.75f }
            GameData.CUS_NEON -> { Inspect.zoom = 0.9f; Inspect.elev = 0.05f }
            GameData.CUS_SPOILER -> { Inspect.zoom = 0.75f; Inspect.elev = 0.4f }
            else -> Inspect.reset()
        }
        host.showroomCamera(Inspect.zoom, Inspect.elev)
    }

    private fun fill() {
        options.removeAllViews()
        action.removeAllViews()
        val opts = GameData.customOptions[cat]
        if (cat == GameData.CUS_SPOILER && GameData.hasFactoryWing(car)) {
            options.addView(Ui.text(ctx, str(R.string.cus_factory_wing), 13f, Ui.YELLOW, Ui.bold), Ui.lp())
            return
        }
        val desc = when (cat) {
            GameData.CUS_FLAME -> str(R.string.cus_flame_hint)
            GameData.CUS_NEON -> str(R.string.cus_neon_hint)
            GameData.CUS_FINISH -> str(R.string.cus_finish_hint)
            else -> null
        }
        if (desc != null) options.addView(Ui.text(ctx, desc, 11.5f, Ui.DIM), Ui.lp(bottomDp = 4f))
        for ((i, o) in opts.withIndex()) {
            val owned = save.ownsCustom(car, cat, i)
            val sel = preview[cat] == i
            val equipped = save.custom(car, cat) == i
            val row = Ui.hbox(ctx)
            row.setPadding(Ui.dp(10f), Ui.dp(8f), Ui.dp(12f), Ui.dp(8f))
            row.background = Ui.bg(if (sel) Ui.withAlpha(Ui.PINK, 0x30) else Ui.PANEL_LIGHT, if (sel) Ui.PINK else 0, 12f, 1.5f)
            val hasColor = cat == GameData.CUS_RIM_COLOR || cat == GameData.CUS_CALIPER || cat == GameData.CUS_FLAME ||
                (cat == GameData.CUS_NEON && i > 0) || cat == GameData.CUS_INTERIOR
            if (hasColor) {
                val sw = View(ctx)
                sw.background = GradientDrawable().apply {
                    shape = GradientDrawable.OVAL
                    setColor(o.rgb or 0xFF000000.toInt())
                    setStroke(Ui.dp(1.5f), Ui.withAlpha(Ui.TEXT, 0x88))
                }
                row.addView(sw, LinearLayout.LayoutParams(Ui.dp(22f), Ui.dp(22f)).also { it.marginEnd = Ui.dp(10f) })
            }
            row.addView(Ui.text(ctx, if (Lang.isFa) o.fa else o.en, 14f, Ui.TEXT, Ui.bold), LinearLayout.LayoutParams(0, Ui.WRAP, 1f))
            val state = when {
                equipped -> "✓ " + str(R.string.cus_equipped)
                owned -> str(R.string.cus_owned)
                else -> "● " + Lang.num(o.price)
            }
            row.addView(Ui.text(ctx, state, 12.5f, if (equipped) Ui.GREEN else if (owned) Ui.CYAN else Ui.YELLOW, Ui.bold))
            row.isClickable = true
            row.setOnClickListener {
                host.sfx(AudioEngine.SFX_CLICK)
                preview[cat] = i
                if (owned) save.setCustom(car, cat, i)
                showPreview(); fill()
            }
            Ui.pressable(row)
            options.addView(row, Ui.lp(topDp = 5f))
        }
        // buy button for a previewed option that is not owned yet
        val p = preview[cat]
        if (!save.ownsCustom(car, cat, p)) {
            val o = opts[p]
            action.addView(Ui.button(ctx, str(R.string.cus_buy, if (Lang.isFa) o.fa else o.en, Lang.num(o.price)), Ui.YELLOW, true, 16f) {
                if (save.coins < o.price) { host.toast(str(R.string.not_enough_coins), Ui.RED); return@button }
                val c = cat
                host.confirm(str(R.string.cus_buy, if (Lang.isFa) o.fa else o.en, Lang.num(o.price)) + "?") {
                    if (save.spend(o.price)) {
                        save.setOwnsCustom(car, c, p)
                        save.setCustom(car, c, p)
                        host.sfx(AudioEngine.SFX_BUY)
                        host.toast(str(R.string.purchased), Ui.GREEN)
                        announceUnlocks()
                        refreshCoins()
                        if (c == cat) fill()
                    } else host.toast(str(R.string.not_enough_coins), Ui.RED)
                }
            }, Ui.lp())
        }
    }

    override fun onBack() {
        Inspect.reset()
        host.showroomCamera(Inspect.zoom, Inspect.elev)
        host.back()
    }
}

// =====================================================================================
class UpgradeScreen(host: GameHost, private val car: Int) : Screen(host) {
    override val dim = 0.35f
    private lateinit var list: LinearLayout

    override fun build(): View = page(str(R.string.upgrade_shop), 560f) { col ->
        val spec = GameData.cars[car]
        val t = Ui.glowTitle(ctx, str(spec.nameRes), 22f, Ui.PINK)
        col.addView(t, Ui.lp(Ui.WRAP, bottomDp = 6f))
        list = Ui.vbox(ctx)
        col.addView(list, Ui.lp())
        fill()
        staggerIn(list, 0L, 20f)
    }

    private fun fill() {
        list.removeAllViews()
        val spec = GameData.cars[car]
        val colors = intArrayOf(Ui.CYAN, Ui.PINK, Ui.RED, 0xFFB57BFF.toInt())
        for (u in 0..3) {
            val lvl = save.upgradeLevel(car, u)
            val card = Ui.vbox(ctx, Gravity.START)
            card.background = Ui.bg(Ui.PANEL, Ui.withAlpha(colors[u], 0x66), 16f, 1.2f)
            card.setPadding(Ui.dp(14f), Ui.dp(12f), Ui.dp(14f), Ui.dp(12f))
            val top = Ui.hbox(ctx)
            val nameCol = Ui.vbox(ctx, Gravity.START)
            nameCol.addView(Ui.text(ctx, str(GameData.upgradeNames[u]), 17f, colors[u], Ui.black))
            nameCol.addView(Ui.text(ctx, str(GameData.upgradeDescs[u]), 12f, Ui.DIM))
            top.addView(nameCol, LinearLayout.LayoutParams(0, Ui.WRAP, 1f))
            top.addView(Ui.text(ctx, str(R.string.level_fmt, Lang.num(lvl), Lang.num(GameData.MAX_UPGRADE)), 12f, Ui.TEXT, Ui.bold))
            card.addView(top, Ui.lp())

            val pips = Ui.hbox(ctx)
            for (k in 0 until GameData.MAX_UPGRADE) {
                val pip = View(ctx)
                pip.background = Ui.bg(if (k < lvl) colors[u] else Ui.withAlpha(Ui.TEXT, 0x22), 0, 4f)
                val lp = LinearLayout.LayoutParams(0, Ui.dp(8f), 1f)
                lp.marginEnd = Ui.dp(4f)
                pips.addView(pip, lp)
            }
            card.addView(pips, Ui.lp(topDp = 8f))

            if (lvl >= GameData.MAX_UPGRADE) {
                val m = Ui.text(ctx, str(R.string.maxed), 14f, Ui.GREEN, Ui.bold)
                m.gravity = Gravity.CENTER
                m.setPadding(0, Ui.dp(8f), 0, 0)
                card.addView(m, Ui.lp())
            } else {
                val cost = GameData.upgradeCost(spec, lvl)
                card.addView(Ui.button(ctx, str(R.string.upgrade_btn, Lang.num(cost)), colors[u], save.coins >= cost, 15f) {
                    if (save.spend(cost)) {
                        save.setUpgradeLevel(car, u, lvl + 1)
                        host.sfx(AudioEngine.SFX_BUY)
                        host.toast(str(GameData.upgradeNames[u]) + " ↑ " + Lang.num(lvl + 1), colors[u])
                        announceUnlocks()
                        refreshCoins()
                        fill()
                    } else host.toast(str(R.string.not_enough_coins), Ui.RED)
                }, Ui.lp(topDp = 10f))
            }
            list.addView(card, Ui.lp(topDp = 8f))
        }
    }
}

// =====================================================================================
class SettingsScreen(host: GameHost) : Screen(host) {

    override fun build(): View = page(str(R.string.settings_title), 600f) { col ->
        // ---- language
        col.addView(sectionTitle(str(R.string.set_language)), Ui.lp())
        col.addView(Ui.segmented(ctx, listOf(str(R.string.lang_fa), str(R.string.lang_en)), if (Lang.isFa) 0 else 1) {
            val lang = if (it == 0) Lang.FA else Lang.EN
            if (lang != save.language) host.changeLanguage(lang)
        }, Ui.lp())

        // ---- controls (v2.1: own screen with per-axis sensitivity, curves, wheel and layout editor)
        col.addView(sectionTitle(str(R.string.set_controls)), Ui.lp())
        val modeName = when (save.controlMode) {
            com.amin.racing3d.core.SaveManager.CONTROL_TILT -> str(R.string.ctl_tilt)
            com.amin.racing3d.core.SaveManager.CONTROL_WHEEL -> str(R.string.ctl_wheel)
            else -> str(R.string.ctl_touch)
        }
        col.addView(Ui.text(ctx, str(R.string.ctl_current, modeName), 12.5f, Ui.DIM), Ui.lp())
        col.addView(Ui.button(ctx, str(R.string.ctl_open), Ui.CYAN, true, 16f) { host.push(ControlsScreen(host)) }, Ui.lp(topDp = 6f))

        // ---- graphics
        col.addView(sectionTitle(str(R.string.set_graphics)), Ui.lp())
        col.addView(Ui.segmented(ctx, listOf(str(R.string.gfx_low), str(R.string.gfx_med), str(R.string.gfx_high), str(R.string.gfx_ultra)), save.graphics, Ui.PINK) {
            if (it == 3 && !host.ultraSupported) {
                // never force Ultra on devices that cannot render it
                save.graphics = 2
                host.toast(str(R.string.gfx_ultra_unsupported), Ui.YELLOW)
            } else save.graphics = it
            host.applySettings()
        }, Ui.lp())
        col.addView(toggleRow(R.string.set_auto_quality, save.autoQuality) { save.autoQuality = it }, Ui.lp(topDp = 6f))
        col.addView(toggleRow(R.string.set_shake, save.cameraShake) { save.cameraShake = it }, Ui.lp())
        col.addView(Ui.text(ctx, str(R.string.set_render_scale), 13f, Ui.TEXT, Ui.bold), Ui.lp(topDp = 10f))
        col.addView(Ui.segmented(ctx, listOf(str(R.string.rs_auto), "100%", "85%", "70%", "55%").map { Lang.digits(it) }, save.renderScale) {
            save.renderScale = it
            host.applySettings()
        }, Ui.lp(topDp = 4f))
        col.addView(Ui.text(ctx, str(R.string.set_render_scale_info), 11.5f, Ui.DIM), Ui.lp(topDp = 4f))
        col.addView(toggleRow(R.string.set_fps, save.showFps) { save.showFps = it }, Ui.lp(topDp = 6f))

        // ---- audio
        col.addView(sectionTitle(str(R.string.audio_title)), Ui.lp())
        col.addView(toggleRow(R.string.set_sound, save.sfxOn) { save.sfxOn = it }, Ui.lp())
        col.addView(toggleRow(R.string.set_music, save.musicOn) { save.musicOn = it }, Ui.lp())
        col.addView(toggleRow(R.string.set_mute, save.muted) { save.muted = it }, Ui.lp())
        col.addView(toggleRow(R.string.set_vibrate, save.vibration) { save.vibration = it }, Ui.lp())

        // ---- updates (GitHub releases, only when online)
        col.addView(sectionTitle(str(R.string.upd_title)), Ui.lp())
        col.addView(toggleRow(R.string.upd_auto, save.autoUpdateCheck) { save.autoUpdateCheck = it }, Ui.lp())
        col.addView(Ui.text(ctx, str(R.string.upd_installed, Lang.digits(com.amin.racing3d.core.UpdateChecker.installedVersion(ctx))), 12f, Ui.DIM), Ui.lp(topDp = 4f))
        col.addView(Ui.button(ctx, str(R.string.upd_check_now), Ui.CYAN, false, 15f) { host.checkUpdatesNow() }, Ui.lp(topDp = 6f))

        // ---- reset
        col.addView(Ui.button(ctx, str(R.string.reset_progress), Ui.RED, false, 14f) {
            host.confirm(str(R.string.reset_confirm)) {
                save.resetProgress()
                host.applySettings()
                refreshCoins()
                host.toast(str(R.string.reset_done), Ui.YELLOW)
            }
        }, Ui.lp(topDp = 22f))
        val ver = Ui.text(ctx, str(R.string.version) + "\n" + str(R.string.credits), 11f, Ui.DIM)
        ver.gravity = Gravity.CENTER
        col.addView(ver, Ui.lp(topDp = 14f))
    }

    private fun toggleRow(label: Int, value: Boolean, onChange: (Boolean) -> Unit): View {
        val row = Ui.hbox(ctx)
        row.background = Ui.bg(Ui.PANEL_LIGHT, 0, 12f)
        row.setPadding(Ui.dp(14f), Ui.dp(8f), Ui.dp(10f), Ui.dp(8f))
        row.addView(Ui.text(ctx, str(label), 14f, Ui.TEXT), LinearLayout.LayoutParams(0, Ui.WRAP, 1f))
        row.addView(Ui.toggle(ctx, value) {
            onChange(it)
            host.applySettings()
        })
        val wrap = FrameLayout(ctx)
        wrap.setPadding(0, Ui.dp(3f), 0, Ui.dp(3f))
        wrap.addView(row, FrameLayout.LayoutParams(Ui.MATCH, Ui.WRAP))
        return wrap
    }
}
