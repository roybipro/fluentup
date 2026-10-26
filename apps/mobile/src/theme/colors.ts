import { useAppStore } from '../store/useAppStore';

export interface ThemePalette {
  background: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  textPrimary: string;
  textSecondary: string;
  primary: string;
  primarySoft: string;
  accent: string;
  success: string;
  warning: string;
  danger: string;
}

export const LIGHT_COLORS: ThemePalette = {
  background: '#F8FAFC',
  surface: '#FFFFFF',
  surfaceAlt: '#F1F5F9',
  border: '#E2E8F0',
  textPrimary: '#0F172A',
  textSecondary: '#475569',
  primary: '#2563EB',
  primarySoft: '#DBEAFE',
  accent: '#0D9488',
  success: '#15803D',
  warning: '#B45309',
  danger: '#DC2626',
};

export const DARK_COLORS: ThemePalette = {
  background: '#0B1120',
  surface: '#1E293B',
  surfaceAlt: '#334155',
  border: '#334155',
  textPrimary: '#F8FAFC',
  textSecondary: '#CBD5E1',
  primary: '#3B82F6',
  primarySoft: '#1E3A8A',
  accent: '#14B8A6',
  success: '#22C55E',
  warning: '#F59E0B',
  danger: '#EF4444',
};

export function useThemePalette(): ThemePalette {
  const themeMode = useAppStore((s) => s.themeMode);
  return themeMode === 'dark' ? DARK_COLORS : LIGHT_COLORS;
}
