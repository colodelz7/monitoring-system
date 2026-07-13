import { useState, useEffect } from 'react';
import './style.css';
import { api } from './lib/api';
import { useCityState } from './hooks/useCityState';
import { useCityData } from './hooks/useCityData';
import { usePushNotifications } from './hooks/usePushNotifications';

import ParticlesCanvas from './components/ParticlesCanvas';
import LoadingOverlay from './components/LoadingOverlay';
import Sidebar from './components/Sidebar';
import WorldClockBar from './components/WorldClockBar';
import Topbar from './components/Topbar';
import Dashboard from './components/tabs/Dashboard';
import SeismicMap from './components/tabs/SeismicMap';
import Compare from './components/tabs/Compare';
import Alerts from './components/tabs/Alerts';
import History from './components/tabs/History';

export default function App() {
  const [loadingDone, setLoadingDone] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [stadiaKey, setStadiaKey] = useState('');

  const [filters, updateFilters] = useCityState();
  const { data, loading, status, countdown, refetch } = useCityData(filters);
  const pushNotif = usePushNotifications();

  useEffect(() => {
    api.config().then((cfg) => setStadiaKey(cfg.stadiaKey || '')).catch(() => {});
  }, []);

  useEffect(() => {
    if (data?.alerts?.length) pushNotif.notify(data.alerts);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  function selectCity(city) {
    updateFilters({ city });
  }

  const alertsCount = data?.alerts?.length || 0;

  return (
    <>
      {!loadingDone && <LoadingOverlay onDone={() => setLoadingDone(true)} />}
      <ParticlesCanvas />

      <Sidebar
        open={sidebarOpen}
        filters={filters}
        onChange={updateFilters}
        pushNotif={pushNotif}
        activeTab={activeTab}
        onTabChange={(t) => { setActiveTab(t); setSidebarOpen(false); }}
        alertsCount={alertsCount}
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
          cacheAge={data?.cacheAge}
          alertsCount={alertsCount}
          loading={loading}
          onMenuClick={() => setSidebarOpen((o) => !o)}
          onRefresh={refetch}
        />

        <main className="content">
          <section className="tab-panel active">
            {activeTab === 'dashboard' && (
              <Dashboard data={data} tMin={filters.tempMin} tMax={filters.tempMax} mag={filters.magThreshold} />
            )}
            {activeTab === 'seismic' && (
              <SeismicMap events={data?.seismic?.events || []} mag={filters.magThreshold} stadiaKey={stadiaKey} />
            )}
            {activeTab === 'compare' && <Compare />}
            {activeTab === 'alerts' && <Alerts alerts={data?.alerts || []} />}
            {activeTab === 'history' && <History />}
          </section>
        </main>
      </div>
    </>
  );
}
