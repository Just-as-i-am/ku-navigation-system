// =====================================================
// KU CAMPUS 3D MAP - MAPLIBRE GL JS
// WITH REAL LIVE TRACKING + ROUTE TRIMMING
// =====================================================

const CAMPUS_CENTER = [74.8375, 34.1315];
const INITIAL_ZOOM = 16;
const INITIAL_PITCH = 62;
const INITIAL_BEARING = -38;

let buildingsData = null;
let roadsData = null;
let poiData = null;
let landuseData = null;

let selectedDestination = null;
let userLocation = null;

let allSearchItems = [];
let roadGraph = {};
let poiMarkers = [];

let is3DEnabled = true;
let selectedPopup = null;
let hoverPopup = null;

// --- Variable to hold the clean destination map marker ---
let destinationMarker = null;

let navigationMode = "walk";

// This stores the real default map view after the website loads
let defaultCamera = null;

// =====================================================
// LIVE TRACKING + ROUTE TRIMMING VARIABLES
// =====================================================

let watchId = null;
let currentRouteCoords = [];
let currentAccessCoords = []; // Added to store the virtual dashed connection
let lastRouteTrimUpdateTime = 0;
let lastRouteRecalculateTime = 0;

// Variables for the Custom Google-Maps Style Marker
let userMarker = null;
let currentMarkerRotation = 0;

const ROUTE_RECALCULATE_DISTANCE = 45;
const ROUTE_TRIM_INTERVAL = 2000;
const ROUTE_RECALCULATE_INTERVAL = 3500;

// =====================================================
// MAP INITIALIZATION
// =====================================================

const map = new maplibregl.Map({
  container: "map",

  style: {
    version: 8,
    glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
    sources: {},
    layers: [
      {
        id: "solid-background",
        type: "background",
        paint: {
          "background-color": "#121212",
        },
      },
    ],
  },

  center: CAMPUS_CENTER,
  zoom: INITIAL_ZOOM,
  pitch: INITIAL_PITCH,
  bearing: INITIAL_BEARING,
  antialias: true,
});

// =====================================================
// DOM ELEMENTS
// =====================================================

const infoCard = document.getElementById("infoCard");
const searchInput = document.getElementById("searchInput");
const directionsBtn = document.getElementById("directionsBtn");

const zoomInBtn = document.getElementById("zoomInBtn");
const zoomOutBtn = document.getElementById("zoomOutBtn");
const resetViewBtn = document.getElementById("resetViewBtn");
const toggle3DBtn = document.getElementById("toggle3DBtn");

const nearbyBtn = document.getElementById("nearbyBtn");
const mobileNearbyBtn = document.getElementById("mobileNearbyBtn");
const locateBtn = document.getElementById("locateBtn");

const locationModal = document.getElementById("locationModal");
const allowLocationBtn = document.getElementById("allowLocationBtn");
const denyLocationBtn = document.getElementById("denyLocationBtn");

const hamburgerBtn = document.getElementById("hamburgerBtn");
const closeMenuBtn = document.getElementById("closeMenuBtn");
const mobileMenu = document.getElementById("mobileMenu");
const mobileMenuOverlay = document.getElementById("mobileMenuOverlay");

const mobileSearchBtn = document.getElementById("mobileSearchBtn");

const filterPanel =
  document.getElementById("filterPanel") ||
  document.querySelector(".filter-panel");

const filterScrollBtn = document.getElementById("filterScrollBtn");

const filterButtons = document.querySelectorAll(".filter-btn[data-filter]");

// =====================================================
// SCALE CONTROL
// =====================================================

map.addControl(
  new maplibregl.ScaleControl({
    maxWidth: 120,
    unit: "metric",
  }),
  "bottom-left",
);

// =====================================================
// MAP LOAD
// =====================================================

map.on("load", async () => {
  try {
    await loadAllGeoJSON();
    addLandUseLayer();
    addRoadsLayer();
    addBuildingsLayer();
    addPOILayer();

    addRouteLayer();
    addHoverTooltips();

    buildSearchIndex();
    createSearchDropdown();
    buildRoadGraph();

    if (window.innerWidth <= 900) {
      map.flyTo({
        center: CAMPUS_CENTER,
        zoom: 14.5,
        pitch: 50,
        bearing: -25,
        padding: { top: 180, bottom: 200, left: 0, right: 70 },
        duration: 2000,
        essential: true,
      });
    }

    applyFilter("all");
    const allBtn = document.querySelector('.filter-btn[data-filter="all"]');
    if (allBtn) allBtn.classList.add("active");

    showDefaultInfo();

    setTimeout(() => {
      saveDefaultCamera();
    }, 2500);

    setTimeout(() => {
      showLocationModal();
    }, 900);

    console.log("✅ KU 3D Campus Map loaded successfully");
    console.log("Road graph nodes:", Object.keys(roadGraph).length);
    console.log("POI markers:", poiMarkers.length);
  } catch (error) {
    console.error("❌ Error loading map:", error);
    alert("Map data could not be loaded. Check GeoJSON file names and paths.");
  }
});

// =====================================================
// LOAD GEOJSON DATA
// =====================================================

async function loadAllGeoJSON() {
  const [buildings, roads, poi, landuse] = await Promise.all([
    fetchGeoJSON("data/buildings.geojson"),
    fetchGeoJSON("data/roads.geojson"),
    fetchGeoJSON("data/poi.geojson"),
    fetchGeoJSON("data/landuse.geojson"),
  ]);

  buildingsData = buildings;
  roadsData = roads;
  poiData = poi;
  landuseData = landuse;
}

async function fetchGeoJSON(path) {
  const response = await fetch(path);

  if (!response.ok) {
    alert(`Missing or wrong file path: ${path}`);
    throw new Error(`Could not load ${path}`);
  }

  return await response.json();
}

// =====================================================
// MOBILE HAMBURGER MENU
// =====================================================

if (hamburgerBtn && mobileMenu && mobileMenuOverlay) {
  hamburgerBtn.addEventListener("click", () => {
    mobileMenu.classList.add("show");
    mobileMenuOverlay.classList.add("show");
  });
}

if (closeMenuBtn && mobileMenu && mobileMenuOverlay) {
  closeMenuBtn.addEventListener("click", () => {
    mobileMenu.classList.remove("show");
    mobileMenuOverlay.classList.remove("show");
  });
}

if (mobileMenuOverlay && mobileMenu) {
  mobileMenuOverlay.addEventListener("click", () => {
    mobileMenu.classList.remove("show");
    mobileMenuOverlay.classList.remove("show");
  });
}

// =====================================================
// FULLSCREEN MOBILE SEARCH LOGIC
// =====================================================
const msInput = document.getElementById("msInput");
const msBackBtn = document.getElementById("msBackBtn");
const msResults = document.getElementById("msResults");
const msFilterChips = document.querySelectorAll(".ms-filter-chip");

if (mobileSearchBtn) {
  mobileSearchBtn.addEventListener("click", () => {
    document.body.classList.add("search-open");
    setTimeout(() => {
      if (msInput) msInput.focus();
    }, 300);
  });
}

if (msBackBtn) {
  msBackBtn.addEventListener("click", () => {
    document.body.classList.remove("search-open");
    if (msInput) msInput.value = "";
    if (msResults)
      msResults.innerHTML =
        '<div class="ms-empty-state">Start typing to search the campus...</div>';
  });
}

if (msInput) {
  msInput.addEventListener("input", () => {
    const query = msInput.value.trim().toLowerCase();

    if (!query) {
      msResults.innerHTML =
        '<div class="ms-empty-state">Start typing to search the campus...</div>';
      return;
    }

    const results = allSearchItems.filter((item) =>
      item.searchText.includes(query),
    );

    if (!results.length) {
      msResults.innerHTML =
        '<div class="ms-empty-state">No matching places found.</div>';
      return;
    }

    msResults.innerHTML = results
      .slice(0, 15)
      .map((item, index) => {
        const props = item.feature.properties || {};
        const type = props.type || item.type;

        return `
        <div class="search-result-item" data-index="${index}" style="padding: 16px 20px; border-bottom: 1px solid rgba(255,255,255,0.05); display: flex; align-items: center; gap: 15px; cursor: pointer;">
          <div style="background: rgba(20,20,25,0.8); width: 40px; height: 40px; display: flex; justify-content: center; align-items: center; border-radius: 50%; font-size: 18px; border: 1px solid rgba(255,255,255,0.1);">
            ${getPOIIcon(type)} 
          </div>
          <div>
            <div style="color: white; font-weight: 700; font-size: 15px;">${item.label}</div>
            <div style="color: #94a3b8; font-size: 12px; margin-top: 4px; font-weight: 600;">${capitalize(type)}</div>
          </div>
        </div>
      `;
      })
      .join("");

    msResults.querySelectorAll(".search-result-item").forEach((el, index) => {
      el.addEventListener("click", () => {
        selectSearchItem(results[index]);
        document.body.classList.remove("search-open");
      });
    });
  });
}

msFilterChips.forEach((chip) => {
  chip.addEventListener("click", () => {
    msFilterChips.forEach((c) => c.classList.remove("active"));
    chip.classList.add("active");

    const filterType = chip.dataset.filter;
    applyFilter(filterType);

    document.body.classList.remove("search-open");
  });
});

// =====================================================
// FILTER SCROLL BUTTON
// =====================================================

if (filterScrollBtn && filterPanel) {
  filterScrollBtn.addEventListener("click", (e) => {
    e.stopPropagation();

    const maxScrollLeft = filterPanel.scrollWidth - filterPanel.clientWidth;
    const nearEnd = filterPanel.scrollLeft >= maxScrollLeft - 20;

    if (nearEnd) {
      filterPanel.scrollTo({
        left: 0,
        behavior: "smooth",
      });
    } else {
      filterPanel.scrollBy({
        left: 140,
        behavior: "smooth",
      });
    }
  });
}

// =====================================================
// LOCATION MODAL
// =====================================================

function showLocationModal() {
  if (!locationModal) return;

  const isAndroidApp = navigator.userAgent.includes("wv");

  if (isAndroidApp) {
    getUserLocation(false);
    return;
  }

  const alreadyAsked = sessionStorage.getItem("kuLocationPromptAsked");
  if (alreadyAsked === "yes") return;

  locationModal.classList.add("show");
}

function closeLocationModal() {
  if (!locationModal) return;
  locationModal.classList.remove("show");
}

function handleAllowLocation() {
  sessionStorage.setItem("kuLocationPromptAsked", "yes");
  closeLocationModal();

  getUserLocation(true);
}

function handleDenyLocation() {
  sessionStorage.setItem("kuLocationPromptAsked", "yes");
  closeLocationModal();
}

if (allowLocationBtn) {
  allowLocationBtn.addEventListener("click", handleAllowLocation);
}

if (denyLocationBtn) {
  denyLocationBtn.addEventListener("click", handleDenyLocation);
}

if (locateBtn) {
  locateBtn.addEventListener("click", () => {
    getUserLocation(true);
  });
}

// =====================================================
// LANDUSE STYLE
// =====================================================

function addLandUseLayer() {
  map.addSource("landuse", {
    type: "geojson",
    data: landuseData,
  });

  createNaturalGreenPattern();

  map.addLayer({
    id: "landuse-fill",
    type: "fill",
    source: "landuse",
    paint: {
      "fill-color": [
        "match",
        ["downcase", ["coalesce", ["get", "type"], "other"]],
        "park",
        "#234f2a",
        "green_area",
        "#285c31",
        "garden",
        "#326b39",
        "green",
        "#285c31",
        "lawn",
        "#5f7f2f",
        "playground",
        "#80612f",
        "sports",
        "#4f6b2a",
        "parking",
        "#fffcfc",
        "water",
        "#1d5f7a",
        "#2f4f2f",
      ],
      "fill-opacity": [
        "interpolate",
        ["linear"],
        ["zoom"],
        14,
        0.62,
        16,
        0.76,
        18,
        0.86,
      ],
    },
  });

  map.addLayer({
    id: "landuse-green-texture",
    type: "fill",
    source: "landuse",
    filter: [
      "in",
      ["downcase", ["coalesce", ["get", "type"], ""]],
      ["literal", ["park", "green_area", "garden", "green", "lawn"]],
    ],
    paint: {
      "fill-pattern": "natural-green-pattern",
      "fill-opacity": [
        "interpolate",
        ["linear"],
        ["zoom"],
        14,
        0.12,
        16,
        0.2,
        18,
        0.28,
      ],
    },
  });

  map.addLayer({
    id: "landuse-green-depth",
    type: "fill",
    source: "landuse",
    filter: [
      "in",
      ["downcase", ["coalesce", ["get", "type"], ""]],
      ["literal", ["park", "green_area", "garden", "green", "lawn"]],
    ],
    paint: {
      "fill-color": "#062f1a",
      "fill-opacity": [
        "interpolate",
        ["linear"],
        ["zoom"],
        14,
        0.18,
        16,
        0.12,
        18,
        0.08,
      ],
    },
  });

  map.addLayer({
    id: "landuse-outline",
    type: "line",
    source: "landuse",
    paint: {
      "line-color": [
        "match",
        ["downcase", ["coalesce", ["get", "type"], "other"]],
        "park",
        "#2f8f46",
        "green_area",
        "#3f9f50",
        "garden",
        "#52b763",
        "green",
        "#3f9f50",
        "lawn",
        "#86a83c",
        "playground",
        "#a47b38",
        "sports",
        "#708f35",
        "parking",
        "#6F8F72",
        "water",
        "#38bdf8",
        "#3f9f50",
      ],
      "line-width": [
        "interpolate",
        ["linear"],
        ["zoom"],
        14,
        0.5,
        16,
        1,
        18,
        1.4,
      ],
      "line-opacity": 0.55,
    },
  });

  map.addLayer({
    id: "landuse-3d-trees",
    type: "fill-extrusion",
    source: "landuse",
    filter: [
      "in",
      ["downcase", ["coalesce", ["get", "type"], ""]],
      ["literal", ["park", "green_area", "garden", "green", "lawn", "forest"]],
    ],
    paint: {
      "fill-extrusion-color": "#204a23",
      "fill-extrusion-height": [
        "match",
        ["downcase", ["coalesce", ["get", "type"], ""]],
        "forest",
        4,
        "park",
        2.5,
        "garden",
        1,
        "lawn",
        0.2,
        1.5,
      ],
      "fill-extrusion-opacity": 1,
    },
  });
}

function createNaturalGreenPattern() {
  if (map.hasImage("natural-green-pattern")) return;

  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, size, size);

  for (let i = 0; i < 220; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = Math.random() * 1.5 + 0.3;

    const colors = [
      "rgba(35, 79, 42, 0.40)",
      "rgba(54, 105, 50, 0.32)",
      "rgba(20, 83, 45, 0.35)",
      "rgba(95, 127, 47, 0.24)",
      "rgba(17, 65, 36, 0.28)",
    ];

    ctx.fillStyle = colors[Math.floor(Math.random() * colors.length)];
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  for (let i = 0; i < 24; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = Math.random() * 6 + 3;

    const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
    gradient.addColorStop(0, "rgba(6, 47, 26, 0.25)");
    gradient.addColorStop(1, "rgba(6, 47, 26, 0)");

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  const imageData = ctx.getImageData(0, 0, size, size);

  map.addImage("natural-green-pattern", imageData, {
    pixelRatio: 2,
  });
}

// =====================================================
// ROADS
// =====================================================
function addRoadsLayer() {
  map.addSource("roads", {
    type: "geojson",
    data: roadsData,
  });

  map.addLayer({
    id: "roads-casing",
    type: "line",
    source: "roads",
    layout: {
      "line-cap": "round",
      "line-join": "round",
    },
    paint: {
      "line-color": "#252a31",
      "line-width": [
        "interpolate",
        ["linear"],
        ["zoom"],
        14,
        8,
        16,
        12,
        18,
        20,
        20,
        30,
      ],
      "line-opacity": 1,
    },
  });

  map.addLayer({
    id: "roads-line",
    type: "line",
    source: "roads",
    layout: {
      "line-cap": "round",
      "line-join": "round",
    },
    paint: {
      "line-color": [
        "match",
        ["downcase", ["coalesce", ["get", "type"], "secondary"]],

        "primary",
        "#5f6368",
        "secondary",
        "#747b84",
        "service",
        "#626a73",
        "footpath",
        "#aab0b8",

        "#747b84",
      ],

      "line-width": [
        "interpolate",
        ["linear"],
        ["zoom"],

        14,
        [
          "match",
          ["downcase", ["coalesce", ["get", "type"], "secondary"]],
          "primary",
          6,
          "secondary",
          4,
          "service",
          3,
          "footpath",
          2,
          4,
        ],

        16,
        [
          "match",
          ["downcase", ["coalesce", ["get", "type"], "secondary"]],
          "primary",
          10,
          "secondary",
          7,
          "service",
          5,
          "footpath",
          3,
          7,
        ],

        18,
        [
          "match",
          ["downcase", ["coalesce", ["get", "type"], "secondary"]],
          "primary",
          18,
          "secondary",
          12,
          "service",
          8,
          "footpath",
          4,
          12,
        ],

        20,
        [
          "match",
          ["downcase", ["coalesce", ["get", "type"], "secondary"]],
          "primary",
          26,
          "secondary",
          18,
          "service",
          12,
          "footpath",
          6,
          18,
        ],
      ],

      "line-opacity": 1,
    },
  });

  map.addLayer({
    id: "roads-label",
    type: "symbol",
    source: "roads",
    minzoom: 18,
    layout: {
      "symbol-placement": "line",
      "text-field": ["coalesce", ["get", "name"], ""],
      "text-size": [
        "interpolate",
        ["linear"],
        ["zoom"],
        16,
        10,
        18,
        12,
        20,
        14,
      ],
      "text-letter-spacing": 0.04,
      "text-rotation-alignment": "map",
    },
    paint: {
      "text-color": "#e5e7eb",
      "text-halo-color": "#111827",
      "text-halo-width": 1.4,
      "text-opacity": 0.88,
    },
  });
}
// =====================================================
// BUILDINGS
// =====================================================

function addBuildingsLayer() {
  map.addSource("buildings", {
    type: "geojson",
    data: buildingsData,
  });

  map.addLayer({
    id: "buildings-3d",
    type: "fill-extrusion",
    source: "buildings",
    paint: {
      "fill-extrusion-color": [
        "match",
        ["downcase", ["coalesce", ["get", "type"], "other"]],
        "academic",
        "#2563eb",
        "hostel",
        "#7c3aed",
        "library",
        "#16a34a",
        "administrative",
        "#f97316",
        "admin",
        "#f97316",
        "cafe",
        "#f59e0b",
        "sports",
        "#22c55e",
        "religious",
        "#14b8a6",
        "emergency",
        "#ef4444",
        "#64748b",
      ],
      "fill-extrusion-height": [
        "case",
        ["has", "height"],
        ["to-number", ["get", "height"]],
        ["has", "floor"],
        ["*", ["to-number", ["get", "floor"]], 4],
        ["has", "floors"],
        ["*", ["to-number", ["get", "floors"]], 4],
        12,
      ],
      "fill-extrusion-base": 0,
      "fill-extrusion-opacity": 1,
    },
  });

  map.addLayer({
    id: "building-outline",
    type: "line",
    source: "buildings",
    paint: {
      "line-color": "#ffffff",
      "line-width": 1,
      "line-opacity": 0.5,
    },
  });

  map.addLayer({
    id: "building-label",
    type: "symbol",
    source: "buildings",
    minzoom: 17,
    layout: {
      "text-field": ["coalesce", ["get", "name"], ["get", "building_name"], ""],
      "text-size": 12,
      "text-anchor": "center",
      "text-allow-overlap": false,
    },
    paint: {
      "text-color": "#ffffff",
      "text-halo-color": "#020617",
      "text-halo-width": 1.4,
    },
  });

  map.on("click", "buildings-3d", (e) => {
    const feature = e.features[0];
    const center = getFeatureCenter(feature);

    selectedDestination = {
      type: "building",
      feature,
      coordinates: center,
    };

    clearRoute();
    hideAllPOIMarkers();
    showFeatureInfo(feature, "building");
    showSelectedPopup(feature, center);
    flyToLocation(center, 18.2);
  });

  map.on("mouseenter", "buildings-3d", () => {
    map.getCanvas().style.cursor = "pointer";
  });

  map.on("mouseleave", "buildings-3d", () => {
    map.getCanvas().style.cursor = "";
  });
}

// =====================================================
// POI
// =====================================================

function addPOILayer() {
  map.addSource("poi", {
    type: "geojson",
    data: poiData,
  });

  map.addLayer({
    id: "poi-circle",
    type: "circle",
    source: "poi",
    paint: {
      "circle-radius": 1,
      "circle-opacity": 0,
      "circle-stroke-opacity": 0,
    },
    filter: ["==", ["get", "type"], "__hidden__"],
  });

  map.addLayer({
    id: "poi-label",
    type: "symbol",
    source: "poi",
    minzoom: 17,
    layout: {
      "text-field": ["coalesce", ["get", "name"], ""],
      "text-size": 12,
      "text-offset": [0, 1.6],
      "text-anchor": "top",
      "text-allow-overlap": false,
    },
    paint: {
      "text-color": "#ffffff",
      "text-halo-color": "#020617",
      "text-halo-width": 1.4,
    },
    filter: ["==", ["get", "type"], "__hidden__"],
  });

  addPOIHTMLMarkers();

  map.on("click", "poi-circle", (e) => {
    selectPOIFeature(e.features[0]);
  });
}

function addPOIHTMLMarkers() {
  poiMarkers.forEach((item) => item.marker.remove());
  poiMarkers = [];

  if (!poiData || !poiData.features) return;

  poiData.features.forEach((feature) => {
    if (!feature.geometry || feature.geometry.type !== "Point") return;

    const props = feature.properties || {};
    const type = cleanText(props.type || "other").toLowerCase();
    const coordinates = feature.geometry.coordinates;

    if (!isValidCoord(coordinates)) return;

    const el = document.createElement("div");
    el.className = "poi-html-marker";
    el.innerHTML = getPOIIcon(type);
    el.title = props.name || "Campus Place";
    el.style.display = "none";

    el.addEventListener("click", (event) => {
      event.stopPropagation();
      selectPOIFeature(feature);
    });

    const marker = new maplibregl.Marker({
      element: el,
      anchor: "center",
    })
      .setLngLat(coordinates)
      .addTo(map);

    poiMarkers.push({
      marker,
      type,
      feature,
    });
  });
}

function getPOIIcon(type) {
  const icons = {
    atm: "🏧",
    gate: "🚪",
    entrance: "🚪",
    cafe: "☕",
    shop: "🛒",
    parking: "🅿️",
    library: "📚",
    transport: "🚏",
    academic: "🏫",
  };

  return icons[type] || "📍";
}

function hideAllPOIMarkers() {
  poiMarkers.forEach((item) => {
    item.marker.getElement().style.display = "none";
  });
}

function updatePOIHTMLMarkers(filterType) {
  poiMarkers.forEach((item) => {
    const element = item.marker.getElement();

    if (filterType === "all" || filterType === "gate") {
      element.style.display =
        item.type === "gate" ||
        item.type === "entrance" ||
        item.type === "transport"
          ? "flex"
          : "none";
      return;
    }

    element.style.display = item.type === filterType ? "flex" : "none";
  });
}

function showOnlyNearbyPOIMarkers(nearbyItems) {
  const nearbyNames = new Set(
    nearbyItems.map((item) => item.label.toLowerCase()),
  );

  poiMarkers.forEach((item) => {
    const props = item.feature.properties || {};
    const name = cleanText(props.name || "").toLowerCase();
    const element = item.marker.getElement();

    element.style.display = nearbyNames.has(name) ? "flex" : "none";
  });
}

function showOnlySelectedPOIMarker(feature) {
  const selectedName = cleanText(feature.properties?.name || "").toLowerCase();

  poiMarkers.forEach((item) => {
    const props = item.feature.properties || {};
    const name = cleanText(props.name || "").toLowerCase();
    const element = item.marker.getElement();

    element.style.display = name === selectedName ? "flex" : "none";
  });
}

function selectPOIFeature(feature) {
  const coordinates = feature.geometry.coordinates.slice();

  selectedDestination = {
    type: "poi",
    feature,
    coordinates,
  };

  clearRoute();
  showOnlySelectedPOIMarker(feature);
  showFeatureInfo(feature, "poi");
  showSelectedPopup(feature, coordinates);
  flyToLocation(coordinates, 18.2);
}

// =====================================================
// USER LOCATION - REAL GPS WITH ROTATING MARKER
// =====================================================

function initUserMarker() {
  if (userMarker) return;

  // The outer container is managed by MapLibre's transform: translate()
  const container = document.createElement("div");
  container.className = "user-marker-container";
  container.style.width = "48px";
  container.style.height = "48px";
  container.style.display = "flex";
  container.style.alignItems = "center";
  container.style.justifyContent = "center";

  // The inner arrow container will handle the smooth rotation
  const arrowDiv = document.createElement("div");
  arrowDiv.id = "user-arrow-icon";
  arrowDiv.style.width = "100%";
  arrowDiv.style.height = "100%";
  arrowDiv.style.transformOrigin = "center center";
  arrowDiv.style.transition = "transform 0.4s cubic-bezier(0.25, 1, 0.5, 1)"; // Smooth ease-out
  arrowDiv.style.display = "flex";
  arrowDiv.style.alignItems = "center";
  arrowDiv.style.justifyContent = "center";

  // Google Maps Style Blue Directional Arrow SVG
  arrowDiv.innerHTML = `
    <svg width="48" height="48" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <circle cx="50" cy="50" r="35" fill="#4285F4" fill-opacity="0.2"/>
      <circle cx="50" cy="50" r="18" fill="#ffffff" filter="drop-shadow(0 2px 4px rgba(0,0,0,0.3))"/>
      <path d="M50 20 L68 68 L50 58 L32 68 Z" fill="#4285F4"/>
    </svg>
  `;

  container.appendChild(arrowDiv);

  userMarker = new maplibregl.Marker({
    element: container,
    anchor: "center",
    pitchAlignment: "map", // Keeps marker aligned smoothly with the terrain in 3D
    rotationAlignment: "map", // Syncs parent element with Map bearing automatically
  });
}

function updateUserMarkerPosition(coord) {
  if (!userMarker) {
    initUserMarker();
    userMarker.setLngLat(coord).addTo(map);
  } else {
    userMarker.setLngLat(coord);
  }
}

function updateMarkerHeading(heading) {
  if (heading === null || heading === undefined) return;

  const arrowDiv = document.getElementById("user-arrow-icon");
  if (!arrowDiv) return;

  // Compute shortest angular distance for smooth rotation wrap-around
  let currentAngle = currentMarkerRotation % 360;
  if (currentAngle < 0) currentAngle += 360; // Normalize 0-360

  let delta = heading - currentAngle;

  // Find the shortest path (clockwise vs counter-clockwise)
  if (delta > 180) {
    delta -= 360;
  } else if (delta < -180) {
    delta += 360;
  }

  currentMarkerRotation += delta;

  // Apply the CSS rotation transform
  arrowDiv.style.transform = `rotate(${currentMarkerRotation}deg)`;
}

function getUserLocation(flyToUser = true) {
  if (!navigator.geolocation) {
    alert("Geolocation is not supported by your browser.");
    return;
  }

  console.log("Secure context:", window.isSecureContext);

  if (!window.isSecureContext) {
    alert(
      "Location works only on HTTPS or localhost. Please run the project on localhost or deploy it on HTTPS.",
    );
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (position) => {
      userLocation = [position.coords.longitude, position.coords.latitude];
      const heading = position.coords.heading;

      console.log("✅ Location found:", userLocation);
      console.log("Accuracy:", position.coords.accuracy, "meters");

      updateUserMarkerPosition(userLocation);
      updateMarkerHeading(heading);

      if (flyToUser) {
        map.flyTo({
          center: userLocation,
          zoom: 18,
          pitch: window.innerWidth <= 900 ? 45 : is3DEnabled ? 62 : 0,
          bearing:
            window.innerWidth <= 900 ? -15 : is3DEnabled ? map.getBearing() : 0,
          duration: 1400,
          essential: true,
        });
      }

      if (infoCard) {
        infoCard.innerHTML = `
          <h2>Your Location Found</h2>
          <p><strong>Accuracy:</strong> ${Math.round(position.coords.accuracy)} meters</p>
          <p>Select a destination and click START DIRECTIONS.</p>
        `;
      }

      watchUserLocation();
    },

    (error) => {
      console.error("❌ Location error code:", error.code);
      console.error("❌ Location error message:", error.message);

      if (error.code === 1) {
        alert(
          "Location permission is blocked. Please allow location in Chrome site settings and also enable Chrome in Mac Location Services.",
        );
      } else if (error.code === 2) {
        alert(
          "Location is unavailable. Turn on Location Services/Wi-Fi and try again.",
        );
      } else if (error.code === 3) {
        alert(
          "Location request timed out. Try again or move near an open area/window.",
        );
      } else {
        alert("Unknown location error. Check console for details.");
      }
    },

    {
      enableHighAccuracy: true,
      timeout: 30000,
      maximumAge: 0,
    },
  );
}

function watchUserLocation() {
  if (!navigator.geolocation) {
    alert("Geolocation is not supported by your browser.");
    return;
  }

  if (watchId !== null) return;

  watchId = navigator.geolocation.watchPosition(
    (position) => {
      userLocation = [position.coords.longitude, position.coords.latitude];
      const heading = position.coords.heading;

      console.log("📍 Live location updated:", userLocation);

      updateUserMarkerPosition(userLocation);
      updateMarkerHeading(heading);

      if (selectedDestination && currentRouteCoords.length > 1) {
        const now = Date.now();

        if (now - lastRouteTrimUpdateTime >= ROUTE_TRIM_INTERVAL) {
          updateRouteWhileMoving(userLocation);
          lastRouteTrimUpdateTime = now;
        }
      }
    },

    (error) => {
      console.warn("Live location tracking error code:", error.code);
      console.warn("Live location tracking error message:", error.message);
    },

    {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 10000,
    },
  );
}

function stopUserLocationWatch() {
  if (watchId !== null && navigator.geolocation) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
}

// =====================================================
// ROUTE LAYER
// =====================================================

function addRouteLayer() {
  map.addSource("route", {
    type: "geojson",
    data: emptyFeatureCollection(),
  });

  // Apply to road segments only
  map.addLayer({
    id: "route-glow",
    type: "line",
    source: "route",
    filter: ["==", "type", "road"],
    layout: {
      "line-cap": "round",
      "line-join": "round",
    },
    paint: {
      "line-color": "#f97316",
      "line-width": 14,
      "line-opacity": 0.3,
      "line-blur": 5,
    },
  });

  // Apply to road segments only
  map.addLayer({
    id: "route-line",
    type: "line",
    source: "route",
    filter: ["==", "type", "road"],
    layout: {
      "line-cap": "round",
      "line-join": "round",
    },
    paint: {
      "line-color": "#fbd00f",
      "line-width": 5,
      "line-opacity": 1,
    },
  });

  // Dashed line for the virtual connection to the building
  map.addLayer({
    id: "route-dashed",
    type: "line",
    source: "route",
    filter: ["==", "type", "access"],
    layout: {
      "line-cap": "round",
      "line-join": "round",
    },
    paint: {
      "line-color": "#0f91fb",
      "line-width": 4,
      "line-dasharray": [2, 2],
      "line-opacity": 0.8,
    },
  });
}

function drawRoute(roadCoords, accessCoords = [], fitToRoute = true) {
  if (!Array.isArray(roadCoords) || roadCoords.length < 2) return;

  currentRouteCoords = roadCoords;
  currentAccessCoords = accessCoords;

  const features = [
    {
      type: "Feature",
      properties: { type: "road" },
      geometry: {
        type: "LineString",
        coordinates: roadCoords,
      },
    },
  ];

  // If we generated a virtual access route, add it to the same FeatureCollection
  if (accessCoords.length >= 2) {
    features.push({
      type: "Feature",
      properties: { type: "access" },
      geometry: {
        type: "LineString",
        coordinates: accessCoords,
      },
    });
  }

  map.getSource("route").setData({
    type: "FeatureCollection",
    features: features,
  });

  if (!fitToRoute) return;

  const bounds = new maplibregl.LngLatBounds();
  roadCoords.forEach((coord) => bounds.extend(coord));
  accessCoords.forEach((coord) => bounds.extend(coord));

  map.fitBounds(bounds, {
    padding:
      window.innerWidth <= 900
        ? { top: 100, bottom: 130, left: 20, right: 20 }
        : 130,
    duration: 1200,
    pitch: window.innerWidth <= 900 ? 55 : is3DEnabled ? 60 : 0,
    bearing: window.innerWidth <= 900 ? -15 : map.getBearing(),
  });
}

function clearRoute() {
  currentRouteCoords = [];
  currentAccessCoords = [];
  lastRouteTrimUpdateTime = 0;
  lastRouteRecalculateTime = 0;

  if (map.getSource("route")) {
    map.getSource("route").setData(emptyFeatureCollection());
  }

  // Removes the clean destination dot when the route is cleared
  if (destinationMarker) {
    destinationMarker.remove();
    destinationMarker = null;
  }
}

// =====================================================
// LIVE ROUTE TRIMMING & DESTINATION REACHED LOGIC
// =====================================================

function updateRouteWhileMoving(currentLocation) {
  if (!currentLocation || !selectedDestination) return;

  // Calculate direct physical distance to the destination coordinate
  const distanceToTarget = distanceInMeters(
    currentLocation,
    selectedDestination.coordinates,
  );

  if (distanceToTarget <= 10) {
    showDestinationReachedMessage();
    return;
  }

  if (!currentRouteCoords || currentRouteCoords.length < 2) return;

  const nearest = findNearestPointOnRoute(currentLocation, currentRouteCoords);

  if (!nearest) return;

  if (nearest.distance > ROUTE_RECALCULATE_DISTANCE) {
    const now = Date.now();

    if (now - lastRouteRecalculateTime >= ROUTE_RECALCULATE_INTERVAL) {
      recalculateRouteFromLiveLocation();
      lastRouteRecalculateTime = now;
    }

    return;
  }

  const remainingRoute = [
    nearest.projectedCoord,
    ...currentRouteCoords.slice(nearest.nextIndex),
  ];

  // Fallback trigger if they run out of route coordinates
  if (remainingRoute.length < 2) {
    showDestinationReachedMessage();
    return;
  }

  drawRoute(remainingRoute, currentAccessCoords, false);

  const remainingDistance =
    calculateRouteDistance(remainingRoute) +
    calculateRouteDistance(currentAccessCoords);
  updateRouteInfoCard(remainingDistance);
}

function findNearestPointOnRoute(point, routeCoords) {
  let best = null;

  for (let i = 0; i < routeCoords.length - 1; i++) {
    const a = routeCoords[i];
    const b = routeCoords[i + 1];

    const projected = projectPointOnSegment(point, a, b);
    const distance = distanceInMeters(point, projected.coord);

    if (!best || distance < best.distance) {
      best = {
        distance,
        segmentIndex: i,
        nextIndex: projected.t >= 0.85 ? i + 2 : i + 1,
        projectedCoord: projected.coord,
      };
    }
  }

  if (!best) return null;

  best.nextIndex = Math.min(best.nextIndex, routeCoords.length - 1);

  return best;
}

function projectPointOnSegment(point, a, b) {
  const px = point[0];
  const py = point[1];

  const ax = a[0];
  const ay = a[1];

  const bx = b[0];
  const by = b[1];

  const dx = bx - ax;
  const dy = by - ay;

  const lengthSquared = dx * dx + dy * dy;

  if (lengthSquared === 0) {
    return {
      coord: a,
      t: 0,
    };
  }

  let t = ((px - ax) * dx + (py - ay) * dy) / lengthSquared;
  t = Math.max(0, Math.min(1, t));

  return {
    coord: [ax + t * dx, ay + t * dy],
    t,
  };
}

function recalculateRouteFromLiveLocation() {
  if (!userLocation || !selectedDestination) return;

  buildRoadGraph();

  const destinationCoord = selectedDestination.coordinates;

  const startNode = findNearestRoadNode(userLocation);
  const endNode = findBestDestinationAccessNode(selectedDestination);

  if (!startNode || !endNode) {
    console.warn(
      "Could not find road access node for live route recalculation.",
    );
    return;
  }

  const pathKeys = dijkstra(startNode, endNode);

  if (!pathKeys || pathKeys.length < 2) {
    console.warn(
      "No connected road path found during live route recalculation.",
    );
    return;
  }

  const roadPathCoords = pathKeys.map((key) => keyToCoord(key));

  const roadRoute = [userLocation, ...roadPathCoords];
  const finalRoadCoord = roadPathCoords[roadPathCoords.length - 1];
  const accessRoute = [finalRoadCoord, destinationCoord];

  drawRoute(roadRoute, accessRoute, false);

  const remainingDistance =
    calculateRouteDistance(roadRoute) + calculateRouteDistance(accessRoute);
  updateRouteInfoCard(remainingDistance);
}

function updateRouteInfoCard(distance) {
  if (!selectedDestination || !infoCard) return;

  const destinationName = getFeatureName(selectedDestination.feature);

  infoCard.innerHTML = `
    <h2>Route to ${destinationName}</h2>
    <p><strong>Remaining distance:</strong> ${Math.round(distance)} meters</p>
  `;
}

// --- ENHANCED DESTINATION REACHED UI (WITH IMAGE) ---
function showDestinationReachedMessage() {
  clearRoute(); // Removes the blue line from the map

  if (!selectedDestination || !infoCard) return;

  const feature = selectedDestination.feature;
  const destinationName = getFeatureName(feature);

  // Try to get the image from the GeoJSON properties
  const props = feature.properties || {};
  const imageName = props.image ? cleanText(props.image) : "";

  // Create the HTML for the image if it exists in your data
  const imageHTML = imageName
    ? `<img src="images/${imageName}" class="info-card-img" alt="${destinationName}" style="width: 100%; height: 140px; object-fit: cover; border-radius: 8px; margin-top: 12px; border: 1px solid rgba(255,255,255,0.2);">`
    : ``;

  // Update the bottom card with a success theme and the image
  infoCard.innerHTML = `
    <div style="background: linear-gradient(135deg, #166534, #14532d); padding: 20px; border-radius: 12px; border: 1px solid #22c55e; text-align: center; box-shadow: 0 10px 30px rgba(22, 101, 52, 0.4);">
        <div style="font-size: 36px; margin-bottom: 8px;">🏁</div>
        <h2 style="margin-top:0; color: #ffffff; font-size: 20px;">Destination Reached!</h2>
        <p style="color: #dcfce7; font-size: 14px; margin-bottom: 0;">You have arrived at <strong>${destinationName}</strong>.</p>
        ${imageHTML}
    </div>
  `;

  // Trigger a longer, celebratory vibration pattern on Android devices
  if (navigator.vibrate) {
    navigator.vibrate([200, 100, 200, 100, 400]);
  }
}

// =====================================================
// SEARCH
// =====================================================

function buildSearchIndex() {
  allSearchItems = [];

  if (buildingsData && buildingsData.features) {
    buildingsData.features.forEach((feature) => {
      const props = feature.properties || {};

      const name = cleanText(
        props.name || props.building_name || "Unnamed Building",
      );
      const departments = cleanText(
        props.departments || props.department || "",
      );
      const type = cleanText(props.type || "building");
      const description = cleanText(props.description || "");

      allSearchItems.push({
        label: name,
        searchText:
          `${name} ${departments} ${type} ${description}`.toLowerCase(),
        type: "building",
        feature,
        coordinates: getFeatureCenter(feature),
      });
    });
  }
  if (landuseData && landuseData.features) {
    landuseData.features.forEach((feature) => {
      const props = feature.properties || {};

      const name = cleanText(props.name || "Unnamed landUse");
      const type = cleanText(props.type || "landuse");
      const description = cleanText(props.description || "");

      allSearchItems.push({
        label: name,
        searchText: `${name} ${type} ${description}`.toLowerCase(),
        type: "landuse",
        feature,
        coordinates: getFeatureCenter(feature),
      });
    });
  }
  if (poiData && poiData.features) {
    poiData.features.forEach((feature) => {
      const props = feature.properties || {};

      const name = cleanText(props.name || "Unnamed POI");
      const type = cleanText(props.type || "poi");
      const description = cleanText(props.description || "");

      allSearchItems.push({
        label: name,
        searchText: `${name} ${type} ${description}`.toLowerCase(),
        type: "poi",
        feature,
        coordinates: feature.geometry.coordinates,
      });
    });
  }
}

function createSearchDropdown() {
  if (document.getElementById("searchDropdown")) return;

  const dropdown = document.createElement("div");
  dropdown.id = "searchDropdown";

  dropdown.style.position = "absolute";
  dropdown.style.top = "110px";
  dropdown.style.left = "50%";
  dropdown.style.transform = "translateX(-50%)";
  dropdown.style.width = "470px";
  dropdown.style.maxHeight = "270px";
  dropdown.style.overflowY = "auto";
  dropdown.style.zIndex = "999";
  dropdown.style.background = "rgba(15, 23, 42, 0.96)";
  dropdown.style.border = "1px solid rgba(148, 163, 184, 0.25)";
  dropdown.style.borderRadius = "16px";
  dropdown.style.boxShadow = "0 20px 60px rgba(0,0,0,0.45)";
  dropdown.style.display = "none";
  dropdown.style.backdropFilter = "blur(16px)";

  document.body.appendChild(dropdown);
}

function showSearchResults(results) {
  const dropdown = document.getElementById("searchDropdown");
  if (!dropdown) return;

  if (!results.length) {
    dropdown.style.display = "none";
    dropdown.innerHTML = "";
    return;
  }

  dropdown.innerHTML = results
    .slice(0, 8)
    .map((item, index) => {
      const props = item.feature.properties || {};
      const type = props.type || item.type;

      return `
      <div class="search-result-item" data-index="${index}"
        style="
          padding: 14px 16px;
          cursor: pointer;
          color: white;
          border-bottom: 1px solid rgba(148,163,184,0.14);
          font-weight: 700;
        ">
        <div style="font-size:14px;">${item.label}</div>
        <div style="font-size:12px; color:#94a3b8; margin-top:3px;">
          ${capitalize(type)}
        </div>
      </div>
    `;
    })
    .join("");

  dropdown.style.display = "block";

  document.querySelectorAll(".search-result-item").forEach((el, index) => {
    el.addEventListener("click", () => {
      selectSearchItem(results[index]);
      dropdown.style.display = "none";
    });

    el.addEventListener("mouseenter", () => {
      el.style.background = "rgba(249,115,22,0.16)";
    });

    el.addEventListener("mouseleave", () => {
      el.style.background = "transparent";
    });
  });
}

function selectSearchItem(item) {
  selectedDestination = {
    type: item.type,
    feature: item.feature,
    coordinates: item.coordinates,
  };

  clearRoute();

  if (item.type === "poi") {
    showOnlySelectedPOIMarker(item.feature);
  } else {
    hideAllPOIMarkers();
  }

  showFeatureInfo(item.feature, item.type);
  showSelectedPopup(item.feature, item.coordinates);

  flyToLocation(item.coordinates, 18.2);
}

if (searchInput) {
  searchInput.addEventListener("input", () => {
    const query = searchInput.value.trim().toLowerCase();

    clearRoute();

    if (!query) {
      const dropdown = document.getElementById("searchDropdown");
      if (dropdown) dropdown.style.display = "none";

      selectedDestination = null;

      if (selectedPopup) {
        selectedPopup.remove();
        selectedPopup = null;
      }

      hideAllPOIMarkers();
      showDefaultInfo();
      return;
    }

    const results = allSearchItems.filter((item) =>
      item.searchText.includes(query),
    );
    showSearchResults(results);
  });

  searchInput.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;

    const query = searchInput.value.trim().toLowerCase();
    if (!query) return;

    const result = allSearchItems.find((item) =>
      item.searchText.includes(query),
    );

    if (result) {
      selectSearchItem(result);
      const dropdown = document.getElementById("searchDropdown");
      if (dropdown) dropdown.style.display = "none";
    } else {
      alert("No matching building, department, or place found.");
    }
  });
}

document.addEventListener("click", (e) => {
  const dropdown = document.getElementById("searchDropdown");
  if (!dropdown) return;

  if (
    !e.target.closest(".search-box") &&
    !e.target.closest("#searchDropdown")
  ) {
    dropdown.style.display = "none";
  }
});

// =====================================================
// FILTERS
// =====================================================

filterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const filterType = button.dataset.filter;

    filterButtons.forEach((btn) => btn.classList.remove("active"));
    button.classList.add("active");

    if (mobileNearbyBtn) mobileNearbyBtn.classList.remove("active");

    applyFilter(filterType);
  });
});

function applyFilter(type) {
  clearRoute();
  updatePOIHTMLMarkers(type);

  // 1. "ALL" FILTER (AND DEFAULT LOAD) -> Buildings, Grass, and ONLY Gates
  if (type === "all") {
    safeSetFilter("buildings-3d", null);
    safeSetFilter("building-outline", null);
    safeSetFilter("building-label", null);

    const showGatesFilter = [
      "in",
      ["downcase", ["coalesce", ["get", "type"], ""]],
      ["literal", ["gate", "entrance", "transport"]],
    ];

    safeSetFilter("poi-circle", showGatesFilter);
    safeSetFilter("poi-label", showGatesFilter);

    safeSetFilter("landuse-fill", null);
    safeSetFilter("landuse-green-texture", [
      "in",
      ["downcase", ["coalesce", ["get", "type"], ""]],
      ["literal", ["park", "green_area", "garden", "green", "lawn"]],
    ]);
    safeSetFilter("landuse-green-depth", [
      "in",
      ["downcase", ["coalesce", ["get", "type"], ""]],
      ["literal", ["park", "green_area", "garden", "green", "lawn"]],
    ]);
    safeSetFilter("landuse-outline", null);

    showDefaultInfo();
    return;
  }

  // 2. GATE FILTER -> Hide Buildings/Grass, show ONLY Gates
  if (type === "gate") {
    const gateFilter = [
      "in",
      ["downcase", ["coalesce", ["get", "type"], ""]],
      ["literal", ["gate", "entrance", "transport"]],
    ];

    const emptyFilter = [
      "==",
      ["downcase", ["coalesce", ["get", "type"], ""]],
      "__nothing__",
    ];

    safeSetFilter("buildings-3d", emptyFilter);
    safeSetFilter("building-outline", emptyFilter);
    safeSetFilter("building-label", emptyFilter);

    safeSetFilter("poi-circle", gateFilter);
    safeSetFilter("poi-label", gateFilter);

    safeSetFilter("landuse-fill", emptyFilter);
    safeSetFilter("landuse-green-texture", emptyFilter);
    safeSetFilter("landuse-green-depth", emptyFilter);
    safeSetFilter("landuse-outline", emptyFilter);

    infoCard.innerHTML = `
      <h2>Gates</h2>
      <p>Showing campus gates and entrance points.</p>
    `;

    return;
  }

  // 3. ALL OTHER FILTERS (Cafes, ATMs, etc.)
  const filter = ["==", ["downcase", ["coalesce", ["get", "type"], ""]], type];

  safeSetFilter("buildings-3d", filter);
  safeSetFilter("building-outline", filter);
  safeSetFilter("building-label", filter);

  safeSetFilter("poi-circle", filter);
  safeSetFilter("poi-label", filter);

  safeSetFilter("landuse-fill", filter);
  safeSetFilter("landuse-green-texture", filter);
  safeSetFilter("landuse-green-depth", filter);
  safeSetFilter("landuse-outline", filter);

  infoCard.innerHTML = `
    <h2>${capitalize(type)}</h2>
    <p>Showing all ${type} related places on the campus map.</p>
  `;
}

function safeSetFilter(layerId, filter) {
  if (map.getLayer(layerId)) {
    map.setFilter(layerId, filter);
  }
}

// =====================================================
// INFO + POPUPS
// =====================================================

function showDefaultInfo() {
  infoCard.innerHTML = `
    <h2>Campus Map</h2>
    <p>Search a department, building, gate, cafe, ATM, or hostel to start navigation.</p>
  `;
}

function showFeatureInfo(feature, layerType) {
  const props = feature.properties || {};

  const name = cleanText(props.name || props.building_name || "Campus Place");
  const type = cleanText(props.type || layerType || "place");
  const departments = cleanText(props.departments || props.department || "");
  const description = cleanText(props.description || props.desc || "");
  const image = cleanText(props.image || "");

  const imageHTML = image
    ? `<img src="images/${image}" alt="${name}" class="info-card-img">`
    : "";

  let subtitle = "";

  if (departments) {
    subtitle = `<p><strong>Departments:</strong> ${departments}</p>`;
  } else if (description) {
    subtitle = `<p>${description}</p>`;
  } else {
    subtitle = `<p><strong>Type:</strong> ${capitalize(type)}</p>`;
  }

  infoCard.innerHTML = `
    <div class="selected-card">
      ${imageHTML}
      <div class="selected-card-content">
        <h2>${name}</h2>
        ${subtitle}
      </div>
    </div>
  `;
}

function showSelectedPopup(feature, coordinates) {
  const props = feature.properties || {};

  const name = cleanText(props.name || props.building_name || "Campus Place");
  const departments = cleanText(props.departments || props.department || "");
  const type = cleanText(props.type || "place");
  const image = cleanText(props.image || "");

  const imageHTML = image
    ? `<img src="images/${image}" class="mini-popup-img" alt="${name}">`
    : "";

  if (selectedPopup) selectedPopup.remove();

  selectedPopup = new maplibregl.Popup({
    closeButton: true,
    closeOnClick: false,
    offset: 18,
  })
    .setLngLat(coordinates)
    .setHTML(
      `
      <div class="mini-popup-card">
        <h3>${name}</h3>
        ${
          departments
            ? `<p>Departments: ${departments}</p>`
            : `<p>Type: ${capitalize(type)}</p>`
        }
        ${imageHTML}
      </div>
    `,
    )
    .addTo(map);
}

// =====================================================
// HOVER TOOLTIPS
// =====================================================

function addHoverTooltips() {
  hoverPopup = new maplibregl.Popup({
    closeButton: false,
    closeOnClick: false,
    offset: 12,
  });

  map.on("mousemove", "buildings-3d", (e) => {
    if (!e.features.length) return;

    const props = e.features[0].properties || {};
    const name = props.name || props.building_name || "Campus Building";

    map.getCanvas().style.cursor = "pointer";

    hoverPopup
      .setLngLat(e.lngLat)
      .setHTML(`<div class="hover-tooltip"><strong>${name}</strong></div>`)
      .addTo(map);
  });

  map.on("mouseleave", "buildings-3d", () => {
    map.getCanvas().style.cursor = "";
    hoverPopup.remove();
  });

  map.on("mousemove", "roads-line", (e) => {
    if (!e.features.length) return;

    const props = e.features[0].properties || {};
    const name = props.name || "Campus Road";
    const type = props.type || "road";

    map.getCanvas().style.cursor = "pointer";

    hoverPopup
      .setLngLat(e.lngLat)
      .setHTML(
        `
        <div class="hover-tooltip">
          <strong>${name}</strong><br>
          <span>${capitalize(type)}</span>
        </div>
      `,
      )
      .addTo(map);
  });

  map.on("mouseleave", "roads-line", () => {
    map.getCanvas().style.cursor = "";
    hoverPopup.remove();
  });
}

// =====================================================
// CLOSE NEARBY BOX LOGIC
// =====================================================

window.closeNearbyBox = function () {
  if (nearbyBtn) nearbyBtn.classList.remove("active");
  if (mobileNearbyBtn) mobileNearbyBtn.classList.remove("active");

  const allBtn = document.querySelector('.filter-btn[data-filter="all"]');
  if (allBtn) allBtn.classList.add("active");

  applyFilter("all");
  showDefaultInfo();
};

// =====================================================
// NEARBY
// =====================================================

function handleNearbyClick() {
  clearRoute();

  filterButtons.forEach((btn) => btn.classList.remove("active"));

  if (nearbyBtn) nearbyBtn.classList.add("active");
  if (mobileNearbyBtn) mobileNearbyBtn.classList.add("active");

  if (!userLocation) {
    getUserLocation(true);

    setTimeout(() => {
      if (userLocation) showNearbyPlaces();
    }, 1600);

    return;
  }

  showNearbyPlaces();
}

if (nearbyBtn) {
  nearbyBtn.addEventListener("click", handleNearbyClick);
}

if (mobileNearbyBtn) {
  mobileNearbyBtn.addEventListener("click", handleNearbyClick);
}

function showNearbyPlaces() {
  if (!userLocation) {
    alert("Please allow location first.");
    return;
  }

  const groups = [
    {
      title: "Nearby Gates",
      types: ["gate", "entrance", "transport"],
      icon: "🚪",
    },
    { title: "Nearby ATMs", types: ["atm"], icon: "🏧" },
    { title: "Nearby Cafes", types: ["cafe"], icon: "☕" },
    { title: "Nearby Shops", types: ["shop"], icon: "🛒" },
    { title: "Nearby Parking", types: ["parking"], icon: "🅿️" },
  ];

  let html = `
    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
      <h2 style="margin: 0;">Nearby Places</h2>
      <button onclick="window.closeNearbyBox()" style="background: transparent; border: none; color: #94a3b8; font-size: 28px; cursor: pointer; padding: 0; line-height: 1;" title="Close">&times;</button>
    </div>
  `;

  let foundAny = false;
  let allNearbyItems = [];

  groups.forEach((group) => {
    const items = allSearchItems
      .filter((item) => {
        const props = item.feature.properties || {};
        const type = cleanText(props.type || "").toLowerCase();
        return group.types.includes(type);
      })
      .map((item) => {
        const distance = distanceInMeters(userLocation, item.coordinates);
        return { ...item, distance };
      })
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 2);

    allNearbyItems.push(...items);

    if (!items.length) return;

    foundAny = true;

    html += `
      <div style="margin-top:12px;">
        <p style="margin-bottom:6px;">
          <strong>${group.icon} ${group.title}</strong>
        </p>

        ${items
          .map((item) => {
            const props = item.feature.properties || {};
            const type = cleanText(props.type || "place");

            return `
            <p
              style="cursor:pointer; margin-bottom:9px; padding-left:8px;"
              onclick="window.selectNearbyByName('${escapeQuotes(item.label)}')"
            >
              <strong>${item.label}</strong> — ${capitalize(type)}
              <br>
              <span style="color:#94a3b8;">
                ${Math.round(item.distance)} meters away
              </span>
            </p>
          `;
          })
          .join("")}
      </div>
    `;
  });

  if (!foundAny) {
    updatePOIHTMLMarkers("all");

    infoCard.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
        <h2 style="margin: 0;">Nearby Places</h2>
        <button onclick="window.closeNearbyBox()" style="background: transparent; border: none; color: #94a3b8; font-size: 28px; cursor: pointer; padding: 0; line-height: 1;" title="Close">&times;</button>
      </div>
      <p>No nearby gate, ATM, cafe, shop, or parking point found in your POI data.</p>
    `;
    return;
  }

  showOnlyNearbyPOIMarkers(allNearbyItems);
  infoCard.innerHTML = html;
}

window.selectNearbyByName = function (name) {
  const item = allSearchItems.find((i) => i.label === name);
  if (item) selectSearchItem(item);
};

// =====================================================
// DIJKSTRA ROUTING
// =====================================================

function buildRoadGraph() {
  roadGraph = {};

  if (!roadsData || !roadsData.features) return;

  roadsData.features.forEach((feature) => {
    const geometry = feature.geometry;
    if (!geometry) return;

    const roadType = (feature.properties?.type || "").toLowerCase();

    if (navigationMode === "vehicle") {
      if (
        roadType !== "primary" &&
        roadType !== "secondary" &&
        roadType !== "service"
      ) {
        return;
      }
    }

    if (geometry.type === "LineString") {
      addLineToGraph(geometry.coordinates);
    }

    if (geometry.type === "MultiLineString") {
      geometry.coordinates.forEach((line) => addLineToGraph(line));
    }
  });
  console.log(roadGraph);
}

function addLineToGraph(coords) {
  for (let i = 0; i < coords.length - 1; i++) {
    const a = coords[i];
    const b = coords[i + 1];

    if (!isValidCoord(a) || !isValidCoord(b)) continue;

    const keyA = coordKey(a);
    const keyB = coordKey(b);
    const weight = distanceInMeters(a, b);

    if (!roadGraph[keyA]) roadGraph[keyA] = [];
    if (!roadGraph[keyB]) roadGraph[keyB] = [];

    roadGraph[keyA].push({ node: keyB, weight });
    roadGraph[keyB].push({ node: keyA, weight });
  }
}

function findNearestRoadNode(coord) {
  let nearestKey = null;
  let nearestDistance = Infinity;

  Object.keys(roadGraph).forEach((key) => {
    const roadCoord = keyToCoord(key);
    const distance = distanceInMeters(coord, roadCoord);

    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestKey = key;
    }
  });

  return nearestKey;
}

function dijkstra(startKey, endKey) {
  const distances = {};
  const previous = {};
  const visited = new Set();
  const queue = [];

  Object.keys(roadGraph).forEach((key) => {
    distances[key] = Infinity;
    previous[key] = null;
  });

  distances[startKey] = 0;
  queue.push({ node: startKey, distance: 0 });

  while (queue.length > 0) {
    queue.sort((a, b) => a.distance - b.distance);

    const current = queue.shift();
    const currentNode = current.node;

    if (visited.has(currentNode)) continue;
    visited.add(currentNode);

    if (currentNode === endKey) break;

    const neighbors = roadGraph[currentNode] || [];

    neighbors.forEach((edge) => {
      const neighbor = edge.node;
      if (visited.has(neighbor)) return;

      const newDistance = distances[currentNode] + edge.weight;

      if (newDistance < distances[neighbor]) {
        distances[neighbor] = newDistance;
        previous[neighbor] = currentNode;
        queue.push({ node: neighbor, distance: newDistance });
      }
    });
  }

  const path = [];
  let current = endKey;

  while (current) {
    path.unshift(current);
    current = previous[current];
  }

  return path[0] === startKey ? path : null;
}

// =====================================================
// BUILDING ACCESS ROAD LOGIC
// =====================================================

function findBestDestinationAccessNode(destination) {
  if (!destination || !destination.feature) return null;

  const feature = destination.feature;
  const geometry = feature.geometry;

  if (
    geometry &&
    (geometry.type === "Polygon" || geometry.type === "MultiPolygon")
  ) {
    const access = findClosestRoadAccessToBuilding(feature);

    if (access && access.coord && access.segmentA && access.segmentB) {
      const accessNodeKey = addVirtualRoadNode(
        access.coord,
        access.segmentA,
        access.segmentB,
      );

      console.log("✅ Building access road selected:", access.coord);
      console.log(
        "Distance from building boundary:",
        access.distance,
        "meters",
      );

      return accessNodeKey;
    }

    console.warn(
      "⚠️ No building access road found. Falling back to nearest road node.",
    );
  }

  return findNearestRoadNode(destination.coordinates);
}

function findClosestRoadAccessToBuilding(buildingFeature) {
  if (!roadsData || !roadsData.features) return null;
  if (!buildingFeature || !buildingFeature.geometry) return null;

  const buildingCoords = getAllPolygonCoordinates(buildingFeature.geometry);

  if (!buildingCoords.length) return null;

  let bestAccess = null;

  roadsData.features.forEach((roadFeature) => {
    const geometry = roadFeature.geometry;
    if (!geometry) return;

    const lines = [];

    if (geometry.type === "LineString") {
      lines.push(geometry.coordinates);
    }

    if (geometry.type === "MultiLineString") {
      geometry.coordinates.forEach((line) => lines.push(line));
    }

    lines.forEach((line) => {
      for (let i = 0; i < line.length - 1; i++) {
        const segmentA = line[i];
        const segmentB = line[i + 1];

        if (!isValidCoord(segmentA) || !isValidCoord(segmentB)) continue;

        buildingCoords.forEach((buildingPoint) => {
          const projected = projectPointOnSegment(
            buildingPoint,
            segmentA,
            segmentB,
          );

          const distance = distanceInMeters(buildingPoint, projected.coord);

          if (!bestAccess || distance < bestAccess.distance) {
            bestAccess = {
              coord: projected.coord,
              segmentA,
              segmentB,
              distance,
            };
          }
        });
      }
    });
  });

  return bestAccess;
}

function getAllPolygonCoordinates(geometry) {
  const coords = [];

  if (!geometry) return coords;

  if (geometry.type === "Polygon") {
    geometry.coordinates.forEach((ring) => {
      ring.forEach((coord) => {
        if (isValidCoord(coord)) coords.push(coord);
      });
    });
  }

  if (geometry.type === "MultiPolygon") {
    geometry.coordinates.forEach((polygon) => {
      polygon.forEach((ring) => {
        ring.forEach((coord) => {
          if (isValidCoord(coord)) coords.push(coord);
        });
      });
    });
  }

  return coords;
}

function addVirtualRoadNode(accessCoord, segmentA, segmentB) {
  const accessKey = coordKey(accessCoord);
  const keyA = coordKey(segmentA);
  const keyB = coordKey(segmentB);

  if (!roadGraph[accessKey]) roadGraph[accessKey] = [];
  if (!roadGraph[keyA]) roadGraph[keyA] = [];
  if (!roadGraph[keyB]) roadGraph[keyB] = [];

  const distanceToA = distanceInMeters(accessCoord, segmentA);
  const distanceToB = distanceInMeters(accessCoord, segmentB);

  addGraphEdge(accessKey, keyA, distanceToA);
  addGraphEdge(accessKey, keyB, distanceToB);

  return accessKey;
}

function addGraphEdge(fromKey, toKey, weight) {
  if (fromKey === toKey) return;

  if (!roadGraph[fromKey]) roadGraph[fromKey] = [];
  if (!roadGraph[toKey]) roadGraph[toKey] = [];

  const alreadyExists = roadGraph[fromKey].some((edge) => edge.node === toKey);

  if (!alreadyExists) {
    roadGraph[fromKey].push({
      node: toKey,
      weight,
    });
  }

  const reverseExists = roadGraph[toKey].some((edge) => edge.node === fromKey);

  if (!reverseExists) {
    roadGraph[toKey].push({
      node: fromKey,
      weight,
    });
  }
}

// =====================================================
// DIRECTIONS
// =====================================================

if (directionsBtn) {
  directionsBtn.addEventListener("click", () => {
    handleDirections();
  });
}

function handleDirections() {
  if (!selectedDestination) {
    alert("Please select a building, department, or place first.");
    return;
  }

  if (!userLocation) {
    getUserLocation(true);

    setTimeout(() => {
      if (userLocation) calculateAndDrawRoute();
    }, 1600);

    return;
  }

  calculateAndDrawRoute();
}

function calculateAndDrawRoute() {
  buildRoadGraph();
  const destinationCoord = selectedDestination.coordinates;

  const startNode = findNearestRoadNode(userLocation);
  const endNode = findBestDestinationAccessNode(selectedDestination);

  if (!startNode || !endNode) {
    alert(
      "Could not find road access point. Check roads GeoJSON and building data.",
    );
    return;
  }

  const pathKeys = dijkstra(startNode, endNode);

  if (!pathKeys || pathKeys.length < 2) {
    alert("No connected road path found. Check road connectivity in QGIS.");
    return;
  }

  const roadPathCoords = pathKeys.map((key) => keyToCoord(key));
  const destinationName = getFeatureName(selectedDestination.feature);

  // 1. Solid line representing actual campus roads
  const roadRoute = [userLocation, ...roadPathCoords];

  // 2. Dashed line connecting the final road node to the building center
  const finalRoadCoord = roadPathCoords[roadPathCoords.length - 1];
  const accessRoute = [finalRoadCoord, destinationCoord];

  drawRoute(roadRoute, accessRoute, true);

  if (selectedPopup) {
    selectedPopup.remove();
    selectedPopup = null;
  }

  if (destinationMarker) {
    destinationMarker.remove();
  }

  const markerEl = document.createElement("div");
  markerEl.innerHTML = `
    <div style="
      width: 20px; 
      height: 20px; 
      background: #16c8f9; 
      border: 3px solid #ffffff; 
      border-radius: 50%; 
      box-shadow: 0 4px 10px rgba(0,0,0,0.5);
    "></div>
  `;

  destinationMarker = new maplibregl.Marker({
    element: markerEl,
    anchor: "center",
  })
    .setLngLat(destinationCoord)
    .addTo(map);

  const totalDistance =
    calculateRouteDistance(roadRoute) + calculateRouteDistance(accessRoute);

  const walkMinutes = Math.ceil(totalDistance / 80);
  const vehicleMinutes = Math.ceil(totalDistance / 400);
  const timeText =
    navigationMode === "vehicle"
      ? `~${vehicleMinutes} min drive`
      : `~${walkMinutes} min walk`;

  infoCard.innerHTML = `
    <h2>Route to ${destinationName}</h2>
    <p>
      <strong>Distance:</strong> ${Math.round(totalDistance)} m &nbsp;·&nbsp;
      <strong>${timeText}</strong>
    </p>
    <p style="margin-top:6px;font-size:13px;color:#94a3b8;">
      ${navigationMode === "vehicle" ? "🚗 Vehicle route" : "🚶 Walking route"} · Follow the line
    </p>
  `;

  watchUserLocation();
}

// =====================================================
// BUTTONS
// =====================================================

if (zoomInBtn) {
  zoomInBtn.addEventListener("click", () => {
    map.zoomIn();
  });
}

if (zoomOutBtn) {
  zoomOutBtn.addEventListener("click", () => {
    map.zoomOut();
  });
}

if (resetViewBtn) {
  resetViewBtn.addEventListener("click", () => {
    clearRoute();

    selectedDestination = null;

    if (searchInput) searchInput.value = "";

    if (selectedPopup) {
      selectedPopup.remove();
      selectedPopup = null;
    }

    const dropdown = document.getElementById("searchDropdown");
    if (dropdown) dropdown.style.display = "none";

    hideAllPOIMarkers();

    if (nearbyBtn) nearbyBtn.classList.remove("active");
    if (mobileNearbyBtn) mobileNearbyBtn.classList.remove("active");

    applyFilter("all");

    filterButtons.forEach((btn) => btn.classList.remove("active"));

    const allBtn = document.querySelector('.filter-btn[data-filter="all"]');
    if (allBtn) allBtn.classList.add("active");

    showDefaultInfo();

    if (defaultCamera) {
      map.flyTo({
        center: defaultCamera.center,
        zoom: defaultCamera.zoom,
        pitch: defaultCamera.pitch,
        bearing: defaultCamera.bearing,
        duration: 1200,
        essential: true,
      });
    } else {
      fitCampusBounds();
    }
  });
}

if (toggle3DBtn) {
  toggle3DBtn.addEventListener("click", () => {
    is3DEnabled = !is3DEnabled;

    const isMobile = window.innerWidth <= 900;

    if (is3DEnabled) {
      map.easeTo({
        pitch: isMobile ? 45 : 62,
        bearing: isMobile ? -15 : -38,
        duration: 1000,
      });

      if (map.getLayer("buildings-3d")) {
        map.setPaintProperty("buildings-3d", "fill-extrusion-height", [
          "case",
          ["has", "height"],
          ["to-number", ["get", "height"]],
          ["has", "floor"],
          ["*", ["to-number", ["get", "floor"]], 4],
          ["has", "floors"],
          ["*", ["to-number", ["get", "floors"]], 4],
          12,
        ]);
      }

      if (map.getLayer("landuse-3d-trees")) {
        map.setPaintProperty("landuse-3d-trees", "fill-extrusion-height", [
          "match",
          ["downcase", ["coalesce", ["get", "type"], ""]],
          "forest",
          4,
          "park",
          2.5,
          "garden",
          1,
          "lawn",
          0.2,
          1.5,
        ]);
      }

      toggle3DBtn.textContent = "3D";
    } else {
      map.easeTo({
        pitch: 0,
        bearing: 0,
        duration: 1000,
      });

      if (map.getLayer("buildings-3d")) {
        map.setPaintProperty("buildings-3d", "fill-extrusion-height", 0);
      }

      if (map.getLayer("landuse-3d-trees")) {
        map.setPaintProperty("landuse-3d-trees", "fill-extrusion-height", 0);
      }

      toggle3DBtn.textContent = "2D";
    }
  });
}

// =====================================================
// HELPERS
// =====================================================

function saveDefaultCamera() {
  defaultCamera = {
    center: map.getCenter(),
    zoom: map.getZoom(),
    pitch: map.getPitch(),
    bearing: map.getBearing(),
  };
}

function flyToLocation(coord, zoom = 18) {
  const isMobile = window.innerWidth <= 900;

  map.flyTo({
    center: coord,
    zoom: isMobile ? 17.7 : zoom,
    pitch: isMobile ? 45 : is3DEnabled ? 62 : 0,
    bearing: isMobile ? -15 : is3DEnabled ? map.getBearing() : 0,

    padding: isMobile
      ? { top: 160, bottom: 260, left: 0, right: 0 }
      : { top: 0, bottom: 0, left: 0, right: 0 },

    duration: 1200,
    essential: true,
  });
}

function fitCampusBounds() {
  const bounds = new maplibregl.LngLatBounds();

  [buildingsData, roadsData, poiData, landuseData].forEach((data) => {
    if (!data || !data.features) return;

    data.features.forEach((feature) => {
      extendBoundsFromGeometry(bounds, feature.geometry);
    });
  });

  if (!bounds.isEmpty()) {
    const isMobile = window.innerWidth <= 900;

    map.fitBounds(bounds, {
      padding: isMobile
        ? {
            top: 210,
            bottom: 190,
            left: 120,
            right: 10,
          }
        : 80,

      duration: 1200,
      pitch: isMobile ? 45 : INITIAL_PITCH,
      bearing: isMobile ? -15 : INITIAL_BEARING,
      maxZoom: isMobile ? 17.8 : 17,
    });
  }
}

function extendBoundsFromGeometry(bounds, geometry) {
  if (!geometry) return;

  const type = geometry.type;
  const coords = geometry.coordinates;

  if (type === "Point") {
    bounds.extend(coords);
  }

  if (type === "LineString" || type === "MultiPoint") {
    coords.forEach((coord) => bounds.extend(coord));
  }

  if (type === "Polygon" || type === "MultiLineString") {
    coords.flat().forEach((coord) => bounds.extend(coord));
  }

  if (type === "MultiPolygon") {
    coords.flat(2).forEach((coord) => bounds.extend(coord));
  }
}

function getFeatureCenter(feature) {
  const geometry = feature.geometry;

  if (!geometry) return CAMPUS_CENTER;

  if (geometry.type === "Point") return geometry.coordinates;

  const coords = [];
  collectCoordinates(geometry.coordinates, coords);

  if (!coords.length) return CAMPUS_CENTER;

  let lngSum = 0;
  let latSum = 0;

  coords.forEach((coord) => {
    lngSum += coord[0];
    latSum += coord[1];
  });

  return [lngSum / coords.length, latSum / coords.length];
}

function collectCoordinates(input, output) {
  if (!Array.isArray(input)) return;

  if (typeof input[0] === "number" && typeof input[1] === "number") {
    output.push(input);
    return;
  }

  input.forEach((item) => collectCoordinates(item, output));
}

function getFeatureName(feature) {
  const props = feature.properties || {};
  return cleanText(props.name || props.building_name || "Selected Place");
}

function cleanText(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function capitalize(value) {
  if (!value) return "";
  value = String(value).toLowerCase();
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function escapeQuotes(value) {
  return String(value).replace(/'/g, "\\'");
}

function isValidCoord(coord) {
  return (
    Array.isArray(coord) &&
    coord.length >= 2 &&
    typeof coord[0] === "number" &&
    typeof coord[1] === "number"
  );
}

function coordKey(coord) {
  return `${coord[0].toFixed(6)},${coord[1].toFixed(6)}`;
}

function keyToCoord(key) {
  const [lng, lat] = key.split(",").map(Number);
  return [lng, lat];
}

function distanceInMeters(coord1, coord2) {
  const R = 6371000;

  const lng1 = (coord1[0] * Math.PI) / 180;
  const lat1 = (coord1[1] * Math.PI) / 180;
  const lng2 = (coord2[0] * Math.PI) / 180;
  const lat2 = (coord2[1] * Math.PI) / 180;

  const dLng = lng2 - lng1;
  const dLat = lat2 - lat1;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

function calculateRouteDistance(coords) {
  let total = 0;

  for (let i = 0; i < coords.length - 1; i++) {
    total += distanceInMeters(coords[i], coords[i + 1]);
  }

  return total;
}

function calculateBearing(startCoord, endCoord) {
  const lon1 = (startCoord[0] * Math.PI) / 180;
  const lat1 = (startCoord[1] * Math.PI) / 180;
  const lon2 = (endCoord[0] * Math.PI) / 180;
  const lat2 = (endCoord[1] * Math.PI) / 180;

  const y = Math.sin(lon2 - lon1) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(lon2 - lon1);

  let bearing = (Math.atan2(y, x) * 180) / Math.PI;
  return (bearing + 360) % 360;
}

function emptyFeatureCollection() {
  return {
    type: "FeatureCollection",
    features: [],
  };
}

// =====================================
// NAVIGATION MODE
// =====================================

navigationMode = "walk";

const walkBtn = document.getElementById("walk-btn");
const vehicleBtn = document.getElementById("vehicle-btn");

if (walkBtn && vehicleBtn) {
  walkBtn.addEventListener("click", () => {
    navigationMode = "walk";
    walkBtn.classList.add("active");
    vehicleBtn.classList.remove("active");

    console.log("Navigation Mode:", navigationMode);
  });

  vehicleBtn.addEventListener("click", () => {
    navigationMode = "vehicle";

    vehicleBtn.classList.add("active");
    walkBtn.classList.remove("active");

    console.log("Navigation Mode:", navigationMode);
  });
}

// =====================================================
// IMAGE LIGHTBOX MODAL LOGIC (WITH SWIPE TO DISMISS)
// =====================================================

const imageModal = document.getElementById("imageModal");
const enlargedImage = document.getElementById("enlargedImage");
const closeImageModal = document.getElementById("closeImageModal");

if (imageModal && enlargedImage && closeImageModal) {
  document.addEventListener("click", (e) => {
    if (
      e.target.classList.contains("info-card-img") ||
      e.target.classList.contains("mini-popup-img")
    ) {
      e.stopPropagation();
      enlargedImage.src = e.target.src;
      imageModal.classList.add("show");
    }
  });

  const closeModal = () => {
    imageModal.classList.remove("show");
    enlargedImage.style.transform = "";

    setTimeout(() => {
      enlargedImage.src = "";
    }, 300);
  };

  closeImageModal.addEventListener("click", closeModal);

  imageModal.addEventListener("click", (e) => {
    if (e.target === imageModal) closeModal();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && imageModal.classList.contains("show"))
      closeModal();
  });

  let touchStartY = 0;
  let touchEndY = 0;

  imageModal.addEventListener(
    "touchstart",
    (e) => {
      touchStartY = e.changedTouches[0].screenY;
      enlargedImage.style.transition = "none";
    },
    { passive: true },
  );

  imageModal.addEventListener(
    "touchmove",
    (e) => {
      const currentY = e.changedTouches[0].screenY;
      const deltaY = currentY - touchStartY;

      if (deltaY > 0) {
        enlargedImage.style.transform = `translateY(${deltaY}px) scale(0.95)`;
        imageModal.style.opacity = 1 - deltaY / 500;
      }
    },
    { passive: true },
  );

  imageModal.addEventListener(
    "touchend",
    (e) => {
      touchEndY = e.changedTouches[0].screenY;

      enlargedImage.style.transition = "transform 0.3s ease";
      imageModal.style.transition = "opacity 0.3s ease";

      if (touchEndY - touchStartY > 100) {
        closeModal();
        setTimeout(() => {
          imageModal.style.opacity = "";
        }, 300);
      } else {
        enlargedImage.style.transform = "scale(1)";
        imageModal.style.opacity = "";
      }
    },
    { passive: true },
  );
}
