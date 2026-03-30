"use client";

import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
  ChartOptions
} from 'chart.js';
import { Doughnut } from 'react-chartjs-2';

ChartJS.register(ArcElement, Tooltip, Legend);

interface Campaign {
  id: string;
  name: string;
  conversions: number;
}

interface TopCampaignsDonutProps {
  campaigns: Campaign[];
  conversionLabel?: string;
}

export function TopCampaignsDonut({ campaigns, conversionLabel = "CONVERSÕES" }: TopCampaignsDonutProps) {
  // Sort and take top 5
  const topCampaigns = [...campaigns]
    .sort((a, b) => b.conversions - a.conversions)
    .slice(0, 7);
  
  const otherConversions = campaigns.length > 7 
    ? campaigns.slice(7).reduce((acc, c) => acc + c.conversions, 0)
    : 0;

  const labels = topCampaigns.map(c => c.name);
  const dataValues = topCampaigns.map(c => c.conversions);

  if (otherConversions > 0) {
    labels.push("Outras");
    dataValues.push(otherConversions);
  }

  const chartData = {
    labels,
    datasets: [
      {
        data: dataValues,
        backgroundColor: [
          '#22d3ee', // cyan-400
          '#3b82f6', // blue-500
          '#6366f1', // indigo-500
          '#a855f7', // purple-500
          '#d946ef', // fuchsia-400
          '#ec4899', // pink-500
          '#f43f5e', // rose-500
          '#475569', // slate-600
        ],
        borderWidth: 0,
        hoverOffset: 12,
        borderRadius: 4,
        spacing: 4,
      },
    ],
  };

  const options: ChartOptions<'doughnut'> = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '70%',
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: 'rgba(15, 23, 42, 0.95)',
        titleColor: '#f8fafc',
        bodyColor: '#cbd5e1',
        borderColor: 'rgba(71, 85, 105, 0.5)',
        borderWidth: 1,
        padding: 10,
        usePointStyle: true,
      },
    },
  };

  return (
    <div className="flex flex-col items-center w-full">
      <div className="w-44 h-44 relative">
        <Doughnut data={chartData} options={options} />
        {/* Center Label */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center">
          <span className="text-[10px] text-slate-500 font-medium uppercase tracking-tighter leading-none">{conversionLabel}</span>
          <span className="text-lg font-bold text-slate-100">
            {campaigns.reduce((acc, c) => acc + c.conversions, 0)}
          </span>
        </div>
      </div>

      {/* Manual Legend */}
      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 w-full">
        {topCampaigns.map((c, i) => (
          <div key={i} className="flex items-center gap-2 min-w-0">
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: chartData.datasets[0].backgroundColor[i] }}
            ></span>
            <span className="text-[9px] text-slate-400 truncate">{c.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
