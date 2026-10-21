import { useContext } from 'react';
import { UserSettingsContext } from '../context/UserSettingsContext';
import type { UserSettingsContextValue } from '../settings.types';

export function useUserSettings(): UserSettingsContextValue {
  const context = useContext(UserSettingsContext);
  if (!context) {
    throw new Error('useUserSettings must be used within a UserSettingsProvider');
  }
  return context;
}
