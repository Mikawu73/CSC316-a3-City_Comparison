// utils.js
// Parsing and formatting helper utilities for the World City Comparison chart.

export function parseCityRow(d) {
  return {
    city: d.city || "",
    country: d.country || "",
    continent: d.continent || "",
    lat: Number(d.lat) || 0,
    lng: Number(d.lng) || 0,
    population: Number(d.population) || 0,
    area: Number(d.area) || 0,
    rank: Number(d.rank) || 0,
    is_capital: toBoolean(d.is_capital),
  };
}

export function toBoolean(value) {
  const lower = `${value}`.trim().toLowerCase();
  if (!value) return false;
  return lower === "true" || lower === "1" || lower === "yes" || lower === "y";
}

export function formatPopulation(value) {
  if (!Number.isFinite(value)) return "N/A";
  return d3.format(",")(Math.round(value));
}

export function makeCityKey(city) {
  return city ? city.replace(/\s+/g, "_").toLowerCase() : "";
}
