package dev.specialclient;
import org.junit.Test;
import static org.junit.Assert.*;
public class ClickBurstTest {
    @Test public void noPressMeansNoClicks() {
        ClickBurst b = new ClickBurst();
        for (int i = 0; i < 100; i++) { assertFalse(b.tick(0)); assertFalse(b.tick(1)); }
    }
    @Test public void exactFiniteBursts() {
        for (int multiplier : new int[]{1, 2, 4, 8}) {
            ClickBurst b = new ClickBurst(); b.press(0, multiplier);
            int count = 0; for (int i = 0; i < 100; i++) if (b.tick(0)) count++;
            assertEquals(multiplier - 1, count); assertEquals(0, b.pending(0));
        }
    }
    @Test public void independentButtonsAndNoBacklog() {
        ClickBurst b = new ClickBurst(); b.press(0, 8); b.press(1, 2);
        b.press(0, 4); assertEquals(3, b.pending(0)); assertEquals(1, b.pending(1));
        int l = 0, r = 0; for (int i = 0; i < 100; i++) { if (b.tick(0)) l++; if (b.tick(1)) r++; }
        assertEquals(3, l); assertEquals(1, r);
    }
    @Test public void cancelAndInvalidValues() {
        ClickBurst b = new ClickBurst(); b.press(0, 8); b.clear(); assertEquals(0, b.pending(0));
        for (int value : new int[]{0, -8, 3, 16, Integer.MAX_VALUE}) assertEquals(1, ClickBurst.multiplier(value));
        b.press(5, 8); assertEquals(0, b.pending(0));
    }
    @Test public void spacingIsBounded() {
        ClickBurst b = new ClickBurst(); b.press(1, 8); int previous = -100;
        for (int i = 0; i < 100; i++) if (b.tick(1)) { assertTrue(i - previous >= 4); previous = i; }
    }
}
