package com.autoki.diagnostik.data.obd

import android.Manifest
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothManager
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.content.ContextCompat

data class PairedDevice(val name: String, val address: String, val device: BluetoothDevice)

object BluetoothDevices {

    /** The one runtime permission this app needs: connecting to an already-bonded device. */
    fun connectPermission(): String? =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) Manifest.permission.BLUETOOTH_CONNECT else null

    fun hasConnectPermission(context: Context): Boolean {
        val permission = connectPermission() ?: return true
        return ContextCompat.checkSelfPermission(context, permission) == PackageManager.PERMISSION_GRANTED
    }

    fun isBluetoothAvailable(context: Context): Boolean = adapter(context) != null

    fun isBluetoothEnabled(context: Context): Boolean = adapter(context)?.isEnabled == true

    @Suppress("MissingPermission") // callers gate this on hasConnectPermission()
    fun bondedDevices(context: Context): List<PairedDevice> {
        if (!hasConnectPermission(context)) return emptyList()
        val bonded = adapter(context)?.bondedDevices ?: return emptyList()
        return bonded.map { PairedDevice(it.name ?: it.address, it.address, it) }
    }

    private fun adapter(context: Context): BluetoothAdapter? =
        (context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager)?.adapter
}
