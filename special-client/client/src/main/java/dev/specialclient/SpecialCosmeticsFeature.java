package dev.specialclient;

import net.minecraft.client.network.AbstractClientPlayerEntity;
import net.minecraft.client.model.*;
import net.minecraft.client.render.*;
import net.minecraft.client.render.entity.feature.FeatureRenderer;
import net.minecraft.client.render.entity.feature.FeatureRendererContext;
import net.minecraft.client.render.entity.model.PlayerEntityModel;
import net.minecraft.client.util.math.MatrixStack;
import net.minecraft.util.Identifier;

/** Low-poly local cosmetic layer. No account cape spoofing, network download or server packets. */
public final class SpecialCosmeticsFeature extends FeatureRenderer<AbstractClientPlayerEntity,PlayerEntityModel<AbstractClientPlayerEntity>> {
    private final ModelPart left,right,cape;
    public SpecialCosmeticsFeature(FeatureRendererContext<AbstractClientPlayerEntity,PlayerEntityModel<AbstractClientPlayerEntity>> context) {
        super(context);
        ModelData data=new ModelData();
        data.getRoot().addChild("left",ModelPartBuilder.create().uv(0,0).cuboid(0,-2,0,12,10,1),ModelTransform.NONE);
        data.getRoot().addChild("right",ModelPartBuilder.create().uv(0,0).mirrored().cuboid(-12,-2,0,12,10,1),ModelTransform.NONE);
        data.getRoot().addChild("cape",ModelPartBuilder.create().uv(16,16).cuboid(-4,0,0,8,12,1),ModelTransform.NONE);
        ModelPart root=TexturedModelData.of(data,64,32).createModel();
        left=root.getChild("left");right=root.getChild("right");cape=root.getChild("cape");
    }
    @Override public void render(MatrixStack matrices,VertexConsumerProvider vertices,int light,AbstractClientPlayerEntity player,
            float limbAngle,float limbDistance,float tickDelta,float animationProgress,float headYaw,float headPitch) {
        if(player.isInvisible() || player.isSpectator())return;
        CosmeticsSettings.Prefs prefs=CosmeticsSettings.forPlayer(player.getUuid());
        if(prefs.cape().isEmpty() && !prefs.wings())return;
        matrices.push();
        getContextModel().body.rotate(matrices);
        matrices.translate(0,0,.14);
        if(!prefs.cape().isEmpty()) {
            VertexConsumer buffer=vertices.getBuffer(RenderLayer.getEntityCutoutNoCull(new Identifier("specialclient","textures/capes/"+prefs.cape()+".png")));
            cape.pitch=.12f+(float)Math.sin(animationProgress*.08f)*.04f+Math.min(.25f,limbDistance*.2f);
            cape.render(matrices,buffer,light,OverlayTexture.DEFAULT_UV,1,1,1,1);
        }
        if(prefs.wings()) {
            VertexConsumer buffer=vertices.getBuffer(RenderLayer.getEntityCutoutNoCull(new Identifier("specialclient","textures/wings.png")));
            float flap=.45f+(float)Math.sin(animationProgress*.18f)*.32f;
            left.yaw=-flap; right.yaw=flap;left.roll=-.2f;right.roll=.2f;
            left.render(matrices,buffer,light,OverlayTexture.DEFAULT_UV,1,1,1,1);
            right.render(matrices,buffer,light,OverlayTexture.DEFAULT_UV,1,1,1,1);
        }
        matrices.pop();
    }
}
