/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        zevent: {
          100: '#ede9fe',
          200: '#ddd6fe',
          300: '#c4b5fd',
          400: '#a78bfa',
          500: '#8b5cf6',
          600: '#7c3aed',
          700: '#6d28d9',
        },
        // Surfaces du châssis de l'application (barre du haut, menu du bas) :
        // un cran au-dessus du fond des écrans pour les détacher du contenu.
        surface: {
          DEFAULT: '#0b1120',
          raised: '#111a2e',
        },
      },
    },
  },
  plugins: [],
};
