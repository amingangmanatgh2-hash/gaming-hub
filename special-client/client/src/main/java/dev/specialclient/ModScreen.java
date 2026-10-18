package dev.specialclient;

import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.gui.screen.Screen;
import net.minecraft.client.gui.widget.*;
import net.minecraft.text.Text;
import java.util.Locale;
import java.util.function.BooleanSupplier;
import java.util.function.Consumer;

/** Uses vanilla widgets for keyboard navigation and game GUI scaling. */
public final class ModScreen extends Screen {
    private TextFieldWidget search;
    private String query = "", category = "All";
    private int row;
    private boolean dragging;
    public ModScreen() { super(Text.literal("SPECIAL CLIENT")); }
    @Override protected void init() {
        int x = width / 2 - 145;
        search = new TextFieldWidget(textRenderer, x, 35, 290, 20, Text.literal("Search modules"));
        search.setText(query); search.setPlaceholder(Text.literal("Search modules"));
        search.setChangedListener(s -> { query = s; rebuild(); });
        addDrawableChild(search);
        rebuild();
    }
    private void rebuild() {
        clearChildren(); addDrawableChild(search);
        int x = width / 2 - 145;
        String[] cats = {"All", "HUD", "Visuals", "Alerts"};
        for (int i = 0; i < cats.length; i++) {
            String cat = cats[i];
            addDrawableChild(ButtonWidget.builder(Text.literal(cat), b -> { category = cat; rebuild(); }).dimensions(x + i * 74, 60, 70, 20).build());
        }
        row = 85;
        ClientConfig c = SpecialClient.config;
        toggle("HUD", "Stats / CPS / Coordinates", () -> c.hud, v -> c.hud = v);
        toggle("HUD", "Keystrokes", () -> c.keystrokes, v -> c.keystrokes = v);
        toggle("HUD", "Armor and effects", () -> c.equipment, v -> c.equipment = v);
        toggle("Visuals", "Crosshair overlay", () -> c.crosshair, v -> c.crosshair = v);
        toggle("Visuals", "Projectile estimate", () -> c.projectile, v -> c.projectile = v);
        toggle("Alerts", "Overhead warning", () -> c.overhead, v -> c.overhead = v);
        toggle("Alerts", "Warning sound", () -> c.sound, v -> c.sound = v);
        if ((category.equals("All") || category.equals("Visuals")) && query.isEmpty()) {
            addDrawableChild(new SliderWidget(x, row, 290, 20, Text.empty(), c.crosshairLength / 30.0) {
                { updateMessage(); }
                protected void updateMessage() { setMessage(Text.literal("Crosshair length: " + Math.max(1, (int)(value * 30)))); }
                protected void applyValue() { c.crosshairLength = Math.max(1, (int)(value * 30)); }
            }); row += 23;
            addDrawableChild(ButtonWidget.builder(Text.literal("Color: cycle cyan / violet / gold / white"), b -> {
                int[] palette = {0x00e5ff, 0xa576ff, 0xffcc44, 0xffffff};
                int next = 0; for (int i = 0; i < palette.length; i++) if (c.color == palette[i]) next = (i + 1) % palette.length;
                c.color = palette[next];
            }).dimensions(x, row, 290, 20).build()); row += 23;
        }
        addDrawableChild(ButtonWidget.builder(Text.literal("Save and close"), b -> close()).dimensions(x, Math.max(row + 4, height - 35), 290, 20).build());
    }
    private void toggle(String cat, String name, BooleanSupplier get, Consumer<Boolean> set) {
        if (!category.equals("All") && !category.equals(cat)) return;
        if (!name.toLowerCase(Locale.ROOT).contains(query.toLowerCase(Locale.ROOT))) return;
        addDrawableChild(ButtonWidget.builder(Text.literal(name + ": " + (get.getAsBoolean() ? "ON" : "OFF")), b -> {
            set.accept(!get.getAsBoolean()); b.setMessage(Text.literal(name + ": " + (get.getAsBoolean() ? "ON" : "OFF")));
        }).dimensions(width / 2 - 145, row, 290, 20).build());
        row += 23;
    }
    @Override public void render(DrawContext ctx, int mx, int my, float delta) {
        renderBackground(ctx);
        super.render(ctx, mx, my, delta);
        ctx.drawCenteredTextWithShadow(textRenderer, "SPECIAL CLIENT | " + category, width / 2, 15, 0xff00e5ff);
        ctx.drawTextWithShadow(textRenderer, "Drag top-left HUD here. Module keys: Options > Controls.", 8, height - 12, 0xffdddddd);
    }
    @Override public boolean mouseClicked(double x, double y, int button) {
        ClientConfig c = SpecialClient.config;
        if (button == 0 && x >= c.hudX && x < c.hudX + 160 && y >= c.hudY && y < c.hudY + 20 && x < width / 2 - 150) {
            dragging = true; return true;
        }
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
