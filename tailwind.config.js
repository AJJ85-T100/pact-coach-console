/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,jsx}',
    './components/**/*.{js,jsx}',
    './lib/**/*.{js,jsx}',
  ],
  theme: {
    extend: {
      colors: {
        // PACT.Health brand tokens
        blue: {
          DEFAULT: '#0A2540', // Commitment Blue
          deep:    '#050d18',
          light:   '#0F3155',
        },
        red: {
          DEFAULT: '#D92D20', // Drive Red
          deep:    '#B0241A',
        },
        // At-risk / caution accent — matches the prototype's orange
        warn: {
          DEFAULT: '#E68B3A',
          dark:    '#C77526',
          light:   '#FCEBD9',
        },
        bg: {
          DEFAULT: '#F4F6F8',
          alt:     '#EBF1F5',
        },
        body:   '#4A4A4A',
        muted:  '#8A95A3',
        border: '#E2E6EB',
      },
      fontFamily: {
        // Inter for body, Montserrat for display — per the brand brief
        sans:    ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['Montserrat', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card:    '0 4px 10px rgba(10,37,64,0.05)',
        'card-hover': '0 18px 40px -12px rgba(10,37,64,0.18)',
      },
      borderRadius: {
        // Per brand: slight, never pill
        DEFAULT: '6px',
      },
    },
  },
  plugins: [],
};
