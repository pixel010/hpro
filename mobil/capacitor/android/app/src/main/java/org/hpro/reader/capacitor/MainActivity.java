package org.hpro.reader.capacitor;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

/**
 * Comparison shell for the P12 spike: the same web core as the Tauri app (huelle/dist-web) in
 * Capacitor 8. The debug build adds the IPC isolation test (src/debug, E2e); release builds get
 * the no-op from src/release.
 */
public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        E2e.beforeCreate(this);
        super.onCreate(savedInstanceState);
        E2e.afterCreate(this);
    }
}
