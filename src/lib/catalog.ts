// Default category catalog copied to each new user by the database
// (see supabase/migrations/*_fundacao.sql). Kept here so tests can check
// that the SQL seed matches: 15 categories and 141 subcategories.
export type CategoryKind = "expense" | "income" | "mixed";

export const CATALOG: { key: string; name: string; kind: CategoryKind; subcategories: string[] }[] = [
  { key: "alimentacao", name: "Alimentação", kind: "expense", subcategories: ["Alimentos e bebidas", "Delivery de alimentos", "Restaurantes", "Bares e lanchonetes", "Supermercado", "Padarias e cafeterias", "Feiras e hortifrúti", "Açougues e peixarias", "Refeições no trabalho", "Outros gastos com alimentação"] },
  { key: "compras", name: "Compras", kind: "expense", subcategories: ["Compras gerais", "Artigos esportivos", "Artigos infantis", "Cashbacks", "Compras online", "Eletrônicos", "Livraria", "Papelaria", "Pet shops e veterinários", "Vestuário", "Calçados e acessórios", "Cosméticos e perfumaria", "Presentes", "Móveis e eletrodomésticos", "Outras compras"] },
  { key: "saude", name: "Saúde e bem-estar", kind: "expense", subcategories: ["Consultas médicas", "Exames e diagnósticos", "Medicamentos e farmácia", "Odontologia", "Terapia e psicologia", "Fisioterapia", "Academia e atividades físicas", "Cuidados pessoais e estética", "Óticas", "Outros gastos com saúde"] },
  { key: "digitais", name: "Serviços digitais", kind: "expense", subcategories: ["Software e aplicativos", "Ferramentas de IA", "Armazenamento em nuvem", "Domínios e hospedagem", "Streaming de vídeo", "Streaming de música", "Assinaturas de conteúdo", "Serviços profissionais online", "Outros serviços digitais"] },
  { key: "transporte", name: "Transporte", kind: "expense", subcategories: ["Táxi e transporte por aplicativo", "Ônibus e metrô", "Combustível", "Estacionamento", "Pedágios", "Manutenção de veículo", "Aluguel de veículo", "Passagens aéreas e rodoviárias", "Bicicletas e micromobilidade", "Outros gastos com transporte"] },
  { key: "moradia", name: "Moradia", kind: "expense", subcategories: ["Aluguel", "Condomínio", "Energia elétrica", "Água e esgoto", "Gás", "Internet residencial", "Celular e telefonia", "Reparos e manutenção", "Limpeza e serviços domésticos", "Jardinagem", "Outros gastos com moradia"] },
  { key: "lazer", name: "Lazer e entretenimento", kind: "expense", subcategories: ["Cinema e teatro", "Shows e festivais", "Passeios e atrações", "Viagens e hospedagem", "Clubes e eventos", "Hobbies", "Jogos e videogames sem aposta", "Esportes e lazer", "Outros gastos com lazer"] },
  { key: "financas", name: "Finanças", kind: "mixed", subcategories: ["Tarifas bancárias", "Juros e encargos", "Multas financeiras", "Serviços financeiros", "Transferências entre contas próprias", "Transferências para terceiros", "Aportes em investimentos", "Resgates de investimentos", "Empréstimos recebidos", "Amortização de empréstimos", "Pagamento de fatura", "Outras movimentações financeiras"] },
  { key: "renda", name: "Renda", kind: "income", subcategories: ["Salário", "Pró-labore", "Freelance e serviços", "Vendas", "Aluguéis recebidos", "Juros e rendimentos", "Dividendos", "Benefícios e auxílios", "Bonificações e comissões", "Presentes recebidos", "Outras receitas"] },
  { key: "educacao", name: "Educação", kind: "expense", subcategories: ["Escola", "Faculdade e pós-graduação", "Cursos e certificações", "Idiomas", "Aulas particulares", "Material didático", "Eventos e congressos", "Plataformas educacionais", "Outros gastos com educação"] },
  { key: "impostos", name: "Impostos e taxas", kind: "expense", subcategories: ["Imposto de renda", "DAS e MEI", "IPTU", "IPVA e licenciamento", "ISS e tributos de serviços", "Taxas de documentos", "Taxas públicas", "Outros impostos e taxas"] },
  { key: "seguros", name: "Seguros", kind: "expense", subcategories: ["Seguro de automóvel", "Seguro residencial", "Seguro de vida", "Plano e seguro de saúde", "Seguro odontológico", "Seguro de viagem", "Seguro de equipamentos", "Outros seguros"] },
  { key: "apostas", name: "Apostas e jogos", kind: "mixed", subcategories: ["Apostas esportivas", "Loterias", "Jogos de cassino", "Bolões", "Outras apostas", "Prêmios de apostas e jogos"] },
  { key: "doacoes", name: "Doações", kind: "expense", subcategories: ["Instituições e ONGs", "Doações religiosas", "Campanhas e vaquinhas", "Ajuda a pessoas", "Doações recorrentes", "Outras doações"] },
  { key: "outros", name: "Outros", kind: "mixed", subcategories: ["Serviços diversos", "Despesas diversas", "Receitas diversas", "Reembolsos recebidos", "Estornos de compras", "Ajustes de saldo", "Não categorizado"] },
];

export const KIND_LABEL: Record<CategoryKind, string> = { expense: "Despesa", income: "Receita", mixed: "Mista" };
