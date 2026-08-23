package com.autoki.diagnostik.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.autoki.diagnostik.AutoKiApplication
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

/**
 * Server address + default for whether a new diagnostic starts simulated.
 * Doubles as the first-run setup screen (no server configured yet) and the
 * regular settings screen reachable from the dashboard.
 */
@Composable
fun SettingsScreen(onSaved: () -> Unit, showBack: Boolean, onBack: () -> Unit = {}) {
    val container = (LocalContext.current.applicationContext as AutoKiApplication).container
    val scope = rememberCoroutineScope()

    var serverUrl by remember { mutableStateOf("") }
    var simulationDefault by remember { mutableStateOf(true) }

    LaunchedEffect(Unit) {
        val current = container.settingsStore.settings.first()
        serverUrl = current.serverBaseUrl
        simulationDefault = current.simulationDefault
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Einstellungen") },
                navigationIcon = {
                    if (showBack) {
                        IconButton(onClick = onBack) {
                            Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Zurück")
                        }
                    }
                },
            )
        },
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(24.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Text(
                "AutoKI Assistent verbindet sich mit deinem selbst gehosteten Server.",
                style = MaterialTheme.typography.bodyMedium,
            )
            OutlinedTextField(
                value = serverUrl,
                onValueChange = { serverUrl = it },
                label = { Text("Server-Adresse") },
                placeholder = { Text("https://autoki.example.com") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Text("Neue Diagnosen standardmäßig simulieren")
                Switch(checked = simulationDefault, onCheckedChange = { simulationDefault = it })
            }

            Button(
                onClick = {
                    val normalized = serverUrl.trim().trimEnd('/')
                    scope.launch {
                        container.settingsStore.setServerBaseUrl(normalized)
                        container.settingsStore.setSimulationDefault(simulationDefault)
                        onSaved()
                    }
                },
                enabled = serverUrl.trim().let { it.startsWith("http://") || it.startsWith("https://") },
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text("Speichern")
            }
        }
    }
}
