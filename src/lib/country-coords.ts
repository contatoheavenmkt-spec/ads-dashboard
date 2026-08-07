/**
 * Tabela estática ISO-2 -> coordenada (centroide aproximado) + nome em português.
 * Usada pelo mapa-múndi do admin para posicionar os pontos de PageView/ActiveSession.
 *
 * Arquivo puramente estático: sem imports, sem banco, sem side effects — seguro
 * tanto em Server Components quanto em client components.
 *
 * Precisão: ~1 grau. É centroide "visual" (onde o ponto fica bonito dentro do país),
 * não centroide geométrico exato — suficiente para um marcador de alguns pixels.
 */

export interface PaisCoord {
  code: string;
  nome: string;
  lat: number;
  lng: number;
}

export const PAISES: Record<string, PaisCoord> = {
  // ---------- América do Sul ----------
  BR: { code: "BR", nome: "Brasil", lat: -10.0, lng: -53.0 },
  AR: { code: "AR", nome: "Argentina", lat: -34.0, lng: -64.0 },
  CL: { code: "CL", nome: "Chile", lat: -35.7, lng: -71.3 },
  CO: { code: "CO", nome: "Colômbia", lat: 4.0, lng: -73.0 },
  PE: { code: "PE", nome: "Peru", lat: -9.2, lng: -75.0 },
  VE: { code: "VE", nome: "Venezuela", lat: 7.0, lng: -66.0 },
  EC: { code: "EC", nome: "Equador", lat: -1.5, lng: -78.5 },
  BO: { code: "BO", nome: "Bolívia", lat: -16.5, lng: -64.5 },
  PY: { code: "PY", nome: "Paraguai", lat: -23.3, lng: -58.0 },
  UY: { code: "UY", nome: "Uruguai", lat: -32.8, lng: -55.8 },
  GY: { code: "GY", nome: "Guiana", lat: 5.0, lng: -58.9 },
  SR: { code: "SR", nome: "Suriname", lat: 4.0, lng: -56.0 },
  GF: { code: "GF", nome: "Guiana Francesa", lat: 4.0, lng: -53.0 },

  // ---------- América do Norte e Central ----------
  US: { code: "US", nome: "Estados Unidos", lat: 39.5, lng: -98.5 },
  CA: { code: "CA", nome: "Canadá", lat: 56.0, lng: -106.0 },
  MX: { code: "MX", nome: "México", lat: 23.5, lng: -102.5 },
  GT: { code: "GT", nome: "Guatemala", lat: 15.7, lng: -90.4 },
  BZ: { code: "BZ", nome: "Belize", lat: 17.2, lng: -88.7 },
  SV: { code: "SV", nome: "El Salvador", lat: 13.8, lng: -88.9 },
  HN: { code: "HN", nome: "Honduras", lat: 15.0, lng: -86.5 },
  NI: { code: "NI", nome: "Nicarágua", lat: 12.9, lng: -85.2 },
  CR: { code: "CR", nome: "Costa Rica", lat: 9.9, lng: -84.0 },
  PA: { code: "PA", nome: "Panamá", lat: 8.5, lng: -80.1 },
  CU: { code: "CU", nome: "Cuba", lat: 21.5, lng: -79.5 },
  DO: { code: "DO", nome: "República Dominicana", lat: 18.7, lng: -70.2 },
  HT: { code: "HT", nome: "Haiti", lat: 19.0, lng: -72.5 },
  JM: { code: "JM", nome: "Jamaica", lat: 18.1, lng: -77.3 },
  PR: { code: "PR", nome: "Porto Rico", lat: 18.2, lng: -66.5 },
  TT: { code: "TT", nome: "Trinidad e Tobago", lat: 10.5, lng: -61.3 },
  BS: { code: "BS", nome: "Bahamas", lat: 24.5, lng: -77.5 },

  // ---------- Europa ----------
  PT: { code: "PT", nome: "Portugal", lat: 39.5, lng: -8.0 },
  ES: { code: "ES", nome: "Espanha", lat: 40.2, lng: -3.7 },
  FR: { code: "FR", nome: "França", lat: 46.6, lng: 2.4 },
  DE: { code: "DE", nome: "Alemanha", lat: 51.2, lng: 10.4 },
  IT: { code: "IT", nome: "Itália", lat: 42.8, lng: 12.8 },
  GB: { code: "GB", nome: "Reino Unido", lat: 54.0, lng: -2.5 },
  IE: { code: "IE", nome: "Irlanda", lat: 53.2, lng: -8.0 },
  NL: { code: "NL", nome: "Países Baixos", lat: 52.2, lng: 5.5 },
  BE: { code: "BE", nome: "Bélgica", lat: 50.6, lng: 4.6 },
  LU: { code: "LU", nome: "Luxemburgo", lat: 49.8, lng: 6.1 },
  CH: { code: "CH", nome: "Suíça", lat: 46.8, lng: 8.2 },
  AT: { code: "AT", nome: "Áustria", lat: 47.6, lng: 14.1 },
  PL: { code: "PL", nome: "Polônia", lat: 52.0, lng: 19.4 },
  CZ: { code: "CZ", nome: "Tchéquia", lat: 49.8, lng: 15.5 },
  SK: { code: "SK", nome: "Eslováquia", lat: 48.7, lng: 19.5 },
  HU: { code: "HU", nome: "Hungria", lat: 47.2, lng: 19.4 },
  RO: { code: "RO", nome: "Romênia", lat: 45.9, lng: 25.0 },
  BG: { code: "BG", nome: "Bulgária", lat: 42.7, lng: 25.3 },
  GR: { code: "GR", nome: "Grécia", lat: 39.1, lng: 22.5 },
  HR: { code: "HR", nome: "Croácia", lat: 45.1, lng: 16.4 },
  RS: { code: "RS", nome: "Sérvia", lat: 44.2, lng: 20.8 },
  BA: { code: "BA", nome: "Bósnia e Herzegovina", lat: 44.0, lng: 17.8 },
  SI: { code: "SI", nome: "Eslovênia", lat: 46.1, lng: 14.8 },
  MK: { code: "MK", nome: "Macedônia do Norte", lat: 41.6, lng: 21.7 },
  AL: { code: "AL", nome: "Albânia", lat: 41.1, lng: 20.1 },
  ME: { code: "ME", nome: "Montenegro", lat: 42.8, lng: 19.3 },
  XK: { code: "XK", nome: "Kosovo", lat: 42.6, lng: 20.9 },
  SE: { code: "SE", nome: "Suécia", lat: 62.8, lng: 16.7 },
  NO: { code: "NO", nome: "Noruega", lat: 64.0, lng: 11.5 },
  FI: { code: "FI", nome: "Finlândia", lat: 64.5, lng: 26.3 },
  DK: { code: "DK", nome: "Dinamarca", lat: 56.0, lng: 9.5 },
  IS: { code: "IS", nome: "Islândia", lat: 64.9, lng: -18.6 },
  EE: { code: "EE", nome: "Estônia", lat: 58.7, lng: 25.5 },
  LV: { code: "LV", nome: "Letônia", lat: 56.9, lng: 24.9 },
  LT: { code: "LT", nome: "Lituânia", lat: 55.3, lng: 23.9 },
  BY: { code: "BY", nome: "Bielorrússia", lat: 53.7, lng: 28.0 },
  UA: { code: "UA", nome: "Ucrânia", lat: 49.0, lng: 31.5 },
  MD: { code: "MD", nome: "Moldávia", lat: 47.2, lng: 28.5 },
  RU: { code: "RU", nome: "Rússia", lat: 61.5, lng: 96.0 },
  TR: { code: "TR", nome: "Turquia", lat: 39.0, lng: 35.2 },
  CY: { code: "CY", nome: "Chipre", lat: 35.1, lng: 33.2 },
  MT: { code: "MT", nome: "Malta", lat: 35.9, lng: 14.4 },

  // ---------- África ----------
  ZA: { code: "ZA", nome: "África do Sul", lat: -29.0, lng: 24.7 },
  AO: { code: "AO", nome: "Angola", lat: -12.3, lng: 17.6 },
  MZ: { code: "MZ", nome: "Moçambique", lat: -18.3, lng: 35.5 },
  NG: { code: "NG", nome: "Nigéria", lat: 9.1, lng: 8.7 },
  EG: { code: "EG", nome: "Egito", lat: 26.8, lng: 30.8 },
  MA: { code: "MA", nome: "Marrocos", lat: 31.8, lng: -7.1 },
  DZ: { code: "DZ", nome: "Argélia", lat: 28.0, lng: 2.6 },
  TN: { code: "TN", nome: "Tunísia", lat: 34.0, lng: 9.6 },
  LY: { code: "LY", nome: "Líbia", lat: 26.3, lng: 17.2 },
  SD: { code: "SD", nome: "Sudão", lat: 15.6, lng: 30.2 },
  SS: { code: "SS", nome: "Sudão do Sul", lat: 7.3, lng: 30.3 },
  ET: { code: "ET", nome: "Etiópia", lat: 9.1, lng: 40.5 },
  KE: { code: "KE", nome: "Quênia", lat: 0.5, lng: 37.9 },
  TZ: { code: "TZ", nome: "Tanzânia", lat: -6.4, lng: 34.9 },
  UG: { code: "UG", nome: "Uganda", lat: 1.4, lng: 32.3 },
  RW: { code: "RW", nome: "Ruanda", lat: -1.9, lng: 29.9 },
  BI: { code: "BI", nome: "Burundi", lat: -3.4, lng: 29.9 },
  GH: { code: "GH", nome: "Gana", lat: 7.9, lng: -1.0 },
  CI: { code: "CI", nome: "Costa do Marfim", lat: 7.5, lng: -5.5 },
  SN: { code: "SN", nome: "Senegal", lat: 14.5, lng: -14.5 },
  ML: { code: "ML", nome: "Mali", lat: 17.6, lng: -4.0 },
  BF: { code: "BF", nome: "Burquina Faso", lat: 12.3, lng: -1.6 },
  NE: { code: "NE", nome: "Níger", lat: 17.6, lng: 8.1 },
  TD: { code: "TD", nome: "Chade", lat: 15.5, lng: 18.7 },
  CM: { code: "CM", nome: "Camarões", lat: 5.7, lng: 12.7 },
  CF: { code: "CF", nome: "República Centro-Africana", lat: 6.6, lng: 20.9 },
  CD: { code: "CD", nome: "República Democrática do Congo", lat: -2.9, lng: 23.7 },
  CG: { code: "CG", nome: "Congo", lat: -0.8, lng: 15.8 },
  GA: { code: "GA", nome: "Gabão", lat: -0.6, lng: 11.8 },
  GQ: { code: "GQ", nome: "Guiné Equatorial", lat: 1.6, lng: 10.5 },
  ZM: { code: "ZM", nome: "Zâmbia", lat: -13.1, lng: 27.9 },
  ZW: { code: "ZW", nome: "Zimbábue", lat: -19.0, lng: 29.9 },
  BW: { code: "BW", nome: "Botsuana", lat: -22.3, lng: 24.7 },
  NA: { code: "NA", nome: "Namíbia", lat: -22.0, lng: 17.2 },
  MW: { code: "MW", nome: "Malaui", lat: -13.3, lng: 34.3 },
  MG: { code: "MG", nome: "Madagascar", lat: -19.0, lng: 46.7 },
  MU: { code: "MU", nome: "Maurício", lat: -20.3, lng: 57.6 },
  CV: { code: "CV", nome: "Cabo Verde", lat: 16.0, lng: -24.0 },
  GW: { code: "GW", nome: "Guiné-Bissau", lat: 12.0, lng: -15.0 },
  GN: { code: "GN", nome: "Guiné", lat: 10.4, lng: -10.9 },
  SL: { code: "SL", nome: "Serra Leoa", lat: 8.5, lng: -11.8 },
  LR: { code: "LR", nome: "Libéria", lat: 6.4, lng: -9.4 },
  MR: { code: "MR", nome: "Mauritânia", lat: 20.3, lng: -10.9 },
  ST: { code: "ST", nome: "São Tomé e Príncipe", lat: 0.3, lng: 6.6 },
  BJ: { code: "BJ", nome: "Benin", lat: 9.3, lng: 2.3 },
  TG: { code: "TG", nome: "Togo", lat: 8.6, lng: 0.8 },
  SO: { code: "SO", nome: "Somália", lat: 5.2, lng: 46.2 },
  ER: { code: "ER", nome: "Eritreia", lat: 15.2, lng: 39.8 },
  DJ: { code: "DJ", nome: "Djibuti", lat: 11.8, lng: 42.6 },

  // ---------- Ásia e Oriente Médio ----------
  CN: { code: "CN", nome: "China", lat: 35.9, lng: 104.2 },
  IN: { code: "IN", nome: "Índia", lat: 21.0, lng: 78.9 },
  JP: { code: "JP", nome: "Japão", lat: 36.2, lng: 138.3 },
  KR: { code: "KR", nome: "Coreia do Sul", lat: 36.5, lng: 127.9 },
  KP: { code: "KP", nome: "Coreia do Norte", lat: 40.3, lng: 127.5 },
  TW: { code: "TW", nome: "Taiwan", lat: 23.7, lng: 121.0 },
  HK: { code: "HK", nome: "Hong Kong", lat: 22.3, lng: 114.2 },
  MO: { code: "MO", nome: "Macau", lat: 22.2, lng: 113.5 },
  ID: { code: "ID", nome: "Indonésia", lat: -2.5, lng: 118.0 },
  PH: { code: "PH", nome: "Filipinas", lat: 12.9, lng: 121.8 },
  VN: { code: "VN", nome: "Vietnã", lat: 16.0, lng: 106.0 },
  TH: { code: "TH", nome: "Tailândia", lat: 15.9, lng: 101.0 },
  MY: { code: "MY", nome: "Malásia", lat: 4.2, lng: 102.0 },
  SG: { code: "SG", nome: "Singapura", lat: 1.35, lng: 103.8 },
  BN: { code: "BN", nome: "Brunei", lat: 4.5, lng: 114.7 },
  MM: { code: "MM", nome: "Mianmar", lat: 21.9, lng: 96.0 },
  KH: { code: "KH", nome: "Camboja", lat: 12.6, lng: 105.0 },
  LA: { code: "LA", nome: "Laos", lat: 19.9, lng: 102.5 },
  BD: { code: "BD", nome: "Bangladesh", lat: 23.7, lng: 90.4 },
  PK: { code: "PK", nome: "Paquistão", lat: 30.4, lng: 69.3 },
  AF: { code: "AF", nome: "Afeganistão", lat: 33.9, lng: 67.7 },
  NP: { code: "NP", nome: "Nepal", lat: 28.4, lng: 84.1 },
  BT: { code: "BT", nome: "Butão", lat: 27.5, lng: 90.4 },
  LK: { code: "LK", nome: "Sri Lanka", lat: 7.9, lng: 80.8 },
  MV: { code: "MV", nome: "Maldivas", lat: 3.2, lng: 73.2 },
  IR: { code: "IR", nome: "Irã", lat: 32.4, lng: 53.7 },
  IQ: { code: "IQ", nome: "Iraque", lat: 33.2, lng: 43.7 },
  SA: { code: "SA", nome: "Arábia Saudita", lat: 23.9, lng: 45.1 },
  AE: { code: "AE", nome: "Emirados Árabes Unidos", lat: 23.4, lng: 53.8 },
  QA: { code: "QA", nome: "Catar", lat: 25.4, lng: 51.2 },
  BH: { code: "BH", nome: "Bahrein", lat: 26.0, lng: 50.5 },
  KW: { code: "KW", nome: "Kuwait", lat: 29.3, lng: 47.5 },
  OM: { code: "OM", nome: "Omã", lat: 21.5, lng: 55.9 },
  YE: { code: "YE", nome: "Iémen", lat: 15.6, lng: 48.5 },
  JO: { code: "JO", nome: "Jordânia", lat: 30.6, lng: 36.2 },
  LB: { code: "LB", nome: "Líbano", lat: 33.9, lng: 35.9 },
  SY: { code: "SY", nome: "Síria", lat: 34.8, lng: 39.0 },
  IL: { code: "IL", nome: "Israel", lat: 31.1, lng: 34.9 },
  PS: { code: "PS", nome: "Palestina", lat: 31.9, lng: 35.2 },
  GE: { code: "GE", nome: "Geórgia", lat: 42.3, lng: 43.4 },
  AM: { code: "AM", nome: "Armênia", lat: 40.1, lng: 45.0 },
  AZ: { code: "AZ", nome: "Azerbaijão", lat: 40.1, lng: 47.6 },
  KZ: { code: "KZ", nome: "Cazaquistão", lat: 48.0, lng: 66.9 },
  UZ: { code: "UZ", nome: "Uzbequistão", lat: 41.4, lng: 64.6 },
  TM: { code: "TM", nome: "Turcomenistão", lat: 39.0, lng: 59.6 },
  KG: { code: "KG", nome: "Quirguistão", lat: 41.2, lng: 74.8 },
  TJ: { code: "TJ", nome: "Tajiquistão", lat: 38.9, lng: 71.3 },
  MN: { code: "MN", nome: "Mongólia", lat: 46.9, lng: 103.8 },

  // ---------- Oceania ----------
  AU: { code: "AU", nome: "Austrália", lat: -25.3, lng: 133.8 },
  NZ: { code: "NZ", nome: "Nova Zelândia", lat: -41.0, lng: 174.0 },
  PG: { code: "PG", nome: "Papua-Nova Guiné", lat: -6.3, lng: 143.9 },
  FJ: { code: "FJ", nome: "Fiji", lat: -17.7, lng: 178.0 },
  NC: { code: "NC", nome: "Nova Caledônia", lat: -21.3, lng: 165.5 },
};

/**
 * Resolve o código ISO-2 vindo do banco (PageView.country / ActiveSession.country).
 * Tolera null, minúsculas e espaços porque o valor vem de header de CDN
 * (cf-ipcountry / x-vercel-ip-country) e não tem garantia de formato.
 *
 * Retorna null para códigos desconhecidos — inclui os pseudo-códigos que a
 * Cloudflare envia quando não consegue geolocalizar ("XX", "T1" para Tor).
 * O mapa deve simplesmente ignorar esses registros, não quebrar.
 */
export function coordDoPais(code: string | null | undefined): PaisCoord | null {
  if (!code) return null;
  const normalizado = code.trim().toUpperCase();
  if (normalizado.length !== 2) return null;
  return PAISES[normalizado] ?? null;
}

/**
 * Projeção equiretangular (plate carrée) — lat/lng para pixel dentro da caixa
 * do mapa, com origem no canto superior esquerdo.
 *
 * ATENÇÃO: o SVG do mapa-múndi PRECISA ter sido desenhado com ESTA MESMA
 * projeção e cobrir exatamente -180..180 de longitude e 90..-90 de latitude
 * (viewBox proporcional 2:1). Se o SVG for Mercator, Robinson, ou tiver
 * recorte/margem diferente, os pontos saem do lugar — o erro aparece primeiro
 * nas latitudes altas (Europa/Rússia), que no Mercator ficam bem mais ao norte.
 */
export function projetarEquiretangular(
  lat: number,
  lng: number,
  largura: number,
  altura: number,
): { x: number; y: number } {
  // Clamp defensivo: coordenada fora da faixa válida jogaria o ponto para fora
  // da caixa e o SVG renderizaria em cima de outros elementos.
  const latSegura = Math.max(-90, Math.min(90, lat));
  const lngSegura = Math.max(-180, Math.min(180, lng));

  return {
    x: ((lngSegura + 180) / 360) * largura,
    y: ((90 - latSegura) / 180) * altura,
  };
}
