package com.autoki.diagnostik

import android.app.Application
import com.autoki.diagnostik.data.AppContainer

class AutoKiApplication : Application() {
    lateinit var container: AppContainer
        private set

    override fun onCreate() {
        super.onCreate()
        container = AppContainer(this)
    }
}
