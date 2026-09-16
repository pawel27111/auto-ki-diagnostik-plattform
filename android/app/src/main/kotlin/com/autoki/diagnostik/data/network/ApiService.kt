package com.autoki.diagnostik.data.network

import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/**
 * Typed wrapper around [TrpcClient] for every procedure the app calls, one
 * function per entry in server/routers.ts / server/obdRouter.ts / server/llm/llmRouter.ts.
 */
class ApiService(private val client: TrpcClient) {

    // --- auth ---------------------------------------------------------

    suspend fun me(): UserDto? = client.query("auth.me")

    suspend fun logout() {
        client.mutate<CreateResultDto>("auth.logout")
    }

    // --- obd.vehicles --------------------------------------------------

    suspend fun listVehicles(): List<VehicleDto> = client.query("obd.vehicles.list")

    suspend fun getVehicle(vehicleId: Int): VehicleDto =
        client.query("obd.vehicles.getById", buildJsonObject { put("vehicleId", vehicleId) })

    suspend fun createVehicle(
        vin: String,
        make: String,
        model: String,
        year: Int,
        engineType: String?,
        fuelType: String?,
        licensePlate: String?,
        mileage: Int?,
    ): CreateResultDto = client.mutate(
        "obd.vehicles.create",
        buildJsonObject {
            put("vin", vin)
            put("make", make)
            put("model", model)
            put("year", year)
            engineType?.let { put("engineType", it) }
            fuelType?.let { put("fuelType", it) }
            licensePlate?.let { put("licensePlate", it) }
            mileage?.let { put("mileage", it) }
        },
    )

    // --- obd.devices -----------------------------------------------------

    suspend fun listDevices(): List<ObdDeviceDto> = client.query("obd.devices.list")

    suspend fun availablePorts(): List<AvailablePortDto> = client.query("obd.devices.availablePorts")

    suspend fun createDevice(
        deviceName: String,
        deviceType: String,
        connectionString: String?,
    ): DeviceCreateResultDto = client.mutate(
        "obd.devices.create",
        buildJsonObject {
            put("deviceName", deviceName)
            put("deviceType", deviceType)
            connectionString?.let { put("connectionString", it) }
        },
    )

    // --- obd.diagnostics -------------------------------------------------

    suspend fun startDiagnostic(
        vehicleId: Int,
        obdDeviceId: Int?,
        diagnosticType: String,
        mileage: Int?,
    ): DiagnosticStartResultDto = client.mutate(
        "obd.diagnostics.start",
        buildJsonObject {
            put("vehicleId", vehicleId)
            obdDeviceId?.let { put("obdDeviceId", it) }
            put("diagnosticType", diagnosticType)
            mileage?.let { put("mileage", it) }
        },
    )

    suspend fun getDiagnostic(diagnosticId: Int): DiagnosticDto =
        client.query("obd.diagnostics.getById", buildJsonObject { put("diagnosticId", diagnosticId) })

    suspend fun listDiagnosticsByVehicle(vehicleId: Int): List<DiagnosticDto> =
        client.query("obd.diagnostics.listByVehicle", buildJsonObject { put("vehicleId", vehicleId) })

    suspend fun listRecentDiagnostics(limit: Int = 20): List<DiagnosticDto> =
        client.query("obd.diagnostics.listRecent", buildJsonObject { put("limit", limit) })

    suspend fun addParameter(
        diagnosticId: Int,
        parameterId: String,
        parameterName: String,
        value: Double,
        unit: String?,
        minValue: Double?,
        maxValue: Double?,
        isNormal: Boolean,
        isSimulated: Boolean,
    ): AddParameterResultDto = client.mutate(
        "obd.diagnostics.addParameter",
        buildJsonObject {
            put("diagnosticId", diagnosticId)
            put("parameterId", parameterId)
            put("parameterName", parameterName)
            put("value", value)
            unit?.let { put("unit", it) }
            minValue?.let { put("minValue", it) }
            maxValue?.let { put("maxValue", it) }
            put("isNormal", isNormal)
            put("isSimulated", isSimulated)
        },
    )

    suspend fun getParameters(diagnosticId: Int): List<ObdParameterDto> =
        client.query("obd.diagnostics.getParameters", buildJsonObject { put("diagnosticId", diagnosticId) })

    suspend fun addErrorCode(
        diagnosticId: Int,
        code: String,
        description: String?,
        severity: String?,
        system: String?,
    ): AddErrorCodeResultDto = client.mutate(
        "obd.diagnostics.addErrorCode",
        buildJsonObject {
            put("diagnosticId", diagnosticId)
            put("code", code)
            description?.let { put("description", it) }
            severity?.let { put("severity", it) }
            system?.let { put("system", it) }
        },
    )

    suspend fun getErrorCodes(diagnosticId: Int): List<ErrorCodeDto> =
        client.query("obd.diagnostics.getErrorCodes", buildJsonObject { put("diagnosticId", diagnosticId) })

    suspend fun completeDiagnostic(
        diagnosticId: Int,
        engineTemperature: Double?,
        rpm: Int?,
        speed: Int?,
        fuelPressure: Double?,
        oxygenSensor: Double?,
        notes: String?,
    ): DiagnosticStatusResultDto = client.mutate(
        "obd.diagnostics.complete",
        buildJsonObject {
            put("diagnosticId", diagnosticId)
            engineTemperature?.let { put("engineTemperature", it) }
            rpm?.let { put("rpm", it) }
            speed?.let { put("speed", it) }
            fuelPressure?.let { put("fuelPressure", it) }
            oxygenSensor?.let { put("oxygenSensor", it) }
            notes?.let { put("notes", it) }
        },
    )

    suspend fun failDiagnostic(diagnosticId: Int, errorMessage: String?): DiagnosticStatusResultDto = client.mutate(
        "obd.diagnostics.fail",
        buildJsonObject {
            put("diagnosticId", diagnosticId)
            errorMessage?.let { put("errorMessage", it) }
        },
    )

    suspend fun cancelDiagnostic(diagnosticId: Int): DiagnosticStatusResultDto =
        client.mutate("obd.diagnostics.cancel", buildJsonObject { put("diagnosticId", diagnosticId) })

    // --- obd.pids / obd.mock ---------------------------------------------

    suspend fun listPids(): List<PidCatalogEntryDto> = client.query("obd.pids.list")

    suspend fun simulateDiagnostic(diagnosticId: Int, withFaults: Boolean?): DiagnosticStatusResultDto = client.mutate(
        "obd.mock.simulateDiagnostic",
        buildJsonObject {
            put("diagnosticId", diagnosticId)
            withFaults?.let { put("withFaults", it) }
        },
    )

    // --- llm ---------------------------------------------------------------

    suspend fun llmStatus(): LlmStatusDto = client.query("llm.status")

    suspend fun analyzeCode(code: String, description: String?): LlmAnalysisDto = client.mutate(
        "llm.analyzeCode",
        buildJsonObject {
            put("code", code)
            description?.let { put("description", it) }
        },
    )

    suspend fun analyzeDiagnostic(diagnosticId: Int): LlmDiagnosticAnalysisDto =
        client.mutate("llm.analyzeDiagnostic", buildJsonObject { put("diagnosticId", diagnosticId) })
}
