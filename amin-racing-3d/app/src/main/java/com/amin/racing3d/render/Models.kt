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
)

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
        b.color(GLASS, 0f, 0, 0.95f)
        b.taper(-hw + 0.1f, hw - 0.1f, -l * 0.14f, l * 0.24f, 0.755f, -hw + 0.3f, hw - 0.3f, -l * 0.14f + 0.64f, l * 0.24f - 0.42f, 1.13f, bottom = false)
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
        b.color(GLASS, 0f, 0, 0.95f)
        b.taper(-hw + 0.1f, hw - 0.1f, -l * 0.12f, l * 0.22f, 0.8f, -hw + 0.24f, hw - 0.24f, -l * 0.12f + 0.52f, l * 0.22f - 0.5f, 1.22f, bottom = false)
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
        b.color(GLASS, 0f, 0, 0.95f)
        b.taper(-hw + 0.08f, hw - 0.08f, -l * 0.18f, l / 2 - 0.12f, 1.02f, -hw + 0.18f, hw - 0.18f, -l * 0.18f + 0.5f, l / 2 - 0.22f, 1.74f, bottom = false)
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
        b.color(GLASS, 0f, 0, 0.95f)
        b.taper(-hw + 0.24f, hw - 0.24f, -l * 0.17f, l * 0.18f, 0.7f, -hw + 0.42f, hw - 0.42f, -l * 0.17f + 0.62f, l * 0.18f - 0.12f, 1.07f, bottom = false)
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
    // Traffic vehicles
    // --------------------------------------------------------------------------------------
    private fun sedanBody(b: MeshBuilder, l: Float, w: Float) {
        val hw = w / 2
        paint(b, 0.55f)
        b.box(0f, 0.49f, 0f, w, 0.42f, l - 0.1f)
        b.taper(-hw, hw, -l / 2 + 0.05f, -l * 0.2f, 0.7f, -hw + 0.06f, hw - 0.06f, -l / 2 + 0.2f, -l * 0.2f, 0.8f, bottom = false)
        b.taper(-hw, hw, l * 0.26f, l / 2 - 0.05f, 0.7f, -hw + 0.06f, hw - 0.06f, l * 0.26f, l / 2 - 0.14f, 0.82f, bottom = false)
        b.box(0f, 0.755f, (-l * 0.2f + l * 0.26f) / 2, w, 0.11f, l * 0.46f)
        b.color(GLASS, 0f, 0, 0.9f)
        b.taper(-hw + 0.08f, hw - 0.08f, -l * 0.2f, l * 0.26f, 0.81f, -hw + 0.2f, hw - 0.2f, -l * 0.2f + 0.55f, l * 0.26f - 0.42f, 1.42f, bottom = false)
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
        b.color(GLASS, 0f, 0, 0.9f)
        b.taper(-hw + 0.06f, hw - 0.06f, -l / 2 + 0.3f, -l / 2 + 1.24f, 1.06f, -hw + 0.08f, hw - 0.08f, -l / 2 + 1.12f, -l / 2 + 1.24f, 2.12f, bottom = false)
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
        b.color(GLASS, 0f, 0, 0.95f)
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
    fun wheel(): Mesh {
        val b = MeshBuilder()
        b.color(0xFF18181A.toInt(), 0f, 0, 0.05f)
        b.cylinderX(0f, 0f, 0f, 1f, 0.7f, 22, capNeg = true, capPos = false)
        b.color(0xFF232327.toInt(), 0f, 0, 0.08f)
        b.ringX(0.35f, 0f, 0f, 0.7f, 1f, 22, true)
        b.color(CHROME, 0f, 0, 1f)
        b.ringX(0.352f, 0f, 0f, 0.62f, 0.7f, 22, true)
        b.color(0xFF25282E.toInt(), 0f, 0, 0.3f)
        b.diskX(0.29f, 0f, 0f, 0.63f, 22, true)
        b.color(0xFF7E838C.toInt(), 0f, 0, 0.6f)
        b.ringX(0.3f, 0f, 0f, 0.3f, 0.52f, 18, true)
        b.color(0xFFD9DEE6.toInt(), 0f, 0, 1f)
        for (i in 0 until 5) {
            val a = (i * 72f) * (Math.PI / 180f).toFloat()
            b.spokeX(0.34f, 0f, 0f, a, 0.1f, 0.63f, 0.11f, 0.06f)
        }
        b.diskX(0.345f, 0f, 0f, 0.15f, 12, true)
        b.color(0xFFC81E28.toInt(), 0f, 0, 0.5f)
        b.diskX(0.347f, 0f, 0f, 0.06f, 10, true)
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
