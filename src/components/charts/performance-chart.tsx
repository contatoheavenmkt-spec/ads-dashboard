"use client";

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  ChartOptions,
  ChartData
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { formatCurrency, formatNumber } from "@/lib/utils";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

interface ChartDataPoint {
  date: string;
  spend: number;
  clicks: number;
  conversions: number;
  impressions: number;
  revenue?: number;
}

interface PerformanceChartProps {
  data: ChartDataPoint[];
  metrics?: Array<"spend" | "clicks" | "conversions" | "impressions" | "revenue">;
  customLabels?: Partial<Record<"spend" | "clicks" | "conversions" | "impressions" | "revenue", string>>;
}

const metricConfig = {
  spend: { label: "Investimento", color: "#3b82f6", format: formatCurrency },
  clicks: { label: "Cliques", color: "#60a5fa", format: formatNumber },
  conversions: { label: "Conversões", color: "#f59e0b", format: formatNumber },
  impressions: { label: "Impressões", color: "#8b5cf6", format: formatNumber },
  revenue: { label: "Faturamento", color: "#10b981", format: formatCurrency },
};

function formatDate(dateStr: string) {
  const parts = dateStr.split("-");
  if (parts.length < 3) return dateStr;
  const [, month, day] = parts;
  return `${day}/${month}`;
}

export function PerformanceChart({
  data,
  metrics = ["spend", "revenue"],
  customLabels,
}: PerformanceChartProps) {
  const labels = data.map((d) => formatDate(d.date));

  const chartData: ChartData<'line'> = {
    labels,
    datasets: metrics.map((metric) => {
      const config = metricConfig[metric];
      return {
        label: config.label,
        data: data.map((d) => (d[metric] ?? 0) as number),
        borderColor: config.color,
        backgroundColor: metric === "revenue" ? `${config.color}0D` : "transparent",
        fill: metric === "revenue",
        tension: 0.4,
        pointRadius: 0,
        pointHoverRadius: 4,
        borderWidth: 2,
      };
    }),
  };

  const options: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index',
      intersect: false,
    },
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        backgroundColor: 'rgba(15, 23, 42, 0.95)',
        titleColor: '#f8fafc',
        bodyColor: '#cbd5e1',
        borderColor: 'rgba(71, 85, 105, 0.5)',
        borderWidth: 1,
        padding: 12,
        boxPadding: 6,
        usePointStyle: true,
        callbacks: {
          label: (context) => {
            const metricKey = metrics[context.datasetIndex];
            const config = metricConfig[metricKey];
            const label = customLabels?.[metricKey] || config.label;
            const value = context.parsed.y;
            return ` ${label}: ${config.format(value ?? 0)}`;
          }
        }
      },
    },
    scales: {
      x: {
        grid: {
          color: 'rgba(71, 85, 105, 0.1)',
          drawTicks: false,
        },
        ticks: {
          color: '#64748b',
          font: { size: 10 },
          maxRotation: 0,
          autoSkip: true,
          maxTicksLimit: 10,
        },
        border: { display: false }
      },
      y: {
        grid: {
          color: 'rgba(71, 85, 105, 0.1)',
          drawTicks: false,
        },
        ticks: {
          color: '#64748b',
          font: { size: 10 },
          callback: (v) => {
            const val = v !== null ? Number(v) : 0;
            if (val >= 1000) return `${(val / 1000).toFixed(0)}k`;
            return val;
          },
        },
        border: { display: false },
        beginAtZero: true,
      },
    },
  };

  return (
    <div className="w-full h-full min-h-[180px]">
      <Line data={chartData} options={options} />
    </div>
  );
}

