package com.autoki.diagnostik.data.obd

import com.autoki.diagnostik.core.CountByteMode
import com.autoki.diagnostik.core.DecodedDtc
import com.autoki.diagnostik.core.ObdProtocol
import com.autoki.diagnostik.core.ObdProtocolError
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout

/**
 * The ELM327 command dialogue, over whatever [ObdLink] it is handed.
 *
 * A port of server/obd/obdManager.ts: same init sequence, same
 * one-command-in-flight model — an ELM327 has no request ids, so a second
 * command sent before the first is answered would corrupt both — and the same
 * ">" prompt framing.
 */
/** No answer to the very first command, i.e. this is probably not an ELM327. */
class ElmUnresponsiveException(message: String) : ObdTransportException(message)

class Elm327Adapter(
    link: ObdLink,
    private val countByte: CountByteMode,
) : ObdAdapter(link) {

    override val type: ObdAdapterType
        get() = if (countByte == CountByteMode.PRESENT) ObdAdapterType.ELM327_CAN else ObdAdapterType.ELM327

    private val commandLock = Mutex()

    override suspend fun initialize() {
        val commands = listOf(
            "ATZ" to RESET_TIMEOUT_MS, // reset
            "ATE0" to DEFAULT_TIMEOUT_MS, // echo off
            "ATL0" to DEFAULT_TIMEOUT_MS, // linefeeds off
            "ATS0" to DEFAULT_TIMEOUT_MS, // spaces off
            "ATH0" to DEFAULT_TIMEOUT_MS, // headers off — the decoders do not need them
            "ATST32" to DEFAULT_TIMEOUT_MS, // ~200 ms adapter timeout
            (if (countByte == CountByteMode.PRESENT) "ATSP6" else "ATSP0") to DEFAULT_TIMEOUT_MS,
        )
        for ((command, timeoutMs) in commands) {
            val response = try {
                sendCommand(command, timeoutMs)
            } catch (error: ObdTransportException) {
                // Silence on the very first command usually means this is not an
                // ELM327 at all — a bare K+DCAN cable has no idea what ATZ is —
                // and "timeout" alone sends people looking at the wrong things.
                if (command == "ATZ") {
                    throw ElmUnresponsiveException(
                        "Der Adapter antwortet nicht auf ELM327-Befehle. Falls es ein " +
                            "K+DCAN-Kabel ist: unter \u201eArt des Adapters\u201c " +
                            "K-Line auswählen. Sonst Zündung und Steckverbindung prüfen."
                    )
                }
                throw error
            }
            if (response.trimStart().startsWith("?")) {
                throw ObdTransportException("Adapter hat Initialisierungsbefehl $command abgelehnt")
            }
        }
    }

    /** Queues one command and waits for the adapter's reply, up to the ">" prompt. */
    suspend fun sendCommand(command: String, timeoutMs: Long = DEFAULT_TIMEOUT_MS): String =
        commandLock.withLock {
            withContext(Dispatchers.IO) {
                try {
                    link.write("$command\r".toByteArray(Charsets.US_ASCII))
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
            val count = link.read(buffer, READ_SLICE_MS)
            if (count > 0) {
                received.append(String(buffer, 0, count, Charsets.US_ASCII))
                val promptIndex = received.indexOf(">")
                if (promptIndex >= 0) {
                    return@withTimeout received.substring(0, promptIndex)
                }
            } else {
                delay(15)
            }
        }
        @Suppress("UNREACHABLE_CODE")
        received.toString()
    }

    override suspend fun requestParameter(pid: String): ObdReading? {
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

    override suspend fun readErrorCodes(): List<DecodedDtc> =
        ObdProtocol.decodeMode03Response(sendCommand("03"), countByte)

    override suspend fun clearErrorCodes(): Boolean =
        sendCommand("04").replace(Regex("\\s"), "").contains("44")

    companion object {
        private const val DEFAULT_TIMEOUT_MS = 5000L
        private const val RESET_TIMEOUT_MS = 10000L

        /** How long one read may block before the loop re-checks the overall timeout. */
        private const val READ_SLICE_MS = 100
    }
}
