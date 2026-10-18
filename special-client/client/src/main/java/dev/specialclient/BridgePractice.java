package dev.specialclient;

import net.minecraft.client.MinecraftClient;
import net.minecraft.block.Blocks;
import net.minecraft.block.FallingBlock;
import net.minecraft.item.BlockItem;
import net.minecraft.text.Text;
import net.minecraft.util.Hand;
import net.minecraft.util.hit.*;
import net.minecraft.util.math.*;
import net.minecraft.world.RaycastContext;
import org.lwjgl.glfw.GLFW;

/** Deliberately limited flat, straight sneak-bridge trainer for private integrated worlds. */
public final class BridgePractice {
    private boolean active;
    private BlockPos support, destination, waiting;
    private Direction direction;
    private int age, waitTicks, placed;
    private String status = "Idle";
    public boolean active() { return active; }
    public String status() { return status; }
    public BlockPos destination() { return destination; }

    public void setDestination(BlockPos pos) {
        if (active) stop(MinecraftClient.getInstance(), "Destination changed");
        destination = pos.toImmutable();
        status = "Destination " + pos.toShortString();
    }
    public void pickDestination(MinecraftClient mc) {
        if (mc.player == null || mc.world == null) return;
        // Vanilla reach only; use XYZ fields in the menu for a waypoint in air.
        if (mc.crosshairTarget instanceof BlockHitResult hit && hit.getType() == HitResult.Type.BLOCK)
            setDestination(hit.getBlockPos());
        else message(mc, "Look at a block or enter destination XYZ in Practice.");
    }
    private boolean permitted(MinecraftClient mc) {
        return PracticeRules.permitted(mc.isInSingleplayer(), mc.getServer() == null || mc.getServer().isRemote(),
                mc.isWindowFocused(), mc.currentScreen != null, mc.isPaused());
    }
    public void start(MinecraftClient mc) {
        if (active) { stop(mc, "Stopped by user"); return; }
        if (!permitted(mc) || mc.player == null || mc.world == null || mc.interactionManager == null) {
            message(mc, "Bridge practice: private singleplayer only; close menus and focus the game."); return;
        }
        if (!mc.player.isOnGround() || mc.player.getAbilities().flying || mc.player.isTouchingWater() || mc.player.hasVehicle()) {
            message(mc, "Stand on a full block; disable flight and leave water/vehicles."); return;
        }
        support = BlockPos.ofFloored(mc.player.getPos().add(0, -.05, 0));
        if (!solid(mc, support) || !safeHeldBlock(mc)) { message(mc, "Stand on a full cube and hold safe full-cube blocks."); return; }
        if (destination == null) {
            // Backward relative to the current view, snapped to a cardinal axis.
            direction = mc.player.getHorizontalFacing().getOpposite();
            destination = support.offset(direction, 8);
        }
        int dx = destination.getX() - support.getX(), dy = destination.getY() - support.getY(), dz = destination.getZ() - support.getZ();
        if (!PracticeRules.validRoute(dx, dy, dz)) {
            message(mc, "Destination must be level, on one X/Z axis, 1-32 blocks away (support-block Y)."); return;
        }
        direction = dx != 0 ? (dx > 0 ? Direction.EAST : Direction.WEST) : (dz > 0 ? Direction.SOUTH : Direction.NORTH);
        // Side-to-side drift could make a single-width route unsafe.
        double lateral = direction.getAxis() == Direction.Axis.X ? mc.player.getZ() - (support.getZ() + .5) : mc.player.getX() - (support.getX() + .5);
        if (Math.abs(lateral) > .12) { message(mc, "Center yourself on the starting block before starting."); return; }
        active = true; age = waitTicks = placed = 0; waiting = null; status = "Approaching edge (F8 stop)";
    }
    public void stop(MinecraftClient mc, String reason) {
        if (active) {
            mc.options.backKey.setPressed(false);
            mc.options.sneakKey.setPressed(false);
        }
        active = false; waiting = null; status = reason;
    }
    public void tick(MinecraftClient mc) {
        if (!active) return;
        if (!permitted(mc) || mc.player == null || mc.world == null || mc.interactionManager == null) { stop(mc, "Context changed; stopped"); return; }
        long window = mc.getWindow().getHandle();
        for (int key : new int[]{GLFW.GLFW_KEY_W, GLFW.GLFW_KEY_A, GLFW.GLFW_KEY_S, GLFW.GLFW_KEY_D, GLFW.GLFW_KEY_SPACE})
            if (GLFW.glfwGetKey(window, key) == GLFW.GLFW_PRESS) { stop(mc, "Manual movement; stopped"); return; }
        if (++age > 2400 || mc.player.getHealth() <= 0 || mc.player.getAbilities().flying || mc.player.isTouchingWater()
                || mc.player.hasVehicle() || !mc.player.isOnGround() || !safeHeldBlock(mc)) {
            stop(mc, "Safety stop: ground, blocks, timeout or player state"); return;
        }
        if (!mc.world.isChunkLoaded(support) || !solid(mc, support)) { stop(mc, "Support missing; stopped"); return; }
        if (Math.abs(mc.player.getY() - (support.getY() + 1)) > .15) { stop(mc, "Height changed; stopped"); return; }
        double lateral = direction.getAxis() == Direction.Axis.X ? mc.player.getZ() - (support.getZ() + .5) : mc.player.getX() - (support.getX() + .5);
        if (Math.abs(lateral) > .2) { stop(mc, "Lateral drift; stopped"); return; }
        mc.options.sneakKey.setPressed(true);
        mc.options.backKey.setPressed(false);
        if (waiting != null) {
            if (solid(mc, waiting)) {
                support = waiting; waiting = null; placed++;
                if (support.equals(destination)) { stop(mc, "Finished: " + placed + " bridge blocks"); return; }
            } else {
                if (++waitTicks > 20) stop(mc, "Placement not confirmed; stopped");
                return;
            }
        }
        BlockPos next = support.offset(direction);
        if (!mc.world.isChunkLoaded(next) || !mc.world.getBlockState(next.up()).getCollisionShape(mc.world, next.up()).isEmpty()
                || !mc.world.getBlockState(next.up(2)).getCollisionShape(mc.world, next.up(2)).isEmpty()) {
            stop(mc, "Unloaded route or head obstruction"); return;
        }
        double forward = (mc.player.getX() - (support.getX() + .5)) * direction.getOffsetX()
                + (mc.player.getZ() - (support.getZ() + .5)) * direction.getOffsetZ();
        if (forward > .79 || forward < -.6) { stop(mc, "Position outside safe corridor"); return; }
        // Face opposite the travel direction. Backward input advances along the route.
        mc.player.setYaw(direction.getOpposite().asRotation());
        mc.player.setPitch(78);
        if (forward < .62) { mc.options.backKey.setPressed(true); status = "Sneak toward edge | " + placed + " placed"; return; }
        if (solid(mc, next)) { support = next; if (support.equals(destination)) stop(mc, "Reached existing destination"); return; }
        if (!mc.world.getBlockState(next).isAir()) { stop(mc, "Target is not empty air"); return; }
        Vec3d face = Vec3d.ofCenter(support).add(direction.getOffsetX() * .5, 0, direction.getOffsetZ() * .5);
        Vec3d delta = face.subtract(mc.player.getEyePos());
        double reach = mc.interactionManager.getReachDistance();
        if (delta.length() > reach) { stop(mc, "Face outside vanilla reach"); return; }
        mc.player.setYaw((float)Math.toDegrees(Math.atan2(-delta.x, delta.z)));
        mc.player.setPitch((float)-Math.toDegrees(Math.atan2(delta.y, delta.horizontalLength())));
        // Require a real unobstructed face: never place directly into unsupported air.
        BlockHitResult hit = mc.world.raycast(new RaycastContext(mc.player.getEyePos(), face.add(delta.normalize().multiply(.01)),
                RaycastContext.ShapeType.COLLIDER, RaycastContext.FluidHandling.NONE, mc.player));
        if (hit.getType() != HitResult.Type.BLOCK || !hit.getBlockPos().equals(support) || hit.getSide() != direction) {
            stop(mc, "No visible placement face; stopped"); return;
        }
        if (mc.interactionManager.interactBlock(mc.player, Hand.MAIN_HAND, hit).isAccepted()) {
            mc.player.swingHand(Hand.MAIN_HAND); waiting = next; waitTicks = 0; status = "Waiting for block confirmation";
        } else stop(mc, "Vanilla placement rejected");
    }
    private boolean solid(MinecraftClient mc, BlockPos pos) {
        return mc.world != null && mc.world.getBlockState(pos).isFullCube(mc.world, pos);
    }
    private boolean safeHeldBlock(MinecraftClient mc) {
        if (!(mc.player.getMainHandStack().getItem() instanceof BlockItem item)) return false;
        return !(item.getBlock() instanceof FallingBlock) && item.getBlock() != Blocks.TNT
                && item.getBlock().getDefaultState().isFullCube(mc.world, mc.player.getBlockPos());
    }
    private void message(MinecraftClient mc, String text) { status = text; if (mc.player != null) mc.player.sendMessage(Text.literal(text), true); }
}
