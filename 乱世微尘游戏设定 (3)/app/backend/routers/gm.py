import json
import logging
import random
import re
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc

from core.database import get_db
from dependencies.auth import get_current_user
from schemas.auth import UserResponse
from services.aihub import AIHubService
from schemas.aihub import GenTxtRequest, ChatMessage
from models.game_sessions import Game_sessions
from models.characters import Characters

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/gm", tags=["gm"])

# ============================================================
#  世界设定数据库（基于策划文档）
# ============================================================

# 身份池：大概率平民，小概率特殊身份
IDENTITY_POOL = [
    # 平民（权重高）
    {"key": "农夫", "label": "农夫", "weight": 20,
     "desc": "面朝黄土背朝天的庄稼人，黄巾之乱后家园尽毁，只能流亡。",
     "skills": ["耕种", "识路"],
     "resources": {"food": 40, "money": 15, "health": 80, "stamina": 90, "morale": 40}},
    {"key": "流民", "label": "流民", "weight": 18,
     "desc": "战乱中失去家园的普通百姓，一无所有，只剩一条命。",
     "skills": ["忍耐"],
     "resources": {"food": 25, "money": 10, "health": 65, "stamina": 70, "morale": 30}},
    {"key": "佃农", "label": "佃农", "weight": 15,
     "desc": "给豪强耕地的贫苦农民，地主跑了，田地荒了，前途未卜。",
     "skills": ["耕种", "察言观色"],
     "resources": {"food": 35, "money": 8, "health": 75, "stamina": 85, "morale": 35}},
    {"key": "工匠", "label": "工匠", "weight": 10,
     "desc": "会些手艺的匠人，乱世中手艺或许能换口饭吃。",
     "skills": ["修缮", "制造"],
     "resources": {"food": 45, "money": 35, "health": 75, "stamina": 75, "morale": 50}},
    {"key": "小贩", "label": "小贩", "weight": 8,
     "desc": "走街串巷的小商贩，见多识广，但本钱不多。",
     "skills": ["交涉", "识人"],
     "resources": {"food": 50, "money": 45, "health": 70, "stamina": 65, "morale": 55}},
    # 稍有身份（权重中）
    {"key": "游侠", "label": "游侠", "weight": 7,
     "desc": "曾习武艺，流落江湖。刀口舔血，命如草芥。",
     "skills": ["搏斗", "威慑"],
     "resources": {"food": 50, "money": 30, "health": 85, "stamina": 80, "morale": 55}},
    {"key": "游商", "label": "游商", "weight": 6,
     "desc": "走南闯北的行脚商人，见多识广，财帛动人心，乱世险中求。",
     "skills": ["交涉", "识路", "估价"],
     "resources": {"food": 65, "money": 70, "health": 70, "stamina": 65, "morale": 60}},
    {"key": "医者", "label": "游方郎中", "weight": 5,
     "desc": "懂些岐黄之术，走村串户。乱世中医者仁心，却也身不由己。",
     "skills": ["医术", "草药"],
     "resources": {"food": 55, "money": 50, "health": 90, "stamina": 65, "morale": 65}},
    {"key": "寒士", "label": "寒士", "weight": 5,
     "desc": "满腹经纶，怀才不遇。笔墨难敌乱世，且看如何自处。",
     "skills": ["读写", "谋划", "察言观色"],
     "resources": {"food": 55, "money": 45, "health": 75, "stamina": 60, "morale": 70}},
    # 稀有身份（权重低）
    {"key": "逃兵", "label": "逃兵", "weight": 3,
     "desc": "从军队中逃出的士卒，身上还有伤，官府正在追捕。",
     "skills": ["搏斗", "隐匿"],
     "resources": {"food": 30, "money": 20, "health": 55, "stamina": 70, "morale": 25}},
    {"key": "黄巾余党", "label": "黄巾余党", "weight": 2,
     "desc": "黄巾起义失败后的残余，信仰崩塌，四处流亡，随时可能被官军捕杀。",
     "skills": ["隐匿", "煽动"],
     "resources": {"food": 20, "money": 5, "health": 60, "stamina": 75, "morale": 20}},
    {"key": "方士弟子", "label": "方士弟子", "weight": 1,
     "desc": "跟随方士修行的弟子，懂些符咒之术，在乱世中或是救命稻草，或是引火烧身。",
     "skills": ["符咒", "草药", "蛊惑"],
     "resources": {"food": 40, "money": 25, "health": 70, "stamina": 60, "morale": 60}},
]

# 出生地池：覆盖主要战乱区域
BIRTHPLACE_POOL = [
    {"key": "兖州·陈留", "region": "兖州", "danger": "高",
     "desc": "中原腹地，四战之地，曹操起兵之所。黄巾肆虐，盗匪横行。",
     "events": ["黄巾之乱", "曹操募兵", "粮价飞涨"]},
    {"key": "徐州·下邳", "region": "徐州", "danger": "中",
     "desc": "富庶之地，兵家必争。陶谦治下尚算安稳，但四方觊觎。",
     "events": ["黄巾余党骚扰", "流民涌入", "豪强兼并"]},
    {"key": "荆州·南阳", "region": "荆州", "danger": "中",
     "desc": "南北要冲，诸葛躬耕之地。刘表治荆州，尚有秩序，但北方战火渐近。",
     "events": ["流民南下", "黄巾余党", "地方豪强割据"]},
    {"key": "益州·巴郡", "region": "益州", "danger": "低",
     "desc": "天府之国，山川险固。刘焉入蜀，偏安一隅，战乱较少。",
     "events": ["五斗米道扩张", "山越骚扰", "蜀道艰难"]},
    {"key": "冀州·魏郡", "region": "冀州", "danger": "中",
     "desc": "袁绍根基，北方重镇。黄巾之乱后元气大伤，正在恢复。",
     "events": ["黄巾之乱", "袁绍募兵", "粮食短缺"]},
    {"key": "扬州·吴郡", "region": "扬州", "danger": "低",
     "desc": "江东水乡，孙氏基业。远离中原战火，但山越时常作乱。",
     "events": ["山越骚扰", "孙策征战", "水患"]},
    {"key": "幽州·涿郡", "region": "幽州", "danger": "高",
     "desc": "刘备故里，边疆苦寒。胡人时常南下，黄巾之乱波及此地。",
     "events": ["黄巾之乱", "乌桓南侵", "严寒饥荒"]},
    {"key": "凉州·武威", "region": "凉州", "danger": "极高",
     "desc": "西北边陲，董卓故地。羌人与汉人混居，战乱从未停歇。",
     "events": ["羌人入侵", "董卓募兵", "道路断绝"]},
    {"key": "豫州·颍川", "region": "豫州", "danger": "高",
     "desc": "人才辈出之地，荀彧、郭嘉的故乡。黄巾之乱重灾区，十室九空。",
     "events": ["黄巾重灾", "豪强逃亡", "流民遍野"]},
    {"key": "青州·北海", "region": "青州", "danger": "高",
     "desc": "黄巾之乱重灾区，孔融据北海。百姓流离失所，盗匪四起。",
     "events": ["黄巾主力", "孔融募兵", "粮荒"]},
]

# 历史事件池（按年份）
HISTORICAL_EVENTS = {
    184: [
        {"event": "黄巾之乱爆发，张角率众起义，天下震动", "impact": "征兵频繁，粮价飞涨，道路不安"},
        {"event": "官军四处镇压黄巾，各地豪强趁机募兵", "impact": "强壮男丁被强征入伍"},
        {"event": "黄巾军攻破多处县城，流民四散", "impact": "大量流民涌入，粮食紧张"},
    ],
    185: [
        {"event": "黄巾主力被镇压，但余党仍在各地流窜", "impact": "盗匪横行，乡村不安"},
        {"event": "各地豪强借镇压黄巾之机扩充实力", "impact": "豪强兼并土地，百姓失地"},
    ],
    189: [
        {"event": "董卓入京，废少帝，立献帝，朝纲大乱", "impact": "政局动荡，各地诸侯蠢蠢欲动"},
        {"event": "关东诸侯联合讨伐董卓", "impact": "战火蔓延，道路断绝"},
    ],
    190: [
        {"event": "董卓迁都长安，洛阳大火，百万生灵涂炭", "impact": "大量难民西逃，粮食极度短缺"},
        {"event": "诸侯联军讨董，各怀私心，互相观望", "impact": "战乱范围扩大"},
    ],
    193: [
        {"event": "曹操攻徐州，屠城数处，尸横遍野", "impact": "徐州百姓大量逃亡"},
        {"event": "各地军阀混战，民不聊生", "impact": "粮食短缺加剧，疫病流行"},
    ],
    200: [
        {"event": "官渡之战，曹操与袁绍决战", "impact": "大规模征兵，粮草被大量征收"},
    ],
    208: [
        {"event": "赤壁之战，曹操南征失败", "impact": "荆州局势动荡，大量难民流离"},
    ],
}

# 开局伙伴候选池
COMPANION_POOL = [
    {"name": "王大牛", "gender": "男", "profession": "农夫", "age": 28,
     "personality": "憨厚老实，吃苦耐劳，但遇事容易慌乱",
     "loyalty": 60, "emotion": "惶恐", "note": "同村逃出来的，无处可去"},
    {"name": "陈阿婆", "gender": "女", "profession": "村妇", "age": 52,
     "personality": "经历过苦难，坚韧而悲观，懂些草药",
     "loyalty": 55, "emotion": "麻木", "note": "儿子被征兵，独自流亡"},
    {"name": "小石头", "gender": "男", "profession": "孤儿", "age": 12,
     "personality": "机灵但胆小，会偷东西，对给他饭吃的人死心塌地",
     "loyalty": 70, "emotion": "依赖", "note": "父母死于黄巾之乱，无依无靠"},
    {"name": "李二郎", "gender": "男", "profession": "逃兵", "age": 22,
     "personality": "有些武艺，但贪生怕死，见利忘义",
     "loyalty": 40, "emotion": "警惕", "note": "从官军中逃出，怕被追捕"},
    {"name": "张寡妇", "gender": "女", "profession": "民妇", "age": 31,
     "personality": "泼辣能干，丈夫战死，独自带着孩子逃难",
     "loyalty": 50, "emotion": "坚忍", "note": "带着五岁的孩子，需要保护"},
    {"name": "老瘸子", "gender": "男", "profession": "老兵", "age": 58,
     "personality": "见过世面，话不多但有用，腿有旧伤走不快",
     "loyalty": 65, "emotion": "平静", "note": "曾是边军，退伍后无处可去"},
    {"name": "赵小娘", "gender": "女", "profession": "逃难女子", "age": 19,
     "personality": "柔弱但聪慧，识字，会算账",
     "loyalty": 55, "emotion": "恐惧", "note": "大户人家的婢女，主人家破人亡"},
]

# 性格特征池（用于随机生成角色背景）
PERSONALITY_POOL = [
    "沉默寡言，但观察力敏锐",
    "话多但心善，容易相信别人",
    "谨慎多疑，不轻易信任他人",
    "乐观豁达，苦中作乐",
    "悲观消沉，但关键时刻能撑住",
    "脾气暴躁，容易冲动",
    "温和忍耐，逆来顺受",
    "精明算计，凡事先想利弊",
]

# 背景故事模板
BACKSTORY_TEMPLATES = [
    "家人死于黄巾之乱，独自流亡至此",
    "村庄被官军征粮殆尽，被迫离乡",
    "逃避豪强逼债，一路颠沛流离",
    "跟随逃难的人群，不知该去往何处",
    "曾经的生计被战乱毁掉，重新开始",
    "为了寻找失散的家人，四处漂泊",
]


def weighted_random_choice(pool: list) -> dict:
    """从带权重的池中随机选择"""
    total = sum(item.get("weight", 1) for item in pool)
    r = random.uniform(0, total)
    cumulative = 0
    for item in pool:
        cumulative += item.get("weight", 1)
        if r <= cumulative:
            return item
    return pool[-1]


def generate_random_character_background(name: str, gender: str) -> dict:
    """生成完整的随机角色背景"""
    identity = weighted_random_choice(IDENTITY_POOL)
    birthplace = random.choice(BIRTHPLACE_POOL)
    personality = random.choice(PERSONALITY_POOL)
    backstory = random.choice(BACKSTORY_TEMPLATES)

    # 根据身份调整资源（加入随机波动）
    base_resources = identity["resources"].copy()
    for key in base_resources:
        variation = random.randint(-8, 8)
        base_resources[key] = max(5, min(95, base_resources[key] + variation))

    # 随机决定是否有初始伙伴（30%概率）
    initial_companion = None
    if random.random() < 0.3:
        initial_companion = random.choice(COMPANION_POOL).copy()

    # 获取当前年份的历史事件
    current_year = 184
    year_events = HISTORICAL_EVENTS.get(current_year, HISTORICAL_EVENTS[184])
    active_event = random.choice(year_events)

    return {
        "identity": identity,
        "birthplace": birthplace,
        "personality": personality,
        "backstory": backstory,
        "resources": base_resources,
        "initial_companion": initial_companion,
        "active_event": active_event,
        "current_year": current_year,
    }


# ============================================================
#  GM 系统提示词（完整版）
# ============================================================

GM_SYSTEM_PROMPT = """你是《乱世微尘》的游戏主持人（GM）。背景设定于汉末乱世（公元184-220年）。

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
数值范围-15到+15，必须符合行动逻辑。粮食短缺时要加重负面影响。

【伙伴系统】
玩家最多带3个伙伴。伙伴分层：
- 核心伙伴：有长期记忆和个性，会主动反应，会记仇记恩
- 常接触NPC：记得玩家大概是什么样的人
- 普通路人：主要受地区局势和事件影响

伙伴也要消耗粮食（每人每天额外-1粮食），也会害怕，也可能因玩家的选择而失望离队。
如有伙伴互动，附上：
[COMPANIONS]{"updates":[{"name":"伙伴名","emotion":"情绪","loyalty_delta":0,"note":"简短说明"}]}[/COMPANIONS]

【NPC系统（分层智能）】
每个NPC具备：
- 身份层：姓名、年龄、职业、性格
- 记忆层：与玩家的交互历史
- 目标层：短期目标（今天要干什么）和长期目标（活下去/发财/复仇等）
- 反应层：符合性格与处境的反应，不同阶层的人说话方式不同

叙事后附上NPC数据：
[NPC_DATA][{"name":"姓名","profession":"职业","emotion":"情绪","hidden_goal":"隐藏目标","attitude":"对玩家态度"}][/NPC_DATA]

【历史事件系统】
黄巾之乱、地方战乱、宗教扩张、江东重组等事件会直接改变生活环境，表现为：
- 征兵：强壮男丁被拉走
- 逃难：大量流民涌入，粮价飞涨
- 屠掠：军队过境，财物被抢，人命不保
- 教团扩张：太平道、五斗米道在民间传播
- 地方秩序崩坏：官府失能，豪强割据

如有重大历史事件，附上：
[WORLD_EVENT]{"year":184,"event":"事件描述"}[/WORLD_EVENT]

【现代知识风险机制】
玩家可以利用现代常识改善生存，但：
- 超出古代生产力范围的做法（如制造火药、蒸汽机）会让人当成神棍或危险人物
- 过于超前的医疗知识可能被视为妖术
- 适度的现代常识（如煮沸饮水、简单消毒）可以帮助生存

【行动裁定原则】
- 采用"描述-意图-结果"三段式
- 偏向拟真而非戏剧化
- 小人物不能凭一己之力扭转大势，成功往往伴随代价
- 体力不足时行动效果打折
- 粮食耗尽时精神和健康快速下降

【叙事风格】
- 参考《三国志》简洁克制，借《三国演义》生动描写塑造场景氛围
- 使用符合汉代语境的称谓（"汝""尔""某家"等），保持现代可读性
- 每次叙事以开放式情境收束，留给玩家选择空间
- 每次回复控制在400字以内

【严格禁止】
- 让玩家轻松成为历史名将义弟/军师
- 杜撰历史人物私密言论
- 为爽感破坏历史走向
- 主动提供最优解
- 使用"经验值""升级""技能点"等现代游戏化语言
- 无代价的成功"""


# ============================================================
#  Pydantic Schemas
# ============================================================

class StartGameRequest(BaseModel):
    character_id: int
    name: str
    gender: str = "男"


class SaveSessionRequest(BaseModel):
    character_id: int
    messages: str = "[]"
    npc_states: str = "[]"
    world_events: str = "[]"
    scene_npcs: str = "[]"
    current_location: str = ""
    session_summary: str = ""
    resources: str = "{}"
    companions: str = "[]"


class DeathRequest(BaseModel):
    character_id: int
    death_context: str


class NewsRequest(BaseModel):
    character_id: int
    current_year: int
    current_location: str = ""
    recent_events: list[str] = []
    character_situation: str = "安全"


# ============================================================
#  Routes
# ============================================================

@router.post("/start_game")
async def start_game(
    req: StartGameRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """随机生成角色背景并生成开场场景"""
    try:
        # 生成随机角色背景
        bg = generate_random_character_background(req.name, req.gender)
        identity = bg["identity"]
        birthplace = bg["birthplace"]
        personality = bg["personality"]
        backstory = bg["backstory"]
        resources = bg["resources"]
        initial_companion = bg["initial_companion"]
        active_event = bg["active_event"]
        current_year = bg["current_year"]

        # 更新数据库中的角色信息
        result = await db.execute(
            select(Characters)
            .where(Characters.id == req.character_id)
            .where(Characters.user_id == str(current_user.id))
        )
        character = result.scalar_one_or_none()
        if character:
            character.identity = identity["key"]
            character.birthplace = birthplace["key"]
            character.resources = json.dumps(resources, ensure_ascii=False)
            character.companions = json.dumps(
                [initial_companion] if initial_companion else [], ensure_ascii=False
            )
            await db.commit()

        # 构建开场提示词
        companion_hint = ""
        if initial_companion:
            companion_hint = (
                f"\n同行者：{initial_companion['name']}，{initial_companion['age']}岁，"
                f"{initial_companion['profession']}，{initial_companion['note']}。"
            )

        user_message = (
            f"请为以下角色生成开场场景：\n"
            f"姓名：{req.name}\n"
            f"性别：{req.gender}\n"
            f"身份：{identity['label']}（{identity['desc']}）\n"
            f"出生地：{birthplace['key']}（{birthplace['desc']}）\n"
            f"性格：{personality}\n"
            f"背景：{backstory}\n"
            f"当前年份：{current_year}年\n"
            f"当前大事：{active_event['event']}（影响：{active_event['impact']}）\n"
            f"{companion_hint}\n\n"
            f"初始资源状态：粮食{resources['food']}/100，钱财{resources['money']}/100，"
            f"健康{resources['health']}/100，体力{resources['stamina']}/100，精神{resources['morale']}/100\n\n"
            f"要求：\n"
            f"1. 以第二人称叙述，代入感强\n"
            f"2. 体现身份的卑微与处境的艰难，不要美化\n"
            f"3. 包含当前年份与具体地点，通过环境细节体现战乱\n"
            f"4. 自然地引入1-3个NPC（符合身份和地点），在叙事后附上NPC数据：\n"
            f"[NPC_DATA]\n"
            f'[{{"name":"姓名","profession":"职业","emotion":"当前情绪","hidden_goal":"隐藏目的","attitude":"对玩家态度"}},...]\n'
            f"[/NPC_DATA]\n"
            f"5. 如有同行者，自然地描述他们的存在\n"
            f"6. 以开放式情境结束，给玩家留下选择空间\n"
            f"7. 在文末附上资源变化（开场通常变化不大）：\n"
            f"[RESOURCES]{{\"food_delta\":0,\"money_delta\":0,\"health_delta\":0,\"stamina_delta\":0,\"morale_delta\":0}}[/RESOURCES]"
        )

        service = AIHubService()
        gm_request = GenTxtRequest(
            messages=[
                ChatMessage(role="system", content=GM_SYSTEM_PROMPT),
                ChatMessage(role="user", content=user_message),
            ],
            model="claude-opus-4.6",
        )

        response = await service.gentxt(gm_request)
        full_text = response.content

        # 解析NPC数据
        npcs = []
        npc_match = re.search(r"\[NPC_DATA\](.*?)\[/NPC_DATA\]", full_text, re.DOTALL)
        if npc_match:
            try:
                npcs = json.loads(npc_match.group(1).strip())
            except Exception:
                npcs = []

        # 清理叙事文本
        opening_narrative = re.sub(r"\[NPC_DATA\].*?\[/NPC_DATA\]", "", full_text, flags=re.DOTALL)
        opening_narrative = re.sub(r"\[RESOURCES\].*?\[/RESOURCES\]", "", opening_narrative, flags=re.DOTALL)
        opening_narrative = opening_narrative.strip()

        companions = [initial_companion] if initial_companion else []

        return {
            "opening_narrative": opening_narrative,
            "npcs": npcs,
            "current_year": current_year,
            "location": birthplace["key"],
            "identity": identity["key"],
            "identity_label": identity["label"],
            "identity_desc": identity["desc"],
            "identity_skills": identity.get("skills", []),
            "birthplace": birthplace["key"],
            "birthplace_desc": birthplace["desc"],
            "birthplace_danger": birthplace["danger"],
            "personality": personality,
            "backstory": backstory,
            "resources": resources,
            "companions": companions,
            "active_event": active_event,
        }

    except Exception as e:
        logger.error(f"Error in start_game: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/save_session")
async def save_session(
    req: SaveSessionRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """保存或更新游戏会话"""
    try:
        result = await db.execute(
            select(Game_sessions)
            .where(Game_sessions.character_id == req.character_id)
            .where(Game_sessions.user_id == str(current_user.id))
            .order_by(desc(Game_sessions.updated_at))
            .limit(1)
        )
        existing = result.scalar_one_or_none()

        session_data = {
            "messages": req.messages,
            "npc_states": req.npc_states,
            "world_events": req.world_events,
            "scene_npcs": req.scene_npcs,
            "current_location": req.current_location,
            "session_summary": req.session_summary,
            "resources": req.resources,
            "companions": req.companions,
        }

        if existing:
            for key, value in session_data.items():
                setattr(existing, key, value)
            await db.commit()
            await db.refresh(existing)
            return {"session_id": existing.id, "success": True}
        else:
            new_session = Game_sessions(
                user_id=str(current_user.id),
                character_id=req.character_id,
                **session_data,
            )
            db.add(new_session)
            await db.commit()
            await db.refresh(new_session)
            return {"session_id": new_session.id, "success": True}

    except Exception as e:
        logger.error(f"Error in save_session: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/load_session/{character_id}")
async def load_session(
    character_id: int,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """加载角色的最新游戏会话"""
    try:
        result = await db.execute(
            select(Game_sessions)
            .where(Game_sessions.character_id == character_id)
            .where(Game_sessions.user_id == str(current_user.id))
            .order_by(desc(Game_sessions.updated_at))
            .limit(1)
        )
        session = result.scalar_one_or_none()

        if not session:
            raise HTTPException(status_code=404, detail="No session found for this character")

        return {
            "session_id": session.id,
            "messages": session.messages or "[]",
            "npc_states": session.npc_states or "[]",
            "world_events": session.world_events or "[]",
            "scene_npcs": session.scene_npcs or "[]",
            "current_location": session.current_location or "",
            "session_summary": session.session_summary or "",
            "resources": getattr(session, "resources", None) or "{}",
            "companions": getattr(session, "companions", None) or "[]",
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in load_session: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/death")
async def handle_death(
    req: DeathRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """处理角色死亡——生成死亡叙事并更新角色状态"""
    try:
        service = AIHubService()
        death_request = GenTxtRequest(
            messages=[
                ChatMessage(role="system", content=GM_SYSTEM_PROMPT),
                ChatMessage(
                    role="user",
                    content=(
                        f"角色在以下情境中死去：\n{req.death_context}\n\n"
                        f"请用200字以内，以第三人称写一段悲凉而克制的死亡叙事，"
                        f"体现乱世小人物的命运无常。"
                        f"结尾用一句简短的感慨收束，可以是旁观者的评语，也可以是对这个时代的叹息。"
                        f"不要使用'游戏结束'等现代语言。不要煽情过度。"
                    ),
                ),
            ],
            model="claude-opus-4.6",
        )

        response = await service.gentxt(death_request)
        death_narrative = response.content

        # 更新角色状态
        result = await db.execute(
            select(Characters)
            .where(Characters.id == req.character_id)
            .where(Characters.user_id == str(current_user.id))
        )
        character = result.scalar_one_or_none()
        if character:
            character.is_alive = False
            character.death_story = death_narrative
            await db.commit()

        return {"death_narrative": death_narrative}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in handle_death: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/news")
async def generate_news(
    req: NewsRequest,
    current_user: UserResponse = Depends(get_current_user),
):
    """根据当前年份和局势生成动态天下新闻"""
    try:
        # 根据年份确定历史背景
        year = req.current_year
        era_context = ""
        if year <= 184:
            era_context = "黄巾之乱刚刚爆发，张角率领黄巾军席卷天下，汉室摇摇欲坠"
        elif year <= 189:
            era_context = "黄巾之乱平息，但各地军阀割据，朝廷内部十常侍专权，外戚与宦官争斗激烈"
        elif year <= 192:
            era_context = "董卓入京，废立皇帝，关东诸侯联合讨伐，天下大乱，民不聊生"
        elif year <= 196:
            era_context = "董卓已死，李傕郭汜控制朝廷，各路诸侯混战，百姓流离失所"
        elif year <= 200:
            era_context = "曹操挟天子以令诸侯，官渡之战在即，袁绍与曹操争霸北方"
        elif year <= 208:
            era_context = "曹操统一北方，南下荆州，赤壁之战将决定天下三分格局"
        elif year <= 220:
            era_context = "三足鼎立之势已成，曹魏、蜀汉、东吴各据一方，战事频繁"
        else:
            era_context = "三国乱世持续，各方势力消长，天下百姓苦不堪言"

        recent_context = ""
        if req.recent_events:
            recent_context = f"\n近期角色经历的事件：{'、'.join(req.recent_events[-3:])}"

        prompt = (
            f"当前年份：公元{year}年\n"
            f"历史背景：{era_context}\n"
            f"角色所在地：{req.current_location or '不明'}\n"
            f"角色处境：{req.character_situation}\n"
            f"{recent_context}\n\n"
            f"请生成3条当前时期的天下消息，格式如下：\n"
            f"每条消息包含：\n"
            f"- 消息标题（10字以内，简洁有力）\n"
            f"- 消息内容（30-50字，体现战乱与民间疾苦）\n"
            f"- 影响程度（高/中/低）\n"
            f"- 消息类型（战事/政局/民生/灾异/奇闻）\n\n"
            f"以JSON数组格式返回，例如：\n"
            f'[{{"title":"黄巾贼攻陷颍川","content":"黄巾渠帅波才率众攻破颍川，郡守弃城而逃，百姓死伤无数，流民涌向四方。","impact":"高","type":"战事"}}]\n\n'
            f"注意：\n"
            f"1. 内容要符合{year}年的历史背景，不要出现该年份尚未发生的事件\n"
            f"2. 体现小人物视角，关注民间疾苦而非英雄豪杰\n"
            f"3. 语言古朴，符合汉末风格\n"
            f"4. 只返回JSON数组，不要其他内容"
        )

        service = AIHubService()
        news_request = GenTxtRequest(
            messages=[
                ChatMessage(
                    role="system",
                    content="你是一个汉末乱世的说书人，专门收集天下各地的消息，以民间视角讲述时事。",
                ),
                ChatMessage(role="user", content=prompt),
            ],
            model="deepseek-v3.2",
        )

        response = await service.gentxt(news_request)
        raw = response.content.strip()

        # 提取JSON
        json_match = re.search(r"\[.*\]", raw, re.DOTALL)
        news_items = []
        if json_match:
            try:
                news_items = json.loads(json_match.group(0))
            except Exception:
                news_items = []

        # 如果解析失败，返回默认新闻
        if not news_items:
            news_items = [
                {
                    "title": f"{year}年天下动荡",
                    "content": era_context,
                    "impact": "高",
                    "type": "政局",
                }
            ]

        return {
            "year": year,
            "era_context": era_context,
            "news": news_items,
        }

    except Exception as e:
        logger.error(f"Error in generate_news: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))