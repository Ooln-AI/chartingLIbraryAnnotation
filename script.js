// Utility function to get URL parameters (unchanged)
function getParameterByName(name) {
  name = name.replace(/[\[]/, "\\[").replace(/[\]]/, "\\]");
  var regex = new RegExp("[\\?&]" + name + "=([^&#]*)"),
    results = regex.exec(location.search);
  return results === null ? "" : decodeURIComponent(results[1].replace(/\+/g, " "));
}

// Custom datafeed class using Polygon.io and CSV annotations
class PolygonDatafeedWithMarks {
  constructor(apiKey, csvFilename = "sampleCSV.csv") { // Default CSV filename
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
    const tooltip = `\"Time: ${row.Time}\", \"Ticker: ${row.Ticker}\", \"Expiry: ${row.Expiry}\", \"Strike: ${row.Strike}\", \"Instrument: ${row.Instrument}\", \"Quantity: ${row.Quantity}\", \"Net Proceeds: ${row.Net_proceeds}\", \"Symbol: ${row.Symbol}\", \"Proceeds: ${row.Proceeds}\", \"Comm Fee: ${row.Comm_fee}`;
    return {
      id: row.DateTime,
      ticker: row.Ticker.trim().toUpperCase(),
      time: time,
      color: color,
      text: tooltip,
      label: label,
      labelFontColor: "#FFFFFF",
      minSize: 2,
      tooltip: tooltip,
    };
  }

  // Search for symbols using Polygon.io API, called by TradingView
  async searchSymbols(userInput, exchange, symbolType, onResultReadyCallback) {
    try {
      // Validate user input
      if (!userInput || userInput.trim() === "") {
        onResultReadyCallback([]);
        return;
      }

      const apiKey = this.apiKey;
      const baseUrl = "https://api.polygon.io/v3/reference/tickers";

      // Prepare common query parameters
      let queryParams = `apiKey=${apiKey}&limit=50`;
      if (exchange) {
        queryParams += `&primary_exchange=${exchange}`;
      }
      if (symbolType) {
        queryParams += `&type=${symbolType}`;
      }

      // Search by ticker (convert to uppercase since tickers are typically uppercase)
      const tickerInput = userInput.toUpperCase();
      const tickerUrl = `${baseUrl}?ticker.gte=${tickerInput}&${queryParams}`;

      // Search by name (keep as-is for case sensitivity in names)
      const nameUrl = `${baseUrl}?name.gte=${userInput}&${queryParams}`;

      // Fetch both ticker and name results concurrently
      const [tickerResponse, nameResponse] = await Promise.all([
        fetch(tickerUrl),
        fetch(nameUrl),
      ]);

      const tickerData = await tickerResponse.json();
      const nameData = await nameResponse.json();

      const tickerResults = tickerData.results || [];
      const nameResults = nameData.results || [];

      // Combine results and remove duplicates based on ticker
      const allResults = [...tickerResults, ...nameResults];
      const uniqueResults = Array.from(new Set(allResults.map((item) => item.ticker)))
        .map((ticker) => allResults.find((item) => item.ticker === ticker));

      // Map to TradingView format
      const symbols = uniqueResults.map((item) => ({
        symbol: item.ticker,
        full_name: item.ticker,
        description: item.name,
        exchange: item.primary_exchange,
        type: item.type,
      }));

      // Filter results to match user input (ticker or name prefix)
      const filteredSymbols = symbols.filter((symbol) => {
        const tickerMatch = symbol.symbol.toUpperCase().startsWith(tickerInput);
        const nameMatch = symbol.description.toLowerCase().startsWith(userInput.toLowerCase());
        return tickerMatch || nameMatch;
      });

      // Return the filtered symbols via the callback
      onResultReadyCallback(filteredSymbols);
    } catch (error) {
      console.error("Error searching symbols:", error);
      onResultReadyCallback([]); // Return empty array on error
    }
  }
  // Provide configuration data to TradingView when requested
  onReady(callback) {
    setTimeout(() => {
      callback({
        supports_search: true,
        supports_marks: true,
        supports_timescale_marks: true,
        supports_time: true,
        supported_resolutions: ["1", "3", "5", "15", "30", "60", "D", "2D", "3D", "W", "3W", "M", "6M", "12M"], //currently just support up to daily resolution
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
      exchange: "NASDAQ", // change to NASDAQ
      pricescale: 100,
      has_intraday: true,
      has_daily: true,
      // supported_resolutions: ["1D", "2D", "3D", "W", "3W", "M", "6M"], //add lower timeframe, 1m, 3m, 5m, 15m, 30m, 1h, 1d, 1w, 1m, 1y, 5y
      supported_resolutions: ["1", "3", "5", "15", "30", "60", "D", "2D", "3D", "W", "3W", "M", "6M", "12M"]
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
    // console.log("Mapping resolution:", resolution); // Debug log
    const resolutionMap = {
      "1": { multiplier: 1, timespan: "minute" },
      "3": { multiplier: 3, timespan: "minute" },
      "5": { multiplier: 5, timespan: "minute" },
      "15": { multiplier: 15, timespan: "minute" },
      "30": { multiplier: 30, timespan: "minute" },
      "60": { multiplier: 1, timespan: "hour" },
      "1D": { multiplier: 1, timespan: "day" },
      "2D": { multiplier: 2, timespan: "day" },
      "3D": { multiplier: 3, timespan: "day" },
      "W": { multiplier: 1, timespan: "week" },
      "3W": { multiplier: 3, timespan: "week" },
      "M": { multiplier: 1, timespan: "month" },
      "6M": { multiplier: 6, timespan: "month" },
      "12M": { multiplier: 12, timespan: "month" }
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
    console.log("getBars called with:", { symbol: symbolInfo.ticker, resolution, from: periodParams.from, to: periodParams.to });
    try {
      const { multiplier, timespan } = this.getMultiplierAndTimespan(resolution);
      const from = periodParams.from * 1000; // Convert to milliseconds
      const to = periodParams.to * 1000; // Convert to milliseconds
      const url = `${this.baseUrl}/ticker/${symbolInfo.ticker}/range/${multiplier}/${timespan}/${from}/${to}?apiKey=${this.apiKey}`;
      console.log("Fetching bars from:", url);
      const response = await fetch(url);
      const data = await response.json();
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
    const concurrenTicker = symbolInfo.ticker.toUpperCase();
    const filteredMarks = this.marks.filter((mark) => mark.ticker == concurrenTicker &&
                                                      mark.time >= from 
                                                      && mark.time <= to);
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
    // enabled_features: ["study_templates", "two_character_bar_marks_labels"],
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