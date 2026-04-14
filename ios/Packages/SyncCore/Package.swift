// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "SyncCore",
    platforms: [.iOS(.v17), .macOS(.v14)],
    products: [
        .library(name: "SyncCore", targets: ["SyncCore"]),
    ],
    dependencies: [
        .package(path: "../Persistence"),
    ],
    targets: [
        .target(name: "SyncCore", dependencies: ["Persistence"]),
        .testTarget(name: "SyncCoreTests", dependencies: ["SyncCore"]),
    ]
)
