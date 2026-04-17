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

// Coordenadas por cidade/estado — cobre nomes em PT e EN retornados pela Meta API
const COORDINATES: Record<string, [number, number]> = {
  // ── Estados ──────────────────────────────────────────────────────────────────
  "São Paulo": [-23.5505, -46.6333], "Sao Paulo": [-23.5505, -46.6333],
  "São Paulo (state)": [-22.0, -48.5], "Sao Paulo State": [-22.0, -48.5],
  "Rio de Janeiro": [-22.9068, -43.1729], "Rio de Janeiro (state)": [-22.5, -43.5],
  "Minas Gerais": [-19.9167, -43.9345],
  "Bahia": [-12.9704, -38.5067],
  "Paraná": [-25.4284, -49.2733], "Parana": [-25.4284, -49.2733],
  "Rio Grande do Sul": [-30.0346, -51.2177],
  "Santa Catarina": [-27.5949, -48.5482],
  "Goiás": [-16.6869, -49.2648], "Goias": [-16.6869, -49.2648],
  "Pernambuco": [-8.0578, -34.8830],
  "Ceará": [-3.7172, -38.5433], "Ceara": [-3.7172, -38.5433],
  "Amazonas": [-3.1190, -60.0217],
  "Pará": [-1.4558, -48.5044], "Para": [-1.4558, -48.5044],
  "Maranhão": [-2.5361, -44.3068], "Maranhao": [-2.5361, -44.3068],
  "Mato Grosso": [-15.5989, -56.0949],
  "Mato Grosso do Sul": [-20.4697, -54.6201],
  "Rio Grande do Norte": [-5.7945, -35.2110],
  "Piauí": [-5.0919, -42.8034], "Piaui": [-5.0919, -42.8034],
  "Alagoas": [-9.6662, -35.7351],
  "Sergipe": [-10.9472, -37.0731],
  "Paraíba": [-7.1195, -34.8450], "Paraiba": [-7.1195, -34.8450],
  "Espírito Santo": [-20.3155, -40.3128], "Espirito Santo": [-20.3155, -40.3128],
  "Rondônia": [-8.7612, -63.9004], "Rondonia": [-8.7612, -63.9004],
  "Roraima": [2.8235, -60.6758],
  "Amapá": [0.0349, -51.0694], "Amapa": [0.0349, -51.0694],
  "Tocantins": [-10.1753, -48.2982],
  "Acre": [-9.9754, -67.8249],
  "Distrito Federal": [-15.7801, -47.9292], "Brasília": [-15.7801, -47.9292], "Brasilia": [-15.7801, -47.9292],

  // ── Pernambuco — região metropolitana ────────────────────────────────────────
  "Recife": [-8.0578, -34.8829],
  "Camaragibe": [-8.0228, -34.9830],
  "Olinda": [-7.9994, -34.8492],
  "Caruaru": [-8.2760, -35.9753],
  "Paulista": [-7.9403, -34.8798],
  "Jaboatão dos Guararapes": [-8.1131, -35.0044],
  "Jaboatao dos Guararapes": [-8.1131, -35.0044],
  "Caboatão dos Guararapes": [-8.1131, -35.0044],
  "São Lourenço da Mata": [-8.0033, -35.0181],
  "Sao Lourenco da Mata": [-8.0033, -35.0181],
  "Abreu e Lima": [-7.9105, -34.8983],
  "Igarassu": [-7.8340, -34.9066],
  "Petrolina": [-9.3879, -40.5000],
  "Garanhuns": [-8.8890, -36.4932],
  "Cabo de Santo Agostinho": [-8.2839, -35.0330],
  "Cabo": [-8.2839, -35.0330],
  "Ipojuca": [-8.3981, -35.0617],
  "Carpina": [-7.8453, -35.2554],
  "Gravatá": [-8.2022, -35.5650],
  "Gravata": [-8.2022, -35.5650],

  // ── Alagoas ──────────────────────────────────────────────────────────────────
  "Maceió": [-9.6658, -35.7350], "Maceio": [-9.6658, -35.7350],
  "Arapiraca": [-9.7528, -36.6614],

  // ── Paraíba ──────────────────────────────────────────────────────────────────
  "João Pessoa": [-7.1195, -34.8450], "Joao Pessoa": [-7.1195, -34.8450],
  "Campina Grande": [-7.2306, -35.8811],

  // ── Rio Grande do Norte ───────────────────────────────────────────────────────
  "Natal": [-5.7945, -35.2110],
  "Mossoró": [-5.1878, -37.3444], "Mossoro": [-5.1878, -37.3444],

  // ── Ceará ─────────────────────────────────────────────────────────────────────
  "Fortaleza": [-3.7319, -38.5267],
  "Caucaia": [-3.7364, -38.6534],
  "Juazeiro do Norte": [-7.2099, -39.3150],

  // ── Bahia ─────────────────────────────────────────────────────────────────────
  "Salvador": [-12.9714, -38.5014],
  "Feira de Santana": [-12.2664, -38.9663],

  // ── São Paulo (cidades) ───────────────────────────────────────────────────────
  "Campinas": [-22.9099, -47.0626],
  "Santos": [-23.9608, -46.3336],
  "Guarulhos": [-23.4543, -46.5338],
  "Osasco": [-23.5324, -46.7920],
  "Ribeirão Preto": [-21.1704, -47.8103],

  // ── Rio de Janeiro (cidades) ──────────────────────────────────────────────────
  "Niterói": [-22.8833, -43.1036], "Niteroi": [-22.8833, -43.1036],
  "Duque de Caxias": [-22.7858, -43.3117],
  "Nova Iguaçu": [-22.7558, -43.4512], "Nova Iguacu": [-22.7558, -43.4512],

  // ── Minas Gerais (cidades) ────────────────────────────────────────────────────
  "Belo Horizonte": [-19.9167, -43.9345],
  "Uberlândia": [-18.9186, -48.2769], "Uberlandia": [-18.9186, -48.2769],

  // ── Sul ───────────────────────────────────────────────────────────────────────
  "Curitiba": [-25.4284, -49.2733],
  "Florianópolis": [-27.5954, -48.5480], "Florianopolis": [-27.5954, -48.5480],
  "Porto Alegre": [-30.0277, -51.2287],

  // ── Centro-Oeste ──────────────────────────────────────────────────────────────
  "Goiânia": [-16.6864, -49.2643], "Goiania": [-16.6864, -49.2643],
  "Campo Grande": [-20.4697, -54.6201],
  "Cuiabá": [-15.5989, -56.0949], "Cuiaba": [-15.5989, -56.0949],
};

/**
 * COMPONENTE 1: LISTA DE REGIÕES (Apenas a lateral)
 */
export function RegionList({ data, title = "Market Reach" }: RegionBaseProps) {
  return (
    <div className="glass-panel rounded-2xl p-6 flex flex-col h-full bg-[#141414]/40 border border-white/5 shadow-2xl relative overflow-hidden">
      <div className="flex justify-between items-baseline mb-8">
        <div className="flex flex-col">
          <h3 className="text-[12px] font-black text-white/50 uppercase tracking-[0.2em] mb-1">{title}</h3>
          <span className="text-[9px] font-bold text-blue-500 uppercase tracking-widest leading-none">Dados em Tempo Real · Por Estado</span>
        </div>
        <div className="flex items-center gap-1.5 cursor-pointer hover:text-white transition-all group">
          <span className="text-[11px] font-black text-white/80 uppercase group-hover:text-white">Alcance por Cidade</span>
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

// Lookup de coordenadas — case-insensitive + fallback por nome parcial
function findCoords(name: string): [number, number] | null {
  if (!name) return null;
  // Tentativa 1: match exato
  if (COORDINATES[name]) return COORDINATES[name];
  // Tentativa 2: case-insensitive
  const lower = name.toLowerCase();
  const exactKey = Object.keys(COORDINATES).find(k => k.toLowerCase() === lower);
  if (exactKey) return COORDINATES[exactKey];
  // Tentativa 3: nome antes da vírgula (ex: "Camaragibe, Pernambuco" → "Camaragibe")
  const beforeComma = name.split(",")[0].trim();
  if (beforeComma !== name) {
    const commaKey = Object.keys(COORDINATES).find(k => k.toLowerCase() === beforeComma.toLowerCase());
    if (commaKey) return COORDINATES[commaKey];
  }
  // Tentativa 4: contém o nome (ex: "São Paulo (state)" → "São Paulo")
  const containsKey = Object.keys(COORDINATES).find(k => lower.includes(k.toLowerCase()) || k.toLowerCase().includes(lower));
  if (containsKey) return COORDINATES[containsKey];
  return null;
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
        const coords = findCoords(r.name);
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
         <span className="text-[10px] font-black text-white/30 uppercase tracking-[0.4em]">Inteligência Geográfica</span>
         <span className="text-[8px] text-white/15 mt-1 normal-case tracking-normal">Dados por estado — limitação da API Meta</span>
         <div className="w-8 h-0.5 bg-blue-600/40 mt-2 rounded-full" />
      </div>

      <div className="absolute bottom-6 left-8 pointer-events-none z-20">
         <span className="text-[18px] font-black text-white/20 tracking-tighter uppercase drop-shadow-xl">Motor de Mapa</span>
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
            <span className="text-[7px] font-bold text-white/20 uppercase tracking-[0.1em]">Visualização Geoespacial Ativa</span>
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
