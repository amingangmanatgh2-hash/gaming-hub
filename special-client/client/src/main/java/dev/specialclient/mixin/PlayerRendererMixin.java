package dev.specialclient.mixin;

import dev.specialclient.SpecialCosmeticsFeature;
import net.minecraft.client.network.AbstractClientPlayerEntity;
import net.minecraft.client.render.entity.*;
import net.minecraft.client.render.entity.model.PlayerEntityModel;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.*;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(PlayerEntityRenderer.class)
public abstract class PlayerRendererMixin extends LivingEntityRenderer<AbstractClientPlayerEntity,PlayerEntityModel<AbstractClientPlayerEntity>> {
    protected PlayerRendererMixin(EntityRendererFactory.Context context,PlayerEntityModel<AbstractClientPlayerEntity> model,float shadow) { super(context,model,shadow); }
    @Inject(method="<init>",at=@At("TAIL"))
    private void specialclient$cosmetics(EntityRendererFactory.Context context,boolean slim,CallbackInfo ci) {
        addFeature(new SpecialCosmeticsFeature((PlayerEntityRenderer)(Object)this));
    }
}
