function getParameterByName(name) {
  name = name.replace(/[\[]/, "\\[").replace(/[\]]/, "\\]");
  var regex = new RegExp("[\\?&]" + name + "=([^&#]*)"),
  results = regex.exec(location.search);
  return results === null ? "" : decodeURIComponent(results[1].replace(/\+/g, " "));
}

class CustomDatafeed extends Datafeeds.UDFCompatibleDatafeed {
  constructor(url, authToken, cfg) {
    super(url, authToken, cfg);
    this.marks = [];
    this.csvFilename = 'sampleCSV.csv';
    this.loadCSVData();
  }

  async loadCSVData() {
    try {
      const response = await fetch(`${this.csvFilename}?v=${new Date().getTime()}`);
      const text = await response.text();
      const rows = text.split('\n');
      this.marks = rows.slice(1).map(row => {
        const values = row.split(',');
        console.log("DateTime: ", values[9] + values[10]);
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
          DateTime: values[9] + values[10],
          Proceeds: values[11],
          Comm_fee: values[12]
        });
      }).filter(obj => obj !== null); // Filter out any empty or malformed rows
      console.log('CSV data loaded and marks updated.');
    } catch {
      console.error('Error loading CSV.');
    }
  }

  convertToUnixTimestamp(timestampString) {
    // Create a Date object from the string
    const date = new Date(timestampString + " UTC"); // Assuming input is in UTC

    // Convert to Unix timestamp (seconds since epoch)
    const unixTimestamp = Math.floor(date.getTime() / 1000);

    return unixTimestamp;
  }

  toUnixTimestamp(dateString) {
    // Remove quotation marks if they exist
    const cleanedString = dateString.replace(/['"]/g, '');
    
    // Convert to ISO 8601 format (replace space with 'T' and add 'Z' for UTC)
    const isoString = cleanedString.replace(' ', 'T') + 'Z';
    const date = new Date(isoString);
    
    // Validate the date
    if (isNaN(date.getTime())) {
        throw new Error('Invalid date string provided');
    }
    
    return Math.floor(date.getTime() / 1000);
}

  convertRowToMark(row) {
    let label, color;
    if (parseInt(row.Quantity) < 0) {
      label = 'S';
      color = { border: '#FF0000', background: '#FF0000' };
    }
    else {
      label = 'B';
      color = { border: '#008000', background: '#008000' };
    }
    let tooltip = 'Time: '+  row.Time + '\n' +
                  'Ticker: ' + row.Ticker + '\n' +
                  'Expiry: ' + row.Expiry + '\n' +
                  'Strike: ' + row.Strike + '\n' +
                  'Instrument: ' + row.Instrument + '\n' +
                  'Quantity: ' + row.Quantity + '\n' +
                  'Net Proceeds: ' + row.Net_proceeds + '\n' +
                  'Symbol: ' + row.Symbol + '\n' +
                  'Proceeds: ' + row.Proceeds + '\n' +
                  'Comm Fee: ' + row.Comm_fee;
    console.log("row.DateTime: ", row.DateTime);
    console.log("The length of row.DateTime: ", row.DateTime.length);
    console.log("UNIX timestamp: ", this.toUnixTimestamp(row.DateTime));
    return {
      id: row.DateTime,
      time: this.toUnixTimestamp(row.DateTime),
      color: color,
      text: tooltip,
      label: label,
      labelFontColor: '#FFFFFF',
      minSize: 2,
      tooltip: tooltip
    }
  }


  getMarks(symbolInfo, from, to, onDataCallback, resolution) {
    console.log('Fetching marks for symbol:', symbolInfo.name, 'from:', from, 'to:', to);

    // this.marks = [
    //   {
    //     id: 'A',
    //     time: 1521475200, // One day after the annotation time
    //     color: { border: '#FF0000', background: '#FF0000' },
    //     text: 'Hello world',
    //     label: 'C',
    //     labelFontColor: '#FFFFFF',
    //     minSize: 2,
    //     tooltip: 'This is event A'
    //   },
    //   {
    //     id: 'test',
    //     time: 1521475200, // One day after the annotation time
    //     color: { border: '#FF0000', background: '#FF0000' },
    //     text: 'Hello world 2',
    //     label: 'A',
    //     labelFontColor: '#FFFFFF',
    //     minSize: 2,
    //     tooltip: 'This is event A'
    //   },
    //   {
    //     id: 'B',
    //     time: 1521475200 + 86400, // Two days after
    //     color: { border: '#0000FF', background: '#0000FF' },
    //     text: 'Event B',
    //     label: 'B',
    //     labelFontColor: '#FFFFFF',
    //     minSize: 2,
    //     tooltip: 'This is event B'
    //   }
    // ]
    onDataCallback(this.marks);
  }
}

function initOnReady() {

  var datafeedUrl = "https://demo-feed-data.tradingview.com";
  var customDataUrl = getParameterByName('dataUrl');
  if (customDataUrl !== "") {
    datafeedUrl = customDataUrl.startsWith('https://') ? customDataUrl : `https://${customDataUrl}`;
  }

  var widget = window.tvWidget = new TradingView.widget({
    fullscreen: true,
    symbol: 'AAPL',
    interval: '1D',
    container: "tv_chart_container",
    // datafeed: new Datafeeds.UDFCompatibleDatafeed(datafeedUrl, undefined, {
    datafeed: new CustomDatafeed(datafeedUrl, undefined, {
      maxResponseLength: 1000,
      expectedOrder: 'latestFirst',
      support_marks: true
    }),
    library_path: "charting_library/",
    locale: getParameterByName('lang') || "en",
    disabled_features: ["use_localstorage_for_settings"],
    enabled_features: ["study_templates", 'two_character_bar_marks_labels'],
    charts_storage_url: 'https://saveload.tradingview.com',
    charts_storage_api_version: "1.1",
    client_id: 'tradingview.com',
    user_id: 'public_user_id',
    theme: getParameterByName('theme'),
  });

  // Wait until the chart is ready
    widget.onChartReady(function() {
      console.log("Chart is ready!");

      // Get the active chart
      const chart = widget.chart();
      console.log("got the chart");
      
      const shape = chart.createShape(
        {
          time: 1521475200, 
          price: 160, 
        },
        {
          shape: 'text',
          text: 'Hello World',
          lock: true, // Prevent accidental removal
          color: 'blue',
          fontsize: 16,
          // overrideMinTick: true,
          // showLabel: true
          tooltip: '💡 This is an important level!\nAAPL at $150', // Tooltip text shown on hover
          overrides: {
            "position": "abovebar",
          }
        }	
      );
    
      console.log("Annotation added!");
    });

    window.frames[0].focus();
}
// function initOnReady() {
// 	console.log("Hello");
// 	var datafeedUrl = "https://demo-feed-data.tradingview.com";
// 	var customDataUrl = getParameterByName('dataUrl');
// 	if (customDataUrl !== "") {
// 		datafeedUrl = customDataUrl.startsWith('https://') ? customDataUrl : `https://${customDataUrl}`;
// 	}

// 	var widget = window.tvWidget = new TradingView.widget({
// 		// debug: true, // uncomment this line to see Library errors and warnings in the console
// 		fullscreen: true,
// 		symbol: 'AAPL',
// 		interval: '1D',
// 		container: "tv_chart_container",

// 		//	BEWARE: no trailing slash is expected in feed URL
// 		datafeed: new Datafeeds.UDFCompatibleDatafeed(datafeedUrl, undefined, {
// 			maxResponseLength: 1000,
// 			expectedOrder: 'latestFirst',
// 		}),
// 		library_path: "charting_library/",
// 		locale: getParameterByName('lang') || "en",

// 		disabled_features: ["use_localstorage_for_settings"],
// 		enabled_features: ["study_templates"],
// 		charts_storage_url: 'https://saveload.tradingview.com',
// 		charts_storage_api_version: "1.1",
// 		client_id: 'tradingview.com',
// 		user_id: 'public_user_id',
// 		theme: getParameterByName('theme'),
// 	});
// 	window.frames[0].focus();
// };

window.addEventListener('DOMContentLoaded', initOnReady, false);