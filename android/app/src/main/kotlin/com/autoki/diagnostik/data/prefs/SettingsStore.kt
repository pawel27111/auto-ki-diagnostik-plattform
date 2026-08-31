package com.autoki.diagnostik.data.prefs

import android.content.Context
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.emptyPreferences
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.autoki.diagnostik.data.obd.ObdAdapterType
import com.autoki.diagnostik.data.obd.ObdConnection
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.map
import java.io.IOException

private val Context.dataStore by preferencesDataStore(name = "autoki_settings")

/**
 * Everything that must survive process death and app restarts: which server to
 * talk to, the session cookie obtained from the OAuth WebView flow, the
 * user's default for whether a new diagnostic runs simulated or against real
 * hardware, and which adapter they use — re-picking the plug and the adapter
 * type on every visit to the diagnostic screen is a reliable way to start a
 * session against the wrong one.
 */
class SettingsStore(private val context: Context) {

    private object Keys {
        val SERVER_BASE_URL = stringPreferencesKey("server_base_url")
        val SESSION_COOKIE = stringPreferencesKey("session_cookie")
        val SIMULATION_DEFAULT = booleanPreferencesKey("simulation_default")
        val OBD_CONNECTION = stringPreferencesKey("obd_connection")
        val OBD_ADAPTER_TYPE = stringPreferencesKey("obd_adapter_type")
    }

    data class Settings(
        val serverBaseUrl: String,
        val sessionCookie: String?,
        val simulationDefault: Boolean,
        val obdConnection: ObdConnection,
        val obdAdapterType: ObdAdapterType,
    )

    val settings: Flow<Settings> = context.dataStore.data
        .catch { error ->
            if (error is IOException) emit(emptyPreferences()) else throw error
        }
        .map { prefs ->
            Settings(
                serverBaseUrl = prefs[Keys.SERVER_BASE_URL] ?: "",
                sessionCookie = prefs[Keys.SESSION_COOKIE],
                simulationDefault = prefs[Keys.SIMULATION_DEFAULT] ?: true,
                // An unknown name means the enum was renamed since the value was
                // stored; falling back beats refusing to load the settings.
                obdConnection = prefs[Keys.OBD_CONNECTION]
                    ?.let { name -> ObdConnection.entries.firstOrNull { it.name == name } }
                    ?: ObdConnection.BLUETOOTH,
                obdAdapterType = prefs[Keys.OBD_ADAPTER_TYPE]
                    ?.let { name -> ObdAdapterType.entries.firstOrNull { it.name == name } }
                    ?: ObdAdapterType.ELM327,
            )
        }

    suspend fun setServerBaseUrl(url: String) {
        context.dataStore.edit { it[Keys.SERVER_BASE_URL] = url.trim().trimEnd('/') }
    }

    suspend fun setSessionCookie(cookie: String?) {
        context.dataStore.edit { prefs ->
            if (cookie == null) prefs.remove(Keys.SESSION_COOKIE) else prefs[Keys.SESSION_COOKIE] = cookie
        }
    }

    suspend fun setSimulationDefault(value: Boolean) {
        context.dataStore.edit { it[Keys.SIMULATION_DEFAULT] = value }
    }

    suspend fun setObdConnection(connection: ObdConnection) {
        context.dataStore.edit { it[Keys.OBD_CONNECTION] = connection.name }
    }

    suspend fun setObdAdapterType(adapterType: ObdAdapterType) {
        context.dataStore.edit { it[Keys.OBD_ADAPTER_TYPE] = adapterType.name }
    }

    suspend fun clearSession() {
        context.dataStore.edit { it.remove(Keys.SESSION_COOKIE) }
    }
}
