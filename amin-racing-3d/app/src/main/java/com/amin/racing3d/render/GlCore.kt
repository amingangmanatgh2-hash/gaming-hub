package com.amin.racing3d.render

import android.opengl.GLES30
import android.util.Log
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.FloatBuffer
import java.nio.IntBuffer
import java.nio.ShortBuffer

object Gl {
    private const val TAG = "AminGL"
    /** draw calls issued in the current frame (developer overlay) */
    @JvmField var drawCalls = 0

    fun floatBuffer(size: Int): FloatBuffer =
        ByteBuffer.allocateDirect(size * 4).order(ByteOrder.nativeOrder()).asFloatBuffer()

    fun shortBuffer(size: Int): ShortBuffer =
        ByteBuffer.allocateDirect(size * 2).order(ByteOrder.nativeOrder()).asShortBuffer()

    fun intBuffer(size: Int): IntBuffer =
        ByteBuffer.allocateDirect(size * 4).order(ByteOrder.nativeOrder()).asIntBuffer()

    fun compile(type: Int, src: String): Int {
        val sh = GLES30.glCreateShader(type)
        GLES30.glShaderSource(sh, src)
        GLES30.glCompileShader(sh)
        val ok = IntArray(1)
        GLES30.glGetShaderiv(sh, GLES30.GL_COMPILE_STATUS, ok, 0)
        if (ok[0] == 0) {
            val log = GLES30.glGetShaderInfoLog(sh)
            GLES30.glDeleteShader(sh)
            throw RuntimeException("Shader compile failed: $log")
        }
        return sh
    }

    fun program(vs: String, fs: String): Int {
        val v = compile(GLES30.GL_VERTEX_SHADER, vs)
        val f = compile(GLES30.GL_FRAGMENT_SHADER, fs)
        val p = GLES30.glCreateProgram()
        GLES30.glAttachShader(p, v)
        GLES30.glAttachShader(p, f)
        GLES30.glLinkProgram(p)
        val ok = IntArray(1)
        GLES30.glGetProgramiv(p, GLES30.GL_LINK_STATUS, ok, 0)
        GLES30.glDeleteShader(v)
        GLES30.glDeleteShader(f)
        if (ok[0] == 0) {
            val log = GLES30.glGetProgramInfoLog(p)
            GLES30.glDeleteProgram(p)
            throw RuntimeException("Program link failed: $log")
        }
        return p
    }

    fun checkError(where: String) {
        val e = GLES30.glGetError()
        if (e != GLES30.GL_NO_ERROR) Log.w(TAG, "GL error 0x${Integer.toHexString(e)} at $where")
    }
}

/** Static mesh uploaded to GPU buffers. Vertex layout: see [MeshBuilder]. */
class Mesh(val vbo: Int, val ibo: Int, val indexCount: Int, val indexType: Int) {
    companion object {
        const val FLOATS_PER_VERTEX = 14
        const val STRIDE = FLOATS_PER_VERTEX * 4
    }
}

/**
 * Instanced renderer for one mesh. Each instance stores a model matrix (16 floats),
 * a tint (4 floats) and an "extra" vector (4 floats: brake, lights, blink L, blink R).
 * All instances of a mesh are drawn with a single glDrawElementsInstanced call.
 */
class InstanceBatch(val mesh: Mesh, val capacity: Int, private val share: InstanceBatch? = null) {
    val data: FloatArray = share?.data ?: FloatArray(capacity * STRIDE_F)
    private var ownCount = 0
    /** Instances; a batch created with [share] draws another mesh with the same instances. */
    val count: Int get() = share?.count ?: ownCount
    private val buffer: java.nio.FloatBuffer = if (share != null) share.buffer else Gl.floatBuffer(capacity * STRIDE_F)
    private val vao: Int
    private val instanceVbo: Int
    private var uploaded = false

    init {
        val ids = IntArray(1)
        GLES30.glGenVertexArrays(1, ids, 0)
        vao = ids[0]
        if (share != null) instanceVbo = share.instanceVbo else {
            GLES30.glGenBuffers(1, ids, 0)
            instanceVbo = ids[0]
        }
        GLES30.glBindVertexArray(vao)
        GLES30.glBindBuffer(GLES30.GL_ARRAY_BUFFER, mesh.vbo)
        val s = Mesh.STRIDE
        GLES30.glEnableVertexAttribArray(0)
        GLES30.glVertexAttribPointer(0, 3, GLES30.GL_FLOAT, false, s, 0)
        GLES30.glEnableVertexAttribArray(1)
        GLES30.glVertexAttribPointer(1, 3, GLES30.GL_FLOAT, false, s, 12)
        GLES30.glEnableVertexAttribArray(2)
        GLES30.glVertexAttribPointer(2, 4, GLES30.GL_FLOAT, false, s, 24)
        GLES30.glEnableVertexAttribArray(3)
        GLES30.glVertexAttribPointer(3, 2, GLES30.GL_FLOAT, false, s, 40)
        GLES30.glEnableVertexAttribArray(4)
        GLES30.glVertexAttribPointer(4, 2, GLES30.GL_FLOAT, false, s, 48)
        GLES30.glBindBuffer(GLES30.GL_ELEMENT_ARRAY_BUFFER, mesh.ibo)

        GLES30.glBindBuffer(GLES30.GL_ARRAY_BUFFER, instanceVbo)
        if (share == null) GLES30.glBufferData(GLES30.GL_ARRAY_BUFFER, capacity * STRIDE_F * 4, null, GLES30.GL_STREAM_DRAW)
        val istride = STRIDE_F * 4
        for (i in 0 until 4) {
            GLES30.glEnableVertexAttribArray(5 + i)
            GLES30.glVertexAttribPointer(5 + i, 4, GLES30.GL_FLOAT, false, istride, i * 16)
            GLES30.glVertexAttribDivisor(5 + i, 1)
        }
        GLES30.glEnableVertexAttribArray(9)
        GLES30.glVertexAttribPointer(9, 4, GLES30.GL_FLOAT, false, istride, 64)
        GLES30.glVertexAttribDivisor(9, 1)
        GLES30.glEnableVertexAttribArray(10)
        GLES30.glVertexAttribPointer(10, 4, GLES30.GL_FLOAT, false, istride, 80)
        GLES30.glVertexAttribDivisor(10, 1)
        GLES30.glBindVertexArray(0)
        GLES30.glBindBuffer(GLES30.GL_ARRAY_BUFFER, 0)
    }

    fun clear() {
        ownCount = 0
        uploaded = false
    }

    val isFull: Boolean get() = count >= capacity

    /**
     * Adds an instance with translation, rotation (yaw about Y, then pitch about X, then roll
     * about Z) and non-uniform scale. Allocation free.
     */
    fun add(
        x: Float, y: Float, z: Float,
        yaw: Float, pitch: Float, roll: Float,
        sx: Float, sy: Float, sz: Float,
        r: Float, g: Float, b: Float, a: Float,
        e0: Float, e1: Float, e2: Float, e3: Float
    ) {
        if (share != null || ownCount >= capacity) return
        val count = ownCount
        val ca = Math.cos(yaw.toDouble()).toFloat()
        val sa = Math.sin(yaw.toDouble()).toFloat()
        val cb: Float
        val sb: Float
        if (pitch == 0f) { cb = 1f; sb = 0f } else {
            cb = Math.cos(pitch.toDouble()).toFloat(); sb = Math.sin(pitch.toDouble()).toFloat()
        }
        val cc: Float
        val sc: Float
        if (roll == 0f) { cc = 1f; sc = 0f } else {
            cc = Math.cos(roll.toDouble()).toFloat(); sc = Math.sin(roll.toDouble()).toFloat()
        }
        val o = count * STRIDE_F
        val d = data
        // column 0
        d[o] = (ca * cc + sa * sb * sc) * sx
        d[o + 1] = (cb * sc) * sx
        d[o + 2] = (-sa * cc + ca * sb * sc) * sx
        d[o + 3] = 0f
        // column 1
        d[o + 4] = (-ca * sc + sa * sb * cc) * sy
        d[o + 5] = (cb * cc) * sy
        d[o + 6] = (sa * sc + ca * sb * cc) * sy
        d[o + 7] = 0f
        // column 2
        d[o + 8] = (sa * cb) * sz
        d[o + 9] = (-sb) * sz
        d[o + 10] = (ca * cb) * sz
        d[o + 11] = 0f
        // column 3
        d[o + 12] = x
        d[o + 13] = y
        d[o + 14] = z
        d[o + 15] = 1f
        d[o + 16] = r; d[o + 17] = g; d[o + 18] = b; d[o + 19] = a
        d[o + 20] = e0; d[o + 21] = e1; d[o + 22] = e2; d[o + 23] = e3
        ownCount++
    }

    /** Simple helper: yaw only, uniform scale, no extras. */
    fun addSimple(x: Float, y: Float, z: Float, yaw: Float, s: Float, r: Float, g: Float, b: Float) {
        add(x, y, z, yaw, 0f, 0f, s, s, s, r, g, b, 1f, 0f, 0f, 0f, 0f)
    }

    fun upload() {
        if (share != null) { share.upload(); return }
        if (uploaded || count == 0) return
        buffer.position(0)
        buffer.put(data, 0, count * STRIDE_F)
        buffer.position(0)
        GLES30.glBindBuffer(GLES30.GL_ARRAY_BUFFER, instanceVbo)
        GLES30.glBufferData(GLES30.GL_ARRAY_BUFFER, capacity * STRIDE_F * 4, null, GLES30.GL_STREAM_DRAW)
        GLES30.glBufferSubData(GLES30.GL_ARRAY_BUFFER, 0, count * STRIDE_F * 4, buffer)
        uploaded = true
    }

    fun draw() {
        if (count == 0) return
        upload()
        Gl.drawCalls++
        GLES30.glBindVertexArray(vao)
        GLES30.glDrawElementsInstanced(GLES30.GL_TRIANGLES, mesh.indexCount, mesh.indexType, 0, count)
        GLES30.glBindVertexArray(0)
    }

    companion object {
        const val STRIDE_F = 24
    }
}

/**
 * Instanced camera-facing sprites (particles, light glows, snow).
 * Instance layout: position xyz + size, color rgba.
 */
class SpriteBatch(val capacity: Int) {
    val data = FloatArray(capacity * 8)
    var count = 0
        private set
    private val buffer = Gl.floatBuffer(capacity * 8)
    private val vao: Int
    private val quadVbo: Int
    private val instVbo: Int

    init {
        val ids = IntArray(2)
        GLES30.glGenVertexArrays(1, ids, 0)
        vao = ids[0]
        GLES30.glGenBuffers(2, ids, 0)
        quadVbo = ids[0]
        instVbo = ids[1]
        val quad = floatArrayOf(-1f, -1f, 1f, -1f, -1f, 1f, 1f, 1f)
        val qb = Gl.floatBuffer(8)
        qb.put(quad).position(0)
        GLES30.glBindVertexArray(vao)
        GLES30.glBindBuffer(GLES30.GL_ARRAY_BUFFER, quadVbo)
        GLES30.glBufferData(GLES30.GL_ARRAY_BUFFER, 32, qb, GLES30.GL_STATIC_DRAW)
        GLES30.glEnableVertexAttribArray(0)
        GLES30.glVertexAttribPointer(0, 2, GLES30.GL_FLOAT, false, 8, 0)
        GLES30.glBindBuffer(GLES30.GL_ARRAY_BUFFER, instVbo)
        GLES30.glBufferData(GLES30.GL_ARRAY_BUFFER, capacity * 32, null, GLES30.GL_STREAM_DRAW)
        GLES30.glEnableVertexAttribArray(1)
        GLES30.glVertexAttribPointer(1, 4, GLES30.GL_FLOAT, false, 32, 0)
        GLES30.glVertexAttribDivisor(1, 1)
        GLES30.glEnableVertexAttribArray(2)
        GLES30.glVertexAttribPointer(2, 4, GLES30.GL_FLOAT, false, 32, 16)
        GLES30.glVertexAttribDivisor(2, 1)
        GLES30.glBindVertexArray(0)
        GLES30.glBindBuffer(GLES30.GL_ARRAY_BUFFER, 0)
    }

    fun clear() {
        count = 0
    }

    fun add(x: Float, y: Float, z: Float, size: Float, r: Float, g: Float, b: Float, a: Float) {
        if (count >= capacity) return
        val o = count * 8
        val d = data
        d[o] = x; d[o + 1] = y; d[o + 2] = z; d[o + 3] = size
        d[o + 4] = r; d[o + 5] = g; d[o + 6] = b; d[o + 7] = a
        count++
    }

    fun draw() {
        if (count == 0) return
        Gl.drawCalls++
        buffer.position(0)
        buffer.put(data, 0, count * 8)
        buffer.position(0)
        GLES30.glBindBuffer(GLES30.GL_ARRAY_BUFFER, instVbo)
        GLES30.glBufferData(GLES30.GL_ARRAY_BUFFER, capacity * 32, null, GLES30.GL_STREAM_DRAW)
        GLES30.glBufferSubData(GLES30.GL_ARRAY_BUFFER, 0, count * 32, buffer)
        GLES30.glBindVertexArray(vao)
        GLES30.glDrawArraysInstanced(GLES30.GL_TRIANGLE_STRIP, 0, 4, count)
        GLES30.glBindVertexArray(0)
    }
}
