package com.amin.racing3d.ui

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.graphics.Shader
import android.graphics.drawable.GradientDrawable
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.animation.DecelerateInterpolator
import android.view.animation.OvershootInterpolator
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import com.amin.racing3d.R
import com.amin.racing3d.audio.AudioEngine
import com.amin.racing3d.core.Lang
import com.amin.racing3d.core.SaveManager
import com.amin.racing3d.game.GameData
import com.amin.racing3d.game.World
import java.io.File
import java.util.Calendar
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sin

/**
 * v2.0 in-game phone: slides up over the paused game. Home screen with eight apps — GPS map,
 * taxi jobs, garage, messages, camera (photo mode + gallery), radio, run stats and quick settings.
 */
class PhoneScreen(host: GameHost, private val startApp: Int = APP_HOME) : Screen(host) {
    override val dim = 0.35f

    private val world get() = host.gameWorld
    private lateinit var content: FrameLayout
    private lateinit var phone: FrameLayout
    private var app = APP_HOME

    private fun t(fa: String, en: String) = if (Lang.isFa) fa else en

    override fun build(): View {
        val root = FrameLayout(ctx)
        // tap outside the phone closes it
        root.setOnClickListener { close() }
        val m = ctx.resources.displayMetrics
        val sw = m.widthPixels / m.density
        val sh = m.heightPixels / m.density
        val ph = min(sh - 20f, 720f)
        val pw = min(min(max(ph * 0.52f, 300f), 390f), sw - 24f)

        phone = FrameLayout(ctx)
        phone.isClickable = true
        phone.background = Ui.bg(0xFF05070D.toInt(), 0xFF3A4260.toInt(), 34f, 3f)
        phone.setPadding(Ui.dp(7f), Ui.dp(7f), Ui.dp(7f), Ui.dp(7f))
        phone.elevation = Ui.dp(24f).toFloat()
        val screen = FrameLayout(ctx)
        screen.background = Ui.bg(0xFF0A0E1A.toInt(), 0, 28f)
        screen.clipToOutline = true
        phone.addView(screen, FrameLayout.LayoutParams(Ui.MATCH, Ui.MATCH))

        val col = LinearLayout(ctx)
        col.orientation = LinearLayout.VERTICAL
        col.addView(statusBar(), LinearLayout.LayoutParams(Ui.MATCH, Ui.dp(30f)))
        content = FrameLayout(ctx)
        col.addView(content, LinearLayout.LayoutParams(Ui.MATCH, 0, 1f))
        // home indicator
        val homeBar = FrameLayout(ctx)
        val pill = View(ctx)
        pill.background = Ui.bg(0xCCF2F6FF.toInt(), 0, 3f)
        homeBar.addView(pill, FrameLayout.LayoutParams(Ui.dp(110f), Ui.dp(5f), Gravity.CENTER))
        homeBar.setOnClickListener { if (app != APP_HOME) open(APP_HOME) else close() }
        col.addView(homeBar, LinearLayout.LayoutParams(Ui.MATCH, Ui.dp(22f)))
        screen.addView(col, FrameLayout.LayoutParams(Ui.MATCH, Ui.MATCH))
        // camera notch
        val notch = View(ctx)
        notch.background = Ui.bg(0xFF000000.toInt(), 0, 8f)
        screen.addView(notch, FrameLayout.LayoutParams(Ui.dp(70f), Ui.dp(18f), Gravity.TOP or Gravity.CENTER_HORIZONTAL).also { it.topMargin = Ui.dp(5f) })

        root.addView(phone, FrameLayout.LayoutParams(Ui.dp(pw), Ui.dp(ph), Gravity.CENTER))
        phone.translationY = Ui.dp(ph).toFloat()
        phone.rotation = if (Lang.isFa) 4f else -4f
        phone.animate().translationY(0f).rotation(0f).setDuration(420).setInterpolator(OvershootInterpolator(0.9f)).start()
        host.sfx(AudioEngine.SFX_PHONE)
        open(startApp)
        return root
    }

    private fun close() {
        phone.animate().translationY(phone.height.toFloat() * 1.1f).setDuration(220).withEndAction { host.resumeRace() }.start()
    }

    override fun onBack() {
        if (app != APP_HOME) open(APP_HOME) else close()
    }

    // ================================================================= chrome
    private fun statusBar(): View {
        val row = Ui.hbox(ctx)
        row.setPadding(Ui.dp(22f), Ui.dp(6f), Ui.dp(22f), 0)
        val c = Calendar.getInstance()
        val time = Lang.num(c.get(Calendar.HOUR_OF_DAY)) + ":" + (if (c.get(Calendar.MINUTE) < 10) Lang.num(0) else "") + Lang.num(c.get(Calendar.MINUTE))
        row.addView(Ui.text(ctx, time, 12f, Ui.TEXT, Ui.bold), LinearLayout.LayoutParams(0, Ui.WRAP, 1f))
        row.addView(Ui.text(ctx, "▂▄▆█  5G  ", 10f, Ui.TEXT, Ui.bold))
        val batt = Ui.text(ctx, Lang.num(87) + "%", 10f, Ui.GREEN, Ui.bold)
        row.addView(batt)
        return row
    }

    private fun open(a: Int) {
        app = a
        content.removeAllViews()
        val v = when (a) {
            APP_MAP -> mapApp()
            APP_TAXI -> taxiApp()
            APP_GARAGE -> garageApp()
            APP_MESSAGES -> messagesApp()
            APP_CAMERA -> cameraApp()
            APP_MUSIC -> musicApp()
            APP_STATS -> statsApp()
            APP_SETTINGS -> settingsApp()
            else -> home()
        }
        content.addView(v, FrameLayout.LayoutParams(Ui.MATCH, Ui.MATCH))
        v.alpha = 0f
        v.scaleX = if (a == APP_HOME) 1.06f else 0.9f
        v.scaleY = v.scaleX
        v.animate().alpha(1f).scaleX(1f).scaleY(1f).setDuration(260).setInterpolator(DecelerateInterpolator(2f)).start()
    }

    /** app page: coloured title bar with a back arrow, then a scrolling body */
    private fun appPage(title: String, accent: Int, body: (LinearLayout) -> Unit, scroll: Boolean = true): View {
        val col = LinearLayout(ctx)
        col.orientation = LinearLayout.VERTICAL
        val bar = Ui.hbox(ctx)
        bar.setPadding(Ui.dp(10f), Ui.dp(6f), Ui.dp(14f), Ui.dp(8f))
        val back = Ui.text(ctx, if (Lang.isFa) "›" else "‹", 30f, accent, Ui.black)
        back.setPadding(Ui.dp(8f), 0, Ui.dp(10f), 0)
        back.setOnClickListener { host.sfx(AudioEngine.SFX_CLICK); open(APP_HOME) }
        bar.addView(back)
        bar.addView(Ui.text(ctx, title, 19f, Ui.TEXT, Ui.black), LinearLayout.LayoutParams(0, Ui.WRAP, 1f))
        col.addView(bar, LinearLayout.LayoutParams(Ui.MATCH, Ui.WRAP))
        val inner = Ui.vbox(ctx, Gravity.TOP)
        inner.setPadding(Ui.dp(14f), 0, Ui.dp(14f), Ui.dp(14f))
        body(inner)
        if (scroll) {
            val sv = ScrollView(ctx)
            sv.isVerticalScrollBarEnabled = false
            sv.addView(inner, FrameLayout.LayoutParams(Ui.MATCH, Ui.WRAP))
            col.addView(sv, LinearLayout.LayoutParams(Ui.MATCH, 0, 1f))
        } else col.addView(inner, LinearLayout.LayoutParams(Ui.MATCH, 0, 1f))
        return col
    }

    private fun card(accent: Int = Ui.CYAN): LinearLayout {
        val c = Ui.vbox(ctx, Gravity.START)
        c.background = Ui.bg(0xFF121A2E.toInt(), Ui.withAlpha(accent, 0x55), 18f, 1.2f)
        c.setPadding(Ui.dp(14f), Ui.dp(12f), Ui.dp(14f), Ui.dp(12f))
        return c
    }

    private fun kv(parent: LinearLayout, k: String, v: String, color: Int = Ui.TEXT) {
        val r = Ui.hbox(ctx)
        r.setPadding(0, Ui.dp(3f), 0, Ui.dp(3f))
        r.addView(Ui.text(ctx, k, 13f, Ui.DIM), LinearLayout.LayoutParams(0, Ui.WRAP, 1f))
        r.addView(Ui.text(ctx, v, 14f, color, Ui.bold))
        parent.addView(r, Ui.lp())
    }

    // ================================================================= home
    private class AppDef(val id: Int, val icon: String, val fa: String, val en: String, val c1: Int, val c2: Int)

    private val apps = arrayOf(
        AppDef(APP_MAP, "🗺", "نقشه", "Maps", 0xFF19C37D.toInt(), 0xFF0B7A8F.toInt()),
        AppDef(APP_TAXI, "🚕", "تاکسی", "Taxi", 0xFFFFD23F.toInt(), 0xFFFF8A00.toInt()),
        AppDef(APP_GARAGE, "🏎", "گاراژ", "Garage", 0xFFFF2D95.toInt(), 0xFF7B2FF7.toInt()),
        AppDef(APP_MESSAGES, "💬", "پیام‌ها", "Messages", 0xFF39FF88.toInt(), 0xFF0FA958.toInt()),
        AppDef(APP_CAMERA, "📷", "دوربین", "Camera", 0xFF8A97B8.toInt(), 0xFF2B3350.toInt()),
        AppDef(APP_MUSIC, "🎵", "رادیو", "Radio", 0xFFFF4D5E.toInt(), 0xFFFF2D95.toInt()),
        AppDef(APP_STATS, "📊", "آمار", "Stats", 0xFF00E5FF.toInt(), 0xFF2F6BFF.toInt()),
        AppDef(APP_SETTINGS, "⚙", "تنظیمات", "Settings", 0xFF5D6B8C.toInt(), 0xFF2A3247.toInt())
    )

    private fun home(): View {
        val root = FrameLayout(ctx)
        root.background = GradientDrawable(GradientDrawable.Orientation.TL_BR,
            intArrayOf(0xFF2A0F4A.toInt(), 0xFF0E1E4A.toInt(), 0xFF052A3A.toInt()))
        root.addView(WallpaperView(ctx), FrameLayout.LayoutParams(Ui.MATCH, Ui.MATCH))
        val col = Ui.vbox(ctx, Gravity.CENTER_HORIZONTAL)
        col.setPadding(Ui.dp(14f), Ui.dp(14f), Ui.dp(14f), Ui.dp(10f))
        val c = Calendar.getInstance()
        val clock = Lang.num(c.get(Calendar.HOUR_OF_DAY)) + ":" + (if (c.get(Calendar.MINUTE) < 10) Lang.num(0) else "") + Lang.num(c.get(Calendar.MINUTE))
        val clockV = Ui.text(ctx, clock, 46f, Ui.TEXT, Ui.black)
        clockV.setShadowLayer(18f, 0f, 0f, Ui.PINK)
        col.addView(clockV, Ui.lp(Ui.WRAP))
        val sub = Ui.text(ctx, regionLine(), 12f, Ui.withAlpha(Ui.TEXT, 0xCC), Ui.bold)
        col.addView(sub, Ui.lp(Ui.WRAP, bottomDp = 12f))
        // live widget: current taxi job or a tip
        col.addView(widget(), Ui.lp(bottomDp = 14f))
        // app grid, 4 per row
        var row: LinearLayout? = null
        for ((i, a) in apps.withIndex()) {
            if (i % 4 == 0) {
                row = LinearLayout(ctx)
                row.orientation = LinearLayout.HORIZONTAL
                col.addView(row, Ui.lp(bottomDp = 10f))
            }
            row!!.addView(appIcon(a), LinearLayout.LayoutParams(0, Ui.WRAP, 1f))
        }
        val sv = ScrollView(ctx)
        sv.isVerticalScrollBarEnabled = false
        sv.addView(col, FrameLayout.LayoutParams(Ui.MATCH, Ui.WRAP))
        root.addView(sv, FrameLayout.LayoutParams(Ui.MATCH, Ui.MATCH))
        // dock-like hint
        staggerIn(col, 40L, 24f)
        return root
    }

    private fun regionLine(): String {
        val w = world
        val env = str(GameData.envs[w.env.coerceIn(0, GameData.envs.size - 1)].nameRes)
        val weather = str(GameData.weatherNames[w.weather.coerceIn(0, GameData.weatherNames.size - 1)])
        return "📍 $env  •  $weather"
    }

    private fun widget(): View {
        val w = world
        val c = LinearLayout(ctx)
        c.orientation = LinearLayout.HORIZONTAL
        c.gravity = Gravity.CENTER_VERTICAL
        c.background = Ui.bg(0x55000000, 0x33FFFFFF, 20f, 1f)
        c.setPadding(Ui.dp(14f), Ui.dp(10f), Ui.dp(14f), Ui.dp(10f))
        val icon = Ui.text(ctx, "🚕", 26f)
        c.addView(icon)
        val tx = Ui.vbox(ctx, Gravity.START)
        tx.setPadding(Ui.dp(10f), 0, Ui.dp(10f), 0)
        val (title, line) = when (w.taxiState) {
            World.TAXI_WAITING, World.TAXI_BOARDING -> t("مسافر منتظر است", "Passenger waiting") to distText(w.taxiPickS - w.ps)
            World.TAXI_RIDING -> str(HudView.DESTS[w.taxiDest.coerceIn(0, HudView.DESTS.size - 1)]) to
                (distText(w.taxiDropS - w.ps) + "  •  " + Lang.num(w.taxiFare) + " 🪙")
            World.TAXI_IDLE, World.TAXI_ALIGHT -> t("شیفت تاکسی فعال", "Taxi shift on") to t("دنبال مسافر بعدی…", "Looking for the next fare…")
            else -> if (world.mode == GameData.MODE_FREE) t("شیفت تاکسی خاموش", "Taxi shift off") to t("از برنامهٔ تاکسی شروع کن", "Start it in the Taxi app")
            else t("آمین ریسینگ", "Amin Racing") to t("رانندگی خوش!", "Have a great drive!")
        }
        tx.addView(Ui.text(ctx, title, 14f, Ui.TEXT, Ui.bold))
        tx.addView(Ui.text(ctx, line, 12f, Ui.withAlpha(Ui.TEXT, 0xBB)))
        c.addView(tx, LinearLayout.LayoutParams(0, Ui.WRAP, 1f))
        c.setOnClickListener { open(if (w.taxiState != World.TAXI_OFF || w.mode == GameData.MODE_FREE) APP_TAXI else APP_MAP) }
        Ui.pressable(c)
        return c
    }

    private fun appIcon(a: AppDef): View {
        val col = Ui.vbox(ctx, Gravity.CENTER_HORIZONTAL)
        val box = FrameLayout(ctx)
        val sq = TextView(ctx)
        sq.text = a.icon
        sq.textSize = 26f
        sq.gravity = Gravity.CENTER
        sq.background = Ui.gradient(a.c1, a.c2, 0x33FFFFFF, 16f)
        sq.elevation = Ui.dp(6f).toFloat()
        box.addView(sq, FrameLayout.LayoutParams(Ui.dp(56f), Ui.dp(56f), Gravity.CENTER))
        val badge = when (a.id) {
            APP_MESSAGES -> host.messages.unread
            APP_TAXI -> if (world.taxiState == World.TAXI_WAITING) 1 else 0
            else -> 0
        }
        if (badge > 0) {
            val b = Ui.text(ctx, Lang.num(badge), 11f, Ui.TEXT, Ui.black)
            b.gravity = Gravity.CENTER
            b.background = Ui.bg(Ui.RED, 0xFF0A0E1A.toInt(), 10f, 2f)
            b.elevation = Ui.dp(8f).toFloat()
            box.addView(b, FrameLayout.LayoutParams(Ui.dp(22f), Ui.dp(22f), Gravity.TOP or Gravity.END).also { it.marginEnd = Ui.dp(2f) })
        }
        col.addView(box, LinearLayout.LayoutParams(Ui.dp(66f), Ui.dp(62f)))
        col.addView(Ui.text(ctx, t(a.fa, a.en), 11f, Ui.TEXT, Ui.bold))
        col.setOnClickListener { host.sfx(AudioEngine.SFX_CLICK); open(a.id) }
        Ui.pressable(col)
        return col
    }

    private fun distText(m: Float): String {
        val a = abs(m)
        val s = if (a >= 1000f) Lang.digits(((a / 100f).toInt() / 10f).toString()) + " " + str(R.string.km)
        else Lang.num(((a / 10f).toInt() * 10)) + " " + str(R.string.unit_m)
        return if (m < 0) t("پشت سر  ", "behind  ") + s else s
    }

    // ================================================================= maps
    private fun mapApp(): View {
        val root = FrameLayout(ctx)
        val map = MapView(ctx)
        root.addView(map, FrameLayout.LayoutParams(Ui.MATCH, Ui.MATCH))
        // header chip
        val top = Ui.hbox(ctx)
        top.setPadding(Ui.dp(10f), Ui.dp(6f), Ui.dp(10f), 0)
        val back = Ui.text(ctx, if (Lang.isFa) " › " else " ‹ ", 22f, Ui.TEXT, Ui.black)
        back.background = Ui.bg(0xCC0A0E1A.toInt(), 0x44FFFFFF, 14f, 1f)
        back.setOnClickListener { open(APP_HOME) }
        top.addView(back)
        val chip = Ui.text(ctx, "GPS  •  " + regionLine(), 12f, Ui.TEXT, Ui.bold)
        chip.background = Ui.bg(0xCC0A0E1A.toInt(), 0x44FFFFFF, 14f, 1f)
        chip.setPadding(Ui.dp(12f), Ui.dp(7f), Ui.dp(12f), Ui.dp(7f))
        top.addView(chip, LinearLayout.LayoutParams(0, Ui.WRAP, 1f).also { it.marginStart = Ui.dp(8f) })
        root.addView(top, FrameLayout.LayoutParams(Ui.MATCH, Ui.WRAP, Gravity.TOP))
        // zoom buttons
        val zoom = Ui.vbox(ctx)
        for (k in 0..1) {
            val b = Ui.text(ctx, if (k == 0) "+" else "−", 22f, Ui.TEXT, Ui.black)
            b.gravity = Gravity.CENTER
            b.background = Ui.bg(0xCC0A0E1A.toInt(), 0x44FFFFFF, 14f, 1f)
            b.setOnClickListener { map.zoom(if (k == 0) 0.6f else 1.6f) }
            zoom.addView(b, LinearLayout.LayoutParams(Ui.dp(42f), Ui.dp(42f)).also { it.bottomMargin = Ui.dp(8f) })
        }
        root.addView(zoom, FrameLayout.LayoutParams(Ui.WRAP, Ui.WRAP, Gravity.END or Gravity.CENTER_VERTICAL).also { it.marginEnd = Ui.dp(10f) })
        return root
    }

    /** Live strip map of the road ahead: landmarks, region tunnels, taxi pins and the player. */
    private inner class MapView(c: Context) : View(c) {
        private val d = resources.displayMetrics.density
        private var range = 1600f
        private val p = Paint(Paint.ANTI_ALIAS_FLAG)
        private val tp = Paint(Paint.ANTI_ALIAS_FLAG).apply { typeface = Ui.bold; color = Ui.TEXT }
        private val path = Path()
        private val r = RectF()

        fun zoom(k: Float) {
            range = (range * k).coerceIn(500f, 5000f)
            invalidate()
        }

        private fun hash(n: Int): Float {
            var x = n * 374761393 + 668265263
            x = (x xor (x ushr 13)) * 1274126177
            return ((x xor (x ushr 16)) and 0xFFFF) / 65535f
        }

        override fun onDraw(cv: Canvas) {
            val w = world
            val W = width.toFloat(); val H = height.toFloat()
            val cx = W / 2f
            val py = H * 0.76f
            val mpp = range / (H * 0.85f)          // metres per pixel
            fun yOf(s: Float) = py - (s - w.ps) / mpp
            // ground by region
            val ground = when (w.env) {
                GameData.ENV_FOREST -> 0xFF0F2A1C.toInt(); GameData.ENV_DESERT -> 0xFF3A2E1A.toInt()
                GameData.ENV_SNOW -> 0xFF2A3546.toInt(); GameData.ENV_COAST -> 0xFF13293A.toInt()
                GameData.ENV_MOUNTAIN -> 0xFF22262E.toInt(); else -> 0xFF161B2A.toInt()
            }
            cv.drawColor(ground)
            // blocks / trees along the road (deterministic per 60 m cell)
            val cell = 60f
            val s0 = w.ps - (H - py) * mpp - cell
            val s1 = w.ps + py * mpp + cell
            var k = Math.floor((s0 / cell).toDouble()).toInt()
            while (k * cell < s1) {
                for (side in 0..1) {
                    val h = hash(k * 2 + side + w.regionSeq * 977)
                    val y = yOf(k * cell + cell * 0.5f)
                    val sd = if (side == 0) -1f else 1f
                    val off = (40f + h * 30f) * d
                    val bw = (16f + hash(k * 7 + side) * 26f) * d
                    val bh = max(6f * d, cell / mpp * 0.7f)
                    if (w.env == GameData.ENV_CITY || w.env == GameData.ENV_INDUSTRIAL) {
                        p.color = if (h > 0.5f) 0xFF242C44.toInt() else 0xFF1E2538.toInt()
                        r.set(cx + sd * off - bw / 2, y - bh / 2, cx + sd * off + bw / 2, y + bh / 2)
                        cv.drawRoundRect(r, 3f * d, 3f * d, p)
                    } else {
                        p.color = when (w.env) { GameData.ENV_DESERT -> 0xFF4A3B22.toInt(); GameData.ENV_SNOW -> 0xFF3A475A.toInt(); else -> 0xFF14402A.toInt() }
                        cv.drawCircle(cx + sd * off, y, (5f + h * 7f) * d, p)
                    }
                }
                k++
            }
            if (w.env == GameData.ENV_COAST) {
                p.color = 0xFF0D3B5E.toInt()
                cv.drawRect(cx + 70f * d, 0f, W, H, p)
            }
            // bridges: water across the map
            for (z in w.zones) {
                if (!z.active || z.type != World.ZONE_BRIDGE) continue
                p.color = 0xFF114A73.toInt()
                cv.drawRect(0f, yOf(z.s1), W, yOf(z.s0), p)
            }
            // road
            val rw = 26f * d
            p.color = 0xFF3A4152.toInt()
            cv.drawRect(cx - rw, 0f, cx + rw, H, p)
            p.color = 0xFFE8ECF4.toInt()
            cv.drawRect(cx - rw, 0f, cx - rw + 1.5f * d, H, p)
            cv.drawRect(cx + rw - 1.5f * d, 0f, cx + rw, H, p)
            // dashed lanes (scroll with the player)
            p.color = 0x99E8ECF4.toInt()
            val dash = 24f; val period = 48f
            var ds = Math.floor(((w.ps - (H - py) * mpp) / period).toDouble()).toFloat() * period
            while (ds < s1) {
                val ya = yOf(ds); val yb = yOf(ds + dash)
                for (l in -1..1) cv.drawRect(cx + l * rw / 2f - 0.8f * d, yb, cx + l * rw / 2f + 0.8f * d, ya, p)
                ds += period * max(1f, mpp / 3f)
            }
            // tunnels + roadside landmarks
            tp.textAlign = Paint.Align.CENTER
            for (z in w.zones) {
                if (!z.active) continue
                val ya = yOf(z.s1); val yb = yOf(z.s0)
                if (yb < -40f || ya > H + 40f) continue
                when (z.type) {
                    World.ZONE_TUNNEL -> {
                        p.color = 0xCC0A0D16.toInt()
                        cv.drawRect(cx - rw - 6f * d, ya, cx + rw + 6f * d, yb, p)
                        p.color = 0xFF8A97B8.toInt()
                        cv.drawRect(cx - rw - 6f * d, ya, cx - rw - 3f * d, yb, p)
                        cv.drawRect(cx + rw + 3f * d, ya, cx + rw + 6f * d, yb, p)
                        if (z.regionTo >= 0) {
                            tp.textSize = 11f * d; tp.color = Ui.YELLOW
                            cv.drawText("→ " + str(GameData.envs[z.regionTo].nameRes), cx, (ya + yb) / 2f, tp)
                        }
                    }
                    World.ZONE_GAS, World.ZONE_PARKING, World.ZONE_DEALER -> {
                        val y = (ya + yb) / 2f
                        val x = cx + z.side * (rw + 26f * d)
                        p.color = when (z.type) { World.ZONE_GAS -> 0xFFFF8A00.toInt(); World.ZONE_PARKING -> 0xFF2F6BFF.toInt(); else -> Ui.PINK }
                        cv.drawCircle(x, y, 13f * d, p)
                        tp.textSize = 13f * d; tp.color = Ui.TEXT
                        cv.drawText(when (z.type) { World.ZONE_GAS -> "⛽"; World.ZONE_PARKING -> "P"; else -> "🏪" }, x, y + 4.5f * d, tp)
                    }
                    else -> {}
                }
            }
            // taxi pins
            val pulse = 0.5f + 0.5f * sin(System.currentTimeMillis() / 180.0).toFloat()
            when (w.taxiState) {
                World.TAXI_WAITING, World.TAXI_BOARDING -> pin(cv, w.taxiPickS, w.taxiPickSide, Ui.YELLOW, "🧍", t("مسافر", "Pickup"), ::yOf, cx, rw, H, pulse)
                World.TAXI_RIDING -> pin(cv, w.taxiDropS, w.taxiDropSide, Ui.GREEN, "🏁",
                    str(HudView.DESTS[w.taxiDest.coerceIn(0, HudView.DESTS.size - 1)]), ::yOf, cx, rw, H, pulse)
                else -> {}
            }
            // the player (and the parked car when walking)
            val carX = cx + w.px / (GameData.ROAD_HALF) * rw * 0.9f
            if (w.onFoot) {
                p.color = Ui.CYAN
                r.set(carX - 5f * d, py - 9f * d, carX + 5f * d, py + 9f * d)
                cv.drawRoundRect(r, 2f * d, 2f * d, p)
                val fx = cx + w.footX / GameData.ROAD_HALF * rw * 0.9f
                val fy = yOf(w.footS)
                p.color = Ui.withAlpha(Ui.GREEN, (90 + 100 * pulse).toInt())
                cv.drawCircle(fx, fy, 12f * d, p)
                p.color = Ui.GREEN
                cv.drawCircle(fx, fy, 5.5f * d, p)
            } else {
                p.color = Ui.withAlpha(Ui.CYAN, (60 + 80 * pulse).toInt())
                cv.drawCircle(carX, py, 18f * d, p)
                path.reset()
                path.moveTo(carX, py - 13f * d)
                path.lineTo(carX + 9f * d, py + 10f * d)
                path.lineTo(carX, py + 5f * d)
                path.lineTo(carX - 9f * d, py + 10f * d)
                path.close()
                p.color = Ui.CYAN
                cv.drawPath(path, p)
            }
            // scale bar
            val barM = if (range > 2500f) 1000f else if (range > 1000f) 500f else 200f
            val barPx = barM / mpp
            p.color = Ui.TEXT
            val bx = 16f * d; val by = H - 18f * d
            cv.drawRect(bx, by, bx + barPx, by + 3f * d, p)
            tp.textAlign = Paint.Align.LEFT; tp.textSize = 11f * d; tp.color = Ui.TEXT
            cv.drawText(if (barM >= 1000f) Lang.num(1) + " " + str(R.string.km) else Lang.num(barM.toInt()) + " " + str(R.string.unit_m), bx, by - 6f * d, tp)
            postInvalidateDelayed(50)
        }

        private fun pin(cv: Canvas, s: Float, side: Int, color: Int, glyph: String, label: String,
                        yOf: (Float) -> Float, cx: Float, rw: Float, H: Float, pulse: Float) {
            var y = yOf(s)
            val off = y < 30f * d
            if (off) y = 46f * d
            val x = cx + side * rw * 0.75f
            p.color = Ui.withAlpha(color, (70 + 90 * pulse).toInt())
            cv.drawCircle(x, y, (16f + 6f * pulse) * d, p)
            p.color = color
            path.reset()
            path.moveTo(x, y + 4f * d)
            path.lineTo(x - 11f * d, y - 14f * d)
            path.lineTo(x + 11f * d, y - 14f * d)
            path.close()
            cv.drawPath(path, p)
            cv.drawCircle(x, y - 19f * d, 13f * d, p)
            tp.textAlign = Paint.Align.CENTER; tp.textSize = 13f * d; tp.color = 0xFF0A0E1A.toInt()
            cv.drawText(glyph, x, y - 14.5f * d, tp)
            tp.color = Ui.TEXT; tp.textSize = 11f * d
            val lx = x + side * 0f
            val txt = label + "  " + distText(s - world.ps)
            val tw = tp.measureText(txt)
            r.set(lx - tw / 2 - 8f * d, y + 8f * d, lx + tw / 2 + 8f * d, y + 26f * d)
            p.color = 0xDD0A0E1A.toInt()
            cv.drawRoundRect(r, 9f * d, 9f * d, p)
            cv.drawText(txt, lx, y + 21.5f * d, tp)
            if (off) {
                tp.color = color; tp.textSize = 16f * d
                cv.drawText("▲", x, 18f * d, tp)
            }
        }
    }

    // ================================================================= taxi
    private fun taxiApp(): View = appPage(t("تاکسی امین", "Amin Cabs"), Ui.YELLOW, { col ->
        val w = world
        val free = w.mode == GameData.MODE_FREE
        val hero = LinearLayout(ctx)
        hero.orientation = LinearLayout.VERTICAL
        hero.background = Ui.gradient(0xFFFFD23F.toInt(), 0xFFFF8A00.toInt(), 0, 20f)
        hero.setPadding(Ui.dp(16f), Ui.dp(14f), Ui.dp(16f), Ui.dp(14f))
        val on = w.taxiOn
        hero.addView(Ui.text(ctx, if (on) t("شیفت فعال است", "Shift active") else t("شیفت خاموش", "Off duty"), 13f, 0xFF3A2400.toInt(), Ui.bold))
        val big = when (w.taxiState) {
            World.TAXI_WAITING, World.TAXI_BOARDING -> t("مسافر منتظر شماست", "A passenger is waiting")
            World.TAXI_RIDING -> "→ " + str(HudView.DESTS[w.taxiDest.coerceIn(0, HudView.DESTS.size - 1)])
            else -> if (on) t("در جستجوی مسافر…", "Finding a fare…") else t("آماده‌ای؟", "Ready to drive?")
        }
        hero.addView(Ui.text(ctx, big, 21f, 0xFF1A1000.toInt(), Ui.black))
        if (w.taxiState == World.TAXI_RIDING) {
            val left = w.taxiLimit - w.taxiTimer
            hero.addView(Ui.text(ctx, distText(w.taxiDropS - w.ps) + "  •  " +
                (if (left > 0f) "⏱ " + Lang.num(left.toInt()) + t(" ثانیه", " s") else t("دیر شده!", "Late!")) + "  •  " + Lang.num(w.taxiFare) + " 🪙",
                13f, 0xFF3A2400.toInt(), Ui.bold))
        } else if (w.taxiState == World.TAXI_WAITING) {
            hero.addView(Ui.text(ctx, distText(w.taxiPickS - w.ps) + "  •  " + (if (w.taxiPickSide > 0) str(R.string.taxi_kerb_right) else str(R.string.taxi_kerb_left)),
                13f, 0xFF3A2400.toInt(), Ui.bold))
        }
        col.addView(hero, Ui.lp(bottomDp = 12f))
        if (free) {
            col.addView(Ui.button(ctx, if (on) t("پایان شیفت", "End shift") else t("شروع شیفت تاکسی", "Start taxi shift"),
                if (on) Ui.RED else Ui.YELLOW, !on, 16f) {
                host.setTaxiShift(!on)
                open(APP_TAXI)
            }, Ui.lp(bottomDp = 12f))
        } else {
            val r = Ui.hbox(ctx)
            r.addView(Ui.text(ctx, t("پیشنهاد مسافر در حالت بی‌پایان", "Offer fares in Endless"), 14f, Ui.TEXT, Ui.bold), LinearLayout.LayoutParams(0, Ui.WRAP, 1f))
            r.addView(Ui.toggle(ctx, save.prefInt("taxi_endless", 1) == 1, Ui.YELLOW) { v ->
                save.putPrefInt("taxi_endless", if (v) 1 else 0)
                host.setTaxiShift(v)
            })
            col.addView(r, Ui.lp(bottomDp = 12f))
        }
        val run = card(Ui.YELLOW)
        run.addView(Ui.text(ctx, t("این دور", "This run"), 13f, Ui.YELLOW, Ui.bold))
        kv(run, t("سفرها", "Rides"), Lang.num(w.taxiRides))
        kv(run, t("درآمد", "Earned"), Lang.num(w.taxiCoins) + " 🪙", Ui.YELLOW)
        col.addView(run, Ui.lp(bottomDp = 10f))
        val life = card(Ui.CYAN)
        val rides = save.prefInt("stat_taxi_rides")
        life.addView(Ui.text(ctx, t("کارنامهٔ راننده", "Driver record"), 13f, Ui.CYAN, Ui.bold))
        kv(life, t("کل سفرها", "Total rides"), Lang.num(rides))
        kv(life, t("کل درآمد", "Total earned"), Lang.num(save.prefLong("stat_taxi_coins").toInt()) + " 🪙", Ui.YELLOW)
        val avg = if (rides > 0) save.prefInt("stat_taxi_stars") / rides.toFloat() else 0f
        kv(life, t("امتیاز مسافران", "Rating"), if (rides > 0) "★ " + Lang.digits(((avg * 10).toInt() / 10f).toString()) else "—", Ui.YELLOW)
        col.addView(life, Ui.lp(bottomDp = 10f))
        val tip = Ui.text(ctx, t("نکته: با ماشین «تاکسی» ۵۰٪ کرایه بیشتری می‌گیری. ترمز ناگهانی و برخورد، ستاره کم می‌کند.",
            "Tip: the Taxi car earns 50% more. Crashes and scrapes cost stars."), 12f, Ui.DIM)
        col.addView(tip, Ui.lp())
    })

    // ================================================================= garage
    private fun garageApp(): View = appPage(t("گاراژ من", "My Garage"), Ui.PINK, { col ->
        val free = world.mode == GameData.MODE_FREE
        if (!free) col.addView(Ui.text(ctx, t("تعویض ماشین وسط جاده فقط در گشت آزاد ممکن است.", "Swapping cars on the road works in Free Roam."), 12f, Ui.DIM), Ui.lp(bottomDp = 8f))
        for (c in GameData.cars.indices) {
            val spec = GameData.cars[c]
            val owned = save.isCarOwned(c)
            val cur = c == save.selectedCar
            val row = Ui.hbox(ctx)
            row.background = Ui.bg(if (cur) 0xFF1E1530.toInt() else 0xFF121A2E.toInt(), if (cur) Ui.PINK else 0x22FFFFFF, 16f, 1.2f)
            row.setPadding(Ui.dp(12f), Ui.dp(10f), Ui.dp(12f), Ui.dp(10f))
            val sw = View(ctx)
            sw.background = Ui.bg(save.paintColor(c), 0x55FFFFFF, 8f, 1f)
            row.addView(sw, LinearLayout.LayoutParams(Ui.dp(16f), Ui.dp(34f)))
            val tx = Ui.vbox(ctx, Gravity.START)
            tx.setPadding(Ui.dp(10f), 0, Ui.dp(8f), 0)
            tx.addView(Ui.text(ctx, str(spec.nameRes), 14f, if (owned) Ui.TEXT else Ui.DIM, Ui.bold))
            tx.addView(Ui.text(ctx, str(spec.catRes) + "  •  " + Lang.num(spec.topSpeed.toInt()) + " " + str(R.string.kmh), 11f, Ui.DIM))
            row.addView(tx, LinearLayout.LayoutParams(0, Ui.WRAP, 1f))
            when {
                !owned -> row.addView(Ui.text(ctx, "🔒 " + Lang.num(spec.price), 12f, Ui.YELLOW, Ui.bold))
                cur -> row.addView(Ui.text(ctx, "✓", 18f, Ui.PINK, Ui.black))
                free -> row.addView(Ui.button(ctx, t("برو", "Drive"), Ui.PINK, true, 13f) { host.swapCar(c) })
            }
            col.addView(row, Ui.lp(bottomDp = 8f))
        }
    })

    // ================================================================= messages
    private fun messagesApp(): View {
        val list = host.messages.list()
        host.messages.markRead()
        return appPage(t("پیام‌ها", "Messages"), Ui.GREEN, { col ->
            if (list.isEmpty()) col.addView(Ui.text(ctx, t("پیامی نیست", "No messages"), 14f, Ui.DIM), Ui.lp())
            for (m in list.asReversed()) {
                val row = Ui.hbox(ctx, Gravity.TOP)
                val av = Ui.text(ctx, m.icon, 20f)
                av.gravity = Gravity.CENTER
                av.background = Ui.bg(0xFF1B2540.toInt(), 0, 20f)
                row.addView(av, LinearLayout.LayoutParams(Ui.dp(40f), Ui.dp(40f)))
                val bubble = Ui.vbox(ctx, Gravity.START)
                bubble.background = Ui.bg(0xFF16213A.toInt(), 0x2239FF88, 16f, 1f)
                bubble.setPadding(Ui.dp(12f), Ui.dp(8f), Ui.dp(12f), Ui.dp(9f))
                val head = Ui.hbox(ctx)
                head.addView(Ui.text(ctx, m.from(), 12f, Ui.GREEN, Ui.bold), LinearLayout.LayoutParams(0, Ui.WRAP, 1f))
                head.addView(Ui.text(ctx, ago(m.time), 10f, Ui.DIM))
                bubble.addView(head, Ui.lp())
                bubble.addView(Ui.text(ctx, m.text(), 13f, Ui.TEXT), Ui.lp(topDp = 2f))
                row.addView(bubble, LinearLayout.LayoutParams(0, Ui.WRAP, 1f).also { it.marginStart = Ui.dp(8f) })
                col.addView(row, Ui.lp(bottomDp = 10f))
            }
        })
    }

    private fun ago(time: Long): String {
        val min = ((System.currentTimeMillis() - time) / 60000L).toInt()
        return when {
            min < 1 -> t("الان", "now")
            min < 60 -> Lang.num(min) + t(" دقیقه", "m")
            min < 1440 -> Lang.num(min / 60) + t(" ساعت", "h")
            else -> Lang.num(min / 1440) + t(" روز", "d")
        }
    }

    // ================================================================= camera
    private fun cameraApp(): View = appPage(t("دوربین", "Camera"), Ui.CYAN, { col ->
        val shoot = Ui.button(ctx, "📸  " + t("حالت عکاسی", "Photo mode"), Ui.CYAN, true, 17f) {
            host.replaceTop(PhotoModeScreen(host))
        }
        col.addView(shoot, Ui.lp(bottomDp = 6f))
        col.addView(Ui.text(ctx, t("دور ماشین بچرخ، زوم کن و عکس بگیر. عکس‌ها در گالری گوشی (Pictures/Amin Racing) هم ذخیره می‌شوند.",
            "Orbit the car, zoom and shoot. Photos are also saved to your gallery (Pictures/Amin Racing)."), 12f, Ui.DIM), Ui.lp(bottomDp = 12f))
        col.addView(Ui.text(ctx, t("گالری", "Gallery"), 14f, Ui.CYAN, Ui.bold), Ui.lp(bottomDp = 6f))
        val files = host.photos().take(8)
        if (files.isEmpty()) col.addView(Ui.text(ctx, t("هنوز عکسی نگرفته‌ای", "No photos yet"), 13f, Ui.DIM), Ui.lp())
        var row: LinearLayout? = null
        for ((i, f) in files.withIndex()) {
            if (i % 2 == 0) { row = LinearLayout(ctx); row.orientation = LinearLayout.HORIZONTAL; col.addView(row, Ui.lp(bottomDp = 8f)) }
            val iv = ImageView(ctx)
            iv.scaleType = ImageView.ScaleType.CENTER_CROP
            iv.background = Ui.bg(0xFF121A2E.toInt(), 0x33FFFFFF, 12f, 1f)
            iv.clipToOutline = true
            try {
                val o = BitmapFactory.Options(); o.inSampleSize = 4
                iv.setImageBitmap(BitmapFactory.decodeFile(f.absolutePath, o))
            } catch (_: Throwable) {}
            row!!.addView(iv, LinearLayout.LayoutParams(0, Ui.dp(92f), 1f).also { it.marginEnd = Ui.dp(if (i % 2 == 0) 8f else 0f) })
        }
        if (files.size % 2 == 1) row?.addView(View(ctx), LinearLayout.LayoutParams(0, Ui.dp(92f), 1f))
    })

    // ================================================================= radio
    private fun musicApp(): View = appPage(t("رادیو", "Radio"), Ui.RED, { col ->
        val names = arrayOf("Neon FM  101.1", "Lo-fi Nights  88.4", "Turbo FM  104.7")
        val genres = arrayOf(t("سینث‌ویو نئونی", "Neon synthwave"), t("لو-فای آرام شبانه", "Chill night lo-fi"), t("الکترونیک پرانرژی", "High-energy electro"))
        val cur = save.prefInt("radio_station").coerceIn(0, AudioEngine.NUM_STATIONS - 1)
        val on = save.musicOn
        val now = LinearLayout(ctx)
        now.orientation = LinearLayout.VERTICAL
        now.gravity = Gravity.CENTER_HORIZONTAL
        now.background = Ui.gradient(0xFFFF4D5E.toInt(), 0xFF7B2FF7.toInt(), 0, 22f)
        now.setPadding(Ui.dp(16f), Ui.dp(16f), Ui.dp(16f), Ui.dp(14f))
        now.addView(Ui.text(ctx, if (on) t("در حال پخش", "NOW PLAYING") else t("رادیو خاموش است", "RADIO OFF"), 11f, 0xCCFFFFFF.toInt(), Ui.bold))
        now.addView(Ui.text(ctx, names[cur], 22f, Ui.TEXT, Ui.black))
        now.addView(Ui.text(ctx, genres[cur], 12f, 0xDDFFFFFF.toInt()))
        now.addView(EqView(ctx, on), LinearLayout.LayoutParams(Ui.MATCH, Ui.dp(46f)).also { it.topMargin = Ui.dp(10f) })
        col.addView(now, Ui.lp(bottomDp = 12f))
        val pr = Ui.hbox(ctx)
        pr.addView(Ui.text(ctx, t("پخش موسیقی", "Music"), 14f, Ui.TEXT, Ui.bold), LinearLayout.LayoutParams(0, Ui.WRAP, 1f))
        pr.addView(Ui.toggle(ctx, on, Ui.RED) { v -> save.musicOn = v; host.applySettings(); open(APP_MUSIC) })
        col.addView(pr, Ui.lp(bottomDp = 10f))
        for (i in names.indices) {
            val row = Ui.hbox(ctx)
            val sel = i == cur
            row.background = Ui.bg(if (sel) 0xFF2A1426.toInt() else 0xFF121A2E.toInt(), if (sel) Ui.RED else 0x22FFFFFF, 16f, 1.2f)
            row.setPadding(Ui.dp(14f), Ui.dp(12f), Ui.dp(14f), Ui.dp(12f))
            row.addView(Ui.text(ctx, if (sel && on) "▶" else "📻", 16f, Ui.RED, Ui.black))
            val tx = Ui.vbox(ctx, Gravity.START)
            tx.setPadding(Ui.dp(10f), 0, 0, 0)
            tx.addView(Ui.text(ctx, names[i], 14f, Ui.TEXT, Ui.bold))
            tx.addView(Ui.text(ctx, genres[i], 11f, Ui.DIM))
            row.addView(tx, LinearLayout.LayoutParams(0, Ui.WRAP, 1f))
            row.setOnClickListener {
                save.putPrefInt("radio_station", i)
                if (!save.musicOn) { save.musicOn = true; host.applySettings() }
                host.setRadio(i)
                open(APP_MUSIC)
            }
            Ui.pressable(row)
            col.addView(row, Ui.lp(bottomDp = 8f))
        }
    })

    /** animated equalizer bars */
    private class EqView(c: Context, val on: Boolean) : View(c) {
        private val p = Paint(Paint.ANTI_ALIAS_FLAG)
        override fun onDraw(cv: Canvas) {
            val n = 18
            val bw = width / (n * 1.6f)
            val t = System.currentTimeMillis() / 1000.0
            for (i in 0 until n) {
                val h = if (on) (0.25f + 0.75f * abs(sin(t * (2.1 + i * 0.37) + i * 1.3)).toFloat() * abs(sin(t * 0.9 + i * 0.5)).toFloat().coerceAtLeast(0.3f)) else 0.08f
                val x = i * bw * 1.6f + bw * 0.3f
                p.shader = LinearGradient(0f, height.toFloat(), 0f, 0f, 0xFFFFFFFF.toInt(), 0x88FFFFFF.toInt(), Shader.TileMode.CLAMP)
                cv.drawRoundRect(x, height * (1f - h), x + bw, height.toFloat(), bw / 2, bw / 2, p)
            }
            if (on) postInvalidateDelayed(40)
        }
    }

    // ================================================================= stats
    private fun statsApp(): View = appPage(t("آمار این دور", "Run stats"), Ui.CYAN, { col ->
        val w = world
        val c = card(Ui.CYAN)
        kv(c, t("مسافت", "Distance"), Lang.km(w.distance) + " " + str(R.string.km))
        kv(c, t("بیشترین سرعت", "Top speed"), Lang.num(w.topSpeedKmh.toInt()) + " " + str(R.string.kmh))
        kv(c, t("نزدیک‌گذرها", "Near misses"), Lang.num(w.nearMisses))
        kv(c, t("بهترین کمبو", "Best combo"), "×" + Lang.num(w.bestCombo))
        kv(c, t("سکه‌های جمع‌شده", "Coins picked up"), Lang.num(w.coinsCollected), Ui.YELLOW)
        kv(c, t("سفرهای تاکسی", "Taxi rides"), Lang.num(w.taxiRides))
        kv(c, t("درآمد تا الان", "Earnings so far"), Lang.num(w.coinsEarned()) + " 🪙", Ui.YELLOW)
        col.addView(c, Ui.lp(bottomDp = 10f))
        val c2 = card(Ui.PINK)
        c2.addView(Ui.text(ctx, t("پیشرفت", "Progress"), 13f, Ui.PINK, Ui.bold))
        kv(c2, t("سطح", "Level"), Lang.num(save.level()))
        kv(c2, t("دستاوردها", "Achievements"), Lang.num(host.progression.unlockedCount()) + " / " + Lang.num(host.progression.achievements.size))
        kv(c2, t("چالش‌های امروز باقی‌مانده", "Dailies left today"), Lang.num(host.progression.dailiesOpen()))
        col.addView(c2, Ui.lp())
    })

    // ================================================================= settings
    private fun settingsApp(): View = appPage(t("تنظیمات سریع", "Quick settings"), Ui.DIM, { col ->
        fun row(label: String, v: Boolean, f: (Boolean) -> Unit) {
            val r = Ui.hbox(ctx)
            r.background = Ui.bg(0xFF121A2E.toInt(), 0x22FFFFFF, 16f, 1f)
            r.setPadding(Ui.dp(14f), Ui.dp(10f), Ui.dp(12f), Ui.dp(10f))
            r.addView(Ui.text(ctx, label, 14f, Ui.TEXT, Ui.bold), LinearLayout.LayoutParams(0, Ui.WRAP, 1f))
            r.addView(Ui.toggle(ctx, v, Ui.CYAN) { nv -> f(nv); host.applySettings() })
            col.addView(r, Ui.lp(bottomDp = 8f))
        }
        row("🔊  " + t("صدای افکت‌ها", "Sound effects"), save.sfxOn) { save.sfxOn = it }
        row("🎵  " + t("موسیقی", "Music"), save.musicOn) { save.musicOn = it }
        row("📳  " + t("لرزش", "Vibration"), save.vibration) { save.vibration = it }
        row("🎥  " + t("لرزش دوربین", "Camera shake"), save.cameraShake) { save.cameraShake = it }
        row("⚡  " + t("گاز خودکار", "Auto gas"), save.autoGas) { save.autoGas = it }
        if (host.tiltAvailable) row("📱  " + t("فرمان با شیب گوشی", "Tilt steering"), save.controlMode == SaveManager.CONTROL_TILT) {
            save.controlMode = if (it) SaveManager.CONTROL_TILT else SaveManager.CONTROL_TOUCH
        }
        row("📈  FPS", save.showFps) { save.showFps = it }
    })

    // ================================================================= wallpaper
    /** soft neon blobs drifting behind the home screen */
    private class WallpaperView(c: Context) : View(c) {
        private val p = Paint(Paint.ANTI_ALIAS_FLAG)
        override fun onDraw(cv: Canvas) {
            val t = System.currentTimeMillis() / 1000.0
            val cols = intArrayOf(0x55FF2D95, 0x4400E5FF, 0x337B2FF7)
            for (i in 0..2) {
                val x = width * (0.3f + 0.4f * sin(t * 0.21 + i * 2.1).toFloat())
                val y = height * (0.25f + 0.5f * sin(t * 0.17 + i * 1.3).toFloat().let { abs(it) })
                p.shader = android.graphics.RadialGradient(x, y, width * 0.6f, cols[i], 0, Shader.TileMode.CLAMP)
                cv.drawCircle(x, y, width * 0.6f, p)
            }
            postInvalidateDelayed(60)
        }
    }

    companion object {
        const val APP_HOME = 0
        const val APP_MAP = 1
        const val APP_TAXI = 2
        const val APP_GARAGE = 3
        const val APP_MESSAGES = 4
        const val APP_CAMERA = 5
        const val APP_MUSIC = 6
        const val APP_STATS = 7
        const val APP_SETTINGS = 8
    }
}

/**
 * Photo mode (phone camera): HUD hidden, drag to orbit, pinch or slider to zoom, shutter saves
 * the frame. Back returns to the phone's camera app.
 */
class PhotoModeScreen(host: GameHost, private var yaw: Float = 0.6f, private var pitch: Float = 0.25f, private var dist: Float = 7f) : Screen(host) {
    override val dim = 0f
    private lateinit var flash: View
    private lateinit var thumb: ImageView

    @SuppressLint("ClickableViewAccessibility")
    override fun build(): View {
        val root = FrameLayout(ctx)
        host.photoMode(true)
        push()
        var lx = 0f; var ly = 0f; var pinch = 0f
        root.setOnTouchListener { _, e ->
            when (e.actionMasked) {
                MotionEvent.ACTION_DOWN -> { lx = e.x; ly = e.y }
                MotionEvent.ACTION_POINTER_DOWN -> if (e.pointerCount == 2) pinch = spread(e)
                MotionEvent.ACTION_MOVE -> {
                    if (e.pointerCount >= 2) {
                        val s = spread(e)
                        if (pinch > 0f) dist = (dist * pinch / max(s, 1f)).coerceIn(3f, 16f)
                        pinch = s
                    } else {
                        yaw -= (e.x - lx) * 0.008f
                        pitch = (pitch + (e.y - ly) * 0.005f).coerceIn(0.02f, 1.2f)
                        lx = e.x; ly = e.y
                    }
                    push()
                }
            }
            true
        }
        val top = Ui.text(ctx, if (Lang.isFa) "بکش برای چرخش • دو انگشت برای زوم" else "Drag to orbit • pinch to zoom", 13f, Ui.TEXT, Ui.bold)
        top.background = Ui.bg(0x99070A14.toInt(), 0x33FFFFFF, 14f, 1f)
        top.setPadding(Ui.dp(14f), Ui.dp(7f), Ui.dp(14f), Ui.dp(7f))
        root.addView(top, FrameLayout.LayoutParams(Ui.WRAP, Ui.WRAP, Gravity.TOP or Gravity.CENTER_HORIZONTAL).also { it.topMargin = Ui.dp(14f) })
        // bottom bar: close, shutter, last photo
        val bar = Ui.hbox(ctx, Gravity.CENTER)
        val close = Ui.text(ctx, "✕", 22f, Ui.TEXT, Ui.black)
        close.gravity = Gravity.CENTER
        close.background = Ui.bg(0x99070A14.toInt(), 0x55FFFFFF, 26f, 1.5f)
        close.setOnClickListener { onBack() }
        bar.addView(close, LinearLayout.LayoutParams(Ui.dp(52f), Ui.dp(52f)))
        val shutter = FrameLayout(ctx)
        shutter.background = Ui.bg(0x00000000, 0xFFFFFFFF.toInt(), 40f, 4f)
        val inner = View(ctx)
        inner.background = Ui.bg(0xFFFFFFFF.toInt(), 0, 32f)
        shutter.addView(inner, FrameLayout.LayoutParams(Ui.dp(60f), Ui.dp(60f), Gravity.CENTER))
        shutter.setOnClickListener {
            inner.animate().scaleX(0.82f).scaleY(0.82f).setDuration(80).withEndAction { inner.animate().scaleX(1f).scaleY(1f).setDuration(120).start() }.start()
            host.sfx(AudioEngine.SFX_SHUTTER)
            host.takePhoto { f ->
                flash.alpha = 0.9f
                flash.animate().alpha(0f).setDuration(380).start()
                if (f != null) {
                    try { val o = BitmapFactory.Options(); o.inSampleSize = 4; thumb.setImageBitmap(BitmapFactory.decodeFile(f.absolutePath, o)) } catch (_: Throwable) {}
                    host.toast(if (Lang.isFa) "📸 عکس ذخیره شد" else "📸 Photo saved", Ui.GREEN)
                } else host.toast(if (Lang.isFa) "ذخیرهٔ عکس ممکن نشد" else "Couldn't save the photo", Ui.RED)
            }
        }
        bar.addView(shutter, LinearLayout.LayoutParams(Ui.dp(76f), Ui.dp(76f)).also { it.marginStart = Ui.dp(28f); it.marginEnd = Ui.dp(28f) })
        thumb = ImageView(ctx)
        thumb.scaleType = ImageView.ScaleType.CENTER_CROP
        thumb.background = Ui.bg(0x99070A14.toInt(), 0x55FFFFFF, 12f, 1.5f)
        thumb.clipToOutline = true
        host.photos().firstOrNull()?.let { f ->
            try { val o = BitmapFactory.Options(); o.inSampleSize = 6; thumb.setImageBitmap(BitmapFactory.decodeFile(f.absolutePath, o)) } catch (_: Throwable) {}
        }
        bar.addView(thumb, LinearLayout.LayoutParams(Ui.dp(52f), Ui.dp(52f)))
        root.addView(bar, FrameLayout.LayoutParams(Ui.WRAP, Ui.WRAP, Gravity.BOTTOM or Gravity.CENTER_HORIZONTAL).also { it.bottomMargin = Ui.dp(22f) })
        flash = View(ctx)
        flash.setBackgroundColor(0xFFFFFFFF.toInt())
        flash.alpha = 0f
        flash.isClickable = false
        root.addView(flash, FrameLayout.LayoutParams(Ui.MATCH, Ui.MATCH))
        return root
    }

    private fun spread(e: MotionEvent): Float {
        val dx = e.getX(0) - e.getX(1); val dy = e.getY(0) - e.getY(1)
        return kotlin.math.sqrt(dx * dx + dy * dy)
    }

    private fun push() = host.photoOrbit(yaw, pitch, dist)

    override fun onBack() {
        host.photoMode(false)
        host.replaceTop(PhoneScreen(host, PhoneScreen.APP_CAMERA))
    }

    override fun onHidden() {
        host.photoMode(false)
    }
}
