/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{html,ts,scss}'],
  theme: {
    // Match Angular Material's CDK breakpoints (NOT Tailwind defaults) so the
    // greenfield FE keeps the same responsive thresholds as the legacy FE.
    // Source: the legacy frontend's tailwind.config.js + @angular/cdk Breakpoints.
    screens: {
      sm: '600px', // Material handset → small tablet
      md: '960px', // tablet
      lg: '1280px', // small desktop
      xl: '1440px', // wide desktop
      '2xl': '1920px',
    },
    extend: {
      fontFamily: {
        display: ['"Instrument Serif"', 'ui-serif', 'Georgia', 'serif'],
        sans: ['"Albert Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      colors: {
        // Editorial-warm creator-economy palette. Coral primary, deep navy trust,
        // cream background. See landing.component for usage.
        cream: '#FBF9F4',
        ink: '#0E1116',
        slate2: '#4A4F5C',
        beige: '#E8E2D5',
        // 600 and 700 are the two steps that carry TEXT -- 103 and 21 usages against 6 and 23
        // backgrounds -- so they are chosen for contrast rather than for the ramp looking even.
        // 600 was #E04A28, which is 3.85:1 on cream and failed WCAG AA for normal text everywhere
        // it was used; Lighthouse caught exactly one instance of it (a 12px semibold span) because
        // it only audits three pages, but the other 127 were no more readable for going unaudited.
        // Measured on coral-50, the lightest ground either sits on: 600 = 4.60:1, 700 = 7.01:1.
        // Hue and saturation are unchanged; only lightness moved.
        coral: {
          50: '#FFF1ED',
          100: '#FFDBCC',
          200: '#FFC4A8',
          300: '#FFA07B',
          400: '#FF7B5C',
          500: '#FF5A36',
          600: '#C83D1D',
          700: '#962F19',
        },
        navy: {
          50: '#F0F2F8',
          400: '#3D5499',
          500: '#1E3A8A',
          600: '#0F1F44',
          900: '#08122B',
        },
        // Semantic status ramp — success / warning / danger / info, each a
        // { soft: bg tint, DEFAULT: base, strong: text }. Fills the gap the
        // routes had been filling inline with raw emerald/red/amber/sky
        // palette classes (audit wf_dfde554b, design P1). Usage:
        //   bg-success-soft text-success-strong  ·  text-danger-strong  etc.
        // soft/strong deliberately equal Tailwind's red-50/red-700 etc. so
        // existing inline usages can migrate pixel-identically.
        success: { soft: '#ECFDF5', DEFAULT: '#10B981', strong: '#047857' },
        warning: { soft: '#FFFBEB', DEFAULT: '#F59E0B', strong: '#B45309' },
        danger: { soft: '#FEF2F2', DEFAULT: '#EF4444', strong: '#B91C1C' },
        info: { soft: '#F0F9FF', DEFAULT: '#0EA5E9', strong: '#0369A1' },
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        marquee: {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
      },
      animation: {
        'fade-up': 'fade-up 700ms cubic-bezier(.2,.7,.2,1) both',
        'fade-up-200': 'fade-up 700ms 200ms cubic-bezier(.2,.7,.2,1) both',
        'fade-up-400': 'fade-up 700ms 400ms cubic-bezier(.2,.7,.2,1) both',
        'fade-up-600': 'fade-up 700ms 600ms cubic-bezier(.2,.7,.2,1) both',
        'fade-in': 'fade-in 800ms ease-out both',
        marquee: 'marquee 30s linear infinite',
      },
    },
  },
  plugins: [],
  // Angular Material owns most of the visual primitives. Tailwind is for layout
  // + spacing utilities only. We do NOT enable preflight (would clash with
  // Material's reset). If a slice needs preflight, do it scoped via @layer base
  // in styles.scss instead of toggling here.
  corePlugins: {
    preflight: false,
  },
};
