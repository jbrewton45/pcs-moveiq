#import <Capacitor/Capacitor.h>

// Register the plugin methods so Capacitor can call them from JavaScript.
CAP_PLUGIN(RoomScanPlugin, "RoomScanPlugin",
    CAP_PLUGIN_METHOD(startScan,    CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(stopScan,     CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(checkSupport, CAPPluginReturnPromise);
)
