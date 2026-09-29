import { Fragment } from 'react';

/**
 * Markdown mínimo, renderizado como elementos React.
 *
 * A alternativa comum seria marked mais DOMPurify e dangerouslySetInnerHTML.
 * Isso significa montar uma string de HTML a partir do texto de um modelo e
 * depois confiar num sanitizador para desarmá-la. Aqui o texto nunca vira
 * marcação: ele vira nós React, e o React já escapa tudo que é conteúdo. O
 * caminho de injeção deixa de existir em vez de ser filtrado, e a interface
 * fica sem duas dependências.
 *
 * Cobre o que a persona pede ao modelo: negrito, itálico, código em linha,
 * bloco de código, lista com marcador e lista numerada.
 */

const INLINE = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\n]+\*)/g;

function renderInline(text, keyPrefix) {
  const parts = String(text).split(INLINE).filter((piece) => piece !== '');

  return parts.map((piece, index) => {
    const key = `${keyPrefix}-${index}`;
    if (piece.startsWith('**') && piece.endsWith('**') && piece.length > 4) {
      return <strong key={key}>{piece.slice(2, -2)}</strong>;
    }
    if (piece.startsWith('`') && piece.endsWith('`') && piece.length > 2) {
      return <code className="md-code" key={key}>{piece.slice(1, -1)}</code>;
    }
    if (piece.startsWith('*') && piece.endsWith('*') && piece.length > 2) {
      return <em key={key}>{piece.slice(1, -1)}</em>;
    }
    return <Fragment key={key}>{piece}</Fragment>;
  });
}

export function Markdown({ text }) {
  if (!text) return null;

  const blocks = [];
  const lines = String(text).split('\n');

  let index = 0;
  let block = 0;

  while (index < lines.length) {
    const line = lines[index];

    // Bloco de código: tudo entre as cercas sai literal, sem interpretar nada.
    if (line.trimStart().startsWith('```')) {
      const language = line.trim().slice(3).trim();
      const body = [];
      index += 1;
      while (index < lines.length && !lines[index].trimStart().startsWith('```')) {
        body.push(lines[index]);
        index += 1;
      }
      index += 1;
      blocks.push(
        <pre className="md-pre" key={`b${block++}`} data-lang={language || undefined}>
          <code>{body.join('\n')}</code>
        </pre>,
      );
      continue;
    }

    // Lista com marcador.
    if (/^\s*[-*+]\s+/.test(line)) {
      const items = [];
      while (index < lines.length && /^\s*[-*+]\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^\s*[-*+]\s+/, ''));
        index += 1;
      }
      blocks.push(
        <ul className="md-list" key={`b${block++}`}>
          {items.map((item, i) => <li key={i}>{renderInline(item, `li${i}`)}</li>)}
        </ul>,
      );
      continue;
    }

    // Lista numerada.
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items = [];
      while (index < lines.length && /^\s*\d+[.)]\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^\s*\d+[.)]\s+/, ''));
        index += 1;
      }
      blocks.push(
        <ol className="md-list" key={`b${block++}`}>
          {items.map((item, i) => <li key={i}>{renderInline(item, `oi${i}`)}</li>)}
        </ol>,
      );
      continue;
    }

    // Parágrafo: junta linhas até a próxima linha em branco.
    if (line.trim() === '') {
      index += 1;
      continue;
    }

    const paragraph = [];
    while (
      index < lines.length
      && lines[index].trim() !== ''
      && !lines[index].trimStart().startsWith('```')
      && !/^\s*[-*+]\s+/.test(lines[index])
      && !/^\s*\d+[.)]\s+/.test(lines[index])
    ) {
      paragraph.push(lines[index]);
      index += 1;
    }

    blocks.push(
      <p className="md-p" key={`b${block++}`}>
        {paragraph.map((row, i) => (
          <Fragment key={i}>
            {i > 0 && <br />}
            {renderInline(row, `p${block}-${i}`)}
          </Fragment>
        ))}
      </p>,
    );
  }

  return <>{blocks}</>;
}
