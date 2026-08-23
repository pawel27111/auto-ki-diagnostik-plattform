package com.autoki.diagnostik.ui

import androidx.compose.runtime.Composable
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.autoki.diagnostik.AutoKiApplication
import com.autoki.diagnostik.data.AppContainer

/**
 * Builds a [ViewModel] from the app's single [AppContainer], without a DI
 * framework: the container is a handful of plain singletons, so wiring it in
 * by hand at each call site is simpler than the ceremony Hilt would add.
 */
@Composable
inline fun <reified VM : ViewModel> autoKiViewModel(crossinline create: (AppContainer) -> VM): VM {
    val container = (LocalContext.current.applicationContext as AutoKiApplication).container
    return viewModel(factory = viewModelFactory { initializer { create(container) } })
}
