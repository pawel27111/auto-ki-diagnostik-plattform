package com.autoki.diagnostik.ui.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.autoki.diagnostik.core.ObdProtocol
import com.autoki.diagnostik.data.AppContainer
import com.autoki.diagnostik.data.network.DiagnosticDto
import com.autoki.diagnostik.data.network.ErrorCodeDto
import com.autoki.diagnostik.data.network.LlmAnalysisDto
import com.autoki.diagnostik.data.network.ObdParameterDto
import com.autoki.diagnostik.data.network.VehicleDto
import com.autoki.diagnostik.data.obd.ObdAdapter
import com.autoki.diagnostik.data.obd.ObdAdapterType
import com.autoki.diagnostik.data.obd.ObdConnection
import com.autoki.diagnostik.data.obd.ObdConnector
import com.autoki.diagnostik.data.obd.UsbObdDevice
import com.autoki.diagnostik.data.obd.UsbObdLink
import com.autoki.diagnostik.data.obd.ObdReading
import com.autoki.diagnostik.data.obd.PairedDevice
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/** Diagnostic types the backend accepts (server/obdRouter.ts's `diagnosticType` enum). */
enum class DiagnosticKind(val wireValue: String, val label: String) {
    QUICK("quick_scan", "Schnelltest"),
    FULL("full_scan", "Vollständiger Scan"),
    REAL_TIME("real_time", "Echtzeit-Überwachung"),
}

sealed interface DiagnosticUiState {
    data class Setup(
        val vehicle: VehicleDto?,
        val kind: DiagnosticKind = DiagnosticKind.QUICK,
        val useSimulation: Boolean = true,
        val connection: ObdConnection = ObdConnection.BLUETOOTH,
        val pairedDevices: List<PairedDevice> = emptyList(),
        val selectedDevice: PairedDevice? = null,
        val usbDevices: List<UsbObdDevice> = emptyList(),
        val selectedUsbDevice: UsbObdDevice? = null,
        val adapterType: ObdAdapterType = ObdAdapterType.ELM327,
        val starting: Boolean = false,
        val error: String? = null,
    ) : DiagnosticUiState

    data class Running(
        val diagnosticId: Int,
        val vehicle: VehicleDto?,
        val simulated: Boolean,
        val readings: Map<String, ObdReading> = emptyMap(),
        val dtcs: List<ErrorCodeDto> = emptyList(),
        val statusMessage: String? = null,
        val readingDtcs: Boolean = false,
        val clearing: Boolean = false,
        val finishing: Boolean = false,
        val error: String? = null,
    ) : DiagnosticUiState

    data class Finished(
        val diagnostic: DiagnosticDto,
        val vehicle: VehicleDto?,
        val parameters: List<ObdParameterDto>,
        val errorCodes: List<ErrorCodeDto>,
        val analyses: List<LlmAnalysisDto> = emptyList(),
        val analyzing: Boolean = false,
        val error: String? = null,
    ) : DiagnosticUiState

    data class Failed(val message: String) : DiagnosticUiState
}

class DiagnosticViewModel(
    private val container: AppContainer,
    private val vehicleId: Int,
) : ViewModel() {

    private val _uiState = MutableStateFlow<DiagnosticUiState>(
        DiagnosticUiState.Setup(vehicle = null)
    )
    val uiState: StateFlow<DiagnosticUiState> = _uiState.asStateFlow()

    private var adapter: ObdAdapter? = null
    private var liveJob: Job? = null

    init {
        viewModelScope.launch {
            val vehicle = runCatching { container.apiService.getVehicle(vehicleId) }.getOrNull()
            (_uiState.value as? DiagnosticUiState.Setup)?.let {
                _uiState.value = it.copy(vehicle = vehicle)
            }
        }
    }

    fun loadPairedDevices(devices: List<PairedDevice>) {
        (_uiState.value as? DiagnosticUiState.Setup)?.let {
            _uiState.value = it.copy(pairedDevices = devices, selectedDevice = devices.firstOrNull())
        }
    }

    /** Re-reads the attached USB adapters; cheap enough to call whenever the screen resumes. */
    fun refreshUsbDevices() {
        val devices = UsbObdLink.list(container.appContext)
        (_uiState.value as? DiagnosticUiState.Setup)?.let { setup ->
            _uiState.value = setup.copy(
                usbDevices = devices,
                // Keep the current pick if it is still plugged in.
                selectedUsbDevice = devices.firstOrNull { it.deviceId == setup.selectedUsbDevice?.deviceId }
                    ?: devices.firstOrNull(),
            )
        }
    }

    fun updateSetup(transform: (DiagnosticUiState.Setup) -> DiagnosticUiState.Setup) {
        (_uiState.value as? DiagnosticUiState.Setup)?.let { _uiState.value = transform(it) }
    }

    fun start() {
        val setup = _uiState.value as? DiagnosticUiState.Setup ?: return
        if (!setup.useSimulation) {
            val missing = when (setup.connection) {
                ObdConnection.BLUETOOTH -> setup.selectedDevice == null
                ObdConnection.USB -> setup.selectedUsbDevice == null
            }
            if (missing) {
                _uiState.value = setup.copy(
                    error = when (setup.connection) {
                        ObdConnection.BLUETOOTH -> "Bitte ein gekoppeltes OBD-Gerät auswählen"
                        ObdConnection.USB -> "Kein USB-Adapter erkannt — Kabel und OTG-Adapter prüfen"
                    }
                )
                return
            }
            if (setup.connection == ObdConnection.BLUETOOTH && setup.adapterType.requiresLineControl) {
                _uiState.value = setup.copy(
                    error = "Ein K+DCAN-Kabel braucht eine USB-Verbindung"
                )
                return
            }
        }

        viewModelScope.launch {
            _uiState.value = setup.copy(starting = true, error = null)
            runCatching {
                container.apiService.startDiagnostic(
                    vehicleId = vehicleId,
                    obdDeviceId = null,
                    diagnosticType = setup.kind.wireValue,
                    mileage = null,
                )
            }.onSuccess { started ->
                if (setup.useSimulation) {
                    runSimulation(started.diagnosticId, setup.vehicle)
                } else {
                    connectAndRun(started.diagnosticId, setup)
                }
            }.onFailure { error ->
                _uiState.value = setup.copy(starting = false, error = error.message ?: "Diagnose konnte nicht gestartet werden")
            }
        }
    }

    private suspend fun runSimulation(diagnosticId: Int, vehicle: VehicleDto?) {
        runCatching { container.apiService.simulateDiagnostic(diagnosticId, withFaults = null) }
            .onSuccess { loadFinished(diagnosticId, vehicle) }
            .onFailure { error ->
                _uiState.value = DiagnosticUiState.Failed(error.message ?: "Simulation fehlgeschlagen")
            }
    }

    private suspend fun connectAndRun(diagnosticId: Int, setup: DiagnosticUiState.Setup) {
        val name = when (setup.connection) {
            ObdConnection.BLUETOOTH -> setup.selectedDevice?.name
            ObdConnection.USB -> setup.selectedUsbDevice?.name
        } ?: return

        _uiState.value = DiagnosticUiState.Running(
            diagnosticId = diagnosticId,
            vehicle = setup.vehicle,
            simulated = false,
            // The K-Line wake-up alone takes two seconds, so say what is happening.
            statusMessage = if (setup.adapterType.requiresLineControl) {
                "Verbinde mit $name — Steuergerät wird geweckt, das dauert einige Sekunden…"
            } else {
                "Verbinde mit $name…"
            },
        )

        runCatching {
            when (setup.connection) {
                ObdConnection.BLUETOOTH -> ObdConnector.connectBluetooth(
                    container.appContext,
                    setup.selectedDevice!!.device,
                    setup.adapterType,
                )
                ObdConnection.USB -> ObdConnector.connectUsb(
                    container.appContext,
                    setup.selectedUsbDevice!!.deviceId,
                    setup.adapterType,
                )
            }
        }
            .onSuccess { connected ->
                adapter = connected
                (_uiState.value as? DiagnosticUiState.Running)?.let {
                    _uiState.value = it.copy(statusMessage = "Verbunden mit $name")
                }
                startLiveScan(diagnosticId, connected)
            }
            .onFailure { error ->
                runCatching { container.apiService.failDiagnostic(diagnosticId, error.message) }
                _uiState.value = DiagnosticUiState.Failed(error.message ?: "Verbindung fehlgeschlagen")
            }
    }

    private fun startLiveScan(diagnosticId: Int, adapter: ObdAdapter) {
        liveJob = viewModelScope.launch {
            adapter.liveReadings().collect { reading ->
                val running = _uiState.value as? DiagnosticUiState.Running ?: return@collect
                _uiState.value = running.copy(readings = running.readings + (reading.pid to reading))

                runCatching {
                    container.apiService.addParameter(
                        diagnosticId = diagnosticId,
                        parameterId = reading.pid,
                        parameterName = reading.name,
                        value = reading.value,
                        unit = reading.unit,
                        minValue = null,
                        maxValue = null,
                        isNormal = reading.isNormal,
                        isSimulated = false,
                    )
                }
            }
        }
    }

    fun readErrorCodes() {
        val running = _uiState.value as? DiagnosticUiState.Running ?: return
        val bt = adapter ?: return
        viewModelScope.launch {
            _uiState.value = running.copy(readingDtcs = true, error = null)
            runCatching { bt.readErrorCodes() }
                .onSuccess { codes ->
                    for (dtc in codes) {
                        runCatching { container.apiService.addErrorCode(running.diagnosticId, dtc.code, null, null, dtc.system) }
                    }
                    val stored = runCatching { container.apiService.getErrorCodes(running.diagnosticId) }.getOrDefault(emptyList())
                    (_uiState.value as? DiagnosticUiState.Running)?.let {
                        _uiState.value = it.copy(dtcs = stored, readingDtcs = false)
                    }
                }
                .onFailure { error ->
                    (_uiState.value as? DiagnosticUiState.Running)?.let {
                        _uiState.value = it.copy(readingDtcs = false, error = error.message ?: "Fehlercodes konnten nicht gelesen werden")
                    }
                }
        }
    }

    /** Mode 04 — erases the fault memory. Callers must have already confirmed with the user. */
    fun clearErrorCodesConfirmed() {
        val running = _uiState.value as? DiagnosticUiState.Running ?: return
        val bt = adapter ?: return
        viewModelScope.launch {
            _uiState.value = running.copy(clearing = true, error = null)
            runCatching { bt.clearErrorCodes() }
                .onSuccess { cleared ->
                    (_uiState.value as? DiagnosticUiState.Running)?.let {
                        _uiState.value = it.copy(
                            clearing = false,
                            dtcs = if (cleared) emptyList() else it.dtcs,
                            statusMessage = if (cleared) "Fehlerspeicher gelöscht" else "Löschen nicht bestätigt",
                        )
                    }
                }
                .onFailure { error ->
                    (_uiState.value as? DiagnosticUiState.Running)?.let {
                        _uiState.value = it.copy(clearing = false, error = error.message ?: "Löschen fehlgeschlagen")
                    }
                }
        }
    }

    fun finish() {
        val running = _uiState.value as? DiagnosticUiState.Running ?: return
        viewModelScope.launch {
            _uiState.value = running.copy(finishing = true, error = null)
            liveJob?.cancel()
            adapter?.close()
            adapter = null

            val latest = running.readings
            runCatching {
                container.apiService.completeDiagnostic(
                    diagnosticId = running.diagnosticId,
                    engineTemperature = latest["05"]?.value,
                    rpm = latest["0C"]?.value?.toInt(),
                    speed = latest["0D"]?.value?.toInt(),
                    fuelPressure = latest["0A"]?.value,
                    oxygenSensor = latest["14"]?.value,
                    notes = null,
                )
            }.onSuccess {
                loadFinished(running.diagnosticId, running.vehicle)
            }.onFailure { error ->
                _uiState.value = running.copy(finishing = false, error = error.message ?: "Abschluss fehlgeschlagen")
            }
        }
    }

    private suspend fun loadFinished(diagnosticId: Int, vehicle: VehicleDto?) {
        runCatching {
            val diagnostic = container.apiService.getDiagnostic(diagnosticId)
            val parameters = container.apiService.getParameters(diagnosticId)
            val errorCodes = container.apiService.getErrorCodes(diagnosticId)
            Triple(diagnostic, parameters, errorCodes)
        }.onSuccess { (diagnostic, parameters, errorCodes) ->
            _uiState.value = DiagnosticUiState.Finished(diagnostic, vehicle, parameters, errorCodes)
        }.onFailure { error ->
            _uiState.value = DiagnosticUiState.Failed(error.message ?: "Ergebnis konnte nicht geladen werden")
        }
    }

    fun analyze() {
        val finished = _uiState.value as? DiagnosticUiState.Finished ?: return
        if (finished.errorCodes.isEmpty()) return
        viewModelScope.launch {
            _uiState.value = finished.copy(analyzing = true, error = null)
            runCatching { container.apiService.analyzeDiagnostic(finished.diagnostic.id) }
                .onSuccess { result ->
                    (_uiState.value as? DiagnosticUiState.Finished)?.let {
                        _uiState.value = it.copy(analyzing = false, analyses = result.analyses)
                    }
                }
                .onFailure { error ->
                    (_uiState.value as? DiagnosticUiState.Finished)?.let {
                        _uiState.value = it.copy(analyzing = false, error = error.message ?: "KI-Analyse fehlgeschlagen")
                    }
                }
        }
    }

    fun severityLabel(code: String): String = ObdProtocol.severityForCode(code).wireValue

    override fun onCleared() {
        super.onCleared()
        liveJob?.cancel()
        adapter?.close()
    }
}
