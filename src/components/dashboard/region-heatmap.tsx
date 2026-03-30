"use client";

import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, MapPin } from "lucide-react";

interface RegionData {
  name: string;
  value: number;
}

interface RegionBaseProps {
  data: RegionData[];
  title?: string;
}

// Coordenadas Reais para Leaflet (Latitude, Longitude)
const COORDINATES: Record<string, [number, number]> = {
  "S3o Paulo (state)": [-23.5505, -46.6333],
  "São Paulo": [-23.5505, -46.6333],
  "Kie de janeiro (state)": [-22.9068, -43.1729],
  "Rio de Janeiro": [-22.9068, -43.1729],
  "Minas Gerais": [-19.9167, -43.9345],
  "Pernambuco": [-8.0578, -34.8830],
  "Bahia": [-12.9704, -38.5067],
  "Paraíba": [-7.1195, -34.8450],
  "Alagoas": [-9.6662, -35.7351],
  "Goiás": [-16.6869, -49.2648],
  "Amazonas": [-3.1190, -60.0217],
  "Rio Grande do Norte": [-5.7945, -35.2110],
  "Paraná": [-25.4284, -49.2733],
  "Santa Catarina": [-27.5949, -48.5482],
  "Rio Grande do Sul": [-30.0346, -51.2177],
};

/**
 * COMPONENTE 1: LISTA DE REGIÕES (Apenas a lateral)
 */
export function RegionList({ data, title = "Região (GA4)" }: RegionBaseProps) {
  return (
    <div className="glass-panel rounded-2xl p-6 flex flex-col h-full bg-[#141414]/40 border border-white/5 shadow-2xl relative overflow-hidden">
      <div className="flex justify-between items-baseline mb-8">
        <div className="flex flex-col">
          <h3 className="text-[12px] font-black text-white/50 uppercase tracking-[0.2em] mb-1">{title}</h3>
          <span className="text-[9px] font-bold text-blue-500 uppercase tracking-widest leading-none">Real-time Data</span>
        </div>
        <div className="flex items-center gap-1.5 cursor-pointer hover:text-white transition-all group">
          <span className="text-[11px] font-black text-white/80 uppercase group-hover:text-white">Alcance</span>
          <ChevronDown size={12} className="text-white/40" />
        </div>
      </div>

      <div className="flex-1 space-y-6 overflow-y-auto no-scrollbar pr-1 pb-4">
        {data.length > 0 ? (
          data.map((r, i) => (
            <div key={r.name} className="flex justify-between items-center group/row animate-in fade-in slide-in-from-left-4 duration-500" style={{ animationDelay: `${i * 50}ms` }}>
              <div className="flex items-center gap-3 truncate mr-4">
                <MapPin size={12} className="text-blue-500/50 group-hover/row:text-blue-400 transition-colors" />
                <span className="text-[13px] font-bold text-white/40 group-hover/row:text-white transition-colors leading-tight truncate">
                  {r.name}
                </span>
              </div>
              <span className="text-[15px] font-black text-white tracking-tighter shrink-0">
                {r.value.toLocaleString('pt-BR')}
              </span>
            </div>
          ))
        ) : (
          <div className="h-full flex items-center justify-center">
            <span className="text-[11px] font-bold text-white/10 uppercase tracking-widest">Sem dados regionais</span>
          </div>
        )}
      </div>

      <div className="mt-auto pt-6 border-t border-white/5 flex items-center justify-between">
         <span className="text-[11px] font-medium text-white/20 tracking-widest uppercase">1 - {data.length} / {data.length}</span>
         <div className="flex items-center gap-6">
            <button className="text-white/30 hover:text-white transition-colors text-[14px]">&lt;</button>
            <button className="text-white/30 hover:text-white transition-colors text-[14px]">&gt;</button>
         </div>
      </div>
    </div>
  );
}

/**
 * COMPONENTE 2: MAPA INTERATIVO (Apenas o mapa)
 */
export function RegionMap({ data }: RegionBaseProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const maxVal = Math.max(...data.map(d => d.value), 1);

  const mapRef = useRef<any>(null);

  useEffect(() => {
    if (!document.getElementById("leaflet-css")) {
      const link = document.createElement("link");
      link.id = "leaflet-css";
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(link);
    }

    const initMap = () => {
      if (!mapContainerRef.current || !window.L) return;
      const L = window.L;

      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      mapContainerRef.current.innerHTML = "";

      const map = L.map(mapContainerRef.current, {
        center: [-15.7801, -47.9292], 
        zoom: 4,
        zoomControl: false,
        attributionControl: false,
        scrollWheelZoom: true,
        dragging: true
      });

      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 19
      }).addTo(map);

      // Preparar dados para o Heatlayer: [lat, lon, intensity]
      const heatPoints: [number, number, number][] = [];
      data.forEach((r) => {
        const coords = COORDINATES[r.name] || COORDINATES[r.name.trim()];
        if (coords) {
          const intensity = r.value / maxVal;
          heatPoints.push([coords[0], coords[1], intensity]);
          
          // Adicionar um marcador minimalista de contexto
          const labelIcon = L.divIcon({
            className: 'context-label',
            html: `
              <div style="position: relative; display: flex; flex-col; items-center; justify-content: center;">
                <div style="width: 2px; height: 2px; background: rgba(255,255,255,0.3); border-radius: 50%;"></div>
                <div style="position: absolute; top: 8px; white-space: nowrap; pointer-events: none; opacity: 0.4;">
                   <span style="font-size: 7px; font-weight: 300; color: #fff; text-transform: uppercase; letter-spacing: 0.1em;">
                     ${r.name.split(' (')[0]}
                   </span>
                </div>
              </div>
            `,
            iconSize: [2, 2],
            iconAnchor: [1, 1]
          });
          L.marker(coords, { icon: labelIcon, interactive: false }).addTo(map);
        }
      });

      // Inicializar HeatLayer Oficial (se o plugin estiver carregado)
      if (typeof L.heatLayer === 'function') {
        L.heatLayer(heatPoints, {
          radius: 35,
          blur: 25,
          maxZoom: 10,
          max: 1.0,
          gradient: {
            0.2: '#00ffff', // Cyan
            0.4: '#00ff00', // Green
            0.6: '#ffff00', // Yellow
            0.8: '#ff8000', // Orange
            1.0: '#ff0000'  // Red
          }
        }).addTo(map);
      } else {
        console.warn("Leaflet.heat plugin not ready yet.");
      }

      mapRef.current = map;
      setMapLoaded(true);

      (window as any)._mapAction = (type: string) => {
        if (type === 'in') map.zoomIn();
        if (type === 'out') map.zoomOut();
      };
    };

    // Função para carregar plugin de Heatmap
    const loadHeatmapPlugin = () => {
      if (document.getElementById("leaflet-heat-js")) {
        initMap();
        return;
      }
      const scriptHeat = document.createElement("script");
      scriptHeat.id = "leaflet-heat-js";
      scriptHeat.src = "https://cdn.jsdelivr.net/npm/leaflet.heat@0.2.0/dist/leaflet-heat.js";
      scriptHeat.async = true;
      scriptHeat.onload = initMap;
      document.head.appendChild(scriptHeat);
    };

    if (window.L) {
      loadHeatmapPlugin();
    } else if (!document.getElementById("leaflet-js")) {
      const script = document.createElement("script");
      script.id = "leaflet-js";
      script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
      script.async = true;
      script.onload = loadHeatmapPlugin;
      document.head.appendChild(script);
    }

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [data, maxVal]);

  return (
    <div className="glass-panel rounded-[32px] overflow-hidden border border-white/5 shadow-2xl h-full w-full relative group">
      
      {/* Leaflet Base */}
      <div ref={mapContainerRef} className="w-full h-full grayscale-[0.3] opacity-80" style={{ background: '#0a0a0a' }} />

      {!mapLoaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm z-50">
           <div className="w-8 h-8 border-2 border-white/10 border-t-blue-500 rounded-full animate-spin" />
        </div>
      )}

      {/* HUD Branding */}
      <div className="absolute top-6 right-8 pointer-events-none z-20 flex flex-col items-end">
         <span className="text-[10px] font-black text-white/30 uppercase tracking-[0.4em]">Integrated Geographic Logic</span>
         <div className="w-8 h-0.5 bg-blue-600/40 mt-2 rounded-full" />
      </div>

      <div className="absolute bottom-6 left-8 pointer-events-none z-20">
         <span className="text-[18px] font-black text-white/20 tracking-tighter uppercase drop-shadow-xl">Google Engine</span>
      </div>

      {/* Zoom HUD */}
      <div className="absolute bottom-8 right-8 flex flex-col items-center bg-white/5 backdrop-blur-3xl rounded-[14px] shadow-2xl border border-white/10 overflow-hidden z-30 scale-110">
        <button 
          onClick={() => (window as any)._mapAction?.('in')}
          className="w-11 h-11 hover:bg-white/5 flex items-center justify-center text-white/80 text-[22px] font-extralight border-b border-white/5 transition-all"
        >+</button>
        <button 
          onClick={() => (window as any)._mapAction?.('out')}
          className="w-11 h-11 hover:bg-white/5 flex items-center justify-center text-white/80 text-[22px] font-extralight transition-all"
        >−</button>
      </div>

      {/* Legal HUD */}
      <div className="absolute bottom-3 inset-x-0 flex justify-center pointer-events-none z-20">
         <div className="bg-black/40 backdrop-blur-xl px-4 py-1.5 rounded-lg flex items-center gap-10 border border-white/5">
            <span className="text-[7px] font-bold text-white/20 uppercase tracking-[0.1em]">Geospatial Terrain Active Visualization Unit</span>
            <button className="text-[7px] font-black text-white/40 uppercase tracking-widest pointer-events-auto hover:text-white transition-colors">Termos</button>
         </div>
      </div>
    </div>
  );
}

// Compatibilidade (Mantendo o export padrão se necessário para evitar erros em outros lugares)
export function RegionHeatmap(props: RegionBaseProps) {
    return (
        <div className="flex gap-6 h-full">
            <div className="w-[300px] flex-shrink-0">
                <RegionList {...props} />
            </div>
            <div className="flex-1">
                <RegionMap {...props} />
            </div>
        </div>
    );
}

declare global {
  interface Window {
    L: any;
  }
}
