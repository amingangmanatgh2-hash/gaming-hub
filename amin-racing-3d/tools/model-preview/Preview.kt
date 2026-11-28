// Software preview of the procedural models (no GPU / emulator needed):
//   renders Models.<name>() from a 3/4 front and a 3/4 rear view into PNG files.
// Used while designing vehicles; see tools/model-preview/run.sh.
import com.amin.racing3d.render.MeshBuilder
import com.amin.racing3d.render.Models
import java.io.File
import java.util.zip.CRC32
import java.util.zip.Deflater
import kotlin.math.*

class Captured(val v: FloatArray, val n: Int, val idx: IntArray, val glass: IntArray)

const val W = 720
const val H = 405
var lastImage = IntArray(0)

fun png(file: File, rgb: IntArray, W: Int = 720, H: Int = 405) {
    val raw = ByteArray((W * 3 + 1) * H)
    var o = 0
    for (y in 0 until H) { raw[o++] = 0; for (x in 0 until W) { val c = rgb[y * W + x]; raw[o++] = (c shr 16).toByte(); raw[o++] = (c shr 8).toByte(); raw[o++] = c.toByte() } }
    val def = Deflater(6); def.setInput(raw); def.finish()
    val buf = java.io.ByteArrayOutputStream(); val tmp = ByteArray(65536)
    while (!def.finished()) { val k = def.deflate(tmp); buf.write(tmp, 0, k) }
    val out = java.io.DataOutputStream(file.outputStream())
    out.write(byteArrayOf(0x89.toByte(), 'P'.code.toByte(), 'N'.code.toByte(), 'G'.code.toByte(), 13, 10, 26, 10))
    fun chunk(type: String, data: ByteArray) {
        out.writeInt(data.size); val t = type.toByteArray(); out.write(t); out.write(data)
        val crc = CRC32(); crc.update(t); crc.update(data); out.writeInt(crc.value.toInt())
    }
    val ihdr = java.nio.ByteBuffer.allocate(13).putInt(W).putInt(H).put(8).put(2).put(0).put(0).put(0).array()
    chunk("IHDR", ihdr); chunk("IDAT", buf.toByteArray()); chunk("IEND", ByteArray(0)); out.close()
}

fun render(meshes: List<Captured>, yawDeg: Float, pitchDeg: Float, dist: Float, paint: Int, file: File) {
    val col = IntArray(W * H); val zb = FloatArray(W * H) { Float.MAX_VALUE }
    for (y in 0 until H) for (x in 0 until W) { val t = y / H.toFloat(); val g = (24 + 30 * t).toInt(); col[y * W + x] = (g shl 16) or ((g + 4) shl 8) or (g + 14) }
    val yaw = Math.toRadians(yawDeg.toDouble()).toFloat(); val pitch = Math.toRadians(pitchDeg.toDouble()).toFloat()
    val cy = cos(yaw); val sy = sin(yaw); val cp = cos(pitch); val sp = sin(pitch)
    val pr = ((paint shr 16) and 255) / 255f; val pg = ((paint shr 8) and 255) / 255f; val pb = (paint and 255) / 255f
    val lx = -0.45f; val ly = 0.8f; val lz = -0.4f; val ll = sqrt(lx * lx + ly * ly + lz * lz)
    val f = H * 1.25f
    // ground grid
    // look-at camera orbiting the car: yaw 0 = looking from the front (-Z) towards +Z
    val ex = -sy * cp * dist; val ey = 0.6f + sp * dist; val ez = -cy * cp * dist
    var fx = -ex; var fy = 0.6f - ey; var fz = -ez
    val fl = sqrt(fx * fx + fy * fy + fz * fz); fx /= fl; fy /= fl; fz /= fl
    // right = f x up(0,1,0)
    var rx = -fz; var rz = fx; val rl = sqrt(rx * rx + rz * rz); rx /= rl; rz /= rl
    val ux = -rz * fy; val uy = rz * fx - rx * fz; val uz = rx * fy
    fun proj(x: Float, y: Float, z: Float, out: FloatArray) {
        val dx = x - ex; val dy = y - ey; val dz = z - ez
        val cxp = dx * rx + dz * rz; val cyp = dx * ux + dy * uy + dz * uz; val czp = dx * fx + dy * fy + dz * fz
        out[0] = W / 2f - cxp / czp * f; out[1] = H * 0.55f - cyp / czp * f; out[2] = czp
    }
    val pa = FloatArray(3); val pbv = FloatArray(3); val pc = FloatArray(3)
    fun shade(m: Captured, i: Int, glass: Boolean): Int {
        val o = i * 14
        var nx = m.v[o + 3]; var ny = m.v[o + 4]; var nz = m.v[o + 5]
        var r = m.v[o + 6]; var g = m.v[o + 7]; var b = m.v[o + 8]; val pm = m.v[o + 9]; val em = m.v[o + 10]; val spc = m.v[o + 11]
        r = r * (1 - pm) + r * pr * pm; g = g * (1 - pm) + g * pg * pm; b = b * (1 - pm) + b * pb * pm
        val ndl = max(0f, (nx * lx + ny * ly + nz * lz) / ll)
        // view vector approx from camera direction
        val vx = -sy; val vz = -cy
        val hx = lx / ll + vx * 0.0f; val rim = (1f - abs(nx * vx + nz * vz)).pow(3) * 0.15f
        val sky = 0.35f + 0.25f * ny
        var k = sky + ndl * 0.85f
        if (em > 0.5f) k = 1.4f
        val spec = spc * ndl.pow(12) * 0.6f
        var rr = r * k + spec + rim; var gg = g * k + spec + rim; var bb = b * k + spec + rim
        if (glass) { rr = 0.05f + spec + 0.25f * max(0f, ny); gg = 0.08f + spec + 0.28f * max(0f, ny); bb = 0.12f + spec + 0.33f * max(0f, ny) }
        fun c(v: Float) = (min(1f, v).pow(1 / 1.8f) * 255).toInt().coerceIn(0, 255)
        return (c(rr) shl 16) or (c(gg) shl 8) or c(bb)
    }
    fun drawTris(m: Captured, list: IntArray, glass: Boolean) {
        var t = 0
        while (t < list.size) {
            val i0 = list[t]; val i1 = list[t + 1]; val i2 = list[t + 2]; t += 3
            proj(m.v[i0 * 14], m.v[i0 * 14 + 1], m.v[i0 * 14 + 2], pa)
            proj(m.v[i1 * 14], m.v[i1 * 14 + 1], m.v[i1 * 14 + 2], pbv)
            proj(m.v[i2 * 14], m.v[i2 * 14 + 1], m.v[i2 * 14 + 2], pc)
            if (pa[2] < 0.1f || pbv[2] < 0.1f || pc[2] < 0.1f) continue
            val area = (pbv[0] - pa[0]) * (pc[1] - pa[1]) - (pc[0] - pa[0]) * (pbv[1] - pa[1])
               // back-face cull (CCW front in GL = CW on screen with y down)
            val c0 = shade(m, i0, glass); val c1 = shade(m, i1, glass); val c2 = shade(m, i2, glass)
            val minX = max(0, floor(minOf(pa[0], pbv[0], pc[0])).toInt()); val maxX = min(W - 1, ceil(maxOf(pa[0], pbv[0], pc[0])).toInt())
            val minY = max(0, floor(minOf(pa[1], pbv[1], pc[1])).toInt()); val maxY = min(H - 1, ceil(maxOf(pa[1], pbv[1], pc[1])).toInt())
            if (abs(area) < 1e-6f) continue
            for (y in minY..maxY) for (x in minX..maxX) {
                val px = x + 0.5f; val py = y + 0.5f
                val w0 = ((pbv[0] - px) * (pc[1] - py) - (pc[0] - px) * (pbv[1] - py)) / area
                val w1 = ((pc[0] - px) * (pa[1] - py) - (pa[0] - px) * (pc[1] - py)) / area
                val w2 = 1f - w0 - w1
                if (w0 < 0 || w1 < 0 || w2 < 0) continue
                val z = w0 * pa[2] + w1 * pbv[2] + w2 * pc[2]
                val p = y * W + x
                if (z >= zb[p]) continue
                fun ch(sh: Int) = (((c0 shr sh) and 255) * w0 + ((c1 shr sh) and 255) * w1 + ((c2 shr sh) and 255) * w2).toInt()
                var cc = (ch(16) shl 16) or (ch(8) shl 8) or ch(0)
                if (glass) { val old = col[p]; cc = ((((old shr 16) and 255) * 0.3f + ch(16) * 0.7f).toInt() shl 16) or ((((old shr 8) and 255) * 0.3f + ch(8) * 0.7f).toInt() shl 8) or (((old and 255) * 0.3f + ch(0) * 0.7f).toInt()) }
                else zb[p] = z
                col[p] = cc
            }
        }
    }
    for (m in meshes) drawTris(m, m.idx, false)
    for (m in meshes) drawTris(m, m.glass, true)
    png(file, col)
    lastImage = col
}

fun main(args: Array<String>) {
    val out = File(args.getOrElse(0) { "/tmp/preview" }); out.mkdirs()
    val names = if (args.size > 1) args.drop(1) else listOf("electricGT")
    val tiles = ArrayList<IntArray>()
    for (name in names) {
        val caps = ArrayList<Captured>()
        MeshBuilder.capture = { v, n, i, g -> caps.add(Captured(v, n, i, g)) }
        val m = Models::class.java.getMethod(name).invoke(Models) as com.amin.racing3d.render.VehicleModel
        // wheels at the model's wheel positions
        val wheelCaps = ArrayList<Captured>()
        MeshBuilder.capture = { v, n, i, g -> wheelCaps.add(Captured(v, n, i, g)) }
        Models.wheel(0)
        val wc = wheelCaps.last()
        for (z in m.wheelZ) for (sx in floatArrayOf(-1f, 1f)) {
            val v = wc.v.copyOf()
            for (k in 0 until wc.n) {
                val o = k * 14
                v[o] = v[o] * m.wheelR * (if (sx < 0) -1f else 1f) + sx * m.wheelX; v[o + 1] = v[o + 1] * m.wheelR + m.wheelR; v[o + 2] = v[o + 2] * m.wheelR + z
                if (sx < 0) v[o + 3] = -v[o + 3]
            }
            val idx = wc.idx.copyOf()
            if (sx < 0) { var t = 0; while (t < idx.size) { val a = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = a; t += 3 } }
            caps.add(Captured(v, wc.n, idx, IntArray(0)))
        }
        render(caps, 35f, 14f, m.length * 0.95f + 1.2f, 0xFFD02040.toInt(), File(out, "$name-front.png"))
        tiles.add(lastImage.copyOf())
        render(caps, 215f, 14f, m.length * 0.95f + 1.2f, 0xFFD02040.toInt(), File(out, "$name-rear.png"))
        tiles.add(lastImage.copyOf())
        render(caps, 90f, 4f, m.length * 0.95f + 1.2f, 0xFFD02040.toInt(), File(out, "$name-side.png"))
        tiles.add(lastImage.copyOf())  // side
        println("rendered $name: ${caps.sumOf { it.idx.size / 3 + it.glass.size / 3 }} triangles")
    }
    // contact sheet: one row per model (front, rear, side), tiles at half resolution
    val tw = W / 2; val th = H / 2; val cols = 3; val rows = (tiles.size + cols - 1) / cols
    for (sheetStart in 0 until rows step 4) {
        val rcount = minOf(4, rows - sheetStart)
        val sw = tw * cols; val shh = th * rcount
        val img = IntArray(sw * shh)
        for (t in 0 until rcount * cols) {
            val ti = sheetStart * cols + t
            if (ti >= tiles.size) break
            val src = tiles[ti]; val ox = (t % cols) * tw; val oy = (t / cols) * th
            for (y in 0 until th) for (x in 0 until tw) img[(oy + y) * sw + ox + x] = src[(y * 2) * W + x * 2]
        }
        png(File(out, "sheet-${sheetStart / 4}.png"), img, sw, shh)
    }
}
