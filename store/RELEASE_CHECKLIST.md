# Checklist — Chrome Web Store

## Antes do envio

- [ ] Testar a extensão carregada sem compactação em uma cópia limpa do Chrome.
- [ ] Confirmar que o Manifest V3 não executa código JavaScript remoto.
- [ ] Conferir que todas as permissões do `manifest.json` são necessárias e justificadas.
- [ ] Rodar a validação automática do GitHub sem erros.
- [ ] Testar Maps, Game Log, HP, importer, Token Maker, busca de mapas e stickers.
- [ ] Confirmar que o diagnóstico não expõe IDs privados.
- [ ] Conferir ícones 16, 32, 48 e 128.
- [ ] Preparar screenshots e imagens promocionais exigidas pelo dashboard.
- [ ] Revisar `PRIVACY.md`.
- [ ] Revisar `store/LISTING_PT-BR.md`.
- [ ] Confirmar estratégia/licenciamento do recurso de importação antes da publicação comercial.
- [ ] Ativar/verificar autenticação em duas etapas na conta do publisher.

## Versão

**Não alterar automaticamente.** O número no `manifest.json` só deve ser incrementado após aprovação explícita do mantenedor para uma nova build/release.

Ao aprovar uma versão:

1. atualizar `manifest.json`;
2. atualizar README/changelog;
3. rodar `tools/build-store.ps1`;
4. validar o ZIP gerado;
5. subir primeiro como teste limitado quando apropriado;
6. somente depois promover a publicação desejada.

## Dashboard

Preencher antes de publicar:

- Store listing;
- Privacy practices;
- política de privacidade pública;
- finalidade única;
- justificativa de permissões;
- categoria;
- idioma;
- screenshots;
- informações de suporte.

## Pós-envio

- [ ] Guardar o ZIP exato enviado.
- [ ] Registrar o commit correspondente.
- [ ] Acompanhar eventuais observações da revisão.
- [ ] Não corrigir diretamente a build enviada sem criar uma nova versão.
