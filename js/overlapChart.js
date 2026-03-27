// overlapChart.js
// Renders area overlays, population pictograms, and fallback metric columns.

import { formatPopulation, makeCityKey } from "./utils.js";

const POPULATION_UNIT = 100000;
const AREA_TO_POPULATION_PAUSE_MS = 1000;
const AREA_TO_POPULATION_SCATTER_MS = 1100;
const POPULATION_TO_AREA_GATHER_MS = 950;
const PERSON_BODY_PATH =
  "M-3.8 -6.2 L-1.3 -3.2 L-1.3 2.8 L-3.2 9.6 L-1.2 9.6 L0 4.3 L1.2 9.6 L3.2 9.6 L1.3 2.8 L1.3 -3.2 L3.8 -6.2 L2.8 -7.4 L0.9 -5.4 L0.9 -1.2 L-0.9 -1.2 L-0.9 -5.4 L-2.8 -7.4 Z";

export default function OverlapChart(config) {
  const svg = d3.select(config.svgSelector);
  const width = config.viewWidth || 900;
  const height = config.viewHeight || 520;
  const margin = { top: 40, right: 40, bottom: 40, left: 40 };

  const chartWidth = width - margin.left - margin.right;
  const chartHeight = height - margin.top - margin.bottom;

  const tooltip = d3.select(config.tooltipSelector);
  const dispatch = d3.dispatch("cityClicked");
  const group = svg.append("g").attr("class", "skyline-group").attr("transform", `translate(${margin.left},${margin.top})`);
  const colors = ["#2563eb", "#dc2626", "#16a34a", "#9333ea", "#ea580c"];
  const areaFills = ["rgba(37, 99, 235, 0.52)", "rgba(220, 38, 38, 0.34)", "rgba(22, 163, 74, 0.34)", "rgba(147, 51, 234, 0.34)", "rgba(234, 88, 12, 0.34)"];
  const areaStrokes = ["#1d4ed8", "#b91c1c", "#15803d", "#7e22ce", "#c2410c"];

  let previousMetric = null;
  let lastAreaState = null;
  let lastPopulationState = null;

  function getMetric(city, metric) {
    if (!city) return 0;
    if (metric === "population") return city.population;
    if (metric === "density") return city.density ?? 0;
    if (metric === "area") return city.area ?? 0;
    return city.population;
  }

  function getCityStyle(cityName, cityOrderMap) {
    const fallbackIndex = 0;
    const index = cityOrderMap.has(cityName) ? cityOrderMap.get(cityName) : fallbackIndex;
    return {
      color: colors[index % colors.length],
      areaFill: areaFills[index % areaFills.length],
      areaStroke: areaStrokes[index % areaStrokes.length],
    };
  }

  function clearMetricLayers() {
    group.selectAll("g.city-block").remove();
    group.selectAll("g.city-overlay").remove();
    group.selectAll("g.population-city").remove();
    group.selectAll("text.city-label").remove();
    group.selectAll("path.city-boundary").remove();
  }

  function update(selectedCities, metric = "population", pinnedCity, boundaryMap = new Map()) {
    const validCities = selectedCities.filter(Boolean);

    if (!validCities.length) {
      clearMetricLayers();
      hideTooltip();
      previousMetric = metric;
      return;
    }

    if (metric === "area") {
      renderCityAreaOverlay(validCities, boundaryMap, pinnedCity);
      previousMetric = "area";
      return;
    }

    if (metric === "population") {
      renderPopulationPictograms(validCities, pinnedCity);
      previousMetric = "population";
      return;
    }

    renderMetricColumns(validCities, metric, pinnedCity);
    previousMetric = metric;
  }

  function renderMetricColumns(cities, metric, pinnedCity) {
    group.selectAll("g.city-overlay").remove();
    group.selectAll("g.population-city").remove();
    group.selectAll("text.city-label").remove();
    group.selectAll("path.city-boundary").remove();

    const maxValue = d3.max(cities, (d) => getMetric(d, metric)) || 1;
    const laneWidth = chartWidth / cities.length;
    const barScale = d3.scaleLinear().domain([0, maxValue]).range([0, chartHeight - 120]);

    const columns = cities.map((city, index) => {
      const laneX = index * laneWidth;
      const barWidth = Math.min(120, laneWidth * 0.52);
      const barHeight = barScale(getMetric(city, metric));
      return {
        ...city,
        id: makeCityKey(city.city),
        barX: laneX + (laneWidth - barWidth) / 2,
        barY: chartHeight - 60 - barHeight,
        barWidth,
        barHeight,
        labelX: laneX + laneWidth / 2,
        color: colors[index % colors.length],
      };
    });

    const cityGroups = group.selectAll("g.city-block").data(columns, (d) => d.id);

    const enterGroups = cityGroups.enter().append("g").attr("class", "city-block").attr("opacity", 0);
    enterGroups.append("rect").attr("class", "metric-bar").attr("rx", 12).attr("ry", 12);
    enterGroups.append("text").attr("class", "city-name");
    enterGroups.append("text").attr("class", "city-country");

    const mergedGroups = enterGroups.merge(cityGroups);

    mergedGroups
      .transition()
      .duration(500)
      .attr("opacity", 1);

    mergedGroups
      .select("rect.metric-bar")
      .on("mouseover", (event, d) => highlightCity(event, d, true))
      .on("mousemove", (event, d) => updateTooltip(event, d))
      .on("mouseout", (event, d) => highlightCity(event, d, false))
      .on("click", (event, d) => dispatch.call("cityClicked", null, d))
      .transition()
      .duration(700)
      .attr("x", (d) => d.barX)
      .attr("y", (d) => d.barY)
      .attr("width", (d) => d.barWidth)
      .attr("height", (d) => d.barHeight)
      .attr("fill", (d) => d.color)
      .attr("stroke", (d) => (pinnedCity && pinnedCity.city === d.city ? "#111827" : "none"))
      .attr("stroke-width", (d) => (pinnedCity && pinnedCity.city === d.city ? 3 : 0));

    mergedGroups
      .select("text.city-name")
      .attr("x", (d) => d.labelX)
      .attr("y", chartHeight - 22)
      .attr("text-anchor", "middle")
      .attr("font-size", "16px")
      .attr("font-weight", "700")
      .attr("fill", "#111827")
      .text((d) => d.city);

    mergedGroups
      .select("text.city-country")
      .attr("x", (d) => d.labelX)
      .attr("y", chartHeight - 4)
      .attr("text-anchor", "middle")
      .attr("font-size", "13px")
      .attr("fill", "#6b7280")
      .text((d) => d.country);

    cityGroups.exit().transition().duration(300).attr("opacity", 0).remove();
    hideTooltip();
  }

  function renderPopulationPictograms(cities, pinnedCity) {
    group.selectAll("g.city-overlay").remove();
    group.selectAll("path.city-boundary").remove();
    group.selectAll("text.city-label").remove();

    const laneWidth = chartWidth / cities.length;
    const usableHeight = chartHeight - 110;
    const animateFromArea = previousMetric === "area" && lastAreaState;

    const layouts = cities.map((city, index) => {
      const count = Math.max(1, Math.ceil(city.population / POPULATION_UNIT));
      const cols = Math.max(7, Math.min(26, Math.floor((laneWidth - 52) / 14)));
      const cellWidth = Math.max(11, Math.min(15, (laneWidth - 70) / cols));
      const cellHeight = cellWidth * 1.55;
      const rows = Math.ceil(count / cols);
      const gridWidth = Math.min(count, cols) * cellWidth;
      const gridHeight = Math.min(usableHeight, rows * cellHeight);
      const originX = index * laneWidth + (laneWidth - gridWidth) / 2 + cellWidth / 2;
      const originY = chartHeight - 68 - gridHeight + cellHeight;
      const startPoints = animateFromArea ? getAreaStartPoints(city.city, count) : [];
      const cityColor = getCityStyle(city.city, new Map(cities.map((item, i) => [item.city, i]))).color;

      return {
        city,
        id: makeCityKey(city.city),
        cityColor,
        labelX: index * laneWidth + laneWidth / 2,
        labelY: chartHeight - 26,
        subtitleY: chartHeight - 6,
        scale: cellWidth / 9.5,
        icons: d3.range(count).map((iconIndex) => {
          const col = iconIndex % cols;
          const row = Math.floor(iconIndex / cols);
          const x = originX + col * cellWidth;
          const y = originY + row * cellHeight;
          const fallback = {
            x: index * laneWidth + laneWidth / 2 + (Math.random() - 0.5) * 24,
            y: chartHeight - 74 + (Math.random() - 0.5) * 18,
          };
          const start = startPoints[iconIndex] || fallback;
          return {
            key: `${makeCityKey(city.city)}-${iconIndex}`,
            city,
            index: iconIndex,
            color: cityColor,
            x,
            y,
            startX: start.x,
            startY: start.y,
            scale: cellWidth / 9.5,
          };
        }),
      };
    });

    lastPopulationState = layouts;

    group.selectAll("g.city-block").remove();

    const cityGroups = group.selectAll("g.population-city").data(layouts, (d) => d.id);

    const enterGroups = cityGroups.enter().append("g").attr("class", "population-city").attr("opacity", 0);
    enterGroups.append("g").attr("class", "icon-layer");
    enterGroups.append("text").attr("class", "city-name");
    enterGroups.append("text").attr("class", "city-country");

    const mergedGroups = enterGroups.merge(cityGroups);
    mergedGroups.transition().duration(350).attr("opacity", 1);

    mergedGroups.each(function (layout) {
      const cityGroup = d3.select(this);
      const iconLayer = cityGroup.select("g.icon-layer");
      const icons = iconLayer.selectAll("g.person-icon").data(layout.icons, (d) => d.key);

      const enterIcons = icons
        .enter()
        .append("g")
        .attr("class", "person-icon")
        .attr("opacity", animateFromArea ? 0.25 : 0)
        .attr("transform", (d) => `translate(${d.startX},${d.startY}) scale(${d.scale})`);

      enterIcons
        .append("circle")
        .attr("class", "person-head")
        .attr("cx", 0)
        .attr("cy", -10)
        .attr("r", 2.4)
        .attr("fill", (d) => d.color);

      enterIcons
        .append("path")
        .attr("class", "person-body")
        .attr("d", PERSON_BODY_PATH)
        .attr("fill", (d) => d.color)
        .attr("stroke-linejoin", "round");

      enterIcons
        .on("mouseover", (event, d) => highlightCity(event, d.city, true))
        .on("mousemove", (event, d) => updateTooltip(event, d.city))
        .on("mouseout", (event, d) => highlightCity(event, d.city, false))
        .on("click", (event, d) => dispatch.call("cityClicked", null, d.city));

      const mergedIcons = enterIcons.merge(icons);

      mergedIcons
        .select("circle.person-head")
        .attr("fill", (d) => d.color)
        .attr("stroke", (d) => (pinnedCity && pinnedCity.city === d.city.city ? "#111827" : "none"))
        .attr("stroke-width", (d) => (pinnedCity && pinnedCity.city === d.city.city ? 0.7 : 0));

      mergedIcons
        .select("path.person-body")
        .attr("fill", (d) => d.color)
        .attr("stroke", (d) => (pinnedCity && pinnedCity.city === d.city.city ? "#111827" : "none"))
        .attr("stroke-width", (d) => (pinnedCity && pinnedCity.city === d.city.city ? 0.7 : 0));

      mergedIcons
        .transition()
        .delay((d) => (animateFromArea ? AREA_TO_POPULATION_PAUSE_MS : 0) + Math.min(420, d.index * 5))
        .duration(animateFromArea ? AREA_TO_POPULATION_SCATTER_MS : 850)
        .ease(d3.easeCubicOut)
        .attr("opacity", 1)
        .attr("transform", (d) => `translate(${d.x},${d.y}) scale(${d.scale})`);

      icons.exit().transition().duration(250).attr("opacity", 0).remove();

      cityGroup
        .select("text.city-name")
        .attr("x", layout.labelX)
        .attr("y", layout.labelY)
        .attr("text-anchor", "middle")
        .attr("font-size", "16px")
        .attr("font-weight", "700")
        .attr("fill", "#111827")
        .text(layout.city.city);

      cityGroup
        .select("text.city-country")
        .attr("x", layout.labelX)
        .attr("y", layout.subtitleY)
        .attr("text-anchor", "middle")
        .attr("font-size", "13px")
        .attr("fill", "#6b7280")
        .text(`${layout.city.country} - ${layout.icons.length} figures`);
    });

    cityGroups.exit().transition().duration(250).attr("opacity", 0).remove();
    hideTooltip();
  }

  function buildAreaLayout(cities, boundaryMap) {
    const cityOrderMap = new Map(cities.map((city, index) => [city.city, index]));
    const features = cities
      .map((city) => {
        const feature = boundaryMap.get(city.city.toLowerCase());
        if (!feature || !feature.geometry) return null;
        return { city, feature };
      })
      .filter(Boolean);

    if (!features.length) return null;

    const sorted = features
      .slice()
      .sort((a, b) => {
        const metricA = getMetric(a.city, "area") || getMetric(a.city, "population") || 1;
        const metricB = getMetric(b.city, "area") || getMetric(b.city, "population") || 1;
        return metricB - metricA;
      });

    const overlayFeatures = sorted.length > 2 ? sorted.slice(0, 2) : sorted;
    const baseFeature = overlayFeatures[0].feature;
    const baseFeatureCollection = { type: "FeatureCollection", features: [baseFeature] };
    const worldProjection = d3.geoMercator().fitSize([chartWidth, chartHeight], baseFeatureCollection).precision(0.1);
    const worldPath = d3.geoPath().projection(worldProjection);
    const targetCenter = [chartWidth / 2, chartHeight / 2];

    overlayFeatures.forEach((item, index) => {
      const bounds = worldPath.bounds(item.feature);
      const widthN = bounds[1][0] - bounds[0][0];
      const heightN = bounds[1][1] - bounds[0][1];
      item.bounds = bounds;
      item.rawCenter = [(bounds[0][0] + bounds[1][0]) / 2, (bounds[0][1] + bounds[1][1]) / 2];
      item.rawSize = Math.max(widthN, heightN, 1);
      item.rawGeoAreaSteradians = d3.geoArea(item.feature);
      item.metricValue = item.city.area || item.rawGeoAreaSteradians * 6371 * 6371 || getMetric(item.city, "population") || 1;
      const cityStyle = getCityStyle(item.city.city, cityOrderMap);
      item.color = cityStyle.color;
      item.areaFill = cityStyle.areaFill;
      item.areaStroke = cityStyle.areaStroke;
      item.order = index;
    });

    const rawScale = (Math.min(chartWidth, chartHeight) * 0.92) / overlayFeatures[0].rawSize;
    const targetScale = Math.min(rawScale, 1);
    const baseMetric = overlayFeatures[0].metricValue || 1;
    const baseGeo = overlayFeatures[0].rawGeoAreaSteradians || 1;

    overlayFeatures.forEach((item, index) => {
      const metricRatio = item.metricValue / baseMetric || 1;
      const geoProjectionRatio = item.rawGeoAreaSteradians / baseGeo || 1;
      const areaScale = Math.sqrt(metricRatio / geoProjectionRatio);
      item.finalScale = Math.min(targetScale * areaScale, 1);
      item.labelX = targetCenter[0];
      item.labelY = targetCenter[1] - (item.rawSize * item.finalScale) / 2 - 18 - index * 22;
    });

    return {
      overlayFeatures,
      worldProjection,
      worldPath,
      targetCenter,
    };
  }

  function renderCityAreaOverlay(cities, boundaryMap, pinnedCity) {
    group.selectAll("g.city-block").remove();

    const layout = buildAreaLayout(cities, boundaryMap);
    lastAreaState = layout;

    if (!layout) {
      group.selectAll("g.city-overlay").remove();
      group.selectAll("text.city-label").remove();
      hideTooltip();
      return;
    }

    const animateFromPopulation =
      previousMetric === "population" &&
      lastPopulationState &&
      !group.selectAll("g.population-city").empty();

    const cityGroup = group.selectAll("g.city-overlay").data(layout.overlayFeatures, (d) => d.city.city);

    const enterCity = cityGroup
      .enter()
      .append("g")
      .attr("class", "city-overlay")
      .attr("opacity", animateFromPopulation ? 0 : 0);

    enterCity
      .append("path")
      .attr("class", "city-boundary")
      .attr("vector-effect", "non-scaling-stroke")
      .attr("pointer-events", "visiblePainted")
      .attr("fill", (d) => d.areaFill)
      .attr("stroke", (d) => d.areaStroke)
      .attr("stroke-width", (d) => (pinnedCity && pinnedCity.city === d.city.city ? 4 : 2))
      .on("mouseover", (event, d) => highlightCity(event, d.city, true))
      .on("mousemove", (event, d) => updateTooltip(event, d.city))
      .on("mouseout", (event, d) => highlightCity(event, d.city, false))
      .on("click", (event, d) => dispatch.call("cityClicked", null, d.city));

    const mergedCity = enterCity.merge(cityGroup);

    mergedCity
      .sort((a, b) => a.order - b.order)
      .transition()
      .delay(animateFromPopulation ? POPULATION_TO_AREA_GATHER_MS * 0.55 : 0)
      .duration(animateFromPopulation ? 850 : 650)
      .attr("opacity", 1)
      .attr("transform", (d) => makeAreaTransform(d, layout.targetCenter));

    mergedCity
      .select("path.city-boundary")
      .attr("d", (d) => layout.worldPath(d.feature))
      .attr("fill", (d) => d.areaFill)
      .attr("stroke", (d) => d.areaStroke)
      .attr("stroke-width", (d) => (pinnedCity && pinnedCity.city === d.city.city ? 4 : 2));

    if (animateFromPopulation) {
      animatePopulationIntoArea(layout);
    } else {
      group.selectAll("g.population-city").remove();
    }

    cityGroup.exit().transition().duration(350).attr("opacity", 0).remove();
    group.selectAll("text.city-label").remove();
    hideTooltip();
  }

  function makeAreaTransform(d, targetCenter) {
    return `translate(${targetCenter[0]}, ${targetCenter[1]}) scale(${d.finalScale}) translate(${-d.rawCenter[0]}, ${-d.rawCenter[1]})`;
  }

  function getAreaStartPoints(cityName, count) {
    if (!lastAreaState) return [];

    const areaItem = lastAreaState.overlayFeatures.find((entry) => entry.city.city === cityName);
    if (!areaItem) return [];

    return sampleAreaPoints(lastAreaState, areaItem, count);
  }

  function sampleAreaPoints(layout, areaItem, count) {
    if (!areaItem) return [];

    const bounds = d3.geoBounds(areaItem.feature);
    const samples = [];
    const maxAttempts = Math.max(120, count * 90);

    for (let attempt = 0; attempt < maxAttempts && samples.length < count; attempt += 1) {
      const lng = bounds[0][0] + Math.random() * (bounds[1][0] - bounds[0][0]);
      const lat = bounds[0][1] + Math.random() * (bounds[1][1] - bounds[0][1]);
      if (!d3.geoContains(areaItem.feature, [lng, lat])) continue;

      const projected = layout.worldProjection([lng, lat]);
      if (!projected) continue;

      samples.push({
        x: layout.targetCenter[0] + areaItem.finalScale * (projected[0] - areaItem.rawCenter[0]),
        y: layout.targetCenter[1] + areaItem.finalScale * (projected[1] - areaItem.rawCenter[1]),
      });
    }

    return samples;
  }

  function animatePopulationIntoArea(layout) {
    const populationGroups = group.selectAll("g.population-city");

    populationGroups.each(function (cityLayout) {
      const areaItem = layout.overlayFeatures.find((entry) => entry.city.city === cityLayout.city.city);
      const cityGroup = d3.select(this);

      if (!areaItem) {
        cityGroup.transition().duration(250).attr("opacity", 0).remove();
        return;
      }

      const targets = sampleAreaPoints(layout, areaItem, cityLayout.icons.length);
      const icons = cityGroup.selectAll("g.person-icon");

      icons
        .transition()
        .delay((d) => Math.min(260, d.index * 2))
        .duration(POPULATION_TO_AREA_GATHER_MS)
        .ease(d3.easeCubicInOut)
        .attr("opacity", 0.18)
        .attr("transform", (d) => {
          const target = targets[d.index] || {
            x: layout.targetCenter[0],
            y: layout.targetCenter[1],
          };
          return `translate(${target.x},${target.y}) scale(${Math.max(d.scale * 0.55, 0.45)})`;
        });

      cityGroup
        .selectAll("text.city-name, text.city-country")
        .transition()
        .duration(250)
        .attr("opacity", 0);

      cityGroup
        .transition()
        .delay(POPULATION_TO_AREA_GATHER_MS + 120)
        .duration(180)
        .attr("opacity", 0)
        .remove();
    });
  }

  function highlightCity(event, d, activate) {
    d3.select(event.currentTarget)
      .transition()
      .duration(120)
      .attr("opacity", activate ? 0.78 : 1);

    if (activate) {
      updateTooltip(event, d);
    } else {
      hideTooltip();
    }
  }

  function hideTooltip() {
    tooltip.style("display", "none").attr("aria-hidden", "true");
  }

  function updateTooltip(event, d) {
    const cityDetails = d && d.city && typeof d.city === "object" ? d.city : d;
    const areaValue = cityDetails ? cityDetails.area : 0;

    const left = Math.min(window.innerWidth - 260, event.clientX + 12);
    const top = Math.min(window.innerHeight - 160, event.clientY + 12);

    tooltip
      .style("left", `${left}px`)
      .style("top", `${top}px`)
      .style("display", "block")
      .attr("aria-hidden", "false")
      .html(`
        <strong>${(cityDetails && cityDetails.city) || "Unknown"}${cityDetails && cityDetails.country ? `, ${cityDetails.country}` : ""}</strong><br/>
        ${cityDetails && cityDetails.continent ? `${cityDetails.continent}<br/>` : ""}
        Population: ${formatPopulation(cityDetails && cityDetails.population)}<br/>
        ${areaValue ? `Area: ${d3.format(",.0f")(areaValue)} km<sup>2</sup><br/>` : ""}
        ${cityDetails && cityDetails.population ? `People icons: ${Math.max(1, Math.ceil(cityDetails.population / POPULATION_UNIT))}<br/>` : ""}
        Rank: ${cityDetails && cityDetails.rank ? cityDetails.rank : "N/A"}${cityDetails && cityDetails.is_capital ? " (capital)" : ""}
      `);
  }

  return {
    update,
    on: (type, callback) => dispatch.on(type, callback),
  };
}
