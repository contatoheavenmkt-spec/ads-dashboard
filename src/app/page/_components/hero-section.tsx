"use client";
import React from "react";
import Link from "next/link";
import { ArrowRight, Menu, X } from "lucide-react";
import { AnimatedGroup } from "./ui/animated-group";
import { cn } from "@/lib/utils";

const transitionVariants = {
  item: {
    hidden: { opacity: 0, filter: "blur(12px)", y: 12 },
    visible: {
      opacity: 1,
      filter: "blur(0px)",
      y: 0,
      transition: { type: "spring", bounce: 0.3, duration: 1.5 },
    },
  },
};

export function HeroSection() {
  return (
    <>
      <HeroHeader />
      <main className="overflow-hidden">
        <div
          aria-hidden
          className="z-[2] absolute inset-0 pointer-events-none isolate opacity-50 contain-strict hidden lg:block"
        >
          <div className="w-[35rem] h-[80rem] -translate-y-[350px] absolute left-0 top-0 -rotate-45 rounded-full bg-[radial-gradient(68.54%_68.72%_at_55.02%_31.46%,hsla(0,0%,85%,.08)_0,hsla(0,0%,55%,.02)_50%,hsla(0,0%,45%,0)_80%)]" />
          <div className="h-[80rem] absolute left-0 top-0 w-56 -rotate-45 rounded-full bg-[radial-gradient(50%_50%_at_50%_50%,hsla(0,0%,85%,.06)_0,hsla(0,0%,45%,.02)_80%,transparent_100%)] [translate:5%_-50%]" />
          <div className="h-[80rem] -translate-y-[350px] absolute left-0 top-0 w-56 -rotate-45 bg-[radial-gradient(50%_50%_at_50%_50%,hsla(0,0%,85%,.04)_0,hsla(0,0%,45%,.02)_80%,transparent_100%)]" />
        </div>

        <section>
          <div className="relative pt-24 md:pt-36">
            <AnimatedGroup
              variants={{
                container: {
                  visible: { transition: { delayChildren: 1 } },
                },
                item: {
                  hidden: { opacity: 0, y: 20 },
                  visible: {
                    opacity: 1,
                    y: 0,
                    transition: { type: "spring", bounce: 0.3, duration: 2 },
                  },
                },
              }}
              className="absolute inset-0 -z-20"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="https://ik.imagekit.io/lrigu76hy/tailark/night-background.jpg?updatedAt=1745733451120"
                alt="background"
                className="absolute inset-x-0 top-56 -z-20 hidden lg:top-32 dark:block"
                width="3276"
                height="4095"
              />
            </AnimatedGroup>

            <div
              aria-hidden
              className="absolute inset-0 -z-10 size-full [background:radial-gradient(125%_125%_at_50%_100%,transparent_0%,var(--background)_75%)]"
            />

            <div className="mx-auto max-w-7xl px-6">
              <div className="text-center sm:mx-auto lg:mr-auto lg:mt-0">
                <AnimatedGroup variants={transitionVariants}>
                  <a
                    href="#pricing"
                    className="hover:bg-background dark:hover:border-t-border bg-muted group mx-auto flex w-fit items-center gap-4 rounded-full border p-1 pl-4 shadow-md shadow-black/5 transition-all duration-300 dark:border-t-white/5 dark:shadow-zinc-950"
                  >
                    <span className="text-foreground text-sm">
                      +400 gestores já automatizaram seus relatórios com o Dashfy
                    </span>
                    <span className="dark:border-background block h-4 w-0.5 border-l bg-white dark:bg-zinc-700" />
                    <div className="bg-background group-hover:bg-muted size-6 overflow-hidden rounded-full duration-500">
                      <div className="flex w-12 -translate-x-1/2 duration-500 ease-in-out group-hover:translate-x-0">
                        <span className="flex size-6">
                          <ArrowRight className="m-auto size-3" />
                        </span>
                        <span className="flex size-6">
                          <ArrowRight className="m-auto size-3" />
                        </span>
                      </div>
                    </div>
                  </a>

                  <h1 className="mt-8 max-w-4xl mx-auto text-balance text-4xl md:text-5xl lg:mt-16 xl:text-6xl font-bold">
                    Economize tempo enviando{" "}
                    <span className="bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
                      relatórios 100% automáticos
                    </span>{" "}
                    de tráfego pago
                  </h1>
                  <p className="mx-auto mt-8 max-w-2xl text-balance text-lg text-gray-300">
                    Não perca mais nenhum segundo do seu dia com relatórios manuais.
                  </p>
                </AnimatedGroup>

                <AnimatedGroup
                  variants={{
                    container: {
                      visible: {
                        transition: { staggerChildren: 0.05, delayChildren: 0.75 },
                      },
                    },
                    ...transitionVariants,
                  }}
                  className="mt-12 flex flex-col items-center justify-center gap-4 md:flex-row"
                >
                  <a
                    href="#pricing"
                    className="group relative inline-flex items-center justify-center gap-2 overflow-hidden rounded-full bg-blue-600 px-8 py-4 font-semibold text-white shadow-2xl transition-all duration-300 hover:bg-blue-700 hover:shadow-blue-500/50 hover:scale-105"
                  >
                    <span className="absolute inset-0 bg-gradient-to-r from-blue-400/20 to-blue-600/20 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                    <span className="absolute -inset-1 bg-gradient-to-r from-blue-500 to-blue-700 opacity-30 blur-lg transition-all duration-300 group-hover:opacity-50" />
                    <span className="relative flex items-center gap-2">
                      <ArrowRight className="w-5 h-5" />
                      GARANTIR OFERTA
                    </span>
                  </a>
                  <Link
                    href="/cadastro"
                    className="group relative inline-flex items-center justify-center gap-2 overflow-hidden rounded-full border-2 border-cyan-400/50 bg-transparent px-8 py-4 font-semibold text-cyan-400 transition-all duration-300 hover:border-cyan-400 hover:bg-cyan-400/10 hover:shadow-lg hover:shadow-cyan-400/20 hover:scale-105"
                  >
                    <span className="relative">Testar 7 dias grátis</span>
                  </Link>
                </AnimatedGroup>
              </div>
            </div>

            <AnimatedGroup
              variants={{
                container: {
                  visible: {
                    transition: { staggerChildren: 0.05, delayChildren: 0.75 },
                  },
                },
                ...transitionVariants,
              }}
            >
              <div className="relative -mr-56 mt-8 overflow-hidden px-2 sm:mr-0 sm:mt-12 md:mt-20">
                <div
                  aria-hidden
                  className="bg-gradient-to-b to-background absolute inset-0 z-10 from-transparent from-35%"
                />
                <div className="inset-shadow-2xs ring-background dark:inset-shadow-white/20 bg-background relative mx-auto max-w-6xl overflow-hidden rounded-2xl border p-4 shadow-lg shadow-zinc-950/15 ring-1">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    className="bg-background relative rounded-2xl w-full h-auto object-contain"
                    src="/lp/fb5c8476c8e93960c5fc9aae9744b14fb95d526e.png"
                    alt="Dashfy Dashboard"
                  />
                </div>
              </div>
            </AnimatedGroup>
          </div>
        </section>

        {/* Video Demo Section */}
        <section className="py-24 px-6">
          <div className="mx-auto max-w-6xl">
            <h2 className="text-center text-4xl md:text-5xl font-bold mb-16">
              Veja{" "}
              <span className="bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
                funcionando na prática:
              </span>
            </h2>

            <div className="relative">
              <div className="absolute -top-6 left-8 z-10">
                <div className="bg-gradient-to-r from-blue-500 to-cyan-500 text-white px-6 py-3 rounded-lg font-bold text-lg shadow-lg transform -rotate-2">
                  Dash na Prática
                </div>
              </div>

              <div className="relative rounded-2xl overflow-hidden border border-white/10 shadow-2xl shadow-black/50">
                <div className="aspect-video">
                  <iframe
                    className="w-full h-full"
                    src="https://www.youtube.com/embed/dm1plJPXJ5w?rel=0&modestbranding=1"
                    title="Dashfy na Prática"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                </div>
              </div>

              <div className="mt-12 text-center">
                <a
                  href="#pricing"
                  className="group relative inline-flex items-center justify-center gap-2 overflow-hidden rounded-full bg-blue-600 px-10 py-5 text-lg font-bold text-white shadow-2xl transition-all duration-300 hover:bg-blue-700 hover:shadow-blue-500/50 hover:scale-105"
                >
                  <span className="absolute inset-0 bg-gradient-to-r from-blue-400/20 to-blue-600/20 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                  <span className="absolute -inset-1 bg-gradient-to-r from-blue-500 to-blue-700 opacity-30 blur-xl transition-all duration-300 group-hover:opacity-50" />
                  <span className="relative flex items-center gap-2 uppercase tracking-wide">
                    É ISSO QUE EU PRECISO
                    <ArrowRight className="w-6 h-6" />
                  </span>
                </a>
              </div>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}

const menuItems = [
  { name: "Recursos", href: "#features" },
  { name: "Preços", href: "#pricing" },
  { name: "FAQ", href: "#faq" },
];

function HeroHeader() {
  const [menuState, setMenuState] = React.useState(false);
  const [isScrolled, setIsScrolled] = React.useState(false);

  React.useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 50);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <header>
      <nav
        data-state={menuState ? "active" : undefined}
        className="fixed z-20 w-full px-2 group"
      >
        <div
          className={cn(
            "mx-auto mt-2 max-w-6xl px-6 transition-all duration-300 lg:px-12",
            isScrolled &&
              "bg-background/50 max-w-4xl rounded-2xl border backdrop-blur-lg lg:px-5"
          )}
        >
          <div className="relative flex flex-wrap items-center justify-between gap-6 py-3 lg:gap-0 lg:py-4">
            <div className="flex w-full justify-between lg:w-auto">
              <Link href="/page" aria-label="home" className="flex items-center space-x-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/lp/d50c50aac271cbe6e044e66df6490d9529d486a9.png"
                  alt="Dashfy"
                  className="h-8 w-auto"
                />
              </Link>
              <button
                onClick={() => setMenuState(!menuState)}
                aria-label={menuState ? "Fechar menu" : "Abrir menu"}
                className="relative z-20 -m-2.5 -mr-4 block cursor-pointer p-2.5 lg:hidden"
              >
                <Menu
                  className={cn(
                    "m-auto size-6 duration-200",
                    menuState && "scale-0 opacity-0"
                  )}
                />
                <X
                  className={cn(
                    "absolute inset-0 m-auto size-6 duration-200",
                    menuState ? "rotate-0 scale-100 opacity-100" : "-rotate-180 scale-0 opacity-0"
                  )}
                />
              </button>
            </div>

            <div className="absolute inset-0 m-auto hidden size-fit lg:block">
              <ul className="flex gap-8 text-sm">
                {menuItems.map((item) => (
                  <li key={item.name}>
                    <a
                      href={item.href}
                      className="text-muted-foreground hover:text-accent-foreground block duration-150"
                    >
                      {item.name}
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            <div
              className={cn(
                "bg-background mb-6 w-full flex-wrap items-center justify-end space-y-8 rounded-3xl border p-6 shadow-2xl shadow-zinc-300/20 md:flex-nowrap lg:m-0 lg:flex lg:w-fit lg:gap-6 lg:space-y-0 lg:border-transparent lg:bg-transparent lg:p-0 lg:shadow-none dark:shadow-none dark:lg:bg-transparent",
                menuState ? "flex" : "hidden lg:flex"
              )}
            >
              <div className="lg:hidden">
                <ul className="space-y-6 text-base">
                  {menuItems.map((item) => (
                    <li key={item.name}>
                      <a
                        href={item.href}
                        className="text-muted-foreground hover:text-accent-foreground block duration-150"
                        onClick={() => setMenuState(false)}
                      >
                        {item.name}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="flex w-full flex-col space-y-3 sm:flex-row sm:gap-3 sm:space-y-0 md:w-fit">
                <Link
                  href="/login"
                  className={cn(
                    "inline-flex items-center justify-center rounded-md border border-slate-700 px-4 py-2 text-sm font-medium text-slate-300 transition hover:bg-slate-800",
                    isScrolled && "lg:hidden"
                  )}
                >
                  Login
                </Link>
                <Link
                  href="/cadastro"
                  className={cn(
                    "inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700",
                    isScrolled && "lg:hidden"
                  )}
                >
                  Começar agora
                </Link>
                <Link
                  href="/cadastro"
                  className={cn(
                    "hidden items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700",
                    isScrolled ? "lg:inline-flex" : "hidden"
                  )}
                >
                  Começar agora
                </Link>
              </div>
            </div>
          </div>
        </div>
      </nav>
    </header>
  );
}
