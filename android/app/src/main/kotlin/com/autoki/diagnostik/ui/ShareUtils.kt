package com.autoki.diagnostik.ui

import android.content.Context
import android.content.Intent
import androidx.core.content.FileProvider
import java.io.File

private const val UTF8_BOM = "﻿"

/** Shares a diagnostic report CSV through Android's share sheet, mirroring the web app's download button. */
fun shareCsvReport(context: Context, diagnosticId: Int, csv: String) {
    val dir = File(context.cacheDir, "reports").apply { mkdirs() }
    val file = File(dir, "diagnose-$diagnosticId.csv")
    // The BOM makes Excel read the file as UTF-8, matching client/src/lib/report.ts.
    file.writeText(UTF8_BOM + csv, Charsets.UTF_8)

    val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
    val intent = Intent(Intent.ACTION_SEND).apply {
        type = "text/csv"
        putExtra(Intent.EXTRA_STREAM, uri)
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    }
    context.startActivity(Intent.createChooser(intent, "Diagnosebericht teilen"))
}
