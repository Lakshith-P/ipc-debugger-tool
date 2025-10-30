import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Pause, RotateCcw, Zap, AlertTriangle, Cpu, Lock, Unlock, HardHat, Skull, Send, Server, TrendingUp, Clock, ArrowRight, Shuffle, CircleDot, Dribbble } from 'lucide-react';

// --- Configuration Constants ---
const IPC_TYPES = {
  PIPE: 'Pipe (FIFO)',
  QUEUE: 'Message Queue (Priority)', // Revision 3
  SHARED_MEMORY: 'Shared Memory (Mutex)',
  RESOURCES_DEADLOCK: 'Resource Deadlock (Simulated)', // Revision 2
};
const MAX_BUFFER_SIZE = 10;
const INITIAL_SHARED_MEMORY = { value: 0, accessed: 0 };
const INITIAL_PROCESS_STATE = 'IDLE';
const INITIAL_LOCK_STATE = null; 

// Resource Simulation State (from Revision 2)
const INITIAL_RESOURCE_STATE = {
  R1: { heldBy: null, requestedBy: null },
  R2: { heldBy: null, requestedBy: null },
  deadlock: false,
};

// Initial state for calculated performance metrics (Revision 4)
const INITIAL_PERF_METRICS = {
  throughput: 0, // items per second
  avgWaitTimeA: 0, // ms
  avgWaitTimeB: 0, // ms
};

// --- Helper Functions ---
const generateChunk = () => {
    const priority = Math.floor(Math.random() * 3) + 1; // 1 (High) to 3 (Low)
    return { 
        value: Math.floor(Math.random() * 9) + 1, 
        priority: priority
    };
};
const getStatusColor = (status) => {
  switch (status) {
    case 'RUNNING': return 'bg-green-500';
    case 'BLOCKED': return 'bg-yellow-500';
    case 'DEADLOCKED': return 'bg-red-600 animate-pulse';
    case 'WAITING': return 'bg-blue-500';
    default: return 'bg-gray-500';
  }
};
const getLogColor = (type) => {
  switch (type) {
    case 'ERROR': return 'text-red-400 font-bold';
    case 'WARNING': return 'text-yellow-400';
    case 'DEADLOCK': return 'text-red-500 font-extrabold';
    default: return 'text-gray-300';
  }
};
const getPriorityColor = (priority) => {
    switch(priority) {
        case 1: return 'bg-red-500'; // Highest Priority
        case 2: return 'bg-yellow-500';
        case 3: return 'bg-green-500'; // Lowest Priority
        default: return 'bg-gray-500';
    }
}

const App = () => {
  // --- Simulation State (IPC Engine Core) ---
  const [isRunning, setIsRunning] = useState(false);
  const [ipcType, setIpcType] = useState(IPC_TYPES.PIPE);
  const [producerSpeed, setProducerSpeed] = useState(500); // ms
  const [consumerSpeed, setConsumerSpeed] = useState(800);  // ms
  const [buffer, setBuffer] = useState([]); // Stores [{value, priority}, ...]
  const [sharedMemory, setSharedMemory] = useState(INITIAL_SHARED_MEMORY);
  const [lockHeldBy, setLockHeldBy] = useState(INITIAL_LOCK_STATE); 
  const [resources, setResources] = useState(INITIAL_RESOURCE_STATE); 
  const [processAState, setProcessAState] = useState(INITIAL_PROCESS_STATE); 
  const [processBState, setProcessBState] = useState(INITIAL_PROCESS_STATE); 
  const [logs, setLogs] = useState([]);
  const [metrics, setMetrics] = useState({ produced: 0, consumed: 0, aWaitTime: 0, bWaitTime: 0, cycle: 0, startTime: Date.now() });
  
  const [perfMetrics, setPerfMetrics] = useState(INITIAL_PERF_METRICS); 

  const intervalRef = useRef(null);
  const cycleRef = useRef(0);

  const addLog = useCallback((type, message) => {
    setLogs(prev => [{ timestamp: new Date().toLocaleTimeString(), type, message }, ...prev].slice(0, 50));
  }, []);

  const resetSimulation = useCallback(() => {
    clearInterval(intervalRef.current);
    setIsRunning(false);
    setBuffer([]);
    setSharedMemory(INITIAL_SHARED_MEMORY);
    setLockHeldBy(INITIAL_LOCK_STATE);
    setResources(INITIAL_RESOURCE_STATE); 
    setProcessAState(INITIAL_PROCESS_STATE);
    setProcessBState(INITIAL_PROCESS_STATE);
    setLogs([]);
    setMetrics({ produced: 0, consumed: 0, aWaitTime: 0, bWaitTime: 0, cycle: 0, startTime: Date.now() });
    setPerfMetrics(INITIAL_PERF_METRICS); // Reset calculated metrics
    cycleRef.current = 0;
  }, []);
  
  // --- Metric Calculation Function (Revision 4) ---
  const calculatePerformanceMetrics = useCallback(() => {
    if (metrics.cycle < 10) return;

    const timeElapsedSeconds = (Date.now() - metrics.startTime) / 1000;
    
    // 1. Throughput (Average items processed per second)
    const totalProcessed = metrics.consumed + metrics.produced;
    const throughput = timeElapsedSeconds > 0 ? (totalProcessed / timeElapsedSeconds) : 0;

    // 2. Latency (Average Wait Time per process)
    const avgWaitTimeA = metrics.produced > 0 
      ? (metrics.aWaitTime * 100) / metrics.produced 
      : 0;
    const avgWaitTimeB = metrics.consumed > 0
      ? (metrics.bWaitTime * 100) / metrics.consumed
      : 0;

    setPerfMetrics({
      throughput: parseFloat(throughput.toFixed(2)),
      avgWaitTimeA: parseFloat(avgWaitTimeA.toFixed(2)),
      avgWaitTimeB: parseFloat(avgWaitTimeB.toFixed(2)),
    });

  }, [metrics.cycle, metrics.produced, metrics.consumed, metrics.aWaitTime, metrics.bWaitTime, metrics.startTime]);
  // --- End Metric Calculation Function ---

  
  // --- Resource Deadlock Simulation Logic (Revision 2) ---
  const runDeadlockProcessA = useCallback(() => {
    if (resources.deadlock) { setProcessAState('DEADLOCKED'); return; }

    if (resources.R1.heldBy === null) {
      setResources(prev => ({ ...prev, R1: { heldBy: 'A', requestedBy: null } }));
      setProcessAState('RUNNING');
      addLog('INFO', '[P-A] Acquired Resource R1.');
    } else if (resources.R1.heldBy === 'B') {
      setResources(prev => ({ ...prev, R1: { ...prev.R1, requestedBy: 'A' } }));
      setProcessAState('BLOCKED');
      setMetrics(m => ({ ...m, aWaitTime: m.aWaitTime + 1 })); 
      addLog('WARNING', '[P-A] Waiting for R1 (held by P-B).');
    }

    if (resources.R1.heldBy === 'A' && resources.R2.heldBy === null) {
      setResources(prev => ({ ...prev, R2: { heldBy: 'A', requestedBy: null } }));
      setProcessAState('RUNNING');
      addLog('INFO', '[P-A] Acquired Resource R2. Task Complete!');
      setResources(INITIAL_RESOURCE_STATE);
    } else if (resources.R1.heldBy === 'A' && resources.R2.heldBy === 'B') {
      setResources(prev => ({ ...prev, R2: { ...prev.R2, requestedBy: 'A' } }));
      setProcessAState('BLOCKED');
      setMetrics(m => ({ ...m, aWaitTime: m.aWaitTime + 1 })); 
      if (resources.R1.requestedBy === 'B') {
        setResources(prev => ({ ...prev, deadlock: true }));
      }
    }
  }, [resources, addLog]);

  const runDeadlockProcessB = useCallback(() => {
    if (resources.deadlock) { setProcessBState('DEADLOCKED'); return; }

    if (resources.R2.heldBy === null) {
      setResources(prev => ({ ...prev, R2: { heldBy: 'B', requestedBy: null } }));
      setProcessBState('RUNNING');
      addLog('INFO', '[P-B] Acquired Resource R2.');
    } else if (resources.R2.heldBy === 'A') {
      setResources(prev => ({ ...prev, R2: { ...prev.R2, requestedBy: 'B' } }));
      setProcessBState('BLOCKED');
      setMetrics(m => ({ ...m, bWaitTime: m.bWaitTime + 1 })); 
      addLog('WARNING', '[P-B] Waiting for R2 (held by P-A).');
    }

    if (resources.R2.heldBy === 'B' && resources.R1.heldBy === null) {
      setResources(prev => ({ ...prev, R1: { heldBy: 'B', requestedBy: null } }));
      setProcessBState('RUNNING');
      addLog('INFO', '[P-B] Acquired Resource R1. Task Complete!');
      setResources(INITIAL_RESOURCE_STATE);
    } else if (resources.R2.heldBy === 'B' && resources.R1.heldBy === 'A') {
      setResources(prev => ({ ...prev, R1: { ...prev.R1, requestedBy: 'B' } }));
      setProcessBState('BLOCKED');
      setMetrics(m => ({ ...m, bWaitTime: m.bWaitTime + 1 })); 
      if (resources.R2.requestedBy === 'A') {
        setResources(prev => ({ ...prev, deadlock: true }));
      }
    }
  }, [resources, addLog]);
  // --- End Deadlock Simulation Logic ---


  // --- Process A (Producer/Writer) Logic ---
  const runProcessA = useCallback(() => {
    if (ipcType === IPC_TYPES.RESOURCES_DEADLOCK) {
        runDeadlockProcessA();
        return;
    }

    if (ipcType === IPC_TYPES.PIPE || ipcType === IPC_TYPES.QUEUE) {
      if (buffer.length < MAX_BUFFER_SIZE) {
        const chunk = generateChunk(); 
        setBuffer(prev => [...prev, chunk]);
        setMetrics(m => ({ ...m, produced: m.produced + 1 }));
        setProcessAState('RUNNING');
        addLog('INFO', `[P-A] Produced chunk: ${chunk.value} (Prio: ${chunk.priority}). Buffer size: ${buffer.length + 1}/${MAX_BUFFER_SIZE}`);
      } else {
        setProcessAState('BLOCKED');
        setMetrics(m => ({ ...m, aWaitTime: m.aWaitTime + 1 })); 
        addLog('WARNING', '[P-A] Buffer Full. Producer Blocked (Bottleneck)');
      }
    } else if (ipcType === IPC_TYPES.SHARED_MEMORY) {
      if (lockHeldBy === 'B') {
        setProcessAState('WAITING');
        setMetrics(m => ({ ...m, aWaitTime: m.aWaitTime + 1 })); 
      } else if (lockHeldBy === null) {
        setLockHeldBy('A');
        setProcessAState('RUNNING');
        const newValue = sharedMemory.value + 1;
        setSharedMemory({ value: newValue, accessed: sharedMemory.accessed + 1 });
        setMetrics(m => ({ ...m, produced: m.produced + 1 }));
        addLog('INFO', `[P-A] Wrote ${newValue} to Shared Mem. Lock Acquired.`);
        setLockHeldBy(null);
        addLog('INFO', '[P-A] Lock Released.');
      }
    }
  }, [ipcType, buffer, lockHeldBy, sharedMemory.value, sharedMemory.accessed, addLog, runDeadlockProcessA]);

  // --- Process B (Consumer/Reader) Logic ---
  const runProcessB = useCallback(() => {
    if (ipcType === IPC_TYPES.RESOURCES_DEADLOCK) {
        runDeadlockProcessB();
        return;
    }

    if (buffer.length === 0) {
        setProcessBState('BLOCKED');
        setMetrics(m => ({ ...m, bWaitTime: m.bWaitTime + 1 })); 
        addLog('WARNING', '[C-B] Buffer Empty. Consumer Blocked (Starvation)');
        return;
    }

    if (ipcType === IPC_TYPES.PIPE) {
      const chunk = buffer[0];
      setBuffer(prev => prev.slice(1));
      setMetrics(m => ({ ...m, consumed: m.consumed + 1 }));
      setProcessBState('RUNNING');
      addLog('INFO', `[C-B] Consumed chunk: ${chunk.value} (FIFO). Buffer size: ${buffer.length - 1}/${MAX_BUFFER_SIZE}`);
      
    } else if (ipcType === IPC_TYPES.QUEUE) {
      const highestPriorityIndex = buffer.reduce((bestIndex, current, currentIndex) => {
        return current.priority < buffer[bestIndex].priority ? currentIndex : bestIndex;
      }, 0);

      const chunk = buffer[highestPriorityIndex];
      setBuffer(prev => prev.filter((_, index) => index !== highestPriorityIndex));
      
      setMetrics(m => ({ ...m, consumed: m.consumed + 1 }));
      setProcessBState('RUNNING');
      addLog('INFO', `[C-B] Consumed chunk: ${chunk.value} (PRIO ${chunk.priority}). Buffer size: ${buffer.length - 1}/${MAX_BUFFER_SIZE}`);

    } else if (ipcType === IPC_TYPES.SHARED_MEMORY) {
      if (lockHeldBy === 'A') {
        setProcessBState('WAITING');
        setMetrics(m => ({ ...m, bWaitTime: m.bWaitTime + 1 })); 
      } else if (lockHeldBy === null) {
        setLockHeldBy('B');
        setProcessBState('RUNNING');
        const readValue = sharedMemory.value;
        addLog('INFO', `[C-B] Read ${readValue} from Shared Mem. Lock Acquired.`);
        setLockHeldBy(null);
        setMetrics(m => ({ ...m, consumed: m.consumed + 1 }));
        addLog('INFO', '[C-B] Lock Released.');
      }
    }
  }, [ipcType, buffer, lockHeldBy, sharedMemory.value, addLog, runDeadlockProcessB]);

  // --- Analysis and Reporting Module ---
  const detectIssues = useCallback(() => {
    if (ipcType === IPC_TYPES.RESOURCES_DEADLOCK) {
      if (resources.deadlock) {
        addLog('DEADLOCK', '!!! DEADLOCK DETECTED !!! P-A holds R1, waits for R2. P-B holds R2, waits for R1 (Circular Wait).');
        setProcessAState('DEADLOCKED');
        setProcessBState('DEADLOCKED');
        setIsRunning(false); 
      }
      return;
    }

    // 1. Bottleneck/Starvation Detection (for Pipes/Queues)
    if (buffer.length === MAX_BUFFER_SIZE && processAState === 'BLOCKED') {
      addLog('WARNING', 'Bottleneck: Persistent Producer Blocking (Consumer too slow)');
    }
    if (buffer.length === 0 && processBState === 'BLOCKED') {
      addLog('WARNING', 'Starvation: Persistent Consumer Blocking (Producer too slow)');
    }

    // 2. High Contention Warning (for Shared Memory)
    if (ipcType === IPC_TYPES.SHARED_MEMORY && processAState === 'WAITING' && processBState === 'WAITING' && lockHeldBy !== null) {
        addLog('WARNING', 'High Contention: Both processes are constantly waiting for the Mutex.');
    }

    // 3. Race Condition Detection (Simulated Error Trigger - for Shared Memory)
    if (ipcType === IPC_TYPES.SHARED_MEMORY && metrics.cycle % 100 === 0 && metrics.cycle > 0) {
        setSharedMemory(prev => ({ ...prev, value: prev.value * 2, accessed: prev.accessed + 1 }));
        addLog('ERROR', 'RACE CONDITION DETECTED! Data modified without lock protection (Simulated).');
    }

  }, [ipcType, buffer.length, processAState, processBState, lockHeldBy, addLog, metrics.cycle, resources]);

  // --- Main Simulation Loop (Scheduler) ---
  useEffect(() => {
    if (isRunning) {
      intervalRef.current = setInterval(() => {
        cycleRef.current += 1; 
        setMetrics(m => ({ ...m, cycle: m.cycle + 1 }));

        // Calculate performance metrics every 10 cycles for efficiency
        if (cycleRef.current % 10 === 0) {
            calculatePerformanceMetrics();
        }

        if (cycleRef.current % (producerSpeed / 100) === 0) {
          runProcessA();
        } else if (processAState !== 'DEADLOCKED') {
          setProcessAState('IDLE');
        }

        if (cycleRef.current % (consumerSpeed / 100) === 0) {
          runProcessB();
        } else if (processBState !== 'DEADLOCKED') {
          setProcessBState('IDLE');
        }

        detectIssues();

      }, 100); 

    } else {
      clearInterval(intervalRef.current);
    }

    return () => clearInterval(intervalRef.current);
  }, [isRunning, producerSpeed, consumerSpeed, runProcessA, runProcessB, detectIssues, processAState, processBState, calculatePerformanceMetrics]);

  // --- Visualization and UI Components ---
  
  // Visualization of the IPC medium 
  const IPCVisualization = () => {
    const isDeadlockSim = ipcType === IPC_TYPES.RESOURCES_DEADLOCK;
    const isShared = ipcType === IPC_TYPES.SHARED_MEMORY;
    const isPipeOrQueue = ipcType === IPC_TYPES.PIPE || ipcType === IPC_TYPES.QUEUE;
    const isContended = lockHeldBy !== null;

    if (isDeadlockSim) {
      return (
        <div className="flex flex-col items-center p-4 bg-zinc-700 rounded-lg shadow-inner w-full">
          <p className='text-sm text-indigo-300 font-semibold mb-3'>Resource Allocation Graph Simulation</p>
          <div className="flex space-x-4 sm:space-x-8 items-start justify-center w-full">
            <ResourceBox name="R1" resource={resources.R1} />
            <ResourceBox name="R2" resource={resources.R2} />
          </div>
          {resources.deadlock && (
            <div className="mt-4 p-2 bg-red-800/50 border border-red-500 rounded-lg flex items-center space-x-2 w-full justify-center">
                <Skull className='w-5 h-5 text-red-400 animate-pulse' />
                <span className='font-bold text-red-300'>Circular Wait Detected! (Deadlock)</span>
            </div>
          )}
        </div>
      );
    }

    if (isShared) {
      return (
        <div className="flex flex-col items-center p-4 bg-zinc-700 rounded-lg shadow-inner w-full">
          <div className={`w-full p-4 text-center rounded-lg font-mono text-xl transition-all duration-300 ${isContended ? 'bg-red-900 ring-4 ring-red-500' : 'bg-gray-800'}`}>
            <span className="text-gray-400">Memory Segment: </span>
            <span className="font-bold text-white">{sharedMemory.value}</span>
          </div>
          <p className="mt-2 text-sm text-gray-400">Accesses: {sharedMemory.accessed} | Lock Status: {lockHeldBy ? `Held by P-${lockHeldBy}` : 'Free'}</p>
        </div>
      );
    }

    if (isPipeOrQueue) {
      return (
        <div className="flex flex-col items-center w-full">
          <div className="flex flex-row space-x-0.5 w-full h-14 bg-zinc-700 p-1 rounded-lg relative">
            {ipcType === IPC_TYPES.QUEUE && (
                <div className="absolute top-0 right-0 p-1 bg-indigo-700 text-xs rounded-bl-lg text-white font-semibold flex items-center z-10">
                    <Server className='w-3 h-3 mr-1' /> Priority Queue
                </div>
            )}
            {Array.from({ length: MAX_BUFFER_SIZE }).map((_, index) => {
                const item = buffer[index];
                const isConsumedNext = ipcType === IPC_TYPES.QUEUE && item && index === buffer.reduce((bestIndex, current, currentIndex) => {
                    return current.priority < buffer[bestIndex].priority ? currentIndex : bestIndex;
                }, 0);

                return (
                    <div key={index} className="flex-1 h-full flex items-center justify-center relative">
                        <div className={`h-full w-full rounded transition-all duration-500 ${item ? getPriorityColor(item.priority) : 'bg-zinc-800'} ${isConsumedNext ? 'ring-2 ring-yellow-300' : ''}`}>
                            {item && (
                                <div className="absolute inset-0 flex flex-col items-center justify-center">
                                    <span className="text-sm font-bold text-white leading-none">{item.value}</span>
                                    <span className="text-[10px] text-gray-900 font-mono">P{item.priority}</span>
                                </div>
                            )}
                        </div>
                    </div>
                );
            })}
          </div>
          <p className="mt-2 text-sm text-gray-400">{ipcType} Status: {buffer.length}/{MAX_BUFFER_SIZE} filled</p>
        </div>
      );
    }

    return null;
  };

  // Resource Box for Deadlock Visualization
  const ResourceBox = ({ name, resource }) => (
    <div className={`p-3 rounded-lg w-32 sm:w-40 text-center shadow-lg transition-all duration-300 ${resource.heldBy ? 'bg-indigo-700 ring-2 ring-indigo-400' : 'bg-zinc-800'}`}>
      <div className="font-bold text-lg text-white mb-1">{name}</div>
      <div className='text-sm text-gray-300'>
        {resource.heldBy ? (
          <span className='flex items-center justify-center text-sm font-semibold'>
            <Lock className='w-4 h-4 mr-1' /> Held by P-{resource.heldBy}
          </span>
        ) : (
          <span className='flex items-center justify-center text-sm text-green-400'>
            <Unlock className='w-4 h-4 mr-1' /> Free
          </span>
        )}
      </div>
      {resource.requestedBy && (
        <div className='mt-2 text-xs font-mono text-yellow-300 bg-zinc-700/50 p-1 rounded'>
          Req: P-{resource.requestedBy}
        </div>
      )}
    </div>
  );

  // Process Status Component
  const ProcessMonitor = ({ name, state, speed }) => (
    <div className="p-3 bg-zinc-700 rounded-lg flex items-center justify-between shadow-md">
      <div className="flex items-center space-x-3">
        {name.includes('Producer') ? <Send className="w-6 h-6 text-gray-300" /> : <Server className="w-6 h-6 text-gray-300" />}
        <span className="font-semibold text-white">{name} (P-{name.slice(-1)})</span>
      </div>
      <div className="flex flex-col items-end">
        <div className="flex items-center space-x-2">
          <div className={`w-3 h-3 rounded-full ${getStatusColor(state)}`}></div>
          <span className="text-sm font-mono text-gray-200">{state}</span>
        </div>
        {!resources.deadlock && <span className="text-xs text-gray-400 mt-1">Speed: {speed}ms/op</span>}
      </div>
    </div>
  );

  // Component: Flow Diagram Guide (Revision 5)
  const FlowDiagramGuide = ({ ipcType }) => {
    let title = "IPC Mechanism Flow";
    let flowSteps = [];

    switch (ipcType) {
      case IPC_TYPES.PIPE:
        title = "Pipe (FIFO) Flow";
        flowSteps = [
          { icon: Send, text: "Producer sends data to the Pipe.", color: "text-indigo-400" },
          { icon: ArrowRight, text: "Data is placed at the end of the buffer (FIFO).", color: "text-gray-400" },
          { icon: Server, text: "Consumer reads data from the start of the buffer.", color: "text-green-400" },
          { icon: CircleDot, text: "BLOCKS if buffer is full (Producer) or empty (Consumer).", color: "text-yellow-400" },
        ];
        break;
      case IPC_TYPES.QUEUE:
        title = "Message Queue (Priority) Flow";
        flowSteps = [
          { icon: Send, text: "Producer attaches a Priority (1=High, 3=Low) to the message.", color: "text-indigo-400" },
          { icon: Shuffle, text: "Data is placed in the buffer according to its priority.", color: "text-gray-400" },
          { icon: Server, text: "Consumer ignores order; always removes the HIGHEST priority item.", color: "text-green-400" },
          { icon: CircleDot, text: "BLOCKS if buffer is full (Producer) or empty (Consumer).", color: "text-yellow-400" },
        ];
        break;
      case IPC_TYPES.SHARED_MEMORY:
        title = "Shared Memory (Mutex) Flow";
        flowSteps = [
          { icon: Lock, text: "Process must ACQUIRE Mutex before accessing shared memory.", color: "text-red-400" },
          { icon: Dribbble, text: "Process R/W data (critical section).", color: "text-gray-400" },
          { icon: Unlock, text: "Process RELEASE Mutex upon completion.", color: "text-red-400" },
          { icon: CircleDot, text: "BLOCKS if Mutex is held by the other process (Contention).", color: "text-yellow-400" },
        ];
        break;
      case IPC_TYPES.RESOURCES_DEADLOCK:
        title = "Resource Deadlock (Simulated)";
        flowSteps = [
          { icon: Lock, text: "Process A holds R1, tries to acquire R2.", color: "text-red-400" },
          { icon: Lock, text: "Process B holds R2, tries to acquire R1.", color: "text-red-400" },
          { icon: Skull, text: "Circular wait condition detected. Simulation halts.", color: "text-red-500" },
        ];
        break;
      default:
        flowSteps = [{ icon: CircleDot, text: "Select an IPC Mechanism to view its flow.", color: "text-gray-500" }];
        break;
    }

    return (
      <div className="mb-8 p-4 bg-zinc-800 rounded-xl shadow-lg border border-indigo-500/30">
        <h2 className="text-lg font-bold mb-3 text-indigo-400">{title}</h2>
        <div className="flex flex-col space-y-2">
          {flowSteps.map((step, index) => (
            <div key={index} className="flex items-center space-x-3">
              <step.icon className={`w-5 h-5 ${step.color}`} />
              <p className="text-sm text-gray-300">{step.text}</p>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-4 font-sans">
      {/* Increased max-w for better desktop viewing, mx-auto centers the container */}
      <div className="max-w-5xl mx-auto"> 
        <h1 className="text-3xl font-extrabold mb-6 text-indigo-400 border-b border-indigo-500/30 pb-2">
          IPC Debugging & Visualization Tool
        </h1>

        {/* Configuration Panel - Responsive Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8 p-4 bg-zinc-800 rounded-xl shadow-lg">
          {/* Items stack nicely on mobile due to grid-cols-1 */}
          <div>
            <label className="block text-sm font-medium mb-1 text-gray-300">IPC Mechanism</label>
            <select
              value={ipcType}
              onChange={(e) => {
                setIpcType(e.target.value);
                resetSimulation();
              }}
              className="w-full p-2 rounded-lg bg-zinc-700 border border-zinc-600 text-white focus:ring-indigo-500 focus:border-indigo-500"
              disabled={isRunning}
            >
              {Object.values(IPC_TYPES).map(type => <option key={type} value={type}>{type}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1 text-gray-300">Producer A Speed (ms)</label>
            <input
              type="number"
              value={producerSpeed}
              onChange={(e) => setProducerSpeed(Math.max(100, parseInt(e.target.value) || 100))}
              className="w-full p-2 rounded-lg bg-zinc-700 border border-zinc-600 text-white focus:ring-indigo-500 focus:border-indigo-500"
              disabled={isRunning}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1 text-gray-300">Consumer B Speed (ms)</label>
            <input
              type="number"
              value={consumerSpeed}
              onChange={(e) => setConsumerSpeed(Math.max(100, parseInt(e.target.value) || 100))}
              className="w-full p-2 rounded-lg bg-zinc-700 border border-zinc-600 text-white focus:ring-indigo-500 focus:border-indigo-500"
              disabled={isRunning}
            />
          </div>
        </div>
        
        {/* Flow Diagram Guide (Revision 5) */}
        <FlowDiagramGuide ipcType={ipcType} />

        {/* Control and Metrics */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 space-y-4 sm:space-y-0">
          <div className='flex space-x-3'>
            <button
              onClick={() => setIsRunning(prev => !prev)}
              className={`p-3 rounded-lg font-bold flex items-center space-x-2 transition-colors ${
                isRunning ? 'bg-yellow-600 hover:bg-yellow-700' : 'bg-green-600 hover:bg-green-700'
              }`}
            >
              {isRunning ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
              <span>{isRunning ? 'Pause' : 'Start'} Simulation</span>
            </button>
            <button
              onClick={resetSimulation}
              className="p-3 rounded-lg bg-red-600 hover:bg-red-700 font-bold flex items-center space-x-2 transition-colors"
            >
              <RotateCcw className="w-5 h-5" />
              <span>Reset</span>
            </button>
          </div>
          
          <div className="text-right text-sm">
            <p className="text-gray-400">Total Cycles: <span className="font-bold text-white">{metrics.cycle}</span></p>
            <p className="text-gray-400">Data Transferred: <span className="font-bold text-white">{metrics.produced} Produced / {metrics.consumed} Consumed</span></p>
          </div>
        </div>

        {/* Performance Metrics Panel (Revision 4) - Responsive Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8 p-4 bg-zinc-800 rounded-xl shadow-lg border border-indigo-500/30">
            <MetricCard 
                icon={TrendingUp} 
                title="Throughput" 
                value={perfMetrics.throughput} 
                unit="items/s"
                color="text-green-400"
            />
            <MetricCard 
                icon={Clock} 
                title="P-A Avg Wait Time" 
                value={perfMetrics.avgWaitTimeA} 
                unit="ms"
                color="text-yellow-400"
            />
            <MetricCard 
                icon={Clock} 
                title="C-B Avg Wait Time" 
                value={perfMetrics.avgWaitTimeB} 
                unit="ms"
                color="text-yellow-400"
            />
        </div>

        {/* Process Monitors and Visualization - Responsive Stack */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8 items-center">
          <ProcessMonitor name="Producer A" state={processAState} speed={producerSpeed} />
          <div className="flex justify-center items-center w-full"> {/* w-full ensures visualization component uses available space */}
            <IPCVisualization />
          </div>
          <ProcessMonitor name="Consumer B" state={processBState} speed={consumerSpeed} />
        </div>

        {/* Debugging Console / Logs */}
        <div className="mt-8">
          <h2 className="text-xl font-bold mb-3 text-red-400 flex items-center space-x-2">
            <Zap className="w-6 h-6" />
            <span>Debugging Console & Issues ({logs.filter(l => l.type === 'ERROR' || l.type === 'WARNING' || l.type === 'DEADLOCK').length} Alerts)</span>
          </h2>
          <div className="bg-zinc-800 rounded-lg p-3 h-64 overflow-y-auto font-mono text-xs shadow-inner border border-zinc-700">
            {logs.length > 0 ? (
              logs.map((log, index) => (
                <div key={index} className={`mb-1 ${getLogColor(log.type)}`}>
                  <span className="text-gray-500 mr-2">[{log.timestamp}]</span>
                  {log.type === 'WARNING' && <AlertTriangle className="w-3 h-3 inline-block mr-1 text-yellow-400" />}
                  {log.type === 'ERROR' && <HardHat className="w-3 h-3 inline-block mr-1 text-red-400" />}
                  {log.type === 'DEADLOCK' && <Skull className="w-3 h-3 inline-block mr-1 text-red-500" />}
                  {log.message}
                </div>
              ))
            ) : (
              <p className="text-gray-500">Awaiting simulation start. Logs will appear here.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// Metric Card Component
const MetricCard = ({ icon: Icon, title, value, unit, color }) => (
    <div className="p-3 bg-zinc-700 rounded-lg flex items-center space-x-3">
        <Icon className={`w-6 h-6 ${color}`} />
        <div>
            <p className="text-xs font-medium text-gray-400">{title}</p>
            <p className="text-xl font-bold text-white">
                {value}
                <span className="text-sm font-normal text-gray-400 ml-1">{unit}</span>
            </p>
        </div>
    </div>
);

export default App;
