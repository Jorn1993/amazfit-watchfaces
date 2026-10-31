package dev.polestarlink.app

import com.google.protobuf.CodedInputStream
import com.google.protobuf.WireFormat
import org.junit.Assert.*
import org.junit.Test

class C3WireTest {
    private fun tags(bytes: ByteArray): List<Pair<Int, Int>> {
        val input = CodedInputStream.newInstance(bytes)
        val values = mutableListOf<Pair<Int, Int>>()
        while (!input.isAtEnd) {
            val tag = input.readTag()
            if (tag == 0) break
            val number = WireFormat.getTagFieldNumber(tag)
            val wire = WireFormat.getTagWireType(tag)
            values.add(number to wire)
            input.skipField(tag)
        }
        return values
    }
    @Test fun vehicleRequestCarriesIdAndVin() {
        val packet = PolestarRepository.vehicleRequest("YSMABCDE0R0000001")
        assertEquals(listOf(1 to 2, 2 to 2), tags(packet))
    }
    @Test fun trunkUnlockUsesTheSameMethodWithEnumOne() {
        val packet = PolestarRepository.invocationRequest(
            "YSMABCDE0R0000001", "trunk", 1)
        assertEquals(listOf(1 to 2, 2 to 0), tags(packet))
    }
    @Test fun defaultLockDoesNotSetAnUnnecessaryEnum() {
        val packet = PolestarRepository.invocationRequest(
            "YSMABCDE0R0000001", "lock", 0)
        assertEquals(listOf(1 to 2), tags(packet))
    }
    @Test fun climateStartSetsTrueInFieldTwo() {
        val packet = PolestarRepository.invocationRequest(
            "YSMABCDE0R0000001", "climate_start", 0)
        assertEquals(listOf(1 to 2, 2 to 0), tags(packet))
    }
}
