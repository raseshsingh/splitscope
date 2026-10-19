/** What a key press in the panel should do. Kept pure so the guards can be tested without a DOM. */
export type ShortcutIntent = { kind: 'none' } | { kind: 'blur' } | { kind: 'escape' } | { kind: 'search' } | { kind: 'section'; index: number };
export function shortcutIntent(key: string, context: { modifier: boolean; inDialog: boolean; inField: boolean; settingsOpen: boolean }): ShortcutIntent {
  // Modal dialogs handle their own keys; nothing behind them reacts.
  if (context.modifier || context.inDialog) return { kind: 'none' };
  // In a field, Escape only leaves the field; a second Escape then closes or minimizes.
  if (key === 'Escape') return context.inField ? { kind: 'blur' } : { kind: 'escape' };
  // Typing and the settings dialog keep section and search shortcuts from firing.
  if (context.inField || context.settingsOpen) return { kind: 'none' };
  if (key === '/') return { kind: 'search' };
  const index = Number(key) - 1;
  return Number.isInteger(index) && index >= 0 && index <= 3 ? { kind: 'section', index } : { kind: 'none' };
}
