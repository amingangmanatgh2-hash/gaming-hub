package dev.specialclient;
import org.junit.Test;
import static org.junit.Assert.*;
public class GridPlannerTest {
    @Test public void simpleFloorRoute() {
        var route=GridPlanner.plan(new GridPlanner.Point(0,0),new GridPlanner.Point(3,0),p->GridPlanner.Cell.FLOOR,false,0);
        assertEquals(3,route.size());assertEquals(new GridPlanner.Point(3,0),route.get(2));
    }
    @Test public void noWoolNoVoidCrossing() {
        GridPlanner.Terrain map=p->p.z()!=0?GridPlanner.Cell.BLOCKED:p.x()==1?GridPlanner.Cell.GAP:GridPlanner.Cell.FLOOR;
        assertTrue(GridPlanner.plan(new GridPlanner.Point(0,0),new GridPlanner.Point(2,0),map,false,64).isEmpty());
        assertTrue(GridPlanner.plan(new GridPlanner.Point(0,0),new GridPlanner.Point(2,0),map,true,0).isEmpty());
        assertEquals(2,GridPlanner.plan(new GridPlanner.Point(0,0),new GridPlanner.Point(2,0),map,true,1).size());
    }
    @Test public void obstructionAndBudget() {
        assertTrue(GridPlanner.plan(new GridPlanner.Point(0,0),new GridPlanner.Point(2,0),p->p.x()==1?GridPlanner.Cell.BLOCKED:GridPlanner.Cell.FLOOR,false,0).isEmpty());
        assertTrue(GridPlanner.plan(new GridPlanner.Point(0,0),new GridPlanner.Point(100,0),p->GridPlanner.Cell.FLOOR,false,0).isEmpty());
        GridPlanner.Terrain voidMap=p->p.x()==0?GridPlanner.Cell.FLOOR:GridPlanner.Cell.GAP;
        assertTrue(GridPlanner.plan(new GridPlanner.Point(0,0),new GridPlanner.Point(9,0),voidMap,true,64).isEmpty());
    }
}
