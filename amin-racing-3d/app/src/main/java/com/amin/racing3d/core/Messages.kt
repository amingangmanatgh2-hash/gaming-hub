package com.amin.racing3d.core

/**
 * In-game phone messages (v2.0). Stored as one preference string, newest last, capped at
 * [MAX] entries. Each line: time|icon|fromFa|fromEn|textFa|textEn ('|' and newlines stripped).
 */
class Messages(private val save: SaveManager) {

    class Msg(val time: Long, val icon: String, val fromFa: String, val fromEn: String, val fa: String, val en: String) {
        fun from() = if (Lang.isFa) fromFa else fromEn
        fun text() = if (Lang.isFa) fa else en
    }

    val unread: Int get() = save.prefInt(K_UNREAD)

    fun markRead() = save.putPrefInt(K_UNREAD, 0)

    fun list(): List<Msg> {
        ensureWelcome()
        val raw = save.prefString(K_LIST)
        if (raw.isEmpty()) return emptyList()
        val out = ArrayList<Msg>()
        for (line in raw.split('\n')) {
            val p = line.split('|')
            if (p.size < 6) continue
            out.add(Msg(p[0].toLongOrNull() ?: 0L, p[1], p[2], p[3], p[4], p[5]))
        }
        return out
    }

    fun add(icon: String, fromFa: String, fromEn: String, fa: String, en: String, countUnread: Boolean = true) {
        fun c(s: String) = s.replace('|', '/').replace('\n', ' ')
        val line = listOf(System.currentTimeMillis().toString(), c(icon), c(fromFa), c(fromEn), c(fa), c(en)).joinToString("|")
        val raw = save.prefString(K_LIST)
        val lines = if (raw.isEmpty()) ArrayList() else ArrayList(raw.split('\n'))
        lines.add(line)
        while (lines.size > MAX) lines.removeAt(0)
        save.putPrefString(K_LIST, lines.joinToString("\n"))
        if (countUnread) save.putPrefInt(K_UNREAD, unread + 1)
    }

    /** first phone use: a couple of messages that explain the new features */
    private fun ensureWelcome() {
        if (save.prefInt(K_WELCOME) == 1) return
        save.putPrefInt(K_WELCOME, 1)
        add("🔧", "امین (مکانیک)", "Amin (mechanic)",
            "سلام رفیق! چهار ماشین تازه رسیده: هاچ‌بک رالی، برقی GT، تاکسی و کوپهٔ دریفت. یه سر به گاراژ بزن.",
            "Hey! Four new cars just arrived: Rally Hatch, Electric GT, Taxi and Drift Coupe. Check the garage.")
        add("🚕", "تاکسی امین", "Amin Cabs",
            "در حالت بی‌پایان مسافرها کنار جاده منتظرند. کنار نشانگر زرد بایست تا سوار شوند و سر وقت به مقصد سبز برسان. با ماشین تاکسی ۵۰٪ کرایهٔ بیشتر می‌گیری!",
            "In Endless, passengers wait at the roadside. Stop at the yellow marker to pick them up and reach the green drop-off in time. The Taxi car earns 50% more!")
        add("🧭", "گشت آزاد", "Free Roam",
            "در گشت آزاد وقتی ماشین ایستاده، دکمهٔ «پیاده شو» را بزن و قدم بزن. شیفت تاکسی را هم از همین گوشی شروع کن.",
            "In Free Roam, stop and tap “Get out” to walk around. Start a taxi shift from this phone too.")
    }

    companion object {
        private const val K_LIST = "phone_msgs"
        private const val K_UNREAD = "phone_unread"
        private const val K_WELCOME = "phone_welcome"
        const val MAX = 30

        /** passenger reviews by star rating (index 0 = 1 star) */
        val REVIEWS_FA = arrayOf(
            arrayOf("خیلی دیر رسیدیم… دیگه سوار نمی‌شم.", "این چه رانندگی بود؟!"),
            arrayOf("دیر شد ولی رسیدیم.", "یه کم آروم‌تر می‌رفتی بهتر بود."),
            arrayOf("بد نبود، ممنون.", "سفر معمولی بود."),
            arrayOf("رانندگی خوبی بود، مرسی!", "سریع و راحت. ممنون!"),
            arrayOf("عالی! بهترین راننده‌ی شهر 😍", "مثل فیلم‌ها رسیدیم! انعامت حلاله 🤩")
        )
        val REVIEWS_EN = arrayOf(
            arrayOf("We were so late… never again.", "What kind of driving was that?!"),
            arrayOf("Late, but we made it.", "Could have been a smoother ride."),
            arrayOf("Not bad, thanks.", "An ordinary ride."),
            arrayOf("Nice driving, thanks!", "Quick and comfy. Thank you!"),
            arrayOf("Amazing! Best driver in town 😍", "Just like in the movies! Keep the tip 🤩")
        )
        val PASSENGERS_FA = arrayOf("سارا", "علی", "مریم", "رضا", "نگار", "کیان", "الهام", "پویا", "شیوا", "آرش")
        val PASSENGERS_EN = arrayOf("Sara", "Ali", "Maryam", "Reza", "Negar", "Kian", "Elham", "Pouya", "Shiva", "Arash")
    }
}
