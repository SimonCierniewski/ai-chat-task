'use client';

import { useState, useEffect } from 'react';
import { AdminHeader } from '@/components/admin/header';
import { Card } from '@/components/ui/card';
import { useRouter } from 'next/navigation';

interface ModelPricing {
  model: string;
  display_name?: string;
  input_per_mtok: number;
  output_per_mtok: number;
  cached_input_per_mtok?: number;
  updated_at?: string;
}

export default function PricingPage() {
  const router = useRouter();
  const [models, setModels] = useState<ModelPricing[]>([]);
  const [originalModels, setOriginalModels] = useState<ModelPricing[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [editingModel, setEditingModel] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  
  // Calculator state
  const [calcModel, setCalcModel] = useState<string>('');
  const [calcInputTokens, setCalcInputTokens] = useState<number>(1000);
  const [calcOutputTokens, setCalcOutputTokens] = useState<number>(500);
  const [calcCost, setCalcCost] = useState<number>(0);

  useEffect(() => {
    fetchPricing();
  }, []);

  useEffect(() => {
    // Check if there are changes
    const changed = JSON.stringify(models) !== JSON.stringify(originalModels);
    setHasChanges(changed);
  }, [models, originalModels]);

  useEffect(() => {
    calculateCost();
  }, [calcModel, calcInputTokens, calcOutputTokens, models]);

  const fetchPricing = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch('/api/pricing');
      
      if (!response.ok) {
        throw new Error('Failed to fetch pricing');
      }

      const data = await response.json();
      setModels(data.models || []);
      setOriginalModels(data.models || []);
      
      if (data.models && data.models.length > 0) {
        setCalcModel(data.models[0].model);
      }
    } catch (err: any) {
      console.error('Error fetching pricing:', err);
      setError(err.message || 'Failed to load pricing');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveAll = async () => {
    try {
      setSaving(true);
      setError(null);
      setSuccessMessage(null);

      const response = await fetch('/api/pricing', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ models }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update pricing');
      }

      setOriginalModels(models);
      setSuccessMessage('Pricing updated successfully! Changes will be reflected in the playground.');
      setEditingModel(null);
      
      // Refresh the page after a delay to show success message
      setTimeout(() => {
        router.refresh();
      }, 2000);
    } catch (err: any) {
      console.error('Error saving pricing:', err);
      setError(err.message || 'Failed to save pricing');
    } finally {
      setSaving(false);
    }
  };

  const handlePriceChange = (model: string, field: keyof ModelPricing, value: string) => {
    const numValue = parseFloat(value) || 0;
    setModels(prev => prev.map(m => 
      m.model === model ? { ...m, [field]: numValue } : m
    ));
  };

  const handleCancel = () => {
    setModels(originalModels);
    setEditingModel(null);
    setError(null);
    setSuccessMessage(null);
  };

  const calculateCost = () => {
    const model = models.find(m => m.model === calcModel);
    if (!model) {
      setCalcCost(0);
      return;
    }

    const inputCost = (calcInputTokens / 1000000) * model.input_per_mtok;
    const outputCost = (calcOutputTokens / 1000000) * model.output_per_mtok;
    setCalcCost(inputCost + outputCost);
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Never';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <>
        <AdminHeader 
          title="Pricing Configuration" 
          subtitle="Manage model pricing for cost calculations"
        />
        <div className="p-8">
          <div className="flex items-center justify-center h-64">
            <div className="text-gray-500">Loading pricing...</div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <AdminHeader 
        title="Pricing Configuration" 
        subtitle="Manage model pricing for cost calculations"
      />
      
      <div className="p-8">
        {/* Notifications */}
        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-md">
            <p className="text-red-700">{error}</p>
          </div>
        )}
        
        {successMessage && (
          <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-md">
            <p className="text-green-700">{successMessage}</p>
          </div>
        )}

        {/* Save/Cancel Bar */}
        {hasChanges && (
          <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-md flex items-center justify-between">
            <p className="text-yellow-800">You have unsaved changes</p>
            <div className="flex gap-2">
              <button
                onClick={handleCancel}
                disabled={saving}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 disabled:bg-gray-100 disabled:text-gray-400"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveAll}
                disabled={saving}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400"
              >
                {saving ? 'Saving...' : 'Save All Changes'}
              </button>
            </div>
          </div>
        )}

        {/* Pricing Table */}
        <Card title="Model Pricing" icon="💳">
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Model
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Input (per M tokens)
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Output (per M tokens)
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Cached Input (per M tokens)
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Last Updated
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {models.map((model) => (
                  <tr key={model.model} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {model.display_name || model.model}
                        </div>
                        <div className="text-xs text-gray-500">
                          {model.model}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {editingModel === model.model ? (
                        <div className="flex items-center">
                          <span className="mr-1">$</span>
                          <input
                            type="number"
                            step="0.001"
                            min="0"
                            value={model.input_per_mtok}
                            onChange={(e) => handlePriceChange(model.model, 'input_per_mtok', e.target.value)}
                            className="w-24 px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                      ) : (
                        `$${model.input_per_mtok.toFixed(4)}`
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {editingModel === model.model ? (
                        <div className="flex items-center">
                          <span className="mr-1">$</span>
                          <input
                            type="number"
                            step="0.001"
                            min="0"
                            value={model.output_per_mtok}
                            onChange={(e) => handlePriceChange(model.model, 'output_per_mtok', e.target.value)}
                            className="w-24 px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                      ) : (
                        `$${model.output_per_mtok.toFixed(4)}`
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {editingModel === model.model ? (
                        <div className="flex items-center">
                          <span className="mr-1">$</span>
                          <input
                            type="number"
                            step="0.001"
                            min="0"
                            value={model.cached_input_per_mtok || ''}
                            onChange={(e) => handlePriceChange(model.model, 'cached_input_per_mtok', e.target.value)}
                            className="w-24 px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder="Optional"
                          />
                        </div>
                      ) : (
                        model.cached_input_per_mtok ? `$${model.cached_input_per_mtok.toFixed(4)}` : '-'
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(model.updated_at)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <button
                        onClick={() => setEditingModel(editingModel === model.model ? null : model.model)}
                        className="text-blue-600 hover:text-blue-900"
                      >
                        {editingModel === model.model ? 'Done' : 'Edit'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {models.length === 0 && !loading && (
              <div className="text-center py-8 text-gray-500">
                No pricing models configured
              </div>
            )}
          </div>
        </Card>

        {/* Cost Calculator */}
        <Card title="Cost Calculator" icon="🧮" className="mt-8">
          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Model
              </label>
              <select 
                value={calcModel}
                onChange={(e) => setCalcModel(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {models.map(m => (
                  <option key={m.model} value={m.model}>
                    {m.display_name || m.model}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Input Tokens
              </label>
              <input
                type="number"
                value={calcInputTokens}
                onChange={(e) => setCalcInputTokens(parseInt(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Output Tokens
              </label>
              <input
                type="number"
                value={calcOutputTokens}
                onChange={(e) => setCalcOutputTokens(parseInt(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div className="mt-4 p-4 bg-blue-50 rounded-md">
            <p className="text-sm text-blue-600">Estimated Cost</p>
            <p className="text-2xl font-bold text-blue-900">
              ${calcCost.toFixed(6)}
            </p>
            <p className="text-xs text-blue-600 mt-1">
              Based on current pricing for {models.find(m => m.model === calcModel)?.display_name || calcModel}
            </p>
          </div>
        </Card>

        {/* Pricing Notes */}
        <Card title="Pricing Notes" icon="📝" className="mt-8">
          <div className="mt-4 space-y-2 text-sm text-gray-600">
            <p>• Pricing is in USD per million tokens (M tokens = 1,000,000 tokens)</p>
            <p>• Changes take effect immediately for new API calls</p>
            <p>• Cached input pricing is optional and applies to context caching features</p>
            <p>• Historical telemetry data retains the pricing at the time of the request</p>
            <p>• Updates are synchronized with the backend API and reflected in the playground</p>
          </div>
        </Card>
      </div>
    </>
  );
}