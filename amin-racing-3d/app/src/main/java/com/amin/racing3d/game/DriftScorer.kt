package com.amin.racing3d.game

import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * v2.1 drift scoring. Pure logic (no Android / GL), unit-tested by `tools/drift-sim`.
 *
 * Points are earned only while the car is *genuinely* drifting:
 *   body slip angle ≥ [MIN_ANGLE_DEG], speed ≥ [MIN_KMH], no wall contact, not crashed.
 *
 * Rate (points per second, before the multiplier):
 *   rate = 500 × angleFactor × speedFactor × durationFactor
 *   angleFactor    = 1 … 2.4   (9° → 1.0, 35° → 2.0, 45°+ → 2.4)
 *   speedFactor    = 1 … 2.5   (30 km/h → 1.0, 130 km/h → 2.0, 180+ km/h → 2.5)
 *   durationFactor = 1 … 1.6   (+10 % per second of uninterrupted drift, max 6 s)
 * so every valid drift second is worth at least 500 points.
 *
 * Multiplier (×1.0 … ×6.0), applied when the drift is banked:
 *   +0.25 for every 2 s of continuous drift (1.5 s while holding ≥ 25°)
 *   +0.25 for a clean direction change (transition) within the 1.25 s link window, if the previous
 *         segment lasted ≥ 0.8 s (wiggling the wheel does not farm links)
 *   +0.25 for a near miss while drifting (plus 300 points)
 *   loses progress while the car is straight, resets to ×1 after banking
 * Ending:
 *   straighten for longer than the link window  → the chain is BANKED: raw × multiplier × quality bonus
 *   wall scrape, crash or traffic hit           → the chain is LOST (points and multiplier)
 */
class DriftScorer {
    // ---- live chain state
    var active = false; private set
    /** points of the current chain before the multiplier */
    var chainRaw = 0f; private set
    var mult = 1f; private set
    /** progress (0..1) towards the next +0.5 multiplier step */
    var multProgress = 0f; private set
    /** valid drift seconds in this chain */
    var chainTime = 0f; private set
    /** current uninterrupted drift segment, seconds */
    var streak = 0f; private set
    var liveRate = 0f; private set
    var angleDeg = 0f; private set
    var kmh = 0f; private set
    var links = 0; private set
    var nearMisses = 0; private set
    /** link window left after the car straightened (0 = currently drifting) */
    var graceLeft = 0f; private set
    val drifting: Boolean get() = active && graceLeft <= 0f

    private var angleTime = 0f
    private var speedTime = 0f
    private var lastDir = 0

    // ---- results (read by World / HUD)
    var lastRaw = 0; private set
    var lastMult = 1f; private set
    var lastQuality = 0; private set
    var lastBonusPct = 0; private set
    var lastTotal = 0; private set
    var lastTime = 0f; private set
    var lastLost = 0; private set
    var bankSeq = 0; private set
    var lostSeq = 0; private set
    var multUpSeq = 0; private set
    var linkSeq = 0; private set

    // ---- per-run records
    var runBest = 0; private set
    var runLongest = 0f; private set
    var runMaxMult = 1f; private set
    var runTotal = 0L; private set
    var runBanked = 0; private set
    var runLegendary = 0; private set

    fun resetRun() {
        clearChain()
        mult = 1f
        runBest = 0; runLongest = 0f; runMaxMult = 1f; runTotal = 0L; runBanked = 0; runLegendary = 0
    }

    /**
     * @param angleRad body slip angle (signed, + = tail out to the left)
     * @param speedMs  forward speed
     * @param invalid  wall contact / crashed / reversing – ends the chain as LOST if one is running
     * @return points banked during this step (0 most of the time)
     */
    fun update(dt: Float, angleRad: Float, speedMs: Float, invalid: Boolean): Int {
        angleDeg = Math.toDegrees(abs(angleRad).toDouble()).toFloat()
        kmh = speedMs * 3.6f
        if (invalid) {
            if (active) lose()
            liveRate = 0f
            return 0
        }
        val valid = angleDeg >= MIN_ANGLE_DEG && kmh >= MIN_KMH
        if (valid) {
            val dir = if (angleRad >= 0f) 1 else -1
            if (!active) {
                active = true; chainRaw = 0f; chainTime = 0f; links = 0; nearMisses = 0
                angleTime = 0f; speedTime = 0f; multProgress = 0f; mult = 1f
            } else if (graceLeft > 0f || (lastDir != 0 && dir != lastDir)) {
                // re-entered the drift inside the link window, or flicked straight into the other direction
                if (lastDir != 0 && dir != lastDir && streak >= MIN_LINK_SEGMENT) {
                    links++
                    addMult(LINK_BONUS)
                    linkSeq++
                }
                streak = 0f
            }
            lastDir = dir
            graceLeft = 0f
            streak += dt
            chainTime += dt
            angleTime += angleDeg * dt
            speedTime += kmh * dt
            liveRate = BASE_RATE * angleFactor(angleDeg) * speedFactor(kmh) * durationFactor(streak)
            chainRaw += liveRate * dt
            val step = if (angleDeg >= 25f) 1.5f else 2f
            multProgress += dt / step
            if (multProgress >= 0.9999f) {
                multProgress = max(0f, multProgress - 1f)
                addMult(STEP_BONUS)
                multUpSeq++
            }
            return 0
        }
        liveRate = 0f
        if (!active) return 0
        if (graceLeft <= 0f) graceLeft = LINK_WINDOW
        graceLeft -= dt
        multProgress = max(0f, multProgress - dt * 0.4f)
        if (graceLeft <= 0f) return bank()
        return 0
    }

    /** near miss with traffic during a drift: flat points and multiplier */
    fun nearMiss(): Boolean {
        if (!active) return false
        nearMisses++
        chainRaw += NEAR_MISS_POINTS
        addMult(0.25f)
        return true
    }

    /** collision with traffic or a wall: the chain is lost */
    fun hit() { if (active) lose() }

    /** end of the run / leaving drift mode: bank what is running */
    fun forceBank(): Int = if (active) bank() else 0

    private fun addMult(v: Float) {
        mult = min(MAX_MULT, mult + v)
        if (mult > runMaxMult) runMaxMult = mult
    }

    private fun bank(): Int {
        if (chainTime < MIN_BANK_TIME) { clearChain(); mult = 1f; return 0 }
        val avgAngle = angleTime / max(chainTime, 1e-3f)
        val avgKmh = speedTime / max(chainTime, 1e-3f)
        val q = quality(avgAngle, avgKmh, chainTime, links, nearMisses)
        val bonus = QUALITY_BONUS[q]
        val total = (chainRaw * mult * (1f + bonus / 100f)).roundToInt()
        lastRaw = chainRaw.roundToInt(); lastMult = mult; lastQuality = q; lastBonusPct = bonus; lastTotal = total; lastTime = chainTime
        bankSeq++
        runTotal += total
        runBanked++
        if (total > runBest) runBest = total
        if (chainTime > runLongest) runLongest = chainTime
        if (q == QUALITY_BONUS.size - 1) runLegendary++
        clearChain()
        mult = 1f
        return total
    }

    private fun lose() {
        lastLost = (chainRaw * mult).roundToInt()
        lostSeq++
        clearChain()
        mult = 1f
    }

    private fun clearChain() {
        active = false; chainRaw = 0f; chainTime = 0f; streak = 0f; links = 0; nearMisses = 0
        graceLeft = 0f; multProgress = 0f; liveRate = 0f; lastDir = 0; angleTime = 0f; speedTime = 0f
    }

    companion object {
        const val BASE_RATE = 500f
        const val MIN_ANGLE_DEG = 9f
        const val MIN_KMH = 30f
        const val LINK_WINDOW = 1.25f
        const val LINK_BONUS = 0.25f
        const val STEP_BONUS = 0.25f
        const val MIN_LINK_SEGMENT = 0.8f
        const val MAX_MULT = 6f
        const val NEAR_MISS_POINTS = 300f
        const val MIN_BANK_TIME = 0.5f
        /** quality rating bonus in percent: Good, Great, Awesome, Insane, Legendary */
        val QUALITY_BONUS = intArrayOf(0, 10, 20, 35, 50)

        fun angleFactor(deg: Float) = 1f + ((deg - MIN_ANGLE_DEG) / 26f).coerceIn(0f, 1.4f)
        fun speedFactor(kmh: Float) = 1f + ((kmh - MIN_KMH) / 100f).coerceIn(0f, 1.5f)
        fun durationFactor(t: Float) = 1f + min(t, 6f) * 0.1f

        /** 0 Good … 4 Legendary from average angle, average speed, duration, transitions and near misses */
        fun quality(avgAngle: Float, avgKmh: Float, time: Float, links: Int, near: Int): Int {
            val s = min(avgAngle / 35f, 1.2f) * 0.3f + min(avgKmh / 120f, 1.2f) * 0.25f +
                min(time / 8f, 1f) * 0.3f + min((links + near) / 3f, 1f) * 0.15f
            return when {
                s >= 0.95f -> 4
                s >= 0.8f -> 3
                s >= 0.65f -> 2
                s >= 0.45f -> 1
                else -> 0
            }
        }
    }
}
