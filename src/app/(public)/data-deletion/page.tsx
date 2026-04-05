import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Exclusão de Dados – Dashfy",
  description: "Saiba como solicitar a exclusão dos seus dados pessoais e de anúncios na plataforma Dashfy.",
};

const CONTACT_EMAIL = "suporte@dashfys.com.br";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-bold text-white">{title}</h2>
      <div className="text-slate-400 leading-relaxed space-y-3">{children}</div>
    </section>
  );
}

function BulletList({ items }: { items: string[] }) {
  return (
    <ul className="list-none space-y-2">
      {items.map((item) => (
        <li key={item} className="flex gap-2">
          <span className="text-blue-400 mt-0.5 shrink-0">•</span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export default function DataDeletionPage() {
  return (
    <div className="space-y-10">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-3xl font-black text-white">Exclusão de Dados</h1>
        <p className="text-slate-500 text-sm">Dashfy respeita sua privacidade e garante o direito à exclusão dos seus dados.</p>
      </div>

      <div className="bg-slate-900 border border-blue-500/20 rounded-xl px-6 py-4 text-sm text-blue-300">
        A <strong>Dashfy</strong> respeita a privacidade dos usuários e oferece um processo claro para
        solicitação de exclusão de dados. Usuários que conectaram suas contas da{" "}
        <strong>Meta (Facebook/Instagram)</strong> podem solicitar a exclusão de seus dados a qualquer momento.
      </div>

      <Section title="Como solicitar a exclusão">
        <p>Siga os passos abaixo para solicitar a remoção dos seus dados da plataforma:</p>
        <ol className="list-none space-y-3">
          {[
            { step: "1", text: <>Envie um e-mail para: <a href={`mailto:${CONTACT_EMAIL}`} className="text-blue-400 hover:text-blue-300 font-medium">{CONTACT_EMAIL}</a></> },
            { step: "2", text: "Informe o e-mail da sua conta cadastrada na Dashfy" },
            { step: "3", text: "Solicite expressamente a exclusão dos seus dados" },
          ].map(({ step, text }) => (
            <li key={step} className="flex gap-3 items-start">
              <span className="w-6 h-6 rounded-lg bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-[11px] font-black text-blue-400 shrink-0 mt-0.5">
                {step}
              </span>
              <span>{text}</span>
            </li>
          ))}
        </ol>
        <p className="text-slate-300 font-medium">
          Sua solicitação será processada em até <strong className="text-white">7 dias úteis</strong>.
        </p>
      </Section>

      <Section title="Quais dados serão excluídos">
        <BulletList items={[
          "Informações da conta do usuário (nome, e-mail, senha)",
          "Dados de contas de anúncios conectadas (tokens OAuth, credenciais de acesso)",
          "Dados de métricas, relatórios e analytics armazenados em cache",
          "Workspaces e dashboards criados na plataforma",
          "Vínculos com integrações Meta Ads, Google Ads e GA4",
        ]} />
      </Section>

      <Section title="Observações importantes">
        <BulletList items={[
          "Alguns dados podem ser mantidos por obrigação legal (ex.: dados fiscais e de cobrança pelo período exigido por lei)",
          "Após a exclusão, os dados não poderão ser recuperados",
          "A exclusão da sua conta na Dashfy não revoga automaticamente as permissões concedidas no Facebook/Meta — para isso, acesse facebook.com/settings?tab=applications",
        ]} />
      </Section>

      <Section title="Exclusão via painel (alternativa)">
        <p>
          Você também pode desvincular suas contas de anúncios diretamente pelo painel da Dashfy,
          em <strong className="text-slate-200">Integrações → Desconectar</strong>, sem precisar
          entrar em contato com o suporte.
        </p>
        <p>
          Para exclusão completa da conta e todos os dados associados, utilize o processo de
          solicitação por e-mail descrito acima.
        </p>
      </Section>

      {/* CTA visual — preparado para futura implementação de backend */}
      <div className="bg-slate-900 border border-slate-700 rounded-xl px-6 py-6 space-y-4">
        <div className="space-y-1">
          <h3 className="text-sm font-bold text-white">Solicitar exclusão de conta</h3>
          <p className="text-xs text-slate-400">
            Para solicitar a exclusão, envie um e-mail informando seu e-mail cadastrado e o motivo.
          </p>
        </div>
        <a
          href={`mailto:${CONTACT_EMAIL}?subject=Solicitação de Exclusão de Dados&body=Olá, gostaria de solicitar a exclusão dos meus dados da plataforma Dashfy.%0A%0AE-mail da conta: `}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-rose-600/20 hover:bg-rose-600/30 border border-rose-500/30 text-rose-400 hover:text-rose-300 rounded-xl text-sm font-bold transition-all active:scale-95"
        >
          Solicitar exclusão via e-mail
        </a>
      </div>

      <Section title="Contato">
        <div className="bg-slate-900 border border-slate-700 rounded-xl px-5 py-4 text-sm space-y-1">
          <p><strong className="text-slate-200">Dashfy</strong></p>
          <p>
            E-mail:{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-blue-400 hover:text-blue-300">
              {CONTACT_EMAIL}
            </a>
          </p>
          <p>
            Site:{" "}
            <a href="https://dashfys.com.br" className="text-blue-400 hover:text-blue-300">
              dashfys.com.br
            </a>
          </p>
        </div>
      </Section>

      <div className="text-xs text-slate-600 pt-4 border-t border-slate-800 flex flex-wrap gap-4">
        <Link href="/privacy" className="hover:text-slate-400 transition-colors">Política de Privacidade</Link>
        <Link href="/terms" className="hover:text-slate-400 transition-colors">Termos de Uso</Link>
        <Link href="/login" className="hover:text-slate-400 transition-colors">Acessar plataforma</Link>
      </div>
    </div>
  );
}
