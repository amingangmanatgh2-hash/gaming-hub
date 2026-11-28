package com.amin.racing3d.input

import kotlin.math.abs
import kotlin.math.sign

/** Thread-safe input snapshot written by the UI thread / sensors and read by the game thread. */
class InputState {
    @Volatile var left = false
    @Volatile var right = false
    @Volatile var gas = false
    @Volatile var brake = false
    @Volatile var nitro = false
    @Volatile var horn = false
    /** dedicated handbrake button (v2.1): locks the rear wheels – starts drifts, tight turns */
    @Volatile var handbrake = false
    /** Tilt steering already scaled by sensitivity and calibrated, -1..1 */
    @Volatile var tilt = 0f
    @Volatile var useTilt = false
    /** virtual steering wheel (v2.1): wheel angle / max angle, -1..1, unshaped */
    @Volatile var wheel = 0f
    @Volatile var useWheel = false
    @Volatile var autoGas = false
    /** one-shot: exit / enter the car (consumed by the game thread) */
    @Volatile var doorRequest = false

    // ---- v2.1 tuning, written from the settings (all 0..1)
    @Volatile var steerSens = 0.5f
    @Volatile var gasSens = 0.6f
    @Volatile var brakeSens = 0.6f
    @Volatile var deadZone = 0.15f
    @Volatile var smoothing = 0.35f
    /** 0 linear, 1 progressive, 2 aggressive */
    @Volatile var curve = 1

    /** analog steering source (tilt or wheel) */
    val analog: Boolean get() = useTilt || useWheel

    /** Steering request -1..1 after dead zone, response curve and steering-lock sensitivity. */
    fun steer(): Float {
        val raw = when {
            useWheel -> shape(wheel)
            useTilt -> tilt   // TiltController already applies its own dead zone + curve
            else -> {
                var s = 0f
                if (right) s += 1f
                if (left) s -= 1f
                s
            }
        }
        return (raw * lock()).coerceIn(-1f, 1f)
    }

    /** maximum steering lock: 75 % .. 125 % of the car's handling (default = 100 %) */
    fun lock(): Float = 0.75f + 0.5f * steerSens

    /** How fast the front wheels follow the request (1/s). Buttons ramp in, analog follows closely. */
    fun steerRate(): Float =
        if (analog) 34f - 26f * smoothing          // 8 .. 34, default ≈ 25
        else 5f + 13f * steerSens                  // 5 .. 18, default ≈ 11.5 (v2.0: 11)

    /** throttle pedal travel speed (1/s) */
    fun gasRate(): Float = 2f + 16f * gasSens

    /** brake bite speed (1/s) and maximum force factor */
    fun brakeRate(): Float = 3f + 20f * brakeSens
    fun brakeForce(): Float = 0.7f + 0.5f * brakeSens

    /** dead zone + response curve for an analog value -1..1 */
    fun shape(v: Float): Float = shapeCurve(v, deadZone * 0.2f, curve)

    fun reset() {
        left = false; right = false; gas = false; brake = false; nitro = false; horn = false; handbrake = false
        wheel = 0f
    }

    companion object {
        fun shapeCurve(v: Float, dead: Float, curve: Int): Float {
            val a = abs(v)
            if (a <= dead) return 0f
            val t = ((a - dead) / (1f - dead)).coerceIn(0f, 1f)
            val c = when (curve) {
                0 -> t
                2 -> 1f - (1f - t) * (1f - t)              // quick response around the centre
                else -> t * (0.3f + 0.7f * t) * 0.6f + t * 0.4f  // progressive: fine control near the centre
            }
            return sign(v) * c
        }
    }
}
