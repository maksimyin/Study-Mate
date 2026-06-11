import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./client/index.html', './client/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        base:     '#F5F4F0',
        panel:    '#ECEAE4',
        elevated: '#FFFFFF',
        hov:      '#F0EEE8',
        line:     'rgba(26,26,26,0.07)',
        'line-b': 'rgba(26,26,26,0.12)',
        t1:       '#1A1A1A',
        t2:       '#6B6B6B',
        t3:       '#9B9892',
        accent:   '#34D399',
        success:  '#059669',
        warning:  '#B45309',
        danger:   '#B91C1C',
      },
      fontFamily: {
        sans:    ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
        mono:    ['"JetBrains Mono"', 'monospace'],
        display: ['Fraunces', 'Georgia', 'serif'],
      },
      keyframes: {
        'fade-up': {
          '0%':   { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'check-pop': {
          '0%':   { transform: 'scale(0.35)', opacity: '0' },
          '60%':  { transform: 'scale(1.3)',  opacity: '1' },
          '100%': { transform: 'scale(1)',    opacity: '1' },
        },
        'dot-b': {
          '0%, 80%, 100%': { transform: 'translateY(0)',    opacity: '0.3' },
          '40%':           { transform: 'translateY(-5px)', opacity: '1'   },
        },
      },
      animation: {
        'fade-up':   'fade-up 0.3s ease-out both',
        'check-pop': 'check-pop 0.4s cubic-bezier(0.34,1.56,0.64,1) forwards',
        'dot-b':     'dot-b 1.2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}

export default config
