package dev.polestarlink.app

import com.google.protobuf.CodedInputStream
import com.google.protobuf.WireFormat

/** Read-only fields from kildahldev/unofficial-polestar-api. Missing values remain unknown. */
data class ExteriorDetails(
    val lockState: String = "unknown",
    val frontLeftDoor: String = "unknown",
    val frontRightDoor: String = "unknown",
    val rearLeftDoor: String = "unknown",
    val rearRightDoor: String = "unknown",
    val frontLeftWindow: String = "unknown",
    val frontRightWindow: String = "unknown",
    val rearLeftWindow: String = "unknown",
    val rearRightWindow: String = "unknown",
    val hood: String = "unknown",
    val trunk: String = "unknown",
    val sunroof: String = "unknown",
    val chargeFlap: String = "unknown"
) {
    val windowState: String get() {
        val windows = listOf(frontLeftWindow, frontRightWindow, rearLeftWindow, rearRightWindow)
        return when {
            windows.any { it == "open" || it == "ajar" } -> "open"
            windows.all { it == "closed" } -> "closed"
            else -> "unknown"
        }
    }
}

data class BatteryDetails(
    val chargingState: String = "unknown",
    val chargerConnection: String = "unknown",
    val chargingType: String = "unknown",
    val powerWatts: Int? = null,
    val currentAmps: Int? = null,
    val voltageVolts: Int? = null,
    val timeToFullMinutes: Int? = null,
    val averageConsumption: Double? = null
)

data class ClimateDetails(val state: String = "unknown", val minutesRemaining: Int? = null)

data class VehicleDetails(
    val exterior: ExteriorDetails = ExteriorDetails(),
    val battery: BatteryDetails = BatteryDetails(),
    val climate: ClimateDetails = ClimateDetails(),
    val odometerKm: Double? = null,
    val fetchedAt: Long = System.currentTimeMillis()
)

/** Protobuf reader preserving wire types, including unknown fields. */
internal class C3Message(private val values: Map<Int, Field>) {
    data class Field(val number: Double? = null, val bytes: ByteArray? = null)
    fun number(n: Int): Double? = values[n]?.number
    fun integer(n: Int): Int? = number(n)?.toInt()
    fun child(n: Int): C3Message? = values[n]?.bytes?.let { read(it) }
    fun bytes(n: Int): ByteArray? = values[n]?.bytes
    companion object {
        fun read(data: ByteArray): C3Message {
            val input = CodedInputStream.newInstance(data)
            val fields = mutableMapOf<Int, Field>()
            while (!input.isAtEnd) {
                val tag = input.readTag()
                if (tag == 0) break
                val n = WireFormat.getTagFieldNumber(tag)
                val value = when (WireFormat.getTagWireType(tag)) {
                    WireFormat.WIRETYPE_VARINT ->
                        Field(number = input.readInt64().toDouble())
                    WireFormat.WIRETYPE_FIXED64 ->
                        Field(number = java.lang.Double.longBitsToDouble(input.readFixed64()))
                    WireFormat.WIRETYPE_FIXED32 ->
                        Field(number = java.lang.Float.intBitsToFloat(input.readFixed32()).toDouble())
                    WireFormat.WIRETYPE_LENGTH_DELIMITED ->
                        Field(bytes = input.readByteArray())
                    else -> { input.skipField(tag); null }
                }
                if (value != null) fields[n] = value
            }
            return C3Message(fields)
        }
    }
}

internal fun openState(raw: Int?): String = when (raw) {
    1 -> "open"
    2 -> "closed"
    3 -> "ajar"
    else -> "unknown"
}
internal fun lockState(raw: Int?): String = when (raw) {
    1 -> "unlocked"
    2 -> "locked"
    else -> "unknown"
}

internal fun parseC3Exterior(response: ByteArray): ExteriorDetails {
    val e = C3Message.read(response).child(3) ?: return ExteriorDetails()
    // C3 Digital Twin uses flat enums: field 2 is central lock and 7-10 windows.
    if ((2..16).any { e.number(it) != null }) return ExteriorDetails(
        lockState = lockState(e.integer(2)),
        frontLeftDoor = openState(e.integer(3)),
        frontRightDoor = openState(e.integer(4)),
        rearLeftDoor = openState(e.integer(5)),
        rearRightDoor = openState(e.integer(6)),
        frontLeftWindow = openState(e.integer(7)),
        frontRightWindow = openState(e.integer(8)),
        rearLeftWindow = openState(e.integer(9)),
        rearRightWindow = openState(e.integer(10)),
        hood = openState(e.integer(11)),
        trunk = openState(e.integer(12)),
        chargeFlap = openState(e.integer(13)),
        sunroof = openState(e.integer(14))
    )
    // Legacy C3 nested format: ExteriorStatus 1 central lock, 2 doors, 3 windows.
    val doors = e.child(2)
    val windows = e.child(3)
    return ExteriorDetails(
        lockState = lockState(e.child(1)?.integer(1)),
        frontLeftDoor = openState(doors?.child(1)?.integer(2)),
        frontRightDoor = openState(doors?.child(2)?.integer(2)),
        rearLeftDoor = openState(doors?.child(3)?.integer(2)),
        rearRightDoor = openState(doors?.child(4)?.integer(2)),
        frontLeftWindow = openState(windows?.child(1)?.integer(1)),
        frontRightWindow = openState(windows?.child(2)?.integer(1)),
        rearLeftWindow = openState(windows?.child(3)?.integer(1)),
        rearRightWindow = openState(windows?.child(4)?.integer(1)),
        hood = openState(e.child(5)?.child(1)?.integer(2)),
        trunk = openState(e.child(6)?.child(1)?.integer(2)),
        chargeFlap = openState(e.child(7)?.integer(1)),
        sunroof = openState(e.child(4)?.integer(1))
    )
}
internal fun parseC3Battery(response: ByteArray): BatteryDetails {
    val b = C3Message.read(response).child(3) ?: return BatteryDetails()
    return BatteryDetails(
        chargingState = when (b.integer(7)) {
            1 -> "charging"; 2 -> "idle"; 3 -> "scheduled"; 4 -> "discharging"
            5 -> "error"; 6 -> "smart charging"; 7 -> "complete"
            8 -> "paused"; else -> "unknown"
        },
        chargerConnection = when (b.integer(6)) {
            1 -> "connected"; 2 -> "disconnected"; 3 -> "fault"; else -> "unknown"
        },
        chargingType = when (b.integer(17)) {
            1 -> "none"; 2 -> "AC"; 3 -> "DC"; 4 -> "wireless"; else -> "unknown"
        },
        powerWatts = b.integer(10),
        currentAmps = b.integer(11),
        voltageVolts = b.integer(18),
        timeToFullMinutes = b.integer(5),
        averageConsumption = b.number(3)
    )
}
internal fun parseC3Climate(response: ByteArray): ClimateDetails {
    val c = C3Message.read(response).child(3) ?: return ClimateDetails()
    // Digital Twin fields (running:2, remaining:3, request:15).
    if (c.number(2) != null || c.number(15) != null) return ClimateDetails(
        state = when (c.integer(2)) {
            1 -> "active"; 2 -> "idle"; 3 -> "starting"; else -> "unknown"
        },
        minutesRemaining = c.integer(3)
    )
    return ClimateDetails(
        state = when (c.integer(1)) {
            1 -> "idle"; 2 -> "starting"; 5, 6, 4, 8 -> "active"
            else -> "unknown"
        },
        minutesRemaining = c.integer(3)
    )
}
internal fun parseC3Odometer(response: ByteArray): Double? {
    val meters = C3Message.read(response).child(3)?.number(2) ?: return null
    return (meters / 1000.0).takeIf { it.isFinite() && it in 0.0..2_000_000.0 }
}
