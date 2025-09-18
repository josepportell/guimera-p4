/**
 * Power-Admin Agent Monitoring System
 * Secret URL: ?agent_monitor=guimera_power_admin_2024
 */

class AgentMonitor {
  constructor() {
    this.agents = new Map();
    this.metrics = {
      totalQueries: 0,
      averageResponseTime: 0,
      errorRate: 0,
      activeAgents: 0,
      lastQuery: null
    };
    this.queryHistory = [];
    this.maxHistory = 100;
  }

  // Track agent creation
  registerAgent(agentId, type, capabilities = []) {
    this.agents.set(agentId, {
      id: agentId,
      type: type,
      capabilities: capabilities,
      status: 'idle',
      createdAt: new Date(),
      lastUsed: null,
      queryCount: 0,
      averageTime: 0,
      errors: 0,
      currentTask: null
    });

    this.updateMetrics();
    console.log(`🤖 Agent registered: ${agentId} (${type})`);
  }

  // Track query start
  startQuery(agentId, query, context = {}) {
    const agent = this.agents.get(agentId);
    if (!agent) {
      console.warn(`⚠️ Unknown agent: ${agentId}`);
      return null;
    }

    const queryId = `${agentId}-${Date.now()}`;
    const queryRecord = {
      id: queryId,
      agentId: agentId,
      query: query,
      context: context,
      startTime: new Date(),
      endTime: null,
      duration: null,
      status: 'processing',
      result: null,
      error: null,
      steps: []
    };

    agent.status = 'busy';
    agent.currentTask = query;
    agent.lastUsed = new Date();

    // Add to history
    this.queryHistory.unshift(queryRecord);
    if (this.queryHistory.length > this.maxHistory) {
      this.queryHistory.pop();
    }

    this.updateMetrics();
    console.log(`🔄 Query started: ${queryId} - "${query.substring(0, 50)}..."`);

    return queryId;
  }

  // Track query step
  addStep(queryId, step, data = {}) {
    const query = this.queryHistory.find(q => q.id === queryId);
    if (!query) return;

    query.steps.push({
      step: step,
      timestamp: new Date(),
      data: data
    });

    console.log(`📝 Step added to ${queryId}: ${step}`);
  }

  // Track query completion
  completeQuery(queryId, result, error = null) {
    const query = this.queryHistory.find(q => q.id === queryId);
    if (!query) return;

    const agent = this.agents.get(query.agentId);
    if (!agent) return;

    query.endTime = new Date();
    query.duration = query.endTime - query.startTime;
    query.status = error ? 'error' : 'completed';
    query.result = result;
    query.error = error;

    agent.status = 'idle';
    agent.currentTask = null;
    agent.queryCount++;

    // Update agent average time
    if (!error) {
      agent.averageTime = ((agent.averageTime * (agent.queryCount - 1)) + query.duration) / agent.queryCount;
    } else {
      agent.errors++;
    }

    this.updateMetrics();
    console.log(`✅ Query completed: ${queryId} (${query.duration}ms)`);
  }

  // Update global metrics
  updateMetrics() {
    const allQueries = this.queryHistory.filter(q => q.status !== 'processing');
    const completedQueries = allQueries.filter(q => q.status === 'completed');
    const errorQueries = allQueries.filter(q => q.status === 'error');

    this.metrics = {
      totalQueries: allQueries.length,
      averageResponseTime: completedQueries.length > 0 ?
        completedQueries.reduce((sum, q) => sum + q.duration, 0) / completedQueries.length : 0,
      errorRate: allQueries.length > 0 ? (errorQueries.length / allQueries.length) * 100 : 0,
      activeAgents: Array.from(this.agents.values()).filter(a => a.status === 'busy').length,
      lastQuery: this.queryHistory[0] || null
    };
  }

  // Get monitoring dashboard data
  getDashboardData() {
    return {
      timestamp: new Date(),
      metrics: this.metrics,
      agents: Array.from(this.agents.values()).map(agent => ({
        ...agent,
        uptime: Date.now() - agent.createdAt.getTime()
      })),
      recentQueries: this.queryHistory.slice(0, 20),
      systemInfo: {
        nodeVersion: process.version,
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage(),
        platform: process.platform
      }
    };
  }

  // Get agent performance stats
  getAgentStats(agentId) {
    const agent = this.agents.get(agentId);
    if (!agent) return null;

    const agentQueries = this.queryHistory.filter(q => q.agentId === agentId);
    const completedQueries = agentQueries.filter(q => q.status === 'completed');

    return {
      ...agent,
      totalQueries: agentQueries.length,
      completedQueries: completedQueries.length,
      errorQueries: agentQueries.filter(q => q.status === 'error').length,
      averageResponseTime: agent.averageTime,
      successRate: agentQueries.length > 0 ?
        (completedQueries.length / agentQueries.length) * 100 : 0,
      recentQueries: agentQueries.slice(0, 10)
    };
  }

  // Export data for analysis
  exportData() {
    return {
      timestamp: new Date(),
      agents: Array.from(this.agents.values()),
      queryHistory: this.queryHistory,
      metrics: this.metrics
    };
  }

  // Reset monitoring data
  reset() {
    this.agents.clear();
    this.queryHistory = [];
    this.metrics = {
      totalQueries: 0,
      averageResponseTime: 0,
      errorRate: 0,
      activeAgents: 0,
      lastQuery: null
    };
    console.log('🔄 Agent monitor reset');
  }
}

// Global instance
const agentMonitor = new AgentMonitor();

// Register some default monitoring points
agentMonitor.registerAgent('rag-standard', 'RAG Engine', ['vector-search', 'embedding', 'gpt-4']);
agentMonitor.registerAgent('rag-enhanced', 'Enhanced RAG', ['mcp', 'reranking', 'multi-model']);
agentMonitor.registerAgent('mcp-pinecone', 'MCP Pinecone', ['advanced-search', 'reranking', 'cascading']);

module.exports = agentMonitor;