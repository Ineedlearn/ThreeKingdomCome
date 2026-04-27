import { createClient } from '@metagptx/web-sdk';

export const client = createClient();

// GM system prompt (frontend version — mirrors backend for streaming)
export const GM_SYSTEM_PROMPT = `你是《乱世微尘》的游戏主持人（GM）。背景设定于汉末乱世（公元184-220年）。

【世界观与核心基调】
乱世之下小人物的悲凉与坚韧，活命本身就是英雄主义。玩家不是刘备、曹操，而是被随机投放到乱世某地的普通人——大概率是农夫、流民、小贩这样的底层百姓。

【资源系统】
游戏有五种核心资源，每次行动后必须更新：
- 粮食：最重要的生存资源，每天消耗，队伍越大消耗越多
- 钱财：交易、修补、迁徙、应急
- 健康：疾病、受伤、寒冷、饥饿都会影响
- 体力：决定能干多少活、走多远，休息可恢复
- 精神：长期饥饿、战乱、死亡和恐惧会让人崩溃

每次叙事结束时，在文末附上资源变化JSON：
[RESOURCES]{"food_delta":-2,"money_delta":0,"health_delta":0,"stamina_delta":-3,"morale_delta":-1}[/RESOURCES]
数值范围-15到+15，必须符合行动逻辑。

【伙伴系统】
玩家最多带3个伙伴。伙伴也要消耗粮食，也会害怕，也可能因玩家的选择而失望离队。
如有伙伴互动，附上：
[COMPANIONS]{"updates":[{"name":"伙伴名","emotion":"情绪","loyalty_delta":0,"note":"简短说明"}]}[/COMPANIONS]

【NPC系统】
叙事后附上NPC数据：
[NPC_DATA][{"name":"姓名","profession":"职业","emotion":"情绪","hidden_goal":"隐藏目标","attitude":"对玩家态度"}][/NPC_DATA]

【历史事件】
如有重大历史事件，附上：
[WORLD_EVENT]{"year":184,"event":"事件描述"}[/WORLD_EVENT]

【行动裁定】
采用"描述-意图-结果"三段式，偏向拟真而非戏剧化。小人物不能凭一己之力扭转大势，成功往往伴随代价。

【叙事风格】
参考《三国志》简洁克制，借《三国演义》生动描写塑造场景氛围。使用符合汉代语境的称谓，保持现代可读性。每次叙事以开放式情境收束，留给玩家选择空间。每次回复控制在400字以内。

【严格禁止】
让玩家轻松成为历史名将义弟/军师；杜撰历史人物私密言论；为爽感破坏历史走向；主动提供最优解；使用"经验值""升级""技能点"等现代游戏化语言。`;

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface NPC {
  name: string;
  profession: string;
  emotion: string;
  hidden_goal: string;
  attitude: string;
}

export interface Companion {
  name: string;
  gender: string;
  profession: string;
  age?: number;
  personality?: string;
  loyalty: number;
  emotion: string;
  note: string;
}

export interface Resources {
  food: number;
  money: number;
  health: number;
  stamina: number;
  morale: number;
}

export interface ResourceDelta {
  food_delta: number;
  money_delta: number;
  health_delta: number;
  stamina_delta: number;
  morale_delta: number;
}

export interface WorldEvent {
  year: number;
  event: string;
}

export interface GameCharacter {
  id: number;
  name: string;
  gender: string;
  identity: string;
  birthplace: string;
  current_year: number;
  reputation: string;
  relations: string;
  situation: string;
  is_alive: boolean;
  death_story: string;
  play_count: number;
}

export const DEFAULT_RESOURCES: Resources = {
  food: 50,
  money: 30,
  health: 75,
  stamina: 75,
  morale: 50,
};

export function buildGMMessages(
  history: ChatMessage[],
  playerInput: string
): ChatMessage[] {
  return [
    { role: 'system', content: GM_SYSTEM_PROMPT },
    ...history.slice(-20),
    { role: 'user', content: playerInput },
  ];
}

export function parseNPCData(text: string): NPC[] {
  const match = text.match(/\[NPC_DATA\]([\s\S]*?)\[\/NPC_DATA\]/);
  if (!match) return [];
  try { return JSON.parse(match[1].trim()); } catch { return []; }
}

export function parseResourceDelta(text: string): ResourceDelta | null {
  const match = text.match(/\[RESOURCES\]([\s\S]*?)\[\/RESOURCES\]/);
  if (!match) return null;
  try { return JSON.parse(match[1].trim()); } catch { return null; }
}

export function parseCompanionUpdates(text: string): Array<{name:string;emotion:string;loyalty_delta:number;note:string}> {
  const match = text.match(/\[COMPANIONS\]([\s\S]*?)\[\/COMPANIONS\]/);
  if (!match) return [];
  try {
    const data = JSON.parse(match[1].trim());
    return data.updates || [];
  } catch { return []; }
}

export function parseWorldEvent(text: string): WorldEvent | null {
  const match = text.match(/\[WORLD_EVENT\]([\s\S]*?)\[\/WORLD_EVENT\]/);
  if (!match) return null;
  try { return JSON.parse(match[1].trim()); } catch { return null; }
}

export function cleanNarrativeText(text: string): string {
  return text
    .replace(/\[NPC_DATA\][\s\S]*?\[\/NPC_DATA\]/g, '')
    .replace(/\[RESOURCES\][\s\S]*?\[\/RESOURCES\]/g, '')
    .replace(/\[COMPANIONS\][\s\S]*?\[\/COMPANIONS\]/g, '')
    .replace(/\[WORLD_EVENT\][\s\S]*?\[\/WORLD_EVENT\]/g, '')
    .trim();
}

export function detectDeath(text: string): boolean {
  const deathKeywords = [
    '你死了', '命丧', '气绝', '身死', '魂归', '一命呜呼',
    '你已死去', '你倒下了', '你的生命走到了尽头', '就此离世',
    '含恨而终', '撒手人寰', '驾鹤西去', '你永远闭上了眼睛',
  ];
  return deathKeywords.some(kw => text.includes(kw));
}

export function applyResourceDelta(res: Resources, delta: ResourceDelta): Resources {
  return {
    food: Math.max(0, Math.min(100, res.food + (delta.food_delta || 0))),
    money: Math.max(0, Math.min(100, res.money + (delta.money_delta || 0))),
    health: Math.max(0, Math.min(100, res.health + (delta.health_delta || 0))),
    stamina: Math.max(0, Math.min(100, res.stamina + (delta.stamina_delta || 0))),
    morale: Math.max(0, Math.min(100, res.morale + (delta.morale_delta || 0))),
  };
}

export function getResourceColor(value: number): string {
  if (value >= 60) return '#4a7c59';
  if (value >= 30) return '#c9a84c';
  return '#8b1a1a';
}

export function getSituationClass(situation: string): string {
  if (situation === '危险') return 'lzwd-badge-danger';
  if (situation === '亡命') return 'lzwd-badge-flee';
  return 'lzwd-badge-safe';
}

export function getSituationLabel(situation: string): string {
  return situation || '安全';
}

export const QUICK_ACTIONS = [
  '四处打探消息',
  '寻找食物和水源',
  '找个安全的地方休息',
  '观察周围的人',
  '询问近况与局势',
  '尝试找活计换口饭',
  '准备离开此地',
  '打听前往他处的路',
];