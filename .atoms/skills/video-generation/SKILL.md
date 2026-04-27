---
name: video-generation
description: Read when you need to generate short project videos such as hero backgrounds, promos, demos, or clips from a reference image.
alwaysApply: false
roles:
  - Alex
---

## When to use

Use this skill when the project needs generated video content.
Typical cases: hero background loops, promo clips, product demo videos, short motion scenes.

## Command

Use `VideoCreator.generate_videos`.

## Inputs

- `videos`: JSON array of video generation requests.
- `prompt`: video prompt.
- `filename`: logical output name with extension such as `.mp4`.
- `model`: optional.
- `size`: optional. Defaults to `1280x720`. Keep this default unless the task clearly requires another size.
- `seconds`: optional. Defaults to `4`. Keep this default unless the task clearly requires another duration.
- `image`: optional reference image for image-to-video. Must be an absolute local path or an http(s) URL.

## Returns

Each result item may include:

- `status`
- `filename`
- `url`
- `path`
- `absolute_path`
- `message`
- `model`
- `size`
- `seconds`

## Rules / Constraints

- `filename` is a logical identifier, not a guaranteed local file path.
- Use the returned CDN `url` directly in your code.
- Use absolute local paths or http(s) URLs for `image`. Do not pass data URIs.
- `1280x720` and `4` seconds are the safest defaults across current video models, so do not change them unless the requirement clearly needs it.
- This tool is for internal asset creation after `todo.md`, not for end-user runtime video generation.
- If the user wants in-app video generation, implement it through backend AI APIs.

## XML Example

```xml
<VideoCreator.generate_videos>
<videos>
[
  {
    "prompt": "Slow cinematic fly-through of a modern workspace with warm sunlight, shallow depth of field, premium brand mood",
    "filename": "hero-workspace-loop.mp4"
  },
  {
    "prompt": "Subtle motion applied to a product poster for a homepage hero section",
    "filename": "poster-motion.mp4",
    "image": "/absolute/path/to/assets/poster-reference.png"
  }
]
</videos>
</VideoCreator.generate_videos>
```
