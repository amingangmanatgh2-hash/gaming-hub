package com.amin.racing3d.ui

import android.animation.ValueAnimator
import android.graphics.drawable.GradientDrawable
import android.view.Gravity
import android.view.View
import android.view.animation.DecelerateInterpolator
import android.view.animation.LinearInterpolator
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import com.amin.racing3d.R
import com.amin.racing3d.core.Lang
import com.amin.racing3d.game.GameData
import com.amin.racing3d.game.StoryData

/** Story mode map: chapters and their missions, unlocked one after another. */
class StoryScreen(host: GameHost) : Screen(host) {
    override val dim = 0.62f

    override fun build(): View = page(str(R.string.story_title), 640f) { col ->
        val progress = save.storyProgress
        val total = StoryData.missions.size
        val done = (0 until total).count { save.storyCompleted(it) }

        // ---- progress summary
        val sum = Ui.text(ctx, str(R.string.story_progress, Lang.num(done), Lang.num(total)), 13f, Ui.DIM, Ui.bold)
        col.addView(sum, Ui.lp())
        col.addView(Ui.statBar(ctx, done / total.toFloat(), Ui.YELLOW), Ui.lp(topDp = 4f))

        // ---- cast
        col.addView(sectionTitle(str(R.string.story_cast)), Ui.lp())
        val cast = Ui.hbox(ctx)
        for (i in 0 until StoryData.PLAYER) cast.addView(portrait(i, 40f), LinearLayout.LayoutParams(Ui.WRAP, Ui.WRAP).also { it.marginEnd = Ui.dp(8f) })
        val castScroll = android.widget.HorizontalScrollView(ctx)
        castScroll.isHorizontalScrollBarEnabled = false
        castScroll.addView(cast)
        col.addView(castScroll, Ui.lp())

        // ---- chapters
        for ((ci, ch) in StoryData.chapters.withIndex()) {
            val first = StoryData.missions.indexOfFirst { it.chapter == ci }
            val chapterOpen = first <= progress
            val title = Ui.text(ctx, (if (chapterOpen) "" else "🔒 ") + (if (Lang.isFa) ch.titleFa else ch.titleEn), 17f,
                if (chapterOpen) Ui.YELLOW else Ui.DIM, Ui.black)
            title.setPadding(Ui.dp(4f), Ui.dp(18f), Ui.dp(4f), 0)
            col.addView(title, Ui.lp())
            col.addView(Ui.text(ctx, if (Lang.isFa) ch.subFa else ch.subEn, 12f, Ui.DIM), Ui.lp(bottomDp = 6f))
            for ((mi, m) in StoryData.missions.withIndex()) {
                if (m.chapter != ci) continue
                col.addView(missionCard(mi, m, mi <= progress, save.storyCompleted(mi)), Ui.lp(topDp = 6f))
            }
        }
        if (done == total) {
            col.addView(Ui.button(ctx, str(R.string.story_epilogue), Ui.YELLOW, false, 15f) {
                host.push(DialogueScreen(host, -1))
            }, Ui.lp(topDp = 18f))
        }
    }

    private fun portrait(who: Int, sizeDp: Float): View {
        val c = StoryData.characters[who]
        val box = Ui.vbox(ctx)
        val face = Ui.text(ctx, (if (Lang.isFa) c.fa else c.en).trim().take(1), sizeDp * 0.42f, Ui.BG, Ui.black)
        face.gravity = Gravity.CENTER
        val bg = GradientDrawable()
        bg.shape = GradientDrawable.OVAL
        bg.colors = intArrayOf(c.color, Ui.withAlpha(c.color, 0x88))
        bg.setStroke(Ui.dp(2f), Ui.TEXT)
        face.background = bg
        box.addView(face, LinearLayout.LayoutParams(Ui.dp(sizeDp), Ui.dp(sizeDp)))
        box.addView(Ui.text(ctx, if (Lang.isFa) c.fa else c.en, 10f, c.color, Ui.bold), LinearLayout.LayoutParams(Ui.WRAP, Ui.WRAP).also { it.topMargin = Ui.dp(2f) })
        return box
    }

    private fun missionCard(index: Int, m: StoryData.Mission, open: Boolean, done: Boolean): View {
        val accent = when { done -> Ui.GREEN; open -> Ui.CYAN; else -> Ui.DIM }
        val card = Ui.hbox(ctx)
        card.setPadding(Ui.dp(12f), Ui.dp(8f), Ui.dp(12f), Ui.dp(8f))
        card.background = Ui.gradient(Ui.withAlpha(accent, if (open) 0x30 else 0x14), Ui.withAlpha(0xFF0D1424.toInt(), 0xD8),
            Ui.withAlpha(accent, if (open) 0xAA else 0x44), 14f, GradientDrawable.Orientation.LEFT_RIGHT)
        val num = Ui.text(ctx, when { done -> "✓"; open -> Lang.num(index + 1); else -> "🔒" }, 18f, accent, Ui.black)
        num.gravity = Gravity.CENTER
        card.addView(num, LinearLayout.LayoutParams(Ui.dp(34f), Ui.WRAP))
        val info = Ui.vbox(ctx, Gravity.START)
        info.addView(Ui.text(ctx, if (Lang.isFa) m.titleFa else m.titleEn, 15f, if (open) Ui.TEXT else Ui.DIM, Ui.bold))
        val cfg = m.config
        val desc = str(GameData.modeNames[cfg.mode]) + " · " + str(GameData.envs[cfg.env].nameRes) + " · " +
            str(GameData.weatherNames[cfg.weather]) + " · " + str(GameData.todNames[cfg.tod])
        info.addView(Ui.text(ctx, desc, 11f, Ui.DIM))
        info.addView(Ui.text(ctx, objective(m), 11.5f, if (open) Ui.YELLOW else Ui.DIM))
        card.addView(info, LinearLayout.LayoutParams(0, Ui.WRAP, 1f))
        val reward = Ui.vbox(ctx, Gravity.END)
        reward.addView(Ui.text(ctx, "● " + Lang.num(m.reward), 13f, if (done) Ui.DIM else Ui.YELLOW, Ui.bold))
        if (m.unlockCar >= 0) reward.addView(Ui.text(ctx, "🚗 " + str(GameData.cars[m.unlockCar].nameRes), 10.5f, if (done) Ui.DIM else Ui.PINK, Ui.bold))
        card.addView(reward)
        if (open) {
            card.isClickable = true
            card.setOnClickListener { Ui.onClickSound?.invoke(); host.push(DialogueScreen(host, index)) }
            Ui.pressable(card)
        } else card.alpha = 0.6f
        return card
    }

    private fun objective(m: StoryData.Mission): String = objectiveText(ctx, m)

    companion object {
        /** Human-readable mission objective. */
        fun objectiveText(cx: android.content.Context, m: StoryData.Mission): String {
            val c = m.config
            fun f(id: Int, vararg a: Any): String = cx.getString(id, *a)
            return when (c.mode) {
                GameData.MODE_STREET -> f(R.string.obj_street, Lang.km(c.goal))
                GameData.MODE_TIME_TRIAL -> f(R.string.obj_time_trial, Lang.km(c.goal), Lang.num(c.bronze.toInt()))
                GameData.MODE_DRIFT -> f(R.string.obj_drift, Lang.num(c.bronze.toInt()), Lang.num(c.timeLimit.toInt()))
                GameData.MODE_CHALLENGE -> f(R.string.obj_challenge, Lang.num(c.bronze.toInt()), Lang.num(c.timeLimit.toInt()))
                GameData.MODE_POLICE -> f(R.string.obj_police, Lang.num(c.goal.toInt()))
                else -> f(R.string.obj_score, Lang.num(c.goal.toInt()))
            }
        }
    }
}

/**
 * Cinematic briefing: letterbox bars, the speaker's car in the 3D showroom behind,
 * portrait + name, typewriter text. Tap to advance; the last tap starts the mission.
 * mission = -1 plays the epilogue.
 */
class DialogueScreen(host: GameHost, private val mission: Int, private val afterRace: Boolean = false) : Screen(host) {
    override val dim = 0.12f

    private val lines: Array<StoryData.Line> =
        if (mission < 0) StoryData.outro else StoryData.missions[mission].briefing
    private var idx = 0
    private var typing: ValueAnimator? = null
    private lateinit var nameView: TextView
    private lateinit var lineView: TextView
    private lateinit var faceView: TextView
    private lateinit var hint: TextView
    private var full = ""

    override fun build(): View {
        val root = FrameLayout(ctx)
        root.isClickable = true
        root.setOnClickListener { advance() }

        // letterbox bars slide in
        val top = View(ctx); top.setBackgroundColor(0xF2000000.toInt())
        val bottom = View(ctx); bottom.setBackgroundColor(0xF2000000.toInt())
        val barH = Ui.dp(46f)
        root.addView(top, FrameLayout.LayoutParams(Ui.MATCH, barH, Gravity.TOP))
        root.addView(bottom, FrameLayout.LayoutParams(Ui.MATCH, barH, Gravity.BOTTOM))
        top.translationY = -barH.toFloat(); bottom.translationY = barH.toFloat()
        top.animate().translationY(0f).setDuration(420).start()
        bottom.animate().translationY(0f).setDuration(420).start()

        // chapter / mission title in the top bar
        val m = if (mission >= 0) StoryData.missions[mission] else null
        val head = if (m != null) {
            val ch = StoryData.chapters[m.chapter]
            (if (Lang.isFa) ch.titleFa else ch.titleEn) + "   ·   " + str(R.string.story_mission_n, Lang.num(mission + 1)) + "  " + (if (Lang.isFa) m.titleFa else m.titleEn)
        } else str(R.string.story_epilogue)
        val headView = Ui.text(ctx, head, 14f, Ui.YELLOW, Ui.bold)
        headView.gravity = Gravity.CENTER
        root.addView(headView, FrameLayout.LayoutParams(Ui.MATCH, barH, Gravity.TOP).also { headView.gravity = Gravity.CENTER })

        // skip button
        val skip = Ui.button(ctx, str(if (mission >= 0) R.string.story_skip else R.string.story_close), Ui.DIM, false, 12f) { finish() }
        skip.setPadding(Ui.dp(14f), Ui.dp(4f), Ui.dp(14f), Ui.dp(4f))
        root.addView(skip, FrameLayout.LayoutParams(Ui.WRAP, Ui.WRAP, Gravity.TOP or Gravity.END).also {
            it.topMargin = Ui.dp(6f); it.marginEnd = Ui.dp(10f)
        })

        // dialogue box
        val box = Ui.hbox(ctx, Gravity.TOP)
        box.background = Ui.gradient(0xE6101830.toInt(), 0xE6060A16.toInt(), Ui.withAlpha(Ui.CYAN, 0x66), 16f, GradientDrawable.Orientation.TOP_BOTTOM)
        box.setPadding(Ui.dp(14f), Ui.dp(12f), Ui.dp(16f), Ui.dp(12f))
        faceView = Ui.text(ctx, "", 26f, Ui.BG, Ui.black)
        faceView.gravity = Gravity.CENTER
        box.addView(faceView, LinearLayout.LayoutParams(Ui.dp(64f), Ui.dp(64f)).also { it.marginEnd = Ui.dp(14f) })
        val txt = Ui.vbox(ctx, Gravity.START)
        nameView = Ui.text(ctx, "", 16f, Ui.CYAN, Ui.black)
        txt.addView(nameView)
        lineView = Ui.text(ctx, "", 15.5f, Ui.TEXT)
        lineView.setLineSpacing(0f, 1.15f)
        lineView.textDirection = if (Lang.isFa) View.TEXT_DIRECTION_RTL else View.TEXT_DIRECTION_LTR
        txt.addView(lineView, LinearLayout.LayoutParams(Ui.MATCH, Ui.WRAP).also { it.topMargin = Ui.dp(4f) })
        hint = Ui.text(ctx, "", 11f, Ui.DIM, Ui.bold)
        txt.addView(hint, LinearLayout.LayoutParams(Ui.MATCH, Ui.WRAP).also { it.topMargin = Ui.dp(6f) })
        box.addView(txt, LinearLayout.LayoutParams(0, Ui.WRAP, 1f))
        val w = minOf(Ui.dp(640f), ctx.resources.displayMetrics.widthPixels - Ui.dp(24f))
        root.addView(box, FrameLayout.LayoutParams(w, Ui.WRAP, Gravity.BOTTOM or Gravity.CENTER_HORIZONTAL).also { it.bottomMargin = barH + Ui.dp(8f) })
        box.alpha = 0f; box.translationY = Ui.dp(40f).toFloat()
        box.animate().alpha(1f).translationY(0f).setStartDelay(250).setDuration(380).setInterpolator(DecelerateInterpolator(2f)).start()

        root.postDelayed({ show(0) }, 300)
        return root
    }

    /** car shown behind each speaker (their ride), player = selected car */
    private fun carFor(who: Int): Int = when (who) {
        StoryData.REZA -> GameData.CAR_CLASSIC
        StoryData.LEILA -> GameData.CAR_PICKUP
        StoryData.NIMA -> GameData.CAR_SPORTS
        StoryData.KAVEH -> GameData.CAR_MUSCLE
        StoryData.SHAHIN -> GameData.CAR_SUPER
        StoryData.MAHTAB -> GameData.CAR_POLICE
        else -> save.selectedCar.let { if (save.isCarOwned(it)) it else 0 }
    }

    private fun show(i: Int) {
        idx = i
        val l = lines[i]
        val c = StoryData.characters[l.who]
        val name = if (Lang.isFa) c.fa else c.en
        nameView.text = name
        nameView.setTextColor(c.color)
        faceView.text = name.trim().take(1)
        val bg = GradientDrawable()
        bg.shape = GradientDrawable.OVAL
        bg.colors = intArrayOf(c.color, Ui.withAlpha(c.color, 0x77))
        bg.setStroke(Ui.dp(2.5f), Ui.TEXT)
        faceView.background = bg
        faceView.scaleX = 0.6f; faceView.scaleY = 0.6f
        faceView.animate().scaleX(1f).scaleY(1f).setDuration(220).start()
        val car = carFor(l.who)
        host.showroom(car, if (l.who == StoryData.PLAYER) save.paintColor(car) else (c.color or 0xFF000000.toInt()))
        full = if (Lang.isFa) l.fa else l.en
        hint.text = ""
        typing?.cancel()
        val anim = ValueAnimator.ofInt(0, full.length)
        anim.duration = (full.length * 28L).coerceIn(300L, 3200L)
        anim.interpolator = LinearInterpolator()
        anim.addUpdateListener { lineView.text = full.substring(0, it.animatedValue as Int) }
        anim.addListener(object : android.animation.AnimatorListenerAdapter() {
            override fun onAnimationEnd(animation: android.animation.Animator) { onTyped() }
        })
        typing = anim
        anim.start()
        host.sfx(com.amin.racing3d.audio.AudioEngine.SFX_CLICK)
    }

    private fun onTyped() {
        lineView.text = full
        hint.text = if (idx == lines.size - 1) str(if (mission >= 0) R.string.story_tap_start else R.string.story_tap_close) else str(R.string.story_tap_next)
    }

    private fun advance() {
        val t = typing
        if (t != null && t.isRunning) { t.end(); return }   // first tap completes the line
        if (idx < lines.size - 1) show(idx + 1) else finish()
    }

    private fun finish() {
        typing?.cancel()
        if (mission >= 0) {
            host.leaveShowroom()
            host.startMission(mission)
        } else {
            host.leaveShowroom()
            host.back()
        }
    }

    override fun onBack() {
        typing?.cancel()
        host.leaveShowroom()
        if (afterRace) host.quitToMenu() else host.back()
    }

    override fun onHidden() {
        typing?.cancel()
    }
}
