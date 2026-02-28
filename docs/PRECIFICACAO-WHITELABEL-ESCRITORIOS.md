# Precificação whitelabel — AI Drive Jurídico / Revisor de Defesas

Documento de apoio à **comercialização em modo whitelabel** para escritórios de advocacia: como precificar o acesso ao projeto (marca do escritório, uso interno ou para clientes).

**Público:** decisores comerciais e técnicos que vão licenciar o produto a escritórios.  
**Versão:** 1.0 | **Data:** 2025-02

---

## 1. O que se está a vender

- **Produto:** Plataforma de **auditoria jurídica assistida por IA** (Revisor de Defesas Trabalhistas), com chat em streaming, base de conhecimento (@bancodetese), geração de 3 DOCX operacionais (Avaliação da defesa, Roteiro Advogado, Roteiro Preposto).
- **Modo whitelabel:** O escritório usa o sistema com **sua própria marca** (nome, logo, domínio opcional), sem referência à sua empresa nas interfaces. Dados e utilizadores pertencem ao escritório; a infraestrutura pode ser dedicada (deploy isolado) ou multi-inquilino (conforme roadmap Fase 4 da SPEC).

**Não está incluído no escopo desta precificação:** revenda como SaaS com a sua marca para vários escritórios (isso seria um modelo B2B2B; a lógica de preço é outra).

---

## 2. Proposta de valor para o escritório

| Benefício | Descrição |
|-----------|-----------|
| **Tempo** | Menos horas a reler PI e Contestação; roteiros de audiência e parecer executivo gerados de forma estruturada. |
| **Consistência** | Padronização da qualidade da revisão; checklist antes de audiência; reutilização de teses e precedentes. |
| **Risco** | Redução de lapsos (prescrição bienal/quinquenal, pedidos não impugnados sinalizados). |
| **Escalabilidade** | Revisão escalável sem aumentar sócios/coordenadores na mesma proporção. |
| **Sigilo e conformidade** | Dados não usados para treino; isolamento por utilizador; stack alinhada a LGPD e dever de sigilo (OAB). |

O valor económico para um escritório médio/grande em contencioso trabalhista pode ser traduzido em: **horas de advogado sénior poupadas por processo** (revisão + preparação de roteiros) e **redução de risco de prescrição ou pedido não impugnado**.

---

## 3. Modelos de precificação possíveis

### 3.1 Licença anual (flat) por escritório

- **Descrição:** Valor fixo anual pelo direito de uso da plataforma em modo whitelabel (marca do escritório, utilizadores internos).
- **Vantagens:** Previsibilidade para o escritório e para o licenciador; simples de contratar.
- **Desvantagens:** Não escala com o uso; escritórios muito pequenos podem achar caro; muito grandes podem achar barato.

### 3.2 Por utilizador ativo (por ano ou por mês)

- **Descrição:** Preço por “seat” (utilizador que acede ao chat/revisor).
- **Vantagens:** Alinha preço ao tamanho da equipa; fácil de explicar.
- **Desvantagens:** Exige controle de utilizadores ativos (já existe `userId` e auth; falta apenas contabilizar “seats” por escritório em multi-tenant).

### 3.3 Por volume de uso (revisões / processos)

- **Descrição:** Preço por “revisão concluída” (fluxo até ENTREGA dos 3 DOCX) ou por processo auditado.
- **Vantagens:** Muito justo: quem usa mais paga mais; atrativo para quem ainda está a testar.
- **Desvantagens:** Exige métricas no backend (ex.: contagem de conversas que chegaram à ENTREGA); pode desincentivar uso intensivo se o preço por unidade for alto.

### 3.4 Híbrido (recomendado para whitelabel)

- **Licença base anual** (inclui X utilizadores ou Y revisões/mês).
- **Excedentes:** utilizadores adicionais ou revisões acima do pacote a preço unitário (mensal ou anual).

Isso equilibra receita garantida e crescimento com o uso.

---

## 4. Faixas de valor de referência (Brasil, 2025)

Os números abaixo são **orientativos** e devem ser ajustados ao seu mercado, custos (infra, LLM, suporte) e posicionamento (premium vs. volume).

### 4.1 Benchmarks do sector

- **Software jurídico B2B (gestão processual, pesquisa):** assinaturas anuais por escritório entre **R$ 3.000** (pequeno) e **R$ 30.000+** (médio/grande), por ano.
- **Ferramentas de produtividade com IA (genéricas):** **R$ 50–200 /utilizador/mês** em planos empresariais.
- **Consultoria jurídica + IA (projetos sob medida):** projetos de **R$ 50.000 a R$ 200.000+** para desenho e implementação; licenças de uso contínuo à parte.

O Revisor de Defesas é um **produto de nicho** (contencioso trabalhista, workflow definido, 3 entregas estruturadas), com **alto valor percebido** para quem faz muitas audiências trabalhistas.

### 4.2 Sugestão de faixas por modelo

| Modelo | Escritório pequeno (2–5 advogados) | Escritório médio (6–15) | Escritório grande (16+) |
|--------|------------------------------------|--------------------------|--------------------------|
| **Licença anual flat (whitelabel)** | R$ 12.000 – R$ 18.000/ano | R$ 24.000 – R$ 42.000/ano | R$ 48.000 – R$ 90.000/ano |
| **Por utilizador/ano** | R$ 2.400 – R$ 4.000/usuário/ano | Idem, com desconto volume (ex.: ≥5 usuários −15%) | Idem, ≥10 usuários −20%) |
| **Por revisão (ENTREGA)** | — | R$ 80 – R$ 150 por revisão concluída (em pacotes, ex.: 50 revisões/mês) | Idem, com preço menor acima de certo volume |

**Nota:** Valores em reais (BRL). Para mercados em EUR/USD, usar conversão e ajustar ao poder de compra local (ex.: Portugal, Europa).

### 4.3 Pacote whitelabel “completo”

O que pode ser incluído no preço para justificar um patamar **premium**:

- **Deploy dedicado** (instância só para o escritório, ex.: Vercel + Postgres + Storage isolados).
- **Domínio e marca:** URL sob domínio do escritório (ex.: `revisor.escritorio.com.br`), logo e cores.
- **Suporte:** X horas de suporte técnico/onboarding por ano; canal prioritário (e-mail ou Slack).
- **SLA:** disponibilidade garantida (ex.: 99% uptime); não incluir em contratos iniciais se a infra ainda não estiver monitorizada para isso.
- **Atualizações:** inclusão de novas funcionalidades (ex.: RAG, segundo agente) durante o período da licença.
- **Custos de IA (LLM):** pode ser “incluído” até um limite de tokens/mês ou faturado à parte (recomendável deixar explícito: ex.: “até 50 revisões/mês incluídas; excedente conforme uso”).

Definir 2–3 **níveis** (ex.: Essential / Professional / Enterprise) facilita a venda e a comparação.

---

## 5. Custos a considerar do seu lado

Para definir o **preço mínimo** e a margem:

- **Infraestrutura:** Vercel (Pro/Team), Postgres (Neon/Supabase), Storage (Blob ou Supabase), domínio.
- **LLM:** Custo por revisão (tokens input/output); ver `docs/OTIMIZACAO-CUSTO-TOKENS-LLM.md`. Uma revisão completa (FASE A + FASE B) pode consumir dezenas de milhares a centenas de milhares de tokens; estimar por modelo (ex.: Claude, GPT, Gemini).
- **Suporte e onboarding:** Tempo da equipa (comercial, suporte, dev para customizações mínimas de marca).
- **Manutenção e evolução:** Correções, segurança, novas features (Fase 1–4 do roadmap). Pode ser coberto pela licença anual ou por um % sobre a licença.

Garanta que **licença anual + excedentes (se houver)** cubram estes custos e deixem margem (ex.: 40–60% de margem bruta antes de vendas e gerais).

---

## 6. Recomendações práticas

1. **Começar por 1–2 pilotos** com escritórios de confiança: preço especial em troca de feedback e caso de estudo. Use isso para afinar preço e discurso de vendas.
2. **Contrato claro:** uso interno whitelabel; proibição de revenda ou sublicenciar; responsabilidade sobre dados (LGPD); quem paga custos de API LLM se não estiver incluído.
3. **Métricas no produto:** instrumentar “revisões concluídas” (ENTREGA) e, se multi-tenant, “utilizadores ativos por escritório”, para suportar modelos por uso ou por seat.
4. **Posicionamento:** enfatizar **especialização** (contencioso trabalhista, fluxo definido, 3 DOCX operacionais) e **conformidade** (sigilo, sem treino em dados do cliente), não “chatbot genérico”.
5. **Roadmap:** Fase 4 (multi-inquilino, RBAC por escritório) é o que permite escalar oferta whitelabel para vários escritórios com um único produto; até lá, deploy dedicado por cliente é a opção mais simples.

---

## 7. Resumo: valor sugerido para comercializar

| Cenário | Faixa anual sugerida (BRL) | Notas |
|---------|----------------------------|--------|
| **Escritório pequeno (whitelabel, 2–5 usuários)** | R$ 14.000 – R$ 20.000 | Licença flat; inclui suporte básico e atualizações. |
| **Escritório médio (6–15 usuários)** | R$ 28.000 – R$ 45.000 | Incluir onboarding e limite de revisões ou LLM; excedente combinado. |
| **Escritório grande (16+ usuários) ou deploy dedicado** | R$ 55.000 – R$ 95.000 | Deploy dedicado, SLA e suporte prioritário; custos de LLM podem ser repassados ou limitados. |

**Valor comercial a comunicar:** não é “um chat com IA”, é **“auditoria jurídica assistida por IA”** que poupa horas de revisão, reduz risco de prescrição e pedidos não impugnados, e entrega 3 documentos prontos para preparar audiência — com a marca e o controle do escritório.

---

*Este documento é referência comercial e de planeamento; não substitui aconselhamento jurídico ou fiscal. Ajuste os valores ao seu mercado, custos e estratégia.*
