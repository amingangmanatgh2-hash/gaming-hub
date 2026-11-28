package com.amin.racing3d.render

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.graphics.Shader
import android.graphics.Typeface
import android.opengl.GLES30
import android.opengl.GLUtils
import com.amin.racing3d.R
import com.amin.racing3d.core.Lang
import com.amin.racing3d.game.GameData
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.abs
import kotlin.math.exp
import kotlin.math.floor
import kotlin.math.sin
import kotlin.math.sqrt

/** Procedural texture generation. Every texture of the game is generated at runtime. */
object Textures {
    var maxAniso = 0f

    private const val TEXTURE_MAX_ANISOTROPY_EXT = 0x84FE
    private const val MAX_TEXTURE_MAX_ANISOTROPY_EXT = 0x84FF

    fun detectAniso() {
        val ext = GLES30.glGetString(GLES30.GL_EXTENSIONS) ?: ""
        maxAniso = if (ext.contains("GL_EXT_texture_filter_anisotropic")) {
            val f = FloatArray(1)
            GLES30.glGetFloatv(MAX_TEXTURE_MAX_ANISOTROPY_EXT, f, 0)
            f[0]
        } else 0f
    }

    private fun params(repeat: Boolean, mip: Boolean, aniso: Float) {
        val wrap = if (repeat) GLES30.GL_REPEAT else GLES30.GL_CLAMP_TO_EDGE
        GLES30.glTexParameteri(GLES30.GL_TEXTURE_2D, GLES30.GL_TEXTURE_WRAP_S, wrap)
        GLES30.glTexParameteri(GLES30.GL_TEXTURE_2D, GLES30.GL_TEXTURE_WRAP_T, wrap)
        GLES30.glTexParameteri(GLES30.GL_TEXTURE_2D, GLES30.GL_TEXTURE_MAG_FILTER, GLES30.GL_LINEAR)
        if (mip) {
            GLES30.glGenerateMipmap(GLES30.GL_TEXTURE_2D)
            GLES30.glTexParameteri(GLES30.GL_TEXTURE_2D, GLES30.GL_TEXTURE_MIN_FILTER, GLES30.GL_LINEAR_MIPMAP_LINEAR)
        } else {
            GLES30.glTexParameteri(GLES30.GL_TEXTURE_2D, GLES30.GL_TEXTURE_MIN_FILTER, GLES30.GL_LINEAR)
        }
        if (aniso > 1f && maxAniso > 1f) {
            GLES30.glTexParameterf(GLES30.GL_TEXTURE_2D, TEXTURE_MAX_ANISOTROPY_EXT, minOf(aniso, maxAniso))
        }
    }

    /** Uploads ARGB pixels without alpha premultiplication. */
    fun upload(pixels: IntArray, w: Int, h: Int, repeat: Boolean, mip: Boolean, aniso: Float = 0f, existing: Int = 0): Int {
        val bb = ByteBuffer.allocateDirect(w * h * 4).order(ByteOrder.nativeOrder())
        for (p in pixels) {
            bb.put(((p shr 16) and 0xFF).toByte())
            bb.put(((p shr 8) and 0xFF).toByte())
            bb.put((p and 0xFF).toByte())
            bb.put(((p ushr 24) and 0xFF).toByte())
        }
        bb.position(0)
        val id = if (existing != 0) existing else {
            val ids = IntArray(1); GLES30.glGenTextures(1, ids, 0); ids[0]
        }
        GLES30.glBindTexture(GLES30.GL_TEXTURE_2D, id)
        GLES30.glPixelStorei(GLES30.GL_UNPACK_ALIGNMENT, 1)
        GLES30.glTexImage2D(GLES30.GL_TEXTURE_2D, 0, GLES30.GL_RGBA, w, h, 0, GLES30.GL_RGBA, GLES30.GL_UNSIGNED_BYTE, bb)
        params(repeat, mip, aniso)
        GLES30.glBindTexture(GLES30.GL_TEXTURE_2D, 0)
        return id
    }

    // ---------------------------------------------------------------- noise helpers
    private fun hash(x: Int, y: Int, seed: Int): Float {
        var h = x * 374761393 + y * 668265263 + seed * 1442695041
        h = (h xor (h ushr 13)) * 1274126177
        h = h xor (h ushr 16)
        return (h and 0xFFFFFF) / 16777215f
    }

    /** Tileable value noise with the given lattice period. */
    private fun vnoise(x: Float, y: Float, period: Int, seed: Int): Float {
        val xi = floor(x).toInt(); val yi = floor(y).toInt()
        val xf = x - xi; val yf = y - yi
        val x0 = Math.floorMod(xi, period); val x1 = Math.floorMod(xi + 1, period)
        val y0 = Math.floorMod(yi, period); val y1 = Math.floorMod(yi + 1, period)
        val u = xf * xf * (3 - 2 * xf); val v = yf * yf * (3 - 2 * yf)
        val a = hash(x0, y0, seed); val b = hash(x1, y0, seed)
        val c = hash(x0, y1, seed); val d = hash(x1, y1, seed)
        return (a + (b - a) * u) + ((c + (d - c) * u) - (a + (b - a) * u)) * v
    }

    private fun fbm(x: Float, y: Float, basePeriod: Int, octaves: Int, seed: Int): Float {
        var sum = 0f; var amp = 0.5f; var p = basePeriod; var f = 1f; var norm = 0f
        for (o in 0 until octaves) {
            sum += vnoise(x * f, y * f, p, seed + o * 17) * amp
            norm += amp
            amp *= 0.5f; f *= 2f; p *= 2
        }
        return sum / norm
    }

    private fun argb(a: Int, r: Float, g: Float, b: Float): Int {
        val ri = r.toInt().coerceIn(0, 255); val gi = g.toInt().coerceIn(0, 255); val bi = b.toInt().coerceIn(0, 255)
        return (a shl 24) or (ri shl 16) or (gi shl 8) or bi
    }

    // ---------------------------------------------------------------- road
    const val ROAD_TILE = 12f
    val ROAD_HALF_WIDTH = GameData.ROAD_HALF + GameData.SHOULDER + 0.6f

    /** antialiased coverage of a stripe [c - hw, c + hw] sampled with pixel size px */
    private fun stripe(v: Float, c: Float, hw: Float, px: Float): Float =
        ((hw - abs(v - c)) / px + 0.5f).coerceIn(0f, 1f)

    private var asphaltCache: FloatArray? = null

    /**
     * Shared asphalt base (RGB floats, 512 x 512 = full road width x 12 m). Dense-graded asphalt:
     * aggregate speckle, binder blotches, polished wheel tracks, oil drip lines in the lane centres,
     * sealed cracks, a couple of repair patches, a coarser shoulder with rumble grooves and a
     * concrete drain gutter with a grate. Tiles seamlessly along the road (periodic noise only).
     */
    private fun asphaltBase(w: Int, h: Int): FloatArray {
        asphaltCache?.let { if (it.size == w * h * 3) return it }
        val out = FloatArray(w * h * 3)
        val width = ROAD_HALF_WIDTH * 2
        val pxw = width / w; val pxh = ROAD_TILE / h
        val tracks = floatArrayOf(-0.85f, 0.85f)
        // repair patches (x centre, z centre, half sizes) - kept away from the tile seam
        val patches = arrayOf(floatArrayOf(-4.3f, 3.1f, 1.1f, 0.9f), floatArrayOf(2.6f, 8.4f, 0.8f, 1.4f))
        for (y in 0 until h) {
            val zm = (y + 0.5f) * pxh
            for (x in 0 until w) {
                val xm = (x + 0.5f) * pxw - ROAD_HALF_WIDTH
                val ax = abs(xm)
                val g1 = hash(x, y, 5)
                val g2 = hash(x shr 1, y shr 1, 11)
                val blot = fbm(x / 64f, y / 64f, 8, 3, 9)
                val fine = vnoise(x / 8f, y / 8f, 64, 21) // ~25 cm grain clusters
                var c = 50f + (g1 - 0.5f) * 14f + (g2 - 0.5f) * 10f + (blot - 0.5f) * 20f + (fine - 0.5f) * 6f
                // aggregate: bright quartz chips and dark voids
                if (g1 > 0.965f) c += 34f * (g1 - 0.965f) / 0.035f + 8f
                if (g2 < 0.035f) c -= 14f
                var r = c; var g = c + 1.5f; var b = c + 4.5f
                // polished, darker wheel tracks
                for (lane in GameData.LANE_X) for (o in tracks) {
                    val d = xm - (lane + o)
                    val k = exp(-(d * d) / 0.12f) * 8f
                    r -= k; g -= k; b -= k * 0.8f
                }
                // oil drip line in the lane centre
                for (lane in GameData.LANE_X) {
                    val d = xm - lane
                    val drip = exp(-(d * d) / 0.05f) * (0.6f + 0.4f * fbm(x / 32f, y / 32f, 16, 2, 41)) * 7f
                    r -= drip; g -= drip; b -= drip * 0.7f
                }
                // sealed cracks: thin dark tar lines along noise ridges
                val cr = fbm(x / 128f, y / 128f, 4, 3, 77)
                val crack = (1f - abs(cr - 0.5f) / 0.0085f).coerceIn(0f, 1f)
                if (crack > 0f && ax < GameData.ROAD_HALF) { r -= 22f * crack; g -= 22f * crack; b -= 20f * crack }
                // repair patches: slightly fresher binder with a sealed outline
                for (pt in patches) {
                    val dx = abs(xm - pt[0]) - pt[2]; val dz = abs(zm - pt[1]) - pt[3]
                    if (dx < 0f && dz < 0f) { r -= 7f; g -= 7f; b -= 6f }
                    val edge = maxOf(dx, dz)
                    if (edge > -0.04f && edge < 0.03f && (dx < 0.03f && dz < 0.03f)) { r -= 14f; g -= 14f; b -= 13f }
                }
                // shoulder: coarser chip seal and rumble grooves next to the edge line
                if (ax > GameData.ROAD_HALF + 0.12f) {
                    val sh = 60f + (g1 - 0.5f) * 26f + (blot - 0.5f) * 18f
                    r = sh; g = sh + 1f; b = sh + 3f
                    if (ax > GameData.ROAD_HALF + 0.22f && ax < GameData.ROAD_HALF + 0.62f) {
                        val ph = (zm / 0.3f) % 1f
                        if (ph < 0.45f) { r -= 16f; g -= 16f; b -= 15f }
                    }
                }
                // concrete drain gutter with expansion joints every 2 m and a grate every 12 m
                if (ax > ROAD_HALF_WIDTH - 0.45f) {
                    val cc = 142f + (g1 - 0.5f) * 26f + (blot - 0.5f) * 16f
                    r = cc; g = cc - 1f; b = cc - 6f
                    if ((zm % 2f) < 0.025f) { r -= 40f; g -= 40f; b -= 38f }
                    val gz = abs(zm - 6f); val gx = abs(ax - (ROAD_HALF_WIDTH - 0.24f))
                    if (gz < 0.32f && gx < 0.17f) {
                        val slot = ((zm * 18f) % 1f) < 0.5f
                        val v = if (slot) 22f else 74f
                        r = v; g = v; b = v + 2f
                    }
                }
                val i = (y * w + x) * 3
                out[i] = r; out[i + 1] = g; out[i + 2] = b
            }
        }
        asphaltCache = out
        return out
    }

    fun road(twoWay: Boolean): Int {
        val w = 512; val h = 512
        val base = asphaltBase(w, h)
        val px = IntArray(w * h)
        val width = ROAD_HALF_WIDTH * 2
        val pxw = width / w; val pxh = ROAD_TILE / h
        for (y in 0 until h) {
            val zm = (y + 0.5f) * pxh
            for (x in 0 until w) {
                val xm = (x + 0.5f) * pxw - ROAD_HALF_WIDTH
                val ax = abs(xm)
                val i = (y * w + x) * 3
                var r = base[i]; var g = base[i + 1]; var b = base[i + 2]
                // worn thermoplastic paint: brightness varies, the aggregate shows through
                val wear = 0.78f + 0.22f * fbm(x / 16f, y / 16f, 32, 2, 33)
                val chip = if (hash(x, y, 91) > 0.92f) 0.82f else 1f
                fun paint(cov: Float, pr: Float, pg: Float, pb: Float) {
                    if (cov <= 0f) return
                    val k = cov * wear * chip
                    r += (pr - r) * k; g += (pg - g) * k; b += (pb - b) * k
                }
                // solid edge lines
                paint(stripe(ax, GameData.ROAD_HALF + 0.02f, 0.09f, pxw), 236f, 236f, 230f)
                // lane dividers: 4 m dashes every 12 m, with a cat's eye in the gap
                val dash = stripe(zm, 2f, 2f, pxh)
                paint(stripe(ax, GameData.LANE_WIDTH, 0.075f, pxw) * dash, 238f, 238f, 232f)
                val eye = stripe(ax, GameData.LANE_WIDTH, 0.06f, pxw) * stripe(zm, 8f, 0.06f, pxh)
                paint(eye, 250f, 250f, 255f)
                if (twoWay) {
                    // double solid yellow centre line
                    paint(stripe(ax, 0.13f, 0.06f, pxw), 242f, 190f, 42f)
                    paint(stripe(zm, 8f, 0.06f, pxh) * stripe(ax, 0f, 0.05f, pxw), 255f, 200f, 60f)
                } else {
                    paint(stripe(ax, 0f, 0.075f, pxw) * dash, 238f, 238f, 232f)
                }
                px[y * w + x] = argb(255, r, g, b)
            }
        }
        return upload(px, w, h, true, true, 8f)
    }

    /** 2.4 m x 2.4 m of sidewalk: 4 x 4 concrete slabs (0.6 m) with joints, tone variation and chips. */
    const val PAVE_TILE = 2.4f

    fun pavement(): Int {
        val n = 256
        val px = IntArray(n * n)
        val slab = n / 4
        for (y in 0 until n) for (x in 0 until n) {
            val sx = x / slab; val sy = y / slab
            val tone = (hash(sx, sy, 61) - 0.5f) * 16f
            val g1 = hash(x, y, 62)
            val blot = fbm(x / 32f, y / 32f, 8, 3, 63)
            var c = 168f + tone + (g1 - 0.5f) * 18f + (blot - 0.5f) * 22f
            if (g1 > 0.97f) c -= 30f
            val jx = minOf(x % slab, slab - 1 - x % slab); val jy = minOf(y % slab, slab - 1 - y % slab)
            val j = minOf(jx, jy)
            if (j == 0) c -= 52f else if (j == 1) c -= 18f
            px[y * n + x] = argb(255, c, c - 1f, c - 4f)
        }
        return upload(px, n, n, true, true, 8f)
    }

    // ---------------------------------------------------------------- ground
    const val GROUND_TILE = 9f

    fun ground(env: Int, existing: Int): Int {
        val n = 256
        val px = IntArray(n * n)
        for (y in 0 until n) for (x in 0 until n) {
            val g1 = fbm(x / 32f, y / 32f, 8, 4, 3 + env)
            val g2 = hash(x, y, 77)
            val r: Float; val g: Float; val b: Float
            when (env) {
                GameData.ENV_DESERT -> {
                    val ripple = sin((x + g1 * 40f) / 256f * Math.PI.toFloat() * 2f * 6f) * 0.5f + 0.5f
                    r = 206f + g1 * 30f + ripple * 10f + g2 * 8f
                    g = 170f + g1 * 26f + ripple * 8f + g2 * 6f
                    b = 118f + g1 * 20f + ripple * 4f
                }
                GameData.ENV_SNOW -> {
                    r = 222f + g1 * 26f + g2 * 8f
                    g = 230f + g1 * 20f + g2 * 6f
                    b = 244f + g1 * 10f
                }
                GameData.ENV_FOREST -> {
                    val dirt = if (g1 < 0.36f) (0.36f - g1) * 3f else 0f
                    r = 52f + g1 * 30f + g2 * 22f + dirt * 50f
                    g = 96f + g1 * 46f + g2 * 26f - dirt * 10f
                    b = 40f + g1 * 16f + dirt * 20f
                }
                GameData.ENV_COAST -> {
                    // sandy dune grass: pale sand with tufts of sea-grass
                    val tuft = if (g1 > 0.58f) (g1 - 0.58f) * 2.4f else 0f
                    r = 214f + g1 * 22f + g2 * 10f - tuft * 120f
                    g = 196f + g1 * 20f + g2 * 8f - tuft * 40f
                    b = 150f + g1 * 16f - tuft * 90f
                }
                GameData.ENV_INDUSTRIAL -> {
                    // cracked concrete, gravel and oil stains
                    val slab = (x % 64 == 0 || y % 64 == 0)
                    val stain = if (vnoise(x / 40f, y / 40f, 4, 17) > 0.7f) 0.55f else 1f
                    val c = (112f + g1 * 34f + g2 * 26f) * stain * (if (slab) 0.6f else 1f)
                    r = c + 4f; g = c + 2f; b = c - 2f
                }
                GameData.ENV_MOUNTAIN -> {
                    // alpine meadow with rocky scree patches
                    val rock = if (g1 < 0.4f) (0.4f - g1) * 2.5f else 0f
                    r = 70f + g1 * 26f + g2 * 18f + rock * 70f
                    g = 98f + g1 * 32f + g2 * 18f + rock * 26f
                    b = 58f + g1 * 14f + rock * 70f
                }
                else -> {
                    val pave = vnoise(x / 64f, y / 64f, 4, 91) > 0.62f
                    if (pave) {
                        val c = 128f + g1 * 30f + g2 * 14f
                        r = c; g = c; b = c + 4f
                    } else {
                        r = 76f + g1 * 30f + g2 * 18f
                        g = 104f + g1 * 34f + g2 * 18f
                        b = 62f + g1 * 16f
                    }
                }
            }
            px[y * n + x] = argb(255, r, g, b)
        }
        return upload(px, n, n, true, true, 4f, existing)
    }

    // ---------------------------------------------------------------- buildings
    const val BUILDING_TILE_W = 12f
    const val BUILDING_TILE_H = 14f

    fun building(): Int {
        val n = 256
        val px = IntArray(n * n)
        val cell = 64
        for (y in 0 until n) for (x in 0 until n) {
            val cx = x / cell; val cy = y / cell
            val lx = x % cell; val ly = y % cell
            val noise = hash(x, y, 4) * 14f + fbm(x / 32f, y / 32f, 8, 3, 2) * 20f
            val inWin = lx in 9..54 && ly in 12..50
            val frame = lx in 7..56 && ly in 10..52
            if (inWin) {
                val lit = hash(cx, cy, 99) > 0.5f
                val grad = 1f - ly / 64f
                val split = lx == 31 || lx == 32
                val r = if (split) 30f else 34f + grad * 40f
                val g = if (split) 34f else 50f + grad * 44f
                val b = if (split) 40f else 74f + grad * 52f
                px[y * n + x] = argb(if (lit) 255 else 128, r, g, b)
            } else if (frame) {
                px[y * n + x] = argb(0, 120f, 124f, 130f)
            } else {
                val c = 205f + noise
                px[y * n + x] = argb(0, c, c, c)
            }
        }
        return upload(px, n, n, true, true, 4f)
    }

    // ---------------------------------------------------------------- sprites
    fun sprite(): Int {
        val n = 64
        val px = IntArray(n * n)
        for (y in 0 until n) for (x in 0 until n) {
            val dx = (x + 0.5f) / n * 2f - 1f
            val dy = (y + 0.5f) / n * 2f - 1f
            val d = sqrt(dx * dx + dy * dy).coerceAtMost(1f)
            val a = (1f - d * d)
            px[y * n + x] = argb((a * a * 255f).toInt().coerceIn(0, 255), 255f, 255f, 255f)
        }
        return upload(px, n, n, false, true)
    }

    // ---------------------------------------------------------------- sign atlas
    fun atlas(context: Context): Int {
        val w = 1024; val h = 512
        val bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
        val c = Canvas(bmp)
        c.drawColor(Color.WHITE)
        val bold: Typeface = try {
            context.resources.getFont(R.font.vazirmatn_black)
        } catch (e: Exception) {
            Typeface.DEFAULT_BOLD
        }
        val p = Paint(Paint.ANTI_ALIAS_FLAG)
        p.typeface = bold
        p.textAlign = Paint.Align.CENTER
        val res = context.resources

        // A: green guide sign
        p.color = 0xFF0A6B3A.toInt()
        c.drawRoundRect(RectF(4f, 4f, 508f, 252f), 22f, 22f, p)
        p.style = Paint.Style.STROKE; p.strokeWidth = 8f; p.color = Color.WHITE
        c.drawRoundRect(RectF(16f, 16f, 496f, 240f), 16f, 16f, p)
        p.style = Paint.Style.FILL
        p.textSize = 82f
        c.drawText(res.getString(R.string.sign_city), 290f, 112f, p)
        p.textSize = 66f
        c.drawText(Lang.digits("24 ") + res.getString(R.string.km), 290f, 205f, p)
        arrowUp(c, p, 84f, 128f)

        // B: blue exit sign
        p.color = 0xFF0B4FA8.toInt()
        c.drawRoundRect(RectF(516f, 4f, 1020f, 252f), 22f, 22f, p)
        p.style = Paint.Style.STROKE; p.strokeWidth = 8f; p.color = Color.WHITE
        c.drawRoundRect(RectF(528f, 16f, 1008f, 240f), 16f, 16f, p)
        p.style = Paint.Style.FILL
        p.textSize = 78f
        c.drawText(res.getString(R.string.sign_city2), 800f, 112f, p)
        p.textSize = 60f
        c.drawText(res.getString(R.string.sign_exit) + Lang.digits(" 12"), 800f, 205f, p)
        arrowUp(c, p, 600f, 128f)

        // C: billboard
        p.shader = LinearGradient(0f, 256f, 1024f, 448f, 0xFF140A2E.toInt(), 0xFF07223A.toInt(), Shader.TileMode.CLAMP)
        c.drawRect(0f, 256f, 1024f, 448f, p)
        p.shader = null
        for (i in 0 until 7) {
            p.color = if (i % 2 == 0) 0x6600E5FF else 0x55FF2D95
            c.drawRect(40f + i * 22f, 300f + i * 14f, 300f + i * 22f, 306f + i * 14f, p)
        }
        p.textSize = 92f
        p.color = 0xFF00E5FF.toInt()
        p.setShadowLayer(18f, 0f, 0f, 0xFF00E5FF.toInt())
        c.drawText("AMIN RACING 3D", 600f, 356f, p)
        p.setShadowLayer(14f, 0f, 0f, 0xFFFF2D95.toInt())
        p.color = 0xFFFF6FB8.toInt()
        p.textSize = 54f
        c.drawText(res.getString(R.string.billboard_sub), 600f, 428f, p)
        p.clearShadowLayer()

        // D: checkpoint banner
        p.color = 0xFF101010.toInt()
        c.drawRect(0f, 448f, 512f, 512f, p)
        for (i in 0 until 16) {
            p.color = if (i % 2 == 0) Color.WHITE else Color.BLACK
            c.drawRect(i * 8f, 448f, i * 8f + 8f, 480f, p)
            p.color = if (i % 2 == 0) Color.BLACK else Color.WHITE
            c.drawRect(i * 8f, 480f, i * 8f + 8f, 512f, p)
            p.color = if (i % 2 == 0) Color.WHITE else Color.BLACK
            c.drawRect(384f + i * 8f, 448f, 392f + i * 8f, 480f, p)
            p.color = if (i % 2 == 0) Color.BLACK else Color.WHITE
            c.drawRect(384f + i * 8f, 480f, 392f + i * 8f, 512f, p)
        }
        p.color = 0xFFFFD23F.toInt()
        p.textSize = 44f
        c.drawText(res.getString(R.string.checkpoint_sign), 256f, 496f, p)

        // white texel region for untextured parts
        p.color = Color.WHITE
        c.drawRect(512f, 448f, 1024f, 512f, p)

        val ids = IntArray(1)
        GLES30.glGenTextures(1, ids, 0)
        GLES30.glBindTexture(GLES30.GL_TEXTURE_2D, ids[0])
        GLUtils.texImage2D(GLES30.GL_TEXTURE_2D, 0, bmp, 0)
        params(false, true, 4f)
        GLES30.glBindTexture(GLES30.GL_TEXTURE_2D, 0)
        bmp.recycle()
        return ids[0]
    }

    private fun arrowUp(c: Canvas, p: Paint, cx: Float, cy: Float) {
        p.color = Color.WHITE
        val path = Path()
        path.moveTo(cx, cy - 70f)
        path.lineTo(cx + 46f, cy - 16f)
        path.lineTo(cx + 16f, cy - 16f)
        path.lineTo(cx + 16f, cy + 70f)
        path.lineTo(cx - 16f, cy + 70f)
        path.lineTo(cx - 16f, cy - 16f)
        path.lineTo(cx - 46f, cy - 16f)
        path.close()
        c.drawPath(path, p)
    }
}
