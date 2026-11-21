/* ==========================================================
   GANGSTERS - MENU
   This is the ONLY place you need to edit to change dishes
   or prices. Save the file, then refresh the page.

   Each dish looks like:
     { name: "Dish name", note: "short description", price: 120, veg: true }

   - price: just the number (the page adds "Rs " for you)
   - veg:   true  = green dot,  false = red dot (non-veg)
   - note:  optional, use "" if there is nothing to say
   ========================================================== */

const RESTAURANT_NAME = "Gangsters";

const MENU = [
  {
    group: "Starters",
    dishes: [
      { name: "Bruschetta al Pomodoro", note: "tomato and basil, 4 pcs", price: 120, veg: true },
      { name: "Caprese", note: "mozzarella, tomato and basil", price: 180, veg: true },
      { name: "Prosciutto e Melone", note: "cured ham and melon", price: 220, veg: false },
      { name: "Minestrone", note: "vegetable soup, bowl", price: 110, veg: true }
    ]
  },
  {
    group: "Mains",
    dishes: [
      { name: "Pizza Margherita", note: "10 inch", price: 240, veg: true },
      { name: "Spaghetti Aglio e Olio", note: "garlic, olive oil and chilli", price: 180, veg: true },
      { name: "Penne all'Arrabbiata", note: "spicy tomato sauce", price: 190, veg: true },
      { name: "Risotto ai Funghi", note: "mushroom risotto", price: 230, veg: true },
      { name: "Spaghetti alla Carbonara", note: "guanciale, egg and pecorino", price: 280, veg: false },
      { name: "Lasagna alla Bolognese", note: "meat ragù, 1 portion", price: 290, veg: false },
      { name: "Pollo alla Cacciatora", note: "hunter-style chicken, 2 pcs", price: 300, veg: false }
    ]
  },
  {
    group: "Breads",
    dishes: [
      { name: "Focaccia al Rosmarino", note: "rosemary bread, 1 slice", price: 70, veg: true },
      { name: "Ciabatta with Olive Oil", note: "2 pcs", price: 60, veg: true },
      { name: "Grissini", note: "breadsticks, 4 pcs", price: 50, veg: true }
    ]
  },
  {
    group: "Drinks",
    dishes: [
      { name: "Caffe Espresso", note: "", price: 60, veg: true },
      { name: "Cappuccino", note: "", price: 90, veg: true },
      { name: "Limonata", note: "lemon drink, glass", price: 80, veg: true },
      { name: "Acqua Frizzante", note: "sparkling water, bottle", price: 70, veg: true }
    ]
  },
  {
    group: "Desserts",
    dishes: [
      { name: "Tiramisu", note: "contains egg, 1 portion", price: 150, veg: false },
      { name: "Affogato al Caffe", note: "gelato with espresso, 1 serving", price: 130, veg: true },
      { name: "Sorbetto al Limone", note: "lemon sorbet, 1 scoop", price: 90, veg: true }
    ]
  }
];
