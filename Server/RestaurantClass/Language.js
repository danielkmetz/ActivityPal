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
    
    if (langCode === 'und') {
      return 'unknown';
    }

    const lang = langs.where("3", langCode);
    if (lang) {
      return lang.name;
    } else {
      return 'unknown';
    }
  } catch (err) {
    return 'unknown';
  }
};

const getCuisineFromLanguage = async (text = "") => {
  const cleaned = text.replace(/[^a-zA-Z\s]/g, '').toLowerCase();
  
  const language = await detectLanguage(cleaned);
  const cuisine = langToCuisineHint[language] || null;

  return cuisine;
};

module.exports = {
  detectLanguage,
  getCuisineFromLanguage,
};
