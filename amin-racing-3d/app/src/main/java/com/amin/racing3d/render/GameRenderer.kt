package com.amin.racing3d.render

import android.content.Context
import android.opengl.GLES30
import android.opengl.GLSurfaceView
import android.opengl.Matrix
import android.os.SystemClock
import com.amin.racing3d.game.GameData
import com.amin.racing3d.game.World
import javax.microedition.khronos.egl.EGLConfig
import javax.microedition.khronos.opengles.GL10
import kotlin.math.abs
import kotlin.math.atan
import kotlin.math.cos
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sin
import kotlin.math.sqrt
import kotlin.math.tan

interface RendererCallbacks {
    fun onGlReady()
    fun onFps(fps: Int)
    fun onAutoQualityDrop(newLevel: Int)
    fun onGlError(message: String)
}

/**
 * OpenGL ES 3.0 renderer. Drives the simulation (fixed per-frame update on the GL thread),
 * renders sky, shadow map, instanced scene, decals and particles, and monitors performance.
 */
class GameRenderer(
    private val context: Context,
    private val world: World,
    private val callbacks: RendererCallbacks
) : GLSurfaceView.Renderer {

    // ------------------------------------------------------------------ settings (UI thread writes)
    @Volatile var qualityLevel = 1
    @Volatile var autoQuality = true
    @Volatile var cameraShakeEnabled = true
    @Volatile var showroomCar = 0
    @Volatile var showroomColor = 0xFF00B8FF.toInt()
    @Volatile var showroomYaw = 0f
    @Volatile var showroomDragging = false
    @Volatile var simulationPaused = false

    // ------------------------------------------------------------------ GL objects
    private var ready = false
    private var mainProg = 0
    private var depthProg = 0
    private var skyProg = 0
    private var spriteProg = 0
    private var skyVao = 0

    private lateinit var u: MainUniforms
    private var uDepthLightVP = 0
    private var uSkyCamFwd = 0; private var uSkyCamRight = 0; private var uSkyCamUp = 0; private var uSkyTanHalf = 0
    private var uSkyTop = 0; private var uSkyHorizon = 0; private var uSkySunDir = 0; private var uSkySunColor = 0
    private var uSkyNight = 0; private var uSkyTime = 0; private var uSkyClouds = 0
    private var uSpVP = 0; private var uSpRight = 0; private var uSpUp = 0; private var uSpCamPos = 0; private var uSpFog = 0; private var uSpTex = 0

    private var texRoadOne = 0
    private var texRoadTwo = 0
    private var texGround = 0
    private var texBuilding = 0
    private var texSprite = 0
    private var texAtlas = 0
    private var texWhite = 0
    private var groundEnvLoaded = -1
    private var envVersionLoaded = -1

    private var shadowFbo = 0
    private var shadowTex = 0
    private var shadowSize = 1024
    private var shadowsSupported = true

    private lateinit var playerModels: Array<VehicleModel>
    private lateinit var trafficModels: Array<VehicleModel>
    private lateinit var playerBatches: Array<InstanceBatch>
    private lateinit var trafficBatches: Array<InstanceBatch>
    private lateinit var wheelBatch: InstanceBatch
    private lateinit var coinBatch: InstanceBatch
    private lateinit var shadowBatch: InstanceBatch
    private lateinit var railBatch: InstanceBatch
    private lateinit var lampBatch: InstanceBatch
    private lateinit var buildingBatch: InstanceBatch
    private lateinit var pineBatch: InstanceBatch
    private lateinit var snowPineBatch: InstanceBatch
    private lateinit var treeBatch: InstanceBatch
    private lateinit var bushBatch: InstanceBatch
    private lateinit var cactusBatch: InstanceBatch
    private lateinit var rockBatch: InstanceBatch
    private lateinit var sign1Batch: InstanceBatch
    private lateinit var sign2Batch: InstanceBatch
    private lateinit var billboardBatch: InstanceBatch
    private lateinit var checkpointBatch: InstanceBatch
    private lateinit var mountainBatch: InstanceBatch
    private lateinit var roadBatch: InstanceBatch
    private lateinit var groundBatch: InstanceBatch
    private lateinit var showroomBatch: InstanceBatch
    private lateinit var additive: SpriteBatch
    private lateinit var alphaSprites: SpriteBatch

    private lateinit var casterBatches: Array<InstanceBatch>
    private lateinit var allSceneBatches: Array<InstanceBatch>

    // ------------------------------------------------------------------ camera
    private val proj = FloatArray(16)
    private val view = FloatArray(16)
    private val viewProj = FloatArray(16)
    private val lightView = FloatArray(16)
    private val lightProj = FloatArray(16)
    private val lightVP = FloatArray(16)
    private var width = 1
    private var height = 1
    private var camX = 0f; private var camY = 3f; private var camZ = 8f
    private var lookX = 0f; private var lookY = 1f; private var lookZ = 0f
    private var fovY = 60f
    private var camRoll = 0f
    private var camInit = false

    // ------------------------------------------------------------------ lighting palette
    private val sunDir = FloatArray(3)
    private val sunColor = FloatArray(3)
    private val skyTop = FloatArray(3)
    private val horizon = FloatArray(3)
    private val skyAmb = FloatArray(3)
    private val groundAmb = FloatArray(3)
    private var night = 0f
    private var fogDensity = 0.003f
    private var lightsOn = 0f

    // ------------------------------------------------------------------ timing / perf
    private var lastNanos = 0L
    private var fpsFrames = 0
    private var fpsTime = 0f
    private var lowFpsWindows = 0
    private var qualityCooldown = 0f
    private var appliedQuality = -1
    private var startupTime = 0f
    @Volatile var currentFps = 60
        private set

    private class MainUniforms(p: Int) {
        val viewProj = GLES30.glGetUniformLocation(p, "uViewProj")
        val lightVP = GLES30.glGetUniformLocation(p, "uLightVP")
        val texMode = GLES30.glGetUniformLocation(p, "uTexMode")
        val texScale = GLES30.glGetUniformLocation(p, "uTexScale")
        val blink = GLES30.glGetUniformLocation(p, "uBlink")
        val tex = GLES30.glGetUniformLocation(p, "uTex")
        val shadowMap = GLES30.glGetUniformLocation(p, "uShadowMap")
        val shadowOn = GLES30.glGetUniformLocation(p, "uShadowOn")
        val shadowTexel = GLES30.glGetUniformLocation(p, "uShadowTexel")
        val sunDir = GLES30.glGetUniformLocation(p, "uSunDir")
        val sunColor = GLES30.glGetUniformLocation(p, "uSunColor")
        val skyAmb = GLES30.glGetUniformLocation(p, "uSkyAmb")
        val groundAmb = GLES30.glGetUniformLocation(p, "uGroundAmb")
        val fogColor = GLES30.glGetUniformLocation(p, "uFogColor")
        val skyTop = GLES30.glGetUniformLocation(p, "uSkyTop")
        val camPos = GLES30.glGetUniformLocation(p, "uCamPos")
        val fogDensity = GLES30.glGetUniformLocation(p, "uFogDensity")
        val fogScale = GLES30.glGetUniformLocation(p, "uFogScale")
        val night = GLES30.glGetUniformLocation(p, "uNight")
        val reflect = GLES30.glGetUniformLocation(p, "uReflect")
        val headPos = GLES30.glGetUniformLocation(p, "uHeadPos")
        val headDir = GLES30.glGetUniformLocation(p, "uHeadDir")
        val headOn = GLES30.glGetUniformLocation(p, "uHeadOn")
        val lampOn = GLES30.glGetUniformLocation(p, "uLampOn")
        val lampSpacing = GLES30.glGetUniformLocation(p, "uLampSpacing")
        val lampPhase = GLES30.glGetUniformLocation(p, "uLampPhase")
        val lampX = GLES30.glGetUniformLocation(p, "uLampX")
    }

    // ================================================================== GL lifecycle
    override fun onSurfaceCreated(gl: GL10?, config: EGLConfig?) {
        ready = false
        try {
            initGl()
            ready = true
            callbacks.onGlReady()
        } catch (e: Throwable) {
            callbacks.onGlError(e.message ?: e.toString())
        }
    }

    override fun onSurfaceChanged(gl: GL10?, w: Int, h: Int) {
        width = max(1, w); height = max(1, h)
        GLES30.glViewport(0, 0, width, height)
    }

    private fun initGl() {
        Textures.detectAniso()
        mainProg = Gl.program(Shaders.MAIN_VS, Shaders.MAIN_FS)
        depthProg = Gl.program(Shaders.DEPTH_VS, Shaders.DEPTH_FS)
        skyProg = Gl.program(Shaders.SKY_VS, Shaders.SKY_FS)
        spriteProg = Gl.program(Shaders.SPRITE_VS, Shaders.SPRITE_FS)
        u = MainUniforms(mainProg)
        uDepthLightVP = GLES30.glGetUniformLocation(depthProg, "uLightVP")
        uSkyCamFwd = GLES30.glGetUniformLocation(skyProg, "uCamFwd")
        uSkyCamRight = GLES30.glGetUniformLocation(skyProg, "uCamRight")
        uSkyCamUp = GLES30.glGetUniformLocation(skyProg, "uCamUp")
        uSkyTanHalf = GLES30.glGetUniformLocation(skyProg, "uTanHalf")
        uSkyTop = GLES30.glGetUniformLocation(skyProg, "uSkyTop")
        uSkyHorizon = GLES30.glGetUniformLocation(skyProg, "uHorizon")
        uSkySunDir = GLES30.glGetUniformLocation(skyProg, "uSunDir")
        uSkySunColor = GLES30.glGetUniformLocation(skyProg, "uSunColor")
        uSkyNight = GLES30.glGetUniformLocation(skyProg, "uNight")
        uSkyTime = GLES30.glGetUniformLocation(skyProg, "uTime")
        uSkyClouds = GLES30.glGetUniformLocation(skyProg, "uClouds")
        uSpVP = GLES30.glGetUniformLocation(spriteProg, "uViewProj")
        uSpRight = GLES30.glGetUniformLocation(spriteProg, "uCamRight")
        uSpUp = GLES30.glGetUniformLocation(spriteProg, "uCamUp")
        uSpCamPos = GLES30.glGetUniformLocation(spriteProg, "uCamPos")
        uSpFog = GLES30.glGetUniformLocation(spriteProg, "uFogDensity")
        uSpTex = GLES30.glGetUniformLocation(spriteProg, "uTex")

        // sky full-screen triangle
        val ids = IntArray(2)
        GLES30.glGenVertexArrays(1, ids, 0)
        skyVao = ids[0]
        GLES30.glGenBuffers(1, ids, 1)
        val tri = Gl.floatBuffer(6)
        tri.put(floatArrayOf(-1f, -1f, 3f, -1f, -1f, 3f)).position(0)
        GLES30.glBindVertexArray(skyVao)
        GLES30.glBindBuffer(GLES30.GL_ARRAY_BUFFER, ids[1])
        GLES30.glBufferData(GLES30.GL_ARRAY_BUFFER, 24, tri, GLES30.GL_STATIC_DRAW)
        GLES30.glEnableVertexAttribArray(0)
        GLES30.glVertexAttribPointer(0, 2, GLES30.GL_FLOAT, false, 8, 0)
        GLES30.glBindVertexArray(0)

        // textures
        texRoadOne = Textures.road(false)
        texRoadTwo = Textures.road(true)
        texBuilding = Textures.building()
        texSprite = Textures.sprite()
        texAtlas = Textures.atlas(context)
        texWhite = Textures.upload(intArrayOf(-1), 1, 1, true, false)
        texGround = Textures.ground(world.env, 0)
        groundEnvLoaded = world.env

        // models
        playerModels = arrayOf(Models.sports(), Models.muscle(), Models.suv(), Models.supercar())
        trafficModels = arrayOf(Models.sedan(), Models.taxi(), Models.van(), Models.truck(), Models.bus())
        playerBatches = Array(4) { InstanceBatch(playerModels[it].mesh, 2) }
        trafficBatches = Array(5) { InstanceBatch(trafficModels[it].mesh, World.MAX_TRAFFIC) }
        wheelBatch = InstanceBatch(Models.wheel(), World.MAX_TRAFFIC * 6 + 8)
        coinBatch = InstanceBatch(Models.coin(), World.MAX_COINS)
        shadowBatch = InstanceBatch(Models.shadowDecal(), World.MAX_TRAFFIC + 4)
        railBatch = InstanceBatch(Models.guardrail(), 70)
        lampBatch = InstanceBatch(Models.streetLamp(), 40)
        buildingBatch = InstanceBatch(Models.building(), 120)
        pineBatch = InstanceBatch(Models.pine(false), 160)
        snowPineBatch = InstanceBatch(Models.pine(true), 160)
        treeBatch = InstanceBatch(Models.broadleaf(), 160)
        bushBatch = InstanceBatch(Models.bush(), 160)
        cactusBatch = InstanceBatch(Models.cactus(), 160)
        rockBatch = InstanceBatch(Models.rock(), 160)
        sign1Batch = InstanceBatch(Models.roadSign(0), 8)
        sign2Batch = InstanceBatch(Models.roadSign(1), 8)
        billboardBatch = InstanceBatch(Models.billboard(), 8)
        checkpointBatch = InstanceBatch(Models.checkpoint(), 2)
        mountainBatch = InstanceBatch(Models.mountains(7), 1)
        roadBatch = InstanceBatch(Models.road(Textures.ROAD_HALF_WIDTH), 1)
        groundBatch = InstanceBatch(Models.ground(), 1)
        showroomBatch = InstanceBatch(Models.showroom(), 1)
        additive = SpriteBatch(1400)
        alphaSprites = SpriteBatch(900)

        casterBatches = arrayOf(
            playerBatches[0], playerBatches[1], playerBatches[2], playerBatches[3],
            trafficBatches[0], trafficBatches[1], trafficBatches[2], trafficBatches[3], trafficBatches[4],
            buildingBatch, pineBatch, snowPineBatch, treeBatch, cactusBatch, lampBatch, sign1Batch, sign2Batch,
            billboardBatch, checkpointBatch, railBatch
        )
        allSceneBatches = arrayOf(
            playerBatches[0], playerBatches[1], playerBatches[2], playerBatches[3],
            trafficBatches[0], trafficBatches[1], trafficBatches[2], trafficBatches[3], trafficBatches[4],
            wheelBatch, coinBatch, shadowBatch, railBatch, lampBatch, buildingBatch, pineBatch, snowPineBatch,
            treeBatch, bushBatch, cactusBatch, rockBatch, sign1Batch, sign2Batch, billboardBatch, checkpointBatch,
            mountainBatch, roadBatch, groundBatch, showroomBatch
        )

        createShadowMap(if (qualityLevel >= 2) 2048 else 1024)

        GLES30.glEnable(GLES30.GL_DEPTH_TEST)
        GLES30.glDepthFunc(GLES30.GL_LEQUAL)
        GLES30.glEnable(GLES30.GL_CULL_FACE)
        GLES30.glCullFace(GLES30.GL_BACK)
        GLES30.glFrontFace(GLES30.GL_CCW)
        lastNanos = System.nanoTime()
        appliedQuality = -1
        envVersionLoaded = -1
        camInit = false
        Gl.checkError("initGl")
    }

    private fun createShadowMap(size: Int) {
        val ids = IntArray(1)
        if (shadowTex != 0) { ids[0] = shadowTex; GLES30.glDeleteTextures(1, ids, 0) }
        if (shadowFbo != 0) { ids[0] = shadowFbo; GLES30.glDeleteFramebuffers(1, ids, 0) }
        shadowSize = size
        GLES30.glGenTextures(1, ids, 0)
        shadowTex = ids[0]
        GLES30.glBindTexture(GLES30.GL_TEXTURE_2D, shadowTex)
        GLES30.glTexImage2D(GLES30.GL_TEXTURE_2D, 0, GLES30.GL_DEPTH_COMPONENT16, size, size, 0,
            GLES30.GL_DEPTH_COMPONENT, GLES30.GL_UNSIGNED_SHORT, null)
        GLES30.glTexParameteri(GLES30.GL_TEXTURE_2D, GLES30.GL_TEXTURE_MIN_FILTER, GLES30.GL_LINEAR)
        GLES30.glTexParameteri(GLES30.GL_TEXTURE_2D, GLES30.GL_TEXTURE_MAG_FILTER, GLES30.GL_LINEAR)
        GLES30.glTexParameteri(GLES30.GL_TEXTURE_2D, GLES30.GL_TEXTURE_WRAP_S, GLES30.GL_CLAMP_TO_EDGE)
        GLES30.glTexParameteri(GLES30.GL_TEXTURE_2D, GLES30.GL_TEXTURE_WRAP_T, GLES30.GL_CLAMP_TO_EDGE)
        GLES30.glTexParameteri(GLES30.GL_TEXTURE_2D, GLES30.GL_TEXTURE_COMPARE_MODE, GLES30.GL_COMPARE_REF_TO_TEXTURE)
        GLES30.glTexParameteri(GLES30.GL_TEXTURE_2D, GLES30.GL_TEXTURE_COMPARE_FUNC, GLES30.GL_LEQUAL)
        GLES30.glGenFramebuffers(1, ids, 0)
        shadowFbo = ids[0]
        GLES30.glBindFramebuffer(GLES30.GL_FRAMEBUFFER, shadowFbo)
        GLES30.glFramebufferTexture2D(GLES30.GL_FRAMEBUFFER, GLES30.GL_DEPTH_ATTACHMENT, GLES30.GL_TEXTURE_2D, shadowTex, 0)
        GLES30.glDrawBuffers(1, intArrayOf(GLES30.GL_NONE), 0)
        GLES30.glReadBuffer(GLES30.GL_NONE)
        shadowsSupported = GLES30.glCheckFramebufferStatus(GLES30.GL_FRAMEBUFFER) == GLES30.GL_FRAMEBUFFER_COMPLETE
        GLES30.glBindFramebuffer(GLES30.GL_FRAMEBUFFER, 0)
        GLES30.glBindTexture(GLES30.GL_TEXTURE_2D, 0)
    }

    // ================================================================== frame
    override fun onDrawFrame(gl: GL10?) {
        val now = System.nanoTime()
        var dt = (now - lastNanos) / 1e9f
        lastNanos = now
        if (dt > 0.05f) dt = 0.05f
        if (dt < 0f) dt = 0f
        if (!ready) {
            GLES30.glClearColor(0.03f, 0.04f, 0.08f, 1f)
            GLES30.glClear(GLES30.GL_COLOR_BUFFER_BIT)
            return
        }
        applyQuality()
        if (!simulationPaused && !world.paused) world.update(dt)
        if (world.envVersion != envVersionLoaded) {
            envVersionLoaded = world.envVersion
            if (groundEnvLoaded != world.env) {
                texGround = Textures.ground(world.env, texGround)
                groundEnvLoaded = world.env
            }
        }
        computePalette()
        updateCamera(dt)
        buildScene()
        render()
        monitorPerformance(dt)
    }

    private fun applyQuality() {
        val q = qualityLevel
        if (q == appliedQuality) return
        appliedQuality = q
        world.setSceneryDensity(DENSITY[q])
        world.particles.limit = PARTICLES[q]
        val wantShadow = if (q >= 2) 2048 else 1024
        if (wantShadow != shadowSize) createShadowMap(wantShadow)
    }

    // ================================================================== lighting
    private fun lerp3(out: FloatArray, a: FloatArray, b: FloatArray, t: Float) {
        out[0] = a[0] + (b[0] - a[0]) * t
        out[1] = a[1] + (b[1] - a[1]) * t
        out[2] = a[2] + (b[2] - a[2]) * t
    }

    private fun computePalette() {
        val showroom = world.state == World.STATE_SHOWROOM
        if (showroom) {
            set3(sunDir, 0.3f, 0.85f, 0.42f); norm(sunDir)
            set3(sunColor, 1.0f, 0.97f, 0.92f)
            set3(skyTop, 0.02f, 0.03f, 0.08f)
            set3(horizon, 0.04f, 0.05f, 0.1f)
            set3(skyAmb, 0.32f, 0.36f, 0.5f)
            set3(groundAmb, 0.1f, 0.1f, 0.16f)
            night = 0.6f
            fogDensity = 0.012f
            lightsOn = 1f
            return
        }
        val t = world.tod
        val i0 = floor(t).toInt() % 4
        val i1 = (i0 + 1) % 4
        var f = t - floor(t)
        f = f * f * (3f - 2f * f)
        val a = KEYS[i0]; val b = KEYS[i1]
        lerp3(sunDir, a.sunDir, b.sunDir, f); norm(sunDir)
        lerp3(sunColor, a.sunColor, b.sunColor, f)
        lerp3(skyTop, a.skyTop, b.skyTop, f)
        lerp3(horizon, a.horizon, b.horizon, f)
        lerp3(skyAmb, a.skyAmb, b.skyAmb, f)
        lerp3(groundAmb, a.groundAmb, b.groundAmb, f)
        night = a.night + (b.night - a.night) * f
        var fog = FOG[appliedQuality.coerceIn(0, 2)]
        when (world.env) {
            GameData.ENV_DESERT -> {
                horizon[0] *= 1.08f; horizon[1] *= 0.98f; horizon[2] *= 0.86f
                skyAmb[0] *= 1.08f; skyAmb[2] *= 0.9f
                groundAmb[0] *= 1.3f; groundAmb[1] *= 1.15f
                fog *= 1.05f
            }
            GameData.ENV_SNOW -> {
                val k = 0.45f * (1f - night)
                horizon[0] += (0.86f - horizon[0]) * k; horizon[1] += (0.9f - horizon[1]) * k; horizon[2] += (0.97f - horizon[2]) * k
                skyAmb[0] += 0.08f; skyAmb[1] += 0.09f; skyAmb[2] += 0.12f
                groundAmb[0] += 0.12f * (1f - night); groundAmb[1] += 0.13f * (1f - night); groundAmb[2] += 0.16f * (1f - night)
                fog *= GameData.envs[GameData.ENV_SNOW].fogMul
            }
            GameData.ENV_FOREST -> {
                horizon[0] *= 0.88f; horizon[2] *= 0.94f
                groundAmb[1] *= 1.25f
                fog *= GameData.envs[GameData.ENV_FOREST].fogMul
            }
            else -> {
                horizon[0] += 0.07f * night; horizon[1] += 0.045f * night; horizon[2] += 0.02f * night
            }
        }
        fogDensity = fog
        lightsOn = smooth(0.2f, 0.55f, night)
    }

    private fun smooth(e0: Float, e1: Float, x: Float): Float {
        val t = ((x - e0) / (e1 - e0)).coerceIn(0f, 1f)
        return t * t * (3f - 2f * t)
    }

    // ================================================================== camera
    private fun updateCamera(dt: Float) {
        val aspect = width.toFloat() / height
        val portrait = aspect < 1f
        val w = world
        val k = 1f - exp01(-dt * 6f)
        var tx: Float; var ty: Float; var tz: Float
        var lx: Float; var ly: Float; var lz: Float
        var targetFov: Float
        var targetRoll = 0f
        when (w.state) {
            World.STATE_SHOWROOM -> {
                val dist = if (portrait) 9.5f else 7.2f
                val ang = 0.55f
                tx = sin(ang) * dist; ty = if (portrait) 2.6f else 2.0f; tz = cos(ang) * dist
                lx = 0f; ly = if (portrait) 0.55f else 0.7f; lz = 0f
                targetFov = if (portrait) 55f else 38f
            }
            World.STATE_ATTRACT -> {
                val a = w.time * 0.12f
                val dist = 9.5f + sin(w.time * 0.21f) * 2.5f
                val pz = -w.ps
                tx = w.px + sin(a) * dist; ty = 2.2f + sin(w.time * 0.17f) * 0.8f; tz = pz + cos(a) * dist
                lx = w.px; ly = 0.9f; lz = pz
                targetFov = if (portrait) 70f else 48f
            }
            World.STATE_COUNTDOWN -> {
                val p = (w.countdown / 3f).coerceIn(0f, 1f)
                val ease = p * p
                val a = 2.6f * ease
                val dist = 6.8f + ease * 1.5f
                val pz = -w.ps
                tx = w.px + sin(a) * dist; ty = 2.3f + ease * 0.5f + (if (portrait) 0.8f else 0f); tz = pz + cos(a) * dist
                lx = w.px; ly = 0.9f; lz = pz - 4f * (1f - ease)
                targetFov = if (portrait) 78f else 56f
            }
            else -> {
                val speedRatio = (w.speed / 80f).coerceIn(0f, 1.2f)
                val back = 6.4f + speedRatio * 1.0f + (if (portrait) 1.8f else 0f)
                val up = 2.45f + (if (portrait) 0.95f else 0f) - speedRatio * 0.15f
                val pz = -w.ps
                if (w.state == World.STATE_CRASHED || w.state == World.STATE_OVER) {
                    tx = camX + (w.px + 4f - camX) * 0.02f; ty = 3.4f; tz = camZ + ((pz + 9f) - camZ) * 0.03f
                    lx = w.px; ly = 0.8f; lz = pz
                } else {
                    tx = w.px * 0.86f; ty = up; tz = pz + back
                    lx = w.px * 0.95f; ly = 1.0f; lz = pz - 14f
                }
                val nitroBoost = if (w.nitroActive) 9f else 0f
                targetFov = if (portrait) {
                    val hfov = 66f + speedRatio * 16f + nitroBoost
                    val v = 2f * Math.toDegrees(atan(tan(Math.toRadians(hfov / 2.0)) / aspect).toDouble()).toFloat()
                    min(v, 102f)
                } else 54f + speedRatio * 15f + nitroBoost
                targetRoll = -w.vx * 0.006f
            }
        }
        if (!camInit) {
            camX = tx; camY = ty; camZ = tz; lookX = lx; lookY = ly; lookZ = lz; fovY = targetFov; camInit = true
        }
        val follow = if (w.state == World.STATE_RACING) 1f - exp01(-dt * 10f) else k
        camX += (tx - camX) * follow
        camY += (ty - camY) * follow
        camZ = if (w.state == World.STATE_RACING) tz else camZ + (tz - camZ) * follow
        lookX += (lx - lookX) * follow
        lookY += (ly - lookY) * follow
        lookZ = if (w.state == World.STATE_RACING) lz else lookZ + (lz - lookZ) * follow
        fovY += (targetFov - fovY) * (1f - exp01(-dt * 3f))
        camRoll += (targetRoll - camRoll) * (1f - exp01(-dt * 4f))

        var sx = 0f; var sy = 0f
        if (cameraShakeEnabled) {
            val s = w.shake * w.shake
            val t = w.time
            sx = (sin(t * 37f) * 0.6f + sin(t * 61f) * 0.4f) * s * 0.35f
            sy = (sin(t * 43f) * 0.6f + sin(t * 71f) * 0.4f) * s * 0.3f
            if (w.state == World.STATE_RACING) {
                val v = ((w.speed - 30f) / 60f).coerceIn(0f, 1f) * (if (w.nitroActive) 0.03f else 0.012f)
                sx += sin(t * 53f) * v
                sy += sin(t * 67f) * v
            }
        }
        val upX = sin(camRoll); val upY = cos(camRoll)
        Matrix.setLookAtM(view, 0, camX + sx, camY + sy, camZ, lookX + sx * 0.5f, lookY + sy * 0.5f, lookZ, upX, upY, 0f)
        Matrix.perspectiveM(proj, 0, fovY, aspect, 0.35f, 1300f)
        Matrix.multiplyMM(viewProj, 0, proj, 0, view, 0)
    }

    private fun exp01(x: Float): Float = Math.exp(x.toDouble()).toFloat()

    // ================================================================== scene assembly
    private fun clearBatches() {
        for (b in allSceneBatches) b.clear()
        additive.clear()
        alphaSprites.clear()
    }

    private fun buildScene() {
        clearBatches()
        val w = world
        if (w.state == World.STATE_SHOWROOM) {
            buildShowroom()
            return
        }
        val q = appliedQuality.coerceIn(0, 2)
        val drawDist = DRAW_DIST[q]
        val pz = -w.ps

        // environment base
        roadBatch.add(0f, 0f, pz, 0f, 0f, 0f, 1f, 1f, 1f, 1f, 1f, 1f, 1f, 0f, 0f, 0f, 0f)
        groundBatch.add(w.px, 0f, pz, 0f, 0f, 0f, 1f, 1f, 1f, 1f, 1f, 1f, 1f, 0f, 0f, 0f, 0f)
        val mt = MOUNTAIN_TINT[w.env]
        mountainBatch.add(camX, 0f, camZ, 0f, 0f, 0f, 1f, 1f, 1f, mt[0], mt[1], mt[2], 1f, 0f, 0f, 0f, 0f)

        // scenery
        val minS = w.ps - 30f
        val maxS = w.ps + drawDist
        val lampGlow = lightsOn > 0.05f && q >= 1
        for (it in w.scenery) {
            if (!it.visible || it.s < minS || it.s > maxS) continue
            val z = -it.s
            when (it.kind) {
                World.K_RAIL -> railBatch.add(it.x, 0f, z, it.yaw, 0f, 0f, 1f, 1f, 1f, 1f, 1f, 1f, 1f, 0f, lightsOn, 0f, 0f)
                World.K_LAMP -> {
                    lampBatch.add(it.x, 0f, z, it.yaw, 0f, 0f, 1f, 1f, 1f, 1f, 1f, 1f, 1f, 0f, lightsOn, 0f, 0f)
                    if (lampGlow) {
                        val gx = it.x + cos(it.yaw) * 2.65f
                        additive.add(gx, 8.12f, z, 1.6f, 1f, 0.78f, 0.45f, 0.55f * lightsOn)
                        additive.add(gx, 8.12f, z, 0.5f, 1f, 0.95f, 0.8f, 0.9f * lightsOn)
                    }
                }
                World.K_BUILDING -> buildingBatch.add(it.x, 0f, z, 0f, 0f, 0f, it.sx, it.sy, it.sz, it.r, it.g, it.b, 1f, 0f, 0f, 0f, 0f)
                World.K_PINE -> pineBatch.add(it.x, 0f, z, it.yaw, 0f, 0f, it.sx, it.sy, it.sz, 1f, 1f, 1f, 1f, 0f, 0f, 0f, 0f)
                World.K_SNOWPINE -> snowPineBatch.add(it.x, 0f, z, it.yaw, 0f, 0f, it.sx, it.sy, it.sz, 1f, 1f, 1f, 1f, 0f, 0f, 0f, 0f)
                World.K_TREE -> treeBatch.add(it.x, 0f, z, it.yaw, 0f, 0f, it.sx, it.sy, it.sz, 1f, 1f, 1f, 1f, 0f, 0f, 0f, 0f)
                World.K_BUSH -> bushBatch.add(it.x, 0f, z, it.yaw, 0f, 0f, it.sx, it.sy, it.sz, it.r, it.g, it.b, 1f, 0f, 0f, 0f, 0f)
                World.K_CACTUS -> cactusBatch.add(it.x, 0f, z, it.yaw, 0f, 0f, it.sx, it.sy, it.sz, 1f, 1f, 1f, 1f, 0f, 0f, 0f, 0f)
                World.K_ROCK -> rockBatch.add(it.x, -0.2f, z, it.yaw, 0f, 0f, it.sx, it.sy, it.sz, it.r, it.g, it.b, 1f, 0f, 0f, 0f, 0f)
                World.K_SIGN1 -> sign1Batch.add(it.x, 0f, z, 0f, 0f, 0f, 1f, 1f, 1f, 1f, 1f, 1f, 1f, 0f, 0f, 0f, 0f)
                World.K_SIGN2 -> sign2Batch.add(it.x, 0f, z, 0f, 0f, 0f, 1f, 1f, 1f, 1f, 1f, 1f, 1f, 0f, 0f, 0f, 0f)
                World.K_BILLBOARD -> billboardBatch.add(it.x, 0f, z, 0f, 0f, 0f, 1f, 1f, 1f, 1f, 1f, 1f, 1f, 0f, lightsOn, 0f, 0f)
                else -> {}
            }
        }
        if (w.mode == GameData.MODE_TIME_ATTACK && w.isRacing) {
            val cs = w.nextCheckpointS
            if (cs > w.ps - 20f && cs < w.ps + drawDist) {
                checkpointBatch.add(0f, 0f, -cs, 0f, 0f, 0f, 1f, 1f, 1f, 1f, 1f, 1f, 1f, 0f, 1f, 0f, 0f)
            }
        }

        // coins
        for (c in w.coins) {
            if (!c.active || c.s > w.ps + drawDist) continue
            val bob = sin(c.spin * 1.3f) * 0.12f
            coinBatch.add(c.x, 0.95f + bob, -c.s, c.spin, 0f, 0f, 1f, 1f, 1f, 1f, 1f, 1f, 1f, 0f, 0f, 0f, 0f)
            additive.add(c.x, 0.95f + bob, -c.s, 1.1f, 1f, 0.8f, 0.2f, 0.32f)
        }

        // traffic
        val blinkOn = if ((w.time * 2.4f) % 1f < 0.5f) 1f else 0f
        blinkPhase = blinkOn
        for (t in w.traffic) {
            if (!t.active) continue
            if (t.s > w.ps + drawDist + 20f) continue
            val model = trafficModels[t.type]
            val yaw = (if (t.dir < 0) Math.PI.toFloat() else 0f) + t.yaw
            val z = -t.s
            val signalling = t.signal > 0f || t.laneT < 1f
            val localSide = t.signalSide * t.dir
            val bl = if (signalling && localSide < 0) 1f else 0f
            val br = if (signalling && localSide > 0) 1f else 0f
            trafficBatches[t.type].add(t.x, 0f, z, yaw, 0f, 0f, 1f, 1f, 1f, t.r, t.g, t.b, 1f, t.brakeLight, lightsOn, bl, br)
            addWheels(model, t.x, z, yaw, 0f, t.wheelAngle, 1f)
            shadowBatch.add(t.x, 0f, z, yaw, 0f, 0f, model.width * 1.25f, 1f, model.length * 1.12f, 1f, 1f, 1f, 0.55f, 0f, 0f, 0f, 0f)
            addVehicleGlows(model, t.x, z, yaw, t.brakeLight, t.dir < 0)
        }

        // player
        val spec = w.carId
        val pm = playerModels[spec]
        val c = w.carColor
        val cr = ((c shr 16) and 0xFF) / 255f; val cg = ((c shr 8) and 0xFF) / 255f; val cb = (c and 0xFF) / 255f
        val brake = if (w.braking) 1f else 0f
        playerBatches[spec].add(w.px, w.suspY, pz, w.yaw, w.pitch, w.roll, 1f, 1f, 1f, cr, cg, cb, 1f,
            brake, lightsOn, if (w.blinkLeft) 1f else 0f, if (w.blinkRight) 1f else 0f)
        addWheels(pm, w.px, pz, w.yaw, w.steerAngle, w.wheelAngle, 1f)
        shadowBatch.add(w.px, 0f, pz, w.yaw, 0f, 0f, pm.width * 1.3f, 1f, pm.length * 1.15f, 1f, 1f, 1f, 0.6f, 0f, 0f, 0f, 0f)
        addVehicleGlows(pm, w.px, pz, w.yaw, brake, false)

        // particles
        val p = w.particles
        for (i in 0 until p.capacity) {
            if (p.life[i] <= 0f) continue
            val a = p.alpha(i)
            if (a <= 0.003f) continue
            if (p.additive[i]) additive.add(p.x[i], p.y[i], p.z[i], p.size(i), p.colorR(i), p.colorG(i), p.colorB(i), a)
            else alphaSprites.add(p.x[i], p.y[i], p.z[i], p.size(i), p.colorR(i), p.colorG(i), p.colorB(i), a)
        }

        // weather
        if (w.env == GameData.ENV_SNOW) addSnow(SNOW_COUNT[q], 0.95f, 0.97f, 1f, 0.75f, 2.2f, 0.07f)
        else if (w.env == GameData.ENV_DESERT) addSnow(SNOW_COUNT[q] / 4, 0.85f, 0.7f, 0.5f, 0.35f, -0.2f, 0.05f)
    }

    private var blinkPhase = 0f

    private fun addSnow(count: Int, r: Float, g: Float, b: Float, a: Float, fall: Float, size: Float) {
        val t = world.time
        for (i in 0 until count) {
            val h1 = hash(i * 3 + 1); val h2 = hash(i * 3 + 2); val h3 = hash(i * 3 + 3)
            val x = camX + (h1 - 0.5f) * 36f + sin(t * 0.7f + i) * 0.6f
            var y = (h2 * 14f - t * fall * (0.7f + h3 * 0.6f)) % 14f
            if (y < 0f) y += 14f
            val period = 60f
            var uz = (h3 * period + camZ) % period
            if (uz < 0f) uz += period
            val z = camZ - uz + 5f
            alphaSprites.add(x, y, z, size * (0.7f + h1), r, g, b, a)
        }
    }

    private fun hash(n: Int): Float {
        var h = n * 374761393
        h = (h xor (h ushr 13)) * 1274126177
        h = h xor (h ushr 16)
        return (h and 0xFFFF) / 65535f
    }

    private fun addWheels(m: VehicleModel, x: Float, z: Float, yaw: Float, steer: Float, spin: Float, scale: Float) {
        val ca = cos(yaw); val sa = sin(yaw)
        val r = m.wheelR * scale
        for (wi in m.wheelZ.indices) {
            val lz = m.wheelZ[wi]
            val front = wi == 0
            for (k in 0..1) {
                val side = k * 2 - 1
                val lx = side * m.wheelX
                val wx = x + lx * ca + lz * sa
                val wz = z - lx * sa + lz * ca
                val wy = if (side < 0) yaw + Math.PI.toFloat() else yaw
                val st = if (front) steer else 0f
                val pitch = if (side < 0) -spin else spin
                wheelBatch.add(wx, r, wz, wy + st, pitch, 0f, r, r, r, 1f, 1f, 1f, 1f, 0f, 0f, 0f, 0f)
            }
        }
    }

    private fun addVehicleGlows(m: VehicleModel, x: Float, z: Float, yaw: Float, brake: Float, facingCamera: Boolean) {
        val ca = cos(yaw); val sa = sin(yaw)
        val lo = lightsOn
        if (lo > 0.02f) {
            val h = m.headLights
            var i = 0
            while (i < h.size) {
                val lx = h[i]; val ly = h[i + 1]; val lz = h[i + 2] - 0.05f
                val wx = x + lx * ca + lz * sa
                val wz = z - lx * sa + lz * ca
                if (facingCamera) {
                    additive.add(wx, ly, wz, 2.4f, 1f, 0.95f, 0.85f, 0.5f * lo)
                    additive.add(wx, ly, wz, 0.7f, 1f, 1f, 1f, 0.95f * lo)
                } else {
                    additive.add(wx, ly, wz, 0.9f, 1f, 0.95f, 0.85f, 0.35f * lo)
                }
                i += 3
            }
        }
        val tl = m.tailLights
        val tailA = 0.25f * lo + brake * 0.7f
        if (tailA > 0.02f && !facingCamera) {
            var i = 0
            while (i < tl.size) {
                val lx = tl[i]; val ly = tl[i + 1]; val lz = tl[i + 2] + 0.06f
                val wx = x + lx * ca + lz * sa
                val wz = z - lx * sa + lz * ca
                additive.add(wx, ly, wz, 0.75f + brake * 0.5f, 1f, 0.12f, 0.08f, tailA)
                i += 3
            }
        }
    }

    private fun buildShowroom() {
        val id = showroomCar.coerceIn(0, 3)
        val m = playerModels[id]
        val c = showroomColor
        val cr = ((c shr 16) and 0xFF) / 255f; val cg = ((c shr 8) and 0xFF) / 255f; val cb = (c and 0xFF) / 255f
        if (!showroomDragging) showroomYaw += 0.0045f
        val yaw = showroomYaw
        showroomBatch.add(0f, 0f, 0f, 0f, 0f, 0f, 1f, 1f, 1f, 1f, 1f, 1f, 1f, 0f, 0f, 0f, 0f)
        playerBatches[id].add(0f, 0.01f, 0f, yaw, 0f, 0f, 1f, 1f, 1f, cr, cg, cb, 1f, 0f, 1f, 0f, 0f)
        addWheels(m, 0f, 0f, yaw, 0.25f, 0f, 1f)
        shadowBatch.add(0f, 0f, 0f, yaw, 0f, 0f, m.width * 1.4f, 1f, m.length * 1.2f, 1f, 1f, 1f, 0.7f, 0f, 0f, 0f, 0f)
        lightsOn = 1f
        addVehicleGlows(m, 0f, 0f, yaw, 0f, true)
        // floating neon dust
        val t = world.time
        for (i in 0 until 40) {
            val a = hash(i) * 6.283f + t * 0.1f
            val rr = 3f + hash(i + 50) * 5f
            val y = (hash(i + 100) * 5f + t * 0.3f) % 5f
            val pink = i % 2 == 0
            additive.add(cos(a) * rr, y, sin(a) * rr, 0.12f, if (pink) 1f else 0f, if (pink) 0.18f else 0.9f, if (pink) 0.6f else 1f, 0.6f)
        }
    }

    // ================================================================== rendering
    private fun render() {
        val q = appliedQuality.coerceIn(0, 2)
        val showroom = world.state == World.STATE_SHOWROOM
        val useShadows = q >= 2 && shadowsSupported && night < 0.85f && !showroom

        if (useShadows) renderShadowMap()

        GLES30.glViewport(0, 0, width, height)
        GLES30.glClearColor(horizon[0], horizon[1], horizon[2], 1f)
        GLES30.glClear(GLES30.GL_COLOR_BUFFER_BIT or GLES30.GL_DEPTH_BUFFER_BIT)

        // sky
        if (!showroom) {
            GLES30.glDisable(GLES30.GL_DEPTH_TEST)
            GLES30.glDepthMask(false)
            GLES30.glUseProgram(skyProg)
            GLES30.glUniform3f(uSkyCamFwd, -view[2], -view[6], -view[10])
            GLES30.glUniform3f(uSkyCamRight, view[0], view[4], view[8])
            GLES30.glUniform3f(uSkyCamUp, view[1], view[5], view[9])
            val th = tan(Math.toRadians(fovY / 2.0)).toFloat()
            GLES30.glUniform2f(uSkyTanHalf, th * width / height, th)
            GLES30.glUniform3f(uSkyTop, skyTop[0], skyTop[1], skyTop[2])
            GLES30.glUniform3f(uSkyHorizon, horizon[0], horizon[1], horizon[2])
            GLES30.glUniform3f(uSkySunDir, sunDir[0], sunDir[1], sunDir[2])
            GLES30.glUniform3f(uSkySunColor, sunColor[0], sunColor[1], sunColor[2])
            GLES30.glUniform1f(uSkyNight, night)
            GLES30.glUniform1f(uSkyTime, world.time)
            GLES30.glUniform1i(uSkyClouds, if (q >= 1) 1 else 0)
            GLES30.glBindVertexArray(skyVao)
            GLES30.glDrawArrays(GLES30.GL_TRIANGLES, 0, 3)
            GLES30.glBindVertexArray(0)
            GLES30.glEnable(GLES30.GL_DEPTH_TEST)
            GLES30.glDepthMask(true)
        }

        // main pass
        GLES30.glUseProgram(mainProg)
        GLES30.glUniformMatrix4fv(u.viewProj, 1, false, viewProj, 0)
        GLES30.glUniformMatrix4fv(u.lightVP, 1, false, lightVP, 0)
        GLES30.glUniform1f(u.blink, blinkPhase)
        GLES30.glUniform1i(u.tex, 0)
        GLES30.glUniform1i(u.shadowMap, 1)
        GLES30.glUniform1i(u.shadowOn, if (useShadows) 1 else 0)
        GLES30.glUniform1f(u.shadowTexel, 1f / shadowSize)
        GLES30.glUniform3f(u.sunDir, sunDir[0], sunDir[1], sunDir[2])
        GLES30.glUniform3f(u.sunColor, sunColor[0], sunColor[1], sunColor[2])
        GLES30.glUniform3f(u.skyAmb, skyAmb[0], skyAmb[1], skyAmb[2])
        GLES30.glUniform3f(u.groundAmb, groundAmb[0], groundAmb[1], groundAmb[2])
        GLES30.glUniform3f(u.fogColor, horizon[0], horizon[1], horizon[2])
        GLES30.glUniform3f(u.skyTop, skyTop[0], skyTop[1], skyTop[2])
        GLES30.glUniform3f(u.camPos, camX, camY, camZ)
        GLES30.glUniform1f(u.fogDensity, fogDensity)
        GLES30.glUniform1f(u.fogScale, 1f)
        GLES30.glUniform1f(u.night, night)
        GLES30.glUniform1f(u.reflect, REFLECT[q])
        val w = world
        if (showroom) {
            GLES30.glUniform3f(u.headPos, 0f, 0f, 0f)
            GLES30.glUniform3f(u.headDir, 0f, 0f, -1f)
            GLES30.glUniform1f(u.headOn, 0f)
            GLES30.glUniform1f(u.lampOn, 0f)
        } else {
            val ca = cos(w.yaw); val sa = sin(w.yaw)
            val hz = -w.ps - 2.2f * ca
            GLES30.glUniform3f(u.headPos, w.px - 2.2f * sa, 0.75f, hz)
            var dx = -sa; var dy = -0.09f; var dz = -ca
            val l = sqrt(dx * dx + dy * dy + dz * dz); dx /= l; dy /= l; dz /= l
            GLES30.glUniform3f(u.headDir, dx, dy, dz)
            GLES30.glUniform1f(u.headOn, lightsOn)
            GLES30.glUniform1f(u.lampOn, lightsOn)
        }
        GLES30.glUniform1f(u.lampSpacing, World.LAMP_SPACING)
        GLES30.glUniform1f(u.lampPhase, World.LAMP_PHASE)
        GLES30.glUniform1f(u.lampX, GameData.ROAD_HALF + GameData.SHOULDER + 0.75f - 2.65f)

        GLES30.glActiveTexture(GLES30.GL_TEXTURE1)
        GLES30.glBindTexture(GLES30.GL_TEXTURE_2D, shadowTex)
        GLES30.glActiveTexture(GLES30.GL_TEXTURE0)

        // untextured opaque geometry
        bindTex(texWhite, 0, 1f, 1f)
        for (b in playerBatches) b.draw()
        for (b in trafficBatches) b.draw()
        wheelBatch.draw()
        coinBatch.draw()
        showroomBatch.draw()
        railBatch.draw(); lampBatch.draw()
        pineBatch.draw(); snowPineBatch.draw(); treeBatch.draw(); bushBatch.draw(); cactusBatch.draw(); rockBatch.draw()
        // atlas
        bindTex(texAtlas, 5, 1f, 1f)
        sign1Batch.draw(); sign2Batch.draw(); billboardBatch.draw(); checkpointBatch.draw()
        // buildings
        bindTex(texBuilding, 3, Textures.BUILDING_TILE_W, Textures.BUILDING_TILE_H)
        buildingBatch.draw()
        // road & ground
        bindTex(if (w.mode == GameData.MODE_TWO_WAY) texRoadTwo else texRoadOne, 1, Textures.ROAD_TILE, 1f)
        roadBatch.draw()
        bindTex(texGround, 2, Textures.GROUND_TILE, 1f)
        groundBatch.draw()
        // mountains: no shadows, reduced fog
        GLES30.glUniform1i(u.shadowOn, 0)
        GLES30.glUniform1f(u.fogScale, 0.3f)
        GLES30.glUniform1f(u.headOn, 0f)
        GLES30.glUniform1f(u.lampOn, 0f)
        bindTex(texWhite, 0, 1f, 1f)
        mountainBatch.draw()
        GLES30.glUniform1f(u.fogScale, 1f)

        // blob shadows
        GLES30.glEnable(GLES30.GL_BLEND)
        GLES30.glBlendFunc(GLES30.GL_SRC_ALPHA, GLES30.GL_ONE_MINUS_SRC_ALPHA)
        GLES30.glDepthMask(false)
        bindTex(texSprite, 4, 1f, 1f)
        if (!useShadows || showroom) shadowBatch.draw()

        // sprites
        GLES30.glUseProgram(spriteProg)
        GLES30.glUniformMatrix4fv(uSpVP, 1, false, viewProj, 0)
        GLES30.glUniform3f(uSpRight, view[0], view[4], view[8])
        GLES30.glUniform3f(uSpUp, view[1], view[5], view[9])
        GLES30.glUniform3f(uSpCamPos, camX, camY, camZ)
        GLES30.glUniform1f(uSpFog, fogDensity)
        GLES30.glUniform1i(uSpTex, 0)
        GLES30.glBindTexture(GLES30.GL_TEXTURE_2D, texSprite)
        GLES30.glDisable(GLES30.GL_CULL_FACE)
        alphaSprites.draw()
        GLES30.glBlendFunc(GLES30.GL_SRC_ALPHA, GLES30.GL_ONE)
        additive.draw()
        GLES30.glEnable(GLES30.GL_CULL_FACE)
        GLES30.glDepthMask(true)
        GLES30.glDisable(GLES30.GL_BLEND)
    }

    private fun bindTex(tex: Int, mode: Int, sx: Float, sy: Float) {
        GLES30.glBindTexture(GLES30.GL_TEXTURE_2D, tex)
        GLES30.glUniform1i(u.texMode, mode)
        GLES30.glUniform2f(u.texScale, sx, sy)
    }

    private fun renderShadowMap() {
        val w = world
        // light box centered ahead of the player, snapped to texels to avoid shimmering
        val extent = 42f
        val texel = extent * 2f / shadowSize
        val cx = floor(w.px / texel) * texel
        val cz = floor((-w.ps - 20f) / texel) * texel
        var ux = 0f; var uy = 1f; var uz = 0f
        if (abs(sunDir[1]) > 0.98f) { uy = 0f; uz = -1f }
        Matrix.setLookAtM(lightView, 0, cx + sunDir[0] * 150f, sunDir[1] * 150f, cz + sunDir[2] * 150f, cx, 0f, cz, ux, uy, uz)
        Matrix.orthoM(lightProj, 0, -extent, extent, -extent, extent, 1f, 320f)
        Matrix.multiplyMM(lightVP, 0, lightProj, 0, lightView, 0)

        GLES30.glBindFramebuffer(GLES30.GL_FRAMEBUFFER, shadowFbo)
        GLES30.glViewport(0, 0, shadowSize, shadowSize)
        GLES30.glClear(GLES30.GL_DEPTH_BUFFER_BIT)
        GLES30.glUseProgram(depthProg)
        GLES30.glUniformMatrix4fv(uDepthLightVP, 1, false, lightVP, 0)
        GLES30.glEnable(GLES30.GL_POLYGON_OFFSET_FILL)
        GLES30.glPolygonOffset(2.5f, 6f)
        GLES30.glDisable(GLES30.GL_CULL_FACE)
        for (b in casterBatches) b.draw()
        GLES30.glEnable(GLES30.GL_CULL_FACE)
        GLES30.glDisable(GLES30.GL_POLYGON_OFFSET_FILL)
        GLES30.glBindFramebuffer(GLES30.GL_FRAMEBUFFER, 0)
    }

    // ================================================================== performance
    private fun monitorPerformance(dt: Float) {
        fpsFrames++
        fpsTime += dt
        startupTime += dt
        if (qualityCooldown > 0f) qualityCooldown -= dt
        if (fpsTime >= 1f) {
            val fps = (fpsFrames / fpsTime).toInt()
            currentFps = fps
            callbacks.onFps(fps)
            fpsFrames = 0
            fpsTime = 0f
            val racing = world.state == World.STATE_RACING
            if (autoQuality && racing && startupTime > 4f && qualityCooldown <= 0f) {
                if (fps < 44) lowFpsWindows++ else lowFpsWindows = max(0, lowFpsWindows - 1)
                if (lowFpsWindows >= 3 && qualityLevel > 0) {
                    lowFpsWindows = 0
                    qualityCooldown = 8f
                    val newLevel = qualityLevel - 1
                    qualityLevel = newLevel
                    callbacks.onAutoQualityDrop(newLevel)
                }
            }
        }
    }

    fun resetTiming() {
        lastNanos = System.nanoTime()
        startupTime = 0f
        lowFpsWindows = 0
        SystemClock.uptimeMillis()
    }

    // ================================================================== helpers / data
    private class Key(
        val sunDir: FloatArray, val sunColor: FloatArray, val skyTop: FloatArray, val horizon: FloatArray,
        val skyAmb: FloatArray, val groundAmb: FloatArray, val night: Float
    )

    private fun set3(a: FloatArray, x: Float, y: Float, z: Float) { a[0] = x; a[1] = y; a[2] = z }
    private fun norm(a: FloatArray) {
        val l = sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2])
        if (l > 1e-6f) { a[0] /= l; a[1] /= l; a[2] /= l }
    }

    companion object {
        val DENSITY = floatArrayOf(0.45f, 0.75f, 1f)
        val PARTICLES = intArrayOf(240, 460, 700)
        val DRAW_DIST = floatArrayOf(270f, 370f, 480f)
        val FOG = floatArrayOf(0.0062f, 0.0046f, 0.0036f)
        val REFLECT = floatArrayOf(0.5f, 1f, 1.1f)
        val SNOW_COUNT = intArrayOf(110, 220, 360)

        val MOUNTAIN_TINT = arrayOf(
            floatArrayOf(0.42f, 0.47f, 0.56f),
            floatArrayOf(0.78f, 0.52f, 0.36f),
            floatArrayOf(0.93f, 0.95f, 1.0f),
            floatArrayOf(0.24f, 0.4f, 0.3f)
        )

        private val KEYS = arrayOf(
            // day
            Key(floatArrayOf(-0.4f, 0.78f, 0.48f), floatArrayOf(1.05f, 0.98f, 0.88f), floatArrayOf(0.2f, 0.42f, 0.82f),
                floatArrayOf(0.66f, 0.79f, 0.92f), floatArrayOf(0.42f, 0.5f, 0.62f), floatArrayOf(0.3f, 0.28f, 0.25f), 0f),
            // sunset (sun ahead, low)
            Key(floatArrayOf(0.22f, 0.13f, -0.97f), floatArrayOf(1.3f, 0.66f, 0.32f), floatArrayOf(0.16f, 0.17f, 0.4f),
                floatArrayOf(0.98f, 0.55f, 0.34f), floatArrayOf(0.46f, 0.36f, 0.44f), floatArrayOf(0.26f, 0.18f, 0.16f), 0.38f),
            // night (moon)
            Key(floatArrayOf(-0.3f, 0.62f, -0.72f), floatArrayOf(0.16f, 0.2f, 0.32f), floatArrayOf(0.008f, 0.012f, 0.045f),
                floatArrayOf(0.04f, 0.055f, 0.11f), floatArrayOf(0.07f, 0.09f, 0.15f), floatArrayOf(0.03f, 0.03f, 0.05f), 1f),
            // dawn
            Key(floatArrayOf(-0.3f, 0.16f, -0.94f), floatArrayOf(1.1f, 0.72f, 0.58f), floatArrayOf(0.28f, 0.33f, 0.6f),
                floatArrayOf(0.86f, 0.62f, 0.62f), floatArrayOf(0.42f, 0.4f, 0.5f), floatArrayOf(0.22f, 0.2f, 0.2f), 0.3f)
        )
    }
}
