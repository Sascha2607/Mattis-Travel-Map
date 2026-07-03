(function () {
  const DATA_URL = "assets/data/world-countries.geojson";
  const STORAGE_KEY = "been-there.visitedCountries.v2";
  const EXCLUDED_CONTINENTS = new Set(["Seven seas (open ocean)"]);
  const CONTINENT_ORDER = [
    "Africa",
    "Asia",
    "Europe",
    "North America",
    "South America",
    "Oceania",
    "Antarctica",
  ];
  const CONTINENT_LABELS = {
    Africa: "Afrika",
    Asia: "Asien",
    Europe: "Europa",
    "North America": "Nordamerika",
    "South America": "Südamerika",
    Oceania: "Ozeanien",
    Antarctica: "Antarktis",
  };

  const state = {
    countries: [],
    countriesById: new Map(),
    filteredCountries: [],
    visited: loadVisited(),
    activeId: null,
    resizeTimer: null,
  };

  const els = {
    worldPercent: document.getElementById("worldPercent"),
    worldBar: document.getElementById("worldBar"),
    visitedCount: document.getElementById("visitedCount"),
    totalCount: document.getElementById("totalCount"),
    continentStats: document.getElementById("continentStats"),
    countrySearch: document.getElementById("countrySearch"),
    clearSearchButton: document.getElementById("clearSearchButton"),
    markFirstButton: document.getElementById("markFirstButton"),
    clearVisitedButton: document.getElementById("clearVisitedButton"),
    countryList: document.getElementById("countryList"),
    visibleCount: document.getElementById("visibleCount"),
    mapStatus: document.getElementById("mapStatus"),
    mapWrap: document.getElementById("mapWrap"),
    worldMap: document.getElementById("worldMap"),
    tooltip: document.getElementById("tooltip"),
    loadingState: document.getElementById("loadingState"),
  };

  init();

  async function init() {
    wireEvents();

    try {
      const geoJson = await d3.json(DATA_URL);
      state.countries = geoJson.features
        .filter((feature) => !EXCLUDED_CONTINENTS.has(feature.properties.CONTINENT))
        .map(enrichCountry)
        .sort((a, b) => a.displayName.localeCompare(b.displayName, "de"));
      state.countriesById = new Map(state.countries.map((country) => [country.id, country]));
      state.visited = new Set([...state.visited].filter((id) => state.countriesById.has(id)));

      renderAll();
      drawMap();
      els.loadingState.classList.add("is-hidden");
    } catch (error) {
      console.error(error);
      els.loadingState.textContent = "Karte konnte nicht geladen werden";
    }
  }

  function enrichCountry(feature) {
    const properties = feature.properties;
    const displayName = cleanName(properties.NAME_DE) || cleanName(properties.NAME_LONG) || cleanName(properties.NAME);
    const nativeName = cleanName(properties.NAME);
    const continent = cleanName(properties.CONTINENT) || "Other";
    const id = cleanName(properties.ADM0_A3) || cleanName(properties.ISO_A3) || cleanName(properties.NE_ID) || displayName;
    const aliases = [
      displayName,
      nativeName,
      cleanName(properties.NAME_LONG),
      cleanName(properties.ADMIN),
      cleanName(properties.FORMAL_EN),
      cleanName(properties.ISO_A2),
      cleanName(properties.ISO_A3),
      cleanName(properties.ADM0_A3),
    ];

    return {
      id,
      feature,
      displayName,
      nativeName,
      continent,
      searchText: normalizeText(aliases.filter(Boolean).join(" ")),
    };
  }

  function wireEvents() {
    els.countrySearch.addEventListener("input", renderCountryList);
    els.countrySearch.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        markFirstMatch();
      }
    });
    els.clearSearchButton.addEventListener("click", () => {
      els.countrySearch.value = "";
      renderCountryList();
      els.countrySearch.focus();
    });
    els.markFirstButton.addEventListener("click", markFirstMatch);
    els.clearVisitedButton.addEventListener("click", clearVisited);
    window.addEventListener("resize", scheduleMapRedraw);
  }

  function renderAll() {
    renderStats();
    renderCountryList();
    updateMapClasses();
  }

  function renderStats() {
    const total = state.countries.length;
    const visitedCount = getVisitedCount();
    const worldPercent = toPercent(visitedCount, total);

    els.worldPercent.textContent = `${worldPercent}%`;
    els.worldBar.style.width = `${worldPercent}%`;
    els.visitedCount.textContent = `${visitedCount} besucht`;
    els.totalCount.textContent = `${total} gesamt`;
    els.mapStatus.textContent = `${visitedCount} markiert`;
    els.clearVisitedButton.disabled = visitedCount === 0;

    renderContinentStats();
  }

  function renderContinentStats() {
    const fragment = document.createDocumentFragment();

    CONTINENT_ORDER.forEach((continent) => {
      const countries = state.countries.filter((country) => country.continent === continent);
      if (!countries.length) return;

      const visitedCount = countries.filter((country) => state.visited.has(country.id)).length;
      const percent = toPercent(visitedCount, countries.length);

      const item = document.createElement("div");
      item.className = "continent-item";

      const name = document.createElement("div");
      name.className = "continent-name";
      name.textContent = CONTINENT_LABELS[continent] || continent;

      const percentEl = document.createElement("div");
      percentEl.className = "continent-percent";
      percentEl.textContent = `${percent}%`;

      const meta = document.createElement("div");
      meta.className = "continent-meta";
      meta.textContent = `${visitedCount}/${countries.length}`;

      const track = document.createElement("div");
      track.className = "continent-track";

      const fill = document.createElement("div");
      fill.className = "continent-fill";
      fill.style.width = `${percent}%`;

      track.append(fill);
      item.append(name, percentEl, meta, track);
      fragment.append(item);
    });

    els.continentStats.replaceChildren(fragment);
  }

  function renderCountryList() {
    const query = normalizeText(els.countrySearch.value);
    state.filteredCountries = query
      ? state.countries.filter((country) => country.searchText.includes(query))
      : state.countries;

    els.visibleCount.textContent = `${state.filteredCountries.length}`;
    els.markFirstButton.disabled = state.filteredCountries.length === 0;

    if (!state.filteredCountries.length) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = "Kein Treffer";
      els.countryList.replaceChildren(empty);
      return;
    }

    const fragment = document.createDocumentFragment();
    state.filteredCountries.forEach((country) => {
      const isVisited = state.visited.has(country.id);
      const row = document.createElement("button");
      row.type = "button";
      row.className = `country-row${isVisited ? " is-visited" : ""}${state.activeId === country.id ? " is-active" : ""}`;
      row.dataset.id = country.id;
      row.setAttribute("aria-pressed", String(isVisited));

      const check = document.createElement("span");
      check.className = "country-check";
      check.setAttribute("aria-hidden", "true");
      check.textContent = "✓";

      const copy = document.createElement("span");
      copy.className = "country-copy";

      const title = document.createElement("strong");
      title.textContent = country.displayName;

      const meta = document.createElement("span");
      meta.textContent = CONTINENT_LABELS[country.continent] || country.continent;

      copy.append(title, meta);
      row.append(check, copy);
      row.addEventListener("click", () => toggleVisited(country.id));
      row.addEventListener("mouseenter", () => setActiveCountry(country.id));
      row.addEventListener("mouseleave", () => setActiveCountry(null));
      fragment.append(row);
    });

    els.countryList.replaceChildren(fragment);
  }

  function drawMap() {
    if (!state.countries.length) return;

    const width = Math.max(320, els.mapWrap.clientWidth);
    const height = Math.max(320, els.mapWrap.clientHeight);
    const svg = d3.select(els.worldMap);
    const projection = d3
      .geoNaturalEarth1()
      .precision(0.5)
      .fitExtent(
        [
          [18, 18],
          [width - 18, height - 18],
        ],
        { type: "Sphere" },
      );
    const path = d3.geoPath(projection);

    svg.attr("viewBox", `0 0 ${width} ${height}`).selectAll("*").remove();

    svg.append("path").datum({ type: "Sphere" }).attr("class", "sphere").attr("d", path);
    svg.append("path").datum(d3.geoGraticule10()).attr("class", "graticule").attr("d", path);

    svg
      .append("g")
      .attr("class", "countries")
      .selectAll("path")
      .data(state.countries, (country) => country.id)
      .join("path")
      .attr("class", countryClassName)
      .attr("d", (country) => path(country.feature))
      .attr("tabindex", 0)
      .attr("role", "button")
      .attr("aria-pressed", (country) => String(state.visited.has(country.id)))
      .attr("aria-label", (country) => `${country.displayName}, ${CONTINENT_LABELS[country.continent] || country.continent}`)
      .on("click", (event, country) => {
        event.stopPropagation();
        toggleVisited(country.id);
      })
      .on("keydown", (event, country) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          toggleVisited(country.id);
        }
      })
      .on("mouseenter", (event, country) => {
        setActiveCountry(country.id);
        showTooltip(event, country);
      })
      .on("mousemove", moveTooltip)
      .on("mouseleave", () => {
        setActiveCountry(null);
        hideTooltip();
      });

    // Keeps tiny island countries clickable without changing the visual map shape.
    svg
      .append("g")
      .attr("class", "hit-points")
      .selectAll("circle")
      .data(
        state.countries.filter((country) => path.area(country.feature) < 16),
        (country) => country.id,
      )
      .join("circle")
      .attr("cx", (country) => projection(d3.geoCentroid(country.feature))[0])
      .attr("cy", (country) => projection(d3.geoCentroid(country.feature))[1])
      .attr("r", 4)
      .attr("fill", "transparent")
      .attr("stroke", "transparent")
      .style("cursor", "pointer")
      .on("click", (event, country) => {
        event.stopPropagation();
        toggleVisited(country.id);
      })
      .on("mouseenter", (event, country) => {
        setActiveCountry(country.id);
        showTooltip(event, country);
      })
      .on("mousemove", moveTooltip)
      .on("mouseleave", () => {
        setActiveCountry(null);
        hideTooltip();
      });

    updateMapClasses();
  }

  function toggleVisited(id) {
    if (state.visited.has(id)) {
      state.visited.delete(id);
    } else {
      state.visited.add(id);
    }

    saveVisited();
    renderStats();
    renderCountryList();
    updateMapClasses();
  }

  function markFirstMatch() {
    const firstMatch = state.filteredCountries[0];
    if (!firstMatch) return;

    state.visited.add(firstMatch.id);
    saveVisited();
    renderStats();
    renderCountryList();
    updateMapClasses();
    setActiveCountry(firstMatch.id);
  }

  function clearVisited() {
    if (!state.visited.size) return;

    state.visited.clear();
    saveVisited();
    renderAll();
  }

  function updateMapClasses() {
    d3.select(els.worldMap)
      .selectAll(".country")
      .attr("class", countryClassName)
      .attr("aria-pressed", (country) => String(state.visited.has(country.id)));
  }

  function countryClassName(country) {
    return [
      "country",
      state.visited.has(country.id) ? "is-visited" : "",
      state.activeId === country.id ? "is-active" : "",
    ]
      .filter(Boolean)
      .join(" ");
  }

  function setActiveCountry(id) {
    state.activeId = id;
    updateMapClasses();
    els.countryList.querySelectorAll(".country-row").forEach((row) => {
      row.classList.toggle("is-active", row.dataset.id === id);
    });
  }

  function showTooltip(event, country) {
    const status = state.visited.has(country.id) ? "besucht" : "offen";
    els.tooltip.textContent = `${country.displayName} · ${status}`;
    els.tooltip.hidden = false;
    moveTooltip(event);
  }

  function moveTooltip(event) {
    if (els.tooltip.hidden) return;

    const bounds = els.mapWrap.getBoundingClientRect();
    const x = event.clientX - bounds.left + 14;
    const y = event.clientY - bounds.top + 14;
    const maxX = bounds.width - els.tooltip.offsetWidth - 12;
    const maxY = bounds.height - els.tooltip.offsetHeight - 12;

    els.tooltip.style.left = `${Math.max(12, Math.min(x, maxX))}px`;
    els.tooltip.style.top = `${Math.max(12, Math.min(y, maxY))}px`;
  }

  function hideTooltip() {
    els.tooltip.hidden = true;
  }

  function scheduleMapRedraw() {
    window.clearTimeout(state.resizeTimer);
    state.resizeTimer = window.setTimeout(drawMap, 120);
  }

  function getVisitedCount() {
    return [...state.visited].filter((id) => state.countriesById.has(id)).length;
  }

  function toPercent(value, total) {
    return total ? Math.round((value / total) * 100) : 0;
  }

  function loadVisited() {
    try {
      const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "[]");
      return new Set(Array.isArray(saved) ? saved : []);
    } catch (error) {
      return new Set();
    }
  }

  function saveVisited() {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...state.visited]));
  }

  function cleanName(value) {
    if (value === null || value === undefined || value === "-99") return "";
    return String(value).trim();
  }

  function normalizeText(value) {
    return String(value)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
  }
})();
