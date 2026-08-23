package com.autoki.diagnostik.data.obd

import android.annotation.SuppressLint
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothSocket
import android.content.Context
import com.autoki.diagnostik.core.CountByteMode
import com.autoki.diagnostik.core.DecodedDtc
import com.autoki.diagnostik.core.ObdProtocol
import com.autoki.diagnostik.core.ObdProtocolError
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout
import java.io.IOException
import java.util.UUID

enum class ObdDeviceType { ELM327, DCAN }

class ObdTransportException(message: String) : IOException(message)

data class ObdReading(
    val pid: String,
    val name: String,
    val value: Double,
    val unit: String,
    val isNormal: Boolean,
)

/**
 * Bluetooth Classic (SPP) transport to an ELM327 or D-CAN adapter, and the
 * ELM327 AT command choreography around it.
 *
 * This is a port of server/obd/obdManager.ts to run directly against a phone's
 * Bluetooth radio instead of a server-side serial port: same init sequence,
 * same one-command-in-flight-at-a-time model (an ELM327 has no request ids),
 * same ">" prompt framing. Decoding is shared with the backend via the
 * `:core` module.
 */
class BluetoothObdTransport private constructor(
    private val socket: BluetoothSocket,
    private val countByte: CountByteMode,
) {
    private val input = socket.inputStream
    private val output = socket.outputStream
    private val commandLock = Mutex()

    /** Runs the ELM327 setup sequence; throws [ObdTransportException] if the adapter rejects a command. */
    suspend fun initialize() {
        val commands = listOf(
            "ATZ" to RESET_TIMEOUT_MS, // reset
            "ATE0" to DEFAULT_TIMEOUT_MS, // echo off
            "ATL0" to DEFAULT_TIMEOUT_MS, // linefeeds off
            "ATS0" to DEFAULT_TIMEOUT_MS, // spaces off
            "ATH0" to DEFAULT_TIMEOUT_MS, // headers off
            "ATST32" to DEFAULT_TIMEOUT_MS, // ~200ms adapter timeout
            (if (countByte == CountByteMode.PRESENT) "ATSP6" else "ATSP0") to DEFAULT_TIMEOUT_MS,
        )
        for ((command, timeoutMs) in commands) {
            val response = sendCommand(command, timeoutMs)
            if (response.trimStart().startsWith("?")) {
                throw ObdTransportException("Adapter hat Initialisierungsbefehl $command abgelehnt")
            }
        }
    }

    /** Queues one command and waits for the adapter's reply (up to the ">" prompt). */
    suspend fun sendCommand(command: String, timeoutMs: Long = DEFAULT_TIMEOUT_MS): String = commandLock.withLock {
        withContext(Dispatchers.IO) {
            try {
                output.write("$command\r".toByteArray(Charsets.US_ASCII))
                output.flush()
                readUntilPrompt(timeoutMs)
            } catch (timeout: TimeoutCancellationException) {
                throw ObdTransportException("Zeitüberschreitung nach ${timeoutMs}ms bei \"$command\"")
            }
        }
    }

    private suspend fun readUntilPrompt(timeoutMs: Long): String = withTimeout(timeoutMs) {
        val received = StringBuilder()
        val buffer = ByteArray(1024)
        while (true) {
            if (input.available() > 0) {
                val count = input.read(buffer)
                if (count > 0) {
                    received.append(String(buffer, 0, count, Charsets.US_ASCII))
                    val promptIndex = received.indexOf(">")
                    if (promptIndex >= 0) {
                        return@withTimeout received.substring(0, promptIndex)
                    }
                }
            } else {
                delay(15)
            }
        }
        @Suppress("UNREACHABLE_CODE")
        received.toString()
    }

    /** Reads a single Mode 01 PID, or null when the ECU has nothing to report for it. */
    suspend fun requestParameter(pid: String): ObdReading? {
        val definition = ObdProtocol.getPidDefinition(pid) ?: throw ObdProtocolError("Unsupported PID $pid")
        val response = sendCommand("01${definition.pid}")
        val value = ObdProtocol.decodeMode01Response(definition.pid, response) ?: return null
        return ObdReading(
            pid = definition.pid,
            name = definition.name,
            value = value,
            unit = definition.unit,
            isNormal = ObdProtocol.isNormalReading(definition, value),
        )
    }

    /** Polls [pids] on a fixed interval until the collecting coroutine is cancelled. */
    fun liveReadings(pids: List<String> = ObdProtocol.DEFAULT_SCAN_PIDS, intervalMs: Long = 1000): Flow<ObdReading> =
        flow {
            while (true) {
                for (pid in pids) {
                    val reading = runCatching { requestParameter(pid) }.getOrNull()
                    if (reading != null) emit(reading)
                }
                delay(intervalMs)
            }
        }.flowOn(Dispatchers.IO)

    /** Read stored diagnostic trouble codes (Mode 03). */
    suspend fun readErrorCodes(): List<DecodedDtc> {
        val response = sendCommand("03")
        return ObdProtocol.decodeMode03Response(response, countByte)
    }

    /**
     * Clear stored trouble codes (Mode 04). This also erases freeze-frame data and
     * resets readiness monitors — callers must confirm with the user first.
     */
    suspend fun clearErrorCodes(): Boolean {
        val response = sendCommand("04")
        return response.replace(Regex("\\s"), "").contains("44")
    }

    fun close() {
        runCatching { socket.close() }
    }

    companion object {
        private val SPP_UUID: UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB")
        private const val DEFAULT_TIMEOUT_MS = 5000L
        private const val RESET_TIMEOUT_MS = 10000L

        /**
         * Opens an RFCOMM socket to an already-bonded device and runs the ELM327 init
         * sequence. The device must be paired beforehand in Android's Bluetooth
         * settings — this app only connects to bonded devices, so it never needs the
         * scan/location permissions a live discovery would require.
         */
        @SuppressLint("MissingPermission") // caller has already checked BLUETOOTH_CONNECT
        suspend fun connect(
            context: Context,
            device: BluetoothDevice,
            deviceType: ObdDeviceType,
        ): BluetoothObdTransport =
            withContext(Dispatchers.IO) {
                val adapter = (context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager)?.adapter
                adapter?.cancelDiscovery()
                val socket = device.createRfcommSocketToServiceRecord(SPP_UUID)
                try {
                    socket.connect()
                } catch (error: IOException) {
                    runCatching { socket.close() }
                    throw ObdTransportException(
                        "Verbindung zu ${device.name ?: device.address} fehlgeschlagen: ${error.message}"
                    )
                }
                val countByte = if (deviceType == ObdDeviceType.DCAN) CountByteMode.PRESENT else CountByteMode.AUTO
                val transport = BluetoothObdTransport(socket, countByte)
                try {
                    transport.initialize()
                } catch (error: Exception) {
                    transport.close()
                    throw error
                }
                transport
            }
    }
}
