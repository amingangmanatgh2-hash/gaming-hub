// Deterministic checks for game/DriftScorer.kt (compiled together with it, runs on any JVM):
//   tools/drift-sim/run.sh
import com.amin.racing3d.game.DriftScorer
import kotlin.math.PI

var failures = 0
fun check(name: String, ok: Boolean, info: String) {
    println((if (ok) "PASS  " else "FAIL  ") + name + "  —  " + info)
    if (!ok) failures++
}
fun rad(deg: Float) = (deg * PI / 180.0).toFloat()
const val DT = 1f / 60f

/** drives the scorer for [sec] seconds at a constant angle/speed, returns banked points */
fun run(s: DriftScorer, sec: Float, deg: Float, kmh: Float, invalid: Boolean = false): Int {
    var banked = 0
    val n = (sec / DT + 0.5f).toInt()
    repeat(n) { banked += s.update(DT, rad(deg), kmh / 3.6f, invalid) }
    return banked
}

fun main() {
    // 1) the weakest valid drift still earns ≥ 500 points per second (before the multiplier)
    run {
        val s = DriftScorer()
        run(s, 4f, 9.5f, 31f)
        val perSec = s.chainRaw / s.chainTime
        check("min valid drift ≥ 500 pts/s", perSec >= 500f, "9.5° @ 31 km/h → %.0f pts/s raw".format(perSec))
        val total = run(s, 2f, 0f, 31f)
        check("banked after straightening", total > 0 && s.lastMult >= 1.25f && total >= s.lastRaw, "banked $total = ${s.lastRaw} × ${s.lastMult} (+${s.lastBonusPct}%)")
    }
    // 2) not drifting → no points (fast straight line, shallow slide, slow spin)
    run {
        val s = DriftScorer()
        val a = run(s, 5f, 0f, 180f) + run(s, 5f, 6f, 150f) + run(s, 5f, 40f, 20f) + s.forceBank()
        check("no points without a genuine drift", a == 0 && s.chainRaw == 0f, "straight / 6° slip / 20 km/h → $a")
    }
    // 3) longer + better drifts earn more per second
    run {
        val s = DriftScorer()
        run(s, 1f, 30f, 110f); val r1 = s.liveRate
        run(s, 5f, 30f, 110f); val r6 = s.liveRate
        check("rate grows with duration", r6 > r1 * 1.3f, "after 1 s: %.0f/s, after 6 s: %.0f/s".format(r1, r6))
        val m = s.mult
        check("multiplier grows with clean drift time", m >= 2f, "×$m after 6 s at 30°")
        s.forceBank()
 check("multiplier visibly applied", s.lastTotal >= s.lastRaw * 1.75f, "${s.lastRaw} × ${s.lastMult} +${s.lastBonusPct}% = ${s.lastTotal}")
    }
    // 4) transitions link the chain and add multiplier
    run {
        val s = DriftScorer()
        run(s, 3f, 28f, 100f)
        val before = s.mult
        run(s, 0.4f, 0f, 100f)          // flick through centre (inside the 1.25 s window)
        run(s, 3f, -28f, 100f)
        check("transition links and adds ×0.25", s.links == 1 && s.active && s.mult >= before + 0.25f, "links=${s.links} mult $before → ${s.mult}")
    }
    // 5) bad ending: wall scrape loses everything and resets the multiplier
    run {
        val s = DriftScorer()
        run(s, 5f, 30f, 100f)
        val had = s.chainRaw * s.mult
        val got = run(s, 0.1f, 30f, 100f, invalid = true)
        check("scrape loses the chain", got == 0 && !s.active && s.mult == 1f && s.lastLost >= had.toInt() - 1, "lost ${s.lastLost}")
    }
    // 4b) wiggling through centre does not farm transition bonuses
    run {
        val s = DriftScorer()
        var d = 1f
        repeat(10) { run(s, 0.4f, 20f * d, 80f); run(s, 0.1f, 0f, 80f); d = -d }
        check("no link farming", s.links == 0, "10 flicks of 0.4 s → links=${s.links}, ×${s.mult}")
    }
    // 6) near miss while drifting
    run {
        val s = DriftScorer()
        run(s, 1f, 25f, 90f)
        val m = s.mult; val r = s.chainRaw
        s.nearMiss()
        check("near miss bonus", s.mult == m + 0.25f && s.chainRaw == r + 300f, "+300 pts, ×$m → ×${s.mult}")
        check("no near-miss bonus outside a drift", !DriftScorer().nearMiss(), "ignored")
    }
    // 7) a plausible 90 s Drift-mode run (sets the medal targets)
    for ((label, seg, deg, kmh) in listOf(
        Quad("beginner", 2.5f, 16f, 60f), Quad("good", 4.5f, 26f, 95f), Quad("expert", 7f, 34f, 125f))) {
        val s = DriftScorer()
        var t = 0f; var total = 0
        var dir = 1f
        while (t < 90f) {
            total += run(s, seg, deg * dir, kmh); t += seg
            dir = -dir
            total += run(s, 0.5f, 0f, kmh); t += 0.5f          // transition
            if ((t.toInt() / 15) % 2 == 1) { total += run(s, 2.5f, 0f, kmh); t += 2.5f }  // straights
        }
        total += s.forceBank()
        println("INFO  90 s run, $label (${seg}s segments @ $deg° / $kmh km/h): $total pts, best drift ${s.runBest}, max ×${s.runMaxMult}")
    }
    println(if (failures == 0) "ALL PASSED" else "$failures FAILED")
    if (failures > 0) System.exit(1)
}
data class Quad(val a: String, val b: Float, val c: Float, val d: Float)
