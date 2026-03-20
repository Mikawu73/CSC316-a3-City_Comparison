// overlapChart.js
// Implements the overlapping circle visualization with D3 update pattern.

import { formatPopulation, makeCityKey } from "./utils.js";

export default function OverlapChart(config) {
  const svg = d3.select(config.svgSelector);
  const width = config.viewWidth || 900;
  const height = config.viewHeight || 520;
  const padding = 50;
  const margin = { top: 40, right: 40, bottom: 40, left: 40 };

  const chartWidth = width - margin.left - margin.right;
  const chartHeight = height - margin.top - margin.bottom;

  const tooltip = d3.select(config.tooltipSelector);
  const dispatch = d3.dispatch("cityClicked");
  const group = svg.append("g").attr("class", "skyline-group").attr("transform", `translate(${margin.left},${margin.top})`);
  const colors = ["#1d4ed8", "#dc2626", "#16a34a", "#7c3aed", "#ea580c"];

  function getMetric(city, metric) {
    if (!city) return 0;
    if (metric === "population") return city.population;
    if (metric === "density") return city.density ?? 0;
    if (metric === "area") return city.area ?? 0;
    return city.population;
  }

  function update(selectedCities, metric = "population", pinnedCity, boundaryMap = new Map()) {
    const validCities = selectedCities.filter(Boolean);

    if (!validCities.length) {
      group.selectAll("g.city-block").remove();
      group.selectAll("path.city-boundary").remove();
      group.selectAll("text.city-label").remove();
      return;
    }

    if (metric === "area") {
      renderCityAreaOverlay(validCities, boundaryMap, pinnedCity);
      return;
    }

    // for non-area charts clear old area overlay
    group.selectAll("path.city-boundary").remove();
    group.selectAll("text.city-label").remove();

    const maxValue = d3.max(validCities, (d) => getMetric(d, metric)) || 1;
    const skylineHeightScale = d3.scaleLinear().domain([0, maxValue]).range([chartHeight * 0.44, chartHeight * 0.82]);

    const columns = validCities.map((city, i) => {
      const x = (i * chartWidth) / 2;
      const widthSlot = chartWidth / 2;
      const cityHeight = skylineHeightScale(getMetric(city, metric));
      const skylineBase = chartHeight - 20;
      const buildingCount = 9;
      const buildingWidth = widthSlot / (buildingCount + 1);

      const buildings = d3.range(buildingCount).map((j) => {
        const heightFactor = 0.4 + (j / buildingCount) * 0.5;
        return {
          x: x + buildingWidth * (j + 0.5),
          y: skylineBase - cityHeight * heightFactor,
          w: buildingWidth * 0.9,
          h: cityHeight * heightFactor,
          fill: `rgba(${50 + j * 15}, ${100 + i * 60}, ${180 - j * 10}, 0.8)`,
        };
      });

      return {
        ...city,
        id: makeCityKey(city.city),
        x,
        y: skylineBase,
        widthSlot,
        cityHeight,
        buildings,
      };
    });

    const cityGroups = group.selectAll("g.city-block").data(columns, (d) => d.id);

    const enterGroups = cityGroups.enter().append("g").attr("class", "city-block").attr("opacity", 0);
    enterGroups.transition().duration(600).attr("opacity", 1);

    enterGroups
      .append("rect")
      .attr("class", "city-ground")
      .attr("x", (d) => d.x)
      .attr("y", (d) => d.y)
      .attr("width", (d) => d.widthSlot)
      .attr("height", 3)
      .attr("fill", "#374151");

    enterGroups
      .append("text")
      .attr("class", "city-name")
      .attr("x", (d) => d.x + d.widthSlot / 2)
      .attr("y", chartHeight + 18)
      .attr("text-anchor", "middle")
      .attr("font-size", "16px")
      .attr("font-weight", "700")
      .attr("fill", "#111827")
      .text((d) => d.city);

    enterGroups
      .append("text")
      .attr("class", "city-country")
      .attr("x", (d) => d.x + d.widthSlot / 2)
      .attr("y", chartHeight + 34)
      .attr("text-anchor", "middle")
      .attr("font-size", "13px")
      .attr("fill", "#6b7280")
      .text((d) => d.country);

    const mergedGroups = enterGroups.merge(cityGroups);

    mergedGroups.each(function (d) {
      const cityBlock = d3.select(this);

      const buildings = cityBlock.selectAll("rect.building").data(d.buildings, (b, i) => i);
      buildings
        .enter()
        .append("rect")
        .attr("class", "building")
        .attr("x", (b) => b.x)
        .attr("y", (b) => chartHeight)
        .attr("width", (b) => b.w)
        .attr("height", 0)
        .attr("fill", (b) => b.fill)
        .on("mouseover", (event) => highlightCity(event, d, true))
        .on("mousemove", (event) => updateTooltip(event, d))
        .on("mouseout", (event) => highlightCity(event, d, false))
        .on("click", (event) => dispatch.call("cityClicked", null, d))
        .transition()
        .duration(700)
        .attr("y", (b) => b.y)
        .attr("height", (b) => b.h);

      buildings
        .transition()
        .duration(700)
        .attr("x", (b) => b.x)
        .attr("y", (b) => b.y)
        .attr("width", (b) => b.w)
        .attr("height", (b) => b.h)
        .attr("fill", (b) => b.fill);

      buildings.exit().remove();

      cityBlock.select("text.city-name").text(`${d.city}`);
      cityBlock.select("text.city-country").text(`${d.country}`);

      cityBlock
        .selectAll("rect.city-ground")
        .attr("x", d.x)
        .attr("y", d.y)
        .attr("width", d.widthSlot);

      cityBlock
        .attr("opacity", 1)
        .attr("transform", `translate(${d.x - d.x},${0})`);

      const isPinned = pinnedCity && pinnedCity.city === d.city;
      cityBlock.selectAll("rect.building").attr("stroke", isPinned ? "#000" : "none").attr("stroke-width", isPinned ? 3 : 0);
    });

    cityGroups.exit().remove();

    // hide tooltip when chart re-renders
    tooltip.style("display", "none").attr("aria-hidden", "true");
  }

  function renderCityAreaOverlay(cities, boundaryMap, pinnedCity) {
    // clear skyline mode elements when drawing area overlay
    group.selectAll("g.city-block").remove();

    const features = cities
      .map((city) => {
        const feature = boundaryMap.get(city.city.toLowerCase());
        if (!feature || !feature.geometry) return null;
        return { city, feature };
      })
      .filter(Boolean);

    if (!features.length) {
      group.selectAll("g.city-overlay").remove();
      group.selectAll("text.city-label").remove();
      return;
    }

    // If exactly 2 are available, we overlay them. Otherwise fallback to simple first feature.
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

    overlayFeatures.forEach((item) => {
      const bounds = worldPath.bounds(item.feature);
      const widthN = bounds[1][0] - bounds[0][0];
      const heightN = bounds[1][1] - bounds[0][1];
      item.bounds = bounds;
      item.rawCenter = [(bounds[0][0] + bounds[1][0]) / 2, (bounds[0][1] + bounds[1][1]) / 2];
      item.rawSize = Math.max(widthN, heightN, 1);
      const geoAreaSteradians = d3.geoArea(item.feature);
      const geoAreaKm2 = geoAreaSteradians * 6371 * 6371;
      item.rawGeoAreaSteradians = geoAreaSteradians;
      item.geoArea = geoAreaKm2;
      item.metricValue = item.city.area || geoAreaKm2 || getMetric(item.city, "population") || 1;
    });

    const targetCenter = [chartWidth / 2, chartHeight / 2];
    const rawScale = (Math.min(chartWidth, chartHeight) * 0.92) / overlayFeatures[0].rawSize;
    const targetScale = Math.min(rawScale, 1);

    const baseMetric = overlayFeatures[0].metricValue || 1;
    const baseGeo = overlayFeatures[0].rawGeoAreaSteradians || 1;

    overlayFeatures.forEach((item, idx) => {
      const metricRatio = item.metricValue / baseMetric || 1;
      const geoProjectionRatio = item.rawGeoAreaSteradians / baseGeo || 1;
      // adjust each city so on-screen area matches metric ratio regardless of raw projection differences
      const areaScale = Math.sqrt(metricRatio / geoProjectionRatio);
      item.finalScale = Math.min(targetScale * areaScale, 1);
      item.labelY = targetCenter[1] - (item.rawSize * item.finalScale) / 2 - 18 - idx * 24;
      item.labelX = targetCenter[0];
      item.order = idx; // 0 is larger (bottom), 1 is smaller (top)
    });

    // city group overlay for shapes
    const cityGroup = group.selectAll("g.city-overlay").data(overlayFeatures, (d) => d.city.city);

    const enterCity = cityGroup
      .enter()
      .append("g")
      .attr("class", "city-overlay")
      .attr("opacity", 0);

    enterCity
      .append("path")
      .attr("class", "city-boundary")
      .attr("vector-effect", "non-scaling-stroke")
      .attr("pointer-events", "visiblePainted")
      .attr("fill", (d, i) => (i === 0 ? "rgba(30, 120, 220, 0.42)" : "rgba(220, 70, 70, 0.28)"))
      .attr("stroke", (d, i) => (i === 0 ? "#1e4b8b" : "#991b1b"))
      .attr("stroke-width", (d) => (pinnedCity && pinnedCity.city === d.city.city ? 4 : 2))
      .on("mouseover", (event, d) => highlightCity(event, d.city, true))
      .on("mousemove", (event, d) => updateTooltip(event, d.city))
      .on("mouseout", (event, d) => highlightCity(event, d.city, false))
      .on("click", (event, d) => dispatch.call("cityClicked", null, d.city));

    const mergedCity = enterCity.merge(cityGroup);

    mergedCity
      .sort((a, b) => a.order - b.order)
      .transition()
      .duration(650)
      .attr("opacity", 1)
      .attr("transform", (d) => {
        return `translate(${targetCenter[0]}, ${targetCenter[1]}) scale(${d.finalScale}) translate(${-d.rawCenter[0]}, ${-d.rawCenter[1]})`;
      });

    mergedCity
      .select("path.city-boundary")
      .attr("d", (d) => worldPath(d.feature))
      .attr("fill", (d, i) => (i === 0 ? "rgba(30, 120, 220, 0.56)" : "rgba(220, 70, 70, 0.32)"))
      .attr("stroke", (d, i) => (i === 0 ? "#1e4b8b" : "#991b1b"))
      .attr("stroke-width", (d) => (pinnedCity && pinnedCity.city === d.city.city ? 4 : 2));

    cityGroup.exit().transition().duration(350).attr("opacity", 0).remove();

    // no static labels in overlay mode; tooltip appears on hover only
    group.selectAll("text.city-label").remove();

    tooltip.style("display", "none").attr("aria-hidden", "true");
  }

  function highlightCity(event, d, activate) {
    d3.select(event.currentTarget)
      .transition()
      .duration(120)
      .attr("opacity", activate ? 0.75 : 1);

    if (activate) {
      updateTooltip(event, d);
    } else {
      tooltip.style("display", "none").attr("aria-hidden", "true");
    }
  }

  function updateTooltip(event, d) {
    const cityDetails = d && d.city && typeof d.city === "object" ? d.city : d;
    const areaValue = d && d.feature ? d3.geoArea(d.feature) * 6371 * 6371 : cityDetails.area;

    const clientX = event.clientX;
    const clientY = event.clientY;

    const offsetX = 12;
    const offsetY = 12;

    const left = Math.min(window.innerWidth - 260, clientX + offsetX);
    const top = Math.min(window.innerHeight - 160, clientY + offsetY);

    tooltip
      .style("left", `${left}px`)
      .style("top", `${top}px`)
      .style("display", "block")
      .attr("aria-hidden", "false")
      .html(`
        <strong>${(cityDetails && cityDetails.city) || "Unknown"}${cityDetails && cityDetails.country ? `, ${cityDetails.country}` : ""}</strong><br/>
        ${cityDetails && cityDetails.continent ? `${cityDetails.continent}<br/>` : ""}
        Population: ${formatPopulation(cityDetails && cityDetails.population)}<br/>
        ${areaValue ? `Area: ${d3.format(",.0f")(areaValue)} km²<br/>` : ""}
        Rank: ${cityDetails && cityDetails.rank ? cityDetails.rank : "N/A"}${cityDetails && cityDetails.is_capital ? " (capital)" : ""}
      `);
  }

  return {
    update,
    on: (type, callback) => dispatch.on(type, callback),
  };
}
