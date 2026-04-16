import UIKit
import Capacitor

// Custom Capacitor bridge root view controller.
// Explicit plugin registration is the Capacitor 8 + SPM recommended path for
// app-local plugins. The CAP_PLUGIN(...) macro in RoomScanPlugin+Register.m
// relies on ObjC category runtime discovery, which the linker can dead-strip
// in SPM setups that do not pass -ObjC. Registering the instance here makes
// the plugin discoverable regardless of linker flags.
class MainViewController: CAPBridgeViewController {

    override open func capacitorDidLoad() {
        super.capacitorDidLoad()
        print("[MainViewController] capacitorDidLoad — registering custom plugins")

        if #available(iOS 16, *) {
            bridge?.registerPluginInstance(RoomScanPlugin())
            print("[MainViewController] Registered RoomScanPlugin (iOS 16+)")
        } else {
            print("[MainViewController] iOS < 16 — RoomScanPlugin unavailable (RoomPlan requires iOS 16)")
        }
    }
}
