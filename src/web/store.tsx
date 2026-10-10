import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, type PublicConfig, type MeResponse } from './api';

interface Store {
  config: PublicConfig | null;
  configError: boolean;
  me: MeResponse | null;
  meLoading: boolean;
  refreshMe: () => Promise<void>;
  refreshConfig: () => Promise<void>;
  setupRequired: boolean | null;
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [configError, setConfigError] = useState(false);
  const [me, setMe] = useState<MeResponse | null>(null);
  const [meLoading, setMeLoading] = useState(true);
  const [setupRequired, setSetupRequired] = useState<boolean | null>(null);

  const refreshConfig = useCallback(async () => {
    try {
      setConfig(await api.get<PublicConfig>('/api/config/public'));
      setConfigError(false);
    } catch {
      setConfigError(true);
    }
  }, []);

  const refreshMe = useCallback(async () => {
    try {
      setMe(await api.get<MeResponse>('/api/auth/me'));
    } catch {
      setMe({ user: null });
    } finally {
      setMeLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshConfig();
    refreshMe();
    api.get<{ setup_required: boolean }>('/api/setup/status')
      .then((d) => setSetupRequired(d.setup_required))
      .catch(() => setSetupRequired(false));
  }, [refreshConfig, refreshMe]);

  const value = useMemo<Store>(() => ({
    config, configError, me, meLoading, refreshMe, refreshConfig, setupRequired,
  }), [config, configError, me, meLoading, refreshMe, refreshConfig, setupRequired]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const v = useContext(Ctx);
  if (!v) throw new Error('useStore outside provider');
  return v;
}
