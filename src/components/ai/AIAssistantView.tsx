/**
 * ASTRA Health - Dual-Mode AI Assistant View
 * Completely separates Online AI (Gemini Cloud) and Offline AI (Local ASTRA)
 * with independent message histories, streaming responses, model controls, and telemetry tracking.
 */

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { HealthAIContext, AIMode, AISource, AIResponse, ChatHistoryMessage, ActivityActionPayload } from '../../types/ai';
import { HealthMeasurement, MetricBaseline, HealthAlert, DailyCheckIn } from '../../types/health';
import { MissionContext } from '../../types/mission';
import { ActivityRecord, DailyActivitySummary } from '../../types/activity';
import { NavTab } from '../layout/Navigation';
import { askASTRA } from '../../ai/aiRouter';
import { buildHealthAIContext } from '../../ai/healthAIContext';
import { SUGGESTED_ASTRONAUT_PROMPTS } from '../../ai/prompts';
import { getAstronautProfile, getDisplayName, subscribeToProfile } from '../../services/profileService';
import { localAIManager, ModelInfo } from '../../ai/localAIManager';
import { geminiProvider } from '../../ai/geminiProvider';
import { localAIProvider } from '../../ai/localAIProvider';
import { offlineAIClient } from '../../offline-ai/client';
import { SpaceDataSearchPanel } from './SpaceDataSearchPanel';
import { 
  Bot, 
  Search, 
  Send, 
  Sparkles, 
  Cpu, 
  BookOpen, 
  ShieldAlert, 
  Clock, 
  CheckCircle2, 
  Trash2,
  HelpCircle,
  ExternalLink,
  ArrowRight,
  Dumbbell,
  Droplets,
  Utensils,
  CheckSquare,
  Flame,
  Plus,
  Activity as ActivityIcon,
  ChevronRight,
  RotateCcw,
  Sliders,
  Smile,
  Zap,
  Radio,
  Compass,
  Download,
  Wifi,
  WifiOff,
  AlertCircle,
  ChevronDown,
  ChevronUp
} from 'lucide-react';

interface AIAssistantViewProps {
  missionContext: MissionContext;
  currentHealth: HealthMeasurement;
  baselines: MetricBaseline[];
  activeAlerts: HealthAlert[];
  recentCheckIn?: DailyCheckIn;
  activities?: ActivityRecord[];
  dailyActivitySummary?: DailyActivitySummary;
  aiMode: AIMode;
  activeAiSource: AISource;
  initialPrompt?: string;
  onClearInitialPrompt?: () => void;
  onNavigateTab?: (tab: NavTab) => void;
  onOpenCheckInModal?: () => void;
  onRecordActivity?: (payload: {
    category: ActivityRecord['category'];
    title: string;
    details: string;
    durationMinutes?: number;
    intensity?: ActivityRecord['intensity'];
    metrics?: ActivityRecord['metrics'];
    sol?: number;
    loggedBy?: ActivityRecord['loggedBy'];
  }) => Promise<ActivityRecord>;
  onDeleteActivity?: (id: string) => Promise<void>;
}

export interface ChatMessage {
  id: string;
  sender: 'ASTRONAUT' | 'ASTRA';
  text: string;
  timestamp: string;
  response?: AIResponse;
  loggedActivity?: ActivityRecord | ActivityActionPayload;
  dataUsed?: string[];
  isError?: boolean;
}

export const AIAssistantView: React.FC<AIAssistantViewProps> = ({
  missionContext,
  currentHealth,
  baselines,
  activeAlerts,
  recentCheckIn,
  activities = [],
  dailyActivitySummary,
  aiMode,
  activeAiSource,
  initialPrompt,
  onClearInitialPrompt,
  onNavigateTab,
  onOpenCheckInModal,
  onRecordActivity,
  onDeleteActivity,
}) => {
  const [profile, setProfile] = useState(() => getAstronautProfile());
  const astronautName = getDisplayName(profile);
  const callSignStr = profile.identity.callSign ? ` (Call sign: ${profile.identity.callSign})` : '';

  // AI Tab State: Default to OFFLINE if user set OFFLINE mode, else ONLINE
  const [activeTab, setActiveTab] = useState<'ONLINE' | 'OFFLINE'>(
    aiMode === 'OFFLINE' ? 'OFFLINE' : 'ONLINE'
  );

  const [localModelInfo, setLocalModelInfo] = useState<ModelInfo>(() => localAIManager.getModelInfo());
  const [offlineState, setOfflineState] = useState(() => offlineAIClient.getState());
  const [diagBypass, setDiagBypass] = useState(() => localAIProvider.isDiagnosticBypassEnabled());
  const [uiOnlyMode, setUiOnlyMode] = useState(false);
  const [layer1Expanded, setLayer1Expanded] = useState(true);
  const [layer2Expanded, setLayer2Expanded] = useState(false);
  const [layer3Expanded, setLayer3Expanded] = useState(false);
  const [showAllLogEntries, setShowAllLogEntries] = useState(false);

  const handleToggleDiagBypass = () => {
    const next = !diagBypass;
    localAIProvider.setDiagnosticBypass(next);
    setDiagBypass(next);
  };

  useEffect(() => {
    const unsubProfile = subscribeToProfile(p => setProfile(p));
    const unsubModel = localAIManager.subscribe(info => setLocalModelInfo(info));
    const unsubOffline = offlineAIClient.subscribe(s => setOfflineState(s));

    // Check if neural model weights are already cached in browser storage on mount
    offlineAIClient.checkCache().catch(() => {});

    return () => {
      unsubProfile();
      unsubModel();
      unsubOffline();
    };
  }, []);

  // Separate Conversation Message Histories
  const [onlineMessages, setOnlineMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome-online',
      sender: 'ASTRA',
      text: `Greetings ${astronautName}. Online Gemini Intelligence ready on Sol ${missionContext.sol}. How can I assist your mission?`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);

  const [offlineMessages, setOfflineMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome-offline',
      sender: 'ASTRA',
      text: `Greetings ${astronautName}. Autonomous Local ASTRA Core ready on Sol ${missionContext.sol}. Onboard telemetry monitoring nominal.`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);

  const [isOnlineProcessing, setIsOnlineProcessing] = useState(false);
  const [isOfflineProcessing, setIsOfflineProcessing] = useState(false);

  const [inputQuestion, setInputQuestion] = useState('');
  const [showActivityTracker, setShowActivityTracker] = useState(true);
  const [showSpaceSearch, setShowSpaceSearch] = useState(true);
  const [quickLogSuccess, setQuickLogSuccess] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Active messages & processing flag for current tab
  const currentMessages = activeTab === 'ONLINE' ? onlineMessages : offlineMessages;
  const isCurrentProcessing = activeTab === 'ONLINE' ? isOnlineProcessing : isOfflineProcessing;

  // Multi-turn histories for context
  const onlineHistory: ChatHistoryMessage[] = useMemo(() => {
    return onlineMessages
      .filter(m => m.id !== 'welcome-online')
      .slice(-10)
      .map(m => ({
        role: m.sender === 'ASTRONAUT' ? ('user' as const) : ('model' as const),
        text: m.text,
      }));
  }, [onlineMessages]);

  const offlineHistory: ChatHistoryMessage[] = useMemo(() => {
    return offlineMessages
      .filter(m => m.id !== 'welcome-offline')
      .slice(-10)
      .map(m => ({
        role: m.sender === 'ASTRONAUT' ? ('user' as const) : ('model' as const),
        text: m.text,
      }));
  }, [offlineMessages]);

  // Handle initial prompt passed from other tabs or buttons
  useEffect(() => {
    if (initialPrompt) {
      handleSend(initialPrompt);
      if (onClearInitialPrompt) onClearInitialPrompt();
    }
  }, [initialPrompt]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [onlineMessages, offlineMessages, activeTab, isOnlineProcessing, isOfflineProcessing]);

  // Quick Activity Logging helper
  const handleQuickLog = async (category: ActivityRecord['category'], title: string, details: string, extra?: any) => {
    if (!onRecordActivity) return;
    try {
      const rec = await onRecordActivity({
        category,
        title,
        details,
        durationMinutes: extra?.durationMinutes,
        intensity: extra?.intensity,
        metrics: extra?.metrics,
        sol: missionContext.sol,
        loggedBy: 'ASTRONAUT',
      });

      setQuickLogSuccess(`Logged: ${title}`);
      setTimeout(() => setQuickLogSuccess(null), 3000);

      const astraFeedback: ChatMessage = {
        id: `msg-${Date.now()}-quicklog`,
        sender: 'ASTRA',
        text: `Logged **${title}** (${details}) to your Sol ${missionContext.sol} operational record. Your daily progress indicators have been refreshed!`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        loggedActivity: rec,
      };

      if (activeTab === 'ONLINE') {
        setOnlineMessages(prev => [...prev, astraFeedback]);
      } else {
        setOfflineMessages(prev => [...prev, astraFeedback]);
      }
    } catch (err: any) {
      console.error('Failed to quick log activity:', err);
    }
  };

  // ONLINE AI Request Handler
  const handleSendOnline = async (question: string) => {
    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}-user`,
      sender: 'ASTRONAUT',
      text: question,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    const streamingMsgId = `msg-${Date.now()}-online-stream`;
    const initialAstraMsg: ChatMessage = {
      id: streamingMsgId,
      sender: 'ASTRA',
      text: '',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setOnlineMessages(prev => [...prev, userMsg, initialAstraMsg]);
    setIsOnlineProcessing(true);

    try {
      const context = buildHealthAIContext({
        mission: missionContext,
        currentHealth,
        baselines,
        activeAlerts,
        recentCheckIn,
        mode: 'ONLINE',
        userQuestion: question,
        history: onlineHistory,
        recentActivities: activities.slice(0, 10),
        dailyActivitySummary,
        astronautProfile: profile.identity,
      });

      const response = await askASTRA({
        question,
        healthContext: context,
        history: onlineHistory,
        mode: 'ONLINE',
      });

      let loggedRecord: ActivityRecord | undefined = undefined;
      if (response.activityAction && onRecordActivity) {
        try {
          loggedRecord = await onRecordActivity({
            category: response.activityAction.category,
            title: response.activityAction.title,
            details: response.activityAction.details,
            durationMinutes: response.activityAction.durationMinutes,
            intensity: response.activityAction.intensity,
            metrics: response.activityAction.metrics,
            sol: missionContext.sol,
            loggedBy: 'ASTRA_AI',
          });
        } catch (actErr) {
          console.warn('Could not auto-save activityAction from Online AI:', actErr);
        }
      }

      setOnlineMessages(prev => prev.map(m => {
        if (m.id === streamingMsgId) {
          return {
            id: streamingMsgId,
            sender: 'ASTRA',
            text: response.answer,
            timestamp: m.timestamp,
            response,
            loggedActivity: loggedRecord || response.activityAction,
          };
        }
        return m;
      }));
    } catch (err: any) {
      setOnlineMessages(prev => prev.map(m => {
        if (m.id === streamingMsgId) {
          return {
            id: streamingMsgId,
            sender: 'ASTRA',
            text: `Online Gemini Error: ${err.message || 'Earth Uplink failed'}. Switch to Offline Local ASTRA tab for 100% autonomous on-device response.`,
            timestamp: m.timestamp,
            isError: true,
          };
        }
        return m;
      }));
    } finally {
      setIsOnlineProcessing(false);
    }
  };

  // OFFLINE AI Request Handler
  const handleSendOffline = async (question: string) => {
    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}-user`,
      sender: 'ASTRONAUT',
      text: question,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    const streamingMsgId = `msg-${Date.now()}-offline-stream`;
    const initialAstraMsg: ChatMessage = {
      id: streamingMsgId,
      sender: 'ASTRA',
      text: '',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setOfflineMessages(prev => [...prev, userMsg, initialAstraMsg]);
    setIsOfflineProcessing(true);

    let accumText = '';
    let animFrameId: number | null = null;
    let lastUiUpdate = 0;

    try {
      const context = buildHealthAIContext({
        mission: missionContext,
        currentHealth,
        baselines,
        activeAlerts,
        recentCheckIn,
        mode: 'OFFLINE',
        userQuestion: question,
        history: offlineHistory,
        recentActivities: activities.slice(0, 10),
        dailyActivitySummary,
        astronautProfile: profile.identity,
      });

      const response = await askASTRA({
        question,
        healthContext: context,
        history: offlineHistory,
        mode: 'OFFLINE',
        onToken: (chunk) => {
          accumText += chunk;
          const now = performance.now();
          // Throttle React state updates to at most once every 60ms (~16 FPS) to prevent main-thread freezing
          if (now - lastUiUpdate > 60) {
            lastUiUpdate = now;
            if (animFrameId) cancelAnimationFrame(animFrameId);
            animFrameId = requestAnimationFrame(() => {
              const currentText = accumText;
              setOfflineMessages(prev => prev.map(m => {
                if (m.id === streamingMsgId) {
                  return { ...m, text: currentText };
                }
                return m;
              }));
            });
          }
        },
      });

      if (animFrameId) cancelAnimationFrame(animFrameId);

      let loggedRecord: ActivityRecord | undefined = undefined;
      if (response.activityAction && onRecordActivity) {
        try {
          loggedRecord = await onRecordActivity({
            category: response.activityAction.category,
            title: response.activityAction.title,
            details: response.activityAction.details,
            durationMinutes: response.activityAction.durationMinutes,
            intensity: response.activityAction.intensity,
            metrics: response.activityAction.metrics,
            sol: missionContext.sol,
            loggedBy: 'ASTRA_AI',
          });
        } catch (actErr) {
          console.warn('Could not auto-save activityAction from Offline AI:', actErr);
        }
      }

      setOfflineMessages(prev => prev.map(m => {
        if (m.id === streamingMsgId) {
          return {
            id: streamingMsgId,
            sender: 'ASTRA',
            text: response.answer || accumText,
            timestamp: m.timestamp,
            response,
            loggedActivity: loggedRecord || response.activityAction,
          };
        }
        return m;
      }));
    } catch (err: any) {
      if (animFrameId) cancelAnimationFrame(animFrameId);
      setOfflineMessages(prev => prev.map(m => {
        if (m.id === streamingMsgId) {
          return {
            id: streamingMsgId,
            sender: 'ASTRA',
            text: `Offline Inference Error: ${err.message || 'Local AI processing issue'}. Operating on baseline telemetry rules.`,
            timestamp: m.timestamp,
            isError: true,
          };
        }
        return m;
      }));
    } finally {
      setIsOfflineProcessing(false);
    }
  };

  const handleSend = (questionToSend?: string) => {
    const rawQ = questionToSend || inputQuestion;
    if (typeof rawQ !== 'string' || !rawQ.trim()) return;
    const q = rawQ.trim();

    // STEP 2: Fully isolated UI-only diagnostic mode test branch
    if (activeTab === 'OFFLINE' && uiOnlyMode) {
      console.info('[ASTRA Diagnostic] UI-ONLY DIAGNOSTIC MODE: Executing pure local state update. All AI providers, routers, workers, timers, and streaming bypassed.');
      
      const userMsg: ChatMessage = {
        id: `msg-${Date.now()}-user`,
        sender: 'ASTRONAUT',
        text: q,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      const diagResponseMsg: ChatMessage = {
        id: `msg-${Date.now()}-ui-diag`,
        sender: 'ASTRA',
        text: `UI-ONLY DIAGNOSTIC — NO AI INFERENCE\n\nDirect plain-text diagnostic response received successfully.\n• Input validated: string (${q.length} characters)\n• AI Provider bypassed: YES\n• AI Router bypassed: YES\n• Neural Worker bypassed: YES\n• Token streaming / timers bypassed: YES\n• Heuristic engine bypassed: YES\n• Browser preview status: ACTIVE AND HEALTHY`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setInputQuestion('');
      setOfflineMessages(prev => [...prev, userMsg, diagResponseMsg]);
      return;
    }

    if (activeTab === 'ONLINE') {
      if (isOnlineProcessing) return;
      setInputQuestion('');
      handleSendOnline(q);
    } else {
      if (isOfflineProcessing) return;
      setInputQuestion('');
      handleSendOffline(q);
    }
  };

  const handleClearHistory = () => {
    if (activeTab === 'ONLINE') {
      setOnlineMessages([
        {
          id: `welcome-online-${Date.now()}`,
          sender: 'ASTRA',
          text: `Online Gemini memory reset. Ready on Sol ${missionContext.sol}.`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } else {
      setOfflineMessages([
        {
          id: `welcome-offline-${Date.now()}`,
          sender: 'ASTRA',
          text: `Local ASTRA Core memory reset. Ready on Sol ${missionContext.sol}.`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    }
  };

  const extractActionButtons = (fullText: string) => {
    const list: { label: string; tab: NavTab; action?: string }[] = [];
    if (fullText.includes('[VIEW SLEEP TREND]')) {
      list.push({ label: 'VIEW SLEEP TREND', tab: 'trends' });
    }
    if (fullText.includes("[OPEN TODAY'S CHECK-IN]")) {
      list.push({ label: "OPEN TODAY'S CHECK-IN", tab: 'check-in', action: 'check-in' });
    }
    if (fullText.includes('[VIEW PHYSICAL HEALTH]') || fullText.includes('[VIEW BIO SIGNAL]')) {
      list.push({ label: 'VIEW BIO SIGNAL', tab: 'physical' });
    }
    if (fullText.includes('[VIEW MENTAL HEALTH]') || fullText.includes('[VIEW NEURAL SIGNAL]')) {
      list.push({ label: 'VIEW NEURAL SIGNAL', tab: 'mental' });
    }
    if (fullText.includes('[VIEW HEALTH DASHBOARD]')) {
      list.push({ label: 'VIEW HEALTH DASHBOARD', tab: 'overview' });
    }
    if (fullText.includes('[WHAT CHANGED]')) {
      list.push({ label: 'WHAT CHANGED', tab: 'what-changed' });
    }
    if (fullText.includes('[VIEW ALERT]')) {
      list.push({ label: 'VIEW ALERTS', tab: 'alerts' });
    }
    if (fullText.includes('[VIEW 7-DAY TRENDS]')) {
      list.push({ label: 'VIEW 7-DAY TRENDS', tab: 'trends' });
    }
    return list;
  };

  const cleanActionTags = (str: string) => {
    if (!str) return '';
    return str
      .replace(/\[(VIEW [^\]]+|OPEN [^\]]+|WHAT CHANGED|LOG ACTIVITY)\]/g, '')
      .replace(/\[ACTIVITY_LOG:\s*\{[\s\S]*?\}\]/g, '')
      .trim();
  };

  return (
    <div 
      id="astra-ai-view"
      className="flex flex-col lg:flex-row gap-4 min-h-[550px] lg:h-[calc(100vh-140px)]"
    >
      {/* Main Conversational AI Chat Area */}
      <div className="flex-1 min-w-0 min-h-0 flex flex-col rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl backdrop-blur-sm overflow-hidden">
        
        {/* Top Header Bar & Mode Switcher */}
        <div className="flex flex-wrap items-center justify-between px-4 sm:px-5 py-3 border-b border-slate-800 bg-slate-950/90 gap-2">
          
          {/* Dual AI Section Tabs */}
          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-900 border border-slate-800">
            <button
              id="tab-online-ai"
              onClick={() => setActiveTab('ONLINE')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-mono font-bold transition cursor-pointer ${
                activeTab === 'ONLINE'
                  ? 'bg-cyan-950 text-cyan-300 border border-cyan-500/50 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Radio className={`w-3.5 h-3.5 ${isOnlineProcessing ? 'animate-spin text-cyan-400' : 'text-cyan-400'}`} />
              <span>ONLINE AI — GEMINI</span>
              {onlineMessages.length > 1 && (
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-cyan-900/60 text-cyan-300">
                  {onlineMessages.length - 1}
                </span>
              )}
            </button>

            <button
              id="tab-offline-ai"
              onClick={() => setActiveTab('OFFLINE')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-mono font-bold transition cursor-pointer ${
                activeTab === 'OFFLINE'
                  ? 'bg-purple-950 text-purple-300 border border-purple-500/50 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Cpu className={`w-3.5 h-3.5 ${isOfflineProcessing ? 'animate-spin text-purple-400' : 'text-purple-400'}`} />
              <span>OFFLINE AI — LOCAL ASTRA</span>
              {offlineMessages.length > 1 && (
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-purple-900/60 text-purple-300">
                  {offlineMessages.length - 1}
                </span>
              )}
            </button>
          </div>

          {/* Controls Right */}
          <div className="flex items-center gap-2">
            {/* Quick Link to Isolated Offline AI Lab */}
            {activeTab === 'OFFLINE' && onNavigateTab && (
              <motion.button
                id="btn-open-offline-lab"
                onClick={() => onNavigateTab('offline-test')}
                className="p-2 rounded-lg border text-xs font-mono transition flex items-center gap-1.5 cursor-pointer bg-purple-950/80 border-purple-500/60 text-purple-300 hover:bg-purple-900 shadow-sm"
                title="Open Offline AI Lab"
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
              >
                <Cpu className="w-3.5 h-3.5 text-purple-400" />
                <span className="hidden sm:inline font-bold">Offline Lab</span>
              </motion.button>
            )}

            {/* Toggle Space Data Search Panel */}
            <motion.button
              type="button"
              onClick={() => setShowSpaceSearch(prev => !prev)}
              className={`p-2 rounded-lg border text-xs font-mono transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 ${
                showSpaceSearch
                  ? 'bg-cyan-950/70 border-cyan-500/50 text-cyan-300'
                  : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-slate-200'
              }`}
              title="Toggle NASA Space Data Search"
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
            >
              <Search className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Space Search</span>
            </motion.button>

            {/* Toggle Activity Sidebar */}
            <motion.button
              onClick={() => setShowActivityTracker(prev => !prev)}
              className={`p-2 rounded-lg border text-xs font-mono transition flex items-center gap-1.5 cursor-pointer ${
                showActivityTracker 
                  ? 'bg-cyan-950/70 border-cyan-500/50 text-cyan-300' 
                  : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-slate-200'
              }`}
              title="Toggle Activity Tracker Panel"
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
            >
              <ActivityIcon className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Activity Bar</span>
            </motion.button>

            {/* Clear Conversation for Current Section */}
            <motion.button
              onClick={handleClearHistory}
              className="p-2 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition cursor-pointer"
              title={`Clear ${activeTab} Conversation History`}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
            >
              <Trash2 className="w-4 h-4" />
            </motion.button>
          </div>
        </div>

        {/* ASTRA SPACE CONTEXT STRIP */}
        <div className="px-4 py-2 bg-gradient-to-r from-slate-950 via-cyan-950/40 to-slate-950 border-b border-cyan-500/20 text-xs font-mono">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-slate-300 text-[11px]">
            <span className="font-bold text-cyan-400 uppercase tracking-wider flex items-center gap-1">
              <Compass className="w-3.5 h-3.5 text-cyan-400" />
              ASTRA CONTEXT
            </span>
            <span className="text-slate-600 hidden sm:inline">•</span>
            <span>Sol {missionContext.sol || 184}</span>
            <span className="text-slate-600 hidden sm:inline">•</span>
            <span>{profile.mission.phase || 'Transit'} Phase</span>
            <span className="text-slate-600 hidden sm:inline">•</span>
            <span>{profile.mission.gravityEnvironment || 'Microgravity'}</span>
            <span className="text-slate-600 hidden sm:inline">•</span>
            <span className={activeTab === 'ONLINE' ? 'text-cyan-400 font-semibold' : 'text-purple-400 font-semibold'}>
              {activeTab === 'ONLINE' ? 'Earth Gemini Uplink' : 'Local Onboard Engine'}
            </span>
          </div>
        </div>

        {/* On-Device Neural Model HUD (Rendered in OFFLINE tab) */}
        {activeTab === 'OFFLINE' && (
          <AnimatePresence>
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="px-4 py-2.5 bg-slate-900/90 border-b border-slate-800 text-xs font-mono"
            >
              {/* Clean Offline Model HUD */}
              {offlineState.status === 'READY' ? (
                <div className="flex items-center justify-between bg-slate-950/60 px-3 py-1.5 rounded-lg border border-purple-500/40 text-[11px] text-purple-300">
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-purple-400" />
                    <span>LOCAL ASTRA • NEURAL ENGINE ({offlineState.activeModelId} • {offlineState.activeBackend.toUpperCase()})</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => offlineAIClient.unloadModel()}
                      className="text-[10px] font-mono text-slate-400 hover:text-slate-200 underline transition cursor-pointer"
                      title="Unload model memory session"
                    >
                      Unload Memory
                    </button>
                    <button
                      onClick={() => offlineAIClient.purgeCache()}
                      className="text-[10px] font-mono text-rose-400 hover:text-rose-300 underline transition cursor-pointer"
                      title="Purge model cache from disk"
                    >
                      Purge Cache
                    </button>
                    {onNavigateTab && (
                      <button
                        onClick={() => onNavigateTab('offline-test')}
                        className="text-[10px] font-mono text-purple-300 hover:text-purple-100 underline transition cursor-pointer"
                      >
                        Lab
                      </button>
                    )}
                  </div>
                </div>
              ) : offlineState.status === 'DOWNLOADING' && offlineState.downloadProgress ? (
                <div className="bg-slate-950/80 p-2.5 rounded-xl border border-cyan-500/40 space-y-1.5">
                  <div className="flex items-center justify-between text-slate-200">
                    <span className="font-bold flex items-center gap-1.5 text-cyan-300">
                      <RotateCcw className="w-3.5 h-3.5 animate-spin text-cyan-400" />
                      Downloading On-Device Neural Weights ({offlineState.activeModelId})...
                    </span>
                    <span className="font-bold text-cyan-400">{offlineState.downloadProgress.percent}%</span>
                  </div>
                  <div className="w-full bg-slate-900 h-2 rounded-full overflow-hidden border border-slate-800">
                    <div 
                      className="bg-gradient-to-r from-cyan-500 to-purple-500 h-full rounded-full transition-all duration-150"
                      style={{ width: `${offlineState.downloadProgress.percent}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-slate-400">
                    <span className="truncate max-w-[280px] sm:max-w-md">{offlineState.downloadProgress.file || 'Fetching ONNX layers...'}</span>
                    <span>
                      {((offlineState.downloadProgress.loadedBytes || 0) / (1024 * 1024)).toFixed(1)} / {((offlineState.downloadProgress.totalBytes || 0) / (1024 * 1024)).toFixed(1)} MB
                    </span>
                  </div>
                </div>
              ) : offlineState.status === 'INITIALIZING' ? (
                <div className="bg-slate-950/80 p-2.5 rounded-xl border border-purple-500/50 flex items-center justify-between text-xs font-mono text-purple-200">
                  <div className="flex items-center gap-2">
                    <RotateCcw className="w-4 h-4 animate-spin text-purple-400" />
                    <span>Allocating neural session on {offlineState.activeBackend.toUpperCase()} backend...</span>
                  </div>
                  <span className="text-[10px] text-purple-400 font-bold animate-pulse">INITIALIZING</span>
                </div>
              ) : offlineState.status === 'DOWNLOADED' ? (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-slate-950/70 p-2.5 rounded-xl border border-cyan-500/40">
                  <div className="flex items-start gap-2 flex-1 min-w-0">
                    <CheckCircle2 className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-slate-200">
                        Model Assets Cached (~175 MB)
                      </div>
                      <div className="text-[11px] text-slate-400">
                        Weights verified in storage. Initialize to activate on-device neural session.
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => { offlineAIClient.initializeModel().catch(err => console.error('[AIAssistantView] Init error:', err)); }}
                      className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-bold transition cursor-pointer text-xs shadow-md ring-2 ring-purple-400/40 animate-pulse"
                    >
                      <Cpu className="w-3.5 h-3.5" />
                      <span>Initialize Model</span>
                    </button>
                    {onNavigateTab && (
                      <button
                        onClick={() => onNavigateTab('offline-test')}
                        className="px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 font-mono text-xs transition cursor-pointer"
                      >
                        Lab
                      </button>
                    )}
                  </div>
                </div>
              ) : offlineState.status === 'ERROR' ? (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between bg-rose-950/70 p-2.5 rounded-xl border border-rose-500/50 text-xs text-rose-200 gap-2">
                  <div className="flex items-start gap-2 max-w-xl flex-1 min-w-0">
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-rose-300 font-mono">
                        Model Session Error
                      </div>
                      <p className="text-[11px] text-rose-200/90 mt-0.5 font-sans break-words">
                        {offlineState.errorMessage || 'Initialization failed. Operating on baseline deterministic rules.'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => { offlineAIClient.retry().catch(err => console.error('[AIAssistantView] Retry error:', err)); }}
                      className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-mono text-xs font-bold transition cursor-pointer shadow-sm flex items-center gap-1.5"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Retry</span>
                    </button>
                    {onNavigateTab && (
                      <button
                        onClick={() => onNavigateTab('offline-test')}
                        className="px-2 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 font-mono text-xs transition cursor-pointer"
                      >
                        Lab
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-slate-950/70 p-2.5 rounded-xl border border-purple-500/30">
                  <div className="flex items-start gap-2 flex-1 min-w-0">
                    <Cpu className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-slate-200">
                        On-Device Neural Model (SmolLM2 135M)
                      </div>
                      <div className="text-[11px] text-slate-400">
                        Heuristic baseline active. Download neural model weights (~175 MB) for local reasoning.
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => { offlineAIClient.downloadModel().catch(err => console.error('[AIAssistantView] Download error:', err)); }}
                      className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-bold transition cursor-pointer text-xs shadow-md"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download (~175 MB)</span>
                    </button>
                    {onNavigateTab && (
                      <button
                        onClick={() => onNavigateTab('offline-test')}
                        className="px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 font-mono text-xs transition cursor-pointer"
                      >
                        Lab
                      </button>
                    )}
                  </div>
                </div>
              )}

              {localModelInfo.status === 'ERROR' && (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between bg-rose-950/60 p-3 rounded-xl border border-rose-500/50 text-xs text-rose-200 gap-3">
                  <div className="flex items-start gap-2 max-w-xl">
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-bold text-rose-300 font-mono">
                        On-Device Model Runtime Error
                      </div>
                      <p className="text-[11px] text-rose-200/90 mt-0.5 leading-relaxed font-sans break-words">
                        {localModelInfo.errorMessage || 'Local model initialization failed on device backends.'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => localAIManager.downloadModel()}
                      className="px-3 py-1.5 rounded-lg bg-rose-700 hover:bg-rose-600 text-white font-mono text-xs font-bold transition cursor-pointer shadow-sm flex items-center gap-1.5"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Retry</span>
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        )}

        {/* Quick Activity Bar */}
        <div className="px-4 py-2 bg-slate-950/50 border-b border-slate-800/80 flex items-center justify-between gap-2 overflow-x-auto scrollbar-none">
          <div className="flex items-center gap-2 min-w-max text-xs">
            <span className="text-[11px] font-mono text-slate-400 uppercase font-semibold flex items-center gap-1">
              <Zap className="w-3.5 h-3.5 text-amber-400" /> Quick Log:
            </span>
            <motion.button
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
              onClick={() => handleQuickLog('HYDRATION', 'Electrolyte Hydration Pack', '500 ml electrolyte hydration packet', { metrics: { volumeMl: 500 } })}
              className="px-2.5 py-1 rounded-lg bg-cyan-950/70 hover:bg-cyan-900/90 border border-cyan-800/70 text-cyan-300 font-mono text-xs transition flex items-center gap-1 cursor-pointer"
            >
              <Droplets className="w-3 h-3 text-cyan-400" /> +500ml Water
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
              onClick={() => handleQuickLog('EXERCISE', 'CEVIS Cycle Ergometer', '45 min cardiovascular countermeasure at 180W', { durationMinutes: 45, intensity: 'MODERATE', metrics: { durationMinutes: 45, watts: 180, calories: 380 } })}
              className="px-2.5 py-1 rounded-lg bg-emerald-950/70 hover:bg-emerald-900/90 border border-emerald-800/70 text-emerald-300 font-mono text-xs transition flex items-center gap-1 cursor-pointer"
            >
              <ActivityIcon className="w-3 h-3 text-emerald-400" /> +45m CEVIS (180W)
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
              onClick={() => handleQuickLog('EXERCISE', 'ARED Resistive Loading', '60 min full-body bone/muscle density loading (1,350 kg)', { durationMinutes: 60, intensity: 'HIGH', metrics: { durationMinutes: 60, loadKg: 1350, calories: 510 } })}
              className="px-2.5 py-1 rounded-lg bg-purple-950/70 hover:bg-purple-900/90 border border-purple-800/70 text-purple-300 font-mono text-xs transition flex items-center gap-1 cursor-pointer"
            >
              <Dumbbell className="w-3 h-3 text-purple-400" /> +60m ARED (1,350kg)
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
              onClick={() => handleQuickLog('NUTRITION', 'Mid-Sol Caloric Ration Pack', 'Standard 750 kcal spaceflight nutrient pack + 250ml fluid', { metrics: { calories: 750, volumeMl: 250 } })}
              className="px-2.5 py-1 rounded-lg bg-amber-950/70 hover:bg-amber-900/90 border border-amber-800/70 text-amber-300 font-mono text-xs transition flex items-center gap-1 cursor-pointer"
            >
              <Utensils className="w-3 h-3 text-amber-400" /> +750 kcal Ration
            </motion.button>
          </div>
          <AnimatePresence>
            {quickLogSuccess && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.85, y: -4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.85, y: -4 }}
                transition={{ duration: 0.2 }}
                className="text-[11px] font-mono text-emerald-400 flex items-center gap-1 shrink-0 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-500/40 shadow-sm"
              >
                <CheckCircle2 className="w-3 h-3" /> {quickLogSuccess}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Collapsible NASA Space Data Search Bar & Rich Results Area */}
        <SpaceDataSearchPanel
          isExpanded={showSpaceSearch}
          onToggleExpand={() => setShowSpaceSearch(prev => !prev)}
        />

        {/* Chat Messages Body with Framer Motion */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5 space-y-4">
          <AnimatePresence initial={false}>
            {currentMessages.map((msg) => {
              const isUser = msg.sender === 'ASTRONAUT';
              const actionButtons = extractActionButtons((msg.response?.answer || msg.text || '') + ' ' + (msg.response?.structuredBreakdown?.suggestedNextStep || ''));

              // Dynamic Engine Badge
              let engineBadgeLabel = 'ONLINE • GEMINI';
              let engineBadgeStyle = 'bg-cyan-950/70 border-cyan-500/40 text-cyan-300';

              if (activeTab === 'OFFLINE') {
                if (msg.text?.includes('UI-ONLY DIAGNOSTIC')) {
                  engineBadgeLabel = 'DIAGNOSTIC • UI ONLY (NO AI)';
                  engineBadgeStyle = 'bg-emerald-950/80 border-emerald-500/50 text-emerald-300 font-bold';
                } else if (msg.response?.isNeuralModel === true) {
                  engineBadgeLabel = 'LOCAL ASTRA • NEURAL MODEL';
                  engineBadgeStyle = 'bg-purple-950/70 border-purple-500/40 text-purple-300';
                } else if (msg.response?.isFallback === true || (msg.response && !msg.response.isNeuralModel)) {
                  engineBadgeLabel = 'LOCAL ASTRA • HEURISTIC ENGINE';
                  engineBadgeStyle = 'bg-amber-950/70 border-amber-500/40 text-amber-300';
                } else if (localModelInfo.status === 'READY' && !msg.response) {
                  engineBadgeLabel = 'LOCAL ASTRA • NEURAL MODEL';
                  engineBadgeStyle = 'bg-purple-950/70 border-purple-500/40 text-purple-300';
                } else {
                  engineBadgeLabel = 'LOCAL ASTRA • HEURISTIC ENGINE';
                  engineBadgeStyle = 'bg-amber-950/70 border-amber-500/40 text-amber-300';
                }
              }

              return (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 14, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ 
                    duration: 0.25, 
                    ease: [0.16, 1, 0.3, 1] 
                  }}
                  className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`chat-message-box max-w-3xl w-full sm:w-auto rounded-2xl p-4 shadow-md transition-shadow ${
                      isUser
                        ? 'bg-cyan-600 text-white rounded-tr-none shadow-cyan-900/20'
                        : 'bg-slate-950/95 border border-slate-800 text-slate-100 rounded-tl-none shadow-slate-950/50'
                    }`}
                    style={{
                      transform: 'none',
                      perspective: 'none',
                    }}
                  >
                    {/* Message Header */}
                    <div className="flex items-center justify-between gap-4 mb-2 pb-1 border-b border-white/10 text-[11px] font-mono opacity-80">
                      <span className="font-bold tracking-wider flex items-center gap-1.5 flex-wrap">
                        {isUser ? (
                          <>ASTRONAUT • {astronautName.toUpperCase()}</>
                        ) : (
                          <>
                            <Bot className="w-3.5 h-3.5 text-cyan-400" />
                            <span>ASTRA HEALTH INTELLIGENCE</span>
                            <span className={`text-[9px] px-1.5 py-0.5 rounded border font-mono ${engineBadgeStyle}`}>
                              {engineBadgeLabel}
                            </span>
                          </>
                        )}
                      </span>
                      <span>{msg.timestamp}</span>
                    </div>

                    {/* Activity Auto-Log Notification Card */}
                    {msg.loggedActivity && (
                      <motion.div 
                        initial={{ opacity: 0, scale: 0.95, y: -4 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        className="mb-3 p-3 rounded-xl bg-emerald-950/50 border border-emerald-500/40 text-emerald-200 text-xs font-mono shadow-inner"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-bold flex items-center gap-1.5 text-emerald-300">
                            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                            ACTIVITY LOGGED TO MISSION TELEMETRY
                          </span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-900/60 text-emerald-300">
                            Sol {missionContext.sol}
                          </span>
                        </div>
                        <div className="text-slate-200 mt-1">
                          <strong>{msg.loggedActivity.title}</strong>: {msg.loggedActivity.details}
                        </div>
                      </motion.div>
                    )}

                    {/* Primary Answer & Streaming Content Rendering */}
                    {!isUser ? (
                      <div className="space-y-3 font-sans text-xs sm:text-sm">
                        {/* Always display the complete answer text (or streaming chunks) */}
                        {msg.response?.answer ? (
                          <div className="text-slate-100 leading-relaxed whitespace-pre-wrap font-sans">
                            {cleanActionTags(msg.response.answer)}
                          </div>
                        ) : msg.text ? (
                          <div className="text-slate-100 leading-relaxed whitespace-pre-wrap font-sans">
                            {cleanActionTags(msg.text)}
                          </div>
                        ) : isCurrentProcessing ? (
                          <div className="flex items-center gap-2.5 py-1 text-cyan-400 font-mono text-xs">
                            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping shrink-0" />
                            <span>Synthesizing response...</span>
                          </div>
                        ) : msg.isError ? (
                          <div className="flex items-start gap-2 p-3 bg-rose-950/60 border border-rose-500/40 rounded-xl text-rose-200 text-xs font-mono">
                            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                            <div>
                              <div className="font-bold text-rose-300">Inference Request Failed</div>
                              <p className="mt-0.5">{msg.text || 'An issue occurred during response generation.'}</p>
                            </div>
                          </div>
                        ) : null}

                        {/* Four-Part Clinical Breakdown (If available) */}
                        {msg.response?.structuredBreakdown && (
                          <div className="mt-3 pt-3 border-t border-slate-800/80 space-y-2.5">
                            {msg.response.structuredBreakdown.observation && (
                              <div>
                                <div className="text-[10px] font-mono font-bold text-cyan-400 uppercase tracking-wider mb-0.5">
                                  OBSERVATION
                                </div>
                                <p className="text-slate-200 text-xs leading-relaxed">
                                  {cleanActionTags(msg.response.structuredBreakdown.observation)}
                                </p>
                              </div>
                            )}

                            {msg.response.structuredBreakdown.context && (
                              <div>
                                <div className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider mb-0.5">
                                  CONTEXT & BASELINE
                                </div>
                                <p className="text-slate-300 text-xs leading-relaxed">
                                  {cleanActionTags(msg.response.structuredBreakdown.context)}
                                </p>
                              </div>
                            )}

                            {Array.isArray(msg.response?.structuredBreakdown?.possibleContributingFactors) && msg.response.structuredBreakdown.possibleContributingFactors.length > 0 && (
                              <div>
                                <div className="text-[10px] font-mono font-bold text-amber-400 uppercase tracking-wider mb-1">
                                  POSSIBLE CONTRIBUTING FACTORS
                                </div>
                                <ul className="space-y-0.5 text-xs text-slate-300">
                                  {msg.response.structuredBreakdown.possibleContributingFactors.map((f, i) => (
                                    <li key={i} className="flex items-start gap-1.5">
                                      <span className="text-amber-400">•</span>
                                      <span>{typeof f === 'string' ? f : String(f)}</span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}

                            {msg.response?.structuredBreakdown?.suggestedNextStep && (
                              <div className="bg-emerald-950/30 border border-emerald-500/30 rounded-xl p-2.5">
                                <div className="text-[10px] font-mono font-bold text-emerald-400 uppercase tracking-wider mb-0.5 flex items-center gap-1.5">
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  SUGGESTED NEXT STEP
                                </div>
                                <p className="text-emerald-200 text-xs leading-relaxed">
                                  {cleanActionTags(msg.response.structuredBreakdown.suggestedNextStep)}
                                </p>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-xs sm:text-sm leading-relaxed whitespace-pre-wrap font-sans">
                        {cleanActionTags(msg.text)}
                      </div>
                    )}

                    {/* Action Pathways */}
                    {actionButtons.length > 0 && (
                      <motion.div 
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="mt-3 pt-2 border-t border-slate-800/80"
                      >
                        <div className="text-[10px] font-mono text-cyan-400 uppercase font-bold mb-1.5">
                          Action Pathways:
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {actionButtons.map((btn, bIdx) => (
                            <motion.button
                              key={bIdx}
                              whileHover={{ scale: 1.04 }}
                              whileTap={{ scale: 0.96 }}
                              onClick={() => {
                                if (btn.action === 'check-in' && onOpenCheckInModal) {
                                  onOpenCheckInModal();
                                } else if (onNavigateTab) {
                                  onNavigateTab(btn.tab);
                                }
                              }}
                              className="px-3 py-1.5 rounded-lg bg-cyan-950/90 hover:bg-cyan-900 border border-cyan-500/60 text-cyan-300 hover:text-white font-mono text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-md"
                            >
                              <span>{btn.label}</span>
                              <ArrowRight className="w-3.5 h-3.5 text-cyan-400" />
                            </motion.button>
                          ))}
                        </div>
                      </motion.div>
                    )}

                    {/* Interactive Follow-ups */}
                    {!isUser && Array.isArray(msg.response?.suggestedFollowUps) && msg.response.suggestedFollowUps.length > 0 && (
                      <motion.div 
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="mt-3 pt-2 border-t border-slate-800/80"
                      >
                        <div className="text-[10px] font-mono text-slate-400 uppercase font-semibold mb-1.5 flex items-center gap-1">
                          <Sparkles className="w-3 h-3 text-cyan-400" /> Suggested Follow-ups:
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {msg.response.suggestedFollowUps.map((fu, fuIdx) => (
                            <motion.button
                              key={fuIdx}
                              whileHover={{ scale: 1.04 }}
                              whileTap={{ scale: 0.96 }}
                              onClick={() => handleSend(fu)}
                              className="px-2.5 py-1 rounded-full text-xs font-mono bg-slate-900 hover:bg-slate-800 text-cyan-300 hover:text-cyan-200 border border-cyan-800/60 transition cursor-pointer shadow-xs"
                            >
                              {fu}
                            </motion.button>
                          ))}
                        </div>
                      </motion.div>
                    )}

                    {/* Data Used Transparency */}
                    {!isUser && (Array.isArray(msg.response?.dataUsed) || Array.isArray(msg.dataUsed)) && (
                      <div className="mt-2.5 pt-2 border-t border-slate-800/80">
                        <div className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                          <Compass className="w-3 h-3 text-cyan-400" />
                          <span>DATA USED:</span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {(Array.isArray(msg.response?.dataUsed) ? msg.response.dataUsed : (Array.isArray(msg.dataUsed) ? msg.dataUsed : [])).map((source: string, sIdx: number) => (
                            <span key={sIdx} className="px-2 py-0.5 rounded-md bg-slate-900 border border-slate-800 text-[10px] font-mono text-cyan-300">
                              ● {typeof source === 'string' ? source : String(source)}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Metadata Footer */}
                    {!isUser && (
                      <div className="mt-3 pt-2 border-t border-slate-800 flex items-center justify-between gap-2 text-[10px] font-mono text-slate-500">
                        <div className="flex items-center gap-1.5">
                          <BookOpen className="w-3 h-3 text-cyan-400" />
                          <span>{msg.response?.retrievedKnowledgeReferences?.[0] || 'NASA Spaceflight Medicine Standards'}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span>{msg.response?.providerName || engineBadgeLabel}</span>
                          {msg.response?.latencyMs && (
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" /> {msg.response.latencyMs}ms
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
          <div ref={messagesEndRef} />
        </div>

        {/* Suggested Prompts Carousel */}
        <div className="px-4 py-2 bg-slate-950/70 border-t border-slate-800/80 overflow-x-auto scrollbar-none">
          <div className="flex items-center gap-2 min-w-max">
            <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider font-semibold">
              Suggested:
            </span>
            {SUGGESTED_ASTRONAUT_PROMPTS.map((prompt, idx) => (
              <motion.button
                key={idx}
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.96 }}
                onClick={() => handleSend(prompt)}
                className="px-2.5 py-1 rounded-full text-xs font-mono bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700/80 transition cursor-pointer"
              >
                {prompt}
              </motion.button>
            ))}
          </div>
        </div>

        {/* Input Form Box */}
        <div className="p-3 sm:p-4 bg-slate-950 border-t border-slate-800">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="flex items-center gap-2"
          >
            <input
              id="astra-ai-input-field"
              type="text"
              value={inputQuestion}
              onChange={(e) => setInputQuestion(e.target.value)}
              placeholder={
                activeTab === 'ONLINE'
                  ? "Ask Gemini Intelligence (e.g. radiation risk, vitals check, log water)..."
                  : "Ask Local ASTRA (e.g. mission stats, workout log, clinical rules)..."
              }
              disabled={isCurrentProcessing}
              className="flex-1 rounded-xl bg-slate-900 border border-slate-700 px-4 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-hidden focus:border-cyan-500 transition font-sans"
            />
            {isCurrentProcessing && activeTab === 'OFFLINE' ? (
              <motion.button
                id="astra-ai-cancel-btn"
                type="button"
                onClick={() => {
                  localAIManager.abortGeneration('');
                  setIsOfflineProcessing(false);
                }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="flex items-center justify-center px-3.5 h-11 rounded-xl bg-rose-600/90 hover:bg-rose-600 text-white font-mono text-xs font-bold transition cursor-pointer shadow-md shrink-0 gap-1.5"
                title="Cancel Generation"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Cancel</span>
              </motion.button>
            ) : (
              <motion.button
                id="astra-ai-send-btn"
                type="submit"
                disabled={!inputQuestion.trim() || isCurrentProcessing}
                whileHover={{ scale: inputQuestion.trim() && !isCurrentProcessing ? 1.05 : 1 }}
                whileTap={{ scale: inputQuestion.trim() && !isCurrentProcessing ? 0.95 : 1 }}
                className={`flex items-center justify-center w-11 h-11 rounded-xl disabled:opacity-40 text-white transition cursor-pointer shadow-md shrink-0 ${
                  activeTab === 'ONLINE' ? 'bg-cyan-600 hover:bg-cyan-500' : 'bg-purple-600 hover:bg-purple-500'
                }`}
                title="Send to ASTRA"
              >
                <Send className="w-4 h-4" />
              </motion.button>
            )}
          </form>
        </div>
      </div>

      {/* Activity Tracker & Mission Operations Side Panel */}
      <AnimatePresence>
        {showActivityTracker && (
          <motion.div 
            initial={{ opacity: 0, x: 20, width: 0 }}
            animate={{ opacity: 1, x: 0, width: 'auto' }}
            exit={{ opacity: 0, x: 20, width: 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="w-full lg:w-80 flex flex-col rounded-2xl bg-slate-900/95 border border-slate-800 shadow-xl backdrop-blur-sm p-4 overflow-y-auto space-y-4"
          >
            {/* Layer 1: Mission Overview Header Bar */}
            <div 
              onClick={() => setLayer1Expanded(prev => !prev)}
              className="flex items-center justify-between pb-3 border-b border-slate-800 cursor-pointer select-none group"
              role="button"
              aria-expanded={layer1Expanded}
              aria-controls="mission-activity-body"
            >
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-emerald-950/80 border border-emerald-500/40 text-emerald-400 group-hover:border-emerald-500 transition">
                  <ActivityIcon className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-slate-100 font-mono flex items-center gap-1.5">
                    <span>Sol {missionContext.sol} Activity</span>
                    {layer1Expanded ? <ChevronUp className="w-3.5 h-3.5 text-slate-400" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />}
                  </h3>
                  <p className="text-[10px] text-slate-400 font-mono">Mission Telemetry Layer</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-950 border border-emerald-500/40 text-emerald-300 shadow-xs flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Active Sync
                </span>
              </div>
            </div>

            {/* Compact summary when Layer 1 is collapsed */}
            {!layer1Expanded && (
              <div className="text-[11px] font-mono text-slate-400 py-2 px-3 flex items-center justify-between bg-slate-950/60 rounded-xl border border-slate-800">
                <span>Targets: {dailyActivitySummary ? dailyActivitySummary.targets.filter(t => t.percentage >= 100).length : 0}/{dailyActivitySummary?.targets.length || 4} complete</span>
                <span className="text-purple-400">{activities.length} entries</span>
              </div>
            )}

            {/* Collapsible Mission Activity Body */}
            <AnimatePresence>
              {layer1Expanded && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.25 }}
                  className="space-y-4 overflow-hidden"
                  id="mission-activity-body"
                >
                  {/* Layer 2: Daily Mission Targets & Progress Meters (Dropdown Button) */}
                  <div className="space-y-2">
                    <button 
                      type="button"
                      onClick={() => setLayer2Expanded(prev => !prev)}
                      className={`w-full p-2.5 px-3 rounded-xl border flex items-center justify-between transition cursor-pointer text-xs font-mono select-none shadow-xs group ${
                        layer2Expanded 
                          ? 'bg-cyan-950/40 border-cyan-500/60 text-slate-100 shadow-cyan-950/30' 
                          : 'bg-slate-950/80 hover:bg-slate-900 border-slate-800 hover:border-cyan-500/40 text-slate-300 hover:text-white'
                      }`}
                      aria-expanded={layer2Expanded}
                      aria-controls="daily-targets-content"
                    >
                      <div className="flex items-center gap-2">
                        <div className={`p-1 rounded-md transition ${layer2Expanded ? 'bg-cyan-500/20 text-cyan-400' : 'bg-slate-800 text-slate-400 group-hover:text-cyan-400'}`}>
                          <CheckSquare className="w-3.5 h-3.5" />
                        </div>
                        <span className="font-bold tracking-wide">Daily Mission Targets</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-950/70 border border-cyan-800/60 text-cyan-300 font-semibold">
                          {dailyActivitySummary ? `${dailyActivitySummary.targets.filter(t => t.percentage >= 100).length}/${dailyActivitySummary.targets.length}` : 'Targets'}
                        </span>
                        {layer2Expanded ? (
                          <ChevronUp className="w-4 h-4 text-cyan-400 transition-transform duration-200" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-slate-400 group-hover:text-cyan-400 transition-transform duration-200" />
                        )}
                      </div>
                    </button>

                    <AnimatePresence>
                      {layer2Expanded && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.25, ease: 'easeInOut' }}
                          className="space-y-2 overflow-hidden pt-1"
                          id="daily-targets-content"
                        >
                          {dailyActivitySummary ? (
                            dailyActivitySummary.targets.map((tgt, idx) => (
                              <motion.div 
                                key={idx} 
                                initial={{ opacity: 0, y: 6 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: idx * 0.03 }}
                                className="p-3 rounded-xl bg-slate-950/90 border border-slate-800/80 text-xs space-y-2 shadow-inner"
                              >
                                <div className="flex justify-between items-center text-[11px] font-mono">
                                  <span className="text-slate-200 font-bold">{tgt.label}</span>
                                  <span className="text-cyan-300 font-mono font-semibold">
                                    {tgt.currentValue} / {tgt.targetValue} <span className="text-[10px] text-slate-400">{tgt.unit}</span>
                                  </span>
                                </div>
                                <div className="w-full bg-slate-900 h-2 rounded-full overflow-hidden border border-slate-800">
                                  <div 
                                    className={`h-full rounded-full transition-all duration-500 ${
                                      tgt.percentage >= 100 ? 'bg-gradient-to-r from-emerald-500 to-teal-400' : tgt.percentage >= 50 ? 'bg-gradient-to-r from-cyan-500 to-blue-500' : 'bg-gradient-to-r from-amber-500 to-orange-500'
                                    }`}
                                    style={{ width: `${Math.min(100, tgt.percentage)}%` }}
                                  />
                                </div>
                              </motion.div>
                            ))
                          ) : (
                            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-500 font-mono text-center">
                              Target summary loading...
                            </div>
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* Layer 3: Recent Operational Log Entries (Dropdown Button) */}
                  <div className="space-y-2 pt-2 border-t border-slate-800">
                    <button 
                      type="button"
                      onClick={() => setLayer3Expanded(prev => !prev)}
                      className={`w-full p-2.5 px-3 rounded-xl border flex items-center justify-between transition cursor-pointer text-xs font-mono select-none shadow-xs group ${
                        layer3Expanded 
                          ? 'bg-purple-950/40 border-purple-500/60 text-slate-100 shadow-purple-950/30' 
                          : 'bg-slate-950/80 hover:bg-slate-900 border-slate-800 hover:border-purple-500/40 text-slate-300 hover:text-white'
                      }`}
                      aria-expanded={layer3Expanded}
                      aria-controls="recent-log-content"
                    >
                      <div className="flex items-center gap-2">
                        <div className={`p-1 rounded-md transition ${layer3Expanded ? 'bg-purple-500/20 text-purple-400' : 'bg-slate-800 text-slate-400 group-hover:text-purple-400'}`}>
                          <Clock className="w-3.5 h-3.5" />
                        </div>
                        <span className="font-bold tracking-wide">Recent Operational Log</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-950/70 border border-purple-800/60 text-purple-300 font-semibold">
                          {activities.length} entries
                        </span>
                        {layer3Expanded ? (
                          <ChevronUp className="w-4 h-4 text-purple-400 transition-transform duration-200" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-slate-400 group-hover:text-purple-400 transition-transform duration-200" />
                        )}
                      </div>
                    </button>

                    <AnimatePresence>
                      {layer3Expanded && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.2 }}
                          className="space-y-2 overflow-hidden"
                          id="recent-log-content"
                        >
                          {activities.length === 0 ? (
                            <div className="p-5 text-center text-slate-500 text-xs font-mono border border-dashed border-slate-800 rounded-xl space-y-1 bg-slate-950/40">
                              <p>No activity records logged for Sol {missionContext.sol}.</p>
                              <p className="text-[10px] text-slate-400">Use the Quick Log bar above or ask ASTRA to record items.</p>
                            </div>
                          ) : (
                            <>
                              <div className="space-y-2">
                                {(showAllLogEntries ? activities : activities.slice(0, 3)).map((act) => (
                                  <motion.div 
                                    key={act.id} 
                                    initial={{ opacity: 0, scale: 0.98 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    className="p-3 rounded-xl bg-slate-950 border border-slate-800/90 text-xs font-mono space-y-1.5 shadow-sm hover:border-slate-700 transition"
                                  >
                                    <div className="flex items-center justify-between gap-2">
                                      <span className="font-bold text-slate-100 truncate">{act.title}</span>
                                      {onDeleteActivity && (
                                        <button 
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            if (window.confirm(`Are you sure you want to delete "${act.title}"?`)) {
                                              onDeleteActivity(act.id);
                                            }
                                          }}
                                          className="text-slate-500 hover:text-rose-400 transition p-1 rounded hover:bg-slate-900 cursor-pointer"
                                          title="Delete record"
                                        >
                                          <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                      )}
                                    </div>
                                    <p className="text-[11px] text-slate-300 font-sans leading-relaxed line-clamp-2">{act.details}</p>
                                    <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1 border-t border-slate-900">
                                      <span className="text-slate-400">Sol {act.sol} • {act.loggedBy || 'ASTRONAUT'}</span>
                                      <span className="px-2 py-0.5 rounded bg-cyan-950/70 text-cyan-300 font-bold uppercase border border-cyan-800/50">
                                        {act.category}
                                      </span>
                                    </div>
                                  </motion.div>
                                ))}
                              </div>

                              {activities.length > 3 && (
                                <div className="pt-1 text-center">
                                  <button
                                    onClick={() => setShowAllLogEntries(prev => !prev)}
                                    className="text-[11px] font-mono text-cyan-400 hover:text-cyan-300 underline transition cursor-pointer py-1 px-2"
                                  >
                                    {showAllLogEntries ? 'Show less (Top 3)' : `View all (${activities.length} entries)`}
                                  </button>
                                </div>
                              )}
                            </>
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
