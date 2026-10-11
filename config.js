// Etapa 3 vai preencher SUPABASE_URL e SUPABASE_ANON_KEY (chaves públicas). NUNCA coloque aqui a chave "service_role".
window.CONFIG = {
  SUPABASE_URL: "https://tqjnxhhmbfyaoccbkcbn.supabase.co",        // ex.: https://abcdefgh.supabase.co
  SUPABASE_ANON_KEY: "sb_publishable_V8SvNmUWEdxF42xRZT8H-g_MNFt123w",   // chave anon / publishable
  NOME_BARRACA: "Barraca do Prando",
  LOCAL_NOME: "",          // ex.: "Feira da Praça Central, banca 12" (aparece na tela final e no comprovante)
  LOCAL_MAPS_URL: "",      // link do Google Maps da barraca (começa com https://)
  TELEFONE_BARRACA: "27999870210",    // telefone da barraca com DDD, ex.: "27999998888" (aparece na mensagem de agradecimento)
  FEIRA_DIA: 6,            // dia da feira: 0=domingo ... 6=sábado
  FEIRA_FIM_HORA: 12,      // depois dessa hora, "hoje" deixa de ser opção de retirada
  TELEFONE_OBRIGATORIO: false
};
