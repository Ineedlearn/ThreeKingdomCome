import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { client, GameCharacter, DEFAULT_RESOURCES } from '@/lib/gameClient';
import { useToast } from '@/hooks/use-toast';

const MALE_NAMES = ['陈平', '王虎', '李安', '赵勇', '刘明', '孙武', '张义', '韩信', '魏强', '周仁', '徐达', '吴勇', '冯恩', '杨顺', '许田'];
const FEMALE_NAMES = ['陈月', '王芳', '李秀', '赵燕', '刘云', '孙英', '张梅', '韩玉', '魏兰', '周莲', '徐娟', '吴莺', '冯燕', '杨柳', '许娘'];

// Fate reveal steps shown during creation
const FATE_STEPS = [
  { icon: '🎲', text: '命运之轮转动中...' },
  { icon: '📍', text: '投放出生之地...' },
  { icon: '⚔️', text: '确定身份与技能...' },
  { icon: '🌾', text: '分配初始资源...' },
  { icon: '👥', text: '安排随行之人...' },
  { icon: '📜', text: '载入历史事件...' },
  { icon: '✨', text: '开场场景生成中...' },
];

// Preview pool shown in the spinning wheel (just for visual effect)
const IDENTITY_PREVIEW = ['农夫', '流民', '游侠', '游商', '寒士', '医者', '工匠', '小贩', '逃兵', '佃农', '方士弟子', '老兵'];
const LOCATION_PREVIEW = ['兖州·陈留', '徐州·下邳', '荆州·南阳', '益州·巴郡', '冀州·魏郡', '扬州·吴郡', '幽州·涿郡', '凉州·武威', '豫州·颍川', '青州·北海'];

export default function Index() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [characters, setCharacters] = useState<GameCharacter[]>([]);
  const [view, setView] = useState<'list' | 'create'>('list');

  const [name, setName] = useState('');
  const [gender, setGender] = useState('男');
  const [creating, setCreating] = useState(false);
  const [fateStep, setFateStep] = useState(0);

  // Slot machine state
  const [slotIdentity, setSlotIdentity] = useState(0);
  const [slotLocation, setSlotLocation] = useState(0);
  const [slotSpinning, setSlotSpinning] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await client.auth.me();
        if (res?.data) {
          setUser(res.data);
          await loadCharacters();
        }
      } catch { /* not logged in */ }
      finally { setLoading(false); }
    })();
  }, []);

  // Slot machine spin effect
  useEffect(() => {
    if (!slotSpinning) return;
    let i = 0;
    const interval = setInterval(() => {
      setSlotIdentity(prev => (prev + 1) % IDENTITY_PREVIEW.length);
      setSlotLocation(prev => (prev + 1) % LOCATION_PREVIEW.length);
      i++;
      if (i > 30) clearInterval(interval);
    }, 80);
    return () => clearInterval(interval);
  }, [slotSpinning]);

  async function loadCharacters() {
    try {
      const res = await client.entities.characters.query({ query: {}, sort: '-created_at', limit: 20 });
      setCharacters((res?.data?.items || []) as GameCharacter[]);
    } catch { setCharacters([]); }
  }

  function randomName() {
    const pool = gender === '男' ? MALE_NAMES : FEMALE_NAMES;
    setName(pool[Math.floor(Math.random() * pool.length)]);
  }

  async function handleContinueGame(char: GameCharacter) {
    localStorage.setItem('lzwd_current_char', JSON.stringify(char));
    localStorage.removeItem('lzwd_opening');
    navigate('/game');
  }

  async function handleCreateCharacter() {
    if (!name.trim()) {
      toast({ title: '请输入角色名字', variant: 'destructive' });
      return;
    }
    setCreating(true);
    setFateStep(0);
    setSlotSpinning(true);

    // Animate through fate steps
    let step = 0;
    const stepInterval = setInterval(() => {
      step++;
      if (step < FATE_STEPS.length) setFateStep(step);
      else clearInterval(stepInterval);
    }, 800);

    try {
      const createRes = await client.entities.characters.create({
        data: {
          name: name.trim(),
          gender,
          identity: '待定',
          birthplace: '待定',
          current_year: 184,
          is_alive: true,
          situation: '安全',
          play_count: 1,
          reputation: '无名之辈',
          relations: '[]',
          world_events: '[]',
          resources: JSON.stringify(DEFAULT_RESOURCES),
          companions: '[]',
        },
      });
      const char = createRes?.data as GameCharacter;
      if (!char?.id) throw new Error('创建角色失败');

      const openRes = await client.apiCall.invoke({
        url: '/api/v1/gm/start_game',
        method: 'POST',
        data: { character_id: char.id, name: char.name, gender: char.gender },
      });

      clearInterval(stepInterval);
      setSlotSpinning(false);

      const openingData = openRes?.data || {};
      const updatedChar: GameCharacter = {
        ...char,
        identity: openingData.identity || char.identity,
        birthplace: openingData.birthplace || char.birthplace,
      };

      localStorage.setItem('lzwd_current_char', JSON.stringify(updatedChar));
      localStorage.setItem('lzwd_opening', JSON.stringify(openingData));
      navigate('/game');
    } catch (e: any) {
      clearInterval(stepInterval);
      setSlotSpinning(false);
      toast({ title: '创建失败', description: e?.message || '请稍后重试', variant: 'destructive' });
      setCreating(false);
    }
  }

  if (loading) {
    return (
      <div className="lzwd-bg flex items-center justify-center min-h-screen">
        <div className="lzwd-title text-3xl animate-pulse">乱世微尘</div>
      </div>
    );
  }

  // ── Not logged in ──
  if (!user) {
    return (
      <div className="lzwd-bg flex flex-col items-center justify-center min-h-screen gap-8 px-4">
        <div className="text-center">
          <h1 className="lzwd-title text-5xl mb-3">乱世微尘</h1>
          <p className="lzwd-muted text-lg tracking-widest">汉末乱世 · 小人物的史诗</p>
        </div>
        <hr className="lzwd-divider w-64" />
        <div className="max-w-lg text-center space-y-3">
          <p className="lzwd-text leading-relaxed opacity-80">
            黄巾起义，天下大乱。<br />
            你不是英雄，不是谋士，<br />
            只是这乱世中一粒微尘。
          </p>
          <p className="lzwd-muted text-sm opacity-60 mt-2">活下去，便是你的使命。</p>
          <div className="flex flex-wrap gap-4 justify-center text-xs lzwd-muted mt-4 opacity-60">
            <span>🎲 随机出生</span>
            <span>🌾 粮食生存</span>
            <span>👥 伙伴同行</span>
            <span>📜 历史事件</span>
            <span>⚔️ 乱世抉择</span>
          </div>
        </div>
        <button onClick={() => client.auth.toLogin()} className="lzwd-btn-gold px-10 py-3 rounded text-lg tracking-widest">
          登录 · 入世
        </button>
      </div>
    );
  }

  // ── Logged in ──
  return (
    <div className="lzwd-bg min-h-screen px-4 py-8">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="lzwd-title text-4xl mb-2">乱世微尘</h1>
          <p className="lzwd-muted tracking-widest text-sm">汉末乱世 · 小人物的史诗</p>
          <hr className="lzwd-divider mt-4" />
        </div>

        {/* ── Character List ── */}
        {view === 'list' && (
          <div>
            <div className="flex justify-between items-center mb-6">
              <h2 className="lzwd-gold text-xl font-semibold" style={{ fontFamily: 'Noto Serif SC, serif' }}>
                我的角色
              </h2>
              <button onClick={() => setView('create')} className="lzwd-btn-gold px-6 py-2 rounded text-sm tracking-wider">
                + 新建角色
              </button>
            </div>

            {characters.length === 0 ? (
              <div className="lzwd-card rounded-lg p-12 text-center">
                <div className="text-5xl mb-4">🎲</div>
                <p className="lzwd-gold text-lg mb-2" style={{ fontFamily: 'Noto Serif SC, serif' }}>命运未定</p>
                <p className="lzwd-muted text-sm opacity-60 mb-6">你的出身、身份、所在之地——一切皆由命运决定。</p>
                <button onClick={() => setView('create')} className="lzwd-btn-gold px-8 py-2 rounded tracking-wider">
                  踏入乱世
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {characters.map(char => (
                  <div key={char.id} className="lzwd-card rounded-lg p-5 transition-all duration-200">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <span className="lzwd-title text-xl">{char.name}</span>
                        <span className="lzwd-muted text-sm ml-2">{char.gender}</span>
                      </div>
                      <span className={`text-xs px-2 py-1 rounded-full ${
                        char.is_alive
                          ? char.situation === '危险' ? 'lzwd-badge-danger'
                          : char.situation === '亡命' ? 'lzwd-badge-flee'
                          : 'lzwd-badge-safe'
                          : 'lzwd-badge-flee'
                      }`}>
                        {char.is_alive ? char.situation || '安全' : '已故'}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-3 text-xs lzwd-muted mb-4">
                      {char.identity && char.identity !== '待定' && <span>⚔ {char.identity}</span>}
                      {char.birthplace && char.birthplace !== '待定' && <span>📍 {char.birthplace}</span>}
                      <span>📅 {char.current_year || 184}年</span>
                      <span>🏆 {char.reputation || '无名之辈'}</span>
                    </div>
                    {char.is_alive ? (
                      <button onClick={() => handleContinueGame(char)}
                        className="lzwd-btn-gold w-full py-2 rounded text-sm tracking-wider">
                        继续游戏
                      </button>
                    ) : (
                      <div className="text-center">
                        {char.death_story && (
                          <p className="lzwd-red text-xs mb-2 opacity-80 line-clamp-2">{char.death_story.slice(0, 60)}...</p>
                        )}
                        <span className="lzwd-muted text-xs">此角色已故，可新建角色重入乱世</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Create Character ── */}
        {view === 'create' && (
          <div className="max-w-lg mx-auto">
            {!creating ? (
              /* === Normal form === */
              <div className="lzwd-card rounded-lg p-8">
                <div className="flex items-center gap-4 mb-6">
                  <button onClick={() => setView('list')}
                    className="lzwd-muted hover:text-yellow-400 text-sm transition-colors">← 返回</button>
                  <h2 className="lzwd-gold text-xl" style={{ fontFamily: 'Noto Serif SC, serif' }}>踏入乱世</h2>
                </div>

                {/* Big random badge */}
                <div className="rounded-lg p-5 mb-6 text-center"
                  style={{ background: 'linear-gradient(135deg,#2a1a08,#1a1008)', border: '1px solid #c9a84c44' }}>
                  <div className="text-4xl mb-2">🎲</div>
                  <p className="lzwd-gold text-base font-semibold tracking-wider mb-1" style={{ fontFamily: 'Noto Serif SC, serif' }}>
                    命运全随机
                  </p>
                  <p className="lzwd-muted text-xs leading-relaxed opacity-80">
                    身份 · 出生地 · 初始资源 · 历史事件 · 随行伙伴
                  </p>
                  <p className="lzwd-muted text-xs opacity-50 mt-1">一切皆由命运决定，你无从选择</p>

                  {/* Mini slot preview */}
                  <div className="flex justify-center gap-4 mt-4">
                    <div className="px-3 py-1.5 rounded text-xs" style={{ background: '#1a1208', border: '1px solid #3d2e1a' }}>
                      <span className="lzwd-muted opacity-50 block text-xs mb-0.5">身份</span>
                      <span className="lzwd-gold">？？？</span>
                    </div>
                    <div className="px-3 py-1.5 rounded text-xs" style={{ background: '#1a1208', border: '1px solid #3d2e1a' }}>
                      <span className="lzwd-muted opacity-50 block text-xs mb-0.5">出生地</span>
                      <span className="lzwd-gold">？？？</span>
                    </div>
                    <div className="px-3 py-1.5 rounded text-xs" style={{ background: '#1a1208', border: '1px solid #3d2e1a' }}>
                      <span className="lzwd-muted opacity-50 block text-xs mb-0.5">伙伴</span>
                      <span className="lzwd-gold">？？？</span>
                    </div>
                  </div>
                </div>

                <hr className="lzwd-divider" />

                {/* Only input: name */}
                <div className="mt-5 mb-4">
                  <label className="lzwd-muted text-sm block mb-2">
                    你的名字 <span className="opacity-50 text-xs">（唯一可以自己决定的事）</span>
                  </label>
                  <div className="flex gap-3">
                    <input
                      className="lzwd-input flex-1 px-4 py-3 rounded text-base"
                      placeholder="起一个汉代风格的名字..."
                      value={name}
                      onChange={e => setName(e.target.value)}
                      maxLength={8}
                      onKeyDown={e => e.key === 'Enter' && handleCreateCharacter()}
                    />
                    <button onClick={randomName} className="lzwd-btn-ghost px-4 py-3 rounded text-sm" title="随机名字">
                      🎲
                    </button>
                  </div>
                </div>

                {/* Gender */}
                <div className="mb-7">
                  <label className="lzwd-muted text-sm block mb-2">性别</label>
                  <div className="flex gap-3">
                    {['男', '女'].map(g => (
                      <button key={g} onClick={() => setGender(g)}
                        className={`flex-1 py-2.5 rounded border transition-all text-sm ${
                          gender === g
                            ? 'border-yellow-500 bg-yellow-900/30 lzwd-gold'
                            : 'border-gray-700 lzwd-muted hover:border-yellow-700'
                        }`}>
                        {g}
                      </button>
                    ))}
                  </div>
                </div>

                <button onClick={handleCreateCharacter}
                  className="lzwd-btn-gold w-full py-4 rounded text-base tracking-widest"
                  style={{ fontSize: '1.05rem' }}>
                  🎲 &nbsp;让命运决定一切，踏入乱世
                </button>
              </div>
            ) : (
              /* === Fate reveal animation === */
              <div className="lzwd-card rounded-lg p-10 text-center">
                {/* Spinning wheel */}
                <div className="relative mb-8">
                  <div className="text-6xl mb-4" style={{ animation: 'spin 1s linear infinite' }}>☯</div>
                  <style>{`@keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }`}</style>
                  <h2 className="lzwd-title text-2xl mb-1">命运之轮</h2>
                  <p className="lzwd-muted text-sm opacity-70">正在为 {name} 决定命运...</p>
                </div>

                {/* Slot machine */}
                <div className="flex justify-center gap-4 mb-8">
                  <div className="rounded-lg overflow-hidden" style={{ background: '#16110a', border: '1px solid #c9a84c44', width: '110px' }}>
                    <div className="py-1 text-xs lzwd-muted text-center" style={{ background: '#2a1a08', borderBottom: '1px solid #3d2e1a' }}>身份</div>
                    <div className="py-3 text-center lzwd-gold text-sm font-semibold"
                      style={{ minHeight: '44px', transition: slotSpinning ? 'none' : 'all 0.3s' }}>
                      {slotSpinning ? IDENTITY_PREVIEW[slotIdentity] : '？？？'}
                    </div>
                  </div>
                  <div className="rounded-lg overflow-hidden" style={{ background: '#16110a', border: '1px solid #c9a84c44', width: '130px' }}>
                    <div className="py-1 text-xs lzwd-muted text-center" style={{ background: '#2a1a08', borderBottom: '1px solid #3d2e1a' }}>出生地</div>
                    <div className="py-3 text-center lzwd-gold text-xs font-semibold px-2"
                      style={{ minHeight: '44px', transition: slotSpinning ? 'none' : 'all 0.3s' }}>
                      {slotSpinning ? LOCATION_PREVIEW[slotLocation] : '？？？'}
                    </div>
                  </div>
                  <div className="rounded-lg overflow-hidden" style={{ background: '#16110a', border: '1px solid #c9a84c44', width: '90px' }}>
                    <div className="py-1 text-xs lzwd-muted text-center" style={{ background: '#2a1a08', borderBottom: '1px solid #3d2e1a' }}>伙伴</div>
                    <div className="py-3 text-center lzwd-gold text-sm font-semibold"
                      style={{ minHeight: '44px' }}>
                      ？？？
                    </div>
                  </div>
                </div>

                {/* Progress steps */}
                <div className="space-y-2 max-w-xs mx-auto">
                  {FATE_STEPS.map((step, i) => (
                    <div key={i} className={`flex items-center gap-3 px-4 py-2 rounded transition-all duration-500 ${
                      i < fateStep
                        ? 'opacity-40'
                        : i === fateStep
                        ? 'opacity-100'
                        : 'opacity-20'
                    }`}
                      style={{
                        background: i === fateStep ? '#2a1a08' : 'transparent',
                        border: i === fateStep ? '1px solid #c9a84c44' : '1px solid transparent',
                      }}>
                      <span className="text-lg">{step.icon}</span>
                      <span className={`text-sm ${i === fateStep ? 'lzwd-gold' : 'lzwd-muted'}`}>
                        {step.text}
                      </span>
                      {i < fateStep && <span className="ml-auto text-xs" style={{ color: '#4a7c59' }}>✓</span>}
                      {i === fateStep && (
                        <span className="ml-auto">
                          <span className="lzwd-cursor" />
                        </span>
                      )}
                    </div>
                  ))}
                </div>

                <p className="lzwd-muted text-xs mt-6 opacity-40">乱世不等人，请稍候...</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}