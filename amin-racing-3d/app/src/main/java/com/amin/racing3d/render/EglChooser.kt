package com.amin.racing3d.render

import android.opengl.GLSurfaceView
import javax.microedition.khronos.egl.EGL10
import javax.microedition.khronos.egl.EGLConfig
import javax.microedition.khronos.egl.EGLDisplay

/**
 * Picks an RGB888 ES 3 window config with a 24-bit depth buffer.
 *
 * GLSurfaceView's default chooser asks for only 16 bits of depth. With the game's long view range
 * that is not enough to separate the road from the ground, kerbs, lot markings and decals, so on
 * many phones those surfaces flickered ("z-fighting"). Falls back to 16-bit depth when a device has
 * no 24-bit config, and finally to whatever ES 3 config exists.
 */
class EglChooser : GLSurfaceView.EGLConfigChooser {
    /** depth bits of the config that was picked (shown in the developer overlay) */
    @Volatile var depthBits = 0
        private set

    override fun chooseConfig(egl: EGL10, display: EGLDisplay): EGLConfig {
        for (depth in intArrayOf(24, 16)) {
            val cfg = pick(egl, display, depth)
            if (cfg != null) return cfg
        }
        val any = pick(egl, display, 0) ?: throw IllegalArgumentException("no ES3 EGL config")
        return any
    }

    private fun pick(egl: EGL10, display: EGLDisplay, depth: Int): EGLConfig? {
        val attribs = intArrayOf(
            EGL10.EGL_RED_SIZE, 8, EGL10.EGL_GREEN_SIZE, 8, EGL10.EGL_BLUE_SIZE, 8,
            EGL10.EGL_DEPTH_SIZE, depth,
            EGL10.EGL_RENDERABLE_TYPE, EGL_OPENGL_ES3_BIT,
            EGL10.EGL_NONE
        )
        val num = IntArray(1)
        if (!egl.eglChooseConfig(display, attribs, null, 0, num) || num[0] <= 0) return null
        val configs = arrayOfNulls<EGLConfig>(num[0])
        if (!egl.eglChooseConfig(display, attribs, configs, num[0], num)) return null
        // prefer exact RGB888 without MSAA (MSAA on the window surface is a big cost on weak GPUs)
        var best: EGLConfig? = null
        var bestScore = Int.MAX_VALUE
        val v = IntArray(1)
        for (c in configs) {
            if (c == null) continue
            fun attr(a: Int): Int = if (egl.eglGetConfigAttrib(display, c, a, v)) v[0] else 0
            val d = attr(EGL10.EGL_DEPTH_SIZE)
            if (d < depth) continue
            val score = (attr(EGL10.EGL_RED_SIZE) - 8) + (attr(EGL10.EGL_GREEN_SIZE) - 8) + (attr(EGL10.EGL_BLUE_SIZE) - 8) +
                attr(EGL10.EGL_ALPHA_SIZE) + attr(EGL10.EGL_SAMPLES) * 8 + attr(EGL10.EGL_STENCIL_SIZE) + (d - depth)
            if (score < bestScore) { bestScore = score; best = c; depthBits = d }
        }
        return best
    }

    companion object {
        private const val EGL_OPENGL_ES3_BIT = 0x40
    }
}
