# Chrome Web Store — rascunho de listagem (pt-BR)

## Nome

DDB Maps QoL

## Resumo curto

Melhorias para D&D Beyond Maps: HP/dano, busca de mapas, stickers, Token Maker e ferramentas de homebrew.

## Propósito único

Aprimorar o fluxo de jogo e preparação dentro do D&D Beyond Maps com atalhos e ferramentas de interface que operam sobre o conteúdo que o usuário já acessa.

## Descrição

DDB Maps QoL adiciona ferramentas práticas ao D&D Beyond Maps para reduzir cliques e agilizar a preparação e a condução de sessões.

Principais recursos:

- HUD rápido de HEAL/DAMAGE para exatamente um token selecionado;
- aplicação de dano com suporte a resistência, imunidade e vulnerabilidade;
- integração com o Game Log para aproveitar o dano rolado;
- busca, ordenação e miniaturas no seletor de mapas;
- stickers personalizados;
- importador 5etools → D&D Beyond Homebrew;
- Token Maker integrado ao fluxo de criação de monstros;
- atalhos e melhorias de interface no Maps.

A extensão trabalha no navegador do usuário e não possui serviço próprio de analytics ou telemetria.

DDB Maps QoL é um projeto independente e não é afiliado, patrocinado ou endossado pela Wizards of the Coast, Hasbro ou D&D Beyond.

## Justificativa das permissões

### storage

Usada para salvar preferências da extensão, caches técnicos e dados locais de recursos como stickers e último dano detectado.

### activeTab

Usada quando o usuário abre o popup para identificar a aba ativa e exibir o diagnóstico/status da página atual.

### Acesso a dndbeyond.com

Necessário para inserir as melhorias de interface nas páginas compatíveis do Maps e Homebrew e para consultar APIs do D&D Beyond exigidas por recursos como HP/dano.

### Acesso aos repositórios 5etools/homebrew/prerelease

Necessário para consultar arquivos JSON e imagens usados pelo importador e pelo Token Maker. A extensão não executa JavaScript remoto desses repositórios.

## Privacidade — notas para o dashboard

- Sem analytics/telemetria próprios.
- Sem venda de dados.
- Processamento de conteúdo da página ocorre localmente.
- Credenciais/tokens do D&D Beyond são usados apenas de forma transitória nas chamadas necessárias e não são enviados ao desenvolvedor.
- Ações solicitadas pelo usuário podem ser transmitidas ao D&D Beyond para produzir o efeito esperado no Maps/Homebrew.
- Política pública: https://github.com/henriquebot/ddb-maps-qol/blob/main/PRIVACY.md

## Suporte

https://github.com/henriquebot/ddb-maps-qol/issues
