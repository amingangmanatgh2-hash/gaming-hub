package com.amin.racing3d.core

import com.amin.racing3d.game.GameData
import com.amin.racing3d.game.StoryData
import java.util.Calendar

/**
 * Daily challenges, achievements, level-up rewards and long-term statistics.
 * Everything is stored with new keys in the existing save file, so v1/v2 progress stays intact.
 */
class Progression(private val save: SaveManager) {

    // =====================================================================================
    // run data fed by the activity after every run
    class RunInfo(
        val mode: Int,
        val score: Int,
        val meters: Float,
        val topSpeed: Int,
        val nearMisses: Int,
        val bestCombo: Int,
        val success: Boolean,
        val medal: Int,
        val position: Int,
        val escapes: Int,
        val takedowns: Int,
        val missionPassed: Boolean,
        val car: Int
    )

    /** One reward line shown on the results screen. */
    class Reward(val kind: Int, val titleFa: String, val titleEn: String, val coins: Int) {
        fun title() = if (Lang.isFa) titleFa else titleEn
    }

    // =====================================================================================
    // statistics (new in v2)
    val streetWins get() = save.prefInt("stat_street_wins")
    val bestDrift get() = save.prefInt("stat_best_drift")
    val totalDrift get() = save.prefLong("stat_total_drift")
    val totalEscapes get() = save.prefInt("stat_escapes")
    val totalTakedowns get() = save.prefInt("stat_takedowns")
    val bestCombo get() = save.prefInt("stat_best_combo")
    val bestTrafficScore get() = save.prefInt("stat_best_traffic")
    val freeRoamMeters get() = save.prefLong("stat_free_m")
    val dailiesDone get() = save.prefInt("stat_dailies")
    val goldMedals get() = save.prefInt("stat_golds")

    // =====================================================================================
    // daily challenges
    class DailyType(val fa: String, val en: String, val values: IntArray, val baseReward: Int)

    /** Daily challenge pool. %d is replaced by the target value. */
    private val pool = arrayOf(
        DailyType("امروز %d کیلومتر رانندگی کن", "Drive %d km today", intArrayOf(5, 8, 12), 600),
        DailyType("امروز %d نزدیک‌گذر انجام بده", "Get %d near misses today", intArrayOf(40, 70, 100), 700),
        DailyType("به سرعت %d کیلومتر بر ساعت برس", "Reach %d km/h", intArrayOf(220, 250, 280), 500),
        DailyType("%d مسابقهٔ خیابانی را اول شو", "Win %d street race(s)", intArrayOf(1, 2, 3), 900),
        DailyType("در یک دور دریفت %d امتیاز بگیر", "Score %d in one drift run", intArrayOf(10000, 18000, 26000), 800),
        DailyType("%d بار از پلیس فرار کن", "Escape the police %d time(s)", intArrayOf(1, 2, 3), 900),
        DailyType("در %d حالت مدال بگیر (تایم تریل، دریفت یا چالش)", "Earn %d medal(s) (time trial, drift or challenge)", intArrayOf(1, 2, 3), 800),
        DailyType("در یک دور ترافیک %d امتیاز بگیر", "Score %d in one traffic run", intArrayOf(6000, 12000, 20000), 700),
        DailyType("کمبوی ×%d بزن", "Hit a ×%d combo", intArrayOf(8, 12, 16), 700),
        DailyType("%d مأموریت داستان را انجام بده", "Complete %d story mission(s)", intArrayOf(1, 1, 2), 1000),
        DailyType("در گشت آزاد %d کیلومتر برو", "Drive %d km in free roam", intArrayOf(3, 5, 8), 600)
    )

    class Daily(val type: Int, val target: Int, val reward: Int, val progress: Int, val claimed: Boolean, val fa: String, val en: String) {
        val done get() = progress >= target
        fun title() = if (Lang.isFa) fa else en
    }

    /** yyyymmdd of the local day */
    fun today(): Int {
        val c = Calendar.getInstance()
        return c.get(Calendar.YEAR) * 10000 + (c.get(Calendar.MONTH) + 1) * 100 + c.get(Calendar.DAY_OF_MONTH)
    }

    /** The three challenges of a day: chosen deterministically from the date (no network needed). */
    private fun pick(day: Int): List<IntArray> {
        var seed = day.toLong() * 2654435761L + 97L
        fun next(): Int { seed = (seed * 6364136223846793005L + 1442695040888963407L); return ((seed ushr 33) and 0x7fffffff).toInt() }
        val types = ArrayList<Int>()
        while (types.size < 3) { val t = next() % pool.size; if (t !in types) types.add(t) }
        val lvl = save.level()
        return types.map { t ->
            // harder targets from level 5 / 12 on, with some daily variety
            val tier = ((if (lvl >= 12) 2 else if (lvl >= 5) 1 else 0) + (next() % 2)).coerceAtMost(2)
            intArrayOf(t, pool[t].values[tier], pool[t].baseReward + tier * 250)
        }
    }

    private fun ensureDay() {
        val d = today()
        if (save.prefInt("daily_day") != d) {
            val picks = pick(d)
            save.putPrefInt("daily_day", d)
            save.putPrefString("daily_set", picks.joinToString(";") { "${it[0]},${it[1]},${it[2]}" })
            for (i in 0 until 3) { save.putPrefInt("daily_p$i", 0); save.putPrefInt("daily_c$i", 0); save.putPrefLong("daily_m$i", 0L) }
            save.putPrefInt("daily_bonus", 0)
        }
    }

    fun dailies(): List<Daily> {
        ensureDay()
        val parts = save.prefString("daily_set").split(';').filter { it.isNotEmpty() }
        return parts.mapIndexed { i, s ->
            val f = s.split(',').map { it.toIntOrNull() ?: 0 }
            val t = f[0].coerceIn(0, pool.size - 1)
            val target = f.getOrElse(1) { 1 }
            Daily(t, target, f.getOrElse(2) { 500 }, save.prefInt("daily_p$i"), save.prefInt("daily_c$i") == 1,
                pool[t].fa.replace("%d", Lang.num(target)), pool[t].en.replace("%d", target.toString()))
        }
    }

    val dailyBonusClaimed get() = save.prefInt("daily_bonus") == 1

    /** Number of today's challenges that are not finished yet. */
    fun dailiesOpen(): Int = dailies().count { !it.done }

    // =====================================================================================
    // achievements
    class Achievement(val id: String, val fa: String, val en: String, val dFa: String, val dEn: String, val reward: Int, val icon: String)

    val achievements = arrayOf(
        Achievement("first_run", "اولین دور", "First Run", "یک دور را تمام کن", "Finish your first run", 200, "🏁"),
        Achievement("km_10", "جاده‌نورد", "Road Tripper", "در مجموع ۱۰ کیلومتر برو", "Drive 10 km in total", 400, "🛣"),
        Achievement("km_100", "هزارتو", "Long Hauler", "در مجموع ۱۰۰ کیلومتر برو", "Drive 100 km in total", 2000, "🌍"),
        Achievement("near_100", "مو به مو", "Close Call", "در مجموع ۱۰۰ نزدیک‌گذر", "100 near misses in total", 500, "💨"),
        Achievement("near_1000", "استاد لایی", "Weaving Master", "در مجموع ۱۰۰۰ نزدیک‌گذر", "1,000 near misses in total", 3000, "🌀"),
        Achievement("combo_15", "زنجیره", "Chain Reaction", "کمبوی ×۱۵ در یک دور", "A ×15 combo in one run", 800, "🔗"),
        Achievement("speed_250", "دیوار صوتی", "Sound Barrier", "به ۲۵۰ کیلومتر بر ساعت برس", "Reach 250 km/h", 600, "⚡"),
        Achievement("speed_320", "موشک", "Rocket", "به ۳۲۰ کیلومتر بر ساعت برس", "Reach 320 km/h", 2500, "🚀"),
        Achievement("street_win", "اولین پیروزی", "First Victory", "یک مسابقهٔ خیابانی را اول شو", "Win a street race", 600, "🥇"),
        Achievement("street_win_10", "پادشاه خیابان", "Street King", "۱۰ مسابقهٔ خیابانی را اول شو", "Win 10 street races", 3000, "👑"),
        Achievement("drift_20k", "سلطان دود", "Smoke King", "۲۰,۰۰۰ امتیاز در یک دور دریفت", "20,000 points in one drift run", 1200, "🔥"),
        Achievement("escape_1", "فراری", "Fugitive", "یک بار از پلیس فرار کن", "Escape the police once", 600, "🚨"),
        Achievement("takedown_5", "شکارچی آژیر", "Siren Hunter", "۵ ماشین پلیس را از کار بینداز", "Take out 5 police cars", 1500, "💥"),
        Achievement("gold_any", "طلایی", "Golden", "یک مدال طلا بگیر", "Earn a gold medal", 800, "🏅"),
        Achievement("gold_3", "سه طلا", "Triple Gold", "در تایم تریل، دریفت و چالش طلا بگیر", "Gold in time trial, drift and challenge", 4000, "🏆"),
        Achievement("score_30k", "ترافیک‌شکن", "Traffic Breaker", "۳۰,۰۰۰ امتیاز در یک دور ترافیک", "30,000 points in one traffic run", 1500, "🚦"),
        Achievement("story_ch1", "خیابان‌های شهر", "City Streets", "فصل ۱ داستان را تمام کن", "Finish story chapter 1", 1000, "📖"),
        Achievement("story_ch2", "جادهٔ طوفان", "Storm Road", "فصل ۲ داستان را تمام کن", "Finish story chapter 2", 2000, "⛈"),
        Achievement("story_all", "تاج شب", "Night Crown", "کل داستان را تمام کن", "Finish the whole story", 5000, "👑"),
        Achievement("garage_3", "کلکسیونر", "Collector", "۳ ماشین داشته باش", "Own 3 cars", 800, "🚗"),
        Achievement("garage_all", "نمایشگاه شخصی", "Private Showroom", "همهٔ ماشین‌ها را داشته باش", "Own every car", 10000, "🏎"),
        Achievement("stylist", "طراح", "Stylist", "۵ قطعهٔ سفارشی بخر", "Buy 5 customization parts", 1200, "🎨"),
        Achievement("upgrade_max", "تمام‌قد", "Fully Tuned", "یک ارتقا را به حداکثر برسان", "Max out an upgrade", 1000, "🔧"),
        Achievement("level_10", "حرفه‌ای", "Pro Driver", "به سطح ۱۰ برس", "Reach level 10", 2500, "⭐"),
        Achievement("daily_7", "هر روز رانندگی", "Daily Driver", "۷ چالش روزانه را انجام بده", "Complete 7 daily challenges", 2000, "📅"),
        Achievement("free_20", "کاشف", "Explorer", "در گشت آزاد مجموعاً ۲۰ کیلومتر برو", "Drive 20 km in free roam", 1500, "🧭"),
        Achievement("taxi_1", "اولین کرایه", "First Fare", "یک مسافر را به مقصد برسان", "Deliver your first taxi passenger", 400, "🚕"),
        Achievement("taxi_25", "رانندهٔ شهر", "City Cabbie", "۲۵ مسافر را جابه‌جا کن", "Deliver 25 taxi passengers", 2500, "🗺")
    )

    fun isUnlocked(id: String) = save.prefInt("ach_$id") == 1
    fun unlockedCount() = achievements.count { isUnlocked(it.id) }

    /** current / target of an achievement for the progress bar */
    fun achievementProgress(id: String): Pair<Long, Long> = when (id) {
        "first_run" -> save.totalRuns.toLong() to 1L
        "km_10" -> save.totalMeters / 1000 to 10L
        "km_100" -> save.totalMeters / 1000 to 100L
        "near_100" -> save.totalNearMisses.toLong() to 100L
        "near_1000" -> save.totalNearMisses.toLong() to 1000L
        "combo_15" -> bestCombo.toLong() to 15L
        "speed_250" -> save.bestTopSpeed.toLong() to 250L
        "speed_320" -> save.bestTopSpeed.toLong() to 320L
        "street_win" -> streetWins.toLong() to 1L
        "street_win_10" -> streetWins.toLong() to 10L
        "drift_20k" -> bestDrift.toLong() to 20000L
        "escape_1" -> totalEscapes.toLong() to 1L
        "takedown_5" -> totalTakedowns.toLong() to 5L
        "gold_any" -> goldMedals.coerceAtMost(1).toLong() to 1L
        "gold_3" -> intArrayOf(GameData.MODE_TIME_TRIAL, GameData.MODE_DRIFT, GameData.MODE_CHALLENGE).count { save.bestMedal(it) >= 3 }.toLong() to 3L
        "score_30k" -> bestTrafficScore.toLong() to 30000L
        "story_ch1" -> storyChapterDone(0) to storyChapterSize(0)
        "story_ch2" -> storyChapterDone(1) to storyChapterSize(1)
        "story_all" -> StoryData.missions.indices.count { save.storyCompleted(it) }.toLong() to StoryData.missions.size.toLong()
        "garage_3" -> ownedCars().toLong() to 3L
        "garage_all" -> ownedCars().toLong() to GameData.cars.size.toLong()
        "stylist" -> customPartsOwned().toLong() to 5L
        "upgrade_max" -> (if (anyMaxUpgrade()) 1L else 0L) to 1L
        "level_10" -> save.level().toLong() to 10L
        "daily_7" -> dailiesDone.toLong() to 7L
        "free_20" -> freeRoamMeters / 1000 to 20L
        "taxi_1" -> save.prefInt("stat_taxi_rides").toLong() to 1L
        "taxi_25" -> save.prefInt("stat_taxi_rides").toLong() to 25L
        else -> 0L to 1L
    }

    private fun storyChapterDone(ch: Int) = StoryData.missions.indices.count { StoryData.missions[it].chapter == ch && save.storyCompleted(it) }.toLong()
    private fun storyChapterSize(ch: Int) = StoryData.missions.count { it.chapter == ch }.toLong()
    private fun ownedCars() = GameData.cars.indices.count { save.isCarOwned(it) }
    private fun customPartsOwned(): Int {
        var n = 0
        for (c in GameData.cars.indices) for (cat in 0 until GameData.NUM_CUS)
            n += Integer.bitCount(save.prefInt("cusown_${cat}_$c") and 1.inv())
        return n
    }
    private fun anyMaxUpgrade(): Boolean {
        for (c in GameData.cars.indices) for (u in 0 until 4) if (save.upgradeLevel(c, u) >= GameData.MAX_UPGRADE) return true
        return false
    }

    /** Unlocks every achievement whose condition is met and pays its coins. */
    fun checkAchievements(out: MutableList<Reward>? = null) {
        for (a in achievements) {
            if (isUnlocked(a.id)) continue
            val (cur, target) = achievementProgress(a.id)
            if (cur >= target) {
                save.putPrefInt("ach_${a.id}", 1)
                save.addCoins(a.reward)
                out?.add(Reward(KIND_ACHIEVEMENT, a.icon + " " + a.fa, a.icon + " " + a.en, a.reward))
            }
        }
    }

    // =====================================================================================
    /**
     * Processes a finished run: statistics, daily progress, achievements and level-up rewards.
     * [levelBefore] is the level before the run's XP was added. Returns the rewards earned.
     */
    fun onRun(r: RunInfo, levelBefore: Int): List<Reward> {
        val out = ArrayList<Reward>()
        // ---- statistics
        val trafficMode = r.mode == GameData.MODE_ENDLESS || r.mode == GameData.MODE_TWO_WAY || r.mode == GameData.MODE_TIME_ATTACK
        val streetWin = r.mode == GameData.MODE_STREET && r.success && r.position == 1
        if (streetWin) save.putPrefInt("stat_street_wins", streetWins + 1)
        if (r.mode == GameData.MODE_DRIFT) {
            if (r.score > bestDrift) save.putPrefInt("stat_best_drift", r.score)
            save.putPrefLong("stat_total_drift", totalDrift + r.score)
        }
        if (r.escapes > 0) save.putPrefInt("stat_escapes", totalEscapes + r.escapes)
        if (r.takedowns > 0) save.putPrefInt("stat_takedowns", totalTakedowns + r.takedowns)
        if (r.bestCombo > bestCombo) save.putPrefInt("stat_best_combo", r.bestCombo)
        if (trafficMode && r.score > bestTrafficScore) save.putPrefInt("stat_best_traffic", r.score)
        if (r.mode == GameData.MODE_FREE) save.putPrefLong("stat_free_m", freeRoamMeters + r.meters.toLong())
        if (r.medal >= 3) save.putPrefInt("stat_golds", goldMedals + 1)

        // ---- daily challenges
        val list = dailies()
        for ((i, d) in list.withIndex()) {
            if (d.claimed) continue
            val add: Int = when (d.type) {
                0 -> { addMeters(i, r.meters); 0 }
                1 -> r.nearMisses
                2 -> if (r.topSpeed > d.progress) r.topSpeed - d.progress else 0
                3 -> if (streetWin) 1 else 0
                4 -> if (r.mode == GameData.MODE_DRIFT && r.score > d.progress) r.score - d.progress else 0
                5 -> r.escapes
                6 -> if (r.medal > 0 && (r.mode == GameData.MODE_TIME_TRIAL || r.mode == GameData.MODE_DRIFT || r.mode == GameData.MODE_CHALLENGE)) 1 else 0
                7 -> if (trafficMode && r.score > d.progress) r.score - d.progress else 0
                8 -> if (r.bestCombo > d.progress) r.bestCombo - d.progress else 0
                9 -> if (r.missionPassed) 1 else 0
                10 -> { if (r.mode == GameData.MODE_FREE) addMeters(i, r.meters); 0 }
                else -> 0
            }
            if (add > 0) save.putPrefInt("daily_p$i", d.progress + add)
        }
        // pay finished challenges
        for ((i, d) in dailies().withIndex()) {
            if (d.done && !d.claimed) {
                save.putPrefInt("daily_c$i", 1)
                save.addCoins(d.reward)
                save.xp += 60
                save.putPrefInt("stat_dailies", dailiesDone + 1)
                out.add(Reward(KIND_DAILY, "✅ " + d.fa, "✅ " + d.en, d.reward))
            }
        }
        if (!dailyBonusClaimed && dailies().all { it.claimed }) {
            save.putPrefInt("daily_bonus", 1)
            save.addCoins(DAILY_BONUS)
            out.add(Reward(KIND_DAILY, "🎁 جایزهٔ هر سه چالش امروز", "🎁 All three daily challenges", DAILY_BONUS))
        }

        // ---- level-up rewards
        val lv = save.level()
        for (n in levelBefore + 1..lv) {
            val coins = 250 * n
            save.addCoins(coins)
            out.add(Reward(KIND_LEVEL, "⬆ سطح " + Lang.num(n), "⬆ Level $n", coins))
        }

        checkAchievements(out)
        return out
    }

    /** Distance challenges are stored in metres for precision; progress shown in km. */
    private fun addMeters(i: Int, meters: Float) {
        val key = "daily_m$i"
        val total = save.prefLong(key) + meters.toLong()
        save.putPrefLong(key, total)
        save.putPrefInt("daily_p$i", (total / 1000).toInt())
    }

    companion object {
        const val KIND_DAILY = 0
        const val KIND_ACHIEVEMENT = 1
        const val KIND_LEVEL = 2
        const val DAILY_BONUS = 1500
    }
}
