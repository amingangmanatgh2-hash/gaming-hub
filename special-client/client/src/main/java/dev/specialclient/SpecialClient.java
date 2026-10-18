package dev.specialclient;

import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.rendering.v1.HudRenderCallback;
import net.fabricmc.fabric.api.client.keybinding.v1.KeyBindingHelper;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.option.KeyBinding;
import net.minecraft.client.util.InputUtil;
import net.minecraft.entity.Entity;
import net.minecraft.entity.player.PlayerEntity;
import net.minecraft.entity.projectile.ProjectileEntity;
import net.minecraft.item.*;
import net.minecraft.sound.SoundEvents;
import net.minecraft.util.hit.*;
import net.minecraft.util.math.*;
import net.minecraft.world.RaycastContext;
import org.lwjgl.glfw.GLFW;
import java.nio.file.*;
import java.util.ArrayDeque;
import java.util.Locale;

public final class SpecialClient implements ClientModInitializer {
    public static ClientConfig config;
    public static final BridgePractice BRIDGE = new BridgePractice();
    private static final ClickBurst BURST = new ClickBurst();
    private KeyBinding menu, prediction, warning, emergency, bridge, destination;
    private final ArrayDeque<Long> left = new ArrayDeque<>(), right = new ArrayDeque<>();
    private boolean leftDown, rightDown, threat;
    private int ticks, soundCooldown;
    private Vec3d landing;
    private String projectileLabel = "";
    private long lastFrame;
    private double frameSum, frameWorst;
    private int frameCount;

    @Override public void onInitializeClient() {
        config = ClientConfig.load();
        menu = key("menu", GLFW.GLFW_KEY_RIGHT_SHIFT);
        prediction = key("prediction", GLFW.GLFW_KEY_UNKNOWN);
        warning = key("warning", GLFW.GLFW_KEY_UNKNOWN);
        emergency = key("emergency", GLFW.GLFW_KEY_F8);
        bridge = key("bridge", GLFW.GLFW_KEY_UNKNOWN);
        destination = key("destination", GLFW.GLFW_KEY_UNKNOWN);
        ClientTickEvents.START_CLIENT_TICK.register(this::inputTick);
        ClientTickEvents.END_CLIENT_TICK.register(this::tick);
        HudRenderCallback.EVENT.register(this::render);
    }
    private KeyBinding key(String name, int code) {
        return KeyBindingHelper.registerKeyBinding(new KeyBinding("key.specialclient." + name, InputUtil.Type.KEYSYM, code, "SPECIAL CLIENT"));
    }
    /** Called ONLY from a physical GLFW mouse-button callback, never from the burst queue. */
    public static void physicalMouse(long window, int button, int action) {
        MinecraftClient mc = MinecraftClient.getInstance();
        if (config == null || !config.clickBurst || BRIDGE.active() || mc.player == null || mc.world == null
                || mc.currentScreen != null || !mc.isWindowFocused() || mc.isPaused()
                || window != mc.getWindow().getHandle() || action != GLFW.GLFW_PRESS) return;
        if (button == 0 && mc.options.attackKey.matchesMouse(0)) BURST.press(0, config.leftMultiplier);
        if (button == 1 && mc.options.useKey.matchesMouse(1)) BURST.press(1, config.rightMultiplier);
    }
    private void inputTick(MinecraftClient mc) {
        while (emergency.wasPressed()) {
            BRIDGE.stop(mc, "Emergency stop (F8)"); BURST.clear();
            config.clickBurst = false; config.save();
        }
        while (destination.wasPressed()) BRIDGE.pickDestination(mc);
        while (bridge.wasPressed()) BRIDGE.start(mc);
        BRIDGE.tick(mc);
        if (!config.clickBurst || BRIDGE.active() || mc.player == null || mc.world == null
                || mc.currentScreen != null || !mc.isWindowFocused() || mc.isPaused() || mc.player.isDead()) {
            BURST.clear(); return;
        }
        if (BURST.tick(0) && mc.options.attackKey.matchesMouse(0)) KeyBinding.onKeyPressed(InputUtil.Type.MOUSE.createFromCode(0));
        if (BURST.tick(1) && mc.options.useKey.matchesMouse(1)) KeyBinding.onKeyPressed(InputUtil.Type.MOUSE.createFromCode(1));
    }
    private void tick(MinecraftClient mc) {
        while (menu.wasPressed()) if (mc.currentScreen == null) mc.setScreen(new ModScreen());
        while (prediction.wasPressed()) { config.projectile = !config.projectile; config.save(); }
        while (warning.wasPressed()) { config.overhead = !config.overhead; config.save(); }
        if (mc.player == null || mc.world == null) { landing = null; threat = false; return; }
        landing = config.projectile ? predict(mc) : null;
        boolean nextThreat = false;
        if (config.overhead) {
            for (Entity e : mc.world.getOtherEntities(mc.player, mc.player.getBoundingBox().expand(config.warningRadius))) {
                Vec3d d = e.getPos().subtract(mc.player.getPos());
                if (!Ballistics.overhead(d.x, d.y, d.z, config.warningRadius)) continue;
                if (e instanceof PlayerEntity p && (dangerous(p.getMainHandStack()) || dangerous(p.getOffHandStack()))) nextThreat = true;
                if (e instanceof ProjectileEntity) nextThreat = true;
            }
        }
        if (soundCooldown > 0) soundCooldown--;
        if (nextThreat && !threat && config.sound && soundCooldown == 0) {
            mc.player.playSound(SoundEvents.BLOCK_NOTE_BLOCK_PLING.value(), .5f, 1.4f);
            soundCooldown = 40;
        }
        threat = nextThreat;
        if (++ticks % 20 == 0) writeStats(mc);
    }
    private boolean dangerous(ItemStack s) {
        return s.isOf(Items.TRIDENT) || s.isOf(Items.CROSSBOW) || s.isOf(Items.ENDER_PEARL);
    }
    private Vec3d predict(MinecraftClient mc) {
        ItemStack stack = mc.player.getMainHandStack();
        double speed, gravity;
        if (stack.isOf(Items.BOW)) {
            if (!mc.player.isUsingItem()) return null;
            double f = mc.player.getItemUseTime() / 20.0;
            speed = Math.min(1, (f * f + 2 * f) / 3) * 3;
            if (speed < .1) return null;
            gravity = .05; projectileLabel = "Bow (estimate)";
        } else if (stack.isOf(Items.ENDER_PEARL) || stack.isOf(Items.SNOWBALL) || stack.isOf(Items.EGG)) {
            speed = 1.5; gravity = .03; projectileLabel = "Throw (estimate)";
        } else if (stack.isOf(Items.TRIDENT)) {
            if (!mc.player.isUsingItem() || mc.player.getItemUseTime() < 10) return null;
            speed = 2.5; gravity = .05; projectileLabel = "Trident (no Riptide)";
        } else return null;
        Vec3d pos = mc.player.getEyePos().add(0, -.1, 0);
        Vec3d motion = mc.player.getRotationVec(1).multiply(speed).add(mc.player.getVelocity().x,
                mc.player.isOnGround() ? 0 : mc.player.getVelocity().y, mc.player.getVelocity().z);
        for (int i = 0; i < 160; i++) {
            double[] s = Ballistics.step(pos.x, pos.y, pos.z, motion.x, motion.y, motion.z, gravity);
            Vec3d end = new Vec3d(s[0], s[1], s[2]);
            if (!mc.world.isChunkLoaded(BlockPos.ofFloored(end))) return null;
            BlockHitResult hit = mc.world.raycast(new RaycastContext(pos, end, RaycastContext.ShapeType.COLLIDER, RaycastContext.FluidHandling.NONE, mc.player));
            if (hit.getType() != HitResult.Type.MISS) return hit.getPos();
            pos = end; motion = new Vec3d(s[3], s[4], s[5]);
            if (pos.y < mc.world.getBottomY()) return null;
        }
        return null;
    }
    private void render(DrawContext ctx, float delta) {
        MinecraftClient mc = MinecraftClient.getInstance();
        long now = System.nanoTime();
        if (lastFrame != 0) { double ms = (now - lastFrame) / 1e6; frameSum += ms; frameWorst = Math.max(frameWorst, ms); frameCount++; }
        lastFrame = now;
        if (mc.player == null || mc.options.hudHidden) return;
        sampleClicks(mc);
        int color = 0xff000000 | config.color;
        int x = Math.min(config.hudX, Math.max(0, ctx.getScaledWindowWidth() - 180));
        int y = Math.min(config.hudY, Math.max(0, ctx.getScaledWindowHeight() - 140));
        if (config.hud) {
            line(ctx, mc, "SPECIAL | " + mc.getCurrentFps() + " FPS | " + ping(mc) + " ms", x, y, color); y += 12;
            line(ctx, mc, String.format(Locale.ROOT, "XYZ %.1f %.1f %.1f | %s", mc.player.getX(), mc.player.getY(), mc.player.getZ(), mc.player.getHorizontalFacing().asString()), x, y, color); y += 12;
            line(ctx, mc, "CPS L/R " + left.size() + "/" + right.size() + " (1s)", x, y, color); y += 12;
            // Observation only; interactionManager reports vanilla range, never modified.
            line(ctx, mc, String.format(Locale.ROOT, "Vanilla range %.1f", mc.interactionManager == null ? 0f : mc.interactionManager.getReachDistance()), x, y, color); y += 12;
        }
        if (config.keystrokes) {
            line(ctx, mc, pressed(mc.options.forwardKey, "W") + pressed(mc.options.leftKey, "A") + pressed(mc.options.backKey, "S") + pressed(mc.options.rightKey, "D") + pressed(mc.options.jumpKey, "Space") + pressed(mc.options.sneakKey, "Shift"), x, y, color); y += 12;
        }
        if (config.equipment) {
            for (ItemStack item : mc.player.getArmorItems()) {
                if (item.isEmpty()) continue;
                ctx.drawItem(item, x, y);
                line(ctx, mc, (item.getMaxDamage() - item.getDamage()) + "/" + item.getMaxDamage(), x + 20, y + 4, color); y += 19;
            }
            for (var effect : mc.player.getStatusEffects()) {
                line(ctx, mc, effect.getEffectType().getName().getString() + " " + (effect.getAmplifier() + 1) + " | " + effect.getDuration() / 20 + "s", x, y, color); y += 12;
            }
        }
        int cx = ctx.getScaledWindowWidth() / 2, cy = ctx.getScaledWindowHeight() / 2;
        if (config.crosshair) {
            int g = config.crosshairGap, l = config.crosshairLength;
            ctx.fill(cx-g-l, cy, cx-g, cy+1, color); ctx.fill(cx+g+1, cy, cx+g+l+1, cy+1, color);
            ctx.fill(cx, cy-g-l, cx+1, cy-g, color); ctx.fill(cx, cy+g+1, cx+1, cy+g+l+1, color);
        }
        if (config.clickBurst) ctx.drawCenteredTextWithShadow(mc.textRenderer,
                "PHYSICAL BURST L x" + config.leftMultiplier + " / R x" + config.rightMultiplier + " | F8 disables", cx, 42, color);
        if (BRIDGE.active()) ctx.drawCenteredTextWithShadow(mc.textRenderer, "PRACTICE | " + BRIDGE.status(), cx, 56, 0xffffcc44);
        if (config.bridgeCoach) {
            BridgeLessons.Lesson lesson = BridgeLessons.ALL[config.lesson];
            ctx.drawCenteredTextWithShadow(mc.textRenderer, lesson.title() + " | Step " + (config.lessonStep + 1) + "/5", cx, 72, color);
            int coachY = 85;
            for (var text : mc.textRenderer.wrapLines(net.minecraft.text.Text.literal(lesson.steps()[config.lessonStep]), Math.max(100, ctx.getScaledWindowWidth() - 32))) {
                ctx.drawCenteredTextWithShadow(mc.textRenderer, text, cx, coachY, 0xffdddddd); coachY += 10;
            }
        }
        if (threat) ctx.drawCenteredTextWithShadow(mc.textRenderer, "OVERHEAD: armed player / projectile (not intent)", cx, 28, 0xffff7755);
        if (landing != null) {
            // Bearing indicator is local HUD only. It does not rotate the camera or aim.
            Vec3d d = landing.subtract(mc.player.getEyePos());
            double yaw = Math.toDegrees(Math.atan2(-d.x, d.z));
            double bearing = MathHelper.wrapDegrees(yaw - mc.player.getYaw());
            String mark = String.format(Locale.ROOT, "%s | block %.0f %.0f %.0f | %.0fm | bearing %+.0f°", projectileLabel, landing.x, landing.y, landing.z, d.length(), bearing);
            ctx.drawCenteredTextWithShadow(mc.textRenderer, mark, cx, ctx.getScaledWindowHeight() - 52, color);
            int bx = cx + (int)(MathHelper.clamp(bearing, -90, 90) / 90 * (cx - 12));
            ctx.fill(bx - 3, cy - 3, bx + 4, cy + 4, color);
        }
    }
    private String pressed(KeyBinding key, String label) { return key.isPressed() ? "[" + label + "] " : label + " "; }
    private void line(DrawContext ctx, MinecraftClient mc, String text, int x, int y, int color) { ctx.drawTextWithShadow(mc.textRenderer, text, x, y, color); }
    private void sampleClicks(MinecraftClient mc) {
        long handle = mc.getWindow().getHandle(), now = System.currentTimeMillis();
        boolean l = mc.currentScreen == null && GLFW.glfwGetMouseButton(handle, GLFW.GLFW_MOUSE_BUTTON_LEFT) == GLFW.GLFW_PRESS;
        boolean r = mc.currentScreen == null && GLFW.glfwGetMouseButton(handle, GLFW.GLFW_MOUSE_BUTTON_RIGHT) == GLFW.GLFW_PRESS;
        if (l && !leftDown) left.add(now); if (r && !rightDown) right.add(now);
        leftDown = l; rightDown = r;
        while (!left.isEmpty() && left.peek() < now - 1000) left.remove();
        while (!right.isEmpty() && right.peek() < now - 1000) right.remove();
    }
    private int ping(MinecraftClient mc) {
        var handler = mc.getNetworkHandler();
        var entry = handler == null ? null : handler.getPlayerListEntry(mc.player.getUuid());
        return entry == null ? -1 : entry.getLatency();
    }
    private void writeStats(MinecraftClient mc) {
        try {
            Path file = FabricLoader.getInstance().getGameDir().resolve("special/config/game-stats.json");
            Files.createDirectories(file.getParent());
            String json = String.format(Locale.ROOT, "{\"version\":1,\"fps\":%d,\"ping_ms\":%d,\"frame_ms_avg\":%.3f,\"frame_ms_worst\":%.3f,\"updated\":%d}", mc.getCurrentFps(), ping(mc), frameCount == 0 ? 0 : frameSum / frameCount, frameWorst, System.currentTimeMillis() / 1000);
            Path tmp = file.resolveSibling("game-stats.json.tmp"); Files.writeString(tmp, json);
            Files.move(tmp, file, StandardCopyOption.REPLACE_EXISTING);
        } catch (java.io.IOException e) { /* Optional telemetry must never interrupt gameplay. */ }
        frameCount = 0; frameSum = frameWorst = 0;
    }
}
