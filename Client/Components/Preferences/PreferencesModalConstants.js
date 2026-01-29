// Top-level intent (drives which backend + which filters are shown)
export const MODE_OPTIONS = [
  { label: "Places to go", value: "places" },
  { label: "Ticketed events", value: "events" },
  { label: "Surprise me", value: "mixed" },
];

// Google Places categories (maps cleanly to included/excluded types + keywords)
// Keep this to ~5–8 max so users can decide fast.
export const PLACE_CATEGORY_OPTIONS = [
  { label: "Anything", value: "any" },

  { label: "Food & Drink", value: "food_drink" },
  { label: "Things to do", value: "things_to_do" },
  { label: "Outdoors", value: "outdoors" },
  { label: "Kids & Family", value: "family" },
  { label: "Nightlife", value: "nightlife" },
];

export const WHEN_OPTIONS = [
  { label: "Now", value: "now" },
  { label: "Tonight", value: "tonight" },
  { label: "Tomorrow", value: "tomorrow" },
  { label: "This weekend", value: "weekend" },
  { label: "Pick date/time…", value: "custom" },
];

// Ticketmaster categories (don’t pretend these are the same as places)
export const EVENT_CATEGORY_OPTIONS = [
  { label: "Any", value: "any" },
  { label: "Music", value: "music" },
  { label: "Sports", value: "sports" },
  { label: "Comedy", value: "comedy" },
  { label: "Arts & Theater", value: "arts_theater" },
  { label: "Family", value: "family" },
];

// Audience context (drives defaults like familyFriendly, nightlife avoidance, etc.)
export const WHO_OPTIONS = [
  { label: "Solo", value: "solo" },
  { label: "Date", value: "date" },
  { label: "Friends", value: "friends" },
  { label: "Family", value: "family" },
];

// Vibe is intentionally orthogonal to category.
// Users pick 0–2; backend maps to keywords / scoring boosts.
export const VIBE_OPTIONS = [
  { label: "Chill", value: "chill" },
  { label: "Active", value: "active" },
  { label: "Social", value: "social" },
  { label: "Romantic", value: "romantic" },
  { label: "High-energy", value: "high_energy" },
  { label: "Low-key", value: "low_key" },
];

// Optional: sorting constants (useful once you wire backend scoring)
export const EVENT_SORT_OPTIONS = [
  { label: "Soonest", value: "date" },
  { label: "Closest", value: "distance" },
  { label: "Best match", value: "relevance" },
];

export const PLACE_SORT_OPTIONS = [
  { label: "Best match", value: "best_match" },
  { label: "Closest", value: "distance" },
  { label: "Top rated", value: "rating" },
];
