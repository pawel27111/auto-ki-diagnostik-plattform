package com.autoki.diagnostik.core

/**
 * OBD-II protocol decoding.
 *
 * Pure functions only — no I/O, no device state, so it can run directly against
 * bytes read from a Bluetooth/USB ELM327 adapter on the phone. This is a
 * line-for-line port of the backend's server/obd/protocol.ts, kept in sync so a
 * reading decoded on the device matches what the server would compute for the
 * same bytes.
 *
 * Formulas follow SAE J1979 / the OBD-II PID tables.
 */

enum class Severity {
    INFO,
    WARNING,
    ERROR,
    CRITICAL;

    /** Wire value matching the backend's `errorCodes.severity` enum. */
    val wireValue: String
        get() = name.lowercase()
}

data class ValueRange(val min: Double, val max: Double)

data class PidDefinition(
    /** Mode 01 PID, two uppercase hex digits (e.g. "0C"). */
    val pid: String,
    val name: String,
    val unit: String,
    /** Number of data bytes the ECU returns for this PID. */
    val bytes: Int,
    /** Converts the raw data bytes into a physical value. */
    val decode: (List<Int>) -> Double,
    /** Inclusive range considered healthy; used to flag readings. */
    val normalRange: ValueRange? = null,
    /** Full scale for UI gauges. */
    val displayRange: ValueRange,
)

class ObdProtocolError(message: String) : Exception(message)

data class DecodedDtc(val code: String, val system: String)

/** How to treat the byte following `43` in a Mode 03 response. */
enum class CountByteMode {
    AUTO,
    PRESENT,
    ABSENT,
}

object ObdProtocol {

    /**
     * Supported Mode 01 PIDs. Keyed by the bare PID without the "01" mode prefix,
     * because that is what both the ELM327 request and the response echo use.
     */
    val PID_DEFINITIONS: Map<String, PidDefinition> = listOf(
        PidDefinition(
            pid = "04",
            name = "Calculated Engine Load",
            unit = "%",
            bytes = 1,
            decode = { (a) -> a * 100.0 / 255.0 },
            normalRange = ValueRange(0.0, 90.0),
            displayRange = ValueRange(0.0, 100.0),
        ),
        PidDefinition(
            pid = "05",
            name = "Engine Coolant Temperature",
            unit = "°C",
            bytes = 1,
            decode = { (a) -> a - 40.0 },
            normalRange = ValueRange(70.0, 105.0),
            displayRange = ValueRange(-40.0, 215.0),
        ),
        PidDefinition(
            pid = "0A",
            name = "Fuel Pressure",
            unit = "kPa",
            bytes = 1,
            decode = { (a) -> a * 3.0 },
            normalRange = ValueRange(200.0, 500.0),
            displayRange = ValueRange(0.0, 765.0),
        ),
        PidDefinition(
            pid = "0B",
            name = "Intake Manifold Absolute Pressure",
            unit = "kPa",
            bytes = 1,
            decode = { (a) -> a.toDouble() },
            normalRange = ValueRange(20.0, 105.0),
            displayRange = ValueRange(0.0, 255.0),
        ),
        PidDefinition(
            pid = "0C",
            name = "Engine RPM",
            unit = "rpm",
            bytes = 2,
            decode = { (a, b) -> (a * 256.0 + b) / 4.0 },
            normalRange = ValueRange(600.0, 4000.0),
            displayRange = ValueRange(0.0, 16383.0),
        ),
        PidDefinition(
            pid = "0D",
            name = "Vehicle Speed",
            unit = "km/h",
            bytes = 1,
            decode = { (a) -> a.toDouble() },
            normalRange = ValueRange(0.0, 200.0),
            displayRange = ValueRange(0.0, 255.0),
        ),
        PidDefinition(
            pid = "0E",
            name = "Timing Advance",
            unit = "°",
            bytes = 1,
            decode = { (a) -> a / 2.0 - 64.0 },
            normalRange = ValueRange(-10.0, 40.0),
            displayRange = ValueRange(-64.0, 63.5),
        ),
        PidDefinition(
            pid = "0F",
            name = "Intake Air Temperature",
            unit = "°C",
            bytes = 1,
            decode = { (a) -> a - 40.0 },
            normalRange = ValueRange(-10.0, 60.0),
            displayRange = ValueRange(-40.0, 215.0),
        ),
        PidDefinition(
            pid = "10",
            name = "MAF Air Flow Rate",
            unit = "g/s",
            bytes = 2,
            decode = { (a, b) -> (a * 256.0 + b) / 100.0 },
            normalRange = ValueRange(1.0, 150.0),
            displayRange = ValueRange(0.0, 655.35),
        ),
        PidDefinition(
            pid = "11",
            name = "Throttle Position",
            unit = "%",
            bytes = 1,
            decode = { (a) -> a * 100.0 / 255.0 },
            normalRange = ValueRange(0.0, 100.0),
            displayRange = ValueRange(0.0, 100.0),
        ),
        PidDefinition(
            pid = "14",
            name = "O2 Sensor (Bank 1, Sensor 1)",
            unit = "V",
            bytes = 2,
            // Byte B carries short term fuel trim and is intentionally ignored here.
            decode = { (a) -> a / 200.0 },
            normalRange = ValueRange(0.1, 0.9),
            displayRange = ValueRange(0.0, 1.275),
        ),
        PidDefinition(
            pid = "2F",
            name = "Fuel Tank Level",
            unit = "%",
            bytes = 1,
            decode = { (a) -> a * 100.0 / 255.0 },
            normalRange = ValueRange(10.0, 100.0),
            displayRange = ValueRange(0.0, 100.0),
        ),
        PidDefinition(
            pid = "42",
            name = "Control Module Voltage",
            unit = "V",
            bytes = 2,
            decode = { (a, b) -> (a * 256.0 + b) / 1000.0 },
            normalRange = ValueRange(12.0, 14.8),
            displayRange = ValueRange(0.0, 65.535),
        ),
        PidDefinition(
            pid = "5C",
            name = "Engine Oil Temperature",
            unit = "°C",
            bytes = 1,
            decode = { (a) -> a - 40.0 },
            normalRange = ValueRange(70.0, 120.0),
            displayRange = ValueRange(-40.0, 210.0),
        ),
    ).associateBy { it.pid }

    /** PIDs polled during a standard live scan, in request order. */
    val DEFAULT_SCAN_PIDS: List<String> = listOf("0C", "0D", "05", "0A", "14")

    fun getPidDefinition(pid: String): PidDefinition? = PID_DEFINITIONS[pid.uppercase()]

    fun isNormalReading(definition: PidDefinition, value: Double): Boolean {
        val range = definition.normalRange ?: return true
        return value >= range.min && value <= range.max
    }

    /** Round to at most 4 decimals — the precision the parameter column stores. */
    fun roundReading(value: Double): Double = Math.round(value * 10000.0) / 10000.0

    /**
     * Strip everything an ELM327 adds around the payload: the echoed command, the
     * "SEARCHING..." notice, CAN headers when ATH1 is on, whitespace and the ">"
     * prompt. Returns the remaining hex byte values.
     */
    fun extractHexBytes(response: String): List<Int> {
        val cleaned = response
            .replace(Regex("[\r\n]+"), " ")
            .replace(">", " ")
            .replace(Regex("SEARCHING\\.\\.\\.", RegexOption.IGNORE_CASE), " ")
            .trim()

        val bytes = mutableListOf<Int>()
        for (token in cleaned.split(Regex("\\s+"))) {
            if (token.isEmpty()) continue
            // ATS0 packs bytes together, so a token may hold several of them.
            if (!Regex("^[0-9A-Fa-f]+$").matches(token) || token.length % 2 != 0) continue
            var i = 0
            while (i < token.length) {
                bytes.add(token.substring(i, i + 2).toInt(16))
                i += 2
            }
        }
        return bytes
    }

    /** Responses an ELM327 returns instead of data. */
    private val ELM_ERROR_RESPONSES = listOf(
        "NO DATA",
        "UNABLE TO CONNECT",
        "BUS INIT",
        "BUS ERROR",
        "CAN ERROR",
        "DATA ERROR",
        "STOPPED",
        "ERROR",
        "?",
    )

    fun findElmError(response: String): String? {
        val upper = response.uppercase()
        return ELM_ERROR_RESPONSES.find { upper.contains(it) }
    }

    /**
     * Decode a Mode 01 response for `pid`.
     *
     * Locates the `41 <pid>` response header inside the byte stream, so it works
     * whether or not CAN headers are enabled, and returns null when the ECU had
     * nothing to report.
     */
    fun decodeMode01Response(pid: String, response: String): Double? {
        val elmError = findElmError(response)
        if (elmError != null) {
            throw ObdProtocolError("Adapter returned \"$elmError\" for PID $pid")
        }

        val definition = getPidDefinition(pid)
            ?: throw ObdProtocolError("Unsupported PID $pid")

        val bytes = extractHexBytes(response)
        val pidValue = pid.toInt(16)

        for (i in 0 until bytes.size - 1) {
            if (bytes[i] != 0x41 || bytes[i + 1] != pidValue) continue

            val end = minOf(i + 2 + definition.bytes, bytes.size)
            val payload = bytes.subList(i + 2, end)
            if (payload.size < definition.bytes) {
                throw ObdProtocolError(
                    "Truncated response for PID $pid: expected ${definition.bytes} data byte(s), got ${payload.size}"
                )
            }
            return roundReading(definition.decode(payload))
        }

        return null
    }

    private val DTC_LETTERS = listOf("P", "C", "B", "U")
    private val DTC_SYSTEMS = mapOf(
        "P" to "Powertrain",
        "C" to "Chassis",
        "B" to "Body",
        "U" to "Network",
    )

    /**
     * Decode a single two-byte DTC per SAE J2012.
     *
     * Bits 15-14 select the letter, bits 13-12 the first digit, the remaining
     * 12 bits are three hex digits.
     */
    fun decodeDtcBytes(a: Int, b: Int): DecodedDtc? {
        if (a == 0 && b == 0) return null // padding for an unused slot

        val letter = DTC_LETTERS[(a shr 6) and 0x03]
        val digit1 = (a shr 4) and 0x03
        val digit2 = (a and 0x0f).toString(16).uppercase()
        val digit3 = ((b shr 4) and 0x0f).toString(16).uppercase()
        val digit4 = (b and 0x0f).toString(16).uppercase()

        return DecodedDtc(
            code = "$letter$digit1$digit2$digit3$digit4",
            system = DTC_SYSTEMS.getValue(letter),
        )
    }

    /**
     * Decode a Mode 03 (stored DTC) response.
     *
     * [CountByteMode.AUTO] accepts the count reading when it exactly explains the
     * remaining payload (trailing zero padding allowed) and falls back to ABSENT
     * otherwise. Where both readings fit, CAN wins, because every OBD-II vehicle
     * built from 2008 on uses it. Pass PRESENT or ABSENT explicitly when the
     * negotiated protocol is known.
     */
    fun decodeMode03Response(
        response: String,
        countByte: CountByteMode = CountByteMode.AUTO,
    ): List<DecodedDtc> {
        val elmError = findElmError(response)
        if (elmError != null) {
            if (elmError == "NO DATA") return emptyList() // no stored codes is a valid answer
            throw ObdProtocolError("Adapter returned \"$elmError\" while reading DTCs")
        }

        val bytes = extractHexBytes(response)
        val start = bytes.indexOf(0x43)
        if (start == -1) return emptyList()

        var cursor = start + 1
        when (countByte) {
            CountByteMode.PRESENT -> cursor += 1
            CountByteMode.AUTO -> {
                val candidate = bytes.getOrNull(cursor)
                val payload = bytes.drop(cursor + 1)
                val declared = (candidate ?: 0) * 2
                val restIsPadding = payload.drop(declared).all { it == 0x00 }
                if (candidate != null && declared <= payload.size && restIsPadding) {
                    cursor += 1
                }
            }
            CountByteMode.ABSENT -> Unit
        }

        val codes = mutableListOf<DecodedDtc>()
        val seen = mutableSetOf<String>()
        var i = cursor
        while (i + 1 < bytes.size) {
            val decoded = decodeDtcBytes(bytes[i], bytes[i + 1])
            if (decoded != null && seen.add(decoded.code)) {
                codes.add(decoded)
            }
            i += 2
        }
        return codes
    }

    /**
     * Severity for a DTC without any LLM involvement.
     *
     * Deliberately conservative: it is the floor the UI can rely on when the LLM
     * is unavailable, not a diagnosis.
     */
    private val CRITICAL_CODES = setOf(
        "P0300", "P0301", "P0302", "P0303", "P0304", "P0606", "P0335",
    )
    private val ERROR_CODES = setOf("P0420", "P0430", "P0171", "P0172", "P0128")

    fun severityForCode(code: String): Severity {
        val normalized = code.uppercase()
        return when {
            CRITICAL_CODES.contains(normalized) -> Severity.CRITICAL
            ERROR_CODES.contains(normalized) -> Severity.ERROR
            normalized.startsWith("U") -> Severity.ERROR // network faults break other systems
            normalized.startsWith("B") -> Severity.INFO // body codes are rarely drivability issues
            else -> Severity.WARNING
        }
    }
}
