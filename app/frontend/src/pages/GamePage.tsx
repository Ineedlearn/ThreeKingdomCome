import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  client,
  GM_SYSTEM_PROMPT,
  buildGMMessages,
  parseNPCData,
  cleanNarrativeText,
  detectDeath,
  getSituationClass,
  getSituationLabel,
  GameCharacter,
  NPC,
  ChatMessage,
} from '@/lib/gameClient';
import { useToast } from '@/hooks/use-toast';

interface Message {
  role: 'gm' | 'player';
  content: string;
  timestamp: number;
}

interface WorldEvent {
  year: number;
  text: string;
}

export default function GamePage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const [character, setCharacter] = useState<GameCharacter | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [npcs, setNpcs] = useState<NPC[]>([]);
  const [worldEvents, setWorldEvents] = useState<WorldEvent[]>([]);
  const [currentLocation, setCurrentLocation] = useState('');
  const [playerInput, setPlayerInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [deathModal, setDeathModal] = useState<{ show: boolean; narrative: string }>({ show: false, narrative: '' });
  const [initialized, setInitialized] = useState(false);

  // Build chat history for GM (convert messages to ChatMessage format)
  const buildHistory = useCallback((msgs: Message[]): ChatMessage[] => {
    return msgs.map(m => ({
      role: m.role === 'gm' ? 'assistant' : 'user',
      content: m.content,
    }));
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText]);

  // Initialize game
  useEffect(() => {
    if (initialized) return;
    setInitialized(true);

    const charStr = localStorage.getItem('lzwd_current_char');
    if (!charStr) { navigate('/'); return; }
    const char: GameCharacter = JSON.parse(charStr);
    setCharacter(char);

    (async () => {
      // Try to load existing session
      try {
        const sessionRes = await client.apiCall.invoke({
          url: `/api/v1/gm/load_session/${char.id}`,
          method: 'GET',
        });
        const session = sessionRes?.data;
        if (session) {
          setSessionId(session.session_id);
          const savedMessages: Message[] = JSON.parse(session.messages || '[]');
          const savedNpcs: NPC[] = JSON.parse(session.scene_npcs || '[]');
          const savedEvents: WorldEvent[] = JSON.parse(session.world_events || '[]');
          setMessages(savedMessages);
          setNpcs(savedNpcs);
          setWorldEvents(savedEvents);
          setCurrentLocation(session.current_location || char.birthplace);
          return;
        }
      } catch {
        // No existing session, use opening
      }

      // Use opening scene from localStorage
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
        // Add initial world event
        setWorldEvents([{ year: char.current_year || 184, text: '黄巾之乱爆发，天下动荡' }]);
        localStorage.removeItem('lzwd_opening');
      }
    })();
  }, [initialized, navigate]);

  // Auto-save session
  const saveSession = useCallback(async (
    msgs: Message[],
    currentNpcs: NPC[],
    events: WorldEvent[],
    location: string,
    charId: number,
  ) => {
    try {
      const res = await client.apiCall.invoke({
        url: '/api/v1/gm/save_session',
        method: 'POST',
        data: {
          character_id: charId,
          messages: JSON.stringify(msgs),
          npc_states: JSON.stringify(currentNpcs),
          world_events: JSON.stringify(events),
          scene_npcs: JSON.stringify(currentNpcs),
          current_location: location,
          session_summary: '',
        },
      });
      if (res?.data?.session_id) setSessionId(res.data.session_id);
    } catch {
      // silent fail
    }
  }, []);

  // Handle death
  const handleDeath = useCallback(async (deathContext: string) => {
    if (!character) return;
    try {
      const res = await client.apiCall.invoke({
        url: '/api/v1/gm/death',
        method: 'POST',
        data: { character_id: character.id, death_context: deathContext },
      });
      const narrative = res?.data?.death_narrative || '你就此离开了这个乱世。';
      setDeathModal({ show: true, narrative });
    } catch {
      setDeathModal({ show: true, narrative: '你就此离开了这个乱世，成为历史长河中一粒微尘。' });
    }
  }, [character]);

  // Send message to GM
  const sendMessage = useCallback(async () => {
    if (!playerInput.trim() || isStreaming || !character) return;

    const input = playerInput.trim();
    setPlayerInput('');

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

          // Parse NPC updates
          const newNpcs = parseNPCData(finalText);
          const updatedNpcs = newNpcs.length > 0 ? newNpcs : npcs;

          const gmMsg: Message = { role: 'gm', content: cleanText, timestamp: Date.now() };
          const updatedMessages = [...newMessages, gmMsg];

          setMessages(updatedMessages);
          setNpcs(updatedNpcs);
          setStreamingText('');
          setIsStreaming(false);

          // Save session
          await saveSession(updatedMessages, updatedNpcs, worldEvents, currentLocation, character.id);

          // Check for death
          if (detectDeath(cleanText)) {
            await handleDeath(cleanText);
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
  }, [playerInput, isStreaming, character, messages, npcs, worldEvents, currentLocation, buildHistory, saveSession, handleDeath, toast]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      sendMessage();
    }
  };

  if (!character) {
    return (
      <div className="lzwd-bg flex items-center justify-center min-h-screen">
        <div className="lzwd-title text-2xl animate-pulse">载入中...</div>
      </div>
    );
  }

  return (
    <div className="lzwd-bg min-h-screen flex flex-col" style={{ height: '100vh', overflow: 'hidden' }}>
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-2 border-b" style={{ borderColor: '#3d2e1a', background: '#16110a', flexShrink: 0 }}>
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/')} className="lzwd-muted text-sm hover:text-yellow-400 transition-colors">← 返回</button>
          <span className="lzwd-title text-lg">乱世微尘</span>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="lzwd-gold font-semibold">{character.name}</span>
          <span className="lzwd-muted">·</span>
          <span className="lzwd-muted">{character.identity}</span>
          <span className="lzwd-muted">·</span>
          <span className="lzwd-muted">📅 {character.current_year || 184}年</span>
          <span className={`text-xs px-2 py-0.5 rounded-full ${getSituationClass(character.situation)}`}>
            {getSituationLabel(character.situation)}
          </span>
        </div>
      </header>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar */}
        <aside className="w-64 flex-shrink-0 flex flex-col border-r lzwd-scroll overflow-y-auto" style={{ borderColor: '#3d2e1a', background: '#16110a' }}>
          {/* Character Status */}
          <div className="p-4 border-b" style={{ borderColor: '#3d2e1a' }}>
            <h3 className="lzwd-gold text-xs font-semibold tracking-widest mb-3 uppercase">角色状态</h3>
            <div className="space-y-1.5 text-xs lzwd-muted">
              <div className="flex justify-between">
                <span>身份</span><span className="lzwd-text">{character.identity}</span>
              </div>
              <div className="flex justify-between">
                <span>出生地</span><span className="lzwd-text">{character.birthplace}</span>
              </div>
              <div className="flex justify-between">
                <span>当前地点</span><span className="lzwd-text">{currentLocation || character.birthplace}</span>
              </div>
              <div className="flex justify-between">
                <span>声望</span><span className="lzwd-text">{character.reputation || '无名之辈'}</span>
              </div>
            </div>
          </div>

          {/* NPCs */}
          <div className="p-4 border-b" style={{ borderColor: '#3d2e1a' }}>
            <h3 className="lzwd-gold text-xs font-semibold tracking-widest mb-3 uppercase">当前场景人物</h3>
            {npcs.length === 0 ? (
              <p className="lzwd-muted text-xs opacity-60">尚无已知人物</p>
            ) : (
              <div className="space-y-2">
                {npcs.map((npc, i) => (
                  <div key={i} className="lzwd-npc-card">
                    <div className="lzwd-text text-xs font-semibold">{npc.name}</div>
                    <div className="lzwd-muted text-xs">{npc.profession}</div>
                    <div className="flex gap-2 mt-1">
                      <span className="text-xs" style={{ color: '#c9a84c88' }}>情绪: {npc.emotion}</span>
                    </div>
                    <div className="text-xs mt-0.5" style={{ color: npc.attitude?.includes('敌') ? '#8b1a1a' : '#4a7c59' }}>
                      态度: {npc.attitude}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* World Events */}
          <div className="p-4">
            <h3 className="lzwd-gold text-xs font-semibold tracking-widest mb-3 uppercase">天下大事</h3>
            {worldEvents.length === 0 ? (
              <p className="lzwd-muted text-xs opacity-60">尚无记录</p>
            ) : (
              <div className="space-y-2">
                {worldEvents.map((ev, i) => (
                  <div key={i} className="lzwd-event-item">
                    <span style={{ color: '#8b1a1a' }}>{ev.year}年</span>
                    <span className="ml-1">{ev.text}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>

        {/* Main Game Area */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {/* Narrative area */}
          <div className="flex-1 overflow-y-auto lzwd-scroll p-6 space-y-4">
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
                    <div
                      className="px-4 py-2 rounded-lg text-sm"
                      style={{ background: '#2a1f0e', border: '1px solid #3d2e1a', color: '#e8d5a3' }}
                    >
                      {msg.content}
                    </div>
                  </div>
                )}
              </div>
            ))}

            {/* Streaming message */}
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

          {/* Input area */}
          <div className="flex-shrink-0 p-4 border-t" style={{ borderColor: '#3d2e1a', background: '#16110a' }}>
            <div className="flex gap-3 items-end">
              <textarea
                ref={inputRef}
                className="lzwd-input flex-1 px-4 py-3 rounded-lg text-sm"
                style={{ minHeight: '80px', maxHeight: '160px' }}
                placeholder="描述你的行动或言语... (Ctrl+Enter 发送)"
                value={playerInput}
                onChange={e => setPlayerInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isStreaming}
              />
              <button
                onClick={sendMessage}
                disabled={isStreaming || !playerInput.trim()}
                className="lzwd-btn-gold px-6 py-3 rounded-lg text-sm tracking-wider disabled:opacity-40"
                style={{ minWidth: '80px', height: '80px' }}
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
            <p className="lzwd-muted text-xs mt-2 text-center opacity-50">
              Ctrl+Enter 发送 · 描述你的行动、言语或意图
            </p>
          </div>
        </main>
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