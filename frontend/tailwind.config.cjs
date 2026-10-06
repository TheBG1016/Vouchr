module.exports = {
  content: ["./app/**/*.{js,jsx}", "./components/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "#D4C5F3",
        card: "#FAF7F2",
        shell: { 900: "#2D193E", 800: "#3D2654", 700: "#553D73" },
        lilac: { DEFAULT: "#E4DAF8", light: "#EDE6FC", border: "#CFC2F0" },
        patina: { DEFAULT: "#28634F", dark: "#1E4D3D", light: "#E6F5ED", border: "#C4E8D5" },
        brass: { DEFAULT: "#9A6A18", light: "#FFF8E7", border: "#F4E5C3" },
        seal: { DEFAULT: "#A84456", light: "#FCEEF0", border: "#F8C8CD" },
        ink: "#1E102A",
        muted: "#736682",
        line: "#E3D9F0",
        darkborder: "#1E102A",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        hand: ["Caveat", "cursive", "sans-serif"],
        mono: ["IBM Plex Mono", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};
