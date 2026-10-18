package dev.specialclient;

import java.util.*;

/** Bounded A* over one horizontal layer. Never queries terrain outside the supplied map. */
public final class GridPlanner {
    public record Point(int x, int z) {}
    public enum Cell { FLOOR, GAP, BLOCKED }
    public interface Terrain { Cell cell(Point p); }
    private record Node(Point point, double cost, double score) {}
    public static List<Point> plan(Point start, Point goal, Terrain terrain, boolean bridge, int wool) {
        if (distance(start, goal) > 64 || terrain.cell(start) != Cell.FLOOR) return List.of();
        PriorityQueue<Node> open = new PriorityQueue<>(Comparator.comparingDouble(Node::score));
        Map<Point, Double> costs = new HashMap<>(); Map<Point, Point> parents = new HashMap<>();
        costs.put(start, 0d); open.add(new Node(start, 0, distance(start, goal)));
        int visits = 0;
        while (!open.isEmpty() && visits++ < 2500) {
            Node node = open.remove(); Point p = node.point;
            if (node.cost > costs.getOrDefault(p, Double.MAX_VALUE)) continue;
            if (p.equals(goal)) {
                LinkedList<Point> route = new LinkedList<>();
                for (Point at = goal; !at.equals(start); at = parents.get(at)) route.addFirst(at);
                long gaps = route.stream().filter(q -> terrain.cell(q) == Cell.GAP).count();
                return gaps <= Math.min(8, wool) && route.size() <= 64 ? route : List.of();
            }
            for (int[] d : new int[][]{{1,0},{-1,0},{0,1},{0,-1}}) {
                Point q = new Point(p.x + d[0], p.z + d[1]);
                if (Math.abs((long)q.x - start.x) > 32 || Math.abs((long)q.z - start.z) > 32) continue;
                Cell cell = terrain.cell(q);
                if (cell == Cell.BLOCKED || cell == Cell.GAP && !bridge) continue;
                double cost = node.cost + (cell == Cell.GAP ? 6 : 1);
                if (cost >= costs.getOrDefault(q, Double.MAX_VALUE)) continue;
                costs.put(q, cost); parents.put(q, p); open.add(new Node(q, cost, cost + distance(q, goal)));
            }
        }
        return List.of();
    }
    private static long distance(Point a, Point b) { return Math.abs((long)a.x-b.x) + Math.abs((long)a.z-b.z); }
}
