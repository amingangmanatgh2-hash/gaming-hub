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
    override val dim = 0.25f

    override fun build(): View {
        val root = FrameLayout(ctx)
        val landscape = !portrait

        val column = Ui.vbox(ctx, Gravity.CENTER)
        column.setPadding(Ui.dp(20f), Ui.dp(16f), Ui.dp(20f), Ui.dp(16f))

        val title = Ui.glowTitle(ctx, "AMIN RACING", if (landscape) 40f else 44f, Ui.CYAN)
        title.letterSpacing = 0.06f
        column.addView(title, Ui.lp(Ui.WRAP))
        val title3d = Ui.glowTitle(ctx, "3D", if (landscape) 30f else 34f, Ui.PINK)
        title3d.letterSpacing = 0.3f
        column.addView(title3d, Ui.lp(Ui.WRAP, topDp = -10f))
        val sub = Ui.text(ctx, str(R.string.title_sub), 15f, Ui.TEXT, Ui.bold)
        sub.gravity = Gravity.CENTER
        column.addView(sub, Ui.lp(Ui.WRAP, bottomDp = 18f))

        // animated pulsing title glow
        val pulse = ValueAnimator.ofFloat(6f, 18f)
        pulse.duration = 1400
        pulse.repeatMode = ValueAnimator.REVERSE
        pulse.repeatCount = ValueAnimator.INFINITE
        pulse.addUpdateListener {
            val v = it.animatedValue as Float
            title.setShadowLayer(Ui.dp(v).toFloat(), 0f, 0f, Ui.CYAN)
            title3d.setShadowLayer(Ui.dp(v).toFloat(), 0f, 0f, Ui.PINK)
        }
        title.addOnAttachStateChangeListener(object : View.OnAttachStateChangeListener {
            override fun onViewAttachedToWindow(v: View) = pulse.start()
            override fun onViewDetachedFromWindow(v: View) = pulse.cancel()
        })

        val btnW = Ui.dp(if (landscape) 280f else 300f)
        val buttons = Ui.vbox(ctx)
        buttons.addView(Ui.button(ctx, str(R.string.menu_play), Ui.CYAN, true, 20f) { host.push(ModeSelectScreen(host)) },
            LinearLayout.LayoutParams(btnW, Ui.WRAP))
        val grid = if (landscape) Ui.hbox(ctx) else Ui.vbox(ctx)
        val items: List<Triple<Int, Int, () -> Unit>> = listOf(
            Triple(R.string.menu_garage, Ui.PINK, { host.push(GarageScreen(host)) }),
            Triple(R.string.menu_scores, Ui.YELLOW, { host.push(ScoresScreen(host)) }),
            Triple(R.string.menu_settings, Ui.GREEN, { host.push(SettingsScreen(host)) })
        )
        for ((label, color, action) in items) {
            val b = Ui.button(ctx, str(label), color, false, 16f, action)
            if (landscape) {
                val lp = LinearLayout.LayoutParams(0, Ui.WRAP, 1f)
                lp.marginStart = Ui.dp(4f); lp.marginEnd = Ui.dp(4f)
                grid.addView(b, lp)
            } else {
                grid.addView(b, LinearLayout.LayoutParams(btnW, Ui.WRAP).also { it.topMargin = Ui.dp(10f) })
            }
        }
        buttons.addView(grid, LinearLayout.LayoutParams(if (landscape) Ui.dp(460f) else btnW, Ui.WRAP).also { it.topMargin = Ui.dp(10f) })
        val exit = Ui.button(ctx, str(R.string.menu_exit), Ui.RED, false, 14f) {
            host.confirm(str(R.string.exit_confirm)) { host.exitGame() }
        }
        buttons.addView(exit, LinearLayout.LayoutParams(Ui.dp(160f), Ui.WRAP).also { it.topMargin = Ui.dp(14f) })
        column.addView(buttons, Ui.lp(Ui.WRAP))

        val scroll = ScrollView(ctx)
        scroll.isFillViewport = true
        scroll.isVerticalScrollBarEnabled = false
        scroll.addView(column, FrameLayout.LayoutParams(Ui.MATCH, Ui.WRAP))
        root.addView(scroll, FrameLayout.LayoutParams(Ui.MATCH, Ui.MATCH))

        // top bar: coins + best
        val top = Ui.hbox(ctx)
        top.setPadding(Ui.dp(14f), Ui.dp(12f), Ui.dp(14f), 0)
        val best = Ui.text(ctx, str(R.string.best_score_short) + ": " + Lang.num(save.highScore(save.selectedMode)), 13f, Ui.DIM, Ui.bold)
        top.addView(best, LinearLayout.LayoutParams(0, Ui.WRAP, 1f))
        top.addView(Ui.coinPill(ctx, save.coins))
        root.addView(top, FrameLayout.LayoutParams(Ui.MATCH, Ui.WRAP, Gravity.TOP))

        val ver = Ui.text(ctx, str(R.string.version) + "  •  " + str(R.string.credits), 10f, Ui.withAlpha(Ui.DIM, 0xAA))
        ver.gravity = Gravity.CENTER
        ver.setPadding(Ui.dp(8f), 0, Ui.dp(8f), Ui.dp(8f))
        root.addView(ver, FrameLayout.LayoutParams(Ui.MATCH, Ui.WRAP, Gravity.BOTTOM))

        staggerIn(column)
        return root
    }

    override fun onBack() {
        host.confirm(str(R.string.exit_confirm)) { host.exitGame() }
    }
}

// =====================================================================================
class ModeSelectScreen(host: GameHost) : Screen(host) {
    private var mode = save.selectedMode
    private var env = save.selectedEnv.let { if (save.isEnvUnlocked(it)) it else 0 }
    private var tod = save.selectedTod
    private val modeCards = ArrayList<View>()
    private val envCards = ArrayList<View>()

    override fun build(): View {
        modeCards.clear()
        envCards.clear()
        return buildPage()
    }

    private fun buildPage(): View = page(str(R.string.modes_title), 720f) { col ->
        // ---- modes
        col.addView(sectionTitle(str(R.string.modes_title)), Ui.lp())
        val modeRow = if (portrait) Ui.vbox(ctx) else Ui.hbox(ctx, Gravity.TOP)
        val modeColors = intArrayOf(Ui.CYAN, Ui.PINK, Ui.YELLOW)
        for (m in 0..2) {
            val card = Ui.vbox(ctx, Gravity.START)
            card.setPadding(Ui.dp(14f), Ui.dp(12f), Ui.dp(14f), Ui.dp(12f))
            val name = Ui.text(ctx, str(GameData.modeNames[m]), 18f, modeColors[m], Ui.black)
            card.addView(name)
            val desc = Ui.text(ctx, str(GameData.modeDescs[m]), 12.5f, Ui.TEXT)
            card.addView(desc, Ui.lp(topDp = 4f))
            val best = Ui.text(ctx, str(R.string.best) + ": " + Lang.num(save.highScore(m)), 11.5f, Ui.DIM, Ui.bold)
            card.addView(best, Ui.lp(topDp = 6f))
            card.isClickable = true
            Ui.pressable(card)
            card.setOnClickListener { host.sfx(AudioEngine.SFX_CLICK); mode = m; paintModes() }
            card.tag = modeColors[m]
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
        val envAccents = intArrayOf(0xFF5AA9FF.toInt(), 0xFFFFB347.toInt(), 0xFFE8F4FF.toInt(), 0xFF5EDB7C.toInt())
        val envBg = intArrayOf(0xFF1A2440.toInt(), 0xFF3D2A14.toInt(), 0xFF2A3A4E.toInt(), 0xFF143322.toInt())
        for (e in 0..3) {
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
            host.startRace()
        }
        col.addView(go, Ui.lp(topDp = 20f))
        staggerIn(col, 0L, 24f)
    }

    private fun paintModes() {
        for ((i, c) in modeCards.withIndex()) {
            val accent = c.tag as Int
            c.background = if (i == mode) Ui.gradient(Ui.withAlpha(accent, 0x44), Ui.withAlpha(accent, 0x14), accent, 16f)
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
        col.addView(Ui.segmented(ctx, GameData.modeNames.map { str(it) }, mode, Ui.YELLOW) {
            mode = it; fill()
        }, Ui.lp(topDp = 6f))
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
            info.addView(Ui.text(ctx, Lang.num(s.score), 18f, Ui.TEXT, Ui.bold))
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
        p.addView(Ui.button(ctx, str(R.string.restart), Ui.YELLOW, false, 16f) { host.restartRace() }, Ui.lp(topDp = 10f))
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
        p.addView(Ui.glowTitle(ctx, str(R.string.gameover_title), 28f, Ui.PINK), Ui.lp(Ui.WRAP))
        val reason = Ui.text(ctx, str(if (r.timeUp) R.string.time_up else R.string.crashed), 14f, Ui.DIM, Ui.bold)
        p.addView(reason, Ui.lp(Ui.WRAP, bottomDp = 6f))

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
        stat(R.string.distance, Lang.km(r.distance) + " " + str(R.string.km))
        stat(R.string.top_speed, Lang.num(r.topSpeed) + " " + str(R.string.kmh))
        stat(R.string.near_misses, Lang.num(r.nearMisses))
        stat(R.string.hud_combo, "×" + Lang.num(r.bestCombo))
        stat(R.string.coins_earned, "+" + Lang.num(r.coins), Ui.YELLOW)
        p.addView(stats, Ui.lp())

        p.addView(Ui.button(ctx, str(R.string.retry), Ui.GREEN, true, 19f) { host.restartRace() }, Ui.lp(topDp = 6f))
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
