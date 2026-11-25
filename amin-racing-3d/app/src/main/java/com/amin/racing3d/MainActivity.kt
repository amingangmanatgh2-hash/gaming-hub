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
import android.widget.TextView
import com.amin.racing3d.audio.AudioEngine
import com.amin.racing3d.core.Lang
import com.amin.racing3d.core.SaveManager
import com.amin.racing3d.core.ScoreEntry
import com.amin.racing3d.game.GameData
import com.amin.racing3d.game.GameListener
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
import com.amin.racing3d.ui.Screen
import com.amin.racing3d.ui.SettingsScreen
import com.amin.racing3d.ui.Ui

/**
 * Single activity hosting the OpenGL ES 3.0 view, the Canvas HUD and the view-based menus.
 */
class MainActivity : Activity(), GameHost, GameListener, RendererCallbacks, HudView.Listener {

    override lateinit var save: SaveManager
    override val activity: Activity get() = this
    override val tiltAvailable: Boolean get() = tilt.available

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

        Ui.onClickSound = { audio.trigger(AudioEngine.SFX_CLICK) }
        Ui.onHaptic = { v -> v.performHapticFeedback(HapticFeedbackConstants.VIRTUAL_KEY) }

        buildLayout()
        applySettings()
        tilt.displayRotation = currentRotation()

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

    private fun buildLoading(): View {
        val f = FrameLayout(this)
        f.setBackgroundColor(Ui.BG)
        f.isClickable = true
        val col = Ui.vbox(this, Gravity.CENTER)
        col.addView(Ui.glowTitle(this, "AMIN RACING", 38f, Ui.CYAN))
        col.addView(Ui.glowTitle(this, "3D", 30f, Ui.PINK))
        val t = Ui.text(this, getString(R.string.loading), 14f, Ui.DIM, Ui.bold)
        t.gravity = Gravity.CENTER
        t.tag = "msg"
        col.addView(t, LinearLayout.LayoutParams(Ui.WRAP, Ui.WRAP).also { it.topMargin = Ui.dp(18f) })
        t.animate().alpha(0.4f).setDuration(700).withEndAction {
            t.animate().alpha(1f).setDuration(700).start()
        }.start()
        f.addView(col, FrameLayout.LayoutParams(Ui.MATCH, Ui.MATCH))
        return f
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
        if (i.hasExtra("mode")) save.selectedMode = i.getIntExtra("mode", save.selectedMode).coerceIn(0, 2)
        if (i.hasExtra("env")) {
            val e = i.getIntExtra("env", 0).coerceIn(0, GameData.envs.size - 1)
            save.unlockEnv(e)
            save.selectedEnv = e
        }
        if (i.hasExtra("tod")) save.selectedTod = i.getIntExtra("tod", 0).coerceIn(0, 3)
        if (i.hasExtra("autogas")) save.autoGas = i.getBooleanExtra("autogas", true)
        dismissConfirm()
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

    override fun startRace() {
        val car = selectedOwnedCar()
        val color = save.paintColor(car)
        val lSpeed = save.upgradeLevel(car, GameData.UPG_SPEED)
        val lHandling = save.upgradeLevel(car, GameData.UPG_HANDLING)
        val lBrakes = save.upgradeLevel(car, GameData.UPG_BRAKES)
        val lNitro = save.upgradeLevel(car, GameData.UPG_NITRO)
        val mode = save.selectedMode
        val env = if (save.isEnvUnlocked(save.selectedEnv)) save.selectedEnv else GameData.ENV_CITY
        val tod = save.selectedTod
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
            world.startRace(mode, env, tod)
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

    override fun restartRace() = startRace()

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

    private fun finishRun(mode: Int, score: Int, distance: Float, topSpeed: Int, near: Int, combo: Int,
                          earned: Int, timeUp: Boolean, car: Int, env: Int) {
        if (!inRace) return
        inRace = false
        racePaused = false
        input.reset()
        hud.visibility = View.GONE
        updateTiltListening()
        save.addCoins(earned)
        val record = save.submitScore(mode, ScoreEntry(score, car, env, distance.toInt(), System.currentTimeMillis()))
        val result = RunResult(mode, score, distance, topSpeed, near, combo, earned, timeUp, record, save.highScore(mode))
        replaceAll(GameOverScreen(this, result))
        if (record) audio.trigger(AudioEngine.SFX_CHECKPOINT)
    }

    // ================================================================= showroom
    override fun showroom(car: Int, color: Int) {
        renderer.showroomCar = car
        renderer.showroomColor = color
        glView.queueEvent {
            if (world.state != World.STATE_SHOWROOM) world.startShowroom()
        }
    }

    override fun rotateShowroom(deltaRadians: Float, dragging: Boolean) {
        renderer.showroomDragging = dragging
        renderer.showroomYaw = renderer.showroomYaw + deltaRadians
    }

    override fun leaveShowroom() {
        renderer.showroomDragging = false
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
    override fun onHudFrame(state: Int) {}
    override fun onButtonHaptic() {
        if (save.vibration) hud.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP)
    }

    // ================================================================= GameListener (GL thread)
    override fun onNearMiss(points: Int, combo: Int, oncoming: Boolean) {
        handler.post { vibrate(18, 70) }
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
        handler.post { finishRun(mode, score, distance, top, near, combo, earned, timeUp, car, env) }
    }

    // ================================================================= RendererCallbacks (GL thread)
    override fun onGlReady() {
        handler.post {
            if (glReady) return@post
            glReady = true
            val lv = loadingView
            if (lv != null) {
                lv.animate().alpha(0f).setDuration(450).withEndAction {
                    root.removeView(lv)
                }.start()
                loadingView = null
            }
            replaceAll(MainMenuScreen(this))
            if (reopenSettings) {
                reopenSettings = false
                push(SettingsScreen(this))
            }
            handleDemoIntent(intent)
        }
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
