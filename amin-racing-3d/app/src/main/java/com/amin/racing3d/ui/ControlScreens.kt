package com.amin.racing3d.ui

import android.content.res.ColorStateList
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Path
import android.view.Gravity
import android.view.View
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.SeekBar
import com.amin.racing3d.core.Lang
import com.amin.racing3d.core.SaveManager
import com.amin.racing3d.input.InputState

private fun t(fa: String, en: String) = if (Lang.isFa) fa else en

/**
 * v2.1 control settings: steering mode (buttons / wheel / tilt), independent sensitivities for
 * steering, throttle, brake and tilt, dead zone, smoothing and response curve with a live preview of
 * the curve, tilt calibration and the HUD layout editor.
 */
class ControlsScreen(host: GameHost) : Screen(host) {
    private var curveView: CurveView? = null

    override fun build(): View = page(t("کنترل‌ها", "Controls"), 620f) { col ->
        col.addView(sectionTitle(t("روش فرمان", "Steering mode")), Ui.lp())
        val modes = ArrayList<CharSequence>()
        modes.add(t("دکمه", "Buttons")); modes.add(t("فرمان مجازی", "Wheel"))
        if (host.tiltAvailable) modes.add(t("شیب گوشی", "Tilt"))
        // segment order: buttons, wheel, tilt  ↔  save: TILT 0, TOUCH 1, WHEEL 2
        val sel = when (save.controlMode) { SaveManager.CONTROL_WHEEL -> 1; SaveManager.CONTROL_TILT -> if (host.tiltAvailable) 2 else 0; else -> 0 }
        col.addView(Ui.segmented(ctx, modes, sel) {
            save.controlMode = when (it) { 1 -> SaveManager.CONTROL_WHEEL; 2 -> SaveManager.CONTROL_TILT; else -> SaveManager.CONTROL_TOUCH }
            host.applySettings()
            host.replaceTop(ControlsScreen(host))
        }, Ui.lp())
        val modeInfo = when (save.controlMode) {
            SaveManager.CONTROL_WHEEL -> t("فرمان را با انگشت دور مرکزش بچرخانید؛ رها کنید تا خودش صاف شود. ۱۲۰ درجه = فرمان کامل.",
                "Turn the wheel around its centre with a finger; release and it self-centres. 120° = full lock.")
            SaveManager.CONTROL_TILT -> t("گوشی را مثل فرمان کج کنید. قبل از رانندگی کالیبره کنید.", "Tilt the phone like a steering wheel. Calibrate before driving.")
            else -> t("دکمه‌های چپ/راست؛ فرمان به‌تدریج و با سرعت تنظیم‌شده می‌چرخد.", "Left/right buttons; the wheels turn in at the speed you set.")
        }
        col.addView(Ui.text(ctx, modeInfo, 12f, Ui.DIM), Ui.lp(topDp = 4f))
        if (!host.tiltAvailable) col.addView(Ui.text(ctx, str(com.amin.racing3d.R.string.no_tilt_sensor), 12f, Ui.YELLOW), Ui.lp(topDp = 4f))

        col.addView(sectionTitle(t("حساسیت‌ها", "Sensitivity")), Ui.lp())
        col.addView(slider(t("فرمان (دکمه و فرمان مجازی)", "Steering (buttons & wheel)"), save.steerSens,
            { p -> t("حداکثر زاویه ", "Max lock ") + pct(0.75f + 0.5f * p) }) { save.steerSens = it }, Ui.lp())
        col.addView(slider(t("گاز", "Throttle"), save.gasSens,
            { p -> t("گاز کامل در ", "Full throttle in ") + secs(1f / (2f + 16f * p)) }) { save.gasSens = it }, Ui.lp())
        col.addView(slider(t("ترمز", "Brake"), save.brakeSens,
            { p -> t("قدرت ", "Force ") + pct(0.7f + 0.5f * p) }) { save.brakeSens = it }, Ui.lp())
        if (host.tiltAvailable) {
            col.addView(slider(t("شیب", "Tilt"), save.sensitivity,
                { p -> t("فرمان کامل با ", "Full lock at ") + Lang.digits(Math.toDegrees((0.62 + (0.17 - 0.62) * p)).toInt().toString()) + "°" }) { save.sensitivity = it }, Ui.lp())
        }

        col.addView(sectionTitle(t("پاسخ فرمان", "Steering response")), Ui.lp())
        col.addView(Ui.segmented(ctx, listOf(t("خطی", "Linear"), t("تدریجی", "Progressive"), t("تند", "Aggressive")), save.steerCurve, Ui.PINK) {
            save.steerCurve = it
            host.applySettings()
            curveView?.invalidate()
        }, Ui.lp())
        val cv = CurveView(ctx, save)
        curveView = cv
        col.addView(cv, LinearLayout.LayoutParams(Ui.MATCH, Ui.dp(120f)).apply { topMargin = Ui.dp(8f) })
        col.addView(Ui.text(ctx, t("محور افقی: ورودی (شیب/فرمان)، محور عمودی: زاویه چرخ. ناحیه خاکستری = منطقه مرده.",
            "Horizontal: input (tilt / wheel), vertical: wheel angle. Grey band = dead zone."), 11f, Ui.DIM), Ui.lp(topDp = 4f))
        col.addView(slider(t("منطقه مرده", "Dead zone"), save.deadZone, { p -> pct(p * 0.2f) }) { save.deadZone = it; curveView?.invalidate() }, Ui.lp())
        col.addView(slider(t("نرمی فرمان", "Steering smoothing"), save.steerSmoothing,
            { p -> t("تأخیر ", "Lag ") + secs(1f / (34f - 26f * p)) }) { save.steerSmoothing = it }, Ui.lp())

        if (host.tiltAvailable) {
            col.addView(Ui.text(ctx, str(com.amin.racing3d.R.string.calibrate_hint), 12f, Ui.DIM), Ui.lp(topDp = 8f))
            col.addView(Ui.button(ctx, str(com.amin.racing3d.R.string.set_calibrate), Ui.CYAN, false, 15f) { host.calibrateTilt() }, Ui.lp(topDp = 6f))
        }
        col.addView(toggle(str(com.amin.racing3d.R.string.set_autogas), save.autoGas) { save.autoGas = it }, Ui.lp(topDp = 8f))

        col.addView(sectionTitle(t("چیدمان دکمه‌ها", "Button layout")), Ui.lp())
        col.addView(Ui.text(ctx, t("اندازه، شفافیت و جای دکمه‌ها را تنظیم کنید؛ ترمز دستی در حالت دریفت و گشت آزاد ظاهر می‌شود.",
            "Set the size, opacity and position of the controls; the handbrake appears in Drift and Free Roam."), 12f, Ui.DIM), Ui.lp())
        col.addView(Ui.button(ctx, t("✥  ویرایش چیدمان", "✥  Edit layout"), Ui.PINK, true, 16f) { host.push(HudLayoutScreen(host)) }, Ui.lp(topDp = 8f))
        col.addView(Ui.button(ctx, t("بازگشت به پیش‌فرض", "Reset to defaults"), Ui.YELLOW, false, 14f) {
            save.steerSens = 0.5f; save.gasSens = 0.6f; save.brakeSens = 0.6f; save.deadZone = 0.15f; save.steerSmoothing = 0.35f; save.steerCurve = 1
            save.resetHudLayout()
            host.applySettings()
            host.replaceTop(ControlsScreen(host))
            host.toast(t("تنظیمات کنترل بازنشانی شد", "Controls reset"), Ui.GREEN)
        }, Ui.lp(topDp = 8f))
    }

    private fun pct(v: Float) = Lang.digits("${(v * 100).toInt()}٪".let { if (Lang.isFa) it else it.replace('٪', '%') })
    private fun secs(v: Float) = Lang.digits(String.format(java.util.Locale.US, "%.2f", v)) + t(" ثانیه", " s")

    private fun slider(label: String, value: Float, info: (Float) -> String, onChange: (Float) -> Unit): View {
        val box = Ui.vbox(ctx, Gravity.NO_GRAVITY)
        box.background = Ui.bg(Ui.PANEL_LIGHT, 0, 12f)
        box.setPadding(Ui.dp(14f), Ui.dp(8f), Ui.dp(14f), Ui.dp(6f))
        val row = Ui.hbox(ctx)
        row.addView(Ui.text(ctx, label, 13.5f, Ui.TEXT, Ui.bold), LinearLayout.LayoutParams(0, Ui.WRAP, 1f))
        val v = Ui.text(ctx, info(value), 12f, Ui.CYAN)
        row.addView(v, LinearLayout.LayoutParams(Ui.WRAP, Ui.WRAP))
        box.addView(row, LinearLayout.LayoutParams(Ui.MATCH, Ui.WRAP))
        val seek = SeekBar(ctx)
        seek.max = 100
        seek.progress = (value * 100).toInt()
        seek.progressTintList = ColorStateList.valueOf(Ui.CYAN)
        seek.thumbTintList = ColorStateList.valueOf(Ui.CYAN)
        seek.progressBackgroundTintList = ColorStateList.valueOf(Ui.DIM)
        seek.setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
            override fun onProgressChanged(sb: SeekBar?, p: Int, fromUser: Boolean) {
                if (!fromUser) return
                onChange(p / 100f)
                v.text = info(p / 100f)
                host.applySettings()
            }
            override fun onStartTrackingTouch(sb: SeekBar?) {}
            override fun onStopTrackingTouch(sb: SeekBar?) {}
        })
        box.addView(seek, LinearLayout.LayoutParams(Ui.MATCH, Ui.WRAP))
        val wrap = FrameLayout(ctx)
        wrap.setPadding(0, Ui.dp(3f), 0, Ui.dp(3f))
        wrap.addView(box, FrameLayout.LayoutParams(Ui.MATCH, Ui.WRAP))
        return wrap
    }

    private fun toggle(label: String, value: Boolean, onChange: (Boolean) -> Unit): View {
        val row = Ui.hbox(ctx)
        row.background = Ui.bg(Ui.PANEL_LIGHT, 0, 12f)
        row.setPadding(Ui.dp(14f), Ui.dp(8f), Ui.dp(10f), Ui.dp(8f))
        row.addView(Ui.text(ctx, label, 14f, Ui.TEXT), LinearLayout.LayoutParams(0, Ui.WRAP, 1f))
        row.addView(Ui.toggle(ctx, value) { onChange(it); host.applySettings() })
        return row
    }

    /** Plots the steering response curve with the current dead zone. */
    private class CurveView(ctx: android.content.Context, val save: SaveManager) : View(ctx) {
        private val d = resources.displayMetrics.density
        private val p = Paint(Paint.ANTI_ALIAS_FLAG)
        private val path = Path()
        override fun onDraw(c: Canvas) {
            val w = width.toFloat(); val h = height.toFloat()
            p.style = Paint.Style.FILL
            p.color = Ui.PANEL_LIGHT
            c.drawRoundRect(0f, 0f, w, h, 12f * d, 12f * d, p)
            val pad = 10f * d
            val x0 = pad; val x1 = w - pad; val y0 = h - pad; val y1 = pad
            val dead = save.deadZone * 0.2f
            p.color = 0x33FFFFFF
            c.drawRect(x0, y1, x0 + (x1 - x0) * dead, y0, p)
            p.style = Paint.Style.STROKE
            p.strokeWidth = 1f * d
            p.color = 0x44FFFFFF
            c.drawLine(x0, y0, x1, y1, p)
            path.reset()
            for (i in 0..48) {
                val u = i / 48f
                val v = InputState.shapeCurve(u, dead, save.steerCurve)
                val x = x0 + (x1 - x0) * u; val y = y0 + (y1 - y0) * v
                if (i == 0) path.moveTo(x, y) else path.lineTo(x, y)
            }
            p.strokeWidth = 3f * d
            p.color = Ui.CYAN
            c.drawPath(path, p)
        }
    }
}

/**
 * HUD layout editor: the real in-race controls on a preview backdrop. Drag any control group to
 * move it; size, opacity and side are adjusted below. Saved immediately.
 */
class HudLayoutScreen(host: GameHost) : Screen(host) {
    override val dim: Float = 0.2f

    override fun build(): View {
        val root = FrameLayout(ctx)
        val hud = HudView(ctx, host.gameWorld, InputState())
        host.applyHudLayout(hud)
        hud.touchSteering = save.controlMode != SaveManager.CONTROL_TILT
        hud.editMode = true
        hud.onGroupMoved = { g, x, y -> save.setHudOffset(g, x, y) }
        root.addView(hud, FrameLayout.LayoutParams(Ui.MATCH, Ui.MATCH))

        val title = Ui.text(ctx, t("دکمه‌ها را بکشید تا جابه‌جا شوند", "Drag the controls to move them"), 15f, Ui.TEXT, Ui.bold)
        title.gravity = Gravity.CENTER
        title.background = Ui.bg(0xCC070A14.toInt(), 0, 12f)
        title.setPadding(Ui.dp(14f), Ui.dp(8f), Ui.dp(14f), Ui.dp(8f))
        root.addView(title, FrameLayout.LayoutParams(Ui.WRAP, Ui.WRAP, Gravity.TOP or Gravity.CENTER_HORIZONTAL).apply { topMargin = Ui.dp(10f) })

        val bar = Ui.vbox(ctx)
        bar.background = Ui.bg(0xE6070A14.toInt(), Ui.withAlpha(Ui.CYAN, 0x55), 14f)
        bar.setPadding(Ui.dp(12f), Ui.dp(6f), Ui.dp(12f), Ui.dp(8f))
        fun seekRow(label: String, value: Float, onChange: (Float) -> Unit): View {
            val row = Ui.hbox(ctx)
            row.addView(Ui.text(ctx, label, 12f, Ui.TEXT), LinearLayout.LayoutParams(Ui.dp(70f), Ui.WRAP))
            val sb = SeekBar(ctx)
            sb.max = 100; sb.progress = (value * 100).toInt()
            sb.progressTintList = ColorStateList.valueOf(Ui.CYAN); sb.thumbTintList = ColorStateList.valueOf(Ui.CYAN)
            sb.setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
                override fun onProgressChanged(s: SeekBar?, p: Int, fromUser: Boolean) { if (fromUser) onChange(p / 100f) }
                override fun onStartTrackingTouch(s: SeekBar?) {}
                override fun onStopTrackingTouch(s: SeekBar?) {}
            })
            row.addView(sb, LinearLayout.LayoutParams(Ui.dp(150f), Ui.WRAP))
            return row
        }
        val sliders = Ui.hbox(ctx)
        sliders.addView(seekRow(t("اندازه", "Size"), save.hudScale) { save.hudScale = it; hud.hudScale = it })
        sliders.addView(seekRow(t("شفافیت", "Opacity"), save.hudAlpha) { save.hudAlpha = it; hud.hudAlpha = it; hud.invalidate() })
        bar.addView(sliders)
        val btns = Ui.hbox(ctx)
        btns.addView(Ui.button(ctx, t("⇄ جابه‌جایی طرفین", "⇄ Swap sides"), Ui.CYAN, false, 13f) {
            save.hudMirror = !save.hudMirror; hud.mirror = save.hudMirror; hud.invalidate()
        }, LinearLayout.LayoutParams(Ui.WRAP, Ui.WRAP).apply { marginEnd = Ui.dp(8f) })
        btns.addView(Ui.button(ctx, t("پیش‌فرض", "Default"), Ui.YELLOW, false, 13f) {
            save.resetHudLayout(); host.replaceTop(HudLayoutScreen(host))
        }, LinearLayout.LayoutParams(Ui.WRAP, Ui.WRAP).apply { marginEnd = Ui.dp(8f) })
        btns.addView(Ui.button(ctx, t("✓ تمام", "✓ Done"), Ui.GREEN, true, 14f) { host.applySettings(); host.back() })
        bar.addView(btns, LinearLayout.LayoutParams(Ui.WRAP, Ui.WRAP).apply { topMargin = Ui.dp(4f) })
        root.addView(bar, FrameLayout.LayoutParams(Ui.WRAP, Ui.WRAP, Gravity.CENTER).apply { bottomMargin = Ui.dp(20f) })
        return root
    }
}
