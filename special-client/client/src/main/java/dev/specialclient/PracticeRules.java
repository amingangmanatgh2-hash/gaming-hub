package dev.specialclient;

public final class PracticeRules {
    private PracticeRules() {}
    public static boolean permitted(boolean integrated, boolean published, boolean focused, boolean screen, boolean paused) {
        return integrated && !published && focused && !screen && !paused;
    }
    /** Only straight, level routes of 1..32 blocks. No floating-block creation. */
    public static boolean validRoute(int dx, int dy, int dz) {
        return dy == 0 && (dx == 0 ^ dz == 0) && Math.abs((long)dx) + Math.abs((long)dz) <= 32;
    }
}
