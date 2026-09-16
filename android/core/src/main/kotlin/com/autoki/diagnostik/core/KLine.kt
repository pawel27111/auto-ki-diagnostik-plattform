package com.autoki.diagnostik.core

/**
 * Message framing for the K-Line protocols (ISO 9141-2 and ISO 14230 "KWP2000").
 *
 * An ELM327 does all of this in firmware: you send it `01 0C` and it deals with
 * headers, checksums and timing. A BMW K+DCAN cable has no firmware — it is an
 * FTDI chip on a wire — so everything the ELM327 would have done has to happen
 * here.
 *
 * This file holds only the parts that are pure computation, so they can be
 * tested without a car attached. The timing-critical half (the 5-baud wake-up,
 * inter-byte gaps) lives in the Android transport, where the serial line is.
 *
 * Byte order and header layout follow ISO 9141-2 §6 and ISO 14230-2 §5.
 */
object KLine {
    /** External test equipment, i.e. us. ISO 14230-2 Table 3. */
    const val TESTER_ADDRESS = 0xF1

    /** Functional address of the emissions-related ECUs. */
    const val ECU_ADDRESS = 0x33

    /**
     * The address byte sent at 5 baud to wake the bus. Same value as
     * [ECU_ADDRESS]; named separately because it plays a different role.
     */
    const val INIT_ADDRESS = 0x33

    /** The ECU answers the wake-up with this before anything else. */
    const val SYNC_BYTE = 0x55

    private const val ISO9141_REQUEST_FORMAT = 0x68
    private const val ISO9141_REQUEST_TARGET = 0x6A
    private const val ISO9141_RESPONSE_FORMAT = 0x48
    private const val ISO9141_RESPONSE_TARGET = 0x6B

    /** Minimum frame: three header bytes, at least one data byte, checksum. */
    private const val MIN_FRAME_LENGTH = 5

    enum class Framing {
        /** Fixed `68 6A F1` header, length not encoded anywhere. */
        ISO9141,

        /** `C0|len, target, source` — the length rides in the format byte. */
        KWP2000,
    }

    /** Sum of [bytes] from [from] until [toExclusive], truncated to one byte. */
    fun checksum(bytes: ByteArray, from: Int = 0, toExclusive: Int = bytes.size): Int {
        var sum = 0
        for (index in from until toExclusive) sum += bytes[index].toInt() and 0xFF
        return sum and 0xFF
    }

    /**
     * Wraps [data] (a service request such as `01 0C`) in a header and checksum.
     *
     * KWP2000 puts the payload length in the low six bits of the format byte,
     * which caps a single frame at 63 data bytes — far more than any request
     * this app makes.
     */
    fun request(data: ByteArray, framing: Framing): ByteArray {
        require(data.isNotEmpty()) { "A request needs at least one data byte" }
        require(data.size <= 63) { "A K-Line frame carries at most 63 data bytes" }

        val header = when (framing) {
            Framing.ISO9141 -> byteArrayOf(
                ISO9141_REQUEST_FORMAT.toByte(),
                ISO9141_REQUEST_TARGET.toByte(),
                TESTER_ADDRESS.toByte(),
            )
            Framing.KWP2000 -> byteArrayOf(
                (0xC0 or data.size).toByte(),
                ECU_ADDRESS.toByte(),
                TESTER_ADDRESS.toByte(),
            )
        }

        val frame = ByteArray(header.size + data.size + 1)
        header.copyInto(frame)
        data.copyInto(frame, header.size)
        frame[frame.size - 1] = checksum(frame, 0, frame.size - 1).toByte()
        return frame
    }

    /** One decoded reply. [source] is the ECU that sent it. */
    data class Message(val source: Int, val data: ByteArray) {
        /** Data bytes as the uppercase hex the [ObdProtocol] decoders expect. */
        fun toHex(): String = data.joinToString(" ") { "%02X".format(it.toInt() and 0xFF) }

        // ByteArray gives identity equality, which makes these useless in tests
        // and in any set or map. Compare by content instead.
        override fun equals(other: Any?): Boolean =
            this === other ||
                (other is Message && source == other.source && data.contentEquals(other.data))

        override fun hashCode(): Int = 31 * source + data.contentHashCode()
    }

    /**
     * Splits a raw read buffer into messages.
     *
     * Several ECUs may answer the same functional request, so the buffer can
     * hold more than one frame. KWP2000 states each frame's length up front and
     * is therefore unambiguous. ISO 9141-2 does not, so frames are split on the
     * `48 6B` header pattern and each candidate is only accepted if its
     * checksum agrees — a frame whose payload happens to contain `48 6B` would
     * be mis-split, but the checksum turns that into a reported error rather
     * than silently wrong readings.
     *
     * Bytes that belong to no valid frame are skipped: the line echoes our own
     * request back on a single-wire bus, and noise around the wake-up is normal.
     */
    fun parseResponses(raw: ByteArray, framing: Framing): List<Message> {
        val messages = mutableListOf<Message>()
        var index = 0

        while (index + MIN_FRAME_LENGTH <= raw.size) {
            val frameLength = frameLengthAt(raw, index, framing)
            if (frameLength == null) {
                index++
                continue
            }

            val end = index + frameLength
            val expected = checksum(raw, index, end - 1)
            val actual = raw[end - 1].toInt() and 0xFF
            if (expected != actual) {
                index++
                continue
            }

            messages += Message(
                source = raw[index + 2].toInt() and 0xFF,
                data = raw.copyOfRange(index + 3, end - 1),
            )
            index = end
        }

        return messages
    }

    /** Total frame length of a response starting at [start], or null if none does. */
    private fun frameLengthAt(raw: ByteArray, start: Int, framing: Framing): Int? {
        val format = raw[start].toInt() and 0xFF

        return when (framing) {
            Framing.ISO9141 -> {
                if (format != ISO9141_RESPONSE_FORMAT) return null
                if ((raw[start + 1].toInt() and 0xFF) != ISO9141_RESPONSE_TARGET) return null
                // No length field: run to the next header, or to the end.
                val next = nextIso9141Header(raw, start + 1)
                (next ?: raw.size) - start
            }
            Framing.KWP2000 -> {
                val length = format and 0x3F
                if (format and 0xC0 != 0xC0 || length == 0) return null
                val total = 3 + length + 1
                if (start + total > raw.size) return null
                total
            }
        }
    }

    private fun nextIso9141Header(raw: ByteArray, from: Int): Int? {
        for (index in from until raw.size - 1) {
            if ((raw[index].toInt() and 0xFF) == ISO9141_RESPONSE_FORMAT &&
                (raw[index + 1].toInt() and 0xFF) == ISO9141_RESPONSE_TARGET
            ) {
                return index
            }
        }
        return null
    }

    /**
     * The bit pattern to drive onto the line for the 5-baud wake-up, starting
     * with the start bit and ending with the stop bit.
     *
     * `true` means the line is idle-high, `false` means pulled low. Data bits go
     * out least-significant first (ISO 9141-2 §5.2.4.1). Each entry lasts 200 ms,
     * so the whole sequence takes two seconds — which is why this cannot be done
     * by just setting the UART to 5 baud: no common USB bridge goes that low.
     */
    fun slowInitBits(address: Int = INIT_ADDRESS): List<Boolean> {
        val bits = mutableListOf(false) // start bit
        for (position in 0 until 8) bits += (address shr position) and 1 == 1
        bits += true // stop bit
        return bits
    }

    /**
     * Checks the ECU's answer to the wake-up and returns the byte we owe it back.
     *
     * After the address goes out the ECU sends `55 KB1 KB2`; the tester replies
     * with KB2 inverted, and the ECU closes the handshake by echoing the address
     * inverted. Returns null when the sequence does not match, which is the
     * normal outcome on a car that does not speak this protocol.
     */
    fun keyByteHandshake(sync: Int, keyByte2: Int): Int? {
        if (sync != SYNC_BYTE) return null
        return keyByte2.inv() and 0xFF
    }

    /** The address echo that ends a successful wake-up. */
    fun expectedAddressEcho(address: Int = INIT_ADDRESS): Int = address.inv() and 0xFF
}
