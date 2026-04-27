import { createClient } from '@metagptx/web-sdk';

export const client = createClient();

export const GM_SYSTEM_PROMPT = `你是《乱世微尘》的游戏主持人（GM）。背景设定于汉末乱世（公元184-220年）。
核心基调：乱世之下小人物的悲凉与坚韧，活命本身就是英雄主义。
历史准确性：遵循《三国志》及《三国演义》，不杜撰历史人物私密言论，不破坏历史事件走向。
NPC规则：每个NPC具备身份层（姓名、年龄、职业、性格）、记忆层（与玩家的交互历史）、目标层（短期/长期目标）、反应层（符合性格与处境的反应）。
行动裁定：采用"描述-意图-结果"三段式，偏向拟真而非戏剧化。小人物不能凭一己之力扭转大势，成功往往伴随代价。
叙事风格：参考《三国志》简洁克制，借《三国演义》生动描写塑造场景氛围。使用符合汉代语境的称谓，保持现代可读性。每次叙事以开放式情境收束，留给玩家选择空间。
禁止：让玩家轻松成为历史名将义弟/军师；杜撰历史人物私密言论；为爽感破坏历史走向；主动提供最优解；使用"经验值"等现代游戏化语言。
回复格式：纯叙事文本，可用【】标注重要信息，每次回复控制在400字以内。`;

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

export function buildGMMessages(
  history: ChatMessage[],
  playerInput: string
): ChatMessage[] {
  const messages: ChatMessage[] = [
    { role: 'system', content: GM_SYSTEM_PROMPT },
    ...history.slice(-20), // keep last 20 messages to avoid token overflow
    { role: 'user', content: playerInput },
  ];
  return messages;
}

export function parseNPCData(text: string): NPC[] {
  const match = text.match(/\[NPC_DATA\]([\s\S]*?)\[\/NPC_DATA\]/);
  if (!match) return [];
  try {
    return JSON.parse(match[1].trim());
  } catch {
    return [];
  }
}

export function cleanNarrativeText(text: string): string {
  return text.replace(/\[NPC_DATA\][\s\S]*?\[\/NPC_DATA\]/g, '').trim();
}

export function detectDeath(text: string): boolean {
  const deathKeywords = [
    '你死了', '命丧', '气绝', '身死', '魂归', '一命呜呼',
    '你已死去', '你倒下了', '你的生命走到了尽头', '就此离世',
    '含恨而终', '撒手人寰', '驾鹤西去', '你永远闭上了眼睛',
  ];
  return deathKeywords.some(kw => text.includes(kw));
}

export function getSituationClass(situation: string): string {
  if (situation === '危险') return 'lzwd-badge-danger';
  if (situation === '亡命') return 'lzwd-badge-flee';
  return 'lzwd-badge-safe';
}

export function getSituationLabel(situation: string): string {
  return situation || '安全';
}