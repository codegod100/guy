import { eveChannel } from "eve/channels/eve";
import { type AuthFn, localDev, vercelOidc } from "eve/channels/auth";
import { getLogger } from "../lib/logger.ts";

// Force the logger singleton (and its LOG_FILE sink) to open at module-load
// time so eve's eager discovery of `agent/channels/eve.ts` produces a log
// line and a file even before any tool runs. Pure side-effect; no log call
// needed beyond the bootstrap.
// info level so it survives the default LOG_LEVEL=info threshold.
getLogger().info("channel module loaded", { channel: "eve" });

function getPrimaryLocale(request: Request): string | undefined {
  const explicitLocale = request.headers.get("x-user-locale")?.trim();
  if (explicitLocale) return explicitLocale;

  const acceptLanguage = request.headers.get("accept-language");
  const locale = acceptLanguage?.split(",")[0]?.split(";")[0]?.trim();
  return locale || undefined;
}

function getRegion(request: Request, locale: string | undefined): string | undefined {
  const countryHeader = request.headers.get("x-vercel-ip-country")?.trim();
  if (countryHeader) {
    return countryHeader.toUpperCase();
  }

  if (!locale) return undefined;

  try {
    return new Intl.Locale(locale).maximize().region?.toUpperCase();
  } catch {
    return undefined;
  }
}

function withLocale(auth: AuthFn<Request>): AuthFn<Request> {
  return async (request) => {
    const result = await auth(request);
    if (!result) return result;

    const locale = getPrimaryLocale(request);
    const region = getRegion(request, locale);

    return {
      ...result,
      attributes: {
        ...(result.attributes ?? {}),
        ...(locale ? { locale } : {}),
        ...(region ? { region } : {}),
      },
    };
  };
}

export default eveChannel({
  auth: [withLocale(localDev()), withLocale(vercelOidc())],
});
