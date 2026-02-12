import React, { useState, useEffect } from 'react';
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { TrendingUp, TrendingDown, DollarSign, Plus, X, Edit2, Trash2, Download } from 'lucide-react';

// Types
interface Trade {
  id: string;
  date: string;
  symbol: string;
  direction: 'long' | 'short';
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  pnl: number;
  pnlPercent: number;
  isWin: boolean;
  setup?: string;
  emotion?: string;
  notes?: string;
}

interface TradeFormData {
  date: string;
  symbol: string;
  direction: 'long' | 'short';
  entryPrice: string;
  exitPrice: string;
  quantity: string;
  setup: string;
  emotion: string;
  notes: string;
}

function App() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [showAddTrade, setShowAddTrade] = useState(false);
  const [editingTrade, setEditingTrade] = useState<Trade | null>(null);
  const [activeTab, setActiveTab] = useState('overview');
  
  // Filter states
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'wins' | 'losses'>('all');
  
  const [formData, setFormData] = useState<TradeFormData>({
    date: new Date().toISOString().split('T')[0],
    symbol: '',
    direction: 'long',
    entryPrice: '',
    exitPrice: '',
    quantity: '',
    notes: '',
    setup: '',
    emotion: 'neutral'
  });

  // Load trades from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('trades');
    if (saved) {
      setTrades(JSON.parse(saved));
    }
  }, []);

  // Save trades to localStorage
  useEffect(() => {
    localStorage.setItem('trades', JSON.stringify(trades));
  }, [trades]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const entryPrice = parseFloat(formData.entryPrice);
    const exitPrice = parseFloat(formData.exitPrice);
    const quantity = parseFloat(formData.quantity);
    
    const isLong = formData.direction === 'long';
    const pnl = isLong 
      ? (exitPrice - entryPrice) * quantity 
      : (entryPrice - exitPrice) * quantity;
    
    const pnlPercent = isLong
      ? ((exitPrice - entryPrice) / entryPrice) * 100
      : ((entryPrice - exitPrice) / entryPrice) * 100;

    const trade: Trade = {
      id: editingTrade ? editingTrade.id : Date.now().toString(),
      date: formData.date,
      symbol: formData.symbol,
      direction: formData.direction,
      entryPrice,
      exitPrice,
      quantity,
      pnl,
      pnlPercent,
      isWin: pnl > 0,
      setup: formData.setup,
      emotion: formData.emotion,
      notes: formData.notes
    };

    if (editingTrade) {
      setTrades(trades.map(t => t.id === trade.id ? trade : t));
    } else {
      setTrades([trade, ...trades]);
    }

    resetForm();
  };

  const resetForm = () => {
    setFormData({
      date: new Date().toISOString().split('T')[0],
      symbol: '',
      direction: 'long',
      entryPrice: '',
      exitPrice: '',
      quantity: '',
      notes: '',
      setup: '',
      emotion: 'neutral'
    });
    setShowAddTrade(false);
    setEditingTrade(null);
  };

  const startEdit = (trade: Trade) => {
    setFormData({
      date: trade.date,
      symbol: trade.symbol,
      direction: trade.direction,
      entryPrice: trade.entryPrice.toString(),
      exitPrice: trade.exitPrice.toString(),
      quantity: trade.quantity.toString(),
      notes: trade.notes || '',
      setup: trade.setup || '',
      emotion: trade.emotion || 'neutral'
    });
    setEditingTrade(trade);
    setShowAddTrade(true);
  };

  const deleteTrade = (tradeId: string) => {
    if (confirm('Delete this trade?')) {
      setTrades(trades.filter(t => t.id !== tradeId));
    }
  };

  const exportToCSV = () => {
    if (trades.length === 0) {
      alert('No trades to export!');
      return;
    }

    const headers = ['Date', 'Symbol', 'Direction', 'Entry', 'Exit', 'Quantity', 'P&L', 'P&L %', 'Setup', 'Emotion', 'Notes'];
    
    const rows = trades.map(trade => [
      trade.date,
      trade.symbol,
      trade.direction,
      trade.entryPrice,
      trade.exitPrice,
      trade.quantity,
      trade.pnl.toFixed(2),
      trade.pnlPercent.toFixed(2),
      trade.setup || '',
      trade.emotion || '',
      trade.notes || ''
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `trades_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Filter trades
  const filteredTrades = trades.filter(trade => {
    if (searchTerm && !trade.symbol.toLowerCase().includes(searchTerm.toLowerCase())) {
      return false;
    }
    
    if (dateFrom && trade.date < dateFrom) {
      return false;
    }
    
    if (dateTo && trade.date > dateTo) {
      return false;
    }
    
    if (filterType === 'wins' && !trade.isWin) {
      return false;
    }
    if (filterType === 'losses' && trade.isWin) {
      return false;
    }
    
    return true;
  });

  // Calculate statistics
  const stats = {
    totalTrades: trades.length,
    winningTrades: trades.filter(t => t.isWin).length,
    losingTrades: trades.filter(t => !t.isWin).length,
    totalPnL: trades.reduce((sum, t) => sum + t.pnl, 0),
    avgWin: trades.filter(t => t.isWin).reduce((sum, t) => sum + t.pnl, 0) / (trades.filter(t => t.isWin).length || 1),
    avgLoss: trades.filter(t => !t.isWin).reduce((sum, t) => sum + t.pnl, 0) / (trades.filter(t => !t.isWin).length || 1),
    winRate: trades.length > 0 ? (trades.filter(t => t.isWin).length / trades.length) * 100 : 0
  };

  // Prepare chart data
  const cumulativePnL = trades
    .slice()
    .reverse()
    .reduce((acc: any[], trade, index) => {
      const cumulative = index === 0 ? trade.pnl : acc[index - 1].cumulative + trade.pnl;
      acc.push({
        date: trade.date,
        cumulative,
        trade: trade.pnl
      });
      return acc;
    }, []);

  const monthlyData = trades.reduce((acc: any, trade) => {
    const month = trade.date.substring(0, 7);
    if (!acc[month]) {
      acc[month] = { month, pnl: 0, trades: 0 };
    }
    acc[month].pnl += trade.pnl;
    acc[month].trades += 1;
    return acc;
  }, {});

  const monthlyChart = Object.values(monthlyData).sort((a: any, b: any) => a.month.localeCompare(b.month));

  const winLossData = [
    { name: 'Wins', value: stats.winningTrades, color: '#10b981' },
    { name: 'Losses', value: stats.losingTrades, color: '#ef4444' }
  ];

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Trading Journal Pro</h1>
              <p className="text-gray-600 mt-1">Track your trades and analyze performance</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={exportToCSV}
                className="bg-green-600 text-white px-6 py-3 rounded-lg flex items-center gap-2 hover:bg-green-700 transition-colors"
              >
                <Download size={20} />
                Export CSV
              </button>
              <button
                onClick={() => setShowAddTrade(true)}
                className="bg-blue-600 text-white px-6 py-3 rounded-lg flex items-center gap-2 hover:bg-blue-700 transition-colors"
              >
                <Plus size={20} />
                Add Trade
              </button>
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm">Total P&L</p>
                <p className={`text-2xl font-bold ${stats.totalPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  ${stats.totalPnL.toFixed(2)}
                </p>
              </div>
              <DollarSign className={`${stats.totalPnL >= 0 ? 'text-green-600' : 'text-red-600'}`} size={32} />
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm">Win Rate</p>
                <p className="text-2xl font-bold text-gray-900">{stats.winRate.toFixed(1)}%</p>
              </div>
              <TrendingUp className="text-blue-600" size={32} />
            </div>
            <p className="text-xs text-gray-500 mt-2">{stats.winningTrades}W / {stats.losingTrades}L</p>
          </div>

          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm">Avg Win</p>
                <p className="text-2xl font-bold text-green-600">${stats.avgWin.toFixed(2)}</p>
              </div>
              <TrendingUp className="text-green-600" size={32} />
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm">Avg Loss</p>
                <p className="text-2xl font-bold text-red-600">${stats.avgLoss.toFixed(2)}</p>
              </div>
              <TrendingDown className="text-red-600" size={32} />
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow-sm p-4 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <input
              type="text"
              placeholder="Search symbol..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="From date"
            />
            
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="To date"
            />
            
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as 'all' | 'wins' | 'losses')}
              className="border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Trades</option>
              <option value="wins">Wins Only</option>
              <option value="losses">Losses Only</option>
            </select>
          </div>
          {(searchTerm || dateFrom || dateTo || filterType !== 'all') && (
            <div className="mt-3 flex items-center justify-between">
              <p className="text-sm text-gray-600">
                Showing {filteredTrades.length} of {trades.length} trades
              </p>
              <button
                onClick={() => {
                  setSearchTerm('');
                  setDateFrom('');
                  setDateTo('');
                  setFilterType('all');
                }}
                className="text-sm text-blue-600 hover:underline"
              >
                Clear Filters
              </button>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-lg shadow-sm mb-6">
          <div className="flex border-b">
            <button
              onClick={() => setActiveTab('overview')}
              className={`px-6 py-3 font-medium ${activeTab === 'overview' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-600'}`}
            >
              Overview
            </button>
            <button
              onClick={() => setActiveTab('trades')}
              className={`px-6 py-3 font-medium ${activeTab === 'trades' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-600'}`}
            >
              All Trades ({filteredTrades.length})
            </button>
            <button
              onClick={() => setActiveTab('analytics')}
              className={`px-6 py-3 font-medium ${activeTab === 'analytics' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-600'}`}
            >
              Analytics
            </button>
          </div>

          <div className="p-6">
            {/* Overview Tab */}
            {activeTab === 'overview' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-semibold mb-4">Cumulative P&L</h3>
                  {cumulativePnL.length > 0 ? (
                    <ResponsiveContainer width="100%" height={300}>
                      <LineChart data={cumulativePnL}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="date" />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        <Line type="monotone" dataKey="cumulative" stroke="#3b82f6" strokeWidth={2} name="Cumulative P&L" />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="text-center py-12 text-gray-500">
                      No trades yet. Add your first trade to see your performance!
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div>
                    <h3 className="text-lg font-semibold mb-4">Recent Trades</h3>
                    <div className="space-y-2">
                      {filteredTrades.slice(0, 5).map(trade => (
                        <div key={trade.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                          <div>
                            <p className="font-medium">{trade.symbol}</p>
                            <p className="text-sm text-gray-600">{trade.date}</p>
                          </div>
                          <div className={`text-right ${trade.isWin ? 'text-green-600' : 'text-red-600'}`}>
                            <p className="font-bold">${trade.pnl.toFixed(2)}</p>
                            <p className="text-sm">{trade.pnlPercent.toFixed(2)}%</p>
                          </div>
                        </div>
                      ))}
                      {filteredTrades.length === 0 && (
                        <div className="text-center py-8 text-gray-500">
                          No trades match your filters
                        </div>
                      )}
                    </div>
                  </div>

                  <div>
                    <h3 className="text-lg font-semibold mb-4">Win/Loss Distribution</h3>
                    {stats.totalTrades > 0 ? (
                      <ResponsiveContainer width="100%" height={200}>
                        <PieChart>
                          <Pie
                            data={winLossData}
                            cx="50%"
                            cy="50%"
                            labelLine={false}
                            label={(entry) => `${entry.name}: ${entry.value}`}
                            outerRadius={80}
                            fill="#8884d8"
                            dataKey="value"
                          >
                            {winLossData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip />
                        </PieChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="text-center py-12 text-gray-500">
                        No data to display
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* All Trades Tab */}
            {activeTab === 'trades' && (
              <div>
                {filteredTrades.length === 0 ? (
                  <div className="text-center py-12">
                    <p className="text-gray-600">
                      {trades.length === 0 ? 'No trades recorded yet' : 'No trades match your filters'}
                    </p>
                    {trades.length === 0 && (
                      <button
                        onClick={() => setShowAddTrade(true)}
                        className="mt-4 text-blue-600 hover:text-blue-700"
                      >
                        Add your first trade
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left p-3">Date</th>
                          <th className="text-left p-3">Symbol</th>
                          <th className="text-left p-3">Direction</th>
                          <th className="text-right p-3">Entry</th>
                          <th className="text-right p-3">Exit</th>
                          <th className="text-right p-3">Qty</th>
                          <th className="text-right p-3">P&L</th>
                          <th className="text-right p-3">%</th>
                          <th className="text-right p-3">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredTrades.map(trade => (
                          <tr key={trade.id} className="border-b hover:bg-gray-50 transition-colors">
                            <td className="p-3">{trade.date}</td>
                            <td className="p-3 font-medium">{trade.symbol}</td>
                            <td className="p-3">
                              <span className={`px-2 py-1 rounded text-xs ${trade.direction === 'long' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                {trade.direction.toUpperCase()}
                              </span>
                            </td>
                            <td className="p-3 text-right">${trade.entryPrice.toFixed(2)}</td>
                            <td className="p-3 text-right">${trade.exitPrice.toFixed(2)}</td>
                            <td className="p-3 text-right">{trade.quantity}</td>
                            <td className={`p-3 text-right font-bold ${trade.isWin ? 'text-green-600' : 'text-red-600'}`}>
                              ${trade.pnl.toFixed(2)}
                            </td>
                            <td className={`p-3 text-right ${trade.isWin ? 'text-green-600' : 'text-red-600'}`}>
                              {trade.pnlPercent.toFixed(2)}%
                            </td>
                            <td className="p-3 text-right">
                              <div className="flex justify-end gap-2">
                                <button
                                  onClick={() => startEdit(trade)}
                                  className="text-blue-600 hover:text-blue-700 transition-colors"
                                >
                                  <Edit2 size={16} />
                                </button>
                                <button
                                  onClick={() => deleteTrade(trade.id)}
                                  className="text-red-600 hover:text-red-700 transition-colors"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* Analytics Tab */}
            {activeTab === 'analytics' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-semibold mb-4">Monthly Performance</h3>
                  {monthlyChart.length > 0 ? (
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={monthlyChart}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="month" />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        <Bar dataKey="pnl" fill="#3b82f6" name="P&L" />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="text-center py-12 text-gray-500">
                      No data to display
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-gray-50 rounded-lg p-6">
                    <h4 className="font-semibold mb-4">Performance Metrics</h4>
                    <div className="space-y-3">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Total Trades:</span>
                        <span className="font-medium">{stats.totalTrades}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Win Rate:</span>
                        <span className="font-medium">{stats.winRate.toFixed(1)}%</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Total P&L:</span>
                        <span className={`font-medium ${stats.totalPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          ${stats.totalPnL.toFixed(2)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Profit Factor:</span>
                        <span className="font-medium">
                          {stats.avgLoss !== 0 ? (Math.abs(stats.avgWin / stats.avgLoss)).toFixed(2) : 'N/A'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-gray-50 rounded-lg p-6">
                    <h4 className="font-semibold mb-4">Trade Statistics</h4>
                    <div className="space-y-3">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Average Win:</span>
                        <span className="font-medium text-green-600">${stats.avgWin.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Average Loss:</span>
                        <span className="font-medium text-red-600">${stats.avgLoss.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Winning Trades:</span>
                        <span className="font-medium text-green-600">{stats.winningTrades}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Losing Trades:</span>
                        <span className="font-medium text-red-600">{stats.losingTrades}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="bg-white rounded-lg shadow-sm p-6 text-center">
          <p className="text-gray-600">
            Built with React + TypeScript + Tailwind CSS | 
            <a href="https://github.com" className="text-blue-600 hover:underline ml-2">
              View on GitHub
            </a>
          </p>
        </div>
      </div>

      {/* Add/Edit Trade Modal */}
      {showAddTrade && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold">
                  {editingTrade ? 'Edit Trade' : 'Add New Trade'}
                </h2>
                <button onClick={resetForm} className="text-gray-500 hover:text-gray-700">
                  <X size={24} />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                    <input
                      type="date"
                      value={formData.date}
                      onChange={e => setFormData({...formData, date: e.target.value})}
                      className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Symbol</label>
                    <input
                      type="text"
                      value={formData.symbol}
                      onChange={e => setFormData({...formData, symbol: e.target.value.toUpperCase()})}
                      className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="AAPL"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Direction</label>
                    <select
                      value={formData.direction}
                      onChange={e => setFormData({...formData, direction: e.target.value as 'long' | 'short'})}
                      className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="long">Long</option>
                      <option value="short">Short</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Quantity</label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.quantity}
                      onChange={e => setFormData({...formData, quantity: e.target.value})}
                      className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="100"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Entry Price</label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.entryPrice}
                      onChange={e => setFormData({...formData, entryPrice: e.target.value})}
                      className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="150.00"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Exit Price</label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.exitPrice}
                      onChange={e => setFormData({...formData, exitPrice: e.target.value})}
                      className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="155.00"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Setup/Strategy</label>
                    <input
                      type="text"
                      value={formData.setup}
                      onChange={e => setFormData({...formData, setup: e.target.value})}
                      className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Breakout, VWAP bounce, etc."
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Emotional State</label>
                    <select
                      value={formData.emotion}
                      onChange={e => setFormData({...formData, emotion: e.target.value})}
                      className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="confident">Confident</option>
                      <option value="neutral">Neutral</option>
                      <option value="anxious">Anxious</option>
                      <option value="fomo">FOMO</option>
                      <option value="revenge">Revenge Trading</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                  <textarea
                    value={formData.notes}
                    onChange={e => setFormData({...formData, notes: e.target.value})}
                    className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    rows={4}
                    placeholder="What went well? What could be improved? Market conditions, etc."
                  />
                </div>

                <div className="flex gap-3">
                  <button
                    type="submit"
                    className="flex-1 bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 transition-colors font-medium"
                  >
                    {editingTrade ? 'Update Trade' : 'Add Trade'}
                  </button>
                  <button
                    type="button"
                    onClick={resetForm}
                    className="px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;