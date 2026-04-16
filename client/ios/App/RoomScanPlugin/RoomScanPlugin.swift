import Foundation
import Capacitor
import RoomPlan
import ARKit
import UIKit
import QuickLook
import simd

@available(iOS 16, *)
@objc(RoomScanPlugin)
public class RoomScanPlugin: CAPPlugin {

    private var captureController: RoomCaptureViewController?
    private var currentCall: CAPPluginCall?
    /// Held for QLPreviewController's lifetime so the data source isn't
    /// deallocated while the preview is on screen.
    private var activeQLDataSource: USDZPreviewDataSource?

    @objc func startScan(_ call: CAPPluginCall) {
        guard RoomCaptureSession.isSupported else {
            call.reject("LiDAR scanning is not supported on this device. Requires a supported Pro device with LiDAR.")
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

    @objc func stopScan(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            self?.captureController?.stopSession()
            call.resolve()
        }
    }

    @objc func checkSupport(_ call: CAPPluginCall) {
        call.resolve([
            "supported": RoomCaptureSession.isSupported
        ])
    }

    /// Open a USDZ file in the native iOS Quick Look preview (supports AR).
    /// JS side passes `{ path: "<absolute file path>" }`.
    @objc func previewUSDZ(_ call: CAPPluginCall) {
        guard let pathStr = call.getString("path"), !pathStr.isEmpty else {
            call.reject("path is required")
            return
        }
        let fileURL = URL(fileURLWithPath: pathStr)
        guard FileManager.default.fileExists(atPath: fileURL.path) else {
            call.reject("USDZ file not found on device — please re-scan this room")
            return
        }

        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            let previewer = QLPreviewController()
            let ds = USDZPreviewDataSource(fileURL: fileURL)
            self.activeQLDataSource = ds
            previewer.dataSource = ds
            previewer.modalPresentationStyle = .fullScreen
            self.bridge?.viewController?.present(previewer, animated: true) {
                call.resolve()
            }
        }
    }
}

/// QLPreviewController data source holding one on-disk USDZ item.
@available(iOS 16, *)
final class USDZPreviewDataSource: NSObject, QLPreviewControllerDataSource {
    private let fileURL: URL
    init(fileURL: URL) { self.fileURL = fileURL }
    func numberOfPreviewItems(in controller: QLPreviewController) -> Int { 1 }
    func previewController(_ controller: QLPreviewController, previewItemAt index: Int) -> QLPreviewItem {
        return fileURL as QLPreviewItem
    }
}

@available(iOS 16, *)
extension RoomScanPlugin: RoomCaptureViewControllerDelegate {

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

        Task { [weak self] in
            guard let self = self else { return }

            do {
                let finalRoom = try await RoomBuilder(options: [.beautifyObjects])
                    .capturedRoom(from: result)

                var payload = self.buildPayload(from: finalRoom)

                // Best-effort USDZ export. If it fails we still return the scan
                // payload — the 3D viewer is optional.
                if let usdzPath = self.exportUSDZ(finalRoom) {
                    payload["usdzPath"] = usdzPath
                }

                await MainActor.run {
                    self.captureController?.dismiss(animated: true)
                    self.captureController = nil
                    self.currentCall?.resolve(payload)
                    self.currentCall = nil
                }
            } catch {
                await MainActor.run {
                    self.captureController?.dismiss(animated: true)
                    self.captureController = nil
                    self.currentCall?.reject("Failed to build room model: \(error.localizedDescription)")
                    self.currentCall = nil
                }
            }
        }
    }

    public func captureViewDidCancel(_ view: RoomCaptureView) {
        DispatchQueue.main.async { [weak self] in
            self?.captureController?.dismiss(animated: true)
            self?.captureController = nil
            self?.currentCall?.reject("Scan cancelled by user")
            self?.currentCall = nil
        }
    }

    /// Export the finalized CapturedRoom to a USDZ file in the app's Documents
    /// directory. Returns the absolute path, or nil on failure.
    /// Uses `.parametric` for V1 — smallest file, cleanest "dollhouse" layout.
    private func exportUSDZ(_ room: CapturedRoom) -> String? {
        do {
            let fileName = "room-\(UUID().uuidString).usdz"
            let docs = try FileManager.default.url(
                for: .documentDirectory, in: .userDomainMask,
                appropriateFor: nil, create: true
            )
            let fileURL = docs.appendingPathComponent(fileName)
            try room.export(to: fileURL, exportOptions: .parametric)
            print("[RoomScanPlugin] USDZ exported to \(fileURL.path)")
            return fileURL.path
        } catch {
            print("[RoomScanPlugin] USDZ export failed: \(error.localizedDescription)")
            return nil
        }
    }

    // ── Payload shape ───────────────────────────────────────────────────────
    // Matches server/src/validation/schemas.ts RoomScanPayloadSchema exactly.
    // All metres, Y-up, room-local. rotationY is yaw (radians, CCW looking down).
    // confidence: 0=low 1=medium 2=high. hasCurvedWalls is reserved for V2.

    private func buildPayload(from room: CapturedRoom) -> JSObject {
        let scannedAt = ISO8601DateFormatter().string(from: Date())

        // Walls — preserve index so openings can reference them.
        let wallsOut: [JSObject] = room.walls.enumerated().map { (idx, wall) in
            return [
                "index": idx,
                "transform": self.extractTransform(wall.transform),
                "widthM": Double(wall.dimensions.x),
                "heightM": Double(wall.dimensions.y),
                "confidence": self.confidenceInt(wall.confidence)
            ]
        }

        // Openings — merge doors and windows into one array with a `type` tag.
        let doorOpenings = room.doors.map { self.buildOpening(surface: $0, type: "door", walls: room.walls) }
        let windowOpenings = room.windows.map { self.buildOpening(surface: $0, type: "window", walls: room.walls) }
        let openings: [JSObject] = doorOpenings + windowOpenings

        // Objects — stable objectId (UUID from RoomPlan) + transform for placement.
        let objectsOut: [JSObject] = room.objects.map { obj in
            return [
                "objectId": obj.identifier.uuidString,
                "label": String(describing: obj.category),
                "transform": self.extractTransform(obj.transform),
                "widthM": Double(obj.dimensions.x),
                "heightM": Double(obj.dimensions.y),
                "depthM": Double(obj.dimensions.z),
                "confidence": self.confidenceInt(obj.confidence)
            ]
        }

        // Floor polygon by chaining walls end-to-end.
        let (polygonPoints, polygonClosed) = self.chainWallsToPolygon(room.walls)

        // Bounding-box dimensions.
        let widthM  = Double(room.walls.map { $0.dimensions.x }.max() ?? 0)
        let heightM = Double(room.walls.map { $0.dimensions.y }.max() ?? 0)
        let lengthM: Double = {
            if polygonPoints.count >= 2 {
                let zs = polygonPoints.compactMap { $0["z"] as? Double }
                if let lo = zs.min(), let hi = zs.max() { return hi - lo }
            }
            return Double(room.walls.map { $0.dimensions.z }.max() ?? 0)
        }()

        // Area: shoelace when polygon closes; bbox fallback otherwise.
        let (areaSqM, areaSource): (Double, String) = {
            if polygonClosed && polygonPoints.count >= 3 {
                return (self.shoelaceArea(polygonPoints), "shoelace")
            }
            return (widthM * lengthM, "bbox")
        }()

        return [
            "schemaVersion": 1,
            "widthM": widthM,
            "lengthM": lengthM,
            "heightM": heightM,
            "areaSqM": areaSqM,
            "areaSource": areaSource,
            "wallCount": room.walls.count,
            "doorCount": room.doors.count,
            "windowCount": room.windows.count,
            "polygonClosed": polygonClosed,
            "hasCurvedWalls": false,
            "floorPolygon": polygonPoints,
            "walls": wallsOut,
            "openings": openings,
            "objects": objectsOut,
            "scannedAt": scannedAt
        ]
    }

    // ── Helpers ─────────────────────────────────────────────────────────────

    private func confidenceInt(_ c: CapturedRoom.Confidence) -> Int {
        switch c {
        case .low: return 0
        case .medium: return 1
        case .high: return 2
        @unknown default: return 0
        }
    }

    /// Flatten a 4x4 pose to {x, y, z, rotationY}. rotationY is the yaw about
    /// the world Y axis (radians), derived from the rotated x-axis in world space.
    private func extractTransform(_ m: simd_float4x4) -> JSObject {
        let tx = Double(m.columns.3.x)
        let ty = Double(m.columns.3.y)
        let tz = Double(m.columns.3.z)
        let rotationY = Double(atan2(m.columns.0.z, m.columns.0.x))
        return [
            "x": tx,
            "y": ty,
            "z": tz,
            "rotationY": rotationY
        ]
    }

    /// A wall's two endpoints projected onto the x-z plane: center ± (widthM/2) * wallRight.
    private func wallEndpoints(_ wall: CapturedRoom.Surface) -> (SIMD2<Double>, SIMD2<Double>) {
        let m = wall.transform
        let cx = Double(m.columns.3.x)
        let cz = Double(m.columns.3.z)
        let rx = Double(m.columns.0.x)
        let rz = Double(m.columns.0.z)
        let half = Double(wall.dimensions.x) / 2.0
        let start = SIMD2<Double>(cx - half * rx, cz - half * rz)
        let end   = SIMD2<Double>(cx + half * rx, cz + half * rz)
        return (start, end)
    }

    private func dist2D(_ a: SIMD2<Double>, _ b: SIMD2<Double>) -> Double {
        let dx = a.x - b.x, dz = a.y - b.y
        return (dx * dx + dz * dz).squareRoot()
    }

    /// Chain walls end-to-end by nearest-neighbor. Tolerance 20 cm. Returns a
    /// polygon in CCW order (positive shoelace area) and a `closed` flag if the
    /// last endpoint returned to the first within tolerance.
    private func chainWallsToPolygon(_ walls: [CapturedRoom.Surface]) -> (polygon: [JSObject], closed: Bool) {
        guard walls.count >= 2 else { return ([], false) }
        let tol = 0.20

        let endpoints: [(SIMD2<Double>, SIMD2<Double>)] = walls.map { wallEndpoints($0) }
        var used = Array(repeating: false, count: walls.count)

        var poly: [SIMD2<Double>] = []
        used[0] = true
        poly.append(endpoints[0].0)
        poly.append(endpoints[0].1)

        for _ in 1..<walls.count {
            guard let tail = poly.last else { break }
            var bestIdx: Int? = nil
            var bestDist = Double.infinity
            var bestIsStart = true

            for i in 0..<walls.count where !used[i] {
                let (s, e) = endpoints[i]
                let ds = dist2D(tail, s)
                let de = dist2D(tail, e)
                if ds < bestDist { bestDist = ds; bestIdx = i; bestIsStart = true }
                if de < bestDist { bestDist = de; bestIdx = i; bestIsStart = false }
            }
            guard let idx = bestIdx, bestDist < tol else { break }
            used[idx] = true
            let (s, e) = endpoints[idx]
            poly.append(bestIsStart ? e : s)
        }

        let closed = poly.count >= 3 && dist2D(poly.first!, poly.last!) < tol
        var finalPoly = poly
        if closed { finalPoly.removeLast() }

        // Ensure CCW winding so shoelace area is positive.
        let signed = shoelaceSigned(finalPoly)
        if signed < 0 { finalPoly.reverse() }

        let out: [JSObject] = finalPoly.map { p in ["x": p.x, "z": p.y] }
        return (out, closed)
    }

    private func shoelaceSigned(_ pts: [SIMD2<Double>]) -> Double {
        guard pts.count >= 3 else { return 0 }
        var sum = 0.0
        for i in 0..<pts.count {
            let a = pts[i]
            let b = pts[(i + 1) % pts.count]
            sum += a.x * b.y - b.x * a.y
        }
        return sum / 2.0
    }

    private func shoelaceArea(_ poly: [JSObject]) -> Double {
        let pts: [SIMD2<Double>] = poly.compactMap { p in
            guard let x = p["x"] as? Double, let z = p["z"] as? Double else { return nil }
            return SIMD2<Double>(x, z)
        }
        return abs(shoelaceSigned(pts))
    }

    /// Build an opening payload. `wallIndex` is the nearest wall within 1 m,
    /// else NSNull (→ JS `null`). `absolutePosition` is always set so the
    /// renderer can still place the opening.
    private func buildOpening(surface: CapturedRoom.Surface, type: String, walls: [CapturedRoom.Surface]) -> JSObject {
        let m = surface.transform
        let absX = Double(m.columns.3.x)
        let absZ = Double(m.columns.3.z)

        var nearestIdx: Int? = nil
        var nearestDist = Double.infinity
        for (i, wall) in walls.enumerated() {
            let wm = wall.transform
            let dx = absX - Double(wm.columns.3.x)
            let dz = absZ - Double(wm.columns.3.z)
            let d = (dx * dx + dz * dz).squareRoot()
            if d < nearestDist { nearestDist = d; nearestIdx = i }
        }

        // Build the dict with concrete types first; assign wallIndex after so
        // we can use Int | NSNull without tripping the Any → JSValue coercion.
        var opening: JSObject = [
            "type": type,
            "transform": extractTransform(m),
            "absolutePosition": ["x": absX, "z": absZ] as JSObject,
            "widthM": Double(surface.dimensions.x),
            "heightM": Double(surface.dimensions.y),
            "confidence": confidenceInt(surface.confidence)
        ]
        if let idx = nearestIdx, nearestDist <= 1.0 {
            opening["wallIndex"] = idx
        } else {
            opening["wallIndex"] = NSNull()
        }
        return opening
    }
}

public class RoomCaptureViewController: UIViewController {

    weak var delegate: RoomCaptureViewControllerDelegate?

    private var captureView: RoomCaptureView!
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
        captureView?.captureSession.stop()
    }

    private func setupCapture() {
        captureView = RoomCaptureView(frame: view.bounds)
        captureView.captureSession.delegate = self
        captureView.delegate = self
        captureView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view.addSubview(captureView)
    }

    private func setupHUD() {
        view.backgroundColor = .black

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

        instructionLabel = UILabel()
        instructionLabel.text = "Walk slowly around the room, pointing your camera at walls, floor and openings."
        instructionLabel.textColor = .white
        instructionLabel.font = .systemFont(ofSize: 14, weight: .regular)
        instructionLabel.numberOfLines = 2
        instructionLabel.textAlignment = .center
        instructionLabel.backgroundColor = UIColor.black.withAlphaComponent(0.55)
        instructionLabel.layer.cornerRadius = 12
        instructionLabel.clipsToBounds = true
        instructionLabel.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(instructionLabel)

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
            doneButton.heightAnchor.constraint(equalToConstant: 52)
        ])
    }

    private func startSession() {
        let config = RoomCaptureSession.Configuration()
        captureView.captureSession.run(configuration: config)
    }

    func stopSession() {
        captureView.captureSession.stop()
    }

    @objc private func cancelTapped() {
        captureView.captureSession.stop()
        delegate?.captureViewDidCancel(captureView)
    }

    @objc private func doneTapped() {
        doneButton.isEnabled = false
        statusLabel.text = "Processing…"
        captureView.captureSession.stop()
    }
}

extension RoomCaptureViewController: RoomCaptureSessionDelegate {

    public func captureSession(_ session: RoomCaptureSession, didUpdate room: CapturedRoom) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }

            let wallCount = room.walls.count
            let pct = min(100, wallCount * 8)

            self.statusLabel.text = "Scanning… \(pct)%"

            if wallCount >= 3 && !self.doneButton.isEnabled {
                self.doneButton.isEnabled = true
                UIView.animate(withDuration: 0.3) {
                    self.doneButton.alpha = 1.0
                }
                self.instructionLabel.text = "Looking good. Tap Done when finished, or keep scanning for better accuracy."
            }
        }
    }

    public func captureSession(_ session: RoomCaptureSession, didEndWith data: CapturedRoomData, error: Error?) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            self.delegate?.captureView(self.captureView, didFinishWith: data, error: error)
        }
    }
}

extension RoomCaptureViewController: RoomCaptureViewDelegate {
}

public protocol RoomCaptureViewControllerDelegate: AnyObject {
    func captureView(_ view: RoomCaptureView, didFinishWith result: CapturedRoomData, error: Error?)
    func captureViewDidCancel(_ view: RoomCaptureView)
}
