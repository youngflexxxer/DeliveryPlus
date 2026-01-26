// Data storage
let allOrders = [];
let processedOrders = new Set();
let takenOrders = new Set();
let orderHistory = new Map(); // Store all orders we've seen
let takenByOthers = new Set(); // Orders taken by other couriers
let autoRefreshIntervalId = null;
let autoRefreshActive = false;
let currentLat = null;
let currentLng = null;

let endpointUrl = "https://robot.dostavista.ru/api/courier/2.75/";

// Load taken orders from localStorage
function loadTakenOrders() {
  const stored = localStorage.getItem("takenOrders");
  if (stored) {
    takenOrders = new Set(JSON.parse(stored));
  }
}

// Load processed orders from localStorage
function loadProcessedOrders() {
  const stored = localStorage.getItem("processedOrders");
  if (stored) {
    processedOrders = new Set(JSON.parse(stored));
  }
}

// Save processed orders to localStorage
function saveProcessedOrders() {
  localStorage.setItem("processedOrders", JSON.stringify([...processedOrders]));
}

// Load order history from localStorage
function loadOrderHistory() {
  const stored = localStorage.getItem("orderHistory");
  if (stored) {
    const parsed = JSON.parse(stored);
    orderHistory = new Map(parsed);
  }
}

// Save order history to localStorage
function saveOrderHistory() {
  localStorage.setItem("orderHistory", JSON.stringify([...orderHistory]));
}

// Load taken by others from localStorage
function loadTakenByOthers() {
  const stored = localStorage.getItem("takenByOthers");
  if (stored) {
    takenByOthers = new Set(JSON.parse(stored));
  }
}

// Save taken by others to localStorage
function saveTakenByOthers() {
  localStorage.setItem("takenByOthers", JSON.stringify([...takenByOthers]));
}

// Clear order data
function clearOrderData() {
  allOrders = [];
  processedOrders.clear();
  orderHistory.clear();
  takenByOthers.clear();

  // Save cleared state
  saveProcessedOrders();
  saveOrderHistory();
  saveTakenByOthers();

  // Re-render to show empty state
  renderOrders();

  showToast("Данные заказов очищены", "info");
}

// Play sound notification
function playNotificationSound() {
  if (!document.getElementById("soundEnabled").checked) return;

  // Create audio context for better browser compatibility
  const audioContext = new (window.AudioContext || window.webkitAudioContext)();

  // Create a simple beep sound
  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();

  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);

  oscillator.frequency.value = 800; // Frequency in Hz
  oscillator.type = "sine";

  gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(
    0.01,
    audioContext.currentTime + 0.5,
  );

  oscillator.start(audioContext.currentTime);
  oscillator.stop(audioContext.currentTime + 0.5);
}

// Load settings and filters from localStorage
function loadSettings() {
  const settings = localStorage.getItem("appSettings");
  if (settings) {
    const parsed = JSON.parse(settings);

    // Load API settings
    if (parsed.sessionToken)
      document.getElementById("sessionToken").value = parsed.sessionToken;
    if (parsed.userAgent)
      document.getElementById("userAgent").value = parsed.userAgent;
    if (parsed.autoRefreshInterval)
      document.getElementById("settingsAutoRefreshInterval").value =
        parsed.autoRefreshInterval;

    // Load filters
    if (parsed.minPayment !== undefined)
      document.getElementById("minPayment").value = parsed.minPayment;
    if (parsed.maxWeight !== undefined)
      document.getElementById("maxWeight").value = parsed.maxWeight;
    if (parsed.maxPoints !== undefined)
      document.getElementById("maxPoints").value = parsed.maxPoints;
    if (parsed.maxDistance !== undefined)
      document.getElementById("maxDistance").value = parsed.maxDistance;
    if (parsed.filterDate)
      document.getElementById("filterDate").value = parsed.filterDate;

    // Load vehicle types
    if (parsed.vehicleTypes) {
      document.querySelectorAll(".vehicle-checkbox").forEach((checkbox) => {
        checkbox.checked = parsed.vehicleTypes.includes(
          parseInt(checkbox.value),
        );
      });
      updateVehicleLabel();
    }

    // Load sort option
    if (parsed.sortValue && parsed.sortLabel) {
      window.currentSortValue = parsed.sortValue;
      document.getElementById("sortLabel").textContent = parsed.sortLabel;
      document.querySelectorAll(".sort-item").forEach((item) => {
        item.classList.remove("active");
        if (item.textContent.trim() === parsed.sortLabel) {
          item.classList.add("active");
        }
      });
    }

    // Load sound notification setting
    if (parsed.soundEnabled !== undefined) {
      document.getElementById("soundEnabled").checked = parsed.soundEnabled;
    }

    // Load show taken orders setting
    if (parsed.showTakenOrders !== undefined) {
      document.getElementById("showTakenOrders").checked =
        parsed.showTakenOrders;
    }

    // Load auto-refresh state
    if (parsed.autoRefreshActive !== undefined) {
      autoRefreshActive = parsed.autoRefreshActive;
      const btn = document.getElementById("autoRefreshBtn");
      if (autoRefreshActive) {
        btn.textContent = "⏹️ Стоп";
        btn.classList.add("btn-danger");
        btn.classList.remove("btn-primary");
      }
    }
  }
}

// Save settings and filters to localStorage
function saveSettings() {
  const settings = {
    // API settings
    sessionToken: document.getElementById("sessionToken").value,
    userAgent: document.getElementById("userAgent").value,
    autoRefreshInterval: document.getElementById("settingsAutoRefreshInterval")
      .value,

    // Filters
    minPayment: document.getElementById("minPayment").value,
    maxWeight: document.getElementById("maxWeight").value,
    maxPoints: document.getElementById("maxPoints").value,
    maxDistance: document.getElementById("maxDistance").value,
    filterDate: document.getElementById("filterDate").value,

    // Vehicle types
    vehicleTypes: getSelectedVehicleTypes(),

    // Sort option
    sortValue: window.currentSortValue || "newest",
    sortLabel: document.getElementById("sortLabel").textContent,

    // Sound notification
    soundEnabled: document.getElementById("soundEnabled").checked,

    // Show taken orders
    showTakenOrders: document.getElementById("showTakenOrders").checked,

    // Auto-refresh state
    autoRefreshActive: autoRefreshActive,
  };

  localStorage.setItem("appSettings", JSON.stringify(settings));
}

// Save taken orders to localStorage
function saveTakenOrders() {
  localStorage.setItem("takenOrders", JSON.stringify([...takenOrders]));
}

// Show/hide loader
function setLoading(isLoading) {
  const loader = document.getElementById("loader");
  if (isLoading) {
    loader.classList.add("active");
  } else {
    loader.classList.remove("active");
  }
}

// Update API status
function updateApiStatus(message, isError = false) {
  const statusEl = document.getElementById("apiStatus");
  statusEl.textContent = message;
  statusEl.style.color = isError ? "#f44336" : "#4CAF50";
  statusEl.style.background = isError ? "#ffebee" : "#e8f5e9";
}

// Parse weight from label
function parseWeightKg(label) {
  if (!label) return 0;
  const match = label.match(/([0-9]+[.,]?[0-9]*)/);
  if (!match) return 0;
  const num = match[1].replace(",", ".");
  return parseFloat(num) || 0;
}

// Format date
function formatDate(dateStr) {
  const date = new Date(dateStr);
  const now = new Date();

  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString("ru-RU", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  return (
    date.toLocaleDateString("ru-RU", { month: "2-digit", day: "2-digit" }) +
    " " +
    date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })
  );
}

// Get vehicle type name
function getVehicleType(vehicleTypeId) {
  const types = {
    1: "джип/пикап",
    2: "каблук",
    3: "портер",
    4: "газель",
    5: "грузовой",
    7: "авто",
  };
  return types[vehicleTypeId] || "unknown";
}

// Calculate price per km
function calculatePricePerKm(payment, order) {
  if (!order || !order.points || order.points.length === 0) return 0;

  // Sum all distances including the distance to the first point
  let totalDistance = 0;
  // Add distance to first point
  if (order.points[0]) {
    totalDistance += (order.points[0].courier_distance_m || 0) / 1000;
  }
  // Add distances between all other points
  for (let i = 1; i < order.points.length; i++) {
    const point = order.points[i];
    totalDistance += (point.previous_point_distance_m || 0) / 1000;
  }

  if (totalDistance === 0) return 0;
  return payment / totalDistance;
}

// Clear date filter
function clearDateFilter() {
  document.getElementById("filterDate").value = "";
  saveSettings();
  renderOrders();
}

// Get selected vehicle types
function getSelectedVehicleTypes() {
  const checkboxes = document.querySelectorAll(".vehicle-checkbox:checked");
  return Array.from(checkboxes).map((cb) => parseInt(cb.value));
}

// Toggle dropdown menu
function toggleDropdown(event) {
  event.preventDefault();
  const button = event.currentTarget;
  const menu = document.getElementById("dropdownMenu");
  button.classList.toggle("active");
  menu.classList.toggle("active");
}

// Toggle sort dropdown menu
function toggleSortDropdown(event) {
  event.preventDefault();
  const button = event.currentTarget;
  const menu = document.getElementById("sortDropdownMenu");
  button.classList.toggle("active");
  menu.classList.toggle("active");
}

// Select sort option
function selectSort(value, label) {
  document.getElementById("sortLabel").textContent = label;
  document.getElementById("sortDropdownMenu").classList.remove("active");
  document
    .getElementById("sortDropdown")
    .querySelector(".dropdown-button")
    .classList.remove("active");

  // Update active state for sort items
  document.querySelectorAll(".sort-item").forEach((item) => {
    item.classList.remove("active");
    if (item.textContent.trim() === label) {
      item.classList.add("active");
    }
  });

  // Store the selected sort value and render
  window.currentSortValue = value;
  saveSettings();
  renderOrders();
}

// Toggle checkbox when clicking checkbox-item
function toggleCheckbox(element) {
  const checkbox = element.querySelector(".vehicle-checkbox");
  if (checkbox) {
    checkbox.checked = !checkbox.checked;
    vehicleCheckboxChanged();
  }
}

// Handle vehicle checkbox change
function vehicleCheckboxChanged() {
  updateVehicleLabel();
  saveSettings();
  renderOrders();
}

// Update vehicle dropdown label
function updateVehicleLabel() {
  const selected = getSelectedVehicleTypes();
  const label = document.getElementById("vehicleLabel");
  const total = document.querySelectorAll(".vehicle-checkbox").length;

  if (selected.length === 0) {
    label.textContent = "Не выбрано";
  } else if (selected.length === total) {
    label.textContent = "Все типы";
  } else {
    label.textContent = `${selected.length} выбрано`;
  }
}

// Filter orders
function getFilteredOrders() {
  const minPayment =
    parseFloat(document.getElementById("minPayment").value) || 0;
  const maxWeight =
    parseFloat(document.getElementById("maxWeight").value) || Infinity;
  const maxPoints =
    parseInt(document.getElementById("maxPoints").value) || Infinity;
  const maxDistance =
    parseFloat(document.getElementById("maxDistance").value) || Infinity;
  const minPricePerKm =
    parseFloat(document.getElementById("minPricePerKm").value) || 0;
  const selectedTypes = getSelectedVehicleTypes();
  const sortBy = window.currentSortValue || "newest";
  const filterDate = document.getElementById("filterDate").value;

  // Combine current orders with historical orders if setting is enabled
  let ordersToFilter = [...allOrders];
  if (document.getElementById("showTakenOrders").checked) {
    // Add orders taken by others that are not in current API response
    orderHistory.forEach((historicalOrder, orderId) => {
      if (
        takenByOthers.has(orderId) &&
        !allOrders.some((o) => o.order_id === orderId)
      ) {
        ordersToFilter.push({
          ...historicalOrder,
          _takenByOthers: true,
        });
      }
    });
  }

  const filtered = ordersToFilter.filter((order) => {
    const payment = parseFloat(order.list_currency) || 0;
    const weight = parseWeightKg(order.total_weight_label);
    const firstPointDistance = order.points[0]
      ? order.points[0].courier_distance_m / 1000
      : 0;
    order.PricePerKm = calculatePricePerKm(payment, order);

    // Check date filter
    let dateMatch = true;
    if (filterDate && order.points[0]) {
      const pointDateTime = order.points[0].courier_start_datetime;
      if (pointDateTime) {
        // Parse the datetime - handle ISO format like "2025-11-02T16:00:00+03:00"
        // Extract just the date part (YYYY-MM-DD)
        const dateStr = pointDateTime.split("T")[0];
        dateMatch = dateStr === filterDate;
      }
    }

    return (
      payment >= minPayment &&
      weight <= maxWeight &&
      order.points.length <= maxPoints &&
      firstPointDistance <= maxDistance &&
      order.PricePerKm >= minPricePerKm &&
      selectedTypes.includes(order.vehicle_type_id) &&
      dateMatch
    );
  });

  // Sort filtered orders
  return filtered.sort((a, b) => {
    switch (sortBy) {
      case "price-desc":
        return (
          (parseFloat(b.list_currency) || 0) -
          (parseFloat(a.list_currency) || 0)
        );
      case "distance-asc":
        const distA = a.points[0]
          ? a.points[0].courier_distance_m / 1000
          : Infinity;
        const distB = b.points[0]
          ? b.points[0].courier_distance_m / 1000
          : Infinity;
        return distA - distB;
      case "price-per-km-desc":
        return (b._cachedPricePerKm || 0) - (a._cachedPricePerKm || 0);
      default: // newest
        // Prioritize unprocessed orders first, but don't move taken orders to bottom
        const aIsNew = !processedOrders.has(a.order_id);
        const bIsNew = !processedOrders.has(b.order_id);
        const aIsTaken =
          takenOrders.has(a.order_id) || takenByOthers.has(a.order_id);
        const bIsTaken =
          takenOrders.has(b.order_id) || takenByOthers.has(b.order_id);

        // If both are taken or both are not taken, prioritize new ones
        if ((aIsTaken && bIsTaken) || (!aIsTaken && !bIsTaken)) {
          if (aIsNew && !bIsNew) return -1; // a is new, put it first
          if (!aIsNew && bIsNew) return 1; // b is new, put it first
        }

        return 0; // keep original order
    }
  });
}

// Render orders
function renderOrders() {
  const ordersContainer = document.getElementById("orders");
  const filtered = getFilteredOrders();

  // Update counter
  document.getElementById("orderCounterText").textContent =
    `${filtered.length}/${allOrders.length}`;

  if (filtered.length === 0) {
    ordersContainer.innerHTML = `
			<div class="empty-state">
				<div class="empty-state-icon">📭</div>
				<h2>No matching orders</h2>
				<p>Try adjusting your filters</p>
			</div>
		`;
    return;
  }

  ordersContainer.innerHTML = filtered
    .map((order) => {
      const payment = parseFloat(order.list_currency) || 0;
      const isTaken = takenOrders.has(order.order_id);

      const isTakenByOthers =
        order._takenByOthers || takenByOthers.has(order.order_id);

      return `
			<div class="order ${isTaken ? "taken" : ""} ${isTakenByOthers ? "taken-by-others" : ""}">
				<div class="order-header">
					<span class="order-id">#${order.order_id}</span>
					<span class="order-payment">${payment} ₽</span>
					${isTaken ? '<span class="order-status">ВЗЯТ</span>' : ""}
					${isTakenByOthers ? '<span class="order-status taken-by-others-status">ВЗЯТ ДРУГИМ</span>' : ""}
				</div>

				<div class="order-info">
					<div class="info-item">
						<span class="info-label">Требуется</span>
						<span class="info-value">${getVehicleType(order.vehicle_type_id)}</span>
					</div>
					<div class="info-item">
						<span class="info-label">Вес</span>
						<span class="info-value">${order.total_weight_label}</span>
					</div>
					<div class="info-item">
						<span class="info-label">Груз</span>
						<span class="info-value">${order.matter || "Нет информации"}</span>
					</div>
					<div class="info-item">
						<span class="info-label">Цена за км</span>
						<span class="info-value">${Math.round(order.PricePerKm)} ₽/км</span>
					</div>
				</div>

				<div class="points">
					${order.points
            .map((point, idx) => {
              const startTime = formatDate(point.courier_start_datetime);
              const finishTime = formatDate(point.courier_finish_datetime);
              const firstPointDistance = order.points[0]
                ? (order.points[0].courier_distance_m / 1000).toFixed(2)
                : "0";
              const distance =
                idx === 0
                  ? firstPointDistance
                  : (point.previous_point_distance_m / 1000).toFixed(2);
              let stationName = point.subway_station_name || "Нет станции";
              if (
                point.subway_station_type === "subway" &&
                stationName &&
                !stationName.startsWith("м. ")
              ) {
                stationName = `м. ${stationName}`;
              }

              return `
							<div class="point">
								<span class="point-number">${idx + 1}.</span>
								<span class="point-address">${point.address} (${distance} км)</span>
								<div class="point-meta">
									<span>${stationName}</span>
									<span>${startTime} - ${finishTime}</span>
								</div>
							</div>
						`;
            })
            .join("")}
				</div>

				<div class="order-actions">
					<button class="btn-primary" ${isTakenByOthers ? 'disabled style="opacity: 0.5; cursor: not-allowed;"' : ""} onclick="toggleTaken(${order.order_id})">
						${isTaken ? "✓ Mark as Available" : isTakenByOthers ? "Недоступен" : "Взять заказ"}
					</button>
					<button class="btn-secondary" onclick="copyOrderDetails(${order.order_id})">Скопировать информацию</button>
				</div>
			</div>
		`;
    })
    .join("");
}

// Toggle taken status
function toggleTaken(orderId) {
  // Don't allow taking orders that are taken by others
  if (takenByOthers.has(orderId)) {
    showToast("Этот заказ уже взят другим курьером", "error");
    return;
  }

  // Try to take order via API
  takeOrderViaApi(orderId);
  renderOrders();
}

// Copy order details
function copyOrderDetails(orderId) {
  const order = allOrders.find((o) => o.order_id === orderId);
  if (!order) return;

  const text = `Order #${order.order_id}
Payment: ₽${Math.round(parseFloat(order.list_currency))}
Vehicle: ${getVehicleType(order.vehicle_type_id)}
Weight: ${order.total_weight_label}
Matter: ${order.matter || "N/A"}

Points:
${order.points.map((p, i) => `${i + 1}. ${p.address}`).join("\n")}`;

  navigator.clipboard.writeText(text).then(() => {
    showToast("Order details copied to clipboard", "success");
  });
}

// Show toast notification
function showToast(message, type = "info") {
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = "slideUp 0.3s reverse";
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// Get current user location (Promise-based)
function getLocationAsync() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve({ lat: "55.75168", lng: "37.61907" });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      function (position) {
        const lat = position.coords.latitude.toFixed(6);
        const lng = position.coords.longitude.toFixed(6);

        currentLat = parseFloat(lat);
        currentLng = parseFloat(lng);

        resolve({ lat, lng });
      },
      function (error) {
        // Fall back to default location
        resolve({ lat: "55.75168", lng: "37.61907" });
      },
      {
        enableHighAccuracy: false,
        timeout: 5000,
        maximumAge: 30000,
      },
    );
  });
}

// API Functions
function openApiModal() {
  document.getElementById("apiModal").style.display = "block";
}

function closeApiModal() {
  document.getElementById("apiModal").style.display = "none";
  saveSettings();
}

async function makeProxyRequest(endpoint, method = "GET", body = null) {
  const sessionToken = document.getElementById("sessionToken").value;
  const userAgent =
    document.getElementById("userAgent").value ||
    "ru-courier-app-main-android/2.115.0.3158";
  const baseAddress = window.location.origin;

  const proxyPayload = {
    endpoint: endpoint,
    method: method,
    body: body,
    session_token: sessionToken,
    user_agent: userAgent,
  };

  const response = await fetch(baseAddress + "/api/proxy", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(proxyPayload),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return await response.json();
}

async function toggleAutoRefresh() {
  const btn = document.getElementById("autoRefreshBtn");
  const interval = parseInt(
    document.getElementById("settingsAutoRefreshInterval").value,
  );

  if (!autoRefreshActive) {
    autoRefreshActive = true;
    btn.textContent = "⏹️ Стоп";
    btn.classList.add("btn-danger");
    btn.classList.remove("btn-primary");

    await loadFromApi();
    autoRefreshIntervalId = setInterval(loadFromApi, interval * 1000);
  } else {
    autoRefreshActive = false;
    clearInterval(autoRefreshIntervalId);
    autoRefreshIntervalId = null;
    btn.textContent = "▶️ Старт";
    btn.classList.remove("btn-danger");
    btn.classList.add("btn-primary");

    // Clear data when stopping auto-refresh
    clearOrderData();
  }

  // Save auto-refresh state
  saveSettings();
}

// Load from API
async function loadFromApi() {
  try {
    const url =
      endpointUrl +
      `available-mixed-list-compact?request_reason=manual_by_courier`;
    const data = await makeProxyRequest(url);

    if (data.is_successful && data.available_objects?.orders) {
      const newOrders = data.available_objects.orders;

      // Store all orders in history
      newOrders.forEach((order) => {
        orderHistory.set(order.order_id, order);
      });

      // Check which previously seen orders are no longer in API (taken by others)
      const currentOrderIds = new Set(newOrders.map((o) => o.order_id));
      orderHistory.forEach((order, orderId) => {
        if (
          !currentOrderIds.has(orderId) &&
          !takenOrders.has(orderId) &&
          !takenByOthers.has(orderId)
        ) {
          takenByOthers.add(orderId);
        }
      });

      // Check for new orders and play notification sound
      let hasNewOrders = false;
      const newOrderIds = [];

      newOrders.forEach((order) => {
        if (!processedOrders.has(order.order_id)) {
          hasNewOrders = true;
          newOrderIds.push(order.order_id);
        }
      });

      allOrders = newOrders;

      // Check if any new orders match current filters before playing sound
      if (hasNewOrders) {
        const filtered = getFilteredOrders();
        const newMatchingOrders = filtered.filter((order) =>
          newOrderIds.includes(order.order_id),
        );

        if (newMatchingOrders.length > 0) {
          playNotificationSound();
        }
      }

      renderOrders();

      // Save data
      saveOrderHistory();
      saveTakenByOthers();

      // Mark new orders as processed AFTER rendering
      if (newOrderIds.length > 0) {
        newOrderIds.forEach((orderId) => processedOrders.add(orderId));
        saveProcessedOrders();
      }
    }
  } catch (error) {
    console.error("Auto-refresh error:", error.message);
  }
}

async function takeOrderViaApi(orderId) {
  const endpoint = endpointUrl + "take-order";
  const latitude = "55.75168";
  const longitude = "37.61907";

  try {
    const body = {
      order_id: orderId,
      latitude: latitude,
      longitude: longitude,
    };

    const data = await makeProxyRequest(endpoint, "POST", body);

    if (data.is_successful) {
      showToast(`Заказ ${orderId} успешно взят`, "success");
    } else {
      showToast((`Не удалось взять заказ ${orderId}:`, data.errors), "error");
    }
  } catch (error) {
    console.log(`Could not submit order to API: ${error.message}`);
  }
}

// Initialize
function initializePage() {
  loadTakenOrders();
  loadProcessedOrders();
  loadOrderHistory();
  loadTakenByOthers();
  loadSettings();

  // Set default sort value if not loaded from settings
  if (!window.currentSortValue) {
    window.currentSortValue = "newest";
    // Mark first sort item as active
    document.querySelector(".sort-item").classList.add("active");
  }

  // Resume auto-refresh if it was active
  if (autoRefreshActive && !autoRefreshIntervalId) {
    const interval = parseInt(
      document.getElementById("settingsAutoRefreshInterval").value,
    );
    autoRefreshIntervalId = setInterval(loadFromApi, interval * 1000);
  }

  // Add event listeners for filter changes
  document.getElementById("minPayment").addEventListener("input", saveSettings);
  document.getElementById("maxWeight").addEventListener("input", saveSettings);
  document.getElementById("maxPoints").addEventListener("input", saveSettings);
  document
    .getElementById("maxDistance")
    .addEventListener("input", saveSettings);
  document
    .getElementById("filterDate")
    .addEventListener("change", saveSettings);
  document
    .getElementById("settingsAutoRefreshInterval")
    .addEventListener("input", saveSettings);
  document
    .getElementById("sessionToken")
    .addEventListener("input", saveSettings);
  document.getElementById("userAgent").addEventListener("input", saveSettings);
  document
    .getElementById("soundEnabled")
    .addEventListener("change", saveSettings);
  document.getElementById("showTakenOrders").addEventListener("change", () => {
    saveSettings();
    renderOrders(); // Re-render when setting changes
  });
}

initializePage();
renderOrders();
