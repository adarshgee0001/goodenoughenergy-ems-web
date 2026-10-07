import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { useAuth } from '../hooks/useAuth';

interface PreviewState {
  clientId: string;
  clientName: string;
}

interface PreviewContextType {
  isPreviewing: boolean;
  previewClientId: string | null;
  previewClientName: string | null;
  startPreview: (clientId: string, clientName: string) => void;
  exitPreview: () => void;
}

const PREVIEW_STORAGE_KEY = 'gee_admin_preview';

export const PreviewContext = createContext<PreviewContextType | undefined>(undefined);

export function PreviewProvider({ children }: { children: ReactNode }) {
  const { role } = useAuth();
  const [previewState, setPreviewState] = useState<PreviewState | null>(() => {
    try {
      const stored = sessionStorage.getItem(PREVIEW_STORAGE_KEY);
      if (stored) {
        return JSON.parse(stored) as PreviewState;
      }
    } catch (e) {
      console.error('Failed to parse preview state from sessionStorage', e);
    }
    return null;
  });

  // Ensure only ADMIN can hold preview state
  useEffect(() => {
    if (role !== 'ADMIN' && previewState !== null) {
      exitPreview();
    }
  }, [role, previewState]);

  const startPreview = (clientId: string, clientName: string) => {
    if (role !== 'ADMIN') return;
    const newState = { clientId, clientName };
    setPreviewState(newState);
    sessionStorage.setItem(PREVIEW_STORAGE_KEY, JSON.stringify(newState));
  };

  const exitPreview = () => {
    setPreviewState(null);
    sessionStorage.removeItem(PREVIEW_STORAGE_KEY);
  };

  // Only consider isPreviewing true if the user is genuinely an ADMIN
  const isPreviewing = role === 'ADMIN' && previewState !== null;

  return (
    <PreviewContext.Provider
      value={{
        isPreviewing,
        previewClientId: isPreviewing ? previewState.clientId : null,
        previewClientName: isPreviewing ? previewState.clientName : null,
        startPreview,
        exitPreview,
      }}
    >
      {children}
    </PreviewContext.Provider>
  );
}

export function usePreview() {
  const context = useContext(PreviewContext);
  if (context === undefined) {
    throw new Error('usePreview must be used within a PreviewProvider');
  }
  return context;
}
