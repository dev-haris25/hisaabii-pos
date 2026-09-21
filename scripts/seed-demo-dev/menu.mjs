import { AR } from './ar.mjs'

/** Demo menu categories + items (no stock/recipes here). */
export const MENU = [
  {
    nameAr: AR.meals,
    nameEn: 'Meals',
    sortOrder: 0,
    items: [
      {
        nameAr: AR.broast,
        nameEn: 'Chicken Broast',
        price: '28.00',
        sortOrder: 0,
        variants: [
          {
            nameAr: AR.size,
            nameEn: 'Size',
            options: [
              { nameAr: AR.regular, nameEn: 'Regular', priceChange: '0', isDefault: true },
              { nameAr: AR.large, nameEn: 'Large', priceChange: '8.00' },
            ],
          },
        ],
        customizations: [
          { nameAr: AR.extraSauce, nameEn: 'Extra sauce', priceChange: '2.00' },
        ],
      },
      {
        nameAr: AR.burger,
        nameEn: 'Beef Burger',
        price: '32.00',
        sortOrder: 1,
        customizations: [
          { nameAr: AR.extraCheese, nameEn: 'Extra cheese', priceChange: '3.00' },
        ],
      },
      {
        nameAr: AR.shawarma,
        nameEn: 'Chicken Shawarma',
        price: '18.00',
        sortOrder: 2,
      },
      {
        nameAr: AR.karahi,
        nameEn: 'Chicken Karahi',
        price: '30.00',
        sortOrder: 3,
      },
    ],
  },
  {
    nameAr: AR.drinks,
    nameEn: 'Drinks',
    sortOrder: 1,
    items: [
      { nameAr: AR.water, nameEn: 'Water', price: '2.00', sortOrder: 0 },
      {
        nameAr: AR.soda,
        nameEn: 'Soft Drink',
        price: '5.00',
        sortOrder: 1,
        variants: [
          {
            nameAr: AR.size,
            nameEn: 'Size',
            options: [
              { nameAr: AR.can, nameEn: 'Can', priceChange: '0', isDefault: true },
              { nameAr: AR.large, nameEn: 'Large', priceChange: '2.00' },
            ],
          },
        ],
      },
      { nameAr: AR.juice, nameEn: 'Fresh Juice', price: '12.00', sortOrder: 2 },
    ],
  },
  {
    nameAr: AR.sides,
    nameEn: 'Sides',
    sortOrder: 2,
    items: [
      { nameAr: AR.fries, nameEn: 'French Fries', price: '10.00', sortOrder: 0 },
      { nameAr: AR.ranchMenu, nameEn: 'Ranch Sauce', price: '3.00', sortOrder: 1 },
    ],
  },
]
