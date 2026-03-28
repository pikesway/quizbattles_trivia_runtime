import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';

type GameScreenSpacing = 'compact' | 'comfortable' | 'spacious';

const SPACING_CONFIG: Record<GameScreenSpacing, { spacerHeight: number; answerGap: string; answerPadding: string }> = {
  compact: { spacerHeight: 12, answerGap: 'space-y-1.5', answerPadding: 'p-2.5 sm:p-3' },
  comfortable: { spacerHeight: 24, answerGap: 'space-y-2 sm:space-y-3', answerPadding: 'p-3 sm:p-4' },
  spacious: { spacerHeight: 40, answerGap: 'space-y-4', answerPadding: 'p-4 sm:p-5' },
};

interface GameScreenLayoutProps {
  question: string;
  answers: string[];
  spacing?: GameScreenSpacing;
  showProgressBar?: boolean;
  questionNumber?: number;
  totalQuestions?: number;
  timeRemaining?: number;
}

function GameScreenLayout({
  question,
  answers,
  spacing = 'comfortable',
  showProgressBar = true,
  questionNumber = 1,
  totalQuestions = 5,
  timeRemaining = 15,
}: GameScreenLayoutProps) {
  const config = SPACING_CONFIG[spacing];

  return (
    <div className="flex-1 flex flex-col min-h-0" data-testid="game-screen">
      <div className="flex-shrink-0 mb-3" data-testid="hud-area">
        <div className="flex justify-between text-xs sm:text-sm mb-2">
          <span data-testid="question-counter">Question {questionNumber} of {totalQuestions}</span>
          <span data-testid="timer">{timeRemaining}s</span>
        </div>
        {showProgressBar && (
          <div className="w-full bg-gray-600 rounded-full h-1.5" data-testid="progress-bar">
            <div
              className="h-1.5 rounded-full transition-all"
              style={{ width: `${((questionNumber) / totalQuestions) * 100}%` }}
            />
          </div>
        )}
      </div>

      <div className="flex-1 flex flex-col justify-center min-h-0" data-testid="centered-container">
        <div className="flex flex-col flex-shrink-0" data-testid="content-block">
          <h2
            className="text-lg sm:text-xl font-medium text-center flex-shrink-0"
            data-testid="question-text"
          >
            {question}
          </h2>

          <div
            className="flex-shrink"
            style={{
              height: config.spacerHeight,
              minHeight: 8,
            }}
            data-testid="spacer"
          />

          <div className={`${config.answerGap} flex-shrink-0`} data-testid="answers-container">
            {answers.map((answer, index) => (
              <button
                key={index}
                className={`w-full ${config.answerPadding} rounded-lg text-center border-2`}
                data-testid={`answer-${index}`}
              >
                {answer}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

describe('GameScreenLayout', () => {
  const defaultProps = {
    question: 'What is the capital of France?',
    answers: ['Paris', 'London', 'Berlin', 'Madrid'],
  };

  describe('Layout Structure', () => {
    it('renders HUD area at the top', () => {
      const { getByTestId } = render(<GameScreenLayout {...defaultProps} />);
      const hudArea = getByTestId('hud-area');
      expect(hudArea).toHaveClass('flex-shrink-0');
    });

    it('renders centered container with justify-center', () => {
      const { getByTestId } = render(<GameScreenLayout {...defaultProps} />);
      const container = getByTestId('centered-container');
      expect(container).toHaveClass('flex-1', 'flex', 'flex-col', 'justify-center');
    });

    it('renders content block that does not grow', () => {
      const { getByTestId } = render(<GameScreenLayout {...defaultProps} />);
      const block = getByTestId('content-block');
      expect(block).toHaveClass('flex-shrink-0');
    });

    it('renders question, spacer, and answers in correct order', () => {
      const { getByTestId } = render(<GameScreenLayout {...defaultProps} />);

      const contentBlock = getByTestId('content-block');
      const children = contentBlock.children;

      expect(children[0]).toHaveAttribute('data-testid', 'question-text');
      expect(children[1]).toHaveAttribute('data-testid', 'spacer');
      expect(children[2]).toHaveAttribute('data-testid', 'answers-container');
    });
  });

  describe('HUD Elements', () => {
    it('renders progress bar in HUD area', () => {
      const { getByTestId } = render(<GameScreenLayout {...defaultProps} showProgressBar />);
      const progressBar = getByTestId('progress-bar');
      const hudArea = getByTestId('hud-area');
      expect(hudArea).toContainElement(progressBar);
    });

    it('renders timer in HUD area', () => {
      const { getByTestId } = render(<GameScreenLayout {...defaultProps} timeRemaining={10} />);
      const timer = getByTestId('timer');
      expect(timer).toHaveTextContent('10s');
      const hudArea = getByTestId('hud-area');
      expect(hudArea).toContainElement(timer);
    });

    it('renders question counter in HUD area', () => {
      const { getByTestId } = render(
        <GameScreenLayout {...defaultProps} questionNumber={3} totalQuestions={5} />
      );
      const counter = getByTestId('question-counter');
      expect(counter).toHaveTextContent('Question 3 of 5');
    });
  });

  describe('Spacing Presets', () => {
    it('compact spacing applies 12px spacer height', () => {
      const { getByTestId } = render(<GameScreenLayout {...defaultProps} spacing="compact" />);
      const spacer = getByTestId('spacer');
      expect(spacer).toHaveStyle({ height: '12px' });
    });

    it('comfortable spacing applies 24px spacer height', () => {
      const { getByTestId } = render(<GameScreenLayout {...defaultProps} spacing="comfortable" />);
      const spacer = getByTestId('spacer');
      expect(spacer).toHaveStyle({ height: '24px' });
    });

    it('spacious spacing applies 40px spacer height', () => {
      const { getByTestId } = render(<GameScreenLayout {...defaultProps} spacing="spacious" />);
      const spacer = getByTestId('spacer');
      expect(spacer).toHaveStyle({ height: '40px' });
    });

    it('compact < comfortable < spacious spacing values', () => {
      expect(SPACING_CONFIG.compact.spacerHeight).toBeLessThan(SPACING_CONFIG.comfortable.spacerHeight);
      expect(SPACING_CONFIG.comfortable.spacerHeight).toBeLessThan(SPACING_CONFIG.spacious.spacerHeight);
    });

    it('spacer has minimum height for overflow safety', () => {
      const { getByTestId } = render(<GameScreenLayout {...defaultProps} spacing="compact" />);
      const spacer = getByTestId('spacer');
      expect(spacer).toHaveStyle({ minHeight: '8px' });
    });

    it('spacer can shrink (flex-shrink class)', () => {
      const { getByTestId } = render(<GameScreenLayout {...defaultProps} />);
      const spacer = getByTestId('spacer');
      expect(spacer).toHaveClass('flex-shrink');
    });
  });

  describe('Answer Container', () => {
    it('compact spacing applies space-y-1.5 gap', () => {
      const { getByTestId } = render(<GameScreenLayout {...defaultProps} spacing="compact" />);
      const container = getByTestId('answers-container');
      expect(container).toHaveClass('space-y-1.5');
    });

    it('comfortable spacing applies space-y-2 gap', () => {
      const { getByTestId } = render(<GameScreenLayout {...defaultProps} spacing="comfortable" />);
      const container = getByTestId('answers-container');
      expect(container).toHaveClass('space-y-2');
    });

    it('spacious spacing applies space-y-4 gap', () => {
      const { getByTestId } = render(<GameScreenLayout {...defaultProps} spacing="spacious" />);
      const container = getByTestId('answers-container');
      expect(container).toHaveClass('space-y-4');
    });

    it('answers container does not allow shrinking', () => {
      const { getByTestId } = render(<GameScreenLayout {...defaultProps} />);
      const container = getByTestId('answers-container');
      expect(container).toHaveClass('flex-shrink-0');
    });
  });

  describe('Question Text', () => {
    it('question text does not allow shrinking', () => {
      const { getByTestId } = render(<GameScreenLayout {...defaultProps} />);
      const question = getByTestId('question-text');
      expect(question).toHaveClass('flex-shrink-0');
    });

    it('question text is centered', () => {
      const { getByTestId } = render(<GameScreenLayout {...defaultProps} />);
      const question = getByTestId('question-text');
      expect(question).toHaveClass('text-center');
    });
  });

  describe('Overflow Safety', () => {
    it('centered container has min-h-0 for overflow handling', () => {
      const { getByTestId } = render(<GameScreenLayout {...defaultProps} />);
      const container = getByTestId('centered-container');
      expect(container).toHaveClass('min-h-0');
    });

    it('game screen has min-h-0 for overflow handling', () => {
      const { getByTestId } = render(<GameScreenLayout {...defaultProps} />);
      const screen = getByTestId('game-screen');
      expect(screen).toHaveClass('min-h-0');
    });
  });
});
