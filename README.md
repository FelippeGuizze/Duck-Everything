# Duck Everything

Extensão para Firefox e Chrome que impede sites de bloquear cópia, colagem, botão direito, seleção, atalhos, tela cheia e mais. O código da extensão fica na pasta [`extension/`](extension/).

## Instalar no Firefox

Precisa do Firefox 142 ou mais novo.

**Para testar (temporário, some ao fechar o Firefox)**

1. Abra `about:debugging#/runtime/this-firefox`.
2. Clique em **Carregar extensão temporária…**.
3. Escolha o arquivo `extension/manifest.json`.

**Para uso permanente (arquivo `.xpi`)**

O Firefox só instala `.xpi` assinado.

1. Crie o zip com o **conteúdo** da pasta `extension/` (o `manifest.json` tem que ficar na raiz do zip, não dentro de uma pasta) e renomeie para `.xpi`.
2. Envie em <https://addons.mozilla.org/developers/> escolhendo distribuição própria, **não listada** ("On your own" / unlisted). Baixe o `.xpi` assinado.
3. No Firefox, abra `about:addons`, clique na engrenagem ⚙ e em **Instalar extensão a partir de arquivo…**, e escolha o `.xpi`.

## Instalar no Chrome

1. Abra `chrome://extensions` e ligue o **Modo do desenvolvedor**.
2. Clique em **Carregar sem compactação** e escolha a pasta `extension/`.
3. Depois de editar o código, clique no botão de recarregar do card da extensão.

## Se não bloquear nada

- **Recarregue a aba (F5).** A extensão só age em páginas abertas depois de instalar ou salvar. O rodapé do popup mostra `● ativa nesta aba` ou `● recarregue a aba`.
- **Chrome:** em `chrome://extensions` → **Detalhes** → **Acesso ao site**, deixe **Em todos os sites**. Para testar arquivos locais (`file://`), ligue também **Permitir acesso a URLs de arquivo**.
- Páginas como `chrome://`, `about:` e as lojas de extensões não aceitam extensões.
- Se ainda assim falhar, abra `chrome://extensions`, clique em **service worker** no card da extensão e mande o que aparecer no console.

## Laboratório de testes

Abra `iniciar-windows.bat` (ou rode `python serve.py`) e acesse <http://127.0.0.1:8765>. Cada cartão testa uma opção do popup e diz o que esperar.

## Testes automáticos

```
node tests/unit.cjs     # lógica, com mocks
node tests/chrome.cjs   # Chrome real; usa o Chrome instalado ou CHROME_PATH
```
