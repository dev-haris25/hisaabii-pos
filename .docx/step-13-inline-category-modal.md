# Step 13 — Inline category create on menu item form

## What changed

- Extended `MenuCategoryEditModal` to support **create** (no `category`) and **edit** (with `category`).
- On add/edit menu item, category field has an **Add category** control that opens the same modal.
- After create, the new category is selected automatically on the item form.

## Key files

- `src/app/[locale]/(app)/menu/categories/menu-category-edit-modal.jsx`
- `src/app/[locale]/(app)/menu/items/menu-item-form-view.jsx`
