package com.autoki.diagnostik.data.obd

import android.util.Log
import com.autoki.diagnostik.core.CountByteMode
import com.autoki.diagnostik.core.DecodedDtc
import com.autoki.diagnostik.core.KLine
import com.autoki.diagnostik.core.ObdProtocol
import com.autoki.diagnostik.core.ObdProtocolError
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext

/**
 * Talks OBD-II over a bare K-Line cable — a BMW K+DCAN and its relatives.
 *
 * Such a cable is an FTDI chip on a wire with no firmware, so everything an
 * ELM327 does in hardware happens here: waking the bus by driving the transmit
 * line at five bits per second, the key-byte handshake, message headers,
 * checksums, and the inter-message gaps the standard demands.
 *
 * Timing is the fragile part and the reason this cannot be verified away from a
 * car. Every step logs under the tag [LOG_TAG] with the raw bytes, so a failed
 * wake-up can be read back from `adb logcat` rather than guessed at.
 *
 * References: ISO 9141-2 §5.2 (initialisation) and ISO 14230-2 (message format).
 */
class KLineAdapter(
    link: ObdLink,
    /** Overridden by what the ECU reports during the handshake. */
    private var framing: KLine.Framing = KLine.Framing.ISO9141,
) : ObdAdapter(link) {

    override val type: ObdAdapterType get() = ObdAdapterType.KLINE

    private val requestLock = Mutex()
    private var lastExchangeAt = 0L

    /**
     * Bytes already read from the link but not yet consumed.
     *
     * The handshake is read one byte at a time while a single USB packet can
     * carry several, so what a read returns beyond the byte being waited for
     * has to be kept — dropping it would lose a key byte.
     */
    private val pending = ArrayDeque<Byte>()

    init {
        require(link.supportsLineControl) {
            "Ein K-Line-Kabel braucht eine serielle Verbindung — über Bluetooth ist der 5-Baud-Anschlag nicht möglich"
        }
    }

    override suspend fun initialize() = withContext(Dispatchers.IO) {
        link.setBaudRate(UsbObdLink.K_LINE_BAUD_RATE)
        link.setBreak(false)
        pending.clear()
        link.flushInput()

        // The bus must be quiet before the address goes out (ISO 9141-2, W5).
        Thread.sleep(BUS_IDLE_MS)

        sendSlowInitAddress()

        val sync = readByte(W1_MAX_MS)
            ?: throw ObdTransportException(
                "Keine Antwort auf den 5-Baud-Anschlag. Zündung an? Kabel richtig in der OBD-Buchse?"
            )
        val keyByte1 = readByte(W2_MAX_MS)
            ?: throw ObdTransportException("Steuergerät hat den Anschlag begonnen, aber nicht beendet (kein Schlüsselbyte 1)")
        val keyByte2 = readByte(W3_MAX_MS)
            ?: throw ObdTransportException("Steuergerät hat den Anschlag begonnen, aber nicht beendet (kein Schlüsselbyte 2)")

        Log.i(LOG_TAG, "Anschlag beantwortet: sync=%02X kb1=%02X kb2=%02X".format(sync, keyByte1, keyByte2))

        val answer = KLine.keyByteHandshake(sync, keyByte2)
            ?: throw ObdTransportException(
                "Unerwartete Antwort auf den Anschlag (%02X statt 55) — dieses Fahrzeug spricht vermutlich kein K-Line".format(sync)
            )

        framing = framingFor(keyByte1, keyByte2)
        Log.i(LOG_TAG, "Rahmenformat: $framing")

        Thread.sleep(W4_MS)
        link.write(byteArrayOf(answer.toByte()))

        val echo = readByte(W4_MAX_MS)
        val expected = KLine.expectedAddressEcho()
        if (echo != null && echo != expected) {
            Log.w(LOG_TAG, "Adress-Echo %02X, erwartet %02X — wird toleriert".format(echo, expected))
        }

        lastExchangeAt = System.currentTimeMillis()
        link.flushInput()
    }

    /**
     * Drives the wake-up address onto the line by hand.
     *
     * No common USB bridge can be set to five baud — an FT232R bottoms out
     * around 183 — so the bits are produced by holding the break state for
     * 200 ms each. The deadline is advanced from a fixed origin so the time
     * each [ObdLink.setBreak] call takes does not accumulate into drift.
     */
    private fun sendSlowInitAddress() {
        val bits = KLine.slowInitBits()
        var deadline = System.nanoTime()
        for (bit in bits) {
            // A break holds the line low, which is the logical zero.
            link.setBreak(!bit)
            deadline += BIT_DURATION_NANOS
            sleepUntil(deadline)
        }
        link.setBreak(false)
    }

    private fun sleepUntil(deadlineNanos: Long) {
        val remaining = deadlineNanos - System.nanoTime()
        if (remaining <= 0) return
        Thread.sleep(remaining / 1_000_000, (remaining % 1_000_000).toInt())
    }

    /**
     * ISO 9141-2 and KWP2000 are distinguished by what the ECU reports.
     *
     * 0x8F in the first key byte is the KWP2000 marker; 0x08 and 0x94 are the
     * two values ISO 9141-2 allows. Anything else is logged and treated as
     * ISO 9141-2, which is what a 2002-era vehicle almost certainly speaks.
     */
    private fun framingFor(keyByte1: Int, keyByte2: Int): KLine.Framing = when {
        keyByte1 == 0x8F -> KLine.Framing.KWP2000
        keyByte2 == 0x08 || keyByte2 == 0x94 -> KLine.Framing.ISO9141
        else -> {
            Log.w(LOG_TAG, "Unbekannte Schlüsselbytes %02X %02X — nehme ISO 9141-2 an".format(keyByte1, keyByte2))
            KLine.Framing.ISO9141
        }
    }

    /** Sends one service request and returns every ECU reply to it. */
    private suspend fun request(data: ByteArray): List<KLine.Message> = requestLock.withLock {
        withContext(Dispatchers.IO) {
            // P3: the bus needs a gap after the previous exchange.
            val sinceLast = System.currentTimeMillis() - lastExchangeAt
            if (sinceLast < P3_MIN_MS) Thread.sleep(P3_MIN_MS - sinceLast)

            pending.clear()
            link.flushInput()
            val frame = KLine.request(data, framing)
            Log.d(LOG_TAG, "-> ${frame.toHex()}")
            link.write(frame)

            val raw = readUntilQuiet(RESPONSE_TIMEOUT_MS)
            lastExchangeAt = System.currentTimeMillis()
            Log.d(LOG_TAG, "<- ${raw.toHex()}")

            if (raw.isEmpty()) {
                throw ObdTransportException("Keine Antwort vom Steuergerät auf ${data.toHex()}")
            }
            KLine.parseResponses(raw, framing)
        }
    }

    /**
     * Reads until the line has been quiet for [QUIET_MS].
     *
     * K-Line carries no end-of-message marker, so a gap is the only signal that
     * every ECU has finished answering.
     */
    private fun readUntilQuiet(overallTimeoutMs: Long): ByteArray {
        val collected = ArrayList<Byte>()
        while (pending.isNotEmpty()) collected += pending.removeFirst()

        val buffer = ByteArray(READ_BUFFER_SIZE)
        val deadline = System.currentTimeMillis() + overallTimeoutMs
        var lastByteAt = if (collected.isEmpty()) 0L else System.currentTimeMillis()

        while (System.currentTimeMillis() < deadline) {
            val count = link.read(buffer, READ_SLICE_MS)
            if (count > 0) {
                for (index in 0 until count) collected += buffer[index]
                lastByteAt = System.currentTimeMillis()
            } else if (lastByteAt != 0L && System.currentTimeMillis() - lastByteAt >= QUIET_MS) {
                break
            }
        }
        return collected.toByteArray()
    }

    /** Reads a single byte, or null when none arrives within [timeoutMs]. */
    private fun readByte(timeoutMs: Long): Int? {
        if (pending.isNotEmpty()) return pending.removeFirst().toInt() and 0xFF

        val buffer = ByteArray(READ_BUFFER_SIZE)
        val deadline = System.currentTimeMillis() + timeoutMs
        while (System.currentTimeMillis() < deadline) {
            val count = link.read(buffer, READ_SLICE_MS)
            if (count > 0) {
                for (index in 1 until count) pending.addLast(buffer[index])
                return buffer[0].toInt() and 0xFF
            }
        }
        return null
    }

    override suspend fun requestParameter(pid: String): ObdReading? {
        val definition = ObdProtocol.getPidDefinition(pid) ?: throw ObdProtocolError("Unsupported PID $pid")
        val pidByte = definition.pid.toInt(16)
        val replies = runCatching { request(byteArrayOf(0x01, pidByte.toByte())) }.getOrNull() ?: return null

        // Several ECUs may answer; the first positive reply for this PID wins.
        val payload = replies.firstOrNull { message ->
            message.data.size >= 2 &&
                (message.data[0].toInt() and 0xFF) == 0x41 &&
                (message.data[1].toInt() and 0xFF) == pidByte
        } ?: return null

        val value = ObdProtocol.decodeMode01Response(definition.pid, payload.toHex()) ?: return null
        return ObdReading(
            pid = definition.pid,
            name = definition.name,
            value = value,
            unit = definition.unit,
            isNormal = ObdProtocol.isNormalReading(definition, value),
        )
    }

    override suspend fun readErrorCodes(): List<DecodedDtc> {
        val replies = request(byteArrayOf(0x03))
        // K-Line Mode 03 has no count byte — that is a CAN-only field — and each
        // ECU answers separately, so the payloads are decoded and then merged.
        return replies
            .filter { it.data.isNotEmpty() && (it.data[0].toInt() and 0xFF) == 0x43 }
            .flatMap { ObdProtocol.decodeMode03Response(it.toHex(), CountByteMode.ABSENT) }
            .distinctBy { it.code }
    }

    override suspend fun clearErrorCodes(): Boolean {
        val replies = request(byteArrayOf(0x04))
        return replies.any { it.data.isNotEmpty() && (it.data[0].toInt() and 0xFF) == 0x44 }
    }

    private companion object {
        const val LOG_TAG = "AutoKI-KLine"

        /** Five baud: one bit every 200 ms. */
        const val BIT_DURATION_NANOS = 200_000_000L

        const val BUS_IDLE_MS = 350L // W5
        const val W1_MAX_MS = 400L // sync byte after the address
        const val W2_MAX_MS = 100L // key byte 1
        const val W3_MAX_MS = 100L // key byte 2
        const val W4_MS = 30L // pause before our answer
        const val W4_MAX_MS = 100L // address echo
        const val P3_MIN_MS = 60L // gap between exchanges
        const val RESPONSE_TIMEOUT_MS = 1500L
        const val QUIET_MS = 80L // line idle => every ECU has finished
        const val READ_SLICE_MS = 20

        /**
         * An FTDI bridge prefixes every USB packet with two status bytes and
         * rejects a destination buffer that cannot hold them plus data, so no
         * read may be issued with fewer than three bytes of room.
         */
        const val READ_BUFFER_SIZE = 256
    }
}

private fun ByteArray.toHex(): String = joinToString(" ") { "%02X".format(it.toInt() and 0xFF) }
