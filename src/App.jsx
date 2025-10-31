import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Pause, RotateCcw } from 'lucide-react';

// --- Configuration Constants ---
const IPC_TYPES = {
  PIPE: 'Pipe',
  QUEUE: 'Message Queue',
  SHARED_MEMORY: 'Shared Memory',
  RESOURCES_DEADLOCK: 'Resource Deadlock',
};
const MAX_BUFFER_SIZE = 10;
const INITIAL_SHARED_MEMORY = { value: 0, accessed: 0 };
const INITIAL_PROCESS_STATE = 'IDLE';
const INITIAL_LOCK_STATE = null; 

// Initial state for calculated performance metrics
const INITIAL_PERF_METRICS = {
  throughput: 0,
  avgWaitTimeA: 0,
  avgWaitTimeB: 0,
};

// --- Helper Functions ---
const generateChunk = () => {
  const priority = Math.floor(Math.random() * 3) + 1;
  return { 
    value: Math.floor(Math.random() * 9) + 1, 
    priority: priority
  };
};

const App = () => {
  // --- State Management ---
  const [isRunning, setIsRunning] = useState(false);
  const [ipcType, setIpcType] = useState(IPC_TYPES.PIPE);
  const [producerSpeed, setProducerSpeed] = useState(500);
  const [consumerSpeed, setConsumerSpeed] = useState(800);
  const [buffer, setBuffer] = useState([]);
  const [sharedMemory, setSharedMemory] = useState(INITIAL_SHARED_MEMORY);
  const [lockHeldBy, setLockHeldBy] = useState(INITIAL_LOCK_STATE);
  const [processAState, setProcessAState] = useState(INITIAL_PROCESS_STATE);
  const [processBState, setProcessBState] = useState(INITIAL_PROCESS_STATE);
  const [logs, setLogs] = useState([]);
  const [metrics, setMetrics] = useState({
    produced: 0,
    consumed: 0,
    cycle: 0,
    startTime: Date.now()
  });
  const [perfMetrics, setPerfMetrics] = useState(INITIAL_PERF_METRICS);
  const [isLightTheme, setIsLightTheme] = useState(false);

  const intervalRef = useRef(null);
  const cycleRef = useRef(0);

  // --- Event Logging ---
  const addLog = useCallback((message) => {
    setLogs(prev => [{
      timestamp: new Date().toLocaleTimeString(),
      message
    }, ...prev].slice(0, 50));
  }, []);

  // --- Simulation Reset ---
  const resetSimulation = useCallback(() => {
    clearInterval(intervalRef.current);
    setIsRunning(false);
    setBuffer([]);
    setSharedMemory(INITIAL_SHARED_MEMORY);
    setLockHeldBy(INITIAL_LOCK_STATE);
    setProcessAState(INITIAL_PROCESS_STATE);
    setProcessBState(INITIAL_PROCESS_STATE);
    setLogs([]);
    setMetrics({ produced: 0, consumed: 0, cycle: 0, startTime: Date.now() });
    setPerfMetrics(INITIAL_PERF_METRICS);
    cycleRef.current = 0;
  }, []);

  // theme toggle effect: apply class to document body
  useEffect(() => {
    if (isLightTheme) document.documentElement.classList.add('light-theme');
    else document.documentElement.classList.remove('light-theme');
  }, [isLightTheme]);

  // keyboard shortcuts: Space = start/pause; Arrow keys adjust speeds
  useEffect(() => {
    const handler = (e) => {
      if (e.code === 'Space') {
        e.preventDefault();
        setIsRunning(prev => !prev);
      }
      if (e.code === 'ArrowUp') {
        setProducerSpeed(s => Math.max(100, s - 50));
      }
      if (e.code === 'ArrowDown') {
        setProducerSpeed(s => s + 50);
      }
      if (e.code === 'ArrowLeft') {
        setConsumerSpeed(s => Math.max(100, s - 50));
      }
      if (e.code === 'ArrowRight') {
        setConsumerSpeed(s => s + 50);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // --- Process Logic ---
  const runProcessA = useCallback(() => {
    if (ipcType === IPC_TYPES.PIPE || ipcType === IPC_TYPES.QUEUE) {
      if (buffer.length < MAX_BUFFER_SIZE) {
        const chunk = generateChunk();
        setBuffer(prev => [...prev, chunk]);
        setMetrics(m => ({ ...m, produced: m.produced + 1 }));
        setProcessAState('RUNNING');
        addLog(`Producer created value: ${chunk.value}`);
      } else {
        setProcessAState('BLOCKED');
        addLog('Producer blocked: Buffer full');
      }
    } else if (ipcType === IPC_TYPES.SHARED_MEMORY) {
      if (lockHeldBy === 'B') {
        setProcessAState('WAITING');
      } else if (lockHeldBy === null) {
        setLockHeldBy('A');
        setProcessAState('RUNNING');
        const newValue = sharedMemory.value + 1;
        setSharedMemory({ value: newValue, accessed: sharedMemory.accessed + 1 });
        setMetrics(m => ({ ...m, produced: m.produced + 1 }));
        addLog(`Producer wrote value: ${newValue}`);
        setLockHeldBy(null);
      }
    }
  }, [ipcType, buffer, lockHeldBy, sharedMemory, addLog]);

  const runProcessB = useCallback(() => {
    if (buffer.length === 0 && (ipcType === IPC_TYPES.PIPE || ipcType === IPC_TYPES.QUEUE)) {
      setProcessBState('BLOCKED');
      addLog('Consumer blocked: Buffer empty');
      return;
    }

    if (ipcType === IPC_TYPES.PIPE) {
      const chunk = buffer[0];
      setBuffer(prev => prev.slice(1));
      setMetrics(m => ({ ...m, consumed: m.consumed + 1 }));
      setProcessBState('RUNNING');
      addLog(`Consumer read value: ${chunk.value}`);
    } else if (ipcType === IPC_TYPES.QUEUE) {
      const highestPriorityIndex = buffer.reduce((bestIndex, current, currentIndex) => {
        return current.priority < buffer[bestIndex].priority ? currentIndex : bestIndex;
      }, 0);
      const chunk = buffer[highestPriorityIndex];
      setBuffer(prev => prev.filter((_, index) => index !== highestPriorityIndex));
      setMetrics(m => ({ ...m, consumed: m.consumed + 1 }));
      setProcessBState('RUNNING');
      addLog(`Consumer read value: ${chunk.value} (Priority: ${chunk.priority})`);
    } else if (ipcType === IPC_TYPES.SHARED_MEMORY) {
      if (lockHeldBy === 'A') {
        setProcessBState('WAITING');
      } else if (lockHeldBy === null) {
        setLockHeldBy('B');
        setProcessBState('RUNNING');
        const readValue = sharedMemory.value;
        addLog(`Consumer read value: ${readValue}`);
        setLockHeldBy(null);
        setMetrics(m => ({ ...m, consumed: m.consumed + 1 }));
      }
    }
  }, [ipcType, buffer, lockHeldBy, sharedMemory.value, addLog]);

  // --- Main Simulation Loop ---
  useEffect(() => {
    if (isRunning) {
      intervalRef.current = setInterval(() => {
        cycleRef.current += 1;
        setMetrics(m => ({ ...m, cycle: m.cycle + 1 }));

        // Update throughput every 10 cycles
        if (cycleRef.current % 10 === 0) {
          const timeElapsed = (Date.now() - metrics.startTime) / 1000;
          const totalProcessed = metrics.consumed + metrics.produced;
          setPerfMetrics(prev => ({
            ...prev,
            throughput: timeElapsed > 0 ? (totalProcessed / timeElapsed).toFixed(2) : 0
          }));
        }

        if (cycleRef.current % (producerSpeed / 100) === 0) {
          runProcessA();
        } else {
          setProcessAState('IDLE');
        }

        if (cycleRef.current % (consumerSpeed / 100) === 0) {
          runProcessB();
        } else {
          setProcessBState('IDLE');
        }
      }, 100);
    } else {
      clearInterval(intervalRef.current);
    }

    return () => clearInterval(intervalRef.current);
  }, [isRunning, producerSpeed, consumerSpeed, runProcessA, runProcessB, metrics.startTime, metrics.consumed, metrics.produced]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-800 to-emerald-700 p-8 text-white">
      <div className="max-w-5xl mx-auto glass rounded-2xl shadow-2xl overflow-hidden">
        <div className="p-8">
          <h1 className="text-2xl font-bold mb-6 text-white">
            IPC Debugging Tool
          </h1>

          {/* Configuration */}
          <div className="mb-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
              <div>
                <label className="block text-sm font-medium mb-2 text-gray-200">IPC Mechanism</label>
                <select
                  aria-label="IPC Mechanism"
                  value={ipcType}
                  onChange={(e) => {
                    setIpcType(e.target.value);
                    resetSimulation();
                  }}
                  className="w-full p-2 border rounded bg-white text-gray-800"
                >
                  {Object.entries(IPC_TYPES).map(([key, value]) => (
                    <option key={key} value={value}>{value}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2 text-gray-200">Producer Speed (ms)</label>
                <div className="flex gap-2">
                  <button aria-label="Decrease producer speed" onClick={() => setProducerSpeed(s => Math.max(100, s - 50))} className="px-2 rounded bg-white/8 text-white">-</button>
                  <input
                    aria-label="Producer speed"
                    type="number"
                    value={producerSpeed}
                    onChange={(e) => { const v = parseInt(e.target.value, 10); setProducerSpeed(Number.isNaN(v) ? 100 : Math.max(100, v)); }}
                    className="w-full p-2 border rounded bg-white text-gray-800"
                    min={100}
                    step={50}
                  />
                  <button aria-label="Increase producer speed" onClick={() => setProducerSpeed(s => s + 50)} className="px-2 rounded bg-white/8 text-white">+</button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2 text-gray-200">Consumer Speed (ms)</label>
                <div className="flex gap-2">
                  <button aria-label="Decrease consumer speed" onClick={() => setConsumerSpeed(s => Math.max(100, s - 50))} className="px-2 rounded bg-white/8 text-white">-</button>
                  <input
                    aria-label="Consumer speed"
                    type="number"
                    value={consumerSpeed}
                    onChange={(e) => { const v = parseInt(e.target.value, 10); setConsumerSpeed(Number.isNaN(v) ? 100 : Math.max(100, v)); }}
                    className="w-full p-2 border rounded bg-white text-gray-800"
                    min={100}
                    step={50}
                  />
                  <button aria-label="Increase consumer speed" onClick={() => setConsumerSpeed(s => s + 50)} className="px-2 rounded bg-white/8 text-white">+</button>
                </div>
              </div>
            </div>
            
            {/* Controls */}
            <div className="flex gap-4 items-center">
              <button
                onClick={() => setIsRunning(prev => !prev)}
                className={`px-4 py-2 rounded-lg flex items-center gap-2 text-white transition-colors shadow-md
                  ${isRunning ? 'bg-yellow-500 hover:bg-yellow-600' : 'bg-emerald-500 hover:bg-emerald-600'}`}
                aria-pressed={isRunning}
                aria-label="Start or pause simulation (Space)"
              >
                {isRunning ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                <span>{isRunning ? 'Pause' : 'Start'}</span>
              </button>
              <button
                onClick={resetSimulation}
                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white flex items-center gap-2 shadow-md"
                aria-label="Reset simulation"
              >
                <RotateCcw className="w-5 h-5" />
                <span>Reset</span>
              </button>
              <div className="ml-auto flex items-center gap-3">
                <button onClick={() => setIsLightTheme(t => !t)} className="px-3 py-2 rounded bg-white/8 text-white" aria-label="Toggle theme">Theme</button>
                <div className="text-sm text-gray-200">Shortcuts: Space Start/Pause • Arrows adjust speeds</div>
              </div>
            </div>
          </div>

          {/* Process Status */}
          <div className="mb-6">
            <h2 className="text-lg font-semibold mb-3 text-white">Process Status</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 rounded-lg border glass">
                <h3 className="font-medium text-white">Producer (Process A)</h3>
                <p>Status: <span className="font-medium">{processAState}</span></p>
                <p className="text-sm text-gray-200">Speed: {producerSpeed}ms</p>
              </div>
              <div className="p-4 rounded-lg border glass">
                <h3 className="font-medium text-white">Consumer (Process B)</h3>
                <p>Status: <span className="font-medium">{processBState}</span></p>
                <p className="text-sm text-gray-200">Speed: {consumerSpeed}ms</p>
              </div>
            </div>
          </div>

          {/* Visualization */}
          <div className="mb-6">
            <h2 className="text-lg font-semibold mb-3 text-white">IPC Visualization</h2>
            <div className="p-4 rounded-lg border glass">
              {ipcType === IPC_TYPES.SHARED_MEMORY ? (
                <div className="text-center">
                  <p className="text-xl font-bold mb-2 text-white">Memory Value: {sharedMemory.value}</p>
                  <p className="text-gray-200">
                    Lock Status: {lockHeldBy ? `Held by Process ${lockHeldBy}` : 'Free'}
                  </p>
                </div>
              ) : (
                <div>
                  <div className="flex justify-center gap-1 mb-2">
                    {Array.from({ length: MAX_BUFFER_SIZE }).map((_, index) => (
                      <div
                        key={index}
                        className={`w-10 h-10 rounded-lg flex items-center justify-center text-sm font-medium
                          ${buffer[index] 
                            ? 'bg-emerald-100/60 border-2 border-emerald-300/40 text-emerald-900' 
                            : 'bg-white/6 border border-white/8 text-white/70'}`}
                      >
                        {buffer[index]?.value || ''}
                      </div>
                    ))}
                  </div>
                  <p className="text-center text-gray-200">
                    Buffer: {buffer.length}/{MAX_BUFFER_SIZE}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Metrics */}
          <div className="mb-6">
            <h2 className="text-lg font-semibold mb-3 text-white">Performance Metrics</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-3 rounded-lg glass">
                <p className="text-sm text-gray-200">Cycles</p>
                <p className="text-xl font-semibold text-white">{metrics.cycle}</p>
              </div>
              <div className="p-3 rounded-lg glass">
                <p className="text-sm text-gray-200">Produced</p>
                <p className="text-xl font-semibold text-white">{metrics.produced}</p>
              </div>
              <div className="p-3 rounded-lg glass">
                <p className="text-sm text-gray-200">Consumed</p>
                <p className="text-xl font-semibold text-white">{metrics.consumed}</p>
              </div>
              <div className="p-3 rounded-lg glass">
                <p className="text-sm text-gray-200">Throughput</p>
                <p className="text-xl font-semibold text-white">{perfMetrics.throughput}/s</p>
              </div>
            </div>
          </div>

          {/* Logs */}
          <div>
            <h2 className="text-lg font-semibold mb-3 text-white">Event Log</h2>
            <div className="h-48 overflow-y-auto rounded-lg p-3 glass">
              {logs.length > 0 ? (
                logs.map((log, index) => (
                  <div key={index} className="mb-1 text-sm">
                    <span className="text-gray-500">[{log.timestamp}]</span>{' '}
                    <span className="text-gray-200">{log.message}</span>
                  </div>
                ))
              ) : (
                <p className="text-gray-500 text-sm">No events recorded yet. Start the simulation to see activity.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;
