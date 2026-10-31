// @vitest-environment jsdom
// Two ways a screen used to lose what was on it: a component throwing while
// drawing (a blank page) and the weekly review's Exit (typed answers gone).
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { CrashBoundary } from './CrashScreen';
import { WeeklyResetOverlay } from './widgets';

describe('a screen that fails to draw', () => {
  let broken = true;
  function Tile() {
    if (broken) throw new Error('tile title is not text');
    return <p>Plank</p>;
  }
  beforeEach(() => {
    broken = true;
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('shows the crash card with the cause, and recovers on Try again', () => {
    render(<CrashBoundary><Tile /></CrashBoundary>);
    expect(screen.getByRole('alert')).toHaveTextContent('This screen stopped working');
    expect(screen.getByText(/tile title is not text/)).toBeInTheDocument();
    broken = false;
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(screen.getByText('Plank')).toBeInTheDocument();
    cleanup();
  });

  it('round the whole app, says so and offers no other section', () => {
    render(<CrashBoundary whole><Tile /></CrashBoundary>);
    expect(screen.getByRole('alert')).toHaveTextContent('The app stopped working');
    expect(screen.queryByText(/pick another section/)).toBeNull();
    cleanup();
  });
});

describe('the weekly review', () => {
  const weekStart = new Date(2026, 9, 26);
  const open = (props = {}) => render(
    <WeeklyResetOverlay weekStart={weekStart} now={new Date(2026, 9, 30)} onClose={() => {}} onSave={() => {}} onGenerateBlocks={undefined} {...props} />,
  );
  const word = () => screen.getAllByPlaceholderText('Type here…')[0] as HTMLInputElement;

  beforeEach(() => { localStorage.clear(); cleanup(); });

  it('brings typed answers back after Exit, until they are saved', () => {
    open();
    expect(screen.queryByText('Picked up where you left off.')).toBeNull();
    fireEvent.change(word(), { target: { value: 'Focused' } });
    fireEvent.click(screen.getByText('Next Phase →'));
    cleanup(); // Exit, or iOS closing the app

    open();
    expect(screen.getByText('Picked up where you left off.')).toBeInTheDocument();
    expect(screen.getByText('II. WEEK AUDIT', { selector: '.reset-phase-label' })).toBeInTheDocument();
    fireEvent.click(screen.getByText('I. PULSE CHECK'));
    expect(word().value).toBe('Focused');
  });

  it('keeps one draft per week', () => {
    open();
    fireEvent.change(word(), { target: { value: 'Focused' } });
    cleanup();
    render(<WeeklyResetOverlay weekStart={new Date(2026, 10, 2)} now={new Date(2026, 10, 6)} onClose={() => {}} onSave={() => {}} onGenerateBlocks={undefined} />);
    expect(word().value).toBe('');
  });

  it('clears the answers on Start over, once confirmed', () => {
    open();
    fireEvent.change(word(), { target: { value: 'Focused' } });
    cleanup();
    open();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    fireEvent.click(screen.getByText('Start over'));
    expect(word().value).toBe('Focused');
    fireEvent.click(screen.getByText('Start over'));
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(word().value).toBe('');
    cleanup();
    open();
    expect(screen.queryByText('Picked up where you left off.')).toBeNull();
  });

  it('forgets the draft once the review is saved', () => {
    const onSave = vi.fn();
    open({ onSave });
    fireEvent.change(word(), { target: { value: 'Focused' } });
    // Walk to the last phase, where the review is saved.
    while (screen.queryByText('Next Phase →')) fireEvent.click(screen.getByText('Next Phase →'));
    fireEvent.click(screen.getByText('Save & Sync'));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ word: 'Focused' }));
    cleanup();
    open();
    expect(word().value).toBe('');
  });
});
