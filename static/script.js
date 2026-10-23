(() => {
  "use strict";

  const byId = (id) => document.getElementById(id);
  const elements = {
    searchForm: byId("city-search"),
    cityInput: byId("city-input"),
    searchFeedback: byId("search-feedback"),
    locationButton: byId("location-button"),
    weatherCity: byId("weather-city"),
    weatherDate: byId("weather-date"),
    weatherIcon: byId("weather-icon"),
    weatherTemp: byId("weather-temp"),
    weatherCondition: byId("weather-condition"),
    weatherFeels: byId("weather-feels"),
    weatherHumidity: byId("weather-humidity"),
    weatherWind: byId("weather-wind"),
    weatherPressure: byId("weather-pressure"),
    weatherVisibility: byId("weather-visibility"),
    weatherUpdated: byId("weather-updated"),
    dataStatus: byId("data-status"),
    insightsStatus: document.querySelector(".demo-insights"),
    weatherCard: document.querySelector(".current-card"),
    forecastGrid: byId("forecast-grid"),
    forecastCaption: byId("forecast-caption"),
    insightTemperature: byId("insight-temperature"),
    insightTemperatureCopy: byId("insight-temperature-copy"),
    insightRain: byId("insight-rain"),
    insightRainCopy: byId("insight-rain-copy"),
    insightWind: byId("insight-wind"),
    insightWindCopy: byId("insight-wind-copy"),
    insightOutdoors: byId("insight-outdoors"),
    insightOutdoorsCopy: byId("insight-outdoors-copy"),
    menuToggle: document.querySelector(".menu-toggle"),
    primaryNavigation: byId("primary-navigation"),
    generateButton: byId("generate-button"),
    podcastFeedback: byId("podcast-feedback"),
    episodeTitle: byId("episode-title"),
    episodeCity: byId("episode-city"),
    episodeTranscript: byId("episode-transcript"),
    transcriptPanel: byId("transcript-panel"),
    playButton: byId("play-button"),
    pauseButton: byId("pause-button"),
    stopButton: byId("stop-button"),
    playerFeedback: byId("player-feedback"),
    voiceSelect: byId("voice-select"),
    speedSelect: byId("speed-select"),
    languageSelect: byId("language-select"),
    recentEmpty: byId("recent-empty"),
    recentList: byId("recent-list"),
    recentCount: byId("recent-count"),
    footerYear: byId("footer-year")
  };

  const speech = "speechSynthesis" in window ? window.speechSynthesis : null;
  const briefingHistory = [];
  let currentWeather = null;
  let currentLocation = "";
  let currentBriefing = null;
  let availableVoices = [];
  let activeUtterance = null;
  let speechToken = 0;
  let weatherLoading = false;

  const weatherDescriptions = {
    0: ["Clear sky", "☀"],
    1: ["Mainly clear", "☀"],
    2: ["Partly cloudy", "◐"],
    3: ["Overcast", "☁"],
    45: ["Foggy", "≋"],
    48: ["Icy fog", "≋"],
    51: ["Light drizzle", "☂"],
    53: ["Drizzle", "☂"],
    55: ["Dense drizzle", "☂"],
    56: ["Freezing drizzle", "❄"],
    57: ["Freezing drizzle", "❄"],
    61: ["Light rain", "☂"],
    63: ["Moderate rain", "☂"],
    65: ["Heavy rain", "☂"],
    66: ["Freezing rain", "❄"],
    67: ["Freezing rain", "❄"],
    71: ["Light snow", "❄"],
    73: ["Snow", "❄"],
    75: ["Heavy snow", "❄"],
    77: ["Snow grains", "❄"],
    80: ["Light showers", "☂"],
    81: ["Showers", "☂"],
    82: ["Heavy showers", "☂"],
    85: ["Snow showers", "❄"],
    86: ["Heavy snow showers", "❄"],
    95: ["Thunderstorm", "ϟ"],
    96: ["Thunderstorm with hail", "ϟ"],
    99: ["Thunderstorm with hail", "ϟ"]
  };

  const setFeedback = (message, isError = false) => {
    if (!elements.searchFeedback) return;
    elements.searchFeedback.textContent = message;
    elements.searchFeedback.classList.toggle("error", isError);
  };

  const weatherForCode = (code) => weatherDescriptions[code] || ["Variable conditions", "☁"];

  const formatNumber = (value, digits = 0) => {
    if (value === null || value === undefined || value === "") return "—";
    const number = Number(value);
    return Number.isFinite(number) ? number.toFixed(digits) : "—";
  };

  const numericValue = (value) => {
    if (value === null || value === undefined || value === "") return NaN;
    const number = Number(value);
    return Number.isFinite(number) ? number : NaN;
  };

  const setWeatherLoading = (isLoading, message = "") => {
    weatherLoading = isLoading;
    if (elements.cityInput) elements.cityInput.disabled = isLoading;
    const searchButton = elements.searchForm?.querySelector('button[type="submit"]');
    if (searchButton) {
      searchButton.disabled = isLoading;
      searchButton.setAttribute("aria-busy", String(isLoading));
      searchButton.textContent = isLoading ? "Loading…" : "Get forecast ↗";
    }
    if (elements.locationButton) {
      elements.locationButton.disabled = isLoading;
      elements.locationButton.setAttribute("aria-busy", String(isLoading));
    }
    if (message) setFeedback(message);
  };

  const requestJSON = async (url, signal, failureMessage) => {
    const controller = new AbortController();
    const abortWithParent = () => controller.abort();
    if (signal?.aborted) throw new DOMException("Request cancelled", "AbortError");
    signal?.addEventListener("abort", abortWithParent, { once: true });
    const timeoutId = window.setTimeout(() => controller.abort(), 12000);

    try {
      const response = await fetch(url, { signal: controller.signal });

      let data;
      try {
        data = await response.json();
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") throw error;
        throw new Error("The weather service returned an unreadable response. Please try again.");
      }

      if (!data || typeof data !== "object" || Array.isArray(data)) {
        throw new Error("The weather service returned invalid data. Please try again.");
      }
      if (!response.ok || data.error) {
        const reason = typeof data.reason === "string" ? data.reason : failureMessage;
        throw new Error(reason);
      }
      return data;
    } catch (error) {
      if (signal?.aborted) throw error;
      if (controller.signal.aborted) {
        throw new Error("The weather request timed out. Check your connection and try again.");
      }
      if (error instanceof TypeError) {
        throw new Error("Your browser couldn’t access Open-Meteo. Check your connection or browser network/CORS restrictions, then try again.");
      }
      if (error instanceof Error) throw error;
      throw new Error(failureMessage);
    } finally {
      window.clearTimeout(timeoutId);
      signal?.removeEventListener("abort", abortWithParent);
    }
  };

  const formatDate = (dateText) => {
    const date = new Date(`${dateText}T12:00:00Z`);
    if (Number.isNaN(date.getTime())) return dateText;
    return new Intl.DateTimeFormat(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      timeZone: "UTC"
    }).format(date);
  };

  const localizedDate = (dateText, language) => {
    const date = new Date(`${dateText}T12:00:00Z`);
    if (Number.isNaN(date.getTime())) return dateText;
    return new Intl.DateTimeFormat(language === "hi" ? "hi-IN" : "en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      timeZone: "UTC"
    }).format(date);
  };

  const setDataStatus = (isLive) => {
    if (elements.dataStatus) {
      elements.dataStatus.classList.toggle("live", isLive);
      elements.dataStatus.innerHTML = `<span class="status-dot"></span>${isLive ? "Live weather" : "Demo weather"}`;
    }
    if (elements.insightsStatus) {
      elements.insightsStatus.classList.toggle("live", isLive);
      elements.insightsStatus.innerHTML = `<span class="status-dot"></span>${isLive ? "Live insights" : "Demo insights"}`;
    }
    if (elements.weatherCard) elements.weatherCard.classList.toggle("is-live", isLive);
  };

  const createForecastCard = (forecast) => {
    const [description, icon] = weatherForCode(forecast.weather_code);
    const card = document.createElement("article");
    card.className = "forecast-card";

    const day = document.createElement("span");
    day.className = "forecast-day";
    day.textContent = formatDate(forecast.date);

    const symbol = document.createElement("span");
    symbol.className = `forecast-icon ${icon === "☂" ? "rainy" : icon === "☀" ? "sunny" : "partly"}`;
    symbol.setAttribute("aria-hidden", "true");
    symbol.textContent = icon;

    const condition = document.createElement("span");
    condition.className = "forecast-condition";
    condition.textContent = description;

    const range = document.createElement("div");
    range.className = "forecast-range";
    const high = document.createElement("strong");
    high.textContent = `${formatNumber(forecast.temperature_2m_max)}°`;
    const low = document.createElement("span");
    low.textContent = `${formatNumber(forecast.temperature_2m_min)}°`;
    range.append(high, low);
    card.append(day, symbol, condition, range);
    return card;
  };

  const updateInsights = (current, daily) => {
    const temperature = numericValue(current.temperature_2m);
    const rainProbability = numericValue(daily.precipitation_probability_max?.[0]);
    const wind = numericValue(current.wind_speed_10m);
    const description = weatherForCode(current.weather_code)[0].toLowerCase();

    if (elements.insightTemperature && elements.insightTemperatureCopy && Number.isFinite(temperature)) {
      elements.insightTemperature.textContent = `${temperature > 0 ? "A gentle " : ""}${Math.round(temperature)}°`;
      elements.insightTemperatureCopy.textContent = temperature >= 25
        ? "A warmer day—take it easy in the sun."
        : temperature < 10
          ? "A cooler day; a warm layer may help."
          : "Comfortable for getting out and about.";
    }

    if (elements.insightRain && elements.insightRainCopy && Number.isFinite(rainProbability)) {
      elements.insightRain.textContent = rainProbability >= 50 ? "Keep an umbrella handy" : "A small chance";
      elements.insightRainCopy.textContent = `About ${Math.round(rainProbability)}% chance of rain today.`;
      const meter = document.querySelector(".rain-meter span");
      if (meter) meter.style.width = `${Math.max(0, Math.min(100, rainProbability))}%`;
    } else if (elements.insightRain && elements.insightRainCopy) {
      elements.insightRain.textContent = "Not available";
      elements.insightRainCopy.textContent = "Rain probability wasn’t provided.";
      const meter = document.querySelector(".rain-meter span");
      if (meter) meter.style.width = "0%";
    }

    if (elements.insightWind && elements.insightWindCopy && Number.isFinite(wind)) {
      elements.insightWind.textContent = wind >= 30 ? "A blustery day" : wind >= 17 ? "A breezy day" : "Easy-breezy";
      elements.insightWindCopy.textContent = `${formatNumber(wind)} km/h winds.`;
    } else if (elements.insightWind && elements.insightWindCopy) {
      elements.insightWind.textContent = "Not available";
      elements.insightWindCopy.textContent = "Wind data wasn’t provided.";
    }

    const temperatureBars = document.querySelectorAll(".mini-chart i");
    const forecastHighs = Array.isArray(daily.temperature_2m_max)
      ? daily.temperature_2m_max.slice(0, temperatureBars.length).map(numericValue)
      : [];
    const validHighs = forecastHighs.filter(Number.isFinite);
    const lowestHigh = Math.min(...validHighs);
    const highestHigh = Math.max(...validHighs);
    temperatureBars.forEach((bar, index) => {
      const high = forecastHighs[index];
      if (!Number.isFinite(high)) {
        bar.hidden = true;
        return;
      }
      bar.hidden = false;
      const span = highestHigh - lowestHigh;
      const height = span === 0 ? 50 : 30 + ((high - lowestHigh) / span) * 60;
      bar.style.setProperty("--bar", `${height}%`);
    });

    if (elements.insightOutdoors && elements.insightOutdoorsCopy) {
      const wetOrStormy = /rain|drizzle|thunder|snow|shower/.test(description);
      elements.insightOutdoors.textContent = wetOrStormy ? "Keep plans flexible" : "Take the scenic route";
      elements.insightOutdoorsCopy.textContent = wetOrStormy
        ? "Check conditions before heading out."
        : "A lovely day for a little fresh air.";
    }
  };

  const renderWeather = ({ locationName, country, weather }) => {
    const current = weather?.current;
    const daily = weather?.daily;
    const requiredForecastDays = Array.isArray(daily?.time) ? Math.min(daily.time.length, 5) : 0;
    if (!current || !Number.isFinite(numericValue(current.temperature_2m)) ||
        !Number.isFinite(numericValue(current.weather_code)) ||
        !daily || !Array.isArray(daily.time) || daily.time.length === 0 ||
        !Array.isArray(daily.weather_code) || !Array.isArray(daily.temperature_2m_max) ||
        !Array.isArray(daily.temperature_2m_min) ||
        daily.weather_code.length < requiredForecastDays ||
        daily.temperature_2m_max.length < requiredForecastDays ||
        daily.temperature_2m_min.length < requiredForecastDays) {
      throw new Error("The weather service returned an incomplete forecast. Please try again.");
    }

    stopSpeech();
    currentWeather = weather;
    currentLocation = country ? `${locationName}, ${country}` : locationName;
    currentBriefing = null;
    if (elements.episodeTitle) elements.episodeTitle.textContent = "A moment with the weather";
    if (elements.episodeCity) elements.episodeCity.textContent = "Generate a briefing from this live forecast";
    if (elements.episodeTranscript) elements.episodeTranscript.textContent = "";
    if (elements.transcriptPanel) {
      elements.transcriptPanel.hidden = true;
      elements.transcriptPanel.open = false;
    }
    setPlayerEnabled(false);
    if (elements.playerFeedback) elements.playerFeedback.textContent = "Generate a briefing to listen";
    if (elements.podcastFeedback) {
      elements.podcastFeedback.textContent = `Live weather loaded for ${currentLocation}. Generate a briefing when you’re ready.`;
    }

    const [description, icon] = weatherForCode(current.weather_code);
    if (elements.weatherCity) {
      elements.weatherCity.textContent = country ? `${locationName}, ${country}` : locationName;
    }
    if (elements.weatherDate) {
      elements.weatherDate.textContent = new Intl.DateTimeFormat(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric",
        timeZone: weather.timezone || undefined
      }).format(new Date());
    }
    if (elements.weatherIcon) elements.weatherIcon.textContent = icon;
    if (elements.weatherTemp) elements.weatherTemp.textContent = formatNumber(current.temperature_2m);
    if (elements.weatherCondition) elements.weatherCondition.textContent = description;
    if (elements.weatherFeels) elements.weatherFeels.textContent = `${formatNumber(current.apparent_temperature)}°C`;
    if (elements.weatherHumidity) elements.weatherHumidity.textContent = `${formatNumber(current.relative_humidity_2m)}%`;
    if (elements.weatherWind) elements.weatherWind.textContent = `${formatNumber(current.wind_speed_10m)} km/h`;
    if (elements.weatherPressure) elements.weatherPressure.textContent = `${formatNumber(current.surface_pressure)} hPa`;
    if (elements.weatherVisibility) {
      elements.weatherVisibility.textContent = Number.isFinite(numericValue(current.visibility))
        ? `${formatNumber(numericValue(current.visibility) / 1000, 1)} km`
        : "—";
    }
    if (elements.weatherUpdated) elements.weatherUpdated.textContent = "Updated just now";
    if (elements.forecastGrid) {
      const forecast = daily.time.slice(0, 5).map((date, index) => ({
        date,
        weather_code: daily.weather_code?.[index],
        temperature_2m_max: daily.temperature_2m_max?.[index],
        temperature_2m_min: daily.temperature_2m_min?.[index]
      }));
      elements.forecastGrid.replaceChildren(...forecast.map(createForecastCard));
    }
    if (elements.forecastCaption) elements.forecastCaption.textContent = "Five-day outlook · live data";
    updateInsights(current, daily);
    setDataStatus(true);
  };

  const fetchWeather = async (latitude, longitude, signal) => {
    const params = new URLSearchParams({
      latitude: String(latitude),
      longitude: String(longitude),
      current: "temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,surface_pressure,visibility",
      daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
      temperature_unit: "celsius",
      wind_speed_unit: "kmh",
      timezone: "auto",
      forecast_days: "5"
    });
    return requestJSON(
      `https://api.open-meteo.com/v1/forecast?${params}`,
      signal,
      "Weather data could not be loaded right now. Please try again."
    );
  };

  const loadCity = async (city, signal) => {
    const params = new URLSearchParams({ name: city, count: "1", language: "en", format: "json" });
    const result = await requestJSON(
      `https://geocoding-api.open-meteo.com/v1/search?${params}`,
      signal,
      "City search is temporarily unavailable. Please try again."
    );
    if (!Array.isArray(result.results)) {
      throw new Error("City search returned incomplete location data. Please try again.");
    }
    const location = result.results[0];
    if (!location) throw new Error(`We couldn't find “${city}”. Check the spelling and try another city.`);
    if (!Number.isFinite(numericValue(location.latitude)) || !Number.isFinite(numericValue(location.longitude))) {
      throw new Error("City search returned invalid coordinates. Please try another city.");
    }
    if (typeof location.name !== "string" || !location.name.trim()) {
      throw new Error("City search returned an invalid city name. Please try another city.");
    }

    const weather = await fetchWeather(location.latitude, location.longitude, signal);
    renderWeather({
      locationName: location.name,
      country: location.country,
      weather
    });
    return location.name;
  };

  const validCity = (city) => /^[\p{L}\p{M}][\p{L}\p{M}\s.'’\-]{0,79}$/u.test(city);

  const setPlayerEnabled = (enabled) => {
    const playable = enabled && Boolean(speech) && typeof SpeechSynthesisUtterance === "function";
    [elements.playButton, elements.pauseButton, elements.stopButton].forEach((button) => {
      if (button) button.disabled = !playable;
    });
  };

  const stopSpeech = () => {
    speechToken += 1;
    activeUtterance = null;
    if (speech) speech.cancel();
  };

  const localizedNumber = (value, language, digits = 0) => {
    const number = numericValue(value);
    if (!Number.isFinite(number)) return "";
    return new Intl.NumberFormat(language === "hi" ? "hi-IN" : "en-US", {
      maximumFractionDigits: digits,
      minimumFractionDigits: digits
    }).format(number);
  };

  const hindiCondition = (code) => ({
    0: "साफ़ आसमान",
    1: "मुख्य रूप से साफ़",
    2: "आंशिक रूप से बादल",
    3: "बादल छाए हुए",
    45: "कोहरा",
    48: "बर्फ़ीला कोहरा",
    51: "हल्की बूंदाबांदी",
    53: "बूंदाबांदी",
    55: "घनी बूंदाबांदी",
    56: "हल्की बर्फ़ीली बूंदाबांदी",
    57: "बर्फ़ीली बूंदाबांदी",
    61: "हल्की बारिश",
    63: "मध्यम बारिश",
    65: "तेज़ बारिश",
    66: "बर्फ़ीली बारिश",
    67: "तेज़ बर्फ़ीली बारिश",
    71: "हल्की बर्फ़बारी",
    73: "बर्फ़बारी",
    75: "तेज़ बर्फ़बारी",
    77: "बर्फ़ के कण",
    80: "हल्की बारिश की बौछारें",
    81: "बारिश की बौछारें",
    82: "तेज़ बारिश की बौछारें",
    85: "हल्की बर्फ़ीली बौछारें",
    86: "तेज़ बर्फ़ीली बौछारें",
    95: "आंधी-तूफ़ान",
    96: "ओलों के साथ आंधी-तूफ़ान",
    99: "तेज़ ओलों के साथ आंधी-तूफ़ान"
  })[Number(code)] || "बदलता मौसम";

  const createBriefing = (weather, location, language) => {
    const current = weather.current;
    const daily = weather.daily;
    const locale = language === "hi" ? "hi-IN" : "en-US";
    const currentDate = current.time ? new Date(current.time) : new Date();
    const date = new Intl.DateTimeFormat(locale, {
      weekday: "long",
      month: "long",
      day: "numeric",
      timeZone: weather.timezone || undefined
    }).format(currentDate);
    const temperature = localizedNumber(current.temperature_2m, language);
    const feelsLike = localizedNumber(current.apparent_temperature, language);
    const humidity = localizedNumber(current.relative_humidity_2m, language);
    const wind = localizedNumber(current.wind_speed_10m, language);
    const pressure = localizedNumber(current.surface_pressure, language);
    const rainProbability = localizedNumber(daily.precipitation_probability_max?.[0], language);
    const weatherText = language === "hi"
      ? hindiCondition(current.weather_code)
      : weatherForCode(current.weather_code)[0].toLowerCase();

    let text;
    if (language === "hi") {
      text = `नमस्ते। यह ${location} के लिए ${date} की WeatherCast मौसम रिपोर्ट है।`;
      if (temperature) text += ` वर्तमान तापमान ${temperature} डिग्री सेल्सियस है और मौसम ${weatherText} है।`;
      if (feelsLike) text += ` महसूस होने वाला तापमान ${feelsLike} डिग्री है।`;
      if (humidity) text += ` नमी ${humidity} प्रतिशत है।`;
      if (wind) text += ` हवा की गति ${wind} किलोमीटर प्रति घंटा है।`;
      if (pressure) text += ` वायुदाब ${pressure} हेक्टोपास्कल है।`;
      if (rainProbability) text += ` आज बारिश की संभावना ${rainProbability} प्रतिशत है।`;
      const outlook = daily.time.slice(1, 4).map((day, index) => {
        const high = localizedNumber(daily.temperature_2m_max?.[index + 1], language);
        const low = localizedNumber(daily.temperature_2m_min?.[index + 1], language);
        if (!high || !low) return "";
        const dayName = localizedDate(day, language);
        return `${dayName} को ${hindiCondition(daily.weather_code?.[index + 1])}, अधिकतम ${high} और न्यूनतम ${low} डिग्री`;
      }).filter(Boolean);
      if (outlook.length) text += ` आने वाले दिनों का अनुमान: ${outlook.join("। ")}।`;
      text += " आपका दिन अच्छा बीते।";
    } else {
      text = `Good day. This is your WeatherCast briefing for ${location}, for ${date}.`;
      if (temperature) text += ` The current temperature is ${temperature} degrees Celsius with ${weatherText}.`;
      if (feelsLike) text += ` It feels like ${feelsLike} degrees.`;
      if (humidity) text += ` Humidity is ${humidity} percent.`;
      if (wind) text += ` Wind speed is ${wind} kilometers per hour.`;
      if (pressure) text += ` Atmospheric pressure is ${pressure} hectopascals.`;
      if (rainProbability) text += ` The chance of rain today is ${rainProbability} percent.`;
      const outlook = daily.time.slice(1, 4).map((day, index) => {
        const high = localizedNumber(daily.temperature_2m_max?.[index + 1], language);
        const low = localizedNumber(daily.temperature_2m_min?.[index + 1], language);
        if (!high || !low) return "";
        const [description] = weatherForCode(daily.weather_code?.[index + 1]);
        return `${localizedDate(day, language)}: ${description.toLowerCase()}, a high of ${high} and a low of ${low} degrees`;
      }).filter(Boolean);
      if (outlook.length) text += ` Looking ahead: ${outlook.join(". ")}.`;
      text += " Have a lovely day.";
    }

    return {
      id: `${Date.now()}-${briefingHistory.length}`,
      location,
      date,
      language,
      weather,
      text,
      createdAt: new Date()
    };
  };

  const showBriefing = (briefing) => {
    currentBriefing = briefing;
    if (elements.episodeTitle) {
      elements.episodeTitle.textContent = `${briefing.location.split(",")[0]} weather briefing`;
    }
    if (elements.episodeCity) {
      elements.episodeCity.textContent = `${briefing.date} · ${briefing.language === "hi" ? "हिन्दी" : "English"}`;
    }
    if (elements.episodeTranscript) elements.episodeTranscript.textContent = briefing.text;
    if (elements.transcriptPanel) {
      elements.transcriptPanel.hidden = false;
      elements.transcriptPanel.open = true;
    }
    setPlayerEnabled(true);
  };

  const updateRecentCount = () => {
    if (elements.recentCount) {
      elements.recentCount.textContent = `${briefingHistory.length} ${briefingHistory.length === 1 ? "episode" : "episodes"}`;
    }
    if (elements.recentEmpty) elements.recentEmpty.hidden = briefingHistory.length > 0;
  };

  const addBriefingToHistory = (briefing) => {
    if (!elements.recentList) return;
    briefingHistory.unshift(briefing);
    if (briefingHistory.length > 5) briefingHistory.pop();

    const card = document.createElement("article");
    card.className = "history-card glass-card";
    const icon = document.createElement("span");
    icon.className = "history-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = "♫";

    const details = document.createElement("div");
    details.className = "history-details";
    const title = document.createElement("h3");
    title.textContent = `${briefing.location.split(",")[0]} weather briefing`;
    const description = document.createElement("p");
    description.textContent = `${briefing.date} · ${briefing.language === "hi" ? "हिन्दी" : "English"} · Browser speech`;
    details.append(title, description);

    const playAgain = document.createElement("button");
    playAgain.className = "history-play";
    playAgain.type = "button";
    playAgain.dataset.episodeId = briefing.id;
    playAgain.textContent = "Listen again";
    card.append(icon, details, playAgain);
    elements.recentList.prepend(card);

    while (elements.recentList.children.length > 5) {
      elements.recentList.lastElementChild.remove();
    }
    updateRecentCount();
  };

  const playBriefing = (briefing = currentBriefing) => {
    if (!briefing) {
      if (elements.playerFeedback) elements.playerFeedback.textContent = "Generate a briefing from live weather first";
      return;
    }
    if (!speech) {
      if (elements.playerFeedback) elements.playerFeedback.textContent = "Speech synthesis isn’t supported in this browser";
      return;
    }
    if (typeof SpeechSynthesisUtterance !== "function") {
      if (elements.playerFeedback) elements.playerFeedback.textContent = "Speech synthesis isn’t supported in this browser";
      return;
    }
    if (briefing.language === "hi" && !availableVoices.some((voice) => voice.lang.toLowerCase().startsWith("hi"))) {
      if (elements.playerFeedback) {
        elements.playerFeedback.textContent = "No Hindi speech voice is installed. The Hindi transcript is ready to read.";
      }
      return;
    }
    if (speech.speaking && speech.paused) {
      try {
        speech.resume();
        if (elements.playerFeedback) elements.playerFeedback.textContent = "Resuming browser speech…";
      } catch (error) {
        const reason = error instanceof Error ? ` ${error.message}` : "";
        if (elements.playerFeedback) elements.playerFeedback.textContent = `Could not resume speech.${reason}`;
      }
      return;
    }

    stopSpeech();
    const token = speechToken;
    activeUtterance = new SpeechSynthesisUtterance(briefing.text);
    activeUtterance.lang = briefing.language === "hi" ? "hi-IN" : "en-US";
    activeUtterance.rate = Number(elements.speedSelect?.value) || 1;
    const selectedVoice = availableVoices.find((voice) => voice.voiceURI === elements.voiceSelect?.value);
    if (selectedVoice) activeUtterance.voice = selectedVoice;

    activeUtterance.onstart = () => {
      if (token === speechToken && elements.playerFeedback) {
        elements.playerFeedback.textContent = "Speaking with your browser voice…";
      }
    };
    activeUtterance.onend = () => {
      if (token !== speechToken) return;
      activeUtterance = null;
      if (elements.playerFeedback) elements.playerFeedback.textContent = "Briefing finished";
    };
    activeUtterance.onerror = (event) => {
      if (token !== speechToken || event.error === "canceled" || event.error === "interrupted") return;
      activeUtterance = null;
      if (elements.playerFeedback) {
        elements.playerFeedback.textContent = `Speech playback failed: ${event.error || "unknown error"}.`;
      }
    };

    if (elements.playerFeedback) elements.playerFeedback.textContent = "Starting browser speech…";
    try {
      speech.speak(activeUtterance);
    } catch (error) {
      activeUtterance = null;
      const reason = error instanceof Error ? ` ${error.message}` : "";
      if (elements.playerFeedback) elements.playerFeedback.textContent = `Could not start speech.${reason}`;
    }
  };

  const refreshAvailableVoices = () => {
    if (!speech || !elements.voiceSelect) return;
    availableVoices = speech.getVoices();
    const language = elements.languageSelect?.value === "hi" ? "hi" : "en";
    const previousVoice = elements.voiceSelect.value;
    const matchingVoices = availableVoices.filter((voice) => voice.lang.toLowerCase().startsWith(language));
    elements.voiceSelect.replaceChildren();

    if (matchingVoices.length === 0) {
      const fallback = document.createElement("option");
      fallback.value = "";
      fallback.textContent = language === "hi" ? "System default (Hindi may vary)" : "System default voice";
      elements.voiceSelect.append(fallback);
      return;
    }

    matchingVoices.forEach((voice) => {
      const option = document.createElement("option");
      option.value = voice.voiceURI;
      option.textContent = `${voice.name} (${voice.lang})`;
      elements.voiceSelect.append(option);
    });
    if (matchingVoices.some((voice) => voice.voiceURI === previousVoice)) {
      elements.voiceSelect.value = previousVoice;
    }
  };

  if (speech) {
    refreshAvailableVoices();
    speech.onvoiceschanged = refreshAvailableVoices;
  } else if (elements.voiceSelect) {
    const unsupported = document.createElement("option");
    unsupported.textContent = "Speech not supported";
    unsupported.value = "";
    elements.voiceSelect.replaceChildren(unsupported);
    elements.voiceSelect.disabled = true;
  }

  if (elements.searchForm && elements.cityInput) {
    elements.searchForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (weatherLoading) return;
      const city = elements.cityInput.value.trim();
      if (!city) {
        setFeedback("Enter a city name to see its forecast.", true);
        elements.cityInput.focus();
        return;
      }
      if (!validCity(city)) {
        setFeedback("Use a city name with letters, spaces, apostrophes, or hyphens.", true);
        elements.cityInput.focus();
        return;
      }
      const controller = new AbortController();
      setWeatherLoading(true, `Looking up ${city}…`);
      try {
        const cityName = await loadCity(city, controller.signal);
        setFeedback(`Showing live weather for ${cityName}.`);
        document.querySelector(".weather-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
      } catch (error) {
        if (!(error instanceof Error && error.name === "AbortError")) {
          setFeedback(error instanceof Error ? error.message : "Weather lookup failed. Please try again.", true);
        }
      } finally {
        setWeatherLoading(false);
      }
    });
  }

  if (elements.locationButton) {
    elements.locationButton.addEventListener("click", () => {
      if (weatherLoading) return;
      if (!navigator.geolocation) {
        setFeedback("Location services aren’t supported by this browser.", true);
        return;
      }
      setWeatherLoading(true, "Finding your location…");
        try {
          navigator.geolocation.getCurrentPosition(async ({ coords }) => {
            try {
              const weather = await fetchWeather(coords.latitude, coords.longitude);
              renderWeather({ locationName: "Your location", country: "", weather });
              setFeedback("Showing live weather for your location.");
              document.querySelector(".weather-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
            } catch (error) {
              setFeedback(error instanceof Error ? error.message : "Weather lookup failed. Please try again.", true);
            } finally {
              setWeatherLoading(false);
            }
          }, (error) => {
            const message = error.code === error.PERMISSION_DENIED
              ? "Location access was denied. You can search for a city instead."
              : error.code === error.POSITION_UNAVAILABLE
                ? "Your location couldn’t be determined. Try searching for a city."
                : "Location lookup timed out. Please try again or search for a city.";
            setFeedback(message, true);
            setWeatherLoading(false);
          }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 });
        } catch (error) {
          setWeatherLoading(false);
          const reason = error instanceof Error ? ` ${error.message}` : "";
          setFeedback(`Location lookup could not start.${reason} Check permissions or search for a city.`, true);
        }
      });
  }

  if (elements.menuToggle && elements.primaryNavigation) {
    elements.menuToggle.addEventListener("click", () => {
      const isOpen = elements.menuToggle.getAttribute("aria-expanded") === "true";
      elements.menuToggle.setAttribute("aria-expanded", String(!isOpen));
      elements.menuToggle.setAttribute("aria-label", isOpen ? "Open navigation menu" : "Close navigation menu");
      elements.primaryNavigation.classList.toggle("is-open", !isOpen);
    });

    elements.primaryNavigation.addEventListener("click", (event) => {
      if (event.target instanceof HTMLAnchorElement) {
        elements.menuToggle.setAttribute("aria-expanded", "false");
        elements.menuToggle.setAttribute("aria-label", "Open navigation menu");
        elements.primaryNavigation.classList.remove("is-open");
      }
    });
  }

  if (elements.generateButton && elements.podcastFeedback) {
    elements.generateButton.addEventListener("click", () => {
      if (!currentWeather || !currentLocation) {
        elements.podcastFeedback.textContent = "Search for a city or use your location to load live weather before generating a briefing.";
        return;
      }
      stopSpeech();
      const language = elements.languageSelect?.value === "hi" ? "hi" : "en";
      const briefing = createBriefing(currentWeather, currentLocation, language);
      showBriefing(briefing);
      addBriefingToHistory(briefing);
      elements.podcastFeedback.textContent = speech
        ? `Your live ${language === "hi" ? "Hindi" : "English"} briefing is ready. Choose Play to hear it; browser speech does not create an MP3.`
        : "Your live briefing script is ready, but speech playback is not supported in this browser.";
      if (elements.playerFeedback) {
        elements.playerFeedback.textContent = speech ? "Ready to listen" : "Speech synthesis isn’t supported";
      }
    });
  }

  if (elements.playButton) {
    elements.playButton.addEventListener("click", () => playBriefing());
  }

  if (elements.pauseButton) {
    elements.pauseButton.addEventListener("click", () => {
      if (!speech || !speech.speaking || speech.paused) {
        if (elements.playerFeedback) elements.playerFeedback.textContent = "There is no active speech to pause";
        return;
      }
      try {
        speech.pause();
        if (elements.playerFeedback) elements.playerFeedback.textContent = "Briefing paused · press Play to resume";
      } catch (error) {
        const reason = error instanceof Error ? ` ${error.message}` : "";
        if (elements.playerFeedback) elements.playerFeedback.textContent = `Could not pause speech.${reason}`;
      }
    });
  }

  if (elements.stopButton) {
    elements.stopButton.addEventListener("click", () => {
      stopSpeech();
      if (elements.playerFeedback) {
        elements.playerFeedback.textContent = currentBriefing ? "Briefing stopped" : "No briefing is playing";
      }
    });
  }

  if (elements.languageSelect) {
    elements.languageSelect.addEventListener("change", () => {
      refreshAvailableVoices();
      if (!currentBriefing || !currentWeather) return;
      stopSpeech();
      const updated = createBriefing(currentBriefing.weather, currentBriefing.location, elements.languageSelect.value === "hi" ? "hi" : "en");
      updated.id = currentBriefing.id;
      updated.createdAt = currentBriefing.createdAt;
      showBriefing(updated);
      if (elements.podcastFeedback) {
        elements.podcastFeedback.textContent = `Briefing script changed to ${updated.language === "hi" ? "Hindi" : "English"}. Press Play to hear it.`;
      }
      if (elements.playerFeedback) elements.playerFeedback.textContent = "Script updated · ready to listen";
    });
  }

  if (elements.voiceSelect) {
    elements.voiceSelect.addEventListener("change", () => {
      if (elements.playerFeedback) elements.playerFeedback.textContent = "Voice selection saved for the next playback";
    });
  }

  if (elements.speedSelect) {
    elements.speedSelect.addEventListener("change", () => {
      if (elements.playerFeedback) elements.playerFeedback.textContent = "Playback speed saved for the next play";
    });
  }

  if (elements.recentList) {
    elements.recentList.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-episode-id]");
      if (!button) return;
      const briefing = briefingHistory.find((item) => item.id === button.dataset.episodeId);
      if (!briefing) return;
      stopSpeech();
      showBriefing(briefing);
      playBriefing(briefing);
    });
  }

  if (elements.footerYear) elements.footerYear.textContent = String(new Date().getFullYear());
})();
