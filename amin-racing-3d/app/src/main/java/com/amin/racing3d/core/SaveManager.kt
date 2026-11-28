package com.amin.racing3d.core

import android.content.Context
import android.content.SharedPreferences
import com.amin.racing3d.game.GameData

/** One entry in the local scoreboard. */
class ScoreEntry(val score: Int, val car: Int, val env: Int, val distance: Int, val time: Long)

/**
 * Persistent offline storage based on SharedPreferences.
 * Stores coins, garage, upgrades, paints, high scores, settings and unlocked environments.
 */
class SaveManager(context: Context) {
    private val prefs: SharedPreferences =
        context.applicationContext.getSharedPreferences("amin_racing_3d_save", Context.MODE_PRIVATE)

    init { migrate() }

    // ----- raw access for the progression system (new keys only) ----------------------------
    fun prefInt(key: String, def: Int = 0): Int = prefs.getInt(key, def)
    fun putPrefInt(key: String, v: Int) = prefs.edit().putInt(key, v).apply()
    fun prefLong(key: String, def: Long = 0L): Long = prefs.getLong(key, def)
    fun putPrefLong(key: String, v: Long) = prefs.edit().putLong(key, v).apply()
    fun prefString(key: String, def: String = ""): String = prefs.getString(key, def) ?: def
    fun putPrefString(key: String, v: String) = prefs.edit().putString(key, v).apply()

    // ----- Garage 2.0 customization (per car; option 0 is always owned) ----------------------
    fun custom(car: Int, cat: Int): Int = prefs.getInt("cus_${cat}_$car", 0)
    fun setCustom(car: Int, cat: Int, opt: Int) = prefs.edit().putInt("cus_${cat}_$car", opt).apply()
    fun ownsCustom(car: Int, cat: Int, opt: Int): Boolean = opt == 0 || (prefs.getInt("cusown_${cat}_$car", 0) and (1 shl opt)) != 0
    fun setOwnsCustom(car: Int, cat: Int, opt: Int) {
        prefs.edit().putInt("cusown_${cat}_$car", prefs.getInt("cusown_${cat}_$car", 0) or (1 shl opt)).apply()
    }
    /** all categories of a car (selected options) */
    fun customs(car: Int): IntArray = IntArray(GameData.NUM_CUS) { custom(car, it) }

    // ----- Economy -------------------------------------------------------------------------
    var coins: Int
        get() = prefs.getInt(K_COINS, START_COINS)
        set(v) = prefs.edit().putInt(K_COINS, v.coerceAtLeast(0)).apply()

    fun spend(amount: Int): Boolean {
        if (coins < amount) return false
        coins -= amount
        return true
    }

    fun addCoins(amount: Int) {
        coins += amount
    }

    // ----- Garage --------------------------------------------------------------------------
    fun isCarOwned(id: Int): Boolean = (prefs.getInt(K_OWNED, 1) and (1 shl id)) != 0

    fun setCarOwned(id: Int) {
        prefs.edit().putInt(K_OWNED, prefs.getInt(K_OWNED, 1) or (1 shl id)).apply()
    }

    /**
     * Atomic car purchase (v2.1). Never charges twice: an owned car returns [BUY_OWNED] without
     * touching the coins, and coins + ownership are written in one commit.
     */
    @Synchronized
    fun buyCar(id: Int): Int {
        if (id !in GameData.cars.indices) return BUY_INVALID
        if (isCarOwned(id)) return BUY_OWNED
        val price = GameData.cars[id].price
        val c = coins
        if (c < price) return BUY_NO_MONEY
        prefs.edit()
            .putInt(K_COINS, c - price)
            .putInt(K_OWNED, prefs.getInt(K_OWNED, 1) or (1 shl id))
            .putInt(K_SELECTED_CAR, id)
            .commit()
        return BUY_OK
    }

    /** shop sort: 0 cheapest, 1 most expensive, 2 performance, 3 category */
    var shopSort: Int
        get() = prefs.getInt("shop_sort", 0).coerceIn(0, 3)
        set(v) = prefs.edit().putInt("shop_sort", v.coerceIn(0, 3)).apply()

    var selectedCar: Int
        get() = prefs.getInt(K_SELECTED_CAR, 0).coerceIn(0, GameData.cars.size - 1)
        set(v) = prefs.edit().putInt(K_SELECTED_CAR, v).apply()

    fun upgradeLevel(car: Int, type: Int): Int = prefs.getInt("upg_${car}_$type", 0)

    fun setUpgradeLevel(car: Int, type: Int, level: Int) {
        prefs.edit().putInt("upg_${car}_$type", level.coerceIn(0, GameData.MAX_UPGRADE)).apply()
    }

    fun paintIndex(car: Int): Int = prefs.getInt("paint_$car", defaultPaint(car))

    fun setPaintIndex(car: Int, idx: Int) {
        prefs.edit().putInt("paint_$car", idx).apply()
    }

    private fun defaultPaint(car: Int) = when (car) {
        GameData.CAR_SPORTS -> 0
        GameData.CAR_MUSCLE -> 2
        GameData.CAR_SUV -> 7
        GameData.CAR_CLASSIC -> 6
        GameData.CAR_SEDAN -> 9
        GameData.CAR_PICKUP -> 4
        GameData.CAR_OFFROAD -> 3
        GameData.CAR_POLICE -> 7
        GameData.CAR_RACE -> 2
        GameData.CAR_HATCH -> 1
        GameData.CAR_EV -> 6
        GameData.CAR_TAXI -> 2
        GameData.CAR_DRIFT -> 5
        else -> 1
    }

    fun paintColor(car: Int): Int {
        val p = GameData.PAINT_PALETTE
        return p[paintIndex(car).coerceIn(0, p.size - 1)]
    }

    // ----- Environments / selection -------------------------------------------------------
    fun isEnvUnlocked(id: Int): Boolean = (prefs.getInt(K_ENVS, 1) and (1 shl id)) != 0

    fun unlockEnv(id: Int) {
        prefs.edit().putInt(K_ENVS, prefs.getInt(K_ENVS, 1) or (1 shl id)).apply()
    }

    var selectedEnv: Int
        get() = prefs.getInt(K_SEL_ENV, 0)
        set(v) = prefs.edit().putInt(K_SEL_ENV, v).apply()

    var selectedMode: Int
        get() = prefs.getInt(K_SEL_MODE, GameData.MODE_TWO_WAY)
        set(v) = prefs.edit().putInt(K_SEL_MODE, v).apply()

    var selectedTod: Int
        get() = prefs.getInt(K_SEL_TOD, GameData.TOD_DAY)
        set(v) = prefs.edit().putInt(K_SEL_TOD, v).apply()

    /** v2: weather for the next run (0 = sunny; older saves have no key and get sunny) */
    var selectedWeather: Int
        get() = prefs.getInt("sel_weather", GameData.W_CLEAR).coerceIn(0, GameData.weatherNames.size - 1)
        set(v) = prefs.edit().putInt("sel_weather", v).apply()

    /** check GitHub for a newer version while the game loads (only when online) */
    var autoUpdateCheck: Boolean
        get() = prefs.getBoolean("auto_update_check", true)
        set(v) = prefs.edit().putBoolean("auto_update_check", v).apply()

    /** version the player chose to skip in the update dialog */
    var skippedUpdate: String
        get() = prefs.getString("skipped_update", "") ?: ""
        set(v) = prefs.edit().putString("skipped_update", v).apply()

    // ----- Story ---------------------------------------------------------------------------
    /** number of story missions completed in order (mission i is unlocked when i <= progress) */
    var storyProgress: Int
        get() = prefs.getInt("story_progress", 0)
        set(v) = prefs.edit().putInt("story_progress", v).apply()

    fun storyCompleted(mission: Int): Boolean = prefs.getBoolean("story_done_$mission", false)

    /** Records a passed mission. Returns true the first time (reward is paid only once). */
    fun completeStoryMission(mission: Int): Boolean {
        val first = !storyCompleted(mission)
        val e = prefs.edit().putBoolean("story_done_$mission", true)
        if (mission + 1 > storyProgress) e.putInt("story_progress", mission + 1)
        e.apply()
        return first
    }

    /** best medal per mode (0 none .. 3 gold) */
    fun bestMedal(mode: Int): Int = prefs.getInt("medal_$mode", 0)

    fun submitMedal(mode: Int, medal: Int) {
        if (medal > bestMedal(mode)) prefs.edit().putInt("medal_$mode", medal).apply()
    }

    // ----- Scores -----------------------------------------------------------------------------
    fun highScore(mode: Int): Int = prefs.getInt("hs_$mode", 0)

    fun scores(mode: Int): List<ScoreEntry> {
        val raw = prefs.getString("board_$mode", "") ?: ""
        if (raw.isEmpty()) return emptyList()
        val out = ArrayList<ScoreEntry>()
        for (part in raw.split(';')) {
            val f = part.split(':')
            if (f.size < 5) continue
            try {
                out.add(ScoreEntry(f[0].toInt(), f[1].toInt(), f[2].toInt(), f[3].toInt(), f[4].toLong()))
            } catch (_: NumberFormatException) {
            }
        }
        return out
    }

    /** Records a finished run. Returns true when it is a new personal best for the mode. */
    fun submitScore(mode: Int, entry: ScoreEntry): Boolean {
        val list = ArrayList(scores(mode))
        list.add(entry)
        list.sortByDescending { it.score }
        while (list.size > 10) list.removeAt(list.size - 1)
        val serialized = list.joinToString(";") { "${it.score}:${it.car}:${it.env}:${it.distance}:${it.time}" }
        val best = highScore(mode)
        val isRecord = entry.score > best
        val e = prefs.edit().putString("board_$mode", serialized)
        if (isRecord) e.putInt("hs_$mode", entry.score)
        e.putLong(K_TOTAL_DIST, prefs.getLong(K_TOTAL_DIST, 0L) + entry.distance)
        e.apply()
        return isRecord
    }

    // ----- Settings ---------------------------------------------------------------------------
    var language: String
        get() = prefs.getString(K_LANG, Lang.FA) ?: Lang.FA
        set(v) = prefs.edit().putString(K_LANG, v).apply()

    /** 0 = tilt, 1 = touch buttons, 2 = virtual steering wheel (v2.1) */
    var controlMode: Int
        get() = prefs.getInt(K_CONTROL, CONTROL_TILT).coerceIn(0, 2)
        set(v) = prefs.edit().putInt(K_CONTROL, v.coerceIn(0, 2)).apply()

    // ---- v2.1 control tuning (new keys; defaults reproduce the v2.0 feel)
    private fun f(key: String, def: Float) = prefs.getFloat(key, def)
    private fun putF(key: String, v: Float) = prefs.edit().putFloat(key, v.coerceIn(0f, 1f)).apply()
    /** button / wheel steering sensitivity 0..1 (how fast and how far the wheels turn) */
    var steerSens: Float get() = f("ctl_steer", 0.5f); set(v) = putF("ctl_steer", v)
    /** throttle response 0..1 (0 = gentle pedal, 1 = instant full throttle) */
    var gasSens: Float get() = f("ctl_gas", 0.6f); set(v) = putF("ctl_gas", v)
    /** brake response 0..1 (bite speed and maximum force) */
    var brakeSens: Float get() = f("ctl_brake", 0.6f); set(v) = putF("ctl_brake", v)
    /** dead zone for tilt and wheel 0..1 (mapped to 0..20 % of the travel) */
    var deadZone: Float get() = f("ctl_dead", 0.15f); set(v) = putF("ctl_dead", v)
    /** steering smoothing 0..1 */
    var steerSmoothing: Float get() = f("ctl_smooth", 0.35f); set(v) = putF("ctl_smooth", v)
    /** response curve: 0 linear, 1 progressive (precise centre), 2 aggressive (quick centre) */
    var steerCurve: Int
        get() = prefs.getInt("ctl_curve", 1).coerceIn(0, 2)
        set(v) = prefs.edit().putInt("ctl_curve", v.coerceIn(0, 2)).apply()
    /** HUD button size 0..1 (0.5 = default) */
    var hudScale: Float get() = f("hud_scale", 0.5f); set(v) = putF("hud_scale", v)
    /** HUD button opacity 0..1 */
    var hudAlpha: Float get() = f("hud_alpha", 0.85f); set(v) = putF("hud_alpha", v)
    /** 0 = pedals right / steering left, 1 = mirrored */
    var hudMirror: Boolean
        get() = prefs.getBoolean("hud_mirror", false)
        set(v) = prefs.edit().putBoolean("hud_mirror", v).apply()
    /** custom position of a HUD control group, as offset in fractions of the screen (0 = default) */
    fun hudOffset(group: Int): FloatArray = floatArrayOf(prefs.getFloat("hud_off_x_$group", 0f), prefs.getFloat("hud_off_y_$group", 0f))
    fun setHudOffset(group: Int, x: Float, y: Float) =
        prefs.edit().putFloat("hud_off_x_$group", x.coerceIn(-1f, 1f)).putFloat("hud_off_y_$group", y.coerceIn(-1f, 1f)).apply()
    fun resetHudLayout() {
        val e = prefs.edit()
        for (g in 0 until 8) { e.remove("hud_off_x_$g"); e.remove("hud_off_y_$g") }
        e.remove("hud_scale"); e.remove("hud_alpha"); e.remove("hud_mirror"); e.apply()
    }
    /** render resolution option (index into MainActivity.RENDER_SCALES, 0 = automatic) */
    var renderScale: Int
        get() = prefs.getInt("render_scale", 0).coerceIn(0, 4)
        set(v) = prefs.edit().putInt("render_scale", v.coerceIn(0, 4)).apply()

    var sensitivity: Float
        get() = prefs.getFloat(K_SENS, 0.55f)
        set(v) = prefs.edit().putFloat(K_SENS, v.coerceIn(0f, 1f)).apply()

    var tiltOffset: Float
        get() = prefs.getFloat(K_TILT_OFFSET, 0f)
        set(v) = prefs.edit().putFloat(K_TILT_OFFSET, v).apply()

    /** 0 low, 1 medium, 2 high */
    var graphics: Int
        get() = prefs.getInt(K_GFX, 1)
        set(v) = prefs.edit().putInt(K_GFX, v.coerceIn(0, 3)).apply()

    // ---- profile & progression (v2; new keys only, existing v1 data is untouched)
    var xp: Int
        get() = prefs.getInt("xp", 0)
        set(v) = prefs.edit().putInt("xp", v.coerceAtLeast(0)).apply()

    /** Level n needs 50*n*(n+1) XP in total (100, 300, 600, ...). */
    fun level(): Int {
        val x = xp
        var n = 0
        while (50 * (n + 1) * (n + 2) <= x) n++
        return n + 1
    }

    /** progress (0..1) from the current level to the next */
    fun levelProgress(): Float {
        val lv = level() - 1
        val a = 50 * lv * (lv + 1)
        val b = 50 * (lv + 1) * (lv + 2)
        return ((xp - a).toFloat() / (b - a)).coerceIn(0f, 1f)
    }

    var totalRuns: Int
        get() = prefs.getInt("stat_runs", 0)
        set(v) = prefs.edit().putInt("stat_runs", v).apply()

    var totalMeters: Long
        get() = prefs.getLong("stat_meters", 0L)
        set(v) = prefs.edit().putLong("stat_meters", v).apply()

    var totalNearMisses: Int
        get() = prefs.getInt("stat_near", 0)
        set(v) = prefs.edit().putInt("stat_near", v).apply()

    var bestTopSpeed: Int
        get() = prefs.getInt("stat_top_speed", 0)
        set(v) = prefs.edit().putInt("stat_top_speed", v).apply()

    /** Records a finished run in the statistics and returns the XP earned. */
    fun recordRun(score: Int, meters: Float, nearMisses: Int, topSpeed: Int): Int {
        val gained = 5 + score / 25 + nearMisses * 2
        xp += gained
        totalRuns += 1
        totalMeters += meters.toLong()
        totalNearMisses += nearMisses
        if (topSpeed > bestTopSpeed) bestTopSpeed = topSpeed
        return gained
    }

    var autoQuality: Boolean
        get() = prefs.getBoolean(K_AUTO_Q, true)
        set(v) = prefs.edit().putBoolean(K_AUTO_Q, v).apply()

    var sfxOn: Boolean
        get() = prefs.getBoolean(K_SFX, true)
        set(v) = prefs.edit().putBoolean(K_SFX, v).apply()

    var musicOn: Boolean
        get() = prefs.getBoolean(K_MUSIC, true)
        set(v) = prefs.edit().putBoolean(K_MUSIC, v).apply()

    var muted: Boolean
        get() = prefs.getBoolean(K_MUTE, false)
        set(v) = prefs.edit().putBoolean(K_MUTE, v).apply()

    var cameraShake: Boolean
        get() = prefs.getBoolean(K_SHAKE, true)
        set(v) = prefs.edit().putBoolean(K_SHAKE, v).apply()

    var showFps: Boolean
        get() = prefs.getBoolean(K_FPS, false)
        set(v) = prefs.edit().putBoolean(K_FPS, v).apply()

    var vibration: Boolean
        get() = prefs.getBoolean(K_VIBRATE, true)
        set(v) = prefs.edit().putBoolean(K_VIBRATE, v).apply()

    var autoGas: Boolean
        get() = prefs.getBoolean(K_AUTOGAS, false)
        set(v) = prefs.edit().putBoolean(K_AUTOGAS, v).apply()

    var firstLaunchDone: Boolean
        get() = prefs.getBoolean(K_FIRST, false)
        set(v) = prefs.edit().putBoolean(K_FIRST, v).apply()

    /**
     * Save-schema migration. v1.0/v2.0 saves have no schema key (=0); every v2.1 addition uses new
     * keys with safe defaults, so migrating only validates old data – nothing is ever reset.
     */
    fun migrate() {
        val v = prefs.getInt(K_SCHEMA, 0)
        if (v >= SCHEMA) return
        val e = prefs.edit()
        // the default car is always owned; never leave a car selected that is not owned
        val owned = prefs.getInt(K_OWNED, 1) or 1
        e.putInt(K_OWNED, owned)
        val sel = prefs.getInt(K_SELECTED_CAR, 0)
        if (sel !in GameData.cars.indices || (owned and (1 shl sel)) == 0) e.putInt(K_SELECTED_CAR, 0)
        // v2.0 stored a single tilt sensitivity – keep it as the tilt sensitivity, seed the steering one from it
        if (v < 3 && !prefs.contains("ctl_steer") && prefs.contains(K_SENS)) e.putFloat("ctl_steer", prefs.getFloat(K_SENS, 0.5f))
        e.putInt(K_SCHEMA, SCHEMA)
        e.apply()
    }

    val schemaVersion: Int get() = prefs.getInt(K_SCHEMA, 0)

    /** Erases progress but keeps language and control settings. */
    fun resetProgress() {
        val lang = language
        val control = controlMode
        val sens = sensitivity
        val gfx = graphics
        prefs.edit().clear().apply()
        language = lang
        controlMode = control
        sensitivity = sens
        graphics = gfx
    }

    companion object {
        const val START_COINS = 2500
        const val CONTROL_TILT = 0
        const val CONTROL_TOUCH = 1
        const val CONTROL_WHEEL = 2
        const val BUY_OK = 0
        const val BUY_OWNED = 1
        const val BUY_NO_MONEY = 2
        const val BUY_INVALID = 3
        /** v2.1 save schema */
        const val SCHEMA = 3
        private const val K_SCHEMA = "save_schema"

        private const val K_COINS = "coins"
        private const val K_OWNED = "owned_cars"
        private const val K_SELECTED_CAR = "selected_car"
        private const val K_ENVS = "unlocked_envs"
        private const val K_SEL_ENV = "sel_env"
        private const val K_SEL_MODE = "sel_mode"
        private const val K_SEL_TOD = "sel_tod"
        private const val K_TOTAL_DIST = "total_distance"
        private const val K_LANG = "language"
        private const val K_CONTROL = "control_mode"
        private const val K_SENS = "sensitivity"
        private const val K_TILT_OFFSET = "tilt_offset"
        private const val K_GFX = "graphics"
        private const val K_AUTO_Q = "auto_quality"
        private const val K_SFX = "sfx"
        private const val K_MUSIC = "music"
        private const val K_MUTE = "mute"
        private const val K_SHAKE = "camera_shake"
        private const val K_FPS = "show_fps"
        private const val K_VIBRATE = "vibration"
        private const val K_AUTOGAS = "auto_gas"
        private const val K_FIRST = "first_launch_done"
    }
}
