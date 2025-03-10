# Oonln Advanced Charts

## TradingView Charting Library
[Demo][demo-url] | [Documentation][doc-url] | [Tutorial][tutorial-url] | [Discord community][discord-url]

This repository contains the TradingView Advanced Charts package. If you use Git in your project, please feel free to use this repository as a submodule in yours.

The `master` branch contains the most recent features and fixes.

Before using the library, please read the [documentation][doc-url] and the [Best Practices][best-practices-url] article.

## Polygon datafeeds
Rather than using TradingView datafeed or sample datafeeds, the script uses datafeeds from Polygon in order to incorporate our own CSV file, which contains user's transactions of different type, like stock, option. Please read the Stocks API [Documentation]([text](https://polygon.io/docs/stocks/getting-started)), which provides REST endpoints that let you query the latest market data from all US stock exchanges.

> NOTE: since we're using free-tier serivce, we have 5 API calls per minute.

## Folders and Files
* charting_library: Local Tradingview Charting library
* index.html: Sets up a basic web page for display TradingView Chart, loading the charting library and the main script.
script.js: Custom datafeed from Polygon and a local CSV file to load symbolic data and annotation.

## Installation
1. Clone or download this repository.
2. Start a locla web server:
   ```bash
   python3 -m http.server 8000
   ```
3. access the server by opening a web browser and navigte to
   http://localhost:8000


[demo-url]: https://charting-library.tradingview.com/
[doc-url]: https://www.tradingview.com/charting-library-docs/
[tutorial-url]: https://github.com/tradingview/charting-library-tutorial
[best-practices-url]: https://www.tradingview.com/charting-library-docs/latest/getting_started/Best-Practices
[issues-url]: https://github.com/tradingview/charting_library/issues
[x-url]: https://twitter.com/intent/follow?screen_name=tv_charts
[discord-url]: https://discord.gg/UC7cGkvn4U
