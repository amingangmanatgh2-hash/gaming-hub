package com.amin.racing3d.game

/**
 * Story mode "Night Crown" (تاج شب): original characters, three chapters, twelve missions.
 * Every mission is played with the real game modes (traffic, challenge, time trial, street race,
 * drift, police chase) and has its own objective, rival, weather and reward.
 */
object StoryData {
    // ------------------------------------------------------------------ characters
    const val REZA = 0     // retired racer, owns the garage — the mentor
    const val LEILA = 1    // radio navigator and mechanic
    const val NIMA = 2     // "Shadow", chapter 1 rival
    const val KAVEH = 3    // "Iron", chapter 2 rival
    const val SHAHIN = 4   // leader of the Night Crown crew
    const val MAHTAB = 5   // police captain
    const val PLAYER = 6

    class Character(val fa: String, val en: String, val color: Int)

    val characters = arrayOf(
        Character("استاد رضا", "Reza \"Old Fox\"", 0xFFFFB347.toInt()),
        Character("لیلا", "Leila", 0xFF00E5FF.toInt()),
        Character("نیما «سایه»", "Nima \"Shadow\"", 0xFFB388FF.toInt()),
        Character("کاوه «آهن»", "Kaveh \"Iron\"", 0xFFFF5252.toInt()),
        Character("شاهین", "Shahin", 0xFFFFD740.toInt()),
        Character("سروان مهتاب", "Captain Mahtab", 0xFF448AFF.toInt()),
        Character("تو", "You", 0xFF69F0AE.toInt())
    )

    class Line(val who: Int, val fa: String, val en: String)

    class Mission(
        val chapter: Int,
        val titleFa: String,
        val titleEn: String,
        val config: RaceConfig,
        val reward: Int,
        /** car unlocked on first completion (-1 none) */
        val unlockCar: Int,
        /** street race: required finishing position */
        val needPosition: Int,
        val briefing: Array<Line>,
        val win: Line,
        val lose: Line
    )

    class Chapter(val titleFa: String, val titleEn: String, val subFa: String, val subEn: String)

    val chapters = arrayOf(
        Chapter("فصل ۱ — خیابان‌های شهر", "Chapter 1 — City Streets",
            "یک تازه‌وارد، یک گاراژ قدیمی و شایعهٔ «تاج شب».", "A newcomer, an old garage and rumours of the Night Crown."),
        Chapter("فصل ۲ — جادهٔ طوفان", "Chapter 2 — Storm Road",
            "بیرون از شهر: صحرا، ساحل، کوهستان و پلیسی که ول‌کن نیست.", "Out of the city: desert, coast, mountains and a cop who won't let go."),
        Chapter("فصل ۳ — تاج شب", "Chapter 3 — Night Crown",
            "شب‌های بارانی، منطقهٔ صنعتی و مسابقهٔ آخر با شاهین.", "Rainy nights, the industrial zone and the final race against Shahin.")
    )

    private fun cfg(
        mode: Int, env: Int, tod: Int, weather: Int, goal: Float = 0f, gold: Float = 0f, silver: Float = 0f,
        bronze: Float = 0f, time: Float = 0f, rivals: Int = 3, skill: Float = 1f, rivalCar: Int = -1, id: Int
    ) = RaceConfig(mode, env, tod, weather, goal, gold, silver, bronze, time, rivals, skill, rivalCar, id)

    val missions: Array<Mission> = arrayOf(
        // ================================================================ chapter 1
        Mission(0, "اولین قدم", "First Step",
            cfg(GameData.MODE_ENDLESS, GameData.ENV_CITY, GameData.TOD_DAY, GameData.W_CLEAR, goal = 1500f, id = 0),
            600, -1, 0,
            arrayOf(
                Line(REZA, "پس تو همونی هستی که لیلا ازش حرف می‌زد. این گاراژ سی ساله مال منه… ولی شاید دیگه نباشه.", "So you're the one Leila told me about. This garage has been mine for thirty years… maybe not for long."),
                Line(LEILA, "یه گروه به اسم «تاج شب» می‌خوان گاراژ رو بگیرن. هر کی تو مسابقه‌هاشون ببازه، همه‌چیزش رو می‌ده.", "A crew called the Night Crown wants the garage. Whoever loses their races loses everything."),
                Line(REZA, "قبل از هر چیز باید ببینم رانندگی بلدی. برو تو ترافیک شهر و ۱۵۰۰ امتیاز بگیر. تصادف نکن.", "First I need to see you drive. Hit the city traffic and score 1,500 points. Don't crash."),
                Line(PLAYER, "ماشین گرمه. بریم.", "Engine's warm. Let's go.")
            ),
            Line(REZA, "بد نبود. دست‌هات آرومه. این یعنی می‌شه روت حساب کرد.", "Not bad. Calm hands. That means I can count on you."),
            Line(REZA, "عجله کردی. ترافیک شهر بخشنده نیست. دوباره امتحان کن.", "You rushed it. City traffic doesn't forgive. Try again.")),
        Mission(0, "نبض شهر", "City Pulse",
            cfg(GameData.MODE_CHALLENGE, GameData.ENV_CITY, GameData.TOD_SUNSET, GameData.W_CLEAR,
                gold = 26f, silver = 20f, bronze = 15f, time = 75f, id = 1),
            800, -1, 0,
            arrayOf(
                Line(LEILA, "بچه‌های تاج شب از سرعت خوششون نمیاد، از جرئت خوششون میاد.", "The Night Crown don't care about speed. They care about nerve."),
                Line(LEILA, "۷۵ ثانیه وقت داری. حداقل ۱۵ بار از کنار ماشین‌ها نزدیک‌گذر کن تا اسمت رو بشنون.", "You have 75 seconds. Pull at least 15 near misses so they hear your name.")
            ),
            Line(LEILA, "دوربین‌های خیابون همه‌چیز رو ضبط کردن. ویدیوت همین الان دست تاج شب رسید.", "The street cams caught all of it. The Night Crown just got your video."),
            Line(LEILA, "کم بود. باید نزدیک‌تر رد بشی — ولی نه اون‌قدر که بزنی!", "Not enough. Get closer — but not close enough to hit them!")),
        Mission(0, "تایم تریل جنگل", "Forest Trial",
            cfg(GameData.MODE_TIME_TRIAL, GameData.ENV_FOREST, GameData.TOD_DAY, GameData.W_LIGHT_RAIN,
                goal = 2000f, gold = 52f, silver = 60f, bronze = 70f, id = 2),
            900, -1, 0,
            arrayOf(
                Line(REZA, "جادهٔ جنگلی، باران سبک. جاده لیزه و ترمزت دیرتر می‌گیره.", "Forest road, light rain. The road is slick and your brakes bite later."),
                Line(REZA, "دو کیلومتر رو زیر ۷۰ ثانیه برو. اگه زیر ۵۲ رفتی، خودم برات قهوه می‌خرم.", "Do two kilometres under 70 seconds. Under 52 and I'm buying the coffee.")
            ),
            Line(REZA, "زمانت رو دیدم. نیما «سایه» هم دیده. امشب منتظرته.", "I saw your time. So did Nima \"Shadow\". He's waiting for you tonight."),
            Line(REZA, "تو باران باید نرم‌تر فرمون بدی. یه بار دیگه.", "In the rain you steer softer. Once more.")),
        Mission(0, "سایه", "Shadow",
            cfg(GameData.MODE_STREET, GameData.ENV_CITY, GameData.TOD_NIGHT, GameData.W_CLEAR,
                goal = 2500f, rivals = 2, skill = 1.0f, rivalCar = GameData.CAR_SPORTS, id = 3),
            1500, GameData.CAR_SEDAN, 1,
            arrayOf(
                Line(NIMA, "که تو جای پیرمرد رانندگی می‌کنی؟ تو شهر من کسی منو جا نمی‌ذاره.", "So you drive for the old man? Nobody leaves me behind in my city."),
                Line(LEILA, "نیما تو پیچ‌ها خیلی خوبه، ولی تو ترافیک سنگین عصبی می‌شه. از ترافیک استفاده کن.", "Nima is great in corners but gets nervous in heavy traffic. Use the traffic."),
                Line(REZA, "دو و نیم کیلومتر. فقط اول شدن قبوله.", "Two and a half kilometres. Only first place counts.")
            ),
            Line(NIMA, "…باشه. قبول. ولی شاهین مثل من نیست. اون نمی‌بازه.", "…Fine. You got me. But Shahin isn't like me. He doesn't lose."),
            Line(NIMA, "دیدی؟ شهر مال سایه‌هاست.", "See? The city belongs to shadows.")),
        // ================================================================ chapter 2
        Mission(1, "شن داغ", "Hot Sand",
            cfg(GameData.MODE_DRIFT, GameData.ENV_DESERT, GameData.TOD_SUNSET, GameData.W_CLEAR,
                gold = 320000f, silver = 140000f, bronze = 50000f, time = 75f, id = 4),
            1200, -1, 0,
            arrayOf(
                Line(LEILA, "شاهین آدم‌هاش رو از بین دریفت‌کارهای صحرا انتخاب می‌کنه. برای رسیدن بهش باید از این‌جا رد بشی.", "Shahin recruits from the desert drifters. To reach him, you go through them."),
                Line(REZA, "ترمز دستی رو بگیر و فرمون بده. زاویه رو نگه دار، گاز رو ول نکن. حداقل ۱۰ هزار امتیاز.", "Hold the handbrake and steer. Keep the angle, stay on the gas. At least 10,000 points.")
            ),
            Line(LEILA, "دریفت‌کارها دارن درباره‌ت حرف می‌زنن. یکی‌شون گفت کاوه «آهن» دنبالته.", "The drifters are talking about you. One said Kaveh \"Iron\" is looking for you."),
            Line(REZA, "زنجیره‌هات زود می‌شکنه. به گاردریل نخور.", "Your chains break too early. Stay off the guardrail.")),
        Mission(1, "سروان مهتاب", "Captain Mahtab",
            cfg(GameData.MODE_POLICE, GameData.ENV_COAST, GameData.TOD_DAY, GameData.W_CLEAR, goal = 1f, id = 5),
            1500, -1, 0,
            arrayOf(
                Line(MAHTAB, "رانندهٔ ماشین، کنار بزن. شش ماهه دنبال بچه‌های تاج شبم و تو تازه‌ترینشی.", "Driver, pull over. I've been after the Night Crown for six months and you're the newest face."),
                Line(PLAYER, "من مال اونا نیستم…", "I'm not one of them…"),
                Line(LEILA, "الان وقت توضیح نیست! یه بار از دستشون فرار کن تا تو جادهٔ ساحلی گمت کنن.", "No time to explain! Escape them once and lose them on the coast road.")
            ),
            Line(MAHTAB, "فرار کردی… ولی دفعهٔ بعد این‌قدر شانس نمیاری.", "You got away… you won't be this lucky next time."),
            Line(MAHTAB, "تموم شد. ماشین رو خاموش کن. — (رضا با ضمانت آزادت کرد. دوباره امتحان کن.)", "That's it. Engine off. — (Reza bailed you out. Try again.)")),
        Mission(1, "کوه و مه", "Mountain Fog",
            cfg(GameData.MODE_TIME_TRIAL, GameData.ENV_MOUNTAIN, GameData.TOD_DAY, GameData.W_FOG,
                goal = 3000f, gold = 66f, silver = 74f, bronze = 85f, id = 6),
            1500, -1, 0,
            arrayOf(
                Line(REZA, "کاوه تو کوهستان تمرین می‌کنه. اگه می‌خوای تو مسابقه ببریش، باید این جاده رو مثل کف دستت بشناسی.", "Kaveh trains in the mountains. To beat him you need to know this road by heart."),
                Line(LEILA, "مه غلیظه. دید کمه. چراغ‌های جلوی ماشین‌ها رو دنبال کن. سه کیلومتر، زیر ۸۵ ثانیه.", "Thick fog, low visibility. Follow the tail lights. Three kilometres, under 85 seconds.")
            ),
            Line(LEILA, "پیغام از کاوه: «فردا شب، صحرا. ماشینت رو بیار.»", "Message from Kaveh: \"Tomorrow night, the desert. Bring your car.\""),
            Line(REZA, "تو مه آروم‌تر برو تا مسیر رو ببینی، بعد سرعت بگیر.", "In fog, slow down to read the road — then push.")),
        Mission(1, "آهن", "Iron",
            cfg(GameData.MODE_STREET, GameData.ENV_DESERT, GameData.TOD_NIGHT, GameData.W_CLEAR,
                goal = 3000f, rivals = 3, skill = 1.06f, rivalCar = GameData.CAR_MUSCLE, id = 7),
            2500, GameData.CAR_MUSCLE, 1,
            arrayOf(
                Line(KAVEH, "شنیدم نیما رو بردی. نیما بچه بود. من آهنم.", "Heard you beat Nima. Nima's a kid. I'm iron."),
                Line(KAVEH, "اگه بردی، می‌گم شاهین کجاست. اگه باختی، ماشینت مال من.", "Win, and I tell you where Shahin is. Lose, and your car is mine."),
                Line(LEILA, "ماشین کاوه تو خط مستقیم وحشیه. از نیترو درست استفاده کن.", "Kaveh's car is a beast on the straights. Use your nitro wisely.")
            ),
            Line(KAVEH, "…منطقهٔ صنعتی، شب بارانی. شاهین اون‌جا منتظر کسیه که جرئت داشته باشه. ماشینم هم مال تو — قول، قوله.", "…The industrial zone, a rainy night. Shahin waits there for anyone brave enough. And my car is yours — a deal's a deal."),
            Line(KAVEH, "آهن خم نمی‌شه.", "Iron doesn't bend.")),
        // ================================================================ chapter 3
        Mission(2, "باران شبانه", "Night Rain",
            cfg(GameData.MODE_TWO_WAY, GameData.ENV_CITY, GameData.TOD_NIGHT, GameData.W_HEAVY_RAIN, goal = 4000f, id = 8),
            2000, -1, 0,
            arrayOf(
                Line(SHAHIN, "پس تو همونی که رضای پیر روش شرط بسته. خوبه. دوست دارم اول بترسونمت.", "So you're the one old Reza bet on. Good. I like to scare people first."),
                Line(SHAHIN, "خیابون دوطرفه، بارون شدید. ۴۰۰۰ امتیاز بگیر. اگه نتونی، اصلاً لیاقت مسابقه با منو نداری.", "Two-way street, heavy rain. Score 4,000. If you can't, you don't deserve to race me."),
                Line(REZA, "لاین مخالف امتیاز دو برابر داره… ولی تو بارون، ترمز تقریباً هیچ کاری نمی‌کنه.", "The oncoming lane pays double… but in this rain, your brakes barely work.")
            ),
            Line(SHAHIN, "جالبه. شاید ارزشش رو داشته باشی.", "Interesting. Maybe you're worth it."),
            Line(SHAHIN, "همونی که فکر می‌کردم. یه تازه‌کار.", "Just as I thought. A rookie.")),
        Mission(2, "تعقیب بزرگ", "The Big Chase",
            cfg(GameData.MODE_POLICE, GameData.ENV_INDUSTRIAL, GameData.TOD_NIGHT, GameData.W_STORM, goal = 2f, id = 9),
            2500, -1, 0,
            arrayOf(
                Line(MAHTAB, "این بار کل منطقهٔ صنعتی رو بستم. هیچ راه فراری نداری.", "This time I've sealed off the whole industrial zone. There's no way out."),
                Line(LEILA, "دو بار فرار کن. ماشین‌های پلیس اگه به ترافیک بخورن از کار میفتن — ازش استفاده کن!", "Escape twice. Police cars that hit traffic are out — use that!")
            ),
            Line(MAHTAB, "…صبر کن. تو برای شاهین کار نمی‌کنی، نه؟ — اگه شکستش بدی، شاید بتونیم با هم کار کنیم.", "…Wait. You don't work for Shahin, do you? — Beat him, and maybe we can work together."),
            Line(MAHTAB, "تو طوفان هیچ‌کس از دست من فرار نمی‌کنه.", "Nobody escapes me in a storm.")),
        Mission(2, "دریفت صنعتی", "Industrial Drift",
            cfg(GameData.MODE_DRIFT, GameData.ENV_INDUSTRIAL, GameData.TOD_NIGHT, GameData.W_LIGHT_RAIN,
                gold = 420000f, silver = 200000f, bronze = 90000f, time = 80f, id = 10),
            2500, -1, 0,
            arrayOf(
                Line(REZA, "شاهین قبل از هر مسابقه آدم‌هاش رو با دریفت امتحان می‌کنه. این آخرین در قبل از اونه.", "Shahin tests everyone with a drift before he races. This is the last door before him."),
                Line(REZA, "جاده خیسه. ماشین راحت‌تر سُر می‌خوره ولی زودتر از کنترل خارج می‌شه. ۱۸ هزار امتیاز.", "The road is wet. The car slides easier — and gets away from you faster. 18,000 points.")
            ),
            Line(LEILA, "شاهین قبول کرد. مسابقهٔ آخر: امشب، کوهستان، وسط طوفان.", "Shahin accepted. The final race: tonight, in the mountains, in the storm."),
            Line(REZA, "نفس بکش. آروم. دوباره.", "Breathe. Easy. Again.")),
        Mission(2, "تاج شب", "Night Crown",
            cfg(GameData.MODE_STREET, GameData.ENV_MOUNTAIN, GameData.TOD_NIGHT, GameData.W_STORM,
                goal = 4000f, rivals = 3, skill = 1.12f, rivalCar = GameData.CAR_SUPER, id = 11),
            5000, GameData.CAR_SUPER, 1,
            arrayOf(
                Line(SHAHIN, "می‌دونی چرا اسممون «تاج شب»ه؟ چون هیچ‌کس تو تاریکی از ما جلو نزده.", "Know why we're called the Night Crown? Because no one has ever passed us in the dark."),
                Line(REZA, "این مسابقه سر گاراژ منه… ولی بیشتر از اون، سر اینه که تو کی هستی.", "This race is for my garage… but more than that, it's about who you are."),
                Line(LEILA, "چهار کیلومتر، طوفان، شب. اگه رعد زد، چشمات رو نبند. موفق باشی.", "Four kilometres, storm, night. When lightning strikes, don't close your eyes. Good luck."),
                Line(PLAYER, "تاج امشب عوض می‌شه.", "Tonight the crown changes hands.")
            ),
            Line(SHAHIN, "…هیچ‌کس تا حالا… باشه. تاج مال توئه. ماشینم هم همین‌طور.", "…No one has ever… Fine. The crown is yours. So is my car."),
            Line(SHAHIN, "تاریکی همیشه مال منه.", "The dark is always mine."))
    )

    /** Mission completion check on top of the generic run result. */
    fun passed(m: Mission, success: Boolean, medal: Int, position: Int): Boolean = when (m.config.mode) {
        GameData.MODE_STREET -> success && position <= m.needPosition
        GameData.MODE_TIME_TRIAL, GameData.MODE_DRIFT, GameData.MODE_CHALLENGE -> medal >= 1
        else -> success
    }

    val outro = arrayOf(
        Line(MAHTAB, "تاج شب تموم شد. شاهین و گروهش دیگه تو خیابون‌ها مسابقه نمی‌دن. ممنون، راننده.", "The Night Crown is finished. Shahin's crew won't race these streets again. Thank you, driver."),
        Line(REZA, "گاراژ سر جاشه. و حالا یه قهرمان داره.", "The garage stays. And now it has a champion."),
        Line(LEILA, "شهر، صحرا، کوهستان… همه‌جا باز است. هر وقت خواستی برو گشت آزاد.", "City, desert, mountains… it's all open. Go free roam whenever you like.")
    )
}
