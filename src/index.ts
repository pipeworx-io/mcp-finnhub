interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

interface McpToolExport {
  tools: McpToolDefinition[];
  callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  meter?: { credits: number };
  cost?: Record<string, unknown>;
  provider?: string;
}

/**
 * Finnhub MCP — wraps Finnhub Stock API (finnhub.io)
 *
 * Tools:
 * - get_quote: real-time stock quote for a ticker symbol
 * - get_company_news: recent news articles for a company
 * - get_earnings_calendar: upcoming/recent earnings reports
 * - search_symbol: search for stock ticker symbols by name
 *
 * Requires API key via _apiKey parameter (passed as `token` query param).
 */


const BASE_URL = 'https://finnhub.io/api/v1';

const tools: McpToolExport['tools'] = [
  {
    name: 'get_quote',
    description:
      'Get a real-time stock quote including current price, change, and volume. Example: get_quote({ symbol: "AAPL", _apiKey: "your-key" })',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: {
          type: 'string',
          description: 'Stock ticker symbol, e.g. "AAPL", "MSFT", "TSLA"',
        },
        _apiKey: {
          type: 'string',
          description: 'Finnhub API key (get one free at finnhub.io)',
        },
      },
      required: ['symbol', '_apiKey'],
    },
  },
  {
    name: 'get_company_news',
    description:
      'Get recent news articles about a company within a date range. Returns headline, summary, source, and URL. Example: get_company_news({ symbol: "AAPL", from: "2024-01-01", to: "2024-01-31", _apiKey: "your-key" })',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: {
          type: 'string',
          description: 'Stock ticker symbol, e.g. "AAPL"',
        },
        from: {
          type: 'string',
          description: 'Start date in YYYY-MM-DD format, e.g. "2024-01-01"',
        },
        to: {
          type: 'string',
          description: 'End date in YYYY-MM-DD format, e.g. "2024-01-31"',
        },
        _apiKey: {
          type: 'string',
          description: 'Finnhub API key',
        },
      },
      required: ['symbol', 'from', 'to', '_apiKey'],
    },
  },
  {
    name: 'get_earnings_calendar',
    description:
      'Get upcoming and recent earnings reports across the market. Optionally filter by date range. Example: get_earnings_calendar({ from: "2024-01-01", to: "2024-03-31", _apiKey: "your-key" })',
    inputSchema: {
      type: 'object',
      properties: {
        from: {
          type: 'string',
          description: 'Start date in YYYY-MM-DD format (optional)',
        },
        to: {
          type: 'string',
          description: 'End date in YYYY-MM-DD format (optional)',
        },
        _apiKey: {
          type: 'string',
          description: 'Finnhub API key',
        },
      },
      required: ['_apiKey'],
    },
  },
  {
    name: 'search_symbol',
    description:
      'Search for stock ticker symbols by company name or keyword. Returns matching symbols with descriptions. Example: search_symbol({ query: "apple", _apiKey: "your-key" })',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query — company name or keyword, e.g. "apple", "tesla"',
        },
        _apiKey: {
          type: 'string',
          description: 'Finnhub API key',
        },
      },
      required: ['query', '_apiKey'],
    },
  },
];

// Accept the common alias names an LLM might supply for the ticker arg
// (schema says "symbol", but agents reach for "ticker" interchangeably).
function symbolArg(args: Record<string, unknown>): string {
  return (
    (args.symbol as string | undefined) ??
    (args.ticker as string | undefined) ??
    ''
  );
}

// Finnhub's company-news endpoint returns 422 (no useful message) when from/to
// aren't strict YYYY-MM-DD. Pre-validate so we can return a helpful message.
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  const apiKey = args._apiKey as string;
  delete args._apiKey;

  switch (name) {
    case 'get_quote':
      return getQuote(symbolArg(args), apiKey);
    case 'get_company_news': {
      const from = args.from as string;
      const to = args.to as string;
      if (!ISO_DATE.test(from ?? '') || !ISO_DATE.test(to ?? '')) {
        throw new Error(
          `Finnhub get_company_news requires from/to in YYYY-MM-DD format (e.g. "2026-04-01", "2026-05-01"). Got from="${from}", to="${to}".`,
        );
      }
      return getCompanyNews(symbolArg(args), from, to, apiKey);
    }
    case 'get_earnings_calendar':
      return getEarningsCalendar(args.from as string | undefined, args.to as string | undefined, apiKey);
    case 'search_symbol':
      return searchSymbol(args.query as string, apiKey);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// Shared error formatter — make 429 + auth failures actionable instead
// of "Finnhub error: 429". Production analytics showed finnhub at 26%
// errors (32/124) — most are 429s when the platform free-tier quota is
// burnt down by bot traffic. Pointing the agent at alphavantage av_quote
// gives it a working pivot without a second discovery round trip.
function finnhubError(status: number, tool: string): Error {
  if (status === 429) {
    return new Error(
      `Finnhub: rate-limit (HTTP 429). The platform free-tier quota (60 calls/min) is currently exhausted. For US-equity quotes, use alphavantage av_quote({symbol: "AAPL"}) — same shape, different rate budget. Or pass your own Finnhub key via _apiKey to use a personal quota.`,
    );
  }
  if (status === 401 || status === 403) {
    return new Error(
      `Finnhub: auth failed (HTTP ${status}). The platform key is missing or invalid. Pass your own Finnhub key via _apiKey, or [sign up](https://pipeworx.io/signup?via=auth_hint) to get higher rate limits on platform-keyed packs.`,
    );
  }
  return new Error(`Finnhub ${tool} error: ${status}`);
}

async function getQuote(symbol: string, apiKey: string) {
  if (!symbol) {
    throw new Error('Finnhub get_quote requires a symbol (e.g. "AAPL"). Pass via the `symbol` argument.');
  }
  const params = new URLSearchParams({ symbol, token: apiKey });
  const res = await fetch(`${BASE_URL}/quote?${params}`);
  if (!res.ok) throw finnhubError(res.status, 'get_quote');

  const data = (await res.json()) as {
    c: number; h: number; l: number; o: number; pc: number; d: number; dp: number; t: number;
  };

  // Finnhub returns 200 with all-zero fields when the symbol isn't a real
  // ticker (e.g. user passed a company name like "Apple" instead of "AAPL").
  // Surface this as an actionable error rather than zeroed numbers downstream.
  if (data.t === 0 && data.c === 0) {
    throw new Error(
      `Finnhub returned no data for symbol "${symbol}". This usually means the symbol isn't a recognized ticker — try search_symbol({query: "${symbol}"}) to find the right ticker, then retry. Finnhub expects exchange tickers like "AAPL", not company names like "Apple".`,
    );
  }

  return {
    symbol,
    current_price: data.c,
    change: data.d,
    percent_change: data.dp,
    high: data.h,
    low: data.l,
    open: data.o,
    previous_close: data.pc,
    timestamp: data.t,
  };
}

async function getCompanyNews(symbol: string, from: string, to: string, apiKey: string) {
  const params = new URLSearchParams({ symbol, from, to, token: apiKey });
  const res = await fetch(`${BASE_URL}/company-news?${params}`);
  if (!res.ok) throw finnhubError(res.status, 'get_company_news');

  const data = (await res.json()) as Array<{
    category: string; datetime: number; headline: string; id: number;
    image: string; related: string; source: string; summary: string; url: string;
  }>;

  return {
    count: data.length,
    articles: data.slice(0, 20).map((a) => ({
      headline: a.headline,
      summary: a.summary,
      source: a.source,
      url: a.url,
      datetime: a.datetime,
      category: a.category,
    })),
  };
}

async function getEarningsCalendar(from: string | undefined, to: string | undefined, apiKey: string) {
  const params = new URLSearchParams({ token: apiKey });
  if (from) params.set('from', from);
  if (to) params.set('to', to);

  const res = await fetch(`${BASE_URL}/calendar/earnings?${params}`);
  if (!res.ok) throw finnhubError(res.status, 'get_earnings_calendar');

  const data = (await res.json()) as {
    earningsCalendar: Array<{
      date: string; epsActual: number | null; epsEstimate: number | null;
      hour: string; quarter: number; revenueActual: number | null;
      revenueEstimate: number | null; symbol: string; year: number;
    }>;
  };

  return {
    count: data.earningsCalendar.length,
    earnings: data.earningsCalendar.slice(0, 50).map((e) => ({
      symbol: e.symbol,
      date: e.date,
      quarter: e.quarter,
      year: e.year,
      eps_estimate: e.epsEstimate,
      eps_actual: e.epsActual,
      revenue_estimate: e.revenueEstimate,
      revenue_actual: e.revenueActual,
      hour: e.hour,
    })),
  };
}

async function searchSymbol(query: string, apiKey: string) {
  const params = new URLSearchParams({ q: query, token: apiKey });
  const res = await fetch(`${BASE_URL}/search?${params}`);
  if (!res.ok) throw finnhubError(res.status, 'search_symbol');

  const data = (await res.json()) as {
    count: number;
    result: Array<{
      description: string; displaySymbol: string; symbol: string; type: string;
    }>;
  };

  return {
    count: data.count,
    results: data.result.map((r) => ({
      symbol: r.symbol,
      display_symbol: r.displaySymbol,
      description: r.description,
      type: r.type,
    })),
  };
}

export default { tools, callTool, meter: { credits: 5 } } satisfies McpToolExport;
