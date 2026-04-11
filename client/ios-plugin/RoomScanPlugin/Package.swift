// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "RoomScanPlugin",
    platforms: [
        .iOS(.v16)  // RoomPlan requires iOS 16+
    ],
    products: [
        .library(
            name: "RoomScanPlugin",
            targets: ["RoomScanPlugin"]
        )
    ],
    dependencies: [],
    targets: [
        .target(
            name: "RoomScanPlugin",
            dependencies: [],
            path: "Sources/RoomScanPlugin",
            publicHeadersPath: ".",
            linkerSettings: [
                // Link Apple's RoomPlan framework
                .linkedFramework("RoomPlan"),
                .linkedFramework("ARKit"),
                .linkedFramework("SceneKit"),
            ]
        )
    ]
)
