# Step 12 — Menu item form parity + local image uploads

## What changed

- Add/edit menu item form restyled like Hisabi product add pages: section cards (Basic information, Pricing & availability), dashed image dropzone, gold save CTA.
- Two-way Gemini bilingual name fields (EN ↔ AR) with the same origin lock pattern as categories.
- Per-item image upload via JSON base64 on create/update; files stored under `UPLOADS_DIR` outside the repo (`menu-items/{businessProfileId}/{itemId}/image.{ext}`).
- DB `MenuItem.imageUrl` stores the relative storage key; API JSON exposes authenticated `/api/auth/menu/items/[id]/image`.
- Env: `UPLOADS_DIR` documented in `.env.example` and set locally to `C:\Users\haris\Desktop\hisabi-pos-uploads`.

## Key files

- `src/lib/storage/local-storage.js`
- `src/lib/menu/menu-item-image-storage.js`
- `src/app/api/auth/menu/items/[id]/image/route.js`
- `src/app/[locale]/(app)/menu/items/menu-item-form-view.jsx`

## Verify

1. Set `UPLOADS_DIR` to a folder outside the repo; restart the app.
2. Open Add menu item — confirm section cards + image dropzone match Hisabi product form styling.
3. Upload PNG/JPEG ≤1MB, save; confirm file appears under `UPLOADS_DIR/menu-items/...` and edit form shows the image.
4. Remove / replace image on edit and save.
