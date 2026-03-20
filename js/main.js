// main.js
// Loads city data and coordinates interactions with overlapChart.js

import OverlapChart from "./overlapChart.js";
import { parseCityRow, formatPopulation } from "./utils.js";

const CSV_PATH = "data/cities.csv";
const BOUNDARY_PATH = "data/cities.geojson";

const DEFAULT_CITIES = ["Toronto", "Shanghai"];

const selects = [
  document.getElementById("city1"),
  document.getElementById("city2"),
];
const metricSelect = document.getElementById("metric");
const resetBtn = document.getElementById("resetBtn");
const detailsContent = document.getElementById("detailsContent");
const emptyState = document.getElementById("emptyState");

let cityData = [];
let boundaryMap = new Map();
let pinnedCity = null;

const chart = OverlapChart({
  svgSelector: "#cityChart",
  tooltipSelector: "#tooltip",
  viewWidth: 900,
  viewHeight: 520,
});

function loadAndInit() {
  Promise.all([
    d3.csv(CSV_PATH, parseCityRow),
    d3.json(BOUNDARY_PATH).catch((err) => {
      console.warn("Could not load boundary geojson", err);
      return null;
    }),
  ])
    .then(([data, geojson]) => {
      cityData = data.sort((a, b) => a.city.localeCompare(b.city));

      const resolveCityKey = (feat) => {
        return (feat?.properties?.city || feat?.properties?.NAME || "")
          .toString()
          .trim()
          .toLowerCase();
      };

      const centroidFromFeature = (feature) => {
        if (!feature || !feature.geometry) return null;
        const c = d3.geoCentroid(feature);
        if (!Array.isArray(c) || !Number.isFinite(c[0]) || !Number.isFinite(c[1])) return null;
        return { lng: c[0], lat: c[1] };
      };

      const distanceSq = (a, b) => {
        if (!a || !b) return Infinity;
        const dx = (a.lng || 0) - (b.lng || 0);
        const dy = (a.lat || 0) - (b.lat || 0);
        return dx * dx + dy * dy;
      };

      if (geojson && geojson.features) {
        boundaryMap = new Map();
        const boundaryCandidates = new Map();

        geojson.features
          .filter((f) => f && f.properties && f.geometry)
          .forEach((feat) => {
            const key = resolveCityKey(feat);
            if (!key) return;

            const centroid = centroidFromFeature(feat);
            const candidateList = boundaryCandidates.get(key) || [];
            candidateList.push({ feature: feat, centroid });
            boundaryCandidates.set(key, candidateList);
          });

        cityData.forEach((city) => {
          const key = city.city.toString().trim().toLowerCase();
          const candidates = boundaryCandidates.get(key);
          if (!candidates || !candidates.length) return;

          const cityPoint = { lng: +city.lng, lat: +city.lat };
          let best = candidates[0];
          let bestDist = distanceSq(cityPoint, best.centroid);

          candidates.slice(1).forEach((c) => {
            const d = distanceSq(cityPoint, c.centroid);
            if (d < bestDist) {
              bestDist = d;
              best = c;
            }
          });

          boundaryMap.set(key, best.feature);
        });
      }

      // If area metric is active, precompute area for cities where geometry exists.
      cityData = cityData.map((city) => {
        const boundaryFeature = boundaryMap.get(city.city.toLowerCase());
        if (boundaryFeature) {
          const areaSteradians = d3.geoArea(boundaryFeature);
          const earthRadiusKm = 6371;
          const geoAreaKm2 = areaSteradians * earthRadiusKm * earthRadiusKm;
          // Use authoritative CSV area where available; fallback to geo boundary area.
          city.area = city.area || geoAreaKm2 || 0;
          city.geoArea = geoAreaKm2;
        }
        return city;
      });

      initCitySelectors();
      setInitialSelections();
      attachEvents();
      refreshView();
    })
    .catch((err) => {
      console.error("Could not load city data", err);
      emptyState.textContent = "Unable to load data. Check data/cities.csv and refresh.";
    });
}

function initCitySelectors() {
  selects.forEach((sel) => {
    sel.innerHTML = "<option value=''>-- pick city --</option>";
    cityData.forEach((city) => {
      const option = document.createElement("option");
      option.value = city.city;
      option.text = `${city.city}, ${city.country}`;
      sel.appendChild(option);
    });
  });
}

function setInitialSelections() {
  selects.forEach((sel, idx) => {
    const defaultCity = DEFAULT_CITIES[idx] || "";
    if (cityData.some((c) => c.city === defaultCity)) {
      sel.value = defaultCity;
    } else {
      sel.value = "";
    }
  });

  // Default metric focuses on area first, per user preference.
  if (metricSelect) {
    metricSelect.value = "area";
  }

  refreshControls();
}

function refreshControls() {
  // Prevent duplicates by disabling active selections in other dropdowns.
  const chosen = new Set(selects.filter((s) => s.value).map((s) => s.value));

  selects.forEach((sel) => {
    Array.from(sel.options).forEach((opt) => {
      if (opt.value && opt.value !== sel.value && chosen.has(opt.value)) {
        opt.disabled = true;
      } else {
        opt.disabled = false;
      }
    });
  });
}

function getSelectedCities() {
  return selects
    .map((sel) => cityData.find((c) => c.city === sel.value))
    .filter(Boolean);
}

function refreshView() {
  const selected = getSelectedCities();
  const metric = metricSelect.value;

  if (!selected.length) {
    emptyState.style.display = "block";
    detailsContent.innerHTML = "";
    chart.update([], metric, pinnedCity);
    return;
  }

  emptyState.style.display = "none";
  chart.update(selected, metric, pinnedCity, boundaryMap);
  renderDetailsPanel(selected, pinnedCity);
}

function renderDetailsPanel(selectedCities, pinned) {
  if (!selectedCities.length) {
    detailsContent.innerHTML = "";
    return;
  }

  detailsContent.innerHTML = "";
  const cards = document.createElement("div");
  cards.className = "details-grid";

  selectedCities.forEach((city) => {
    const isPinned = pinned && pinned.city === city.city;
    const card = document.createElement("article");
    card.className = "city-card" + (isPinned ? " pinned" : "");

    card.innerHTML = `
      <h3>${city.city}, ${city.country}</h3>
      <p><strong>Continent:</strong> ${city.continent}</p>
      <p><strong>Population:</strong> ${formatPopulation(city.population)}</p>
      <p><strong>Area:</strong> ${city.area ? `${d3.format(",.0f")(city.area)} km²` : "N/A"}</p>
      <p><strong>Rank:</strong> ${city.rank || "N/A"}</p>
      <p><strong>Capital:</strong> ${city.is_capital ? "Yes" : "No"}</p>
    `;

    card.addEventListener("click", () => {
      pinnedCity = city;
      refreshView();
    });

    cards.appendChild(card);
  });

  detailsContent.appendChild(cards);
}

function attachEvents() {
  selects.forEach((sel) => {
    sel.addEventListener("change", () => {
      pinnedCity = null;
      refreshControls();
      refreshView();
    });
  });

  metricSelect.addEventListener("change", () => {
    refreshView();
  });

  resetBtn.addEventListener("click", () => {
    pinnedCity = null;
    setInitialSelections();
    refreshView();
  });

  chart.on("cityClicked", (city) => {
    pinnedCity = city;
    refreshView();
  });
}

loadAndInit();
