import React, { useState, useEffect, useRef } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Line, ComposedChart, LineChart
} from 'recharts';
import {
  Battery, BatteryCharging, Zap, CloudSun, Sun, CloudRain, Server, Monitor, Laptop, Power, TrendingDown,
  BrainCircuit, Activity, Settings, AlertCircle
} from 'lucide-react';
import { format, addMinutes } from 'date-fns';
import { cn } from './lib/utils';

// --- Types ---
type Weather = 'sunny' | 'cloudy' | 'rainy';

interface DataPoint {
  time: number;
  jackeryBattery: number; // 0-100%
  windowsBattery: number; // 0-100%
  solarOutput: number;    // W
  consumption: number;    // W
  gridInput: number;      // W
  smartPlug: boolean;
}

// --- Constants ---
const JACKERY_CAPACITY_WH = 632;
const MAX_SOLAR_OUTPUT_W = 100;
const NIGHT_RATE_START = 23; // 23:00
const NIGHT_RATE_END = 6;    // 06:00
const CHEAP_RATE = 15;       // ¥/kWh
const NORMAL_RATE = 35;      // ¥/kWh

const App = () => {
  // === State ===
  const [currentDate, setCurrentDate] = useState(new Date('2024-05-01T08:00:00'));
  const [weatherTomorrow, setWeatherTomorrow] = useState<Weather>('sunny');
  const [currentWeather, setCurrentWeather] = useState<Weather>('sunny');
  const [jackeryBattery, setJackeryBattery] = useState(60); // %
  const [windowsBattery, setWindowsBattery] = useState(100); // %
  const [smartPlugOn, setSmartPlugOn] = useState(false);
  const [plugMode, setPlugMode] = useState<'on' | 'off' | 'auto'>('auto');
  const [gridInputWatts, setGridInputWatts] = useState(300);
  const [piPower, setPiPower] = useState(3.5);
  const [macPower, setMacPower] = useState(25.0);
  const [winPower, setWinPower] = useState(15.0);
  const [history, setHistory] = useState<DataPoint[]>([]);
  const [totalSaved, setTotalSaved] = useState(0); // ¥
  const [isSimulating, setIsSimulating] = useState(true);

  // === Device On/Off State ===
  const [piOn, setPiOn] = useState(true);
  const [macOn, setMacOn] = useState(true);
  const [winOn, setWinOn] = useState(true);

  // === UI State ===
  const [activeTab, setActiveTab] = useState<'dashboard' | 'settings'>('dashboard');

  // === AI Logic Configuration ===
  const [aiEnabled, setAiEnabled] = useState(true);
  const aiConfig = {
    sunnyTargetMin: 15,
    rainyTargetMin: 40,
    chargeRateNight: true, // Charge during cheap night rates if rain expected
  };

  // State refs for the simulation loop to prevent recreation
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
    gridWatts: gridInputWatts
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
      gridWatts: gridInputWatts
    };
  }, [jackeryBattery, windowsBattery, smartPlugOn, currentWeather, weatherTomorrow, aiEnabled, piOn, macOn, winOn, plugMode, gridInputWatts]);

  // === Simulation Loop ===
  useEffect(() => {
    if (!isSimulating) return;

    const interval = setInterval(() => {
      setCurrentDate((prev) => {
        const nextTime = addMinutes(prev, 15); // Advance 15 mins per tick
        const { jackery, windows, smartPlug, weather, tomorrow, ai, pi, mac, win, plugMode, gridWatts } = simState.current;
        
        // --- 1. Weather Logic ---
        const hour = nextTime.getHours();
        const isNight = hour >= 18 || hour < 6;
        const isCheapRateTime = hour >= NIGHT_RATE_START || hour < NIGHT_RATE_END;
        
        // simple weather shift (tomorrow's weather becomes current weather at midnight)
        let simWeather = weather;
        let simTomorrow = tomorrow;
        if (hour === 0 && nextTime.getMinutes() === 0) {
          simWeather = tomorrow;
          setCurrentWeather(simWeather);
          // Randomize next day's weather
          const weathers: Weather[] = ['sunny', 'cloudy', 'rainy'];
          simTomorrow = weathers[Math.floor(Math.random() * weathers.length)];
          setWeatherTomorrow(simTomorrow);
        }

        // --- 2. Solar Generation (Simulated) ---
        let solar = 0;
        if (!isNight) {
          // Peak at noon (12:00)
          const peakDist = Math.abs(12 - (hour + nextTime.getMinutes()/60));
          const efficiency = Math.max(0, 1 - (peakDist / 6)); // 0 to 1
          
          let weatherFactor = 1;
          if (simWeather === 'cloudy') weatherFactor = 0.4;
          if (simWeather === 'rainy') weatherFactor = 0.1;

          solar = MAX_SOLAR_OUTPUT_W * efficiency * weatherFactor;
          // Add some noise
          solar *= (0.9 + Math.random() * 0.2);
        }

        // --- 3. Consumption (Simulated) ---
        const isActiveHours = hour >= 9 && hour <= 23;
        
        let currentPiPower = pi ? (1.5 + Math.random() * 4) : 0;
        
        let currentMacPower = 0;
        if (mac) {
          currentMacPower = 2; // Sleep mode
          if (isActiveHours) {
            currentMacPower = 20 + Math.random() * 20; // Mac active
          }
        }

        let nextWb = windows;
        let currentWinPower = 0;
        if (win) {
          if (isActiveHours) {
              nextWb = Math.max(0, nextWb - 0.5); // Use battery
          }
          if (jackery > 0 && nextWb < 100) {
              currentWinPower = 40 + Math.random() * 10; // Charging Win PC
              nextWb = Math.min(100, nextWb + 2);
          } else if (jackery > 0 && isActiveHours) {
              currentWinPower = 10 + Math.random() * 15; // Running plugged in
          }
        } else {
          // Off, but can charge if battery < 100
          if (jackery > 0 && nextWb < 100) {
              currentWinPower = 30 + Math.random() * 5; // Just charging
              nextWb = Math.min(100, nextWb + 2);
          }
        }
        
        setWindowsBattery(nextWb);
        setPiPower(currentPiPower);
        setMacPower(currentMacPower);
        setWinPower(currentWinPower);

        const totalConsumption = currentPiPower + currentMacPower + currentWinPower;

        // --- 4. AI Smart Plug Logic ---
        let nextPlugState = smartPlug;
        if (plugMode === 'auto') {
          if (ai) {
            if (isCheapRateTime && simTomorrow === 'rainy' && jackery < 90) {
              // Night time, cheap electricity, rain tomorrow -> Charge it up!
              nextPlugState = true;
            } else if (jackery <= (simWeather === 'sunny' ? aiConfig.sunnyTargetMin : aiConfig.rainyTargetMin)) {
              // Battery critical
              nextPlugState = true;
            } else if (jackery >= 95) {
              // Battery full
              nextPlugState = false;
            } else if (isCheapRateTime && nextPlugState && jackery < 95) {
              // Keep charging during night if already on
              nextPlugState = true;
            } else if (!isCheapRateTime && nextPlugState && jackery > 30 && simWeather === 'sunny') {
               // Turn off if it's day time and sunny and we have some buffer
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

        // --- 5. Battery Update ---
        const gridPower = nextPlugState ? gridWatts : 0; // Configurable charging from wall
        const netPower = solar + gridPower - totalConsumption;
        
        // Add to Jackery
        // Wh changed in 15 mins = netPower * (15 / 60)
        const whChanged = netPower * 0.25;
        const percentChanged = (whChanged / JACKERY_CAPACITY_WH) * 100;
        
        let nextJackery = jackery + percentChanged;
        if (nextJackery > 100) nextJackery = 100;
        if (nextJackery < 0) nextJackery = 0;
        setJackeryBattery(nextJackery);

        // --- 6. Stats Logging ---
        // If we used solar, we saved money!
        // Money saved = Solar consumed (kWh) * Rate
        const solarConsumed = Math.min(solar, totalConsumption + (jackery < 100 ? 500 : 0));
        const savedKwh = (solarConsumed * 0.25) / 1000;
        const currentRate = isCheapRateTime ? CHEAP_RATE : NORMAL_RATE;
        setTotalSaved(ts => ts + savedKwh * currentRate);

        // Update history
        const newPoint: DataPoint = {
          time: nextTime.getTime(),
          jackeryBattery: nextJackery,
          windowsBattery: nextWb,
          solarOutput: Math.round(solar),
          consumption: Math.round(totalConsumption),
          gridInput: gridPower,
          smartPlug: nextPlugState
        };

        setHistory(prev => {
          const nextHist = [...prev, newPoint];
          if (nextHist.length > 96) { // Keep last 24 hours (96 * 15m)
            return nextHist.slice(1);
          }
          return nextHist;
        });

        return nextTime;
      });
    }, 1000); // 1 real sec = 15 sim mins

    return () => clearInterval(interval);
  }, [isSimulating]); // Only re-run if isSimulating toggles


  // The unused legacy array dependency removes eslint unused error
  const [toggleSmartPlug] = useState(() => {});

  const getAiBgClass = () => {
    const hour = currentDate.getHours();
    const isDay = hour >= 6 && hour < 18;
    
    if (isDay) {
      if (currentWeather === 'sunny') return 'bg-gradient-to-br from-sky-400 to-amber-200 border-sky-300 text-slate-900';
      if (currentWeather === 'cloudy') return 'bg-gradient-to-br from-slate-200 to-slate-300 border-slate-300 text-slate-900';
      if (currentWeather === 'rainy') return 'bg-gradient-to-br from-slate-600 to-blue-800 border-slate-500 text-white';
    } else {
      if (currentWeather === 'sunny') return 'bg-gradient-to-br from-indigo-900 to-slate-900 border-indigo-800 text-white'; // clear night
      if (currentWeather === 'cloudy') return 'bg-gradient-to-br from-slate-800 to-slate-900 border-slate-700 text-white';
      if (currentWeather === 'rainy') return 'bg-gradient-to-br from-slate-900 to-blue-950 border-slate-800 text-white';
    }
    return 'bg-slate-900 border-slate-800 text-white';
  };

  const aiBgClass = getAiBgClass();
  const isDarkAiBg = aiBgClass.includes('text-white');

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <header className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <Zap className="text-amber-500" />
            Home Energy AI
          </h1>
          <p className="text-slate-500 mt-1">Jackery Explorer 600 Plus & Home Server Power Management</p>
        </div>
        <div className="flex flex-col items-end gap-3">
          <div className="text-sm font-medium text-slate-500 flex items-center gap-3">
            <span className="bg-white px-3 py-1 rounded-md shadow-sm border border-slate-200">
              {format(currentDate, "MMM dd, HH:mm")}
            </span>
            <span className="bg-white px-3 py-1 rounded-md shadow-sm border border-slate-200 flex items-center gap-1 capitalize">
              {currentWeather === 'sunny' && <Sun size={14} className="text-amber-500"/>}
              {currentWeather === 'cloudy' && <CloudSun size={14} className="text-slate-400"/>}
              {currentWeather === 'rainy' && <CloudRain size={14} className="text-blue-500"/>}
              {currentWeather}
            </span>
          </div>
          <div className="flex bg-white rounded-lg shadow-sm border border-slate-200 p-1">
             <button 
              onClick={() => setActiveTab('dashboard')}
              className={cn("px-4 py-2 rounded-md font-medium text-sm transition-colors", activeTab === 'dashboard' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100')}
            >
              Dashboard
            </button>
            <button 
              onClick={() => setActiveTab('settings')}
              className={cn("px-4 py-2 rounded-md font-medium text-sm transition-colors", activeTab === 'settings' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100')}
            >
              Settings
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto space-y-6">
        
        {/* Top Stats Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          
          {/* Jackery Status */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 flex flex-col justify-between">
            <div className="flex justify-between items-start mb-4">
              <div className="flex items-center gap-2 text-slate-500 font-medium">
                <Battery size={20} />
                <span>Jackery Exp. 600 Plus</span>
              </div>
              <span className={cn("px-2.5 py-0.5 rounded-full text-xs font-bold", 
                jackeryBattery > 20 ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
              )}>
                {jackeryBattery.toFixed(1)}%
              </span>
            </div>
            <div className="space-y-4">
              <div className="text-3xl font-bold tracking-tight text-slate-900">
                {((jackeryBattery / 100) * JACKERY_CAPACITY_WH).toFixed(0)} <span className="text-lg text-slate-500 font-normal">Wh</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2.5">
                <div 
                  className={cn("h-2.5 rounded-full transition-all duration-500", jackeryBattery > 20 ? "bg-emerald-500" : "bg-rose-500")}
                  style={{ width: `${jackeryBattery}%` }}
                ></div>
              </div>
            </div>
          </div>

          {/* Smart Plug / Grid Status */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 flex flex-col justify-between relative group">
            <div className="flex justify-between items-start mb-4">
               <div className="flex items-center gap-2 text-slate-500 font-medium">
                <Power size={20} />
                <span>TP-Link Smartplug</span>
              </div>
              <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                <button
                  onClick={() => setPlugMode('on')}
                  className={cn("px-2.5 py-1 text-xs font-bold rounded-md transition-all", plugMode === 'on' ? "bg-white shadow-sm text-slate-900" : "text-slate-500 hover:text-slate-700")}
                >ON</button>
                 <button
                  onClick={() => setPlugMode('off')}
                  className={cn("px-2.5 py-1 text-xs font-bold rounded-md transition-all", plugMode === 'off' ? "bg-white shadow-sm text-slate-900" : "text-slate-500 hover:text-slate-700")}
                >OFF</button>
                 <button
                  onClick={() => setPlugMode('auto')}
                  className={cn("px-2.5 py-1 text-xs font-bold rounded-md transition-all", plugMode === 'auto' ? "bg-purple-100 text-purple-700 shadow-sm" : "text-slate-500 hover:text-slate-700")}
                >AUTO</button>
              </div>
            </div>
            <div>
              <div className="text-3xl font-bold tracking-tight text-slate-900 flex items-end gap-2">
                 {smartPlugOn ? gridInputWatts : 0} <span className="text-lg text-slate-500 font-normal mb-1">W</span>
              </div>
              
              <div className="mt-4">
                <div className="flex justify-between text-xs text-slate-500 mb-1">
                  <span>Input Power Limit</span>
                  <span>{gridInputWatts}W</span>
                </div>
                <input 
                  type="range" 
                  min="100" max="600" step="50" 
                  value={gridInputWatts} 
                  onChange={(e) => setGridInputWatts(parseInt(e.target.value))}
                  className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                />
              </div>
            </div>
          </div>

          {/* Savings */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 flex flex-col justify-between">
             <div className="flex justify-between items-start mb-4">
               <div className="flex items-center gap-2 text-slate-500 font-medium">
                <TrendingDown size={20} />
                <span>Estimated Savings</span>
              </div>
            </div>
            <div>
              <div className="text-3xl font-bold tracking-tight text-emerald-600">
                 ¥{totalSaved.toFixed(0)} <span className="text-lg text-emerald-600/70 font-normal">JPY</span>
              </div>
               <div className="text-sm text-slate-500 mt-2">
                From solar utilization
              </div>
            </div>
          </div>

          {/* Weather AI */}
          <div className={cn("rounded-xl shadow-sm border p-5 flex flex-col justify-between relative overflow-hidden transition-colors duration-1000", aiBgClass)}>
            <div className={cn("absolute -right-6 -bottom-6 opacity-10", isDarkAiBg ? "text-white" : "text-slate-900")}>
              <BrainCircuit size={120} />
            </div>
             <div className="flex justify-between items-start mb-4 relative z-10">
               <div className={cn("flex items-center gap-2 font-medium", isDarkAiBg ? "text-slate-200" : "text-slate-800")}>
                <BrainCircuit size={20} />
                <span>AI Prediction</span>
              </div>
              <button 
                onClick={() => setAiEnabled(!aiEnabled)}
                className={cn("px-2.5 py-0.5 rounded-full text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer", 
                  aiEnabled 
                    ? (isDarkAiBg ? "bg-indigo-500 text-white hover:bg-indigo-600" : "bg-indigo-600 text-white hover:bg-indigo-700") 
                    : (isDarkAiBg ? "bg-slate-700 text-slate-400 hover:bg-slate-600" : "bg-white/40 text-slate-700 hover:bg-white/60")
                )}
              >
                {aiEnabled ? 'ACTIVE' : 'DISABLED'}
              </button>
            </div>
            <div className="relative z-10 space-y-2">
              <div className="flex justify-between items-center text-sm">
                <span className={isDarkAiBg ? "text-slate-300" : "text-slate-700"}>Current Weather</span>
                <span className={cn("flex items-center gap-1 font-medium", isDarkAiBg ? "text-white" : "text-slate-900")}>
                  {currentWeather === 'sunny' && <Sun size={16} className={isDarkAiBg ? "text-yellow-400" : "text-amber-500"}/>}
                  {currentWeather === 'cloudy' && <CloudSun size={16} className={isDarkAiBg ? "text-slate-300" : "text-slate-600"}/>}
                  {currentWeather === 'rainy' && <CloudRain size={16} className={isDarkAiBg ? "text-blue-400" : "text-blue-700"}/>}
                  <span className="capitalize">{currentWeather}</span>
                </span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className={isDarkAiBg ? "text-slate-300" : "text-slate-700"}>Tomorrow</span>
                <span className={cn("flex items-center gap-1 font-medium", isDarkAiBg ? "text-white" : "text-slate-900")}>
                  {weatherTomorrow === 'sunny' && <Sun size={16} className={isDarkAiBg ? "text-yellow-400" : "text-amber-500"}/>}
                  {weatherTomorrow === 'cloudy' && <CloudSun size={16} className={isDarkAiBg ? "text-slate-300" : "text-slate-600"}/>}
                  {weatherTomorrow === 'rainy' && <CloudRain size={16} className={isDarkAiBg ? "text-blue-400" : "text-blue-700"}/>}
                  <span className="capitalize">{weatherTomorrow}</span>
                </span>
              </div>
            </div>
          </div>
        </div>

          {/* Connected Devices */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
           {/* Raspberry Pi */}
           <div className={cn("bg-white rounded-lg border p-4 flex items-center gap-4 transition-colors", piOn ? "border-slate-200" : "border-slate-200 opacity-60 bg-slate-50")}>
              <div className={cn("w-12 h-12 rounded-lg flex items-center justify-center transition-colors", piOn ? "bg-rose-50 text-rose-600" : "bg-slate-100 text-slate-400")}>
                <Server size={24} />
              </div>
              <div className="flex-1">
                <div className="font-bold text-slate-900">Raspberry Pi 3B</div>
                <div className="text-xs text-slate-500">ADSB Server</div>
              </div>
              <div className="text-right flex flex-col items-end gap-1">
                <button 
                  onClick={() => setPiOn(!piOn)}
                  className={cn("px-2 py-1 text-xs font-bold rounded flex items-center gap-1 transition-colors", piOn ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200" : "bg-slate-200 text-slate-600 hover:bg-slate-300")}
                >
                  <Power size={12}/> {piOn ? 'ON' : 'OFF'}
                </button>
                <div className="font-bold text-slate-900 text-lg">{piPower.toFixed(1)}<span className="text-sm text-slate-500 font-normal">W</span></div>
              </div>
           </div>

           {/* Windows PC */}
            <div className={cn("bg-white rounded-lg border p-4 flex items-center gap-4 relative overflow-hidden transition-colors", winOn ? "border-slate-200" : "border-slate-200 opacity-60 bg-slate-50")}>
              <div className={cn("w-12 h-12 rounded-lg flex items-center justify-center transition-colors relative z-10", winOn ? "bg-blue-50 text-blue-600" : "bg-slate-100 text-slate-400")}>
                <Laptop size={24} />
              </div>
              <div className="flex-1 z-10">
                <div className="font-bold text-slate-900 text-sm">ASUS Zephyrus G14</div>
                <div className="text-xs text-slate-500">RTX4050Ti</div>
              </div>
               <div className="text-right z-10 flex flex-col items-end gap-1">
                 <button 
                  onClick={() => setWinOn(!winOn)}
                  className={cn("px-2 py-1 text-xs font-bold rounded flex items-center gap-1 transition-colors", winOn ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200" : "bg-slate-200 text-slate-600 hover:bg-slate-300")}
                 >
                  <Power size={12}/> {winOn ? 'ON' : 'OFF'}
                 </button>
                <div className="font-bold text-slate-900 text-lg flex items-center gap-1 justify-end">
                   {winPower.toFixed(1)}<span className="text-sm text-slate-500 font-normal">W</span>
                </div>
                <div className="text-xs text-slate-600 font-medium flex items-center gap-1 justify-end mt-0.5">
                   {windowsBattery < 100 && winPower > 0 && <BatteryCharging size={12} className="text-amber-500"/>}
                   Bat: {windowsBattery.toFixed(0)}%
                </div>
              </div>
              {/* Battery Background progress */}
              <div 
                className="absolute left-0 bottom-0 top-0 bg-blue-50/50 z-0 transition-all duration-1000 opacity-30" 
                style={{ width: `${windowsBattery}%`}}
              />
           </div>

           {/* Mac */}
           <div className={cn("bg-white rounded-lg border p-4 flex items-center gap-4 transition-colors", macOn ? "border-slate-200" : "border-slate-200 opacity-60 bg-slate-50")}>
              <div className={cn("w-12 h-12 rounded-lg flex items-center justify-center transition-colors", macOn ? "bg-slate-100 text-slate-600" : "bg-slate-100 text-slate-400")}>
                <Monitor size={24} />
              </div>
              <div className="flex-1">
                <div className="font-bold text-slate-900">iMac 2017 4k</div>
                <div className="text-xs text-slate-500">Home Server</div>
              </div>
              <div className="text-right flex flex-col items-end gap-1">
                <button 
                  onClick={() => setMacOn(!macOn)}
                  className={cn("px-2 py-1 text-xs font-bold rounded flex items-center gap-1 transition-colors", macOn ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200" : "bg-slate-200 text-slate-600 hover:bg-slate-300")}
                >
                  <Power size={12}/> {macOn ? 'ON' : 'OFF'}
                </button>
                <div className="font-bold text-slate-900 text-lg">{macPower.toFixed(1)}<span className="text-sm text-slate-500 font-normal">W</span></div>
              </div>
           </div>
        </div>

        {/* Charts Dashboard */}
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            
            {/* Main Power Chart */}
            <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Power Flow (Last 24 Hours)</h3>
                  <p className="text-sm text-slate-500">Generation vs Consumption</p>
                </div>
                <div className="flex items-center gap-2 text-sm">
                   <div className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-amber-400"></span> Solar 100W</div>
                   <div className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-rose-500"></span> Consume</div>
                   <div className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-blue-500"></span> Grid</div>
                </div>
              </div>
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={history} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                    <XAxis 
                      dataKey="time" 
                      tickFormatter={(time) => format(new Date(time), 'HH:mm')}
                      stroke="#94A3B8"
                      fontSize={12}
                    />
                    <YAxis stroke="#94A3B8" fontSize={12} />
                    <Tooltip 
                      labelFormatter={(label) => format(new Date(label), 'MMM dd, HH:mm')}
                      contentStyle={{ borderRadius: '8px', border: '1px solid #E2E8F0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    />
                    <Area type="monotone" dataKey="solarOutput" name="Solar Gen (W)" fill="#FBBF24" stroke="#F59E0B" fillOpacity={0.3} />
                    <Line type="monotone" dataKey="consumption" name="Consumption (W)" stroke="#F43F5E" strokeWidth={2} dot={false} />
                    <Area type="step" dataKey="gridInput" name="Grid Input (W)" fill="#3B82F6" stroke="#2563EB" fillOpacity={0.2} step="stepBefore" />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Battery Lifecycle Chart */}
             <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
               <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
                <div className="mb-4">
                  <h3 className="text-lg font-bold text-slate-900">Jackery Battery Level</h3>
                  <p className="text-sm text-slate-500">State of charge %</p>
                </div>
                <div className="h-[250px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={history} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                      <XAxis 
                        dataKey="time" 
                        tickFormatter={(time) => format(new Date(time), 'HH:mm')}
                        stroke="#94A3B8"
                        fontSize={12}
                      />
                      <YAxis stroke="#94A3B8" fontSize={12} domain={[0, 100]} />
                      <Tooltip labelFormatter={(label) => format(new Date(label), 'MMM dd, HH:mm')} />
                      <Area type="monotone" dataKey="jackeryBattery" name="Jackery %" fill="#10B981" stroke="#059669" fillOpacity={0.2} strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

               <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
                <div className="mb-4">
                  <h3 className="text-lg font-bold text-slate-900">ASUS Zephyrus G14 Battery</h3>
                  <p className="text-sm text-slate-500">Internal hardware battery %</p>
                </div>
                <div className="h-[250px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={history} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                      <XAxis 
                        dataKey="time" 
                        tickFormatter={(time) => format(new Date(time), 'HH:mm')}
                        stroke="#94A3B8"
                        fontSize={12}
                      />
                      <YAxis stroke="#94A3B8" fontSize={12} domain={[0, 100]} />
                      <Tooltip labelFormatter={(label) => format(new Date(label), 'MMM dd, HH:mm')} />
                      <Line type="monotone" dataKey="windowsBattery" name="Zephyrus G14 %" stroke="#3B82F6" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
             </div>
          </div>
        )}

        {/* Settings Tab */}
        {activeTab === 'settings' && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 max-w-2xl">
             <h2 className="text-xl font-bold mb-6 flex items-center gap-2"><Settings className="text-slate-500" /> Simulation & AI Settings</h2>
             
             <div className="space-y-6">
                <div>
                  <label className="flex items-center justify-between p-4 border border-slate-200 rounded-lg bg-slate-50 hover:bg-slate-100 transition-colors cursor-pointer">
                    <div>
                      <div className="font-bold text-slate-900">Run Simulation</div>
                      <div className="text-sm text-slate-500">Accelerated time (1s = 15m) to demonstrate system behavior.</div>
                    </div>
                    <div className="relative inline-block w-12 mr-2 align-middle select-none transition duration-200 ease-in">
                        <input type="checkbox" name="toggle" id="simToggle" className="toggle-checkbox absolute block w-6 h-6 rounded-full bg-white border-4 appearance-none cursor-pointer" checked={isSimulating} onChange={(e) => setIsSimulating(e.target.checked)}/>
                        <label htmlFor="simToggle" className={cn("toggle-label block overflow-hidden h-6 rounded-full cursor-pointer", isSimulating ? "bg-indigo-600" : "bg-slate-300")}></label>
                    </div>
                    <style>{`
                      .toggle-checkbox:checked { right: 0; border-color: #4f46e5; }
                      .toggle-checkbox:checked + .toggle-label { background-color: #4f46e5; }
                      .toggle-checkbox { transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); border-color: #cbd5e1; }
                    `}</style>
                  </label>
                </div>

                <div className="border-t border-slate-200 pt-6">
                   <div className="flex items-center justify-between mb-4">
                     <div>
                        <div className="font-bold text-slate-900">AI Optimization Mode</div>
                        <div className="text-sm text-slate-500">Uses machine learning predictions to maximize solar usage and minimize night rates.</div>
                     </div>
                      <div className="relative inline-block w-12 mr-2 align-middle select-none transition duration-200 ease-in">
                          <input type="checkbox" name="toggleAi" id="aiToggle" className="toggle-checkbox absolute block w-6 h-6 rounded-full bg-white border-4 appearance-none cursor-pointer" checked={aiEnabled} onChange={(e) => setAiEnabled(e.target.checked)}/>
                          <label htmlFor="aiToggle" className={cn("toggle-label block overflow-hidden h-6 rounded-full cursor-pointer", aiEnabled ? "bg-indigo-600" : "bg-slate-300")}></label>
                      </div>
                   </div>

                   {aiEnabled && (
                      <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-4 space-y-3">
                        <h4 className="font-semibold text-indigo-900 text-sm">Active AI Strategies</h4>
                        <ul className="text-sm text-indigo-800 space-y-2">
                          <li className="flex gap-2"><div className="w-1.5 h-1.5 rounded-full bg-indigo-500 mt-1.5"></div> <strong>Weather-aware buffering:</strong> If tomorrow is sunny, ignores low battery warnings down to {aiConfig.sunnyTargetMin}% to leave room for free solar charging.</li>
                          <li className="flex gap-2"><div className="w-1.5 h-1.5 rounded-full bg-indigo-500 mt-1.5"></div> <strong>Pre-emptive charging:</strong> If tomorrow is rain/cloudy, charges to 100% during cheap night hours (¥{CHEAP_RATE}/kWh).</li>
                          <li className="flex gap-2"><div className="w-1.5 h-1.5 rounded-full bg-indigo-500 mt-1.5"></div> <strong>Load prediction:</strong> Evaluates Windows PC active states and adjusts grid reliance dynamically.</li>
                        </ul>
                      </div>
                   )}
                </div>

                <div className="border-t border-slate-200 pt-6">
                  <h3 className="font-bold text-slate-900 mb-4">How to build this locally</h3>
                  <div className="prose prose-sm text-slate-600 max-w-none">
                    <p>To implement this hardware system in reality, you will need:</p>
                    <ol>
                      <li><strong>Home Assistant:</strong> Running on the Raspberry Pi to orchestrate everything.</li>
                      <li><strong>Jackery Integration for HA:</strong> Use community plugins via HACS to poll Jackery battery status over Wi-Fi/Bluetooth.</li>
                      <li><strong>Smart Plug:</strong> A TP-Link Kasa or SwitchBot Plug connected to the Jackery AC Input, integrated into Home Assistant.</li>
                      <li><strong>System Monitors:</strong> HA Companion App on Windows/Mac to report local battery states to Home Assistant.</li>
                      <li><strong>Weather Integration:</strong> OpenWeatherMap or local Japan Meteorology API in Home Assistant.</li>
                      <li><strong>Automation Rules:</strong> Use Node-RED or native HA automations to replicate the AI logic demonstrated here.</li>
                    </ol>
                  </div>
                </div>
             </div>
          </div>
        )}

      </main>
    </div>
  );
};

export default App;
