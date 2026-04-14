// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "EpubReader",
    platforms: [.iOS(.v17)],
    products: [
        .library(name: "EpubReader", targets: ["EpubReader"]),
    ],
    targets: [
        .target(name: "EpubReader"),
    ]
)
