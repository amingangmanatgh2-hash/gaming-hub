package com.amin.racing3d.input

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.view.Surface
import kotlin.math.abs
import kotlin.math.atan2
import kotlin.math.sqrt

/**
 * Converts device tilt into a steering value (-1..1) written to [InputState.tilt].
 * Uses the gravity sensor (fused with the gyroscope on most phones) and falls back to a
 * low-pass filtered accelerometer. Works in every screen rotation.
 */
class TiltController(context: Context, private val input: InputState) : SensorEventListener {

    private val sm = context.getSystemService(Context.SENSOR_SERVICE) as SensorManager?
    private val gravitySensor: Sensor? = sm?.getDefaultSensor(Sensor.TYPE_GRAVITY)
    private val accelSensor: Sensor? = sm?.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)
    private val sensor: Sensor? = gravitySensor ?: accelSensor
    private val filtered = sensor != null && sensor === accelSensor

    val available: Boolean get() = sensor != null

    /** Current display rotation, one of Surface.ROTATION_*. Updated by the activity. */
    @Volatile var displayRotation = Surface.ROTATION_0

    /** 0..1 – higher means less tilt is needed for full lock. */
    @Volatile var sensitivity = 0.55f

    /** Neutral angle in radians captured by [calibrate]. */
    @Volatile var offset = 0f

    /** Latest raw roll angle in radians (before calibration). */
    @Volatile var rawAngle = 0f
        private set

    private var gx = 0f
    private var gy = 0f
    private var gz = 9.81f
    private var listening = false
    private var smooth = 0f

    fun start() {
        if (listening || sensor == null || sm == null) return
        listening = sm.registerListener(this, sensor, SensorManager.SENSOR_DELAY_GAME)
    }

    fun stop() {
        if (!listening) return
        sm?.unregisterListener(this)
        listening = false
        input.tilt = 0f
        smooth = 0f
    }

    /** Uses the current holding angle as the new neutral position and returns it. */
    fun calibrate(): Float {
        offset = rawAngle
        return offset
    }

    override fun onSensorChanged(event: SensorEvent) {
        val v = event.values
        if (filtered) {
            val k = 0.18f
            gx += (v[0] - gx) * k
            gy += (v[1] - gy) * k
            gz += (v[2] - gz) * k
        } else {
            gx = v[0]; gy = v[1]; gz = v[2]
        }
        // device axes -> screen axes
        val sx: Float
        val sy: Float
        when (displayRotation) {
            Surface.ROTATION_90 -> { sx = -gy; sy = gx }
            Surface.ROTATION_180 -> { sx = -gx; sy = -gy }
            Surface.ROTATION_270 -> { sx = gy; sy = -gx }
            else -> { sx = gx; sy = gy }
        }
        // roll in the screen plane, independent of how far the phone is pitched back
        val angle = atan2(-sx, sqrt(sy * sy + gz * gz))
        rawAngle = angle
        val range = MAX_RANGE + (MIN_RANGE - MAX_RANGE) * sensitivity.coerceIn(0f, 1f)
        var t = (angle - offset) / range
        val dead = 0.035f
        t = if (abs(t) < dead) 0f else (t - dead * kotlin.math.sign(t)) / (1f - dead)
        t = t.coerceIn(-1f, 1f)
        // gentle response curve: precise around the centre, full lock at the edges
        t = t * (0.55f + 0.45f * abs(t))
        smooth += (t - smooth) * 0.5f
        input.tilt = smooth
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}

    companion object {
        private const val MAX_RANGE = 0.70f   // ~40° for full lock at minimum sensitivity
        private const val MIN_RANGE = 0.20f   // ~11° for full lock at maximum sensitivity
    }
}
