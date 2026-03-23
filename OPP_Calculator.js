/*
  OPP_Calculator.js
  - Fee transparency calculator (mid-market vs provider rate)
  - Volatility score helper
  - Live fetch wrappers (fillable with real API keys)
  - Offline cache helper
*/

const nodeFetch = typeof fetch === 'undefined' ? require('node-fetch') : fetch;

const DEFAULT_CACHE_TTL_MS = 1000 * 60 * 5; // 5 mins

class RatesCache {
  constructor(ttlMs = DEFAULT_CACHE_TTL_MS) {
    this.ttlMs = ttlMs;
    this.store = new Map();
  }

  _isFresh(entry) {
    return entry && Date.now() - entry.ts < this.ttlMs;
  }

  get(key) {
    const entry = this.store.get(key);
    if (this._isFresh(entry)) {
      return entry.value;
    }
    this.store.delete(key);
    return null;
  }

  set(key, value) {
    this.store.set(key, { value, ts: Date.now() });
  }

  clear() {
    this.store.clear();
  }
}

const cache = new RatesCache();

async function fetchJSON(url, opts = {}, retries = 3, backoffMs = 1000) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await nodeFetch(url, opts);
      if (!res.ok) {
        throw new Error(`Request failed ${res.status}: ${res.statusText}`);
      }
      return res.json();
    } catch (error) {
      if (attempt === retries) throw error;
      await new Promise(resolve => setTimeout(resolve, backoffMs * (2 ** attempt)));
    }
  }
}

async function getUNOperationalRates() {
  const key = 'un-operational-rates';
  const stored = cache.get(key);
  if (stored) return stored;

  // UN doesn't provide a clean public API endpoint; manual parsing for MVP
  // e.g. https://treasury.un.org/operationalrates/OperationalRates.php
  // Placeholder: return static sample dataset.
  const data = {
    USD: 1.0,
    EUR: 0.92,
    GBP: 0.82,
    JPY: 134.48,
    INR: 82.33,
  };

  cache.set(key, data);
  return data;
}

async function getMidMarketRate(base, quote, provider = 'fixer') {
  const key = `mid-${base}-${quote}`;
  const stored = cache.get(key);
  if (stored) return stored;

  let url;
  let apiKey = process.env[`${provider.toUpperCase()}_API_KEY`];
  if (provider === 'fixer' && apiKey) {
    url = `https://data.fixer.io/api/latest?access_key=${apiKey}&base=${base}&symbols=${quote}`;
  } else if (provider === 'oanda') {
    // Placeholder for OANDA
    url = `https://api-fxpractice.oanda.com/v3/instruments/${base}_${quote}/prices?granularity=S5&candleFormat=midpoint`;
  } else {
    // Fallback to static
    const fallback = 1.0;
    cache.set(key, fallback);
    return fallback;
  }

  try {
    const data = await fetchJSON(url);
    let rate;
    if (provider === 'fixer') {
      rate = data.rates[quote];
    } else if (provider === 'oanda') {
      rate = data.candles[0]?.mid?.c;
    }
    if (rate) {
      cache.set(key, rate);
      return rate;
    }
  } catch (error) {
    console.warn(`Failed to fetch ${provider} rate:`, error.message);
  }

  // Fallback
  const fallback = 1.0;
  cache.set(key, fallback);
  return fallback;
}

async function getCryptoRate(symbol) {
  const key = `crypto-${symbol}`;
  const stored = cache.get(key);
  if (stored) return stored;

  try {
    const data = await fetchJSON(`https://api.coingecko.com/api/v3/simple/price?ids=${symbol}&vs_currencies=usd`);
    const price = data[symbol]?.usd;
    if (price) {
      cache.set(key, price);
      return price;
    }
  } catch (error) {
    console.warn(`Failed to fetch crypto rate for ${symbol}:`, error.message);
  }

  return 0; // placeholder
}

function calculateMarkup(midMarketRate, offeredRate) {
  if (midMarketRate <= 0) throw new Error('midMarketRate must be > 0');
  const diff = offeredRate - midMarketRate;
  const percentage = (diff / midMarketRate) * 100;
  return {
    midMarketRate,
    offeredRate,
    difference: diff,
    percentage,
  };
}

function calculateFeeTransparentTrade(amount, midMarketRate, offeredRate, fixedFee = 0) {
  if (amount < 0) throw new Error('amount must be non-negative');

  const baseOut = amount * offeredRate;
  const idealOut = amount * midMarketRate;
  const hiddenSpread = idealOut - baseOut; // Cost due to worse rate
  const totalCost = hiddenSpread + fixedFee;

  return {
    amount,
    midMarketRate,
    offeredRate,
    idealOut,
    actualOut: baseOut,
    fixedFee,
    hiddenSpread,
    totalCost,
    effectiveFeePercent: (totalCost / idealOut) * 100,
  };
}

function generateHiddenFeeReport(tradeResult) {
  const { hiddenSpread, totalCost, effectiveFeePercent, amount, idealOut } = tradeResult;
  return {
    summary: `For $${amount}, you're paying an extra $${totalCost.toFixed(2)} (${effectiveFeePercent.toFixed(2)}%) due to hidden fees.`,
    breakdown: {
      hiddenSpread: `$${hiddenSpread.toFixed(2)} from unfavorable rate`,
      fixedFee: `$${tradeResult.fixedFee.toFixed(2)} explicit fee`,
      idealReceive: `$${idealOut.toFixed(2)} at mid-market`,
      actualReceive: `$${tradeResult.actualOut.toFixed(2)} offered`,
    },
    recommendation: effectiveFeePercent > 5 ? 'High fee detected. Consider alternative providers.' : 'Fees are reasonable.',
  };
}

function calculateVolatility(prices) {
  if (!Array.isArray(prices) || prices.length < 2) {
    return { score: 0, reason: 'Not enough data' };
  }

  const returns = [];
  for (let i = 1; i < prices.length; i += 1) {
    const p0 = prices[i - 1];
    const p1 = prices[i];
    if (p0 <= 0) continue;
    returns.push(Math.log(p1 / p0));
  }

  const n = returns.length;
  if (n < 2) return { score: 0, reason: 'Not enough valid returns' };

  const mean = returns.reduce((a, b) => a + b, 0) / n;
  const variance = returns.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1);
  const stdDev = Math.sqrt(variance);

  // annualized volatility assuming daily returns; this is approximate.
  const annualized = stdDev * Math.sqrt(252);

  let label = 'Low';
  if (annualized > 0.25) label = 'High';
  else if (annualized > 0.1) label = 'Medium';

  return {
    periods: n,
    meanReturn: mean,
    stdDev,
    annualized,
    label,
  };
}

function checkVolatilityAlert(volatilityResult, threshold = 0.25) {
  if (volatilityResult.label === 'High' || volatilityResult.annualized > threshold) {
    return {
      alert: true,
      message: `High volatility detected (${(volatilityResult.annualized * 100).toFixed(2)}%). Consider waiting or using limit orders.`,
      level: 'High',
    };
  }
  return { alert: false, message: 'Volatility is within normal range.', level: volatilityResult.label };
}

async function sendVolatilityAlert(userId, volatilityResult) {
  // Stub: In production, call backend to send push notification
  console.log(`Sending alert to user ${userId}: ${volatilityResult.message}`);
  // e.g., fetch('/api/send-notification', { method: 'POST', body: JSON.stringify({ title: 'Volatility Alert', body: volatilityResult.message }) });
}

function calculateSlippage(currentPrice, targetPrice, amount) {
  const slippage = Math.abs(currentPrice - targetPrice) / targetPrice;
  const unrealizedLoss = slippage * amount * targetPrice;
  return {
    slippagePercent: slippage * 100,
    unrealizedLoss,
    alert: slippage > 0.01, // 1% threshold
    message: slippage > 0.01 ? `Slippage detected: ${(slippage * 100).toFixed(2)}%. Potential loss: $${unrealizedLoss.toFixed(2)}.` : 'No significant slippage.',
  };
}

function offlineRateStore(rateType, pair, rate) {
  const key = `${rateType}:${pair}`;
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(key, JSON.stringify({ rate, ts: Date.now() }));
  } else {
    cache.set(key, { rate, ts: Date.now() });
  }
}

function getOfflineRate(rateType, pair, maxAgeMs = 1000 * 60 * 60 * 24) {
  const key = `${rateType}:${pair}`;
  let entry;
  if (typeof localStorage !== 'undefined') {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    try {
      entry = JSON.parse(raw);
    } catch {
      return null;
    }
  } else {
    entry = cache.get(key);
  }

  if (!entry) return null;
  if (Date.now() - entry.ts > maxAgeMs) return null;
  return entry.rate;
}

// Transaction Simulation
class LiquidityProvider {
  constructor(name, feePercent, minAmount, supportedCurrencies) {
    this.name = name;
    this.feePercent = feePercent;
    this.minAmount = minAmount;
    this.supportedCurrencies = supportedCurrencies;
  }

  async executeTrade(amount, fromCurrency, toCurrency, rate) {
    if (amount < this.minAmount) throw new Error(`Minimum amount is ${this.minAmount}`);
    if (!this.supportedCurrencies.includes(fromCurrency) || !this.supportedCurrencies.includes(toCurrency)) {
      throw new Error(`Unsupported currency pair`);
    }

    const fee = amount * (this.feePercent / 100);
    const received = (amount - fee) * rate;

    // Simulate settlement delay
    await new Promise(resolve => setTimeout(resolve, 1000));

    return {
      provider: this.name,
      amountSent: amount,
      fee,
      amountReceived: received,
      rate,
      settlementTime: '1-3 business days',
      status: 'completed',
    };
  }
}

const providers = {
  airwallex: new LiquidityProvider('Airwallex', 0.5, 100, ['USD', 'EUR', 'GBP', 'AUD']),
  currencycloud: new LiquidityProvider('Currencycloud', 0.4, 50, ['USD', 'EUR', 'GBP', 'JPY']),
  revolut: new LiquidityProvider('Revolut', 0.3, 10, ['USD', 'EUR', 'GBP']),
};

function selectProvider(amount, fromCurrency, toCurrency) {
  const eligible = Object.values(providers).filter(p =>
    p.minAmount <= amount &&
    p.supportedCurrencies.includes(fromCurrency) &&
    p.supportedCurrencies.includes(toCurrency)
  );

  if (eligible.length === 0) throw new Error('No eligible provider');

  // Select cheapest
  return eligible.reduce((best, current) => current.feePercent < best.feePercent ? current : best);
}

async function simulateExchange(amount, fromCurrency, toCurrency) {
  const rate = await getMidMarketRate(fromCurrency, toCurrency);
  const provider = selectProvider(amount, fromCurrency, toCurrency);
  const result = await provider.executeTrade(amount, fromCurrency, toCurrency, rate);
  return result;
}

// KYC/AML Flow Stubs
const HIGH_RISK_COUNTRIES = ['IR', 'KP', 'SY', 'CU']; // Simplified list
const AML_THRESHOLDS = { daily: 10000, monthly: 50000 };

function calculateRiskScore(user) {
  let score = 0;
  if (HIGH_RISK_COUNTRIES.includes(user.country)) score += 50;
  if (user.amount > AML_THRESHOLDS.daily) score += 30;
  if (user.isPEP) score += 20; // Politically Exposed Person
  return Math.min(score, 100);
}

function checkAMLThresholds(user, amount) {
  // Stub: In real app, check against user's transaction history
  const dailyTotal = amount; // placeholder
  const monthlyTotal = amount; // placeholder

  if (dailyTotal > AML_THRESHOLDS.daily || monthlyTotal > AML_THRESHOLDS.monthly) {
    return { flagged: true, reason: 'Exceeds AML thresholds', action: 'Require enhanced KYC' };
  }
  return { flagged: false };
}

function performKYC(user) {
  // Stub: Simulate ID verification
  const riskScore = calculateRiskScore(user);
  const amlCheck = checkAMLThresholds(user, user.amount);

  if (riskScore > 70 || amlCheck.flagged) {
    return { approved: false, reason: 'High risk or AML flag', nextSteps: ['Enhanced verification', 'Document submission'] };
  }

  return { approved: true, riskScore, amlCheck };
}

module.exports = {
  getUNOperationalRates,
  getMidMarketRate,
  getCryptoRate,
  calculateMarkup,
  calculateFeeTransparentTrade,
  calculateVolatility,
  checkVolatilityAlert,
  sendVolatilityAlert,
  calculateSlippage,
  generateHiddenFeeReport,
  offlineRateStore,
  getOfflineRate,
  cache,
  providers,
  selectProvider,
  simulateExchange,
  calculateRiskScore,
  checkAMLThresholds,
  performKYC,
};

// Demo runner when invoked directly via node
if (require.main === module) {
  (async () => {
    console.log('OPP Calculator Demo');
    const mid = await getMidMarketRate('USD', 'EUR');
    const offered = 0.92;
    console.log('mid', mid, 'offered', offered);

    const markup = calculateMarkup(mid, offered);
    console.log('markup', markup);

    const fee = calculateFeeTransparentTrade(1000, mid, offered, 5);
    console.log('fee transparency', fee);

    const vol = calculateVolatility([1.0, 1.001, 0.998, 1.010, 1.005]);
    console.log('volatility', vol);
  })().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
