package com.triteam.nowo;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;

import com.triteam.nowo.plugins.LocationSettingsPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(LocationSettingsPlugin.class);  // ← add BEFORE super.onCreate()
        super.onCreate(savedInstanceState);
    }
}