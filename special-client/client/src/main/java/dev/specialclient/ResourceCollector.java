package dev.specialclient;

import net.minecraft.client.MinecraftClient;
import net.minecraft.entity.ItemEntity;
import net.minecraft.item.*;
import net.minecraft.block.Blocks;
import net.minecraft.registry.tag.BlockTags;
import net.minecraft.util.math.*;
import org.lwjgl.glfw.GLFW;
import java.util.*;

/** Experimental flat-grid pickup/return task, private worlds only; not a universal Bedwars bot. */
public final class ResourceCollector {
    private boolean active, returning, bridging;
    private Object world, player;
    private BlockPos home;
    private Item item;
    private List<GridPlanner.Point> route = List.of();
    private int index, age, wait, stalled, initialCount, oldSlot, targets;
    private double lastDistance = Double.MAX_VALUE;
    private float health;
    private final Set<UUID> attempted = new HashSet<>();
    private String status = "Idle";
    public boolean active() { return active; }
    public String status() { return status; }
    private BlockPos floor(MinecraftClient mc) { return BlockPos.ofFloored(mc.player.getPos().add(0, -.05, 0)); }
    public static boolean privateWorld(MinecraftClient mc) {
        return mc.isInSingleplayer() && mc.getServer() != null && !mc.getServer().isRemote();
    }
    public void start(MinecraftClient mc, String resource) {
        stop(mc, "Previous task stopped");
        if (!privateWorld(mc) || mc.player == null || mc.world == null || !mc.isWindowFocused() || mc.currentScreen != null
                || !mc.player.isOnGround() || mc.player.getAbilities().flying) { status = "Need focused private singleplayer, on ground, no menu/flight"; return; }
        SpecialClient.BRIDGE.stop(mc, "Collector owns movement");
        home = floor(mc); world = mc.world; player = mc.player;
        item = resource.equals("emerald") ? Items.EMERALD : Items.DIAMOND;
        oldSlot = mc.player.getInventory().selectedSlot;
        initialCount = count(mc); health = mc.player.getHealth(); age = wait = stalled = targets = 0;
        attempted.clear(); returning = bridging = false; active = true;
        status = "Scanning loaded dropped " + resource + " items";
        findTarget(mc);
    }
    public void stop(MinecraftClient mc, String reason) {
        if (active) {
            release(mc); SpecialClient.BRIDGE.stop(mc, "Collector stopped");
            if (mc.player == player) mc.player.getInventory().selectedSlot = oldSlot;
        }
        active = false; bridging = false; route = List.of(); status = reason;
    }
    private void release(MinecraftClient mc) {
        mc.options.forwardKey.setPressed(false); mc.options.sneakKey.setPressed(false);
    }
    private int count(MinecraftClient mc) {
        int total = 0;
        for (int i=0;i<36;i++) { ItemStack s=mc.player.getInventory().getStack(i); if(s.isOf(item)) total+=s.getCount(); }
        return total;
    }
    private int woolSlot(MinecraftClient mc) {
        for (int i=0;i<9;i++) {
            ItemStack s=mc.player.getInventory().getStack(i);
            if(s.getItem() instanceof BlockItem b && b.getBlock().getDefaultState().isIn(BlockTags.WOOL)) return i;
        }
        return -1;
    }
    private GridPlanner.Cell cell(MinecraftClient mc, GridPlanner.Point p) {
        BlockPos at=new BlockPos(p.x(), home.getY(), p.z());
        if(Math.abs((long)p.x()-home.getX())>32 || Math.abs((long)p.z()-home.getZ())>32
                || !mc.world.isChunkLoaded(at) || !mc.world.getWorldBorder().contains(at)) return GridPlanner.Cell.BLOCKED;
        for(int y=1;y<=2;y++) if(!mc.world.getBlockState(at.up(y)).isAir()) return GridPlanner.Cell.BLOCKED;
        var block=mc.world.getBlockState(at);
        if(block.isAir()) return GridPlanner.Cell.GAP;
        if(block.isOf(Blocks.MAGMA_BLOCK) || block.isOf(Blocks.TNT) || block.isOf(Blocks.ICE)
                || block.isOf(Blocks.PACKED_ICE) || block.isOf(Blocks.BLUE_ICE) || block.isOf(Blocks.SLIME_BLOCK)) return GridPlanner.Cell.BLOCKED;
        return block.isFullCube(mc.world,at) ? GridPlanner.Cell.FLOOR : GridPlanner.Cell.BLOCKED;
    }
    private boolean plan(MinecraftClient mc, BlockPos target) {
        BlockPos start=floor(mc);
        if(target.getY()!=home.getY() || start.getY()!=home.getY()) return false;
        GridPlanner.Point from=new GridPlanner.Point(start.getX(),start.getZ()), to=new GridPlanner.Point(target.getX(),target.getZ());
        if(from.equals(to)) { route=List.of(); index=0; return true; }
        int slot=woolSlot(mc), wool=slot<0?0:mc.player.getInventory().getStack(slot).getCount();
        route=GridPlanner.plan(from,to,p->cell(mc,p),SpecialClient.config.collectorWool,wool);
        index=0; stalled=0; lastDistance=Double.MAX_VALUE;
        return !route.isEmpty();
    }
    private void findTarget(MinecraftClient mc) {
        if(targets>=8 || age>2400) { goHome(mc); return; }
        List<ItemEntity> items=mc.world.getEntitiesByClass(ItemEntity.class,mc.player.getBoundingBox().expand(32),
                e->e.isAlive() && e.getStack().isOf(item) && !attempted.contains(e.getUuid())
                        && Math.abs(e.getY()-(home.getY()+1))<.6 && mc.player.canSee(e));
        items.sort(Comparator.comparingDouble(e->e.squaredDistanceTo(mc.player)));
        for(ItemEntity e:items) {
            attempted.add(e.getUuid());
            if(plan(mc,new BlockPos(e.getBlockX(),home.getY(),e.getBlockZ()))) {
                targets++; wait=0; status="Going to visible dropped resource ("+targets+"/8)"; return;
            }
        }
        goHome(mc);
    }
    private void goHome(MinecraftClient mc) {
        returning=true; wait=0;
        if(!plan(mc,home)) { stop(mc,"No verified return route; stopped in place"); return; }
        status="Returning to starting block";
    }
    public void tick(MinecraftClient mc) {
        if(!active) return;
        if(!privateWorld(mc) || mc.world!=world || mc.player!=player || mc.player==null || mc.currentScreen!=null
                || !mc.isWindowFocused() || mc.isPaused()) { stop(mc,"Context/focus changed; stopped"); return; }
        long handle=mc.getWindow().getHandle();
        for(int key:new int[]{GLFW.GLFW_KEY_W,GLFW.GLFW_KEY_A,GLFW.GLFW_KEY_S,GLFW.GLFW_KEY_D,GLFW.GLFW_KEY_SPACE})
            if(GLFW.glfwGetKey(handle,key)==GLFW.GLFW_PRESS) { stop(mc,"Manual movement; stopped"); return; }
        if(++age>3600 || mc.player.getHealth()<health || !mc.player.isOnGround() || mc.player.getAbilities().flying
                || mc.player.isTouchingWater() || mc.player.hasVehicle() || floor(mc).getY()!=home.getY()) {
            stop(mc,"Safety stop: damage, terrain, movement or timeout"); return;
        }
        if(SpecialClient.BRIDGE.active()) return;
        if(bridging) {
            bridging=false;
            if(cell(mc,route.get(index))!=GridPlanner.Cell.FLOOR) { stop(mc,"Wool bridge failed; stopped"); return; }
        }
        release(mc);
        if(index>=route.size()) {
            if(returning) { stop(mc,"Returned; inventory delta +"+Math.max(0,count(mc)-initialCount)); return; }
            if(++wait<30) return; // Allow normal item pickup, never remove/spawn entities.
            findTarget(mc); return;
        }
        GridPlanner.Point next=route.get(index);
        GridPlanner.Cell cell=cell(mc,next);
        if(cell==GridPlanner.Cell.BLOCKED) { stop(mc,"Route obstructed; stopped"); return; }
        if(cell==GridPlanner.Cell.GAP) {
            int slot=woolSlot(mc);
            if(!SpecialClient.config.collectorWool || slot<0) { stop(mc,"Gap needs opt-in hotbar wool; stopped"); return; }
            // Center on the supported cell before handing movement to the existing bridge trainer.
            BlockPos at=floor(mc);
            if(!walk(mc,at.getX()+.5,at.getZ()+.5)) return;
            mc.player.getInventory().selectedSlot=slot;
            SpecialClient.BRIDGE.setDestination(new BlockPos(next.x(),home.getY(),next.z()));
            SpecialClient.BRIDGE.start(mc);
            if(!SpecialClient.BRIDGE.active()) { stop(mc,"Could not start safe wool bridge"); return; }
            bridging=true; return;
        }
        if(walk(mc,next.x()+.5,next.z()+.5)) { index++; stalled=0; lastDistance=Double.MAX_VALUE; }
    }
    private boolean walk(MinecraftClient mc,double x,double z) {
        double dx=x-mc.player.getX(),dz=z-mc.player.getZ(),distance=Math.hypot(dx,dz);
        if(distance<.075) { release(mc); return true; }
        if(distance>1.55 || distance>=lastDistance-.001 && ++stalled>100) { stop(mc,"Movement stalled or displaced"); return false; }
        if(distance<lastDistance-.001) stalled=0;
        lastDistance=distance;
        mc.player.setYaw((float)Math.toDegrees(Math.atan2(-dx,dz))); mc.player.setPitch(15);
        mc.options.sneakKey.setPressed(true); mc.options.forwardKey.setPressed(true);
        return false;
    }
}
