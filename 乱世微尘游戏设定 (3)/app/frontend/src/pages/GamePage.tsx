import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  client,
  buildGMMessages,
  parseNPCData,
  parseResourceDelta,
  parseCompanionUpdates,
  parseWorldEvent,
  cleanNarrativeText,
  detectDeath,
  getSituationClass,
  getSituationLabel,
  applyResourceDelta,
  getResourceColor,
  GameCharacter,
  NPC,
  Companion,
  Resources,
  WorldEvent,
  DEFAULT_RESOURCES,
  QUICK_ACTIONS,
  ChatMessage,
} from '@/lib/gameClient';
import { useToast } from '@/hooks/use-toast';

interface Message {
  role: 'gm' | 'player';
  content: string;
  timestamp: number;
}

interface CharacterExtra {
  identity_label: string;
  identity_desc: string;
  identity_skills: string[];
  birthplace_desc: string;
  birthplace_danger: string;
  personality: string;
  backstory: string;
  active_event: { event: string; impact: string } | null;
}

interface NewsItem {
  title: string;
  content: string;
  impact: '高' | '中' | '低';
  type: '战事' | '政局' | '民生' | '灾异' | '奇闻';
}

interface NewsState {
  year: number;
  era_context: string;
  news: NewsItem[];
  fetchedAt: number;
}

// ── Season helpers ──────────────────────────────────────────
const SEASONS = ['春', '夏', '秋', '冬'];
function getSeason(turnCount: number): string {
  return SEASONS[Math.floor(turnCount / 3) % 4];
}
function getSeasonIcon(season: string): string {
  return { '春': '🌸', '夏': '☀️', '秋': '🍂', '冬': '❄️' }[season] ?? '🌸';
}
function getEraLabel(year: number): string {
  if (year <= 184) return '中平元年';
  if (year <= 189) return '中平年间';
  if (year <= 192) return '初平年间';
  if (year <= 196) return '兴平年间';
  if (year <= 220) return '建安年间';
  return '黄初年间';
}
function getImpactColor(impact: string): string {
  return impact === '高' ? '#c0392b' : impact === '中' ? '#c9a84c' : '#4a7c59';
}
function getTypeIcon(type: string): string {
  return { '战事': '⚔️', '政局': '🏛️', '民生': '🌾', '灾异': '⚡', '奇闻': '📜' }[type] ?? '📜';
}

function ResourceBar({ label, icon, value }: { label: string; icon: string; value: number }) {
  const color = getResourceColor(value);
  return (
    <div className="mb-2">
      <div className="flex justify-between items-center mb-1">
        <span className="text-xs lzwd-muted">{icon} {label}</span>
        <span className="text-xs font-mono" style={{ color }}>{value}</span>
      </div>
      <div className="lzwd-res-bar">
        <div className="lzwd-res-fill" style={{ width: `${value}%`, background: color }} />
      </div>
    </div>
  );
}

// ── Time Progression Banner ──────────────────────────────────
function TimeProgressionBanner({
  year,
  turnCount,
  eraLabel,
  onViewNews,
  hasNewNews,
}: {
  year: number;
  turnCount: number;
  eraLabel: string;
  onViewNews: () => void;
  hasNewNews: boolean;
}) {
  const season = getSeason(turnCount);
  const seasonIcon = getSeasonIcon(season);
  const progress = (turnCount % 12) / 12; // yearly cycle 0-1

  return (
    <div
      className="flex-shrink-0 flex items-center justify-between px-4 py-1.5 text-xs"
      style={{
        background: 'linear-gradient(90deg, #1a0f06, #2a1a08, #1a0f06)',
        borderBottom: '1px solid #3d2e1a',
      }}
    >
      {/* Left: Year + Season */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <span style={{ color: '#8b1a1a' }}>📅</span>
          <span className="lzwd-gold font-semibold tracking-wider">
            公元 {year} 年
          </span>
          <span className="lzwd-muted opacity-60">·</span>
          <span className="lzwd-muted opacity-70">{eraLabel}</span>
        </div>
        <div className="flex items-center gap-1">
          <span>{seasonIcon}</span>
          <span className="lzwd-muted">{season}季</span>
        </div>
      </div>

      {/* Center: Year progress bar */}
      <div className="flex items-center gap-2 flex-1 mx-4 max-w-48">
        <span className="lzwd-muted opacity-40 text-xs whitespace-nowrap">岁月流逝</span>
        <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: '#2a1a08' }}>
          <div
            className="h-full rounded-full transition-all duration-1000"
            style={{
              width: `${Math.max(4, progress * 100)}%`,
              background: 'linear-gradient(90deg, #8b1a1a, #c9a84c)',
            }}
          />
        </div>
        <span className="lzwd-muted opacity-40 text-xs whitespace-nowrap">第{turnCount}回合</span>
      </div>

      {/* Right: News button */}
      <button
        onClick={onViewNews}
        className="flex items-center gap-1.5 px-3 py-1 rounded transition-all duration-200"
        style={{
          background: hasNewNews ? '#2a0a0a' : '#1a1208',
          border: `1px solid ${hasNewNews ? '#8b1a1a' : '#3d2e1a'}`,
          color: hasNewNews ? '#c0392b' : '#8a7a5a',
        }}
      >
        {hasNewNews && (
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-600 animate-pulse" />
        )}
        <span>📰</span>
        <span>天下消息</span>
        {hasNewNews && <span className="text-xs opacity-70">新</span>}
      </button>
    </div>
  );
}

// ── News Panel ───────────────────────────────────────────────
function NewsPanel({
  newsState,
  onClose,
  isLoading,
}: {
  newsState: NewsState | null;
  onClose: () => void;
  isLoading: boolean;
}) {
  return (
    <div
      className="absolute inset-0 z-20 flex items-start justify-center pt-12"
      style={{ background: 'rgba(0,0,0,0.75)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg mx-4 rounded-lg overflow-hidden"
        style={{ background: '#16110a', border: '1px solid #3d2e1a' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-3 border-b"
          style={{ borderColor: '#3d2e1a', background: '#2a1a08' }}
        >
          <div className="flex items-center gap-2">
            <span className="text-lg">📰</span>
            <span className="lzwd-gold font-semibold tracking-wider" style={{ fontFamily: 'Noto Serif SC, serif' }}>
              天下消息
            </span>
            {newsState && (
              <span className="lzwd-muted text-xs opacity-60">
                · 公元{newsState.year}年
              </span>
            )}
          </div>
          <button onClick={onClose} className="lzwd-muted hover:text-yellow-400 text-lg transition-colors">×</button>
        </div>

        {/* Content */}
        <div className="p-5">
          {isLoading ? (
            <div className="text-center py-8">
              <div className="text-3xl mb-3 animate-pulse">📜</div>
              <p className="lzwd-muted text-sm">探子正在打探消息...</p>
            </div>
          ) : !newsState || newsState.news.length === 0 ? (
            <div className="text-center py-8">
              <p className="lzwd-muted text-sm opacity-60">暂无消息</p>
            </div>
          ) : (
            <>
              {/* Era context */}
              <div
                className="mb-4 px-4 py-2.5 rounded text-xs leading-relaxed"
                style={{ background: '#2a0a0a', border: '1px solid #8b1a1a33', color: '#c0392b' }}
              >
                ⚠ {newsState.era_context}
              </div>

              {/* News items */}
              <div className="space-y-3">
                {newsState.news.map((item, i) => (
                  <div
                    key={i}
                    className="rounded-lg p-4"
                    style={{ background: '#1a1208', border: `1px solid ${getImpactColor(item.impact)}33` }}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span>{getTypeIcon(item.type)}</span>
                        <span
                          className="font-semibold text-sm"
                          style={{ color: '#e8d5a3', fontFamily: 'Noto Serif SC, serif' }}
                        >
                          {item.title}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span
                          className="text-xs px-2 py-0.5 rounded-full"
                          style={{
                            background: `${getImpactColor(item.impact)}22`,
                            border: `1px solid ${getImpactColor(item.impact)}55`,
                            color: getImpactColor(item.impact),
                          }}
                        >
                          {item.type}
                        </span>
                        <span
                          className="text-xs px-1.5 py-0.5 rounded"
                          style={{ color: getImpactColor(item.impact), opacity: 0.8 }}
                        >
                          {item.impact === '高' ? '紧急' : item.impact === '中' ? '重要' : '一般'}
                        </span>
                      </div>
                    </div>
                    <p className="lzwd-muted text-xs leading-relaxed">{item.content}</p>
                  </div>
                ))}
              </div>

              <p className="lzwd-muted text-xs mt-4 text-center opacity-40">
                消息来源于四方探子，真假难辨，请自行判断
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function GamePage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const [character, setCharacter] = useState<GameCharacter | null>(null);
  const [charExtra, setCharExtra] = useState<CharacterExtra | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [npcs, setNpcs] = useState<NPC[]>([]);
  const [companions, setCompanions] = useState<Companion[]>([]);
  const [worldEvents, setWorldEvents] = useState<WorldEvent[]>([]);
  const [resources, setResources] = useState<Resources>(DEFAULT_RESOURCES);
  const [currentLocation, setCurrentLocation] = useState('');
  const [playerInput, setPlayerInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [deathModal, setDeathModal] = useState<{ show: boolean; narrative: string }>({ show: false, narrative: '' });
  const [initialized, setInitialized] = useState(false);
  const [activeTab, setActiveTab] = useState<'status' | 'companions' | 'events'>('status');

  // Time progression state
  const [currentYear, setCurrentYear] = useState(184);
  const [turnCount, setTurnCount] = useState(0);

  // News state
  const [newsState, setNewsState] = useState<NewsState | null>(null);
  const [showNewsPanel, setShowNewsPanel] = useState(false);
  const [newsLoading, setNewsLoading] = useState(false);
  const [hasNewNews, setHasNewNews] = useState(false);
  const lastNewsFetchTurn = useRef(0);

  const buildHistory = useCallback((msgs: Message[]): ChatMessage[] => {
    return msgs.map(m => ({
      role: m.role === 'gm' ? 'assistant' : 'user',
      content: m.content,
    }));
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText]);

  // Fetch news every 5 turns
  const fetchNews = useCallback(async (
    year: number,
    location: string,
    situation: string,
    events: WorldEvent[],
    charId: number,
  ) => {
    setNewsLoading(true);
    try {
      const recentEventTexts = events.slice(-3).map(e => e.event);
      const res = await client.apiCall.invoke({
        url: '/api/v1/gm/news',
        method: 'POST',
        data: {
          character_id: charId,
          current_year: year,
          current_location: location,
          recent_events: recentEventTexts,
          character_situation: situation,
        },
      });
      if (res?.data) {
        setNewsState({
          year: res.data.year,
          era_context: res.data.era_context,
          news: res.data.news || [],
          fetchedAt: Date.now(),
        });
        setHasNewNews(true);
      }
    } catch {
      // silent fail
    } finally {
      setNewsLoading(false);
    }
  }, []);

  // Initialize
  useEffect(() => {
    if (initialized) return;
    setInitialized(true);

    const charStr = localStorage.getItem('lzwd_current_char');
    if (!charStr) { navigate('/'); return; }
    const char: GameCharacter = JSON.parse(charStr);
    setCharacter(char);
    setCurrentYear(char.current_year || 184);

    (async () => {
      // Try to load existing session
      try {
        const sessionRes = await client.apiCall.invoke({
          url: `/api/v1/gm/load_session/${char.id}`,
          method: 'GET',
        });
        const session = sessionRes?.data;
        if (session && session.messages && JSON.parse(session.messages).length > 0) {
          const loadedMsgs = JSON.parse(session.messages || '[]');
          setMessages(loadedMsgs);
          setNpcs(JSON.parse(session.scene_npcs || '[]'));
          setWorldEvents(JSON.parse(session.world_events || '[]'));
          setCompanions(JSON.parse(session.companions || '[]'));
          const savedRes = session.resources ? JSON.parse(session.resources) : DEFAULT_RESOURCES;
          setResources(savedRes);
          setCurrentLocation(session.current_location || char.birthplace);
          const loadedTurn = Math.floor(loadedMsgs.filter((m: Message) => m.role === 'player').length);
          setTurnCount(loadedTurn);
          // Fetch initial news for returning players
          await fetchNews(char.current_year || 184, session.current_location || char.birthplace, char.situation || '安全', JSON.parse(session.world_events || '[]'), char.id);
          return;
        }
      } catch {
        // No existing session
      }

      // Use opening data from localStorage
      const openingStr = localStorage.getItem('lzwd_opening');
      if (openingStr) {
        const opening = JSON.parse(openingStr);
        const openingMsg: Message = {
          role: 'gm',
          content: opening.opening_narrative || '你踏入了乱世...',
          timestamp: Date.now(),
        };
        setMessages([openingMsg]);
        setNpcs(opening.npcs || []);
        setCurrentLocation(opening.location || char.birthplace);
        setCompanions(opening.companions || []);
        if (opening.resources) setResources(opening.resources);
        const startYear = opening.current_year || 184;
        setCurrentYear(startYear);
        if (opening.active_event) {
          setWorldEvents([{ year: startYear, event: opening.active_event.event }]);
        } else {
          setWorldEvents([{ year: 184, event: '黄巾之乱爆发，天下动荡' }]);
        }
        setCharExtra({
          identity_label: opening.identity_label || char.identity,
          identity_desc: opening.identity_desc || '',
          identity_skills: opening.identity_skills || [],
          birthplace_desc: opening.birthplace_desc || '',
          birthplace_danger: opening.birthplace_danger || '中',
          personality: opening.personality || '',
          backstory: opening.backstory || '',
          active_event: opening.active_event || null,
        });
        localStorage.removeItem('lzwd_opening');
        // Fetch initial news
        await fetchNews(startYear, opening.location || char.birthplace, char.situation || '安全', [], char.id);
      }
    })();
  }, [initialized, navigate, fetchNews]);

  const saveSession = useCallback(async (
    msgs: Message[], currentNpcs: NPC[], events: WorldEvent[],
    location: string, charId: number, res: Resources, comps: Companion[],
  ) => {
    try {
      await client.apiCall.invoke({
        url: '/api/v1/gm/save_session',
        method: 'POST',
        data: {
          character_id: charId,
          messages: JSON.stringify(msgs),
          npc_states: JSON.stringify(currentNpcs),
          world_events: JSON.stringify(events),
          scene_npcs: JSON.stringify(currentNpcs),
          current_location: location,
          resources: JSON.stringify(res),
          companions: JSON.stringify(comps),
          session_summary: '',
        },
      });
    } catch { /* silent */ }
  }, []);

  const handleDeath = useCallback(async (deathContext: string) => {
    if (!character) return;
    try {
      const res = await client.apiCall.invoke({
        url: '/api/v1/gm/death',
        method: 'POST',
        data: { character_id: character.id, death_context: deathContext },
      });
      setDeathModal({ show: true, narrative: res?.data?.death_narrative || '你就此离开了这个乱世。' });
    } catch {
      setDeathModal({ show: true, narrative: '你就此离开了这个乱世，成为历史长河中一粒微尘。' });
    }
  }, [character]);

  const sendMessage = useCallback(async (overrideInput?: string) => {
    const input = (overrideInput ?? playerInput).trim();
    if (!input || isStreaming || !character) return;
    if (!overrideInput) setPlayerInput('');

    const newTurn = turnCount + 1;
    setTurnCount(newTurn);

    // Advance year every 12 turns
    const newYear = currentYear + Math.floor(newTurn / 12) - Math.floor((newTurn - 1) / 12);

    const playerMsg: Message = { role: 'player', content: input, timestamp: Date.now() };
    const newMessages = [...messages, playerMsg];
    setMessages(newMessages);
    setIsStreaming(true);
    setStreamingText('');
    let fullResponse = '';

    try {
      const history = buildHistory(messages);
      const gmMessages = buildGMMessages(history, input);

      await client.ai.gentxt({
        messages: gmMessages,
        model: 'claude-opus-4.6',
        stream: true,
        onChunk: (chunk: any) => {
          fullResponse += chunk.content || '';
          setStreamingText(fullResponse);
        },
        onComplete: async (result: any) => {
          const finalText = result?.content || fullResponse;
          const cleanText = cleanNarrativeText(finalText);

          const newNpcs = parseNPCData(finalText);
          const updatedNpcs = newNpcs.length > 0 ? newNpcs : npcs;

          const resDelta = parseResourceDelta(finalText);
          const updatedResources = resDelta ? applyResourceDelta(resources, resDelta) : resources;

          const companionUpdates = parseCompanionUpdates(finalText);
          const updatedCompanions = [...companions];
          companionUpdates.forEach(upd => {
            const idx = updatedCompanions.findIndex(c => c.name === upd.name);
            if (idx >= 0) {
              updatedCompanions[idx] = {
                ...updatedCompanions[idx],
                emotion: upd.emotion,
                loyalty: Math.max(0, Math.min(100, updatedCompanions[idx].loyalty + (upd.loyalty_delta || 0))),
                note: upd.note,
              };
            }
          });

          const worldEvent = parseWorldEvent(finalText);
          const updatedEvents = worldEvent ? [...worldEvents, worldEvent] : worldEvents;

          const gmMsg: Message = { role: 'gm', content: cleanText, timestamp: Date.now() };
          const updatedMessages = [...newMessages, gmMsg];

          setMessages(updatedMessages);
          setNpcs(updatedNpcs);
          setResources(updatedResources);
          setCompanions(updatedCompanions);
          setWorldEvents(updatedEvents);
          setStreamingText('');
          setIsStreaming(false);

          // Update year if advanced
          if (newYear !== currentYear) {
            setCurrentYear(newYear);
          }

          await saveSession(updatedMessages, updatedNpcs, updatedEvents, currentLocation, character.id, updatedResources, updatedCompanions);

          // Fetch news every 5 turns
          if (newTurn - lastNewsFetchTurn.current >= 5) {
            lastNewsFetchTurn.current = newTurn;
            fetchNews(newYear, currentLocation, character.situation || '安全', updatedEvents, character.id);
          }

          // Death conditions
          if (detectDeath(cleanText) || updatedResources.food <= 0 || updatedResources.health <= 0) {
            const ctx = updatedResources.food <= 0
              ? '你因饥饿而倒下，再也没能站起来。'
              : updatedResources.health <= 0
              ? '你的伤势过重，终究没能撑过去。'
              : cleanText;
            await handleDeath(ctx);
          }
        },
        onError: (error: any) => {
          toast({ title: 'GM叙事中断', description: error?.message || '请稍后重试', variant: 'destructive' });
          setStreamingText('');
          setIsStreaming(false);
        },
        timeout: 60000,
      });
    } catch (e: any) {
      toast({ title: '发送失败', description: e?.message, variant: 'destructive' });
      setIsStreaming(false);
      setStreamingText('');
    }
  }, [playerInput, isStreaming, character, messages, npcs, companions, resources, worldEvents, currentLocation, buildHistory, saveSession, handleDeath, toast, turnCount, currentYear, fetchNews]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleOpenNews = useCallback(() => {
    setShowNewsPanel(true);
    setHasNewNews(false);
  }, []);

  if (!character) {
    return (
      <div className="lzwd-bg flex items-center justify-center min-h-screen">
        <div className="lzwd-title text-2xl animate-pulse">载入中...</div>
      </div>
    );
  }

  const eraLabel = getEraLabel(currentYear);

  return (
    <div className="lzwd-bg flex flex-col" style={{ height: '100vh', overflow: 'hidden' }}>
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-2 border-b flex-shrink-0"
        style={{ borderColor: '#3d2e1a', background: '#16110a' }}>
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/')} className="lzwd-muted text-sm hover:text-yellow-400 transition-colors">← 返回</button>
          <span className="lzwd-title text-lg">乱世微尘</span>
        </div>
        <div className="flex items-center gap-3 text-sm flex-wrap justify-end">
          <span className="lzwd-gold font-semibold">{character.name}</span>
          <span className="lzwd-muted">·</span>
          {currentLocation && <span className="lzwd-muted text-xs">📍 {currentLocation}</span>}
          <span className={`text-xs px-2 py-0.5 rounded-full ${getSituationClass(character.situation)}`}>
            {getSituationLabel(character.situation)}
          </span>
        </div>
      </header>

      {/* Time Progression Banner */}
      <TimeProgressionBanner
        year={currentYear}
        turnCount={turnCount}
        eraLabel={eraLabel}
        onViewNews={handleOpenNews}
        hasNewNews={hasNewNews}
      />

      <div className="flex flex-1 overflow-hidden relative">
        {/* Left Sidebar */}
        <aside className="w-60 flex-shrink-0 flex flex-col border-r lzwd-scroll overflow-y-auto"
          style={{ borderColor: '#3d2e1a', background: '#16110a' }}>

          {/* Tabs */}
          <div className="flex border-b" style={{ borderColor: '#3d2e1a' }}>
            {(['status', 'companions', 'events'] as const).map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className={`flex-1 py-2 text-xs transition-colors ${
                  activeTab === tab ? 'lzwd-gold border-b border-yellow-600' : 'lzwd-muted hover:text-yellow-600'
                }`}>
                {tab === 'status' ? '状态' : tab === 'companions' ? `伙伴${companions.length > 0 ? `(${companions.length})` : ''}` : '天下'}
              </button>
            ))}
          </div>

          {/* Status Tab */}
          {activeTab === 'status' && (
            <div className="p-4">
              <h3 className="lzwd-gold text-xs font-semibold tracking-widest mb-3">【生存资源】</h3>
              <ResourceBar label="粮食" icon="🌾" value={resources.food} />
              <ResourceBar label="钱财" icon="💰" value={resources.money} />
              <ResourceBar label="健康" icon="❤️" value={resources.health} />
              <ResourceBar label="体力" icon="⚡" value={resources.stamina} />
              <ResourceBar label="精神" icon="🧠" value={resources.morale} />

              <hr className="lzwd-divider mt-3" />
              <h3 className="lzwd-gold text-xs font-semibold tracking-widest mb-2">【行迹】</h3>
              <div className="space-y-1.5 text-xs lzwd-muted">
                <div className="flex justify-between">
                  <span>当前地点</span><span className="lzwd-text text-right max-w-28 truncate">{currentLocation || '不知何处'}</span>
                </div>
                <div className="flex justify-between">
                  <span>声望</span><span className="lzwd-text">{character.reputation || '无名之辈'}</span>
                </div>
              </div>

              {charExtra?.identity_skills && charExtra.identity_skills.length > 0 && (
                <>
                  <hr className="lzwd-divider mt-3" />
                  <h3 className="lzwd-gold text-xs font-semibold tracking-widest mb-2">【已掌握技能】</h3>
                  <div className="flex flex-wrap gap-1">
                    {charExtra.identity_skills.map(skill => (
                      <span key={skill} className="text-xs px-2 py-0.5 rounded"
                        style={{ background: '#2a1f0e', border: '1px solid #3d2e1a', color: '#c9a84c' }}>
                        {skill}
                      </span>
                    ))}
                  </div>
                </>
              )}

              {charExtra?.personality && (
                <>
                  <hr className="lzwd-divider mt-3" />
                  <h3 className="lzwd-gold text-xs font-semibold tracking-widest mb-2">【性格】</h3>
                  <p className="lzwd-muted text-xs leading-relaxed">{charExtra.personality}</p>
                </>
              )}

              {npcs.length > 0 && (
                <>
                  <hr className="lzwd-divider mt-3" />
                  <h3 className="lzwd-gold text-xs font-semibold tracking-widest mb-2">【场景人物】</h3>
                  {npcs.map((npc, i) => (
                    <div key={i} className="lzwd-npc-card">
                      <div className="lzwd-text text-xs font-semibold">{npc.name}</div>
                      <div className="lzwd-muted text-xs">{npc.profession}</div>
                      <div className="text-xs mt-0.5" style={{ color: npc.attitude?.includes('敌') ? '#8b1a1a' : '#4a7c59' }}>
                        {npc.emotion} · {npc.attitude}
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}

          {/* Companions Tab */}
          {activeTab === 'companions' && (
            <div className="p-4">
              <h3 className="lzwd-gold text-xs font-semibold tracking-widest mb-3">
                【随行伙伴】<span className="lzwd-muted ml-1 font-normal">{companions.length}/3</span>
              </h3>
              {companions.length === 0 ? (
                <div className="text-center py-6">
                  <p className="lzwd-muted text-xs opacity-60 mb-1">尚无伙伴</p>
                  <p className="lzwd-muted text-xs opacity-40">在游戏中结识他人，或许有人愿意同行</p>
                </div>
              ) : (
                companions.map((comp, i) => (
                  <div key={i} className="lzwd-companion-card">
                    <div className="flex justify-between items-start mb-1">
                      <span className="lzwd-text text-xs font-semibold">{comp.name}</span>
                      <span className="text-xs lzwd-muted">{comp.profession}</span>
                    </div>
                    {comp.personality && <p className="lzwd-muted text-xs opacity-60 mb-1">{comp.personality}</p>}
                    <div className="text-xs lzwd-muted mb-1">情绪：{comp.emotion}</div>
                    <div className="lzwd-res-bar">
                      <div className="lzwd-res-fill"
                        style={{ width: `${comp.loyalty}%`, background: getResourceColor(comp.loyalty) }} />
                    </div>
                    <div className="flex justify-between mt-1">
                      <span className="text-xs lzwd-muted">忠诚</span>
                      <span className="text-xs" style={{ color: getResourceColor(comp.loyalty) }}>{comp.loyalty}</span>
                    </div>
                    {comp.note && <p className="text-xs lzwd-muted mt-1 opacity-60 italic">{comp.note}</p>}
                  </div>
                ))
              )}
              <p className="lzwd-muted text-xs mt-4 opacity-40 text-center">伙伴也要吃饭，也会害怕，也可能离队</p>
            </div>
          )}

          {/* World Events Tab */}
          {activeTab === 'events' && (
            <div className="p-4">
              <h3 className="lzwd-gold text-xs font-semibold tracking-widest mb-3">【天下大事】</h3>
              {charExtra?.active_event && (
                <div className="mb-3 p-2 rounded" style={{ background: '#2a0a0a', border: '1px solid #8b1a1a33' }}>
                  <p className="text-xs" style={{ color: '#c0392b' }}>⚠ 当前局势</p>
                  <p className="lzwd-muted text-xs mt-1">{charExtra.active_event.impact}</p>
                </div>
              )}
              {worldEvents.length === 0 ? (
                <p className="lzwd-muted text-xs opacity-60">尚无记录</p>
              ) : (
                <div className="space-y-2">
                  {[...worldEvents].reverse().map((ev, i) => (
                    <div key={i} className="lzwd-event-item">
                      <span style={{ color: '#8b1a1a' }} className="font-semibold">{ev.year}年</span>
                      <p className="mt-0.5">{ev.event}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </aside>

        {/* Main Game Area */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {/* Narrative */}
          <div className="flex-1 overflow-y-auto lzwd-scroll p-6 space-y-4">
            {messages.length === 0 && (
              <div className="text-center py-12">
                <p className="lzwd-muted text-sm opacity-60 animate-pulse">故事即将开始...</p>
              </div>
            )}
            {messages.map((msg, i) => (
              <div key={i} className={`lzwd-msg-enter ${msg.role === 'player' ? 'flex justify-end' : ''}`}>
                {msg.role === 'gm' ? (
                  <div className="max-w-3xl">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs lzwd-gold opacity-70">【GM叙事】</span>
                    </div>
                    <div className="lzwd-narrative whitespace-pre-wrap">{msg.content}</div>
                    <hr className="lzwd-divider mt-3" />
                  </div>
                ) : (
                  <div className="max-w-xl">
                    <div className="flex items-center justify-end gap-2 mb-1">
                      <span className="text-xs lzwd-muted">【{character.name}】</span>
                    </div>
                    <div className="px-4 py-2 rounded-lg text-sm"
                      style={{ background: '#2a1f0e', border: '1px solid #3d2e1a', color: '#e8d5a3' }}>
                      {msg.content}
                    </div>
                  </div>
                )}
              </div>
            ))}

            {isStreaming && (
              <div className="lzwd-msg-enter max-w-3xl">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs lzwd-gold opacity-70">【GM叙事】</span>
                </div>
                <div className="lzwd-narrative whitespace-pre-wrap">
                  {streamingText}
                  <span className="lzwd-cursor" />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick Actions */}
          <div className="flex-shrink-0 px-4 pt-2 pb-1 flex flex-wrap gap-1.5"
            style={{ borderTop: '1px solid #3d2e1a44', background: '#0d0d0d' }}>
            {QUICK_ACTIONS.map(action => (
              <button key={action} className="lzwd-action-btn" disabled={isStreaming}
                onClick={() => sendMessage(action)}>
                {action}
              </button>
            ))}
          </div>

          {/* Input */}
          <div className="flex-shrink-0 p-4 border-t" style={{ borderColor: '#3d2e1a', background: '#16110a' }}>
            <div className="flex gap-3 items-end">
              <textarea
                ref={inputRef}
                className="lzwd-input flex-1 px-4 py-3 rounded-lg text-sm"
                style={{ minHeight: '72px', maxHeight: '140px' }}
                placeholder="描述你的行动或言语... (Ctrl+Enter 发送)"
                value={playerInput}
                onChange={e => setPlayerInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isStreaming}
              />
              <button
                onClick={() => sendMessage()}
                disabled={isStreaming || !playerInput.trim()}
                className="lzwd-btn-gold px-5 py-3 rounded-lg text-sm tracking-wider disabled:opacity-40"
                style={{ minWidth: '72px', height: '72px' }}
              >
                {isStreaming ? (
                  <span className="flex flex-col items-center gap-1">
                    <span className="animate-spin text-lg">⟳</span>
                    <span className="text-xs">叙事中</span>
                  </span>
                ) : (
                  <span className="flex flex-col items-center gap-1">
                    <span className="text-lg">⚔</span>
                    <span className="text-xs">行动</span>
                  </span>
                )}
              </button>
            </div>
            <p className="lzwd-muted text-xs mt-1.5 text-center opacity-40">
              Ctrl+Enter 发送 · 描述你的行动、言语或意图
            </p>
          </div>
        </main>

        {/* News Panel Overlay */}
        {showNewsPanel && (
          <NewsPanel
            newsState={newsState}
            onClose={() => setShowNewsPanel(false)}
            isLoading={newsLoading}
          />
        )}
      </div>

      {/* Death Modal */}
      {deathModal.show && (
        <div className="lzwd-death-overlay">
          <div className="lzwd-card rounded-lg p-8 max-w-lg mx-4 text-center">
            <div className="text-5xl mb-4">☠</div>
            <h2 className="lzwd-title text-2xl mb-4" style={{ color: '#8b1a1a' }}>命归黄泉</h2>
            <hr className="lzwd-divider" />
            <p className="lzwd-narrative mt-4 mb-6 text-sm leading-loose">{deathModal.narrative}</p>
            <hr className="lzwd-divider" />
            <p className="lzwd-muted text-xs mb-6 mt-2">乱世之中，死亡不过是另一个开始。</p>
            <button
              onClick={() => { setDeathModal({ show: false, narrative: '' }); navigate('/'); }}
              className="lzwd-btn-gold px-8 py-3 rounded tracking-widest"
            >
              重入乱世
            </button>
          </div>
        </div>
      )}
    </div>
  );
}