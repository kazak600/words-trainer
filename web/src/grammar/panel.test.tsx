import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { GrammarPanel } from './GrammarPanel';

const cases = (suffix: string) => ({
  nominative: `maiz${suffix}`,
  genitive: 'maizes',
  dative: 'maizei',
  accusative: 'maizi',
  instrumental: 'maizi',
  locative: 'maizē',
  vocative: 'maize',
});
const noun = {
  singular: cases('e'),
  plural: cases('es'),
};
const verb = {
  infinitive: 'lasīt',
  present: ['lasu', 'lasi', 'lasa', 'lasām', 'lasāt'],
  past: ['lasīju', 'lasīji', 'lasīja', 'lasījām', 'lasījāt'],
  future: ['lasīšu', 'lasīsi', 'lasīs', 'lasīsim', 'lasīsiet'],
};

describe('GrammarPanel', () => {
  it('shows the gender line and a case table for a noun', () => {
    render(
      <GrammarPanel
        lang="lv"
        pos="noun"
        grammar={{ gender: 'f', declension: 4 }}
        forms={noun}
      />,
    );

    expect(screen.getByText('feminine · 4th declension')).toBeInTheDocument();
    const table = screen.getByRole('table', { name: 'Cases' });
    const genitive = within(table).getByRole('row', { name: /genitive/i });
    expect(
      within(genitive)
        .getAllByRole('cell')
        .map((c) => c.textContent),
    ).toEqual(['maizes', 'maizes']);
    expect(
      within(table).getByRole('columnheader', { name: 'plural' }),
    ).toBeInTheDocument();
  });

  it('drops the plural column when the noun has no plural', () => {
    const dashes = Object.fromEntries(
      Object.keys(noun.plural).map((k) => [k, '-']),
    );
    render(
      <GrammarPanel
        lang="lv"
        pos="propn"
        grammar={{ gender: 'f', declension: 4 }}
        forms={{ singular: noun.singular, plural: dashes }}
      />,
    );

    expect(screen.getByText('feminine · 4th declension')).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'plural' })).toBeNull();
    expect(
      screen.getByRole('columnheader', { name: 'singular' }),
    ).toBeInTheDocument();
  });

  it('shows the persons of a verb in three tenses', () => {
    render(
      <GrammarPanel
        lang="lv"
        pos="verb"
        grammar={{ conjugation: 3 }}
        forms={verb}
      />,
    );

    expect(screen.getByText('lasīt')).toBeInTheDocument();
    const table = screen.getByRole('table', { name: 'Tenses' });
    const row = within(table).getByRole('row', { name: /viņš/ });
    expect(
      within(row)
        .getAllByRole('cell')
        .map((c) => c.textContent),
    ).toEqual(['lasa', 'lasīja', 'lasīs']);
    expect(
      within(table).getByRole('columnheader', { name: 'future' }),
    ).toBeInTheDocument();
  });

  it('renders nothing without forms, for other parts of speech or unknown languages', () => {
    const { container, rerender } = render(
      <GrammarPanel lang="lv" pos="adj" grammar={null} forms={null} />,
    );
    expect(container).toBeEmptyDOMElement();
    rerender(
      <GrammarPanel lang="lv" pos="noun" grammar={null} forms={undefined} />,
    );
    expect(container).toBeEmptyDOMElement();
    rerender(<GrammarPanel lang="en" pos="noun" grammar={null} forms={noun} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders no panel when the forms hold no table data', () => {
    const { container, rerender } = render(
      <GrammarPanel
        lang="lv"
        pos="noun"
        grammar={{ gender: 'm' }}
        forms={{}}
      />,
    );
    expect(container).toBeEmptyDOMElement();
    rerender(
      <GrammarPanel
        lang="lv"
        pos="verb"
        grammar={{ conjugation: 1 }}
        forms={{ infinitive: 'iet' }}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('can leave the grammar line out', () => {
    render(
      <GrammarPanel
        lang="lv"
        pos="noun"
        grammar={{ gender: 'f', declension: 4 }}
        forms={noun}
        showLine={false}
      />,
    );
    expect(screen.queryByText('feminine · 4th declension')).toBeNull();
    expect(screen.getByRole('table', { name: 'Cases' })).toBeInTheDocument();
  });

  it('is collapsed behind a Forms summary', () => {
    render(<GrammarPanel lang="lv" pos="noun" grammar={null} forms={noun} />);
    expect(screen.getByText('Forms').closest('details')).not.toHaveAttribute(
      'open',
    );
  });
});
