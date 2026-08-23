package com.autoki.diagnostik.ui.screens

import android.annotation.SuppressLint
import android.webkit.CookieManager
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import com.autoki.diagnostik.data.network.TrpcClient

/**
 * OAuth login, done in-app: server/_core/oauth.ts drives the whole exchange as
 * a server-side redirect chain (login → identity portal → callback → session
 * cookie → /dashboard), exactly like the web app. A WebView runs that chain
 * unmodified; once the identity provider hands back to our own origin with a
 * session cookie set, this screen picks the cookie out of Android's
 * CookieManager and hands it to [onLoggedIn] — no separate token exchange to
 * reimplement.
 */
@SuppressLint("SetJavaScriptEnabled")
@Composable
fun LoginScreen(serverBaseUrl: String, onLoggedIn: (String) -> Unit, onChangeServer: () -> Unit) {
    var loading by remember { mutableStateOf(true) }

    Scaffold(
        topBar = { TopAppBar(title = { Text("Anmeldung") }) },
    ) { padding ->
        Column(modifier = Modifier.fillMaxSize().padding(padding)) {
            Column(modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp)) {
                Text(text = "Server: $serverBaseUrl", style = MaterialTheme.typography.bodySmall)
                TextButton(onClick = onChangeServer) { Text("Server ändern") }
            }
            if (loading) {
                Column(
                    modifier = Modifier.fillMaxSize(),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.Center,
                ) {
                    CircularProgressIndicator()
                }
            }
            AndroidView(
                modifier = Modifier.fillMaxSize(),
                factory = { context ->
                    CookieManager.getInstance().setAcceptCookie(true)
                    WebView(context).apply {
                        settings.javaScriptEnabled = true
                        settings.domStorageEnabled = true
                        CookieManager.getInstance().setAcceptThirdPartyCookies(this, true)
                        webViewClient = object : WebViewClient() {
                            override fun onPageFinished(view: WebView, url: String) {
                                loading = false
                                val cookies = CookieManager.getInstance().getCookie(serverBaseUrl)
                                val sessionCookie = cookies
                                    ?.split(";")
                                    ?.map { it.trim() }
                                    ?.firstOrNull { it.startsWith("${TrpcClient.SESSION_COOKIE_NAME}=") }
                                    ?.substringAfter("=")
                                if (!sessionCookie.isNullOrBlank()) {
                                    onLoggedIn(sessionCookie)
                                }
                            }
                        }
                        loadUrl("$serverBaseUrl/api/oauth/login")
                    }
                },
            )
        }
    }
}
