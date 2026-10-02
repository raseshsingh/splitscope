export interface Settings { keepLog: boolean; restorePanel: boolean; theme: 'system' | 'light' | 'dark'; dock: 'right' | 'left' | 'bottom'; textSize: 'normal' | 'large' }
export const defaultSettings: Settings = { keepLog: false, restorePanel: true, theme: 'system', dock: 'right', textSize: 'normal' };
export function normalizeSettings(value: unknown): Settings {
  const input = (value && typeof value === 'object' ? value : {}) as Partial<Settings>;
  return { restorePanel: input.restorePanel !== false, keepLog: input.keepLog === true, theme: ['system', 'light', 'dark'].includes(input.theme || '') ? input.theme! : 'system', dock: ['right', 'left', 'bottom'].includes(input.dock || '') ? input.dock! : 'right', textSize: input.textSize === 'large' ? 'large' : 'normal' };
}
