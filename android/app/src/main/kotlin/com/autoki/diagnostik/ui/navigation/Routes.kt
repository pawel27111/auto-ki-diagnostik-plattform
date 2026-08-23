package com.autoki.diagnostik.ui.navigation

object Routes {
    const val SETUP = "setup"
    const val LOGIN = "login"
    const val DASHBOARD = "dashboard"
    const val VEHICLE_FORM = "vehicle_form"
    const val SETTINGS = "settings"

    const val DIAGNOSTIC_PATTERN = "diagnostic/{vehicleId}"
    fun diagnostic(vehicleId: Int) = "diagnostic/$vehicleId"
}
