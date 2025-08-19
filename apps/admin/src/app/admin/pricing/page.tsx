'use client';

import { useState } from 'react';
import { AdminHeader } from '@/components/admin/header';
import { Card } from '@/components/ui/card';

interface ModelPricing {
  model: string;
  inputPerMtok: number;
  outputPerMtok: number;
  cachedInputPerMtok?: number;
}

export default function PricingPage() {
  const [models, setModels] = useState<ModelPricing[]>([
    { model: 'gpt-4o-mini', inputPerMtok: 0.15, outputPerMtok: 0.6, cachedInputPerMtok: 0.075 },
    { model: 'gpt-4o', inputPerMtok: 5.0, outputPerMtok: 15.0, cachedInputPerMtok: 2.5 },
    { model: 'gpt-3.5-turbo', inputPerMtok: 0.5, outputPerMtok: 1.5 },
  ]);
  
  const [editingModel, setEditingModel] = useState<string | null>(null);

  const handleSave = (model: string) => {
    console.log('Saving pricing for:', model);
    setEditingModel(null);
    // In production, this would call the API
  };

  const handlePriceChange = (model: string, field: keyof ModelPricing, value: string) => {
    const numValue = parseFloat(value) || 0;
    setModels(prev => prev.map(m => 
      m.model === model ? { ...m, [field]: numValue } : m
    ));
  };

  return (
    <>
      <AdminHeader 
        title="Pricing Configuration" 
        subtitle="Manage model pricing for cost calculations"
      />
      
      <div className="p-8">
        {/* Info Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <Card
            title="Total Models"
            value={models.length}
            description="Configured models"
            icon="🤖"
          />
          <Card
            title="Last Updated"
            value="2 hours ago"
            description="Most recent change"
            icon="🕐"
          />
          <Card
            title="Avg Cost/1K"
            value="$0.0234"
            description="Across all models"
            icon="💰"
          />
        </div>

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
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {models.map((model) => (
                  <tr key={model.model}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {model.model}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {editingModel === model.model ? (
                        <input
                          type="number"
                          step="0.01"
                          value={model.inputPerMtok}
                          onChange={(e) => handlePriceChange(model.model, 'inputPerMtok', e.target.value)}
                          className="w-24 px-2 py-1 border border-gray-300 rounded"
                        />
                      ) : (
                        `$${model.inputPerMtok.toFixed(2)}`
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {editingModel === model.model ? (
                        <input
                          type="number"
                          step="0.01"
                          value={model.outputPerMtok}
                          onChange={(e) => handlePriceChange(model.model, 'outputPerMtok', e.target.value)}
                          className="w-24 px-2 py-1 border border-gray-300 rounded"
                        />
                      ) : (
                        `$${model.outputPerMtok.toFixed(2)}`
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {editingModel === model.model ? (
                        <input
                          type="number"
                          step="0.01"
                          value={model.cachedInputPerMtok || ''}
                          onChange={(e) => handlePriceChange(model.model, 'cachedInputPerMtok', e.target.value)}
                          className="w-24 px-2 py-1 border border-gray-300 rounded"
                          placeholder="Optional"
                        />
                      ) : (
                        model.cachedInputPerMtok ? `$${model.cachedInputPerMtok.toFixed(2)}` : '-'
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      {editingModel === model.model ? (
                        <>
                          <button
                            onClick={() => handleSave(model.model)}
                            className="text-green-600 hover:text-green-900 mr-3"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => setEditingModel(null)}
                            className="text-gray-600 hover:text-gray-900"
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => setEditingModel(model.model)}
                          className="text-blue-600 hover:text-blue-900"
                        >
                          Edit
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Cost Calculator */}
        <Card title="Cost Calculator" icon="🧮" className="mt-8">
          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Model
              </label>
              <select className="w-full px-3 py-2 border border-gray-300 rounded-md">
                {models.map(m => (
                  <option key={m.model} value={m.model}>{m.model}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Input Tokens
              </label>
              <input
                type="number"
                placeholder="1000"
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Output Tokens
              </label>
              <input
                type="number"
                placeholder="500"
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
          </div>
          <div className="mt-4 p-4 bg-blue-50 rounded-md">
            <p className="text-sm text-blue-600">Estimated Cost</p>
            <p className="text-2xl font-bold text-blue-900">$0.0234</p>
          </div>
        </Card>
      </div>
    </>
  );
}