/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["../public/**/*.html"],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: '#4F46E5', dark: '#3730A3' }
      }
    }
  },
  plugins: [],
}
