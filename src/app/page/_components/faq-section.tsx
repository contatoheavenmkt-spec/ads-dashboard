"use client";
import { motion } from "framer-motion";
import { Plus, Minus } from "lucide-react";
import { useState } from "react";

const faqs = [
  {
    question: "O desconto de 50% é para sempre ou só no primeiro mês?",
    answer:
      "Para sempre, enquanto você mantiver a assinatura ativa. Quem garantir o plano durante o lançamento trava esse preço definitivamente. Se cancelar e quiser voltar depois, pagará o valor cheio.",
  },
  {
    question: "Qual a diferença entre comprar agora e testar os 7 dias grátis?",
    answer:
      "Quem assinar agora garante 50% de desconto permanente no plano escolhido. Quem optar pelo teste gratuito de 7 dias terá acesso completo à plataforma, mas ao assinar após o teste, pagará o valor cheio. O desconto de lançamento não se aplica após o período de teste.",
  },
  {
    question: "Como o Dashfy se conecta com Meta Ads, Google Ads e GA4?",
    answer:
      "Através das APIs oficiais de cada plataforma. Você autoriza o acesso com sua conta e os dados são sincronizados automaticamente. Sem planilhas, sem exportação manual. A conexão leva menos de 2 minutos.",
  },
  {
    question: "Preciso saber programar para usar?",
    answer:
      "Não. O Dashfy foi feito para gestores de tráfego, não para desenvolvedores. A configuração inteira leva menos de 10 minutos e não exige nenhum conhecimento técnico.",
  },
  {
    question: "Meu cliente consegue ver os dados diretamente?",
    answer:
      "Sim. Você compartilha um acesso e seu cliente entra com login próprio, vendo apenas os dados da conta dele. Com segurança e sem depender de você para cada consulta.",
  },
  {
    question: "Quantos clientes posso gerenciar em cada plano?",
    answer:
      "O Starter suporta até 3 clientes ativos. O Pro vai até 10 clientes. O Enterprise permite até 30 clientes. Em todos os planos, você pode conectar Meta Ads, Google Ads e GA4 para cada cliente.",
  },
  {
    question: "Posso usar minha marca nos dashboards?",
    answer:
      "Sim. O white label com logo e domínio personalizado está sendo desenvolvido e chega em breve exclusivamente para o plano Enterprise. Você será notificado assim que estiver disponível.",
  },
  {
    question: "Posso cancelar quando quiser?",
    answer:
      "Sim. Sem fidelidade, sem multa, sem burocracia. Cancele a qualquer momento pelo painel com um clique, sem precisar falar com ninguém.",
  },
];

function FAQItem({ question, answer, index }: { question: string; answer: string; index: number }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5, delay: index * 0.1 }}
      className="border border-neutral-800 rounded-2xl bg-gradient-to-br from-neutral-900/50 to-neutral-950/50 backdrop-blur-sm overflow-hidden hover:border-[#165CFE]/30 transition-all"
    >
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full p-6 flex items-start justify-between gap-4 text-left group"
      >
        <span className="text-lg font-semibold text-white group-hover:text-[#165CFE] transition-colors">
          {question}
        </span>
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[#165CFE]/10 flex items-center justify-center group-hover:bg-[#165CFE]/20 transition-all">
          {isOpen ? (
            <Minus className="w-5 h-5 text-[#165CFE]" />
          ) : (
            <Plus className="w-5 h-5 text-[#165CFE]" />
          )}
        </div>
      </button>

      <motion.div
        initial={false}
        animate={{ height: isOpen ? "auto" : 0, opacity: isOpen ? 1 : 0 }}
        transition={{ duration: 0.3, ease: "easeInOut" }}
        className="overflow-hidden"
      >
        <div className="px-6 pb-6 text-gray-400 leading-relaxed">{answer}</div>
      </motion.div>
    </motion.div>
  );
}

export function FAQSection() {
  return (
    <section id="faq" className="relative bg-[#0F172A] py-16 overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,rgba(22,92,254,0.05),transparent_50%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_50%,rgba(22,92,254,0.05),transparent_50%)]" />

      <div className="relative max-w-4xl mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-10"
        >
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-4">
            Perguntas frequentes
          </h2>
          <p className="text-lg text-gray-400">Tudo o que você precisa saber sobre o Dashfy</p>
        </motion.div>

        <div className="space-y-4">
          {faqs.map((faq, index) => (
            <FAQItem key={index} question={faq.question} answer={faq.answer} index={index} />
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.5 }}
          className="mt-16 text-center"
        >
          <p className="text-gray-400 mb-6">Ainda tem dúvidas? Entre em contato com nosso time</p>
          <a
            href="mailto:suporte@dashfys.com.br"
            className="px-8 py-3 bg-gradient-to-r from-[#165CFE] to-[#2d6fff] text-white font-semibold rounded-xl hover:shadow-lg hover:shadow-[#165CFE]/50 transition-all hover:scale-105 inline-block"
          >
            Falar com suporte
          </a>
        </motion.div>
      </div>
    </section>
  );
}
