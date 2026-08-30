package com.autoki.diagnostik.ui.screens

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.autoki.diagnostik.data.network.formatTimestamp
import com.autoki.diagnostik.data.obd.BluetoothDevices
import com.autoki.diagnostik.data.obd.ObdDeviceType
import com.autoki.diagnostik.data.report.ReportCsv
import com.autoki.diagnostik.ui.autoKiViewModel
import com.autoki.diagnostik.ui.components.ParameterCard
import com.autoki.diagnostik.ui.components.SeverityChip
import com.autoki.diagnostik.ui.components.formatValue
import com.autoki.diagnostik.ui.shareCsvReport
import com.autoki.diagnostik.ui.viewmodel.DiagnosticKind
import com.autoki.diagnostik.ui.viewmodel.DiagnosticUiState
import com.autoki.diagnostik.ui.viewmodel.DiagnosticViewModel

@Composable
fun DiagnosticScreen(vehicleId: Int, onBack: () -> Unit) {
    val viewModel = autoKiViewModel { DiagnosticViewModel(it, vehicleId) }
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val context = LocalContext.current

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Diagnose") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Zurück")
                    }
                },
            )
        },
    ) { padding ->
        Box(Modifier.fillMaxSize().padding(padding)) {
            when (val current = state) {
                is DiagnosticUiState.Setup -> SetupContent(current, viewModel)
                is DiagnosticUiState.Running -> RunningContent(current, viewModel)
                is DiagnosticUiState.Finished -> FinishedContent(
                    state = current,
                    viewModel = viewModel,
                    onExport = { csv -> shareCsvReport(context, current.diagnostic.id, csv) },
                )
                is DiagnosticUiState.Failed -> Box(Modifier.fillMaxSize().padding(24.dp), contentAlignment = Alignment.Center) {
                    Text("Fehler: ${current.message}", color = MaterialTheme.colorScheme.error)
                }
            }
        }
    }
}

@Composable
private fun SetupContent(state: DiagnosticUiState.Setup, viewModel: DiagnosticViewModel) {
    val context = LocalContext.current
    var hasPermission by remember {
        mutableStateOf(BluetoothDevices.hasConnectPermission(context))
    }
    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { granted -> hasPermission = granted }

    LaunchedEffect(hasPermission, state.useSimulation) {
        if (hasPermission && !state.useSimulation) {
            viewModel.loadPairedDevices(BluetoothDevices.bondedDevices(context))
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        state.vehicle?.let {
            Text("${it.make} ${it.model} (${it.year})", style = MaterialTheme.typography.titleMedium)
        }

        Text("Art der Diagnose", style = MaterialTheme.typography.labelLarge)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            DiagnosticKind.entries.forEach { kind ->
                FilterChip(
                    selected = state.kind == kind,
                    onClick = { viewModel.updateSetup { it.copy(kind = kind) } },
                    label = { Text(kind.label) },
                )
            }
        }

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Text("Simulation verwenden (ohne Hardware)")
            Switch(
                checked = state.useSimulation,
                onCheckedChange = { viewModel.updateSetup { s -> s.copy(useSimulation = it) } },
            )
        }

        if (!state.useSimulation) {
            Card(modifier = Modifier.fillMaxWidth()) {
                Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("OBD-Adapter (Bluetooth)", style = MaterialTheme.typography.labelLarge)
                    if (!hasPermission) {
                        Text("Bluetooth-Berechtigung erforderlich, um gekoppelte Geräte zu sehen.")
                        Button(onClick = {
                            BluetoothDevices.connectPermission()?.let { permissionLauncher.launch(it) }
                                ?: run { hasPermission = true }
                        }) {
                            Text("Berechtigung erteilen")
                        }
                    } else if (state.pairedDevices.isEmpty()) {
                        Text(
                            "Kein gekoppeltes Gerät gefunden. Adapter zuerst in den " +
                                "Bluetooth-Einstellungen des Telefons koppeln (PIN meist 1234 oder 0000).",
                        )
                    } else {
                        state.pairedDevices.forEach { device ->
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                modifier = Modifier.fillMaxWidth(),
                            ) {
                                RadioButton(
                                    selected = state.selectedDevice?.address == device.address,
                                    onClick = { viewModel.updateSetup { it.copy(selectedDevice = device) } },
                                )
                                Column {
                                    Text(device.name)
                                    Text(device.address, style = MaterialTheme.typography.bodySmall)
                                }
                            }
                        }
                    }

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        Text("D-CAN-Adapter (BMW/Mercedes/Audi)")
                        Switch(
                            checked = state.deviceType == ObdDeviceType.DCAN,
                            onCheckedChange = { checked ->
                                viewModel.updateSetup {
                                    it.copy(deviceType = if (checked) ObdDeviceType.DCAN else ObdDeviceType.ELM327)
                                }
                            },
                        )
                    }
                }
            }
        }

        state.error?.let { Text(it, color = MaterialTheme.colorScheme.error) }

        Button(
            onClick = viewModel::start,
            enabled = !state.starting,
            modifier = Modifier.fillMaxWidth(),
        ) {
            if (state.starting) {
                CircularProgressIndicator(modifier = Modifier.padding(end = 8.dp))
            }
            Text("Diagnose starten")
        }
    }
}

@Composable
private fun RunningContent(state: DiagnosticUiState.Running, viewModel: DiagnosticViewModel) {
    var showClearConfirm by remember { mutableStateOf(false) }

    if (showClearConfirm) {
        AlertDialog(
            onDismissRequest = { showClearConfirm = false },
            title = { Text("Fehlerspeicher löschen?") },
            text = {
                Text(
                    "Das löscht neben den Fehlercodes auch Freeze-Frame-Daten und setzt die " +
                        "Readiness-Monitore zurück, die für die Abgasuntersuchung benötigt werden. " +
                        "Dieser Vorgang ist nicht umkehrbar.",
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    showClearConfirm = false
                    viewModel.clearErrorCodesConfirmed()
                }) { Text("Löschen") }
            },
            dismissButton = {
                TextButton(onClick = { showClearConfirm = false }) { Text("Abbrechen") }
            },
        )
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            state.statusMessage?.let { Text(it, style = MaterialTheme.typography.bodyMedium) }
        }
        if (state.readings.isNotEmpty()) {
            // Laid out as plain Rows rather than a LazyVerticalGrid: a lazy grid
            // inside a LazyColumn item is measured with an infinite height
            // constraint and throws. The reading count is bounded by the PID
            // catalogue anyway, so there is nothing to virtualise.
            items(
                state.readings.values.sortedBy { it.pid }.chunked(2),
                key = { row -> "reading-${row.first().pid}" },
            ) { row ->
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    for (reading in row) {
                        ParameterCard(reading, modifier = Modifier.weight(1f))
                    }
                    // Keep a trailing single card at half width instead of
                    // stretching it across the row.
                    if (row.size == 1) Spacer(Modifier.weight(1f))
                }
            }
        } else if (state.simulated.not()) {
            item {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    CircularProgressIndicator(modifier = Modifier.padding(end = 8.dp))
                    Text("Warte auf Messwerte…")
                }
            }
        }

        item {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(onClick = viewModel::readErrorCodes, enabled = !state.readingDtcs) {
                    Text("Fehlercodes lesen")
                }
                OutlinedButton(
                    onClick = { showClearConfirm = true },
                    enabled = !state.clearing && state.dtcs.isNotEmpty(),
                ) {
                    Text("Fehlerspeicher löschen")
                }
            }
        }

        items(state.dtcs, key = { "dtc-${it.id}" }) { dtc ->
            Card(Modifier.fillMaxWidth()) {
                Row(
                    Modifier.fillMaxWidth().padding(12.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column {
                        Text(dtc.code, fontWeight = FontWeight.Bold)
                        dtc.system?.let { Text(it, style = MaterialTheme.typography.bodySmall) }
                    }
                    SeverityChip(dtc.severity)
                }
            }
        }

        item {
            state.error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            Button(
                onClick = viewModel::finish,
                enabled = !state.finishing,
                modifier = Modifier.fillMaxWidth(),
            ) {
                if (state.finishing) {
                    CircularProgressIndicator(modifier = Modifier.padding(end = 8.dp))
                }
                Text("Diagnose abschließen")
            }
        }
    }
}

@Composable
private fun FinishedContent(
    state: DiagnosticUiState.Finished,
    viewModel: DiagnosticViewModel,
    onExport: (String) -> Unit,
) {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            Text("Diagnose #${state.diagnostic.id} — ${state.diagnostic.status}", style = MaterialTheme.typography.titleMedium)
            Text(formatTimestamp(state.diagnostic.completedAt), style = MaterialTheme.typography.bodySmall)
        }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                SeverityChip("error")
                Text("${state.diagnostic.errorCount} Fehler", modifier = Modifier.padding(end = 12.dp))
                SeverityChip("warning")
                Text("${state.diagnostic.warningCount} Warnungen")
            }
        }

        item { Text("Messwerte", style = MaterialTheme.typography.labelLarge) }
        // Same reason as the dashboard: parameters and error codes are separate
        // tables, both numbered from 1, and they share this LazyColumn.
        items(state.parameters, key = { "parameter-${it.id}" }) { parameter ->
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text("${parameter.parameterName} (${parameter.parameterId})")
                Text("${formatValue(parameter.value)} ${parameter.unit ?: ""}")
            }
        }

        item { Text("Fehlercodes", style = MaterialTheme.typography.labelLarge) }
        if (state.errorCodes.isEmpty()) {
            item { Text("Keine Fehlercodes gefunden.") }
        }
        items(state.errorCodes, key = { "errorCode-${it.id}" }) { code ->
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(12.dp)) {
                    Row(
                        Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(code.code, fontWeight = FontWeight.Bold)
                        SeverityChip(code.severity)
                    }
                    code.description?.let { Text(it, style = MaterialTheme.typography.bodySmall) }
                }
            }
        }

        if (state.errorCodes.isNotEmpty()) {
            item {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text("KI-Analyse", style = MaterialTheme.typography.labelLarge)
                    OutlinedButton(onClick = viewModel::analyze, enabled = !state.analyzing) {
                        if (state.analyzing) {
                            CircularProgressIndicator(modifier = Modifier.padding(end = 8.dp))
                        }
                        Text(if (state.analyses.isEmpty()) "Analyse starten" else "Erneut analysieren")
                    }
                }
            }
            items(state.analyses) { analysis ->
                Card(Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text(analysis.code, fontWeight = FontWeight.Bold)
                        Text(analysis.rootCause)
                        analysis.recommendations.forEach { Text("• $it") }
                        Text("Geschätzte Kosten: ${analysis.estimatedRepairCost}", style = MaterialTheme.typography.bodySmall)
                        Text("Dringlichkeit: ${analysis.urgency}", style = MaterialTheme.typography.bodySmall)
                    }
                }
            }
        }

        item {
            state.error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(
                    onClick = {
                        onExport(
                            ReportCsv.build(
                                vehicle = state.vehicle,
                                diagnostic = state.diagnostic,
                                parameters = state.parameters,
                                errorCodes = state.errorCodes,
                            ),
                        )
                    },
                ) { Text("CSV exportieren") }
            }
        }
    }
}
