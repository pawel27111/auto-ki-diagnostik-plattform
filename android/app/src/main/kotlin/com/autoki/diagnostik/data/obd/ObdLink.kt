package com.autoki.diagnostik.data.obd

import java.io.IOException

open class ObdTransportException(message: String) : IOException(message)

/**
 * A raw byte pipe to an adapter.
 *
 * Bluetooth and USB differ only in how bytes get to the plug, so everything
 * above this interface — the ELM327 command dialogue, the K-Line framing — is
 * written once and works on either.
 *
 * The line-control members are the exception: driving the baud rate and the
 * break state is meaningful on a serial line and impossible over Bluetooth
 * RFCOMM. A [KLineAdapter] needs them, which is why it refuses a link where
 * [supportsLineControl] is false rather than failing halfway through a wake-up.
 */
interface ObdLink {
    /** Shown to the user when a connection fails. */
    val description: String

    /**
     * Reads whatever has arrived, blocking at most [timeoutMs].
     * Returns the number of bytes placed in [buffer]; 0 means nothing came.
     *
     * A one-byte buffer is allowed but wasteful: USB bridges hand over whole
     * packets, so a caller reading byte by byte should keep what it did not
     * ask for rather than issue a read per byte.
     */
    fun read(buffer: ByteArray, timeoutMs: Int): Int

    fun write(bytes: ByteArray)

    fun close()

    /** Discards buffered input, so one exchange cannot bleed into the next. */
    fun flushInput()

    /** True when [setBaudRate] and [setBreak] actually do something. */
    val supportsLineControl: Boolean
        get() = false

    fun setBaudRate(baudRate: Int): Unit =
        throw ObdTransportException("Diese Verbindung erlaubt keine Baudraten-Einstellung")

    /** Holds the transmit line low while enabled — the basis of the 5-baud wake-up. */
    fun setBreak(enabled: Boolean): Unit =
        throw ObdTransportException("Diese Verbindung erlaubt keine Break-Steuerung")
}
