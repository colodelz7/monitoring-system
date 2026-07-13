import Cards from './Cards';
import ForecastChart from './ForecastChart';
import RainChart from './RainChart';

export default function Dashboard({ data, tMin, tMax, mag }) {
  if (!data) return null;
  const { weather, seismic, aqi, alerts, forecast } = data;

  return (
    <>
      <Cards weather={weather} seismic={seismic} aqi={aqi} alerts={alerts} tMin={tMin} tMax={tMax} mag={mag} />
      <div className="charts-grid">
        <ForecastChart points={forecast?.points} />
        <RainChart points={forecast?.points} />
      </div>
    </>
  );
}
