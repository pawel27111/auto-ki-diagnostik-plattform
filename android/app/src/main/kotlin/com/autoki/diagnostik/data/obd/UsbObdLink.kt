package com.autoki.diagnostik.data.obd

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.hardware.usb.UsbDevice
import android.hardware.usb.UsbManager
import android.os.Build
import androidx.core.content.ContextCompat
import com.hoho.android.usbserial.driver.UsbSerialPort
import com.hoho.android.usbserial.driver.UsbSerialProber
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import java.io.IOException
import kotlin.coroutines.resume

/** A USB serial adapter the app could talk to, as offered to the user. */
data class UsbObdDevice(
    val deviceId: Int,
    val name: String,
    val vendorId: Int,
    val productId: Int,
) {
    /** `0403:6001` — the identification printed in most cable listings. */
    val hardwareId: String get() = "%04X:%04X".format(vendorId, productId)
}

/**
 * USB serial link, covering FTDI, CH34x, CP21xx, Prolific and CDC-ACM bridges.
 *
 * Two very different things arrive on this port. An ELM327-on-USB behaves
 * exactly like its Bluetooth sibling and is driven by [Elm327Adapter]. A BMW
 * K+DCAN cable is an FTDI chip with nothing behind it, so [KLineAdapter] has to
 * produce the whole protocol itself — which is why this link exposes the baud
 * rate and the break line rather than hiding them.
 */
class UsbObdLink private constructor(
    private val port: UsbSerialPort,
    override val description: String,
) : ObdLink {

    override val supportsLineControl: Boolean get() = true

    private var baudRate: Int = DEFAULT_BAUD_RATE

    override fun read(buffer: ByteArray, timeoutMs: Int): Int =
        try {
            port.read(buffer, timeoutMs)
        } catch (error: IOException) {
            throw ObdTransportException("Lesen vom USB-Adapter fehlgeschlagen: ${error.message}")
        }

    override fun write(bytes: ByteArray) {
        try {
            port.write(bytes, WRITE_TIMEOUT_MS)
        } catch (error: IOException) {
            throw ObdTransportException("Schreiben an den USB-Adapter fehlgeschlagen: ${error.message}")
        }
    }

    override fun flushInput() {
        val scratch = ByteArray(256)
        // A zero timeout returns immediately once the buffer is empty.
        while (runCatching { port.read(scratch, 1) }.getOrDefault(0) > 0) {
            // discard
        }
    }

    override fun setBaudRate(baudRate: Int) {
        this.baudRate = baudRate
        try {
            port.setParameters(baudRate, UsbSerialPort.DATABITS_8, UsbSerialPort.STOPBITS_1, UsbSerialPort.PARITY_NONE)
        } catch (error: IOException) {
            throw ObdTransportException("Baudrate $baudRate konnte nicht gesetzt werden: ${error.message}")
        }
    }

    override fun setBreak(enabled: Boolean) {
        try {
            port.setBreak(enabled)
        } catch (error: IOException) {
            throw ObdTransportException("Break-Steuerung fehlgeschlagen: ${error.message}")
        }
    }

    override fun close() {
        runCatching { port.close() }
    }

    companion object {
        const val DEFAULT_BAUD_RATE = 38400

        /** K-Line runs at 10400 baud in both ISO 9141-2 and ISO 14230. */
        const val K_LINE_BAUD_RATE = 10400

        private const val WRITE_TIMEOUT_MS = 2000
        private const val PERMISSION_ACTION = "com.autoki.diagnostik.USB_PERMISSION"

        /** Every attached device the bundled drivers recognise. */
        fun list(context: Context): List<UsbObdDevice> {
            val manager = context.getSystemService(Context.USB_SERVICE) as? UsbManager ?: return emptyList()
            return UsbSerialProber.getDefaultProber().findAllDrivers(manager).map { driver ->
                val device = driver.device
                UsbObdDevice(
                    deviceId = device.deviceId,
                    name = device.productName ?: driver.javaClass.simpleName.removeSuffix("SerialDriver"),
                    vendorId = device.vendorId,
                    productId = device.productId,
                )
            }
        }

        /**
         * Opens [deviceId] at [baudRate], asking the user for USB permission first.
         *
         * Android grants USB access per device and per app, and the dialogue is
         * asynchronous — hence the suspend. If the user has ticked "use by
         * default for this device" the grant is already in place and no dialogue
         * appears.
         */
        suspend fun open(context: Context, deviceId: Int, baudRate: Int = DEFAULT_BAUD_RATE): UsbObdLink {
            val appContext = context.applicationContext
            val manager = appContext.getSystemService(Context.USB_SERVICE) as? UsbManager
                ?: throw ObdTransportException("Dieses Gerät bietet keinen USB-Host-Zugriff")

            val driver = UsbSerialProber.getDefaultProber().findAllDrivers(manager)
                .firstOrNull { it.device.deviceId == deviceId }
                ?: throw ObdTransportException("USB-Adapter nicht mehr angeschlossen")

            val device = driver.device
            val name = device.productName ?: "USB-Adapter"

            if (!manager.hasPermission(device) && !requestPermission(appContext, manager, device)) {
                throw ObdTransportException("Zugriff auf $name wurde abgelehnt")
            }

            return withContext(Dispatchers.IO) {
                val connection = manager.openDevice(device)
                    ?: throw ObdTransportException("$name konnte nicht geöffnet werden")
                val port = driver.ports.firstOrNull()
                    ?: throw ObdTransportException("$name meldet keinen seriellen Anschluss")

                try {
                    port.open(connection)
                    port.setParameters(
                        baudRate,
                        UsbSerialPort.DATABITS_8,
                        UsbSerialPort.STOPBITS_1,
                        UsbSerialPort.PARITY_NONE,
                    )
                    // DTR/RTS asserted: several ELM327 clones stay mute otherwise.
                    runCatching { port.dtr = true }
                    runCatching { port.rts = true }
                } catch (error: IOException) {
                    runCatching { port.close() }
                    throw ObdTransportException("$name ließ sich nicht öffnen: ${error.message}")
                }

                UsbObdLink(port, name).also { it.baudRate = baudRate }
            }
        }

        /** Shows Android's USB permission dialogue and waits for the answer. */
        private suspend fun requestPermission(
            context: Context,
            manager: UsbManager,
            device: UsbDevice,
        ): Boolean = suspendCancellableCoroutine { continuation ->
            val receiver = object : BroadcastReceiver() {
                override fun onReceive(receiverContext: Context, intent: Intent) {
                    if (intent.action != PERMISSION_ACTION) return
                    runCatching { context.unregisterReceiver(this) }
                    if (continuation.isActive) {
                        continuation.resume(
                            intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false)
                        )
                    }
                }
            }

            ContextCompat.registerReceiver(
                context,
                receiver,
                IntentFilter(PERMISSION_ACTION),
                ContextCompat.RECEIVER_NOT_EXPORTED,
            )
            continuation.invokeOnCancellation { runCatching { context.unregisterReceiver(receiver) } }

            // The system writes EXTRA_PERMISSION_GRANTED into this intent, so it
            // has to stay mutable where the platform lets us say either way.
            val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) PendingIntent.FLAG_MUTABLE else 0
            val permissionIntent = PendingIntent.getBroadcast(
                context,
                0,
                Intent(PERMISSION_ACTION).setPackage(context.packageName),
                flags,
            )
            manager.requestPermission(device, permissionIntent)
        }
    }
}
