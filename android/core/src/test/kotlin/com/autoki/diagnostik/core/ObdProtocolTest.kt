package com.autoki.diagnostik.core

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** Mirrors server/__tests__/protocol.test.ts so the Kotlin port stays in sync with the backend. */
class ObdProtocolTest {

    @Test
    fun `extractHexBytes reads spaced and packed hex alike`() {
        assertEquals(listOf(0x41, 0x0c, 0x1a, 0xf8), ObdProtocol.extractHexBytes("41 0C 1A F8"))
        assertEquals(listOf(0x41, 0x0c, 0x1a, 0xf8), ObdProtocol.extractHexBytes("410C1AF8"))
    }

    @Test
    fun `extractHexBytes drops the prompt, echoed command and SEARCHING notice`() {
        assertEquals(
            listOf(0x41, 0x0d, 0x32),
            ObdProtocol.extractHexBytes("SEARCHING...\r41 0D 32\r\r>")
        )
    }

    @Test
    fun `extractHexBytes ignores tokens that are not whole bytes`() {
        assertEquals(listOf(0x41, 0x0d), ObdProtocol.extractHexBytes("41 0D 3"))
    }

    @Test
    fun `decodeMode01Response decodes known PIDs per SAE J1979`() {
        val cases = listOf(
            Triple("0C", "41 0C 1A F8", 1726.0), // (0x1AF8) / 4
            Triple("0D", "41 0D 32", 50.0), // A
            Triple("05", "41 05 7B", 83.0), // A - 40
            Triple("0A", "41 0A 64", 300.0), // A * 3
            Triple("11", "41 11 FF", 100.0), // A * 100 / 255
            Triple("14", "41 14 80 FF", 0.64), // A / 200
            Triple("42", "41 42 39 D0", 14.8), // (256A+B) / 1000
        )
        for ((pid, response, expected) in cases) {
            assertEquals(expected, ObdProtocol.decodeMode01Response(pid, response), "PID $pid")
        }
    }

    @Test
    fun `decodeMode01Response finds the payload behind a CAN header`() {
        assertEquals(50.0, ObdProtocol.decodeMode01Response("0D", "7E8 03 41 0D 32"))
    }

    @Test
    fun `decodeMode01Response returns null when the ECU answers about a different PID`() {
        assertNull(ObdProtocol.decodeMode01Response("0C", "41 0D 32"))
    }

    @Test
    fun `decodeMode01Response throws on adapter errors rather than reporting a value`() {
        assertFailsWith<ObdProtocolError> { ObdProtocol.decodeMode01Response("0C", "UNABLE TO CONNECT") }
        assertFailsWith<ObdProtocolError> { ObdProtocol.decodeMode01Response("0C", "NO DATA") }
    }

    @Test
    fun `decodeMode01Response throws on a truncated payload instead of decoding garbage`() {
        val error = assertFailsWith<ObdProtocolError> { ObdProtocol.decodeMode01Response("0C", "41 0C 1A") }
        assertTrue(error.message!!.contains("Truncated"))
    }

    @Test
    fun `decodeMode01Response rejects unknown PIDs`() {
        assertFailsWith<ObdProtocolError> { ObdProtocol.decodeMode01Response("ZZ", "41 ZZ 00") }
    }

    @Test
    fun `decodeDtcBytes decodes the letter, digit and hex nibbles`() {
        val cases = listOf(
            Triple(0x01, 0x43, "P0143"),
            Triple(0x41, 0x71, "C0171"),
            Triple(0x81, 0x22, "B0122"),
            Triple(0xc1, 0x00, "U0100"),
            Triple(0x03, 0x00, "P0300"),
        )
        for ((a, b, expected) in cases) {
            assertEquals(expected, ObdProtocol.decodeDtcBytes(a, b)?.code, "bytes $a,$b")
        }
    }

    @Test
    fun `decodeDtcBytes treats an all-zero pair as an unused slot`() {
        assertNull(ObdProtocol.decodeDtcBytes(0, 0))
    }

    @Test
    fun `decodeMode03Response reads a CAN response with a count byte`() {
        assertEquals(
            listOf("P0143", "C0171"),
            ObdProtocol.decodeMode03Response("43 02 01 43 41 71").map { it.code }
        )
    }

    @Test
    fun `decodeMode03Response ignores CAN frame padding`() {
        assertEquals(
            listOf("P0143"),
            ObdProtocol.decodeMode03Response("43 01 01 43 00 00 00 00").map { it.code }
        )
    }

    @Test
    fun `decodeMode03Response honours an explicit countByte override`() {
        assertEquals(
            listOf("P0143", "C0171"),
            ObdProtocol.decodeMode03Response("43 01 43 41 71", CountByteMode.ABSENT).map { it.code }
        )
        assertEquals(
            listOf("C0300"),
            ObdProtocol.decodeMode03Response("43 01 43 00 00", CountByteMode.PRESENT).map { it.code }
        )
    }

    @Test
    fun `decodeMode03Response reports no stored codes as an empty list, not an error`() {
        assertEquals(emptyList(), ObdProtocol.decodeMode03Response("NO DATA"))
        assertEquals(emptyList(), ObdProtocol.decodeMode03Response("43 00"))
    }

    @Test
    fun `decodeMode03Response throws on a real adapter failure`() {
        assertFailsWith<ObdProtocolError> { ObdProtocol.decodeMode03Response("BUS ERROR") }
    }

    @Test
    fun `decodeMode03Response de-duplicates codes repeated across frames`() {
        assertEquals(
            listOf("P0143"),
            ObdProtocol.decodeMode03Response("43 02 01 43 01 43").map { it.code }
        )
    }

    @Test
    fun `decodeMode03Response assigns the system from the code letter`() {
        assertEquals("Chassis", ObdProtocol.decodeMode03Response("43 01 41 71")[0].system)
    }

    @Test
    fun `isNormalReading flags readings outside the healthy band`() {
        val coolant = ObdProtocol.getPidDefinition("05")!!
        assertTrue(ObdProtocol.isNormalReading(coolant, 90.0))
        assertTrue(!ObdProtocol.isNormalReading(coolant, 130.0))
    }

    @Test
    fun `severityForCode rates misfires as critical`() {
        assertEquals(Severity.CRITICAL, ObdProtocol.severityForCode("P0300"))
        assertEquals(Severity.CRITICAL, ObdProtocol.severityForCode("P0302"))
    }

    @Test
    fun `severityForCode rates network faults as errors`() {
        assertEquals(Severity.ERROR, ObdProtocol.severityForCode("U0100"))
    }

    @Test
    fun `severityForCode defaults unknown powertrain codes to warning`() {
        assertEquals(Severity.WARNING, ObdProtocol.severityForCode("P0ABC"))
    }
}
