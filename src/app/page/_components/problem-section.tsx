"use client";
import React, { useState, useEffect } from "react";

export function ProblemSection() {
  const [mouseGradientStyle, setMouseGradientStyle] = useState({
    left: "0px",
    top: "0px",
    opacity: 0,
  });

  useEffect(() => {
    const animateWords = () => {
      const wordElements = document.querySelectorAll(".word-animate-problem");
      wordElements.forEach((word) => {
        const delay = parseInt(word.getAttribute("data-delay") || "0");
        setTimeout(() => {
          (word as HTMLElement).style.animation = "word-appear 0.8s ease-out forwards";
        }, delay);
      });
    };

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            animateWords();
            observer.disconnect();
          }
        });
      },
      { threshold: 0.2 }
    );

    const section = document.getElementById("problem-section");
    if (section) observer.observe(section);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const section = document.getElementById("problem-section");
      if (!section) return;
      const rect = section.getBoundingClientRect();
      if (e.clientY >= rect.top && e.clientY <= rect.bottom) {
        setMouseGradientStyle({ left: `${e.clientX}px`, top: `${e.clientY}px`, opacity: 1 });
      } else {
        setMouseGradientStyle((prev) => ({ ...prev, opacity: 0 }));
      }
    };
    const handleMouseLeave = () =>
      setMouseGradientStyle((prev) => ({ ...prev, opacity: 0 }));
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseleave", handleMouseLeave);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseleave", handleMouseLeave);
    };
  }, []);

  const pageStyles = `
    #mouse-gradient-problem {
      position: fixed; pointer-events: none; border-radius: 9999px;
      background-image: radial-gradient(circle, rgba(239,68,68,.08), rgba(220,38,38,.05), transparent 70%);
      transform: translate(-50%,-50%); will-change: left,top,opacity;
      transition: left 70ms linear, top 70ms linear, opacity 300ms ease-out; z-index: 5;
    }
    @keyframes word-appear {
      0%   { opacity:0; transform:translateY(30px) scale(.8); filter:blur(10px); }
      50%  { opacity:.8; transform:translateY(10px) scale(.95); filter:blur(2px); }
      100% { opacity:1; transform:translateY(0) scale(1); filter:blur(0); }
    }
    @keyframes grid-draw {
      0%   { stroke-dashoffset:1000; opacity:0; }
      50%  { opacity:.15; }
      100% { stroke-dashoffset:0; opacity:.08; }
    }
    @keyframes pulse-glow {
      0%,100% { opacity:.1; transform:scale(1); }
      50%      { opacity:.3; transform:scale(1.1); }
    }
    .word-animate-problem {
      display:inline-block; opacity:0; margin:0 .1em;
      transition:color .3s ease, transform .3s ease;
    }
    .word-animate-problem:hover { color:rgb(248 113 113); transform:translateY(-2px); }
    .grid-line-problem {
      stroke:rgb(239,68,68); stroke-width:.5; opacity:0;
      stroke-dasharray:5 5; stroke-dashoffset:1000; animation:grid-draw 2s ease-out forwards;
    }
    .detail-dot-problem { fill:rgb(239,68,68); opacity:0; animation:pulse-glow 3s ease-in-out infinite; }
    .corner-element-problem {
      position:absolute; width:40px; height:40px;
      border:1px solid rgba(239,68,68,.15); opacity:0;
      animation:word-appear 1s ease-out forwards;
    }
    .text-decoration-problem { position:relative; }
    .text-decoration-problem::after {
      content:''; position:absolute; bottom:-4px; left:50%; transform:translateX(-50%);
      width:0; height:1px;
      background:linear-gradient(90deg,transparent,rgb(239,68,68),transparent);
      animation:underline-grow 2s ease-out forwards; animation-delay:2s;
    }
    @keyframes underline-grow { to { width:100%; } }
  `;

  return (
    <>
      <style>{pageStyles}</style>
      <section
        id="problem-section"
        className="relative bg-[#0F172A] overflow-hidden py-16 sm:py-20 md:py-24"
      >
        <svg className="absolute inset-0 w-full h-full pointer-events-none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
          <defs>
            <pattern id="gridProblem" width="60" height="60" patternUnits="userSpaceOnUse">
              <path d="M 60 0 L 0 0 0 60" fill="none" stroke="rgba(239,68,68,.05)" strokeWidth=".5" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#gridProblem)" />
          <line x1="0" y1="20%" x2="100%" y2="20%" className="grid-line-problem" style={{ animationDelay: ".5s" }} />
          <line x1="0" y1="80%" x2="100%" y2="80%" className="grid-line-problem" style={{ animationDelay: "1s" }} />
          <line x1="20%" y1="0" x2="20%" y2="100%" className="grid-line-problem" style={{ animationDelay: "1.5s" }} />
          <line x1="80%" y1="0" x2="80%" y2="100%" className="grid-line-problem" style={{ animationDelay: "2s" }} />
          <circle cx="20%" cy="20%" r="2" className="detail-dot-problem" style={{ animationDelay: "2.5s" }} />
          <circle cx="80%" cy="20%" r="2" className="detail-dot-problem" style={{ animationDelay: "2.7s" }} />
          <circle cx="20%" cy="80%" r="2" className="detail-dot-problem" style={{ animationDelay: "2.9s" }} />
          <circle cx="80%" cy="80%" r="2" className="detail-dot-problem" style={{ animationDelay: "3.1s" }} />
        </svg>

        <div className="relative z-10 flex flex-col items-center px-6 sm:px-8 md:px-12 max-w-6xl mx-auto">
          <div className="text-center mb-6">
            <h2 className="text-xs sm:text-sm font-semibold uppercase tracking-[.25em] text-red-400/80">
              {["O", "problema", "real."].map((w, i) => (
                <span key={w} className="word-animate-problem" data-delay={String(i * 150)}>{w} </span>
              ))}
            </h2>
            <div className="mt-2 w-10 sm:w-12 h-px bg-gradient-to-r from-transparent via-red-500/40 to-transparent mx-auto" />
          </div>

          <div className="text-center max-w-4xl mx-auto relative">
            <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-semibold leading-snug tracking-tight text-decoration-problem">
              <div className="mb-4">
                {[
                  ["Quanto", 500], ["tempo", 620], ["você", 740], ["perde", 860],
                  ["toda", 980], ["semana", 1100], ["montando", 1220], ["relatórios", 1340],
                ].map(([w, d]) => (
                  <span key={w} className="word-animate-problem" data-delay={String(d)}>{w} </span>
                ))}
                <span className="word-animate-problem text-red-400" data-delay="1460">manualmente?</span>
              </div>
              <div className="text-lg sm:text-xl md:text-2xl font-normal text-muted-foreground leading-relaxed tracking-tight">
                {[
                  ["Exportar", 1650], ["dados,", 1740], ["montar", 1830], ["planilhas,", 1920],
                  ["formatar", 2010], ["gráficos...", 2100], ["toda", 2250], ["semana", 2340],
                  ["a", 2430], ["mesma", 2520], ["coisa.", 2610], ["Seu", 2780],
                  ["cliente", 2870], ["quer", 2960], ["resultados", 3050],
                ].map(([w, d]) => (
                  <span key={w} className="word-animate-problem" data-delay={String(d)}>{w} </span>
                ))}
                <span className="word-animate-problem text-red-400" data-delay="3140">agora, </span>
                {[["e", 3280], ["você", 3370], ["precisa", 3460], ["entregar", 3550], ["sem", 3640], ["virar", 3730], ["escravo", 3820], ["de", 3910]].map(([w, d]) => (
                  <span key={w} className="word-animate-problem" data-delay={String(d)}>{w} </span>
                ))}
                <span className="word-animate-problem text-red-400" data-delay="4000">relatórios.</span>
              </div>
            </h1>
          </div>

          <div className="text-center mt-8">
            <div className="mb-3 w-10 sm:w-12 h-px bg-gradient-to-r from-transparent via-red-500/40 to-transparent mx-auto" />
            <h2 className="text-xs sm:text-sm font-semibold uppercase tracking-[.25em] text-muted-foreground/80">
              {[["Enquanto", 3500], ["isso,", 3680], ["seus", 3860], ["concorrentes", 4000]].map(([w, d]) => (
                <span key={w} className="word-animate-problem" data-delay={String(d)}>{w} </span>
              ))}
              <span className="word-animate-problem text-red-400" data-delay="4140">escalam.</span>
            </h2>
          </div>
        </div>

        <div
          id="mouse-gradient-problem"
          className="w-60 h-60 blur-xl sm:w-80 sm:h-80 sm:blur-2xl md:w-96 md:h-96 md:blur-3xl"
          style={{
            left: mouseGradientStyle.left,
            top: mouseGradientStyle.top,
            opacity: mouseGradientStyle.opacity,
          }}
        />
      </section>
    </>
  );
}
