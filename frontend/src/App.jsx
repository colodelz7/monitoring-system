import { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import './style.css';
import { api } from './lib/api';
import { useCityState } from './hooks/useCityState';
import { useCityData } from './hooks/useCityData';
import { usePrefs } from './hooks/usePrefs';
import { usePushNotifications } from './hooks/usePushNotifications';
import { useTheme } from './hooks/useTheme';
import { useHashTab } from './hooks/useHashTab';

import ParticlesCanvas from './components/ParticlesCanvas';
import LoadingOverlay from './components/LoadingOverlay';
import Sidebar from './components/Sidebar';
import WorldClockBar from './components/WorldClockBar';
import Topbar from './components/Topbar';
import ViewTransition from './components/ViewTransition';
import LoadingBar from './components/LoadingBar';
import ErrorBoundary from './components/ErrorBoundary';
import ColodelBot from './components/ColodelBot';
import Dashboard from './components/tabs/Dashboard';
import Alerts from './components/tabs/Alerts';
import History from './components/tabs/History';

// O mapa e a comparação carregam sob demanda: juntos representam a maior parte
// do bundle e nenhum dos dois é a primeira tela que alguém vê. A semana e as
// regras entram na mesma regra: são abas que se visita, não onde se fica.
const SeismicMap = lazy(() => import('./components/tabs/SeismicMap'));
const Compare = lazy(() => import('./components/tabs/Compare'));
const Weekly = lazy(() => import('./components/tabs/Weekly'));
const Rules = lazy(() => import('./components/tabs/Rules'));

const TABS = ['dashboard', 'weekly', 'seismic', 'compare', 'rules', 'alerts', 'history'];

export default function App() {
  const [bootDone, setBootDone] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeTab, setActiveTab] = useHashTab(TABS, 'dashboard');
  const [serverConfig, setServerConfig] = useState(null);
  const [botOpen, setBotOpen] = useState(false);

  const [filters, updateFilters] = useCityState();
  const { data, loading, error, status, countdown } = useCityData(filters);
  const pushNotif = usePushNotifications();
  const prefs = usePrefs();
  const { theme, toggle: toggleTheme } = useTheme();

  useEffect(() => {
    const controller = new AbortController();
    api.config({ signal: controller.signal })
      .then(setServerConfig)
      .catch(() => setServerConfig({}));
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (data?.alerts?.length) pushNotif.notify(data.alerts);
  }, [data, pushNotif]);

  const finishBoot = useCallback(() => setBootDone(true), []);

  const selectCity = useCallback((city) => updateFilters({ city }), [updateFilters]);

  const changeTab = useCallback((tab) => {
    setActiveTab(tab);
    setSidebarOpen(false);
  }, [setActiveTab]);

  const alertsCount = data?.alertSummary?.total ?? 0;

  // O mapa precisa de um ponto para onde voar. Só existe quando o clima da
  // cidade foi resolvido de verdade, então nunca é um palpite.
  const lat = data?.weather?.lat;
  const lon = data?.weather?.lon;
  const cityCoords = Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;

  return (
    <>
      {!bootDone && <LoadingOverlay onDone={finishBoot} />}
      <ParticlesCanvas />

      <Sidebar
        open={sidebarOpen}
        filters={filters}
        onChange={updateFilters}
        pushNotif={pushNotif}
        activeTab={activeTab}
        onTabChange={changeTab}
        alertsCount={alertsCount}
        prefs={prefs}
      />

      <div className="main-wrapper">
        <WorldClockBar currentCity={filters.city} onSelectCity={selectCity} />

        <Topbar
          status={status}
          city={filters.city}
          cityTime={data?.cityTime}
          countdown={countdown}
          isMock={data?.isMock}
          isCached={data?.isCached}
          isStale={data?.isStale}
          cacheAge={data?.cacheAge}
          loading={loading}
          onMenuClick={() => setSidebarOpen((open) => !open)}
          theme={theme}
          onToggleTheme={toggleTheme}
          period={filters.period}
          onPeriodChange={(period) => updateFilters({ period })}
          periodLoading={loading}
        />

        {/* Logo abaixo da barra superior: é onde o olho já está quando
            alguém troca de período ou de cidade. */}
        <LoadingBar loading={loading} />

        <main className="content">
          {error && !data && (
            <div className="inline-notice inline-notice--error">
              {error}. Verifique se o backend está no ar.
            </div>
          )}

          {/* Só o painel é recortado por cidade, então só ele anima quando a
              cidade muda. O mapa sísmico é global e a comparação tem cidades
              próprias: piscar essas abas a cada troca seria distração, não
              leitura. */}
          <ViewTransition transitionKey={activeTab === 'dashboard' ? `dashboard:${filters.city}` : activeTab}>
            <ErrorBoundary>
              <Suspense fallback={<div className="lazy-fallback">Carregando módulo...</div>}>
                {activeTab === 'dashboard' && <Dashboard data={data} loading={loading} theme={theme} prefs={prefs} />}
                {activeTab === 'weekly' && (
                  <Weekly
                    weekly={data?.weekly}
                    cidade={data?.weather?.resolvedName || filters.city}
                    theme={theme}
                  />
                )}
                {activeTab === 'rules' && <Rules cidadeAtual={filters.city} />}
                {activeTab === 'seismic' && (
                  <SeismicMap
                    seismic={data?.seismic}
                    mapStyleUrl={
                      serverConfig?.mapStyles?.[theme] ?? serverConfig?.mapStyleUrl
                    }
                    cityName={data?.weather?.resolvedName || filters.city}
                    cityCoords={cityCoords}
                    theme={theme}
                  />
                )}
                {activeTab === 'compare' && <Compare />}
                {activeTab === 'alerts' && <Alerts alerts={data?.alerts} summary={data?.alertSummary} />}
                {activeTab === 'history' && <History theme={theme} />}
              </Suspense>
            </ErrorBoundary>
          </ViewTransition>
        </main>
      </div>

      <ColodelBot
        city={filters.city}
        period={filters.period}
        open={botOpen}
        onOpenChange={setBotOpen}
        onAction={updateFilters}
      />
    </>
  );
}
