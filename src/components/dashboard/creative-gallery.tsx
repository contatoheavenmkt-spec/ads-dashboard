"use client";

import React from 'react';
import Image from 'next/image';
import { formatNumber } from "@/lib/utils";

interface AdCreative {
  id: string;
  name: string;
  thumbnail: string;
  impressions: number;
  conversions: number;
  status: string;
}

interface CreativeGalleryProps {
  creatives: AdCreative[];
}

export function CreativeGallery({ creatives }: CreativeGalleryProps) {
  return (
    <div className="flex flex-col w-full">
      <div className="flex overflow-x-auto no-scrollbar gap-4 pb-4">
        {creatives.map((ad) => (
          <div key={ad.id} className="flex-shrink-0 w-36 group">
             {/* Ad Name/Label */}
            <div className="text-[10px] font-bold text-slate-500 mb-2 truncate uppercase tracking-tighter">
              {ad.name}
            </div>

            {/* Thumbnail Container */}
            <div className="relative aspect-[3/4] w-full rounded-lg overflow-hidden border border-slate-700/50 group-hover:border-blue-500/50 transition-all shadow-xl">
              <Image 
                src={ad.thumbnail} 
                alt={ad.name}
                fill
                className="object-cover group-hover:scale-110 transition-transform duration-500"
              />
              <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-slate-900 via-slate-900/60 to-transparent"></div>
              
              {/* Overlay Metrics */}
              <div className="absolute bottom-1.5 inset-x-0 px-2 flex justify-between items-end">
                <div className="flex flex-col">
                  <span className="text-[7px] font-bold text-slate-400 uppercase leading-none">Status</span>
                  <span className="text-[8px] font-black text-emerald-500 uppercase">{ad.status}</span>
                </div>
                <div className="flex flex-col items-end">
                   <span className="text-[7px] font-bold text-slate-400 uppercase leading-none">CTR</span>
                   <span className="text-[8px] font-black text-white">4.2%</span>
                </div>
              </div>
            </div>

            {/* Bottom Metrics Table-like */}
            <div className="mt-3 space-y-1.5 px-0.5">
               <div className="flex justify-between items-center bg-slate-800/20 py-1 px-1.5 rounded">
                  <span className="text-[8px] font-bold text-slate-500 uppercase">Impressões</span>
                  <span className="text-[9px] font-black text-white leading-none">{formatNumber(ad.impressions)}</span>
               </div>
               <div className="flex justify-between items-center bg-slate-800/20 py-1 px-1.5 rounded">
                  <span className="text-[8px] font-bold text-slate-500 uppercase">Compras</span>
                  <span className="text-[9px] font-black text-white leading-none">{ad.conversions || "-"}</span>
               </div>
            </div>
          </div>
        ))}
      </div>
      
      {/* Visual Scrollbar Indicator */}
      <div className="w-full h-1 bg-slate-800/30 rounded-full mt-2 relative overflow-hidden">
        <div className="absolute left-0 top-0 h-full w-1/4 bg-blue-500 rounded-full shadow-[0_0_8px_rgba(59,130,246,0.6)]"></div>
      </div>
    </div>
  );
}
