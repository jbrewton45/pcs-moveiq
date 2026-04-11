import Foundation
import Capacitor
import RoomPlan
import ARKit

// ─────────────────────────────────────────────────────────────────────────────
//  RoomScanPlugin
//  Capacitor plugin that wraps Apple's RoomPlan framework (iOS 16+, LiDAR).
//  Presents a full-screen RoomCaptureView, runs the scan, and returns the
//  captured room's dimensions and surfaces back to JavaScript.
// ─────────────────────────────────────────────────────────────────────────────

@objc(RoomScanPlugin)
public class RoomScanPlugin: CAPPlugin {

    private var captureController: RoomCaptureViewController?
    private var currentCall: CAPPluginCall?

    // ── startScan ─────────────────────────────────────────────────────────────
    // JS: RoomScanPlugin.startScan()
    // Presents the RoomPlan capture UI modally. Resolves when scanning finishes.

    @objc func startScan(_ call: CAPPluginCall) {
        guard RoomCaptureSession.isSupported else {
            call.reject("LiDAR scanning is not supported on this device. Requires iPhone 12 Pro or later.")
            return
        }

        currentCall = call

        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }

            let vc = RoomCaptureViewController()
            vc.delegate = self
            vc.modalPresentationStyle = .fullScreen

            self.captureController = vc
            self.bridge?.viewController?.present(vc, animated: true)
        }
    }

    // ── stopScan ──────────────────────────────────────────────────────────────
    // JS: RoomScanPlugin.stopScan()
    // Programmatically stops a running scan session.

    @objc func stopScan(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            self?.captureController?.stopSession()
            call.resolve()
        }
    }

    // ── checkSupport ──────────────────────────────────────────────────────────
    // JS: RoomScanPlugin.checkSupport()
    // Returns whether the current device supports LiDAR room scanning.

    @objc func checkSupport(_ call: CAPPluginCall) {
        call.resolve(["supported": RoomCaptureSession.isSupported])
    }
}

// ─────────────────────────────────────────────────────────────────────────────
//  RoomCaptureViewControllerDelegate
//  Receives scan results from RoomPlan and packages them for JavaScript.
// ─────────────────────────────────────────────────────────────────────────────

extension RoomScanPlugin: RoomCaptureViewControllerDelegate {

    // Called when the user taps "Done" or the session finishes
    public func captureView(
        _ view: RoomCaptureView,
        didFinishWith result: CapturedRoomData,
        error: Error?
    ) {
        if let error = error {
            currentCall?.reject("Scan failed: \(error.localizedDescription)")
            currentCall = nil
            return
        }

        // Process the captured room data on a background thread
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            guard let self = self else { return }

            do {
                let finalRoom = try RoomBuilder(outputOptions: [.floorPolygon])
                    .capturedRoom(from: result)

                let payload = self.buildPayload(from: finalRoom)

                DispatchQueue.main.async {
                    self.captureController?.dismiss(animated: true)
                    self.captureController = nil
                    self.currentCall?.resolve(payload)
                    self.currentCall = nil
                }
            } catch {
                DispatchQueue.main.async {
                    self.captureController?.dismiss(animated: true)
                    self.captureController = nil
                    self.currentCall?.reject("Failed to build room model: \(error.localizedDescription)")
                    self.currentCall = nil
                }
            }
        }
    }

    // Called if the user cancels
    public func captureViewDidCancel(_ view: RoomCaptureView) {
        DispatchQueue.main.async { [weak self] in
            self?.captureController?.dismiss(animated: true)
            self?.captureController = nil
            self?.currentCall?.reject("Scan cancelled by user")
            self?.currentCall = nil
        }
    }

    // ── buildPayload ──────────────────────────────────────────────────────────
    // Converts a CapturedRoom into a JSON-serialisable dictionary for JS.

    private func buildPayload(from room: CapturedRoom) -> JSObject {
        // Floor polygon (array of 2D points in metres)
        let floorPoints: [[String: Double]] = room.floors.flatMap { floor in
            floor.polygon.map { point in
                ["x": Double(point.x), "z": Double(point.y)]
            }
        }

        // Wall surfaces
        let walls: [JSObject] = room.walls.map { wall in
            let dims = wall.dimensions  // simd_float3: width, height, depth
            return [
                "widthM":  Double(dims.x),
                "heightM": Double(dims.y),
                "confidence": wall.confidence.rawValue,
                "hasDoor":   false,   // refined below
                "hasWindow": false,
            ]
        }

        // Doors
        let doors: [JSObject] = room.doors.map { door in
            let dims = door.dimensions
            return [
                "widthM":  Double(dims.x),
                "heightM": Double(dims.y),
                "confidence": door.confidence.rawValue,
            ]
        }

        // Windows
        let windows: [JSObject] = room.windows.map { win in
            let dims = win.dimensions
            return [
                "widthM":  Double(dims.x),
                "heightM": Double(dims.y),
                "confidence": win.confidence.rawValue,
            ]
        }

        // Identified objects (furniture etc.)
        let objects: [JSObject] = room.objects.map { obj in
            let dims = obj.dimensions
            return [
                "label":   obj.category.description,
                "widthM":  Double(dims.x),
                "heightM": Double(dims.y),
                "depthM":  Double(dims.z),
                "confidence": obj.confidence.rawValue,
            ]
        }

        // Overall bounding box (rough room dimensions)
        let allPoints = floorPoints
        let xs = allPoints.map { $0["x"] ?? 0 }
        let zs = allPoints.map { $0["z"] ?? 0 }
        let width  = (xs.max() ?? 0) - (xs.min() ?? 0)
        let length = (zs.max() ?? 0) - (zs.min() ?? 0)

        return [
            "widthM":   width,
            "lengthM":  length,
            "areaSqM":  width * length,
            "floorPolygon": floorPoints,
            "walls":    walls,
            "doors":    doors,
            "windows":  windows,
            "objects":  objects,
            "wallCount": room.walls.count,
            "doorCount": room.doors.count,
            "windowCount": room.windows.count,
        ]
    }
}

// ─────────────────────────────────────────────────────────────────────────────
//  RoomCaptureViewController
//  Wraps RoomCaptureView in a UIViewController with a minimal HUD.
// ─────────────────────────────────────────────────────────────────────────────

public class RoomCaptureViewController: UIViewController {

    weak var delegate: RoomCaptureViewControllerDelegate?

    private var captureView: RoomCaptureView!
    private var captureSession: RoomCaptureSession!
    private var statusLabel: UILabel!
    private var doneButton: UIButton!
    private var cancelButton: UIButton!
    private var instructionLabel: UILabel!

    public override func viewDidLoad() {
        super.viewDidLoad()
        setupCapture()
        setupHUD()
    }

    public override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        startSession()
    }

    public override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        captureSession?.stop()
    }

    // ── Setup ─────────────────────────────────────────────────────────────────

    private func setupCapture() {
        captureSession = RoomCaptureSession()
        captureSession.delegate = self

        captureView = RoomCaptureView(frame: view.bounds)
        captureView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        captureView.captureSession = captureSession
        view.addSubview(captureView)
    }

    private func setupHUD() {
        view.backgroundColor = .black

        // Cancel button (top-left)
        cancelButton = UIButton(type: .system)
        cancelButton.setTitle("Cancel", for: .normal)
        cancelButton.setTitleColor(.white, for: .normal)
        cancelButton.titleLabel?.font = .systemFont(ofSize: 17, weight: .semibold)
        cancelButton.backgroundColor = UIColor.black.withAlphaComponent(0.5)
        cancelButton.layer.cornerRadius = 20
        cancelButton.contentEdgeInsets = UIEdgeInsets(top: 8, left: 16, bottom: 8, right: 16)
        cancelButton.addTarget(self, action: #selector(cancelTapped), for: .touchUpInside)
        cancelButton.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(cancelButton)

        // Status label (top-centre)
        statusLabel = UILabel()
        statusLabel.text = "Scanning…"
        statusLabel.textColor = .white
        statusLabel.font = .systemFont(ofSize: 15, weight: .medium)
        statusLabel.backgroundColor = UIColor.black.withAlphaComponent(0.5)
        statusLabel.textAlignment = .center
        statusLabel.layer.cornerRadius = 12
        statusLabel.clipsToBounds = true
        statusLabel.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(statusLabel)

        // Instruction label (bottom area)
        instructionLabel = UILabel()
        instructionLabel.text = "Walk slowly around the room,\npointing your camera at walls, floor and ceiling."
        instructionLabel.textColor = .white
        instructionLabel.font = .systemFont(ofSize: 14, weight: .regular)
        instructionLabel.numberOfLines = 2
        instructionLabel.textAlignment = .center
        instructionLabel.backgroundColor = UIColor.black.withAlphaComponent(0.55)
        instructionLabel.layer.cornerRadius = 12
        instructionLabel.clipsToBounds = true
        instructionLabel.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(instructionLabel)

        // Done button (bottom-centre)
        doneButton = UIButton(type: .system)
        doneButton.setTitle("Done Scanning", for: .normal)
        doneButton.setTitleColor(.white, for: .normal)
        doneButton.titleLabel?.font = .systemFont(ofSize: 17, weight: .bold)
        doneButton.backgroundColor = UIColor(red: 0.23, green: 0.51, blue: 0.96, alpha: 1)
        doneButton.layer.cornerRadius = 26
        doneButton.addTarget(self, action: #selector(doneTapped), for: .touchUpInside)
        doneButton.translatesAutoresizingMaskIntoConstraints = false
        doneButton.isEnabled = false
        doneButton.alpha = 0.5
        view.addSubview(doneButton)

        NSLayoutConstraint.activate([
            cancelButton.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 16),
            cancelButton.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 16),
            cancelButton.heightAnchor.constraint(equalToConstant: 40),

            statusLabel.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 16),
            statusLabel.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            statusLabel.heightAnchor.constraint(equalToConstant: 40),
            statusLabel.widthAnchor.constraint(greaterThanOrEqualToConstant: 120),

            instructionLabel.bottomAnchor.constraint(equalTo: doneButton.topAnchor, constant: -16),
            instructionLabel.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 24),
            instructionLabel.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -24),

            doneButton.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -24),
            doneButton.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            doneButton.widthAnchor.constraint(equalToConstant: 200),
            doneButton.heightAnchor.constraint(equalToConstant: 52),
        ])
    }

    // ── Session control ───────────────────────────────────────────────────────

    private func startSession() {
        let config = RoomCaptureSession.Configuration()
        captureSession.run(configuration: config)
    }

    func stopSession() {
        captureSession.stop()
    }

    // ── Actions ───────────────────────────────────────────────────────────────

    @objc private func cancelTapped() {
        captureSession.stop()
        delegate?.captureViewDidCancel(captureView)
    }

    @objc private func doneTapped() {
        doneButton.isEnabled = false
        statusLabel.text = "Processing…"
        captureSession.stop()
    }
}

// ─────────────────────────────────────────────────────────────────────────────
//  RoomCaptureSessionDelegate
//  Updates the HUD based on real-time scan feedback.
// ─────────────────────────────────────────────────────────────────────────────

extension RoomCaptureViewController: RoomCaptureSessionDelegate {

    public func captureSession(_ session: RoomCaptureSession,
                               didUpdate room: CapturedRoom) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            let wallCount = room.walls.count
            let pct = min(100, wallCount * 8)   // rough progress heuristic

            self.statusLabel.text = "Scanning… \(pct)%"

            // Enable Done once we have at least a few walls
            if wallCount >= 3 && !self.doneButton.isEnabled {
                UIView.animate(withDuration: 0.3) {
                    self.doneButton.isEnabled = true
                    self.doneButton.alpha = 1.0
                }
                self.instructionLabel.text = "Looking good! Tap Done when finished,\nor keep scanning for better accuracy."
            }
        }
    }

    public func captureSession(_ session: RoomCaptureSession,
                               didEndWith data: CapturedRoomData,
                               error: Error?) {
        DispatchQueue.main.async { [weak self] in
            self?.delegate?.captureView(
                self!.captureView,
                didFinishWith: data,
                error: error
            )
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Protocol alias so the plugin delegate methods are clean
// ─────────────────────────────────────────────────────────────────────────────

public protocol RoomCaptureViewControllerDelegate: AnyObject {
    func captureView(_ view: RoomCaptureView, didFinishWith result: CapturedRoomData, error: Error?)
    func captureViewDidCancel(_ view: RoomCaptureView)
}
