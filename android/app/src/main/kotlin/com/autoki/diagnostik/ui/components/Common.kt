package com.autoki.diagnostik.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.autoki.diagnostik.data.obd.ObdReading
import com.autoki.diagnostik.ui.theme.SeverityCritical
import com.autoki.diagnostik.ui.theme.SeverityError
import com.autoki.diagnostik.ui.theme.SeverityInfo
import com.autoki.diagnostik.ui.theme.SeverityWarning

fun severityColor(severity: String): Color = when (severity.lowercase()) {
    "critical" -> SeverityCritical
    "error" -> SeverityError
    "warning" -> SeverityWarning
    else -> SeverityInfo
}

fun severityLabelDe(severity: String): String = when (severity.lowercase()) {
    "critical" -> "Kritisch"
    "error" -> "Fehler"
    "warning" -> "Warnung"
    else -> "Info"
}

@Composable
fun SeverityChip(severity: String, modifier: Modifier = Modifier) {
    val color = severityColor(severity)
    Text(
        text = severityLabelDe(severity),
        color = Color.White,
        style = MaterialTheme.typography.labelMedium,
        modifier = modifier
            .background(color, RoundedCornerShape(50))
            .padding(horizontal = 10.dp, vertical = 4.dp),
    )
}

@Composable
fun ParameterCard(reading: ObdReading, modifier: Modifier = Modifier) {
    Card(
        modifier = modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = if (reading.isNormal) {
                MaterialTheme.colorScheme.surfaceVariant
            } else {
                MaterialTheme.colorScheme.errorContainer
            }
        ),
    ) {
        Column(
            modifier = Modifier.padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            Text(reading.name, style = MaterialTheme.typography.labelMedium)
            Text(
                text = "${formatValue(reading.value)} ${reading.unit}",
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Bold,
            )
        }
    }
}

fun formatValue(value: Double): String =
    if (value == value.toLong().toDouble()) {
        value.toLong().toString()
    } else {
        String.format(java.util.Locale.US, "%.2f", value)
    }
