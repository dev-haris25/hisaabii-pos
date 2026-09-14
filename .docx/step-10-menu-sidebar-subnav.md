# Menu sidebar sub-items

## Summary

Menu is now an expandable sidebar group (Hisabi AppShell pattern) with:

| Sub-item | Route | Wording (EN) |
|----------|-------|--------------|
| Menu list | `/menu` | Menu list |
| Manage categories | `/menu/categories` | Manage categories |
| Add menu item | `/menu/items/new` | Add menu item |

## Changes

- `AdminAppShell` — expandable Menu section + sub-nav (`ps-14`, gold active border)
- New page `/menu/categories` with list-table category manager
- List header “Manage categories” links to the categories page (modal removed)
- AppShell i18n: `subMenuList`, `subMenuCategories`, `subMenuAdd` (en/ar)
