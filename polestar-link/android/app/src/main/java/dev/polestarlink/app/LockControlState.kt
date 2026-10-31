package dev.polestarlink.app

/** Never infer a lock state from a button press or a timed-out invocation. */
data class LockControlState(
    val status: String,
    val action: String?,
    val actionLabel: String,
    val unlocked: Boolean,
    val locked: Boolean
)

fun lockControlState(lockState: String?, live: Boolean): LockControlState {
    if (!live) return LockControlState("STATUS UNAVAILABLE", null, "REFRESH STATUS", false, false)
    return when (lockState?.lowercase()) {
        "unlocked" -> LockControlState("UNLOCKED", "lock", "LOCK VEHICLE", true, false)
        "locked" -> LockControlState("LOCKED", "unlock", "UNLOCK VEHICLE", false, true)
        else -> LockControlState("LOCK STATUS UNKNOWN", null, "REFRESH STATUS", false, false)
    }
}

fun desiredLockState(action: String): String? = when (action) {
    "lock" -> "locked"
    "unlock" -> "unlocked"
    else -> null
}

/** A C3 stream acknowledgement is NOT proof of a physical lock transition. */
fun lockTransitionConfirmed(action: String, observed: String?): Boolean =
    desiredLockState(action) != null && desiredLockState(action) == observed?.lowercase()
