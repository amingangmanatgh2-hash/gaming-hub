package dev.specialclient;

/** Discrete vanilla-like air step; does not model water, enchantments or server plugins. */
public final class Ballistics {
    private Ballistics() {}
    public static double[] step(double x, double y, double z, double vx, double vy, double vz, double gravity) {
        return new double[]{x + vx, y + vy, z + vz, vx * .99, vy * .99 - gravity, vz * .99};
    }
    public static boolean overhead(double dx, double dy, double dz, double radius) {
        return dy > 2 && dy <= radius && dx * dx + dz * dz <= dy * dy
                && dx * dx + dy * dy + dz * dz <= radius * radius;
    }
}
