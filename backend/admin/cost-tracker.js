// Cost tracking and management for OpenAI API usage
class CostTracker {
  constructor() {
    // OpenAI pricing as of 2024 (per 1K tokens)
    this.pricing = {
      'gpt-4': {
        input: 0.03,
        output: 0.06,
        name: 'GPT-4'
      },
      'gpt-4-turbo': {
        input: 0.01,
        output: 0.03,
        name: 'GPT-4 Turbo'
      },
      'gpt-3.5-turbo': {
        input: 0.0015,
        output: 0.002,
        name: 'GPT-3.5 Turbo'
      },
      'text-embedding-3-large': {
        input: 0.00013,
        output: 0,
        name: 'Text Embedding 3 Large'
      },
      'text-embedding-3-small': {
        input: 0.00002,
        output: 0,
        name: 'Text Embedding 3 Small'
      },
      'text-embedding-ada-002': {
        input: 0.0001,
        output: 0,
        name: 'Text Embedding Ada 002'
      }
    };

    // In-memory storage for cost data (in production, use persistent storage)
    this.dailyCosts = new Map();
    this.monthlyCosts = new Map();
    this.usageHistory = [];
    this.budgetAlerts = {
      daily: 5.00,    // $5 daily budget alert
      monthly: 100.00  // $100 monthly budget alert
    };
  }

  // Track a completion request
  trackCompletion(model, inputTokens, outputTokens, type = 'chat') {
    const cost = this.calculateCost(model, inputTokens, outputTokens);
    const usage = {
      timestamp: new Date().toISOString(),
      model,
      type,
      inputTokens: inputTokens || 0,
      outputTokens: outputTokens || 0,
      totalTokens: (inputTokens || 0) + (outputTokens || 0),
      cost,
      costDetails: {
        inputCost: this.calculateInputCost(model, inputTokens),
        outputCost: this.calculateOutputCost(model, outputTokens)
      }
    };

    this.usageHistory.push(usage);
    this.updateDailyCosts(cost);
    this.updateMonthlyCosts(cost);
    this.checkBudgetAlerts();

    // Keep only last 10000 records
    if (this.usageHistory.length > 10000) {
      this.usageHistory = this.usageHistory.slice(-10000);
    }

    return usage;
  }

  // Calculate cost for a request
  calculateCost(model, inputTokens = 0, outputTokens = 0) {
    const modelPricing = this.pricing[model];
    if (!modelPricing) {
      console.warn(`⚠️ Unknown model for pricing: ${model}`);
      return 0;
    }

    const inputCost = this.calculateInputCost(model, inputTokens);
    const outputCost = this.calculateOutputCost(model, outputTokens);

    return inputCost + outputCost;
  }

  calculateInputCost(model, tokens = 0) {
    const modelPricing = this.pricing[model];
    if (!modelPricing) return 0;
    return (tokens / 1000) * modelPricing.input;
  }

  calculateOutputCost(model, tokens = 0) {
    const modelPricing = this.pricing[model];
    if (!modelPricing) return 0;
    return (tokens / 1000) * modelPricing.output;
  }

  // Update daily costs
  updateDailyCosts(cost) {
    const today = new Date().toISOString().split('T')[0];
    const currentCost = this.dailyCosts.get(today) || 0;
    this.dailyCosts.set(today, currentCost + cost);
  }

  // Update monthly costs
  updateMonthlyCosts(cost) {
    const thisMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
    const currentCost = this.monthlyCosts.get(thisMonth) || 0;
    this.monthlyCosts.set(thisMonth, currentCost + cost);
  }

  // Check budget alerts
  checkBudgetAlerts() {
    const today = new Date().toISOString().split('T')[0];
    const thisMonth = new Date().toISOString().slice(0, 7);

    const dailyCost = this.dailyCosts.get(today) || 0;
    const monthlyCost = this.monthlyCosts.get(thisMonth) || 0;

    const alerts = [];

    if (dailyCost > this.budgetAlerts.daily) {
      alerts.push({
        type: 'daily-budget-exceeded',
        message: `Cost diari superat: $${dailyCost.toFixed(4)} (límit: $${this.budgetAlerts.daily})`,
        severity: 'warning',
        cost: dailyCost,
        limit: this.budgetAlerts.daily
      });
    }

    if (monthlyCost > this.budgetAlerts.monthly) {
      alerts.push({
        type: 'monthly-budget-exceeded',
        message: `Cost mensual superat: $${monthlyCost.toFixed(2)} (límit: $${this.budgetAlerts.monthly})`,
        severity: 'error',
        cost: monthlyCost,
        limit: this.budgetAlerts.monthly
      });
    }

    if (alerts.length > 0) {
      console.warn('🚨 ALERTA DE PRESSUPOST:', alerts);
    }

    return alerts;
  }

  // Get cost analytics
  getCostAnalytics(timeframe = '30d') {
    const now = new Date();
    const days = timeframe === '7d' ? 7 : timeframe === '30d' ? 30 : 1;
    const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

    const recentUsage = this.usageHistory.filter(u =>
      new Date(u.timestamp) >= since
    );

    const totalCost = recentUsage.reduce((sum, u) => sum + u.cost, 0);
    const totalTokens = recentUsage.reduce((sum, u) => sum + u.totalTokens, 0);
    const totalRequests = recentUsage.length;

    // Group by model
    const modelBreakdown = {};
    recentUsage.forEach(usage => {
      if (!modelBreakdown[usage.model]) {
        modelBreakdown[usage.model] = {
          requests: 0,
          tokens: 0,
          cost: 0,
          name: this.pricing[usage.model]?.name || usage.model
        };
      }
      modelBreakdown[usage.model].requests++;
      modelBreakdown[usage.model].tokens += usage.totalTokens;
      modelBreakdown[usage.model].cost += usage.cost;
    });

    // Group by type
    const typeBreakdown = {};
    recentUsage.forEach(usage => {
      if (!typeBreakdown[usage.type]) {
        typeBreakdown[usage.type] = {
          requests: 0,
          tokens: 0,
          cost: 0
        };
      }
      typeBreakdown[usage.type].requests++;
      typeBreakdown[usage.type].tokens += usage.totalTokens;
      typeBreakdown[usage.type].cost += usage.cost;
    });

    // Daily trends
    const dailyTrends = this.getDailyTrends(days);

    return {
      timeframe,
      summary: {
        totalCost: Number(totalCost.toFixed(6)),
        totalTokens,
        totalRequests,
        avgCostPerRequest: totalRequests > 0 ? Number((totalCost / totalRequests).toFixed(6)) : 0,
        avgTokensPerRequest: totalRequests > 0 ? Math.round(totalTokens / totalRequests) : 0,
        avgCostPerToken: totalTokens > 0 ? Number((totalCost / totalTokens * 1000).toFixed(6)) : 0
      },
      modelBreakdown: Object.entries(modelBreakdown)
        .sort(([,a], [,b]) => b.cost - a.cost)
        .map(([model, data]) => ({ model, ...data })),
      typeBreakdown: Object.entries(typeBreakdown)
        .sort(([,a], [,b]) => b.cost - a.cost)
        .map(([type, data]) => ({ type, ...data })),
      dailyTrends,
      budgetStatus: this.getBudgetStatus(),
      alerts: this.checkBudgetAlerts()
    };
  }

  // Get daily cost trends
  getDailyTrends(days) {
    const trends = [];
    const now = new Date();

    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const dateStr = date.toISOString().split('T')[0];

      const dayUsage = this.usageHistory.filter(u =>
        u.timestamp.startsWith(dateStr)
      );

      const cost = dayUsage.reduce((sum, u) => sum + u.cost, 0);
      const tokens = dayUsage.reduce((sum, u) => sum + u.totalTokens, 0);
      const requests = dayUsage.length;

      trends.push({
        date: dateStr,
        cost: Number(cost.toFixed(6)),
        tokens,
        requests
      });
    }

    return trends;
  }

  // Get budget status
  getBudgetStatus() {
    const today = new Date().toISOString().split('T')[0];
    const thisMonth = new Date().toISOString().slice(0, 7);

    const dailyCost = this.dailyCosts.get(today) || 0;
    const monthlyCost = this.monthlyCosts.get(thisMonth) || 0;

    return {
      daily: {
        spent: Number(dailyCost.toFixed(6)),
        limit: this.budgetAlerts.daily,
        percentage: Math.round((dailyCost / this.budgetAlerts.daily) * 100),
        remaining: Number((this.budgetAlerts.daily - dailyCost).toFixed(6))
      },
      monthly: {
        spent: Number(monthlyCost.toFixed(2)),
        limit: this.budgetAlerts.monthly,
        percentage: Math.round((monthlyCost / this.budgetAlerts.monthly) * 100),
        remaining: Number((this.budgetAlerts.monthly - monthlyCost).toFixed(2))
      }
    };
  }

  // Update budget limits
  updateBudgetLimits(daily, monthly) {
    if (daily && daily > 0) {
      this.budgetAlerts.daily = daily;
    }
    if (monthly && monthly > 0) {
      this.budgetAlerts.monthly = monthly;
    }

    console.log(`📊 Budget limits updated: Daily $${this.budgetAlerts.daily}, Monthly $${this.budgetAlerts.monthly}`);
    return this.budgetAlerts;
  }

  // Get pricing information
  getPricingInfo() {
    return Object.entries(this.pricing).map(([model, pricing]) => ({
      model,
      name: pricing.name,
      inputPrice: pricing.input,
      outputPrice: pricing.output,
      unit: 'per 1K tokens'
    }));
  }

  // Estimate cost for tokens
  estimateCost(model, estimatedInputTokens, estimatedOutputTokens = 0) {
    return {
      model,
      estimatedCost: this.calculateCost(model, estimatedInputTokens, estimatedOutputTokens),
      breakdown: {
        input: {
          tokens: estimatedInputTokens,
          cost: this.calculateInputCost(model, estimatedInputTokens)
        },
        output: {
          tokens: estimatedOutputTokens,
          cost: this.calculateOutputCost(model, estimatedOutputTokens)
        }
      }
    };
  }

  // Get recent expensive requests
  getExpensiveRequests(limit = 10) {
    return this.usageHistory
      .sort((a, b) => b.cost - a.cost)
      .slice(0, limit)
      .map(usage => ({
        ...usage,
        costFormatted: `$${usage.cost.toFixed(6)}`,
        efficiency: usage.totalTokens > 0 ? Number((usage.cost / usage.totalTokens * 1000).toFixed(6)) : 0
      }));
  }
}

module.exports = CostTracker;