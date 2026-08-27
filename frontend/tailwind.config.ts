import type { Config } from 'tailwindcss';

/**
 * Every color below is a CSS custom property (see app/globals.css), not a
 * literal Tailwind palette value - this is a 1:1 translation of the
 * accessibility-checked light/dark palette from the reference
 * prepq-dashboard-v2.html, preserved exactly rather than replaced with a
 * generic shadcn theme. Domain-specific tokens (--cpa/--ea/--meta/--google,
 * the funnel gradient --f1..--f6, the heatmap sequence --seq1..--seq7) have
 * no shadcn equivalent and are kept as their own named colors.
 */
const config: Config = {
  darkMode: ['class'],
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    container: {
      center: true,
      padding: '1.5rem',
      screens: { '2xl': '1400px' },
    },
    extend: {
      colors: {
        border: 'var(--border)',
        input: 'var(--input)',
        ring: 'var(--focus-ring)',
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        primary: {
          DEFAULT: 'var(--primary)',
          foreground: 'var(--primary-foreground)',
        },
        secondary: {
          DEFAULT: 'var(--secondary)',
          foreground: 'var(--secondary-foreground)',
        },
        destructive: {
          DEFAULT: 'var(--critical)',
          foreground: '#ffffff',
        },
        muted: {
          DEFAULT: 'var(--chip)',
          foreground: 'var(--muted)',
        },
        accent: {
          DEFAULT: 'var(--chip)',
          foreground: 'var(--foreground)',
        },
        popover: {
          DEFAULT: 'var(--surface)',
          foreground: 'var(--foreground)',
        },
        card: {
          DEFAULT: 'var(--surface)',
          foreground: 'var(--foreground)',
        },
        // Domain tokens - marketing/sales dashboard vocabulary
        ink2: 'var(--ink-2)',
        chip: 'var(--chip)',
        baseline: 'var(--baseline)',
        grid: 'var(--grid)',
        cpa: 'var(--cpa)',
        ea: 'var(--ea)',
        meta: 'var(--meta)',
        google: 'var(--google)',
        good: 'var(--good)',
        goodtext: 'var(--good-text)',
        warning: 'var(--warning)',
        serious: 'var(--serious)',
        critical: 'var(--critical)',
        f1: 'var(--f1)',
        f2: 'var(--f2)',
        f3: 'var(--f3)',
        f4: 'var(--f4)',
        f5: 'var(--f5)',
        f6: 'var(--f6)',
        seq1: 'var(--seq1)',
        seq2: 'var(--seq2)',
        seq3: 'var(--seq3)',
        seq4: 'var(--seq4)',
        seq5: 'var(--seq5)',
        seq6: 'var(--seq6)',
        seq7: 'var(--seq7)',
      },
      borderRadius: {
        lg: '10px',
        md: '8px',
        sm: '6px',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
      keyframes: {
        'accordion-down': { from: { height: '0' }, to: { height: 'var(--radix-accordion-content-height)' } },
        'accordion-up': { from: { height: 'var(--radix-accordion-content-height)' }, to: { height: '0' } },
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'fade-in': 'fade-in 0.15s ease-out',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

export default config;
