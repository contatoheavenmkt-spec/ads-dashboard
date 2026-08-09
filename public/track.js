/**
 * Dashfys Track — script para o site do cliente.
 *
 * Resolve um problema específico: quando o anúncio leva ao SITE antes do
 * WhatsApp, o gclid chega na URL da página, mas se perde no caminho até o
 * botão de conversa. A venda depois não tem como voltar para a campanha.
 *
 * O que ele faz:
 *  1. Guarda os identificadores de anúncio da URL de chegada (30 dias), para
 *     a pessoa poder navegar pelo site antes de clicar no WhatsApp.
 *  2. Reescreve os links de WhatsApp da página para passarem pelo /r/, já com
 *     esses identificadores junto.
 *  3. Continua fazendo isso para conteúdo que aparece depois (widget flutuante,
 *     popup, página que carrega sozinha).
 *
 * Uso:
 *   <script src="https://dashfys.com.br/track.js" data-track="SEUSLUG" defer></script>
 *
 * Não usa cookie, não coleta dado pessoal, não bloqueia a renderização.
 */
(function () {
  "use strict";

  var script =
    document.currentScript ||
    (function () {
      var todos = document.getElementsByTagName("script");
      for (var i = todos.length - 1; i >= 0; i--) {
        if (todos[i].src && todos[i].src.indexOf("track.js") !== -1) return todos[i];
      }
      return null;
    })();

  var SLUG = script ? script.getAttribute("data-track") : null;
  if (!SLUG) {
    console.warn("[dashfys-track] falta o data-track no script. Nada foi feito.");
    return;
  }

  // A origem sai do próprio src do script: assim o mesmo trecho funciona em
  // qualquer ambiente, sem ninguém precisar editar a URL.
  var BASE = script.src.replace(/\/track\.js.*$/, "");
  var CHAVE = "dashfys_track_origem";
  var VALIDADE_MS = 30 * 24 * 60 * 60 * 1000;

  // Os identificadores que importam para a atribuição. gclid é o do Google;
  // wbraid e gbraid aparecem no lugar dele quando o consentimento limita o
  // rastreio (boa parte do tráfego iOS, PMax e YouTube).
  var PARAMS = [
    "gclid", "wbraid", "gbraid", "fbclid", "ttclid", "msclkid",
    "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term",
    "campaignid", "adgroupid", "creative", "keyword", "matchtype", "device",
  ];

  function lerDaUrl() {
    var busca = window.location.search;
    if (!busca || busca.length < 2) return null;
    var out = {};
    var achou = false;
    try {
      var qs = new URLSearchParams(busca);
      for (var i = 0; i < PARAMS.length; i++) {
        var v = qs.get(PARAMS[i]);
        if (v) {
          out[PARAMS[i]] = String(v).slice(0, 512);
          achou = true;
        }
      }
    } catch (e) {
      return null;
    }
    return achou ? out : null;
  }

  function guardar(dados) {
    try {
      window.localStorage.setItem(
        CHAVE,
        JSON.stringify({ dados: dados, em: Date.now() })
      );
    } catch (e) {
      /* modo privado ou storage cheio: segue sem persistir */
    }
  }

  function recuperar() {
    try {
      var bruto = window.localStorage.getItem(CHAVE);
      if (!bruto) return null;
      var obj = JSON.parse(bruto);
      // Origem velha demais não representa mais a visita atual.
      if (!obj || !obj.em || Date.now() - obj.em > VALIDADE_MS) return null;
      return obj.dados || null;
    } catch (e) {
      return null;
    }
  }

  // Chegou com identificador novo? Ele manda, porque é a visita mais recente.
  var origem = lerDaUrl();
  if (origem) guardar(origem);
  else origem = recuperar();

  function montarUrl() {
    var url = BASE + "/r/" + encodeURIComponent(SLUG);
    if (!origem) return url;
    var partes = [];
    for (var k in origem) {
      if (Object.prototype.hasOwnProperty.call(origem, k) && origem[k]) {
        partes.push(encodeURIComponent(k) + "=" + encodeURIComponent(origem[k]));
      }
    }
    return partes.length ? url + "?" + partes.join("&") : url;
  }

  /** É um link que leva ao WhatsApp (ou já ao nosso redirecionador)? */
  function ehLinkDeWhatsApp(href) {
    if (!href) return false;
    return (
      href.indexOf("wa.me/") !== -1 ||
      href.indexOf("api.whatsapp.com/send") !== -1 ||
      href.indexOf("web.whatsapp.com/send") !== -1 ||
      href.indexOf("whatsapp://send") !== -1 ||
      href.indexOf("/r/" + SLUG) !== -1
    );
  }

  var MARCA = "data-dashfys-track";

  function reescrever(a) {
    if (!a || a.getAttribute(MARCA)) return;
    var href = a.getAttribute("href") || "";
    if (!ehLinkDeWhatsApp(href)) return;
    a.setAttribute(MARCA, "1");
    a.setAttribute("href", montarUrl());
  }

  function varrer(raiz) {
    var alvos = (raiz || document).querySelectorAll(
      'a[href*="wa.me"], a[href*="whatsapp.com/send"], a[href*="whatsapp://send"], a[href*="/r/' + SLUG + '"]'
    );
    for (var i = 0; i < alvos.length; i++) reescrever(alvos[i]);
  }

  function iniciar() {
    varrer(document);

    // Widget flutuante, popup e página que monta sozinha entram depois do
    // load. Sem observar, o botão mais usado do site ficaria de fora.
    if (window.MutationObserver) {
      var obs = new MutationObserver(function (mutacoes) {
        for (var i = 0; i < mutacoes.length; i++) {
          var novos = mutacoes[i].addedNodes;
          for (var j = 0; j < novos.length; j++) {
            if (novos[j].nodeType === 1) {
              if (novos[j].tagName === "A") reescrever(novos[j]);
              else varrer(novos[j]);
            }
          }
        }
      });
      obs.observe(document.documentElement, { childList: true, subtree: true });
    }

    // Rede de segurança para widget que monta o link só no clique: intercepta
    // na fase de captura e corrige antes da navegação acontecer.
    document.addEventListener(
      "click",
      function (ev) {
        var el = ev.target;
        while (el && el !== document.documentElement) {
          if (el.tagName === "A") {
            var href = el.getAttribute("href") || "";
            if (ehLinkDeWhatsApp(href) && !el.getAttribute(MARCA)) {
              el.setAttribute(MARCA, "1");
              el.setAttribute("href", montarUrl());
            }
            return;
          }
          el = el.parentNode;
        }
      },
      true
    );
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", iniciar);
  } else {
    iniciar();
  }

  /**
   * Para formulário ou botão em JavaScript: chame na hora de mandar a pessoa
   * ao WhatsApp, em vez de montar o wa.me na mão.
   *
   *   window.location.href = window.dashfysTrack.url();
   */
  window.dashfysTrack = {
    url: montarUrl,
    origem: function () {
      return origem;
    },
    versao: "1",
  };
})();
