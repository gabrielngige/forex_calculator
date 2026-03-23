const {
  calculateMarkup,
  calculateFeeTransparentTrade,
  calculateVolatility,
  checkVolatilityAlert,
  calculateSlippage,
  generateHiddenFeeReport,
  calculateRiskScore,
  checkAMLThresholds,
} = require('./OPP_Calculator');

describe('OPP Calculator Tests', () => {
  test('calculateMarkup', () => {
    const result = calculateMarkup(1.0, 0.95);
    expect(result.difference).toBeCloseTo(-0.05);
    expect(result.percentage).toBeCloseTo(-5);
  });

  test('calculateFeeTransparentTrade', () => {
    const result = calculateFeeTransparentTrade(1000, 1.0, 0.95, 5);
    expect(result.totalCost).toBeCloseTo(55);
    expect(result.effectiveFeePercent).toBeCloseTo(5.5);
  });

  test('calculateVolatility', () => {
    const prices = [100, 101, 99, 102, 98];
    const result = calculateVolatility(prices);
    expect(result.label).toBe('High');
    expect(result.annualized).toBeGreaterThan(0);
  });

  test('checkVolatilityAlert', () => {
    const vol = { annualized: 0.3, label: 'High' };
    const alert = checkVolatilityAlert(vol);
    expect(alert.alert).toBe(true);
  });

  test('calculateSlippage', () => {
    const result = calculateSlippage(1.0, 0.98, 1000);
    expect(result.slippagePercent).toBeCloseTo(2.04);
    expect(result.alert).toBe(true);
  });

  test('generateHiddenFeeReport', () => {
    const trade = {
      hiddenSpread: 50,
      totalCost: 55,
      effectiveFeePercent: 5.5,
      amount: 1000,
      idealOut: 1000,
      fixedFee: 5,
      actualOut: 950,
    };
    const report = generateHiddenFeeReport(trade);
    expect(report.summary).toContain('extra $55.00');
  });

  test('calculateRiskScore', () => {
    const user = { country: 'IR', amount: 15000, isPEP: true };
    const score = calculateRiskScore(user);
    expect(score).toBe(100);
  });

  test('checkAMLThresholds', () => {
    const user = { amount: 12000 };
    const result = checkAMLThresholds(user, 12000);
    expect(result.flagged).toBe(true);
  });
});