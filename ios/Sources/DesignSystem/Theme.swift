import SwiftUI

// Single source of truth for design tokens — Color and Font definitions
// matching the web frontend's `frontend/src/styles/tokens.css`. Keep names
// in lockstep with the web side so future cross-references read 1-to-1.
//
// Colors are looked up from the asset catalog by name (light/dark variants
// are defined per-colorset). Adding a new token = add a new colorset under
// Resources/Assets.xcassets/<Name>.colorset/ + a static var here.
//
// Fonts are loaded from Resources/Fonts/ via project.yml's UIAppFonts. The
// custom font files are not yet committed (Stage 1 ships placeholders);
// the .system fallback below keeps the build green until they land.

import UIKit

enum Theme {
    enum Color {
        // Surfaces
        static let paper          = SwiftUI.Color("Paper")
        static let cream          = SwiftUI.Color("Cream")
        static let soft           = SwiftUI.Color("Soft")

        // Hairlines (semi-opaque dividers)
        static let hairline       = SwiftUI.Color("Hairline")
        static let hairlineStrong = SwiftUI.Color("HairlineStrong")

        // Ink — text scale from boldest (ink) to faintest (ink5)
        static let ink   = SwiftUI.Color("Ink")
        static let ink2  = SwiftUI.Color("Ink2")
        static let ink3  = SwiftUI.Color("Ink3")
        static let ink4  = SwiftUI.Color("Ink4")
        static let ink5  = SwiftUI.Color("Ink5")

        // Accents
        static let indigo  = SwiftUI.Color("Indigo")
        static let indigo2 = SwiftUI.Color("Indigo2")
        static let slate   = SwiftUI.Color("Slate")
        static let moss    = SwiftUI.Color("Moss")
        static let ochre   = SwiftUI.Color("Ochre")
        static let rust    = SwiftUI.Color("Rust")
    }

    // Font system. When a custom font (Fraunces, Source Serif 4, Inter) is
    // bundled the named family wins; otherwise we use the matching system
    // design so display text stays serif (New York) rather than silently
    // falling back to Helvetica — which is what `Font.custom` does when the
    // font file is missing.
    enum Font {
        // Display (Fraunces) — screen titles, big numbers, card heads.
        static let displayLarge   = serif("Fraunces-Medium", size: 28)
        static let displayMedium  = serif("Fraunces-Medium", size: 22)
        static let displaySmall   = serif("Fraunces-Medium", size: 18)

        // Body (Source Serif 4) — long-form copy.
        static let bodyMedium     = serif("SourceSerif4-Regular", size: 15, weight: .regular)
        static let bodySmall      = serif("SourceSerif4-Regular", size: 13, weight: .regular)

        // UI (Inter) — buttons, labels, pills.
        static let uiMedium       = sans("Inter-Medium", size: 14)
        static let uiSmall        = sans("Inter-Medium", size: 12)
        static let uiCaption      = sans("Inter-Medium", size: 11)

        // Mono — counts, dates, code.
        static let monoMedium     = SwiftUI.Font.system(size: 13, weight: .medium, design: .monospaced)
        static let monoSmall      = SwiftUI.Font.system(size: 11, weight: .regular, design: .monospaced)

        // MARK: - Helpers

        /// Returns the named custom font if registered, otherwise a system
        /// font with `design: .serif` so titles keep their serifs.
        private static func serif(_ name: String, size: CGFloat,
                                  weight: SwiftUI.Font.Weight = .medium) -> SwiftUI.Font {
            isFontRegistered(name)
                ? .custom(name, size: size)
                : .system(size: size, weight: weight, design: .serif)
        }

        /// Sans-serif (Inter) variant — falls back to the system UI font.
        private static func sans(_ name: String, size: CGFloat,
                                 weight: SwiftUI.Font.Weight = .medium) -> SwiftUI.Font {
            isFontRegistered(name)
                ? .custom(name, size: size)
                : .system(size: size, weight: weight)
        }

        private static func isFontRegistered(_ name: String) -> Bool {
            UIFont(name: name, size: 12) != nil
        }
    }
}
