# DDB Maps QoL — v0.3.32

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
