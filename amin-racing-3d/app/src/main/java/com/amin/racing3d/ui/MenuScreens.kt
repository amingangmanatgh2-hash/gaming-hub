package com.amin.racing3d.ui

import android.animation.ValueAnimator
import android.graphics.drawable.GradientDrawable
import android.view.Gravity
import android.view.View
import android.view.animation.DecelerateInterpolator
import android.view.animation.OvershootInterpolator
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ScrollView
import com.amin.racing3d.R
import com.amin.racing3d.audio.AudioEngine
import com.amin.racing3d.core.Lang
import com.amin.racing3d.game.GameData
import com.amin.racing3d.game.World

/** Animates children of a container in one after another. */
internal fun staggerIn(group: LinearLayout, startDelay: Long = 60L, fromY: Float = 40f) {
    for (i in 0 until group.childCount) {
        val c = group.getChildAt(i)
        c.alpha = 0f
        c.translationY = Ui.dp(fromY).toFloat()
        c.animate().alpha(1f).translationY(0f).setStartDelay(startDelay + i * 55L)
            .setDuration(420).setInterpolator(DecelerateInterpolator(2f)).start()
    }
}

// =====================================================================================
class MainMenuScreen(host: GameHost) : Screen(host) {
    override val dim = 0.0f

    override fun build(): View {
        val root = FrameLayout(ctx)
        // soft gradients at the screen edges keep the menus readable over the live 3D scene
        val shadeL = View(ctx)
        // multi-stop gradients so the shade fades out without a visible edge
        val fade = intArrayOf(0xD0050812.toInt(), 0x9A050812.toInt(), 0x4A050812, 0x14050812, 0x00050812)
        shadeL.background = GradientDrawable(GradientDrawable.Orientation.LEFT_RIGHT, fade)
        root.addView(shadeL, FrameLayout.LayoutParams(Ui.dp(400f), Ui.MATCH, Gravity.LEFT))
        val shadeR = View(ctx)
        shadeR.background = GradientDrawable(GradientDrawable.Orientation.RIGHT_LEFT, fade)
        root.addView(shadeR, FrameLayout.LayoutParams(Ui.dp(320f), Ui.MATCH, Gravity.RIGHT))
        val shadeT = View(ctx)
        shadeT.background = GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM, intArrayOf(0xAA050812.toInt(), 0x00050812))
        root.addView(shadeT, FrameLayout.LayoutParams(Ui.MATCH, Ui.dp(90f), Gravity.TOP))

        // ---- top bar: profile card · logo · coins
        val top = Ui.hbox(ctx)
        top.setPadding(Ui.dp(14f), Ui.dp(10f), Ui.dp(14f), 0)
        top.addView(profileCard(), LinearLayout.LayoutParams(Ui.WRAP, Ui.WRAP))
        val logo = Ui.vbox(ctx, Gravity.CENTER)
        val title = Ui.glowTitle(ctx, "AMIN RACING", 24f, Ui.CYAN)
        title.letterSpacing = 0.08f
        logo.addView(title, Ui.lp(Ui.WRAP))
        val t3 = Ui.glowTitle(ctx, "3D", 16f, Ui.PINK)
        t3.letterSpacing = 0.4f
        logo.addView(t3, Ui.lp(Ui.WRAP, topDp = -6f))
        top.addView(logo, LinearLayout.LayoutParams(0, Ui.WRAP, 1f))
        top.addView(Ui.coinPill(ctx, save.coins))
        root.addView(top, FrameLayout.LayoutParams(Ui.MATCH, Ui.WRAP, Gravity.TOP))
        val pulse = ValueAnimator.ofFloat(4f, 14f)
        pulse.duration = 1500
        pulse.repeatMode = ValueAnimator.REVERSE
        pulse.repeatCount = ValueAnimator.INFINITE
        pulse.addUpdateListener {
            val v = it.animatedValue as Float
            title.setShadowLayer(Ui.dp(v).toFloat(), 0f, 0f, Ui.CYAN)
            t3.setShadowLayer(Ui.dp(v).toFloat(), 0f, 0f, Ui.PINK)
        }
        title.addOnAttachStateChangeListener(object : View.OnAttachStateChangeListener {
            override fun onViewAttachedToWindow(v: View) = pulse.start()
            override fun onViewDetachedFromWindow(v: View) = pulse.cancel()
        })

        // ---- start side: game modes (only modes that are implemented and playable)
        val modes = Ui.vbox(ctx, Gravity.START)
        val groups = arrayOf(
            Triple(R.string.menu_traffic, R.string.menu_traffic_sub, intArrayOf(GameData.MODE_TWO_WAY, GameData.MODE_ENDLESS, GameData.MODE_CHALLENGE)),
            Triple(R.string.mode_street, R.string.menu_street_sub, intArrayOf(GameData.MODE_STREET)),
            Triple(R.string.mode_drift, R.string.menu_drift_sub, intArrayOf(GameData.MODE_DRIFT)),
            Triple(R.string.menu_time_trial, R.string.menu_time_trial_sub, intArrayOf(GameData.MODE_TIME_TRIAL, GameData.MODE_TIME_ATTACK)),
            Triple(R.string.mode_police, R.string.menu_police_sub, intArrayOf(GameData.MODE_POLICE)),
            Triple(R.string.mode_free, R.string.menu_free_sub, intArrayOf(GameData.MODE_FREE))
        )
        val accents = intArrayOf(Ui.CYAN, Ui.PINK, 0xFFB388FF.toInt(), Ui.YELLOW, Ui.RED, Ui.GREEN)
        for ((i, g) in groups.withIndex()) {
            modes.addView(modeCard(g.first, g.second, accents[i]) {
                if (save.selectedMode !in g.third) save.selectedMode = g.third[0]
                host.push(ModeSelectScreen(host, g.third, g.first))
            }, Ui.lp(Ui.dp(262f), topDp = if (i == 0) 0f else 7f))
        }
        val modesScroll = ScrollView(ctx)
        modesScroll.isVerticalScrollBarEnabled = false
        modesScroll.addView(modes, FrameLayout.LayoutParams(Ui.WRAP, Ui.WRAP))
        val mlp = FrameLayout.LayoutParams(Ui.WRAP, Ui.WRAP, Gravity.START or Gravity.CENTER_VERTICAL)
        mlp.marginStart = Ui.dp(16f); mlp.topMargin = Ui.dp(40f)
        root.addView(modesScroll, mlp)

        // ---- end side: garage / scores / settings / exit
        val side = Ui.vbox(ctx, Gravity.END)
        val bw = Ui.dp(190f)
        side.addView(Ui.button(ctx, str(R.string.menu_garage), Ui.PINK, true, 17f) { host.push(GarageScreen(host)) }, LinearLayout.LayoutParams(bw, Ui.WRAP))
        side.addView(Ui.button(ctx, str(R.string.menu_scores), Ui.YELLOW, false, 15f) { host.push(ScoresScreen(host)) }, LinearLayout.LayoutParams(bw, Ui.WRAP).also { it.topMargin = Ui.dp(10f) })
        side.addView(Ui.button(ctx, str(R.string.menu_settings), Ui.GREEN, false, 15f) { host.push(SettingsScreen(host)) }, LinearLayout.LayoutParams(bw, Ui.WRAP).also { it.topMargin = Ui.dp(10f) })
        side.addView(Ui.button(ctx, str(R.string.menu_exit), Ui.RED, false, 13f) {
            host.confirm(str(R.string.exit_confirm)) { host.exitGame() }
        }, LinearLayout.LayoutParams(Ui.dp(130f), Ui.WRAP).also { it.topMargin = Ui.dp(16f) })
        val slp = FrameLayout.LayoutParams(Ui.WRAP, Ui.WRAP, Gravity.END or Gravity.CENTER_VERTICAL)
        slp.marginEnd = Ui.dp(16f); slp.topMargin = Ui.dp(40f)
        root.addView(side, slp)

        // ---- bottom centre: selected car
        val car = if (save.isCarOwned(save.selectedCar)) save.selectedCar else 0
        val carBox = Ui.vbox(ctx, Gravity.CENTER)
        carBox.setPadding(Ui.dp(18f), Ui.dp(6f), Ui.dp(18f), Ui.dp(6f))
        carBox.background = Ui.bg(Ui.withAlpha(0xFF0D1424.toInt(), 0xB0), Ui.withAlpha(Ui.CYAN, 0x44), 12f, 1f)
        carBox.addView(Ui.text(ctx, str(R.string.selected_car), 11f, Ui.DIM, Ui.bold))
        carBox.addView(Ui.text(ctx, str(GameData.cars[car].nameRes), 18f, Ui.TEXT, Ui.bold))
        val clp = FrameLayout.LayoutParams(Ui.WRAP, Ui.WRAP, Gravity.BOTTOM or Gravity.CENTER_HORIZONTAL)
        clp.bottomMargin = Ui.dp(26f)
        root.addView(carBox, clp)

        val ver = Ui.text(ctx, str(R.string.version), 10f, Ui.withAlpha(Ui.DIM, 0xAA))
        ver.setPadding(Ui.dp(10f), 0, Ui.dp(10f), Ui.dp(6f))
        root.addView(ver, FrameLayout.LayoutParams(Ui.WRAP, Ui.WRAP, Gravity.BOTTOM or Gravity.CENTER_HORIZONTAL))

        // entrance animation: side columns slide in from their edges
        val dir = if (Lang.isFa) -1f else 1f
        modesScroll.translationX = -dir * Ui.dp(60f); modesScroll.alpha = 0f
        modesScroll.animate().translationX(0f).alpha(1f).setDuration(420).setStartDelay(80).start()
        side.translationX = dir * Ui.dp(60f); side.alpha = 0f
        side.animate().translationX(0f).alpha(1f).setDuration(420).setStartDelay(160).start()
        carBox.alpha = 0f; carBox.translationY = Ui.dp(20f).toFloat()
        carBox.animate().alpha(1f).translationY(0f).setDuration(400).setStartDelay(260).start()
        return root
    }

    private fun profileCard(): View {
        val card = Ui.hbox(ctx)
        card.setPadding(Ui.dp(8f), Ui.dp(6f), Ui.dp(14f), Ui.dp(6f))
        card.background = Ui.bg(Ui.withAlpha(0xFF0D1424.toInt(), 0xC8), Ui.withAlpha(Ui.CYAN, 0x55), 22f, 1f)
        val badge = Ui.text(ctx, Lang.num(save.level()), 16f, Ui.BG, Ui.bold)
        badge.gravity = Gravity.CENTER
        badge.background = Ui.gradient(Ui.CYAN, Ui.PINK, 0, 20f)
        card.addView(badge, LinearLayout.LayoutParams(Ui.dp(36f), Ui.dp(36f)))
        val info = Ui.vbox(ctx, Gravity.START)
        // relative padding: the gap sits between badge and text in both RTL and LTR
        info.setPaddingRelative(Ui.dp(10f), 0, 0, 0)
        info.addView(Ui.text(ctx, str(R.string.player_default) + "  •  " + str(R.string.level_short) + " " + Lang.num(save.level()), 12f, Ui.TEXT, Ui.bold))
        info.addView(Ui.statBar(ctx, save.levelProgress(), Ui.CYAN), LinearLayout.LayoutParams(Ui.dp(120f), Ui.dp(6f)).also { it.topMargin = Ui.dp(4f) })
        card.addView(info)
        return card
    }

    private fun modeCard(title: Int, sub: Int, accent: Int, onClick: () -> Unit): View {
        val card = Ui.vbox(ctx, Gravity.START)
        card.setPadding(Ui.dp(14f), Ui.dp(6f), Ui.dp(14f), Ui.dp(7f))
        card.background = Ui.gradient(Ui.withAlpha(accent, 0x38), Ui.withAlpha(0xFF0D1424.toInt(), 0xD8), Ui.withAlpha(accent, 0xAA), 14f,
            GradientDrawable.Orientation.LEFT_RIGHT)
        val t = Ui.text(ctx, str(title), 16f, accent, Ui.bold)
        card.addView(t)
        card.addView(Ui.text(ctx, str(sub), 10.5f, Ui.DIM))
        card.isClickable = true
        card.setOnClickListener { Ui.onClickSound?.invoke(); onClick() }
        Ui.pressable(card)
        return card
    }

    override fun onBack() {
        host.confirm(str(R.string.exit_confirm)) { host.exitGame() }
    }
}

internal val MEDALS = arrayOf("", "🥉", "🥈", "🥇")

class ModeSelectScreen(
    host: GameHost,
    private val modes: IntArray = intArrayOf(GameData.MODE_TWO_WAY, GameData.MODE_ENDLESS, GameData.MODE_CHALLENGE),
    private val titleRes: Int = R.string.modes_title
) : Screen(host) {
    private var mode = save.selectedMode.let { if (it in modes) it else modes[0] }
    private var env = save.selectedEnv.let { if (it in GameData.envs.indices && save.isEnvUnlocked(it)) it else 0 }
    private var tod = save.selectedTod
    private var weather = save.selectedWeather
    private val modeCards = ArrayList<View>()
    private val envCards = ArrayList<View>()

    override fun build(): View {
        modeCards.clear()
        envCards.clear()
        return buildPage()
    }

    private fun bestText(m: Int): String {
        val medal = save.bestMedal(m)
        val medalStr = if (medal > 0) "   " + MEDALS[medal] else ""
        return when (m) {
            GameData.MODE_FREE -> str(R.string.free_note)
            GameData.MODE_TIME_TRIAL -> str(R.string.best) + ": " + (if (save.highScore(m) > 0) Lang.num(save.highScore(m) / 10) + " " + str(R.string.kmh_avg) else "—") + medalStr
            else -> str(R.string.best) + ": " + Lang.num(save.highScore(m)) + medalStr
        }
    }

    private fun objectiveText(m: Int): String {
        val c = GameData.defaultConfig(m, 0, 0, 0)
        return when (m) {
            GameData.MODE_STREET -> str(R.string.obj_street, Lang.km(c.goal))
            GameData.MODE_DRIFT -> str(R.string.obj_drift, Lang.num(c.timeLimit.toInt()), Lang.num(c.gold.toInt()))
            GameData.MODE_TIME_TRIAL -> str(R.string.obj_trial, Lang.km(c.goal), Lang.num(c.gold.toInt()))
            GameData.MODE_POLICE -> str(R.string.obj_police)
            GameData.MODE_CHALLENGE -> str(R.string.obj_challenge, Lang.num(c.gold.toInt()), Lang.num(c.timeLimit.toInt()))
            else -> ""
        }
    }

    private fun buildPage(): View = page(str(titleRes), 760f) { col ->
        // ---- modes
        col.addView(sectionTitle(str(R.string.modes_title)), Ui.lp())
        val modeRow = if (portrait) Ui.vbox(ctx) else Ui.hbox(ctx, Gravity.TOP)
        val palette = intArrayOf(Ui.CYAN, Ui.PINK, Ui.YELLOW)
        for ((idx, m) in modes.withIndex()) {
            val modeColors = palette
            val card = Ui.vbox(ctx, Gravity.START)
            card.setPadding(Ui.dp(14f), Ui.dp(12f), Ui.dp(14f), Ui.dp(12f))
            val accent = modeColors[idx % modeColors.size]
            val name = Ui.text(ctx, str(GameData.modeNames[m]), 18f, accent, Ui.black)
            card.addView(name)
            val desc = Ui.text(ctx, str(GameData.modeDescs[m]), 12.5f, Ui.TEXT)
            card.addView(desc, Ui.lp(topDp = 4f))
            val obj = objectiveText(m)
            if (obj.isNotEmpty()) card.addView(Ui.text(ctx, obj, 11.5f, Ui.withAlpha(accent, 0xDD), Ui.bold), Ui.lp(topDp = 4f))
            val best = Ui.text(ctx, bestText(m), 11.5f, Ui.DIM, Ui.bold)
            card.addView(best, Ui.lp(topDp = 6f))
            card.isClickable = true
            Ui.pressable(card)
            card.setOnClickListener { host.sfx(AudioEngine.SFX_CLICK); mode = m; paintModes() }
            card.tag = accent
            modeCards.add(card)
            val lp = if (portrait) Ui.lp(topDp = 6f) else LinearLayout.LayoutParams(0, Ui.MATCH, 1f).also {
                it.marginStart = Ui.dp(4f); it.marginEnd = Ui.dp(4f)
            }
            modeRow.addView(card, lp)
        }
        col.addView(modeRow, Ui.lp())
        paintModes()

        // ---- environments
        col.addView(sectionTitle(str(R.string.env_title)), Ui.lp())
        val envGrid = Ui.vbox(ctx)
        var row: LinearLayout? = null
        val perRow = if (portrait) 2 else 4
        val envAccents = intArrayOf(0xFF5AA9FF.toInt(), 0xFFFFB347.toInt(), 0xFFE8F4FF.toInt(), 0xFF5EDB7C.toInt(),
            0xFF4FE3D6.toInt(), 0xFFC9A27A.toInt(), 0xFFB9C6D8.toInt())
        val envBg = intArrayOf(0xFF1A2440.toInt(), 0xFF3D2A14.toInt(), 0xFF2A3A4E.toInt(), 0xFF143322.toInt(),
            0xFF0F3A40.toInt(), 0xFF33302C.toInt(), 0xFF27303C.toInt())
        for (e in GameData.envs.indices) {
            if (e % perRow == 0) {
                row = Ui.hbox(ctx)
                envGrid.addView(row, Ui.lp(topDp = 6f))
            }
            val spec = GameData.envs[e]
            val card = Ui.vbox(ctx, Gravity.CENTER)
            card.setPadding(Ui.dp(10f), Ui.dp(14f), Ui.dp(10f), Ui.dp(14f))
            card.tag = intArrayOf(envAccents[e], envBg[e])
            val name = Ui.text(ctx, str(spec.nameRes), 17f, envAccents[e], Ui.black)
            name.gravity = Gravity.CENTER
            card.addView(name)
            val unlocked = save.isEnvUnlocked(e)
            val status = Ui.text(ctx, if (unlocked) "✓" else "🔒 " + Lang.num(spec.price), 12f, if (unlocked) Ui.GREEN else Ui.YELLOW, Ui.bold)
            status.gravity = Gravity.CENTER
            card.addView(status, Ui.lp(topDp = 2f))
            card.isClickable = true
            Ui.pressable(card)
            card.setOnClickListener {
                host.sfx(AudioEngine.SFX_CLICK)
                if (save.isEnvUnlocked(e)) {
                    env = e; paintEnvs()
                } else {
                    host.confirm(str(R.string.unlock_for, Lang.num(spec.price)) + "  (" + str(spec.nameRes) + ")") {
                        if (save.spend(spec.price)) {
                            save.unlockEnv(e)
                            host.sfx(AudioEngine.SFX_BUY)
                            host.toast(str(spec.nameRes) + " " + str(R.string.unlocked_msg), Ui.GREEN)
                            env = e
                            status.text = "✓"
                            status.setTextColor(Ui.GREEN)
                            refreshCoins()
                            paintEnvs()
                        } else {
                            host.toast(str(R.string.not_enough_coins), Ui.RED)
                        }
                    }
                }
            }
            envCards.add(card)
            row!!.addView(card, LinearLayout.LayoutParams(0, Ui.WRAP, 1f).also {
                it.marginStart = Ui.dp(4f); it.marginEnd = Ui.dp(4f)
            })
        }
        col.addView(envGrid, Ui.lp())
        paintEnvs()

        // ---- time of day
        col.addView(sectionTitle(str(R.string.tod_title)), Ui.lp())
        val todOpts = GameData.todNames.map { str(it) }
        col.addView(Ui.segmented(ctx, todOpts, tod, Ui.YELLOW) { tod = it }, Ui.lp())

        // ---- weather (affects grip, visibility, lighting and sound)
        col.addView(sectionTitle(str(R.string.w_title)), Ui.lp())
        val wOpts = GameData.weatherNames.map { str(it) }
        col.addView(Ui.segmented(ctx, wOpts, weather, Ui.CYAN) { weather = it }, Ui.lp())
        col.addView(Ui.text(ctx, str(if (modes.contains(GameData.MODE_FREE)) R.string.w_note_free else R.string.w_note), 11f, Ui.DIM), Ui.lp(topDp = 4f))

        // ---- car
        col.addView(sectionTitle(str(R.string.garage_title)), Ui.lp())
        val carRow = Ui.hbox(ctx)
        carRow.background = Ui.bg(Ui.PANEL_LIGHT, Ui.withAlpha(Ui.PINK, 0x55), 16f, 1f)
        carRow.setPadding(Ui.dp(14f), Ui.dp(10f), Ui.dp(14f), Ui.dp(10f))
        val swatch = View(ctx)
        swatch.background = GradientDrawable().apply {
            shape = GradientDrawable.OVAL
            setColor(save.paintColor(save.selectedCar))
            setStroke(Ui.dp(2f), Ui.TEXT)
        }
        carRow.addView(swatch, LinearLayout.LayoutParams(Ui.dp(22f), Ui.dp(22f)))
        val carName = Ui.text(ctx, str(GameData.cars[save.selectedCar].nameRes), 17f, Ui.TEXT, Ui.bold)
        carName.setPadding(Ui.dp(10f), 0, Ui.dp(10f), 0)
        carRow.addView(carName, LinearLayout.LayoutParams(0, Ui.WRAP, 1f))
        carRow.addView(Ui.button(ctx, str(R.string.menu_garage), Ui.PINK, false, 14f) { host.push(GarageScreen(host)) })
        col.addView(carRow, Ui.lp())

        // ---- go
        val go = Ui.button(ctx, str(R.string.start_race), Ui.GREEN, true, 22f) {
            save.selectedMode = mode
            save.selectedEnv = env
            save.selectedTod = tod
            save.selectedWeather = weather
            host.startRace()
        }
        col.addView(go, Ui.lp(topDp = 20f))
        staggerIn(col, 0L, 24f)
    }

    private fun paintModes() {
        for ((i, c) in modeCards.withIndex()) {
            val accent = c.tag as Int
            c.background = if (modes[i] == mode) Ui.gradient(Ui.withAlpha(accent, 0x44), Ui.withAlpha(accent, 0x14), accent, 16f)
            else Ui.bg(Ui.PANEL_LIGHT, Ui.withAlpha(accent, 0x33), 16f, 1f)
        }
    }

    private fun paintEnvs() {
        for ((i, c) in envCards.withIndex()) {
            val t = c.tag as IntArray
            val unlocked = save.isEnvUnlocked(i)
            c.background = if (i == env) Ui.gradient(Ui.withAlpha(t[1], 0xFF), Ui.withAlpha(t[0], 0x55), t[0], 16f)
            else Ui.bg(Ui.withAlpha(t[1], 0xBB), Ui.withAlpha(t[0], 0x33), 16f, 1f)
            c.alpha = if (unlocked) 1f else 0.75f
        }
    }
}

// =====================================================================================
class ScoresScreen(host: GameHost) : Screen(host) {
    private var mode = save.selectedMode
    private lateinit var list: LinearLayout

    override fun build(): View = page(str(R.string.scores_title)) { col ->
        // nine modes: natural-width tabs in a horizontal scroller
        val seg = Ui.segmented(ctx, GameData.modeNames.map { str(it) }, mode.coerceIn(0, GameData.NUM_MODES - 1), Ui.YELLOW) {
            mode = it; fill()
        }
        for (i in 0 until seg.childCount) seg.getChildAt(i).layoutParams = LinearLayout.LayoutParams(Ui.WRAP, Ui.WRAP)
        val hs = android.widget.HorizontalScrollView(ctx)
        hs.isHorizontalScrollBarEnabled = false
        hs.addView(seg, FrameLayout.LayoutParams(Ui.WRAP, Ui.WRAP))
        col.addView(hs, Ui.lp(topDp = 6f))
        list = Ui.vbox(ctx)
        col.addView(list, Ui.lp(topDp = 10f))
        fill()
    }

    private fun fill() {
        list.removeAllViews()
        val scores = save.scores(mode)
        if (scores.isEmpty()) {
            val t = Ui.text(ctx, str(R.string.no_scores), 15f, Ui.DIM, Ui.bold)
            t.gravity = Gravity.CENTER
            t.setPadding(0, Ui.dp(40f), 0, Ui.dp(40f))
            list.addView(t, Ui.lp())
            return
        }
        val medal = intArrayOf(Ui.YELLOW, 0xFFC0CCE0.toInt(), 0xFFE08A4A.toInt())
        for ((i, s) in scores.withIndex()) {
            val row = Ui.hbox(ctx)
            val accent = if (i < 3) medal[i] else Ui.CYAN
            row.background = Ui.bg(if (i == 0) Ui.withAlpha(Ui.YELLOW, 0x22) else Ui.PANEL_LIGHT, Ui.withAlpha(accent, if (i < 3) 0x99 else 0x33), 14f, 1f)
            row.setPadding(Ui.dp(14f), Ui.dp(10f), Ui.dp(14f), Ui.dp(10f))
            val rank = Ui.text(ctx, Lang.digits("${i + 1}"), 20f, accent, Ui.black)
            rank.gravity = Gravity.CENTER
            row.addView(rank, LinearLayout.LayoutParams(Ui.dp(36f), Ui.WRAP))
            val info = Ui.vbox(ctx, Gravity.START)
            val shown = if (mode == GameData.MODE_TIME_TRIAL) Lang.num(s.score / 10) + " " + str(R.string.kmh_avg) else Lang.num(s.score)
            info.addView(Ui.text(ctx, shown, 18f, Ui.TEXT, Ui.bold))
            val car = if (s.car in GameData.cars.indices) str(GameData.cars[s.car].nameRes) else ""
            val env = if (s.env in GameData.envs.indices) str(GameData.envs[s.env].nameRes) else ""
            info.addView(Ui.text(ctx, "$car • $env", 12f, Ui.DIM))
            row.addView(info, LinearLayout.LayoutParams(0, Ui.WRAP, 1f))
            val dist = Ui.text(ctx, Lang.km(s.distance.toFloat()) + " " + str(R.string.km), 13f, Ui.CYAN, Ui.bold)
            row.addView(dist)
            list.addView(row, Ui.lp(topDp = 6f))
        }
        staggerIn(list, 0L, 20f)
    }
}

// =====================================================================================
class PauseScreen(host: GameHost) : Screen(host) {
    override val dim = 0.55f

    override fun build(): View {
        val root = FrameLayout(ctx)
        val p = Ui.panel(ctx, true, Ui.withAlpha(Ui.CYAN, 0x88))
        p.gravity = Gravity.CENTER_HORIZONTAL
        p.addView(Ui.glowTitle(ctx, str(R.string.pause_title), 30f), Ui.lp(Ui.WRAP, bottomDp = 14f))
        p.addView(Ui.button(ctx, str(R.string.resume), Ui.GREEN, true, 19f) { host.resumeRace() }, Ui.lp())
        if (save.selectedMode == GameData.MODE_FREE) {
            // free roam: change car on the spot, or end the drive and collect the rewards
            p.addView(Ui.text(ctx, str(R.string.pause_change_car), 13f, Ui.CYAN, Ui.bold), Ui.lp(Ui.WRAP, topDp = 12f))
            val cars = Ui.hbox(ctx)
            for (c in GameData.cars.indices) {
                if (!save.isCarOwned(c)) continue
                val b = Ui.button(ctx, str(GameData.cars[c].nameRes), if (c == save.selectedCar) Ui.PINK else Ui.CYAN, c == save.selectedCar, 12f) {
                    if (c != save.selectedCar) host.swapCar(c) else host.resumeRace()
                }
                cars.addView(b, LinearLayout.LayoutParams(Ui.WRAP, Ui.WRAP).also { it.marginEnd = Ui.dp(6f) })
            }
            val hs = android.widget.HorizontalScrollView(ctx)
            hs.isHorizontalScrollBarEnabled = false
            hs.addView(cars)
            p.addView(hs, Ui.lp(topDp = 6f))
            p.addView(Ui.button(ctx, str(R.string.pause_end_drive), Ui.YELLOW, false, 16f) { host.endFreeRoam() }, Ui.lp(topDp = 12f))
        } else {
            p.addView(Ui.button(ctx, str(R.string.restart), Ui.YELLOW, false, 16f) { host.restartRace() }, Ui.lp(topDp = 10f))
        }
        p.addView(Ui.button(ctx, str(R.string.menu_settings), Ui.CYAN, false, 16f) { host.push(SettingsScreen(host)) }, Ui.lp(topDp = 10f))
        p.addView(Ui.button(ctx, str(R.string.main_menu), Ui.RED, false, 16f) { host.quitToMenu() }, Ui.lp(topDp = 10f))
        val scroll = ScrollView(ctx)
        scroll.isFillViewport = true
        val holder = FrameLayout(ctx)
        holder.addView(p, FrameLayout.LayoutParams(minOf(Ui.dp(340f), ctx.resources.displayMetrics.widthPixels - Ui.dp(32f)), Ui.WRAP, Gravity.CENTER))
        scroll.addView(holder, FrameLayout.LayoutParams(Ui.MATCH, Ui.MATCH))
        root.addView(scroll, FrameLayout.LayoutParams(Ui.MATCH, Ui.MATCH))
        p.scaleX = 0.85f; p.scaleY = 0.85f; p.alpha = 0f
        p.animate().scaleX(1f).scaleY(1f).alpha(1f).setDuration(260).setInterpolator(OvershootInterpolator(1.6f)).start()
        return root
    }

    override fun onBack() = host.resumeRace()
}

// =====================================================================================
class GameOverScreen(host: GameHost, private val r: RunResult) : Screen(host) {
    override val dim = 0.5f

    override fun build(): View {
        val root = FrameLayout(ctx)
        val p = Ui.panel(ctx, true, Ui.withAlpha(if (r.newRecord) Ui.YELLOW else Ui.PINK, 0x99))
        p.gravity = Gravity.CENTER_HORIZONTAL
        val titleRes = when {
            r.reason == World.REASON_BUSTED -> R.string.busted
            r.mode == GameData.MODE_FREE -> R.string.drive_over
            r.reason == World.REASON_FINISH || (r.success && r.reason == World.REASON_TIME) -> R.string.finished
            else -> R.string.gameover_title
        }
        p.addView(Ui.glowTitle(ctx, str(titleRes), 28f, if (r.success) Ui.GREEN else Ui.PINK), Ui.lp(Ui.WRAP))
        val reasonRes = when {
            r.reason == World.REASON_BUSTED -> R.string.busted_sub
            r.mode == GameData.MODE_STREET && r.success -> 0
            r.mode == GameData.MODE_STREET -> R.string.dnf
            r.mode == GameData.MODE_TIME_TRIAL && !r.success -> R.string.dnf
            r.reason == World.REASON_FINISH -> 0
            r.timeUp -> R.string.time_up
            else -> R.string.crashed
        }
        if (reasonRes != 0) p.addView(Ui.text(ctx, str(reasonRes), 14f, Ui.DIM, Ui.bold), Ui.lp(Ui.WRAP, bottomDp = 6f))
        if (r.mode == GameData.MODE_STREET && r.success) {
            p.addView(Ui.glowTitle(ctx, str(R.string.res_place, Lang.num(r.position), Lang.num(r.racers)), 22f, if (r.position == 1) Ui.YELLOW else Ui.TEXT), Ui.lp(Ui.WRAP, bottomDp = 4f))
        }
        if (r.medal > 0) {
            val medalNames = intArrayOf(0, R.string.medal_bronze, R.string.medal_silver, R.string.medal_gold)
            val medalColors = intArrayOf(0, 0xFFCD7F32.toInt(), 0xFFC0C8D4.toInt(), Ui.YELLOW)
            p.addView(Ui.text(ctx, MEDALS[r.medal] + "  " + str(medalNames[r.medal]), 18f, medalColors[r.medal], Ui.black), Ui.lp(Ui.WRAP, bottomDp = 4f))
        }

        p.addView(Ui.text(ctx, str(R.string.score), 13f, Ui.DIM), Ui.lp(Ui.WRAP))
        val score = Ui.glowTitle(ctx, Lang.num(0), 42f, Ui.TEXT)
        p.addView(score, Ui.lp(Ui.WRAP))
        val counter = ValueAnimator.ofInt(0, r.score)
        counter.duration = 1100
        counter.interpolator = DecelerateInterpolator(2f)
        counter.addUpdateListener { score.text = Lang.num(it.animatedValue as Int) }
        counter.start()

        if (r.newRecord) {
            val rec = Ui.text(ctx, "★ " + str(R.string.new_record) + " ★", 16f, Ui.BG, Ui.black)
            rec.background = Ui.gradient(Ui.YELLOW, 0xFFFF9F1A.toInt(), 0, 14f, GradientDrawable.Orientation.LEFT_RIGHT)
            rec.setPadding(Ui.dp(16f), Ui.dp(4f), Ui.dp(16f), Ui.dp(4f))
            p.addView(rec, Ui.lp(Ui.WRAP, topDp = 4f))
            val pulse = ValueAnimator.ofFloat(1f, 1.08f)
            pulse.duration = 520
            pulse.repeatMode = ValueAnimator.REVERSE
            pulse.repeatCount = 7
            pulse.addUpdateListener { val v = it.animatedValue as Float; rec.scaleX = v; rec.scaleY = v }
            pulse.start()
        } else {
            p.addView(Ui.text(ctx, str(R.string.best) + ": " + Lang.num(r.best), 13f, Ui.YELLOW, Ui.bold), Ui.lp(Ui.WRAP, topDp = 2f))
        }

        val stats = Ui.vbox(ctx)
        stats.setPadding(0, Ui.dp(10f), 0, Ui.dp(6f))
        fun stat(label: Int, value: String, color: Int = Ui.TEXT) {
            val row = Ui.hbox(ctx)
            row.setPadding(Ui.dp(4f), Ui.dp(4f), Ui.dp(4f), Ui.dp(4f))
            row.addView(Ui.text(ctx, str(label), 14f, Ui.DIM), LinearLayout.LayoutParams(0, Ui.WRAP, 1f))
            row.addView(Ui.text(ctx, value, 15f, color, Ui.bold))
            stats.addView(row, Ui.lp())
        }
        if (r.mode == GameData.MODE_TIME_TRIAL || r.mode == GameData.MODE_STREET) {
            val t = (r.raceTime * 10f).toInt()
            stat(R.string.res_time, Lang.num(t / 600) + ":" + Lang.num((t / 10) % 60).padStart(2, if (Lang.isFa) '۰' else '0') + "." + Lang.num(t % 10))
        }
        if (r.mode == GameData.MODE_POLICE) {
            stat(R.string.res_escapes, Lang.num(r.escapes), Ui.GREEN)
            stat(R.string.res_takedowns, Lang.num(r.takedowns), Ui.PINK)
        }
        stat(R.string.distance, Lang.km(r.distance) + " " + str(R.string.km))
        stat(R.string.top_speed, Lang.num(r.topSpeed) + " " + str(R.string.kmh))
        stat(R.string.near_misses, Lang.num(r.nearMisses))
        stat(R.string.hud_combo, "×" + Lang.num(r.bestCombo))
        stat(R.string.coins_earned, "+" + Lang.num(r.coins), Ui.YELLOW)
        p.addView(stats, Ui.lp())

        p.addView(Ui.button(ctx, str(if (r.mode == GameData.MODE_FREE) R.string.drive_again else R.string.retry), Ui.GREEN, true, 19f) { host.restartRace() }, Ui.lp(topDp = 6f))
        val row = Ui.hbox(ctx)
        val lp1 = LinearLayout.LayoutParams(0, Ui.WRAP, 1f).also { it.marginEnd = Ui.dp(5f) }
        val lp2 = LinearLayout.LayoutParams(0, Ui.WRAP, 1f).also { it.marginStart = Ui.dp(5f) }
        row.addView(Ui.button(ctx, str(R.string.menu_garage), Ui.PINK, false, 15f) {
            host.quitToMenu(); host.push(GarageScreen(host))
        }, lp1)
        row.addView(Ui.button(ctx, str(R.string.main_menu), Ui.CYAN, false, 15f) { host.quitToMenu() }, lp2)
        p.addView(row, Ui.lp(topDp = 10f))

        val scroll = ScrollView(ctx)
        scroll.isFillViewport = true
        scroll.isVerticalScrollBarEnabled = false
        val holder = FrameLayout(ctx)
        holder.setPadding(0, Ui.dp(16f), 0, Ui.dp(16f))
        holder.addView(p, FrameLayout.LayoutParams(minOf(Ui.dp(380f), ctx.resources.displayMetrics.widthPixels - Ui.dp(28f)), Ui.WRAP, Gravity.CENTER))
        scroll.addView(holder, FrameLayout.LayoutParams(Ui.MATCH, Ui.WRAP))
        root.addView(scroll, FrameLayout.LayoutParams(Ui.MATCH, Ui.MATCH))
        p.translationY = Ui.dp(60f).toFloat(); p.alpha = 0f
        p.animate().translationY(0f).alpha(1f).setDuration(380).setInterpolator(DecelerateInterpolator(2f)).start()
        return root
    }

    override fun onBack() = host.quitToMenu()
}
