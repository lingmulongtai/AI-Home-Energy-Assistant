import React, { useState, useEffect, useRef } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Line, ComposedChart, LineChart
} from 'recharts';
import {
  Battery, BatteryCharging, Zap, CloudSun, Sun, CloudRain, Server, Monitor, Laptop, Power, TrendingDown,
  BrainCircuit, Settings
} from 'lucide-react';
import { format, addMinutes, subMinutes } from 'date-fns';
import { cn } from './lib/utils';

type Weather = 'sunny' | 'cloudy' | 'rainy';

interface DataPoint {
  time: number;
  jackeryBattery: number;
  windowsBattery: number;
  solarOutput: number;
  consumption: number;
  gridInput: number;
  smartPlug: boolean;
}

const JACKERY_CAPACITY_WH = 632;
const MAX_SOLAR_OUTPUT_W = 100;
const NIGHT_RATE_START = 23;
const NIGHT_RATE_END = 6;
const CHEAP_RATE = 15;
const NORMAL_RATE = 35;

function createInitialHistory(anchor: Date): DataPoint[] {
  const points: DataPoint[] = [];
  let jBat = 54;
  let wBat = 96;
  for (let i = 36; i >= 1; i -= 1) {
    const t = subMinutes(anchor, i * 15);
    const h = t.getHours() + t.getMinutes() / 60;
    const isNight = h >= 18 || h < 6;
    const isCheap = h >= NIGHT_RATE_START || h < NIGHT_RATE_END;
    const solar = isNight ? 0 : Math.round(MAX_SOLAR_OUTPUT_W * Math.max(0, 1 - Math.abs(12 - h) / 6));
    const consumption = Math.round(h >= 9 && h <= 23 ? 38 + ((i * 7) % 12) : 14 + ((i * 5) % 6));
    const plug = isCheap && jBat < 62;
    const gridInput = plug ? 300 : 0;
    const net = solar + gridInput - consumption;
    jBat = Math.max(15, Math.min(100, jBat + ((net * 0.25) / JACKERY_CAPACITY_WH) * 100));
    wBat = Math.max(70, Math.min(100, wBat + (plug || solar > 20 ? 0.6 : -0.4)));
    points.push({
      time: t.getTime(),
      jackeryBattery: Number(jBat.toFixed(1)),
      windowsBattery: Number(wBat.toFixed(1)),
      solarOutput: solar,
      consumption,
      gridInput,
      smartPlug: plug,
    });
  }
  return points;
}

const INITIAL_DATE = new Date('2024-05-01T08:00:00');

const App = () => {
  const [currentDate, setCurrentDate] = useState(INITIAL_DATE);
  const [weatherTomorrow, setWeatherTomorrow] = useState<Weather>('sunny');
  const [currentWeather, setCurrentWeather] = useState<Weather>('sunny');
  const [jackeryBattery, setJackeryBattery] = useState(60);
  const [windowsBattery, setWindowsBattery] = useState(100);
  const [smartPlugOn, setSmartPlugOn] = useState(false);
  const [plugMode, setPlugMode] = useState<'on' | 'off' | 'auto'>('auto');
  const [gridInputWatts, setGridInputWatts] = useState(300);
  const [piPower, setPiPower] = useState(3.5);
  const [macPower, setMacPower] = useState(25.0);
  const [winPower, setWinPower] = useState(15.0);
  const [history, setHistory] = useState<DataPoint[]>(() => createInitialHistory(INITIAL_DATE));
  const [totalSaved, setTotalSaved] = useState(18);
  const [isSimulating, setIsSimulating] = useState(true);

  const [piOn, setPiOn] = useState(true);
  const [macOn, setMacOn] = useState(true);
  const [winOn, setWinOn] = useState(true);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'settings'>('dashboard');
  const [aiEnabled, setAiEnabled] = useState(true);

  const aiConfig = {
    sunnyTargetMin: 15,
    rainyTargetMin: 40,
    chargeRateNight: true,
  };

  const simState = useRef({
    jackery: jackeryBattery,
    windows: windowsBattery,
    smartPlug: smartPlugOn,
    weather: currentWeather,
    tomorrow: weatherTomorrow,
    ai: aiEnabled,
    pi: piOn,
    mac: macOn,
    win: winOn,
    plugMode,
    gridWatts: gridInputWatts,
  });

  useEffect(() => {
    simState.current = {
      jackery: jackeryBattery,
      windows: windowsBattery,
      smartPlug: smartPlugOn,
      weather: currentWeather,
      tomorrow: weatherTomorrow,
      ai: aiEnabled,
      pi: piOn,
      mac: macOn,
      win: winOn,
      plugMode,
      gridWatts: gridInputWatts,
    };
  }, [
    jackeryBattery,
    windowsBattery,
    smartPlugOn,
    currentWeather,
    weatherTomorrow,
    aiEnabled,
    piOn,
    macOn,
    winOn,
    plugMode,
    gridInputWatts,
  ]);

  useEffect(() => {
    if (!isSimulating) return;

    const interval = setInterval(() => {
      setCurrentDate((prev) => {
        const nextTime = addMinutes(prev, 15);
        const { jackery, windows, smartPlug, weather, tomorrow, ai, pi, mac, win, plugMode, gridWatts } =
          simState.current;

        const hour = nextTime.getHours();
        const isNight = hour >= 18 || hour < 6;
        const isCheapRateTime = hour >= NIGHT_RATE_START || hour < NIGHT_RATE_END;

        let simWeather = weather;
        let simTomorrow = tomorrow;
        if (hour === 0 && nextTime.getMinutes() === 0) {
          simWeather = tomorrow;
          setCurrentWeather(simWeather);
          const weathers: Weather[] = ['sunny', 'cloudy', 'rainy'];
          simTomorrow = weathers[Math.floor(Math.random() * weathers.length)];
          setWeatherTomorrow(simTomorrow);
        }

        let solar = 0;
        if (!isNight) {
          const peakDist = Math.abs(12 - (hour + nextTime.getMinutes() / 60));
          const efficiency = Math.max(0, 1 - peakDist / 6);
          let weatherFactor = 1;
          if (simWeather === 'cloudy') weatherFactor = 0.4;
          if (simWeather === 'rainy') weatherFactor = 0.1;
          solar = MAX_SOLAR_OUTPUT_W * efficiency * weatherFactor * (0.9 + Math.random() * 0.2);
        }

        const isActiveHours = hour >= 9 && hour <= 23;
        const currentPiPower = pi ? 1.5 + Math.random() * 4 : 0;

        let currentMacPower = 0;
        if (mac) {
          currentMacPower = isActiveHours ? 20 + Math.random() * 20 : 2;
        }

        let nextWb = windows;
        let currentWinPower = 0;
        if (win) {
          if (isActiveHours) {
            nextWb = Math.max(0, nextWb - 0.5);
          }
          if (jackery > 0 && nextWb < 100) {
            currentWinPower = 40 + Math.random() * 10;
            nextWb = Math.min(100, nextWb + 2);
          } else if (jackery > 0 && isActiveHours) {
            currentWinPower = 10 + Math.random() * 15;
          }
        } else if (jackery > 0 && nextWb < 100) {
          currentWinPower = 30 + Math.random() * 5;
          nextWb = Math.min(100, nextWb + 2);
        }

        setWindowsBattery(nextWb);
        setPiPower(currentPiPower);
        setMacPower(currentMacPower);
        setWinPower(currentWinPower);

        const totalConsumption = currentPiPower + currentMacPower + currentWinPower;

        let nextPlugState = smartPlug;
        if (plugMode === 'auto') {
          if (ai) {
            if (isCheapRateTime && simTomorrow === 'rainy' && jackery < 90) {
              nextPlugState = true;
            } else if (jackery <= (simWeather === 'sunny' ? aiConfig.sunnyTargetMin : aiConfig.rainyTargetMin)) {
              nextPlugState = true;
            } else if (jackery >= 95) {
              nextPlugState = false;
            } else if (isCheapRateTime && nextPlugState && jackery < 95) {
              nextPlugState = true;
            } else if (!isCheapRateTime && nextPlugState && jackery > 30 && simWeather === 'sunny') {
              nextPlugState = false;
            }
          } else {
            if (jackery < 20) nextPlugState = true;
            if (jackery > 90) nextPlugState = false;
          }
        } else {
          nextPlugState = plugMode === 'on';
        }

        if (nextPlugState !== smartPlug) {
          setSmartPlugOn(nextPlugState);
        }

        const gridPower = nextPlugState ? gridWatts : 0;
        const netPower = solar + gridPower - totalConsumption;
        const whChanged = netPower * 0.25;
        const percentChanged = (whChanged / JACKERY_CAPACITY_WH) * 100;

        let nextJackery = jackery + percentChanged;
        if (nextJackery > 100) nextJackery = 100;
        if (nextJackery < 0) nextJackery = 0;
        setJackeryBattery(nextJackery);

        const solarConsumed = Math.min(solar, totalConsumption + (jackery < 100 ? 500 : 0));
        const savedKwh = (solarConsumed * 0.25) / 1000;
        const currentRate = isCheapRateTime ? CHEAP_RATE : NORMAL_RATE;
        setTotalSaved((ts) => ts + savedKwh * currentRate);

        const newPoint: DataPoint = {
          time: nextTime.getTime(),
          jackeryBattery: nextJackery,
          windowsBattery: nextWb,
          solarOutput: Math.round(solar),
          consumption: Math.round(totalConsumption),
          gridInput: gridPower,
          smartPlug: nextPlugState,
        };

        setHistory((prevHist) => {
          const nextHist = [...prevHist, newPoint];
          return nextHist.length > 96 ? nextHist.slice(1) : nextHist;
        });

        return nextTime;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isSimulating]);

  const weatherIcon = (weather: Weather) => {
    if (weather === 'sunny') return <Sun className="size-4 text-zinc-700" strokeWidth={1.5} />;
    if (weather === 'cloudy') return <CloudSun className="size-4 text-zinc-500" strokeWidth={1.5} />;
    return <CloudRain className="size-4 text-zinc-700" strokeWidth={1.5} />;
  };

  const totalLoad = piPower + winPower + macPower;

  return (
    <div className="min-h-screen bg-[#fafafa] text-zinc-950">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        <header className="mb-6 flex flex-col gap-4 border-b border-zinc-200 pb-5 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex size-7 items-center justify-center rounded-md border border-zinc-200 bg-white text-emerald-700">
                <Zap className="size-4" strokeWidth={1.5} />
              </span>
              <h1 className="text-xl font-medium tracking-[-0.02em] text-zinc-950 sm:text-2xl">
                Home Energy AI
              </h1>
            </div>
            <p className="mt-1 text-sm text-zinc-500">
              Jackery Explorer 600 Plus & home server power telemetry
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-3 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-600">
              <span className="font-mono-num font-medium text-zinc-900">
                {format(currentDate, 'MMM dd, HH:mm')}
              </span>
              <span className="h-3.5 w-px bg-zinc-200" aria-hidden="true" />
              <span className="inline-flex items-center gap-1.5 capitalize text-zinc-700">
                {weatherIcon(currentWeather)}
                {currentWeather}
              </span>
            </div>

            <div className="inline-flex rounded-lg border border-zinc-200 bg-zinc-100 p-0.5">
              <button
                onClick={() => setActiveTab('dashboard')}
                className={cn(
                  'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                  activeTab === 'dashboard'
                    ? 'bg-white text-zinc-950 shadow-xs'
                    : 'text-zinc-600 hover:text-zinc-950',
                )}
                type="button"
              >
                Dashboard
              </button>
              <button
                onClick={() => setActiveTab('settings')}
                className={cn(
                  'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                  activeTab === 'settings'
                    ? 'bg-white text-zinc-950 shadow-xs'
                    : 'text-zinc-600 hover:text-zinc-950',
                )}
                type="button"
              >
                Settings
              </button>
            </div>
          </div>
        </header>

        <main className="space-y-6">
          {/* Top KPI Grid */}
          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* Jackery Storage */}
            <div className="flex flex-col justify-between rounded-xl border border-zinc-200 bg-white p-5">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-xs font-medium text-zinc-500">
                  <Battery className="size-4 text-zinc-400" strokeWidth={1.5} />
                  Jackery Exp. 600 Plus
                </span>
                <span
                  className={cn(
                    'rounded-md px-2 py-0.5 font-mono-num text-xs font-medium',
                    jackeryBattery > 20
                      ? 'bg-emerald-50 text-emerald-800'
                      : 'bg-rose-50 text-rose-700',
                  )}
                >
                  {jackeryBattery.toFixed(1)}%
                </span>
              </div>
              <div className="mt-4 space-y-3">
                <div className="font-mono-num text-2xl font-medium tracking-[-0.02em] text-zinc-950">
                  {((jackeryBattery / 100) * JACKERY_CAPACITY_WH).toFixed(0)}
                  <span className="ml-1 text-sm font-normal text-zinc-500">Wh</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-100">
                  <div
                    className={cn(
                      'h-full rounded-full transition-[width] duration-300',
                      jackeryBattery > 20 ? 'bg-emerald-600' : 'bg-rose-600',
                    )}
                    style={{ width: `${jackeryBattery}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Smart Plug / Grid */}
            <div className="flex flex-col justify-between rounded-xl border border-zinc-200 bg-white p-5">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-xs font-medium text-zinc-500">
                  <Power className="size-4 text-zinc-400" strokeWidth={1.5} />
                  Smart plug
                </span>
                <div className="inline-flex rounded-md border border-zinc-200 bg-zinc-100 p-0.5">
                  {(['on', 'off', 'auto'] as const).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => setPlugMode(mode)}
                      className={cn(
                        'rounded px-2 py-0.5 text-[11px] font-medium capitalize transition-colors',
                        plugMode === mode
                          ? 'bg-white text-zinc-950 shadow-xs'
                          : 'text-zinc-500 hover:text-zinc-900',
                      )}
                      type="button"
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </div>
              <div className="mt-4">
                <div className="font-mono-num text-2xl font-medium tracking-[-0.02em] text-zinc-950">
                  {smartPlugOn ? gridInputWatts : 0}
                  <span className="ml-1 text-sm font-normal text-zinc-500">W</span>
                </div>
                <div className="mt-3">
                  <div className="mb-1 flex justify-between text-xs text-zinc-500">
                    <span>Input limit</span>
                    <span className="font-mono-num text-zinc-700">{gridInputWatts} W</span>
                  </div>
                  <input
                    type="range"
                    min="100"
                    max="600"
                    step="50"
                    value={gridInputWatts}
                    onChange={(e) => setGridInputWatts(parseInt(e.target.value, 10))}
                    className="h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-zinc-200 accent-emerald-700"
                  />
                </div>
              </div>
            </div>

            {/* Savings */}
            <div className="flex flex-col justify-between rounded-xl border border-zinc-200 bg-white p-5">
              <div className="flex items-center gap-2 text-xs font-medium text-zinc-500">
                <TrendingDown className="size-4 text-zinc-400" strokeWidth={1.5} />
                Estimated savings
              </div>
              <div className="mt-4">
                <div className="font-mono-num text-2xl font-medium tracking-[-0.02em] text-emerald-700">
                  ¥{totalSaved.toFixed(0)}
                  <span className="ml-1 text-sm font-normal text-zinc-500">JPY</span>
                </div>
                <p className="mt-2 text-xs text-zinc-500">
                  Solar offset · load {totalLoad.toFixed(1)} W
                </p>
              </div>
            </div>

            {/* Weather & AI Forecast */}
            <div className="flex flex-col justify-between rounded-xl border border-zinc-200 bg-white p-5">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-xs font-medium text-zinc-500">
                  <BrainCircuit className="size-4 text-zinc-400" strokeWidth={1.5} />
                  Forecast policy
                </span>
                <button
                  onClick={() => setAiEnabled(!aiEnabled)}
                  className={cn(
                    'rounded-md border px-2 py-0.5 text-xs font-medium transition-colors',
                    aiEnabled
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                      : 'border-zinc-200 bg-zinc-100 text-zinc-600 hover:bg-zinc-200',
                  )}
                  type="button"
                >
                  {aiEnabled ? 'Active' : 'Manual'}
                </button>
              </div>
              <div className="mt-4 space-y-2 text-xs">
                <div className="flex items-center justify-between border-b border-zinc-100 pb-2">
                  <span className="text-zinc-500">Today</span>
                  <span className="inline-flex items-center gap-1.5 font-medium capitalize text-zinc-900">
                    {weatherIcon(currentWeather)}
                    {currentWeather}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-zinc-500">Tomorrow</span>
                  <span className="inline-flex items-center gap-1.5 font-medium capitalize text-zinc-900">
                    {weatherIcon(weatherTomorrow)}
                    {weatherTomorrow}
                  </span>
                </div>
              </div>
            </div>
          </section>

          {/* Connected Loads */}
          <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {/* Raspberry Pi */}
            <div
              className={cn(
                'flex items-center gap-4 rounded-xl border border-zinc-200 bg-white p-4 transition-opacity',
                !piOn && 'opacity-55',
              )}
            >
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50 text-zinc-600">
                <Server className="size-4" strokeWidth={1.5} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-zinc-950">Raspberry Pi 3B</div>
                <div className="text-xs text-zinc-500">ADS-B receiver</div>
              </div>
              <div className="flex flex-col items-end gap-1.5">
                <button
                  onClick={() => setPiOn(!piOn)}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium transition-colors',
                    piOn
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                      : 'border-zinc-200 bg-zinc-100 text-zinc-600 hover:bg-zinc-200',
                  )}
                  type="button"
                >
                  <Power className="size-3" strokeWidth={1.5} />
                  {piOn ? 'On' : 'Off'}
                </button>
                <div className="font-mono-num text-sm font-medium text-zinc-900">
                  {piPower.toFixed(1)}
                  <span className="ml-0.5 text-xs font-normal text-zinc-500">W</span>
                </div>
              </div>
            </div>

            {/* Windows PC */}
            <div
              className={cn(
                'flex items-center gap-4 rounded-xl border border-zinc-200 bg-white p-4 transition-opacity',
                !winOn && 'opacity-55',
              )}
            >
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50 text-zinc-600">
                <Laptop className="size-4" strokeWidth={1.5} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-zinc-950">ASUS Zephyrus G14</div>
                <div className="flex items-center gap-2 text-xs text-zinc-500">
                  <span>RTX 4050 Ti</span>
                  <span>·</span>
                  <span className="inline-flex items-center gap-1 font-mono-num">
                    {windowsBattery < 100 && winPower > 0 && (
                      <BatteryCharging className="size-3.5 text-emerald-700" strokeWidth={1.5} />
                    )}
                    {windowsBattery.toFixed(0)}%
                  </span>
                </div>
              </div>
              <div className="flex flex-col items-end gap-1.5">
                <button
                  onClick={() => setWinOn(!winOn)}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium transition-colors',
                    winOn
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                      : 'border-zinc-200 bg-zinc-100 text-zinc-600 hover:bg-zinc-200',
                  )}
                  type="button"
                >
                  <Power className="size-3" strokeWidth={1.5} />
                  {winOn ? 'On' : 'Off'}
                </button>
                <div className="font-mono-num text-sm font-medium text-zinc-900">
                  {winPower.toFixed(1)}
                  <span className="ml-0.5 text-xs font-normal text-zinc-500">W</span>
                </div>
              </div>
            </div>

            {/* Mac */}
            <div
              className={cn(
                'flex items-center gap-4 rounded-xl border border-zinc-200 bg-white p-4 transition-opacity',
                !macOn && 'opacity-55',
              )}
            >
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50 text-zinc-600">
                <Monitor className="size-4" strokeWidth={1.5} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-zinc-950">iMac 2017 4K</div>
                <div className="text-xs text-zinc-500">Home server</div>
              </div>
              <div className="flex flex-col items-end gap-1.5">
                <button
                  onClick={() => setMacOn(!macOn)}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium transition-colors',
                    macOn
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                      : 'border-zinc-200 bg-zinc-100 text-zinc-600 hover:bg-zinc-200',
                  )}
                  type="button"
                >
                  <Power className="size-3" strokeWidth={1.5} />
                  {macOn ? 'On' : 'Off'}
                </button>
                <div className="font-mono-num text-sm font-medium text-zinc-900">
                  {macPower.toFixed(1)}
                  <span className="ml-0.5 text-xs font-normal text-zinc-500">W</span>
                </div>
              </div>
            </div>
          </section>

          {/* Charts */}
          {activeTab === 'dashboard' && (
            <div className="space-y-6">
              <section className="rounded-xl border border-zinc-200 bg-white p-5">
                <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-medium text-zinc-950">Power flow (last 24 hours)</h2>
                    <p className="text-xs text-zinc-500">Solar generation vs device load and grid draw</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-4 text-xs text-zinc-600">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="size-2 rounded-full bg-emerald-600" />
                      Solar 100 W
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="size-2 rounded-full bg-zinc-900" />
                      Consumption
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="size-2 rounded-full bg-zinc-400" />
                      Grid input
                    </span>
                  </div>
                </div>
                <div className="h-[280px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={history} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#ececef" />
                      <XAxis
                        dataKey="time"
                        tickFormatter={(time) => format(new Date(time), 'HH:mm')}
                        stroke="#71717a"
                        fontSize={11}
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis stroke="#71717a" fontSize={11} tickLine={false} axisLine={false} />
                      <Tooltip
                        labelFormatter={(label) => format(new Date(label), 'MMM dd, HH:mm')}
                        contentStyle={{
                          borderRadius: '8px',
                          border: '1px solid #e4e4e7',
                          backgroundColor: '#ffffff',
                          fontSize: '12px',
                        }}
                      />
                      <Area
                        type="monotone"
                        dataKey="solarOutput"
                        name="Solar (W)"
                        fill="#059669"
                        stroke="#059669"
                        fillOpacity={0.14}
                        strokeWidth={1.75}
                        isAnimationActive={false}
                      />
                      <Area
                        type="stepBefore"
                        dataKey="gridInput"
                        name="Grid (W)"
                        fill="#a1a1aa"
                        stroke="#71717a"
                        fillOpacity={0.12}
                        strokeWidth={1.25}
                        isAnimationActive={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="consumption"
                        name="Load (W)"
                        stroke="#18181b"
                        strokeWidth={1.75}
                        dot={false}
                        isAnimationActive={false}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </section>

              <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <div className="rounded-xl border border-zinc-200 bg-white p-5">
                  <div className="mb-4">
                    <h2 className="text-sm font-medium text-zinc-950">Jackery battery level</h2>
                    <p className="text-xs text-zinc-500">State of charge (%)</p>
                  </div>
                  <div className="h-[220px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={history} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#ececef" />
                        <XAxis
                          dataKey="time"
                          tickFormatter={(time) => format(new Date(time), 'HH:mm')}
                          stroke="#71717a"
                          fontSize={11}
                          tickLine={false}
                          axisLine={false}
                        />
                        <YAxis stroke="#71717a" fontSize={11} domain={[0, 100]} tickLine={false} axisLine={false} />
                        <Tooltip
                          labelFormatter={(label) => format(new Date(label), 'MMM dd, HH:mm')}
                          contentStyle={{
                            borderRadius: '8px',
                            border: '1px solid #e4e4e7',
                            backgroundColor: '#ffffff',
                            fontSize: '12px',
                          }}
                        />
                        <Area
                          type="monotone"
                          dataKey="jackeryBattery"
                          name="Jackery %"
                          fill="#059669"
                          stroke="#059669"
                          fillOpacity={0.14}
                          strokeWidth={1.75}
                          isAnimationActive={false}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="rounded-xl border border-zinc-200 bg-white p-5">
                  <div className="mb-4">
                    <h2 className="text-sm font-medium text-zinc-950">ASUS Zephyrus G14 battery</h2>
                    <p className="text-xs text-zinc-500">Internal hardware battery (%)</p>
                  </div>
                  <div className="h-[220px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={history} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#ececef" />
                        <XAxis
                          dataKey="time"
                          tickFormatter={(time) => format(new Date(time), 'HH:mm')}
                          stroke="#71717a"
                          fontSize={11}
                          tickLine={false}
                          axisLine={false}
                        />
                        <YAxis stroke="#71717a" fontSize={11} domain={[0, 100]} tickLine={false} axisLine={false} />
                        <Tooltip
                          labelFormatter={(label) => format(new Date(label), 'MMM dd, HH:mm')}
                          contentStyle={{
                            borderRadius: '8px',
                            border: '1px solid #e4e4e7',
                            backgroundColor: '#ffffff',
                            fontSize: '12px',
                          }}
                        />
                        <Line
                          type="monotone"
                          dataKey="windowsBattery"
                          name="Zephyrus G14 %"
                          stroke="#18181b"
                          strokeWidth={1.75}
                          dot={false}
                          isAnimationActive={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </section>
            </div>
          )}

          {/* Settings */}
          {activeTab === 'settings' && (
            <section className="max-w-2xl rounded-xl border border-zinc-200 bg-white p-6">
              <h2 className="mb-5 flex items-center gap-2 text-base font-medium text-zinc-950">
                <Settings className="size-4 text-zinc-500" strokeWidth={1.5} />
                Simulation & automation settings
              </h2>

              <div className="space-y-5">
                <div className="flex items-center justify-between gap-4 rounded-lg border border-zinc-200 bg-zinc-50 p-4">
                  <div>
                    <div className="text-sm font-medium text-zinc-950">Run simulation</div>
                    <div className="text-xs text-zinc-500">
                      Accelerated clock (1s = 15m) to demonstrate charging and tariff shifts.
                    </div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={isSimulating}
                    onClick={() => setIsSimulating((v) => !v)}
                    className={cn(
                      'relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors',
                      isSimulating ? 'bg-emerald-700' : 'bg-zinc-300',
                    )}
                  >
                    <span
                      className={cn(
                        'inline-block size-4 rounded-full bg-white transition-transform',
                        isSimulating ? 'translate-x-6' : 'translate-x-1',
                      )}
                    />
                  </button>
                </div>

                <div className="border-t border-zinc-200 pt-5">
                  <div className="mb-4 flex items-center justify-between gap-4">
                    <div>
                      <div className="text-sm font-medium text-zinc-950">AI tariff optimization</div>
                      <div className="text-xs text-zinc-500">
                        Balances solar headroom against off-peak grid charging (¥{CHEAP_RATE}/kWh vs ¥{NORMAL_RATE}/kWh).
                      </div>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={aiEnabled}
                      onClick={() => setAiEnabled((v) => !v)}
                      className={cn(
                        'relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors',
                        aiEnabled ? 'bg-emerald-700' : 'bg-zinc-300',
                      )}
                    >
                      <span
                        className={cn(
                          'inline-block size-4 rounded-full bg-white transition-transform',
                          aiEnabled ? 'translate-x-6' : 'translate-x-1',
                        )}
                      />
                    </button>
                  </div>

                  {aiEnabled && (
                    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
                      <h3 className="text-xs font-medium text-zinc-900">Active policy rules</h3>
                      <ul className="mt-2.5 space-y-2 text-xs leading-5 text-zinc-600">
                        <li>
                          <strong className="font-medium text-zinc-900">Weather-aware buffering:</strong>{' '}
                          When tomorrow is sunny, allows discharge down to {aiConfig.sunnyTargetMin}% to reserve space for solar.
                        </li>
                        <li>
                          <strong className="font-medium text-zinc-900">Off-peak pre-charge:</strong>{' '}
                          When rain is forecast, tops up during cheap night rates (23:00–06:00 at ¥{CHEAP_RATE}/kWh).
                        </li>
                        <li>
                          <strong className="font-medium text-zinc-900">Load tracking:</strong>{' '}
                          Monitors Raspberry Pi, laptop, and home server wattage to limit peak grid pull.
                        </li>
                      </ul>
                    </div>
                  )}
                </div>

                <div className="border-t border-zinc-200 pt-5">
                  <h3 className="mb-3 text-sm font-medium text-zinc-950">Hardware deployment notes</h3>
                  <ol className="list-decimal space-y-1.5 pl-4 text-xs leading-6 text-zinc-600">
                    <li>
                      <strong className="font-medium text-zinc-900">Home Assistant:</strong> Run on the Raspberry Pi as the central controller.
                    </li>
                    <li>
                      <strong className="font-medium text-zinc-900">Jackery integration:</strong> Poll state of charge via HACS over Wi-Fi or Bluetooth.
                    </li>
                    <li>
                      <strong className="font-medium text-zinc-900">Smart plug:</strong> Connect a TP-Link Kasa or SwitchBot plug to the Jackery AC input.
                    </li>
                    <li>
                      <strong className="font-medium text-zinc-900">System monitors:</strong> Report laptop and desktop battery telemetry via Companion App.
                    </li>
                    <li>
                      <strong className="font-medium text-zinc-900">Weather & rules:</strong> Combine local forecast APIs with Home Assistant automations.
                    </li>
                  </ol>
                </div>
              </div>
            </section>
          )}
        </main>
      </div>
    </div>
  );
};

export default App;
