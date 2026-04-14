// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "LibraryUI",
    platforms: [.iOS(.v17)],
    products: [
        .library(name: "LibraryUI", targets: ["LibraryUI"]),
    ],
    dependencies: [
        .package(name: "SyncCore", path: "../SyncCore"),
    ],
    targets: [
        .target(name: "LibraryUI", dependencies: ["SyncCore"]),
    ]
)
