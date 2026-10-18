package dev.specialclient;

import net.minecraft.client.gui.screen.Screen;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.gui.widget.*;
import net.minecraft.text.Text;

/** Local chat, never public server chat. Launcher performs opt-in API calls. */
public final class CompanionScreen extends Screen {
    private TextFieldWidget input;
    private String pending="",answer="Keep the launcher open. API setup is optional in Settings > Companion.";
    private int wait;
    public CompanionScreen() { super(Text.literal("SPECIAL Companion")); }
    @Override protected void init() {
        int x=width/2-150;
        input=new TextFieldWidget(textRenderer,x,height-90,240,20,Text.literal("Companion message"));
        input.setMaxLength(4000); input.setPlaceholder(Text.literal("Private companion chat...")); addDrawableChild(input);
        addDrawableChild(ButtonWidget.builder(Text.literal("Send"),b->{
            if(pending.isEmpty() && !input.getText().isBlank()) {
                pending=CompanionLink.ask(input.getText()); input.setText(""); wait=0; answer="Waiting for launcher/API...";
            }
        }).dimensions(x+245,height-90,55,20).build());
        addDrawableChild(ButtonWidget.builder(Text.literal("Emerald + return"),b->{close();CompanionLink.queue("collect_emerald");}).dimensions(x,height-64,145,20).build());
        addDrawableChild(ButtonWidget.builder(Text.literal("Diamond + return"),b->{close();CompanionLink.queue("collect_diamond");}).dimensions(x+155,height-64,145,20).build());
        addDrawableChild(ButtonWidget.builder(Text.literal("Wool bridges: "+(SpecialClient.config.collectorWool?"ON":"OFF")),b->{
            SpecialClient.config.collectorWool=!SpecialClient.config.collectorWool;SpecialClient.config.save();
            b.setMessage(Text.literal("Wool bridges: "+(SpecialClient.config.collectorWool?"ON":"OFF")));
        }).dimensions(x,height-38,145,20).build());
        addDrawableChild(ButtonWidget.builder(Text.literal("STOP / F8"),b->{CompanionLink.stop(client);answer="Task stopped";}).dimensions(x+155,height-38,145,20).build());
        setInitialFocus(input);
    }
    @Override public void tick() {
        input.tick();
        if(!pending.isEmpty()) {
            String result=CompanionLink.response(pending);
            if(!result.isEmpty()) { answer=result;pending=""; }
            else if(++wait>1200) { answer="No reply. Check launcher Companion page, game directory, enabled API and key.";pending=""; }
        }
    }
    @Override public void render(DrawContext ctx,int mx,int my,float delta) {
        renderBackground(ctx);super.render(ctx,mx,my,delta);
        ctx.drawCenteredTextWithShadow(textRenderer,"SPECIAL / COMPANION",width/2,18,0xff00e5ff);
        int y=38;
        for(var line:textRenderer.wrapLines(Text.literal(answer),Math.min(600,width-32))) {
            if(y>height-118)break;ctx.drawTextWithShadow(textRenderer,line,16,y,0xffdddddd);y+=11;
        }
        ctx.drawTextWithShadow(textRenderer,"Collection: private worlds, loaded visible drops, flat routes. F8 stops.",8,height-108,0xffffcc44);
    }
    @Override public boolean shouldPause() { return false; }
}
