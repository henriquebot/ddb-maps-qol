# Política de Privacidade — DDB Maps QoL

Última atualização: 24 de setembro de 2026.

## Visão geral

DDB Maps QoL é uma extensão de navegador independente criada para adicionar ferramentas de qualidade de vida ao D&D Beyond Maps e a fluxos relacionados de preparação de jogo.

A extensão não possui servidor próprio, não exige conta adicional e não envia telemetria, analytics ou dados de uso ao desenvolvedor.

## Dados processados localmente

Para oferecer suas funções, a extensão pode processar no navegador:

- estado e elementos visíveis das páginas compatíveis do D&D Beyond;
- informações de tokens, HP e rolagens do Game Log necessárias para recursos de dano/cura;
- dados inseridos ou escolhidos pelo usuário para o importador de Homebrew e Token Maker;
- imagens escolhidas pelo usuário para stickers personalizados;
- configurações da extensão, caches técnicos e dados temporários necessários às funções habilitadas.

Esses dados são usados para executar as funcionalidades solicitadas pelo usuário.

## Armazenamento local

A extensão usa `chrome.storage.local` para guardar configurações e alguns dados locais, como caches, último dano detectado, metadados de miniaturas e stickers personalizados.

Esses dados permanecem no perfil local do navegador, salvo quando uma ação do usuário exige comunicação com um serviço externo para funcionar.

## D&D Beyond

Algumas funções precisam se comunicar com serviços oficiais do D&D Beyond usando a sessão já autenticada do usuário. Isso inclui, por exemplo, consultar dados necessários de personagens/monstros e enviar ações iniciadas pelo usuário ao Maps.

Tokens de autenticação usados nessas chamadas são utilizados de forma transitória e não são enviados ao desenvolvedor nem gravados pela extensão como telemetria.

## Fontes externas do importador

O importador pode consultar dados e imagens públicas hospedados em repositórios do ecossistema 5etools, homebrew e prerelease configurados no manifesto da extensão. O acesso ocorre apenas para fornecer as funções do importador e do Token Maker.

## Diagnóstico

O botão "Copiar diagnóstico" monta o texto localmente e só o envia para a área de transferência quando o usuário clica no botão. IDs sensíveis presentes nas URLs suportadas são ocultados no diagnóstico.

## Compartilhamento e venda de dados

O desenvolvedor não vende dados do usuário e não utiliza os dados processados pela extensão para publicidade, perfilamento ou finalidades alheias às funções da extensão.

## Exclusão

Os dados locais da extensão podem ser removidos pelo próprio usuário ao limpar os dados da extensão no navegador ou ao desinstalá-la.

## Terceiros

D&D Beyond e os repositórios externos acessados pela extensão possuem seus próprios termos e políticas. DDB Maps QoL não é afiliada, endossada ou patrocinada pela Wizards of the Coast, Hasbro ou D&D Beyond.

## Contato e suporte

Problemas e solicitações podem ser registrados no repositório oficial do projeto no GitHub:
https://github.com/henriquebot/ddb-maps-qol/issues
