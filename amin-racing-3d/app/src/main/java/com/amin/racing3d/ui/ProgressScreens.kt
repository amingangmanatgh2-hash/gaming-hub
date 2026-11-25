package com.amin.racing3d.ui

import android.graphics.drawable.GradientDrawable
import android.view.Gravity
import android.view.View
import android.widget.LinearLayout
import com.amin.racing3d.R
import com.amin.racing3d.core.Lang
import com.amin.racing3d.core.Progression
import com.amin.racing3d.game.GameData
import java.util.Calendar

/** Profile & progress: daily challenges, achievements and statistics. */
class ProgressScreen(host: GameHost, private var tab: Int = 0) : Screen(host) {
    override val dim = 0.62f
    private val prog get() = host.progression
    private lateinit var content: LinearLayout

    override fun build(): View {
        // achievements for garage / story / level progress made outside a run
        val fresh = ArrayList<Progression.Reward>()
        prog.checkAchievements(fresh)
        for (r in fresh) host.toast(r.title() + "  +" + Lang.num(r.coins) + " ●", Ui.PINK)

        return page(str(R.string.prog_title), 640f) { col ->
            col.addView(levelCard(), Ui.lp())
            col.addView(Ui.segmented(ctx, listOf(str(R.string.prog_tab_daily), str(R.string.prog_tab_ach), str(R.string.prog_tab_stats)), tab, Ui.YELLOW) {
                tab = it
                fill()
            }, Ui.lp(topDp = 12f))
            content = Ui.vbox(ctx)
            col.addView(content, Ui.lp(topDp = 6f))
            fill()
            if (fresh.isNotEmpty()) refreshCoins()
        }
    }

    private fun levelCard(): View {
        val card = Ui.hbox(ctx)
        card.background = Ui.gradient(Ui.withAlpha(Ui.CYAN, 0x30), Ui.withAlpha(Ui.PINK, 0x30), Ui.withAlpha(Ui.CYAN, 0x88), 14f, GradientDrawable.Orientation.LEFT_RIGHT)
        card.setPadding(Ui.dp(12f), Ui.dp(10f), Ui.dp(14f), Ui.dp(10f))
        val badge = Ui.text(ctx, Lang.num(save.level()), 22f, Ui.BG, Ui.black)
        badge.gravity = Gravity.CENTER
        badge.background = Ui.gradient(Ui.CYAN, Ui.PINK, 0, 26f)
        card.addView(badge, LinearLayout.LayoutParams(Ui.dp(52f), Ui.dp(52f)))
        val info = Ui.vbox(ctx, Gravity.START)
        info.setPaddingRelative(Ui.dp(12f), 0, 0, 0)
        info.addView(Ui.text(ctx, str(R.string.player_default) + "  •  " + str(R.string.level_short) + " " + Lang.num(save.level()), 15f, Ui.TEXT, Ui.bold))
        val lv = save.level()
        val next = 50 * lv * (lv + 1)
        info.addView(Ui.statBar(ctx, save.levelProgress(), Ui.CYAN), Ui.lp(topDp = 4f))
        info.addView(Ui.text(ctx, str(R.string.prog_xp, Lang.num(save.xp), Lang.num(next), Lang.num(250 * (lv + 1))), 11f, Ui.DIM), Ui.lp(topDp = 3f))
        card.addView(info, LinearLayout.LayoutParams(0, Ui.WRAP, 1f))
        val ach = Ui.vbox(ctx, Gravity.CENTER)
        ach.addView(Ui.text(ctx, "🏆 " + Lang.num(prog.unlockedCount()) + "/" + Lang.num(prog.achievements.size), 14f, Ui.YELLOW, Ui.bold))
        ach.addView(Ui.text(ctx, str(R.string.prog_tab_ach), 10f, Ui.DIM))
        card.addView(ach)
        return card
    }

    private fun fill() {
        content.removeAllViews()
        when (tab) {
            0 -> fillDaily()
            1 -> fillAchievements()
            else -> fillStats()
        }
    }

    // ------------------------------------------------------------------ daily
    private fun fillDaily() {
        val c = Calendar.getInstance()
        val minsLeft = (24 * 60) - (c.get(Calendar.HOUR_OF_DAY) * 60 + c.get(Calendar.MINUTE))
        content.addView(Ui.text(ctx, str(R.string.prog_daily_reset, Lang.num(minsLeft / 60), Lang.num(minsLeft % 60)), 12f, Ui.DIM), Ui.lp(topDp = 6f))
        for (d in prog.dailies()) {
            val accent = if (d.claimed) Ui.GREEN else Ui.CYAN
            val card = Ui.vbox(ctx, Gravity.START)
            card.background = Ui.bg(Ui.withAlpha(accent, 0x1E), Ui.withAlpha(accent, 0x88), 12f)
            card.setPadding(Ui.dp(12f), Ui.dp(8f), Ui.dp(12f), Ui.dp(10f))
            val top = Ui.hbox(ctx)
            top.addView(Ui.text(ctx, (if (d.claimed) "✅ " else "🎯 ") + d.title(), 14f, if (d.claimed) Ui.GREEN else Ui.TEXT, Ui.bold), LinearLayout.LayoutParams(0, Ui.WRAP, 1f))
            top.addView(Ui.text(ctx, "+" + Lang.num(d.reward) + " ●", 13f, Ui.YELLOW, Ui.bold))
            card.addView(top, Ui.lp())
            val p = d.progress.coerceAtMost(d.target)
            card.addView(Ui.statBar(ctx, p / d.target.toFloat(), accent), Ui.lp(topDp = 6f))
            card.addView(Ui.text(ctx, if (d.claimed) str(R.string.prog_done) else Lang.num(p) + " / " + Lang.num(d.target), 11f, Ui.DIM), Ui.lp(topDp = 2f))
            content.addView(card, Ui.lp(topDp = 8f))
        }
        val bonus = Ui.text(ctx, (if (prog.dailyBonusClaimed) "✅ " else "🎁 ") + str(R.string.prog_daily_bonus, Lang.num(Progression.DAILY_BONUS)), 13f,
            if (prog.dailyBonusClaimed) Ui.GREEN else Ui.YELLOW, Ui.bold)
        bonus.setPadding(Ui.dp(4f), Ui.dp(12f), Ui.dp(4f), 0)
        content.addView(bonus, Ui.lp())
        content.addView(Ui.text(ctx, str(R.string.prog_daily_hint), 11f, Ui.DIM), Ui.lp(topDp = 4f))
    }

    // ------------------------------------------------------------------ achievements
    private fun fillAchievements() {
        val sorted = prog.achievements.sortedBy { if (prog.isUnlocked(it.id)) 1 else 0 }
        for (a in sorted) {
            val done = prog.isUnlocked(a.id)
            val (cur, target) = prog.achievementProgress(a.id)
            val row = Ui.hbox(ctx)
            row.background = Ui.bg(if (done) Ui.withAlpha(Ui.YELLOW, 0x22) else Ui.PANEL_LIGHT, if (done) Ui.withAlpha(Ui.YELLOW, 0x99) else 0, 12f)
            row.setPadding(Ui.dp(10f), Ui.dp(8f), Ui.dp(12f), Ui.dp(8f))
            val icon = Ui.text(ctx, a.icon, 22f, Ui.TEXT)
            icon.gravity = Gravity.CENTER
            if (!done) icon.alpha = 0.45f
            row.addView(icon, LinearLayout.LayoutParams(Ui.dp(40f), Ui.WRAP))
            val info = Ui.vbox(ctx, Gravity.START)
            info.addView(Ui.text(ctx, if (Lang.isFa) a.fa else a.en, 14f, if (done) Ui.YELLOW else Ui.TEXT, Ui.bold))
            info.addView(Ui.text(ctx, if (Lang.isFa) a.dFa else a.dEn, 11f, Ui.DIM))
            if (!done && target > 1) {
                info.addView(Ui.statBar(ctx, (cur.toFloat() / target).coerceIn(0f, 1f), Ui.CYAN), Ui.lp(topDp = 4f))
                info.addView(Ui.text(ctx, Lang.num(cur.coerceAtMost(target)) + " / " + Lang.num(target), 10f, Ui.DIM))
            }
            row.addView(info, LinearLayout.LayoutParams(0, Ui.WRAP, 1f))
            row.addView(Ui.text(ctx, if (done) "✓" else "+" + Lang.num(a.reward) + " ●", 13f, if (done) Ui.GREEN else Ui.YELLOW, Ui.bold))
            content.addView(row, Ui.lp(topDp = 6f))
        }
    }

    // ------------------------------------------------------------------ stats
    private fun fillStats() {
        fun stat(label: Int, value: String) {
            val row = Ui.hbox(ctx)
            row.setPadding(Ui.dp(8f), Ui.dp(6f), Ui.dp(8f), Ui.dp(6f))
            row.addView(Ui.text(ctx, str(label), 13.5f, Ui.DIM), LinearLayout.LayoutParams(0, Ui.WRAP, 1f))
            row.addView(Ui.text(ctx, value, 14.5f, Ui.TEXT, Ui.bold))
            content.addView(row, Ui.lp())
        }
        stat(R.string.st_runs, Lang.num(save.totalRuns))
        stat(R.string.st_distance, Lang.km(save.totalMeters.toFloat()) + " " + str(R.string.km))
        stat(R.string.st_top_speed, Lang.num(save.bestTopSpeed) + " " + str(R.string.kmh))
        stat(R.string.st_near, Lang.num(save.totalNearMisses))
        stat(R.string.st_combo, "×" + Lang.num(prog.bestCombo))
        stat(R.string.st_traffic, Lang.num(prog.bestTrafficScore))
        stat(R.string.st_street_wins, Lang.num(prog.streetWins))
        stat(R.string.st_drift_best, Lang.num(prog.bestDrift))
        stat(R.string.st_escapes, Lang.num(prog.totalEscapes))
        stat(R.string.st_takedowns, Lang.num(prog.totalTakedowns))
        stat(R.string.st_golds, Lang.num(prog.goldMedals))
        stat(R.string.st_free, Lang.km(prog.freeRoamMeters.toFloat()) + " " + str(R.string.km))
        stat(R.string.st_cars, Lang.num(GameData.cars.indices.count { save.isCarOwned(it) }) + " / " + Lang.num(GameData.cars.size))
        stat(R.string.st_dailies, Lang.num(prog.dailiesDone))
        content.addView(Ui.button(ctx, str(R.string.menu_scores), Ui.YELLOW, false, 15f) { host.push(ScoresScreen(host)) }, Ui.lp(topDp = 14f))
    }
}
