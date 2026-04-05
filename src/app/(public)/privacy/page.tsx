import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Política de Privacidade — Dashfy",
  description: "Saiba como a Dashfy coleta, usa e protege seus dados pessoais e os dados de anúncios obtidos via integrações com Meta Ads e Google Ads.",
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

export default function PrivacyPage() {
  return (
    <div className="space-y-10">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-3xl font-black text-white">Política de Privacidade</h1>
        <p className="text-slate-500 text-sm">Última atualização: {LAST_UPDATED}</p>
      </div>

      <div className="bg-slate-900 border border-blue-500/20 rounded-xl px-6 py-4 text-sm text-blue-300">
        Esta política descreve como o <strong>{APP_NAME}</strong> coleta, utiliza, armazena e protege
        os dados dos usuários da plataforma, localizada em <strong>{APP_URL}</strong>.
        Ao criar uma conta e utilizar a plataforma, você concorda com os termos descritos aqui.
      </div>

      <Section title="1. Introdução">
        <p>
          O {APP_NAME} é uma plataforma SaaS voltada para agências de marketing digital e
          profissionais de tráfego pago. Ela permite a integração com plataformas de anúncios
          (Meta Ads e Google Ads) e ferramentas de análise (Google Analytics 4), centralizando
          métricas de campanhas em dashboards visuais.
        </p>
        <p>
          Esta Política de Privacidade se aplica a todos os usuários cadastrados na plataforma
          e descreve de forma transparente quais dados são coletados, como são usados e quais
          são os seus direitos.
        </p>
      </Section>

      <Section title="2. Dados coletados">
        <p>Coletamos os seguintes tipos de dados:</p>
        <ul className="space-y-2 list-none">
          {[
            { label: "Dados de cadastro", desc: "Nome, endereço de e-mail e senha (armazenada de forma criptografada via bcrypt)." },
            { label: "Dados de integração OAuth", desc: "Tokens de acesso e refresh tokens fornecidos pelas plataformas Meta e Google, necessários para buscar métricas de anúncios com sua autorização." },
            { label: "Dados de métricas de anúncios", desc: "Informações de desempenho de campanhas (gasto, impressões, cliques, conversões, ROAS) obtidas diretamente via API das plataformas autorizadas." },
            { label: "Dados de uso", desc: "Informações sobre como você utiliza a plataforma, como páginas acessadas e ações realizadas, para melhorar a experiência." },
            { label: "Dados de cobrança", desc: "Processados exclusivamente pelo Stripe. Não armazenamos dados de cartão de crédito em nossos servidores." },
          ].map((item) => (
            <li key={item.label} className="flex gap-2">
              <span className="text-blue-400 mt-0.5 shrink-0">•</span>
              <span><strong className="text-slate-200">{item.label}:</strong> {item.desc}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="3. Integrações com Meta e Google">
        <p>
          A plataforma se integra com o <strong className="text-slate-200">Meta Ads (Facebook/Instagram)</strong> e
          o <strong className="text-slate-200">Google Ads / Google Analytics 4</strong> exclusivamente
          via protocolo OAuth 2.0, o mecanismo oficial e seguro de autorização dessas plataformas.
        </p>
        <p>
          Ao conectar sua conta, você autoriza explicitamente o acesso às métricas e dados de desempenho
          das suas campanhas. Esse acesso é limitado aos escopos necessários para leitura de dados
          (não realizamos publicação de anúncios, nem modificamos configurações das suas contas).
        </p>
        <p>
          Os tokens de acesso são armazenados de forma segura no banco de dados da plataforma e
          associados exclusivamente à sua conta. Nenhum outro usuário tem acesso aos seus tokens
          ou aos seus dados de anúncios.
        </p>
        <p>
          Você pode revogar o acesso a qualquer momento:
        </p>
        <ul className="list-none space-y-1">
          <li className="flex gap-2"><span className="text-blue-400">•</span><span>No painel da Dashfy, em Integrações → Desconectar</span></li>
          <li className="flex gap-2"><span className="text-blue-400">•</span><span>Nas configurações de aplicativos do Facebook: <strong className="text-slate-300">facebook.com/settings?tab=applications</strong></span></li>
          <li className="flex gap-2"><span className="text-blue-400">•</span><span>Nas permissões de conta Google: <strong className="text-slate-300">myaccount.google.com/permissions</strong></span></li>
        </ul>
      </Section>

      <Section title="4. Uso das métricas e dados de anúncios">
        <p>Os dados de métricas coletados via API são utilizados exclusivamente para:</p>
        <ul className="list-none space-y-1">
          {[
            "Exibição nos dashboards da plataforma (gráficos, tabelas, indicadores)",
            "Comparação de desempenho entre períodos e plataformas",
            "Compartilhamento com clientes via workspaces configurados pelo usuário",
            "Cache temporário de métricas (30 minutos) para evitar excesso de requisições às APIs",
          ].map((item) => (
            <li key={item} className="flex gap-2"><span className="text-blue-400">•</span><span>{item}</span></li>
          ))}
        </ul>
        <p>
          Não utilizamos seus dados de anúncios para treinar modelos de inteligência artificial,
          não os compartilhamos com terceiros para fins publicitários e não os vendemos sob nenhuma circunstância.
        </p>
      </Section>

      <Section title="5. Armazenamento e segurança">
        <p>
          Os dados são armazenados em banco de dados PostgreSQL hospedado na <strong className="text-slate-200">Supabase</strong>,
          com acesso restrito e comunicação criptografada (TLS/SSL). As senhas de usuários são
          armazenadas com hash bcrypt e nunca em texto claro.
        </p>
        <p>
          A plataforma utiliza HTTPS em todas as comunicações. Tokens OAuth são armazenados de
          forma isolada por usuário e não são expostos no lado cliente da aplicação.
        </p>
        <p>
          Adotamos boas práticas de segurança, incluindo autenticação via sessão criptografada
          (NextAuth.js), validação de entrada de dados e separação de permissões por perfil de usuário.
        </p>
      </Section>

      <Section title="6. Compartilhamento de dados">
        <p>
          <strong className="text-slate-200">Não vendemos, alugamos ou compartilhamos seus dados pessoais com terceiros</strong> para
          fins comerciais ou publicitários.
        </p>
        <p>
          Compartilhamos dados apenas nas seguintes situações:
        </p>
        <ul className="list-none space-y-1">
          {[
            "Com o Stripe, para processamento de pagamentos de assinatura (apenas dados necessários para cobrança).",
            "Com as APIs da Meta e Google, para buscar métricas das contas autorizadas por você.",
            "Por obrigação legal, caso exigido por autoridade competente.",
          ].map((item) => (
            <li key={item} className="flex gap-2"><span className="text-blue-400">•</span><span>{item}</span></li>
          ))}
        </ul>
      </Section>

      <Section title="7. Direitos do usuário">
        <p>Você tem os seguintes direitos em relação aos seus dados:</p>
        <ul className="list-none space-y-2">
          {[
            { title: "Acesso", desc: "Solicitar informações sobre quais dados temos sobre você." },
            { title: "Correção", desc: "Atualizar dados incorretos ou desatualizados." },
            { title: "Exclusão", desc: "Solicitar a remoção da sua conta e todos os dados associados." },
            { title: "Portabilidade", desc: "Solicitar exportação dos seus dados em formato legível." },
            { title: "Revogação de acesso", desc: "Desconectar integrações OAuth a qualquer momento pelo painel ou pelas plataformas externas." },
          ].map((item) => (
            <li key={item.title} className="flex gap-2">
              <span className="text-blue-400 mt-0.5 shrink-0">•</span>
              <span><strong className="text-slate-200">{item.title}:</strong> {item.desc}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="8. Exclusão de conta e dados">
        <p>
          Para solicitar a exclusão completa da sua conta e de todos os dados associados
          (incluindo tokens OAuth, métricas em cache e informações de integração), entre em
          contato por e-mail: <strong className="text-slate-200">{CONTACT_EMAIL}</strong>.
        </p>
        <p>
          A exclusão será processada em até 7 dias úteis. Dados de cobrança podem ser retidos
          pelo período exigido por lei para fins fiscais.
        </p>
      </Section>

      <Section title="9. Cookies e sessão">
        <p>
          Utilizamos cookies de sessão seguros (httpOnly, secure em produção) para manter
          o estado de autenticação do usuário. Não utilizamos cookies de rastreamento
          publicitário ou serviços de análise de terceiros que coletam dados pessoais.
        </p>
      </Section>

      <Section title="10. Alterações nesta política">
        <p>
          Podemos atualizar esta Política de Privacidade periodicamente. Em caso de alterações
          relevantes, notificaremos os usuários por e-mail cadastrado. A data da última atualização
          está sempre indicada no topo desta página.
        </p>
      </Section>

      <Section title="11. Contato">
        <p>
          Para dúvidas, solicitações ou exercício de direitos previstos nesta política, entre em contato:
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
