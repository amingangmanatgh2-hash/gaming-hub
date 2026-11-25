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
        mode = GameData.MODE_ENDLESS
        env = GameData.ENV_CITY
        todSetting = GameData.TOD_SUNSET
        resetRun()
        state = STATE_ATTRACT
        speed = 34f
    }

    fun startShowroom() {
        state = STATE_SHOWROOM
        paused = false
    }

    fun startRace(newMode: Int, newEnv: Int, newTod: Int) {
        mode = newMode
        env = newEnv
        todSetting = newTod
        resetRun()
        state = STATE_COUNTDOWN
        countdown = 2.999f
        speed = 0f
        audio?.trigger(AudioEngine.SFX_COUNT)
    }

    fun restart() = startRace(mode, env, todSetting)

    fun backToAttract() = startAttract()

    private fun resetRun() {
        envVersion++
        paused = false
        px = GameData.LANE_X[2]; ps = 0f; vx = 0f; yaw = 0f; roll = 0f; rollVel = 0f
        pitch = 0f; pitchVel = 0f; suspY = 0f; suspVel = 0f; steerSmooth = 0f
        nitro = 1f; nitroActive = false; braking = false
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
                it.s = -30f + offset + i * spacing
                it.seed = seed++
                generate(it)
                scenery.add(it)
            }
        }
        row(CAT_RAIL, 20f, -1, 0f)
        row(CAT_RAIL, 20f, 1, 0f)
        row(CAT_LAMP, LAMP_SPACING, -1, LAMP_PHASE)
        row(CAT_LAMP, LAMP_SPACING, 1, LAMP_PHASE)
        val near = if (env == GameData.ENV_CITY) 21f else 8.5f
        val far = if (env == GameData.ENV_CITY) 30f else 13f
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
        val behind = ps - 35f
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
        val base = if (state == STATE_ATTRACT) 14 else 13
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
        if (crashed) { steerIn = 0f; gas = false; brake = true; wantNitro = false }
        val hornPressed = horn && !hornPrev
        hornPrev = horn
        hornOn = horn && !crashed

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
        if (crashed) {
            speed = max(0f, speed - 16f * dt)
        } else if (brake) {
            speed = max(0f, speed - GameData.brake(spec, lvlBrakes) * dt)
        } else if (gas || nitroActive) {
            val f = 1f - (speed / maxV) * (speed / maxV)
            val acc = spec.accel * (if (nitroActive) 2.0f else 1f)
            if (speed < maxV) speed += acc * max(f, 0.06f) * dt
            else speed -= (speed - maxV) * 1.2f * dt
        } else {
            speed = max(0f, speed - (1.4f + speed * 0.018f) * dt)
        }
        braking = brake && speed > 0.5f

        // ---------------- steering / lateral physics
        steerSmooth += (steerIn - steerSmooth) * min(1f, 9f * dt)
        val handling = GameData.handling(spec, lvlHandling)
        val speedFactor = (0.35f + speed / 22f).coerceAtMost(1f)
        val targetVx = steerSmooth * handling * speedFactor
        val grip = GameData.envs[env].grip
        vx += (targetVx - vx) * min(1f, grip * 6.5f * dt)
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
        yaw = if (crashed) crashSpin else -atan2(vx, max(speed, 3f))
        if (crashed) {
            crashSpin += crashSpinVel * dt
            crashSpinVel *= 1f - min(1f, 1.2f * dt)
        }
        val latAcc = (vx - prevVx) / max(dt, 1e-4f)
        val lonAcc = (speed - prevSpeed) / max(dt, 1e-4f)
        prevVx = vx; prevSpeed = speed
        val rollTarget = (latAcc * 0.011f).coerceIn(-0.085f, 0.085f) + (vx * 0.004f)
        rollVel += ((rollTarget - roll) * 70f - rollVel * 9f) * dt
        roll += rollVel * dt
        val pitchTarget = (lonAcc * 0.0055f).coerceIn(-0.05f, 0.04f)
        pitchVel += ((pitchTarget - pitch) * 60f - pitchVel * 8f) * dt
        pitch += pitchVel * dt
        if (speed > 3f && rand() < dt * (1.5f + speed * 0.05f)) suspVel += rand(-0.06f, 0.06f) * min(1f, speed / 30f)
        suspVel += (-suspY * 140f - suspVel * 9f) * dt
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
        updateCoins(dt)
        updateScenery()
        particles.update(dt)

        if (state == STATE_RACING) {
            checkCollisions()
            scoring(dt, step)
        }
        if (state == STATE_ATTRACT) {
            // the demo car never ends: if anything goes wrong, just clear the area
            checkCollisions()
        }
        if (state == STATE_CRASHED) {
            crashTimer += rawDt
            if (crashTimer > 0.9f) timeScale = min(1f, timeScale + rawDt * 0.8f)
            if (crashTimer > 2.3f) {
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

    private fun spawnCarEffects(dt: Float, brake: Boolean) {
        val spec = carSpec
        val ca = cos(yaw); val sa = sin(yaw)
        val baseZ = -ps
        if (nitroActive) {
            val ex = EXHAUST_LOCAL[carId]
            var i = 0
            while (i < ex.size) {
                val lx = ex[i]; val ly = ex[i + 1]; val lz = ex[i + 2]
                val wx = px + lx * ca + lz * sa
                val wz = baseZ - lx * sa + lz * ca
                for (k in 0 until 2) {
                    particles.spawn(wx + rand(-0.04f, 0.04f), ly + suspY + rand(-0.03f, 0.03f), wz,
                        rand(-0.4f, 0.4f), rand(-0.1f, 0.3f), -speed + rand(5f, 9f),
                        rand(0.1f, 0.18f), 0.32f, 0.08f, 0.55f, 0.75f, 1f, 1f, true, 0f, 0f, 1f, 0.45f, 0.1f)
                }
                i += 3
            }
        }
        if (brake && speed > 22f && rand() < dt * 30f) {
            for (k2 in 0..1) {
                val side = k2 * 2 - 1
                particles.spawn(px + side * spec.width * 0.42f, 0.15f, baseZ + spec.length * 0.32f,
                    rand(-0.3f, 0.3f), rand(0.3f, 0.8f), -speed * 0.15f, rand(0.6f, 1.0f), 0.35f, 1.6f,
                    0.75f, 0.75f, 0.78f, 0.35f, false, 0.2f, 0.8f)
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
        if (kmh >= 50f) {
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
                    score += pts
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
        for (t in traffic) if (t.active) t.s -= step
        for (c in coins) if (c.active) c.s -= step
        for (it in scenery) it.s -= step
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
        a.engineRpm = rpm.coerceIn(0.1f, 1.05f)
        a.engineLoad = throttle
        a.engineOn = state != STATE_OVER || speed > 1f
        a.nitroOn = nitroActive
        a.hornOn = hornOn
        a.windLevel = (speed / 80f).coerceIn(0f, 1f)
        a.scrapeLevel = scraping
        a.carType = carId
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
    }

    /** Coins awarded for the finished run. */
    fun coinsEarned(): Int = coinsCollected * COIN_VALUE + (score / 55.0).toInt()

    companion object {
        const val STATE_ATTRACT = 0
        const val STATE_SHOWROOM = 1
        const val STATE_COUNTDOWN = 2
        const val STATE_RACING = 3
        const val STATE_CRASHED = 4
        const val STATE_OVER = 5

        const val REASON_CRASH = 0
        const val REASON_TIME = 1

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
            floatArrayOf(-0.12f, 0.36f, 2.4f, 0.12f, 0.36f, 2.4f)
        )
    }
}
