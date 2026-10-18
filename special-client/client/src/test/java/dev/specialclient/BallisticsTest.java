package dev.specialclient;
import org.junit.Test;
import static org.junit.Assert.*;
public class BallisticsTest {
    @Test public void airStep() {
        assertArrayEquals(new double[]{1, 2, 3, .99, 1.95, 2.97}, Ballistics.step(0, 0, 0, 1, 2, 3, .03), 1e-9);
    }
    @Test public void overheadCone() {
        assertTrue(Ballistics.overhead(1, 5, 1, 12));
        assertFalse(Ballistics.overhead(0, -5, 0, 12));
        assertFalse(Ballistics.overhead(8, 3, 0, 12));
        assertFalse(Ballistics.overhead(0, 13, 0, 12));
    }
}
