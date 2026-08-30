package com.autoki.diagnostik.data.obd

import android.annotation.SuppressLint
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothSocket
import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.IOException
import java.util.UUID

/**
 * Bluetooth Classic (SPP) link to a paired adapter.
 *
 * Only bonded devices are opened — pairing happens in Android's own Bluetooth
 * settings — so the app never needs the scan and location permissions a live
 * discovery would require.
 */
class BluetoothObdLink private constructor(
    private val socket: BluetoothSocket,
    override val description: String,
) : ObdLink {

    private val input = socket.inputStream
    private val output = socket.outputStream

    override fun read(buffer: ByteArray, timeoutMs: Int): Int {
        // RFCOMM has no read timeout, so a blocking read would hang forever on a
        // silent adapter. Poll `available()` instead and let the caller time out.
        if (input.available() <= 0) return 0
        return input.read(buffer)
    }

    override fun write(bytes: ByteArray) {
        output.write(bytes)
        output.flush()
    }

    override fun flushInput() {
        val scratch = ByteArray(256)
        while (input.available() > 0) {
            if (input.read(scratch) <= 0) break
        }
    }

    override fun close() {
        runCatching { socket.close() }
    }

    companion object {
        private val SPP_UUID: UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB")

        @SuppressLint("MissingPermission") // caller has already checked BLUETOOTH_CONNECT
        suspend fun open(context: Context, device: BluetoothDevice): BluetoothObdLink =
            withContext(Dispatchers.IO) {
                val name = device.name ?: device.address
                val adapter =
                    (context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager)?.adapter
                // Discovery and an open socket compete for the radio.
                adapter?.cancelDiscovery()

                val socket = device.createRfcommSocketToServiceRecord(SPP_UUID)
                try {
                    socket.connect()
                } catch (error: IOException) {
                    runCatching { socket.close() }
                    throw ObdTransportException(
                        "Verbindung zu $name fehlgeschlagen: ${error.message}"
                    )
                }
                BluetoothObdLink(socket, name)
            }
    }
}
