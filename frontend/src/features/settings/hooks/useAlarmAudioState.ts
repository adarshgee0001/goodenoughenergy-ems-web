import { useState, useEffect, useCallback } from 'react';
import { alarmAudioNotifier, type AlarmAudioState } from '../alarmAudio.utils';

export function useAlarmAudioState(): AlarmAudioState & { silence: () => void } {
  const [state, setState] = useState<AlarmAudioState>(() => alarmAudioNotifier.getState());

  useEffect(() => {
    return alarmAudioNotifier.subscribe((next) => {
      setState(next);
    });
  }, []);

  const silence = useCallback(() => {
    alarmAudioNotifier.silence();
  }, []);

  return { ...state, silence };
}
