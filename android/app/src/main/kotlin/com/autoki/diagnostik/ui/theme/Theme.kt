package com.autoki.diagnostik.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val Blue = Color(0xFF3B82F6)
private val Teal = Color(0xFF3DDC97)
private val Amber = Color(0xFFF59E0B)
private val Red = Color(0xFFEF4444)

val SeverityInfo = Color(0xFF60A5FA)
val SeverityWarning = Amber
val SeverityError = Color(0xFFF97316)
val SeverityCritical = Red
val StatusOk = Teal

private val DarkColors = darkColorScheme(
    primary = Blue,
    secondary = Teal,
    tertiary = Amber,
    error = Red,
    background = Color(0xFF0B1220),
    surface = Color(0xFF121A2B),
    surfaceVariant = Color(0xFF1C2740),
)

private val LightColors = lightColorScheme(
    primary = Color(0xFF1D4ED8),
    secondary = Color(0xFF0E9F6E),
    tertiary = Amber,
    error = Red,
    background = Color(0xFFF7F9FC),
    surface = Color.White,
    surfaceVariant = Color(0xFFE7ECF5),
)

@Composable
fun AutoKiTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    val colors = if (darkTheme) DarkColors else LightColors
    MaterialTheme(
        colorScheme = colors,
        typography = MaterialTheme.typography,
        content = content,
    )
}
