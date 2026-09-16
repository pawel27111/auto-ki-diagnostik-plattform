package com.autoki.diagnostik.data

import android.content.Context
import com.autoki.diagnostik.data.network.ApiService
import com.autoki.diagnostik.data.network.TrpcClient
import com.autoki.diagnostik.data.prefs.SettingsStore
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * Hand-rolled composition root. The app is small enough that a DI framework
 * would add more ceremony than it removes — everything here is a plain
 * singleton created once in [com.autoki.diagnostik.AutoKiApplication].
 */
class AppContainer(context: Context) {
    val appContext: Context = context.applicationContext
    val settingsStore = SettingsStore(appContext)
    val trpcClient = TrpcClient(settingsStore)
    val apiService = ApiService(trpcClient)

    /** True once the session was cleared because a request came back UNAUTHORIZED. */
    private val _sessionExpired = MutableStateFlow(false)
    val sessionExpired: StateFlow<Boolean> = _sessionExpired.asStateFlow()

    private val scope = CoroutineScope(SupervisorJob())

    init {
        trpcClient.onUnauthorized = { _sessionExpired.value = true }
    }

    fun consumeSessionExpired() {
        _sessionExpired.value = false
    }

    fun applySessionCookie(cookie: String) {
        scope.launch { settingsStore.setSessionCookie(cookie) }
    }
}
