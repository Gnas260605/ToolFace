/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,ts,jsx,tsx,mdx}', './components/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['DM Sans', 'var(--font-body)', 'system-ui', 'sans-serif'],
        display: ['Sora', 'var(--font-display)', 'system-ui', 'sans-serif'],
        body: ['DM Sans', 'system-ui', 'sans-serif'],
      },
      colors: {
        surface: {
          base: '#08080a',
          raised: '#0f0f12',
          overlay: '#16161a',
          sunken: '#050507',
          card: '#0d0d10',
        },
        accent: {
          50: '#f0fdfa',
          100: '#ccfbf1',
          200: '#99f6e4',
          300: '#5eead4',
          400: '#2dd4bf',
          500: '#14b8a6',
          600: '#0d9488',
          700: '#0f766e',
          800: '#115e59',
          900: '#134e4a',
          950: '#042f2e',
        },
        viral: {
          hot: '#f43f5e',
          warm: '#f59e0b',
          cool: '#6366f1',
        },
      },
      borderRadius: {
        'sm': '6px',
        'md': '10px',
        'lg': '14px',
        'xl': '20px',
      },
      animation: {
        'fade-in': 'fadeIn 0.35s ease-out forwards',
        'slide-up': 'slideUp 0.45s ease-out forwards',
        'slide-in-left': 'slideInLeft 0.3s ease-out forwards',
        'float-in': 'floatIn 0.4s ease-out forwards',
        'shimmer': 'shimmer 2s infinite',
        'pulse-soft': 'pulse-soft 2.5s ease-in-out infinite',
        'spin-slow': 'spin-slow 3s linear infinite',
        'score-pulse': 'scorePulse 3s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        slideUp: {
          from: { opacity: '0', transform: 'translateY(14px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        slideInLeft: {
          from: { opacity: '0', transform: 'translateX(-10px)' },
          to: { opacity: '1', transform: 'translateX(0)' },
        },
        floatIn: {
          from: { opacity: '0', transform: 'translateY(8px) scale(0.98)' },
          to: { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'pulse-soft': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.55' },
        },
        'spin-slow': {
          from: { transform: 'rotate(0deg)' },
          to: { transform: 'rotate(360deg)' },
        },
        scorePulse: {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(244, 63, 94, 0.2)' },
          '50%': { boxShadow: '0 0 12px 2px rgba(244, 63, 94, 0.2)' },
        },
      },
    },
  },
  plugins: [],
};
