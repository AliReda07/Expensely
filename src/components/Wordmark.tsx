import type { ElementType } from 'react';

/**
 * The "Expensely" brand mark, with the leading E swapped for € -- close enough
 * in shape to read as a stylized E while doubling as a currency pun. The euro
 * glyph is visual only; screen readers still get the real word via aria-label.
 */
export function Wordmark({
  as: Tag = 'span',
  className,
}: {
  as?: ElementType;
  className?: string;
}) {
  return (
    <Tag aria-label="Expensely" className={className}>
      <span aria-hidden="true">€xpensely</span>
    </Tag>
  );
}
