package dev.specialclient;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import net.fabricmc.loader.api.FabricLoader;
import org.slf4j.LoggerFactory;
import java.nio.file.*;
import java.io.IOException;

public final class ClientConfig {
    private static final Gson JSON = new GsonBuilder().setPrettyPrinting().create();
    private static final Path FILE = FabricLoader.getInstance().getConfigDir().resolve("specialclient.json");
    public boolean hud = true, keystrokes = true, equipment = true, crosshair = false;
    public boolean projectile = false, overhead = false, sound = false;
    public boolean clickBurst = false, bridgeCoach = false, collectorWool = false;
    public int leftMultiplier = 1, rightMultiplier = 1, lesson = 0, lessonStep = 0;
    public int color = 0x00e5ff, crosshairGap = 4, crosshairLength = 5, hudX = 8, hudY = 8;
    public double warningRadius = 12;

    public void validate() {
        leftMultiplier = ClickBurst.multiplier(leftMultiplier);
        rightMultiplier = ClickBurst.multiplier(rightMultiplier);
        lesson = BridgeLessons.lesson(lesson); lessonStep = BridgeLessons.step(lessonStep);
        color &= 0xffffff;
        crosshairGap = Math.max(0, Math.min(20, crosshairGap));
        crosshairLength = Math.max(1, Math.min(30, crosshairLength));
        hudX = Math.max(0, Math.min(10000, hudX)); hudY = Math.max(0, Math.min(10000, hudY));
        warningRadius = Double.isFinite(warningRadius) ? Math.max(3, Math.min(24, warningRadius)) : 12;
    }
    public static ClientConfig load() {
        try {
            if (Files.exists(FILE)) {
                ClientConfig value = JSON.fromJson(Files.readString(FILE), ClientConfig.class);
                if (value != null) { value.validate(); return value; }
            }
        } catch (IOException | RuntimeException e) { LoggerFactory.getLogger("specialclient").warn("Cannot read config; defaults used", e); }
        return new ClientConfig();
    }
    public void save() {
        validate();
        try {
            Files.createDirectories(FILE.getParent());
            Path tmp = FILE.resolveSibling(FILE.getFileName() + ".tmp");
            Files.writeString(tmp, JSON.toJson(this));
            try { Files.move(tmp, FILE, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE); }
            catch (AtomicMoveNotSupportedException e) { Files.move(tmp, FILE, StandardCopyOption.REPLACE_EXISTING); }
        } catch (IOException e) { LoggerFactory.getLogger("specialclient").warn("Cannot save config", e); }
    }
}
