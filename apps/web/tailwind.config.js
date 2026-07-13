/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,ts,jsx,tsx,mdx}', './components/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-body)', 'sans-serif'],
        display: ['var(--font-display)', 'sans-serif'],
      },
      colors: {
        brand: {
          50: '#f4f7fb',
          100: '#e8eef6',
          200: '#cbdbe9',
          300: '#9dbcd7',
          400: '#6898c1',
          500: '#457ba7',
          600: '#35628c',
          700: '#2c4f72',
          800: '#27445f',
          900: '#243b51',
          950: '#182736',
        },
      },
    },
  },
  plugins: [],
};
