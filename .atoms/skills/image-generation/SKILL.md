---
name: image-generation
description: Read when you need to generate or edit project image assets such as hero banners, product visuals, logos, icons, or transparent cutouts.
alwaysApply: false
roles:
  - Alex
---

## When to use

Use this skill when the task needs new image assets or image-to-image editing for project delivery.
Typical cases: hero banners, product cards, logos, decorative visuals, section backgrounds, transparent PNG assets.

## Command

Use `ImageCreator.generate_images`.

## Inputs

- `images`: JSON array of image request objects.
- `description`: detailed visual description.
- `filename`: descriptive output filename, usually in English.
- `style`: optional. Defaults to `photorealistic`. Common values: `photorealistic`, `cartoon`, `sketch`, `watercolor`, `minimalist`, `3d`.
- `size`: optional image size such as `1024x1024`, `1024x576`, `1024x768`. Defaults to `1024x1024`.
- `image`: optional reference image for image-to-image editing. Must be an absolute local path or an http(s) URL.
- `background`: optional. Use `transparent` for transparent output.

## Returns

Each result item may include:

- `status`
- `filename`
- `url`
- `path`
- `absolute_path`
- `message`

## Rules / Constraints

- Batch all required images into one call whenever possible.
- Use descriptive English filenames so later code references stay clear.
- If a result item has `url`, use that URL directly in code. Do not download it.
- If there is no `url`, use the returned local asset path according to the tool result.
- Reference `image` only supports absolute local paths or http(s) URLs. Do not pass data URIs.
- Transparent background requests should use `background: "transparent"` and a `.png` or `.webp` filename, or no extension.
- Transparent background requests temporarily switch the underlying model to `gpt-image-1.5`.
- Run image generation after `todo.md` is written.
- If the user wants end-user in-app image generation, implement that through backend AI APIs instead of this internal command.

## XML Example

```xml
<ImageCreator.generate_images>
<images>
[
  {
    "description": "Cinematic homepage hero banner showing a futuristic electric motorcycle on a wet city street at dusk, neon reflections, dynamic angle, bold composition",
    "filename": "hero-electric-motorcycle-dusk.jpg",
    "style": "photorealistic",
    "size": "1024x576"
  },
  {
    "description": "Minimal owl logo mark for a productivity app, centered composition, clean vector-like shapes, no background shadows",
    "filename": "logo-owl-mark.png",
    "style": "minimalist",
    "size": "1024x1024",
    "background": "transparent"
  }
]
</images>
</ImageCreator.generate_images>
```
