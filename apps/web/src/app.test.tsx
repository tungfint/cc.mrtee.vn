import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from './app';

describe('App', () => {
  it('renders the bootstrap experience', () => {
    render(<App />);

    expect(screen.getByText('Tiến bộ thật,')).toBeInTheDocument();
    expect(screen.getByText('Bootstrap environment ready')).toBeInTheDocument();
  });
});
