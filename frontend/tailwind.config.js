/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        bg:              '#181818',
        surface:         '#1f1f1f',
        'surface-2':     '#252525',
        'surface-card':  '#222222',
        border:          '#2c2c2c',
        'border-subtle': '#242424',
        text:            '#e8e6e3',
        'text-dim':      '#c8c6c3',
        'text-secondary':'#8a8a8a',
        'text-muted':    '#4a4a4a',
        accent:          '#c4a882',
        'accent-soft':   'rgba(196,168,130,0.12)',
      },
      fontFamily: {
        serif: ['"Noto Serif SC"', 'Georgia', 'serif'],
        sans:  ['Inter', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        'display': ['2.25rem', { lineHeight: '1.25', letterSpacing: '-0.01em' }],
        'display-sm': ['1.75rem', { lineHeight: '1.35', letterSpacing: '-0.005em' }],
        'body':    ['0.9375rem', { lineHeight: '1.7' }],
        'small':   ['0.8125rem', { lineHeight: '1.6' }],
        'micro':   ['0.6875rem', { lineHeight: '1.5' }],
      },
      spacing: {
        '18': '4.5rem',
        '22': '5.5rem',
        '26': '6.5rem',
        '30': '7.5rem',
      },
      animation: {
        'fade-in':   'fadeIn 1s ease-out forwards',
        'fade-up':   'fadeUp 0.9s cubic-bezier(0.16,1,0.3,1) forwards',
        'fade-down': 'fadeDown 0.9s cubic-bezier(0.16,1,0.3,1) forwards',
        'blink':     'blink 1.4s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%':   { opacity: '0' },
          '100%': { opacity: '1' },
        },
        fadeUp: {
          '0%':   { opacity: '0', transform: 'translateY(18px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        fadeDown: {
          '0%':   { opacity: '0', transform: 'translateY(-10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        blink: {
          '0%, 100%': { opacity: '1' },
          '50%':      { opacity: '0.2' },
        },
      },
    },
  },
  plugins: [],
}
