/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Match the colors defined in your App.jsx THEME constant
        primary: '#0a2342', // Deep Navy Blue
        secondary: '#f2c80f', // Gold/Amber
      },
    },
  },
  plugins: [],
}
