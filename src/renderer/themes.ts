import { GRAPHITE_TOKENS, PAPER_TOKENS, type SemanticTokens, type ThemeMode } from './theme/tokens'

export interface ThemeDefinition {
  name: string
  label: string
  mode: ThemeMode
  vars: Record<string, string>
  /** Optional semantic token set. When absent, tokens are derived from `vars`. */
  tokens?: SemanticTokens
}

export const THEMES: ThemeDefinition[] = [
  {
    name: 'paper',
    label: 'Paper',
    mode: 'light',
    vars: {
      '--bg-primary': '#ECEEF2',
      '--bg-secondary': '#F5F6F8',
      '--bg-surface': '#FFFFFF',
      '--bg-elevated': '#FFFFFF',
      '--text-primary': '#20242C',
      '--text-secondary': '#566171',
      '--text-muted': '#626C7A',
      '--accent': '#445CCB',
      '--accent-hover': '#364BB0',
      '--success': '#216A48',
      '--warning': '#855C12',
      '--danger': '#B42338',
      '--border': '#D8DDE5'
    },
    tokens: PAPER_TOKENS
  },
  {
    name: 'graphite',
    label: 'Graphite',
    mode: 'dark',
    vars: {
      '--bg-primary': '#171B22',
      '--bg-secondary': '#202630',
      '--bg-surface': '#2C3441',
      '--bg-elevated': '#2C3441',
      '--text-primary': '#EDF1F7',
      '--text-secondary': '#B5BECC',
      '--text-muted': '#A7B2C2',
      '--accent': '#A4B5FF',
      '--accent-hover': '#C0CCFF',
      '--success': '#83D6AD',
      '--warning': '#E9C17A',
      '--danger': '#FF9CAA',
      '--border': '#394454'
    },
    tokens: GRAPHITE_TOKENS
  },
  {
    name: 'catppuccin-mocha',
    label: 'Catppuccin Mocha',
    mode: 'dark',
    vars: {
      '--bg-primary': '#1e1e2e',
      '--bg-secondary': '#181825',
      '--bg-surface': '#313244',
      '--bg-elevated': '#45475a',
      '--text-primary': '#cdd6f4',
      '--text-secondary': '#a6adc8',
      '--text-muted': '#6c7086',
      '--accent': '#89b4fa',
      '--accent-hover': '#74c7ec',
      '--success': '#a6e3a1',
      '--warning': '#f9e2af',
      '--danger': '#f38ba8',
      '--border': '#585b70'
    }
  },
  {
    name: 'catppuccin-latte',
    label: 'Catppuccin Latte',
    mode: 'light',
    vars: {
      '--bg-primary': '#eff1f5',
      '--bg-secondary': '#e6e9ef',
      '--bg-surface': '#ccd0da',
      '--bg-elevated': '#bcc0cc',
      '--text-primary': '#4c4f69',
      '--text-secondary': '#5c5f77',
      '--text-muted': '#8c8fa1',
      '--accent': '#1e66f5',
      '--accent-hover': '#2a6ef5',
      '--success': '#40a02b',
      '--warning': '#df8e1d',
      '--danger': '#d20f39',
      '--border': '#9ca0b0'
    }
  },
  {
    name: 'dracula',
    label: 'Dracula',
    mode: 'dark',
    vars: {
      '--bg-primary': '#282a36',
      '--bg-secondary': '#21222c',
      '--bg-surface': '#44475a',
      '--bg-elevated': '#6272a4',
      '--text-primary': '#f8f8f2',
      '--text-secondary': '#bd93f9',
      '--text-muted': '#6272a4',
      '--accent': '#bd93f9',
      '--accent-hover': '#ff79c6',
      '--success': '#50fa7b',
      '--warning': '#f1fa8c',
      '--danger': '#ff5555',
      '--border': '#6272a4'
    }
  },
  {
    name: 'nord',
    label: 'Nord',
    mode: 'dark',
    vars: {
      '--bg-primary': '#2e3440',
      '--bg-secondary': '#2980b9',
      '--bg-surface': '#3b4252',
      '--bg-elevated': '#434c5e',
      '--text-primary': '#eceff4',
      '--text-secondary': '#d8dee9',
      '--text-muted': '#4c566a',
      '--accent': '#88c0d0',
      '--accent-hover': '#81a1c1',
      '--success': '#a3be8c',
      '--warning': '#ebcb8b',
      '--danger': '#bf616a',
      '--border': '#4c566a'
    }
  },
  {
    name: 'solarized-dark',
    label: 'Solarized Dark',
    mode: 'dark',
    vars: {
      '--bg-primary': '#002b36',
      '--bg-secondary': '#073642',
      '--bg-surface': '#0a3d4b',
      '--bg-elevated': '#11535e',
      '--text-primary': '#839496',
      '--text-secondary': '#93a1a1',
      '--text-muted': '#586e75',
      '--accent': '#268bd2',
      '--accent-hover': '#2aa198',
      '--success': '#859900',
      '--warning': '#b58900',
      '--danger': '#dc322f',
      '--border': '#586e75'
    }
  },
  {
    name: 'solarized-light',
    label: 'Solarized Light',
    mode: 'light',
    vars: {
      '--bg-primary': '#fdf6e3',
      '--bg-secondary': '#eee8d5',
      '--bg-surface': '#ddd6c1',
      '--bg-elevated': '#ccc6ae',
      '--text-primary': '#657b83',
      '--text-secondary': '#586e75',
      '--text-muted': '#93a1a1',
      '--accent': '#268bd2',
      '--accent-hover': '#2aa198',
      '--success': '#859900',
      '--warning': '#b58900',
      '--danger': '#dc322f',
      '--border': '#93a1a1'
    }
  }
]

export const DEFAULT_THEME_ID = 'catppuccin-mocha'

export const ACCENT_SWATCHES = [
  { name: 'Blue', color: '#89b4fa' },
  { name: 'Green', color: '#a6e3a1' },
  { name: 'Pink', color: '#f38ba8' },
  { name: 'Peach', color: '#fab387' },
  { name: 'Teal', color: '#94e2d5' },
  { name: 'Mauve', color: '#cba6f7' }
]

export const EDITOR_FONTS = [
  'Georgia',
  'Cambria',
  'Times New Roman',
  'Segoe UI',
  'Arial',
  'Verdana',
  'Cascadia Code',
  'Fira Code',
  'JetBrains Mono',
  'Source Code Pro',
  'Consolas',
  'Monaco',
  'monospace'
]

export const SPELL_CHECK_LANGUAGES = [
  { value: 'en-US', label: 'English (US)' },
  { value: 'en-GB', label: 'English (UK)' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
  { value: 'es', label: 'Spanish' },
  { value: 'it', label: 'Italian' },
  { value: 'pt-BR', label: 'Portuguese (BR)' },
  { value: 'nl', label: 'Dutch' },
  { value: 'ru', label: 'Russian' },
  { value: '', label: 'Off' }
]

export const LINE_SPACINGS = [
  { value: '1', label: '1.0 — Single' },
  { value: '1.15', label: '1.15 — Default' },
  { value: '1.5', label: '1.5 — Relaxed' },
  { value: '2', label: '2.0 — Double' }
]

export const AUTO_SAVE_OPTIONS = [
  { value: 10000, label: '10 seconds' },
  { value: 30000, label: '30 seconds' },
  { value: 60000, label: '1 minute' },
  { value: 120000, label: '2 minutes' },
  { value: 0, label: 'Off' }
]
