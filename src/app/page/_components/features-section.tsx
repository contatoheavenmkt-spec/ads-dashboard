"use client";
import { motion, useInView } from "framer-motion";
import { ArrowDown, CheckCircle2, Plug, Zap } from "lucide-react";
import { useRef, useState, useCallback, useEffect } from "react";

const steps = [
  {
    number: "01",
    title: "Conecte Meta e Google",
    description: "Clique para conectar via login seguro do Facebook e Google. Sem tokens, sem complicação.",
    icon: Plug,
    image: "meta",
    delay: 0,
  },
  {
    number: "02",
    title: "Autorize com 1 clique",
    description: 'O Google e Facebook pedem permissão. Você clica em "Continuar" e pronto. Seus dados estão seguros.',
    icon: CheckCircle2,
    image: "auth",
    delay: 0.15,
  },
];

function StepCard({ step }: { step: (typeof steps)[0] }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.6, delay: step.delay }}
      className="flex flex-col items-center w-full"
    >
      <h3 className="text-base sm:text-lg font-bold text-white mb-3 text-center">{step.title}</h3>
      <div className="relative bg-gradient-to-b from-[#151D2E] to-[#0F172A] border border-gray-800/60 rounded-[1.5rem] overflow-hidden w-full max-w-sm">
        <div className="p-3 sm:p-4">
          <div className="relative rounded-2xl overflow-hidden border border-gray-700/40 bg-[#1A2332]">
            <div className="absolute top-3 right-3 z-10 w-2 h-2 bg-green-500 rounded-full shadow-lg shadow-green-500/40" />
            <div className="absolute top-3 left-3 z-10">
              <span className="text-2xl sm:text-3xl font-black text-white/10">{step.number}</span>
            </div>

            {step.image === "meta" && (
              <div className="flex flex-col items-center justify-center bg-gradient-to-br from-[#1A2332] to-[#0F172A] py-8 sm:py-10 px-6">
                <div className="text-center space-y-3">
                  <div className="w-12 h-12 sm:w-14 sm:h-14 mx-auto rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center">
                    <svg className="w-6 h-6 sm:w-7 sm:h-7 text-blue-500" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 2.04C6.5 2.04 2 6.53 2 12.06C2 17.06 5.66 21.21 10.44 21.96V14.96H7.9V12.06H10.44V9.85C10.44 7.34 11.93 5.96 14.22 5.96C15.31 5.96 16.45 6.15 16.45 6.15V8.62H15.19C13.95 8.62 13.56 9.39 13.56 10.18V12.06H16.34L15.89 14.96H13.56V21.96A10 10 0 0 0 22 12.06C22 6.53 17.5 2.04 12 2.04Z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-white font-bold text-sm sm:text-base">NENHUMA CONTA META<br />CONECTADA</p>
                    <p className="text-gray-500 text-xs mt-1.5">Conecte via OAuth para importar<br />suas contas de anúncio</p>
                  </div>
                  <button className="bg-blue-600 text-white px-5 py-2 rounded-lg font-semibold text-xs sm:text-sm flex items-center gap-1.5 mx-auto">
                    Entrar com Facebook
                  </button>
                </div>
              </div>
            )}

            {step.image === "auth" && (
              <div className="flex flex-col items-center justify-center bg-gradient-to-br from-[#1A2332] to-[#0F172A] py-5 sm:py-8 px-4">
                <div className="bg-[#18181B] rounded-xl p-4 sm:p-5 w-full max-w-xs space-y-3">
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 sm:w-5 sm:h-5" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.06c-.22 1.16-.88 2.14-1.86 2.8v2.33h3.02c1.77-1.63 2.79-4.04 2.79-6.64z" />
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.02-2.33c-.84.57-1.91.91-3.26.91-2.51 0-4.64-1.7-5.4-3.99H3.48v2.4C5.28 20.63 8.41 23 12 23z" />
                      <path fill="#FBBC05" d="M6.6 14.93A5.84 5.84 0 0 1 6.29 13c0-.67.12-1.32.31-1.93V8.67H3.48A9.96 9.96 0 0 0 2 13c0 1.6.38 3.11 1.05 4.44l3.55-2.51z" />
                      <path fill="#EA4335" d="M12 5.38c1.42 0 2.7.49 3.71 1.44l2.78-2.78C16.47 2.43 14.42 1.5 12 1.5 8.41 1.5 5.28 3.87 3.48 7.33l3.12 2.4C7.36 7.08 9.49 5.38 12 5.38z" />
                    </svg>
                    <span className="text-gray-500 text-[10px] sm:text-xs">Fazer Login com o Google</span>
                  </div>
                  <h4 className="text-white text-base sm:text-lg font-bold">Fazer login no serviço</h4>
                  <p className="text-gray-400 text-xs">O Google vai permitir que <span className="text-blue-400 font-semibold">Dashfy</span> acesse informações sobre você</p>
                  <div className="flex gap-2 pt-1">
                    <button className="flex-1 py-1.5 rounded-full border border-gray-700 text-gray-400 text-xs">Cancelar</button>
                    <button className="flex-1 py-1.5 rounded-full bg-blue-500 text-white text-xs font-medium">Continuar</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="px-4 sm:px-5 pb-4 sm:pb-5">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-500/15 border border-blue-500/25 flex items-center justify-center flex-shrink-0">
              <step.icon className="w-4 h-4 text-blue-400" />
            </div>
            <p className="text-gray-400 text-xs sm:text-sm leading-relaxed">{step.description}</p>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function ConnectorLine({ delay = 0 }: { delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-30px" });

  return (
    <div ref={ref} className="flex flex-col items-center py-5 sm:py-6">
      <div className="relative w-0.5 h-16 sm:h-20 bg-gray-800/40 rounded-full overflow-hidden">
        <motion.div
          initial={{ height: 0 }}
          animate={isInView ? { height: "100%" } : { height: 0 }}
          transition={{ duration: 1, delay, ease: "easeInOut" }}
          className="absolute top-0 left-0 w-full bg-gradient-to-b from-blue-500 to-blue-500/50 rounded-full"
        />
      </div>
      <motion.div
        initial={{ opacity: 0, scale: 0 }}
        animate={isInView ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0 }}
        transition={{ duration: 0.3, delay: delay + 0.7 }}
        className="w-7 h-7 rounded-full bg-blue-500/10 border border-blue-500/25 flex items-center justify-center -mt-3.5"
      >
        <ArrowDown className="w-3.5 h-3.5 text-blue-400" />
      </motion.div>
    </div>
  );
}

function BeforeAfterSlider() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [sliderPos, setSliderPos] = useState(50);
  const [isDragging, setIsDragging] = useState(false);

  const handleMove = useCallback((clientX: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const percentage = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
    setSliderPos(percentage);
  }, []);

  const handleMouseDown = useCallback(() => setIsDragging(true), []);
  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => { if (isDragging) handleMove(e.clientX); },
    [isDragging, handleMove]
  );
  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => { if (isDragging) handleMove(e.touches[0].clientX); },
    [isDragging, handleMove]
  );

  useEffect(() => {
    const up = () => setIsDragging(false);
    window.addEventListener("mouseup", up);
    window.addEventListener("touchend", up);
    return () => { window.removeEventListener("mouseup", up); window.removeEventListener("touchend", up); };
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative w-full overflow-hidden rounded-2xl cursor-col-resize select-none"
      onMouseMove={handleMouseMove}
      onMouseDown={handleMouseDown}
      onTouchMove={handleTouchMove}
      onTouchStart={handleMouseDown}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/lp/dashboard-real.png" alt="Depois: Dashboard Dashfy" className="w-full h-auto block rounded-xl" />
      <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - sliderPos}% 0 0)` }}>
        <div className="w-full h-full bg-white rounded-xl">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/lp/google-ads-before.png" alt="Antes: Google Ads" className="w-full h-full object-cover block rounded-xl" />
        </div>
      </div>
      <div className="absolute top-0 bottom-0 z-20" style={{ left: `${sliderPos}%`, transform: "translateX(-50%)" }}>
        <div className="absolute top-0 bottom-0 w-0.5 bg-white/80" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white shadow-xl flex items-center justify-center border-[2.5px] border-white cursor-grab active:cursor-grabbing">
          <div className="flex items-center gap-1">
            <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
            </svg>
            <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </div>
      </div>
      <div className="absolute top-2.5 left-2.5 z-10 bg-red-500/90 backdrop-blur-sm text-white text-[9px] font-bold px-2 py-0.5 rounded-full uppercase">Antes</div>
      <div className="absolute top-2.5 right-2.5 z-10 bg-green-500/90 backdrop-blur-sm text-white text-[9px] font-bold px-2 py-0.5 rounded-full uppercase">Depois</div>
    </div>
  );
}

export function FeaturesSection() {
  return (
    <section id="features" className="relative bg-[#0F172A] py-16 sm:py-20 md:py-24 overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-20 left-1/4 w-72 h-72 sm:w-96 sm:h-96 bg-blue-500/[.08] rounded-full blur-[120px]" />
        <div className="absolute bottom-20 right-1/4 w-72 h-72 sm:w-96 sm:h-96 bg-cyan-500/[.08] rounded-full blur-[120px]" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(59,130,246,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(59,130,246,0.025)_1px,transparent_1px)] bg-[size:64px_64px]" />
      </div>

      <div className="relative">
        <div className="max-w-sm mx-auto px-4 sm:px-6">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-10 sm:mb-14"
          >
            <div className="inline-flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 rounded-full px-5 py-2 mb-5">
              <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
              <span className="text-blue-400 text-sm font-medium">Setup em menos de 2 minutos</span>
            </div>
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-5 leading-tight">
              A Dashfy faz isso por você{" "}
              <span className="bg-gradient-to-r from-blue-400 via-cyan-400 to-blue-400 bg-clip-text text-transparent">
                com poucos cliques
              </span>
            </h2>
            <p className="text-base sm:text-lg text-gray-400 leading-relaxed max-w-xl mx-auto">
              Basta conectar sua conta com login e senha. A Dashfy puxa todos os dados automaticamente.
            </p>
          </motion.div>

          <div className="flex flex-col items-center">
            <StepCard step={steps[0]} />
            <ConnectorLine delay={0.3} />
            <StepCard step={steps[1]} />
            <ConnectorLine delay={0.5} />
          </div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.7 }}
            className="text-center mt-6 mb-6"
          >
            <div className="inline-flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 rounded-full px-4 py-1.5 mb-3">
              <Zap className="w-4 h-4 text-blue-400" />
              <span className="text-blue-400 text-sm font-medium">Resultado instantâneo</span>
            </div>
            <h3 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white leading-tight">
              Sua dashboard pronta em{" "}
              <span className="bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">segundos</span>
            </h3>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, delay: 0.9 }}
          className="mt-4 mb-12"
        >
          <div className="text-center mb-5">
            <div className="inline-flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-4 py-1.5 mb-3">
              <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
              </svg>
              <span className="text-gray-300 text-sm font-medium">Arraste para comparar</span>
            </div>
            <p className="text-base sm:text-lg text-gray-400">
              Veja a diferença entre o Google Ads padrão e a experiência{" "}
              <span className="text-white font-semibold">Dashfy</span>
            </p>
          </div>

          <div className="relative -mr-56 sm:mr-0 px-2 sm:px-4 overflow-hidden">
            <div className="relative mx-auto max-w-6xl rounded-2xl sm:rounded-3xl border border-gray-700/30 p-1.5 sm:p-2 shadow-2xl shadow-black/40">
              <BeforeAfterSlider />
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 1.1 }}
          className="text-center px-4"
        >
          <p className="text-gray-600 mb-4 text-xs">Integração oficial via API • Dados seguros</p>
          <a
            href="#pricing"
            className="group relative inline-flex items-center justify-center gap-2 overflow-hidden rounded-full bg-blue-600 px-8 py-4 text-sm font-bold text-white shadow-2xl shadow-blue-600/20 transition-all duration-300 hover:bg-blue-700 hover:scale-105"
          >
            <span className="relative flex items-center gap-2 uppercase tracking-wide">
              QUERO COMEÇAR AGORA
              <ArrowDown className="w-4 h-4 rotate-[-45deg]" />
            </span>
          </a>
        </motion.div>
      </div>
    </section>
  );
}
