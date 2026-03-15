package com.triteam.nowo.plugins;

import android.app.Activity;
import android.content.IntentSender;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import com.google.android.gms.common.api.ResolvableApiException;
import com.google.android.gms.location.LocationRequest;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.location.LocationSettingsRequest;
import com.google.android.gms.location.LocationSettingsResponse;
import com.google.android.gms.location.Priority;
import com.google.android.gms.location.SettingsClient;
import com.google.android.gms.tasks.Task;

@CapacitorPlugin(name = "LocationSettings")
public class LocationSettingsPlugin extends Plugin {

    private static final String TAG = "LocationSettingsPlugin";
    private static final int REQUEST_CODE = 10001;
    private PluginCall savedCall;

    @PluginMethod
    public void requestLocationServices(final PluginCall call) {
        Activity activity = getActivity();
        if (activity == null) {
            call.reject("Activity unavailable");
            return;
        }

        LocationRequest locationRequest = new LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 5000)
                .setMinUpdateIntervalMillis(2000)
                .build();

        LocationSettingsRequest settingsRequest = new LocationSettingsRequest.Builder()
                .addLocationRequest(locationRequest)
                .setAlwaysShow(true)
                .build();

        SettingsClient client = LocationServices.getSettingsClient(activity);
        Task<LocationSettingsResponse> task = client.checkLocationSettings(settingsRequest);

        task.addOnSuccessListener(activity, response -> {
            JSObject result = new JSObject();
            result.put("status", "enabled");
            call.resolve(result);
        });

        task.addOnFailureListener(activity, e -> {
            if (e instanceof ResolvableApiException) {
                try {
                    savedCall = call;
                    ((ResolvableApiException) e).startResolutionForResult(activity, REQUEST_CODE);
                } catch (IntentSender.SendIntentException ex) {
                    Log.e(TAG, "Could not start resolution", ex);
                    call.reject("Failed to show dialog: " + ex.getMessage());
                }
            } else {
                Log.w(TAG, "Location not resolvable: " + e.getMessage());
                JSObject result = new JSObject();
                result.put("status", "unavailable");
                call.resolve(result);
            }
        });
    }

    // Called by Android when user responds to the Turn On Location? dialog
    @Override
    protected void handleOnActivityResult(int requestCode, int resultCode, android.content.Intent data) {
        super.handleOnActivityResult(requestCode, resultCode, data);
        if (requestCode == REQUEST_CODE && savedCall != null) {
            JSObject result = new JSObject();
            result.put("status", resultCode == Activity.RESULT_OK ? "enabled" : "denied");
            savedCall.resolve(result);
            savedCall = null;
        }
    }
}