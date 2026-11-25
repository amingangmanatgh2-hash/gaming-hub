package com.amin.racing3d.render

import android.opengl.GLES30
import kotlin.math.cos
import kotlin.math.sin
import kotlin.math.sqrt

/**
 * Procedural mesh construction. Vertex layout (14 floats):
 * position(3) normal(3) color rgb + paintMask(4) material: emissiveType, specular (2) uv(2).
 *
 * Emissive types: 0 none, 1 lights (headlights/lamps, on at night), 2 tail/brake lights,
 * 3 left blinker, 4 right blinker, 5 always-on neon.
 */
class MeshBuilder {
    private var verts = FloatArray(4096)
    private var vCount = 0
    private var idx = IntArray(4096)
    private var iCount = 0

    private var cr = 1f
    private var cg = 1f
    private var cb = 1f
    private var paint = 0f
    private var emis = 0f
    private var spec = 0f
    private var fixedUv = false
    // glass triangles go to a separate index list (drawn later, translucent)
    private var glassMode = false
    private var gIdx = IntArray(256)
    private var gCount = 0
    private var fu = 0f
    private var fv = 0f

    /** Forces every following vertex to use one UV (e.g. a white texel of an atlas). */
    fun uvFixed(u: Float, v: Float): MeshBuilder {
        fixedUv = true; fu = u; fv = v
        return this
    }

    fun uvFree(): MeshBuilder {
        fixedUv = false
        return this
    }

    val vertexCount: Int get() = vCount

    /** Following geometry is window glass: rendered in the translucent glass pass. */
    fun glass(): MeshBuilder {
        color(0xFF0A121C.toInt(), 0f, 0, 0.95f)
        glassMode = true
        return this
    }

    fun color(argb: Int, paintMask: Float = 0f, emissive: Int = 0, specular: Float = 0.1f): MeshBuilder {
        glassMode = false
        cr = ((argb shr 16) and 0xFF) / 255f
        cg = ((argb shr 8) and 0xFF) / 255f
        cb = (argb and 0xFF) / 255f
        paint = paintMask
        emis = emissive.toFloat()
        spec = specular
        return this
    }

    fun colorF(r: Float, g: Float, b: Float, paintMask: Float = 0f, emissive: Int = 0, specular: Float = 0.1f): MeshBuilder {
        glassMode = false
        cr = r; cg = g; cb = b
        paint = paintMask
        emis = emissive.toFloat()
        spec = specular
        return this
    }

    private fun ensure(extraV: Int, extraI: Int) {
        if ((vCount + extraV) * Mesh.FLOATS_PER_VERTEX > verts.size) {
            verts = verts.copyOf(maxOf(verts.size * 2, (vCount + extraV) * Mesh.FLOATS_PER_VERTEX))
        }
        if (iCount + extraI > idx.size) idx = idx.copyOf(maxOf(idx.size * 2, iCount + extraI))
    }

    fun vertex(x: Float, y: Float, z: Float, nx: Float, ny: Float, nz: Float, u: Float, v: Float): Int {
        ensure(1, 0)
        val o = vCount * Mesh.FLOATS_PER_VERTEX
        verts[o] = x; verts[o + 1] = y; verts[o + 2] = z
        verts[o + 3] = nx; verts[o + 4] = ny; verts[o + 5] = nz
        verts[o + 6] = cr; verts[o + 7] = cg; verts[o + 8] = cb; verts[o + 9] = paint
        verts[o + 10] = emis; verts[o + 11] = spec
        if (fixedUv) {
            verts[o + 12] = fu; verts[o + 13] = fv
        } else {
            verts[o + 12] = u; verts[o + 13] = v
        }
        return vCount++
    }

    fun tri(a: Int, b: Int, c: Int) {
        if (glassMode) {
            if (gCount + 3 > gIdx.size) gIdx = gIdx.copyOf(gIdx.size * 2)
            gIdx[gCount++] = a; gIdx[gCount++] = b; gIdx[gCount++] = c
            return
        }
        ensure(0, 3)
        idx[iCount++] = a; idx[iCount++] = b; idx[iCount++] = c
    }

    /**
     * Flat-shaded quad from four corners in perimeter order. The winding is corrected so that
     * the face normal points along (hx,hy,hz) — the outward direction hint.
     */
    fun quad(
        ax: Float, ay: Float, az: Float,
        bx: Float, by: Float, bz: Float,
        cx: Float, cy: Float, cz: Float,
        dx: Float, dy: Float, dz: Float,
        hx: Float, hy: Float, hz: Float,
        u0: Float = 0f, v0: Float = 0f, u1: Float = 1f, v1: Float = 1f
    ) {
        val e1x = bx - ax; val e1y = by - ay; val e1z = bz - az
        val e2x = cx - ax; val e2y = cy - ay; val e2z = cz - az
        var nx = e1y * e2z - e1z * e2y
        var ny = e1z * e2x - e1x * e2z
        var nz = e1x * e2y - e1y * e2x
        var len = sqrt(nx * nx + ny * ny + nz * nz)
        if (len < 1e-8f) {
            // degenerate first triangle (e.g. cone tip) — use the other diagonal
            val f1x = cx - ax; val f1y = cy - ay; val f1z = cz - az
            val f2x = dx - ax; val f2y = dy - ay; val f2z = dz - az
            nx = f1y * f2z - f1z * f2y
            ny = f1z * f2x - f1x * f2z
            nz = f1x * f2y - f1y * f2x
            len = sqrt(nx * nx + ny * ny + nz * nz)
            if (len < 1e-8f) return
        }
        nx /= len; ny /= len; nz /= len
        val flip = nx * hx + ny * hy + nz * hz < 0f
        if (flip) { nx = -nx; ny = -ny; nz = -nz }
        val i0 = vertex(ax, ay, az, nx, ny, nz, u0, v1)
        val i1 = vertex(bx, by, bz, nx, ny, nz, u1, v1)
        val i2 = vertex(cx, cy, cz, nx, ny, nz, u1, v0)
        val i3 = vertex(dx, dy, dz, nx, ny, nz, u0, v0)
        if (!flip) {
            tri(i0, i1, i2); tri(i0, i2, i3)
        } else {
            tri(i0, i2, i1); tri(i0, i3, i2)
        }
    }

    /** Axis aligned box given its center and full size. UVs are 0..1 per face. */
    fun box(cx: Float, cy: Float, cz: Float, sx: Float, sy: Float, sz: Float, topUv: Boolean = true) {
        val x0 = cx - sx / 2; val x1 = cx + sx / 2
        val y0 = cy - sy / 2; val y1 = cy + sy / 2
        val z0 = cz - sz / 2; val z1 = cz + sz / 2
        taper(x0, x1, z0, z1, y0, x0, x1, z0, z1, y1, topUv)
    }

    /**
     * Frustum-like block: bottom rectangle at y0 and top rectangle at y1 may differ, which
     * gives sloped hoods, windshields and cabins.
     */
    fun taper(
        bx0: Float, bx1: Float, bz0: Float, bz1: Float, y0: Float,
        tx0: Float, tx1: Float, tz0: Float, tz1: Float, y1: Float,
        topUv: Boolean = true, bottom: Boolean = true
    ) {
        val ccx = (bx0 + bx1 + tx0 + tx1) / 4f
        val ccy = (y0 + y1) / 2f
        val ccz = (bz0 + bz1 + tz0 + tz1) / 4f
        // top
        if (topUv) {
            quad(tx0, y1, tz0, tx1, y1, tz0, tx1, y1, tz1, tx0, y1, tz1, 0f, 1f, 0f)
        } else {
            quad(tx0, y1, tz0, tx1, y1, tz0, tx1, y1, tz1, tx0, y1, tz1, 0f, 1f, 0f, 0.02f, 0.02f, 0.03f, 0.03f)
        }
        // bottom
        if (bottom) quad(bx0, y0, bz0, bx1, y0, bz0, bx1, y0, bz1, bx0, y0, bz1, 0f, -1f, 0f, 0.02f, 0.02f, 0.03f, 0.03f)
        // front (-z)
        side(bx0, y0, bz0, bx1, y0, bz0, tx1, y1, tz0, tx0, y1, tz0, ccx, ccy, ccz)
        // back (+z)
        side(bx1, y0, bz1, bx0, y0, bz1, tx0, y1, tz1, tx1, y1, tz1, ccx, ccy, ccz)
        // left (-x)
        side(bx0, y0, bz1, bx0, y0, bz0, tx0, y1, tz0, tx0, y1, tz1, ccx, ccy, ccz)
        // right (+x)
        side(bx1, y0, bz0, bx1, y0, bz1, tx1, y1, tz1, tx1, y1, tz0, ccx, ccy, ccz)
    }

    private fun side(
        ax: Float, ay: Float, az: Float, bx: Float, by: Float, bz: Float,
        cx: Float, cy: Float, cz: Float, dx: Float, dy: Float, dz: Float,
        ccx: Float, ccy: Float, ccz: Float
    ) {
        val mx = (ax + bx + cx + dx) / 4f - ccx
        val my = (ay + by + cy + dy) / 4f - ccy
        val mz = (az + bz + cz + dz) / 4f - ccz
        quad(ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz, mx, my, mz)
    }

    /**
     * Cylinder along the X axis (wheels). Smooth normals on the tread, flat caps.
     */
    fun cylinderX(cx: Float, cy: Float, cz: Float, radius: Float, width: Float, segments: Int, capNeg: Boolean = true, capPos: Boolean = true) {
        val x0 = cx - width / 2; val x1 = cx + width / 2
        val base = vCount
        for (i in 0..segments) {
            val a = (i.toFloat() / segments) * (Math.PI * 2).toFloat()
            val cy1 = cos(a); val sz1 = sin(a)
            vertex(x0, cy + cy1 * radius, cz + sz1 * radius, 0f, cy1, sz1, 0f, 0f)
            vertex(x1, cy + cy1 * radius, cz + sz1 * radius, 0f, cy1, sz1, 1f, 0f)
        }
        for (i in 0 until segments) {
            val a = base + i * 2
            // outward winding
            tri(a, a + 2, a + 1); tri(a + 1, a + 2, a + 3)
        }
        if (capPos) diskX(x1, cy, cz, radius, segments, true)
        if (capNeg) diskX(x0, cy, cz, radius, segments, false)
    }

    fun diskX(x: Float, cy: Float, cz: Float, radius: Float, segments: Int, facingPos: Boolean) {
        val n = if (facingPos) 1f else -1f
        val c = vertex(x, cy, cz, n, 0f, 0f, 0.5f, 0.5f)
        val base = vCount
        for (i in 0..segments) {
            val a = (i.toFloat() / segments) * (Math.PI * 2).toFloat()
            vertex(x, cy + cos(a) * radius, cz + sin(a) * radius, n, 0f, 0f, 0f, 0f)
        }
        for (i in 0 until segments) {
            if (facingPos) tri(c, base + i, base + i + 1) else tri(c, base + i + 1, base + i)
        }
    }

    /** Disk on the Z plane (lamp lenses, exhaust caps, spare wheel faces). */
    fun diskZ(cx: Float, cy: Float, z: Float, radius: Float, segments: Int, facingPos: Boolean) {
        val n = if (facingPos) 1f else -1f
        val c = vertex(cx, cy, z, 0f, 0f, n, 0.5f, 0.5f)
        val base = vCount
        for (i in 0..segments) {
            val a = (i.toFloat() / segments) * (Math.PI * 2).toFloat()
            vertex(cx + cos(a) * radius, cy + sin(a) * radius, z, 0f, 0f, n, 0f, 0f)
        }
        for (i in 0 until segments) {
            if (facingPos) tri(c, base + i, base + i + 1) else tri(c, base + i + 1, base + i)
        }
    }

    /** Ring on the X plane between inner and outer radius (rims). */
    fun ringX(x: Float, cy: Float, cz: Float, rIn: Float, rOut: Float, segments: Int, facingPos: Boolean) {
        val n = if (facingPos) 1f else -1f
        val base = vCount
        for (i in 0..segments) {
            val a = (i.toFloat() / segments) * (Math.PI * 2).toFloat()
            val c = cos(a); val s = sin(a)
            vertex(x, cy + c * rIn, cz + s * rIn, n, 0f, 0f, 0f, 0f)
            vertex(x, cy + c * rOut, cz + s * rOut, n, 0f, 0f, 0f, 0f)
        }
        for (i in 0 until segments) {
            val a = base + i * 2
            if (facingPos) { tri(a, a + 1, a + 3); tri(a, a + 3, a + 2) } else { tri(a, a + 3, a + 1); tri(a, a + 2, a + 3) }
        }
    }

    /** Flat spoke on the +X face of a wheel, rotated around the axle. */
    fun spokeX(x: Float, cy: Float, cz: Float, angle: Float, r0: Float, r1: Float, halfW0: Float, halfW1: Float) {
        val c = cos(angle); val s = sin(angle)
        // radial direction (y,z) = (c, s); tangent = (-s, c)
        val ay = cy + c * r0 - s * halfW0; val az = cz + s * r0 + c * halfW0
        val by = cy + c * r0 + s * halfW0; val bz = cz + s * r0 - c * halfW0
        val ccy = cy + c * r1 + s * halfW1; val ccz = cz + s * r1 - c * halfW1
        val dy = cy + c * r1 - s * halfW1; val dz = cz + s * r1 + c * halfW1
        quad(x, ay, az, x, by, bz, x, ccy, ccz, x, dy, dz, 1f, 0f, 0f)
    }

    /** Vertical cylinder / cone (r1 = 0 gives a cone). */
    fun cylinderY(cx: Float, y0: Float, cz: Float, r0: Float, r1: Float, height: Float, segments: Int, capTop: Boolean = true) {
        val y1 = y0 + height
        val slope = (r0 - r1) / height
        val base = vCount
        for (i in 0..segments) {
            val a = (i.toFloat() / segments) * (Math.PI * 2).toFloat()
            val c = cos(a); val s = sin(a)
            val nl = sqrt(1f + slope * slope)
            val nx = c / nl; val ny = slope / nl; val nz = s / nl
            vertex(cx + c * r0, y0, cz + s * r0, nx, ny, nz, i.toFloat() / segments, 1f)
            vertex(cx + c * r1, y1, cz + s * r1, nx, ny, nz, i.toFloat() / segments, 0f)
        }
        for (i in 0 until segments) {
            val a = base + i * 2
            tri(a, a + 1, a + 3); tri(a, a + 3, a + 2)
        }
        if (capTop && r1 > 0.001f) {
            val c0 = vertex(cx, y1, cz, 0f, 1f, 0f, 0.5f, 0.5f)
            val b2 = vCount
            for (i in 0..segments) {
                val a = (i.toFloat() / segments) * (Math.PI * 2).toFloat()
                vertex(cx + cos(a) * r1, y1, cz + sin(a) * r1, 0f, 1f, 0f, 0f, 0f)
            }
            for (i in 0 until segments) tri(c0, b2 + i + 1, b2 + i)
        }
    }

    /** Cylinder along Z (exhaust tips, coin). */
    fun cylinderZ(cx: Float, cy: Float, cz: Float, radius: Float, length: Float, segments: Int) {
        val z0 = cz - length / 2; val z1 = cz + length / 2
        val base = vCount
        for (i in 0..segments) {
            val a = (i.toFloat() / segments) * (Math.PI * 2).toFloat()
            val c = cos(a); val s = sin(a)
            vertex(cx + c * radius, cy + s * radius, z0, c, s, 0f, 0f, 0f)
            vertex(cx + c * radius, cy + s * radius, z1, c, s, 0f, 0f, 0f)
        }
        for (i in 0 until segments) {
            val a = base + i * 2
            tri(a, a + 3, a + 1); tri(a, a + 2, a + 3)
        }
        for (side in 0..1) {
            val z = if (side == 0) z0 else z1
            val n = if (side == 0) -1f else 1f
            val c0 = vertex(cx, cy, z, 0f, 0f, n, 0.5f, 0.5f)
            val b2 = vCount
            for (i in 0..segments) {
                val a = (i.toFloat() / segments) * (Math.PI * 2).toFloat()
                vertex(cx + cos(a) * radius, cy + sin(a) * radius, z, 0f, 0f, n, 0f, 0f)
            }
            for (i in 0 until segments) {
                if (side == 1) tri(c0, b2 + i, b2 + i + 1) else tri(c0, b2 + i + 1, b2 + i)
            }
        }
    }

    /** Low-poly blob (tree crowns, rocks, bushes) with deterministic jitter. */
    fun blob(cx: Float, cy: Float, cz: Float, rx: Float, ry: Float, rz: Float, rings: Int, segs: Int, jitter: Float, seed: Int) {
        val base = vCount
        for (r in 0..rings) {
            val phi = Math.PI * r / rings
            val sp = sin(phi).toFloat(); val cp = cos(phi).toFloat()
            for (s in 0..segs) {
                val th = 2.0 * Math.PI * (s % segs) / segs
                val st = sin(th).toFloat(); val ct = cos(th).toFloat()
                val h = hash(seed, r, s % segs)
                val k = if (r == 0 || r == rings) 1f else 1f + (h - 0.5f) * 2f * jitter
                val nx = sp * ct; val ny = cp; val nz = sp * st
                vertex(cx + nx * rx * k, cy + ny * ry * k, cz + nz * rz * k, nx, ny, nz, 0f, 0f)
            }
        }
        val row = segs + 1
        for (r in 0 until rings) {
            for (s in 0 until segs) {
                val a = base + r * row + s
                val b = a + row
                tri(a, a + 1, b + 1); tri(a, b + 1, b)
            }
        }
    }

    private fun hash(seed: Int, a: Int, b: Int): Float {
        var h = seed * 374761393 + a * 668265263 + b * 2147483647
        h = (h xor (h ushr 13)) * 1274126177
        h = h xor (h ushr 16)
        return (h and 0xFFFF) / 65535f
    }

    /** Horizontal quad on y = constant with UV 0..1 (decals, ground). */
    fun planeY(x0: Float, z0: Float, x1: Float, z1: Float, y: Float, u0: Float = 0f, v0: Float = 0f, u1: Float = 1f, v1: Float = 1f) {
        val a = vertex(x0, y, z0, 0f, 1f, 0f, u0, v0)
        val b = vertex(x1, y, z0, 0f, 1f, 0f, u1, v0)
        val c = vertex(x1, y, z1, 0f, 1f, 0f, u1, v1)
        val d = vertex(x0, y, z1, 0f, 1f, 0f, u0, v1)
        tri(a, c, b); tri(a, d, c)
    }

    /**
     * Rear deck of a car body (top of the painted surface over the rear axle area, centre line):
     * mounting point for aftermarket spoilers. Only painted, non-glass vertices count.
     */
    private fun measureDeck() {
        val f = Mesh.FLOATS_PER_VERTEX
        var maxZ = -1e9f
        for (i in 0 until vCount) { val o = i * f; if (verts[o + 9] > 0.75f && verts[o + 2] > maxZ) maxZ = verts[o + 2] }
        var deckY = 0f
        for (i in 0 until vCount) {
            val o = i * f
            if (verts[o + 9] < 0.75f) continue
            val x = verts[o]; val y = verts[o + 1]; val z = verts[o + 2]
            if (kotlin.math.abs(x) < 0.4f && z > maxZ - 0.75f && z < maxZ - 0.12f && y > deckY) deckY = y
        }
        lastDeckY = deckY
        lastDeckZ = maxZ - 0.38f
    }

    fun build(): Mesh {
        measureDeck()
        val ids = IntArray(1)
        GLES30.glGenBuffers(1, ids, 0)
        val vb = Gl.floatBuffer(vCount * Mesh.FLOATS_PER_VERTEX)
        vb.put(verts, 0, vCount * Mesh.FLOATS_PER_VERTEX).position(0)
        GLES30.glBindBuffer(GLES30.GL_ARRAY_BUFFER, ids[0])
        GLES30.glBufferData(GLES30.GL_ARRAY_BUFFER, vCount * Mesh.STRIDE, vb, GLES30.GL_STATIC_DRAW)
        GLES30.glBindBuffer(GLES30.GL_ARRAY_BUFFER, 0)
        val main = indexMesh(ids[0], idx, iCount)
        lastGlass = if (gCount > 0) indexMesh(ids[0], gIdx, gCount) else null
        return main
    }

    private fun indexMesh(vbo: Int, src: IntArray, n: Int): Mesh {
        val ids = IntArray(1)
        GLES30.glGenBuffers(1, ids, 0)
        val type: Int
        GLES30.glBindBuffer(GLES30.GL_ELEMENT_ARRAY_BUFFER, ids[0])
        if (vCount < 65535) {
            val ib = Gl.shortBuffer(n)
            for (i in 0 until n) ib.put(src[i].toShort())
            ib.position(0)
            GLES30.glBufferData(GLES30.GL_ELEMENT_ARRAY_BUFFER, n * 2, ib, GLES30.GL_STATIC_DRAW)
            type = GLES30.GL_UNSIGNED_SHORT
        } else {
            val ib = Gl.intBuffer(n)
            ib.put(src, 0, n).position(0)
            GLES30.glBufferData(GLES30.GL_ELEMENT_ARRAY_BUFFER, n * 4, ib, GLES30.GL_STATIC_DRAW)
            type = GLES30.GL_UNSIGNED_INT
        }
        GLES30.glBindBuffer(GLES30.GL_ELEMENT_ARRAY_BUFFER, 0)
        return Mesh(vbo, ids[0], n, type)
    }

    companion object {
        /** Glass part of the most recently built mesh (GL thread only). */
        var lastGlass: Mesh? = null
        /** rear deck (spoiler mount) of the most recently built mesh */
        var lastDeckY = 0f
        var lastDeckZ = 0f

        fun takeGlass(): Mesh? { val g = lastGlass; lastGlass = null; return g }
    }
}
