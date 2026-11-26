package com.amin.racing3d.input

/** Thread-safe input snapshot written by the UI thread / sensors and read by the game thread. */
class InputState {
    @Volatile var left = false
    @Volatile var right = false
    @Volatile var gas = false
    @Volatile var brake = false
    @Volatile var nitro = false
    @Volatile var horn = false
    /** Tilt steering already scaled by sensitivity and calibrated, -1..1 */
    @Volatile var tilt = 0f
    @Volatile var useTilt = false
    @Volatile var autoGas = false
    /** one-shot: exit / enter the car (consumed by the game thread) */
    @Volatile var doorRequest = false

    fun steer(): Float {
        if (useTilt) return tilt
        var s = 0f
        if (right) s += 1f
        if (left) s -= 1f
        return s
    }

    fun reset() {
        left = false; right = false; gas = false; brake = false; nitro = false; horn = false
    }
}
