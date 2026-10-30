import type { Recipe } from '../types/recipe';

export const SEED_RECIPES: Recipe[] = [
  {
    id: 'seed-1',
    title: 'Creamy Calabrian Chili Rigatoni',
    description: 'Silky, spicy, and deeply savory pasta sauce with crisp shallots, heavy cream, parmesan, and a kick of fermented Calabrian chili paste.',
    sourceType: 'instagram',
    sourceUrl: 'https://instagram.com/reel/example-chili-pasta',
    sourceName: '@broccyourbody on Instagram',
    coverImage: 'https://images.unsplash.com/photo-1608897013039-887f21d8c804?auto=format&fit=crop&w=1200&q=80',
    userPhotos: [
      'https://images.unsplash.com/photo-1551183053-bf91a1d81141?auto=format&fit=crop&w=1000&q=80'
    ],
    servings: 4,
    prepTimeMinutes: 10,
    cookTimeMinutes: 20,
    difficulty: 'Easy',
    categories: ['Dinners', 'Quick (<30m)', 'Instagram'],
    tags: ['Pasta', 'Comfort Food', 'Spicy', 'Date Night', '30-Minute'],
    ingredients: [
      { id: 'ing-1', raw: '1 lb rigatoni or paccheri pasta' },
      { id: 'ing-2', raw: '2 tbsp extra virgin olive oil' },
      { id: 'ing-3', raw: '2 medium shallots, finely minced' },
      { id: 'ing-4', raw: '4 cloves garlic, grated' },
      { id: 'ing-5', raw: '2.5 tbsp crushed Calabrian chili paste' },
      { id: 'ing-6', raw: '3 tbsp double-concentrated tomato paste' },
      { id: 'ing-7', raw: '3/4 cup heavy cream' },
      { id: 'ing-8', raw: '1/2 cup pasta water (starchy)' },
      { id: 'ing-9', raw: '1 cup freshly grated Parmigiano-Reggiano' },
      { id: 'ing-10', raw: 'Fresh basil leaves & flaky sea salt' }
    ],
    instructions: [
      {
        id: 'step-1',
        stepNumber: 1,
        text: 'Bring a large pot of salted water to a vigorous boil. Cook rigatoni until 1 minute shy of al dente. Reserve 1 cup of pasta water before draining.',
        timerMinutes: 10
      },
      {
        id: 'step-2',
        stepNumber: 2,
        text: 'In a large deep skillet, heat olive oil over medium heat. Sauté minced shallots with a pinch of salt for 3-4 minutes until soft and translucent.',
        timerMinutes: 4
      },
      {
        id: 'step-3',
        stepNumber: 3,
        text: 'Stir in grated garlic, tomato paste, and Calabrian chili paste. Cook stirring constantly for 2 minutes until the paste turns a deep brick-red and oils separate.',
        timerMinutes: 2
      },
      {
        id: 'step-4',
        stepNumber: 4,
        text: 'Pour in heavy cream and 1/2 cup pasta water. Simmer on medium-low for 3 minutes until smooth and emulsified.',
        timerMinutes: 3
      },
      {
        id: 'step-5',
        stepNumber: 5,
        text: 'Add the drained pasta and grated parmesan to the skillet. Toss vigorously over low heat until the sauce clings to every ridge of the rigatoni. Top with torn basil and flaky salt.'
      }
    ],
    jasmineNotes: [
      {
        id: 'note-1',
        text: 'Alex loves this one extra spicy! I used 3 tbsp of the jarred Trader Joe\'s Calabrian chili paste and finished with lots of fresh cracked black pepper.',
        date: '2026-10-18'
      },
      {
        id: 'note-2',
        text: 'Don\'t skip reserving the pasta water—the starch makes the sauce glossy and restaurant quality.',
        date: '2026-09-24'
      }
    ],
    rating: 5,
    favorite: true,
    wantToTry: true,
    cookedCount: 4,
    lastCookedDate: '2026-10-18',
    createdAt: '2026-09-01T12:00:00Z',
    updatedAt: '2026-10-18T19:30:00Z'
  },
  {
    id: 'seed-2',
    title: 'Buttermilk Marinated Roast Chicken',
    description: 'Samin Nosrat\'s iconic whole roasted chicken. Soaking in salted buttermilk tenderizes the meat deeply and yields blistering golden mahogany skin.',
    sourceType: 'cookbook',
    sourceUrl: '',
    sourceName: 'Salt, Fat, Acid, Heat (p. 340) by Samin Nosrat',
    coverImage: 'https://images.unsplash.com/photo-1598103442097-8b74394b95c6?auto=format&fit=crop&w=1200&q=80',
    userPhotos: [],
    servings: 4,
    prepTimeMinutes: 20,
    cookTimeMinutes: 60,
    difficulty: 'Medium',
    categories: ['Dinners', 'Cookbooks'],
    tags: ['Chicken', 'Weekend Cooking', 'Crowd Pleaser', 'Sunday Roast'],
    ingredients: [
      { id: 'ing-20', raw: '1 whole chicken (3.5 to 4 lbs)' },
      { id: 'ing-21', raw: '2 cups whole milk buttermilk' },
      { id: 'ing-22', raw: '2 tbsp fine sea salt (or Diamond Crystal kosher)' },
      { id: 'ing-23', raw: 'Fresh cracked black pepper' },
      { id: 'ing-24', raw: 'Butcher\'s twine for trussing legs' }
    ],
    instructions: [
      {
        id: 'step-20',
        stepNumber: 1,
        text: 'The day before: Season chicken generously all over with kosher salt. Whisk the 2 tbsp salt directly into the buttermilk until dissolved.'
      },
      {
        id: 'step-21',
        stepNumber: 2,
        text: 'Place chicken in a gallon ziplock bag and pour buttermilk over it. Squeeze out air, seal, and massage so every crevice is coated. Refrigerate 24 hours (turn once halfway through).'
      },
      {
        id: 'step-22',
        stepNumber: 3,
        text: '1 hour before cooking: Pull chicken out of the fridge, pull it from buttermilk (scrape excess off gently), and let it sit on a cast iron skillet at room temp to take the chill off.'
      },
      {
        id: 'step-23',
        stepNumber: 4,
        text: 'Preheat oven to 425°F. Tie the legs loosely with twine. Slide into oven with legs pointing toward the back corner (the hottest part). Roast for 20 minutes.',
        timerMinutes: 20
      },
      {
        id: 'step-24',
        stepNumber: 5,
        text: 'Reduce heat to 400°F. Rotate pan 180 degrees. Roast for another 35-40 minutes until deeply golden brown and juices run clear.',
        timerMinutes: 35
      },
      {
        id: 'step-25',
        stepNumber: 6,
        text: 'Rest 10 minutes on a cutting board before carving so the juices redistribute.'
      }
    ],
    jasmineNotes: [
      {
        id: 'note-20',
        text: 'Photo of the cookbook page saved in photos below! Samin notes to use kosher salt (Diamond Crystal) so it doesn\'t get too salty.',
        date: '2026-08-12'
      }
    ],
    rating: 5,
    favorite: true,
    cookedCount: 2,
    lastCookedDate: '2026-08-12',
    createdAt: '2026-08-01T10:00:00Z',
    updatedAt: '2026-08-12T20:00:00Z'
  },
  {
    id: 'seed-3',
    title: '20-Minute Thai Basil Beef Bowls',
    description: 'Ground beef tossed with crispy garlic, sambal oelek, fish sauce, brown sugar, and heaps of fragrant Thai basil over jasmine rice.',
    sourceType: 'website',
    sourceUrl: 'https://halfbakedharvest.com/thai-basil-beef-bowls',
    sourceName: 'Half Baked Harvest',
    coverImage: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=1200&q=80',
    userPhotos: [],
    servings: 4,
    prepTimeMinutes: 10,
    cookTimeMinutes: 10,
    difficulty: 'Easy',
    categories: ['Dinners', 'Quick (<30m)'],
    tags: ['Asian', 'Quick', 'Ground Beef', 'Rice Bowl', 'Weeknight'],
    ingredients: [
      { id: 'ing-30', raw: '1 lb lean ground beef or ground turkey' },
      { id: 'ing-31', raw: '1 tbsp sesame oil' },
      { id: 'ing-32', raw: '1 red bell pepper, thinly sliced' },
      { id: 'ing-33', raw: '4 cloves garlic, minced' },
      { id: 'ing-34', raw: '1 tbsp fresh ginger, grated' },
      { id: 'ing-35', raw: '3 tbsp low sodium soy sauce (or tamari)' },
      { id: 'ing-36', raw: '1.5 tbsp fish sauce' },
      { id: 'ing-37', raw: '1 tbsp brown sugar or honey' },
      { id: 'ing-38', raw: '1-2 tbsp chili garlic sauce or sambal' },
      { id: 'ing-39', raw: '1 cup fresh Thai basil leaves (or sweet Italian basil)' },
      { id: 'ing-40', raw: 'Steamed jasmine rice & fried eggs for serving' }
    ],
    instructions: [
      {
        id: 'step-30',
        stepNumber: 1,
        text: 'In a small bowl, whisk together soy sauce, fish sauce, brown sugar, and chili garlic sauce.'
      },
      {
        id: 'step-31',
        stepNumber: 2,
        text: 'Heat sesame oil in a large skillet or wok over high heat. Add ground beef and bell pepper. Break up meat and cook until browned and caramelized, about 6 minutes.',
        timerMinutes: 6
      },
      {
        id: 'step-32',
        stepNumber: 3,
        text: 'Add minced garlic and grated ginger. Cook 1 minute until fragrant.',
        timerMinutes: 1
      },
      {
        id: 'step-33',
        stepNumber: 4,
        text: 'Pour in the sauce mixture and let bubble for 2 minutes so the glaze coats the beef.',
        timerMinutes: 2
      },
      {
        id: 'step-34',
        stepNumber: 5,
        text: 'Remove from heat and immediately stir in fresh basil until wilted. Serve hot over warm jasmine rice with a crispy fried egg on top.'
      }
    ],
    jasmineNotes: [
      {
        id: 'note-30',
        text: 'Our go-to Tuesday night dinner when we have zero time. Made with ground turkey last time and it was just as tasty!',
        date: '2026-10-22'
      }
    ],
    rating: 5,
    favorite: false,
    wantToTry: true,
    cookedCount: 5,
    lastCookedDate: '2026-10-22',
    createdAt: '2026-07-15T18:00:00Z',
    updatedAt: '2026-10-22T19:00:00Z'
  },
  {
    id: 'seed-4',
    title: 'Brown Butter Toffee Chocolate Chip Cookies',
    description: 'Crispy edges, chewy puddle-center cookies made with nutty browned butter and homemade crunchy toffee bits.',
    sourceType: 'manual',
    sourceUrl: '',
    sourceName: 'Adapted from Claire Saffitz / Smitten Kitchen',
    coverImage: 'https://images.unsplash.com/photo-1499636136210-6f4ee915583e?auto=format&fit=crop&w=1200&q=80',
    userPhotos: [],
    servings: 16,
    prepTimeMinutes: 30,
    cookTimeMinutes: 14,
    difficulty: 'Medium',
    categories: ['Baking', 'Cookbooks'],
    tags: ['Dessert', 'Baking', 'Cookies', 'Chocolate'],
    ingredients: [
      { id: 'ing-50', raw: '1 cup (2 sticks) unsalted butter' },
      { id: 'ing-51', raw: '2 cups all-purpose flour (260g)' },
      { id: 'ing-52', raw: '1 tsp baking soda' },
      { id: 'ing-53', raw: '1 tsp fine sea salt' },
      { id: 'ing-54', raw: '3/4 cup dark brown sugar, packed' },
      { id: 'ing-55', raw: '1/2 cup granulated white sugar' },
      { id: 'ing-56', raw: '2 large eggs, room temperature' },
      { id: 'ing-57', raw: '2 tsp pure vanilla extract' },
      { id: 'ing-58', raw: '8 oz bittersweet chocolate (chopped into chunks)' },
      { id: 'ing-59', raw: 'Flaky Maldon sea salt for sprinkling' }
    ],
    instructions: [
      {
        id: 'step-50',
        stepNumber: 1,
        text: 'Brown the butter: Melt butter in a light-colored saucepan over medium heat. Swirl occasionally as it foams and crackles. Once golden brown specks appear with a hazelnut aroma (about 5-6 mins), pour into a bowl and let cool 15 minutes.',
        timerMinutes: 6
      },
      {
        id: 'step-51',
        stepNumber: 2,
        text: 'In a medium bowl, whisk together flour, baking soda, and fine salt.'
      },
      {
        id: 'step-52',
        stepNumber: 3,
        text: 'Whisk cooled brown butter with brown sugar and white sugar until smooth. Add eggs one at a time, followed by vanilla. Whisk vigorously for 1 minute until ribbon-like.'
      },
      {
        id: 'step-53',
        stepNumber: 4,
        text: 'Fold in dry ingredients with a spatula just until combined. Fold in chocolate chunks. Chill dough in the fridge for at least 2 hours (or overnight for maximum flavor!).'
      },
      {
        id: 'step-54',
        stepNumber: 5,
        text: 'Bake at 350°F on parchment-lined sheets for 12-14 minutes until edges are golden and center is still soft. Sprinkle immediately with flaky salt.',
        timerMinutes: 13
      }
    ],
    jasmineNotes: [
      {
        id: 'note-50',
        text: 'Chilling the dough overnight really makes the caramel flavor pop! Use Guittard 70% chocolate feves if possible.',
        date: '2026-10-05'
      }
    ],
    rating: 5,
    favorite: true,
    cookedCount: 3,
    lastCookedDate: '2026-10-05',
    createdAt: '2026-06-10T14:00:00Z',
    updatedAt: '2026-10-05T16:00:00Z'
  }
];
