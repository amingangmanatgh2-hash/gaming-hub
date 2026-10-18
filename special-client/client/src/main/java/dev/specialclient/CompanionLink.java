package dev.specialclient;

import com.google.gson.*;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.client.MinecraftClient;
import java.nio.file.*;
import java.nio.charset.StandardCharsets;
import java.io.IOException;
import java.util.UUID;

/** Same-user local mailbox; no API keys, arbitrary code or remote listener in the game. */
public final class CompanionLink {
    private static final Gson JSON=new Gson();
    private static final Path ROOT=FabricLoader.getInstance().getGameDir().resolve("special/companion");
    private static String session=UUID.randomUUID().toString(), queued="";
    private static Object world;
    private static int ticks;
    private static double queuedAt;
    public static String status="Launcher chat connection pending";
    public static String session() { return session; }
    private static double now() { return System.currentTimeMillis()/1000.0; }
    private static JsonObject read(String name) {
        Path file=ROOT.resolve(name);
        try {
            if(Files.isSymbolicLink(file) || Files.size(file)>32768) return new JsonObject();
            return JsonParser.parseString(Files.readString(file)).getAsJsonObject();
        } catch(IOException | RuntimeException e) { return new JsonObject(); }
    }
    private static void write(String name,JsonObject data) {
        try {
            Files.createDirectories(ROOT); Path tmp=ROOT.resolve(name+".tmp"),file=ROOT.resolve(name);
            Files.writeString(tmp,JSON.toJson(data),StandardCharsets.UTF_8);
            try { Files.move(tmp,file,StandardCopyOption.REPLACE_EXISTING,StandardCopyOption.ATOMIC_MOVE); }
            catch(AtomicMoveNotSupportedException e) { Files.move(tmp,file,StandardCopyOption.REPLACE_EXISTING); }
        } catch(IOException ignored) { status="Local companion mailbox is not writable"; }
    }
    public static void queue(String action) { queued=action; queuedAt=now(); status="Queued; focus game within 10 seconds"; }
    public static void stop(MinecraftClient mc) {
        try { Files.deleteIfExists(ROOT.resolve("command.json")); } catch(IOException ignored) {}
        queued=""; SpecialClient.COLLECTOR.stop(mc,"Stopped by user"); SpecialClient.BRIDGE.stop(mc,"Stopped by user");
        status="Stopped";
    }
    public static void tick(MinecraftClient mc) {
        if(world!=mc.world) { world=mc.world; session=UUID.randomUUID().toString(); stop(mc); }
        if(++ticks%5==0) {
            JsonObject cmd=read("command.json");
            if(cmd.has("id")) {
                try {
                    Files.deleteIfExists(ROOT.resolve("command.json"));
                    UUID.fromString(cmd.get("id").getAsString());
                    double age=now()-cmd.get("created").getAsDouble();
                    if(cmd.get("session").getAsString().equals(session) && age>=0 && age<=10) {
                        String action=cmd.get("action").getAsString();
                        if(action.equals("stop")) stop(mc);
                        else if(action.equals("collect_emerald") || action.equals("collect_diamond")) queue(action);
                    }
                } catch(IOException | RuntimeException ignored) { status="Rejected invalid/stale command"; }
            }
        }
        if(!queued.isEmpty()) {
            if(now()-queuedAt>10) { queued=""; status="Task expired; no automatic restart"; }
            else if(mc.player!=null && mc.isWindowFocused() && mc.currentScreen==null && !mc.isPaused()) {
                String action=queued; queued="";
                SpecialClient.COLLECTOR.start(mc,action.equals("collect_emerald")?"emerald":"diamond");
                status=SpecialClient.COLLECTOR.status();
            }
        }
        if(ticks%20==0) {
            JsonObject state=new JsonObject();
            state.addProperty("session",session); state.addProperty("updated",now());
            state.addProperty("private_world",ResourceCollector.privateWorld(mc) && mc.player!=null);
            state.addProperty("task",SpecialClient.COLLECTOR.active()?SpecialClient.COLLECTOR.status():status+" | "+SpecialClient.COLLECTOR.status());
            write("state.json",state);
        }
    }
    public static String ask(String text) {
        JsonObject request=new JsonObject(); String id=UUID.randomUUID().toString();
        request.addProperty("id",id); request.addProperty("session",session); request.addProperty("created",now());
        request.addProperty("text",text.substring(0,Math.min(4000,text.length()))); write("chat-request.json",request);
        return id;
    }
    public static String response(String id) {
        JsonObject value=read("chat-response.json");
        try {
            if(value.get("id").getAsString().equals(id) && value.get("session").getAsString().equals(session))
                return value.get("text").getAsString();
        } catch(RuntimeException ignored) {}
        return "";
    }
}
