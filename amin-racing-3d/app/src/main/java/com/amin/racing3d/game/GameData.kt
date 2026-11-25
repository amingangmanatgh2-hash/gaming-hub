package com.amin.racing3d.game

import com.amin.racing3d.R

/** Playable car definition. Speeds are in km/h, accelerations in m/s². */
class CarSpec(
    val id: Int,
    val nameRes: Int,
    val price: Int,
    val topSpeed: Float,
    val accel: Float,
    val handling: Float,
    val brake: Float,
    val nitroPower: Float,
    val length: Float,
    val width: Float,
    val wheelRadius: Float,
    val upgradeCostFactor: Float,
    val paints: IntArray,
    /** vehicle class label (hypercar, classic, sedan, …) */
    val catRes: Int = 0,
    /** kerb weight in kg: weight transfer, suspension stiffness, contact behaviour */
    val massKg: Int = 1500,
    /** tyre grip multiplier (lateral response, braking on low-grip surfaces) */
    val grip: Float = 1f,
    /** how easily the rear steps out (drift angle gain) */
    val drift: Float = 1f,
    /** off-road capable: loses less grip on snow / wet surfaces */
    val allTerrain: Boolean = false
)

class TrafficSpec(
    val id: Int,
    val length: Float,
    val width: Float,
    val height: Float,
    val wheelRadius: Float,
    val minSpeed: Float,
    val maxSpeed: Float,
    val weight: Int
)

/** Everything that defines one run: mode, place, time of day, weather and the mode objective. */
class RaceConfig(
    val mode: Int,
    val env: Int,
    val tod: Int,
    val weather: Int,
    /** finish distance (m) for street / time trial, required escapes for police, 0 = none */
    val goal: Float = 0f,
    /** medal thresholds: seconds for time trial (lower is better), points / counts otherwise */
    val gold: Float = 0f,
    val silver: Float = 0f,
    val bronze: Float = 0f,
    /** time limit in seconds (drift, traffic challenge), 0 = none */
    val timeLimit: Float = 0f,
    val rivals: Int = 3,
    val rivalSkill: Float = 1f,
    /** car of the lead rival (story), -1 = random */
    val rivalCar: Int = -1,
    /** story mission index, -1 for quick play */
    val missionId: Int = -1
)

class EnvSpec(
    val id: Int,
    val nameRes: Int,
    val price: Int,
    val grip: Float,
    val fogMul: Float
)

object GameData {
    const val CAR_SPORTS = 0
    const val CAR_MUSCLE = 1
    const val CAR_SUV = 2
    const val CAR_SUPER = 3
    const val CAR_CLASSIC = 4
    const val CAR_SEDAN = 5
    const val CAR_PICKUP = 6
    const val CAR_OFFROAD = 7
    const val CAR_POLICE = 8
    const val CAR_RACE = 9

    const val TR_SEDAN = 0
    const val TR_TAXI = 1
    const val TR_VAN = 2
    const val TR_TRUCK = 3
    const val TR_BUS = 4

    const val ENV_CITY = 0
    const val ENV_DESERT = 1
    const val ENV_SNOW = 2
    const val ENV_FOREST = 3
    const val ENV_COAST = 4
    const val ENV_INDUSTRIAL = 5
    const val ENV_MOUNTAIN = 6

    const val MODE_ENDLESS = 0
    const val MODE_TWO_WAY = 1
    const val MODE_TIME_ATTACK = 2
    const val MODE_STREET = 3
    const val MODE_DRIFT = 4
    const val MODE_TIME_TRIAL = 5
    const val MODE_POLICE = 6
    const val MODE_CHALLENGE = 7
    const val MODE_FREE = 8
    const val NUM_MODES = 9

    const val W_CLEAR = 0
    const val W_LIGHT_RAIN = 1
    const val W_HEAVY_RAIN = 2
    const val W_SNOW = 3
    const val W_FOG = 4
    const val W_STORM = 5
    /** per weather: rain intensity, snowfall, target road wetness, cloud cover, fog multiplier */
    val W_RAIN = floatArrayOf(0f, 0.4f, 1f, 0f, 0f, 1f)
    val W_SNOWFALL = floatArrayOf(0f, 0f, 0f, 1f, 0f, 0f)
    val W_WET = floatArrayOf(0f, 0.75f, 1f, 0.3f, 0.15f, 1f)
    val W_CLOUD = floatArrayOf(0f, 0.55f, 0.85f, 0.6f, 0.45f, 1f)
    val W_FOGMUL = floatArrayOf(1f, 1.6f, 2.5f, 2.1f, 4.4f, 2.9f)

    const val TOD_DAY = 0
    const val TOD_SUNSET = 1
    const val TOD_NIGHT = 2
    const val TOD_CYCLE = 3

    const val UPG_SPEED = 0
    const val UPG_HANDLING = 1
    const val UPG_BRAKES = 2
    const val UPG_NITRO = 3
    const val MAX_UPGRADE = 5

    const val LANE_WIDTH = 3.6f
    const val ROAD_HALF = 7.2f          // four lanes
    const val SHOULDER = 1.1f            // drivable shoulder beyond the edge line
    val LANE_X = floatArrayOf(-5.4f, -1.8f, 1.8f, 5.4f)

    val PAINT_PALETTE = intArrayOf(
        0xFF00B8FF.toInt(), 0xFFFF2D55.toInt(), 0xFFFFC21A.toInt(), 0xFF2BE07A.toInt(),
        0xFFFF7A1A.toInt(), 0xFF9B5CFF.toInt(), 0xFFF2F2F2.toInt(), 0xFF1C1E24.toInt(),
        0xFFFF4FD8.toInt(), 0xFF6E7B8B.toInt()
    )

    val cars = arrayOf(
        CarSpec(CAR_SPORTS, R.string.car_sports, 0, 228f, 7.6f, 8.6f, 13f, 1.25f, 4.4f, 1.9f, 0.34f, 1.0f, PAINT_PALETTE,
            R.string.cat_sports, 1350, 1.0f, 1.1f),
        CarSpec(CAR_MUSCLE, R.string.car_muscle, 9000, 246f, 8.8f, 7.6f, 12f, 1.30f, 4.9f, 2.0f, 0.36f, 1.4f, PAINT_PALETTE,
            R.string.cat_muscle, 1650, 0.92f, 1.45f),
        CarSpec(CAR_SUV, R.string.car_suv, 16000, 214f, 7.2f, 7.2f, 14f, 1.28f, 4.8f, 2.05f, 0.42f, 1.7f, PAINT_PALETTE,
            R.string.cat_suv, 2050, 0.93f, 0.8f, true),
        CarSpec(CAR_SUPER, R.string.car_super, 38000, 292f, 10.4f, 10.2f, 16f, 1.36f, 4.6f, 2.02f, 0.36f, 2.2f, PAINT_PALETTE,
            R.string.cat_hyper, 1420, 1.1f, 1.0f),
        CarSpec(CAR_CLASSIC, R.string.car_classic, 6000, 205f, 6.6f, 6.8f, 10.5f, 1.22f, 4.7f, 1.86f, 0.35f, 1.2f, PAINT_PALETTE,
            R.string.cat_classic, 1240, 0.86f, 1.35f),
        CarSpec(CAR_SEDAN, R.string.car_sedan, 12000, 238f, 8.0f, 8.0f, 13.5f, 1.27f, 4.8f, 1.9f, 0.35f, 1.3f, PAINT_PALETTE,
            R.string.cat_sedan, 1680, 1.0f, 0.95f),
        CarSpec(CAR_PICKUP, R.string.car_pickup, 14000, 198f, 6.8f, 6.2f, 11.5f, 1.25f, 5.5f, 2.06f, 0.45f, 1.5f, PAINT_PALETTE,
            R.string.cat_pickup, 2350, 0.9f, 0.85f, true),
        CarSpec(CAR_OFFROAD, R.string.car_offroad, 18000, 186f, 6.4f, 6.0f, 11f, 1.24f, 4.3f, 2.0f, 0.48f, 1.5f, PAINT_PALETTE,
            R.string.cat_offroad, 2100, 0.96f, 0.7f, true),
        CarSpec(CAR_POLICE, R.string.car_police, 30000, 262f, 9.4f, 8.8f, 15f, 1.32f, 4.9f, 1.92f, 0.36f, 1.9f, PAINT_PALETTE,
            R.string.cat_police, 1800, 1.02f, 1.0f),
        CarSpec(CAR_RACE, R.string.car_race, 60000, 305f, 11.0f, 11.0f, 18f, 1.38f, 4.7f, 2.08f, 0.37f, 2.5f, PAINT_PALETTE,
            R.string.cat_race, 1250, 1.16f, 0.85f)
    )

    val traffic = arrayOf(
        TrafficSpec(TR_SEDAN, 4.5f, 1.85f, 1.45f, 0.32f, 72f, 108f, 34),
        TrafficSpec(TR_TAXI, 4.6f, 1.85f, 1.55f, 0.32f, 70f, 104f, 18),
        TrafficSpec(TR_VAN, 5.2f, 2.0f, 2.25f, 0.36f, 66f, 96f, 18),
        TrafficSpec(TR_TRUCK, 9.6f, 2.5f, 3.5f, 0.5f, 58f, 84f, 16),
        TrafficSpec(TR_BUS, 11.6f, 2.55f, 3.2f, 0.5f, 58f, 80f, 14)
    )
    val trafficWeightTotal = traffic.sumOf { it.weight }

    val envs = arrayOf(
        EnvSpec(ENV_CITY, R.string.env_city, 0, 1.0f, 1.0f),
        EnvSpec(ENV_DESERT, R.string.env_desert, 4000, 0.95f, 1.15f),
        EnvSpec(ENV_SNOW, R.string.env_snow, 8000, 0.72f, 1.6f),
        EnvSpec(ENV_FOREST, R.string.env_forest, 12000, 0.92f, 1.3f),
        EnvSpec(ENV_COAST, R.string.env_coast, 6000, 1.0f, 1.1f),
        EnvSpec(ENV_INDUSTRIAL, R.string.env_industrial, 10000, 0.97f, 1.35f),
        EnvSpec(ENV_MOUNTAIN, R.string.env_mountain, 14000, 0.9f, 1.2f)
    )

    val modeNames = intArrayOf(R.string.mode_endless, R.string.mode_twoway, R.string.mode_time, R.string.mode_street,
        R.string.mode_drift, R.string.mode_trial, R.string.mode_police, R.string.mode_challenge, R.string.mode_free)
    val modeDescs = intArrayOf(R.string.mode_endless_desc, R.string.mode_twoway_desc, R.string.mode_time_desc, R.string.mode_street_desc,
        R.string.mode_drift_desc, R.string.mode_trial_desc, R.string.mode_police_desc, R.string.mode_challenge_desc, R.string.mode_free_desc)
    val weatherNames = intArrayOf(R.string.w_clear, R.string.w_light_rain, R.string.w_heavy_rain, R.string.w_snow, R.string.w_fog, R.string.w_storm)

    /** Quick-play objective for each mode (story missions define their own). */
    // ------------------------------------------------------------------ Garage 2.0 customization
    const val CUS_FINISH = 0
    const val CUS_RIM = 1
    const val CUS_RIM_COLOR = 2
    const val CUS_CALIPER = 3
    const val CUS_SPOILER = 4
    const val CUS_TINT = 5
    const val CUS_NEON = 6
    const val CUS_FLAME = 7
    const val CUS_INTERIOR = 8
    const val NUM_CUS = 9

    /** One purchasable option. [rgb] = colour (0xRRGGBB) or a parameter for the renderer. */
    class CustomOption(val fa: String, val en: String, val price: Int, val rgb: Int = 0xFFFFFF)

    val customCategories = arrayOf(
        arrayOf("پرداخت رنگ", "Paint finish"), arrayOf("رینگ", "Rims"), arrayOf("رنگ رینگ", "Rim colour"),
        arrayOf("کالیپر ترمز", "Brake calipers"), arrayOf("اسپویلر", "Spoiler"), arrayOf("دودی شیشه", "Window tint"),
        arrayOf("نئون زیر ماشین", "Underglow neon"), arrayOf("شعلهٔ اگزوز", "Exhaust flame"), arrayOf("رنگ داخلی", "Interior")
    )

    val customOptions: Array<Array<CustomOption>> = arrayOf(
        arrayOf(CustomOption("براق", "Gloss", 0), CustomOption("متالیک", "Metallic", 1500),
            CustomOption("مات", "Matte", 2000), CustomOption("کروم", "Chrome", 4500)),
        arrayOf(CustomOption("اسپرت ۱۰ پره", "Sport 10-spoke", 0), CustomOption("توربین", "Turbine", 1200),
            CustomOption("کاسه‌ای کلاسیک", "Deep dish", 1500)),
        arrayOf(CustomOption("نقره‌ای", "Silver", 0, 0xFFFFFF), CustomOption("مشکی", "Black", 400, 0x26272B),
            CustomOption("طلایی", "Gold", 700, 0xFFC64D), CustomOption("برنز", "Bronze", 500, 0xB8743F),
            CustomOption("فیروزه‌ای", "Cyan", 600, 0x33E0FF), CustomOption("قرمز", "Red", 500, 0xE5222E)),
        arrayOf(CustomOption("قرمز", "Red", 0, 0xD91420), CustomOption("زرد", "Yellow", 300, 0xFFC800),
            CustomOption("آبی", "Blue", 300, 0x1E5BFF), CustomOption("سبز", "Green", 300, 0x18C24A),
            CustomOption("مشکی", "Black", 300, 0x1A1A1C), CustomOption("طلایی", "Gold", 500, 0xE0A632)),
        arrayOf(CustomOption("کارخانه", "Stock", 0), CustomOption("داک‌تیل", "Ducktail", 1500),
            CustomOption("بال GT", "GT wing", 2500), CustomOption("بال GT کربنی", "Carbon GT wing", 3500)),
        arrayOf(CustomOption("بدون دودی", "None", 0), CustomOption("روشن", "Light", 500),
            CustomOption("تیره", "Dark", 800), CustomOption("لیموزینی", "Limo", 1200)),
        arrayOf(CustomOption("خاموش", "Off", 0), CustomOption("فیروزه‌ای", "Cyan", 2000, 0x00E5FF),
            CustomOption("صورتی", "Pink", 2000, 0xFF2D95), CustomOption("سبز", "Green", 2000, 0x39FF88),
            CustomOption("بنفش", "Purple", 2000, 0x9B5CFF), CustomOption("طلایی", "Gold", 2000, 0xFFC23D)),
        arrayOf(CustomOption("آبی نیترو", "Nitro blue", 0, 0x7FB8FF), CustomOption("نارنجی", "Orange", 1200, 0xFF8A1F),
            CustomOption("سبز", "Green", 1200, 0x49FF6A), CustomOption("بنفش", "Purple", 1200, 0xC05CFF),
            CustomOption("قرمز", "Red", 1200, 0xFF2B2B)),
        arrayOf(CustomOption("مشکی", "Black", 0, 0x23262D), CustomOption("چرم قرمز", "Red leather", 800, 0x8A1C22),
            CustomOption("کرم", "Tan", 800, 0x9C7350), CustomOption("سفید", "White", 800, 0xC9C6C0),
            CustomOption("آبی", "Blue", 800, 0x23407A))
    )

    /** cars with a factory rear wing: aftermarket spoilers would clash with it */
    fun hasFactoryWing(car: Int) = car == CAR_SPORTS || car == CAR_SUPER || car == CAR_RACE

    /** window tint level packed into the instance alpha (0..0.2) */
    val TINT_LEVELS = floatArrayOf(0f, 0.07f, 0.13f, 0.2f)

    fun defaultConfig(mode: Int, env: Int, tod: Int, weather: Int): RaceConfig = when (mode) {
        MODE_STREET -> RaceConfig(mode, env, tod, weather, goal = 3000f, rivals = 3, rivalSkill = 1f)
        MODE_DRIFT -> RaceConfig(mode, env, tod, weather, gold = 30000f, silver = 17000f, bronze = 8000f, timeLimit = 90f)
        MODE_TIME_TRIAL -> RaceConfig(mode, env, tod, weather, goal = 2500f, gold = 54f, silver = 62f, bronze = 74f)
        MODE_POLICE -> RaceConfig(mode, env, tod, weather)
        MODE_CHALLENGE -> RaceConfig(mode, env, tod, weather, gold = 30f, silver = 22f, bronze = 15f, timeLimit = 75f)
        else -> RaceConfig(mode, env, tod, weather)
    }
    val todNames = intArrayOf(R.string.tod_day, R.string.tod_sunset, R.string.tod_night, R.string.tod_cycle)
    val upgradeNames = intArrayOf(R.string.stat_speed, R.string.stat_handling, R.string.stat_brakes, R.string.stat_nitro)
    val upgradeDescs = intArrayOf(R.string.upg_speed_desc, R.string.upg_handling_desc, R.string.upg_brakes_desc, R.string.upg_nitro_desc)

    fun upgradeCost(car: CarSpec, currentLevel: Int): Int =
        ((1200 + currentLevel * 1300) * car.upgradeCostFactor / 50f).toInt() * 50

    /** Effective stats including upgrades. */
    fun topSpeedKmh(car: CarSpec, lvl: Int) = car.topSpeed * (1f + 0.055f * lvl)
    fun handling(car: CarSpec, lvl: Int) = car.handling * (1f + 0.07f * lvl)
    fun brake(car: CarSpec, lvl: Int) = car.brake * (1f + 0.09f * lvl)
    fun nitroPower(car: CarSpec, lvl: Int) = car.nitroPower + 0.035f * lvl
    fun nitroDrain(lvl: Int) = 0.22f * (1f - 0.08f * lvl)

    /** Normalized (0..1) stat values for garage bars. */
    fun statBar(car: CarSpec, stat: Int, lvl: Int): Float = when (stat) {
        0 -> (topSpeedKmh(car, lvl) - 180f) / 180f
        1 -> (car.accel - 5f) / 7f
        2 -> (handling(car, lvl) - 5f) / 9f
        3 -> (brake(car, lvl) - 9f) / 14f
        else -> (nitroPower(car, lvl) - 1.1f) / 0.5f
    }.coerceIn(0.05f, 1f)
}
