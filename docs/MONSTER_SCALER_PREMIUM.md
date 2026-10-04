# Monster Scaler Premium — arquitetura e roadmap

Status: planejado; nenhuma implementação Premium está incluída na extensão atual.
Decisões registradas em 03/10/2026 (America/Sao_Paulo).

## Produto

Manter uma única extensão, DDB Maps QoL, com módulos internos:
- Free: recursos locais de QoL existentes.
- Premium: Monster Scaler e futuras ferramentas avançadas.
- A interface identifica Monster Scaler como Premium e oferece login/desbloqueio.
- A geração exige autorização no servidor em cada chamada.

Preço, plano de assinatura ou licença, cotas, provedor de pagamento, provedor de identidade e hospedagem ainda serão definidos. Este documento não altera os recursos gratuitos nem inicia cobranças.

## Fluxo do jogador/mestre

1. Selecionar exatamente um token de monstro no DDB Maps.
2. Abrir Monster Scaler na extensão.
3. Confirmar monstro de origem, edição e CR atual.
4. Escolher novo CR, nome da variante e parâmetros.
5. Clicar em Gerar.
6. Ver a prévia com valores originais/novos e campos que exigem revisão.
7. Clicar em Adicionar ao Homebrew.
8. A extensão encaminha a variante ao fluxo de criação de Homebrew da conta DDB do usuário.

Criar uma variante; preservar o monstro original. Adicionar ao Homebrew não significa publicar na comunidade nem substituir o token no Maps. O comportamento de salvar/enviar o formulário nativo deve ser validado na integração.

Sem login ou Premium: mostrar apresentação e acesso ao desbloqueio. Sem ficha completa acessível: explicar quais dados faltam e impedir uma geração baseada apenas no nome/HP do token.

## Opções previstas

| Opção | Comportamento previsto |
| --- | --- |
| CR alvo | 0, 1/8, 1/4, 1/2 e 1–30; validar no servidor |
| HP | Ajustar, com perfil baixo/médio/alto |
| CA | Ajustar ou preservar |
| Ataques | Ajustar bônus de ataque |
| Dano | Ajustar fórmulas e médias; preservar tipos |
| CDs | Ajustar CDs de habilidades suportadas |
| Atributos | Opcional; recalcular campos dependentes de forma coerente |
| Iniciativa | Opcional; respeitar diferenças entre edições |
| Multiattack | Apenas padrões reconhecidos; revisão em casos complexos |

A interface final e os parâmetros dependem da calibração do algoritmo. CR alvo é uma estimativa de dificuldade, não garantia de equilíbrio para qualquer ficha.

## Divisão entre extensão e servidor

| Componente | Responsabilidade |
| --- | --- |
| Extensão | Seleção, leitura autorizada da ficha, formulário, prévia, conversão e criação no Homebrew |
| Service worker | Comunicação HTTPS com API própria e sessão RPG Up; validar remetente e mensagens |
| Autenticação | Identificar conta RPG Up, renovar/revogar sessão |
| Licenciamento | Consultar acesso vigente, expiração e limites no servidor |
| Backend Monster Scaler | Validar entrada, autorizar geração, aplicar algoritmo e devolver dados da variante |
| Cobrança | Atualizar direitos por eventos verificados do provedor escolhido |

Fluxo técnico: extensão → API autenticada → autorização Premium → cálculo no backend → JSON de resultado → prévia local → Homebrew.

O algoritmo de scaling e segredos ficam fora do ZIP da extensão e em repositório privado do backend. O cliente recebe resultados, não código remoto, fórmulas executáveis nem instruções para interpretar.

Uma flag local pode controlar a apresentação, mas nunca concede licença. Alterar a extensão pode revelar o botão; sem sessão válida e acesso vigente, a API recusa a geração. CORS, origem da extensão, minificação e chave embutida não substituem autorização.

Essa arquitetura protege o serviço de geração e mantém o algoritmo fora do pacote. Resultados já entregues podem ser copiados; usuários autorizados também podem tentar abusar da API. Aplicar limites por conta e proteção contra abuso. Não prometer proteção absoluta contra engenharia reversa.

## Autenticação e API proposta

Contrato preliminar, sujeito à implementação:
- Login hospedado na RPG Up, com fluxo apropriado para cliente público, sem segredo no navegador.
- Se OAuth/OIDC for adotado: Authorization Code + PKCE; validar state e callback.
- Tokens de curta duração; logout limpa sessão local e permite revogação no servidor.
- Não expor tokens RPG Up ao page-bridge.js, ao contexto MAIN ou a mensagens window.postMessage.
- GET /v1/me/entitlements: acesso vigente e capacidades; resposta serve à interface.
- POST /v1/monster-scaler/generate: autenticação e autorização verificadas novamente no servidor.

Entrada da geração:
- schemaVersion e requestId;
- edição e CR de origem;
- ficha normalizada (estatísticas e ações necessárias);
- CR alvo, nome e opções solicitadas.

Saída:
- schemaVersion e algorithmVersion;
- ficha transformada;
- lista de alterações;
- avisos e campos preservados/pendentes.

Validar tamanho, tipos, CRs e limites de opções. O servidor não deve confiar em premium=true, plano ou identidade enviados no corpo. Não buscar URLs arbitrárias fornecidas pelo cliente.

Erros previstos: 401 (sessão ausente/expirada), 403 (sem acesso), 422 (ficha/opções inválidas), 429 (limite excedido), 503 (serviço indisponível). Falhas Premium não devem interromper os recursos Free.

A identidade do requestId deve ser vinculada à conta e ao conteúdo da solicitação para evitar cobranças/cotas duplicadas em tentativas repetidas; garantir atomicidade na contabilização.

## Pontos de integração existentes

Inspeção do repositório na versão 0.3.32:
- content.js contém getDdbMonster(id), leitura da API de monstros e funções de HP/dano.
- A seleção precisa resolver ID e ficha do monstro com segurança; a disponibilidade de todos os campos ainda deve ser testada.
- fillMainMonsterForm(...) e resumePendingImport() fazem parte do importador existente.
- O importador utiliza ddbQolPendingMonsterImportV2 para continuar a criação na página de edição.
- service-worker.js já intermedeia consultas JSON e autenticação DDB para chamadas locais.
- manifest.json usa Manifest V3.
- tools/build-store.ps1 empacota uma lista explícita de arquivos de runtime.

A ficha DDB não é automaticamente equivalente ao formato de entrada do importador atual. Criar adaptadores DDB → modelo normalizado → formato esperado pelo importador; verificar ataques clicáveis, dano, ações e campos Needs Review.

Credenciais Cobalt, cookies e sessão do DDB permanecem no navegador. O backend RPG Up recebe somente os dados necessários ao cálculo, nunca credenciais DDB, IDs de campanha, nomes de jogadores ou imagens desnecessárias.

## Algoritmo e procedência

Implementar algoritmo próprio, versionado, com fontes de dados/regras documentadas e autorização adequada para seu uso. Não copiar código, presets, tabelas, textos ou assets do Boss Loot Monster Tools.

A licença consultada do projeto Boss Loot é CC BY-NC-SA 4.0; o próprio aviso exige permissão separada para uso comercial. Qualquer reaproveitamento deve aguardar autorização compatível.

Não assumir que todas as tabelas de livros de D&D estejam disponíveis no SRD ou liberadas para redistribuição. Registrar fonte e licença de cada material efetivamente utilizado.

Preservar identidade mecânica quando possível: tipos de dano, resistências, imunidades, mobilidade e efeitos particulares. Recursos como conjuração, ações lendárias, recargas, dano de área, cura e efeitos sem dano podem alterar bastante a dificuldade. Automatizar apenas o que estiver suportado e indicar revisão nos demais casos.

Evitar substituições indiscriminadas de números em texto. Alterar campos estruturados e padrões de ação reconhecidos, mantendo consistência entre dado, modificador, média, ataque e CD.

Referências:
- https://github.com/boss-loot/boss-loot-monster-tools
- https://github.com/boss-loot/boss-loot-monster-tools/blob/main/LICENSE

## Publicação e privacidade

Manifest V3 admite operações de servidor sobre dados; o resultado deve ser tratado como dados. Todo código executado pelo navegador deve estar no pacote. A documentação e a submissão devem permitir entender o fluxo completo; fornecer acesso de revisão ao Premium quando necessário.

Antes de lançar Premium:
- atualizar PRIVACY.md, listagem e declarações da loja para login e processamento remoto;
- explicar dados transmitidos, finalidade, retenção e exclusão;
- evitar registrar fichas completas, tokens e credenciais em logs;
- definir prazo de retenção para resultados/solicitações;
- adicionar apenas permissões necessárias ao domínio de API e ao login;
- manter recursos Free operacionais quando o backend estiver indisponível.

Referências oficiais:
- https://developer.chrome.com/docs/webstore/program-policies/mv3-requirements
- https://developer.chrome.com/docs/extensions/develop/migrate/remote-hosted-code

## Repositórios e distribuição

Recomendação: código de desenvolvimento privado; backend Premium privado desde o início; distribuição pública pela Chrome Web Store.

Antes de tornar este repositório privado:
1. Publicar política de privacidade e canal de suporte em páginas públicas da RPG Up.
2. Atualizar links em PRIVACY.md e store/LISTING_PT-BR.md e, se cadastrados, no painel da loja.
3. Garantir acesso do GitHub conectado e dos colaboradores necessários.
4. Fornecer outro canal público para qualquer ZIP/release usado por testadores.

Os links atuais de política e suporte apontam para este repositório. Fechá-lo os tornará inacessíveis ao público. Cópias anteriores não são recolhidas e forks públicos existentes permanecem públicos.

O código distribuído no ZIP continua inspecionável. Privacidade do Git limita acesso ao desenvolvimento e ao histórico; a proteção do serviço Premium vem da autorização e execução no backend.

Referência:
- https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/managing-repository-settings/setting-repository-visibility

## Roadmap e critérios de conclusão

- [ ] 1. Validar seleção e extração de ficha em monstros DDB acessíveis e Homebrew, nas edições suportadas; sem correspondência baseada apenas no nome.
- [ ] 2. Definir modelo normalizado, adaptadores e exemplos com CR fracionário, ataques, CDs e dados de dano.
- [ ] 3. Implementar motor próprio no backend e calibrar em fichas representativas; sinalizar casos sem suporte.
- [ ] 4. Definir login, cobrança e licença; comprovar recusa sem sessão, sem Premium, após expiração/revogação e com flags adulteradas.
- [ ] 5. Implementar interface Monster Scaler Premium, prévia, avisos, timeout e tratamento de falhas.
- [ ] 6. Integrar variante ao Homebrew; verificar preservação do original, prevenção de duplicações e relatório Needs Review.
- [ ] 7. Executar beta com geração ponta a ponta, segurança de credenciais, quotas e regressão dos recursos Free.
- [ ] 8. Atualizar privacidade, suporte, listagem e pacote; submeter à Chrome Web Store.

Este commit registra arquitetura e roadmap. Não implementa login, cobrança, cálculo ou interface Monster Scaler.
