package dev.polestarlink.app

import org.junit.Assert.*
import org.junit.Test

class LockControlStateTest {
    @Test fun unlockedStatusIsHighlightedAndOnlyOffersLock() {
        val state = lockControlState("unlocked", true)
        assertEquals("UNLOCKED", state.status)
        assertEquals("lock", state.action)
        assertEquals("LOCK VEHICLE", state.actionLabel)
        assertTrue(state.unlocked)
        assertFalse(state.locked)
    }
    @Test fun lockedStatusOnlyOffersUnlock() {
        val state = lockControlState("locked", true)
        assertEquals("unlock", state.action)
        assertTrue(state.locked)
        assertFalse(state.unlocked)
    }
    @Test fun unknownOrOfflineStatusNeverOffersACommand() {
        assertNull(lockControlState("unknown", true).action)
        assertNull(lockControlState("unlocked", false).action)
        assertNull(lockControlState(null, true).action)
    }
    @Test fun terminalAckCannotSubstituteForObservedStatus() {
        assertTrue(lockTransitionConfirmed("lock", "locked"))
        assertTrue(lockTransitionConfirmed("unlock", "unlocked"))
        assertFalse(lockTransitionConfirmed("lock", "unlocked"))
        assertFalse(lockTransitionConfirmed("lock", "unknown"))
        assertFalse(lockTransitionConfirmed("trunk", "locked"))
    }
}
