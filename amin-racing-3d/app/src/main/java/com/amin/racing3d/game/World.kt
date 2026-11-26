package com.amin.racing3d.game

import com.amin.racing3d.audio.AudioEngine
import com.amin.racing3d.input.InputState
import kotlin.math.abs
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sin
import kotlin.math.sqrt

class TrafficCar {
    var active = false
    var type = 0
    var lane = 0
    var targetLane = 0
    var dir = 1
    var x = 0f
    var s = 0f
    var speed = 0f
    var cruise = 0f
    var r = 1f
    var g = 1f
    var b = 1f
    var fromX = 0f
    var laneT = 1f
    var signal = 0f
    var signalSide = 0
    var braking = false
    var brakeLight = 0f
    var lastRel = 0f
    var nearChecked = false
    var wheelAngle = 0f
    var yaw = 0f
    var crashed = false
    var spinVel = 0f
    var crashVx = 0f
    var cooldown = 0f
    var length = 4.5f
    var width = 1.8f
}

class Coin {
    var active = false
    var x = 0f
    var s = 0f
    var spin = 0f
}

/** AI car: a street-race rival or a police pursuit vehicle. */
class Racer {
    var active = false
    var cop = false
    var car = 0
    var color = 0
    var x = 0f
    var s = 0f
    var speed = 0f
    var lane = 0
    var yaw = 0f
    var wheelAngle = 0f
    var skill = 1f
    var finished = false
    var finishTime = 0f
    var wrecked = false
    var spin = 0f
    var spinVel = 0f
    var brakeLight = 0f
    var bumpCd = 0f
    var laneCd = 0f
    var name = 0
}

/** Road-side or road-spanning landmark: tunnel, bridge, gas station, parking area, dealership. */
class Zone {
    var active = false
    var type = 0
    var s0 = 0f
    var s1 = 0f
    var side = 1
    var seed = 0
    /** free roam: region the world switches to inside this tunnel (-1 = none) */
    var regionTo = -1
}

class SceneryItem {
    var category = 0
    var kind = 0
    var side = 1
    var x = 0f
    var s = 0f
    var yaw = 0f
    var sx = 1f
    var sy = 1f
    var sz = 1f
    var r = 1f
    var g = 1f
    var b = 1f
    var visible = true
    var span = 0f
    var seed = 0
}

interface GameListener {
    fun onNearMiss(points: Int, combo: Int, oncoming: Boolean)
    fun onCrash()
    fun onCheckpoint(bonusSeconds: Int)
    fun onGameOver()
    /** brake pedal pressed at speed; [strength] 0..1 (for a short haptic pulse) */
    fun onHardBrake(strength: Float) {}
    /** a taxi passenger paid [coins] with a [stars] rating */
    fun onTaxiFare(coins: Int, stars: Int) {}
}

/**
 * Complete game simulation: player physics, traffic AI, scoring, coins, checkpoints,
 * scenery recycling and particle effects. Runs on the GL thread; never allocates per frame.
 */
class World(private val input: InputState) {

    var audio: AudioEngine? = null
    var listener: GameListener? = null

    // ------------------------------------------------------------------------ configuration
    var state = STATE_ATTRACT
        private set
    var mode = GameData.MODE_ENDLESS
        private set
    var env = GameData.ENV_CITY
        private set
    var todSetting = GameData.TOD_DAY
        private set
    var carId = 0
        private set
    var carColor = 0xFF00B8FF.toInt()
        private set
    private var lvlSpeed = 0
    private var lvlHandling = 0
    private var lvlBrakes = 0
    private var lvlNitro = 0
    var paused = false
    var sceneryDensity = 1f
        private set

    /** Time of day value: 0 day, 1 sunset, 2 night, 3 dawn (cyclic, 4 == 0). */
    var tod = 0f
        private set
    var envVersion = 0
        private set
    var time = 0f
        private set

    // ------------------------------------------------------------------------ player
    var px = 0f; private set
    var ps = 0f; private set
    var speed = 0f; private set
    var vx = 0f; private set
    var yaw = 0f; private set
    var roll = 0f; private set
    private var rollVel = 0f
    var pitch = 0f; private set
    private var pitchVel = 0f
    var suspY = 0f; private set
    private var suspVel = 0f
    var wheelAngle = 0f; private set
    var steerAngle = 0f; private set
    /** tyre slip 0..1 (squeal, smoke, skid marks) */
    var skid = 0f; private set
    /** brake disc temperature 0..1 (glow) */
    var brakeHeat = 0f; private set
    private var backfireT = 0f
    private var prevThrottle = 0f
    private var prevGear = 0
    // skid marks: ring buffer of decal segments (x, s, yaw, birth time)
    val skidX = FloatArray(MAX_SKID)
    val skidS = FloatArray(MAX_SKID)
    val skidYaw = FloatArray(MAX_SKID)
    val skidT = FloatArray(MAX_SKID)
    var skidHead = 0; private set
    var skidUsed = 0; private set
    private var skidLastS = 0f
    var nitro = 1f; private set
    var nitroActive = false; private set
    var braking = false; private set
    var blinkLeft = false; private set
    var blinkRight = false; private set
    private var steerSmooth = 0f
    private var prevSpeed = 0f
    private var prevVx = 0f
    var crashSpin = 0f; private set
    private var crashSpinVel = 0f
    private var crashTimer = 0f
    var crashedReason = 0; private set
    var scraping = 0f; private set
    private var hornPrev = false
    var hornOn = false; private set

    // ------------------------------------------------------------------------ v2: config, weather, modes
    var cfg = RaceConfig(GameData.MODE_ENDLESS, GameData.ENV_CITY, GameData.TOD_DAY, GameData.W_CLEAR)
        private set
    var weather = GameData.W_CLEAR; private set
    var rain = 0f; private set
    var snowFall = 0f; private set
    var wet = 0f; private set
    var cloud = 0f; private set
    var fogMul = 1f; private set
    var lightning = 0f; private set
    private var thunderT = -1f
    private var nextFlashT = 4f
    private var weatherTimer = 0f
    var raceTime = 0f; private set
    var position = 1; private set
    var finishS = 0f; private set
    var success = false; private set
    var medal = 0; private set
    var driftAngle = 0f; private set
    var drifting = false; private set
    var driftChain = 0f; private set
    var driftMult = 1; private set
    private var driftChainTime = 0f
    private var driftEndTimer = 0f
    var bust = 0f; private set
    var escape = 0f; private set
    var heat = 1; private set
    var escapes = 0; private set
    var takedowns = 0; private set
    private var copWaveTimer = 0f
    var sirenLevel = 0f; private set
    var tunnelK = 0f; private set
    private var nextZoneS = 0f
    private var lastRegionS = 0f
    private var regionIndex = 0
    var regionSeq = 0; private set
    val rivals = Array(MAX_RACERS) { Racer() }
    val zones = Array(MAX_ZONES) { Zone() }
    val driftEnabled: Boolean get() = mode == GameData.MODE_DRIFT || mode == GameData.MODE_FREE

    // ------------------------------------------------------------------------ scoring
    var score = 0.0; private set
    var distance = 0f; private set
    var topSpeedKmh = 0f; private set
    var nearMisses = 0; private set
    var combo = 0; private set
    var comboTimer = 0f; private set
    var bestCombo = 0; private set
    var coinsCollected = 0; private set
    var timeLeft = 0f; private set
    var nextCheckpointS = 0f; private set
    private var checkpointIndex = 0
    var x2Active = false; private set
    var countdown = 0f; private set
    var timeScale = 1f; private set
    var shake = 0f
    var nearMissFlash = 0f; private set

    // ------------------------------------------------------------------------ pools
    val traffic = Array(MAX_TRAFFIC) { TrafficCar() }
    val coins = Array(MAX_COINS) { Coin() }
    private var nextCoinS = 0f
    val scenery = ArrayList<SceneryItem>(320)
    val particles = Particles(700)

    // ------------------------------------------------------------------------ HUD snapshot (read on UI thread)
    @Volatile var hudSpeed = 0
    @Volatile var hudScore = 0
    @Volatile var hudDistance = 0f
    @Volatile var hudCoins = 0
    @Volatile var hudNitro = 1f
    @Volatile var hudCombo = 0
    @Volatile var hudComboTimer = 0f
    @Volatile var hudX2 = false
    @Volatile var hudTime = 0f
    @Volatile var hudCountdown = 0f
    @Volatile var hudState = STATE_ATTRACT
    @Volatile var hudNearSeq = 0
    @Volatile var hudNearPts = 0
    @Volatile var hudCheckSeq = 0
    @Volatile var hudNitroOn = false
    @Volatile var hudPosition = 1
    @Volatile var hudRacers = 0
    @Volatile var hudToGo = 0f
    @Volatile var hudRaceTime = 0f
    @Volatile var hudDriftChain = 0
    @Volatile var hudDriftMult = 1
    @Volatile var hudDriftSeq = 0
    @Volatile var hudDriftBank = 0
    @Volatile var hudDriftLostSeq = 0
    @Volatile var hudBust = 0f
    @Volatile var hudEscape = 0f
    @Volatile var hudHeat = 1
    @Volatile var hudEscapes = 0
    @Volatile var hudEventSeq = 0
    @Volatile var hudEvent = 0
    @Volatile var hudNear = 0
    @Volatile var hudEnv = 0
    @Volatile var hudWeather = 0

    private var rng = 0x2545F491L

    // ------------------------------------------------------------------------ random helpers
    fun rand(): Float {
        rng = rng xor (rng shl 13)
        rng = rng xor (rng ushr 7)
        rng = rng xor (rng shl 17)
        return ((rng ushr 11) and 0xFFFFFF).toFloat() / 16777216f
    }

    private fun rand(a: Float, b: Float) = a + (b - a) * rand()

    // ------------------------------------------------------------------------ public control
    fun configureCar(id: Int, color: Int, speedLvl: Int, handlingLvl: Int, brakeLvl: Int, nitroLvl: Int) {
        carId = id; carColor = color
        lvlSpeed = speedLvl; lvlHandling = handlingLvl; lvlBrakes = brakeLvl; lvlNitro = nitroLvl
    }

    fun setSceneryDensity(d: Float) {
        sceneryDensity = d
        for (it in scenery) it.visible = it.category <= CAT_LAMP || hash01(it.seed) < d
    }

    fun startAttract() {
        cfg = RaceConfig(GameData.MODE_ENDLESS, GameData.ENV_CITY, GameData.TOD_SUNSET, GameData.W_CLEAR)
        mode = GameData.MODE_ENDLESS
        env = GameData.ENV_CITY
        todSetting = GameData.TOD_SUNSET
        taxiOn = false
        resetRun()
        state = STATE_ATTRACT
        speed = 34f
    }

    fun startShowroom() {
        state = STATE_SHOWROOM
        paused = false
    }

    fun startRace(newMode: Int, newEnv: Int, newTod: Int) =
        startRace(GameData.defaultConfig(newMode, newEnv, newTod, GameData.W_CLEAR))

    fun startRace(c: RaceConfig) {
        cfg = c
        mode = c.mode
        env = c.env
        todSetting = c.tod
        // Endless offers passenger jobs (unless switched off on the phone); free roam starts them from the phone
        taxiOn = mode == GameData.MODE_ENDLESS && c.missionId < 0 && taxiInEndless
        resetRun()
        state = STATE_COUNTDOWN
        countdown = 2.999f
        speed = 0f
        audio?.trigger(AudioEngine.SFX_COUNT)
    }

    fun restart() = startRace(cfg)

    fun backToAttract() = startAttract()

    private fun resetRun() {
        envVersion++
        paused = false
        px = GameData.LANE_X[2]; ps = 0f; vx = 0f; yaw = 0f; roll = 0f; rollVel = 0f
        pitch = 0f; pitchVel = 0f; suspY = 0f; suspVel = 0f; steerSmooth = 0f
        nitro = 1f; nitroActive = false; braking = false
        skid = 0f; brakeHeat = 0f; backfireT = 0f; skidUsed = 0; skidHead = 0
        crashSpin = 0f; crashSpinVel = 0f; crashTimer = 0f; scraping = 0f
        score = 0.0; distance = 0f; topSpeedKmh = 0f; nearMisses = 0; combo = 0; comboTimer = 0f
        bestCombo = 0; coinsCollected = 0; x2Active = false; timeScale = 1f; shake = 0f
        timeLeft = TIME_ATTACK_START; nextCheckpointS = FIRST_CHECKPOINT; checkpointIndex = 0
        tod = when (todSetting) {
            GameData.TOD_SUNSET -> 1f
            GameData.TOD_NIGHT -> 2f
            else -> 0f
        }
        for (t in traffic) t.active = false
        for (c in coins) c.active = false
        nextCoinS = 120f
        particles.clear()
        // weather starts settled (no fade-in at the start line)
        weather = cfg.weather.coerceIn(0, 5)
        rain = GameData.W_RAIN[weather]; snowFall = GameData.W_SNOWFALL[weather]; wet = GameData.W_WET[weather]
        cloud = GameData.W_CLOUD[weather]; fogMul = GameData.W_FOGMUL[weather]
        lightning = 0f; thunderT = -1f; nextFlashT = rand(3f, 8f); weatherTimer = rand(70f, 130f)
        raceTime = 0f; position = 1; success = false; medal = 0; crashedReason = REASON_CRASH; copsOut = false
        driftAngle = 0f; drifting = false; driftChain = 0f; driftMult = 1; driftChainTime = 0f; driftEndTimer = 0f
        bust = 0f; escape = 0f; heat = 1; escapes = 0; takedowns = 0; copWaveTimer = 3.5f; sirenLevel = 0f
        tunnelK = 0f
        onFoot = false; footDown = 0f; footFallK = 0f; footSpeed = 0f; sceneryBack = 30f
        resetTaxi()
        for (r in rivals) r.active = false
        for (z in zones) z.active = false
        nextZoneS = if (mode == GameData.MODE_FREE) 500f else 900f
        lastRegionS = 0f
        regionIndex = REGION_ORDER.indexOf(env).coerceAtLeast(0)
        finishS = if ((mode == GameData.MODE_STREET || mode == GameData.MODE_TIME_TRIAL) && cfg.goal > 0f) cfg.goal else 0f
        if (mode == GameData.MODE_DRIFT || mode == GameData.MODE_CHALLENGE) timeLeft = cfg.timeLimit
        if (mode == GameData.MODE_STREET) spawnRivals()
        buildScenery()
        // initial traffic
        var s = 45f
        while (s < 460f) {
            spawnTraffic(s, true)
            s += rand(16f, 34f)
        }
    }

    val carSpec: CarSpec get() = GameData.cars[carId]
    val isRacing: Boolean get() = state == STATE_RACING || state == STATE_COUNTDOWN || state == STATE_CRASHED
    val speedKmh: Float get() = speed * 3.6f

    fun laneDir(lane: Int): Int = if (mode == GameData.MODE_TWO_WAY && lane < 2) -1 else 1

    // ------------------------------------------------------------------------ scenery
    private fun hash01(n: Int): Float {
        var h = n * -0x61c88647
        h = h xor (h ushr 15)
        h *= 0x2c1b3c6d
        h = h xor (h ushr 12)
        return (h and 0xFFFF) / 65535f
    }

    private fun buildScenery() {
        scenery.clear()
        val span = SCENERY_SPAN
        var seed = 1
        fun row(category: Int, spacing: Float, side: Int, offset: Float) {
            val n = (span / spacing).toInt() + 1
            val total = n * spacing
            for (i in 0 until n) {
                val it = SceneryItem()
                it.category = category; it.side = side; it.span = total
                it.s = ps - sceneryBack + offset + i * spacing
                it.seed = seed++
                generate(it)
                scenery.add(it)
            }
        }
        row(CAT_RAIL, 20f, -1, 0f)
        row(CAT_RAIL, 20f, 1, 0f)
        row(CAT_LAMP, LAMP_SPACING, -1, LAMP_PHASE)
        row(CAT_LAMP, LAMP_SPACING, 1, LAMP_PHASE)
        val near = when (env) { GameData.ENV_CITY -> 21f; GameData.ENV_INDUSTRIAL -> 26f; else -> 8.5f }
        val far = when (env) { GameData.ENV_CITY -> 30f; GameData.ENV_INDUSTRIAL -> 24f; else -> 13f }
        row(CAT_NEAR, near, -1, 0f)
        row(CAT_NEAR, near, 1, near * 0.5f)
        row(CAT_FAR, far, -1, 3f)
        row(CAT_FAR, far, 1, far * 0.4f)
        row(CAT_SPECIAL, 170f, 1, 60f)
        row(CAT_SPECIAL, 170f, -1, 145f)
        // lamps must sit exactly on the shader lamp grid
        for (it in scenery) if (it.category == CAT_LAMP) {
            val k = Math.round((it.s - LAMP_PHASE) / LAMP_SPACING)
            it.s = k * LAMP_SPACING + LAMP_PHASE
        }
        setSceneryDensity(sceneryDensity)
    }

    private fun generate(it: SceneryItem) {
        val side = it.side.toFloat()
        it.yaw = 0f; it.sx = 1f; it.sy = 1f; it.sz = 1f; it.r = 1f; it.g = 1f; it.b = 1f
        val roadEdge = GameData.ROAD_HALF + GameData.SHOULDER
        when (it.category) {
            CAT_RAIL -> {
                it.kind = K_RAIL
                it.x = side * (roadEdge + 0.15f)
                it.yaw = if (it.side < 0) 0f else Math.PI.toFloat()
            }
            CAT_LAMP -> {
                it.kind = K_LAMP
                it.x = side * (roadEdge + 0.75f)
                it.yaw = if (it.side < 0) 0f else Math.PI.toFloat()
            }
            CAT_NEAR -> genProp(it, true)
            CAT_FAR -> genProp(it, false)
            else -> {
                val p = rand()
                it.kind = when {
                    p < 0.32f -> K_SIGN1
                    p < 0.56f -> K_SIGN2
                    p < 0.9f -> K_BILLBOARD
                    else -> K_NONE
                }
                it.x = side * (roadEdge + if (it.kind == K_BILLBOARD) 12f else 3.2f)
                it.yaw = 0f
            }
        }
    }

    private fun genProp(it: SceneryItem, near: Boolean) {
        val side = it.side.toFloat()
        val edge = GameData.ROAD_HALF + GameData.SHOULDER
        it.yaw = rand(0f, 6.283f)
        when (env) {
            GameData.ENV_CITY -> {
                if (near && rand() < 0.22f) {
                    it.kind = K_TREE
                    val s = rand(0.8f, 1.2f); it.sx = s; it.sy = s; it.sz = s
                    it.x = side * (edge + rand(3.5f, 5.5f))
                } else {
                    it.kind = K_BUILDING
                    it.yaw = 0f
                    val w = if (near) rand(11f, 17f) else rand(14f, 26f)
                    val d = rand(10f, 18f)
                    val h = if (near) rand(9f, 42f) else rand(28f, 95f)
                    it.sx = w; it.sy = h; it.sz = d
                    it.x = side * (edge + (if (near) rand(8f, 12f) else rand(34f, 70f)) + w / 2)
                    val tone = rand()
                    when {
                        tone < 0.25f -> { it.r = 0.86f; it.g = 0.8f; it.b = 0.7f }
                        tone < 0.5f -> { it.r = 0.62f; it.g = 0.68f; it.b = 0.78f }
                        tone < 0.7f -> { it.r = 0.78f; it.g = 0.5f; it.b = 0.42f }
                        tone < 0.85f -> { it.r = 0.55f; it.g = 0.57f; it.b = 0.6f }
                        else -> { it.r = 0.92f; it.g = 0.92f; it.b = 0.9f }
                    }
                }
            }
            GameData.ENV_DESERT -> {
                val p = rand()
                if (near) {
                    when {
                        p < 0.45f -> { it.kind = K_CACTUS; val s = rand(0.7f, 1.4f); it.sx = s; it.sy = s; it.sz = s }
                        p < 0.75f -> { it.kind = K_ROCK; val s = rand(0.6f, 1.6f); it.sx = s; it.sy = s * rand(0.7f, 1.2f); it.sz = s; it.r = 0.72f; it.g = 0.55f; it.b = 0.4f }
                        else -> { it.kind = K_BUSH; val s = rand(0.5f, 0.9f); it.sx = s; it.sy = s * 0.7f; it.sz = s; it.r = 0.52f; it.g = 0.5f; it.b = 0.28f }
                    }
                    it.x = side * (edge + rand(3f, 26f))
                } else {
                    it.kind = if (p < 0.7f) K_ROCK else K_CACTUS
                    val s = if (it.kind == K_ROCK) rand(3f, 8f) else rand(1f, 1.6f)
                    it.sx = s; it.sy = s * rand(0.6f, 1.3f); it.sz = s
                    it.r = 0.76f; it.g = 0.5f; it.b = 0.34f
                    it.x = side * (edge + rand(30f, 90f))
                }
            }
            GameData.ENV_SNOW -> {
                val p = rand()
                if (near) {
                    if (p < 0.78f) { it.kind = K_SNOWPINE; val s = rand(0.8f, 1.5f); it.sx = s; it.sy = s * rand(0.9f, 1.25f); it.sz = s }
                    else { it.kind = K_ROCK; val s = rand(0.6f, 1.5f); it.sx = s; it.sy = s; it.sz = s; it.r = 0.88f; it.g = 0.9f; it.b = 0.96f }
                    it.x = side * (edge + rand(3.5f, 24f))
                } else {
                    it.kind = K_SNOWPINE
                    val s = rand(1.3f, 2.4f); it.sx = s; it.sy = s; it.sz = s
                    it.x = side * (edge + rand(26f, 75f))
                }
            }
            GameData.ENV_COAST -> {
                val p = rand()
                if (it.side == SEA_SIDE) {
                    // beach strip, then open sea
                    if (near && p < 0.55f) {
                        it.kind = K_PALM; val s = rand(0.85f, 1.25f); it.sx = s; it.sy = s; it.sz = s
                        it.x = side * (edge + rand(3f, 14f))
                    } else if (near) {
                        it.kind = K_ROCK; val s = rand(0.6f, 1.8f); it.sx = s; it.sy = s * 0.7f; it.sz = s
                        it.r = 0.62f; it.g = 0.58f; it.b = 0.52f
                        it.x = side * (edge + rand(4f, 18f))
                    } else it.kind = K_NONE
                } else if (near) {
                    if (p < 0.5f) { it.kind = K_PALM; val s = rand(0.8f, 1.2f); it.sx = s; it.sy = s; it.sz = s; it.x = side * (edge + rand(3.5f, 9f)) }
                    else { it.kind = K_BUSH; val s = rand(0.6f, 1.1f); it.sx = s; it.sy = s * 0.8f; it.sz = s; it.r = 0.42f; it.g = 0.55f; it.b = 0.3f; it.x = side * (edge + rand(3f, 12f)) }
                } else {
                    // white beach houses
                    it.kind = K_BUILDING; it.yaw = 0f
                    val w = rand(9f, 15f); val h = rand(5f, 13f)
                    it.sx = w; it.sy = h; it.sz = rand(8f, 13f)
                    it.x = side * (edge + rand(18f, 50f) + w / 2)
                    val t = rand()
                    if (t < 0.6f) { it.r = 0.95f; it.g = 0.94f; it.b = 0.9f } else if (t < 0.8f) { it.r = 0.62f; it.g = 0.78f; it.b = 0.86f } else { it.r = 0.95f; it.g = 0.82f; it.b = 0.62f }
                }
            }
            GameData.ENV_INDUSTRIAL -> {
                val p = rand()
                it.yaw = 0f
                if (near) {
                    if (p < 0.7f) {
                        it.kind = K_WAREHOUSE
                        val w = rand(14f, 22f); it.sx = w; it.sy = rand(7f, 11f); it.sz = rand(16f, 22f)
                        it.x = side * (edge + rand(7f, 11f) + w / 2)
                        it.yaw = if (it.side < 0) 0f else Math.PI.toFloat()
                        val t = rand()
                        if (t < 0.35f) { it.r = 0.55f; it.g = 0.6f; it.b = 0.66f } else if (t < 0.6f) { it.r = 0.72f; it.g = 0.42f; it.b = 0.3f } else if (t < 0.8f) { it.r = 0.82f; it.g = 0.82f; it.b = 0.78f } else { it.r = 0.36f; it.g = 0.48f; it.b = 0.4f }
                    } else {
                        it.kind = K_TANK
                        val r = rand(3f, 5.5f); it.sx = r; it.sz = r; it.sy = rand(5f, 9f)
                        it.x = side * (edge + rand(8f, 14f) + r)
                    }
                } else {
                    when {
                        p < 0.3f -> { it.kind = K_CHIMNEY; val s = rand(0.8f, 1.4f); it.sx = s; it.sy = s; it.sz = s; it.x = side * (edge + rand(40f, 90f)) }
                        p < 0.75f -> {
                            it.kind = K_WAREHOUSE
                            val w = rand(24f, 40f); it.sx = w; it.sy = rand(10f, 18f); it.sz = rand(20f, 30f)
                            it.x = side * (edge + rand(36f, 70f) + w / 2)
                            it.r = 0.6f; it.g = 0.62f; it.b = 0.64f
                        }
                        else -> { it.kind = K_TANK; val r = rand(6f, 9f); it.sx = r; it.sz = r; it.sy = rand(8f, 14f); it.x = side * (edge + rand(36f, 80f)) }
                    }
                }
            }
            GameData.ENV_MOUNTAIN -> {
                val p = rand()
                if (near) {
                    when {
                        p < 0.55f -> { it.kind = K_PINE; val s = rand(0.9f, 1.7f); it.sx = s; it.sy = s * rand(1f, 1.35f); it.sz = s }
                        p < 0.85f -> { it.kind = K_ROCK; val s = rand(1f, 3.2f); it.sx = s; it.sy = s * rand(0.7f, 1.4f); it.sz = s; it.r = 0.56f; it.g = 0.56f; it.b = 0.58f }
                        else -> { it.kind = K_SNOWPINE; val s = rand(0.9f, 1.5f); it.sx = s; it.sy = s; it.sz = s }
                    }
                    it.x = side * (edge + rand(3.5f, 22f))
                } else {
                    if (p < 0.55f) {
                        // cliff faces
                        it.kind = K_ROCK; val s = rand(7f, 16f); it.sx = s; it.sy = s * rand(1.1f, 2.0f); it.sz = s
                        it.r = 0.5f; it.g = 0.5f; it.b = 0.53f
                        it.x = side * (edge + rand(26f, 70f))
                    } else {
                        it.kind = K_PINE; val s = rand(1.5f, 2.6f); it.sx = s; it.sy = s; it.sz = s
                        it.x = side * (edge + rand(24f, 80f))
                    }
                }
            }
            else -> {
                val p = rand()
                if (near) {
                    when {
                        p < 0.5f -> { it.kind = K_PINE; val s = rand(0.8f, 1.6f); it.sx = s; it.sy = s * rand(0.9f, 1.3f); it.sz = s }
                        p < 0.88f -> { it.kind = K_TREE; val s = rand(0.8f, 1.4f); it.sx = s; it.sy = s; it.sz = s }
                        else -> { it.kind = K_BUSH; val s = rand(0.7f, 1.3f); it.sx = s; it.sy = s; it.sz = s; it.r = 0.3f; it.g = 0.55f; it.b = 0.25f }
                    }
                    it.x = side * (edge + rand(3.2f, 20f))
                } else {
                    it.kind = if (p < 0.6f) K_PINE else K_TREE
                    val s = rand(1.4f, 2.4f); it.sx = s; it.sy = s; it.sz = s
                    it.x = side * (edge + rand(22f, 70f))
                }
            }
        }
    }

    private fun updateScenery() {
        val behind = ps - sceneryBack - 5f
        for (it in scenery) {
            if (it.s < behind) {
                it.s += it.span
                if (it.category != CAT_LAMP && it.category != CAT_RAIL) generate(it)
                it.visible = it.category <= CAT_LAMP || hash01(it.seed + (it.s * 0.1f).toInt()) < sceneryDensity
            }
        }
    }

    // ------------------------------------------------------------------------ traffic
    private fun pickType(): Int {
        var p = (rand() * GameData.trafficWeightTotal).toInt()
        for (t in GameData.traffic) {
            if (p < t.weight) return t.id
            p -= t.weight
        }
        return 0
    }

    private fun laneFree(lane: Int, s: Float, ahead: Float, behind: Float): Boolean {
        for (t in traffic) {
            if (!t.active) continue
            if (t.lane != lane && t.targetLane != lane) continue
            val d = t.s - s
            if (d > -behind - t.length && d < ahead + t.length) return false
        }
        return true
    }

    private fun spawnTraffic(s: Float, initial: Boolean, sameDirOnly: Boolean = false): Boolean {
        var slot: TrafficCar? = null
        for (t in traffic) if (!t.active) { slot = t; break }
        val car = slot ?: return false
        val lane = if (sameDirOnly && mode == GameData.MODE_TWO_WAY) 2 + (rand() * 2).toInt().coerceIn(0, 1)
        else (rand() * 4).toInt().coerceIn(0, 3)
        val gap = if (initial) 14f else 22f
        if (!laneFree(lane, s, gap, gap)) return false
        // keep at least one lane open near the spawn point to stay fair
        var blocked = 0
        for (l in 0 until 4) if (l != lane && !laneFree(l, s, 10f, 10f)) blocked++
        if (blocked >= 3) return false
        val type = pickType()
        val spec = GameData.traffic[type]
        car.active = true
        car.type = type
        car.lane = lane; car.targetLane = lane
        car.dir = laneDir(lane)
        car.x = GameData.LANE_X[lane] + rand(-0.25f, 0.25f)
        car.fromX = car.x
        car.s = s
        car.length = spec.length; car.width = spec.width
        car.cruise = rand(spec.minSpeed, spec.maxSpeed) / 3.6f
        if (car.dir > 0 && lane == 3) car.cruise *= 0.92f
        if (car.dir > 0 && lane == 2 && mode != GameData.MODE_TWO_WAY) car.cruise *= 1.05f
        car.speed = car.cruise
        car.laneT = 1f; car.signal = 0f; car.signalSide = 0
        car.braking = false; car.brakeLight = 0f
        car.lastRel = s - ps; car.nearChecked = false
        car.crashed = false; car.spinVel = 0f; car.crashVx = 0f; car.yaw = 0f
        car.cooldown = rand(2f, 9f)
        when (type) {
            GameData.TR_TAXI -> { car.r = 1f; car.g = 0.78f; car.b = 0.05f }
            GameData.TR_BUS -> {
                val p = rand()
                if (p < 0.33f) { car.r = 0.85f; car.g = 0.12f; car.b = 0.1f } else if (p < 0.66f) { car.r = 0.1f; car.g = 0.35f; car.b = 0.8f } else { car.r = 0.15f; car.g = 0.6f; car.b = 0.3f }
            }
            else -> {
                val c = TRAFFIC_COLORS[(rand() * TRAFFIC_COLORS.size).toInt().coerceIn(0, TRAFFIC_COLORS.size - 1)]
                car.r = ((c shr 16) and 0xFF) / 255f; car.g = ((c shr 8) and 0xFF) / 255f; car.b = (c and 0xFF) / 255f
            }
        }
        return true
    }

    private fun trafficTarget(): Int {
        val base = when {
            state == STATE_ATTRACT -> 14
            mode == GameData.MODE_DRIFT -> 6
            mode == GameData.MODE_CHALLENGE -> 20
            mode == GameData.MODE_FREE -> 10
            mode == GameData.MODE_STREET || mode == GameData.MODE_POLICE -> 12
            else -> 13
        }
        return min(MAX_TRAFFIC - 4, base + (distance / 450f).toInt())
    }

    private fun updateTraffic(dt: Float, hornPressed: Boolean) {
        val pl = carSpec.length; val pw = carSpec.width
        var activeCount = 0
        for (t in traffic) {
            if (!t.active) continue
            val rel = t.s - ps
            if (rel < -70f || rel > 560f) { t.active = false; continue }
            activeCount++
        }
        // spawn new traffic far ahead (and occasionally from behind when the player is slow)
        val target = trafficTarget()
        var attempts = 0
        while (activeCount < target && attempts < 3) {
            val behind = speed < 20f && rand() < 0.35f
            val s = if (behind) ps - rand(55f, 65f) else ps + rand(260f, 420f)
            // behind the player only same-direction lanes make sense
            if (spawnTraffic(s, false, behind)) activeCount++
            attempts++
        }

        for (t in traffic) {
            if (!t.active) continue
            val spec = GameData.traffic[t.type]
            if (t.crashed) {
                t.speed = max(0f, t.speed - 9f * dt)
                t.s += t.speed * t.dir * dt
                t.x += t.crashVx * dt
                t.crashVx *= 1f - min(1f, 2f * dt)
                t.yaw += t.spinVel * dt
                t.spinVel *= 1f - min(1f, 1.5f * dt)
                t.brakeLight = 1f
                t.wheelAngle -= t.speed / spec.wheelRadius * dt
                continue
            }
            // find leader in the same lane (or target lane) moving the same direction
            var gap = 1e9f
            var leaderSpeed = 0f
            for (o in traffic) {
                if (o === t || !o.active || o.dir != t.dir) continue
                if (o.lane != t.lane && o.targetLane != t.lane && o.lane != t.targetLane) continue
                val d = (o.s - t.s) * t.dir - (o.length + t.length) * 0.5f
                if (d > -1f && d < gap) { gap = d; leaderSpeed = if (o.crashed) 0f else o.speed }
            }
            // the player is an obstacle for same-direction cars behind it
            if (state != STATE_SHOWROOM && abs(px - t.x) < (pw + t.width) * 0.5f + 0.6f) {
                val d = (ps - t.s) * t.dir - (pl + t.length) * 0.5f
                if (d > -1f && d < gap) { gap = d; leaderSpeed = if (t.dir > 0) speed else 0f }
            }
            if (onFoot && abs(footX - t.x) < t.width * 0.5f + 1.1f) {
                val d = (footS - t.s) * t.dir - t.length * 0.5f - 0.6f
                if (d > -1f && d < gap) { gap = d; leaderSpeed = 0f }
            }
            val safe = 7f + t.speed * 1.05f
            var desired = t.cruise
            if (gap < safe) {
                desired = min(t.cruise, leaderSpeed * (gap / safe).coerceIn(0f, 1f) + max(0f, gap - 3f) * 0.15f)
            }
            val dv = desired - t.speed
            t.speed += if (dv > 0) min(dv, 2.6f * dt) else max(dv, -8.5f * dt)
            if (t.speed < 0f) t.speed = 0f
            t.braking = dv < -0.6f
            t.brakeLight += ((if (t.braking) 1f else 0f) - t.brakeLight) * min(1f, 10f * dt)

            // lane changes (same-direction lanes only)
            t.cooldown -= dt
            if (t.laneT >= 1f && t.signal <= 0f && t.cooldown <= 0f) {
                val stuck = gap < safe * 1.5f && leaderSpeed < t.cruise - 2f
                if (stuck || rand() < 0.002f) {
                    tryLaneChange(t, 1.1f)
                }
                t.cooldown = rand(3f, 8f)
            }
            if (hornPressed && t.dir > 0 && t.laneT >= 1f && t.signal <= 0f) {
                val rel = t.s - ps
                if (rel > 3f && rel < 75f && abs(t.x - px) < 2.2f) {
                    if (!tryLaneChange(t, 0.25f)) t.cruise += 2.5f
                }
            }
            if (t.signal > 0f) {
                t.signal -= dt
                if (t.signal <= 0f) {
                    // re-check before committing
                    val okToGo = laneFree(t.targetLane, t.s, 12f, 9f) && !playerInLane(t.targetLane, t.s)
                    if (okToGo) {
                        t.fromX = t.x
                        t.laneT = 0f
                    } else {
                        t.targetLane = t.lane
                        t.signalSide = 0
                    }
                }
            }
            if (t.laneT < 1f) {
                t.laneT = min(1f, t.laneT + dt / 2.1f)
                val k = t.laneT * t.laneT * (3f - 2f * t.laneT)
                val nx = t.fromX + (GameData.LANE_X[t.targetLane] - t.fromX) * k
                val lateral = (nx - t.x) / max(dt, 1e-4f)
                t.x = nx
                t.yaw = -atan2(lateral, max(t.speed, 3f)) * t.dir
                if (t.laneT >= 1f) {
                    t.lane = t.targetLane
                    t.signalSide = 0
                    t.yaw = 0f
                }
            }
            t.s += t.speed * t.dir * dt
            t.wheelAngle -= t.speed / spec.wheelRadius * dt
        }
    }

    private fun playerInLane(lane: Int, s: Float): Boolean {
        return abs(px - GameData.LANE_X[lane]) < 2.6f && abs(ps - s) < 14f
    }

    private fun tryLaneChange(t: TrafficCar, signalTime: Float): Boolean {
        val options = TMP_LANES
        var n = 0
        for (d in intArrayOf_m1_p1) {
            val l = t.lane + d
            if (l < 0 || l > 3) continue
            if (laneDir(l) != t.dir) continue
            if (!laneFree(l, t.s, 16f, 10f)) continue
            if (playerInLane(l, t.s)) continue
            options[n++] = l
        }
        if (n == 0) return false
        val l = options[(rand() * n).toInt().coerceIn(0, n - 1)]
        t.targetLane = l
        t.signal = signalTime
        t.signalSide = if (GameData.LANE_X[l] < t.x) -1 else 1
        return true
    }

    // ------------------------------------------------------------------------ coins
    private fun updateCoins(dt: Float) {
        for (c in coins) {
            if (!c.active) continue
            c.spin += dt * 3.5f
            if (c.s < ps - 10f) { c.active = false; continue }
            if (state == STATE_RACING && abs(c.s - ps) < 2.4f && abs(c.x - px) < 1.45f) {
                c.active = false
                coinsCollected++
                nitro = min(1f, nitro + 0.025f)
                audio?.trigger(AudioEngine.SFX_COIN)
                for (k in 0 until 10) {
                    particles.spawn(c.x, 1.0f, -c.s, rand(-3f, 3f), rand(1f, 4f), rand(-3f, 3f) - speed * 0.6f,
                        rand(0.3f, 0.5f), 0.25f, 0.05f, 1f, 0.85f, 0.2f, 1f, true, -4f, 1f)
                }
            }
        }
        if (state != STATE_RACING && state != STATE_COUNTDOWN) return
        if (ps + 380f > nextCoinS) {
            val lane = (rand() * 4).toInt().coerceIn(0, 3)
            if (laneFree(lane, nextCoinS + 12f, 30f, 30f)) {
                for (k in 0 until 5) {
                    for (c in coins) if (!c.active) {
                        c.active = true; c.x = GameData.LANE_X[lane]; c.s = nextCoinS + k * 6f; c.spin = k * 0.5f
                        break
                    }
                }
            }
            nextCoinS += rand(140f, 260f)
        }
    }

    // ------------------------------------------------------------------------ autopilot (menu demo)
    private var autoSteer = 0f
    private var autoGas = true
    private var autoBrake = false
    private var autoTargetLane = 2

    private fun runAutopilot() {
        val clear = TMP_CLEAR
        for (l in 0 until 4) {
            var c = 220f
            val lx = GameData.LANE_X[l]
            for (t in traffic) {
                if (!t.active) continue
                if (abs(t.x - lx) > 2.4f && abs(GameData.LANE_X[t.targetLane] - lx) > 2.4f) continue
                val rel = t.s - ps - (t.length + carSpec.length) * 0.5f
                if (rel < -6f) continue
                var eff = max(0f, rel)
                if (t.dir < 0) eff *= speed / (speed + t.speed + 0.1f)
                else if (t.speed > speed) eff += 30f
                if (eff < c) c = eff
            }
            clear[l] = c
        }
        var cur = 0
        var bd = 99f
        for (l in 0 until 4) { val d = abs(px - GameData.LANE_X[l]); if (d < bd) { bd = d; cur = l } }
        var best = autoTargetLane
        for (l in 0 until 4) {
            val bonus = if (mode == GameData.MODE_TWO_WAY && l < 2) -25f else 0f
            if (clear[l] + bonus > clear[best] + 12f) best = l
        }
        // only move one lane at a time, and only if that lane is clear alongside
        if (best != autoTargetLane) {
            val step = if (best > cur) cur + 1 else if (best < cur) cur - 1 else cur
            if (clear[step] > 14f) autoTargetLane = step
        }
        if (clear[autoTargetLane] < 8f && clear[cur] > clear[autoTargetLane]) autoTargetLane = cur
        val tx = GameData.LANE_X[autoTargetLane]
        autoSteer = ((tx - px) * 0.9f - vx * 0.25f).coerceIn(-1f, 1f)
        val ahead = clear[cur]
        autoGas = ahead > 32f
        autoBrake = ahead < 16f && speed > 12f
    }

    // ------------------------------------------------------------------------ main update
    fun update(rawDt: Float) {
        val dt = rawDt * timeScale
        time += rawDt
        if (todSetting == GameData.TOD_CYCLE && state != STATE_SHOWROOM) {
            tod = (tod + rawDt / 75f) % 4f
        }
        shake = max(0f, shake - rawDt * 1.6f)
        nearMissFlash = max(0f, nearMissFlash - rawDt * 2f)
        if (state != STATE_SHOWROOM) updateWeather(rawDt)

        when (state) {
            STATE_SHOWROOM -> {
                particles.update(rawDt)
                publish()
                return
            }
            STATE_COUNTDOWN -> {
                val before = countdown
                countdown -= rawDt
                if (before.toInt() != countdown.toInt() && countdown > 0f) audio?.trigger(AudioEngine.SFX_COUNT)
                if (countdown <= 0f) {
                    state = STATE_RACING
                    speed = 20f
                    audio?.trigger(AudioEngine.SFX_GO)
                }
                updateEngineAudio(0.35f)
                particles.update(rawDt)
                publish()
                return
            }
            STATE_OVER -> {
                particles.update(rawDt)
                updateTraffic(dt, false)
                updateEngineAudio(0f)
                publish()
                return
            }
            else -> {}
        }

        // ---------------- controls
        val crashed = state == STATE_CRASHED
        var steerIn: Float
        var gas: Boolean
        var brake: Boolean
        var wantNitro: Boolean
        val horn: Boolean
        if (state == STATE_ATTRACT) {
            runAutopilot()
            steerIn = autoSteer; gas = autoGas; brake = autoBrake; wantNitro = false; horn = false
        } else {
            steerIn = input.steer()
            gas = input.gas || input.autoGas
            brake = input.brake
            wantNitro = input.nitro
            horn = input.horn
        }
        if (input.doorRequest) { input.doorRequest = false; if (state == STATE_RACING) toggleDoor() }
        if (onFoot) {
            if (state == STATE_RACING) updateOnFoot(dt, steerIn, gas, brake, wantNitro)
            steerIn = 0f; gas = false; brake = false; wantNitro = false
        }
        if (crashed) { steerIn = 0f; gas = false; brake = true; wantNitro = false }
        val hornPressed = horn && !hornPrev && !onFoot
        hornPrev = horn
        hornOn = horn && !crashed && !onFoot

        // ---------------- longitudinal physics
        val spec = carSpec
        val baseMax = GameData.topSpeedKmh(spec, lvlSpeed) / 3.6f
        val canNitro = wantNitro && nitro > 0.02f && speed > 8f && !brake
        nitroActive = canNitro
        if (nitroActive) {
            nitro = max(0f, nitro - GameData.nitroDrain(lvlNitro) * dt)
        } else if (state == STATE_RACING) {
            nitro = min(1f, nitro + 0.012f * dt)
        }
        val maxV = baseMax * (if (nitroActive) GameData.nitroPower(spec, lvlNitro) else 1f)
        if (onFoot) {
            speed = 0f
        } else if (crashed) {
            speed = max(0f, speed - 16f * dt)
        } else if (handbrakeTurn(brake, gas, steerIn)) {
            // handbrake turn: rear wheels lock, the car slides and bleeds speed slowly (gas holds it)
            speed = max(0f, speed - (if (gas) 0.6f else 2.6f) * dt)
            brakeHold = 0f
        } else if (brake) {
            speed = max(0f, speed - brakeDecel(spec) * dt)
        } else if (gas || nitroActive) {
            val f = 1f - (speed / maxV) * (speed / maxV)
            val acc = spec.accel * (if (nitroActive) 2.0f else 1f)
            if (speed < maxV) speed += acc * max(f, 0.06f) * dt
            else speed -= (speed - maxV) * 1.2f * dt
        } else {
            // engine braking + rolling resistance + drag when coasting
            speed = max(0f, speed - (2.0f + speed * 0.026f) * dt)
        }
        if (brake && !crashed) brakeHold = min(1f, brakeHold + dt * 6f) else brakeHold = 0f
        braking = brake && speed > 0.5f
        if (braking && brakeHold > 0f && state == STATE_RACING && !brakePrev && speed > 14f) listener?.onHardBrake(min(1f, speed / 60f))
        brakePrev = braking && brakeHold > 0f

        // ---------------- steering / lateral physics
        // tilt input is already filtered by the sensor: follow it almost directly; buttons ramp in
        val steerRate = if (input.useTilt && state != STATE_ATTRACT) 24f else 11f
        steerSmooth += (steerIn - steerSmooth) * min(1f, steerRate * dt)
        val handling = GameData.handling(spec, lvlHandling)
        val speedFactor = (0.35f + speed / 22f).coerceAtMost(1f)
        val targetVx = steerSmooth * handling * speedFactor
        if (driftEnabled && !crashed) {
            if (handbrakeTurn(brake, gas, steerIn) && speed > 13f) drifting = true
            else if (drifting && (abs(steerIn) < 0.1f || speed < 9f)) drifting = false
            val target = if (drifting) steerSmooth * 0.62f * spec.drift.coerceIn(0.6f, 1.5f) else 0f
            driftAngle += (target - driftAngle) * min(1f, (if (drifting) 2.6f else 3.4f) * dt)
        } else {
            drifting = false
            driftAngle *= 1f - min(1f, 5f * dt)
        }
        val grip = surfaceGrip() * (1f - min(0.55f, abs(driftAngle) * 0.9f))
        // lateral response: faster for better-handling cars (old fixed 6.5 felt laggy)
        vx += (targetVx - vx) * min(1f, grip * (5.6f + handling * 0.36f) * dt)
        if (crashed) vx *= 1f - min(1f, 1.8f * dt)
        px += vx * dt
        val maxX = GameData.ROAD_HALF + GameData.SHOULDER - spec.width * 0.5f - 0.05f
        scraping = max(0f, scraping - dt * 4f)
        if (px > maxX || px < -maxX) {
            val sideSign = if (px > 0) 1f else -1f
            px = sideSign * maxX
            if (vx * sideSign > 0f) {
                val impact = abs(vx)
                vx = -vx * 0.25f
                if (speed > 5f && !crashed) {
                    if (scraping < 0.5f) taxiBump()
                    scraping = 1f
                    speed *= 1f - min(0.5f, 0.45f * dt + impact * 0.01f)
                    shake = max(shake, 0.25f + impact * 0.03f)
                    val sx = px + sideSign * spec.width * 0.5f
                    for (k in 0 until 3) {
                        particles.spawn(sx, rand(0.3f, 0.7f), -ps + rand(-1.5f, 1.5f), -sideSign * rand(1f, 4f), rand(1f, 4f), -speed * 0.85f + rand(-2f, 2f),
                            rand(0.25f, 0.5f), 0.09f, 0.02f, 1f, 0.8f, 0.3f, 1f, true, -9f, 0.5f, 1f, 0.4f, 0.05f)
                    }
                    if (combo > 0 && state == STATE_RACING) comboTimer = min(comboTimer, 0.6f)
                }
            }
        }
        val step = speed * dt
        ps += step
        if (state == STATE_RACING) distance += step

        // ---------------- visual dynamics
        yaw = if (crashed) crashSpin else -atan2(vx, max(speed, 3f)) - driftAngle
        if (crashed) {
            crashSpin += crashSpinVel * dt
            crashSpinVel *= 1f - min(1f, 1.2f * dt)
        }
        val latAcc = (vx - prevVx) / max(dt, 1e-4f)
        val lonAcc = (speed - prevSpeed) / max(dt, 1e-4f)
        prevVx = vx; prevSpeed = speed
        var sk = 0f
        if (braking && speed > 12f) sk = ((-lonAcc - 17f) / 14f).coerceIn(0f, 1f) * min(1f, speed / 30f) * (1.25f - 0.5f * surfaceGrip().coerceAtMost(1f))
        sk = max(sk, ((abs(latAcc) - 8f) / 12f).coerceIn(0f, 1f) * min(1f, speed / 25f))
        sk = max(sk, (abs(driftAngle) / 0.42f).coerceIn(0f, 1f) * min(1f, speed / 14f))
        if (crashed && speed > 4f) sk = 0.9f
        skid += (sk - skid) * min(1f, 10f * dt)
        brakeHeat = (brakeHeat + (if (braking && speed > 15f) dt * speed / 90f else -dt * 0.18f)).coerceIn(0f, 1f)
        if (backfireT > 0f) backfireT -= dt
        if (skid > 0.28f && speed > 6f) {
            if (ps - skidLastS > 0.55f) {
                skidLastS = ps
                val rear = carSpec.length * 0.31f
                for (side in 0..1) {
                    val lx = (side * 2 - 1) * (carSpec.width * 0.5f - 0.18f)
                    val i = skidHead
                    skidX[i] = px + lx * cos(yaw) + rear * sin(yaw)
                    skidS[i] = ps - rear * cos(yaw) + lx * sin(yaw)
                    skidYaw[i] = yaw
                    skidT[i] = time + (1f - skid) * -6f
                    skidHead = (skidHead + 1) % MAX_SKID
                    if (skidUsed < MAX_SKID) skidUsed++
                }
            }
        } else skidLastS = ps
        // weight transfer: heavier / taller cars roll and pitch more on softer springs
        val massK = spec.massKg / 1500f
        val springK = 70f / massK.coerceIn(0.8f, 1.6f)
        val rollTarget = (latAcc * 0.011f * (0.7f + 0.3f * massK)).coerceIn(-0.1f, 0.1f) + (vx * 0.004f)
        rollVel += ((rollTarget - roll) * springK - rollVel * 9f) * dt
        roll += rollVel * dt
        val pitchTarget = (lonAcc * 0.0055f * (0.75f + 0.25f * massK)).coerceIn(-0.06f, 0.05f)
        pitchVel += ((pitchTarget - pitch) * springK * 0.86f - pitchVel * 8f) * dt
        pitch += pitchVel * dt
        if (speed > 3f && rand() < dt * (1.5f + speed * 0.05f)) suspVel += rand(-0.06f, 0.06f) * min(1f, speed / 30f)
        suspVel += (-suspY * springK * 2f - suspVel * 9f) * dt
        suspY += suspVel * dt
        wheelAngle -= speed / spec.wheelRadius * dt
        steerAngle = (steerSmooth * 0.42f * (1f - min(0.6f, speed / 90f)))
        val blinkPhase = (time * 2.2f) % 1f
        blinkLeft = false; blinkRight = false
        if (crashed && blinkPhase < 0.5f) { blinkLeft = true; blinkRight = true }

        // ---------------- effects
        spawnCarEffects(dt, brake)

        // ---------------- world systems
        updateTraffic(dt, hornPressed)
        updateRacers(dt)
        updateZones(dt)
        updateCoins(dt)
        updateScenery()
        particles.update(dt)

        if (state == STATE_RACING) {
            raceTime += dt
            checkCollisions()
            if (state == STATE_RACING && onFoot) pedestrianHits()
            if (state == STATE_RACING) scoring(dt, step)
            if (state == STATE_RACING) modeLogic(dt)
        }
        if (state == STATE_RACING || state == STATE_CRASHED) taxiLogic(dt)
        if (state == STATE_ATTRACT) {
            // the demo car never ends: if anything goes wrong, just clear the area
            checkCollisions()
        }
        if (state == STATE_CRASHED) {
            crashTimer += rawDt
            if (crashTimer > 0.9f) timeScale = min(1f, timeScale + rawDt * 0.8f)
            if (mode == GameData.MODE_FREE && crashTimer > 2.0f) {
                respawn()
            } else if (crashTimer > 2.3f) {
                if (driftChain > 0f) { driftChain = 0f }
                evaluateResult(false)
                state = STATE_OVER
                timeScale = 1f
                listener?.onGameOver()
            }
        }

        // floating origin
        if (ps > REBASE_AT) rebase(REBASE_STEP)

        updateEngineAudio(if (gas || nitroActive) 1f else 0.15f)
        publish()
    }

    // ======================================================================== weather
    /** Weather eases towards its target (≈12 s); free roam picks new weather every 1–2 minutes. */
    private fun updateWeather(dt: Float) {
        if (mode == GameData.MODE_FREE && state != STATE_ATTRACT) {
            weatherTimer -= dt
            if (weatherTimer <= 0f) {
                weatherTimer = rand(70f, 140f)
                val p = rand()
                var w = when {
                    p < 0.38f -> GameData.W_CLEAR
                    p < 0.54f -> GameData.W_LIGHT_RAIN
                    p < 0.64f -> GameData.W_HEAVY_RAIN
                    p < 0.76f -> GameData.W_FOG
                    p < 0.86f -> GameData.W_STORM
                    else -> GameData.W_SNOW
                }
                if (env == GameData.ENV_DESERT && w != GameData.W_FOG) w = GameData.W_CLEAR
                if (w == GameData.W_SNOW && env != GameData.ENV_SNOW && env != GameData.ENV_MOUNTAIN) w = GameData.W_LIGHT_RAIN
                weather = w
            }
        }
        val w = weather
        val k = min(1f, dt * 0.085f)
        rain += (GameData.W_RAIN[w] - rain) * k
        snowFall += (GameData.W_SNOWFALL[w] - snowFall) * k
        cloud += (GameData.W_CLOUD[w] - cloud) * k
        fogMul += (GameData.W_FOGMUL[w] - fogMul) * k
        val wt = GameData.W_WET[w]
        wet += (wt - wet) * (if (wt > wet) k * 1.6f else k * 0.25f)
        lightning = max(0f, lightning - dt * 3.2f)
        if (w == GameData.W_STORM && cloud > 0.7f && state != STATE_SHOWROOM) {
            nextFlashT -= dt
            if (nextFlashT <= 0f) {
                lightning = 1f
                nextFlashT = rand(5f, 13f)
                thunderT = rand(0.35f, 1.8f)
            }
        }
        if (thunderT > 0f) {
            thunderT -= dt
            if (thunderT <= 0f) {
                audio?.trigger(AudioEngine.SFX_THUNDER)
                shake = max(shake, 0.12f)
            }
        }
        audio?.let {
            it.rainLevel = rain * (1f - tunnelK)
            it.sirenLevel = sirenLevel
            it.tunnelLevel = tunnelK
        }
    }

    /** Grip multiplier from the weather: wet asphalt and fresh snow reduce tyre grip. */
    fun weatherGrip(): Float = 1f - 0.2f * wet - 0.22f * snowFall

    // ======================================================================== AI racers (rivals / police)
    private var gapSpeed = 0f

    /** Free distance ahead of (x, s) in that lane, considering traffic, other racers and the player. */
    private fun laneGap(x: Float, s: Float, self: Racer): Float {
        var best = 1e9f
        gapSpeed = 0f
        for (t in traffic) {
            if (!t.active) continue
            if (abs(t.x - x) > 2.2f) continue
            val d = t.s - s - t.length * 0.5f - 2.4f
            if (d < -3f) continue
            val eff = if (t.dir < 0) d * 0.5f else d
            if (eff < best) { best = eff; gapSpeed = if (t.dir < 0 || t.crashed) 0f else t.speed }
        }
        for (o in rivals) {
            if (!o.active || o === self || o.wrecked) continue
            if (abs(o.x - x) > 2.0f) continue
            val d = o.s - s - 4.8f
            if (d > -2f && d < best) { best = d; gapSpeed = o.speed }
        }
        if (!self.cop && abs(px - x) < 2.0f) {
            val d = ps - s - 4.8f
            if (d > -2f && d < best) { best = d; gapSpeed = speed }
        }
        return max(best, 0f)
    }

    private fun laneClearFor(l: Int, r: Racer): Boolean {
        val lx = GameData.LANE_X[l]
        for (t in traffic) {
            if (!t.active) continue
            if (abs(t.x - lx) < 2.4f && abs(t.s - r.s) < t.length * 0.5f + 4.6f) return false
        }
        for (o in rivals) {
            if (!o.active || o === r) continue
            if (abs(o.x - lx) < 2.2f && abs(o.s - r.s) < 6f) return false
        }
        if (!r.cop && abs(px - lx) < 2.2f && abs(ps - r.s) < 6.5f) return false
        return true
    }

    private fun spawnRivals() {
        val n = cfg.rivals.coerceIn(0, MAX_RACERS - 1)
        val lanes = intArrayOf(3, 1, 0)
        val offs = floatArrayOf(0f, -8f, -8f)
        for (i in 0 until n) {
            val r = rivals[i]
            r.active = true; r.cop = false
            r.car = if (i == 0 && cfg.rivalCar >= 0) cfg.rivalCar else RIVAL_CARS[(rand() * RIVAL_CARS.size).toInt().coerceIn(0, RIVAL_CARS.size - 1)]
            val pal = GameData.PAINT_PALETTE
            r.color = pal[(rand() * pal.size).toInt().coerceIn(0, pal.size - 1)]
            r.lane = lanes[i]; r.x = GameData.LANE_X[r.lane]; r.s = offs[i]; r.speed = 0f
            r.skill = cfg.rivalSkill * (if (i == 0) 1f else 0.95f - 0.025f * i)
            r.finished = false; r.finishTime = 0f; r.wrecked = false; r.spin = 0f; r.spinVel = 0f
            r.yaw = 0f; r.bumpCd = 0f; r.laneCd = 1.5f; r.brakeLight = 0f; r.name = i
        }
    }

    private var copsOut = false

    private fun spawnCops(n: Int) {
        var k = 0
        for (r in rivals) {
            if (k >= n) break
            if (r.active) continue
            r.active = true; r.cop = true; r.car = GameData.CAR_POLICE; r.color = 0xFF14161C.toInt()
            r.lane = (rand() * 4).toInt().coerceIn(0, 3); r.x = GameData.LANE_X[r.lane]
            r.s = ps - 110f - k * 20f; r.speed = max(speed * 1.05f, 25f)
            r.skill = 1f; r.wrecked = false; r.spin = 0f; r.spinVel = 0f; r.yaw = 0f
            r.bumpCd = 0f; r.laneCd = 0.6f; r.finished = false; r.brakeLight = 0f
            k++
        }
        copsOut = k > 0
        hudEvent = EV_WAVE; hudEventSeq++
    }

    private fun updateRacers(dt: Float) {
        if (state != STATE_RACING && state != STATE_CRASHED) {
            sirenLevel = max(0f, sirenLevel - dt * 0.8f)
            return
        }
        val pspec = carSpec
        val playerTop = GameData.topSpeedKmh(pspec, lvlSpeed) / 3.6f
        var nearestCop = 1e9f
        for (r in rivals) {
            if (!r.active) continue
            val rs = GameData.cars[r.car]
            r.bumpCd -= dt; r.laneCd -= dt
            if (r.wrecked) {
                r.speed = max(0f, r.speed - 14f * dt)
                r.s += r.speed * dt
                r.spin += r.spinVel * dt
                r.spinVel *= 1f - min(1f, 1.4f * dt)
                r.yaw = r.spin
                r.brakeLight = 1f
                r.wheelAngle -= r.speed / rs.wheelRadius * dt
                if (r.s < ps - 140f) r.active = false
                continue
            }
            val ds = r.s - ps
            var maxV: Float
            if (r.cop) {
                maxV = playerTop * (0.95f + 0.035f * heat)
                if (ds < -90f) maxV *= 1.14f
                if (ds > 30f) maxV *= 0.85f
            } else {
                maxV = (GameData.topSpeedKmh(rs, 2) / 3.6f * 0.5f + playerTop * 0.5f) * r.skill
                if (ds < -70f) maxV *= 1.07f else if (ds > 90f) maxV *= 0.95f
            }
            val look = 18f + r.speed * 1.2f
            var gap = laneGap(r.x, r.s, r)
            var obsSpeed = gapSpeed
            if (r.laneCd <= 0f && gap < look) {
                var bestLane = r.lane
                var bestGap = gap
                for (d in intArrayOf_m1_p1) {
                    val l = r.lane + d
                    if (l < 0 || l > 3 || laneDir(l) < 0) continue
                    if (!laneClearFor(l, r)) continue
                    val g = laneGap(GameData.LANE_X[l], r.s, r)
                    if (g > bestGap + 8f) { bestGap = g; bestLane = l }
                }
                if (bestLane != r.lane) {
                    r.lane = bestLane; r.laneCd = 1.1f
                    gap = laneGap(GameData.LANE_X[bestLane], r.s, r); obsSpeed = gapSpeed
                } else r.laneCd = 0.4f
            }
            if (r.cop && r.laneCd <= 0f && abs(ds) < 45f && rand() < dt * 1.3f) {
                // pursuit: line up with the suspect to ram or box in
                var pl = 0
                var bd = 99f
                for (l in 0 until 4) { val dd = abs(px - GameData.LANE_X[l]); if (dd < bd) { bd = dd; pl = l } }
                if (pl != r.lane && laneDir(pl) > 0) {
                    val stepL = if (pl > r.lane) r.lane + 1 else r.lane - 1
                    if (laneClearFor(stepL, r)) { r.lane = stepL; r.laneCd = 1.3f }
                }
            }
            var desired = maxV
            val safe = 8f + r.speed * (if (r.cop && abs(ds) < 40f) 0.35f else 0.6f)
            if (gap < safe) desired = min(desired, max(0f, obsSpeed) + gap * 0.25f)
            val ratio = r.speed / max(maxV, 1f)
            val f = 1f - ratio * ratio
            if (desired > r.speed) r.speed += rs.accel * min(r.skill, 1.15f) * max(f, 0.1f) * dt * (if (r.cop) 1.15f else 1f)
            else r.speed = max(desired, r.speed - 11f * dt)
            r.brakeLight += ((if (desired < r.speed - 0.5f) 1f else 0f) - r.brakeLight) * min(1f, 10f * dt)
            val tx = GameData.LANE_X[r.lane]
            val vxr = ((tx - r.x) * 2.2f).coerceIn(-4.2f, 4.2f)
            r.x += vxr * dt
            r.yaw = -atan2(vxr, max(r.speed, 3f))
            r.s += r.speed * dt
            r.wheelAngle -= r.speed / rs.wheelRadius * dt
            // contact with traffic: police units wreck (takedown), rivals lose speed
            if (r.bumpCd <= 0f) for (t in traffic) {
                if (!t.active || t.crashed) continue
                if (abs(t.x - r.x) < (rs.width + t.width) * 0.5f - 0.15f && abs(t.s - r.s) < (rs.length + t.length) * 0.5f - 0.1f) {
                    if (r.cop) wreckCop(r, t)
                    else {
                        r.speed *= 0.45f
                        r.bumpCd = 1f
                        t.speed += 2f
                    }
                    break
                }
            }
            if (state == STATE_RACING && r.bumpCd <= 0f &&
                abs(px - r.x) < (pspec.width + rs.width) * 0.5f - 0.05f && abs(ps - r.s) < (pspec.length + rs.length) * 0.5f) {
                bumpRacer(r)
            }
            if (!r.cop && finishS > 0f && !r.finished && r.s >= finishS) { r.finished = true; r.finishTime = raceTime }
            if (r.cop) {
                nearestCop = min(nearestCop, abs(ds))
                if (ds < -320f) r.active = false
            } else if (finishS == 0f && ds < -400f) r.active = false
        }
        sirenLevel = if (nearestCop < 1e8f) (1f - nearestCop / 180f).coerceIn(0f, 1f) else 0f
    }

    private fun bumpRacer(r: Racer) {
        val rs = GameData.cars[r.car]
        val side = if (px >= r.x) 1f else -1f
        val lateral = abs(px - r.x) > (carSpec.width + rs.width) * 0.33f
        when {
            lateral -> { vx += side * 4f; r.x -= side * 0.35f }
            r.s < ps -> { speed = max(speed, r.speed * 0.98f); r.speed *= 0.85f }
            else -> { speed *= 0.85f; r.speed = max(r.speed, speed) }
        }
        r.bumpCd = 0.6f
        shake = max(shake, 0.35f)
        val cx = (px + r.x) * 0.5f
        val cz = -(ps + r.s) * 0.5f
        for (k in 0 until 14) {
            particles.spawn(cx, rand(0.3f, 0.8f), cz, rand(-5f, 5f), rand(1f, 4f), rand(-5f, 5f) - speed * 0.7f,
                rand(0.25f, 0.5f), 0.08f, 0.02f, 1f, 0.8f, 0.3f, 1f, true, -9f, 0.5f, 1f, 0.4f, 0.05f)
        }
        audio?.trigger(AudioEngine.SFX_HIT)
        if (r.cop) bust = min(1f, bust + 0.12f)
    }

    private fun wreckCop(r: Racer, t: TrafficCar) {
        r.wrecked = true
        val side = if (r.x >= t.x) 1f else -1f
        r.spinVel = side * rand(2.5f, 4f)
        r.spin = r.yaw
        r.speed *= 0.4f
        t.crashed = true
        t.spinVel = -side * rand(1.2f, 2.5f)
        t.crashVx = -side * rand(1.5f, 3f)
        takedowns++
        score += 500.0 * heat
        hudEvent = EV_TAKEDOWN; hudEventSeq++
        audio?.trigger(AudioEngine.SFX_CRASH)
        val cx = (r.x + t.x) * 0.5f
        val cz = -(r.s + t.s) * 0.5f
        for (k in 0 until 30) {
            particles.spawn(cx, rand(0.3f, 1.2f), cz, rand(-7f, 7f), rand(1f, 7f), rand(-7f, 7f),
                rand(0.35f, 0.8f), 0.1f, 0.02f, 1f, 0.85f, 0.4f, 1f, true, -12f, 0.6f, 1f, 0.35f, 0.05f)
        }
        for (k in 0 until 10) {
            particles.spawn(cx + rand(-1f, 1f), rand(0.4f, 1.2f), cz + rand(-1f, 1f), rand(-1f, 1f), rand(0.8f, 2f), rand(-1f, 1f),
                rand(1.5f, 2.5f), 0.8f, 3.6f, 0.3f, 0.3f, 0.32f, 0.6f, false, 0.2f, 0.5f)
        }
        explode(r.x, -r.s, r.speed)
    }

    /**
     * Wreck explosion (police takedowns): white-hot flash, rolling fireball that cools from yellow
     * to deep red, burning debris arcs and a dark smoke column left behind on the road.
     */
    private fun explode(ex: Float, ez: Float, carSpeed: Float) {
        val drift = -min(carSpeed, speed) * 0.25f
        particles.spawn(ex, 1.2f, ez, 0f, 0.5f, drift, 0.16f, 5.5f, 8f, 1f, 0.95f, 0.8f, 0.9f, true)
        for (k in 0 until 16) {
            val a = rand(0f, 6.283f); val v = rand(1.5f, 4.5f)
            particles.spawn(ex + rand(-0.6f, 0.6f), rand(0.5f, 1.3f), ez + rand(-0.8f, 0.8f),
                cos(a) * v, rand(2f, 5.5f), sin(a) * v + drift,
                rand(0.55f, 0.95f), rand(0.7f, 1.1f), rand(2.2f, 3.2f), 1f, 0.82f, 0.35f, 0.95f, true, 1.5f, 1.4f, 0.85f, 0.12f, 0.02f)
        }
        for (k in 0 until 12) {
            particles.spawn(ex, rand(0.6f, 1.2f), ez, rand(-6f, 6f), rand(5f, 10f), rand(-6f, 6f) + drift,
                rand(0.9f, 1.5f), 0.18f, 0.06f, 1f, 0.6f, 0.15f, 1f, true, -14f, 0.25f, 0.9f, 0.2f, 0.02f)
        }
        for (k in 0 until 12) {
            particles.spawn(ex + rand(-0.8f, 0.8f), rand(1f, 2f), ez + rand(-0.8f, 0.8f), rand(-0.8f, 0.8f), rand(1.6f, 3f), rand(-0.8f, 0.8f) + drift * 0.5f,
                rand(2.4f, 3.6f), 1.2f, 5.5f, 0.09f, 0.08f, 0.08f, 0.75f, false, 0.35f, 0.6f)
        }
        shake = max(shake, 0.6f)
    }

    // ======================================================================== mode objectives
    private fun medalFor(v: Float): Int = when {
        cfg.gold > 0f && v >= cfg.gold -> 3
        cfg.silver > 0f && v >= cfg.silver -> 2
        cfg.bronze > 0f && v >= cfg.bronze -> 1
        else -> 0
    }

    private fun finishRace(reason: Int) {
        crashedReason = reason
        state = STATE_OVER
        timeScale = 1f
        listener?.onGameOver()
    }

    /** Result of a run that ended by crashing (or being busted). */
    private fun evaluateResult(@Suppress("UNUSED_PARAMETER") finished: Boolean) {
        when (mode) {
            GameData.MODE_DRIFT -> { medal = medalFor(score.toFloat()); success = medal > 0 }
            GameData.MODE_CHALLENGE -> { medal = medalFor(nearMisses.toFloat()); success = medal > 0 }
            GameData.MODE_POLICE -> success = cfg.goal > 0f && escapes >= cfg.goal.toInt()
            GameData.MODE_ENDLESS, GameData.MODE_TWO_WAY, GameData.MODE_TIME_ATTACK -> success = cfg.goal > 0f && score >= cfg.goal
            else -> success = false
        }
    }

    private fun modeLogic(dt: Float) {
        when (mode) {
            GameData.MODE_STREET -> {
                var ahead = 0
                for (r in rivals) if (r.active && !r.cop && (r.finished || r.s > ps)) ahead++
                position = 1 + ahead
                if (finishS > 0f && ps >= finishS) {
                    success = true
                    medal = when (position) { 1 -> 3; 2 -> 2; 3 -> 1; else -> 0 }
                    score = (5 - position) * 1000.0 + nearMisses * 50.0
                    finishRace(REASON_FINISH)
                }
            }
            GameData.MODE_TIME_TRIAL -> {
                if (finishS > 0f && ps >= finishS) {
                    success = true
                    medal = when {
                        raceTime <= cfg.gold -> 3
                        raceTime <= cfg.silver -> 2
                        raceTime <= cfg.bronze -> 1
                        else -> 0
                    }
                    // leaderboard value: average speed (km/h × 10)
                    score = (cfg.goal / max(raceTime, 1f) * 36f).toDouble()
                    finishRace(REASON_FINISH)
                }
            }
            GameData.MODE_DRIFT -> {
                driftScoring(dt)
                timeLeft -= dt
                if (timeLeft <= 0f) {
                    timeLeft = 0f
                    bankDrift()
                    medal = medalFor(score.toFloat()); success = medal > 0
                    finishRace(REASON_TIME)
                }
            }
            GameData.MODE_CHALLENGE -> {
                timeLeft -= dt
                if (cfg.gold > 0f && nearMisses >= cfg.gold) {
                    medal = 3; success = true
                    finishRace(REASON_FINISH)
                } else if (timeLeft <= 0f) {
                    timeLeft = 0f
                    medal = medalFor(nearMisses.toFloat()); success = medal > 0
                    finishRace(REASON_TIME)
                }
            }
            GameData.MODE_POLICE -> policeLogic(dt)
            GameData.MODE_ENDLESS, GameData.MODE_TWO_WAY, GameData.MODE_TIME_ATTACK -> {
                // story missions: reach the target score
                if (cfg.missionId >= 0 && cfg.goal > 0f && score >= cfg.goal) {
                    success = true
                    hudEvent = EV_GOAL; hudEventSeq++
                    finishRace(REASON_FINISH)
                }
            }
            else -> {}
        }
    }

    private fun driftScoring(dt: Float) {
        val ang = abs(driftAngle)
        if (ang > 0.14f && speed > 11f) {
            driftChainTime += dt
            driftMult = min(5, 1 + (driftChainTime / 2.2f).toInt())
            driftChain += Math.toDegrees(ang.toDouble()).toFloat() * speedKmh * dt * 0.05f * driftMult
            driftEndTimer = 0f
        } else if (driftChain > 0f) {
            driftEndTimer += dt
            if (driftEndTimer > 0.7f) bankDrift()
        }
        if (scraping > 0.5f && driftChain > 0f) {
            driftChain = 0f; driftChainTime = 0f; driftMult = 1
            hudDriftLostSeq++
        }
    }

    private fun bankDrift() {
        if (driftChain >= 1f) {
            score += driftChain
            hudDriftBank = driftChain.toInt()
            hudDriftSeq++
            audio?.trigger(AudioEngine.SFX_NEAR)
        }
        driftChain = 0f; driftChainTime = 0f; driftMult = 1
    }

    private fun policeLogic(dt: Float) {
        if (!copsOut) {
            copWaveTimer -= dt
            if (copWaveTimer <= 0f) spawnCops(min(MAX_RACERS, heat + 1))
            bust = max(0f, bust - dt * 0.3f)
            return
        }
        var active = 0
        var close = 0
        var allFar = true
        var ahead = false
        var behind = false
        for (r in rivals) {
            if (!r.active || !r.cop || r.wrecked) continue
            active++
            val ds = r.s - ps
            if (ds > -150f) allFar = false
            if (abs(ds) < 11f && abs(r.x - px) < 4.2f) close++
            if (ds > 2f && ds < 12f && abs(r.x - px) < 2.6f) ahead = true
            if (ds < -2f && ds > -12f && abs(r.x - px) < 2.6f) behind = true
        }
        if (active == 0) escape = 1f
        else if (allFar) escape += dt / 5f
        else escape = max(0f, escape - dt * 0.6f)
        val slow = speedKmh < 70f
        when {
            close > 0 && slow -> bust += dt * 0.42f * close
            ahead && behind -> bust += dt * 0.3f
            close == 0 -> bust -= dt * 0.18f
        }
        bust = bust.coerceIn(0f, 1f)
        if (escape >= 1f) {
            escapes++
            escape = 0f
            score += 1500.0 * heat
            heat = min(5, heat + 1)
            for (r in rivals) if (r.cop) r.active = false
            copsOut = false
            copWaveTimer = 9f
            bust = 0f
            hudEvent = EV_ESCAPE; hudEventSeq++
            audio?.trigger(AudioEngine.SFX_CHECKPOINT)
            if (cfg.goal > 0f && escapes >= cfg.goal.toInt()) {
                success = true
                finishRace(REASON_FINISH)
            }
            return
        }
        if (bust >= 1f) {
            success = false
            finishRace(REASON_BUSTED)
        }
    }

    /** Free roam: no game over — the car is put back on the road after a crash. */
    private fun respawn() {
        state = STATE_RACING
        timeScale = 1f; crashTimer = 0f
        crashSpin = 0f; crashSpinVel = 0f; vx = 0f; yaw = 0f; driftAngle = 0f; drifting = false
        var best = 0
        var bd = 99f
        for (l in 0 until 4) { val d = abs(px - GameData.LANE_X[l]); if (d < bd) { bd = d; best = l } }
        px = GameData.LANE_X[best]
        for (t in traffic) if (t.active && t.s > ps - 25f && t.s < ps + 70f) t.active = false
        speed = 8f
        shake = 0f
        combo = 0
    }

    /** Free roam: the player ends the drive from the pause menu. */
    fun endFreeRoam() {
        if (state == STATE_RACING || state == STATE_CRASHED || state == STATE_COUNTDOWN) {
            success = true
            paused = false
            finishRace(REASON_FINISH)
        }
    }

    /** Free roam: swap the car without leaving the road. */
    fun swapCar(id: Int, color: Int, speedLvl: Int, handlingLvl: Int, brakeLvl: Int, nitroLvl: Int) {
        configureCar(id, color, speedLvl, handlingLvl, brakeLvl, nitroLvl)
        speed = min(speed, GameData.topSpeedKmh(carSpec, speedLvl) / 3.6f)
        for (k in 0 until 24) {
            particles.spawn(px + rand(-1.2f, 1.2f), rand(0.2f, 1.4f), -ps + rand(-2f, 2f), rand(-1f, 1f), rand(0.5f, 2f), rand(-1f, 1f) - speed * 0.5f,
                rand(0.5f, 0.9f), 0.3f, 0.05f, 0.4f, 0.9f, 1f, 0.9f, true, 0f, 0.5f)
        }
    }


    // ======================================================================== v2.0: on foot (free roam)
    /** free roam: the driver has stepped out; the car stays parked at (px, ps) */
    var onFoot = false; private set
    var footX = 0f; private set
    var footS = 0f; private set
    /** heading, same convention as the car yaw (0 = along the road) */
    var footYaw = 0f; private set
    var footSpeed = 0f; private set
    /** walk cycle phase (radians) */
    var footPhase = 0f; private set
    /** 0..1 knocked-over pose after being hit by traffic */
    var footFallK = 0f; private set
    private var footDown = 0f
    private var footStepAcc = 0f
    /** how far behind the focus point scenery is kept (more on foot, the camera can look back) */
    var sceneryBack = 30f; private set

    fun canExitCar() = mode == GameData.MODE_FREE && state == STATE_RACING && !onFoot && speed < 1.5f && taxiState != TAXI_BOARDING
    fun nearCar(): Boolean {
        if (!onFoot) return false
        val dx = footX - px; val ds = footS - ps
        return dx * dx + ds * ds < 3.9f * 3.9f
    }

    private fun toggleDoor() {
        if (!onFoot) {
            if (!canExitCar()) return
            onFoot = true
            speed = 0f; vx = 0f; nitroActive = false; drifting = false; driftAngle = 0f
            val d = carSpec.width * 0.5f + 0.55f
            val ca = cos(yaw); val sa = sin(yaw)
            // driver door is on the left side of the car
            footX = (px - ca * d).coerceIn(-FOOT_MAX_X, FOOT_MAX_X)
            footS = ps - sa * d + 0.2f
            footYaw = yaw; footSpeed = 0f; footPhase = 0f; footDown = 0f; footFallK = 0f
            // keep more scenery behind: the walker can turn around
            sceneryBack = 120f
            for (it in scenery) {
                if (it.s - it.span >= ps - sceneryBack) {
                    it.s -= it.span
                    if (it.category != CAT_LAMP && it.category != CAT_RAIL) generate(it)
                    it.visible = it.category <= CAT_LAMP || hash01(it.seed + (it.s * 0.1f).toInt()) < sceneryDensity
                }
            }
            audio?.trigger(AudioEngine.SFX_DOOR)
            hudEvent = EV_EXIT; hudEventSeq++
        } else if (nearCar() && footDown <= 0f) {
            onFoot = false
            sceneryBack = 30f
            footSpeed = 0f
            audio?.trigger(AudioEngine.SFX_DOOR)
            hudEvent = EV_ENTER; hudEventSeq++
        }
    }

    private fun updateOnFoot(dt: Float, steer: Float, fwd: Boolean, back: Boolean, sprint: Boolean) {
        if (footDown > 0f) {
            footDown -= dt
            footFallK = min(1f, footFallK + dt * 6f)
            footSpeed = 0f
            return
        }
        footFallK = max(0f, footFallK - dt * 2.5f)
        if (footFallK > 0.05f) return
        // turn rate eases off while sprinting for finer control
        footYaw -= steer * (if (sprint && fwd) 2.0f else 2.7f) * dt
        val target = when {
            fwd -> if (sprint) FOOT_RUN else FOOT_WALK
            back -> -1.6f
            else -> 0f
        }
        footSpeed += (target - footSpeed) * min(1f, dt * 7f)
        var nx = footX - sin(footYaw) * footSpeed * dt
        var ns = footS + cos(footYaw) * footSpeed * dt
        nx = nx.coerceIn(-FOOT_MAX_X, FOOT_MAX_X)
        ns = ns.coerceIn(ps - FOOT_MAX_BACK, ps + FOOT_MAX_AHEAD)
        // solid parked car (oriented box push-out)
        val ca = cos(yaw); val sa = sin(yaw)
        val dx = nx - px; val ds = ns - ps
        var lx = dx * ca + ds * sa
        var lz = dx * sa - ds * ca
        val hw = carSpec.width * 0.5f + 0.3f
        val hl = carSpec.length * 0.5f + 0.3f
        if (abs(lx) < hw && abs(lz) < hl) {
            if (hw - abs(lx) < hl - abs(lz)) lx = if (lx < 0f) -hw else hw else lz = if (lz < 0f) -hl else hl
            nx = px + lx * ca + lz * sa
            ns = ps + lx * sa - lz * ca
        }
        footX = nx; footS = ns
        val sp = abs(footSpeed)
        footPhase += sp * dt * (if (sp > 4f) 2.6f else 3.4f)
        footStepAcc += sp * dt
        if (footStepAcc > (if (sp > 4f) 1.15f else 0.75f)) { footStepAcc = 0f; audio?.trigger(AudioEngine.SFX_STEP) }
    }

    /** Traffic vs. the pedestrian: cars brake for them (see updateTraffic); a fast hit knocks them over. */
    private fun pedestrianHits() {
        for (t in traffic) {
            if (!t.active) continue
            val ox = (t.width * 0.5f + 0.32f) - abs(t.x - footX)
            val os = (t.length * 0.5f + 0.32f) - abs(t.s - footS)
            if (ox <= 0f || os <= 0f) continue
            val side = if (footX >= t.x) 1f else -1f
            if (t.speed > 3f && footDown <= 0f) {
                footDown = 2.4f
                footX = (footX + side * (ox + 0.9f)).coerceIn(-FOOT_MAX_X, FOOT_MAX_X)
                shake = max(shake, 0.5f)
                audio?.trigger(AudioEngine.SFX_HIT)
                t.speed *= 0.5f
                hudEvent = EV_OUCH; hudEventSeq++
            } else {
                footX = (footX + side * ox).coerceIn(-FOOT_MAX_X, FOOT_MAX_X)
            }
        }
    }

    // ======================================================================== v2.0: taxi jobs
    /** passenger jobs are offered (Endless: on by default; free roam: started from the phone) */
    @Volatile var taxiOn = false
    /** player preference (phone taxi app): offer jobs in Endless */
    @Volatile var taxiInEndless = true
    var taxiState = TAXI_OFF; private set
    var taxiPickS = 0f; private set
    var taxiPickSide = 1; private set
    var taxiDropS = 0f; private set
    var taxiDropSide = 1; private set
    var taxiTimer = 0f; private set
    var taxiLimit = 0f; private set
    var taxiFare = 0; private set
    var taxiDest = 0; private set
    var taxiRides = 0; private set
    var taxiCoins = 0; private set
    var taxiStars = 0; private set
    var taxiLastPay = 0; private set
    var taxiLastTip = 0; private set
    private var taxiNextS = 0f
    private var taxiBumps = 0
    private var taxiStateT = 0f
    private var taxiRideDist = 0f
    // the passenger (rendered as a pedestrian)
    var paxX = 0f; private set
    var paxS = 0f; private set
    var paxYaw = 0f; private set
    var paxPhase = 0f; private set
    var paxWalk = 0f; private set
    var paxWave = 0f; private set
    var paxShirt = 0xFFE04848.toInt(); private set
    var paxPants = 0xFF2B3A5C.toInt(); private set
    var paxVisible = false; private set

    @Volatile var hudTaxiState = TAXI_OFF
    @Volatile var hudTaxiDist = 0f
    @Volatile var hudTaxiTime = 0f
    @Volatile var hudTaxiFare = 0
    @Volatile var hudTaxiDest = 0
    @Volatile var hudTaxiSeq = 0
    @Volatile var hudTaxiEvent = 0
    @Volatile var hudDoor = DOOR_NONE

    /** Free roam: start/stop the taxi shift from the phone. */
    fun setTaxiShift(on: Boolean) {
        taxiOn = on
        if (!on) {
            if (taxiState == TAXI_RIDING || taxiState == TAXI_BOARDING) {
                // passenger leaves without paying
                taxiEvent(TAXI_EV_CANCEL)
            }
            taxiState = TAXI_OFF; paxVisible = false
        } else if (taxiState == TAXI_OFF) {
            taxiState = TAXI_IDLE
            taxiNextS = ps + 60f
        }
    }

    private fun resetTaxi() {
        taxiState = if (taxiOn) TAXI_IDLE else TAXI_OFF
        taxiNextS = 220f
        taxiRides = 0; taxiCoins = 0; taxiStars = 0; taxiBumps = 0
        paxVisible = false
    }

    private fun taxiEvent(ev: Int) {
        hudTaxiEvent = ev; hudTaxiSeq++
    }

    private fun walkPax(tx: Float, ts: Float, speedMs: Float, dt: Float): Boolean {
        val dx = tx - paxX; val ds = ts - paxS
        val d = sqrt(dx * dx + ds * ds)
        if (d < 0.12f) { paxWalk = max(0f, paxWalk - dt * 5f); return true }
        val step = min(d, speedMs * dt)
        paxX += dx / d * step; paxS += ds / d * step
        paxYaw = atan2(-dx, ds)
        paxWalk = min(1f, paxWalk + dt * 5f)
        paxPhase += speedMs * dt * 3.4f
        return false
    }

    /** Is the player's car stopped next to the kerb at [s] on [side]? */
    private fun stoppedAt(s: Float, side: Int): Boolean =
        abs(ps - s) < 9f && px * side > 3.3f && speed < 4.2f

    private fun taxiLogic(dt: Float) {
        if (taxiState == TAXI_OFF) return
        if (!taxiOn) { taxiState = TAXI_OFF; paxVisible = false; return }
        taxiStateT += dt
        val crashed = state == STATE_CRASHED
        when (taxiState) {
            TAXI_IDLE -> {
                if (ps > taxiNextS && !crashed) {
                    taxiPickSide = if (rand() < 0.62f) 1 else -1
                    taxiPickS = ps + rand(240f, 330f)
                    paxX = taxiPickSide * (GameData.ROAD_HALF + GameData.SHOULDER + 0.7f)
                    paxS = taxiPickS
                    paxYaw = if (taxiPickSide > 0) HALF_PI else -HALF_PI
                    paxWalk = 0f; paxWave = 0f; paxVisible = true
                    paxShirt = PAX_SHIRTS[(rand() * PAX_SHIRTS.size).toInt().coerceIn(0, PAX_SHIRTS.size - 1)]
                    paxPants = PAX_PANTS[(rand() * PAX_PANTS.size).toInt().coerceIn(0, PAX_PANTS.size - 1)]
                    taxiState = TAXI_WAITING; taxiStateT = 0f
                    taxiEvent(TAXI_EV_NEW)
                    audio?.trigger(AudioEngine.SFX_PHONE)
                }
            }
            TAXI_WAITING -> {
                // walk back to the kerb spot if they had started towards the car
                val kx = taxiPickSide * (GameData.ROAD_HALF + GameData.SHOULDER + 0.7f)
                if (walkPax(kx, taxiPickS, 2.2f, dt)) paxYaw = if (taxiPickSide > 0) HALF_PI else -HALF_PI
                // hail the taxi as it approaches
                val rel = taxiPickS - ps
                paxWave += ((if (rel in 0f..110f) 1f else 0f) - paxWave) * min(1f, dt * 4f)
                if (rel < -28f) {
                    taxiState = TAXI_IDLE; paxVisible = false
                    taxiNextS = ps + rand(250f, 480f)
                    taxiEvent(TAXI_EV_MISSED)
                } else if (!crashed && stoppedAt(taxiPickS, taxiPickSide)) {
                    taxiState = TAXI_BOARDING; taxiStateT = 0f
                }
            }
            TAXI_BOARDING -> {
                paxWave = max(0f, paxWave - dt * 4f)
                if (speed > 4.5f || crashed) { taxiState = TAXI_WAITING; return }
                // walk to the passenger door on the kerb side
                val ca = cos(yaw); val sa = sin(yaw)
                val d = carSpec.width * 0.5f + 0.35f
                val tx = px + ca * d * taxiPickSide
                val ts = ps + sa * d * taxiPickSide
                if (walkPax(tx, ts, 2.6f, dt) || taxiStateT > 6f) {
                    paxVisible = false
                    taxiState = TAXI_RIDING; taxiStateT = 0f
                    taxiRideDist = rand(900f, 2100f)
                    taxiDropS = ps + taxiRideDist
                    taxiDropSide = if (rand() < 0.6f) 1 else -1
                    taxiLimit = taxiRideDist / 24f + 18f
                    taxiTimer = 0f; taxiBumps = 0
                    taxiDest = (rand() * NUM_DESTS).toInt().coerceIn(0, NUM_DESTS - 1)
                    taxiFare = 45 + (taxiRideDist * 0.085f).toInt()
                    audio?.trigger(AudioEngine.SFX_DOOR)
                    taxiEvent(TAXI_EV_ABOARD)
                }
            }
            TAXI_RIDING -> {
                if (!onFoot) taxiTimer += dt
                if (taxiDropS < ps - 30f) {
                    // missed the stop: a new drop-off further on, and a less happy passenger
                    taxiDropS = ps + rand(320f, 480f)
                    taxiBumps++
                    taxiLimit += 14f
                    taxiEvent(TAXI_EV_REROUTE)
                } else if (!crashed && stoppedAt(taxiDropS, taxiDropSide)) {
                    payFare()
                }
            }
            TAXI_ALIGHT -> {
                val kx = taxiDropSide * (GameData.ROAD_HALF + GameData.SHOULDER + 2.6f)
                if (taxiStateT < 1.4f) walkPax(kx, paxS, 2.4f, dt)
                else walkPax(kx, paxS + 30f, 1.9f, dt)
                if (taxiStateT > 7f || paxS < ps - 60f) {
                    paxVisible = false
                    taxiState = TAXI_IDLE
                    taxiNextS = ps + rand(150f, 380f)
                }
            }
        }
    }

    private fun payFare() {
        val frac = (taxiLimit - taxiTimer) / taxiLimit
        var stars = when { frac > 0.42f -> 5; frac > 0.28f -> 4; frac > 0.14f -> 3; frac > 0f -> 2; else -> 1 }
        stars = (stars - taxiBumps).coerceIn(1, 5)
        val base = if (frac > 0f) taxiFare else (taxiFare * 0.7f).toInt()
        val tip = (base * (stars - 1) * 0.12f).toInt()
        val mul = if (carId == GameData.CAR_TAXI) 1.5f else 1f
        val total = ((base + tip) * mul).toInt()
        taxiStars = stars; taxiLastPay = total; taxiLastTip = (tip * mul).toInt()
        taxiCoins += total
        taxiRides++
        score += total * 8.0
        // passenger steps out on the kerb side
        val ca = cos(yaw); val sa = sin(yaw)
        val d = carSpec.width * 0.5f + 0.35f
        paxX = px + ca * d * taxiDropSide; paxS = ps + sa * d * taxiDropSide
        paxVisible = true; paxWave = 0f; paxWalk = 0f
        taxiState = TAXI_ALIGHT; taxiStateT = 0f
        audio?.trigger(AudioEngine.SFX_FARE)
        taxiEvent(TAXI_EV_PAID)
        listener?.onTaxiFare(total, stars)
    }

    /** debug/demo builds: step out of the car right away (free roam) */
    fun debugExitCar() {
        if (mode != GameData.MODE_FREE || state != STATE_RACING || onFoot) return
        speed = 0f; vx = 0f
        toggleDoor()
    }

    /** debug/demo builds: 1 = a passenger waiting just ahead, 2 = a ride in progress */
    fun debugTaxi(stage: Int) {
        if (state != STATE_RACING) return
        taxiOn = true
        if (stage <= 1) {
            taxiState = TAXI_IDLE; taxiNextS = ps - 1f
            taxiLogic(0f)
            taxiPickS = ps + 42f; paxS = taxiPickS
        } else {
            taxiState = TAXI_RIDING; taxiStateT = 0f; paxVisible = false
            taxiDropS = ps + 430f; taxiDropSide = 1
            taxiLimit = 60f; taxiTimer = 12f; taxiFare = 168; taxiDest = 6; taxiBumps = 0
            taxiEvent(TAXI_EV_ABOARD)
        }
    }

    /** a scrape or crash during a ride costs a star */
    private fun taxiBump() {
        if (taxiState == TAXI_RIDING) taxiBumps++
    }

    private fun publishCity() {
        hudTaxiState = taxiState
        hudTaxiDist = when (taxiState) {
            TAXI_WAITING, TAXI_BOARDING -> taxiPickS - ps
            TAXI_RIDING -> taxiDropS - ps
            else -> 0f
        }
        hudTaxiTime = taxiLimit - taxiTimer
        hudTaxiFare = taxiFare
        hudTaxiDest = taxiDest
        hudDoor = when {
            canExitCar() -> DOOR_EXIT
            nearCar() -> DOOR_ENTER
            else -> DOOR_NONE
        }
    }

    // ======================================================================== landmarks / regions
    private fun pickZoneType(): Int {
        val p = rand()
        return when (env) {
            GameData.ENV_CITY -> when { p < 0.28f -> ZONE_TUNNEL; p < 0.48f -> ZONE_GAS; p < 0.66f -> ZONE_PARKING; p < 0.86f -> ZONE_DEALER; else -> ZONE_BRIDGE }
            GameData.ENV_DESERT -> when { p < 0.45f -> ZONE_GAS; p < 0.7f -> ZONE_BRIDGE; else -> ZONE_TUNNEL }
            GameData.ENV_SNOW, GameData.ENV_MOUNTAIN -> when { p < 0.55f -> ZONE_TUNNEL; p < 0.78f -> ZONE_BRIDGE; else -> ZONE_GAS }
            GameData.ENV_FOREST -> when { p < 0.35f -> ZONE_BRIDGE; p < 0.6f -> ZONE_TUNNEL; p < 0.85f -> ZONE_GAS; else -> ZONE_PARKING }
            GameData.ENV_COAST -> when { p < 0.45f -> ZONE_BRIDGE; p < 0.65f -> ZONE_GAS; p < 0.82f -> ZONE_PARKING; else -> ZONE_TUNNEL }
            else -> when { p < 0.35f -> ZONE_PARKING; p < 0.6f -> ZONE_GAS; p < 0.8f -> ZONE_BRIDGE; else -> ZONE_TUNNEL }
        }
    }

    private fun updateZones(dt: Float) {
        while (ps + 900f > nextZoneS) {
            var slot: Zone? = null
            for (z in zones) if (!z.active) { slot = z; break }
            val z = slot ?: break
            z.active = true
            z.seed = (rand() * 100000f).toInt()
            z.regionTo = -1
            z.side = if (rand() < 0.5f) -1 else 1
            val regionDue = mode == GameData.MODE_FREE && nextZoneS - lastRegionS > REGION_LENGTH
            z.type = if (regionDue) ZONE_TUNNEL else pickZoneType()
            val len = when (z.type) {
                ZONE_TUNNEL -> rand(240f, 380f)
                ZONE_BRIDGE -> rand(180f, 300f)
                else -> 70f
            }
            z.s0 = nextZoneS; z.s1 = nextZoneS + len
            if (regionDue) {
                regionIndex = (regionIndex + 1) % REGION_ORDER.size
                z.regionTo = REGION_ORDER[regionIndex]
                lastRegionS = z.s1
            }
            nextZoneS = z.s1 + rand(550f, 1200f) * (if (mode == GameData.MODE_FREE) 0.8f else 1f)
        }
        var inT = 0f
        for (z in zones) {
            if (!z.active) continue
            if (z.s1 < ps - 80f) { z.active = false; continue }
            if (z.type == ZONE_TUNNEL) {
                val a = ps - z.s0
                val b = z.s1 - ps
                if (a > -6f && b > -6f) inT = max(inT, ((min(a, b) + 6f) / 30f).coerceIn(0f, 1f))
                if (z.regionTo >= 0 && ps > (z.s0 + z.s1) * 0.5f) {
                    switchRegion(z.regionTo)
                    z.regionTo = -1
                }
            }
        }
        tunnelK += (inT - tunnelK) * min(1f, dt * 5f)
    }

    /** Free roam: the next region is swapped in while the player is deep inside a tunnel. */
    private fun switchRegion(newEnv: Int) {
        env = newEnv
        envVersion++
        regionSeq++
        buildScenery()
        hudEvent = EV_REGION; hudEventSeq++
    }

    /** Props are hidden where a landmark occupies the space (inside tunnels, over bridges, next to stations). */
    fun hiddenByZone(it: SceneryItem): Boolean {
        if (it.category == CAT_RAIL) return false
        for (z in zones) {
            if (!z.active) continue
            when (z.type) {
                ZONE_TUNNEL -> if (it.s > z.s0 - 12f && it.s < z.s1 + 12f && abs(it.x) < 80f) return true
                ZONE_BRIDGE -> if (it.category != CAT_LAMP && it.s > z.s0 - 10f && it.s < z.s1 + 10f) return true
                else -> if (it.category >= CAT_NEAR && it.side == z.side && it.s > z.s0 - 30f && it.s < z.s1 + 30f && abs(it.x) < 60f) return true
            }
        }
        return false
    }

    /** True while (x, s) is inside a tunnel or on a bridge (for the renderer and audio). */
    fun zoneAt(s: Float, type: Int): Zone? {
        for (z in zones) if (z.active && z.type == type && s >= z.s0 && s <= z.s1) return z
        return null
    }

    /** Tyre grip on the current surface: car tyres × environment × weather (all-terrain cars lose less). */
    /** nitro flame colour (garage option GameData.CUS_FLAME) */
    @Volatile var flameStyle = 0

    /** 0→1 over the first ~0.17 s of a brake press (initial bite, nose dive) */
    private var brakeHold = 0f
    private var brakePrev = false

    /**
     * Handbrake slide instead of normal braking. Drift mode: brake + steer (that's the mode's
     * technique). Free roam: only brake + gas + steer, so plain braking always stops the car.
     * All other modes: never — the brake pedal always brakes.
     */
    private fun handbrakeTurn(brake: Boolean, gas: Boolean, steerIn: Float): Boolean {
        if (!brake || !driftEnabled || speed <= 10f || abs(steerIn) <= 0.3f) return false
        return mode == GameData.MODE_DRIFT || gas
    }

    /**
     * Brake deceleration in m/s². Strong arcade braking that still differs per car (brake stat,
     * mass, brake upgrades) and per surface: ~22–36 m/s² on dry tarmac with a quick initial bite,
     * plus aerodynamic drag at high speed; wet/snow roads lengthen the stopping distance.
     */
    private fun brakeDecel(spec: CarSpec): Float {
        val base = GameData.brake(spec, lvlBrakes) * 1.85f
        val massMul = (1.12f - spec.massKg / 9000f).coerceIn(0.82f, 1.05f)
        val aero = speed * 0.075f
        val bite = 0.7f + 0.3f * brakeHold
        val surf = min(1.05f, 0.42f + 0.6f * surfaceGrip())
        return (base * massMul + aero) * bite * surf
    }

    fun surfaceGrip(): Float {
        val spec = carSpec
        var surf = GameData.envs[env].grip * weatherGrip()
        if (spec.allTerrain) surf = 1f - (1f - surf) * 0.45f
        return spec.grip * surf
    }

    private fun spawnCarEffects(dt: Float, brake: Boolean) {
        val spec = carSpec
        val ca = cos(yaw); val sa = sin(yaw)
        val baseZ = -ps
        if (nitroActive || backfireT > 0f) {
            val ex = EXHAUST_LOCAL[carId]
            val burst = !nitroActive && rand() < dt * 22f
            var i = 0
            while (i < ex.size) {
                val lx = ex[i]; val ly = ex[i + 1]; val lz = ex[i + 2]
                val wx = px + lx * ca + lz * sa
                val wz = baseZ - lx * sa + lz * ca
                val wy = ly + suspY
                if (nitroActive) {
                    // layered nitro flame: white-hot core, coloured cone and tail (garage option); longer with speed
                    val len = 1f + min(1f, speed / 60f)
                    val fc = FLAME_COLORS[flameStyle.coerceIn(0, FLAME_COLORS.size - 1)]
                    particles.spawn(wx, wy, wz, rand(-0.15f, 0.15f), rand(-0.05f, 0.1f), -speed + rand(8f, 11f) * len,
                        rand(0.05f, 0.08f), 0.2f, 0.06f, 1f, 1f, 1f, 1f, true, 0f, 0f, fc[0], fc[1], fc[2])
                    for (k in 0 until 2) {
                        particles.spawn(wx + rand(-0.04f, 0.04f), wy + rand(-0.03f, 0.03f), wz,
                            rand(-0.4f, 0.4f), rand(-0.1f, 0.3f), -speed + rand(5f, 9f) * len,
                            rand(0.1f, 0.2f), 0.34f, 0.1f, fc[3], fc[4], fc[5], 1f, true, 0f, 0f, fc[6], fc[7], fc[8])
                    }
                    if (rand() < 0.5f) particles.spawn(wx, wy, wz, rand(-0.6f, 0.6f), rand(0f, 0.5f), -speed + rand(2f, 5f),
                        rand(0.18f, 0.3f), 0.42f, 0.15f, fc[9], fc[10], fc[11], 0.7f, true, 0f, 0.5f, fc[12], fc[13], fc[14])
                } else if (burst) {
                    // exhaust backfire on lift-off / upshift: short orange fireball and a spark
                    for (k in 0 until 3) {
                        particles.spawn(wx, wy, wz, rand(-0.5f, 0.5f), rand(-0.1f, 0.4f), -speed + rand(3f, 6f),
                            rand(0.07f, 0.13f), 0.3f, 0.12f, 1f, 0.85f, 0.4f, 1f, true, 0f, 0.3f, 1f, 0.3f, 0.05f)
                    }
                    particles.spawn(wx, wy, wz, rand(-2f, 2f), rand(0.5f, 2f), -speed + rand(1f, 4f),
                        rand(0.2f, 0.35f), 0.05f, 0.02f, 1f, 0.9f, 0.5f, 1f, true, -9f, 0.2f, 1f, 0.4f, 0.1f)
                }
                i += 3
            }
        }
        // tyre smoke from the rear wheels while sliding / braking hard
        if (skid > 0.25f && speed > 6f && rand() < dt * 45f * skid) {
            val rear = spec.length * 0.31f
            for (k2 in 0..1) {
                val lx = (k2 * 2 - 1) * (spec.width * 0.5f - 0.18f)
                particles.spawn(px + lx * ca + rear * sa, 0.2f, baseZ - lx * sa + rear * ca,
                    rand(-0.4f, 0.4f), rand(0.4f, 1.1f), -speed * 0.25f + rand(-0.5f, 0.5f), rand(0.8f, 1.5f), 0.35f, 2.2f,
                    0.8f, 0.8f, 0.82f, 0.28f + skid * 0.25f, false, 0.25f, 0.9f)
            }
        }
        // water spray from the tyres on a wet road
        if (wet > 0.3f && speed > 12f && rand() < dt * 40f * wet) {
            val rear = spec.length * 0.31f
            for (k2 in 0..1) {
                val lx = (k2 * 2 - 1) * (spec.width * 0.5f - 0.15f)
                particles.spawn(px + lx * ca + rear * sa, 0.25f, baseZ - lx * sa + rear * ca + 0.3f,
                    (k2 * 2 - 1) * rand(0.3f, 1.2f), rand(0.5f, 1.5f), -speed * 0.3f, rand(0.4f, 0.7f), 0.3f, 1.8f,
                    0.78f, 0.8f, 0.84f, 0.22f * wet, false, -1.5f, 0.8f)
            }
        }
        if (speed > 18f && (env == GameData.ENV_SNOW || env == GameData.ENV_DESERT) && rand() < dt * 18f) {
            val snow = env == GameData.ENV_SNOW
            for (k2 in 0..1) {
                val side = k2 * 2 - 1
                particles.spawn(px + side * spec.width * 0.42f, 0.2f, baseZ + spec.length * 0.42f,
                    rand(-0.6f, 0.6f) + side * 0.4f, rand(0.4f, 1.2f), -speed * 0.35f, rand(0.5f, 0.8f), 0.3f, 1.3f,
                    if (snow) 0.95f else 0.82f, if (snow) 0.97f else 0.68f, if (snow) 1f else 0.48f, 0.35f, false, -0.8f, 0.6f)
            }
        }
        if (state == STATE_CRASHED && crashTimer < 1.6f && rand() < dt * 20f) {
            particles.spawn(px + rand(-0.6f, 0.6f), 0.9f, baseZ + rand(-1.5f, 1.5f),
                rand(-0.5f, 0.5f), rand(1f, 2f), rand(-0.5f, 0.5f), rand(1.2f, 2.0f), 0.6f, 3.2f,
                0.25f, 0.25f, 0.27f, 0.55f, false, 0.3f, 0.4f)
        }
    }

    private fun checkCollisions() {
        // parked car while walking: traffic treats it as an obstacle and goes around it
        if (onFoot) return
        val spec = carSpec
        for (t in traffic) {
            if (!t.active) continue
            val dx = abs(px - t.x)
            val ds = abs(ps - t.s)
            if (dx < (spec.width + t.width) * 0.5f - 0.14f && ds < (spec.length + t.length) * 0.5f - 0.12f) {
                if (state == STATE_ATTRACT) {
                    t.active = false
                    continue
                }
                crash(t)
                return
            }
        }
    }

    private fun crash(t: TrafficCar) {
        taxiBump()
        state = STATE_CRASHED
        crashTimer = 0f
        crashedReason = REASON_CRASH
        val side = if (px >= t.x) 1f else -1f
        crashSpinVel = side * rand(2.5f, 4.5f) * (if (t.dir < 0) 1.4f else 1f)
        crashSpin = yaw
        vx = side * rand(3f, 6f)
        val rel = if (t.dir > 0) speed - t.speed else speed + t.speed
        if (t.dir < 0) speed *= 0.15f else speed = t.speed + (speed - t.speed) * 0.2f
        t.crashed = true
        t.spinVel = -side * rand(1.5f, 3f)
        t.crashVx = -side * rand(2f, 4f)
        if (t.dir > 0) t.speed = t.speed + rel * 0.35f
        timeScale = 0.35f
        shake = 1.2f
        combo = 0
        val cx = (px + t.x) * 0.5f
        val cz = -(ps + (t.s - ps) * 0.5f)
        for (k in 0 until 70) {
            particles.spawn(cx, rand(0.3f, 1.2f), cz, rand(-8f, 8f), rand(1f, 8f), rand(-8f, 8f) - speed * 0.3f,
                rand(0.35f, 0.9f), 0.1f, 0.02f, 1f, 0.85f, 0.4f, 1f, true, -12f, 0.6f, 1f, 0.35f, 0.05f)
        }
        for (k in 0 until 26) {
            particles.spawn(cx, rand(0.3f, 1f), cz, rand(-5f, 5f), rand(2f, 6f), rand(-5f, 5f),
                rand(0.8f, 1.6f), 0.12f, 0.1f, 0.12f, 0.12f, 0.14f, 1f, false, -14f, 0.3f)
        }
        for (k in 0 until 18) {
            particles.spawn(cx, rand(0.5f, 1.2f), cz, rand(-6f, 6f), rand(2f, 5f), rand(-6f, 6f),
                rand(0.4f, 0.9f), 0.07f, 0.04f, 0.8f, 0.95f, 1f, 1f, true, -10f, 0.3f)
        }
        for (k in 0 until 14) {
            particles.spawn(cx + rand(-1f, 1f), rand(0.4f, 1.2f), cz + rand(-1f, 1f), rand(-1f, 1f), rand(0.8f, 2f), rand(-1f, 1f),
                rand(1.5f, 2.5f), 0.8f, 3.6f, 0.3f, 0.3f, 0.32f, 0.6f, false, 0.2f, 0.5f)
        }
        audio?.trigger(AudioEngine.SFX_CRASH)
        listener?.onCrash()
    }

    private fun scoring(dt: Float, step: Float) {
        val kmh = speedKmh
        if (kmh > topSpeedKmh) topSpeedKmh = kmh
        x2Active = mode == GameData.MODE_TWO_WAY && px < -0.3f && kmh >= 50f
        if (kmh >= 50f && mode != GameData.MODE_DRIFT && mode != GameData.MODE_TIME_TRIAL && mode != GameData.MODE_STREET) {
            score += step * (kmh / 50f) * (if (x2Active) 2.0 else 1.0) * 0.9
        }
        // near misses
        val spec = carSpec
        for (t in traffic) {
            if (!t.active || t.crashed) continue
            val rel = t.s - ps
            if (!t.nearChecked && t.lastRel > 0f && rel <= 0f) {
                t.nearChecked = true
                val gap = abs(px - t.x) - (spec.width + t.width) * 0.5f
                if (gap < NEAR_MISS_GAP && kmh > 70f) {
                    val oncoming = t.dir < 0
                    combo++
                    if (combo > bestCombo) bestCombo = combo
                    comboTimer = 3.5f
                    nearMisses++
                    val mult = min(5f, 1f + (combo - 1) * 0.5f)
                    val pts = (120f * mult * (if (oncoming) 2f else 1f) * (if (gap < 0.45f) 1.5f else 1f)).toInt()
                    if (mode == GameData.MODE_DRIFT) { if (driftChain > 0f) driftChain += pts * 0.5f } else score += pts
                    nitro = min(1f, nitro + 0.11f)
                    nearMissFlash = 1f
                    shake = max(shake, 0.12f)
                    if (mode == GameData.MODE_TIME_ATTACK) timeLeft += 1f
                    hudNearPts = pts
                    hudNearSeq++
                    audio?.trigger(AudioEngine.SFX_NEAR)
                    listener?.onNearMiss(pts, combo, oncoming)
                }
            }
            t.lastRel = rel
        }
        if (comboTimer > 0f) {
            comboTimer -= dt
            if (comboTimer <= 0f) combo = 0
        }
        if (mode == GameData.MODE_TIME_ATTACK) {
            timeLeft -= dt
            if (ps >= nextCheckpointS) {
                checkpointIndex++
                val bonus = max(12, 24 - checkpointIndex)
                timeLeft += bonus
                nextCheckpointS += CHECKPOINT_SPACING + checkpointIndex * 150f
                hudCheckSeq++
                audio?.trigger(AudioEngine.SFX_CHECKPOINT)
                listener?.onCheckpoint(bonus)
            }
            if (timeLeft <= 0f) {
                timeLeft = 0f
                crashedReason = REASON_TIME
                state = STATE_OVER
                listener?.onGameOver()
            }
        }
    }

    private fun rebase(step: Float) {
        ps -= step
        nextCoinS -= step
        nextCheckpointS -= step
        if (finishS > 0f) finishS -= step
        nextZoneS -= step
        lastRegionS -= step
        for (r in rivals) if (r.active) r.s -= step
        for (z in zones) if (z.active) { z.s0 -= step; z.s1 -= step }
        for (k in 0 until skidUsed) skidS[k] -= step
        skidLastS -= step
        for (t in traffic) if (t.active) t.s -= step
        for (c in coins) if (c.active) c.s -= step
        for (it in scenery) it.s -= step
        footS -= step; paxS -= step
        taxiPickS -= step; taxiDropS -= step; taxiNextS -= step
        particles.rebase(step)
    }

    private fun updateEngineAudio(throttle: Float) {
        val a = audio ?: return
        val spec = carSpec
        val maxV = GameData.topSpeedKmh(spec, lvlSpeed) / 3.6f
        val ratio = (speed / maxV).coerceIn(0f, 1.3f)
        // simple 6-gear model
        val gears = 6
        val g = min(gears - 1, (ratio * gears * 0.999f).toInt())
        val inGear = ratio * gears - g
        var rpm = 0.18f + inGear * 0.72f + g * 0.02f
        if (state == STATE_COUNTDOWN) rpm = 0.25f + 0.25f * (0.5f + 0.5f * sin(time * 9f))
        if (state == STATE_SHOWROOM || state == STATE_OVER) rpm = 0.16f
        if (GameData.isElectric(carId)) {
            // single-speed motor: pitch follows road speed, no gear steps, no backfire
            rpm = 0.12f + ratio * 0.9f
            if (state == STATE_COUNTDOWN) rpm = 0.12f + (if (input.gas) 0.1f else 0f)
        } else if (state == STATE_RACING) {
            if (g > prevGear && throttle > 0.5f) backfireT = max(backfireT, 0.14f)
            if (prevThrottle > 0.6f && throttle < 0.3f && rpm > 0.5f) backfireT = 0.7f
        }
        prevGear = g; prevThrottle = throttle
        a.engineRpm = rpm.coerceIn(0.1f, 1.05f)
        a.engineLoad = throttle
        a.engineOn = (state != STATE_OVER || speed > 1f) && !onFoot
        a.nitroOn = nitroActive
        a.hornOn = hornOn
        a.windLevel = (speed / 80f).coerceIn(0f, 1f)
        a.scrapeLevel = scraping
        a.carType = carId
        a.skidLevel = skid
    }

    private fun publish() {
        hudSpeed = speedKmh.toInt()
        hudScore = score.toInt()
        hudDistance = distance
        hudCoins = coinsCollected
        hudNitro = nitro
        hudCombo = combo
        hudComboTimer = comboTimer
        hudX2 = x2Active
        hudTime = timeLeft
        hudCountdown = countdown
        hudState = state
        hudNitroOn = nitroActive
        hudPosition = position
        var n = 0
        for (r in rivals) if (r.active && !r.cop) n++
        hudRacers = n
        hudToGo = if (finishS > 0f) max(0f, finishS - ps) else 0f
        hudRaceTime = raceTime
        hudDriftChain = driftChain.toInt()
        hudDriftMult = driftMult
        hudBust = bust
        hudEscape = escape
        hudHeat = heat
        hudEscapes = escapes
        hudNear = nearMisses
        hudEnv = env
        hudWeather = weather
        publishCity()
    }

    /** Coins awarded for the finished run. */
    fun coinsEarned(): Int {
        val base = coinsCollected * COIN_VALUE + taxiCoins
        return when (mode) {
            GameData.MODE_STREET -> base + (if (success) intArrayOf(0, 1500, 800, 400, 150)[position.coerceIn(1, 4)] else 0) + (distance / 20f).toInt()
            GameData.MODE_DRIFT -> base + (score / 22.0).toInt() + medal * 300
            GameData.MODE_TIME_TRIAL -> base + (if (success) 300 + medal * 350 else 0) + (distance / 25f).toInt()
            GameData.MODE_POLICE -> base + escapes * 600 + takedowns * 150 + (distance / 30f).toInt()
            GameData.MODE_CHALLENGE -> base + nearMisses * 30 + medal * 300
            GameData.MODE_FREE -> base + (distance / 40f).toInt()
            else -> base + (score / 55.0).toInt()
        }
    }

    companion object {
        /** per flame style: core end rgb, cone start rgb, cone end rgb, tail start rgb, tail end rgb */
        val FLAME_COLORS = arrayOf(
            floatArrayOf(0.6f, 0.8f, 1f, 0.5f, 0.72f, 1f, 0.85f, 0.35f, 1f, 0.55f, 0.25f, 0.95f, 0.2f, 0.05f, 0.4f),
            floatArrayOf(1f, 0.8f, 0.4f, 1f, 0.6f, 0.15f, 1f, 0.25f, 0.05f, 0.9f, 0.3f, 0.05f, 0.3f, 0.05f, 0f),
            floatArrayOf(0.7f, 1f, 0.6f, 0.35f, 1f, 0.4f, 0.1f, 0.7f, 0.2f, 0.2f, 0.8f, 0.3f, 0.02f, 0.25f, 0.05f),
            floatArrayOf(0.85f, 0.6f, 1f, 0.75f, 0.35f, 1f, 1f, 0.2f, 0.8f, 0.6f, 0.15f, 0.9f, 0.25f, 0.02f, 0.35f),
            floatArrayOf(1f, 0.6f, 0.5f, 1f, 0.25f, 0.2f, 0.8f, 0.05f, 0.05f, 0.9f, 0.1f, 0.1f, 0.3f, 0f, 0.02f)
        )
        const val STATE_ATTRACT = 0
        const val STATE_SHOWROOM = 1
        const val STATE_COUNTDOWN = 2
        const val MAX_SKID = 180
        const val STATE_RACING = 3
        const val STATE_CRASHED = 4
        const val STATE_OVER = 5

        const val REASON_CRASH = 0
        const val REASON_TIME = 1
        const val REASON_BUSTED = 2
        const val REASON_FINISH = 3

        const val REGION_LENGTH = 2100f
        val RIVAL_CARS = intArrayOf(GameData.CAR_SPORTS, GameData.CAR_MUSCLE, GameData.CAR_SUPER, GameData.CAR_SEDAN,
            GameData.CAR_CLASSIC, GameData.CAR_RACE)
        const val MAX_RACERS = 4
        const val MAX_ZONES = 6
        const val ZONE_TUNNEL = 1
        const val ZONE_BRIDGE = 2
        const val ZONE_GAS = 3
        const val ZONE_PARKING = 4
        const val ZONE_DEALER = 5

        const val EV_ESCAPE = 1
        const val EV_TAKEDOWN = 2
        const val EV_WAVE = 3
        const val EV_REGION = 4
        const val EV_GOAL = 5
        const val EV_EXIT = 6
        const val EV_ENTER = 7
        const val EV_OUCH = 8

        const val DOOR_NONE = 0
        const val DOOR_EXIT = 1
        const val DOOR_ENTER = 2
        const val FOOT_WALK = 2.5f
        const val FOOT_RUN = 6.4f
        const val FOOT_MAX_X = 26f
        const val FOOT_MAX_BACK = 85f
        const val FOOT_MAX_AHEAD = 160f

        const val TAXI_OFF = 0
        const val TAXI_IDLE = 1
        const val TAXI_WAITING = 2
        const val TAXI_BOARDING = 3
        const val TAXI_RIDING = 4
        const val TAXI_ALIGHT = 5
        const val TAXI_EV_NEW = 1
        const val TAXI_EV_ABOARD = 2
        const val TAXI_EV_PAID = 3
        const val TAXI_EV_MISSED = 4
        const val TAXI_EV_REROUTE = 5
        const val TAXI_EV_CANCEL = 6
        const val NUM_DESTS = 12
        private const val HALF_PI = 1.5707964f
        val PAX_SHIRTS = intArrayOf(0xFFE04848.toInt(), 0xFF3F7FE0.toInt(), 0xFF2FB36B.toInt(), 0xFFF2C14E.toInt(), 0xFF9B59D0.toInt(),
            0xFFF07F2E.toInt(), 0xFFECECEC.toInt(), 0xFF22252B.toInt(), 0xFF1BB5C9.toInt(), 0xFFE86AA6.toInt())
        val PAX_PANTS = intArrayOf(0xFF2B3A5C.toInt(), 0xFF1E1F24.toInt(), 0xFF5A4A3A.toInt(), 0xFF39506E.toInt(), 0xFF6B6F78.toInt())

        /** free-roam region sequence (one continuous journey) */
        val REGION_ORDER = intArrayOf(GameData.ENV_CITY, GameData.ENV_FOREST, GameData.ENV_MOUNTAIN, GameData.ENV_SNOW,
            GameData.ENV_COAST, GameData.ENV_INDUSTRIAL, GameData.ENV_DESERT)

        const val MAX_TRAFFIC = 36
        const val MAX_COINS = 30
        const val COIN_VALUE = 25
        const val NEAR_MISS_GAP = 1.05f
        const val TIME_ATTACK_START = 60f
        const val FIRST_CHECKPOINT = 1600f
        const val CHECKPOINT_SPACING = 1900f

        /** Floating-origin rebase. Multiple of the road (12 m), lamp (40 m) and ground (9 m) tiles. */
        const val REBASE_AT = 4200f
        const val REBASE_STEP = 3600f

        const val SCENERY_SPAN = 560f
        const val LAMP_SPACING = 40f
        const val LAMP_PHASE = 20f

        const val CAT_RAIL = 0
        const val CAT_LAMP = 1
        const val CAT_NEAR = 2
        const val CAT_FAR = 3
        const val CAT_SPECIAL = 4

        const val K_NONE = -1
        const val K_RAIL = 0
        const val K_LAMP = 1
        const val K_BUILDING = 2
        const val K_PINE = 3
        const val K_SNOWPINE = 4
        const val K_TREE = 5
        const val K_BUSH = 6
        const val K_CACTUS = 7
        const val K_ROCK = 8
        const val K_SIGN1 = 9
        const val K_SIGN2 = 10
        const val K_BILLBOARD = 11
        const val K_PALM = 12
        const val K_WAREHOUSE = 13
        const val K_CHIMNEY = 14
        const val K_TANK = 15
        /** coast: the sea is on this side of the road */
        const val SEA_SIDE = 1

        private val TMP_LANES = IntArray(2)
        private val TMP_CLEAR = FloatArray(4)
        private val intArrayOf_m1_p1 = intArrayOf(-1, 1)

        val TRAFFIC_COLORS = intArrayOf(
            0xFFE8E8EA.toInt(), 0xFF1E1F24.toInt(), 0xFF8E959E.toInt(), 0xFF9A1C1C.toInt(),
            0xFF1C3F8A.toInt(), 0xFF3B4C3A.toInt(), 0xFFB8B2A2.toInt(), 0xFF5A6B7D.toInt(),
            0xFF6B2D5C.toInt(), 0xFFC9C3B5.toInt(), 0xFF2F6F8F.toInt(), 0xFF7A4A22.toInt()
        )

        /** Exhaust positions per player car (local x, y, z), matching the procedural models. */
        val EXHAUST_LOCAL = arrayOf(
            floatArrayOf(-0.42f, 0.32f, 2.3f, 0.42f, 0.32f, 2.3f),
            floatArrayOf(-0.55f, 0.3f, 2.57f, 0.55f, 0.3f, 2.57f),
            floatArrayOf(0.55f, 0.4f, 2.5f),
            floatArrayOf(-0.12f, 0.36f, 2.4f, 0.12f, 0.36f, 2.4f),
            floatArrayOf(-0.5f, 0.3f, 2.45f),
            floatArrayOf(-0.54f, 0.31f, 2.5f, 0.54f, 0.31f, 2.5f),
            floatArrayOf(0.62f, 0.5f, 2.81f),
            floatArrayOf(-0.62f, 0.56f, 2.17f),
            floatArrayOf(-0.5f, 0.3f, 2.55f, 0.5f, 0.3f, 2.55f),
            floatArrayOf(-0.15f, 0.34f, 2.45f, 0.15f, 0.34f, 2.45f),
            floatArrayOf(-0.5f, 0.3f, 2.15f),
            // electric GT has no exhaust: the boost trail leaves the rear diffuser
            floatArrayOf(0f, 0.3f, 2.47f),
            floatArrayOf(0.5f, 0.3f, 2.45f),
            floatArrayOf(0.42f, 0.3f, 2.35f)
        )
    }
}
