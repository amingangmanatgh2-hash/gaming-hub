package com.amin.racing3d.render

import kotlin.math.cos
import kotlin.math.sin

/** Geometry plus metadata needed to animate and decorate a vehicle. */
class VehicleModel(
    val mesh: Mesh,
    val length: Float,
    val width: Float,
    val wheelX: Float,
    val wheelZ: FloatArray,
    val wheelR: Float,
    /** local (x, y, z) of headlight glows */
    val headLights: FloatArray,
    /** local (x, y, z) of tail light glows */
    val tailLights: FloatArray,
    /** local (x, y, z) of exhaust tips (nitro flames) */
    val exhausts: FloatArray
) {
    /** Window glass (translucent pass), shares the vertex buffer of [mesh]. */
    val glass: Mesh? = MeshBuilder.takeGlass()
    /** spoiler mount: top of the rear deck (measured from the painted body) */
    val deckY: Float = MeshBuilder.lastDeckY
    val deckZ: Float = MeshBuilder.lastDeckZ
    /** player cars get painted performance brake calipers */
    var sporty = false
}

/**
 * Builds every 3D model of the game procedurally: player cars, traffic, wheels and scenery.
 * All geometry is original and generated at startup — no external model files.
 */
object Models {
    private const val WHITE = 0xFFFFFFFF.toInt()
    private const val GLASS = 0xFF0C1420.toInt()
    private const val DARK = 0xFF16181D.toInt()
    private const val TRIM = 0xFF2A2D33.toInt()
    private const val CHROME = 0xFFCDD3DC.toInt()
    private const val HEAD = 0xFFFFF4DA.toInt()
    private const val TAIL = 0xFFFF1E1E.toInt()
    private const val AMBER = 0xFFFFA012.toInt()

    private fun paint(b: MeshBuilder, spec: Float = 0.7f) = b.color(WHITE, 1f, 0, spec)

    // --------------------------------------------------------------------------------------
    // Shared car details
    // --------------------------------------------------------------------------------------
    private fun archesAndUnder(b: MeshBuilder, w: Float, l: Float, zs: FloatArray, r: Float, yUnder: Float) {
        val hw = w / 2
        b.color(0xFF050608.toInt(), 0f, 0, 0f)
        for (z in zs) {
            b.box(-(hw + 0.004f), r + 0.05f, z, 0.008f, r * 1.25f, r * 2.45f)
            b.box(hw + 0.004f, r + 0.05f, z, 0.008f, r * 1.25f, r * 2.45f)
        }
        b.color(DARK, 0f, 0, 0.05f)
        b.box(0f, yUnder, 0f, w - 0.3f, 0.06f, l - 0.6f)
    }

    private fun blinkers(b: MeshBuilder, hw: Float, yF: Float, zF: Float, yR: Float, zR: Float) {
        b.color(AMBER, 0f, 3, 0.6f)
        b.box(-(hw - 0.07f), yF, zF, 0.12f, 0.05f, 0.05f)
        b.box(-(hw - 0.07f), yR, zR, 0.1f, 0.06f, 0.04f)
        b.color(AMBER, 0f, 4, 0.6f)
        b.box(hw - 0.07f, yF, zF, 0.12f, 0.05f, 0.05f)
        b.box(hw - 0.07f, yR, zR, 0.1f, 0.06f, 0.04f)
    }

    // --------------------------------------------------------------------------------------
    // Cabin interior (seen through the translucent glass) and door handles
    // --------------------------------------------------------------------------------------
    /**
     * Dashboard, instrument binnacle, steering wheel, seats with headrests (rear bench in long
     * cabins) and door handles. Parameters come from the glasshouse: lower edge (z0..z1 at
     * height ya) and roof edge (zt0..zt1 at height yb). Left-hand drive (driver on -X).
     */
    private fun interior(b: MeshBuilder, hwIn: Float, z0: Float, z1: Float, ya: Float, zt0: Float, zt1: Float, yb: Float, hwBody: Float) {
        val hc = yb - ya
        val iw = hwIn * 2f - 0.12f
        // dashboard + binnacle + centre screen
        b.color(0xFF17191E.toInt(), 0f, 0, 0.15f)
        val zDash = z0 + (zt0 - z0) * 0.55f
        b.box(0f, ya + hc * 0.06f, zDash, iw, hc * 0.2f, (zt0 - z0) * 0.7f)
        b.box(-hwIn * 0.45f, ya + hc * 0.2f, zDash + 0.06f, 0.36f, hc * 0.12f, 0.16f)
        b.color(0xFF0E3B4C.toInt(), 0f, 5, 0.6f)
        b.box(-hwIn * 0.45f, ya + hc * 0.19f, zDash + 0.145f, 0.3f, hc * 0.08f, 0.01f)
        b.box(0f, ya + hc * 0.16f, zDash + 0.12f, 0.22f, hc * 0.13f, 0.01f)
        // steering wheel: rim of 12 segments facing the driver, hub and column
        b.color(0xFF101114.toInt(), 0f, 0, 0.35f)
        val swx = -hwIn * 0.45f; val swy = ya + hc * 0.2f; val swz = zDash + 0.32f; val swr = minOf(0.18f, hc * 0.42f)
        for (k in 0 until 12) {
            val a = k * (Math.PI.toFloat() / 6f)
            b.box(swx + cos(a) * swr, swy + sin(a) * swr, swz, 0.075f, 0.075f, 0.035f)
        }
        b.box(swx, swy, swz + 0.01f, 0.1f, 0.1f, 0.04f)
        b.box(swx, swy - swr * 0.5f, swz + 0.01f, 0.035f, swr, 0.03f)
        b.box(swx, swy - 0.02f, swz - 0.14f, 0.05f, 0.05f, 0.28f)
        // front seats: cushion, backrest (two-tone), headrest
        val zSeat = (zt0 + zt1) * 0.5f + (zt1 - zt0) * 0.12f
        for (side in 0..1) {
            val sx = (side * 2 - 1) * hwIn * 0.45f
            b.color(WHITE, 0.5f, 0, 0.2f)
            b.box(sx, ya + hc * 0.32f, zSeat, 0.44f, hc * 0.64f, 0.13f)
            b.color(0xFF8E1B2A.toInt(), 0f, 0, 0.25f)
            b.box(sx, ya + hc * 0.32f, zSeat - 0.07f, 0.16f, hc * 0.56f, 0.012f)
            b.color(WHITE, 0.5f, 0, 0.2f)
            b.box(sx, ya + hc * 0.74f, zSeat + 0.01f, 0.24f, hc * 0.2f, 0.1f)
            b.box(sx, ya + hc * 0.62f, zSeat + 0.01f, 0.04f, hc * 0.1f, 0.03f)
        }
        // rear bench when the cabin is long enough
        if (zt1 - zt0 > 1.0f) {
            val zr = zt1 - 0.12f
            b.color(WHITE, 0.5f, 0, 0.2f)
            b.box(0f, ya + hc * 0.28f, zr, iw - 0.1f, hc * 0.56f, 0.13f)
            for (side in 0..1) b.box((side * 2 - 1) * hwIn * 0.45f, ya + hc * 0.66f, zr + 0.01f, 0.24f, hc * 0.18f, 0.1f)
        }
        // door handles (chrome), slightly below the glass line, on the front doors
        b.color(CHROME, 0f, 0, 1f)
        val zh = z0 + (z1 - z0) * 0.45f
        b.box(-(hwBody + 0.012f), ya - 0.07f, zh, 0.025f, 0.035f, 0.17f)
        b.box(hwBody + 0.012f, ya - 0.07f, zh, 0.025f, 0.035f, 0.17f)
        if (zt1 - zt0 > 1.0f) {
            val zh2 = zh + (z1 - z0) * 0.32f
            b.box(-(hwBody + 0.012f), ya - 0.07f, zh2, 0.025f, 0.035f, 0.15f)
            b.box(hwBody + 0.012f, ya - 0.07f, zh2, 0.025f, 0.035f, 0.15f)
        }
    }

    private fun mirrors(b: MeshBuilder, hw: Float, y: Float, z: Float) {
        paint(b)
        b.box(-(hw + 0.07f), y, z, 0.14f, 0.08f, 0.16f)
        b.box(hw + 0.07f, y, z, 0.14f, 0.08f, 0.16f)
        b.color(DARK, 0f, 0, 0.2f)
        b.box(-(hw + 0.01f), y - 0.03f, z + 0.02f, 0.06f, 0.03f, 0.06f)
        b.box(hw + 0.01f, y - 0.03f, z + 0.02f, 0.06f, 0.03f, 0.06f)
    }

    // --------------------------------------------------------------------------------------
    // Player cars
    // --------------------------------------------------------------------------------------
    fun sports(): VehicleModel {
        val b = MeshBuilder()
        val l = 4.4f; val w = 1.9f; val hw = w / 2; val r = 0.34f
        val zf = -l * 0.32f; val zr = l * 0.31f
        paint(b)
        b.box(0f, 0.44f, 0f, w, 0.34f, l - 0.1f)
        b.taper(-hw, hw, -l / 2 + 0.05f, -l * 0.14f, 0.61f, -hw + 0.12f, hw - 0.12f, -l / 2 + 0.3f, -l * 0.14f, 0.75f, bottom = false)
        b.taper(-hw, hw, l * 0.24f, l / 2 - 0.05f, 0.61f, -hw + 0.08f, hw - 0.08f, l * 0.24f, l / 2 - 0.16f, 0.8f, bottom = false)
        b.box(0f, 0.68f, (-l * 0.14f + l * 0.24f) / 2, w, 0.15f, l * 0.38f)
        // cabin glass + roof
        b.glass()
        b.taper(-hw + 0.1f, hw - 0.1f, -l * 0.14f, l * 0.24f, 0.755f, -hw + 0.3f, hw - 0.3f, -l * 0.14f + 0.64f, l * 0.24f - 0.42f, 1.13f, bottom = false)
        interior(b, hw - 0.1f, -l * 0.14f, l * 0.24f, 0.755f, -l * 0.14f + 0.64f, l * 0.24f - 0.42f, 1.13f, hw)
        paint(b)
        b.box(0f, 1.14f, (-l * 0.14f + 0.64f + l * 0.24f - 0.42f) / 2, w - 0.62f, 0.025f, l * 0.38f - 1.06f + 0.02f)
        // side sculpt line
        b.color(TRIM, 0f, 0, 0.4f)
        b.box(-(hw + 0.003f), 0.5f, 0.1f, 0.006f, 0.035f, l * 0.45f)
        b.box(hw + 0.003f, 0.5f, 0.1f, 0.006f, 0.035f, l * 0.45f)
        // front
        b.color(DARK, 0f, 0, 0.3f)
        b.box(0f, 0.36f, -l / 2 + 0.01f, w - 0.1f, 0.2f, 0.1f)
        b.color(0xFF050505.toInt(), 0f, 0, 0.1f)
        b.box(0f, 0.4f, -l / 2 - 0.035f, w * 0.52f, 0.12f, 0.03f)
        b.box(0f, 0.25f, -l / 2 + 0.05f, w - 0.05f, 0.03f, 0.2f)
        b.color(HEAD, 0f, 1, 1f)
        b.box(-(hw - 0.3f), 0.63f, -l / 2 + 0.1f, 0.46f, 0.07f, 0.16f)
        b.box(hw - 0.3f, 0.63f, -l / 2 + 0.1f, 0.46f, 0.07f, 0.16f)
        // rear
        b.color(DARK, 0f, 0, 0.3f)
        b.box(0f, 0.38f, l / 2 - 0.01f, w - 0.1f, 0.18f, 0.1f)
        b.color(TAIL, 0f, 2, 0.8f)
        b.box(-(hw - 0.33f), 0.67f, l / 2 - 0.06f, 0.5f, 0.08f, 0.06f)
        b.box(hw - 0.33f, 0.67f, l / 2 - 0.06f, 0.5f, 0.08f, 0.06f)
        b.box(0f, 0.7f, l / 2 - 0.09f, w - 1.1f, 0.03f, 0.04f)
        blinkers(b, hw, 0.55f, -l / 2 + 0.02f, 0.6f, l / 2 - 0.02f)
        b.color(CHROME, 0f, 0, 1f)
        b.cylinderZ(-0.42f, 0.32f, l / 2 + 0.03f, 0.05f, 0.14f, 8)
        b.cylinderZ(0.42f, 0.32f, l / 2 + 0.03f, 0.05f, 0.14f, 8)
        // spoiler
        b.color(0xFF1D1F25.toInt(), 0f, 0, 0.5f)
        b.box(0f, 0.98f, l / 2 - 0.2f, w - 0.3f, 0.035f, 0.32f)
        b.box(-0.5f, 0.88f, l / 2 - 0.2f, 0.05f, 0.17f, 0.12f)
        b.box(0.5f, 0.88f, l / 2 - 0.2f, 0.05f, 0.17f, 0.12f)
        mirrors(b, hw, 0.86f, -l * 0.12f)
        archesAndUnder(b, w, l, floatArrayOf(zf, zr), r, 0.22f)
        return VehicleModel(
            b.build(), l, w, hw - 0.1f, floatArrayOf(zf, zr), r,
            floatArrayOf(-(hw - 0.3f), 0.63f, -l / 2, hw - 0.3f, 0.63f, -l / 2),
            floatArrayOf(-(hw - 0.33f), 0.67f, l / 2, hw - 0.33f, 0.67f, l / 2),
            floatArrayOf(-0.42f, 0.32f, l / 2 + 0.1f, 0.42f, 0.32f, l / 2 + 0.1f)
        )
    }

    fun muscle(): VehicleModel {
        val b = MeshBuilder()
        val l = 4.9f; val w = 2.0f; val hw = w / 2; val r = 0.36f
        val zf = -l * 0.31f; val zr = l * 0.3f
        paint(b)
        b.box(0f, 0.47f, 0f, w, 0.4f, l - 0.1f)
        b.taper(-hw, hw, -l / 2 + 0.05f, -l * 0.12f, 0.67f, -hw + 0.04f, hw - 0.04f, -l / 2 + 0.12f, -l * 0.12f, 0.79f, bottom = false)
        b.taper(-hw, hw, l * 0.22f, l / 2 - 0.05f, 0.67f, -hw + 0.04f, hw - 0.04f, l * 0.22f, l / 2 - 0.1f, 0.8f, bottom = false)
        b.box(0f, 0.735f, (-l * 0.12f + l * 0.22f) / 2, w, 0.13f, l * 0.34f)
        b.glass()
        b.taper(-hw + 0.1f, hw - 0.1f, -l * 0.12f, l * 0.22f, 0.8f, -hw + 0.24f, hw - 0.24f, -l * 0.12f + 0.52f, l * 0.22f - 0.5f, 1.22f, bottom = false)
        interior(b, hw - 0.1f, -l * 0.12f, l * 0.22f, 0.8f, -l * 0.12f + 0.52f, l * 0.22f - 0.5f, 1.22f, hw)
        paint(b)
        val roofLen = l * 0.34f - 1.02f
        b.box(0f, 1.23f, (-l * 0.12f + 0.52f + l * 0.22f - 0.5f) / 2, w - 0.48f, 0.025f, roofLen + 0.02f)
        // hood scoop
        b.color(0xFF101114.toInt(), 0f, 0, 0.5f)
        b.taper(-0.3f, 0.3f, -l * 0.36f, -l * 0.18f, 0.79f, -0.26f, 0.26f, -l * 0.33f, -l * 0.18f, 0.9f, bottom = false)
        // racing stripes
        b.color(0xFFF4F4F4.toInt(), 0f, 0, 0.6f)
        for (sx in floatArrayOf(-0.17f, 0.17f)) {
            b.box(sx, 0.795f, (-l / 2 + 0.12f - l * 0.12f) / 2, 0.16f, 0.012f, l * 0.38f - 0.12f)
            b.box(sx, 1.247f, (-l * 0.12f + 0.52f + l * 0.22f - 0.5f) / 2, 0.16f, 0.012f, roofLen)
            b.box(sx, 0.806f, (l * 0.22f + l / 2 - 0.1f) / 2, 0.16f, 0.012f, l * 0.28f - 0.1f)
        }
        // chrome bumpers and grille
        b.color(CHROME, 0f, 0, 1f)
        b.box(0f, 0.36f, -l / 2 + 0.0f, w - 0.04f, 0.12f, 0.1f)
        b.box(0f, 0.38f, l / 2 - 0.0f, w - 0.04f, 0.12f, 0.1f)
        b.color(0xFF070707.toInt(), 0f, 0, 0.2f)
        b.box(0f, 0.56f, -l / 2 + 0.02f, w - 0.5f, 0.16f, 0.06f)
        b.color(HEAD, 0f, 1, 1f)
        for (sx in floatArrayOf(-0.78f, -0.58f, 0.58f, 0.78f)) b.box(sx, 0.57f, -l / 2 + 0.02f, 0.16f, 0.14f, 0.07f)
        b.color(TAIL, 0f, 2, 0.8f)
        b.box(-(hw - 0.35f), 0.62f, l / 2 - 0.03f, 0.56f, 0.12f, 0.06f)
        b.box(hw - 0.35f, 0.62f, l / 2 - 0.03f, 0.56f, 0.12f, 0.06f)
        blinkers(b, hw, 0.44f, -l / 2 + 0.02f, 0.52f, l / 2 - 0.0f)
        b.color(CHROME, 0f, 0, 1f)
        for (sx in floatArrayOf(-0.62f, -0.48f, 0.48f, 0.62f)) b.cylinderZ(sx, 0.3f, l / 2 + 0.04f, 0.045f, 0.16f, 8)
        mirrors(b, hw, 0.9f, -l * 0.1f)
        archesAndUnder(b, w, l, floatArrayOf(zf, zr), r, 0.23f)
        return VehicleModel(
            b.build(), l, w, hw - 0.1f, floatArrayOf(zf, zr), r,
            floatArrayOf(-0.68f, 0.57f, -l / 2, 0.68f, 0.57f, -l / 2),
            floatArrayOf(-(hw - 0.35f), 0.62f, l / 2, hw - 0.35f, 0.62f, l / 2),
            floatArrayOf(-0.55f, 0.3f, l / 2 + 0.12f, 0.55f, 0.3f, l / 2 + 0.12f)
        )
    }

    fun suv(): VehicleModel {
        val b = MeshBuilder()
        val l = 4.8f; val w = 2.05f; val hw = w / 2; val r = 0.42f
        val zf = -l * 0.31f; val zr = l * 0.31f
        paint(b, 0.6f)
        b.box(0f, 0.74f, 0f, w, 0.56f, l - 0.1f)
        b.taper(-hw, hw, -l / 2 + 0.05f, -l * 0.18f, 1.02f, -hw + 0.06f, hw - 0.06f, -l / 2 + 0.16f, -l * 0.18f, 1.1f, bottom = false)
        b.glass()
        b.taper(-hw + 0.08f, hw - 0.08f, -l * 0.18f, l / 2 - 0.12f, 1.02f, -hw + 0.18f, hw - 0.18f, -l * 0.18f + 0.5f, l / 2 - 0.22f, 1.74f, bottom = false)
        interior(b, hw - 0.08f, -l * 0.18f, l / 2 - 0.12f, 1.02f, -l * 0.18f + 0.5f, l / 2 - 0.22f, 1.74f, hw)
        paint(b, 0.6f)
        b.box(0f, 1.755f, (-l * 0.18f + 0.5f + l / 2 - 0.22f) / 2, w - 0.34f, 0.04f, l * 0.68f - 0.6f)
        // pillars
        b.box(0f, 1.38f, l * 0.06f, w - 0.14f, 0.7f, 0.1f)
        b.box(0f, 1.38f, l / 2 - 0.2f, w - 0.2f, 0.7f, 0.12f)
        b.box(0f, 1.1f, l / 2 - 0.12f, w - 0.1f, 0.18f, 0.12f)
        // roof rack
        b.color(0xFF22252B.toInt(), 0f, 0, 0.5f)
        b.box(-(hw - 0.3f), 1.82f, 0.3f, 0.06f, 0.06f, l * 0.55f)
        b.box(hw - 0.3f, 1.82f, 0.3f, 0.06f, 0.06f, l * 0.55f)
        b.box(0f, 1.84f, -0.3f, w - 0.6f, 0.03f, 0.05f)
        b.box(0f, 1.84f, 0.9f, w - 0.6f, 0.03f, 0.05f)
        // cladding
        b.color(0xFF1B1D21.toInt(), 0f, 0, 0.1f)
        b.box(0f, 0.52f, 0f, w + 0.03f, 0.14f, l - 0.3f)
        b.box(0f, 0.55f, -l / 2 + 0.02f, w - 0.02f, 0.26f, 0.12f)
        b.box(0f, 0.55f, l / 2 - 0.02f, w - 0.02f, 0.26f, 0.12f)
        b.color(0xFF0A0A0A.toInt(), 0f, 0, 0.3f)
        b.box(0f, 0.86f, -l / 2 + 0.02f, w - 0.7f, 0.22f, 0.04f)
        b.color(CHROME, 0f, 0, 1f)
        b.box(0f, 0.86f, -l / 2 + 0.0f, w - 0.9f, 0.03f, 0.04f)
        b.color(HEAD, 0f, 1, 1f)
        b.box(-(hw - 0.22f), 0.9f, -l / 2 + 0.04f, 0.32f, 0.12f, 0.05f)
        b.box(hw - 0.22f, 0.9f, -l / 2 + 0.04f, 0.32f, 0.12f, 0.05f)
        b.color(TAIL, 0f, 2, 0.8f)
        b.box(-(hw - 0.1f), 1.05f, l / 2 - 0.03f, 0.16f, 0.42f, 0.06f)
        b.box(hw - 0.1f, 1.05f, l / 2 - 0.03f, 0.16f, 0.42f, 0.06f)
        blinkers(b, hw, 0.76f, -l / 2 + 0.0f, 0.78f, l / 2 - 0.0f)
        b.color(CHROME, 0f, 0, 1f)
        b.cylinderZ(0.55f, 0.4f, l / 2 + 0.04f, 0.055f, 0.14f, 8)
        mirrors(b, hw, 1.2f, -l * 0.15f)
        archesAndUnder(b, w, l, floatArrayOf(zf, zr), r, 0.4f)
        return VehicleModel(
            b.build(), l, w, hw - 0.12f, floatArrayOf(zf, zr), r,
            floatArrayOf(-(hw - 0.22f), 0.9f, -l / 2, hw - 0.22f, 0.9f, -l / 2),
            floatArrayOf(-(hw - 0.1f), 1.05f, l / 2, hw - 0.1f, 1.05f, l / 2),
            floatArrayOf(0.55f, 0.4f, l / 2 + 0.1f, 0.55f, 0.4f, l / 2 + 0.1f)
        )
    }

    fun supercar(): VehicleModel {
        val b = MeshBuilder()
        val l = 4.6f; val w = 2.02f; val hw = w / 2; val r = 0.36f
        val zf = -l * 0.31f; val zr = l * 0.3f
        paint(b, 0.8f)
        b.box(0f, 0.38f, 0f, w, 0.26f, l - 0.1f)
        b.taper(-hw, hw, -l / 2 + 0.05f, -l * 0.08f, 0.51f, -hw + 0.16f, hw - 0.16f, -l / 2 + 0.5f, -l * 0.08f, 0.66f, bottom = false)
        b.taper(-hw, hw, -l * 0.08f, l / 2 - 0.05f, 0.51f, -hw + 0.06f, hw - 0.06f, -l * 0.0f, l / 2 - 0.22f, 0.76f, bottom = false)
        b.glass()
        b.taper(-hw + 0.24f, hw - 0.24f, -l * 0.17f, l * 0.18f, 0.7f, -hw + 0.42f, hw - 0.42f, -l * 0.17f + 0.62f, l * 0.18f - 0.12f, 1.07f, bottom = false)
        interior(b, hw - 0.24f, -l * 0.17f, l * 0.18f, 0.7f, -l * 0.17f + 0.62f, l * 0.18f - 0.12f, 1.07f, hw)
        paint(b, 0.8f)
        b.box(0f, 1.08f, (-l * 0.17f + 0.62f + l * 0.18f - 0.12f) / 2, w - 0.86f, 0.02f, l * 0.35f - 0.74f + 0.02f)
        // side intakes
        b.color(0xFF050505.toInt(), 0f, 0, 0.1f)
        b.taper(-(hw + 0.006f), -(hw - 0.004f), l * 0.02f, l * 0.22f, 0.44f, -(hw + 0.006f), -(hw - 0.004f), l * 0.06f, l * 0.22f, 0.66f)
        b.taper(hw - 0.004f, hw + 0.006f, l * 0.02f, l * 0.22f, 0.44f, hw - 0.004f, hw + 0.006f, l * 0.06f, l * 0.22f, 0.66f)
        // engine cover louvres
        for (i in 0 until 4) b.box(0f, 0.77f, l * 0.26f + i * 0.14f, w - 1.0f, 0.012f, 0.05f)
        // front splitter & intakes
        b.box(0f, 0.27f, -l / 2 + 0.05f, w, 0.03f, 0.3f)
        b.box(-(hw - 0.35f), 0.38f, -l / 2 - 0.0f, 0.4f, 0.14f, 0.04f)
        b.box(hw - 0.35f, 0.38f, -l / 2 - 0.0f, 0.4f, 0.14f, 0.04f)
        b.color(HEAD, 0f, 1, 1f)
        b.taper(-(hw - 0.12f), -(hw - 0.5f), -l / 2 + 0.12f, -l / 2 + 0.3f, 0.52f, -(hw - 0.16f), -(hw - 0.5f), -l / 2 + 0.2f, -l / 2 + 0.34f, 0.57f)
        b.taper(hw - 0.5f, hw - 0.12f, -l / 2 + 0.12f, -l / 2 + 0.3f, 0.52f, hw - 0.5f, hw - 0.16f, -l / 2 + 0.2f, -l / 2 + 0.34f, 0.57f)
        b.color(TAIL, 0f, 2, 0.8f)
        b.box(0f, 0.62f, l / 2 - 0.04f, w - 0.2f, 0.05f, 0.06f)
        b.box(-(hw - 0.2f), 0.6f, l / 2 - 0.04f, 0.3f, 0.1f, 0.06f)
        b.box(hw - 0.2f, 0.6f, l / 2 - 0.04f, 0.3f, 0.1f, 0.06f)
        b.color(0xFF0B0C0E.toInt(), 0f, 0, 0.3f)
        b.box(0f, 0.36f, l / 2 - 0.02f, w - 0.2f, 0.16f, 0.08f)
        blinkers(b, hw, 0.45f, -l / 2 + 0.06f, 0.52f, l / 2 - 0.03f)
        b.color(CHROME, 0f, 0, 1f)
        b.cylinderZ(-0.12f, 0.36f, l / 2 + 0.03f, 0.06f, 0.12f, 10)
        b.cylinderZ(0.12f, 0.36f, l / 2 + 0.03f, 0.06f, 0.12f, 10)
        // rear wing
        b.color(0xFF141519.toInt(), 0f, 0, 0.6f)
        b.box(0f, 1.0f, l / 2 - 0.26f, w - 0.1f, 0.04f, 0.4f)
        b.box(-(hw - 0.06f), 0.94f, l / 2 - 0.26f, 0.03f, 0.18f, 0.44f)
        b.box(hw - 0.06f, 0.94f, l / 2 - 0.26f, 0.03f, 0.18f, 0.44f)
        b.box(-0.45f, 0.87f, l / 2 - 0.26f, 0.06f, 0.22f, 0.14f)
        b.box(0.45f, 0.87f, l / 2 - 0.26f, 0.06f, 0.22f, 0.14f)
        mirrors(b, hw - 0.12f, 0.8f, -l * 0.12f)
        archesAndUnder(b, w, l, floatArrayOf(zf, zr), r, 0.2f)
        return VehicleModel(
            b.build(), l, w, hw - 0.1f, floatArrayOf(zf, zr), r,
            floatArrayOf(-(hw - 0.3f), 0.55f, -l / 2 + 0.15f, hw - 0.3f, 0.55f, -l / 2 + 0.15f),
            floatArrayOf(-(hw - 0.2f), 0.6f, l / 2, hw - 0.2f, 0.6f, l / 2),
            floatArrayOf(-0.12f, 0.36f, l / 2 + 0.1f, 0.12f, 0.36f, l / 2 + 0.1f)
        )
    }

    // --------------------------------------------------------------------------------------
    // v2 vehicle classes
    // --------------------------------------------------------------------------------------
    private fun roundLamp(b: MeshBuilder, x: Float, y: Float, zFace: Float, r: Float, front: Boolean) {
        val d = if (front) 1f else -1f
        b.cylinderZ(x, y, zFace + d * 0.03f, r, 0.06f, 14)
        b.diskZ(x, y, zFace, r, 14, !front)
    }

    /** 1960s grand-tourer coupe: long bonnet, chrome trim, round lamps, slim roof pillars. */
    fun classic(): VehicleModel {
        val b = MeshBuilder()
        val l = 4.7f; val w = 1.86f; val hw = w / 2; val r = 0.35f
        val zf = -l * 0.33f; val zr = l * 0.31f
        paint(b, 0.8f)
        b.box(0f, 0.5f, 0f, w, 0.38f, l - 0.14f)
        b.taper(-hw, hw, -l / 2 + 0.07f, -l * 0.05f, 0.69f, -hw + 0.1f, hw - 0.1f, -l / 2 + 0.24f, -l * 0.05f, 0.78f, bottom = false)
        b.taper(-hw, hw, l * 0.26f, l / 2 - 0.07f, 0.69f, -hw + 0.1f, hw - 0.1f, l * 0.26f, l / 2 - 0.26f, 0.76f, bottom = false)
        b.box(0f, 0.735f, (-l * 0.05f + l * 0.26f) / 2, w, 0.09f, l * 0.31f)
        val zt0 = -l * 0.05f + 0.42f; val zt1 = l * 0.26f - 0.38f
        b.glass()
        b.taper(-hw + 0.12f, hw - 0.12f, -l * 0.05f, l * 0.26f, 0.78f, -hw + 0.26f, hw - 0.26f, zt0, zt1, 1.2f, bottom = false)
        interior(b, hw - 0.12f, -l * 0.05f, l * 0.26f, 0.78f, zt0, zt1, 1.2f, hw)
        paint(b, 0.8f)
        b.box(0f, 1.212f, (zt0 + zt1) / 2, w - 0.5f, 0.025f, zt1 - zt0 + 0.02f)
        // chrome: bumpers with overriders, beltline strip, window surround
        b.color(CHROME, 0f, 0, 1f)
        b.box(0f, 0.36f, -l / 2 + 0.03f, w + 0.02f, 0.09f, 0.1f)
        b.box(0f, 0.38f, l / 2 - 0.03f, w + 0.02f, 0.09f, 0.1f)
        for (sx in floatArrayOf(-0.42f, 0.42f)) {
            b.box(sx, 0.43f, -l / 2 + 0.0f, 0.06f, 0.16f, 0.06f)
            b.box(sx, 0.45f, l / 2 - 0.0f, 0.06f, 0.16f, 0.06f)
        }
        b.box(-(hw + 0.004f), 0.6f, 0f, 0.008f, 0.025f, l * 0.8f)
        b.box(hw + 0.004f, 0.6f, 0f, 0.008f, 0.025f, l * 0.8f)
        b.box(0f, 0.785f, -l * 0.05f + 0.01f, w - 0.26f, 0.015f, 0.02f)
        // grille with chrome slats and a bonnet ornament
        b.color(0xFF0A0A0A.toInt(), 0f, 0, 0.4f)
        b.box(0f, 0.53f, -l / 2 + 0.06f, w * 0.42f, 0.18f, 0.04f)
        b.color(CHROME, 0f, 0, 1f)
        for (i in 0 until 5) b.box(0f, 0.46f + i * 0.035f, -l / 2 + 0.035f, w * 0.42f, 0.008f, 0.012f)
        b.box(0f, 0.8f, -l / 2 + 0.3f, 0.03f, 0.04f, 0.12f)
        // round headlights with chrome bezels, round tail lights
        for (sx in floatArrayOf(-(hw - 0.24f), hw - 0.24f)) {
            b.color(CHROME, 0f, 0, 1f)
            b.cylinderZ(sx, 0.6f, -l / 2 + 0.08f, 0.115f, 0.05f, 14)
            b.color(HEAD, 0f, 1, 1f)
            roundLamp(b, sx, 0.6f, -l / 2 + 0.05f, 0.1f, true)
        }
        b.color(TAIL, 0f, 2, 0.8f)
        for (sx in floatArrayOf(-(hw - 0.2f), -(hw - 0.42f), hw - 0.42f, hw - 0.2f)) roundLamp(b, sx, 0.6f, l / 2 - 0.04f, 0.075f, false)
        blinkers(b, hw, 0.44f, -l / 2 + 0.05f, 0.47f, l / 2 - 0.05f)
        b.color(CHROME, 0f, 0, 1f)
        b.cylinderZ(-0.5f, 0.3f, l / 2 + 0.02f, 0.045f, 0.18f, 8)
        mirrors(b, hw, 0.84f, -l * 0.02f)
        archesAndUnder(b, w, l, floatArrayOf(zf, zr), r, 0.24f)
        return VehicleModel(
            b.build(), l, w, hw - 0.1f, floatArrayOf(zf, zr), r,
            floatArrayOf(-(hw - 0.24f), 0.6f, -l / 2, hw - 0.24f, 0.6f, -l / 2),
            floatArrayOf(-(hw - 0.3f), 0.6f, l / 2, hw - 0.3f, 0.6f, l / 2),
            floatArrayOf(-0.5f, 0.3f, l / 2 + 0.1f)
        )
    }

    /** Four-door performance saloon: lowered, quad exhausts, lip spoiler, front splitter. */
    fun sportSedan(): VehicleModel {
        val b = MeshBuilder()
        val l = 4.8f; val w = 1.9f; val hw = w / 2; val r = 0.35f
        val zs = floatArrayOf(-l * 0.31f, l * 0.3f)
        sedanBody(b, l, w)
        b.color(0xFF0B0C0E.toInt(), 0f, 0, 0.4f)
        b.box(0f, 0.27f, -l / 2 + 0.08f, w + 0.02f, 0.03f, 0.22f)
        b.box(-(hw + 0.02f), 0.3f, 0f, 0.04f, 0.06f, l * 0.5f)
        b.box(hw + 0.02f, 0.3f, 0f, 0.04f, 0.06f, l * 0.5f)
        b.box(0f, 0.835f, l / 2 - 0.12f, w - 0.3f, 0.025f, 0.12f)
        b.box(0f, 0.3f, l / 2 + 0.01f, w - 0.5f, 0.1f, 0.06f)
        b.color(CHROME, 0f, 0, 1f)
        for (sx in floatArrayOf(-0.62f, -0.46f, 0.46f, 0.62f)) b.cylinderZ(sx, 0.31f, l / 2 + 0.04f, 0.05f, 0.12f, 10)
        archesAndUnder(b, w, l, zs, r, 0.22f)
        return VehicleModel(b.build(), l, w, hw - 0.1f, zs, r,
            floatArrayOf(-(hw - 0.25f), 0.62f, -l / 2, hw - 0.25f, 0.62f, -l / 2),
            floatArrayOf(-(hw - 0.22f), 0.68f, l / 2, hw - 0.22f, 0.68f, l / 2),
            floatArrayOf(-0.54f, 0.31f, l / 2 + 0.1f, 0.54f, 0.31f, l / 2 + 0.1f))
    }

    /** Full-size pickup: tall nose, chrome grille, crew cab and an open load bed. */
    fun pickup(): VehicleModel {
        val b = MeshBuilder()
        val l = 5.5f; val w = 2.06f; val hw = w / 2; val r = 0.45f
        val zs = floatArrayOf(-l * 0.32f, l * 0.3f)
        val zc0 = -l * 0.2f; val zc1 = zc0 + 1.75f
        paint(b, 0.55f)
        b.box(0f, 0.88f, 0f, w, 0.6f, l - 0.08f)
        b.taper(-hw, hw, -l / 2 + 0.04f, zc0, 1.18f, -hw + 0.03f, hw - 0.03f, -l / 2 + 0.1f, zc0, 1.26f, bottom = false)
        b.glass()
        b.taper(-hw + 0.08f, hw - 0.08f, zc0, zc1, 1.18f, -hw + 0.16f, hw - 0.16f, zc0 + 0.5f, zc1 - 0.06f, 1.95f, bottom = false)
        interior(b, hw - 0.08f, zc0, zc1, 1.18f, zc0 + 0.5f, zc1 - 0.06f, 1.95f, hw)
        paint(b, 0.55f)
        b.box(0f, 1.965f, (zc0 + 0.5f + zc1 - 0.06f) / 2, w - 0.3f, 0.04f, zc1 - zc0 - 0.54f)
        b.box(0f, 1.56f, zc0 + 0.95f, w - 0.14f, 0.76f, 0.09f)
        // load bed: side walls, tailgate, dark floor
        val bedLen = l / 2 - zc1
        b.box(-(hw - 0.04f), 1.33f, zc1 + bedLen / 2, 0.08f, 0.3f, bedLen - 0.04f)
        b.box(hw - 0.04f, 1.33f, zc1 + bedLen / 2, 0.08f, 0.3f, bedLen - 0.04f)
        b.box(0f, 1.33f, l / 2 - 0.06f, w, 0.3f, 0.08f)
        b.color(0xFF141518.toInt(), 0f, 0, 0.15f)
        b.box(0f, 1.19f, zc1 + bedLen / 2, w - 0.16f, 0.02f, bedLen - 0.1f)
        for (i in 0 until 5) b.box(-0.6f + i * 0.3f, 1.205f, zc1 + bedLen / 2, 0.05f, 0.012f, bedLen - 0.2f)
        // chrome grille and bumpers
        b.color(CHROME, 0f, 0, 1f)
        b.box(0f, 0.98f, -l / 2 + 0.02f, w - 0.56f, 0.34f, 0.05f)
        b.box(0f, 0.6f, -l / 2 + 0.0f, w + 0.02f, 0.2f, 0.12f)
        b.box(0f, 0.62f, l / 2 + 0.0f, w + 0.02f, 0.18f, 0.12f)
        b.color(0xFF0A0A0A.toInt(), 0f, 0, 0.3f)
        for (i in 0 until 4) b.box(0f, 0.86f + i * 0.08f, -l / 2 - 0.005f, w - 0.66f, 0.035f, 0.02f)
        b.color(HEAD, 0f, 1, 1f)
        b.box(-(hw - 0.2f), 1.02f, -l / 2 + 0.03f, 0.3f, 0.18f, 0.06f)
        b.box(hw - 0.2f, 1.02f, -l / 2 + 0.03f, 0.3f, 0.18f, 0.06f)
        b.color(TAIL, 0f, 2, 0.8f)
        b.box(-(hw - 0.05f), 1.2f, l / 2 - 0.02f, 0.1f, 0.42f, 0.06f)
        b.box(hw - 0.05f, 1.2f, l / 2 - 0.02f, 0.1f, 0.42f, 0.06f)
        blinkers(b, hw, 0.84f, -l / 2 + 0.0f, 0.95f, l / 2 + 0.0f)
        b.color(DARK, 0f, 0, 0.3f)
        b.box(-(hw + 0.04f), 0.62f, (zc0 + zc1) / 2, 0.08f, 0.05f, zc1 - zc0)
        b.box(hw + 0.04f, 0.62f, (zc0 + zc1) / 2, 0.08f, 0.05f, zc1 - zc0)
        b.color(CHROME, 0f, 0, 1f)
        b.cylinderZ(0.62f, 0.5f, l / 2 - 0.02f, 0.06f, 0.16f, 8)
        mirrors(b, hw, 1.42f, zc0 + 0.32f)
        archesAndUnder(b, w, l, zs, r, 0.48f)
        return VehicleModel(b.build(), l, w, hw - 0.12f, zs, r,
            floatArrayOf(-(hw - 0.2f), 1.02f, -l / 2, hw - 0.2f, 1.02f, -l / 2),
            floatArrayOf(-(hw - 0.05f), 1.2f, l / 2, hw - 0.05f, 1.2f, l / 2),
            floatArrayOf(0.62f, 0.5f, l / 2 + 0.06f))
    }

    /** Short-wheelbase off-roader: upright glass, slotted grille, roof lamps, snorkel, spare wheel. */
    fun offroad(): VehicleModel {
        val b = MeshBuilder()
        val l = 4.3f; val w = 2.0f; val hw = w / 2; val r = 0.48f
        val zs = floatArrayOf(-l * 0.3f, l * 0.29f)
        val zg0 = -l * 0.12f; val zg1 = l / 2 - 0.2f
        paint(b, 0.4f)
        b.box(0f, 0.96f, 0f, w, 0.72f, l - 0.3f)
        b.taper(-hw, hw, -l / 2 + 0.15f, zg0, 1.32f, -hw + 0.03f, hw - 0.03f, -l / 2 + 0.2f, zg0, 1.38f, bottom = false)
        b.glass()
        b.taper(-hw + 0.06f, hw - 0.06f, zg0, zg1, 1.32f, -hw + 0.08f, hw - 0.08f, zg0 + 0.24f, zg1 - 0.02f, 2.04f, bottom = false)
        interior(b, hw - 0.06f, zg0, zg1, 1.32f, zg0 + 0.24f, zg1 - 0.02f, 2.04f, hw)
        paint(b, 0.4f)
        b.box(0f, 2.06f, (zg0 + 0.24f + zg1 - 0.02f) / 2, w - 0.12f, 0.05f, zg1 - zg0 - 0.22f)
        b.box(0f, 1.68f, l * 0.06f, w - 0.1f, 0.72f, 0.08f)
        // steel bumpers, fender flares, rock sliders
        b.color(0xFF1A1B1E.toInt(), 0f, 0, 0.25f)
        b.box(0f, 0.62f, -l / 2 + 0.08f, w + 0.12f, 0.2f, 0.2f)
        b.box(0f, 0.62f, l / 2 - 0.08f, w + 0.12f, 0.2f, 0.2f)
        for (z in zs) {
            b.box(-(hw + 0.05f), 1.06f, z, 0.14f, 0.1f, r * 2.6f)
            b.box(hw + 0.05f, 1.06f, z, 0.14f, 0.1f, r * 2.6f)
        }
        b.box(-(hw + 0.05f), 0.6f, 0f, 0.1f, 0.08f, l * 0.36f)
        b.box(hw + 0.05f, 0.6f, 0f, 0.1f, 0.08f, l * 0.36f)
        // slotted grille and round headlamps
        b.color(0xFF0B0B0C.toInt(), 0f, 0, 0.2f)
        for (i in -3..3) b.box(i * 0.12f, 1.06f, -l / 2 + 0.14f, 0.05f, 0.3f, 0.02f)
        for (sx in floatArrayOf(-(hw - 0.28f), hw - 0.28f)) {
            b.color(0xFF0B0B0C.toInt(), 0f, 0, 0.2f)
            b.cylinderZ(sx, 1.08f, -l / 2 + 0.15f, 0.135f, 0.04f, 14)
            b.color(HEAD, 0f, 1, 1f)
            roundLamp(b, sx, 1.08f, -l / 2 + 0.11f, 0.115f, true)
        }
        // roof lamp bar
        b.color(0xFF141518.toInt(), 0f, 0, 0.3f)
        b.box(0f, 2.12f, zg0 + 0.32f, w - 0.36f, 0.08f, 0.1f)
        b.color(HEAD, 0f, 1, 1f)
        for (i in 0 until 4) b.box(-0.54f + i * 0.36f, 2.12f, zg0 + 0.265f, 0.22f, 0.06f, 0.02f)
        // tail lamps, spare wheel on the tailgate, snorkel
        b.color(TAIL, 0f, 2, 0.8f)
        b.box(-(hw - 0.08f), 1.0f, l / 2 - 0.145f, 0.12f, 0.24f, 0.04f)
        b.box(hw - 0.08f, 1.0f, l / 2 - 0.145f, 0.12f, 0.24f, 0.04f)
        b.color(0xFF18181A.toInt(), 0f, 0, 0.05f)
        b.cylinderZ(0f, 1.3f, l / 2 - 0.02f, r * 0.95f, 0.26f, 18)
        b.diskZ(0f, 1.3f, l / 2 + 0.11f, r * 0.95f, 18, true)
        b.color(0xFF505359.toInt(), 0f, 0, 0.6f)
        b.diskZ(0f, 1.3f, l / 2 + 0.115f, r * 0.55f, 14, true)
        b.color(0xFF141518.toInt(), 0f, 0, 0.3f)
        b.box(hw + 0.05f, 1.62f, zg0 + 0.05f, 0.09f, 0.86f, 0.09f)
        b.box(hw + 0.05f, 2.04f, zg0 - 0.02f, 0.09f, 0.08f, 0.22f)
        blinkers(b, hw, 0.92f, -l / 2 + 0.15f, 0.86f, l / 2 - 0.15f)
        b.color(CHROME, 0f, 0, 1f)
        b.cylinderZ(-0.62f, 0.56f, l / 2 - 0.06f, 0.055f, 0.14f, 8)
        mirrors(b, hw, 1.58f, zg0 + 0.12f)
        archesAndUnder(b, w, l, zs, r, 0.56f)
        return VehicleModel(b.build(), l, w, hw - 0.1f, zs, r,
            floatArrayOf(-(hw - 0.28f), 1.08f, -l / 2 + 0.1f, hw - 0.28f, 1.08f, -l / 2 + 0.1f),
            floatArrayOf(-(hw - 0.08f), 1.0f, l / 2 - 0.12f, hw - 0.08f, 1.0f, l / 2 - 0.12f),
            floatArrayOf(-0.62f, 0.56f, l / 2 + 0.02f))
    }

    /** Police interceptor: saloon with livery panels, push bar and a red/blue strobe light bar. */
    fun police(): VehicleModel {
        val b = MeshBuilder()
        val l = 4.9f; val w = 1.92f; val hw = w / 2; val r = 0.36f
        val zs = floatArrayOf(-l * 0.31f, l * 0.3f)
        sedanBody(b, l, w)
        // white door panels and a dark lower stripe (fixed livery over the chosen paint)
        b.color(0xFFF2F4F6.toInt(), 0f, 0, 0.5f)
        b.box(-(hw + 0.005f), 0.56f, l * 0.03f, 0.01f, 0.28f, l * 0.42f)
        b.box(hw + 0.005f, 0.56f, l * 0.03f, 0.01f, 0.28f, l * 0.42f)
        b.color(0xFF0F2A6B.toInt(), 0f, 0, 0.4f)
        b.box(-(hw + 0.008f), 0.42f, 0f, 0.01f, 0.05f, l * 0.8f)
        b.box(hw + 0.008f, 0.42f, 0f, 0.01f, 0.05f, l * 0.8f)
        // push bar
        b.color(0xFF101114.toInt(), 0f, 0, 0.4f)
        b.box(0f, 0.62f, -l / 2 - 0.1f, w * 0.62f, 0.06f, 0.06f)
        b.box(0f, 0.42f, -l / 2 - 0.1f, w * 0.62f, 0.06f, 0.06f)
        for (sx in floatArrayOf(-0.5f, -0.2f, 0.2f, 0.5f)) b.box(sx, 0.52f, -l / 2 - 0.1f, 0.06f, 0.3f, 0.06f)
        // light bar: base, red and blue strobes (emissive 6 / 7), centre take-down lamps
        b.color(0xFF0D0E10.toInt(), 0f, 0, 0.5f)
        b.box(0f, 1.475f, l * 0.03f, 1.2f, 0.06f, 0.3f)
        b.color(0xFFFF1A2E.toInt(), 0f, 6, 0.9f)
        b.box(-0.32f, 1.54f, l * 0.03f, 0.5f, 0.08f, 0.26f)
        b.color(0xFF1A5BFF.toInt(), 0f, 7, 0.9f)
        b.box(0.32f, 1.54f, l * 0.03f, 0.5f, 0.08f, 0.26f)
        b.color(HEAD, 0f, 1, 1f)
        b.box(0f, 1.53f, l * 0.03f - 0.135f, 0.12f, 0.06f, 0.02f)
        // grille strobes and antenna
        b.color(0xFFFF1A2E.toInt(), 0f, 6, 0.9f)
        b.box(-0.18f, 0.58f, -l / 2 - 0.005f, 0.12f, 0.04f, 0.02f)
        b.color(0xFF1A5BFF.toInt(), 0f, 7, 0.9f)
        b.box(0.18f, 0.58f, -l / 2 - 0.005f, 0.12f, 0.04f, 0.02f)
        b.color(0xFF101114.toInt(), 0f, 0, 0.3f)
        b.box(0.3f, 1.7f, l * 0.2f, 0.015f, 0.5f, 0.015f)
        b.color(CHROME, 0f, 0, 1f)
        b.cylinderZ(-0.5f, 0.3f, l / 2 + 0.03f, 0.05f, 0.14f, 8)
        b.cylinderZ(0.5f, 0.3f, l / 2 + 0.03f, 0.05f, 0.14f, 8)
        archesAndUnder(b, w, l, zs, r, 0.24f)
        return VehicleModel(b.build(), l, w, hw - 0.1f, zs, r,
            floatArrayOf(-(hw - 0.25f), 0.62f, -l / 2, hw - 0.25f, 0.62f, -l / 2),
            floatArrayOf(-(hw - 0.22f), 0.68f, l / 2, hw - 0.22f, 0.68f, l / 2),
            floatArrayOf(-0.5f, 0.3f, l / 2 + 0.1f, 0.5f, 0.3f, l / 2 + 0.1f))
    }

    /** GT race car: very low and wide, roll cage, number roundels, splitter, diffuser, swan-neck wing. */
    fun raceCar(): VehicleModel {
        val b = MeshBuilder()
        val l = 4.7f; val w = 2.08f; val hw = w / 2; val r = 0.37f
        val zs = floatArrayOf(-l * 0.31f, l * 0.3f)
        val zt0 = -l * 0.16f + 0.6f; val zt1 = l * 0.16f - 0.1f
        paint(b, 0.9f)
        b.box(0f, 0.36f, 0f, w, 0.24f, l - 0.1f)
        b.taper(-hw, hw, -l / 2 + 0.05f, -l * 0.1f, 0.48f, -hw + 0.14f, hw - 0.14f, -l / 2 + 0.45f, -l * 0.1f, 0.64f, bottom = false)
        b.taper(-hw, hw, -l * 0.1f, l / 2 - 0.05f, 0.48f, -hw + 0.1f, hw - 0.1f, 0f, l / 2 - 0.15f, 0.74f, bottom = false)
        b.glass()
        b.taper(-hw + 0.28f, hw - 0.28f, -l * 0.16f, l * 0.16f, 0.68f, -hw + 0.45f, hw - 0.45f, zt0, zt1, 1.05f, bottom = false)
        interior(b, hw - 0.28f, -l * 0.16f, l * 0.16f, 0.68f, zt0, zt1, 1.05f, hw)
        // roll cage behind the seats
        b.color(0xFFB0B4BA.toInt(), 0f, 0, 0.8f)
        b.box(0f, 0.98f, zt1 - 0.05f, w - 1.0f, 0.03f, 0.03f)
        b.box(-(hw - 0.52f), 0.83f, zt1 - 0.05f, 0.03f, 0.3f, 0.03f)
        b.box(hw - 0.52f, 0.83f, zt1 - 0.05f, 0.03f, 0.3f, 0.03f)
        paint(b, 0.9f)
        b.box(0f, 1.06f, (zt0 + zt1) / 2, w - 0.9f, 0.02f, zt1 - zt0 + 0.02f)
        // livery: white roundels with a dark number plate, side stripe
        b.color(0xFFF4F4F4.toInt(), 0f, 0, 0.5f)
        b.diskX(hw + 0.006f, 0.42f, l * 0.02f, 0.17f, 18, true)
        b.diskX(-(hw + 0.006f), 0.42f, l * 0.02f, 0.17f, 18, false)
        b.color(0xFF111111.toInt(), 0f, 0, 0.3f)
        b.box(hw + 0.008f, 0.42f, l * 0.02f, 0.004f, 0.12f, 0.06f)
        b.box(-(hw + 0.008f), 0.42f, l * 0.02f, 0.004f, 0.12f, 0.06f)
        b.color(0xFFFFC21A.toInt(), 0f, 0, 0.5f)
        b.box(-(hw + 0.004f), 0.3f, 0f, 0.008f, 0.04f, l * 0.9f)
        b.box(hw + 0.004f, 0.3f, 0f, 0.008f, 0.04f, l * 0.9f)
        // aero: splitter, canards, skirts, diffuser fins
        b.color(0xFF0B0C0E.toInt(), 0f, 0, 0.5f)
        b.box(0f, 0.245f, -l / 2 + 0.02f, w + 0.06f, 0.025f, 0.36f)
        for (sx in floatArrayOf(-1f, 1f)) {
            b.box(sx * (hw - 0.12f), 0.42f, -l / 2 + 0.12f, 0.2f, 0.015f, 0.12f)
            b.box(sx * (hw + 0.025f), 0.27f, 0f, 0.05f, 0.06f, l * 0.5f)
        }
        for (i in -3..3) b.box(i * 0.2f, 0.3f, l / 2 + 0.02f, 0.02f, 0.12f, 0.26f)
        // swan-neck rear wing
        b.box(0f, 1.14f, l / 2 - 0.16f, w - 0.04f, 0.04f, 0.44f)
        b.box(-(hw - 0.03f), 1.06f, l / 2 - 0.16f, 0.03f, 0.26f, 0.52f)
        b.box(hw - 0.03f, 1.06f, l / 2 - 0.16f, 0.03f, 0.26f, 0.52f)
        b.box(-0.4f, 0.94f, l / 2 - 0.24f, 0.05f, 0.38f, 0.1f)
        b.box(0.4f, 0.94f, l / 2 - 0.24f, 0.05f, 0.38f, 0.1f)
        // lights
        b.color(HEAD, 0f, 1, 1f)
        b.box(-(hw - 0.32f), 0.52f, -l / 2 + 0.22f, 0.42f, 0.06f, 0.14f)
        b.box(hw - 0.32f, 0.52f, -l / 2 + 0.22f, 0.42f, 0.06f, 0.14f)
        b.color(TAIL, 0f, 2, 0.8f)
        b.box(0f, 0.6f, l / 2 - 0.07f, w - 0.3f, 0.05f, 0.06f)
        b.box(-(hw - 0.2f), 0.58f, l / 2 - 0.06f, 0.28f, 0.1f, 0.06f)
        b.box(hw - 0.2f, 0.58f, l / 2 - 0.06f, 0.28f, 0.1f, 0.06f)
        blinkers(b, hw, 0.42f, -l / 2 + 0.08f, 0.5f, l / 2 - 0.04f)
        b.color(CHROME, 0f, 0, 1f)
        b.cylinderZ(-0.15f, 0.34f, l / 2 + 0.03f, 0.065f, 0.12f, 10)
        b.cylinderZ(0.15f, 0.34f, l / 2 + 0.03f, 0.065f, 0.12f, 10)
        mirrors(b, hw - 0.15f, 0.8f, -l * 0.13f)
        archesAndUnder(b, w, l, zs, r, 0.2f)
        return VehicleModel(b.build(), l, w, hw - 0.08f, zs, r,
            floatArrayOf(-(hw - 0.32f), 0.52f, -l / 2 + 0.15f, hw - 0.32f, 0.52f, -l / 2 + 0.15f),
            floatArrayOf(-(hw - 0.2f), 0.58f, l / 2, hw - 0.2f, 0.58f, l / 2),
            floatArrayOf(-0.15f, 0.34f, l / 2 + 0.1f, 0.15f, 0.34f, l / 2 + 0.1f))
    }

    // --------------------------------------------------------------------------------------
    // Traffic vehicles
    // --------------------------------------------------------------------------------------
    private fun sedanBody(b: MeshBuilder, l: Float, w: Float) {
        val hw = w / 2
        paint(b, 0.55f)
        b.box(0f, 0.49f, 0f, w, 0.42f, l - 0.1f)
        b.taper(-hw, hw, -l / 2 + 0.05f, -l * 0.2f, 0.7f, -hw + 0.06f, hw - 0.06f, -l / 2 + 0.2f, -l * 0.2f, 0.8f, bottom = false)
        b.taper(-hw, hw, l * 0.26f, l / 2 - 0.05f, 0.7f, -hw + 0.06f, hw - 0.06f, l * 0.26f, l / 2 - 0.14f, 0.82f, bottom = false)
        b.box(0f, 0.755f, (-l * 0.2f + l * 0.26f) / 2, w, 0.11f, l * 0.46f)
        b.glass()
        b.taper(-hw + 0.08f, hw - 0.08f, -l * 0.2f, l * 0.26f, 0.81f, -hw + 0.2f, hw - 0.2f, -l * 0.2f + 0.55f, l * 0.26f - 0.42f, 1.42f, bottom = false)
        interior(b, hw - 0.08f, -l * 0.2f, l * 0.26f, 0.81f, -l * 0.2f + 0.55f, l * 0.26f - 0.42f, 1.42f, hw)
        paint(b, 0.55f)
        b.box(0f, 1.43f, (-l * 0.2f + 0.55f + l * 0.26f - 0.42f) / 2, w - 0.42f, 0.03f, l * 0.46f - 0.97f + 0.02f)
        b.box(0f, 1.1f, l * 0.03f, w - 0.14f, 0.6f, 0.08f)
        b.color(DARK, 0f, 0, 0.2f)
        b.box(0f, 0.36f, -l / 2 + 0.0f, w - 0.04f, 0.16f, 0.1f)
        b.box(0f, 0.38f, l / 2 - 0.0f, w - 0.04f, 0.16f, 0.1f)
        b.color(0xFF0A0A0A.toInt(), 0f, 0, 0.3f)
        b.box(0f, 0.58f, -l / 2 + 0.02f, w * 0.45f, 0.14f, 0.05f)
        b.color(HEAD, 0f, 1, 1f)
        b.box(-(hw - 0.25f), 0.62f, -l / 2 + 0.04f, 0.36f, 0.12f, 0.06f)
        b.box(hw - 0.25f, 0.62f, -l / 2 + 0.04f, 0.36f, 0.12f, 0.06f)
        b.color(TAIL, 0f, 2, 0.8f)
        b.box(-(hw - 0.22f), 0.68f, l / 2 - 0.04f, 0.38f, 0.12f, 0.06f)
        b.box(hw - 0.22f, 0.68f, l / 2 - 0.04f, 0.38f, 0.12f, 0.06f)
        blinkers(b, hw, 0.5f, -l / 2 + 0.0f, 0.55f, l / 2 + 0.0f)
        mirrors(b, hw, 0.92f, -l * 0.17f)
    }

    fun sedan(): VehicleModel {
        val b = MeshBuilder()
        val l = 4.5f; val w = 1.85f; val r = 0.32f
        val zs = floatArrayOf(-l * 0.31f, l * 0.3f)
        sedanBody(b, l, w)
        archesAndUnder(b, w, l, zs, r, 0.24f)
        return VehicleModel(b.build(), l, w, w / 2 - 0.1f, zs, r,
            floatArrayOf(-(w / 2 - 0.25f), 0.62f, -l / 2, w / 2 - 0.25f, 0.62f, -l / 2),
            floatArrayOf(-(w / 2 - 0.22f), 0.68f, l / 2, w / 2 - 0.22f, 0.68f, l / 2), floatArrayOf())
    }

    fun taxi(): VehicleModel {
        val b = MeshBuilder()
        val l = 4.6f; val w = 1.85f; val r = 0.32f
        val zs = floatArrayOf(-l * 0.31f, l * 0.3f)
        sedanBody(b, l, w)
        b.color(0xFFFFF3C0.toInt(), 0f, 5, 0.3f)
        b.box(0f, 1.53f, 0.05f, 0.62f, 0.16f, 0.26f)
        b.color(0xFF111111.toInt(), 0f, 0, 0.2f)
        for (i in 0 until 6) {
            val z = -0.9f + i * 0.36f
            b.box(-(w / 2 + 0.004f), 0.62f, z, 0.008f, 0.08f, 0.16f)
            b.box(w / 2 + 0.004f, 0.62f, z, 0.008f, 0.08f, 0.16f)
        }
        archesAndUnder(b, w, l, zs, r, 0.24f)
        return VehicleModel(b.build(), l, w, w / 2 - 0.1f, zs, r,
            floatArrayOf(-(w / 2 - 0.25f), 0.62f, -l / 2, w / 2 - 0.25f, 0.62f, -l / 2),
            floatArrayOf(-(w / 2 - 0.22f), 0.68f, l / 2, w / 2 - 0.22f, 0.68f, l / 2), floatArrayOf())
    }

    fun van(): VehicleModel {
        val b = MeshBuilder()
        val l = 5.2f; val w = 2.0f; val hw = w / 2; val r = 0.36f
        val zs = floatArrayOf(-l * 0.31f, l * 0.32f)
        paint(b, 0.45f)
        b.box(0f, 0.62f, 0f, w, 0.6f, l - 0.06f)
        b.box(0f, 1.56f, (-l / 2 + 1.2f + l / 2 - 0.03f) / 2, w, 1.28f, l - 1.23f)
        b.taper(-hw, hw, -l / 2 + 0.03f, -l / 2 + 1.25f, 0.92f, -hw + 0.04f, hw - 0.04f, -l / 2 + 0.3f, -l / 2 + 1.25f, 1.06f, bottom = false)
        b.glass()
        b.taper(-hw + 0.06f, hw - 0.06f, -l / 2 + 0.3f, -l / 2 + 1.24f, 1.06f, -hw + 0.08f, hw - 0.08f, -l / 2 + 1.12f, -l / 2 + 1.24f, 2.12f, bottom = false)
        interior(b, hw - 0.06f, -l / 2 + 0.3f, -l / 2 + 1.24f, 1.06f, -l / 2 + 1.12f, -l / 2 + 1.24f, 2.12f, hw)
        b.box(-(hw + 0.005f), 1.62f, -l / 2 + 1.75f, 0.01f, 0.56f, 0.95f)
        b.box(hw + 0.005f, 1.62f, -l / 2 + 1.75f, 0.01f, 0.56f, 0.95f)
        b.box(0f, 1.7f, l / 2 + 0.0f, w - 0.5f, 0.52f, 0.02f)
        paint(b, 0.45f)
        b.box(0f, 2.18f, -l / 2 + 1.0f, w - 0.06f, 0.08f, 0.5f)
        b.color(0xFF1C1E22.toInt(), 0f, 0, 0.1f)
        b.box(0f, 0.42f, -l / 2 + 0.0f, w + 0.0f, 0.22f, 0.1f)
        b.box(0f, 0.42f, l / 2 - 0.0f, w + 0.0f, 0.22f, 0.1f)
        b.box(0f, 1.2f, l / 2 + 0.003f, 0.012f, 1.5f, 0.006f)
        b.color(HEAD, 0f, 1, 1f)
        b.box(-(hw - 0.22f), 0.8f, -l / 2 + 0.03f, 0.34f, 0.16f, 0.06f)
        b.box(hw - 0.22f, 0.8f, -l / 2 + 0.03f, 0.34f, 0.16f, 0.06f)
        b.color(TAIL, 0f, 2, 0.8f)
        b.box(-(hw - 0.08f), 0.95f, l / 2 - 0.01f, 0.12f, 0.4f, 0.06f)
        b.box(hw - 0.08f, 0.95f, l / 2 - 0.01f, 0.12f, 0.4f, 0.06f)
        blinkers(b, hw, 0.62f, -l / 2 + 0.0f, 0.68f, l / 2 + 0.02f)
        mirrors(b, hw, 1.3f, -l / 2 + 1.3f)
        archesAndUnder(b, w, l, zs, r, 0.28f)
        return VehicleModel(b.build(), l, w, hw - 0.12f, zs, r,
            floatArrayOf(-(hw - 0.22f), 0.8f, -l / 2, hw - 0.22f, 0.8f, -l / 2),
            floatArrayOf(-(hw - 0.08f), 0.95f, l / 2, hw - 0.08f, 0.95f, l / 2), floatArrayOf())
    }

    fun truck(): VehicleModel {
        val b = MeshBuilder()
        val l = 9.6f; val w = 2.5f; val hw = w / 2; val r = 0.5f
        val zs = floatArrayOf(-l / 2 + 1.25f, l / 2 - 2.8f, l / 2 - 1.6f)
        b.color(0xFF202226.toInt(), 0f, 0, 0.2f)
        b.box(0f, 0.78f, 0.2f, 1.3f, 0.32f, l - 0.6f)
        // cab
        paint(b, 0.55f)
        b.box(0f, 1.88f, -l / 2 + 1.2f, w, 2.2f, 2.3f)
        b.taper(-hw + 0.05f, hw - 0.05f, -l / 2 + 0.4f, -l / 2 + 2.3f, 2.98f, -hw + 0.15f, hw - 0.15f, -l / 2 + 1.4f, -l / 2 + 2.3f, 3.5f, bottom = false)
        b.color(GLASS, 0f, 0, 0.9f)
        b.box(0f, 2.36f, -l / 2 + 0.045f, w - 0.3f, 0.86f, 0.02f)
        b.box(-(hw + 0.005f), 2.4f, -l / 2 + 0.9f, 0.01f, 0.7f, 1.0f)
        b.box(hw + 0.005f, 2.4f, -l / 2 + 0.9f, 0.01f, 0.7f, 1.0f)
        b.color(0xFF0E0F11.toInt(), 0f, 0, 0.4f)
        b.box(0f, 1.36f, -l / 2 + 0.04f, 1.5f, 0.78f, 0.02f)
        b.color(CHROME, 0f, 0, 1f)
        for (i in 0 until 5) b.box(0f, 1.06f + i * 0.15f, -l / 2 + 0.03f, 1.5f, 0.03f, 0.02f)
        b.color(0xFF2A2C30.toInt(), 0f, 0, 0.3f)
        b.box(0f, 0.72f, -l / 2 + 0.05f, w, 0.3f, 0.14f)
        b.color(HEAD, 0f, 1, 1f)
        b.box(-(hw - 0.3f), 0.98f, -l / 2 + 0.03f, 0.4f, 0.18f, 0.06f)
        b.box(hw - 0.3f, 0.98f, -l / 2 + 0.03f, 0.4f, 0.18f, 0.06f)
        b.color(0xFFFFB020.toInt(), 0f, 5, 0.4f)
        for (sx in floatArrayOf(-0.5f, -0.25f, 0f, 0.25f, 0.5f)) b.box(sx, 3.0f, -l / 2 + 0.45f, 0.1f, 0.06f, 0.06f)
        // cargo box
        b.color(0xFFE4E7EC.toInt(), 0f, 0, 0.3f)
        val cz0 = -l / 2 + 2.5f
        b.box(0f, 2.22f, (cz0 + l / 2) / 2, w, 2.6f, l / 2 - cz0)
        paint(b, 0.4f)
        b.box(0f, 1.3f, (cz0 + l / 2) / 2, w + 0.02f, 0.3f, l / 2 - cz0 - 0.1f)
        b.color(0xFF8E949C.toInt(), 0f, 0, 0.4f)
        for (i in 0 until 8) {
            val z = cz0 + 0.4f + i * ((l / 2 - cz0 - 0.8f) / 7f)
            b.box(-(hw + 0.006f), 2.22f, z, 0.012f, 2.5f, 0.06f)
            b.box(hw + 0.006f, 2.22f, z, 0.012f, 2.5f, 0.06f)
        }
        b.box(0f, 2.22f, l / 2 + 0.006f, 0.04f, 2.5f, 0.012f)
        b.color(0xFFFF8C1A.toInt(), 0f, 5, 0.3f)
        for (i in 0 until 5) {
            val z = cz0 + 0.5f + i * 1.5f
            b.box(-(hw + 0.01f), 0.98f, z, 0.02f, 0.06f, 0.1f)
            b.box(hw + 0.01f, 0.98f, z, 0.02f, 0.06f, 0.1f)
        }
        b.color(TAIL, 0f, 2, 0.8f)
        b.box(-(hw - 0.3f), 0.95f, l / 2 + 0.02f, 0.4f, 0.14f, 0.05f)
        b.box(hw - 0.3f, 0.95f, l / 2 + 0.02f, 0.4f, 0.14f, 0.05f)
        b.color(0xFF2A2C30.toInt(), 0f, 0, 0.3f)
        b.box(0f, 0.6f, l / 2 - 0.05f, w - 0.2f, 0.12f, 0.12f)
        blinkers(b, hw, 0.98f, -l / 2 + 0.02f, 0.95f, l / 2 + 0.02f)
        mirrors(b, hw + 0.05f, 2.3f, -l / 2 + 0.4f)
        archesAndUnder(b, w, l, floatArrayOf(), r, 0.55f)
        return VehicleModel(b.build(), l, w, hw - 0.2f, zs, r,
            floatArrayOf(-(hw - 0.3f), 0.98f, -l / 2, hw - 0.3f, 0.98f, -l / 2),
            floatArrayOf(-(hw - 0.3f), 0.95f, l / 2, hw - 0.3f, 0.95f, l / 2), floatArrayOf())
    }

    fun bus(): VehicleModel {
        val b = MeshBuilder()
        val l = 11.6f; val w = 2.55f; val hw = w / 2; val r = 0.5f
        val zs = floatArrayOf(-l / 2 + 2.5f, l / 2 - 2.9f)
        paint(b, 0.5f)
        b.box(0f, 1.78f, 0f, w, 2.86f, l)
        b.box(0f, 3.28f, 0.6f, 1.6f, 0.2f, 2.6f)
        b.color(0xFFF0F0F0.toInt(), 0f, 0, 0.4f)
        b.box(0f, 1.05f, 0f, w + 0.012f, 0.18f, l - 0.2f)
        // lit passenger windows
        b.color(0xFF3A3424.toInt(), 0f, 1, 0.9f)
        b.box(-(hw + 0.006f), 2.3f, 0.7f, 0.012f, 0.95f, l - 2.8f)
        b.box(hw + 0.006f, 2.3f, 0.7f, 0.012f, 0.95f, l - 2.8f)
        b.color(GLASS, 0f, 0, 0.9f)
        b.box(0f, 2.15f, -l / 2 - 0.006f, w - 0.2f, 1.7f, 0.012f)
        b.box(0f, 2.3f, l / 2 + 0.006f, w - 0.5f, 0.8f, 0.012f)
        b.box(hw + 0.008f, 1.7f, -l / 2 + 1.2f, 0.012f, 2.2f, 1.1f)
        b.color(0xFFFFB800.toInt(), 0f, 5, 0.2f)
        b.box(0f, 3.04f, -l / 2 - 0.01f, w - 0.6f, 0.24f, 0.012f)
        b.color(0xFF1C1E22.toInt(), 0f, 0, 0.2f)
        b.box(0f, 0.5f, -l / 2 - 0.02f, w, 0.32f, 0.1f)
        b.box(0f, 0.5f, l / 2 + 0.02f, w, 0.32f, 0.1f)
        b.color(HEAD, 0f, 1, 1f)
        b.box(-(hw - 0.3f), 0.85f, -l / 2 - 0.02f, 0.42f, 0.18f, 0.05f)
        b.box(hw - 0.3f, 0.85f, -l / 2 - 0.02f, 0.42f, 0.18f, 0.05f)
        b.color(TAIL, 0f, 2, 0.8f)
        b.box(-(hw - 0.15f), 1.0f, l / 2 + 0.02f, 0.2f, 0.5f, 0.05f)
        b.box(hw - 0.15f, 1.0f, l / 2 + 0.02f, 0.2f, 0.5f, 0.05f)
        blinkers(b, hw, 0.62f, -l / 2 - 0.02f, 1.35f, l / 2 + 0.02f)
        mirrors(b, hw + 0.1f, 2.4f, -l / 2 + 0.2f)
        archesAndUnder(b, w, l, zs, r, 0.32f)
        return VehicleModel(b.build(), l, w, hw - 0.22f, zs, r,
            floatArrayOf(-(hw - 0.3f), 0.85f, -l / 2, hw - 0.3f, 0.85f, -l / 2),
            floatArrayOf(-(hw - 0.15f), 1.0f, l / 2, hw - 0.15f, 1.0f, l / 2), floatArrayOf())
    }

    // --------------------------------------------------------------------------------------
    // Wheel (radius 1, width 0.7, detailed rim on +X side)
    // --------------------------------------------------------------------------------------
    /**
     * Wheel with rim [style]: 0 sport 10-spoke, 1 turbine (16 thin curved spokes), 2 deep-dish
     * classic (wide polished lip, 5 broad spokes). Rim face parts carry paint mask 1, so the
     * instance tint sets the rim colour (white = original metal colours).
     */
    fun wheel(style: Int = 0): Mesh {
        val b = MeshBuilder()
        b.color(0xFF18181A.toInt(), 0f, 0, 0.05f)
        b.cylinderX(0f, 0f, 0f, 0.96f, 0.7f, 26, capNeg = true, capPos = false)
        // tread: two rows of staggered blocks with a centre groove, plus shoulder blocks
        b.color(0xFF1C1C1F.toInt(), 0f, 0, 0.04f)
        val blocks = 26
        val step = (Math.PI * 2 / blocks).toFloat()
        for (i in 0 until blocks) {
            val a0 = i * step + step * 0.08f
            val a1 = (i + 1) * step - step * 0.08f
            val off = if (i % 2 == 0) 0f else step * 0.25f
            treadBlock(b, a0 + off, a1 + off - step * 0.2f, -0.33f, -0.04f, 0.96f, 1.0f)
            treadBlock(b, a0 - off + step * 0.2f, a1 - off, 0.04f, 0.33f, 0.96f, 1.0f)
        }
        // sidewall + rim lip
        b.color(0xFF232327.toInt(), 0f, 0, 0.08f)
        b.ringX(0.35f, 0f, 0f, 0.7f, 0.97f, 26, true)
        b.color(0xFF34353A.toInt(), 0f, 0, 0.1f)
        b.ringX(0.351f, 0f, 0f, 0.86f, 0.88f, 26, true)
        b.color(CHROME, 0f, 0, 1f)
        b.ringX(0.352f, 0f, 0f, 0.62f, 0.7f, 26, true)
        // brake disc (ventilated look: dark hat + drilled ring) visible between the spokes
        b.color(0xFF2A2C31.toInt(), 0f, 0, 0.2f)
        b.diskX(0.12f, 0f, 0f, 0.62f, 22, true)
        b.color(0xFF9A9EA6.toInt(), 0f, 0, 0.7f)
        b.ringX(0.14f, 0f, 0f, 0.26f, 0.56f, 22, true)
        b.color(0xFF3A3C42.toInt(), 0f, 0, 0.3f)
        for (i in 0 until 10) {
            val a = i * 0.6283f
            b.box(0.142f, cos(a) * 0.42f, sin(a) * 0.42f, 0.004f, 0.04f, 0.04f)
        }
        b.color(0xFF5B5F68.toInt(), 0f, 0, 0.5f)
        b.diskX(0.15f, 0f, 0f, 0.24f, 14, true)
        // rim barrel
        b.color(0xFF25282E.toInt(), 0f, 0, 0.3f)
        b.ringX(0.29f, 0f, 0f, 0.6f, 0.63f, 26, true)
        when (style) {
            1 -> {
                // turbine: 16 thin spokes with a twist, small hub
                b.color(0xFF7E838C.toInt(), 1f, 0, 0.6f)
                b.ringX(0.3f, 0f, 0f, 0.16f, 0.24f, 18, true)
                b.color(0xFFD0D5DD.toInt(), 1f, 0, 1f)
                for (i in 0 until 16) {
                    val a = i * (Math.PI.toFloat() / 8f)
                    b.spokeX(0.34f, 0f, 0f, a, 0.14f, 0.36f, 0.03f, 0.028f)
                    b.spokeX(0.341f, 0f, 0f, a + 0.09f, 0.34f, 0.62f, 0.028f, 0.022f)
                }
                b.ringX(0.342f, 0f, 0f, 0.33f, 0.37f, 24, true)
                b.diskX(0.345f, 0f, 0f, 0.12f, 12, true)
            }
            2 -> {
                // deep dish: polished wide lip, recessed 5 broad spokes, riveted lip ring
                b.color(CHROME, 0f, 0, 1f)
                b.ringX(0.355f, 0f, 0f, 0.5f, 0.64f, 26, true)
                b.color(0xFF3A3D44.toInt(), 0f, 0, 0.6f)
                for (i in 0 until 16) {
                    val a = i * (Math.PI.toFloat() / 8f)
                    b.box(0.358f, cos(a) * 0.57f, sin(a) * 0.57f, 0.008f, 0.022f, 0.022f)
                }
                b.color(0xFFC9CED6.toInt(), 1f, 0, 0.9f)
                for (i in 0 until 5) {
                    val a = (i * 72f) * (Math.PI / 180f).toFloat()
                    b.spokeX(0.25f, 0f, 0f, a, 0.12f, 0.5f, 0.13f, 0.16f)
                }
                b.ringX(0.252f, 0f, 0f, 0.46f, 0.5f, 22, true)
                b.diskX(0.255f, 0f, 0f, 0.15f, 12, true)
            }
            else -> {
                // sport: ten-spoke face (5 split spokes), centre cap
                b.color(0xFF7E838C.toInt(), 1f, 0, 0.6f)
                b.ringX(0.3f, 0f, 0f, 0.18f, 0.3f, 18, true)
                b.color(0xFFD9DEE6.toInt(), 1f, 0, 1f)
                for (i in 0 until 5) {
                    val a = (i * 72f) * (Math.PI / 180f).toFloat()
                    b.spokeX(0.34f, 0f, 0f, a - 0.11f, 0.12f, 0.63f, 0.06f, 0.035f)
                    b.spokeX(0.34f, 0f, 0f, a + 0.11f, 0.12f, 0.63f, 0.06f, 0.035f)
                }
                b.color(0xFF9EA3AB.toInt(), 0f, 0, 0.9f)
                for (i in 0 until 5) {
                    val a = (i * 72f + 36f) * (Math.PI / 180f).toFloat()
                    b.box(0.345f, cos(a) * 0.15f, sin(a) * 0.15f, 0.01f, 0.035f, 0.035f)
                }
                b.color(0xFFD9DEE6.toInt(), 1f, 0, 1f)
                b.diskX(0.345f, 0f, 0f, 0.11f, 12, true)
            }
        }
        b.color(0xFFC81E28.toInt(), 0f, 0, 0.5f)
        b.diskX(0.347f, 0f, 0f, 0.05f, 10, true)
        return b.build()
    }

    /** One tread block on the tyre surface between angles a0..a1, x0..x1, radius r0..r1. */
    private fun treadBlock(b: MeshBuilder, a0: Float, a1: Float, x0: Float, x1: Float, r0: Float, r1: Float) {
        val c0 = cos(a0); val s0 = sin(a0); val c1 = cos(a1); val s1 = sin(a1)
        val cm = cos((a0 + a1) / 2); val sm = sin((a0 + a1) / 2)
        // outer face
        b.quad(x0, c0 * r1, s0 * r1, x1, c0 * r1, s0 * r1, x1, c1 * r1, s1 * r1, x0, c1 * r1, s1 * r1, 0f, cm, sm)
        // leading / trailing faces
        b.quad(x0, c0 * r0, s0 * r0, x1, c0 * r0, s0 * r0, x1, c0 * r1, s0 * r1, x0, c0 * r1, s0 * r1, 0f, s0, -c0)
        b.quad(x0, c1 * r0, s1 * r0, x1, c1 * r0, s1 * r0, x1, c1 * r1, s1 * r1, x0, c1 * r1, s1 * r1, 0f, -s1, c1)
        // side faces
        b.quad(x0, c0 * r0, s0 * r0, x0, c1 * r0, s1 * r0, x0, c1 * r1, s1 * r1, x0, c0 * r1, s0 * r1, -1f, 0f, 0f)
        b.quad(x1, c0 * r0, s0 * r0, x1, c1 * r0, s1 * r0, x1, c1 * r1, s1 * r1, x1, c0 * r1, s0 * r1, 1f, 0f, 0f)
    }

    /**
     * Brake caliper in wheel space (radius 1 units), drawn with the wheel transform but without
     * the wheel spin. Painted part follows the instance tint.
     */
    fun caliper(): Mesh {
        val b = MeshBuilder()
        b.color(WHITE, 1f, 0, 0.6f)
        // sits over the top-rear of the disc
        for (k in 0 until 4) {
            val a = 0.95f + k * 0.17f
            b.box(0.19f, sin(a) * 0.46f, cos(a) * 0.46f, 0.12f, 0.16f, 0.16f)
        }
        b.color(0xFFE8E8E8.toInt(), 0f, 0, 0.4f)
        b.box(0.252f, sin(1.2f) * 0.46f, cos(1.2f) * 0.46f, 0.004f, 0.06f, 0.2f)
        return b.build()
    }

    /**
     * Aftermarket spoiler in mount space: origin = rear deck centre, +Z = rearwards, unit width
     * (scaled by the car width). kind 1 ducktail lip, 2 GT wing (painted), 3 GT wing (carbon).
     */
    fun spoiler(kind: Int): Mesh {
        val b = MeshBuilder()
        if (kind == 1) {
            paint(b)
            b.taper(-0.46f, 0.46f, -0.12f, 0.2f, 0f, -0.44f, 0.44f, 0.08f, 0.22f, 0.07f, bottom = false)
            b.box(0f, 0.035f, 0.21f, 0.88f, 0.07f, 0.03f)
        } else {
            // swan-neck uprights + end plates + main plane + gurney flap
            b.color(0xFF1B1C20.toInt(), 0f, 0, 0.5f)
            b.box(-0.3f, 0.16f, 0.06f, 0.035f, 0.32f, 0.16f)
            b.box(0.3f, 0.16f, 0.06f, 0.035f, 0.32f, 0.16f)
            if (kind == 3) b.color(0xFF1E2024.toInt(), 0f, 0, 0.85f) else paint(b)
            b.taper(-0.52f, 0.52f, -0.08f, 0.24f, 0.33f, -0.52f, 0.52f, -0.04f, 0.24f, 0.375f, bottom = true)
            b.color(0xFF141518.toInt(), 0f, 0, 0.4f)
            b.box(0f, 0.385f, 0.235f, 1.04f, 0.035f, 0.012f)
            b.box(-0.525f, 0.33f, 0.08f, 0.012f, 0.16f, 0.36f)
            b.box(0.525f, 0.33f, 0.08f, 0.012f, 0.16f, 0.36f)
        }
        return b.build()
    }

    fun coin(): Mesh {
        val b = MeshBuilder()
        b.color(0xFFFFC21A.toInt(), 0f, 0, 1f)
        b.cylinderZ(0f, 0f, 0f, 0.45f, 0.08f, 20)
        b.color(0xFFFFE27A.toInt(), 0f, 0, 1f)
        b.cylinderZ(0f, 0f, 0f, 0.3f, 0.11f, 16)
        return b.build()
    }

    // --------------------------------------------------------------------------------------
    // Scenery
    // --------------------------------------------------------------------------------------
    /** Street light with the arm pointing towards +X. */
    fun streetLamp(): Mesh {
        val b = MeshBuilder()
        b.color(0xFF9AA0A8.toInt(), 0f, 0, 0.3f)
        b.box(0f, 0.4f, 0f, 0.42f, 0.8f, 0.42f)
        b.color(0xFF7C838C.toInt(), 0f, 0, 0.6f)
        b.cylinderY(0f, 0.8f, 0f, 0.12f, 0.08f, 7.8f, 8)
        b.box(1.3f, 8.45f, 0f, 2.6f, 0.12f, 0.14f)
        b.color(0xFF2B2E33.toInt(), 0f, 0, 0.4f)
        b.box(2.65f, 8.35f, 0f, 0.95f, 0.2f, 0.42f)
        b.color(0xFFFFE0A6.toInt(), 0f, 1, 0f)
        b.box(2.65f, 8.235f, 0f, 0.75f, 0.04f, 0.3f)
        return b.build()
    }

    /** 20 m guardrail section; the rail faces +X. */
    fun guardrail(): Mesh {
        val b = MeshBuilder()
        b.color(0xFF5D636B.toInt(), 0f, 0, 0.3f)
        for (i in 0 until 5) b.box(0f, 0.42f, -10f + i * 4f + 2f, 0.12f, 0.84f, 0.12f)
        b.color(0xFFC3C9D1.toInt(), 0f, 0, 0.85f)
        b.box(0.1f, 0.68f, 0f, 0.06f, 0.3f, 20.02f)
        b.box(0.1f, 0.88f, 0f, 0.05f, 0.06f, 20.02f)
        b.color(0xFFFFFFFF.toInt(), 0f, 1, 0.2f)
        b.box(0.135f, 0.68f, 0f, 0.01f, 0.06f, 0.16f)
        return b.build()
    }

    fun building(): Mesh {
        val b = MeshBuilder()
        b.color(WHITE, 1f, 0, 0.15f)
        b.box(0f, 0.5f, 0f, 1f, 1f, 1f, topUv = false)
        return b.build()
    }

    fun pine(snowy: Boolean): Mesh {
        val b = MeshBuilder()
        b.color(0xFF5A3B22.toInt(), 0f, 0, 0.05f)
        b.cylinderY(0f, 0f, 0f, 0.25f, 0.18f, 1.6f, 6)
        val c1 = if (snowy) 0xFF2E5A44.toInt() else 0xFF1E5A2E.toInt()
        val c2 = if (snowy) 0xFF35664C.toInt() else 0xFF246B35.toInt()
        val c3 = if (snowy) 0xFF3B7054.toInt() else 0xFF2D7B3F.toInt()
        b.color(c1, 0f, 0, 0.05f); b.cylinderY(0f, 1.2f, 0f, 1.9f, 0f, 3.0f, 8, false)
        b.color(c2, 0f, 0, 0.05f); b.cylinderY(0f, 2.6f, 0f, 1.5f, 0f, 2.6f, 8, false)
        b.color(c3, 0f, 0, 0.05f); b.cylinderY(0f, 3.9f, 0f, 1.05f, 0f, 2.2f, 8, false)
        if (snowy) {
            b.color(0xFFF4F8FF.toInt(), 0f, 0, 0.2f)
            b.cylinderY(0f, 2.9f, 0f, 1.05f, 0f, 1.32f, 8, false)
            b.cylinderY(0f, 4.15f, 0f, 0.78f, 0f, 1.06f, 8, false)
            b.cylinderY(0f, 5.2f, 0f, 0.5f, 0f, 0.92f, 8, false)
        }
        return b.build()
    }

    fun broadleaf(): Mesh {
        val b = MeshBuilder()
        b.color(0xFF6A4A2C.toInt(), 0f, 0, 0.05f)
        b.cylinderY(0f, 0f, 0f, 0.24f, 0.16f, 2.4f, 6)
        b.color(0xFF3C8A3A.toInt(), 0f, 0, 0.05f)
        b.blob(0f, 3.3f, 0f, 1.8f, 1.5f, 1.8f, 4, 7, 0.18f, 3)
        b.color(0xFF4D9C42.toInt(), 0f, 0, 0.05f)
        b.blob(0.8f, 2.7f, 0.4f, 1.2f, 1.0f, 1.2f, 3, 6, 0.2f, 7)
        b.color(0xFF347A33.toInt(), 0f, 0, 0.05f)
        b.blob(-0.7f, 2.9f, -0.3f, 1.1f, 1.0f, 1.1f, 3, 6, 0.2f, 11)
        return b.build()
    }

    fun bush(): Mesh {
        val b = MeshBuilder()
        b.color(WHITE, 1f, 0, 0.05f)
        b.blob(0f, 0.45f, 0f, 1.0f, 0.7f, 1.0f, 3, 6, 0.22f, 5)
        b.blob(0.6f, 0.35f, 0.3f, 0.6f, 0.5f, 0.6f, 3, 5, 0.2f, 9)
        return b.build()
    }

    fun cactus(): Mesh {
        val b = MeshBuilder()
        b.color(0xFF4E8A3B.toInt(), 0f, 0, 0.1f)
        b.cylinderY(0f, 0f, 0f, 0.32f, 0.27f, 3.4f, 8)
        b.box(0.5f, 1.5f, 0f, 0.65f, 0.28f, 0.28f)
        b.cylinderY(0.78f, 1.4f, 0f, 0.22f, 0.19f, 1.25f, 7)
        b.box(-0.45f, 2.0f, 0f, 0.55f, 0.26f, 0.26f)
        b.cylinderY(-0.68f, 1.9f, 0f, 0.2f, 0.17f, 0.95f, 7)
        return b.build()
    }

    fun rock(): Mesh {
        val b = MeshBuilder()
        b.color(WHITE, 1f, 0, 0.1f)
        b.blob(0f, 0.35f, 0f, 1.4f, 0.95f, 1.1f, 3, 6, 0.3f, 21)
        return b.build()
    }

    // Atlas layout (see Textures.atlas): green sign, blue sign, billboard, checkpoint banner.
    private const val WU = 0.9f
    private const val WV = 0.95f

    /** Roadside guide sign facing +Z (towards approaching drivers). */
    fun roadSign(variant: Int): Mesh {
        val b = MeshBuilder()
        b.color(0xFF8A9098.toInt(), 0f, 0, 0.4f).uvFixed(WU, WV)
        b.box(-1.9f, 2.4f, 0f, 0.16f, 4.8f, 0.16f)
        b.box(1.9f, 2.4f, 0f, 0.16f, 4.8f, 0.16f)
        b.color(0xFF3A3F46.toInt(), 0f, 0, 0.2f)
        b.box(0f, 4.6f, -0.02f, 4.8f, 2.3f, 0.1f)
        b.uvFree().color(WHITE, 0f, 0, 0.25f)
        val u0 = if (variant == 0) 0f else 0.5f
        b.quad(-2.4f, 3.45f, 0.035f, 2.4f, 3.45f, 0.035f, 2.4f, 5.75f, 0.035f, -2.4f, 5.75f, 0.035f, 0f, 0f, 1f,
            u0 + 0.004f, 0.008f, u0 + 0.496f, 0.492f)
        return b.build()
    }

    fun billboard(): Mesh {
        val b = MeshBuilder()
        b.color(0xFF6E747C.toInt(), 0f, 0, 0.4f).uvFixed(WU, WV)
        b.box(-3.5f, 3.5f, 0.2f, 0.35f, 7f, 0.35f)
        b.box(3.5f, 3.5f, 0.2f, 0.35f, 7f, 0.35f)
        b.color(0xFF22252B.toInt(), 0f, 0, 0.2f)
        b.box(0f, 8.6f, 0f, 12.4f, 4.2f, 0.3f)
        b.color(0xFFFFE6B0.toInt(), 0f, 1, 0.2f)
        b.box(0f, 10.85f, 0.5f, 10f, 0.08f, 0.15f)
        b.uvFree().color(WHITE, 0f, 0, 0.2f)
        b.quad(-6f, 6.7f, 0.16f, 6f, 6.7f, 0.16f, 6f, 10.5f, 0.16f, -6f, 10.5f, 0.16f, 0f, 0f, 1f,
            0.002f, 0.502f, 0.998f, 0.873f)
        return b.build()
    }

    /** Time attack checkpoint gantry spanning the road. */
    fun checkpoint(): Mesh {
        val b = MeshBuilder()
        b.color(0xFF2A2E36.toInt(), 0f, 0, 0.5f).uvFixed(WU, WV)
        b.box(-9.6f, 3.6f, 0f, 0.7f, 7.2f, 0.7f)
        b.box(9.6f, 3.6f, 0f, 0.7f, 7.2f, 0.7f)
        b.box(0f, 7.0f, 0f, 20f, 1.6f, 0.6f)
        b.color(0xFF00E5FF.toInt(), 0f, 5, 0.2f)
        b.box(-9.6f, 3.6f, 0.36f, 0.12f, 7.0f, 0.04f)
        b.box(9.6f, 3.6f, 0.36f, 0.12f, 7.0f, 0.04f)
        b.color(0xFFFF2D95.toInt(), 0f, 5, 0.2f)
        b.box(0f, 6.15f, 0.32f, 19f, 0.1f, 0.04f)
        b.box(0f, 7.85f, 0.32f, 19f, 0.1f, 0.04f)
        b.uvFree().color(WHITE, 0f, 0, 0.2f)
        b.quad(-7f, 6.3f, 0.31f, 7f, 6.3f, 0.31f, 7f, 7.7f, 0.31f, -7f, 7.7f, 0.31f, 0f, 0f, 1f,
            0.002f, 0.877f, 0.498f, 0.998f)
        return b.build()
    }



    /** Slanted ceiling slab from the wall top (xw, yw) to (xi, yt), full length [len] along Z. */
    private fun MeshBuilder.taperSlab(xw: Float, yw: Float, xi: Float, yt: Float, len: Float) {
        val h = len / 2f
        val sd = if (xw > xi) 1f else -1f
        quad(xw, yw, -h, xi, yt, -h, xi, yt, h, xw, yw, h, -sd, -1f, 0f)
        quad(xw, yw + 0.8f, -h, xi, yt + 0.8f, -h, xi, yt + 0.8f, h, xw, yw + 0.8f, h, sd, 1f, 0f)
    }

    /** Diagonal beam in the YZ plane at x, from (y0, z0) to (y1, z1), thickness t. */
    private fun MeshBuilder.slantZ(x: Float, y0: Float, z0: Float, y1: Float, z1: Float, t: Float) {
        val dy = y1 - y0; val dz = z1 - z0
        val l = kotlin.math.sqrt(dy * dy + dz * dz)
        val py = -dz / l * t / 2f; val pz = dy / l * t / 2f
        for (sx in floatArrayOf(-1f, 1f)) {
            val xx = x + sx * t / 2f
            quad(xx, y0 + py, z0 + pz, xx, y1 + py, z1 + pz, xx, y1 - py, z1 - pz, xx, y0 - py, z0 - pz, sx, 0f, 0f)
        }
        quad(x - t / 2f, y0 + py, z0 + pz, x + t / 2f, y0 + py, z0 + pz, x + t / 2f, y1 + py, z1 + pz, x - t / 2f, y1 + py, z1 + pz, 0f, py, pz)
        quad(x - t / 2f, y0 - py, z0 - pz, x + t / 2f, y0 - py, z0 - pz, x + t / 2f, y1 - py, z1 - pz, x - t / 2f, y1 - py, z1 - pz, 0f, -py, -pz)
    }

    /** Gable roof over a box of size sx × sz at height y. */
    private fun MeshBuilder.taperRoof(cx: Float, y: Float, cz: Float, sx: Float, h: Float, sz: Float) {
        taper(cx - sx / 2f, cx + sx / 2f, cz - sz / 2f, cz + sz / 2f, y, cx - 0.01f, cx + 0.01f, cz - sz / 2f, cz + sz / 2f, y + h)
    }

    // ------------------------------------------------------------------ v2 landmarks
    /** 20 m tunnel tube section over the road (centred on z = 0). Walls face the road. */
    fun tunnelSection(): Mesh {
        val b = MeshBuilder()
        val hw = 9.6f
        b.color(0xFF8E8C86.toInt(), 0f, 0, 0.12f)
        b.box(-hw - 0.6f, 3.2f, 0f, 1.2f, 6.4f, 20.02f)
        b.box(hw + 0.6f, 3.2f, 0f, 1.2f, 6.4f, 20.02f)
        // vaulted ceiling: three slanted slabs
        b.box(0f, 8.1f, 0f, 12f, 0.8f, 20.02f)
        b.color(0xFF7A7872.toInt(), 0f, 0, 0.1f)
        b.taperSlab(-hw, 6.4f, -6f, 7.7f, 20.02f)
        b.taperSlab(hw, 6.4f, 6f, 7.7f, 20.02f)
        // white tiled lower band and kerbs
        b.color(0xFFDADCD8.toInt(), 0f, 0, 0.45f)
        b.box(-hw + 0.02f, 1.1f, 0f, 0.06f, 2.2f, 20.02f)
        b.box(hw - 0.02f, 1.1f, 0f, 0.06f, 2.2f, 20.02f)
        b.color(0xFF505256.toInt(), 0f, 0, 0.1f)
        b.box(-hw + 0.4f, 0.15f, 0f, 0.8f, 0.3f, 20.02f)
        b.box(hw - 0.4f, 0.15f, 0f, 0.8f, 0.3f, 20.02f)
        // sodium lamp strips (always lit) + emergency signs
        b.color(0xFFFFC27A.toInt(), 0f, 5, 0f)
        for (k in 0 until 4) {
            val z = -7.5f + k * 5f
            b.box(-hw + 0.08f, 5.9f, z, 0.1f, 0.18f, 2.2f)
            b.box(hw - 0.08f, 5.9f, z, 0.1f, 0.18f, 2.2f)
        }
        b.color(0xFF19C46A.toInt(), 0f, 5, 0f)
        b.box(-hw + 0.06f, 2.6f, 4f, 0.05f, 0.35f, 0.7f)
        return b.build()
    }

    /** Tunnel portal facade with the hillside around it; the opening faces +Z. */
    fun tunnelPortal(): Mesh {
        val b = MeshBuilder()
        b.color(0xFF6F6D68.toInt(), 0f, 0, 0.12f)
        b.box(-15.6f, 6f, 0f, 12f, 12f, 1.6f)
        b.box(15.6f, 6f, 0f, 12f, 12f, 1.6f)
        b.box(0f, 10.4f, 0f, 19.2f, 3.2f, 1.6f)
        b.color(0xFFF2C230.toInt(), 0f, 0, 0.2f)
        b.box(0f, 8.62f, 0.82f, 19.2f, 0.36f, 0.05f)
        b.color(0xFF3A5A34.toInt(), 0f, 0, 0.05f)
        // hill mass over and around the portal
        b.blob(0f, 17f, -10f, 34f, 8f, 14f, 6, 12, 0.18f, 11)
        b.blob(-30f, 6f, -6f, 16f, 10f, 12f, 5, 10, 0.2f, 12)
        b.blob(30f, 6f, -6f, 16f, 10f, 12f, 5, 10, 0.2f, 13)
        return b.build()
    }

    /** 20 m bridge deck section: parapets, steel truss and piers down to the water. */
    fun bridgeSection(): Mesh {
        val b = MeshBuilder()
        val hw = 9.4f
        b.color(0xFFB9B6AE.toInt(), 0f, 0, 0.2f)
        b.box(-hw, 0.55f, 0f, 0.5f, 1.1f, 20.02f)
        b.box(hw, 0.55f, 0f, 0.5f, 1.1f, 20.02f)
        b.color(0xFF77746D.toInt(), 0f, 0, 0.1f)
        b.box(0f, -1.0f, 0f, 2f * hw + 1f, 2.0f, 20.02f)
        // truss: verticals and diagonals in painted steel
        b.color(0xFFB8322A.toInt(), 0f, 0, 0.55f)
        for (sd in intArrayOf(-1, 1)) {
            val x = sd * (hw + 0.6f)
            b.box(x, 3.6f, -10f, 0.45f, 7.2f, 0.45f)
            b.box(x, 7.2f, 0f, 0.5f, 0.5f, 20.02f)
            b.slantZ(x, 0.4f, -10f, 7.2f, 10f, 0.35f)
        }
        b.box(0f, 7.2f, -10f, 2f * hw + 1.6f, 0.4f, 0.4f)
        // pier
        b.color(0xFF8C8A84.toInt(), 0f, 0, 0.1f)
        b.box(0f, -9f, -10f, 6f, 16f, 3f)
        return b.build()
    }

    /** Big still water plane under bridges and along the coast. */
    fun water(): Mesh {
        val b = MeshBuilder()
        b.color(0xFF1C4A66.toInt(), 0f, 0, 0.95f)
        // unit width along +X (scaled per instance), 400 m along Z, gridded for depth precision
        var z = -200f
        while (z < 200f) {
            var x = 0f
            while (x < 1f) {
                b.planeY(x, z, x + 0.125f, z + 50f, 0f)
                x += 0.125f
            }
            z += 50f
        }
        return b.build()
    }

    /** Gas station: canopy over pumps, shop with lit windows and a price pylon. Road on -X side. */
    fun gasStation(): Mesh {
        val b = MeshBuilder()
        b.color(0xFF34373D.toInt(), 0f, 0, 0.3f)
        b.planeY(-6f, -22f, 22f, 22f, 0.012f)
        b.color(0xFFE8E8EA.toInt(), 0f, 0, 0.4f)
        for (px in floatArrayOf(-1f, 9f)) for (pz in floatArrayOf(-7f, 7f)) b.box(px, 2.7f, pz, 0.45f, 5.4f, 0.45f)
        b.color(0xFFD62828.toInt(), 0f, 0, 0.5f)
        b.box(4f, 5.75f, 0f, 13f, 0.7f, 18f)
        b.color(0xFFFFFFFF.toInt(), 0f, 5, 0f)
        b.box(4f, 5.38f, 0f, 11f, 0.04f, 15f)
        b.color(0xFF2A2D33.toInt(), 0f, 0, 0.3f)
        for (pz in floatArrayOf(-4f, 4f)) {
            b.box(4f, 0.12f, pz, 1.4f, 0.24f, 3.4f)
            b.box(4f, 1.0f, pz - 0.8f, 0.6f, 1.6f, 0.7f)
            b.box(4f, 1.0f, pz + 0.8f, 0.6f, 1.6f, 0.7f)
        }
        b.color(0xFF35E07A.toInt(), 0f, 5, 0f)
        for (pz in floatArrayOf(-4.8f, -3.2f, 3.2f, 4.8f)) b.box(3.68f, 1.4f, pz, 0.02f, 0.3f, 0.4f)
        // shop
        b.color(0xFFD8D2C4.toInt(), 0f, 0, 0.1f)
        b.box(16f, 2.2f, 0f, 9f, 4.4f, 14f)
        b.color(0xFFFFE2A8.toInt(), 0f, 1, 0.6f)
        b.box(11.47f, 1.6f, 0f, 0.05f, 2.2f, 10f)
        b.color(0xFFD62828.toInt(), 0f, 0, 0.4f)
        b.box(16f, 4.6f, 0f, 9.2f, 0.4f, 14.2f)
        // pylon
        b.color(0xFF2A2D33.toInt(), 0f, 0, 0.3f)
        b.box(-4f, 4f, -14f, 0.5f, 8f, 0.5f)
        b.color(0xFFD62828.toInt(), 0f, 1, 0.3f)
        b.box(-4f, 8.4f, -14f, 2.6f, 2.4f, 0.5f)
        b.color(0xFFFFF4DA.toInt(), 0f, 5, 0f)
        b.box(-4f, 7.6f, -13.73f, 2.0f, 0.5f, 0.02f)
        return b.build()
    }

    /** Open-air parking lot with markings and lamp posts. Road on -X side. */
    fun parkingLot(): Mesh {
        val b = MeshBuilder()
        b.color(0xFF2C2E33.toInt(), 0f, 0, 0.25f)
        b.planeY(-3f, -28f, 30f, 28f, 0.012f)
        b.color(0xFFE8E8E8.toInt(), 0f, 0, 0.2f)
        for (k in 0..9) {
            val z = -25f + k * 5.5f
            b.box(9f, 0.02f, z, 6f, 0.02f, 0.14f)
            b.box(21f, 0.02f, z, 6f, 0.02f, 0.14f)
        }
        b.box(15f, 0.02f, 0f, 0.14f, 0.02f, 50f)
        b.color(0xFF5A6068.toInt(), 0f, 0, 0.3f)
        for (pz in floatArrayOf(-20f, 0f, 20f)) {
            b.box(15f, 3.5f, pz, 0.25f, 7f, 0.25f)
            b.box(15f, 7f, pz, 3.4f, 0.2f, 0.4f)
        }
        b.color(0xFFFFE0A6.toInt(), 0f, 1, 0f)
        for (pz in floatArrayOf(-20f, 0f, 20f)) b.box(15f, 6.88f, pz, 3f, 0.04f, 0.3f)
        // kerb island trees planters
        b.color(0xFF8A8A84.toInt(), 0f, 0, 0.1f)
        b.box(27.5f, 0.2f, 0f, 1f, 0.4f, 50f)
        return b.build()
    }

    /** Car dealership: glass showroom, logo tower and a forecourt. Road on -X side. */
    fun dealership(): Mesh {
        val b = MeshBuilder()
        b.color(0xFF505358.toInt(), 0f, 0, 0.5f)
        b.planeY(-4f, -24f, 32f, 24f, 0.012f)
        b.color(0xFFE6E8EC.toInt(), 0f, 0, 0.5f)
        b.box(22f, 6.6f, 0f, 18f, 0.6f, 30f)
        b.box(22f, 0.15f, 0f, 18f, 0.3f, 30f)
        for (pz in floatArrayOf(-15f, -5f, 5f, 15f)) b.box(13.2f, 3.3f, pz, 0.3f, 6.6f, 0.3f)
        // illuminated glass front (cool white, always on)
        b.color(0xFF9FC8E8.toInt(), 0f, 5, 0.9f)
        for (pz in floatArrayOf(-10f, 0f, 10f)) b.box(13.25f, 3.3f, pz, 0.05f, 6f, 9.6f)
        b.color(0xFF0C1420.toInt(), 0f, 0, 0.9f)
        b.box(31f, 3.3f, 0f, 0.3f, 6.6f, 30f)
        // logo tower
        b.color(0xFF1E2228.toInt(), 0f, 0, 0.5f)
        b.box(10f, 6f, -19f, 2f, 12f, 2f)
        b.color(0xFF00E5FF.toInt(), 0f, 5, 0f)
        b.box(10f, 10.5f, -17.98f, 1.6f, 1.6f, 0.04f)
        b.color(0xFFFF2D95.toInt(), 0f, 5, 0f)
        b.box(8.98f, 10.5f, -19f, 0.04f, 1.6f, 1.6f)
        // flag poles along the road
        b.color(0xFFC0C4CA.toInt(), 0f, 0, 0.7f)
        for (pz in floatArrayOf(-12f, -4f, 4f, 12f)) b.box(-2f, 4f, pz, 0.12f, 8f, 0.12f)
        b.color(0xFFD62828.toInt(), 0f, 0, 0.2f)
        for (pz in floatArrayOf(-12f, 4f)) b.box(-2f, 7f, pz + 0.8f, 0.04f, 1.6f, 1.5f)
        b.color(0xFF1C3F8A.toInt(), 0f, 0, 0.2f)
        for (pz in floatArrayOf(-4f, 12f)) b.box(-2f, 7f, pz + 0.8f, 0.04f, 1.6f, 1.5f)
        return b.build()
    }

    /** Industrial props: warehouse hall (scaled per instance), tall chimney and a storage tank. */
    fun warehouse(): Mesh {
        val b = MeshBuilder()
        b.color(WHITE, 1f, 0, 0.25f)
        b.box(0f, 0.4f, 0f, 1f, 0.8f, 1f)
        b.color(0xFF6A6E74.toInt(), 0f, 0, 0.5f)
        b.taperRoof(0f, 0.8f, 0f, 1.02f, 0.2f, 1.02f)
        b.color(0xFF2A2D33.toInt(), 0f, 0, 0.2f)
        b.box(0.505f, 0.26f, 0f, 0.01f, 0.5f, 0.35f)
        b.color(0xFFFFE2A8.toInt(), 0f, 1, 0.2f)
        b.box(0.506f, 0.7f, 0f, 0.01f, 0.05f, 0.8f)
        return b.build()
    }

    fun chimney(): Mesh {
        val b = MeshBuilder()
        b.color(0xFF8E5A48.toInt(), 0f, 0, 0.1f)
        b.cylinderY(0f, 0f, 0f, 1.6f, 1.0f, 34f, 12)
        b.color(0xFFE8E8EA.toInt(), 0f, 0, 0.2f)
        b.cylinderY(0f, 26f, 0f, 1.22f, 1.18f, 1.6f, 12, false)
        b.cylinderY(0f, 30f, 0f, 1.12f, 1.08f, 1.6f, 12, false)
        b.color(0xFFFF2020.toInt(), 0f, 5, 0f)
        b.box(0f, 34.1f, 0f, 0.3f, 0.3f, 0.3f)
        return b.build()
    }

    fun tank(): Mesh {
        val b = MeshBuilder()
        b.color(0xFFD9DCE0.toInt(), 0f, 0, 0.6f)
        b.cylinderY(0f, 0f, 0f, 1f, 1f, 1f, 18)
        b.color(0xFF8A8E94.toInt(), 0f, 0, 0.3f)
        b.cylinderY(0f, 1f, 0f, 1f, 0.2f, 0.18f, 18)
        return b.build()
    }

    /** Palm tree for the coast. */
    fun palm(): Mesh {
        val b = MeshBuilder()
        b.color(0xFF8A6A48.toInt(), 0f, 0, 0.05f)
        for (k in 0 until 6) {
            val y = k * 1.3f
            b.cylinderY(k * 0.12f, y, 0f, 0.26f - k * 0.02f, 0.24f - k * 0.02f, 1.32f, 7, false)
        }
        b.color(0xFF2F7A3A.toInt(), 0f, 0, 0.15f)
        val top = 7.8f
        for (k in 0 until 7) {
            val a = k / 7f * 6.283f
            val dx = cos(a); val dz = sin(a)
            b.quad(0.72f, top, 0f,
                0.72f + dx * 3.6f - dz * 0.5f, top - 1.4f, dz * 3.6f + dx * 0.5f,
                0.72f + dx * 3.6f + dz * 0.5f, top - 1.4f, dz * 3.6f - dx * 0.5f,
                0.72f, top + 0.05f, 0f, 0f, 1f, 0f, 0f, 0f, 1f, 1f)
            b.quad(0.72f, top + 0.05f, 0f,
                0.72f + dx * 3.6f + dz * 0.5f, top - 1.4f, dz * 3.6f - dx * 0.5f,
                0.72f + dx * 3.6f - dz * 0.5f, top - 1.4f, dz * 3.6f + dx * 0.5f,
                0.72f, top, 0f, 0f, -1f, 0f, 0f, 0f, 1f, 1f)
        }
        return b.build()
    }

    /** Distant mountain ring (drawn around the camera, tinted per environment). */
    fun mountains(seed: Int): Mesh {
        val b = MeshBuilder()
        val segs = 72
        val radius = 1100f
        for (layer in 0..1) {
            val rad = radius - layer * 260f
            val shade = if (layer == 0) 0.75f else 1f
            for (i in 0 until segs) {
                val a0 = (i.toFloat() / segs) * Math.PI.toFloat() * 2f
                val a1 = ((i + 1).toFloat() / segs) * Math.PI.toFloat() * 2f
                val h0 = height(i, seed + layer * 31, layer)
                val h1 = height((i + 1) % segs, seed + layer * 31, layer)
                val x0 = cos(a0) * rad; val z0 = sin(a0) * rad
                val x1 = cos(a1) * rad; val z1 = sin(a1) * rad
                b.colorF(shade * 0.82f, shade * 0.82f, shade * 0.82f, 1f, 0, 0f)
                val nx = -(x0 + x1) / (2 * rad); val nz = -(z0 + z1) / (2 * rad)
                val v0 = b.vertex(x0, -20f, z0, nx, 0.4f, nz, 0f, 0f)
                val v1 = b.vertex(x1, -20f, z1, nx, 0.4f, nz, 0f, 0f)
                b.colorF(shade, shade, shade, 1f, 0, 0f)
                val v2 = b.vertex(x1, h1, z1, nx, 0.6f, nz, 0f, 0f)
                val v3 = b.vertex(x0, h0, z0, nx, 0.6f, nz, 0f, 0f)
                // faces inward (towards the camera at the center)
                b.tri(v0, v1, v2); b.tri(v0, v2, v3)
            }
        }
        return b.build()
    }

    private fun height(i: Int, seed: Int, layer: Int): Float {
        var h = 0f
        var amp = if (layer == 0) 190f else 110f
        var freq = 1
        for (o in 0 until 4) {
            val p = (i * freq) / 6f
            val i0 = p.toInt()
            val f = p - i0
            val n0 = hashF(i0 + seed * 97 + o * 13)
            val n1 = hashF(i0 + 1 + seed * 97 + o * 13)
            val t = f * f * (3 - 2 * f)
            h += (n0 + (n1 - n0) * t) * amp
            amp *= 0.5f
            freq *= 2
        }
        return h + 20f
    }

    private fun hashF(n: Int): Float {
        var x = n * 1103515245 + 12345
        x = x xor (x ushr 16)
        x *= 0x45d9f3b
        x = x xor (x ushr 16)
        return (x and 0xFFFF) / 65535f
    }

    /** Road strip (relative to the player). UV.x spans the full road width. */
    fun road(halfWidth: Float): Mesh {
        val b = MeshBuilder()
        b.color(WHITE, 0f, 0, 0.35f)
        // split in segments along Z for better depth interpolation on some GPUs
        var z = -640f
        while (z < 80f) {
            b.planeY(-halfWidth, z, halfWidth, z + 40f, 0f, 0f, 0f, 1f, 1f)
            z += 40f
        }
        return b.build()
    }

    fun ground(): Mesh {
        val b = MeshBuilder()
        b.color(WHITE, 0f, 0, 0.02f)
        val s = 1400f
        b.planeY(-s, -s, s, s, -0.04f)
        return b.build()
    }

    fun shadowDecal(): Mesh {
        val b = MeshBuilder()
        b.color(WHITE, 0f, 0, 0f)
        b.planeY(-0.5f, -0.5f, 0.5f, 0.5f, 0.025f, 0f, 0f, 1f, 1f)
        return b.build()
    }

    /** Garage showroom turntable with neon ring. */
    fun showroom(): Mesh {
        val b = MeshBuilder()
        val segs = 48
        b.color(0xFF0E1220.toInt(), 0f, 0, 0.9f)
        diskY(b, 0f, 0.0f, 0f, 4.2f, segs)
        b.color(0xFF00E5FF.toInt(), 0f, 5, 0f)
        ringY(b, 0.01f, 4.2f, 4.45f, segs)
        b.color(0xFFFF2D95.toInt(), 0f, 5, 0f)
        ringY(b, 0.012f, 5.6f, 5.7f, segs)
        b.color(0xFF070910.toInt(), 0f, 0, 0.6f)
        diskY(b, 0f, -0.01f, 0f, 60f, segs)
        return b.build()
    }

    private fun diskY(b: MeshBuilder, cx: Float, y: Float, cz: Float, r: Float, segs: Int) {
        val c = b.vertex(cx, y, cz, 0f, 1f, 0f, 0.5f, 0.5f)
        val base = b.vertexCount
        for (i in 0..segs) {
            val a = (i.toFloat() / segs) * Math.PI.toFloat() * 2f
            b.vertex(cx + cos(a) * r, y, cz + sin(a) * r, 0f, 1f, 0f, 0f, 0f)
        }
        for (i in 0 until segs) b.tri(c, base + i + 1, base + i)
    }

    private fun ringY(b: MeshBuilder, y: Float, r0: Float, r1: Float, segs: Int) {
        val base = b.vertexCount
        for (i in 0..segs) {
            val a = (i.toFloat() / segs) * Math.PI.toFloat() * 2f
            b.vertex(cos(a) * r0, y, sin(a) * r0, 0f, 1f, 0f, 0f, 0f)
            b.vertex(cos(a) * r1, y, sin(a) * r1, 0f, 1f, 0f, 0f, 0f)
        }
        for (i in 0 until segs) {
            val a = base + i * 2
            b.tri(a, a + 3, a + 1); b.tri(a, a + 2, a + 3)
        }
    }
}
