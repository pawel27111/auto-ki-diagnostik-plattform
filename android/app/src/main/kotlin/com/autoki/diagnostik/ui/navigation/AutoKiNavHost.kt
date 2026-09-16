package com.autoki.diagnostik.ui.navigation

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.autoki.diagnostik.AutoKiApplication
import com.autoki.diagnostik.ui.screens.DashboardScreen
import com.autoki.diagnostik.ui.screens.DiagnosticScreen
import com.autoki.diagnostik.ui.screens.LoginScreen
import com.autoki.diagnostik.ui.screens.SettingsScreen
import com.autoki.diagnostik.ui.screens.VehicleFormScreen
import kotlinx.coroutines.flow.first

/**
 * Start destination is decided once, from the persisted settings: no server
 * configured yet -> [Routes.SETUP], server known but no session cookie ->
 * [Routes.LOGIN], both present -> straight to [Routes.DASHBOARD] (a stale
 * cookie surfaces as an UNAUTHORIZED response and is handled below, not here).
 */
@Composable
fun AutoKiNavHost() {
    val container = (LocalContext.current.applicationContext as AutoKiApplication).container
    val navController = rememberNavController()
    var startDestination by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(Unit) {
        val settings = container.settingsStore.settings.first()
        startDestination = when {
            settings.serverBaseUrl.isBlank() -> Routes.SETUP
            settings.sessionCookie.isNullOrBlank() -> Routes.LOGIN
            else -> Routes.DASHBOARD
        }
    }

    val sessionExpired by container.sessionExpired.collectAsStateWithLifecycle()
    LaunchedEffect(sessionExpired) {
        if (sessionExpired) {
            container.consumeSessionExpired()
            navController.navigate(Routes.LOGIN) {
                popUpTo(0)
            }
        }
    }

    val resolvedStart = startDestination
    if (resolvedStart == null) {
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
        return
    }

    NavHost(navController = navController, startDestination = resolvedStart) {
        composable(Routes.SETUP) {
            SettingsScreen(
                showBack = false,
                onSaved = {
                    navController.navigate(Routes.LOGIN) { popUpTo(Routes.SETUP) { inclusive = true } }
                },
            )
        }

        composable(Routes.LOGIN) {
            var baseUrl by remember { mutableStateOf("") }
            LaunchedEffect(Unit) { baseUrl = container.settingsStore.settings.first().serverBaseUrl }
            if (baseUrl.isNotBlank()) {
                LoginScreen(
                    serverBaseUrl = baseUrl,
                    onLoggedIn = { cookie ->
                        container.applySessionCookie(cookie)
                        navController.navigate(Routes.DASHBOARD) { popUpTo(0) }
                    },
                    onChangeServer = {
                        navController.navigate(Routes.SETUP) { popUpTo(0) }
                    },
                )
            }
        }

        composable(Routes.SETTINGS) {
            SettingsScreen(
                showBack = true,
                onBack = { navController.popBackStack() },
                onSaved = { navController.popBackStack() },
            )
        }

        composable(Routes.DASHBOARD) {
            DashboardScreen(
                onAddVehicle = { navController.navigate(Routes.VEHICLE_FORM) },
                onOpenVehicle = { vehicle -> navController.navigate(Routes.diagnostic(vehicle.id)) },
                onOpenSettings = { navController.navigate(Routes.SETTINGS) },
                onLoggedOut = { navController.navigate(Routes.LOGIN) { popUpTo(0) } },
            )
        }

        composable(Routes.VEHICLE_FORM) {
            VehicleFormScreen(
                onBack = { navController.popBackStack() },
                onSaved = { navController.popBackStack() },
            )
        }

        composable(
            route = Routes.DIAGNOSTIC_PATTERN,
            arguments = listOf(navArgument("vehicleId") { type = NavType.IntType }),
        ) { backStackEntry ->
            val vehicleId = backStackEntry.arguments?.getInt("vehicleId") ?: return@composable
            DiagnosticScreen(vehicleId = vehicleId, onBack = { navController.popBackStack() })
        }
    }
}
