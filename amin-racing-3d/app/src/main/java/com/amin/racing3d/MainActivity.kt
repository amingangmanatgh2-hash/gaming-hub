package com.amin.racing3d

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.content.res.Configuration
import android.opengl.GLSurfaceView
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.view.Gravity
import android.view.HapticFeedbackConstants
import android.view.View
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.view.WindowManager
import android.view.animation.DecelerateInterpolator
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import com.amin.racing3d.audio.AudioEngine
import com.amin.racing3d.core.Lang
import com.amin.racing3d.core.Progression
import com.amin.racing3d.core.SaveManager
import com.amin.racing3d.core.ScoreEntry
import com.amin.racing3d.core.UpdateChecker
import com.amin.racing3d.game.GameData
import com.amin.racing3d.game.GameListener
import com.amin.racing3d.game.RaceConfig
import com.amin.racing3d.game.StoryData
import com.amin.racing3d.game.World
import com.amin.racing3d.input.InputState
import com.amin.racing3d.input.TiltController
import com.amin.racing3d.render.GameRenderer
import com.amin.racing3d.render.RendererCallbacks
import com.amin.racing3d.ui.GameHost
import com.amin.racing3d.ui.GameOverScreen
import com.amin.racing3d.ui.HudView
import com.amin.racing3d.ui.MainMenuScreen
import com.amin.racing3d.ui.PauseScreen
import com.amin.racing3d.ui.RunResult
import kotlin.math.max
import kotlin.math.min
import com.amin.racing3d.ui.Screen
import com.amin.racing3d.ui.SettingsScreen
import com.amin.racing3d.ui.Ui

/**
 * Single activity hosting the OpenGL ES 3.0 view, the Canvas HUD and the view-based menus.
 */
class MainActivity : Activity(), GameHost, GameListener, RendererCallbacks, HudView.Listener {

    override lateinit var save: SaveManager
    override val progression: Progression by lazy { Progression(save) }
    override val messages: com.amin.racing3d.core.Messages by lazy { com.amin.racing3d.core.Messages(save) }
    override val gameWorld: World get() = world
    override val activity: Activity get() = this
    override val tiltAvailable: Boolean get() = tilt.available
    override val tiltSensor: String get() = tilt.sensorName
    override val ultraSupported: Boolean get() = renderer.ultraSupported

    private val input = InputState()
    private lateinit var world: World
    private lateinit var audio: AudioEngine
    private lateinit var renderer: GameRenderer
    private lateinit var glView: GLSurfaceView
    private lateinit var hud: HudView
    private lateinit var tilt: TiltController
    private lateinit var root: FrameLayout
    private lateinit var dimView: View
    private lateinit var screenLayer: FrameLayout
    private lateinit var toastView: TextView
    private var loadingView: View? = null
    private var confirmView: View? = null

    private val handler = Handler(Looper.getMainLooper())
    private val stack = ArrayList<Screen>()
    private var glReady = false
    private var inRace = false
    private var racePaused = false
    private var useTilt = false
    private var reopenSettings = false
    private var activityResumed = false

    private val vibrator: Vibrator? by lazy {
        if (Build.VERSION.SDK_INT >= 31) {
            (getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager?)?.defaultVibrator
        } else {
            @Suppress("DEPRECATION")
            getSystemService(Context.VIBRATOR_SERVICE) as Vibrator?
        }
    }

    // ================================================================= lifecycle
    override fun attachBaseContext(newBase: Context) {
        save = SaveManager(newBase)
        super.attachBaseContext(Lang.wrap(newBase, save.language))
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        setTheme(R.style.Theme_AminRacing)
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        if (Build.VERSION.SDK_INT >= 28) {
            window.attributes = window.attributes.also {
                it.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
            }
        }
        reopenSettings = savedInstanceState?.getBoolean(KEY_SETTINGS, false) ?: false
        Ui.init(this)

        audio = AudioEngine()
        tilt = TiltController(this, input)
        if (!tilt.available && save.controlMode == SaveManager.CONTROL_TILT) save.controlMode = SaveManager.CONTROL_TOUCH
        world = World(input)
        world.audio = audio
        world.listener = this
        renderer = GameRenderer(this, world, this)
        // the loading scene shows the player's own car in its paint
        renderer.showroomCar = selectedOwnedCar()
        renderer.showroomColor = save.paintColor(renderer.showroomCar)
        renderer.showroomCustom = save.customs(renderer.showroomCar)
        renderer.qualityLevel = save.graphics

        Ui.onClickSound = { audio.trigger(AudioEngine.SFX_CLICK) }
        Ui.onHaptic = { v -> v.performHapticFeedback(HapticFeedbackConstants.VIRTUAL_KEY) }

        buildLayout()
        applySettings()
        tilt.displayRotation = currentRotation()
        startUpdateCheck(manual = false)

        val car = selectedOwnedCar()
        val color = save.paintColor(car)
        glView.queueEvent {
            world.configureCar(car, color, 0, 0, 0, 0)
            world.startAttract()
        }
        audio.start()
        root.setOnApplyWindowInsetsListener { _, insets -> applyInsets(insets); insets }
        hideSystemUi()
    }

    private fun buildLayout() {
        root = FrameLayout(this)
        root.layoutDirection = Lang.layoutDirection
        root.setBackgroundColor(Ui.BG)

        glView = GLSurfaceView(this)
        glView.setEGLContextClientVersion(3)
        glView.preserveEGLContextOnPause = true
        glView.setRenderer(renderer)
        glView.renderMode = GLSurfaceView.RENDERMODE_CONTINUOUSLY
        root.addView(glView, FrameLayout.LayoutParams(Ui.MATCH, Ui.MATCH))

        hud = HudView(this, world, input)
        hud.listener = this
        hud.visibility = View.GONE
        root.addView(hud, FrameLayout.LayoutParams(Ui.MATCH, Ui.MATCH))

        dimView = View(this)
        dimView.setBackgroundColor(0xFF04060D.toInt())
        dimView.alpha = 0.45f
        root.addView(dimView, FrameLayout.LayoutParams(Ui.MATCH, Ui.MATCH))

        screenLayer = FrameLayout(this)
        root.addView(screenLayer, FrameLayout.LayoutParams(Ui.MATCH, Ui.MATCH))

        toastView = Ui.text(this, "", 14f, Ui.TEXT, Ui.bold)
        toastView.gravity = Gravity.CENTER
        toastView.setPadding(Ui.dp(18f), Ui.dp(10f), Ui.dp(18f), Ui.dp(10f))
        toastView.alpha = 0f
        toastView.visibility = View.GONE
        val tlp = FrameLayout.LayoutParams(Ui.WRAP, Ui.WRAP, Gravity.BOTTOM or Gravity.CENTER_HORIZONTAL)
        tlp.bottomMargin = Ui.dp(48f)
        tlp.leftMargin = Ui.dp(24f); tlp.rightMargin = Ui.dp(24f)
        root.addView(toastView, tlp)

        loadingView = buildLoading()
        root.addView(loadingView, FrameLayout.LayoutParams(Ui.MATCH, Ui.MATCH))
        setContentView(root)
    }

    // ================================================================= loading screen
    private var loadShown = 0f
    private var loadTip = 0
    private var loadTipTime = 0L
    private val tipIds = intArrayOf(R.string.tip_1, R.string.tip_2, R.string.tip_3, R.string.tip_4,
        R.string.tip_5, R.string.tip_6, R.string.tip_7, R.string.tip_8)

    /**
     * Loading overlay drawn over the live 3D loading scene (the renderer shows the selected car
     * as soon as it is built). The bar follows [GameRenderer.loadProgress], the fraction of
     * initialisation steps actually completed — it never runs ahead of the real progress.
     */
    private fun buildLoading(): View {
        val f = FrameLayout(this)
        f.isClickable = true
        f.setBackgroundColor(0x00000000)
        val shade = View(this)
        shade.background = android.graphics.drawable.GradientDrawable(
            android.graphics.drawable.GradientDrawable.Orientation.TOP_BOTTOM,
            intArrayOf(0x99050812.toInt(), 0x00050812, 0x00050812, 0xDD050812.toInt()))
        f.addView(shade, FrameLayout.LayoutParams(Ui.MATCH, Ui.MATCH))

        val logo = Ui.vbox(this, Gravity.CENTER)
        val t1 = Ui.glowTitle(this, "AMIN RACING", 40f, Ui.CYAN)
        t1.letterSpacing = 0.1f
        logo.addView(t1, Ui.lp(Ui.WRAP))
        val t2 = Ui.glowTitle(this, "3D", 28f, Ui.PINK)
        t2.letterSpacing = 0.5f
        logo.addView(t2, Ui.lp(Ui.WRAP, topDp = -8f))
        val llp = FrameLayout.LayoutParams(Ui.WRAP, Ui.WRAP, Gravity.TOP or Gravity.CENTER_HORIZONTAL)
        llp.topMargin = Ui.dp(22f)
        f.addView(logo, llp)
        logo.alpha = 0f; logo.scaleX = 1.15f; logo.scaleY = 1.15f
        logo.animate().alpha(1f).scaleX(1f).scaleY(1f).setDuration(900).start()

        val bottom = Ui.vbox(this, Gravity.CENTER)
        bottom.setPadding(Ui.dp(40f), 0, Ui.dp(40f), Ui.dp(18f))
        val tip = Ui.text(this, getString(tipIds[0]), 13f, Ui.TEXT)
        tip.gravity = Gravity.CENTER
        tip.tag = "tip"
        bottom.addView(tip, Ui.lp(Ui.MATCH))
        val row = Ui.hbox(this)
        val label = Ui.text(this, getString(R.string.loading_title), 12f, Ui.DIM, Ui.bold)
        label.tag = "msg"
        row.addView(label, LinearLayout.LayoutParams(0, Ui.WRAP, 1f))
        val pct = Ui.text(this, Lang.num(0) + "٪", 14f, Ui.CYAN, Ui.bold)
        pct.tag = "pct"
        row.addView(pct)
        bottom.addView(row, Ui.lp(Ui.MATCH, topDp = 12f))
        val bar = LoadingBar(this)
        bar.tag = "bar"
        bottom.addView(bar, LinearLayout.LayoutParams(Ui.MATCH, Ui.dp(8f)).also { it.topMargin = Ui.dp(6f) })
        // GitHub update check status (filled in by startUpdateCheck)
        val upd = Ui.text(this, "", 11.5f, Ui.DIM, Ui.bold)
        upd.gravity = Gravity.CENTER
        upd.tag = "upd"
        bottom.addView(upd, Ui.lp(Ui.MATCH, topDp = 6f))
        f.addView(bottom, FrameLayout.LayoutParams(Ui.MATCH, Ui.WRAP, Gravity.BOTTOM))
        loadTipTime = SystemClock.uptimeMillis()
        handler.post(loadTicker)
        return f
    }

    private val loadTicker = object : Runnable {
        override fun run() {
            val lv = loadingView ?: return
            val target = if (glReady) 1f else renderer.loadProgress
            // ease towards the real value, never past it
            loadShown = min(target, loadShown + max(0.004f, (target - loadShown) * 0.22f))
            lv.findViewWithTag<LoadingBar>("bar")?.setProgress(loadShown)
            lv.findViewWithTag<TextView>("pct")?.text = Lang.num((loadShown * 100f).toInt()) + (if (Lang.isFa) "٪" else "%")
            val now = SystemClock.uptimeMillis()
            if (now - loadTipTime > 3200) {
                loadTipTime = now
                loadTip = (loadTip + 1) % tipIds.size
                val tip = lv.findViewWithTag<TextView>("tip")
                tip?.animate()?.alpha(0f)?.setDuration(220)?.withEndAction {
                    tip.text = getString(tipIds[loadTip])
                    tip.animate().alpha(1f).setDuration(260).start()
                }?.start()
            }
            handler.postDelayed(this, 33)
        }
    }

    /** Rounded neon progress bar with a moving highlight. */
    private class LoadingBar(ctx: Context) : View(ctx) {
        private var p = 0f
        private val bgPaint = android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG).apply { color = 0x33FFFFFF }
        private val fg = android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG)
        private val glow = android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG).apply { color = 0x88FFFFFF.toInt() }
        private val rect = android.graphics.RectF()
        fun setProgress(v: Float) { p = v; invalidate() }
        override fun onDraw(c: android.graphics.Canvas) {
            val r = height / 2f
            rect.set(0f, 0f, width.toFloat(), height.toFloat())
            c.drawRoundRect(rect, r, r, bgPaint)
            val w = width * p
            if (w < 1f) return
            val rtl = layoutDirection == View.LAYOUT_DIRECTION_RTL
            if (rtl) rect.set(width - w, 0f, width.toFloat(), height.toFloat()) else rect.set(0f, 0f, w, height.toFloat())
            fg.shader = android.graphics.LinearGradient(rect.left, 0f, rect.right, 0f, Ui.CYAN, Ui.PINK, android.graphics.Shader.TileMode.CLAMP)
            c.drawRoundRect(rect, r, r, fg)
            val t = (SystemClock.uptimeMillis() % 1400L) / 1400f
            val hx = rect.left + (rect.width()) * t
            c.drawCircle(hx, height / 2f, r * 0.9f, glow)
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        if (glReady) handleDemoIntent(intent)
    }

    private fun isDebuggable(): Boolean = (applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE) != 0

    /**
     * Debug builds only: lets automated tests (CI emulator) open a screen or start a race directly, e.g.
     * `adb shell am start -n com.amin.racing3d.debug/com.amin.racing3d.MainActivity --es demo race --ei mode 1`.
     */
    private fun handleDemoIntent(i: Intent?) {
        if (i == null || !isDebuggable()) return
        val demo = i.getStringExtra(EXTRA_DEMO) ?: return
        val lang = i.getStringExtra(EXTRA_LANG)
        if (lang != null && lang != save.language) {
            save.language = lang
            recreate()
            return
        }
        i.removeExtra(EXTRA_DEMO)
        if (i.hasExtra("gfx")) {
            save.graphics = i.getIntExtra("gfx", save.graphics)
            save.autoQuality = false
        }
        if (i.hasExtra("control")) save.controlMode = i.getIntExtra("control", save.controlMode)
        if (i.hasExtra("car")) {
            val c = i.getIntExtra("car", 0).coerceIn(0, GameData.cars.size - 1)
            save.setCarOwned(c)
            save.selectedCar = c
        }
        if (i.hasExtra("mode")) save.selectedMode = i.getIntExtra("mode", save.selectedMode).coerceIn(0, GameData.NUM_MODES - 1)
        if (i.hasExtra("weather")) save.selectedWeather = i.getIntExtra("weather", 0).coerceIn(0, GameData.weatherNames.size - 1)
        if (i.hasExtra("env")) {
            val e = i.getIntExtra("env", 0).coerceIn(0, GameData.envs.size - 1)
            save.unlockEnv(e)
            save.selectedEnv = e
        }
        if (i.hasExtra("tod")) save.selectedTod = i.getIntExtra("tod", 0).coerceIn(0, 3)
        if (i.hasExtra("autogas")) save.autoGas = i.getBooleanExtra("autogas", true)
        if (i.hasExtra("fps")) save.showFps = i.getBooleanExtra("fps", false)
        // debug: "custom" = comma list of Garage 2.0 options for the selected car (granted + equipped)
        i.getStringExtra("custom")?.split(',')?.forEachIndexed { cat, v ->
            val opt = v.trim().toIntOrNull() ?: return@forEachIndexed
            if (cat < GameData.NUM_CUS && opt in GameData.customOptions[cat].indices) {
                save.setOwnsCustom(save.selectedCar, cat, opt); save.setCustom(save.selectedCar, cat, opt)
            }
        }
        dismissConfirm()
        dismissUpdateDialog()
        updateDialogShown = true   // automated demo runs: never cover screenshots with the update dialog
        if (inRace) quitToMenu()
        applySettings()
        when (demo) {
            "race" -> startRace()
            "garage" -> { replaceAll(MainMenuScreen(this)); push(com.amin.racing3d.ui.GarageScreen(this)) }
            "modes" -> { replaceAll(MainMenuScreen(this)); push(com.amin.racing3d.ui.ModeSelectScreen(this)) }
            "settings" -> { replaceAll(MainMenuScreen(this)); push(SettingsScreen(this)) }
            "scores" -> { replaceAll(MainMenuScreen(this)); push(com.amin.racing3d.ui.ScoresScreen(this)) }
            "upgrades" -> { replaceAll(MainMenuScreen(this)); push(com.amin.racing3d.ui.GarageScreen(this)); push(com.amin.racing3d.ui.UpgradeScreen(this, save.selectedCar)) }
            "pause" -> { startRace(); handler.postDelayed({ pauseRace() }, 5000) }
            "story" -> { replaceAll(MainMenuScreen(this)); push(com.amin.racing3d.ui.StoryScreen(this)) }
            "progress" -> { replaceAll(MainMenuScreen(this)); push(com.amin.racing3d.ui.ProgressScreen(this, i.getIntExtra("tab", 0))) }
            "customize" -> {
                replaceAll(MainMenuScreen(this)); push(com.amin.racing3d.ui.GarageScreen(this))
                push(com.amin.racing3d.ui.CustomizeScreen(this, save.selectedCar))
            }
            "dialogue" -> {
                replaceAll(MainMenuScreen(this)); push(com.amin.racing3d.ui.StoryScreen(this))
                push(com.amin.racing3d.ui.DialogueScreen(this, intent.getIntExtra("mission", 0).coerceIn(0, StoryData.missions.size - 1)))
            }
            "mission" -> startMission(intent.getIntExtra("mission", 0).coerceIn(0, StoryData.missions.size - 1))
            // v2.0: taxi job (stage 1 = passenger waiting ahead, 2 = ride in progress), walking, phone, photo mode
            "taxi" -> {
                val stage = i.getIntExtra("stage", 1)
                startRace()
                handler.postDelayed({ glView.queueEvent { world.debugTaxi(stage) } }, i.getIntExtra("after", 8000).toLong())
            }
            "onfoot" -> {
                startRace()
                handler.postDelayed({ glView.queueEvent { world.debugExitCar() } }, i.getIntExtra("after", 8000).toLong())
            }
            "phone" -> {
                val app = i.getIntExtra("app", 0)
                val stage = i.getIntExtra("stage", 0)
                startRace()
                if (stage > 0) handler.postDelayed({ glView.queueEvent { world.debugTaxi(stage) } }, 6000)
                handler.postDelayed({ openPhone(app) }, i.getIntExtra("after", 9000).toLong())
            }
            "photo" -> {
                startRace()
                val after = i.getIntExtra("after", 8000).toLong()
                handler.postDelayed({ glView.queueEvent { world.debugExitCar() } }, after)
                handler.postDelayed({
                    openPhone(com.amin.racing3d.ui.PhoneScreen.APP_CAMERA)
                    replaceTop(com.amin.racing3d.ui.PhotoModeScreen(this, 2.55f, 0.18f, 6.5f))
                }, after + 2500)
            }
            else -> replaceAll(MainMenuScreen(this))
        }
    }

    override fun onResume() {
        super.onResume()
        activityResumed = true
        glView.onResume()
        glView.queueEvent { renderer.resetTiming() }
        audio.resume()
        tilt.displayRotation = currentRotation()
        updateTiltListening()
        hideSystemUi()
        handler.removeCallbacks(ticker)
        handler.post(ticker)
    }

    override fun onPause() {
        activityResumed = false
        if (inRace && !racePaused) pauseRace()
        glView.onPause()
        audio.pause()
        tilt.stop()
        handler.removeCallbacks(ticker)
        super.onPause()
    }

    override fun onDestroy() {
        handler.removeCallbacksAndMessages(null)
        world.listener = null
        audio.release()
        super.onDestroy()
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        outState.putBoolean(KEY_SETTINGS, stack.lastOrNull() is SettingsScreen)
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) hideSystemUi()
    }

    override fun onConfigurationChanged(newConfig: Configuration) {
        super.onConfigurationChanged(newConfig)
        tilt.displayRotation = currentRotation()
        root.layoutDirection = Lang.layoutDirection
        // rebuild the visible page for the new orientation
        handler.post {
            val top = stack.lastOrNull()
            if (top != null) display(top, false)
        }
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (confirmView != null) { dismissConfirm(); return }
        if (loadingView != null) return
        if (inRace && !racePaused) {
            if (world.hudState == World.STATE_COUNTDOWN || world.hudState == World.STATE_RACING) pauseRace()
            return
        }
        val top = stack.lastOrNull()
        if (top != null) top.onBack() else {
            @Suppress("DEPRECATION")
            super.onBackPressed()
        }
    }

    // ================================================================= system UI
    private fun hideSystemUi() {
        if (Build.VERSION.SDK_INT >= 30) {
            window.setDecorFitsSystemWindows(false)
            window.insetsController?.let {
                it.hide(WindowInsets.Type.systemBars())
                it.systemBarsBehavior = WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            }
        } else {
            @Suppress("DEPRECATION")
            window.decorView.systemUiVisibility = (View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                or View.SYSTEM_UI_FLAG_FULLSCREEN
                or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                or View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN)
        }
    }

    private fun applyInsets(insets: WindowInsets) {
        var l = 0; var t = 0; var r = 0; var b = 0
        if (Build.VERSION.SDK_INT >= 28) {
            insets.displayCutout?.let {
                l = it.safeInsetLeft; t = it.safeInsetTop; r = it.safeInsetRight; b = it.safeInsetBottom
            }
        }
        hud.setPadding(l, t, r, b)
        screenLayer.setPadding(l, t, r, b)
    }

    @Suppress("DEPRECATION")
    private fun currentRotation(): Int =
        if (Build.VERSION.SDK_INT >= 30) display?.rotation ?: 0 else windowManager.defaultDisplay.rotation

    // ================================================================= periodic UI-thread tick
    private val ticker = object : Runnable {
        override fun run() {
            val st = world.hudState
            val active = st == World.STATE_COUNTDOWN || st == World.STATE_RACING || st == World.STATE_CRASHED
            audio.engineAudible = inRace && !racePaused && active
            audio.racing = inRace
            if (racePaused || !inRace) {
                audio.engineOn = false
                audio.nitroOn = false
                audio.hornOn = false
            }
            handler.postDelayed(this, 100)
        }
    }

    // ================================================================= navigation
    private fun display(screen: Screen, animate: Boolean) {
        val old = if (screenLayer.childCount > 0) screenLayer.getChildAt(0) else null
        val v = screen.build()
        v.isClickable = true
        v.layoutDirection = Lang.layoutDirection
        screenLayer.removeAllViews()
        screenLayer.addView(v, FrameLayout.LayoutParams(Ui.MATCH, Ui.MATCH))
        if (animate) {
            v.alpha = 0f
            v.animate().alpha(1f).setDuration(220).setInterpolator(DecelerateInterpolator()).start()
        }
        dimView.animate().alpha(screen.dim).setDuration(300).start()
        old?.animate()?.cancel()
    }

    override fun push(screen: Screen) {
        stack.lastOrNull()?.onHidden()
        stack.add(screen)
        display(screen, true)
    }

    override fun replaceAll(screen: Screen) {
        for (s in stack) s.onHidden()
        stack.clear()
        stack.add(screen)
        display(screen, true)
    }

    override fun replaceTop(screen: Screen) {
        if (stack.isNotEmpty()) stack.removeAt(stack.size - 1).onHidden()
        stack.add(screen)
        display(screen, true)
    }

    // ================================================================= v2.0 phone
    private fun openPhone(app: Int = com.amin.racing3d.ui.PhoneScreen.APP_HOME) {
        if (!inRace || racePaused) return
        if (world.hudState != World.STATE_RACING && world.hudState != World.STATE_CRASHED) return
        racePaused = true
        input.reset()
        glView.queueEvent { world.paused = true }
        updateTiltListening()
        push(com.amin.racing3d.ui.PhoneScreen(this, app))
    }

    override fun setTaxiShift(on: Boolean) {
        glView.queueEvent {
            if (world.mode == GameData.MODE_ENDLESS) world.taxiInEndless = on
            world.setTaxiShift(on)
        }
    }

    override fun setRadio(station: Int) {
        audio.station = station.coerceIn(0, AudioEngine.NUM_STATIONS - 1)
    }

    override fun photoMode(on: Boolean) {
        renderer.photoMode = on
        hud.visibility = if (on || !inRace) View.GONE else View.VISIBLE
    }

    override fun photoOrbit(yaw: Float, pitch: Float, dist: Float) {
        renderer.photoYaw = yaw; renderer.photoPitch = pitch; renderer.photoDist = dist
    }

    private fun photoDir(): java.io.File = java.io.File(filesDir, "photos").also { it.mkdirs() }

    override fun photos(): List<java.io.File> =
        (photoDir().listFiles { f -> f.name.endsWith(".jpg") } ?: emptyArray()).sortedByDescending { it.lastModified() }

    override fun takePhoto(done: (java.io.File?) -> Unit) {
        val w = glView.width; val h = glView.height
        if (w <= 0 || h <= 0) { done(null); return }
        val bmp = android.graphics.Bitmap.createBitmap(w, h, android.graphics.Bitmap.Config.ARGB_8888)
        try {
            android.view.PixelCopy.request(glView, bmp, { result ->
                if (result != android.view.PixelCopy.SUCCESS) { done(null); return@request }
                Thread {
                    var out: java.io.File? = null
                    try {
                        val name = "amin_racing_" + System.currentTimeMillis() + ".jpg"
                        val f = java.io.File(photoDir(), name)
                        java.io.FileOutputStream(f).use { bmp.compress(android.graphics.Bitmap.CompressFormat.JPEG, 92, it) }
                        out = f
                        // keep the newest 24 in the app; also export to the gallery (Android 10+ needs no permission)
                        photos().drop(24).forEach { it.delete() }
                        if (Build.VERSION.SDK_INT >= 29) {
                            val cv = android.content.ContentValues()
                            cv.put(android.provider.MediaStore.Images.Media.DISPLAY_NAME, name)
                            cv.put(android.provider.MediaStore.Images.Media.MIME_TYPE, "image/jpeg")
                            cv.put(android.provider.MediaStore.Images.Media.RELATIVE_PATH, "Pictures/Amin Racing")
                            val uri = contentResolver.insert(android.provider.MediaStore.Images.Media.EXTERNAL_CONTENT_URI, cv)
                            if (uri != null) contentResolver.openOutputStream(uri)?.use { os -> f.inputStream().use { it.copyTo(os) } }
                        }
                    } catch (_: Throwable) {}
                    val res = out
                    handler.post { done(res) }
                }.start()
            }, handler)
        } catch (_: Throwable) { done(null) }
    }

    override fun back() {
        if (stack.isNotEmpty()) stack.removeAt(stack.size - 1).onHidden()
        val top = stack.lastOrNull()
        if (top != null) display(top, true)
        else if (inRace && racePaused) resumeRace()
        else replaceAll(MainMenuScreen(this))
    }

    private fun clearScreens() {
        for (s in stack) s.onHidden()
        stack.clear()
        screenLayer.removeAllViews()
    }

    // ================================================================= race control
    private fun selectedOwnedCar(): Int {
        val c = save.selectedCar
        return if (save.isCarOwned(c)) c else 0
    }

    /** story mission being played (-1 = quick play); restart replays the same mission */
    private var currentMission = -1

    override fun startMission(index: Int) {
        val m = StoryData.missions.getOrNull(index) ?: return
        currentMission = index
        launchRace(m.config)
        val goal = com.amin.racing3d.ui.StoryScreen.objectiveText(this, m)
        handler.postDelayed({ if (inRace && currentMission == index) toast(goal, Ui.YELLOW) }, 3400)
    }

    override fun startRace() {
        currentMission = -1
        val mode = save.selectedMode.coerceIn(0, GameData.NUM_MODES - 1)
        val env = if (save.selectedEnv in GameData.envs.indices && save.isEnvUnlocked(save.selectedEnv)) save.selectedEnv else GameData.ENV_CITY
        launchRace(GameData.defaultConfig(mode, env, save.selectedTod, save.selectedWeather))
    }

    private fun launchRace(cfg: RaceConfig) {
        val mode = cfg.mode
        val car = selectedOwnedCar()
        val color = save.paintColor(car)
        val lSpeed = save.upgradeLevel(car, GameData.UPG_SPEED)
        val lHandling = save.upgradeLevel(car, GameData.UPG_HANDLING)
        val lBrakes = save.upgradeLevel(car, GameData.UPG_BRAKES)
        val lNitro = save.upgradeLevel(car, GameData.UPG_NITRO)
        val cus = save.customs(car)
        renderer.playerCustom = cus
        inRace = true
        racePaused = false
        clearScreens()
        dimView.animate().alpha(0f).setDuration(250).start()
        input.reset()
        hud.bestScore = save.highScore(mode)
        hud.resetEffects()
        hud.visibility = View.VISIBLE
        applySettings()
        glView.queueEvent {
            world.paused = false
            world.configureCar(car, color, lSpeed, lHandling, lBrakes, lNitro)
            world.flameStyle = cus[GameData.CUS_FLAME]
            world.taxiInEndless = save.prefInt("taxi_endless", 1) == 1
            world.startRace(cfg)
            renderer.resetTiming()
        }
    }

    private fun pauseRace() {
        if (!inRace || racePaused) return
        racePaused = true
        input.reset()
        glView.queueEvent { world.paused = true }
        updateTiltListening()
        push(PauseScreen(this))
    }

    override fun resumeRace() {
        if (!inRace) return
        racePaused = false
        input.reset()
        clearScreens()
        dimView.animate().alpha(0f).setDuration(200).start()
        applySettings()
        glView.queueEvent {
            renderer.resetTiming()
            world.paused = false
        }
    }

    override fun restartRace() = if (currentMission >= 0) startMission(currentMission) else startRace()

    override fun quitToMenu() {
        inRace = false
        racePaused = false
        input.reset()
        hud.visibility = View.GONE
        updateTiltListening()
        val car = selectedOwnedCar()
        val color = save.paintColor(car)
        glView.queueEvent {
            world.paused = false
            world.configureCar(car, color, 0, 0, 0, 0)
            world.startAttract()
        }
        replaceAll(MainMenuScreen(this))
    }

    override fun endFreeRoam() {
        if (!inRace) return
        glView.queueEvent { world.endFreeRoam() }
    }

    override fun swapCar(car: Int) {
        if (!inRace || !save.isCarOwned(car)) return
        save.selectedCar = car
        val color = save.paintColor(car)
        val lS = save.upgradeLevel(car, GameData.UPG_SPEED)
        val lH = save.upgradeLevel(car, GameData.UPG_HANDLING)
        val lB = save.upgradeLevel(car, GameData.UPG_BRAKES)
        val lN = save.upgradeLevel(car, GameData.UPG_NITRO)
        val cus = save.customs(car)
        renderer.playerCustom = cus
        glView.queueEvent { world.swapCar(car, color, lS, lH, lB, lN); world.flameStyle = cus[GameData.CUS_FLAME] }
        resumeRace()
    }

    private fun finishRun(mode: Int, score: Int, distance: Float, topSpeed: Int, near: Int, combo: Int,
                          earned: Int, timeUp: Boolean, car: Int, env: Int, extra: RunResult? = null) {
        if (!inRace) return
        inRace = false
        racePaused = false
        input.reset()
        hud.visibility = View.GONE
        updateTiltListening()
        save.addCoins(earned)
        val levelBefore = save.level()
        save.recordRun(score, distance, near, topSpeed)
        // street races / time trials only count on the leaderboard when they were finished
        val counts = extra == null || mode == GameData.MODE_FREE ||
            !((mode == GameData.MODE_STREET || mode == GameData.MODE_TIME_TRIAL) && !extra.success)
        val record = counts && score > 0 && save.submitScore(mode, ScoreEntry(score, car, env, distance.toInt(), System.currentTimeMillis()))
        if (extra != null && currentMission < 0) save.submitMedal(mode, extra.medal)
        // story: pass/fail, one-time reward and car unlock
        var mPassed = false
        var mReward = 0
        var mCar = -1
        val mission = if (currentMission >= 0) StoryData.missions.getOrNull(currentMission) else null
        if (mission != null && extra != null) {
            mPassed = StoryData.passed(mission, extra.success, extra.medal, extra.position)
            if (mPassed && save.completeStoryMission(currentMission)) {
                mReward = mission.reward
                save.addCoins(mReward)
                if (mission.unlockCar >= 0 && !save.isCarOwned(mission.unlockCar)) {
                    save.setCarOwned(mission.unlockCar)
                    mCar = mission.unlockCar
                }
            }
        }
        if (mPassed) save.xp += 150
        val rewards = progression.onRun(Progression.RunInfo(mode, score, distance, topSpeed, near, combo,
            extra?.success ?: false, extra?.medal ?: 0, extra?.position ?: 0, extra?.escapes ?: 0, extra?.takedowns ?: 0,
            mPassed, car), levelBefore)
        val result = if (extra == null) RunResult(mode, score, distance, topSpeed, near, combo, earned, timeUp, record, save.highScore(mode), rewards = rewards)
        else RunResult(mode, score, distance, topSpeed, near, combo, earned, timeUp, record, save.highScore(mode),
            extra.reason, extra.success, extra.medal, extra.position, extra.racers, extra.raceTime, extra.escapes, extra.takedowns,
            currentMission, mPassed, mReward, mCar, rewards)
        replaceAll(GameOverScreen(this, result))
        if (record) audio.trigger(AudioEngine.SFX_CHECKPOINT)
    }

    // ================================================================= showroom
    override fun showroom(car: Int, color: Int, custom: IntArray?) {
        renderer.showroomCar = car
        renderer.showroomColor = color
        renderer.showroomCustom = custom ?: IntArray(GameData.NUM_CUS)
        glView.queueEvent {
            if (world.state != World.STATE_SHOWROOM) world.startShowroom()
        }
    }

    override fun rotateShowroom(deltaRadians: Float, dragging: Boolean) {
        renderer.showroomDragging = dragging
        renderer.showroomYaw = renderer.showroomYaw + deltaRadians
    }

    override fun showroomCamera(zoom: Float, elevation: Float) {
        renderer.showroomZoom = zoom.coerceIn(0.42f, 1.45f)
        renderer.showroomElev = elevation.coerceIn(0.02f, 1.15f)
    }

    override fun leaveShowroom() {
        renderer.showroomDragging = false
        renderer.showroomZoom = 1f
        renderer.showroomElev = 0.18f
        val car = selectedOwnedCar()
        val color = save.paintColor(car)
        glView.queueEvent {
            world.configureCar(car, color, 0, 0, 0, 0)
            world.startAttract()
        }
    }

    // ================================================================= settings
    override fun applySettings() {
        renderer.qualityLevel = save.graphics
        renderer.autoQuality = save.autoQuality
        renderer.cameraShakeEnabled = save.cameraShake
        audio.sfxEnabled = save.sfxOn
        audio.musicEnabled = save.musicOn
        audio.station = save.prefInt("radio_station").coerceIn(0, AudioEngine.NUM_STATIONS - 1)
        audio.muted = save.muted
        hud.showFps = save.showFps
        tilt.sensitivity = save.sensitivity
        tilt.offset = save.tiltOffset
        useTilt = tilt.available && save.controlMode == SaveManager.CONTROL_TILT
        input.useTilt = useTilt
        input.autoGas = save.autoGas
        if (hud.touchSteering == useTilt) hud.touchSteering = !useTilt
        updateTiltListening()
    }

    private fun updateTiltListening() {
        if (activityResumed && inRace && !racePaused && useTilt) tilt.start() else tilt.stop()
    }

    override fun changeLanguage(lang: String) {
        save.language = lang
        reopenSettings = true
        recreate()
    }

    override fun calibrateTilt() {
        if (!tilt.available) {
            toast(getString(R.string.no_tilt_sensor), Ui.YELLOW)
            return
        }
        tilt.start()
        handler.postDelayed({
            save.tiltOffset = tilt.calibrate()
            toast(getString(R.string.calibrated), Ui.GREEN)
            updateTiltListening()
        }, 400)
    }

    // ================================================================= feedback
    override fun sfx(id: Int) = audio.trigger(id)

    override fun toast(msg: String, color: Int) {
        toastView.text = msg
        toastView.setTextColor(color)
        toastView.background = Ui.bg(0xEE070A14.toInt(), Ui.withAlpha(color, 0xAA), 16f, 1.4f)
        toastView.visibility = View.VISIBLE
        toastView.animate().cancel()
        toastView.translationY = Ui.dp(20f).toFloat()
        toastView.animate().alpha(1f).translationY(0f).setDuration(200).start()
        handler.removeCallbacks(hideToast)
        handler.postDelayed(hideToast, 2200)
    }

    private val hideToast = Runnable {
        toastView.animate().alpha(0f).setDuration(300).withEndAction { toastView.visibility = View.GONE }.start()
    }

    override fun confirm(msg: String, onYes: () -> Unit) {
        dismissConfirm()
        val overlay = FrameLayout(this)
        overlay.setBackgroundColor(0xB0000000.toInt())
        overlay.isClickable = true
        overlay.layoutDirection = Lang.layoutDirection
        val p = Ui.panel(this, true, Ui.withAlpha(Ui.PINK, 0x99))
        p.gravity = Gravity.CENTER_HORIZONTAL
        val t = Ui.text(this, msg, 16f, Ui.TEXT, Ui.bold)
        t.gravity = Gravity.CENTER
        p.addView(t, LinearLayout.LayoutParams(Ui.MATCH, Ui.WRAP))
        val row = Ui.hbox(this)
        val lp1 = LinearLayout.LayoutParams(0, Ui.WRAP, 1f).also { it.marginEnd = Ui.dp(6f) }
        val lp2 = LinearLayout.LayoutParams(0, Ui.WRAP, 1f).also { it.marginStart = Ui.dp(6f) }
        row.addView(Ui.button(this, getString(R.string.yes), Ui.GREEN, true, 16f) {
            dismissConfirm()
            onYes()
        }, lp1)
        row.addView(Ui.button(this, getString(R.string.no), Ui.RED, false, 16f) { dismissConfirm() }, lp2)
        p.addView(row, LinearLayout.LayoutParams(Ui.MATCH, Ui.WRAP).also { it.topMargin = Ui.dp(16f) })
        overlay.addView(p, FrameLayout.LayoutParams(minOf(Ui.dp(360f), resources.displayMetrics.widthPixels - Ui.dp(40f)), Ui.WRAP, Gravity.CENTER))
        overlay.setOnClickListener { dismissConfirm() }
        p.isClickable = true
        root.addView(overlay, FrameLayout.LayoutParams(Ui.MATCH, Ui.MATCH))
        overlay.alpha = 0f
        overlay.animate().alpha(1f).setDuration(160).start()
        p.scaleX = 0.88f; p.scaleY = 0.88f
        p.animate().scaleX(1f).scaleY(1f).setDuration(220).start()
        confirmView = overlay
    }

    private fun dismissConfirm() {
        val v = confirmView ?: return
        confirmView = null
        root.removeView(v)
    }

    private fun vibrate(ms: Long, amplitude: Int) {
        if (!save.vibration) return
        val v = vibrator ?: return
        if (!v.hasVibrator()) return
        try {
            v.vibrate(VibrationEffect.createOneShot(ms, if (v.hasAmplitudeControl()) amplitude else VibrationEffect.DEFAULT_AMPLITUDE))
        } catch (_: Exception) {
        }
    }

    override fun exitGame() {
        finishAffinity()
    }

    // ================================================================= HudView.Listener
    override fun onPausePressed() = pauseRace()
    override fun onPhonePressed() = openPhone()
    override fun onHudFrame(state: Int) {}
    override fun onButtonHaptic() {
        if (save.vibration) hud.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP)
    }

    // ================================================================= GameListener (GL thread)
    override fun onNearMiss(points: Int, combo: Int, oncoming: Boolean) {
        handler.post { vibrate(18, 70) }
    }

    override fun onTaxiFare(coins: Int, stars: Int) {
        handler.post {
            save.putPrefInt("stat_taxi_rides", save.prefInt("stat_taxi_rides") + 1)
            save.putPrefLong("stat_taxi_coins", save.prefLong("stat_taxi_coins") + coins)
            save.putPrefInt("stat_taxi_stars", save.prefInt("stat_taxi_stars") + stars)
            val i = (System.nanoTime() % com.amin.racing3d.core.Messages.PASSENGERS_FA.size).toInt().let { if (it < 0) -it else it }
            val q = (System.nanoTime() / 7 % 2).toInt().let { if (it < 0) -it else it }
            val st = stars.coerceIn(1, 5)
            val starsTxt = "★".repeat(st) + "☆".repeat(5 - st)
            messages.add("🚕", com.amin.racing3d.core.Messages.PASSENGERS_FA[i], com.amin.racing3d.core.Messages.PASSENGERS_EN[i],
                starsTxt + "  " + com.amin.racing3d.core.Messages.REVIEWS_FA[st - 1][q] + "  (+" + Lang.num(coins) + ")",
                starsTxt + "  " + com.amin.racing3d.core.Messages.REVIEWS_EN[st - 1][q] + "  (+" + Lang.num(coins) + ")")
            vibrate(40, 120)
        }
    }

    override fun onHardBrake(strength: Float) {
        handler.post { vibrate((14 + 22 * strength).toLong(), (60 + 120 * strength).toInt()) }
    }

    override fun onCrash() {
        handler.post { vibrate(260, 255) }
    }

    override fun onCheckpoint(bonusSeconds: Int) {
        hud.checkpointBonus = bonusSeconds
        handler.post { vibrate(40, 120) }
    }

    override fun onGameOver() {
        val mode = world.mode
        val score = world.score.toInt()
        val distance = world.distance
        val top = world.topSpeedKmh.toInt()
        val near = world.nearMisses
        val combo = world.bestCombo
        val earned = world.coinsEarned()
        val timeUp = world.crashedReason == World.REASON_TIME
        val car = world.carId
        val env = world.env
        var racers = 0
        for (r in world.rivals) if (r.active && !r.cop) racers++
        val extra = RunResult(mode, score, distance, top, near, combo, earned, timeUp, false, 0,
            world.crashedReason, world.success, world.medal, world.position, racers + 1, world.raceTime, world.escapes, world.takedowns)
        handler.post { finishRun(mode, score, distance, top, near, combo, earned, timeUp, car, env, extra) }
    }

    // ================================================================= RendererCallbacks (GL thread)
    override fun onGlReady() {
        handler.post {
            if (glReady) return@post
            glReady = true
            val lv = loadingView
            if (lv != null) {
                // 100 %: engine start-up, then a smooth cross-fade into the main menu
                audio.trigger(AudioEngine.SFX_ENGINE_START)
                lv.findViewWithTag<TextView>("msg")?.text = getString(R.string.load_done)
                lv.animate().alpha(0f).setStartDelay(700).setDuration(600).withEndAction {
                    root.removeView(lv)
                }.start()
                loadingView = null
                handler.postDelayed({ showMenuAfterLoad() }, 750)
            } else showMenuAfterLoad()
        }
    }

    // ================================================================= update check (GitHub releases)
    private var updateResult: UpdateChecker.Result? = null
    /** once per app process (survives recreate() on language change) */
    private var updateDialogShown: Boolean
        get() = UpdateChecker.dialogShown
        set(v) { UpdateChecker.dialogShown = v }
    private var menuReady = false
    private var updateView: View? = null
    private var updateChecking = false

    private fun startUpdateCheck(manual: Boolean) {
        if (!manual && !save.autoUpdateCheck) {
            setUpdateStatus(getString(R.string.upd_disabled), Ui.DIM)
            return
        }
        if (updateChecking) return
        updateChecking = true
        setUpdateStatus(getString(R.string.upd_checking), Ui.DIM)
        UpdateChecker.check(this) { r ->
            updateChecking = false
            updateResult = r
            when (r.state) {
                UpdateChecker.OFFLINE -> setUpdateStatus(getString(R.string.upd_offline), Ui.DIM)
                UpdateChecker.FAILED -> setUpdateStatus(getString(R.string.upd_failed), Ui.YELLOW)
                UpdateChecker.UP_TO_DATE -> setUpdateStatus(getString(R.string.upd_latest, Lang.digits(r.current)), Ui.GREEN)
                UpdateChecker.AVAILABLE -> setUpdateStatus(getString(R.string.upd_available, Lang.digits(r.latest ?: "")), Ui.YELLOW)
            }
            if (manual) {
                when (r.state) {
                    UpdateChecker.AVAILABLE -> showUpdateDialog(r)
                    UpdateChecker.OFFLINE -> toast(getString(R.string.upd_offline), Ui.YELLOW)
                    UpdateChecker.FAILED -> toast(getString(R.string.upd_failed), Ui.YELLOW)
                    else -> toast(getString(R.string.upd_latest, Lang.digits(r.current)), Ui.GREEN)
                }
            } else maybeShowUpdateDialog()
        }
    }

    private fun setUpdateStatus(msg: String, color: Int) {
        val t = loadingView?.findViewWithTag<TextView>("upd") ?: return
        t.text = msg
        t.setTextColor(color)
    }

    override fun checkUpdatesNow() = startUpdateCheck(manual = true)

    /** After loading, on the menu only (never interrupts a race); once per launch; respects "skip". */
    private fun maybeShowUpdateDialog() {
        val r = updateResult ?: return
        if (r.state != UpdateChecker.AVAILABLE || !menuReady || inRace || updateDialogShown) return
        if (save.skippedUpdate == r.latest) return
        handler.postDelayed({ if (!inRace && updateView == null) showUpdateDialog(r) }, 700)
    }

    private fun showUpdateDialog(r: UpdateChecker.Result) {
        dismissUpdateDialog()
        updateDialogShown = true
        val overlay = FrameLayout(this)
        overlay.setBackgroundColor(0xB0000000.toInt())
        overlay.isClickable = true
        overlay.layoutDirection = Lang.layoutDirection
        val p = Ui.panel(this, true, Ui.withAlpha(Ui.GREEN, 0xAA))
        p.gravity = Gravity.CENTER_HORIZONTAL
        p.isClickable = true
        p.addView(Ui.glowTitle(this, getString(R.string.upd_dialog_title), 22f, Ui.GREEN), LinearLayout.LayoutParams(Ui.WRAP, Ui.WRAP))
        val vers = Ui.text(this, getString(R.string.upd_versions, Lang.digits(r.current), Lang.digits(r.latest ?: "")), 14f, Ui.TEXT, Ui.bold)
        vers.gravity = Gravity.CENTER
        p.addView(vers, LinearLayout.LayoutParams(Ui.MATCH, Ui.WRAP).also { it.topMargin = Ui.dp(8f) })
        val notes = r.notes
        if (notes != null) {
            val sv = ScrollView(this)
            val nt = Ui.text(this, notes, 12f, Ui.DIM)
            nt.textDirection = View.TEXT_DIRECTION_FIRST_STRONG
            sv.addView(nt)
            p.addView(sv, LinearLayout.LayoutParams(Ui.MATCH, Ui.dp(96f)).also { it.topMargin = Ui.dp(8f) })
        }
        p.addView(Ui.text(this, getString(R.string.upd_hint), 11f, Ui.DIM), LinearLayout.LayoutParams(Ui.MATCH, Ui.WRAP).also { it.topMargin = Ui.dp(8f) })
        val row = Ui.hbox(this)
        val lp1 = LinearLayout.LayoutParams(0, Ui.WRAP, 1f).also { it.marginEnd = Ui.dp(6f) }
        val lp2 = LinearLayout.LayoutParams(0, Ui.WRAP, 1f).also { it.marginStart = Ui.dp(6f) }
        row.addView(Ui.button(this, getString(R.string.upd_download), Ui.GREEN, true, 16f) {
            dismissUpdateDialog()
            openUrl(r.pageUrl ?: UpdateChecker.RELEASES_PAGE)
        }, lp1)
        row.addView(Ui.button(this, getString(R.string.upd_later), Ui.CYAN, false, 15f) { dismissUpdateDialog() }, lp2)
        p.addView(row, LinearLayout.LayoutParams(Ui.MATCH, Ui.WRAP).also { it.topMargin = Ui.dp(12f) })
        val skip = Ui.text(this, getString(R.string.upd_skip), 12f, Ui.DIM, Ui.bold)
        skip.gravity = Gravity.CENTER
        skip.setPadding(0, Ui.dp(10f), 0, Ui.dp(2f))
        skip.setOnClickListener { save.skippedUpdate = r.latest ?: ""; dismissUpdateDialog() }
        p.addView(skip, LinearLayout.LayoutParams(Ui.MATCH, Ui.WRAP))
        overlay.addView(p, FrameLayout.LayoutParams(minOf(Ui.dp(400f), resources.displayMetrics.widthPixels - Ui.dp(40f)), Ui.WRAP, Gravity.CENTER))
        overlay.setOnClickListener { dismissUpdateDialog() }
        root.addView(overlay, FrameLayout.LayoutParams(Ui.MATCH, Ui.MATCH))
        overlay.alpha = 0f
        overlay.animate().alpha(1f).setDuration(180).start()
        p.scaleX = 0.88f; p.scaleY = 0.88f
        p.animate().scaleX(1f).scaleY(1f).setDuration(240).start()
        updateView = overlay
        audio.trigger(AudioEngine.SFX_CHECKPOINT)
    }

    private fun dismissUpdateDialog() {
        updateView?.let { root.removeView(it) }
        updateView = null
    }

    private fun openUrl(url: String) {
        try {
            startActivity(Intent(Intent.ACTION_VIEW, android.net.Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        } catch (e: Exception) {
            toast(getString(R.string.upd_no_browser), Ui.YELLOW)
        }
    }

    private fun showMenuAfterLoad() {
        menuReady = true
        replaceAll(MainMenuScreen(this))
        if (reopenSettings) {
            reopenSettings = false
            push(SettingsScreen(this))
        }
        handleDemoIntent(intent)
        maybeShowUpdateDialog()
    }

    override fun onFps(fps: Int) {
        hud.fps = fps
    }

    override fun onAutoQualityDrop(newLevel: Int) {
        handler.post {
            save.graphics = newLevel
            hud.showMessage(getString(R.string.hud_gfx_lowered))
        }
    }

    override fun onGlError(message: String) {
        handler.post {
            val lv = loadingView ?: return@post
            lv.findViewWithTag<View>("tip")?.visibility = View.GONE
            val msg = lv.findViewWithTag<TextView>("msg") ?: return@post
            msg.animate().cancel()
            msg.alpha = 1f
            msg.setTextColor(Ui.RED)
            msg.text = "OpenGL ES 3.0 error:\n$message"
        }
    }

    companion object {
        private const val KEY_SETTINGS = "reopen_settings"
        private const val EXTRA_DEMO = "demo"
        private const val EXTRA_LANG = "lang"
    }
}
