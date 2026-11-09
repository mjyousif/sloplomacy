import React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ALL_POWERS } from '../types/diplomacy';
import { PowerFlag } from './PowerFlag';

describe('PowerFlag', () => {
  it('renders an SVG with appropriate attributes for each Great Power', () => {
    for (const power of ALL_POWERS) {
      const html = renderToString(React.createElement(PowerFlag, { power }));
      expect(html).toContain('<svg');
      expect(html).toContain(`data-testid="power-flag-${power.toLowerCase()}"`);
      expect(html).toContain('role="img"');
      expect(html).toContain(`Flag of`);
    }
  });

  it('renders historical elements for Austria-Hungary', () => {
    const html = renderToString(
      React.createElement(PowerFlag, { power: 'AUSTRIA' }),
    );
    // Austrian red and Hungarian green bottom stripes
    expect(html).toContain('#C8102E');
    expect(html).toContain('#008C45');
  });

  it('renders saltire and cross for England (Union Flag)', () => {
    const html = renderToString(
      React.createElement(PowerFlag, { power: 'ENGLAND' }),
    );
    expect(html).toContain('#012169');
    expect(html).toContain('rotate(180 30 20)');
  });

  it('renders French Tricolour', () => {
    const html = renderToString(
      React.createElement(PowerFlag, { power: 'FRANCE' }),
    );
    expect(html).toContain('#002654');
    expect(html).toContain('#ED2939');
  });

  it('renders German Empire Imperial tricolour (Black-White-Red)', () => {
    const html = renderToString(
      React.createElement(PowerFlag, { power: 'GERMANY' }),
    );
    expect(html).toContain('#181818');
    expect(html).toContain('#FFFFFF');
    expect(html).toContain('#BA1020');
  });

  it('renders Italian Savoy arms with blue border and crown', () => {
    const html = renderToString(
      React.createElement(PowerFlag, { power: 'ITALY' }),
    );
    expect(html).toContain('#008C45');
    expect(html).toContain('#002B7F');
  });

  it('renders Russian Imperial yellow eagle canton', () => {
    const html = renderToString(
      React.createElement(PowerFlag, { power: 'RUSSIA' }),
    );
    expect(html).toContain('#FDB813');
  });

  it('renders Ottoman crescent and star', () => {
    const html = renderToString(
      React.createElement(PowerFlag, { power: 'TURKEY' }),
    );
    expect(html).toContain('#BA1020');
    expect(html).toContain('<polygon');
  });

  it('honors custom width, height, and className', () => {
    const html = renderToString(
      React.createElement(PowerFlag, {
        power: 'FRANCE',
        width: 48,
        height: 32,
        className: 'custom-flag-class',
      }),
    );
    expect(html).toContain('width="48"');
    expect(html).toContain('height="32"');
    expect(html).toContain('custom-flag-class');
  });
});
