package com.amin.racing3d.input

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Handler
import android.os.HandlerThread
import android.os.Process
import android.view.Surface
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.atan2
import kotlin.math.sign
import kotlin.math.sqrt

/**
 * Converts device tilt into a steering value (-1..1) written to [InputState.tilt].
 *
 * Low latency path:
 *  1. Sensor choice: GAME_ROTATION_VECTOR (gyroscope-fused, reacts within a few ms, no magnetometer
 *     jumps) → GRAVITY → raw ACCELEROMETER. On many phones the GRAVITY sensor is itself a slow
 *     low-pass filter (100–250 ms lag), which is why the rotation vector is preferred.
 *  2. Events are delivered at ~100 Hz on a dedicated high-priority thread, so UI work on the main
 *     thread can never delay steering.
 *  3. A One-Euro filter replaces the fixed smoothing: almost no smoothing while the phone is being
 *     turned (instant response), more smoothing while it is held still (no jitter).
 */
class TiltController(context: Context, private val input: InputState) : SensorEventListener {

    private val sm = context.getSystemService(Context.SENSOR_SERVICE) as SensorManager?
    private val rotSensor: Sensor? = sm?.getDefaultSensor(Sensor.TYPE_GAME_ROTATION_VECTOR)
    private val gravitySensor: Sensor? = sm?.getDefaultSensor(Sensor.TYPE_GRAVITY)
    private val accelSensor: Sensor? = sm?.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)
    private val sensor: Sensor? = rotSensor ?: gravitySensor ?: accelSensor
    private val source = when {
        sensor == null -> SRC_NONE
        sensor === rotSensor -> SRC_ROTATION
        sensor === gravitySensor -> SRC_GRAVITY
        else -> SRC_ACCEL
    }

    val available: Boolean get() = sensor != null

    /** Short description of the sensor in use (diagnostics / settings). */
    val sensorName: String get() = when (source) {
        SRC_ROTATION -> "gyro"
        SRC_GRAVITY -> "gravity"
        SRC_ACCEL -> "accelerometer"
        else -> "none"
    }

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
    private val rot = FloatArray(9)
    private var thread: HandlerThread? = null
    private var lastNs = 0L
    private val filter = OneEuro(minCutoff = if (source == SRC_ACCEL) 1.6f else 2.6f, beta = 9f, dCutoff = 1.2f)

    fun start() {
        if (listening || sensor == null || sm == null) return
        val t = HandlerThread("tilt", Process.THREAD_PRIORITY_URGENT_DISPLAY)
        t.start()
        thread = t
        lastNs = 0L
        filter.reset()
        listening = sm.registerListener(this, sensor, SAMPLE_US, Handler(t.looper))
        if (!listening) { t.quitSafely(); thread = null }
    }

    fun stop() {
        if (!listening) return
        sm?.unregisterListener(this)
        thread?.quitSafely()
        thread = null
        listening = false
        input.tilt = 0f
    }

    /** Uses the current holding angle as the new neutral position and returns it. */
    fun calibrate(): Float {
        offset = rawAngle
        filter.reset()
        return offset
    }

    override fun onSensorChanged(event: SensorEvent) {
        val v = event.values
        val dt = if (lastNs == 0L) 0.01f else ((event.timestamp - lastNs) * 1e-9f).coerceIn(0.001f, 0.1f)
        lastNs = event.timestamp
        when (source) {
            SRC_ROTATION -> {
                // world "up" expressed in device coordinates = third row of the rotation matrix
                SensorManager.getRotationMatrixFromVector(rot, v)
                gx = rot[6] * 9.81f; gy = rot[7] * 9.81f; gz = rot[8] * 9.81f
            }
            SRC_GRAVITY -> { gx = v[0]; gy = v[1]; gz = v[2] }
            else -> {
                // raw accelerometer: short time-based low-pass (≈35 ms) against vibration
                val k = dt / (0.035f + dt)
                gx += (v[0] - gx) * k
                gy += (v[1] - gy) * k
                gz += (v[2] - gz) * k
            }
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
        input.tilt = mapAngle(filter.filter(angle - offset, dt))
    }

    /** Calibrated angle (rad) → steering -1..1. */
    private fun mapAngle(a: Float): Float {
        val range = MAX_RANGE + (MIN_RANGE - MAX_RANGE) * sensitivity.coerceIn(0f, 1f)
        var t = a / range
        val dead = 0.025f
        t = if (abs(t) < dead) 0f else (t - dead * sign(t)) / (1f - dead)
        t = t.coerceIn(-1f, 1f)
        // nearly linear: small tilts already steer (the old curve made the centre feel dead)
        return t * (0.78f + 0.22f * abs(t))
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}

    /** One-Euro filter (Casiez et al. 2012): adaptive low-pass, low lag during fast motion. */
    private class OneEuro(val minCutoff: Float, val beta: Float, val dCutoff: Float) {
        private var x = 0f
        private var dx = 0f
        private var init = false
        fun reset() { init = false }
        private fun alpha(cutoff: Float, dt: Float): Float {
            val tau = 1f / (2f * PI.toFloat() * cutoff)
            return 1f / (1f + tau / dt)
        }
        fun filter(v: Float, dt: Float): Float {
            if (!init) { x = v; dx = 0f; init = true; return v }
            val d = (v - x) / dt
            dx += (d - dx) * alpha(dCutoff, dt)
            val cutoff = minCutoff + beta * abs(dx)
            x += (v - x) * alpha(cutoff, dt)
            return x
        }
    }

    companion object {
        private const val SRC_NONE = 0
        private const val SRC_ROTATION = 1
        private const val SRC_GRAVITY = 2
        private const val SRC_ACCEL = 3
        /** 100 Hz (SENSOR_DELAY_GAME is only 50 Hz); below the 200 Hz permission limit */
        private const val SAMPLE_US = 10_000
        private const val MAX_RANGE = 0.62f   // ~36° for full lock at minimum sensitivity
        private const val MIN_RANGE = 0.17f   // ~10° for full lock at maximum sensitivity
    }
}
