package dev.polestarlink.app

import com.google.protobuf.CodedOutputStream
import org.junit.Assert.*
import org.junit.Test
import java.io.ByteArrayOutputStream

class C3DetailsTest {
    private fun proto(write: (CodedOutputStream) -> Unit): ByteArray {
        val out = ByteArrayOutputStream()
        val codec = CodedOutputStream.newInstance(out)
        write(codec);codec.flush();return out.toByteArray()
    }
    private fun wrapped(inside: ByteArray): ByteArray =
        proto { it.writeByteArray(3, inside) }

    @Test fun digitalTwinLockAndWindowsUseActualFlatFieldNumbers() {
        val response = wrapped(proto {
            it.writeEnum(2, 1) // central lock unlocked
            it.writeEnum(3, 2);it.writeEnum(4, 2) // front doors closed
            it.writeEnum(7, 1) // FL window open
            it.writeEnum(8, 2);it.writeEnum(9, 2);it.writeEnum(10, 2)
            it.writeEnum(12, 2) // trunk closed
        })
        val state = parseC3Exterior(response)
        assertEquals("unlocked", state.lockState)
        assertEquals("closed",state.frontLeftDoor)
        assertEquals("open",state.frontLeftWindow)
        assertEquals("open",state.windowState)
        assertEquals("closed",state.trunk)
    }

    @Test fun legacyNestedCentralLockIsNotAFlatField() {
        val response = wrapped(proto {
            it.writeByteArray(1, proto { inner -> inner.writeEnum(1, 2) })
            it.writeByteArray(3, proto { windows ->
                windows.writeByteArray(1, proto { it.writeEnum(1, 2) })
                windows.writeByteArray(2, proto { it.writeEnum(1, 2) })
                windows.writeByteArray(3, proto { it.writeEnum(1, 2) })
                windows.writeByteArray(4, proto { it.writeEnum(1, 2) })
            })
        })
        val state = parseC3Exterior(response)
        assertEquals("locked",state.lockState)
        assertEquals("closed",state.windowState)
    }

    @Test fun unknownDoorsAndWindowsAreNotAssumedClosed() {
        val status = parseC3Exterior(wrapped(proto { it.writeEnum(2, 2) }))
        assertEquals("locked",status.lockState)
        assertEquals("unknown",status.windowState)
        assertEquals("unknown",status.hood)
    }

    @Test fun detailedBatteryChargingFieldsAreDistinct() {
        val data = wrapped(proto {
            it.writeEnum(7, 1);it.writeEnum(6, 1)
            it.writeEnum(17, 3);it.writeInt32(10, 11000)
            it.writeInt32(11, 16);it.writeInt32(18, 390)
        })
        val detail = parseC3Battery(data)
        assertEquals("charging",detail.chargingState)
        assertEquals("connected",detail.chargerConnection)
        assertEquals("DC",detail.chargingType)
        assertEquals(11000,detail.powerWatts)
        assertEquals(390,detail.voltageVolts)
    }

    @Test fun statesRemainUnknownWithoutARealResponse() {
        assertEquals("unknown",parseC3Exterior(byteArrayOf()).lockState)
        assertEquals("unknown",parseC3Battery(byteArrayOf()).chargingState)
        assertEquals("unknown",parseC3Climate(byteArrayOf()).state)
        assertNull(parseC3Odometer(byteArrayOf()))
    }
}
