/**
 * Lazy-loaded shiki highlighter — only imported dynamically when code blocks render.
 * This keeps ~220 KB of shiki grammar+theme off the main bundle.
 */
import type { BundledLanguage, ThemedToken } from "shiki";

export interface TokenizedCode {
  tokens: ThemedToken[][];
  fg: string;
  bg: string;
}

const tokensCache = new Map<string, TokenizedCode>();
const subscribers = new Map<string, Set<(result: TokenizedCode) => void>>();

let highlighterPromise: ReturnType<typeof createHighlighter> | null = null;

const getTokensCacheKey = (code: string, language: string) => {
  const start = code.slice(0, 100);
  const end = code.length > 100 ? code.slice(-100) : "";
  return `${language}:${code.length}:${start}:${end}`;
};

const createHighlighter = async () => {
  const { createHighlighter: shikiCreate } = await import("shiki");
  return shikiCreate({
    langs: [],
    themes: ["github-light", "github-dark"],
  });
};

const ensureHighlighter = () => {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter();
  }
  return highlighterPromise;
};

/**
 * Create raw tokens for immediate display while highlighting loads.
 */
export const createRawTokens = (code: string): TokenizedCode => ({
  bg: "transparent",
  fg: "inherit",
  tokens: code.split("\n").map((line) =>
    line === ""
      ? []
      : [{ color: "inherit", content: line } as ThemedToken],
  ),
});

/**
 * Synchronous highlight with callback for async results.
 * Returns cached result synchronously, or null and fires callback when ready.
 */
export const highlightCode = (
  code: string,
  language: BundledLanguage,
  callback?: (result: TokenizedCode) => void,
): TokenizedCode | null => {
  const tokensCacheKey = getTokensCacheKey(code, language);

  const cached = tokensCache.get(tokensCacheKey);
  if (cached) return cached;

  if (callback) {
    if (!subscribers.has(tokensCacheKey)) {
      subscribers.set(tokensCacheKey, new Set());
    }
    subscribers.get(tokensCacheKey)?.add(callback);
  }

  ensureHighlighter()
    .then(async (highlighter) => {
      // Try to load the language grammar if not already loaded.
      // Shiki v4's loadLanguage expects a LanguageInput object (grammar),
      // not a string — use bundledLanguages to resolve the lazy import.
      const availableLangs = highlighter.getLoadedLanguages() as string[];

      if (!availableLangs.includes(language)) {
        try {
          const { bundledLanguages } = await import("shiki");
          const langImport = bundledLanguages[language as keyof typeof bundledLanguages];
          if (langImport) {
            const langModule = await langImport();
            // The default export of each lang module is the grammar object
            // that loadLanguage expects (LanguageInput), not a string.
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
            const grammar = (langModule as Record<string, unknown>).default;
            await highlighter.loadLanguage(grammar as never);
          }
        } catch {
          // Language not available in bundledLanguages — fall through to "text"
        }
      }

      const finalLangs = highlighter.getLoadedLanguages() as string[];
      const langToUse = finalLangs.includes(language) ? language : "text";

      const result = highlighter.codeToTokens(code, {
        lang: langToUse as BundledLanguage,
        themes: { dark: "github-dark", light: "github-light" },
      });

      const tokenized: TokenizedCode = {
        bg: result.bg ?? "transparent",
        fg: result.fg ?? "inherit",
        tokens: result.tokens,
      };

      tokensCache.set(tokensCacheKey, tokenized);

      const subs = subscribers.get(tokensCacheKey);
      if (subs) {
        for (const sub of subs) sub(tokenized);
        subscribers.delete(tokensCacheKey);
      }
    })
    .catch((error) => {
      console.error("Failed to highlight code:", error);
      subscribers.delete(tokensCacheKey);
    });

  return null;
};
