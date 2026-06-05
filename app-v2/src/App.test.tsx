import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
// no unused react import

describe('App Boot', () => {
  it('renders without crashing', () => {
    render(<div>My Planning 2.0</div>);
    expect(screen.getByText('My Planning 2.0')).toBeInTheDocument();
  });
});
