/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,jsx,ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // === AI 辅助论坛语义 Token（映射 CSS 变量，支持 light/dark） ===
        background:            'var(--af-background)',
        foreground:            'var(--af-foreground)',
        card: {
          DEFAULT:             'var(--af-card)',
          foreground:          'var(--af-card-foreground)',
        },
        popover: {
          DEFAULT:             'var(--af-popover)',
          foreground:          'var(--af-popover-foreground)',
        },
        primary: {
          DEFAULT:             'var(--af-primary)',
          foreground:          'var(--af-primary-foreground)',
        },
        secondary: {
          DEFAULT:             'var(--af-secondary)',
          foreground:          'var(--af-secondary-foreground)',
        },
        afmuted: {
          DEFAULT:             'var(--af-muted)',
          foreground:          'var(--af-muted-foreground)',
        },
        border:                'var(--af-border)',
        input:                 'var(--af-input)',
        ring:                  'var(--af-ring)',
        success: {
          DEFAULT:             'var(--af-state-success)',
          bg:                  'var(--af-state-success-bg)',
        },
        warning: {
          DEFAULT:             'var(--af-state-warning)',
          bg:                  'var(--af-state-warning-bg)',
        },
        error: {
          DEFAULT:             'var(--af-state-error)',
          bg:                  'var(--af-state-error-bg)',
        },
        info: {
          DEFAULT:             'var(--af-state-info)',
          bg:                  'var(--af-state-info-bg)',
        },
      },
      fontFamily: {
        // 覆盖 Tailwind 默认 sans 栈：确保 font-sans 类和 preflight 重置都能正确渲染中文
        sans: ['Inter', '"Noto Sans SC"', '"PingFang SC"', '"Microsoft YaHei"', 'system-ui', '-apple-system', 'sans-serif'],
        serif: ['"Noto Serif SC"', '"Source Han Serif SC"', 'Georgia', 'serif'],
        mono: ['"JetBrains Mono"', '"SF Mono"', '"Fira Code"', 'monospace'],
        // 论坛专用字体族（语义化）
        'af-sans': ['Inter', '"Noto Sans SC"', '"PingFang SC"', '"Microsoft YaHei"', 'system-ui', 'sans-serif'],
        'af-mono': ['"JetBrains Mono"', '"SF Mono"', '"Fira Code"', 'monospace'],
      },
      borderRadius: {
        'af-sm':   '4px',
        'af-md':   '8px',
        'af-lg':   '12px',
        'af-xl':   '16px',
        'af-2xl':  '20px',
      },
      boxShadow: {
        'af-1': '0 1px 2px rgba(15, 23, 42, 0.05), 0 1px 1px rgba(15, 23, 42, 0.03)',
        'af-2': '0 8px 24px -8px rgba(15, 23, 42, 0.14)',
        'af-3': '0 24px 60px -20px rgba(15, 23, 42, 0.24)',
      },
      animation: {
        // AI 论坛：流式光标闪烁
        'af-blink': 'afBlink 1s steps(2) infinite',
      },
      keyframes: {
        afBlink: {
          '0%, 100%': { opacity: '1' },
          '50%':      { opacity: '0' },
        },
      },
    },
  },
  plugins: [],
}
