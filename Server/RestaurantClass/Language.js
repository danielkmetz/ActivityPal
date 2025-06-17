const langToCuisineHint = {
  Italian: "italian",
  Spanish: "mexican",
  Hindi: "indian",
  Urdu: "indian",
  Bengali: "indian",
  Marathi: "indian",
  Tamil: "indian",
  Telugu: "indian",
  Thai: "thai",
  Chinese: "chinese",
  Japanese: "sushi",
  Greek: "mediterranean",
  Turkish: "mediterranean",
  Arabic: "mediterranean",
  Armenian: "mediterranean",
  Hebrew: "mediterranean",
};

/**
 * Detect the language of the given text (restaurant name).
 */
const detectLanguage = async (text = "") => {
  try {
    const francModule = await import("franc");
    const langsModule = await import("langs");

    const franc = francModule.franc || francModule.default || francModule;
    const langs = langsModule.default;

    const langCode = franc(text);
    if (langCode === 'und') return 'unknown';

    const lang = langs.where("3", langCode);
    return lang ? lang.name : 'unknown';
  } catch (err) {
    console.error("❌ Error detecting language:", err);
    return 'unknown';
  }
};

const getCuisineFromLanguage = async (text = "") => {
  const language = await detectLanguage(text);
  return langToCuisineHint[language] || null;
};

module.exports = {
  detectLanguage,
  getCuisineFromLanguage,
};
