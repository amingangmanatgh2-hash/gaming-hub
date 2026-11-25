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
    val paints: IntArray
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

    const val TR_SEDAN = 0
    const val TR_TAXI = 1
    const val TR_VAN = 2
    const val TR_TRUCK = 3
    const val TR_BUS = 4

    const val ENV_CITY = 0
    const val ENV_DESERT = 1
    const val ENV_SNOW = 2
    const val ENV_FOREST = 3

    const val MODE_ENDLESS = 0
    const val MODE_TWO_WAY = 1
    const val MODE_TIME_ATTACK = 2

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
        CarSpec(CAR_SPORTS, R.string.car_sports, 0, 228f, 7.6f, 8.6f, 13f, 1.25f, 4.4f, 1.9f, 0.34f, 1.0f, PAINT_PALETTE),
        CarSpec(CAR_MUSCLE, R.string.car_muscle, 9000, 246f, 8.8f, 7.6f, 12f, 1.30f, 4.9f, 2.0f, 0.36f, 1.4f, PAINT_PALETTE),
        CarSpec(CAR_SUV, R.string.car_suv, 16000, 214f, 7.2f, 7.2f, 14f, 1.28f, 4.8f, 2.05f, 0.42f, 1.7f, PAINT_PALETTE),
        CarSpec(CAR_SUPER, R.string.car_super, 38000, 292f, 10.4f, 10.2f, 16f, 1.36f, 4.6f, 2.02f, 0.36f, 2.2f, PAINT_PALETTE)
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
        EnvSpec(ENV_FOREST, R.string.env_forest, 12000, 0.92f, 1.3f)
    )

    val modeNames = intArrayOf(R.string.mode_endless, R.string.mode_twoway, R.string.mode_time)
    val modeDescs = intArrayOf(R.string.mode_endless_desc, R.string.mode_twoway_desc, R.string.mode_time_desc)
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
