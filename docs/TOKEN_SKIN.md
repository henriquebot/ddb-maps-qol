# Token Skin — roadmap

Status: planejado; ainda não implementado.

## Objetivo

Permitir trocar a imagem de um token já colocado no D&D Beyond Maps sem criar ou editar Homebrew.

Fluxo previsto:

1. Selecionar exatamente um token no mapa.
2. Abrir **Token Skin** pela extensão.
3. Escolher uma imagem por upload, colagem ou saída do Token Maker.
4. Aplicar somente àquela instância do token naquele mapa.
5. Permitir **Restaurar imagem original**.

## Escopo

- Feature Free.
- Não altera o monstro original.
- Não cria Homebrew.
- Não altera outros tokens do mesmo monstro.
- A associação deve usar identificadores estáveis de mapa + token, nunca apenas nome.
- Persistência local deve sobreviver ao reload do Maps.

## Implementação inicial

A primeira versão pode funcionar como override visual local:

`mapId + tokenId -> imagem personalizada`

A extensão detecta/renderiza o token e substitui apenas a arte exibida para aquele token.

Armazenamento previsto:
- metadados pequenos em storage da extensão;
- imagens em IndexedDB ou mecanismo equivalente adequado para blobs maiores;
- opção de excluir skin individual e limpar todas as skins.

## Sincronização

Não assumir que a imagem pode ser persistida no backend do D&D Beyond Maps.

Investigar separadamente se existe uma ação nativa/socket suportada para atualizar a arte de uma instância de token. Só habilitar sincronização para jogadores se o comportamento for confirmado com segurança.

Até lá:
- mestre vê o override local;
- não prometer que outros clientes/jogadores verão a mesma skin.

## Segurança e limites

- aceitar somente formatos de imagem suportados;
- validar tamanho e dimensões;
- não executar SVG/HTML arbitrário;
- não enviar imagens para backend RPG Up sem necessidade;
- restaurar sempre a arte original sem recriar o token.

## Critérios de conclusão

- [ ] Detectar token selecionado e obter `mapId` + `tokenId` confiáveis.
- [ ] Aplicar override visual a um único token.
- [ ] Persistir após reload.
- [ ] Restaurar imagem original.
- [ ] Suportar upload, colagem e integração com Token Maker.
- [ ] Testar múltiplos tokens do mesmo monstro no mesmo mapa.
- [ ] Testar mapas diferentes com tokens de mesmo nome.
- [ ] Investigar sincronização nativa/multiplayer sem depender dela para o MVP.
