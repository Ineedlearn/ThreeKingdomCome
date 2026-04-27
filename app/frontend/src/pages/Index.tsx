import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { client, GameCharacter } from '@/lib/gameClient';
import { useToast } from '@/hooks/use-toast';

const IDENTITIES = [
  {
    key: '游侠',
    label: '游侠·落魄武人',
    desc: '曾习武艺，流落江湖。刀口舔血，命如草芥。',
    icon: '⚔️',
  },
  {
    key: '游商',
    label: '游商·行脚商人',
    desc: '走南闯北，见多识广。财帛动人心，乱世险中求。',
    icon: '🏮',
  },
  {
    key: '寒士',
    label: '寒士·落第书生',
    desc: '满腹经纶，怀才不遇。笔墨难敌乱世，且看如何自处。',
    icon: '📜',
  },
];

const BIRTHPLACES = [
  { key: '兖州·陈留', desc: '中原腹地，四战之地，曹操起兵之所。' },
  { key: '徐州·下邳', desc: '富庶之地，兵家必争，吕布曾据此称雄。' },
  { key: '荆州·襄阳', desc: '南北要冲，诸葛躬耕，龙凤潜伏之所。' },
  { key: '益州·成都', desc: '天府之国，山川险固，偏安一隅之地。' },
  { key: '冀州·邺城', desc: '袁绍根基，北方重镇，粮草充足兵强马壮。' },
  { key: '扬州·吴郡', desc: '江东水乡，孙氏基业，偏安江南之地。' },
];

export default function Index() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [characters, setCharacters] = useState<GameCharacter[]>([]);
  const [view, setView] = useState<'list' | 'create'>('list');

  // Form state
  const [name, setName] = useState('');
  const [gender, setGender] = useState('男');
  const [identity, setIdentity] = useState('');
  const [birthplace, setBirthplace] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await client.auth.me();
        if (res?.data) {
          setUser(res.data);
          await loadCharacters();
        }
      } catch {
        // not logged in
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function loadCharacters() {
    try {
      const res = await client.entities.characters.query({
        query: {},
        sort: '-created_at',
        limit: 20,
      });
      setCharacters((res?.data?.items || []) as GameCharacter[]);
    } catch {
      setCharacters([]);
    }
  }

  async function handleContinueGame(char: GameCharacter) {
    localStorage.setItem('lzwd_current_char', JSON.stringify(char));
    localStorage.removeItem('lzwd_opening');
    navigate('/game');
  }

  async function handleCreateCharacter() {
    if (!name.trim()) { toast({ title: '请输入角色名字', variant: 'destructive' }); return; }
    if (!identity) { toast({ title: '请选择身份', variant: 'destructive' }); return; }
    if (!birthplace) { toast({ title: '请选择出生地', variant: 'destructive' }); return; }

    setCreating(true);
    try {
      // Create character
      const createRes = await client.entities.characters.create({
        data: {
          name: name.trim(),
          gender,
          identity,
          birthplace,
          current_year: 184,
          is_alive: true,
          situation: '安全',
          play_count: 1,
          reputation: '无名之辈',
          relations: '[]',
          world_events: '[]',
        },
      });
      const char = createRes?.data as GameCharacter;
      if (!char?.id) throw new Error('创建角色失败');

      // Generate opening scene
      const openRes = await client.apiCall.invoke({
        url: '/api/v1/gm/start_game',
        method: 'POST',
        data: {
          character_id: char.id,
          name: char.name,
          identity: char.identity,
          birthplace: char.birthplace,
          current_year: char.current_year || 184,
        },
      });

      localStorage.setItem('lzwd_current_char', JSON.stringify(char));
      localStorage.setItem('lzwd_opening', JSON.stringify(openRes?.data || {}));
      navigate('/game');
    } catch (e: any) {
      toast({ title: '创建失败', description: e?.message || '请稍后重试', variant: 'destructive' });
    } finally {
      setCreating(false);
    }
  }

  if (loading) {
    return (
      <div className="lzwd-bg flex items-center justify-center min-h-screen">
        <div className="lzwd-title text-2xl animate-pulse">乱世微尘</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="lzwd-bg flex flex-col items-center justify-center min-h-screen gap-8 px-4">
        <div className="text-center">
          <h1 className="lzwd-title text-5xl mb-3">乱世微尘</h1>
          <p className="lzwd-muted text-lg tracking-widest">汉末乱世·小人物的史诗</p>
        </div>
        <hr className="lzwd-divider w-64" />
        <p className="lzwd-text text-center max-w-md leading-relaxed opacity-80">
          黄巾起义，天下大乱。你不是英雄，不是谋士，只是这乱世中一粒微尘。<br />
          活下去，便是你的使命。
        </p>
        <button
          onClick={() => client.auth.toLogin()}
          className="lzwd-btn-gold px-10 py-3 rounded text-lg tracking-widest"
        >
          登录·入世
        </button>
      </div>
    );
  }

  return (
    <div className="lzwd-bg min-h-screen px-4 py-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="lzwd-title text-4xl mb-2">乱世微尘</h1>
          <p className="lzwd-muted tracking-widest text-sm">汉末乱世·小人物的史诗</p>
          <hr className="lzwd-divider mt-4" />
        </div>

        {view === 'list' && (
          <div>
            <div className="flex justify-between items-center mb-6">
              <h2 className="lzwd-gold text-xl font-semibold" style={{ fontFamily: 'Noto Serif SC, serif' }}>
                我的角色
              </h2>
              <button
                onClick={() => setView('create')}
                className="lzwd-btn-gold px-6 py-2 rounded text-sm tracking-wider"
              >
                + 新建角色
              </button>
            </div>

            {characters.length === 0 ? (
              <div className="lzwd-card rounded-lg p-12 text-center">
                <p className="lzwd-muted text-lg mb-2">尚无角色</p>
                <p className="lzwd-muted text-sm opacity-60">乱世之中，你将扮演何人？</p>
                <button
                  onClick={() => setView('create')}
                  className="lzwd-btn-gold mt-6 px-8 py-2 rounded tracking-wider"
                >
                  创建第一个角色
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {characters.map(char => (
                  <div key={char.id} className="lzwd-card rounded-lg p-5 cursor-pointer transition-all duration-200"
                    onClick={() => char.is_alive ? handleContinueGame(char) : undefined}
                  >
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <span className="lzwd-title text-xl">{char.name}</span>
                        <span className="lzwd-muted text-sm ml-2">{char.gender}</span>
                      </div>
                      <span className={`text-xs px-2 py-1 rounded-full ${char.is_alive ? 'lzwd-badge-safe' : 'lzwd-badge-flee'}`}>
                        {char.is_alive ? char.situation || '安全' : '已故'}
                      </span>
                    </div>
                    <div className="flex gap-4 text-sm lzwd-muted mb-3">
                      <span>⚔ {char.identity}</span>
                      <span>📍 {char.birthplace}</span>
                      <span>📅 {char.current_year || 184}年</span>
                    </div>
                    {char.is_alive ? (
                      <button
                        onClick={e => { e.stopPropagation(); handleContinueGame(char); }}
                        className="lzwd-btn-gold w-full py-2 rounded text-sm tracking-wider"
                      >
                        继续游戏
                      </button>
                    ) : (
                      <div className="text-center">
                        <p className="lzwd-red text-xs mb-2 line-clamp-2 opacity-80">{char.death_story?.slice(0, 60)}...</p>
                        <span className="lzwd-muted text-xs">此角色已故，可新建角色重入乱世</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {view === 'create' && (
          <div className="lzwd-card rounded-lg p-8">
            <div className="flex items-center gap-4 mb-6">
              <button onClick={() => setView('list')} className="lzwd-muted hover:text-yellow-400 text-sm">← 返回</button>
              <h2 className="lzwd-gold text-xl" style={{ fontFamily: 'Noto Serif SC, serif' }}>创建角色</h2>
            </div>

            {/* Name & Gender */}
            <div className="mb-6">
              <label className="lzwd-muted text-sm block mb-2">角色姓名</label>
              <div className="flex gap-3">
                <input
                  className="lzwd-input flex-1 px-4 py-2 rounded"
                  placeholder="起一个符合汉代风格的名字..."
                  value={name}
                  onChange={e => setName(e.target.value)}
                  maxLength={8}
                />
                <div className="flex gap-2">
                  {['男', '女'].map(g => (
                    <button
                      key={g}
                      onClick={() => setGender(g)}
                      className={`px-4 py-2 rounded border transition-all ${
                        gender === g
                          ? 'border-yellow-500 bg-yellow-900/30 lzwd-gold'
                          : 'border-gray-700 lzwd-muted hover:border-yellow-700'
                      }`}
                    >
                      {g}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Identity */}
            <div className="mb-6">
              <label className="lzwd-muted text-sm block mb-3">选择身份</label>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {IDENTITIES.map(id => (
                  <button
                    key={id.key}
                    onClick={() => setIdentity(id.key)}
                    className={`lzwd-card rounded-lg p-4 text-left transition-all duration-200 ${
                      identity === id.key ? 'border-yellow-500 bg-yellow-900/10' : ''
                    }`}
                  >
                    <div className="text-2xl mb-2">{id.icon}</div>
                    <div className="lzwd-gold text-sm font-semibold mb-1">{id.label}</div>
                    <div className="lzwd-muted text-xs leading-relaxed">{id.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Birthplace */}
            <div className="mb-8">
              <label className="lzwd-muted text-sm block mb-3">选择出生地</label>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {BIRTHPLACES.map(bp => (
                  <button
                    key={bp.key}
                    onClick={() => setBirthplace(bp.key)}
                    className={`lzwd-card rounded-lg p-3 text-left transition-all duration-200 ${
                      birthplace === bp.key ? 'border-yellow-500 bg-yellow-900/10' : ''
                    }`}
                  >
                    <div className="lzwd-gold text-sm font-semibold mb-1">{bp.key}</div>
                    <div className="lzwd-muted text-xs leading-relaxed">{bp.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            <hr className="lzwd-divider" />

            <button
              onClick={handleCreateCharacter}
              disabled={creating}
              className="lzwd-btn-gold w-full py-3 rounded text-base tracking-widest mt-4 disabled:opacity-50"
            >
              {creating ? '正在生成开场场景...' : '踏入乱世'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}