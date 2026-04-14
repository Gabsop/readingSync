import ReadiumShared
import SwiftUI

struct Scrubber: View {
    let progress: Double
    let chapterTitle: String?
    let onScrub: (Double) -> Void

    @State private var scrubProgress: Double?
    @State private var isScrubbing = false

    private var displayProgress: Double {
        scrubProgress ?? progress
    }

    var body: some View {
        VStack(spacing: 6) {
            if isScrubbing {
                label
                    .transition(.opacity.combined(with: .move(edge: .bottom)))
            }

            track
        }
        .animation(.easeOut(duration: 0.15), value: isScrubbing)
    }

    private var label: some View {
        Text("\(Int(displayProgress * 100))%")
            .font(.caption.weight(.medium).monospacedDigit())
            .padding(.horizontal, 10)
            .padding(.vertical, 4)
            .background(.ultraThinMaterial, in: Capsule())
    }

    private var track: some View {
        GeometryReader { geo in
            let width = geo.size.width

            ZStack(alignment: .leading) {
                Capsule()
                    .fill(.quaternary)
                    .frame(height: 4)

                Capsule()
                    .fill(.primary.opacity(0.6))
                    .frame(width: max(4, displayProgress * width), height: 4)

                Circle()
                    .fill(.primary)
                    .frame(width: isScrubbing ? 16 : 8, height: isScrubbing ? 16 : 8)
                    .offset(x: displayProgress * (width - 8))
                    .animation(.easeOut(duration: 0.15), value: isScrubbing)
            }
            .frame(height: 20)
            .contentShape(Rectangle())
            .gesture(
                DragGesture(minimumDistance: 0)
                    .onChanged { value in
                        let clamped = min(max(value.location.x / width, 0), 1)
                        if !isScrubbing {
                            isScrubbing = true
                        }
                        scrubProgress = clamped
                    }
                    .onEnded { value in
                        let clamped = min(max(value.location.x / width, 0), 1)
                        isScrubbing = false
                        onScrub(clamped)
                        scrubProgress = nil
                    }
            )
        }
        .frame(height: 20)
    }
}
