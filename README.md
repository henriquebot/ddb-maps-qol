# DDB Maps QoL — v0.3.34

## Unreleased — teste via GitHub

Ainda sem bump de versão/release.

- Miniaturas de mapas: associação mais segura por ID/chave nativa, cache V3 e bloqueio de heurísticas que podiam usar imagem de outro item.
- Game Log: novo botão **−HP** ao lado do aplicador completo; aparece somente com exatamente 1 token selecionado e aplica o dano da própria rolagem com R/I/V individual e Temp HP primeiro.
- Chrome Web Store: política de privacidade, rascunho da listagem, checklist, empacotador PowerShell e validação automática no GitHub.
- Store compliance: removida a leitura do `parser.js` remoto; os dados externos usados pelo importador continuam sendo tratados como dados, não código executável.
- 5etools → Homebrew: o botão `DDB HB ↗` agora preserva a criatura atualmente renderizada pelo 5etools, inclusive alterações feitas pelo Scale CR, em vez de reimportar a ficha original.\n- Diagnóstico de estabilidade: registra abertura/fechamento/erro do socket do Maps e mede o custo do interceptador WebSocket sem guardar payloads, IDs de campanha, tokens ou dados de jogadores.


Pré-lançamento / release candidate.

## Ajustes desta versão

- Corrige miniaturas do Map Browser: o cache agora usa ID/chave nativa quando disponível e não tenta mais adivinhar a imagem a partir de elementos próximos do DOM.
- Invalida automaticamente o cache antigo de miniaturas (`ddbQolMapThumbCacheV1`).
- Quando não existe thumbnail nativa confiável, prefere deixar o mapa sem miniatura a mostrar uma imagem errada.
- Reduz o escopo dos content scripts: bridge apenas no Maps; importer apenas nas páginas necessárias do Homebrew; integração 5etools apenas no Bestiary suportado.
- Reduz host permissions redundantes e restringe o proxy de imagens aos repositórios conhecidos do importer.
- Endurece a ponte `window.postMessage` usando a origem atual e validação de `event.origin`.
- Popup agora mostra status da aba atual: Maps, Game Log, stickers e importer.
- Novo botão **Copiar diagnóstico**, sem expor ID da campanha/monstro na URL copiada.

## Limitação conhecida

O primeiro drop de stickers pode exigir uma calibração nativa após carregar o Maps: pressione **X** e faça **1 Ping** em qualquer ponto do mapa.

## Importer / Needs Review

O importer mantém o resumo detalhado dos campos que exigem revisão após a criação do Homebrew.

## Observação comercial

Esta versão mantém o importer 5etools completo. A política/estratégia de distribuição comercial desse recurso ainda deve ser definida antes da submissão final à Chrome Web Store.


## v0.3.32
- Quick HP HUD: ao selecionar exatamente 1 token no Maps, mostra HEAL / valor / DAMAGE acima do HUD nativo.
- O valor sugere automaticamente o último dano rolado, já considerando R/I/V quando o alvo pode ser identificado.
- HEAL/DAMAGE usam TOKEN_SET_HP_INFO, Temp HP primeiro e HP máximo na cura.
- Token Maker agora permite zoom-out até 25% e “Centralizar e ajustar” enquadra a arte inteira.

## Roadmap Free

- [Token Skin — trocar a imagem de um token apenas naquele mapa](docs/TOKEN_SKIN.md): override visual por instância do token, sem Homebrew, com restauração da arte original. Sincronização multiplayer será investigada separadamente.

## Roadmap Premium

- [Monster Scaler — arquitetura e roadmap](docs/MONSTER_SCALER_PREMIUM.md): extensão única com recursos Free locais e geração Premium autenticada no backend. Recurso planejado; ainda não implementado.
