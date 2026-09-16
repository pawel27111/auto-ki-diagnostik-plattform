package com.autoki.diagnostik.data.network

import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle

private val displayFormatter = DateTimeFormatter
    .ofLocalizedDateTime(FormatStyle.MEDIUM, FormatStyle.SHORT)
    .withZone(ZoneId.systemDefault())

/** Parses a superjson-serialized `Date` (plain ISO-8601 string) for display. Returns null for anything unparsable. */
fun parseIsoInstant(value: String?): Instant? =
    if (value.isNullOrBlank()) null else runCatching { Instant.parse(value) }.getOrNull()

fun formatTimestamp(value: String?): String = parseIsoInstant(value)?.let(displayFormatter::format) ?: "—"
