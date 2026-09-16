package com.autoki.diagnostik.data.network

import com.autoki.diagnostik.data.prefs.SettingsStore
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException
import java.net.URLEncoder

private val JSON_MEDIA_TYPE = "application/json; charset=utf-8".toMediaType()

/** A tRPC error response, mirroring server/_core/trpc.ts's TRPCError codes. */
class TrpcException(
    val trpcCode: String,
    message: String,
    val httpStatus: Int? = null,
) : IOException(message)

/**
 * Minimal tRPC HTTP client for the non-batched endpoint form that
 * `@trpc/server/adapters/express` accepts alongside the web app's batch link:
 * `GET /api/trpc/<path>?input=<uri-encoded {"json":...}>` for queries and
 * `POST /api/trpc/<path>` with a `{"json":...}` body for mutations.
 *
 * The backend's superjson transformer wraps every payload as `{"json":...,
 * "meta":...}`; only the `json` branch is read here; `meta` (which mostly
 * exists to revive `Date` objects) is not needed since dates are consumed as
 * plain ISO-8601 strings on this client.
 *
 * The session cookie set by the OAuth WebView flow (see LoginScreen) is
 * attached by hand rather than through a cookie jar, since there is exactly
 * one cookie to track. Mutations also carry an explicit `Origin` header,
 * matching what server/_core/csrf.ts checks in production.
 */
class TrpcClient(
    private val settingsStore: SettingsStore,
    private val httpClient: OkHttpClient = OkHttpClient(),
) {
    /** Invoked after a request comes back UNAUTHORIZED, once the stored session has been cleared. */
    var onUnauthorized: (suspend () -> Unit)? = null

    @PublishedApi
    internal val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
    }

    suspend inline fun <reified T> query(path: String, input: JsonElement? = null): T =
        json.decodeFromJsonElement(request(method = "GET", path = path, input = input))

    suspend inline fun <reified T> mutate(path: String, input: JsonElement? = null): T =
        json.decodeFromJsonElement(request(method = "POST", path = path, input = input))

    suspend fun request(method: String, path: String, input: JsonElement?): JsonElement =
        withContext(Dispatchers.IO) {
            val settings = settingsStore.settings.first()
            val baseUrl = settings.serverBaseUrl.ifBlank {
                throw TrpcException("CLIENT_CONFIG", "Server-Adresse ist nicht konfiguriert")
            }

            val envelope = buildJsonObject { put("json", input ?: JsonObject(emptyMap())) }

            val urlBuilder = StringBuilder("$baseUrl/api/trpc/$path")
            if (method == "GET" && input != null) {
                urlBuilder.append("?input=")
                urlBuilder.append(URLEncoder.encode(envelope.toString(), "UTF-8"))
            }

            val requestBuilder = Request.Builder().url(urlBuilder.toString())
            settings.sessionCookie?.let { cookie ->
                requestBuilder.addHeader("Cookie", "$SESSION_COOKIE_NAME=$cookie")
            }

            if (method == "POST") {
                requestBuilder
                    .addHeader("Origin", baseUrl)
                    .post(envelope.toString().toRequestBody(JSON_MEDIA_TYPE))
            } else {
                requestBuilder.get()
            }

            val response = httpClient.newCall(requestBuilder.build()).execute()
            val bodyText = response.use { it.body?.string() }
                ?: throw TrpcException("NETWORK", "Leere Antwort vom Server")

            val root = runCatching { json.parseToJsonElement(bodyText).jsonObject }
                .getOrElse {
                    throw TrpcException(
                        "PARSE_ERROR",
                        "Unerwartete Antwort vom Server (HTTP ${response.code})",
                        response.code,
                    )
                }

            root["error"]?.let { errorElement ->
                throw parseTrpcError(errorElement.jsonObject, response.code).also { trpcError ->
                    if (trpcError.trpcCode == "UNAUTHORIZED") {
                        settingsStore.setSessionCookie(null)
                        onUnauthorized?.invoke()
                    }
                }
            }

            val data = root["result"]?.jsonObject?.get("data")
                ?: throw TrpcException("PARSE_ERROR", "Antwort ohne Ergebnis", response.code)

            (data as? JsonObject)?.get("json") ?: data
        }

    private fun parseTrpcError(errorElement: JsonObject, httpStatus: Int): TrpcException {
        val errorJson = (errorElement["json"] as? JsonObject) ?: errorElement
        val message = errorJson["message"]?.jsonPrimitive?.content ?: "Unbekannter Fehler"
        val code = (errorJson["data"] as? JsonObject)?.get("code")?.jsonPrimitive?.content
            ?: "INTERNAL_SERVER_ERROR"
        return TrpcException(code, message, httpStatus)
    }

    companion object {
        const val SESSION_COOKIE_NAME = "app_session_id"
    }
}
