package com.amin.racing3d.ui

import android.animation.ValueAnimator
import android.graphics.drawable.GradientDrawable
import android.view.Gravity
import android.view.View
import android.view.animation.DecelerateInterpolator
import android.view.animation.OvershootInterpolator
import android.text.TextUtils
import android.widget.FrameLayout
import android.widget.HorizontalScrollView
import android.widget.LinearLayout
import android.widget.ScrollView
import com.amin.racing3d.R
import com.amin.racing3d.audio.AudioEngine
import com.amin.racing3d.core.Lang
import com.amin.racing3d.core.Progression
import com.amin.racing3d.game.GameData
import com.amin.racing3d.game.StoryData
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
    private val panelBg = 0xFF0D1424.toInt()

    override fun build(): View {
        val root = FrameLayout(ctx)
        // soft gradients at the screen edges keep the menus readable over the live 3D scene
        val fade = intArrayOf(0xC8050812.toInt(), 0x8A050812.toInt(), 0x3A050812, 0x10050812, 0x00050812)
        val shadeL = View(ctx)
        shadeL.background = GradientDrawable(GradientDrawable.Orientation.LEFT_RIGHT, fade)
        root.addView(shadeL, FrameLayout.LayoutParams(Ui.dp(330f), Ui.MATCH, Gravity.LEFT))
        val shadeR = View(ctx)
        shadeR.background = GradientDrawable(GradientDrawable.Orientation.RIGHT_LEFT, fade)
        root.addView(shadeR, FrameLayout.LayoutParams(Ui.dp(300f), Ui.MATCH, Gravity.RIGHT))
        val shadeT = View(ctx)
        shadeT.background = GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM, intArrayOf(0xB0050812.toInt(), 0x00050812))
        root.addView(shadeT, FrameLayout.LayoutParams(Ui.MATCH, Ui.dp(96f), Gravity.TOP))
        val shadeB = View(ctx)
        shadeB.background = GradientDrawable(GradientDrawable.Orientation.BOTTOM_TOP, intArrayOf(0xE6050812.toInt(), 0x99050812.toInt(), 0x00050812))
        root.addView(shadeB, FrameLayout.LayoutParams(Ui.MATCH, Ui.dp(190f), Gravity.BOTTOM))

        // ---- top bar: profile card · logo · coins + exit
        val top = Ui.hbox(ctx)
        top.setPadding(Ui.dp(14f), Ui.dp(10f), Ui.dp(14f), 0)
        top.addView(profileCard(), LinearLayout.LayoutParams(Ui.WRAP, Ui.WRAP))
        val logo = Ui.vbox(ctx, Gravity.CENTER)
        val title = Ui.glowTitle(ctx, "AMIN RACING", if (portrait) 20f else 24f, Ui.CYAN)
        title.letterSpacing = 0.08f
        logo.addView(title, Ui.lp(Ui.WRAP))
        val t3 = Ui.glowTitle(ctx, "3D  ·  v2", 12f, Ui.PINK)
        t3.letterSpacing = 0.3f
        logo.addView(t3, Ui.lp(Ui.WRAP, topDp = -4f))
        top.addView(logo, LinearLayout.LayoutParams(0, Ui.WRAP, 1f))
        if (portrait) logo.visibility = View.INVISIBLE
        top.addView(Ui.coinPill(ctx, save.coins))
        val exit = Ui.text(ctx, "✕", 16f, Ui.RED, Ui.black)
        exit.gravity = Gravity.CENTER
        exit.background = Ui.bg(Ui.withAlpha(0xFF000000.toInt(), 0x88), Ui.withAlpha(Ui.RED, 0x88), 20f, 1.2f)
        exit.isClickable = true
        exit.contentDescription = str(R.string.menu_exit)
        exit.setOnClickListener { Ui.onClickSound?.invoke(); host.confirm(str(R.string.exit_confirm)) { host.exitGame() } }
        Ui.pressable(exit)
        top.addView(exit, LinearLayout.LayoutParams(Ui.dp(38f), Ui.dp(38f)).also { it.marginStart = Ui.dp(8f) })
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

        // ---- bottom: horizontally scrolling game-mode tiles (never cut off, any screen size)
        val strip = Ui.vbox(ctx, Gravity.START)
        val head = Ui.hbox(ctx)
        val headT = Ui.text(ctx, str(R.string.menu_modes), 12f, Ui.withAlpha(Ui.TEXT, 0xCC), Ui.black)
        headT.letterSpacing = 0.12f
        head.addView(headT)
        val line = View(ctx)
        line.background = GradientDrawable(GradientDrawable.Orientation.LEFT_RIGHT, intArrayOf(Ui.withAlpha(Ui.CYAN, 0x88), Ui.withAlpha(Ui.CYAN, 0)))
        head.addView(line, LinearLayout.LayoutParams(0, Ui.dp(1.5f), 1f).also { it.marginStart = Ui.dp(10f) })
        head.setPadding(Ui.dp(18f), 0, Ui.dp(18f), Ui.dp(6f))
        strip.addView(head, Ui.lp())
        val tiles = Ui.hbox(ctx, Gravity.TOP)
        tiles.setPadding(Ui.dp(12f), 0, Ui.dp(12f), 0)
        val storyDone = (StoryData.missions.indices).count { save.storyCompleted(it) }
        tiles.addView(modeTile("📖", str(R.string.story_title), str(R.string.menu_story_sub, Lang.num(storyDone), Lang.num(StoryData.missions.size)),
            Ui.YELLOW, null, storyDone / StoryData.missions.size.toFloat()) { host.push(StoryScreen(host)) })
        class G(val icon: String, val t: Int, val s: Int, val modes: IntArray, val accent: Int, val badge: Boolean)
        val groups = arrayOf(
            G("🚦", R.string.menu_traffic, R.string.menu_traffic_sub, intArrayOf(GameData.MODE_TWO_WAY, GameData.MODE_ENDLESS, GameData.MODE_CHALLENGE), Ui.CYAN, true),
            G("🗺", R.string.mode_free, R.string.menu_free_sub, intArrayOf(GameData.MODE_FREE), Ui.GREEN, true),
            G("🏁", R.string.mode_street, R.string.menu_street_sub, intArrayOf(GameData.MODE_STREET), Ui.PINK, false),
            G("💨", R.string.mode_drift, R.string.menu_drift_sub, intArrayOf(GameData.MODE_DRIFT), 0xFFB388FF.toInt(), false),
            G("⏱", R.string.menu_time_trial, R.string.menu_time_trial_sub, intArrayOf(GameData.MODE_TIME_TRIAL, GameData.MODE_TIME_ATTACK), 0xFFFFB347.toInt(), false),
            G("🚓", R.string.mode_police, R.string.menu_police_sub, intArrayOf(GameData.MODE_POLICE), Ui.RED, false)
        )
        for (g in groups) {
            val medal = g.modes.maxOf { save.bestMedal(it) }
            tiles.addView(modeTile(g.icon, str(g.t), str(g.s), g.accent, if (g.badge) str(R.string.badge_new) else if (medal > 0) MEDALS[medal] else null) {
                if (save.selectedMode !in g.modes) save.selectedMode = g.modes[0]
                host.push(ModeSelectScreen(host, g.modes, g.t))
            })
        }
        val hs = HorizontalScrollView(ctx)
        hs.isHorizontalScrollBarEnabled = false
        hs.overScrollMode = View.OVER_SCROLL_NEVER
        hs.isFillViewport = false
        hs.addView(tiles, FrameLayout.LayoutParams(Ui.WRAP, Ui.WRAP))
        strip.addView(hs, Ui.lp())
        val stripLp = FrameLayout.LayoutParams(Ui.MATCH, Ui.WRAP, Gravity.BOTTOM)
        stripLp.bottomMargin = Ui.dp(if (portrait) 22f else 14f)
        root.addView(strip, stripLp)

        // ---- car showcase card (start side)
        val carCard = carCard()
        val ccLp = if (portrait) FrameLayout.LayoutParams(Ui.MATCH, Ui.WRAP, Gravity.TOP).also {
            it.topMargin = Ui.dp(70f); it.marginStart = Ui.dp(14f); it.marginEnd = Ui.dp(14f)
        } else FrameLayout.LayoutParams(Ui.dp(236f), Ui.WRAP, Gravity.START or Gravity.TOP).also {
            it.topMargin = Ui.dp(66f); it.marginStart = Ui.dp(14f)
        }
        root.addView(carCard, ccLp)

        // ---- action rail (end side): quick play + icon tiles
        val rail = actionRail()
        val rLp = if (portrait) FrameLayout.LayoutParams(Ui.WRAP, Ui.WRAP, Gravity.BOTTOM or Gravity.CENTER_HORIZONTAL).also {
            it.bottomMargin = Ui.dp(190f)
        } else FrameLayout.LayoutParams(Ui.WRAP, Ui.WRAP, Gravity.END or Gravity.TOP).also {
            it.topMargin = Ui.dp(66f); it.marginEnd = Ui.dp(14f)
        }
        root.addView(rail, rLp)

        val ver = Ui.text(ctx, str(R.string.version), 9f, Ui.withAlpha(Ui.DIM, 0x99))
        ver.setPadding(Ui.dp(10f), 0, Ui.dp(10f), Ui.dp(3f))
        root.addView(ver, FrameLayout.LayoutParams(Ui.WRAP, Ui.WRAP, Gravity.BOTTOM or Gravity.CENTER_HORIZONTAL))

        // entrance animation: card + rail slide in from their edges, the strip rises, tiles cascade
        val dir = if (Lang.isFa) -1f else 1f
        carCard.translationX = -dir * Ui.dp(50f); carCard.alpha = 0f
        carCard.animate().translationX(0f).alpha(1f).setDuration(420).setStartDelay(80).setInterpolator(DecelerateInterpolator(2f)).start()
        rail.translationX = dir * Ui.dp(50f); rail.alpha = 0f
        rail.animate().translationX(0f).alpha(1f).setDuration(420).setStartDelay(150).setInterpolator(DecelerateInterpolator(2f)).start()
        for (i in 0 until tiles.childCount) {
            val c = tiles.getChildAt(i)
            c.alpha = 0f; c.translationY = Ui.dp(36f).toFloat()
            c.animate().alpha(1f).translationY(0f).setStartDelay(200L + i * 50L).setDuration(380).setInterpolator(OvershootInterpolator(1.1f)).start()
        }
        return root
    }

    private fun profileCard(): View {
        val card = Ui.hbox(ctx)
        card.setPadding(Ui.dp(6f), Ui.dp(5f), Ui.dp(14f), Ui.dp(5f))
        card.background = Ui.bg(Ui.withAlpha(panelBg, 0xC8), Ui.withAlpha(Ui.CYAN, 0x55), 22f, 1f)
        card.isClickable = true
        card.setOnClickListener { Ui.onClickSound?.invoke(); host.push(ProgressScreen(host, 2)) }
        Ui.pressable(card)
        val badge = Ui.text(ctx, Lang.num(save.level()), 15f, Ui.BG, Ui.black)
        badge.gravity = Gravity.CENTER
        badge.background = Ui.gradient(Ui.CYAN, Ui.PINK, 0, 20f)
        card.addView(badge, LinearLayout.LayoutParams(Ui.dp(34f), Ui.dp(34f)))
        val info = Ui.vbox(ctx, Gravity.START)
        info.setPaddingRelative(Ui.dp(10f), 0, 0, 0)
        info.addView(Ui.text(ctx, str(R.string.player_default) + "  •  " + str(R.string.level_short) + " " + Lang.num(save.level()), 12f, Ui.TEXT, Ui.bold))
        info.addView(Ui.statBar(ctx, save.levelProgress(), Ui.CYAN), LinearLayout.LayoutParams(Ui.dp(112f), Ui.dp(5f)).also { it.topMargin = Ui.dp(4f) })
        card.addView(info)
        return card
    }

    private fun carCard(): View {
        val car = if (save.isCarOwned(save.selectedCar)) save.selectedCar else 0
        val spec = GameData.cars[car]
        val paint = save.paintColor(car)
        val card = Ui.vbox(ctx, Gravity.START)
        card.setPadding(Ui.dp(14f), Ui.dp(8f), Ui.dp(14f), Ui.dp(9f))
        card.background = Ui.gradient(Ui.withAlpha(paint, 0x40), Ui.withAlpha(panelBg, 0xDC), Ui.withAlpha(paint, 0x99), 18f,
            GradientDrawable.Orientation.TL_BR)
        val row = Ui.hbox(ctx)
        row.addView(Ui.text(ctx, str(R.string.selected_car), 10.5f, Ui.DIM, Ui.bold), LinearLayout.LayoutParams(0, Ui.WRAP, 1f))
        if (spec.catRes != 0) {
            val chip = Ui.text(ctx, str(spec.catRes), 10f, Ui.BG, Ui.bold)
            chip.setPadding(Ui.dp(8f), Ui.dp(1f), Ui.dp(8f), Ui.dp(2f))
            chip.background = Ui.bg(Ui.withAlpha(Ui.CYAN, 0xDD), 0, 9f)
            row.addView(chip)
        }
        card.addView(row, Ui.lp())
        val nameRow = Ui.hbox(ctx)
        val dot = View(ctx)
        dot.background = Ui.bg(paint, Ui.withAlpha(0xFFFFFFFF.toInt(), 0xCC), 8f, 1.5f)
        nameRow.addView(dot, LinearLayout.LayoutParams(Ui.dp(14f), Ui.dp(14f)))
        val name = Ui.text(ctx, str(spec.nameRes), 18f, Ui.TEXT, Ui.black)
        name.setShadowLayer(Ui.dp(8f).toFloat(), 0f, 0f, Ui.withAlpha(paint, 0xAA))
        name.isSingleLine = true
        name.ellipsize = TextUtils.TruncateAt.END
        nameRow.addView(name, LinearLayout.LayoutParams(0, Ui.WRAP, 1f).also { it.marginStart = Ui.dp(8f) })
        card.addView(nameRow, Ui.lp(topDp = 2f))
        val statNames = intArrayOf(R.string.stat_speed, R.string.stat_accel, R.string.stat_handling)
        val statUpg = intArrayOf(GameData.UPG_SPEED, -1, GameData.UPG_HANDLING)
        val statColors = intArrayOf(Ui.CYAN, Ui.YELLOW, Ui.PINK)
        for (i in 0..2) {
            val r = Ui.hbox(ctx)
            r.addView(Ui.text(ctx, str(statNames[i]), 10.5f, Ui.withAlpha(Ui.TEXT, 0xCC), Ui.bold), LinearLayout.LayoutParams(Ui.dp(74f), Ui.WRAP))
            val lvl = if (statUpg[i] >= 0) save.upgradeLevel(car, statUpg[i]) else 0
            r.addView(Ui.statBar(ctx, GameData.statBar(spec, i, lvl), statColors[i]), LinearLayout.LayoutParams(0, Ui.dp(6f), 1f))
            card.addView(r, Ui.lp(topDp = if (i == 0) 5f else 3f))
        }
        val bottom = Ui.hbox(ctx)
        val kmh = Ui.text(ctx, Lang.num(GameData.topSpeedKmh(spec, save.upgradeLevel(car, GameData.UPG_SPEED)).toInt()) + " " + str(R.string.kmh), 12f, Ui.CYAN, Ui.black)
        bottom.addView(kmh, LinearLayout.LayoutParams(0, Ui.WRAP, 1f))
        val owned = GameData.cars.indices.count { save.isCarOwned(it) }
        bottom.addView(Ui.text(ctx, "🏎 " + Lang.num(owned) + "/" + Lang.num(GameData.cars.size) + "   ›", 11.5f, Ui.withAlpha(Ui.TEXT, 0xCC), Ui.bold))
        card.addView(bottom, Ui.lp(topDp = 5f))
        card.isClickable = true
        card.setOnClickListener { Ui.onClickSound?.invoke(); host.push(GarageScreen(host)) }
        Ui.pressable(card)
        return card
    }

    private fun actionRail(): View {
        val rail = Ui.vbox(ctx, Gravity.CENTER)
        val w = Ui.dp(226f)
        // quick play: jumps straight into the last selected mode, track and car
        val play = Ui.hbox(ctx)
        play.setPadding(Ui.dp(16f), Ui.dp(10f), Ui.dp(16f), Ui.dp(10f))
        play.background = Ui.gradient(Ui.CYAN, Ui.PINK, Ui.withAlpha(0xFFFFFFFF.toInt(), 0x66), 20f, GradientDrawable.Orientation.LEFT_RIGHT)
        play.elevation = Ui.dp(6f).toFloat()
        val tri = Ui.text(ctx, "▶", 22f, Ui.BG, Ui.black)
        play.addView(tri)
        val pcol = Ui.vbox(ctx, Gravity.START)
        pcol.setPaddingRelative(Ui.dp(12f), 0, 0, 0)
        pcol.addView(Ui.text(ctx, str(R.string.menu_quick_play), 17f, Ui.BG, Ui.black))
        val m = save.selectedMode.coerceIn(0, GameData.NUM_MODES - 1)
        val env = save.selectedEnv.coerceIn(0, GameData.envs.size - 1)
        val sub = Ui.text(ctx, str(GameData.modeNames[m]) + " · " + str(GameData.envs[env].nameRes), 10.5f, Ui.withAlpha(Ui.BG, 0xCC), Ui.bold)
        sub.isSingleLine = true
        sub.ellipsize = TextUtils.TruncateAt.END
        pcol.addView(sub)
        play.addView(pcol, LinearLayout.LayoutParams(0, Ui.WRAP, 1f))
        play.isClickable = true
        play.setOnClickListener { Ui.onClickSound?.invoke(); host.startRace() }
        Ui.pressable(play)
        rail.addView(play, LinearLayout.LayoutParams(w, Ui.WRAP))
        // gentle breathing so the main call-to-action catches the eye
        val breathe = ValueAnimator.ofFloat(1f, 1.035f)
        breathe.duration = 1100
        breathe.repeatMode = ValueAnimator.REVERSE
        breathe.repeatCount = ValueAnimator.INFINITE
        breathe.addUpdateListener { val s = it.animatedValue as Float; play.scaleX = s; play.scaleY = s }
        play.addOnAttachStateChangeListener(object : View.OnAttachStateChangeListener {
            override fun onViewAttachedToWindow(v: View) = breathe.start()
            override fun onViewDetachedFromWindow(v: View) = breathe.cancel()
        })

        val icons = Ui.hbox(ctx)
        val open = host.progression.dailiesOpen()
        icons.addView(iconTile("🏎", str(R.string.menu_garage), Ui.PINK, null) { host.push(GarageScreen(host)) }, LinearLayout.LayoutParams(0, Ui.WRAP, 1f))
        icons.addView(iconTile("🏆", str(R.string.menu_progress_short), Ui.YELLOW, if (open > 0) Lang.num(open) else null) { host.push(ProgressScreen(host)) },
            LinearLayout.LayoutParams(0, Ui.WRAP, 1f).also { it.marginStart = Ui.dp(8f) })
        icons.addView(iconTile("⚙", str(R.string.menu_settings), Ui.GREEN, null) { host.push(SettingsScreen(host)) },
            LinearLayout.LayoutParams(0, Ui.WRAP, 1f).also { it.marginStart = Ui.dp(8f) })
        rail.addView(icons, LinearLayout.LayoutParams(w, Ui.WRAP).also { it.topMargin = Ui.dp(10f) })
        return rail
    }

    private fun iconTile(icon: String, label: String, accent: Int, badge: String?, onClick: () -> Unit): View {
        val f = FrameLayout(ctx)
        val col = Ui.vbox(ctx, Gravity.CENTER)
        col.setPadding(Ui.dp(4f), Ui.dp(8f), Ui.dp(4f), Ui.dp(7f))
        col.background = Ui.gradient(Ui.withAlpha(accent, 0x30), Ui.withAlpha(panelBg, 0xD8), Ui.withAlpha(accent, 0x99), 16f)
        val ic = Ui.text(ctx, icon, 20f, accent, Ui.bold)
        ic.gravity = Gravity.CENTER
        col.addView(ic)
        val l = Ui.text(ctx, label, 10.5f, Ui.TEXT, Ui.bold)
        l.gravity = Gravity.CENTER
        l.isSingleLine = true
        l.ellipsize = TextUtils.TruncateAt.END
        col.addView(l, Ui.lp(topDp = 2f))
        f.addView(col, FrameLayout.LayoutParams(Ui.MATCH, Ui.WRAP))
        if (badge != null) {
            val b = Ui.text(ctx, badge, 10f, Ui.BG, Ui.black)
            b.gravity = Gravity.CENTER
            b.minWidth = Ui.dp(18f)
            b.setPadding(Ui.dp(4f), 0, Ui.dp(4f), 0)
            b.background = Ui.bg(Ui.YELLOW, Ui.BG, 9f, 1.5f)
            f.addView(b, FrameLayout.LayoutParams(Ui.WRAP, Ui.dp(18f), Gravity.TOP or Gravity.END))
        }
        f.isClickable = true
        f.setOnClickListener { Ui.onClickSound?.invoke(); onClick() }
        Ui.pressable(f)
        return f
    }

    private fun modeTile(icon: String, title: String, sub: String, accent: Int, badge: String?, progress: Float = -1f, onClick: () -> Unit): View {
        val f = FrameLayout(ctx)
        val card = Ui.vbox(ctx, Gravity.START)
        card.setPadding(Ui.dp(12f), Ui.dp(9f), Ui.dp(12f), Ui.dp(8f))
        card.background = Ui.gradient(Ui.withAlpha(accent, 0x4A), Ui.withAlpha(panelBg, 0xE4), Ui.withAlpha(accent, 0xAA), 18f,
            GradientDrawable.Orientation.TL_BR)
        val ic = Ui.text(ctx, icon, 19f, accent, Ui.bold)
        ic.gravity = Gravity.CENTER
        ic.background = Ui.bg(Ui.withAlpha(accent, 0x30), Ui.withAlpha(accent, 0x77), 19f, 1f)
        card.addView(ic, LinearLayout.LayoutParams(Ui.dp(34f), Ui.dp(34f)))
        val t = Ui.text(ctx, title, 14.5f, accent, Ui.black)
        t.isSingleLine = true
        t.ellipsize = TextUtils.TruncateAt.END
        card.addView(t, Ui.lp(topDp = 4f))
        val s = Ui.text(ctx, sub, 10f, Ui.withAlpha(Ui.TEXT, 0xB8))
        s.maxLines = 2
        s.ellipsize = TextUtils.TruncateAt.END
        s.setLineSpacing(0f, 0.95f)
        card.addView(s, Ui.lp(topDp = 1f))
        if (progress >= 0f) card.addView(Ui.statBar(ctx, progress.coerceIn(0.02f, 1f), accent), LinearLayout.LayoutParams(Ui.MATCH, Ui.dp(4f)).also { it.topMargin = Ui.dp(5f) })
        f.addView(card, FrameLayout.LayoutParams(Ui.dp(150f), Ui.dp(if (portrait) 132f else 118f)))
        if (badge != null) {
            val isNew = badge == str(R.string.badge_new)
            val b = Ui.text(ctx, badge, if (isNew) 9.5f else 15f, if (isNew) Ui.BG else Ui.TEXT, Ui.black)
            b.gravity = Gravity.CENTER
            if (isNew) {
                b.setPadding(Ui.dp(8f), Ui.dp(1f), Ui.dp(8f), Ui.dp(2f))
                b.background = Ui.gradient(Ui.PINK, Ui.YELLOW, 0, 9f, GradientDrawable.Orientation.LEFT_RIGHT)
            }
            f.addView(b, FrameLayout.LayoutParams(Ui.WRAP, Ui.WRAP, Gravity.TOP or Gravity.END).also { it.topMargin = Ui.dp(10f); it.marginEnd = Ui.dp(10f) })
        }
        f.isClickable = true
        f.setOnClickListener { Ui.onClickSound?.invoke(); onClick() }
        Ui.pressable(f)
        val lp = LinearLayout.LayoutParams(Ui.dp(150f), Ui.dp(if (portrait) 132f else 118f))
        lp.marginStart = Ui.dp(5f); lp.marginEnd = Ui.dp(5f)
        f.layoutParams = lp
        return f
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
        val mission = if (r.missionId >= 0) StoryData.missions.getOrNull(r.missionId) else null
        if (mission != null) p.addView(missionResult(mission), Ui.lp(topDp = 4f, bottomDp = 8f))
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

        if (r.rewards.isNotEmpty()) p.addView(rewardsBox(), Ui.lp(topDp = 10f))

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

        val next = r.missionId + 1
        val storyDone = mission != null && r.missionPassed && next >= StoryData.missions.size
        if (mission != null && r.missionPassed && next < StoryData.missions.size) {
            p.addView(Ui.button(ctx, str(R.string.story_next), Ui.YELLOW, true, 19f) {
                host.quitToMenu(); host.push(StoryScreen(host)); host.push(DialogueScreen(host, next, afterRace = true))
            }, Ui.lp(topDp = 6f))
            p.addView(Ui.button(ctx, str(R.string.retry), Ui.GREEN, false, 15f) { host.restartRace() }, Ui.lp(topDp = 8f))
        } else if (storyDone && r.missionReward > 0) {
            p.addView(Ui.button(ctx, str(R.string.story_epilogue), Ui.YELLOW, true, 19f) {
                host.quitToMenu(); host.push(StoryScreen(host)); host.push(DialogueScreen(host, -1))
            }, Ui.lp(topDp = 6f))
        } else {
            p.addView(Ui.button(ctx, str(if (r.mode == GameData.MODE_FREE) R.string.drive_again else R.string.retry), Ui.GREEN, true, 19f) { host.restartRace() }, Ui.lp(topDp = 6f))
        }
        val row = Ui.hbox(ctx)
        val lp1 = LinearLayout.LayoutParams(0, Ui.WRAP, 1f).also { it.marginEnd = Ui.dp(5f) }
        val lp2 = LinearLayout.LayoutParams(0, Ui.WRAP, 1f).also { it.marginStart = Ui.dp(5f) }
        if (mission != null) row.addView(Ui.button(ctx, str(R.string.story_map), Ui.PINK, false, 15f) {
            host.quitToMenu(); host.push(StoryScreen(host))
        }, lp1)
        else row.addView(Ui.button(ctx, str(R.string.menu_garage), Ui.PINK, false, 15f) {
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

    /** Daily challenges / achievements / level-ups earned by this run, revealed one by one. */
    private fun rewardsBox(): View {
        val box = Ui.vbox(ctx)
        box.background = Ui.bg(Ui.withAlpha(Ui.YELLOW, 0x1C), Ui.withAlpha(Ui.YELLOW, 0x88), 12f)
        box.setPadding(Ui.dp(12f), Ui.dp(8f), Ui.dp(12f), Ui.dp(8f))
        box.addView(Ui.text(ctx, str(R.string.prog_rewards), 13f, Ui.YELLOW, Ui.black), Ui.lp(Ui.WRAP))
        for ((i, rw) in r.rewards.withIndex()) {
            val row = Ui.hbox(ctx)
            row.setPadding(0, Ui.dp(3f), 0, Ui.dp(3f))
            val col = when (rw.kind) { Progression.KIND_ACHIEVEMENT -> Ui.PINK; Progression.KIND_LEVEL -> Ui.CYAN; else -> Ui.GREEN }
            row.addView(Ui.text(ctx, rw.title(), 13f, col, Ui.bold), LinearLayout.LayoutParams(0, Ui.WRAP, 1f))
            row.addView(Ui.text(ctx, "+" + Lang.num(rw.coins) + " ●", 13f, Ui.YELLOW, Ui.bold))
            box.addView(row, Ui.lp())
            row.alpha = 0f; row.translationX = Ui.dp(if (Lang.isFa) -30f else 30f).toFloat()
            row.animate().alpha(1f).translationX(0f).setStartDelay(500L + i * 260L).setDuration(300).start()
        }
        if (r.rewards.any { it.kind == Progression.KIND_ACHIEVEMENT }) host.sfx(com.amin.racing3d.audio.AudioEngine.SFX_CHECKPOINT)
        return box
    }

    /** Story: passed/failed banner, the speaker's reaction, reward and unlocked car. */
    private fun missionResult(m: StoryData.Mission): View {
        val box = Ui.vbox(ctx)
        val accent = if (r.missionPassed) Ui.GREEN else Ui.RED
        box.background = Ui.bg(Ui.withAlpha(accent, 0x22), Ui.withAlpha(accent, 0x88), 12f)
        box.setPadding(Ui.dp(12f), Ui.dp(8f), Ui.dp(12f), Ui.dp(10f))
        box.addView(Ui.text(ctx, str(R.string.story_mission_n, Lang.num(r.missionId + 1)) + "  " + (if (Lang.isFa) m.titleFa else m.titleEn), 13f, Ui.YELLOW, Ui.bold), Ui.lp(Ui.WRAP))
        box.addView(Ui.text(ctx, str(if (r.missionPassed) R.string.story_passed else R.string.story_failed), 17f, accent, Ui.black), Ui.lp(Ui.WRAP))
        val line = if (r.missionPassed) m.win else m.lose
        val c = StoryData.characters[line.who]
        val q = Ui.text(ctx, (if (Lang.isFa) c.fa else c.en) + ": «" + (if (Lang.isFa) line.fa else line.en) + "»", 12.5f, c.color)
        q.textDirection = if (Lang.isFa) View.TEXT_DIRECTION_RTL else View.TEXT_DIRECTION_LTR
        box.addView(q, Ui.lp(topDp = 4f))
        if (!r.missionPassed) box.addView(Ui.text(ctx, StoryScreen.objectiveText(ctx, m), 11.5f, Ui.DIM), Ui.lp(topDp = 4f))
        if (r.missionReward > 0) box.addView(Ui.text(ctx, str(R.string.story_reward, Lang.num(r.missionReward)), 14f, Ui.YELLOW, Ui.bold), Ui.lp(Ui.WRAP, topDp = 6f))
        if (r.unlockedCar >= 0) {
            val u = Ui.text(ctx, "🚗 " + str(R.string.story_car_unlocked, str(GameData.cars[r.unlockedCar].nameRes)), 14f, Ui.BG, Ui.black)
            u.background = Ui.gradient(Ui.PINK, 0xFFB388FF.toInt(), 0, 12f, GradientDrawable.Orientation.LEFT_RIGHT)
            u.setPadding(Ui.dp(12f), Ui.dp(4f), Ui.dp(12f), Ui.dp(4f))
            box.addView(u, Ui.lp(Ui.WRAP, topDp = 6f))
        }
        return box
    }

    override fun onBack() = host.quitToMenu()
}
