package com.autoki.diagnostik.ui.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.autoki.diagnostik.data.AppContainer
import com.autoki.diagnostik.data.network.DiagnosticDto
import com.autoki.diagnostik.data.network.UserDto
import com.autoki.diagnostik.data.network.VehicleDto
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class DashboardUiState(
    val loading: Boolean = true,
    val user: UserDto? = null,
    val vehicles: List<VehicleDto> = emptyList(),
    val recentDiagnostics: List<DiagnosticDto> = emptyList(),
    val error: String? = null,
)

class DashboardViewModel(private val container: AppContainer) : ViewModel() {
    private val _uiState = MutableStateFlow(DashboardUiState())
    val uiState: StateFlow<DashboardUiState> = _uiState.asStateFlow()

    init {
        refresh()
    }

    fun refresh() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(loading = true, error = null)
            runCatching {
                val user = container.apiService.me()
                val vehicles = container.apiService.listVehicles()
                val recent = container.apiService.listRecentDiagnostics(10)
                Triple(user, vehicles, recent)
            }.onSuccess { (user, vehicles, recent) ->
                _uiState.value = DashboardUiState(
                    loading = false,
                    user = user,
                    vehicles = vehicles,
                    recentDiagnostics = recent,
                )
            }.onFailure { error ->
                _uiState.value = _uiState.value.copy(
                    loading = false,
                    error = error.message ?: "Daten konnten nicht geladen werden",
                )
            }
        }
    }

    fun logout(onDone: () -> Unit) {
        viewModelScope.launch {
            runCatching { container.apiService.logout() }
            container.settingsStore.setSessionCookie(null)
            onDone()
        }
    }
}
