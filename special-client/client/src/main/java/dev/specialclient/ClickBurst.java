package dev.specialclient;

/** Bounded one-shot bursts. Only a physical press may enqueue; holding never repeats. */
public final class ClickBurst {
    private final int[] pending = new int[2], cooldown = new int[2];
    public static int multiplier(int value) { return value == 2 || value == 4 || value == 8 ? value : 1; }
    public void press(int button, int value) {
        if (button < 0 || button > 1) return;
        pending[button] = multiplier(value) - 1; // newest press replaces, never stacks
        cooldown[button] = 4;
    }
    public boolean tick(int button) {
        if (cooldown[button] > 0) { cooldown[button]--; return false; }
        if (pending[button] == 0) return false;
        pending[button]--; cooldown[button] = 3;
        return true;
    }
    public void clear() { for (int i = 0; i < 2; i++) { pending[i] = 0; cooldown[i] = 0; } }
    public int pending(int button) { return pending[button]; }
}
