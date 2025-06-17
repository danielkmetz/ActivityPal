const fastFoodChains = [
  "McDonald's",
  "Burger King",
  "Wendy's",
  "Taco Bell",
  "KFC",
  "Popeyes",
  "Arby's",
  "Subway",
  "Sonic",
  "Jack in the Box",
  "Hardee's",
  "Carl's Jr",
  "Chick-fil-A",
  "Five Guys",
  "Checkers",
  "White Castle",
  "Del Taco",
  "Jimmy John's",
  "Raising Cane's",
  "In-N-Out",
  "Little Caesars",
  "Domino's",
  "Pizza Hut",
  "Dairy Queen",
  "QDOBA",
  "Jersey Mike's",
  "Wingstop",
];

const isFastFood = (placeName = "") => {
  return fastFoodChains.some(chain =>
    placeName.toLowerCase().includes(chain.toLowerCase())
  );
};

module.exports = { isFastFood };
