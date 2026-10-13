package org.hpro.reader.capacitor;

import android.util.Log;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.WebViewListener;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileWriter;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import org.json.JSONObject;

/**
 * Debug build only (mobil/scripts/e2e-capacitor.sh): the IPC isolation test of the Tauri shell
 * (mobil/e2e/android-probe.js, mode ipc) for Capacitor. A plugin with a canary method counts its
 * calls, every call that reaches native code is recorded in files/e2e/record.jsonl, and the
 * driver mobil/e2e/capacitor-probe.js runs in the main frame once the page has loaded.
 */
final class E2e {
    private static final String TAG = "hpro-e2e";
    private static final AtomicBoolean DRIVER_STARTED = new AtomicBoolean(false);
    static File record;

    private E2e() {}

    static synchronized void note(String kind, String value) {
        Log.i(TAG, kind + " " + value);
        if (record == null) return;
        try (FileWriter w = new FileWriter(record, true)) {
            JSONObject o = new JSONObject();
            o.put("t", System.currentTimeMillis());
            o.put("kind", kind);
            o.put("value", value);
            w.write(o.toString() + "\n");
        } catch (Exception e) {
            Log.w(TAG, "record: " + e);
        }
    }

    static void beforeCreate(BridgeActivity activity) {
        File dir = new File(activity.getFilesDir(), "e2e");
        dir.mkdirs();
        record = new File(dir, "record.jsonl");
        activity.registerPlugin(E2ePlugin.class);
        note("start", dir.getAbsolutePath());
    }

    static void afterCreate(BridgeActivity activity) {
        activity.getBridge().addWebViewListener(new WebViewListener() {
            @Override
            public void onPageLoaded(WebView webView) {
                note("page-load", String.valueOf(webView.getUrl()));
                if (DRIVER_STARTED.getAndSet(true)) return;
                try (InputStream in = activity.getAssets().open("capacitor-probe.js")) {
                    String js = new String(in.readAllBytes(), StandardCharsets.UTF_8);
                    webView.evaluateJavascript(js, null);
                } catch (IOException e) {
                    note("driver-error", e.toString());
                }
            }
        });
    }

    @CapacitorPlugin(name = "E2e")
    public static class E2ePlugin extends Plugin {
        private static final AtomicInteger CANARY = new AtomicInteger();

        @Override
        protected void handleOnStart() {}

        @PluginMethod
        public void canary(PluginCall call) {
            int n = CANARY.incrementAndGet();
            note("canary", n + " " + call.getString("origin", "?"));
            JSObject ret = new JSObject();
            ret.put("n", n);
            call.resolve(ret);
        }

        @PluginMethod
        public void report(PluginCall call) {
            note("report", String.valueOf(call.getObject("value")));
            call.resolve();
        }

        @PluginMethod
        public void exit(PluginCall call) {
            note("exit", "0");
            call.resolve();
            getActivity().finishAndRemoveTask();
        }
    }
}
