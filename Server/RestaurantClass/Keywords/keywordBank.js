const cuisineKeywords = {
    sushi: [
        "sushi", "sushi bar", "sushi house", "sushi roll", "sushi express", "sushi stop", "sushi train",
        "omakase", "sashimi", "nigiri", "maki", "temaki", "uramaki", "chirashi", "hand roll", "fusion sushi",
        "dragon roll", "rainbow roll", "spicy tuna", "california roll", "eel roll", "crunch roll", "volcano roll",
        "tuna roll", "salmon roll", "yellowtail", "hamachi", "maguro", "toro", "otoro", "akami", "unagi", "anago",
        "ebi", "kani", "masago", "tobiko", "ikura", "tamago", "sake", "shiso", "uni", "wasabi", "soy sauce",
        "pickled ginger", "daikon", "miso soup", "edamame", "wakame", "seaweed salad", "rice vinegar", "bamboo mat",
        "sushi chef", "sushi platter", "nori", "rolls", "sushi fusion", "izakaya", "robata", "sake bar",
        "chirashi bowl", "sushi set", "omakase menu"
    ],
    ramen: [
        "ramen", "ramen house", "ramen bar", "noodle house", "noodle bar", "noodle shop", "noodle kitchen",
        "ramenya", "tonkotsu", "shoyu", "shio", "miso ramen", "spicy miso", "tantanmen", "tsukemen", "mazemen",
        "ramen bowl", "paitan", "yuzu shio", "chintan", "kotteri", "ajitama", "ajitsuke tamago", "chashu",
        "menma", "narutomaki", "nori", "kikurage", "scallion", "green onion", "bean sprout", "corn topping",
        "soft-boiled egg", "rich broth", "pork bone broth", "chicken broth", "spicy broth", "black garlic oil",
        "miso base", "thick noodles", "thin noodles", "al dente noodles", "japanese noodle soup", "instant ramen",
        "ramen chef", "tonkotsu king", "ichiran", "ichiraku", "ipuddo", "santouka", "ramyun", "korean ramen"
    ],
    mexican: [
        // Core identifiers
        "mexican", "mexico", "cocina", "taqueria", "cantina", "antojito", "mexicali", "mexicana", "comida", "antojitos", "autentica", "auténtica",

        // Dishes
        "taco", "tacos", "burrito", "burritos", "enchilada", "enchiladas", "quesadilla", "quesadillas", "tostada", "tostadas", "fajita", "fajitas",
        "tortilla", "tamale", "tamales", "pozole", "menudo", "chile relleno", "al pastor", "barbacoa", "chorizo", "carnitas", "elote", "molé", "huarache",
        "sopes", "flautas", "empanadas", "birria", "huevos rancheros", "cochinita pibil", "chilaquiles", "nachos", "queso fundido", "caldo de res",

        // Sweets & Drinks
        "horchata", "agua fresca", "jarritos", "jamaica", "tamarindo", "paleta", "pan dulce", "tres leches", "arroz con leche", "dulce", "churro", "churros",
        "flan", "cajeta", "licuado", "atole", "champurrado", "margarita", "michelada", "cerveza mexicana",

        // Restaurant naming patterns
        "taco truck", "taco shop", "mexican grill", "casa", "la fiesta", "el paso", "los", "la", "el ", "dos", "tres", "boca", "sabor", "agave", "caliente",
        "plaza", "bandidos", "zocalo", "ranchero", "rancho", "bandido", "pueblo", "lindo", "abuela", "abuelita", "girasoles", "azteca", "maya", "aztec",
        "cactus", "tortilla house", "fiesta", "la cocina", "hacienda", "mi casa", "antojitos", "el ranchito", "taq", "mexi", "chapala",

        // Well-known chains and names
        "chipotle", "qdoba", "taco bell", "del taco", "chuy's", "moe's southwest grill", "el famoso", "on the border", "casa bonita", "chevys", "tijuana flats",
        "el torito", "el pollo loco", "pepe's", "pedro's", "pancho's", "juanita", "juarez", "cabos", "baja fresh", "baja", "tijuana", "jalisco", "oaxaca",
        "chihuahua", "sonora", "sinaloa", "zacatecas", "mexicali",

        // Common Spanish food words
        "carne", "pollo", "res", "pescado", "camaron", "mariscos", "verduras", "maiz", "limón", "salsa", "guacamole", "cilantro", "cebolla", "queso",
        "frijoles", "arroz", "tortas", "agua", "picante", "caldo", "sabroso", "rico", "fresco", "antojito", "platillo", "puente",
    ],
    chinese: [
        // Core cuisine identifiers
        "chinese", "china", "oriental", "asian fusion", "wok", "bamboo", "dragon", "phoenix", "jade", "lotus",
        "peking", "mandarin", "szechuan", "sichuan", "hunan", "canton", "cantonese", "dynasty", "emperor",

        // Dish-specific
        "dim sum", "hot pot", "shabu shabu", "chow mein", "lo mein", "fried rice", "egg fried rice", "steamed rice",
        "dumpling", "potsticker", "xiao long bao", "bao", "bao bun", "soup dumpling", "egg roll", "spring roll",
        "wonton", "wonton soup", "noodle", "rice bowl", "scallion pancake", "mapo tofu", "prawn cracker",

        // Sauces and flavors
        "sweet and sour", "general tso", "sesame chicken", "orange chicken", "kung pao", "mala", "hoisin", "soy sauce",
        "five spice", "chili oil", "black bean", "garlic sauce", "ginger chicken",

        // Restaurant naming patterns
        "golden wok", "great wall", "jade garden", "china palace", "chopsticks", "noodle king", "rice garden",
        "dragon express", "lucky panda", "fortune house", "chop suey", "golden dragon", "bamboo house",
        "mandarin house", "happy wok", "red dragon", "tea garden", "panda garden", "orient express", "imperial china",
        "zen garden", "red lantern", "crystal jade",

        // Chains & branded cues
        "panda express", "peking house", "hunan garden", "noodle express", "china express"
    ],
    italian: [
        // Core cuisine identifiers
        "italian", "italia", "italy", "italiano", "ristorante", "trattoria", "osteria", "ristoro", "pizzeria", "ristorante italiano",

        // Dish-specific
        "pizza", "margherita", "neapolitan", "sicilian", "calzone", "focaccia", "bruschetta", "pasta", "spaghetti",
        "fettuccine", "carbonara", "alfredo", "penne", "rigatoni", "bolognese", "lasagna", "gnocchi", "parmigiana",
        "veal parm", "chicken parm", "meatball", "caprese", "mozzarella", "prosciutto", "ricotta", "pesto", "ziti",
        "ravioli", "manicotti", "antipasto", "risotto", "arancini", "tortellini", "cannelloni", "italian beef", "italian sausage",

        // Sweets and drinks
        "tiramisu", "gelato", "affogato", "limoncello", "espresso", "cappuccino", "latte", "vino", "wine bar", "amaro",

        // Restaurant naming patterns
        "la cucina", "cucina", "mamma", "nonna", "giovanni", "giuseppe", "roma", "napoli", "venezia", "toscana",
        "salerno", "lucca", "milano", "siena", "trentino", "florence", "pompei", "sicilia", "capri", "modena", "gia",

        // Romantic/branding cues
        "amore", "bella", "bello", "ciao", "buona", "mangia", "sapori", "famiglia", "dolce", "giardino",
        "roma’s", "italiano’s", "la bella", "cibo", "osteria", "cavatelli", "vino e cucina", "via napoli", "mio",

        // Chains & well-known names
        "giordano’s", "maggianno", "olive garden", "carrabba", "buca di beppo", "giordano", "lumalnati", "eataly"
    ],
    indian: [
        // Core identifiers
        "indian", "desi", "tandoori", "curry", "masala", "mughlai", "rasoi", "indian street food", "spice house", "spice bazaar",
        "indian palace", "shahi", "tikka", "tikka masala", "spicy village", "chaipoint", "spice route", "mirchi", "chatori gali",
        "the curry house", "india grill", "indus", "naan stop", "bombay bites", "masala magic", "taste of india", "little india",

        // Dishes
        "biryani", "biriyani", "butter chicken", "chicken 65", "chole", "rajma", "korma", "vindaloo", "dal", "saag", "kadhai",
        "palak paneer", "malai kofta", "methi", "kachori", "chaat", "pav bhaji", "aloo gobi", "bhindi masala", "tamarind",
        "paneer", "gobi manchurian", "chana masala", "mutton rogan josh", "kathi roll", "kofta", "baingan bharta",

        // Breads
        "naan", "roti", "paratha", "puri", "bhatura", "kulcha", "rumali roti", "lachha paratha",

        // South Indian dishes
        "idli", "dosa", "uttapam", "rasam", "vada", "pongal", "sambar", "upma", "filter coffee", "set dosa", "appam", "puttu",

        // Sweets & Drinks
        "halwa", "gulab jamun", "rasgulla", "jalebi", "barfi", "laddu", "kheer", "payasam", "soan papdi", "shrikhand",
        "gajar halwa", "kulfi", "malpua", "mithaai", "falooda", "lassi", "masala chai", "badam milk", "thandai", "rose milk",
        "gulkand", "chai", "chaiwala",

        // Restaurant patterns / naming
        "rasoi", "biryani house", "masala", "curry", "spice", "tandoor", "tandoori", "chaat house", "indian kitchen", "naan stop",
        "indian bistro", "biryani express", "curry point", "tandoori flame", "maharaja", "taste of india", "desi bites",
        "little india", "indian express", "curry leaf", "spice village", "biryani pot", "dilli", "india garden", "royal india",

        // Regional / cultural references
        "bombay", "mumbai", "delhi", "dilli", "punjab", "punjabi", "goa", "goan", "kerala", "madras", "tamil", "tamilnadu",
        "hyderabad", "hyderabadi", "lucknow", "lucknowi", "rajasthan", "rajasthani", "gujarati", "gujarat", "bengali", "bengal",
        "kolkata", "andhra", "karnataka", "sindhi", "orissa", "marathi", "malabar", "kashmiri", "coorg", "konkan", "chettinad",

        // Common food words
        "chutney", "ghee", "jeera", "haldi", "garam masala", "ajwain", "hing", "amchur", "kesar", "elaichi",
        "coriander", "turmeric", "fenugreek", "cumin", "asafoetida", "kasuri methi", "mustard seed"
    ],
    mediterranean: [
        // Core cuisine & cultural identifiers
        "mediterranean", "middle eastern", "greek", "lebanese", "turkish", "armenian", "israeli", "syrian", "moroccan",
        "egyptian", "levant", "levantine", "north african", "berber", "andalusian", "cypriot", "levant", "arabic",
        "anatolian", "balkan", "aegean",

        // Main dishes and grilled meats
        "falafel", "gyro", "gyros", "shawarma", "kebab", "kabob", "souvlaki", "shish", "grilled lamb", "grilled chicken",
        "kofta", "moussaka", "pastitsio", "musakhan", "maqluba", "tajine", "tagine", "lamb chops", "lamb skewer",
        "beef skewer", "mixed grill", "doner", "donair", "skewer plate",

        // Sides, dips, and savory ingredients
        "hummus", "baba ghanoush", "mutabbal", "labneh", "tzatziki", "tahini", "zaatar", "za'atar", "zatar", "feta",
        "olives", "olive oil", "pita", "pita bread", "stuffed grape leaves", "dolma", "warak enab", "tabbouleh",
        "tabouleh", "fattoush", "borek", "spanakopita", "meze", "mezze", "mjaddara", "basturma", "harissa",
        "laban", "shatta", "eggplant dip", "foul", "mansaf", "freekeh", "kisir", "kibbeh", "lentil soup",
        "lentil balls", "halloumi", "pomegranate molasses", "sumac",

        // Desserts & drinks
        "baklava", "turkish delight", "halva", "kanafeh", "knafeh", "basbousa", "ma'amoul", "rice pudding", "malabi",
        "loukoumades", "galaktoboureko", "qatayef", "arabic coffee", "turkish coffee", "mint tea", "rose water",
        "orange blossom", "almond milk",

        // Restaurant patterns & terms
        "med cafe", "med kitchen", "med grill", "pita house", "olive", "kasbah", "souq", "bazaar", "cafe istanbul",
        "byblos", "yalla", "aladdin", "cedar", "cedars", "taverna", "taverna grecque", "athens", "jerusalem",
        "beirut", "damascus", "cairo", "tangier", "casablanca", "tripoli", "sahara", "bazaar", "al",
        "house of pita", "tent", "caravan", "desert grill", "sultana", "mediterraneo", "levant bistro",

        // Cultural and regional references
        "jerusalem", "beirut", "damascus", "aleppo", "cairo", "casablanca", "tangier", "tripoli", "nablus", "gaza",
        "ankara", "istanbul", "mykonos", "crete", "athens", "santorini", "cyprus", "rabat", "fes", "luxor",
        "medina", "algiers", "marrakech", "tel aviv",

        // Common review/naming words
        "authentic", "fresh pita", "flavorful", "family-owned", "authentic mediterranean", "arabic flavors", "tangy",
        "spiced", "charcoal grilled", "roasted", "slow cooked", "traditional", "heritage", "homemade", "hand-rolled",
        "stuffed", "herbs", "olive-infused", "simmered", "crunchy falafel", "warm pita", "creamy hummus"
    ],
    thai: [
        // Core identifiers
        "thai", "thailand", "siam", "isaan", "thai house", "thai kitchen", "thai bistro", "thai cafe", "thai restaurant",
        "thai express", "thai fusion", "thai street food", "thai cuisine", "thai eatery", "thai garden", "thai taste",
        "thai delight", "thai smile", "thai chili", "thai chilli", "thai palace", "thai orchid", "thai basil", "bangkok",
        "thonglor", "thai villa", "sawatdee", "aroy dee", "aroy", "dee dee", "jinda", "thai terrace",

        // Popular dishes
        "pad thai", "pad see ew", "drunken noodles", "basil fried rice", "kao pad", "kao soi", "rad na", "larb", "nam tok",
        "panang curry", "massaman curry", "green curry", "red curry", "yellow curry", "jungle curry", "tom yum", "tom kha",
        "gaeng", "kaeng", "gaeng daeng", "kaeng khiao wan", "pad kra pao", "moo ping", "krapow", "pad prik", "tod mun", "satay",
        "kai yang", "yam nua", "yam woon sen", "pla rad prik", "pad pong karee", "pla goong", "kai tod", "gai pad med mamuang",

        // Salads, soups, rice & noodles
        "papaya salad", "som tum", "glass noodle salad", "jok", "boat noodles", "khao tom", "thai fried rice",
        "crab fried rice", "shrimp fried rice", "tom yum noodles", "mee krob", "khanom jeen", "sen lek", "sen yai",

        // Desserts & drinks
        "mango sticky rice", "sticky rice", "coconut ice cream", "tub tim krob", "thai iced tea", "thai tea", "thai milk tea",
        "cha yen", "cha manao", "luk chup", "foi thong", "kanom krok", "kanom tom", "roti sai mai", "sangkaya", "thai dessert",

        // Regional/cultural references
        "bangkok", "isaan", "nakhon", "chiang mai", "samut", "phuket", "thai temple", "ayutthaya", "buriram", "ubol", "nong khai",

        // Ingredients / flavors
        "lemongrass", "galangal", "kaffir lime", "thai chili", "fish sauce", "tamarind", "palm sugar", "thai basil", "holy basil",
        "shrimp paste", "peanuts", "lime leaf", "cilantro", "coconut milk", "bird’s eye chili", "sugarcane", "jasmine rice",
        "long bean", "bamboo shoot", "mung bean", "fried garlic", "crispy shallot", "roasted rice powder", "thai herb"
    ],
    breakfast: [
        // Core meals
        "breakfast", "brunch", "morning", "early", "sunrise", "daybreak",

        // Specific dishes
        "pancake", "pancakes", "waffle", "waffles", "french toast", "toast", "eggs", "egg",
        "omelet", "omelette", "scramble", "scrambled", "bacon", "sausage", "hash", "hashbrowns",
        "grits", "biscuits", "gravy", "crepe", "crepes", "quiche", "avocado toast", "english muffin",
        "bagel", "lox", "cereal", "granola", "oatmeal", "porridge", "syrup",

        // Specialty combos
        "eggs benedict", "huevos rancheros", "breakfast burrito", "breakfast sandwich",
        "breakfast tacos", "egg sandwich", "eggs and bacon", "steak and eggs",

        // Drink pairings
        "coffee", "latte", "espresso", "cappuccino", "americano", "flat white", "chai",
        "juice", "smoothie", "mimosa",

        // Restaurant name cues
        "cafe", "diner", "griddle", "brunch", "rooster", "sunny", "morning", "early bird",
        "sunrise", "biscuit", "buttermilk", "waffle house", "yolk", "sun", "egg yolk",
        "sunny side", "flapjack", "short stack", "daylight", "am", "dawn", "cockerel", "cuckoo",
        "farmhouse", "home kitchen", "maple", "syrup", "skillet", "avocado", "toast", "gravy train",

        // Chains & branded cues
        "first watch", "egg harbor", "wildberry", "ihop", "cracker barrel", "brunch cafe",
        "yolk", "buttermilk cafe", "pancake house", "eggcellent", "sunrise cafe", "early riser",
        "eggstasy", "egghead", "eggtown", "eggs up", "morning star", "sunup", "snooze", "daybreak diner",

        // Other
        "early start", "morning fuel", "breakfast club", "early eats", "morning grind"
    ],
    bar_food: [
        "bar", "sports bar", "pub", "taproom", "tavern", "saloon", "ale house", "draft house", "public house",
        "beer garden", "brewery", "brewhouse", "grill", "sports grill", "gastropub", "roadhouse", "watering hole",
        "lounge", "cocktail bar", "speakeasy", "beer hall", "pool hall", "billiards", "bar & grill", "dive bar",
        "whiskey bar", "wine bar", "shot bar", "happy hour", "live music", "karaoke bar", "neighborhood bar",
        "sports lounge", "brews", "tap", "on tap", "pints", "bottles", "draft beer", "craft beer", "microbrewery",
        "beer flight", "growler", "burger joint", "wings", "buffalo wings", "nachos", "fries", "sliders",
        "loaded fries", "onion rings", "bar bites", "pub grub", "drinks", "shots", "cocktails", "margarita",
        "mimosa", "bloody mary", "booze", "alcohol", "full bar", "mixed drinks", "bottle service", "late night food",
        "live DJ", "karaoke", "dart bar", "jukebox", "game night", "beer pong", "trivia night"
    ],
};

module.exports = cuisineKeywords;

