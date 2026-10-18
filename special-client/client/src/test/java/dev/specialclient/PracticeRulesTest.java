package dev.specialclient;
import org.junit.Test;
import static org.junit.Assert.*;
public class PracticeRulesTest {
    @Test public void privateSingleplayerOnly() {
        assertTrue(PracticeRules.permitted(true, false, true, false, false));
        assertFalse(PracticeRules.permitted(false, false, true, false, false));
        assertFalse(PracticeRules.permitted(true, true, true, false, false));
        assertFalse(PracticeRules.permitted(true, false, false, false, false));
        assertFalse(PracticeRules.permitted(true, false, true, true, false));
        assertFalse(PracticeRules.permitted(true, false, true, false, true));
    }
    @Test public void flatCardinalFiniteRoutesOnly() {
        assertTrue(PracticeRules.validRoute(8, 0, 0));
        assertTrue(PracticeRules.validRoute(0, 0, -32));
        assertFalse(PracticeRules.validRoute(0, 0, 0));
        assertFalse(PracticeRules.validRoute(3, 0, 3));
        assertFalse(PracticeRules.validRoute(8, 1, 0));
        assertFalse(PracticeRules.validRoute(33, 0, 0));
        assertFalse(PracticeRules.validRoute(Integer.MIN_VALUE, 0, 0));
    }
    @Test public void tenLessonsHaveFiveStepsEach() {
        assertEquals(10, BridgeLessons.ALL.length);
        for (var lesson : BridgeLessons.ALL) {
            assertFalse(lesson.title().isBlank()); assertEquals(5, lesson.steps().length);
            for (String step : lesson.steps()) assertFalse(step.isBlank());
        }
        assertEquals(0, BridgeLessons.lesson(-1)); assertEquals(9, BridgeLessons.lesson(100));
        assertEquals(4, BridgeLessons.step(8));
    }
}
