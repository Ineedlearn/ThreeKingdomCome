---
last_updated: 2026-04-22T22:16:50Z
status: active
---

# Project Context

## Project Overview
《乱世微尘》是一款基于汉末三国背景的类DnD文字冒险游戏Web应用。玩家扮演乱世小人物，通过AI驱动的GM系统进行角色扮演冒险。游戏包含角色创建、出生地选择、NPC互动、历史事件触发、存档系统等核心功能。

## Key Decisions
| Date | Decision | By | Rationale |
|------|----------|-----|-----------|
| 2026-04-22 | 使用Atoms Cloud后端 + React前端 | Alex | 需要AI GM、存档、NPC记忆等后端能力 |
| 2026-04-22 | AI GM使用claude-opus-4.6 streaming | Alex | 高质量叙事，流式输出提升体验 |
| 2026-04-22 | 暗色古风UI主题 | Alex | 契合汉末乱世基调 |

## Constraints
- 色彩方案：深墨色背景(#0d0d0d/#1a1208)、古铜金(#c9a84c)、血红(#8b1a1a)、竹青(#4a7c59)
- 字体：标题用衬线体，正文用无衬线体，保持古风现代可读性
- 最多8个代码文件（前端）
- AI GM模型：claude-opus-4.6（高质量叙事）
- 历史事件时间线从184年开始追踪
- NPC记忆存储在数据库game_sessions表中


