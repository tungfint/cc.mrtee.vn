import type { CSSProperties } from 'react';

export interface NotificationTextStyle {
  fontFamily?: 'Be Vietnam Pro' | 'Arial' | 'Georgia' | 'monospace';
  fontSize?: number;
  color?: string;
  fontWeight?: 400 | 600 | 800 | 900;
  fontStyle?: 'normal' | 'italic';
  textAlign?: 'left' | 'center' | 'right';
}

export function notificationTextStyle(style?: NotificationTextStyle | null): CSSProperties {
  if (!style) return {};
  return {
    ...(style.fontFamily ? { fontFamily: style.fontFamily } : {}),
    ...(style.fontSize ? { fontSize: `${style.fontSize}px` } : {}),
    ...(style.color ? { color: style.color } : {}),
    ...(style.fontWeight ? { fontWeight: style.fontWeight } : {}),
    ...(style.fontStyle ? { fontStyle: style.fontStyle } : {}),
    ...(style.textAlign ? { textAlign: style.textAlign } : {}),
  };
}
