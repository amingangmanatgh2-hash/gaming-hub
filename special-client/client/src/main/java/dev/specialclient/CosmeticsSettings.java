package dev.specialclient;

import com.google.gson.*;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.client.MinecraftClient;
import java.nio.file.*;
import java.util.Set;

/** Tiny local preference file, polled once per 2 seconds; no public cosmetic backend. */
public final class CosmeticsSettings {
    public record Prefs(String cape, boolean wings) {}
    private static final Set<String> PALETTES=Set.of("legend","ember","frost","aurora","solar","rose","ocean","toxic","royal","crimson","pearl","copper");
    private static JsonObject data=new JsonObject();
    private static int ticks;
    public static void tick() {
        if(++ticks%40!=0)return;
        Path file=FabricLoader.getInstance().getGameDir().resolve("special/config/cosmetics.json");
        try {
            if(Files.size(file)>65536)return;
            data=JsonParser.parseString(Files.readString(file)).getAsJsonObject();
        } catch(Exception ignored) { data=new JsonObject(); }
    }
    public static Prefs forPlayer(java.util.UUID id) {
        MinecraftClient mc=MinecraftClient.getInstance();
        try {
            JsonObject pref;
            if(mc.player!=null && id.equals(mc.player.getUuid())) pref=data.getAsJsonObject("self");
            else pref=data.getAsJsonObject("peers").getAsJsonObject(id.toString());
            String cape=pref.has("cape")?pref.get("cape").getAsString():"";
            return new Prefs(PALETTES.contains(cape)?cape:"",pref.has("wings") && pref.get("wings").getAsBoolean());
        } catch(RuntimeException ignored) { return new Prefs("",false); }
    }
}
