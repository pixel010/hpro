// hpro mobile plugin (P12): what the Android WebView cannot do for the reader.
//
// - documents handed to the app by other apps (ACTION_VIEW from a file manager or mail program,
//   ACTION_SEND from a share sheet), read through the ContentResolver;
// - open and save through the Storage Access Framework (the system picker, no storage permission);
// - printing: `window.print()` does nothing in an Android WebView (docs/06, A10), so the reader's
//   paginated print document is laid out in an off-screen WebView and handed to the PrintManager.
//
// Tauri runs plugin commands on the main thread (run_on_android_context). Everything that reads
// or writes a file runs on the `io` thread and resolves from there, so a large document cannot
// block the UI thread (no ANR, criterion 3 of docs/06 4.4).
package org.hpro.mobil

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.print.PrintAttributes
import android.print.PrintManager
import android.provider.OpenableColumns
import android.util.Base64
import android.util.Log
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.result.ActivityResult
import app.tauri.annotation.ActivityCallback
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSArray
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import java.util.concurrent.Executors

@InvokeArg
class IdArgs {
    lateinit var id: String
}

@InvokeArg
class SaveArgs {
    lateinit var name: String
    var mimeType: String = MIME_HPRO
    lateinit var data: String
}

@InvokeArg
class PrintArgs {
    lateinit var html: String
    var jobName: String = "hpro"
}

const val MIME_HPRO = "application/vnd.hpro+zip"

/** Same limit idea as the desktop shell (256 MiB there); bytes travel base64-encoded here. */
const val MAX_DOCUMENT_BYTES = 64L * 1024 * 1024

private const val TAG = "hpro-mobil"

@TauriPlugin
class HproPlugin(private val activity: Activity) : Plugin(activity) {
    private val io = Executors.newSingleThreadExecutor()
    private val main = Handler(Looper.getMainLooper())

    /** Ids the web side may read: only documents from a launch intent, the picker or a save. */
    private val documents = LinkedHashMap<String, Uri>()
    private val pending = ArrayList<String>()
    private var nextId = 1
    private var webView: WebView? = null
    private var saveBytes: ByteArray? = null

    /** Kept until the print job exists (Android keeps no reference of its own). */
    private var printView: WebView? = null

    override fun load(webView: WebView) {
        this.webView = webView
        queue(activity.intent)
    }

    override fun onNewIntent(intent: Intent) {
        if (queue(intent) > 0) {
            webView?.evaluateJavascript("window.dispatchEvent(new Event('hpro-desktop-open'))", null)
        }
    }

    private fun register(uri: Uri): String {
        documents.entries.firstOrNull { it.value == uri }?.let { return it.key }
        val id = "a${nextId++}"
        documents[id] = uri
        return id
    }

    private fun queue(intent: Intent?): Int {
        if (intent == null) return 0
        val uris = ArrayList<Uri>()
        when (intent.action) {
            Intent.ACTION_VIEW -> intent.data?.let { uris.add(it) }
            Intent.ACTION_SEND -> streamExtra(intent)?.let { uris.add(it) }
        }
        val accepted = uris.filter { it.scheme == "content" || it.scheme == "file" }
        for (u in accepted) pending.add(register(u))
        Log.i(TAG, "launch intent ${intent.action}: ${accepted.size} document(s)")
        // A recreated activity must not deliver the same document a second time.
        intent.action = Intent.ACTION_MAIN
        intent.data = null
        return accepted.size
    }

    @Suppress("DEPRECATION")
    private fun streamExtra(intent: Intent): Uri? =
        if (Build.VERSION.SDK_INT >= 33) intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java)
        else intent.getParcelableExtra(Intent.EXTRA_STREAM)

    /** Name and size as the provider reports them; never a path. */
    private fun describe(id: String, uri: Uri): JSObject {
        var name = uri.lastPathSegment?.substringAfterLast('/') ?: "dokument.hpro"
        var size = -1L
        try {
            activity.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE), null, null, null)?.use { c ->
                if (c.moveToFirst()) {
                    if (!c.isNull(0)) name = c.getString(0)
                    if (!c.isNull(1)) size = c.getLong(1)
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "query $uri: $e")
        }
        val o = JSObject()
        o.put("id", id)
        o.put("name", name)
        o.put("size", size)
        return o
    }

    @Command
    fun takeLaunchDocuments(invoke: Invoke) {
        val ids = ArrayList(pending)
        pending.clear()
        io.execute {
            val list = JSArray()
            for (id in ids) documents[id]?.let { list.put(describe(id, it)) }
            val ret = JSObject()
            ret.put("documents", list)
            invoke.resolve(ret)
        }
    }

    @Command
    fun pickDocument(invoke: Invoke) {
        val intent = Intent(Intent.ACTION_OPEN_DOCUMENT)
            .addCategory(Intent.CATEGORY_OPENABLE)
            .setType("*/*")
        startActivityForResult(invoke, intent, "pickResult")
    }

    @ActivityCallback
    fun pickResult(invoke: Invoke, result: ActivityResult) {
        val uri = result.data?.data
        if (result.resultCode != Activity.RESULT_OK || uri == null) {
            invoke.resolve(JSObject())
            return
        }
        val id = register(uri)
        io.execute {
            val ret = JSObject()
            ret.put("document", describe(id, uri))
            invoke.resolve(ret)
        }
    }

    @Command
    fun readDocument(invoke: Invoke) {
        val args = invoke.parseArgs(IdArgs::class.java)
        val uri = documents[args.id]
        if (uri == null) {
            invoke.reject("unbekanntes Dokument")
            return
        }
        io.execute {
            try {
                val bytes = activity.contentResolver.openInputStream(uri)?.use { input ->
                    val out = java.io.ByteArrayOutputStream()
                    val buf = ByteArray(64 * 1024)
                    var total = 0L
                    while (true) {
                        val n = input.read(buf)
                        if (n < 0) break
                        total += n
                        if (total > MAX_DOCUMENT_BYTES) throw IllegalStateException("Datei zu groß (über $MAX_DOCUMENT_BYTES Bytes)")
                        out.write(buf, 0, n)
                    }
                    out.toByteArray()
                } ?: throw IllegalStateException("nicht lesbar")
                val ret = JSObject()
                ret.put("data", Base64.encodeToString(bytes, Base64.NO_WRAP))
                invoke.resolve(ret)
            } catch (e: Exception) {
                invoke.reject("$uri: ${e.message ?: e}")
            }
        }
    }

    /** Save as: the system's create-document dialog chooses place and final name. */
    @Command
    fun saveDocument(invoke: Invoke) {
        val args = invoke.parseArgs(SaveArgs::class.java)
        io.execute {
            val bytes = try {
                Base64.decode(args.data, Base64.DEFAULT)
            } catch (e: IllegalArgumentException) {
                invoke.reject("Inhalt ist kein Base64")
                return@execute
            }
            main.post {
                saveBytes = bytes
                val intent = Intent(Intent.ACTION_CREATE_DOCUMENT)
                    .addCategory(Intent.CATEGORY_OPENABLE)
                    .setType(args.mimeType)
                    .putExtra(Intent.EXTRA_TITLE, args.name)
                startActivityForResult(invoke, intent, "saveResult")
            }
        }
    }

    @ActivityCallback
    fun saveResult(invoke: Invoke, result: ActivityResult) {
        val uri = result.data?.data
        val bytes = saveBytes
        saveBytes = null
        if (result.resultCode != Activity.RESULT_OK || uri == null || bytes == null) {
            invoke.resolve(JSObject())
            return
        }
        val id = register(uri)
        io.execute {
            try {
                activity.contentResolver.openOutputStream(uri, "wt")?.use { it.write(bytes) } ?: throw IllegalStateException("nicht schreibbar")
                val ret = JSObject()
                ret.put("document", describe(id, uri))
                invoke.resolve(ret)
            } catch (e: Exception) {
                invoke.reject("$uri: ${e.message ?: e}")
            }
        }
    }

    /**
     * Prints a finished print document (HTML with everything inline as data: URIs, built and
     * paginated by the reader, app/src/print.ts) through the Android print framework. No script
     * runs in the print view and it loads nothing from the network.
     */
    @Command
    fun printHtml(invoke: Invoke) {
        val args = invoke.parseArgs(PrintArgs::class.java)
        val view = WebView(activity)
        view.settings.javaScriptEnabled = false
        view.settings.blockNetworkLoads = true
        view.settings.allowFileAccess = false
        view.settings.allowContentAccess = false
        view.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(v: WebView, request: WebResourceRequest) = true

            override fun onPageFinished(v: WebView, url: String) {
                if (printView !== v) return
                try {
                    val pm = activity.getSystemService(Activity.PRINT_SERVICE) as PrintManager
                    val attributes = PrintAttributes.Builder()
                        .setMediaSize(PrintAttributes.MediaSize.ISO_A4)
                        .setColorMode(PrintAttributes.COLOR_MODE_COLOR)
                        .build()
                    val job = pm.print(args.jobName, v.createPrintDocumentAdapter(args.jobName), attributes)
                    val ret = JSObject()
                    ret.put("jobName", args.jobName)
                    ret.put("state", job.info.state)
                    invoke.resolve(ret)
                } catch (e: Exception) {
                    invoke.reject("Drucken: ${e.message ?: e}")
                }
            }
        }
        printView = view
        view.loadDataWithBaseURL(null, args.html, "text/html", "utf-8", null)
    }
}
