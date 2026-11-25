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

    fun road(twoWay: Boolean): Int {
        val w = 512; val h = 512
        val px = IntArray(w * h)
        val width = ROAD_HALF_WIDTH * 2
        val trackOffsets = floatArrayOf(-0.8f, 0.8f)
        for (y in 0 until h) {
            val zm = (y + 0.5f) / h * ROAD_TILE
            for (x in 0 until w) {
                val xm = (x + 0.5f) / w * width - ROAD_HALF_WIDTH
                val ax = abs(xm)
                val grain = hash(x, y, 5)
                val blot = fbm(x / 64f, y / 64f, 8, 3, 9)
                var c = 52f + grain * 16f + (blot - 0.5f) * 18f
                var r = c; var g = c + 1f; var b = c + 4f
                // tyre tracks
                for (lane in GameData.LANE_X) {
                    for (o in trackOffsets) {
                        val d = xm - (lane + o)
                        val k = exp(-(d * d) / 0.09f) * 9f
                        r -= k; g -= k; b -= k
                    }
                }
                if (ax > GameData.ROAD_HALF + 0.12f) {
                    val sh = 64f + grain * 20f + (blot - 0.5f) * 20f
                    r = sh; g = sh; b = sh + 2f
                }
                if (ax > ROAD_HALF_WIDTH - 0.45f) {
                    val cc = 150f + grain * 30f
                    r = cc; g = cc; b = cc - 6f
                }
                val wear = 0.82f + 0.18f * fbm(x / 16f, y / 16f, 32, 2, 33)
                // edge lines
                if (ax > GameData.ROAD_HALF - 0.08f && ax < GameData.ROAD_HALF + 0.12f) {
                    r = 232f * wear; g = 232f * wear; b = 228f * wear
                }
                // lane dividers
                val dashOn = zm < 4f
                if (abs(ax - GameData.LANE_WIDTH) < 0.08f && dashOn) {
                    r = 236f * wear; g = 236f * wear; b = 232f * wear
                }
                if (twoWay) {
                    if (ax > 0.07f && ax < 0.19f) {
                        r = 240f * wear; g = 186f * wear; b = 40f * wear
                    }
                } else if (ax < 0.08f && dashOn) {
                    r = 236f * wear; g = 236f * wear; b = 232f * wear
                }
                px[y * w + x] = argb(255, r, g, b)
            }
        }
        return upload(px, w, h, true, true, 8f)
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
