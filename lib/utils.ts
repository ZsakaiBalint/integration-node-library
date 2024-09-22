/**
 * Utility functions.
 *
 * @copyright (c) 2024 by Unfolded Circle ApS.
 * @license Apache License 2.0, see LICENSE for more details.
 */

/**
 * Convert an input text to a language object.
 *
 * An input text is either a simple string, which is mapped to the `en` language key, a Map containing language keys and
 * text values, or an Object with language key fields and text values.
 * @param {string | Map<string, string> | Record<string, string>} text
 * @return {{ [key: string]: string }}
 */
function toLanguageObject(text: string | Map<string, string> | Record<string, string>): Record<string, string> {
  if (typeof text === "string") {
    return { en: text };
  }
  else if (text instanceof Map) {
    return Object.fromEntries(text);
  }
  else {
    return text;
  }
}

/**
 * Get the default text from a language text map.
 *
 * If English `en` or any `en-##` is not defined, the first entry is returned.
 *
 * @param {Record<string, string>} text The language text map, key is the language identifier, value is the language-specific text.
 * @param {string} defaultText The text to return if `text` is empty.
 * @returns {string} The default text.
 */
function getDefaultLanguageString(text: Record<string, string>, defaultText: string = "Undefined"): string {
  if (!text) {
    return defaultText;
  }

  if (text.en) {
    return text.en;
  }

  for (const [index, [key, value]] of Object.entries(text).entries()) {
    if (index === 0) {
      defaultText = value;
    }
    if (key.startsWith("en-")) {
      return text[key];
    }
  }

  return defaultText;
}

export { toLanguageObject, getDefaultLanguageString };
