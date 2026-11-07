import { describe, it, expect, vi } from 'vitest';
import React, { useState } from 'react';
import { renderToString } from 'react-dom/server';
import { CollapsibleSection } from './CollapsibleSection';

describe('CollapsibleSection', () => {
  it('renders open by default with toggle button and accessible attributes', () => {
    const html = renderToString(
      React.createElement(
        CollapsibleSection,
        {
          title: 'Tactical Map Legend',
          badge: React.createElement('span', { className: 'badge' }, '4 items'),
        },
        React.createElement('div', { className: 'legend-body' }, 'Legend Content')
      )
    );

    expect(html).toContain('Tactical Map Legend');
    expect(html).toContain('badge');
    expect(html).toContain('4 items');
    expect(html).toContain('Legend Content');
    expect(html).toContain('is-collapsible');
    expect(html).toContain('is-open');
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('sidebar-section-toggle-btn');
  });

  it('renders collapsed when defaultOpen is false', () => {
    const html = renderToString(
      React.createElement(
        CollapsibleSection,
        {
          title: 'Closed Section',
          defaultOpen: false,
        },
        React.createElement('div', { className: 'hidden-body' }, 'Hidden Content')
      )
    );

    expect(html).toContain('Closed Section');
    expect(html).toContain('is-collapsed');
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('Hidden Content');
  });

  it('renders static non-collapsible section when collapsible is false', () => {
    const html = renderToString(
      React.createElement(
        CollapsibleSection,
        {
          title: 'Actions & Camera',
          collapsible: false,
          badge: React.createElement('span', null, '105%'),
        },
        React.createElement('div', { className: 'actions-body' }, 'Action Controls')
      )
    );

    expect(html).toContain('Actions &amp; Camera');
    expect(html).toContain('105%');
    expect(html).toContain('Action Controls');
    expect(html).toContain('is-static');
    expect(html).not.toContain('sidebar-section-toggle-btn');
    expect(html).toContain('sidebar-section-static-header');
  });

  it('renders with custom icon and extra class names', () => {
    const html = renderToString(
      React.createElement(
        CollapsibleSection,
        {
          title: 'Admin Tools',
          icon: React.createElement('span', { className: 'admin-icon' }, '★'),
          className: 'admin-custom-class',
          collapsible: false,
        },
        React.createElement('p', null, 'Admin controls')
      )
    );

    expect(html).toContain('Admin Tools');
    expect(html).toContain('admin-icon');
    expect(html).toContain('admin-custom-class');
    expect(html).toContain('Admin controls');
  });
});
