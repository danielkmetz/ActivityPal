const cuisineKeywords = {
  bar_food: [
    "bar", "pub", "grill", "taproom", "tavern", "saloon", "ale house", "draft house", "sports bar", "beer garden",
    "brewery", "brewhouse", "happy hour", "wings", "burgers", "beer", "craft beer", "cocktail", "shots", "roadhouse",
    "lounge", "billiards", "pool hall", "sports grill", "bottle service", "gastro"
  ],
  sushi: [
    "sushi", "nigiri", "sashimi", "maki", "temaki", "chirashi", "omakase", "sushi bar", "sushi house", "sushi roll",
    "izakaya", "toro", "hamachi", "unagi", "ebi", "sake", "uni", "chirashi", "sushi express", "sushi stop"
  ],
  ramen: [
    "ramen", "noodle house", "tonkotsu", "shoyu", "shio", "miso ramen", "tsukemen", "ramen bar", "noodle shop",
    "noodle bar", "ramenya", "spicy miso", "ramyun", "ajitama", "paitan", "chashu", "ichiraku"
  ],
  chinese: [
    "chinese", "china", "wok", "dim sum", "szechuan", "hunan", "mandarin", "peking", "lo mein", "chow mein",
    "hot pot", "dumpling", "xiao long bao", "bao", "kung pao", "dragon", "golden wok", "rice bowl", "noodle king",
    "egg roll", "sweet and sour", "mongolian", "general tso", "fortune", "jade", "chop suey", "bamboo", "phoenix", "mein",
  ],
  italian: [
    "italian", "pizza", "pizzeria", "pasta", "ristorante", "trattoria", "focaccia", "lasagna", "gnocchi", "calzone",
    "margherita", "bolognese", "carbonara", "parmigiana", "al forno", "spaghetti", "neapolitan", "sicilian",
    "ristoro", "italia", "osteria", "bruschetta", "mozzarella", "caprese", "tiramisù", "fettuccine", "amore", "vino"
  ],
  indian: [
    "indian", "tandoori", "masala", "biryani", "curry", "naan", "dal", "vindaloo", "chaat", "desi", "mughlai",
    "bombay", "punjabi", "goan", "kerala", "madras", "samosa", "butter chicken", "paneer", "spice house",
    "chutney", "hyderabadi", "south indian", "korma", "rogan josh", "rasoi", "thali", "spice bazaar", "naan stop"
  ],
  mediterranean: [
    "mediterranean", "greek", "falafel", "gyro", "kebab", "shawarma", "hummus", "tzatziki", "mezze", "tabbouleh",
    "dolma", "baklava", "lebanese", "israeli", "turkish", "armenian", "shish", "baba ghanoush", "souvlaki",
    "olive", "pita", "halloumi", "meze", "zatar", "fatoush", "labneh", "tahini", "yalla", "pita house"
  ],
  thai: [
    "thai", "pad thai", "tom yum", "larb", "kao soi", "basil", "curry", "red curry", "green curry", "thai house",
    "bangkok", "nam tok", "thai kitchen", "kaeng", "isaan", "thai bistro", "satay", "sawatdee", "thai spice",
    "lemongrass", "mango sticky rice", "tamarind", "siam", "thai orchid", "krapow"
  ],
  mexican: [
    "mexican", "taqueria", "taco", "burrito", "enchilada", "quesadilla", "cantina", "chipotle", "mexicali",
    "carnitas", "al pastor", "tortilla", "nacho", "fajita", "pozole", "mole", "antojito", "jalisco", "hacienda",
    "el paso", "boca", "salsa", "agave", "chimichanga", "guacamole", "sonora", "chapala", "taq", "baja", "tijuana", "pancho", "la fiesta"
  ]
};

const classifyRestaurantCuisine = (name = "") => {
  const normalized = name.toLowerCase();

  for (const [category, keywords] of Object.entries(cuisineKeywords)) {
    if (keywords.some(keyword => normalized.includes(keyword))) {
      return category;
    }
  }

  return "unknown";
};

const classifyMultiCuisine = (name = "") => {
  const normalized = name.toLowerCase();
  return Object.entries(cuisineKeywords)
    .filter(([_, keywords]) =>
      keywords.some(keyword => normalized.includes(keyword))
    )
    .map(([category]) => category);
};

module.exports = {
  classifyRestaurantCuisine,
  classifyMultiCuisine,
};
