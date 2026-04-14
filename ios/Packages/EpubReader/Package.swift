// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "EpubReader",
    platforms: [.iOS(.v17)],
    products: [
        .library(name: "EpubReader", targets: ["EpubReader"]),
    ],
    dependencies: [
        .package(url: "https://github.com/readium/swift-toolkit.git", from: "3.0.0"),
        .package(name: "SyncCore", path: "../SyncCore"),
    ],
    targets: [
        .target(
            name: "EpubReader",
            dependencies: [
                .product(name: "ReadiumShared", package: "swift-toolkit"),
                .product(name: "ReadiumStreamer", package: "swift-toolkit"),
                .product(name: "ReadiumNavigator", package: "swift-toolkit"),
                "SyncCore",
            ],
            swiftSettings: [
                .swiftLanguageMode(.v5),
            ]
        ),
    ]
)
