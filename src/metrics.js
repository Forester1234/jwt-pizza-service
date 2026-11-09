const os = require("os");
const config = require("./config.js");

// Counters ================

// HTTP requests
const httpRequestCounts = {
  GET: 0,
  POST: 0,
  PUT: 0,
  DELETE: 0,
};

// Active users
const activeUsers = new Set();

// Authentication
let successfulLogins = 0;
let failedLogins = 0;

// Pizza purchases
let successfulPurchases = 0;
let failedPurchases = 0;
let totalRevenue = 0;

// Request latency
let totalRequestLatency = 0;
let completedRequests = 0;
let totalPizzaLatency = 0;

// Metric Sender ================

function sendMetricToGrafana(metricName, metricValue, type, unit) {
  const metric = {
    resourceMetrics: [
      {
        resource: {
          attributes: [
            {
              key: "source",
              value: {
                stringValue: config.metrics.source,
              },
            },
          ],
        },
        scopeMetrics: [
          {
            metrics: [
              {
                name: metricName,
                unit: unit,
                [type]: {
                  dataPoints: [
                    {
                      asDouble: Number(metricValue),
                      timeUnixNano: (BigInt(Date.now()) * 1000000n).toString(),
                    },
                  ],
                },
              },
            ],
          },
        ],
      },
    ],
  };

  if (type === "sum") {
    metric.resourceMetrics[0].scopeMetrics[0].metrics[0][
      type
    ].aggregationTemporality = "AGGREGATION_TEMPORALITY_CUMULATIVE";

    metric.resourceMetrics[0].scopeMetrics[0].metrics[0][type].isMonotonic =
      true;
  }

  const body = JSON.stringify(metric);

  return fetch(config.metrics.endpointUrl, {
    method: "POST",
    body: body,
    headers: {
      Authorization: `Bearer ${config.metrics.accountId}:${config.metrics.apiKey}`,
      "Content-Type": "application/json",
    },
  });
}

// HTTP Requests ================

function requestTracker(req, res, next) {
  const startTime = Date.now();

  if (httpRequestCounts[req.method] !== undefined) {
    httpRequestCounts[req.method]++;
  }

  res.on("finish", () => {
    const latency = Date.now() - startTime;

    totalRequestLatency += latency;
    completedRequests++;
  });

  next();
}

async function sendHttpMetrics() {
  const results = await Promise.all([
    sendMetricToGrafana(
      "http_requests_total",
      Object.values(httpRequestCounts).reduce(
        (total, count) => total + count,
        0,
      ),
      "sum",
      "{request}",
    ),
    ...Object.entries(httpRequestCounts).map(([method, count]) =>
      sendMetricToGrafana(
        `http_requests_${method.toLowerCase()}_total`,
        count,
        "sum",
        "{request}",
      ),
    ),
  ]);

  for (const result of results) {
    if (!result.ok) {
      console.error("Failed to send HTTP metrics:", await result.text());
    }
  }
}

// Active Users ================

function trackActiveUser(userId) {
  if (userId) {
    activeUsers.add(userId);
  }
}

async function sendUserMetrics() {
  const count = activeUsers.size;

  activeUsers.clear();

  const result = await sendMetricToGrafana(
    "active_users",
    count,
    "gauge",
    "{user}",
  );

  if (!result.ok) {
    console.error("Failed to send active user metrics:", await result.text());
  }
}

// Authentication Attempts ================

function authAttempt(success) {
  if (success) {
    successfulLogins++;
  } else {
    failedLogins++;
  }
}

async function sendAuthMetrics() {
  const results = await Promise.all([
    sendMetricToGrafana(
      "auth_successful_total",
      successfulLogins,
      "sum",
      "{attempt}",
    ),
    sendMetricToGrafana("auth_failed_total", failedLogins, "sum", "{attempt}"),
  ]);

  for (const result of results) {
    if (!result.ok) {
      console.error(
        "Failed to send authentication metrics:",
        await result.text(),
      );
    }
  }
}

// CPU and Memory Use ================

function getCpuUsagePercentage() {
  const cpuUsage = os.loadavg()[0] / os.cpus().length;
  return cpuUsage.toFixed(2) * 100;
}

function getMemoryUsagePercentage() {
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const usedMemory = totalMemory - freeMemory;
  const memoryUsage = (usedMemory / totalMemory) * 100;
  return memoryUsage.toFixed(2);
}

async function sendSystemMetrics() {
  const cpu = getCpuUsagePercentage();
  const memory = getMemoryUsagePercentage();

  const results = await Promise.all([
    sendMetricToGrafana("cpu_usage", cpu, "gauge", "%"),
    sendMetricToGrafana("memory_usage", memory, "gauge", "%"),
  ]);

  for (const result of results) {
    if (!result.ok) {
      console.error("Failed to send metrics:", await result.text());
    } else {
      console.log("Successfully sent metrics to Grafana:", result.status);
    }
  }
}

// Pizza Metrics ================

let pizzaLatencyCount = 0;

function pizzaPurchase(success, latency, price) {
  totalPizzaLatency += latency;
  pizzaLatencyCount++;

  if (success) {
    successfulPurchases++;
    totalRevenue += Number(price);
  } else {
    failedPurchases++;
  }
}

async function sendPurchaseMetrics() {
  const averagePizzaLatency =
    pizzaLatencyCount > 0 ? totalPizzaLatency / pizzaLatencyCount : 0;
  const results = await Promise.all([
    sendMetricToGrafana(
      "pizza_sold_total",
      successfulPurchases,
      "sum",
      "{purchase}",
    ),
    sendMetricToGrafana(
      "pizza_creation_failed_total",
      failedPurchases,
      "sum",
      "{purchase}",
    ),
    sendMetricToGrafana("pizza_revenue_total", totalRevenue, "sum", "USD"),
    sendMetricToGrafana(
      "pizza_creation_latency_ms",
      averagePizzaLatency,
      "gauge",
      "ms",
    ),
  ]);

  for (const result of results) {
    if (!result.ok) {
      console.error("Failed to send purchase metrics:", await result.text());
    }
  }

  // Reset interval latency calculations
  totalPizzaLatency = 0;
  pizzaLatencyCount = 0;
}

// Latency Metrics ================

async function sendRequestLatencyMetrics() {
  const averageLatency =
    completedRequests > 0 ? totalRequestLatency / completedRequests : 0;

  const results = await Promise.all([
    sendMetricToGrafana(
      "http_request_latency_ms",
      averageLatency,
      "gauge",
      "ms",
    ),
  ]);

  for (const result of results) {
    if (!result.ok) {
      console.error("Failed to send latency metrics:", await result.text());
    }
  }

  totalRequestLatency = 0;
  completedRequests = 0;
}

// Periodic Metric Collection ================

function sendMetricsPeriodically(period) {
  const timer = setInterval(() => {
    Promise.all([
      sendHttpMetrics(),
      sendUserMetrics(),
      sendAuthMetrics(),
      sendSystemMetrics(),
      sendPurchaseMetrics(),
      sendRequestLatencyMetrics(),
    ]).catch((error) => {
      console.error("Error sending metrics:", error);
    });
  }, period);

  return timer;
}

// Exports ================

module.exports = {
  // HTTP
  requestTracker,
  sendHttpMetrics,

  // Active users
  trackActiveUser,

  // Authentication
  authAttempt,
  sendAuthMetrics,

  // System
  getCpuUsagePercentage,
  getMemoryUsagePercentage,
  sendSystemMetrics,

  // Pizza
  pizzaPurchase,
  sendPurchaseMetrics,

  // Latency
  sendRequestLatencyMetrics,

  // Grafana
  sendMetricToGrafana,
  sendMetricsPeriodically,
};
