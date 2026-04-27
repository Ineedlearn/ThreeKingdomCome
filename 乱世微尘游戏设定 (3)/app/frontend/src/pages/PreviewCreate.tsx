/**
 * Preview-only page for CheckUI validation of the character creation UI.
 * Shows the create form and the fate animation side by side.
 */
import { useState, useEffect } from 'react';

const FATE_STEPS = [
  { icon: '🎲', text: '命运之轮转动中...' },
  { icon: '📍', text: '投放出生之地...' },
  { icon: '⚔️', text: '确定身份与技能...' },
  { icon: '🌾', text: '分配初始资源...' },
  { icon: '👥', text: '安排随行之人...' },
  { icon: '📜', text: '载入历史事件...' },
  { icon: '✨', text: '开场场景生成中...' },
];

const IDENTITY_PREVIEW = ['农夫', '流民', '游侠', '游商', '寒士', '医者', '工匠', '小贩', '逃兵', '佃农', '方士弟子', '老兵'];
const LOCATION_PREVIEW = ['兖州·陈留', '徐州·下邳', '荆州·南阳', '益州·巴郡', '冀州·魏郡', '扬州·吴郡', '幽州·涿郡', '凉州·武威'];

export default function PreviewCreate() {
  const [name, setName] = useState('陈平');
  const [gender, setGender] = useState('男');
  const [fateStep, setFateStep] = useState(3);
  const [slotIdx, setSlotIdx] = useState(0);
  const [locIdx, setLocIdx] = useState(0);

  useEffect(() => {
    const t = setInterval(() => {
      setSlotIdx(p => (p + 1) % IDENTITY_PREVIEW.length);
      setLocIdx(p => (p + 1) % LOCATION_PREVIEW.length);
    }, 120);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="lzwd-bg min-h-screen px-4 py-8">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="lzwd-title text-4xl mb-2">乱世微尘</h1>
          <p className="lzwd-muted tracking-widest text-sm">汉末乱世 · 小人物的史诗</p>
          <hr className="lzwd-divider mt-4" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Left: Create Form */}
          <div className="lzwd-card rounded-lg p-8">
            <div className="flex items-center gap-4 mb-6">
              <span className="lzwd-muted text-sm">← 返回</span>
              <h2 className="lzwd-gold text-xl" style={{ fontFamily: 'Noto Serif SC, serif' }}>踏入乱世</h2>
            </div>

            {/* Big random badge */}
            <div className="rounded-lg p-5 mb-6 text-center"
              style={{ background: 'linear-gradient(135deg,#2a1a08,#1a1008)', border: '1px solid #c9a84c66' }}>
              <div className="text-4xl mb-2">🎲</div>
              <p className="lzwd-gold text-base font-semibold tracking-wider mb-1"
                style={{ fontFamily: 'Noto Serif SC, serif' }}>
                命运全随机
              </p>
              <p className="lzwd-muted text-xs leading-relaxed opacity-80">
                身份 · 出生地 · 初始资源 · 历史事件 · 随行伙伴
              </p>
              <p className="lzwd-muted text-xs opacity-50 mt-1">一切皆由命运决定，你无从选择</p>

              <div className="flex justify-center gap-4 mt-4">
                {[
                  { label: '身份', val: '？？？' },
                  { label: '出生地', val: '？？？' },
                  { label: '伙伴', val: '？？？' },
                ].map(item => (
                  <div key={item.label} className="px-3 py-1.5 rounded text-xs"
                    style={{ background: '#1a1208', border: '1px solid #3d2e1a' }}>
                    <span className="lzwd-muted opacity-50 block text-xs mb-0.5">{item.label}</span>
                    <span className="lzwd-gold font-semibold">{item.val}</span>
                  </div>
                ))}
              </div>
            </div>

            <hr className="lzwd-divider" />

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
                />
                <button className="lzwd-btn-ghost px-4 py-3 rounded text-sm">🎲</button>
              </div>
            </div>

            <div className="mb-7">
              <label className="lzwd-muted text-sm block mb-2">性别</label>
              <div className="flex gap-3">
                {['男', '女'].map(g => (
                  <button key={g} onClick={() => setGender(g)}
                    className={`flex-1 py-2.5 rounded border transition-all text-sm ${
                      gender === g
                        ? 'border-yellow-500 bg-yellow-900/30 lzwd-gold'
                        : 'border-gray-700 lzwd-muted'
                    }`}>
                    {g}
                  </button>
                ))}
              </div>
            </div>

            <button className="lzwd-btn-gold w-full py-4 rounded text-base tracking-widest"
              style={{ fontSize: '1.05rem' }}>
              🎲 &nbsp;让命运决定一切，踏入乱世
            </button>
          </div>

          {/* Right: Fate Animation */}
          <div className="lzwd-card rounded-lg p-10 text-center">
            <div className="mb-8">
              <div className="text-6xl mb-4" style={{ animation: 'spin 1.2s linear infinite' }}>☯</div>
              <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
              <h2 className="lzwd-title text-2xl mb-1">命运之轮</h2>
              <p className="lzwd-muted text-sm opacity-70">正在为 {name} 决定命运...</p>
            </div>

            {/* Slot machine */}
            <div className="flex justify-center gap-3 mb-8">
              <div className="rounded-lg overflow-hidden"
                style={{ background: '#16110a', border: '1px solid #c9a84c55', width: '100px' }}>
                <div className="py-1 text-xs lzwd-muted text-center"
                  style={{ background: '#2a1a08', borderBottom: '1px solid #3d2e1a' }}>身份</div>
                <div className="py-3 text-center lzwd-gold text-sm font-semibold" style={{ minHeight: '44px' }}>
                  {IDENTITY_PREVIEW[slotIdx]}
                </div>
              </div>
              <div className="rounded-lg overflow-hidden"
                style={{ background: '#16110a', border: '1px solid #c9a84c55', width: '120px' }}>
                <div className="py-1 text-xs lzwd-muted text-center"
                  style={{ background: '#2a1a08', borderBottom: '1px solid #3d2e1a' }}>出生地</div>
                <div className="py-3 text-center lzwd-gold text-xs font-semibold px-1" style={{ minHeight: '44px' }}>
                  {LOCATION_PREVIEW[locIdx]}
                </div>
              </div>
              <div className="rounded-lg overflow-hidden"
                style={{ background: '#16110a', border: '1px solid #c9a84c55', width: '80px' }}>
                <div className="py-1 text-xs lzwd-muted text-center"
                  style={{ background: '#2a1a08', borderBottom: '1px solid #3d2e1a' }}>伙伴</div>
                <div className="py-3 text-center lzwd-gold text-sm font-semibold" style={{ minHeight: '44px' }}>
                  ？？？
                </div>
              </div>
            </div>

            {/* Progress steps */}
            <div className="space-y-2 max-w-xs mx-auto">
              {FATE_STEPS.map((step, i) => (
                <div key={i}
                  className={`flex items-center gap-3 px-4 py-2 rounded transition-all ${
                    i < fateStep ? 'opacity-40' : i === fateStep ? 'opacity-100' : 'opacity-20'
                  }`}
                  style={{
                    background: i === fateStep ? '#2a1a08' : 'transparent',
                    border: i === fateStep ? '1px solid #c9a84c44' : '1px solid transparent',
                  }}>
                  <span className="text-lg">{step.icon}</span>
                  <span className={`text-sm ${i === fateStep ? 'lzwd-gold' : 'lzwd-muted'}`}>{step.text}</span>
                  {i < fateStep && <span className="ml-auto text-xs" style={{ color: '#4a7c59' }}>✓</span>}
                  {i === fateStep && <span className="ml-auto lzwd-cursor" />}
                </div>
              ))}
            </div>
            <p className="lzwd-muted text-xs mt-6 opacity-40">乱世不等人，请稍候...</p>
          </div>
        </div>
      </div>
    </div>
  );
}