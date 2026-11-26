package com.amin.racing3d.audio

import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioTrack
import android.os.Process
import java.util.concurrent.atomic.AtomicIntegerArray
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.exp
import kotlin.math.pow
import kotlin.math.sin

/**
 * Fully procedural real-time audio: every sound (engine, horn, nitro, wind, sfx and the
 * background music) is synthesized in code and mixed into one streaming AudioTrack.
 * The mixer thread never allocates.
 */
class AudioEngine {
    companion object {
        const val RATE = 44100
        const val BLOCK = 512

        const val SFX_COIN = 0
        const val SFX_NEAR = 1
        const val SFX_CRASH = 2
        const val SFX_COUNT = 3
        const val SFX_GO = 4
        const val SFX_CHECKPOINT = 5
        const val SFX_CLICK = 6
        const val SFX_NITRO_START = 7
        const val SFX_BUY = 8
        const val SFX_ENGINE_START = 9
        const val SFX_SHIFT = 10
        const val SFX_BLOWOFF = 11
        const val SFX_HIT = 12
        const val SFX_THUNDER = 13
        const val SFX_DOOR = 14
        const val SFX_FARE = 15
        const val SFX_PHONE = 16
        const val SFX_SHUTTER = 17
        const val SFX_STEP = 18
        const val NUM_SFX = 19
        /** radio stations of the in-game phone */
        const val NUM_STATIONS = 3

        private const val VOICES = 10
        /**
         * Engine profiles per player car: cylinders, idle rpm, redline rpm, combustion pulse
         * sharpness, firing unevenness (V8 burble), exhaust resonance Hz, rasp, turbo, pops.
         */
        private class EngineProfile(
            val cyl: Int, val idle: Float, val red: Float, val sharp: Float, val uneven: Float,
            val res: Float, val rasp: Float, val turbo: Boolean, val pops: Float, val vol: Float,
            val electric: Boolean = false
        )
        private val PROFILES = arrayOf(
            EngineProfile(4, 900f, 7800f, 9f, 0.05f, 420f, 0.55f, true, 0.6f, 0.95f),    // sports: turbo inline-4
            EngineProfile(8, 750f, 6500f, 6f, 0.38f, 230f, 0.35f, false, 1.0f, 1.1f),    // muscle: cross-plane V8
            EngineProfile(6, 700f, 5400f, 5f, 0.12f, 260f, 0.25f, true, 0.25f, 1.0f),    // SUV: turbo V6
            EngineProfile(12, 1000f, 9000f, 12f, 0.03f, 620f, 0.7f, false, 0.7f, 0.9f),  // hypercar: V12
            EngineProfile(6, 650f, 5800f, 4.5f, 0.08f, 300f, 0.3f, false, 0.45f, 1.0f),   // classic: carburetted straight-6
            EngineProfile(4, 850f, 7000f, 7f, 0.06f, 360f, 0.45f, true, 0.35f, 0.95f),    // sport sedan: turbo 4
            EngineProfile(8, 650f, 5600f, 5f, 0.3f, 190f, 0.3f, false, 0.6f, 1.15f),      // pickup: big-block V8
            EngineProfile(6, 600f, 4600f, 3.5f, 0.15f, 170f, 0.2f, true, 0.1f, 1.05f),    // off-roader: turbo-diesel 6
            EngineProfile(8, 750f, 6800f, 7f, 0.25f, 260f, 0.4f, false, 0.5f, 1.05f),     // police: V8 interceptor
            EngineProfile(8, 1200f, 9500f, 13f, 0.1f, 520f, 0.9f, false, 1.0f, 1.0f),     // GT race: flat-plane V8
            EngineProfile(4, 950f, 7600f, 10f, 0.08f, 460f, 0.75f, true, 1.0f, 1.0f),     // rally hatch: turbo 4 with anti-lag
            EngineProfile(4, 0f, 15000f, 1f, 0f, 900f, 0f, false, 0f, 0.9f, true),        // electric GT: twin motors
            EngineProfile(4, 750f, 6200f, 6f, 0.05f, 300f, 0.3f, false, 0.1f, 0.9f),      // taxi: economy 4-cylinder
            EngineProfile(4, 1000f, 9200f, 14f, 0.02f, 540f, 0.85f, true, 1.0f, 1.0f)     // drift coupe: twin-rotor rotary
        )
    }

    // ------------------------------------------------------------ parameters (game thread writes)
    private var evPh1 = 0.0
    private var evPh2 = 0.0
    private var evPh3 = 0.0
    private var evNoise = 0f
    @Volatile var engineRpm = 0.2f
    @Volatile var engineLoad = 0f
    @Volatile var engineOn = false
    @Volatile var nitroOn = false
    @Volatile var hornOn = false
    @Volatile var windLevel = 0f
    @Volatile var scrapeLevel = 0f
    @Volatile var carType = 0
    @Volatile var engineAudible = false
    /** tyre slip (0..1): squeal */
    @Volatile var skidLevel = 0f
    /** rain intensity 0..1 */
    @Volatile var rainLevel = 0f
    /** closeness of the nearest police unit 0..1 */
    @Volatile var sirenLevel = 0f
    /** 0..1 while driving through a tunnel (echo) */
    @Volatile var tunnelLevel = 0f
    private var rainVol = 0f
    private var rainLp = 0f
    private var rainLp2 = 0f
    private var sirenVol = 0f
    private var sirenPh = 0.0
    private var sirenT = 0.0
    private var sirenLp = 0f
    private var tunVol = 0f
    private val echoBuf = FloatArray(3300)
    private var echoPos = 0

    @Volatile var sfxEnabled = true
    @Volatile var musicEnabled = true
    @Volatile var muted = false
    @Volatile var racing = false

    private val triggers = AtomicIntegerArray(NUM_SFX)
    private val samples = arrayOfNulls<FloatArray>(NUM_SFX)
    private val voiceSample = IntArray(VOICES) { -1 }
    private val voicePos = IntArray(VOICES)

    @Volatile private var running = false
    @Volatile private var paused = false
    private var thread: Thread? = null
    private var track: AudioTrack? = null
    private val out = ShortArray(BLOCK)

    // synthesis state
    private var crankPh = 0.0
    private var firePh = 0.0
    private var fireIdx = 0
    private var svLow = 0f
    private var svBand = 0f
    private var eLp = 0f
    private var eDc = 0f
    private var prevRpm = 0.2f
    private var prevLoad = 0f
    private var cutT = 0f
    private var boost = 0f
    private var whPh = 0.0
    private var spoolLp = 0f
    private var popT = 0f
    private var popEnv = 0f
    private var popLp = 0f
    private var skidVol = 0f
    private var skidLp = 0f
    private var skidLp2 = 0f
    private var skidPh = 0.0
    private var shiftCheck = 0
    private var rpmS = 0.2f
    private var loadS = 0f
    private var engVol = 0f
    private var noiseSeed = 22222
    private var windLp = 0f
    private var nitroLp = 0f
    private var nitroLp2 = 0f
    private var nitroVol = 0f
    private var hornVol = 0f
    private var hornP1 = 0.0
    private var hornP2 = 0.0
    private var hornLp = 0f
    private var scrapeHp = 0f
    private var scrapePrev = 0f
    private var scrapeVol = 0f
    private var musicVol = 0f
    private var prevNitro = false

    // music sequencer
    /** radio station (phone music app): 0 Neon FM, 1 Lo-fi Nights, 2 Turbo FM */
    @Volatile var station = 0
    private var curStation = -1
    private var bpm = 112f
    private var samplesPerStep = (RATE * 60f / bpm / 4f).toInt()
    private var arpTri = false
    private var kickMask = 0x1111
    private var snareMask = 0x1010
    private var hatLevel = 1f
    private var arpLevel = 1f
    private var stepCounter = 0
    private var stepSample = 0
    private var bassPhase = 0.0
    private var bassFreq = 55f
    private var bassEnv = 0f
    private var bassLp = 0f
    private var arpPhase = 0.0
    private var arpFreq = 440f
    private var arpEnv = 0f
    private var padPhase = DoubleArray(3)
    private var padFreq = FloatArray(3)
    private var kickEnv = 0f
    private var kickPhase = 0.0
    private var snareEnv = 0f
    private var hatEnv = 0f
    private var hatHp = 0f
    private var hatPrev = 0f
    private var musicLp = 0f

    private var chordRoots = intArrayOf(45, 41, 48, 43)
    private var chordTones = arrayOf(intArrayOf(57, 60, 64), intArrayOf(53, 57, 60), intArrayOf(60, 64, 67), intArrayOf(55, 59, 62))

    private fun applyStation(st: Int) {
        curStation = st
        when (st) {
            1 -> { // lo-fi: slow, jazzy 7th chords, soft triangle keys, lazy drums
                bpm = 84f; arpTri = true; arpLevel = 0.8f; hatLevel = 0.55f
                kickMask = (1 shl 0) or (1 shl 7) or (1 shl 10); snareMask = (1 shl 4) or (1 shl 12)
                chordRoots = intArrayOf(50, 43, 48, 45)
                chordTones = arrayOf(intArrayOf(62, 65, 69), intArrayOf(55, 58, 62), intArrayOf(59, 64, 67), intArrayOf(57, 60, 64))
            }
            2 -> { // turbo: fast four-on-the-floor, bright major chords
                bpm = 128f; arpTri = false; arpLevel = 1.1f; hatLevel = 1.3f
                kickMask = 0x1111; snareMask = (1 shl 4) or (1 shl 12)
                chordRoots = intArrayOf(40, 36, 43, 38)
                chordTones = arrayOf(intArrayOf(64, 67, 71), intArrayOf(60, 64, 67), intArrayOf(67, 71, 74), intArrayOf(62, 66, 69))
            }
            else -> { // neon synthwave (original soundtrack)
                bpm = 112f; arpTri = false; arpLevel = 1f; hatLevel = 1f
                kickMask = 0x1111; snareMask = (1 shl 4) or (1 shl 12)
                chordRoots = intArrayOf(45, 41, 48, 43)
                chordTones = arrayOf(intArrayOf(57, 60, 64), intArrayOf(53, 57, 60), intArrayOf(60, 64, 67), intArrayOf(55, 59, 62))
            }
        }
        samplesPerStep = (RATE * 60f / bpm / 4f).toInt()
        stepSample = 0
    }
    private val arpOrder = intArrayOf(0, 1, 2, 1, 0, 2, 1, 2)
    private val bassPattern = intArrayOf(1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 0)

    init {
        generateSamples()
    }

    private fun midi(m: Int): Float = (440.0 * 2.0.pow((m - 69) / 12.0)).toFloat()

    private fun noise(): Float {
        noiseSeed = noiseSeed * 1103515245 + 12345
        return ((noiseSeed ushr 9) and 0xFFFF) / 32768f - 1f
    }

    // ------------------------------------------------------------ sample generation
    private fun generateSamples() {
        samples[SFX_COIN] = synth(0.2f) { t, i ->
            val f = if (t < 0.06f) 1318.5f else 1760f
            val env = if (t < 0.06f) 1f else exp(-(t - 0.06f) * 18f)
            (sin(2 * PI * f * t).toFloat() * 0.7f + (if (sin(2 * PI * f * 2 * t) > 0) 0.12f else -0.12f)) * env * 0.6f
        }
        samples[SFX_NEAR] = run {
            var lp = 0f; var lp2 = 0f
            synth(0.55f) { t, _ ->
                val cutoff = 0.02f + 0.25f * (t / 0.55f)
                val n = noise()
                lp += (n - lp) * cutoff
                lp2 += (lp - lp2) * cutoff
                val band = lp - lp2
                val env = (t / 0.12f).coerceAtMost(1f) * exp(-t * 5f)
                val chime = (sin(2 * PI * 1046.5 * t) + 0.6 * sin(2 * PI * 1568 * t)).toFloat() * exp(-t * 9f) * 0.18f
                band * env * 2.2f + chime
            }
        }
        samples[SFX_CRASH] = run {
            var lp = 0f
            synth(1.3f) { t, _ ->
                val n = noise()
                lp += (n - lp) * 0.18f
                val burst = lp * exp(-t * 4.5f) * 1.3f + n * exp(-t * 14f) * 0.5f
                val thudF = 70f * exp(-t * 3f) + 28f
                val thud = sin(2 * PI * thudF * t).toFloat() * exp(-t * 6f) * 0.9f
                val metal = (sin(2 * PI * 523.0 * t) * 0.3 + sin(2 * PI * 811.0 * t) * 0.25 + sin(2 * PI * 1307.0 * t) * 0.2 + sin(2 * PI * 2291.0 * t) * 0.12).toFloat() * exp(-t * 3.2f)
                val glass = if (t > 0.08f && noise() > 0.985f) noise() * exp(-t * 2f) * 0.8f else 0f
                (burst + thud + metal * 0.6f + glass) * 0.8f
            }
        }
        samples[SFX_COUNT] = synth(0.16f) { t, _ -> sin(2 * PI * 660 * t).toFloat() * exp(-t * 14f) * 0.55f }
        samples[SFX_GO] = synth(0.45f) { t, _ -> (sin(2 * PI * 1320 * t) * 0.5 + sin(2 * PI * 990 * t) * 0.35).toFloat() * exp(-t * 5f) * 0.6f }
        samples[SFX_CHECKPOINT] = synth(0.42f) { t, _ ->
            val f = when { t < 0.09f -> 784f; t < 0.18f -> 988f; else -> 1318.5f }
            val lt = if (t < 0.18f) (t % 0.09f) else t - 0.18f
            sin(2 * PI * f * t).toFloat() * exp(-lt * 8f) * 0.5f
        }
        samples[SFX_CLICK] = synth(0.04f) { t, _ -> sin(2 * PI * 1500 * t).toFloat() * exp(-t * 120f) * 0.5f }
        samples[SFX_NITRO_START] = run {
            var lp = 0f
            synth(0.5f) { t, _ ->
                val n = noise()
                lp += (n - lp) * (0.05f + t * 0.5f)
                lp * (t / 0.08f).coerceAtMost(1f) * exp(-t * 4f) * 1.6f
            }
        }
        samples[SFX_ENGINE_START] = run {
            // starter motor whine -> ignition -> rev flare -> settle to idle
            var ph = 0.0; var lp = 0f; var lp2 = 0f
            synth(2.1f) { t, _ ->
                var o = 0f
                if (t < 0.62f) {
                    val crank = 0.55f + 0.45f * sin(2 * PI * 11.0 * t).toFloat()
                    o += (sin(2 * PI * 1450.0 * t) * 0.18 + sin(2 * PI * 725.0 * t) * 0.12).toFloat() * crank
                    o += (if (sin(2 * PI * 11.0 * t) > 0.9) noise() * 0.35f else 0f)
                }
                if (t > 0.5f) {
                    val k = t - 0.5f
                    val rpm = 800f + 4200f * (k / 0.35f).coerceAtMost(1f) * exp(-(k - 0.35f).coerceAtLeast(0f) * 2.2f)
                    val f = rpm / 60f * 2f
                    ph += f / RATE; if (ph > 1.0) ph -= 1.0
                    val pulse = exp(-ph.toFloat() * 7f) - 0.15f
                    val raw = pulse + noise() * 0.12f
                    lp += (raw - lp) * 0.22f
                    lp2 += (lp - lp2) * 0.22f
                    val env = (k / 0.05f).coerceAtMost(1f)
                    o += lp2 * 1.4f * env
                    if (k < 0.08f) o += sin(2 * PI * 60.0 * t).toFloat() * (1f - k / 0.08f) * 0.6f
                }
                o * 0.8f
            }
        }
        samples[SFX_SHIFT] = synth(0.14f) { t, _ ->
            (sin(2 * PI * 90.0 * t).toFloat() * exp(-t * 40f) * 0.6f + noise() * exp(-t * 90f) * 0.35f)
        }
        samples[SFX_BLOWOFF] = run {
            var lp = 0f; var lp2 = 0f
            synth(0.45f) { t, _ ->
                val c = 0.5f * exp(-t * 4f) + 0.05f
                val n = noise()
                lp += (n - lp) * c; lp2 += (lp - lp2) * c
                (lp - lp2) * 2.4f * (t / 0.02f).coerceAtMost(1f) * exp(-t * 6f)
            }
        }
        samples[SFX_HIT] = synth(0.35f) { t, _ ->
            val metal = (sin(2 * PI * 610.0 * t) * 0.4 + sin(2 * PI * 1370.0 * t) * 0.25).toFloat() * exp(-t * 14f)
            metal + noise() * exp(-t * 30f) * 0.6f + sin(2 * PI * 80.0 * t).toFloat() * exp(-t * 18f) * 0.5f
        }
        samples[SFX_THUNDER] = run {
            // sharp crack, then a long rolling rumble (low-passed noise with slow swells)
            var lp = 0f; var lp2 = 0f; var lp3 = 0f
            synth(3.2f) { t, _ ->
                val n = noise()
                lp += (n - lp) * 0.08f
                lp2 += (lp - lp2) * 0.05f
                lp3 += (n - lp3) * 0.5f
                val crack = if (t < 0.25f) lp3 * exp(-t * 14f) * 0.9f else 0f
                val swell = 0.6f + 0.4f * sin(t * 5.3f) * sin(t * 2.1f + 1f)
                crack + lp2 * 5.5f * swell * (t / 0.15f).coerceAtMost(1f) * exp(-t * 0.9f)
            }
        }
        samples[SFX_DOOR] = run {
            // latch click + body thunk
            var lp = 0f
            synth(0.32f) { t, _ ->
                val n = noise()
                lp += (n - lp) * 0.12f
                val click = if (t < 0.012f) n * 0.7f else 0f
                val thunk = sin(2 * PI * (95.0 - t * 120.0) * t).toFloat() * exp(-t * 22f) * 0.9f
                click + thunk + lp * exp(-t * 30f) * 0.8f
            }
        }
        samples[SFX_FARE] = synth(0.75f) { t, _ ->
            // cash register: two bell strikes + drawer rattle
            val b1 = (sin(2 * PI * 2093.0 * t) + 0.5 * sin(2 * PI * 3136.0 * t)).toFloat() * exp(-t * 7f)
            val t2 = (t - 0.12f).coerceAtLeast(0f)
            val b2 = if (t > 0.12f) (sin(2 * PI * 2637.0 * t2) + 0.4 * sin(2 * PI * 3951.0 * t2)).toFloat() * exp(-t2 * 5f) else 0f
            val rattle = if (t > 0.3f && t < 0.5f) noise() * 0.25f * exp(-(t - 0.3f) * 12f) else 0f
            (b1 + b2) * 0.32f + rattle
        }
        samples[SFX_PHONE] = synth(0.42f) { t, _ ->
            val f = if (t < 0.13f) 1567.98f else 2093f
            val lt = if (t < 0.13f) t else t - 0.13f
            (sin(2 * PI * f * t) + 0.25 * sin(2 * PI * f * 2 * t)).toFloat() * exp(-lt * 11f) * 0.42f
        }
        samples[SFX_SHUTTER] = run {
            var lp = 0f
            synth(0.22f) { t, _ ->
                val n = noise()
                lp += (n - lp) * 0.4f
                val a = if (t < 0.03f) 1f else if (t > 0.09f && t < 0.12f) 0.8f else 0f
                lp * a * 0.9f + sin(2 * PI * 300.0 * t).toFloat() * exp(-t * 60f) * 0.3f
            }
        }
        samples[SFX_STEP] = run {
            var lp = 0f
            synth(0.09f) { t, _ ->
                val n = noise()
                lp += (n - lp) * 0.25f
                lp * exp(-t * 50f) * 0.55f + sin(2 * PI * 120.0 * t).toFloat() * exp(-t * 70f) * 0.25f
            }
        }
        samples[SFX_BUY] = synth(0.5f) { t, _ ->
            val f = if (t < 0.1f) 880f else if (t < 0.2f) 1108.7f else 1318.5f
            (sin(2 * PI * f * t).toFloat() * 0.5f + sin(2 * PI * f * 1.5 * t).toFloat() * 0.15f) * exp(-(t % 0.1f) * 6f) * (1f - t * 1.6f).coerceAtLeast(0f)
        }
    }

    private inline fun synth(seconds: Float, fn: (Float, Int) -> Float): FloatArray {
        val n = (seconds * RATE).toInt()
        val arr = FloatArray(n)
        for (i in 0 until n) arr[i] = fn(i.toFloat() / RATE, i)
        // short fade-out to avoid clicks
        val fade = minOf(200, n)
        for (i in 0 until fade) arr[n - 1 - i] *= i / fade.toFloat()
        return arr
    }

    // ------------------------------------------------------------ control
    fun trigger(id: Int) {
        if (id in 0 until NUM_SFX) triggers.incrementAndGet(id)
    }

    fun start() {
        if (running) return
        val minBuf = AudioTrack.getMinBufferSize(RATE, AudioFormat.CHANNEL_OUT_MONO, AudioFormat.ENCODING_PCM_16BIT)
        val t = try {
            AudioTrack.Builder()
                .setAudioAttributes(
                    AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_GAME)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build()
                )
                .setAudioFormat(
                    AudioFormat.Builder()
                        .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                        .setSampleRate(RATE)
                        .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                        .build()
                )
                .setBufferSizeInBytes(maxOf(minBuf * 2, BLOCK * 8))
                .setTransferMode(AudioTrack.MODE_STREAM)
                .setPerformanceMode(AudioTrack.PERFORMANCE_MODE_LOW_LATENCY)
                .build()
        } catch (e: Exception) {
            null
        } ?: return
        if (t.state != AudioTrack.STATE_INITIALIZED) {
            t.release()
            return
        }
        track = t
        running = true
        paused = false
        t.play()
        thread = Thread({ loop() }, "AminAudio").also { it.start() }
    }

    fun pause() {
        paused = true
        try { track?.pause() } catch (_: Exception) {}
    }

    fun resume() {
        if (!running) { start(); return }
        paused = false
        try { track?.play() } catch (_: Exception) {}
    }

    fun release() {
        running = false
        try { thread?.join(300) } catch (_: InterruptedException) {}
        thread = null
        try { track?.stop() } catch (_: Exception) {}
        track?.release()
        track = null
    }

    // ------------------------------------------------------------ mixer
    private fun loop() {
        Process.setThreadPriority(Process.THREAD_PRIORITY_URGENT_AUDIO)
        val buf = out
        while (running) {
            if (paused) {
                try { Thread.sleep(25) } catch (_: InterruptedException) {}
                continue
            }
            val t = track ?: break
            renderBlock(buf)
            val r = t.write(buf, 0, BLOCK)
            if (r < 0) {
                try { Thread.sleep(10) } catch (_: InterruptedException) {}
            }
        }
    }

    private fun startVoices() {
        for (id in 0 until NUM_SFX) {
            val n = triggers.getAndSet(id, 0)
            if (n <= 0 || !sfxEnabled) continue
            var slot = -1
            for (v in 0 until VOICES) if (voiceSample[v] < 0) { slot = v; break }
            if (slot < 0) {
                // steal the oldest voice
                var maxPos = -1
                for (v in 0 until VOICES) if (voicePos[v] > maxPos) { maxPos = voicePos[v]; slot = v }
            }
            voiceSample[slot] = id
            voicePos[slot] = 0
        }
    }

    private fun renderBlock(buf: ShortArray) {
        startVoices()
        val mute = muted
        val sfx = sfxEnabled && !mute
        val music = musicEnabled && !mute
        val engOn = engineOn && engineAudible && sfx
        val tRpm = engineRpm
        val tLoad = engineLoad
        val nitro = nitroOn && engineAudible && sfx
        val horn = hornOn && sfx
        val wind = if (engineAudible && sfx) windLevel else 0f
        val scrape = if (engineAudible && sfx) scrapeLevel else 0f
        val prof = PROFILES[carType.coerceIn(0, PROFILES.size - 1)]
        val skid = if (engineAudible && sfx) skidLevel else 0f
        val rainT = if (engineAudible && sfx) rainLevel else 0f
        val sirenT2 = if (engineAudible && sfx) sirenLevel else 0f
        val tunT = if (engineAudible && sfx) tunnelLevel else 0f
        // driving events per block (~11.6 ms): gear shifts, lift-off pops, blow-off valve
        if (engOn) {
            if (!prof.electric && ++shiftCheck >= 4) {
                shiftCheck = 0
                if (prevRpm - tRpm > 0.12f && tLoad > 0.5f) { trigger(SFX_SHIFT); cutT = 0.09f }
                if (prevLoad > 0.6f && tLoad < 0.3f && tRpm > 0.5f) {
                    popT = 0.5f + prof.pops * 0.5f
                    if (prof.turbo && boost > 0.45f) trigger(SFX_BLOWOFF)
                }
                prevRpm = tRpm; prevLoad = tLoad
            }
            boost += ((if (prof.turbo) tLoad * tRpm else 0f) - boost) * 0.05f
        } else boost *= 0.9f
        val blockSec = BLOCK / RATE.toFloat()
        if (cutT > 0f) cutT -= blockSec
        if (popT > 0f) popT -= blockSec
        val musicTarget = if (music) (if (racing) 0.30f else 0.5f) else 0f
        if (nitro && !prevNitro) trigger(SFX_NITRO_START)
        prevNitro = nitro

        for (i in 0 until BLOCK) {
            var mix = 0f
            // ---- engine (per-car profile: firing pulses through an exhaust resonance)
            rpmS += (tRpm - rpmS) * 0.0016f
            loadS += (tLoad - loadS) * 0.002f
            engVol += ((if (engOn) 1f else 0f) - engVol) * 0.0008f
            if (engVol > 0.001f && prof.electric) {
                // electric drive: motor tone + inverter whine (higher harmonic, louder under load) + gear hum
                val f = 90.0 + rpmS.coerceIn(0f, 1.05f) * 1450.0
                evPh1 += f / RATE; if (evPh1 > 1.0) evPh1 -= 1.0
                evPh2 += f * 2.97 / RATE; if (evPh2 > 1.0) evPh2 -= 1.0
                evPh3 += (f * 0.5) / RATE; if (evPh3 > 1.0) evPh3 -= 1.0
                val tone = sin(2.0 * PI * evPh1).toFloat()
                val whine = sin(2.0 * PI * evPh2).toFloat() * (0.25f + 0.6f * loadS)
                val hum = sin(2.0 * PI * evPh3).toFloat() * 0.5f
                evNoise += (noise() - evNoise) * 0.08f
                mix += (tone * 0.09f + whine * 0.05f + hum * 0.05f + evNoise * 0.04f * loadS) * engVol * prof.vol * (0.5f + 0.5f * loadS + 0.3f * rpmS)
            } else if (engVol > 0.001f) {
                val rpm = prof.idle + rpmS.coerceIn(0f, 1.05f) * (prof.red - prof.idle)
                val crankHz = rpm / 60f
                crankPh += crankHz / RATE
                if (crankPh > 2.0) crankPh -= 2.0
                val fire = crankHz * prof.cyl * 0.5f
                firePh += fire / RATE
                if (firePh >= 1.0) { firePh -= 1.0; fireIdx = (fireIdx + 1) % prof.cyl }
                val fp = firePh.toFloat()
                // uneven firing (cross-plane V8 burble): pulse strength varies per cylinder
                val strength = 1f + prof.uneven * (if ((fireIdx * 5) % prof.cyl < prof.cyl / 2) 1f else -0.7f)
                val pulse = exp(-fp * prof.sharp) * strength
                val rasp = noise() * prof.rasp * (0.25f + 0.75f * loadS) * exp(-fp * 4f)
                val raw = pulse + rasp + sin(2.0 * PI * firePh).toFloat() * 0.25f
                // exhaust resonance (state-variable filter), opens up with rpm and load
                val fc = (prof.res + rpm * 0.06f + loadS * 300f).coerceAtMost(3200f)
                val fcoef = 2f * sin((PI * fc / RATE).toFloat())
                svLow += fcoef * svBand
                val high = raw - svLow - 0.55f * svBand
                svBand += fcoef * high
                eLp += (svLow - eLp) * 0.5f
                eDc += (eLp - eDc) * 0.002f
                val cut = if (cutT > 0f) 0.3f else 1f
                mix += (eLp - eDc) * (0.22f + 0.16f * loadS) * engVol * prof.vol * cut
                // turbo: spool whistle + intake rush rises with boost
                if (prof.turbo && boost > 0.02f) {
                    whPh += (2200.0 + 5200.0 * boost) / RATE
                    if (whPh > 1.0) whPh -= 1.0
                    spoolLp += (noise() - spoolLp) * 0.3f
                    mix += (sin(2.0 * PI * whPh).toFloat() * 0.035f + spoolLp * 0.05f) * boost * boost * engVol
                }
                // exhaust pops / crackle on lift-off
                if (popT > 0f) {
                    if (popEnv < 0.02f && noise() > 0.9993f - prof.pops * 0.0012f) popEnv = 0.8f + noise() * 0.2f
                    if (popEnv > 0.001f) {
                        popLp += (noise() - popLp) * 0.45f
                        mix += (popLp * 1.2f + sin(2.0 * PI * 70.0 * popEnv).toFloat() * 0.4f) * popEnv * engVol * 0.55f
                        popEnv *= 0.9965f
                    }
                }
            }
            // ---- tyre squeal
            skidVol += (skid - skidVol) * 0.003f
            if (skidVol > 0.01f) {
                skidPh += (980.0 + 140.0 * sin(2.0 * PI * skidPh * 0.004)) / RATE
                if (skidPh > 1e6) skidPh = 0.0
                val n = noise()
                skidLp += (n - skidLp) * 0.35f
                skidLp2 += (skidLp - skidLp2) * 0.08f
                val tone = sin(2.0 * PI * skidPh).toFloat()
                mix += ((skidLp - skidLp2) * 0.55f + tone * 0.12f) * skidVol * skidVol * 0.6f
            }
            // ---- wind
            if (wind > 0.01f) {
                windLp += (noise() - windLp) * 0.04f
                mix += windLp * wind * wind * 0.55f
            }
            // ---- nitro hiss + roar
            nitroVol += ((if (nitro) 1f else 0f) - nitroVol) * 0.002f
            if (nitroVol > 0.001f) {
                val n = noise()
                nitroLp += (n - nitroLp) * 0.35f
                nitroLp2 += (nitroLp - nitroLp2) * 0.04f
                mix += ((nitroLp - nitroLp2) * 0.35f + nitroLp2 * 0.9f) * nitroVol * 0.55f
            }
            // ---- horn
            hornVol += ((if (horn) 1f else 0f) - hornVol) * 0.006f
            if (hornVol > 0.001f) {
                hornP1 += 370.0 / RATE; if (hornP1 > 1.0) hornP1 -= 1.0
                hornP2 += 466.2 / RATE; if (hornP2 > 1.0) hornP2 -= 1.0
                val sq = (if (hornP1 < 0.5) 1f else -1f) + (if (hornP2 < 0.5) 1f else -1f)
                hornLp += (sq - hornLp) * 0.18f
                mix += hornLp * 0.17f * hornVol
            }
            // ---- guardrail scrape
            scrapeVol += (scrape - scrapeVol) * 0.004f
            if (scrapeVol > 0.001f) {
                val n = noise()
                scrapeHp = 0.92f * (scrapeHp + n - scrapePrev)
                scrapePrev = n
                val crackle = if (noise() > 0.96f) noise() * 1.5f else 0f
                mix += (scrapeHp * 0.4f + crackle) * scrapeVol * 0.45f
            }
            // ---- rain on the roof / road
            rainVol += (rainT - rainVol) * 0.0004f
            if (rainVol > 0.005f) {
                val n = noise()
                rainLp += (n - rainLp) * 0.55f
                rainLp2 += (rainLp - rainLp2) * 0.12f
                val drop = if (noise() > 0.9985f - rainVol * 0.002f) noise() * 0.9f else 0f
                mix += ((rainLp - rainLp2) * 0.28f + drop) * rainVol
            }
            // ---- police siren (wail, switching to yelp when very close)
            sirenVol += (sirenT2 - sirenVol) * 0.0006f
            if (sirenVol > 0.005f) {
                sirenT += 1.0 / RATE
                val yelp = sirenVol > 0.75f
                val period = if (yelp) 0.32 else 3.6
                val ph = (sirenT % period) / period
                val sweep = if (ph < 0.5) ph * 2.0 else (1.0 - ph) * 2.0
                val freq = 640.0 + 720.0 * sweep
                sirenPh += freq / RATE
                if (sirenPh > 1.0) sirenPh -= 1.0
                val sq = (if (sirenPh < 0.5) 1f else -1f) * 0.6f + sin(2.0 * PI * sirenPh).toFloat() * 0.4f
                sirenLp += (sq - sirenLp) * 0.25f
                mix += sirenLp * sirenVol * sirenVol * 0.16f
            }
            // ---- tunnel acoustics: short feedback echo on the vehicle sounds
            tunVol += (tunT - tunVol) * 0.0005f
            val d = echoBuf[echoPos]
            echoBuf[echoPos] = if (tunVol > 0.01f) mix + d * 0.42f else 0f
            echoPos = (echoPos + 1) % echoBuf.size
            if (tunVol > 0.01f) mix += d * 0.6f * tunVol
            // ---- one-shot sfx
            for (v in 0 until VOICES) {
                val id = voiceSample[v]
                if (id < 0) continue
                val smp = samples[id]!!
                val p = voicePos[v]
                if (p >= smp.size) { voiceSample[v] = -1; continue }
                mix += smp[p] * 0.85f
                voicePos[v] = p + 1
            }
            // ---- music
            musicVol += (musicTarget - musicVol) * 0.0004f
            if (musicVol > 0.002f) mix += renderMusicSample() * musicVol
            // soft clip
            val m = mix * 0.9f
            val y = m / (1f + abs(m))
            buf[i] = (y * 32000f).toInt().coerceIn(-32767, 32767).toShort()
        }
    }

    private fun renderMusicSample(): Float {
        val st = station
        if (st != curStation) applyStation(st)
        if (stepSample == 0) onStep(stepCounter)
        stepSample++
        if (stepSample >= samplesPerStep) {
            stepSample = 0
            stepCounter = (stepCounter + 1) % 256
        }
        var s = 0f
        // bass (saw, filtered)
        bassPhase += bassFreq / RATE
        if (bassPhase > 1.0) bassPhase -= 1.0
        val bsaw = (bassPhase * 2.0 - 1.0).toFloat()
        bassLp += (bsaw - bassLp) * (0.03f + bassEnv * 0.12f)
        s += bassLp * bassEnv * 0.55f
        bassEnv *= 0.99985f
        // arpeggio (square-ish)
        arpPhase += arpFreq / RATE
        if (arpPhase > 1.0) arpPhase -= 1.0
        val sq = if (arpTri) (4f * abs(arpPhase.toFloat() - 0.5f) - 1f) * 1.4f else if (arpPhase < 0.3) 1f else -1f
        s += sq * arpEnv * 0.09f * arpLevel
        arpEnv *= 0.99962f
        // pad (triangles)
        for (k in 0 until 3) {
            padPhase[k] += padFreq[k] / RATE
            if (padPhase[k] > 1.0) padPhase[k] -= 1.0
            val ph = padPhase[k].toFloat()
            val tri = 4f * abs(ph - 0.5f) - 1f
            s += tri * 0.05f
        }
        // kick
        if (kickEnv > 0.001f) {
            val f = 45f + 110f * kickEnv * kickEnv
            kickPhase += f / RATE
            s += sin(2 * PI * kickPhase).toFloat() * kickEnv * 0.9f
            kickEnv *= 0.99935f
        }
        // snare
        if (snareEnv > 0.001f) {
            s += (noise() * 0.6f + sin(2 * PI * 185.0 * stepSample / RATE).toFloat() * 0.3f) * snareEnv * 0.45f
            snareEnv *= 0.99875f
        }
        // hi-hat
        if (hatEnv > 0.001f) {
            val n = noise()
            hatHp = 0.85f * (hatHp + n - hatPrev)
            hatPrev = n
            s += hatHp * hatEnv * 0.16f
            hatEnv *= 0.9975f
        }
        musicLp += (s - musicLp) * 0.6f
        return musicLp
    }

    private fun onStep(step: Int) {
        val bar = (step / 16) % 4
        val inBar = step % 16
        val chord = bar
        if (inBar == 0) {
            val tones = chordTones[chord]
            for (k in 0 until 3) padFreq[k] = midi(tones[k] - 12)
        }
        if (bassPattern[inBar] == 1) {
            bassFreq = midi(chordRoots[chord] - 12 + if (inBar % 4 == 3) 12 else 0)
            bassEnv = 1f
        }
        val tones = chordTones[chord]
        val idx = arpOrder[inBar % 8]
        arpFreq = midi(tones[idx] + (if (inBar >= 8) 12 else 0))
        arpEnv = 1f
        if ((kickMask shr inBar) and 1 == 1) { kickEnv = 1f; kickPhase = 0.0 }
        if ((snareMask shr inBar) and 1 == 1) snareEnv = 1f
        hatEnv = (if (inBar % 2 == 0) 1f else 0.5f) * hatLevel
        if (curStation == 2 && inBar % 4 == 2) hatEnv = 1.4f
        // breakdown every 8 bars: lighter drums
        if ((step / 64) % 2 == 1 && inBar % 8 == 4) hatEnv = 1f
    }
}
