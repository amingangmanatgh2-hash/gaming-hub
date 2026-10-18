package dev.specialclient;

import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.gui.screen.Screen;
import net.minecraft.client.gui.widget.*;
import net.minecraft.text.Text;
import net.minecraft.util.math.BlockPos;
import java.util.Locale;
import java.util.function.BooleanSupplier;
import java.util.function.Consumer;

/** Responsive sidebar + module cards, vanilla keyboard-accessible widgets. */
public final class ModScreen extends Screen {
    private TextFieldWidget search;
    private String query = "", category = "HUD", feedback = "";
    private int px, py, pw, ph, contentX, contentW, row;
    private boolean dragging;
    private final long opened = System.currentTimeMillis();
    public ModScreen() { super(Text.literal("SPECIAL CLIENT")); }
    @Override protected void init() {
        pw = Math.min(660, width - 16); ph = Math.min(420, height - 16);
        px = (width - pw) / 2; py = (height - ph) / 2;
        contentX = px + 112; contentW = pw - 126;
        search = new TextFieldWidget(textRenderer, contentX, py + 38, contentW, 18, Text.literal("Search modules"));
        search.setMaxLength(60); search.setText(query); search.setPlaceholder(Text.literal("Search modules..."));
        search.setChangedListener(s -> { boolean focused = search.isFocused(); query = s; rebuild(); if (focused) { setFocused(search); search.setFocused(true); } });
        rebuild();
    }
    private void button(String text, int x, int y, int w, Runnable action) {
        addDrawableChild(ButtonWidget.builder(Text.literal(text), b -> action.run()).dimensions(x, y, w, 18).build());
    }
    private void rebuild() {
        clearChildren(); addDrawableChild(search);
        String[] cats = {"HUD", "Visuals", "Alerts", "Input", "Practice"};
        for (int i = 0; i < cats.length; i++) {
            String cat = cats[i];
            button((category.equals(cat) ? "> " : "") + cat, px + 8, py + 66 + i * 24, 94,
                    () -> { category = cat; query = ""; search.setText(""); rebuild(); });
        }
        row = py + 64;
        ClientConfig c = SpecialClient.config;
        toggle("HUD", "Stats / CPS / Coordinates", () -> c.hud, v -> c.hud = v);
        toggle("HUD", "Keystrokes", () -> c.keystrokes, v -> c.keystrokes = v);
        toggle("HUD", "Armor and effects", () -> c.equipment, v -> c.equipment = v);
        toggle("Visuals", "Crosshair overlay", () -> c.crosshair, v -> c.crosshair = v);
        toggle("Visuals", "Projectile estimate", () -> c.projectile, v -> c.projectile = v);
        toggle("Alerts", "Overhead warning", () -> c.overhead, v -> c.overhead = v);
        toggle("Alerts", "Warning sound", () -> c.sound, v -> c.sound = v);
        toggle("Input", "Physical-click bursts", () -> c.clickBurst, v -> c.clickBurst = v);
        toggle("Practice", "Lesson coach overlay", () -> c.bridgeCoach, v -> c.bridgeCoach = v);
        if (category.equals("Visuals") && query.isEmpty()) {
            addDrawableChild(new SliderWidget(contentX, row, contentW, 18, Text.empty(), (c.crosshairLength - 1) / 29.0) {
                { updateMessage(); }
                protected void updateMessage() { setMessage(Text.literal("Crosshair length: " + (1 + (int)(value * 29)))); }
                protected void applyValue() { c.crosshairLength = 1 + (int)(value * 29); }
            }); row += 24;
            button("Accent: cyan / violet / gold / white", contentX, row, contentW, () -> {
                int[] palette = {0x00e5ff, 0xa576ff, 0xffcc44, 0xffffff};
                int next = 0; for (int i = 0; i < palette.length; i++) if (c.color == palette[i]) next = (i + 1) % palette.length;
                c.color = palette[next];
            });
        }
        if (category.equals("Input") && query.isEmpty()) {
            button("Left multiplier: x" + c.leftMultiplier, contentX, row, contentW, () -> { c.leftMultiplier = cycle(c.leftMultiplier); rebuild(); }); row += 24;
            button("Right multiplier: x" + c.rightMultiplier, contentX, row, contentW, () -> { c.rightMultiplier = cycle(c.rightMultiplier); rebuild(); });
        }
        if (category.equals("Practice") && query.isEmpty()) practice();
        button("Save + close", px + 8, py + ph - 26, 94, this::close);
        button("STOP [F8]", contentX, py + ph - 26, Math.min(100, contentW), () -> {
            SpecialClient.BRIDGE.stop(client, "Stopped from menu"); c.clickBurst = false; feedback = "Automation stopped"; rebuild();
        });
    }
    private int cycle(int value) { return value == 1 ? 2 : value == 2 ? 4 : value == 4 ? 8 : 1; }
    private void toggle(String cat, String name, BooleanSupplier get, Consumer<Boolean> set) {
        if (!category.equals(cat) || !name.toLowerCase(Locale.ROOT).contains(query.toLowerCase(Locale.ROOT))) return;
        button(name + ": " + (get.getAsBoolean() ? "ON" : "OFF"), contentX, row, contentW, () -> { set.accept(!get.getAsBoolean()); rebuild(); }); row += 24;
    }
    private void practice() {
        ClientConfig c = SpecialClient.config;
        int half = (contentW - 6) / 2;
        button("< Lesson", contentX, row, half, () -> { c.lesson = (c.lesson + 9) % 10; c.lessonStep = 0; rebuild(); });
        button("Lesson >", contentX + half + 6, row, half, () -> { c.lesson = (c.lesson + 1) % 10; c.lessonStep = 0; rebuild(); }); row += 23;
        button("< Step", contentX, row, half, () -> { c.lessonStep = (c.lessonStep + 4) % 5; rebuild(); });
        button("Step >", contentX + half + 6, row, half, () -> { c.lessonStep = (c.lessonStep + 1) % 5; rebuild(); }); row += 23;
        // Lesson text is rendered in the remaining card; controls stay compact at high GUI scales.
        if (ph >= 340) row += 78;
        int fieldW = (contentW - 12) / 3;
        BlockPos dest = SpecialClient.BRIDGE.destination();
        String[] defaults = dest == null ? new String[]{"X", "Y", "Z"} : new String[]{"" + dest.getX(), "" + dest.getY(), "" + dest.getZ()};
        TextFieldWidget[] xyz = new TextFieldWidget[3];
        for (int i = 0; i < 3; i++) {
            xyz[i] = new TextFieldWidget(textRenderer, contentX + i * (fieldW + 6), row, fieldW, 18, Text.literal("Destination " + "XYZ".charAt(i)));
            xyz[i].setMaxLength(10); xyz[i].setText(defaults[i]); addDrawableChild(xyz[i]);
        }
        row += 22;
        button("Set destination (support block XYZ)", contentX, row, contentW, () -> {
            try {
                int x = Integer.parseInt(xyz[0].getText().trim()), y = Integer.parseInt(xyz[1].getText().trim()), z = Integer.parseInt(xyz[2].getText().trim());
                if (Math.abs((long)x) > 29999984 || Math.abs((long)z) > 29999984 || y < -64 || y > 319) throw new NumberFormatException();
                SpecialClient.BRIDGE.setDestination(new BlockPos(x, y, z)); feedback = "Waypoint set; air is allowed, placement still needs support";
            } catch (NumberFormatException e) { feedback = "Enter whole XYZ numbers within 1.20.1 world bounds"; }
        }); row += 22;
        button("Start straight practice (singleplayer)", contentX, row, contentW, () -> { close(); SpecialClient.BRIDGE.start(client); });
    }
    @Override public void render(DrawContext ctx, int mx, int my, float delta) {
        renderBackground(ctx);
        int accent = 0xff000000 | SpecialClient.config.color;
        int fade = Math.min(232, (int)((System.currentTimeMillis() - opened) * .8));
        ctx.fill(px, py, px + pw, py + ph, fade << 24 | 0x0b101c);
        ctx.fill(px, py, px + 104, py + ph, 0xf0111929);
        ctx.fill(px, py, px + pw, py + 2, accent);
        ctx.fill(contentX - 4, py + 60, px + pw - 8, py + ph - 32, 0x80192235);
        ctx.drawTextWithShadow(textRenderer, "SPECIAL", px + 12, py + 15, accent);
        ctx.drawTextWithShadow(textRenderer, "CLIENT / 1.1", px + 12, py + 28, 0xff9ba9bd);
        ctx.drawTextWithShadow(textRenderer, category.toUpperCase(Locale.ROOT) + "  /  MODULE STUDIO", contentX, py + 16, 0xffedf4ff);
        super.render(ctx, mx, my, delta);
        if (category.equals("Practice") && query.isEmpty() && ph >= 340) {
            ClientConfig c = SpecialClient.config;
            BridgeLessons.Lesson lesson = BridgeLessons.ALL[c.lesson];
            int y = py + 137;
            ctx.drawTextWithShadow(textRenderer, (c.lesson + 1) + "/10 " + lesson.title() + " | " + (c.lessonStep + 1) + "/5", contentX + 4, y, accent);
            for (var line : textRenderer.wrapLines(Text.literal(lesson.steps()[c.lessonStep]), contentW - 8)) {
                y += 11; if (y > py + 208) break;
                ctx.drawTextWithShadow(textRenderer, line, contentX + 4, y, 0xffc2cddd);
            }
        }
        String hint = switch (category) {
            case "Input" -> "One physical press = one bounded burst. No idle clicks. Vanilla cooldowns apply.";
            case "Practice" -> "Private singleplayer. Flat straight route only. F8 / WASD stops. Lessons != automation modes.";
            default -> "Local HUD modules. Keybindings: Options > Controls. Save settings with Close.";
        };
        int hintY = Math.max(2, py - 22);
        for (var line : textRenderer.wrapLines(Text.literal(feedback.isEmpty() ? hint : feedback), pw)) {
            ctx.drawTextWithShadow(textRenderer, line, px, hintY, 0xffbac8dc); hintY += 10;
        }
        if (ph < 340 && category.equals("Practice"))
            ctx.drawTextWithShadow(textRenderer, "Use coach HUD for lesson steps at this GUI scale.", contentX, py + ph - 40, 0xffffcc44);
    }
    @Override public boolean mouseClicked(double x, double y, int button) {
        ClientConfig c = SpecialClient.config;
        if (button == 0 && x >= c.hudX && x < c.hudX + 160 && y >= c.hudY && y < c.hudY + 20 && x < px) { dragging = true; return true; }
        return super.mouseClicked(x, y, button);
    }
    @Override public boolean mouseDragged(double x, double y, int button, double dx, double dy) {
        if (dragging) { SpecialClient.config.hudX = Math.max(0, (int)x); SpecialClient.config.hudY = Math.max(0, (int)y); return true; }
        return super.mouseDragged(x, y, button, dx, dy);
    }
    @Override public boolean mouseReleased(double x, double y, int button) { dragging = false; return super.mouseReleased(x, y, button); }
    @Override public void close() { SpecialClient.config.save(); super.close(); }
    @Override public boolean shouldPause() { return false; }
}
