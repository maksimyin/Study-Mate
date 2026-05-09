import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./client/index.html', './client/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        base:     '#0f0f0f',
        panel:    '#171717',
        elevated: '#1c1c1c',
        hov:      '#222222',
        line:     'rgba(255,255,255,0.06)',
        'line-b': 'rgba(255,255,255,0.12)',
        t1:       '#f5f5f5',
        t2:       '#888888',
        t3:       '#555555',
        accent:   '#6EE7B7',
        success:  '#3ecf8e',
        warning:  '#f5a623',
        danger:   '#f07070',
      },
      fontFamily: {
        sans:  ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
        mono:  ['"JetBrains Mono"', 'monospace'],
      },
      keyframes: {
        'fade-up': {
          '0%':   { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'glow-ok': {
          '0%':   { 'box-shadow': '0 0 0 0 rgba(62,207,142,0)' },
          '30%':  { 'box-shadow': '0 0 20px 5px rgba(62,207,142,0.26)' },
          '100%': { 'box-shadow': '0 0 0 0 rgba(62,207,142,0)' },
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
        'glow-ok':   'glow-ok 1.3s ease-out forwards',
        'check-pop': 'check-pop 0.4s cubic-bezier(0.34,1.56,0.64,1) forwards',
        'dot-b':     'dot-b 1.2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}

export default config
