package dev.specialclient.mixin;

import dev.specialclient.SpecialClient;
import net.minecraft.client.Mouse;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(Mouse.class)
public abstract class MouseMixin {
    @Inject(method = "onMouseButton", at = @At("TAIL"))
    private void specialclient$physicalPress(long window, int button, int action, int mods, CallbackInfo ci) {
        SpecialClient.physicalMouse(window, button, action);
    }
}
