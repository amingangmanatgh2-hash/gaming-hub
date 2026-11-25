package com.amin.racing3d.ui

import android.annotation.SuppressLint
import android.content.res.ColorStateList
import android.graphics.drawable.GradientDrawable
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.SeekBar
import com.amin.racing3d.R
import com.amin.racing3d.audio.AudioEngine
import com.amin.racing3d.core.Lang
import com.amin.racing3d.game.GameData

// =====================================================================================
/** Garage / car select: rotating 3D showroom car, stats, paint and purchase. */
class GarageScreen(host: GameHost) : Screen(host) {
    override val dim = 0f
    private var car = save.selectedCar
    private var previewPaint = save.paintIndex(car)
    private lateinit var panel: LinearLayout
    private lateinit var nameView: android.widget.TextView
    private lateinit var priceView: android.widget.TextView

    @SuppressLint("ClickableViewAccessibility")
    override fun build(): View {
        val root = FrameLayout(ctx)

        // drag-to-rotate surface (transparent, under the UI)
        val drag = View(ctx)
        var lastX = 0f
        drag.setOnTouchListener { _, ev ->
            when (ev.actionMasked) {
                MotionEvent.ACTION_DOWN -> { lastX = ev.x; host.rotateShowroom(0f, true) }
                MotionEvent.ACTION_MOVE -> {
                    val dx = ev.x - lastX
                    lastX = ev.x
                    host.rotateShowroom(dx * 0.012f, true)
                }
                MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> host.rotateShowroom(0f, false)
            }
            true
        }
        root.addView(drag, FrameLayout.LayoutParams(Ui.MATCH, Ui.MATCH))

        val column = LinearLayout(ctx)
        column.orientation = LinearLayout.VERTICAL
        column.addView(header(str(R.string.garage_title)), LinearLayout.LayoutParams(Ui.MATCH, Ui.WRAP))

        // car name + arrows
        val nameRow = Ui.hbox(ctx, Gravity.CENTER)
        nameRow.setPadding(Ui.dp(12f), Ui.dp(4f), Ui.dp(12f), 0)
        // arrows point outward in both reading directions
        val prev = Ui.button(ctx, if (Lang.isFa) "›" else "‹", Ui.CYAN, false, 26f) { step(-1) }
        val next = Ui.button(ctx, if (Lang.isFa) "‹" else "›", Ui.CYAN, false, 26f) { step(1) }
        prev.setPadding(Ui.dp(18f), 0, Ui.dp(18f), Ui.dp(4f))
        next.setPadding(Ui.dp(18f), 0, Ui.dp(18f), Ui.dp(4f))
        val nameCol = Ui.vbox(ctx, Gravity.CENTER)
        nameView = Ui.glowTitle(ctx, "", 26f, Ui.TEXT)
        priceView = Ui.text(ctx, "", 13f, Ui.YELLOW, Ui.bold)
        priceView.gravity = Gravity.CENTER
        nameCol.addView(nameView, Ui.lp(Ui.WRAP))
        nameCol.addView(priceView, Ui.lp(Ui.WRAP))
        nameRow.addView(prev)
        nameRow.addView(nameCol, LinearLayout.LayoutParams(0, Ui.WRAP, 1f))
        nameRow.addView(next)

        panel = Ui.panel(ctx, true, Ui.withAlpha(Ui.PINK, 0x66))
        val scroll = ScrollView(ctx)
        scroll.isVerticalScrollBarEnabled = false
        scroll.addView(panel, FrameLayout.LayoutParams(Ui.MATCH, Ui.WRAP))

        if (portrait) {
            // car occupies the space between the name and the bottom panel
            column.addView(nameRow, Ui.lp())
            val spacer = View(ctx)
            column.addView(spacer, LinearLayout.LayoutParams(Ui.MATCH, 0, 1f))
            val h = (ctx.resources.displayMetrics.heightPixels * 0.5f).toInt()
            val lp = LinearLayout.LayoutParams(Ui.MATCH, Ui.WRAP)
            lp.setMargins(Ui.dp(10f), 0, Ui.dp(10f), Ui.dp(10f))
            scroll.layoutParams = lp
            val box = FrameLayout(ctx)
            box.addView(scroll, FrameLayout.LayoutParams(Ui.MATCH, Ui.WRAP, Gravity.BOTTOM))
            column.addView(box, LinearLayout.LayoutParams(Ui.MATCH, h))
        } else {
            // the 3D car is framed on the left, so the panel always sits on the right
            val body = Ui.hbox(ctx, Gravity.TOP)
            body.layoutDirection = View.LAYOUT_DIRECTION_LTR
            scroll.layoutDirection = Lang.layoutDirection
            panel.layoutDirection = Lang.layoutDirection
            val left = Ui.vbox(ctx, Gravity.CENTER_HORIZONTAL)
            nameRow.layoutDirection = Lang.layoutDirection
            left.addView(nameRow, Ui.lp())
            body.addView(left, LinearLayout.LayoutParams(0, Ui.MATCH, 1f))
            val lp = LinearLayout.LayoutParams(minOf(Ui.dp(360f), (ctx.resources.displayMetrics.widthPixels * 0.46f).toInt()), Ui.MATCH)
            lp.setMargins(0, 0, Ui.dp(10f), Ui.dp(10f))
            body.addView(scroll, lp)
            column.addView(body, LinearLayout.LayoutParams(Ui.MATCH, 0, 1f))
        }
        root.addView(column, FrameLayout.LayoutParams(Ui.MATCH, Ui.MATCH))
        refresh(false)
        return root
    }

    private fun step(d: Int) {
        val n = GameData.cars.size
        car = (car + d + n) % n
        previewPaint = save.paintIndex(car)
        refresh(true)
        nameView.translationX = Ui.dp(if (d > 0) 40f else -40f).toFloat() * (if (Lang.isFa) -1 else 1)
        nameView.alpha = 0f
        nameView.animate().translationX(0f).alpha(1f).setDuration(260).start()
    }

    private fun refresh(animate: Boolean) {
        val spec = GameData.cars[car]
        val owned = save.isCarOwned(car)
        host.showroom(car, GameData.PAINT_PALETTE[previewPaint])
        nameView.text = str(spec.nameRes)
        priceView.text = when {
            !owned -> "🔒 " + Lang.num(spec.price) + " " + str(R.string.coins)
            car == save.selectedCar -> str(R.string.selected)
            else -> "✓"
        }
        priceView.setTextColor(if (owned) Ui.GREEN else Ui.YELLOW)

        panel.removeAllViews()
        // ---- stats
        val statNames = intArrayOf(R.string.stat_speed, R.string.stat_accel, R.string.stat_handling, R.string.stat_brakes, R.string.stat_nitro)
        val statUpg = intArrayOf(GameData.UPG_SPEED, -1, GameData.UPG_HANDLING, GameData.UPG_BRAKES, GameData.UPG_NITRO)
        val statColors = intArrayOf(Ui.CYAN, Ui.YELLOW, Ui.PINK, Ui.RED, 0xFFB57BFF.toInt())
        for (i in 0..4) {
            val row = Ui.hbox(ctx)
            row.setPadding(0, Ui.dp(3f), 0, Ui.dp(3f))
            val label = Ui.text(ctx, str(statNames[i]), 13f, Ui.TEXT, Ui.bold)
            row.addView(label, LinearLayout.LayoutParams(Ui.dp(92f), Ui.WRAP))
            val lvl = if (statUpg[i] >= 0) save.upgradeLevel(car, statUpg[i]) else 0
            val base = GameData.statBar(spec, i, 0)
            val withUpg = GameData.statBar(spec, i, lvl)
            row.addView(Ui.statBar(ctx, base, statColors[i], withUpg - base), LinearLayout.LayoutParams(0, Ui.dp(9f), 1f))
            panel.addView(row, Ui.lp())
        }
        val speedLine = Ui.text(ctx, str(R.string.top_speed) + ": " +
            Lang.num(GameData.topSpeedKmh(spec, save.upgradeLevel(car, GameData.UPG_SPEED)).toInt()) + " " + str(R.string.kmh), 12f, Ui.DIM)
        panel.addView(speedLine, Ui.lp(topDp = 4f))
        // class, kerb weight and tyre grip (they change how the car handles, not only the bars above)
        val info = StringBuilder()
        if (spec.catRes != 0) info.append(str(spec.catRes)).append("  •  ")
        info.append(str(R.string.stat_weight)).append(": ").append(Lang.num(spec.massKg)).append(' ').append(str(R.string.kg))
        info.append("  •  ").append(str(R.string.stat_grip)).append(": ").append(Lang.num((spec.grip * 100f).toInt())).append('%')
        if (spec.allTerrain) info.append("  •  4×4")
        panel.addView(Ui.text(ctx, info.toString(), 12f, Ui.CYAN, Ui.bold), Ui.lp(topDp = 2f))

        // ---- paint
        panel.addView(sectionTitle(str(R.string.paint)), Ui.lp())
        val pal = GameData.PAINT_PALETTE
        val perRow = 5
        var row: LinearLayout? = null
        for (i in pal.indices) {
            if (i % perRow == 0) {
                row = Ui.hbox(ctx, Gravity.CENTER)
                panel.addView(row, Ui.lp(topDp = 4f))
            }
            val sw = View(ctx)
            val sel = i == previewPaint
            sw.background = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setColor(pal[i])
                setStroke(Ui.dp(if (sel) 3f else 1f), if (sel) Ui.TEXT else Ui.withAlpha(Ui.TEXT, 0x44))
            }
            if (sel) { sw.scaleX = 1.12f; sw.scaleY = 1.12f }
            sw.isClickable = true
            sw.setOnClickListener {
                host.sfx(AudioEngine.SFX_CLICK)
                previewPaint = i
                if (save.isCarOwned(car)) save.setPaintIndex(car, i)
                refresh(false)
            }
            val lp = LinearLayout.LayoutParams(Ui.dp(34f), Ui.dp(34f))
            lp.marginStart = Ui.dp(6f); lp.marginEnd = Ui.dp(6f)
            row!!.addView(sw, lp)
        }

        // ---- actions
        if (owned) {
            if (car == save.selectedCar) {
                val t = Ui.text(ctx, str(R.string.selected), 16f, Ui.GREEN, Ui.bold)
                t.gravity = Gravity.CENTER
                t.background = Ui.bg(Ui.withAlpha(Ui.GREEN, 0x1A), Ui.withAlpha(Ui.GREEN, 0x88), 16f, 1.4f)
                t.setPadding(0, Ui.dp(11f), 0, Ui.dp(11f))
                panel.addView(t, Ui.lp(topDp = 14f))
            } else {
                panel.addView(Ui.button(ctx, str(R.string.select), Ui.GREEN, true, 18f) {
                    save.selectedCar = car
                    host.sfx(AudioEngine.SFX_BUY)
                    refresh(false)
                }, Ui.lp(topDp = 14f))
            }
            panel.addView(Ui.button(ctx, str(R.string.upgrade_shop), Ui.YELLOW, false, 16f) {
                host.push(UpgradeScreen(host, car))
            }, Ui.lp(topDp = 8f))
        } else {
            panel.addView(Ui.button(ctx, str(R.string.buy_for, Lang.num(spec.price)), Ui.YELLOW, true, 18f) {
                if (save.coins < spec.price) {
                    host.toast(str(R.string.not_enough_coins), Ui.RED)
                    return@button
                }
                host.confirm(str(R.string.buy_for, Lang.num(spec.price)) + " — " + str(spec.nameRes)) {
                    if (save.spend(spec.price)) {
                        save.setCarOwned(car)
                        save.setPaintIndex(car, previewPaint)
                        save.selectedCar = car
                        host.sfx(AudioEngine.SFX_BUY)
                        host.toast(str(R.string.purchased), Ui.GREEN)
                        refreshCoins()
                        refresh(false)
                    } else host.toast(str(R.string.not_enough_coins), Ui.RED)
                }
            }, Ui.lp(topDp = 14f))
        }
        if (animate) staggerIn(panel, 0L, 14f)
    }

    override fun onBack() {
        host.leaveShowroom()
        host.back()
    }
}

// =====================================================================================
class UpgradeScreen(host: GameHost, private val car: Int) : Screen(host) {
    override val dim = 0.35f
    private lateinit var list: LinearLayout

    override fun build(): View = page(str(R.string.upgrade_shop), 560f) { col ->
        val spec = GameData.cars[car]
        val t = Ui.glowTitle(ctx, str(spec.nameRes), 22f, Ui.PINK)
        col.addView(t, Ui.lp(Ui.WRAP, bottomDp = 6f))
        list = Ui.vbox(ctx)
        col.addView(list, Ui.lp())
        fill()
        staggerIn(list, 0L, 20f)
    }

    private fun fill() {
        list.removeAllViews()
        val spec = GameData.cars[car]
        val colors = intArrayOf(Ui.CYAN, Ui.PINK, Ui.RED, 0xFFB57BFF.toInt())
        for (u in 0..3) {
            val lvl = save.upgradeLevel(car, u)
            val card = Ui.vbox(ctx, Gravity.START)
            card.background = Ui.bg(Ui.PANEL, Ui.withAlpha(colors[u], 0x66), 16f, 1.2f)
            card.setPadding(Ui.dp(14f), Ui.dp(12f), Ui.dp(14f), Ui.dp(12f))
            val top = Ui.hbox(ctx)
            val nameCol = Ui.vbox(ctx, Gravity.START)
            nameCol.addView(Ui.text(ctx, str(GameData.upgradeNames[u]), 17f, colors[u], Ui.black))
            nameCol.addView(Ui.text(ctx, str(GameData.upgradeDescs[u]), 12f, Ui.DIM))
            top.addView(nameCol, LinearLayout.LayoutParams(0, Ui.WRAP, 1f))
            top.addView(Ui.text(ctx, str(R.string.level_fmt, Lang.num(lvl), Lang.num(GameData.MAX_UPGRADE)), 12f, Ui.TEXT, Ui.bold))
            card.addView(top, Ui.lp())

            val pips = Ui.hbox(ctx)
            for (k in 0 until GameData.MAX_UPGRADE) {
                val pip = View(ctx)
                pip.background = Ui.bg(if (k < lvl) colors[u] else Ui.withAlpha(Ui.TEXT, 0x22), 0, 4f)
                val lp = LinearLayout.LayoutParams(0, Ui.dp(8f), 1f)
                lp.marginEnd = Ui.dp(4f)
                pips.addView(pip, lp)
            }
            card.addView(pips, Ui.lp(topDp = 8f))

            if (lvl >= GameData.MAX_UPGRADE) {
                val m = Ui.text(ctx, str(R.string.maxed), 14f, Ui.GREEN, Ui.bold)
                m.gravity = Gravity.CENTER
                m.setPadding(0, Ui.dp(8f), 0, 0)
                card.addView(m, Ui.lp())
            } else {
                val cost = GameData.upgradeCost(spec, lvl)
                card.addView(Ui.button(ctx, str(R.string.upgrade_btn, Lang.num(cost)), colors[u], save.coins >= cost, 15f) {
                    if (save.spend(cost)) {
                        save.setUpgradeLevel(car, u, lvl + 1)
                        host.sfx(AudioEngine.SFX_BUY)
                        host.toast(str(GameData.upgradeNames[u]) + " ↑ " + Lang.num(lvl + 1), colors[u])
                        refreshCoins()
                        fill()
                    } else host.toast(str(R.string.not_enough_coins), Ui.RED)
                }, Ui.lp(topDp = 10f))
            }
            list.addView(card, Ui.lp(topDp = 8f))
        }
    }
}

// =====================================================================================
class SettingsScreen(host: GameHost) : Screen(host) {

    override fun build(): View = page(str(R.string.settings_title), 600f) { col ->
        // ---- language
        col.addView(sectionTitle(str(R.string.set_language)), Ui.lp())
        col.addView(Ui.segmented(ctx, listOf(str(R.string.lang_fa), str(R.string.lang_en)), if (Lang.isFa) 0 else 1) {
            val lang = if (it == 0) Lang.FA else Lang.EN
            if (lang != save.language) host.changeLanguage(lang)
        }, Ui.lp())

        // ---- controls
        col.addView(sectionTitle(str(R.string.set_controls)), Ui.lp())
        if (host.tiltAvailable) {
            col.addView(Ui.segmented(ctx, listOf(str(R.string.ctl_tilt), str(R.string.ctl_touch)), save.controlMode) {
                save.controlMode = it
                host.applySettings()
            }, Ui.lp())
        } else {
            val n = Ui.text(ctx, str(R.string.no_tilt_sensor), 13f, Ui.YELLOW)
            col.addView(n, Ui.lp())
        }
        col.addView(Ui.text(ctx, str(R.string.set_sensitivity), 13f, Ui.TEXT, Ui.bold), Ui.lp(topDp = 12f))
        val seek = SeekBar(ctx)
        seek.max = 100
        seek.progress = (save.sensitivity * 100).toInt()
        seek.progressTintList = ColorStateList.valueOf(Ui.CYAN)
        seek.thumbTintList = ColorStateList.valueOf(Ui.CYAN)
        seek.progressBackgroundTintList = ColorStateList.valueOf(Ui.DIM)
        seek.setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
            override fun onProgressChanged(sb: SeekBar?, p: Int, fromUser: Boolean) {
                if (fromUser) { save.sensitivity = p / 100f; host.applySettings() }
            }
            override fun onStartTrackingTouch(sb: SeekBar?) {}
            override fun onStopTrackingTouch(sb: SeekBar?) {}
        })
        col.addView(seek, Ui.lp(topDp = 4f))
        if (host.tiltAvailable) {
            col.addView(Ui.text(ctx, str(R.string.calibrate_hint), 12f, Ui.DIM), Ui.lp(topDp = 6f))
            col.addView(Ui.button(ctx, str(R.string.set_calibrate), Ui.CYAN, false, 15f) { host.calibrateTilt() }, Ui.lp(topDp = 6f))
        }
        col.addView(toggleRow(R.string.set_autogas, save.autoGas) { save.autoGas = it }, Ui.lp(topDp = 6f))

        // ---- graphics
        col.addView(sectionTitle(str(R.string.set_graphics)), Ui.lp())
        col.addView(Ui.segmented(ctx, listOf(str(R.string.gfx_low), str(R.string.gfx_med), str(R.string.gfx_high), str(R.string.gfx_ultra)), save.graphics, Ui.PINK) {
            if (it == 3 && !host.ultraSupported) {
                // never force Ultra on devices that cannot render it
                save.graphics = 2
                host.toast(str(R.string.gfx_ultra_unsupported), Ui.YELLOW)
            } else save.graphics = it
            host.applySettings()
        }, Ui.lp())
        col.addView(toggleRow(R.string.set_auto_quality, save.autoQuality) { save.autoQuality = it }, Ui.lp(topDp = 6f))
        col.addView(toggleRow(R.string.set_shake, save.cameraShake) { save.cameraShake = it }, Ui.lp())
        col.addView(toggleRow(R.string.set_fps, save.showFps) { save.showFps = it }, Ui.lp())

        // ---- audio
        col.addView(sectionTitle(str(R.string.audio_title)), Ui.lp())
        col.addView(toggleRow(R.string.set_sound, save.sfxOn) { save.sfxOn = it }, Ui.lp())
        col.addView(toggleRow(R.string.set_music, save.musicOn) { save.musicOn = it }, Ui.lp())
        col.addView(toggleRow(R.string.set_mute, save.muted) { save.muted = it }, Ui.lp())
        col.addView(toggleRow(R.string.set_vibrate, save.vibration) { save.vibration = it }, Ui.lp())

        // ---- updates (GitHub releases, only when online)
        col.addView(sectionTitle(str(R.string.upd_title)), Ui.lp())
        col.addView(toggleRow(R.string.upd_auto, save.autoUpdateCheck) { save.autoUpdateCheck = it }, Ui.lp())
        col.addView(Ui.text(ctx, str(R.string.upd_installed, Lang.digits(com.amin.racing3d.core.UpdateChecker.installedVersion(ctx))), 12f, Ui.DIM), Ui.lp(topDp = 4f))
        col.addView(Ui.button(ctx, str(R.string.upd_check_now), Ui.CYAN, false, 15f) { host.checkUpdatesNow() }, Ui.lp(topDp = 6f))

        // ---- reset
        col.addView(Ui.button(ctx, str(R.string.reset_progress), Ui.RED, false, 14f) {
            host.confirm(str(R.string.reset_confirm)) {
                save.resetProgress()
                host.applySettings()
                refreshCoins()
                host.toast(str(R.string.reset_done), Ui.YELLOW)
            }
        }, Ui.lp(topDp = 22f))
        val ver = Ui.text(ctx, str(R.string.version) + "\n" + str(R.string.credits), 11f, Ui.DIM)
        ver.gravity = Gravity.CENTER
        col.addView(ver, Ui.lp(topDp = 14f))
    }

    private fun toggleRow(label: Int, value: Boolean, onChange: (Boolean) -> Unit): View {
        val row = Ui.hbox(ctx)
        row.background = Ui.bg(Ui.PANEL_LIGHT, 0, 12f)
        row.setPadding(Ui.dp(14f), Ui.dp(8f), Ui.dp(10f), Ui.dp(8f))
        row.addView(Ui.text(ctx, str(label), 14f, Ui.TEXT), LinearLayout.LayoutParams(0, Ui.WRAP, 1f))
        row.addView(Ui.toggle(ctx, value) {
            onChange(it)
            host.applySettings()
        })
        val wrap = FrameLayout(ctx)
        wrap.setPadding(0, Ui.dp(3f), 0, Ui.dp(3f))
        wrap.addView(row, FrameLayout.LayoutParams(Ui.MATCH, Ui.WRAP))
        return wrap
    }
}
