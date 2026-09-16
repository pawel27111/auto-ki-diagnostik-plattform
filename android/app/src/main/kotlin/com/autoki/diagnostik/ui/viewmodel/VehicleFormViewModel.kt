package com.autoki.diagnostik.ui.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.autoki.diagnostik.data.AppContainer
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class VehicleFormUiState(
    val vin: String = "",
    val make: String = "",
    val model: String = "",
    val year: String = "",
    val engineType: String = "",
    val fuelType: String = "",
    val licensePlate: String = "",
    val mileage: String = "",
    val saving: Boolean = false,
    val error: String? = null,
    val saved: Boolean = false,
)

class VehicleFormViewModel(private val container: AppContainer) : ViewModel() {
    private val _uiState = MutableStateFlow(VehicleFormUiState())
    val uiState: StateFlow<VehicleFormUiState> = _uiState.asStateFlow()

    fun update(transform: (VehicleFormUiState) -> VehicleFormUiState) {
        _uiState.value = transform(_uiState.value)
    }

    fun save() {
        val state = _uiState.value
        val year = state.year.toIntOrNull()
        if (state.vin.trim().length != 17) {
            _uiState.value = state.copy(error = "Die FIN/VIN muss genau 17 Zeichen haben")
            return
        }
        if (state.make.isBlank() || state.model.isBlank() || year == null) {
            _uiState.value = state.copy(error = "Marke, Modell und Baujahr sind Pflichtfelder")
            return
        }

        viewModelScope.launch {
            _uiState.value = state.copy(saving = true, error = null)
            runCatching {
                container.apiService.createVehicle(
                    vin = state.vin.trim().uppercase(),
                    make = state.make.trim(),
                    model = state.model.trim(),
                    year = year,
                    engineType = state.engineType.trim().ifBlank { null },
                    fuelType = state.fuelType.trim().ifBlank { null },
                    licensePlate = state.licensePlate.trim().ifBlank { null },
                    mileage = state.mileage.toIntOrNull(),
                )
            }.onSuccess {
                _uiState.value = _uiState.value.copy(saving = false, saved = true)
            }.onFailure { error ->
                _uiState.value = _uiState.value.copy(
                    saving = false,
                    error = error.message ?: "Fahrzeug konnte nicht gespeichert werden",
                )
            }
        }
    }
}
