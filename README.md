# Finnhub — Stock, Crypto, Forex Data

Finnhub's REST API. Real-time stock quotes, fundamentals, earnings, news, alternative data (insider transactions, sentiment, ETF holdings), economic data, crypto, and forex. Comprehensive market data with a strong free tier.

Part of [Pipeworx](https://pipeworx.io) — an MCP gateway connecting AI agents to 1394+ live data sources.

## Why this matters for AI agents

Where [Alpha Vantage](/docs/reference/alphavantage) is solid for fundamentals + technical, Finnhub is stronger for real-time quotes (1-minute resolution on free), insider transactions, news/sentiment, and international markets. For finance agents that need price data alongside news flow and insider activity, Finnhub is fit-for-purpose.

Common flows:

- **Quote.** Real-time (or 15-min delayed on free tier) stock quote.
- **Company news.** Recent news for a ticker with sentiment scoring.
- **Insider transactions.** Form 4 filings with timing and dollar amounts (also see [insider-trading](/docs/reference/insider-trading) pack which is SEC-EDGAR-direct).
- **Earnings.** Upcoming earnings calendar, surprise history, EPS estimates.
- **International symbols.** European, Asian, emerging-market tickers (where Alpha Vantage gets thinner).

## Auth

Free key from https://finnhub.io/dashboard. Free tier: 60 API calls/minute. Pass via `_apiKey`.

Higher tiers ($50-200/mo) unlock real-time data, longer historical, and rate limits suitable for production. The free tier is sufficient for most agent research.

## When to use Finnhub vs. Alpha Vantage

| Need | Better source |
|---|---|
| Quotes | Either; Finnhub real-time-er on free tier |
| Income statement / balance sheet | Alpha Vantage (cleaner schema) |
| Insider transactions | Finnhub or insider-trading pack |
| Company news with sentiment | Finnhub |
| Earnings calendar | Finnhub |
| International coverage | Finnhub |
| Technical indicators | Alpha Vantage |
| ETF holdings | Finnhub |

For richest coverage, Pipeworx agents often mount both.

## Common pitfalls

- **Symbol conventions.** US tickers are simple (AAPL); international markets need exchange suffixes (NESN.SW for Nestlé on Swiss exchange). Finnhub has a symbol search.
- **Free tier real-time delay.** "Real-time" on free is essentially current; on paid it's actually live. For agent research, free is fine. For trading, paid.
- **News sentiment is heuristic.** Finnhub computes sentiment with NLP — it's directionally useful but noisy. Don't treat as ground truth; useful as a signal.
- **Insider transaction lag.** SEC requires Form 4 filing within 2 business days of the transaction. Finnhub picks them up shortly after. Real-time alerting requires either polling or a separate real-time SEC feed.
- **Estimates vs. actuals.** Finnhub provides analyst consensus estimates; mixing them with actuals in plots requires labeling carefully.
- **Free-tier coverage holes.** Some smaller caps and OTC stocks have limited Finnhub coverage on free. Verify the data exists for your target tickers before designing flows around it.

## Quick Start

Add to your MCP client (Claude Desktop, Cursor, Windsurf, etc.):

```json
{
  "mcpServers": {
    "finnhub": {
      "url": "https://gateway.pipeworx.io/finnhub/mcp"
    }
  }
}
```

Or connect to the full Pipeworx gateway for access to all 1394+ data sources:

```json
{
  "mcpServers": {
    "pipeworx": {
      "url": "https://gateway.pipeworx.io/mcp"
    }
  }
}
```

## Using with ask_pipeworx

Instead of calling tools directly, you can ask questions in plain English:

```
ask_pipeworx({ question: "your question about Finnhub data" })
```

The gateway picks the right tool and fills the arguments automatically.

## More

- [Docs and guides](https://pipeworx.io/docs)
- [pipeworx.io](https://pipeworx.io)

## License

MIT
