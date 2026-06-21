import { defineTool } from "eve/tools";
import { z } from "zod";

const geocodingResultSchema = z.object({
  id: z.number().optional(),
  name: z.string(),
  latitude: z.number(),
  longitude: z.number(),
  country: z.string().optional(),
  country_code: z.string().optional(),
  admin1: z.string().optional(),
  timezone: z.string().optional(),
  population: z.number().optional(),
});

const geocodingResponseSchema = z.object({
  results: z.array(geocodingResultSchema).optional(),
});

const forecastResponseSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
  timezone: z.string(),
  timezone_abbreviation: z.string().optional(),
  current: z
    .object({
      time: z.string(),
      interval: z.number().optional(),
      temperature_2m: z.number().optional(),
      relative_humidity_2m: z.number().optional(),
      apparent_temperature: z.number().optional(),
      is_day: z.number().optional(),
      precipitation: z.number().optional(),
      weather_code: z.number().optional(),
      cloud_cover: z.number().optional(),
      wind_speed_10m: z.number().optional(),
      wind_direction_10m: z.number().optional(),
      wind_gusts_10m: z.number().optional(),
    })
    .optional(),
  current_units: z.record(z.string(), z.string()).optional(),
  daily: z
    .object({
      time: z.array(z.string()),
      weather_code: z.array(z.number()).optional(),
      temperature_2m_max: z.array(z.number()).optional(),
      temperature_2m_min: z.array(z.number()).optional(),
      precipitation_probability_max: z.array(z.number()).optional(),
      precipitation_sum: z.array(z.number()).optional(),
      wind_speed_10m_max: z.array(z.number()).optional(),
    })
    .optional(),
  daily_units: z.record(z.string(), z.string()).optional(),
});

const WEATHER_CODE_DESCRIPTIONS: Record<number, string> = {
  0: "Clear sky",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Depositing rime fog",
  51: "Light drizzle",
  53: "Moderate drizzle",
  55: "Dense drizzle",
  56: "Light freezing drizzle",
  57: "Dense freezing drizzle",
  61: "Slight rain",
  63: "Moderate rain",
  65: "Heavy rain",
  66: "Light freezing rain",
  67: "Heavy freezing rain",
  71: "Slight snowfall",
  73: "Moderate snowfall",
  75: "Heavy snowfall",
  77: "Snow grains",
  80: "Slight rain showers",
  81: "Moderate rain showers",
  82: "Violent rain showers",
  85: "Slight snow showers",
  86: "Heavy snow showers",
  95: "Thunderstorm",
  96: "Thunderstorm with slight hail",
  99: "Thunderstorm with heavy hail",
};

const FAHRENHEIT_REGIONS = new Set([
  "AS",
  "BS",
  "BZ",
  "KY",
  "FM",
  "GU",
  "LR",
  "MH",
  "MP",
  "PR",
  "PW",
  "UM",
  "US",
  "VI",
]);

type TemperatureUnit = "celsius" | "fahrenheit";

function weatherCodeToText(code: number | undefined): string | undefined {
  if (code === undefined) return undefined;
  return WEATHER_CODE_DESCRIPTIONS[code] ?? `Weather code ${code}`;
}

function compactLocationName(
  location: z.infer<typeof geocodingResultSchema>,
): string {
  return [location.name, location.admin1, location.country]
    .filter(Boolean)
    .join(", ");
}

async function fetchJson(url: URL): Promise<unknown> {
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent": "guy-weather-tool/1.0",
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Open-Meteo request failed (${response.status}): ${body}`);
  }

  return response.json();
}

function getStringAttribute(
  attributes: Record<string, unknown> | null | undefined,
  key: string,
): string | undefined {
  const value = attributes?.[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}

function getRegionFromLocale(locale: string | undefined): string | undefined {
  if (!locale) return undefined;

  try {
    return new Intl.Locale(locale).maximize().region?.toUpperCase();
  } catch {
    return undefined;
  }
}

function resolveTemperatureUnit(
  requestedUnit: TemperatureUnit | undefined,
  authAttributes: Record<string, unknown> | null | undefined,
): TemperatureUnit {
  if (requestedUnit) return requestedUnit;

  const region =
    getStringAttribute(authAttributes, "region") ??
    getRegionFromLocale(getStringAttribute(authAttributes, "locale"));

  return region && FAHRENHEIT_REGIONS.has(region)
    ? "fahrenheit"
    : "celsius";
}

export default defineTool({
  description:
    "Get current weather conditions and a short forecast for a city using the Open-Meteo geocoding and forecast APIs.",
  inputSchema: z.object({
    city: z.string().min(1).describe("City or place name to look up."),
    countryCode: z
      .string()
      .length(2)
      .optional()
      .describe("Optional ISO-3166-1 alpha-2 country code, like US or DE."),
    days: z
      .number()
      .int()
      .min(1)
      .max(7)
      .optional()
      .default(3)
      .describe("Number of forecast days to return, from 1 to 7."),
    temperatureUnit: z
      .enum(["celsius", "fahrenheit"])
      .optional()
      .describe(
        "Optional temperature unit override. When omitted, the tool uses the caller's regional default when available.",
      ),
    windSpeedUnit: z
      .enum(["kmh", "ms", "mph", "kn"])
      .optional()
      .default("kmh")
      .describe("Wind speed unit for the returned weather data."),
  }),
  async execute({
    city,
    countryCode,
    days = 3,
    temperatureUnit,
    windSpeedUnit = "kmh",
  }, ctx) {
    const resolvedTemperatureUnit = resolveTemperatureUnit(
      temperatureUnit,
      ctx.session.auth.current?.attributes,
    );

    const geocodeUrl = new URL(
      "https://geocoding-api.open-meteo.com/v1/search",
    );
    geocodeUrl.searchParams.set("name", city);
    geocodeUrl.searchParams.set("count", "1");
    geocodeUrl.searchParams.set("language", "en");
    geocodeUrl.searchParams.set("format", "json");
    if (countryCode) {
      geocodeUrl.searchParams.set("countryCode", countryCode.toUpperCase());
    }

    const geocodeData = geocodingResponseSchema.parse(
      await fetchJson(geocodeUrl),
    );
    const location = geocodeData.results?.[0];

    if (!location) {
      throw new Error(`No location found for "${city}".`);
    }

    const forecastUrl = new URL("https://api.open-meteo.com/v1/forecast");
    forecastUrl.searchParams.set("latitude", String(location.latitude));
    forecastUrl.searchParams.set("longitude", String(location.longitude));
    forecastUrl.searchParams.set("timezone", "auto");
    forecastUrl.searchParams.set("forecast_days", String(days));
    forecastUrl.searchParams.set("temperature_unit", resolvedTemperatureUnit);
    forecastUrl.searchParams.set("wind_speed_unit", windSpeedUnit);
    forecastUrl.searchParams.set(
      "current",
      [
        "temperature_2m",
        "relative_humidity_2m",
        "apparent_temperature",
        "is_day",
        "precipitation",
        "weather_code",
        "cloud_cover",
        "wind_speed_10m",
        "wind_direction_10m",
        "wind_gusts_10m",
      ].join(","),
    );
    forecastUrl.searchParams.set(
      "daily",
      [
        "weather_code",
        "temperature_2m_max",
        "temperature_2m_min",
        "precipitation_probability_max",
        "precipitation_sum",
        "wind_speed_10m_max",
      ].join(","),
    );

    const forecast = forecastResponseSchema.parse(await fetchJson(forecastUrl));
    const current = forecast.current;
    const daily = forecast.daily;
    const currentUnits = forecast.current_units ?? {};
    const dailyUnits = forecast.daily_units ?? {};

    const dailyForecast = daily?.time.map((date, index) => ({
      date,
      condition: weatherCodeToText(daily.weather_code?.[index]),
      temperatureMax:
        daily.temperature_2m_max?.[index] !== undefined
          ? {
              value: daily.temperature_2m_max[index],
              unit:
                dailyUnits.temperature_2m_max ?? currentUnits.temperature_2m,
            }
          : undefined,
      temperatureMin:
        daily.temperature_2m_min?.[index] !== undefined
          ? {
              value: daily.temperature_2m_min[index],
              unit:
                dailyUnits.temperature_2m_min ?? currentUnits.temperature_2m,
            }
          : undefined,
      precipitationProbabilityMax:
        daily.precipitation_probability_max?.[index] !== undefined
          ? {
              value: daily.precipitation_probability_max[index],
              unit: dailyUnits.precipitation_probability_max ?? "%",
            }
          : undefined,
      precipitationSum:
        daily.precipitation_sum?.[index] !== undefined
          ? {
              value: daily.precipitation_sum[index],
              unit: dailyUnits.precipitation_sum ?? "mm",
            }
          : undefined,
      windSpeedMax:
        daily.wind_speed_10m_max?.[index] !== undefined
          ? {
              value: daily.wind_speed_10m_max[index],
              unit:
                dailyUnits.wind_speed_10m_max ?? currentUnits.wind_speed_10m,
            }
          : undefined,
    }));

    return {
      location: {
        name: compactLocationName(location),
        latitude: location.latitude,
        longitude: location.longitude,
        timezone: location.timezone ?? forecast.timezone,
        countryCode: location.country_code,
      },
      current: current
        ? {
            time: current.time,
            isDay: current.is_day === 1,
            condition: weatherCodeToText(current.weather_code),
            weatherCode: current.weather_code,
            temperature:
              current.temperature_2m !== undefined
                ? {
                    value: current.temperature_2m,
                    unit:
                      currentUnits.temperature_2m ??
                      (resolvedTemperatureUnit === "fahrenheit" ? "°F" : "°C"),
                   }
                 : undefined,
            apparentTemperature:
              current.apparent_temperature !== undefined
                ? {
                    value: current.apparent_temperature,
                    unit:
                      currentUnits.apparent_temperature ??
                      currentUnits.temperature_2m,
                  }
                : undefined,
            relativeHumidity:
              current.relative_humidity_2m !== undefined
                ? {
                    value: current.relative_humidity_2m,
                    unit: currentUnits.relative_humidity_2m ?? "%",
                  }
                : undefined,
            precipitation:
              current.precipitation !== undefined
                ? {
                    value: current.precipitation,
                    unit: currentUnits.precipitation ?? "mm",
                  }
                : undefined,
            cloudCover:
              current.cloud_cover !== undefined
                ? {
                    value: current.cloud_cover,
                    unit: currentUnits.cloud_cover ?? "%",
                  }
                : undefined,
            windSpeed:
              current.wind_speed_10m !== undefined
                ? {
                    value: current.wind_speed_10m,
                    unit: currentUnits.wind_speed_10m ?? windSpeedUnit,
                  }
                : undefined,
            windDirectionDegrees: current.wind_direction_10m,
            windGusts:
              current.wind_gusts_10m !== undefined
                ? {
                    value: current.wind_gusts_10m,
                    unit:
                      currentUnits.wind_gusts_10m ??
                      currentUnits.wind_speed_10m,
                  }
                : undefined,
          }
        : undefined,
      forecast: dailyForecast,
      summary: `Fetched Open-Meteo weather for ${compactLocationName(location)}.`,
    };
  },
});
