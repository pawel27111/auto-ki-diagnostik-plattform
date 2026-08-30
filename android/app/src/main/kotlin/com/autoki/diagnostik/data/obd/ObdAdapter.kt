package com.autoki.diagnostik.data.obd

import com.autoki.diagnostik.core.DecodedDtc
import com.autoki.diagnostik.core.ObdProtocol
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOn

/** How the adapter is attached. */
enum class ObdConnection { BLUETOOTH, USB }

/**
 * What kind of adapter is on the other end. This decides which dialogue is
 * spoken, not how the bytes travel — an ELM327 behaves the same over Bluetooth
 * and USB.
 */
enum class ObdAdapterType {
    /** ELM327 or clone, left to detect the vehicle's protocol itself. */
    ELM327,

    /** ELM327 pinned to 11-bit 500 kBit/s CAN, for D-CAN vehicles. */
    ELM327_CAN,

    /**
     * A bare K-Line cable — the BMW K+DCAN and its relatives. No firmware, so
     * the app drives the protocol. USB only: the wake-up needs the break line.
     */
    KLINE;

    val label: String
        get() = when (this) {
            ELM327 -> "ELM327 (Protokoll automatisch)"
            ELM327_CAN -> "ELM327, fest auf CAN 500 kBit/s"
            KLINE -> "K+DCAN-Kabel (K-Line, ohne ELM327)"
        }

    /** True for adapters that need the serial line driven directly. */
    val requiresLineControl: Boolean get() = this == KLINE
}

data class ObdReading(
    val pid: String,
    val name: String,
    val value: Double,
    val unit: String,
    val isNormal: Boolean,
)

/**
 * One diagnostic conversation with a vehicle.
 *
 * Subclasses differ only in how a request is put on the wire and how the reply
 * is unwrapped; the decoding of what comes back is shared with the backend
 * through the `:core` module, so a reading means the same thing whichever
 * adapter produced it.
 */
abstract class ObdAdapter(protected val link: ObdLink) {

    /** Brings the adapter and the vehicle to the point where requests are answered. */
    abstract suspend fun initialize()

    /** Reads one Mode 01 PID, or null when the ECU has nothing for it. */
    abstract suspend fun requestParameter(pid: String): ObdReading?

    /** Reads stored trouble codes (Mode 03). */
    abstract suspend fun readErrorCodes(): List<DecodedDtc>

    /**
     * Clears stored trouble codes (Mode 04). Also erases freeze-frame data and
     * resets readiness monitors, so callers must confirm with the user first.
     */
    abstract suspend fun clearErrorCodes(): Boolean

    /** Polls [pids] on a fixed interval until the collecting coroutine is cancelled. */
    fun liveReadings(
        pids: List<String> = ObdProtocol.DEFAULT_SCAN_PIDS,
        intervalMs: Long = 1000,
    ): Flow<ObdReading> = flow {
        while (true) {
            for (pid in pids) {
                val reading = runCatching { requestParameter(pid) }.getOrNull()
                if (reading != null) emit(reading)
            }
            delay(intervalMs)
        }
    }.flowOn(Dispatchers.IO)

    open fun close() {
        link.close()
    }
}
