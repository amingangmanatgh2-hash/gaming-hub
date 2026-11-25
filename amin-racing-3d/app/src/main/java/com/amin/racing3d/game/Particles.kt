package com.amin.racing3d.game

/**
 * Pre-allocated particle pool (structure of arrays — no allocations while playing).
 * Used for nitro flames, tyre smoke, sparks, crash debris, coin sparkles and wheel spray.
 */
class Particles(val capacity: Int) {
    val x = FloatArray(capacity)
    val y = FloatArray(capacity)
    val z = FloatArray(capacity)
    private val vx = FloatArray(capacity)
    private val vy = FloatArray(capacity)
    private val vz = FloatArray(capacity)
    val life = FloatArray(capacity)
    private val maxLife = FloatArray(capacity)
    private val size0 = FloatArray(capacity)
    private val size1 = FloatArray(capacity)
    val r = FloatArray(capacity)
    val g = FloatArray(capacity)
    val b = FloatArray(capacity)
    private val a0 = FloatArray(capacity)
    private val grav = FloatArray(capacity)
    private val drag = FloatArray(capacity)
    val additive = BooleanArray(capacity)
    private val r1 = FloatArray(capacity)
    private val g1 = FloatArray(capacity)
    private val b1 = FloatArray(capacity)

    /** Active particle budget, adjusted by the graphics quality. */
    var limit = capacity
    private var cursor = 0

    fun clear() {
        for (i in 0 until capacity) life[i] = 0f
    }

    fun spawn(
        px: Float, py: Float, pz: Float,
        pvx: Float, pvy: Float, pvz: Float,
        lifeTime: Float, s0: Float, s1: Float,
        cr: Float, cg: Float, cb: Float, alpha: Float,
        add: Boolean, gravity: Float = 0f, dragK: Float = 0f,
        er: Float = cr, eg: Float = cg, eb: Float = cb
    ) {
        val lim = limit.coerceIn(1, capacity)
        var i = cursor
        var tries = 0
        while (life[i] > 0f && tries < lim) {
            i++; if (i >= lim) i = 0
            tries++
        }
        cursor = i + 1; if (cursor >= lim) cursor = 0
        x[i] = px; y[i] = py; z[i] = pz
        vx[i] = pvx; vy[i] = pvy; vz[i] = pvz
        life[i] = lifeTime; maxLife[i] = lifeTime
        size0[i] = s0; size1[i] = s1
        r[i] = cr; g[i] = cg; b[i] = cb; a0[i] = alpha
        r1[i] = er; g1[i] = eg; b1[i] = eb
        additive[i] = add
        grav[i] = gravity; drag[i] = dragK
    }

    fun update(dt: Float) {
        val lim = limit.coerceIn(1, capacity)
        for (i in 0 until capacity) {
            if (life[i] <= 0f) continue
            if (i >= lim) { life[i] = 0f; continue }
            life[i] -= dt
            if (life[i] <= 0f) continue
            vy[i] += grav[i] * dt
            if (drag[i] > 0f) {
                val k = 1f - (drag[i] * dt).coerceAtMost(0.9f)
                vx[i] *= k; vy[i] *= k; vz[i] *= k
            }
            x[i] += vx[i] * dt
            y[i] += vy[i] * dt
            z[i] += vz[i] * dt
            if (y[i] < 0.02f && grav[i] < 0f) {
                y[i] = 0.02f
                vy[i] = -vy[i] * 0.35f
                vx[i] *= 0.6f; vz[i] *= 0.6f
            }
        }
    }

    /** Normalized age 0..1 */
    fun age(i: Int): Float = 1f - life[i] / maxLife[i]

    fun size(i: Int): Float {
        val t = age(i)
        return size0[i] + (size1[i] - size0[i]) * t
    }

    fun alpha(i: Int): Float {
        val t = age(i)
        return a0[i] * (1f - t) * (if (t < 0.1f) t * 10f else 1f)
    }

    fun colorR(i: Int) = r[i] + (r1[i] - r[i]) * age(i)
    fun colorG(i: Int) = g[i] + (g1[i] - g[i]) * age(i)
    fun colorB(i: Int) = b[i] + (b1[i] - b[i]) * age(i)

    fun rebase(dz: Float) {
        for (i in 0 until capacity) if (life[i] > 0f) z[i] += dz
    }
}
