import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Termos de Uso — Dashfy",
  description: "Leia os Termos de Uso da Dashfy: regras de utilização da plataforma, responsabilidades do usuário, limitações de serviço e condições de assinatura.",
};

const LAST_UPDATED = "5 de abril de 2026";
const CONTACT_EMAIL = "contato@dashfys.com.br";
const APP_NAME = "Dashfy";
const APP_URL = "https://dashfys.com.br";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-bold text-white">{title}</h2>
      <div className="text-slate-400 leading-relaxed space-y-3">{children}</div>
    </section>
  );
}

export default function TermsPage() {
  return (
    <div className="space-y-10">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-3xl font-black text-white">Termos de Uso</h1>
        <p className="text-slate-500 text-sm">Última atualização: {LAST_UPDATED}</p>
      </div>

      <div className="bg-slate-900 border border-blue-500/20 rounded-xl px-6 py-4 text-sm text-blue-300">
        Ao se cadastrar e utilizar a plataforma <strong>{APP_NAME}</strong> ({APP_URL}),
        você declara ter lido, compreendido e concordado com os termos a seguir.
        Caso não concorde, não utilize a plataforma.
      </div>

      <Section title="1. Objeto da plataforma">
        <p>
          O <strong className="text-slate-200">{APP_NAME}</strong> é uma plataforma SaaS (Software as a Service)
          que oferece dashboards integrados para visualização e análise de métricas de campanhas de
          tráfego pago. A plataforma permite integração com Meta Ads (Facebook/Instagram Ads),
          Google Ads e Google Analytics 4, centralizando dados de desempenho em uma interface unificada.
        </p>
        <p>
          O serviço é destinado a agências de marketing digital, profissionais de tráfego pago e
          empresas que gerenciam campanhas pagas nas plataformas suportadas.
        </p>
      </Section>

      <Section title="2. Cadastro e conta de usuário">
        <p>
          Para utilizar a plataforma, é necessário criar uma conta com e-mail e senha válidos.
          O usuário é responsável por manter a confidencialidade das suas credenciais de acesso
          e por todas as atividades realizadas em sua conta.
        </p>
        <p>
          É vedado compartilhar credenciais de acesso com terceiros não autorizados. Cada conta
          é de uso individual, vinculada ao plano de assinatura contratado.
        </p>
      </Section>

      <Section title="3. Responsabilidades do usuário">
        <p>Ao utilizar a plataforma, o usuário se compromete a:</p>
        <ul className="list-none space-y-2">
          {[
            "Fornecer informações verdadeiras e atualizadas no cadastro.",
            "Utilizar a plataforma apenas para fins legítimos e de acordo com as políticas das plataformas integradas (Meta, Google).",
            "Garantir que possui autorização para conectar as contas de anúncios que integrar à plataforma.",
            "Não utilizar a plataforma para fins fraudulentos, ilegais ou que violem direitos de terceiros.",
            "Não tentar acessar dados de outros usuários ou comprometer a segurança da plataforma.",
            "Manter seus dados de acesso em sigilo e notificar imediatamente em caso de uso não autorizado.",
          ].map((item) => (
            <li key={item} className="flex gap-2">
              <span className="text-blue-400 mt-0.5 shrink-0">•</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="4. Integração com plataformas externas">
        <p>
          O {APP_NAME} integra-se com Meta Ads e Google Ads via OAuth 2.0. Ao conectar suas contas,
          o usuário autoriza explicitamente o acesso de leitura às métricas das campanhas.
        </p>
        <p>
          O usuário é o único responsável pelas campanhas, contas e dados presentes nas plataformas
          externas conectadas. O {APP_NAME} não realiza publicação, edição ou exclusão de anúncios,
          nem altera configurações das contas do usuário nessas plataformas.
        </p>
        <p>
          O funcionamento das integrações depende da disponibilidade e das políticas de API da Meta
          e Google, que podem ser alteradas por essas plataformas sem aviso prévio ao {APP_NAME}.
          Eventuais interrupções nessas APIs não são de responsabilidade da plataforma.
        </p>
      </Section>

      <Section title="5. Planos e pagamentos">
        <p>
          O {APP_NAME} oferece um período de trial gratuito de 7 (sete) dias com acesso completo
          à plataforma. Após o trial, a continuidade do serviço está sujeita à contratação de
          um dos planos pagos disponíveis.
        </p>
        <p>
          Os pagamentos são processados pelo <strong className="text-slate-200">Stripe</strong> e
          cobrados mensalmente, conforme o plano escolhido. O cancelamento pode ser realizado a
          qualquer momento pelo painel de assinatura, sem multas ou fidelidade.
        </p>
        <p>
          O {APP_NAME} reserva-se o direito de ajustar os valores dos planos mediante notificação
          prévia de 30 (trinta) dias por e-mail.
        </p>
      </Section>

      <Section title="6. Limitações de responsabilidade">
        <p>
          O {APP_NAME} é fornecido "no estado em que se encontra" (as is), sem garantias de
          disponibilidade ininterrupta ou ausência de erros.
        </p>
        <p>A plataforma não se responsabiliza por:</p>
        <ul className="list-none space-y-2">
          {[
            "Decisões de negócio tomadas com base nos dados exibidos nos dashboards.",
            "Imprecisões ou atrasos nos dados fornecidos pelas APIs da Meta ou Google.",
            "Perdas diretas ou indiretas decorrentes de interrupções no serviço.",
            "Alterações nas políticas ou APIs das plataformas integradas que afetem o funcionamento.",
            "Acesso não autorizado decorrente de negligência do usuário com suas credenciais.",
          ].map((item) => (
            <li key={item} className="flex gap-2">
              <span className="text-blue-400 mt-0.5 shrink-0">•</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="7. Suspensão e cancelamento">
        <p>
          O {APP_NAME} pode suspender ou encerrar o acesso de usuários que violem estes termos,
          utilizem a plataforma de forma abusiva ou fraudulenta, ou que estejam com pagamentos
          em atraso, sem obrigação de reembolso pelos períodos não utilizados.
        </p>
        <p>
          O usuário pode cancelar sua conta a qualquer momento entrando em contato pelo e-mail
          <strong className="text-slate-200"> {CONTACT_EMAIL}</strong>. Após o cancelamento, os dados
          serão removidos conforme descrito na Política de Privacidade.
        </p>
      </Section>

      <Section title="8. Propriedade intelectual">
        <p>
          Todos os elementos da plataforma — interface, código-fonte, design, logotipos, textos e
          funcionalidades — são de propriedade exclusiva do {APP_NAME} e estão protegidos pelas
          leis de propriedade intelectual aplicáveis.
        </p>
        <p>
          É proibida a reprodução, cópia, modificação ou distribuição de qualquer parte da
          plataforma sem autorização prévia e por escrito.
        </p>
      </Section>

      <Section title="9. Privacidade">
        <p>
          O tratamento de dados pessoais e dados de anúncios está descrito em nossa{" "}
          <a href="/privacy" className="text-blue-400 hover:text-blue-300 underline">Política de Privacidade</a>,
          que complementa estes Termos de Uso e deve ser lida em conjunto.
        </p>
      </Section>

      <Section title="10. Alterações nos termos">
        <p>
          O {APP_NAME} pode alterar estes Termos de Uso a qualquer momento. Alterações relevantes
          serão comunicadas por e-mail com antecedência mínima de 15 (quinze) dias. O uso continuado
          da plataforma após a vigência das alterações implica aceitação dos novos termos.
        </p>
      </Section>

      <Section title="11. Lei aplicável e foro">
        <p>
          Estes Termos de Uso são regidos pelas leis vigentes na República Federativa do Brasil.
          Fica eleito o foro da comarca de domicílio do responsável pela plataforma para dirimir
          quaisquer controvérsias decorrentes deste instrumento.
        </p>
      </Section>

      <Section title="12. Contato">
        <p>
          Para dúvidas, solicitações ou notificações relacionadas a estes Termos de Uso:
        </p>
        <div className="bg-slate-900 border border-slate-700 rounded-xl px-5 py-4 text-sm space-y-1">
          <p><strong className="text-slate-200">{APP_NAME}</strong></p>
          <p>E-mail: <a href={`mailto:${CONTACT_EMAIL}`} className="text-blue-400 hover:text-blue-300">{CONTACT_EMAIL}</a></p>
          <p>Site: <a href={APP_URL} className="text-blue-400 hover:text-blue-300">{APP_URL}</a></p>
        </div>
      </Section>
    </div>
  );
}
