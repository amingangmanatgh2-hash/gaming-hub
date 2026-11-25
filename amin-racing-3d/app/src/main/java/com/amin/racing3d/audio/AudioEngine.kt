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
        const val NUM_SFX = 9

        private const val VOICES = 10
        private val ENGINE_BASE = floatArrayOf(58f, 44f, 50f, 70f)
    }

    // ------------------------------------------------------------ parameters (game thread writes)
    @Volatile var engineRpm = 0.2f
    @Volatile var engineLoad = 0f
    @Volatile var engineOn = false
    @Volatile var nitroOn = false
    @Volatile var hornOn = false
    @Volatile var windLevel = 0f
    @Volatile var scrapeLevel = 0f
    @Volatile var carType = 0
    @Volatile var engineAudible = false

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
    private var ePhase = 0.0
    private var ePhase2 = 0.0
    private var eLp = 0f
    private var eLp2 = 0f
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
    private val bpm = 112f
    private val samplesPerStep = (RATE * 60f / bpm / 4f).toInt()
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

    private val chordRoots = intArrayOf(45, 41, 48, 43)
    private val chordTones = arrayOf(intArrayOf(57, 60, 64), intArrayOf(53, 57, 60), intArrayOf(60, 64, 67), intArrayOf(55, 59, 62))
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
        val base = ENGINE_BASE[carType.coerceIn(0, 3)]
        val musicTarget = if (music) (if (racing) 0.30f else 0.5f) else 0f
        if (nitro && !prevNitro) trigger(SFX_NITRO_START)
        prevNitro = nitro

        for (i in 0 until BLOCK) {
            var mix = 0f
            // ---- engine
            rpmS += (tRpm - rpmS) * 0.0009f
            loadS += (tLoad - loadS) * 0.0015f
            engVol += ((if (engOn) 1f else 0f) - engVol) * 0.0008f
            if (engVol > 0.001f) {
                val f = base * (0.55f + rpmS * 2.6f)
                ePhase += f / RATE
                if (ePhase > 1.0) ePhase -= 1.0
                ePhase2 += f * 0.5 / RATE
                if (ePhase2 > 1.0) ePhase2 -= 1.0
                val saw = (ePhase * 2.0 - 1.0).toFloat()
                val sub = if (ePhase2 < 0.5) 0.6f else -0.6f
                val pulse = if (ePhase < 0.18) 1f else 0f
                val raw = saw * 0.55f + sub * 0.5f + pulse * 0.45f + noise() * 0.08f * loadS
                val cut = 0.05f + 0.1f * rpmS + 0.12f * loadS
                eLp += (raw - eLp) * cut
                eLp2 += (eLp - eLp2) * cut
                mix += eLp2 * (0.32f + 0.18f * loadS) * engVol
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
        val sq = if (arpPhase < 0.3) 1f else -1f
        s += sq * arpEnv * 0.09f
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
        if (inBar % 4 == 0) { kickEnv = 1f; kickPhase = 0.0 }
        if (inBar == 4 || inBar == 12) snareEnv = 1f
        if (inBar % 2 == 0) hatEnv = 1f else hatEnv = 0.5f
        // breakdown every 8 bars: lighter drums
        if ((step / 64) % 2 == 1 && inBar % 8 == 4) hatEnv = 1f
    }
}
