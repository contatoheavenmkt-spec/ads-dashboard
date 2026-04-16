"use client";
import { motion } from "framer-motion";
import { TrendingUp, Building2, Rocket, Target } from "lucide-react";

const features = [
  {
    title: "Gestores de tráfego",
    icon: TrendingUp,
    description:
      'Entregue dashboards ao vivo para seus clientes e pare de responder "como tá a campanha?" no WhatsApp. Aumente sua autoridade e justifique cobrar mais.',
  },
  {
    title: "Agências digitais",
    icon: Building2,
    description:
      "Escale a operação de relatórios sem contratar mais pessoas. Ganhe tempo, reduza erros e melhore a percepção de valor dos seus serviços.",
  },
  {
    title: "Infoprodutores",
    icon: Rocket,
    description:
      "Acompanhe em tempo real cada etapa do seu funil, do clique ao checkout, e tome decisões de otimização com clareza total.",
  },
  {
    title: "Empreendedores",
    icon: Target,
    description:
      "Você investe em anúncios e quer entender o que funciona. O Dashfy traduz os dados em respostas simples, sem precisar ser expert em métricas.",
  },
];

function AnimatedContainer({
  children,
  className,
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.6, delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function GridFeaturesSection() {
  return (
    <section className="relative py-20 px-6 bg-[#0F172A] overflow-hidden">
      <div className="absolute inset-0 bg-[linear-gradient(rgba(59,130,246,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(59,130,246,0.03)_1px,transparent_1px)] bg-[size:64px_64px] [mask-image:radial-gradient(ellipse_80%_50%_at_50%_50%,black,transparent)]" />
      <div className="relative z-10 mx-auto max-w-7xl">
        <AnimatedContainer className="mb-12 text-center">
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-4">
            Feito para quem gerencia{" "}
            <span className="bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
              tráfego pago de verdade
            </span>
          </h2>
        </AnimatedContainer>

        <AnimatedContainer delay={0.4} className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {features.map((feature, i) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.1 * i }}
              className="flex gap-5 p-6 rounded-2xl border border-white/10 bg-gradient-to-br from-gray-900/50 to-gray-800/30 hover:border-blue-500/30 transition-all"
            >
              <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
                <feature.icon className="w-6 h-6 text-blue-400" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white mb-2">{feature.title}</h3>
                <p className="text-gray-400 text-sm leading-relaxed">{feature.description}</p>
              </div>
            </motion.div>
          ))}
        </AnimatedContainer>
      </div>
    </section>
  );
}
