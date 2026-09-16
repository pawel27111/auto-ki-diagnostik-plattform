package com.autoki.diagnostik.core

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * The K+DCAN cable has no firmware, so these frames are built by hand rather
 * than by an ELM327. Every expected value here is computed from ISO 9141-2 and
 * ISO 14230-2 by hand, not captured from this implementation.
 */
class KLineTest {

    private fun bytes(vararg values: Int) = ByteArray(values.size) { values[it].toByte() }

    private fun ByteArray.hex() = joinToString(" ") { "%02X".format(it.toInt() and 0xFF) }

    @Test
    fun `checksum is the low byte of the sum`() {
        // 0x68 + 0x6A + 0xF1 = 0x1C3, truncated to 0xC3.
        assertEquals(0xC3, KLine.checksum(bytes(0x68, 0x6A, 0xF1)))
        assertEquals(0x00, KLine.checksum(bytes(0x80, 0x80)))
        assertEquals(0x00, KLine.checksum(ByteArray(0)))
    }

    @Test
    fun `checksum honours the requested range`() {
        val frame = bytes(0xFF, 0x01, 0x02, 0xFF)
        assertEquals(0x03, KLine.checksum(frame, from = 1, toExclusive = 3))
    }

    @Test
    fun `ISO 9141-2 request carries the fixed header and a trailing checksum`() {
        // 0x68 + 0x6A + 0xF1 + 0x01 + 0x0C = 0x1D0 -> 0xD0.
        val frame = KLine.request(bytes(0x01, 0x0C), KLine.Framing.ISO9141)
        assertEquals("68 6A F1 01 0C D0", frame.hex())
    }

    @Test
    fun `KWP2000 request puts the payload length in the format byte`() {
        // 0xC0 or 2 = 0xC2; 0xC2 + 0x33 + 0xF1 + 0x01 + 0x0C = 0x1F3 -> 0xF3.
        val frame = KLine.request(bytes(0x01, 0x0C), KLine.Framing.KWP2000)
        assertEquals("C2 33 F1 01 0C F3", frame.hex())
    }

    @Test
    fun `a request needs a payload and cannot exceed one frame`() {
        assertFailsWith<IllegalArgumentException> {
            KLine.request(ByteArray(0), KLine.Framing.KWP2000)
        }
        assertFailsWith<IllegalArgumentException> {
            KLine.request(ByteArray(64), KLine.Framing.KWP2000)
        }
    }

    @Test
    fun `ISO 9141-2 response is split off and its payload returned`() {
        // 0x48+0x6B+0x10+0x41+0x0C+0x1A+0xF8 = 0x222 -> 0x22.
        val messages = KLine.parseResponses(
            bytes(0x48, 0x6B, 0x10, 0x41, 0x0C, 0x1A, 0xF8, 0x22),
            KLine.Framing.ISO9141,
        )
        assertEquals(1, messages.size)
        assertEquals(0x10, messages[0].source)
        assertEquals("41 0C 1A F8", messages[0].toHex())
    }

    @Test
    fun `two ECUs answering the same request come back as two messages`() {
        val messages = KLine.parseResponses(
            bytes(
                0x48, 0x6B, 0x10, 0x41, 0x0C, 0x1A, 0xF8, 0x22,
                // 0x48+0x6B+0x18+0x41+0x0C+0x1A+0xF8 = 0x22A -> 0x2A.
                0x48, 0x6B, 0x18, 0x41, 0x0C, 0x1A, 0xF8, 0x2A,
            ),
            KLine.Framing.ISO9141,
        )
        assertEquals(listOf(0x10, 0x18), messages.map { it.source })
        assertTrue(messages.all { it.toHex() == "41 0C 1A F8" })
    }

    @Test
    fun `the echo of our own request is skipped`() {
        // A single-wire bus reflects what we send; it must not become a message.
        val messages = KLine.parseResponses(
            bytes(0x68, 0x6A, 0xF1, 0x01, 0x0C, 0xD0) +
                bytes(0x48, 0x6B, 0x10, 0x41, 0x0C, 0x1A, 0xF8, 0x22),
            KLine.Framing.ISO9141,
        )
        assertEquals(1, messages.size)
        assertEquals("41 0C 1A F8", messages[0].toHex())
    }

    @Test
    fun `a frame with a broken checksum is not reported as data`() {
        val messages = KLine.parseResponses(
            bytes(0x48, 0x6B, 0x10, 0x41, 0x0C, 0x1A, 0xF8, 0x23),
            KLine.Framing.ISO9141,
        )
        assertTrue(messages.isEmpty())
    }

    @Test
    fun `KWP2000 responses are split on their declared length`() {
        // 0xC4+0xF1+0x10+0x41+0x0C+0x1A+0xF8 = 0x324 -> 0x24.
        val messages = KLine.parseResponses(
            bytes(0xC4, 0xF1, 0x10, 0x41, 0x0C, 0x1A, 0xF8, 0x24),
            KLine.Framing.KWP2000,
        )
        assertEquals(1, messages.size)
        assertEquals(0x10, messages[0].source)
        assertEquals("41 0C 1A F8", messages[0].toHex())
    }

    @Test
    fun `a truncated frame yields nothing rather than a partial reading`() {
        assertTrue(
            KLine.parseResponses(bytes(0x48, 0x6B, 0x10), KLine.Framing.ISO9141).isEmpty()
        )
        assertTrue(
            KLine.parseResponses(bytes(0xC4, 0xF1, 0x10, 0x41), KLine.Framing.KWP2000).isEmpty()
        )
    }

    @Test
    fun `the wake-up pattern is start bit, address LSB first, stop bit`() {
        // 0x33 = 0b00110011, so least-significant first: 1 1 0 0 1 1 0 0.
        assertEquals(
            listOf(false, true, true, false, false, true, true, false, false, true),
            KLine.slowInitBits(0x33),
        )
    }

    @Test
    fun `the wake-up pattern is always ten bits long`() {
        assertEquals(10, KLine.slowInitBits(0x00).size)
        assertEquals(10, KLine.slowInitBits(0xFF).size)
    }

    @Test
    fun `the handshake answers the second key byte inverted`() {
        assertEquals(0x77, KLine.keyByteHandshake(sync = 0x55, keyByte2 = 0x88))
    }

    @Test
    fun `a wrong sync byte fails the handshake`() {
        assertNull(KLine.keyByteHandshake(sync = 0x00, keyByte2 = 0x88))
    }

    @Test
    fun `the wake-up ends with the address echoed inverted`() {
        assertEquals(0xCC, KLine.expectedAddressEcho(0x33))
    }

    @Test
    fun `messages compare by content so they are usable in assertions`() {
        val a = KLine.Message(0x10, bytes(0x41, 0x0C))
        val b = KLine.Message(0x10, bytes(0x41, 0x0C))
        assertEquals(a, b)
        assertEquals(a.hashCode(), b.hashCode())
    }
}
