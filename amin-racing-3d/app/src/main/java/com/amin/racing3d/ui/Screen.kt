package com.amin.racing3d.ui

import android.app.Activity
import android.view.Gravity
import android.view.View
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import com.amin.racing3d.R
import com.amin.racing3d.core.SaveManager

/** Final statistics of a finished run. */
class RunResult(
    val mode: Int,
    val score: Int,
    val distance: Float,
    val topSpeed: Int,
    val nearMisses: Int,
    val bestCombo: Int,
    val coins: Int,
    val timeUp: Boolean,
    val newRecord: Boolean,
    val best: Int,
    /** World.REASON_* */
    val reason: Int = 0,
    val success: Boolean = false,
    val medal: Int = 0,
    val position: Int = 0,
    val racers: Int = 0,
    val raceTime: Float = 0f,
    val escapes: Int = 0,
    val takedowns: Int = 0,
    /** story mission index (-1 quick play) */
    val missionId: Int = -1,
    val missionPassed: Boolean = false,
    /** coins paid for the mission (first completion only) */
    val missionReward: Int = 0,
    /** car unlocked by this mission (-1 none) */
    val unlockedCar: Int = -1
)

/** Everything a screen needs from the activity. */
interface GameHost {
    val activity: Activity
    val save: SaveManager
    val tiltAvailable: Boolean
    val ultraSupported: Boolean
    fun push(screen: Screen)
    fun replaceAll(screen: Screen)
    fun back()
    fun startRace()
    fun resumeRace()
    fun restartRace()
    fun quitToMenu()
    /** Free roam: end the drive and collect the rewards. */
    fun endFreeRoam()
    /** Starts story mission [index] (StoryData.missions). */
    fun startMission(index: Int)
    /** Manually checks GitHub for a newer release (settings). */
    fun checkUpdatesNow()
    /** Free roam: switch to another owned car without leaving the road. */
    fun swapCar(car: Int)
    fun showroom(car: Int, color: Int)
    fun rotateShowroom(deltaRadians: Float, dragging: Boolean)
    fun leaveShowroom()
    fun sfx(id: Int)
    fun toast(msg: String, color: Int = Ui.CYAN)
    fun confirm(msg: String, onYes: () -> Unit)
    fun applySettings()
    fun changeLanguage(lang: String)
    fun calibrateTilt()
    fun exitGame()
}

/** A full-screen UI page built from views. */
abstract class Screen(protected val host: GameHost) {
    protected val ctx get() = host.activity
    protected val save get() = host.save
    protected fun str(id: Int): String = ctx.getString(id)
    protected fun str(id: Int, vararg args: Any): String = ctx.getString(id, *args)

    /** Whether the 3D attract scene is dimmed behind this screen. */
    open val dim: Float = 0.45f

    abstract fun build(): View
    open fun onBack() = host.back()
    open fun onHidden() {}

    protected val portrait: Boolean
        get() {
            val m = ctx.resources.displayMetrics
            return m.heightPixels > m.widthPixels
        }

    protected val screenWidthDp: Float
        get() = ctx.resources.displayMetrics.widthPixels / ctx.resources.displayMetrics.density

    /** Standard header: back button, title, coin balance. */
    protected fun header(title: String, showBack: Boolean = true): LinearLayout {
        val row = Ui.hbox(ctx)
        row.setPadding(Ui.dp(14f), Ui.dp(10f), Ui.dp(14f), Ui.dp(6f))
        if (showBack) {
            val back = Ui.button(ctx, if (com.amin.racing3d.core.Lang.isFa) "→" else "←", Ui.CYAN, false, 18f) { onBack() }
            back.setPadding(Ui.dp(16f), Ui.dp(6f), Ui.dp(16f), Ui.dp(6f))
            back.contentDescription = str(R.string.back)
            row.addView(back, LinearLayout.LayoutParams(Ui.WRAP, Ui.WRAP))
        }
        val t = Ui.glowTitle(ctx, title, 22f)
        row.addView(t, LinearLayout.LayoutParams(0, Ui.WRAP, 1f))
        coinView = Ui.coinPill(ctx, save.coins)
        row.addView(coinView, LinearLayout.LayoutParams(Ui.WRAP, Ui.WRAP))
        return row
    }

    protected var coinView: TextView? = null

    protected fun refreshCoins() {
        coinView?.text = "●  " + com.amin.racing3d.core.Lang.num(save.coins)
        coinView?.animate()?.scaleX(1.15f)?.scaleY(1.15f)?.setDuration(120)?.withEndAction {
            coinView?.animate()?.scaleX(1f)?.scaleY(1f)?.setDuration(180)?.start()
        }?.start()
    }

    /** Header + scrollable centred column limited to [maxWidthDp]. */
    protected fun page(title: String, maxWidthDp: Float = 560f, content: (LinearLayout) -> Unit): View {
        val root = LinearLayout(ctx)
        root.orientation = LinearLayout.VERTICAL
        root.addView(header(title), LinearLayout.LayoutParams(Ui.MATCH, Ui.WRAP))
        val scroll = ScrollView(ctx)
        scroll.isFillViewport = true
        scroll.isVerticalScrollBarEnabled = false
        val holder = FrameLayout(ctx)
        val col = Ui.vbox(ctx)
        col.setPadding(Ui.dp(14f), Ui.dp(4f), Ui.dp(14f), Ui.dp(24f))
        content(col)
        val w = minOf(Ui.dp(maxWidthDp), ctx.resources.displayMetrics.widthPixels)
        holder.addView(col, FrameLayout.LayoutParams(w, Ui.WRAP, Gravity.CENTER_HORIZONTAL))
        scroll.addView(holder, FrameLayout.LayoutParams(Ui.MATCH, Ui.WRAP))
        root.addView(scroll, LinearLayout.LayoutParams(Ui.MATCH, 0, 1f))
        return root
    }

    protected fun sectionTitle(text: String): TextView {
        val t = Ui.text(ctx, text, 15f, Ui.CYAN, Ui.bold)
        t.setPadding(Ui.dp(4f), Ui.dp(14f), Ui.dp(4f), Ui.dp(6f))
        return t
    }
}
