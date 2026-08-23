package com.autoki.diagnostik.data.report

import com.autoki.diagnostik.data.network.DiagnosticDto
import com.autoki.diagnostik.data.network.ErrorCodeDto
import com.autoki.diagnostik.data.network.ObdParameterDto
import com.autoki.diagnostik.data.network.VehicleDto

/**
 * Same CSV shape as client/src/lib/report.ts's buildReportCsv, so a report
 * exported from the phone looks identical to one exported from the web app.
 */
object ReportCsv {

    private fun cell(value: Any?): String {
        val text = value?.toString() ?: ""
        return if (Regex("[\",;\\n\\r]").containsMatchIn(text)) {
            "\"${text.replace("\"", "\"\"")}\""
        } else {
            text
        }
    }

    private fun row(vararg values: Any?): String = values.joinToString(";") { cell(it) }

    fun build(
        vehicle: VehicleDto?,
        diagnostic: DiagnosticDto,
        parameters: List<ObdParameterDto>,
        errorCodes: List<ErrorCodeDto>,
    ): String {
        val lines = mutableListOf<String>()

        lines += "AutoKI Assistent — Diagnosebericht"
        lines += ""
        lines += row("Fahrzeug", vehicle?.let { "${it.make} ${it.model} (${it.year})" } ?: "—")
        lines += row("VIN", vehicle?.vin ?: "—")
        lines += row("Kennzeichen", vehicle?.licensePlate ?: "—")
        lines += row("Diagnose-ID", diagnostic.id)
        lines += row("Status", diagnostic.status)
        lines += row("Gestartet", diagnostic.startedAt ?: "—")
        lines += row("Abgeschlossen", diagnostic.completedAt ?: "—")
        lines += row("Fehler", diagnostic.errorCount)
        lines += row("Warnungen", diagnostic.warningCount)

        lines += ""
        lines += "OBD-Parameter"
        lines += row("PID", "Bezeichnung", "Wert", "Einheit", "Im Normbereich", "Simuliert")
        for (parameter in parameters) {
            lines += row(
                parameter.parameterId,
                parameter.parameterName,
                parameter.value,
                parameter.unit ?: "",
                if (parameter.isNormal) "ja" else "nein",
                if (parameter.isSimulated) "ja" else "nein",
            )
        }

        lines += ""
        lines += "Fehlercodes"
        lines += row("Code", "Beschreibung", "Schweregrad", "System")
        if (errorCodes.isEmpty()) {
            lines += cell("Keine Fehlercodes gefunden")
        } else {
            for (code in errorCodes) {
                lines += row(code.code, code.description ?: "", code.severity, code.system ?: "")
            }
        }

        return lines.joinToString("\r\n")
    }
}
