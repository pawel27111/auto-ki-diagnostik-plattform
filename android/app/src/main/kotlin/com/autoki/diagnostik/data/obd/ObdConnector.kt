package com.autoki.diagnostik.data.obd

import android.bluetooth.BluetoothDevice
import android.content.Context
import com.autoki.diagnostik.core.CountByteMode

/**
 * Puts a link and an adapter together.
 *
 * The two choices are independent — how the adapter is attached, and what kind
 * of adapter it is — with one exception: a bare K-Line cable needs the serial
 * line driven directly, which Bluetooth RFCOMM cannot do. That combination is
 * refused here with an explanation rather than failing later inside a wake-up.
 */
object ObdConnector {

    suspend fun connectBluetooth(
        context: Context,
        device: BluetoothDevice,
        adapterType: ObdAdapterType,
    ): ObdAdapter {
        if (adapterType.requiresLineControl) {
            throw ObdTransportException(
                "Ein K+DCAN-Kabel lässt sich nicht über Bluetooth betreiben — es braucht eine USB-Verbindung"
            )
        }
        val link = BluetoothObdLink.open(context, device)
        return finish(link, adapterType)
    }

    /**
     * Opens a USB adapter, falling back to K-Line when an ELM327 stays silent.
     *
     * The two kinds are indistinguishable before you talk to them — a bare
     * K+DCAN cable and an ELM327-on-USB are both FTDI bridges reporting the
     * same identifiers — so the wrong pick cannot be caught by inspection, only
     * by trying. Picking wrongly used to end the session with a message about
     * the vehicle, which is the least useful place to learn about a setting.
     *
     * The fallback runs only in that direction: an ELM327 that does not answer
     * might be a bare cable, while a failed wake-up on a cable the user
     * explicitly chose is a real fault worth reporting rather than papering
     * over with a second attempt.
     */
    suspend fun connectUsb(
        context: Context,
        deviceId: Int,
        adapterType: ObdAdapterType,
    ): ObdAdapter {
        try {
            return openUsb(context, deviceId, adapterType)
        } catch (silent: ElmUnresponsiveException) {
            if (adapterType.requiresLineControl) throw silent
        }
        return openUsb(context, deviceId, ObdAdapterType.KLINE)
    }

    private suspend fun openUsb(
        context: Context,
        deviceId: Int,
        adapterType: ObdAdapterType,
    ): ObdAdapter {
        val baudRate =
            if (adapterType.requiresLineControl) UsbObdLink.K_LINE_BAUD_RATE
            else UsbObdLink.DEFAULT_BAUD_RATE
        val link = UsbObdLink.open(context, deviceId, baudRate)
        return finish(link, adapterType)
    }

    /** Builds the adapter and runs its initialisation, closing the link on failure. */
    private suspend fun finish(link: ObdLink, adapterType: ObdAdapterType): ObdAdapter {
        val adapter = when (adapterType) {
            ObdAdapterType.ELM327 -> Elm327Adapter(link, CountByteMode.AUTO)
            ObdAdapterType.ELM327_CAN -> Elm327Adapter(link, CountByteMode.PRESENT)
            ObdAdapterType.KLINE -> KLineAdapter(link)
        }
        try {
            adapter.initialize()
        } catch (error: Throwable) {
            // Closes the link too — the fallback re-opens the same device and
            // Android hands out one connection per device at a time.
            adapter.close()
            throw error
        }
        return adapter
    }
}
