package com.autoki.diagnostik.data.network

import kotlinx.serialization.Serializable

/**
 * Wire DTOs for the tRPC API (server/routers.ts). Field names match the
 * backend's camelCase JSON exactly — see server/drizzle/schema.ts for the
 * source of truth. Timestamps stay as ISO-8601 strings; the UI formats them
 * with [com.autoki.diagnostik.data.network.parseIsoInstant] where needed.
 */

@Serializable
data class UserDto(
    val id: Int,
    val openId: String,
    val name: String? = null,
    val email: String? = null,
    val loginMethod: String? = null,
    val role: String = "user",
    val createdAt: String? = null,
    val updatedAt: String? = null,
    val lastSignedIn: String? = null,
)

@Serializable
data class VehicleDto(
    val id: Int,
    val userId: Int,
    val vin: String,
    val make: String,
    val model: String,
    val year: Int,
    val engineType: String? = null,
    val fuelType: String? = null,
    val licensePlate: String? = null,
    val mileage: Int? = null,
    val status: String = "active",
    val lastDiagnosisAt: String? = null,
    val createdAt: String? = null,
    val updatedAt: String? = null,
)

@Serializable
data class ObdDeviceDto(
    val id: Int,
    val userId: Int,
    val deviceName: String,
    val deviceType: String,
    val connectionString: String? = null,
    val isActive: Boolean = true,
    val lastConnectedAt: String? = null,
    val createdAt: String? = null,
    val updatedAt: String? = null,
)

@Serializable
data class DiagnosticDto(
    val id: Int,
    val vehicleId: Int,
    val userId: Int,
    val obdDeviceId: Int? = null,
    val diagnosticType: String,
    val status: String,
    val errorCount: Int = 0,
    val warningCount: Int = 0,
    val mileageAtDiagnosis: Int? = null,
    val engineTemperature: Double? = null,
    val rpm: Int? = null,
    val speed: Int? = null,
    val fuelPressure: Double? = null,
    val oxygenSensor: Double? = null,
    val notes: String? = null,
    val startedAt: String? = null,
    val completedAt: String? = null,
    val createdAt: String? = null,
    val updatedAt: String? = null,
)

@Serializable
data class ErrorCodeDto(
    val id: Int,
    val diagnosticId: Int,
    val code: String,
    val description: String? = null,
    val severity: String,
    val system: String? = null,
    val isResolved: Boolean = false,
    val resolvedAt: String? = null,
    val createdAt: String? = null,
)

@Serializable
data class ObdParameterDto(
    val id: Int,
    val diagnosticId: Int,
    val parameterId: String,
    val parameterName: String,
    val value: Double,
    val unit: String? = null,
    val minValue: Double? = null,
    val maxValue: Double? = null,
    val isNormal: Boolean = true,
    val isSimulated: Boolean = false,
    val timestamp: String? = null,
)

@Serializable
data class ValueRangeDto(val min: Double, val max: Double)

@Serializable
data class PidCatalogEntryDto(
    val pid: String,
    val name: String,
    val unit: String,
    val normalRange: ValueRangeDto? = null,
    val displayRange: ValueRangeDto,
)

@Serializable
data class AvailablePortDto(
    val path: String,
    val manufacturer: String? = null,
    val isPresent: Boolean,
)

@Serializable
data class LlmStatusDto(val available: Boolean, val provider: String? = null)

@Serializable
data class LlmAnalysisDto(
    val code: String,
    val description: String,
    val severity: String,
    val rootCause: String,
    val recommendations: List<String> = emptyList(),
    val estimatedRepairCost: String,
    val urgency: String,
    /** Which provider produced this ("openrouter" | "lmstudio" | "fallback"). */
    val source: String,
)

@Serializable
data class LlmDiagnosticAnalysisDto(val analyses: List<LlmAnalysisDto> = emptyList())

@Serializable
data class CreateResultDto(val success: Boolean = true, val vehicleId: Int? = null)

@Serializable
data class DeviceCreateResultDto(val success: Boolean = true, val deviceId: Int? = null)

@Serializable
data class DiagnosticStartResultDto(
    val success: Boolean = true,
    val diagnosticId: Int,
    val status: String,
)

@Serializable
data class DiagnosticStatusResultDto(
    val success: Boolean = true,
    val status: String,
    val errorCount: Int = 0,
    val warningCount: Int = 0,
    val simulated: Boolean = false,
)

@Serializable
data class AddParameterResultDto(val success: Boolean = true, val parameterId: Int? = null)

@Serializable
data class AddErrorCodeResultDto(val success: Boolean = true, val errorCodeId: Int? = null)
