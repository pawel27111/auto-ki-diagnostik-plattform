package com.autoki.diagnostik.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.autoki.diagnostik.data.network.VehicleDto
import com.autoki.diagnostik.data.network.formatTimestamp
import com.autoki.diagnostik.ui.autoKiViewModel
import com.autoki.diagnostik.ui.components.SeverityChip
import com.autoki.diagnostik.ui.viewmodel.DashboardViewModel

@Composable
fun DashboardScreen(
    onAddVehicle: () -> Unit,
    onOpenVehicle: (VehicleDto) -> Unit,
    onOpenSettings: () -> Unit,
    onLoggedOut: () -> Unit,
) {
    val viewModel = autoKiViewModel { DashboardViewModel(it) }
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    var menuExpanded by remember { mutableStateOf(false) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("AutoKI Assistent") },
                actions = {
                    IconButton(onClick = { menuExpanded = true }) {
                        Icon(Icons.Filled.Settings, contentDescription = "Menü")
                    }
                    DropdownMenu(expanded = menuExpanded, onDismissRequest = { menuExpanded = false }) {
                        DropdownMenuItem(
                            text = { Text("Einstellungen") },
                            onClick = { menuExpanded = false; onOpenSettings() },
                        )
                        DropdownMenuItem(
                            text = { Text("Abmelden") },
                            onClick = { menuExpanded = false; viewModel.logout(onLoggedOut) },
                        )
                    }
                },
            )
        },
        floatingActionButton = {
            FloatingActionButton(onClick = onAddVehicle) {
                Icon(Icons.Filled.Add, contentDescription = "Fahrzeug hinzufügen")
            }
        },
    ) { padding ->
        when {
            state.loading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
            state.error != null -> Box(Modifier.fillMaxSize().padding(24.dp), contentAlignment = Alignment.Center) {
                Text(state.error ?: "")
            }
            else -> DashboardContent(
                padding = padding,
                vehicles = state.vehicles,
                recent = state.recentDiagnostics,
                onOpenVehicle = onOpenVehicle,
            )
        }
    }
}

@Composable
private fun DashboardContent(
    padding: PaddingValues,
    vehicles: List<VehicleDto>,
    recent: List<com.autoki.diagnostik.data.network.DiagnosticDto>,
    onOpenVehicle: (VehicleDto) -> Unit,
) {
    LazyColumn(
        modifier = Modifier.fillMaxSize().padding(padding),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            Text("Fahrzeuge", style = MaterialTheme.typography.titleMedium)
        }
        if (vehicles.isEmpty()) {
            item {
                Text(
                    "Noch keine Fahrzeuge — mit dem + unten rechts anlegen.",
                    style = MaterialTheme.typography.bodyMedium,
                )
            }
        }
        // Keys are namespaced per section: vehicle 1 and diagnostic 1 both live
        // in this one LazyColumn, and a bare `it.id` made them collide — Compose
        // rejects a duplicate key with "Key \"1\" was already used" and the app
        // died on the first dashboard that had a vehicle and a diagnostic.
        items(vehicles, key = { "vehicle-${it.id}" }) { vehicle ->
            VehicleCard(vehicle = vehicle, onClick = { onOpenVehicle(vehicle) })
        }

        item {
            Text(
                "Letzte Diagnosen",
                style = MaterialTheme.typography.titleMedium,
                modifier = Modifier.padding(top = 8.dp),
            )
        }
        if (recent.isEmpty()) {
            item { Text("Noch keine Diagnosen durchgeführt.", style = MaterialTheme.typography.bodyMedium) }
        }
        items(recent, key = { "diagnostic-${it.id}" }) { diagnostic ->
            Card(modifier = Modifier.fillMaxWidth()) {
                Column(Modifier.padding(12.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        Text("Diagnose #${diagnostic.id}", fontWeight = FontWeight.Bold)
                        Text(diagnostic.status)
                    }
                    Text(formatTimestamp(diagnostic.startedAt), style = MaterialTheme.typography.bodySmall)
                    if (diagnostic.errorCount > 0 || diagnostic.warningCount > 0) {
                        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            if (diagnostic.errorCount > 0) SeverityChip("error")
                            if (diagnostic.warningCount > 0) SeverityChip("warning")
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun VehicleCard(vehicle: VehicleDto, onClick: () -> Unit) {
    Card(modifier = Modifier.fillMaxWidth(), onClick = onClick) {
        Column(Modifier.padding(12.dp)) {
            Text("${vehicle.make} ${vehicle.model} (${vehicle.year})", fontWeight = FontWeight.Bold)
            Text("VIN: ${vehicle.vin}", style = MaterialTheme.typography.bodySmall)
            vehicle.licensePlate?.let {
                Text("Kennzeichen: $it", style = MaterialTheme.typography.bodySmall)
            }
            Text(
                "Letzte Diagnose: ${formatTimestamp(vehicle.lastDiagnosisAt)}",
                style = MaterialTheme.typography.bodySmall,
            )
        }
    }
}
