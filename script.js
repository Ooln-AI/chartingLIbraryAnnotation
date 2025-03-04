// Utility function to get URL parameters (unchanged)
function getParameterByName(name) {
  name = name.replace(/[\[]/, "\\[").replace(/[\]]/, "\\]");
  var regex = new RegExp("[\\?&]" + name + "=([^&#]*)"),
    results = regex.exec(location.search);
  return results === null ? "" : decodeURIComponent(results[1].replace(/\+/g, " "));
}

// Custom datafeed class using Polygon.io and CSV annotations
class PolygonDatafeedWithMarks {
  constructor(apiKey, csvFilename = "sampleCSV.csv") {
    this.apiKey = apiKey;
    this.baseUrl = "https://api.polygon.io/v2/aggs";
    this.marks = [];
    this.csvFilename = csvFilename;
    this.loadCSVData(); // Start loading CSV data asynchronously
    this.ws = null; // WebSocket for real-time updates
  }

  // Load and parse CSV data for annotations
  async loadCSVData() {
    try {
      const response = await fetch(`${this.csvFilename}?v=${new Date().getTime()}`);
      const text = await response.text();
      const rows = text.split("\n");
      this.marks = rows
        .slice(1)
        .map((row) => {
          const values = row.split(",");
          return this.convertRowToMark({
            Date: values[0],
            Time: values[1],
            Ticker: values[2],
            Expiry: values[3],
            Strike: values[4],
            Instrument: values[5],
            Quantity: values[6],
            Net_proceeds: values[7],
            Symbol: values[8],
            DateTime: values[9] + " " + values[10], // Combine Date and Time
            Proceeds: values[11],
            Comm_fee: values[12],
          });
        })
        .filter((obj) => obj !== null);
      console.log("CSV data loaded and marks updated.");
      console.log("The marks are:", this.marks);
    } catch (error) {
      console.error("Error loading CSV:", error);
    }
  }

  // Convert date string to Unix timestamp (in seconds)
  toUnixTimestamp(dateString) {
    const cleanedString = dateString.replace(/['"]/g, "").trim();
    const isoString = cleanedString.replace("  ", "T") + "Z"; // Convert to ISO 8601 (UTC)
    const date = new Date(isoString);
    if (isNaN(date.getTime())) {
      console.error("Invalid date string:", dateString);
      return null;
    }
    return Math.floor(date.getTime() / 1000);
  }

  // Convert CSV row to TradingView mark object
  convertRowToMark(row) {
    const time = this.toUnixTimestamp(row.DateTime);
    if (!time) return null; // Skip invalid dates
    const quantity = parseInt(row.Quantity);
    const isSell = quantity < 0;
    const label = isSell ? "S" : "B";
    const color = isSell
      ? { border: "#FF0000", background: "#FF0000" }
      : { border: "#008000", background: "#008000" };
    const tooltip = `Time: ${row.Time}\nTicker: ${row.Ticker}\nExpiry: ${row.Expiry}\nStrike: ${row.Strike}\nInstrument: ${row.Instrument}\nQuantity: ${row.Quantity}\nNet Proceeds: ${row.Net_proceeds}\nSymbol: ${row.Symbol}\nProceeds: ${row.Proceeds}\nComm Fee: ${row.Comm_fee}`;
    return {
      id: row.DateTime,
      time: time,
      color: color,
      text: tooltip,
      label: label,
      labelFontColor: "#FFFFFF",
      minSize: 2,
      tooltip: tooltip,
    };
  }

  // Provide configuration data to TradingView
  onReady(callback) {
    setTimeout(() => {
      callback({
        supports_search: true,
        supports_marks: true,
        supports_timescale_marks: true,
        supports_time: true,
        supported_resolutions: ["D", "2D", "3D", "W", "3W", "M", "6M", "1Y"],
        exchanges: [
          { value: "", name: "All Exchanges", desc: "" },
          { value: "NasdaqNM", name: "NasdaqNM", desc: "NasdaqNM" },
          { value: "NYSE", name: "NYSE", desc: "NYSE" },
        ],
        symbols_types: [
          { name: "All types", value: "" },
          { name: "Stock", value: "stock" },
          { name: "Index", value: "index" },
        ],
      });
    }, 0);
  }

  // Resolve symbol information
  resolveSymbol(symbolName, onSymbolResolvedCallback, onResolveErrorCallback) {
    const symbolInfo = {
      name: symbolName,
      ticker: symbolName,
      description: `${symbolName} Stock`,
      type: "stock",
      session: "24x7", // 24/7 trading
      timezone: "America/New_York",
      minmov: 1,
      exchange: "NYSE",
      pricescale: 100,
      has_intraday: true,
      has_daily: true,
      supported_resolutions: ["1D", "2D", "3D", "W", "3W", "M", "6M"],
    };
    setTimeout(() => {
      if (symbolInfo) {
        onSymbolResolvedCallback(symbolInfo);
      } else {
        onResolveErrorCallback("Symbol not found");
      }
    }, 0);
  }

  // Map TradingView resolution to Polygon.io multiplier and timespan
  getMultiplierAndTimespan(resolution) {
    console.log("Mapping resolution:", resolution); // Debug log
    const resolutionMap = {
      "1D": { multiplier: 1, timespan: "day" },
      "2D": { multiplier: 2, timespan: "day" },
      "3D": { multiplier: 3, timespan: "day" },
      "W": { multiplier: 1, timespan: "week" },
      "3W": { multiplier: 3, timespan: "week" },
      "M": { multiplier: 1, timespan: "month" },
      "6M": { multiplier: 6, timespan: "month" },
    };

    const mapped = resolutionMap[resolution];
    if (!mapped) {
      console.warn(`Unsupported resolution: ${resolution}, defaulting to 1 day`);
      return { multiplier: 1, timespan: "day" }; // Fallback to 1 day
    }
    console.log("Mapped to:", mapped); // Debug log
    return mapped;
  }

  // Fetch historical bars from Polygon.io
  async getBars(symbolInfo, resolution, periodParams, onHistoryCallback, onErrorCallback) {
    try {
      const { multiplier, timespan } = this.getMultiplierAndTimespan(resolution);
      const from = periodParams.from * 1000; // Convert to milliseconds
      const to = periodParams.to * 1000; // Convert to milliseconds
      const url = `${this.baseUrl}/ticker/${symbolInfo.ticker}/range/${multiplier}/${timespan}/${from}/${to}?apiKey=${this.apiKey}`;
      console.log("Fetching bars from:", url);
      const response = await fetch(url);
      const data = await response.json();
      console.log("The data is:", data);
      if (data.status !== "OK") {
        onHistoryCallback([], { noData: true });
        return;
      }
      const bars = data.results.map((bar) => ({
        time: bar.t, // Already in milliseconds
        open: bar.o,
        high: bar.h,
        low: bar.l,
        close: bar.c,
        volume: bar.v,
      }));
      onHistoryCallback(bars, { noData: bars.length === 0 });
    } catch (error) {
      onErrorCallback(error);
    }
  }

  // Subscribe to real-time updates via Polygon.io WebSocket
  subscribeBars(symbolInfo, resolution, onRealtimeCallback, subscriberUID, onResetCacheNeededCallback) {
    if (this.ws) this.ws.close();
    this.ws = new WebSocket("wss://socket.polygon.io/stocks");
    this.ws.onopen = () => {
      // Authenticate
      this.ws.send(JSON.stringify({ action: "auth", params: this.apiKey }));
      // Subscribe to trades
      this.ws.send(JSON.stringify({ action: "subscribe", params: `T.${symbolInfo.ticker}` }));
    };
    this.ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      data.forEach((msg) => {
        if (msg.ev === "T") {
          const bar = {
            time: msg.t, // Timestamp in milliseconds
            close: msg.p,
            open: msg.p, // Simplified: use trade price for all OHLC
            high: msg.p,
            low: msg.p,
            volume: msg.s,
          };
          onRealtimeCallback(bar);
        }
      });
    };
  }

  // Unsubscribe from real-time updates
  unsubscribeBars(subscriberUID) {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  // Provide marks from CSV data
  getMarks(symbolInfo, from, to, onDataCallback, resolution) {
    const filteredMarks = this.marks.filter((mark) => mark.time >= from && mark.time <= to);
    onDataCallback(filteredMarks);
  }
}

// Initialize the TradingView chart
function initOnReady() {
  const polygonApiKey = "QvGcdMaS2M8ZJv3PNPLyMKFYbMXkHpyL"; // Replace with your Polygon.io API key
  var widget = (window.tvWidget = new TradingView.widget({
    fullscreen: true,
    symbol: "AAPL",
    interval: "1D",
    container: "tv_chart_container",
    datafeed: new PolygonDatafeedWithMarks(polygonApiKey),
    library_path: "charting_library/",
    locale: getParameterByName("lang") || "en",
    disabled_features: ["use_localstorage_for_settings"],
    enabled_features: ["study_templates", "two_character_bar_marks_labels"],
    // charts_storage_url: "https://saveload.tradingview.com",
    charts_storage_api_version: "1.1",
    client_id: "tradingview.com",
    user_id: "public_user_id",
    theme: getParameterByName("theme"),
  }));

  // Optional: Add a manual annotation when the chart is ready
  widget.onChartReady(function () {
    console.log("Chart is ready!");
    const chart = widget.chart();
    chart.createShape(
      {
        time: 1521475200, // Example timestamp
        price: 160, // Example price
      },
      {
        shape: "text",
        text: "Hello World",
        lock: true,
        color: "blue",
        fontsize: 16,
        tooltip: "💡 This is an important level!\nAAPL at $150",
        overrides: { position: "abovebar" },
      }
    );
    console.log("Manual annotation added!");
  });
}

window.addEventListener("DOMContentLoaded", initOnReady, false);